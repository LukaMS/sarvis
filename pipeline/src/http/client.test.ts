// The polite client against a local node:http server, with the real 1 req/s limiter. These tests
// take a few seconds each on purpose: the spacing is what they check.
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { NetworkError, RobotsDisallowedError, SourceBlockedError } from '../errors.ts';
import { createLogger } from '../log.ts';
import { createDiskCache } from './cache.ts';
import {
  HostLimiter,
  createHttpClient,
  effectiveRate,
  parseRetryAfter,
  type HttpClientOptions,
} from './client.ts';

interface Hit {
  host: string;
  path: string;
  at: number;
  headers: IncomingMessage['headers'];
}

type Handler = (req: IncomingMessage, res: ServerResponse, count: number) => void;

let server: Server;
let port: number;
let hits: Hit[] = [];
/**
 * When the client called fetch, per request. Spacing is checked here, where the limiter acts:
 * server receive times add connection jitter that says nothing about the client (P2.21).
 */
let sends: { host: string; path: string; at: number }[] = [];
let robotsTxt: string | null = 'User-agent: *\nDisallow: /private\n';
const routes = new Map<string, Handler>();
let cacheDir: string;

const quiet = createLogger({}, () => {});
const at = (host: string, path: string) => `http://${host}:${port}${path}`;
const hitsTo = (path: string) => hits.filter((h) => h.path === path);

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? '/';
    hits.push({ host: req.headers.host ?? '', path, at: Date.now(), headers: req.headers });
    if (path === '/robots.txt') {
      if (robotsTxt === null) res.writeHead(404).end();
      else res.writeHead(200, { 'content-type': 'text/plain' }).end(robotsTxt);
      return;
    }
    const handler = routes.get(path);
    if (!handler) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ path }));
      return;
    }
    handler(req, res, hitsTo(path).length);
  });
  // No host: listens on both IPv4 and IPv6, so 127.0.0.1 and localhost are two hosts.
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as AddressInfo).port;
  cacheDir = await mkdtemp(join(tmpdir(), 'sarvis-http-'));
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    sends.push({ host: url.hostname, path: url.pathname, at: Date.now() });
    return realFetch(input, init);
  });
});

afterAll(async () => {
  vi.restoreAllMocks();
  await new Promise((resolve) => server.close(resolve));
  await rm(cacheDir, { recursive: true, force: true });
});

beforeEach(() => {
  hits = [];
  sends = [];
  robotsTxt = 'User-agent: *\nDisallow: /private\n';
  routes.clear();
});

const client = (options: HttpClientOptions = {}) =>
  createHttpClient({ cache: null, log: quiet, baseDelayMs: 10, maxDelayMs: 20, ...options });

