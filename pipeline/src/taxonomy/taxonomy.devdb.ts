// Dev-project check of the taxonomy seed (P4.8, D-090). Read-only.
//
//   npm run check:taxonomy --workspace @sarvis/pipeline
//
// - The stored categories and mappings are the tree in `tree.ts`, row for row.
// - Every category has a parent chain to an aisle, and no mapping points at a missing node.
// - As `anon`, the categories and the approved mappings are readable.
// - Every StatCan product label in `reference_prices` maps to a node.
// - Coverage: the latest completed full OFF run's stored extracts are read back (`readRaw`), and
//   each categorised product is run through `pickCategory` with the stored mappings. Prints the
//   share mapped, by level and by aisle, and the most common tags of what is left. Fails under 95%.
import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';

import { getServiceClient } from '../db/client.ts';
import { readRaw } from '../raw/store.ts';
import { parseExtract } from '../sources/off/csv.ts';
import { OFF_JOB, OFF_KEY } from '../sources/off/index.ts';
import { type TagMapping, pickCategory, splitTags } from './assign.ts';
import {
  TAXONOMY_METHOD_VERSION,
  flattenTaxonomy,
  offTagMappings,
  statcanMappings,
} from './tree.ts';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const enabled = !!process.env.SUPABASE_DEV_SERVICE_ROLE_KEY && !!url && !!anonKey;
const PAGE = 1000;
const STATCAN_KEY = 'statcan-18100245';

