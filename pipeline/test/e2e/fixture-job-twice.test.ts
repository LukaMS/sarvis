// End-to-end: the CLI's `job fixture` against the dev project (PLAN P4.7). The test seeds 12
// `fixture` source products whose size is `unparsed` (10 the size parser reads, 2 it can't), then
// runs `job fixture --sample 4`, the full job, and the full job again. The full run picks up after
// the sample, and the second full run updates nothing. Every row and run it made is deleted at the
// end, even when a check fails.
//
//   npm run e2e --workspace @sarvis/pipeline
//
// Skipped when SUPABASE_DEV_SERVICE_ROLE_KEY is unset, so `npm test` in CI needs no secrets (D-019).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { jobCommand, parseCliArgs, runTrigger } from '../../src/cli.ts';
import { getServiceClient } from '../../src/db/client.ts';
import { FIXTURE_JOB_NAME, FIXTURE_JOB_VERSION } from '../../src/jobs/fixture.ts';
import { JOB_SOURCE_KEY } from '../../src/jobs/runner.ts';
import { createLogger, logger } from '../../src/log.ts';
import { FIXTURE_KEY } from '../../src/sources/fixture/index.ts';

const enabled = !!process.env.SUPABASE_DEV_SERVICE_ROLE_KEY;
const TEXTS = [
  '1 kg',
  '900 g',
  '2 L',
  'per slice 19 g',
  '540 mL',
  '12 x 355 ml',
  '20 bags',
  '750 g',
  '1',
  '4 L',
  '400 g',
  '6 x 100 g',
];
const READABLE = 10;
const EXTERNAL_IDS = TEXTS.map((_, i) => `job-fixture-${String(i + 1).padStart(2, '0')}`);
const quiet = createLogger({}, (level, line) => {
  if (level === 'error') process.stderr.write(line + '\n');
});

