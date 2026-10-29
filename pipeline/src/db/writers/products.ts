// Products and product identifiers (DATA_MODEL §3.3). A product keys on its GTIN, then on
// (source_id, external_id). When the GTIN already belongs to another source's product, that
// product is left as it is and this source's record goes to product_sources instead.
import type { ProductRecord, TablesInsert } from '@sarvis/core';

import { byteaHash, roundTo } from '../change.ts';
import type { ServiceClient } from '../client.ts';
import {
  type KeyedSpec,
  type WriteResult,
  emptyWriteResult,
  mergeWriteResults,
  upsertKeyed,
} from '../keyed.ts';
import { type AnyRow, selectIn } from '../query.ts';
import {
  type DomainWriter,
  keyOf,
  loadSources,
  provOf,
  resolverFor,
  unknownRef,
} from './common.ts';

type ProductPayload = TablesInsert<'products'>;

const PRODUCT_COLUMNS =
  'id, gtin, external_id, name, brand_id, brand_text, category_id, quantity_text, net_quantity, ' +
  'net_unit, pack_count, unit_parse_status, label_codes, image_key, description, source_modified_at, ' +
  'content_hash, status, locked_fields, source_id, source_url, method';

export const productSpec: KeyedSpec<ProductPayload> = {
  table: 'products',
  columns: PRODUCT_COLUMNS,
  async load(db, payloads) {
    const byGtin = await selectIn(
      db,
      'products',
      PRODUCT_COLUMNS,
      'gtin',
      payloads.map((p) => p.gtin),
    );
    const bySource = await selectIn(
      db,
      'products',
      PRODUCT_COLUMNS,
      'external_id',
      payloads.map((p) => p.external_id),
    );
    return [...byGtin, ...bySource];
  },
  keys: (r) => [
    r.gtin ? `gtin:${r.gtin as string}` : null,
    `src:${r.source_id as string}:${r.external_id as string}`,
  ],
  label: (p) => (p.gtin ? `gtin:${p.gtin}` : `src:${p.external_id}`),
  hashed: true,
  // The source record id never moves; a product found by GTIN keeps the id it was created with.
  keep: ['source_id', 'external_id'],
  frozen: (stored) => stored.status === 'merged' || stored.status === 'rejected',
};

type SecondaryPayload = TablesInsert<'product_sources'>;

const SECONDARY_COLUMNS =
  'id, product_id, source_id, external_id, source_url, last_seen_at, content_hash, method';

export const productSourceSpec: KeyedSpec<SecondaryPayload> = {
  table: 'product_sources',
  columns: SECONDARY_COLUMNS,
  load: (db, payloads) =>
    selectIn(
      db,
      'product_sources',
      SECONDARY_COLUMNS,
      'external_id',
      payloads.map((p) => p.external_id),
    ),
  keys: (r) => [`src:${r.source_id as string}:${r.external_id as string}`],
  label: (p) => `src:${p.external_id}`,
  keep: ['source_id', 'external_id'],
  touch: ['last_seen_at'],
};

export async function productPayloads(
  db: ServiceClient,
  records: ProductRecord[],
  ctx: Parameters<DomainWriter<'product'>['upsert']>[1],
): Promise<{ payloads: ProductPayload[]; rejected: WriteResult['rejected'] }> {
  const refs = resolverFor(db, ctx);
  await loadSources(refs, records);
  await refs.loadSlugs(
    'brands',
    records.map((r) => r.brand_slug),
  );
  await refs.loadSlugs(
    'categories',
    records.map((r) => r.category_slug),
  );
  await refs.loadLabels(records.flatMap((r) => r.label_codes));
  const rejected: WriteResult['rejected'] = [];
  const payloads = records.flatMap((r): ProductPayload[] => {
    const prov = provOf(r, refs, ctx);
    if (!prov) {
      rejected.push(unknownRef(keyOf('product', r), `source ${r.source_key}`));
      return [];
    }
    const { source_key: _s, brand_slug, category_slug, label_codes, net_quantity, ...fields } = r;
    // An unknown brand or category isn't fatal: brand_text stays for the P4 resolver.
    return [
      {
        ...fields,
        brand_id: refs.slug('brands', brand_slug) ?? null,
        category_id: refs.slug('categories', category_slug) ?? null,
        label_codes: refs.labelIds(label_codes),
        net_quantity: roundTo(net_quantity, 3),
        ...prov,
      },
    ];
  });
  return { payloads, rejected };
}

