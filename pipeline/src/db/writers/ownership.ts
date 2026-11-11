// Companies, brands and their ownership edges (DATA_MODEL §3.2). Companies and brands key on the
// Wikidata QID, then the slug; the slug never changes once written. All of them arrive `pending`.
// Only the AUTO_APPROVE rule (Wikidata, D-054) changes `review_status`: on companies and brands
// through writeRecords, on edges here, minus `auto_hold` edges and any the one-current-owner index
// would refuse. A reviewed company or brand still takes updates to its unlocked fields; an edge a
// person reviewed is left alone, and one the rule approved still takes updates.
//
// A second source (Wikipedia, SEC EDGAR, Corporations Canada) fills in fields on a company it
// didn't create with company_enrichment records. The company keeps its own +prov block, and the
// enriching source's provenance goes to company_sources (P3.4).
//
// The source that creates a row owns its +prov block (D-095). A company or brand record from
// another source still updates unlocked fields but never the +prov columns. An edge record from
// another source leaves the edge alone and becomes an edge_sources evidence row (P4.10).
import type { CompanyEnrichmentRecord, TablesInsert } from '@sarvis/core';
import { uniqueSlug } from '@sarvis/core';

import type { ServiceClient } from '../client.ts';
import { byteaHash, roundTo, sameValue } from '../change.ts';
import { type KeyedSpec, type WriteResult, emptyWriteResult, upsertKeyed } from '../keyed.ts';
import { type AnyRow, selectIn, updateById } from '../query.ts';
import {
  type DomainWriter,
  keyOf,
  loadSources,
  provOf,
  resolverFor,
  unknownRef,
  writeRecords,
} from './common.ts';
import type { RefResolver } from '../refs.ts';
import {
  OWNER_BLOCKED_REASON,
  OWNER_LIMITS,
  type ReviewItem,
  ReviewNotes,
  approveEdges,
  autoSourceIds,
  queueForReview,
} from './review.ts';

/** Statuses only an admin sets. A row in one of them is frozen against imports. */
const ADMIN_STATUSES = new Set(['merged', 'rejected']);

function entitySpec<P extends AnyRow & { slug: string; wikidata_qid?: string | null }>(
  table: 'companies' | 'brands',
  columns: string,
): KeyedSpec<P> {
  return {
    table,
    columns,
    async load(db, payloads) {
      const bySlug = await selectIn(
        db,
        table,
        columns,
        'slug',
        payloads.map((p) => p.slug),
      );
      const byQid = await selectIn(
        db,
        table,
        columns,
        'wikidata_qid',
        payloads.map((p) => p.wikidata_qid),
      );
      return [...bySlug, ...byQid];
    },
    keys: (r) => [
      r.wikidata_qid ? `qid:${r.wikidata_qid as string}` : null,
      `slug:${r.slug as string}`,
    ],
    label: (p) => p.slug,
    // The source that created the row keeps its +prov block (review M-6, D-095), so the
    // auto-approve guard keeps seeing it. Another source's field changes are still written.
    keep: ['slug', 'source_id'],
    creator: 'keep_prov',
    frozen: (stored) => ADMIN_STATUSES.has(stored.status as string),
    conflict: (stored, p) =>
      stored.slug === p.slug &&
      stored.wikidata_qid &&
      p.wikidata_qid &&
      stored.wikidata_qid !== p.wikidata_qid
        ? `Slug ${p.slug} already belongs to ${stored.wikidata_qid as string}, not ${p.wikidata_qid}.`
        : null,
  };
}

/** Slugs tried for one base, in uniqueSlug's order; enough that a miss is a real anomaly. */
function slugCandidates(base: string, country?: string | null): string[] {
  const out = [base];
  const stem = country ? `${base}-${country.toLowerCase()}` : base;
  if (country) out.push(stem);
  for (let n = 2; n <= 50; n++) out.push(`${stem}-${n}`);
  return out;
}

/**
 * A record with a Wikidata QID is matched by its QID only (D-065): it never merges into a row
 * that lacks that QID (a legacy row with the same name stays separate until an admin merges
 * them). So its slug is the stored row's when the QID is known, and otherwise the first free one
 * in the DATA_MODEL §1.3 order (`base`, `base-{country}`, then `-2` …). Records without a QID
 * keep the slug they came with.
 */
