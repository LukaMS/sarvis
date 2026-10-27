import { expect, test, type Page } from '@playwright/test';

import { tap } from './helpers';
import { AUTH_USER, passwordFor } from './users';

// Start signed out, unlike the other specs.
test.use({ storageState: { cookies: [], origins: [] } });

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/auth', { waitUntil: 'networkidle' });
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);
  await tap(page.getByTestId('auth-submit'));
}

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
