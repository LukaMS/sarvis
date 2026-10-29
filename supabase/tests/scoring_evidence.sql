-- P2.8 RLS and constraint checks for the scoring and evidence domain.
-- Run the whole file with the supabase-dev MCP `execute_sql`. Everything happens inside one
-- transaction that is rolled back, so it leaves no rows behind. The last select lists every check;
-- each row must have ok = true. The deferred citation check is forced with `set constraints all immediate`;
-- the real commit-time failure is checked by the separate block at the end of this file.

begin;

create temp table results (n serial, check_name text not null, ok boolean not null, detail text);

do $$
declare
  v_admin constant uuid := '00000000-0000-4000-8000-00000000a001';
  v_user constant uuid := '00000000-0000-4000-8000-00000000a002';
  v_co constant uuid := '00000000-0000-4000-8000-0000000d0001';
  v_br constant uuid := '00000000-0000-4000-8000-0000000d0002';
  v_r1 constant uuid := '00000000-0000-4000-8000-0000000d0011';
  v_r2 constant uuid := '00000000-0000-4000-8000-0000000d0012';
  v_d_cited constant uuid := '00000000-0000-4000-8000-0000000d0021';
  v_d_pending_link constant uuid := '00000000-0000-4000-8000-0000000d0022';
  v_d_unlinked constant uuid := '00000000-0000-4000-8000-0000000d0023';
  v_d_cert constant uuid := '00000000-0000-4000-8000-0000000d0024';
  v_d_pending_cite constant uuid := '00000000-0000-4000-8000-0000000d0025';
  v_d_extra constant uuid := '00000000-0000-4000-8000-0000000d0026';
  v_s_approved constant uuid := '00000000-0000-4000-8000-0000000d0031';
  v_s_pending constant uuid := '00000000-0000-4000-8000-0000000d0032';
  v_s_superseded constant uuid := '00000000-0000-4000-8000-0000000d0033';
  v_s_new constant uuid := '00000000-0000-4000-8000-0000000d0034';
  v_s_legacy constant uuid := '00000000-0000-4000-8000-0000000d0035';
  v_src uuid;
  v_cite bigint;
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
  values (v_co, 'rls-score-co', 'RLS Score Co', 'active', v_src, now(), 'manual', 'manual@test');
  insert into public.brands (id, slug, name, source_id, fetched_at, method, method_version)
  values (v_br, 'rls-score-brand', 'RLS Score Brand', v_src, now(), 'manual', 'manual@test');

  insert into public.rubrics (id, version, categories, grade_thresholds, evidence_rules, published_at)
  values (v_r1, 'v1', '{"environment": "test"}', '[[95, "A+"], [0, "F"]]', 'At least one source.', now()),
         (v_r2, 'v2', '{"environment": "draft"}', '[[0, "F"]]', 'Draft.', null);

  insert into public.documents (id, url, url_normalized, kind, title, source_id, fetched_at, method, method_version)
  values (v_d_cited, 'https://example.org/cited', 'https://example.org/cited', 'news', 'Cited', v_src, now(), 'manual', 'manual@test'),
         (v_d_pending_link, 'https://example.org/pl', 'https://example.org/pl', 'news', 'Pending link', v_src, now(), 'manual', 'manual@test'),
         (v_d_unlinked, 'https://example.org/un', 'https://example.org/un', 'news', 'Unlinked', v_src, now(), 'manual', 'manual@test'),
         (v_d_cert, 'https://example.org/cert', 'https://example.org/cert', 'certification_page', 'Cert', v_src, now(), 'manual', 'manual@test'),
         (v_d_pending_cite, 'https://example.org/pc', 'https://example.org/pc', 'report', 'Pending cite', v_src, now(), 'manual', 'manual@test'),
         (v_d_extra, 'https://example.org/ex', 'https://example.org/ex', 'report', 'Extra', v_src, now(), 'manual', 'manual@test');

  -- An approved environment score with a citation, a pending one with a citation, and a superseded one.
  insert into public.company_scores
    (id, company_id, rubric_id, category, rating, confidence, model, source_id, fetched_at, method, method_version)
  values (v_s_approved, v_co, v_r1, 'environment', 'Mixed', 0.80, 'test/model', v_src, now(), 'ai', 'openrouter:test|score@1|rubric@v1'),
         (v_s_pending, v_co, v_r1, 'environment', 'Poor', 0.60, 'test/model', v_src, now(), 'ai', 'openrouter:test|score@1|rubric@v1');
  insert into public.score_citations (score_id, document_id, quote, stance, added_by_method)
  values (v_s_approved, v_d_cited, 'A short excerpt.', 'supports_poor', 'ai'),
         (v_s_pending, v_d_pending_cite, null, 'context', 'ai');
  update public.company_scores set review_status = 'approved', reviewed_at = now(), decision_method = 'admin', reviewed_by = v_admin
  where id = v_s_approved;
  insert into public.company_scores
    (id, company_id, rubric_id, category, rating, confidence, superseded_by_id, review_status, reviewed_at, decision_method,
     source_id, fetched_at, method, method_version)
  values (v_s_superseded, v_co, v_r1, 'environment', 'Good', 0.5, v_s_approved, 'superseded', now(), 'admin',
          v_src, now(), 'manual', 'manual@admin-ui');

  insert into public.document_entities (document_id, company_id, relevance, stance, categories, source_id, fetched_at, method, method_version)
  values (v_d_pending_link, v_co, 0.9, 'bad', '{environment}', v_src, now(), 'manual', 'manual@test');
  insert into public.certifications
    (company_id, scheme, document_id, review_status, reviewed_at, decision_method, source_id, fetched_at, method, method_version)
  values (v_co, 'b_corp', v_d_cert, 'approved', now(), 'admin', v_src, now(), 'manual', 'manual@test');
  insert into public.company_events (company_id, kind, title, severity, source_id, fetched_at, method, method_version)
  values (v_co, 'controversy', 'Pending controversy', 'critical', v_src, now(), 'legacy-import', 'legacy-import@1');
  res := res || 'severity critical accepted (legacy)|true|ok'::text;

  begin set constraints all immediate; state := 'none'; exception when others then state := sqlstate; end;
  set constraints all deferred;
  res := res || format('fixtures pass the citation check|%s|%s', state = 'none', state);

  -- Citation rule (deferred constraint trigger) ------------------------------
  insert into public.company_scores
    (id, company_id, rubric_id, category, score, grade, confidence, source_id, fetched_at, method, method_version)
  values (v_s_new, v_co, v_r1, 'overall', 72, 'B-', 0.7, v_src, now(), 'manual', 'manual@admin-ui');
  begin
    update public.company_scores set review_status = 'approved', reviewed_at = now(), decision_method = 'admin', reviewed_by = v_admin
    where id = v_s_new;
    res := res || 'approving an uncited score is accepted until the check runs|true|ok'::text;
    set constraints all immediate;
    state := 'none';
  exception when others then state := sqlstate; end;
  set constraints all deferred;
  res := res || format('approved score with no citation fails at the check|%s|%s', state = '23514', state);
  begin
    insert into public.score_citations (score_id, document_id, stance, added_by_method)
    values (v_s_new, v_d_cited, 'context', 'manual') returning id into v_cite;
    update public.company_scores set review_status = 'approved', reviewed_at = now(), decision_method = 'admin', reviewed_by = v_admin
    where id = v_s_new;
    set constraints all immediate;
    state := 'none';
  exception when others then state := sqlstate; end;
  set constraints all deferred;
  res := res || format('approved score passes once a citation is added|%s|%s', state = 'none', state);
  begin
    delete from public.score_citations where id = v_cite;
    set constraints all immediate;
    state := 'none';
  exception when others then state := sqlstate; end;
  set constraints all deferred;
  res := res || format('deleting the last citation of an approved score fails|%s|%s', state = '23514', state);
  begin
    insert into public.score_citations (score_id, document_id, stance, added_by_method)
    values (v_s_new, v_d_extra, 'context', 'manual');
    delete from public.score_citations where id = v_cite;
    set constraints all immediate;
    state := 'none';
  exception when others then state := sqlstate; end;
  set constraints all deferred;
  res := res || format('deleting one of two citations is fine|%s|%s', state = 'none', state);

  -- Score constraints ---------------------------------------------------------
  begin
    insert into public.company_scores
      (company_id, rubric_id, category, rating, confidence, review_status, reviewed_at, decision_method,
       source_id, fetched_at, method, method_version)
    values (v_co, v_r1, 'environment', 'Good', 0.9, 'approved', now(), 'auto', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('second approved score per company x category rejected|%s|%s', state = '23505', state);
  begin
    insert into public.company_scores (company_id, rubric_id, category, rating, score, confidence, source_id, fetched_at, method, method_version)
    values (v_co, v_r1, 'labour', 'Good', 50, 0.9, v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('category score with a 0-100 score rejected|%s|%s', state = '23514', state);
  begin
    insert into public.company_scores (company_id, rubric_id, category, score, confidence, source_id, fetched_at, method, method_version)
    values (v_co, v_r1, 'overall', 50, 0.9, v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('overall score without a grade rejected|%s|%s', state = '23514', state);
  begin
    insert into public.company_scores (company_id, rubric_id, category, rating, confidence, source_id, fetched_at, method, method_version)
    values (v_co, v_r1, 'labour', 'Good', 0.9, v_src, now(), 'ai', 'openrouter:test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('ai score without a model rejected|%s|%s', state = '23514', state);
  begin
    insert into public.company_scores (company_id, rubric_id, category, rating, source_id, fetched_at, method, method_version)
    values (v_co, v_r1, 'labour', 'Good', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('manual score without confidence rejected|%s|%s', state = '23514', state);
  begin
    insert into public.company_scores (company_id, category, rating, source_id, fetched_at, method, method_version)
    values (v_co, 'labour', 'Good', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('manual score without a rubric rejected|%s|%s', state = '23514', state);
  begin
    insert into public.company_scores (id, company_id, category, rating, source_id, fetched_at, method, method_version)
    values (v_s_legacy, v_co, 'overall', 'Mixed', v_src, now(), 'legacy-import', 'legacy-import@1');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('legacy overall rating with no confidence or rubric accepted as pending|%s|%s', state = 'none', state);
  begin
    insert into public.company_scores (company_id, category, rating, source_id, fetched_at, method, method_version)
    values (v_co, 'overall', 'Poor', v_src, now(), 'legacy-import', 'legacy-import@1');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('second legacy row per company x category rejected|%s|%s', state = '23505', state);
  begin
    update public.company_scores set review_status = 'approved', reviewed_at = now(), decision_method = 'legacy'
    where id = v_s_legacy;
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('approving a legacy score with no confidence or rubric rejected|%s|%s', state = '23514', state);
  begin
    update public.company_scores set superseded_by_id = v_s_new where id = v_s_pending;
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('superseded_by on a non-superseded score rejected|%s|%s', state = '23514', state);
  begin
    insert into public.score_citations (score_id, document_id, quote, stance, added_by_method)
    values (v_s_pending, v_d_unlinked, repeat('x', 301), 'context', 'ai');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('citation quote over 300 characters rejected|%s|%s', state = '23514', state);

  -- Evidence constraints ------------------------------------------------------
  begin
    insert into public.documents (url, url_normalized, kind, source_id, fetched_at, method, method_version)
    values ('https://EXAMPLE.org/cited#x', 'https://example.org/cited', 'news', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('duplicate url_normalized rejected|%s|%s', state = '23505', state);
  begin
    insert into public.documents (url, url_normalized, kind, sec_accession, source_id, fetched_at, method, method_version)
    values ('https://example.org/n2', 'https://example.org/n2', 'news', '0000320193-24-000123', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('SEC fields on a news document rejected|%s|%s', state = '23514', state);
  begin
    insert into public.document_entities (document_id, company_id, brand_id, relevance, stance, source_id, fetched_at, method, method_version)
    values (v_d_unlinked, v_co, v_br, 0.5, 'neutral', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('document entity with both company and brand rejected|%s|%s', state = '23514', state);
  begin
    insert into public.document_entities (document_id, relevance, stance, source_id, fetched_at, method, method_version)
    values (v_d_unlinked, 0.5, 'neutral', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('document entity with no subject rejected|%s|%s', state = '23514', state);
  begin
    insert into public.document_entities (document_id, company_id, relevance, stance, source_id, fetched_at, method, method_version)
    values (v_d_pending_link, v_co, 0.5, 'good', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('duplicate (document, company) entity rejected|%s|%s', state = '23505', state);
  begin
    insert into public.document_entities (document_id, brand_id, relevance, stance, categories, source_id, fetched_at, method, method_version)
    values (v_d_unlinked, v_br, 0.5, 'good', '{overall}', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('entity category outside the rubric rejected|%s|%s', state = '23514', state);
  begin
    insert into public.certifications (company_id, brand_id, scheme, source_id, fetched_at, method, method_version)
    values (v_co, v_br, 'fairtrade', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('certification with two subjects rejected|%s|%s', state = '23514', state);
  begin
    insert into public.certifications
      (brand_id, scheme, review_status, reviewed_at, decision_method, source_id, fetched_at, method, method_version)
    values (v_br, 'fairtrade', 'approved', now(), 'admin', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('approved certification without a document rejected|%s|%s', state = '23514', state);
  begin
    insert into public.certifications (brand_id, scheme, source_id, fetched_at, method, method_version)
    values (v_br, 'other', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('certification scheme other without a name rejected|%s|%s', state = '23514', state);
  begin
    insert into public.external_ratings (company_id, scheme, period, score, max_score, document_id, source_id, fetched_at, method, method_version)
    values (v_co, 'knowthechain', '2026', 120, 100, v_d_unlinked, v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('external rating above max_score rejected|%s|%s', state = '23514', state);
  begin
    insert into public.company_events (company_id, kind, title, source_id, fetched_at, method, method_version)
    values (v_co, 'scandal', 'Bad kind', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('unknown event kind rejected|%s|%s', state = '23514', state);

  -- anon --------------------------------------------------------------------
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);

  select string_agg(id::text, ',' order by id) into t from public.company_scores where company_id = v_co;
  res := res || format('anon sees only the approved scores|%s|%s', t = v_s_approved || ',' || v_s_new, t);
  select count(*) into n from public.company_scores where review_status in ('pending', 'superseded');
  res := res || format('anon sees no pending or superseded score|%s|%s rows', n = 0, n);
  select string_agg(category || ':' || coalesce(rubric_version, '-'), ',' order by category) into t
  from public.published_company_scores where company_id = v_co;
  res := res || format('published_company_scores has one row per category with its rubric|%s|%s', t = 'environment:v1,overall:v1', t);
  select count(*) into n from public.score_citations where score_id = v_s_pending;
  res := res || format('anon cannot see a pending score''s citation|%s|%s rows', n = 0, n);
  select count(*) into n from public.score_citations where score_id = v_s_approved;
  res := res || format('anon sees an approved score''s citation|%s|%s rows', n = 1, n);
  select string_agg(title, ',' order by title) into t from public.documents
  where id in (v_d_cited, v_d_pending_link, v_d_unlinked, v_d_cert, v_d_pending_cite);
  res := res || format('anon sees only documents with a visible link|%s|%s', t = 'Cert,Cited', t);
  select count(*) into n from public.documents where id = v_d_unlinked;
  res := res || format('a document with no visible link is hidden from anon|%s|%s rows', n = 0, n);
  select string_agg(version, ',') into t from public.rubrics where id in (v_r1, v_r2);
  res := res || format('anon sees only published rubrics|%s|%s', t = 'v1', t);
  select (select count(*) from public.document_entities where company_id = v_co)
       + (select count(*) from public.company_events where company_id = v_co)
  into n;
  res := res || format('anon sees no pending entity link or event|%s|%s rows', n = 0, n);
  select count(*) into n from public.certifications where company_id = v_co;
  res := res || format('anon sees the approved certification|%s|%s rows', n = 1, n);
  begin
    insert into public.documents (url, url_normalized, kind, source_id, fetched_at, method, method_version)
    values ('https://example.org/a', 'https://example.org/a', 'news', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('anon cannot insert documents|%s|%s', state = '42501', state);

  reset role;

  -- authenticated, not an admin ----------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  select count(*) into n from public.company_scores where company_id = v_co;
  res := res || format('user sees only approved scores|%s|%s rows', n = 2, n);
  select count(*) into n from public.documents
  where id in (v_d_cited, v_d_pending_link, v_d_unlinked, v_d_cert, v_d_pending_cite);
  res := res || format('user sees only linked documents|%s|%s rows', n = 2, n);
  select count(*) into n from public.rubrics where id = v_r2;
  res := res || format('user cannot see a draft rubric|%s|%s rows', n = 0, n);
  begin
    insert into public.company_events (company_id, kind, title, source_id, fetched_at, method, method_version)
    values (v_co, 'award', 'User award', v_src, now(), 'manual', 'manual@test');
    state := 'none';
  exception when others then state := sqlstate; end;
  res := res || format('user cannot insert company_events|%s|%s', state = '42501', state);
  update public.company_scores set rationale = 'hacked' where id = v_s_approved;
  get diagnostics n = row_count;
  res := res || format('user cannot update scores|%s|%s rows updated', n = 0, n);
  delete from public.score_citations where score_id = v_s_approved;
  get diagnostics n = row_count;
  res := res || format('user cannot delete citations|%s|%s rows deleted', n = 0, n);

  reset role;

  -- admin -------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select count(*) into n from public.company_scores where company_id = v_co;
  res := res || format('admin sees every score|%s|%s rows', n = 5, n);
  select count(*) into n from public.documents
  where id in (v_d_cited, v_d_pending_link, v_d_unlinked, v_d_cert, v_d_pending_cite);
  res := res || format('admin sees every document|%s|%s rows', n = 5, n);
  select count(*) into n from public.score_citations where score_id = v_s_pending;
  res := res || format('admin sees a pending score''s citation|%s|%s rows', n = 1, n);
  insert into public.documents (url, url_normalized, kind, source_id, fetched_at, method, method_version)
  values ('https://example.org/admin', 'https://example.org/admin', 'company_site', v_src, now(), 'manual', 'manual@admin-ui');
  res := res || 'admin inserts a document|true|ok'::text;
  update public.document_entities set review_status = 'approved', reviewed_at = now(), decision_method = 'admin', reviewed_by = v_admin
  where document_id = v_d_pending_link;
  get diagnostics n = row_count;
  res := res || format('admin approves an entity link|%s|%s rows', n = 1, n);
  insert into public.external_ratings (company_id, scheme, period, score, max_score, document_id, source_id, fetched_at, method, method_version)
  values (v_co, 'knowthechain', '2026', 42.5, 100, v_d_unlinked, v_src, now(), 'manual', 'manual@admin-ui');
  res := res || 'admin inserts an external rating|true|ok'::text;
  delete from public.company_events where company_id = v_co;
  get diagnostics n = row_count;
  res := res || format('admin deletes an event|%s|%s rows', n = 1, n);

  reset role;

  -- Once the entity link is approved, anon can see its document.
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.documents where id = v_d_pending_link;
  res := res || format('approving the link makes its document visible to anon|%s|%s rows', n = 1, n);
  reset role;

  begin set constraints all immediate; state := 'none'; exception when others then state := sqlstate; end;
  res := res || format('final state passes the citation check|%s|%s', state = 'none', state);

  insert into results (check_name, ok, detail)
  select split_part(r, '|', 1), split_part(r, '|', 2)::boolean, split_part(r, '|', 3) from unnest(res) as r;
end;
$$;

select n, check_name, ok, detail from results order by n;

rollback;

-- Commit-time check: run this block on its own. The commit must fail with
-- "company score ... is approved but has no citation" (23514), and nothing is left behind.
--
-- begin;
-- insert into public.companies (id, slug, name, status, source_id, fetched_at, method, method_version)
-- select '00000000-0000-4000-8000-0000000d00f1', 'rls-commit-co', 'RLS Commit Co', 'active', id, now(), 'manual', 'manual@test'
-- from public.sources where key = 'fixture';
-- insert into public.rubrics (id, version, categories, grade_thresholds, evidence_rules)
-- values ('00000000-0000-4000-8000-0000000d00f2', 'v999', '{}', '[]', 'Test.');
-- insert into public.company_scores
--   (company_id, rubric_id, category, rating, confidence, review_status, reviewed_at, decision_method,
--    source_id, fetched_at, method, method_version)
-- select '00000000-0000-4000-8000-0000000d00f1', '00000000-0000-4000-8000-0000000d00f2', 'labour', 'Good', 0.9,
--        'approved', now(), 'auto', id, now(), 'manual', 'manual@test'
-- from public.sources where key = 'fixture';
-- commit;
