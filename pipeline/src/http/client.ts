// The one fetch path for every source. It enforces CLAUDE.md's scraper rules:
// - the Sarvis User-Agent (D-015);
// - at most 1 request per second per host, slower if the source row or Crawl-delay asks;
// - robots.txt, checked before any request to a path;
// - backoff with jitter on 5xx and network errors;
// - 403 and 429 stop the source (SourceBlockedError); a 429 honours Retry-After once first;
// - an on-disk cache with a TTL, revalidated with ETag / Last-Modified.
import {
  CancelledError,
  ConfigurationError,
  NetworkError,
  RobotsDisallowedError,
  SourceResponseError,
  classifyError,
  errorFromStatus,
} from '../errors.ts';
import { userAgent as buildUserAgent } from '../index.ts';
import { createLogger, type Logger } from '../log.ts';
import {
  KEPT_HEADERS,
  cacheKey,
  createDiskCache,
  type CachedResponse,
  type HttpCache,
} from './cache.ts';
import { sleep, withRetry } from './retry.ts';
import { ALLOW_ALL, DISALLOW_ALL, policyFromText, type RobotsPolicy } from './robots.ts';

/** The ceiling for every host, whatever a source row says (CLAUDE.md "Scrapers"). */
export const MAX_RATE_PER_SEC = 1;
/** The robots.txt product token: the User-Agent's name, lower case. */
export const ROBOTS_TOKEN = 'sarvis';

const REDIRECTS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

export interface HttpClientOptions {
  /** Requests per second per host. Defaults to 1 and is capped at 1 and at `sourceRateLimitPerSec`. */
  ratePerSec?: number;
  /** `sources.rate_limit_per_sec`; never exceeded. */
  sourceRateLimitPerSec?: number | null;
  userAgent?: string;
  /** The response cache; `null` turns it off. Defaults to the disk cache in .cache/http/. */
  cache?: HttpCache | null;
  /** How long a cached response is served without a request. Defaults to 12 hours. */
  cacheTtlMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** A 429's Retry-After longer than this isn't waited for: the source stops at once. */
  maxRetryAfterMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  log?: Logger;
}

export interface HttpRequest {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  /** Overrides the client's TTL for this request; 0 always revalidates. */
  cacheTtlMs?: number;
}

export interface HttpResponse {
  url: string;
  status: number;
  /** Header names in lower case. */
  headers: Record<string, string>;
  body: string;
  /** When the body was fetched, or last confirmed by a 304 (ISO). Provenance `fetched_at`. */
  fetchedAt: string;
  /** `ttl`: served without a request; `revalidated`: a 304 confirmed it; `null`: fetched now. */
  cache: 'ttl' | 'revalidated' | null;
}

export interface HttpClient {
  request(req: HttpRequest): Promise<HttpResponse>;
  get(url: string, headers?: Record<string, string>): Promise<HttpResponse>;
}

/**
 * Per-host spacing: a token bucket of capacity 1, so there are no bursts. Each call joins the
 * host's queue synchronously, so concurrent callers queue up and different hosts don't wait on
 * each other. A caller waits `intervalMs` from when the previous one actually went out, not
 * from a booked slot, so a late wake-up never makes the next request early (P2.21).
 */
export class HostLimiter {
  /** Per host: resolves with the time the last queued caller's request went out. */
  private readonly last = new Map<string, Promise<number>>();

  /**
   * Waits for the host's turn, then calls `start` (which issues the request) and returns its
   * result. The turn is stamped after `start` returns, so any setup before the send never makes
   * the next request early (P2.23).
   */
  async run<T>(
    host: string,
    intervalMs: number,
    start: () => T,
    signal?: AbortSignal,
  ): Promise<Awaited<T>> {
    const previous = this.last.get(host);
    let done!: (at: number) => void;
    this.last.set(
      host,
      new Promise((resolve) => {
        done = resolve;
      }),
    );
    let sent: T;
    try {
      const after = (previous ? await previous : -Infinity) + intervalMs;
      // Re-check after waking: a timer can fire a millisecond early.
      for (let wait = after - Date.now(); wait > 0; wait = after - Date.now()) {
        await sleep(wait, signal);
      }
      sent = start();
    } finally {
      // A cancelled or failed caller still holds its turn, so the next one keeps the spacing.
      done(Date.now());
    }
    return await sent;
  }
}

