// Corporations Canada (SOURCES.md S21, PLAN P3.18, D-075): the pure parts. Reading the bulk CSVs,
// matching active corporations to Canadian catalog companies by exact name key, and the records.
// Only the match goes in the stored envelope: the files also hold street addresses and business
// numbers, and nothing from them is kept unless it confirms a company (PLAN P3.18).
import type { RecordInputOf } from '@sarvis/core';

import { SchemaValidationError, SourceResponseError } from '../../errors.ts';
import { nameKeyWith } from '../sec-edgar/map.ts';

export const CC_KEY = 'corp-canada';
export const CC_JOB = 'corp-canada-identity';
export const CC_VERSION = '1.0.0';
export const CC_METHOD_VERSION = `${CC_KEY}@${CC_VERSION}`;

export const CC_DATASET_URL =
  'https://open.canada.ca/data/en/dataset/0032ce54-c5dd-4b66-99a0-320a7b5e99f2';
const CC_FILE_BASE = 'https://d4bf66bykfyaf.cloudfront.net/';
/** The active English files. The inactive ones hold only dead numbers (D-075). */
export const CC_FILES: readonly string[] = [
  `${CC_FILE_BASE}corporations-active-cbca-en.csv`,
  `${CC_FILE_BASE}corporations-active-non-cbca-en.csv`,
];

export const ENVELOPE_FORMAT = 'sarvis-corp-canada/1';
const MIN_KEY_LENGTH = 3;

/**
 * What a federal name must end in: CBCA s. 10(1) (Limited, Incorporated, Corporation and their
 * French and short forms), plus the Canada Cooperatives Act's word. Unlike SEC's list, "Company"
 * isn't here: "The Dominion Company Inc." is a different business from Dominion the grocer.
 */
const LEGAL_ELEMENTS: ReadonlySet<string> = new Set(
  'inc incorporated incorporee ltd limited ltee limitee corp corporation cooperative'.split(' '),
);

/** The match key of a catalog name or a corporate name. Exact equality is the only match. */
export const corpKey = (name: string): string => nameKeyWith(name, LEGAL_ELEMENTS);

const COLUMNS = {
  number: 'Corporation number',
  form1: 'Corporate name - form 1',
  form2: 'Corporate name - form 2',
  legislation: 'Governing legislation',
  status: 'Status',
  statusDetail: 'Status Detail',
} as const;
type Column = keyof typeof COLUMNS;

/** The fields of one CSV line (RFC 4180 quoting), or null when a quote is never closed. */
export function parseCsvLine(line: string): string[] | null {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (line[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      fields.push(field);
      field = '';
    } else field += ch;
  }
  fields.push(field);
  return quoted ? null : fields;
}

