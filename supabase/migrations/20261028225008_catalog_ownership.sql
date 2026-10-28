-- P2.4 Catalog schema, domain 3: ownership (DATA_MODEL §3.2, banners from §3.4, views from §4; D-030, D-034).
-- companies, brands, company_ownership, brand_ownership, banners; views brand_current_owner and company_ultimate_parent.
-- All public read (filtered by status or review_status); admin write. Pipeline jobs write with the service role.

-- companies -----------------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  slug public.slug not null unique,
  name text not null check (char_length(name) between 1 and 200),
  legal_name text check (char_length(legal_name) between 1 and 300),
  aliases text[] not null default '{}',
  kind text not null default 'company'
    check (kind in ('company', 'cooperative', 'government', 'individual', 'nonprofit')),
  country char(2) check (country ~ '^[A-Z]{2}$'),
  headquarters text,
  founded_year smallint check (founded_year between 1000 and 2100),
  ownership_type text check (ownership_type in ('public', 'private', 'state', 'coop')),
  stock_ticker text check (char_length(stock_ticker) between 1 and 30),
  website text check (website ~ '^https?://'),
  description text,
  logo_url text check (logo_url ~ '^https?://'),
  ceo text,
  revenue_range text,
  wikidata_qid text unique check (wikidata_qid ~ '^Q[1-9][0-9]*$'),
  wikipedia_title text,
  wikipedia_revision_id bigint check (wikipedia_revision_id > 0),
  sec_cik text unique check (sec_cik ~ '^[0-9]{10}$'),
  corp_canada_number text check (corp_canada_number ~ '^[0-9]{1,12}$'),
  opencorporates_id text check (opencorporates_id ~ '^[a-z]{2}(_[a-z0-9]+)?/.+$'),
  status text not null default 'active' check (status in ('active', 'defunct', 'merged', 'rejected')),
  merged_into_id uuid references public.companies (id) on delete restrict,
  locked_fields text[] not null default '{}',
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
  constraint companies_merged check ((status = 'merged') = (merged_into_id is not null) and merged_into_id is distinct from id)
);

comment on table public.companies is
  'Companies, parents and operators. The slug never changes; a merge sets status = merged and merged_into_id (DATA_MODEL §1.3).';
comment on column public.companies.sec_cik is 'SEC EDGAR CIK, zero-padded to 10 digits (S20).';
comment on column public.companies.opencorporates_id is 'jurisdiction/number, e.g. ca_on/1234567. From Wikidata P1320; S22 itself is avoided.';
comment on column public.companies.locked_fields is 'Fields an admin edited by hand. Imports skip them (DATA_MODEL §1.2).';

create index companies_name_trgm_idx on public.companies
  using gin (public.normalize_match_text(name) extensions.gin_trgm_ops);
create index companies_merged_into_idx on public.companies (merged_into_id);
create index companies_source_idx on public.companies (source_id);
create index companies_ingestion_run_idx on public.companies (ingestion_run_id);
create index companies_raw_object_idx on public.companies (raw_object_id);

create trigger companies_set_updated_at
before update on public.companies
for each row execute function private.set_updated_at();

-- company_ownership ---------------------------------------------------------

