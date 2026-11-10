// Guards on the scheduled OFF workflow (P6.1) that a careless edit could break unnoticed: the
// secrets must stay out of reach of forks, and the run must share the dev-database queue. Plain
// text checks, so no YAML parser is needed.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const text = readFileSync(
  new URL('../../.github/workflows/pipeline-off.yml', import.meta.url),
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

describe('pipeline-off workflow', () => {
  it('runs only on the schedule and by hand, never for a push or pull request', () => {
    expect(childKeys('on')).toEqual(['schedule', 'workflow_dispatch']);
  });

  it('shares the dev-database concurrency group and never cancels a running import', () => {
    expect(childKeys('concurrency')).toEqual(['group', 'cancel-in-progress']);
    expect(text).toMatch(/^ {2}group: dev-db$/m);
    expect(text).toMatch(/^ {2}cancel-in-progress: false$/m);
  });

  it('asks only for read access to the code and write access to issues', () => {
    expect(childKeys('permissions')).toEqual(['contents', 'issues']);
    expect(text).toMatch(/^ {2}contents: read$/m);
    expect(text).toMatch(/^ {2}issues: write$/m);
  });

  it('passes the three secrets to the OFF step only, as the env names the pipeline reads', () => {
    const secrets = [...text.matchAll(/\$\{\{\s*secrets\.(\w+)\s*\}\}/g)].map((m) => m[1]);
    expect(secrets).toEqual([
      'SUPABASE_DEV_URL',
      'SUPABASE_DEV_SERVICE_ROLE_KEY',
      'PIPELINE_CONTACT_EMAIL',
    ]);
    expect(text).toMatch(/EXPO_PUBLIC_SUPABASE_URL: \$\{\{ secrets\.SUPABASE_DEV_URL \}\}/);
    expect(text).not.toMatch(/echo[^\n]*secrets\./);
  });

  it('runs OFF in auto mode unless a dispatch picks another', () => {
    expect(text).toMatch(/MODE: \$\{\{ inputs\.mode \|\| 'auto' \}\}/);
    expect(text).toMatch(/npm run pipeline -- run off --mode "\$MODE"/);
  });

  it('opens a failure issue', () => {
    expect(text).toMatch(/if: \$\{\{ failure\(\) \}\}/);
    expect(text).toMatch(/gh issue create/);
  });
});
