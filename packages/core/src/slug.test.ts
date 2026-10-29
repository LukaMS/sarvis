import { describe, expect, it } from 'vitest';

import { isSlug, SLUG_MAX_LENGTH, slugify, uniqueSlug } from './slug.ts';

describe('slugify', () => {
  it.each([
    ["Ben's Original", 'bens-original'],
    ['Ben & Jerry’s', 'ben-and-jerrys'],
    ["M&M's", 'm-and-ms'],
    ['Nestlé', 'nestle'],
    ['Häagen-Dazs', 'haagen-dazs'],
    ['  Kraft   Heinz  ', 'kraft-heinz'],
    ['The Coca-Cola Company', 'the-coca-cola-company'],
    ['Œuvre ﬁne', 'uvre-fine'],
    ['7UP', '7up'],
    ['!!!', ''],
  ])('%j → %j', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('caps at 64 characters without a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(63)} bcd`);
    expect(slug).toBe('a'.repeat(63));
    const long = slugify('word '.repeat(30));
    expect(long.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(isSlug(long)).toBe(true);
  });
});

describe('uniqueSlug', () => {
  it('returns the base when free', () => {
    expect(uniqueSlug('bens-original', new Set())).toBe('bens-original');
  });

  it('appends the country, then -2, -3 …', () => {
    const taken = new Set(['bens-original', 'bens-original-ca', 'bens-original-ca-2']);
    expect(uniqueSlug('bens-original', taken, 'CA')).toBe('bens-original-ca-3');
    expect(uniqueSlug('bens-original', new Set(['bens-original']), 'CA')).toBe('bens-original-ca');
  });

  it('counts from -2 without a country', () => {
    expect(uniqueSlug('mars', new Set(['mars', 'mars-2']))).toBe('mars-3');
  });

  it('accepts a predicate', () => {
    expect(uniqueSlug('mars', (s) => s === 'mars')).toBe('mars-2');
  });

  it('keeps suffixed slugs within 64 characters', () => {
    const base = 'a'.repeat(64);
    const slug = uniqueSlug(base, new Set([base]), 'us');
    expect(slug).toBe(`${'a'.repeat(61)}-us`);
    expect(isSlug(slug)).toBe(true);
  });

  it('rejects a base that is not a slug', () => {
    expect(() => uniqueSlug('Bad Slug', new Set())).toThrow();
  });
});
