// The fixture source (PLAN P2.17): about 20 synthetic OFF-shaped products served by an in-process
// HTTP server, so `pipeline run fixture` exercises the whole run path (robots.txt, the polite
// client, raw storage, parse, validation, upserts) without touching a real site. It also previews
// the OFF source's shape for Phase 3: paged search responses mapped to product records.
import { type RecordInputOf, cleanText, slugify } from '@sarvis/core';

import { SourceResponseError } from '../../errors.ts';
import { offGtin } from '../off/map.ts';
import type { FetchResult, ParseResult, RawPayload, Source } from '../source.ts';
import type { OffProduct } from './data.ts';
import { type FixtureServer, type FixtureServerOptions, startFixtureServer } from './server.ts';

export const FIXTURE_KEY = 'fixture';
export const FIXTURE_JOB = 'fixture-import';
export const FIXTURE_VERSION = '1.0.0';
export const FIXTURE_PAGE_SIZE = 5;
/** Canonical product pages, like world.openfoodfacts.org/product/<code>. Never fetched. */
export const FIXTURE_PRODUCT_URL = 'https://fixture.sarvis.test/product/';

export interface FixtureStep {
  page: number;
}

interface SearchResponse {
  count: number;
  page: number;
  page_count: number;
  products: OffProduct[];
}

function readSearch(body: string): SearchResponse {
  const data = JSON.parse(body) as Partial<SearchResponse>;
  if (!Array.isArray(data.products) || typeof data.count !== 'number') {
    throw new SourceResponseError(200, 'Fixture search response has no products or count.');
  }
  return data as SearchResponse;
}

const UNITS: Record<string, 'g' | 'ml'> = { g: 'g', ml: 'ml' };

export function toProductRecord(p: OffProduct, raw: RawPayload): RecordInputOf<'product'> {
  const quantity = Number(p.product_quantity);
  const unit = UNITS[String(p.product_quantity_unit ?? '').toLowerCase()];
  const sized = unit !== undefined && quantity > 0;
  return {
    gtin: offGtin(p.code),
    external_id: p.code,
    // Blank stays null, so validation reports a missing name as required_field.
    name: cleanText(p.product_name) as string,
    brand_text: cleanText(p.brands),
    quantity_text: cleanText(p.quantity),
    net_quantity: sized ? quantity : null,
    net_unit: sized ? unit : null,
    unit_parse_status: sized ? 'ok' : 'unparsed',
    label_codes: (p.labels_tags ?? [])
      .filter((t) => t.startsWith('en:'))
      .map((t) => slugify(t.slice(3))),
    source_modified_at:
      p.last_modified_t != null ? new Date(p.last_modified_t * 1000).toISOString() : null,
    source_key: FIXTURE_KEY,
    source_url: FIXTURE_PRODUCT_URL + encodeURIComponent(p.code),
    fetched_at: raw.fetchedAt,
    method: 'api',
    method_version: `${FIXTURE_JOB}@${FIXTURE_VERSION}`,
  };
}

export interface FixtureSourceOptions extends FixtureServerOptions {
  pageSize?: number;
  /** Called once the local server is listening (tests read its request log). */
  onStart?: (server: FixtureServer) => void;
}

export function createFixtureSource(
  options: FixtureSourceOptions = {},
): Source<'product', FixtureStep> {
  const pageSize = options.pageSize ?? FIXTURE_PAGE_SIZE;
  let server: FixtureServer | null = null;

  return {
    key: FIXTURE_KEY,
    job: FIXTURE_JOB,
    version: FIXTURE_VERSION,
    recordKind: 'product',
    capabilities: {
      supportsDelta: false,
      supportsDeactivation: false,
      storeSpecificPricing: false,
    },
    // The local server is ours; the client's 1 request per second per host still applies.
    politenessDelayMs: 0,

    async plan() {
      if (!server) {
        server = await startFixtureServer(options);
        options.onStart?.(server);
      }
      return [{ page: 1 }];
    },

    async fetch(step, ctx): Promise<FetchResult<FixtureStep>> {
      if (!server) throw new Error('fixture: fetch before plan');
      const url = `${server.url}/api/v2/search?page=${step.page}&page_size=${pageSize}`;
      // Always ask the server: the port changes every run, so a cache entry is never reused.
      const response = await ctx.http.request({ url, cacheTtlMs: 0 });
      const { page_count } = readSearch(response.body);
      return {
        response,
        next: step.page < page_count ? [{ page: step.page + 1 }] : [],
      };
    },

    parse(raw: RawPayload): ParseResult {
      const search = readSearch(raw.body);
      return {
        records: search.products.map((p) => toProductRecord(p, raw)),
        expectedTotal: search.count,
      };
    },

    async dispose() {
      await server?.close();
      server = null;
    },
  };
}
