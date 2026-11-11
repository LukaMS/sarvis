// OFF delta files on two saved slices of real delta files: only the fields the source reads, and
// only each product's selected front images (no contributor data, D-012). File 1 has one
// non-Canadian product, one without a name, one with neither a brand nor a category, four that
// pass and a truncated last line; file 2 has one each of the first three and four that pass. The driver tests serve them from a local node:http server.
import { readFileSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { validateBatch } from '@sarvis/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createHttpClient } from '../../http/client.ts';
import { createLogger } from '../../log.ts';
import type { RecordWriter } from '../../runs/driver.ts';
import { runSource } from '../../runs/driver.ts';
import { type MemoryRunStore, createMemoryRunStore } from '../../runs/store.ts';
import type { SourceRow } from '../source.ts';
import { emptyFilterCounts, parseExtract } from './csv.ts';
import {
  createDeltaFilter,
  deltaRow,
  frontImageUrl,
  parseDeltaIndex,
  productFolder,
} from './delta.ts';
import { createOffSource } from './index.ts';
import { toProductRecord } from './map.ts';
import { type StoredProduct, ilikeElement } from './stored.ts';

const fixture = (n: number) =>
  readFileSync(fileURLToPath(new URL(`./fixture.delta-${n}.jsonl`, import.meta.url)), 'utf8');
const FILE_1 = 'openfoodfacts_products_1792217949_1792304521.json.gz';
const FILE_2 = 'openfoodfacts_products_1793254716_1793341341.json.gz';
const silent = createLogger({}, () => {});

// Two delta files for the bad-code duplicate rule (P4.30). Codes ending 9, 6 and 8 pass their check
// digit; the same codes with another last digit don't.
const FILE_3 = 'openfoodfacts_products_1794000000_1794086400.json.gz';
const FILE_4 = 'openfoodfacts_products_1794086400_1794172800.json.gz';
const product = (code: string, name: string, brands: string) =>
  JSON.stringify({
    code,
    product_name: name,
    brands,
    categories_tags: ['en:foods'],
    countries_tags: ['en:canada'],
    last_modified_t: 1794086000,
  });
const DUP_FILE_3 = [
  // A good-code product, new in this run.
  product('0076808011159', 'Oven Roasted Turkey Breast', 'Maple Leaf'),
  // A stored product, renamed by this delta.
  product('0011110020758', 'Pure Vanilla Extract', 'Kirkland'),
].join('\n');
const DUP_FILE_4 = [
  // 1. Duplicates the turkey kept in the earlier file of the run: dropped.
  product('0076808011150', 'OVEN ROASTED  turkey breast', 'Maple Leaf, Prime'),
  // 2. Duplicates a stored active product: dropped, counted as stored.
  product('0008577002787', 'Maple Syrup', 'Kirkland Signature'),
  // 3. A stored bad-code row listed again: it doesn't duplicate itself, so it's kept.
  product('0008577002781', 'Maple Butter', 'Kirkland Signature'),
  // 4. Matches the stored name of the product file 3 renamed: a full run sees the new name, so kept.
  product('0011110020751', 'Imitation Vanilla', 'Kirkland'),
  // 5. Matches only a discontinued product (the lookup returns active ones): kept.
  product('0008577002782', 'Maple Taffy', 'Kirkland Signature'),
].join('\n');
const STORED: (StoredProduct & { status: string })[] = [
  {
    external_id: '0008577002786',
    name: 'maple syrup',
    brand_text: 'Kirkland Signature',
    status: 'active',
  },
  {
    external_id: '0008577002781',
    name: 'Maple Butter',
    brand_text: 'Kirkland Signature',
    status: 'active',
  },
  {
    external_id: '0011110020758',
    name: 'Imitation Vanilla',
    brand_text: 'Kirkland',
    status: 'active',
  },
  {
    external_id: '0008577002780',
    name: 'Maple Taffy',
    brand_text: 'Kirkland Signature',
    status: 'discontinued',
  },
];

function keptRows(n: number) {
  const counts = emptyFilterCounts();
  const keep = createDeltaFilter(counts);
  const rows = fixture(n)
    .split('\n')
    .map(keep)
    .filter((r) => r !== null);
  return { rows, counts };
}

describe('OFF delta index', () => {
  it('lists the files oldest first, as URLs under the delta folder', () => {
    const files = parseDeltaIndex(`${FILE_2}\n${FILE_1}\n\n`);
    expect(files.map((f) => f.name)).toEqual([FILE_1, FILE_2]);
    expect(files[0]).toEqual({
      name: FILE_1,
      url: `https://static.openfoodfacts.org/data/delta/${FILE_1}`,
      from: 1792217949,
      to: 1792304521,
    });
  });

  it('refuses an index with an unexpected entry rather than guess', () => {
    expect(() => parseDeltaIndex(`${FILE_1}\n../secrets.txt\n`)).toThrow(/unexpected entry/);
  });
});

describe('OFF delta records', () => {
  it('builds the image folder as OFF does: padded to 13 digits, split 3/3/3/rest', () => {
    expect(productFolder('0076808011159')).toBe('007/680/801/1159');
    expect(productFolder('00000390')).toBe('000/000/000/0390');
    expect(productFolder('10055325001246')).toBe('100/553/250/01246');
  });

  it('picks the English front image, then the main language, then any other', () => {
    const front = (langs: Record<string, unknown>, lc = 'fr') =>
      frontImageUrl({ lc, images: { selected: { front: langs } } }, '0076808011159');
    const base = 'https://images.openfoodfacts.org/images/products/007/680/801/1159/';
    expect(front({ fr: { rev: '14' }, en: { rev: '8' } })).toBe(`${base}front_en.8.400.jpg`);
    expect(front({ de: { rev: 2 }, fr: { rev: 3 } })).toBe(`${base}front_fr.3.400.jpg`);
    expect(front({ it: { rev: 4 }, de: { rev: 2 } }, 'en')).toBe(`${base}front_de.2.400.jpg`);
    expect(front({ en: { rev: 'x' } })).toBe('');
    expect(frontImageUrl({ images: { uploaded: {} } }, '1')).toBe('');
  });

  it('reads a product as the CSV row the export would give it', () => {
    const row = deltaRow({
      code: '4800092113277',
      product_name: 'Butter Cream-Filled Cracker Sandwich',
      product_name_en: 'rebisco (b)\t32g\nbutter',
      brands: 'Barber',
      categories_tags: ['en:snacks', 'en:biscuits'],
      countries_tags: ['en:canada'],
      quantity: '32g',
      product_quantity: 32,
      last_modified_t: 1793326286,
    });
    expect(row).toEqual({
      code: '4800092113277',
      // The English name wins, and tabs or newlines can't break the extract.
      product_name: 'rebisco (b) 32g butter',
      brands: 'Barber',
      categories_tags: 'en:snacks,en:biscuits',
      labels_tags: '',
      countries_tags: 'en:canada',
      quantity: '32g',
      product_quantity: '32',
      last_modified_t: '1793326286',
      image_url: '',
    });
    expect(deltaRow({ product_name: 'No code' })).toBeNull();
  });

  it('filters as the CSV export does and counts each rule', () => {
    const one = keptRows(1);
    expect(one.counts).toEqual({
      scanned: 8,
      kept: 4,
      dropped: {
        malformed: 1,
        not_canada: 1,
        no_name: 1,
        no_brand_or_category: 1,
        bad_code_duplicate: 0,
      },
    });
    const two = keptRows(2);
    expect(two.counts).toEqual({
      scanned: 7,
      kept: 4,
      dropped: {
        malformed: 0,
        not_canada: 1,
        no_name: 1,
        no_brand_or_category: 1,
        bad_code_duplicate: 0,
      },
    });
  });

  it('maps a real delta product to the record the CSV export gives it', () => {
    const penne = keptRows(2).rows.find((r) => r.code === '0076808011159')!;
    const record = toProductRecord(penne, '2026-10-30T12:00:00.000Z');
    // As stored by the P3.6 full import, which read the same product from the CSV export.
    expect(record).toMatchObject({
      gtin: '00076808011159',
      external_id: '0076808011159',
      name: 'Penne Rigate',
      brand_text: 'Barilla',
      quantity_text: '410 g',
      net_quantity: 410,
      net_unit: 'g',
      unit_parse_status: 'ok',
      image_key: '007/680/801/1159/front_en.8.400.jpg',
      source_url: null,
      method_version: 'off@1.2.0',
    });
  });

  it('every product that passes the filter validates', () => {
    for (const n of [1, 2]) {
      const records = keptRows(n).rows.map((r) => toProductRecord(r, '2026-10-30T12:00:00.000Z'));
      expect(validateBatch('product', records).stats.invalid).toBe(0);
    }
  });
});

describe('OFF delta runs through the driver', () => {
  const SOURCE_ROW: SourceRow = {
    id: 'src-off',
    key: 'off',
    verdict: 'use',
    enabled: true,
    rate_limit_per_sec: 1,
  };
  let server: Server;
  let base: string;
  let index = `${FILE_2}\n${FILE_1}\n`;
  const hits: string[] = [];

  beforeAll(async () => {
    const files = new Map([
      [`/data/delta/${FILE_1}`, gzipSync(fixture(1))],
      [`/data/delta/${FILE_2}`, gzipSync(fixture(2))],
      [`/data/delta/${FILE_3}`, gzipSync(DUP_FILE_3)],
      [`/data/delta/${FILE_4}`, gzipSync(DUP_FILE_4)],
    ]);
    server = createServer((req, res) => {
      const path = req.url ?? '/';
      hits.push(path);
      if (path === '/robots.txt') return res.writeHead(200).end('User-agent: *\nDisallow: /api\n');
      if (path === '/data/delta/index.txt') return res.writeHead(200).end(index);
      const file = files.get(path);
      if (file) return res.writeHead(200, { 'content-type': 'application/gzip' }).end(file);
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/data/delta/`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const lookups: { sourceId: string; names: string[] }[] = [];
  async function findStoredProducts(sourceId: string, names: string[]) {
    lookups.push({ sourceId, names });
    const wanted = new Set(names.map((n) => n.toLowerCase()));
    return STORED.filter((p) => p.status === 'active' && wanted.has(p.name.toLowerCase())).map(
      ({ status: _status, ...p }) => p,
    );
  }

  async function deltaRun(store: MemoryRunStore) {
    const source = createOffSource({ deltaBase: base, extractSize: 3, findStoredProducts });
    const written: { external_id: string }[] = [];
    let deactivateCalls = 0;
    const writer: RecordWriter<'product'> = {
      async upsert(records) {
        written.push(...records);
        return { inserted: records.length, updated: 0, unchanged: 0, skipped_locked: 0 };
      },
      async deactivateUnseen() {
        deactivateCalls++;
        return 0;
      },
    };
    const raws: { url: string; body: string }[] = [];
    const result = await runSource(
      source,
      { mode: 'delta', trigger: 'cli' },
      {
        store,
        writer,
        raw: ({ runId }) => ({
          store: async (seq, input) => {
            const url = input.url ?? '';
            raws.push({ url, body: input.body });
            store.rawUrls.push({ run_id: runId, request_url: url });
            return { id: `${runId}-raw-${seq}` };
          },
        }),
        http: createHttpClient({ cache: null, log: silent }),
        contactEmail: 'test@example.org',
        log: silent,
      },
    );
    return { result, written, raws, deactivateCalls, source };
  }

  it('imports the new files oldest first, then a re-run fetches nothing', async () => {
    const store = createMemoryRunStore({ sources: [SOURCE_ROW] });
    hits.length = 0;
    const first = await deltaRun(store);
    expect(first.result.status).toBe('completed');
    expect(first.result.counts).toMatchObject({ fetched: 8, valid: 8, invalid: 0, inserted: 8 });
    // Each file is split into 3 + 1 rows; every extract names its file.
    expect(first.raws.map((r) => [r.url.split('/').pop(), parseExtract(r.body).length])).toEqual([
      [FILE_1, 3],
      [FILE_1, 1],
      [FILE_2, 3],
      [FILE_2, 1],
    ]);
    // Deltas can't see deletions, so they never deactivate.
    expect(first.deactivateCalls).toBe(0);
    expect(first.result.deactivated).toBeNull();
    const events = store.events.filter((e) => e.event_type === 'off_delta_file');
    expect(events.map((e) => e.details?.file)).toEqual([FILE_1, FILE_2]);
    expect(events[0]?.details).toMatchObject({
      kept: 4,
      index: { listed: 2, alreadyImported: 0, new: 2 },
    });
    // One size event for the whole delta, after the last file's last extract.
    const size = store.events.filter((e) => e.event_type === 'off_size');
    expect(size).toHaveLength(1);
    expect(size[0]?.details).toMatchObject({ rows: 8 });
    // A stored extract re-parses to the records that were written.
    const reparsed = first.source.parse({
      rawObjectId: 'x',
      body: first.raws[2]!.body,
      contentType: 'text/tab-separated-values',
      requestUrl: first.raws[2]!.url,
      httpStatus: 200,
      headers: {},
      fetchedAt: '2026-10-30T12:00:00.000Z',
    });
    expect(reparsed.records.map((r) => (r as { external_id: string }).external_id)).toEqual(
      first.written.slice(4, 7).map((r) => r.external_id),
    );

    hits.length = 0;
    const second = await deltaRun(store);
    expect(second.result.status).toBe('completed');
    expect(second.result.counts).toMatchObject({ fetched: 0, inserted: 0, updated: 0 });
    expect(second.raws).toHaveLength(0);
    expect(hits.filter((h) => h.endsWith('.json.gz'))).toEqual([]);
  }, 20_000);

  it('fetches only the file published since, and again the files of a failed run', async () => {
    const store = createMemoryRunStore({ sources: [SOURCE_ROW] });
    index = `${FILE_1}\n`;
    const first = await deltaRun(store);
    expect(first.raws.map((r) => r.url.split('/').pop())).toEqual([FILE_1, FILE_1]);

    index = `${FILE_2}\n${FILE_1}\n`;
    const second = await deltaRun(store);
    expect(second.raws.map((r) => r.url.split('/').pop())).toEqual([FILE_2, FILE_2]);

    // A run that didn't complete doesn't count: its files come back next time.
    store.runs.at(-1)!.status = 'failed';
    const third = await deltaRun(store);
    expect(third.raws.map((r) => r.url.split('/').pop())).toEqual([FILE_2, FILE_2]);
  }, 20_000);

  it('drops a bad-code row that duplicates a row kept earlier in the run or a stored product', async () => {
    const store = createMemoryRunStore({ sources: [SOURCE_ROW] });
    index = `${FILE_4}\n${FILE_3}\n`;
    lookups.length = 0;
    const run = await deltaRun(store);
    expect(run.result.status).toBe('completed');
    expect(run.written.map((r) => r.external_id)).toEqual([
      '0076808011159',
      '0011110020758',
      '0008577002781',
      '0011110020751',
      '0008577002782',
    ]);
    // File 3 holds no bad codes, so only file 4 looks anything up, once, with its held names.
    expect(lookups).toEqual([
      {
        sourceId: 'src-off',
        names: [
          'OVEN ROASTED turkey breast',
          'Maple Syrup',
          'Maple Butter',
          'Imitation Vanilla',
          'Maple Taffy',
        ],
      },
    ]);
    const events = store.events.filter((e) => e.event_type === 'off_delta_file');
    expect(events.map((e) => e.details?.file)).toEqual([FILE_3, FILE_4]);
    expect(events[1]?.details).toMatchObject({
      kept: 3,
      dropped: { bad_code_duplicate: 2 },
      bad_code_duplicate_of_stored: 1,
    });
    expect(events[0]?.details).toMatchObject({ bad_code_duplicate_of_stored: 0 });
  }, 20_000);
});

describe('stored-product lookup', () => {
  it('quotes a name as an exact ilike array element', () => {
    expect(ilikeElement('Maple Syrup')).toBe('"Maple Syrup"');
    // LIKE escapes first (\% \_ \\), then the array element's (\\ and \").
    expect(ilikeElement('50% less, "lite"')).toBe('"50\\\\% less, \\"lite\\""');
    expect(ilikeElement('a_b\\c')).toBe('"a\\\\_b\\\\\\\\c"');
  });
});
