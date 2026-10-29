// The run driver with a fake source and the in-memory run store: no network, no database.
import type { RecordOf } from '@sarvis/core';
import { describe, expect, it } from 'vitest';

import { SourceBlockedError } from '../errors.ts';
import type { HttpClient } from '../http/client.ts';
import { createLogger } from '../log.ts';
import type { RawInput } from '../raw/store.ts';
import type { RawPayload, Source, SourceCapabilities, SourceRow } from '../sources/source.ts';
import {
  MAX_RUN_EVENTS,
  MAX_VALIDATION_FAILURES,
  type RecordWriter,
  type RunOptions,
  SourceRefusedError,
  runSource,
} from './driver.ts';
import { type MemoryRun, STALE_SWEEP_SUMMARY, createMemoryRunStore } from './store.ts';

const SOURCE_ROW: SourceRow = {
  id: 'src-1',
  key: 'fixture',
  verdict: 'use',
  enabled: true,
  rate_limit_per_sec: 1,
};

const prov = {
  source_key: 'fixture',
  source_url: 'https://example.test/p',
  fetched_at: '2026-10-29T12:00:00Z',
  method: 'import',
  method_version: 'fixture@1.0.0',
};

const good = (id: string) => ({ external_id: id, name: `Product ${id}`, ...prov });
/** Missing the required name. */
const bad = (id: string) => ({ external_id: id, ...prov });

interface FakeOptions {
  pages: unknown[][];
  expectedTotal?: number;
  capabilities?: Partial<SourceCapabilities>;
  /** Throw this from fetch on the given page (0-based). */
  failOn?: { page: number; error: Error };
  /** Called after each page is fetched. */
  onFetch?: (page: number) => void;
  verifyContext?: () => Promise<void>;
}

function fakeSource(o: FakeOptions): Source<'product', number> & { parsed: RawPayload[] } {
  const parsed: RawPayload[] = [];
  return {
    key: 'fixture',
    job: 'fixture-import',
    version: '0.0.1',
    recordKind: 'product',
    capabilities: {
      supportsDelta: false,
      supportsDeactivation: true,
      storeSpecificPricing: false,
      ...o.capabilities,
    },
    parsed,
    verifyContext: o.verifyContext,
    plan: () => [0],
    async fetch(page) {
      if (o.failOn?.page === page) throw o.failOn.error;
      o.onFetch?.(page);
      const response: RawInput = {
        url: `https://example.test/p?page=${page}`,
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ total: o.expectedTotal ?? null, items: o.pages[page] }),
        fetchedAt: '2026-10-29T12:00:00.000Z',
      };
      return { response, next: page + 1 < o.pages.length ? [page + 1] : [] };
    },
    parse(raw) {
      parsed.push(raw);
      const body = JSON.parse(raw.body) as { total: number | null; items: unknown[] };
      return { records: body.items, expectedTotal: body.total };
    },
  };
}

function setup(init: { sources?: SourceRow[]; runs?: MemoryRun[] } = {}) {
  const store = createMemoryRunStore({ sources: init.sources ?? [SOURCE_ROW], runs: init.runs });
  const rawStored: { seq: number; input: RawInput }[] = [];
  const upserted: RecordOf<'product'>[][] = [];
  const deactivations: string[] = [];
  const writer: RecordWriter<'product'> = {
    async upsert(records) {
      upserted.push(records);
      return { inserted: records.length, updated: 0, unchanged: 0, skipped_locked: 0 };
    },
    async deactivateUnseen({ runId }) {
      deactivations.push(runId);
      return 2;
    },
  };
  const deps = {
    store,
    raw: () => ({
      async store(seq: number, input: RawInput) {
        rawStored.push({ seq, input });
        return { id: `raw-${seq}` };
      },
    }),
    writer,
    http: {} as HttpClient,
    log: createLogger({}, () => {}),
  };
  return { store, deps, rawStored, upserted, deactivations };
}

const full: RunOptions = { mode: 'full', trigger: 'cli', politenessDelayMs: 0 };

