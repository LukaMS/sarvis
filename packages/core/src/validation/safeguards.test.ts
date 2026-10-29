import { describe, expect, it } from 'vitest';

import { computeQuality, DEFAULT_SAFEGUARDS, evaluateBatch } from './safeguards.ts';

// Ported from legacy catalog-worker jobs/safeguards.test.ts. Legacy built NormalizedRetailerProduct
// arrays, which the rebuild doesn't have, so the fixtures pass the same batches as counts
// (e.g. 2 valid products, 1 of them priced, plus 2 failures). Every assertion is unchanged.
describe('computeQuality', () => {
  it('computes invalid + price presence rates', () => {
    const stats = computeQuality({ valid: 2, withPrice: 1, failedCount: 2 });
    expect(stats.total).toBe(4);
    expect(stats.invalid).toBe(2);
    expect(stats.invalidRate).toBe(0.5);
    expect(stats.pricePresenceRate).toBe(0.5);
  });
});

describe('evaluateBatch', () => {
  const goodQuality = computeQuality({ valid: 2, failedCount: 0 });

  it('passes a healthy category', () => {
    const v = evaluateBatch({ fetched: 100, quality: goodQuality, previousCount: 90 });
    expect(v.fail).toBe(false);
  });

  it('fails when invalid rate is too high', () => {
    const q = computeQuality({ valid: 1, failedCount: 5 });
    const v = evaluateBatch({ fetched: 6, quality: q, previousCount: null });
    expect(v.fail).toBe(true);
  });

  it('fails when a previously-stocked category returns nothing', () => {
    const v = evaluateBatch({
      fetched: 0,
      quality: computeQuality({ valid: 0, failedCount: 0 }),
      previousCount: 200,
    });
    expect(v.fail).toBe(true);
  });

  it('warns (not fails) on a dramatic drop', () => {
    const v = evaluateBatch({ fetched: 40, quality: goodQuality, previousCount: 200 });
    expect(v.fail).toBe(false);
    expect(v.warnings.length).toBe(1);
  });
});

describe('rebuild extensions', () => {
  it('does not fail at exactly 50% invalid', () => {
    const v = evaluateBatch({
      fetched: 4,
      quality: computeQuality({ valid: 2, failedCount: 2 }),
      previousCount: null,
    });
    expect(v.fail).toBe(false);
  });

  it('warns above 5% duplicates and fails above 50%', () => {
    const some = computeQuality({ valid: 90, failedCount: 10, duplicates: 10 });
    const warn = evaluateBatch({ fetched: 100, quality: some, previousCount: null });
    expect(warn.fail).toBe(false);
    expect(warn.warnings).toEqual([expect.stringContaining('Duplicate rate 10%')]);

    // 60 of 100 are repeats (a pagination loop). Raise the invalid limit so the duplicate rule decides.
    const loop = computeQuality({ valid: 40, failedCount: 60, duplicates: 60 });
    const fail = evaluateBatch(
      { fetched: 100, quality: loop, previousCount: null },
      { ...DEFAULT_SAFEGUARDS, maxInvalidRate: 0.9 },
    );
    expect(fail.fail).toBe(true);
    expect(fail.reason).toContain('Duplicate rate 60%');
  });

  it('warns when the unit-parse rate is under target, and not without a parser', () => {
    const low = computeQuality({ valid: 10, failedCount: 0, unitParse: { attempted: 10, ok: 5 } });
    expect(evaluateBatch({ fetched: 10, quality: low, previousCount: null }).warnings).toEqual([
      expect.stringContaining('Only 50% of sizes parsed'),
    ]);
    const none = computeQuality({ valid: 10, failedCount: 0, unitParse: null });
    expect(none.unitParseRate).toBeNull();
    expect(evaluateBatch({ fetched: 10, quality: none, previousCount: null }).warnings).toEqual([]);
  });
});
