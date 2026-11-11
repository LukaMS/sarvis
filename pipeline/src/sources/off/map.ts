// OFF CSV rows → product records (the D-048 mapping, read from the CSV columns). Pure, so a stored
// extract re-parses to the same records.
import {
  type RecordInputOf,
  type SizeReason,
  cleanText,
  normalizeGtin,
  parseSize,
  slugify,
} from '@sarvis/core';

import type { OffRow } from './csv.ts';

export const OFF_KEY = 'off';
export const OFF_JOB = 'off-import';
export const OFF_VERSION = '1.2.0';
/** Appended to `method_version` when the size was read from the name (P4.6). */
export const SIZE_FROM_NAME = '+size-from-name';
/** Image paths are stored without this prefix (DATA_MODEL §3.3 `image_key`). */
export const OFF_IMAGE_BASE = 'https://images.openfoodfacts.org/images/products/';

/**
 * OFF codes to a GTIN-14, with UPC-E read as its UPC-A (D-078). Restricted in-store codes, PLUs and
 * codes that fail their check digit have no GTIN: the row is kept on `external_id`, so search finds
 * it and a scan never does (D-077).
 */
export function offGtin(code: string): string | null {
  const result = normalizeGtin(code);
  return result.kind === 'gtin' ? result.value : null;
}

/**
 * A code as a GTIN-14 for a record that can't be kept without one (a price): a code that fails its
 * check digit is passed on padded, so validation records it as `gtin_check_digit`.
 */
export function gtinOrBadCode(code: string): string | null {
  return hasBadCheckDigit(code) ? code.padStart(14, '0') : offGtin(code);
}

/** A GTIN-shaped code whose check digit is wrong (neither UPC-E nor any GTIN length passes). */
export function hasBadCheckDigit(code: string): boolean {
  const result = normalizeGtin(code);
  return result.kind === 'invalid' && result.reason === 'check_digit';
}

export type SizeFields = Pick<
  RecordInputOf<'product'>,
  'net_quantity' | 'net_unit' | 'pack_count' | 'unit_parse_status'
>;

/** Where a record's size came from (the run's `off_size` event counts these). */
export type SizeOrigin =
  /** `parseSize` read `quantity`, and OFF's `product_quantity` agrees: OFF's number is kept. */
  | 'off_number'
  /** `parseSize` read `quantity`; OFF has no number, or a `ct` size. */
  | 'text'
  /** `parseSize` read `quantity`, and OFF's number disagrees: ours is kept. */
  | 'disagrees'
  /** `quantity` is blank and the name ends in a strict size (method version `+size-from-name`). */
  | 'name'
  /** No `ok` size. */
  | 'none';

export interface OffSize {
  fields: SizeFields;
  origin: SizeOrigin;
  /** Why the size isn't `ok`, from `parseSize`. */
  reason: SizeReason | null;
}

/** OFF's number and ours agree within this share (the parser's metric tolerance, D-087). */
const OFF_NUMBER_TOLERANCE = 0.02;

const NO_SIZE: SizeFields = {
  net_quantity: null,
  net_unit: null,
  pack_count: null,
  unit_parse_status: 'unparsed',
};

/**
 * The net size of an OFF row (D-088). `parseSize` reads `quantity`. OFF's `product_quantity` is in
 * g or ml, so for a g or ml reading it's kept when it agrees with ours (within 2%), and ours wins
 * when it doesn't. A blank `quantity` falls back to a strict size at the end of the name.
 */
export function offSize(
  quantityText: string | null,
  productQuantity: string,
  name: string | null,
): OffSize {
  if (quantityText == null) {
    const fromName = sizeFromName(name);
    return fromName
      ? { fields: fromName, origin: 'name', reason: null }
      : { fields: NO_SIZE, origin: 'none', reason: 'empty' };
  }
  const parsed = parseSize(quantityText);
  const fields: SizeFields = {
    net_quantity: parsed.net_quantity,
    net_unit: parsed.net_unit,
    pack_count: parsed.pack_count,
    unit_parse_status: parsed.unit_parse_status,
  };
  if (parsed.unit_parse_status !== 'ok') return { fields, origin: 'none', reason: parsed.reason };
  const offNumber = Number(productQuantity);
  const ours = parsed.net_quantity as number;
  if (parsed.net_unit === 'ct' || !(offNumber > 0) || !Number.isFinite(offNumber)) {
    return { fields, origin: 'text', reason: null };
  }
  if (Math.abs(offNumber - ours) <= OFF_NUMBER_TOLERANCE * Math.max(offNumber, ours)) {
    return { fields: { ...fields, net_quantity: offNumber }, origin: 'off_number', reason: null };
  }
  return { fields, origin: 'disagrees', reason: null };
}

// The name fallback reads only a size that ends the name, alone or before a package word, or in
// parentheses, so "18g Protein Milk" and "Selection 2L Grape Soda" are left alone.
const NAME_SIZE =
  /(?<![\p{L}\p{N}.,])(?:\d+\s?[x×]\s?)?\d+(?:[.,]\d+)?\s?(?:fl\.?\s?oz|g|gr|grs|gm|kg|ml|cl|l|lbs?|oz)\.?(?![\p{L}\p{N}])/giu;
