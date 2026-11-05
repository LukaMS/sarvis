// GTIN rules (DATA_MODEL §1.4). gtinIsValid, upcEToUpcA, gtinNormalize and gtinIsRestricted are exact
// twins of the SQL helpers gtin_is_valid / gtin_upce_to_upca / gtin_normalize / gtin_is_restricted.
// Both sides pass gtin.vectors.json: gtin.test.ts here, `npm run check:gtin` for SQL.
// normalizeGtin() is the entry point for parsers.

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

/**
 * The UPC-A a zero-suppressed UPC-E code stands for, or null when value isn't a valid UPC-E.
 * Number system 0 only: OFF's would-be number system 1 codes never matched their brand's
 * manufacturer prefix, so they're EAN-8 (D-078). The check digit carries over unchanged.
 */
export function upcEToUpcA(value: string): string | null {
  if (!/^0[0-9]{7}$/.test(value)) return null;
  const d = value.slice(1, 7);
  const last = d.slice(5);
  let middle: string;
  if (last <= '2') middle = `${d.slice(0, 2)}${last}0000${d.slice(2, 5)}`;
  else if (last === '3') middle = `${d.slice(0, 3)}00000${d.slice(3, 5)}`;
  else if (last === '4') middle = `${d.slice(0, 4)}00000${d.slice(4, 5)}`;
  else middle = `${d.slice(0, 5)}0000${last}`;
  const upcA = `0${middle}${value.slice(7)}`;
  return gtinIsValid(upcA) ? upcA : null;
}

/**
 * The GTIN-14 form, or null when not a valid code. UPC-A gets 00, EAN-13 gets 0, EAN-8 gets six 0s.
 * An 8-digit code that is valid UPC-E is read as UPC-E first, even when it's also a valid EAN-8:
 * codes ending in 5–9 pass both checks by construction, and an EAN-8 starting with 0 is restricted.
 */
export function gtinNormalize(value: string): string | null {
  const upcA = upcEToUpcA(value);
  if (upcA !== null) return upcA.padStart(14, '0');
  return gtinIsValid(value) ? value.padStart(14, '0') : null;
}

/**
 * True for a valid code with GS1 prefix 02 or 20–29 (variable-weight and in-store codes), or an
 * EAN-8 with prefix 0 or 2 (RCN-8), which is six 0s then 0 or 2 in its GTIN-14 form.
 */
export function gtinIsRestricted(value: string): boolean {
  return /^(0(02|2)|000000[02])/.test(gtinNormalize(value) ?? '');
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
