import { expect, test, type Page } from '@playwright/test';

import { collectConsoleErrors, signIn, tap } from './helpers';
import { ADMIN_USER, passwordFor } from './users';

const SIGNED_OUT = { cookies: [], origins: [] };

/** Resolves with the status of the next admin_ping RPC the page makes. */
function adminPingStatus(page: Page): Promise<number> {
  return page
    .waitForResponse((res) => new URL(res.url()).pathname === '/rest/v1/rpc/admin_ping')
    .then((res) => res.status());
}

/** POSTs admin_ping straight to PostgREST with the signed-in user's access token from the page. */
async function callAdminPing(page: Page): Promise<{ status: number; body: unknown }> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY are not set.');
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'));
    return key ? (JSON.parse(localStorage.getItem(key) ?? '{}') as { access_token?: string }) : {};
  });
  if (!token.access_token) throw new Error('No session in localStorage.');
  const res = await page.request.post(`${url}/rest/v1/rpc/admin_ping`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token.access_token}` },
  });
  return { status: res.status(), body: await res.json() };
}

test.describe('signed out', () => {
  test.use({ storageState: SIGNED_OUT });

  test('/admin redirects to /auth', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await page.goto('/admin', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('screen-auth')).toBeVisible();
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByTestId('admin-home')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});

// The default storage state is the shell user, whose role global setup resets to 'user'.
test('a normal user sees "Not authorised" and the server refuses admin_ping', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);
  const ping = adminPingStatus(page);

  await page.goto('/admin', { waitUntil: 'networkidle' });
  expect(await ping).toBe(403);
  await expect(page.getByTestId('admin-denied')).toBeVisible();
  await expect(page.getByTestId('admin-denied')).toContainText('Not authorised');
  await expect(page.getByTestId('admin-home')).toHaveCount(0);

  // Calling the RPC directly with the user's own token, bypassing the UI, is refused too.
  const res = await callAdminPing(page);
  expect(res.status).toBe(403);
  expect(res.body).toMatchObject({ code: '42501', message: 'Admin only' });

  await tap(page.getByTestId('admin-denied-home'));
  await expect(page.getByTestId('screen-impact')).toBeVisible();

  // The browser logs the expected 403 as a failed resource load.
  expect(consoleErrors.filter((e) => !e.includes('status of 403'))).toEqual([]);
});

test.describe('admin', () => {
  test.use({ storageState: SIGNED_OUT });

  test('the admin user sees the admin home', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await signIn(page, ADMIN_USER.email, passwordFor(ADMIN_USER));
    await expect(page.getByTestId('screen-impact')).toBeVisible();

    const ping = adminPingStatus(page);
    await page.goto('/admin', { waitUntil: 'networkidle' });
    expect(await ping).toBe(200);
    // The page is a lazy chunk, which the dev server bundles on its first request.
    await expect(page.getByTestId('admin-home')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('admin-home-user')).toContainText(ADMIN_USER.email);
    await expect(page.getByTestId('admin-denied')).toHaveCount(0);
    expect(await callAdminPing(page)).toEqual({ status: 200, body: true });
    expect(consoleErrors).toEqual([]);
  });
});
