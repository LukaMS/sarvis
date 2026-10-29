-- P2.8 Catalog schema, domain 7: scoring and evidence (DATA_MODEL §3.6, §4; D-038).
-- rubrics, company_scores, score_citations, documents, document_entities, certifications, external_ratings,
-- company_events. Public read of approved rows, admin write. Pipeline jobs write with the service role.

-- rubrics -------------------------------------------------------------------

create table public.rubrics (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (version ~ '^v[0-9]+$'),
  categories jsonb not null check (jsonb_typeof(categories) = 'object'),
  grade_thresholds jsonb not null check (jsonb_typeof(grade_thresholds) in ('object', 'array')),
  evidence_rules text not null check (char_length(evidence_rules) between 1 and 10000),
  doc_url text check (doc_url ~ '^https?://'),
  approved_by_owner_at date,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.rubrics is
  'Scoring rubric versions (D-004 categories, legacy scoreToGrade thresholds). Anon sees published rubrics only.';
comment on column public.rubrics.doc_url is 'docs/catalog/RUBRIC.md at a commit.';

create trigger rubrics_set_updated_at
before update on public.rubrics
for each row execute function private.set_updated_at();

-- documents -----------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  url text not null check (url ~ '^https?://'),
  url_normalized text not null unique check (url_normalized ~ '^https?://'),
  kind text not null
    check (kind in ('news', 'wikipedia', 'sec_filing', 'certification_page', 'report', 'company_site', 'other')),
  title text check (char_length(title) <= 500),
  publisher text check (char_length(publisher) <= 200),
  domain text check (domain ~ '^[a-z0-9.-]+$'),
  published_at timestamptz,
  language text check (language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  wikipedia_revision_id bigint check (wikipedia_revision_id > 0),
  sec_accession text check (sec_accession ~ '^[0-9]{10}-[0-9]{2}-[0-9]{6}$'),
  sec_filed_on date,
  archive_url text check (archive_url ~ '^https?://'),
  -- +prov
  source_id uuid not null references public.sources (id) on delete restrict,
  source_url text check (source_url ~ '^https?://'),
  fetched_at timestamptz not null,
  method text not null check (method in ('import', 'api', 'ai', 'manual', 'legacy-import', 'receipt', 'derived')),
  method_version text not null check (char_length(method_version) between 1 and 200),
  ingestion_run_id uuid references public.ingestion_runs (id) on delete set null,
  raw_object_id uuid references public.raw_objects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_sec_fields check ((kind = 'sec_filing') or (sec_accession is null and sec_filed_on is null)),
  constraint documents_wikipedia_fields check (kind = 'wikipedia' or wikipedia_revision_id is null)
);

comment on table public.documents is
  'Every cited or linked page. Full text is never stored. Anon sees a document only when a visible row links to it.';
comment on column public.documents.url_normalized is
  'Lower-case host; fragment, utm_* and tracking parameters stripped (DATA_MODEL §1.1). The import key.';

create index documents_source_idx on public.documents (source_id);
create index documents_ingestion_run_idx on public.documents (ingestion_run_id);
create index documents_raw_object_idx on public.documents (raw_object_id);

create trigger documents_set_updated_at
before update on public.documents
for each row execute function private.set_updated_at();

-- company_scores ------------------------------------------------------------

create table public.company_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  rubric_id uuid references public.rubrics (id) on delete restrict,
  category text not null
    check (category in ('environment', 'labour', 'animal_welfare', 'politics_tax', 'human_rights', 'overall')),
  rating text check (rating in ('Good', 'Mixed', 'Poor')),
  score smallint check (score between 0 and 100),
  grade text check (grade in ('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F')),
  rationale text check (char_length(rationale) <= 1000),
  confidence numeric(3, 2) check (confidence between 0 and 1),
  model text check (char_length(model) between 1 and 200),
  ai_call_id bigint references public.ai_calls (id) on delete set null,
  superseded_by_id uuid references public.company_scores (id) on delete set null,
  -- +review
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected', 'superseded')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  decision_method text check (decision_method in ('admin', 'auto', 'legacy')),
  constraint company_scores_review_decided check (
    (review_status = 'pending') = (reviewed_at is null)
    and (review_status = 'pending') = (decision_method is null)
    and (review_status <> 'pending' or reviewed_by is null)
    and (decision_method is distinct from 'auto' or reviewed_by is null)
  ),
  -- +prov
  source_id uuid not null references public.sources (id) on delete restrict,
  source_url text check (source_url ~ '^https?://'),
  fetched_at timestamptz not null,
  method text not null check (method in ('ai', 'manual', 'legacy-import')),
  method_version text not null check (char_length(method_version) between 1 and 200),
  ingestion_run_id uuid references public.ingestion_runs (id) on delete set null,
  raw_object_id uuid references public.raw_objects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Categories carry a Good/Mixed/Poor rating; overall carries a 0-100 score with its grade
  -- (legacy overall rows have only a rating).
  constraint company_scores_shape check (
    case when category = 'overall'
      then (score is null) = (grade is null) and (rating is not null or score is not null)
      else rating is not null and score is null and grade is null
    end
  ),
  -- Legacy scores have no confidence or rubric; they stay pending until rescored or cited (D-038).
  constraint company_scores_confidence check (confidence is not null or method = 'legacy-import'),
  constraint company_scores_rubric check (rubric_id is not null or method = 'legacy-import'),
  constraint company_scores_approved_complete check (
    review_status <> 'approved' or (confidence is not null and rubric_id is not null)
  ),
  constraint company_scores_ai_model check (method <> 'ai' or model is not null),
  constraint company_scores_superseded check (
    superseded_by_id is null or (review_status = 'superseded' and superseded_by_id <> id)
  )
);

