import type { RunMode, RunStatus } from '@sarvis/core';
import { describe, expect, it } from 'vitest';

import type { SourceCapabilities } from '../sources/source.ts';
import { chooseAutoMode, maxDeltaGapDays } from './auto-mode.ts';
import { type MemoryRun, createMemoryRunStore } from './store.ts';

const NOW = new Date('2026-11-20T07:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const caps = (c: Partial<SourceCapabilities> = {}): SourceCapabilities => ({
  supportsDelta: true,
  deltaWindowDays: 14,
  supportsDeactivation: true,
  storeSpecificPricing: false,
  ...c,
});

const source = (c?: Partial<SourceCapabilities>) => ({
  key: 'off',
  job: 'off-import',
  capabilities: caps(c),
});

let n = 0;
function run(mode: RunMode, status: RunStatus, daysAgo: number, job = 'off-import'): MemoryRun {
  return {
    id: `r${++n}`,
    source_id: 'src-off',
    job,
    job_version: '1',
    mode,
    sample_size: null,
    triggered_by: 'schedule',
    git_sha: null,
    actions_run_url: null,
    status,
    started_at: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
    finished_at: null,
    counts: {},
    expected_total: null,
    error_summary: null,
  };
}

const storeWith = (runs: MemoryRun[]) =>
  createMemoryRunStore({
    sources: [{ id: 'src-off', key: 'off', verdict: 'use', enabled: true, rate_limit_per_sec: 1 }],
    runs,
  });

describe('chooseAutoMode', () => {
  it('OFF: full after 13 days', () => {
    expect(maxDeltaGapDays(14)).toBe(13);
  });

  it('runs delta when the last completed delta is inside the window', async () => {
    const choice = await chooseAutoMode(source(), storeWith([run('delta', 'completed', 1)]), NOW);
    expect(choice).toMatchObject({ mode: 'delta', gapDays: 1 });
    expect(choice.lastCaughtUpAt).toBe('2026-11-19T07:00:00.000Z');
  });

  it('a recent full run counts as caught up, so the next day is a delta', async () => {
    const store = storeWith([run('delta', 'completed', 20), run('full', 'completed', 1)]);
    expect((await chooseAutoMode(source(), store, NOW)).mode).toBe('delta');
  });

  it('runs delta at exactly 13 days and full just past it', async () => {
    expect(
      (await chooseAutoMode(source(), storeWith([run('delta', 'completed', 13)]), NOW)).mode,
    ).toBe('delta');
    const late = await chooseAutoMode(source(), storeWith([run('delta', 'completed', 13.01)]), NOW);
    expect(late.mode).toBe('full');
    expect(late.reason).toMatch(/over 13 days/);
  });

  it('ignores failed, errored, cancelled, running, sample and dry runs', async () => {
    const store = storeWith([
      run('delta', 'completed', 15),
      run('delta', 'failed', 1),
      run('delta', 'completed_with_errors', 1),
      run('delta', 'cancelled', 1),
      run('delta', 'running', 0.1),
      run('sample', 'completed', 1),
      run('dry_run', 'completed', 1),
    ]);
    const choice = await chooseAutoMode(source(), store, NOW);
    expect(choice).toMatchObject({ mode: 'full', gapDays: 15 });
  });

  it("ignores another job's runs", async () => {
    const store = storeWith([run('delta', 'completed', 1, 'other-job')]);
    expect((await chooseAutoMode(source(), store, NOW)).mode).toBe('full');
  });

  it('runs full when there has never been a completed full or delta run', async () => {
    const choice = await chooseAutoMode(source(), storeWith([]), NOW);
    expect(choice).toEqual({
      mode: 'full',
      reason: 'no completed full or delta run',
      lastCaughtUpAt: null,
      gapDays: null,
    });
  });

  it('runs full for a source without deltas', async () => {
    const choice = await chooseAutoMode(
      source({ supportsDelta: false, deltaWindowDays: undefined }),
      storeWith([run('full', 'completed', 1)]),
      NOW,
    );
    expect(choice).toMatchObject({ mode: 'full', reason: 'no delta support' });
  });

  it('a delta source without a window stays on delta once caught up', async () => {
    const store = storeWith([run('delta', 'completed', 90)]);
    expect((await chooseAutoMode(source({ deltaWindowDays: undefined }), store, NOW)).mode).toBe(
      'delta',
    );
  });

  it('a source with no row gets full, which the driver then refuses', async () => {
    const choice = await chooseAutoMode({ ...source(), key: 'nope' }, storeWith([]), NOW);
    expect(choice.mode).toBe('full');
  });
});
