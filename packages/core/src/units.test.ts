import { describe, expect, it } from 'vitest';

import { ProductRecordSchema } from './records/products.ts';
import { SIZE_CASES } from './units.cases.ts';
import {
  GRAMS_PER_LB,
  normalizeSizeText,
  parseSize,
  type SizeParse,
  sizeUnitParser,
  unitPrice,
} from './units.ts';
import { validateBatch } from './validation/batch.ts';

const ok = (
  net_quantity: number,
  net_unit: 'g' | 'ml' | 'ct',
  pack_count: number | null = null,
): SizeParse => ({
  unit_parse_status: 'ok',
  net_quantity,
  net_unit,
  pack_count,
  reason: null,
});

const baseProduct = {
  external_id: 'x1',
  name: 'Test product',
  source_key: 'fixture',
  source_url: null,
  fetched_at: '2026-11-10T00:00:00.000Z',
  method: 'import',
  method_version: 'fixture@1.0.0',
};

describe('parseSize: legacy normalizer cases', () => {
  // Seeded from legacy catalog-worker providers/fortinos/normalizer.test.ts (CATALOG_REVIEW §4).
  it.each([
    ['600 g', ok(600, 'g')],
    ['2 L', ok(2000, 'ml')],
    ['12 x 355 mL', ok(4260, 'ml', 12)],
    ['454 g', ok(454, 'g')],
    // splitPackageSizing's combined string: the unit price is not a size.
    ['600 g, $0.50/100g', ok(600, 'g')],
  ])('%s', (text, expected) => {
    expect(parseSize(text)).toEqual(expected);
  });
});

describe('parseSize: the cases the plan names', () => {
  it.each<[string, SizeParse | [string, string]]>([
    ['500 g', ok(500, 'g')],
    ['4 x 100 g', ok(400, 'g', 4)],
    ['2 x 6 x 355 mL', ok(4260, 'ml', 12)],
    ['12 ea', ok(12, 'ct')],
    ['6 pk', ok(6, 'ct')],
    ['12 pcs', ok(12, 'ct')],
    ['CTN24', ok(24, 'ct')],
    ['approx. 1.2 kg', ok(1200, 'g')],
    ['1 1/2 lb', ok(680.389, 'g')],
    ['½ kg', ok(500, 'g')],
    ['1,75 litre', ok(1750, 'ml')],
    ['16 oz', ok(453.592, 'g')],
    ['2 lbs', ok(907.185, 'g')],
    ['32 fl oz', ok(946.353, 'ml')],
    ['12x33cl', ok(3960, 'ml', 12)],
    ['500 millilitre', ok(500, 'ml')],
    ['400 grammes', ok(400, 'g')],
    ['5 x 24 g, Net: 120 g', ok(120, 'g', 5)],
    ['$ per kg.', ['unparsed', 'per_weight']],
    ['varies / $ per kg', ['unparsed', 'per_weight']],
    ['$4.99/lb', ['unparsed', 'per_weight']],
    ['/kg', ['unparsed', 'per_weight']],
    ['1', ['unparsed', 'bare_number']],
    ['250', ['unparsed', 'bare_number']],
    ['1 L / 1045 g', ['ambiguous', 'mass_and_volume']],
    ['1 400 g', ['ambiguous', 'space_joined_numbers']],
  ])('%s', (text, expected) => {
    const got = parseSize(text);
    if (Array.isArray(expected)) {
      expect([got.unit_parse_status, got.reason]).toEqual(expected);
      expect(got.net_quantity).toBeNull();
    } else {
      expect(got).toEqual(expected);
    }
  });
});

describe(`parseSize: ${SIZE_CASES.length} real strings`, () => {
  it('has at least 150 distinct cases', () => {
    expect(new Set(SIZE_CASES.map((c) => c[0])).size).toBe(SIZE_CASES.length);
    expect(SIZE_CASES.length).toBeGreaterThanOrEqual(150);
  });

  it.each(SIZE_CASES.map((c) => [c[0], c] as const))('%s', (text, c) => {
    const got = parseSize(text);
    const [, a, b] = c;
    if (typeof a === 'number') {
      expect(got).toEqual(ok(a, b as 'g' | 'ml' | 'ct', (c[3] as number | undefined) ?? null));
    } else {
      expect({ status: got.unit_parse_status, reason: got.reason, qty: got.net_quantity }).toEqual({
        status: a,
        reason: b,
        qty: null,
      });
    }
  });
});