export async function assignEntitySlugs<
  R extends { slug: string; wikidata_qid?: string | null; country?: string | null },
>(db: ServiceClient, table: 'companies' | 'brands', records: R[]): Promise<R[]> {
  const withQid = records.filter((r) => r.wikidata_qid);
  if (withQid.length === 0) return records;
  const byQid = new Map(
    (
      await selectIn(
        db,
        table,
        'slug, wikidata_qid',
        'wikidata_qid',
        withQid.map((r) => r.wikidata_qid),
      )
    ).map((row) => [row.wikidata_qid as string, row.slug as string]),
  );
  const candidates = withQid.flatMap((r) =>
    byQid.has(r.wikidata_qid as string) ? [] : slugCandidates(r.slug, r.country),
  );
  const taken = new Set(
    (await selectIn(db, table, 'slug', 'slug', candidates)).map((row) => row.slug as string),
  );
  for (const r of records) if (!r.wikidata_qid) taken.add(r.slug);
  for (const slug of byQid.values()) taken.add(slug);
  return records.map((r) => {
    if (!r.wikidata_qid) return r;
    const stored = byQid.get(r.wikidata_qid);
    const slug = stored ?? uniqueSlug(r.slug, taken, r.country);
    taken.add(slug);
    return slug === r.slug ? r : { ...r, slug };
  });
}

const COMPANY_COLUMNS =
  'id, slug, name, legal_name, aliases, kind, country, headquarters, founded_year, ownership_type, ' +
  'stock_ticker, website, description, logo_url, ceo, revenue_range, wikidata_qid, wikipedia_title, ' +
  'wikipedia_revision_id, sec_cik, corp_canada_number, opencorporates_id, status, locked_fields, ' +
  'review_status, source_id, source_url, method';

/**
 * `companies.sec_cik` is unique, but Wikidata sometimes gives two items one CIK (a company and
 * its renamed successor, or a duplicate item). The company that holds a CIK first keeps it; a
 * later company with another QID is written without it, so one shared CIK doesn't lose the row
 * and its edges (P3.13). `heldBy` maps a stored CIK to its company's QID (null for none).
 * Only records with a QID are checked.
 */
export function withoutTakenCiks<
  R extends { sec_cik?: string | null; wikidata_qid?: string | null },
>(records: R[], heldBy: ReadonlyMap<string, string | null>): R[] {
  const owner = new Map(heldBy);
  return records.map((r) => {
    // A record without a QID matches by slug and may hold its own CIK: the database decides.
    const qid = r.wikidata_qid;
    if (!r.sec_cik || !qid) return r;
    if (!owner.has(r.sec_cik)) {
      owner.set(r.sec_cik, qid);
      return r;
    }
    return owner.get(r.sec_cik) === qid ? r : { ...r, sec_cik: null };
  });
}

async function freeCiks<R extends { sec_cik?: string | null; wikidata_qid?: string | null }>(
  db: ServiceClient,
  records: R[],
): Promise<R[]> {
  const stored = await selectIn(
    db,
    'companies',
    'sec_cik, wikidata_qid',
    'sec_cik',
    records.map((r) => r.sec_cik),
  );
  return withoutTakenCiks(
    records,
    new Map(stored.map((s) => [s.sec_cik as string, (s.wikidata_qid as string | null) ?? null])),
  );
}

export function companyWriter(db: ServiceClient): DomainWriter<'company'> {
  const spec = entitySpec<TablesInsert<'companies'>>('companies', COMPANY_COLUMNS);
  return {
    async upsert(records, ctx) {
      const refs = resolverFor(db, ctx);
      await loadSources(refs, records);
      return writeRecords({
        db,
        kind: 'company',
        spec,
        records: await freeCiks(db, await assignEntitySlugs(db, 'companies', records)),
        refs,
        ctx,
        build: ({ source_key: _s, review_reason: _r, ...fields }, prov) => ({ ...fields, ...prov }),
      });
    },
  };
}

