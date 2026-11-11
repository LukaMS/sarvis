// The fixture job (P4.7): the smallest real derived job, for the runner's tests. It reads the
// `fixture` source's active products whose size is `unparsed` and that have a quantity text, runs
// `parseSize` on the text, and writes the size where it now reads `ok`. Rows it still can't read
// stay `unparsed` and count as unchanged, so a second run updates nothing. It never touches another
// source's rows, so `pipeline job fixture` on dev is harmless.
import { type NetUnit, parseSize } from '@sarvis/core';

import type { ServiceClient } from '../db/client.ts';
import { ConfigurationError, DatabaseError } from '../errors.ts';
import { type UpsertCounts, emptyUpsertCounts } from '../runs/progress.ts';
import { FIXTURE_KEY } from '../sources/fixture/index.ts';
import type { Job } from './job.ts';

export const FIXTURE_JOB_NAME = 'fixture';
export const FIXTURE_JOB_VERSION = '1.0.0';
/** The fields the job writes. A row with any of them in `locked_fields` is left alone. */
export const FIXTURE_JOB_FIELDS = ['net_quantity', 'net_unit', 'pack_count', 'unit_parse_status'];

export interface FixtureJobRow {
  id: string;
  quantity_text: string | null;
  locked_fields: string[];
}

export interface FixtureJobChange {
  id: string;
  net_quantity: number;
  net_unit: NetUnit;
  pack_count: number | null;
  locked: boolean;
}

/** Where the job reads and writes: the dev database, or memory in the unit tests. */
export interface FixtureJobTable {
  prepare?(): Promise<void>;
  /** Up to `limit` rows that need work with an id above `after`, in id order. */
  read(after: string | null, limit: number): Promise<FixtureJobRow[]>;
  /** Writes the unlocked changes; returns how many rows changed. */
  write(changes: FixtureJobChange[]): Promise<number>;
}

export function createFixtureJob(
  table: FixtureJobTable,
  opts: { batchSize?: number } = {},
): Job<FixtureJobRow, FixtureJobChange> {
  let unreadable = 0;
  return {
    name: FIXTURE_JOB_NAME,
    version: FIXTURE_JOB_VERSION,
    batchSize: opts.batchSize ?? 5,
    async prepare() {
      unreadable = 0;
      await table.prepare?.();
    },
    read: (after, limit) => table.read(after, limit),
    idOf: (row) => row.id,
    work(rows) {
      const changes: FixtureJobChange[] = [];
      for (const row of rows) {
        const size = parseSize(row.quantity_text);
        if (size.unit_parse_status !== 'ok' || size.net_quantity === null || !size.net_unit) {
          unreadable++;
          continue;
        }
        changes.push({
          id: row.id,
          net_quantity: size.net_quantity,
          net_unit: size.net_unit,
          pack_count: size.pack_count,
          locked: row.locked_fields.some((f) => FIXTURE_JOB_FIELDS.includes(f)),
        });
      }
      return { changes, unchanged: rows.length - changes.length };
    },
    async write(changes): Promise<UpsertCounts> {
      const open = changes.filter((c) => !c.locked);
      const updated = open.length > 0 ? await table.write(open) : 0;
      return {
        ...emptyUpsertCounts(),
        updated,
        // A row read as needing work but changed by someone else meanwhile.
        unchanged: open.length - updated,
        skipped_locked: changes.length - open.length,
      };
    },
    finish: () => [
      {
        severity: 'info',
        eventType: 'fixture_job_summary',
        message: `${unreadable} row(s) still unparsed.`,
        details: { unreadable },
      },
    ],
  };
}

/** The fixture job's table on the dev database: the `fixture` source's products. */
export function supabaseFixtureTable(db: ServiceClient): FixtureJobTable {
  let sourceId: string | null = null;
  return {
    async prepare() {
      const { data, error } = await db
        .from('sources')
        .select('id')
        .eq('key', FIXTURE_KEY)
        .maybeSingle();
      if (error) throw new DatabaseError(error.message);
      if (!data) throw new ConfigurationError(`Source ${FIXTURE_KEY} has no row in sources.`);
      sourceId = data.id;
    },
    async read(after, limit) {
      if (!sourceId) throw new ConfigurationError('Fixture job read before prepare.');
      let q = db
        .from('products')
        .select('id, quantity_text, locked_fields')
        .eq('source_id', sourceId)
        .eq('status', 'active')
        .eq('unit_parse_status', 'unparsed')
        .not('quantity_text', 'is', null)
        .order('id')
        .limit(limit);
      if (after !== null) q = q.gt('id', after);
      const { data, error } = await q;
      if (error) throw new DatabaseError(error.message);
      return data;
    },
    async write(changes) {
      let updated = 0;
      for (const c of changes) {
        // Still unparsed: a row another writer settled meanwhile is left as it is.
        const { data, error } = await db
          .from('products')
          .update({
            net_quantity: c.net_quantity,
            net_unit: c.net_unit,
            pack_count: c.pack_count,
            unit_parse_status: 'ok',
          })
          .eq('id', c.id)
          .eq('unit_parse_status', 'unparsed')
          .select('id');
        if (error) throw new DatabaseError(error.message);
        updated += data.length;
      }
      return updated;
    },
  };
}
