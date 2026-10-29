// Stores and store listings (DATA_MODEL §3.4). Stores key on OSM, then banner + store id, then
// slug. Listings key on the banner SKU, else the banner + listing_key. An import never sets a
// listing's product: when the source names one, it becomes a pending match candidate for P4.
import type { StoreListingRecord, TablesInsert } from '@sarvis/core';

import { listingKeyOf, roundTo } from '../change.ts';
import type { ServiceClient } from '../client.ts';
import { type KeyedSpec, emptyWriteResult, upsertKeyed } from '../keyed.ts';
import { type AnyRow, fail, from, selectIn } from '../query.ts';
import { findListingsByName } from '../refs.ts';
import {
  type DomainWriter,
  keyOf,
  loadSources,
  provOf,
  resolverFor,
  unknownRef,
} from './common.ts';

type StorePayload = TablesInsert<'stores'>;

const STORE_COLUMNS =
  'id, banner_id, slug, name, address, city, province, postal_code, lat, lon, osm_type, osm_id, ' +
  'external_store_id, status, source_id, source_url, method';

export const storeSpec: KeyedSpec<StorePayload> = {
  table: 'stores',
  columns: STORE_COLUMNS,
  async load(db, payloads) {
    return [
      ...(await selectIn(
        db,
        'stores',
        STORE_COLUMNS,
        'osm_id',
        payloads.map((p) => p.osm_id),
      )),
      ...(await selectIn(
        db,
        'stores',
        STORE_COLUMNS,
        'external_store_id',
        payloads.map((p) => p.external_store_id),
      )),
      ...(await selectIn(
        db,
        'stores',
        STORE_COLUMNS,
        'slug',
        payloads.map((p) => p.slug),
      )),
    ];
  },
  keys: (r) => [
    r.osm_type && r.osm_id != null ? `osm:${r.osm_type as string}/${r.osm_id as number}` : null,
    r.banner_id && r.external_store_id
      ? `banner:${r.banner_id as string}:${r.external_store_id as string}`
      : null,
    `slug:${r.slug as string}`,
  ],
  label: (p) => p.slug,
  keep: ['slug'],
  frozen: (stored) => stored.status === 'rejected',
};

export function storeWriter(db: ServiceClient): DomainWriter<'store'> {
  return {
    async upsert(records, ctx) {
      const refs = resolverFor(db, ctx);
      await loadSources(refs, records);
      await refs.loadSlugs(
        'banners',
        records.map((r) => r.banner_slug),
      );
      const result = emptyWriteResult();
      const payloads = records.flatMap((r): StorePayload[] => {
        const prov = provOf(r, refs, ctx);
        const bannerId = r.banner_slug ? refs.slug('banners', r.banner_slug) : null;
        if (!prov || bannerId === undefined) {
          const what = !prov ? `source ${r.source_key}` : `banner ${r.banner_slug}`;
          result.rejected.push(unknownRef(keyOf('store', r), what));
          return [];
        }
        const { source_key: _s, banner_slug: _b, lat, lon, ...fields } = r;
        return [
          { ...fields, banner_id: bannerId, lat: roundTo(lat, 6), lon: roundTo(lon, 6), ...prov },
        ];
      });
      const out = await upsertKeyed(db, storeSpec, payloads);
      return { ...out.result, rejected: [...result.rejected, ...out.result.rejected] };
    },
  };
}

type ListingPayload = TablesInsert<'store_listings'>;

const LISTING_COLUMNS =
  'id, banner_id, external_sku, listing_name, size_text, listing_key, product_id, match_candidate_id, ' +
  'first_seen_at, last_seen_at, is_active, source_id, source_url, method';

/** match_candidates.match_method_version for links the source itself states. */
export const SOURCE_REF_MATCH_VERSION = 'source-ref@1';

