-- P2.7 RLS and constraint checks for the AI and audit domain.
-- Run the whole file with the supabase-dev MCP `execute_sql`. Everything happens inside one
-- transaction that is rolled back, so it leaves no rows behind. The last select lists every check;
-- each row must have ok = true.

begin;

create temp table results (n serial, check_name text not null, ok boolean not null, detail text);

do $$
declare
  v_admin constant uuid := '00000000-0000-4000-8000-00000000a001';
  v_user constant uuid := '00000000-0000-4000-8000-00000000a002';
  v_co constant uuid := '00000000-0000-4000-8000-0000000c0001';
  v_co2 constant uuid := '00000000-0000-4000-8000-0000000c0002';
  v_br constant uuid := '00000000-0000-4000-8000-0000000c0003';
  v_cat constant uuid := '00000000-0000-4000-8000-0000000c0004';
  v_src uuid;
  v_call bigint;
  v_call2 bigint;
  v_audit bigint;
  v_co_edge uuid;
  v_br_edge uuid;
  v_map bigint;
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
  select id into v_src from public.sources where key = 'fixture';

  insert into public.ai_calls (purpose, model, prompt_version, rubric_version, input_tokens, output_tokens, cost_usd,
                               latency_ms, status)
  values ('research_brand_owner', 'google/gemini-2.5-flash-lite', 'owner@1', null, 900, 120, 0.000138, 840, 'ok')
  returning id into v_call;
  insert into public.ai_calls (purpose, model, prompt_version, status, user_id, mock)
  values ('parse_receipt', 'mock', 'receipt@1', 'ok', v_user, true)
  returning id into v_call2;
  insert into public.audit_log (actor_id, table_name, row_id, action, changes)
  values (v_admin, 'companies', v_co::text, 'update', '{"name": ["Old", "New"]}')
  returning id into v_audit;

  insert into public.companies (id, slug, name, status, source_id, fetched_at, method, method_version)
  values (v_co, 'rls-ai-parent', 'RLS AI Parent', 'active', v_src, now(), 'manual', 'manual@test'),
         (v_co2, 'rls-ai-child', 'RLS AI Child', 'active', v_src, now(), 'manual', 'manual@test');
  insert into public.brands (id, slug, name, source_id, fetched_at, method, method_version)
  values (v_br, 'rls-ai-brand', 'RLS AI Brand', v_src, now(), 'manual', 'manual@test');
  insert into public.categories (id, slug, name, parent_id, level) values (v_cat, 'rls-ai-cat', 'RLS AI Cat', null, 0);

  insert into public.company_ownership
    (parent_company_id, child_company_id, relation, confidence, ai_call_id, source_id, fetched_at, method, method_version)
  values (v_co, v_co2, 'subsidiary', 0.8, v_call, v_src, now(), 'ai', 'openrouter:test|owner@1')
  returning id into v_co_edge;
  insert into public.brand_ownership
    (brand_id, company_id, relation, confidence, ai_call_id, source_id, fetched_at, method, method_version)
  values (v_br, v_co2, 'owner', 0.7, v_call, v_src, now(), 'ai', 'openrouter:test|owner@1')
  returning id into v_br_edge;
  insert into public.category_mappings
    (source_id, source_category_key, category_id, confidence, ai_call_id, fetched_at, method, method_version)
  values (v_src, 'rls:ai-cat', v_cat, 0.9, v_call, now(), 'ai', 'openrouter:test|category@1')
  returning id into v_map;
  res := res || 'ai_call_id accepted on company_ownership, brand_ownership, category_mappings|true|ok'::text;

  -- Constraints -------------------------------------------------------------
  begin
    insert into public.ai_calls (purpose, model, prompt_version, status) values ('summarize', 'm', 'p@1', 'ok');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('unknown purpose rejected|%s|%s', state = '23514', state);
  begin
    insert into public.ai_calls (purpose, model, prompt_version, status) values ('score_company', 'm', 'p@1', 'timeout');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('unknown status rejected|%s|%s', state = '23514', state);
  begin
    insert into public.ai_calls (purpose, model, prompt_version, status, input_tokens)
    values ('score_company', 'm', 'p@1', 'ok', -1);
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('negative tokens rejected|%s|%s', state = '23514', state);
  begin
    insert into public.ai_calls (purpose, model, prompt_version, status, user_id)
    values ('score_company', 'm', 'p@1', 'ok', v_user);
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('user_id on a non-receipt call rejected|%s|%s', state = '23514', state);
  begin
    insert into public.ai_calls (purpose, model, prompt_version, status, mock, cost_usd)
    values ('score_company', 'mock', 'p@1', 'ok', true, 0.01);
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('mock call with a cost rejected|%s|%s', state = '23514', state);
  begin
    insert into public.ai_calls (purpose, model, prompt_version, status, input_tokens)
    values ('score_company', 'm', 'p@1', 'budget_blocked', 10);
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('budget_blocked call with tokens rejected|%s|%s', state = '23514', state);
  begin
    insert into public.ai_calls (purpose, model, prompt_version, status) values ('score_company', 'm', 'p@1', 'budget_blocked');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('budget_blocked call with no tokens accepted|%s|%s', state = 'none', state);
  begin
    insert into public.audit_log (actor_id, table_name, row_id, action) values (v_admin, 'companies', v_co::text, 'upsert');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('unknown audit action rejected|%s|%s', state = '23514', state);
  begin
    insert into public.audit_log (actor_id, table_name, row_id, action) values (v_admin, 'companies', 'rls-a', 'update');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('malformed audit row_id rejected|%s|%s', state = '23514', state);
  begin
    insert into public.audit_log (actor_id, table_name, row_id, action, changes)
    values (v_admin, 'companies', v_co::text, 'update', '["name"]');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('non-object changes rejected|%s|%s', state = '23514', state);
  begin
    insert into public.audit_log (actor_id, table_name, row_id, action, changes)
    values (v_admin, 'companies', v_co::text, 'update', jsonb_build_object('pad', repeat('x', 17000)));
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('changes over 16 KB rejected|%s|%s', state = '23514', state);

  -- anon --------------------------------------------------------------------
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);

  begin perform 1 from public.ai_calls; state := 'none'; exception when others then state := sqlstate; end;
  res := res || format('anon denied ai_calls|%s|%s', state = '42501', state);
  begin perform 1 from public.audit_log; state := 'none'; exception when others then state := sqlstate; end;
  res := res || format('anon denied audit_log|%s|%s', state = '42501', state);
  begin
    insert into public.ai_calls (purpose, model, prompt_version, status) values ('score_company', 'm', 'p@1', 'ok');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('anon cannot insert ai_calls|%s|%s', state = '42501', state);
  select count(*) into n from public.brand_ownership where id = v_br_edge;
  res := res || format('anon still cannot see a pending AI edge|%s|%s rows', n = 0, n);

  reset role;

  -- authenticated, not an admin ----------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  select (select count(*) from public.ai_calls) + (select count(*) from public.audit_log) into n;
  res := res || format('user sees no ai_calls or audit rows (even their own receipt call)|%s|%s rows', n = 0, n);
  begin
    insert into public.ai_calls (purpose, model, prompt_version, status) values ('score_company', 'm', 'p@1', 'ok');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('user cannot insert ai_calls|%s|%s', state = '42501', state);
  begin
    insert into public.audit_log (actor_id, table_name, row_id, action) values (v_user, 'companies', v_co::text, 'update');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('user cannot insert audit_log|%s|%s', state = '42501', state);
  update public.ai_calls set cost_usd = 0 where id = v_call;
  get diagnostics n = row_count;
  res := res || format('user cannot update ai_calls|%s|%s rows updated', n = 0, n);

  reset role;

  -- admin -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select (select count(*) from public.ai_calls where id in (v_call, v_call2))
       + (select count(*) from public.audit_log where id = v_audit)
  into n;
  res := res || format('admin reads both tables|%s|%s rows', n = 3, n);
  insert into public.ai_calls (purpose, model, prompt_version, status) values ('tag_document', 'm', 'tag@1', 'http_error');
  res := res || 'admin inserts an ai_call|true|ok'::text;
  update public.ai_calls set latency_ms = 900 where id = v_call;
  get diagnostics n = row_count;
  res := res || format('admin updates an ai_call|%s|%s rows', n = 1, n);
  insert into public.audit_log (actor_id, table_name, row_id, action, changes, note)
  values (v_admin, 'brand_ownership', v_br_edge::text, 'review', '{"review_status": ["pending", "approved"]}', 'test');
  res := res || 'admin inserts an audit row as themselves|true|ok'::text;
  begin
    insert into public.audit_log (actor_id, table_name, row_id, action) values (v_user, 'companies', v_co::text, 'update');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('admin cannot write an audit row as someone else|%s|%s', state = '42501', state);
  begin
    insert into public.audit_log (table_name, row_id, action) values ('companies', v_co::text, 'update');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('admin cannot write an audit row with no actor|%s|%s', state = '42501', state);
  begin
    update public.audit_log set note = 'edited' where id = v_audit;
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('admin cannot update audit_log (append-only)|%s|%s', state = '42501', state);
  begin
    delete from public.audit_log where id = v_audit;
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('admin cannot delete audit_log (append-only)|%s|%s', state = '42501', state);
  delete from public.ai_calls where id = v_call;
  get diagnostics n = row_count;
  res := res || format('admin deletes an ai_call|%s|%s rows', n = 1, n);

  reset role;

  -- Deleting the call nulls the links on the fact rows (on delete set null).
  select (select count(*) from public.company_ownership where id = v_co_edge and ai_call_id is null)
       + (select count(*) from public.brand_ownership where id = v_br_edge and ai_call_id is null)
       + (select count(*) from public.category_mappings where id = v_map and ai_call_id is null)
  into n;
  res := res || format('deleting an ai_call keeps the facts and nulls ai_call_id|%s|%s of 3', n = 3, n);

  insert into results (check_name, ok, detail)
  select split_part(r, '|', 1), split_part(r, '|', 2)::boolean, split_part(r, '|', 3) from unnest(res) as r;
end;
$$;

select n, check_name, ok, detail from results order by n;

rollback;
