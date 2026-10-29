// On-disk HTTP cache under the repo-root .cache/http/ (gitignored). One JSON file per request key.
// Phase 6 persists the folder between Actions runs with actions/cache.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CACHE_DIR = fileURLToPath(new URL('../../../.cache/http/', import.meta.url));

export interface CachedResponse {
  key: string;
  url: string;
  status: number;
  /** Only the headers the client needs again: validators and content type. */
  headers: Record<string, string>;
  body: string;
  /** When the body was last fetched or confirmed by a 304 (ISO). */
  fetchedAt: string;
}

export interface HttpCache {
  get(key: string): Promise<CachedResponse | undefined>;
  set(entry: CachedResponse): Promise<void>;
}

export const KEPT_HEADERS = ['etag', 'last-modified', 'content-type'] as const;

/** Keyed by method + URL, plus the body for a POST. */
export function cacheKey(method: string, url: string, body?: string): string {
  const hash = createHash('sha256').update(`${method.toUpperCase()} ${url}`);
  if (body !== undefined) hash.update(`\n${body}`);
  return hash.digest('hex');
}

export function createDiskCache(dir: string = DEFAULT_CACHE_DIR): HttpCache {
  const file = (key: string) => join(dir, `${key}.json`);
  return {
    async get(key) {
      try {
        const entry = JSON.parse(await readFile(file(key), 'utf8')) as CachedResponse;
        return entry.key === key ? entry : undefined;
      } catch {
        return undefined; // Missing or unreadable: a miss.
      }
    },
    async set(entry) {
      await mkdir(dir, { recursive: true });
      // Write then rename, so a crash never leaves a half-written entry.
      const tmp = `${file(entry.key)}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(entry), 'utf8');
      await rename(tmp, file(entry.key));
    },
  };
}
