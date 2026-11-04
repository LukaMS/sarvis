// SEC EDGAR Exhibit 21 subsidiaries (SOURCES.md S20, PLAN P3.16, D-074).
//
//   plan         companies with a SEC CIK, by slug, plus a name index of every company and brand
//                and every existing edge. Steps are chained one company at a time, so a
//                sample stops after N 10-K filings.
//   submissions  data.sec.gov submissions JSON: the latest 10-K (20-F/40-F filers, 10-Ks older
//                than 3 years and companies with none are counted and skipped). Not stored.
//   index        the filing's index page: its EX-21 documents. Not stored. An exhibit an earlier
//                completed run of this mode already stored is skipped (filings never change).
//   exhibit      the Exhibit 21 document, parsed and matched by exact name key to the catalog, and
//                stored as one envelope per exhibit. Parse gives the filing `document`, the CIK's
//                `company_sources` row, and a pending edge per matched subsidiary.
//
// SEC asks for a declared User-Agent with an email and refuses one with a URL (`email_only`).
import type { ServiceClient } from '../../db/client.ts';
import { getServiceClient } from '../../db/client.ts';
import { DatabaseError } from '../../errors.ts';
import type { FetchResult, ParseResult, RawPayload, Source, SourceRunContext } from '../source.ts';
import {
  ENVELOPE_FORMAT,
  type Envelope,
  type Filing,
  type KnownEdges,
  NameIndex,
  SEC_DATA,
  SEC_JOB,
  SEC_KEY,
  SEC_VERSION,
  SEC_WWW,
  type SecCompany,
  exhibit21Of,
  filingIndexUrl,
  isEnvelope,
  latestFiling,
  matchCounts,
  matchSubsidiaries,
  parseEnvelope,
  parseExhibit21,
  recordsOf,
  submissionsUrl,
} from './map.ts';

export { SEC_JOB, SEC_KEY, SEC_VERSION } from './map.ts';

const PAGE = 1000;
const LIVE = '(merged,rejected)';

export type SecStep =
  | { kind: 'submissions'; i: number }
  | { kind: 'index'; company: SecCompany; filing: Filing }
  | {
      kind: 'exhibit';
      company: SecCompany;
      filing: Filing;
      exhibit: { url: string; type: string };
    };

export interface SecCatalog {
  companies: SecCompany[];
  index: NameIndex;
  known: KnownEdges;
}

export interface SecEdgarSourceOptions {
  www?: string;
  data?: string;
  /** The companies, name index and known edges. Defaults to loadSecCatalog(). */
  loadCatalog?: () => Promise<SecCatalog>;
  now?: () => Date;
}

async function paged<T>(
  read: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await read(page * PAGE, (page + 1) * PAGE - 1);
    if (error) throw new DatabaseError(`Reading ${what} failed: ${error.message}`, error);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return out;
  }
}

/**
 * Companies with a CIK, every live company and brand by name, and every existing edge (any source,
 * status or dates): an edge row another source wrote is never written over (D-074).
 */
export async function loadSecCatalog(db: ServiceClient = getServiceClient()): Promise<SecCatalog> {
  const companyRows = await paged(
    (a, b) =>
      db
        .from('companies')
        .select('id, slug, name, legal_name, aliases, wikidata_qid, sec_cik, country')
        .not('status', 'in', LIVE)
        .order('slug')
        .range(a, b),
    'companies',
  );
  const brandRows = await paged(
    (a, b) =>
      db
        .from('brands')
        .select('id, slug, name, aliases')
        .not('status', 'in', LIVE)
        .order('slug')
        .range(a, b),
    'brands',
  );
  const companyEdges = await paged(
    (a, b) =>
      db
        .from('company_ownership')
        .select('parent_company_id, child_company_id')
        .order('id')
        .range(a, b),
    'company_ownership',
  );
  const brandEdges = await paged(
    (a, b) => db.from('brand_ownership').select('brand_id, company_id').order('id').range(a, b),
    'brand_ownership',
  );

  const index = new NameIndex();
  for (const c of companyRows) {
    index.add({ kind: 'company', id: c.id, slug: c.slug, country: c.country }, [
      c.name,
      c.legal_name,
      ...(c.aliases ?? []),
    ]);
  }
  for (const b of brandRows) {
    index.add({ kind: 'brand', id: b.id, slug: b.slug }, [b.name, ...(b.aliases ?? [])]);
  }
  return {
    companies: companyRows.flatMap((c) =>
      c.sec_cik
        ? [
            {
              id: c.id,
              slug: c.slug,
              qid: c.wikidata_qid,
              cik: c.sec_cik,
              name: c.name,
              names: [c.name, c.legal_name, ...(c.aliases ?? [])].filter((n): n is string => !!n),
            },
          ]
        : [],
    ),
    index,
    known: {
      company: new Set(companyEdges.map((e) => `${e.parent_company_id}>${e.child_company_id}`)),
      brand: new Set(brandEdges.map((e) => `${e.brand_id}>${e.company_id}`)),
    },
  };
}

