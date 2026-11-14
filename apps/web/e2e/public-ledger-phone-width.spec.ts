import { expect, test } from '@playwright/test';

/**
 * A table never gets narrower than its longest unbreakable run of text. One
 * file path in a cell made this table wider than a phone, and the page clipped
 * what stuck out, so the text was cut off with nothing to scroll.
 */

const ROUTES = ['/chrome-extension', '/cli', '/desktop', '/business'] as const;
const PHONE_WIDTHS = [390, 320] as const;
const LEDGER = 'table.agi-ledger';

test.describe('key and value tables on public pages at phone width', () => {
  test.use({ reducedMotion: 'reduce' } as never);

  for (const route of ROUTES) {
    test(`${route} keeps its table inside the page`, async ({ page }) => {
      for (const width of PHONE_WIDTHS) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await expect(page.locator(LEDGER)).not.toHaveCount(0);
        await page.waitForFunction(() => document.fonts.status === 'loaded');

        const measured = await page.locator(LEDGER).evaluateAll((tables) =>
          tables.map((table) => {
            const parent = table.parentElement ?? table;
            const style = getComputedStyle(parent);
            const contentRight =
              parent.getBoundingClientRect().right -
              parseFloat(style.paddingRight) -
              parseFloat(style.borderRightWidth);
            return {
              tableRight: Math.round(table.getBoundingClientRect().right),
              contentRight: Math.round(contentRight),
              viewport: document.documentElement.clientWidth,
              page: document.documentElement.scrollWidth,
            };
          }),
        );

        for (const table of measured) {
          const context = `${route} at ${width}: ${JSON.stringify(table)}`;
          expect(table.tableRight, context).toBeLessThanOrEqual(table.contentRight + 1);
          expect(table.tableRight, context).toBeLessThanOrEqual(table.viewport);
          expect(table.page, context).toBeLessThanOrEqual(table.viewport);
        }
      }
    });
  }
});
