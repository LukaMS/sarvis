// validateBatch: parsed records in, valid records and validation_failures-shaped rows out
// (CLAUDE.md "Validation before writing"; DATA_MODEL §3.1). Each record gets at most one failure,
// for the first rule it breaks, in this order: schema rules, unit_parse, price_sanity, duplicate.

import type { z } from 'zod';

import { gtinIsValid } from '../gtin';
import {
  type PriceObservationRecord,
  type ProductRecord,
  RECORD_SCHEMAS,
  type RecordKind,
  type RecordOf,
} from '../records';
import { rawRecordKey, recordKeys } from './keys';
import { trimPayload } from './payload';

export const VALIDATION_RULES = [
  'required_field',
  'gtin_check_digit',
  'price_sanity',
  'unit_parse',
  'duplicate',
  'schema',
] as const;
export type ValidationRule = (typeof VALIDATION_RULES)[number];

/** A validation_failures row minus run_id and raw_object_id, which the run driver adds. */
export interface ValidationFailure {
  /** Position of the record in the input batch. */
  index: number;
  record_key: string | null;
  rule: ValidationRule;
  message: string;
  /** The input record, trimmed to fit 1 KB. */
  payload: unknown;
}

/** A price_sanity_bounds row: unit prices outside [min, max] for this basis fail. */
export interface PriceBounds {
  unit_basis: 'g' | 'ml' | 'ct';
  min_unit_price: number;
  max_unit_price: number;
}

/** Fields a unit parser sets on a product from its `quantity_text`. */
export type UnitParseResult = Pick<
  ProductRecord,
  'unit_parse_status' | 'net_quantity' | 'net_unit' | 'pack_count'
>;

/**
 * The P4 size parser plugs in here. Return undefined to leave the product as the source sent it.
 * A throw, or a result that breaks the product schema, is a `unit_parse` failure.
 */
export type UnitParser = (
  quantityText: string,
  record: ProductRecord,
) => UnitParseResult | undefined;

/** The default: change nothing. */
export const passThroughUnitParser: UnitParser = () => undefined;

export interface ValidateOptions {
  /** Per-category bounds for a price observation (the caller resolves its category); none = hard bounds only. */
  priceBounds?: (record: PriceObservationRecord) => PriceBounds | null | undefined;
  unitParser?: UnitParser;
}

export interface BatchStats {
  total: number;
  valid: number;
  invalid: number;
  byRule: Record<ValidationRule, number>;
  /** Products with a quantity_text that a real parser saw, and how many came out `ok`. Null with the pass-through. */
  unitParse: { attempted: number; ok: number } | null;
}

export interface BatchResult<K extends RecordKind> {
  kind: K;
  valid: RecordOf<K>[];
  failures: ValidationFailure[];
  stats: BatchStats;
}

const MESSAGE_MAX = 500;

/** Fields whose too_small / too_big issues are price_sanity, per kind. */
const PRICE_FIELDS: Partial<Record<RecordKind, readonly string[]>> = {
  price_observation: ['price', 'price_without_discount', 'unit_price'],
  reference_price: ['value'],
};

function valueAt(input: unknown, path: readonly PropertyKey[]): unknown {
  let v = input;
  for (const key of path) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<PropertyKey, unknown>)[key];
  }
  return v;
}

const isGtinShaped = (v: unknown): v is string =>
  typeof v === 'string' && /^([0-9]{8}|[0-9]{12,14})$/.test(v);

function classifyIssue(kind: RecordKind, input: unknown, issue: z.core.$ZodIssue): ValidationRule {
  const value = valueAt(input, issue.path);
  const last = issue.path[issue.path.length - 1];
  const isGtinField =
    last === 'gtin' ||
    (kind === 'product_identifier' &&
      last === 'value' &&
      valueAt(input, ['scheme']) === 'gtin_alt');
  if (isGtinField && isGtinShaped(value) && !gtinIsValid(value)) return 'gtin_check_digit';
  const first = issue.path[0];
  if (
    (issue.code === 'too_small' || issue.code === 'too_big') &&
    typeof first === 'string' &&
    PRICE_FIELDS[kind]?.includes(first)
  ) {
    return 'price_sanity';
  }
  if (issue.code === 'invalid_type' && issue.path.length > 0 && value == null) {
    return 'required_field';
  }
  return 'schema';
}

/** Most specific rule wins when a record breaks several. */
const RULE_PRIORITY: readonly ValidationRule[] = [
  'gtin_check_digit',
  'price_sanity',
  'required_field',
  'schema',
];

