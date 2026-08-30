import { test, expect } from '@playwright/test';

import { signIn } from './qa-capability-harness';

/**
 * Real user-supplied strings are not polite. A flex child without min-width
 * refuses to shrink below its content, so one long file name or project title
 * pushes the row's controls out of view instead of ellipsing.
 */
const LONG_WORD = 'A'.repeat(180);
const LONG_URL = `https://example.com/${'segment-'.repeat(30)}end`;

test.describe('long content does not break layout', () => {
  test.setTimeout(12 * 60_000);
  test.use({ reducedMotion: 'reduce' } as never);

  for (const viewport of [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'desktop', width: 1440, height: 900 },
  ]) {
    test(`injected long strings never widen the page at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page);
      await page.goto('/chat/projects', { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(900);

      // Push extreme text into every element that renders a user-supplied
      // string, then measure whether the document grew wider than the viewport.
      const overflow = await page.evaluate(
        ({ word, url }) => {
          const targets = Array.from(
            document.querySelectorAll<HTMLElement>('h1, h2, h3, p, span, td, li'),
          ).filter((el) => {
            const text = (el.textContent ?? '').trim();
            return text.length > 0 && text.length < 80 && el.children.length === 0;
          });
          let injected = 0;
          for (const el of targets.slice(0, 40)) {
            el.textContent = injected % 2 === 0 ? word : url;
            injected += 1;
          }
          const doc = document.documentElement;
          const offenders: string[] = [];
          for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.right <= doc.clientWidth + 1) continue;
            const style = getComputedStyle(el);
            if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue;
            if (style.position === 'fixed') continue;
            const id = `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 3).join('.')}`;
            if (!offenders.includes(id)) offenders.push(id);
            if (offenders.length >= 6) break;
          }
          return {
            injected,
            scrollWidth: doc.scrollWidth,
            clientWidth: doc.clientWidth,
            overflowBy: Math.max(0, doc.scrollWidth - doc.clientWidth),
            offenders,
          };
        },
        { word: LONG_WORD, url: LONG_URL },
      );

      // A test that injected nothing would pass trivially.
      expect(overflow.injected, 'no user-supplied strings were found to stress').toBeGreaterThan(5);
      expect(
        overflow.overflowBy,
        `page scrolls horizontally by ${overflow.overflowBy}px after long strings: ${overflow.offenders.join(', ')}`,
      ).toBeLessThanOrEqual(1);
    });
  }
});
