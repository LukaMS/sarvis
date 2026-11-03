// Which review_queue item type a written row with a review_reason gets (DATA_MODEL §3.5).
import { describe, expect, it } from 'vitest';

import type { ServiceClient } from '../client.ts';
import type { KeyedSpec } from '../keyed.ts';
import type { AnyRow, TableName } from '../query.ts';
import {
  AUTO_APPROVE,
  OWNER_LIMITS,
  ReviewNotes,
  approveEdges,
  autoApproveIds,
  withinOwnerLimit,
} from './review.ts';

type Payload = { slug: string };

const spec = (table: TableName): KeyedSpec<Payload> => ({
  table,
  columns: 'id, slug, status',
  load: async () => [],
  keys: (row: AnyRow) => [row.slug as string],
  label: (p) => p.slug,
  frozen: (stored) => stored.status === 'rejected',
});

const row = (slug: string, stored: AnyRow | null = null) => ({
  payload: { slug },
  id: slug,
  stored,
});

describe('ReviewNotes', () => {
  it('queues non-legacy companies and brands under their own item types (P3.2)', () => {
    for (const [table, type] of [
      ['companies', 'company'],
      ['brands', 'brand'],
    ] as const) {
      const notes = new ReviewNotes();
      notes.add('a', { review_reason: 'check the owner', method: 'api' });
      expect(notes.items(spec(table), [row('a')])).toEqual([
        { item_type: type, item_table: table, item_id: 'a', reason: 'check the owner' },
      ]);
    }
  });

  it('keeps legacy facts as legacy_fact', () => {
    const notes = new ReviewNotes();
    notes.add('a', { review_reason: 'legacy', method: 'legacy-import' });
    expect(notes.items(spec('companies'), [row('a')])[0]?.item_type).toBe('legacy_fact');
  });

  it('skips rows without a reason and rows an admin decision froze', () => {
    const notes = new ReviewNotes();
    notes.add('a', { review_reason: null, method: 'api' });
    notes.add('b', { review_reason: 'why', method: 'api' });
    expect(
      notes.items(spec('brands'), [row('a'), row('b', { slug: 'b', status: 'rejected' })]),
    ).toEqual([]);
  });
});

describe('autoApproveIds (D-050, D-054)', () => {
  const OFF = 'src-off';
  const auto = new Set([OFF]);
  const frozen = (stored: AnyRow) => stored.status === 'rejected';
  const written = (id: string, source: string, stored: AnyRow | null = null) => ({
    payload: { source_id: source },
    id,
    stored,
  });

  it('approves OFF rows that were just inserted or are still pending', () => {
    const rows = [
      written('new', OFF),
      written('pending', OFF, { review_status: 'pending', status: 'active' }),
      written('approved', OFF, { review_status: 'approved', status: 'active' }),
      written('admin-rejected', OFF, { review_status: 'rejected', status: 'active' }),
      written('frozen', OFF, { review_status: 'pending', status: 'rejected' }),
    ];
    expect(autoApproveIds(rows, auto, frozen)).toEqual(['new', 'pending']);
  });

  it('leaves legacy-import and fixture rows pending', () => {
    const rows = [
      written('legacy', 'src-legacy-import'),
      written('fixture', 'src-fixture'),
      written('legacy-pending', 'src-legacy-import', { review_status: 'pending' }),
    ];
    expect(autoApproveIds(rows, auto, frozen)).toEqual([]);
  });

  it('leaves a stored row another source wrote alone', () => {
    const rows = [
      written('legacy-row', OFF, { review_status: 'pending', source_id: 'src-legacy' }),
    ];
    expect(autoApproveIds(rows, auto, frozen)).toEqual([]);
  });

  it('only OFF products and Wikidata entities and edges take the path', () => {
    expect(AUTO_APPROVE).toEqual({
      products: ['off'],
      companies: ['wikidata'],
      brands: ['wikidata'],
      brand_ownership: ['wikidata'],
      company_ownership: ['wikidata'],
    });
  });
});