comment on table public.company_scores is
  'One row per company x category x scoring event. Approved rows need at least one citation (checked at commit).';

-- One published score per company and category: supersede the old row before approving a new one.
create unique index company_scores_one_approved on public.company_scores (company_id, category)
  where review_status = 'approved';
-- Legacy import key, so re-running it doesn't duplicate rows.
create unique index company_scores_legacy_key on public.company_scores (company_id, category)
  where method = 'legacy-import';
create index company_scores_company_idx on public.company_scores (company_id);
create index company_scores_rubric_idx on public.company_scores (rubric_id);
create index company_scores_ai_call_idx on public.company_scores (ai_call_id);
create index company_scores_superseded_by_idx on public.company_scores (superseded_by_id);
create index company_scores_pending_idx on public.company_scores (created_at) where review_status = 'pending';
create index company_scores_reviewed_by_idx on public.company_scores (reviewed_by);
create index company_scores_source_idx on public.company_scores (source_id);
create index company_scores_ingestion_run_idx on public.company_scores (ingestion_run_id);
create index company_scores_raw_object_idx on public.company_scores (raw_object_id);

create trigger company_scores_set_updated_at
before update on public.company_scores
for each row execute function private.set_updated_at();

-- score_citations -----------------------------------------------------------

create table public.score_citations (
  id bigint generated always as identity primary key,
  score_id uuid not null references public.company_scores (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete restrict,
  quote text check (char_length(quote) <= 300),
  stance text not null check (stance in ('supports_good', 'supports_poor', 'context')),
  added_by_method text not null check (added_by_method in ('ai', 'manual')),
  created_at timestamptz not null default now(),
  constraint score_citations_key unique (score_id, document_id)
);

comment on table public.score_citations is 'Evidence behind a score. Visible when the parent score is visible.';
comment on column public.score_citations.quote is 'A short excerpt for context, at most 300 characters.';

create index score_citations_document_idx on public.score_citations (document_id);

-- Approved needs a citation (deferred, so a score and its citations can be written in one transaction) --

create function private.company_scores_require_citation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_score uuid;
begin
  if tg_table_name = 'company_scores' then
    v_score := new.id;
  else
    v_score := old.score_id;
  end if;

  -- Re-read the row: by commit time it may have changed or gone.
  if exists (
    select 1 from public.company_scores s
    where s.id = v_score
      and s.review_status = 'approved'
      and not exists (select 1 from public.score_citations c where c.score_id = s.id)
  ) then
    raise exception 'company score % is approved but has no citation', v_score
      using errcode = '23514', hint = 'Add a score_citations row before approving.';
  end if;
  return null;
end;
$$;

revoke execute on function private.company_scores_require_citation() from public, anon, authenticated;

create constraint trigger company_scores_require_citation
after insert or update of review_status on public.company_scores
deferrable initially deferred
for each row execute function private.company_scores_require_citation();

create constraint trigger score_citations_keep_one_for_approved
after delete or update of score_id on public.score_citations
deferrable initially deferred
for each row execute function private.company_scores_require_citation();

-- document_entities ---------------------------------------------------------

create table public.document_entities (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete cascade,
  relevance numeric(3, 2) not null check (relevance between 0 and 1),
  stance text not null check (stance in ('good', 'bad', 'neutral')),
  categories text[] not null default '{}' check (
    categories <@ array['environment', 'labour', 'animal_welfare', 'politics_tax', 'human_rights']::text[]
  ),
  summary text check (char_length(summary) <= 280),
  model text check (char_length(model) between 1 and 200),
  ai_call_id bigint references public.ai_calls (id) on delete set null,
  -- +review
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected', 'superseded')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  decision_method text check (decision_method in ('admin', 'auto', 'legacy')),
  constraint document_entities_review_decided check (
    (review_status = 'pending') = (reviewed_at is null)
    and (review_status = 'pending') = (decision_method is null)
    and (review_status <> 'pending' or reviewed_by is null)
    and (decision_method is distinct from 'auto' or reviewed_by is null)
  ),
  -- +prov
  source_id uuid not null references public.sources (id) on delete restrict,
  source_url text check (source_url ~ '^https?://'),
  fetched_at timestamptz not null,
  method text not null check (method in ('import', 'api', 'ai', 'manual', 'legacy-import', 'receipt', 'derived')),
  method_version text not null check (char_length(method_version) between 1 and 200),
  ingestion_run_id uuid references public.ingestion_runs (id) on delete set null,
  raw_object_id uuid references public.raw_objects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_entities_one_subject check (num_nonnulls(company_id, brand_id) = 1),
  constraint document_entities_ai_model check (method <> 'ai' or model is not null),
  constraint document_entities_key unique nulls not distinct (document_id, company_id, brand_id)
);

comment on table public.document_entities is 'Articles linked to a company or a brand (exactly one), good and bad.';

create index document_entities_company_idx on public.document_entities (company_id);
create index document_entities_brand_idx on public.document_entities (brand_id);
create index document_entities_ai_call_idx on public.document_entities (ai_call_id);
create index document_entities_reviewed_by_idx on public.document_entities (reviewed_by);
create index document_entities_source_idx on public.document_entities (source_id);
create index document_entities_ingestion_run_idx on public.document_entities (ingestion_run_id);
create index document_entities_raw_object_idx on public.document_entities (raw_object_id);

create trigger document_entities_set_updated_at
before update on public.document_entities
for each row execute function private.set_updated_at();

-- certifications ------------------------------------------------------------

create table public.certifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  scheme text not null
    check (scheme in ('b_corp', 'fairtrade', 'canada_organic', 'rainforest_alliance', 'rspo', 'other')),
  scheme_name text check (char_length(scheme_name) between 1 and 200),
  status text not null default 'certified' check (status in ('certified', 'lapsed', 'revoked')),
  certified_on date,
  expires_on date,
  score numeric(5, 1) check (score >= 0),
  document_id uuid references public.documents (id) on delete restrict,
  -- +review
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected', 'superseded')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  decision_method text check (decision_method in ('admin', 'auto', 'legacy')),
  constraint certifications_review_decided check (
    (review_status = 'pending') = (reviewed_at is null)
    and (review_status = 'pending') = (decision_method is null)
    and (review_status <> 'pending' or reviewed_by is null)
    and (decision_method is distinct from 'auto' or reviewed_by is null)
  ),
  -- +prov
  source_id uuid not null references public.sources (id) on delete restrict,
  source_url text check (source_url ~ '^https?://'),
  fetched_at timestamptz not null,
  method text not null check (method in ('import', 'api', 'ai', 'manual', 'legacy-import', 'receipt', 'derived')),
  method_version text not null check (char_length(method_version) between 1 and 200),
  ingestion_run_id uuid references public.ingestion_runs (id) on delete set null,
  raw_object_id uuid references public.raw_objects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint certifications_one_subject check (num_nonnulls(company_id, brand_id, product_id) = 1),
  constraint certifications_other_named check (scheme <> 'other' or scheme_name is not null),
  constraint certifications_dates check (expires_on is null or certified_on is null or expires_on >= certified_on),
  -- Evidence rule: an approved certification cites its directory or finder page.
  constraint certifications_approved_cited check (review_status <> 'approved' or document_id is not null),
  constraint certifications_key unique nulls not distinct (company_id, brand_id, product_id, scheme, scheme_name)
);

