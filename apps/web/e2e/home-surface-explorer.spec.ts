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
            await expect
              .poll(() =>
                deck
                  .locator('.agi-mx-deck-card:not([data-active="true"])')
                  .evaluateAll((cards) => cards.map((card) => getComputedStyle(card).opacity)),
              )
              .toEqual(Array(surfaces.length - 1).fill('0'));
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
        if (width > 900) {
          await expect(deck.locator('.agi-mx-deck-card[data-active="true"]')).toHaveCSS(
            'opacity',
            '1',
          );
          const windowHeights = await deck
            .locator('.agi-mx-deck-card figure.agi-app:not(.agi-app--phone) .agi-app-window')
            .evaluateAll((shells) => shells.map((shell) => (shell as HTMLElement).offsetHeight));
          expect(windowHeights).toHaveLength(surfaces.length - 1);
          expect(new Set(windowHeights).size).toBe(1);
          expect(windowHeights[0]).toBeLessThanOrEqual(844 - 14 * 16);
        }
        const capture = info.outputPath('restored-surface-scroll.png');
        await page.screenshot({ path: capture });
        await info.attach('restored preview', { path: capture, contentType: 'image/png' });
      });
    });
  }
}

for (const width of [390, 1180]) {
  test(`homepage keeps the surface deck height it was served at ${width}px`, async ({
    browser,
  }) => {
    const measure = async (hydrate: boolean) => {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        reducedMotion: 'no-preference',
      });
      try {
        const page = await context.newPage();
        if (!hydrate) await page.route(/\.js(?:\?|$)/u, (route) => route.abort());
        expect((await page.goto('/', { waitUntil: 'domcontentloaded' }))?.status()).toBe(200);
        const deck = page.getByRole('group', { name: 'The six surfaces', exact: true });
        await expect(deck).toBeVisible();
        const isHydrated = () =>
          deck.evaluate((element) =>
            Object.keys(element).some((key) => key.startsWith('__reactFiber$')),
          );
        if (hydrate) {
          await expect.poll(isHydrated).toBe(true);
          if (width > 900) await expect(deck).toHaveAttribute('data-pinned', 'true');
        }
        await page.evaluate(() => document.fonts.ready);
        return {
          height: await deck.evaluate((element) =>
            Math.round(element.getBoundingClientRect().height),
          ),
          hydrated: await isHydrated(),
        };
      } finally {
        await context.close();
      }
    };
    const served = await measure(false);
    const hydrated = await measure(true);
    expect(served.hydrated).toBe(false);
    expect(hydrated.hydrated).toBe(true);
    expect(Math.abs(served.height - hydrated.height)).toBeLessThanOrEqual(2);
  });
}
