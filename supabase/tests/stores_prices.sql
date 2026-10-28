-- P2.6 RLS and constraint checks for the stores and prices domain.
-- Run the whole file with the supabase-dev MCP `execute_sql`. Everything happens inside one
-- transaction that is rolled back, so it leaves no rows behind. The last select lists every check;
-- each row must have ok = true.

begin;

create temp table results (n serial, check_name text not null, ok boolean not null, detail text);

do $$
declare
  v_admin constant uuid := '00000000-0000-4000-8000-00000000a001';
  v_user constant uuid := '00000000-0000-4000-8000-00000000a002';
  v_banner constant uuid := '00000000-0000-4000-8000-0000000b0001';
  v_s1 constant uuid := '00000000-0000-4000-8000-0000000f0001';
  v_s2 constant uuid := '00000000-0000-4000-8000-0000000f0002';
  v_s_rej constant uuid := '00000000-0000-4000-8000-0000000f0003';
  v_p constant uuid := '00000000-0000-4000-8000-0000000e0001';
  v_q constant uuid := '00000000-0000-4000-8000-0000000e0002';
  v_r constant uuid := '00000000-0000-4000-8000-0000000e0003';
  v_cat constant uuid := '00000000-0000-4000-8000-0000000ca001';
  v_listing_matched constant uuid := '00000000-0000-4000-8000-000000011001';
  v_listing_unmatched constant uuid := '00000000-0000-4000-8000-000000011002';
  v_stores constant uuid[] := array[v_s1, v_s2, v_s_rej];
  v_src uuid;
  v_receipts uuid;
  v_derived uuid;
  v_obs bigint;
  v_weekly_low bigint;
  v_row record;
  n bigint;
  state text;
  res text[] := '{}';
