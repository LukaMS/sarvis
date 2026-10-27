import { expect, test } from '@playwright/test';

test('home renders the shared app name', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/');

  await expect(page.getByTestId('screen-impact')).toBeVisible();
  await expect(page.getByTestId('screen-impact-wordmark')).toHaveText('Sarvis');
  expect(consoleErrors).toEqual([]);
});
