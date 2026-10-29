// Dev-project check for the writers (P2.16). Under the `fixture` source and one throwaway run, it
// writes 2 brands, 5 products, 1 store and 3 prices twice, then once more with a changed price,
// an equal later price, a locked name and a changed product. Prints the counts, checks provenance
// on every row, and deletes everything it wrote, even when a step fails.
//
//   npm run check:writers --workspace @sarvis/pipeline
//
// It runs under Vitest, not plain Node, because the writers load @sarvis/core at runtime (P2.20).
import type { RecordInputOf, RecordKind, RecordOf } from '@sarvis/core';
import { RECORD_SCHEMAS } from '@sarvis/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { logger } from '../log.ts';
import type { WriteContext } from '../runs/driver.ts';
import { createSupabaseRunStore } from '../runs/store.ts';
import type { SourceRow } from '../sources/source.ts';
import { getServiceClient } from './client.ts';
import type { WriteResult } from './keyed.ts';
import { writerFor } from './writers/index.ts';

const enabled = !!process.env.SUPABASE_DEV_SERVICE_ROLE_KEY;
const TAG = 'p216-check';
const BANNER = `${TAG}-banner`;
const STORE = `${TAG}-store`;
const BRANDS = [`${TAG}-brand-a`, `${TAG}-brand-b`];
const COMPANY = `${TAG}-company`;

/** GTIN-14 with a GS1 mod-10 check digit, under an unrestricted 06 prefix. */
function gtin(n: number): string {
  const body = `0062999900${String(n).padStart(3, '0')}`;
  const sum = [...body].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return body + String((10 - (sum % 10)) % 10);
}
const GTINS = [1, 2, 3, 4, 5].map(gtin);

const prov = (version = 'p216-check@1.0.0') => ({
  source_key: 'fixture',
  source_url: 'https://example.test/fixture',
  fetched_at: new Date().toISOString(),
  method: 'import' as const,
  method_version: version,
});

const parse = <K extends RecordKind>(kind: K, input: RecordInputOf<K>): RecordOf<K> =>
  RECORD_SCHEMAS[kind].parse(input) as RecordOf<K>;

const brands = () =>
  BRANDS.map((slug, i) => parse('brand', { slug, name: `P216 Brand ${'AB'[i]}`, ...prov() }));

const products = (over: Partial<Record<number, Partial<RecordInputOf<'product'>>>> = {}) =>
  GTINS.map((g, i) =>
    parse('product', {
      gtin: g,
      external_id: `${TAG}-${i + 1}`,
      name: `P216 Product ${i + 1}`,
      brand_text: `P216 Brand ${'AB'[i % 2]}`,
      brand_slug: BRANDS[i % 2],
      quantity_text: '540 mL',
      net_quantity: 540,
      net_unit: 'ml',
      unit_parse_status: 'ok',
      label_codes: i === 0 ? ['organic'] : [],
      ...prov(),
      ...over[i],
    }),
  );

const prices = (day: string, amounts: number[]) =>
  amounts.map((price, i) =>
    parse('price_observation', {
      store: { slug: STORE },
      product: { gtin: GTINS[i] as string },
      observed_on: day,
      price,
      price_kind: 'regular',
      ...prov(),
    }),
  );

const counts = ({ rejected, ...c }: WriteResult) => ({ ...c, rejected: rejected.length });

