import { expect, test, type Page } from '@playwright/test';

const WIDTHS = [1440, 390, 320] as const;

async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`/legal/open-source, ${colorScheme} theme`, () => {
    test.use({ colorScheme });

    for (const width of WIDTHS) {
      test(`shows the notices heading and fits ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        expect((await page.goto('/legal/open-source'))?.status()).toBe(200);

        const heading = page.getByRole('heading', { level: 1 });
        await expect(heading).toHaveText('Open source licenses.');
        await expect(heading).toBeInViewport();
        await expect(
          page
            .getByRole('heading', { level: 2, name: 'Packages by license.' })
            .or(page.getByText('Notices are generated at build time.')),
        ).toBeVisible();
        expect(await overflow(page)).toBeLessThanOrEqual(0);
      });
    }
  });
}

test('lists the packages of a license group once it is opened', async ({ page }) => {
  await page.goto('/legal/open-source');
  const groups = page.locator('#packages details');
  const notGenerated = page.getByText('Notices are generated at build time.');
  await expect(groups.first().or(notGenerated)).toBeVisible();
  if (await notGenerated.isVisible()) {
    await expect(groups).toHaveCount(0);
    return;
  }

  const notices = page.waitForResponse('**/legal/third-party-notices.json');
  await groups.first().locator('summary').click();
  expect((await notices).status()).toBe(200);
  await expect(groups.first().locator('.agi-oss-package').first()).toBeVisible();
});
