// Record schemas per kind: the validated shapes every source parser produces (PLAN P2.10).

import type { z } from 'zod';

import { DocumentRecordSchema } from './documents.ts';
import {
  ProductFeatureRecordSchema,
  StoryRecordSchema,
  TransparencyStepRecordSchema,
} from './editorial.ts';
import {
  BrandOwnershipEdgeRecordSchema,
  BrandRecordSchema,
  CompanyEnrichmentRecordSchema,
  CompanyOwnershipEdgeRecordSchema,
  CompanyRecordSchema,
} from './ownership.ts';
import { ProductIdentifierRecordSchema, ProductRecordSchema } from './products.ts';
import {
  CertificationRecordSchema,
  CompanyEventRecordSchema,
  CompanyScoreRecordSchema,
} from './scoring.ts';
import {
  PriceObservationRecordSchema,
  ReferencePriceRecordSchema,
  StoreListingRecordSchema,
  StoreRecordSchema,
} from './stores.ts';

export * from './common.ts';
export * from './documents.ts';
export * from './editorial.ts';
export * from './ownership.ts';
export * from './products.ts';
export * from './scoring.ts';
export * from './stores.ts';

export const RECORD_SCHEMAS = {
  company: CompanyRecordSchema,
  brand: BrandRecordSchema,
  brand_ownership: BrandOwnershipEdgeRecordSchema,
  company_ownership: CompanyOwnershipEdgeRecordSchema,
  company_enrichment: CompanyEnrichmentRecordSchema,
  product: ProductRecordSchema,
  product_identifier: ProductIdentifierRecordSchema,
  store: StoreRecordSchema,
  store_listing: StoreListingRecordSchema,
  price_observation: PriceObservationRecordSchema,
  reference_price: ReferencePriceRecordSchema,
  document: DocumentRecordSchema,
  company_score: CompanyScoreRecordSchema,
  certification: CertificationRecordSchema,
  company_event: CompanyEventRecordSchema,
  product_feature: ProductFeatureRecordSchema,
  transparency_step: TransparencyStepRecordSchema,
  story: StoryRecordSchema,
} as const;

export type RecordKind = keyof typeof RECORD_SCHEMAS;
export const RECORD_KINDS = Object.keys(RECORD_SCHEMAS) as RecordKind[];

/** The parsed (defaults applied) record type for a kind. */
export type RecordOf<K extends RecordKind> = z.infer<(typeof RECORD_SCHEMAS)[K]>;
/** What a parser may emit for a kind (defaults may be omitted). */
export type RecordInputOf<K extends RecordKind> = z.input<(typeof RECORD_SCHEMAS)[K]>;
