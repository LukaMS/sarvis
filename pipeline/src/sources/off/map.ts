// OFF CSV rows → product records (the D-048 mapping, read from the CSV columns). Pure, so a stored
// extract re-parses to the same records.
import { type RecordInputOf, cleanText, normalizeGtin, slugify } from '@sarvis/core';

import type { OffRow } from './csv.ts';

export const OFF_KEY = 'off';
export const OFF_JOB = 'off-import';
export const OFF_VERSION = '1.0.0';
/** Image paths are stored without this prefix (DATA_MODEL §3.3 `image_key`). */
export const OFF_IMAGE_BASE = 'https://images.openfoodfacts.org/images/products/';

/**
 * OFF codes to a GTIN-14. A code that is GTIN-shaped but fails its check digit is passed on padded,
 * so validation records it as `gtin_check_digit`; PLUs and restricted codes have no GTIN.
 */
export function offGtin(code: string): string | null {
  const result = normalizeGtin(code);
  if (result.kind === 'gtin') return result.value;
  if (result.kind === 'invalid' && result.reason === 'check_digit') return code.padStart(14, '0');
  return null;
}

// OFF gives `product_quantity` in grams or millilitres, but the CSV has no unit column, so the
// unit comes from the words in `quantity`. Liquid ounces count as volume.
const VOLUME =
  /(?<![a-z])(fl\.? ?oz|oz\.? ?liq|ml|cl|dl|l|lit|litres?|liters?|millilitres?|milliliters?)(?![a-z])/;
const MASS =
  /(?<![a-z])(mg|g|gr|grs|gm|gms|grams?|grammes?|kg|kgs|kilos?|kilograms?|oz|ounces?|lbs?|pounds?)(?![a-z])/;

export type SizeFields = Pick<
  RecordInputOf<'product'>,
  'net_quantity' | 'net_unit' | 'unit_parse_status'
>;

/** The net size: OFF's number with the unit `quantity` names. Both kinds named is ambiguous. */
export function sizeOf(quantityText: string | null, productQuantity: string): SizeFields {
  const amount = Number(productQuantity);
  const text = (quantityText ?? '').toLowerCase();
  const volume = VOLUME.test(text);
  const mass = MASS.test(text.replace(new RegExp(VOLUME, 'g'), ' '));
  if (!(amount > 0) || !Number.isFinite(amount) || (!volume && !mass)) {
    return { net_quantity: null, net_unit: null, unit_parse_status: 'unparsed' };
  }
  if (volume && mass) return { net_quantity: null, net_unit: null, unit_parse_status: 'ambiguous' };
  return { net_quantity: amount, net_unit: volume ? 'ml' : 'g', unit_parse_status: 'ok' };
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
  const modified = Number(row.last_modified_t);
  return {
    gtin: offGtin(code),
    external_id: code,
    // Blank stays null, so validation reports a missing name as required_field.
    name: cleanText(row.product_name) as string,
    brand_text: cleanText(row.brands),
    quantity_text: quantityText,
    ...sizeOf(quantityText, row.product_quantity),
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
    method_version: `${OFF_KEY}@${OFF_VERSION}`,
  };
}
