import { describe, expect, it } from 'vitest';

import { DEFAULT_RETENTION, expiresAt, retentionFor } from './retention.ts';

describe('retentionFor', () => {
  it('follows the DATA_MODEL §5 table', () => {
    expect(retentionFor('off')).toMatchObject({ maxAge: null, keepRuns: 3 });
    expect(retentionFor('off', { delta: true })).toMatchObject({
      maxAge: { days: 30 },
      keepRuns: null,
    });
    expect(retentionFor('off-api')).toMatchObject({ maxAge: { days: 30 }, keepRuns: null });
    for (const key of ['open-prices', 'statcan-18100245', 'wikidata']) {
      expect(retentionFor(key)).toMatchObject({ maxAge: null, keepRuns: 3, keepPerSubject: null });
    }
    expect(retentionFor('wikipedia')).toMatchObject({ maxAge: null, keepPerSubject: 3 });
    expect(retentionFor('sec-edgar')).toMatchObject({ maxAge: null, keepPerSubject: 3 });
    for (const key of ['gdelt', 'rss-publishers', 'google-news-rss']) {
      expect(retentionFor(key)).toMatchObject({ maxAge: { days: 30 }, keepRuns: null });
    }
    expect(retentionFor('openrouter')).toMatchObject({ maxAge: { months: 13 } });
    expect(retentionFor('receipts')).toMatchObject({
      maxAge: null,
      keepRuns: null,
      keepPerSubject: null,
    });
  });

  it('uses the general rule (last 3 runs, 30 days) for anything not in the table', () => {
    expect(retentionFor('loblaw-pc-express')).toBe(DEFAULT_RETENTION);
    expect(retentionFor('manual')).toBe(DEFAULT_RETENTION);
    expect(DEFAULT_RETENTION).toMatchObject({ maxAge: { days: 30 }, keepRuns: 3 });
  });

  it('ignores the delta flag for sources other than OFF', () => {
    expect(retentionFor('off-api', { delta: true })).toBe(retentionFor('off-api'));
  });

  it('gives every policy a rule description', () => {
    for (const key of ['off', 'off-api', 'wikipedia', 'openrouter', 'fixture', 'unknown-source']) {
      expect(retentionFor(key).rule.length).toBeGreaterThan(0);
    }
  });
});

describe('expiresAt', () => {
  const fetched = new Date('2026-10-29T12:00:00.000Z');

  it('adds days', () => {
    expect(expiresAt(fetched, retentionFor('off-api'))?.toISOString()).toBe(
      '2026-11-28T12:00:00.000Z',
    );
  });

  it('adds calendar months', () => {
    expect(expiresAt(fetched, retentionFor('openrouter'))?.toISOString()).toBe(
      '2027-11-29T12:00:00.000Z',
    );
  });

  it('is null when only count limits apply', () => {
    expect(expiresAt(fetched, retentionFor('statcan-18100245'))).toBeNull();
    expect(expiresAt(fetched, retentionFor('wikipedia'))).toBeNull();
  });

  it('does not change the input date', () => {
    expiresAt(fetched, retentionFor('fixture'));
    expect(fetched.toISOString()).toBe('2026-10-29T12:00:00.000Z');
  });
});
