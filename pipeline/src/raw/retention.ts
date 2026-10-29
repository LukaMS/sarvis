// How long raw files are kept, per source (DATA_MODEL §5, D-010). Pure: the store uses it to set
// `raw_objects.expires_at`, and the Phase 6 cleanup job applies the count limits.
//
// A file is deleted as soon as any limit is passed:
// - `maxAge`: older than this (relative to `fetched_at`). This is the row's `expires_at`.
// - `keepRuns`: not among the source's newest N runs.
// - `keepPerSubject`: not among the newest N files for the same subject (a Wikipedia page, an
//   EDGAR company). The cleanup job derives the subject from the request URL.
// A null limit doesn't apply.

export type MaxAge = { days: number } | { months: number };

export interface RetentionPolicy {
  maxAge: MaxAge | null;
  keepRuns: number | null;
  keepPerSubject: number | null;
  /** The DATA_MODEL §5 row this comes from, for logs and the admin portal. */
  rule: string;
}

/** The general rule: the last 3 runs and 30 days at most. */
export const DEFAULT_RETENTION: RetentionPolicy = {
  maxAge: { days: 30 },
  keepRuns: 3,
  keepPerSubject: null,
  rule: 'general: last 3 runs, 30 days at most',
};

const lastRuns = (n: number, rule: string): RetentionPolicy => ({
  maxAge: null,
  keepRuns: n,
  keepPerSubject: null,
  rule,
});

const days = (n: number, rule: string): RetentionPolicy => ({
  maxAge: { days: n },
  keepRuns: null,
  keepPerSubject: null,
  rule,
});

const perSubject = (n: number, rule: string): RetentionPolicy => ({
  maxAge: null,
  keepRuns: null,
  keepPerSubject: n,
  rule,
});

const BY_SOURCE: Readonly<Record<string, RetentionPolicy>> = {
  off: lastRuns(3, 'S1 OFF exports: last 3 full extracts'),
  'off-api': days(30, 'S2 OFF API: 30 days'),
  'open-prices': lastRuns(3, 'S5 Open Prices: last 3 runs'),
  'statcan-18100245': lastRuns(3, 'S6 StatCan: last 3 runs'),
  wikidata: lastRuns(3, 'S17 Wikidata: last 3 runs'),
  wikipedia: perSubject(3, 'S19 Wikipedia: last 3 versions per page'),
  'sec-edgar': perSubject(3, 'S20 SEC EDGAR: last 3 filings per company'),
  gdelt: days(30, 'S23 GDELT: 30 days'),
  'rss-publishers': days(30, 'S24 RSS: 30 days'),
  'google-news-rss': days(30, 'S24/S25 RSS: 30 days'),
  openrouter: {
    maxAge: { months: 13 },
    keepRuns: null,
    keepPerSubject: null,
    rule: 'OpenRouter scoring and tagging: 13 months (review evidence)',
  },
  // Receipt-parse responses live as long as the receipt and are deleted with it.
  receipts: {
    maxAge: null,
    keepRuns: null,
    keepPerSubject: null,
    rule: 'receipts: deleted with the receipt',
  },
  fixture: days(1, 'fixture: 1 day (tests only)'),
};

/** The OFF daily delta files: 30 days, alongside the last 3 full extracts. */
const OFF_DELTA = days(30, 'S1 OFF exports: 30 days of filtered deltas');

export function retentionFor(
  sourceKey: string,
  options: { delta?: boolean } = {},
): RetentionPolicy {
  if (sourceKey === 'off' && options.delta) return OFF_DELTA;
  return BY_SOURCE[sourceKey] ?? DEFAULT_RETENTION;
}

/** `fetched_at` plus the policy's max age, or null when only count limits apply. */
export function expiresAt(fetchedAt: Date, policy: RetentionPolicy): Date | null {
  const { maxAge } = policy;
  if (!maxAge) return null;
  const out = new Date(fetchedAt.getTime());
  if ('days' in maxAge) out.setUTCDate(out.getUTCDate() + maxAge.days);
  else out.setUTCMonth(out.getUTCMonth() + maxAge.months);
  return out;
}
