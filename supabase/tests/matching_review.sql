-- P2.3 RLS and constraint checks for the matching and review domain.
-- Run the whole file with the supabase-dev MCP `execute_sql`. Everything happens inside one
-- transaction that is rolled back, so it leaves no rows behind. The last select lists every check;
-- each row must have ok = true.

begin;

create temp table results (n serial, check_name text not null, ok boolean not null, detail text);

do $$
declare
  v_admin constant uuid := '00000000-0000-4000-8000-00000000a001';
  v_user constant uuid := '00000000-0000-4000-8000-00000000a002';
  v_listing constant uuid := '00000000-0000-4000-8000-0000000b0001';
  v_product constant uuid := '00000000-0000-4000-8000-0000000b0002';
  v_brand constant uuid := '00000000-0000-4000-8000-0000000b0003';
  v_mc bigint;
  v_rq bigint;
  n bigint;
  state text;
  res text[] := '{}';

  -- Each check appends "name|ok|detail"; the rows are written after the role is reset.
begin
  -- Fixtures (as the migration owner) ----------------------------------------
  insert into auth.users (id, email, aud, role)
  values (v_admin, 'rls-admin@test.invalid', 'authenticated', 'authenticated'),
         (v_user, 'rls-user@test.invalid', 'authenticated', 'authenticated');
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.match_candidates
    (kind, subject_type, subject_id, candidate_type, candidate_id, score, match_method, match_method_version)
  values ('listing_product', 'store_listings', v_listing, 'products', v_product, 0.912, 'trigram', 'matcher@0.0.0')
  returning id into v_mc;
  insert into public.review_queue (item_type, item_table, item_id, reason)
  values ('match_candidate', 'match_candidates', v_mc::text, 'fixture') returning id into v_rq;

  -- Constraints -------------------------------------------------------------
  begin
    insert into public.match_candidates
      (kind, subject_type, subject_id, candidate_type, candidate_id, score, match_method, match_method_version)
    values ('listing_product', 'store_listings', v_listing, 'products', v_product, 0.5, 'name_exact', 'matcher@0.0.0');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('duplicate (kind, subject, candidate, version) rejected|%s|%s', state = '23505', state);
  begin
    insert into public.match_candidates
      (kind, subject_type, subject_id, candidate_type, candidate_id, score, match_method, match_method_version)
    values ('listing_product', 'store_listings', v_listing, 'products', v_product, 0.5, 'trigram', 'matcher@0.0.1');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('same pair with a new method version allowed|%s|%s', state = 'none', state);
  begin
    insert into public.match_candidates
      (kind, subject_type, subject_id, candidate_type, candidate_id, score, match_method, match_method_version)
    values ('product_brand', 'brands', v_product, 'brands', v_brand, 0.5, 'trigram', 'matcher@0.0.0');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('kind/type mismatch rejected|%s|%s', state = '23514', state);
  begin
    insert into public.match_candidates
      (kind, subject_type, subject_id, candidate_type, candidate_id, score, match_method, match_method_version)
    values ('product_brand', 'products', v_product, 'brands', v_brand, 1.2, 'trigram', 'matcher@0.0.0');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('score above 1 rejected|%s|%s', state = '23514', state);
  begin
    insert into public.match_candidates
      (kind, subject_type, subject_id, candidate_type, candidate_id, score, match_method, match_method_version)
    values ('product_brand', 'products', v_product, 'brands', v_brand, 0.5, 'guess', 'matcher@0.0.0');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('unknown match_method rejected|%s|%s', state = '23514', state);
  begin
    insert into public.match_candidates
      (kind, subject_type, subject_id, candidate_type, candidate_id, score, match_method, match_method_version)
    values ('product_brand', 'products', v_product, 'brands', v_brand, 0.5, 'rule:strip-suffix', 'matcher@0.0.0');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('rule:<name> match_method accepted|%s|%s', state = 'none', state);
  begin
    update public.match_candidates set status = 'accepted' where id = v_mc;
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('accepted without decided_at rejected|%s|%s', state = '23514', state);
  begin
    update public.match_candidates set status = 'accepted', decided_at = now(), decision_method = 'auto', decided_by = v_admin
    where id = v_mc;
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('auto decision with a person rejected|%s|%s', state = '23514', state);
  begin
    insert into public.match_candidates
      (kind, subject_type, subject_id, candidate_type, candidate_id, score, match_method, match_method_version, features)
    values ('brand_company', 'brands', v_brand, 'companies', v_product, 0.5, 'trigram', 'matcher@0.0.0',
            jsonb_build_object('pad', repeat('x', 1100)));
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('features over 1 KB rejected|%s|%s', state = '23514', state);
  begin
    insert into public.review_queue (item_type, item_table, item_id) values ('match_candidate', 'match_candidates', v_mc::text);
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('second open queue row for one item rejected|%s|%s', state = '23505', state);
  begin
    insert into public.review_queue (item_type, item_table, item_id) values ('product', 'products', 'not-an-id');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('malformed item_id rejected|%s|%s', state = '23514', state);
  begin
    update public.review_queue set status = 'done' where id = v_rq;
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('done without resolved_at rejected|%s|%s', state = '23514', state);

  -- anon --------------------------------------------------------------------
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);

  begin perform 1 from public.match_candidates; state := 'none'; exception when others then state := sqlstate; end;
  res := res || format('anon denied match_candidates|%s|%s', state = '42501', state);
  begin perform 1 from public.review_queue; state := 'none'; exception when others then state := sqlstate; end;
  res := res || format('anon denied review_queue|%s|%s', state = '42501', state);
  begin
    insert into public.review_queue (item_type, item_table, item_id) values ('product', 'products', '1');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('anon cannot insert review_queue|%s|%s', state = '42501', state);

  reset role;

  -- authenticated, not an admin ----------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  select (select count(*) from public.match_candidates) + (select count(*) from public.review_queue) into n;
  res := res || format('user sees no matching or review rows|%s|%s rows', n = 0, n);
  begin
    insert into public.review_queue (item_type, item_table, item_id) values ('product', 'products', '1');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('user cannot insert review_queue|%s|%s', state = '42501', state);
  begin
    insert into public.match_candidates
      (kind, subject_type, subject_id, candidate_type, candidate_id, score, match_method, match_method_version)
    values ('brand_company', 'brands', v_brand, 'companies', v_product, 0.5, 'trigram', 'matcher@0.0.0');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('user cannot insert match_candidates|%s|%s', state = '42501', state);
  update public.match_candidates set status = 'rejected', decided_at = now(), decision_method = 'admin' where id = v_mc;
  get diagnostics n = row_count;
  res := res || format('user cannot decide a candidate|%s|%s rows updated', n = 0, n);

  reset role;

  -- admin -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select (select count(*) from public.match_candidates where id = v_mc) + (select count(*) from public.review_queue where id = v_rq)
  into n;
  res := res || format('admin reads both tables|%s|%s rows', n = 2, n);
  update public.match_candidates
  set status = 'accepted', decided_at = now(), decision_method = 'admin', decided_by = v_admin
  where id = v_mc;
  get diagnostics n = row_count;
  res := res || format('admin accepts a candidate|%s|%s rows', n = 1, n);
  update public.review_queue set status = 'done', resolved_at = now(), resolved_by = v_admin where id = v_rq;
  get diagnostics n = row_count;
  res := res || format('admin resolves a queue row|%s|%s rows', n = 1, n);
  insert into public.review_queue (item_type, item_table, item_id) values ('match_candidate', 'match_candidates', v_mc::text);
  res := res || 'admin re-queues a resolved item|true|ok'::text;
  delete from public.review_queue where id = v_rq;
  get diagnostics n = row_count;
  res := res || format('admin deletes a queue row|%s|%s rows', n = 1, n);

  reset role;

  insert into results (check_name, ok, detail)
  select split_part(r, '|', 1), split_part(r, '|', 2)::boolean, split_part(r, '|', 3) from unnest(res) as r;
end;
$$;

select n, check_name, ok, detail from results order by n;

rollback;
