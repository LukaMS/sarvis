import { describe, expect, it } from 'vitest';

import { REDACTED } from '../log.ts';
import { redactBody, redactHeaders, redactJsonValue, redactUrl } from './redact.ts';

describe('redactHeaders', () => {
  it('keeps allow-listed headers, lower-cased, and drops the rest', () => {
    const out = redactHeaders({
      'Content-Type': 'application/json',
      ETag: '"abc"',
      'Set-Cookie': 'sid=1',
      Authorization: 'Bearer x',
      'X-Request-Id': 'trace-1',
      'X-Some-New-Header': 'unknown',
    });
    expect(out).toEqual({ 'content-type': 'application/json', etag: '"abc"' });
  });
});

describe('redactJsonValue', () => {
  it('blanks session and identity keys at any depth, including inside arrays', () => {
    const { value, changed } = redactJsonValue({
      products: [{ code: '0068100084245', name: 'Cheerios', sessionId: 's-1' }],
      meta: { cart_id: 'c-1', user: { email: 'a@b.c', accessToken: 't' } },
      'x-api-key': 'k',
    });
    expect(changed).toBe(true);
    expect(value).toEqual({
      products: [{ code: '0068100084245', name: 'Cheerios', sessionId: REDACTED }],
      meta: { cart_id: REDACTED, user: { email: REDACTED, accessToken: REDACTED } },
      'x-api-key': REDACTED,
    });
  });

  it('leaves catalog fields alone, and reports no change when there is nothing to redact', () => {
    const input = {
      brand: 'General Mills',
      keywords: ['cereal'],
      key: 'en:cereals',
      user_count: 3,
    };
    const { value, changed } = redactJsonValue(input);
    expect(changed).toBe(false);
    expect(value).toEqual(input);
  });

  it('does not mark empty or null secret fields as redacted', () => {
    expect(redactJsonValue({ token: '', email: null }).changed).toBe(false);
  });
});

describe('redactBody', () => {
  it('returns a JSON body byte-for-byte when nothing needs redacting', () => {
    const body = '{ "products" : [ {"code":"1"} ] }\n';
    expect(redactBody(body, 'application/json; charset=utf-8')).toBe(body);
  });

  it('re-serialises a JSON body that had a secret', () => {
    const out = redactBody('{"code":"1","token":"abc"}', 'application/json');
    expect(JSON.parse(out)).toEqual({ code: '1', token: REDACTED });
    expect(out).not.toContain('abc');
  });

  it('handles +json types and NDJSON line by line', () => {
    expect(redactBody('{"email":"a@b.c"}', 'application/ld+json')).not.toContain('a@b.c');
    const ndjson = '{"code":"1"}\n{"code":"2","session_id":"zzz"}\n';
    const out = redactBody(ndjson, 'application/x-ndjson');
    const lines = out.split('\n');
    expect(lines[0]).toBe('{"code":"1"}');
    expect(JSON.parse(lines[1]!)).toEqual({ code: '2', session_id: REDACTED });
    expect(lines[2]).toBe('');
  });

  it('stores invalid JSON and non-JSON types as they are', () => {
    expect(redactBody('{not json', 'application/json')).toBe('{not json');
    const html = '<html><body>token: abc</body></html>';
    expect(redactBody(html, 'text/html')).toBe(html);
  });
});

describe('redactUrl', () => {
  it('redacts credential query parameters and user info', () => {
    const out = redactUrl('https://user:pw@api.example.com/v1/items?q=milk&api_key=SECRET&page=2');
    expect(out).not.toContain('SECRET');
    expect(out).not.toContain('pw@');
    const url = new URL(out);
    expect(url.searchParams.get('api_key')).toBe(REDACTED);
    expect(url.searchParams.get('q')).toBe('milk');
    expect(url.searchParams.get('page')).toBe('2');
  });

  it('returns a URL with nothing to redact unchanged', () => {
    const url =
      'https://world.openfoodfacts.org/api/v2/product/0068100084245.json?fields=code,brands';
    expect(redactUrl(url)).toBe(url);
  });

  it('returns something that is not a URL unchanged', () => {
    expect(redactUrl('not a url')).toBe('not a url');
  });
});
