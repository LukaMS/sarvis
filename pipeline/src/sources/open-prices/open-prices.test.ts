// The Open Prices source on saved slices of the real dumps (2026-11-02), contributor fields
// nulled (D-012). Locations: four Canadian stores, one in the US, one online, one OSM place
// Open Prices hasn't enriched (no country). Prices: six CAD product prices at the Canadian
// stores (one with a bad check digit, as Open Prices has it), a category price, a duplicate, one at the US store, one online, two in EUR and a
// truncated line. No network.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { type RecordKind, validateBatch } from '@sarvis/core';
import { describe, expect, it } from 'vitest';

import { createHttpClient } from '../../http/client.ts';
import { createLogger } from '../../log.ts';
import type { RecordWriter, RejectedRecord } from '../../runs/driver.ts';
import { runSource } from '../../runs/driver.ts';
import { createMemoryRunStore } from '../../runs/store.ts';
import type { SourceRow } from '../source.ts';
import { createOpenPricesSource, sampleOf } from './index.ts';
import {
  addressOf,
  type OpLocation,
  type OpPrice,
  emptyLocationCounts,
  emptyPriceCounts,
  keepLocation,
  keepPrice,
  parseExtract,
  provinceOf,
  storeSlugOf,
  toExtract,
  toPriceRecord,
  toStoreRecord,
} from './map.ts';

const PRICES = fileURLToPath(new URL('./fixture.prices.jsonl', import.meta.url));
const LOCATIONS = fileURLToPath(new URL('./fixture.locations.jsonl', import.meta.url));
const FETCHED_AT = '2026-11-03T12:00:00.000Z';
const silent = createLogger({}, () => {});

const lines = (path: string) => readFileSync(path, 'utf8').split('\n');

function fixture() {
  const locationCounts = emptyLocationCounts();
  const stores = new Map<number, OpLocation>();
  for (const line of lines(LOCATIONS)) {
    const l = keepLocation(line, locationCounts);
    if (l) stores.set(l.id, l);
  }
  const priceCounts = emptyPriceCounts();
  const prices = lines(PRICES)
    .map((line) => keepPrice(line, stores, priceCounts))
    .filter((p): p is OpPrice => p !== null);
  return { stores, prices, locationCounts, priceCounts };
}

describe('Open Prices filters', () => {
  it('keeps Canadian OSM locations with a name', () => {
    const { stores, locationCounts } = fixture();
    expect(locationCounts).toEqual({
      scanned: 7,
      kept: 4,
      dropped: { malformed: 0, not_osm: 1, not_canada: 2, no_name: 0 },
    });
    expect([...stores.keys()]).toEqual([604, 605, 852, 7573]);
  });

  it('keeps CAD product prices at kept stores, and counts every drop', () => {
    const { prices, priceCounts } = fixture();
    expect(priceCounts).toEqual({
      scanned: 13,
      kept: 6,
      dropped: {
        malformed: 1,
        not_cad: 2,
        no_product_code: 1,
        duplicate: 1,
        no_canadian_store: 2,
      },
    });
    expect(prices.map((p) => p.id)).toEqual([108266, 44537, 44540, 30225, 29477, 44417]);
  });

  it('never keeps the contributor or their comment, and the extract reads back', () => {
    const { stores, prices } = fixture();
    const extract = toExtract([
      ...[...stores.values()].map((location) => ({ location })),
      ...prices.map((price) => ({ price })),
    ]);
    expect(extract).not.toMatch(/owner|proof|"source"/);
    expect(parseExtract(extract)).toHaveLength(10);
    expect(parseExtract(toExtract([]))).toEqual([]);
  });
});