describe('rate limiting', () => {
  it('spaces 5 requests to one host at least 1 s apart (≥ 4 s in all)', async () => {
    const http = client();
    const started = Date.now();
    for (let i = 0; i < 5; i++) await http.get(at('127.0.0.1', `/item/${i}`));
    expect(hits.filter((h) => h.path.startsWith('/item/'))).toHaveLength(5);
    const items = sends.filter((s) => s.path.startsWith('/item/'));
    expect(items).toHaveLength(5);
    expect(Date.now() - started).toBeGreaterThanOrEqual(4000);
    for (let i = 1; i < items.length; i++) {
      expect(items[i]!.at - items[i - 1]!.at).toBeGreaterThanOrEqual(1000);
    }
  }, 20_000);

  it('lets two hosts interleave instead of queueing behind each other', async () => {
    const http = client();
    const started = Date.now();
    await Promise.all([
      (async () => {
        for (let i = 0; i < 3; i++) await http.get(at('127.0.0.1', `/a/${i}`));
      })(),
      (async () => {
        for (let i = 0; i < 3; i++) await http.get(at('localhost', `/b/${i}`));
      })(),
    ]);
    const elapsed = Date.now() - started;
    // Each host: robots.txt + 3 requests = 3 s of spacing. Queued behind each other it would be 7 s.
    expect(elapsed).toBeGreaterThanOrEqual(2990);
    expect(elapsed).toBeLessThan(5000);
    const order = sends
      .filter((s) => s.path !== '/robots.txt')
      .map((s) => (s.path.startsWith('/a/') ? 'a' : 'b'))
      .join('');
    expect(order).not.toMatch(/aaa|bbb/);
    for (const host of ['127.0.0.1', 'localhost']) {
      const times = sends.filter((s) => s.host === host).map((s) => s.at);
      expect(times).toHaveLength(4);
      for (let i = 1; i < times.length; i++)
        expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(1000);
    }
  }, 20_000);

  it('never goes faster than 1 req/s or the source limit', () => {
    expect(effectiveRate()).toBe(1);
    expect(effectiveRate(5)).toBe(1);
    expect(effectiveRate(5, 0.5)).toBe(0.5);
    expect(effectiveRate(undefined, 3)).toBe(1);
    expect(() => effectiveRate(0)).toThrow(/above 0/);
  });

  it('a Crawl-delay raises the spacing', async () => {
    robotsTxt = 'User-agent: *\nCrawl-delay: 2\n';
    const http = client();
    await http.get(at('127.0.0.1', '/slow/1'));
    await http.get(at('127.0.0.1', '/slow/2'));
    const [first, second] = sends.filter((s) => s.path.startsWith('/slow/'));
    expect(second!.at - first!.at).toBeGreaterThanOrEqual(2000);
  }, 20_000);

  it('HostLimiter reserves slots synchronously per host', async () => {
    const limiter = new HostLimiter();
    const started = Date.now();
    await Promise.all([
      limiter.run('h', 100, () => {}),
      limiter.run('h', 100, () => {}),
      limiter.run('h', 100, () => {}),
    ]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
  });

  it('HostLimiter spaces from the previous actual turn, so a late wake-up never makes the next early', async () => {
    const limiter = new HostLimiter();
    const times: number[] = [];
    const take = () => limiter.run('h', 100, () => times.push(Date.now()));
    const first = take();
    const rest = [take(), take()];
    await first;
    // Block the event loop past the second turn's due time, so it wakes 150 ms in, not 100.
    const until = Date.now() + 150;
    while (Date.now() < until);
    await Promise.all(rest);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(150);
    expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(100);
  });

  it('HostLimiter spaces from the send itself, so setup before the send never makes the next early', async () => {
    const limiter = new HostLimiter();
    const sentAt: number[] = [];
    // send() does some setup before fetch (P2.23). Here the first send's setup takes 30 ms and
    // the others' none, so a turn stamped before the setup lets the second go out 70 ms later.
    const send = (setupMs: number) =>
      limiter.run('h', 100, () => {
        const until = Date.now() + setupMs;
        while (Date.now() < until);
        sentAt.push(Date.now());
      });
    await Promise.all([send(30), send(0), send(0)]);
    expect(sentAt[1]! - sentAt[0]!).toBeGreaterThanOrEqual(100);
    expect(sentAt[2]! - sentAt[1]!).toBeGreaterThanOrEqual(100);
  });
});

describe('errors and backoff', () => {
  it('succeeds after a backoff when a 503 is followed by a 200', async () => {
    routes.set('/flaky', (_req, res, count) => {
      if (count === 1) res.writeHead(503).end();
      else res.writeHead(200).end('ok');
    });
    const res = await client().get(at('127.0.0.1', '/flaky'));
    expect(res).toMatchObject({ status: 200, body: 'ok', cache: null });
    expect(hitsTo('/flaky')).toHaveLength(2);
  }, 20_000);

  it('throws SourceBlockedError on a 403 after exactly one request', async () => {
    routes.set('/blocked', (_req, res) => res.writeHead(403).end());
    await expect(client().get(at('127.0.0.1', '/blocked'))).rejects.toBeInstanceOf(
      SourceBlockedError,
    );
    expect(hitsTo('/blocked')).toHaveLength(1);
  }, 20_000);

  it('honours a 429 Retry-After once, then stops', async () => {
    routes.set('/limited', (_req, res) => res.writeHead(429, { 'retry-after': '1' }).end());
    const err = await client()
      .get(at('127.0.0.1', '/limited'))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SourceBlockedError);
    expect(err).toMatchObject({ status: 429, retryAfterMs: 1000 });
    expect(hitsTo('/limited')).toHaveLength(2);
  }, 20_000);

  it('stops at once on a 429 without Retry-After', async () => {
    routes.set('/limited', (_req, res) => res.writeHead(429).end());
    await expect(client().get(at('127.0.0.1', '/limited'))).rejects.toBeInstanceOf(
      SourceBlockedError,
    );
    expect(hitsTo('/limited')).toHaveLength(1);
  }, 20_000);

  it('retries a dropped connection as a NetworkError', async () => {
    routes.set('/drop', (req, res, count) => {
      if (count === 1) req.socket.destroy();
      else res.writeHead(200).end('back');
    });
    const retried: unknown[] = [];
    const log = createLogger({}, (_level, line) => {
      const parsed = JSON.parse(line) as { message: string; err?: { name: string } };
      if (parsed.message === 'http retry') retried.push(parsed.err?.name);
    });
    const res = await client({ log }).get(at('127.0.0.1', '/drop'));
    expect(res.body).toBe('back');
    expect(retried).toEqual([NetworkError.name]);
  }, 20_000);

  it('treats a host whose robots.txt is unreachable as disallowed', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const deadPort = (closed.address() as AddressInfo).port;
    await new Promise((resolve) => closed.close(resolve));
    await expect(client().get(`http://127.0.0.1:${deadPort}/x`)).rejects.toBeInstanceOf(
      RobotsDisallowedError,
    );
  }, 20_000);

  it('parses Retry-After as seconds or an HTTP date', () => {
    expect(parseRetryAfter('3')).toBe(3000);
    const now = Date.parse('2026-10-29T12:00:00Z');
    expect(parseRetryAfter('Thu, 29 Oct 2026 12:00:05 GMT', now)).toBe(5000);
    expect(parseRetryAfter('soon')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});

describe('robots.txt', () => {
  it('makes no request to a disallowed path', async () => {
    await expect(client().get(at('127.0.0.1', '/private/1'))).rejects.toBeInstanceOf(
      RobotsDisallowedError,
    );
    expect(hitsTo('/private/1')).toHaveLength(0);
    expect(hitsTo('/robots.txt')).toHaveLength(1);
  });

  it('fetches robots.txt once per origin and sends our User-Agent', async () => {
    const http = client();
    await http.get(at('127.0.0.1', '/one'));
    await http.get(at('127.0.0.1', '/two'));
    expect(hitsTo('/robots.txt')).toHaveLength(1);
    expect(hitsTo('/one')[0]!.headers['user-agent']).toMatch(/^Sarvis\/\S+ \(\+https:\/\//);
  }, 20_000);

  it('allows everything when robots.txt is missing (404)', async () => {
    robotsTxt = null;
    await expect(client().get(at('127.0.0.1', '/private/1'))).resolves.toMatchObject({
      status: 200,
    });
  }, 20_000);

  it('robots-checks a redirect target before following it', async () => {
    routes.set('/go', (_req, res) => res.writeHead(302, { location: '/private/2' }).end());
    await expect(client().get(at('127.0.0.1', '/go'))).rejects.toBeInstanceOf(
      RobotsDisallowedError,
    );
    expect(hitsTo('/private/2')).toHaveLength(0);
  }, 20_000);

  it('follows an allowed redirect and reports the final URL', async () => {
    routes.set('/old', (_req, res) => res.writeHead(301, { location: '/new' }).end());
    const res = await client().get(at('127.0.0.1', '/old'));
    expect(res.url).toBe(at('127.0.0.1', '/new'));
    expect(JSON.parse(res.body)).toEqual({ path: '/new' });
  }, 20_000);
});

describe('cache', () => {
  it('serves a second fetch from the cache within the TTL, with no request', async () => {
    const cache = createDiskCache(join(cacheDir, 'ttl'));
    const first = await client({ cache }).get(at('127.0.0.1', '/cached'));
    const second = await client({ cache }).get(at('127.0.0.1', '/cached'));
    expect(first.cache).toBeNull();
    expect(second).toMatchObject({ cache: 'ttl', body: first.body, fetchedAt: first.fetchedAt });
    expect(hitsTo('/cached')).toHaveLength(1);
  }, 20_000);

  it('revalidates with If-None-Match after the TTL and uses the 304', async () => {
    routes.set('/etag', (req, res) => {
      if (req.headers['if-none-match'] === '"v1"') res.writeHead(304).end();
      else res.writeHead(200, { etag: '"v1"', 'content-type': 'text/plain' }).end('body v1');
    });
    const cache = createDiskCache(join(cacheDir, 'etag'));
    const http = client({ cache, cacheTtlMs: 0 });
    await http.get(at('127.0.0.1', '/etag'));
    const second = await http.get(at('127.0.0.1', '/etag'));
    expect(second).toMatchObject({ cache: 'revalidated', status: 200, body: 'body v1' });
    const etagHits = hitsTo('/etag');
    expect(etagHits).toHaveLength(2);
    expect(etagHits[1]!.headers['if-none-match']).toBe('"v1"');
  }, 20_000);

  it('does not cache errors', async () => {
    routes.set('/gone', (_req, res) => res.writeHead(404).end());
    const cache = createDiskCache(join(cacheDir, 'errors'));
    const http = client({ cache });
    await expect(http.get(at('127.0.0.1', '/gone'))).rejects.toThrow(/404/);
    await expect(http.get(at('127.0.0.1', '/gone'))).rejects.toThrow(/404/);
    expect(hitsTo('/gone')).toHaveLength(2);
  }, 20_000);
});
