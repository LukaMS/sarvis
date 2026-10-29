-- P2.5 RLS and constraint checks for the products domain.
-- Run the whole file with the supabase-dev MCP `execute_sql`. Everything happens inside one
-- transaction that is rolled back, so it leaves no rows behind. The last select lists every check;
-- each row must have ok = true.
--
-- GTIN test vectors: the TS twin in packages/core (P2.10) must give the same answers for the same inputs.

begin;

create temp table results (n serial, check_name text not null, ok boolean not null, detail text);

do $$
declare
  v_admin constant uuid := '00000000-0000-4000-8000-00000000a001';
  v_user constant uuid := '00000000-0000-4000-8000-00000000a002';
  -- Companies: A owns B owns C; brand X is owned by C.
  v_a constant uuid := '00000000-0000-4000-8000-0000000c000a';
  v_b constant uuid := '00000000-0000-4000-8000-0000000c000b';
  v_c constant uuid := '00000000-0000-4000-8000-0000000c000c';
  v_x constant uuid := '00000000-0000-4000-8000-0000000d0001';
  v_banner1 constant uuid := '00000000-0000-4000-8000-0000000b0001';
  v_banner2 constant uuid := '00000000-0000-4000-8000-0000000b0002';
  v_cat_root constant uuid := '00000000-0000-4000-8000-0000000ca001';
  v_cat_child constant uuid := '00000000-0000-4000-8000-0000000ca002';
  -- Products: P active (brand X, OFF), Q active (no brand, manual, stored URL), R rejected, S discontinued.
  v_p constant uuid := '00000000-0000-4000-8000-0000000e0001';
  v_q constant uuid := '00000000-0000-4000-8000-0000000e0002';
  v_r constant uuid := '00000000-0000-4000-8000-0000000e0003';
  v_s constant uuid := '00000000-0000-4000-8000-0000000e0004';
  v_products constant uuid[] := array[v_p, v_q, v_r, v_s];
  v_src uuid;
  v_off uuid;
  v_manual uuid;
  v_pending_map bigint;
  v_approved_map bigint;
  v_ident bigint;
  v_row record;
  v_bad text[];
  n bigint;
  state text;
  res text[] := '{}';
