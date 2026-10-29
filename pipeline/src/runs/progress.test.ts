// Ported from legacy jobs/progress.test.ts, with the `failed` input the rebuild adds.
import { TERMINAL_RUN_STATUSES, emptyRunCounts } from '@sarvis/core';
import { describe, expect, it } from 'vitest';

import { addCounts, computeFinalStatus, emptyUpsertCounts } from './progress.ts';

describe('computeFinalStatus', () => {
  it('returns cancelled when cancelled, even with errors or a failure', () => {
    expect(computeFinalStatus({ cancelled: true, failed: true, hadErrors: true })).toBe(
      'cancelled',
    );
  });

  it('returns failed on a fatal failure that was not a cancel', () => {
    expect(computeFinalStatus({ cancelled: false, failed: true, hadErrors: true })).toBe('failed');
  });

  it('returns completed_with_errors when errors but not cancelled or failed', () => {
    expect(computeFinalStatus({ cancelled: false, failed: false, hadErrors: true })).toBe(
      'completed_with_errors',
    );
  });

  it('returns completed on a clean run', () => {
    expect(computeFinalStatus({ cancelled: false, failed: false, hadErrors: false })).toBe(
      'completed',
    );
  });

  it('always yields a terminal status', () => {
    for (const cancelled of [true, false]) {
      for (const failed of [true, false]) {
        for (const hadErrors of [true, false]) {
          const status = computeFinalStatus({ cancelled, failed, hadErrors });
          expect(TERMINAL_RUN_STATUSES.has(status)).toBe(true);
        }
      }
    }
  });
});

describe('addCounts', () => {
  it('sums full and partial counts', () => {
    const a = { ...emptyRunCounts(), fetched: 2, valid: 2, inserted: 1 };
    const b = { ...emptyUpsertCounts(), updated: 2, unchanged: 1 };
    const sum = addCounts(addCounts(a, b), { fetched: 3, invalid: 1 });
    expect(sum).toEqual({
      fetched: 5,
      valid: 2,
      invalid: 1,
      inserted: 1,
      updated: 2,
      unchanged: 1,
      skipped_locked: 0,
    });
  });
});
