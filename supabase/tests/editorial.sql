-- P2.9 RLS and constraint checks for the editorial domain.
-- Run the whole file with the supabase-dev MCP `execute_sql`. Everything happens inside one
-- transaction that is rolled back, so it leaves no rows behind. The last select lists every check;
-- each row must have ok = true.

begin;

create temp table results (n serial, check_name text not null, ok boolean not null, detail text);

do $$
declare
  v_admin constant uuid := '00000000-0000-4000-8000-00000000a001';
  v_user constant uuid := '00000000-0000-4000-8000-00000000a002';
  v_co constant uuid := '00000000-0000-4000-8000-0000000e0001';
  v_p constant uuid := '00000000-0000-4000-8000-0000000e0002';
  v_f_approved constant uuid := '00000000-0000-4000-8000-0000000e0011';
  v_f_pending constant uuid := '00000000-0000-4000-8000-0000000e0012';
  v_st_past constant uuid := '00000000-0000-4000-8000-0000000e0021';
  v_st_future constant uuid := '00000000-0000-4000-8000-0000000e0022';
  v_st_draft constant uuid := '00000000-0000-4000-8000-0000000e0023';
  v_src uuid;
  v_id uuid;
  n bigint;
  t text;
  state text;
  res text[] := '{}';

  -- Each check appends "name|ok|detail"; the rows are written after the role is reset.