export function productWriter(db: ServiceClient): DomainWriter<'product'> {
  return {
    async upsert(records, ctx) {
      const { payloads, rejected } = await productPayloads(db, records, ctx);

      // A GTIN already held by another source's product: record this source beside it.
      const byGtin = await selectIn(
        db,
        'products',
        'id, gtin, source_id',
        'gtin',
        payloads.map((p) => p.gtin),
      );
      const owner = new Map(byGtin.map((r) => [r.gtin as string, r]));
      const own: ProductPayload[] = [];
      const secondary: SecondaryPayload[] = [];
      for (const p of payloads) {
        const held: AnyRow | undefined = p.gtin ? owner.get(p.gtin) : undefined;
        if (!held || held.source_id === p.source_id) {
          own.push(p);
          continue;
        }
        secondary.push({
          product_id: held.id as string,
          source_id: p.source_id,
          external_id: p.external_id,
          source_url: p.source_url ?? null,
          fetched_at: p.fetched_at,
          last_seen_at: p.fetched_at,
          content_hash: byteaHash(p),
          method: p.method,
          method_version: p.method_version,
        });
      }

      const main = await upsertKeyed(db, productSpec, own);
      const extra = await upsertKeyed(db, productSourceSpec, secondary);
      const result = mergeWriteResults(main.result, extra.result);
      return { ...result, rejected: [...rejected, ...result.rejected] };
    },
  };
}

type IdentifierPayload = TablesInsert<'product_identifiers'>;

const IDENTIFIER_COLUMNS =
  'id, product_id, scheme, value, banner_id, source_id, source_url, method';

export const identifierSpec: KeyedSpec<IdentifierPayload> = {
  table: 'product_identifiers',
  columns: IDENTIFIER_COLUMNS,
  load: (db, payloads) =>
    selectIn(
      db,
      'product_identifiers',
      IDENTIFIER_COLUMNS,
      'value',
      payloads.map((p) => p.value),
    ),
  keys: (r) => [
    `${r.scheme as string}:${r.value as string}@${(r.banner_id as string | null) ?? ''}`,
  ],
  label: (p) => `${p.scheme}:${p.value}`,
  keep: ['scheme', 'value', 'banner_id'],
};

export function productIdentifierWriter(db: ServiceClient): DomainWriter<'product_identifier'> {
  return {
    async upsert(records, ctx) {
      const refs = resolverFor(db, ctx);
      await loadSources(refs, records);
      await refs.loadProducts(records.map((r) => r.product));
      await refs.loadSlugs(
        'banners',
        records.map((r) => r.banner_slug),
      );
      const result = emptyWriteResult();
      const payloads = records.flatMap((r): IdentifierPayload[] => {
        const key = keyOf('product_identifier', r);
        const prov = provOf(r, refs, ctx);
        const productId = refs.product(r.product);
        const bannerId = r.banner_slug ? refs.slug('banners', r.banner_slug) : null;
        const missing = !prov
          ? `source ${r.source_key}`
          : !productId
            ? 'product'
            : bannerId === undefined
              ? `banner ${r.banner_slug}`
              : null;
        if (missing || !prov || !productId || bannerId === undefined) {
          result.rejected.push(unknownRef(key, missing ?? 'reference'));
          return [];
        }
        return [
          { product_id: productId, scheme: r.scheme, value: r.value, banner_id: bannerId, ...prov },
        ];
      });
      const out = await upsertKeyed(db, identifierSpec, payloads);
      return { ...out.result, rejected: [...result.rejected, ...out.result.rejected] };
    },
  };
}
