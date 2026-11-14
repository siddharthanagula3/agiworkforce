import { expect, test } from '@playwright/test';
import { signIn } from './qa-capability-harness';

/**
 * A phone browser shows less height than the phone has: its own bars take a
 * share. The Code home is taller than what is left, and without a scroll of
 * its own its usage card was drawn underneath the composer.
 */

const SHORT_SCREENS = [
  { width: 320, height: 568 },
  { width: 390, height: 664 },
] as const;

test.describe('Code home on a short phone screen', () => {
  test.use({ reducedMotion: 'reduce' } as never);

  for (const viewport of SHORT_SCREENS) {
    test(`keeps the home content clear of the composer at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await signIn(page);
      await page.setViewportSize(viewport);
      await page.goto('/code', { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('code-home')).toBeVisible();
      await expect(page.getByTestId('code-composer-area')).toBeVisible();
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);

      const measured = await page.evaluate(() => {
        const home = document.querySelector('[data-testid="code-home"]')!;
        const notices = document.querySelector('[data-testid="code-notices"]');
        const composer = document.querySelector('[data-testid="code-composer-area"]')!;
        return {
          overflowY: getComputedStyle(home).overflowY,
          homeBottom: Math.round(home.getBoundingClientRect().bottom),
          nextTop: Math.round((notices ?? composer).getBoundingClientRect().top),
          composerBottom: Math.round(composer.getBoundingClientRect().bottom),
          viewportHeight: window.innerHeight,
        };
      });
      const context = JSON.stringify(measured);

      expect(['auto', 'scroll'], context).toContain(measured.overflowY);
      expect(measured.homeBottom, context).toBeLessThanOrEqual(measured.nextTop + 1);
      expect(measured.composerBottom, context).toBeLessThanOrEqual(measured.viewportHeight);
    });
  }
});
