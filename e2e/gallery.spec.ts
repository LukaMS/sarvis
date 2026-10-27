import { expect, test } from '@playwright/test';

import { tap } from './helpers';

const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'];
const BADGE_SIZES = ['sm', 'md', 'lg'];
const RING_SIZES = [100, 80, 64, 48, 40];
const RING_SCORES = ['97', '78', '55', '25', '5', '0', 'unscored'];

test('gallery renders every rating primitive variant', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Wait for the JS bundle, so presses aren't lost on the static HTML before hydration.
  await page.goto('/dev/gallery', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('gallery')).toBeVisible();

  const ids = [
    ...BADGE_SIZES.flatMap((size) =>
      [...GRADES, 'unrated'].map((grade) => `gallery-grade-badge-${size}-${grade}`),
    ),
    ...['Good', 'Mixed', 'Poor', 'unrated'].map((rating) => `gallery-rating-pill-${rating}`),
    ...RING_SIZES.flatMap((size) =>
      RING_SCORES.map((score) => `gallery-score-ring-${size}-${score}`),
    ),
    'gallery-section-header-plain',
    'gallery-section-header-action',
    'gallery-section-header-action-action',
  ];

  for (const id of ids) {
    await expect(page.getByTestId(id), id).toBeVisible();
  }

  await expect(page.getByTestId('gallery-grade-badge-md-B')).toHaveText('B');
  await expect(page.getByTestId('gallery-grade-badge-md-unrated')).toHaveText('Not rated');
  await expect(page.getByTestId('gallery-score-ring-64-78')).toHaveText('78');
  await expect(page.getByTestId('gallery-score-ring-64-unscored')).toHaveText('–');

  await tap(page.getByTestId('gallery-section-header-action-action'));
  await expect(page.getByTestId('gallery-section-header-presses')).toHaveText(
    'Action pressed 1 times',
  );

  expect(consoleErrors).toEqual([]);
});

test('interaction and state primitives respond to presses', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Wait for the JS bundle, so presses aren't lost on the static HTML before hydration.
  await page.goto('/dev/gallery', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('gallery')).toBeVisible();

  for (const id of [
    'gallery-button-primary',
    'gallery-button-primary-icon',
    'gallery-button-secondary',
    'gallery-button-text',
    'gallery-button-destructive',
    'gallery-button-disabled',
    'gallery-button-loading',
    'gallery-button-block-primary',
    'gallery-button-block-secondary',
    'gallery-chips-history-All',
    'gallery-chips-history-Barcode',
    'gallery-chips-history-Receipt',
    'gallery-chips-search-Products',
    'gallery-card-static',
    'gallery-card-pressable',
    'gallery-pressable-scale',
    'gallery-empty-state',
    'gallery-empty-state-default',
    'gallery-error-state-offline',
    'gallery-error-state-offline-retry',
    'gallery-error-state-not-retryable',
    'gallery-error-state-compact',
  ]) {
    await expect(page.getByTestId(id), id).toBeVisible();
  }
  // Not retryable → no retry button.
  await expect(page.getByTestId('gallery-error-state-not-retryable-retry')).toHaveCount(0);

  // Button press changes the counter; disabled and loading buttons don't.
  const presses = page.getByTestId('gallery-button-presses');
  await expect(presses).toHaveText('Buttons pressed 0 times');
  await tap(page.getByTestId('gallery-button-primary'));
  await expect(presses).toHaveText('Buttons pressed 1 times');
  await page.getByTestId('gallery-button-disabled').click({ force: true });
  await page.getByTestId('gallery-button-loading').click({ force: true });
  await expect(presses).toHaveText('Buttons pressed 1 times');

  // Chip press moves the selection.
  const barcode = page.getByTestId('gallery-chips-history-Barcode');
  const all = page.getByTestId('gallery-chips-history-All');
  // RN Web writes aria-selected only when it's true.
  await expect(all).toHaveAttribute('aria-selected', 'true');
  await expect(barcode).not.toHaveAttribute('aria-selected', 'true');
  await tap(barcode);
  await expect(barcode).toHaveAttribute('aria-selected', 'true');
  await expect(all).not.toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('gallery-chips-history-selected')).toHaveText(
    'History filter: Barcode',
  );

  // Pressable card and retry.
  await tap(page.getByTestId('gallery-card-pressable'));
  await expect(page.getByTestId('gallery-card-presses')).toHaveText('Cards pressed 1 times');
  await tap(page.getByTestId('gallery-error-state-offline-retry'));
  await expect(page.getByTestId('gallery-error-state-retries')).toHaveText('Retried 1 times');

  expect(consoleErrors).toEqual([]);
});

test('a render error inside a route shows RouteErrorBoundary', async ({ page }) => {
  const unexpectedErrors: string[] = [];
  page.on('console', (msg) => {
    // React logs the caught error in development; anything else is a failure.
    if (msg.type() === 'error' && !msg.text().includes('Deliberate render error')) {
      unexpectedErrors.push(msg.text());
    }
  });

  // Wait for the JS bundle, so presses aren't lost on the static HTML before hydration.
  await page.goto('/dev/gallery', { waitUntil: 'networkidle' });
  await tap(page.getByTestId('gallery-open-error-boundary'));

  await expect(page.getByTestId('route-error-boundary')).toBeVisible();
  await expect(page.getByText("This page couldn't be displayed")).toBeVisible();
  await expect(page.getByTestId('route-error-boundary-retry')).toBeVisible();
  await expect(page.getByTestId('route-error-boundary-back')).toBeVisible();

  await tap(page.getByTestId('route-error-boundary-back'));
  await expect(page.getByTestId('gallery')).toBeVisible();

  expect(unexpectedErrors).toEqual([]);
});
