import { test, expect } from '@playwright/test';

import { signIn } from './qa-capability-harness';

const VIEWPORTS = [
  { width: 375, height: 812, name: 'phone' },
  { width: 768, height: 1024, name: 'tablet' },
  { width: 1280, height: 800, name: 'laptop' },
  { width: 1920, height: 1080, name: 'desktop' },
];

const LONG_URL = `https://example.com/${'a'.repeat(380)}`;
const LONG_TOKEN = 'x'.repeat(300);
const LONG_PROSE = 'The transcript column has to hold a long answer. '.repeat(210);
const MARKDOWN_TABLE = [
  '| column one | column two | column three |',
  '| --- | --- | --- |',
  `| ${LONG_TOKEN} | ${LONG_URL} | third |`,
].join('\n');

const LARGE_JSON = [
  'Echo this request back:',
  '```json',
  JSON.stringify(
    {
      query: LONG_TOKEN,
      url: LONG_URL,
      payload: Object.fromEntries(
        Array.from({ length: 40 }, (_, index) => [`field_${index}`, `${LONG_TOKEN}-${index}`]),
      ),
    },
    null,
    2,
  ),
  '```',
].join('\n');

const PROBES = [LONG_PROSE, LONG_URL, LONG_TOKEN, MARKDOWN_TABLE, LARGE_JSON];

// A row wider than the column is clipped by one ancestor `overflow-hidden`, so
// the document rarely grows; measure the column and the document both.
async function documentOverflow(page: import('@playwright/test').Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    widestRow: Math.max(
      0,
      ...Array.from(document.querySelectorAll('.message-inner')).map((element) => {
        const parent = element.parentElement;
        return parent ? element.scrollWidth - parent.clientWidth : 0;
      }),
    ),
  }));
}

test.describe('the transcript never widens the page', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const viewport of VIEWPORTS) {
    test(`content with no break opportunity stays inside the column at ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/chat');

      const composer = page.getByRole('textbox').first();
      await expect(composer).toBeVisible({ timeout: 20000 });

      for (const probe of PROBES) {
        await composer.fill(probe);
        await composer.press('Enter');
        await expect(page.locator('.message-inner').last()).toBeVisible({ timeout: 30000 });

        const measured = await documentOverflow(page);
        expect(
          measured.scrollWidth,
          `${viewport.name}: document grew past the viewport`,
        ).toBeLessThanOrEqual(measured.clientWidth);
        expect(
          measured.widestRow,
          `${viewport.name}: a message row outgrew its column`,
        ).toBeLessThanOrEqual(0);
      }
    });
  }
});
