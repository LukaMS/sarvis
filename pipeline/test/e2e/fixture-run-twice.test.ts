// End-to-end: the CLI's `run fixture` against the dev project, twice (PLAN P2.17, the Phase 2 exit).
// Run 1 inserts the fixture's 17 valid products; run 2 sees the same data and inserts nothing. The
// test checks provenance on every row, one raw_objects row per page whose stored file re-parses to
// the same records, and the 3 invalid records in validation_failures. It deletes every fixture row
// and file it made at the end, even when a check fails.
//
//   npm run e2e --workspace @sarvis/pipeline
//
// Skipped when SUPABASE_DEV_SERVICE_ROLE_KEY is unset, so `npm test` in CI needs no secrets (D-019).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseCliArgs, runCommand } from '../../src/cli.ts';
import { getServiceClient } from '../../src/db/client.ts';
import { createLogger, logger } from '../../src/log.ts';
import { RAW_BUCKET, readRaw } from '../../src/raw/store.ts';
import {
  FIXTURE_INVALID_RULES,
  FIXTURE_VALID_COUNT,
  fixtureProducts,
} from '../../src/sources/fixture/data.ts';
import {
  FIXTURE_JOB,
  FIXTURE_KEY,
  FIXTURE_PRODUCT_URL,
  FIXTURE_VERSION,
  createFixtureSource,
} from '../../src/sources/fixture/index.ts';

const enabled = !!process.env.SUPABASE_DEV_SERVICE_ROLE_KEY;
const CODES = [...new Set(fixtureProducts().map((p) => p.code))];
const PAGES = 4;
const quiet = createLogger({}, (level, line) => {
  if (level === 'error') process.stderr.write(line + '\n');
});

