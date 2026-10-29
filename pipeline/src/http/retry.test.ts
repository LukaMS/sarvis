// Legacy util/async.ts had no tests; these cover the behaviour the port keeps.
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CancelledError,
  NetworkError,
  SchemaValidationError,
  SourceBlockedError,
} from '../errors.ts';
import { jitteredDelayMs, sleep, throwIfAborted, withRetry } from './retry.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('sleep', () => {
  it('resolves after the delay', async () => {
    vi.useFakeTimers();
    let done = false;
    const p = sleep(1000).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(done).toBe(true);
  });

  it('rejects with CancelledError when aborted, and when already aborted', async () => {
    const controller = new AbortController();
    const p = sleep(60_000, controller.signal);
    controller.abort();
    await expect(p).rejects.toBeInstanceOf(CancelledError);
    await expect(sleep(1, controller.signal)).rejects.toBeInstanceOf(CancelledError);
  });

  it('removes its abort listener once it resolves', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    await sleep(1, controller.signal);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});

describe('jitteredDelayMs', () => {
  it('stays within [min, max] and returns min when the range is empty', () => {
    for (let i = 0; i < 100; i++) {
      const d = jitteredDelayMs(100, 200);
      expect(d).toBeGreaterThanOrEqual(100);
      expect(d).toBeLessThanOrEqual(200);
    }
    expect(jitteredDelayMs(300, 300)).toBe(300);
    expect(jitteredDelayMs(300, 100)).toBe(300);
  });
});

describe('throwIfAborted', () => {
  it('throws only once the signal is aborted', () => {
    const controller = new AbortController();
    expect(() => throwIfAborted(controller.signal)).not.toThrow();
    controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrow(CancelledError);
  });
});

describe('withRetry', () => {
  const fast = { baseDelayMs: 1, maxDelayMs: 2 };

  it('retries a retryable error and then succeeds', async () => {
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValueOnce(new NetworkError('reset'))
      .mockResolvedValueOnce('ok');
    const onRetry = vi.fn();
    await expect(withRetry(fn, { maxAttempts: 3, onRetry, ...fast })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(2);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(NetworkError), expect.any(Number));
  });

  it('does not retry an error that is not retryable', async () => {
    const fn = vi.fn().mockRejectedValue(new SchemaValidationError('bad'));
    await expect(withRetry(fn, { maxAttempts: 5, ...fast })).rejects.toBeInstanceOf(
      SchemaValidationError,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxAttempts with the last error', async () => {
    const fn = vi.fn().mockRejectedValue(new NetworkError('down'));
    await expect(withRetry(fn, { maxAttempts: 3, ...fast })).rejects.toThrow('down');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('never retries a SourceBlockedError or CancelledError, even if isRetryable says yes', async () => {
    for (const err of [new SourceBlockedError(429), new CancelledError()]) {
      const fn = vi.fn().mockRejectedValue(err);
      await expect(
        withRetry(fn, { maxAttempts: 5, isRetryable: () => true, ...fast }),
      ).rejects.toBe(err);
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  it('backs off exponentially within the jitter band and the cap', async () => {
    const delays: number[] = [];
    const fn = vi.fn().mockRejectedValue(new NetworkError('down'));
    vi.useFakeTimers();
    const p = withRetry(fn, {
      maxAttempts: 5,
      baseDelayMs: 100,
      maxDelayMs: 300,
      onRetry: (_attempt, _err, delay) => delays.push(delay),
    });
    const settled = expect(p).rejects.toThrow('down');
    await vi.runAllTimersAsync();
    await settled;
    // Backoffs 100, 200, 300 (capped), 300; each delay is in [backoff / 2, backoff].
    const bands = [100, 200, 300, 300];
    expect(delays).toHaveLength(4);
    delays.forEach((d, i) => {
      expect(d).toBeGreaterThanOrEqual(bands[i]! / 2);
      expect(d).toBeLessThanOrEqual(bands[i]!);
    });
  });

  it('stops waiting when the signal aborts during a backoff', async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockRejectedValue(new NetworkError('down'));
    const p = withRetry(fn, {
      maxAttempts: 5,
      baseDelayMs: 60_000,
      signal: controller.signal,
      onRetry: () => queueMicrotask(() => controller.abort()),
    });
    await expect(p).rejects.toBeInstanceOf(CancelledError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