begin
  -- Fixtures (as the migration owner) ----------------------------------------
  insert into auth.users (id, email, aud, role)
  values (v_admin, 'rls-admin@test.invalid', 'authenticated', 'authenticated'),
         (v_user, 'rls-user@test.invalid', 'authenticated', 'authenticated');
  update public.profiles set role = 'admin' where id = v_admin;

  select id into v_src from public.sources where key = 'fixture';
  select id into v_receipts from public.sources where key = 'receipts';
  select id into v_derived from public.sources where key = 'derived';

  insert into public.banners (id, slug, name, source_id, fetched_at, method, method_version)
  values (v_banner, 'rls-banner', 'RLS Banner', v_src, now(), 'manual', 'manual@test');
  insert into public.stores (id, banner_id, slug, name, province, lat, lon, osm_type, osm_id, external_store_id, status,
                             source_id, fetched_at, method, method_version)
  values (v_s1, v_banner, 'rls-store-1', 'RLS Store 1', 'ON', 43.651070, -79.347015, 'node', 900000001, 'rls-1', 'active',
          v_src, now(), 'manual', 'manual@test'),
         (v_s2, null, 'rls-store-2', 'RLS Store 2', 'ON', null, null, 'way', 900000002, null, 'active',
          v_src, now(), 'manual', 'manual@test'),
         (v_s_rej, null, 'rls-store-rejected', 'RLS Rejected', null, null, null, null, null, null, 'rejected',
          v_src, now(), 'manual', 'manual@test');
  insert into public.categories (id, slug, name, level) values (v_cat, 'rls-pantry', 'RLS Pantry', 0);
  insert into public.products (id, external_id, name, source_id, fetched_at, method, method_version)
  values (v_p, 'rls-p', 'RLS Black Beans', v_src, now(), 'manual', 'manual@test'),
         (v_q, 'rls-q', 'RLS Member Only', v_src, now(), 'manual', 'manual@test'),
         (v_r, 'rls-r', 'RLS Receipt Only', v_src, now(), 'manual', 'manual@test');

  insert into public.store_listings (id, banner_id, external_sku, listing_name, size_text, product_id,
                                     first_seen_at, last_seen_at, source_id, fetched_at, method, method_version)
  values (v_listing_matched, v_banner, 'SKU-1', 'PC Black Beans', '540 mL', v_p, now(), now(),
          v_src, now(), 'manual', 'manual@test'),
         (v_listing_unmatched, v_banner, null, 'PC BLK BEAN', '540ML', null, now(), now(),
          v_src, now(), 'receipt', 'receipt@test');

  -- Store 1, product P: regular and sale on the same day, member a day later -> sale.
  -- Store 2, product P: old sale (Oct 15), regular confirmed later (Oct 20) -> regular.
  -- Store 1, product Q: member only -> no row.
  insert into public.price_observations (store_id, product_id, observed_on, last_confirmed_on, price, price_kind,
                                         source_id, external_id, source_url, fetched_at, method, method_version)
  values (v_s1, v_p, '2026-10-20', null, 5.00, 'regular', v_src, 'rls-o1', 'https://example.org/prices/rls-o1', now(), 'manual', 'manual@test'),
         (v_s1, v_p, '2026-10-20', null, 3.99, 'sale', v_src, 'rls-o2', null, now(), 'manual', 'manual@test'),
         (v_s1, v_p, '2026-10-21', null, 2.99, 'member', v_src, 'rls-o3', null, now(), 'manual', 'manual@test'),
         (v_s2, v_p, '2026-10-10', '2026-10-20', 4.50, 'regular', v_src, 'rls-o4', null, now(), 'manual', 'manual@test'),
         (v_s2, v_p, '2026-10-15', null, 3.50, 'sale', v_src, 'rls-o5', null, now(), 'manual', 'manual@test'),
         (v_s1, v_q, '2026-10-20', null, 1.99, 'member', v_src, 'rls-o6', null, now(), 'manual', 'manual@test');
  insert into public.price_observations (store_id, listing_id, observed_on, price, price_kind,
                                         source_id, fetched_at, method, method_version)
  values (v_s1, v_listing_unmatched, '2026-10-20', 10000, 'regular', v_src, now(), 'manual', 'manual@test')
  returning id into v_obs;

  insert into public.price_points_weekly (store_id, product_id, week_start, min_price, max_price, median_price,
                                          n_lines, n_receipts, source_id, fetched_at, method_version)
  values (v_s1, v_r, '2026-10-12', 2.00, 2.40, 2.20, 3, 2, v_receipts, now(), 'weekly@test');
  insert into public.price_points_weekly (store_id, product_id, week_start, min_price, max_price, median_price,
                                          n_lines, n_receipts, source_id, fetched_at, method_version)
  values (v_s2, v_r, '2026-10-12', 2.10, 2.10, 2.10, 1, 1, v_receipts, now(), 'weekly@test')
  returning id into v_weekly_low;

  insert into public.price_points_monthly (store_id, banner_id, product_id, month, min_price, max_price, avg_price, n,
                                           source_mix, source_id, fetched_at, method_version)
  values (null, v_banner, v_p, '2026-09-01', 3.50, 5.00, 4.25, 4, array['fixture'], v_derived, now(), 'monthly@test');
  insert into public.reference_prices (vector_id, product_label, unit, geography, ref_month, value, category_id,
                                       source_id, fetched_at, method, method_version)
  values ('v900000001', 'RLS beans, 540 grams', '540 grams', 'Ontario', '2026-09-01', 1.89, v_cat,
          v_src, now(), 'manual', 'manual@test');
  insert into public.price_sanity_bounds (category_id, unit_basis, min_unit_price, max_unit_price, basis)
  values (v_cat, 'g', 0.001, 0.05, 'manual');

  -- Constraints -------------------------------------------------------------
  res := res || format('a price of exactly 10,000 is accepted|%s|observation %s', v_obs is not null, v_obs);
  begin
    insert into public.price_observations (store_id, product_id, observed_on, price, source_id, fetched_at, method, method_version)
    values (v_s1, v_p, '2026-10-22', 0, v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('a price of 0 rejected|%s|%s', state = '23514', state);
  begin
    insert into public.price_observations (store_id, product_id, observed_on, price, source_id, fetched_at, method, method_version)
    values (v_s1, v_p, '2026-10-22', 10001, v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('a price of 10,001 rejected|%s|%s', state = '23514', state);
  begin
    insert into public.price_observations (store_id, observed_on, price, source_id, fetched_at, method, method_version)
    values (v_s1, '2026-10-22', 1, v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('observation with neither product nor listing rejected|%s|%s', state = '23514', state);
  begin
    insert into public.price_observations (store_id, product_id, observed_on, price, source_id, external_id, fetched_at, method, method_version)
    values (v_s1, v_p, '2026-10-22', 1, v_src, 'rls-o1', now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('duplicate (source_id, external_id) rejected|%s|%s', state = '23505', state);
  begin
    insert into public.price_observations (store_id, product_id, observed_on, last_confirmed_on, price, source_id, fetched_at, method, method_version)
    values (v_s1, v_p, '2026-10-22', '2026-10-21', 1, v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('last_confirmed_on before observed_on rejected|%s|%s', state = '23514', state);
  begin
    insert into public.price_observations (store_id, product_id, observed_on, price, price_without_discount, source_id, fetched_at, method, method_version)
    values (v_s1, v_p, '2026-10-22', 5, 4, v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('price_without_discount below price rejected|%s|%s', state = '23514', state);
  begin
    insert into public.price_observations (store_id, product_id, observed_on, price, source_id, fetched_at, method, method_version)
    values (v_s1, v_p, '2026-10-22', 1, v_src, now(), 'receipt', 'receipt@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('receipt method on an observation rejected|%s|%s', state = '23514', state);
  begin
    insert into public.price_points_weekly (store_id, product_id, week_start, min_price, max_price, median_price,
                                            n_lines, n_receipts, source_id, fetched_at, method_version)
    values (v_s1, v_p, '2026-10-13', 1, 1, 1, 2, 2, v_receipts, now(), 'weekly@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('weekly point not starting on a Monday rejected|%s|%s', state = '23514', state);
  begin
    insert into public.price_points_weekly (store_id, product_id, week_start, min_price, max_price, median_price,
                                            n_lines, n_receipts, source_id, fetched_at, method_version)
    values (v_s1, v_p, '2026-10-19', 3, 4, 2, 2, 2, v_receipts, now(), 'weekly@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('weekly median below min rejected|%s|%s', state = '23514', state);
  begin
    insert into public.store_listings (banner_id, external_sku, listing_name, first_seen_at, last_seen_at,
                                       source_id, fetched_at, method, method_version)
    values (v_banner, 'SKU-1', 'Other name', now(), now(), v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('duplicate SKU at a banner rejected|%s|%s', state = '23505', state);
  begin
    insert into public.store_listings (banner_id, listing_name, size_text, first_seen_at, last_seen_at,
                                       source_id, fetched_at, method, method_version)
    values (v_banner, 'pc  blk bean', '540ml', now(), now(), v_src, now(), 'receipt', 'receipt@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('same normalized name + size without a SKU rejected|%s|%s', state = '23505', state);
  insert into public.store_listings (banner_id, listing_name, size_text, first_seen_at, last_seen_at,
                                     source_id, fetched_at, method, method_version)
  values (v_banner, 'PC BLK BEAN', '540ML', now(), now(), v_src, now(), 'receipt', 'receipt@test')
  on conflict (banner_id, listing_key) where external_sku is null do nothing;
  get diagnostics n = row_count;
  res := res || format('on conflict on the partial name key inserts nothing|%s|%s rows', n = 0, n);
  select listing_key into v_row from public.store_listings where id = v_listing_unmatched;
  res := res || format('listing_key is the normalized name + size|%s|%s', v_row.listing_key = 'pc blk bean 540ml', v_row.listing_key);
  begin
    insert into public.stores (slug, name, osm_type, source_id, fetched_at, method, method_version)
    values ('rls-osm-half', 'Half OSM key', 'node', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('osm_type without osm_id rejected|%s|%s', state = '23514', state);
  begin
    insert into public.stores (slug, name, osm_type, osm_id, source_id, fetched_at, method, method_version)
    values ('rls-osm-dup', 'Duplicate OSM', 'node', 900000001, v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('duplicate OSM key rejected|%s|%s', state = '23505', state);
  begin
    insert into public.stores (slug, name, external_store_id, source_id, fetched_at, method, method_version)
    values ('rls-no-banner', 'No banner', 'x-1', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('external_store_id without a banner rejected|%s|%s', state = '23514', state);
  begin
    insert into public.price_points_monthly (store_id, banner_id, product_id, month, min_price, max_price, avg_price, n,
                                             source_id, fetched_at, method_version)
    values (null, v_banner, v_p, '2026-09-01', 1, 1, 1, 1, v_derived, now(), 'monthly@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('duplicate banner-level monthly row rejected (nulls not distinct)|%s|%s', state = '23505', state);
  begin
    insert into public.reference_prices (vector_id, product_label, geography, ref_month, value, source_id, fetched_at, method, method_version)
    values ('v900000002', 'Bad month', 'Canada', '2026-09-15', 1, v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('reference price not on the first of the month rejected|%s|%s', state = '23514', state);
  begin
    insert into public.price_sanity_bounds (category_id, unit_basis, min_unit_price, max_unit_price, basis)
    values (v_cat, 'ml', 0.05, 0.01, 'manual');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('sanity bounds with max below min rejected|%s|%s', state = '23514', state);

  -- Views (as owner) --------------------------------------------------------
  select * into v_row from public.current_prices where store_id = v_s1 and product_id = v_p;
  res := res || format('current_prices: sale beats regular, member ignored|%s|%s %s',
    v_row.effective_price = 3.99 and v_row.price_kind = 'sale', v_row.effective_price, v_row.price_kind);
  select * into v_row from public.current_prices where store_id = v_s2 and product_id = v_p;
  res := res || format('current_prices: a regular confirmed after an old sale wins|%s|%s %s as of %s',
    v_row.effective_price = 4.50 and v_row.price_kind = 'regular' and v_row.as_of = '2026-10-20',
    v_row.effective_price, v_row.price_kind, v_row.as_of);
  select count(*) into n from public.current_prices where product_id = v_q;
  res := res || format('current_prices: member-only product has no row|%s|%s rows', n = 0, n);
  select count(*) into n from public.current_prices where product_id = v_r;
  res := res || format('current_prices (owner): both weekly points|%s|%s rows', n = 2, n);

  select resolved_source_url as url into v_row from public.price_observations_with_source_url where external_id = 'rls-o1';
  res := res || format('price_observations_with_source_url: a stored URL wins|%s|%s',
    v_row.url = 'https://example.org/prices/rls-o1', v_row.url);
  update public.sources set url_template = 'https://example.org/p/{external_id}' where id = v_src;
  select resolved_source_url as url into v_row from public.price_observations_with_source_url where external_id = 'rls-o2';
  res := res || format('price_observations_with_source_url rebuilds from url_template|%s|%s',
    v_row.url = 'https://example.org/p/rls-o2', v_row.url);

  -- anon --------------------------------------------------------------------
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);

  select count(*) into n from public.stores where id = any (v_stores);
  res := res || format('anon sees 2 stores, not the rejected one|%s|%s rows', n = 2, n);
  select count(*) into n from public.store_listings where id in (v_listing_matched, v_listing_unmatched);
  res := res || format('anon sees the matched listing only|%s|%s rows', n = 1, n);
  select count(*) into n from public.price_points_weekly where id = v_weekly_low;
  res := res || format('anon does not see a weekly point with n_receipts = 1|%s|%s rows', n = 0, n);
  select count(*) into n from public.current_prices where product_id = v_r;
  res := res || format('anon current_prices shows only the n_receipts >= 2 weekly point|%s|%s rows', n = 1, n);
  select * into v_row from public.current_prices where store_id = v_s1 and product_id = v_p;
  res := res || format('anon current_prices for P at store 1 is the sale|%s|%s %s',
    v_row.effective_price = 3.99 and v_row.price_kind = 'sale', v_row.effective_price, v_row.price_kind);
  select (select count(*) from public.price_observations where store_id = any (v_stores))
       + (select count(*) from public.price_points_monthly where product_id = v_p)
       + (select count(*) from public.reference_prices where vector_id = 'v900000001') into n;
  res := res || format('anon reads observations, monthly points and reference prices|%s|%s rows (7 + 1 + 1)', n = 9, n);
  begin
    select count(*) into n from public.price_sanity_bounds;
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('anon cannot read price_sanity_bounds|%s|%s', state = '42501', state);
  begin
    insert into public.price_observations (store_id, product_id, observed_on, price, source_id, fetched_at, method, method_version)
    values (v_s1, v_p, '2026-10-22', 1, v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('anon cannot insert observations|%s|%s', state = '42501', state);

  reset role;

  -- authenticated, not an admin ----------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  select count(*) into n from public.store_listings where id = v_listing_unmatched;
  res := res || format('user does not see the unmatched listing|%s|%s rows', n = 0, n);
  select count(*) into n from public.price_points_weekly where id = v_weekly_low;
  res := res || format('user does not see the n_receipts = 1 weekly point|%s|%s rows', n = 0, n);
  select count(*) into n from public.price_sanity_bounds;
  res := res || format('user sees no sanity bounds|%s|%s rows', n = 0, n);
  begin
    insert into public.price_observations (store_id, product_id, observed_on, price, source_id, fetched_at, method, method_version)
    values (v_s1, v_p, '2026-10-22', 1, v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('user cannot insert observations|%s|%s', state = '42501', state);
  update public.stores set name = 'Hacked' where id = v_s1;
  get diagnostics n = row_count;
  res := res || format('user cannot update stores|%s|%s rows updated', n = 0, n);
  delete from public.price_points_monthly where product_id = v_p;
  get diagnostics n = row_count;
  res := res || format('user cannot delete monthly points|%s|%s rows deleted', n = 0, n);

  reset role;

  -- admin -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select (select count(*) from public.stores where id = any (v_stores))
       + (select count(*) from public.store_listings where id = v_listing_unmatched)
       + (select count(*) from public.price_points_weekly where id = v_weekly_low)
       + (select count(*) from public.price_sanity_bounds where category_id = v_cat) into n;
  res := res || format('admin sees all stores, the unmatched listing, the low weekly point and the bounds|%s|%s rows (3 + 1 + 1 + 1)', n = 6, n);
  insert into public.price_observations (store_id, product_id, observed_on, price, price_kind, source_id, fetched_at, method, method_version)
  values (v_s1, v_p, '2026-10-22', 4.79, 'regular', v_src, now(), 'manual', 'manual@admin-ui');
  get diagnostics n = row_count;
  res := res || format('admin inserts an observation|%s|%s rows', n = 1, n);
  select * into v_row from public.current_prices where store_id = v_s1 and product_id = v_p;
  res := res || format('a newer regular replaces the older sale|%s|%s %s',
    v_row.effective_price = 4.79 and v_row.price_kind = 'regular', v_row.effective_price, v_row.price_kind);
  update public.store_listings set product_id = v_p where id = v_listing_unmatched;
  get diagnostics n = row_count;
  res := res || format('admin matches a listing|%s|%s rows', n = 1, n);
  update public.price_sanity_bounds set max_unit_price = 0.06 where category_id = v_cat;
  get diagnostics n = row_count;
  res := res || format('admin updates sanity bounds|%s|%s rows', n = 1, n);
  delete from public.price_points_weekly where id = v_weekly_low;
  get diagnostics n = row_count;
  res := res || format('admin deletes a weekly point|%s|%s rows', n = 1, n);

  reset role;

  insert into results (check_name, ok, detail)
  select split_part(r, '|', 1), split_part(r, '|', 2)::boolean, split_part(r, '|', 3) from unnest(res) as r;
end;
$$;

select n, check_name, ok, detail from results order by n;

rollback;
