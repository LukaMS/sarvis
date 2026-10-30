// Structured logger (ported from legacy logger.ts). One JSON object per line, so logs stay greppable
// locally and in public GitHub Actions logs (D-003). Two rules hold for every field, at any depth:
// - secrets (keys, tokens, cookies, passwords) print as "[redacted]";
// - row data from user tables (profiles, scans, receipts, receipt lines) prints as "[user-data]".
//   The pipeline has no reason to log a user's rows; this stops one leaking by accident.
import { CatalogError } from './errors.ts';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const REDACTED = '[redacted]';
export const USER_DATA = '[user-data]';

/** Exact key names (lower case, `-` read as `_`) that hold a secret. */
const SECRET_KEYS: ReadonlySet<string> = new Set(['token', 'key', 'apikey', 'jwt', 'bearer']);

/** Key fragments that mark a secret wherever they appear, e.g. `SUPABASE_DEV_SERVICE_ROLE_KEY`. */
const SECRET_FRAGMENTS = [
  'authorization',
  'cookie',
  'password',
  'passwd',
  'secret',
  'service_role',
  'api_key',
  'apikey',
  'access_token',
  'refresh_token',
  'id_token',
  'private_key',
  'storage_state',
  'storagestate',
  // The owner's contact email, and the User-Agent that carries it (D-015).
  'contact_email',
  'contactemail',
  'user_agent',
  'useragent',
];

/** Keys that hold user-table rows or the user's identity (DATA_MODEL §3.9). */
const USER_DATA_KEYS: ReadonlySet<string> = new Set([
  'profile',
  'profiles',
  'scan',
  'scans',
  'receipt',
  'receipts',
  'receipt_line',
  'receipt_lines',
  'user',
  'users',
  'user_id',
  'email',
  'display_name',
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replaceAll('-', '_');
}

function maskFor(key: string): string | undefined {
  const k = normalizeKey(key);
  if (SECRET_KEYS.has(k) || SECRET_FRAGMENTS.some((f) => k.includes(f))) return REDACTED;
  if (USER_DATA_KEYS.has(k)) return USER_DATA;
  return undefined;
}

const MAX_DEPTH = 6;

/** Returns a copy of `value` that is safe to log. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[max-depth]';
  if (value instanceof Error) return serializeError(value, depth);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = maskFor(k) ?? redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

// JSON.stringify(new Error()) is "{}", so errors are spelled out.
function serializeError(err: Error, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = { name: err.name, message: err.message };
  if (err instanceof CatalogError) {
    out.type = err.type;
    out.retryable = err.retryable;
    if (err.alert) out.alert = true;
  }
  const extra = err as Error & { status?: unknown; code?: unknown };
  if (typeof extra.status === 'number') out.status = extra.status;
  if (typeof extra.code === 'string') out.code = extra.code;
  if (err.cause !== undefined) out.cause = redact(err.cause, depth + 1);
  return out;
}

export interface LogFields {
  sourceKey?: string;
  runId?: string;
  page?: number;
  url?: string;
  status?: number;
  durationMs?: number;
  retryAttempt?: number;
  errorType?: string;
  err?: unknown;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(bound: LogFields): Logger;
}

/** Where lines go. Errors go to stderr, everything else to stdout. */
export type LogSink = (level: LogLevel, line: string) => void;

const defaultSink: LogSink = (level, line) => {
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
};

export function createLogger(base: LogFields = {}, sink: LogSink = defaultSink): Logger {
  const emit = (level: LogLevel, message: string, fields?: LogFields) => {
    const line = {
      ts: new Date().toISOString(),
      level,
      message,
      ...(redact({ ...base, ...fields }) as LogFields),
    };
    sink(level, JSON.stringify(line));
  };
  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
    child: (bound) => createLogger({ ...base, ...bound }, sink),
  };
}

export const logger = createLogger();