const BRAND_COLUMNS =
  'id, slug, name, aliases, wikidata_qid, website, logo_url, description, is_private_label, status, ' +
  'locked_fields, review_status, source_id, source_url, method';

export function brandWriter(db: ServiceClient): DomainWriter<'brand'> {
  const spec = entitySpec<TablesInsert<'brands'>>('brands', BRAND_COLUMNS);
  return {
    async upsert(records, ctx) {
      const refs = resolverFor(db, ctx);
      await loadSources(refs, records);
      return writeRecords({
        db,
        kind: 'brand',
        spec,
        records: await assignEntitySlugs(db, 'brands', records),
        refs,
        ctx,
        build: ({ source_key: _s, review_reason: _r, ...fields }, prov) => ({ ...fields, ...prov }),
      });
    },
  };
}

const EDGE_PROV = 'source_id, source_url, method';
/** An edge's full match key (endpoints, relation and start); labels leave the start out. */
const edgeKey = <P extends AnyRow>(spec: KeyedSpec<P>, p: P) => String(spec.keys(p)[0]);
/**
 * A person's approve or reject freezes an edge against imports. A rule's approval (D-054,
 * `decision_method = 'auto'`) doesn't, so Wikidata can still add an end date to an edge it
 * approved (P3.13).
 */
export const reviewed = (stored: AnyRow) =>
  stored.review_status !== 'pending' && stored.decision_method !== 'auto';

type EdgeTable = 'brand_ownership' | 'company_ownership';
type EdgeSourcePayload = TablesInsert<'edge_sources'>;

/** The edge_sources column that names an edge of each table. */
const EVIDENCE_COLUMN = {
  brand_ownership: 'brand_ownership_id',
  company_ownership: 'company_ownership_id',
} as const;

const EDGE_SOURCE_COLUMNS =
  'id, brand_ownership_id, company_ownership_id, source_id, source_url, last_seen_at, ' +
  'content_hash, method, confidence, ai_call_id';

/**
 * One evidence row per (edge, source) for a source that confirms an edge another source created
 * (P4.10, D-095). Hashed like company_sources: a re-sighting only bumps `last_seen_at`.
 */
export function edgeSourceSpec(table: EdgeTable): KeyedSpec<EdgeSourcePayload> {
  const column = EVIDENCE_COLUMN[table];
  return {
    table: 'edge_sources',
    columns: EDGE_SOURCE_COLUMNS,
    load: (db, payloads) =>
      selectIn(
        db,
        'edge_sources',
        EDGE_SOURCE_COLUMNS,
        column,
        payloads.map((p) => p[column]),
      ),
    keys: (r) => [r[column] ? `${r[column] as string}:${r.source_id as string}` : null],
    label: (p) => `${table}:${p[column] ?? ''}:${p.source_id}`,
    hashed: true,
    keep: [column, 'source_id'],
    touch: ['last_seen_at'],
  };
}

/** The evidence row a foreign source's edge payload becomes. */
export function evidenceOf(
  table: EdgeTable,
  edgeId: string | number,
  p: AnyRow,
): EdgeSourcePayload {
  return {
    [EVIDENCE_COLUMN[table]]: String(edgeId),
    source_id: p.source_id as string,
    source_url: (p.source_url as string | null) ?? null,
    fetched_at: p.fetched_at as string,
    last_seen_at: p.fetched_at as string,
    method: p.method as string,
    method_version: p.method_version as string,
    confidence: (p.confidence as number | null | undefined) ?? null,
    ai_call_id: (p.ai_call_id as number | null | undefined) ?? null,
    ingestion_run_id: (p.ingestion_run_id as string | null | undefined) ?? null,
    raw_object_id: (p.raw_object_id as string | null | undefined) ?? null,
  };
}

/**
 * The rest of an edge batch after its payloads are built: upsert the edges (an edge another
 * source created is left alone, `keep_row`), approve by rule, record each confirming source in
 * edge_sources, and queue the review reasons plus every owner pick the one-current-owner index
 * refused, which is also reported as a run event (review M-5). A confirming record counts
 * `updated` when its evidence row is new or changed, else `unchanged`.
 */
