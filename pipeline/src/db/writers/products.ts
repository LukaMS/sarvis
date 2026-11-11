// Products and product identifiers (DATA_MODEL §3.3). A product keys on its GTIN, then on
// (source_id, external_id). When the GTIN already belongs to another record's product, from
// another source or from another external_id of this one, that product is left as it is and the
// record goes to product_sources instead.
import { type ProductRecord, type TablesInsert, gtinIsRestricted } from '@sarvis/core';

import { CatalogError } from '../../errors.ts';
import { byteaHash, roundTo } from '../change.ts';
import type { ServiceClient } from '../client.ts';
import {
  type KeyedSpec,
  type WriteResult,
  emptyWriteResult,
  mergeWriteResults,
  upsertKeyed,
} from '../keyed.ts';
import { logger } from '../../log.ts';
import {
  type AnyRow,
  READ_CHUNK,
  chunked,
  fail,
  from,
  selectIn,
  updateById,
  updateMany,
} from '../query.ts';
import type { RefResolver } from '../refs.ts';
import {
  type DomainWriter,
  keyOf,
  loadSources,
  provOf,
  resolverFor,
  unknownRef,
} from './common.ts';
import { ReviewNotes, approveAuto, autoApproveIds, autoSourceIds, queueNotes } from './review.ts';

type ProductPayload = TablesInsert<'products'>;

const PRODUCT_COLUMNS =
  'id, gtin, external_id, name, brand_id, brand_text, category_id, quantity_text, net_quantity, ' +
  'net_unit, pack_count, unit_parse_status, label_codes, image_key, description, source_modified_at, ' +
  'content_hash, status, locked_fields, review_status, source_id, source_url, method';

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
  stale: (stored, payload) => isOlder(payload.source_modified_at, stored.source_modified_at),
};

/**
 * Whether a source's reading is strictly older than the stored one, by the source's own
 * modification time. Either side unknown is never older. OFF deltas overlap the full export, and
 * the export can lag the newest delta, so either may arrive after the other (D-059).
 */
export function isOlder(next: unknown, stored: unknown): boolean {
  if (typeof next !== 'string' || typeof stored !== 'string') return false;
  const a = Date.parse(next);
  const b = Date.parse(stored);
  return Number.isFinite(a) && Number.isFinite(b) && a < b;
}

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

/**
 * The brand and category a record names. No slug, or one we don't know, leaves the column out of
 * the payload: that's no opinion, so it can't erase what a Phase 4 job resolved (D-079), and the
 * content hash reads the same as it did with an explicit null. brand_text stays for the resolver.
 */
export function resolvedRefs(
  refs: Pick<RefResolver, 'slug'>,
  brandSlug: string | null | undefined,
  categorySlug: string | null | undefined,
): Pick<ProductPayload, 'brand_id' | 'category_id'> {
  const brandId = refs.slug('brands', brandSlug);
  const categoryId = refs.slug('categories', categorySlug);
  return {
    ...(brandId ? { brand_id: brandId } : {}),
    ...(categoryId ? { category_id: categoryId } : {}),
  };
}

export async function productPayloads(
  db: ServiceClient,
  records: ProductRecord[],
  ctx: Parameters<DomainWriter<'product'>['upsert']>[1],
): Promise<{
  payloads: ProductPayload[];
  rejected: WriteResult['rejected'];
  notes: ReviewNotes;
  refs: RefResolver;
}> {
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
  const notes = new ReviewNotes();
  const payloads = records.flatMap((r): ProductPayload[] => {
    const prov = provOf(r, refs, ctx);
    if (!prov) {
      rejected.push(unknownRef(keyOf('product', r), `source ${r.source_key}`));
      return [];
    }
    const {
      source_key: _s,
      review_reason: _r,
      brand_slug,
      category_slug,
      label_codes,
      net_quantity,
      ...fields
    } = r;
    const payload = {
      ...fields,
      ...resolvedRefs(refs, brand_slug, category_slug),
      label_codes: refs.labelIds(label_codes),
      net_quantity: roundTo(net_quantity, 3),
      ...prov,
    };
    notes.add(productSpec.label(payload), r);
    return [payload];
  });
  return { payloads, rejected, notes, refs };
}

