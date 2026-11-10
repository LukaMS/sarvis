-- P2.24: one running run per source and job (review M-4). A scheduled run and a manual run of the
-- same job can't overlap: the second insert fails on this index and the driver refuses to start.
-- A run that died without finishing is swept to `failed` after the run timeout (driver.ts), which
-- frees the lock.

create unique index ingestion_runs_one_running_idx
  on public.ingestion_runs (source_id, job)
  where status = 'running';
