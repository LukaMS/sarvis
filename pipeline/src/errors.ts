// Error taxonomy for the pipeline (adapted from legacy providers/errors.ts). Classification goes by
// class, HTTP status and Node error code, never by message text (CATALOG_REVIEW §4).

export type ErrorType =
  | 'configuration_error'
  | 'source_blocked'
  | 'robots_disallowed'
  | 'network_error'
  | 'source_response_error'
  | 'not_found'
  | 'schema_validation_error'
  | 'database_error'
  | 'cancelled'
  | 'unknown';

const TRANSIENT: ReadonlySet<ErrorType> = new Set(['network_error', 'source_response_error']);

export class CatalogError extends Error {
  readonly type: ErrorType;
  readonly retryable: boolean;
  /** True when a person should be told: the run stops and Phase 6 raises an alert. */
  readonly alert: boolean;

  constructor(
    type: ErrorType,
    message: string,
    options?: { retryable?: boolean; alert?: boolean; cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'CatalogError';
    this.type = type;
    this.retryable = options?.retryable ?? TRANSIENT.has(type);
    this.alert = options?.alert ?? false;
  }
}

export class ConfigurationError extends CatalogError {
  constructor(message: string, cause?: unknown) {
    super('configuration_error', message, { retryable: false, cause });
    this.name = 'ConfigurationError';
  }
}

/**
 * A source answered 403 or 429. The source is stopped for this run, never retried around, and
 * flagged for an alert: a block means our access needs a person to look at it.
 */
export class SourceBlockedError extends CatalogError {
  readonly status: number;
  readonly url: string | undefined;
  /** From a 429's Retry-After header, when it had one. */
  readonly retryAfterMs: number | undefined;

  constructor(status: number, url?: string, options?: { retryAfterMs?: number; cause?: unknown }) {
    super('source_blocked', `Source blocked the request (HTTP ${status})${url ? `: ${url}` : ''}`, {
      retryable: false,
      alert: true,
      cause: options?.cause,
    });
    this.name = 'SourceBlockedError';
    this.status = status;
    this.url = url;
    this.retryAfterMs = options?.retryAfterMs;
  }
}

/** robots.txt disallows the path for our User-Agent. Thrown before any request is made. */
export class RobotsDisallowedError extends CatalogError {
  readonly url: string;

  constructor(url: string) {
    super('robots_disallowed', `robots.txt disallows ${url}`, { retryable: false });
    this.name = 'RobotsDisallowedError';
    this.url = url;
  }
}

export class NetworkError extends CatalogError {
  constructor(message: string, cause?: unknown) {
    super('network_error', message, { retryable: true, cause });
    this.name = 'NetworkError';
  }
}

/** Any other non-2xx answer. 408 and 5xx are retryable; the rest of 4xx are not. */
export class SourceResponseError extends CatalogError {
  readonly status: number;

  constructor(status: number, message: string, cause?: unknown) {
    super('source_response_error', message, { retryable: isRetryableStatus(status), cause });
    this.name = 'SourceResponseError';
    this.status = status;
  }
}

export class NotFoundError extends CatalogError {
  readonly status = 404;

  constructor(message: string, cause?: unknown) {
    super('not_found', message, { retryable: false, cause });
    this.name = 'NotFoundError';
  }
}

export class SchemaValidationError extends CatalogError {
  constructor(message: string, cause?: unknown) {
    super('schema_validation_error', message, { retryable: false, cause });
    this.name = 'SchemaValidationError';
  }
}

export class DatabaseError extends CatalogError {
  constructor(message: string, cause?: unknown) {
    super('database_error', message, { retryable: false, cause });
    this.name = 'DatabaseError';
  }
}

export class CancelledError extends CatalogError {
  constructor(message = 'Run cancelled.') {
    super('cancelled', message, { retryable: false });
    this.name = 'CancelledError';
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status >= 500;
}

/** The typed error for a non-2xx HTTP status. */
export function errorFromStatus(
  status: number,
  url?: string,
  options?: { retryAfterMs?: number },
): CatalogError {
  if (status === 403 || status === 429) return new SourceBlockedError(status, url, options);
  const where = url ? `: ${url}` : '';
  if (status === 404) return new NotFoundError(`HTTP 404${where}`);
  return new SourceResponseError(status, `HTTP ${status}${where}`);
}

/** Node and undici error codes for a connection that failed or timed out. */
const NETWORK_CODES: ReadonlySet<string> = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
]);

export interface Classified {
  type: ErrorType;
  retryable: boolean;
  alert: boolean;
  message: string;
}

/** Classifies a thrown value by class, `name`, numeric `status` and `code` (also on its cause). */
export function classifyError(err: unknown): Classified {
  if (err instanceof CatalogError) {
    return { type: err.type, retryable: err.retryable, alert: err.alert, message: err.message };
  }
  const message = err instanceof Error ? err.message : String(err);
  const plain = (type: ErrorType, retryable: boolean): Classified => ({
    type,
    retryable,
    alert: false,
    message,
  });

  if (!isObject(err)) return plain('unknown', false);
  // fetch() rejects with AbortError when its signal aborts and TimeoutError for AbortSignal.timeout().
  if (err.name === 'AbortError') return plain('cancelled', false);
  if (err.name === 'TimeoutError') return plain('network_error', true);

  if (typeof err.status === 'number' && err.status >= 400) {
    const typed = errorFromStatus(err.status);
    return { ...classifyError(typed), message };
  }

  // fetch() wraps socket failures as TypeError('fetch failed') with the code on `cause`.
  for (let e: unknown = err, depth = 0; isObject(e) && depth < 4; e = e.cause, depth++) {
    if (typeof e.code === 'string' && NETWORK_CODES.has(e.code)) {
      return plain('network_error', true);
    }
  }
  return plain('unknown', false);
}

function isObject(v: unknown): v is Record<string, unknown> & { name?: unknown; cause?: unknown } {
  return typeof v === 'object' && v !== null;
}
