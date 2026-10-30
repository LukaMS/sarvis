import { describe, expect, it } from 'vitest';

import { isOlder, productSpec } from './products.ts';

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
