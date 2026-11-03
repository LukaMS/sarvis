// StatCan reference prices on fixtures trimmed from real WDS responses (2026-11-03): the cube
// metadata cut to Canada, Quebec and Ontario and two products, and a data response with one
// suppressed month and one coordinate WDS doesn't have.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { type RecordKind, validateBatch } from '@sarvis/core';
import { describe, expect, it } from 'vitest';

import type { HttpClient, HttpRequest, HttpResponse } from '../../http/client.ts';
import { createLogger } from '../../log.ts';
import { type RecordWriter, runSource } from '../../runs/driver.ts';
import { createMemoryRunStore } from '../../runs/store.ts';
import type { SourceRow } from '../source.ts';
import { createStatcanSource, dataStepsOf } from './index.ts';
import {
  SC_TABLE_URL,
  emptyDataCounts,
  monthsBetween,
  parseDataEnvelope,
  parseMetadata,
  requestBodyOf,
  seriesOf,
  splitProduct,
  toEnvelope,
} from './map.ts';

const read = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');
const META = read('fixture.metadata.json');
const DATA = read('fixture.data.json');
const FETCHED_AT = '2026-11-03T16:00:00.000Z';
const silent = createLogger({ level: 'error', write: () => {} });

describe('StatCan metadata', () => {
  it('reads the cube and refuses another table', () => {
    const meta = parseMetadata(META);
    expect(meta).toMatchObject({
      productId: 18100245,
      startDate: '2017-01-01',
      endDate: '2026-08-01',
    });
    expect(meta.geographies.map((g) => g.name)).toEqual(['Canada', 'Quebec', 'Ontario']);
    expect(meta.products.map((p) => p.name)).toEqual([
      'Ground beef, per kilogram',
      'Tea (20 bags)',
    ]);
    const other = JSON.parse(META) as { object: { productId: string } }[];
    other[0]!.object.productId = '18100004';
    expect(() => parseMetadata(JSON.stringify(other))).toThrow(/did not return table/);
    expect(() => parseMetadata('[{"status":"FAILED","object":"x"}]')).toThrow();
  });

  it('asks for Canada and Ontario only, product by product', () => {
    expect(seriesOf(parseMetadata(META))).toEqual([
      {
        coordinate: '11.4.0.0.0.0.0.0.0.0',
        geography: 'Canada',
        product: 'Ground beef, per kilogram',
      },
      {
        coordinate: '6.4.0.0.0.0.0.0.0.0',
        geography: 'Ontario',
        product: 'Ground beef, per kilogram',
      },
      { coordinate: '11.64.0.0.0.0.0.0.0.0', geography: 'Canada', product: 'Tea (20 bags)' },
      { coordinate: '6.64.0.0.0.0.0.0.0.0', geography: 'Ontario', product: 'Tea (20 bags)' },
    ]);
  });

  it('counts the months back to 2017 and batches the requests', () => {
    expect(monthsBetween('2017-01-01', '2026-08-01')).toBe(116);
    expect(monthsBetween('2017-01-01', '2017-01-01')).toBe(1);
    const meta = parseMetadata(META);
    const full = dataStepsOf(meta, null, 3);
    expect(full.map((s) => (s.kind === 'data' ? [s.series.length, s.latestN, s.last] : s))).toEqual(
      [
        [3, 116, false],
        [1, 116, true],
      ],
    );
    // A sample of 100 needs one series of 116 months; 200 needs two.
    expect(dataStepsOf(meta, 100).map((s) => (s.kind === 'data' ? s.series.length : 0))).toEqual([
      1,
    ]);
    expect(dataStepsOf(meta, 200).map((s) => (s.kind === 'data' ? s.series.length : 0))).toEqual([
      2,
    ]);
  });

  it('builds the WDS request body', () => {
    const [s] = seriesOf(parseMetadata(META));
    expect(JSON.parse(requestBodyOf([s!], 116))).toEqual([
      { productId: 18100245, coordinate: '11.4.0.0.0.0.0.0.0.0', latestN: 116 },
    ]);
  });
});