describe('Wikidata edge approval (D-054)', () => {
  const WD = 'src-wikidata';
  type Edge = { brand_id: string; relation: string; valid_to: string | null; source_id: string };
  const edge = (
    id: string,
    brand: string,
    o: Partial<Edge> = {},
    stored: AnyRow | null = null,
  ) => ({
    id,
    payload: { brand_id: brand, relation: 'owner', valid_to: null, source_id: WD, ...o },
    stored,
  });

  /** Serves the approved-owner read and records the approving update. */
  function fakeDb(approved: AnyRow[]) {
    const updates: { table: string; ids: unknown[] }[] = [];
    const read = {
      in: () => read,
      eq: () => read,
      is: () => read,
      order: () => read,
      range: () => Promise.resolve({ data: approved, error: null }),
    };
    const db = {
      from: (table: string) => ({
        select: () => read,
        update: () => ({
          in: (_c: string, ids: unknown[]) => ({
            eq: () => {
              updates.push({ table, ids });
              return Promise.resolve({ error: null });
            },
          }),
        }),
      }),
    } as unknown as ServiceClient;
    return { db, updates };
  }
  const key = (p: Edge) => `${p.brand_id}:${p.valid_to ?? ''}`;
  const reviewed = (stored: AnyRow) => stored.review_status !== 'pending';

  it('approves the pick, history and a confirmed pending row; holds the rest', async () => {
    const { db, updates } = fakeDb([]);
    const rows = [
      edge('pick', 'b1'),
      edge('history', 'b1', { valid_to: '2018-01-01' }),
      edge('lost', 'b2'), // auto_hold: lost or tied the pick
      edge('confirmed', 'b3', {}, { review_status: 'pending', source_id: WD }),
      edge('rejected', 'b4', {}, { review_status: 'rejected', source_id: WD }),
    ];
    const out = await approveEdges(
      db,
      OWNER_LIMITS.brand_ownership,
      rows,
      new Set([WD]),
      new Set(['b2:']),
      key,
      reviewed,
    );
    expect(out).toEqual({ approved: 3, blocked: 0 });
    // Only rows in the batch: a stale pending row from an earlier run is never named.
    expect(updates).toEqual([{ table: 'brand_ownership', ids: ['pick', 'history', 'confirmed'] }]);
  });

  it("never adds a second approved current owner, and skips other sources' runs", async () => {
    const { db, updates } = fakeDb([{ id: 'admin-pick', brand_id: 'b1' }]);
    const out = await approveEdges(
      db,
      OWNER_LIMITS.brand_ownership,
      [edge('pick', 'b1'), edge('history', 'b1', { valid_to: '2018-01-01' })],
      new Set([WD]),
      new Set(),
      key,
      reviewed,
    );
    expect(out).toEqual({ approved: 1, blocked: 1 });
    expect(updates).toEqual([{ table: 'brand_ownership', ids: ['history'] }]);
    expect(
      await approveEdges(
        db,
        OWNER_LIMITS.brand_ownership,
        [edge('x', 'b9')],
        new Set(),
        new Set(),
        key,
      ),
    ).toEqual({ approved: 0, blocked: 0 });
  });

  it('counts only controlling current parents against a company', () => {
    const limit = OWNER_LIMITS.company_ownership;
    const c = (id: string, relation: string, valid_to: string | null = null) => ({
      id,
      payload: { child_company_id: 'c1', relation, valid_to },
    });
    const out = withinOwnerLimit(
      limit,
      [
        c('a', 'subsidiary'),
        c('b', 'majority_stake'),
        c('m', 'minority_stake'),
        c('h', 'subsidiary', '2001-01-01'),
      ],
      [],
    );
    // Two current controlling candidates for one child: neither is approved.
    expect(out).toEqual({ ids: ['m', 'h'], blocked: 2 });
  });
});
