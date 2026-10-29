// Change detection for the writers (ported from legacy db/upsert.ts): the 0.005 price epsilon,
// listing-state comparison, and a column diff that tolerates how PostgREST returns values.
import { canonicalJson, contentHash, normalizeMatchText } from '@sarvis/core';

/** Prices closer than this are the same price (sub-cent float noise). */
export const PRICE_EPSILON = 0.005;

function numEq(a: number | null | undefined, b: number | null | undefined): boolean {
  const av = a ?? null;
  const bv = b ?? null;
  if (av === null || bv === null) return av === bv;
  return Math.abs(av - bv) < PRICE_EPSILON;
}

/** The price_observations fields that make a reading different from the last one. */
export type PriceFields = {
  price: number;
  price_without_discount: number | null;
  currency: string;
  is_discounted: boolean;
  price_per: string | null;
  unit_price: number | null;
  unit_basis: string | null;
};

/** Whether a reading differs enough from the previous one to append a new row. */
export function priceFieldsChanged(prev: PriceFields | undefined, next: PriceFields): boolean {
  if (!prev) return true;
  return (
    !numEq(prev.price, next.price) ||
    !numEq(prev.price_without_discount, next.price_without_discount) ||
    // unit_price is per gram or ml, so the cent epsilon would hide real changes.
    (prev.unit_price ?? null) !== (next.unit_price ?? null) ||
    prev.currency !== next.currency ||
    prev.is_discounted !== next.is_discounted ||
    (prev.price_per ?? null) !== (next.price_per ?? null) ||
    (prev.unit_basis ?? null) !== (next.unit_basis ?? null)
  );
}

/** The store_listings fields an import may change on a known listing. */
export type ListingState = {
  listing_name: string;
  size_text: string | null;
  is_active: boolean;
};

/** Whether a listing's name, size or active flag changed (legacy availabilityChanged). */
export function listingStateChanged(prev: ListingState | undefined, next: ListingState): boolean {
  if (!prev) return true;
  return (
    prev.listing_name !== next.listing_name ||
    (prev.size_text ?? null) !== (next.size_text ?? null) ||
    prev.is_active !== next.is_active
  );
}

/**
 * The in-batch twin of the generated `store_listings.listing_key`. It matches the SQL for plain
 * text; rare letters (ø, ß) can differ, so lookups also try the raw name (see writers/stores.ts).
 */
export function listingKeyOf(listingName: string, sizeText: string | null | undefined): string {
  return normalizeMatchText(listingName + (sizeText ? ` ${sizeText}` : ''));
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Whether a stored value equals the value about to be written. PostgREST returns timestamps as
 * `+00:00` and may return numerics as strings, and null and missing mean the same.
 */
export function sameValue(stored: unknown, next: unknown): boolean {
  const a = stored ?? null;
  const b = next ?? null;
  if (a === null || b === null) return a === b;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  if (Array.isArray(a) || Array.isArray(b)) return canonicalJson(a) === canonicalJson(b);
  if (
    typeof a === 'string' &&
    typeof b === 'string' &&
    ISO_DATETIME.test(a) &&
    ISO_DATETIME.test(b)
  )
    return Date.parse(a) === Date.parse(b);
  if (typeof a === 'object' || typeof b === 'object') return canonicalJson(a) === canonicalJson(b);
  return a === b;
}

/** The columns of `next` whose value differs from `stored`, skipping `ignore`. */
export function changedColumns(
  stored: Record<string, unknown>,
  next: Record<string, unknown>,
  ignore: ReadonlySet<string>,
): string[] {
  return Object.keys(next).filter((c) => !ignore.has(c) && !sameValue(stored[c], next[c]));
}

/** `content_hash` as PostgREST writes and returns bytea: `\x` plus hex. */
export function byteaHash(row: Record<string, unknown>, omit: readonly string[] = []): string {
  return `\\x${contentHash(row, omit)}`;
}

/** Rounds to a numeric column's scale, so a re-read of the stored value compares equal. */
export function roundTo(value: number | null | undefined, scale: number): number | null {
  if (value == null) return null;
  const f = 10 ** scale;
  return Math.round(value * f) / f;
}
