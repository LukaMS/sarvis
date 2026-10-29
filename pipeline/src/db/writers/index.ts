// The writer for each record kind the pipeline imports (PLAN P2.16). Scoring and document
// writers come in Phase 7; reference prices with the StatCan source.
import type { RecordKind } from '@sarvis/core';

import type { ServiceClient } from '../client.ts';
import type { DomainWriter } from './common.ts';
import {
  brandOwnershipWriter,
  brandWriter,
  companyOwnershipWriter,
  companyWriter,
} from './ownership.ts';
import { priceObservationWriter } from './prices.ts';
import { productIdentifierWriter, productWriter } from './products.ts';
import { storeListingWriter, storeWriter } from './stores.ts';

export type { DomainWriter } from './common.ts';

type WriterFactories = { [K in RecordKind]?: (db: ServiceClient) => DomainWriter<K> };

const WRITERS: WriterFactories = {
  company: companyWriter,
  brand: brandWriter,
  brand_ownership: brandOwnershipWriter,
  company_ownership: companyOwnershipWriter,
  product: productWriter,
  product_identifier: productIdentifierWriter,
  store: storeWriter,
  store_listing: storeListingWriter,
  price_observation: priceObservationWriter,
};

export function hasWriter(kind: RecordKind): boolean {
  return kind in WRITERS;
}

/** The writer for a record kind. Throws for a kind with no writer yet. */
export function writerFor<K extends RecordKind>(db: ServiceClient, kind: K): DomainWriter<K> {
  const factory = WRITERS[kind] as ((db: ServiceClient) => DomainWriter<K>) | undefined;
  if (!factory) throw new Error(`No writer for record kind ${kind} yet.`);
  return factory(db);
}
