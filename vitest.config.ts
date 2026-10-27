// Root Vitest config: one project per workspace package that has tests.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/core', 'pipeline'],
  },
});
