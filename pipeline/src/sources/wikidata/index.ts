// Wikidata ownership source (SOURCES.md S17, PLAN P3.12, D-065).
//
//   plan     the OFF brand strings, most frequent first (public.off_brand_strings)
//   match    ≤ 50 strings per SPARQL query → one item per string, or none (map.ts pickCandidate);
//            the candidates' classes and industries this run hasn't seen get one more query
//   entities ≤ 50 items per query: their facts and owner statements, plus the statements of the
//            previous hop's items that point at them. Each response writes its items, then the
//            edges from the previous hop, whose endpoints were written by an earlier response.
//            Owners become the next hop, up to MAX_HOPS above the match.
//
// WDQS allows one client 60 s of query time a minute; queries go one at a time through the polite
// client (1 req/s, one Retry-After wait on a 429, then the run stops). robots.txt disallows
// /sparql for crawlers, so the endpoint is a documented-API exemption (owner-approved, D-065).
// A sample counts matched brand items, not records (`samplesItself`).
import type { ServiceClient } from '../../db/client.ts';
import { getServiceClient } from '../../db/client.ts';
import { DatabaseError } from '../../errors.ts';
import type {
  FetchResult,
  ParseResult,
  RawPayload,
  RecordBatch,
  Source,
  SourceEvent,
  SourceRunContext,
} from '../source.ts';
import {
  type BrandString,
  type ClassTable,
  type Envelope,
  MAX_CLASSES,
  MAX_LABELS,
  type MatchDecision,
  type MatchTier,
  WD_JOB,
  WD_KEY,
  WD_VERSION,
  type WdStep,
  candidateClasses,
  classFlagsOf,
  decideMatches,
  hitSteps,
  labelVariants,
  nextHop,
  noFlags,
  parseEnvelope,
  recordsOf,
  usableBrand,
} from './map.ts';
import { WD_ENDPOINT, classQuery, entitiesQuery, matchQuery } from './sparql.ts';

export { WD_JOB, WD_KEY, WD_VERSION } from './map.ts';

const SPARQL_JSON = 'application/sparql-results+json';
const JSON_TYPE = 'application/json';
/** WDQS stops a query at 60 s; the request waits a little longer for the error body. */
const WD_TIMEOUT_MS = 75_000;
const PAGE = 1000;

export interface WikidataSourceOptions {
  endpoint?: string;
  /** The OFF brand strings, most frequent first. Defaults to public.off_brand_strings(). */
  loadBrands?: () => Promise<BrandString[]>;
  labelsPerQuery?: number;
}

/** Every row of public.off_brand_strings(), paged past PostgREST's row cap. */
export async function loadOffBrandStrings(
  db: ServiceClient = getServiceClient(),
): Promise<BrandString[]> {
  const out: BrandString[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .rpc('off_brand_strings')
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) throw new DatabaseError(`Reading OFF brand strings failed: ${error.message}`, error);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return out;
  }
}

interface MatchCounts {
  strings: number;
  matched: number;
  ambiguous: number;
  unmatched: number;
  /** Strings whose item another string already matched (e.g. "PC" and "President's Choice"). */
  sameItem: number;
  byTier: Record<MatchTier, number>;
  byRole: { brand: number; company: number };
  /** Product rows behind the matched strings. */
  products: number;
}

const emptyMatchCounts = (): MatchCounts => ({
  strings: 0,
  matched: 0,
  ambiguous: 0,
  unmatched: 0,
  sameItem: 0,
  byTier: { single: 0, CA: 0, 'brand-class': 0, US: 0 },
  byRole: { brand: 0, company: 0 },
  products: 0,
});

