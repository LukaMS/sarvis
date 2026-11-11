// The taxonomy tree, its mappings, the tag pick and the seed migration (P4.8, D-090). No network.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { type TagMapping, levelOf, pickCategory, splitTags } from './assign.ts';
import { TAXONOMY_MIGRATION, taxonomySql } from './sql.ts';
import {
  STRONG_CONFIDENCE,
  WEAK_CONFIDENCE,
  flattenTaxonomy,
  offTagMappings,
  statcanMappings,
} from './tree.ts';

const rows = flattenTaxonomy();
const bySlug = new Map(rows.map((r) => [r.slug, r]));
const index = new Map<string, TagMapping>(offTagMappings().map((m) => [m.key, m]));
const pick = (tags: string) => pickCategory(splitTags(tags), index)?.slug ?? null;

describe('taxonomy tree', () => {
  it('has 3 levels, about 200-450 nodes, and leaves only at level 2', () => {
    expect(rows.length).toBeGreaterThanOrEqual(200);
    expect(rows.length).toBeLessThanOrEqual(450);
    expect(new Set(rows.map((r) => r.level))).toEqual(new Set([0, 1, 2]));
    expect(rows.filter((r) => r.isLeaf && r.level !== 2)).toEqual([]);
    expect(rows.filter((r) => !r.isLeaf && r.level === 2)).toEqual([]);
  });

  it('gives every node a unique valid slug and a parent chain to an aisle', () => {
    expect(bySlug.size).toBe(rows.length);
    for (const r of rows) {
      expect(r.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*){0,2}$/);
      expect(r.slug.length).toBeLessThanOrEqual(200);
      expect(levelOf(r.slug)).toBe(r.level);
      expect(r.name.length).toBeGreaterThan(0);
      let at = r;
      while (at.parentSlug) at = bySlug.get(at.parentSlug)!;
      expect(at.level).toBe(0);
    }
  });

  it('marks only leaves as sold loose, in the aisles P4.28 seeds from', () => {
    const loose = rows.filter((r) => r.soldLoose);
    expect(loose.every((r) => r.isLeaf)).toBe(true);
    const aisles = new Set(loose.map((r) => r.slug.split('/')[0]));
    for (const a of ['produce', 'meat-seafood', 'deli', 'bakery', 'snacks', 'pantry']) {
      expect(aisles).toContain(a);
    }
    expect(bySlug.get('produce/fruits/bananas')?.soldLoose).toBe(true);
    expect(bySlug.get('snacks/chips/potato-chips')?.soldLoose).toBe(false);
  });

  it('maps each OFF tag and each StatCan label once, to a node that exists', () => {
    const off = offTagMappings();
    expect(new Set(off.map((m) => m.key)).size).toBe(off.length);
    const sc = statcanMappings();
    expect(new Set(sc.map((m) => m.key)).size).toBe(sc.length);
    for (const m of [...off, ...sc]) {
      expect(bySlug.has(m.slug)).toBe(true);
      expect(m.key.length).toBeGreaterThan(0);
      expect(m.key.length).toBeLessThanOrEqual(300);
      expect(m.key).not.toContain(',');
    }
    expect(new Set(off.map((m) => m.confidence))).toEqual(
      new Set([STRONG_CONFIDENCE, WEAK_CONFIDENCE]),
    );
    expect(sc.find((m) => m.key === 'Yogurt')?.slug).toBe('dairy-eggs/yogurt');
    expect(sc.find((m) => m.key === 'Milk')?.slug).toBe('dairy-eggs/milk/white-milk');
  });
});

describe('pickCategory', () => {
  it('takes the deepest mapped tag, whatever its position', () => {
    expect(pick('en:cheddar-cheese,en:cheeses,en:dairies')).toBe('dairy-eggs/cheese/cheddar');
    expect(pick('en:dairies')).toBe('dairy-eggs');
    expect(pick('en:plant-based-foods-and-beverages,en:plant-based-foods')).toBeNull();
  });

  it('breaks a tie on confidence, then on the later tag', () => {
    const m = new Map<string, TagMapping>([
      ['a', { slug: 'x/y/a', confidence: STRONG_CONFIDENCE }],
      ['b', { slug: 'x/y/b', confidence: WEAK_CONFIDENCE }],
      ['c', { slug: 'x/y/c', confidence: STRONG_CONFIDENCE }],
    ]);
    expect(pickCategory(['a', 'b'], m)?.slug).toBe('x/y/a');
    expect(pickCategory(['b', 'a'], m)?.slug).toBe('x/y/a');
    expect(pickCategory(['a', 'c'], m)?.slug).toBe('x/y/c');
    expect(pickCategory(['c', 'a'], m)?.slug).toBe('x/y/a');
  });

  it('reads real OFF tag lists the way a shopper would', () => {
    // Old Dutch Cheese Pleesers (fixture.delta-1): cheese crisps, not cheese.
    expect(
      pick(
        'en:dairies,en:fermented-foods,en:fermented-milk-products,en:snacks,en:cheeses,' +
          'en:salty-snacks,en:appetizers,en:chips-and-fries,en:crisps',
      ),
    ).toBe('snacks/chips');
    // Nutella & GO!: OFF also tags it a hazelnut butter.
    expect(
      pick(
        'en:plant-based-foods-and-beverages,en:plant-based-foods,en:breakfasts,en:spreads,' +
          'en:nuts-and-their-products,en:plant-based-spreads,en:sweet-spreads,en:oilseed-purees,' +
          'fr:pates-a-tartiner,en:hazelnut-spreads,en:nut-butters,en:chocolate-spreads,' +
          'en:cocoa-and-hazelnuts-spreads,en:hazelnut-butters',
      ),
    ).toBe('breakfast/spreads/chocolate-spreads');
    // Grounded (fixture.delta-2): textured vegetable protein.
    expect(
      pick(
        'en:plant-based-foods-and-beverages,en:plant-based-foods,en:legumes-and-their-products,' +
          'en:meat-alternatives,en:textured-vegetable-protein',
      ),
    ).toBe('meat-seafood/plant-protein/meatless-other');
    // Maple syrup is also a simple syrup.
    expect(pick('en:sweeteners,en:syrups,en:simple-syrups,en:maple-syrups')).toBe(
      'breakfast/spreads/maple-syrup',
    );
    // Canned tomatoes are also tomatoes.
    expect(pick('en:plant-based-foods,en:tomatoes,en:canned-tomatoes')).toBe(
      'pantry/canned/canned-tomatoes',
    );
    // Smoked salmon beats salmon and fatty fish.
    expect(pick('en:seafood,en:fishes,en:fatty-fishes,en:salmons,en:smoked-salmons')).toBe(
      'meat-seafood/seafood/smoked-fish',
    );
  });
});

describe('seed migration', () => {
  it('is the checked-in file, byte for byte', () => {
    const file = readFileSync(
      new URL(`../../../supabase/migrations/${TAXONOMY_MIGRATION}`, import.meta.url),
      'utf8',
    );
    expect(file).toBe(taxonomySql());
  });

  it('upserts every level and both mapping sets, and keeps admin decisions', () => {
    const sql = taxonomySql();
    expect(sql.match(/insert into public\.categories/g)).toHaveLength(3);
    expect(sql.match(/insert into public\.category_mappings/g)).toHaveLength(2);
    expect(sql.match(/where m\.decision_method is distinct from 'admin'/g)).toHaveLength(2);
    expect(sql).not.toContain('$j$$j$');
  });
});
