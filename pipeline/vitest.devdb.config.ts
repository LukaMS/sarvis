// Dev-database checks (*.devdb.ts). Not part of `npm test`: they need the dev service-role key and
// write to the dev project. Run one with its npm script, e.g. `npm run check:writers`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.devdb.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
