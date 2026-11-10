import { describe, expect, it } from 'vitest';
import type { Tables } from '@sarvis/core';

import { byteaHash, changedColumns } from '../change.ts';
import { isOlder, productSpec, resolvedRefs, takeoverPatch, takesOver } from './products.ts';

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

describe('legacy takeover (P4.4)', () => {
  const OFF = 'off-id';
  const auto = new Set([OFF]);
  const legacy = {
    id: 'p1',
    method: 'legacy-import',
    review_status: 'pending',
    reviewed_by: null,
    status: 'active',
    locked_fields: [],
  };

  it('an auto-approved source takes over a pending, unlocked legacy row', () => {
    expect(takesOver(legacy, { source_id: OFF }, auto)).toBe(true);
  });

  it('nobody else does, and no row an admin touched is taken', () => {
    expect(takesOver(legacy, { source_id: 'fixture-id' }, auto)).toBe(false);
    expect(takesOver({ ...legacy, method: 'import' }, { source_id: OFF }, auto)).toBe(false);
    for (const review_status of ['approved', 'rejected']) {
      expect(takesOver({ ...legacy, review_status }, { source_id: OFF }, auto)).toBe(false);
    }
    expect(takesOver({ ...legacy, reviewed_by: 'u1' }, { source_id: OFF }, auto)).toBe(false);
    for (const status of ['merged', 'rejected']) {
      expect(takesOver({ ...legacy, status }, { source_id: OFF }, auto)).toBe(false);
    }
    expect(takesOver({ ...legacy, locked_fields: ['name'] }, { source_id: OFF }, auto)).toBe(false);
  });

  // Every products column, and whether the takeover patch sets it. The Record type makes a new
  // column a compile error here until someone decides whether a takeover must clear it.
  const COLUMNS: Record<keyof Tables<'products'>, 'patch' | 'kept'> = {
    id: 'kept',
    gtin: 'kept',
    created_at: 'kept',
    updated_at: 'kept',
    status: 'kept',
    merged_into_id: 'kept',
    locked_fields: 'kept',
    review_status: 'kept',
    reviewed_by: 'kept',
    reviewed_at: 'kept',
    decision_method: 'kept',
    name: 'kept',
    source_id: 'patch',
    external_id: 'patch',
    source_url: 'patch',
    fetched_at: 'patch',
    method: 'patch',
    method_version: 'patch',
    ingestion_run_id: 'patch',
    raw_object_id: 'patch',
    brand_id: 'patch',
    brand_text: 'patch',
    category_id: 'patch',
    quantity_text: 'patch',
    net_quantity: 'patch',
    net_unit: 'patch',
    pack_count: 'patch',
    unit_parse_status: 'patch',
    label_codes: 'patch',
    image_key: 'patch',
    description: 'patch',
    source_modified_at: 'patch',
    content_hash: 'patch',
  };

  const payload = {
    gtin: '00067800005093',
    external_id: '0067800005093',
    name: 'Scoobi Doo',
    source_id: OFF,
    source_url: null,
    fetched_at: '2026-11-10T00:00:00.000Z',
    method: 'import',
    method_version: 'off@1.1.0',
    ingestion_run_id: 'run-1',
    raw_object_id: 'raw-1',
  };

  it('takes the identity and provenance, and clears every content column', () => {
    const patch = takeoverPatch(payload);
    const expected = Object.entries(COLUMNS)
      .filter(([, v]) => v === 'patch')
      .map(([k]) => k);
    expect(Object.keys(patch).sort()).toEqual(expected.sort());
    expect(patch).toMatchObject({
      source_id: OFF,
      external_id: '0067800005093',
      method: 'import',
      method_version: 'off@1.1.0',
      ingestion_run_id: 'run-1',
      description: null,
      brand_id: null,
      label_codes: [],
      unit_parse_status: 'unparsed',
      content_hash: null,
    });
  });

  it('the product name is left for the record write, which always sends one', () => {
    expect(takeoverPatch(payload)).not.toHaveProperty('name');
  });
});
