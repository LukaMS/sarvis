-- P2.5 Catalog schema, domain 4: products (DATA_MODEL §3.3, §1.4, views from §4; D-035).
-- GTIN helpers; categories, category_mappings, labels (with a fixed seed), products, product_identifiers,
-- product_sources; views products_with_source_url and product_ownership_chain.
-- product_sources is admin only; the rest is public read (filtered by status or review_status), admin write.
-- Pipeline jobs write with the service role (bypasses RLS).

-- GTIN helpers (DATA_MODEL §1.4) --------------------------------------------
-- The TS twin in packages/core (P2.10) must pass the same vectors as supabase/tests/products.sql.

-- True when value is 8, 12, 13 or 14 digits with a correct GS1 mod-10 check digit.
create function public.gtin_is_valid(value text)
returns boolean
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select case
    when value !~ '^([0-9]{8}|[0-9]{12,14})$' then false
    else (
      select (10 - (
               select sum(substr(g, i, 1)::int * (case when i % 2 = 1 then 3 else 1 end))
               from generate_series(1, 13) as i
             ) % 10) % 10 = substr(g, 14, 1)::int
      from (select lpad(value, 14, '0') as g) as padded
    )
  end;
$$;

comment on function public.gtin_is_valid(text) is
  'GTIN-8/12/13/14 digits with a valid check digit (DATA_MODEL §1.4). Digits only: callers strip spaces first.';

-- The GTIN-14 form (UPC-A gets 00, EAN-13 gets 0, EAN-8 gets six 0s), or null when the code is not a valid GTIN.
create function public.gtin_normalize(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select case when public.gtin_is_valid(value) then lpad(value, 14, '0') end;
$$;

comment on function public.gtin_normalize(text) is 'GTIN-14 for a valid GTIN, else null (DATA_MODEL §1.4).';

-- Restricted-circulation codes (GS1 prefixes 02 and 20-29: variable-weight and in-store codes) are not GTINs
-- for catalog purposes. They go to product_identifiers as store_internal, scoped to a banner.
create function public.gtin_is_restricted(value text)
returns boolean
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select coalesce(public.gtin_normalize(value) ~ '^0(02|2)', false);
$$;

comment on function public.gtin_is_restricted(text) is
  'True for a valid GTIN-12/13 with GS1 prefix 02 or 20-29 (in its GTIN-14 form: 002… or 02…). DATA_MODEL §1.4.';

-- categories ----------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*$' and char_length(slug) <= 200),
  name text not null check (char_length(name) between 1 and 200),
  parent_id uuid references public.categories (id) on delete restrict,
  level smallint not null check (level between 0 and 6),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_level_matches_slug check (level = char_length(slug) - char_length(replace(slug, '/', ''))),
  constraint categories_root_has_no_parent check ((level = 0) = (parent_id is null))
);

comment on table public.categories is
  'The Sarvis taxonomy (Phase 4). The slug is the path, e.g. dairy/milk/plant-based; a child''s slug extends its parent''s.';

create index categories_parent_idx on public.categories (parent_id);

create trigger categories_set_updated_at
before update on public.categories
for each row execute function private.set_updated_at();

-- A child's slug is its parent's slug plus one segment (the level checks above keep the depth consistent).
create function private.categories_check_path()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_slug text;
begin
  if new.parent_id is null then
    return new;
  end if;

  select c.slug into parent_slug from public.categories c where c.id = new.parent_id;
  if parent_slug is null or left(new.slug, char_length(parent_slug) + 1) <> parent_slug || '/'
     or position('/' in substr(new.slug, char_length(parent_slug) + 2)) > 0 then
    raise exception 'category slug % does not extend its parent slug %', new.slug, parent_slug
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function private.categories_check_path() from public, anon, authenticated;

create trigger categories_check_path
before insert or update of slug, parent_id on public.categories
for each row execute function private.categories_check_path();

-- category_mappings ---------------------------------------------------------

