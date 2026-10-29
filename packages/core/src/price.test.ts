import { describe, expect, it } from 'vitest';

import { parsePrice } from './price.ts';

describe('parsePrice', () => {
  // Legacy cases from catalog-worker providers/fortinos/normalizer.test.ts.
  it('parses plain and $-prefixed strings', () => {
    expect(parsePrice('2.99')).toBe(2.99);
    expect(parsePrice('$4.49')).toBe(4.49);
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice('')).toBeNull();
  });

  it('parses decimal commas, thousands separators and nested objects', () => {
    expect(parsePrice('4,49')).toBe(4.49);
    expect(parsePrice('1,299.00')).toBe(1299);
    expect(parsePrice({ value: 3.5 })).toBe(3.5);
    expect(parsePrice({ amount: '$2.00' })).toBe(2);
  });

  it('rejects negative, non-finite and unparseable prices', () => {
    expect(parsePrice(-1)).toBeNull();
    expect(parsePrice('-$4.49')).toBeNull();
    expect(parsePrice(Number.NaN)).toBeNull();
    expect(parsePrice(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parsePrice('free')).toBeNull();
    expect(parsePrice({ value: -2 })).toBeNull();
  });
});
