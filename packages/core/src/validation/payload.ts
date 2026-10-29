// Trims a failed record for validation_failures.payload, whose check is
// octet_length(payload::text) <= 1024. Postgres prints jsonb with ", " and ": " separators,
// so sizes are measured in that form, in UTF-8 bytes.

export const PAYLOAD_MAX_BYTES = 1024;

function utf8Length(text: string): number {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

/** The text of `value` as Postgres prints it back from a jsonb column (key order aside). */
export function jsonbText(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(jsonbText).join(', ')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}: ${jsonbText(v)}`).join(', ')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return 'null';
  return JSON.stringify(value) ?? 'null';
}

export function jsonbBytes(value: unknown): number {
  return utf8Length(jsonbText(value));
}

function shrink(value: unknown, maxString: number, maxItems: number, depth: number): unknown {
  if (typeof value === 'string') {
    return value.length > maxString ? `${value.slice(0, maxString)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (depth <= 0) return '…';
  if (Array.isArray(value)) {
    const items = value.slice(0, maxItems).map((v) => shrink(v, maxString, maxItems, depth - 1));
    return value.length > maxItems ? [...items, `…${value.length - maxItems} more`] : items;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const kept = entries
      .slice(0, maxItems * 4)
      .map(([k, v]) => [k.slice(0, 64), shrink(v, maxString, maxItems, depth - 1)] as const);
    return Object.fromEntries(kept);
  }
  return String(value).slice(0, maxString);
}

/**
 * The value itself when it fits in 1 KB, else a shrunk copy (shorter strings, fewer items, less depth)
 * marked `_truncated: true`. Always fits.
 */
export function trimPayload(value: unknown, maxBytes = PAYLOAD_MAX_BYTES): unknown {
  if (jsonbBytes(value) <= maxBytes) return value;
  for (const [maxString, maxItems, depth] of [
    [200, 10, 4],
    [60, 5, 3],
    [20, 3, 2],
    [8, 2, 1],
  ] as const) {
    const shrunk = shrink(value, maxString, maxItems, depth);
    const marked =
      shrunk !== null && typeof shrunk === 'object' && !Array.isArray(shrunk)
        ? { _truncated: true, ...shrunk }
        : { _truncated: true, value: shrunk };
    if (jsonbBytes(marked) <= maxBytes) return marked;
  }
  return { _truncated: true };
}