begin
  -- Fixtures (as the migration owner) ----------------------------------------
  insert into auth.users (id, email, aud, role)
  values (v_admin, 'rls-admin@test.invalid', 'authenticated', 'authenticated'),
         (v_user, 'rls-user@test.invalid', 'authenticated', 'authenticated');
  update public.profiles set role = 'admin' where id = v_admin;
  select id into v_src from public.sources where key = 'fixture';

  insert into public.companies (id, slug, name, status, source_id, fetched_at, method, method_version)
  values (v_co, 'rls-editorial-co', 'RLS Editorial Co', 'active', v_src, now(), 'manual', 'manual@test');
  insert into public.products (id, external_id, name, source_id, fetched_at, method, method_version)
  values (v_p, 'rls-editorial-1', 'RLS Editorial Product', v_src, now(), 'manual', 'manual@test');

  insert into public.product_features
    (id, product_id, icon, title, description, sort_order, review_status, reviewed_at, decision_method,
     source_id, fetched_at, method, method_version)
  values (v_f_approved, v_p, 'leaf', 'Organic', 'Certified organic.', 0, 'approved', now(), 'admin',
          v_src, now(), 'manual', 'manual@test');
  insert into public.product_features (id, product_id, icon, title, sort_order, source_id, fetched_at, method, method_version)
  values (v_f_pending, v_p, 'recycle', 'Recyclable', 1, v_src, now(), 'legacy-import', 'legacy-import@1');

  insert into public.transparency_steps
    (product_id, step, title, review_status, reviewed_at, decision_method, source_id, fetched_at, method, method_version)
  values (v_p, 'distribution', 'Carbon Offset Shipping', 'approved', now(), 'admin', v_src, now(), 'manual', 'manual@test'),
         (v_p, 'sourcing', 'Natural Filtration', 'approved', now(), 'admin', v_src, now(), 'manual', 'manual@test');
  insert into public.transparency_steps (product_id, step, title, source_id, fetched_at, method, method_version)
  values (v_p, 'production', 'Bottling at Source', v_src, now(), 'legacy-import', 'legacy-import@1');

  insert into public.stories (id, slug, title, category, company_id, featured, published_at, source_id, fetched_at, method, method_version)
  values (v_st_past, 'rls-past-story', 'Past story', 'Supply Chain', v_co, true, now() - interval '1 day',
          v_src, now(), 'manual', 'manual@test'),
         (v_st_future, 'rls-future-story', 'Future story', 'Supply Chain', null, false, now() + interval '1 day',
          v_src, now(), 'manual', 'manual@test'),
         (v_st_draft, 'rls-draft-story', 'Draft story', null, null, false, null, v_src, now(), 'manual', 'manual@test');

  -- Constraints ---------------------------------------------------------------
  select string_agg(step || '=' || step_number, ',' order by step_number) into t
  from public.transparency_steps where product_id = v_p;
  res := res || format('step_number follows step|%s|%s', t = 'sourcing=1,production=2,distribution=4', t);
  begin
    update public.transparency_steps set step_number = 3 where product_id = v_p and step = 'sourcing';
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('step_number cannot be written|%s|%s', state = '428C9', state);
  begin
    insert into public.product_features (product_id, icon, title, sort_order, source_id, fetched_at, method, method_version)
    values (v_p, 'rocket', 'Bad icon', 5, v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('icon outside the allow-list rejected|%s|%s', state = '23514', state);
  begin
    insert into public.product_features (product_id, icon, title, sort_order, source_id, fetched_at, method, method_version)
    values (v_p, null, 'No icon', 5, v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('null icon rejected|%s|%s', state = '23502', state);
  begin
    insert into public.product_features (product_id, icon, title, sort_order, source_id, fetched_at, method, method_version)
    values (v_p, 'dna', 'Same slot', 0, v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('duplicate (product, sort_order) rejected|%s|%s', state = '23505', state);
  insert into public.product_features (product_id, icon, title, sort_order, source_id, fetched_at, method, method_version)
  values (v_p, 'recycle', 'Recyclable (edited)', 1, v_src, now(), 'manual', 'manual@admin-ui')
  on conflict (product_id, sort_order) do update set title = excluded.title, method = excluded.method,
    method_version = excluded.method_version
  returning id into v_id;
  select title into t from public.product_features where id = v_f_pending;
  res := res || format('upsert on the key updates the row in place|%s|%s', v_id = v_f_pending and t = 'Recyclable (edited)', t);
  begin
    insert into public.transparency_steps (product_id, step, title, source_id, fetched_at, method, method_version)
    values (v_p, 'sourcing', 'Second sourcing', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('second step of the same kind per product rejected|%s|%s', state = '23505', state);
  begin
    insert into public.transparency_steps (product_id, step, title, source_id, fetched_at, method, method_version)
    values (v_p, 'shipping', 'Unknown step', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('unknown step rejected|%s|%s', state = '23514', state);
  begin
    insert into public.product_features
      (product_id, icon, title, sort_order, review_status, source_id, fetched_at, method, method_version)
    values (v_p, 'tree', 'Approved without a decision', 6, 'approved', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('approved feature without reviewed_at rejected|%s|%s', state = '23514', state);
  begin
    insert into public.stories (slug, title, source_id, fetched_at, method, method_version)
    values ('Bad Slug', 'Bad slug', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('story with a bad slug rejected|%s|%s', state = '23514', state);
  begin
    insert into public.stories (slug, title, source_id, fetched_at, method, method_version)
    values ('rls-past-story', 'Duplicate slug', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('duplicate story slug rejected|%s|%s', state = '23505', state);
  begin
    insert into public.stories (slug, title, cover_image_path, source_id, fetched_at, method, method_version)
    values ('rls-url-cover', 'URL cover', 'https://images.unsplash.com/photo-1', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('external cover URL rejected|%s|%s', state = '23514', state);
  insert into public.stories (slug, title, cover_image_path, source_id, fetched_at, method, method_version)
  values ('rls-path-cover', 'Path cover', 'story-covers/rls-path-cover.webp', v_src, now(), 'manual', 'manual@test');
  res := res || 'Storage cover path accepted|true|ok'::text;
  delete from public.companies where id = v_co;
  select count(*) into n from public.stories where id = v_st_past and company_id is null;
  res := res || format('deleting the company keeps its story|%s|%s rows', n = 1, n);

  -- anon --------------------------------------------------------------------
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);

  select string_agg(title, ',' order by sort_order) into t from public.product_features where product_id = v_p;
  res := res || format('anon sees only approved features|%s|%s', t = 'Organic', t);
  select string_agg(title, ',' order by step_number) into t from public.transparency_steps where product_id = v_p;
  res := res || format('anon sees only approved steps, in step order|%s|%s', t = 'Natural Filtration,Carbon Offset Shipping', t);
  select string_agg(slug, ',' order by slug) into t from public.stories where slug like 'rls-%';
  res := res || format('anon sees only the published story|%s|%s', t = 'rls-past-story', t);
  select count(*) into n from public.stories where id = v_st_future;
  res := res || format('a future-dated story is hidden from anon|%s|%s rows', n = 0, n);
  begin
    insert into public.stories (slug, title, source_id, fetched_at, method, method_version)
    values ('rls-anon-story', 'Anon story', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('anon cannot insert stories|%s|%s', state = '42501', state);
  begin
    update public.product_features set title = 'hacked' where id = v_f_approved;
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('anon cannot update features|%s|%s', state = '42501', state);

  reset role;

  -- authenticated, not an admin ----------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  select (select count(*) from public.product_features where product_id = v_p)
       + (select count(*) from public.transparency_steps where product_id = v_p)
  into n;
  res := res || format('user sees only approved features and steps|%s|%s rows', n = 3, n);
  select count(*) into n from public.stories where id in (v_st_future, v_st_draft);
  res := res || format('user cannot see future or draft stories|%s|%s rows', n = 0, n);
  begin
    insert into public.transparency_steps (product_id, step, title, source_id, fetched_at, method, method_version)
    values (v_p, 'packaging', 'User step', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('user cannot insert steps|%s|%s', state = '42501', state);
  update public.stories set title = 'hacked' where id = v_st_past;
  get diagnostics n = row_count;
  res := res || format('user cannot update stories|%s|%s rows updated', n = 0, n);
  delete from public.product_features where id = v_f_approved;
  get diagnostics n = row_count;
  res := res || format('user cannot delete features|%s|%s rows deleted', n = 0, n);

  reset role;

  -- admin -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select count(*) into n from public.stories where id in (v_st_past, v_st_future, v_st_draft);
  res := res || format('admin sees every story|%s|%s rows', n = 3, n);
  select (select count(*) from public.product_features where product_id = v_p)
       + (select count(*) from public.transparency_steps where product_id = v_p)
  into n;
  res := res || format('admin sees every feature and step|%s|%s rows', n = 5, n);
  update public.product_features set review_status = 'approved', reviewed_at = now(), decision_method = 'admin', reviewed_by = v_admin
  where id = v_f_pending;
  get diagnostics n = row_count;
  res := res || format('admin approves a feature|%s|%s rows', n = 1, n);
  insert into public.stories (slug, title, published_at, source_id, fetched_at, method, method_version)
  values ('rls-admin-story', 'Admin story', now(), v_src, now(), 'manual', 'manual@admin-ui');
  res := res || 'admin inserts a story|true|ok'::text;
  update public.stories set published_at = now() - interval '1 hour' where id = v_st_future;
  get diagnostics n = row_count;
  res := res || format('admin publishes the future story|%s|%s rows', n = 1, n);
  delete from public.transparency_steps where product_id = v_p and step = 'production';
  get diagnostics n = row_count;
  res := res || format('admin deletes a step|%s|%s rows', n = 1, n);

  reset role;

  -- After the admin's changes, anon sees the approved feature and the newly published story.
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.product_features where product_id = v_p;
  res := res || format('approving a feature makes it visible to anon|%s|%s rows', n = 2, n);
  select count(*) into n from public.stories where id = v_st_future;
  res := res || format('publishing the story makes it visible to anon|%s|%s rows', n = 1, n);
  reset role;

  insert into results (check_name, ok, detail)
  select split_part(r, '|', 1), split_part(r, '|', 2)::boolean, split_part(r, '|', 3) from unnest(res) as r;
end;
$$;

select n, check_name, ok, detail from results order by n;

rollback;