/**
 * A clean full run that would discontinue more than this share of its source's active products is
 * refused instead: a truncated dump or a broken filter looks like that, a month of churn doesn't.
 */
export const MAX_DEACTIVATION_SHARE = 0.1;

/**
 * Discontinues the source's active products whose external_id the run didn't see. Products are
 * never deleted, rows with `status` locked are left alone, and the cleared content_hash makes the
 * next sighting rewrite the row, which brings it back to `active`. Products this source only
 * contributes to (product_sources) belong to another source and aren't touched. A GTIN that a
 * later rule restricts (an EAN-8 with prefix 0 or 2, D-078) would fail the `products` check, so
 * it's cleared with the status.
 */
export async function deactivateUnseenProducts(
  db: ServiceClient,
  sourceId: string,
  seen: ReadonlySet<string>,
  maxShare = MAX_DEACTIVATION_SHARE,
): Promise<number> {
  const active = await selectIn(
    db,
    'products',
    'id, gtin, external_id, locked_fields',
    'source_id',
    [sourceId],
    (q) => q.eq('status', 'active'),
  );
  const gone = active.filter(
    (r) =>
      !seen.has(r.external_id as string) &&
      !((r.locked_fields as string[] | null) ?? []).includes('status'),
  );
  if (gone.length === 0) return 0;
  if (gone.length > maxShare * active.length) {
    throw new CatalogError(
      'unknown',
      `Refused to discontinue ${gone.length} of ${active.length} active products ` +
        `(over ${maxShare * 100}%).`,
      { alert: true },
    );
  }
  const restricted = (r: AnyRow) => typeof r.gtin === 'string' && gtinIsRestricted(r.gtin);
  const patch = { status: 'discontinued', content_hash: null };
  await updateMany(
    db,
    'products',
    gone.filter((r) => !restricted(r)).map((r) => r.id as string),
    patch,
  );
  await updateMany(
    db,
    'products',
    gone.filter(restricted).map((r) => r.id as string),
    { ...patch, gtin: null },
  );
  return gone.length;
}

function secondaryOf(p: ProductPayload, productId: string): SecondaryPayload {
  return {
    product_id: productId,
    source_id: p.source_id,
    external_id: p.external_id,
    source_url: p.source_url ?? null,
    fetched_at: p.fetched_at,
    last_seen_at: p.fetched_at,
    content_hash: byteaHash(p),
    method: p.method,
    method_version: p.method_version,
  };
}

/**
 * A record that now goes to product_sources may still have its own product row from before its
 * code normalized to the holder's GTIN (a UPC-E stored as EAN-8). That row is merged into the
 * holder and loses its GTIN, so one item has one product (D-081). A merged or rejected row is
 * left alone, and one whose `status` or `gtin` is locked is reported instead.
 */
export async function mergeSuperseded(
  db: ServiceClient,
  secondary: readonly SecondaryPayload[],
): Promise<WriteResult> {
  const result = emptyWriteResult();
  const target = new Map(secondary.map((s) => [`${s.source_id}:${s.external_id}`, s.product_id]));
  const stored = await selectIn(
    db,
    'products',
    'id, source_id, external_id, status, locked_fields',
    'external_id',
    secondary.map((s) => s.external_id),
  );
  const updates: { id: string; patch: AnyRow; label: string }[] = [];
  for (const row of stored) {
    const into = target.get(`${row.source_id as string}:${row.external_id as string}`);
    if (!into || into === row.id || productSpec.frozen?.(row)) continue;
    const label = `src:${row.external_id as string}`;
    const locked = (row.locked_fields as string[] | null) ?? [];
    if (locked.includes('status') || locked.includes('gtin')) {
      result.rejected.push({ key: label, message: `Superseded by product ${into}, but locked.` });
      continue;
    }
    updates.push({
      id: row.id as string,
      patch: { status: 'merged', merged_into_id: into, gtin: null, content_hash: null },
      label,
    });
  }
  const failed = await updateById(db, 'products', updates);
  result.updated += updates.length - failed.length;
  for (const e of failed) result.rejected.push({ key: e.row.label, message: e.message });
  return result;
}

