import { describe, expect, it } from 'vitest';

import { RECORD_KINDS, RECORD_SCHEMAS, type RecordInputOf, type RecordKind } from './index.ts';

const prov = {
  source_key: 'fixture',
  source_url: 'https://example.org/item/1',
  fetched_at: '2026-10-29T12:00:00Z',
  method: 'import',
  method_version: 'fixture@1.0.0',
} as const;

type Case<K extends RecordKind> = {
  valid: RecordInputOf<K>;
  /** An invalid variant and the field path the error must point at. */
  invalid: [Record<string, unknown>, string];
};

const CASES: { [K in RecordKind]: Case<K> } = {
  company: {
    valid: {
      slug: 'kraft-heinz',
      name: 'Kraft Heinz',
      country: 'US',
      wikidata_qid: 'Q19870588',
      ...prov,
    },
    invalid: [{ slug: 'Kraft Heinz', name: 'Kraft Heinz', ...prov }, 'slug'],
  },
  brand: {
    valid: { slug: 'bens-original', name: "Ben's Original", ...prov },
    invalid: [
      { slug: 'bens-original', name: "Ben's Original", ...prov, fetched_at: '2026-10-29' },
      'fetched_at',
    ],
  },
  brand_ownership: {
    valid: { brand_slug: 'bens-original', company_slug: 'mars', relation: 'owner', ...prov },
    invalid: [
      {
        brand_slug: 'bens-original',
        company_slug: 'mars',
        relation: 'owner',
        ...prov,
        method: 'ai',
      },
      'confidence',
    ],
  },
  company_ownership: {
    valid: {
      parent_company_slug: 'nestle',
      child_company_slug: 'nestle-canada',
      relation: 'subsidiary',
      share_pct: 100,
      valid_from: '2001-01-01',
      ...prov,
    },
    invalid: [
      {
        parent_company_slug: 'nestle',
        child_company_slug: 'nestle',
        relation: 'subsidiary',
        ...prov,
      },
      'child_company_slug',
    ],
  },
  product: {
    valid: {
      gtin: '00036000291452',
      external_id: '036000291452',
      name: 'Test cereal',
      brand_text: 'Kashi',
      net_quantity: 500,
      net_unit: 'g',
      unit_parse_status: 'ok',
      label_codes: ['organic'],
      ...prov,
    },
    invalid: [
      { gtin: '00036000291453', external_id: '036000291453', name: 'Bad check digit', ...prov },
      'gtin',
    ],
  },
  product_identifier: {
    valid: {
      product: { gtin: '00036000291452' },
      scheme: 'store_internal',
      value: '02012345678903',
      banner_slug: 'no-frills',
      ...prov,
    },
    invalid: [
      { product: { gtin: '00036000291452' }, scheme: 'store_sku', value: 'ABC123', ...prov },
      'banner_slug',
    ],
  },
  store: {
    valid: {
      slug: 'no-frills-queen-st',
      name: 'No Frills Queen St',
      banner_slug: 'no-frills',
      province: 'ON',
      lat: 43.65,
      lon: -79.38,
      osm_type: 'node',
      osm_id: 123,
      ...prov,
    },
    invalid: [{ slug: 'no-frills-queen-st', name: 'No Frills', lat: 43.65, ...prov }, 'lon'],
  },
  store_listing: {
    valid: {
      banner_slug: 'no-frills',
      listing_name: 'PC BLK BEAN 540ML',
      size_text: '540 ml',
      first_seen_at: '2026-10-01T00:00:00Z',
      last_seen_at: '2026-10-29T00:00:00Z',
      ...prov,
    },
    invalid: [
      {
        banner_slug: 'no-frills',
        listing_name: 'PC BLK BEAN 540ML',
        first_seen_at: '2026-10-29T00:00:00Z',
        last_seen_at: '2026-10-01T00:00:00Z',
        ...prov,
      },
      'last_seen_at',
    ],
  },
  price_observation: {
    valid: {
      external_id: '987',
      store: { osm_type: 'node', osm_id: 123 },
      product: { gtin: '00036000291452' },
      observed_on: '2026-10-28',
      price: 4.99,
      price_kind: 'sale',
      is_discounted: true,
      price_without_discount: 5.99,
      ...prov,
    },
    invalid: [
      {
        store: { slug: 'no-frills-queen-st' },
        product: { gtin: '00036000291452' },
        observed_on: '2026-10-28',
        price: 10_001,
        ...prov,
      },
      'price',
    ],
  },
  reference_price: {
    valid: {
      vector_id: 'v1234',
      product_label: 'Ground beef, per kilogram',
      geography: 'Canada',
      ref_month: '2026-09-01',
      value: 12.5,
      ...prov,
    },
    invalid: [
      {
        vector_id: 'v1234',
        product_label: 'Ground beef',
        geography: 'Canada',
        ref_month: '2026-09-15',
        value: 12.5,
        ...prov,
      },
      'ref_month',
    ],
  },
  document: {
    valid: {
      url: 'https://www.cbc.ca/news/business/story?utm_source=x',
      url_normalized: 'https://cbc.ca/news/business/story',
      kind: 'news',
      domain: 'cbc.ca',
      language: 'en',
      published_at: '2026-10-20T08:30:00-04:00',
      ...prov,
    },
    invalid: [
      {
        url: 'ftp://example.org/file',
        url_normalized: 'ftp://example.org/file',
        kind: 'other',
        ...prov,
      },
      'url',
    ],
  },
  company_score: {
    valid: {
      company_slug: 'mars',
      category: 'labour',
      rating: 'Mixed',
      ...prov,
      method: 'legacy-import',
    },
    invalid: [
      { company_slug: 'mars', category: 'labour', rating: 'Mixed', ...prov, method: 'manual' },
      'confidence',
    ],
  },
  certification: {
    valid: { company_slug: 'patagonia', scheme: 'b_corp', certified_on: '2012-01-01', ...prov },
    invalid: [
      { company_slug: 'patagonia', brand_slug: 'patagonia', scheme: 'b_corp', ...prov },
      'company_slug',
    ],
  },
  company_event: {
    valid: {
      company_slug: 'nestle',
      kind: 'controversy',
      title: 'Water privatization',
      date_text: '2023 (ongoing)',
      severity: 'high',
      ...prov,
    },
    invalid: [{ company_slug: 'nestle', kind: 'scandal', title: 'x', ...prov }, 'kind'],
  },
  product_feature: {
    valid: {
      product: { source_key: 'legacy-import', external_id: 'p1' },
      icon: 'leaf',
      title: 'Plant based',
      sort_order: 0,
      ...prov,
    },
    invalid: [
      {
        product: { source_key: 'legacy-import', external_id: 'p1' },
        icon: 'rocket',
        title: 'x',
        sort_order: 0,
        ...prov,
      },
      'icon',
    ],
  },
  transparency_step: {
    valid: {
      product: { gtin: '00036000291452' },
      step: 'distribution',
      title: 'Carbon Offset Shipping',
      ...prov,
    },
    invalid: [
      { product: { gtin: '00036000291452' }, step: 'shipping', title: 'x', ...prov },
      'step',
    ],
  },
  story: {
    valid: { slug: 'the-hidden-cost-of-chocolate', title: 'The Hidden Cost of Chocolate', ...prov },
    invalid: [{ slug: 'x', title: 'x', published_at: '2026-03-18', ...prov }, 'published_at'],
  },
};