create table public.category_mappings (
  id bigint generated always as identity primary key,
  source_category_key text not null check (char_length(source_category_key) between 1 and 300),
  category_id uuid not null references public.categories (id) on delete cascade,
  confidence numeric(3, 2) check (confidence between 0 and 1),
  -- +review
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected', 'superseded')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  decision_method text check (decision_method in ('admin', 'auto', 'legacy')),
  constraint category_mappings_review_decided check (
    (review_status = 'pending') = (reviewed_at is null)
    and (review_status = 'pending') = (decision_method is null)
    and (review_status <> 'pending' or reviewed_by is null)
    and (decision_method is distinct from 'auto' or reviewed_by is null)
  ),
  -- +prov (source_id is also the source whose category key this maps)
  source_id uuid not null references public.sources (id) on delete restrict,
  source_url text check (source_url ~ '^https?://'),
  fetched_at timestamptz not null,
  method text not null check (method in ('import', 'api', 'ai', 'manual', 'legacy-import', 'receipt', 'derived')),
  method_version text not null check (char_length(method_version) between 1 and 200),
  ingestion_run_id uuid references public.ingestion_runs (id) on delete set null,
  raw_object_id uuid references public.raw_objects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint category_mappings_ai_confidence check (method <> 'ai' or confidence is not null),
  constraint category_mappings_key unique (source_id, source_category_key)
);

comment on table public.category_mappings is
  'Source category (e.g. OFF en:plant-based-milks) -> Sarvis category. source_id is the source that owns the key; method says how the mapping was made.';

create index category_mappings_category_idx on public.category_mappings (category_id);
create index category_mappings_reviewed_by_idx on public.category_mappings (reviewed_by);
create index category_mappings_ingestion_run_idx on public.category_mappings (ingestion_run_id);
create index category_mappings_raw_object_idx on public.category_mappings (raw_object_id);

create trigger category_mappings_set_updated_at
before update on public.category_mappings
for each row execute function private.set_updated_at();

-- labels --------------------------------------------------------------------

create table public.labels (
  id smallint primary key check (id > 0),
  code public.slug not null unique,
  name text not null check (char_length(name) between 1 and 200),
  off_tags text[] not null default '{}' check (array_position(off_tags, null) is null),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.labels is
  'Ethics-relevant labels. products.label_codes stores these ids, so an id is never reused or renumbered.';
comment on column public.labels.off_tags is
  'Open Food Facts labels_tags that map to this label. A tag belongs to at most one label.';

create trigger labels_set_updated_at
before update on public.labels
for each row execute function private.set_updated_at();

-- Fixed lookup rows. OFF tags checked against the OFF labels taxonomy on 2026-10-28.
insert into public.labels (id, code, name, off_tags)
values
  (1, 'organic', 'Organic', array['en:organic', 'en:eu-organic', 'en:usda-organic', 'en:canada-organic']),
  (2, 'fair-trade', 'Fair trade', array['en:fair-trade', 'en:fairtrade-international', 'en:fair-for-life']),
  (3, 'rspo', 'RSPO sustainable palm oil', array['en:roundtable-on-sustainable-palm-oil']),
  (4, 'rainforest-alliance', 'Rainforest Alliance', array['en:rainforest-alliance', 'en:utz-certified']),
  (5, 'msc', 'MSC sustainable seafood', array['en:sustainable-seafood-msc']),
  (6, 'b-corp', 'Certified B Corporation', array['en:certified-b-corporation']),
  (7, 'non-gmo', 'Non-GMO Project', array['en:non-gmo-project']),
  (8, 'vegan', 'Vegan', array['en:vegan']),
  (9, 'free-range', 'Free range', array['en:free-range', 'en:free-range-eggs']),
  (10, 'animal-welfare', 'Animal welfare', array['en:animal-welfare'])
on conflict (id) do nothing;

-- products ------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  gtin char(14) unique
    check (gtin ~ '^[0-9]{14}$' and public.gtin_is_valid(gtin) and not public.gtin_is_restricted(gtin)),
  external_id text not null check (char_length(external_id) between 1 and 200),
  name text not null check (char_length(name) between 1 and 500),
  brand_id uuid references public.brands (id) on delete set null,
  brand_text text check (char_length(brand_text) between 1 and 300),
  category_id uuid references public.categories (id) on delete set null,
  quantity_text text check (char_length(quantity_text) between 1 and 200),
  net_quantity numeric(12, 3) check (net_quantity > 0),
  net_unit text check (net_unit in ('g', 'ml', 'ct')),
  pack_count smallint check (pack_count > 0),
  unit_parse_status text not null default 'unparsed' check (unit_parse_status in ('ok', 'unparsed', 'ambiguous')),
  label_codes smallint[] not null default '{}'
    check (array_position(label_codes, null) is null and cardinality(label_codes) <= 32),
  image_key text check (char_length(image_key) between 1 and 300),
  description text,
  source_modified_at timestamptz,
  content_hash bytea check (octet_length(content_hash) between 8 and 64),
  status text not null default 'active' check (status in ('active', 'discontinued', 'merged', 'rejected')),
  merged_into_id uuid references public.products (id) on delete restrict,
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
  constraint products_source_key unique (source_id, external_id),
  constraint products_quantity_unit check ((net_quantity is null) = (net_unit is null)),
  constraint products_parsed_has_quantity check (unit_parse_status <> 'ok' or net_quantity is not null),
  constraint products_merged check ((status = 'merged') = (merged_into_id is not null) and merged_into_id is distinct from id)
);

