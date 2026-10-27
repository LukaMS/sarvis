import { expect, test } from '@playwright/test';

test('home placeholder renders the shared app name', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/');

  await expect(page.getByTestId('placeholder-home')).toBeVisible();
  await expect(page.getByTestId('placeholder-home-title')).toHaveText('Sarvis');
  expect(consoleErrors).toEqual([]);
});
