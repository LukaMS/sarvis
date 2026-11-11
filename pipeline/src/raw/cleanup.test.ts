import { describe, expect, it } from 'vitest';

import { type RawFile, describePlan, planRawCleanup, subjectOf } from './cleanup.ts';

const NOW = new Date('2026-12-01T00:00:00Z');

let seq = 0;
function file(over: Partial<RawFile> & Pick<RawFile, 'sourceKey'>): RawFile {
  seq += 1;
  const fetchedAt = over.fetchedAt ?? over.runStartedAt ?? '2026-11-20T00:00:00Z';
  return {
    id: `f${String(seq).padStart(4, '0')}`,
    storagePath: `raw/${over.sourceKey}/${over.runId ?? 'adhoc'}/${String(seq).padStart(6, '0')}.json.gz`,
    byteSize: 100,
    fetchedAt,
    requestUrl: null,
    runId: null,
    runMode: 'full',
    runStatus: 'completed',
    runStartedAt: null,
    ...over,
  };
}

/** `n` files of one run. */
function run(
  sourceKey: string,
  runId: string,
  startedAt: string,
  n = 2,
  over: Partial<RawFile> = {},
): RawFile[] {
  return Array.from({ length: n }, () =>
    file({ sourceKey, runId, runStartedAt: startedAt, fetchedAt: startedAt, ...over }),
  );
}

const ids = (plan: ReturnType<typeof planRawCleanup>) => new Set(plan.delete.map((d) => d.file.id));
const runsDeleted = (plan: ReturnType<typeof planRawCleanup>) =>
  [...new Set(plan.delete.map((d) => d.file.runId))].sort();

describe('planRawCleanup: last N runs', () => {
  it('keeps the newest 3 runs of Wikidata, whatever their mode, and deletes the rest', () => {
    const files = [
      ...run('wikidata', 'w1', '2026-11-01T00:00:00Z', 2, { runMode: 'sample' }),
      ...run('wikidata', 'w2', '2026-11-02T00:00:00Z', 2, { runStatus: 'failed' }),
      ...run('wikidata', 'w3', '2026-11-03T00:00:00Z'),
      ...run('wikidata', 'w4', '2026-11-04T00:00:00Z', 2, { runMode: 'sample' }),
      ...run('wikidata', 'w5', '2026-11-05T00:00:00Z'),
    ];
    const plan = planRawCleanup(files, NOW);
    expect(runsDeleted(plan)).toEqual(['w1', 'w2']);
    expect(plan.delete[0]?.reason).toMatch(/not among the last 3 runs/);
    expect(plan.bySource.wikidata).toEqual({
      files: 10,
      bytes: 1000,
      deleteFiles: 4,
      deleteBytes: 400,
    });
  });

  it('has no age cap for the count-only sources', () => {
    const files = run('statcan-18100245', 's1', '2025-01-01T00:00:00Z');
    expect(planRawCleanup(files, NOW).delete).toEqual([]);
  });

  it('applies the general rule (3 runs and 30 days) to a source it has no row for', () => {
    const files = [
      ...run('legacy-import', 'l1', '2026-11-25T00:00:00Z'),
      ...run('legacy-import', 'l2', '2026-11-26T00:00:00Z'),
      ...run('legacy-import', 'l3', '2026-11-27T00:00:00Z'),
      ...run('legacy-import', 'l4', '2026-11-28T00:00:00Z'),
      ...run('legacy-import', 'old', '2026-10-01T00:00:00Z'),
    ];
    const plan = planRawCleanup(files, NOW);
    expect(runsDeleted(plan)).toEqual(['l1', 'old']);
    // The age limit is checked first, so the old run reads as expired.
    expect(plan.delete.find((d) => d.file.runId === 'old')?.reason).toMatch(/older than 30 days/);
  });
});