comment on table public.certifications is
  'B Corp, Fairtrade, organic ... for exactly one company, brand or product. Manual entry per D-013 D6, plus legacy.';
comment on column public.certifications.score is 'B Corp overall score.';

create index certifications_company_idx on public.certifications (company_id);
create index certifications_brand_idx on public.certifications (brand_id);
create index certifications_product_idx on public.certifications (product_id);
create index certifications_document_idx on public.certifications (document_id);
create index certifications_reviewed_by_idx on public.certifications (reviewed_by);
create index certifications_source_idx on public.certifications (source_id);
create index certifications_ingestion_run_idx on public.certifications (ingestion_run_id);
create index certifications_raw_object_idx on public.certifications (raw_object_id);

create trigger certifications_set_updated_at
before update on public.certifications
for each row execute function private.set_updated_at();

-- external_ratings ----------------------------------------------------------

create table public.external_ratings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  scheme text not null check (scheme in ('knowthechain')),
  period text not null check (period ~ '^[0-9]{4}(-[0-9]{2})?$'),
  score numeric(6, 2) not null check (score >= 0),
  max_score numeric(6, 2) not null check (max_score > 0),
  document_id uuid not null references public.documents (id) on delete restrict,
  -- +review
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected', 'superseded')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  decision_method text check (decision_method in ('admin', 'auto', 'legacy')),
  constraint external_ratings_review_decided check (
    (review_status = 'pending') = (reviewed_at is null)
    and (review_status = 'pending') = (decision_method is null)
    and (review_status <> 'pending' or reviewed_by is null)
    and (decision_method is distinct from 'auto' or reviewed_by is null)
  ),
  -- +prov
  source_id uuid not null references public.sources (id) on delete restrict,
  source_url text check (source_url ~ '^https?://'),
  fetched_at timestamptz not null,
  method text not null check (method in ('import', 'api', 'ai', 'manual', 'legacy-import', 'receipt', 'derived')),
  method_version text not null check (char_length(method_version) between 1 and 200),
  ingestion_run_id uuid references public.ingestion_runs (id) on delete set null,
  raw_object_id uuid references public.raw_objects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_ratings_score_range check (score <= max_score),
  constraint external_ratings_key unique (company_id, scheme, period)
);

