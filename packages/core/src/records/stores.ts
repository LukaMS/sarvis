// Store, store-listing, price-observation and reference-price records (DATA_MODEL §3.4).

import { z } from 'zod';

import {
  CategorySlugSchema,
  CurrencySchema,
  DateSchema,
  DateTimeSchema,
  ListingRefSchema,
  PriceSchema,
  ProductRefSchema,
  provenanceShape,
  SlugSchema,
  StoreRefSchema,
  textField,
} from './common';

export const StoreRecordSchema = z
  .strictObject({
    banner_slug: SlugSchema.nullish(),
    slug: SlugSchema,
    name: textField(200),
    address: textField(300).nullish(),
    city: textField(100).nullish(),
    province: z
      .string()
      .regex(/^[A-Z]{2}$/, 'Two-letter province code')
      .nullish(),
    postal_code: z.string().min(3).max(12).nullish(),
    lat: z.number().min(-90).max(90).nullish(),
    lon: z.number().min(-180).max(180).nullish(),
    osm_type: z.enum(['node', 'way', 'relation']).nullish(),
    osm_id: z.number().int().positive().nullish(),
    external_store_id: textField(100).nullish(),
    status: z.enum(['active', 'closed']).default('active'),
    ...provenanceShape,
  })
  .refine((r) => (r.lat == null) === (r.lon == null), {
    message: 'lat and lon go together',
    path: ['lon'],
  })
  .refine((r) => (r.osm_type == null) === (r.osm_id == null), {
    message: 'osm_type and osm_id go together',
    path: ['osm_id'],
  })
  .refine((r) => r.external_store_id == null || r.banner_slug != null, {
    message: 'external_store_id needs a banner',
    path: ['banner_slug'],
  });
export type StoreRecord = z.infer<typeof StoreRecordSchema>;

export const StoreListingRecordSchema = z
  .strictObject({
    banner_slug: SlugSchema,
    external_sku: textField(100).nullish(),
    listing_name: textField(300),
    size_text: textField(100).nullish(),
    /** Only when the source itself identifies the product; otherwise the P4 matcher sets it. */
    product: ProductRefSchema.nullish(),
    first_seen_at: DateTimeSchema,
    last_seen_at: DateTimeSchema,
    is_active: z.boolean().default(true),
    ...provenanceShape,
  })
  .refine((r) => Date.parse(r.last_seen_at) >= Date.parse(r.first_seen_at), {
    message: 'last_seen_at is before first_seen_at',
    path: ['last_seen_at'],
  });
export type StoreListingRecord = z.infer<typeof StoreListingRecordSchema>;

export const PriceObservationRecordSchema = z
  .strictObject({
    external_id: textField(200).nullish(),
    store: StoreRefSchema,
    product: ProductRefSchema.nullish(),
    listing: ListingRefSchema.nullish(),
    observed_on: DateSchema,
    last_confirmed_on: DateSchema.nullish(),
    price: PriceSchema,
    currency: CurrencySchema.default('CAD'),
    price_kind: z.enum(['regular', 'sale', 'member', 'unknown']).default('unknown'),
    is_discounted: z.boolean().default(false),
    price_without_discount: PriceSchema.nullish(),
    price_per: z.enum(['unit', 'kg', 'lb']).nullish(),
    unit_price: z.number().positive().nullish(),
    unit_basis: z.enum(['g', 'ml', 'ct']).nullish(),
    ...provenanceShape,
  })
  .refine((r) => r.product != null || r.listing != null, {
    message: 'A price needs a product or a listing',
    path: ['product'],
  })
  .refine((r) => r.last_confirmed_on == null || r.last_confirmed_on >= r.observed_on, {
    message: 'last_confirmed_on is before observed_on',
    path: ['last_confirmed_on'],
  })
  .refine((r) => r.price_without_discount == null || r.price_without_discount >= r.price, {
    message: 'price_without_discount is below price',
    path: ['price_without_discount'],
  })
  .refine((r) => (r.unit_price == null) === (r.unit_basis == null), {
    message: 'unit_price and unit_basis go together',
    path: ['unit_basis'],
  });
export type PriceObservationRecord = z.infer<typeof PriceObservationRecordSchema>;

export const ReferencePriceRecordSchema = z.strictObject({
  vector_id: z.string().regex(/^v[0-9]+$/, 'StatCan vector id, e.g. v1234'),
  product_label: textField(300),
  unit: textField(100).nullish(),
  geography: textField(100),
  ref_month: DateSchema.refine((d) => d.endsWith('-01'), 'ref_month is the first of a month'),
  value: PriceSchema,
  category_slug: CategorySlugSchema.nullish(),
  ...provenanceShape,
});
export type ReferencePriceRecord = z.infer<typeof ReferencePriceRecordSchema>;
