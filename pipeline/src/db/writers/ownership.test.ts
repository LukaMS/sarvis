// The pure parts of company enrichment: which company a record names, and what it may write.
import { describe, expect, it } from 'vitest';

import { matchCompany, planEnrichment } from './ownership.ts';

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
