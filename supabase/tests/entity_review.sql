-- P2.22 RLS and constraint checks for the review block on companies, brands and products (D-050).
-- Run the whole file with the supabase-dev MCP `execute_sql`. Everything happens inside one
-- transaction that is rolled back, so it leaves no rows behind. The last select lists every check;
-- each row must have ok = true. The "dev data" checks count the rows already on the dev project
-- (the legacy import: 11 companies, 49 brands, 13 products, all pending).

begin;

create temp table results (n serial, check_name text not null, ok boolean not null, detail text);

do $$
declare
  v_admin constant uuid := '00000000-0000-4000-8000-00000000a001';
  v_user constant uuid := '00000000-0000-4000-8000-00000000a002';
  -- Companies: approved, pending, approved but status rejected, review rejected.
  v_ca constant uuid := '00000000-0000-4000-8000-0000000e0c01';
  v_cp constant uuid := '00000000-0000-4000-8000-0000000e0c02';
  v_cs constant uuid := '00000000-0000-4000-8000-0000000e0c03';
  v_cr constant uuid := '00000000-0000-4000-8000-0000000e0c04';
  -- Brands: approved, pending.
  v_ba constant uuid := '00000000-0000-4000-8000-0000000e0b01';
  v_bp constant uuid := '00000000-0000-4000-8000-0000000e0b02';
  -- Products: approved (auto), pending, approved but discontinued, approved with a pending brand.
  v_pa constant uuid := '00000000-0000-4000-8000-0000000e0d01';
  v_pp constant uuid := '00000000-0000-4000-8000-0000000e0d02';
  v_pd constant uuid := '00000000-0000-4000-8000-0000000e0d03';
  v_pb constant uuid := '00000000-0000-4000-8000-0000000e0d04';
  v_companies constant uuid[] := array[v_ca, v_cp, v_cs, v_cr];
  v_brands constant uuid[] := array[v_ba, v_bp];
  v_products constant uuid[] := array[v_pa, v_pp, v_pd, v_pb];
  v_src uuid;
  v_chain record;
  n bigint;
  c bigint;
  b bigint;
  p bigint;
  state text;
  res text[] := '{}';
