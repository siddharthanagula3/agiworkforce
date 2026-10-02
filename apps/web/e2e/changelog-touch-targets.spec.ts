import { expect, test } from '@playwright/test';

const PHONE = { width: 390, height: 844 };
const MIN_TARGET_PX = 44;
const MAX_UNDERLINE_GAP_PX = 5;
const HIT_STEP_PX = 0.5;
const LEDGERS = ['Releases', 'Policy changes'];

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`/changelog ledger links on a touch screen, ${colorScheme} theme`, () => {
    test.use({ viewport: PHONE, hasTouch: true, isMobile: true, colorScheme });

    test('each link takes a 44px tap and draws its underline under its words', async ({ page }) => {
      const response = await page.goto('/changelog');
      expect(response?.status()).toBe(200);
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);

      for (const caption of LEDGERS) {
        const links = page.getByRole('list', { name: caption }).getByRole('link');
        const count = await links.count();
        expect(count, caption).toBeGreaterThan(0);

        for (let index = 0; index < count; index += 1) {
          const link = links.nth(index);
          const where = `${caption}: ${await link.textContent()}`;
          const geometry = await link.evaluate((node, step) => {
            node.scrollIntoView({ block: 'center' });
            const box = node.getBoundingClientRect();
            const x = box.left + box.width / 2;
            const hits = (y: number) => document.elementFromPoint(x, y)?.closest('a') === node;
            let top = box.top + step;
            let bottom = box.bottom - step;
            const inside = hits(top) && hits(bottom);
            while (hits(top - step)) top -= step;
            while (hits(bottom + step)) bottom += step;
            const words = document.createRange();
            words.selectNodeContents(node);
            const style = getComputedStyle(node);
            return {
              inside,
              tapHeight: bottom - top,
              underlineGap: box.bottom - words.getBoundingClientRect().bottom,
              underlineImage: style.backgroundImage,
              underlinePosition: style.backgroundPositionY,
            };
          }, HIT_STEP_PX);

          expect(geometry.inside, where).toBe(true);
          expect(geometry.underlineImage, where).toMatch(/^linear-gradient\(/);
          expect(geometry.underlinePosition, where).toBe('100%');
          expect(geometry.tapHeight, where).toBeGreaterThanOrEqual(MIN_TARGET_PX);
          expect(geometry.underlineGap, where).toBeLessThanOrEqual(MAX_UNDERLINE_GAP_PX);
        }
      }
    });
  });
}
