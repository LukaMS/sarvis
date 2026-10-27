import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';

import { ensureTestUser } from '../scripts/dev-create-test-user';
import { collectConsoleErrors, signIn, tap } from './helpers';
import { DELETE_USER } from './users';

// Signs in as its own throwaway user, so it never touches the shared session.
test.use({ storageState: { cookies: [], origins: [] } });

test('Settings → Delete my account asks twice, deletes the user, and the login stops working', async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);
  const failedRequests: string[] = [];
  page.on('response', (res) => {
    if (res.status() >= 400) failedRequests.push(`${res.status()} ${new URL(res.url()).pathname}`);
  });
  const password = randomBytes(18).toString('base64url');
  await ensureTestUser({
    email: DELETE_USER.email,
    password,
    displayName: DELETE_USER.displayName,
  });

  await signIn(page, DELETE_USER.email, password);
  await expect(page.getByTestId('screen-impact')).toBeVisible();
  await page.goto('/settings', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('screen-settings')).toBeVisible();

  // Web uses window.confirm. Answer each dialog from a queue and record what it said.
  const answers: boolean[] = [];
  const shown: string[] = [];
  page.on('dialog', async (dialog) => {
    shown.push(dialog.message());
    if (answers.shift()) await dialog.accept();
    else await dialog.dismiss();
  });

  // Cancel at the first step: nothing happens.
  answers.push(false);
  await tap(page.getByTestId('settings-delete-account'));
  await expect.poll(() => shown.length).toBe(1);
  expect(shown[0]).toContain('Delete your account?');
  await expect(page.getByTestId('screen-settings')).toBeVisible();

  // Continue, then keep the account at the second step: still nothing.
  answers.push(true, false);
  await tap(page.getByTestId('settings-delete-account'));
  await expect.poll(() => shown.length).toBe(3);
  expect(shown[2]).toContain('This is permanent');
  expect(shown[2]).toContain('Last chance — deleting your account cannot be reversed.');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('screen-settings')).toBeVisible();

  // Confirm both: the account goes and the guard returns to /auth.
  answers.push(true, true);
  await tap(page.getByTestId('settings-delete-account'));
  await expect(page.getByTestId('screen-auth')).toBeVisible();
  expect(shown).toHaveLength(5);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('screen-auth')).toBeVisible();

  // The same credentials no longer work.
  await signIn(page, DELETE_USER.email, password);
  await expect(page.getByTestId('auth-error')).toContainText('Incorrect email or password.');
  await expect(page.getByTestId('screen-auth')).toBeVisible();

  // Two failures are expected, and the browser logs both: the local sign-out after deletion still calls
  // /logout, which 403s because the session is gone (supabase-js treats that as signed out), and the
  // sign-in with the deleted credentials 400s.
  expect(failedRequests).toEqual(['403 /auth/v1/logout', '400 /auth/v1/token']);
  expect(
    consoleErrors.filter((e) => !e.includes('status of 403') && !e.includes('status of 400')),
  ).toEqual([]);
});
