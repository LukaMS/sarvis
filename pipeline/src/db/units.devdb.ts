// Dev-project check of the size parser (P4.5) on every distinct `products.quantity_text`. Read-only.
// Prints the share parsed (distinct strings and rows), the reasons for the rest, how the
// readings compare with the stored D-057 status, and examples of what's left. Fails if any
// result breaks the product schema.
//
//   npm run check:units --workspace @sarvis/pipeline
import { parseSize, ProductRecordSchema, type SizeParse } from '@sarvis/core';
import { describe, expect, it } from 'vitest';

import { getServiceClient } from './client.ts';

const enabled = !!process.env.SUPABASE_DEV_SERVICE_ROLE_KEY;
const PAGE = 1000;
const LOST_SHOWN = Number(process.env.CHECK_UNITS_SHOW ?? 20);

interface Seen {
  rows: number;
  stored: Set<string>;
}

async function readQuantityTexts(): Promise<Map<string, Seen>> {
  const db = getServiceClient();
  const out = new Map<string, Seen>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('products')
      .select('id, quantity_text, unit_parse_status')
      .not('quantity_text', 'is', null)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const text = row.quantity_text as string;
      const seen = out.get(text) ?? { rows: 0, stored: new Set<string>() };
      seen.rows++;
      seen.stored.add(row.unit_parse_status as string);
      out.set(text, seen);
    }
    if ((data ?? []).length < PAGE) return out;
  }
}

const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(1)}%`;

describe.runIf(enabled)('size parser on dev quantity_text', () => {
  it('reads every distinct string into a valid product size', { timeout: 120_000 }, async () => {
    const texts = await readQuantityTexts();
    const results = new Map<string, SizeParse>();
    for (const text of texts.keys()) results.set(text, parseSize(text));

    const tally = { ok: [0, 0], ambiguous: [0, 0], unparsed: [0, 0] } as Record<
      SizeParse['unit_parse_status'],
      [number, number]
    >;
    const reasons = new Map<string, number>();
    const versusStored = new Map<string, number>();
    const invalid: string[] = [];
    let totalRows = 0;

    for (const [text, r] of results) {
      const seen = texts.get(text) as Seen;
      totalRows += seen.rows;
      tally[r.unit_parse_status][0]++;
      tally[r.unit_parse_status][1] += seen.rows;
      if (r.reason) reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
      const storedOk = seen.stored.has('ok') ? 'D-057 ok' : 'D-057 not ok';
      const key = `${storedOk} → ${r.unit_parse_status}`;
      versusStored.set(key, (versusStored.get(key) ?? 0) + 1);

      const { reason: _reason, ...fields } = r;
      const parsed = ProductRecordSchema.safeParse({
        external_id: 'check',
        name: 'check',
        quantity_text: text,
        ...fields,
        source_key: 'fixture',
        fetched_at: '2026-11-10T00:00:00.000Z',
        method: 'import',
        method_version: 'check@1.0.0',
      });
      if (!parsed.success) invalid.push(`${text}: ${parsed.error.message}`);
    }

    const distinct = results.size;
    const lines = [
      `distinct strings: ${distinct}, rows: ${totalRows}`,
      ...(['ok', 'ambiguous', 'unparsed'] as const).map(
        (s) =>
          `  ${s.padEnd(9)} ${String(tally[s][0]).padStart(5)} distinct (${pct(tally[s][0], distinct)}), ` +
          `${String(tally[s][1]).padStart(6)} rows (${pct(tally[s][1], totalRows)})`,
      ),
      'reasons (distinct):',
      ...[...reasons].sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`),
      'versus the stored D-057 status (distinct):',
      ...[...versusStored].sort().map(([k, v]) => `  ${k}: ${v}`),
    ];

    // What's left, most frequent first, then a spread of one-off strings.
    const left = [...results]
      .filter(([, r]) => r.unit_parse_status !== 'ok')
      .map(([text, r]) => ({ text, r, rows: (texts.get(text) as Seen).rows }))
      .sort((a, b) => b.rows - a.rows || a.text.localeCompare(b.text));
    const examples = [
      ...left.slice(0, 5),
      ...left.filter((_, i) => i >= 5 && i % 47 === 0).slice(0, 5),
    ];
    lines.push(
      'examples of what is left:',
      ...examples.map(
        (e) =>
          `  ${JSON.stringify(e.text)} (${e.rows} rows): ${e.r.unit_parse_status}, ${e.r.reason}`,
      ),
    );
    // Strings D-057 called ok that this parser doesn't: each should be a real ambiguity.
    const lost = left.filter((e) => (texts.get(e.text) as Seen).stored.has('ok'));
    lines.push(
      `D-057 ok, now not ok (${lost.length}${lost.length > LOST_SHOWN ? `, first ${LOST_SHOWN}` : ''}):`,
      ...lost
        .slice(0, LOST_SHOWN)
        .map((e) => `  ${JSON.stringify(e.text)}: ${e.r.unit_parse_status}, ${e.r.reason}`),
    );
    // Strings D-057 couldn't read that this parser does: where a wrong reading would hide.
    const gained = [...results]
      .filter(
        ([text, r]) => r.unit_parse_status === 'ok' && !(texts.get(text) as Seen).stored.has('ok'),
      )
      .sort(([a], [b]) => a.localeCompare(b));
    const step = Math.max(1, Math.floor(gained.length / LOST_SHOWN));
    lines.push(
      `D-057 not ok, now ok (${gained.length}, every ${step}th):`,
      ...gained
        .filter((_, i) => i % step === 0)
        .slice(0, LOST_SHOWN)
        .map(
          ([text, r]) =>
            `  ${JSON.stringify(text)}: ${r.net_quantity} ${r.net_unit}${r.pack_count ? ` × pack ${r.pack_count}` : ''}`,
        ),
    );
    console.log(lines.join('\n'));

    expect(invalid).toEqual([]);
    expect(distinct).toBeGreaterThan(0);
  });
});
