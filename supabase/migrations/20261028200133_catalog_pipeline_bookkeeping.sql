-- P2.1 Catalog schema, domain 1: pipeline bookkeeping (DATA_MODEL §3.1, §1.3, §5; D-010, D-031).
-- Shared helpers for later domains: pg_trgm, unaccent, normalize_match_text(), the slug domain.
-- Pipeline jobs write with the service role (bypasses RLS). Clients get explicit grants, then RLS.

-- Extensions ----------------------------------------------------------------

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Shared helpers ------------------------------------------------------------

-- Matching key for names: no accents, lower case, single spaces, trimmed. Immutable (the dictionary is
-- named explicitly), so trigram expression indexes can use it: gin (normalize_match_text(name) gin_trgm_ops).
create function public.normalize_match_text(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, value)), '\s+', ' ', 'g'));
$$;

comment on function public.normalize_match_text(text) is
  'Lower-case, accent-free, space-collapsed text for matching and trigram indexes (DATA_MODEL §3.2, §3.3).';

-- Stable, human-readable keys for companies, brands, categories, banners and sources (DATA_MODEL §1.3).
create domain public.slug as text
  check (value ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(value) <= 64);

comment on domain public.slug is 'Lower-case a-z0-9 words joined by single hyphens, at most 64 characters (DATA_MODEL §1.3).';

-- sources -------------------------------------------------------------------

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  key public.slug not null unique,
  sources_md_id text check (sources_md_id ~ '^S[0-9]+$'),
  name text not null check (char_length(name) between 1 and 200),
  homepage_url text check (homepage_url ~ '^https?://'),
  licence text,
  licence_url text check (licence_url ~ '^https?://'),
  attribution_text text,
  access_method text not null
    check (access_method in ('bulk_dump', 'api', 'rss', 'scrape', 'manual', 'internal')),
  terms_url text check (terms_url ~ '^https?://'),
  terms_checked_at date,
  verdict text not null check (verdict in ('use', 'manual_only', 'avoid')),
  url_template text check (url_template like '%{external_id}%'),
  rate_limit_per_sec numeric(5, 2) not null default 1 check (rate_limit_per_sec > 0 and rate_limit_per_sec <= 1),
  refresh_interval interval,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_avoid_disabled check (verdict <> 'avoid' or not enabled)
);

comment on table public.sources is
  'One row per SOURCES.md source plus internal sources. Public read (D-031): never store secrets or private notes here.';
comment on column public.sources.verdict is 'use | manual_only | avoid. Pipeline jobs refuse anything but use + enabled (P2.15).';
comment on column public.sources.url_template is 'Rebuilds a fact''s source_url from its external_id when source_url is null (DATA_MODEL §1.2).';

create trigger sources_set_updated_at
before update on public.sources
for each row execute function private.set_updated_at();

-- ingestion_runs ------------------------------------------------------------

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources (id) on delete restrict,
  job text not null,
  job_version text not null,
  mode text not null check (mode in ('full', 'delta', 'sample', 'dry_run')),
  sample_size integer check (sample_size > 0),
  status text not null default 'running'
    check (status in ('running', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  triggered_by text not null check (triggered_by in ('schedule', 'dispatch', 'cli')),
  git_sha text check (git_sha ~ '^[0-9a-f]{7,40}$'),
  actions_run_url text check (actions_run_url ~ '^https://'),
  counts jsonb not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object'),
  expected_total integer check (expected_total >= 0),
  dump_url text,
  dump_sha256 text check (dump_sha256 ~ '^[0-9a-f]{64}$'),
  dump_fetched_at timestamptz,
  error_summary text,
  constraint ingestion_runs_finished_iff_done check ((status = 'running') = (finished_at is null)),
  constraint ingestion_runs_sample_size check ((mode = 'sample') = (sample_size is not null) or mode = 'dry_run')
);

comment on table public.ingestion_runs is
  'One row per pipeline run. counts: fetched, valid, invalid, inserted, updated, unchanged, skipped_locked. expected_total catches capped pagination.';

create index ingestion_runs_source_started_idx on public.ingestion_runs (source_id, started_at desc);
create index ingestion_runs_running_idx on public.ingestion_runs (started_at) where status = 'running';

-- ingestion_run_events ------------------------------------------------------

create table public.ingestion_run_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.ingestion_runs (id) on delete cascade,
  at timestamptz not null default now(),
  severity text not null check (severity in ('debug', 'info', 'warn', 'error')),
  event_type text not null,
  message text not null,
  details jsonb
);

