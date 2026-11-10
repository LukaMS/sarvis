// Service-role Supabase client for the pipeline (ported from legacy supabase.ts). The key bypasses
// RLS, so it lives only in this Node process: never in the app bundle, never in a log line.
import type { Database } from '@sarvis/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { loadEnv, type PipelineEnv } from '../env.ts';
import { SourceResponseError, classifyError } from '../errors.ts';
import { withRetry } from '../http/retry.ts';
import { type Logger, logger as rootLogger } from '../log.ts';

export type ServiceClient = SupabaseClient<Database>;

export interface DbRetryOptions {
  /** Attempts per PostgREST request, the first included. Defaults to 4. */
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  log?: Logger;
}

/**
 * A fetch that retries PostgREST requests (`/rest/v1/`), reads and writes alike, on a network
 * error or a 5xx answer, with exponential backoff and jitter (P2.24, review M-7). The last
 * attempt's answer or error is passed through unchanged, so supabase-js reports it as usual.
 * Storage and auth requests go straight through. postgrest-js's own retry (GET only, 503 and 520
 * only) is turned off in createServiceClient so the two don't multiply.
 *
 * A retried write may have landed the first time. The writers upsert on stable keys, so a repeat
 * is a no-op or a unique violation that comes back as a row error; createRun picks its own id to
 * tell its own row from a lock (D-083).
 */
export function retryingFetch(
  inner: typeof fetch = fetch,
  options: DbRetryOptions = {},
): typeof fetch {
  const maxAttempts = options.maxAttempts ?? 4;
  const log = options.log ?? rootLogger;
  return (input, init) => {
    const href = input instanceof Request ? input.url : String(input);
    const path = new URL(href).pathname;
    if (!path.includes('/rest/v1/')) return inner(input, init);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const signal = init?.signal ?? undefined;

    return withRetry(
      async (attempt) => {
        const res = await inner(input, init);
        if (res.status >= 500 && attempt < maxAttempts) {
          await res.body?.cancel();
          throw new SourceResponseError(res.status, `HTTP ${res.status} from the database`);
        }
        return res;
      },
      {
        maxAttempts,
        baseDelayMs: options.baseDelayMs ?? 1000,
        maxDelayMs: options.maxDelayMs ?? 15_000,
        signal,
        isRetryable: (err) => !signal?.aborted && classifyError(err).retryable,
        // The path names the table; the query string can hold row values, so it isn't logged.
        onRetry: (retryAttempt, err, delayMs) =>
          log.warn('db retry', {
            method,
            path,
            retryAttempt,
            delayMs,
            errorType: classifyError(err).type,
            status: err instanceof SourceResponseError ? err.status : undefined,
          }),
      },
    );
  };
}

export function createServiceClient(
  env: PipelineEnv = loadEnv(),
  options: { fetch?: typeof fetch; retry?: DbRetryOptions } = {},
): ServiceClient {
  return createClient<Database>(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { retry: false },
    global: { fetch: retryingFetch(options.fetch ?? fetch, options.retry) },
  });
}

let cached: ServiceClient | undefined;

/** One shared client per process. */
export function getServiceClient(): ServiceClient {
  cached ??= createServiceClient();
  return cached;
}
