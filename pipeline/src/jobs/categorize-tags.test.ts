import { describe, expect, it } from 'vitest';

import { ConfigurationError } from '../errors.ts';
import { createLogger } from '../log.ts';
import { createMemoryRunStore } from '../runs/store.ts';
import type { SourceRow } from '../sources/source.ts';
import type { TagMapping } from '../taxonomy/assign.ts';
import {
  type CategorizeChange,
  type CategorizeRow,
  type CategorizeTagsDeps,
  RULE_OFF_TAGS,
  createCategorizeTagsJob,
  decide,
} from './categorize-tags.ts';
import { listJobNames } from './index.ts';
import { JOB_SOURCE_KEY, type JobOptions, runJob } from './runner.ts';

const JOB_SOURCE: SourceRow = {
  id: 'src-derived',
  key: JOB_SOURCE_KEY,
  verdict: 'use',
  enabled: true,
  rate_limit_per_sec: 1,
};
const silent = createLogger({}, () => {});
const full: JobOptions = { mode: 'full', trigger: 'cli' };

const CATS = new Map([
  ['dairy-eggs', 'c-dairy'],
  ['dairy-eggs/cheese', 'c-cheese'],
  ['dairy-eggs/cheese/cheddar', 'c-cheddar'],
  ['snacks/chips', 'c-chips'],
  ['snacks', 'c-snacks'],
]);
const MAPPINGS = new Map<string, TagMapping>([
  ['en:dairies', { slug: 'dairy-eggs', confidence: 0.9 }],
  ['en:cheeses', { slug: 'dairy-eggs/cheese', confidence: 0.6 }],
  ['en:cheddar-cheese', { slug: 'dairy-eggs/cheese/cheddar', confidence: 0.9 }],
  ['en:crisps', { slug: 'snacks/chips', confidence: 0.9 }],
  ['en:snacks', { slug: 'snacks', confidence: 0.9 }],
]);

const row = (over: Partial<CategorizeRow> = {}): CategorizeRow => ({
  id: 'p1',
  external_id: '1',
  category_id: null,
  category_rule: null,
  locked_fields: [],
  ...over,
});
const cheddar = {
  tag: 'en:cheddar-cheese',
  slug: 'dairy-eggs/cheese/cheddar',
  level: 2,
  confidence: 0.9,
};

describe('decide', () => {
  it('sets the picked category on a product with none', () => {
    expect(decide(row(), cheddar, CATS)).toEqual({ categoryId: 'c-cheddar' });
  });
  it('leaves a product whose code is not in the extracts', () => {
    expect(decide(row({ category_id: 'c-chips', category_rule: 1 }), undefined, CATS)).toBe(
      undefined,
    );
  });
  it('does nothing when the category and rule already match', () => {
    expect(decide(row({ category_id: 'c-cheddar', category_rule: 1 }), cheddar, CATS)).toBe(
      undefined,
    );
  });
  it('replaces a different rule-1 category and a name or AI rule, never a manual one', () => {
    expect(decide(row({ category_id: 'c-chips', category_rule: 1 }), cheddar, CATS)).toEqual({
      categoryId: 'c-cheddar',
    });
    expect(decide(row({ category_id: 'c-cheddar', category_rule: 12 }), cheddar, CATS)).toEqual({
      categoryId: 'c-cheddar',
    });
    expect(decide(row({ category_id: 'c-chips', category_rule: 55 }), cheddar, CATS)).toEqual({
      categoryId: 'c-cheddar',
    });
    expect(decide(row({ category_id: 'c-chips', category_rule: 90 }), cheddar, CATS)).toBe(
      undefined,
    );
  });
  it('clears only a rule-1 category when no tag maps any more', () => {
    expect(decide(row({ category_id: 'c-chips', category_rule: 1 }), null, CATS)).toEqual({
      categoryId: null,
    });
    expect(decide(row({ category_id: 'c-chips', category_rule: 12 }), null, CATS)).toBe(undefined);
    expect(decide(row(), null, CATS)).toBe(undefined);
  });
  it('refuses a pick whose category is unknown', () => {
    expect(() => decide(row(), { ...cheddar, slug: 'nowhere' }, CATS)).toThrow(ConfigurationError);
  });
});

interface Product extends CategorizeRow {
  status: 'active' | 'discontinued';
}