/**
 * Whether an auto-approved source's record takes over the legacy product that holds its GTIN
 * (D-077, D-085): the row becomes the source's own, and the legacy record moves to
 * product_sources. Only a legacy row nobody has decided on: still `pending` with no reviewer,
 * not merged or rejected, and no locked field.
 */
export function takesOver(
  held: AnyRow,
  payload: Pick<ProductPayload, 'source_id'>,
  autoSources: ReadonlySet<string>,
): boolean {
  return (
    autoSources.has(payload.source_id) &&
    held.method === 'legacy-import' &&
    held.review_status === 'pending' &&
    (held.reviewed_by ?? null) === null &&
    !productSpec.frozen?.(held) &&
    ((held.locked_fields as string[] | null) ?? []).length === 0
  );
}

/**
 * The patch that hands a legacy row to the record's source. Every content column is cleared, so
 * nothing legacy is left where the record has no opinion (a description, a brand link), and the
 * cleared hash makes the normal write that follows store the record's own values.
 */
export function takeoverPatch(payload: ProductPayload): AnyRow {
  return {
    source_id: payload.source_id,
    external_id: payload.external_id,
    source_url: payload.source_url ?? null,
    fetched_at: payload.fetched_at,
    method: payload.method,
    method_version: payload.method_version,
    ingestion_run_id: payload.ingestion_run_id ?? null,
    raw_object_id: payload.raw_object_id ?? null,
    brand_id: null,
    brand_text: null,
    category_id: null,
    // Cleared with the category it explains (a rule needs a category, P4.8).
    category_rule: null,
    quantity_text: null,
    net_quantity: null,
    net_unit: null,
    pack_count: null,
    unit_parse_status: 'unparsed',
    label_codes: [],
    image_key: null,
    description: null,
    source_modified_at: null,
    content_hash: null,
  };
}

/** The legacy record of a row being taken over, as the product_sources row that keeps it. */
function legacySecondaryOf(held: AnyRow): SecondaryPayload {
  return {
    product_id: held.id as string,
    source_id: held.source_id as string,
    external_id: held.external_id as string,
    source_url: (held.source_url as string | null) ?? null,
    fetched_at: held.fetched_at as string,
    last_seen_at: held.fetched_at as string,
    content_hash: (held.content_hash as string | null) ?? null,
    method: held.method as string,
    method_version: held.method_version as string,
  };
}

/**
 * Hands legacy rows to the records that take them over. In order: the legacy record goes to
 * product_sources, the row takes the record's identity with its content cleared, the record's own
 * product_sources row (written while legacy held the GTIN) is removed, and the row's open legacy
 * queue item is dismissed. A step that fails leaves the row legacy, and the next run tries again.
 * Returns the takeovers that went through and those that didn't.
 */
export async function takeOverLegacy(
  db: ServiceClient,
  takeovers: readonly { held: AnyRow; payload: ProductPayload }[],
): Promise<{
  done: { held: AnyRow; payload: ProductPayload }[];
  failed: { held: AnyRow; payload: ProductPayload; message: string }[];
}> {
  if (takeovers.length === 0) return { done: [], failed: [] };
  const kept = await upsertKeyed(
    db,
    productSourceSpec,
    takeovers.map((t) => legacySecondaryOf(t.held)),
  );
  const notKept = new Set(kept.result.rejected.map((r) => r.key));
  const failed: { held: AnyRow; payload: ProductPayload; message: string }[] = [];
  const ready = takeovers.filter((t) => {
    const key = productSourceSpec.label(legacySecondaryOf(t.held));
    if (!notKept.has(key)) return true;
    failed.push({ ...t, message: 'Its legacy record could not be kept in product_sources.' });
    return false;
  });
  const errors = await updateById(
    db,
    'products',
    ready.map((t) => ({ id: t.held.id as string, patch: takeoverPatch(t.payload), t })),
  );
  const broken = new Set(errors.map((e) => e.row.id));
  for (const e of errors) failed.push({ ...e.row.t, message: e.message });
  const done = ready.filter((t) => !broken.has(t.held.id as string));
  for (const t of done) {
    const { error } = await db
      .from('product_sources')
      .delete()
      .eq('source_id', t.payload.source_id)
      .eq('external_id', t.payload.external_id);
    if (error) fail('Deleting from product_sources', error);
  }
  const ids = done.map((t) => t.held.id as string);
  for (const chunk of chunked(ids, READ_CHUNK)) {
    const { error } = await from(db, 'review_queue')
      .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
      .eq('item_table', 'products')
      .eq('status', 'open')
      .in('item_id', chunk);
    if (error) fail('Dismissing review_queue items', error);
  }
  if (done.length > 0) {
    logger.info('legacy products taken over', {
      count: done.length,
      examples: done.slice(0, 5).map((t) => t.payload.gtin),
    });
  }
  return { done, failed };
}

