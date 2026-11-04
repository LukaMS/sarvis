// Wikipedia company summaries (SOURCES.md S19, PLAN P3.14, D-071).
//
//   plan      the companies with an enwiki title (from Wikidata), by slug, with the stored summary;
//             a sample takes the first N
//   check     ≤ 50 titles per Action API query: the current revision id of each page. Not stored
//             (skipRaw): it yields no records. Pages whose revision moved, that have no document
//             yet, or whose stored summary predates tidySummary are queued for extracts, 20 at a
//             time, across check steps.
//   extracts  ≤ 20 titles per query: lead-section plain text, canonical URL and revision id. Stored,
//             then parsed into a `documents` row per page and a company enrichment per company.
//
// So a run that finds nothing changed fetches only the checks and stores no raw file
// (`changesOnly`). Requests are serial through the polite client (1 req/s) with `maxlag`; a
// maxlag answer waits its Retry-After and tries again. robots.txt disallows /w/ for crawlers, so
// the documented API endpoint is an exemption (D-065).
import type { ServiceClient } from '../../db/client.ts';
import { getServiceClient } from '../../db/client.ts';
import { DatabaseError, SourceResponseError } from '../../errors.ts';
import type { HttpResponse } from '../../http/client.ts';
import { sleep } from '../../http/retry.ts';
import type { FetchResult, ParseResult, RawPayload, Source, SourceRunContext } from '../source.ts';
import {
  CHECK_BATCH,
  ENVELOPE_FORMAT,
  EXTRACT_BATCH,
  type Envelope,
  WP_API,
  WP_JOB,
  WP_KEY,
  WP_VERSION,
  type WpCompany,
  type WpRequest,
  type WpStep,
  apiErrorOf,
  decideCheck,
  emptyCheckCounts,
  parseEnvelope,
  queryUrl,
  recordsOf,
} from './map.ts';

export { WP_JOB, WP_KEY, WP_VERSION } from './map.ts';

const JSON_TYPE = 'application/json';
const PAGE = 1000;
/** Tries per request while the API answers `maxlag`. */
const MAXLAG_TRIES = 5;
const MAXLAG_WAIT_CAP_MS = 60_000;

export interface WikipediaSourceOptions {
  api?: string;
  /** The companies to summarise, by slug. Defaults to loadWikipediaCompanies(). */
  loadCompanies?: () => Promise<WpCompany[]>;
}

/** Companies with an enwiki title and a QID, not merged or rejected, by slug. */
export async function loadWikipediaCompanies(
  db: ServiceClient = getServiceClient(),
): Promise<WpCompany[]> {
  const out: WpCompany[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from('companies')
      .select(
        'wikidata_qid, wikipedia_title, wikipedia_revision_id, wikipedia_document_id, document:documents!companies_wikipedia_document_id_fkey(summary)',
      )
      .not('wikipedia_title', 'is', null)
      .not('wikidata_qid', 'is', null)
      .not('status', 'in', '(merged,rejected)')
      .order('slug')
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) throw new DatabaseError(`Reading companies failed: ${error.message}`, error);
    for (const r of data ?? []) {
      out.push({
        qid: r.wikidata_qid as string,
        title: r.wikipedia_title as string,
        revisionId: r.wikipedia_revision_id,
        hasDocument: r.wikipedia_document_id != null,
        summary: r.document?.summary ?? null,
      });
    }
    if ((data ?? []).length < PAGE) return out;
  }
}

/** A GET to the Action API, waiting out `maxlag` answers. Never cached: the check is the cache. */
async function apiGet(ctx: SourceRunContext, url: string): Promise<HttpResponse> {
  for (let attempt = 1; ; attempt++) {
    const res = await ctx.http.request({ url, cacheTtlMs: 0, headers: { accept: JSON_TYPE } });
    const err = apiErrorOf(res.body);
    if (!err) return res;
    if (err.code === 'maxlag' && attempt < MAXLAG_TRIES) {
      const seconds = Number(res.headers['retry-after']);
      const waitMs = Math.min(
        (Number.isFinite(seconds) && seconds > 0 ? seconds : 5) * 1000,
        MAXLAG_WAIT_CAP_MS,
      );
      ctx.log.warn('Wikipedia replicas are lagging; waiting.', { attempt, waitMs, info: err.info });
      await sleep(waitMs, ctx.signal);
      continue;
    }
    throw new SourceResponseError(
      err.code === 'maxlag' ? 503 : 502,
      `Wikipedia API error ${err.code}: ${err.info}`,
    );
  }
}

