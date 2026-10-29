// Count arithmetic and the final-status rule for a run (ported from legacy jobs/progress.ts).
import type { RunCounts, RunStatus } from '@sarvis/core';

/** The upsert side of the counts: what P2.16's helpers report per batch. */
export type UpsertCounts = Pick<RunCounts, 'inserted' | 'updated' | 'unchanged' | 'skipped_locked'>;

export function emptyUpsertCounts(): UpsertCounts {
  return { inserted: 0, updated: 0, unchanged: 0, skipped_locked: 0 };
}

/**
 * The terminal status of a finished run. Cancellation wins (the run was stopped on purpose), then
 * a fatal failure (blocked source, failed safeguard, database error), then recoverable errors.
 */
export function computeFinalStatus(args: {
  cancelled: boolean;
  failed: boolean;
  hadErrors: boolean;
}): Exclude<RunStatus, 'running'> {
  if (args.cancelled) return 'cancelled';
  if (args.failed) return 'failed';
  if (args.hadErrors) return 'completed_with_errors';
  return 'completed';
}

export function addCounts<T extends Partial<RunCounts>>(a: RunCounts, b: T): RunCounts {
  return {
    fetched: a.fetched + (b.fetched ?? 0),
    valid: a.valid + (b.valid ?? 0),
    invalid: a.invalid + (b.invalid ?? 0),
    inserted: a.inserted + (b.inserted ?? 0),
    updated: a.updated + (b.updated ?? 0),
    unchanged: a.unchanged + (b.unchanged ?? 0),
    skipped_locked: a.skipped_locked + (b.skipped_locked ?? 0),
  };
}
