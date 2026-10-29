// Pipeline run modes, statuses and counts. Mirrors the ingestion_runs check constraints
// (DATA_MODEL §3.1). Adapted from legacy catalog-worker jobs/job-types.ts without the queue states.

import { z } from 'zod';

/** `full`: every record; `delta`: changed since the last run; `sample`: the first N; `dry_run`: no writes. */
export const RUN_MODES = ['full', 'delta', 'sample', 'dry_run'] as const;
export type RunMode = (typeof RUN_MODES)[number];

export const RUN_STATUSES = [
  'running',
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled',
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** Statuses a run can no longer move out of. */
export const TERMINAL_RUN_STATUSES: ReadonlySet<RunStatus> = new Set([
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled',
]);

export const RUN_TRIGGERS = ['schedule', 'dispatch', 'cli'] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

/** Dry runs do everything except upserts and raw writes (PLAN P2.15). */
export function isDryRun(mode: RunMode): boolean {
  return mode === 'dry_run';
}

/** The `ingestion_runs.counts` object. */
export const RunCountsSchema = z.object({
  fetched: z.number().int().nonnegative(),
  valid: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  skipped_locked: z.number().int().nonnegative(),
});
export type RunCounts = z.infer<typeof RunCountsSchema>;

export function emptyRunCounts(): RunCounts {
  return {
    fetched: 0,
    valid: 0,
    invalid: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skipped_locked: 0,
  };
}
