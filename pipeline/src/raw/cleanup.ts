// Raw-retention cleanup (PLAN P6.3, DATA_MODEL §5, D-044, D-092). Deletes the raw files that have
// passed their source's retention limits (`retentionFor()`) and marks their rows (`deleted_at`);
// the rows stay as provenance. Run weekly from the `Pipeline OFF` workflow, or by hand:
//
//   npm run pipeline -- raw cleanup [--dry-run]
//
// The plan is a pure function of the live rows and the time, so it is unit-tested without a
// database. Two guards override every limit: the files of a run still `running`, and those of each
// source's newest `completed` full run (P4.9 re-parses the latest OFF full extract).
import type { ServiceClient } from '../db/client.ts';
import { DatabaseError } from '../errors.ts';
import { type Logger, logger as rootLogger } from '../log.ts';
import { deleteRawFiles, readRaw } from './store.ts';
import { type RetentionPolicy, expiresAt, retentionFor } from './retention.ts';

/** One live `raw_objects` row with what the plan needs from its source and run. */
export interface RawFile {
  id: string;
  sourceKey: string;
  storagePath: string;
  byteSize: number;
  fetchedAt: string;
  requestUrl: string | null;
  runId: string | null;
  runMode: string | null;
  runStatus: string | null;
  runStartedAt: string | null;
}

export interface Doomed {
  file: RawFile;
  reason: string;
}

export interface SourceSummary {
  files: number;
  bytes: number;
  deleteFiles: number;
  deleteBytes: number;
}

export interface CleanupPlan {
  delete: Doomed[];
  /** Runs whose files no limit may delete (still running, or the source's newest completed full run). */
  protectedRuns: { sourceKey: string; runId: string; why: string }[];
  bySource: Record<string, SourceSummary>;
}

/**
 * What a per-subject limit counts: the subject (an EDGAR company) and the unit within it (a
 * filing). Null when the URL doesn't say, and then the file is kept.
 */
export function subjectOf(
  sourceKey: string,
  requestUrl: string | null,
): { subject: string; unit: string } | null {
  if (!requestUrl) return null;
  if (sourceKey === 'sec-edgar') {
    // https://www.sec.gov/Archives/edgar/data/{cik}/{accession, 18 digits}/{document}
    const m = /\/Archives\/edgar\/data\/(\d+)\/(\d{18})\//.exec(requestUrl);
    return m?.[1] && m[2] ? { subject: `cik:${Number(m[1])}`, unit: m[2] } : null;
  }
  return null;
}

/** Sort order for timestamps, newest first; a missing time sorts last. */
const ms = (t: string | null) => (t ? Date.parse(t) : Number.NEGATIVE_INFINITY);
const newestFirst = (a: string | null, b: string | null) => Math.sign(ms(b) - ms(a)) || 0;

function policyOf(file: RawFile): RetentionPolicy {
  return retentionFor(file.sourceKey, { delta: file.runMode === 'delta' });
}