export function effectiveRate(ratePerSec?: number, sourceLimit?: number | null): number {
  const rate = Math.min(ratePerSec ?? MAX_RATE_PER_SEC, sourceLimit ?? Infinity, MAX_RATE_PER_SEC);
  if (!(rate > 0)) throw new ConfigurationError(`The request rate must be above 0 (got ${rate}).`);
  return rate;
}

/** Retry-After as seconds or an HTTP date, in ms; undefined when missing or unreadable. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const intervalMs = 1000 / effectiveRate(options.ratePerSec, options.sourceRateLimitPerSec);
  const ua = options.userAgent ?? buildUserAgent();
  const cache = options.cache === undefined ? createDiskCache() : options.cache;
  const defaultTtl = options.cacheTtlMs ?? 12 * 60 * 60 * 1000;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxRetryAfterMs = options.maxRetryAfterMs ?? 60_000;
  const outer = options.signal;
  const log = options.log ?? createLogger();
  const limiter = new HostLimiter();
  const robots = new Map<string, Promise<RobotsPolicy>>();

  /** One HTTP request, after waiting for the host's slot. Network failures become NetworkError. */
  async function send(url: URL, init: RequestInit, crawlDelayMs: number): Promise<Response> {
    const start = () => {
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = outer ? AbortSignal.any([outer, timeout]) : timeout;
      return fetch(url, { ...init, signal });
    };
    try {
      return await limiter.run(url.hostname, Math.max(intervalMs, crawlDelayMs), start, outer);
    } catch (err) {
      if (outer?.aborted) throw new CancelledError();
      if (classifyError(err).type === 'network_error') {
        throw new NetworkError(`Request failed: ${url.href}`, err);
      }
      throw err;
    }
  }

  function robotsFor(url: URL): Promise<RobotsPolicy> {
    let policy = robots.get(url.origin);
    if (!policy) {
      policy = fetchRobots(new URL('/robots.txt', url.origin));
      robots.set(url.origin, policy);
    }
    return policy;
  }

  async function fetchRobots(robotsUrl: URL): Promise<RobotsPolicy> {
    try {
      const res = await send(robotsUrl, { headers: { 'user-agent': ua } }, 0);
      if (res.ok) return policyFromText(await res.text(), ROBOTS_TOKEN);
      await res.body?.cancel();
      if (res.status >= 400 && res.status < 500) return ALLOW_ALL;
      log.warn('robots.txt unavailable; treating the host as disallowed', {
        url: robotsUrl.href,
        status: res.status,
      });
      return DISALLOW_ALL;
    } catch (err) {
      if (err instanceof CancelledError) throw err;
      log.warn('robots.txt unreachable; treating the host as disallowed', {
        url: robotsUrl.href,
        err,
      });
      return DISALLOW_ALL;
    }
  }

  async function request(req: HttpRequest): Promise<HttpResponse> {
    let url: URL;
    try {
      url = new URL(req.url);
    } catch {
      throw new ConfigurationError(`Not a valid URL: ${req.url}`);
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new ConfigurationError(`Only http(s) URLs can be fetched: ${url.href}`);
    }
    const method = req.method ?? 'GET';
    const ttl = req.cacheTtlMs ?? defaultTtl;
    const key = cacheKey(method, url.href, req.body);
    const cached = await cache?.get(key);
    if (cached && Date.now() - Date.parse(cached.fetchedAt) < ttl) {
      return fromCache(cached, 'ttl');
    }

    const headers: Record<string, string> = { ...req.headers, 'user-agent': ua };
    if (cached?.headers.etag) headers['if-none-match'] = cached.headers.etag;
    if (cached?.headers['last-modified']) {
      headers['if-modified-since'] = cached.headers['last-modified'];
    }
    let retryAfterUsed = false;

    // Redirects are followed by hand so each target is robots-checked and rate-limited too.
    const attempt = async (target: URL, init: RequestInit, hops: number): Promise<HttpResponse> => {
      const policy = await robotsFor(target);
      if (!policy.isAllowed(target.pathname + target.search)) {
        throw new RobotsDisallowedError(target.href);
      }
      const started = Date.now();
      const res = await send(target, { ...init, redirect: 'manual' }, policy.crawlDelayMs);
      const fields = { url: target.href, status: res.status, durationMs: Date.now() - started };

      if (REDIRECTS.has(res.status)) {
        await res.body?.cancel();
        const location = res.headers.get('location');
        if (!location || hops >= MAX_REDIRECTS) {
          throw new SourceResponseError(
            res.status,
            `${location ? 'Too many redirects' : 'Redirect without a Location'}: ${target.href}`,
          );
        }
        // 301/302/303 turn a POST into a GET, as browsers and fetch do.
        const next =
          res.status <= 303 && init.method === 'POST'
            ? { ...init, method: 'GET', body: undefined }
            : init;
        log.debug('http redirect', fields);
        return attempt(new URL(location, target), next, hops + 1);
      }

      if (res.status === 304 && cached) {
        await res.body?.cancel();
        const refreshed = { ...cached, fetchedAt: new Date().toISOString() };
        await cache?.set(refreshed);
        log.debug('http 304', fields);
        return fromCache(refreshed, 'revalidated');
      }
      if (res.ok) {
        const out: HttpResponse = {
          url: target.href,
          status: res.status,
          headers: Object.fromEntries(res.headers),
          body: await res.text(),
          fetchedAt: new Date().toISOString(),
          cache: null,
        };
        if (cache && method === 'GET' && res.status === 200) await cache.set(toEntry(key, out));
        log.debug('http ok', fields);
        return out;
      }

      await res.body?.cancel();
      const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
      if (
        res.status === 429 &&
        !retryAfterUsed &&
        retryAfterMs !== undefined &&
        retryAfterMs <= maxRetryAfterMs
      ) {
        retryAfterUsed = true;
        log.warn('http 429; waiting for Retry-After once', { ...fields, retryAfterMs });
        await sleep(retryAfterMs, outer);
        return attempt(target, init, hops);
      }
      throw errorFromStatus(res.status, target.href, { retryAfterMs });
    };

    return withRetry(() => attempt(url, { method, headers, body: req.body }, 0), {
      maxAttempts: options.maxAttempts ?? 4,
      baseDelayMs: options.baseDelayMs ?? 1000,
      maxDelayMs: options.maxDelayMs ?? 30_000,
      signal: outer,
      onRetry: (retryAttempt, err, delayMs) =>
        log.warn('http retry', { url: url.href, retryAttempt, delayMs, err }),
    });
  }

  return {
    request,
    get: (url, headers) => request({ url, headers }),
  };
}

function toEntry(key: string, res: HttpResponse): CachedResponse {
  const headers: Record<string, string> = {};
  for (const name of KEPT_HEADERS) {
    const value = res.headers[name];
    if (value !== undefined) headers[name] = value;
  }
  return {
    key,
    url: res.url,
    status: res.status,
    headers,
    body: res.body,
    fetchedAt: res.fetchedAt,
  };
}

function fromCache(entry: CachedResponse, how: 'ttl' | 'revalidated'): HttpResponse {
  return {
    url: entry.url,
    status: entry.status,
    headers: entry.headers,
    body: entry.body,
    fetchedAt: entry.fetchedAt,
    cache: how,
  };
}
