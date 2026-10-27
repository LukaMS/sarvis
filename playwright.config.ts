// Web e2e tests against Expo web. `npm run e2e` starts the dev server unless one is already running.
import { defineConfig, devices } from '@playwright/test';

import { STORAGE_STATE } from './e2e/users';

// The repo-root .env holds the dev Supabase URL and the service-role key global setup needs.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env: global setup fails with a message naming the missing variables.
}

const PORT = 8081;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    storageState: STORAGE_STATE,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      // Baseline screenshots in docs/baseline/ are 390 × 844.
      name: 'mobile-web',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: 'npm run web',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { BROWSER: 'none' },
  },
});
