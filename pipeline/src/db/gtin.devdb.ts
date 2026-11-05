// Dev-project check that the SQL GTIN helpers are exact twins of packages/core/src/gtin.ts (P4.1).
// Runs the shared vectors through SQL, then compares both sides on generated 8-digit codes and on
// the codes stored in EAN-8 form, which is where UPC-E and EAN-8 meet. Read-only.
//
//   npm run check:gtin --workspace @sarvis/pipeline
import { gtinIsRestricted, gtinIsValid, gtinNormalize, upcEToUpcA } from '@sarvis/core';
import { describe, expect, it } from 'vitest';

import vectors from '../../../packages/core/src/gtin.vectors.json';
import { getServiceClient } from './client.ts';

const enabled = !!process.env.SUPABASE_DEV_SERVICE_ROLE_KEY;
const CONCURRENCY = 8;

type Rpc = 'gtin_is_valid' | 'gtin_upce_to_upca' | 'gtin_normalize' | 'gtin_is_restricted';

/** Calls a helper once per code, a few at a time, and returns the answers in order. */
async function sql(fn: Rpc, codes: string[]): Promise<unknown[]> {
  const db = getServiceClient();
  const out = new Array<unknown>(codes.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (let i = next++; i < codes.length; i = next++) {
      const { data, error } = await db.rpc(fn, { value: codes[i] as string });
      if (error) throw new Error(`${fn}(${codes[i]}): ${error.message}`);
      out[i] = data;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
}

const TWINS: [Rpc, (code: string) => unknown][] = [
  ['gtin_is_valid', gtinIsValid],
  ['gtin_upce_to_upca', upcEToUpcA],
  ['gtin_normalize', gtinNormalize],
  ['gtin_is_restricted', gtinIsRestricted],
];

const VECTORS: [Rpc, { code: string; expected: unknown }[]][] = [
  ['gtin_is_valid', vectors.isValid],
  ['gtin_upce_to_upca', vectors.upce],
  ['gtin_normalize', vectors.normalize],
  ['gtin_is_restricted', vectors.isRestricted],
];

describe.runIf(enabled)('SQL GTIN helpers', () => {
  it.each(VECTORS)('%s passes the shared vectors', async (fn, list) => {
    const got = await sql(
      fn,
      list.map((v) => v.code),
    );
    expect(got).toEqual(list.map((v) => v.expected));
  });

  it('match the TS twins on generated and stored 8-digit codes', async () => {
    const generated = Array.from({ length: 300 }, (_, i) =>
      String((i * 3_333_337 + 11) % 100_000_000).padStart(8, '0'),
    );
    const { data, error } = await getServiceClient()
      .from('products')
      .select('gtin')
      .like('gtin', '000000%')
      .order('gtin')
      .limit(200);
    if (error) throw new Error(error.message);
    const stored = (data ?? []).map((p) => (p.gtin as string).slice(6));
    const codes = [...generated, ...stored];
    for (const [fn, twin] of TWINS) {
      expect(await sql(fn, codes), fn).toEqual(codes.map(twin));
    }
  });
});
