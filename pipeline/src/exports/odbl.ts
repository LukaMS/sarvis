// The ODbL extract (PLAN P3.8, D-013 D1, D-062): the Open Food Facts-derived products and the Open
// Prices stores and prices, as CSV.gz plus a README, in the public `public-exports` bucket. Each
// export is one folder, `odbl/<export id>/`; only the latest KEEP_EXPORTS folders are kept.
//
// No user data: only rows whose source is `off` or `open-prices` are read, so receipt prices
// (Phase 8) can't leak in. Internal ids (uuids) aren't exported; rows join on GTIN and OSM keys.
import { gzipSync } from 'node:zlib';

import type { ServiceClient } from '../db/client.ts';
import { type AnyRow, PAGE_SIZE, fail, from } from '../db/query.ts';
import { DatabaseError } from '../errors.ts';
import type { Logger } from '../log.ts';

export const EXPORT_BUCKET = 'public-exports';
export const ODBL_PREFIX = 'odbl';
export const KEEP_EXPORTS = 2;
export const ODBL_VERSION = '1.0.0';

const OFF_KEY = 'off';
const OP_KEY = 'open-prices';

// ---- CSV -------------------------------------------------------------------------------------

type Cell = string | number | boolean | null | undefined;
export interface Column {
  header: string;
  value: (row: AnyRow) => Cell;
}

/** One RFC 4180 field: quoted when it holds a comma, quote, CR or LF. Null is empty. */
export function csvField(v: Cell): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A header line and one CRLF-terminated line per row. */
export function toCsv(rows: readonly AnyRow[], columns: readonly Column[]): string {
  const line = (cells: Cell[]) => cells.map(csvField).join(',') + '\r\n';
  return (
    line(columns.map((c) => c.header)) +
    rows.map((r) => line(columns.map((c) => c.value(r)))).join('')
  );
}

// ---- Tables ----------------------------------------------------------------------------------

export interface SourceInfo {
  id: string;
  url_template: string | null;
}

/** The stored source_url, else the source's url_template filled with external_id (D-032). */
export function resolvedUrl(row: AnyRow, source: SourceInfo | undefined): string | null {
  if (typeof row.source_url === 'string') return row.source_url;
  if (!source?.url_template || typeof row.external_id !== 'string') return null;
  return source.url_template.replace('{external_id}', row.external_id);
}

const col = (header: string, key = header): Column => ({ header, value: (r) => r[key] as Cell });
const nested = (header: string, rel: string, key: string): Column => ({
  header,
  value: (r) => ((r[rel] as AnyRow | null)?.[key] ?? null) as Cell,
});

export interface OdblContext {
  sources: { off: SourceInfo; openPrices: SourceInfo };
  /** labels.id → labels.code */
  labels: ReadonlyMap<number, string>;
}

export function productColumns(ctx: OdblContext): Column[] {
  return [
    col('code', 'external_id'),
    col('gtin'),
    col('name'),
    col('brands', 'brand_text'),
    col('quantity', 'quantity_text'),
    col('net_quantity'),
    col('net_unit'),
    col('pack_count'),
    {
      header: 'labels',
      value: (r) =>
        ((r.label_codes as number[] | null) ?? [])
          .map((id) => ctx.labels.get(id))
          .filter(Boolean)
          .join(';'),
    },
    col('status'),
    col('off_last_modified', 'source_modified_at'),
    col('fetched_at'),
    { header: 'source_url', value: (r) => resolvedUrl(r, ctx.sources.off) },
  ];
}

export function storeColumns(ctx: OdblContext): Column[] {
  return [
    col('osm_type'),
    col('osm_id'),
    col('name'),
    col('address'),
    col('city'),
    col('province'),
    col('postal_code'),
    col('lat'),
    col('lon'),
    col('status'),
    col('fetched_at'),
    { header: 'source_url', value: (r) => resolvedUrl(r, ctx.sources.openPrices) },
  ];
}

export function priceColumns(ctx: OdblContext): Column[] {
  return [
    col('price_id', 'external_id'),
    nested('store_osm_type', 'stores', 'osm_type'),
    nested('store_osm_id', 'stores', 'osm_id'),
    nested('product_gtin', 'products', 'gtin'),
    nested('product_code', 'products', 'external_id'),
    col('observed_on'),
    col('last_confirmed_on'),
    col('price'),
    col('currency'),
    col('price_kind'),
    col('is_discounted'),
    col('price_without_discount'),
    col('price_per'),
    col('fetched_at'),
    { header: 'source_url', value: (r) => resolvedUrl(r, ctx.sources.openPrices) },
  ];
}

const PRODUCT_SELECT =
  'id, external_id, gtin, name, brand_text, quantity_text, net_quantity, net_unit, pack_count, ' +
  'label_codes, status, source_modified_at, fetched_at, source_url';
