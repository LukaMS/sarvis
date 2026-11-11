// The interface a derived job implements (P4.7, D-089). A job reads our own tables and fetches
// nothing, so it doesn't fit `Source`, whose `parse` sees only a stored raw response. The runner
// (runner.ts) owns the lifecycle and the bookkeeping, as the driver does for sources:
//
//   prepare → read a batch of rows that need work (id order, after the last id) → work → write
//
// Incremental by design: `read` returns only rows that still need work, so an interrupted run
// resumes where it stopped, and a run after an OFF delta touches only the new rows. The runner
// pages by id, so a row the job reads but can't settle is read once per run, not forever.
import type { RunMode } from '@sarvis/core';

import type { Logger } from '../log.ts';
import type { UpsertCounts } from '../runs/progress.ts';
import type { SourceEvent, SourceRow } from '../sources/source.ts';

export interface JobContext {
  runId: string;
  /** The `sources` row every job runs under (JOB_SOURCE_KEY). */
  source: SourceRow;
  mode: RunMode;
  /** True for `--dry-run`: the runner never calls `write`. */
  dryRun: boolean;
  /** The row cap for `--sample`; null means every row that needs work. */
  sampleSize: number | null;
  signal: AbortSignal;
  log: Logger;
}

/** What a job worked out for one batch. */
export interface JobWork<Change> {
  /** The writes to make. Counted as `valid`; a dry run stops here. */
  changes: Change[];
  /** Rows read that need no write this time (nothing to derive yet). Counted as `unchanged`. */
  unchanged: number;
  /** Written as `ingestion_run_events`, within the run's cap. */
  events?: SourceEvent[];
}

export interface Job<Item = unknown, Change = unknown> {
  /** The CLI name and `ingestion_runs.job`, e.g. `categorize-tags`. */
  readonly name: string;
  /** `ingestion_runs.job_version`; bump it when the rules change. */
  readonly version: string;
  /** Rows per batch (default DEFAULT_JOB_BATCH_SIZE). */
  readonly batchSize?: number;

  /** Load lookups (mappings, ids). Throw ConfigurationError when something it needs is missing. */
  prepare?(ctx: JobContext): Promise<void>;
  /** Up to `limit` rows that need work with an id greater than `after` (null: from the start), in id order. */
  read(after: string | null, limit: number, ctx: JobContext): Promise<Item[]>;
  /** The id `read` orders and pages by. */
  idOf(item: Item): string;
  /** Works out the changes for one batch. Writes nothing. */
  work(items: Item[], ctx: JobContext): JobWork<Change> | Promise<JobWork<Change>>;
  /** Writes one batch's changes and says what happened. Must skip locked fields. */
  write(changes: Change[], ctx: JobContext): Promise<UpsertCounts>;
  /** Summary events after the last batch (only when the run got that far). */
  finish?(ctx: JobContext): SourceEvent[] | Promise<SourceEvent[]>;
  dispose?(): Promise<void>;
}