comment on table public.external_ratings is 'Third-party benchmark scores (KnowTheChain S29), each citing its report.';

create index external_ratings_document_idx on public.external_ratings (document_id);
create index external_ratings_reviewed_by_idx on public.external_ratings (reviewed_by);
create index external_ratings_source_idx on public.external_ratings (source_id);
create index external_ratings_ingestion_run_idx on public.external_ratings (ingestion_run_id);
create index external_ratings_raw_object_idx on public.external_ratings (raw_object_id);

create trigger external_ratings_set_updated_at
before update on public.external_ratings
for each row execute function private.set_updated_at();

-- company_events ------------------------------------------------------------

create table public.company_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('boycott', 'controversy', 'recall', 'lawsuit', 'award')),
  title text not null check (char_length(title) between 1 and 300),
  description text check (char_length(description) <= 2000),
  event_date date,
  date_text text check (char_length(date_text) <= 100),
  status text not null default 'active' check (status in ('active', 'resolved', 'paused')),
  severity text check (severity in ('low', 'medium', 'high', 'critical')),
  document_id uuid references public.documents (id) on delete set null,
  -- +review
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected', 'superseded')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  decision_method text check (decision_method in ('admin', 'auto', 'legacy')),
  constraint company_events_review_decided check (
    (review_status = 'pending') = (reviewed_at is null)
    and (review_status = 'pending') = (decision_method is null)
    and (review_status <> 'pending' or reviewed_by is null)
    and (decision_method is distinct from 'auto' or reviewed_by is null)
  ),
  -- +prov
  source_id uuid not null references public.sources (id) on delete restrict,
  source_url text check (source_url ~ '^https?://'),
  fetched_at timestamptz not null,
  method text not null check (method in ('import', 'api', 'ai', 'manual', 'legacy-import', 'receipt', 'derived')),
  method_version text not null check (char_length(method_version) between 1 and 200),
  ingestion_run_id uuid references public.ingestion_runs (id) on delete set null,
  raw_object_id uuid references public.raw_objects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_events_key unique nulls not distinct (company_id, kind, title, event_date)
);

