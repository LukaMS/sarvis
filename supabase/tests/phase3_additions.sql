-- P3.2 RLS and constraint checks for the Phase 3 additions (D-053): review_queue item types
-- company and brand, company_sources (admin only), documents.summary (Wikipedia only) and the
-- company Wikipedia page that is public exactly when its company is.
-- Run the whole file with the supabase-dev MCP `execute_sql`. Everything happens inside one
-- transaction that is rolled back, so it leaves no rows behind. The last select lists every check;
-- each row must have ok = true.

begin;

create temp table results (n serial, check_name text not null, ok boolean not null, detail text);

do $$
declare
  v_admin constant uuid := '00000000-0000-4000-8000-00000000a001';
  v_user constant uuid := '00000000-0000-4000-8000-00000000a002';
  -- Companies: approved, pending, and approved but with its page link pointing at a news document.
  v_ca constant uuid := '00000000-0000-4000-8000-0000003a0c01';
  v_cp constant uuid := '00000000-0000-4000-8000-0000003a0c02';
  v_cn constant uuid := '00000000-0000-4000-8000-0000003a0c03';
  -- Documents: the approved and the pending company's Wikipedia pages, the news document, and a
  -- Wikipedia page no company links to.
  v_da constant uuid := '00000000-0000-4000-8000-0000003a0d01';
  v_dp constant uuid := '00000000-0000-4000-8000-0000003a0d02';
  v_dn constant uuid := '00000000-0000-4000-8000-0000003a0d03';
  v_du constant uuid := '00000000-0000-4000-8000-0000003a0d04';
  v_docs constant uuid[] := array[v_da, v_dp, v_dn, v_du];
  v_src uuid;
  n bigint;
  s text;
  state text;
  res text[] := '{}';
