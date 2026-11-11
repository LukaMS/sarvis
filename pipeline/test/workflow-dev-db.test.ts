// Guards on the dev-DB checks workflow (P6.2): the secrets stay out of reach of forks, the run
// shares the dev-database queue with the OFF refresh, a missing secret fails instead of skipping,
// and all four checks stay in it. Plain text checks, as in workflow-off.test.ts.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const text = readFileSync(
  new URL('../../.github/workflows/dev-db-checks.yml', import.meta.url),
  'utf8',
);
const lines = text.split(/\r?\n/);

/** The keys directly under a top-level block (`on:`, `permissions:`, …). */
function childKeys(block: string): string[] {
  const start = lines.indexOf(`${block}:`);
  expect(start, `no top-level ${block}:`).toBeGreaterThanOrEqual(0);
  const keys: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const m = /^ {2}([\w-]+):/.exec(line);
    if (m?.[1]) keys.push(m[1]);
  }
  return keys;
}

describe('dev-db-checks workflow', () => {
  it('runs on pushes to main and by hand, never for a pull request', () => {
    expect(childKeys('on')).toEqual(['push', 'workflow_dispatch']);
    expect(text).toMatch(/^ {2}push:\r?\n {4}branches: \[main\]$/m);
  });

  it('shares the dev-database concurrency group and never cancels a running check', () => {
    expect(childKeys('concurrency')).toEqual(['group', 'cancel-in-progress']);
    expect(text).toMatch(/^ {2}group: dev-db$/m);
    expect(text).toMatch(/^ {2}cancel-in-progress: false$/m);
  });

  it('asks only for read access to the code', () => {
    expect(childKeys('permissions')).toEqual(['contents']);
    expect(text).toMatch(/^ {2}contents: read$/m);
  });

  it('passes the dev secrets as the env names the checks read, and never echoes them', () => {
    const secrets = [...text.matchAll(/\$\{\{\s*secrets\.(\w+)\s*\}\}/g)].map((m) => m[1]);
    expect(secrets).toEqual([
      'SUPABASE_DEV_URL',
      'SUPABASE_DEV_ANON_KEY',
      'SUPABASE_DEV_SERVICE_ROLE_KEY',
    ]);
    expect(text).toMatch(/EXPO_PUBLIC_SUPABASE_URL: \$\{\{ secrets\.SUPABASE_DEV_URL \}\}/);
    expect(text).toMatch(
      /EXPO_PUBLIC_SUPABASE_ANON_KEY: \$\{\{ secrets\.SUPABASE_DEV_ANON_KEY \}\}/,
    );
    expect(text).not.toMatch(/echo[^\n]*(secrets\.|\$EXPO_PUBLIC|\$SUPABASE)/);
  });

  it('fails when a secret is missing, before any check could skip itself', () => {
    const guard = text.indexOf('Check the secrets are set');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(text.indexOf('check:gtin'));
    expect(text).toMatch(/exit 1/);
  });

  it('runs all four checks, each even after an earlier one failed', () => {
    const commands = [
      'npm run check:gtin --workspace @sarvis/pipeline',
      'npm run check:writers --workspace @sarvis/pipeline',
      'npm run e2e --workspace @sarvis/pipeline',
      'npx playwright install --with-deps chromium',
      'npm run e2e',
    ];
    let last = -1;
    for (const command of commands) {
      const at = lines.findIndex((l, i) => i > last && l.trim() === `run: ${command}`);
      expect(at, command).toBeGreaterThan(last);
      last = at;
    }
    expect(text.match(/if: \$\{\{ !cancelled\(\) \}\}/g)).toHaveLength(commands.length - 1);
  });

  it('uploads no artifact (traces would hold the dev URL and sessions)', () => {
    expect(text).not.toMatch(/upload-artifact/);
  });
});
