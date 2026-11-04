// SEC EDGAR Exhibit 21 (SOURCES.md S20, PLAN P3.16, D-074): the pure parts. URLs, picking the
// latest 10-K from the submissions JSON, finding Exhibit 21 in the filing index, reading the
// subsidiary list, matching names to the catalog, and the records. Matching happens at fetch time
// and its result is stored in the envelope, so a stored envelope re-parses to the same records.
import { type RecordInputOf, cleanText, normalizeMatchText, stripHtml } from '@sarvis/core';

import { SchemaValidationError } from '../../errors.ts';

export const SEC_KEY = 'sec-edgar';
export const SEC_JOB = 'sec-exhibit21';
export const SEC_VERSION = '1.0.0';
export const SEC_METHOD_VERSION = `${SEC_KEY}@${SEC_VERSION}`;

export const SEC_WWW = 'https://www.sec.gov';
export const SEC_DATA = 'https://data.sec.gov';
export const ENVELOPE_FORMAT = 'sarvis-sec-edgar/1';
/** Forms with an Exhibit 21. 20-F and 40-F filers (foreign issuers) have none. */
export const TEN_K_FORMS = new Set(['10-K', '10-K405', '10-KT']);
export const FOREIGN_FORMS = new Set(['20-F', '40-F']);
/** A 10-K older than this is stale evidence of today's subsidiaries, so it's skipped. */
export const MAX_FILING_AGE_YEARS = 3;
/** The shortest name key that may match (shorter ones are too generic). */
export const MIN_KEY_LENGTH = 3;

/** A company with a CIK, as plan() reads it. */
export interface SecCompany {
  id: string;
  slug: string;
  qid: string | null;
  cik: string;
  name: string;
  /** Name, legal name and aliases: a subsidiary with one of these names is the parent itself. */
  names: string[];
}

/** The catalog entity a subsidiary name points at. */
export interface Target {
  kind: 'company' | 'brand';
  id: string;
  slug: string;
  /** A company's ISO country, when known; brands have none. */
  country?: string | null;
}

/** The latest 10-K, as the submissions JSON lists it. */
export interface Filing {
  form: string;
  accession: string;
  filedOn: string;
  reportDate: string | null;
  primaryDocument: string | null;
  /** The filer's name at SEC (e.g. "Kraft Heinz Co"). */
  filerName: string;
}

export type MatchStatus = 'match' | 'known' | 'self' | 'ambiguous' | 'country' | 'none';

export interface Subsidiary {
  name: string;
  jurisdiction: string | null;
  status: MatchStatus;
  /** For `match` and `known`: the entity the name matched. */
  target?: { kind: Target['kind']; slug: string };
}

export interface Envelope {
  format: typeof ENVELOPE_FORMAT;
  company: { slug: string; qid: string | null; cik: string };
  filing: Filing;
  exhibit: { url: string; type: string };
  subsidiaries: Subsidiary[];
  /** The exhibit as fetched, so the list can be parsed again. */
  html: string;
}

const cik10 = (cik: string) => cik.padStart(10, '0');
const cikInt = (cik: string) => String(Number(cik));
const accessionPath = (accession: string) => accession.replace(/-/g, '');

export function submissionsUrl(cik: string, base = SEC_DATA): string {
  return `${base}/submissions/CIK${cik10(cik)}.json`;
}

/** The filing's index page: lists every document with its exhibit type. */
export function filingIndexUrl(cik: string, accession: string, base = SEC_WWW): string {
  return `${base}/Archives/edgar/data/${cikInt(cik)}/${accessionPath(accession)}/${accession}-index.htm`;
}

interface Submissions {
  name?: string;
  filings?: {
    recent?: {
      accessionNumber?: string[];
      filingDate?: string[];
      reportDate?: string[];
      form?: string[];
      primaryDocument?: string[];
    };
  };
}

export type FilingOutcome =
  | { status: 'ok'; filing: Filing }
  | { status: 'foreign'; form: string }
  | { status: 'stale'; filedOn: string }
  | { status: 'no_10k' };

