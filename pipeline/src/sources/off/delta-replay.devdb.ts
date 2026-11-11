// Dev-project check for the delta bad-code duplicate rule (P4.30, D-086). Read-only: it writes no
// catalog rows, runs or raw files, and sends nothing to OFF.
//
//   npm run check:off-delta --workspace @sarvis/pipeline
//
// It replays the stored extracts of the completed OFF delta runs (one copy per delta file) through
// the OFF source's delta path, served from a local HTTP server, with the real catalog lookup. The
// extracts hold what each file kept before this rule, so the replay shows what the rule drops now:
//   - every no-GTIN OFF row a full run discontinued is dropped as a duplicate,
//   - and no no-GTIN row the catalog holds as active is dropped.
// Run it after a full run, so the catalog's active set is the full run's kept set.
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getServiceClient } from '../../db/client.ts';
import { createHttpClient } from '../../http/client.ts';
import { createLogger } from '../../log.ts';
import { readRaw } from '../../raw/store.ts';
import type { SourceEvent, SourceRow, SourceRunContext } from '../source.ts';
import { type OffRow, parseExtract } from './csv.ts';
import { type OffStep, OFF_JOB, OFF_KEY, createOffSource } from './index.ts';
import { hasBadCheckDigit } from './map.ts';

const enabled = !!process.env.SUPABASE_DEV_SERVICE_ROLE_KEY;
const silent = createLogger({}, () => {});
const PAGE = 1000;

const tags = (s: string) => (s === '' ? [] : s.split(','));
/** An extract row as the delta product it came from (the fields deltaRow reads, images aside). */
const asDeltaLine = (r: OffRow) =>
  JSON.stringify({
    code: r.code,
    product_name: r.product_name,
    brands: r.brands,
    categories_tags: tags(r.categories_tags),
    labels_tags: tags(r.labels_tags),
    countries_tags: tags(r.countries_tags),
    quantity: r.quantity,
    product_quantity: r.product_quantity,
    last_modified_t: r.last_modified_t,
  });

