// Corporations Canada identity check (SOURCES.md S21, PLAN P3.18, D-075).
//
//   plan  the catalog's Canadian companies, by slug
//   scan  the two active-corporation CSVs (downloaded to the dump cache, so an unchanged file costs
//         one conditional request), matched by exact name key. One envelope is stored per run,
//         holding only the matches, never a whole file. Parse gives one enrichment per match.
//
// A sample scans the same files and keeps the first N matches by slug, because matches are rare
// (about 20 in 700k rows). An ambiguous name is skipped and counted, not guessed.
import type { ServiceClient } from '../../db/client.ts';
import { getServiceClient } from '../../db/client.ts';
import { DatabaseError } from '../../errors.ts';
import { openLines } from '../../http/lines.ts';
import type { FetchResult, ParseResult, RawPayload, Source } from '../source.ts';
import {
  CC_DATASET_URL,
  CC_FILES,
  CC_JOB,
  CC_KEY,
  CC_VERSION,
  type CcCompany,
  CorpMatcher,
  ENVELOPE_FORMAT,
  type Envelope,
  type FileInfo,
  parseEnvelope,
  recordsOf,
} from './map.ts';

export { CC_JOB, CC_KEY, CC_VERSION } from './map.ts';

const PAGE = 1000;

export interface CcStep {
  kind: 'scan';
}

export interface CorpCanadaSourceOptions {
  /** The files to read. Defaults to the two active English CSVs. */
  files?: readonly string[];
  /** The companies to confirm, by slug. Defaults to loadCanadianCompanies(). */
  loadCompanies?: () => Promise<CcCompany[]>;
}

/** Companies with `country = 'CA'`, not merged or rejected, by slug. */
export async function loadCanadianCompanies(
  db: ServiceClient = getServiceClient(),
): Promise<CcCompany[]> {
  const out: CcCompany[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from('companies')
      .select('slug, name, legal_name')
      .eq('country', 'CA')
      .not('status', 'in', '(merged,rejected)')
      .order('slug')
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) throw new DatabaseError(`Reading companies failed: ${error.message}`, error);
    for (const r of data ?? []) {
      out.push({ slug: r.slug, name: r.name, legalName: r.legal_name });
    }
    if ((data ?? []).length < PAGE) return out;
  }
}

export function createCorpCanadaSource(
  options: CorpCanadaSourceOptions = {},
): Source<'company_enrichment', CcStep> {
  const urls = options.files ?? CC_FILES;
  const loadCompanies = options.loadCompanies ?? (() => loadCanadianCompanies());
  let companies: CcCompany[] = [];

  return {
    key: CC_KEY,
    job: CC_JOB,
    version: CC_VERSION,
    recordKind: 'company_enrichment',
    capabilities: {
      supportsDelta: false,
      supportsDeactivation: false,
      storeSpecificPricing: false,
      // A sample counts matches, and every row must be read to know a match is the only one.
      samplesItself: true,
    },

    async plan(ctx) {
      companies = await loadCompanies();
      ctx.log.info('Canadian companies read.', { companies: companies.length });
      return [{ kind: 'scan' }];
    },

    async fetch(_step, ctx): Promise<FetchResult<CcStep>> {
      const matcher = new CorpMatcher(companies);
      const files: FileInfo[] = [];
      let fetchedAt = new Date().toISOString();
      let dump: FetchResult<CcStep>['dump'];
      for (const url of urls) {
        const file = await ctx.http.download(url);
        ctx.log.info('Corporations file ready.', { url, bytes: file.bytes, cache: file.cache });
        const counts = await matcher.scan(openLines(file.path, { gzip: false }), url);
        files.push({ ...counts, sha256: file.sha256, bytes: file.bytes });
        fetchedAt = file.fetchedAt;
        // The run holds one dump: the first and largest file. The envelope lists them all.
        dump ??= { url: file.url, sha256: file.sha256, fetchedAt: file.fetchedAt };
      }
      const found = matcher.result();
      const matches =
        ctx.sampleSize === null ? found.matches : found.matches.slice(0, ctx.sampleSize);
      const envelope: Envelope = { format: ENVELOPE_FORMAT, files, matches };
      return {
        response: {
          body: JSON.stringify(envelope),
          fetchedAt,
          url: CC_DATASET_URL,
          status: 200,
          contentType: 'application/json',
        },
        dump,
        events: [
          {
            severity: 'info',
            eventType: 'corp_canada_match',
            message:
              `Scanned ${files.reduce((n, f) => n + f.rows, 0)} rows for ${companies.length} ` +
              `companies: ${found.matches.length} confirmed, ${found.ambiguous.length} ambiguous, ` +
              `${found.shared.length} sharing a corporation.`,
            details: {
              companies: companies.length,
              files: files.map(({ url: file, rows, malformed, notActive }) => ({
                file,
                rows,
                malformed,
                notActive,
              })),
              confirmed: found.matches.length,
              kept: matches.length,
              ambiguous: found.ambiguous,
              shared: found.shared,
            },
          },
        ],
      };
    },

    parse(raw: RawPayload): ParseResult {
      return { records: recordsOf(parseEnvelope(raw.body), raw.fetchedAt) };
    },
  };
}
