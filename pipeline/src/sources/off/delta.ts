// OFF daily delta files (SOURCES.md S1, PLAN P3.7): `/data/delta/index.txt` lists the last 14
// days of `openfoodfacts_products_<from>_<to>.json.gz` files, one JSONL product per line, holding
// every product changed in that window. Each record becomes the same OffRow the CSV export gives,
// so a delta goes through the same filter, extract and mapping as a full import, and an unchanged
// product hashes the same either way.
import { SourceResponseError } from '../../errors.ts';
import { type FilterCounts, type OffRow, keepRow } from './csv.ts';
import { OFF_IMAGE_BASE } from './map.ts';

export const OFF_DELTA_BASE = 'https://static.openfoodfacts.org/data/delta/';
export const OFF_DELTA_INDEX = `${OFF_DELTA_BASE}index.txt`;

const DELTA_NAME = /^openfoodfacts_products_(\d+)_(\d+)\.json\.gz$/;

export interface DeltaFile {
  name: string;
  url: string;
  /** The window the file covers, as Unix seconds. */
  from: number;
  to: number;
}

/** The delta files an index lists, oldest first, so a later change is applied last. */
export function parseDeltaIndex(text: string, base = OFF_DELTA_BASE): DeltaFile[] {
  const files = new Map<string, DeltaFile>();
  for (const raw of text.split('\n')) {
    const name = raw.trim();
    if (name === '') continue;
    const m = DELTA_NAME.exec(name);
    if (!m) throw new SourceResponseError(200, `OFF delta index lists an unexpected entry.`);
    files.set(name, { name, url: new URL(name, base).href, from: Number(m[1]), to: Number(m[2]) });
  }
  return [...files.values()].sort((a, b) => a.to - b.to || a.from - b.from);
}

/** OFF's image folder for a code: digit codes are padded to 13 and split 3/3/3/rest. */
export function productFolder(code: string): string {
  if (!/^\d+$/.test(code)) return code;
  const c = code.padStart(13, '0');
  return `${c.slice(0, 3)}/${c.slice(3, 6)}/${c.slice(6, 9)}/${c.slice(9)}`;
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The revision of a selected image (`images.selected.front.<lang>.rev`), as text. */
function revOf(entry: unknown): string | null {
  const rev = isObject(entry) ? entry.rev : null;
  if (typeof rev === 'number' && Number.isInteger(rev)) return String(rev);
  return typeof rev === 'string' && /^\d+$/.test(rev) ? rev : null;
}

/**
 * The 400 px front image URL, as the English CSV export's `image_url` picks it: English, then the
 * product's main language, then any other language (sorted here; OFF's order isn't defined).
 * Delta files use the `images.selected` layout only.
 */
export function frontImageUrl(product: Json, code: string): string {
  const images = isObject(product.images) ? product.images : null;
  const selected = images && isObject(images.selected) ? images.selected : null;
  const front = selected && isObject(selected.front) ? selected.front : null;
  if (!front) return '';
  const lc = typeof product.lc === 'string' ? product.lc : '';
  for (const lang of new Set(['en', lc, ...Object.keys(front).sort()])) {
    if (!lang) continue;
    const rev = revOf(front[lang]);
    if (rev) return `${OFF_IMAGE_BASE}${productFolder(code)}/front_${lang}.${rev}.400.jpg`;
  }
  return '';
}

// The CSV export holds no tabs, newlines or NUL; the stored extract can't either.
const flat = (s: string) => s.replace(/[\t\r\n]+/g, ' ').replaceAll('\u0000', '');

function text(v: unknown): string {
  if (typeof v === 'string') return flat(v);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

function tags(v: unknown): string {
  if (typeof v === 'string') return flat(v);
  if (!Array.isArray(v)) return '';
  return v
    .filter((t): t is string => typeof t === 'string')
    .map((t) => flat(t).replaceAll(',', ' '))
    .join(',');
}

/** A delta product as the CSV row the export would give it. Null when it has no code. */
export function deltaRow(product: Json): OffRow | null {
  const code = text(product.code).trim();
  if (code === '') return null;
  return {
    code,
    // The English export's `product_name` is the English name, else the main-language one.
    product_name: text(product.product_name_en).trim()
      ? text(product.product_name_en)
      : text(product.product_name),
    brands: text(product.brands),
    categories_tags: tags(product.categories_tags),
    labels_tags: tags(product.labels_tags),
    countries_tags: tags(product.countries_tags),
    quantity: text(product.quantity),
    product_quantity: text(product.product_quantity),
    last_modified_t: text(product.last_modified_t),
    image_url: frontImageUrl(product, code),
  };
}

/** The import filter over the JSONL lines of one delta file. Counts as the CSV filter does. */
export function createDeltaFilter(counts: FilterCounts) {
  return (line: string): OffRow | null => {
    if (line.trim() === '') return null;
    counts.scanned++;
    let product: unknown;
    try {
      product = JSON.parse(line);
    } catch {
      product = null;
    }
    const row = isObject(product) ? deltaRow(product) : null;
    if (!row) {
      counts.dropped.malformed++;
      return null;
    }
    return keepRow(row, counts);
  };
}
