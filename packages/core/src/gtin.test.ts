import { describe, expect, it } from 'vitest';

import legacyProducts from '../../../docs/legacy/data/products.json';
import { gtinIsRestricted, gtinIsValid, gtinNormalize, normalizeGtin } from './gtin.ts';

// The same vectors as supabase/tests/products.sql (P2.5). Keep the two lists in step.
const SQL_IS_VALID: [string, boolean][] = [
  ['036000291452', true],
  ['4006381333931', true],
  ['96385074', true],
  ['10012345678902', true],
  ['00036000291452', true],
  ['036000291453', false],
  ['4006381333932', false],
  ['96385075', false],
  ['10012345678903', false],
  ['03600029145A', false],
  ['03600029145', false],
  ['123456789012345', false],
  ['', false],
  [' 036000291452', false],
];
const SQL_NORMALIZE: [string, string | null][] = [
  ['036000291452', '00036000291452'],
  ['4006381333931', '04006381333931'],
  ['96385074', '00000096385074'],
  ['10012345678902', '10012345678902'],
  ['036000291453', null],
  ['ABC', null],
];
const SQL_IS_RESTRICTED: [string, boolean][] = [
  ['2012345678903', true],
  ['212345678909', true],
  ['0223456789019', true],
  ['02012345678903', true],
  ['036000291452', false],
  ['4006381333931', false],
  ['2012345678904', false],
];

describe('SQL twins', () => {
  it.each(SQL_IS_VALID)('gtinIsValid(%j) = %s', (code, expected) => {
    expect(gtinIsValid(code)).toBe(expected);
  });
  it.each(SQL_NORMALIZE)('gtinNormalize(%j) = %j', (code, expected) => {
    expect(gtinNormalize(code)).toBe(expected);
  });
  it.each(SQL_IS_RESTRICTED)('gtinIsRestricted(%j) = %s', (code, expected) => {
    expect(gtinIsRestricted(code)).toBe(expected);
  });
});

describe('normalizeGtin', () => {
  it('pads each GTIN length to GTIN-14', () => {
    expect(normalizeGtin('036000291452')).toEqual({ kind: 'gtin', value: '00036000291452' }); // UPC-A
    expect(normalizeGtin('4006381333931')).toEqual({ kind: 'gtin', value: '04006381333931' }); // EAN-13
    expect(normalizeGtin('96385074')).toEqual({ kind: 'gtin', value: '00000096385074' }); // EAN-8
    expect(normalizeGtin('10012345678902')).toEqual({ kind: 'gtin', value: '10012345678902' }); // GTIN-14
  });

  it('strips whitespace and hyphens but no other characters', () => {
    expect(normalizeGtin(' 0 36000-29145 2 ')).toEqual({ kind: 'gtin', value: '00036000291452' });
    expect(normalizeGtin('03600029145A')).toEqual({ kind: 'invalid', reason: 'non_digit' });
    expect(normalizeGtin('  ')).toEqual({ kind: 'invalid', reason: 'empty' });
  });

  it('rejects a bad check digit and odd lengths', () => {
    expect(normalizeGtin('036000291453')).toEqual({ kind: 'invalid', reason: 'check_digit' });
    expect(normalizeGtin('03600029145')).toEqual({ kind: 'invalid', reason: 'length' });
    expect(normalizeGtin('123456789012345')).toEqual({ kind: 'invalid', reason: 'length' });
  });

  it('classifies restricted-circulation 02 / 20–29 prefixes', () => {
    expect(normalizeGtin('0223456789019')).toEqual({ kind: 'restricted', value: '00223456789019' });
    expect(normalizeGtin('212345678909')).toEqual({ kind: 'restricted', value: '00212345678909' });
    expect(normalizeGtin('2012345678903')).toEqual({ kind: 'restricted', value: '02012345678903' });
    // A restricted-looking code with a bad check digit is just invalid.
    expect(normalizeGtin('2012345678904')).toEqual({ kind: 'invalid', reason: 'check_digit' });
  });

  it('classifies 4–5 digit PLUs', () => {
    expect(normalizeGtin('4011')).toEqual({ kind: 'plu', value: '4011' });
    expect(normalizeGtin('94011')).toEqual({ kind: 'plu', value: '94011' });
  });

  it('agrees with the SQL twins on every clean SQL vector', () => {
    for (const [code] of [...SQL_IS_VALID, ...SQL_NORMALIZE, ...SQL_IS_RESTRICTED]) {
      if (!/^[0-9]+$/.test(code) || code.length < 6) continue;
      const result = normalizeGtin(code);
      const sqlValid = gtinIsValid(code);
      expect(result.kind !== 'invalid', code).toBe(sqlValid);
      if (result.kind === 'gtin' || result.kind === 'restricted') {
        expect(result.value).toBe(gtinNormalize(code));
        expect(result.kind === 'restricted').toBe(gtinIsRestricted(code));
      }
    }
  });
});

describe('legacy barcodes (docs/legacy/data/products.json)', () => {
  const products: { barcode: string | null }[] = legacyProducts;
  const barcodes = products.map((p) => p.barcode).filter((b): b is string => b != null);

  it('has 13 barcodes', () => {
    expect(barcodes).toHaveLength(13);
  });

  // Checked against the SQL gtin_is_valid on dev (2026-10-29): 12 valid, and the Patagonia
  // Provisions Soup barcode 0850034340016 has a bad check digit, so P2.18 can't store it as a GTIN.
  const BAD_CHECK_DIGIT = new Set(['0850034340016']);

  it('12 normalize to unrestricted GTIN-14s and 1 has a bad check digit', () => {
    for (const barcode of barcodes) {
      expect(normalizeGtin(barcode), barcode).toEqual(
        BAD_CHECK_DIGIT.has(barcode)
          ? { kind: 'invalid', reason: 'check_digit' }
          : { kind: 'gtin', value: barcode.padStart(14, '0') },
      );
    }
  });
});
