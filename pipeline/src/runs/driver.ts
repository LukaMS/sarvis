// The generic run lifecycle every source plugs into (adapted from legacy worker/job-runner.ts and
// commands/shared.ts). One call = one `ingestion_runs` row:
//
//   check source → sweep stale runs → create run → verifyContext → plan
//   → per step: fetch → store raw → parse → validate → safeguards → upsert
//   → run-level safeguards → expected total → final status → conservative deactivation
//
// Upserts and raw writes are injected, so a dry run skips both and tests use memory (D-045).
import {
  type RecordKind,
  type RecordOf,
  type RunCounts,
  type RunMode,
  type RunStatus,
  type RunTrigger,
  type SafeguardThresholds,
  DEFAULT_SAFEGUARDS,
  computeQuality,
  emptyRunCounts,
  evaluateBatch,
  isDryRun,
  qualityOf,
  validateBatch,
} from '@sarvis/core';

import type { ServiceClient } from '../db/client.ts';
import {
  CancelledError,
  ConfigurationError,
  DatabaseError,
  SourceBlockedError,
  classifyError,
} from '../errors.ts';
import { type HttpClient, createHttpClient } from '../http/client.ts';
import { jitteredDelayMs, sleep } from '../http/retry.ts';
import { userAgent } from '../index.ts';
import { type LogLevel, type Logger, logger as rootLogger } from '../log.ts';
import { type RawInput, envelopeOf, storeRaw } from '../raw/store.ts';
import type {
  FetchResult,
  ParseResult,
  RawPayload,
  RecordBatch,
  Source,
  SourceRow,
  SourceRunContext,
} from '../sources/source.ts';
import { type UpsertCounts, addCounts, computeFinalStatus } from './progress.ts';
import type { RunStore } from './store.ts';

/** At most this many `ingestion_run_events` rows per run; the last slot is kept for the final event. */
export const MAX_RUN_EVENTS = 50;
/** At most this many `validation_failures` rows per run; `counts.invalid` holds the full number. */
export const MAX_VALIDATION_FAILURES = 50;
/** A `running` run older than this is dead: GitHub Actions stops a job at 6 hours. */
export const DEFAULT_RUN_TIMEOUT_MS = 6 * 60 * 60 * 1000;
/** Pause between fetches, on top of the HTTP client's per-host limit, jittered up to 1.5×. */
export const DEFAULT_POLITENESS_DELAY_MS = 500;

/** Stores one raw response for the run. The default writes to Storage with storeRaw(). */
export interface RawWriter {
  store(seq: number, input: RawInput): Promise<{ id: string }>;
}

/** The default raw writer factory: gzip to the raw bucket plus a raw_objects row (P2.14). */
export function storageRawWriter(db: ServiceClient): RunDeps<RecordKind>['raw'] {
  return ({ runId, source }) => ({
    store: (seq, input) =>
      storeRaw({ db, sourceId: source.id, sourceKey: source.key, runId }, seq, input),
  });
}

export interface WriteContext {
  runId: string;
  source: SourceRow;
  rawObjectId: string | null;
}

/** A valid record the writer couldn't store (an unknown reference, or a row the DB refused). */
export interface RejectedRecord {
  key: string;
  message: string;
}

/** The domain writes for one record kind (src/db/writers). */
export interface RecordWriter<K extends RecordKind> {
  upsert(
    records: RecordOf<K>[],
    ctx: WriteContext,
  ): Promise<UpsertCounts & { rejected?: RejectedRecord[] }>;
  /**
   * Marks the source's rows that this run did not see as inactive. Only called after a clean,
   * full, uncancelled run of a source that supports it. Returns how many rows changed.
   */
  deactivateUnseen?(ctx: {
    runId: string;
    source: SourceRow;
    runStartedAt: string;
  }): Promise<number>;
}

export interface RunDeps<K extends RecordKind> {
  store: RunStore;
  /** Creates the raw writer once the run exists. Not called in a dry run. */
  raw: (ctx: { runId: string; source: SourceRow }) => RawWriter;
  writer: RecordWriter<K>;
  /** Writers for steps whose parse names another record kind (ParseResult.kind). */
  writerFor?: (kind: RecordKind) => RecordWriter<RecordKind>;
  /** Defaults to a polite client limited by the source row's rate. */
  http?: HttpClient;
  /**
   * `PIPELINE_CONTACT_EMAIL`. Required by a source with `contact: 'email'`, which is refused
   * without it; other sources never send it.
   */
  contactEmail?: string | null;
  log?: Logger;
  now?: () => Date;
}

