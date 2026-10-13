import { expect, test } from '@playwright/test';

import {
  COOKIE_CONSENT_STORAGE_KEY,
  NECESSARY_ONLY_PREFERENCES,
  buildCookieConsentRecord,
} from '../shared/lib/cookie-consent';

for (const width of [320, 1440]) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`provider statistics at ${width}px in ${theme}`, () => {
      test.use({
        viewport: { width, height: 900 },
        colorScheme: theme,
        reducedMotion: 'reduce',
        storageState: { cookies: [], origins: [] },
      });

      test('definition-list groups retain the visual value, label and note order', async ({
        page,
      }) => {
        await page.addInitScript(([key, record]) => window.localStorage.setItem(key, record), [
          COOKIE_CONSENT_STORAGE_KEY,
          JSON.stringify(buildCookieConsentRecord(NECESSARY_ONLY_PREFERENCES)),
        ] as const);
        expect((await page.goto('/providers'))?.status()).toBe(200);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

        const band = page.locator('dl.agi-ds-stats[aria-label="The catalogue in numbers"]');
        await expect(band).toBeVisible();
        await band.scrollIntoViewIfNeeded();
        await expect(band.locator(':scope > div')).toHaveCount(4);
        await expect(band.locator('.agi-ds-stat-note')).toHaveCount(1);

        const groups = await band.evaluate((list) =>
          Array.from(list.children).map((group) =>
            Array.from(group.children).map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                tag: element.tagName,
                text: element.textContent?.trim(),
                top: rect.top,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
              };
            }),
          ),
        );

        for (const group of groups) {
          expect(group.map((element) => element.tag)).toEqual(
            group.length === 3 ? ['DT', 'DD', 'DD'] : ['DT', 'DD'],
          );
          for (const element of group) {
            expect(element.text).toBeTruthy();
            expect(element.width).toBeGreaterThan(0);
            expect(element.height).toBeGreaterThan(0);
          }
          const [label, value, note] = group;
          expect(value!.bottom).toBeLessThan(label!.top);
          if (note) expect(label!.bottom).toBeLessThan(note.top);
        }
      });
    });
  }
}
