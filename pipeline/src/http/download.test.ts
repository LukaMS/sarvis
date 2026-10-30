// download() against a local node:http server serving a gzipped dump, with the real limiter, so
// each test takes about a second (robots.txt, then the file).
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { RobotsDisallowedError } from '../errors.ts';
import { createLogger } from '../log.ts';
import { createHttpClient } from './client.ts';
import { dumpKey } from './download.ts';
import { openLines } from './lines.ts';

type Handler = (req: IncomingMessage, res: ServerResponse, count: number) => void;

const quiet = createLogger({}, () => {});
const DUMP = gzipSync(
  Array.from({ length: 5000 }, (_, i) => `code\t${i}\tProduct ${i}\tcanada`).join('\n') + '\n',
);
const DUMP_SHA = createHash('sha256').update(DUMP).digest('hex');
const ETAG = `"${DUMP_SHA.slice(0, 16)}"`;

let server: Server;
let port: number;
let hits: { path: string; status: number; headers: IncomingMessage['headers'] }[] = [];
const routes = new Map<string, Handler>();
let dumpDir: string;

const url = (path: string) => `http://127.0.0.1:${port}${path}`;
const hitsTo = (path: string) => hits.filter((h) => h.path === path);
const client = () =>
  createHttpClient({ cache: null, log: quiet, baseDelayMs: 10, maxDelayMs: 20, dumpDir });

const serveDump: Handler = (req, res) => {
  if (req.headers['if-none-match'] === ETAG) {
    res.writeHead(304, { etag: ETAG }).end();
    return;
  }
  res
    .writeHead(200, {
      'content-type': 'application/gzip',
      'content-length': DUMP.length,
      etag: ETAG,
      'last-modified': 'Thu, 29 Oct 2026 02:00:00 GMT',
    })
    .end(DUMP);
};

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? '/';
    res.on('finish', () => hits.push({ path, status: res.statusCode, headers: req.headers }));
    if (path === '/robots.txt') {
      res
        .writeHead(200, { 'content-type': 'text/plain' })
        .end('User-agent: *\nDisallow: /private\n');
      return;
    }
    const handler = routes.get(path);
    if (handler) handler(req, res, hitsTo(path).length);
    else res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(async () => {
  hits = [];
  routes.clear();
  if (dumpDir) await rm(dumpDir, { recursive: true, force: true });
  dumpDir = await mkdtemp(join(tmpdir(), 'sarvis-dumps-'));
});

describe('download', () => {
  it('streams the file to disk with the sha-256 of its bytes', async () => {
    routes.set('/dump.csv.gz', serveDump);
    const result = await client().download(url('/dump.csv.gz'));

    expect(result.sha256).toBe(DUMP_SHA);
    expect(result.bytes).toBe(DUMP.length);
    expect(result.cache).toBeNull();
    expect(result.etag).toBe(ETAG);
    expect(result.path).toBe(join(dumpDir, dumpKey(url('/dump.csv.gz'))));
    expect(Buffer.compare(await readFile(result.path), DUMP)).toBe(0);
    // Exact bytes, not a re-compressed copy, and our UA.
    const hit = hitsTo('/dump.csv.gz')[0]!;
    expect(hit.headers['accept-encoding']).toBe('identity');
    expect(hit.headers['user-agent']).toMatch(/^Sarvis\//);
    // No temp files left behind; the sidecar sits beside the file.
    expect((await readdir(dumpDir)).sort()).toEqual(
      [dumpKey(url('/dump.csv.gz')), `${dumpKey(url('/dump.csv.gz'))}.json`].sort(),
    );
  });

  it('revalidates with the ETag: a 304 and no new body', async () => {
    routes.set('/dump.csv.gz', serveDump);
    const first = await client().download(url('/dump.csv.gz'));
    const second = await client().download(url('/dump.csv.gz'));

    const dumpHits = hitsTo('/dump.csv.gz');
    expect(dumpHits.map((h) => h.status)).toEqual([200, 304]);
    expect(dumpHits[1]!.headers['if-none-match']).toBe(ETAG);
    expect(dumpHits[1]!.headers['if-modified-since']).toBe('Thu, 29 Oct 2026 02:00:00 GMT');
    expect(second.cache).toBe('revalidated');
    expect(second.sha256).toBe(first.sha256);
    expect(second.path).toBe(first.path);
    expect(second.fetchedAt >= first.fetchedAt).toBe(true);
    expect(Buffer.compare(await readFile(second.path), DUMP)).toBe(0);
  });

  it('fetches again when the file on disk no longer matches its sidecar', async () => {
    routes.set('/dump.csv.gz', serveDump);
    const first = await client().download(url('/dump.csv.gz'));
    await rm(first.path);
    const second = await client().download(url('/dump.csv.gz'));
    expect(hitsTo('/dump.csv.gz').map((h) => h.status)).toEqual([200, 200]);
    expect(hitsTo('/dump.csv.gz')[1]!.headers['if-none-match']).toBeUndefined();
    expect(second.cache).toBeNull();
    expect(second.sha256).toBe(DUMP_SHA);
  });

  it('refuses a path robots.txt disallows, without requesting it', async () => {
    routes.set('/private/dump.gz', serveDump);
    await expect(client().download(url('/private/dump.gz'))).rejects.toThrow(RobotsDisallowedError);
    expect(hitsTo('/private/dump.gz')).toHaveLength(0);
    expect(await readdir(dumpDir)).toEqual([]);
  });

  it('retries a 503', async () => {
    routes.set('/flaky.gz', (req, res, count) => {
      if (count === 0) res.writeHead(503).end();
      else serveDump(req, res, count);
    });
    const result = await client().download(url('/flaky.gz'));
    expect(hitsTo('/flaky.gz').map((h) => h.status)).toEqual([503, 200]);
    expect(result.sha256).toBe(DUMP_SHA);
  });

  it('retries a body that breaks off mid-way, leaving no partial file', async () => {
    let attempts = 0;
    routes.set('/cut.gz', (req, res) => {
      attempts++;
      if (attempts === 1) {
        res.writeHead(200, { 'content-length': DUMP.length });
        res.write(DUMP.subarray(0, 100), () => res.destroy());
        return;
      }
      serveDump(req, res, attempts);
    });
    const result = await client().download(url('/cut.gz'));
    expect(attempts).toBe(2);
    expect(result.sha256).toBe(DUMP_SHA);
    expect((await readdir(dumpDir)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('reads a downloaded dump back line by line', async () => {
    routes.set('/dump.csv.gz', serveDump);
    const { path } = await client().download(url('/dump.csv.gz'));
    const lines: string[] = [];
    for await (const line of openLines(path, { gzip: true })) lines.push(line);
    expect(lines).toHaveLength(5000);
    expect(lines[4999]).toBe('code\t4999\tProduct 4999\tcanada');
  });
});
