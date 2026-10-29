// Natural keys → row ids. Records link to other rows by slug, GTIN or source id (core records/
// common.ts); writers resolve them here in bulk, one chunked read per kind, cached for the batch.
import type { ListingRef, ProductRef, StoreRef } from '@sarvis/core';

import { listingKeyOf } from './change.ts';
import type { ServiceClient } from './client.ts';
import { type AnyRow, type LooseQuery, type TableName, selectIn } from './query.ts';

export const productRefKey = (r: ProductRef): string =>
  'gtin' in r ? `gtin:${r.gtin}` : `src:${r.source_key}:${r.external_id}`;

export const storeRefKey = (r: StoreRef): string =>
  'osm_type' in r
    ? `osm:${r.osm_type}/${r.osm_id}`
    : 'external_store_id' in r
      ? `banner:${r.banner_slug}:${r.external_store_id}`
      : `slug:${r.slug}`;

export const listingRefKey = (r: ListingRef): string =>
  'external_sku' in r
    ? `sku:${r.banner_slug}:${r.external_sku}`
    : `name:${r.banner_slug}:${listingKeyOf(r.listing_name, r.size_text)}`;

type SlugTable = Extract<TableName, 'sources' | 'companies' | 'brands' | 'banners' | 'categories'>;

/** Resolves keys to ids for one batch. Unknown keys resolve to undefined. */
export class RefResolver {
  private readonly slugs = new Map<SlugTable, Map<string, string>>();
  private readonly labels = new Map<string, number>();
  private readonly products = new Map<string, string>();
  private readonly stores = new Map<string, string>();
  private readonly listings = new Map<string, string>();

  private readonly db: ServiceClient;

  constructor(db: ServiceClient) {
    this.db = db;
  }

  /** Loads ids by `slug` (or `key`, for sources). */
  async loadSlugs(table: SlugTable, slugs: Iterable<string | null | undefined>): Promise<void> {
    const cache = this.slugs.get(table) ?? new Map<string, string>();
    this.slugs.set(table, cache);
    const column = table === 'sources' ? 'key' : 'slug';
    const missing = [...new Set(slugs)].filter((s): s is string => !!s && !cache.has(s));
    if (missing.length === 0) return;
    for (const row of await selectIn(this.db, table, `id, ${column}`, column, missing))
      cache.set(row[column] as string, row.id as string);
  }

  slug(table: SlugTable, slug: string | null | undefined): string | undefined {
    return slug ? this.slugs.get(table)?.get(slug) : undefined;
  }

  /** Seeds a known source id (the run's own source) so no read is needed. */
  knowSource(key: string, id: string): void {
    const cache = this.slugs.get('sources') ?? new Map<string, string>();
    cache.set(key, id);
    this.slugs.set('sources', cache);
  }

  async loadLabels(codes: Iterable<string>): Promise<void> {
    const missing = [...new Set(codes)].filter((c) => !this.labels.has(c));
    if (missing.length === 0) return;
    for (const row of await selectIn(this.db, 'labels', 'id, code', 'code', missing))
      this.labels.set(row.code as string, row.id as number);
  }

  /** Label ids for these codes, sorted; unknown codes are dropped. */
  labelIds(codes: readonly string[]): number[] {
    return codes
      .map((c) => this.labels.get(c))
      .filter((id): id is number => id !== undefined)
      .sort((a, b) => a - b);
  }

  /** Products by GTIN, by (source, external_id), or through a secondary product_sources record. */
  async loadProducts(refs: Iterable<ProductRef | null | undefined>): Promise<void> {
    const todo = [...refs].filter(
      (r): r is ProductRef => !!r && !this.products.has(productRefKey(r)),
    );
    const gtins = todo.flatMap((r) => ('gtin' in r ? [r.gtin] : []));
    for (const row of await selectIn(this.db, 'products', 'id, gtin', 'gtin', gtins))
      this.products.set(`gtin:${row.gtin as string}`, row.id as string);

    const bySource = todo.flatMap((r) => ('source_key' in r ? [r] : []));
    await this.loadSlugs(
      'sources',
      bySource.map((r) => r.source_key),
    );
    const keyOf = new Map<string, string>(); // `${source_id}:${external_id}` → ref key
    for (const r of bySource) {
      const sourceId = this.slug('sources', r.source_key);
      if (sourceId) keyOf.set(`${sourceId}:${r.external_id}`, productRefKey(r));
    }
    const ids = bySource.map((r) => r.external_id);
    for (const table of ['product_sources', 'products'] as const) {
      const column = table === 'products' ? 'id' : 'product_id';
      for (const row of await selectIn(
        this.db,
        table,
        `${column}, source_id, external_id`,
        'external_id',
        ids,
      )) {
        const ref = keyOf.get(`${row.source_id as string}:${row.external_id as string}`);
        if (ref) this.products.set(ref, row[column] as string);
      }
    }
  }

