-- P2.7 Catalog schema, domain 6: AI and audit (DATA_MODEL §3.8; D-037).
-- Comes before scoring because company_scores.ai_call_id references ai_calls (D-030).
-- Both tables are admin only. The OpenRouter module (D-009) logs calls with the service role (bypasses RLS).
-- Also adds ai_call_id to the AI-producible fact tables that shipped before ai_calls existed (D-034, D-035).

-- ai_calls ------------------------------------------------------------------

create table public.ai_calls (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  purpose text not null check (purpose in (
    'score_company', 'tag_document', 'parse_receipt', 'research_brand_owner', 'research_company'
  )),
  model text not null check (char_length(model) between 1 and 200),
  prompt_version text not null check (char_length(prompt_version) between 1 and 100),
  rubric_version text check (char_length(rubric_version) between 1 and 100),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd numeric(10, 6) not null default 0 check (cost_usd >= 0),
  latency_ms integer check (latency_ms >= 0),
  status text not null check (status in ('ok', 'invalid_json', 'schema_error', 'http_error', 'budget_blocked')),
  mock boolean not null default false,
  run_id uuid references public.ingestion_runs (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  response_raw_object_id uuid references public.raw_objects (id) on delete set null,
  -- Only receipt parses are tied to a user (for rate limits).
  constraint ai_calls_user_receipt_only check (user_id is null or purpose = 'parse_receipt'),
  -- A mock or budget-blocked call never reaches OpenRouter, so it costs nothing.
  constraint ai_calls_free_when_not_sent check (not mock or cost_usd = 0),
  constraint ai_calls_budget_blocked_unsent check (
    status <> 'budget_blocked' or (input_tokens = 0 and output_tokens = 0 and cost_usd = 0)
  )
);

comment on table public.ai_calls is
  'One row per OpenRouter call (D-009): tokens, cost and outcome. Full responses live in Storage via raw_objects. Kept 13 months.';
comment on column public.ai_calls.user_id is 'Set for parse_receipt only, for per-user rate limits.';
comment on column public.ai_calls.latency_ms is 'Null when the call was never sent (budget_blocked).';

create index ai_calls_at_idx on public.ai_calls (at);
create index ai_calls_run_idx on public.ai_calls (run_id);
create index ai_calls_user_at_idx on public.ai_calls (user_id, at);
create index ai_calls_response_raw_object_idx on public.ai_calls (response_raw_object_id);

-- audit_log -----------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid references public.profiles (id) on delete set null,
  table_name text not null check (table_name ~ '^[a-z][a-z0-9_]*$'),
  row_id text not null
    check (row_id ~ '^([0-9]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'),
  action text not null check (action in ('insert', 'update', 'delete', 'merge', 'review')),
  changes jsonb not null default '{}'
    check (jsonb_typeof(changes) = 'object' and octet_length(changes::text) <= 16384),
  note text check (char_length(note) <= 1000)
);

comment on table public.audit_log is
  'Manual-change trail (DATA_MODEL §1.2). Append-only for clients: admins insert as themselves and never update or delete.';
comment on column public.audit_log.actor_id is 'Always set on insert; becomes null only if the admin''s account is deleted.';
comment on column public.audit_log.row_id is 'The changed row''s primary key as text: a uuid or a bigint.';
comment on column public.audit_log.changes is '{field: [old, new]}, at most 16 KB.';

create index audit_log_row_idx on public.audit_log (table_name, row_id, at desc);
create index audit_log_actor_idx on public.audit_log (actor_id);
create index audit_log_at_idx on public.audit_log (at);

-- ai_call_id on earlier fact tables (D-034, D-035) ----------------------------

alter table public.company_ownership
  add column ai_call_id bigint references public.ai_calls (id) on delete set null;
alter table public.brand_ownership
  add column ai_call_id bigint references public.ai_calls (id) on delete set null;
alter table public.category_mappings
  add column ai_call_id bigint references public.ai_calls (id) on delete set null;

create index company_ownership_ai_call_idx on public.company_ownership (ai_call_id);
create index brand_ownership_ai_call_idx on public.brand_ownership (ai_call_id);
create index category_mappings_ai_call_idx on public.category_mappings (ai_call_id);

-- Privileges and RLS: admin only --------------------------------------------

alter table public.ai_calls enable row level security;
alter table public.audit_log enable row level security;

revoke all on table public.ai_calls, public.audit_log from anon, authenticated;
grant select, insert, update, delete on table public.ai_calls to authenticated;
grant select, insert on table public.audit_log to authenticated;

create policy ai_calls_admin on public.ai_calls for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy audit_log_select_admin on public.audit_log for select to authenticated
  using ((select private.is_admin()));
create policy audit_log_insert_admin on public.audit_log for insert to authenticated
  with check ((select private.is_admin()) and actor_id = (select auth.uid()));
