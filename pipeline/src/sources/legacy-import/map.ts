// Legacy export rows → records (DATA_MODEL §8, PLAN P2.18). Pure: each file's rows go in, record
// batches come out. Rows link to each other by legacy uuid, so the mappers take a LegacyIndex
// (built once from companies, brands and products) to turn those uuids into natural keys.
//
// Every reviewable fact gets a `review_reason`, so it lands in the review queue as `legacy_fact`.
// The P0.2 quality notes (docs/legacy/data/README.md) are added where they apply.
import {
  type RecordInputOf,
  type TransparencyStep,
  cleanText,
  normalizeGtin,
  slugify,
  uniqueSlug,
} from '@sarvis/core';

import type { RecordBatch } from '../source.ts';

export const LEGACY_KEY = 'legacy-import';
export const LEGACY_JOB = 'legacy-import';
export const LEGACY_VERSION = '1.0.0';
/** When P0.2 read the legacy database: the facts' `fetched_at`. */
export const LEGACY_EXPORTED_AT = '2026-10-26T00:00:00Z';

/** The files imported, in write order (foreign keys first). `app_settings` is config, not data. */
export const LEGACY_FILES = [
  'companies.json',
  'brands.json',
  'ethical_scores.json',
  'certifications.json',
  'boycotts.json',
  'controversies.json',
  'products.json',
  'product_features.json',
  'transparency_steps.json',
  'impact_stories.json',
] as const;
export type LegacyFile = (typeof LEGACY_FILES)[number];

export const UNREVIEWED =
  'Legacy import: no source URL, model, rubric or confidence. Cite or rescore before approving.';

export type Row = Record<string, unknown>;

const prov = {
  source_key: LEGACY_KEY,
  source_url: null,
  fetched_at: LEGACY_EXPORTED_AT,
  method: 'legacy-import',
  method_version: `${LEGACY_JOB}@${LEGACY_VERSION}`,
} as const;