export interface RunOptions {
  mode: RunMode;
  /** Required for `sample`, optional for `dry_run`, not allowed for `full` and `delta`. */
  sampleSize?: number | null;
  trigger: RunTrigger;
  gitSha?: string | null;
  actionsRunUrl?: string | null;
  signal?: AbortSignal;
  runTimeoutMs?: number;
  /** Overrides the source's and the default delay (tests use 0). */
  politenessDelayMs?: number;
  safeguards?: SafeguardThresholds;
}

export interface RunResult {
  runId: string;
  status: Exclude<RunStatus, 'running'>;
  counts: RunCounts;
  expectedTotal: number | null;
  errorSummary: string | null;
  /** Rows marked inactive, or null when deactivation didn't run. */
  deactivated: number | null;
  sweptStaleRuns: number;
}

/** A source this run must not touch. Thrown before any run row is created. */
export class SourceRefusedError extends ConfigurationError {
  constructor(message: string) {
    super(message);
    this.name = 'SourceRefusedError';
  }
}

function checkOptions(source: Source, opts: RunOptions): number | null {
  const sampleSize = opts.sampleSize ?? null;
  if (sampleSize !== null && (!Number.isInteger(sampleSize) || sampleSize < 1)) {
    throw new ConfigurationError(`Sample size must be a positive integer, got ${sampleSize}.`);
  }
  if (opts.mode === 'sample' && sampleSize === null) {
    throw new ConfigurationError('A sample run needs a sample size.');
  }
  if ((opts.mode === 'full' || opts.mode === 'delta') && sampleSize !== null) {
    throw new ConfigurationError(`A ${opts.mode} run can't have a sample size; use mode sample.`);
  }
  if (opts.mode === 'delta' && !source.capabilities.supportsDelta) {
    throw new ConfigurationError(`Source ${source.key} does not support delta runs.`);
  }
  return sampleSize;
}

/** The contact email the source's User-Agent carries, or null for the repo URL only. */
function contactFor(source: Source, contactEmail: string | null | undefined): string | null {
  if (source.capabilities.contact !== 'email') return null;
  if (!contactEmail) {
    throw new SourceRefusedError(
      `Source ${source.key} asks for a contact email. Set PIPELINE_CONTACT_EMAIL in the repo-root .env.`,
    );
  }
  return contactEmail;
}

function checkSource(key: string, row: SourceRow | null): SourceRow {
  if (!row) throw new SourceRefusedError(`Source ${key} has no row in sources.`);
  if (row.verdict !== 'use') {
    throw new SourceRefusedError(`Source ${key} has verdict ${row.verdict}; only 'use' can run.`);
  }
  if (!row.enabled) throw new SourceRefusedError(`Source ${key} is disabled.`);
  return row;
}

/** Errors that end the whole run rather than one step. */
function isFatal(err: unknown): boolean {
  return (
    err instanceof CancelledError ||
    err instanceof SourceBlockedError ||
    err instanceof DatabaseError ||
    err instanceof ConfigurationError ||
    (err instanceof Error && err.name === 'AbortError')
  );
}

