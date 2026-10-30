// The OFF CSV export (`en.openfoodfacts.org.products.csv.gz`): tab-separated, UTF-8, one header
// line, no quoting (OFF strips tabs and newlines from values). The source keeps only the columns
// it parses, for the Canadian rows that pass the import filter (BUDGET §4), and stores those as a
// smaller TSV extract with the same header names (D-044: split into `seq` files).
import { SourceResponseError } from '../../errors.ts';

/** The columns the source reads, in extract order. Checked against the real header first. */
export const EXTRACT_COLUMNS = [
  'code',
  'product_name',
  'brands',
  'categories_tags',
  'labels_tags',
  'countries_tags',
  'quantity',
  'product_quantity',
  'last_modified_t',
  'image_url',
] as const;
export type OffColumn = (typeof EXTRACT_COLUMNS)[number];
export type OffRow = Record<OffColumn, string>;

export const CANADA_TAG = 'en:canada';

/** Rows the filter drops, by rule, plus what it scanned and kept. */
export interface FilterCounts {
  scanned: number;
  kept: number;
  dropped: {
    /** A line whose column count doesn't match the header. */
    malformed: number;
    not_canada: number;
    no_name: number;
    no_brand_or_category: number;
  };
}

export function emptyFilterCounts(): FilterCounts {
  return {
    scanned: 0,
    kept: 0,
    dropped: { malformed: 0, not_canada: 0, no_name: 0, no_brand_or_category: 0 },
  };
}

/** Column positions in a header line. Throws when a column the source needs is missing. */
export function headerIndex(line: string, what = 'OFF CSV'): { width: number; at: number[] } {
  const names = line.split('\t');
  const missing = EXTRACT_COLUMNS.filter((c) => !names.includes(c));
  if (missing.length > 0) {
    throw new SourceResponseError(200, `${what} header has no ${missing.join(', ')} column.`);
  }
  return { width: names.length, at: EXTRACT_COLUMNS.map((c) => names.indexOf(c)) };
}

const hasTag = (tags: string, tag: string) => tags.split(',').some((t) => t.trim() === tag);
const blank = (s: string) => s.trim() === '';

/**
 * A filter over the data lines of one CSV: a Canadian product with a name, and a brand or a
 * category (BUDGET §4). Counts every rule it applies.
 */
export function createRowFilter(headerLine: string, counts: FilterCounts) {
  const { width, at } = headerIndex(headerLine);
  return (line: string): OffRow | null => {
    if (line === '') return null;
    counts.scanned++;
    const fields = line.split('\t');
    if (fields.length !== width) {
      counts.dropped.malformed++;
      return null;
    }
    const row = Object.fromEntries(EXTRACT_COLUMNS.map((c, i) => [c, fields[at[i]!]!])) as OffRow;
    if (!hasTag(row.countries_tags, CANADA_TAG)) counts.dropped.not_canada++;
    else if (blank(row.product_name)) counts.dropped.no_name++;
    else if (blank(row.brands) && blank(row.categories_tags)) counts.dropped.no_brand_or_category++;
    else {
      counts.kept++;
      return row;
    }
    return null;
  };
}

/** The stored extract: the header, then one line per row, columns in EXTRACT_COLUMNS order. */
export function toExtract(rows: readonly OffRow[]): string {
  const lines = rows.map((r) => EXTRACT_COLUMNS.map((c) => r[c]).join('\t'));
  return [EXTRACT_COLUMNS.join('\t'), ...lines].join('\n') + '\n';
}

/** Reads a stored extract back. Its own header decides the column order. */
export function parseExtract(body: string): OffRow[] {
  const [header = '', ...lines] = body.split('\n');
  const { width, at } = headerIndex(header, 'OFF extract');
  return lines
    .filter((l) => l !== '')
    .map((line) => {
      const fields = line.split('\t');
      if (fields.length !== width) {
        throw new SourceResponseError(200, `OFF extract line has ${fields.length} columns.`);
      }
      return Object.fromEntries(EXTRACT_COLUMNS.map((c, i) => [c, fields[at[i]!]!])) as OffRow;
    });
}
