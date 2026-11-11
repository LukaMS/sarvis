-- P4.10 Edges keep evidence from several sources (D-095).
-- edge_sources: one row per (ownership edge, source) for a source that confirms an edge another
-- source created. The creating source's provenance stays in the edge's own +prov block, so a
-- single-source edge has no row here and nothing is backfilled. Shaped like company_sources.
-- Exactly one of brand_ownership_id / company_ownership_id is set; both cascade with the edge.
-- Admin only. Pipeline jobs write with the service role (bypasses RLS).

create table public.edge_sources (
  id bigint generated always as identity primary key,
  brand_ownership_id uuid references public.brand_ownership (id) on delete cascade,
  company_ownership_id uuid references public.company_ownership (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete restrict,
  source_url text check (source_url ~ '^https?://'),
  fetched_at timestamptz not null,
  last_seen_at timestamptz not null,
  content_hash bytea check (octet_length(content_hash) between 8 and 64),
  method text not null check (method in ('import', 'api', 'ai', 'manual', 'legacy-import', 'receipt', 'derived')),
  method_version text not null check (char_length(method_version) between 1 and 200),
  confidence numeric(3, 2) check (confidence between 0 and 1),
  ai_call_id bigint references public.ai_calls (id) on delete set null,
  ingestion_run_id uuid references public.ingestion_runs (id) on delete set null,
  raw_object_id uuid references public.raw_objects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint edge_sources_one_edge check (num_nonnulls(brand_ownership_id, company_ownership_id) = 1),
  constraint edge_sources_seen_after_fetch check (last_seen_at >= fetched_at),
  constraint edge_sources_ai_confidence check (method <> 'ai' or confidence is not null)
);

comment on table public.edge_sources is
  'Evidence for an ownership edge from a source other than the one that created it (P4.10, D-095). Admin only.';
comment on column public.edge_sources.confidence is 'This source''s confidence in the edge, if it gives one.';

-- One row per edge and source. Partial, so each index holds only its own edge type.
create unique index edge_sources_brand_key on public.edge_sources (brand_ownership_id, source_id)
  where brand_ownership_id is not null;
create unique index edge_sources_company_key on public.edge_sources (company_ownership_id, source_id)
  where company_ownership_id is not null;
create index edge_sources_source_idx on public.edge_sources (source_id);
create index edge_sources_ingestion_run_idx on public.edge_sources (ingestion_run_id);
create index edge_sources_raw_object_idx on public.edge_sources (raw_object_id);
create index edge_sources_ai_call_idx on public.edge_sources (ai_call_id) where ai_call_id is not null;

create trigger edge_sources_set_updated_at
before update on public.edge_sources
for each row execute function private.set_updated_at();

alter table public.edge_sources enable row level security;
revoke all on table public.edge_sources from anon, authenticated;
grant select, insert, update, delete on table public.edge_sources to authenticated;

create policy edge_sources_admin on public.edge_sources for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
