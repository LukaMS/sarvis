// Corporations Canada on a fixture in the real file's format (header, BOM, quoting and name layouts
// copied from corporations-active-cbca-en.csv, 2026-11-04). The public corporations' names and
// numbers are real; business numbers, dates and addresses are invented, and the dissolved, malformed
// and unrelated rows use made-up names (D-012).
import { fileURLToPath } from 'node:url';

import { validateBatch } from '@sarvis/core';
import { describe, expect, it } from 'vitest';

import type { HttpClient } from '../../http/client.ts';
import { openLines } from '../../http/lines.ts';
import { createLogger } from '../../log.ts';
import { type RecordWriter, runSource } from '../../runs/driver.ts';
import { createMemoryRunStore } from '../../runs/store.ts';
import type { SourceRow } from '../source.ts';
import { createCorpCanadaSource } from './index.ts';
import {
  CC_KEY,
  CC_METHOD_VERSION,
  type CcCompany,
  CorpMatcher,
  type Envelope,
  corpKey,
  parseCsvLine,
  parseEnvelope,
  recordsOf,
  tidyName,
} from './map.ts';

const FIXTURE = fileURLToPath(new URL('./fixture.corporations.csv', import.meta.url));
const FILE_URL = 'https://files.test/corporations-active-cbca-en.csv';
const FETCHED_AT = '2026-11-04T12:00:00.000Z';
const silent = createLogger({ level: 'error', write: () => {} });

const company = (slug: string, name: string, legalName: string | null = null): CcCompany => ({
  slug,
  name,
  legalName,
});

const COMPANIES: CcCompany[] = [
  company('loblaw-companies', 'Loblaw Companies'),
  company('lassonde-industries', 'Lassonde Industries'),
  company('cargill-canada', 'Cargill Canada', 'Cargill Limited'),
  company('dominion', 'Dominion'),
  company('shoppers-drug-mart', 'Shoppers Drug Mart'),
  company('the-brick', 'The Brick'),
  company('brick-warehouse', 'Brick'),
  company('agropur', 'Agropur'),
  company('example-dairy', 'Example Dairy'),
  company('example-bakery', 'Example Bakery'),
];

async function scanned(companies = COMPANIES) {
  const matcher = new CorpMatcher(companies);
  const counts = await matcher.scan(openLines(FIXTURE, { gzip: false }), FILE_URL);
  return { counts, ...matcher.result() };
}

describe('corp-canada: names', () => {
  it('drops the legal elements a federal name ends in, in both languages', () => {
    expect(corpKey('LOBLAW COMPANIES LIMITED')).toBe('loblaw companies');
    expect(corpKey('Loblaw Companies')).toBe('loblaw companies');
    expect(corpKey('CONFISERIES RÉGAL LTÉE')).toBe('confiseries regal');
    expect(corpKey('AGROPUR COOPÉRATIVE')).toBe('agropur');
    expect(corpKey('SAPUTO INC.')).toBe('saputo');
  });

  it('keeps "Company", so a generic name stays a different business', () => {
    expect(corpKey('THE DOMINION COMPANY INC.')).toBe('dominion company');
    expect(corpKey('Dominion')).toBe('dominion');
  });

  it('removes the bilingual joiner from a registered name', () => {
    expect(tidyName('CARGILL LIMITED -')).toBe('CARGILL LIMITED');
    expect(tidyName('Labatt Brewing Company Limited-')).toBe('Labatt Brewing Company Limited');
    expect(tidyName('CO-OP  ATLANTIC')).toBe('CO-OP ATLANTIC');
  });

  it('reads quoted fields and refuses an unclosed quote', () => {
    expect(parseCsvLine('1,"2, Street",,"say ""hi"""')).toEqual(['1', '2, Street', '', 'say "hi"']);
    expect(parseCsvLine('99,"unclosed')).toBeNull();
  });
});

describe('corp-canada: matching', () => {
  it('confirms a display name or legal name, by either name form', async () => {
    const { matches } = await scanned();
    expect(matches.map((m) => [m.slug, m.number, m.legal_name])).toEqual([
      ['agropur', '3827003', 'AGROPUR COOPERATIVE'],
      ['cargill-canada', '2717751', 'CARGILL LIMITED'],
      ['lassonde-industries', '1197673', 'LASSONDE INDUSTRIES INC.'],
      ['loblaw-companies', '126764', 'LOBLAW COMPANIES LIMITED'],
    ]);
  });

  it('skips a name fitting two corporations, and a corporation two companies claim', async () => {
    const { ambiguous, shared } = await scanned();
    expect(ambiguous).toEqual([{ slug: 'shoppers-drug-mart', numbers: ['12592959', '4074823'] }]);
    expect(shared).toEqual([
      { slug: 'brick-warehouse', numbers: ['7658419'] },
      { slug: 'the-brick', numbers: ['7658419'] },
    ]);
  });

  it('never matches a non-active row or a malformed one', async () => {
    const { counts, matches } = await scanned();
    expect(counts).toEqual({ url: FILE_URL, rows: 12, malformed: 2, notActive: 1 });
    expect(matches.map((m) => m.slug)).not.toContain('example-dairy');
    expect(matches.map((m) => m.slug)).not.toContain('example-bakery');
  });

  it('does not match "The Dominion Company Inc." to Dominion', async () => {
    const { matches, ambiguous, shared } = await scanned();
    const slugs = [...matches, ...ambiguous, ...shared].map((m) => m.slug);
    expect(slugs).not.toContain('dominion');
  });

  it('fails on a file whose columns changed', async () => {
    const matcher = new CorpMatcher(COMPANIES);
    async function* lines() {
      yield 'Number,Name';
      yield '1,A';
    }
    await expect(matcher.scan(lines(), FILE_URL)).rejects.toThrow(/Corporation number/);
  });
});

