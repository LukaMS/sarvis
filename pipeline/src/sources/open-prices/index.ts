// Open Prices daily dumps (SOURCES.md S5, PLAN P3.9, D-060). Reads `locations.jsonl.gz` and
// `prices.jsonl.gz` in `plan`, keeps Canadian OSM locations and the CAD product prices at them,
// and stores them as JSONL extracts: one of stores first (so prices can resolve them), then the
// prices in EXTRACT_SIZE-line parts. `parse` maps each extract line to a store or price record.
//
// Both dumps are small (~1 MB and ~22 MB gzipped), and CAD rows are scattered through the prices
// dump, so even a sample downloads both (to the dump cache, revalidated on a re-run). A sample
// takes prices in dump order with only the stores they need, up to N records in all.
//
// A price whose product isn't in `products` yet is an expected skip (`unmatched_product`), not an
// error: it stays in the raw extract, so a later run or a re-parse picks it up once OFF has it.
import { UNMATCHED_PRODUCT } from '../../db/writers/prices.ts';
import { openLines } from '../../http/lines.ts';
import type {
  DumpInfo,
  FetchResult,
  ParseResult,
  RawPayload,
  RecordBatch,
  Source,
  SourceEvent,
  SourceRunContext,
} from '../source.ts';
import {
  type ExtractLine,
  type LocationCounts,
  OP_JOB,
  OP_KEY,
  OP_VERSION,
  type OpLocation,
  type OpPrice,
  type PriceCounts,
  emptyLocationCounts,
  emptyPriceCounts,
  keepLocation,
  keepPrice,
  parseExtract,
  toExtract,
  toPriceRecord,
  toStoreRecord,
} from './map.ts';

export { OP_JOB, OP_KEY, OP_VERSION } from './map.ts';

export const OP_PRICES_URL = 'https://prices.openfoodfacts.org/data/prices.jsonl.gz';
export const OP_LOCATIONS_URL = 'https://prices.openfoodfacts.org/data/locations.jsonl.gz';
/** Price lines per stored extract file. */
export const OP_EXTRACT_SIZE = 10_000;
export const EXTRACT_CONTENT_TYPE = 'application/x-ndjson; charset=utf-8';

export interface OpStep {
  part: number;
  /** Price parts only: which slice of the kept prices. */
  chunk?: number;
}

export interface OpenPricesSourceOptions {
  /** The dumps: URLs, or local paths (tests). */
  pricesUrl?: string;
  locationsUrl?: string;
  extractSize?: number;
}

const isUrl = (s: string) => /^https?:\/\//i.test(s);

/** The lines of a dump: downloaded to the cache when it's a URL, read in place when it's a path. */
async function openDump(
  url: string,
  ctx: SourceRunContext,
): Promise<{ lines: AsyncGenerator<string>; dump: DumpInfo }> {
  if (!isUrl(url)) {
    return {
      lines: openLines(url),
      dump: { url, sha256: null, fetchedAt: new Date().toISOString() },
    };
  }
  const file = await ctx.http.download(url);
  ctx.log.info('Open Prices dump ready.', { url, bytes: file.bytes, cache: file.cache });
  return {
    lines: openLines(file.path, { gzip: true }),
    dump: { url: file.url, sha256: file.sha256, fetchedAt: file.fetchedAt },
  };
}

/** Prices in dump order, with only the stores they need, until stores + prices reach `size`. */
export function sampleOf(
  prices: OpPrice[],
  stores: Map<number, OpLocation>,
  size: number,
): { prices: OpPrice[]; stores: OpLocation[] } {
  const picked: OpPrice[] = [];
  const needed = new Map<number, OpLocation>();
  for (const p of prices) {
    const extra = needed.has(p.location_id) ? 1 : 2;
    if (needed.size + picked.length + extra > size) break;
    const store = stores.get(p.location_id);
    if (!store) continue;
    needed.set(store.id, store);
    picked.push(p);
  }
  return { prices: picked, stores: [...needed.values()] };
}

function filterEvent(
  locations: LocationCounts,
  prices: PriceCounts,
  dumps: { locations: DumpInfo; prices: DumpInfo },
  written: { stores: number; prices: number },
): SourceEvent {
  const l = locations.dropped;
  const p = prices.dropped;
  return {
    severity: 'info',
    eventType: 'open_prices_filter',
    message:
      `Locations: scanned ${locations.scanned}, kept ${locations.kept} (dropped ${l.malformed} ` +
      `malformed, ${l.not_osm} not OSM, ${l.not_canada} outside Canada, ${l.no_name} without a ` +
      `name). Prices: scanned ${prices.scanned}, kept ${prices.kept} (dropped ${p.malformed} ` +
      `malformed, ${p.not_cad} not CAD, ${p.no_product_code} without a product code, ` +
      `${p.duplicate} duplicates, ${p.no_canadian_store} not at a kept Canadian store). ` +
      `Extracted ${written.stores} stores and ${written.prices} prices.`,
    details: {
      locations: { scanned: locations.scanned, kept: locations.kept, dropped: { ...l } },
      prices: { scanned: prices.scanned, kept: prices.kept, dropped: { ...p } },
      extracted: written,
      // The run's dump_* columns hold the prices dump; the locations dump is recorded here.
      locationsDump: dumps.locations,
    },
  };
}

