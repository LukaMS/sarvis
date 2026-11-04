// SEC EDGAR Exhibit 21 on fixtures saved from real responses (sec.gov, 2026-11-04; public filings):
// trimmed submissions JSON for Kraft Heinz (10-K) and Anheuser-Busch InBev (20-F), Conagra's
// 10-K filing index, and three Exhibit 21 layouts: Conagra (Toppan Merrill table), Beyond Meat
// (Workiva lines with non-breaking-space gaps) and Affiliated Managers Group (", a Delaware …").
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { type RecordKind, validateBatch } from '@sarvis/core';
import { describe, expect, it } from 'vitest';

import type { HttpClient, HttpRequest, HttpResponse } from '../../http/client.ts';
import { createLogger } from '../../log.ts';
import { type RecordWriter, runSource } from '../../runs/driver.ts';
import { createMemoryRunStore } from '../../runs/store.ts';
import type { SourceRow } from '../source.ts';
import { type SecCatalog, createSecEdgarSource } from './index.ts';
import {
  type Envelope,
  NameIndex,
  type SecCompany,
  exhibit21Of,
  filingIndexUrl,
  isEnvelope,
  jurisdictionCountry,
  latestFiling,
  matchCounts,
  matchSubsidiaries,
  nameKey,
  parseEnvelope,
  parseExhibit21,
  recordsOf,
  submissionsUrl,
} from './map.ts';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
const SUB_10K = fixture('submissions-10k.json');
const SUB_20F = fixture('submissions-20f.json');
const INDEX = fixture('index-conagra.htm');
const TABLE = fixture('ex21-table-conagra.htm');
const LINES = fixture('ex21-lines-beyondmeat.htm');
const ARTICLE = fixture('ex21-article-amg.htm');
const NOW = new Date('2026-11-04T00:00:00Z');
const FETCHED_AT = '2026-11-04T12:00:00.000Z';
const silent = createLogger({ level: 'error', write: () => {} });

const CONAGRA: SecCompany = {
  id: 'c-conagra',
  slug: 'conagra-brands-inc',
  qid: 'Q1',
  cik: '0000023217',
  name: 'Conagra Brands, Inc.',
  names: ['Conagra Brands, Inc.', 'Conagra Brands'],
};

describe('sec-edgar: filings', () => {
  it('builds the submissions and filing index URLs', () => {
    expect(submissionsUrl('23217')).toBe('https://data.sec.gov/submissions/CIK0000023217.json');
    expect(filingIndexUrl('0000023217', '0001104659-26-083905')).toBe(
      'https://www.sec.gov/Archives/edgar/data/23217/000110465926083905/0001104659-26-083905-index.htm',
    );
  });

  it('picks the latest 10-K, and counts 20-F filers and stale filings', () => {
    expect(latestFiling(SUB_10K, NOW)).toEqual({
      status: 'ok',
      filing: {
        form: '10-K',
        accession: '0001637459-26-000009',
        filedOn: '2026-02-12',
        reportDate: '2025-12-27',
        primaryDocument: 'khc-20251227.htm',
        filerName: 'Kraft Heinz Co',
      },
    });
    expect(latestFiling(SUB_20F, NOW)).toEqual({ status: 'foreign', form: '20-F' });
    expect(latestFiling(SUB_10K, new Date('2030-01-01T00:00:00Z'))).toEqual({
      status: 'stale',
      filedOn: '2026-02-12',
    });
    expect(() => latestFiling('<html>', NOW)).toThrow(/not JSON/);
  });

  it('finds the Exhibit 21 document in the filing index', () => {
    expect(exhibit21Of(INDEX)).toEqual([
      {
        url: 'https://www.sec.gov/Archives/edgar/data/23217/000110465926083905/tmb-20260531xex21.htm',
        type: 'EX-21',
      },
    ]);
    expect(
      exhibit21Of('<table><tr><td>EX-23</td><td><a href="/a.htm">a</a></td></tr></table>'),
    ).toEqual([]);
  });
});

