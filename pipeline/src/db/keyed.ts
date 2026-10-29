// The write rule every entity writer shares: match each payload to an existing row by its stable
// keys, then insert it, skip it as unchanged, skip it as locked, or update only the columns that
// changed and aren't locked. Unchanged rows aren't written (apart from a seen-at `touch`).
import { CONTENT_HASH_IGNORED } from '@sarvis/core';

import type { RejectedRecord } from '../runs/driver.ts';
import type { UpsertCounts } from '../runs/progress.ts';
import { byteaHash, changedColumns } from './change.ts';
import type { ServiceClient } from './client.ts';
import { type AnyRow, type TableName, insertChunked, updateById, updateMany } from './query.ts';

/** A record that wasn't written: an unknown reference, or a row the database refused. */
export type RecordProblem = RejectedRecord;

/** What a writer reports for one batch: the run counts plus the records it couldn't write. */
export interface WriteResult extends UpsertCounts {
  rejected: RecordProblem[];
}

export function emptyWriteResult(): WriteResult {
  return { inserted: 0, updated: 0, unchanged: 0, skipped_locked: 0, rejected: [] };
}

export function mergeWriteResults(a: WriteResult, b: WriteResult): WriteResult {
  return {
    inserted: a.inserted + b.inserted,
    updated: a.updated + b.updated,
    unchanged: a.unchanged + b.unchanged,
    skipped_locked: a.skipped_locked + b.skipped_locked,
    rejected: [...a.rejected, ...b.rejected],
  };
}

/** Provenance columns that are rewritten along with a real change, but never cause one. */
const PROVENANCE_ONLY = new Set([...CONTENT_HASH_IGNORED, 'content_hash']);

export interface KeyedSpec<P extends AnyRow> {
  table: TableName;
  /** Columns to read back from existing rows; must cover every payload column used in a diff. */
  columns: string;
  /** Existing rows that might match these payloads. */
  load(db: ServiceClient, payloads: P[]): Promise<AnyRow[]>;
  /** Match keys, most specific first. Called on payloads and on stored rows alike. */
  keys(row: AnyRow): (string | null | undefined | false)[];
  /** A human-readable key for problem reports. */
  label(payload: P): string;
  /** Whether the table has `content_hash`, which is then written and compared first. */
  hashed?: boolean;
  /** Columns an update never rewrites: the match key, and set-once columns like first_seen_at. */
  keep?: readonly string[];
  /** Columns bumped on every sighting but never counted as a change (e.g. last_seen_at). */
  touch?: readonly string[];
  /** Why an admin decision (merged, rejected, reviewed) freezes this row against imports. */
  frozen?(stored: AnyRow): boolean;
  /** Stored row and payload that share a key but are different things (a slug collision). */
  conflict?(stored: AnyRow, payload: P): string | null;
}

export interface KeyedOutcome<P extends AnyRow> {
  result: WriteResult;
  /** Every written-or-matched payload with its row id (rejected ones are left out). */
  rows: { payload: P; id: string | number; stored: AnyRow | null }[];
}

function indexByKeys(spec: KeyedSpec<AnyRow>, rows: AnyRow[]): Map<string, AnyRow> {
  const index = new Map<string, AnyRow>();
  for (const row of rows) for (const k of spec.keys(row)) if (k && !index.has(k)) index.set(k, row);
  return index;
}

/** Latest value per touch column, as an ISO string compare (dates and timestamps both sort). */
function laterTouch(stored: AnyRow, payload: AnyRow, touch: readonly string[]): AnyRow | null {
  const patch: AnyRow = {};
  for (const c of touch) {
    const next = payload[c];
    const prev = stored[c];
    if (typeof next !== 'string') continue;
    if (typeof prev !== 'string' || Date.parse(next) > Date.parse(prev)) patch[c] = next;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

export async function upsertKeyed<P extends AnyRow>(
  db: ServiceClient,
  spec: KeyedSpec<P>,
  payloads: P[],
): Promise<KeyedOutcome<P>> {
  const result = emptyWriteResult();
  const rows: KeyedOutcome<P>['rows'] = [];
  if (payloads.length === 0) return { result, rows };

  const touch = spec.touch ?? [];
  const keep = new Set(['id', ...(spec.keep ?? [])]);
  const ignore = new Set([...PROVENANCE_ONLY, ...touch, ...keep]);
  const hashOmit = ['content_hash', ...touch];

  const index = indexByKeys(spec as KeyedSpec<AnyRow>, await spec.load(db, payloads));
  const inserts: P[] = [];
  const updates: { id: string | number; patch: AnyRow; payload: P; stored: AnyRow }[] = [];
  const touches = new Map<string, { ids: (string | number)[]; patch: AnyRow }>();

  for (const payload of payloads) {
    const row: AnyRow = spec.hashed
      ? { ...payload, content_hash: byteaHash(payload, hashOmit) }
      : payload;
    const stored = spec
      .keys(payload)
      .map((k) => (k ? index.get(k) : undefined))
      .find((r) => r !== undefined);
    if (!stored) {
      inserts.push(row as P);
      continue;
    }
    const id = stored.id as string | number;
    const clash = spec.conflict?.(stored, payload);
    if (clash) {
      result.rejected.push({ key: spec.label(payload), message: clash });
      continue;
    }
    rows.push({ payload, id, stored });
    if (spec.frozen?.(stored)) {
      result.skipped_locked++;
      continue;
    }

    const bump = laterTouch(stored, payload, touch);
    const touchOnly = () => {
      if (!bump) return;
      const k = JSON.stringify(bump);
      const group = touches.get(k) ?? { ids: [], patch: bump };
      group.ids.push(id);
      touches.set(k, group);
    };
    if (spec.hashed && stored.content_hash === row.content_hash) {
      result.unchanged++;
      touchOnly();
      continue;
    }

    const locked = new Set((stored.locked_fields as string[] | undefined) ?? []);
    const changed = changedColumns(stored, payload, ignore);
    const free = changed.filter((c) => !locked.has(c));
    if (free.length === 0) {
      if (changed.length > 0) result.skipped_locked++;
      else result.unchanged++;
      touchOnly();
      continue;
    }

    // The written row keeps the stored value of every locked and kept column, and its hash is
    // over what is actually stored, so a locked difference keeps showing as skipped_locked.
    const written: AnyRow = { ...payload };
    for (const c of [...locked, ...keep]) if (c in payload && c in stored) written[c] = stored[c];
    const patch: AnyRow = {};
    for (const c of free) patch[c] = payload[c];
    for (const c of PROVENANCE_ONLY) if (c in payload) patch[c] = payload[c];
    if (spec.hashed) patch.content_hash = byteaHash(written, hashOmit);
    Object.assign(patch, bump);
    updates.push({ id, patch, payload, stored });
  }

  const inserted = await insertChunked(db, spec.table, inserts, spec.columns);
  result.inserted += inserted.inserted.length;
  for (const { row, stored } of inserted.inserted)
    rows.push({ payload: row, id: stored.id as string | number, stored: null });
  for (const e of inserted.errors)
    result.rejected.push({ key: spec.label(e.row), message: e.message });

  const failed = await updateById(db, spec.table, updates);
  const failedIds = new Set(failed.map((e) => e.row.id));
  result.updated += updates.length - failed.length;
  for (const e of failed)
    result.rejected.push({ key: spec.label(e.row.payload), message: e.message });

  for (const { ids, patch } of touches.values()) {
    const live = ids.filter((id) => !failedIds.has(id));
    if (live.length > 0) await updateMany(db, spec.table, live, patch);
  }

  return { result, rows };
}
