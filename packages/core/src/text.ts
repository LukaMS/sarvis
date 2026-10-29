// Text helpers for source parsers. cleanText and stripHtml are ported from legacy
// catalog-worker providers/fortinos/normalizer.ts.

const WHITESPACE = /\s+/g;

/** Trim and collapse whitespace; null for null, undefined or blank. */
export function cleanText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).replace(WHITESPACE, ' ').trim();
  return s.length > 0 ? s : null;
}

/** Strip HTML tags and decode the common entities, then cleanText. */
export function stripHtml(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value)
    .replace(/<\s*(br|\/li|\/p|\/div)\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
  return cleanText(text);
}

/**
 * Close TS counterpart of the SQL normalize_match_text (no accents, lower case, single spaces).
 * SQL uses the unaccent dictionary and this uses NFKD, so rare letters (ø, ß, æ) can differ:
 * use it for in-batch keys only, never to look up a stored `listing_key`.
 */
export function normalizeMatchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(WHITESPACE, ' ')
    .trim();
}