describe('runSource: refusals', () => {
  it('refuses an avoid source before creating a run', async () => {
    const { store, deps } = setup({
      sources: [{ ...SOURCE_ROW, verdict: 'avoid', enabled: false }],
    });
    await expect(runSource(fakeSource({ pages: [[good('a')]] }), full, deps)).rejects.toThrow(
      SourceRefusedError,
    );
    expect(store.runs).toHaveLength(0);
  });

  it('refuses manual_only, disabled and unknown sources', async () => {
    for (const sources of [
      [{ ...SOURCE_ROW, verdict: 'manual_only' as const }],
      [{ ...SOURCE_ROW, enabled: false }],
      [],
    ]) {
      const { store, deps } = setup({ sources });
      await expect(runSource(fakeSource({ pages: [[]] }), full, deps)).rejects.toThrow(
        SourceRefusedError,
      );
      expect(store.runs).toHaveLength(0);
    }
  });

  it('rejects inconsistent mode and sample size', async () => {
    const { deps } = setup();
    const src = fakeSource({ pages: [[]] });
    await expect(runSource(src, { ...full, mode: 'sample' }, deps)).rejects.toThrow(/sample size/);
    await expect(runSource(src, { ...full, sampleSize: 5 }, deps)).rejects.toThrow(/sample size/);
    await expect(runSource(src, { ...full, mode: 'delta' }, deps)).rejects.toThrow(/delta/);
  });
});

