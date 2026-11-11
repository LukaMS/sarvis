// The OFF source on a saved slice of the real CSV export: the real 211-column header and real
// rows, with every column the source doesn't read blanked (no contributor names, D-012). The
// slice has one non-Canadian row, one truncated line, one Canadian row without a name, one with
// neither a brand nor a category, and six that pass. No network.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateBatch } from '@sarvis/core';
import { describe, expect, it } from 'vitest';

import { createHttpClient } from '../../http/client.ts';
import { createLogger } from '../../log.ts';
import type { RecordWriter } from '../../runs/driver.ts';
import { runSource } from '../../runs/driver.ts';
import { createMemoryRunStore } from '../../runs/store.ts';
import type { SourceRow } from '../source.ts';
import {
  EXTRACT_COLUMNS,
  type OffRow,
  createBadCodeGate,
  createRowFilter,
  duplicateKey,
  emptyFilterCounts,
  headerIndex,
  parseExtract,
  toExtract,
} from './csv.ts';
import { createOffSource } from './index.ts';
import {
  emptySizeTally,
  hasBadCheckDigit,
  imageKeyOf,
  offGtin,
  offSize,
  sizeFromName,
  tallySizes,
  toProductRecord,
} from './map.ts';

const FIXTURE = fileURLToPath(new URL('./fixture.products.tsv', import.meta.url));
const FETCHED_AT = '2026-10-30T12:00:00.000Z';
const silent = createLogger({}, () => {});

function fixtureRows() {
  const [header = '', ...lines] = readFileSync(FIXTURE, 'utf8').split('\n');
  const counts = emptyFilterCounts();
  const keep = createRowFilter(header, counts);
  const rows = lines.map(keep).filter((r): r is OffRow => r !== null);
  return { header, rows, counts };
}

describe('OFF CSV filter', () => {
  it('reads the real header and keeps Canadian rows with a name and a brand or category', () => {
    const { header, rows, counts } = fixtureRows();
    expect(headerIndex(header).width).toBe(211);
    expect(counts).toEqual({
      scanned: 10,
      kept: 6,
      dropped: {
        malformed: 1,
        not_canada: 1,
        no_name: 1,
        no_brand_or_category: 1,
        bad_code_duplicate: 0,
      },
    });
    expect(rows.map((r) => r.code)).toEqual([
      '0008577002786',
      '0009800800056',
      '0011110020758',
      '0016000431010',
      '0048001353664',
      '00202428',
    ]);
  });

  it('drops NUL characters, which Postgres text cannot hold', () => {
    const [header = '', ...lines] = readFileSync(FIXTURE, 'utf8').split('\n');
    const line = lines.find((l) => l.startsWith('0008577002786\t')) ?? '';
    expect(line).toContain('Maple');
    const keep = createRowFilter(header, emptyFilterCounts());
    const row = keep(line.replace('Maple', 'Ma\u0000ple'));
    expect(row?.product_name).toBe(keep(line)?.product_name);
    expect(row?.product_name).not.toContain('\u0000');
  });

  it('refuses a header without a column it needs', () => {
    expect(() => headerIndex('code\tproduct_name')).toThrow(/brands/);
  });

  it('stores only the parsed columns, and the extract reads back to the same rows', () => {
    const { rows } = fixtureRows();
    const extract = toExtract(rows);
    expect(extract.split('\n')[0]).toBe(EXTRACT_COLUMNS.join('\t'));
    expect(parseExtract(extract)).toEqual(rows);
    expect(parseExtract(toExtract([]))).toEqual([]);
  });
});