describe.skipIf(!enabled)('e2e: fixture source run twice against dev', () => {
  const db = enabled ? getServiceClient() : (undefined as never);
  const runIds: string[] = [];
  let sourceId = '';

  const fixtureProductsQuery = () =>
    db.from('products').select('*').eq('source_id', sourceId).in('external_id', CODES);

  async function productCount(): Promise<number> {
    const { count, error } = await db
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', sourceId)
      .in('external_id', CODES);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  async function cleanup() {
    const errors: string[] = [];
    const note = (e: { message: string } | null) => e && errors.push(e.message);
    if (runIds.length > 0) {
      const raws = await db.from('raw_objects').select('storage_path').in('run_id', runIds);
      note(raws.error);
      const keys = (raws.data ?? []).map((r) => r.storage_path.slice(RAW_BUCKET.length + 1));
      if (keys.length > 0) note((await db.storage.from(RAW_BUCKET).remove(keys)).error);
    }
    note(
      (await db.from('products').delete().eq('source_id', sourceId).in('external_id', CODES)).error,
    );
    // raw_objects, events and validation_failures go with their run (on delete cascade).
    if (runIds.length > 0) note((await db.from('ingestion_runs').delete().in('id', runIds)).error);
    return errors;
  }

  beforeAll(async () => {
    const { data, error } = await db.from('sources').select('id').eq('key', FIXTURE_KEY).single();
    if (error) throw new Error(error.message);
    sourceId = data.id;
    // Leftovers from an interrupted earlier run would make run 1 look like an update.
    await cleanup();
    expect(await productCount()).toBe(0);
  });

  afterAll(async () => {
    if (!sourceId) return;
    const errors = await cleanup();
    const files = await Promise.all(
      runIds.map(async (id) => {
        const listed = await db.storage.from(RAW_BUCKET).list(`${FIXTURE_KEY}/${id}`);
        return listed.data?.length ?? 0;
      }),
    );
    const runs = await db
      .from('ingestion_runs')
      .select('id', { count: 'exact', head: true })
      .in('id', runIds.length > 0 ? runIds : ['00000000-0000-0000-0000-000000000000']);
    const left = {
      products: await productCount(),
      runs: runs.count,
      files: files.reduce((a, b) => a + b, 0),
    };
    logger.info('e2e cleanup', { errors, left });
    expect(errors).toEqual([]);
    expect(left).toEqual({ products: 0, runs: 0, files: 0 });
  });

  /** One `pipeline run fixture`, recording what the source parsed from each raw object. */
  async function runOnce(label: string) {
    const source = createFixtureSource();
    const parsed = new Map<string, unknown[]>();
    const parse = source.parse.bind(source);
    source.parse = (raw) => {
      const out = parse(raw);
      parsed.set(raw.rawObjectId as string, out.records);
      return out;
    };
    const cmd = parseCliArgs(['run', FIXTURE_KEY]);
    if (cmd.command !== 'run') throw new Error('expected a run command');
    const result = await runCommand(cmd, { db, source, log: quiet });
    runIds.push(result.runId);
    const rows = await productCount();
    logger.info(label, { runStatus: result.status, counts: result.counts, productRows: rows });
    return { result, parsed, rows };
  }

  it('run 2 inserts nothing; provenance, raw files and failures check out', async () => {
    const run1 = await runOnce('run 1');
    const run2 = await runOnce('run 2');

    // Counts: same rows, nothing inserted the second time.
    const invalid = FIXTURE_INVALID_RULES.length;
    const fetched = FIXTURE_VALID_COUNT + invalid;
    expect(run1.result.status).toBe('completed');
    expect(run1.result.counts).toEqual({
      fetched,
      valid: FIXTURE_VALID_COUNT,
      invalid,
      inserted: FIXTURE_VALID_COUNT,
      updated: 0,
      unchanged: 0,
      skipped_locked: 0,
    });
    expect(run2.result.status).toBe('completed');
    expect(run2.result.counts).toEqual({
      fetched,
      valid: FIXTURE_VALID_COUNT,
      invalid,
      inserted: 0,
      updated: 0,
      unchanged: FIXTURE_VALID_COUNT,
      skipped_locked: 0,
    });
    expect(run1.rows).toBe(FIXTURE_VALID_COUNT);
    expect(run2.rows).toBe(run1.rows);

    // The runs: triggered from the CLI, the source's expected total met.
    const runs = await db
      .from('ingestion_runs')
      .select('id, triggered_by, mode, job, job_version, expected_total')
      .in('id', runIds);
    expect(runs.error).toBeNull();
    for (const r of runs.data ?? []) {
      expect(r).toMatchObject({
        triggered_by: 'cli',
        mode: 'full',
        job: FIXTURE_JOB,
        job_version: FIXTURE_VERSION,
        expected_total: fetched,
      });
    }

    // Provenance on every row. Run 2 changed nothing, so every row still points at run 1.
    const products = await fixtureProductsQuery();
    expect(products.error).toBeNull();
    const rows = products.data ?? [];
    expect(rows).toHaveLength(FIXTURE_VALID_COUNT);
    const run1Raw = [...run1.parsed.keys()];
    for (const row of rows) {
      expect(row.source_id).toBe(sourceId);
      expect(row.source_url).toBe(FIXTURE_PRODUCT_URL + row.external_id);
      expect(Number.isNaN(Date.parse(row.fetched_at))).toBe(false);
      expect(row.method).toBe('api');
      expect(row.method_version).toBe(`${FIXTURE_JOB}@${FIXTURE_VERSION}`);
      expect(row.ingestion_run_id).toBe(run1.result.runId);
      expect(run1Raw).toContain(row.raw_object_id);
      expect(row.content_hash).not.toBeNull();
    }
    logger.info('example rows', {
      rows: rows.slice(0, 3).map((r) => ({
        gtin: r.gtin,
        name: r.name,
        brand_text: r.brand_text,
        quantity_text: r.quantity_text,
        net: `${r.net_quantity} ${r.net_unit}`,
      })),
    });

    // One raw_objects row per page, and each stored file re-parses to the same records.
    for (const run of [run1, run2]) {
      const raws = await db
        .from('raw_objects')
        .select('id, storage_path, request_url, http_status')
        .eq('run_id', run.result.runId)
        .order('storage_path');
      expect(raws.error).toBeNull();
      expect(raws.data).toHaveLength(PAGES);
      for (const [i, raw] of (raws.data ?? []).entries()) {
        expect(raw.request_url).toContain(`page=${i + 1}&`);
        expect(raw.http_status).toBe(200);
        const stored = await readRaw(db, raw.id);
        const reparsed = createFixtureSource().parse({ ...stored, rawObjectId: stored.id });
        expect(reparsed.records).toEqual(run.parsed.get(raw.id));
      }
    }

    // The 3 invalid records, one per rule, each tied to the page it came from.
    for (const run of [run1, run2]) {
      const failures = await db
        .from('validation_failures')
        .select('rule, record_key, raw_object_id')
        .eq('run_id', run.result.runId);
      expect(failures.error).toBeNull();
      expect((failures.data ?? []).map((f) => f.rule).sort()).toEqual([...FIXTURE_INVALID_RULES]);
      for (const f of failures.data ?? []) expect(f.raw_object_id).not.toBeNull();
      if (run === run1) logger.info('validation failures', { failures: failures.data });
    }
  }, 180_000);
});
