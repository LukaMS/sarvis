// StatCan reference prices (SOURCES.md S6, PLAN P3.11, D-063). Step 1 fetches the cube metadata
// (stored verbatim; no records). It names the products and geographies, and the cube's last month,
// so step 1 returns the data steps: the Canada and Ontario series of every product, SC_BATCH
// coordinates per `getDataFromCubePidCoordAndLatestNPeriods` POST, with latestN reaching back to
// SC_SINCE. The host's `Crawl-delay: 2` is enforced by the HTTP client (robots) and by the
// source row's rate limit (0.5 req/s).
//
// A full run re-reads every month, so a revised value updates its row in place. There's no delta:
// a whole run is about a dozen requests.
import type { FetchResult, ParseResult, RawPayload, Source, SourceRunContext } from '../source.ts';
import {
  type CubeMetadata,
  type DataCounts,
  SC_JOB,
  SC_KEY,
  SC_PRODUCT_ID,
  SC_SINCE,
  SC_VERSION,
  SC_WDS,
  type Series,
  emptyDataCounts,
  monthsBetween,
  parseDataEnvelope,
  parseMetadata,
  requestBodyOf,
  seriesOf,
  toEnvelope,
} from './map.ts';

export { SC_JOB, SC_KEY, SC_VERSION } from './map.ts';

/** Coordinates per data request: 20 × ~116 months ≈ 0.6 MB of JSON. */
export const SC_BATCH = 20;
const JSON_TYPE = 'application/json';

export type ScStep =
  { kind: 'metadata' } | { kind: 'data'; series: Series[]; latestN: number; last: boolean };

export interface StatcanSourceOptions {
  /** The WDS base URL (tests point it at a local server). */
  wdsUrl?: string;
  batchSize?: number;
}

/** The data steps for `meta`: all series, or for a sample just enough to reach `sampleSize`. */
export function dataStepsOf(
  meta: CubeMetadata,
  sampleSize: number | null,
  batchSize = SC_BATCH,
): ScStep[] {
  const latestN = monthsBetween(SC_SINCE, meta.endDate);
  let series = seriesOf(meta);
  if (sampleSize !== null) series = series.slice(0, Math.max(1, Math.ceil(sampleSize / latestN)));
  const steps: ScStep[] = [];
  for (let i = 0; i < series.length; i += batchSize) {
    steps.push({
      kind: 'data',
      series: series.slice(i, i + batchSize),
      latestN,
      last: i + batchSize >= series.length,
    });
  }
  return steps;
}

export function createStatcanSource(
  options: StatcanSourceOptions = {},
): Source<'reference_price', ScStep> {
  const wds = options.wdsUrl ?? SC_WDS;
  const batchSize = options.batchSize ?? SC_BATCH;
  let counts: DataCounts = emptyDataCounts();
  let meta: CubeMetadata | null = null;

  const post = (ctx: SourceRunContext, method: string, body: string) =>
    ctx.http.request({
      url: new URL(method, wds).href,
      method: 'POST',
      headers: { 'content-type': JSON_TYPE, accept: JSON_TYPE },
      body,
    });

  return {
    key: SC_KEY,
    job: SC_JOB,
    version: SC_VERSION,
    recordKind: 'reference_price',
    capabilities: {
      supportsDelta: false,
      // A month that drops out of the cube isn't a price that stopped existing.
      supportsDeactivation: false,
      storeSpecificPricing: false,
    },

    plan() {
      counts = emptyDataCounts();
      meta = null;
      return [{ kind: 'metadata' }];
    },

    async fetch(step, ctx): Promise<FetchResult<ScStep>> {
      if (step.kind === 'metadata') {
        const res = await post(
          ctx,
          'getCubeMetadata',
          JSON.stringify([{ productId: SC_PRODUCT_ID }]),
        );
        meta = parseMetadata(res.body);
        const next = dataStepsOf(meta, ctx.sampleSize, batchSize);
        ctx.log.info('StatCan cube metadata read.', {
          endDate: meta.endDate,
          releaseTime: meta.releaseTime,
          products: meta.products.length,
          geographies: meta.geographies.length,
          requests: next.length,
        });
        return {
          response: {
            body: res.body,
            fetchedAt: res.fetchedAt,
            url: res.url,
            status: res.status,
            contentType: JSON_TYPE,
          },
          next,
        };
      }

      const res = await post(
        ctx,
        'getDataFromCubePidCoordAndLatestNPeriods',
        requestBodyOf(step.series, step.latestN),
      );
      const body = toEnvelope(step.series, step.latestN, res.body);
      // Counted here, on the fetched response, for the run's summary event.
      parseDataEnvelope(body, res.fetchedAt, counts);
      const c = counts;
      return {
        response: {
          body,
          fetchedAt: res.fetchedAt,
          url: res.url,
          status: res.status,
          contentType: JSON_TYPE,
        },
        events: step.last
          ? [
              {
                severity: c.failedSeries > 0 ? 'warn' : 'info',
                eventType: 'statcan_summary',
                message:
                  `Series: requested ${c.series}, missing ${c.failedSeries}. Points: ${c.points}, ` +
                  `kept ${c.kept} (dropped ${c.dropped.no_value} without a value, ` +
                  `${c.dropped.before_since} before ${SC_SINCE}, ${c.dropped.scaled} scaled).`,
                details: {
                  ...c,
                  dropped: { ...c.dropped },
                  cubeEndDate: meta?.endDate ?? null,
                  releaseTime: meta?.releaseTime ?? null,
                },
              },
            ]
          : undefined,
      };
    },

    parse(raw: RawPayload): ParseResult {
      // The metadata is an array; a data envelope is an object.
      if (raw.body.trimStart().startsWith('[')) return { records: [] };
      return { records: parseDataEnvelope(raw.body, raw.fetchedAt) };
    },
  };
}