describe.skipIf(!enabled)('writers against the dev project', () => {
  const db = enabled ? getServiceClient() : (undefined as never);
  let ctx: WriteContext;

  async function write<K extends RecordKind>(kind: K, records: RecordOf<K>[]) {
    const result = await writerFor(db, kind).upsert(records, ctx);
    if (result.rejected.length > 0) logger.warn('rejected', { kind, rejected: result.rejected });
    return result;
  }

  async function round(
    label: string,
    p: RecordOf<'product'>[],
    pr: RecordOf<'price_observation'>[],
  ) {
    const out = {
      brands: counts(await write('brand', brands())),
      products: counts(await write('product', p)),
      prices: counts(await write('price_observation', pr)),
    };
    logger.info(label, out);
    return out;
  }

  beforeAll(async () => {
    const store = createSupabaseRunStore(db);
    const source = (await store.loadSource('fixture')) as SourceRow;
    const runId = await store.createRun({
      source_id: source.id,
      job: 'writers-check',
      job_version: '1.0.0',
      mode: 'sample',
      sample_size: 5,
      triggered_by: 'cli',
      git_sha: null,
      actions_run_url: null,
    });
    ctx = { runId, source, rawObjectId: null };
    // No banner writer yet: the test banner is inserted directly, with fixture provenance.
    const banner = await db.from('banners').insert({
      slug: BANNER,
      name: 'P216 Banner',
      source_id: source.id,
      fetched_at: new Date().toISOString(),
      method: 'manual',
      method_version: 'p216-check@1.0.0',
    });
    if (banner.error) throw new Error(banner.error.message);
    const st = await write('store', [
      parse('store', {
        slug: STORE,
        banner_slug: BANNER,
        name: 'P216 Store',
        city: 'Toronto',
        province: 'ON',
        ...prov(),
      }),
    ]);
    expect(st.inserted).toBe(1);
  });

  afterAll(async () => {
    if (!ctx) return;
    const ids =
      (await db.from('products').select('id').in('gtin', GTINS)).data?.map((r) => r.id) ?? [];
    const steps = [
      await db.from('price_observations').delete().in('product_id', ids),
      await db.from('products').delete().in('id', ids),
      await db.from('match_candidates').delete().eq('run_id', ctx.runId),
      await db.from('brands').delete().in('slug', BRANDS),
      await db.from('companies').delete().eq('slug', COMPANY),
      await db.from('stores').delete().eq('slug', STORE),
      await db.from('banners').delete().eq('slug', BANNER),
      await db.from('ingestion_runs').delete().eq('id', ctx.runId),
    ];
    const left = {
      products: (
        await db.from('products').select('id', { count: 'exact', head: true }).in('gtin', GTINS)
      ).count,
      brands: (
        await db.from('brands').select('id', { count: 'exact', head: true }).in('slug', BRANDS)
      ).count,
      prices: (
        await db
          .from('price_observations')
          .select('id', { count: 'exact', head: true })
          .eq('ingestion_run_id', ctx.runId)
      ).count,
      stores: (
        await db.from('stores').select('id', { count: 'exact', head: true }).eq('slug', STORE)
      ).count,
      banners: (
        await db.from('banners').select('id', { count: 'exact', head: true }).eq('slug', BANNER)
      ).count,
    };
    logger.info('cleaned up', {
      errors: steps.filter((s) => s.error).map((s) => s.error?.message),
      left,
    });
    expect(Object.values(left).every((n) => n === 0)).toBe(true);
  });

  it('writes, re-writes unchanged, appends a changed price and keeps a locked field', async () => {
    const day1 = '2026-10-28';
    const run1 = await round('run 1', products(), prices(day1, [3.49, 2.99, 5.25]));
    expect(run1.brands).toMatchObject({ inserted: 2, rejected: 0 });
    expect(run1.products).toMatchObject({ inserted: 5, rejected: 0 });
    expect(run1.prices).toMatchObject({ inserted: 3, rejected: 0 });

    const run2 = await round('run 2 (same input)', products(), prices(day1, [3.49, 2.99, 5.25]));
    expect(run2.brands).toMatchObject({ inserted: 0, updated: 0, unchanged: 2 });
    expect(run2.products).toMatchObject({ inserted: 0, updated: 0, unchanged: 5 });
    expect(run2.prices).toMatchObject({ inserted: 0, updated: 0, unchanged: 3 });

    // An admin edits product 1's name, which locks it.
    const locked = await db
      .from('products')
      .update({ name: 'P216 Product 1 (admin)', locked_fields: ['name'] })
      .eq('gtin', GTINS[0] as string);
    expect(locked.error).toBeNull();

    // Run 3: the source renames product 1 (locked) and changes product 2's size text; price 1
    // changes, price 2 is equal a day later, price 3 is re-read as it was.
    const run3 = await round(
      'run 3 (changes)',
      products({ 0: { name: 'P216 Product One' }, 1: { quantity_text: '540 ml' } }),
      [...prices('2026-10-29', [3.79, 2.99]), ...prices(day1, [3.49, 2.99, 5.25]).slice(2)],
    );
    expect(run3.products).toMatchObject({
      inserted: 0,
      updated: 1,
      unchanged: 3,
      skipped_locked: 1,
    });
    expect(run3.prices).toMatchObject({ inserted: 1, updated: 0, unchanged: 2 });

    const rows = await db
      .from('products')
      .select(
        'gtin, name, quantity_text, brand_id, label_codes, locked_fields, source_id, fetched_at, method, method_version, ingestion_run_id',
      )
      .in('gtin', GTINS)
      .order('gtin');
    const p1 = rows.data?.[0];
    expect(p1?.name).toBe('P216 Product 1 (admin)');
    expect(rows.data?.[1]?.quantity_text).toBe('540 ml');
    expect(rows.data?.every((r) => r.brand_id !== null)).toBe(true);
    expect(p1?.label_codes).toEqual([1]);

    const history = await db
      .from('price_observations')
      .select(
        'product_id, observed_on, last_confirmed_on, price, source_id, fetched_at, method, method_version, ingestion_run_id',
      )
      .eq('ingestion_run_id', ctx.runId)
      .order('product_id')
      .order('observed_on');
    logger.info('price rows', {
      rows: history.data?.map(({ observed_on, last_confirmed_on, price }) => ({
        observed_on,
        last_confirmed_on,
        price,
      })),
    });
    expect(history.data).toHaveLength(4);
    const confirmed = history.data?.filter((r) => r.last_confirmed_on === '2026-10-29');
    expect(confirmed).toHaveLength(1);
    expect(confirmed?.[0]?.price).toBe(2.99);

    const brandRows = await db
      .from('brands')
      .select('slug, source_id, fetched_at, method, method_version')
      .in('slug', BRANDS);
    const all = [...(rows.data ?? []), ...(history.data ?? []), ...(brandRows.data ?? [])];
    const missing = all.filter(
      (r) => !r.source_id || !r.fetched_at || !r.method || !r.method_version,
    );
    logger.info('provenance', {
      rows: all.length,
      missingProvenance: missing.length,
      example: rows.data?.[1],
    });
    expect(all).toHaveLength(5 + 4 + 2);
    expect(missing).toHaveLength(0);
  });

  it('writes companies, edges, listings (proposing the named product) and identifiers idempotently', async () => {
    const records = () => ({
      company: [
        parse('company', { slug: COMPANY, name: 'P216 Company', country: 'CA', ...prov() }),
      ],
      brand_ownership: [
        parse('brand_ownership', {
          brand_slug: BRANDS[0] as string,
          company_slug: COMPANY,
          relation: 'owner',
          ...prov(),
        }),
      ],
      store_listing: [
        parse('store_listing', {
          banner_slug: BANNER,
          external_sku: `${TAG}-sku-1`,
          listing_name: 'P216 PRODUCT 1',
          size_text: '540 mL',
          product: { gtin: GTINS[0] as string },
          first_seen_at: '2026-10-28T12:00:00Z',
          last_seen_at: '2026-10-28T12:00:00Z',
          ...prov(),
        }),
        parse('store_listing', {
          banner_slug: BANNER,
          listing_name: 'P216 Loose Apples',
          first_seen_at: '2026-10-28T12:00:00Z',
          last_seen_at: '2026-10-28T12:00:00Z',
          ...prov(),
        }),
      ],
      product_identifier: [
        parse('product_identifier', {
          product: { gtin: GTINS[1] as string },
          scheme: 'store_sku',
          value: `${TAG}-sku-2`,
          banner_slug: BANNER,
          ...prov(),
        }),
      ],
    });
    const once = async (label: string) => {
      const r = records();
      const out = {
        company: counts(await write('company', r.company)),
        brand_ownership: counts(await write('brand_ownership', r.brand_ownership)),
        store_listing: counts(await write('store_listing', r.store_listing)),
        product_identifier: counts(await write('product_identifier', r.product_identifier)),
      };
      logger.info(label, out);
      return out;
    };
    const first = await once('other writers, run 1');
    for (const c of Object.values(first))
      expect(c).toMatchObject({ inserted: c.inserted, rejected: 0 });
    expect(first.store_listing.inserted).toBe(2);
    const second = await once('other writers, run 2');
    for (const c of Object.values(second))
      expect(c).toMatchObject({ inserted: 0, updated: 0, rejected: 0 });

    const edge = await db
      .from('brand_ownership')
      .select('review_status, method')
      .eq(
        'company_id',
        (await db.from('companies').select('id').eq('slug', COMPANY).single()).data?.id as string,
      );
    expect(edge.data).toEqual([{ review_status: 'pending', method: 'import' }]);
    const candidates = await db
      .from('match_candidates')
      .select('kind, match_method, status, score')
      .eq('run_id', ctx.runId);
    logger.info('match candidates', { rows: candidates.data });
    expect(candidates.data).toEqual([
      { kind: 'listing_product', match_method: 'gtin_exact', status: 'pending', score: 1 },
    ]);
    const listings = await db
      .from('store_listings')
      .select('listing_name, product_id, match_candidate_id')
      .eq('source_id', ctx.source.id)
      .order('listing_name');
    expect(listings.data?.map((l) => [l.product_id, l.match_candidate_id !== null])).toEqual([
      [null, false],
      [null, true],
    ]);
  });
});
