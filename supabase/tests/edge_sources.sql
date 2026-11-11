-- P4.10 RLS and constraint checks for edge_sources (D-095): evidence rows for ownership edges,
-- admin only, one row per (edge, source), exactly one edge per row, cascading with the edge.
-- Run the whole file with the supabase-dev MCP `execute_sql`. Everything happens inside one
-- transaction that is rolled back, so it leaves no rows behind. The last select lists every check;
-- each row must have ok = true.

begin;

create temp table results (n serial, check_name text not null, ok boolean not null, detail text);

do $$
declare
  v_admin constant uuid := '00000000-0000-4000-8000-00000000a001';
  v_user constant uuid := '00000000-0000-4000-8000-00000000a002';
  v_parent constant uuid := '00000000-0000-4000-8000-0000004a0c01';
  v_child constant uuid := '00000000-0000-4000-8000-0000004a0c02';
  v_brand constant uuid := '00000000-0000-4000-8000-0000004a0b01';
  v_be constant uuid := '00000000-0000-4000-8000-0000004a0e01';
  v_ce constant uuid := '00000000-0000-4000-8000-0000004a0e02';
  v_src uuid;
  v_sec uuid;
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
  select id into v_sec from public.sources where key = 'sec-edgar';

  insert into public.companies (id, slug, name, source_id, fetched_at, method, method_version)
  values (v_parent, 'rls-p410-parent', 'RLS P410 Parent', v_src, now(), 'import', 'fixture@test'),
         (v_child, 'rls-p410-child', 'RLS P410 Child', v_src, now(), 'import', 'fixture@test');
  insert into public.brands (id, slug, name, source_id, fetched_at, method, method_version)
  values (v_brand, 'rls-p410-brand', 'RLS P410 Brand', v_src, now(), 'import', 'fixture@test');
  insert into public.brand_ownership (id, brand_id, company_id, relation, source_id, fetched_at, method, method_version)
  values (v_be, v_brand, v_parent, 'owner', v_src, now(), 'import', 'fixture@test');
  insert into public.company_ownership
    (id, parent_company_id, child_company_id, relation, source_id, fetched_at, method, method_version)
  values (v_ce, v_parent, v_child, 'subsidiary', v_src, now(), 'import', 'fixture@test');

  -- Constraints -------------------------------------------------------------
  insert into public.edge_sources (brand_ownership_id, source_id, source_url, fetched_at, last_seen_at, method, method_version)
  values (v_be, v_sec, 'https://www.sec.gov/rls-p410', now(), now(), 'api', 'sec-edgar@test');
  insert into public.edge_sources (company_ownership_id, source_id, fetched_at, last_seen_at, method, method_version)
  values (v_ce, v_sec, now(), now(), 'api', 'sec-edgar@test');
  get diagnostics n = row_count;
  res := res || format('evidence rows for a brand edge and a company edge|%s|%s rows', n = 1, n);
  begin
    insert into public.edge_sources (brand_ownership_id, source_id, fetched_at, last_seen_at, method, method_version)
    values (v_be, v_sec, now(), now(), 'api', 'sec-edgar@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('a second row for (edge, source) is rejected|%s|%s', state = '23505', state);
  -- The same source may confirm a brand edge and a company edge: the partial indexes are separate.
  insert into public.edge_sources (brand_ownership_id, source_id, fetched_at, last_seen_at, method, method_version)
  values (v_be, v_src, now(), now(), 'import', 'fixture@test');
  get diagnostics n = row_count;
  res := res || format('another source on the same edge is a new row|%s|%s rows', n = 1, n);
  begin
    insert into public.edge_sources (brand_ownership_id, company_ownership_id, source_id, fetched_at, last_seen_at, method, method_version)
    values (v_be, v_ce, v_src, now(), now(), 'api', 'x@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('a row naming two edges is rejected|%s|%s', state = '23514', state);
  begin
    insert into public.edge_sources (source_id, fetched_at, last_seen_at, method, method_version)
    values (v_src, now(), now(), 'api', 'x@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('a row naming no edge is rejected|%s|%s', state = '23514', state);
  begin
    insert into public.edge_sources (company_ownership_id, source_id, fetched_at, last_seen_at, method, method_version)
    values (v_ce, v_src, now(), now() - interval '1 day', 'api', 'x@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('last_seen_at before fetched_at is rejected|%s|%s', state = '23514', state);
  begin
    insert into public.edge_sources (company_ownership_id, source_id, fetched_at, last_seen_at, method, method_version)
    values (v_ce, v_src, now(), now(), 'ai', 'x@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('an ai row without confidence is rejected|%s|%s', state = '23514', state);
  begin
    insert into public.edge_sources (company_ownership_id, source_id, source_url, fetched_at, last_seen_at, method, method_version)
    values (v_ce, v_src, 'ftp://x', now(), now(), 'api', 'x@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('a non-http source_url is rejected|%s|%s', state = '23514', state);

  -- anon --------------------------------------------------------------------
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    select count(*) into n from public.edge_sources;
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('anon cannot read edge_sources|%s|%s', state = '42501', state);
  begin
    insert into public.edge_sources (brand_ownership_id, source_id, fetched_at, last_seen_at, method, method_version)
    values (v_be, v_src, now(), now(), 'manual', 'x@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('anon cannot write edge_sources|%s|%s', state = '42501', state);
  reset role;

  -- authenticated, not an admin ----------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  select count(*) into n from public.edge_sources;
  res := res || format('user sees no edge_sources rows|%s|%s rows', n = 0, n);
  begin
    insert into public.edge_sources (company_ownership_id, source_id, fetched_at, last_seen_at, method, method_version)
    values (v_ce, v_src, now(), now(), 'manual', 'x@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('user cannot insert edge_sources|%s|%s', state = '42501', state);
  update public.edge_sources set method_version = 'changed' where brand_ownership_id = v_be;
  get diagnostics n = row_count;
  res := res || format('user cannot update edge_sources|%s|%s rows updated', n = 0, n);
  reset role;

  -- admin -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select count(*) into n from public.edge_sources where brand_ownership_id = v_be or company_ownership_id = v_ce;
  res := res || format('admin reads edge_sources|%s|%s rows', n = 3, n);
  insert into public.edge_sources (company_ownership_id, source_id, fetched_at, last_seen_at, method, method_version)
  values (v_ce, v_src, now(), now(), 'manual', 'manual@test');
  get diagnostics n = row_count;
  res := res || format('admin writes edge_sources|%s|%s rows', n = 1, n);
  delete from public.edge_sources where company_ownership_id = v_ce and source_id = v_src;
  get diagnostics n = row_count;
  res := res || format('admin deletes edge_sources|%s|%s rows', n = 1, n);
  reset role;

  -- Evidence goes with its edge.
  delete from public.brand_ownership where id = v_be;
  select count(*) into n from public.edge_sources where brand_ownership_id = v_be;
  res := res || format('deleting an edge deletes its evidence|%s|%s rows left', n = 0, n);

  select count(*) into n from pg_class where oid = 'public.edge_sources'::regclass and relrowsecurity;
  res := res || format('edge_sources has RLS enabled|%s|%s', n = 1, n);

  insert into results (check_name, ok, detail)
  select split_part(r, '|', 1), split_part(r, '|', 2)::boolean, split_part(r, '|', 3) from unnest(res) as r;
end;
$$;

select n, check_name, ok, detail from results order by n;

rollback;