describe('Open Prices mapping', () => {
  it('maps a location to a store keyed on OSM, with the province from the postal code', () => {
    const { stores } = fixture();
    const record = toStoreRecord(stores.get(604) as OpLocation, FETCHED_AT);
    expect(record).toMatchObject({
      banner_slug: null,
      slug: 'walmart-new-westminster-r7391902',
      name: 'Walmart',
      city: 'New Westminster',
      province: 'BC',
      postal_code: 'V3M 6T9',
      osm_type: 'relation',
      osm_id: 7391902,
      source_key: 'open-prices',
      source_url: 'https://prices.openfoodfacts.org/locations/604',
      method: 'import',
      method_version: 'open-prices@1.0.1',
    });
    // The street part only: the city, province and postal code have their own columns.
    expect(record.address).toBe('Princess Street');
    expect(record.lat).toBeCloseTo(49.2, 0);
  });

  it('maps a price to its store and GTIN, with the kind from the discount', () => {
    const { prices } = fixture();
    const [discounted, regular] = prices.map((p) => toPriceRecord(p, FETCHED_AT));
    expect(discounted).toMatchObject({
      external_id: '108266',
      store: { osm_type: 'relation', osm_id: 7391902 },
      product: { gtin: '00069276130088' },
      observed_on: '2025-05-06',
      price: 3.97,
      currency: 'CAD',
      price_kind: 'sale',
      is_discounted: true,
      // Rebuilt from the source's url_template.
      source_url: null,
    });
    expect(regular).toMatchObject({ price_kind: 'regular', is_discounted: false, price: 5.97 });
  });

  it('every kept store and price validates', () => {
    const { stores, prices } = fixture();
    const s = validateBatch(
      'store',
      [...stores.values()].map((l) => toStoreRecord(l, FETCHED_AT)),
    );
    const p = validateBatch(
      'price_observation',
      prices.map((r) => toPriceRecord(r, FETCHED_AT)),
    );
    expect(s.stats).toMatchObject({ valid: 4, invalid: 0 });
    expect(p.stats).toMatchObject({ valid: 5, invalid: 1 });
    expect(p.failures.map((f) => [f.record_key, f.rule])).toEqual([['30225', 'gtin_check_digit']]);
  });

  it('reads the province from the postal code, else from the display name', () => {
    expect(provinceOf('M6K 3P6', null)).toBe('ON');
    expect(provinceOf('h1m 1b2', null)).toBe('QC');
    expect(provinceOf(null, 'Store, Moncton, New Brunswick / Nouveau-Brunswick, Canada')).toBe(
      'NB',
    );
    // X is split between the Northwest Territories and Nunavut.
    expect(provinceOf('X1A 2P7', 'Store, Yellowknife, Canada')).toBeNull();
  });

  it('keeps the street part of the display name as the address', () => {
    const at = (display: string) =>
      addressOf({ osm_display_name: display } as OpLocation, 'Choices Market');
    expect(
      at(
        'Choices Market, 8683, Tenth Avenue, Massey Victory Heights, Burnaby, ' +
          'Metro Vancouver Regional District, British Columbia, V3N 2S9, Canada',
      ),
    ).toBe('8683 Tenth Avenue');
    expect(at('Choices Market, 1440, 52 Street NE, Marlborough Park, Calgary, Canada')).toBe(
      '1440 52 Street NE',
    );
    expect(at('Choices Market, 12A, Rue des Rocailles, Québec, Canada')).toBe(
      '12A Rue des Rocailles',
    );
    // No house number: the road alone, in English or French.
    expect(at('Choices Market, Grande Allée, Longueuil, Québec, J4K 1A1, Canada')).toBe(
      'Grande Allée',
    );
    expect(at('Choices Market, Broadway, Vancouver, Canada')).toBe('Broadway');
    // Starting with the house number when the display name has no place name.
    expect(at('20499, 64 Avenue, Township of Langley, Canada')).toBe('20499 64 Avenue');
    // No road: a neighbourhood isn't an address.
    expect(at('Choices Market, Downtown, New Westminster, Canada')).toBeNull();
    expect(at('Choices Market')).toBeNull();
    expect(addressOf({ osm_display_name: null } as OpLocation, 'X')).toBeNull();
  });

  it('keeps slugs within 64 characters and ending in the OSM id', () => {
    const loc = {
      osm_type: 'node',
      osm_id: 12509927303,
      osm_address_city: 'Montréal',
    } as OpLocation;
    const slug = storeSlugOf(loc, 'A very long store name '.repeat(5));
    expect(slug.length).toBeLessThanOrEqual(64);
    expect(slug).toMatch(/-n12509927303$/);
    expect(storeSlugOf(loc, 'Les jeux Ludold')).toBe('les-jeux-ludold-montreal-n12509927303');
  });

  it('a sample takes prices in order with only the stores they need', () => {
    const { stores, prices } = fixture();
    // 3 prices at store 604 (1 + 3 = 4), then a price at 605 would need 2 more.
    const four = sampleOf(prices, stores, 5);
    expect(four.prices.map((p) => p.id)).toEqual([108266, 44537, 44540]);
    expect(four.stores.map((s) => s.id)).toEqual([604]);
    const all = sampleOf(prices, stores, 100);
    expect(all.prices).toHaveLength(6);
    expect(all.stores).toHaveLength(2);
  });
});

