import { describe, expect, it } from 'vitest';

import {
  emptyRunCounts,
  isDryRun,
  RUN_STATUSES,
  RunCountsSchema,
  TERMINAL_RUN_STATUSES,
} from './runs';

describe('runs', () => {
  it('treats every status but running as terminal', () => {
    expect(RUN_STATUSES.filter((s) => !TERMINAL_RUN_STATUSES.has(s))).toEqual(['running']);
  });

  it('flags only dry_run as a dry run', () => {
    expect(isDryRun('dry_run')).toBe(true);
    expect(isDryRun('sample')).toBe(false);
  });

  it('validates the counts object', () => {
    expect(RunCountsSchema.parse(emptyRunCounts())).toEqual(emptyRunCounts());
    expect(RunCountsSchema.safeParse({ ...emptyRunCounts(), invalid: -1 }).success).toBe(false);
  });
});
