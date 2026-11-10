// Dev-project check for the legacy takeover (P4.4, D-085). Read-only. As `anon`, each legacy
// product that holds an OFF GTIN reads with OFF's values, and none of its legacy features,
// transparency steps or certifications show. The other legacy products stay legacy and hidden.
// With the service role, each taken-over row keeps its legacy record in product_sources, has no
// OFF product_sources row left, and has no open queue item.
//
//   npm run check:takeover --workspace @sarvis/pipeline
//
// Run it after an OFF run that saw these GTINs (a full run does).
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { getServiceClient } from './client.ts';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const enabled = !!process.env.SUPABASE_DEV_SERVICE_ROLE_KEY && !!url && !!anonKey;

/** Kashi Bars, Green Goodness and Scoobi Doo Pasta: the legacy products OFF also has (D-077). */
const TAKEN = ['00018627102557', '00071464316549', '00067800005093'];

describe.skipIf(!enabled)('legacy takeover (P4.4)', () => {
  const anon = createClient(url ?? '', anonKey ?? '', { auth: { persistSession: false } });
  const db = getServiceClient();

  const sourceId = async (key: string) => {
    const { data, error } = await db.from('sources').select('id').eq('key', key).single();
    if (error) throw error;
    return data.id;
  };

  it('anon reads each taken-over product with OFF values and nothing legacy', async () => {
    const off = await sourceId('off');
    const { data, error } = await anon
      .from('products')
      .select(
        'id, gtin, name, external_id, source_id, method, method_version, description, brand_id',
      )
      .in('gtin', TAKEN);
    if (error) throw error;
    expect(data.map((p) => p.gtin).sort()).toEqual([...TAKEN].sort());
    for (const p of data) {
      expect(p.source_id).toBe(off);
      expect(p.method).toBe('import');
      expect(p.method_version).toMatch(/^off@/);
      expect(p.external_id).toBe(p.gtin?.replace(/^0/, ''));
      expect(p.description).toBeNull();
      expect(p.brand_id).toBeNull();
    }
    const ids = data.map((p) => p.id);
    for (const table of ['product_features', 'transparency_steps', 'certifications'] as const) {
      const visible = await anon.from(table).select('id').in('product_id', ids);
      if (visible.error) throw visible.error;
      expect(visible.data, table).toEqual([]);
    }
    // The legacy rows are still there for admins, pending.
    const hidden = await db
      .from('product_features')
      .select('id, review_status')
      .in('product_id', ids);
    if (hidden.error) throw hidden.error;
    expect(hidden.data.every((f) => f.review_status !== 'approved')).toBe(true);
    console.log(JSON.stringify(data, null, 1));
  });

  it('each one keeps its legacy record in product_sources and has no open queue item', async () => {
    const [off, legacy] = [await sourceId('off'), await sourceId('legacy-import')];
    const { data: rows, error } = await db
      .from('products')
      .select('id, gtin, review_status, decision_method')
      .in('gtin', TAKEN);
    if (error) throw error;
    for (const p of rows) {
      expect(p.review_status).toBe('approved');
      expect(p.decision_method).toBe('auto');
      const { data: sec } = await db
        .from('product_sources')
        .select('source_id, method')
        .eq('product_id', p.id);
      expect(
        sec?.filter((s) => s.source_id === legacy && s.method === 'legacy-import'),
      ).toHaveLength(1);
      expect(sec?.filter((s) => s.source_id === off)).toHaveLength(0);
      const { data: open } = await db
        .from('review_queue')
        .select('id')
        .eq('item_table', 'products')
        .eq('item_id', p.id)
        .eq('status', 'open');
      expect(open).toEqual([]);
    }
  });

  it('the other legacy products stay legacy, pending and hidden', async () => {
    const legacy = await sourceId('legacy-import');
    const { data, error } = await db
      .from('products')
      .select('id, gtin, method, review_status')
      .eq('source_id', legacy);
    if (error) throw error;
    expect(data.length).toBeGreaterThanOrEqual(10);
    expect(data.filter((p) => TAKEN.includes(p.gtin ?? ''))).toEqual([]);
    expect(data.every((p) => p.method === 'legacy-import' && p.review_status === 'pending')).toBe(
      true,
    );
    const visible = await anon
      .from('products')
      .select('id')
      .in(
        'id',
        data.map((p) => p.id),
      );
    if (visible.error) throw visible.error;
    expect(visible.data).toEqual([]);
  });
});
