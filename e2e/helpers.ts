// Shared e2e helpers.
import type { Locator, Page } from '@playwright/test';

/**
 * Click an RN Web pressable inside a ScrollView. A plain `click()` scrolls and presses in one step,
 * and the late scroll event cancels the press, so the handler never runs. Scroll first, let two
 * frames pass, then click.
 */
export async function tap(locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  await locator
    .page()
    .evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  await locator.click();
}

/** Collects console errors for a final `expect(errors).toEqual([])`. */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/** Signs in through the /auth form. The caller asserts where it lands. */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth', { waitUntil: 'networkidle' });
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);
  await tap(page.getByTestId('auth-submit'));
}