const HELD_COLUMNS =
  'id, gtin, source_id, external_id, source_url, fetched_at, content_hash, method, ' +
  'method_version, status, review_status, reviewed_by, locked_fields';

export function productWriter(db: ServiceClient): DomainWriter<'product'> {
  return {
    deactivateUnseen: ({ source, seen }) => deactivateUnseenProducts(db, source.id, seen),
    async upsert(records, ctx) {
      const { payloads, rejected, notes, refs } = await productPayloads(db, records, ctx);
      const autoSources = autoSourceIds(refs, 'products');

      // A GTIN already held by another record's product: record this one beside it. Within one
      // source that's two codes for one item, such as a UPC-E and its UPC-A (D-081). A legacy
      // row an auto-approved source brings the GTIN for is taken over instead (D-077, D-085).
      const byGtin = await selectIn(
        db,
        'products',
        HELD_COLUMNS,
        'gtin',
        payloads.map((p) => p.gtin),
      );
      const owner = new Map(byGtin.map((r) => [r.gtin as string, r]));
      const own: ProductPayload[] = [];
      const secondary: SecondaryPayload[] = [];
      const takeovers: { held: AnyRow; payload: ProductPayload }[] = [];
      // A GTIN that no row holds yet but two records of this batch name: the first one writes it.
      const claimed = new Map<string, ProductPayload>();
      const later: { payload: ProductPayload; first: ProductPayload }[] = [];
      for (const p of payloads) {
        const held: AnyRow | undefined = p.gtin ? owner.get(p.gtin) : undefined;
        const first = p.gtin && !held ? claimed.get(p.gtin) : undefined;
        if (first) {
          later.push({ payload: p, first });
          continue;
        }
        if (!held || (held.source_id === p.source_id && held.external_id === p.external_id)) {
          if (p.gtin && !held) claimed.set(p.gtin, p);
          own.push(p);
          continue;
        }
        if (takesOver(held, p, autoSources) && !takeovers.some((t) => t.held.id === held.id)) {
          takeovers.push({ held, payload: p });
          continue;
        }
        secondary.push(secondaryOf(p, held.id as string));
      }

      const taken = await takeOverLegacy(db, takeovers);
      own.push(...taken.done.map((t) => t.payload));
      for (const t of taken.failed) {
        rejected.push({ key: productSpec.label(t.payload), message: `Takeover: ${t.message}` });
      }

      const main = await upsertKeyed(db, productSpec, own);
      // Inserted rows come back as copies, so they're found by source record, not by object.
      const recordKey = (p: AnyRow) => `${p.source_id as string}:${p.external_id as string}`;
      const written = new Map(main.rows.map((r) => [recordKey(r.payload), r.id as string]));
      for (const { payload, first } of later) {
        const id = written.get(recordKey(first));
        if (id) secondary.push(secondaryOf(payload, id));
        else
          rejected.push({ key: productSpec.label(payload), message: 'Its GTIN was not written.' });
      }
      // Validated OFF products are approved by rule, not reviewed (D-050, D-054).
      await approveAuto(db, 'products', autoApproveIds(main.rows, autoSources, productSpec.frozen));
      await queueNotes(db, productSpec, notes, main);
      const extra = await upsertKeyed(db, productSourceSpec, secondary);
      const merged = await mergeSuperseded(db, secondary);
      const result = mergeWriteResults(mergeWriteResults(main.result, extra.result), merged);
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