async function finishEdges<P extends AnyRow>(
  db: ServiceClient,
  refs: RefResolver,
  spec: KeyedSpec<P>,
  payloads: P[],
  notes: ReviewNotes,
  held: ReadonlySet<string>,
  /** The record key of each payload, by edgeKey, for the event's examples. */
  labels: ReadonlyMap<string, string>,
): Promise<WriteResult> {
  const table = spec.table as EdgeTable;
  const key = (p: P) => edgeKey(spec, p);
  const out = await upsertKeyed(db, spec, payloads);
  const result: WriteResult = { ...out.result, rejected: [...out.result.rejected] };

  const { blocked } = await approveEdges(
    db,
    OWNER_LIMITS[table],
    out.rows.filter((r) => !r.foreign),
    autoSourceIds(refs, table),
    held,
    key,
    spec.frozen,
  );

  const evidence = new Map<string, EdgeSourcePayload>();
  const evSpec = edgeSourceSpec(table);
  for (const r of out.rows) {
    if (!r.foreign) continue;
    const row = evidenceOf(table, r.id, r.payload);
    evidence.set(evSpec.label(row), row);
  }
  if (evidence.size > 0) {
    const ev = await upsertKeyed(db, evSpec, [...evidence.values()]);
    // upsertKeyed counted every confirming record `unchanged`; move the ones whose evidence changed.
    const changed = ev.result.inserted + ev.result.updated;
    result.unchanged -= changed + ev.result.rejected.length;
    result.updated += changed;
    result.rejected.push(...ev.result.rejected);
  }

  const blockedItems: ReviewItem[] = blocked.map((r) => ({
    item_type: table,
    item_table: table,
    item_id: String(r.id),
    reason: OWNER_BLOCKED_REASON,
  }));
  // The blocked reason comes first, so it wins over a record's own reason for the same edge.
  await queueForReview(db, [...blockedItems, ...notes.items(spec, out.rows)]);
  if (blocked.length > 0) {
    const child = OWNER_LIMITS[table].child;
    result.events = [
      {
        severity: 'warn',
        eventType: 'owner_change_blocked',
        message:
          `${blocked.length} ${table} owner pick(s) left pending: the ${child} already has, or ` +
          'shares this batch with, another current owner. Queued for review.',
        details: {
          table,
          count: blocked.length,
          examples: blocked.slice(0, 5).map((r) => ({
            key: labels.get(key(r.payload)) ?? spec.label(r.payload),
            edge_id: r.id,
          })),
        },
      },
    ];
  }
  return result;
}

const BRAND_EDGE_COLUMNS = `id, brand_id, company_id, relation, valid_from, valid_to, confidence, ai_call_id, review_status, decision_method, ${EDGE_PROV}`;

const brandEdgeSpec: KeyedSpec<TablesInsert<'brand_ownership'>> = {
  table: 'brand_ownership',
  columns: BRAND_EDGE_COLUMNS,
  load: (db, payloads) =>
    selectIn(
      db,
      'brand_ownership',
      BRAND_EDGE_COLUMNS,
      'brand_id',
      payloads.map((p) => p.brand_id),
    ),
  keys: (r) => [
    `${r.brand_id as string}>${r.company_id as string}:${r.relation as string}@${(r.valid_from as string | null) ?? ''}`,
  ],
  label: (p) => `${p.brand_id}>${p.company_id}:${p.relation}`,
  keep: ['brand_id', 'company_id', 'relation', 'valid_from'],
  frozen: reviewed,
  creator: 'keep_row',
};