create table public.company_ownership (
  id uuid primary key default gen_random_uuid(),
  parent_company_id uuid not null references public.companies (id) on delete cascade,
  child_company_id uuid not null references public.companies (id) on delete cascade,
  relation text not null
    check (relation in ('subsidiary', 'majority_stake', 'minority_stake', 'joint_venture', 'division')),
  share_pct numeric(5, 2) check (share_pct > 0 and share_pct <= 100),
  valid_from date,
  valid_to date,
  confidence numeric(3, 2) check (confidence between 0 and 1),
  -- +review
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected', 'superseded')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  decision_method text check (decision_method in ('admin', 'auto', 'legacy')),
  constraint company_ownership_review_decided check (
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
  constraint company_ownership_not_self check (parent_company_id <> child_company_id),
  constraint company_ownership_valid_range check (valid_to is null or valid_from is null or valid_to >= valid_from),
  constraint company_ownership_ai_confidence check (method <> 'ai' or confidence is not null),
  -- nulls not distinct = the DATA_MODEL coalesce(valid_from, '-infinity') key, usable as an on conflict target.
  constraint company_ownership_key unique nulls not distinct (parent_company_id, child_company_id, relation, valid_from)
);

comment on table public.company_ownership is
  'Parent -> child company edges. Cycles among pending and approved edges are rejected by a trigger.';
comment on column public.company_ownership.relation is
  'subsidiary, majority_stake and division are controlling: at most one current approved controlling parent per company.';

-- A company has at most one current, approved controlling parent, so the ultimate-parent walk is a chain.
create unique index company_ownership_one_controlling_parent on public.company_ownership (child_company_id)
  where relation in ('subsidiary', 'majority_stake', 'division') and valid_to is null and review_status = 'approved';
create index company_ownership_child_idx on public.company_ownership (child_company_id);
create index company_ownership_reviewed_by_idx on public.company_ownership (reviewed_by);
create index company_ownership_source_idx on public.company_ownership (source_id);
create index company_ownership_ingestion_run_idx on public.company_ownership (ingestion_run_id);
create index company_ownership_raw_object_idx on public.company_ownership (raw_object_id);

create trigger company_ownership_set_updated_at
before update on public.company_ownership
for each row execute function private.set_updated_at();

-- Rejects an edge that would close a loop among live (pending or approved) edges. Security definer so the
-- check sees every edge whatever the caller's RLS; an advisory lock serializes concurrent edge writes.
create function private.company_ownership_reject_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.review_status not in ('pending', 'approved') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('public.company_ownership'));

  if exists (
    with recursive below (company_id) as (
      select e.child_company_id
      from public.company_ownership e
      where e.parent_company_id = new.child_company_id
        and e.review_status in ('pending', 'approved')
        and e.id <> new.id
      union
      select e.child_company_id
      from public.company_ownership e
      join below b on e.parent_company_id = b.company_id
      where e.review_status in ('pending', 'approved')
        and e.id <> new.id
    )
    select 1 from below where company_id = new.parent_company_id
  ) then
    raise exception 'company_ownership edge % -> % would create a cycle', new.parent_company_id, new.child_company_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function private.company_ownership_reject_cycle() from public, anon, authenticated;

create trigger company_ownership_reject_cycle
before insert or update of parent_company_id, child_company_id, review_status on public.company_ownership
for each row execute function private.company_ownership_reject_cycle();

-- brands --------------------------------------------------------------------

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  slug public.slug not null unique,
  name text not null check (char_length(name) between 1 and 200),
  aliases text[] not null default '{}',
  wikidata_qid text unique check (wikidata_qid ~ '^Q[1-9][0-9]*$'),
  website text check (website ~ '^https?://'),
  logo_url text check (logo_url ~ '^https?://'),
  description text,
  is_private_label boolean not null default false,
  status text not null default 'active' check (status in ('active', 'defunct', 'merged', 'rejected')),
  merged_into_id uuid references public.brands (id) on delete restrict,
  locked_fields text[] not null default '{}',
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
  constraint brands_merged check ((status = 'merged') = (merged_into_id is not null) and merged_into_id is distinct from id)
);

comment on table public.brands is 'Brands. Ownership lives in brand_ownership, never on the brand or the product.';
comment on column public.brands.is_private_label is 'A retailer''s own brand, e.g. President''s Choice.';

create index brands_name_trgm_idx on public.brands
  using gin (public.normalize_match_text(name) extensions.gin_trgm_ops);
create index brands_merged_into_idx on public.brands (merged_into_id);
create index brands_source_idx on public.brands (source_id);
create index brands_ingestion_run_idx on public.brands (ingestion_run_id);
create index brands_raw_object_idx on public.brands (raw_object_id);