begin
  -- Fixtures (as the migration owner) ----------------------------------------
  insert into auth.users (id, email, aud, role)
  values (v_admin, 'rls-admin@test.invalid', 'authenticated', 'authenticated'),
         (v_user, 'rls-user@test.invalid', 'authenticated', 'authenticated');
  update public.profiles set role = 'admin' where id = v_admin;

  select id into v_src from public.sources where key = 'fixture';

  -- Rows written without review columns arrive pending.
  insert into public.companies (id, slug, name, source_id, fetched_at, method, method_version)
  values (v_cp, 'rls-er-pending', 'RLS Pending Co', v_src, now(), 'manual', 'manual@test');
  select count(*) into n from public.companies where id = v_cp and review_status = 'pending'
    and reviewed_at is null and decision_method is null;
  res := res || format('a new company arrives pending|%s|%s rows', n = 1, n);

  insert into public.companies
    (id, slug, name, status, review_status, reviewed_by, reviewed_at, decision_method,
     source_id, fetched_at, method, method_version)
  values (v_ca, 'rls-er-approved', 'RLS Approved Co', 'active', 'approved', v_admin, now(), 'admin', v_src, now(), 'manual', 'manual@test'),
         (v_cs, 'rls-er-status-rejected', 'RLS Status Rejected Co', 'rejected', 'approved', v_admin, now(), 'admin', v_src, now(), 'manual', 'manual@test'),
         (v_cr, 'rls-er-review-rejected', 'RLS Review Rejected Co', 'active', 'rejected', v_admin, now(), 'admin', v_src, now(), 'manual', 'manual@test');

  insert into public.brands
    (id, slug, name, review_status, reviewed_at, decision_method, source_id, fetched_at, method, method_version)
  values (v_ba, 'rls-er-brand-approved', 'RLS Approved Brand', 'approved', now(), 'admin', v_src, now(), 'manual', 'manual@test');
  insert into public.brands (id, slug, name, source_id, fetched_at, method, method_version)
  values (v_bp, 'rls-er-brand-pending', 'RLS Pending Brand', v_src, now(), 'manual', 'manual@test');

  insert into public.brand_ownership
    (brand_id, company_id, relation, review_status, reviewed_at, decision_method,
     source_id, fetched_at, method, method_version)
  values (v_ba, v_ca, 'owner', 'approved', now(), 'admin', v_src, now(), 'manual', 'manual@test');

  insert into public.products
    (id, external_id, name, brand_id, status, review_status, reviewed_at, decision_method,
     source_id, fetched_at, method, method_version)
  values (v_pa, 'rls-er-pa', 'RLS Auto Approved Product', v_ba, 'active', 'approved', now(), 'auto', v_src, now(), 'api', 'fixture@test'),
         (v_pd, 'rls-er-pd', 'RLS Discontinued Product', v_ba, 'discontinued', 'approved', now(), 'auto', v_src, now(), 'api', 'fixture@test'),
         (v_pb, 'rls-er-pb', 'RLS Product With Pending Brand', v_bp, 'active', 'approved', now(), 'auto', v_src, now(), 'api', 'fixture@test');
  insert into public.products (id, external_id, name, brand_id, source_id, fetched_at, method, method_version)
  values (v_pp, 'rls-er-pp', 'RLS Pending Product', v_ba, v_src, now(), 'api', 'fixture@test');

  -- Constraints -------------------------------------------------------------
  begin
    insert into public.companies (slug, name, review_status, source_id, fetched_at, method, method_version)
    values ('rls-er-no-reviewed-at', 'Bad', 'approved', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('approved company without reviewed_at rejected|%s|%s', state = '23514', state);
  begin
    insert into public.brands
      (slug, name, review_status, reviewed_by, reviewed_at, decision_method, source_id, fetched_at, method, method_version)
    values ('rls-er-auto-person', 'Bad', 'approved', v_admin, now(), 'auto', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('auto-approved brand with a person rejected|%s|%s', state = '23514', state);
  begin
    insert into public.products
      (external_id, name, review_status, reviewed_at, decision_method, source_id, fetched_at, method, method_version)
    values ('rls-er-bad-status', 'Bad', 'hidden', now(), 'admin', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('unknown product review_status rejected|%s|%s', state = '23514', state);
  begin
    insert into public.products
      (external_id, name, decision_method, source_id, fetched_at, method, method_version)
    values ('rls-er-pending-decided', 'Bad', 'admin', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('pending product with a decision method rejected|%s|%s', state = '23514', state);

  -- Dev data (as owner): every legacy row is pending ---------------------------
  select (select count(*) from public.companies where not (id = any (v_companies)) and review_status <> 'pending'),
         (select count(*) from public.brands where not (id = any (v_brands)) and review_status <> 'pending'),
         (select count(*) from public.products where not (id = any (v_products)) and review_status <> 'pending')
  into c, b, p;
  res := res || format('dev data: no company, brand or product is reviewed yet|%s|%s / %s / %s', c + b + p = 0, c, b, p);

  -- anon --------------------------------------------------------------------
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);

  select (select count(*) from public.companies where not (id = any (v_companies))),
         (select count(*) from public.brands where not (id = any (v_brands))),
         (select count(*) from public.products where not (id = any (v_products)))
  into c, b, p;
  res := res || format('anon sees 0 dev companies, brands and products|%s|%s / %s / %s', c + b + p = 0, c, b, p);
  select count(*) into n from public.companies where id = any (v_companies);
  res := res || format('anon sees only the approved active company|%s|%s rows', n = 1, n);
  select count(*) into n from public.brands where id = any (v_brands);
  res := res || format('anon sees only the approved brand|%s|%s rows', n = 1, n);
  select count(*) into n from public.products where id = any (v_products);
  res := res || format('anon sees the 2 approved active products|%s|%s rows', n = 2, n);
  select count(*) into n from public.products_with_source_url where id = any (v_products);
  res := res || format('anon sees 2 rows in products_with_source_url|%s|%s rows', n = 2, n);
  select * into v_chain from public.product_ownership_chain where product_id = v_pa;
  res := res || format('anon gets the full chain for the approved product|%s|%s -> %s',
    v_chain.brand_slug = 'rls-er-brand-approved' and v_chain.owner_company_slug = 'rls-er-approved',
    v_chain.brand_slug, v_chain.owner_company_slug);
  select * into v_chain from public.product_ownership_chain where product_id = v_pb;
  res := res || format('anon gets no brand for a product whose brand is pending|%s|brand %s',
    v_chain.product_id = v_pb and v_chain.brand_id is null, coalesce(v_chain.brand_slug, 'null'));
  select count(*) into n from public.brand_current_owner where brand_id = any (v_brands);
  res := res || format('anon sees the approved brand owner|%s|%s rows', n = 1, n);
  begin
    update public.companies set review_status = 'approved', reviewed_at = now(), decision_method = 'admin'
    where id = v_cp;
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('anon cannot approve a company|%s|%s', state = '42501', state);

  reset role;

  -- authenticated, not an admin ----------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  select (select count(*) from public.companies where not (id = any (v_companies))),
         (select count(*) from public.brands where not (id = any (v_brands))),
         (select count(*) from public.products where not (id = any (v_products)))
  into c, b, p;
  res := res || format('user sees 0 dev companies, brands and products|%s|%s / %s / %s', c + b + p = 0, c, b, p);
  select (select count(*) from public.companies where id = any (v_companies)),
         (select count(*) from public.brands where id = any (v_brands)),
         (select count(*) from public.products where id = any (v_products))
  into c, b, p;
  res := res || format('user sees only approved fixtures|%s|%s / %s / %s', c = 1 and b = 1 and p = 2, c, b, p);
  update public.products set review_status = 'approved', reviewed_at = now(), decision_method = 'admin'
  where id = v_pp;
  get diagnostics n = row_count;
  res := res || format('user cannot approve a product|%s|%s rows updated', n = 0, n);

  reset role;

  -- admin -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select (select count(*) from public.companies where not (id = any (v_companies))),
         (select count(*) from public.brands where not (id = any (v_brands))),
         (select count(*) from public.products where not (id = any (v_products)))
  into c, b, p;
  res := res || format('admin sees 11 / 49 / 13 dev companies, brands and products|%s|%s / %s / %s',
    c = 11 and b = 49 and p = 13, c, b, p);
  select (select count(*) from public.companies where id = any (v_companies)),
         (select count(*) from public.brands where id = any (v_brands)),
         (select count(*) from public.products where id = any (v_products))
  into c, b, p;
  res := res || format('admin sees every fixture|%s|%s / %s / %s', c = 4 and b = 2 and p = 4, c, b, p);
  update public.brands
  set review_status = 'approved', reviewed_at = now(), decision_method = 'admin', reviewed_by = v_admin
  where id = v_bp;
  get diagnostics n = row_count;
  res := res || format('admin approves a brand|%s|%s rows', n = 1, n);

  reset role;

  -- The approval shows up for anon straight away.
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.brands where id = any (v_brands);
  res := res || format('anon sees the brand once approved|%s|%s rows', n = 2, n);
  reset role;

  insert into results (check_name, ok, detail)
  select split_part(r, '|', 1), split_part(r, '|', 2)::boolean, split_part(r, '|', 3) from unnest(res) as r;
end;
$$;

select n, check_name, ok, detail from results order by n;

rollback;
