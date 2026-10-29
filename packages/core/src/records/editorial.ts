// Product-page content and story records (DATA_MODEL §3.7, D-039).
// Features and steps arrive `pending`. A story has no review block: it arrives as a draft
// (no published_at) unless the source publishes it, and publishing is the review step.

import { z } from 'zod';

import {
  DateTimeSchema,
  ProductRefSchema,
  provenanceShape,
  reviewNoteShape,
  SlugSchema,
  textField,
} from './common.ts';

/** The 24 MaterialCommunityIcons names the product_features_icon check allows (D-039). */
export const FEATURE_ICONS = [
  'sprout',
  'recycle',
  'water-outline',
  'molecule-co2',
  'leaf',
  'package-variant',
  'rabbit',
  'hand-heart',
  'dna',
  'cow',
  'snowflake',
  'water-alert',
  'bottle-soda',
  'factory',
  'alert-circle',
  'certificate',
  'earth',
  'shield-check',
  'account-group',
  'tree',
  'fish',
  'flash',
  'truck-delivery',
  'store',
] as const;

export const ProductFeatureRecordSchema = z.strictObject({
  product: ProductRefSchema,
  icon: z.enum(FEATURE_ICONS),
  title: textField(120),
  description: z.string().min(1).max(500).nullish(),
  /** The import key with the product. */
  sort_order: z.number().int().min(0).max(32_767),
  ...reviewNoteShape,
  ...provenanceShape,
});
export type ProductFeatureRecord = z.infer<typeof ProductFeatureRecordSchema>;

/** The four fixed slots, in display order. */
export const TRANSPARENCY_STEPS = ['sourcing', 'production', 'packaging', 'distribution'] as const;
export type TransparencyStep = (typeof TRANSPARENCY_STEPS)[number];

export const TransparencyStepRecordSchema = z.strictObject({
  product: ProductRefSchema,
  step: z.enum(TRANSPARENCY_STEPS),
  title: textField(120),
  description: z.string().min(1).max(1000).nullish(),
  ...reviewNoteShape,
  ...provenanceShape,
});
export type TransparencyStepRecord = z.infer<typeof TransparencyStepRecordSchema>;

export const StoryRecordSchema = z.strictObject({
  slug: SlugSchema,
  title: textField(200),
  subtitle: z.string().min(1).max(300).nullish(),
  category: textField(100).nullish(),
  body: z.string().min(1).max(50_000).nullish(),
  company_slug: SlugSchema.nullish(),
  featured: z.boolean().default(false),
  /** Null is a draft. Cover images are added by an admin after a licence check, never imported. */
  published_at: DateTimeSchema.nullish(),
  ...reviewNoteShape,
  ...provenanceShape,
});
export type StoryRecord = z.infer<typeof StoryRecordSchema>;
