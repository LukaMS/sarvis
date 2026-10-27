import { expect, test, type Page } from '@playwright/test';

import { tap } from './helpers';

const TABS = ['impact', 'scan', 'search', 'history'];

/** Every stack route, with the header title it shows (null: story's transparent header has none). */
const STACK_ROUTES: { name: string; path: string; header: string | null }[] = [
  { name: 'product', path: '/product/sample', header: 'Product Details' },
  { name: 'company', path: '/company/sample', header: 'Company Details' },
  { name: 'story', path: '/story/sample', header: null },
  { name: 'receipt', path: '/receipt/sample', header: 'Receipt Details' },
  { name: 'receipt-scan', path: '/receipt-scan', header: 'Scan Receipt' },
  { name: 'receipt-results', path: '/receipt-results', header: 'Receipt Results' },
  { name: 'stories', path: '/stories', header: 'Impact Stories' },
  { name: 'profile', path: '/profile', header: 'Profile' },
  { name: 'settings', path: '/settings', header: 'Settings' },
  { name: 'privacy', path: '/privacy', header: 'Privacy' },
  { name: 'help', path: '/help', header: 'Help & Support' },
  { name: 'about', path: '/about', header: 'About' },
];

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

test('tapping each tab shows its screen', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);

  // Wait for the JS bundle, so presses aren't lost on the static HTML before hydration.
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('screen-impact')).toBeVisible();

  // Out to the last tab and back again, so every tab is entered by a press.
  for (const tab of [...TABS.slice(1), ...TABS.slice(0, -1).reverse()]) {
    await tap(page.getByTestId(`tab-${tab}`));
    await expect(page.getByTestId(`screen-${tab}`), tab).toBeVisible();
    await expect(page.getByTestId(`screen-${tab}-title`)).toBeVisible();
  }

  expect(consoleErrors).toEqual([]);
});

for (const route of STACK_ROUTES) {
  test(`${route.path} opens by URL`, async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.goto(route.path, { waitUntil: 'networkidle' });
    await expect(page.getByTestId(`screen-${route.name}`)).toBeVisible();
    if (route.header) {
      await expect(page.getByRole('heading', { name: route.header, exact: true })).toBeVisible();
    }
    if (route.path.endsWith('/sample')) {
      await expect(page.getByTestId(`screen-${route.name}-param`)).toHaveText('id: sample');
    }

    expect(consoleErrors).toEqual([]);
  });
}

test('a stack screen opened from a tab has a back button that returns', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);

  await page.goto('/', { waitUntil: 'networkidle' });
  await tap(page.getByTestId('impact-link-product'));
  await expect(page.getByTestId('screen-product')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Product Details', exact: true })).toBeVisible();

  // On web the header back button is a link named "Go back".
  await tap(page.getByRole('link', { name: 'Go back' }));
  await expect(page.getByTestId('screen-impact')).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
