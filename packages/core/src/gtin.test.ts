import { describe, expect, it } from 'vitest';

import legacyProducts from '../../../docs/legacy/data/products.json';
import { gtinIsRestricted, gtinIsValid, gtinNormalize, normalizeGtin, upcEToUpcA } from './gtin.ts';
import vectors from './gtin.vectors.json';

describe('SQL twins (gtin.vectors.json, also run against SQL by `npm run check:gtin`)', () => {
  it.each(vectors.isValid)('gtinIsValid($code) = $expected', ({ code, expected }) => {
    expect(gtinIsValid(code)).toBe(expected);
  });
  it.each(vectors.upce)('upcEToUpcA($code) = $expected', ({ code, expected }) => {
    expect(upcEToUpcA(code)).toBe(expected);
  });
  it.each(vectors.normalize)('gtinNormalize($code) = $expected', ({ code, expected }) => {
    expect(gtinNormalize(code)).toBe(expected);
  });
  it.each(vectors.isRestricted)('gtinIsRestricted($code) = $expected', ({ code, expected }) => {
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

  it('reads a valid UPC-E as its UPC-A, so both spellings reach one product', () => {
    expect(normalizeGtin('04139344')).toEqual({ kind: 'gtin', value: '00041390000034' });
    expect(normalizeGtin('041390000034')).toEqual({ kind: 'gtin', value: '00041390000034' });
  });

  it('prefers UPC-E when a code is valid both ways', () => {
    expect(gtinIsValid('01234565')).toBe(true);
    expect(normalizeGtin('01234565')).toEqual({ kind: 'gtin', value: '00012345000065' });
  });

  it('keeps number system 1 as EAN-8', () => {
    expect(normalizeGtin('12345670')).toEqual({ kind: 'gtin', value: '00000012345670' });
  });

  it('classifies EAN-8 prefixes 0 and 2 as restricted', () => {
    expect(normalizeGtin('01234503')).toEqual({ kind: 'restricted', value: '00000001234503' });
    expect(normalizeGtin('21234569')).toEqual({ kind: 'restricted', value: '00000021234569' });
  });

  it('rejects an 8-digit code that is neither UPC-E nor EAN-8', () => {
    expect(normalizeGtin('01234566')).toEqual({ kind: 'invalid', reason: 'check_digit' });
  });

  it('agrees with the twins on every clean vector', () => {
    const all = [...vectors.isValid, ...vectors.normalize, ...vectors.isRestricted];
    for (const { code } of all) {
      if (!/^[0-9]+$/.test(code) || code.length < 6) continue;
      const result = normalizeGtin(code);
      expect(result.kind !== 'invalid', code).toBe(gtinNormalize(code) !== null);
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
