import { test, expect, type Page } from '@playwright/test';
import { getProviderOfferings } from '@agiworkforce/types';
import { signIn } from './qa-capability-harness';

const FAMILY = /^[a-z]+/;

const chatOfferings = Object.entries(getProviderOfferings()).filter(
  ([, offering]) => offering.provider === 'qwen' && offering.quotaProbeProtocol === 'chat',
);
const [readyKey, readyOffering] = chatOfferings[0]!;
const [unavailableKey] = chatOfferings.find(
  ([, offering]) =>
    FAMILY.exec(offering.providerModelId ?? '')?.[0] !==
    FAMILY.exec(readyOffering.providerModelId ?? '')?.[0],
)!;

function catalogue() {
  return {
    issuer: 'Fixture Cloud',
    observedOn: '2026-10-01',
    evidenceUrl: 'https://provider.example/free',
    reportedEligible: 2,
    reportedUnavailable: 0,
    models: [
      [readyKey, 'ready'],
      [unavailableKey, 'unavailable'],
    ].map(([key, status]) => {
      const offering = getProviderOfferings()[key!]!;
      return {
        key,
        displayName: offering.displayName,
        providerModelId: offering.providerModelId,
        category: offering.category,
        limit: null,
        unit: null,
        consumedApproximate: null,
        expiresOn: null,
        status,
      };
    }),
  };
}

async function stubFreeModels(page: Page, delayMs = 0) {
  await page.route('**/api/models/free-quota', async (route) => {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({ json: catalogue() });
  });
  await page.route('**/api/models/experiential-free', (route) =>
    route.fulfill({ status: 403, json: { error: 'Available on the Free plan.' } }),
  );
}

async function focusedText(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.textContent ?? '');
}

/**
 * jsdom has no competing listeners and no real focus model, so whether a click
 * or Enter on an aria-disabled row leaves the popover open is only meaningful
 * in a browser.
 */
test.describe('model picker free section', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await stubFreeModels(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });
    await page.locator('#model-selector').waitFor({ timeout: 30_000 });
  });

  test('clicking an unavailable model keeps the menu open and says why', async ({ page }) => {
    await page.locator('#model-selector').click();
    const panel = page.getByRole('dialog', { name: 'Models' });
    await panel.getByRole('button', { name: /Unavailable/ }).click();
    const row = panel
      .getByRole('group', { name: 'Unavailable free models' })
      .locator('[aria-disabled="true"]');
    await row.click();

    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole('status').filter({ hasText: 'is not available right now' }),
    ).toBeVisible();
  });

  test('keyboard reaches an unavailable model, Enter explains it, Escape returns focus', async ({
    page,
  }) => {
    await page.locator('#model-selector').click();
    const panel = page.getByRole('dialog', { name: 'Models' });
    await panel.getByRole('button', { name: /Unavailable/ }).waitFor();

    for (
      let step = 0;
      step < 20 && !(await focusedText(page)).startsWith('Unavailable');
      step += 1
    ) {
      await page.keyboard.press('ArrowDown');
    }
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-disabled'))).toBe(
      'true',
    );
    await page.keyboard.press('Enter');

    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole('status').filter({ hasText: 'is not available right now' }),
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Models' })).toHaveCount(0);
    await expect(page.locator('#model-selector')).toBeFocused();
  });

  test('a slow free catalogue never holds back the rest of the menu', async ({ page }) => {
    await page.unroute('**/api/models/free-quota');
    await stubFreeModels(page, 5_000);
    await page.locator('#model-selector').click();
    const panel = page.getByRole('dialog', { name: 'Models' });

    await expect(panel.getByRole('button', { name: /All models/ })).toBeVisible({ timeout: 2_000 });
    await expect(panel.getByText('Checking free models…')).toBeVisible();
    await expect(
      panel.getByRole('group', { name: 'Fixture Cloud free models' }).getByRole('button'),
    ).toHaveCount(1, { timeout: 15_000 });
  });
});
