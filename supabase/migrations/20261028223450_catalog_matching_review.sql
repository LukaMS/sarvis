-- P2.3 Catalog schema, domain 2: matching and review (DATA_MODEL §3.5, §1.5; D-033).
-- Comes before ownership because brand_ownership.match_candidate_id references match_candidates (D-030).
-- Both tables are admin only. Pipeline jobs write with the service role (bypasses RLS).

-- match_candidates ----------------------------------------------------------

create table public.match_candidates (
  id bigint generated always as identity primary key,
  kind text not null
    check (kind in ('listing_product', 'product_brand', 'brand_company', 'company_company', 'category')),
  subject_type text not null,
  subject_id uuid not null,
  candidate_type text not null,
  candidate_id uuid not null,
  score numeric(4, 3) not null check (score between 0 and 1),
  match_method text not null
    check (match_method ~ '^(gtin_exact|alias_exact|name_exact|trigram|wikidata|rule:[a-z0-9][a-z0-9_.-]*)$'),
  match_method_version text not null check (char_length(match_method_version) between 1 and 100),
  features jsonb check (jsonb_typeof(features) = 'object' and octet_length(features::text) <= 1024),
  reason text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'superseded')),
  decision_method text check (decision_method in ('auto', 'admin')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  run_id uuid references public.ingestion_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint match_candidates_unique unique (kind, subject_id, candidate_id, match_method_version),
  constraint match_candidates_not_self check (subject_id <> candidate_id),
  -- Each kind links one table to another; the polymorphic ids can't carry foreign keys, so the types are pinned here.
  constraint match_candidates_kind_types check (
    case kind
      when 'listing_product' then subject_type = 'store_listings' and candidate_type = 'products'
      when 'product_brand' then subject_type = 'products' and candidate_type = 'brands'
      when 'brand_company' then subject_type = 'brands' and candidate_type = 'companies'
      when 'company_company' then subject_type = 'companies' and candidate_type = 'companies'
      when 'category' then subject_type in ('products', 'store_listings') and candidate_type = 'categories'
    end
  ),
  -- Decided iff not pending; an auto decision has no person behind it.
  constraint match_candidates_decided check (
    (status = 'pending') = (decided_at is null)
    and (status = 'pending') = (decision_method is null)
    and (status <> 'pending' or decided_by is null)
    and (decision_method is distinct from 'auto' or decided_by is null)
  )
);

comment on table public.match_candidates is
  'Every proposed link with its score and decision. Rejected and superseded rows are deleted after 30 days; the accepted row is the decision record.';
comment on column public.match_candidates.score is 'Calibrated on the P4 gold set.';
comment on column public.match_candidates.features is 'Inputs to the score (similarities, size match, ...), at most 1 KB.';

-- The unique key (kind, subject_id, ...) already serves lookups by subject.
create index match_candidates_candidate_idx on public.match_candidates (candidate_id);
create index match_candidates_pending_idx on public.match_candidates (kind, score desc) where status = 'pending';
create index match_candidates_run_idx on public.match_candidates (run_id);
create index match_candidates_decided_by_idx on public.match_candidates (decided_by);

-- review_queue --------------------------------------------------------------

create table public.review_queue (
  id bigint generated always as identity primary key,
  item_type text not null check (item_type in (
    'company_score', 'document_entity', 'company_ownership', 'brand_ownership', 'match_candidate', 'product',
    'certification', 'company_event', 'legacy_fact'
  )),
  item_table text not null check (item_table ~ '^[a-z][a-z0-9_]*$'),
  item_id text not null
    check (item_id ~ '^([0-9]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'),
  priority smallint not null default 50 check (priority between 0 and 100),
  reason text,
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  assigned_to uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  constraint review_queue_resolved check (
    (status = 'open') = (resolved_at is null)
    and (status <> 'open' or resolved_by is null)
  )
);

comment on table public.review_queue is
  'The single admin work list. The decision goes to the item''s own review_status; this row only tracks the work. Resolved rows are deleted after 90 days.';
comment on column public.review_queue.item_id is 'The item''s primary key as text: a uuid or a bigint.';
comment on column public.review_queue.priority is '0-100, higher is more urgent.';

-- One open work item per fact, so re-running a job doesn't queue it twice.
create unique index review_queue_open_item_key on public.review_queue (item_table, item_id) where status = 'open';
create index review_queue_open_idx on public.review_queue (priority desc, created_at) where status = 'open';
create index review_queue_assigned_to_idx on public.review_queue (assigned_to);
create index review_queue_resolved_by_idx on public.review_queue (resolved_by);

-- Privileges and RLS: admin only --------------------------------------------

alter table public.match_candidates enable row level security;
alter table public.review_queue enable row level security;

revoke all on table public.match_candidates, public.review_queue from anon, authenticated;
grant select, insert, update, delete on table public.match_candidates, public.review_queue to authenticated;

create policy match_candidates_admin on public.match_candidates for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy review_queue_admin on public.review_queue for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