interface Counts {
  companies: number;
  filings: number;
  foreign: number;
  stale: number;
  no10k: number;
  noExhibit: number;
  alreadyStored: number;
  exhibits: number;
}

const emptyCounts = (): Counts => ({
  companies: 0,
  filings: 0,
  foreign: 0,
  stale: 0,
  no10k: 0,
  noExhibit: 0,
  alreadyStored: 0,
  exhibits: 0,
});

const JSON_TYPE = 'application/json';

export function createSecEdgarSource(
  options: SecEdgarSourceOptions = {},
): Source<'document', SecStep> {
  const www = options.www ?? SEC_WWW;
  const data = options.data ?? SEC_DATA;
  const loadCatalog = options.loadCatalog ?? (() => loadSecCatalog());
  const now = options.now ?? (() => new Date());
  let catalog: SecCatalog = {
    companies: [],
    index: new NameIndex(),
    known: { company: new Set(), brand: new Set() },
  };
  let counts = emptyCounts();

  const summary = (): string =>
    `Companies ${counts.companies}: 10-K filings ${counts.filings}, exhibits read ` +
    `${counts.exhibits}, already stored ${counts.alreadyStored}, no Exhibit 21 ` +
    `${counts.noExhibit}, 20-F/40-F ${counts.foreign}, stale ${counts.stale}, no 10-K ${counts.no10k}.`;

  async function fetchSubmissions(
    step: { i: number },
    ctx: SourceRunContext,
  ): Promise<FetchResult<SecStep>> {
    const company = catalog.companies[step.i] as SecCompany;
    const res = await ctx.http.request({
      url: submissionsUrl(company.cik, data),
      headers: { accept: JSON_TYPE },
    });
    counts.companies++;
    const outcome = latestFiling(res.body, now());
    const next: SecStep[] = [];
    if (outcome.status === 'ok') {
      counts.filings++;
      next.push({ kind: 'index', company, filing: outcome.filing });
    } else if (outcome.status === 'foreign') counts.foreign++;
    else if (outcome.status === 'stale') counts.stale++;
    else counts.no10k++;
    const more = step.i + 1 < catalog.companies.length;
    const wanted = ctx.sampleSize === null || counts.filings < ctx.sampleSize;
    if (more && wanted) next.push({ kind: 'submissions', i: step.i + 1 });
    return {
      response: {
        body: res.body,
        fetchedAt: res.fetchedAt,
        url: res.url,
        status: res.status,
        contentType: JSON_TYPE,
      },
      skipRaw: true,
      next,
      events:
        outcome.status === 'ok'
          ? undefined
          : [
              {
                severity: 'info',
                eventType: 'sec_skipped',
                message: `${company.slug}: no 10-K to read (${outcome.status}).`,
                details: { slug: company.slug, cik: company.cik, ...outcome },
              },
            ],
    };
  }

  return {
    key: SEC_KEY,
    job: SEC_JOB,
    version: SEC_VERSION,
    recordKind: 'document',
    capabilities: {
      supportsDelta: false,
      supportsDeactivation: false,
      storeSpecificPricing: false,
      contact: 'email_only',
      // A sample counts 10-K filings, not the records each one gives.
      samplesItself: true,
      // A re-run skips exhibits already stored, so finding nothing new is normal.
      changesOnly: true,
    },

    async plan(ctx) {
      counts = emptyCounts();
      catalog = await loadCatalog();
      ctx.log.info('Companies with a SEC CIK read.', { companies: catalog.companies.length });
      return catalog.companies.length > 0 ? [{ kind: 'submissions', i: 0 }] : [];
    },

    async fetch(step, ctx): Promise<FetchResult<SecStep>> {
      if (step.kind === 'submissions') return fetchSubmissions(step, ctx);

      if (step.kind === 'index') {
        const res = await ctx.http.request({
          url: filingIndexUrl(step.company.cik, step.filing.accession, www),
        });
        const exhibits = exhibit21Of(res.body, www);
        const stored = await ctx.storedRequestUrls(exhibits.map((e) => e.url));
        const fresh = exhibits.filter((e) => !stored.has(e.url));
        if (exhibits.length === 0) counts.noExhibit++;
        counts.alreadyStored += exhibits.length - fresh.length;
        return {
          response: {
            body: res.body,
            fetchedAt: res.fetchedAt,
            url: res.url,
            status: res.status,
            contentType: 'text/html',
          },
          skipRaw: true,
          next: fresh.map((exhibit) => ({
            kind: 'exhibit',
            company: step.company,
            filing: step.filing,
            exhibit,
          })),
          events: [
            {
              severity: exhibits.length === 0 ? 'warn' : 'info',
              eventType: 'sec_filing',
              message:
                exhibits.length === 0
                  ? `${step.company.slug}: ${step.filing.form} ${step.filing.accession} has no Exhibit 21.`
                  : `${step.company.slug}: ${step.filing.form} ${step.filing.accession}, ` +
                    `${exhibits.length} Exhibit 21 document(s), ${exhibits.length - fresh.length} already stored.`,
              details: {
                slug: step.company.slug,
                accession: step.filing.accession,
                exhibits,
                summary: summary(),
              },
            },
          ],
        };
      }

      const res = await ctx.http.request({ url: step.exhibit.url });
      counts.exhibits++;
      const subsidiaries = matchSubsidiaries(
        step.company,
        parseExhibit21(res.body),
        catalog.index,
        catalog.known,
      );
      const c = matchCounts(subsidiaries);
      const env: Envelope = {
        format: ENVELOPE_FORMAT,
        company: { slug: step.company.slug, qid: step.company.qid, cik: step.company.cik },
        filing: step.filing,
        exhibit: step.exhibit,
        subsidiaries,
        html: res.body,
      };
      ctx.log.info('Exhibit 21 read.', {
        slug: step.company.slug,
        subsidiaries: subsidiaries.length,
        ...c,
      });
      return {
        response: {
          body: JSON.stringify(env),
          fetchedAt: res.fetchedAt,
          url: res.url,
          status: res.status,
          contentType: JSON_TYPE,
        },
        events: [
          {
            severity: subsidiaries.length === 0 ? 'warn' : 'info',
            eventType: 'sec_exhibit21',
            message:
              `${step.company.slug}: ${subsidiaries.length} subsidiaries, matched ${c.match}, ` +
              `edge exists ${c.known}, self ${c.self}, ambiguous ${c.ambiguous}, other country ${c.country}, unmatched ${c.none}.`,
            details: {
              slug: step.company.slug,
              accession: step.filing.accession,
              exhibit: step.exhibit.url,
              subsidiaries: subsidiaries.length,
              ...c,
              matched: subsidiaries.flatMap((s) =>
                s.status === 'match' || s.status === 'known'
                  ? [{ name: s.name, status: s.status, target: s.target }]
                  : [],
              ),
              summary: summary(),
            },
          },
        ],
      };
    },

    parse(raw: RawPayload): ParseResult {
      // The submissions JSON and the filing index aren't stored (skipRaw) and give no records.
      if (!isEnvelope(raw.body)) return { records: [] };
      const r = recordsOf(parseEnvelope(raw.body), raw.fetchedAt);
      return {
        records: r.documents,
        batches: [
          { kind: 'company_enrichment', records: r.enrichments },
          ...(r.companyEdges.length > 0
            ? [{ kind: 'company_ownership' as const, records: r.companyEdges }]
            : []),
          ...(r.brandEdges.length > 0
            ? [{ kind: 'brand_ownership' as const, records: r.brandEdges }]
            : []),
        ],
      };
    },
  };
}