const text = (v: unknown) => cleanText(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const reason = (...notes: (string | null | undefined | false)[]) =>
  [UNREVIEWED, ...notes.filter(Boolean)].join(' ');

export interface LegacyIndex {
  companySlug: Map<string, string>;
  /** Legacy brand id → generated slug, name and owner company id. */
  brands: Map<string, { slug: string; name: string; companyId: string | null }>;
}

/** Brand slugs per DATA_MODEL §1.3, unique across the export, in legacy id order. */
export function buildIndex(companies: Row[], brands: Row[]): LegacyIndex {
  const companySlug = new Map(companies.map((c) => [str(c.id), str(c.slug)]));
  const taken = new Set<string>();
  const index: LegacyIndex['brands'] = new Map();
  for (const b of brands) {
    const name = text(b.name) ?? '';
    const slug = str(b.slug) || uniqueSlug(slugify(name), taken);
    taken.add(slug);
    index.set(str(b.id), { slug, name, companyId: (b.company_id as string | null) ?? null });
  }
  return { companySlug, brands: index };
}

/** Quality notes from P0.2 (docs/legacy/data/README.md), keyed by what they apply to. */
const BRAND_NOTES: Record<string, string> = {
  "Uncle Ben's":
    "P0.2 note: Uncle Ben's was renamed Ben's Original in 2020; rename the brand and keep the old name as an alias.",
  Patagonia:
    'P0.2 note: Patagonia is apparel, not grocery (Patagonia Provisions is its food line).',
  'Tin Shed Ventures': 'P0.2 note: Tin Shed Ventures is an investment fund, not a grocery brand.',
};
const COMPANY_SCORE_NOTES: Record<string, string> = {
  'bolthouse-farms':
    'P0.2 note: Bolthouse Farms is overall Good but all five categories are Mixed with no notes; the row was apparently auto-created by lookup-product.',
  'sun-brite-foods':
    'P0.2 note: Sun-Brite Foods scores are placeholders ("Insufficient publicly available information"), not assessments.',
};
const PRODUCT_NOTES: Record<string, string> = {
  'Kashi Bars':
    'P0.2 note: legacy attributes Kashi Bars to General Mills, but Kashi is not a General Mills brand.',
};

const CATEGORY: Record<string, RecordInputOf<'company_score'>['category']> = {
  environment: 'environment',
  labour: 'labour',
  animal_welfare: 'animal_welfare',
  politics_and_tax: 'politics_tax',
  human_rights: 'human_rights',
};

const OWNERSHIP: Record<string, RecordInputOf<'company'>['ownership_type']> = {
  public: 'public',
  private: 'private',
};

/** A free-text certification name → scheme. The name itself is kept as `scheme_name`. */
export function schemeOf(name: string): RecordInputOf<'certification'>['scheme'] {
  if (/b[- ]?corp/i.test(name)) return 'b_corp';
  if (/fair ?trade/i.test(name)) return 'fairtrade';
  if (/rainforest alliance/i.test(name)) return 'rainforest_alliance';
  if (/\brspo\b/i.test(name)) return 'rspo';
  if (/canada organic/i.test(name)) return 'canada_organic';
  return 'other';
}

/**
 * A legacy step title → one of the four slots (D-039: by title, not step_number, because two
 * products put shipping in slot 3). Production words are checked before sourcing ones, so
 * "Bottling at Source" is production. A title with no keyword falls back to its step_number.
 */
export function stepOf(title: string, stepNumber: unknown): TransparencyStep | null {
  const t = title.toLowerCase();
  if (/ship|deliver|distribut|logistic/.test(t)) return 'distribution';
  if (/packag/.test(t)) return 'packaging';
  if (/produc|manufactur|mill|bottl|process/.test(t)) return 'production';
  if (/sourc|harvest|farm|ingredient|filtrat/.test(t)) return 'sourcing';
  const byNumber: TransparencyStep[] = ['sourcing', 'production', 'packaging', 'distribution'];
  return byNumber[Number(stepNumber) - 1] ?? null;
}

/**
 * The brand a product names: its legacy brand_id, else the longest brand name that the product
 * name starts with as whole words ("KitKat Original" → KitKat). A brand whose owner isn't the
 * product's legacy company isn't linked.
 */
export function brandOf(
  product: Row,
  index: LegacyIndex,
): { slug: string; name: string } | { slug: null; why: string } {
  const own = product.brand_id ? index.brands.get(str(product.brand_id)) : undefined;
  if (own) return own;
  const name = (text(product.name) ?? '').toLowerCase();
  const hits = [...index.brands.values()]
    .filter((b) => {
      const n = b.name.toLowerCase();
      return name === n || name.startsWith(`${n} `);
    })
    .sort((a, b) => b.name.length - a.name.length);
  const hit = hits[0];
  if (!hit) return { slug: null, why: 'No brand matches the product name; link it to a brand.' };
  if (hit.companyId !== product.company_id) {
    return {
      slug: null,
      why: `The name matches brand ${hit.name}, but that brand's legacy company differs from the product's; link it by hand.`,
    };
  }
  return hit;
}

const productRef = (id: unknown) => ({ source_key: LEGACY_KEY, external_id: str(id) });

function companies(rows: Row[]): RecordBatch[] {
  const records = rows.map((c): RecordInputOf<'company'> => ({
    slug: str(c.slug),
    name: text(c.company_name) ?? '',
    legal_name: text(c.legal_name),
    headquarters: text(c.headquarters),
    founded_year: typeof c.founded === 'number' ? c.founded : null,
    ownership_type: OWNERSHIP[str(c.public_or_private).toLowerCase()] ?? null,
    stock_ticker: text(c.stock_ticker),
    revenue_range: text(c.revenue_range),
    ceo: text(c.ceo),
    description: text(c.description),
    logo_url: text(c.logo_url),
    ...prov,
  }));
  // The legacy overall rating becomes an overall score with a rating only (D-038).
  const overall = rows
    .filter((c) => text(c.overall_ethical_rating))
    .map((c): RecordInputOf<'company_score'> => ({
      company_slug: str(c.slug),
      category: 'overall',
      rating: text(c.overall_ethical_rating) as RecordInputOf<'company_score'>['rating'],
      review_reason: reason(COMPANY_SCORE_NOTES[str(c.slug)]),
      ...prov,
    }));
  return [
    { kind: 'company', records },
    { kind: 'company_score', records: overall },
  ];
}

function brands(rows: Row[], index: LegacyIndex): RecordBatch[] {
  const records: RecordInputOf<'brand'>[] = [];
  const owners: RecordInputOf<'brand_ownership'>[] = [];
  for (const b of rows) {
    const entry = index.brands.get(str(b.id));
    const slug = entry?.slug ?? '';
    const name = text(b.name) ?? '';
    records.push({ slug, name, logo_url: text(b.logo_url), description: text(b.notes), ...prov });
    if (b.company_id) {
      owners.push({
        brand_slug: slug,
        company_slug: index.companySlug.get(str(b.company_id)) ?? '',
        relation: 'owner',
        review_reason: reason(BRAND_NOTES[name]),
        ...prov,
      });
    }
  }
  return [
    { kind: 'brand', records },
    { kind: 'brand_ownership', records: owners },
  ];
}

function scores(rows: Row[], index: LegacyIndex): RecordBatch[] {
  const records = rows.map((s): RecordInputOf<'company_score'> => {
    const slug = index.companySlug.get(str(s.company_id)) ?? '';
    return {
      company_slug: slug,
      category: CATEGORY[str(s.category)] ?? (str(s.category) as 'labour'),
      rating: text(s.rating) as RecordInputOf<'company_score'>['rating'],
      rationale: text(s.notes),
      review_reason: reason(COMPANY_SCORE_NOTES[slug]),
      ...prov,
    };
  });
  return [{ kind: 'company_score', records }];
}

function certifications(rows: Row[], index: LegacyIndex): RecordBatch[] {
  const records = rows.map((c): RecordInputOf<'certification'> => {
    const name = text(c.name) ?? '';
    return {
      company_slug: index.companySlug.get(str(c.company_id)) ?? '',
      scheme: schemeOf(name),
      scheme_name: name,
      status: 'certified',
      certified_on: text(c.verified_date),
      review_reason: reason(
        c.verified !== true && 'Legacy marks it unverified.',
        'No certification page is linked yet.',
      ),
      ...prov,
    };
  });
  return [{ kind: 'certification', records }];
}

function events(rows: Row[], index: LegacyIndex, kind: 'boycott' | 'controversy'): RecordBatch[] {
  const records = rows.map((e): RecordInputOf<'company_event'> => ({
    company_slug: index.companySlug.get(str(e.company_id)) ?? '',
    kind,
    title: text(kind === 'boycott' ? e.name : e.title) ?? '',
    description: text(kind === 'boycott' ? e.reason : e.description),
    date_text: text(e.date_text),
    status: (text(e.status)?.toLowerCase() ?? 'active') as 'active',
    severity: (text(e.severity) ?? null) as RecordInputOf<'company_event'>['severity'],
    review_reason: reason('Legacy has no source for this event; find one before approving.'),
    ...prov,
  }));
  return [{ kind: 'company_event', records }];
}

function products(rows: Row[], index: LegacyIndex): RecordBatch[] {
  const records: RecordInputOf<'product'>[] = [];
  const labels: RecordInputOf<'certification'>[] = [];
  for (const p of rows) {
    const name = text(p.name) ?? '';
    const barcode = str(p.barcode);
    const gtin = normalizeGtin(barcode);
    const brand = brandOf(p, index);
    const notes = [
      gtin.kind !== 'gtin' &&
        `barcode ${barcode} is not a valid GTIN (${gtin.kind === 'invalid' ? gtin.reason : gtin.kind}); it was imported without one.`,
      brand.slug === null && brand.why,
      PRODUCT_NOTES[name],
    ].filter((n): n is string => typeof n === 'string');
    records.push({
      gtin: gtin.kind === 'gtin' ? gtin.value : null,
      external_id: str(p.id),
      name,
      brand_slug: brand.slug,
      brand_text: brand.slug ? brand.name : null,
      description: text(p.description),
      review_reason: notes.length > 0 ? `Legacy import: ${notes.join(' ')}` : null,
      ...prov,
    });
    for (const label of (p.certifications as unknown[] | null) ?? []) {
      const labelName = text(label);
      if (!labelName) continue;
      labels.push({
        product: productRef(p.id),
        scheme: schemeOf(labelName),
        scheme_name: labelName,
        review_reason: reason('Free-text label claim on the legacy product; verify it.'),
        ...prov,
      });
    }
  }
  return [
    { kind: 'product', records },
    { kind: 'certification', records: labels },
  ];
}

function features(rows: Row[]): RecordBatch[] {
  const records = rows.map((f): RecordInputOf<'product_feature'> => ({
    product: productRef(f.product_id),
    icon: str(f.icon) as RecordInputOf<'product_feature'>['icon'],
    title: text(f.title) ?? '',
    description: text(f.description),
    sort_order: Number(f.sort_order),
    review_reason: reason(),
    ...prov,
  }));
  return [{ kind: 'product_feature', records }];
}

function steps(rows: Row[]): RecordBatch[] {
  const records = rows.map((s): RecordInputOf<'transparency_step'> => {
    const title = text(s.title) ?? '';
    return {
      product: productRef(s.product_id),
      step: stepOf(title, s.step_number) as TransparencyStep,
      title,
      description: text(s.description),
      review_reason: reason(),
      ...prov,
    };
  });
  return [{ kind: 'transparency_step', records }];
}

function stories(rows: Row[], index: LegacyIndex): RecordBatch[] {
  const taken = new Set<string>();
  const records = rows.map((s): RecordInputOf<'story'> => {
    const title = text(s.title) ?? '';
    const slug = uniqueSlug(slugify(title), taken);
    taken.add(slug);
    const published = text(s.published_at);
    return {
      slug,
      title,
      subtitle: text(s.subtitle),
      category: text(s.category),
      body: text(s.body),
      company_slug: s.company_id ? (index.companySlug.get(str(s.company_id)) ?? '') : null,
      featured: s.featured === true,
      // Imported as a draft: it has no body yet, and its cover needs a licence check.
      published_at: null,
      review_reason: [
        'Legacy story, imported as a draft.',
        !text(s.body) && 'It has no body.',
        published && `Legacy published it on ${published.slice(0, 10)}.`,
        text(s.cover_image_url) &&
          `Its cover image (${text(s.cover_image_url)}) was dropped until a licence check.`,
      ]
        .filter(Boolean)
        .join(' '),
      ...prov,
    };
  });
  return [{ kind: 'story', records }];
}

/** One export file's rows as record batches, in write order. */
export function mapLegacyFile(file: LegacyFile, rows: Row[], index: LegacyIndex): RecordBatch[] {
  switch (file) {
    case 'companies.json':
      return companies(rows);
    case 'brands.json':
      return brands(rows, index);
    case 'ethical_scores.json':
      return scores(rows, index);
    case 'certifications.json':
      return certifications(rows, index);
    case 'boycotts.json':
      return events(rows, index, 'boycott');
    case 'controversies.json':
      return events(rows, index, 'controversy');
    case 'products.json':
      return products(rows, index);
    case 'product_features.json':
      return features(rows);
    case 'transparency_steps.json':
      return steps(rows);
    case 'impact_stories.json':
      return stories(rows, index);
  }
}