export function createWikidataSource(
  options: WikidataSourceOptions = {},
): Source<'company', WdStep> {
  const endpoint = options.endpoint ?? WD_ENDPOINT;
  const perQuery = options.labelsPerQuery ?? MAX_LABELS;
  const loadBrands = options.loadBrands ?? (() => loadOffBrandStrings());
  let brands: BrandString[] = [];
  let matched = new Set<string>();
  let expanded = new Set<string>();
  let counts = emptyMatchCounts();
  /** Class and industry flags looked up this run (D-066). */
  let classCache: ClassTable = {};
  let entitySteps = 0;
  let maxHop = 0;

  const query = (ctx: SourceRunContext, sparql: string) =>
    ctx.http.request({
      url: endpoint,
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: SPARQL_JSON,
      },
      body: new URLSearchParams({ query: sparql }).toString(),
    });

  return {
    key: WD_KEY,
    job: WD_JOB,
    version: WD_VERSION,
    recordKind: 'company',
    capabilities: {
      supportsDelta: false,
      // A run only sees items reached from OFF brand strings, never all of Wikidata.
      supportsDeactivation: false,
      storeSpecificPricing: false,
      samplesItself: true,
    },
    robotsExemptions: [
      {
        prefix: WD_ENDPOINT,
        docs: 'https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual',
      },
    ],
    timeoutMs: WD_TIMEOUT_MS,
    // WDQS throttles a client that used its 60 s of query time a minute with a short 429 (P3.13:
    // the full run drew one after ~340 queries, and the service answered again within 90 s).
    throttle: { maxRetryAfterMs: 5 * 60_000, missingRetryAfterMs: 60_000 },

    async plan(ctx) {
      matched = new Set();
      expanded = new Set();
      counts = emptyMatchCounts();
      classCache = {};
      entitySteps = 0;
      maxHop = 0;
      brands = (await loadBrands()).filter((b) => usableBrand(b.brand));
      ctx.log.info('OFF brand strings read.', { usable: brands.length });
      return brands.length > 0 ? [{ kind: 'match', index: 0 }] : [];
    },

    async fetch(step, ctx): Promise<FetchResult<WdStep>> {
      if (step.kind === 'match') {
        const batch = brands.slice(step.index, step.index + perQuery);
        const sparql = matchQuery([...new Set(batch.flatMap((b) => labelVariants(b.brand)))]);
        const res = await query(ctx, sparql);
        const result: unknown = JSON.parse(res.body);

        // Class and industry flags, asked only for the ones this run hasn't seen.
        const used = candidateClasses(result);
        const fresh = used.filter((q) => !(q in classCache));
        const classQueries: string[] = [];
        const classResults: unknown[] = [];
        for (let i = 0; i < fresh.length; i += MAX_CLASSES) {
          const chunk = fresh.slice(i, i + MAX_CLASSES);
          const q = classQuery(chunk);
          const r: unknown = JSON.parse((await query(ctx, q)).body);
          classQueries.push(q);
          classResults.push(r);
          Object.assign(classCache, classFlagsOf(r, chunk));
        }
        const classes: ClassTable = Object.fromEntries(
          used.map((q) => [q, classCache[q] ?? noFlags()]),
        );
        const decisions = decideMatches(
          batch.map((b) => b.brand),
          result,
          classes,
        );
        const productsOf = new Map(batch.map((b) => [b.brand, b.products]));

        const hits: MatchDecision[] = [];
        const considered: MatchDecision[] = [];
        for (const d of decisions) {
          const room = ctx.sampleSize === null || matched.size < ctx.sampleSize;
          if (!room) break;
          considered.push(d);
          counts.strings++;
          if (d.status !== 'matched' || !d.qid) {
            counts[d.status === 'ambiguous' ? 'ambiguous' : 'unmatched']++;
            continue;
          }
          counts.matched++;
          counts.products += productsOf.get(d.brand) ?? 0;
          if (d.tier) counts.byTier[d.tier]++;
          if (matched.has(d.qid)) {
            counts.sameItem++;
            continue;
          }
          matched.add(d.qid);
          counts.byRole[d.role ?? 'brand']++;
          hits.push(d);
        }
        const nextIndex = step.index + perQuery;
        const more =
          nextIndex < brands.length && (ctx.sampleSize === null || matched.size < ctx.sampleSize);
        const next: WdStep[] = [...hitSteps(hits, expanded)];
        if (more) next.push({ kind: 'match', index: nextIndex });

        const env: Envelope = {
          kind: 'match',
          brands: batch.map((b) => b.brand),
          query: sparql,
          result,
          classQueries,
          classResults,
          classes,
        };
        const event: SourceEvent = {
          severity: 'info',
          eventType: 'wikidata_match',
          message:
            `Brand strings so far: ${counts.strings}; matched ${counts.matched} ` +
            `(${matched.size} items), ambiguous ${counts.ambiguous}, unmatched ${counts.unmatched}.`,
          details: {
            ...counts,
            byTier: { ...counts.byTier },
            byRole: { ...counts.byRole },
            items: matched.size,
            usableStrings: brands.length,
            decisions: considered.map((d) => ({
              brand: d.brand,
              status: d.status,
              candidates: d.candidates,
              qid: d.qid ?? null,
              tier: d.tier ?? null,
            })),
          },
        };
        return {
          response: {
            body: JSON.stringify(env),
            fetchedAt: res.fetchedAt,
            url: res.url,
            status: res.status,
            contentType: JSON_TYPE,
          },
          next,
          events: [event],
        };
      }

      const sparql = entitiesQuery(
        step.items.map((i) => i.qid),
        step.children.map((c) => c.qid),
      );
      const res = await query(ctx, sparql);
      const env: Envelope = {
        kind: 'entities',
        hop: step.hop,
        items: step.items,
        children: step.children,
        query: sparql,
        result: JSON.parse(res.body) as unknown,
      };
      entitySteps++;
      maxHop = Math.max(maxHop, step.hop);
      const next = nextHop(env, expanded);
      const unnamed = recordsOf(env, res.fetchedAt).unnamed;
      return {
        response: {
          body: JSON.stringify(env),
          fetchedAt: res.fetchedAt,
          url: res.url,
          status: res.status,
          contentType: JSON_TYPE,
        },
        next,
        events:
          unnamed.length > 0
            ? [
                {
                  severity: 'warn',
                  eventType: 'wikidata_unnamed',
                  message: `${unnamed.length} items have no usable label and were not written.`,
                  details: { hop: step.hop, qids: unnamed, entitySteps, maxHop },
                },
              ]
            : undefined,
      };
    },

    parse(raw: RawPayload): ParseResult {
      const env = parseEnvelope(raw.body);
      if (env.kind === 'match') return { records: [] };
      const r = recordsOf(env, raw.fetchedAt);
      // Entities first, then the edges whose endpoints they are.
      const batches: RecordBatch[] = [
        { kind: 'brand', records: r.brands },
        { kind: 'brand_ownership', records: r.brandEdges },
        { kind: 'company_ownership', records: r.companyEdges },
      ];
      return { records: r.companies, batches: batches.filter((b) => b.records.length > 0) };
    },
  };
}
