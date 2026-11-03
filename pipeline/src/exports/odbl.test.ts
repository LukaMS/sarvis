import { gunzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  type ExportFile,
  type ExportStore,
  type OdblContext,
  type OdblTables,
  buildOdblFiles,
  csvField,
  exportIdOf,
  exportsToPrune,
  publishOdbl,
  resolvedUrl,
  toCsv,
} from './odbl.ts';

const CTX: OdblContext = {
  sources: {
    off: { id: 'src-off', url_template: 'https://world.openfoodfacts.org/product/{external_id}' },
    openPrices: {
      id: 'src-op',
      url_template: 'https://prices.openfoodfacts.org/prices/{external_id}',
    },
  },
  labels: new Map([
    [1, 'organic'],
    [2, 'fair-trade'],
  ]),
};

const TABLES: OdblTables = {
  products: [
    {
      id: 'p1',
      external_id: '0069276130088',
      gtin: '00069276130088',
      name: 'Pop, "Diet", 12 × 355 ml',
      brand_text: 'Brand A,Brand B',
      quantity_text: '12 x 355 ml',
      net_quantity: 4260,
      net_unit: 'ml',
      pack_count: 12,
      label_codes: [2, 1, 99],
      status: 'active',
      source_modified_at: '2025-01-02T03:04:05+00:00',
      fetched_at: '2026-11-01T00:00:00+00:00',
      source_url: null,
    },
  ],
  stores: [
    {
      id: 's1',
      osm_type: 'relation',
      osm_id: 7391902,
      name: 'Walmart',
      address: 'Princess Street',
      city: 'New Westminster',
      province: 'BC',
      postal_code: 'V3M 6T9',
      lat: 49.21,
      lon: -122.92,
      status: 'active',
      fetched_at: '2026-11-03T00:00:00+00:00',
      source_url: 'https://prices.openfoodfacts.org/locations/604',
    },
  ],
  prices: [
    {
      id: 117,
      external_id: '108266',
      observed_on: '2025-05-06',
      last_confirmed_on: null,
      price: 3.97,
      currency: 'CAD',
      price_kind: 'sale',
      is_discounted: true,
      price_without_discount: 4.97,
      price_per: null,
      fetched_at: '2026-11-03T00:00:00+00:00',
      source_url: null,
      stores: { osm_type: 'relation', osm_id: 7391902 },
      products: { gtin: '00069276130088', external_id: '0069276130088' },
    },
  ],
};

const AT = new Date('2026-11-03T15:30:12.345Z');
const text = (f: ExportFile | undefined) =>
  f?.name.endsWith('.gz')
    ? gunzipSync(f.body).toString('utf8')
    : Buffer.from(f?.body ?? []).toString('utf8');

describe('CSV', () => {
  it('quotes only fields that need it, and leaves null empty', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
    expect(csvField(null)).toBe('');
    expect(csvField(0)).toBe('0');
    expect(csvField(false)).toBe('false');
  });

  it('writes a header and CRLF lines', () => {
    const csv = toCsv(
      [{ a: 1, b: 'x,y' }],
      [
        { header: 'a', value: (r) => r.a as number },
        { header: 'b', value: (r) => r.b as string },
      ],
    );
    expect(csv).toBe('a,b\r\n1,"x,y"\r\n');
  });

  it('resolves a null source_url from the template', () => {
    expect(resolvedUrl({ source_url: null, external_id: '42' }, CTX.sources.openPrices)).toBe(
      'https://prices.openfoodfacts.org/prices/42',
    );
    expect(resolvedUrl({ source_url: 'https://x.org/1', external_id: '42' }, undefined)).toBe(
      'https://x.org/1',
    );
    expect(
      resolvedUrl({ source_url: null, external_id: '42' }, { id: 'x', url_template: null }),
    ).toBeNull();
  });
});