create trigger brands_set_updated_at
before update on public.brands
for each row execute function private.set_updated_at();

-- brand_ownership -----------------------------------------------------------

create table public.brand_ownership (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  relation text not null check (relation in ('owner', 'licensee', 'private_label_of')),
  valid_from date,
  valid_to date,
  confidence numeric(3, 2) check (confidence between 0 and 1),
  match_candidate_id bigint references public.match_candidates (id) on delete set null,
  -- +review
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected', 'superseded')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  decision_method text check (decision_method in ('admin', 'auto', 'legacy')),
  constraint brand_ownership_review_decided check (
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
  constraint brand_ownership_valid_range check (valid_to is null or valid_from is null or valid_to >= valid_from),
  constraint brand_ownership_ai_confidence check (method <> 'ai' or confidence is not null),
  constraint brand_ownership_key unique nulls not distinct (brand_id, company_id, relation, valid_from)
);

comment on table public.brand_ownership is
  'Brand -> company. owner and private_label_of are ownership: at most one current approved one per brand.';
comment on column public.brand_ownership.match_candidate_id is 'The resolver decision that created this edge, if any.';

create unique index brand_ownership_one_current_owner on public.brand_ownership (brand_id)
  where relation in ('owner', 'private_label_of') and valid_to is null and review_status = 'approved';
create index brand_ownership_company_idx on public.brand_ownership (company_id);
create index brand_ownership_match_candidate_idx on public.brand_ownership (match_candidate_id);
create index brand_ownership_reviewed_by_idx on public.brand_ownership (reviewed_by);
create index brand_ownership_source_idx on public.brand_ownership (source_id);
create index brand_ownership_ingestion_run_idx on public.brand_ownership (ingestion_run_id);
create index brand_ownership_raw_object_idx on public.brand_ownership (raw_object_id);

create trigger brand_ownership_set_updated_at
before update on public.brand_ownership
for each row execute function private.set_updated_at();

-- banners -------------------------------------------------------------------

create table public.banners (
  id uuid primary key default gen_random_uuid(),
  slug public.slug not null unique,
  name text not null check (char_length(name) between 1 and 200),
  operator_company_id uuid references public.companies (id) on delete restrict,
  website text check (website ~ '^https?://'),
  country char(2) check (country ~ '^[A-Z]{2}$'),
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

comment on table public.banners is 'Retail banners (No Frills). The operating chain is a companies row; there is no chains table.';

create index banners_operator_company_idx on public.banners (operator_company_id);
create index banners_source_idx on public.banners (source_id);
create index banners_ingestion_run_idx on public.banners (ingestion_run_id);
create index banners_raw_object_idx on public.banners (raw_object_id);

create trigger banners_set_updated_at
before update on public.banners
for each row execute function private.set_updated_at();

-- Views (security_invoker: the base-table RLS applies) ----------------------

create view public.brand_current_owner
with (security_invoker = true)
as
select
  b.id as brand_id,
  b.slug as brand_slug,
  b.name as brand_name,
  c.id as company_id,
  c.slug as company_slug,
  c.name as company_name,
  o.relation,
  o.confidence,
  o.valid_from
from public.brand_ownership o
join public.brands b on b.id = o.brand_id
join public.companies c on c.id = o.company_id
where o.relation in ('owner', 'private_label_of')
  and o.valid_to is null
  and o.review_status = 'approved';

comment on view public.brand_current_owner is 'Brand -> its current approved owner company (one row per owned brand).';

-- One row per company: itself at depth 0 when it has no controlling parent. path runs from the company up to
-- the top parent. Only approved, current, controlling edges are walked; the path check guards against loops.
create view public.company_ultimate_parent
with (security_invoker = true)
as
with recursive walk (company_id, current_id, depth, path) as (
  select c.id, c.id, 0, array[c.id]
  from public.companies c
  union all
  select w.company_id, e.parent_company_id, w.depth + 1, w.path || e.parent_company_id
  from walk w
  join public.company_ownership e on e.child_company_id = w.current_id
  join public.companies p on p.id = e.parent_company_id
  where e.relation in ('subsidiary', 'majority_stake', 'division')
    and e.valid_to is null
    and e.review_status = 'approved'
    and e.parent_company_id <> all (w.path)
    and w.depth < 20
),
top as (
  select distinct on (company_id) company_id, current_id, depth, path
  from walk
  order by company_id, depth desc
)
select
  t.company_id,
  t.current_id as ultimate_parent_id,
  p.slug as ultimate_parent_slug,
  p.name as ultimate_parent_name,
  t.depth,
  t.path
from top t
join public.companies p on p.id = t.current_id;

comment on view public.company_ultimate_parent is
  'Each company with its top controlling parent (approved, current subsidiary/majority_stake/division edges), depth and path.';

-- Privileges and RLS: public read, admin write ------------------------------

alter table public.companies enable row level security;
alter table public.company_ownership enable row level security;
alter table public.brands enable row level security;
alter table public.brand_ownership enable row level security;
alter table public.banners enable row level security;

revoke all on table
  public.companies, public.company_ownership, public.brands, public.brand_ownership, public.banners,
  public.brand_current_owner, public.company_ultimate_parent
from anon, authenticated;

grant select on table
  public.companies, public.company_ownership, public.brands, public.brand_ownership, public.banners,
  public.brand_current_owner, public.company_ultimate_parent
to anon, authenticated;
grant insert, update, delete on table
  public.companies, public.company_ownership, public.brands, public.brand_ownership, public.banners
to authenticated;

-- Reads. Two select policies per table, because anon can't execute private.is_admin().
create policy companies_select_anon on public.companies for select to anon
  using (status <> 'rejected');
create policy companies_select_authenticated on public.companies for select to authenticated
  using (status <> 'rejected' or (select private.is_admin()));

create policy brands_select_anon on public.brands for select to anon
  using (status <> 'rejected');
create policy brands_select_authenticated on public.brands for select to authenticated
  using (status <> 'rejected' or (select private.is_admin()));

create policy company_ownership_select_anon on public.company_ownership for select to anon
  using (review_status = 'approved');
create policy company_ownership_select_authenticated on public.company_ownership for select to authenticated
  using (review_status = 'approved' or (select private.is_admin()));

create policy brand_ownership_select_anon on public.brand_ownership for select to anon
  using (review_status = 'approved');
create policy brand_ownership_select_authenticated on public.brand_ownership for select to authenticated
  using (review_status = 'approved' or (select private.is_admin()));

create policy banners_select_all on public.banners for select to anon, authenticated using (true);

-- Writes: admin only, one policy per command so reads keep a single permissive policy per role.
create policy companies_insert_admin on public.companies for insert to authenticated
  with check ((select private.is_admin()));
create policy companies_update_admin on public.companies for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy companies_delete_admin on public.companies for delete to authenticated
  using ((select private.is_admin()));

create policy company_ownership_insert_admin on public.company_ownership for insert to authenticated
  with check ((select private.is_admin()));
create policy company_ownership_update_admin on public.company_ownership for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy company_ownership_delete_admin on public.company_ownership for delete to authenticated
  using ((select private.is_admin()));

create policy brands_insert_admin on public.brands for insert to authenticated
  with check ((select private.is_admin()));
create policy brands_update_admin on public.brands for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy brands_delete_admin on public.brands for delete to authenticated
  using ((select private.is_admin()));

create policy brand_ownership_insert_admin on public.brand_ownership for insert to authenticated
  with check ((select private.is_admin()));
create policy brand_ownership_update_admin on public.brand_ownership for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy brand_ownership_delete_admin on public.brand_ownership for delete to authenticated
  using ((select private.is_admin()));

create policy banners_insert_admin on public.banners for insert to authenticated
  with check ((select private.is_admin()));
create policy banners_update_admin on public.banners for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy banners_delete_admin on public.banners for delete to authenticated
  using ((select private.is_admin()));