/** A memory catalog and extract: `extract` rows are visited in order (later wins). */
function memory(
  products: Product[],
  extract: [code: string, tags: string][],
  opts: { writeFails?: boolean } = {},
) {
  const scans: (string | null)[] = [];
  const writes: CategorizeChange[][] = [];
  const deps: CategorizeTagsDeps = {
    loadLookups: async () => ({ mappings: MAPPINGS, categoryIds: CATS }),
    async loadTags(visit) {
      for (const [code, tags] of extract) visit(code, tags);
      return {
        fullRunId: 'run-full',
        fullFrom: 'raw',
        fullParts: 1,
        fullRows: extract.length,
        deltaRuns: 0,
        deltaParts: 0,
        deltaRows: 0,
        deltaPartsMissing: 0,
      };
    },
    async scan(after, limit) {
      scans.push(after);
      return products
        .filter((p) => p.status === 'active' && (after === null || p.id > after))
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .slice(0, limit)
        .map(({ status: _s, ...r }) => ({ ...r }));
    },
    async write(changes) {
      if (opts.writeFails) throw new Error('boom');
      writes.push(changes);
      let n = 0;
      for (const c of changes) {
        const p = products.find((x) => x.id === c.id)!;
        if (p.category_id === c.category_id && p.category_rule === c.category_rule) continue;
        p.category_id = c.category_id;
        p.category_rule = c.category_rule;
        n++;
      }
      return n;
    },
  };
  return { deps, scans, writes };
}

const product = (id: string, code: string, over: Partial<Product> = {}): Product => ({
  id,
  external_id: code,
  category_id: null,
  category_rule: null,
  locked_fields: [],
  status: 'active',
  ...over,
});

const categoriesOf = (products: Product[]) =>
  Object.fromEntries(
    products
      .filter((p) => ['p01', 'p02', 'p05', 'p09'].includes(p.id))
      .map((p) => [p.id, p.category_id]),
  );

function catalog(): { products: Product[]; extract: [string, string][] } {
  return {
    products: [
      product('p01', '01'), // cheddar
      product('p02', '02'), // crisps beat the weak cheese tag
      product('p03', '03'), // no mapped tag
      product('p04', '04'), // not in the extract
      product('p05', '05', { category_id: 'c-chips', category_rule: 1 }), // tags gone: cleared
      product('p06', '06', { category_id: 'c-snacks', category_rule: 90 }), // manual
      product('p07', '07', { locked_fields: ['category_id'] }), // locked
      product('p08', '08', { status: 'discontinued' }),
      product('p09', '09'), // a later delta row changes its tags
      product('p10', '10', { category_id: 'c-dairy', category_rule: 1 }), // already right
    ],
    extract: [
      ['01', 'en:dairies,en:cheeses,en:cheddar-cheese'],
      ['02', 'en:snacks,en:cheeses,en:crisps'],
      ['03', 'en:plant-based-foods'],
      ['05', ''],
      ['06', 'en:crisps'],
      ['07', 'en:crisps'],
      ['08', 'en:crisps'],
      ['09', 'en:dairies'],
      ['10', 'en:dairies'],
      [' 09 ', 'en:snacks'],
    ],
  };
}

