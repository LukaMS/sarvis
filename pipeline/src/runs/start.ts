// The start of a run, shared by sources (driver.ts) and derived jobs (jobs/runner.ts): check the
// `sources` row, sweep that source's stale runs, create the `running` row under the run lock, and
// hand back an event writer capped at MAX_RUN_EVENTS.
import type { RunMode, RunTrigger } from '@sarvis/core';

import { ConfigurationError, RunLockedError } from '../errors.ts';
import { type LogLevel, type Logger, logger as rootLogger } from '../log.ts';
import type { SourceRow } from '../sources/source.ts';
import type { RunStore } from './store.ts';

/** At most this many `ingestion_run_events` rows per run; the last slot is kept for the final event. */
export const MAX_RUN_EVENTS = 50;
/** A `running` run older than this is dead: GitHub Actions stops a job at 6 hours. */
export const DEFAULT_RUN_TIMEOUT_MS = 6 * 60 * 60 * 1000;

/** A source this run must not touch. Thrown before any run row is created. */
export class SourceRefusedError extends ConfigurationError {
  constructor(message: string) {
    super(message);
    this.name = 'SourceRefusedError';
  }
}

export function checkSource(key: string, row: SourceRow | null): SourceRow {
  if (!row) throw new SourceRefusedError(`Source ${key} has no row in sources.`);
  if (row.verdict !== 'use') {
    throw new SourceRefusedError(`Source ${key} has verdict ${row.verdict}; only 'use' can run.`);
  }
  if (!row.enabled) throw new SourceRefusedError(`Source ${key} is disabled.`);
  return row;
}

/** Writes one run event. `final` may use the slot kept back for run_finished. */
export type EventWriter = (
  severity: LogLevel,
  eventType: string,
  message: string,
  details?: Record<string, unknown>,
  final?: boolean,
) => Promise<void>;

export interface StartedRun {
  runId: string;
  sweptStaleRuns: number;
  startedAt: Date;
  log: Logger;
  event: EventWriter;
  /** Events past the cap, which were logged but not stored. */
  eventsDropped(): number;
}

export async function startRun(
  store: RunStore,
  row: SourceRow,
  run: {
    job: string;
    job_version: string;
    mode: RunMode;
    sample_size: number | null;
    triggered_by: RunTrigger;
    git_sha: string | null;
    actions_run_url: string | null;
  },
  opts: { now: () => Date; runTimeoutMs?: number; log?: Logger },
): Promise<StartedRun> {
  const startedAt = opts.now();
  // Only this source's stale runs: another source's run is its own driver's business (P2.24).
  const sweptStaleRuns = await store.sweepStaleRuns(
    row.id,
    new Date(startedAt.getTime() - (opts.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS)),
    startedAt,
  );
  let runId: string;
  try {
    runId = await store.createRun({ source_id: row.id, ...run });
  } catch (err) {
    // The run lock: refused before a row exists, so the running run is left alone.
    if (err instanceof RunLockedError) {
      throw new RunLockedError({
        sourceKey: row.key,
        job: err.job,
        runningRunId: err.runningRunId,
        runningSince: err.runningSince,
      });
    }
    throw err;
  }
  const log = (opts.log ?? rootLogger).child({ sourceKey: row.key, runId });

  let written = 0;
  let dropped = 0;
  const event: EventWriter = async (severity, eventType, message, details, final = false) => {
    log[severity](message, { eventType, ...details });
    if (!final && written >= MAX_RUN_EVENTS - 1) {
      dropped++;
      return;
    }
    written++;
    await store.addEvent({ run_id: runId, severity, event_type: eventType, message, details });
  };

  if (sweptStaleRuns > 0) {
    await event('warn', 'stale_runs_swept', `Marked ${sweptStaleRuns} stale run(s) failed.`, {
      count: sweptStaleRuns,
    });
  }
  return { runId, sweptStaleRuns, startedAt, log, event, eventsDropped: () => dropped };
}
