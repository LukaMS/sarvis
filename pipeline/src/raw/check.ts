// Dev-project check for the raw store (P2.14). Stores a 3-record fixture under a throwaway run,
// reads it back and compares bytes, shows the raw_objects row, deletes the file, confirms readRaw
// then fails, and removes the row and the run. Leaves nothing behind, even when a step fails.
//
//   npm run check:raw --workspace @sarvis/pipeline
import { readFileSync } from 'node:fs';

import { getServiceClient } from '../db/client.ts';
import { DatabaseError, NotFoundError } from '../errors.ts';
import { logger } from '../log.ts';
import { RAW_BUCKET, deleteRawFile, readRaw, storeRaw } from './store.ts';

// Not PIPELINE_VERSION from ../index.ts: that pulls @sarvis/core in at runtime, which Node can't
// load with strip-types yet (P2.20). The test that keeps the two in step reads the same file.
const { version: PIPELINE_VERSION } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

const FIXTURE = JSON.stringify({
  count: 3,
  products: [
    {
      code: '0064100238220',
      product_name: 'Rice Krispies',
      brands: 'Kellogg’s',
      quantity: '340 g',
    },
    { code: '0068100084245', product_name: 'Cheerios', brands: 'General Mills', quantity: '430 g' },
    { code: '0055577105658', product_name: 'Raisin Bran', brands: 'Post', quantity: '1.2 kg' },
  ],
});

async function main() {
  const db = getServiceClient();
  const source = await db.from('sources').select('id, key').eq('key', 'fixture').single();
  if (source.error)
    throw new DatabaseError(`Loading the fixture source failed: ${source.error.message}`);

  const run = await db
    .from('ingestion_runs')
    .insert({
      source_id: source.data.id,
      job: 'raw-store-check',
      job_version: PIPELINE_VERSION,
      mode: 'sample',
      sample_size: 3,
      triggered_by: 'cli',
    })
    .select('id')
    .single();
  if (run.error) throw new DatabaseError(`Creating the check run failed: ${run.error.message}`);
  const runId = run.data.id;

  try {
    const ctx = { db, sourceId: source.data.id, sourceKey: 'fixture', runId };
    const stored = await storeRaw(ctx, 1, {
      body: FIXTURE,
      url: 'https://example.test/fixture/products?page=1',
      status: 200,
      headers: { 'content-type': 'application/json', 'set-cookie': 'sid=dropped' },
      fetchedAt: new Date(),
    });
    logger.info('stored', { ...stored });

    const row = await db.from('raw_objects').select('*').eq('id', stored.id).single();
    if (row.error) throw new DatabaseError(`Reading the row failed: ${row.error.message}`);
    logger.info('raw_objects row', { ...row.data });

    const back = await readRaw(db, stored.id);
    const equal = Buffer.from(back.body, 'utf8').equals(Buffer.from(FIXTURE, 'utf8'));
    const records = (JSON.parse(back.body) as { products: unknown[] }).products.length;
    logger.info('read back', {
      byteEqual: equal,
      bodyBytes: Buffer.byteLength(back.body),
      records,
      headers: back.headers,
    });
    if (!equal || records !== 3) throw new Error('Read-back body differs from the fixture.');

    await deleteRawFile(db, stored.id);
    const listed = await db.storage.from(RAW_BUCKET).list(`fixture/${runId}`);
    logger.info('file deleted', { filesLeftInRunFolder: listed.data?.length ?? null });

    try {
      await readRaw(db, stored.id);
      throw new Error('readRaw succeeded after the file was deleted.');
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
      logger.info('readRaw after delete fails as expected', { error: err.message });
    }

    // A file that vanished without the row being marked (deleted by hand, or a failed cleanup).
    const orphan = await storeRaw(ctx, 2, { body: FIXTURE, fetchedAt: new Date() });
    await db.storage.from(RAW_BUCKET).remove([orphan.storagePath.slice(RAW_BUCKET.length + 1)]);
    try {
      await readRaw(db, orphan.id);
      throw new Error('readRaw succeeded with its file missing.');
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
      logger.info('readRaw with the file missing fails as expected', { error: err.message });
    }
  } finally {
    // The run's raw_objects rows go with it (on delete cascade). A file left by a failed step is
    // removed first so the bucket ends as it started.
    const files = await db.storage.from(RAW_BUCKET).list(`fixture/${runId}`);
    const names = (files.data ?? []).map((f) => `fixture/${runId}/${f.name}`);
    if (names.length > 0) await db.storage.from(RAW_BUCKET).remove(names);
    const removed = await db.from('ingestion_runs').delete().eq('id', runId);
    if (removed.error) logger.error('cleanup failed', { runId, err: removed.error.message });
    const left = await db
      .from('raw_objects')
      .select('*', { count: 'exact', head: true })
      .eq('run_id', runId);
    logger.info('cleaned up', { runDeleted: !removed.error, rawRowsLeft: left.count });
  }
}

main().catch((err: unknown) => {
  logger.error('raw store check failed', { err });
  process.exitCode = 1;
});
