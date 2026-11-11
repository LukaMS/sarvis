// The categorize-tags job (P4.9, D-093): every OFF product whose tags map gets a category.
//
// Tags aren't stored on `products`, so `prepare` re-parses the stored OFF extracts: the newest
// completed full run, then the completed delta runs after it, oldest first, so a product's latest
// row wins. When retention removed a part of the full run, the job reads the cached dump instead
// (.cache/dumps/), but only if its sha-256 is the one that run recorded. Each product's tags go
// through `pickCategory` (TAXONOMY.md §3) once, so only one pick per code stays in memory.
//
// `read` pages through the OFF source's active products in id order and returns only those whose
// category would change, so a second run reads nothing. Rule codes (TAXONOMY.md §4): the job sets
// rule 1. It replaces no category, rule 1, or a name/AI rule (10–59: tags are better evidence),
// never a manual one (90+), and clears a rule-1 category whose tags no longer map. A product whose
// code isn't in the extracts is left as it is. Locked rows (`category_id` or `category_rule` in
// `locked_fields`) are counted as skipped. Only `category_id` and `category_rule` are written.
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { ServiceClient } from '../db/client.ts';
import { ConfigurationError, DatabaseError, NotFoundError } from '../errors.ts';
import { DEFAULT_DUMP_DIR, dumpKey } from '../http/download.ts';
import { openLines } from '../http/lines.ts';
import { readRaw } from '../raw/store.ts';
import { type UpsertCounts, emptyUpsertCounts } from '../runs/progress.ts';
import { createRowFilter, emptyFilterCounts, parseExtract } from '../sources/off/csv.ts';
import { OFF_JOB, OFF_KEY } from '../sources/off/map.ts';
import type { SourceEvent } from '../sources/source.ts';
import {
  type TagMapping,
  type TagPick,
  levelOf,
  pickCategory,
  splitTags,
} from '../taxonomy/assign.ts';
import type { Job } from './job.ts';

export const CATEGORIZE_TAGS_JOB_NAME = 'categorize-tags';
export const CATEGORIZE_TAGS_JOB_VERSION = '1.0.0';
/** `products.category_rule` for a category from OFF tags (TAXONOMY.md §4). */
export const RULE_OFF_TAGS = 1;
/** Rules from here up are manual: tags never replace them. */
export const RULE_MANUAL_MIN = 90;
/** A row with one of these in `locked_fields` keeps its category. */
export const CATEGORIZE_TAGS_FIELDS = ['category_id', 'category_rule'];
/** Products per scan page (PostgREST returns at most 1,000 rows). */
const SCAN_PAGE = 1000;
/** Examples kept for the summary event. */
const EXAMPLES = 5;

export interface CategorizeRow {
  id: string;
  external_id: string;
  category_id: string | null;
  category_rule: number | null;
  locked_fields: string[];
}

/** What the tags say a product's category should be: a pick, or null when no tag maps. */
export type TagVerdict = TagPick | null;

export interface CategorizeItem {
  row: CategorizeRow;
  /** The category to set, or null to clear a rule-1 category. */
  categoryId: string | null;
  pick: TagVerdict;
  locked: boolean;
}

export interface CategorizeChange {
  id: string;
  category_id: string | null;
  category_rule: number | null;
  locked: boolean;
}

/** Where the tags came from, for the summary event. */
export interface TagOrigin {
  fullRunId: string;
  /** `raw`: the run's stored extracts; `dump`: the cached dump (a part was gone). */
  fullFrom: 'raw' | 'dump';
  fullParts: number;
  fullRows: number;
  deltaRuns: number;
  deltaParts: number;
  deltaRows: number;
  /** Delta parts retention removed; their rows are missing from the picks. */
  deltaPartsMissing: number;
}

export interface TagLookups {
  /** OFF tag → category slug and confidence (approved mappings only). */
  mappings: Map<string, TagMapping>;
  /** Category slug → id. */
  categoryIds: Map<string, string>;
}

/** Where the job reads and writes: the dev database, or memory in the unit tests. */
export interface CategorizeTagsDeps {
  loadLookups(): Promise<TagLookups>;
  /** Calls `visit` with each extract row's code and tags, oldest first. */
  loadTags(visit: (code: string, tags: string) => void): Promise<TagOrigin>;
  /** Up to `limit` of the OFF source's active products with an id above `after`, in id order. */
  scan(after: string | null, limit: number): Promise<CategorizeRow[]>;
  /** Writes the unlocked changes; returns how many rows changed. */
  write(changes: CategorizeChange[]): Promise<number>;
}

