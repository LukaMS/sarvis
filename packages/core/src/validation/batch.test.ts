import { describe, expect, it } from 'vitest';

import { jsonbBytes } from './payload';
import { passThroughUnitParser, type UnitParser, validateBatch } from './batch';

const prov = {
  source_key: 'fixture',
  fetched_at: '2026-10-29T12:00:00Z',
  method: 'import',
  method_version: 'fixture@1.0.0',
} as const;

const product = (over: Record<string, unknown> = {}) => ({
  external_id: '036000291452',
  gtin: '00036000291452',
  name: 'Test cereal',
  ...prov,
  ...over,
});

const price = (over: Record<string, unknown> = {}) => ({
  store: { osm_type: 'node', osm_id: 1 },
  product: { gtin: '00036000291452' },
  observed_on: '2026-10-28',
  price: 4.99,
  ...prov,
  ...over,
});

describe('validateBatch', () => {
  it('passes valid records through with defaults applied', () => {
    const r = validateBatch('product', [product()]);
    expect(r.failures).toEqual([]);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0]).toMatchObject({ unit_parse_status: 'unparsed', status: 'active' });
    expect(r.stats).toMatchObject({ total: 1, valid: 1, invalid: 0, unitParse: null });
  });

  describe('schema', () => {
    it('passes a valid record', () => {
      expect(validateBatch('brand', [{ slug: 'mars', name: 'Mars', ...prov }]).stats.valid).toBe(1);
    });

    it('fails a malformed record', () => {
      const r = validateBatch('brand', [{ slug: 'Not A Slug', name: 'Mars', ...prov }]);
      expect(r.failures).toEqual([
        expect.objectContaining({ index: 0, rule: 'schema', record_key: 'Not A Slug' }),
      ]);
      expect(r.failures[0]?.message).toContain('slug');
    });
  });

  describe('required_field', () => {
    it('passes when present', () => {
      expect(validateBatch('product', [product()]).stats.valid).toBe(1);
    });

    it('fails a missing name or provenance field', () => {
      const { name: _, ...noName } = product();
      const { method_version: __, ...noVersion } = product({ external_id: 'b' });
      const r = validateBatch('product', [noName, noVersion]);
      expect(r.failures.map((f) => [f.rule, f.message.split(':')[0]])).toEqual([
        ['required_field', 'name'],
        ['required_field', 'method_version'],
      ]);
    });
  });

  describe('gtin_check_digit', () => {
    it('passes a good check digit', () => {
      expect(validateBatch('product', [product()]).stats.byRule.gtin_check_digit).toBe(0);
    });

    it('fails a bad check digit, in GTIN-14 or raw form, on products and refs', () => {
      const r = validateBatch('product', [
        product({ gtin: '00036000291453' }),
        product({ external_id: 'x', gtin: '036000291453' }),
      ]);
      expect(r.failures.map((f) => f.rule)).toEqual(['gtin_check_digit', 'gtin_check_digit']);
      const ref = validateBatch('price_observation', [
        price({ product: { gtin: '00036000291453' } }),
      ]);
      expect(ref.failures[0]?.rule).toBe('gtin_check_digit');
      const alt = validateBatch('product_identifier', [
        {
          product: { gtin: '00036000291452' },
          scheme: 'gtin_alt',
          value: '04006381333932',
          ...prov,
        },
      ]);
      expect(alt.failures[0]?.rule).toBe('gtin_check_digit');
    });

    it('calls a well-formed but unpadded GTIN a schema failure, not a check-digit one', () => {
      expect(validateBatch('product', [product({ gtin: '036000291452' })]).failures[0]?.rule).toBe(
        'schema',
      );
    });
  });

  describe('price_sanity', () => {
    it('passes prices inside the hard bounds', () => {
      expect(validateBatch('price_observation', [price({ price: 10_000 })]).stats.valid).toBe(1);
    });

    it('fails 0, negative and over-10,000 prices', () => {
      const r = validateBatch('price_observation', [
        price({ price: 0 }),
        price({ price: -1, observed_on: '2026-10-27' }),
        price({ price: 10_001, observed_on: '2026-10-26' }),
      ]);
      expect(r.failures.map((f) => f.rule)).toEqual([
        'price_sanity',
        'price_sanity',
        'price_sanity',
      ]);
      const ref = validateBatch('reference_price', [
        {
          vector_id: 'v1',
          product_label: 'Milk',
          geography: 'Canada',
          ref_month: '2026-09-01',
          value: 0,
          ...prov,
        },
      ]);
      expect(ref.failures[0]?.rule).toBe('price_sanity');
    });

    it('applies per-category bounds from the lookup', () => {
      const bounds = () => ({
        unit_basis: 'g' as const,
        min_unit_price: 0.001,
        max_unit_price: 0.1,
      });
      const r = validateBatch(
        'price_observation',
        [
          price({ unit_price: 0.01, unit_basis: 'g' }),
          price({ unit_price: 5, unit_basis: 'g', observed_on: '2026-10-27' }),
          price({ unit_price: 5, unit_basis: 'ml', observed_on: '2026-10-26' }),
        ],
        { priceBounds: bounds },
      );
      expect(r.valid).toHaveLength(2);
      expect(r.failures).toEqual([
        expect.objectContaining({
          index: 1,
          rule: 'price_sanity',
          message: expect.stringContaining('outside'),
        }),
      ]);
    });
  });

  describe('unit_parse', () => {
    const grams: UnitParser = (text) =>
      /^(\d+) g$/.test(text)
        ? { unit_parse_status: 'ok', net_quantity: Number(text.split(' ')[0]), net_unit: 'g' }
        : { unit_parse_status: 'unparsed' };

    it('passes and fills the size from the hook', () => {
      const r = validateBatch('product', [product({ quantity_text: '500 g' })], {
        unitParser: grams,
      });
      expect(r.valid[0]).toMatchObject({
        net_quantity: 500,
        net_unit: 'g',
        unit_parse_status: 'ok',
      });
      expect(r.stats.unitParse).toEqual({ attempted: 1, ok: 1 });
    });

    it('fails when the hook throws or returns an inconsistent size', () => {
      const throws: UnitParser = () => {
        throw new Error('boom');
      };
      const inconsistent: UnitParser = () => ({
        unit_parse_status: 'ok',
        net_quantity: null,
        net_unit: null,
      });
      const a = validateBatch('product', [product({ quantity_text: '?' })], { unitParser: throws });
      const b = validateBatch('product', [product({ quantity_text: '?' })], {
        unitParser: inconsistent,
      });
      expect(a.failures[0]).toMatchObject({
        rule: 'unit_parse',
        message: expect.stringContaining('boom'),
      });
      expect(b.failures[0]?.rule).toBe('unit_parse');
    });

    it('leaves products alone with the pass-through default', () => {
      const r = validateBatch('product', [product({ quantity_text: '500 g' })], {
        unitParser: passThroughUnitParser,
      });
      expect(r.valid[0]).toMatchObject({ unit_parse_status: 'unparsed' });
      expect(r.stats.unitParse).toBeNull();
    });
  });

  describe('duplicate', () => {
    it('passes distinct keys', () => {
      const r = validateBatch('product', [product(), product({ external_id: 'b', gtin: null })]);
      expect(r.stats.valid).toBe(2);
    });

    it('keeps the first and fails later records sharing any stable key', () => {
      const r = validateBatch('product', [
        product(),
        product({ external_id: 'other-id' }), // same GTIN
        product({ gtin: null }), // same source id
      ]);
      expect(r.valid).toHaveLength(1);
      expect(r.failures.map((f) => [f.index, f.rule])).toEqual([
        [1, 'duplicate'],
        [2, 'duplicate'],
      ]);
      expect(r.failures[0]?.message).toContain('record 0');
    });

    it('keys listings on the normalized name and size', () => {
      const listing = (name: string) => ({
        banner_slug: 'no-frills',
        listing_name: name,
        size_text: '540 ml',
        first_seen_at: '2026-10-01T00:00:00Z',
        last_seen_at: '2026-10-01T00:00:00Z',
        ...prov,
      });
      const r = validateBatch('store_listing', [listing('PC BLK BEAN'), listing('pc  blk bean ')]);
      expect(r.failures[0]?.rule).toBe('duplicate');
    });
  });

  it('trims payloads to 1 KB and counts failures by rule', () => {
    const r = validateBatch('product', [
      product({ name: 'x'.repeat(5000) }),
      product({ gtin: 'bad', external_id: 'q' }),
    ]);
    expect(r.failures.every((f) => jsonbBytes(f.payload) <= 1024)).toBe(true);
    expect(r.stats.invalid).toBe(2);
    expect(r.stats.byRule.schema).toBe(2);
  });

  it('handles non-object input', () => {
    const r = validateBatch('product', [null, 'x']);
    expect(r.failures.map((f) => [f.rule, f.record_key])).toEqual([
      ['schema', null],
      ['schema', null],
    ]);
  });
});
