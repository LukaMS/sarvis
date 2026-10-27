// Shared e2e helpers.
import type { Locator } from '@playwright/test';

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
