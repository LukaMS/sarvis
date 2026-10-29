// Shared field schemas, the provenance block (DATA_MODEL §1.2) and natural-key references.
//
// Records are what source parsers produce, before any database lookup. Their field names match
// the DATA_MODEL §3 columns. Links to other rows use the other row's stable natural key
// (`brand_slug`, a product's GTIN …), never a surrogate id; the P2.16 writers resolve keys to ids.
// Limits mirror the SQL check constraints so a valid record never fails an insert.

import { z } from 'zod';

import { gtinIsRestricted, gtinIsValid } from '../gtin.ts';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '../slug.ts';

export const textField = (max: number) => z.string().min(1).max(max);

export const SlugSchema = z.string().max(SLUG_MAX_LENGTH).regex(SLUG_PATTERN, 'Not a slug');

/** Path-like category slug, e.g. `dairy/milk/plant-based` (categories.slug). */
export const CategorySlugSchema = z
  .string()
  .max(200)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/, 'Not a category slug');

export const HttpUrlSchema = z.url({ protocol: /^https?$/ });
export const DateTimeSchema = z.iso.datetime({ offset: true });
export const DateSchema = z.iso.date();
export const UuidSchema = z.uuid();
export const CountrySchema = z.string().regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2, upper-case');

/** A stored primary or alternate GTIN: GTIN-14, valid check digit, not restricted-circulation. */
export const Gtin14Schema = z
  .string()
  .regex(/^[0-9]{14}$/, 'GTIN-14 digits')
  .refine(gtinIsValid, 'Bad GTIN check digit')
  .refine((v) => !gtinIsRestricted(v), 'Restricted-circulation code (02/20–29), not a GTIN');

/** Price sanity hard bounds (price_observations check: > 0 and ≤ 10,000). */
export const PRICE_MAX = 10_000;
export const PriceSchema = z.number().positive().max(PRICE_MAX);

/** Only these currencies are accepted; the catalog is Canadian (D-040). */
export const CURRENCIES = ['CAD', 'USD'] as const;
export const CurrencySchema = z.enum(CURRENCIES);

export const ConfidenceSchema = z.number().min(0).max(1);

export const PROVENANCE_METHODS = [
  'import',
  'api',
  'ai',
  'manual',
  'legacy-import',
  'receipt',
  'derived',
] as const;
export type ProvenanceMethod = (typeof PROVENANCE_METHODS)[number];

/**
 * The +prov block. `source_key` is `sources.key` (the writer resolves it to `source_id`).
 * `source_url` may be null only when the source's `url_template` rebuilds it from `external_id`.
 * The run driver fills `ingestion_run_id` and `raw_object_id` when it knows them.
 */
export const provenanceShape = {
  source_key: SlugSchema,
  source_url: HttpUrlSchema.nullish(),
  fetched_at: DateTimeSchema,
  method: z.enum(PROVENANCE_METHODS),
  method_version: textField(200),
  ingestion_run_id: UuidSchema.nullish(),
  raw_object_id: UuidSchema.nullish(),
};
export const ProvenanceSchema = z.strictObject(provenanceShape);
export type Provenance = z.infer<typeof ProvenanceSchema>;

/** A product by its stable key: the GTIN, else the source record id. */
export const ProductRefSchema = z.union([
  z.strictObject({ gtin: Gtin14Schema }),
  z.strictObject({ source_key: SlugSchema, external_id: textField(200) }),
]);
export type ProductRef = z.infer<typeof ProductRefSchema>;

/** A store by its stable key, in DATA_MODEL §1.1 order: OSM, then banner store id, then slug. */
export const StoreRefSchema = z.union([
  z.strictObject({
    osm_type: z.enum(['node', 'way', 'relation']),
    osm_id: z.number().int().positive(),
  }),
  z.strictObject({ banner_slug: SlugSchema, external_store_id: textField(100) }),
  z.strictObject({ slug: SlugSchema }),
]);
export type StoreRef = z.infer<typeof StoreRefSchema>;

/** A store listing by its stable key: the banner SKU, else the banner plus name and size. */
export const ListingRefSchema = z.union([
  z.strictObject({ banner_slug: SlugSchema, external_sku: textField(100) }),
  z.strictObject({
    banner_slug: SlugSchema,
    listing_name: textField(300),
    size_text: textField(100).nullish(),
  }),
]);
export type ListingRef = z.infer<typeof ListingRefSchema>;

/** valid_to ≥ valid_from when both are set (ISO dates compare as strings). */
export function validRangeOk(r: { valid_from?: string | null; valid_to?: string | null }): boolean {
  return !r.valid_from || !r.valid_to || r.valid_to >= r.valid_from;
}
