import { describe, expect, it } from 'vitest';

import { canonicalJson, contentHash } from './content-hash';

describe('contentHash', () => {
  const base = {
    external_id: '1',
    name: 'Milk',
    brand_text: 'Farm',
    quantity_text: '2 L',
    label_codes: ['organic'],
    fetched_at: '2026-10-29T00:00:00Z',
  };

  it('is identical for reordered keys, at every level', () => {
    const reordered = {
      label_codes: ['organic'],
      fetched_at: '2026-10-29T00:00:00Z',
      quantity_text: '2 L',
      name: 'Milk',
      brand_text: 'Farm',
      external_id: '1',
    };
    expect(contentHash(reordered)).toBe(contentHash(base));
    expect(contentHash({ a: { x: 1, y: 2 } })).toBe(contentHash({ a: { y: 2, x: 1 } }));
  });

  // Legacy fingerprintMetadata case.
  it('is stable and change-sensitive', () => {
    expect(contentHash(base)).toBe(contentHash({ ...base }));
    expect(contentHash(base)).not.toBe(contentHash({ ...base, name: 'Milk 2%' }));
    expect(contentHash(base)).not.toBe(contentHash({ ...base, label_codes: [] }));
  });

  it('ignores run bookkeeping fields and the given omit list', () => {
    const rerun = { ...base, fetched_at: '2026-11-01T00:00:00Z', method_version: 'x@2' };
    expect(contentHash(rerun)).toBe(contentHash(base));
    expect(contentHash({ ...base, source_url: 'https://a' }, ['source_url'])).toBe(
      contentHash(base),
    );
  });

  it('treats null and missing fields alike', () => {
    expect(contentHash({ ...base, description: null })).toBe(contentHash(base));
  });

  it('is a 64-character hex string', () => {
    expect(contentHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('serialises canonically', () => {
    expect(canonicalJson({ b: [2, 1], a: 'x', c: null })).toBe('{"a":"x","b":[2,1]}');
  });
});
