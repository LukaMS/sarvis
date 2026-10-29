// Change detection. The first ten cases are ported from legacy db/upsert.test.ts, renamed to the
// new price_observations and store_listings columns; the rest cover the column diff.
import { describe, expect, it } from 'vitest';

import {
  byteaHash,
  changedColumns,
  listingKeyOf,
  listingStateChanged,
  priceFieldsChanged,
  roundTo,
  sameValue,
} from './change.ts';

const NEXT = {
  price: 4.49,
  price_without_discount: 5.99,
  currency: 'CAD',
  is_discounted: true,
  price_per: null,
  unit_price: null,
  unit_basis: null,
};

describe('priceFieldsChanged', () => {
  it('treats a first observation (no prev) as changed', () => {
    expect(priceFieldsChanged(undefined, NEXT)).toBe(true);
  });

  it('returns false when prices are unchanged', () => {
    expect(priceFieldsChanged({ ...NEXT }, NEXT)).toBe(false);
  });

  it('ignores sub-cent float noise', () => {
    expect(priceFieldsChanged({ ...NEXT, price: 4.490001 }, NEXT)).toBe(false);
  });

  it('detects a real price change', () => {
    expect(priceFieldsChanged({ ...NEXT, price: 3.99 }, NEXT)).toBe(true);
  });

  it('detects a discount change', () => {
    expect(priceFieldsChanged({ ...NEXT, is_discounted: false }, NEXT)).toBe(true);
  });
});

describe('listingStateChanged', () => {
  const next = { listing_name: 'PC BLK BEAN', size_text: '540 mL', is_active: true };
  it('is true without a prior row', () => {
    expect(listingStateChanged(undefined, next)).toBe(true);
  });
  it('is false when unchanged', () => {
    expect(listingStateChanged({ ...next }, next)).toBe(false);
  });
  it('detects an active flip', () => {
    expect(listingStateChanged({ ...next, is_active: false }, next)).toBe(true);
  });
  it('treats null vs a value as a change', () => {
    expect(listingStateChanged({ ...next, size_text: null }, next)).toBe(true);
  });
});

describe('listingKeyOf', () => {
  it('lowercases and collapses whitespace', () => {
    expect(listingKeyOf('  Organic   WHOLE  Milk ', null)).toBe('organic whole milk');
  });
  it('appends the size and drops accents', () => {
    expect(listingKeyOf('Café  Noir', '340 G')).toBe('cafe noir 340 g');
  });
});

describe('sameValue and changedColumns', () => {
  it('treats null and missing as equal', () => {
    expect(sameValue(null, undefined)).toBe(true);
    expect(sameValue('a', null)).toBe(false);
  });
  it('compares timestamps by instant, not by spelling', () => {
    expect(sameValue('2026-10-29T12:00:00+00:00', '2026-10-29T12:00:00.000Z')).toBe(true);
    expect(sameValue('2026-10-29T12:00:00+00:00', '2026-10-29T12:00:01Z')).toBe(false);
  });
  it('compares numerics returned as strings and arrays by content', () => {
    expect(sameValue('340.000', 340)).toBe(true);
    expect(sameValue([1, 2], [1, 2])).toBe(true);
    expect(sameValue([1, 2], [2, 1])).toBe(false);
  });
  it('lists only the changed, non-ignored columns', () => {
    const stored = { name: 'Oats', brand_text: 'Quaker', fetched_at: '2026-10-01T00:00:00Z' };
    const next = { name: 'Rolled Oats', brand_text: 'Quaker', fetched_at: '2026-10-29T00:00:00Z' };
    expect(changedColumns(stored, next, new Set(['fetched_at']))).toEqual(['name']);
  });
});

describe('byteaHash and roundTo', () => {
  it('is \\x plus hex, the same for reordered keys and blind to run provenance', () => {
    const a = byteaHash({
      name: 'Oats',
      gtin: '00055577105658',
      fetched_at: '2026-10-01T00:00:00Z',
    });
    const b = byteaHash({
      fetched_at: '2026-10-29T00:00:00Z',
      gtin: '00055577105658',
      name: 'Oats',
    });
    expect(a).toMatch(/^\\x[0-9a-f]{64}$/);
    expect(a).toBe(b);
  });
  it('rounds to the column scale and keeps null', () => {
    expect(roundTo(0.33333, 3)).toBe(0.333);
    expect(roundTo(null, 2)).toBeNull();
  });
});