/** The fixture with two copies of real rows under codes that fail their check digit, read first. */
function badCodeFixture(): string {
  const [header = '', ...lines] = readFileSync(FIXTURE, 'utf8').split('\n');
  const copy = (code: string, as: string, edit = (l: string) => l) => {
    const line = lines.find((l) => l.startsWith(`${code}\t`) && l.split('\t').length > 200);
    return edit((line ?? '').replace(`${code}\t`, `${as}\t`));
  };
  const extra = [
    // The maple syrup again: a duplicate of a kept product, so it's dropped.
    copy('0008577002786', '0008577002787'),
    // Another vanilla: a new product, kept without a GTIN.
    copy('0011110020758', '0011110020759', (l) =>
      l.replace('Imitation vanilla flavor', 'Pure vanilla extract'),
    ),
  ];
  const path = join(mkdtempSync(join(tmpdir(), 'off-bad-code-')), 'products.tsv');
  writeFileSync(path, [header, ...extra, ...lines].join('\n'));
  return path;
}

describe('OFF codes', () => {
  it('reads UPC-E as its UPC-A, and keeps no GTIN for restricted or bad codes (D-077, D-078)', () => {
    expect(offGtin('04139344')).toBe('00041390000034');
    expect(offGtin('0008577002786')).toBe('00008577002786');
    expect(offGtin('0008577002787')).toBeNull();
    expect(hasBadCheckDigit('0008577002787')).toBe(true);
    expect(offGtin('2012345000001')).toBeNull();
    expect(hasBadCheckDigit('2012345000001')).toBe(false);
    expect(hasBadCheckDigit('4011')).toBe(false);
  });

  it('holds bad-code rows to the end and drops those that duplicate a kept row', () => {
    const { rows } = fixtureRows();
    const counts = { ...emptyFilterCounts(), kept: rows.length + 3 };
    const gate = createBadCodeGate(counts);
    const bad = (row: OffRow, code: string, name = row.product_name) => ({
      ...row,
      code,
      product_name: name,
    });
    const maple = rows[0]!;
    const held = [
      // Same name and first brand once accents, case and spacing are folded.
      bad(maple, '0008577002787', `  ${maple.product_name.toUpperCase()} `),
      bad(maple, '0008577002788', 'Maple Syrup Amber'),
      bad(maple, '0008577002789', 'Maple Syrup Amber'),
    ];
    expect(gate.admit(held[0]!)).toBeNull();
    for (const row of rows) expect(gate.admit(row)).toBe(row);
    expect(gate.admit(held[1]!)).toBeNull();
    expect(gate.admit(held[2]!)).toBeNull();
    expect(gate.release().map((r) => r.code)).toEqual(['0008577002788']);
    expect(gate.release()).toEqual([]);
    expect(counts.kept).toBe(rows.length + 1);
    expect(counts.dropped.bad_code_duplicate).toBe(2);
    expect(duplicateKey(held[0]!)).toBe(duplicateKey(maple));
    expect(duplicateKey({ ...maple, brands: 'Other' })).not.toBe(duplicateKey(maple));
  });
});

