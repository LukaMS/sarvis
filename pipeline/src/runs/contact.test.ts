// The contact email (D-015) through the run driver: a source with `contact: 'email'` is refused
// without one, sends it in the User-Agent with one, and the value never reaches the logs, the run
// store or a raw envelope. Uses a local node:http server and the driver's own polite client.
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createLogger } from '../log.ts';
import { type RawInput, envelopeOf } from '../raw/store.ts';
import type { Source, SourceCapabilities, SourceRow } from '../sources/source.ts';
import { type RecordWriter, type RunOptions, SourceRefusedError, runSource } from './driver.ts';
import { createMemoryRunStore } from './store.ts';

const EMAIL = 'owner.contact@example.com';

const SOURCE_ROW: SourceRow = {
  id: 'src-1',
  key: 'fixture',
  verdict: 'use',
  enabled: true,
  rate_limit_per_sec: 1,
};

let server: Server;
let base: string;
let seen: IncomingMessage['headers'][] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.writeHead(404).end();
      return;
    }
    seen.push(req.headers);
    // A careless server that echoes the request's User-Agent back in a response header.
    res
      .writeHead(200, {
        'content-type': 'application/json',
        'x-echo-user-agent': req.headers['user-agent'] ?? '',
      })
      .end(JSON.stringify({ items: [] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  seen = [];
});

/** One POST step (POST, so the client's disk cache never answers it). */
function source(contact?: SourceCapabilities['contact']): Source<'product', number> {
  return {
    key: 'fixture',
    job: 'fixture-import',
    version: '0.0.1',
    recordKind: 'product',
    capabilities: {
      supportsDelta: false,
      supportsDeactivation: false,
      storeSpecificPricing: false,
      contact,
    },
    plan: () => [0],
    async fetch(_step, ctx) {
      const res = await ctx.http.request({ url: `${base}/items`, method: 'POST', body: '{}' });
      const response: RawInput = {
        url: res.url,
        status: res.status,
        headers: res.headers,
        body: res.body,
        fetchedAt: res.fetchedAt,
      };
      return { response };
    },
    parse: (raw) => ({ records: (JSON.parse(raw.body) as { items: unknown[] }).items }),
  };
}

function setup() {
  const store = createMemoryRunStore({ sources: [SOURCE_ROW] });
  const lines: string[] = [];
  const raws: RawInput[] = [];
  const writer: RecordWriter<'product'> = {
    async upsert() {
      return { inserted: 0, updated: 0, unchanged: 0, skipped_locked: 0 };
    },
  };
  const deps = {
    store,
    raw: () => ({
      async store(seq: number, input: RawInput) {
        raws.push(input);
        return { id: `raw-${seq}` };
      },
    }),
    writer,
    log: createLogger({}, (_level, line) => lines.push(line)),
  };
  return { store, deps, lines, raws };
}

const sample: RunOptions = { mode: 'sample', sampleSize: 10, trigger: 'cli', politenessDelayMs: 0 };

describe('contact email (D-015)', () => {
  it('refuses an email source without one, before a run row exists, naming the variable', async () => {
    for (const contactEmail of [undefined, null, '']) {
      const { store, deps } = setup();
      const run = runSource(source('email'), sample, { ...deps, contactEmail });
      await expect(run).rejects.toThrow(SourceRefusedError);
      await expect(run).rejects.toThrow(/PIPELINE_CONTACT_EMAIL/);
      expect(store.runs).toHaveLength(0);
    }
    expect(seen).toHaveLength(0);
  });

  it('sends the email in the User-Agent and keeps it out of logs, run rows and raw files', async () => {
    const { store, deps, lines, raws } = setup();
    const result = await runSource(source('email'), sample, { ...deps, contactEmail: EMAIL });
    expect(result.status).toBe('completed');

    expect(seen).toHaveLength(1);
    expect(seen[0]!['user-agent']).toBe(
      `Sarvis/0.0.0 (+https://github.com/LukaMS/sarvis; ${EMAIL})`,
    );

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).not.toContain(EMAIL);
    expect(
      JSON.stringify({ runs: store.runs, events: store.events, failures: store.failures }),
    ).not.toContain(EMAIL);

    // The response echoed the UA back, but the envelope keeps only allow-listed headers.
    expect(raws).toHaveLength(1);
    expect(raws[0]!.headers?.['x-echo-user-agent']).toContain(EMAIL);
    expect(JSON.stringify(envelopeOf(raws[0]!))).not.toContain(EMAIL);
  });

  it('never sends the email for a source that does not ask for one', async () => {
    const { deps } = setup();
    await runSource(source(), sample, { ...deps, contactEmail: EMAIL });
    expect(seen).toHaveLength(1);
    expect(seen[0]!['user-agent']).toBe('Sarvis/0.0.0 (+https://github.com/LukaMS/sarvis)');
  });
});