describe('ODbL files', () => {
  const files = buildOdblFiles(TABLES, CTX, AT);
  const byName = new Map(files.map((f) => [f.name, f]));

  it('builds three CSV.gz files and a README, README last', () => {
    expect(files.map((f) => f.name)).toEqual([
      'products.csv.gz',
      'stores.csv.gz',
      'price_observations.csv.gz',
      'README.md',
    ]);
    expect(files.map((f) => f.rows)).toEqual([1, 1, 1, undefined]);
  });

  it('products: OFF code, label codes, the rebuilt OFF URL, no internal id', () => {
    const [header, row] = text(byName.get('products.csv.gz')).split('\r\n');
    expect(header).toBe(
      'code,gtin,name,brands,quantity,net_quantity,net_unit,pack_count,labels,status,' +
        'off_last_modified,fetched_at,source_url',
    );
    expect(row).toBe(
      '0069276130088,00069276130088,"Pop, ""Diet"", 12 × 355 ml","Brand A,Brand B",12 x 355 ml,' +
        '4260,ml,12,fair-trade;organic,active,2025-01-02T03:04:05+00:00,2026-11-01T00:00:00+00:00,' +
        'https://world.openfoodfacts.org/product/0069276130088',
    );
    expect(text(byName.get('products.csv.gz'))).not.toContain('p1');
  });

  it('prices join to stores by OSM key and to products by code', () => {
    const [header, row] = text(byName.get('price_observations.csv.gz')).split('\r\n');
    expect(header).toBe(
      'price_id,store_osm_type,store_osm_id,product_gtin,product_code,observed_on,' +
        'last_confirmed_on,price,currency,price_kind,is_discounted,price_without_discount,' +
        'price_per,fetched_at,source_url',
    );
    expect(row).toBe(
      '108266,relation,7391902,00069276130088,0069276130088,2025-05-06,,3.97,CAD,sale,true,4.97,,' +
        '2026-11-03T00:00:00+00:00,https://prices.openfoodfacts.org/prices/108266',
    );
    expect(text(byName.get('stores.csv.gz')).split('\r\n')[1]).toBe(
      'relation,7391902,Walmart,Princess Street,New Westminster,BC,V3M 6T9,49.21,-122.92,active,' +
        '2026-11-03T00:00:00+00:00,https://prices.openfoodfacts.org/locations/604',
    );
  });

  it('the README names the licence, the sources, the date and the counts', () => {
    const readme = text(byName.get('README.md'));
    expect(readme).toContain('Open Database License (ODbL) v1.0');
    expect(readme).toContain('https://opendatacommons.org/licenses/odbl/1-0/');
    expect(readme).toContain('Open Food Facts');
    expect(readme).toContain('Open Prices');
    expect(readme).toContain('2026-11-03');
    expect(readme).toMatch(/`products\.csv\.gz` \| 1 \|/);
    expect(readme).toMatch(/no Sarvis user data/);
  });
});

describe('publishing', () => {
  it('names exports by UTC time, so they sort', () => {
    expect(exportIdOf(AT)).toBe('20261103T153012Z');
  });

  it('keeps the newest two folders', () => {
    expect(exportsToPrune(['20261101T000000Z', '20261103T000000Z', '20261102T000000Z'])).toEqual([
      '20261101T000000Z',
    ]);
    expect(exportsToPrune(['20261101T000000Z'])).toEqual([]);
  });

  function memoryStore(initial: string[] = []) {
    const objects = new Set(initial);
    const store: ExportStore = {
      async upload(path) {
        if (path.endsWith('fail.csv.gz')) throw new Error('upload failed');
        objects.add(path);
      },
      async list(prefix) {
        const names = new Set<string>();
        for (const o of objects)
          if (o.startsWith(`${prefix}/`)) names.add(o.slice(prefix.length + 1).split('/')[0]!);
        return [...names];
      },
      async remove(paths) {
        for (const p of paths) objects.delete(p);
      },
      publicUrl: (path) => `https://example.org/public/${path}`,
    };
    return { store, objects };
  }

  it('uploads a folder and deletes all but the latest two', async () => {
    const files = buildOdblFiles(TABLES, CTX, AT);
    const { store, objects } = memoryStore([
      'odbl/20261101T000000Z/products.csv.gz',
      'odbl/20261101T000000Z/README.md',
      'odbl/20261102T000000Z/README.md',
    ]);
    const result = await publishOdbl(store, files, AT);
    expect(result.exportId).toBe('20261103T153012Z');
    expect(result.pruned).toEqual(['20261101T000000Z']);
    expect(result.kept).toEqual(['20261103T153012Z', '20261102T000000Z']);
    expect([...objects].sort()).toEqual([
      'odbl/20261102T000000Z/README.md',
      'odbl/20261103T153012Z/README.md',
      'odbl/20261103T153012Z/price_observations.csv.gz',
      'odbl/20261103T153012Z/products.csv.gz',
      'odbl/20261103T153012Z/stores.csv.gz',
    ]);
    expect(result.files[0]?.url).toBe(
      'https://example.org/public/odbl/20261103T153012Z/products.csv.gz',
    );
  });

  it('a failed upload removes its partial folder and deletes nothing old', async () => {
    const files = buildOdblFiles(TABLES, CTX, AT);
    files.splice(1, 0, { ...files[0]!, name: 'fail.csv.gz' });
    const { store, objects } = memoryStore(['odbl/20261101T000000Z/README.md']);
    await expect(publishOdbl(store, files, AT)).rejects.toThrow('upload failed');
    expect([...objects]).toEqual(['odbl/20261101T000000Z/README.md']);
  });
});
