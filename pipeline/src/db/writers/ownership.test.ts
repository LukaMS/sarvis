// The pure parts of company enrichment: which company a record names, and what it may write.
import { describe, expect, it } from 'vitest';

import type { ServiceClient } from '../client.ts';
import { assignEntitySlugs, matchCompany, planEnrichment } from './ownership.ts';

describe('planEnrichment', () => {
  const stored = {
    id: 'c1',
    website: 'https://mars.com/',
    wikipedia_title: null,
    legal_name: 'Mars, Incorporated',
    locked_fields: ['legal_name'],
  };

  it('patches changed unlocked columns and holds equal ones', () => {
    const plan = planEnrichment(stored, {
      website: 'https://mars.com/',
      wikipedia_title: 'Mars Inc.',
      wikipedia_revision_id: 125,
    });
    expect(plan).toEqual({
      patch: { wikipedia_title: 'Mars Inc.', wikipedia_revision_id: 125 },
      held: ['website', 'wikipedia_revision_id', 'wikipedia_title'],
      locked: [],
    });
  });

  it('skips a locked column whose value differs, but holds it when equal', () => {
    expect(planEnrichment(stored, { legal_name: 'Mars Inc' })).toEqual({
      patch: {},
      held: [],
      locked: ['legal_name'],
    });
    expect(planEnrichment(stored, { legal_name: 'Mars, Incorporated' }).held).toEqual([
      'legal_name',
    ]);
  });

  it('is empty on a second pass with the same values', () => {
    const after = { ...stored, wikipedia_title: 'Mars Inc.' };
    const plan = planEnrichment(after, { wikipedia_title: 'Mars Inc.' });
    expect(plan.patch).toEqual({});
    expect(plan.held).toEqual(['wikipedia_title']);
  });
});

describe('matchCompany', () => {
  const a = { id: 'a', slug: 'mars', wikidata_qid: 'Q1' };
  const b = { id: 'b', slug: 'hershey', sec_cik: '0000047111' };
  const byKey = new Map<string, Record<string, unknown>>([
    ['wikidata_qid:Q1', a],
    ['slug:mars', a],
    ['slug:hershey', b],
    ['sec_cik:0000047111', b],
  ]);

  it('finds the company by any key, and by agreeing keys', () => {
    expect(matchCompany({ sec_cik: '0000047111' }, byKey)).toBe(b);
    expect(matchCompany({ wikidata_qid: 'Q1', slug: 'mars' }, byKey)).toBe(a);
    // A key the company doesn't hold yet (Mars has no CIK) doesn't block the match.
    expect(matchCompany({ slug: 'mars', sec_cik: '0000012345' }, byKey)).toBe(a);
  });

  it('refuses an unknown company and keys that disagree', () => {
    expect(matchCompany({ slug: 'nobody' }, byKey)).toEqual({
      problem: expect.stringContaining('Unknown company'),
    });
    expect(matchCompany({ wikidata_qid: 'Q1', sec_cik: '0000047111' }, byKey)).toEqual({
      problem: expect.stringContaining('different companies'),
    });
    // Mars is Q1, so a record naming Mars with Q9 is about some other company.
    expect(matchCompany({ wikidata_qid: 'Q9', slug: 'mars' }, byKey)).toEqual({
      problem: expect.stringContaining('different companies'),
    });
  });
});

describe('assignEntitySlugs', () => {
  /** A stand-in for the two `.in()` reads: rows by QID, then rows by candidate slug. */
  function fakeDb(rows: { slug: string; wikidata_qid: string | null }[]): ServiceClient {
    const query = (column: 'slug' | 'wikidata_qid', values: readonly unknown[]) => {
      const data = rows.filter((r) => values.includes(r[column]));
      const q = {
        in: (c: 'slug' | 'wikidata_qid', v: readonly unknown[]) => query(c, v),
        order: () => q,
        range: () => Promise.resolve({ data, error: null }),
      };
      return q;
    };
    return {
      from: () => ({ select: () => ({ in: query }) }),
    } as unknown as ServiceClient;
  }
  const rec = (slug: string, wikidata_qid: string | null, country?: string) => ({
    slug,
    wikidata_qid,
    country,
  });

  it('keeps a stored QID slug, and never takes a slug another row holds', async () => {
    const db = fakeDb([
      { slug: 'nestle', wikidata_qid: null }, // a legacy row: not merged into
      { slug: 'loblaw', wikidata_qid: 'Q909856' },
      { slug: 'dove', wikidata_qid: 'Q1' },
    ]);
    const out = await assignEntitySlugs(db, 'companies', [
      rec('nestle', 'Q160746', 'CH'),
      rec('loblaw-companies', 'Q909856', 'CA'),
      rec('dove', 'Q2'),
      rec('dove', 'Q3'),
      rec('legacy', null),
    ]);
    expect(out.map((r) => r.slug)).toEqual(['nestle-ch', 'loblaw', 'dove-2', 'dove-3', 'legacy']);
  });

  it('returns records unchanged when none has a QID', async () => {
    const records = [rec('a', null)];
    expect(await assignEntitySlugs(fakeDb([]), 'brands', records)).toBe(records);
  });
});