/** Which live files to delete at `now`, and why. A file goes once it passes any limit. */
export function planRawCleanup(files: readonly RawFile[], now: Date): CleanupPlan {
  const reasons = new Map<string, string>();
  const doom = (file: RawFile, reason: string) => {
    if (!reasons.has(file.id)) reasons.set(file.id, reason);
  };

  // Files of the same source and rule are counted together (OFF deltas apart from full extracts).
  const groups = new Map<string, { policy: RetentionPolicy; files: RawFile[] }>();
  for (const file of files) {
    const policy = policyOf(file);
    const key = `${file.sourceKey}\u0000${policy.rule}`;
    const group = groups.get(key) ?? { policy, files: [] };
    group.files.push(file);
    groups.set(key, group);
  }

  for (const { policy, files: group } of groups.values()) {
    if (policy.maxAge) {
      for (const file of group) {
        const expires = expiresAt(new Date(file.fetchedAt), policy);
        if (expires && expires.getTime() <= now.getTime()) {
          doom(file, `older than ${describeAge(policy)} (${policy.rule})`);
        }
      }
    }

    if (policy.keepRuns !== null) {
      const runs = new Map<string, string | null>();
      for (const f of group) if (f.runId) runs.set(f.runId, f.runStartedAt ?? f.fetchedAt);
      const kept = new Set(
        [...runs.entries()]
          .sort(([ia, a], [ib, b]) => newestFirst(a, b) || ia.localeCompare(ib))
          .slice(0, policy.keepRuns)
          .map(([id]) => id),
      );
      for (const file of group) {
        if (file.runId && !kept.has(file.runId)) {
          doom(file, `not among the last ${policy.keepRuns} runs (${policy.rule})`);
        }
      }
    }

    if (policy.keepPerSubject !== null) {
      const bySubject = new Map<string, Map<string, RawFile[]>>();
      for (const file of group) {
        const s = subjectOf(file.sourceKey, file.requestUrl);
        if (!s) continue;
        const units = bySubject.get(s.subject) ?? new Map<string, RawFile[]>();
        units.set(s.unit, [...(units.get(s.unit) ?? []), file]);
        bySubject.set(s.subject, units);
      }
      for (const units of bySubject.values()) {
        const newestOf = (fs: RawFile[]) =>
          fs.reduce<string | null>(
            (m, f) => (newestFirst(f.fetchedAt, m) < 0 ? f.fetchedAt : m),
            null,
          );
        const ranked = [...units.entries()].sort(
          ([ua, a], [ub, b]) => newestFirst(newestOf(a), newestOf(b)) || ub.localeCompare(ua),
        );
        ranked.forEach(([, unitFiles], i) => {
          if (i >= policy.keepPerSubject!) {
            for (const f of unitFiles) {
              doom(f, `not among the last ${policy.keepPerSubject} per subject (${policy.rule})`);
            }
            return;
          }
          // A kept filing keeps one copy of each document: the newest.
          const seen = new Set<string>();
          for (const f of [...unitFiles].sort(
            (a, b) =>
              newestFirst(a.fetchedAt, b.fetchedAt) || newestFirst(a.runStartedAt, b.runStartedAt),
          )) {
            const url = f.requestUrl ?? f.id;
            if (seen.has(url)) doom(f, `an older copy of a kept file (${policy.rule})`);
            seen.add(url);
          }
        });
      }
    }
  }

  // Guards: a running run, and each source's newest completed full run.
  const protectedRuns = new Map<string, { sourceKey: string; runId: string; why: string }>();
  const latestFull = new Map<string, RawFile>();
  for (const file of files) {
    if (!file.runId) continue;
    if (file.runStatus === 'running') {
      protectedRuns.set(file.runId, {
        sourceKey: file.sourceKey,
        runId: file.runId,
        why: 'still running',
      });
    }
    if (file.runMode === 'full' && file.runStatus === 'completed') {
      const best = latestFull.get(file.sourceKey);
      if (!best || newestFirst(file.runStartedAt, best.runStartedAt) < 0) {
        latestFull.set(file.sourceKey, file);
      }
    }
  }
  for (const [sourceKey, file] of latestFull) {
    if (file.runId && !protectedRuns.has(file.runId)) {
      protectedRuns.set(file.runId, {
        sourceKey,
        runId: file.runId,
        why: 'newest completed full run',
      });
    }
  }

  const doomed: Doomed[] = [];
  const bySource: Record<string, SourceSummary> = {};
  for (const file of files) {
    const s = (bySource[file.sourceKey] ??= { files: 0, bytes: 0, deleteFiles: 0, deleteBytes: 0 });
    s.files += 1;
    s.bytes += file.byteSize;
    const reason = reasons.get(file.id);
    if (!reason || (file.runId && protectedRuns.has(file.runId))) continue;
    doomed.push({ file, reason });
    s.deleteFiles += 1;
    s.deleteBytes += file.byteSize;
  }
  return { delete: doomed, protectedRuns: [...protectedRuns.values()], bySource };
}

function describeAge(policy: RetentionPolicy): string {
  const age = policy.maxAge!;
  return 'days' in age ? `${age.days} days` : `${age.months} months`;
}

const PAGE = 1000;

interface RawRowWithJoins {
  id: string;
  storage_path: string;
  byte_size: number;
  fetched_at: string;
  request_url: string | null;
  run_id: string | null;
  sources: { key: string } | null;
  ingestion_runs: { mode: string; status: string; started_at: string } | null;
}

