// Companies, brands and their ownership edges (DATA_MODEL §3.2). Companies and brands key on the
// Wikidata QID, then the slug; the slug never changes once written. All of them arrive `pending`
// and no import changes `review_status` (D-052). A reviewed company or brand still takes updates to
// its unlocked fields; a reviewed edge is left alone.
import type { TablesInsert } from '@sarvis/core';

import type { ServiceClient } from '../client.ts';
import { roundTo } from '../change.ts';
import { type KeyedSpec, type WriteResult, emptyWriteResult, upsertKeyed } from '../keyed.ts';
import { type AnyRow, selectIn } from '../query.ts';
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