describe('sec-edgar: Exhibit 21 parsing', () => {
  it('reads a table: name and jurisdiction, without the heading row', () => {
    const subs = parseExhibit21(TABLE);
    expect(subs).toHaveLength(11);
    expect(subs[0]).toEqual({ name: 'Conagra G&S (CAG), LLC', jurisdiction: 'Delaware' });
    expect(subs[1]).toEqual({
      name: 'Conagra Brands Canada Inc. / Marques Conagra Canada Inc.',
      jurisdiction: 'Canada',
    });
    expect(subs.map((s) => s.name)).not.toContain('Subsidiary');
  });

  it('reads gap-separated lines, dropping the EDGAR wrapper and the page title', () => {
    const subs = parseExhibit21(LINES);
    expect(subs[0]).toEqual({ name: 'Beyond Meat EU B.V.', jurisdiction: 'Netherlands' });
    // Two entries run together on one line: only the first pair is kept (a known limit).
    expect(subs[1]?.name).toBe('Beyond Meat (Jiaxing) Food Co., Ltd.');
    expect(subs.map((s) => s.name).join('|')).not.toMatch(/Document|EX-21|Subsidiaries/);
  });

  it('reads "Name, a Delaware limited liability company" lines', () => {
    const subs = parseExhibit21(ARTICLE);
    expect(subs[1]).toEqual({
      name: 'Abacus Capital Group LLC',
      jurisdiction: 'Delaware limited liability company',
    });
    expect(subs.map((s) => s.name)).not.toContain('SCHEDULE OF SUBSIDIARIES');
    expect(subs).toHaveLength(6);
  });

  it('drops footnote marks and headings split over rows', () => {
    const html =
      '<table><tr><td>Jurisdiction of</td></tr><tr><td>Incorporation or</td><td>Held by</td></tr>' +
      '<tr><td>Best Buy Stores, L.P. (1)</td><td>Virginia</td></tr>' +
      '<tr><td>Winton Group Limited*</td><td>100%</td><td>United Kingdom</td></tr></table>';
    expect(parseExhibit21(html)).toEqual([
      { name: 'Best Buy Stores, L.P.', jurisdiction: 'Virginia' },
      { name: 'Winton Group Limited', jurisdiction: 'United Kingdom' },
    ]);
  });

  it('reads a jurisdiction-first table (Hewlett Packard Enterprise)', () => {
    const html =
      '<table><tr><td>JAPAN</td><td>Hewlett Packard Japan, G.K.</td></tr>' +
      '<tr><td></td><td>HP Financial Services (Japan) K.K.</td></tr>' +
      '<tr><td>KOREA, REPUBLIC OF</td><td>Hewlett-Packard Korea Ltd.</td></tr></table>';
    expect(parseExhibit21(html)).toEqual([
      { name: 'Hewlett Packard Japan, G.K.', jurisdiction: 'JAPAN' },
      { name: 'HP Financial Services (Japan) K.K.', jurisdiction: null },
      { name: 'Hewlett-Packard Korea Ltd.', jurisdiction: 'KOREA, REPUBLIC OF' },
    ]);
  });

  it('drops capitalised section headings but keeps capitalised company names', () => {
    // Hewlett Packard Enterprise groups its list under country headings.
    const html =
      '<table><tr><td>JAPAN</td></tr><tr><td>Hewlett Packard Japan, G.K.</td></tr>' +
      '<tr><td>KOREA, REPUBLIC OF</td></tr><tr><td>ARAMARK LLC</td></tr></table>';
    expect(parseExhibit21(html).map((s) => s.name)).toEqual([
      'Hewlett Packard Japan, G.K.',
      'ARAMARK LLC',
    ]);
  });
});

