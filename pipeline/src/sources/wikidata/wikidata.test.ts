// Wikidata ownership on fixtures saved from real WDQS responses (2026-11-03, CC0): a match for
// "President's Choice", "Metro", "Kellogg's" and "Kirkland", plus the five P3.12 wrong matches
// ("Beatrice", "Avril", "Co-op", "PC", "Flamingo"), the P3.12a brand-class wrong picks ("Astro",
// "Quest", "Jordans", "Chapman's"), "Oikos" and "Coop" (re-saved with the 1.2.0 query, P3.12b), and
// the classes query for its candidates' classes and industries; the entities of President's Choice
// (a brand) and Metro Inc. (a business); and Loblaw Companies, read with President's Choice as a
// child (its P127 statement names Loblaw).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { type RecordKind, validateBatch } from '@sarvis/core';
import { describe, expect, it } from 'vitest';

import type { HttpClient, HttpRequest, HttpResponse } from '../../http/client.ts';
import { createLogger } from '../../log.ts';
import { type RecordWriter, runSource } from '../../runs/driver.ts';
import { createMemoryRunStore } from '../../runs/store.ts';
import type { SourceRow } from '../source.ts';
import { createWikidataSource } from './index.ts';
import {
  type Candidate,
  type Envelope,
  candidateClasses,
  classFlagsOf,
  type Statement,
  companyRelation,
  decideMatches,
  factsOf,
  hitSteps,
  isShortBrand,
  labelVariants,
  nameOf,
  nextHop,
  parseEnvelope,
  pickCandidate,
  recordsOf,
  sharePctOf,
  slugOf,
  usableBrand,
  walksUp,
} from './map.ts';
import { classQuery, dateOf, entitiesQuery, literal, matchQuery, qidOf } from './sparql.ts';

