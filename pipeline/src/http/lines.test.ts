// openLines over files, and over a URL whose response never ends, to show that stopping early
// closes the connection.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGzip, gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ConfigurationError } from '../errors.ts';
import { createLogger } from '../log.ts';
import { createHttpClient } from './client.ts';
import { openLines } from './lines.ts';

let dir: string;
let server: Server;
let port: number;
/** Resolves when the client's connection for /endless.jsonl.gz closes. */
let endlessClosed: Promise<void> | undefined;
let endlessLinesWritten = 0;

const collect = async (it: AsyncIterable<string>) => {
  const out: string[] = [];
  for await (const line of it) out.push(line);
  return out;
};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sarvis-lines-'));
  server = createServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.writeHead(404).end();
      return;
    }
    // A gzipped JSONL response that only ends when the client goes away.
    endlessClosed = new Promise((resolve) => req.socket.once('close', () => resolve()));
    res.writeHead(200, { 'content-type': 'application/gzip' });
    const gz = createGzip();
    gz.pipe(res);
    let stopped = false;
    res.once('close', () => {
      stopped = true;
      gz.destroy();
    });
    const pump = () => {
      while (!stopped) {
        if (!gz.write(`{"n":${endlessLinesWritten++}}\n`)) {
          gz.once('drain', pump);
          return;
        }
      }
    };
    pump();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

describe('openLines: files', () => {
  it('splits on \\n and \\r\\n and keeps a last line without a newline', async () => {
    const path = join(dir, 'plain.tsv');
    await writeFile(path, 'a\tb\r\nc\td\n\ne\tf');
    expect(await collect(openLines(path))).toEqual(['a\tb', 'c\td', '', 'e\tf']);
  });

  it('yields nothing for an empty file', async () => {
    const path = join(dir, 'empty.txt');
    await writeFile(path, '');
    expect(await collect(openLines(path))).toEqual([]);
  });

  it('gunzips a .gz file by default', async () => {
    const path = join(dir, 'data.jsonl.gz');
    await writeFile(path, gzipSync('{"a":1}\n{"a":2}\n'));
    expect(await collect(openLines(path))).toEqual(['{"a":1}', '{"a":2}']);
  });

  it('decodes a multi-byte character split across read chunks', async () => {
    // The fs stream reads 64 KiB chunks; the 2-byte é straddles the first boundary.
    const path = join(dir, 'split.txt');
    await writeFile(path, `${'x'.repeat(65535)}é\nnext\n`);
    const lines = await collect(openLines(path));
    expect(lines).toHaveLength(2);
    expect(lines[0]!.endsWith('xé')).toBe(true);
    expect(lines[1]).toBe('next');
  });

  it('stops early without reading the rest', async () => {
    const path = join(dir, 'many.txt.gz');
    await writeFile(
      path,
      gzipSync(Array.from({ length: 100_000 }, (_, i) => `line ${i}`).join('\n')),
    );
    const lines: string[] = [];
    for await (const line of openLines(path)) {
      lines.push(line);
      if (lines.length === 3) break;
    }
    expect(lines).toEqual(['line 0', 'line 1', 'line 2']);
  });
});

describe('openLines: URLs', () => {
  it('needs an HTTP client', async () => {
    await expect(collect(openLines('https://example.test/a.gz'))).rejects.toThrow(
      ConfigurationError,
    );
  });

  it('stops after 10 lines of an endless response and closes the socket', async () => {
    const http = createHttpClient({ cache: null, log: createLogger({}, () => {}) });
    const lines: string[] = [];
    for await (const line of openLines(`http://127.0.0.1:${port}/endless.jsonl.gz`, { http })) {
      lines.push(line);
      if (lines.length === 10) break;
    }
    expect(lines).toEqual(Array.from({ length: 10 }, (_, n) => `{"n":${n}}`));
    expect(endlessClosed).toBeDefined();
    const closed = await Promise.race([
      endlessClosed!.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
    ]);
    expect(closed).toBe(true);
    // The server stopped writing once the client went away.
    const written = endlessLinesWritten;
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(endlessLinesWritten).toBe(written);
  }, 10_000);
});