describe('sec-edgar: matching', () => {
  it('keys names without legal forms, punctuation or a leading "the"', () => {
    expect(nameKey('The Coca-Cola Company')).toBe('coca cola');
    expect(nameKey('H. J. Heinz US Brands LLC')).toBe('h j heinz us brands');
    expect(nameKey('Nestlé Canada Inc.')).toBe('nestle canada');
    expect(nameKey('Church & Dwight Co., Inc.')).toBe('church and dwight');
    // Bracketed words stay: "L Brands (Overseas)" is not "L Brands".
    expect(nameKey('L Brands (Overseas), Inc.')).toBe('l brands overseas');
    // An apostrophe is a word break: "GT's" (a UK company) isn't "GTS, Inc." (P3.16 hand check).
    expect(nameKey("GT's")).toBe('gt');
    expect(nameKey('GTS, Inc.')).toBe('gts');
    expect(nameKey('Justin’s, LLC')).toBe(nameKey("Justin's"));
    // A name that is only a legal form keeps it.
    expect(nameKey('Company')).toBe('company');
  });

  const index = new NameIndex();
  index.add({ kind: 'company', id: 'c-conagra', slug: 'conagra-brands-inc' }, ['Conagra Brands']);
  index.add({ kind: 'company', id: 'c-canada', slug: 'conagra-brands-canada' }, [
    'Conagra Brands Canada',
  ]);
  index.add({ kind: 'brand', id: 'b-rdm', slug: 'conagra-foods-rdm' }, ['Conagra Foods RDM']);
  index.add({ kind: 'brand', id: 'b-mx1', slug: 'conagra-mexico-1' }, ['ConAgra Foods Mexico']);
  index.add({ kind: 'brand', id: 'b-mx2', slug: 'conagra-mexico-2' }, ['Conagra Foods Mexico']);
  index.add({ kind: 'company', id: 'c-dup', slug: 'conagra-dup' }, ['Conagra Consolidated']);
  const subs = parseExhibit21(TABLE);

  it('matches companies, then brands, and holds back self, ambiguous and already linked ones', () => {
    const known = { company: new Set(['c-conagra>c-dup']), brand: new Set<string>() };
    const m = matchSubsidiaries(CONAGRA, subs, index, known);
    const by = (name: string) => m.find((s) => s.name.startsWith(name));
    // The bilingual pair matches through its English half.
    expect(by('Conagra Brands Canada')).toMatchObject({
      status: 'match',
      target: { kind: 'company', slug: 'conagra-brands-canada' },
    });
    expect(by('Conagra Foods RDM')).toMatchObject({
      status: 'match',
      target: { kind: 'brand', slug: 'conagra-foods-rdm' },
    });
    expect(by('ConAgra Foods Mexico')?.status).toBe('ambiguous');
    expect(by('Conagra Consolidated')?.status).toBe('known');
    expect(matchCounts(m)).toEqual({
      match: 2,
      known: 1,
      self: 0,
      ambiguous: 1,
      country: 0,
      none: 7,
    });
  });

  it('maps jurisdictions to countries', () => {
    expect(jurisdictionCountry('Delaware')).toBe('US');
    expect(jurisdictionCountry('New York')).toBe('US');
    expect(jurisdictionCountry('Australia')).toBe('AU');
    expect(jurisdictionCountry('United Kingdom')).toBe('GB');
    expect(jurisdictionCountry('England and Wales')).toBe('GB');
    expect(jurisdictionCountry('Zhejiang Province, China')).toBe('CN');
    expect(jurisdictionCountry('Ontario')).toBe('CA');
    expect(jurisdictionCountry('Delaware limited liability company')).toBeNull();
    expect(jurisdictionCountry(null)).toBeNull();
  });

  it('holds back a company match from another country (Kashi Company Pty Ltd is not the US Kashi)', () => {
    const idx = new NameIndex();
    idx.add({ kind: 'company', id: 'c-kashi', slug: 'kashi', country: 'US' }, ['Kashi']);
    const none = { company: new Set<string>(), brand: new Set<string>() };
    const [au, us, unknown] = matchSubsidiaries(
      CONAGRA,
      [
        { name: 'Kashi Company Pty Ltd', jurisdiction: 'Australia' },
        { name: 'Kashi Company', jurisdiction: 'California' },
        { name: 'Kashi Sales, L.L.C.', jurisdiction: null },
      ],
      idx,
      none,
    );
    expect(au?.status).toBe('country');
    expect(us?.status).toBe('match');
    expect(unknown?.status).toBe('none');
  });

  it("counts the parent's own name as self, even on a duplicate company row", () => {
    const m = matchSubsidiaries(
      CONAGRA,
      [{ name: 'Conagra Brands, LLC', jurisdiction: 'Delaware' }],
      index,
      { company: new Set(), brand: new Set() },
    );
    expect(m[0]?.status).toBe('self');
  });
});