begin
  -- GTIN helpers ------------------------------------------------------------
  select coalesce(array_agg(format('%s:%s', t.code, t.expected)), '{}') into v_bad
  from (values
    ('036000291452', true), ('4006381333931', true), ('96385074', true), ('10012345678902', true),
    ('00036000291452', true),
    ('036000291453', false), ('4006381333932', false), ('96385075', false), ('10012345678903', false),
    ('03600029145A', false), ('03600029145', false), ('123456789012345', false), ('', false),
    (' 036000291452', false)
  ) as t (code, expected)
  where public.gtin_is_valid(t.code) is distinct from t.expected;
  res := res || format('gtin_is_valid matches the 14 vectors|%s|failures %s', cardinality(v_bad) = 0, v_bad);

  select coalesce(array_agg(format('%s:%s', t.code, t.expected)), '{}') into v_bad
  from (values
    ('036000291452', '00036000291452'), ('4006381333931', '04006381333931'), ('96385074', '00000096385074'),
    ('10012345678902', '10012345678902'), ('036000291453', null), ('ABC', null)
  ) as t (code, expected)
  where public.gtin_normalize(t.code) is distinct from t.expected;
  res := res || format('gtin_normalize matches the 6 vectors|%s|failures %s', cardinality(v_bad) = 0, v_bad);

  select coalesce(array_agg(format('%s:%s', t.code, t.expected)), '{}') into v_bad
  from (values
    ('2012345678903', true), ('212345678909', true), ('0223456789019', true), ('02012345678903', true),
    ('036000291452', false), ('4006381333931', false), ('2012345678904', false)
  ) as t (code, expected)
  where public.gtin_is_restricted(t.code) is distinct from t.expected;
  res := res || format('gtin_is_restricted matches the 7 vectors|%s|failures %s', cardinality(v_bad) = 0, v_bad);

  -- Fixtures (as the migration owner) ----------------------------------------
  insert into auth.users (id, email, aud, role)
  values (v_admin, 'rls-admin@test.invalid', 'authenticated', 'authenticated'),
         (v_user, 'rls-user@test.invalid', 'authenticated', 'authenticated');
  update public.profiles set role = 'admin' where id = v_admin;

  select id into v_src from public.sources where key = 'fixture';
  select id into v_off from public.sources where key = 'off';
  select id into v_manual from public.sources where key = 'manual';

  insert into public.companies (id, slug, name, source_id, fetched_at, method, method_version)
  values (v_a, 'rls-a', 'RLS A Holdings', v_src, now(), 'manual', 'manual@test'),
         (v_b, 'rls-b', 'RLS B Foods', v_src, now(), 'manual', 'manual@test'),
         (v_c, 'rls-c', 'RLS C Dairy', v_src, now(), 'manual', 'manual@test');
  insert into public.company_ownership
    (parent_company_id, child_company_id, relation, review_status, reviewed_at, decision_method,
     source_id, fetched_at, method, method_version)
  values (v_a, v_b, 'subsidiary', 'approved', now(), 'admin', v_src, now(), 'manual', 'manual@test'),
         (v_b, v_c, 'subsidiary', 'approved', now(), 'admin', v_src, now(), 'manual', 'manual@test');
  insert into public.brands (id, slug, name, source_id, fetched_at, method, method_version)
  values (v_x, 'rls-x', 'RLS X', v_src, now(), 'manual', 'manual@test');
  insert into public.brand_ownership
    (brand_id, company_id, relation, review_status, reviewed_at, decision_method,
     source_id, fetched_at, method, method_version)
  values (v_x, v_c, 'owner', 'approved', now(), 'admin', v_src, now(), 'manual', 'manual@test');
  insert into public.banners (id, slug, name, source_id, fetched_at, method, method_version)
  values (v_banner1, 'rls-banner-1', 'RLS Banner 1', v_src, now(), 'manual', 'manual@test'),
         (v_banner2, 'rls-banner-2', 'RLS Banner 2', v_src, now(), 'manual', 'manual@test');

  insert into public.categories (id, slug, name, parent_id, level)
  values (v_cat_root, 'rls-dairy', 'RLS Dairy', null, 0),
         (v_cat_child, 'rls-dairy/milk', 'RLS Milk', v_cat_root, 1);

  insert into public.products
    (id, gtin, external_id, name, brand_id, brand_text, category_id, quantity_text, net_quantity, net_unit,
     unit_parse_status, label_codes, status, source_id, fetched_at, method, method_version)
  values
    (v_p, '00036000291452', '0036000291452', 'RLS Oat Milk', v_x, 'RLS X', v_cat_child, '1.75 L', 1750, 'ml',
     'ok', array[1, 2]::smallint[], 'active', v_off, now(), 'import', 'off-import@test');
  insert into public.products (id, external_id, name, source_id, source_url, fetched_at, method, method_version)
  values (v_q, 'rls-manual-1', 'RLS Loose Apples', v_manual, 'https://example.org/apples', now(), 'manual', 'manual@test');
  insert into public.products (id, external_id, name, status, source_id, fetched_at, method, method_version)
  values (v_r, 'rls-rejected', 'RLS Rejected', 'rejected', v_src, now(), 'manual', 'manual@test'),
         (v_s, 'rls-discontinued', 'RLS Discontinued', 'discontinued', v_src, now(), 'manual', 'manual@test');
  -- Users see companies, brands and products only once approved (P2.22, D-050); the status
  -- filters still hide the rejected and discontinued products.
  update public.companies set review_status = 'approved', reviewed_at = now(), decision_method = 'admin'
  where id in (v_a, v_b, v_c);
  update public.brands set review_status = 'approved', reviewed_at = now(), decision_method = 'admin'
  where id = v_x;
  update public.products set review_status = 'approved', reviewed_at = now(), decision_method = 'admin'
  where id = any (v_products);

  insert into public.product_identifiers (product_id, scheme, value, banner_id, source_id, fetched_at, method, method_version)
  values (v_p, 'store_sku', '12345', v_banner1, v_src, now(), 'manual', 'manual@test'),
         (v_p, 'gtin_alt', '04006381333931', null, v_src, now(), 'manual', 'manual@test');
  insert into public.product_identifiers (product_id, scheme, value, source_id, fetched_at, method, method_version)
  values (v_p, 'plu', '4011', v_src, now(), 'manual', 'manual@test')
  returning id into v_ident;

  insert into public.product_sources
    (product_id, source_id, external_id, fetched_at, last_seen_at, method, method_version)
  values (v_p, v_manual, 'rls-ps-1', now(), now(), 'manual', 'manual@test');

  insert into public.category_mappings (source_id, source_category_key, category_id, source_url, fetched_at, method, method_version)
  values (v_off, 'en:rls-pending-milks', v_cat_child, null, now(), 'manual', 'manual@test')
  returning id into v_pending_map;
  insert into public.category_mappings
    (source_id, source_category_key, category_id, review_status, reviewed_at, decision_method,
     fetched_at, method, method_version)
  values (v_off, 'en:rls-approved-milks', v_cat_child, 'approved', now(), 'admin', now(), 'manual', 'manual@test')
  returning id into v_approved_map;

  -- Constraints -------------------------------------------------------------
  begin
    insert into public.products (gtin, external_id, name, source_id, fetched_at, method, method_version)
    values ('00036000291453', 'rls-bad-check', 'Bad check digit', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('bad GTIN check digit rejected|%s|%s', state = '23514', state);
  begin
    insert into public.products (gtin, external_id, name, source_id, fetched_at, method, method_version)
    values ('02012345678903', 'rls-restricted', 'Restricted code', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('restricted-circulation GTIN rejected|%s|%s', state = '23514', state);
  begin
    insert into public.products (gtin, external_id, name, source_id, fetched_at, method, method_version)
    values ('036000291452', 'rls-short', 'Not GTIN-14', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('GTIN not in 14-digit form rejected|%s|%s', state = '23514', state);
  begin
    insert into public.products (external_id, name, source_id, fetched_at, method, method_version)
    values ('0036000291452', 'Duplicate source key', v_off, now(), 'import', 'off-import@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('duplicate (source_id, external_id) rejected|%s|%s', state = '23505', state);
  insert into public.products (external_id, name, source_id, fetched_at, method, method_version)
  values ('0036000291452', 'Duplicate source key', v_off, now(), 'import', 'off-import@test')
  on conflict (source_id, external_id) do nothing;
  get diagnostics n = row_count;
  res := res || format('on conflict upsert on the source key inserts nothing|%s|%s rows', n = 0, n);
  begin
    insert into public.products (gtin, external_id, name, source_id, fetched_at, method, method_version)
    values ('00036000291452', 'rls-dup-gtin', 'Duplicate GTIN', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('duplicate GTIN rejected|%s|%s', state = '23505', state);
  begin
    insert into public.products (external_id, name, net_quantity, source_id, fetched_at, method, method_version)
    values ('rls-no-unit', 'No unit', 500, v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('net_quantity without net_unit rejected|%s|%s', state = '23514', state);
  begin
    insert into public.products (external_id, name, unit_parse_status, source_id, fetched_at, method, method_version)
    values ('rls-ok-empty', 'Parsed but empty', 'ok', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('unit_parse_status ok without a quantity rejected|%s|%s', state = '23514', state);
  begin
    update public.products set status = 'merged' where id = v_s;
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('merged product without merged_into_id rejected|%s|%s', state = '23514', state);
  begin
    insert into public.product_identifiers (product_id, scheme, value, source_id, fetched_at, method, method_version)
    values (v_q, 'store_sku', '999', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('store_sku without a banner rejected|%s|%s', state = '23514', state);
  begin
    insert into public.product_identifiers (product_id, scheme, value, source_id, fetched_at, method, method_version)
    values (v_q, 'gtin_alt', '04006381333931', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('duplicate identifier with no banner rejected (nulls not distinct)|%s|%s', state = '23505', state);
  begin
    insert into public.product_identifiers (product_id, scheme, value, banner_id, source_id, fetched_at, method, method_version)
    values (v_q, 'store_sku', '12345', v_banner2, v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('same store SKU at a second banner allowed|%s|%s', state = 'none', state);
  begin
    insert into public.product_identifiers (product_id, scheme, value, source_id, fetched_at, method, method_version)
    values (v_q, 'plu', '40110', v_src, now(), 'manual', 'manual@test'),
           (v_q, 'plu', '401A', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('malformed PLU rejected|%s|%s', state = '23514', state);
  begin
    insert into public.categories (slug, name, parent_id, level)
    values ('rls-bakery/bread', 'Wrong parent', v_cat_root, 1);
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('child slug not extending the parent slug rejected|%s|%s', state = '23514', state);
  begin
    insert into public.categories (slug, name, parent_id, level)
    values ('rls-dairy/milk/oat', 'Skips a level', v_cat_root, 2);
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('grandchild slug under the root rejected|%s|%s', state = '23514', state);
  begin
    insert into public.categories (slug, name, level) values ('rls-orphan/child', 'No parent', 1);
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('non-root category without a parent rejected|%s|%s', state = '23514', state);
  begin
    insert into public.category_mappings (source_id, source_category_key, category_id, fetched_at, method, method_version)
    values (v_off, 'en:rls-pending-milks', v_cat_root, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('duplicate (source_id, source_category_key) rejected|%s|%s', state = '23505', state);
  begin
    insert into public.category_mappings (source_id, source_category_key, category_id, fetched_at, method, method_version)
    values (v_off, 'en:rls-ai', v_cat_root, now(), 'ai', 'openrouter:test|category@1');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('ai mapping without confidence rejected|%s|%s', state = '23514', state);
  begin
    insert into public.product_sources (product_id, source_id, external_id, fetched_at, last_seen_at, method, method_version)
    values (v_p, v_src, 'rls-ps-2', now(), now() - interval '1 day', 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('product_sources last_seen_at before fetched_at rejected|%s|%s', state = '23514', state);

  select count(*) into n from public.labels;
  res := res || format('labels seed has 10 rows|%s|%s rows', n = 10, n);
  select count(*) into n from (
    select t from public.labels, unnest(off_tags) as t group by t having count(*) > 1
  ) as dup;
  res := res || format('no OFF tag maps to two labels|%s|%s shared tags', n = 0, n);

  -- Views (as owner) --------------------------------------------------------
  select resolved_source_url as url into v_row from public.products_with_source_url where id = v_p;
  res := res || format('products_with_source_url rebuilds the OFF URL|%s|%s',
    v_row.url = 'https://world.openfoodfacts.org/product/0036000291452', v_row.url);
  select resolved_source_url as url into v_row from public.products_with_source_url where id = v_q;
  res := res || format('a stored source_url wins|%s|%s', v_row.url = 'https://example.org/apples', v_row.url);
  select * into v_row from public.product_ownership_chain where product_id = v_p;
  res := res || format('chain: P -> X -> C -> B -> A|%s|%s / %s / %s depth %s path %s',
    v_row.brand_id = v_x and v_row.owner_company_id = v_c and v_row.ultimate_parent_id = v_a
      and v_row.ownership_depth = 2 and v_row.ownership_path = array[v_c, v_b, v_a],
    v_row.brand_slug, v_row.owner_company_slug, v_row.ultimate_parent_slug, v_row.ownership_depth, v_row.ownership_path);
  select * into v_row from public.product_ownership_chain where product_id = v_q;
  res := res || format('chain: a product without a brand has a row with null links|%s|brand %s owner %s',
    found and v_row.brand_id is null and v_row.owner_company_id is null, v_row.brand_id, v_row.owner_company_id);

  -- anon --------------------------------------------------------------------
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);

  select count(*) into n from public.products where id = any (v_products);
  res := res || format('anon sees the 2 active products only|%s|%s rows', n = 2, n);
  select count(*) into n from public.product_ownership_chain where product_id = v_p and ultimate_parent_id = v_a;
  res := res || format('anon gets the full chain for P|%s|%s rows', n = 1, n);
  select count(*) into n from public.products_with_source_url where id = any (v_products);
  res := res || format('anon sees 2 rows in products_with_source_url|%s|%s rows', n = 2, n);
  select (select count(*) from public.labels) + (select count(*) from public.categories where id in (v_cat_root, v_cat_child))
       + (select count(*) from public.product_identifiers where product_id = v_p) into n;
  res := res || format('anon reads labels, categories and identifiers|%s|%s rows (10 + 2 + 3)', n = 15, n);
  select count(*) into n from public.category_mappings where id in (v_pending_map, v_approved_map);
  res := res || format('anon sees the approved mapping, not the pending one|%s|%s rows', n = 1, n);
  begin
    select count(*) into n from public.product_sources;
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('anon cannot read product_sources|%s|%s', state = '42501', state);
  begin
    insert into public.products (external_id, name, source_id, fetched_at, method, method_version)
    values ('rls-anon', 'Anon', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('anon cannot insert products|%s|%s', state = '42501', state);

  reset role;

  -- authenticated, not an admin ----------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  select count(*) into n from public.products where id = any (v_products);
  res := res || format('user sees the 2 active products only|%s|%s rows', n = 2, n);
  select count(*) into n from public.product_sources where product_id = v_p;
  res := res || format('user sees no product_sources rows|%s|%s rows', n = 0, n);
  select count(*) into n from public.category_mappings where id = v_pending_map;
  res := res || format('user does not see the pending mapping|%s|%s rows', n = 0, n);
  begin
    insert into public.products (external_id, name, source_id, fetched_at, method, method_version)
    values ('rls-user', 'User', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('user cannot insert products|%s|%s', state = '42501', state);
  begin
    insert into public.labels (id, code, name) values (99, 'rls-user-label', 'User label');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('user cannot insert labels|%s|%s', state = '42501', state);
  update public.products set name = 'Hacked' where id = v_p;
  get diagnostics n = row_count;
  res := res || format('user cannot update products|%s|%s rows updated', n = 0, n);
  delete from public.product_identifiers where product_id = v_p;
  get diagnostics n = row_count;
  res := res || format('user cannot delete identifiers|%s|%s rows deleted', n = 0, n);

  reset role;

  -- admin -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select count(*) into n from public.products where id = any (v_products);
  res := res || format('admin sees all 4 products|%s|%s rows', n = 4, n);
  select count(*) into n from public.product_sources where product_id = v_p;
  res := res || format('admin reads product_sources|%s|%s rows', n = 1, n);
  insert into public.categories (slug, name, parent_id, level)
  values ('rls-dairy/cheese', 'RLS Cheese', v_cat_root, 1);
  get diagnostics n = row_count;
  res := res || format('admin inserts a category|%s|%s rows', n = 1, n);
  update public.category_mappings
  set review_status = 'approved', reviewed_at = now(), decision_method = 'admin', reviewed_by = v_admin
  where id = v_pending_map;
  get diagnostics n = row_count;
  res := res || format('admin approves a mapping|%s|%s rows', n = 1, n);
  update public.products set locked_fields = array['name'], name = 'RLS Oat Milk Original' where id = v_p;
  get diagnostics n = row_count;
  res := res || format('admin updates a product|%s|%s rows', n = 1, n);
  insert into public.product_sources (product_id, source_id, external_id, fetched_at, last_seen_at, method, method_version)
  values (v_p, v_src, 'rls-ps-admin', now(), now(), 'manual', 'manual@admin-ui');
  get diagnostics n = row_count;
  res := res || format('admin inserts a product_sources row|%s|%s rows', n = 1, n);
  delete from public.product_identifiers where id = v_ident;
  get diagnostics n = row_count;
  res := res || format('admin deletes an identifier|%s|%s rows', n = 1, n);

  reset role;

  insert into results (check_name, ok, detail)
  select split_part(r, '|', 1), split_part(r, '|', 2)::boolean, split_part(r, '|', 3) from unnest(res) as r;
end;
$$;

select n, check_name, ok, detail from results order by n;

rollback;
