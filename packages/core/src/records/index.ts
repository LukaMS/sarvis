// Record schemas per kind: the validated shapes every source parser produces (PLAN P2.10).

import type { z } from 'zod';

import { DocumentRecordSchema } from './documents';
import {
  BrandOwnershipEdgeRecordSchema,
  BrandRecordSchema,
  CompanyOwnershipEdgeRecordSchema,
  CompanyRecordSchema,
} from './ownership';
import { ProductIdentifierRecordSchema, ProductRecordSchema } from './products';
import {
  PriceObservationRecordSchema,
  ReferencePriceRecordSchema,
  StoreListingRecordSchema,
  StoreRecordSchema,
} from './stores';

export * from './common';
export * from './documents';
export * from './ownership';
export * from './products';
export * from './stores';

export const RECORD_SCHEMAS = {
  company: CompanyRecordSchema,
  brand: BrandRecordSchema,
  brand_ownership: BrandOwnershipEdgeRecordSchema,
  company_ownership: CompanyOwnershipEdgeRecordSchema,
  product: ProductRecordSchema,
  product_identifier: ProductIdentifierRecordSchema,
  store: StoreRecordSchema,
  store_listing: StoreListingRecordSchema,
  price_observation: PriceObservationRecordSchema,
  reference_price: ReferencePriceRecordSchema,
  document: DocumentRecordSchema,
} as const;

export type RecordKind = keyof typeof RECORD_SCHEMAS;
export const RECORD_KINDS = Object.keys(RECORD_SCHEMAS) as RecordKind[];

/** The parsed (defaults applied) record type for a kind. */
export type RecordOf<K extends RecordKind> = z.infer<(typeof RECORD_SCHEMAS)[K]>;
/** What a parser may emit for a kind (defaults may be omitted). */
export type RecordInputOf<K extends RecordKind> = z.input<(typeof RECORD_SCHEMAS)[K]>;
