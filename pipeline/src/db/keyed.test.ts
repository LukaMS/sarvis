// upsertKeyed's creator rule (P4.10, D-095): the source that created a row keeps its +prov block.
import { describe, expect, it } from 'vitest';

import type { ServiceClient } from './client.ts';
import { type KeyedSpec, isForeign, upsertKeyed } from './keyed.ts';
import type { AnyRow } from './query.ts';

/** Records inserts and updates; inserts come back with ids `new-0`, `new-1` …. */
function fakeDb() {
  const inserts: AnyRow[] = [];
  const updates: { id: unknown; patch: AnyRow }[] = [];
  const db = {
    from: () => ({
      insert: (rows: AnyRow[]) => ({
        select: () => {
          const data = rows.map((_, i) => ({ id: `new-${inserts.length + i}` }));
          inserts.push(...rows);
          return Promise.resolve({ data, error: null });
        },
      }),
      update: (patch: AnyRow) => ({
        eq: (_c: string, id: unknown) => {
          updates.push({ id, patch });
          return Promise.resolve({ error: null });
        },
        in: (_c: string, ids: unknown[]) => {
          for (const id of ids) updates.push({ id, patch });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  } as unknown as ServiceClient;
  return { db, inserts, updates };
}

const A = 'source-a';
const B = 'source-b';
const prov = (source_id: string) => ({
  source_id,
  source_url: `https://${source_id}.test/x`,
  method: 'api',
  fetched_at: '2026-11-11T12:00:00Z',
  method_version: `${source_id}@1`,
  ingestion_run_id: `run-${source_id}`,
  raw_object_id: null,
});

const stored = { id: 'r1', slug: 'acme', name: 'Acme', website: null, ...prov(A) };

function spec(creator?: KeyedSpec<AnyRow>['creator']): KeyedSpec<AnyRow> {
  return {
    table: 'companies',
    columns: 'id',
    load: () => Promise.resolve([{ ...stored }]),
    keys: (r) => [`slug:${r.slug as string}`],
    label: (p) => p.slug as string,
    keep: ['slug'],
    creator,
  };
}

describe('isForeign', () => {
  it('compares source ids only when both sides have one', () => {
    expect(isForeign({ source_id: A }, { source_id: B })).toBe(true);
    expect(isForeign({ source_id: A }, { source_id: A })).toBe(false);
    expect(isForeign({}, { source_id: B })).toBe(false);
  });
});

describe('upsertKeyed creator rule', () => {
  it('without the rule, another source takes over the +prov block (the old behaviour)', async () => {
    const { db, updates } = fakeDb();
    const out = await upsertKeyed(db, spec(), [{ slug: 'acme', name: 'Acme', ...prov(B) }]);
    expect(out.result.updated).toBe(1);
    expect(updates[0]?.patch).toMatchObject({ source_id: B, method_version: `${B}@1` });
  });

  it('keep_prov: a foreign field change is written, the +prov block is not', async () => {
    const { db, updates } = fakeDb();
    const out = await upsertKeyed(db, spec('keep_prov'), [
      { slug: 'acme', name: 'Acme', website: 'https://acme.test/', ...prov(B) },
    ]);
    expect(out.result).toMatchObject({ updated: 1, unchanged: 0 });
    expect(updates).toEqual([{ id: 'r1', patch: { website: 'https://acme.test/' } }]);
  });

  it('keep_prov: a foreign record that differs only in provenance is unchanged', async () => {
    const { db, updates } = fakeDb();
    const out = await upsertKeyed(db, spec('keep_prov'), [
      { slug: 'acme', name: 'Acme', ...prov(B) },
    ]);
    expect(out.result).toMatchObject({ updated: 0, unchanged: 1 });
    expect(updates).toEqual([]);
  });

  it('keep_prov: the creating source still rewrites its own provenance with a change', async () => {
    const { db, updates } = fakeDb();
    await upsertKeyed(db, spec('keep_prov'), [
      { slug: 'acme', name: 'Acme Inc', ...prov(A), method_version: `${A}@2` },
    ]);
    expect(updates[0]?.patch).toMatchObject({ name: 'Acme Inc', method_version: `${A}@2` });
  });

  it('keep_row: a foreign record touches nothing and comes back marked foreign', async () => {
    const { db, updates, inserts } = fakeDb();
    const out = await upsertKeyed(db, spec('keep_row'), [
      { slug: 'acme', name: 'Other name', ...prov(B) },
      { slug: 'new', name: 'New', ...prov(B) },
    ]);
    expect(out.result).toMatchObject({ inserted: 1, updated: 0, unchanged: 1 });
    expect(updates).toEqual([]);
    expect(inserts.map((r) => r.slug)).toEqual(['new']);
    expect(out.rows.map((r) => [r.id, r.foreign ?? false])).toEqual([
      ['r1', true],
      ['new-0', false],
    ]);
  });
});
