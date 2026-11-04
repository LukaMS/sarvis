// Wikipedia summaries (SOURCES.md S19, PLAN P3.14, D-071): the pure parts. Query URLs, how a
// requested title resolves to a page, the revision check, the summary extract and the records.
import { type RecordInputOf, cleanText } from '@sarvis/core';

import { SchemaValidationError } from '../../errors.ts';

export const WP_KEY = 'wikipedia';
export const WP_JOB = 'wikipedia-summaries';
export const WP_VERSION = '1.0.0';
export const WP_METHOD_VERSION = `${WP_KEY}@${WP_VERSION}`;

export const WP_HOST = 'en.wikipedia.org';
export const WP_API = `https://${WP_HOST}/w/api.php`;
/** Titles per revision check (the Action API's limit for `titles`). */
export const CHECK_BATCH = 50;
/** Titles per extracts request (TextExtracts returns at most 20 intro extracts at once). */
export const EXTRACT_BATCH = 20;
/** The longest summary kept: the lead paragraph, cut at a sentence end (DATA_MODEL allows 2,000). */
export const SUMMARY_MAX = 1000;
/** Ask the API to refuse work while replicas lag more than this many seconds (API:Etiquette). */
export const MAXLAG_SECONDS = 5;
export const ENVELOPE_FORMAT = 'sarvis-wikipedia/1';

/** A company to summarise, as plan() reads it. */
export interface WpCompany {
  qid: string;
  title: string;
  /** The stored `companies.wikipedia_revision_id`. */
  revisionId: number | null;
  /** The company already links a Wikipedia document. */
  hasDocument: boolean;
}

/** A requested page in an envelope: the company's QID and the title it asked for. */
export interface WpRequest {
  qid: string;
  title: string;
}

export type WpStep =
  { kind: 'check'; companies: WpCompany[] } | { kind: 'extracts'; pages: WpRequest[] };

export interface Envelope {
  format: typeof ENVELOPE_FORMAT;
  kind: 'check' | 'extracts';
  pages: WpRequest[];
  result: unknown;
}

/** The Action API query for `titles`: revision ids, or the lead-section extracts as well. */
export function queryUrl(kind: 'check' | 'extracts', titles: string[], api = WP_API): string {
  const params: Record<string, string> = {
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    maxlag: String(MAXLAG_SECONDS),
    prop: kind === 'check' ? 'info|pageprops' : 'extracts|info|pageprops',
    ppprop: 'disambiguation',
    titles: titles.join('|'),
  };
  if (kind === 'extracts') {
    Object.assign(params, {
      inprop: 'url',
      exintro: '1',
      explaintext: '1',
      exlimit: String(EXTRACT_BATCH),
    });
  }
  return `${api}?${new URLSearchParams(params).toString()}`;
}

interface ApiPage {
  title?: string;
  ns?: number;
  pageid?: number;
  missing?: boolean;
  invalid?: boolean;
  lastrevid?: number;
  canonicalurl?: string;
  extract?: string;
  pageprops?: { disambiguation?: string };
}

interface ApiResult {
  error?: { code?: string; info?: string };
  query?: {
    normalized?: { from: string; to: string }[];
    redirects?: { from: string; to: string }[];
    pages?: ApiPage[];
  };
}

/** The API's error code, when the body is an error (e.g. `maxlag`). */
export function apiErrorOf(body: string): { code: string; info: string } | null {
  try {
    const r = JSON.parse(body) as ApiResult;
    if (r.error) return { code: r.error.code ?? 'unknown', info: r.error.info ?? '' };
  } catch {
    return { code: 'not_json', info: body.slice(0, 200) };
  }
  return null;
}

export type PageOutcome =
  | { status: 'ok'; page: Required<Pick<ApiPage, 'title' | 'lastrevid'>> & ApiPage }
  | { status: 'missing' | 'disambiguation' | 'not_article' | 'absent' };

/** What a requested title resolved to: normalisation, then up to 3 redirects. */
export function pageFor(result: unknown, requested: string): PageOutcome {
  const q = (result as ApiResult).query ?? {};
  const normalized = new Map((q.normalized ?? []).map((n) => [n.from, n.to]));
  const redirects = new Map((q.redirects ?? []).map((r) => [r.from, r.to]));
  let title = normalized.get(requested) ?? requested;
  for (let i = 0; i < 3 && redirects.has(title); i++) title = redirects.get(title) as string;
  const page = (q.pages ?? []).find((p) => p.title === title);
  if (!page) return { status: 'absent' };
  if (page.missing || page.invalid) return { status: 'missing' };
  if (page.ns !== 0 || page.lastrevid == null) return { status: 'not_article' };
  if (page.pageprops?.disambiguation !== undefined) return { status: 'disambiguation' };
  return { status: 'ok', page: page as Required<Pick<ApiPage, 'title' | 'lastrevid'>> & ApiPage };
}

export interface CheckCounts {
  checked: number;
  changed: number;
  unchanged: number;
  missing: number;
  disambiguation: number;
  notArticle: number;
}

