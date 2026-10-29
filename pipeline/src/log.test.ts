import { describe, expect, it } from 'vitest';

import { SourceBlockedError } from './errors.ts';
import { REDACTED, USER_DATA, createLogger, type LogLevel } from './log.ts';

function capture() {
  const lines: { level: LogLevel; line: string }[] = [];
  const log = createLogger({}, (level, line) => lines.push({ level, line }));
  const parsed = () => lines.map((l) => JSON.parse(l.line) as Record<string, unknown>);
  return { log, lines, parsed };
}

describe('log', () => {
  it('prints one JSON line with ts, level and message', () => {
    const { log, lines, parsed } = capture();
    log.info('fetched page', { sourceKey: 'off', page: 2 });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.line).not.toContain('\n');
    expect(parsed()[0]).toMatchObject({ level: 'info', message: 'fetched page', page: 2 });
    expect(typeof parsed()[0]!.ts).toBe('string');
  });

  it('redacts service_role_key, authorization and password at any depth', () => {
    const { log, lines } = capture();
    log.info('request', {
      service_role_key: 'sr-secret-1',
      headers: { Authorization: 'Bearer sr-secret-2', 'set-cookie': 'sid=sr-secret-3' },
      attempts: [{ password: 'sr-secret-4' }],
      SUPABASE_DEV_SERVICE_ROLE_KEY: 'sr-secret-5',
    });
    const line = lines[0]!.line;
    expect(line).not.toMatch(/sr-secret/);
    const out = JSON.parse(line);
    expect(out.service_role_key).toBe(REDACTED);
    expect(out.headers.Authorization).toBe(REDACTED);
    expect(out.headers['set-cookie']).toBe(REDACTED);
    expect(out.attempts[0].password).toBe(REDACTED);
    expect(out.SUPABASE_DEV_SERVICE_ROLE_KEY).toBe(REDACTED);
  });

  it('keeps ordinary keys that only look similar', () => {
    const { log, parsed } = capture();
    log.info('ai call', { tokens: 120, source_key: 'off', keyCount: 3 });
    expect(parsed()[0]).toMatchObject({ tokens: 120, source_key: 'off', keyCount: 3 });
  });

  it('never logs row data from user tables', () => {
    const { log, lines } = capture();
    log.warn('unexpected', {
      receipt: { id: 'r1', total: 42.5 },
      rows: { receipt_lines: [{ raw_text: 'MILK 2L' }], profiles: [{ display_name: 'Pat' }] },
      user_id: 'u-1',
      email: 'pat@example.com',
    });
    const line = lines[0]!.line;
    expect(line).not.toMatch(/MILK|Pat|pat@example|42\.5|u-1/);
    const out = JSON.parse(line);
    expect(out.receipt).toBe(USER_DATA);
    expect(out.rows.receipt_lines).toBe(USER_DATA);
    expect(out.user_id).toBe(USER_DATA);
  });

  it('serializes errors with their type and redacts inside them', () => {
    const { log, lines, parsed } = capture();
    const cause = Object.assign(new Error('inner'), { code: 'ECONNRESET', password: 'x' });
    log.error('blocked', { err: new SourceBlockedError(429, undefined, { cause }) });
    expect(lines[0]!.level).toBe('error');
    expect(parsed()[0]!.err).toMatchObject({
      name: 'SourceBlockedError',
      type: 'source_blocked',
      retryable: false,
      alert: true,
      cause: { message: 'inner', code: 'ECONNRESET' },
    });
  });

  it('child loggers keep the bound fields and the redaction', () => {
    const { log, parsed } = capture();
    log.child({ runId: 'r-1', apikey: 'k' }).info('x', { page: 1 });
    expect(parsed()[0]).toMatchObject({ runId: 'r-1', apikey: REDACTED, page: 1 });
  });
});
