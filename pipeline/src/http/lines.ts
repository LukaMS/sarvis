// Line-by-line reading of a dump, from a downloaded file or straight from a URL. The iterator
// can stop at any point: a sample run reads only the start of a multi-GB file, and stopping
// destroys the stream, which closes the connection (P3.3).
import { createReadStream } from 'node:fs';
import { type Readable, pipeline } from 'node:stream';
import { createGunzip } from 'node:zlib';

import { ConfigurationError } from '../errors.ts';
import type { HttpClient } from './client.ts';

export interface OpenLinesOptions {
  /** Gunzip the stream. Defaults to true when the path or URL path ends in `.gz`. */
  gzip?: boolean;
  /** Required for a URL; the polite client's `stream` does the request. */
  http?: Pick<HttpClient, 'stream'>;
}

const isUrl = (input: string) => /^https?:\/\//i.test(input);

/**
 * The lines of a file or URL, without their `\n` or `\r\n`, decoded as UTF-8. A last line
 * without a newline is still yielded; an empty file yields nothing.
 */
export async function* openLines(
  input: string,
  opts: OpenLinesOptions = {},
): AsyncGenerator<string, void, undefined> {
  let source: Readable;
  if (isUrl(input)) {
    if (!opts.http) throw new ConfigurationError(`openLines needs an HTTP client for ${input}`);
    source = (await opts.http.stream({ url: input })).body;
  } else {
    source = createReadStream(input);
  }
  const gzip = opts.gzip ?? /\.gz$/i.test(isUrl(input) ? new URL(input).pathname : input);
  // pipeline destroys both streams when either fails or the gunzip side is destroyed.
  const stream = gzip ? pipeline(source, createGunzip(), () => {}) : source;

  const decoder = new TextDecoder('utf-8');
  let rest = '';
  try {
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      rest += decoder.decode(chunk, { stream: true });
      let start = 0;
      for (let end = rest.indexOf('\n'); end !== -1; end = rest.indexOf('\n', start)) {
        yield stripCr(rest.slice(start, end));
        start = end + 1;
      }
      rest = rest.slice(start);
    }
    rest += decoder.decode();
    if (rest !== '') yield stripCr(rest);
  } finally {
    stream.destroy();
    source.destroy();
  }
}

function stripCr(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}
