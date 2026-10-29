-- P2.9 Catalog schema, domain 8: editorial (DATA_MODEL §3.7; D-039).
-- product_features, transparency_steps (legacy product-page content) and stories (legacy impact_stories).
-- Public read of approved features and steps and of published stories, admin write. Pipeline jobs write with
-- the service role.

-- product_features ----------------------------------------------------------

create table public.product_features (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  -- The legacy admin and enrich-content allow-list (MaterialCommunityIcons names the app draws).
  icon text not null check (icon in (
    'sprout', 'recycle', 'water-outline', 'molecule-co2', 'leaf', 'package-variant', 'rabbit', 'hand-heart', 'dna',
    'cow', 'snowflake', 'water-alert', 'bottle-soda', 'factory', 'alert-circle', 'certificate', 'earth',
    'shield-check', 'account-group', 'tree', 'fish', 'flash', 'truck-delivery', 'store'
  )),
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 500),
  sort_order smallint not null default 0 check (sort_order >= 0),
  -- +review
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected', 'superseded')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  decision_method text check (decision_method in ('admin', 'auto', 'legacy')),
  constraint product_features_review_decided check (
    (review_status = 'pending') = (reviewed_at is null)
    and (review_status = 'pending') = (decision_method is null)
    and (review_status <> 'pending' or reviewed_by is null)
    and (decision_method is distinct from 'auto' or reviewed_by is null)
  ),
  -- +prov
  source_id uuid not null references public.sources (id) on delete restrict,
  source_url text check (source_url ~ '^https?://'),
  fetched_at timestamptz not null,
  method text not null check (method in ('import', 'api', 'ai', 'manual', 'legacy-import', 'receipt', 'derived')),
  method_version text not null check (char_length(method_version) between 1 and 200),
  ingestion_run_id uuid references public.ingestion_runs (id) on delete set null,
  raw_object_id uuid references public.raw_objects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The upsert key: saves update rows in place instead of delete-and-reinsert (SPEC issue 5).
  constraint product_features_key unique (product_id, sort_order)
);

comment on table public.product_features is
  'Icon + title + description bullets on a product page (legacy product_features). Anon sees approved rows.';

create index product_features_reviewed_by_idx on public.product_features (reviewed_by);
create index product_features_source_idx on public.product_features (source_id);
create index product_features_ingestion_run_idx on public.product_features (ingestion_run_id);
create index product_features_raw_object_idx on public.product_features (raw_object_id);

create trigger product_features_set_updated_at
before update on public.product_features
for each row execute function private.set_updated_at();

-- transparency_steps --------------------------------------------------------

create table public.transparency_steps (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  step text not null check (step in ('sourcing', 'production', 'packaging', 'distribution')),
  -- Display order, derived so it can never disagree with step (legacy ordered by step_number).
  step_number smallint not null generated always as (
    case step when 'sourcing' then 1 when 'production' then 2 when 'packaging' then 3 else 4 end
  ) stored,
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 1000),
  -- +review
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected', 'superseded')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  decision_method text check (decision_method in ('admin', 'auto', 'legacy')),
  constraint transparency_steps_review_decided check (
    (review_status = 'pending') = (reviewed_at is null)
    and (review_status = 'pending') = (decision_method is null)
    and (review_status <> 'pending' or reviewed_by is null)
    and (decision_method is distinct from 'auto' or reviewed_by is null)
  ),
  -- +prov
  source_id uuid not null references public.sources (id) on delete restrict,
  source_url text check (source_url ~ '^https?://'),
  fetched_at timestamptz not null,
  method text not null check (method in ('import', 'api', 'ai', 'manual', 'legacy-import', 'receipt', 'derived')),
  method_version text not null check (char_length(method_version) between 1 and 200),
  ingestion_run_id uuid references public.ingestion_runs (id) on delete set null,
  raw_object_id uuid references public.raw_objects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transparency_steps_key unique (product_id, step)
);

comment on table public.transparency_steps is
  'Supply-chain steps on a product page, at most one per step (legacy transparency_steps). Anon sees approved rows.';
comment on column public.transparency_steps.title is
  'Free text shown to users ("Carbon Offset Shipping"); step is the fixed slot it fills.';

