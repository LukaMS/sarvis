// Company, brand and ownership-edge records (DATA_MODEL §3.2).
// Status values a source can report only; `merged` and `rejected` are admin decisions.
// Edges carry no +review block: every imported edge starts `pending`, and the writer sets that.

import { z } from 'zod';

import {
  ConfidenceSchema,
  CountrySchema,
  DateSchema,
  HttpUrlSchema,
  provenanceShape,
  reviewNoteShape,
  SlugSchema,
  textField,
  validRangeOk,
} from './common.ts';

const WikidataQidSchema = z.string().regex(/^Q[1-9][0-9]*$/, 'Wikidata QID');

export const CompanyRecordSchema = z.strictObject({
  slug: SlugSchema,
  name: textField(200),
  legal_name: textField(300).nullish(),
  aliases: z.array(textField(200)).default([]),
  kind: z
    .enum(['company', 'cooperative', 'government', 'individual', 'nonprofit'])
    .default('company'),
  country: CountrySchema.nullish(),
  headquarters: textField(300).nullish(),
  founded_year: z.number().int().min(1000).max(2100).nullish(),
  ownership_type: z.enum(['public', 'private', 'state', 'coop']).nullish(),
  stock_ticker: textField(30).nullish(),
  website: HttpUrlSchema.nullish(),
  description: z.string().min(1).nullish(),
  logo_url: HttpUrlSchema.nullish(),
  ceo: textField(200).nullish(),
  revenue_range: textField(100).nullish(),
  wikidata_qid: WikidataQidSchema.nullish(),
  wikipedia_title: textField(300).nullish(),
  wikipedia_revision_id: z.number().int().positive().nullish(),
  sec_cik: z
    .string()
    .regex(/^[0-9]{10}$/, 'SEC CIK, 10 digits')
    .nullish(),
  corp_canada_number: z
    .string()
    .regex(/^[0-9]{1,12}$/)
    .nullish(),
  opencorporates_id: z
    .string()
    .regex(/^[a-z]{2}(_[a-z0-9]+)?\/.+$/, 'jurisdiction/number')
    .nullish(),
  status: z.enum(['active', 'defunct']).default('active'),
  ...provenanceShape,
});
export type CompanyRecord = z.infer<typeof CompanyRecordSchema>;

export const BrandRecordSchema = z.strictObject({
  slug: SlugSchema,
  name: textField(200),
  aliases: z.array(textField(200)).default([]),
  wikidata_qid: WikidataQidSchema.nullish(),
  website: HttpUrlSchema.nullish(),
  logo_url: HttpUrlSchema.nullish(),
  description: z.string().min(1).nullish(),
  is_private_label: z.boolean().default(false),
  status: z.enum(['active', 'defunct']).default('active'),
  ...provenanceShape,
});
export type BrandRecord = z.infer<typeof BrandRecordSchema>;

const edgeShape = {
  valid_from: DateSchema.nullish(),
  valid_to: DateSchema.nullish(),
  confidence: ConfidenceSchema.nullish(),
  ai_call_id: z.number().int().positive().nullish(),
  ...reviewNoteShape,
  ...provenanceShape,
};

const aiNeedsConfidence = (r: { method: string; confidence?: number | null }) =>
  r.method !== 'ai' || r.confidence != null;

export const CompanyOwnershipEdgeRecordSchema = z
  .strictObject({
    parent_company_slug: SlugSchema,
    child_company_slug: SlugSchema,
    relation: z.enum([
      'subsidiary',
      'majority_stake',
      'minority_stake',
      'joint_venture',
      'division',
    ]),
    share_pct: z.number().positive().max(100).nullish(),
    ...edgeShape,
  })
  .refine((r) => r.parent_company_slug !== r.child_company_slug, {
    message: 'A company cannot own itself',
    path: ['child_company_slug'],
  })
  .refine(validRangeOk, { message: 'valid_to is before valid_from', path: ['valid_to'] })
  .refine(aiNeedsConfidence, { message: 'AI edges need a confidence', path: ['confidence'] });
export type CompanyOwnershipEdgeRecord = z.infer<typeof CompanyOwnershipEdgeRecordSchema>;

export const BrandOwnershipEdgeRecordSchema = z
  .strictObject({
    brand_slug: SlugSchema,
    company_slug: SlugSchema,
    relation: z.enum(['owner', 'licensee', 'private_label_of']),
    ...edgeShape,
  })
  .refine(validRangeOk, { message: 'valid_to is before valid_from', path: ['valid_to'] })
  .refine(aiNeedsConfidence, { message: 'AI edges need a confidence', path: ['confidence'] });
export type BrandOwnershipEdgeRecord = z.infer<typeof BrandOwnershipEdgeRecordSchema>;
