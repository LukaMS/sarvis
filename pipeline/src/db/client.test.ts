// The retrying fetch behind the service client (P2.24), through the real supabase-js client with
// a fake fetch, so the test sees what PostgREST calls actually do.
import { describe, expect, it } from 'vitest';

import { createLogger } from '../log.ts';
import { createServiceClient, retryingFetch } from './client.ts';

const ENV = {
  supabaseUrl: 'https://dev.example.test',
  serviceRoleKey: 'test-service-role-key',
  contactEmail: null,
};
const quiet = createLogger({}, () => {});

interface Call {
  method: string;
  path: string;
  body: string | null;
}

/** A fake fetch that answers each call from `answers` in turn (a status, or 'reset' to throw). */
function fakeFetch(answers: (number | 'reset')[], body: unknown = []) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push({
      method: init?.method ?? 'GET',
      path: url.pathname,
      body: typeof init?.body === 'string' ? init.body : null,
    });
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)]!;
    if (answer === 'reset') {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
    }
    const ok = answer < 300;
    return new Response(
      JSON.stringify(ok ? body : { message: `upstream ${answer}`, code: 'PGRST000' }),
      { status: answer, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  return { impl, calls };
}

const client = (f: typeof fetch) =>
  createServiceClient(ENV, { fetch: f, retry: { baseDelayMs: 1, maxDelayMs: 2, log: quiet } });

describe('service client: database retries', () => {
  it('retries a write that got a 503 and succeeds', async () => {
    const f = fakeFetch([503, 201]);
    const { error } = await client(f.impl)
      .from('ingestion_run_events')
      .insert({ run_id: 'r1', severity: 'info', event_type: 't', message: 'm' });
    expect(error).toBeNull();
    expect(f.calls).toHaveLength(2);
    expect(f.calls.map((c) => c.method)).toEqual(['POST', 'POST']);
    // The same body went out both times.
    expect(f.calls[1]!.body).toBe(f.calls[0]!.body);
    expect(f.calls[0]!.path).toBe('/rest/v1/ingestion_run_events');
  });

  it('retries a read after a network error and a 502', async () => {
    const f = fakeFetch(['reset', 502, 200], [{ id: 'a' }]);
    const { data, error } = await client(f.impl).from('sources').select('id');
    expect(error).toBeNull();
    expect(data).toEqual([{ id: 'a' }]);
    expect(f.calls).toHaveLength(3);
  });

  it('gives up after 4 attempts and reports the last answer', async () => {
    const f = fakeFetch([503]);
    const { error, status } = await client(f.impl).from('sources').select('id');
    expect(status).toBe(503);
    expect(error?.message).toBe('upstream 503');
    // 4 in all: postgrest-js's own GET retry is off, so the two layers don't multiply.
    expect(f.calls).toHaveLength(4);
  });

  it('does not retry a 4xx (a row error is the writer’s business)', async () => {
    const f = fakeFetch([409]);
    const { error } = await client(f.impl)
      .from('ingestion_run_events')
      .insert({ run_id: 'r1', severity: 'info', event_type: 't', message: 'm' });
    expect(error).not.toBeNull();
    expect(f.calls).toHaveLength(1);
  });

  it('passes storage requests straight through', async () => {
    const f = fakeFetch([503]);
    const wrapped = retryingFetch(f.impl, { baseDelayMs: 1, log: quiet });
    const res = await wrapped('https://dev.example.test/storage/v1/object/raw/x', {
      method: 'POST',
    });
    expect(res.status).toBe(503);
    expect(f.calls).toHaveLength(1);
  });

  it('stops retrying once the signal aborts', async () => {
    const f = fakeFetch([503]);
    const ctl = new AbortController();
    const wrapped = retryingFetch(f.impl, { baseDelayMs: 50, maxDelayMs: 50, log: quiet });
    const pending = wrapped('https://dev.example.test/rest/v1/sources', { signal: ctl.signal });
    setTimeout(() => ctl.abort(), 10);
    await expect(pending).rejects.toThrow(/cancelled/i);
    expect(f.calls).toHaveLength(1);
  });
});
