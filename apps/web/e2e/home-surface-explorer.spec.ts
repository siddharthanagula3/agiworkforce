import { expect, test } from '@playwright/test';

const surfaces = [
  ['AGI Desktop', '/desktop'],
  ['AGI Web', '/web'],
  ['AGI CLI', '/cli'],
  ['AGI in Chrome', '/chrome-extension'],
  ['AGI in VS Code', '/vscode-extension'],
  ['AGI Mobile', '/mobile'],
] as const;

for (const theme of ['dark', 'light'] as const) {
  for (const width of [320, 390, 1180]) {
    test.describe(`homepage surface previews at ${width}px in ${theme}`, () => {
      test.use({
        viewport: { width, height: 844 },
        colorScheme: theme,
        reducedMotion: 'no-preference',
      });

      test('follows scrolling down and back up, with inline phone previews', async ({
        page,
      }, info) => {
        await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
        expect((await page.goto('/'))?.status()).toBe(200);
        await page.evaluate(() => document.fonts.ready);
        const deck = page.getByRole('group', { name: 'The six surfaces', exact: true });
        const steps = deck.locator('[data-deck-marker]');
        await expect(steps).toHaveCount(surfaces.length);
        if (width > 900) await expect(deck).toHaveAttribute('data-pinned', 'true');
        else await expect(deck).not.toHaveAttribute('data-pinned', 'true');
        for (const index of [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0]) {
          const step = steps.nth(index);
          const [name, href] = surfaces[index]!;
          await expect(step.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
          await step.evaluate((element) =>
            element.scrollIntoView({ block: 'center', behavior: 'instant' }),
          );
          if (width > 900) {
            await expect(step).toHaveAttribute('data-active', 'true');
            await expect(deck.locator('.agi-mx-deck-card').nth(index)).toHaveAttribute(
              'data-active',
              'true',
            );
            await expect(deck.locator('.agi-mx-deck-inline')).toHaveCount(0);
          } else {
            const preview = step.locator('.agi-mx-deck-inline figure.agi-dev');
            await expect(preview).toHaveCount(1);
            const dimensions = await preview.evaluate((element) => {
              const rect = element.getBoundingClientRect();
              return {
                left: rect.left,
                right: rect.right,
                width: rect.width,
                viewport: innerWidth,
              };
            });
            expect(dimensions.width).toBeGreaterThan(0);
            expect(dimensions.left).toBeGreaterThanOrEqual(0);
            expect(dimensions.right).toBeLessThanOrEqual(dimensions.viewport);
          }
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
          ).toBeLessThanOrEqual(0);
        }
        if (width > 900)
          await expect(deck.locator('.agi-mx-deck-card[data-active="true"]')).toHaveCSS(
            'opacity',
            '1',
          );
        const capture = info.outputPath('restored-surface-scroll.png');
        await page.screenshot({ path: capture });
        await info.attach('restored preview', { path: capture, contentType: 'image/png' });
      });
    });
  }
}