/** Every live raw file (not yet deleted), in id order. */
export async function loadRawFiles(db: ServiceClient): Promise<RawFile[]> {
  const out: RawFile[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from('raw_objects')
      .select(
        'id, storage_path, byte_size, fetched_at, request_url, run_id, sources(key), ingestion_runs(mode, status, started_at)',
      )
      .is('deleted_at', null)
      .order('id')
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) throw new DatabaseError(`Reading raw_objects failed: ${error.message}`, error);
    const rows = (data ?? []) as unknown as RawRowWithJoins[];
    for (const r of rows) {
      if (!r.sources) throw new DatabaseError(`Raw object ${r.id} has no source.`);
      out.push({
        id: r.id,
        sourceKey: r.sources.key,
        storagePath: r.storage_path,
        byteSize: r.byte_size,
        fetchedAt: r.fetched_at,
        requestUrl: r.request_url,
        runId: r.run_id,
        runMode: r.ingestion_runs?.mode ?? null,
        runStatus: r.ingestion_runs?.status ?? null,
        runStartedAt: r.ingestion_runs?.started_at ?? null,
      });
    }
    if (rows.length < PAGE) return out;
  }
}

export interface CleanupResult {
  dryRun: boolean;
  plan: CleanupPlan;
  deleted: number;
  /** One file of each protected run, read back with readRaw after the deletes. */
  readBack: { runId: string; sourceKey: string; rawObjectId: string }[];
}

/**
 * Plans and (unless `dryRun`) applies the cleanup, then reads one file of every protected run back
 * with readRaw, so a cleanup that broke the latest extract fails loudly.
 */
export async function cleanupRaw(
  db: ServiceClient,
  options: { dryRun: boolean; now?: Date; log?: Logger },
): Promise<CleanupResult> {
  const log = options.log ?? rootLogger;
  const files = await loadRawFiles(db);
  const plan = planRawCleanup(files, options.now ?? new Date());
  log.info('raw cleanup planned', {
    dryRun: options.dryRun,
    liveFiles: files.length,
    toDelete: plan.delete.length,
    bytesFreed: plan.delete.reduce((n, d) => n + d.file.byteSize, 0),
  });

  let deleted = 0;
  if (!options.dryRun && plan.delete.length > 0) {
    deleted = await deleteRawFiles(
      db,
      plan.delete.map((d) => ({ id: d.file.id, storagePath: d.file.storagePath })),
    );
  }

  const readBack: CleanupResult['readBack'] = [];
  if (!options.dryRun) {
    for (const run of plan.protectedRuns) {
      const first = files
        .filter((f) => f.runId === run.runId)
        .sort((a, b) => a.storagePath.localeCompare(b.storagePath))[0];
      if (!first) continue;
      await readRaw(db, first.id);
      readBack.push({ runId: run.runId, sourceKey: run.sourceKey, rawObjectId: first.id });
    }
  }
  return { dryRun: options.dryRun, plan, deleted, readBack };
}

/** The run-level listing the CLI prints: one line per run (or adhoc group) and reason. */
export function describePlan(plan: CleanupPlan): string[] {
  const groups = new Map<
    string,
    { sourceKey: string; run: string; reason: string; files: number; bytes: number }
  >();
  for (const { file, reason } of plan.delete) {
    const run = file.runId
      ? `${file.runId.slice(0, 8)} ${file.runMode ?? '?'} ${(file.runStartedAt ?? '').slice(0, 10)}`
      : 'adhoc';
    const key = `${file.sourceKey}\u0000${run}\u0000${reason}`;
    const g = groups.get(key) ?? { sourceKey: file.sourceKey, run, reason, files: 0, bytes: 0 };
    g.files += 1;
    g.bytes += file.byteSize;
    groups.set(key, g);
  }
  return [...groups.values()]
    .sort((a, b) => a.sourceKey.localeCompare(b.sourceKey) || a.run.localeCompare(b.run))
    .map(
      (g) =>
        `  ${g.sourceKey.padEnd(17)} ${g.run.padEnd(30)} ${String(g.files).padStart(5)} files ${kb(g.bytes).padStart(9)}  ${g.reason}`,
    );
}

export function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}