const envelopeBody = (kind: Envelope['kind'], pages: WpRequest[], body: string): string =>
  JSON.stringify({ format: ENVELOPE_FORMAT, kind, pages, result: JSON.parse(body) as unknown });

export function createWikipediaSource(
  options: WikipediaSourceOptions = {},
): Source<'document', WpStep> {
  const api = options.api ?? WP_API;
  const loadCompanies = options.loadCompanies ?? (() => loadWikipediaCompanies());
  let checks = emptyCheckCounts();
  let checkSteps = 0;
  let checksDone = 0;
  /** Changed pages not yet in an extracts step. */
  let pending: WpRequest[] = [];

  /** Extract steps of EXTRACT_BATCH; the remainder waits unless `flush`. */
  const takeExtractSteps = (flush: boolean): WpStep[] => {
    const steps: WpStep[] = [];
    while (pending.length >= EXTRACT_BATCH || (flush && pending.length > 0)) {
      steps.push({ kind: 'extracts', pages: pending.splice(0, EXTRACT_BATCH) });
    }
    return steps;
  };

  return {
    key: WP_KEY,
    job: WP_JOB,
    version: WP_VERSION,
    recordKind: 'document',
    capabilities: {
      supportsDelta: false,
      supportsDeactivation: false,
      storeSpecificPricing: false,
      // A sample counts companies checked, not the two records each changed page gives.
      samplesItself: true,
      changesOnly: true,
    },
    robotsExemptions: [{ prefix: api, docs: 'https://www.mediawiki.org/wiki/API:Etiquette' }],

    async plan(ctx) {
      checks = emptyCheckCounts();
      checksDone = 0;
      pending = [];
      let companies = await loadCompanies();
      if (ctx.sampleSize !== null) companies = companies.slice(0, ctx.sampleSize);
      const steps: WpStep[] = [];
      for (let i = 0; i < companies.length; i += CHECK_BATCH) {
        steps.push({ kind: 'check', companies: companies.slice(i, i + CHECK_BATCH) });
      }
      checkSteps = steps.length;
      ctx.log.info('Companies with a Wikipedia title read.', {
        companies: companies.length,
        checkSteps,
      });
      return steps;
    },

    async fetch(step, ctx): Promise<FetchResult<WpStep>> {
      if (step.kind === 'check') {
        const url = queryUrl(
          'check',
          step.companies.map((c) => c.title),
          api,
        );
        const res = await apiGet(ctx, url);
        const decided = decideCheck(step.companies, JSON.parse(res.body));
        for (const k of Object.keys(checks) as (keyof typeof checks)[]) {
          checks[k] += decided.counts[k];
        }
        checksDone++;
        pending.push(...decided.changed);
        const next = takeExtractSteps(checksDone >= checkSteps);
        return {
          response: {
            body: envelopeBody(
              'check',
              step.companies.map((c) => ({ qid: c.qid, title: c.title })),
              res.body,
            ),
            fetchedAt: res.fetchedAt,
            url: res.url,
            status: res.status,
            contentType: JSON_TYPE,
          },
          skipRaw: true,
          next,
          events: [
            {
              severity: 'info',
              eventType: 'wikipedia_check',
              message:
                `Pages checked so far: ${checks.checked}; changed ${checks.changed}, retidy ` +
                `${checks.retidy}, unchanged ` +
                `${checks.unchanged}, missing ${checks.missing}, disambiguation ${checks.disambiguation}.`,
              details: { ...checks, skipped: decided.skipped },
            },
          ],
        };
      }

      const res = await apiGet(
        ctx,
        queryUrl(
          'extracts',
          step.pages.map((p) => p.title),
          api,
        ),
      );
      const body = envelopeBody('extracts', step.pages, res.body);
      const { skipped } = recordsOf(parseEnvelope(body), res.fetchedAt);
      return {
        response: {
          body,
          fetchedAt: res.fetchedAt,
          url: res.url,
          status: res.status,
          contentType: JSON_TYPE,
        },
        events:
          skipped.length > 0
            ? [
                {
                  severity: 'warn',
                  eventType: 'wikipedia_skipped',
                  message: `${skipped.length} pages gave no summary and were not written.`,
                  details: { skipped },
                },
              ]
            : undefined,
      };
    },

    parse(raw: RawPayload): ParseResult {
      const env = parseEnvelope(raw.body);
      const r = recordsOf(env, raw.fetchedAt);
      // Documents first: an enrichment names its document by URL.
      return {
        records: r.documents,
        batches:
          r.enrichments.length > 0 ? [{ kind: 'company_enrichment', records: r.enrichments }] : [],
      };
    },
  };
}
