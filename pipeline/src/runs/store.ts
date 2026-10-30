// Run bookkeeping behind an interface, so the driver can be tested against memory and run against
// Supabase. Every method maps to one table in DATA_MODEL §3.1.
import type { Json, RunCounts, RunMode, RunStatus, RunTrigger, ValidationRule } from '@sarvis/core';

import type { ServiceClient } from '../db/client.ts';
import { DatabaseError } from '../errors.ts';
import type { LogLevel } from '../log.ts';
import type { SourceRow } from '../sources/source.ts';

export interface NewRun {
  source_id: string;
  job: string;
  job_version: string;
  mode: RunMode;
  sample_size: number | null;
  triggered_by: RunTrigger;
  git_sha: string | null;
  actions_run_url: string | null;
}

export interface RunPatch {
  status?: RunStatus;
  finished_at?: string;
  counts?: RunCounts;
  expected_total?: number | null;
  error_summary?: string | null;
  dump_url?: string | null;
  dump_sha256?: string | null;
  dump_fetched_at?: string | null;
}

export interface RunEvent {
  run_id: string;
  severity: LogLevel;
  event_type: string;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface FailureRow {
  run_id: string;
  raw_object_id: string | null;
  record_key: string | null;
  rule: ValidationRule;
  message: string;
  payload: unknown;
}

export interface RunStore {
  loadSource(key: string): Promise<SourceRow | null>;
  /** Marks `running` runs started before `startedBefore` as failed. Returns how many. */
  sweepStaleRuns(startedBefore: Date, finishedAt: Date): Promise<number>;
  createRun(run: NewRun): Promise<string>;
  updateRun(id: string, patch: RunPatch): Promise<void>;
  addEvent(event: RunEvent): Promise<void>;
  addValidationFailures(rows: FailureRow[]): Promise<void>;
  /** `counts.fetched` of the source's last clean, full run of this job, for the drop safeguard. */
  previousFullCount(sourceId: string, job: string): Promise<number | null>;
  /**
   * Which of `urls` a `completed` run of this source, job and mode stored as a raw object's
   * `request_url`. A failed, cancelled or errored run's files don't count, so they're fetched again.
   */
  storedRequestUrls(
    sourceId: string,
    job: string,
    mode: RunMode,
    urls: string[],
  ): Promise<Set<string>>;
}

export const STALE_SWEEP_SUMMARY = 'Swept at start-up: still running past the run timeout.';

// --- Supabase ---------------------------------------------------------------

function fail(what: string, error: { message: string }): never {
  throw new DatabaseError(`${what} failed: ${error.message}`, error);
}

export function createSupabaseRunStore(db: ServiceClient): RunStore {
  return {
    async loadSource(key) {
      const { data, error } = await db
        .from('sources')
        .select('id, key, verdict, enabled, rate_limit_per_sec')
        .eq('key', key)
        .maybeSingle();
      if (error) fail(`Loading source ${key}`, error);
      if (!data) return null;
      return { ...data, verdict: data.verdict as SourceRow['verdict'] };
    },

    async sweepStaleRuns(startedBefore, finishedAt) {
      const { data, error } = await db
        .from('ingestion_runs')
        .update({
          status: 'failed',
          finished_at: finishedAt.toISOString(),
          error_summary: STALE_SWEEP_SUMMARY,
        })
        .eq('status', 'running')
        .lt('started_at', startedBefore.toISOString())
        .select('id');
      if (error) fail('Sweeping stale runs', error);
      return data.length;
    },

    async createRun(run) {
      const { data, error } = await db.from('ingestion_runs').insert(run).select('id').single();
      if (error) fail('Creating the run', error);
      return data.id;
    },

    async updateRun(id, patch) {
      const { error } = await db.from('ingestion_runs').update(patch).eq('id', id);
      if (error) fail(`Updating run ${id}`, error);
    },

    async addEvent(event) {
      const { error } = await db
        .from('ingestion_run_events')
        .insert({ ...event, details: (event.details ?? null) as Json });
      if (error) fail('Writing a run event', error);
    },

    async addValidationFailures(rows) {
      if (rows.length === 0) return;
      const { error } = await db
        .from('validation_failures')
        .insert(rows.map((r) => ({ ...r, payload: r.payload as Json })));
      if (error) fail('Writing validation failures', error);
    },

    async previousFullCount(sourceId, job) {
      const { data, error } = await db
        .from('ingestion_runs')
        .select('counts')
        .eq('source_id', sourceId)
        .eq('job', job)
        .eq('mode', 'full')
        .eq('status', 'completed')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) fail('Reading the previous run', error);
      const fetched = (data?.counts as Partial<RunCounts> | undefined)?.fetched;
      return typeof fetched === 'number' ? fetched : null;
    },

    async storedRequestUrls(sourceId, job, mode, urls) {
      const found = new Set<string>();
      for (let i = 0; i < urls.length; i += 100) {
        const { data, error } = await db
          .from('raw_objects')
          .select('request_url, ingestion_runs!inner(job, mode, status)')
          .eq('source_id', sourceId)
          .eq('ingestion_runs.job', job)
          .eq('ingestion_runs.mode', mode)
          .eq('ingestion_runs.status', 'completed')
          .in('request_url', urls.slice(i, i + 100));
        if (error) fail('Reading stored request URLs', error);
        for (const r of data) if (r.request_url) found.add(r.request_url);
      }
      return found;
    },
  };
}