/**
 * The category a product should get, or `undefined` when there is nothing to do. `verdict`
 * undefined means the code isn't in the extracts.
 */
export function decide(
  row: CategorizeRow,
  verdict: TagVerdict | undefined,
  categoryIds: ReadonlyMap<string, string>,
): { categoryId: string | null } | undefined {
  if (verdict === undefined) return undefined;
  if ((row.category_rule ?? 0) >= RULE_MANUAL_MIN) return undefined;
  if (verdict === null) {
    // Tags that no longer map undo only what tags did.
    return row.category_rule === RULE_OFF_TAGS ? { categoryId: null } : undefined;
  }
  const categoryId = categoryIds.get(verdict.slug);
  if (!categoryId) {
    throw new ConfigurationError(
      `Mapping ${verdict.tag} points at unknown category ${verdict.slug}.`,
    );
  }
  if (row.category_id === categoryId && row.category_rule === RULE_OFF_TAGS) return undefined;
  return { categoryId };
}

const isLocked = (row: CategorizeRow) =>
  row.locked_fields.some((f) => CATEGORIZE_TAGS_FIELDS.includes(f));

export function createCategorizeTagsJob(
  deps: CategorizeTagsDeps,
  opts: { batchSize?: number } = {},
): Job<CategorizeItem, CategorizeChange> {
  let lookups: TagLookups | null = null;
  let picks = new Map<string, TagVerdict>();
  let origin: TagOrigin | null = null;
  let tally = emptyTally();

  return {
    name: CATEGORIZE_TAGS_JOB_NAME,
    version: CATEGORIZE_TAGS_JOB_VERSION,
    batchSize: opts.batchSize ?? 500,

    async prepare(ctx) {
      tally = emptyTally();
      lookups = await deps.loadLookups();
      if (lookups.mappings.size === 0) {
        throw new ConfigurationError('No approved OFF category mappings: seed the taxonomy first.');
      }
      const found = new Map<string, TagVerdict>();
      const { mappings } = lookups;
      origin = await deps.loadTags((code, tags) => {
        found.set(code.trim(), pickCategory(splitTags(tags), mappings));
      });
      picks = found;
      ctx.log.info('OFF tags loaded.', { ...origin, codes: picks.size });
    },

    async read(after, limit) {
      if (!lookups) throw new ConfigurationError('categorize-tags read before prepare.');
      const out: CategorizeItem[] = [];
      let cursor = after;
      // Scan pages until `limit` rows need work. The runner resumes after the last row returned, so
      // the rows scanned past it are scanned again next time (at most one page per batch).
      for (;;) {
        const page = await deps.scan(cursor, SCAN_PAGE);
        for (const row of page) {
          const verdict = picks.get(row.external_id);
          const d = decide(row, verdict, lookups.categoryIds);
          if (d === undefined) continue;
          out.push({ row, categoryId: d.categoryId, pick: verdict ?? null, locked: isLocked(row) });
          if (out.length === limit) return out;
        }
        if (page.length < SCAN_PAGE) return out;
        cursor = page[page.length - 1]!.id;
      }
    },

    idOf: (item) => item.row.id,

    work(items) {
      const changes = items.map((i) => {
        count(tally, i);
        return {
          id: i.row.id,
          category_id: i.categoryId,
          category_rule: i.categoryId === null ? null : RULE_OFF_TAGS,
          locked: i.locked,
        };
      });
      return { changes, unchanged: 0 };
    },

    async write(changes): Promise<UpsertCounts> {
      const open = changes.filter((c) => !c.locked);
      const updated = open.length > 0 ? await deps.write(open) : 0;
      return {
        ...emptyUpsertCounts(),
        updated,
        // Read as needing work, but changed by someone else meanwhile.
        unchanged: open.length - updated,
        skipped_locked: changes.length - open.length,
      };
    },

    finish: () => [summaryEvent(tally, origin, picks)],
  };
}

interface Tally {
  set: number;
  cleared: number;
  replacedOtherRule: number;
  locked: number;
  byLevel: [number, number, number];
  byAisle: Record<string, number>;
  examples: { external_id: string; tag: string | null; slug: string | null }[];
}

function emptyTally(): Tally {
  return {
    set: 0,
    cleared: 0,
    replacedOtherRule: 0,
    locked: 0,
    byLevel: [0, 0, 0],
    byAisle: {},
    examples: [],
  };
}

