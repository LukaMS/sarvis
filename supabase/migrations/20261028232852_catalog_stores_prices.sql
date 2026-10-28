-- P2.6 Catalog schema, domain 5: stores and prices (DATA_MODEL §3.4 without banners, views from §4; D-036).
-- stores, store_listings, price_observations, price_points_weekly, price_points_monthly, reference_prices,
-- price_sanity_bounds; views current_prices and price_observations_with_source_url.
-- Public read (filtered where noted), admin write; price_sanity_bounds is admin only.
-- Pipeline jobs write with the service role (bypasses RLS).

-- stores --------------------------------------------------------------------

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  banner_id uuid references public.banners (id) on delete restrict,
  slug public.slug not null unique,
  name text not null check (char_length(name) between 1 and 200),
  address text check (char_length(address) between 1 and 300),
  city text check (char_length(city) between 1 and 100),
  province char(2) check (province ~ '^[A-Z]{2}$'),
  postal_code text check (char_length(postal_code) between 3 and 12),
  lat numeric(9, 6) check (lat between -90 and 90),
  lon numeric(9, 6) check (lon between -180 and 180),
  osm_type text check (osm_type in ('node', 'way', 'relation')),
  osm_id bigint check (osm_id > 0),
  external_store_id text check (char_length(external_store_id) between 1 and 100),
  status text not null default 'active' check (status in ('active', 'closed', 'rejected')),
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
  constraint stores_lat_lon_pair check ((lat is null) = (lon is null)),
  constraint stores_osm_pair check ((osm_type is null) = (osm_id is null)),
  constraint stores_external_id_needs_banner check (external_store_id is null or banner_id is not null),
  constraint stores_osm_key unique (osm_type, osm_id),
  constraint stores_banner_external_key unique (banner_id, external_store_id)
);

comment on table public.stores is
  'Physical stores. Keys: (osm_type, osm_id) when known, else (banner_id, external_store_id), else slug (DATA_MODEL §1.1).';
comment on column public.stores.banner_id is 'Null when the banner is unknown (some Open Prices locations).';

create index stores_source_idx on public.stores (source_id);
create index stores_ingestion_run_idx on public.stores (ingestion_run_id);
create index stores_raw_object_idx on public.stores (raw_object_id);

create trigger stores_set_updated_at
before update on public.stores
for each row execute function private.set_updated_at();

-- store_listings ------------------------------------------------------------

create table public.store_listings (
  id uuid primary key default gen_random_uuid(),
  banner_id uuid not null references public.banners (id) on delete cascade,
  external_sku text check (char_length(external_sku) between 1 and 100),
  listing_name text not null check (char_length(listing_name) between 1 and 300),
  size_text text check (char_length(size_text) between 1 and 100),
  listing_key text generated always as (
    public.normalize_match_text(listing_name || coalesce(' ' || size_text, ''))
  ) stored,
  product_id uuid references public.products (id) on delete set null,
  match_candidate_id bigint references public.match_candidates (id) on delete set null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  is_active boolean not null default true,
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
  constraint store_listings_seen_order check (last_seen_at >= first_seen_at)
);

comment on table public.store_listings is
  'How a banner names or codes a product (store SKU, receipt abbreviation). Unmatched listings are admin only (receipt text).';
comment on column public.store_listings.listing_key is
  'normalize_match_text(listing_name + size_text). The key when there is no SKU.';

-- Partial keys: the SKU when known, else the normalized name + size. On conflict targets must repeat the predicate.
create unique index store_listings_sku_key on public.store_listings (banner_id, external_sku)
  where external_sku is not null;
create unique index store_listings_name_key on public.store_listings (banner_id, listing_key)
  where external_sku is null;
create index store_listings_name_trgm_idx on public.store_listings
  using gin (public.normalize_match_text(listing_name) extensions.gin_trgm_ops);
create index store_listings_product_idx on public.store_listings (product_id);
create index store_listings_match_candidate_idx on public.store_listings (match_candidate_id);
create index store_listings_source_idx on public.store_listings (source_id);
create index store_listings_ingestion_run_idx on public.store_listings (ingestion_run_id);
create index store_listings_raw_object_idx on public.store_listings (raw_object_id);

create trigger store_listings_set_updated_at
before update on public.store_listings
for each row execute function private.set_updated_at();

-- price_observations --------------------------------------------------------