comment on table public.products is
  'The one product table (D-008). The company comes from brand_ownership, never from the product.';
comment on column public.products.gtin is
  'Primary barcode as GTIN-14 with a valid check digit; restricted-circulation codes are not allowed (DATA_MODEL §1.4).';
comment on column public.products.external_id is 'The id in source_id (OFF code, manual id). (source_id, external_id) is the import key.';
comment on column public.products.label_codes is 'labels.id values (ethics-relevant labels only).';
comment on column public.products.image_key is 'OFF image path suffix. Images are hotlinked with attribution, never stored.';
comment on column public.products.content_hash is 'Hash of the imported fields; an import skips rows whose hash is unchanged.';
comment on column public.products.locked_fields is 'Fields an admin edited by hand. Imports skip them (DATA_MODEL §1.2).';

create index products_brand_idx on public.products (brand_id);
create index products_category_idx on public.products (category_id);
create index products_name_trgm_idx on public.products
  using gin (public.normalize_match_text(name) extensions.gin_trgm_ops);
create index products_merged_into_idx on public.products (merged_into_id);
create index products_ingestion_run_idx on public.products (ingestion_run_id);
create index products_raw_object_idx on public.products (raw_object_id);

create trigger products_set_updated_at
before update on public.products
for each row execute function private.set_updated_at();

-- product_identifiers -------------------------------------------------------

create table public.product_identifiers (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id) on delete cascade,
  scheme text not null check (scheme in ('gtin_alt', 'store_sku', 'store_internal', 'plu')),
  value text not null check (char_length(value) between 1 and 64),
  banner_id uuid references public.banners (id) on delete cascade,
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
  constraint product_identifiers_banner_scoped check (scheme not in ('store_sku', 'store_internal') or banner_id is not null),
  constraint product_identifiers_value_format check (
    case scheme
      when 'gtin_alt' then value ~ '^[0-9]{14}$' and public.gtin_is_valid(value) and not public.gtin_is_restricted(value)
      when 'plu' then value ~ '^[0-9]{4,5}$'
      when 'store_internal' then value ~ '^[0-9]+$'
      else true
    end
  ),
  -- nulls not distinct = the DATA_MODEL coalesce(banner_id, nil-uuid) key, usable as an on conflict target.
  constraint product_identifiers_key unique nulls not distinct (scheme, value, banner_id)
);

comment on table public.product_identifiers is
  'Secondary codes only: alternate GTINs, store SKUs, in-store codes, PLUs. The primary GTIN is products.gtin.';

create index product_identifiers_product_idx on public.product_identifiers (product_id);
create index product_identifiers_banner_idx on public.product_identifiers (banner_id);
create index product_identifiers_source_idx on public.product_identifiers (source_id);
create index product_identifiers_ingestion_run_idx on public.product_identifiers (ingestion_run_id);
create index product_identifiers_raw_object_idx on public.product_identifiers (raw_object_id);

create trigger product_identifiers_set_updated_at
before update on public.product_identifiers
for each row execute function private.set_updated_at();

-- product_sources -----------------------------------------------------------

