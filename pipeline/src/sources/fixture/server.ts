// An in-process HTTP server for the fixture source, so a fixture run goes through the real polite
// client: robots.txt, the per-host rate limit, retries and the cache. It serves the fixture
// products the way OFF's v2 search API pages them:
//
//   GET /robots.txt
//   GET /api/v2/search?page=N&page_size=M → { count, page, page_count, page_size, skip, products }
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { type OffProduct, fixtureProducts } from './data.ts';

export const FIXTURE_ROBOTS = [
  'User-agent: *',
  'Disallow: /',
  '',
  'User-agent: sarvis',
  'Allow: /api/',
  'Disallow: /',
  '',
].join('\n');

export interface FixtureServer {
  /** The origin, e.g. http://127.0.0.1:53124 */
  url: string;
  /** Paths requested so far, in order (with the query). */
  requests: string[];
  close(): Promise<void>;
}

export interface FixtureServerOptions {
  products?: OffProduct[];
  /** 0 picks a free port. */
  port?: number;
}

function send(res: ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function searchPage(products: OffProduct[], query: URLSearchParams): string {
  const pageSize = Math.min(Math.max(Number(query.get('page_size')) || 20, 1), 100);
  const page = Math.max(Number(query.get('page')) || 1, 1);
  const skip = (page - 1) * pageSize;
  return JSON.stringify({
    count: products.length,
    page,
    page_count: Math.ceil(products.length / pageSize),
    page_size: pageSize,
    skip,
    products: products.slice(skip, skip + pageSize),
  });
}

export async function startFixtureServer(
  options: FixtureServerOptions = {},
): Promise<FixtureServer> {
  const products = options.products ?? fixtureProducts();
  const requests: string[] = [];

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://fixture.local');
    requests.push(url.pathname + url.search);
    if (req.method !== 'GET') return send(res, 405, 'text/plain', 'Method not allowed');
    if (url.pathname === '/robots.txt') return send(res, 200, 'text/plain', FIXTURE_ROBOTS);
    if (url.pathname === '/api/v2/search') {
      return send(res, 200, 'application/json', searchPage(products, url.searchParams));
    }
    send(res, 404, 'text/plain', 'Not found');
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => resolve());
  });
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
