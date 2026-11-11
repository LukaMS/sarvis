import { describe, expect, it } from 'vitest';

import { EXIT_CODES, main, parseCliArgs } from '../cli.ts';
import { ConfigurationError, RunLockedError } from '../errors.ts';
import { createLogger } from '../log.ts';
import { MAX_RUN_EVENTS, SourceRefusedError } from '../runs/start.ts';
import { createMemoryRunStore } from '../runs/store.ts';
import type { SourceRow } from '../sources/source.ts';
import {
  type FixtureJobChange,
  type FixtureJobRow,
  type FixtureJobTable,
  createFixtureJob,
} from './fixture.ts';
import { listJobNames } from './index.ts';
import type { Job } from './job.ts';
import { JOB_SOURCE_KEY, type JobOptions, runJob } from './runner.ts';

const JOB_SOURCE: SourceRow = {
  id: 'src-derived',
  key: JOB_SOURCE_KEY,
  verdict: 'use',
  enabled: true,
  rate_limit_per_sec: 1,
};
const silent = createLogger({}, () => {});

interface MemoryRow extends FixtureJobRow {
  unit_parse_status: 'ok' | 'unparsed';
  net_quantity: number | null;
  net_unit: string | null;
  pack_count: number | null;
}

/** 12 rows that need work: 10 the parser reads, 2 it can't (ids r01…r12). */
function memoryTable(opts: { onWrite?: (changes: FixtureJobChange[]) => void } = {}) {
  const texts = [
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
  const rows: MemoryRow[] = texts.map((t, i) => ({
    id: `r${String(i + 1).padStart(2, '0')}`,
    quantity_text: t,
    locked_fields: [],
    unit_parse_status: 'unparsed',
    net_quantity: null,
    net_unit: null,
    pack_count: null,
  }));
  const reads: { after: string | null; limit: number }[] = [];
  let writes = 0;
  const table: FixtureJobTable = {
    async read(after, limit) {
      reads.push({ after, limit });
      return rows
        .filter((r) => r.unit_parse_status === 'unparsed' && (after === null || r.id > after))
        .slice(0, limit)
        .map(({ id, quantity_text, locked_fields }) => ({ id, quantity_text, locked_fields }));
    },
    async write(changes) {
      writes++;
      opts.onWrite?.(changes);
      let n = 0;
      for (const c of changes) {
        const row = rows.find((r) => r.id === c.id);
        if (!row || row.unit_parse_status !== 'unparsed') continue;
        Object.assign(row, {
          unit_parse_status: 'ok',
          net_quantity: c.net_quantity,
          net_unit: c.net_unit,
          pack_count: c.pack_count,
        });
        n++;
      }
      return n;
    },
  };
  return { rows, reads, table, writes: () => writes };
}

const READABLE = 10;
const UNREADABLE = 2;

function setup(sources: SourceRow[] = [JOB_SOURCE]) {
  return createMemoryRunStore({ sources });
}

const full: JobOptions = { mode: 'full', trigger: 'cli' };

describe('runJob', () => {
  it('runs every row that needs work in id-ordered batches, under the job source', async () => {
    const store = setup();
    const t = memoryTable();
    const result = await runJob(createFixtureJob(t.table), full, { store, log: silent });

    expect(result.status).toBe('completed');
    expect(result.counts).toEqual({
      fetched: 12,
      valid: READABLE,
      invalid: 0,
      inserted: 0,
      updated: READABLE,
      unchanged: UNREADABLE,
      skipped_locked: 0,
    });
    // Batches of 5, each after the last id; the third is short, so no fourth read.
    expect(t.reads).toEqual([
      { after: null, limit: 5 },
      { after: 'r05', limit: 5 },
      { after: 'r10', limit: 5 },
    ]);
    expect(t.rows.find((r) => r.id === 'r06')).toMatchObject({
      net_quantity: 4260,
      net_unit: 'ml',
      pack_count: 12,
    });
    const [run] = store.runs;
    expect(run).toMatchObject({
      source_id: JOB_SOURCE.id,
      job: 'fixture',
      job_version: '1.0.0',
      mode: 'full',
      sample_size: null,
      status: 'completed',
      error_summary: null,
    });
    const types = store.events.map((e) => e.event_type);
    expect(types).toEqual(['fixture_job_summary', 'run_finished']);
  });

  it('a second run updates nothing', async () => {
    const store = setup();
    const t = memoryTable();
    await runJob(createFixtureJob(t.table), full, { store, log: silent });
    const second = await runJob(createFixtureJob(t.table), full, { store, log: silent });
    expect(second.status).toBe('completed');
    expect(second.counts).toMatchObject({ fetched: UNREADABLE, valid: 0, updated: 0 });
    expect(second.counts.unchanged).toBe(UNREADABLE);
    expect(store.runs).toHaveLength(2);
  });

  it('a dry run works everything out and writes nothing', async () => {
    const store = setup();
    const t = memoryTable();
    const result = await runJob(
      createFixtureJob(t.table),
      { mode: 'dry_run', trigger: 'cli' },
      {
        store,
        log: silent,
      },
    );
    expect(result.status).toBe('completed');
    expect(t.writes()).toBe(0);
    expect(t.rows.every((r) => r.unit_parse_status === 'unparsed')).toBe(true);
    expect(result.counts).toMatchObject({ fetched: 12, valid: READABLE, updated: 0 });
    expect(store.runs[0]).toMatchObject({ mode: 'dry_run', status: 'completed' });
  });

  it('a sample stops at N, then a full run picks up the rest', async () => {
    const store = setup();
    const t = memoryTable();
    const sample = await runJob(
      createFixtureJob(t.table),
      { mode: 'sample', sampleSize: 7, trigger: 'cli' },
      {
        store,
        log: silent,
      },
    );
    expect(sample.counts.fetched).toBe(7);
    expect(t.reads).toEqual([
      { after: null, limit: 5 },
      { after: 'r05', limit: 2 },
    ]);
    expect(store.runs[0]).toMatchObject({ mode: 'sample', sample_size: 7 });
    // r01–r07 hold 6 readable rows (r04 isn't).
    expect(sample.counts.updated).toBe(6);

    const rest = await runJob(createFixtureJob(t.table), full, { store, log: silent });
    expect(rest.counts.updated).toBe(READABLE - 6);
    expect(t.rows.filter((r) => r.unit_parse_status === 'ok')).toHaveLength(READABLE);
  });

  it('a dry sample stops at N', async () => {
    const t = memoryTable();
    const result = await runJob(
      createFixtureJob(t.table),
      { mode: 'dry_run', sampleSize: 3, trigger: 'cli' },
      { store: setup(), log: silent },
    );
    expect(result.counts.fetched).toBe(3);
    expect(t.writes()).toBe(0);
  });

  it('a cancelled job stops, and the next run resumes with only the rows left', async () => {
    const store = setup();
    const controller = new AbortController();
    const t = memoryTable({ onWrite: () => controller.abort() });
    const first = await runJob(
      createFixtureJob(t.table),
      { ...full, signal: controller.signal },
      { store, log: silent },
    );
    expect(first.status).toBe('cancelled');
    expect(EXIT_CODES[first.status]).toBe(130);
    // Batch 1 (r01–r05) was written before the abort was seen; nothing after it was read.
    expect(t.reads).toHaveLength(1);
    expect(first.counts).toMatchObject({ fetched: 5, updated: 4 });
    expect(store.events.map((e) => e.event_type)).toEqual(['cancelled', 'run_finished']);

    const t2reads = t.reads.length;
    const second = await runJob(createFixtureJob(t.table), full, { store, log: silent });
    expect(second.status).toBe('completed');
    // r04 is read again (still unparsed), r01–r03 and r05 are not.
    expect(t.reads[t2reads]).toEqual({ after: null, limit: 5 });
    expect(second.counts).toMatchObject({ fetched: 8, updated: READABLE - 4 });
    expect(t.rows.filter((r) => r.unit_parse_status === 'ok')).toHaveLength(READABLE);
  });

  it('skips locked rows and counts them', async () => {
    const t = memoryTable();
    for (const r of t.rows.slice(0, 2)) r.locked_fields = ['net_quantity'];
    t.rows[2]!.locked_fields = ['name'];
    const result = await runJob(createFixtureJob(t.table), full, { store: setup(), log: silent });
    expect(result.counts).toMatchObject({
      valid: READABLE,
      updated: READABLE - 2,
      skipped_locked: 2,
    });
    expect(t.rows[0]).toMatchObject({ unit_parse_status: 'unparsed', net_quantity: null });
    expect(t.rows[2]).toMatchObject({ unit_parse_status: 'ok' });
  });

  it('a failed batch is reported and the next batch still runs', async () => {
    const store = setup();
    const t = memoryTable();
    const job = createFixtureJob(t.table);
    let batch = 0;
    const work = job.work.bind(job);
    job.work = (items, ctx) => {
      if (++batch === 1) throw new Error('could not work out batch 1');
      return work(items, ctx);
    };
    const result = await runJob(job, full, { store, log: silent });
    expect(result.status).toBe('completed_with_errors');
    expect(EXIT_CODES[result.status]).toBe(2);
    expect(result.errorSummary).toBe('could not work out batch 1');
    expect(result.counts.fetched).toBe(12);
    const failed = store.events.find((e) => e.event_type === 'batch_failed');
    expect(failed?.details).toMatchObject({ batch: 1, firstId: 'r01', lastId: 'r05' });
  });

  it('a fatal error fails the run', async () => {
    const store = setup();
    const t = memoryTable();
    t.table.write = async () => {
      throw new ConfigurationError('products is read-only');
    };
    const result = await runJob(createFixtureJob(t.table), full, { store, log: silent });
    expect(result.status).toBe('failed');
    expect(EXIT_CODES[result.status]).toBe(1);
    expect(result.counts.fetched).toBe(5);
    expect(store.runs[0]).toMatchObject({
      status: 'failed',
      error_summary: 'products is read-only',
    });
  });

  it('fails a job that reads out of id order instead of looping', async () => {
    const t = memoryTable();
    const job = createFixtureJob(t.table);
    job.read = async () => [
      { id: 'r02', quantity_text: '1 kg', locked_fields: [] },
      { id: 'r01', quantity_text: '1 kg', locked_fields: [] },
    ];
    const result = await runJob(job, full, { store: setup(), log: silent });
    expect(result.status).toBe('failed');
    expect(result.errorSummary).toMatch(/not in id order/);
  });

  it('ends a clean run with 0 rows to work', async () => {
    const store = setup();
    const job: Job<FixtureJobRow, FixtureJobChange> = {
      ...createFixtureJob(memoryTable().table),
      read: async () => [],
    };
    const result = await runJob(job, full, { store, log: silent });
    expect(result.status).toBe('completed');
    expect(EXIT_CODES[result.status]).toBe(0);
    expect(result.counts.fetched).toBe(0);
  });

  it('caps stored events and keeps the last slot for run_finished', async () => {
    const store = setup();
    const t = memoryTable();
    const job = createFixtureJob(t.table, { batchSize: 1 });
    const work = job.work.bind(job);
    job.work = async (items, ctx) => {
      const out = await work(items, ctx);
      const events = Array.from({ length: 5 }, (_, i) => ({
        severity: 'info' as const,
        eventType: 'note',
        message: `note ${i}`,
      }));
      return { ...out, events };
    };
    const result = await runJob(job, full, { store, log: silent });
    expect(result.status).toBe('completed');
    expect(store.events).toHaveLength(MAX_RUN_EVENTS);
    const last = store.events.at(-1);
    expect(last?.event_type).toBe('run_finished');
    // 12 batches × 5 notes + the summary = 61 events, of which 49 fit.
    expect(last?.details).toMatchObject({ eventsDropped: 61 - (MAX_RUN_EVENTS - 1), batches: 12 });
  });

  it('refuses before creating a run: no source row, disabled, or the job already running', async () => {
    const job = () => createFixtureJob(memoryTable().table);
    await expect(runJob(job(), full, { store: setup([]), log: silent })).rejects.toBeInstanceOf(
      SourceRefusedError,
    );
    const disabled = setup([{ ...JOB_SOURCE, enabled: false }]);
    await expect(runJob(job(), full, { store: disabled, log: silent })).rejects.toThrow(/disabled/);
    expect(disabled.runs).toHaveLength(0);

    const store = setup();
    await store.createRun({
      source_id: JOB_SOURCE.id,
      job: 'fixture',
      job_version: '1.0.0',
      mode: 'full',
      sample_size: null,
      triggered_by: 'cli',
      git_sha: null,
      actions_run_url: null,
    });
    await expect(runJob(job(), full, { store, log: silent })).rejects.toBeInstanceOf(
      RunLockedError,
    );
    expect(store.runs).toHaveLength(1);
  });

  it('rejects bad options', async () => {
    const job = createFixtureJob(memoryTable().table);
    const store = setup();
    await expect(
      runJob(job, { mode: 'delta' as never, trigger: 'cli' }, { store, log: silent }),
    ).rejects.toThrow(/not delta/);
    await expect(
      runJob(job, { mode: 'sample', trigger: 'cli' }, { store, log: silent }),
    ).rejects.toThrow(/needs a sample size/);
    await expect(
      runJob(job, { mode: 'full', sampleSize: 3, trigger: 'cli' }, { store, log: silent }),
    ).rejects.toThrow(/use mode sample/);
    expect(store.runs).toHaveLength(0);
  });
});

describe('the job command', () => {
  it.each([
    [['job', 'fixture'], 'full', null],
    [['job', 'fixture', '--sample', '10'], 'sample', 10],
    [['job', 'fixture', '--dry-run'], 'dry_run', null],
    [['job', 'fixture', '--sample', '3', '--dry-run'], 'dry_run', 3],
  ] as const)('%j → %s', (argv, mode, sampleSize) => {
    expect(parseCliArgs([...argv])).toEqual({ command: 'job', name: 'fixture', mode, sampleSize });
  });

  it.each([
    [['job'], /Missing the job name/],
    [['job', 'fixture', '--mode', 'delta'], /not --mode/],
    [['job', 'fixture', '--sample', '0'], /positive whole number/],
    [['job', 'a', 'b'], /Unexpected arguments/],
  ])('%j is refused', (argv, message) => {
    expect(() => parseCliArgs(argv)).toThrow(message);
  });

  it('maps statuses to the same exit codes as run', () => {
    expect(EXIT_CODES).toEqual({
      completed: 0,
      completed_with_errors: 2,
      failed: 1,
      cancelled: 130,
    });
  });

  it('exits 1 on a bad job command, before touching the database', async () => {
    expect(await main(['job', 'fixture', '--mode', 'full'], silent)).toBe(1);
  });

  it('registers the fixture job', () => {
    expect(listJobNames()).toContain('fixture');
  });
});
