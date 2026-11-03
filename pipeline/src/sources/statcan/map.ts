// Statistics Canada table 18-10-0245-01, monthly average retail prices (SOURCES.md S6, PLAN P3.11,
// D-063). Mapping is pure: a stored WDS response re-parses to the same records.
//
// Two kinds of stored response: the cube metadata (`getCubeMetadata`, verbatim; it names the
// geographies and products and gives no records), and data envelopes. A data envelope holds one
// `getDataFromCubePidCoordAndLatestNPeriods` response verbatim plus the members its coordinates
// stand for, because the data response carries only coordinates and vector ids: that way each
// data file parses on its own.
import { type RecordInputOf, cleanText } from '@sarvis/core';

export const SC_KEY = 'statcan-18100245';
export const SC_JOB = 'statcan-reference-prices';
export const SC_VERSION = '1.0.0';
export const SC_PRODUCT_ID = 18100245;
/** The table page every row cites (the exact series is the row's vector id). */
export const SC_TABLE_URL = 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810024501';
export const SC_WDS = 'https://www150.statcan.gc.ca/t1/wds/rest/';
/** The first month kept (PLAN P3.11: since 2017; the cube also starts then). */
export const SC_SINCE = '2017-01-01';
/** The geographies kept, by their English member name. */
export const SC_GEOGRAPHIES = ['Canada', 'Ontario'] as const;
export const ENVELOPE_FORMAT = 'sarvis-statcan-data/1';

type Json = Record<string, unknown>;

export interface Member {
  id: number;
  name: string;
}

export interface CubeMetadata {
  productId: number;
  title: string;
  startDate: string;
  endDate: string;
  releaseTime: string | null;
  geographies: Member[];
  products: Member[];
}

const membersOf = (dim: Json | undefined): Member[] =>
  ((dim?.member as Json[] | undefined) ?? []).map((m) => ({
    id: Number(m.memberId),
    name: String(m.memberNameEn ?? '').trim(),
  }));

/** The `getCubeMetadata` response, checked to be this cube. Throws on anything else. */
export function parseMetadata(body: string): CubeMetadata {
  const arr = JSON.parse(body) as Json[];
  const first = arr[0];
  const o = first?.object as Json | undefined;
  if (first?.status !== 'SUCCESS' || !o || Number(o.productId) !== SC_PRODUCT_ID) {
    throw new Error(`getCubeMetadata did not return table ${SC_PRODUCT_ID}.`);
  }
  const dims = (o.dimension as Json[] | undefined) ?? [];
  const byName = (n: string) => dims.find((d) => d.dimensionNameEn === n);
  const geographies = membersOf(byName('Geography'));
  const products = membersOf(byName('Products'));
  if (dims.length !== 2 || geographies.length === 0 || products.length === 0) {
    throw new Error('The cube no longer has exactly the Geography and Products dimensions.');
  }
  return {
    productId: SC_PRODUCT_ID,
    title: String(o.cubeTitleEn ?? ''),
    startDate: String(o.cubeStartDate),
    endDate: String(o.cubeEndDate),
    releaseTime: typeof o.releaseTime === 'string' ? o.releaseTime : null,
    geographies,
    products,
  };
}

/** WDS coordinates have 10 positions: geography, product, then unused zeros. */
export const coordinateOf = (geo: number, product: number): string =>
  [geo, product, 0, 0, 0, 0, 0, 0, 0, 0].join('.');

/** Months from `from` to `to` inclusive (both the first of a month). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  return Math.max(0, (ty - fy) * 12 + (tm - fm) + 1);
}

/**
 * The product name and its unit: `Ground beef, per kilogram` → `Ground beef` + `per kilogram`,
 * `Tea (20 bags)` → `Tea` + `20 bags`. A name with neither keeps the whole name and a null unit.
 */
export function splitProduct(name: string): { label: string; unit: string | null } {
  const n = name.trim().replace(/\s+/g, ' ');
  const paren = /^(.*\S)\s*\(([^()]+)\)$/.exec(n);
  if (paren) return { label: paren[1]!, unit: paren[2]! };
  const i = n.lastIndexOf(', ');
  if (i > 0) return { label: n.slice(0, i), unit: n.slice(i + 2) };
  return { label: n, unit: null };
}

