// Change detection: a hash over a record's imported fields (adapted from legacy fingerprintMetadata,
// with SHA-256 and a canonical key order instead of a hand-listed field order).

import { sha256Hex } from './sha256';

/** Fields that change on every run without the fact changing. They never enter the hash. */
export const CONTENT_HASH_IGNORED: readonly string[] = [
  'fetched_at',
  'method_version',
  'ingestion_run_id',
  'raw_object_id',
];

/**
 * JSON with object keys sorted at every level. Null and undefined object fields are dropped, so
 * "missing" and "null" hash the same. Array order is kept: sort arrays first if order is noise.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Hex SHA-256 over the record's fields, minus CONTENT_HASH_IGNORED and any extra `omit` keys.
 * Writers store it in `content_hash` (bytea, as `\x` + hex) and skip rows whose hash is unchanged.
 */
export function contentHash(record: Record<string, unknown>, omit: readonly string[] = []): string {
  const skip = new Set([...CONTENT_HASH_IGNORED, ...omit]);
  const fields = Object.fromEntries(Object.entries(record).filter(([k]) => !skip.has(k)));
  return sha256Hex(canonicalJson(fields));
}