const NAME_SIZE_TAIL =
  /^[\s.,)\]-]*(?:(?:pack|package|pkg|can|bottle|bag|jar|box|tub|pouch|carton|tin|cup)s?\.?)?[\s.)\]]*$/iu;
/** Protein drinks and bars name their grams of protein: "Silk Protein 18g", "Pro 19g". */
const PROTEIN = /prot[eé]in/iu;
/** A nutrient word just before the size: "Sugar 5g", "Fat 3 g". */
const NUTRIENT_BEFORE =
  /(?:^|[^\p{L}])(?:pro|sugars?|sucres?|fib(?:re|er)|carbs?|glucides|sodium|fat|gras|caffeine)\s*:?\s*$/iu;
/** Below this, a size at the end of a name is more often a nutrient ("Boost Mega 20g"). */
const NAME_SIZE_MIN = 25;

/** A strict size from a product name, or null. Exactly one size, metric or imperial, g or ml. */
export function sizeFromName(name: string | null): SizeFields | null {
  if (!name || PROTEIN.test(name)) return null;
  const matches = [...name.matchAll(NAME_SIZE)];
  if (matches.length !== 1) return null;
  const m = matches[0] as RegExpMatchArray;
  const start = m.index as number;
  const end = start + m[0].length;
  if (NUTRIENT_BEFORE.test(name.slice(0, start))) return null;
  const inParens = /\(\s*$/.test(name.slice(0, start)) && /^\s*\)/.test(name.slice(end));
  if (!inParens && !NAME_SIZE_TAIL.test(name.slice(end))) return null;
  const parsed = parseSize(m[0]);
  if (parsed.unit_parse_status !== 'ok' || parsed.net_unit === 'ct') return null;
  if ((parsed.net_quantity as number) < NAME_SIZE_MIN) return null;
  return {
    net_quantity: parsed.net_quantity,
    net_unit: parsed.net_unit,
    pack_count: parsed.pack_count,
    unit_parse_status: 'ok',
  };
}

/** Counts of where sizes came from, for the run's `off_size` event. */
export interface SizeTally {
  rows: number;
  byOrigin: Record<SizeOrigin, number>;
  byStatus: Record<'ok' | 'unparsed' | 'ambiguous', number>;
  byReason: Partial<Record<SizeReason, number>>;
  /** The first few rows where OFF's number disagrees with ours. */
  disagreements: { code: string; quantity: string; product_quantity: string; ours: string }[];
}

export const SIZE_EXAMPLES = 10;

export function emptySizeTally(): SizeTally {
  return {
    rows: 0,
    byOrigin: { off_number: 0, text: 0, disagrees: 0, name: 0, none: 0 },
    byStatus: { ok: 0, unparsed: 0, ambiguous: 0 },
    byReason: {},
    disagreements: [],
  };
}

export function tallySizes(tally: SizeTally, rows: readonly OffRow[]): void {
  for (const row of rows) {
    const quantity = cleanText(row.quantity);
    const size = offSize(quantity, row.product_quantity, cleanText(row.product_name));
    tally.rows++;
    tally.byOrigin[size.origin]++;
    tally.byStatus[size.fields.unit_parse_status ?? 'unparsed']++;
    if (size.reason) tally.byReason[size.reason] = (tally.byReason[size.reason] ?? 0) + 1;
    if (size.origin === 'disagrees' && tally.disagreements.length < SIZE_EXAMPLES) {
      const f = size.fields;
      tally.disagreements.push({
        code: row.code.trim(),
        quantity: quantity ?? '',
        product_quantity: row.product_quantity,
        ours: `${f.net_quantity} ${f.net_unit}${f.pack_count ? ` (pack ${f.pack_count})` : ''}`,
      });
    }
  }
}

/** The image path after OFF_IMAGE_BASE, or null for none or another host. */
export function imageKeyOf(imageUrl: string): string | null {
  const url = imageUrl.trim();
  if (!url.startsWith(OFF_IMAGE_BASE)) return null;
  const key = url.slice(OFF_IMAGE_BASE.length);
  return key.length > 0 && key.length <= 300 ? key : null;
}

const splitTags = (tags: string) =>
  tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

export function toProductRecord(row: OffRow, fetchedAt: string): RecordInputOf<'product'> {
  const code = row.code.trim();
  const quantityText = cleanText(row.quantity);
  const name = cleanText(row.product_name);
  const size = offSize(quantityText, row.product_quantity, name);
  const modified = Number(row.last_modified_t);
  return {
    gtin: offGtin(code),
    external_id: code,
    // Blank stays null, so validation reports a missing name as required_field.
    name: name as string,
    brand_text: cleanText(row.brands),
    quantity_text: quantityText,
    ...size.fields,
    label_codes: [
      ...new Set(
        splitTags(row.labels_tags)
          .filter((t) => t.startsWith('en:'))
          .map((t) => slugify(t.slice(3)))
          .filter(Boolean),
      ),
    ],
    image_key: imageKeyOf(row.image_url),
    source_modified_at: modified > 0 ? new Date(modified * 1000).toISOString() : null,
    source_key: OFF_KEY,
    // Rebuilt from sources.url_template + external_id (DATA_MODEL §1.2).
    source_url: null,
    fetched_at: fetchedAt,
    method: 'import',
    method_version: `${OFF_KEY}@${OFF_VERSION}${size.origin === 'name' ? SIZE_FROM_NAME : ''}`,
  };
}
