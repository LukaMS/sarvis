// Wikipedia summaries on fixtures saved from real Action API responses (en.wikipedia.org,
// 2026-11-04, text CC BY-SA 4.0): the check and extracts queries for "3G Capital", "7-Eleven",
// "A&P Canada", "kraft Heinz" (normalised to "Kraft Heinz"), "Kraft Foods Inc.", "Mercury
// (disambiguation)" (a redirect to a disambiguation page) and a missing page.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { type RecordKind, validateBatch } from '@sarvis/core';
import { describe, expect, it } from 'vitest';

import type { HttpClient, HttpRequest, HttpResponse } from '../../http/client.ts';
import { createLogger } from '../../log.ts';
import { type RecordWriter, runSource } from '../../runs/driver.ts';
import { createMemoryRunStore } from '../../runs/store.ts';
import type { SourceRow } from '../source.ts';
import { createWikipediaSource } from './index.ts';
import {
  ENVELOPE_FORMAT,
  type Envelope,
  SUMMARY_MAX,
  type WpCompany,
  apiErrorOf,
  decideCheck,
  pageFor,
  parseEnvelope,
  permalinkOf,
  queryUrl,
  recordsOf,
  summaryOf,
  tidySummary,
} from './map.ts';

const read = (name: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8'));
const CHECK = read('fixture.check.json');
const EXTRACTS = read('fixture.extracts.json');
const FETCHED_AT = '2026-11-04T12:00:00.000Z';
const silent = createLogger({ level: 'error', write: () => {} });

const TITLES = [
  '3G Capital',
  '7-Eleven',
  'A&P Canada',
  'kraft Heinz',
  'Kraft Foods Inc.',
  'Mercury (disambiguation)',
  'No such page xyzzy',
];
const company = (i: number, o: Partial<WpCompany> = {}): WpCompany => ({
  qid: `Q${100 + i}`,
  title: TITLES[i] as string,
  revisionId: null,
  hasDocument: false,
  ...o,
});
const COMPANIES = TITLES.map((_, i) => company(i));

describe('wikipedia: query and page resolution', () => {
  it('builds the check and extracts queries with maxlag and redirects', () => {
    const check = new URL(queryUrl('check', ['A', 'B&C']));
    expect(check.origin + check.pathname).toBe('https://en.wikipedia.org/w/api.php');
    expect(Object.fromEntries(check.searchParams)).toEqual({
      action: 'query',
      format: 'json',
      formatversion: '2',
      redirects: '1',
      maxlag: '5',
      prop: 'info|pageprops',
      ppprop: 'disambiguation',
      titles: 'A|B&C',
    });
    const ext = new URL(queryUrl('extracts', ['A']));
    expect(ext.searchParams.get('prop')).toBe('extracts|info|pageprops');
    expect(ext.searchParams.get('exintro')).toBe('1');
    expect(ext.searchParams.get('explaintext')).toBe('1');
    expect(ext.searchParams.get('exlimit')).toBe('20');
    expect(ext.searchParams.get('inprop')).toBe('url');
  });

  it('follows normalisation and redirects, and tells missing and disambiguation pages apart', () => {
    expect(pageFor(CHECK, 'kraft Heinz')).toMatchObject({
      status: 'ok',
      page: { title: 'Kraft Heinz' },
    });
    expect(pageFor(CHECK, '7-Eleven')).toMatchObject({ status: 'ok', page: { pageid: 47420 } });
    expect(pageFor(CHECK, 'Mercury (disambiguation)').status).toBe('disambiguation');
    expect(pageFor(CHECK, 'No such page xyzzy').status).toBe('missing');
    expect(pageFor(CHECK, 'Not requested').status).toBe('absent');
  });

  it('reads API errors such as maxlag', () => {
    expect(
      apiErrorOf('{"error":{"code":"maxlag","info":"Waiting for 10.0.0.1: 6 seconds lagged."}}'),
    ).toEqual({ code: 'maxlag', info: 'Waiting for 10.0.0.1: 6 seconds lagged.' });
    expect(apiErrorOf(JSON.stringify(CHECK))).toBeNull();
    expect(apiErrorOf('<html>')?.code).toBe('not_json');
  });
});

describe('wikipedia: revision check', () => {
  it('queues new pages and moved revisions, and skips unchanged, missing and disambiguation', () => {
    const rev3g = (pageFor(CHECK, '3G Capital') as { page: { lastrevid: number } }).page.lastrevid;
    const rev711 = (pageFor(CHECK, '7-Eleven') as { page: { lastrevid: number } }).page.lastrevid;
    const companies = [
      company(0, { revisionId: rev3g, hasDocument: true }), // unchanged
      company(1, { revisionId: rev711, hasDocument: false }), // same revision, no document yet
      company(2, { revisionId: 1, hasDocument: true }), // revision moved
      ...COMPANIES.slice(3),
    ];
    const d = decideCheck(companies, CHECK);
    expect(d.changed.map((c) => c.title)).toEqual([
      '7-Eleven',
      'A&P Canada',
      'kraft Heinz',
      'Kraft Foods Inc.',
    ]);
    expect(d.counts).toEqual({
      checked: 7,
      changed: 4,
      retidy: 0,
      unchanged: 1,
      missing: 1,
      disambiguation: 1,
      notArticle: 0,
    });
    expect(d.skipped.map((s) => s.status)).toEqual(['disambiguation', 'missing']);
  });

  it('queues an unchanged page once if its stored summary predates the cleanup (P3.15b)', () => {
    const rev = (t: string) =>
      (pageFor(CHECK, t) as { page: { lastrevid: number } }).page.lastrevid;
    const stale = 'Kraft Foods Inc. () was a multinational confectionery.';
    const companies = [
      company(0, { revisionId: rev('3G Capital'), hasDocument: true, summary: '3G Capital is.' }),
      company(4, { revisionId: rev('Kraft Foods Inc.'), hasDocument: true, summary: stale }),
    ];
    const d = decideCheck(companies, CHECK);
    expect(d.changed.map((c) => c.title)).toEqual(['Kraft Foods Inc.']);
    expect(d.counts).toMatchObject({ changed: 0, retidy: 1, unchanged: 1 });
    // Once the summary is stored tidied, the page is left alone.
    const again = decideCheck(
      [
        company(4, {
          revisionId: rev('Kraft Foods Inc.'),
          hasDocument: true,
          summary: tidySummary(stale),
        }),
      ],
      CHECK,
    );
    expect(again.changed).toEqual([]);
    expect(again.counts).toMatchObject({ retidy: 0, unchanged: 1 });
  });
});

describe('wikipedia: summary', () => {
  it('keeps the first paragraph of the lead', () => {
    expect(summaryOf('First para.\nSecond para.')).toBe('First para.');
    expect(summaryOf('\n  Spaced   out  \n\nNext')).toBe('Spaced out');
    expect(summaryOf('')).toBeNull();
    expect(summaryOf(undefined)).toBeNull();
  });

  it('cuts a long paragraph at a sentence end, or at a word with an ellipsis', () => {
    const sentence = 'This is a sentence of about forty-five chars. ';
    const long = sentence.repeat(40);
    const s = summaryOf(long) as string;
    expect(s.length).toBeLessThanOrEqual(SUMMARY_MAX);
    expect(s.endsWith('chars.')).toBe(true);
    const words = 'word '.repeat(400);
    const w = summaryOf(words) as string;
    expect(w.length).toBeLessThanOrEqual(SUMMARY_MAX);
    expect(w.endsWith('word…')).toBe(true);
  });

  // Real P3.15 summaries (en.wikipedia.org, 2026-11-04) with TextExtracts' pronunciation leftovers.
  it.each([
    ['Kraft Foods Inc. () was a multinational', 'Kraft Foods Inc. was a multinational'],
    ['Findus (; Swedish: [ˈfɪndɵs]) is a Swedish', 'Findus (Swedish: [ˈfɪndɵs]) is a Swedish'],
    ['Guylian (, French: [ɡiljɑ̃]) is a Belgian', 'Guylian (French: [ɡiljɑ̃]) is a Belgian'],
    ['commonly known as Heinz (), was an American', 'commonly known as Heinz, was an American'],
    [
      'doing business as Frito-Lay, (; FREE-toh-LAY) is',
      'doing business as Frito-Lay, (FREE-toh-LAY) is',
    ],
    ['Nabisco ( , abbreviated from the earlier name', 'Nabisco (abbreviated from the earlier name'],
    [
      'Aldi (German pronunciation: [ˈaldiː] , stylised in all caps)',
      'Aldi (German pronunciation: [ˈaldiː], stylised in all caps)',
    ],
    [
      'SAP SE (; German pronunciation: [ɛsʔaːˈpeː] ) is',
      'SAP SE (German pronunciation: [ɛsʔaːˈpeː]) is',
    ],
    ['Prague ( PRAHG ; Czech: Praha [ˈpraɦa] ) is', 'Prague (PRAHG; Czech: Praha [ˈpraɦa]) is'],
    [
      'Brands International S.à.r.l. () (formerly known as',
      'Brands International S.à.r.l. (formerly known as',
    ],
    ['Odwalla Inc. ( ; ) is', 'Odwalla Inc. is'],
  ])('tidies %j', (raw, tidy) => {
    expect(tidySummary(raw)).toBe(tidy);
    expect(summaryOf(raw)).toBe(tidy);
    expect(tidySummary(tidy)).toBe(tidy);
  });

  it('leaves ordinary text alone', () => {
    const text =
      '7-Eleven, Inc. is an American chain (founded 1927). It sells .NET-free goods: milk.';
    expect(tidySummary(text)).toBe(text);
  });

  it('builds the revision permalink', () => {
    expect(permalinkOf('A&W (Canada)', 42)).toBe(
      'https://en.wikipedia.org/w/index.php?title=A%26W_(Canada)&oldid=42',
    );
  });
});

describe('wikipedia: records', () => {
  const env: Envelope = {
    format: ENVELOPE_FORMAT,
    kind: 'extracts',
    pages: COMPANIES.map((c) => ({ qid: c.qid, title: c.title })),
    result: EXTRACTS,
  };

  it('maps each article to a document and an enrichment that pass validation', () => {
    const r = recordsOf(env, FETCHED_AT);
    expect(r.documents.map((d) => d.title)).toEqual([
      '3G Capital',
      '7-Eleven',
      'A&P Canada',
      'Kraft Heinz',
      'Kraft Foods Inc.',
    ]);
    expect(r.skipped.map((s) => [s.title, s.status])).toEqual([
      ['Mercury (disambiguation)', 'disambiguation'],
      ['No such page xyzzy', 'missing'],
    ]);
    const docs = validateBatch('document', r.documents);
    const enr = validateBatch('company_enrichment', r.enrichments);
    expect(docs.stats).toMatchObject({ valid: 5, invalid: 0 });
    expect(enr.stats).toMatchObject({ valid: 5, invalid: 0 });

    const heinz = r.documents[3];
    expect(heinz).toMatchObject({
      url: 'https://en.wikipedia.org/wiki/Kraft_Heinz',
      url_normalized: 'https://en.wikipedia.org/wiki/Kraft_Heinz',
      kind: 'wikipedia',
      publisher: 'Wikipedia',
      domain: 'en.wikipedia.org',
      language: 'en',
      source_key: 'wikipedia',
      method: 'api',
      method_version: 'wikipedia@1.1.0',
      fetched_at: FETCHED_AT,
    });
    expect(heinz?.source_url).toBe(
      `https://en.wikipedia.org/w/index.php?title=Kraft_Heinz&oldid=${heinz?.wikipedia_revision_id}`,
    );
    expect(heinz?.summary?.startsWith('The Kraft Heinz Company')).toBe(true);
    expect(r.enrichments[3]).toMatchObject({
      match: { wikidata_qid: 'Q103' },
      external_id: 'Kraft Heinz',
      fields: {
        wikipedia_revision_id: heinz?.wikipedia_revision_id,
        wikipedia_document_url: heinz?.url_normalized,
      },
    });
    // 7-Eleven's lead paragraph is over the cap.
    expect(r.documents[1]?.summary?.length).toBeLessThanOrEqual(SUMMARY_MAX);
  });

  it('gives two companies whose titles reach one page one document', () => {
    const twice: Envelope = {
      ...env,
      pages: [
        { qid: 'Q1', title: 'Kraft Heinz' },
        { qid: 'Q2', title: 'kraft Heinz' },
      ],
    };
    const r = recordsOf(twice, FETCHED_AT);
    expect(r.documents).toHaveLength(1);
    expect(r.enrichments.map((e) => e.match.wikidata_qid)).toEqual(['Q1', 'Q2']);
  });

  it('rejects a body that is not its envelope', () => {
    expect(() => parseEnvelope('{"batchcomplete":true}')).toThrow(/Not a Wikipedia envelope/);
  });
});

describe('wikipedia: through the run driver', () => {
  const SOURCE_ROW: SourceRow = {
    id: 'src-wp',
    key: 'wikipedia',
    verdict: 'use',
    enabled: true,
    rate_limit_per_sec: 1,
  };

  function fakeHttp(requests: HttpRequest[], lagFirst = false): HttpClient {
    let lagged = !lagFirst;
    return {
      async request(req) {
        requests.push(req);
        const prop = new URL(req.url).searchParams.get('prop') ?? '';
        let body = JSON.stringify(prop.startsWith('extracts') ? EXTRACTS : CHECK);
        const headers: Record<string, string> = {};
        if (!lagged) {
          lagged = true;
          body = '{"error":{"code":"maxlag","info":"6 seconds lagged."}}';
          headers['retry-after'] = '0.001';
        }
        return {
          url: req.url,
          status: 200,
          headers,
          body,
          fetchedAt: FETCHED_AT,
          cache: null,
        } as HttpResponse;
      },
      get: () => Promise.reject(new Error('unused')),
      stream: () => Promise.reject(new Error('unused')),
      download: () => Promise.reject(new Error('unused')),
    };
  }

  async function run(companies: WpCompany[], sampleSize: number | null, lagFirst = false) {
    const store = createMemoryRunStore({ sources: [SOURCE_ROW] });
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
      createWikipediaSource({
        api: 'https://wp.example/w/api.php',
        loadCompanies: async () => companies,
      }),
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
        raw: () => ({
          store: async (seq, input) => {
            raws.push(input.body);
            return { id: `raw-${seq}` };
          },
        }),
        http: fakeHttp(requests, lagFirst),
        log: silent,
      },
    );
    return { result, raws, requests, written };
  }

  it('checks, then stores and writes only the changed pages, documents first', async () => {
    const { result, raws, requests, written } = await run(COMPANIES, null);
    expect(result.status).toBe('completed');
    expect(requests.map((r) => new URL(r.url).searchParams.get('prop'))).toEqual([
      'info|pageprops',
      'extracts|info|pageprops',
    ]);
    expect(requests.every((r) => r.cacheTtlMs === 0)).toBe(true);
    // The check isn't stored; the extracts are, as the envelope parse reads.
    expect(raws.map((b) => parseEnvelope(b).kind)).toEqual(['extracts']);
    expect(parseEnvelope(raws[0] as string).pages).toHaveLength(5);
    expect(written.map((w) => [w.kind, w.records.length])).toEqual([
      ['document', 5],
      ['company_enrichment', 5],
    ]);
    expect(result.counts).toMatchObject({ fetched: 10, valid: 10, invalid: 0, inserted: 10 });
  });

  it('stores nothing and writes nothing when no page changed', async () => {
    const unchanged = COMPANIES.slice(0, 5).map((c) => {
      const o = pageFor(CHECK, c.title) as { page: { lastrevid: number } };
      return { ...c, revisionId: o.page.lastrevid, hasDocument: true };
    });
    const { result, raws, requests, written } = await run(unchanged, null);
    expect(result.status).toBe('completed');
    expect(requests).toHaveLength(1);
    expect(raws).toHaveLength(0);
    expect(written).toHaveLength(0);
    expect(result.counts.fetched).toBe(0);
  });

  it('counts a sample in companies checked', async () => {
    const { requests, written } = await run(COMPANIES, 2);
    const titles = new URL(requests[0]?.url as string).searchParams.get('titles');
    expect(titles).toBe('3G Capital|7-Eleven');
    expect(written.map((w) => [w.kind, w.records.length])).toEqual([
      ['document', 2],
      ['company_enrichment', 2],
    ]);
  });

  it('waits out a maxlag answer and tries again', async () => {
    const { result, requests } = await run(COMPANIES, null, true);
    expect(result.status).toBe('completed');
    expect(requests).toHaveLength(3);
  });

  it('re-parses a stored envelope to the same records', async () => {
    const { raws, written } = await run(COMPANIES, null);
    const source = createWikipediaSource();
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
