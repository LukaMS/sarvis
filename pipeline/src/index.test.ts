import { describe, expect, it } from 'vitest';

import { userAgent } from './index';

describe('pipeline', () => {
  it('builds the User-Agent from the shared app name (D-015)', () => {
    expect(userAgent('0.1.0')).toBe('Sarvis/0.1.0 (+https://github.com/LukaMS/sarvis)');
  });
});
