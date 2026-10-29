import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { PIPELINE_VERSION, userAgent } from './index.ts';

describe('pipeline', () => {
  it('builds the User-Agent from the shared app name (D-015)', () => {
    expect(userAgent('0.1.0')).toBe('Sarvis/0.1.0 (+https://github.com/LukaMS/sarvis)');
  });

  it('keeps PIPELINE_VERSION in step with package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(PIPELINE_VERSION).toBe(pkg.version);
  });
});
