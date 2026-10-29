// Slugs for companies, brands, categories, banners, stores and sources (DATA_MODEL §1.3).
// The pattern and length match the SQL `public.slug` domain.

export const SLUG_MAX_LENGTH = 64;
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Cut to `max` characters without leaving a trailing hyphen. */
function cap(slug: string, max: number): string {
  return slug.slice(0, max).replace(/-+$/, '');
}

/**
 * "Ben's Original" → `bens-original`. Returns '' when the name has no Latin letters or digits,
 * which the record schemas reject, so the record lands in validation_failures instead of crashing a run.
 */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['‘’ʼ`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cap(slug, SLUG_MAX_LENGTH);
}

export function isSlug(value: string): boolean {
  return value.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(value);
}

/**
 * The first free slug in the §1.3 collision order: `base`, then `base-{country}` when a country
 * is given, then `-2`, `-3` … on the last of those. Suffixes always fit in 64 characters.
 */
export function uniqueSlug(
  base: string,
  taken: ReadonlySet<string> | ((slug: string) => boolean),
  country?: string | null,
): string {
  const isTaken = typeof taken === 'function' ? taken : (s: string) => taken.has(s);
  const withSuffix = (stem: string, suffix: string) =>
    `${cap(stem, SLUG_MAX_LENGTH - suffix.length - 1)}-${suffix}`;
  if (!isSlug(base)) throw new Error(`uniqueSlug: "${base}" is not a slug`);
  if (!isTaken(base)) return base;
  let stem = base;
  if (country) {
    stem = withSuffix(base, country.toLowerCase());
    if (!isTaken(stem)) return stem;
  }
  for (let n = 2; n <= 10_000; n++) {
    const candidate = withSuffix(stem, String(n));
    if (!isTaken(candidate)) return candidate;
  }
  throw new Error(`uniqueSlug: no free slug for "${base}"`);
}