// --- Memory (tests) ---------------------------------------------------------

export interface MemoryRun extends NewRun {
  id: string;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  counts: RunCounts | Record<string, never>;
  expected_total: number | null;
  error_summary: string | null;
  dump_url?: string | null;
  dump_sha256?: string | null;
  dump_fetched_at?: string | null;
}

export interface MemoryRunStore extends RunStore {
  sources: SourceRow[];
  runs: MemoryRun[];
  events: RunEvent[];
  failures: FailureRow[];
  /** Stored raw objects, as far as storedRequestUrls needs them (tests push to it). */
  rawUrls: { run_id: string; request_url: string }[];
}

export function createMemoryRunStore(
  init: { sources?: SourceRow[]; runs?: MemoryRun[] } = {},
): MemoryRunStore {
  let nextId = 1;
  const store: MemoryRunStore = {
    sources: init.sources ?? [],
    runs: init.runs ?? [],
    events: [],
    failures: [],
    rawUrls: [],

    async loadSource(key) {
      return store.sources.find((s) => s.key === key) ?? null;
    },

    async sweepStaleRuns(startedBefore, finishedAt) {
      let n = 0;
      for (const run of store.runs) {
        if (run.status === 'running' && new Date(run.started_at) < startedBefore) {
          run.status = 'failed';
          run.finished_at = finishedAt.toISOString();
          run.error_summary = STALE_SWEEP_SUMMARY;
          n++;
        }
      }
      return n;
    },

    async createRun(run) {
      const id = `run-${nextId++}`;
      store.runs.push({
        ...run,
        id,
        status: 'running',
        started_at: new Date().toISOString(),
        finished_at: null,
        counts: {},
        expected_total: null,
        error_summary: null,
      });
      return id;
    },

    async updateRun(id, patch) {
      const run = store.runs.find((r) => r.id === id);
      if (!run) throw new DatabaseError(`No run ${id}`);
      Object.assign(run, patch);
    },

    async addEvent(event) {
      store.events.push(event);
    },

    async addValidationFailures(rows) {
      store.failures.push(...rows);
    },

    async previousFullCount(sourceId, job) {
      const last = store.runs
        .filter(
          (r) =>
            r.source_id === sourceId &&
            r.job === job &&
            r.mode === 'full' &&
            r.status === 'completed',
        )
        .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
      const fetched = (last?.counts as Partial<RunCounts> | undefined)?.fetched;
      return typeof fetched === 'number' ? fetched : null;
    },

    async storedRequestUrls(sourceId, job, mode, urls) {
      const runs = new Set(
        store.runs
          .filter(
            (r) =>
              r.source_id === sourceId &&
              r.job === job &&
              r.mode === mode &&
              r.status === 'completed',
          )
          .map((r) => r.id),
      );
      const wanted = new Set(urls);
      return new Set(
        store.rawUrls
          .filter((r) => runs.has(r.run_id) && wanted.has(r.request_url))
          .map((r) => r.request_url),
      );
    },
  };
  return store;
}