describe('runSource: lifecycle', () => {
  it('runs a clean full run end to end and deactivates unseen rows', async () => {
    const { store, deps, rawStored, upserted, deactivations } = setup();
    const src = fakeSource({ pages: [[good('a'), good('b')], [good('c')]], expectedTotal: 3 });
    const result = await runSource(src, { ...full, gitSha: 'abc1234' }, deps);

    expect(result.status).toBe('completed');
    expect(result.counts).toMatchObject({ fetched: 3, valid: 3, invalid: 0, inserted: 3 });
    expect(result.expectedTotal).toBe(3);
    expect(result.deactivated).toBe(2);
    expect(deactivations).toEqual([result.runId]);
    expect(rawStored.map((r) => r.seq)).toEqual([1, 2]);
    expect(upserted.map((b) => b.length)).toEqual([2, 1]);
    expect(src.parsed.map((p) => p.rawObjectId)).toEqual(['raw-1', 'raw-2']);

    const run = store.runs[0]!;
    expect(run).toMatchObject({
      job: 'fixture-import',
      job_version: '0.0.1',
      mode: 'full',
      sample_size: null,
      triggered_by: 'cli',
      git_sha: 'abc1234',
      status: 'completed',
      expected_total: 3,
    });
    expect(run.finished_at).not.toBeNull();
    expect(store.events.at(-1)).toMatchObject({ event_type: 'run_finished', severity: 'info' });
  });

  it('sweeps a stale running run to failed at start, and leaves a recent one', async () => {
    const old: MemoryRun = {
      id: 'old',
      source_id: 'src-1',
      job: 'fixture-import',
      job_version: '0.0.1',
      mode: 'full',
      sample_size: null,
      triggered_by: 'schedule',
      git_sha: null,
      actions_run_url: null,
      status: 'running',
      started_at: new Date(Date.now() - 7 * 3600_000).toISOString(),
      finished_at: null,
      counts: {},
      expected_total: null,
      error_summary: null,
    };
    const recent: MemoryRun = {
      ...old,
      id: 'recent',
      started_at: new Date(Date.now() - 60_000).toISOString(),
    };
    const { store, deps } = setup({ runs: [old, recent] });
    const result = await runSource(fakeSource({ pages: [[good('a')]] }), full, deps);

    expect(result.sweptStaleRuns).toBe(1);
    expect(store.runs.find((r) => r.id === 'old')).toMatchObject({
      status: 'failed',
      error_summary: STALE_SWEEP_SUMMARY,
    });
    expect(store.runs.find((r) => r.id === 'old')!.finished_at).not.toBeNull();
    expect(store.runs.find((r) => r.id === 'recent')!.status).toBe('running');
    expect(store.events.some((e) => e.event_type === 'stale_runs_swept')).toBe(true);
  });

  it('stores 50 failures for 60 invalid records, with counts.invalid = 60', async () => {
    const { store, deps } = setup();
    // 60 invalid among 140 valid, over two pages, so no batch is more than half invalid.
    const page = (offset: number) => [
      ...Array.from({ length: 30 }, (_, i) => bad(`bad-${offset + i}`)),
      ...Array.from({ length: 70 }, (_, i) => good(`good-${offset + i}`)),
    ];
    const result = await runSource(fakeSource({ pages: [page(0), page(100)] }), full, deps);

    expect(result.counts).toMatchObject({ fetched: 200, valid: 140, invalid: 60 });
    expect(store.failures).toHaveLength(MAX_VALIDATION_FAILURES);
    expect(store.failures[0]).toMatchObject({
      run_id: result.runId,
      raw_object_id: 'raw-1',
      rule: 'required_field',
      record_key: 'bad-0',
    });
    expect(store.failures.at(-1)!.raw_object_id).toBe('raw-2');
    expect(result.status).toBe('completed');
  });

  it('fails a batch that is more than 50% invalid: nothing from it is written', async () => {
    const { store, deps, upserted, deactivations } = setup();
    const page = [good('a'), good('b'), bad('c'), bad('d'), bad('e')];
    const result = await runSource(fakeSource({ pages: [page] }), full, deps);

    expect(result.status).toBe('failed');
    expect(result.counts).toMatchObject({ fetched: 5, valid: 2, invalid: 3, inserted: 0 });
    expect(upserted).toHaveLength(0);
    expect(deactivations).toHaveLength(0);
    expect(result.deactivated).toBeNull();
    const types = store.events.map((e) => e.event_type);
    expect(types).toContain('safeguard_failed');
    expect(types).toContain('run_safeguard_failed');
    expect(result.errorSummary).toMatch(/Invalid record rate 60%/);
  });

  it('skips only the bad batch when the run as a whole is mostly valid', async () => {
    const { deps, upserted } = setup();
    const many = Array.from({ length: 20 }, (_, i) => good(`g${i}`));
    const result = await runSource(
      fakeSource({ pages: [many, [good('x'), bad('y'), bad('z')]] }),
      full,
      deps,
    );
    expect(result.status).toBe('completed_with_errors');
    expect(upserted.map((b) => b.length)).toEqual([20]);
    expect(result.deactivated).toBeNull();
  });

  it('cancel mid-run gives cancelled, with no deactivation', async () => {
    const { store, deps, deactivations } = setup();
    const controller = new AbortController();
    const src = fakeSource({
      pages: [[good('a')], [good('b')], [good('c')]],
      onFetch: (page) => {
        if (page === 1) controller.abort();
      },
    });
    const result = await runSource(src, { ...full, signal: controller.signal }, deps);

    expect(result.status).toBe('cancelled');
    expect(result.deactivated).toBeNull();
    expect(deactivations).toHaveLength(0);
    expect(result.counts.fetched).toBe(2);
    expect(store.runs[0]).toMatchObject({ status: 'cancelled' });
    expect(store.events.map((e) => e.event_type)).toContain('cancelled');
  });

  it('cancels during the politeness delay', async () => {
    const { deps } = setup();
    const controller = new AbortController();
    const src = fakeSource({ pages: [[good('a')], [good('b')]], onFetch: () => {} });
    setTimeout(() => controller.abort(), 20);
    const result = await runSource(
      src,
      { ...full, politenessDelayMs: 5_000, signal: controller.signal },
      deps,
    );
    expect(result.status).toBe('cancelled');
    expect(result.counts.fetched).toBe(1);
  });

  it('expected_total ≠ fetched gives completed_with_errors, with no deactivation', async () => {
    const { store, deps, deactivations } = setup();
    const result = await runSource(
      fakeSource({ pages: [[good('a'), good('b')]], expectedTotal: 5 }),
      full,
      deps,
    );
    expect(result.status).toBe('completed_with_errors');
    expect(result.expectedTotal).toBe(5);
    expect(result.errorSummary).toBe('Expected 5 records, fetched 2.');
    expect(deactivations).toHaveLength(0);
    expect(store.events.map((e) => e.event_type)).toContain('expected_total_mismatch');
  });

  it('records the writer could not store give completed_with_errors and no deactivation', async () => {
    const { store, deps, deactivations } = setup();
    deps.writer.upsert = async (records) => ({
      inserted: records.length - 1,
      updated: 0,
      unchanged: 0,
      skipped_locked: 0,
      rejected: [{ key: 'b', message: 'Unknown brand x; the record was not written.' }],
    });
    const result = await runSource(fakeSource({ pages: [[good('a'), good('b')]] }), full, deps);
    expect(result.status).toBe('completed_with_errors');
    expect(result.counts.inserted).toBe(1);
    expect(deactivations).toHaveLength(0);
    const event = store.events.find((e) => e.event_type === 'records_not_written');
    expect(event?.details).toMatchObject({ examples: [{ key: 'b' }] });
  });

  it('a dry run parses everything but writes no raw files and no records', async () => {
    const { store, deps, rawStored, upserted, deactivations } = setup();
    const src = fakeSource({ pages: [[good('a')], [good('b')]] });
    const result = await runSource(src, { ...full, mode: 'dry_run' }, deps);

    expect(result.status).toBe('completed');
    expect(result.counts).toMatchObject({ fetched: 2, valid: 2, inserted: 0 });
    expect(rawStored).toHaveLength(0);
    expect(upserted).toHaveLength(0);
    expect(deactivations).toHaveLength(0);
    expect(src.parsed.map((p) => p.rawObjectId)).toEqual([null, null]);
    expect(store.runs[0]).toMatchObject({ mode: 'dry_run', status: 'completed' });
  });

  it('a sample stops at N records and never deactivates', async () => {
    const { deps, upserted, deactivations } = setup();
    const src = fakeSource({
      pages: [[good('a'), good('b')], [good('c'), good('d')], [good('e')]],
      expectedTotal: 5,
    });
    const result = await runSource(src, { ...full, mode: 'sample', sampleSize: 3 }, deps);

    expect(result.status).toBe('completed');
    expect(result.counts.fetched).toBe(3);
    expect(upserted.map((b) => b.length)).toEqual([2, 1]);
    expect(src.parsed).toHaveLength(2);
    expect(deactivations).toHaveLength(0);
  });

  it('a blocked source fails the run at once and flags an alert', async () => {
    const { store, deps } = setup();
    const src = fakeSource({
      pages: [[good('a')], [good('b')], [good('c')]],
      failOn: { page: 1, error: new SourceBlockedError(403, 'https://example.test/p?page=1') },
    });
    const result = await runSource(src, full, deps);

    expect(result.status).toBe('failed');
    expect(result.counts.fetched).toBe(1);
    expect(store.events.find((e) => e.event_type === 'run_failed')).toMatchObject({
      severity: 'error',
      details: { errorType: 'source_blocked', alert: true },
    });
  });

  it('a recoverable fetch error skips the step and ends completed_with_errors', async () => {
    const { deps } = setup();
    const src = fakeSource({
      pages: [[good('a')], [good('b')]],
      failOn: { page: 0, error: new Error('boom') },
    });
    // Page 0 fails, so its `next` never arrives: plan more than one step.
    src.plan = () => [0, 1];
    const result = await runSource(src, full, deps);
    expect(result.status).toBe('completed_with_errors');
    expect(result.counts.fetched).toBe(1);
  });

  it('a failed verifyContext fails the run before anything is fetched', async () => {
    const { deps, rawStored } = setup();
    const src = fakeSource({
      pages: [[good('a')]],
      verifyContext: () => Promise.reject(new Error('Wrong store')),
    });
    const result = await runSource(src, full, deps);
    expect(result.status).toBe('failed');
    expect(result.errorSummary).toBe('Wrong store');
    expect(rawStored).toHaveLength(0);
    expect(src.parsed).toHaveLength(0);
  });

  it('a full run that falls to 0 from the previous count fails', async () => {
    const previous: MemoryRun = {
      id: 'prev',
      source_id: 'src-1',
      job: 'fixture-import',
      job_version: '0.0.1',
      mode: 'full',
      sample_size: null,
      triggered_by: 'schedule',
      git_sha: null,
      actions_run_url: null,
      status: 'completed',
      started_at: new Date(Date.now() - 86_400_000).toISOString(),
      finished_at: new Date(Date.now() - 86_000_000).toISOString(),
      counts: {
        fetched: 40,
        valid: 40,
        invalid: 0,
        inserted: 40,
        updated: 0,
        unchanged: 0,
        skipped_locked: 0,
      },
      expected_total: null,
      error_summary: null,
    };
    const { deps, deactivations } = setup({ runs: [previous] });
    const result = await runSource(fakeSource({ pages: [[]] }), full, deps);
    expect(result.status).toBe('failed');
    expect(result.errorSummary).toMatch(/Previously had 40/);
    expect(deactivations).toHaveLength(0);
  });

  it('caps events at 50 per run, keeping the final event', async () => {
    const { store, deps } = setup();
    // Each page warns about duplicates, so 60 pages would write 60+ events uncapped.
    const pages = Array.from({ length: 60 }, (_, i) => [
      good(`p${i}-a`),
      good(`p${i}-b`),
      good(`p${i}-c`),
      good(`p${i}-a`),
    ]);
    await runSource(fakeSource({ pages }), full, deps);
    expect(store.events).toHaveLength(MAX_RUN_EVENTS);
    const last = store.events.at(-1)!;
    expect(last.event_type).toBe('run_finished');
    expect((last.details as { eventsDropped: number }).eventsDropped).toBeGreaterThan(0);
  });
});