export const emptyCheckCounts = (): CheckCounts => ({
  checked: 0,
  changed: 0,
  unchanged: 0,
  missing: 0,
  disambiguation: 0,
  notArticle: 0,
});

/**
 * The companies whose page needs its summary (re)read: a new page, a page that has no document
 * yet, or a revision id that moved. Missing pages and disambiguation pages are counted and left.
 */
export function decideCheck(
  companies: WpCompany[],
  result: unknown,
): {
  changed: WpRequest[];
  counts: CheckCounts;
  skipped: { qid: string; title: string; status: string }[];
} {
  const counts = emptyCheckCounts();
  const changed: WpRequest[] = [];
  const skipped: { qid: string; title: string; status: string }[] = [];
  for (const c of companies) {
    counts.checked++;
    const o = pageFor(result, c.title);
    if (o.status !== 'ok') {
      if (o.status === 'disambiguation') counts.disambiguation++;
      else if (o.status === 'not_article') counts.notArticle++;
      else counts.missing++;
      skipped.push({ qid: c.qid, title: c.title, status: o.status });
      continue;
    }
    if (c.hasDocument && c.revisionId === o.page.lastrevid) {
      counts.unchanged++;
      continue;
    }
    counts.changed++;
    changed.push({ qid: c.qid, title: c.title });
  }
  return { changed, counts, skipped };
}

/**
 * The summary shown with attribution: the lead's first paragraph, whitespace collapsed, cut at
 * the last sentence end within SUMMARY_MAX (or the last word, with an ellipsis). Null when empty.
 */
export function summaryOf(extract: string | undefined): string | null {
  if (!extract) return null;
  const first = extract
    .split(/\n+/)
    .map((p) => cleanText(p))
    .find((p): p is string => p !== null && p.length > 0);
  if (!first) return null;
  if (first.length <= SUMMARY_MAX) return first;
  const head = first.slice(0, SUMMARY_MAX);
  const sentenceEnd = Math.max(
    head.lastIndexOf('. '),
    head.lastIndexOf('! '),
    head.lastIndexOf('? '),
  );
  if (sentenceEnd >= SUMMARY_MAX / 2) return head.slice(0, sentenceEnd + 1);
  const space = head.lastIndexOf(' ');
  return `${head.slice(0, space > 0 ? space : SUMMARY_MAX - 1)}…`;
}

/** The permanent link to one revision: the source URL of everything read from it. */
export function permalinkOf(title: string, revisionId: number): string {
  const t = encodeURIComponent(title.replace(/ /g, '_'));
  return `https://${WP_HOST}/w/index.php?title=${t}&oldid=${revisionId}`;
}

export function parseEnvelope(body: string): Envelope {
  const env = JSON.parse(body) as Partial<Envelope>;
  if (
    env.format !== ENVELOPE_FORMAT ||
    (env.kind !== 'check' && env.kind !== 'extracts') ||
    !Array.isArray(env.pages)
  ) {
    throw new SchemaValidationError('Not a Wikipedia envelope.');
  }
  return env as Envelope;
}

export interface ExtractRecords {
  documents: RecordInputOf<'document'>[];
  enrichments: RecordInputOf<'company_enrichment'>[];
  /** Requested pages that gave no record, and why. */
  skipped: { qid: string; title: string; status: string }[];
}

/** One document per page and one enrichment per company, from an extracts response. */
export function recordsOf(env: Envelope, fetchedAt: string): ExtractRecords {
  const out: ExtractRecords = { documents: [], enrichments: [], skipped: [] };
  if (env.kind !== 'extracts') return out;
  const docUrls = new Set<string>();
  for (const req of env.pages) {
    const o = pageFor(env.result, req.title);
    const summary = o.status === 'ok' ? summaryOf(o.page.extract) : null;
    if (o.status !== 'ok' || !o.page.canonicalurl || !summary) {
      out.skipped.push({ ...req, status: o.status === 'ok' ? 'no_extract' : o.status });
      continue;
    }
    const { page } = o;
    const url = page.canonicalurl as string;
    const prov = {
      source_key: WP_KEY,
      source_url: permalinkOf(page.title, page.lastrevid),
      fetched_at: fetchedAt,
      method: 'api' as const,
      method_version: WP_METHOD_VERSION,
    };
    // Two titles that redirect to one page share its document.
    if (!docUrls.has(url)) {
      docUrls.add(url);
      out.documents.push({
        url,
        url_normalized: url,
        kind: 'wikipedia',
        title: page.title,
        publisher: 'Wikipedia',
        domain: WP_HOST,
        language: 'en',
        wikipedia_revision_id: page.lastrevid,
        summary,
        ...prov,
      });
    }
    out.enrichments.push({
      match: { wikidata_qid: req.qid },
      external_id: page.title,
      fields: { wikipedia_revision_id: page.lastrevid, wikipedia_document_url: url },
      ...prov,
    });
  }
  return out;
}
