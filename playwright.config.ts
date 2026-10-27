// Web e2e tests against Expo web. `npm run e2e` starts the dev server unless one is already running.
import { defineConfig, devices } from '@playwright/test';

const PORT = 8081;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
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
