import { expect, test } from '@playwright/test';

const APPROVED_HERO_FADE =
  /^linear-gradient\(rgb\(\d+, \d+, \d+\) 58%, rgba\(\d+, \d+, \d+, 0\) 100%\)$/u;

const routes = [
  '/web',
  '/desktop',
  '/cli',
  '/chrome-extension',
  '/vscode-extension',
  '/mobile',
  '/features/agents',
  '/features/artifacts',
  '/features/deep-research',
  '/features/memory',
  '/features/projects',
  '/features/ai-chat',
  '/enterprise',
] as const;

for (const profile of [
  { width: 320, theme: 'light' },
  { width: 1440, theme: 'dark' },
  { width: 1440, theme: 'light' },
  { width: 390, theme: 'dark' },
] as const) {
  test.describe(`restored illustrations at ${profile.width}px in ${profile.theme}`, () => {
    test.use({ viewport: { width: profile.width, height: 1000 }, colorScheme: profile.theme });
    for (const route of routes) {
      test(`${route} keeps contained previews at their design shape`, async ({ page }, info) => {
        await page.addInitScript((theme) => localStorage.setItem('theme', theme), profile.theme);
        expect((await page.goto(route))?.status()).toBe(200);
        await page.evaluate(() => document.fonts.ready);
        const frames = page.locator('main figure.agi-dev[data-geometry]');
        await expect(frames.first()).toBeVisible();
        expect(await frames.count()).toBeGreaterThan(0);
        const measurements = await frames.evaluateAll((elements) =>
          elements.map((element) => {
            const box = element.getBoundingClientRect();
            return {
              label: element.getAttribute('aria-label'),
              left: box.left,
              right: box.right,
              width: box.width,
              viewport: innerWidth,
              mask: getComputedStyle(element).maskImage,
              scaledPreview: element.classList.contains('agi-app'),
              heroPreview:
                element.closest(
                  '.agi-fl-hero-visual, .agi-lp-hero-stage, .agi-ds-pagehead-split',
                ) !== null,
              surfacePreview: element.closest('.agi-fl-surface-visual') !== null,
              height: box.height,
              geometry: element.getAttribute('data-geometry'),
              controls: Array.from(element.querySelectorAll('.agi-dev-send')).map((control) => ({
                width: control.getBoundingClientRect().width,
                height: control.getBoundingClientRect().height,
              })),
              segments: Array.from(element.querySelectorAll('.agi-mk-seg')).map(
                (segment) => segment.getBoundingClientRect().height,
              ),
            };
          }),
        );
        for (const frame of measurements) {
          expect(frame.width, frame.label ?? route).toBeGreaterThan(0);
          expect(frame.left, frame.label ?? route).toBeGreaterThanOrEqual(0);
          expect(frame.right, frame.label ?? route).toBeLessThanOrEqual(frame.viewport);
          if (frame.scaledPreview) {
            const [designWidth, designHeight] = (frame.geometry ?? '').split('x').map(Number);
            expect(designWidth, frame.label ?? route).toBeGreaterThan(0);
            expect(designHeight, frame.label ?? route).toBeGreaterThan(0);
            expect(
              Math.abs(frame.width / frame.height - designWidth! / designHeight!),
              frame.label ?? route,
            ).toBeLessThan(0.01);
            if (frame.surfacePreview || (frame.heroPreview && profile.width > 900))
              expect(frame.mask, frame.label ?? route).toMatch(APPROVED_HERO_FADE);
            else expect(frame.mask, frame.label ?? route).toBe('none');
          }
          for (const control of frame.controls) {
            expect(control.width).toBe(32);
            expect(control.height).toBe(32);
          }
          for (const segment of frame.segments) expect(segment).toBeLessThanOrEqual(36);
        }
        if (profile.width > 900) {
          const hero = page.locator('.agi-fl-hero-visual figure.agi-dev:not(.agi-app)');
          if (await hero.count()) {
            expect(
              await hero.first().evaluate((element) => getComputedStyle(element).maskImage),
            ).not.toBe('none');
          }
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
        ).toBeLessThanOrEqual(0);
        await info.attach('geometry', {
          body: JSON.stringify(measurements, null, 2),
          contentType: 'application/json',
        });
        await frames.first().scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            frames.first().evaluate((element) => {
              const unfinished = [];
              for (
                let ancestor: Element | null = element;
                ancestor;
                ancestor = ancestor.parentElement
              ) {
                if (Number(getComputedStyle(ancestor).opacity) < 1)
                  unfinished.push(ancestor.className);
              }
              return unfinished;
            }),
          )
          .toEqual([]);
        const capture = info.outputPath('restored-preview.png');
        await page.screenshot({ path: capture });
        await info.attach('restored preview', { path: capture, contentType: 'image/png' });
      });
    }
  });
}
