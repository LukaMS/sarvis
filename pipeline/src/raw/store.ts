// Raw store (CLAUDE.md "Raw data", D-010, D-044). Every response is redacted, wrapped in a small
// JSON envelope, gzipped and uploaded to the private `raw` bucket before it is parsed, and gets a
// `raw_objects` row. Parsers read it back with readRaw(), so they can re-run without fetching again.
import { createHash, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { constants, gunzip, gzip } from 'node:zlib';

import { z } from 'zod';

import type { ServiceClient } from '../db/client.ts';
import { DatabaseError, NotFoundError, SchemaValidationError } from '../errors.ts';
import { redactBody, redactHeaders, redactUrl } from './redact.ts';
import { expiresAt, retentionFor } from './retention.ts';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export const RAW_BUCKET = 'raw';
export const RAW_FORMAT = 'sarvis-raw/1';
const GZIP_CONTENT_TYPE = 'application/gzip';
const DEFAULT_BODY_TYPE = 'application/json';

/** What gets stored. An HttpResponse from the polite client fits as it is. */
export interface RawInput {
  body: string;
  fetchedAt: string | Date;
  /** The request URL. Credential query parameters are redacted before storing. */
  url?: string | null;
  status?: number | null;
  headers?: Record<string, string>;
  /** Defaults to the `content-type` header, then application/json. */
  contentType?: string;
}

const envelopeSchema = z.object({
  format: z.literal(RAW_FORMAT),
  request_url: z.string().nullable(),
  http_status: z.number().int().nullable(),
  content_type: z.string(),
  fetched_at: z.string(),
  headers: z.record(z.string(), z.string()),
  body: z.string(),
});

export type RawEnvelope = z.infer<typeof envelopeSchema>;

export interface EncodedRaw {
  envelope: RawEnvelope;
  gz: Buffer;
  /** sha-256 of the redacted body, so the same response always has the same hash. */
  sha256: string;
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The redacted envelope a response is stored as. A dry run parses this without storing it. */
export function envelopeOf(input: RawInput): RawEnvelope {
  const headers = redactHeaders(input.headers ?? {});
  const contentType = input.contentType ?? headers['content-type'] ?? DEFAULT_BODY_TYPE;
  return {
    format: RAW_FORMAT,
    request_url: input.url == null ? null : redactUrl(input.url),
    http_status: input.status ?? null,
    content_type: contentType,
    fetched_at: input.fetchedAt instanceof Date ? input.fetchedAt.toISOString() : input.fetchedAt,
    headers,
    body: redactBody(input.body, contentType),
  };
}

/** Redacts and gzips a response. Pure apart from the CPU work. */
export async function encodeRaw(input: RawInput): Promise<EncodedRaw> {
  const envelope = envelopeOf(input);
  const gz = await gzipAsync(Buffer.from(JSON.stringify(envelope), 'utf8'), {
    level: constants.Z_BEST_COMPRESSION,
  });
  return { envelope, gz, sha256: sha256Hex(envelope.body) };
}

export async function decodeRaw(gz: Uint8Array): Promise<RawEnvelope> {
  let json: unknown;
  try {
    json = JSON.parse((await gunzipAsync(gz)).toString('utf8'));
  } catch (err) {
    throw new SchemaValidationError('Raw file is not gzipped JSON.', err);
  }
  const parsed = envelopeSchema.safeParse(json);
  if (!parsed.success) {
    throw new SchemaValidationError(`Raw file envelope is invalid: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** Object key inside the bucket. `storage_path` on the row is this with `raw/` in front. */
export function rawObjectKey(
  sourceKey: string,
  runId: string | null,
  seq: number | string,
): string {
  const name = typeof seq === 'number' ? String(seq).padStart(6, '0') : seq;
  return `${sourceKey}/${runId ?? 'adhoc'}/${name}.json.gz`;
}

export interface RawStoreContext {
  db: ServiceClient;
  sourceId: string;
  sourceKey: string;
  /** Null for files written outside a run; they go under `{source}/adhoc/`. */
  runId: string | null;
  /** OFF daily delta files keep a different retention from full extracts. */
  delta?: boolean;
}

export interface StoredRaw {
  id: string;
  storagePath: string;
  sha256: string;
  /** Gzipped size: what the file costs in Storage. */
  byteSize: number;
  expiresAt: string | null;
}

/**
 * Uploads one response and records it. `seq` numbers the files of a run (the driver assigns it);
 * a file outside a run is named by its row id. Upload comes first so a row never points at nothing;
 * if the insert fails, the upload is removed again.
 */
export async function storeRaw(
  ctx: RawStoreContext,
  seq: number | null,
  input: RawInput,
): Promise<StoredRaw> {
  if (seq !== null && (!Number.isInteger(seq) || seq < 0)) {
    throw new SchemaValidationError(`Raw seq must be a non-negative integer, got ${seq}.`);
  }
  if (ctx.runId !== null && seq === null) {
    throw new SchemaValidationError('Raw files written in a run need a seq.');
  }
  const id = randomUUID();
  const encoded = await encodeRaw(input);
  const key = rawObjectKey(ctx.sourceKey, ctx.runId, seq ?? id);
  const storagePath = `${RAW_BUCKET}/${key}`;
  const expires = expiresAt(
    new Date(encoded.envelope.fetched_at),
    retentionFor(ctx.sourceKey, { delta: ctx.delta }),
  );

  const bucket = ctx.db.storage.from(RAW_BUCKET);
  const upload = await bucket.upload(key, encoded.gz, {
    contentType: GZIP_CONTENT_TYPE,
    upsert: false,
  });
  if (upload.error) {
    throw new DatabaseError(
      `Uploading ${storagePath} failed: ${upload.error.message}`,
      upload.error,
    );
  }

  const row = {
    id,
    source_id: ctx.sourceId,
    run_id: ctx.runId,
    storage_path: storagePath,
    content_sha256: encoded.sha256,
    byte_size: encoded.gz.byteLength,
    content_type: encoded.envelope.content_type,
    request_url: encoded.envelope.request_url,
    http_status: encoded.envelope.http_status,
    fetched_at: encoded.envelope.fetched_at,
    expires_at: expires?.toISOString() ?? null,
  };
  const { error } = await ctx.db.from('raw_objects').insert(row);
  if (error) {
    await bucket.remove([key]);
    throw new DatabaseError(`Recording ${storagePath} failed: ${error.message}`, error);
  }
  return {
    id,
    storagePath,
    sha256: encoded.sha256,
    byteSize: row.byte_size,
    expiresAt: row.expires_at,
  };
}

export interface ReadRaw {
  id: string;
  sourceId: string;
  runId: string | null;
  storagePath: string;
  body: string;
  contentType: string;
  requestUrl: string | null;
  httpStatus: number | null;
  headers: Record<string, string>;
  fetchedAt: string;
}

function objectKeyOf(storagePath: string): string {
  return storagePath.slice(RAW_BUCKET.length + 1);
}

/**
 * Downloads and decompresses a stored response, checking it against the row's sha-256. Throws
 * NotFoundError when the row is gone, its file was deleted by retention, or the file is missing.
 */
export async function readRaw(db: ServiceClient, id: string): Promise<ReadRaw> {
  const { data: row, error } = await db
    .from('raw_objects')
    .select('id, source_id, run_id, storage_path, content_sha256, deleted_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new DatabaseError(`Reading raw object ${id} failed: ${error.message}`, error);
  if (!row) throw new NotFoundError(`Raw object ${id} does not exist.`);
  if (row.deleted_at) {
    throw new NotFoundError(`Raw object ${id} was deleted at ${row.deleted_at} (retention).`);
  }

  const download = await db.storage.from(RAW_BUCKET).download(objectKeyOf(row.storage_path));
  if (download.error) {
    throw new NotFoundError(
      `Raw file ${row.storage_path} could not be downloaded.`,
      download.error,
    );
  }
  const envelope = await decodeRaw(new Uint8Array(await download.data.arrayBuffer()));
  if (sha256Hex(envelope.body) !== row.content_sha256) {
    throw new SchemaValidationError(`Raw file ${row.storage_path} does not match its sha-256.`);
  }
  return {
    id: row.id,
    sourceId: row.source_id,
    runId: row.run_id,
    storagePath: row.storage_path,
    body: envelope.body,
    contentType: envelope.content_type,
    requestUrl: envelope.request_url,
    httpStatus: envelope.http_status,
    headers: envelope.headers,
    fetchedAt: envelope.fetched_at,
  };
}

/** Deletes the file and marks the row (`deleted_at`). The row stays as provenance (D-010). */
export async function deleteRawFile(db: ServiceClient, id: string): Promise<void> {
  const { data: row, error } = await db
    .from('raw_objects')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new DatabaseError(`Reading raw object ${id} failed: ${error.message}`, error);
  if (!row) throw new NotFoundError(`Raw object ${id} does not exist.`);

  const removed = await db.storage.from(RAW_BUCKET).remove([objectKeyOf(row.storage_path)]);
  if (removed.error) {
    throw new DatabaseError(
      `Deleting ${row.storage_path} failed: ${removed.error.message}`,
      removed.error,
    );
  }
  const marked = await db
    .from('raw_objects')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (marked.error) {
    throw new DatabaseError(
      `Marking raw object ${id} deleted failed: ${marked.error.message}`,
      marked.error,
    );
  }
}