export function brandOwnershipWriter(db: ServiceClient): DomainWriter<'brand_ownership'> {
  return {
    async upsert(records, ctx) {
      const refs = resolverFor(db, ctx);
      await loadSources(refs, records);
      await refs.loadSlugs(
        'brands',
        records.map((r) => r.brand_slug),
      );
      await refs.loadSlugs(
        'companies',
        records.map((r) => r.company_slug),
      );
      await refs.loadQids(
        'brands',
        records.map((r) => r.brand_qid),
      );
      await refs.loadQids(
        'companies',
        records.map((r) => r.company_qid),
      );
      const result: WriteResult = emptyWriteResult();
      const notes = new ReviewNotes();
      const held = new Set<string>();
      const labels = new Map<string, string>();
      const payloads = records.flatMap((r): TablesInsert<'brand_ownership'>[] => {
        const key = keyOf('brand_ownership', r);
        const prov = provOf(r, refs, ctx);
        const brandId = refs.entity('brands', { qid: r.brand_qid, slug: r.brand_slug });
        const companyId = refs.entity('companies', { qid: r.company_qid, slug: r.company_slug });
        const missing = !prov
          ? `source ${r.source_key}`
          : !brandId
            ? `brand ${r.brand_qid ?? r.brand_slug}`
            : !companyId
              ? `company ${r.company_qid ?? r.company_slug}`
              : null;
        if (missing || !prov || !brandId || !companyId) {
          result.rejected.push(unknownRef(key, missing ?? 'reference'));
          return [];
        }
        const payload = {
          brand_id: brandId,
          company_id: companyId,
          relation: r.relation,
          valid_from: r.valid_from ?? null,
          valid_to: r.valid_to ?? null,
          confidence: roundTo(r.confidence, 2),
          ai_call_id: r.ai_call_id ?? null,
          ...prov,
        };
        notes.add(brandEdgeSpec.label(payload), r);
        labels.set(edgeKey(brandEdgeSpec, payload), key);
        if (r.auto_hold) held.add(edgeKey(brandEdgeSpec, payload));
        return [payload];
      });
      const out = await finishEdges(db, refs, brandEdgeSpec, payloads, notes, held, labels);
      return { ...out, rejected: [...result.rejected, ...out.rejected] };
    },
  };
}

const COMPANY_EDGE_COLUMNS = `id, parent_company_id, child_company_id, relation, share_pct, valid_from, valid_to, confidence, ai_call_id, review_status, decision_method, ${EDGE_PROV}`;

const companyEdgeSpec: KeyedSpec<TablesInsert<'company_ownership'>> = {
  table: 'company_ownership',
  columns: COMPANY_EDGE_COLUMNS,
  load: (db, payloads) =>
    selectIn(
      db,
      'company_ownership',
      COMPANY_EDGE_COLUMNS,
      'child_company_id',
      payloads.map((p) => p.child_company_id),
    ),
  keys: (r) => [
    `${r.parent_company_id as string}>${r.child_company_id as string}:${r.relation as string}@${(r.valid_from as string | null) ?? ''}`,
  ],
  label: (p) => `${p.parent_company_id}>${p.child_company_id}:${p.relation}`,
  keep: ['parent_company_id', 'child_company_id', 'relation', 'valid_from'],
  frozen: reviewed,
  creator: 'keep_row',
};

export function companyOwnershipWriter(db: ServiceClient): DomainWriter<'company_ownership'> {
  return {
    async upsert(records, ctx) {
      const refs = resolverFor(db, ctx);
      await loadSources(refs, records);
      await refs.loadSlugs(
        'companies',
        records.flatMap((r) => [r.parent_company_slug, r.child_company_slug]),
      );
      await refs.loadQids(
        'companies',
        records.flatMap((r) => [r.parent_company_qid, r.child_company_qid]),
      );
      const result: WriteResult = emptyWriteResult();
      const notes = new ReviewNotes();
      const held = new Set<string>();
      const labels = new Map<string, string>();
      const payloads = records.flatMap((r): TablesInsert<'company_ownership'>[] => {
        const key = keyOf('company_ownership', r);
        const prov = provOf(r, refs, ctx);
        const parentId = refs.entity('companies', {
          qid: r.parent_company_qid,
          slug: r.parent_company_slug,
        });
        const childId = refs.entity('companies', {
          qid: r.child_company_qid,
          slug: r.child_company_slug,
        });
        const missing = !prov
          ? `source ${r.source_key}`
          : !parentId
            ? `company ${r.parent_company_qid ?? r.parent_company_slug}`
            : !childId
              ? `company ${r.child_company_qid ?? r.child_company_slug}`
              : null;
        if (missing || !prov || !parentId || !childId) {
          result.rejected.push(unknownRef(key, missing ?? 'reference'));
          return [];
        }
        const payload = {
          parent_company_id: parentId,
          child_company_id: childId,
          relation: r.relation,
          share_pct: roundTo(r.share_pct, 2),
          valid_from: r.valid_from ?? null,
          valid_to: r.valid_to ?? null,
          confidence: roundTo(r.confidence, 2),
          ai_call_id: r.ai_call_id ?? null,
          ...prov,
        };
        notes.add(companyEdgeSpec.label(payload), r);
        labels.set(edgeKey(companyEdgeSpec, payload), key);
        if (r.auto_hold) held.add(edgeKey(companyEdgeSpec, payload));
        return [payload];
      });
      const out = await finishEdges(db, refs, companyEdgeSpec, payloads, notes, held, labels);
      return { ...out, rejected: [...result.rejected, ...out.rejected] };
    },
  };
}