const read = (name: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8'));
const MATCH = read('fixture.match.json');
const CLASSES = read('fixture.classes.json');
const HOP0 = read('fixture.hop0.json');
const HOP1 = read('fixture.hop1.json');
const FETCHED_AT = '2026-11-03T16:30:00.000Z';
const silent = createLogger({ level: 'error', write: () => {} });

type EntitiesEnv = Extract<Envelope, { kind: 'entities' }>;
const env = (partial: Omit<EntitiesEnv, 'kind' | 'query'>): EntitiesEnv => ({
  kind: 'entities',
  query: '',
  ...partial,
});
const HOP0_ENV = env({
  hop: 0,
  items: [
    { qid: 'Q845185', brand: true, company: false, self: false, expand: true },
    { qid: 'Q1145669', brand: true, company: true, self: true, expand: true },
  ],
  children: [],
  result: HOP0,
});
const HOP1_ENV = env({
  hop: 1,
  items: [{ qid: 'Q909856', brand: false, company: true, self: false, expand: true }],
  children: [{ qid: 'Q845185', as: 'brand' }],
  result: HOP1,
});

describe('SPARQL helpers', () => {
  it('escapes literals and refuses a non-QID', () => {
    expect(literal('Ben "B" \\ Co', 'en')).toBe('"Ben \\"B\\" \\\\ Co"@en');
    expect(matchQuery(["Kellogg's"])).toContain(`"Kellogg's"@mul`);
    expect(() => entitiesQuery(['Q1 } DELETE'], [])).toThrow(/Not a QID/);
    expect(entitiesQuery(['Q1'], [])).not.toContain('inP127');
    expect(entitiesQuery(['Q1'], ['Q2'])).toContain('VALUES ?v { wd:Q2 }');
  });

  it('reads QIDs, dates and shares', () => {
    expect(qidOf({ type: 'uri', value: 'http://www.wikidata.org/entity/Q42' })).toBe('Q42');
    expect(qidOf({ type: 'uri', value: 'http://www.wikidata.org/entity/P31' })).toBeNull();
    expect(dateOf({ type: 'literal', value: '2009-12-01T00:00:00Z' })).toBe('2009-12-01');
    expect(dateOf({ type: 'literal', value: '+1995-00-00T00:00:00Z' })).toBe('1995-01-01');
    expect(dateOf({ type: 'bnode', value: 't1' })).toBeNull();
    expect(sharePctOf('0.037')).toBe(3.7);
    expect(sharePctOf('60')).toBe(60);
    expect(sharePctOf('150')).toBeNull();
    expect(sharePctOf(undefined)).toBeNull();
  });
});

describe('Brand strings', () => {
  it('skips placeholders and tries cheap spelling variants', () => {
    expect(['null', 'N/A', '---', '123', 'Sans marque'].filter(usableBrand)).toEqual([]);
    expect(usableBrand('T&T')).toBe(true);
    expect(labelVariants('Club house')).toEqual(['Club house', 'Club House']);
    expect(labelVariants('President’s Choice')).toEqual([
      'President’s Choice',
      "President's Choice",
    ]);
    expect(labelVariants('IGA')).toEqual(['IGA']);
  });
});

describe('Matching', () => {
  // A business in a grocery trade by default; `brand` makes it a grocery brand-class item instead.
  const c = (
    qid: string,
    countries: string[],
    brand = false,
    more: Partial<Candidate> = {},
  ): Candidate => ({
    qid,
    countries,
    brand,
    business: !brand,
    excluded: false,
    trade: !brand,
    grocery: brand,
    ...more,
  });

  it('picks by tier, and only when one candidate is in the tier', () => {
    expect(pickCandidate([c('Q1', ['FR'])])).toMatchObject({ tier: 'single' });
    expect(pickCandidate([c('Q1', ['US']), c('Q2', ['CA'])]).pick?.qid).toBe('Q2');
    expect(pickCandidate([c('Q1', ['US']), c('Q2', [], true)]).pick?.qid).toBe('Q2');
    expect(pickCandidate([c('Q1', ['GB']), c('Q2', ['US'])])).toMatchObject({ tier: 'US' });
    // Two Canadian candidates: the CA tier can't decide, so nothing is picked.
    expect(pickCandidate([c('Q1', ['CA']), c('Q2', ['CA']), c('Q3', [], true)]).pick).toBeNull();
    expect(pickCandidate([c('Q1', ['GB']), c('Q2', ['DE'])]).pick).toBeNull();
    expect(pickCandidate([]).pick).toBeNull();
  });

  it('never picks an excluded class, and an excluded one still blocks `single`', () => {
    const town = c('Q9', ['FR'], false, { excluded: true, trade: false });
    expect(pickCandidate([town]).pick).toBeNull();
    // Avril: a French commune and a French chain. The chain isn't the only candidate, and it
    // isn't North American, so nothing is picked.
    expect(pickCandidate([town, c('Q2', ['FR'], true)]).pick).toBeNull();
    expect(pickCandidate([town, c('Q2', ['CA'])])).toMatchObject({ tier: 'CA' });
  });

  it('takes only North American brand-class items, and needs trade for a country tier', () => {
    // Beatrice / Co-op: the only brand-class item is British.
    expect(
      pickCandidate([c('Q1', ['US']), c('Q2', ['US']), c('Q3', ['GB'], true)]).pick,
    ).toBeNull();
    expect(pickCandidate([c('Q1', ['GB']), c('Q3', [], true)])).toMatchObject({
      tier: 'brand-class',
    });
    // Kirkland: a US law firm (no grocery trade) doesn't win the US tier.
    const firm = c('Q1', ['US'], false, { trade: false });
    expect(pickCandidate([firm, c('Q2', ['GB'])]).pick).toBeNull();
    expect(pickCandidate([firm, c('Q2', ['GB']), c('Q3', ['US'])])).toMatchObject({ tier: 'US' });
    // A Canadian projector maker loses to nothing; a Canadian brand wins.
    expect(pickCandidate([c('Q1', ['CA'], false, { trade: false }), c('Q2', ['GB'])]).pick).toBe(
      null,
    );
    expect(pickCandidate([c('Q1', ['CA'], true), c('Q2', ['GB'])])).toMatchObject({ tier: 'CA' });
  });

  it('needs a grocery brand class or a grocery trade after `single` (P3.12b)', () => {
    // Quest: a plain-brand cigarette item isn't a grocery brand; nothing else is either.
    const plain = (qid: string, countries: string[]) => c(qid, countries, true, { grocery: false });
    expect(pickCandidate([plain('Q1', []), c('Q2', ['GB'])]).pick).toBeNull();
    // Astro, Jordans: a US brand the brand-class tier rejects doesn't come back in the US tier.
    expect(pickCandidate([plain('Q1', ['US']), c('Q2', ['GB'])]).pick).toBeNull();
    // Chapman's: the same for a CA or US brand-class store chain with no grocery trade.
    expect(pickCandidate([plain('Q1', ['CA']), plain('Q2', ['US'])]).pick).toBeNull();
    // A grocery brand beside a plain one wins the brand-class tier (Oikos, Mars).
    expect(pickCandidate([plain('Q1', []), c('Q2', [], true)])).toMatchObject({
      tier: 'brand-class',
      pick: { qid: 'Q2' },
    });
    // A brand-class item with a grocery trade counts (Fresh Market, 7-Eleven).
    expect(
      pickCandidate([c('Q1', [], true, { grocery: false, trade: true }), c('Q2', ['GB'])]),
    ).toMatchObject({ tier: 'brand-class', pick: { qid: 'Q1' } });
    // The only candidate needs no evidence.
    expect(pickCandidate([plain('Q1', ['FR'])])).toMatchObject({ tier: 'single' });
  });

  it('counts a country without an ISO code as not North American', () => {
    // Coop: a Dutch chain whose P17 is Q55 Netherlands, which has no P297.
    expect(pickCandidate([c('Q1', ['??'], true), c('Q2', ['GB'])]).pick).toBeNull();
    expect(matchQuery(['Coop'])).toContain('COALESCE(?code, "??")');
  });

  it('decides each brand string from a real match result', () => {
    const d = decideMatches(
      [
        "President's Choice",
        'Metro',
        "Kellogg's",
        'Kirkland',
        'Beatrice',
        'Avril',
        'Co-op',
        'PC',
        'Flamingo',
        'Astro',
        'Quest',
        'Jordans',
        "Chapman's",
        'Oikos',
        'Coop',
        'Nope',
      ],
      MATCH,
      classFlagsOf(CLASSES, candidateClasses(MATCH)),
    );
    expect(
      d.map((x) => [x.brand, x.status, x.qid ?? null, x.role ?? null, x.tier ?? null]),
    ).toEqual([
      ["President's Choice", 'matched', 'Q845185', 'brand', 'single'],
      ['Metro', 'matched', 'Q1145669', 'company', 'CA'],
      ["Kellogg's", 'matched', 'Q130326112', 'brand', 'brand-class'],
      ['Kirkland', 'ambiguous', null, null, null],
      // The five P3.12 wrong matches: a GB magazine (now excluded) beside two US towns; a French
      // chain beside a commune; the UK Co-operative Group; The Canadian Press by its alias "PC";
      // a publisher.
      ['Beatrice', 'unmatched', null, null, null],
      ['Avril', 'ambiguous', null, null, null],
      ['Co-op', 'ambiguous', null, null, null],
      ['PC', 'unmatched', null, null, null],
      ['Flamingo', 'unmatched', null, null, null],
      // The P3.12a brand-class wrong picks: a US gas station chain, a cigarette brand, Air
      // Jordan, a US department store chain. None is a grocery brand or in a grocery trade.
      ['Astro', 'ambiguous', null, null, null],
      ['Quest', 'ambiguous', null, null, null],
      ['Jordans', 'ambiguous', null, null, null],
      ["Chapman's", 'ambiguous', null, null, null],
      // A yogurt food brand beside a plain brand; a Dutch chain (no ISO code) among nine more.
      ['Oikos', 'matched', 'Q137798516', 'brand', 'brand-class'],
      ['Coop', 'ambiguous', null, null, null],
      ['Nope', 'unmatched', null, null, null],
    ]);
    expect(d[1]?.candidates).toBeGreaterThan(10);
    // "PC" is an alias of The Canadian Press, and a 2-letter string matches labels only.
    expect(d[7]?.candidates).toBe(0);
    expect(isShortBrand('PC')).toBe(true);
    expect(isShortBrand('M&M')).toBe(true);
    expect(isShortBrand('IGA')).toBe(false);
  });

  it('flags excluded classes and grocery trades from a real classes result', () => {
    const used = candidateClasses(MATCH);
    const flags = classFlagsOf(CLASSES, used);
    expect(Object.keys(flags)).toHaveLength(used.length);
    expect(flags.Q2085381).toEqual({ excluded: true, trade: false, grocery: false }); // publisher
    expect(flags.Q15127012?.excluded).toBe(true); // town in the United States
    expect(flags.Q41298?.excluded).toBe(true); // magazine
    expect(flags.Q126793).toEqual({ excluded: false, trade: true, grocery: false }); // retail
    expect(flags.Q4830453).toEqual({ excluded: false, trade: false, grocery: false }); // business
    expect(flags.Q16323605).toEqual({ excluded: false, trade: false, grocery: true }); // food brand
    // Without the flags the publisher comes back (Beatrice stays out: its towns aren't a trade).
    const bare = decideMatches(['Flamingo', 'Beatrice'], MATCH);
    expect(bare.map((x) => x.status)).toEqual(['matched', 'ambiguous']);
    expect(classQuery(['Q1'])).toContain('(wd:Q486972 "excluded")');
    expect(classQuery(['Q1'])).toContain('(wd:Q16323605 "grocery")');
  });
});

describe('Entities', () => {
  it('folds a statement and names items in the preferred language', () => {
    const facts = factsOf(HOP1);
    const loblaw = facts.get('Q909856');
    expect(loblaw && nameOf(loblaw)).toBe('Loblaw Companies');
    // P127 and P749 both name George Weston (Q833217).
    expect(loblaw?.owners.map((s) => [s.prop, s.other])).toEqual([
      ['P127', 'Q833217'],
      ['P749', 'Q833217'],
    ]);
    expect(loblaw?.inbound.map((s) => [s.prop, s.other])).toEqual([['P127', 'Q845185']]);
    expect(slugOf('羅布勞公司', 'Q909856')).toBe('q909856');
  });

  it('writes a brand, a business as company + own brand, and valid records', () => {
    const r = recordsOf(HOP0_ENV, FETCHED_AT);
    expect(r.brands.map((b) => [b.slug, b.name, b.wikidata_qid])).toEqual([
      ['presidents-choice', "President's Choice", 'Q845185'],
      ['metro', 'Metro', 'Q1145669'],
    ]);
    expect(r.companies).toHaveLength(1);
    expect(r.companies[0]).toMatchObject({
      slug: 'metro',
      name: 'Metro',
      kind: 'company',
      country: 'CA',
      wikidata_qid: 'Q1145669',
      wikipedia_title: 'Metro Inc.',
      sec_cik: '0001718420',
      website: 'https://www.metro.ca/en',
      source_url: 'https://www.wikidata.org/wiki/Q1145669',
      source_key: 'wikidata',
      method: 'api',
      method_version: 'wikidata@1.2.0',
      fetched_at: FETCHED_AT,
    });
    expect(r.brandEdges).toEqual([
      expect.objectContaining({
        brand_qid: 'Q1145669',
        company_qid: 'Q1145669',
        relation: 'owner',
      }),
    ]);
    expect(r.companyEdges).toEqual([]);
    for (const [kind, records] of [
      ['company', r.companies],
      ['brand', r.brands],
      ['brand_ownership', r.brandEdges],
    ] as [RecordKind, unknown[]][]) {
      expect(validateBatch(kind, records).stats.invalid).toBe(0);
    }
  });

  it('writes the edge from the previous hop once its owner is written', () => {
    const r = recordsOf(HOP1_ENV, FETCHED_AT);
    expect(r.companies.map((x) => [x.slug, x.wikidata_qid])).toEqual([
      ['loblaw-companies', 'Q909856'],
    ]);
    expect(r.brandEdges).toEqual([
      expect.objectContaining({
        brand_qid: 'Q845185',
        company_qid: 'Q909856',
        relation: 'owner',
        valid_from: null,
        valid_to: null,
        source_url: 'https://www.wikidata.org/wiki/Q845185#P127',
      }),
    ]);
    expect(validateBatch('brand_ownership', r.brandEdges).stats.invalid).toBe(0);
  });

  it('walks owners one hop at a time, each item once', () => {
    const expanded = new Set(['Q845185', 'Q1145669']);
    expect(nextHop(HOP0_ENV, expanded)).toEqual([
      {
        kind: 'entities',
        hop: 1,
        items: [{ qid: 'Q909856', brand: false, company: true, self: false, expand: true }],
        children: [{ qid: 'Q845185', as: 'brand' }],
      },
    ]);
    // Loblaw's P127 and P749 name one parent: one item, Loblaw as its company child.
    expect(nextHop(HOP1_ENV, expanded)).toEqual([
      {
        kind: 'entities',
        hop: 2,
        items: [{ qid: 'Q833217', brand: false, company: true, self: false, expand: true }],
        children: [{ qid: 'Q909856', as: 'company' }],
      },
    ]);
    // Already walked: still read (for the edge), not walked again.
    expect(nextHop(HOP1_ENV, expanded)[0]).toMatchObject({ items: [{ expand: false }] });
    expect(nextHop({ ...HOP1_ENV, hop: 5 }, new Set())).toEqual([]);
  });

  it('maps shares to relations and stops at minority and ended owners', () => {
    const s = (sharePct: number | null, end: string | null = null): Statement => ({
      prop: 'P127',
      other: 'Q1',
      rank: 'normal',
      start: null,
      end,
      sharePct,
    });
    expect([null, 100, 60, 3.7].map((p) => companyRelation(s(p)))).toEqual([
      'subsidiary',
      'subsidiary',
      'majority_stake',
      'minority_stake',
    ]);
    expect(walksUp(s(60), 'company')).toBe(true);
    expect(walksUp(s(3.7), 'company')).toBe(false);
    expect(walksUp(s(3.7), 'brand')).toBe(true);
    expect(walksUp(s(null, '2020-01-01'), 'company')).toBe(false);
  });

  it('chunks hits and marks a business as its own brand', () => {
    const steps = hitSteps(
      [
        { brand: 'a', status: 'matched', candidates: 1, qid: 'Q1', role: 'brand' },
        { brand: 'b', status: 'matched', candidates: 1, qid: 'Q2', role: 'company' },
        { brand: 'c', status: 'matched', candidates: 1, qid: 'Q3', role: 'brand' },
      ],
      new Set(['Q3']),
      2,
    );
    expect(steps.map((s) => (s.kind === 'entities' ? s.items : []))).toEqual([
      [
        { qid: 'Q1', brand: true, company: false, self: false, expand: true },
        { qid: 'Q2', brand: true, company: true, self: true, expand: true },
      ],
      [{ qid: 'Q3', brand: true, company: false, self: false, expand: false }],
    ]);
  });
});

describe('Wikidata source run', () => {
  const SOURCE_ROW: SourceRow = {
    id: '00000000-0000-4000-8000-000000000017',
    key: 'wikidata',
    verdict: 'use',
    enabled: true,
    rate_limit_per_sec: 1,
  };
  const EMPTY = { head: { vars: [] }, results: { bindings: [] } };

  function fakeHttp(requests: HttpRequest[]): HttpClient {
    return {
      async request(req) {
        requests.push(req);
        const q = new URLSearchParams(req.body ?? '').get('query') ?? '';
        const items = /VALUES \?item \{([^}]*)\}/.exec(q)?.[1] ?? '';
        const body = q.includes('VALUES ?label')
          ? MATCH
          : q.includes('VALUES (?root ?flag)')
            ? CLASSES
            : items.includes('wd:Q845185')
              ? HOP0
              : items.includes('wd:Q909856')
                ? HOP1
                : EMPTY;
        return {
          url: req.url,
          status: 200,
          headers: {},
          body: JSON.stringify(body),
          fetchedAt: FETCHED_AT,
          cache: null,
        } as HttpResponse;
      },
      get: () => Promise.reject(new Error('unused')),
      stream: () => Promise.reject(new Error('unused')),
      download: () => Promise.reject(new Error('unused')),
    };
  }

  async function run(sampleSize: number | null, labelsPerQuery?: number) {
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
      createWikidataSource({
        endpoint: 'https://wdqs.example/sparql',
        labelsPerQuery,
        loadBrands: async () => [
          { brand: "President's Choice", products: 1820 },
          { brand: 'null', products: 10 },
          { brand: 'Metro', products: 384 },
          { brand: 'Kirkland', products: 758 },
        ],
      }),
      {
        mode: sampleSize === null ? 'full' : 'sample',
        sampleSize,
        trigger: 'cli',
        politenessDelayMs: 0,
      },
      {
        store,
        writer: writerOf('company'),
        writerFor: writerOf,
        raw: () => ({
          store: async (seq, input) => {
            raws.push(input.body);
            return { id: `raw-${seq}` };
          },
        }),
        http: fakeHttp(requests),
        log: silent,
      },
    );
    return { result, store, raws, requests, written };
  }

  it('matches, walks two hops and writes entities before their edges', async () => {
    const { result, raws, requests, written } = await run(null);
    expect(result.status).toBe('completed');
    // match, classes, hop 0, hop 1 (Loblaw), hop 2 (George Weston: no facts in the fake).
    expect(requests).toHaveLength(5);
    expect(requests.every((r) => r.method === 'POST')).toBe(true);
    expect(raws.map((b) => parseEnvelope(b).kind)).toEqual([
      'match',
      'entities',
      'entities',
      'entities',
    ]);
    expect(written.map((w) => [w.kind, w.records.length])).toEqual([
      ['company', 1], // Metro
      ['brand', 2], // President's Choice, Metro
      ['brand_ownership', 1], // Metro → Metro
      ['company', 1], // Loblaw
      ['brand_ownership', 1], // President's Choice → Loblaw
    ]);
    expect(result.counts).toMatchObject({ fetched: 6, valid: 6, invalid: 0, inserted: 6 });
  });

  it('counts a sample in matched brand items, not records', async () => {
    const { result, requests, written } = await run(1);
    expect(result.status).toBe('completed');
    // One item (President's Choice), and the whole walk above it.
    expect(written.filter((w) => w.kind === 'brand').flatMap((w) => w.records)).toHaveLength(1);
    expect(written.map((w) => w.kind)).toEqual(['brand', 'company', 'brand_ownership']);
    expect(requests).toHaveLength(5);
  });

  it('asks for each class once per run, and stores the flags each batch used', async () => {
    // One string per match query: three match batches, but the classes are asked only once.
    const { requests, raws } = await run(null, 1);
    const bodies = requests.map((r) => new URLSearchParams(r.body ?? '').get('query') ?? '');
    expect(bodies.filter((q) => q.includes('VALUES ?label'))).toHaveLength(3);
    expect(bodies.filter((q) => q.includes('VALUES (?root ?flag)'))).toHaveLength(1);
    const matches = raws.map(parseEnvelope).filter((e) => e.kind === 'match');
    expect(matches.map((e) => e.classQueries.length)).toEqual([1, 0, 0]);
    // Each envelope carries the flags it used, so a decision can be re-checked from storage.
    for (const e of matches) expect(Object.keys(e.classes)).toEqual(candidateClasses(e.result));
  });

  it('re-parses a stored envelope to the same records', async () => {
    const { raws, written } = await run(null);
    const source = createWikidataSource();
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
      return [
        ...(p.records.length > 0 ? [{ kind: 'company' as RecordKind, records: p.records }] : []),
        ...(p.batches ?? []),
      ].map((g) => ({ kind: g.kind, records: validateBatch(g.kind, g.records).valid }));
    });
    expect(reparsed).toEqual(written);
  });
});
