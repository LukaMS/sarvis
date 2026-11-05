import { describe, expect, it } from 'vitest';

import { byteaHash, changedColumns } from '../change.ts';
import { isOlder, productSpec, resolvedRefs } from './products.ts';

describe('older readings (P3.7)', () => {
  it('is older only when both times are known and the new one is strictly earlier', () => {
    // PostgREST returns timestamptz as "2026-10-30 05:00:00+00"; records carry ISO strings.
    expect(isOlder('2026-10-17T05:00:00.000Z', '2026-10-30 05:00:00+00')).toBe(true);
    expect(isOlder('2026-10-30T05:00:00.000Z', '2026-10-30 05:00:00+00')).toBe(false);
    expect(isOlder('2026-10-31T00:00:00.000Z', '2026-10-30 05:00:00+00')).toBe(false);
    expect(isOlder(null, '2026-10-30 05:00:00+00')).toBe(false);
    expect(isOlder('2026-10-17T05:00:00.000Z', null)).toBe(false);
    expect(isOlder('not a date', '2026-10-30 05:00:00+00')).toBe(false);
  });

  it('the product spec compares source_modified_at', () => {
    const stored = { source_modified_at: '2026-10-30 05:00:00+00' };
    const payload = (iso: string) =>
      ({ source_modified_at: iso }) as Parameters<NonNullable<typeof productSpec.stale>>[1];
    expect(productSpec.stale?.(stored, payload('2026-10-17T05:00:00.000Z'))).toBe(true);
    expect(productSpec.stale?.(stored, payload('2026-10-30T06:00:00.000Z'))).toBe(false);
  });
});

describe('resolved columns (P4.2)', () => {
  const refs = {
    slug: (table: string, slug: string | null | undefined) =>
      slug === 'known' ? `${table}-id` : undefined,
  };

  it('a record with no slug, or an unknown one, has no opinion', () => {
    expect(resolvedRefs(refs, undefined, undefined)).toEqual({});
    expect(resolvedRefs(refs, null, null)).toEqual({});
    expect(resolvedRefs(refs, 'unknown', 'unknown')).toEqual({});
  });

  it('a known slug still writes, one column at a time', () => {
    expect(resolvedRefs(refs, 'known', 'known')).toEqual({
      brand_id: 'brands-id',
      category_id: 'categories-id',
    });
    expect(resolvedRefs(refs, 'known', null)).toEqual({ brand_id: 'brands-id' });
    expect(resolvedRefs(refs, null, 'known')).toEqual({ category_id: 'categories-id' });
  });

  it('a stored brand and category are not a change when the record leaves them out', () => {
    const stored = { name: 'Old', brand_id: 'b1', category_id: 'c1' };
    const payload = { name: 'New', ...resolvedRefs(refs, undefined, undefined) };
    expect(changedColumns(stored, payload, new Set())).toEqual(['name']);
  });

  it('hashes the same as the explicit nulls stored rows were written with', () => {
    const name = { name: 'Same' };
    expect(byteaHash({ ...name, ...resolvedRefs(refs, null, null) })).toBe(
      byteaHash({ ...name, brand_id: null, category_id: null }),
    );
  });
});
