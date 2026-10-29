// Price parsing for source parsers. Ported from legacy catalog-worker providers/fortinos/normalizer.ts,
// with negative prices rejected.

/**
 * Parse a price that may be a number, a numeric string ("$4.49", "4,49") or a nested object
 * like { value: 4.49 }. Never guesses: anything unparseable, non-finite or negative is null.
 * Zero passes through; the price_sanity rule rejects it later, with a recorded failure.
 */
export function parsePrice(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.,-]/g, '').replace(/,(?=\d{2}$)/, '.');
    const normalized = cleaned.replace(/,/g, '');
    if (normalized === '' || normalized === '-') return null;
    const n = Number(normalized);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['value', 'amount', 'price']) {
      if (key in obj) {
        const parsed = parsePrice(obj[key]);
        if (parsed != null) return parsed;
      }
    }
  }
  return null;
}