const STORE_SELECT =
  'id, osm_type, osm_id, name, address, city, province, postal_code, lat, lon, status, fetched_at, ' +
  'source_url';
const PRICE_SELECT =
  'id, external_id, observed_on, last_confirmed_on, price, currency, price_kind, is_discounted, ' +
  'price_without_discount, price_per, fetched_at, source_url, stores(osm_type, osm_id), ' +
  'products(gtin, external_id)';

export interface OdblTables {
  products: AnyRow[];
  stores: AnyRow[];
  prices: AnyRow[];
}

/** Every row of one source in `table`, in id order, a page at a time (keyset on id). */
async function readAll(
  db: ServiceClient,
  table: 'products' | 'stores' | 'price_observations',
  columns: string,
  sourceId: string,
): Promise<AnyRow[]> {
  const out: AnyRow[] = [];
  let after: unknown = null;
  for (;;) {
    let q = from(db, table).select(columns).eq('source_id', sourceId);
    if (after !== null) q = q.gt('id', after);
    const { data, error } = await q.order('id').limit(PAGE_SIZE);
    if (error) fail(`Reading ${table}`, error);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
    after = rows.at(-1)?.id ?? null;
  }
}

export async function loadOdblContext(db: ServiceClient): Promise<OdblContext> {
  const { data: sources, error } = await db
    .from('sources')
    .select('id, key, url_template')
    .in('key', [OFF_KEY, OP_KEY]);
  if (error) fail('Reading sources', error);
  const off = sources?.find((s) => s.key === OFF_KEY);
  const openPrices = sources?.find((s) => s.key === OP_KEY);
  if (!off || !openPrices)
    throw new DatabaseError('The off and open-prices source rows are missing.');
  const { data: labels, error: labelError } = await db.from('labels').select('id, code');
  if (labelError) fail('Reading labels', labelError);
  return {
    sources: { off, openPrices },
    labels: new Map((labels ?? []).map((l) => [l.id, l.code])),
  };
}

export async function readOdblTables(db: ServiceClient, ctx: OdblContext): Promise<OdblTables> {
  return {
    products: await readAll(db, 'products', PRODUCT_SELECT, ctx.sources.off.id),
    stores: await readAll(db, 'stores', STORE_SELECT, ctx.sources.openPrices.id),
    prices: await readAll(db, 'price_observations', PRICE_SELECT, ctx.sources.openPrices.id),
  };
}

// ---- Files -----------------------------------------------------------------------------------

/** `20261103T153012Z`: sorts by time, and two exports a second apart don't collide. */
export function exportIdOf(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
}

export interface ExportFile {
  name: string;
  body: Uint8Array;
  contentType: string;
  rows?: number;
}

export function readmeOf(
  exportedAt: Date,
  counts: { products: number; stores: number; prices: number },
): string {
  const day = exportedAt.toISOString().slice(0, 10);
  return `# Sarvis ODbL extract (${day})

Exported ${exportedAt.toISOString()} by \`sarvis-odbl-export@${ODBL_VERSION}\`.

This extract is made available under the **Open Database License (ODbL) v1.0**:
https://opendatacommons.org/licenses/odbl/1-0/. Any rights in individual contents of the database
are licensed under the **Database Contents License (DbCL) v1.0**:
https://opendatacommons.org/licenses/dbcl/1-0/.

It is derived from:

- **Open Food Facts** (https://world.openfoodfacts.org/), © Open Food Facts contributors, ODbL.
  The Canadian products in the Open Food Facts export, as imported by Sarvis.
- **Open Prices** (https://prices.openfoodfacts.org/), © Open Food Facts contributors, ODbL.
  The CAD prices at Canadian OpenStreetMap stores, and those stores. Store locations come from
  OpenStreetMap (© OpenStreetMap contributors, ODbL).

It holds only data from those sources. It holds no Sarvis user data: prices from users' receipts
are not included.

## Files

| File | Rows | Key |
|---|---:|---|
| \`products.csv.gz\` | ${counts.products} | \`code\` (the Open Food Facts code); \`gtin\` is the code as GTIN-14 |
| \`stores.csv.gz\` | ${counts.stores} | \`(osm_type, osm_id)\` |
| \`price_observations.csv.gz\` | ${counts.prices} | \`price_id\` (the Open Prices price id); joins to stores on \`(store_osm_type, store_osm_id)\` and to products on \`product_code\` |

CSV: UTF-8, comma-separated, RFC 4180 quoting, CRLF line ends, one header line. Empty means null.
\`labels\` is a \`;\`-separated list of Sarvis label codes. \`source_url\` is the record's page at its
source.

Source code: https://github.com/LukaMS/sarvis
`;
}