describe('planRawCleanup: OFF', () => {
  const fulls = [
    ...run('off', 'o1', '2026-11-01T00:00:00Z'),
    ...run('off', 'o2', '2026-11-02T00:00:00Z'),
    ...run('off', 'o3', '2026-11-03T00:00:00Z'),
    ...run('off', 'o4', '2026-11-04T00:00:00Z'),
  ];

  it('keeps the last 3 full extracts, and deltas for 30 days, counted apart', () => {
    const files = [
      ...fulls,
      ...run('off', 'd-old', '2026-10-31T00:00:00Z', 2, { runMode: 'delta' }),
      ...run('off', 'd1', '2026-11-05T00:00:00Z', 2, { runMode: 'delta' }),
      ...run('off', 'd2', '2026-11-06T00:00:00Z', 2, { runMode: 'delta' }),
      ...run('off', 'd3', '2026-11-07T00:00:00Z', 2, { runMode: 'delta' }),
      ...run('off', 'd4', '2026-11-08T00:00:00Z', 2, { runMode: 'delta' }),
    ];
    const plan = planRawCleanup(files, NOW);
    expect(runsDeleted(plan)).toEqual(['d-old', 'o1']);
    expect(plan.delete.find((d) => d.file.runId === 'd-old')?.reason).toMatch(
      /30 days of filtered deltas/,
    );
  });

  it('never deletes the newest completed full extract, even behind newer failed runs', () => {
    const files = [
      ...run('off', 'good', '2026-11-01T00:00:00Z'),
      ...run('off', 'f1', '2026-11-02T00:00:00Z', 2, { runStatus: 'failed' }),
      ...run('off', 'f2', '2026-11-03T00:00:00Z', 2, { runStatus: 'completed_with_errors' }),
      ...run('off', 'f3', '2026-11-04T00:00:00Z', 2, { runMode: 'sample' }),
    ];
    const plan = planRawCleanup(files, NOW);
    expect(plan.delete).toEqual([]);
    expect(plan.protectedRuns).toEqual([
      { sourceKey: 'off', runId: 'good', why: 'newest completed full run' },
    ]);
  });

  it('never deletes the files of a run that is still running', () => {
    const files = [
      ...fulls,
      ...run('off', 'live', '2026-10-01T00:00:00Z', 2, { runMode: 'delta', runStatus: 'running' }),
    ];
    const plan = planRawCleanup(files, NOW);
    expect(runsDeleted(plan)).toEqual(['o1']);
    expect(plan.protectedRuns.map((r) => r.runId).sort()).toEqual(['live', 'o4']);
  });
});

describe('planRawCleanup: age limits', () => {
  it('deletes a file on the day it expires, and keeps one a day younger', () => {
    const files = [
      file({ sourceKey: 'gdelt', fetchedAt: '2026-11-01T00:00:00Z' }),
      file({ sourceKey: 'gdelt', fetchedAt: '2026-11-02T00:00:00Z' }),
    ];
    const plan = planRawCleanup(files, NOW);
    expect(plan.delete.map((d) => d.file.fetchedAt)).toEqual(['2026-11-01T00:00:00Z']);
  });

  it('keeps OpenRouter responses for 13 months and receipts until the receipt goes', () => {
    const files = [
      file({ sourceKey: 'openrouter', fetchedAt: '2025-11-02T00:00:00Z' }),
      file({ sourceKey: 'openrouter', fetchedAt: '2025-10-31T00:00:00Z' }),
      file({ sourceKey: 'receipts', fetchedAt: '2020-01-01T00:00:00Z' }),
    ];
    const plan = planRawCleanup(files, NOW);
    expect(plan.delete.map((d) => d.file.fetchedAt)).toEqual(['2025-10-31T00:00:00Z']);
  });

  it('applies age limits to adhoc files, and no run limit', () => {
    const files = [
      file({ sourceKey: 'legacy-import', fetchedAt: '2026-10-01T00:00:00Z', runMode: null }),
      file({ sourceKey: 'legacy-import', fetchedAt: '2026-11-30T00:00:00Z', runMode: null }),
    ];
    const plan = planRawCleanup(files, NOW);
    expect(plan.delete.map((d) => d.file.fetchedAt)).toEqual(['2026-10-01T00:00:00Z']);
  });
});

