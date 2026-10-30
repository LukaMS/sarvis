// Document records (DATA_MODEL §3.6): cited or linked pages. Full text is never stored.

import { z } from 'zod';

import { DateSchema, DateTimeSchema, HttpUrlSchema, provenanceShape } from './common.ts';

export const DOCUMENT_KINDS = [
  'news',
  'wikipedia',
  'sec_filing',
  'certification_page',
  'report',
  'company_site',
  'other',
] as const;

export const DocumentRecordSchema = z
  .strictObject({
    url: HttpUrlSchema,
    /** The `documents` import key (lower-case host, no fragment or tracking parameters). */
    url_normalized: HttpUrlSchema,
    kind: z.enum(DOCUMENT_KINDS),
    title: z.string().max(500).nullish(),
    publisher: z.string().max(200).nullish(),
    domain: z
      .string()
      .regex(/^[a-z0-9.-]+$/, 'Lower-case host name')
      .nullish(),
    published_at: DateTimeSchema.nullish(),
    language: z
      .string()
      .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'Language tag, e.g. en or fr-CA')
      .nullish(),
    wikipedia_revision_id: z.number().int().positive().nullish(),
    /** A short extract shown with attribution, never full text (D-014). Wikipedia only. */
    summary: z.string().min(1).max(2000).nullish(),
    sec_accession: z
      .string()
      .regex(/^[0-9]{10}-[0-9]{2}-[0-9]{6}$/, 'SEC accession number')
      .nullish(),
    sec_filed_on: DateSchema.nullish(),
    archive_url: HttpUrlSchema.nullish(),
    ...provenanceShape,
  })
  .refine((r) => r.kind === 'sec_filing' || (r.sec_accession == null && r.sec_filed_on == null), {
    message: 'SEC fields are only for sec_filing documents',
    path: ['sec_accession'],
  })
  .refine((r) => r.kind === 'wikipedia' || r.wikipedia_revision_id == null, {
    message: 'wikipedia_revision_id is only for wikipedia documents',
    path: ['wikipedia_revision_id'],
  })
  .refine((r) => r.kind === 'wikipedia' || r.summary == null, {
    message: 'summary is only for wikipedia documents',
    path: ['summary'],
  });
export type DocumentRecord = z.infer<typeof DocumentRecordSchema>;