export const listingSpec: KeyedSpec<ListingPayload> = {
  table: 'store_listings',
  columns: LISTING_COLUMNS,
  async load(db, payloads) {
    const skus = payloads.filter((p) => p.external_sku);
    const names = payloads.filter((p) => !p.external_sku);
    return [
      ...(await selectIn(
        db,
        'store_listings',
        LISTING_COLUMNS,
        'external_sku',
        skus.map((p) => p.external_sku),
      )),
      ...(await findListingsByName(db, LISTING_COLUMNS, names)),
    ];
  },
  keys: (r) => {
    const banner = r.banner_id as string;
    if (r.external_sku) return [`sku:${banner}:${r.external_sku as string}`];
    const name = r.listing_name as string;
    const size = (r.size_text as string | null | undefined) ?? null;
    // A stored row carries the SQL listing_key; a payload gets the TS twin.
    const key = typeof r.listing_key === 'string' ? r.listing_key : listingKeyOf(name, size);
    return [`name:${banner}:${key}`, `raw:${banner}:${name}|${size ?? ''}`];
  },
  label: (p) => (p.external_sku ? `sku:${p.external_sku}` : `name:${p.listing_name}`),
  keep: ['banner_id', 'external_sku', 'first_seen_at'],
  touch: ['last_seen_at'],
};

export function storeListingWriter(db: ServiceClient): DomainWriter<'store_listing'> {
  return {
    async upsert(records, ctx) {
      const refs = resolverFor(db, ctx);
      await loadSources(refs, records);
      await refs.loadSlugs(
        'banners',
        records.map((r) => r.banner_slug),
      );
      await refs.loadProducts(records.map((r) => r.product));
      const result = emptyWriteResult();
      const recordOf = new Map<ListingPayload, StoreListingRecord>();
      const payloads = records.flatMap((r): ListingPayload[] => {
        const prov = provOf(r, refs, ctx);
        const bannerId = refs.slug('banners', r.banner_slug);
        if (!prov || !bannerId) {
          const what = !prov ? `source ${r.source_key}` : `banner ${r.banner_slug}`;
          result.rejected.push(unknownRef(keyOf('store_listing', r), what));
          return [];
        }
        const payload: ListingPayload = {
          banner_id: bannerId,
          external_sku: r.external_sku ?? null,
          listing_name: r.listing_name,
          size_text: r.size_text ?? null,
          first_seen_at: r.first_seen_at,
          last_seen_at: r.last_seen_at,
          is_active: r.is_active,
          ...prov,
        };
        recordOf.set(payload, r);
        return [payload];
      });
      const out = await upsertKeyed(db, listingSpec, payloads);

      // The source named the product: propose the link, once, for the matcher or an admin.
      const proposals = out.rows.flatMap(({ payload, id, stored }) => {
        const record = recordOf.get(payload);
        const productId = refs.product(record?.product);
        if (!record?.product || !productId) return [];
        if (stored && (stored.product_id || stored.match_candidate_id)) return [];
        return [
          {
            listingId: id as string,
            row: {
              kind: 'listing_product',
              subject_type: 'store_listings',
              subject_id: id as string,
              candidate_type: 'products',
              candidate_id: productId,
              score: 1,
              match_method: 'gtin' in record.product ? 'gtin_exact' : 'rule:source-ref',
              match_method_version: SOURCE_REF_MATCH_VERSION,
              reason: 'The source lists this product for the listing.',
              run_id: ctx.runId,
            } satisfies TablesInsert<'match_candidates'>,
          },
        ];
      });
      await proposeMatches(db, proposals);
      return { ...out.result, rejected: [...result.rejected, ...out.result.rejected] };
    },
  };
}

async function proposeMatches(
  db: ServiceClient,
  proposals: { listingId: string; row: TablesInsert<'match_candidates'> }[],
): Promise<void> {
  if (proposals.length === 0) return;
  const { data, error } = await from(db, 'match_candidates')
    .upsert(
      proposals.map((p) => p.row),
      { onConflict: 'kind,subject_id,candidate_id,match_method_version', ignoreDuplicates: true },
    )
    .select('id, subject_id');
  if (error) fail('Writing match candidates', error);
  for (const c of (data ?? []) as AnyRow[]) {
    const { error: e } = await from(db, 'store_listings')
      .update({ match_candidate_id: c.id })
      .eq('id', c.subject_id)
      .is('match_candidate_id', null);
    if (e) fail('Linking a match candidate', e);
  }
}
