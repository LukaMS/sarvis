// Runs once before the suite (after the web server is up). Creates or resets three confirmed users on the
// dev project (one of them an admin) with fresh random passwords, then signs one in through the UI and
// saves the session, so specs other than auth.spec start signed in.
import { chromium, type FullConfig } from '@playwright/test';
import { randomBytes } from 'node:crypto';

import { ensureTestUser } from '../scripts/dev-create-test-user';
import { ADMIN_USER, AUTH_USER, SHELL_USER, STORAGE_STATE } from './users';

export default async function globalSetup(config: FullConfig) {
  for (const user of [SHELL_USER, AUTH_USER, ADMIN_USER]) {
    const password = randomBytes(18).toString('base64url');
    await ensureTestUser({
      email: user.email,
      password,
      displayName: user.displayName,
      role: 'role' in user ? user.role : 'user',
    });
    // Workers inherit env set here; the passwords never touch disk.
    process.env[user.passwordEnv] = password;
  }

  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error('baseURL is not set in playwright.config.ts');

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await page.goto('/auth', { waitUntil: 'networkidle' });
  await page.getByTestId('auth-email').fill(SHELL_USER.email);
  await page.getByTestId('auth-password').fill(process.env[SHELL_USER.passwordEnv] ?? '');
  await page.getByTestId('auth-submit').click();
  await page.getByTestId('screen-impact').waitFor();
  await page.context().storageState({ path: STORAGE_STATE });
  await browser.close();
}