/** Builds the extract's files from the tables (pure). */
export function buildOdblFiles(
  tables: OdblTables,
  ctx: OdblContext,
  exportedAt: Date,
): ExportFile[] {
  const gz = (text: string) => new Uint8Array(gzipSync(Buffer.from(text, 'utf8'), { level: 9 }));
  const csv = (name: string, rows: AnyRow[], columns: Column[]): ExportFile => ({
    name,
    body: gz(toCsv(rows, columns)),
    contentType: 'application/gzip',
    rows: rows.length,
  });
  const readme = readmeOf(exportedAt, {
    products: tables.products.length,
    stores: tables.stores.length,
    prices: tables.prices.length,
  });
  return [
    csv('products.csv.gz', tables.products, productColumns(ctx)),
    csv('stores.csv.gz', tables.stores, storeColumns(ctx)),
    csv('price_observations.csv.gz', tables.prices, priceColumns(ctx)),
    {
      name: 'README.md',
      body: new Uint8Array(Buffer.from(readme, 'utf8')),
      contentType: 'text/markdown',
    },
  ];
}

/** The export folders to delete so that only the newest `keep` remain. */
export function exportsToPrune(folders: readonly string[], keep = KEEP_EXPORTS): string[] {
  return [...folders].sort().reverse().slice(keep);
}

// ---- Storage ---------------------------------------------------------------------------------

export interface ExportStore {
  upload(path: string, file: ExportFile): Promise<void>;
  /** The names directly under `prefix` (folders and files). */
  list(prefix: string): Promise<string[]>;
  remove(paths: string[]): Promise<void>;
  publicUrl(path: string): string;
}

export function storageExportStore(db: ServiceClient, bucket = EXPORT_BUCKET): ExportStore {
  const b = () => db.storage.from(bucket);
  return {
    async upload(path, file) {
      const { error } = await b().upload(path, file.body, {
        contentType: file.contentType,
        upsert: true,
        cacheControl: '3600',
      });
      if (error)
        throw new DatabaseError(`Uploading ${bucket}/${path} failed: ${error.message}`, error);
    },
    async list(prefix) {
      const { data, error } = await b().list(prefix, { limit: 1000 });
      if (error)
        throw new DatabaseError(`Listing ${bucket}/${prefix} failed: ${error.message}`, error);
      return (data ?? []).map((o) => o.name).filter((n) => n !== '.emptyFolderPlaceholder');
    },
    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await b().remove(paths);
      if (error) throw new DatabaseError(`Deleting from ${bucket} failed: ${error.message}`, error);
    },
    publicUrl: (path) => b().getPublicUrl(path).data.publicUrl,
  };
}

export interface OdblResult {
  exportId: string;
  files: { path: string; bytes: number; rows?: number; url: string }[];
  pruned: string[];
  kept: string[];
}

/** Uploads one export folder, then deletes the older folders beyond KEEP_EXPORTS. */
export async function publishOdbl(
  store: ExportStore,
  files: ExportFile[],
  exportedAt: Date,
  log?: Logger,
): Promise<OdblResult> {
  const exportId = exportIdOf(exportedAt);
  const folder = `${ODBL_PREFIX}/${exportId}`;
  const done: string[] = [];
  try {
    // README last: a folder with a README is a complete export.
    for (const f of files) {
      await store.upload(`${folder}/${f.name}`, f);
      done.push(`${folder}/${f.name}`);
    }
  } catch (err) {
    await store.remove(done).catch(() => undefined);
    throw err;
  }
  log?.info('ODbL export uploaded.', { exportId, files: files.length });

  const folders = await store.list(ODBL_PREFIX);
  const pruned = exportsToPrune(folders);
  for (const old of pruned) {
    const names = await store.list(`${ODBL_PREFIX}/${old}`);
    await store.remove(names.map((n) => `${ODBL_PREFIX}/${old}/${n}`));
  }
  if (pruned.length > 0) log?.info('Old ODbL exports deleted.', { pruned });
  return {
    exportId,
    files: files.map((f) => ({
      path: `${folder}/${f.name}`,
      bytes: f.body.byteLength,
      rows: f.rows,
      url: store.publicUrl(`${folder}/${f.name}`),
    })),
    pruned,
    kept: exportsToPrune(folders, 0).filter((f) => !pruned.includes(f)),
  };
}

/** `npm run pipeline -- export odbl`: read, build, publish. */
export async function exportOdbl(
  db: ServiceClient,
  opts: { now?: Date; store?: ExportStore; log?: Logger } = {},
): Promise<OdblResult> {
  const exportedAt = opts.now ?? new Date();
  const ctx = await loadOdblContext(db);
  const tables = await readOdblTables(db, ctx);
  opts.log?.info('ODbL tables read.', {
    products: tables.products.length,
    stores: tables.stores.length,
    prices: tables.prices.length,
  });
  const files = buildOdblFiles(tables, ctx, exportedAt);
  return publishOdbl(opts.store ?? storageExportStore(db), files, exportedAt, opts.log);
}