/** The keys an enrichment can name its company by, most specific first. */
const MATCH_KEYS = ['wikidata_qid', 'slug', 'sec_cik', 'corp_canada_number'] as const;

const ENRICH_COLUMNS =
  'id, slug, wikidata_qid, sec_cik, corp_canada_number, legal_name, headquarters, founded_year, ' +
  'website, wikipedia_title, wikipedia_revision_id, opencorporates_id, wikipedia_document_id, ' +
  'status, locked_fields';

export interface EnrichmentPlan {
  /** Unlocked columns whose value changes. */
  patch: AnyRow;
  /** Every column that holds this source's value afterwards (company_sources.fields), sorted. */
  held: string[];
  /** Locked columns whose stored value differs and stays. */
  locked: string[];
}

/** What an enrichment writes on a stored company: changes to unlocked columns only (D-046). */
export function planEnrichment(stored: AnyRow, values: AnyRow): EnrichmentPlan {
  const lockedFields = new Set((stored.locked_fields as string[] | null | undefined) ?? []);
  const plan: EnrichmentPlan = { patch: {}, held: [], locked: [] };
  for (const [column, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (sameValue(stored[column], value)) plan.held.push(column);
    else if (lockedFields.has(column)) plan.locked.push(column);
    else {
      plan.patch[column] = value;
      plan.held.push(column);
    }
  }
  plan.held.sort();
  return plan;
}

/** The company an enrichment names, or why it can't be used. */
export function matchCompany(
  match: CompanyEnrichmentRecord['match'],
  byKey: ReadonlyMap<string, AnyRow>,
): AnyRow | { problem: string } {
  const found = MATCH_KEYS.flatMap((k) => {
    const row = match[k] ? byKey.get(`${k}:${match[k]}`) : undefined;
    return row ? [row] : [];
  });
  if (found.length === 0) return { problem: 'Unknown company; the record was not written.' };
  const company = found[0] as AnyRow;
  // A key the company already holds with another value is a different company, not a gap.
  const clash = MATCH_KEYS.some((k) => match[k] && company[k] != null && company[k] !== match[k]);
  if (clash || new Set(found.map((r) => r.id)).size > 1) {
    return { problem: 'The match keys point at different companies; the record was not written.' };
  }
  return company;
}

type CompanySourcePayload = TablesInsert<'company_sources'>;

const COMPANY_SOURCE_COLUMNS =
  'id, company_id, source_id, external_id, source_url, last_seen_at, content_hash, method, fields';
/** upsertKeyed's hash for a hashed spec whose touch column is `last_seen_at`. */
const COMPANY_SOURCE_HASH_OMIT = ['content_hash', 'last_seen_at'];

export const companySourceSpec: KeyedSpec<CompanySourcePayload> = {
  table: 'company_sources',
  columns: COMPANY_SOURCE_COLUMNS,
  load: (db, payloads) =>
    selectIn(
      db,
      'company_sources',
      COMPANY_SOURCE_COLUMNS,
      'company_id',
      payloads.map((p) => p.company_id),
    ),
  keys: (r) => [`${r.company_id as string}:${r.source_id as string}`],
  label: (p) => `${p.company_id}:${p.source_id}`,
  hashed: true,
  keep: ['company_id', 'source_id'],
  touch: ['last_seen_at'],
};

/**
 * Counts per record: `updated` when the company or this source's company_sources row changed,
 * `unchanged` when neither did, `skipped_locked` for a merged or rejected company or when every
 * value differs from a locked field. An enrichment never inserts a company, so `inserted` stays 0.
 */
export function companyEnrichmentWriter(db: ServiceClient): DomainWriter<'company_enrichment'> {
  return {
    async upsert(records, ctx) {
      const refs = resolverFor(db, ctx);
      await loadSources(refs, records);
      const result = emptyWriteResult();

      const byKey = new Map<string, AnyRow>();
      for (const k of MATCH_KEYS) {
        const rows = await selectIn(
          db,
          'companies',
          ENRICH_COLUMNS,
          k,
          records.map((r) => r.match[k]),
        );
        for (const row of rows) byKey.set(`${k}:${row[k] as string}`, row);
      }
      const documents = await selectIn(
        db,
        'documents',
        'id, url_normalized, kind',
        'url_normalized',
        records.map((r) => r.fields.wikipedia_document_url),
      );
      const documentByUrl = new Map(documents.map((d) => [d.url_normalized as string, d]));

      const planned: {
        companyId: string;
        changed: boolean;
        source: CompanySourcePayload;
      }[] = [];
      const patches: { id: string; patch: AnyRow; key: string }[] = [];
      for (const r of records) {
        const key = keyOf('company_enrichment', r);
        const prov = provOf(r, refs, ctx);
        if (!prov) {
          result.rejected.push(unknownRef(key, `source ${r.source_key}`));
          continue;
        }
        const company = matchCompany(r.match, byKey);
        if ('problem' in company) {
          result.rejected.push({ key, message: company.problem as string });
          continue;
        }
        if (ADMIN_STATUSES.has(company.status as string)) {
          result.skipped_locked++;
          continue;
        }
        const { wikipedia_document_url: documentUrl, ...values } = r.fields;
        const columns: AnyRow = { ...values };
        if (documentUrl) {
          const doc = documentByUrl.get(documentUrl);
          if (doc?.kind !== 'wikipedia') {
            result.rejected.push(unknownRef(key, `wikipedia document ${documentUrl}`));
            continue;
          }
          columns.wikipedia_document_id = doc.id;
        }
        const plan = planEnrichment(company, columns);
        if (plan.held.length === 0) {
          result.skipped_locked++;
          continue;
        }
        const companyId = company.id as string;
        const changed = Object.keys(plan.patch).length > 0;
        // Only the field columns: the company's +prov block stays with the source that made it.
        if (changed) patches.push({ id: companyId, patch: plan.patch, key });
        planned.push({
          companyId,
          changed,
          source: {
            company_id: companyId,
            source_id: prov.source_id,
            external_id: r.external_id,
            source_url: prov.source_url,
            fetched_at: prov.fetched_at,
            last_seen_at: prov.fetched_at,
            method: prov.method,
            method_version: prov.method_version,
            fields: plan.held,
            ingestion_run_id: prov.ingestion_run_id,
            raw_object_id: prov.raw_object_id,
          },
        });
      }

      const failed = await updateById(db, 'companies', patches);
      const failedIds = new Set(failed.map((e) => e.row.id));
      for (const e of failed) result.rejected.push({ key: e.row.key, message: e.message });
      const live = planned.filter((p) => !failedIds.has(p.companyId));

      const out = await upsertKeyed(
        db,
        companySourceSpec,
        live.map((p) => p.source),
      );
      result.rejected.push(...out.result.rejected);
      const sourceRows = new Map(out.rows.map((row) => [row.payload.company_id, row]));
      for (const p of live) {
        const row = sourceRows.get(p.companyId);
        if (!row) continue; // Rejected by upsertKeyed, already reported.
        const sourceChanged =
          row.stored === null ||
          row.stored.content_hash !== byteaHash(p.source, COMPANY_SOURCE_HASH_OMIT);
        if (p.changed || sourceChanged) result.updated++;
        else result.unchanged++;
      }
      return result;
    },
  };
}