describe.skipIf(!enabled)('OFF delta replay (P4.30)', () => {
  const db = getServiceClient();
  let server: Server;
  let base = '';
  let source: SourceRow;
  const files = new Map<string, Buffer>();
  /** Bad-code codes in the stored extracts, in file order. */
  const replayedBad: string[] = [];
  const kept: OffRow[] = [];
  const events: SourceEvent[] = [];

  beforeAll(async () => {
    const s = await db
      .from('sources')
      .select('id, key, verdict, enabled, rate_limit_per_sec')
      .eq('key', OFF_KEY)
      .single();
    if (s.error) throw s.error;
    source = { ...s.data, verdict: s.data.verdict as SourceRow['verdict'] };

    const raws = await db
      .from('raw_objects')
      .select('id, request_url, storage_path, run_id, ingestion_runs!inner(job, mode, status)')
      .eq('source_id', source.id)
      .eq('ingestion_runs.job', OFF_JOB)
      .eq('ingestion_runs.mode', 'delta')
      .eq('ingestion_runs.status', 'completed')
      .is('deleted_at', null)
      .order('storage_path');
    if (raws.error) throw raws.error;
    // One run's copy of each file (a file is stored once per completed delta run that read it).
    const byUrl = new Map<string, { run: string; ids: string[] }>();
    for (const r of raws.data) {
      if (!r.request_url || !r.run_id) continue;
      const entry = byUrl.get(r.request_url) ?? { run: r.run_id, ids: [] };
      if (entry.run !== r.run_id) continue;
      entry.ids.push(r.id);
      byUrl.set(r.request_url, entry);
    }
    for (const [url, { ids }] of byUrl) {
      const lines: string[] = [];
      for (const id of ids) {
        for (const row of parseExtract((await readRaw(db, id)).body)) {
          if (hasBadCheckDigit(row.code.trim())) replayedBad.push(row.code.trim());
          lines.push(asDeltaLine(row));
        }
      }
      files.set(new URL(url).pathname.split('/').pop()!, gzipSync(lines.join('\n')));
    }

    server = createServer((req, res) => {
      const name = (req.url ?? '/').split('/').pop() ?? '';
      if (req.url === '/robots.txt') return res.writeHead(200).end('User-agent: *\n');
      if (name === 'index.txt') return res.writeHead(200).end([...files.keys()].join('\n'));
      const file = files.get(name);
      if (file) return res.writeHead(200).end(file);
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/data/delta/`;

    const off = createOffSource({ deltaBase: base });
    const ctx: SourceRunContext = {
      runId: 'replay',
      source,
      mode: 'delta',
      sampleSize: null,
      http: createHttpClient({ cache: null, log: silent }),
      signal: new AbortController().signal,
      log: silent,
      storedRequestUrls: async () => new Set(),
    };
    const queue: OffStep[] = await off.plan(ctx);
    while (queue.length > 0) {
      const result = await off.fetch(queue.shift()!, ctx);
      kept.push(...parseExtract(result.response.body));
      events.push(...(result.events ?? []));
      queue.push(...(result.next ?? []));
    }
    await off.dispose?.();
  }, 600_000);

  afterAll(async () => {
    await new Promise((resolve) => server?.close(resolve));
  });

  /** The status of each no-GTIN OFF product among `codes`. */
  async function statusOf(codes: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (let i = 0; i < codes.length; i += 200) {
      for (let page = 0; ; page++) {
        const { data, error } = await db
          .from('products')
          .select('external_id, status')
          .eq('source_id', source.id)
          .is('gtin', null)
          .in('external_id', codes.slice(i, i + 200))
          .range(page * PAGE, (page + 1) * PAGE - 1);
        if (error) throw error;
        for (const p of data) out.set(p.external_id, p.status);
        if (data.length < PAGE) break;
      }
    }
    return out;
  }

  it('drops every discontinued bad-code row and no active one', async () => {
    const keptCodes = new Set(kept.map((r) => r.code.trim()));
    const dropped = replayedBad.filter((c) => !keptCodes.has(c));
    const status = await statusOf([...new Set(replayedBad)]);
    const discontinued = [...status].filter(([, s]) => s === 'discontinued').map(([c]) => c);
    const droppedActive = dropped.filter((c) => status.get(c) === 'active');
    const keptDiscontinued = discontinued.filter((c) => keptCodes.has(c));

    const perFile = events
      .filter((e) => e.eventType === 'off_delta_file')
      .map((e) => ({
        file: e.details?.file,
        kept: e.details?.kept,
        dropped: (e.details?.dropped as { bad_code_duplicate: number }).bad_code_duplicate,
        ofStored: e.details?.bad_code_duplicate_of_stored,
      }));
    console.log(
      JSON.stringify(
        {
          files: files.size,
          replayedRows: kept.length + dropped.length,
          badCodeRows: replayedBad.length,
          dropped: dropped.length,
          discontinued: discontinued.length,
          droppedActive,
          keptDiscontinued,
          droppedByStatus: Object.fromEntries(
            [...new Set(dropped.map((c) => status.get(c) ?? 'not stored'))].map((st) => [
              st,
              dropped.filter((c) => (status.get(c) ?? 'not stored') === st).length,
            ]),
          ),
          droppedNotStored: dropped.filter((c) => !status.has(c)),
          keptNotStored: [...new Set(replayedBad)].filter(
            (c) => keptCodes.has(c) && !status.has(c),
          ),
          perFile,
        },
        null,
        2,
      ),
    );
    expect(files.size).toBeGreaterThan(0);
    expect(discontinued.length).toBeGreaterThan(0);
    expect(keptDiscontinued).toEqual([]);
    expect(droppedActive).toEqual([]);
  });
});