/** The latest 10-K in `filings.recent` (newest first), or why there's none to read. */
export function latestFiling(body: string, now: Date): FilingOutcome {
  let j: Submissions;
  try {
    j = JSON.parse(body) as Submissions;
  } catch {
    throw new SchemaValidationError('SEC submissions response is not JSON.');
  }
  const r = j.filings?.recent;
  if (!r?.form || !r.accessionNumber || !r.filingDate) {
    throw new SchemaValidationError('SEC submissions JSON has no filings.recent.');
  }
  let foreign: string | null = null;
  for (let i = 0; i < r.form.length; i++) {
    const form = r.form[i] as string;
    if (FOREIGN_FORMS.has(form)) foreign ??= form;
    if (!TEN_K_FORMS.has(form)) continue;
    const filedOn = r.filingDate[i] as string;
    const cutoff = new Date(now);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - MAX_FILING_AGE_YEARS);
    if (Date.parse(filedOn) < cutoff.getTime()) return { status: 'stale', filedOn };
    return {
      status: 'ok',
      filing: {
        form,
        accession: r.accessionNumber[i] as string,
        filedOn,
        reportDate: cleanText(r.reportDate?.[i]),
        primaryDocument: cleanText(r.primaryDocument?.[i]),
        filerName: cleanText(j.name) ?? '',
      },
    };
  }
  return foreign ? { status: 'foreign', form: foreign } : { status: 'no_10k' };
}

/** The Exhibit 21 documents in a filing index page (EX-21, EX-21.1, …), as absolute URLs. */
export function exhibit21Of(indexHtml: string, base = SEC_WWW): { url: string; type: string }[] {
  const out: { url: string; type: string }[] = [];
  for (const row of indexHtml.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1] as string);
    const type = cells.map((c) => stripHtml(c) ?? '').find((t) => /^EX-21(\.\d+)?$/i.test(t));
    const href = /href="([^"]+)"/i.exec(row)?.[1];
    if (!type || !href || !/\.(htm|html|txt)$/i.test(href)) continue;
    const url = href.startsWith('http') ? href : `${base}${href}`;
    if (!out.some((e) => e.url === url)) out.push({ url, type: type.toUpperCase() });
  }
  return out;
}

/** Numeric entities (`&#38;`, `&#x2019;`) and zero-width spaces, which stripHtml leaves. */
function decodeExtra(html: string): string {
  return html
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#([0-9]+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/\u200b|\u200c|\u200d|\ufeff/g, '');
}

/**
 * The exhibit's own HTML: the EDGAR `<DOCUMENT>…<TEXT>` wrapper, head, scripts, styles and
 * comments removed, and runs of 2+ non-breaking spaces or tabs (used as column gaps) as a tab.
 */