comment on table public.company_events is
  'Boycotts, controversies, recalls, lawsuits and awards (legacy boycotts + controversies).';
comment on column public.company_events.date_text is 'Legacy free-text date, kept when it doesn''t parse to event_date.';
comment on column public.company_events.severity is 'critical is kept for the legacy controversy rows that use it (D-038).';

create index company_events_document_idx on public.company_events (document_id);
create index company_events_reviewed_by_idx on public.company_events (reviewed_by);
create index company_events_source_idx on public.company_events (source_id);
create index company_events_ingestion_run_idx on public.company_events (ingestion_run_id);
create index company_events_raw_object_idx on public.company_events (raw_object_id);

create trigger company_events_set_updated_at
before update on public.company_events
for each row execute function private.set_updated_at();

-- View (security_invoker: the base-table RLS applies) ------------------------

create view public.published_company_scores
with (security_invoker = true)
as
select
  s.id as score_id,
  s.company_id,
  s.category,
  s.rating,
  s.score,
  s.grade,
  s.rationale,
  s.confidence,
  s.model,
  s.rubric_id,
  r.version as rubric_version,
  s.method,
  s.method_version,
  s.fetched_at,
  s.reviewed_at
from public.company_scores s
left join public.rubrics r on r.id = s.rubric_id
where s.review_status = 'approved';

comment on view public.published_company_scores is
  'The approved score per company x category (at most one, by a partial unique index), with its rubric version.';

-- Privileges and RLS ---------------------------------------------------------

alter table public.rubrics enable row level security;
alter table public.documents enable row level security;
alter table public.company_scores enable row level security;
alter table public.score_citations enable row level security;
alter table public.document_entities enable row level security;
alter table public.certifications enable row level security;
alter table public.external_ratings enable row level security;
alter table public.company_events enable row level security;

revoke all on table
  public.rubrics, public.documents, public.company_scores, public.score_citations, public.document_entities,
  public.certifications, public.external_ratings, public.company_events, public.published_company_scores
from anon, authenticated;

grant select on table
  public.rubrics, public.documents, public.company_scores, public.score_citations, public.document_entities,
  public.certifications, public.external_ratings, public.company_events, public.published_company_scores
to anon, authenticated;
grant insert, update, delete on table
  public.rubrics, public.documents, public.company_scores, public.score_citations, public.document_entities,
  public.certifications, public.external_ratings, public.company_events
to authenticated;

-- Reads. Two select policies where a filter applies, because anon can't execute private.is_admin().
create policy rubrics_select_anon on public.rubrics for select to anon
  using (published_at is not null);
create policy rubrics_select_authenticated on public.rubrics for select to authenticated
  using (published_at is not null or (select private.is_admin()));

create policy company_scores_select_anon on public.company_scores for select to anon
  using (review_status = 'approved');
create policy company_scores_select_authenticated on public.company_scores for select to authenticated
  using (review_status = 'approved' or (select private.is_admin()));

-- A citation is visible when its score is (company_scores RLS applies inside the subquery).
create policy score_citations_select_all on public.score_citations for select to anon, authenticated
  using (exists (select 1 from public.company_scores s where s.id = score_citations.score_id));

