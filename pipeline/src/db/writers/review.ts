// review_queue rows for written records that came with a `review_reason` (DATA_MODEL §3.5). Each
// fact is queued once: a fact that already has a queue row, open or resolved, isn't queued again,
// so a re-run neither duplicates work nor reopens what an admin dismissed. A row an admin decision
// froze (reviewed, merged, rejected) isn't queued either.
import type { Database } from '@sarvis/core';

import type { ServiceClient } from '../client.ts';
import type { KeyedOutcome, KeyedSpec } from '../keyed.ts';
import type { RefResolver } from '../refs.ts';
import {
  type AnyRow,
  READ_CHUNK,
  type TableName,
  chunked,
  fail,
  from,
  insertChunked,
  selectIn,
} from '../query.ts';

type ItemType = Database['public']['Tables']['review_queue']['Insert']['item_type'];

/** The queue's item type per table. Legacy facts are always `legacy_fact`. */
const ITEM_TYPES: Partial<Record<TableName, ItemType>> = {
  companies: 'company',
  brands: 'brand',
  brand_ownership: 'brand_ownership',
  company_ownership: 'company_ownership',
  company_scores: 'company_score',
  certifications: 'certification',
  company_events: 'company_event',
  products: 'product',
  product_features: 'product',
  transparency_steps: 'product',
};

export type ReviewItem = {
  item_type: string;
  item_table: TableName;
  item_id: string;
  reason: string;
};

/** The review reasons of one batch, by the payload label the writer's spec gives each record. */
export class ReviewNotes {
  private readonly notes = new Map<string, { reason: string; legacy: boolean }>();

  add(label: string, record: { review_reason?: string | null; method: string }): void {
    if (record.review_reason) {
      this.notes.set(label, {
        reason: record.review_reason,
        legacy: record.method === 'legacy-import',
      });
    }
  }

  /** Queue items for the written or matched rows that have a reason and aren't frozen. */
  items<P extends AnyRow>(spec: KeyedSpec<P>, rows: KeyedOutcome<P>['rows']): ReviewItem[] {
    return rows.flatMap(({ payload, id, stored }) => {
      const note = this.notes.get(spec.label(payload));
      if (!note || (stored && spec.frozen?.(stored))) return [];
      const type = note.legacy ? 'legacy_fact' : ITEM_TYPES[spec.table];
      if (!type) return [];
      return [
        { item_type: type, item_table: spec.table, item_id: String(id), reason: note.reason },
      ];
    });
  }
}

/** Inserts the items that have no queue row yet. Returns how many were queued. */
export async function queueForReview(db: ServiceClient, items: ReviewItem[]): Promise<number> {
  let queued = 0;
  for (const table of new Set(items.map((i) => i.item_table))) {
    const forTable = items.filter((i) => i.item_table === table);
    const existing = await selectIn(
      db,
      'review_queue',
      'id, item_id',
      'item_id',
      forTable.map((i) => i.item_id),
      (q) => q.eq('item_table', table),
    );
    const seen = new Set(existing.map((r) => r.item_id as string));
    const rows = forTable.filter((i) => !seen.has(i.item_id) && seen.add(i.item_id));
    // Only the open-item unique index can refuse a row, and then it's already queued.
    const { inserted } = await insertChunked(db, 'review_queue', rows, 'id');
    queued += inserted.length;
  }
  return queued;
}

/**
 * Sources whose rows are approved without review, by table (D-050, D-054). The one exception to
 * "imports never touch review_status" (D-052). Legacy, fixture and AI rows never take this path.
 */
export const AUTO_APPROVE: Partial<Record<TableName, readonly string[]>> = {
  products: ['off'],
  companies: ['wikidata'],
  brands: ['wikidata'],
  brand_ownership: ['wikidata'],
  company_ownership: ['wikidata'],
};

/** The ids of the table's auto-approved sources that the resolver knows (the run's own source). */
export function autoSourceIds(refs: RefResolver, table: TableName): Set<string> {
  return new Set((AUTO_APPROVE[table] ?? []).flatMap((k) => refs.slug('sources', k) ?? []));
}

/**
 * The written rows the rule approves: rows of an auto-approved source that were just inserted
 * or are still `pending`. An admin's approve or reject, a frozen row, and a stored row another
 * source wrote (legacy, AI) are left alone.
 */
export function autoApproveIds<P extends AnyRow>(
  rows: KeyedOutcome<P>['rows'],
  autoSourceIds: ReadonlySet<string>,
  frozen?: (stored: AnyRow) => boolean,
): (string | number)[] {
  return rows
    .filter(({ payload, stored }) => {
      if (!autoSourceIds.has(payload.source_id as string)) return false;
      if (!stored) return true;
      if (stored.source_id !== undefined && !autoSourceIds.has(stored.source_id as string)) {
        return false;
      }
      return stored.review_status === 'pending' && !frozen?.(stored);
    })
    .map((r) => r.id);
}