create index transparency_steps_reviewed_by_idx on public.transparency_steps (reviewed_by);
create index transparency_steps_source_idx on public.transparency_steps (source_id);
create index transparency_steps_ingestion_run_idx on public.transparency_steps (ingestion_run_id);
create index transparency_steps_raw_object_idx on public.transparency_steps (raw_object_id);

create trigger transparency_steps_set_updated_at
before update on public.transparency_steps
for each row execute function private.set_updated_at();

-- stories -------------------------------------------------------------------

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  slug public.slug not null unique,
  title text not null check (char_length(title) between 1 and 200),
  subtitle text check (char_length(subtitle) <= 300),
  category text check (char_length(category) between 1 and 100),
  body text check (char_length(body) <= 50000),
  -- A path in Storage, never an external URL: covers are copied in only after a licence check.
  cover_image_path text check (char_length(cover_image_path) between 1 and 500 and cover_image_path !~ '^[a-z]+:'),
  company_id uuid references public.companies (id) on delete set null,
  featured boolean not null default false,
  published_at timestamptz,
  -- +prov
  source_id uuid not null references public.sources (id) on delete restrict,
  source_url text check (source_url ~ '^https?://'),
  fetched_at timestamptz not null,
  method text not null check (method in ('import', 'api', 'ai', 'manual', 'legacy-import', 'receipt', 'derived')),
  method_version text not null check (char_length(method_version) between 1 and 200),
  ingestion_run_id uuid references public.ingestion_runs (id) on delete set null,
  raw_object_id uuid references public.raw_objects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.stories is
  'Editorial stories (legacy impact_stories). Anon sees a story once published_at <= now(); null is a draft.';
comment on column public.stories.cover_image_path is 'Storage object path. Legacy Unsplash URLs are not carried over.';

create index stories_company_idx on public.stories (company_id);
create index stories_feed_idx on public.stories (featured, published_at desc);
create index stories_source_idx on public.stories (source_id);
create index stories_ingestion_run_idx on public.stories (ingestion_run_id);
create index stories_raw_object_idx on public.stories (raw_object_id);

create trigger stories_set_updated_at
before update on public.stories
for each row execute function private.set_updated_at();

-- Privileges and RLS ---------------------------------------------------------

alter table public.product_features enable row level security;
alter table public.transparency_steps enable row level security;
alter table public.stories enable row level security;

revoke all on table public.product_features, public.transparency_steps, public.stories from anon, authenticated;

grant select on table public.product_features, public.transparency_steps, public.stories to anon, authenticated;
grant insert, update, delete on table public.product_features, public.transparency_steps, public.stories
to authenticated;

-- Reads. Two select policies where a filter applies, because anon can't execute private.is_admin().
create policy product_features_select_anon on public.product_features for select to anon
  using (review_status = 'approved');
create policy product_features_select_authenticated on public.product_features for select to authenticated
  using (review_status = 'approved' or (select private.is_admin()));

create policy transparency_steps_select_anon on public.transparency_steps for select to anon
  using (review_status = 'approved');
create policy transparency_steps_select_authenticated on public.transparency_steps for select to authenticated
  using (review_status = 'approved' or (select private.is_admin()));

create policy stories_select_anon on public.stories for select to anon
  using (published_at <= now());
create policy stories_select_authenticated on public.stories for select to authenticated
  using (published_at <= now() or (select private.is_admin()));

-- Writes: admin only, one policy per command so reads keep a single permissive policy per role.
create policy product_features_insert_admin on public.product_features for insert to authenticated
  with check ((select private.is_admin()));
create policy product_features_update_admin on public.product_features for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy product_features_delete_admin on public.product_features for delete to authenticated
  using ((select private.is_admin()));

create policy transparency_steps_insert_admin on public.transparency_steps for insert to authenticated
  with check ((select private.is_admin()));
create policy transparency_steps_update_admin on public.transparency_steps for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy transparency_steps_delete_admin on public.transparency_steps for delete to authenticated
  using ((select private.is_admin()));

create policy stories_insert_admin on public.stories for insert to authenticated
  with check ((select private.is_admin()));
create policy stories_update_admin on public.stories for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy stories_delete_admin on public.stories for delete to authenticated
  using ((select private.is_admin()));
