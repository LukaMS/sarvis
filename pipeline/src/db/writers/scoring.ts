// Company scores, certifications and company events (DATA_MODEL §3.6, D-038). Every row arrives
// `pending`, and a reviewed row is left alone. Legacy scores key on (company, category); AI and
// manual scores are append-only events, so they are always inserted.
import type { TablesInsert } from '@sarvis/core';

import type { ServiceClient } from '../client.ts';
import type { KeyedSpec } from '../keyed.ts';
import { type AnyRow, selectIn } from '../query.ts';
import { type DomainWriter, loadSources, resolverFor, writeRecords } from './common.ts';

const reviewed = (stored: AnyRow) => stored.review_status !== 'pending';
const PROV = 'review_status, source_id, source_url, method';

type ScorePayload = TablesInsert<'company_scores'>;

const SCORE_COLUMNS = `id, company_id, rubric_id, category, rating, score, grade, rationale, confidence, model, ai_call_id, ${PROV}`;

const scoreSpec: KeyedSpec<ScorePayload> = {
  table: 'company_scores',
  columns: SCORE_COLUMNS,
  load: (db, payloads) =>
    selectIn(
      db,
      'company_scores',
      SCORE_COLUMNS,
      'company_id',
      payloads.filter((p) => p.method === 'legacy-import').map((p) => p.company_id),
      (q) => q.eq('method', 'legacy-import'),
    ),
  keys: (r) => [
    r.method === 'legacy-import' && `legacy:${r.company_id as string}:${r.category as string}`,
  ],
  label: (p) => `${p.company_id}:${p.category}@${p.method === 'legacy-import' ? '' : p.fetched_at}`,
  keep: ['company_id', 'category'],
  frozen: reviewed,
};

export function companyScoreWriter(db: ServiceClient): DomainWriter<'company_score'> {
  return {
    async upsert(records, ctx) {
      const refs = resolverFor(db, ctx);
      await loadSources(refs, records);
      await refs.loadSlugs(
        'companies',
        records.map((r) => r.company_slug),
      );
      const rubrics = new Map(
        (
          await selectIn(
            db,
            'rubrics',
            'id, version',
            'version',
            records.map((r) => r.rubric_version),
          )
        ).map((r) => [r.version as string, r.id as string]),
      );
      return writeRecords({
        db,
        kind: 'company_score',
        spec: scoreSpec,
        records,
        refs,
        ctx,
        build: (r, prov) => {
          const companyId = refs.slug('companies', r.company_slug);
          if (!companyId) return { missing: `company ${r.company_slug}` };
          const rubricId = r.rubric_version ? rubrics.get(r.rubric_version) : null;
          if (rubricId === undefined) return { missing: `rubric ${r.rubric_version}` };
          return {
            company_id: companyId,
            rubric_id: rubricId,
            category: r.category,
            rating: r.rating ?? null,
            score: r.score ?? null,
            grade: r.grade ?? null,
            rationale: r.rationale ?? null,
            confidence: r.confidence ?? null,
            model: r.model ?? null,
            ai_call_id: r.ai_call_id ?? null,
            ...prov,
            method: r.method as ScorePayload['method'],
          };
        },
      });
    },
  };
}

type CertificationPayload = TablesInsert<'certifications'>;

const CERTIFICATION_COLUMNS = `id, company_id, brand_id, product_id, scheme, scheme_name, status, certified_on, expires_on, score, ${PROV}`;

const certificationSpec: KeyedSpec<CertificationPayload> = {
  table: 'certifications',
  columns: CERTIFICATION_COLUMNS,
  async load(db, payloads) {
    const rows: AnyRow[] = [];
    for (const column of ['company_id', 'brand_id', 'product_id'] as const) {
      rows.push(
        ...(await selectIn(
          db,
          'certifications',
          CERTIFICATION_COLUMNS,
          column,
          payloads.map((p) => p[column]),
        )),
      );
    }
    return rows;
  },
  keys: (r) => [
    [r.company_id, r.brand_id, r.product_id, r.scheme, r.scheme_name].map((v) => v ?? '').join('|'),
  ],
  label: (p) =>
    [p.company_id, p.brand_id, p.product_id, p.scheme, p.scheme_name].map((v) => v ?? '').join('|'),
  keep: ['company_id', 'brand_id', 'product_id', 'scheme', 'scheme_name'],
  frozen: reviewed,
};

export function certificationWriter(db: ServiceClient): DomainWriter<'certification'> {
  return {
    async upsert(records, ctx) {
      const refs = resolverFor(db, ctx);
      await loadSources(refs, records);
      await refs.loadSlugs(
        'companies',
        records.map((r) => r.company_slug),
      );
      await refs.loadSlugs(
        'brands',
        records.map((r) => r.brand_slug),
      );
      await refs.loadProducts(records.map((r) => r.product));
      return writeRecords({
        db,
        kind: 'certification',
        spec: certificationSpec,
        records,
        refs,
        ctx,
        build: (r, prov) => {
          const companyId = r.company_slug ? refs.slug('companies', r.company_slug) : null;
          const brandId = r.brand_slug ? refs.slug('brands', r.brand_slug) : null;
          const productId = r.product ? refs.product(r.product) : null;
          if (companyId === undefined) return { missing: `company ${r.company_slug}` };
          if (brandId === undefined) return { missing: `brand ${r.brand_slug}` };
          if (productId === undefined) return { missing: 'product' };
          return {
            company_id: companyId,
            brand_id: brandId,
            product_id: productId,
            scheme: r.scheme,
            scheme_name: r.scheme_name ?? null,
            status: r.status,
            certified_on: r.certified_on ?? null,
            expires_on: r.expires_on ?? null,
            score: r.score ?? null,
            ...prov,
          };
        },
      });
    },
  };
}

type EventPayload = TablesInsert<'company_events'>;

const EVENT_COLUMNS = `id, company_id, kind, title, description, event_date, date_text, status, severity, ${PROV}`;

const eventSpec: KeyedSpec<EventPayload> = {
  table: 'company_events',
  columns: EVENT_COLUMNS,
  load: (db, payloads) =>
    selectIn(
      db,
      'company_events',
      EVENT_COLUMNS,
      'company_id',
      payloads.map((p) => p.company_id),
    ),
  keys: (r) => [
    `${r.company_id as string}:${r.kind as string}:${r.title as string}@${(r.event_date as string | null) ?? ''}`,
  ],
  label: (p) => `${p.company_id}:${p.kind}:${p.title}@${p.event_date ?? ''}`,
  keep: ['company_id', 'kind', 'title', 'event_date'],
  frozen: reviewed,
};

export function companyEventWriter(db: ServiceClient): DomainWriter<'company_event'> {
  return {
    async upsert(records, ctx) {
      const refs = resolverFor(db, ctx);
      await loadSources(refs, records);
      await refs.loadSlugs(
        'companies',
        records.map((r) => r.company_slug),
      );
      return writeRecords({
        db,
        kind: 'company_event',
        spec: eventSpec,
        records,
        refs,
        ctx,
        build: (r, prov) => {
          const companyId = refs.slug('companies', r.company_slug);
          if (!companyId) return { missing: `company ${r.company_slug}` };
          return {
            company_id: companyId,
            kind: r.kind,
            title: r.title,
            description: r.description ?? null,
            event_date: r.event_date ?? null,
            date_text: r.date_text ?? null,
            status: r.status,
            severity: r.severity ?? null,
            ...prov,
          };
        },
      });
    },
  };
}