/** The registered name without the "-" that joins a bilingual pair ("CARGILL LIMITED -"). */
export function tidyName(name: string): string {
  return name
    .replace(/[\s-]+$/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

export interface CcCompany {
  slug: string;
  name: string;
  legalName: string | null;
}

export interface FileCounts {
  url: string;
  rows: number;
  malformed: number;
  notActive: number;
}

export interface FileInfo extends FileCounts {
  sha256: string | null;
  bytes: number | null;
}

/** A company confirmed by exactly one active corporation that no other company claims. */
export interface CorpMatch {
  slug: string;
  number: string;
  /** The registered name form that matched. */
  legal_name: string;
  names: string[];
  legislation: string;
  status_detail: string;
  file_url: string;
}

export interface HeldMatch {
  slug: string;
  numbers: string[];
}

export interface MatchResult {
  matches: CorpMatch[];
  /** A company whose names fit two or more active corporations. */
  ambiguous: HeldMatch[];
  /** One corporation claimed by two or more companies. */
  shared: HeldMatch[];
}

export class CorpMatcher {
  private readonly companiesByKey = new Map<string, Set<string>>();
  /** slug → corporation number → the row, first name form that matched. */
  private readonly found = new Map<string, Map<string, CorpMatch>>();

  constructor(companies: readonly CcCompany[]) {
    for (const c of companies) {
      for (const name of [c.name, c.legalName]) {
        const key = name ? corpKey(name) : '';
        if (key.length < MIN_KEY_LENGTH) continue;
        const slugs = this.companiesByKey.get(key) ?? new Set<string>();
        slugs.add(c.slug);
        this.companiesByKey.set(key, slugs);
      }
    }
  }

  /** Reads one file, keeping only rows that match. The columns are found by header name. */
  async scan(lines: AsyncIterable<string>, url: string): Promise<FileCounts> {
    const counts: FileCounts = { url, rows: 0, malformed: 0, notActive: 0 };
    let at: Record<Column, number> | null = null;
    let width = 0;
    for await (const line of lines) {
      if (at === null) {
        const header = parseCsvLine(line.charCodeAt(0) === 0xfeff ? line.slice(1) : line) ?? [];
        at = columnsOf(header, url);
        width = header.length;
        continue;
      }
      if (line === '') continue;
      counts.rows++;
      const row = parseCsvLine(line);
      const number = row?.[at.number];
      if (!row || row.length !== width || !number || !/^[0-9]{1,12}$/u.test(number)) {
        counts.malformed++;
        continue;
      }
      if (row[at.status] !== 'Active') {
        counts.notActive++;
        continue;
      }
      this.keep(row, at, number, url);
    }
    if (at === null) throw new SourceResponseError(502, `corp-canada: ${url} is empty`);
    return counts;
  }

  private keep(row: string[], at: Record<Column, number>, number: string, url: string): void {
    const names = [row[at.form1], row[at.form2]].filter((n): n is string => Boolean(n));
    for (const name of names) {
      for (const slug of this.companiesByKey.get(corpKey(name)) ?? []) {
        const numbers = this.found.get(slug) ?? new Map<string, CorpMatch>();
        this.found.set(slug, numbers);
        if (numbers.has(number)) continue;
        numbers.set(number, {
          slug,
          number,
          legal_name: tidyName(name),
          names: names.map(tidyName),
          legislation: row[at.legislation] ?? '',
          status_detail: row[at.statusDetail] ?? '',
          file_url: url,
        });
      }
    }
  }

  result(): MatchResult {
    const out: MatchResult = { matches: [], ambiguous: [], shared: [] };
    const claims = new Map<string, number>();
    for (const numbers of this.found.values()) {
      for (const n of numbers.keys()) claims.set(n, (claims.get(n) ?? 0) + 1);
    }
    for (const slug of [...this.found.keys()].sort()) {
      const numbers = this.found.get(slug) as Map<string, CorpMatch>;
      const list = [...numbers.keys()].sort();
      const only = numbers.values().next().value as CorpMatch;
      if (list.length > 1) out.ambiguous.push({ slug, numbers: list });
      else if ((claims.get(only.number) ?? 0) > 1) out.shared.push({ slug, numbers: list });
      else out.matches.push(only);
    }
    return out;
  }
}

function columnsOf(header: string[], url: string): Record<Column, number> {
  const at = {} as Record<Column, number>;
  for (const [column, title] of Object.entries(COLUMNS) as [Column, string][]) {
    const i = header.indexOf(title);
    if (i < 0) throw new SourceResponseError(502, `corp-canada: ${url} has no "${title}" column`);
    at[column] = i;
  }
  return at;
}

export interface Envelope {
  format: typeof ENVELOPE_FORMAT;
  files: FileInfo[];
  matches: CorpMatch[];
}

export function parseEnvelope(body: string): Envelope {
  const env = JSON.parse(body) as Partial<Envelope>;
  if (env.format !== ENVELOPE_FORMAT || !Array.isArray(env.matches)) {
    throw new SchemaValidationError(`Not a ${ENVELOPE_FORMAT} envelope`);
  }
  return env as Envelope;
}

/** One enrichment per match: the corporation number and the registered name. */
export function recordsOf(env: Envelope, fetchedAt: string): RecordInputOf<'company_enrichment'>[] {
  return env.matches.map((m) => ({
    source_key: CC_KEY,
    source_url: m.file_url,
    fetched_at: fetchedAt,
    method: 'import' as const,
    method_version: CC_METHOD_VERSION,
    match: { slug: m.slug, corp_canada_number: m.number },
    external_id: m.number,
    fields: { corp_canada_number: m.number, legal_name: m.legal_name },
  }));
}
