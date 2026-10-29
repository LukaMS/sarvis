-- P2.4 RLS and constraint checks for the ownership domain.
-- Run the whole file with the supabase-dev MCP `execute_sql`. Everything happens inside one
-- transaction that is rolled back, so it leaves no rows behind. The last select lists every check;
-- each row must have ok = true.

begin;

create temp table results (n serial, check_name text not null, ok boolean not null, detail text);

do $$
declare
  v_admin constant uuid := '00000000-0000-4000-8000-00000000a001';
  v_user constant uuid := '00000000-0000-4000-8000-00000000a002';
  -- Companies: A owns B owns C (approved chain); D unrelated; R rejected.
  v_a constant uuid := '00000000-0000-4000-8000-0000000c000a';
  v_b constant uuid := '00000000-0000-4000-8000-0000000c000b';
  v_c constant uuid := '00000000-0000-4000-8000-0000000c000c';
  v_d constant uuid := '00000000-0000-4000-8000-0000000c000d';
  v_r constant uuid := '00000000-0000-4000-8000-0000000c000e';
  v_x constant uuid := '00000000-0000-4000-8000-0000000d0001';
  v_y constant uuid := '00000000-0000-4000-8000-0000000d0002';
  v_ids constant uuid[] := array[v_a, v_b, v_c, v_d, v_r];
  v_src uuid;
  v_edge uuid;
  v_pending_co uuid;
  v_pending_bo uuid;
  v_up record;
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

  insert into public.companies (id, slug, name, status, source_id, fetched_at, method, method_version)
  values (v_a, 'rls-a', 'RLS A Holdings', 'active', v_src, now(), 'manual', 'manual@test'),
         (v_b, 'rls-b', 'RLS B Foods', 'active', v_src, now(), 'manual', 'manual@test'),
         (v_c, 'rls-c', 'RLS C Dairy', 'active', v_src, now(), 'manual', 'manual@test'),
         (v_d, 'rls-d', 'RLS D Capital', 'active', v_src, now(), 'manual', 'manual@test'),
         (v_r, 'rls-r', 'RLS Rejected', 'rejected', v_src, now(), 'manual', 'manual@test');
  insert into public.brands (id, slug, name, source_id, fetched_at, method, method_version)
  values (v_x, 'rls-x', 'RLS X', v_src, now(), 'manual', 'manual@test'),
         (v_y, 'rls-y', 'RLS Y', v_src, now(), 'manual', 'manual@test');
  -- Users see companies and brands only once approved (P2.22, D-050).
  update public.companies set review_status = 'approved', reviewed_at = now(), decision_method = 'admin'
  where id = any (v_ids);
  update public.brands set review_status = 'approved', reviewed_at = now(), decision_method = 'admin'
  where id in (v_x, v_y);

  insert into public.company_ownership
    (parent_company_id, child_company_id, relation, review_status, reviewed_at, decision_method,
     source_id, fetched_at, method, method_version)
  values (v_a, v_b, 'subsidiary', 'approved', now(), 'admin', v_src, now(), 'manual', 'manual@test'),
         (v_b, v_c, 'subsidiary', 'approved', now(), 'admin', v_src, now(), 'manual', 'manual@test');
  insert into public.company_ownership
    (parent_company_id, child_company_id, relation, source_id, fetched_at, method, method_version)
  values (v_d, v_a, 'minority_stake', v_src, now(), 'manual', 'manual@test')
  returning id into v_pending_co;

  insert into public.brand_ownership
    (brand_id, company_id, relation, review_status, reviewed_at, decision_method,
     source_id, fetched_at, method, method_version)
  values (v_x, v_c, 'owner', 'approved', now(), 'admin', v_src, now(), 'manual', 'manual@test');
  insert into public.brand_ownership (brand_id, company_id, relation, source_id, fetched_at, method, method_version)
  values (v_y, v_a, 'owner', v_src, now(), 'manual', 'manual@test')
  returning id into v_pending_bo;

  -- Constraints -------------------------------------------------------------
  begin
    insert into public.company_ownership (parent_company_id, child_company_id, relation, source_id, fetched_at, method, method_version)
    values (v_b, v_a, 'subsidiary', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('edge B->A after A->B rejected (cycle)|%s|%s', state = '23514', state);
  begin
    insert into public.company_ownership (parent_company_id, child_company_id, relation, source_id, fetched_at, method, method_version)
    values (v_c, v_a, 'minority_stake', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('edge C->A rejected (three-step cycle)|%s|%s', state = '23514', state);
  begin
    insert into public.company_ownership
      (parent_company_id, child_company_id, relation, review_status, reviewed_at, decision_method,
       source_id, fetched_at, method, method_version)
    values (v_b, v_a, 'subsidiary', 'rejected', now(), 'admin', v_src, now(), 'manual', 'manual@test')
    returning id into v_edge;
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('rejected edge B->A may be stored|%s|%s', state = 'none', state);
  begin
    update public.company_ownership set review_status = 'pending', reviewed_at = null, decision_method = null
    where id = v_edge;
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('reopening the rejected B->A edge rejected (cycle)|%s|%s', state = '23514', state);
  begin
    insert into public.company_ownership (parent_company_id, child_company_id, relation, source_id, fetched_at, method, method_version)
    values (v_a, v_a, 'subsidiary', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('self edge rejected|%s|%s', state = '23514', state);
  begin
    insert into public.company_ownership (parent_company_id, child_company_id, relation, source_id, fetched_at, method, method_version)
    values (v_a, v_b, 'subsidiary', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('duplicate edge with null valid_from rejected|%s|%s', state = '23505', state);
  insert into public.company_ownership (parent_company_id, child_company_id, relation, source_id, fetched_at, method, method_version)
  values (v_a, v_b, 'subsidiary', v_src, now(), 'manual', 'manual@test')
  on conflict (parent_company_id, child_company_id, relation, valid_from) do nothing;
  get diagnostics n = row_count;
  res := res || format('on conflict upsert on the edge key inserts nothing|%s|%s rows', n = 0, n);
  begin
    insert into public.company_ownership
      (parent_company_id, child_company_id, relation, review_status, reviewed_at, decision_method,
       source_id, fetched_at, method, method_version)
    values (v_d, v_c, 'subsidiary', 'approved', now(), 'admin', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('second current approved controlling parent rejected|%s|%s', state = '23505', state);
  begin
    insert into public.brand_ownership
      (brand_id, company_id, relation, review_status, reviewed_at, decision_method,
       source_id, fetched_at, method, method_version)
    values (v_x, v_b, 'owner', 'approved', now(), 'admin', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('second current approved brand owner rejected|%s|%s', state = '23505', state);
  begin
    insert into public.brand_ownership (brand_id, company_id, relation, source_id, fetched_at, method, method_version)
    values (v_x, v_b, 'owner', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('a pending competing brand owner is allowed|%s|%s', state = 'none', state);
  begin
    insert into public.brand_ownership (brand_id, company_id, relation, source_id, fetched_at, method, method_version)
    values (v_y, v_b, 'owner', v_src, now(), 'ai', 'openrouter:test|brand@1');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('ai edge without confidence rejected|%s|%s', state = '23514', state);
  begin
    insert into public.brand_ownership
      (brand_id, company_id, relation, review_status, reviewed_at, decision_method, reviewed_by,
       source_id, fetched_at, method, method_version)
    values (v_y, v_d, 'licensee', 'approved', now(), 'auto', v_admin, v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('auto decision with a person rejected|%s|%s', state = '23514', state);
  begin
    insert into public.brand_ownership (brand_id, company_id, relation, valid_from, valid_to, source_id, fetched_at, method, method_version)
    values (v_y, v_d, 'licensee', '2020-01-01', '2019-01-01', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('valid_to before valid_from rejected|%s|%s', state = '23514', state);
  begin
    update public.companies set status = 'merged' where id = v_d;
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('merged without merged_into_id rejected|%s|%s', state = '23514', state);
  begin
    insert into public.companies (slug, name, source_id, fetched_at, method, method_version)
    values ('Bad Slug', 'Bad', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('bad company slug rejected|%s|%s', state = '23514', state);
  begin
    insert into public.companies (slug, name, source_id, fetched_at, method, method_version)
    values ('rls-bad-method', 'Bad', v_src, now(), 'scraper', 'x@1');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('unknown provenance method rejected|%s|%s', state = '23514', state);
  begin
    insert into public.brands (slug, name, source_id, method, method_version)
    values ('rls-no-fetched', 'No fetched_at', v_src, 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('missing fetched_at rejected|%s|%s', state = '23502', state);

  -- Views (as owner) --------------------------------------------------------
  select * into v_up from public.company_ultimate_parent where company_id = v_c;
  res := res || format('ultimate parent of C is A at depth 2 with path C,B,A|%s|%s depth %s path %s',
    v_up.ultimate_parent_id = v_a and v_up.depth = 2 and v_up.path = array[v_c, v_b, v_a],
    v_up.ultimate_parent_slug, v_up.depth, v_up.path);
  select * into v_up from public.company_ultimate_parent where company_id = v_a;
  res := res || format('A is its own top parent (minority stake not walked)|%s|%s depth %s',
    v_up.ultimate_parent_id = v_a and v_up.depth = 0, v_up.ultimate_parent_slug, v_up.depth);
  select count(*) into n from public.brand_current_owner where brand_id = v_x and company_id = v_c;
  res := res || format('brand_current_owner maps X to C|%s|%s rows', n = 1, n);

  -- anon --------------------------------------------------------------------
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);

  select count(*) into n from public.companies where id = any (v_ids);
  res := res || format('anon sees 4 companies, not the rejected one|%s|%s rows', n = 4, n);
  select count(*) into n from public.company_ownership where id = v_pending_co;
  res := res || format('anon does not see a pending company edge|%s|%s rows', n = 0, n);
  select count(*) into n from public.brand_ownership where id = v_pending_bo;
  res := res || format('anon does not see a pending brand edge|%s|%s rows', n = 0, n);
  select count(*) into n from public.company_ownership where child_company_id = any (v_ids);
  res := res || format('anon sees the 2 approved company edges|%s|%s rows', n = 2, n);
  select * into v_up from public.company_ultimate_parent where company_id = v_c;
  res := res || format('anon walks C up to A|%s|%s depth %s',
    v_up.ultimate_parent_id = v_a and v_up.depth = 2, v_up.ultimate_parent_slug, v_up.depth);
  select count(*) into n from public.brand_current_owner where brand_id in (v_x, v_y);
  res := res || format('anon sees only the approved brand owner|%s|%s rows', n = 1, n);
  begin
    insert into public.companies (slug, name, source_id, fetched_at, method, method_version)
    values ('rls-anon', 'Anon', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('anon cannot insert companies|%s|%s', state = '42501', state);
  begin
    update public.brands set name = 'Hacked' where id = v_x;
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('anon cannot update brands|%s|%s', state = '42501', state);

  reset role;

  -- authenticated, not an admin ----------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  select count(*) into n from public.companies where id = any (v_ids);
  res := res || format('user sees 4 companies, not the rejected one|%s|%s rows', n = 4, n);
  select (select count(*) from public.company_ownership where id = v_pending_co)
       + (select count(*) from public.brand_ownership where id = v_pending_bo) into n;
  res := res || format('user does not see pending edges|%s|%s rows', n = 0, n);
  begin
    insert into public.brands (slug, name, source_id, fetched_at, method, method_version)
    values ('rls-user', 'User', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('user cannot insert brands|%s|%s', state = '42501', state);
  begin
    insert into public.banners (slug, name, source_id, fetched_at, method, method_version)
    values ('rls-user-banner', 'User banner', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('user cannot insert banners|%s|%s', state = '42501', state);
  update public.companies set name = 'Hacked' where id = v_a;
  get diagnostics n = row_count;
  res := res || format('user cannot update companies|%s|%s rows updated', n = 0, n);
  delete from public.company_ownership where parent_company_id = v_a;
  get diagnostics n = row_count;
  res := res || format('user cannot delete edges|%s|%s rows deleted', n = 0, n);

  reset role;

  -- admin -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select count(*) into n from public.companies where id = any (v_ids);
  res := res || format('admin sees all 5 companies|%s|%s rows', n = 5, n);
  select (select count(*) from public.company_ownership where id = v_pending_co)
       + (select count(*) from public.brand_ownership where id = v_pending_bo) into n;
  res := res || format('admin sees pending edges|%s|%s rows', n = 2, n);
  insert into public.banners (slug, name, operator_company_id, country, source_id, fetched_at, method, method_version)
  values ('rls-banner', 'RLS Banner', v_a, 'CA', v_src, now(), 'manual', 'manual@admin-ui');
  get diagnostics n = row_count;
  res := res || format('admin inserts a banner|%s|%s rows', n = 1, n);
  update public.brand_ownership
  set review_status = 'approved', reviewed_at = now(), decision_method = 'admin', reviewed_by = v_admin
  where id = v_pending_bo;
  get diagnostics n = row_count;
  res := res || format('admin approves a brand edge|%s|%s rows', n = 1, n);
  update public.companies set locked_fields = array['name'], name = 'RLS A Holdings Inc.' where id = v_a;
  get diagnostics n = row_count;
  res := res || format('admin updates a company|%s|%s rows', n = 1, n);
  delete from public.company_ownership where id = v_pending_co;
  get diagnostics n = row_count;
  res := res || format('admin deletes an edge|%s|%s rows', n = 1, n);

  reset role;

  insert into results (check_name, ok, detail)
  select split_part(r, '|', 1), split_part(r, '|', 2)::boolean, split_part(r, '|', 3) from unnest(res) as r;
end;
$$;

select n, check_name, ok, detail from results order by n;

rollback;
