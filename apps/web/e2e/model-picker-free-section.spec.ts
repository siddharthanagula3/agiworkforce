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
const [imageKey] = Object.entries(getProviderOfferings()).find(
  ([, offering]) => offering.category === 'image' && offering.quotaProbeProtocol === 'image-sync',
)!;
const experientialKeys = Object.entries(getProviderOfferings())
  .filter(
    ([, offering]) =>
      offering.provider === 'experientiallabs' && offering.quotaProbeProtocol === 'chat',
  )
  .map(([key]) => key);

function freeCatalogue(issuer: string, entries: ReadonlyArray<readonly [string, string]>) {
  return {
    issuer,
    observedOn: '2026-10-01',
    evidenceUrl: 'https://provider.example/free',
    reportedEligible: entries.length,
    reportedUnavailable: 0,
    models: entries.map(([key, status]) => {
      const offering = getProviderOfferings()[key]!;
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

function catalogue() {
  return freeCatalogue('Fixture Cloud', [
    [readyKey, 'ready'],
    [unavailableKey, 'unavailable'],
  ]);
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

const LAYOUTS = [
  { name: 'desktop popover', viewport: { width: 1440, height: 900 } },
  { name: 'phone drawer', viewport: { width: 390, height: 844 } },
] as const;

/**
 * jsdom has no competing listeners and no real focus model, so whether a click
 * or Enter on an aria-disabled row leaves the popover open is only meaningful
 * in a browser.
 */
for (const layout of LAYOUTS) {
  test.describe(`model picker free section (${layout.name})`, () => {
    test.use({ viewport: layout.viewport });

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
      await expect(row).toHaveAccessibleDescription(/is not available right now/);
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

      await expect(panel.getByRole('button', { name: /All models/ })).toBeVisible({
        timeout: 2_000,
      });
      await expect(panel.getByText('Checking free models…')).toBeVisible();
      await expect(
        panel.getByRole('group', { name: 'Fixture Cloud free models' }).getByRole('button'),
      ).toHaveCount(1, { timeout: 15_000 });
    });
  });
}

test.describe('model picker free section (coarse pointer)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('controls between the free model rows give a thumb a 44px target', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/models/free-quota', (route) =>
      route.fulfill({
        json: freeCatalogue('Fixture Cloud', [
          [readyKey, 'ready'],
          [imageKey, 'ready'],
        ]),
      }),
    );
    await page.route('**/api/models/experiential-free', (route) =>
      route.fulfill({
        json: freeCatalogue(
          'Experiential Labs',
          experientialKeys.map((key) => [key, 'ready'] as const),
        ),
      }),
    );
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });
    await page.locator('#model-selector').waitFor({ timeout: 30_000 });
    await page.locator('#model-selector').click();
    const panel = page.getByRole('dialog', { name: 'Models' });
    await panel.getByRole('button', { name: /More models/ }).click();

    for (const control of [
      panel.getByRole('link', { name: 'Data use' }).first(),
      panel.getByRole('combobox', { name: 'Free model category' }),
      panel.getByRole('searchbox', { name: 'Search free models' }),
    ]) {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});
