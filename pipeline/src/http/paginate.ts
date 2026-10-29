// Generic pagination helpers (ported from legacy providers/fortinos/pagination.ts; the Fortinos
// response adapter is dropped).
import { createHash } from 'node:crypto';

export function computeHasNextPage(args: {
  requestedPage: number;
  requestedPageSize: number;
  returned: number;
  totalProducts: number | null;
  totalPages: number | null;
  pageStartsAt: number;
}): boolean {
  const { requestedPage, requestedPageSize, returned, pageStartsAt } = args;

  // An empty page is always the end.
  if (returned === 0) return false;

  // Prefer explicit pagination metadata when the source supplies it.
  if (args.totalPages != null && args.totalPages > 0) {
    const zeroBasedIndex = requestedPage - pageStartsAt;
    return zeroBasedIndex + 1 < args.totalPages;
  }
  if (args.totalProducts != null && args.totalProducts >= 0) {
    const seenSoFar = (requestedPage - pageStartsAt + 1) * requestedPageSize;
    return seenSoFar < args.totalProducts;
  }

  // Otherwise: a short page means we've reached the end.
  return returned >= requestedPageSize;
}

/** Stable fingerprint of a page's ids, for loop detection. */
export function pageFingerprint(externalIds: string[]): string {
  const sorted = [...externalIds].sort();
  return createHash('sha1').update(sorted.join('|')).digest('hex');
}