describe('record schemas', () => {
  it('covers every record kind', () => {
    expect(Object.keys(CASES).sort()).toEqual([...RECORD_KINDS].sort());
  });

  describe.each(RECORD_KINDS)('%s', (kind) => {
    const schema = RECORD_SCHEMAS[kind];
    const { valid, invalid } = CASES[kind];

    it('accepts a valid sample', () => {
      const result = schema.safeParse(valid);
      expect(result.error?.issues ?? []).toEqual([]);
    });

    it('rejects an invalid sample at the expected field', () => {
      const [record, field] = invalid;
      const result = schema.safeParse(record);
      expect(result.success).toBe(false);
      expect(result.error?.issues.map((i) => i.path[0])).toContain(field);
    });
  });
});

describe('shared rules', () => {
  const product = { external_id: 'x', name: 'Thing', ...prov };
  const price = {
    store: { slug: 'shop' },
    product: { gtin: '00036000291452' },
    observed_on: '2026-10-28',
    ...prov,
  };

  it('applies defaults', () => {
    const parsed = RECORD_SCHEMAS.product.parse(product);
    expect(parsed).toMatchObject({
      unit_parse_status: 'unparsed',
      label_codes: [],
      status: 'active',
    });
    expect(RECORD_SCHEMAS.price_observation.parse({ ...price, price: 1 })).toMatchObject({
      currency: 'CAD',
      price_kind: 'unknown',
      is_discounted: false,
    });
  });

  it('rejects unknown fields', () => {
    expect(RECORD_SCHEMAS.product.safeParse({ ...product, brand_id: 'x' }).success).toBe(false);
  });

  it('requires provenance', () => {
    const { method_version: _, ...noVersion } = product;
    expect(RECORD_SCHEMAS.product.safeParse(noVersion).success).toBe(false);
    expect(RECORD_SCHEMAS.product.safeParse({ ...product, method: 'scraper' }).success).toBe(false);
    expect(
      RECORD_SCHEMAS.product.safeParse({ ...product, source_url: 'javascript:alert(1)' }).success,
    ).toBe(false);
  });

  it('bounds prices and currencies', () => {
    const ok = (p: Record<string, unknown>) =>
      RECORD_SCHEMAS.price_observation.safeParse({ ...price, ...p }).success;
    expect(ok({ price: 0 })).toBe(false);
    expect(ok({ price: -1 })).toBe(false);
    expect(ok({ price: 10_000 })).toBe(true);
    expect(ok({ price: 1, currency: 'EUR' })).toBe(false);
    expect(ok({ price: 1, currency: 'USD' })).toBe(true);
  });

  it('rejects a restricted code as a product GTIN', () => {
    expect(RECORD_SCHEMAS.product.safeParse({ ...product, gtin: '02012345678903' }).success).toBe(
      false,
    );
  });

  it('needs a timezone offset on datetimes', () => {
    expect(
      RECORD_SCHEMAS.product.safeParse({ ...product, fetched_at: '2026-10-29T12:00:00' }).success,
    ).toBe(false);
  });

  it('takes a review reason on reviewable records', () => {
    expect(
      RECORD_SCHEMAS.product.safeParse({ ...product, review_reason: 'Bad barcode' }).success,
    ).toBe(true);
    expect(RECORD_SCHEMAS.product.safeParse({ ...product, review_reason: '' }).success).toBe(false);
  });

  it('shapes scores by category', () => {
    const score = { company_slug: 'mars', ...prov, method: 'legacy-import' } as const;
    const ok = (p: Record<string, unknown>) =>
      RECORD_SCHEMAS.company_score.safeParse({ ...score, ...p }).success;
    expect(ok({ category: 'overall', rating: 'Good' })).toBe(true);
    expect(ok({ category: 'overall', score: 72, grade: 'B-' })).toBe(true);
    expect(ok({ category: 'overall', score: 72 })).toBe(false);
    expect(ok({ category: 'labour', rating: 'Good', score: 72, grade: 'B-' })).toBe(false);
    expect(ok({ category: 'labour', rating: 'Good', method: 'api' })).toBe(false);
    expect(
      ok({
        category: 'labour',
        rating: 'Good',
        method: 'ai',
        confidence: 0.8,
        rubric_version: 'v1',
      }),
    ).toBe(false);
  });
});