create policy document_entities_select_anon on public.document_entities for select to anon
  using (review_status = 'approved');
create policy document_entities_select_authenticated on public.document_entities for select to authenticated
  using (review_status = 'approved' or (select private.is_admin()));

create policy certifications_select_anon on public.certifications for select to anon
  using (review_status = 'approved');
create policy certifications_select_authenticated on public.certifications for select to authenticated
  using (review_status = 'approved' or (select private.is_admin()));

create policy external_ratings_select_anon on public.external_ratings for select to anon
  using (review_status = 'approved');
create policy external_ratings_select_authenticated on public.external_ratings for select to authenticated
  using (review_status = 'approved' or (select private.is_admin()));

create policy company_events_select_anon on public.company_events for select to anon
  using (review_status = 'approved');
create policy company_events_select_authenticated on public.company_events for select to authenticated
  using (review_status = 'approved' or (select private.is_admin()));

-- A document is visible when a visible row links to it (each linking table's RLS applies inside the subqueries).
create policy documents_select_anon on public.documents for select to anon
  using (
    exists (select 1 from public.score_citations c where c.document_id = documents.id)
    or exists (select 1 from public.document_entities e where e.document_id = documents.id)
    or exists (select 1 from public.certifications x where x.document_id = documents.id)
    or exists (select 1 from public.external_ratings x where x.document_id = documents.id)
    or exists (select 1 from public.company_events x where x.document_id = documents.id)
  );
create policy documents_select_authenticated on public.documents for select to authenticated
  using (
    (select private.is_admin())
    or exists (select 1 from public.score_citations c where c.document_id = documents.id)
    or exists (select 1 from public.document_entities e where e.document_id = documents.id)
    or exists (select 1 from public.certifications x where x.document_id = documents.id)
    or exists (select 1 from public.external_ratings x where x.document_id = documents.id)
    or exists (select 1 from public.company_events x where x.document_id = documents.id)
  );

-- Writes: admin only, one policy per command so reads keep a single permissive policy per role.
create policy rubrics_insert_admin on public.rubrics for insert to authenticated
  with check ((select private.is_admin()));
create policy rubrics_update_admin on public.rubrics for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy rubrics_delete_admin on public.rubrics for delete to authenticated
  using ((select private.is_admin()));

create policy documents_insert_admin on public.documents for insert to authenticated
  with check ((select private.is_admin()));
create policy documents_update_admin on public.documents for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy documents_delete_admin on public.documents for delete to authenticated
  using ((select private.is_admin()));

create policy company_scores_insert_admin on public.company_scores for insert to authenticated
  with check ((select private.is_admin()));
create policy company_scores_update_admin on public.company_scores for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy company_scores_delete_admin on public.company_scores for delete to authenticated
  using ((select private.is_admin()));

create policy score_citations_insert_admin on public.score_citations for insert to authenticated
  with check ((select private.is_admin()));
create policy score_citations_update_admin on public.score_citations for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy score_citations_delete_admin on public.score_citations for delete to authenticated
  using ((select private.is_admin()));

create policy document_entities_insert_admin on public.document_entities for insert to authenticated
  with check ((select private.is_admin()));
create policy document_entities_update_admin on public.document_entities for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy document_entities_delete_admin on public.document_entities for delete to authenticated
  using ((select private.is_admin()));

create policy certifications_insert_admin on public.certifications for insert to authenticated
  with check ((select private.is_admin()));
create policy certifications_update_admin on public.certifications for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy certifications_delete_admin on public.certifications for delete to authenticated
  using ((select private.is_admin()));

create policy external_ratings_insert_admin on public.external_ratings for insert to authenticated
  with check ((select private.is_admin()));
create policy external_ratings_update_admin on public.external_ratings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy external_ratings_delete_admin on public.external_ratings for delete to authenticated
  using ((select private.is_admin()));

create policy company_events_insert_admin on public.company_events for insert to authenticated
  with check ((select private.is_admin()));
create policy company_events_update_admin on public.company_events for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy company_events_delete_admin on public.company_events for delete to authenticated
  using ((select private.is_admin()));
