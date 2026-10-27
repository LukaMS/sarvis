import { expect, test } from '@playwright/test';

const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'];
const BADGE_SIZES = ['sm', 'md', 'lg'];
const RING_SIZES = [100, 80, 64, 48, 40];
const RING_SCORES = ['97', '78', '55', '25', '5', '0', 'unscored'];

test('gallery renders every rating primitive variant', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/dev/gallery');
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

  await page.getByTestId('gallery-section-header-action-action').click();
  await expect(page.getByTestId('gallery-section-header-presses')).toHaveText(
    'Action pressed 1 times',
  );

  expect(consoleErrors).toEqual([]);
});
