// Redaction applied to a raw response before it is uploaded (generalised from legacy
// fortinos/sanitize.ts). Raw files are kept for weeks and admins can download them, so no cookie,
// token, session or account identifier may reach the bucket.
//
// The body rules are narrower than the logger's on purpose: a raw body is parsed again later, so
// only keys that are plainly session or identity fields are blanked. Catalog fields stay intact.
import { REDACTED } from '../log.ts';

/** Response headers worth keeping with a raw file. Everything else is dropped. */
const KEEP_HEADERS: ReadonlySet<string> = new Set([
  'content-type',
  'content-encoding',
  'content-language',
  'etag',
  'last-modified',
  'date',
  'age',
  'cache-control',
  'expires',
  'link',
  'location',
  'retry-after',
  'x-total-count',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
]);

/** Keeps only allow-listed headers, with lower-case names. Unknown headers are dropped. */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase();
    if (KEEP_HEADERS.has(key)) out[key] = value;
  }
  return out;
}

/** Exact body keys (lower case, `-` read as `_`) that hold a session or identity value. */
const SECRET_BODY_KEYS: ReadonlySet<string> = new Set([
  'cartid',
  'cart_id',
  'sessionid',
  'session_id',
  'token',
  'accesstoken',
  'refreshtoken',
  'userid',
  'user_id',
  'customerid',
  'customer_id',
  'loyaltycardnumber',
  'email',
  'deviceid',
  'device_id',
  'correlationid',
  'password',
  'apikey',
]);

/** Key fragments that mark a secret wherever they appear. */
const SECRET_BODY_FRAGMENTS = [
  'access_token',
  'refresh_token',
  'id_token',
  'api_key',
  'authorization',
  'cookie',
  'secret',
  'password',
];

function isSecretKey(key: string): boolean {
  const k = key.toLowerCase().replaceAll('-', '_');
  return SECRET_BODY_KEYS.has(k) || SECRET_BODY_FRAGMENTS.some((f) => k.includes(f));
}

/** Returns a copy of a parsed JSON value with secret keys replaced, and whether any were found. */
export function redactJsonValue(value: unknown): { value: unknown; changed: boolean } {
  let changed = false;
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (isSecretKey(k) && v !== null && v !== '') {
          out[k] = REDACTED;
          changed = true;
        } else {
          out[k] = visit(v);
        }
      }
      return out;
    }
    return node;
  };
  return { value: visit(value), changed };
}

function isJsonType(contentType: string): boolean {
  const type = contentType.split(';')[0]!.trim().toLowerCase();
  return type === 'application/json' || type.endsWith('+json');
}

function isNdjsonType(contentType: string): boolean {
  const type = contentType.split(';')[0]!.trim().toLowerCase();
  return (
    type === 'application/x-ndjson' || type === 'application/jsonl' || type === 'application/ndjson'
  );
}

function redactJsonText(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text; // Not valid JSON after all: stored as fetched, and the parser will report it.
  }
  const { value, changed } = redactJsonValue(parsed);
  return changed ? JSON.stringify(value) : text;
}

/**
 * Blanks secret fields in a JSON or NDJSON body. A body with nothing to redact comes back
 * byte-for-byte unchanged, so the stored file is what the source sent. Other content types (HTML,
 * XML, CSV) are returned as they are.
 */
export function redactBody(body: string, contentType: string): string {
  if (isJsonType(contentType)) return redactJsonText(body);
  if (isNdjsonType(contentType)) {
    return body
      .split('\n')
      .map((line) => (line.trim() === '' ? line : redactJsonText(line)))
      .join('\n');
  }
  return body;
}

/** Query parameter names (lower case) that carry a credential. */
const SECRET_QUERY_PARAMS: ReadonlySet<string> = new Set([
  'key',
  'apikey',
  'api_key',
  'token',
  'access_token',
  'auth',
  'signature',
  'sig',
  'session',
  'sessionid',
  'password',
]);

/** Replaces credential query parameters in a URL, so request URLs can be stored and shown. */
export function redactUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  let changed = false;
  if (parsed.username || parsed.password) {
    parsed.username = '';
    parsed.password = '';
    changed = true;
  }
  for (const name of [...parsed.searchParams.keys()]) {
    if (SECRET_QUERY_PARAMS.has(name.toLowerCase())) {
      parsed.searchParams.set(name, REDACTED);
      changed = true;
    }
  }
  return changed ? parsed.toString() : url;
}
