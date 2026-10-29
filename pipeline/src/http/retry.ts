// Sleep, jitter and retry with exponential backoff (ported from legacy util/async.ts).
import { CancelledError, SourceBlockedError, classifyError } from '../errors.ts';

/** Resolves after `ms`, or rejects with CancelledError as soon as `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CancelledError());
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new CancelledError());
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort);
  });
}

/** Random delay in [minMs, maxMs], so requests are not perfectly timed. */
export function jitteredDelayMs(minMs: number, maxMs: number): number {
  if (maxMs <= minMs) return minMs;
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new CancelledError();
}

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  /** Return true if the error should be retried. Defaults to the error's `retryable` flag. */
  isRetryable?: (err: unknown) => boolean;
  onRetry?: (attempt: number, err: unknown, delayMs: number) => void;
}

/**
 * Retry with exponential backoff + jitter. A CancelledError or SourceBlockedError is never
 * retried, whatever `isRetryable` says: a cancel must stop at once, and a block must stop the source.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const base = options.baseDelayMs ?? 500;
  const max = options.maxDelayMs ?? 15000;
  const isRetryable = options.isRetryable ?? ((err: unknown) => classifyError(err).retryable);
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    throwIfAborted(options.signal);
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (err instanceof CancelledError || err instanceof SourceBlockedError) throw err;
      const isLast = attempt >= options.maxAttempts;
      if (isLast || !isRetryable(err)) throw err;
      const backoff = Math.min(max, base * 2 ** (attempt - 1));
      const delay = jitteredDelayMs(backoff / 2, backoff);
      options.onRetry?.(attempt, err, delay);
      await sleep(delay, options.signal);
    }
  }
  throw lastError;
}