create table public.product_sources (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete restrict,
  external_id text not null check (char_length(external_id) between 1 and 200),
  source_url text check (source_url ~ '^https?://'),
  fetched_at timestamptz not null,
  last_seen_at timestamptz not null,
  content_hash bytea check (octet_length(content_hash) between 8 and 64),
  method text not null check (method in ('import', 'api', 'ai', 'manual', 'legacy-import', 'receipt', 'derived')),
  method_version text not null check (char_length(method_version) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_sources_seen_after_fetch check (last_seen_at >= fetched_at),
  constraint product_sources_key unique (source_id, external_id)
);

comment on table public.product_sources is
  'Extra source records for products with more than one contributing source. Admin only.';

create index product_sources_product_idx on public.product_sources (product_id);

create trigger product_sources_set_updated_at
before update on public.product_sources
for each row execute function private.set_updated_at();

-- Views (security_invoker: the base-table RLS applies) ----------------------

create view public.products_with_source_url
with (security_invoker = true)
as
select
  p.*,
  coalesce(p.source_url, replace(s.url_template, '{external_id}', p.external_id)) as resolved_source_url
from public.products p
join public.sources s on s.id = p.source_id;

comment on view public.products_with_source_url is
  'products plus resolved_source_url: the stored source_url, or the source''s url_template filled with external_id.';

-- One row per visible product. Brand and company columns are null when the link is missing or not approved.
-- ownership_path runs from the owner company up to the ultimate parent.
create view public.product_ownership_chain
with (security_invoker = true)
as
select
  p.id as product_id,
  p.name as product_name,
  p.gtin,
  b.id as brand_id,
  b.slug as brand_slug,
  b.name as brand_name,
  o.company_id as owner_company_id,
  o.company_slug as owner_company_slug,
  o.company_name as owner_company_name,
  o.relation as owner_relation,
  u.ultimate_parent_id,
  u.ultimate_parent_slug,
  u.ultimate_parent_name,
  u.depth as ownership_depth,
  u.path as ownership_path
from public.products p
left join public.brands b on b.id = p.brand_id
left join public.brand_current_owner o on o.brand_id = b.id
left join public.company_ultimate_parent u on u.company_id = o.company_id;

comment on view public.product_ownership_chain is
  'Product -> brand -> current owner -> ... -> ultimate parent, for the product screen (approved links only).';

-- Privileges and RLS --------------------------------------------------------

alter table public.categories enable row level security;
alter table public.category_mappings enable row level security;
alter table public.labels enable row level security;
alter table public.products enable row level security;
alter table public.product_identifiers enable row level security;
alter table public.product_sources enable row level security;

revoke all on table
  public.categories, public.category_mappings, public.labels, public.products, public.product_identifiers,
  public.product_sources, public.products_with_source_url, public.product_ownership_chain
from anon, authenticated;

grant select on table
  public.categories, public.category_mappings, public.labels, public.products, public.product_identifiers,
  public.products_with_source_url, public.product_ownership_chain
to anon, authenticated;
grant insert, update, delete on table
  public.categories, public.category_mappings, public.labels, public.products, public.product_identifiers
to authenticated;
grant select, insert, update, delete on table public.product_sources to authenticated;

-- Reads. Two select policies where a filter applies, because anon can't execute private.is_admin().
create policy products_select_anon on public.products for select to anon
  using (status = 'active');
create policy products_select_authenticated on public.products for select to authenticated
  using (status = 'active' or (select private.is_admin()));

create policy category_mappings_select_anon on public.category_mappings for select to anon
  using (review_status = 'approved');
create policy category_mappings_select_authenticated on public.category_mappings for select to authenticated
  using (review_status = 'approved' or (select private.is_admin()));

create policy categories_select_all on public.categories for select to anon, authenticated using (true);
create policy labels_select_all on public.labels for select to anon, authenticated using (true);
create policy product_identifiers_select_all on public.product_identifiers for select to anon, authenticated
  using (true);

-- Writes: admin only, one policy per command so reads keep a single permissive policy per role.
create policy categories_insert_admin on public.categories for insert to authenticated
  with check ((select private.is_admin()));
create policy categories_update_admin on public.categories for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy categories_delete_admin on public.categories for delete to authenticated
  using ((select private.is_admin()));

create policy category_mappings_insert_admin on public.category_mappings for insert to authenticated
  with check ((select private.is_admin()));
create policy category_mappings_update_admin on public.category_mappings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy category_mappings_delete_admin on public.category_mappings for delete to authenticated
  using ((select private.is_admin()));

create policy labels_insert_admin on public.labels for insert to authenticated
  with check ((select private.is_admin()));
create policy labels_update_admin on public.labels for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy labels_delete_admin on public.labels for delete to authenticated
  using ((select private.is_admin()));

create policy products_insert_admin on public.products for insert to authenticated
  with check ((select private.is_admin()));
create policy products_update_admin on public.products for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy products_delete_admin on public.products for delete to authenticated
  using ((select private.is_admin()));

create policy product_identifiers_insert_admin on public.product_identifiers for insert to authenticated
  with check ((select private.is_admin()));
create policy product_identifiers_update_admin on public.product_identifiers for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy product_identifiers_delete_admin on public.product_identifiers for delete to authenticated
  using ((select private.is_admin()));

-- product_sources: admin only.
create policy product_sources_admin on public.product_sources for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