begin
  -- Fixtures (as the migration owner) ----------------------------------------
  insert into auth.users (id, email, aud, role)
  values (v_admin, 'rls-admin@test.invalid', 'authenticated', 'authenticated'),
         (v_user, 'rls-user@test.invalid', 'authenticated', 'authenticated');
  update public.profiles set role = 'admin' where id = v_admin;

  select id into v_src from public.sources where key = 'fixture';

  insert into public.documents (id, url, url_normalized, kind, title, summary, source_id, fetched_at, method, method_version)
  values (v_da, 'https://en.wikipedia.org/wiki/RLS_P3_Approved', 'https://en.wikipedia.org/wiki/RLS_P3_Approved',
          'wikipedia', 'RLS P3 Approved', 'An approved company summary.', v_src, now(), 'api', 'fixture@test'),
         (v_dp, 'https://en.wikipedia.org/wiki/RLS_P3_Pending', 'https://en.wikipedia.org/wiki/RLS_P3_Pending',
          'wikipedia', 'RLS P3 Pending', 'A pending company summary.', v_src, now(), 'api', 'fixture@test'),
         (v_dn, 'https://news.test.invalid/rls-p3', 'https://news.test.invalid/rls-p3',
          'news', 'RLS P3 News', null, v_src, now(), 'api', 'fixture@test'),
         (v_du, 'https://en.wikipedia.org/wiki/RLS_P3_Unlinked', 'https://en.wikipedia.org/wiki/RLS_P3_Unlinked',
          'wikipedia', 'RLS P3 Unlinked', 'Nobody links here.', v_src, now(), 'api', 'fixture@test');

  insert into public.companies
    (id, slug, name, wikipedia_document_id, review_status, reviewed_at, decision_method,
     source_id, fetched_at, method, method_version)
  values (v_ca, 'rls-p3-approved', 'RLS P3 Approved Co', v_da, 'approved', now(), 'auto', v_src, now(), 'api', 'fixture@test'),
         (v_cn, 'rls-p3-news-link', 'RLS P3 News Link Co', v_dn, 'approved', now(), 'auto', v_src, now(), 'api', 'fixture@test');
  insert into public.companies (id, slug, name, wikipedia_document_id, source_id, fetched_at, method, method_version)
  values (v_cp, 'rls-p3-pending', 'RLS P3 Pending Co', v_dp, v_src, now(), 'api', 'fixture@test');

  -- Constraints -------------------------------------------------------------
  begin
    insert into public.documents (url, url_normalized, kind, summary, source_id, fetched_at, method, method_version)
    values ('https://news.test.invalid/rls-p3-summary', 'https://news.test.invalid/rls-p3-summary',
            'news', 'Not allowed here.', v_src, now(), 'api', 'fixture@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('a non-Wikipedia document with a summary is rejected|%s|%s', state = '23514', state);
  begin
    insert into public.documents (url, url_normalized, kind, summary, source_id, fetched_at, method, method_version)
    values ('https://en.wikipedia.org/wiki/RLS_P3_Long', 'https://en.wikipedia.org/wiki/RLS_P3_Long',
            'wikipedia', repeat('x', 2001), v_src, now(), 'api', 'fixture@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('a summary over 2,000 characters is rejected|%s|%s', state = '23514', state);

  insert into public.review_queue (item_type, item_table, item_id, reason)
  values ('company', 'companies', v_cp::text, 'rls check'), ('brand', 'brands', v_cp::text, 'rls check');
  get diagnostics n = row_count;
  res := res || format('review_queue takes item types company and brand|%s|%s rows', n = 2, n);
  begin
    insert into public.review_queue (item_type, item_table, item_id) values ('store', 'stores', v_cp::text);
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('an unknown item type is still rejected|%s|%s', state = '23514', state);

  insert into public.company_sources
    (company_id, source_id, external_id, source_url, fetched_at, last_seen_at, method, method_version, fields)
  values (v_ca, v_src, 'RLS_P3_Approved', 'https://en.wikipedia.org/wiki/RLS_P3_Approved', now(), now(),
          'api', 'fixture@test', array['wikipedia_document_id', 'description']);
  begin
    insert into public.company_sources
      (company_id, source_id, external_id, fetched_at, last_seen_at, method, method_version, fields)
    values (v_ca, v_src, 'again', now(), now(), 'api', 'fixture@test', array['website']);
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('a second company_sources row for (company, source) is rejected|%s|%s', state = '23505', state);
  begin
    insert into public.company_sources
      (company_id, source_id, external_id, fetched_at, last_seen_at, method, method_version, fields)
    values (v_cp, v_src, 'x', now(), now(), 'api', 'fixture@test', array['Not A Column']);
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('company_sources.fields must be column names|%s|%s', state = '23514', state);
  begin
    insert into public.company_sources
      (company_id, source_id, external_id, fetched_at, last_seen_at, method, method_version, fields)
    values (v_cp, v_src, 'x', now(), now(), 'api', 'fixture@test', '{}');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('company_sources.fields cannot be empty|%s|%s', state = '23514', state);
  begin
    insert into public.company_sources
      (company_id, source_id, external_id, fetched_at, last_seen_at, method, method_version, fields)
    values (v_cp, v_src, 'x', now(), now() - interval '1 day', 'api', 'fixture@test', array['website']);
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('company_sources last_seen_at before fetched_at is rejected|%s|%s', state = '23514', state);

  -- anon --------------------------------------------------------------------
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);

  select summary into s from public.documents where id = v_da;
  res := res || format('anon reads the summary of an approved company''s page|%s|%s', s is not null, coalesce(s, 'null'));
  select count(*) into n from public.documents where id = v_dp;
  res := res || format('anon cannot see a pending company''s page|%s|%s rows', n = 0, n);
  select count(*) into n from public.documents where id = v_dn;
  res := res || format('a news document set as a company page stays hidden|%s|%s rows', n = 0, n);
  select count(*) into n from public.documents where id = v_du;
  res := res || format('an unlinked Wikipedia page stays hidden|%s|%s rows', n = 0, n);
  begin
    select count(*) into n from public.company_sources;
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('anon cannot read company_sources|%s|%s', state = '42501', state);
  begin
    update public.documents set summary = 'changed' where id = v_da;
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('anon cannot write documents|%s|%s', state = '42501', state);

  reset role;

  -- authenticated, not an admin ----------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  select count(*) into n from public.documents where id = any (v_docs);
  res := res || format('user sees only the approved company''s page|%s|%s rows', n = 1, n);
  select count(*) into n from public.company_sources;
  res := res || format('user sees no company_sources rows|%s|%s rows', n = 0, n);
  update public.documents set summary = 'changed' where id = v_da;
  get diagnostics n = row_count;
  res := res || format('user cannot change a summary|%s|%s rows updated', n = 0, n);

  reset role;

  -- admin -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select count(*) into n from public.documents where id = any (v_docs);
  res := res || format('admin sees every fixture document|%s|%s rows', n = 4, n);
  select count(*) into n from public.company_sources where company_id = v_ca;
  res := res || format('admin reads company_sources|%s|%s rows', n = 1, n);
  insert into public.company_sources
    (company_id, source_id, external_id, fetched_at, last_seen_at, method, method_version, fields)
  values (v_cp, v_src, 'RLS_P3_Pending', now(), now(), 'manual', 'manual@test', array['website']);
  get diagnostics n = row_count;
  res := res || format('admin writes company_sources|%s|%s rows', n = 1, n);
  update public.companies
  set review_status = 'approved', reviewed_at = now(), decision_method = 'admin', reviewed_by = v_admin
  where id = v_cp;
  get diagnostics n = row_count;
  res := res || format('admin approves the pending company|%s|%s rows', n = 1, n);

  reset role;

  -- The page shows up for anon once its company is approved.
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.documents where id = v_dp;
  res := res || format('anon sees the page once its company is approved|%s|%s rows', n = 1, n);
  reset role;

  -- RLS is on for the new table.
  select count(*) into n from pg_class where oid = 'public.company_sources'::regclass and relrowsecurity;
  res := res || format('company_sources has RLS enabled|%s|%s', n = 1, n);

  insert into results (check_name, ok, detail)
  select split_part(r, '|', 1), split_part(r, '|', 2)::boolean, split_part(r, '|', 3) from unnest(res) as r;
end;
$$;

select n, check_name, ok, detail from results order by n;

rollback;
