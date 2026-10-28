-- P2.1 RLS and constraint checks for the pipeline bookkeeping domain.
-- Run the whole file with the supabase-dev MCP `execute_sql`. Everything happens inside one
-- transaction that is rolled back, so it leaves no rows behind. The last select lists every check;
-- each row must have ok = true.

begin;

create temp table results (n serial, check_name text not null, ok boolean not null, detail text);

do $$
declare
  v_admin constant uuid := '00000000-0000-4000-8000-00000000a001';
  v_user constant uuid := '00000000-0000-4000-8000-00000000a002';
  v_src uuid;
  v_run uuid;
  v_raw uuid;
  n bigint;
  state text;
  txt text;
  res text[] := '{}';

  -- Each check appends "name|ok|detail"; the rows are written after the role is reset.
begin
  -- Fixtures (as the migration owner) ----------------------------------------
  insert into auth.users (id, email, aud, role)
  values (v_admin, 'rls-admin@test.invalid', 'authenticated', 'authenticated'),
         (v_user, 'rls-user@test.invalid', 'authenticated', 'authenticated');
  update public.profiles set role = 'admin' where id = v_admin;

  insert into public.sources (key, name, access_method, verdict)
  values ('rls-test-src', 'RLS test source', 'internal', 'use') returning id into v_src;
  insert into public.sources (key, name, access_method, verdict, enabled)
  values ('rls-test-avoid', 'RLS test avoided', 'scrape', 'avoid', false);
  insert into public.ingestion_runs (source_id, job, job_version, mode, triggered_by)
  values (v_src, 'rls-test', '0.0.0', 'full', 'cli') returning id into v_run;
  insert into public.ingestion_run_events (run_id, severity, event_type, message)
  values (v_run, 'info', 'test', 'fixture event');
  insert into public.raw_objects (source_id, run_id, storage_path, content_sha256, byte_size, content_type, fetched_at)
  values (v_src, v_run, 'rls-test/' || v_run || '/0.json.gz', repeat('a', 64), 10, 'application/gzip', now())
  returning id into v_raw;
  insert into public.validation_failures (run_id, raw_object_id, rule, message)
  values (v_run, v_raw, 'schema', 'fixture failure');
  insert into storage.objects (bucket_id, name) values ('raw', 'rls-test/' || v_run || '/0.json.gz');

  -- Helpers -----------------------------------------------------------------
  txt := public.normalize_match_text(E'  Ben’s  ÉPICERIE ');
  res := res || format('normalize_match_text strips accents, case, spaces|%s|%s', txt in (E'ben’s epicerie', 'ben''s epicerie'), txt);

  begin perform 'Bad Slug'::public.slug; state := 'none'; exception when others then state := sqlstate; end;
  res := res || format('slug rejects "Bad Slug"|%s|%s', state = '23514', state);
  begin perform 'bens-original'::public.slug; state := 'none'; exception when others then state := sqlstate; end;
  res := res || format('slug accepts "bens-original"|%s|%s', state = 'none', state);
  begin perform repeat('a', 65)::public.slug; state := 'none'; exception when others then state := sqlstate; end;
  res := res || format('slug rejects 65 characters|%s|%s', state = '23514', state);

  -- Constraints -------------------------------------------------------------
  begin
    insert into public.sources (key, name, access_method, verdict, enabled) values ('rls-test-bad', 'x', 'scrape', 'avoid', true);
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('avoid source cannot be enabled|%s|%s', state = '23514', state);
  begin
    insert into public.sources (key, name, access_method, verdict, rate_limit_per_sec) values ('rls-test-fast', 'x', 'api', 'use', 2);
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('rate limit above 1 req/s rejected|%s|%s', state = '23514', state);
  begin
    insert into public.ingestion_runs (source_id, job, job_version, mode, triggered_by, finished_at)
    values (v_src, 'rls-test', '0.0.0', 'full', 'cli', now());
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('running run cannot have finished_at|%s|%s', state = '23514', state);

  -- anon --------------------------------------------------------------------
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);

  select count(*) into n from public.sources where key like 'rls-test-%';
  res := res || format('anon reads sources|%s|%s rows', n = 2, n);
  select count(*) into n from public.source_attributions where key like 'rls-test-%';
  res := res || format('anon attribution view hides avoided source|%s|%s rows', n = 1, n);
  begin insert into public.sources (key, name, access_method, verdict) values ('rls-test-anon', 'x', 'api', 'use'); state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('anon cannot insert sources|%s|%s', state = '42501', state);
  begin perform 1 from public.ingestion_runs; state := 'none'; exception when others then state := sqlstate; end;
  res := res || format('anon denied ingestion_runs|%s|%s', state = '42501', state);
  begin perform 1 from public.ingestion_run_events; state := 'none'; exception when others then state := sqlstate; end;
  res := res || format('anon denied ingestion_run_events|%s|%s', state = '42501', state);
  begin perform 1 from public.raw_objects; state := 'none'; exception when others then state := sqlstate; end;
  res := res || format('anon denied raw_objects|%s|%s', state = '42501', state);
  begin perform 1 from public.validation_failures; state := 'none'; exception when others then state := sqlstate; end;
  res := res || format('anon denied validation_failures|%s|%s', state = '42501', state);
  select count(*) into n from storage.objects where bucket_id = 'raw';
  res := res || format('anon cannot list the raw bucket|%s|%s objects', n = 0, n);

  reset role;

  -- authenticated, not an admin ----------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  select count(*) into n from public.sources where key like 'rls-test-%';
  res := res || format('user reads sources|%s|%s rows', n = 2, n);
  begin insert into public.sources (key, name, access_method, verdict) values ('rls-test-user', 'x', 'api', 'use'); state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('user cannot insert sources|%s|%s', state = '42501', state);
  update public.sources set name = 'hacked' where key = 'rls-test-src';
  get diagnostics n = row_count;
  res := res || format('user cannot update sources|%s|%s rows updated', n = 0, n);
  select (select count(*) from public.ingestion_runs) + (select count(*) from public.ingestion_run_events)
       + (select count(*) from public.raw_objects) + (select count(*) from public.validation_failures) into n;
  res := res || format('user sees no run bookkeeping rows|%s|%s rows', n = 0, n);
  begin
    insert into public.ingestion_runs (source_id, job, job_version, mode, triggered_by) values (v_src, 'x', '0', 'full', 'cli');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('user cannot insert ingestion_runs|%s|%s', state = '42501', state);
  select count(*) into n from storage.objects where bucket_id = 'raw';
  res := res || format('user cannot list the raw bucket|%s|%s objects', n = 0, n);

  reset role;

  -- admin -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select (select count(*) from public.ingestion_runs where id = v_run)
       + (select count(*) from public.ingestion_run_events where ingestion_run_events.run_id = v_run)
       + (select count(*) from public.raw_objects where id = v_raw)
       + (select count(*) from public.validation_failures where validation_failures.run_id = v_run) into n;
  res := res || format('admin reads all four bookkeeping tables|%s|%s rows', n = 4, n);
  update public.ingestion_runs set status = 'cancelled', finished_at = now() where id = v_run;
  get diagnostics n = row_count;
  res := res || format('admin updates a run|%s|%s rows', n = 1, n);
  insert into public.ingestion_run_events (run_id, severity, event_type, message) values (v_run, 'warn', 'test', 'admin event');
  res := res || 'admin inserts an event|true|ok'::text;
  insert into public.sources (key, name, access_method, verdict) values ('rls-test-admin', 'x', 'manual', 'manual_only');
  update public.sources set name = 'RLS test (renamed)' where key = 'rls-test-src';
  get diagnostics n = row_count;
  res := res || format('admin inserts and updates sources|%s|%s rows updated', n = 1, n);
  delete from public.sources where key = 'rls-test-admin';
  get diagnostics n = row_count;
  res := res || format('admin deletes a source|%s|%s rows', n = 1, n);
  select count(*) into n from storage.objects where bucket_id = 'raw' and name like 'rls-test/%';
  res := res || format('admin can list the raw bucket|%s|%s objects', n = 1, n);

  reset role;

  insert into results (check_name, ok, detail)
  select split_part(r, '|', 1), split_part(r, '|', 2)::boolean, split_part(r, '|', 3) from unnest(res) as r;
end;
$$;

select n, check_name, ok, detail from results order by n;

rollback;