export interface Series {
  coordinate: string;
  geography: string;
  product: string;
}

/** The series to fetch: every product in each kept geography, product by product. */
export function seriesOf(meta: CubeMetadata): Series[] {
  const geos = SC_GEOGRAPHIES.map((g) => meta.geographies.find((m) => m.name === g));
  if (geos.some((g) => !g)) {
    throw new Error(`The cube has no ${SC_GEOGRAPHIES.join(' or ')} geography member.`);
  }
  return meta.products.flatMap((p) =>
    (geos as Member[]).map((g) => ({
      coordinate: coordinateOf(g.id, p.id),
      geography: g.name,
      product: p.name,
    })),
  );
}

export interface DataEnvelope {
  format: typeof ENVELOPE_FORMAT;
  productId: number;
  latestN: number;
  series: Series[];
  /** The WDS response, as parsed JSON. */
  response: unknown;
}

export const toEnvelope = (series: Series[], latestN: number, responseBody: string): string =>
  JSON.stringify({
    format: ENVELOPE_FORMAT,
    productId: SC_PRODUCT_ID,
    latestN,
    series,
    response: JSON.parse(responseBody) as unknown,
  } satisfies DataEnvelope);

export const requestBodyOf = (series: Series[], latestN: number): string =>
  JSON.stringify(
    series.map((s) => ({ productId: SC_PRODUCT_ID, coordinate: s.coordinate, latestN })),
  );

export interface DataCounts {
  series: number;
  /** Coordinates WDS didn't return (no such series). */
  failedSeries: number;
  points: number;
  kept: number;
  dropped: {
    /** Suppressed or not available: value null. */
    no_value: number;
    /** Before SC_SINCE. */
    before_since: number;
    /** A scalar factor other than units, which the cube doesn't use. */
    scaled: number;
  };
}

export const emptyDataCounts = (): DataCounts => ({
  series: 0,
  failedSeries: 0,
  points: 0,
  kept: 0,
  dropped: { no_value: 0, before_since: 0, scaled: 0 },
});

/** One data envelope → reference price records, counting what it drops. */
export function parseDataEnvelope(
  body: string,
  fetchedAt: string,
  counts: DataCounts = emptyDataCounts(),
): RecordInputOf<'reference_price'>[] {
  const env = JSON.parse(body) as DataEnvelope;
  if (env.format !== ENVELOPE_FORMAT) throw new Error(`Not a ${ENVELOPE_FORMAT} envelope.`);
  const byCoord = new Map(env.series.map((s) => [s.coordinate, s]));
  counts.series += env.series.length;
  const records: RecordInputOf<'reference_price'>[] = [];
  const found = new Set<string>();
  for (const item of (env.response as Json[] | null) ?? []) {
    const o = item.object as Json | undefined;
    const series = typeof o?.coordinate === 'string' ? byCoord.get(o.coordinate) : undefined;
    if (item.status !== 'SUCCESS' || !o || !series || typeof o.vectorId !== 'number') continue;
    found.add(series.coordinate);
    const { label, unit } = splitProduct(series.product);
    for (const p of (o.vectorDataPoint as Json[] | undefined) ?? []) {
      counts.points++;
      const refPer = String(p.refPer ?? '');
      if (p.value === null || p.value === undefined) {
        counts.dropped.no_value++;
        continue;
      }
      if (refPer < SC_SINCE) {
        counts.dropped.before_since++;
        continue;
      }
      if (Number(p.scalarFactorCode ?? 0) !== 0) {
        counts.dropped.scaled++;
        continue;
      }
      counts.kept++;
      records.push({
        vector_id: `v${o.vectorId}`,
        product_label: cleanText(label) as string,
        unit: cleanText(unit),
        geography: series.geography,
        ref_month: refPer,
        value: Number(p.value),
        category_slug: null,
        source_key: SC_KEY,
        source_url: SC_TABLE_URL,
        fetched_at: fetchedAt,
        method: 'api',
        method_version: `${SC_KEY}@${SC_VERSION}`,
      });
    }
  }
  counts.failedSeries += env.series.length - found.size;
  return records;
}
