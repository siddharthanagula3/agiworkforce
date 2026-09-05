import { test, expect } from '@playwright/test';

const ROUTES = ['/', '/pricing', '/desktop', '/dev/landing-preview'];
const CONSENT_BANNER_SETTLE_MS = 2500;

test.use({ colorScheme: 'dark' });

test.describe('marketing pages do not scroll themselves after mount', () => {
  for (const route of ROUTES) {
    test(`${route} stays at scrollY 0 once the cookie banner appears`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(CONSENT_BANNER_SETTLE_MS);

      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });
  }
});
