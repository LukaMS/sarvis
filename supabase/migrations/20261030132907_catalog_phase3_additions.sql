-- P3.2 Schema additions for the Phase 3 sources (D-053).
-- - review_queue.item_type gains 'company' and 'brand' (the D-052 gap).
-- - company_sources: per-source provenance for company fields a second source fills in (Wikipedia,
--   SEC EDGAR, Corporations Canada). Admin only, like product_sources.
-- - documents.summary: a short Wikipedia extract (<= 2,000 characters), shown with attribution.
-- - companies.wikipedia_document_id: the company's Wikipedia page. That document is public exactly
--   when its company is (approved and not rejected).
-- Pipeline jobs write with the service role (bypasses RLS).

-- review_queue item types ---------------------------------------------------

alter table public.review_queue drop constraint review_queue_item_type_check;
alter table public.review_queue add constraint review_queue_item_type_check check (item_type in (
  'company_score', 'document_entity', 'company_ownership', 'brand_ownership', 'match_candidate', 'product',
  'certification', 'company_event', 'legacy_fact', 'company', 'brand'
));

-- company_sources -----------------------------------------------------------

create table public.company_sources (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete restrict,
  external_id text not null check (char_length(external_id) between 1 and 200),
  source_url text check (source_url ~ '^https?://'),
  fetched_at timestamptz not null,
  last_seen_at timestamptz not null,
  content_hash bytea check (octet_length(content_hash) between 8 and 64),
  method text not null check (method in ('import', 'api', 'ai', 'manual', 'legacy-import', 'receipt', 'derived')),
  method_version text not null check (char_length(method_version) between 1 and 200),
  fields text[] not null check (
    cardinality(fields) between 1 and 50
    and array_to_string(fields, ',') ~ '^[a-z][a-z0-9_]*(,[a-z][a-z0-9_]*)*$'
  ),
  ingestion_run_id uuid references public.ingestion_runs (id) on delete set null,
  raw_object_id uuid references public.raw_objects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_sources_seen_after_fetch check (last_seen_at >= fetched_at),
  constraint company_sources_key unique (company_id, source_id)
);

comment on table public.company_sources is
  'Provenance of company fields set by a source other than the creating one (D-053). Admin only.';
comment on column public.company_sources.external_id is
  'The company''s id at that source: Wikipedia page title, SEC CIK, Corporations Canada number.';
comment on column public.company_sources.fields is 'The companies columns this source set.';

create index company_sources_source_idx on public.company_sources (source_id);
create index company_sources_ingestion_run_idx on public.company_sources (ingestion_run_id);
create index company_sources_raw_object_idx on public.company_sources (raw_object_id);

create trigger company_sources_set_updated_at
before update on public.company_sources
for each row execute function private.set_updated_at();

alter table public.company_sources enable row level security;
revoke all on table public.company_sources from anon, authenticated;
grant select, insert, update, delete on table public.company_sources to authenticated;

create policy company_sources_admin on public.company_sources for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- documents.summary ---------------------------------------------------------

alter table public.documents
  add column summary text check (char_length(summary) between 1 and 2000),
  add constraint documents_summary_wikipedia check (kind = 'wikipedia' or summary is null);

comment on column public.documents.summary is
  'Wikipedia only: a short extract (<= 2,000 characters) shown with its CC BY-SA attribution. Never full text (D-014).';

-- companies.wikipedia_document_id -------------------------------------------

alter table public.companies
  add column wikipedia_document_id uuid references public.documents (id) on delete set null;

comment on column public.companies.wikipedia_document_id is
  'The company''s Wikipedia page (a documents row of kind wikipedia). Public exactly when the company is.';

create index companies_wikipedia_document_idx on public.companies (wikipedia_document_id);

-- documents read policies: add the company Wikipedia page ---------------------
-- companies RLS applies inside the subquery, so the page follows its company's visibility. Only a
-- wikipedia-kind document can be exposed this way.

drop policy documents_select_anon on public.documents;
drop policy documents_select_authenticated on public.documents;

create policy documents_select_anon on public.documents for select to anon
  using (
    exists (select 1 from public.score_citations c where c.document_id = documents.id)
    or exists (select 1 from public.document_entities e where e.document_id = documents.id)
    or exists (select 1 from public.certifications x where x.document_id = documents.id)
    or exists (select 1 from public.external_ratings x where x.document_id = documents.id)
    or exists (select 1 from public.company_events x where x.document_id = documents.id)
    or (documents.kind = 'wikipedia'
        and exists (select 1 from public.companies co where co.wikipedia_document_id = documents.id))
  );
create policy documents_select_authenticated on public.documents for select to authenticated
  using (
    (select private.is_admin())
    or exists (select 1 from public.score_citations c where c.document_id = documents.id)
    or exists (select 1 from public.document_entities e where e.document_id = documents.id)
    or exists (select 1 from public.certifications x where x.document_id = documents.id)
    or exists (select 1 from public.external_ratings x where x.document_id = documents.id)
    or exists (select 1 from public.company_events x where x.document_id = documents.id)
    or (documents.kind = 'wikipedia'
        and exists (select 1 from public.companies co where co.wikipedia_document_id = documents.id))
  );
