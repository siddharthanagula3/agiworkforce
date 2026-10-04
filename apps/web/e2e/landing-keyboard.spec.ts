import { expect, test, type Locator } from '@playwright/test';

import { mockAuthProvider } from './lib/mock-auth-provider';

test.use({ storageState: { cookies: [], origins: [] } });

const SKIP_TARGET_ID = 'main-content';
const FOCUSABLE_MAIN_ROUTES = [
  '/',
  '/desktop',
  '/mobile',
  '/web',
  '/cli',
  '/chrome-extension',
  '/vscode-extension',
  '/pricing',
  '/business',
  '/agi-code',
  '/docs/byok-env',
  '/api-docs',
];
const ID_ONLY_MAIN_ROUTES = ['/customers', '/enterprise', '/partners', '/teams'];
const LAYOUT_ROUTES = ['/', '/desktop', '/pricing', '/docs/byok-env'];
const VIEWPORTS = [
  { width: 1180, height: 757 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];

const requestedRoutes = process.env['LANDMARK_ROUTES']?.split(',').filter(Boolean);
const selected = (routes: readonly string[]): readonly string[] =>
  requestedRoutes ? routes.filter((route) => requestedRoutes.includes(route)) : routes;

const edges = (locator: Locator) =>
  locator.evaluate((element) => {
    const { left, right, top } = element.getBoundingClientRect();
    return { left, right, top };
  });

test.describe('the skip link reaches the main landmark on every public template', () => {
  for (const route of selected([...FOCUSABLE_MAIN_ROUTES, ...ID_ONLY_MAIN_ROUTES])) {
    test(`${route} skip link moves keyboard navigation past the header`, async ({ page }) => {
      await mockAuthProvider(page);
      await page.goto(route);

      const main = page.getByRole('main');
      await expect(main).toHaveCount(1);
      await expect(main).toHaveAttribute('id', SKIP_TARGET_ID);
      await expect(page.getByRole('banner')).toHaveCount(1);
      await expect(page.getByRole('contentinfo')).toHaveCount(1);

      await page.keyboard.press('Tab');
      const skipLink = page.getByRole('link', { name: 'Skip to main content', exact: true });
      await expect(skipLink).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`#${SKIP_TARGET_ID}$`));
      if (FOCUSABLE_MAIN_ROUTES.includes(route)) await expect(main).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(main.locator(':focus')).toHaveCount(1);
    });
  }
});

for (const viewport of VIEWPORTS) {
  test.describe(`site header and footer span the page at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    for (const route of selected(LAYOUT_ROUTES)) {
      test(`${route} keeps the header and footer full width and the header stuck`, async ({
        page,
      }) => {
        await mockAuthProvider(page);
        await page.goto(route);

        const header = page.getByRole('banner');
        const footer = page.getByRole('contentinfo');
        await expect(header).toHaveCount(1);
        await expect(footer).toHaveCount(1);

        const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);
        for (const chrome of [header, footer]) {
          const box = await edges(chrome);
          expect(box.left).toBeCloseTo(0, 0);
          expect(box.right).toBeCloseTo(pageWidth, 0);
        }

        await page.evaluate(() =>
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
        );
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
        await expect.poll(async () => Math.round((await edges(header)).top)).toBe(0);

        const horizontalOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(horizontalOverflow).toBeLessThanOrEqual(0);
      });
    }
  });
}
