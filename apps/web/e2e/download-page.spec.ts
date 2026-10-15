import { expect, test, type Page } from '@playwright/test';

const WIDTHS = [1440, 390, 320] as const;
const MIN_TARGET_PX = 44;

async function publishMacRelease(page: Page) {
  await page.route('**/api/releases/desktop-cloud/latest', (route) =>
    route.fulfill({
      json: {
        version: '1.2.0',
        publishedAt: '2026-08-13T00:00:00.000Z',
        platforms: { mac: true },
        architectures: { arm64: true, x64: true },
      },
    }),
  );
  await page.route('**/api/download/checksums', (route) =>
    route.fulfill({
      json: {
        version: '1.2.0',
        algorithm: 'sha256',
        installers: [
          { name: 'agiworkforce_1.2.0_aarch64.dmg', architecture: 'arm64', sha256: 'a'.repeat(64) },
          { name: 'agiworkforce_1.2.0_x64.dmg', architecture: 'x64', sha256: 'b'.repeat(64) },
        ],
      },
    }),
  );
}

async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`/download, ${colorScheme} theme`, () => {
    test.use({ colorScheme });

    for (const width of WIDTHS) {
      test(`shows its heading and fits ${width}px without a release`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.route('**/api/releases/desktop-cloud/latest', (route) =>
          route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } }),
        );
        expect((await page.goto('/download'))?.status()).toBe(200);

        const heading = page.getByRole('heading', { level: 1 });
        await expect(heading).toHaveText('Use AGI today, in your browser');
        await expect(heading).toBeInViewport();
        expect(await overflow(page)).toBeLessThanOrEqual(0);
      });

      test(`offers the Mac download and fits ${width}px with a release`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await publishMacRelease(page);
        await page.goto('/download');

        await expect(page.getByRole('heading', { level: 1 })).toHaveText('AGI for Mac');
        const hero = page.locator('.agi-dl-hero');
        await expect(hero.getByRole('link', { name: 'Download for Mac' })).toHaveAttribute(
          'href',
          /\/api\/download\?platform=mac&arch=(arm64|x64)$/,
        );
        await page.getByText('Verify your download').click();
        await expect(page.getByRole('list', { name: 'Installer checksums' })).toBeVisible();
        expect(await overflow(page)).toBeLessThanOrEqual(0);
      });
    }
  });
}

test.describe('/download on a touch screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('every control in the page body takes a 44px tap', async ({ page }) => {
    await publishMacRelease(page);
    await page.goto('/download');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('AGI for Mac');

    const controls = page.locator('main').locator('a[href], button, summary, input');
    const count = await controls.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      if (!(await control.isVisible())) continue;
      if ((await control.getAttribute('type')) === 'checkbox') continue;
      const box = await control.boundingBox();
      const name =
        (await control.textContent())?.trim() || (await control.getAttribute('aria-label'));
      expect(box?.height ?? 0, String(name)).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    }
  });
});