describe('planRawCleanup: EDGAR, the last 3 filings per company', () => {
  const doc = (cik: string, accession: string, name = 'ex21.htm') =>
    `https://www.sec.gov/Archives/edgar/data/${cik}/${accession}/${name}`;

  it('keeps the 3 newest filings per company and one copy of each document', () => {
    const files = [
      file({
        sourceKey: 'sec-edgar',
        runId: 'r1',
        runStartedAt: '2026-11-01T00:00:00Z',
        fetchedAt: '2023-03-01T00:00:00Z',
        requestUrl: doc('100', '000010002300000001'),
      }),
      file({
        sourceKey: 'sec-edgar',
        runId: 'r1',
        runStartedAt: '2026-11-01T00:00:00Z',
        fetchedAt: '2024-03-01T00:00:00Z',
        requestUrl: doc('100', '000010002400000001'),
      }),
      file({
        sourceKey: 'sec-edgar',
        runId: 'r1',
        runStartedAt: '2026-11-01T00:00:00Z',
        fetchedAt: '2025-03-01T00:00:00Z',
        requestUrl: doc('100', '000010002500000001'),
      }),
      file({
        sourceKey: 'sec-edgar',
        runId: 'r1',
        runStartedAt: '2026-11-01T00:00:00Z',
        fetchedAt: '2026-03-01T00:00:00Z',
        requestUrl: doc('100', '000010002600000001'),
      }),
      // The same 2026 document again in a later run, and another company's single filing.
      file({
        sourceKey: 'sec-edgar',
        runId: 'r2',
        runStartedAt: '2026-11-02T00:00:00Z',
        fetchedAt: '2026-03-02T00:00:00Z',
        requestUrl: doc('100', '000010002600000001'),
      }),
      file({
        sourceKey: 'sec-edgar',
        runId: 'r2',
        runStartedAt: '2026-11-02T00:00:00Z',
        fetchedAt: '2020-01-01T00:00:00Z',
        requestUrl: doc('200', '000020002000000001'),
      }),
      // No subject in the URL: kept.
      file({
        sourceKey: 'sec-edgar',
        runId: 'r2',
        runStartedAt: '2026-11-02T00:00:00Z',
        fetchedAt: '2019-01-01T00:00:00Z',
        requestUrl: 'https://data.sec.gov/x',
      }),
    ];
    const plan = planRawCleanup(files, NOW);
    expect(plan.delete.map((d) => [d.file.requestUrl, d.file.runId, d.reason])).toEqual([
      [doc('100', '000010002300000001'), 'r1', expect.stringMatching(/last 3 per subject/)],
      [doc('100', '000010002600000001'), 'r1', expect.stringMatching(/older copy/)],
    ]);
  });

  it('derives the company from the CIK, with or without leading zeros', () => {
    expect(subjectOf('sec-edgar', doc('0000100', '000010002600000001'))).toEqual({
      subject: 'cik:100',
      unit: '000010002600000001',
    });
    expect(subjectOf('sec-edgar', null)).toBeNull();
    expect(subjectOf('wikidata', 'https://query.wikidata.org/sparql')).toBeNull();
  });
});

describe('describePlan', () => {
  it('lists one line per run and reason', () => {
    const files = [
      ...run('wikidata', 'aaaaaaaa-1', '2026-11-01T00:00:00Z', 3),
      ...run('wikidata', 'bbbbbbbb-2', '2026-11-02T00:00:00Z'),
      ...run('wikidata', 'cccccccc-3', '2026-11-03T00:00:00Z'),
      ...run('wikidata', 'dddddddd-4', '2026-11-04T00:00:00Z'),
    ];
    const lines = describePlan(planRawCleanup(files, NOW));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/wikidata\s+aaaaaaaa full 2026-11-01\s+3 files\s+0\.3 KB\s+not among/);
    expect(ids(planRawCleanup(files, NOW)).size).toBe(3);
  });
});