create table public.price_observations (
  id bigint generated always as identity primary key,
  external_id text check (char_length(external_id) between 1 and 200),
  store_id uuid not null references public.stores (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  listing_id uuid references public.store_listings (id) on delete cascade,
  observed_on date not null,
  last_confirmed_on date,
  price numeric(10, 2) not null check (price > 0 and price <= 10000),
  currency char(3) not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  price_kind text not null default 'unknown' check (price_kind in ('regular', 'sale', 'member', 'unknown')),
  is_discounted boolean not null default false,
  price_without_discount numeric(10, 2) check (price_without_discount > 0 and price_without_discount <= 10000),
  price_per text check (price_per in ('unit', 'kg', 'lb')),
  unit_price numeric(12, 5) check (unit_price > 0),
  unit_basis text check (unit_basis in ('g', 'ml', 'ct')),
  -- +prov
  source_id uuid not null references public.sources (id) on delete restrict,
  source_url text check (source_url ~ '^https?://'),
  fetched_at timestamptz not null,
  method text not null check (method in ('import', 'api', 'manual')),
  method_version text not null check (char_length(method_version) between 1 and 200),
  ingestion_run_id uuid references public.ingestion_runs (id) on delete set null,
  raw_object_id uuid references public.raw_objects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_observations_subject check (product_id is not null or listing_id is not null),
  constraint price_observations_confirmed_order check (last_confirmed_on is null or last_confirmed_on >= observed_on),
  constraint price_observations_undiscounted check (price_without_discount is null or price_without_discount >= price),
  constraint price_observations_unit_pair check ((unit_price is null) = (unit_basis is null)),
  constraint price_observations_source_key unique (source_id, external_id)
);

comment on table public.price_observations is
  'Point prices from non-receipt sources (Open Prices, manual). Append on change: an unchanged reading updates last_confirmed_on.';
comment on column public.price_observations.price_kind is
  'regular | sale | member | unknown. member prices are never the effective price (current_prices).';
comment on column public.price_observations.unit_price is 'Price per base unit (unit_basis g, ml or ct).';

create index price_observations_store_product_idx
  on public.price_observations (store_id, product_id, observed_on desc);
create index price_observations_product_idx on public.price_observations (product_id);
create index price_observations_listing_idx on public.price_observations (listing_id);
create index price_observations_ingestion_run_idx on public.price_observations (ingestion_run_id);
create index price_observations_raw_object_idx on public.price_observations (raw_object_id);

create trigger price_observations_set_updated_at
before update on public.price_observations
for each row execute function private.set_updated_at();

-- price_points_weekly -------------------------------------------------------

create table public.price_points_weekly (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  min_price numeric(10, 2) not null check (min_price > 0 and min_price <= 10000),
  max_price numeric(10, 2) not null check (max_price > 0 and max_price <= 10000),
  median_price numeric(10, 2) not null check (median_price > 0 and median_price <= 10000),
  n_lines integer not null check (n_lines >= 1),
  n_receipts integer not null check (n_receipts >= 1),
  source_id uuid not null references public.sources (id) on delete restrict,
  fetched_at timestamptz not null,
  method text not null default 'derived' check (method = 'derived'),
  method_version text not null check (char_length(method_version) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_points_weekly_order check (min_price <= median_price and median_price <= max_price),
  constraint price_points_weekly_counts check (n_receipts <= n_lines),
  constraint price_points_weekly_key unique (store_id, product_id, week_start)
);

comment on table public.price_points_weekly is
  'Receipt-derived weekly prices, aggregated (never individual lines). Public only where n_receipts >= 2. Kept 90 days.';
comment on column public.price_points_weekly.week_start is 'ISO week start (Monday).';
comment on column public.price_points_weekly.fetched_at is 'When the aggregate was built.';

create index price_points_weekly_product_idx on public.price_points_weekly (product_id);
create index price_points_weekly_source_idx on public.price_points_weekly (source_id);

create trigger price_points_weekly_set_updated_at
before update on public.price_points_weekly
for each row execute function private.set_updated_at();

-- price_points_monthly ------------------------------------------------------

create table public.price_points_monthly (
  id bigint generated always as identity primary key,
  store_id uuid references public.stores (id) on delete cascade,
  banner_id uuid references public.banners (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  min_price numeric(10, 2) not null check (min_price > 0 and min_price <= 10000),
  max_price numeric(10, 2) not null check (max_price > 0 and max_price <= 10000),
  avg_price numeric(10, 2) not null check (avg_price > 0 and avg_price <= 10000),
  n integer not null check (n >= 1),
  source_mix text[] not null default '{}' check (array_position(source_mix, null) is null),
  source_id uuid not null references public.sources (id) on delete restrict,
  fetched_at timestamptz not null,
  method text not null default 'derived' check (method = 'derived'),
  method_version text not null check (char_length(method_version) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_points_monthly_scope check (store_id is not null or banner_id is not null),
  constraint price_points_monthly_order check (min_price <= avg_price and avg_price <= max_price),
  -- nulls not distinct = the DATA_MODEL coalesce(store_id) key, usable as an on conflict target.
  constraint price_points_monthly_key unique nulls not distinct (store_id, banner_id, product_id, month)
);

comment on table public.price_points_monthly is
  'Rollup of observations and weekly points older than 90 days: per store for 12 months, then per banner (store_id null).';
comment on column public.price_points_monthly.source_mix is 'Keys of the sources rolled up, e.g. {open-prices,receipts}.';

create index price_points_monthly_banner_idx on public.price_points_monthly (banner_id);
create index price_points_monthly_product_idx on public.price_points_monthly (product_id);
create index price_points_monthly_source_idx on public.price_points_monthly (source_id);

create trigger price_points_monthly_set_updated_at
before update on public.price_points_monthly
for each row execute function private.set_updated_at();

-- reference_prices ----------------------------------------------------------

create table public.reference_prices (
  id bigint generated always as identity primary key,
  vector_id text not null check (vector_id ~ '^v[0-9]+$'),
  product_label text not null check (char_length(product_label) between 1 and 300),
  unit text check (char_length(unit) between 1 and 100),
  geography text not null check (char_length(geography) between 1 and 100),
  ref_month date not null check (extract(day from ref_month) = 1),
  value numeric(10, 2) not null check (value > 0 and value <= 10000),
  category_id uuid references public.categories (id) on delete set null,
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
  constraint reference_prices_key unique (vector_id, ref_month)
);

comment on table public.reference_prices is
  'Statistics Canada 18-10-0245-01 monthly average retail prices (S6), for sanity checks and context.';
comment on column public.reference_prices.vector_id is 'StatCan vector, e.g. v1234567 (one product x geography series).';

create index reference_prices_category_idx on public.reference_prices (category_id);
create index reference_prices_source_idx on public.reference_prices (source_id);
create index reference_prices_ingestion_run_idx on public.reference_prices (ingestion_run_id);
create index reference_prices_raw_object_idx on public.reference_prices (raw_object_id);

create trigger reference_prices_set_updated_at
before update on public.reference_prices
for each row execute function private.set_updated_at();

-- price_sanity_bounds -------------------------------------------------------

create table public.price_sanity_bounds (
  id bigint generated always as identity primary key,
  category_id uuid not null references public.categories (id) on delete cascade,
  unit_basis text not null check (unit_basis in ('g', 'ml', 'ct')),
  min_unit_price numeric(12, 5) not null check (min_unit_price > 0),
  max_unit_price numeric(12, 5) not null,
  basis text not null check (basis in ('statcan', 'observed_p01_p99', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_sanity_bounds_order check (max_unit_price > min_unit_price),
  constraint price_sanity_bounds_key unique (category_id, unit_basis)
);

comment on table public.price_sanity_bounds is
  'Unit-price bounds per category and unit basis for validation. A manual row is an admin override. Admin only.';

create trigger price_sanity_bounds_set_updated_at
before update on public.price_sanity_bounds
for each row execute function private.set_updated_at();

-- Views (security_invoker: the base-table RLS applies) ----------------------

create view public.price_observations_with_source_url
with (security_invoker = true)
as
select
  o.*,
  coalesce(o.source_url, replace(s.url_template, '{external_id}', o.external_id)) as resolved_source_url
from public.price_observations o
join public.sources s on s.id = o.source_id;

comment on view public.price_observations_with_source_url is
  'price_observations plus resolved_source_url: the stored source_url, or the source''s url_template filled with external_id.';

-- Effective price per store x product (legacy rule, DATA_MODEL §3.4): the newest reading wins; on the same day
-- a sale beats a regular or unknown price, which beats a receipt median. Member prices never count.
-- Weekly receipt points count from the last day of their week and are only visible where n_receipts >= 2.
create view public.current_prices
with (security_invoker = true)
as
with candidates as (
  select
    o.store_id,
    o.product_id,
    o.price,
    o.currency,
    o.price_kind,
    'observation'::text as origin,
    coalesce(o.last_confirmed_on, o.observed_on) as as_of,
    o.unit_price,
    o.unit_basis,
    o.source_id,
    o.fetched_at,
    o.id as observation_id,
    null::bigint as weekly_id,
    case o.price_kind when 'sale' then 0 else 1 end as rank_kind
  from public.price_observations o
  where o.product_id is not null
    and o.price_kind <> 'member'
  union all
  select
    w.store_id,
    w.product_id,
    w.median_price,
    'CAD'::char(3),
    'receipt_median'::text,
    'receipt_weekly'::text,
    w.week_start + 6,
    null::numeric,
    null::text,
    w.source_id,
    w.fetched_at,
    null::bigint,
    w.id,
    2
  from public.price_points_weekly w
)
select distinct on (store_id, product_id)
  store_id,
  product_id,
  price as effective_price,
  currency,
  price_kind,
  origin,
  as_of,
  unit_price,
  unit_basis,
  source_id,
  fetched_at,
  observation_id,
  weekly_id
from candidates
order by store_id, product_id, as_of desc, rank_kind, fetched_at desc;

comment on view public.current_prices is
  'One effective price per store x product: newest reading; same day, sale > regular/unknown > receipt median; never member.';

-- Privileges and RLS --------------------------------------------------------

alter table public.stores enable row level security;
alter table public.store_listings enable row level security;
alter table public.price_observations enable row level security;
alter table public.price_points_weekly enable row level security;
alter table public.price_points_monthly enable row level security;
alter table public.reference_prices enable row level security;
alter table public.price_sanity_bounds enable row level security;

revoke all on table
  public.stores, public.store_listings, public.price_observations, public.price_points_weekly,
  public.price_points_monthly, public.reference_prices, public.price_sanity_bounds,
  public.price_observations_with_source_url, public.current_prices
from anon, authenticated;

grant select on table
  public.stores, public.store_listings, public.price_observations, public.price_points_weekly,
  public.price_points_monthly, public.reference_prices,
  public.price_observations_with_source_url, public.current_prices
to anon, authenticated;
grant insert, update, delete on table
  public.stores, public.store_listings, public.price_observations, public.price_points_weekly,
  public.price_points_monthly, public.reference_prices
to authenticated;
grant select, insert, update, delete on table public.price_sanity_bounds to authenticated;

-- Reads. Two select policies where a filter applies, because anon can't execute private.is_admin().
create policy stores_select_anon on public.stores for select to anon
  using (status <> 'rejected');
create policy stores_select_authenticated on public.stores for select to authenticated
  using (status <> 'rejected' or (select private.is_admin()));

create policy store_listings_select_anon on public.store_listings for select to anon
  using (product_id is not null);
create policy store_listings_select_authenticated on public.store_listings for select to authenticated
  using (product_id is not null or (select private.is_admin()));

create policy price_points_weekly_select_anon on public.price_points_weekly for select to anon
  using (n_receipts >= 2);
create policy price_points_weekly_select_authenticated on public.price_points_weekly for select to authenticated
  using (n_receipts >= 2 or (select private.is_admin()));

create policy price_observations_select_all on public.price_observations for select to anon, authenticated
  using (true);
create policy price_points_monthly_select_all on public.price_points_monthly for select to anon, authenticated
  using (true);
create policy reference_prices_select_all on public.reference_prices for select to anon, authenticated
  using (true);

-- Writes: admin only, one policy per command so reads keep a single permissive policy per role.
create policy stores_insert_admin on public.stores for insert to authenticated
  with check ((select private.is_admin()));
create policy stores_update_admin on public.stores for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy stores_delete_admin on public.stores for delete to authenticated
  using ((select private.is_admin()));

create policy store_listings_insert_admin on public.store_listings for insert to authenticated
  with check ((select private.is_admin()));
create policy store_listings_update_admin on public.store_listings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy store_listings_delete_admin on public.store_listings for delete to authenticated
  using ((select private.is_admin()));

create policy price_observations_insert_admin on public.price_observations for insert to authenticated
  with check ((select private.is_admin()));
create policy price_observations_update_admin on public.price_observations for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy price_observations_delete_admin on public.price_observations for delete to authenticated
  using ((select private.is_admin()));

create policy price_points_weekly_insert_admin on public.price_points_weekly for insert to authenticated
  with check ((select private.is_admin()));
create policy price_points_weekly_update_admin on public.price_points_weekly for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy price_points_weekly_delete_admin on public.price_points_weekly for delete to authenticated
  using ((select private.is_admin()));

create policy price_points_monthly_insert_admin on public.price_points_monthly for insert to authenticated
  with check ((select private.is_admin()));
create policy price_points_monthly_update_admin on public.price_points_monthly for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy price_points_monthly_delete_admin on public.price_points_monthly for delete to authenticated
  using ((select private.is_admin()));

create policy reference_prices_insert_admin on public.reference_prices for insert to authenticated
  with check ((select private.is_admin()));
create policy reference_prices_update_admin on public.reference_prices for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy reference_prices_delete_admin on public.reference_prices for delete to authenticated
  using ((select private.is_admin()));

-- price_sanity_bounds: admin only.
create policy price_sanity_bounds_admin on public.price_sanity_bounds for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