describe('OFF mapping', () => {
  const ok = (net: number, unit: string, pack: number | null = null) => ({
    net_quantity: net,
    net_unit: unit,
    pack_count: pack,
    unit_parse_status: 'ok',
  });

  it.each([
    // OFF's number agrees with the text (within 2%), so it's kept.
    ['946 ml', '946.0', ok(946, 'ml'), 'off_number'],
    ['52 g (1.8 OZ)', '52.0', ok(52, 'g'), 'off_number'],
    ['11.5 FL OZ (340ml)', '340.09525', ok(340.09525, 'ml'), 'off_number'],
    ['1,89 L / 64 oz liq', '1890.0', ok(1890, 'ml'), 'off_number'],
    ['12 oz', '340', ok(340, 'g'), 'off_number'],
    ['4 x 100 g', '400', ok(400, 'g', 4), 'off_number'],
    // OFF has no number, or a count: the text alone.
    ['500 g', '', ok(500, 'g'), 'text'],
    ['12 eggs', '12', ok(12, 'ct'), 'text'],
    ['2 x 6 x 355 mL', '', ok(4260, 'ml', 12), 'text'],
    // They disagree: ours wins (OFF read only one item of the pack, or a different unit).
    ['4 x 100 g', '100', ok(400, 'g', 4), 'disagrees'],
    ['1 lb 1.88 oz (506 g)', '453.59237', ok(506, 'g'), 'disagrees'],
  ])('%s with product_quantity %j → %o (%s)', (text, quantity, fields, origin) => {
    const size = offSize(text, quantity, 'Anything 999 g');
    expect(size.fields).toEqual(fields);
    expect(size.origin).toBe(origin);
    expect(size.reason).toBeNull();
  });

  it.each([
    ['Unknown Quantity', '', 'unparsed', 'no_size'],
    ['100 tablets', '0', 'ok', null],
    ['1', '1000', 'unparsed', 'bare_number'],
    ['1 L (1 kg)', '1000', 'ambiguous', 'mass_and_volume'],
    ['300 mg', '0.3', 'unparsed', 'dose_only'],
  ])('%s with product_quantity %j is %s', (text, quantity, status, reason) => {
    const size = offSize(text, quantity, null);
    expect(size.fields.unit_parse_status).toBe(status);
    expect(size.reason).toBe(reason);
    if (status !== 'ok') {
      // OFF's number never stands in for a size the text doesn't give.
      expect(size.fields).toMatchObject({ net_quantity: null, net_unit: null, pack_count: null });
      expect(size.origin).toBe('none');
    }
  });

  it.each([
    ['Ruccola Salat 75g', ok(75, 'g')],
    ['Ristorante spinach pizza 390g pack', ok(390, 'g')],
    ['Iams healthy kitten 1.59kg', ok(1590, 'g')],
    ['Tropicana Orange Juice Homestyle 1.89L', ok(1890, 'ml')],
    ['White Baguette (360g)', ok(360, 'g')],
    ['Life smart fat free chicken broth 250 ml', ok(250, 'ml')],
    ['Unsweetened Applesauce 620ml Can', ok(620, 'ml')],
    ['Riviera lactose free white cheddar 375gr.', ok(375, 'g')],
    ['Cape Cod Chips 28g Bags', ok(28, 'g')],
    ['Fromage Romano râpé très fin 140 g', ok(140, 'g')],
  ])('a blank quantity reads the size at the end of %j', (name, fields) => {
    expect(offSize(null, '', name)).toEqual({ fields, origin: 'name', reason: null });
  });

  it.each([
    '18g Protein Milk',
    'Silk Protein 18g',
    'Greek Yogourt Pro 19g',
    'Boost Mega 20g',
    "Siggi's Creamy Skyr 12g No Sugar Pain Yogurt",
    "Dempster's 14g/2slices Protein Bread",
    'Cheerios 1g de sucre',
    'Oat Beverage, 0g Sugar Vanilla',
    'Selection 2L Grape Flavored Soda',
    'comp evapirated milk 354ml 2%',
    'Coca-Cola zero 450ml fl oz',
    'Chips 200g or 400g',
    'Mixed nuts sugar 30 g',
    'Lemonade',
    '',
  ])('a blank quantity leaves %j without a size', (name) => {
    expect(sizeFromName(name)).toBeNull();
    expect(offSize(null, '500', name)).toMatchObject({ origin: 'none', reason: 'empty' });
  });

  it('marks a size read from the name in the method version', () => {
    const { rows } = fixtureRows();
    const row = { ...rows[0]!, quantity: '', product_name: 'Maple Syrup 540 ml' };
    expect(toProductRecord(row, FETCHED_AT)).toMatchObject({
      quantity_text: null,
      ...ok(540, 'ml'),
      method_version: 'off@1.2.0+size-from-name',
    });
  });

  it('tallies where sizes came from, with examples of disagreements', () => {
    const { rows } = fixtureRows();
    const base = rows[0]!;
    const tally = emptySizeTally();
    tallySizes(tally, [
      { ...base, quantity: '946 ml', product_quantity: '946' },
      { ...base, code: '1', quantity: '4 x 100 g', product_quantity: '100' },
      { ...base, quantity: '', product_name: 'Soup 540 ml' },
      { ...base, quantity: '1', product_quantity: '1' },
    ]);
    expect(tally).toMatchObject({
      rows: 4,
      byOrigin: { off_number: 1, text: 0, disagrees: 1, name: 1, none: 1 },
      byStatus: { ok: 3, unparsed: 1, ambiguous: 0 },
      byReason: { bare_number: 1 },
      disagreements: [
        { code: '1', quantity: '4 x 100 g', product_quantity: '100', ours: '400 g (pack 4)' },
      ],
    });
  });

  it('keeps the image path after the OFF image base', () => {
    expect(
      imageKeyOf(
        'https://images.openfoodfacts.org/images/products/000/857/700/2786/front_en.9.400.jpg',
      ),
    ).toBe('000/857/700/2786/front_en.9.400.jpg');
    expect(imageKeyOf('')).toBeNull();
    expect(imageKeyOf('https://example.com/x.jpg')).toBeNull();
  });

  it('maps a real row to a product record with provenance', () => {
    const { rows } = fixtureRows();
    expect(toProductRecord(rows[0]!, FETCHED_AT)).toEqual({
      gtin: '00008577002786',
      external_id: '0008577002786',
      name: 'Organic Vermont Maple Syrup Grade A Dark Color Robust Taste',
      brand_text: 'usda organic Butternut Mountain Farm,Butternut Mountain Farm',
      quantity_text: '946 ml',
      net_quantity: 946,
      net_unit: 'ml',
      pack_count: null,
      unit_parse_status: 'ok',
      label_codes: ['organic', 'no-gmos', 'non-gmo-project'],
      image_key: '000/857/700/2786/front_en.9.400.jpg',
      source_modified_at: '2026-04-01T13:00:10.000Z',
      source_key: 'off',
      source_url: null,
      fetched_at: FETCHED_AT,
      method: 'import',
      method_version: 'off@1.2.0',
    });
  });

  it('every row that passes the filter validates', () => {
    const { rows } = fixtureRows();
    const batch = validateBatch(
      'product',
      rows.map((r) => toProductRecord(r, FETCHED_AT)),
    );
    expect(batch.stats).toMatchObject({ valid: 6, invalid: 0 });
    const kombucha = batch.valid.find((r) => r.external_id === '00202428');
    // 00202428 is valid as EAN-8 and as UPC-E, and UPC-E wins (D-078).
    expect(kombucha).toMatchObject({ gtin: '00002200000248', brand_text: null });
  });
});