function describeIssues(issues: readonly z.core.$ZodIssue[]): string {
  const parts = issues
    .slice(0, 3)
    .map((i) => `${i.path.length ? i.path.join('.') : '(record)'}: ${i.message}`);
  if (issues.length > 3) parts.push(`… ${issues.length - 3} more`);
  return parts.join('; ');
}

type Outcome<K extends RecordKind> =
  { ok: true; record: RecordOf<K> } | { ok: false; rule: ValidationRule; message: string };

function checkSchema<K extends RecordKind>(kind: K, input: unknown): Outcome<K> {
  const result = RECORD_SCHEMAS[kind].safeParse(input);
  if (result.success) return { ok: true, record: result.data as RecordOf<K> };
  const rules = result.error.issues.map((i) => classifyIssue(kind, input, i));
  const rule = RULE_PRIORITY.find((r) => rules.includes(r)) ?? 'schema';
  return { ok: false, rule, message: describeIssues(result.error.issues) };
}

function applyUnitParser(
  record: ProductRecord,
  parser: UnitParser,
  stats: NonNullable<BatchStats['unitParse']>,
): Outcome<'product'> {
  if (record.quantity_text == null) return { ok: true, record };
  stats.attempted++;
  let parsed: UnitParseResult | undefined;
  try {
    parsed = parser(record.quantity_text, record);
  } catch (error) {
    return { ok: false, rule: 'unit_parse', message: `Unit parser threw: ${String(error)}` };
  }
  const next = parsed ? { ...record, ...parsed } : record;
  const result = RECORD_SCHEMAS.product.safeParse(next);
  if (!result.success) {
    return {
      ok: false,
      rule: 'unit_parse',
      message: `"${record.quantity_text}": ${describeIssues(result.error.issues)}`,
    };
  }
  if (result.data.unit_parse_status === 'ok') stats.ok++;
  return { ok: true, record: result.data };
}

function checkPriceBounds(record: PriceObservationRecord, bounds: PriceBounds): string | null {
  const { unit_price, unit_basis } = record;
  if (unit_price == null || unit_basis !== bounds.unit_basis) return null;
  if (unit_price >= bounds.min_unit_price && unit_price <= bounds.max_unit_price) return null;
  return `unit_price ${unit_price}/${unit_basis} is outside ${bounds.min_unit_price}–${bounds.max_unit_price}`;
}

/** Validate a batch of one record kind. The first record with a given stable key wins; later ones are duplicates. */
export function validateBatch<K extends RecordKind>(
  kind: K,
  records: readonly unknown[],
  opts: ValidateOptions = {},
): BatchResult<K> {
  const parser = opts.unitParser;
  const unitParse = parser && parser !== passThroughUnitParser ? { attempted: 0, ok: 0 } : null;
  const valid: RecordOf<K>[] = [];
  const failures: ValidationFailure[] = [];
  const byRule = Object.fromEntries(VALIDATION_RULES.map((r) => [r, 0])) as Record<
    ValidationRule,
    number
  >;
  const seen = new Map<string, number>();

  records.forEach((input, index) => {
    const fail = (rule: ValidationRule, message: string, key: string | null) => {
      byRule[rule]++;
      failures.push({
        index,
        record_key: key,
        rule,
        message: message.slice(0, MESSAGE_MAX),
        payload: trimPayload(input),
      });
    };

    let outcome = checkSchema(kind, input);
    if (!outcome.ok) return fail(outcome.rule, outcome.message, rawRecordKey(input));

    if (kind === 'product' && parser && unitParse) {
      const parsed = applyUnitParser(outcome.record as ProductRecord, parser, unitParse);
      if (!parsed.ok) {
        return fail(parsed.rule, parsed.message, recordKeys(kind, outcome.record)[0] ?? null);
      }
      outcome = { ok: true, record: parsed.record as RecordOf<K> };
    }
    const record = outcome.record;
    const keys = recordKeys(kind, record);

    if (kind === 'price_observation' && opts.priceBounds) {
      const price = record as PriceObservationRecord;
      const bounds = opts.priceBounds(price);
      const problem = bounds ? checkPriceBounds(price, bounds) : null;
      if (problem) return fail('price_sanity', problem, keys[0] ?? null);
    }

    const clash = keys.find((k) => seen.has(k));
    if (clash !== undefined) {
      return fail('duplicate', `Same key "${clash}" as record ${seen.get(clash)}`, keys[0] ?? null);
    }
    for (const k of keys) seen.set(k, index);
    valid.push(record);
  });

  return {
    kind,
    valid,
    failures,
    stats: {
      total: records.length,
      valid: valid.length,
      invalid: failures.length,
      byRule,
      unitParse,
    },
  };
}
