// What every writer shares: the +prov columns from a record, and the batch's resolver.
import type { Provenance, RecordKind, RecordOf } from '@sarvis/core';
import { recordKeys } from '@sarvis/core';

import type { RecordWriter, WriteContext } from '../../runs/driver.ts';
import type { ServiceClient } from '../client.ts';
import type { RecordProblem, WriteResult } from '../keyed.ts';
import { RefResolver } from '../refs.ts';

/** The +prov columns as written (DATA_MODEL §1.2). */
export interface ProvColumns {
  source_id: string;
  source_url: string | null;
  fetched_at: string;
  method: string;
  method_version: string;
  ingestion_run_id: string | null;
  raw_object_id: string | null;
}

/** A RecordWriter whose upsert also reports the records it couldn't write. */
export interface DomainWriter<K extends RecordKind> extends RecordWriter<K> {
  upsert(records: RecordOf<K>[], ctx: WriteContext): Promise<WriteResult>;
}

/** A resolver that already knows the run's own source. */
export function resolverFor(db: ServiceClient, ctx: WriteContext): RefResolver {
  const refs = new RefResolver(db);
  refs.knowSource(ctx.source.key, ctx.source.id);
  return refs;
}

export async function loadSources(
  refs: RefResolver,
  records: readonly Provenance[],
): Promise<void> {
  await refs.loadSlugs(
    'sources',
    records.map((r) => r.source_key),
  );
}

/** The +prov columns, with the run and raw object filled from the context when the record has none. */
export function provOf(
  r: Provenance,
  refs: RefResolver,
  ctx: WriteContext,
): ProvColumns | undefined {
  const sourceId = refs.slug('sources', r.source_key);
  if (!sourceId) return undefined;
  return {
    source_id: sourceId,
    source_url: r.source_url ?? null,
    fetched_at: r.fetched_at,
    method: r.method,
    method_version: r.method_version,
    ingestion_run_id: r.ingestion_run_id ?? ctx.runId,
    raw_object_id: r.raw_object_id ?? ctx.rawObjectId,
  };
}

/** The readable key of a record, for problem reports. */
export function keyOf<K extends RecordKind>(kind: K, record: RecordOf<K>): string {
  return recordKeys(kind, record)[0] ?? kind;
}

export function unknownRef(key: string, what: string): RecordProblem {
  return { key, message: `Unknown ${what}; the record was not written.` };
}
