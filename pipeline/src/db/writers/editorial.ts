// Product features, transparency steps and stories (DATA_MODEL §3.7, D-039). Features key on
// (product, sort_order) and steps on (product, step), updated in place so review decisions
// survive; a reviewed row is left alone. Stories key on slug, and a published story is frozen.
import type { TablesInsert } from '@sarvis/core';

import type { ServiceClient } from '../client.ts';
import type { KeyedSpec } from '../keyed.ts';
import { type AnyRow, selectIn } from '../query.ts';
import { type DomainWriter, loadSources, resolverFor, writeRecords } from './common.ts';

const reviewed = (stored: AnyRow) => stored.review_status !== 'pending';
const PROV = 'source_id, source_url, method';

type FeaturePayload = TablesInsert<'product_features'>;

const FEATURE_COLUMNS = `id, product_id, icon, title, description, sort_order, review_status, ${PROV}`;

const featureSpec: KeyedSpec<FeaturePayload> = {
  table: 'product_features',
  columns: FEATURE_COLUMNS,
  load: (db, payloads) =>
    selectIn(
      db,
      'product_features',
      FEATURE_COLUMNS,
      'product_id',
      payloads.map((p) => p.product_id),
    ),
  keys: (r) => [`${r.product_id as string}#${r.sort_order as number}`],
  label: (p) => `${p.product_id}#${p.sort_order}`,
  keep: ['product_id', 'sort_order'],
  frozen: reviewed,
};

export function productFeatureWriter(db: ServiceClient): DomainWriter<'product_feature'> {
  return {
    async upsert(records, ctx) {
      const refs = resolverFor(db, ctx);
      await loadSources(refs, records);
      await refs.loadProducts(records.map((r) => r.product));
      return writeRecords({
        db,
        kind: 'product_feature',
        spec: featureSpec,
        records,
        refs,
        ctx,
        build: (r, prov) => {
          const productId = refs.product(r.product);
          if (!productId) return { missing: 'product' };
          return {
            product_id: productId,
            icon: r.icon,
            title: r.title,
            description: r.description ?? null,
            sort_order: r.sort_order,
            ...prov,
          };
        },
      });
    },
  };
}

type StepPayload = TablesInsert<'transparency_steps'>;

const STEP_COLUMNS = `id, product_id, step, title, description, review_status, ${PROV}`;

const stepSpec: KeyedSpec<StepPayload> = {
  table: 'transparency_steps',
  columns: STEP_COLUMNS,
  load: (db, payloads) =>
    selectIn(
      db,
      'transparency_steps',
      STEP_COLUMNS,
      'product_id',
      payloads.map((p) => p.product_id),
    ),
  keys: (r) => [`${r.product_id as string}:${r.step as string}`],
  label: (p) => `${p.product_id}:${p.step}`,
  keep: ['product_id', 'step'],
  frozen: reviewed,
};

export function transparencyStepWriter(db: ServiceClient): DomainWriter<'transparency_step'> {
  return {
    async upsert(records, ctx) {
      const refs = resolverFor(db, ctx);
      await loadSources(refs, records);
      await refs.loadProducts(records.map((r) => r.product));
      return writeRecords({
        db,
        kind: 'transparency_step',
        spec: stepSpec,
        records,
        refs,
        ctx,
        build: (r, prov) => {
          const productId = refs.product(r.product);
          if (!productId) return { missing: 'product' };
          return {
            product_id: productId,
            step: r.step,
            title: r.title,
            description: r.description ?? null,
            ...prov,
          };
        },
      });
    },
  };
}

type StoryPayload = TablesInsert<'stories'>;

const STORY_COLUMNS = `id, slug, title, subtitle, category, body, company_id, featured, published_at, ${PROV}`;

const storySpec: KeyedSpec<StoryPayload> = {
  table: 'stories',
  columns: STORY_COLUMNS,
  load: (db, payloads) =>
    selectIn(
      db,
      'stories',
      STORY_COLUMNS,
      'slug',
      payloads.map((p) => p.slug),
    ),
  keys: (r) => [`slug:${r.slug as string}`],
  label: (p) => `slug:${p.slug}`,
  keep: ['slug'],
  // Publishing is the review step, so an import never edits or unpublishes a published story.
  frozen: (stored) => stored.published_at != null,
};

export function storyWriter(db: ServiceClient): DomainWriter<'story'> {
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
        kind: 'story',
        spec: storySpec,
        records,
        refs,
        ctx,
        build: (r, prov) => {
          const companyId = r.company_slug ? refs.slug('companies', r.company_slug) : null;
          if (companyId === undefined) return { missing: `company ${r.company_slug}` };
          return {
            slug: r.slug,
            title: r.title,
            subtitle: r.subtitle ?? null,
            category: r.category ?? null,
            body: r.body ?? null,
            company_id: companyId,
            featured: r.featured,
            published_at: r.published_at ?? null,
            ...prov,
          };
        },
      });
    },
  };
}
