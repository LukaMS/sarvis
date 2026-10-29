// The pure half of the raw store: envelope, gzip and hashing. Upload and download are checked
// against the dev project by raw/check.ts.
import { gunzipSync, gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { SchemaValidationError } from '../errors.ts';
import { REDACTED } from '../log.ts';
import { RAW_FORMAT, decodeRaw, encodeRaw, rawObjectKey, sha256Hex } from './store.ts';

const body = JSON.stringify({ products: [{ code: '1' }, { code: '2' }, { code: '3' }] });

describe('encodeRaw / decodeRaw', () => {
  it('round-trips the body exactly', async () => {
    const encoded = await encodeRaw({
      body,
      url: 'https://example.com/p?page=1',
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'sid=1' },
      fetchedAt: '2026-10-29T12:00:00.000Z',
    });
    const decoded = await decodeRaw(encoded.gz);
    expect(decoded.body).toBe(body);
    expect(decoded).toEqual(encoded.envelope);
    expect(decoded).toMatchObject({
      format: RAW_FORMAT,
      request_url: 'https://example.com/p?page=1',
      http_status: 200,
      content_type: 'application/json',
      headers: { 'content-type': 'application/json' },
    });
  });

  it('hashes the redacted body, so the same response always hashes the same', async () => {
    const a = await encodeRaw({ body, fetchedAt: '2026-10-29T12:00:00.000Z' });
    const b = await encodeRaw({ body, fetchedAt: new Date('2026-10-30T00:00:00.000Z') });
    expect(a.sha256).toBe(sha256Hex(body));
    expect(b.sha256).toBe(a.sha256);
    expect(b.envelope.fetched_at).toBe('2026-10-30T00:00:00.000Z');
  });

  it('redacts the body and the URL before anything is gzipped', async () => {
    const encoded = await encodeRaw({
      body: '{"code":"1","sessionId":"s-123"}',
      url: 'https://example.com/p?apikey=SECRET',
      fetchedAt: '2026-10-29T12:00:00.000Z',
    });
    const text = gunzipSync(encoded.gz).toString('utf8');
    expect(text).not.toContain('s-123');
    expect(text).not.toContain('SECRET');
    expect(JSON.parse(encoded.envelope.body)).toEqual({ code: '1', sessionId: REDACTED });
  });

  it('defaults the content type to the header, then application/json', async () => {
    const fromHeader = await encodeRaw({
      body: '<rss/>',
      headers: { 'content-type': 'application/rss+xml' },
      fetchedAt: '2026-10-29T12:00:00.000Z',
    });
    expect(fromHeader.envelope.content_type).toBe('application/rss+xml');
    const fallback = await encodeRaw({ body, fetchedAt: '2026-10-29T12:00:00.000Z' });
    expect(fallback.envelope).toMatchObject({
      content_type: 'application/json',
      request_url: null,
      http_status: null,
    });
  });

  it('compresses a repetitive body', async () => {
    const big = JSON.stringify(
      Array.from({ length: 500 }, (_, i) => ({ code: String(i), x: 'y' })),
    );
    const encoded = await encodeRaw({ body: big, fetchedAt: '2026-10-29T12:00:00.000Z' });
    expect(encoded.gz.byteLength).toBeLessThan(big.length / 4);
  });

  it('rejects a file that is not gzip, or not an envelope', async () => {
    await expect(decodeRaw(Buffer.from('plain'))).rejects.toBeInstanceOf(SchemaValidationError);
    await expect(decodeRaw(gzipSync('{"body":"x"}'))).rejects.toBeInstanceOf(SchemaValidationError);
  });
});

describe('rawObjectKey', () => {
  it('builds {source}/{run}/{seq}.json.gz with a zero-padded seq', () => {
    expect(rawObjectKey('off-api', 'run-1', 7)).toBe('off-api/run-1/000007.json.gz');
  });

  it('puts files outside a run under adhoc/', () => {
    expect(rawObjectKey('openrouter', null, 'abc')).toBe('openrouter/adhoc/abc.json.gz');
  });
});