function exhibitBody(html: string): string {
  const text = /<TEXT>([\s\S]*?)(<\/TEXT>|$)/i.exec(html)?.[1] ?? html;
  return text
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/(?:&#160;|&nbsp;|&#xa0;|\u00a0|\t){2,}/gi, '\t');
}

/** One cell or line as plain text: tags out, entities decoded, whitespace collapsed (tabs kept). */
function plain(html: string): string {
  return decodeExtra(stripTags(html))
    .replace(/\u00a0/g, ' ')
    .replace(/[^\S\t]+/g, ' ')
    .replace(/ *\t[\t ]*/g, '\t')
    .trim();
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

/** Footnote marks at the end of a name: "(1)", "(a)", "(iv)", "*", "†". */
function dropFootnotes(name: string): string {
  let s = name.trim();
  for (let prev = ''; prev !== s;) {
    prev = s;
    s = s.replace(/\s*(\((\d{1,2}|[a-z]|[ivx]{1,4})\)|\*+|†+|‡+)$/i, '').trim();
  }
  return s.replace(/[\s,;.]+$/, (m) => (m.trim() === '.' ? '.' : '')).trim();
}

/** A column heading or a heading split over rows ("Jurisdiction of" / "Incorporation or"). */
const HEADER = new RegExp(
  '^(legal name|names?( of( .*)?)?|(significant |list of )?subsidiar(y|ies)( name)?|entity( name)?|' +
    'company( name)?|percent(age)?( owned| of( .*)?)?|of voting|(voting )?securities|' +
    'jurisdiction( of( .*)?)?|(state|country|place)( or| of) .*|incorporation( or( .*)?)?|' +
    'organi[sz]ation|formation|held by( .*)?|immediate( parent)?|owned|ownership|parent|domicile)$',
  'i',
);
/** A title or note line, not a subsidiary. */
const NOT_A_NAME =
  /^(exhibit\s*21|ex-21|document$|subsidiaries of\b|(schedule|list) of subsidiaries|\(in alphabetical|the following|as of\b|page \d|\d+$|[*†(])/i;

function keepName(name: string): boolean {
  return (
    /\p{L}/u.test(name) &&
    name.length <= 300 &&
    !HEADER.test(name) &&
    !NOT_A_NAME.test(name) &&
    !name.endsWith(':')
  );
}

/** A jurisdiction cell: has a letter, isn't a percentage or a heading. */
const isJurisdiction = (s: string): boolean =>
  /\p{L}/u.test(s) && !/%|^\d/.test(s) && !HEADER.test(s);

/**
 * The subsidiary list, from the two layouts filings use:
 * - tables: a row's first non-empty cell is the name, and the next one with letters that isn't a
 *   percentage is the jurisdiction. Heading rows are dropped;
 * - text lines (when there are no table rows): "Name<gap>Jurisdiction", "Name, a Delaware
 *   corporation", "Name (Jurisdiction)", "Name – Jurisdiction", or a bare name.
 * Footnote marks are dropped. Two entries run together on one line keep only the first pair.
 */
export function parseExhibit21(html: string): { name: string; jurisdiction: string | null }[] {
  const out: { name: string; jurisdiction: string | null }[] = [];
  const seen = new Set<string>();
  const push = (rawName: string, rawJurisdiction: string | null) => {
    const name = dropFootnotes(rawName.replace(/\t/g, ' '));
    if (!keepName(name)) return;
    const j = rawJurisdiction ? dropFootnotes(rawJurisdiction.replace(/\t/g, ' ')) : null;
    const jurisdiction = j && isJurisdiction(j) ? j.slice(0, 200) : null;
    // A section heading ("JAPAN", "KOREA, REPUBLIC OF"): capitals, no jurisdiction, no legal form.
    if (!jurisdiction && name === name.toUpperCase() && !hasLegalForm(name)) return;
    const k = `${name}|${jurisdiction ?? ''}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ name, jurisdiction });
  };

  const body = exhibitBody(html);
  for (const row of body.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((m) => plain(m[1] as string))
      .filter((c) => c.length > 0);
    if (cells.length === 0) continue;
    const [first, second] = cells as [string, string | undefined];
    // "JAPAN | Hewlett Packard Japan, G.K.": the jurisdiction column comes first.
    if (second && jurisdictionCountry(first) && !hasLegalForm(first) && hasLegalForm(second)) {
      push(second, first);
      continue;
    }
    push(first, cells.slice(1).find(isJurisdiction) ?? null);
  }
  if (out.length > 0) return out;

  const text = body.replace(/<\s*(br|\/p|\/div|\/li|\/h\d|\/tr)\s*\/?\s*>/gi, '\n');
  for (const raw of text.split('\n')) {
    const line = plain(raw);
    if (!line) continue;
    const segments = line.split('\t').filter(Boolean);
    if (segments.length >= 2) {
      push(segments[0] as string, segments[1] as string);
      continue;
    }
    const article = /^(.*?\S),\s+an?\s+(\S.*)$/i.exec(line);
    const paren = /^(.*\S)\s*\(([^()]+)\)$/.exec(dropFootnotes(line));
    const dash = /^(.*\S)\s+[–—-]{1,2}\s+(\S.*)$/.exec(line);
    const dots = /^(.*?\S)\s*\.{3,}\s*(\S.*)$/.exec(line);
    const m = dots ?? article ?? dash ?? paren;
    if (m) push(m[1] as string, m[2] as string);
    else push(line, null);
  }
  return out;
}

/** Legal-form words dropped from the end of a name before matching ("Heinz Company" → heinz). */
const LEGAL_FORMS = new Set(
  (
    'inc incorporated corp corporation co company cos companies llc l l c lc ltd limited plc ' +
    'lp llp lllp ulc sa s a sas sarl s a r l srl spa s p a ag gmbh bv b v nv n v pty pte ab as ' +
    'oy oyj kk gk kg se sab de cv sa de cv ltda bhd sdn pvt sl sro aps asa'
  ).split(' '),
);

/**
 * The match key of a company, brand or subsidiary name: accents and case folded, `&` → and,
 * punctuation as a word break (bracketed words kept: "L Brands (Overseas)" isn't "L Brands"; an
 * apostrophe too: "GT's" isn't "GTS"), a leading "the" and trailing legal forms removed.
 * Exact equality of keys is the only match (fuzzy matching is Phase 4).
 */
export function nameKey(name: string): string {
  const words = normalizeMatchText(name)
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (words[0] === 'the') words.shift();
  while (words.length > 1 && LEGAL_FORMS.has(words[words.length - 1] as string)) words.pop();
  return words.join(' ');
}

/** The names a subsidiary line may stand for: "A Inc. / B Inc." is a bilingual pair. */
export function nameVariants(name: string): string[] {
  return [name, ...name.split(/\s+\/\s+/)].filter((v, i, a) => a.indexOf(v) === i);
}

/** US states and territories: a subsidiary formed in one is a US entity. */
const US_PLACES = new Set([
  'alabama',
  'alaska',
  'arizona',
  'arkansas',
  'california',
  'colorado',
  'connecticut',
  'delaware',
  'florida',
  'georgia',
  'hawaii',
  'idaho',
  'illinois',
  'indiana',
  'iowa',
  'kansas',
  'kentucky',
  'louisiana',
  'maine',
  'maryland',
  'massachusetts',
  'michigan',
  'minnesota',
  'mississippi',
  'missouri',
  'montana',
  'nebraska',
  'nevada',
  'new hampshire',
  'new jersey',
  'new mexico',
  'new york',
  'north carolina',
  'north dakota',
  'ohio',
  'oklahoma',
  'oregon',
  'pennsylvania',
  'rhode island',
  'south carolina',
  'south dakota',
  'tennessee',
  'texas',
  'utah',
  'vermont',
  'virginia',
  'washington',
  'west virginia',
  'wisconsin',
  'wyoming',
  'district of columbia',
  'puerto rico',
  'united states',
  'united states of america',
  'usa',
]);
/** Names filings use that Intl.DisplayNames doesn't give. */
const PLACE_ALIASES: Record<string, string> = {
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'england and wales': 'GB',
  'northern ireland': 'GB',
  uk: 'GB',
  'the netherlands': 'NL',
  'korea republic of': 'KR',
  'republic of korea': 'KR',
  'south korea': 'KR',
  'peoples republic of china': 'CN',
  prc: 'CN',
  'hong kong sar': 'HK',
  russia: 'RU',
  'russian federation': 'RU',
  'czech republic': 'CZ',
  'viet nam': 'VN',
  ontario: 'CA',
  quebec: 'CA',
  'british columbia': 'CA',
  alberta: 'CA',
  'nova scotia': 'CA',
  'new brunswick': 'CA',
  manitoba: 'CA',
  saskatchewan: 'CA',
};
let countryByName: Map<string, string> | null = null;
function countryNames(): Map<string, string> {
  if (countryByName) return countryByName;
  const map = new Map(Object.entries(PLACE_ALIASES));
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const A = 'A'.charCodeAt(0);
  for (let a = 0; a < 26; a++) {
    for (let b = 0; b < 26; b++) {
      const code = String.fromCharCode(A + a, A + b);
      let name: string | undefined;
      try {
        name = names.of(code);
      } catch {
        name = undefined;
      }
      if (name && name !== code && !map.has(nameKey(name))) map.set(nameKey(name), code);
    }
  }
  countryByName = map;
  return map;
}

/**
 * The ISO country of a jurisdiction ("Delaware" → US, "Australia" → AU, "Zhejiang Province,
 * China" → CN from its last part), or null when it isn't recognised.
 */
export function jurisdictionCountry(jurisdiction: string | null): string | null {
  if (!jurisdiction) return null;
  const parts = [jurisdiction, ...jurisdiction.split(',').reverse()].map((p) => nameKey(p));
  for (const p of parts) {
    if (US_PLACES.has(p)) return 'US';
    const code = countryNames().get(p);
    if (code) return code;
  }
  return null;
}

/** The name ends in a legal form ("ARAMARK LLC"), which a section heading never does. */
function hasLegalForm(name: string): boolean {
  const words = normalizeMatchText(name)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ');
  const last = words[words.length - 1] as string;
  // A dotted form reads as two letters: "G.K." → g k → gk.
  return LEGAL_FORMS.has(last) || LEGAL_FORMS.has(`${words[words.length - 2] ?? ''}${last}`);
}

/** Name key → the catalog entities with that name, alias or legal name. */
export class NameIndex {
  private readonly byKey = new Map<string, Target[]>();

  add(target: Target, names: (string | null | undefined)[]): void {
    for (const n of names) {
      if (!n) continue;
      const k = nameKey(n);
      if (k.length < MIN_KEY_LENGTH) continue;
      const list = this.byKey.get(k) ?? [];
      if (!list.some((t) => t.kind === target.kind && t.id === target.id)) list.push(target);
      this.byKey.set(k, list);
    }
  }

  /** One company wins over brands; two companies, or two brands and no company, are ambiguous. */
  lookup(name: string): Target | 'ambiguous' | null {
    for (const v of nameVariants(name)) {
      const found = this.byKey.get(nameKey(v));
      if (!found) continue;
      const companies = found.filter((t) => t.kind === 'company');
      const pool = companies.length > 0 ? companies : found;
      return pool.length === 1 ? (pool[0] as Target) : 'ambiguous';
    }
    return null;
  }
}

/**
 * Every existing edge, as `parentId>childId` (companies) and `brandId>companyId` (brands). The edge
 * writers key on parent, child, relation and `valid_from`, not the source, so an SEC edge for a pair
 * another source already linked would write over that row's provenance (seen in P3.16, D-074).
 */
export interface KnownEdges {
  company: Set<string>;
  brand: Set<string>;
}

/** Each subsidiary's match against the catalog, decided when the exhibit is fetched. */
export function matchSubsidiaries(
  parent: SecCompany,
  subs: { name: string; jurisdiction: string | null }[],
  index: NameIndex,
  known: KnownEdges,
): Subsidiary[] {
  const own = new Set(parent.names.map(nameKey));
  return subs.map((s) => {
    // The parent's own name, even when a duplicate company row also holds it.
    if (nameVariants(s.name).some((v) => own.has(nameKey(v)))) {
      return {
        ...s,
        status: 'self' as const,
        target: { kind: 'company' as const, slug: parent.slug },
      };
    }
    const t = index.lookup(s.name);
    if (t === null) return { ...s, status: 'none' as const };
    if (t === 'ambiguous') return { ...s, status: 'ambiguous' as const };
    const target = { kind: t.kind, slug: t.slug };
    if (t.kind === 'company' && t.id === parent.id)
      return { ...s, status: 'self' as const, target };
    // "Kashi Company Pty Ltd (Australia)" isn't the US Kashi.
    const where = jurisdictionCountry(s.jurisdiction);
    if (t.country && where && t.country !== where)
      return { ...s, status: 'country' as const, target };
    const isKnown =
      t.kind === 'company'
        ? known.company.has(`${parent.id}>${t.id}`)
        : known.brand.has(`${t.id}>${parent.id}`);
    return { ...s, status: isKnown ? ('known' as const) : ('match' as const), target };
  });
}

export function matchCounts(subs: Subsidiary[]): Record<MatchStatus, number> {
  const c: Record<MatchStatus, number> = {
    match: 0,
    known: 0,
    self: 0,
    ambiguous: 0,
    country: 0,
    none: 0,
  };
  for (const s of subs) c[s.status]++;
  return c;
}

/** Whether a response body is one of our stored envelopes (and not a control response). */
export function isEnvelope(body: string): boolean {
  return body.startsWith(`{"format":"${ENVELOPE_FORMAT}"`);
}

export function parseEnvelope(body: string): Envelope {
  const env = JSON.parse(body) as Partial<Envelope>;
  if (
    env.format !== ENVELOPE_FORMAT ||
    !env.company?.slug ||
    !env.filing?.accession ||
    !env.exhibit?.url ||
    !Array.isArray(env.subsidiaries)
  ) {
    throw new SchemaValidationError('Not an SEC EDGAR envelope.');
  }
  return env as Envelope;
}

export interface EdgarRecords {
  documents: RecordInputOf<'document'>[];
  enrichments: RecordInputOf<'company_enrichment'>[];
  companyEdges: RecordInputOf<'company_ownership'>[];
  brandEdges: RecordInputOf<'brand_ownership'>[];
}

/** The filing document, the CIK's provenance, and a pending edge per matched subsidiary. */
export function recordsOf(env: Envelope, fetchedAt: string): EdgarRecords {
  const { company, filing, exhibit } = env;
  const prov = {
    source_key: SEC_KEY,
    fetched_at: fetchedAt,
    method: 'api' as const,
    method_version: SEC_METHOD_VERSION,
  };
  const indexUrl = filingIndexUrl(company.cik, filing.accession);
  const period = filing.reportDate ? ` for ${filing.reportDate}` : '';
  const out: EdgarRecords = {
    documents: [
      {
        url: indexUrl,
        url_normalized: indexUrl,
        kind: 'sec_filing',
        title: `${filing.filerName || company.slug} ${filing.form}${period}`.slice(0, 500),
        publisher: 'U.S. Securities and Exchange Commission',
        domain: 'www.sec.gov',
        published_at: `${filing.filedOn}T00:00:00Z`,
        language: 'en',
        sec_accession: filing.accession,
        sec_filed_on: filing.filedOn,
        source_url: indexUrl,
        ...prov,
      },
    ],
    enrichments: [
      {
        match: { slug: company.slug, sec_cik: company.cik },
        external_id: company.cik,
        fields: { sec_cik: company.cik },
        source_url: submissionsUrl(company.cik),
        ...prov,
      },
    ],
    companyEdges: [],
    brandEdges: [],
  };
  const seen = new Set<string>();
  for (const s of env.subsidiaries) {
    if (s.status !== 'match' || !s.target) continue;
    // Two lines naming one entity ("Heinz Company", "Heinz Inc.") give one edge.
    const key = `${s.target.kind}:${s.target.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const where = s.jurisdiction ? ` (${s.jurisdiction})` : '';
    const review_reason =
      `${exhibit.type} of the ${filing.form} filed ${filing.filedOn} (${filing.accession}) lists ` +
      `"${s.name}"${where} as a subsidiary; matched by exact name to ${s.target.kind} ` +
      `${s.target.slug}.`;
    const edgeProv = {
      ...prov,
      source_url: exhibit.url,
      review_reason: review_reason.slice(0, 1000),
    };
    if (s.target.kind === 'company') {
      out.companyEdges.push({
        parent_company_slug: company.slug,
        child_company_slug: s.target.slug,
        relation: 'subsidiary',
        ...edgeProv,
      });
    } else {
      out.brandEdges.push({
        brand_slug: s.target.slug,
        company_slug: company.slug,
        relation: 'owner',
        ...edgeProv,
      });
    }
  }
  return out;
}
