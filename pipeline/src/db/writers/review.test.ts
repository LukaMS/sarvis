// Which review_queue item type a written row with a review_reason gets (DATA_MODEL §3.5).
import { describe, expect, it } from 'vitest';

import type { KeyedSpec } from '../keyed.ts';
import type { AnyRow, TableName } from '../query.ts';
import { AUTO_APPROVE, ReviewNotes, autoApproveIds } from './review.ts';

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

  it('only OFF products take the path', () => {
    expect(AUTO_APPROVE).toEqual({ products: ['off'] });
  });
});