describe('OFF source through the driver', () => {
  const SOURCE_ROW: SourceRow = {
    id: 'src-off',
    key: 'off',
    verdict: 'use',
    enabled: true,
    rate_limit_per_sec: 1,
  };

  async function run(mode: 'sample' | 'full', sampleSize: number | null) {
    const source = createOffSource({ csvUrl: FIXTURE, extractSize: 4 });
    const store = createMemoryRunStore({ sources: [SOURCE_ROW] });
    const written: unknown[] = [];
    const seen: string[] = [];
    const writer: RecordWriter<'product'> = {
      async upsert(records) {
        written.push(...records);
        return { inserted: records.length, updated: 0, unchanged: 0, skipped_locked: 0 };
      },
      async deactivateUnseen(ctx) {
        seen.push(...ctx.seen);
        return 0;
      },
    };
    const raws: string[] = [];
    const result = await runSource(
      source,
      { mode, sampleSize, trigger: 'cli' },
      {
        store,
        writer,
        raw: () => ({
          store: async (seq, input) => {
            raws.push(input.body);
            return { id: `raw-${seq}` };
          },
        }),
        http: createHttpClient({ cache: null, log: silent }),
        contactEmail: 'test@example.org',
        log: silent,
      },
    );
    return { result, store, written, raws, seen };
  }

  it('a full run splits the extract into parts and logs the filter counts', async () => {
    const { result, store, written, raws, seen } = await run('full', null);
    expect(result.status).toBe('completed');
    // Every kept code counts as seen, so deactivation only touches products that left the set.
    expect(result.deactivated).toBe(0);
    expect(seen.sort()).toEqual(
      (written as { external_id: string }[]).map((r) => r.external_id).sort(),
    );
    expect(result.counts).toMatchObject({ fetched: 6, valid: 6, invalid: 0, inserted: 6 });
    expect(raws.map((b) => b.trim().split('\n').length - 1)).toEqual([4, 2]);
    expect(written).toHaveLength(6);
    const filter = store.events.filter((e) => e.event_type === 'off_filter');
    expect(filter.at(-1)?.details).toMatchObject({
      scanned: 10,
      kept: 6,
      dropped: {
        malformed: 1,
        not_canada: 1,
        no_name: 1,
        no_brand_or_category: 1,
        bad_code_duplicate: 0,
      },
    });
    expect(store.runs[0]?.dump_url).toBe(FIXTURE);
    // One size event, after the last part, over every kept row.
    const size = store.events.filter((e) => e.event_type === 'off_size');
    expect(size).toHaveLength(1);
    expect(size[0]?.details).toMatchObject({ rows: 6 });
  });

  it('writes bad-code rows last, without a GTIN, and drops the duplicates', async () => {
    const source = createOffSource({ csvUrl: badCodeFixture(), extractSize: 4 });
    const store = createMemoryRunStore({ sources: [SOURCE_ROW] });
    const written: { external_id: string; gtin: string | null; name: string }[] = [];
    const result = await runSource(
      source,
      { mode: 'full', sampleSize: null, trigger: 'cli' },
      {
        store,
        writer: {
          async upsert(records) {
            written.push(...(records as typeof written));
            return { inserted: records.length, updated: 0, unchanged: 0, skipped_locked: 0 };
          },
          deactivateUnseen: async () => 0,
        },
        raw: () => ({ store: async (seq) => ({ id: `raw-${seq}` }) }),
        http: createHttpClient({ cache: null, log: silent }),
        contactEmail: 'test@example.org',
        log: silent,
      },
    );
    expect(result.status).toBe('completed');
    expect(result.counts).toMatchObject({ fetched: 7, valid: 7, invalid: 0 });
    expect(written.at(-1)).toMatchObject({
      external_id: '0011110020759',
      gtin: null,
      name: 'Pure vanilla extract',
    });
    expect(written.map((r) => r.external_id)).not.toContain('0008577002787');
    const filter = store.events.filter((e) => e.event_type === 'off_filter');
    expect(filter.at(-1)?.details).toMatchObject({
      scanned: 12,
      kept: 7,
      dropped: { bad_code_duplicate: 1 },
    });
  });

  it('a sample stops reading once it has enough rows', async () => {
    const { result, store, raws, seen } = await run('sample', 3);
    expect(result.status).toBe('completed');
    expect(result.deactivated).toBeNull();
    expect(seen).toEqual([]);
    expect(result.counts).toMatchObject({ fetched: 3, inserted: 3 });
    expect(raws).toHaveLength(1);
    const filter = store.events.find((e) => e.event_type === 'off_filter');
    // Rows 1–5 give three keepers; the rest of the file is never read.
    expect(filter?.details).toMatchObject({ scanned: 5, kept: 3 });
  });

  it('refuses to run without a contact email', async () => {
    const source = createOffSource({ csvUrl: FIXTURE });
    const store = createMemoryRunStore({ sources: [SOURCE_ROW] });
    await expect(
      runSource(
        source,
        { mode: 'sample', sampleSize: 1, trigger: 'cli' },
        {
          store,
          writer: {
            upsert: async () => ({ inserted: 0, updated: 0, unchanged: 0, skipped_locked: 0 }),
          },
          raw: () => ({ store: async () => ({ id: 'x' }) }),
          log: silent,
        },
      ),
    ).rejects.toThrow(/PIPELINE_CONTACT_EMAIL/);
    expect(store.runs).toHaveLength(0);
  });
});
