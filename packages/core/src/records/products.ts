// Product and product-identifier records (DATA_MODEL §3.3).
// `content_hash` is not part of the record: P2.11 computes it from the record's imported fields.

import { z } from 'zod';

import { gtinIsRestricted, gtinIsValid } from '../gtin.ts';
import {
  CategorySlugSchema,
  DateTimeSchema,
  Gtin14Schema,
  ProductRefSchema,
  provenanceShape,
  SlugSchema,
  textField,
} from './common.ts';

export const NET_UNITS = ['g', 'ml', 'ct'] as const;

export const ProductRecordSchema = z
  .strictObject({
    gtin: Gtin14Schema.nullish(),
    external_id: textField(200),
    name: textField(500),
    brand_text: textField(300).nullish(),
    /** Set only when the source names a brand we already key (e.g. a legacy exact match). */
    brand_slug: SlugSchema.nullish(),
    category_slug: CategorySlugSchema.nullish(),
    quantity_text: textField(200).nullish(),
    net_quantity: z.number().positive().max(999_999_999).nullish(),
    net_unit: z.enum(NET_UNITS).nullish(),
    pack_count: z.number().int().positive().max(32_767).nullish(),
    unit_parse_status: z.enum(['ok', 'unparsed', 'ambiguous']).default('unparsed'),
    /** `labels.code` values (organic, fair-trade …); the writer maps them to `labels.id`. */
    label_codes: z.array(SlugSchema).max(32).default([]),
    image_key: textField(300).nullish(),
    description: z.string().min(1).nullish(),
    source_modified_at: DateTimeSchema.nullish(),
    status: z.enum(['active', 'discontinued']).default('active'),
    ...provenanceShape,
  })
  .refine((r) => (r.net_quantity == null) === (r.net_unit == null), {
    message: 'net_quantity and net_unit go together',
    path: ['net_unit'],
  })
  .refine((r) => r.unit_parse_status !== 'ok' || r.net_quantity != null, {
    message: 'A parsed size needs net_quantity',
    path: ['net_quantity'],
  });
export type ProductRecord = z.infer<typeof ProductRecordSchema>;

export const IDENTIFIER_SCHEMES = ['gtin_alt', 'store_sku', 'store_internal', 'plu'] as const;
export type IdentifierScheme = (typeof IDENTIFIER_SCHEMES)[number];

/** Same per-scheme rules as the product_identifiers_value_format check. */
function identifierValueOk(scheme: IdentifierScheme, value: string): boolean {
  switch (scheme) {
    case 'gtin_alt':
      return /^[0-9]{14}$/.test(value) && gtinIsValid(value) && !gtinIsRestricted(value);
    case 'plu':
      return /^[0-9]{4,5}$/.test(value);
    case 'store_internal':
      return /^[0-9]+$/.test(value);
    case 'store_sku':
      return true;
  }
}

export const ProductIdentifierRecordSchema = z
  .strictObject({
    product: ProductRefSchema,
    scheme: z.enum(IDENTIFIER_SCHEMES),
    value: textField(64),
    /** Required for banner-scoped schemes (`store_sku`, `store_internal`). */
    banner_slug: SlugSchema.nullish(),
    ...provenanceShape,
  })
  .refine((r) => identifierValueOk(r.scheme, r.value), {
    message: 'Value does not fit the scheme',
    path: ['value'],
  })
  .refine(
    (r) => (r.scheme !== 'store_sku' && r.scheme !== 'store_internal') || r.banner_slug != null,
    { message: 'Store codes need a banner', path: ['banner_slug'] },
  );
export type ProductIdentifierRecord = z.infer<typeof ProductIdentifierRecordSchema>;
