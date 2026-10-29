import { describe, expect, it } from 'vitest';

import { jsonbBytes, jsonbText, PAYLOAD_MAX_BYTES, trimPayload } from './payload';

describe('trimPayload', () => {
  it('keeps a small payload as is', () => {
    const small = { name: 'Milk', price: 4.99 };
    expect(trimPayload(small)).toBe(small);
  });

  it('measures the way Postgres prints jsonb', () => {
    expect(jsonbText({ a: 1, b: [1, 2] })).toBe('{"a": 1, "b": [1, 2]}');
    expect(jsonbBytes({ é: 'é' })).toBe('{"é": "é"}'.length + 2);
  });

  it('trims a large payload to ≤ 1 KB and marks it', () => {
    const big = {
      name: 'x'.repeat(5000),
      tags: Array.from({ length: 500 }, (_, i) => `tag-${i}`),
      nested: { deep: { deeper: { deepest: 'y'.repeat(2000) } } },
    };
    const trimmed = trimPayload(big) as Record<string, unknown>;
    expect(jsonbBytes(trimmed)).toBeLessThanOrEqual(PAYLOAD_MAX_BYTES);
    expect(trimmed._truncated).toBe(true);
    expect(String(trimmed.name).startsWith('xxx')).toBe(true);
  });

  it('fits multi-byte text and many small keys', () => {
    const wide = Object.fromEntries(
      Array.from({ length: 400 }, (_, i) => [`k${i}`, '🍫'.repeat(3)]),
    );
    expect(jsonbBytes(trimPayload(wide))).toBeLessThanOrEqual(PAYLOAD_MAX_BYTES);
    expect(jsonbBytes(trimPayload('é'.repeat(3000)))).toBeLessThanOrEqual(PAYLOAD_MAX_BYTES);
  });
});
