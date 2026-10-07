import { expect, test } from '@playwright/test';
import { routeIsServed } from './route-availability';

const STUDIES = [
  '/dev/frame-1',
  '/dev/frame-2',
  '/dev/frame-3',
  '/dev/frame-4',
  '/dev/frame-5',
  '/dev/frame-6',
  '/dev/landing-1',
  '/dev/landing-2',
  '/dev/landing-3',
  '/dev/landing-next',
  '/dev/landing-options',
  '/dev/mockup-fidelity',
  '/dev/review',
  '/dev/review/web',
] as const;

test.describe('design study pages', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' } as never);
  for (const route of STUDIES) {
    test(`${route} renders its study without a script error or sideways scroll`, async ({
      page,
    }) => {
      const scriptErrors: string[] = [];
      page.on('pageerror', (error) => scriptErrors.push(error.message));
      const response = await page.goto(route);
      // llm-guardrail-allow: the dev study routes answer 404 on a production build, so this is not a skipped check
      test.skip(!(await routeIsServed(page, response)), `${route} is not served by this build`);
      expect(response?.status()).toBe(200);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByRole('heading').first()).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(0);
      expect(scriptErrors).toEqual([]);
    });
  }
});