/** How an edge table limits approved current owners (the P2.4 partial unique indexes). */
export interface OwnerLimit {
  table: 'brand_ownership' | 'company_ownership';
  /** The column holding the owned side: at most one approved current owner per value. */
  child: string;
  /** Relations the index counts. */
  relations: readonly string[];
}

export const OWNER_LIMITS = {
  brand_ownership: {
    table: 'brand_ownership',
    child: 'brand_id',
    relations: ['owner', 'private_label_of'],
  },
  company_ownership: {
    table: 'company_ownership',
    child: 'child_company_id',
    relations: ['subsidiary', 'majority_stake', 'division'],
  },
} as const satisfies Record<string, OwnerLimit>;

const countsAsOwner = (limit: OwnerLimit, p: AnyRow) =>
  (p.valid_to ?? null) === null && limit.relations.includes(p.relation as string);

/**
 * Drops approvals the one-current-owner index would refuse: a current owner edge whose child
 * already has another approved current owner (an admin's pick, or an earlier run's), or that
 * shares its child with another candidate. A refused row would fail its whole update chunk.
 * Those edges stay `pending`. `approved` holds the stored approved owner edges by child.
 */
export function withinOwnerLimit<P extends AnyRow>(
  limit: OwnerLimit,
  candidates: { payload: P; id: string | number }[],
  approved: readonly AnyRow[],
): { ids: (string | number)[]; blocked: number } {
  const owners = new Map<string, Set<string>>();
  const add = (child: string, id: string | number) => {
    const set = owners.get(child) ?? new Set();
    set.add(String(id));
    owners.set(child, set);
  };
  for (const row of approved) add(row[limit.child] as string, row.id as string);
  for (const c of candidates) {
    if (countsAsOwner(limit, c.payload)) add(c.payload[limit.child] as string, c.id);
  }
  const ids: (string | number)[] = [];
  let blocked = 0;
  for (const c of candidates) {
    const set = countsAsOwner(limit, c.payload)
      ? owners.get(c.payload[limit.child] as string)
      : null;
    if (set && set.size > 1) blocked++;
    else ids.push(c.id);
  }
  return { ids, blocked };
}

/** The stored approved current owner edges of these children. */
export async function approvedOwners(
  db: ServiceClient,
  limit: OwnerLimit,
  children: readonly unknown[],
): Promise<AnyRow[]> {
  return selectIn(db, limit.table, `id, ${limit.child}`, limit.child, children, (q) =>
    q
      .eq('review_status', 'approved')
      .is('valid_to', null)
      .in('relation', [...limit.relations]),
  );
}

/**
 * The D-054 approval for one batch of edges: the auto-approved source's rows, minus the ones
 * the record held back (`auto_hold`) and the ones the owner index would refuse.
 */
export async function approveEdges<P extends AnyRow>(
  db: ServiceClient,
  limit: OwnerLimit,
  rows: KeyedOutcome<P>['rows'],
  sources: ReadonlySet<string>,
  /** Keys (`key(payload)`) of the edges whose record set `auto_hold`. */
  held: ReadonlySet<string>,
  key: (p: P) => string,
  frozen?: (stored: AnyRow) => boolean,
): Promise<{ approved: number; blocked: number }> {
  if (sources.size === 0) return { approved: 0, blocked: 0 };
  const open = rows.filter((r) => !held.has(key(r.payload)));
  const wanted = new Set(autoApproveIds(open, sources, frozen).map(String));
  const candidates = open.filter((r) => wanted.has(String(r.id)));
  const owners = candidates.filter((c) => countsAsOwner(limit, c.payload));
  const stored = await approvedOwners(
    db,
    limit,
    owners.map((c) => c.payload[limit.child]),
  );
  const { ids, blocked } = withinOwnerLimit(limit, candidates, stored);
  await approveAuto(db, limit.table, ids);
  return { approved: ids.length, blocked };
}

/** Approves the rows by rule. The `pending` guard keeps a concurrent admin decision. */
export async function approveAuto(
  db: ServiceClient,
  table: TableName,
  ids: readonly (string | number)[],
  now: Date = new Date(),
): Promise<void> {
  const patch = {
    review_status: 'approved',
    decision_method: 'auto',
    reviewed_at: now.toISOString(),
  };
  for (const chunk of chunked([...new Set(ids)], READ_CHUNK)) {
    const { error } = await from(db, table)
      .update(patch)
      .in('id', chunk)
      .eq('review_status', 'pending');
    if (error) fail(`Approving ${table}`, error);
  }
}

/** Queues a batch's review notes after its upsert. */
export async function queueNotes<P extends AnyRow>(
  db: ServiceClient,
  spec: KeyedSpec<P>,
  notes: ReviewNotes,
  outcome: KeyedOutcome<P>,
): Promise<number> {
  return queueForReview(db, notes.items(spec, outcome.rows));
}
