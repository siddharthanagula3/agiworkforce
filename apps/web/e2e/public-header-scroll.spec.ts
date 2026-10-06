import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1180, height: 757 },
  { width: 390, height: 844 },
]) {
  test.describe(`public header at ${viewport.width}px`, () => {
    test.use({ viewport });

    for (const colorScheme of ['dark', 'light'] as const) {
      test(`keeps navigation and the action stable across scrolling in ${colorScheme}`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        expect((await page.goto('/pricing'))?.status()).toBe(200);
        const header = page.locator('header.agi-ds-header');
        const surface = header.locator('.agi-ds-header-surface');
        const action = header.getByRole('link', { name: 'Try AGI Web', exact: true });
        await expect(action).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await expect(header).not.toHaveAttribute('data-scrolled');
        const before = await page
          .locator('main')
          .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
        const actionBefore = await action.boundingBox();
        await page.evaluate(() => window.scrollTo(0, 600));
        await expect(header).toHaveAttribute('data-scrolled', 'true');
        await expect(action).toBeVisible();
        const after = await page
          .locator('main')
          .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
        expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
        expect((await action.boundingBox())?.x).toBe(actionBefore?.x);
        if (viewport.width >= 768) {
          expect((await surface.boundingBox())?.height).toBeLessThanOrEqual(48);
          await expect(header.getByRole('link', { name: 'Pricing', exact: true })).toHaveAttribute(
            'aria-current',
            'page',
          );
        } else {
          await header.getByRole('button', { name: 'Menu', exact: true }).click();
          const menu = page.getByRole('dialog');
          await expect(menu.getByRole('link', { name: 'Pricing', exact: true })).toHaveAttribute(
            'aria-current',
            'page',
          );
          await page.keyboard.press('Escape');
        }
        expect(await surface.evaluate((el) => getComputedStyle(el).transitionProperty)).toBe(
          'none',
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
        ).toBeLessThanOrEqual(0);
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(header).not.toHaveAttribute('data-scrolled');
      });
    }

    test('identifies the current page inside its navigation group', async ({ page }) => {
      expect((await page.goto('/security'))?.status()).toBe(200);
      if (viewport.width >= 768) {
        const nav = page.getByRole('navigation', { name: 'Primary' });
        await nav.locator('[data-current="true"] > button').click();
        await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
        await expect(nav.locator('[aria-current="page"]')).toHaveAttribute('href', '/security');
      } else {
        await page.getByRole('button', { name: 'Menu', exact: true }).click();
        const nav = page.getByRole('dialog').getByRole('navigation', { name: 'Site' });
        await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
        await expect(nav.locator('[aria-current="page"]')).toHaveAttribute('href', '/security');
      }
    });
  });
}