function count(t: Tally, i: CategorizeItem) {
  if (i.locked) t.locked++;
  if (i.categoryId === null) t.cleared++;
  else {
    t.set++;
    if (i.row.category_rule !== null && i.row.category_rule !== RULE_OFF_TAGS)
      t.replacedOtherRule++;
  }
  if (i.pick && i.categoryId !== null) {
    t.byLevel[levelOf(i.pick.slug) as 0 | 1 | 2]++;
    const aisle = i.pick.slug.split('/')[0]!;
    t.byAisle[aisle] = (t.byAisle[aisle] ?? 0) + 1;
  }
  if (t.examples.length < EXAMPLES) {
    t.examples.push({
      external_id: i.row.external_id,
      tag: i.pick?.tag ?? null,
      slug: i.categoryId === null ? null : (i.pick?.slug ?? null),
    });
  }
}

function summaryEvent(
  t: Tally,
  origin: TagOrigin | null,
  picks: ReadonlyMap<string, TagVerdict>,
): SourceEvent {
  let mapped = 0;
  for (const v of picks.values()) if (v) mapped++;
  return {
    severity: origin && origin.deltaPartsMissing > 0 ? 'warn' : 'info',
    eventType: 'categorize_tags_summary',
    message:
      `Tags of ${picks.size} OFF codes, ${mapped} mapped. Changes: ${t.set} set ` +
      `(${t.replacedOtherRule} over a name or AI rule), ${t.cleared} cleared, ${t.locked} locked.`,
    details: {
      origin,
      codes: picks.size,
      codes_mapped: mapped,
      set: t.set,
      cleared: t.cleared,
      replaced_other_rule: t.replacedOtherRule,
      locked: t.locked,
      by_level: { aisle: t.byLevel[0], group: t.byLevel[1], leaf: t.byLevel[2] },
      by_aisle: t.byAisle,
      examples: t.examples,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The dev database.

const PAGE = 1000;

async function offSourceId(db: ServiceClient): Promise<string> {
  const { data, error } = await db.from('sources').select('id').eq('key', OFF_KEY).maybeSingle();
  if (error) throw new DatabaseError(error.message, error);
  if (!data) throw new ConfigurationError(`Source ${OFF_KEY} has no row in sources.`);
  return data.id;
}

async function loadLookups(db: ServiceClient, sourceId: string): Promise<TagLookups> {
  const categoryIds = new Map<string, string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('categories')
      .select('id, slug')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new DatabaseError(error.message, error);
    for (const c of data) categoryIds.set(c.slug, c.id);
    if (data.length < PAGE) break;
  }
  const mappings = new Map<string, TagMapping>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('category_mappings')
      .select('source_category_key, confidence, categories(slug)')
      .eq('source_id', sourceId)
      .eq('review_status', 'approved')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new DatabaseError(error.message, error);
    for (const m of data) {
      if (!m.categories) continue;
      mappings.set(m.source_category_key, {
        slug: m.categories.slug,
        confidence: Number(m.confidence),
      });
    }
    if (data.length < PAGE) break;
  }
  return { mappings, categoryIds };
}

/** The part of download.ts's sidecar the fallback reads. */
interface Sidecar {
  sha256?: string;
  bytes?: number;
}

interface RawPart {
  id: string;
  deleted_at: string | null;
}

async function partsOf(db: ServiceClient, runId: string): Promise<RawPart[]> {
  const { data, error } = await db
    .from('raw_objects')
    .select('id, deleted_at')
    .eq('run_id', runId)
    .order('storage_path');
  if (error) throw new DatabaseError(error.message, error);
  return data;
}

/** Feeds the cached dump of `run` through the import filter, if it is the file the run read. */
export async function visitOffDump(
  run: { id: string; dump_url: string | null; dump_sha256: string | null },
  visit: (code: string, tags: string) => void,
  dumpDir: string,
): Promise<number> {
  if (!run.dump_url || !run.dump_sha256) {
    throw new ConfigurationError(`OFF run ${run.id} lost a raw part and recorded no dump.`);
  }
  const path = join(dumpDir, dumpKey(run.dump_url));
  let sha: string | null = null;
  try {
    // The sidecar download.ts writes holds the file's sha-256; the size check is its own.
    const meta = JSON.parse(await readFile(`${path}.json`, 'utf8')) as Sidecar;
    if ((await stat(path)).size === meta.bytes) sha = meta.sha256 ?? null;
  } catch {
    sha = null;
  }
  if (sha !== run.dump_sha256) {
    throw new ConfigurationError(
      `OFF run ${run.id} lost a raw part, and the cached dump is ${sha ? 'a different file' : 'missing'}. ` +
        'Run a full OFF import to store a fresh extract.',
    );
  }
  const counts = emptyFilterCounts();
  let keep: ReturnType<typeof createRowFilter> | null = null;
  let rows = 0;
  for await (const line of openLines(path, { gzip: true })) {
    if (!keep) {
      keep = createRowFilter(line, counts);
      continue;
    }
    const row = keep(line);
    if (!row) continue;
    visit(row.code, row.categories_tags);
    rows++;
  }
  return rows;
}

async function loadOffTags(
  db: ServiceClient,
  sourceId: string,
  visit: (code: string, tags: string) => void,
  dumpDir: string,
): Promise<TagOrigin> {
  const full = await db
    .from('ingestion_runs')
    .select('id, started_at, dump_url, dump_sha256')
    .eq('source_id', sourceId)
    .eq('job', OFF_JOB)
    .eq('mode', 'full')
    .eq('status', 'completed')
    .is('sample_size', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (full.error) throw new DatabaseError(full.error.message, full.error);
  if (!full.data) throw new ConfigurationError('No completed full OFF run to read tags from.');
  const run = full.data;

  const origin: TagOrigin = {
    fullRunId: run.id,
    fullFrom: 'raw',
    fullParts: 0,
    fullRows: 0,
    deltaRuns: 0,
    deltaParts: 0,
    deltaRows: 0,
    deltaPartsMissing: 0,
  };
  const parts = await partsOf(db, run.id);
  let fromDump = parts.length === 0 || parts.some((p) => p.deleted_at !== null);
  if (!fromDump) {
    try {
      for (const p of parts) {
        for (const row of parseExtract((await readRaw(db, p.id)).body)) {
          visit(row.code, row.categories_tags);
          origin.fullRows++;
        }
        origin.fullParts++;
      }
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
      fromDump = true; // The dump holds every row the parts read so far, so re-reading is safe.
    }
  }
  if (fromDump) {
    origin.fullFrom = 'dump';
    origin.fullParts = 0;
    origin.fullRows = await visitOffDump(run, visit, dumpDir);
  }

  const deltas = await db
    .from('ingestion_runs')
    .select('id')
    .eq('source_id', sourceId)
    .eq('job', OFF_JOB)
    .eq('mode', 'delta')
    .eq('status', 'completed')
    .gt('started_at', run.started_at)
    .order('started_at');
  if (deltas.error) throw new DatabaseError(deltas.error.message, deltas.error);
  for (const d of deltas.data) {
    origin.deltaRuns++;
    for (const p of await partsOf(db, d.id)) {
      if (p.deleted_at !== null) {
        origin.deltaPartsMissing++;
        continue;
      }
      for (const row of parseExtract((await readRaw(db, p.id)).body)) {
        visit(row.code, row.categories_tags);
        origin.deltaRows++;
      }
      origin.deltaParts++;
    }
  }
  return origin;
}

/** The job's reads and writes on the dev database. */
export function supabaseCategorizeTagsDeps(
  db: ServiceClient,
  opts: { dumpDir?: string } = {},
): CategorizeTagsDeps {
  let sourceId: string | null = null;
  const source = async () => (sourceId ??= await offSourceId(db));
  return {
    loadLookups: async () => loadLookups(db, await source()),
    loadTags: async (visit) =>
      loadOffTags(db, await source(), visit, opts.dumpDir ?? DEFAULT_DUMP_DIR),
    async scan(after, limit) {
      let q = db
        .from('products')
        .select('id, external_id, category_id, category_rule, locked_fields')
        .eq('source_id', await source())
        .eq('status', 'active')
        .order('id')
        .limit(limit);
      if (after !== null) q = q.gt('id', after);
      const { data, error } = await q;
      if (error) throw new DatabaseError(error.message, error);
      return data.map((r) => ({ ...r, locked_fields: r.locked_fields ?? [] }));
    },
    async write(changes) {
      const { data, error } = await db.rpc('set_product_categories', {
        ids: changes.map((c) => c.id),
        // A null clears the category; the generated type doesn't know the array may hold one.
        category_ids: changes.map((c) => c.category_id) as string[],
        rules: changes.map((c) => c.category_rule ?? RULE_OFF_TAGS),
      });
      if (error) throw new DatabaseError(`Setting categories failed: ${error.message}`, error);
      return data.length;
    },
  };
}