describe('sec-edgar: records', () => {
  const env: Envelope = {
    format: 'sarvis-sec-edgar/1',
    company: { slug: CONAGRA.slug, qid: CONAGRA.qid, cik: CONAGRA.cik },
    filing: {
      form: '10-K',
      accession: '0001104659-26-083905',
      filedOn: '2026-07-15',
      reportDate: '2026-05-31',
      primaryDocument: 'tmb-20260531x10k.htm',
      filerName: 'CONAGRA BRANDS INC.',
    },
    exhibit: {
      url: 'https://www.sec.gov/Archives/edgar/data/23217/000110465926083905/tmb-20260531xex21.htm',
      type: 'EX-21',
    },
    subsidiaries: [
      {
        name: 'Conagra Brands Canada Inc.',
        jurisdiction: 'Canada',
        status: 'match',
        target: { kind: 'company', slug: 'conagra-brands-canada' },
      },
      {
        name: 'Conagra Brands Canada ULC',
        jurisdiction: 'Canada',
        status: 'match',
        target: { kind: 'company', slug: 'conagra-brands-canada' },
      },
      {
        name: 'Conagra Foods RDM, LLC',
        jurisdiction: 'Delaware',
        status: 'match',
        target: { kind: 'brand', slug: 'conagra-foods-rdm' },
      },
      { name: 'Conagra Consolidated, LLC', jurisdiction: 'Delaware', status: 'known' },
      { name: 'ConAgra Funding, LLC', jurisdiction: 'Delaware', status: 'none' },
    ],
    html: TABLE,
  };

  it('gives the filing document, the CIK provenance and one pending edge per matched entity', () => {
    const r = recordsOf(env, FETCHED_AT);
    const indexUrl =
      'https://www.sec.gov/Archives/edgar/data/23217/000110465926083905/0001104659-26-083905-index.htm';
    expect(r.documents).toEqual([
      expect.objectContaining({
        url: indexUrl,
        url_normalized: indexUrl,
        kind: 'sec_filing',
        title: 'CONAGRA BRANDS INC. 10-K for 2026-05-31',
        sec_accession: '0001104659-26-083905',
        sec_filed_on: '2026-07-15',
        source_url: indexUrl,
        method: 'api',
        method_version: 'sec-edgar@1.0.0',
      }),
    ]);
    expect(r.enrichments).toEqual([
      expect.objectContaining({
        match: { slug: 'conagra-brands-inc', sec_cik: '0000023217' },
        external_id: '0000023217',
        fields: { sec_cik: '0000023217' },
        source_url: 'https://data.sec.gov/submissions/CIK0000023217.json',
      }),
    ]);
    expect(r.companyEdges).toHaveLength(1);
    expect(r.companyEdges[0]).toMatchObject({
      parent_company_slug: 'conagra-brands-inc',
      child_company_slug: 'conagra-brands-canada',
      relation: 'subsidiary',
      source_url: env.exhibit.url,
    });
    expect(r.companyEdges[0]?.review_reason).toMatch(
      /^EX-21 of the 10-K filed 2026-07-15 \(0001104659-26-083905\) lists "Conagra Brands Canada Inc\." \(Canada\)/,
    );
    expect(r.brandEdges).toEqual([
      expect.objectContaining({
        brand_slug: 'conagra-foods-rdm',
        company_slug: 'conagra-brands-inc',
        relation: 'owner',
      }),
    ]);
    for (const [kind, records] of [
      ['document', r.documents],
      ['company_enrichment', r.enrichments],
      ['company_ownership', r.companyEdges],
      ['brand_ownership', r.brandEdges],
    ] as const) {
      expect(validateBatch(kind, records).failures).toEqual([]);
    }
  });

  it('tells its envelope from the control responses', () => {
    expect(isEnvelope(JSON.stringify(env))).toBe(true);
    expect(isEnvelope(SUB_10K)).toBe(false);
    expect(isEnvelope(INDEX)).toBe(false);
    expect(() => parseEnvelope('{"format":"other"}')).toThrow(/Not an SEC EDGAR envelope/);
  });
});