  product(ref: ProductRef | null | undefined): string | undefined {
    return ref ? this.products.get(productRefKey(ref)) : undefined;
  }

  async loadStores(refs: Iterable<StoreRef>): Promise<void> {
    const todo = [...refs].filter((r) => !this.stores.has(storeRefKey(r)));
    const osm = todo.flatMap((r) => ('osm_type' in r ? [r.osm_id] : []));
    for (const row of await selectIn(this.db, 'stores', 'id, osm_type, osm_id', 'osm_id', osm))
      this.stores.set(`osm:${row.osm_type as string}/${row.osm_id as number}`, row.id as string);

    const banner = todo.flatMap((r) => ('external_store_id' in r ? [r] : []));
    await this.loadSlugs(
      'banners',
      banner.map((r) => r.banner_slug),
    );
    const rows = await selectIn(
      this.db,
      'stores',
      'id, banner_id, external_store_id',
      'external_store_id',
      banner.map((r) => r.external_store_id),
    );
    for (const r of banner) {
      const bannerId = this.slug('banners', r.banner_slug);
      const hit = rows.find(
        (s) => s.banner_id === bannerId && s.external_store_id === r.external_store_id,
      );
      if (hit) this.stores.set(storeRefKey(r), hit.id as string);
    }

    const slugs = todo.flatMap((r) => ('slug' in r ? [r.slug] : []));
    for (const row of await selectIn(this.db, 'stores', 'id, slug', 'slug', slugs))
      this.stores.set(`slug:${row.slug as string}`, row.id as string);
  }

  store(ref: StoreRef): string | undefined {
    return this.stores.get(storeRefKey(ref));
  }

  async loadListings(refs: Iterable<ListingRef | null | undefined>): Promise<void> {
    const todo = [...refs].filter(
      (r): r is ListingRef => !!r && !this.listings.has(listingRefKey(r)),
    );
    await this.loadSlugs(
      'banners',
      todo.map((r) => r.banner_slug),
    );
    const columns = 'id, banner_id, external_sku, listing_key, listing_name, size_text';
    const bySku = todo.flatMap((r) => ('external_sku' in r ? [r] : []));
    const byName = todo.flatMap((r) => ('listing_name' in r ? [r] : []));
    const rows = [
      ...(await selectIn(
        this.db,
        'store_listings',
        columns,
        'external_sku',
        bySku.map((r) => r.external_sku),
      )),
      ...(await findListingsByName(this.db, columns, byName)),
    ];
    for (const r of todo) {
      const bannerId = this.slug('banners', r.banner_slug);
      const hit = rows.find(
        (l) =>
          l.banner_id === bannerId &&
          ('external_sku' in r
            ? l.external_sku === r.external_sku
            : listingMatchesName(l, r.listing_name, r.size_text)),
      );
      if (hit) this.listings.set(listingRefKey(r), hit.id as string);
    }
  }

  listing(ref: ListingRef | null | undefined): string | undefined {
    return ref ? this.listings.get(listingRefKey(ref)) : undefined;
  }
}

/**
 * Name-keyed (SKU-less) listings: by the generated listing_key, and by the raw name in case the
 * SQL and TS normalizers disagree on a rare letter.
 */
export async function findListingsByName(
  db: ServiceClient,
  columns: string,
  refs: readonly { listing_name: string; size_text?: string | null }[],
): Promise<AnyRow[]> {
  const nameOnly = (q: LooseQuery) => q.is('external_sku', null);
  const keys = refs.map((r) => listingKeyOf(r.listing_name, r.size_text));
  const names = refs.map((r) => r.listing_name);
  const byKey = await selectIn(db, 'store_listings', columns, 'listing_key', keys, nameOnly);
  const byRaw = await selectIn(db, 'store_listings', columns, 'listing_name', names, nameOnly);
  const seen = new Set(byKey.map((r) => r.id));
  return [...byKey, ...byRaw.filter((r) => !seen.has(r.id))];
}

/** Whether a stored SKU-less listing is the one with this name and size. */
export function listingMatchesName(
  stored: AnyRow,
  listingName: string,
  sizeText: string | null | undefined,
): boolean {
  return (
    stored.external_sku === null &&
    (stored.listing_key === listingKeyOf(listingName, sizeText) ||
      (stored.listing_name === listingName && (stored.size_text ?? null) === (sizeText ?? null)))
  );
}