export function createOpenPricesSource(
  options: OpenPricesSourceOptions = {},
): Source<'price_observation', OpStep> {
  const pricesUrl = options.pricesUrl ?? OP_PRICES_URL;
  const locationsUrl = options.locationsUrl ?? OP_LOCATIONS_URL;
  const extractSize = options.extractSize ?? OP_EXTRACT_SIZE;
  let state: {
    stores: OpLocation[];
    prices: OpPrice[];
    dumps: { locations: DumpInfo; prices: DumpInfo };
    event: SourceEvent;
  } | null = null;

  return {
    key: OP_KEY,
    job: OP_JOB,
    version: OP_VERSION,
    recordKind: 'price_observation',
    capabilities: {
      supportsDelta: false,
      // Prices are history: one missing from a later dump is not a price that stopped existing.
      supportsDeactivation: false,
      // Each price names its store by OSM id; no store context to prove up front.
      storeSpecificPricing: false,
    },
    expectedRejections: [UNMATCHED_PRODUCT],
    // Parts come from data already read in `plan`; no request goes out between them.
    politenessDelayMs: 0,

    async plan(ctx) {
      const locationCounts = emptyLocationCounts();
      const priceCounts = emptyPriceCounts();

      const loc = await openDump(locationsUrl, ctx);
      const kept = new Map<number, OpLocation>();
      for await (const line of loc.lines) {
        const l = keepLocation(line, locationCounts);
        if (l) kept.set(l.id, l);
      }
      const pr = await openDump(pricesUrl, ctx);
      const prices: OpPrice[] = [];
      for await (const line of pr.lines) {
        const p = keepPrice(line, kept, priceCounts);
        if (p) prices.push(p);
      }

      const chosen =
        ctx.sampleSize !== null
          ? sampleOf(prices, kept, ctx.sampleSize)
          : { prices, stores: [...kept.values()] };
      const dumps = { locations: loc.dump, prices: pr.dump };
      state = {
        ...chosen,
        dumps,
        event: filterEvent(locationCounts, priceCounts, dumps, {
          stores: chosen.stores.length,
          prices: chosen.prices.length,
        }),
      };
      return [{ part: 1 }];
    },

    async fetch(step): Promise<FetchResult<OpStep>> {
      if (!state) throw new Error('open-prices: fetch before plan');
      if (step.chunk === undefined) {
        const lines: ExtractLine[] = state.stores.map((location) => ({ location }));
        return {
          response: {
            body: toExtract(lines),
            fetchedAt: state.dumps.locations.fetchedAt,
            url: state.dumps.locations.url,
            status: 200,
            contentType: EXTRACT_CONTENT_TYPE,
          },
          next: state.prices.length > 0 ? [{ part: 2, chunk: 0 }] : [],
          dump: state.dumps.locations,
          events: [state.event],
        };
      }
      const from = step.chunk * extractSize;
      const lines: ExtractLine[] = state.prices
        .slice(from, from + extractSize)
        .map((price) => ({ price }));
      const more = from + extractSize < state.prices.length;
      return {
        response: {
          body: toExtract(lines),
          fetchedAt: state.dumps.prices.fetchedAt,
          url: state.dumps.prices.url,
          status: 200,
          contentType: EXTRACT_CONTENT_TYPE,
        },
        next: more ? [{ part: step.part + 1, chunk: step.chunk + 1 }] : [],
        // The last dump reported wins, so the run's dump_* columns name the prices dump.
        dump: step.chunk === 0 ? state.dumps.prices : undefined,
      };
    },

    parse(raw: RawPayload): ParseResult {
      const stores: unknown[] = [];
      const prices: unknown[] = [];
      for (const line of parseExtract(raw.body)) {
        if ('location' in line) stores.push(toStoreRecord(line.location, raw.fetchedAt));
        else prices.push(toPriceRecord(line.price, raw.fetchedAt));
      }
      // Stores first: the price writer resolves each price's store by its OSM key.
      const batches: RecordBatch[] = [
        { kind: 'store' as const, records: stores },
        { kind: 'price_observation' as const, records: prices },
      ].filter((b) => b.records.length > 0);
      return { records: [], batches };
    },

    async dispose() {
      state = null;
    },
  };
}