export async function runSource<K extends RecordKind>(
  source: Source<K>,
  opts: RunOptions,
  deps: RunDeps<K>,
): Promise<RunResult> {
  const now = deps.now ?? (() => new Date());
  const { store } = deps;
  const sampleSize = checkOptions(source, opts);
  const contactEmail = contactFor(source, deps.contactEmail);
  const row = checkSource(source.key, await store.loadSource(source.key));
  await source.validateConfiguration?.();

  const signal = opts.signal ?? new AbortController().signal;
  const dryRun = isDryRun(opts.mode);
  const started = now();
  const sweptStaleRuns = await store.sweepStaleRuns(
    new Date(started.getTime() - (opts.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS)),
    started,
  );
  const runId = await store.createRun({
    source_id: row.id,
    job: source.job,
    job_version: source.version,
    mode: opts.mode,
    sample_size: sampleSize,
    triggered_by: opts.trigger,
    git_sha: opts.gitSha ?? null,
    actions_run_url: opts.actionsRunUrl ?? null,
  });
  const log = (deps.log ?? rootLogger).child({ sourceKey: row.key, runId });

  let eventsWritten = 0;
  let eventsDropped = 0;
  const event = async (
    severity: LogLevel,
    eventType: string,
    message: string,
    details?: Record<string, unknown>,
    final = false,
  ) => {
    log[severity](message, { eventType, ...details });
    if (!final && eventsWritten >= MAX_RUN_EVENTS - 1) {
      eventsDropped++;
      return;
    }
    eventsWritten++;
    await store.addEvent({ run_id: runId, severity, event_type: eventType, message, details });
  };

  if (sweptStaleRuns > 0) {
    await event('warn', 'stale_runs_swept', `Marked ${sweptStaleRuns} stale run(s) failed.`, {
      count: sweptStaleRuns,
    });
  }

  const ctx: SourceRunContext = {
    runId,
    source: row,
    mode: opts.mode,
    sampleSize,
    http:
      deps.http ??
      createHttpClient({
        sourceRateLimitPerSec: Number(row.rate_limit_per_sec),
        userAgent: userAgent(undefined, contactEmail),
        signal,
        log,
      }),
    signal,
    log,
  };
  const thresholds = opts.safeguards ?? DEFAULT_SAFEGUARDS;
  const delayMs = opts.politenessDelayMs ?? source.politenessDelayMs ?? DEFAULT_POLITENESS_DELAY_MS;

  let counts = emptyRunCounts();
  let duplicates = 0;
  let expectedTotal: number | null = null;
  let failuresStored = 0;
  let cancelled = false;
  let failed = false;
  let hadErrors = false;
  let errorSummary: string | null = null;
  let deactivated: number | null = null;

  const stepError = async (err: unknown, phase: string, details: Record<string, unknown>) => {
    if (isFatal(err) || signal.aborted) throw err;
    hadErrors = true;
    const c = classifyError(err);
    await event('error', `${phase}_failed`, c.message, { ...details, errorType: c.type });
  };

  try {
    if (source.verifyContext) {
      await source.verifyContext(ctx);
      await event('info', 'context_verified', 'Source context verified.');
    }

    const queue: unknown[] = [...(await source.plan(ctx))];
    const raw = dryRun ? null : deps.raw({ runId, source: row });
    const validateOptions = source.validateOptions?.() ?? {};
    let seq = 0;

    while (queue.length > 0) {
      if (signal.aborted) throw new CancelledError();
      if (sampleSize !== null && counts.fetched >= sampleSize) break;
      if (seq > 0 && delayMs > 0) await sleep(jitteredDelayMs(delayMs, delayMs * 1.5), signal);
      const step = queue.shift();
      seq++;

      let fetched: FetchResult<unknown>;
      try {
        fetched = await source.fetch(step, ctx);
      } catch (err) {
        await stepError(err, 'fetch', { seq });
        continue;
      }
      queue.push(...(fetched.next ?? []));
      if (fetched.dump) {
        await store.updateRun(runId, {
          dump_url: fetched.dump.url,
          dump_sha256: fetched.dump.sha256 ?? null,
          dump_fetched_at: fetched.dump.fetchedAt,
        });
      }
      for (const e of fetched.events ?? []) {
        await event(e.severity, e.eventType, e.message, { seq, ...e.details });
      }

      const envelope = envelopeOf(fetched.response);
      const rawObjectId = raw ? (await raw.store(seq, fetched.response)).id : null;
      const payload: RawPayload = {
        rawObjectId,
        body: envelope.body,
        contentType: envelope.content_type,
        requestUrl: envelope.request_url,
        httpStatus: envelope.http_status,
        headers: envelope.headers,
        fetchedAt: envelope.fetched_at,
      };

      let parsed: ParseResult;
      try {
        parsed = source.parse(payload);
      } catch (err) {
        await stepError(err, 'parse', { seq, rawObjectId });
        continue;
      }
      if (parsed.expectedTotal != null) expectedTotal = parsed.expectedTotal;

      const groups: RecordBatch[] = [
        ...(parsed.records.length > 0 || !parsed.batches
          ? [{ kind: source.recordKind, records: parsed.records }]
          : []),
        ...(parsed.batches ?? []),
      ];
      for (const group of groups) {
        const { kind } = group;
        if (sampleSize !== null && counts.fetched >= sampleSize) break;
        const records =
          sampleSize === null ? group.records : group.records.slice(0, sampleSize - counts.fetched);
        const batch = validateBatch(kind, records, validateOptions);
        counts = addCounts(counts, {
          fetched: records.length,
          valid: batch.stats.valid,
          invalid: batch.stats.invalid,
        });
        duplicates += batch.stats.byRule.duplicate;

        const room = MAX_VALIDATION_FAILURES - failuresStored;
        if (room > 0 && batch.failures.length > 0) {
          const rows = batch.failures.slice(0, room).map((f) => ({
            run_id: runId,
            raw_object_id: rawObjectId,
            record_key: f.record_key,
            rule: f.rule,
            message: f.message,
            payload: f.payload,
          }));
          await store.addValidationFailures(rows);
          failuresStored += rows.length;
        }

        const verdict = evaluateBatch(
          { fetched: records.length, quality: qualityOf(batch.stats), previousCount: null },
          thresholds,
        );
        for (const w of verdict.warnings)
          await event('warn', 'safeguard_warning', w, { seq, kind });
        if (verdict.fail) {
          // A suspect batch isn't written, and the run can't end clean.
          hadErrors = true;
          await event('error', 'safeguard_failed', verdict.reason ?? 'Batch failed safeguards.', {
            seq,
            kind,
            rawObjectId,
          });
        } else if (!dryRun && batch.valid.length > 0) {
          const writer =
            kind === source.recordKind
              ? (deps.writer as RecordWriter<RecordKind>)
              : deps.writerFor?.(kind);
          if (!writer) throw new ConfigurationError(`No writer for ${kind} records.`);
          const written = await writer.upsert(batch.valid, { runId, source: row, rawObjectId });
          counts = addCounts(counts, written);
          const rejected = written.rejected ?? [];
          if (rejected.length > 0) {
            // Valid but unwritten: the run can't end clean, and the first few say why.
            hadErrors = true;
            await event(
              'warn',
              'records_not_written',
              `${rejected.length} valid records were not written.`,
              {
                seq,
                kind,
                rawObjectId,
                examples: rejected.slice(0, 5),
              },
            );
          }
        }
      }
      await store.updateRun(runId, { counts, expected_total: expectedTotal });
    }

    // Whole-run safeguards: mostly invalid, or a full run that fell to 0 from a previous count.
    const fullRun = opts.mode === 'full';
    const previousCount = fullRun ? await store.previousFullCount(row.id, source.job) : null;
    const verdict = evaluateBatch(
      {
        fetched: counts.fetched,
        quality: computeQuality({
          valid: counts.valid,
          failedCount: counts.invalid,
          duplicates,
        }),
        previousCount,
      },
      thresholds,
    );
    for (const w of verdict.warnings) await event('warn', 'safeguard_warning', w);
    if (verdict.fail) {
      failed = true;
      errorSummary = verdict.reason ?? 'Run failed safeguards.';
      await event('error', 'run_safeguard_failed', errorSummary);
    }

    // Capped pagination shows up as fewer records than the source said it had.
    if (sampleSize === null && expectedTotal !== null && expectedTotal !== counts.fetched) {
      hadErrors = true;
      errorSummary ??= `Expected ${expectedTotal} records, fetched ${counts.fetched}.`;
      await event('warn', 'expected_total_mismatch', errorSummary, {
        expectedTotal,
        fetched: counts.fetched,
      });
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
    await source.dispose?.();
  }

  let status = computeFinalStatus({ cancelled, failed, hadErrors });

  // Conservative deactivation (legacy lesson): only a clean, full, uncancelled, written run may
  // mark rows it didn't see as gone. A sample, a dry run or any error leaves them alone.
  if (
    status === 'completed' &&
    opts.mode === 'full' &&
    source.capabilities.supportsDeactivation &&
    deps.writer.deactivateUnseen
  ) {
    try {
      deactivated = await deps.writer.deactivateUnseen({
        runId,
        source: row,
        runStartedAt: started.toISOString(),
      });
    } catch (err) {
      status = 'completed_with_errors';
      errorSummary = `Deactivation failed: ${classifyError(err).message}`;
      await event('error', 'deactivation_failed', errorSummary);
    }
  }

  await store.updateRun(runId, {
    status,
    finished_at: now().toISOString(),
    counts,
    expected_total: expectedTotal,
    error_summary: errorSummary,
  });
  await event(
    status === 'completed' ? 'info' : status === 'failed' ? 'error' : 'warn',
    'run_finished',
    `Run ${status}.`,
    { counts, expectedTotal, deactivated, eventsDropped, validationFailuresStored: failuresStored },
    true,
  );
  return { runId, status, counts, expectedTotal, errorSummary, deactivated, sweptStaleRuns };
}
