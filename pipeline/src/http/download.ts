// Bulk-file downloads (OFF, Open Prices, Corporations Canada) to the repo-root .cache/dumps/
// (gitignored). The polite client's text bodies can't hold a dump (D-043), so the body streams
// to disk and is hashed as it's written. A sidecar keeps the validators, so the next run sends
// If-None-Match / If-Modified-Since and an unchanged file isn't fetched again.
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import { NetworkError, SourceResponseError, classifyError } from '../errors.ts';
import type { Logger } from '../log.ts';
import type { HttpClient } from './client.ts';
import { type RetryOptions, withRetry } from './retry.ts';

export const DEFAULT_DUMP_DIR = fileURLToPath(new URL('../../../.cache/dumps/', import.meta.url));

export interface DownloadOptions {
  /** Defaults to the client's `dumpDir`, else .cache/dumps/. */
  dir?: string;
}

export interface DownloadResult {
  /** The URL asked for: the cache key, and the run's `dump_url`. */
  url: string;
  /** The file on disk, as served (a .gz stays gzipped). */
  path: string;
  /** Of the file's bytes, lower-case hex: the run's `dump_sha256`. */
  sha256: string;
  bytes: number;
  /** When the file was fetched, or last confirmed by a 304 (ISO): the run's `dump_fetched_at`. */
  fetchedAt: string;
  etag: string | null;
  lastModified: string | null;
  /** `revalidated`: a 304 confirmed the copy on disk; `null`: fetched now. */
  cache: 'revalidated' | null;
}

/** `<key>.json` next to the file: what the last download saw. */
type Sidecar = Omit<DownloadResult, 'path' | 'cache'>;

export interface DownloadDeps {
  http: Pick<HttpClient, 'stream'>;
  retry: RetryOptions;
  log: Logger;
}

/** The file name for a URL: the sha-256 of the URL, so any URL maps to a safe name. */
export function dumpKey(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

/** The sidecar, if it and a file of the size it records are both on disk. */
async function readCached(path: string, url: string): Promise<Sidecar | undefined> {
  try {
    const meta = JSON.parse(await readFile(`${path}.json`, 'utf8')) as Sidecar;
    if (meta.url !== url) return undefined;
    return (await stat(path)).size === meta.bytes ? meta : undefined;
  } catch {
    return undefined; // Missing or unreadable: download again.
  }
}

async function writeSidecar(path: string, meta: Sidecar): Promise<void> {
  const tmp = `${path}.json.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(meta, null, 2), 'utf8');
  await rename(tmp, `${path}.json`);
}

/** Streams `body` to `path` through a temp file, hashing as it goes. */
async function save(body: Readable, path: string): Promise<{ sha256: string; bytes: number }> {
  const hash = createHash('sha256');
  let bytes = 0;
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    await pipeline(
      body,
      async function* (source: AsyncIterable<Buffer>) {
        for await (const chunk of source) {
          hash.update(chunk);
          bytes += chunk.length;
          yield chunk;
        }
      },
      createWriteStream(tmp),
    );
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
  return { sha256: hash.digest('hex'), bytes };
}

export async function downloadToCache(
  deps: DownloadDeps,
  url: string,
  opts: DownloadOptions = {},
): Promise<DownloadResult> {
  const dir = opts.dir ?? DEFAULT_DUMP_DIR;
  const path = join(dir, dumpKey(url));
  await mkdir(dir, { recursive: true });
  const cached = await readCached(path, url);

  // Identity, so the file and its hash are the bytes the server publishes.
  const headers: Record<string, string> = { 'accept-encoding': 'identity' };
  if (cached?.etag) headers['if-none-match'] = cached.etag;
  if (cached?.lastModified) headers['if-modified-since'] = cached.lastModified;

  // `stream` retries up to the headers; this retries a body that broke off mid-way.
  let bodyStarted = false;
  return withRetry(
    async () => {
      bodyStarted = false;
      const started = Date.now();
      const res = await deps.http.stream({ url, headers });

      if (res.status === 304) {
        res.body.destroy();
        if (!cached) throw new SourceResponseError(304, `HTTP 304 without validators: ${url}`);
        const meta = { ...cached, fetchedAt: res.fetchedAt };
        await writeSidecar(path, meta);
        deps.log.info('dump unchanged', { url, bytes: meta.bytes });
        return { ...meta, path, cache: 'revalidated' as const };
      }

      bodyStarted = true;
      const { sha256, bytes } = await save(res.body, path);
      const length = res.headers['content-length'];
      if (length !== undefined && Number(length) !== bytes) {
        await rm(path, { force: true });
        throw new NetworkError(`Download truncated at ${bytes} of ${length} bytes: ${url}`);
      }
      const meta: Sidecar = {
        url,
        sha256,
        bytes,
        fetchedAt: res.fetchedAt,
        etag: res.headers.etag ?? null,
        lastModified: res.headers['last-modified'] ?? null,
      };
      await writeSidecar(path, meta);
      deps.log.info('dump downloaded', { url, bytes, durationMs: Date.now() - started });
      return { ...meta, path, cache: null };
    },
    {
      ...deps.retry,
      isRetryable: (err) => bodyStarted && classifyError(err).retryable,
    },
  );
}
