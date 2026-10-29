import { describe, expect, it } from 'vitest';

import { cleanText, normalizeMatchText, stripHtml } from './text';

// Legacy cases from catalog-worker providers/fortinos/normalizer.test.ts.
describe('stripHtml', () => {
  it('removes tags and decodes entities', () => {
    expect(stripHtml('<p>Made in Canada&reg;</p><ul><li>A</li><li>B</li></ul>')).toContain(
      'Made in Canada',
    );
    expect(stripHtml('<p>Whole grain &amp; seeds</p>')).toBe('Whole grain & seeds');
    expect(stripHtml(null)).toBeNull();
  });
});

describe('cleanText', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanText('  a   b ')).toBe('a b');
    expect(cleanText(null)).toBeNull();
  });

  it('returns null for blank text', () => {
    expect(cleanText(' \n\t ')).toBeNull();
  });
});

describe('normalizeMatchText', () => {
  it('drops accents, lower-cases and collapses spaces', () => {
    expect(normalizeMatchText('  Crème   Fraîche 250 ML ')).toBe('creme fraiche 250 ml');
  });
});
