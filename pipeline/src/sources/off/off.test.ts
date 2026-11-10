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
import { hasBadCheckDigit, imageKeyOf, offGtin, sizeOf, toProductRecord } from './map.ts';

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
  it.each([
    ['946 ml', '946.0', 946, 'ml'],
    ['52 g (1.8 OZ)', '52.0', 52, 'g'],
    ['11.5 FL OZ (340ml)', '340.09525', 340.09525, 'ml'],
    ['1 lb 1.88 oz (506 g)', '453.59237', 453.59237, 'g'],
    ['1,89 L / 64 oz liq', '1890.0', 1890, 'ml'],
    ['0.8899999856948853 l.', '889.999985694885', 889.999985694885, 'ml'],
    ['650g', '650', 650, 'g'],
    ['1 litre', '1000', 1000, 'ml'],
    ['226gm/bottle', '226', 226, 'g'],
  ])('%s → %s %s', (text, quantity, net, unit) => {
    expect(sizeOf(text, quantity)).toEqual({
      net_quantity: net,
      net_unit: unit,
      unit_parse_status: 'ok',
    });
  });

  it.each([
    ['1 can', ''],
    ['100 tablets', '0'],
    ['12 eggs', '12'],
    [null, '500'],
    ['500 g', ''],
  ])('%s with product_quantity %j is unparsed', (text, quantity) => {
    expect(sizeOf(text, quantity).unit_parse_status).toBe('unparsed');
  });

  it('a quantity naming both a volume and a mass is ambiguous', () => {
    expect(sizeOf('1 L (1 kg)', '1000')).toEqual({
      net_quantity: null,
      net_unit: null,
      unit_parse_status: 'ambiguous',
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
      unit_parse_status: 'ok',
      label_codes: ['organic', 'no-gmos', 'non-gmo-project'],
      image_key: '000/857/700/2786/front_en.9.400.jpg',
      source_modified_at: '2026-04-01T13:00:10.000Z',
      source_key: 'off',
      source_url: null,
      fetched_at: FETCHED_AT,
      method: 'import',
      method_version: 'off@1.1.0',
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
