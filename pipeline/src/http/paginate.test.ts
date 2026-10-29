// Ported from legacy providers/fortinos/pagination.test.ts (the generic cases).
import { describe, expect, it } from 'vitest';

import { computeHasNextPage, pageFingerprint } from './paginate.ts';

describe('computeHasNextPage', () => {
  const base = {
    requestedPage: 1,
    requestedPageSize: 48,
    returned: 48,
    totalProducts: null as number | null,
    totalPages: null as number | null,
    pageStartsAt: 1,
  };

  it('stops on an empty page', () => {
    expect(computeHasNextPage({ ...base, returned: 0 })).toBe(false);
  });

  it('uses totalProducts (totalResults) when present', () => {
    expect(computeHasNextPage({ ...base, totalProducts: 142 })).toBe(true);
    expect(computeHasNextPage({ ...base, requestedPage: 3, totalProducts: 142 })).toBe(false);
  });

  it('falls back to short-page detection', () => {
    expect(computeHasNextPage({ ...base, returned: 12 })).toBe(false);
    expect(computeHasNextPage({ ...base, returned: 48 })).toBe(true);
  });

  it('prefers totalPages, with zero-based pages too', () => {
    expect(computeHasNextPage({ ...base, totalPages: 2 })).toBe(true);
    expect(computeHasNextPage({ ...base, requestedPage: 2, totalPages: 2 })).toBe(false);
    expect(computeHasNextPage({ ...base, requestedPage: 1, pageStartsAt: 0, totalPages: 2 })).toBe(
      false,
    );
  });
});

describe('pageFingerprint', () => {
  it('is order-independent and stable', () => {
    expect(pageFingerprint(['a', 'b', 'c'])).toBe(pageFingerprint(['c', 'b', 'a']));
    expect(pageFingerprint(['a'])).not.toBe(pageFingerprint(['b']));
  });
});