describe('parseSize: rules', () => {
  it('reads oz as fluid ounces next to a volume and as weight otherwise', () => {
    expect(parseSize('355 mL; 12 oz')).toEqual(ok(355, 'ml'));
    expect(parseSize('12 oz')).toEqual(ok(340.194, 'g'));
  });

  it('prefers metric and the stated total, and checks the rest agree', () => {
    expect(parseSize('907 g (2 lbs)')).toEqual(ok(907, 'g'));
    expect(parseSize('400 g (4 x 100 g)')).toEqual(ok(400, 'g', 4));
    expect(parseSize('4 x 125g (450g)').unit_parse_status).toBe('ambiguous');
    expect(parseSize('25 kg / 5 lbs').reason).toBe('sizes_disagree');
  });

  it('drops drained weights and per-item sizes', () => {
    expect(parseSize('120 g Drained Wt. / 170 g Net Wt.')).toEqual(ok(170, 'g'));
    expect(parseSize('Drained 120 g / Net 170 g')).toEqual(ok(170, 'g'));
    expect(parseSize('16 Wrapped Bags 1.3 g each, (Net Wt. 20.8 g)')).toEqual(ok(20.8, 'g', 16));
    expect(parseSize('60 g/tube. (8 tubes/boite)')).toEqual(ok(480, 'g', 8));
    expect(parseSize('24g/bar').reason).toBe('each_without_count');
  });

  it('never guesses a unit for a number or a count range', () => {
    for (const text of ['12', '1.8', '0.90 - 1.50', '12x12', '3x200', '4 times 100']) {
      expect(parseSize(text).unit_parse_status, text).toBe('unparsed');
    }
    expect(parseSize('2-3 kg').reason).toBe('range');
  });

  it('treats a dry pint or gallon on its own as ambiguous, but lets it confirm a metric size', () => {
    expect(parseSize('1 dry pint').reason).toBe('non_metric_only');
    expect(parseSize('1 Dry Pint (551 ml)')).toEqual(ok(551, 'ml'));
  });

  it('handles empty input', () => {
    expect(parseSize(null).reason).toBe('empty');
    expect(parseSize('   ').reason).toBe('empty');
  });

  it('gives every case a result the product schema accepts', () => {
    const texts = [...SIZE_CASES.map((c) => c[0]), '600 g, $0.50/100g', '½ kg', ''];
    for (const text of texts) {
      const { reason: _reason, ...fields } = parseSize(text);
      const parsed = ProductRecordSchema.safeParse({
        ...baseProduct,
        quantity_text: text || null,
        ...fields,
      });
      expect(parsed.success, `${text}: ${parsed.error?.message}`).toBe(true);
    }
  });
});

describe('normalizeSizeText', () => {
  it('folds case, decimal commas and multiplication signs', () => {
    expect(normalizeSizeText('1,4 kg (2×700g)').s).toBe('1.4 kg (2 x 700g)');
    expect(normalizeSizeText('12*45 g').s).toBe('12 x 45 g');
    expect(normalizeSizeText('1,75 Litre').s).toBe('1.75 litre');
  });

  it('flags a comma before three digits instead of guessing', () => {
    expect(normalizeSizeText('18,000 mg')).toEqual({ s: '18000 mg', thousands: true });
    expect(normalizeSizeText('1,750 kg').thousands).toBe(true);
    expect(parseSize('1,750 kg').reason).toBe('thousands_separator');
  });
});

describe('sizeUnitParser', () => {
  it('sets the four size fields through validateBatch', () => {
    const records = [
      { ...baseProduct, external_id: 'a', quantity_text: '12 x 355 mL' },
      { ...baseProduct, external_id: 'b', quantity_text: '1' },
      { ...baseProduct, external_id: 'c', quantity_text: '1 L / 1045 g' },
      { ...baseProduct, external_id: 'd' },
    ];
    const res = validateBatch('product', records, { unitParser: sizeUnitParser });
    expect(res.failures).toEqual([]);
    expect(res.stats.unitParse).toEqual({ attempted: 3, ok: 1 });
    expect(
      res.valid.map((r) => [r.unit_parse_status, r.net_quantity, r.net_unit, r.pack_count]),
    ).toEqual([
      ['ok', 4260, 'ml', 12],
      ['unparsed', null, null, null],
      ['ambiguous', null, null, null],
      ['unparsed', undefined, undefined, undefined],
    ]);
  });
});

describe('unitPrice', () => {
  const size = (q: number, u: 'g' | 'ml' | 'ct') => ({
    unit_parse_status: 'ok' as const,
    net_quantity: q,
    net_unit: u,
  });

  it('divides by our parsed size', () => {
    expect(unitPrice(4.49, { size: size(600, 'g') })).toEqual({
      unit_price: 0.00748,
      unit_basis: 'g',
    });
    expect(unitPrice(7.99, { size: size(4260, 'ml') })).toEqual({
      unit_price: 0.00188,
      unit_basis: 'ml',
    });
    expect(unitPrice(3, { size: size(12, 'ct') })).toEqual({ unit_price: 0.25, unit_basis: 'ct' });
  });

  it('converts per-kg and per-lb prices to per gram', () => {
    expect(unitPrice(8.8, { price_per: 'kg' })).toEqual({ unit_price: 0.0088, unit_basis: 'g' });
    expect(unitPrice(3.99, { price_per: 'lb' })).toEqual({
      unit_price: Math.round((3.99 / GRAMS_PER_LB) * 1e5) / 1e5,
      unit_basis: 'g',
    });
  });

  it('returns null without a usable price or size', () => {
    expect(unitPrice(0, { size: size(100, 'g') })).toBeNull();
    expect(unitPrice(-1, { size: size(100, 'g') })).toBeNull();
    expect(unitPrice(Number.NaN, { size: size(100, 'g') })).toBeNull();
    expect(unitPrice(2, {})).toBeNull();
    expect(
      unitPrice(2, {
        price_per: 'unit',
        size: { ...size(1, 'g'), unit_parse_status: 'ambiguous' },
      }),
    ).toBeNull();
    // Rounds to 0 at numeric(12,5).
    expect(unitPrice(0.01, { size: size(24_000, 'ml') })).toBeNull();
  });
});