comment on table public.ingestion_run_events is 'At most 50 rows per run (driver-enforced), deleted after 30 days.';

create index ingestion_run_events_run_idx on public.ingestion_run_events (run_id, at);

-- raw_objects ---------------------------------------------------------------

create table public.raw_objects (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources (id) on delete restrict,
  run_id uuid references public.ingestion_runs (id) on delete cascade,
  storage_path text not null unique,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null check (byte_size >= 0),
  content_type text not null,
  request_url text,
  http_status smallint check (http_status between 100 and 599),
  fetched_at timestamptz not null,
  expires_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.raw_objects is
  'One row per gzipped raw file in the raw bucket (raw/{source_key}/{run_id}/{seq}.json.gz). Kept with deleted_at set after the file expires (D-010).';
comment on column public.raw_objects.run_id is 'Null for raw files written outside a run (edge-function lookups, AI responses).';

create index raw_objects_source_idx on public.raw_objects (source_id);
create index raw_objects_run_idx on public.raw_objects (run_id);
create index raw_objects_expiry_idx on public.raw_objects (expires_at) where deleted_at is null;

-- validation_failures -------------------------------------------------------

create table public.validation_failures (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.ingestion_runs (id) on delete cascade,
  raw_object_id uuid references public.raw_objects (id) on delete set null,
  record_key text,
  rule text not null
    check (rule in ('required_field', 'gtin_check_digit', 'price_sanity', 'unit_parse', 'duplicate', 'schema')),
  message text not null,
  payload jsonb check (octet_length(payload::text) <= 1024),
  created_at timestamptz not null default now()
);

comment on table public.validation_failures is
  'Records rejected before writing. At most 50 per run (counts.invalid has the total), 30-day retention.';

create index validation_failures_run_idx on public.validation_failures (run_id);
create index validation_failures_raw_object_idx on public.validation_failures (raw_object_id);

-- Public attribution view ---------------------------------------------------

create view public.source_attributions
with (security_invoker = true)
as
select key, name, licence, licence_url, attribution_text, homepage_url
from public.sources
where verdict <> 'avoid';

comment on view public.source_attributions is 'Attribution fields for the About screen: sources in use or entered manually.';

-- Privileges and RLS --------------------------------------------------------

alter table public.sources enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.ingestion_run_events enable row level security;
alter table public.raw_objects enable row level security;
alter table public.validation_failures enable row level security;

revoke all on table
  public.sources, public.ingestion_runs, public.ingestion_run_events, public.raw_objects,
  public.validation_failures, public.source_attributions
from anon, authenticated;

-- sources: public read; admin write.
grant select on table public.sources, public.source_attributions to anon, authenticated;
grant insert, update, delete on table public.sources to authenticated;

create policy sources_select_all on public.sources for select to anon, authenticated using (true);
create policy sources_insert_admin on public.sources for insert to authenticated
  with check ((select private.is_admin()));
create policy sources_update_admin on public.sources for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy sources_delete_admin on public.sources for delete to authenticated
  using ((select private.is_admin()));

-- Run bookkeeping: admin only.
grant select, insert, update, delete on table
  public.ingestion_runs, public.ingestion_run_events, public.raw_objects, public.validation_failures
to authenticated;

create policy ingestion_runs_admin on public.ingestion_runs for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy ingestion_run_events_admin on public.ingestion_run_events for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy raw_objects_admin on public.raw_objects for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy validation_failures_admin on public.validation_failures for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- Storage: the private raw bucket -------------------------------------------

-- 50 MB is the free-tier per-file cap; the OFF Canada extract is about 20 MB gzipped (BUDGET §5).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('raw', 'raw', false, 52428800, array['application/gzip'])
on conflict (id) do nothing;

-- Admins may read raw files (run detail links, P5). Nobody writes from a client; the pipeline uses the service role.
create policy raw_bucket_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'raw' and (select private.is_admin()));
