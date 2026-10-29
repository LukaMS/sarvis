// Data-quality safeguards, so a broken fetch or parser can't wipe out or corrupt large amounts of data.
// Ported from legacy catalog-worker jobs/safeguards.ts; extended with duplicate-rate and unit-parse
// thresholds. Pure, so the run driver (P2.15) decides what a failed verdict does.

import type { BatchStats } from './batch.ts';

export const MAX_INVALID_RATE = 0.5;
export const DRAMATIC_DROP_RATIO = 0.5;

export interface SafeguardThresholds {
  /** Fail above this share of invalid records. */
  maxInvalidRate: number;
  /** Warn when the count falls below previous × this. */
  dramaticDropRatio: number;
  /** Warn above this share of in-batch duplicates. */
  warnDuplicateRate: number;
  /** Fail above this share of duplicates (a pagination loop or a broken key). */
  maxDuplicateRate: number;
  /** Warn when fewer than this share of attempted sizes parse `ok`. */
  minUnitParseRate: number;
}

export const DEFAULT_SAFEGUARDS: SafeguardThresholds = {
  maxInvalidRate: MAX_INVALID_RATE,
  dramaticDropRatio: DRAMATIC_DROP_RATIO,
  warnDuplicateRate: 0.05,
  maxDuplicateRate: 0.5,
  minUnitParseRate: 0.8,
};

export interface QualityStats {
  total: number;
  withPrice: number;
  invalid: number;
  invalidRate: number;
  pricePresenceRate: number;
  duplicates: number;
  duplicateRate: number;
  /** Null when no unit parser ran or nothing had a size to parse. */
  unitParseRate: number | null;
}

/**
 * Quality of a batch. `valid` counts the records that passed, `failedCount` those that didn't.
 * `withPrice` is how many valid records carry a price (legacy price presence; leave it as `valid`
 * for kinds with no price). Duplicates are counted inside `failedCount`.
 */
export function computeQuality(args: {
  valid: number;
  failedCount: number;
  withPrice?: number;
  duplicates?: number;
  unitParse?: BatchStats['unitParse'];
}): QualityStats {
  const total = args.valid + args.failedCount;
  const withPrice = args.withPrice ?? args.valid;
  const duplicates = args.duplicates ?? 0;
  const up = args.unitParse;
  return {
    total,
    withPrice,
    invalid: args.failedCount,
    invalidRate: total === 0 ? 0 : args.failedCount / total,
    pricePresenceRate: args.valid === 0 ? 0 : withPrice / args.valid,
    duplicates,
    duplicateRate: total === 0 ? 0 : duplicates / total,
    unitParseRate: up && up.attempted > 0 ? up.ok / up.attempted : null,
  };
}

/** Quality straight from a validateBatch result. */
export function qualityOf(stats: BatchStats, withPrice?: number): QualityStats {
  return computeQuality({
    valid: stats.valid,
    failedCount: stats.invalid,
    withPrice,
    duplicates: stats.byRule.duplicate,
    unitParse: stats.unitParse,
  });
}

export interface SafeguardVerdict {
  fail: boolean;
  reason?: string;
  warnings: string[];
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

/**
 * Judge a finished batch (a page, a category or a whole run). `fail` means its writes are suspect:
 * the run ends with errors and no deactivation of unseen rows happens.
 */
export function evaluateBatch(
  args: { fetched: number; quality: QualityStats; previousCount: number | null },
  thresholds: SafeguardThresholds = DEFAULT_SAFEGUARDS,
): SafeguardVerdict {
  const { quality, previousCount, fetched } = args;
  const warnings: string[] = [];

  // Mostly invalid or unparseable.
  if (quality.invalidRate > thresholds.maxInvalidRate && quality.total > 0) {
    return {
      fail: true,
      reason: `Invalid record rate ${pct(quality.invalidRate)} exceeds ${pct(thresholds.maxInvalidRate)}.`,
      warnings,
    };
  }

  // Something that had records now returns none.
  if (previousCount != null && previousCount > 0 && fetched === 0) {
    return {
      fail: true,
      reason: `Previously had ${previousCount} records but returned 0 this run.`,
      warnings,
    };
  }

  if (quality.duplicateRate > thresholds.maxDuplicateRate) {
    return {
      fail: true,
      reason: `Duplicate rate ${pct(quality.duplicateRate)} exceeds ${pct(thresholds.maxDuplicateRate)}.`,
      warnings,
    };
  }

  // Dramatic drop: warn, don't fail.
  if (
    previousCount != null &&
    previousCount > 0 &&
    fetched > 0 &&
    fetched < previousCount * thresholds.dramaticDropRatio
  ) {
    warnings.push(
      `Record count dropped from ${previousCount} to ${fetched} (>${pct(1 - thresholds.dramaticDropRatio)}).`,
    );
  }

  if (quality.duplicateRate > thresholds.warnDuplicateRate) {
    warnings.push(
      `Duplicate rate ${pct(quality.duplicateRate)} is above ${pct(thresholds.warnDuplicateRate)}.`,
    );
  }

  if (quality.unitParseRate != null && quality.unitParseRate < thresholds.minUnitParseRate) {
    warnings.push(
      `Only ${pct(quality.unitParseRate)} of sizes parsed (target ${pct(thresholds.minUnitParseRate)}).`,
    );
  }

  return { fail: false, warnings };
}
