// The pure parts of company enrichment: which company a record names, and what it may write.
import { describe, expect, it } from 'vitest';

import type { ServiceClient } from '../client.ts';
import {
  assignEntitySlugs,
  edgeSourceSpec,
  evidenceOf,
  matchCompany,
  planEnrichment,
  reviewed,
  withoutTakenCiks,
} from './ownership.ts';

describe('edge evidence (P4.10)', () => {
  const payload = {
    brand_id: 'b1',
    company_id: 'c1',
    relation: 'owner',
    source_id: 'sec',
    source_url: 'https://www.sec.gov/x.htm',
    fetched_at: '2026-11-11T12:00:00Z',
    method: 'api',
    method_version: 'sec-edgar@1.0.0',
    confidence: null,
    ingestion_run_id: 'run-1',
    raw_object_id: null,
  };

  it("names the edge in its table's column and copies the confirming source's provenance", () => {
    expect(evidenceOf('brand_ownership', 'e1', payload)).toEqual({
      brand_ownership_id: 'e1',
      source_id: 'sec',
      source_url: 'https://www.sec.gov/x.htm',
      fetched_at: '2026-11-11T12:00:00Z',
      last_seen_at: '2026-11-11T12:00:00Z',
      method: 'api',
      method_version: 'sec-edgar@1.0.0',
      confidence: null,
      ai_call_id: null,
      ingestion_run_id: 'run-1',
      raw_object_id: null,
    });
    expect(evidenceOf('company_ownership', 'e2', payload)).toMatchObject({
      company_ownership_id: 'e2',
    });
  });

  it('keys one row per edge and source, per edge table', () => {
    const brand = edgeSourceSpec('brand_ownership');
    const row = evidenceOf('brand_ownership', 'e1', payload);
    expect(brand.keys(row)).toEqual(['e1:sec']);
    // A company-edge evidence row never matches under the brand spec.
    expect(brand.keys(evidenceOf('company_ownership', 'e1', payload))).toEqual([null]);
    expect(brand.keep).toEqual(['brand_ownership_id', 'source_id']);
  });
});

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

describe('withoutTakenCiks (P3.13)', () => {
  const rec = (wikidata_qid: string | null, sec_cik: string | null) => ({ wikidata_qid, sec_cik });

  it('keeps a CIK for its holder and drops it from another QID, in the batch or stored', () => {
    const out = withoutTakenCiks(
      [
        rec('Q1', '0000000001'), // stored under Q1: kept
        rec('Q2', '0000000001'), // held by Q1: dropped
        rec('Q3', '0000000003'), // new: kept
        rec('Q4', '0000000003'), // the batch's Q3 holds it: dropped
        rec('Q5', '0000000005'), // stored under a row without a QID: dropped
        rec(null, '0000000005'), // no QID: left to the database
        rec('Q6', null),
      ],
      new Map([
        ['0000000001', 'Q1'],
        ['0000000005', null],
      ]),
    );
    expect(out.map((r) => r.sec_cik)).toEqual([
      '0000000001',
      null,
      '0000000003',
      null,
      null,
      '0000000005',
      null,
    ]);
  });
});

describe('edge freeze (P3.13)', () => {
  it("freezes a person's decision, not the rule's approval", () => {
    expect(reviewed({ review_status: 'pending', decision_method: null })).toBe(false);
    expect(reviewed({ review_status: 'approved', decision_method: 'auto' })).toBe(false);
    expect(reviewed({ review_status: 'approved', decision_method: 'admin' })).toBe(true);
    expect(reviewed({ review_status: 'rejected', decision_method: 'admin' })).toBe(true);
  });
});