describe.skipIf(!enabled)('e2e: fixture job run twice against dev', () => {
  const db = enabled ? getServiceClient() : (undefined as never);
  const runIds: string[] = [];
  let fixtureSourceId = '';
  let jobSourceId = '';

  const seeded = () =>
    db
      .from('products')
      .select('external_id, quantity_text, unit_parse_status, net_quantity, net_unit, pack_count')
      .eq('source_id', fixtureSourceId)
      .in('external_id', EXTERNAL_IDS)
      .order('external_id');

  async function cleanup() {
    const errors: string[] = [];
    const note = (e: { message: string } | null) => e && errors.push(e.message);
    note(
      (
        await db
          .from('products')
          .delete()
          .eq('source_id', fixtureSourceId)
          .in('external_id', EXTERNAL_IDS)
      ).error,
    );
    if (runIds.length > 0) note((await db.from('ingestion_runs').delete().in('id', runIds)).error);
    return errors;
  }

  async function sourceId(key: string) {
    const { data, error } = await db.from('sources').select('id').eq('key', key).single();
    if (error) throw new Error(error.message);
    return data.id;
  }

  beforeAll(async () => {
    fixtureSourceId = await sourceId(FIXTURE_KEY);
    jobSourceId = await sourceId(JOB_SOURCE_KEY);
    await cleanup();
    // The job reads every unparsed fixture product: any other one would change the counts.
    const other = await db
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', fixtureSourceId)
      .eq('unit_parse_status', 'unparsed');
    expect(other.count).toBe(0);
    const fetchedAt = new Date().toISOString();
    const { error } = await db.from('products').insert(
      TEXTS.map((t, i) => ({
        source_id: fixtureSourceId,
        external_id: EXTERNAL_IDS[i] as string,
        name: `Job fixture ${i + 1}`,
        quantity_text: t,
        unit_parse_status: 'unparsed',
        source_url: `https://fixture.sarvis.test/product/${EXTERNAL_IDS[i]}`,
        fetched_at: fetchedAt,
        method: 'manual',
        method_version: 'job-fixture-e2e@1.0.0',
      })),
    );
    if (error) throw new Error(error.message);
  });

  afterAll(async () => {
    if (!fixtureSourceId) return;
    const errors = await cleanup();
    const left = await db
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', fixtureSourceId)
      .in('external_id', EXTERNAL_IDS);
    const runs = await db
      .from('ingestion_runs')
      .select('id', { count: 'exact', head: true })
      .in('id', runIds.length > 0 ? runIds : ['00000000-0000-0000-0000-000000000000']);
    logger.info('e2e cleanup', { errors, left: { products: left.count, runs: runs.count } });
    expect(errors).toEqual([]);
    expect({ products: left.count, runs: runs.count }).toEqual({ products: 0, runs: 0 });
  });

  async function jobOnce(label: string, argv: string[]) {
    const cmd = parseCliArgs(['job', FIXTURE_JOB_NAME, ...argv]);
    if (cmd.command !== 'job') throw new Error('expected a job command');
    const result = await jobCommand(cmd, { db, log: quiet });
    runIds.push(result.runId);
    logger.info(label, { runStatus: result.status, counts: result.counts });
    return result;
  }

  it('a dry run writes nothing, the full run resumes after a sample, and run 2 updates nothing', async () => {
    const dry = await jobOnce('dry run', ['--dry-run']);
    expect(dry.status).toBe('completed');
    expect(dry.counts).toMatchObject({ fetched: 12, valid: READABLE, updated: 0 });
    expect((await seeded()).data?.every((r) => r.unit_parse_status === 'unparsed')).toBe(true);

    const sample = await jobOnce('sample 4', ['--sample', '4']);
    expect(sample.status).toBe('completed');
    // The first 4 by id are not the first 4 by external id, so count what the sample settled.
    expect(sample.counts.fetched).toBe(4);
    const afterSample = (await seeded()).data ?? [];
    const okAfterSample = afterSample.filter((r) => r.unit_parse_status === 'ok').length;
    expect(sample.counts.updated).toBe(okAfterSample);

    const run1 = await jobOnce('run 1', []);
    const run2 = await jobOnce('run 2', []);
    expect(run1.status).toBe('completed');
    expect(run1.counts).toMatchObject({ updated: READABLE - okAfterSample, skipped_locked: 0 });
    // Run 1 reads only what the sample left: the 2 unreadable rows it saw are read again.
    expect(run1.counts.fetched).toBe(12 - okAfterSample);
    expect(run2.status).toBe('completed');
    expect(run2.counts).toEqual({
      fetched: 12 - READABLE,
      valid: 0,
      invalid: 0,
      inserted: 0,
      updated: 0,
      unchanged: 12 - READABLE,
      skipped_locked: 0,
    });

    const rows = (await seeded()).data ?? [];
    expect(rows.filter((r) => r.unit_parse_status === 'ok')).toHaveLength(READABLE);
    expect(rows.find((r) => r.quantity_text === '12 x 355 ml')).toMatchObject({
      net_quantity: 4260,
      net_unit: 'ml',
      pack_count: 12,
    });
    expect(
      rows.filter((r) => r.unit_parse_status === 'unparsed').map((r) => r.quantity_text),
    ).toEqual(['per slice 19 g', '1']);
    logger.info('example rows', { rows: rows.slice(0, 6) });

    const runs = await db
      .from('ingestion_runs')
      .select('id, source_id, job, job_version, mode, sample_size, status, triggered_by')
      .in('id', runIds)
      .order('started_at');
    expect(runs.error).toBeNull();
    expect(runs.data?.map((r) => [r.mode, r.sample_size])).toEqual([
      ['dry_run', null],
      ['sample', 4],
      ['full', null],
      ['full', null],
    ]);
    for (const r of runs.data ?? []) {
      expect(r).toMatchObject({
        source_id: jobSourceId,
        job: FIXTURE_JOB_NAME,
        job_version: FIXTURE_JOB_VERSION,
        status: 'completed',
        // 'dispatch' or 'schedule' inside GitHub Actions (P6.2).
        triggered_by: runTrigger(process.env),
      });
    }
    const events = await db
      .from('ingestion_run_events')
      .select('run_id, event_type')
      .in('run_id', runIds);
    expect(events.data?.filter((e) => e.event_type === 'run_finished')).toHaveLength(4);
    // Four job runs against dev; the 5 s default timed out from GitHub Actions (P6.2).
  }, 180_000);
});
