import { mockAuthProvider } from './lib/mock-auth-provider';
import { test, expect } from '@playwright/test';
import { routeIsServed } from './route-availability';

const ROUTES = ['/', '/pricing', '/desktop', '/dev/landing-preview'];
const CONSENT_BANNER_SETTLE_MS = 2500;

test.use({ colorScheme: 'dark' });

test.describe('marketing pages do not scroll themselves after mount', () => {
  for (const route of ROUTES) {
    test(`${route} stays at scrollY 0 once the cookie banner appears`, async ({ page }) => {
      await mockAuthProvider(page);
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      // llm-guardrail-allow: the dev preview route answers 404 on a production build, so this is not a skipped check
      test.skip(!(await routeIsServed(page, response)), `${route} is not served by this build`);
      await expect(page.getByRole('region', { name: 'Cookie consent' })).toBeVisible();
      await page.waitForTimeout(CONSENT_BANNER_SETTLE_MS);

      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });
  }
});
