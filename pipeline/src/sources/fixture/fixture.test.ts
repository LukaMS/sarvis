// The fixture source: its data, its local server, and a run through the driver with the real polite
// HTTP client (robots.txt and the 1 request per second limit), the memory run store and a memory
// writer. No database.
import { gtinIsValid, validateBatch } from '@sarvis/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createHttpClient } from '../../http/client.ts';
import { createLogger } from '../../log.ts';
import type { RecordWriter } from '../../runs/driver.ts';
import { runSource } from '../../runs/driver.ts';
import { createMemoryRunStore } from '../../runs/store.ts';
import type { RawPayload, SourceRow } from '../source.ts';
import {
  FIXTURE_INVALID_RULES,
  FIXTURE_VALID_COUNT,
  fixtureCode,
  fixtureProducts,
} from './data.ts';
import { FIXTURE_PRODUCT_URL, createFixtureSource, toProductRecord } from './index.ts';
import { type FixtureServer, startFixtureServer } from './server.ts';

const SOURCE_ROW: SourceRow = {
  id: 'src-fixture',
  key: 'fixture',
  verdict: 'use',
  enabled: true,
  rate_limit_per_sec: 1,
};
const silent = createLogger({}, () => {});

const payload = (body: string): RawPayload => ({
  rawObjectId: null,
  body,
  contentType: 'application/json',
  requestUrl: null,
  httpStatus: 200,
  headers: {},
  fetchedAt: '2026-10-29T12:00:00.000Z',
});

describe('fixture data', () => {
  it('has 20 records, 17 of them valid, failing one rule each', () => {
    const products = fixtureProducts();
    expect(products).toHaveLength(20);
    expect(gtinIsValid(fixtureCode(1).padStart(14, '0'))).toBe(true);

    const raw = payload('{}');
    const batch = validateBatch(
      'product',
      products.map((p) => toProductRecord(p, raw)),
    );
    expect(batch.stats.valid).toBe(FIXTURE_VALID_COUNT);
    expect(batch.failures.map((f) => f.rule).sort()).toEqual([...FIXTURE_INVALID_RULES]);
  });

  it('maps an OFF product to a product record', () => {
    const [first] = fixtureProducts();
    const record = toProductRecord(first!, payload('{}'));
    expect(record).toMatchObject({
      gtin: `0${fixtureCode(1)}`,
      external_id: fixtureCode(1),
      name: 'Rolled Oats',
      brand_text: 'Fixture Farms',
      quantity_text: '1 kg',
      net_quantity: 1000,
      net_unit: 'g',
      unit_parse_status: 'ok',
      label_codes: ['organic', 'no-gmos'],
      source_url: FIXTURE_PRODUCT_URL + fixtureCode(1),
      fetched_at: '2026-10-29T12:00:00.000Z',
      method: 'api',
    });
  });
});

describe('fixture server', () => {
  let server: FixtureServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('serves robots.txt and OFF-style search pages', async () => {
    server = await startFixtureServer();
    const robots = await fetch(`${server.url}/robots.txt`);
    expect(await robots.text()).toContain('User-agent: sarvis');

    const page = (await (await fetch(`${server.url}/api/v2/search?page=4&page_size=5`)).json()) as {
      count: number;
      page_count: number;
      products: unknown[];
    };
    expect(page).toMatchObject({ count: 20, page: 4, page_count: 4 });
    expect(page.products).toHaveLength(5);
    expect((await fetch(`${server.url}/other`)).status).toBe(404);
  });
});

describe('fixture source through the driver', () => {
  function memoryWriter(): RecordWriter<'product'> & { written: unknown[] } {
    const written: unknown[] = [];
    return {
      written,
      async upsert(records) {
        written.push(...records);
        return { inserted: records.length, updated: 0, unchanged: 0, skipped_locked: 0 };
      },
    };
  }

  async function run(mode: 'sample' | 'dry_run', sampleSize: number) {
    let server: FixtureServer | undefined;
    const source = createFixtureSource({ onStart: (s) => (server = s) });
    const store = createMemoryRunStore({ sources: [SOURCE_ROW] });
    const writer = memoryWriter();
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
        log: silent,
      },
    );
    return { result, store, writer, raws, requests: server?.requests ?? [] };
  }

  it('runs a sample of 10 over two pages, storing raw and writing the valid records', async () => {
    const { result, store, writer, raws, requests } = await run('sample', 10);
    expect(requests).toEqual([
      '/robots.txt',
      '/api/v2/search?page=1&page_size=5',
      '/api/v2/search?page=2&page_size=5',
    ]);
    expect(result.status).toBe('completed');
    expect(result.counts).toMatchObject({ fetched: 10, valid: 9, invalid: 1, inserted: 9 });
    expect(result.expectedTotal).toBe(20);
    expect(raws).toHaveLength(2);
    expect(writer.written).toHaveLength(9);
    expect(store.failures.map((f) => f.rule)).toEqual(['duplicate']);
    expect(store.runs[0]?.triggered_by).toBe('cli');
  }, 15_000);

  it('dry run: parses and validates, stores and writes nothing', async () => {
    const { result, writer, raws } = await run('dry_run', 5);
    expect(result.status).toBe('completed');
    expect(result.counts).toMatchObject({ fetched: 5, valid: 4, invalid: 1, inserted: 0 });
    expect(raws).toHaveLength(0);
    expect(writer.written).toHaveLength(0);
  }, 15_000);
});
