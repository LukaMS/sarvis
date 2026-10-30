// review_queue rows for written records that came with a `review_reason` (DATA_MODEL §3.5). Each
// fact is queued once: a fact that already has a queue row, open or resolved, isn't queued again,
// so a re-run neither duplicates work nor reopens what an admin dismissed. A row an admin decision
// froze (reviewed, merged, rejected) isn't queued either.
import type { Database } from '@sarvis/core';

import type { ServiceClient } from '../client.ts';
import type { KeyedOutcome, KeyedSpec } from '../keyed.ts';
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
};

/**
 * The written rows the rule approves: rows of an auto-approved source that were just inserted
 * or are still `pending`. An admin's approve or reject, and a frozen row, are left alone.
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
      return stored.review_status === 'pending' && !frozen?.(stored);
    })
    .map((r) => r.id);
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
