// Stable keys per record kind (DATA_MODEL §1.1), used for the in-batch duplicate rule and as
// validation_failures.record_key. A record can have several keys (a product has its source id and
// its GTIN); two records clash when they share any key.

import type { ListingRef, ProductRef, RecordKind, RecordOf, StoreRef } from '../records/index.ts';
import { normalizeMatchText } from '../text.ts';

const productRefKey = (r: ProductRef) =>
  'gtin' in r ? `gtin:${r.gtin}` : `src:${r.source_key}:${r.external_id}`;

const storeRefKey = (r: StoreRef) =>
  'osm_type' in r
    ? `osm:${r.osm_type}/${r.osm_id}`
    : 'external_store_id' in r
      ? `banner:${r.banner_slug}:${r.external_store_id}`
      : `slug:${r.slug}`;

const listingKey = (banner: string, name: string, size?: string | null) =>
  `listing:${banner}:${normalizeMatchText(name + (size ? ` ${size}` : ''))}`;

const listingRefKey = (r: ListingRef) =>
  'external_sku' in r
    ? `sku:${r.banner_slug}:${r.external_sku}`
    : listingKey(r.banner_slug, r.listing_name, r.size_text);

const KEYS: { [K in RecordKind]: (r: RecordOf<K>) => (string | false | null | undefined)[] } = {
  company: (r) => [r.slug, r.wikidata_qid && `qid:${r.wikidata_qid}`],
  brand: (r) => [r.slug, r.wikidata_qid && `qid:${r.wikidata_qid}`],
  brand_ownership: (r) => [`${r.brand_slug}>${r.company_slug}:${r.relation}@${r.valid_from ?? ''}`],
  company_ownership: (r) => [
    `${r.parent_company_slug}>${r.child_company_slug}:${r.relation}@${r.valid_from ?? ''}`,
  ],
  product: (r) => [`src:${r.source_key}:${r.external_id}`, r.gtin && `gtin:${r.gtin}`],
  product_identifier: (r) => [`${r.scheme}:${r.value}@${r.banner_slug ?? ''}`],
  store: (r) => [
    `slug:${r.slug}`,
    r.osm_type && r.osm_id != null && `osm:${r.osm_type}/${r.osm_id}`,
    r.banner_slug && r.external_store_id && `banner:${r.banner_slug}:${r.external_store_id}`,
  ],
  store_listing: (r) => [
    r.external_sku
      ? `sku:${r.banner_slug}:${r.external_sku}`
      : listingKey(r.banner_slug, r.listing_name, r.size_text),
  ],
  price_observation: (r) => [
    r.external_id
      ? `src:${r.source_key}:${r.external_id}`
      : [
          storeRefKey(r.store),
          r.product ? productRefKey(r.product) : '',
          r.listing ? listingRefKey(r.listing) : '',
          r.observed_on,
          r.price_kind,
        ].join('|'),
  ],
  reference_price: (r) => [`${r.vector_id}@${r.ref_month}`],
  document: (r) => [r.url_normalized],
};

/** The record's stable keys, the most readable first. */
export function recordKeys<K extends RecordKind>(kind: K, record: RecordOf<K>): string[] {
  return KEYS[kind](record).filter((k): k is string => typeof k === 'string' && k !== '');
}

const RAW_KEY_FIELDS = [
  'gtin',
  'slug',
  'external_id',
  'url_normalized',
  'vector_id',
  'value',
  'listing_name',
];

/** A best-effort key for a record that failed the schema, so the failure row can still be traced. */
export function rawRecordKey(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  for (const field of RAW_KEY_FIELDS) {
    const v = obj[field];
    if ((typeof v === 'string' && v !== '') || typeof v === 'number')
      return String(v).slice(0, 200);
  }
  return null;
}