describe('StatCan mapping', () => {
  it('splits the product name from its unit', () => {
    expect(splitProduct('Ground beef, per kilogram')).toEqual({
      label: 'Ground beef',
      unit: 'per kilogram',
    });
    expect(splitProduct('Frozen corn, 750 grams ')).toEqual({
      label: 'Frozen corn',
      unit: '750 grams',
    });
    expect(splitProduct('Eggs, 1 dozen')).toEqual({ label: 'Eggs', unit: '1 dozen' });
    expect(splitProduct('Tea (20 bags)')).toEqual({ label: 'Tea', unit: '20 bags' });
    expect(splitProduct('Dry or fresh pasta, 500 grams')).toEqual({
      label: 'Dry or fresh pasta',
      unit: '500 grams',
    });
    expect(splitProduct('Bread')).toEqual({ label: 'Bread', unit: null });
  });

  it('maps a data envelope, matching each series by coordinate, and counts the drops', () => {
    const series = seriesOf(parseMetadata(META));
    const counts = emptyDataCounts();
    const records = parseDataEnvelope(toEnvelope(series, 116, DATA), FETCHED_AT, counts);
    expect(counts).toEqual({
      series: 4,
      failedSeries: 1,
      points: 8,
      kept: 7,
      dropped: { no_value: 1, before_since: 0, scaled: 0 },
    });
    expect(records).toHaveLength(7);
    expect(
      records.find((r) => r.vector_id === 'v1159447178' && r.ref_month === '2026-06-01'),
    ).toEqual({
      vector_id: 'v1159447178',
      product_label: 'Ground beef',
      unit: 'per kilogram',
      geography: 'Ontario',
      ref_month: '2026-06-01',
      value: 16.17,
      category_slug: null,
      source_key: 'statcan-18100245',
      source_url: SC_TABLE_URL,
      fetched_at: FETCHED_AT,
      method: 'api',
      method_version: 'statcan-18100245@1.0.0',
    });
    expect(
      records.filter((r) => r.product_label === 'Tea').map((r) => [r.geography, r.unit]),
    ).toEqual([
      ['Canada', '20 bags'],
      ['Canada', '20 bags'],
    ]);
    const v = validateBatch('reference_price', records);
    expect(v.stats).toMatchObject({ valid: 7, invalid: 0 });
  });

  it('refuses a body that is not a data envelope', () => {
    expect(() => parseDataEnvelope('{"format":"other"}', FETCHED_AT)).toThrow(/envelope/);
  });
});

describe('StatCan source through the driver', () => {
  const SOURCE_ROW: SourceRow = {
    id: 'src-sc',
    key: 'statcan-18100245',
    verdict: 'use',
    enabled: true,
    rate_limit_per_sec: 0.5,
  };

  function fakeHttp(requests: HttpRequest[]): HttpClient {
    return {
      async request(req) {
        requests.push(req);
        const body = req.url.endsWith('getCubeMetadata') ? META : DATA;
        return {
          url: req.url,
          status: 200,
          headers: {},
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

  async function run(sampleSize: number | null) {
    const store = createMemoryRunStore({ sources: [SOURCE_ROW] });
    const written: unknown[] = [];
    const writer: RecordWriter<RecordKind> = {
      async upsert(records) {
        written.push(...records);
        return {
          inserted: records.length,
          updated: 0,
          unchanged: 0,
          skipped_locked: 0,
          rejected: [],
        };
      },
    };
    const raws: string[] = [];
    const requests: HttpRequest[] = [];
    const result = await runSource(
      createStatcanSource({ wdsUrl: 'https://wds.example/rest/', batchSize: 4 }),
      {
        mode: sampleSize === null ? 'full' : 'sample',
        sampleSize,
        trigger: 'cli',
        politenessDelayMs: 0,
      },
      {
        store,
        writer: writer as RecordWriter<'reference_price'>,
        writerFor: () => writer,
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

  it('stores the metadata, then one data envelope, and writes its records', async () => {
    const { result, store, raws, requests, written } = await run(null);
    expect(result.status).toBe('completed');
    expect(requests.map((r) => [r.method, r.url])).toEqual([
      ['POST', 'https://wds.example/rest/getCubeMetadata'],
      ['POST', 'https://wds.example/rest/getDataFromCubePidCoordAndLatestNPeriods'],
    ]);
    expect(JSON.parse(requests[1]!.body!)).toHaveLength(4);
    expect(raws).toHaveLength(2);
    expect(raws[0]).toBe(META);
    expect(result.counts).toMatchObject({ fetched: 7, valid: 7, invalid: 0, inserted: 7 });
    expect(written).toHaveLength(7);
    const summary = store.events.find((e) => e.event_type === 'statcan_summary');
    expect(summary?.severity).toBe('warn');
    expect(summary?.details).toMatchObject({
      series: 4,
      failedSeries: 1,
      kept: 7,
      cubeEndDate: '2026-08-01',
    });
  });

  it('a sample asks for only the series it needs', async () => {
    const { result, requests } = await run(5);
    expect(JSON.parse(requests[1]!.body!)).toHaveLength(1);
    // Only the requested series is read from the response: Canada ground beef, 3 months with one
    // suppressed, so fewer than the sample size.
    expect(result.counts.fetched).toBe(2);
  });
});