describe('categorize-tags job', () => {
  it('sets the deepest mapped category, clears stale rule-1 rows, skips locked and manual', async () => {
    const { products, extract } = catalog();
    const m = memory(products, extract);
    const store = createMemoryRunStore({ sources: [JOB_SOURCE] });
    const result = await runJob(createCategorizeTagsJob(m.deps), full, { store, log: silent });

    expect(result.status).toBe('completed');
    expect(result.counts).toEqual({
      fetched: 5,
      valid: 5,
      invalid: 0,
      inserted: 0,
      updated: 4,
      unchanged: 0,
      skipped_locked: 1,
    });
    const by = Object.fromEntries(products.map((p) => [p.id, [p.category_id, p.category_rule]]));
    expect(by).toEqual({
      p01: ['c-cheddar', RULE_OFF_TAGS],
      p02: ['c-chips', RULE_OFF_TAGS],
      p03: [null, null],
      p04: [null, null],
      p05: [null, null],
      p06: ['c-snacks', 90],
      p07: [null, null],
      p08: [null, null],
      p09: ['c-snacks', RULE_OFF_TAGS],
      p10: ['c-dairy', RULE_OFF_TAGS],
    });
    // Only the two category columns are written, locked rows never.
    expect(m.writes.flat().map((c) => c.id)).toEqual(['p01', 'p02', 'p05', 'p09']);
    const summary = store.events.find((e) => e.event_type === 'categorize_tags_summary');
    expect(summary?.details).toMatchObject({
      codes: 9,
      codes_mapped: 7,
      set: 4,
      cleared: 1,
      locked: 1,
      by_level: { aisle: 1, group: 2, leaf: 1 },
      by_aisle: { 'dairy-eggs': 1, snacks: 3 },
    });
  });

  it('updates nothing on a second run', async () => {
    const { products, extract } = catalog();
    const store = createMemoryRunStore({ sources: [JOB_SOURCE] });
    await runJob(createCategorizeTagsJob(memory(products, extract).deps), full, {
      store,
      log: silent,
    });
    const again = await runJob(createCategorizeTagsJob(memory(products, extract).deps), full, {
      store,
      log: silent,
    });
    expect(again.status).toBe('completed');
    // The locked row still needs work, so it is read and skipped again.
    expect(again.counts).toMatchObject({ fetched: 1, updated: 0, skipped_locked: 1 });
  });

  it('a dry run writes nothing; a sample stops at N rows that need work', async () => {
    const { products, extract } = catalog();
    const dry = memory(products, extract);
    const store = createMemoryRunStore({ sources: [JOB_SOURCE] });
    const r1 = await runJob(
      createCategorizeTagsJob(dry.deps),
      { ...full, mode: 'dry_run' },
      {
        store,
        log: silent,
      },
    );
    expect(r1.counts).toMatchObject({ fetched: 5, valid: 5, updated: 0 });
    expect(dry.writes).toEqual([]);

    const sample = memory(products, extract);
    const r2 = await runJob(
      createCategorizeTagsJob(sample.deps),
      { ...full, mode: 'sample', sampleSize: 2 },
      { store, log: silent },
    );
    expect(r2.counts).toMatchObject({ fetched: 2, updated: 2 });
    // p01 and p02 are set; p05 (still to clear) and p09 wait for the next run.
    expect(categoriesOf(products)).toEqual({
      p01: 'c-cheddar',
      p02: 'c-chips',
      p05: 'c-chips',
      p09: null,
    });
  });

  it('scans past rows that need no work to fill a batch, in id order', async () => {
    const products: Product[] = [];
    const extract: [string, string][] = [];
    // 2,500 products; every 1,000th needs work.
    for (let i = 0; i < 2500; i++) {
      const code = String(i).padStart(5, '0');
      products.push(product(`p${code}`, code));
      extract.push([code, i % 1000 === 999 ? 'en:crisps' : '']);
    }
    const m = memory(products, extract);
    const store = createMemoryRunStore({ sources: [JOB_SOURCE] });
    const job = createCategorizeTagsJob(m.deps, { batchSize: 1 });
    const result = await runJob(job, full, { store, log: silent });
    expect(result.counts).toMatchObject({ fetched: 2, updated: 2 });
    expect(m.writes.flat().map((c) => c.id)).toEqual(['p00999', 'p01999']);
  });

  it('a failed write fails the batch and the run ends with errors', async () => {
    const { products, extract } = catalog();
    const store = createMemoryRunStore({ sources: [JOB_SOURCE] });
    const result = await runJob(
      createCategorizeTagsJob(memory(products, extract, { writeFails: true }).deps),
      full,
      { store, log: silent },
    );
    expect(result.status).toBe('completed_with_errors');
  });

  it('refuses to run without mappings', async () => {
    const { products, extract } = catalog();
    const m = memory(products, extract);
    m.deps.loadLookups = async () => ({ mappings: new Map(), categoryIds: CATS });
    const store = createMemoryRunStore({ sources: [JOB_SOURCE] });
    const result = await runJob(createCategorizeTagsJob(m.deps), full, { store, log: silent });
    expect(result.status).toBe('failed');
    expect(result.errorSummary).toMatch(/No approved OFF category mappings/);
  });

  it('is registered', () => {
    expect(listJobNames()).toContain('categorize-tags');
  });
});
