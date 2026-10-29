// The legacy-import mapping over the real P0.2 export: no database.
import { type RecordKind, validateBatch } from '@sarvis/core';
import { describe, expect, it } from 'vitest';

import { envelopeOf } from '../../raw/store.ts';
import type { RawPayload, RecordBatch } from '../source.ts';
import { createLegacyImportSource } from './index.ts';
import { UNREVIEWED, schemeOf, stepOf } from './map.ts';

async function parseAll(): Promise<RecordBatch[]> {
  const source = createLegacyImportSource();
  const steps = await source.plan({} as never);
  const batches: RecordBatch[] = [];
  for (const step of steps) {
    const { response } = await source.fetch(step, {} as never);
    const e = envelopeOf(response);
    const raw: RawPayload = {
      rawObjectId: null,
      body: e.body,
      contentType: e.content_type,
      requestUrl: e.request_url,
      httpStatus: e.http_status,
      headers: e.headers,
      fetchedAt: e.fetched_at,
    };
    batches.push(...(source.parse(raw).batches ?? []));
  }
  return batches;
}

const batches = await parseAll();
type Rec = Record<string, unknown>;
const of = (kind: RecordKind): Rec[] =>
  batches.filter((b) => b.kind === kind).flatMap((b) => b.records as Rec[]);

describe('legacy-import mapping', () => {
  it('maps every row the README lists, plus the derived rows', () => {
    const counts = Object.fromEntries(
      [...new Set(batches.map((b) => b.kind))].map((k) => [k, of(k).length]),
    );
    expect(counts).toEqual({
      company: 11,
      company_score: 55 + 11, // + one overall score per company
      brand: 49,
      brand_ownership: 49,
      certification: 6 + 14, // + the free-text labels on products
      company_event: 2 + 5,
      product: 13,
      product_feature: 30,
      transparency_step: 20,
      story: 6,
    });
  });

  it('validates every record and finds no duplicates', () => {
    for (const kind of new Set(batches.map((b) => b.kind))) {
      const result = validateBatch(kind, of(kind));
      expect(result.failures, kind).toEqual([]);
    }
  });

  it('keeps company slugs and generates unique brand slugs', () => {
    expect(of('company').map((c) => c.slug)).toContain('sun-brite-foods');
    const slugs = of('brand').map((b) => b.slug);
    expect(new Set(slugs).size).toBe(49);
    expect(slugs).toEqual(expect.arrayContaining(['uncle-bens', 'haagen-dazs', 'ben-and-jerrys']));
  });

  it('normalizes barcodes and imports the bad one without a GTIN', () => {
    const products = new Map(of('product').map((p) => [p.name, p]));
    expect(products.get('Green Goodness')?.gtin).toBe('00071464316549');
    expect(products.get('Alpro Oat Milk')?.gtin).toBe('05411188133148');
    const soup = products.get('Patagonia Provisions Soup');
    expect(soup?.gtin).toBeNull();
    expect(soup?.review_reason).toMatch(/0850034340016 is not a valid GTIN \(check_digit\)/);
  });

  it('links brands by exact name and queues the rest', () => {
    const products = new Map(of('product').map((p) => [p.name, p]));
    expect(products.get('KitKat Original')?.brand_slug).toBe('kitkat');
    expect(products.get("Lay's Classic Chips")?.brand_slug).toBe('lays');
    expect(products.get('Scoobi Doo Pasta')?.brand_slug).toBe('unico');
    expect(products.get('KitKat Original')?.review_reason).toBeNull();
    for (const name of ['Green Goodness', 'Kashi Bars']) {
      expect(products.get(name)?.brand_slug).toBeNull();
      expect(products.get(name)?.review_reason).toMatch(/link it/);
    }
    expect(products.get('Kashi Bars')?.review_reason).toMatch(/not a General Mills brand/);
    expect(of('product').filter((p) => p.brand_slug).length).toBe(11);
  });

  it('marks every reviewable fact for review, with the P0.2 notes', () => {
    for (const kind of [
      'company_score',
      'brand_ownership',
      'certification',
      'company_event',
      'product_feature',
      'transparency_step',
    ] as const) {
      for (const r of of(kind)) expect(r.review_reason, kind).toMatch(UNREVIEWED);
    }
    const reasons = (kind: RecordKind, key: string, value: string) =>
      of(kind)
        .filter((r) => r[key] === value)
        .map((r) => r.review_reason as string);
    expect(reasons('company_score', 'company_slug', 'bolthouse-farms')).toHaveLength(6);
    for (const r of reasons('company_score', 'company_slug', 'bolthouse-farms'))
      expect(r).toMatch(/overall Good/);
    for (const r of reasons('company_score', 'company_slug', 'sun-brite-foods'))
      expect(r).toMatch(/placeholders/);
    expect(reasons('brand_ownership', 'brand_slug', 'uncle-bens')[0]).toMatch(/Ben's Original/);
  });

  it('maps legacy score categories and overall ratings', () => {
    const scores = of('company_score');
    expect(new Set(scores.map((s) => s.category))).toEqual(
      new Set([
        'environment',
        'labour',
        'animal_welfare',
        'politics_tax',
        'human_rights',
        'overall',
      ]),
    );
    const nestle = scores.find((s) => s.company_slug === 'nestle' && s.category === 'overall');
    expect(nestle?.rating).toBe('Poor');
    expect(nestle).not.toHaveProperty('score');
  });

  it('maps steps by title into four unique slots per product', () => {
    const steps = of('transparency_step');
    const keys = steps.map((s) => `${(s.product as Rec).external_id}:${s.step}`);
    expect(new Set(keys).size).toBe(20);
    const byTitle = Object.fromEntries(steps.map((s) => [s.title, s.step]));
    expect(byTitle).toMatchObject({
      'Carbon Offset Shipping': 'distribution',
      'Global Distribution': 'distribution',
      'Bottling at Source': 'production',
      'Natural Filtration': 'sourcing',
      'Recycled Packaging': 'packaging',
    });
    expect(stepOf('Something else', 2)).toBe('production');
  });

  it('imports stories as drafts without covers', () => {
    for (const s of of('story')) {
      expect(s.published_at).toBeNull();
      expect(s.review_reason).toMatch(/dropped until a licence check/);
    }
    expect(of('story').map((s) => s.slug)).toContain('the-hidden-cost-of-chocolate');
  });

  it('maps certification names to schemes', () => {
    expect(schemeOf('B-Corp (select subsidiaries)')).toBe('b_corp');
    expect(schemeOf('Fair Trade Certified')).toBe('fairtrade');
    expect(schemeOf('Rainforest Alliance (partial)')).toBe('rainforest_alliance');
    expect(schemeOf('1% for the Planet')).toBe('other');
  });

  it('refuses a stored file that is not from the export', () => {
    const source = createLegacyImportSource();
    expect(() =>
      source.parse({
        rawObjectId: null,
        body: '[]',
        contentType: 'application/json',
        requestUrl: 'docs/legacy/data/app_settings.json',
        httpStatus: null,
        headers: {},
        fetchedAt: '2026-10-26T00:00:00Z',
      }),
    ).toThrow(/Not a legacy export file/);
  });
});
