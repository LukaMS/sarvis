// `--mode auto` (P6.1): what the scheduled workflow runs. A source with deltas runs `delta` while
// its delta window still reaches back to the last clean full or delta run, and `full` once it no
// longer does (or it has never had one). A source without deltas always runs `full`.
import type { Source } from '../sources/source.ts';
import type { RunStore } from './store.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AutoModeChoice {
  mode: 'full' | 'delta';
  reason: string;
  /** Start of the newest completed full or delta run, ISO, or null. */
  lastCaughtUpAt: string | null;
  /** Days since then, to one decimal, or null. */
  gapDays: number | null;
}

/**
 * The gap that still fits: the window less a day, so a run that starts late, or a delta file that
 * leaves the index early, can't open a hole. OFF: 14-day index → full after 13 days.
 */
export function maxDeltaGapDays(windowDays: number): number {
  return Math.max(windowDays - 1, 0);
}

export async function chooseAutoMode(
  source: Pick<Source, 'key' | 'job' | 'capabilities'>,
  store: Pick<RunStore, 'loadSource' | 'lastCaughtUpAt'>,
  now: Date = new Date(),
): Promise<AutoModeChoice> {
  if (!source.capabilities.supportsDelta) {
    return { mode: 'full', reason: 'no delta support', lastCaughtUpAt: null, gapDays: null };
  }
  const row = await store.loadSource(source.key);
  // No row: the driver refuses the run with its own message, whichever mode is passed.
  const last = row ? await store.lastCaughtUpAt(row.id, source.job) : null;
  if (!last) {
    return {
      mode: 'full',
      reason: 'no completed full or delta run',
      lastCaughtUpAt: null,
      gapDays: null,
    };
  }
  const gapDays = Math.round(((now.getTime() - last.getTime()) / DAY_MS) * 10) / 10;
  const window = source.capabilities.deltaWindowDays;
  const lastCaughtUpAt = last.toISOString();
  if (window !== undefined && now.getTime() - last.getTime() > maxDeltaGapDays(window) * DAY_MS) {
    return {
      mode: 'full',
      reason: `last completed full or delta run is over ${maxDeltaGapDays(window)} days old (window ${window})`,
      lastCaughtUpAt,
      gapDays,
    };
  }
  return { mode: 'delta', reason: 'inside the delta window', lastCaughtUpAt, gapDays };
}
