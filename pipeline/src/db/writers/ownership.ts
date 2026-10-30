// Companies, brands and their ownership edges (DATA_MODEL §3.2). Companies and brands key on the
// Wikidata QID, then the slug; the slug never changes once written. All of them arrive `pending`
// and no import changes `review_status` (D-052). A reviewed company or brand still takes updates to
// its unlocked fields; a reviewed edge is left alone.
//
// A second source (Wikipedia, SEC EDGAR, Corporations Canada) fills in fields on a company it
// didn't create with company_enrichment records. The company keeps its own +prov block, and the
// enriching source's provenance goes to company_sources (P3.4).
import type { CompanyEnrichmentRecord, TablesInsert } from '@sarvis/core';

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
import { ReviewNotes, queueNotes } from './review.ts';

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
    keep: ['slug'],
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

const COMPANY_COLUMNS =
  'id, slug, name, legal_name, aliases, kind, country, headquarters, founded_year, ownership_type, ' +
  'stock_ticker, website, description, logo_url, ceo, revenue_range, wikidata_qid, wikipedia_title, ' +
  'wikipedia_revision_id, sec_cik, corp_canada_number, opencorporates_id, status, locked_fields, ' +
  'source_id, source_url, method';

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
        records,
        refs,
        ctx,
        build: ({ source_key: _s, review_reason: _r, ...fields }, prov) => ({ ...fields, ...prov }),
      });
    },
  };
}

const BRAND_COLUMNS =
  'id, slug, name, aliases, wikidata_qid, website, logo_url, description, is_private_label, status, ' +
  'locked_fields, source_id, source_url, method';

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
        records,
        refs,
        ctx,
        build: ({ source_key: _s, review_reason: _r, ...fields }, prov) => ({ ...fields, ...prov }),
      });
    },
  };
}

const EDGE_PROV = 'source_id, source_url, method';
const reviewed = (stored: AnyRow) => stored.review_status !== 'pending';

const BRAND_EDGE_COLUMNS = `id, brand_id, company_id, relation, valid_from, valid_to, confidence, ai_call_id, review_status, ${EDGE_PROV}`;

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
      const result: WriteResult = emptyWriteResult();
      const notes = new ReviewNotes();
      const payloads = records.flatMap((r): TablesInsert<'brand_ownership'>[] => {
        const key = keyOf('brand_ownership', r);
        const prov = provOf(r, refs, ctx);
        const brandId = refs.slug('brands', r.brand_slug);
        const companyId = refs.slug('companies', r.company_slug);
        const missing = !prov
          ? `source ${r.source_key}`
          : !brandId
            ? `brand ${r.brand_slug}`
            : !companyId
              ? `company ${r.company_slug}`
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
        return [payload];
      });
      const out = await upsertKeyed(db, brandEdgeSpec, payloads);
      await queueNotes(db, brandEdgeSpec, notes, out);
      return { ...out.result, rejected: [...result.rejected, ...out.result.rejected] };
    },
  };
}

const COMPANY_EDGE_COLUMNS = `id, parent_company_id, child_company_id, relation, share_pct, valid_from, valid_to, confidence, ai_call_id, review_status, ${EDGE_PROV}`;

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
      const result: WriteResult = emptyWriteResult();
      const notes = new ReviewNotes();
      const payloads = records.flatMap((r): TablesInsert<'company_ownership'>[] => {
        const key = keyOf('company_ownership', r);
        const prov = provOf(r, refs, ctx);
        const parentId = refs.slug('companies', r.parent_company_slug);
        const childId = refs.slug('companies', r.child_company_slug);
        const missing = !prov
          ? `source ${r.source_key}`
          : !parentId
            ? `company ${r.parent_company_slug}`
            : !childId
              ? `company ${r.child_company_slug}`
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
        return [payload];
      });
      const out = await upsertKeyed(db, companyEdgeSpec, payloads);
      await queueNotes(db, companyEdgeSpec, notes, out);
      return { ...out.result, rejected: [...result.rejected, ...out.result.rejected] };
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