describe('Open Prices source through the driver', () => {
  const SOURCE_ROW: SourceRow = {
    id: 'src-op',
    key: 'open-prices',
    verdict: 'use',
    enabled: true,
    rate_limit_per_sec: 1,
  };

  /** Fake writers; the price writer turns away the prices at store 605 with `reason`. */
  async function run(sampleSize: number | null, reason = 'unmatched_product') {
    const source = createOpenPricesSource({
      pricesUrl: PRICES,
      locationsUrl: LOCATIONS,
      extractSize: 4,
    });
    const store = createMemoryRunStore({ sources: [SOURCE_ROW] });
    const order: string[] = [];
    const writerOf = (kind: RecordKind): RecordWriter<RecordKind> => ({
      async upsert(records) {
        order.push(`${kind}:${records.length}`);
        const rejected: RejectedRecord[] =
          kind === 'price_observation'
            ? (records as { external_id: string; store: { osm_id: number } }[])
                .filter((r) => r.store.osm_id === 69546117)
                .map((r) => ({ key: r.external_id, message: 'Unknown product', reason }))
            : [];
        return {
          inserted: records.length - rejected.length,
          updated: 0,
          unchanged: 0,
          skipped_locked: 0,
          rejected,
        };
      },
    });
    const raws: string[] = [];
    const result = await runSource(
      source,
      { mode: sampleSize === null ? 'full' : 'sample', sampleSize, trigger: 'cli' },
      {
        store,
        writer: writerOf('price_observation') as RecordWriter<'price_observation'>,
        writerFor: writerOf,
        raw: () => ({
          store: async (seq, input) => {
            raws.push(input.body);
            return { id: `raw-${seq}` };
          },
        }),
        http: createHttpClient({ cache: null, log: silent }),
        log: silent,
      },
    );
    return { result, store, order, raws };
  }

  it('writes stores before prices, and counts unmatched products without an error', async () => {
    const { result, store, order, raws } = await run(null);
    expect(result.status).toBe('completed');
    // Price 30225 fails validation, so the first part writes 3.
    expect(order).toEqual(['store:4', 'price_observation:3', 'price_observation:2']);
    expect(raws.map((b) => parseExtract(b).length)).toEqual([4, 4, 2]);
    expect(result.counts).toMatchObject({ fetched: 10, valid: 9, invalid: 1, inserted: 7 });
    const skipped = store.events.filter((e) => e.event_type === 'unmatched_product');
    expect(skipped.map((e) => e.details?.count)).toEqual([2]);
    const finished = store.events.find((e) => e.event_type === 'run_finished');
    expect(finished?.details).toMatchObject({ skipped: { unmatched_product: 2 } });
    const filter = store.events.find((e) => e.event_type === 'open_prices_filter');
    expect(filter?.details).toMatchObject({ extracted: { stores: 4, prices: 6 } });
    expect(store.runs[0]?.dump_url).toBe(PRICES);
  });

  it('any other rejection still ends the run with errors', async () => {
    const { result, store } = await run(null, 'something_else');
    expect(result.status).toBe('completed_with_errors');
    expect(store.events.some((e) => e.event_type === 'records_not_written')).toBe(true);
  });

  it('a sample writes N records: the stores its prices need, then the prices', async () => {
    const { result, order } = await run(5);
    expect(result.status).toBe('completed');
    expect(order).toEqual(['store:1', 'price_observation:3']);
    expect(result.counts).toMatchObject({ fetched: 4 });
  });

  it('a parse of a stored extract gives the same records as the run', () => {
    const { stores, prices } = fixture();
    const body = toExtract(prices.map((price) => ({ price })));
    const source = createOpenPricesSource();
    const parsed = source.parse({
      rawObjectId: 'r',
      body,
      contentType: 'application/x-ndjson',
      requestUrl: null,
      httpStatus: 200,
      headers: {},
      fetchedAt: FETCHED_AT,
    });
    expect(parsed.records).toEqual([]);
    expect(parsed.batches?.map((b) => b.kind)).toEqual(['price_observation']);
    expect(parsed.batches?.[0]?.records).toEqual(prices.map((p) => toPriceRecord(p, FETCHED_AT)));
    expect(stores.size).toBe(4);
  });
});
