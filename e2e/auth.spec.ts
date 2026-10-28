import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';

import { ensureTestUser } from '../scripts/dev-create-test-user';
import { generateRecoveryLink } from '../scripts/dev-recovery-link';
import { collectConsoleErrors, signIn, tap } from './helpers';
import { AUTH_USER, RESET_USER, passwordFor } from './users';

// Start signed out, unlike the other specs.
test.use({ storageState: { cookies: [], origins: [] } });

test('signed out, / redirects to /auth', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);

  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('screen-auth')).toBeVisible();
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByTestId('auth-title')).toHaveText('Sarvis');
  await expect(page.getByTestId('auth-subtitle')).toHaveText('Welcome back');

  // Deep links are guarded too.
  await page.goto('/product/sample', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('screen-auth')).toBeVisible();
  await expect(page.getByTestId('screen-product')).toHaveCount(0);

  expect(consoleErrors).toEqual([]);
});

test('a wrong password shows the mapped error', async ({ page }) => {
  // The browser logs the 400 from the token endpoint; that's the expected failure, not an app error.
  const consoleErrors = collectConsoleErrors(page);

  await signIn(page, AUTH_USER.email, 'definitely-not-the-password');
  await expect(page.getByTestId('auth-error')).toHaveText(
    "Incorrect email or password. Double-check both and try again. If you've forgotten your password, use the reset link.",
  );
  await expect(page.getByTestId('screen-auth')).toBeVisible();

  expect(consoleErrors.filter((e) => !e.includes('status of 400'))).toEqual([]);
});

test('a valid sign-in lands on Impact, survives a reload, and sign-out returns to /auth', async ({
  page,
}) => {
  const consoleErrors = collectConsoleErrors(page);

  await signIn(page, AUTH_USER.email, passwordFor(AUTH_USER));
  await expect(page.getByTestId('screen-impact')).toBeVisible();
  await expect(page).not.toHaveURL(/\/auth$/);

  // The session is persisted, so a reload stays signed in.
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('screen-impact')).toBeVisible();

  // Signed in, /auth sends you back to the tabs.
  await page.goto('/auth', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('screen-impact')).toBeVisible();

  await tap(page.getByTestId('screen-impact-profile'));
  await expect(page.getByTestId('profile-email')).toHaveText(AUTH_USER.email);
  await tap(page.getByTestId('profile-sign-out'));
  await expect(page.getByTestId('screen-auth')).toBeVisible();
  await expect(page).toHaveURL(/\/auth$/);

  // Signed out for good: a reload stays on /auth.
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('screen-auth')).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test('the sign-up form validates its fields', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);

  await page.goto('/auth', { waitUntil: 'networkidle' });
  await tap(page.getByTestId('auth-toggle-mode'));
  await expect(page.getByTestId('auth-subtitle')).toHaveText('Create your account');
  await expect(page.getByTestId('auth-name')).toBeVisible();
  await expect(page.getByTestId('auth-hint')).toHaveText('At least 8 characters.');
  await expect(page.getByTestId('auth-submit')).toHaveText('Create Account');
  await expect(page.getByTestId('auth-forgot')).toHaveCount(0);

  const error = page.getByTestId('auth-error');

  await tap(page.getByTestId('auth-submit'));
  await expect(error).toHaveText('Enter your email address.');

  await page.getByTestId('auth-email').fill('not-an-email');
  await expect(error).toHaveCount(0); // Editing clears the stale error.
  await tap(page.getByTestId('auth-submit'));
  await expect(error).toHaveText(
    "That email doesn't look right. Use a full address like you@example.com.",
  );

  await page.getByTestId('auth-email').fill('new-user@example.com');
  await tap(page.getByTestId('auth-submit'));
  await expect(error).toHaveText('Enter your password.');

  await page.getByTestId('auth-password').fill('short');
  await tap(page.getByTestId('auth-submit'));
  await expect(error).toHaveText('Your password needs at least 8 characters.');

  // Switching back to sign-in clears the error and hides the sign-up fields.
  await tap(page.getByTestId('auth-toggle-mode'));
  await expect(error).toHaveCount(0);
  await expect(page.getByTestId('auth-name')).toHaveCount(0);
  await expect(page.getByTestId('auth-subtitle')).toHaveText('Welcome back');

  expect(consoleErrors).toEqual([]);
});