describe('sec-edgar: through the run driver', () => {
  const SOURCE_ROW: SourceRow = {
    id: 'src-sec',
    key: 'sec-edgar',
    verdict: 'use',
    enabled: true,
    rate_limit_per_sec: 1,
  };
  const KHC: SecCompany = {
    id: 'c-khc',
    slug: 'kraft-heinz',
    qid: 'Q2',
    cik: '0001637459',
    name: 'Kraft Heinz',
    names: ['Kraft Heinz'],
  };
  const ABI: SecCompany = {
    id: 'c-abi',
    slug: 'anheuser-busch-inbev',
    qid: 'Q3',
    cik: '0001668717',
    name: 'AB InBev',
    names: ['AB InBev'],
  };
  const catalog = (): SecCatalog => {
    const index = new NameIndex();
    index.add({ kind: 'company', id: 'c-canada', slug: 'conagra-brands-canada' }, [
      'Conagra Brands Canada',
    ]);
    return {
      companies: [ABI, CONAGRA, KHC],
      index,
      known: { company: new Set(), brand: new Set() },
    };
  };

  function fakeHttp(requests: HttpRequest[]): HttpClient {
    const bodyFor = (url: string): string => {
      if (url.includes('CIK0001668717')) return SUB_20F;
      if (url.includes('/submissions/'))
        return SUB_10K.replace(/0001637459-26-000009/g, '0001104659-26-083905');
      if (url.endsWith('-index.htm')) return INDEX;
      return TABLE;
    };
    return {
      async request(req) {
        requests.push(req);
        return {
          url: req.url,
          status: 200,
          headers: {},
          body: bodyFor(req.url),
          fetchedAt: FETCHED_AT,
          cache: null,
        } as HttpResponse;
      },
      get: () => Promise.reject(new Error('unused')),
      stream: () => Promise.reject(new Error('unused')),
      download: () => Promise.reject(new Error('unused')),
    };
  }

  async function run(store: ReturnType<typeof createMemoryRunStore>, sampleSize: number | null) {
    const written: { kind: RecordKind; records: unknown[] }[] = [];
    const writerOf = (kind: RecordKind): RecordWriter<RecordKind> => ({
      async upsert(records) {
        written.push({ kind, records });
        return {
          inserted: records.length,
          updated: 0,
          unchanged: 0,
          skipped_locked: 0,
          rejected: [],
        };
      },
    });
    const raws: string[] = [];
    const requests: HttpRequest[] = [];
    const result = await runSource(
      createSecEdgarSource({ loadCatalog: async () => catalog(), now: () => NOW }),
      {
        mode: sampleSize === null ? 'full' : 'sample',
        sampleSize,
        trigger: 'cli',
        politenessDelayMs: 0,
      },
      {
        store,
        writer: writerOf('document'),
        writerFor: writerOf,
        raw: ({ runId }) => ({
          store: async (seq, input) => {
            raws.push(input.body);
            store.rawUrls.push({ run_id: runId, request_url: input.url ?? '' });
            return { id: `${runId}-raw-${seq}` };
          },
        }),
        http: fakeHttp(requests),
        contactEmail: 'test@example.org',
        log: silent,
      },
    );
    return { result, raws, requests, written };
  }

  it('skips the 20-F filer, stores one envelope per exhibit and writes its records', async () => {
    const store = createMemoryRunStore({ sources: [SOURCE_ROW] });
    const { result, raws, requests, written } = await run(store, null);
    expect(result.status).toBe('completed');
    // 3 submissions, then index and exhibit for each of the two 10-K filers.
    expect(requests).toHaveLength(7);
    expect(raws.map((b) => parseEnvelope(b).company.slug)).toEqual([
      'conagra-brands-inc',
      'kraft-heinz',
    ]);
    expect(written.map((w) => [w.kind, w.records.length])).toEqual([
      ['document', 1],
      ['company_enrichment', 1],
      ['company_ownership', 1],
      ['document', 1],
      ['company_enrichment', 1],
      ['company_ownership', 1],
    ]);
    const skipped = store.events.filter((e) => e.event_type === 'sec_skipped');
    expect(skipped.map((e) => e.message)).toEqual([
      'anheuser-busch-inbev: no 10-K to read (foreign).',
    ]);
  });

  it('a re-run skips the exhibits it stored and writes nothing', async () => {
    const store = createMemoryRunStore({ sources: [SOURCE_ROW] });
    await run(store, null);
    const again = await run(store, null);
    expect(again.result.status).toBe('completed');
    expect(again.raws).toHaveLength(0);
    expect(again.written).toHaveLength(0);
    // Only the submissions and index pages are read.
    expect(again.requests).toHaveLength(5);
  });

  it('counts a sample in 10-K filings', async () => {
    const store = createMemoryRunStore({ sources: [SOURCE_ROW] });
    const { requests, raws } = await run(store, 1);
    // AB InBev (20-F) doesn't count, Conagra is the one filing, Kraft Heinz isn't read.
    expect(requests.filter((r) => r.url.includes('/submissions/'))).toHaveLength(2);
    expect(raws).toHaveLength(1);
  });

  it('re-parses a stored envelope to the same records', async () => {
    const store = createMemoryRunStore({ sources: [SOURCE_ROW] });
    const { raws, written } = await run(store, null);
    const source = createSecEdgarSource();
    const reparsed = raws.flatMap((body) => {
      const p = source.parse({
        rawObjectId: null,
        body,
        contentType: 'application/json',
        requestUrl: null,
        httpStatus: 200,
        headers: {},
        fetchedAt: FETCHED_AT,
      });
      return [{ kind: 'document' as RecordKind, records: p.records }, ...(p.batches ?? [])].map(
        (g) => ({ kind: g.kind, records: validateBatch(g.kind, g.records).valid }),
      );
    });
    expect(reparsed).toEqual(written);
  });
});
