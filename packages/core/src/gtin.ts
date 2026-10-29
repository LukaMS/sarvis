// GTIN rules (DATA_MODEL §1.4). The first three functions are exact twins of the SQL helpers
// gtin_is_valid / gtin_normalize / gtin_is_restricted (migration catalog_products) and pass the same
// vectors as supabase/tests/products.sql. normalizeGtin() is the entry point for parsers.

const GTIN_LENGTHS = /^([0-9]{8}|[0-9]{12,14})$/;

/** True when value is 8, 12, 13 or 14 digits with a correct GS1 mod-10 check digit. No cleaning. */
export function gtinIsValid(value: string): boolean {
  if (!GTIN_LENGTHS.test(value)) return false;
  const g = value.padStart(14, '0');
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    // Positions 1, 3, 5 … of the 14-digit form weigh 3 (the SQL uses 1-based i % 2 = 1).
    sum += Number(g[i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === Number(g[13]);
}

/** The GTIN-14 form (UPC-A gets 00, EAN-13 gets 0, EAN-8 gets six 0s), or null when not a valid GTIN. */
export function gtinNormalize(value: string): string | null {
  return gtinIsValid(value) ? value.padStart(14, '0') : null;
}

/** True for a valid code with GS1 prefix 02 or 20–29 (variable-weight and in-store codes). */
export function gtinIsRestricted(value: string): boolean {
  return /^0(02|2)/.test(gtinNormalize(value) ?? '');
}

export type GtinInvalidReason = 'empty' | 'non_digit' | 'length' | 'check_digit';

/**
 * How a scanned or imported code is stored:
 * - `gtin`: `products.gtin` / `gtin_alt`, as GTIN-14;
 * - `restricted`: `product_identifiers` scheme `store_internal` (banner-scoped), as GTIN-14;
 * - `plu`: scheme `plu`, digits as given;
 * - `invalid`: a validation failure (rule `gtin_check_digit` when the reason is `check_digit`).
 */
export type GtinResult =
  | { kind: 'gtin'; value: string }
  | { kind: 'restricted'; value: string }
  | { kind: 'plu'; value: string }
  | { kind: 'invalid'; reason: GtinInvalidReason };

/** Classify a raw code. Whitespace and hyphens are stripped first; any other non-digit is invalid. */
export function normalizeGtin(raw: string): GtinResult {
  const digits = raw.replace(/[\s-]/g, '');
  if (digits === '') return { kind: 'invalid', reason: 'empty' };
  if (!/^[0-9]+$/.test(digits)) return { kind: 'invalid', reason: 'non_digit' };
  if (digits.length === 4 || digits.length === 5) return { kind: 'plu', value: digits };
  if (!GTIN_LENGTHS.test(digits)) return { kind: 'invalid', reason: 'length' };
  const gtin = gtinNormalize(digits);
  if (gtin === null) return { kind: 'invalid', reason: 'check_digit' };
  return { kind: gtinIsRestricted(gtin) ? 'restricted' : 'gtin', value: gtin };
}
