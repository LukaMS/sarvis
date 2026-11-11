// The derived-job runner (P4.7, D-089): the bookkeeping of a source run for work that reads our own
// tables. One call = one `ingestion_runs` row under the JOB_SOURCE_KEY source:
//
//   check source → sweep stale runs → create run (refused if this job is running) → prepare
//   → per batch: read (id order, after the last id) → work → write (not in a dry run)
//   → finish → final status
//
// Same counts, capped events, cancellation and exit statuses as runSource. Whole-run safeguards
// don't apply: a job reads only rows that need work, so 0 rows is a normal run.
import {
  type RunCounts,
  type RunMode,
  type RunTrigger,
  emptyRunCounts,
  isDryRun,
} from '@sarvis/core';

import { CancelledError, ConfigurationError, classifyError } from '../errors.ts';
import type { Logger } from '../log.ts';
import { type RunResult, isFatal } from '../runs/driver.ts';
import { addCounts, computeFinalStatus } from '../runs/progress.ts';
import { checkSource, startRun } from '../runs/start.ts';
import type { RunStore } from '../runs/store.ts';
import type { Job, JobContext } from './job.ts';

/**
 * Every job runs under this `sources` row (seeded by migration 20261111131930). `derived` (P2.2)
 * stays the source of the SQL price rollups (D-089).
 */
export const JOB_SOURCE_KEY = 'sarvis-derived';
export const DEFAULT_JOB_BATCH_SIZE = 500;

/** The modes a job runs in. A job has no delta: it always reads only what needs work. */
export type JobMode = Extract<RunMode, 'full' | 'sample' | 'dry_run'>;

export interface JobOptions {
  mode: JobMode;
  /** Required for `sample`, optional for `dry_run`, not allowed for `full`. */
  sampleSize?: number | null;
  trigger: RunTrigger;
  gitSha?: string | null;
  actionsRunUrl?: string | null;
  signal?: AbortSignal;
  runTimeoutMs?: number;
}

export interface JobDeps {
  store: RunStore;
  log?: Logger;
  now?: () => Date;
}

function checkOptions(opts: JobOptions): number | null {
  const mode = opts.mode as RunMode;
  if (mode !== 'full' && mode !== 'sample' && mode !== 'dry_run') {
    throw new ConfigurationError(`A job runs full, sample or dry_run, not ${mode}.`);
  }
  const sampleSize = opts.sampleSize ?? null;
  if (sampleSize !== null && (!Number.isInteger(sampleSize) || sampleSize < 1)) {
    throw new ConfigurationError(`Sample size must be a positive integer, got ${sampleSize}.`);
  }
  if (mode === 'sample' && sampleSize === null) {
    throw new ConfigurationError('A sample run needs a sample size.');
  }
  if (mode === 'full' && sampleSize !== null) {
    throw new ConfigurationError("A full run can't have a sample size; use mode sample.");
  }
  return sampleSize;
}

export async function runJob<Item, Change>(
  job: Job<Item, Change>,
  opts: JobOptions,
  deps: JobDeps,
): Promise<RunResult> {
  const now = deps.now ?? (() => new Date());
  const { store } = deps;
  const sampleSize = checkOptions(opts);
  const batchSize = job.batchSize ?? DEFAULT_JOB_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new ConfigurationError(`Job ${job.name} has batch size ${batchSize}.`);
  }
  const row = checkSource(JOB_SOURCE_KEY, await store.loadSource(JOB_SOURCE_KEY));
  const signal = opts.signal ?? new AbortController().signal;
  const dryRun = isDryRun(opts.mode);

  const { runId, sweptStaleRuns, log, event, eventsDropped } = await startRun(
    store,
    row,
    {
      job: job.name,
      job_version: job.version,
      mode: opts.mode,
      sample_size: sampleSize,
      triggered_by: opts.trigger,
      git_sha: opts.gitSha ?? null,
      actions_run_url: opts.actionsRunUrl ?? null,
    },
    { now, runTimeoutMs: opts.runTimeoutMs, log: deps.log },
  );
  const ctx: JobContext = {
    runId,
    source: row,
    mode: opts.mode,
    dryRun,
    sampleSize,
    signal,
    log,
  };

  let counts: RunCounts = emptyRunCounts();
  let batches = 0;
  let cancelled = false;
  let failed = false;
  let hadErrors = false;
  let errorSummary: string | null = null;

  try {
    await job.prepare?.(ctx);
    let after: string | null = null;
    for (;;) {
      if (signal.aborted) throw new CancelledError();
      const limit =
        sampleSize === null ? batchSize : Math.min(batchSize, sampleSize - counts.fetched);
      if (limit <= 0) break;

      const items = await job.read(after, limit, ctx);
      if (items.length === 0) break;
      if (items.length > limit) {
        throw new ConfigurationError(`Job ${job.name} read ${items.length} rows, limit ${limit}.`);
      }
      // Paging by id only ends if the ids climb; a job that broke the order would loop forever.
      let previous: string | null = after;
      for (const item of items) {
        const id = job.idOf(item);
        if (previous !== null && !(id > previous)) {
          throw new ConfigurationError(
            `Job ${job.name} read ${id} after ${previous}: not in id order.`,
          );
        }
        previous = id;
      }
      after = previous;
      batches++;
      counts = addCounts(counts, { fetched: items.length });

      try {
        const work = await job.work(items, ctx);
        counts = addCounts(counts, { valid: work.changes.length, unchanged: work.unchanged });
        for (const e of work.events ?? []) {
          await event(e.severity, e.eventType, e.message, { batch: batches, ...e.details });
        }
        if (!dryRun && work.changes.length > 0) {
          counts = addCounts(counts, await job.write(work.changes, ctx));
        }
      } catch (err) {
        if (isFatal(err) || signal.aborted) throw err;
        // One bad batch: the next batch still runs, but the run can't end clean.
        hadErrors = true;
        const c = classifyError(err);
        errorSummary ??= c.message;
        await event('error', 'batch_failed', c.message, {
          batch: batches,
          firstId: job.idOf(items[0] as Item),
          lastId: after,
          errorType: c.type,
        });
      }
      await store.updateRun(runId, { counts });
      if (items.length < limit) break;
    }
    for (const e of (await job.finish?.(ctx)) ?? []) {
      await event(e.severity, e.eventType, e.message, e.details);
    }
  } catch (err) {
    if (err instanceof CancelledError || signal.aborted) {
      cancelled = true;
      await event('warn', 'cancelled', 'Run cancelled.');
    } else {
      failed = true;
      const c = classifyError(err);
      errorSummary = c.message;
      await event('error', 'run_failed', c.message, { errorType: c.type, alert: c.alert });
    }
  } finally {
    await job.dispose?.();
  }

  const status = computeFinalStatus({ cancelled, failed, hadErrors });
  await store.updateRun(runId, {
    status,
    finished_at: now().toISOString(),
    counts,
    error_summary: errorSummary,
  });
  await event(
    status === 'completed' ? 'info' : status === 'failed' ? 'error' : 'warn',
    'run_finished',
    `Run ${status}.`,
    { counts, batches, dryRun, eventsDropped: eventsDropped() },
    true,
  );
  return {
    runId,
    status,
    counts,
    expectedTotal: null,
    errorSummary,
    deactivated: null,
    sweptStaleRuns,
  };
}
