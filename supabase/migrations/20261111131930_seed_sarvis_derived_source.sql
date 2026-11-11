-- P4.7: the internal source that derived jobs run under (`pipeline job <name>`, D-089). A job reads
-- our own tables and fetches nothing, but `ingestion_runs.source_id` is required, so every job run
-- is filed under this row, and the run lock (source_id, job) keeps one running run per job.
-- `derived` (P2.2) stays the source of the SQL price rollups.
-- Re-runnable: upserts on key, and only touches the row when a mirrored column differs.

insert into public.sources as s (
  key, sources_md_id, name, homepage_url, licence, licence_url, attribution_text, access_method,
  terms_url, terms_checked_at, verdict, url_template, rate_limit_per_sec, enabled
)
values
  ('sarvis-derived', null, 'Sarvis derived jobs (computed from our own tables)', null, null, null, null,
   'internal', null, null, 'use', null, 1, true)
on conflict (key) do update set
  sources_md_id = excluded.sources_md_id,
  name = excluded.name,
  homepage_url = excluded.homepage_url,
  licence = excluded.licence,
  licence_url = excluded.licence_url,
  attribution_text = excluded.attribution_text,
  access_method = excluded.access_method,
  terms_url = excluded.terms_url,
  terms_checked_at = excluded.terms_checked_at,
  verdict = excluded.verdict,
  url_template = excluded.url_template,
  rate_limit_per_sec = excluded.rate_limit_per_sec,
  enabled = excluded.enabled
where (
  s.sources_md_id, s.name, s.homepage_url, s.licence, s.licence_url, s.attribution_text, s.access_method,
  s.terms_url, s.terms_checked_at, s.verdict, s.url_template, s.rate_limit_per_sec, s.enabled
) is distinct from (
  excluded.sources_md_id, excluded.name, excluded.homepage_url, excluded.licence, excluded.licence_url,
  excluded.attribution_text, excluded.access_method, excluded.terms_url, excluded.terms_checked_at, excluded.verdict,
  excluded.url_template, excluded.rate_limit_per_sec, excluded.enabled
);
