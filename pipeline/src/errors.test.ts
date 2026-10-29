// Ported from legacy providers/errors.test.ts. The message-sniffing cases now go by status and code.
import { describe, expect, it } from 'vitest';

import {
  CatalogError,
  NetworkError,
  NotFoundError,
  SchemaValidationError,
  SourceBlockedError,
  SourceResponseError,
  classifyError,
  errorFromStatus,
} from './errors.ts';

const withCode = (message: string, code: string) => Object.assign(new Error(message), { code });

describe('classifyError', () => {
  it('passes through CatalogError type + retryable', () => {
    expect(classifyError(new NetworkError('reset'))).toMatchObject({
      type: 'network_error',
      retryable: true,
    });
    expect(classifyError(new SchemaValidationError('bad shape'))).toMatchObject({
      type: 'schema_validation_error',
      retryable: false,
    });
  });

  it('detects network errors from Node error codes', () => {
    expect(classifyError(withCode('read ECONNRESET', 'ECONNRESET')).retryable).toBe(true);
    // fetch() puts the socket error on `cause`.
    const fetchFailed = new TypeError('fetch failed', {
      cause: withCode('connect', 'UND_ERR_CONNECT_TIMEOUT'),
    });
    expect(classifyError(fetchFailed)).toMatchObject({ type: 'network_error', retryable: true });
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });
    expect(classifyError(timeout).type).toBe('network_error');
  });

  it('treats a 429 as a block: not retried, alerted', () => {
    expect(classifyError({ status: 429 })).toMatchObject({
      type: 'source_blocked',
      retryable: false,
      alert: true,
    });
  });

  it('treats a 403 as a block: not retried, alerted', () => {
    expect(classifyError({ status: 403, message: 'Forbidden' })).toMatchObject({
      type: 'source_blocked',
      retryable: false,
      alert: true,
    });
  });

  it('classifies an AbortError as cancelled', () => {
    const abort = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    expect(classifyError(abort)).toMatchObject({ type: 'cancelled', retryable: false });
  });

  it('never classifies by message text', () => {
    for (const message of [
      'HTTP 429 Too Many Requests',
      '403 Forbidden',
      'network down',
      'cancel',
    ]) {
      expect(classifyError(new Error(message))).toMatchObject({
        type: 'unknown',
        retryable: false,
      });
    }
  });

  it('falls back to unknown', () => {
    expect(classifyError('weird')).toMatchObject({ type: 'unknown', retryable: false });
  });
});

describe('errorFromStatus', () => {
  it('maps 403 and 429 to SourceBlockedError with the Retry-After delay', () => {
    const blocked = errorFromStatus(429, 'https://example.org/p', { retryAfterMs: 2000 });
    expect(blocked).toBeInstanceOf(SourceBlockedError);
    expect(blocked).toMatchObject({ status: 429, retryAfterMs: 2000, alert: true });
    expect(errorFromStatus(403)).toBeInstanceOf(SourceBlockedError);
  });

  it('retries 408 and 5xx only', () => {
    expect(errorFromStatus(503)).toMatchObject({ retryable: true, status: 503 });
    expect(errorFromStatus(408).retryable).toBe(true);
    expect(errorFromStatus(400)).toBeInstanceOf(SourceResponseError);
    expect(errorFromStatus(400).retryable).toBe(false);
    expect(errorFromStatus(404)).toBeInstanceOf(NotFoundError);
    expect(errorFromStatus(404).retryable).toBe(false);
  });
});

describe('CatalogError', () => {
  it('marks transient types retryable by default', () => {
    expect(new CatalogError('network_error', 'x').retryable).toBe(true);
    expect(new CatalogError('configuration_error', 'x').retryable).toBe(false);
  });

  it('keeps the cause', () => {
    const cause = new Error('root');
    expect(new NetworkError('x', cause).cause).toBe(cause);
  });
});