test.describe('password reset', () => {
  // Both tests change RESET_USER's password, so they run one after the other.
  test.describe.configure({ mode: 'serial' });

  test('a reset link opens Set a new password; the new password works and the old one does not', async ({
    page,
  }) => {
    test.slow(); // Several full page loads through the single-threaded dev server.
    const consoleErrors = collectConsoleErrors(page);
    const oldPassword = randomBytes(18).toString('base64url');
    const newPassword = randomBytes(18).toString('base64url');
    await ensureTestUser({
      email: RESET_USER.email,
      password: oldPassword,
      displayName: RESET_USER.displayName,
    });

    // The link Supabase emails: verify on the auth server, then back to the app with the session.
    await page.goto(await generateRecoveryLink(RESET_USER.email), { waitUntil: 'networkidle' });
    await expect(page.getByTestId('screen-reset-password')).toBeVisible();
    await expect(page.getByTestId('reset-password-title')).toHaveText('Set a new password');
    await expect(page.getByTestId('screen-reset-password')).toContainText(RESET_USER.email);
    // The tokens don't stay in the address bar.
    expect(page.url()).not.toContain('access_token');

    // While recovering, the rest of the app stays shut.
    await page.goto('/settings', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('screen-reset-password')).toBeVisible();
    await expect(page.getByTestId('screen-settings')).toHaveCount(0);

    await page.getByTestId('reset-password-input').fill('short');
    await tap(page.getByTestId('reset-password-submit'));
    await expect(page.getByTestId('reset-password-error')).toHaveText(
      'Your password needs at least 8 characters.',
    );

    const alerts: string[] = [];
    page.on('dialog', async (dialog) => {
      alerts.push(dialog.message());
      await dialog.accept();
    });
    await page.getByTestId('reset-password-input').fill(newPassword);
    await tap(page.getByTestId('reset-password-submit'));
    await expect(page.getByTestId('screen-impact')).toBeVisible();
    expect(alerts).toEqual(['Password updated\n\nUse your new password next time you sign in.']);

    // Sign out, then only the new password signs in.
    await tap(page.getByTestId('screen-impact-profile'));
    await tap(page.getByTestId('profile-sign-out'));
    await expect(page.getByTestId('screen-auth')).toBeVisible();
    await signIn(page, RESET_USER.email, oldPassword);
    await expect(page.getByTestId('auth-error')).toContainText('Incorrect email or password.');
    await signIn(page, RESET_USER.email, newPassword);
    await expect(page.getByTestId('screen-impact')).toBeVisible();

    // The only failure is the old password's 400 from the token endpoint.
    expect(consoleErrors.filter((e) => !e.includes('status of 400'))).toEqual([]);
  });

  test('a used reset link shows the expired-link error on /auth, and Cancel signs out', async ({
    page,
  }) => {
    test.slow();
    const consoleErrors = collectConsoleErrors(page);
    await ensureTestUser({
      email: RESET_USER.email,
      password: randomBytes(18).toString('base64url'),
      displayName: RESET_USER.displayName,
    });

    const link = await generateRecoveryLink(RESET_USER.email);
    await page.goto(link, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('screen-reset-password')).toBeVisible();

    // Cancel ends the recovery session without changing the password.
    await tap(page.getByTestId('reset-password-cancel'));
    await expect(page.getByTestId('screen-auth')).toBeVisible();

    // Links work once.
    await page.goto(link, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('screen-auth')).toBeVisible();
    await expect(page.getByTestId('auth-error')).toHaveText(
      'That link has expired. Email links work once and expire after an hour. Request a new one below.',
    );
    expect(page.url()).not.toContain('error_description');

    // Typing clears it, like any other error.
    await page.getByTestId('auth-email').fill(RESET_USER.email);
    await expect(page.getByTestId('auth-error')).toHaveCount(0);

    expect(consoleErrors).toEqual([]);
  });
});
