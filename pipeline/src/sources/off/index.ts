// Open Food Facts bulk export (SOURCES.md S1, PLAN P3.5). Reads the nightly CSV export line by
// line, keeps Canadian products that pass the import filter, and stores them as TSV extracts of
// EXTRACT_SIZE rows each (D-044), which `parse` maps to product records.
//
// A sample streams the start of the export and stops as soon as it has enough rows, which closes
// the connection. Any other run downloads the whole file to the dump cache first (P3.3), so the
// run records its sha-256 and a re-run on an unchanged dump costs one conditional request.
import { ConfigurationError } from '../../errors.ts';
import { openLines } from '../../http/lines.ts';
import type { FetchResult, ParseResult, RawPayload, Source, SourceRunContext } from '../source.ts';
import {
  type FilterCounts,
  type OffRow,
  createRowFilter,
  emptyFilterCounts,
  parseExtract,
  toExtract,
} from './csv.ts';
import { OFF_JOB, OFF_KEY, OFF_VERSION, toProductRecord } from './map.ts';

export { OFF_JOB, OFF_KEY, OFF_VERSION } from './map.ts';

export const OFF_CSV_URL =
  'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz';
/** Rows per stored extract file. */
export const OFF_EXTRACT_SIZE = 10_000;
export const EXTRACT_CONTENT_TYPE = 'text/tab-separated-values; charset=utf-8';

export interface OffStep {
  part: number;
}

export interface OffSourceOptions {
  /** The export to read: a URL, or a local path (tests). */
  csvUrl?: string;
  extractSize?: number;
}

/** Filtered rows, taken a batch at a time. */
interface RowFeed {
  /** `peek` (default true) reads one row ahead, so the last batch says it is the last. */
  take(n: number, peek?: boolean): Promise<{ rows: OffRow[]; done: boolean }>;
  close(): Promise<void>;
}

/** The filtered rows of a line stream. `lines` is read lazily and closed on `close`. */
function feedOf(lines: AsyncGenerator<string>, counts: FilterCounts): RowFeed {
  let keep: ((line: string) => OffRow | null) | null = null;
  let done = false;
  let ahead: OffRow | null = null;

  const next = async (): Promise<OffRow | null> => {
    for (;;) {
      const r = await lines.next();
      if (r.done) return null;
      if (!keep) {
        keep = createRowFilter(r.value, counts);
        continue;
      }
      const row = keep(r.value);
      if (row) return row;
    }
  };

  return {
    async take(n, peek = true) {
      const rows: OffRow[] = [];
      if (ahead) rows.push(ahead);
      ahead = null;
      while (!done && rows.length < n) {
        const row = await next();
        if (row) rows.push(row);
        else done = true;
      }
      if (peek && !done) {
        ahead = await next();
        done = ahead === null;
      }
      return { rows, done };
    },
    async close() {
      await lines.return(undefined);
    },
  };
}

function filterEvent(counts: FilterCounts) {
  const d = counts.dropped;
  return {
    severity: 'info' as const,
    eventType: 'off_filter',
    message:
      `Scanned ${counts.scanned} rows, kept ${counts.kept}. Dropped: ${d.malformed} malformed, ` +
      `${d.not_canada} not sold in Canada, ${d.no_name} without a name, ` +
      `${d.no_brand_or_category} without a brand or category.`,
    details: { scanned: counts.scanned, kept: counts.kept, dropped: { ...d } },
  };
}

export function createOffSource(options: OffSourceOptions = {}): Source<'product', OffStep> {
  const csvUrl = options.csvUrl ?? OFF_CSV_URL;
  const extractSize = options.extractSize ?? OFF_EXTRACT_SIZE;
  const isUrl = /^https?:\/\//i.test(csvUrl);
  let feed: RowFeed | null = null;
  let counts = emptyFilterCounts();
  let dump: { url: string; sha256: string | null; fetchedAt: string } | null = null;

  /** A sample reads only as far as it needs; the stream is closed before anything is written. */
  async function openSample(ctx: SourceRunContext, size: number): Promise<RowFeed> {
    dump = { url: csvUrl, sha256: null, fetchedAt: new Date().toISOString() };
    const lines = openLines(csvUrl, isUrl ? { http: ctx.http } : {});
    const streamed = feedOf(lines, counts);
    try {
      const { rows } = await streamed.take(size, false);
      return {
        take: async (n) => {
          const part = rows.splice(0, n);
          return { rows: part, done: rows.length === 0 };
        },
        close: async () => {},
      };
    } finally {
      await streamed.close();
    }
  }

  async function openFull(ctx: SourceRunContext): Promise<RowFeed> {
    if (!isUrl) {
      dump = { url: csvUrl, sha256: null, fetchedAt: new Date().toISOString() };
      return feedOf(openLines(csvUrl), counts);
    }
    const file = await ctx.http.download(csvUrl);
    ctx.log.info('OFF export ready.', { bytes: file.bytes, cache: file.cache });
    dump = { url: file.url, sha256: file.sha256, fetchedAt: file.fetchedAt };
    return feedOf(openLines(file.path, { gzip: true }), counts);
  }

  return {
    key: OFF_KEY,
    job: OFF_JOB,
    version: OFF_VERSION,
    recordKind: 'product',
    capabilities: {
      supportsDelta: false,
      // The export holds every product, so one missing from a clean full run left the Canadian set.
      supportsDeactivation: true,
      storeSpecificPricing: false,
      contact: 'email',
    },
    // Parts come from one open file or stream; no request goes out between them.
    politenessDelayMs: 0,

    validateConfiguration() {
      if (!Number.isInteger(extractSize) || extractSize < 1) {
        throw new ConfigurationError(`OFF extract size must be a positive integer.`);
      }
    },

    async plan(ctx) {
      counts = emptyFilterCounts();
      feed = ctx.sampleSize !== null ? await openSample(ctx, ctx.sampleSize) : await openFull(ctx);
      return [{ part: 1 }];
    },

    async fetch(step): Promise<FetchResult<OffStep>> {
      if (!feed || !dump) throw new Error('off: fetch before plan');
      const { rows, done } = await feed.take(extractSize);
      return {
        response: {
          body: toExtract(rows),
          fetchedAt: dump.fetchedAt,
          url: dump.url,
          status: 200,
          contentType: EXTRACT_CONTENT_TYPE,
        },
        next: done ? [] : [{ part: step.part + 1 }],
        dump: step.part === 1 ? dump : undefined,
        events: [filterEvent(counts)],
      };
    },

    parse(raw: RawPayload): ParseResult {
      return { records: parseExtract(raw.body).map((r) => toProductRecord(r, raw.fetchedAt)) };
    },

    async dispose() {
      await feed?.close();
      feed = null;
    },
  };
}