describe('corp-canada: records', () => {
  const env: Envelope = {
    format: 'sarvis-corp-canada/1',
    files: [],
    matches: [
      {
        slug: 'loblaw-companies',
        number: '126764',
        legal_name: 'LOBLAW COMPANIES LIMITED',
        names: ['LOBLAW COMPANIES LIMITED', 'LES COMPAGNIES LOBLAW LIMITEE'],
        legislation: 'Canada Business Corporations Act',
        status_detail: '',
        file_url: FILE_URL,
      },
    ],
  };

  it('gives one valid enrichment per match', () => {
    const { valid, failures } = validateBatch('company_enrichment', recordsOf(env, FETCHED_AT));
    expect(failures).toEqual([]);
    expect(valid).toEqual([
      expect.objectContaining({
        source_key: CC_KEY,
        source_url: FILE_URL,
        method: 'import',
        method_version: CC_METHOD_VERSION,
        external_id: '126764',
        match: { slug: 'loblaw-companies', corp_canada_number: '126764' },
        fields: { corp_canada_number: '126764', legal_name: 'LOBLAW COMPANIES LIMITED' },
      }),
    ]);
  });

  it('refuses anything that is not its envelope', () => {
    expect(() => parseEnvelope('{"format":"other"}')).toThrow(/envelope/);
  });
});

describe('corp-canada: a run through the driver', () => {
  const SOURCE_ROW: SourceRow = {
    id: 'src-cc',
    key: CC_KEY,
    verdict: 'use',
    enabled: true,
    rate_limit_per_sec: 0.05,
  };
  const http = {
    download: async (url: string) => ({
      url,
      path: FIXTURE,
      sha256: 'abc',
      bytes: 1,
      fetchedAt: FETCHED_AT,
      etag: null,
      lastModified: null,
      cache: null,
    }),
  } as unknown as HttpClient;

  async function run(sampleSize: number | null) {
    const store = createMemoryRunStore({ sources: [SOURCE_ROW] });
    const written: unknown[] = [];
    const writer: RecordWriter<'company_enrichment'> = {
      async upsert(records) {
        written.push(...records);
        return {
          inserted: 0,
          updated: records.length,
          unchanged: 0,
          skipped_locked: 0,
          rejected: [],
        };
      },
    };
    const raws: string[] = [];
    const result = await runSource(
      createCorpCanadaSource({ files: [FILE_URL], loadCompanies: async () => COMPANIES }),
      {
        mode: sampleSize === null ? 'full' : 'sample',
        sampleSize,
        trigger: 'cli',
        politenessDelayMs: 0,
      },
      {
        store,
        writer,
        raw: ({ runId }) => ({
          store: async (seq, input) => {
            raws.push(input.body);
            return { id: `${runId}-raw-${seq}` };
          },
        }),
        http,
        log: silent,
      },
    );
    return { result, raws, written };
  }

  it('writes every confirmed company and stores no address or business number', async () => {
    const { result, raws, written } = await run(null);
    expect(result.status).toBe('completed');
    expect(written).toHaveLength(4);
    expect(raws).toHaveLength(1);
    expect(raws[0]).not.toMatch(/Example Street|100000001|A1A/);
  });

  it('keeps the first N matches in a sample, after judging every row', async () => {
    const { raws, written } = await run(2);
    expect(written).toHaveLength(2);
    expect(parseEnvelope(raws[0] as string).matches.map((m) => m.slug)).toEqual([
      'agropur',
      'cargill-canada',
    ]);
  });

  it('re-parses a stored envelope to the same records', async () => {
    const { raws, written } = await run(null);
    const parsed = createCorpCanadaSource().parse({
      rawObjectId: null,
      body: raws[0] as string,
      contentType: 'application/json',
      requestUrl: null,
      httpStatus: 200,
      headers: {},
      fetchedAt: FETCHED_AT,
    });
    expect(validateBatch('company_enrichment', parsed.records).valid).toEqual(written);
  });
});