const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(2)}%`;

describe.skipIf(!enabled)('taxonomy seed on dev (P4.8)', () => {
  const db = getServiceClient();
  const anon = createClient(url ?? '', anonKey ?? '', { auth: { persistSession: false } });
  const report: string[] = [];
  afterAll(() => console.log(report.join('\n')));

  async function all<T>(
    query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  ): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await query(from, from + PAGE - 1);
      if (error) throw error;
      out.push(...(data ?? []));
      if ((data ?? []).length < PAGE) return out;
    }
  }

  async function sourceId(key: string): Promise<string> {
    const { data, error } = await db.from('sources').select('id').eq('key', key).single();
    if (error) throw error;
    return data.id;
  }

  async function mappingsOf(key: string) {
    const source = await sourceId(key);
    return all((from, to) =>
      db
        .from('category_mappings')
        .select(
          'source_category_key, confidence, review_status, decision_method, method, method_version, categories(slug)',
        )
        .eq('source_id', source)
        .order('id')
        .range(from, to),
    );
  }

  it('stores the tree: every node, its parent and level, and the sold-loose marks', async () => {
    const stored = await all((from, to) =>
      db
        .from('categories')
        .select('id, slug, name, level, parent_id, sort_order, sold_loose')
        .order('slug')
        .range(from, to),
    );
    const byId = new Map(stored.map((c) => [c.id, c]));
    const tree = flattenTaxonomy();
    expect(stored.map((c) => c.slug).sort()).toEqual(tree.map((r) => r.slug).sort());
    const bySlug = new Map(stored.map((c) => [c.slug, c]));
    for (const r of tree) {
      const c = bySlug.get(r.slug)!;
      expect({ name: c.name, level: c.level, sort: c.sort_order, loose: c.sold_loose }).toEqual({
        name: r.name,
        level: r.level,
        sort: r.sortOrder,
        loose: r.soldLoose,
      });
      expect(c.parent_id ? byId.get(c.parent_id)?.slug : null).toBe(r.parentSlug);
    }
    // Every node reaches an aisle (level 0) through its parents.
    const broken = stored.filter((c) => {
      let at = c;
      for (let hops = 0; at.parent_id && hops < 5; hops++) at = byId.get(at.parent_id) ?? at;
      return at.level !== 0 || at.parent_id !== null;
    });
    expect(broken).toEqual([]);
    const levels = [0, 1, 2].map((l) => stored.filter((c) => c.level === l).length);
    report.push(
      `categories: ${stored.length} (aisles ${levels[0]}, groups ${levels[1]}, leaves ${levels[2]}), ` +
        `sold loose ${stored.filter((c) => c.sold_loose).length}`,
    );
  });

  it('stores every OFF and StatCan mapping, approved, as derived reference data', async () => {
    for (const [key, expected] of [
      [OFF_KEY, offTagMappings()],
      [STATCAN_KEY, statcanMappings()],
    ] as const) {
      const stored = await mappingsOf(key);
      const got = stored
        .map((m) => `${m.source_category_key} → ${m.categories?.slug} @${Number(m.confidence)}`)
        .sort();
      const want = expected.map((m) => `${m.key} → ${m.slug} @${m.confidence}`).sort();
      expect(got).toEqual(want);
      expect(stored.every((m) => m.categories !== null)).toBe(true);
      expect(
        stored.every(
          (m) =>
            m.review_status === 'approved' &&
            m.decision_method === 'auto' &&
            m.method === 'derived' &&
            m.method_version === TAXONOMY_METHOD_VERSION,
        ),
      ).toBe(true);
      report.push(`${key} mappings: ${stored.length}`);
    }
  });

  it('lets anon read the categories and the approved mappings', async () => {
    const cats = await anon.from('categories').select('id', { count: 'exact', head: true });
    expect(cats.error).toBeNull();
    expect(cats.count).toBe(flattenTaxonomy().length);
    const maps = await anon.from('category_mappings').select('id', { count: 'exact', head: true });
    expect(maps.error).toBeNull();
    expect(maps.count).toBe(offTagMappings().length + statcanMappings().length);
  });

  it('maps every StatCan product label', async () => {
    const labels = await all((from, to) =>
      db.from('reference_prices').select('product_label').order('id').range(from, to),
    );
    const distinct = [...new Set(labels.map((l) => l.product_label))];
    const mapped = new Set(statcanMappings().map((m) => m.key));
    expect(distinct.length).toBeGreaterThan(0);
    expect(distinct.filter((l) => !mapped.has(l))).toEqual([]);
    report.push(`StatCan labels: ${distinct.length}, all mapped`);
  });

  it('maps at least 95% of the categorised OFF products', { timeout: 600_000 }, async () => {
    const off = await sourceId(OFF_KEY);
    const runs = await db
      .from('ingestion_runs')
      .select('id, started_at')
      .eq('source_id', off)
      .eq('job', OFF_JOB)
      .eq('mode', 'full')
      .eq('status', 'completed')
      .is('sample_size', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();
    if (runs.error) throw runs.error;
    const raws = await db
      .from('raw_objects')
      .select('id')
      .eq('run_id', runs.data.id)
      .is('deleted_at', null)
      .order('storage_path');
    if (raws.error) throw raws.error;

    const index = new Map<string, TagMapping>();
    for (const m of await mappingsOf(OFF_KEY)) {
      index.set(m.source_category_key, {
        slug: m.categories!.slug,
        confidence: Number(m.confidence),
      });
    }

    let rows = 0;
    let tagged = 0;
    const byLevel = [0, 0, 0];
    const byAisle = new Map<string, number>();
    const tagCounts = new Map<string, number>();
    const leftTags = new Map<string, number>();
    for (const raw of raws.data) {
      for (const row of parseExtract((await readRaw(db, raw.id)).body)) {
        rows++;
        const tags = splitTags(row.categories_tags);
        if (tags.length === 0) continue;
        tagged++;
        for (const t of tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
        const p = pickCategory(tags, index);
        if (!p) {
          for (const t of tags) leftTags.set(t, (leftTags.get(t) ?? 0) + 1);
          continue;
        }
        byLevel[p.level]!++;
        const aisle = p.slug.split('/')[0]!;
        byAisle.set(aisle, (byAisle.get(aisle) ?? 0) + 1);
      }
    }
    const mapped = byLevel[0]! + byLevel[1]! + byLevel[2]!;
    const seen = [...index.keys()].filter((k) => tagCounts.has(k)).length;
    report.push(
      `OFF run ${runs.data.id.slice(0, 8)} (${runs.data.started_at}): ${raws.data.length} extracts, ` +
        `${rows} rows, ${tagged} with tags (${tagCounts.size} distinct tags)`,
      `mapped: ${mapped} of ${tagged} (${pct(mapped, tagged)}); deepest node: leaf ${byLevel[2]} ` +
        `(${pct(byLevel[2]!, tagged)}), group ${byLevel[1]} (${pct(byLevel[1]!, tagged)}), aisle ` +
        `${byLevel[0]} (${pct(byLevel[0]!, tagged)}); unmapped ${tagged - mapped}`,
      `mapped tags seen in this dump: ${seen} of ${index.size}`,
      `by aisle: ${[...byAisle]
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')}`,
      `tags on the unmapped products (top 15): ${[...leftTags]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')}`,
    );
    expect(tagged).toBeGreaterThan(0);
    expect(mapped / tagged).toBeGreaterThanOrEqual(0.95);
  });
});
