// Company score, certification and company event records (DATA_MODEL §3.6, D-038).
// Every one arrives `pending`; the review decision is an admin's, so no +review fields here.
// Citations and document links arrive with the Phase 7 writers.

import { z } from 'zod';

import {
  ConfidenceSchema,
  DateSchema,
  ProductRefSchema,
  provenanceShape,
  reviewNoteShape,
  SlugSchema,
  textField,
} from './common.ts';

export const SCORE_CATEGORIES = [
  'environment',
  'labour',
  'animal_welfare',
  'politics_tax',
  'human_rights',
  'overall',
] as const;
export type ScoreCategory = (typeof SCORE_CATEGORIES)[number];

export const RATINGS = ['Good', 'Mixed', 'Poor'] as const;
/** The legacy `scoreToGrade` letters. */
export const GRADES = [
  'A+',
  'A',
  'A-',
  'B+',
  'B',
  'B-',
  'C+',
  'C',
  'C-',
  'D+',
  'D',
  'D-',
  'F',
] as const;

export const CompanyScoreRecordSchema = z
  .strictObject({
    company_slug: SlugSchema,
    /** `rubrics.version` (`v1`). Only a legacy score may have none (D-038). */
    rubric_version: z
      .string()
      .regex(/^v[0-9]+$/, 'Rubric version, e.g. v1')
      .nullish(),
    category: z.enum(SCORE_CATEGORIES),
    rating: z.enum(RATINGS).nullish(),
    score: z.number().int().min(0).max(100).nullish(),
    grade: z.enum(GRADES).nullish(),
    rationale: z.string().min(1).max(1000).nullish(),
    confidence: ConfidenceSchema.nullish(),
    model: textField(200).nullish(),
    ai_call_id: z.number().int().positive().nullish(),
    ...reviewNoteShape,
    ...provenanceShape,
  })
  .refine(
    (r) =>
      r.category === 'overall'
        ? (r.score == null) === (r.grade == null) && (r.rating != null || r.score != null)
        : r.rating != null && r.score == null && r.grade == null,
    {
      message: 'A category needs a rating only; overall needs a rating or a score with its grade',
      path: ['rating'],
    },
  )
  .refine((r) => ['ai', 'manual', 'legacy-import'].includes(r.method), {
    message: 'Scores come from ai, manual or legacy-import',
    path: ['method'],
  })
  .refine((r) => r.method === 'legacy-import' || r.confidence != null, {
    message: 'A score needs a confidence',
    path: ['confidence'],
  })
  .refine((r) => r.method === 'legacy-import' || r.rubric_version != null, {
    message: 'A score needs a rubric version',
    path: ['rubric_version'],
  })
  .refine((r) => r.method !== 'ai' || r.model != null, {
    message: 'An AI score names its model',
    path: ['model'],
  });
export type CompanyScoreRecord = z.infer<typeof CompanyScoreRecordSchema>;

export const CERTIFICATION_SCHEMES = [
  'b_corp',
  'fairtrade',
  'canada_organic',
  'rainforest_alliance',
  'rspo',
  'other',
] as const;

/** What a certification, link or event is about: exactly one of these is set. */
const oneSubject = (r: {
  company_slug?: string | null;
  brand_slug?: string | null;
  product?: unknown;
}) => [r.company_slug, r.brand_slug, r.product].filter((v) => v != null).length === 1;

export const CertificationRecordSchema = z
  .strictObject({
    company_slug: SlugSchema.nullish(),
    brand_slug: SlugSchema.nullish(),
    product: ProductRefSchema.nullish(),
    scheme: z.enum(CERTIFICATION_SCHEMES),
    /** The scheme's own name; required for `other`, and kept as the source wrote it for the rest. */
    scheme_name: textField(200).nullish(),
    status: z.enum(['certified', 'lapsed', 'revoked']).default('certified'),
    certified_on: DateSchema.nullish(),
    expires_on: DateSchema.nullish(),
    score: z.number().min(0).max(9999.9).nullish(),
    ...reviewNoteShape,
    ...provenanceShape,
  })
  .refine(oneSubject, {
    message: 'Exactly one of company_slug, brand_slug or product',
    path: ['company_slug'],
  })
  .refine((r) => r.scheme !== 'other' || r.scheme_name != null, {
    message: 'An other scheme needs its name',
    path: ['scheme_name'],
  })
  .refine((r) => !r.certified_on || !r.expires_on || r.expires_on >= r.certified_on, {
    message: 'expires_on is before certified_on',
    path: ['expires_on'],
  });
export type CertificationRecord = z.infer<typeof CertificationRecordSchema>;

export const CompanyEventRecordSchema = z.strictObject({
  company_slug: SlugSchema,
  kind: z.enum(['boycott', 'controversy', 'recall', 'lawsuit', 'award']),
  title: textField(300),
  description: z.string().min(1).max(2000).nullish(),
  event_date: DateSchema.nullish(),
  /** Free-text date ("2024 (ongoing)") when it doesn't parse to event_date. */
  date_text: textField(100).nullish(),
  status: z.enum(['active', 'resolved', 'paused']).default('active'),
  severity: z.enum(['low', 'medium', 'high', 'critical']).nullish(),
  ...reviewNoteShape,
  ...provenanceShape,
});
export type CompanyEventRecord = z.infer<typeof CompanyEventRecordSchema>;
