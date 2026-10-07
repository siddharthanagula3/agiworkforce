import { expect, test, type Locator, type Page } from '@playwright/test';

const ROUTE = '/get-started';
const PRIMARY_ACTION = 'Try AGI Web';
const PRIMARY_HREF = '/login?redirectTo=%2F';
const FIRST_STEP = '1. Open AGI Web.';
const LAST_STEP = '3. Send a message.';
const SUBPIXEL_TOLERANCE_PX = 1;

const DESKTOP = { width: 1180, height: 757 };
const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];

interface Box {
  top: number;
  bottom: number;
}

async function open(page: Page) {
  const response = await page.goto(ROUTE);
  expect(response?.status()).toBe(200);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const main = page.locator('#main-content');
  return {
    action: main.getByRole('link', { name: PRIMARY_ACTION, exact: true }).first(),
    firstStep: main.getByText(FIRST_STEP, { exact: true }),
    lastStep: main.getByText(LAST_STEP, { exact: true }),
  };
}

async function box(locator: Locator, name: string): Promise<Box> {
  const bounds = await locator.boundingBox();
  expect(bounds, `${name} is not rendered`).not.toBeNull();
  return { top: bounds!.y, bottom: bounds!.y + bounds!.height };
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function expectInFirstViewport(locator: Locator, name: string, height: number) {
  const bounds = await box(locator, name);
  expect(bounds.top, `${name} starts on screen`).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom, `${name} ends above the fold`).toBeLessThanOrEqual(
    height + SUBPIXEL_TOLERANCE_PX,
  );
}

test.describe(`${ROUTE} first screen at ${DESKTOP.width} by ${DESKTOP.height}`, () => {
  test.use({ viewport: DESKTOP });

  test('shows Try AGI Web and the three-step live path without scrolling', async ({ page }) => {
    const first = await open(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await expect(first.action).toHaveAttribute('href', PRIMARY_HREF);
    await expectInFirstViewport(first.action, 'Try AGI Web', DESKTOP.height);
    await expectInFirstViewport(first.firstStep, 'first step', DESKTOP.height);
    await expectInFirstViewport(first.lastStep, 'last step', DESKTOP.height);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});

for (const viewport of PHONES) {
  test.describe(`${ROUTE} at ${viewport.width} wide`, () => {
    test.use({ viewport });

    test('shows Try AGI Web in the first screen with no horizontal scroll', async ({ page }) => {
      const first = await open(page);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);

      await expect(first.action).toHaveAttribute('href', PRIMARY_HREF);
      await expectInFirstViewport(first.action, 'Try AGI Web', viewport.height);
      const action = await box(first.action, 'Try AGI Web');
      const firstStep = await box(first.firstStep, 'first step');
      expect(firstStep.top, 'the live path stacks under the action').toBeGreaterThanOrEqual(
        action.bottom - SUBPIXEL_TOLERANCE_PX,
      );
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}

for (const width of [320, 390]) {
  test.describe(`public coded mockups at ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    for (const route of [
      '/',
      '/web',
      '/cli',
      '/mobile',
      '/features',
      '/features/tools',
      '/enterprise',
      '/solutions',
      '/api-docs',
      '/byok',
      '/teams',
    ]) {
      test(`${route} fits each visible device inside its viewport and clipping containers`, async ({
        page,
      }) => {
        const response = await page.goto(route);
        expect(response?.status()).toBe(200);
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all(
            document
              .getAnimations()
              .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
              .map((animation) => animation.finished.catch(() => undefined)),
          );
        });

        let inspected = 0;
        for (const preview of await page
          .locator(
            '.agi-dev, .agi-ds-codetabs, .agi-lp-console, .agi-lp-terminal, .agi-dw, .agi-ap',
          )
          .all()) {
          if (!(await preview.isVisible())) continue;
          await preview.scrollIntoViewIfNeeded();
          const measured = await preview.evaluate((device) => {
            const rect = device.getBoundingClientRect();
            const clips: string[] = [];
            let ancestor = device.parentElement;
            while (ancestor) {
              const style = getComputedStyle(ancestor);
              const bounds = ancestor.getBoundingClientRect();
              if (
                /^(hidden|clip)$/.test(style.overflowX) &&
                (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)
              ) {
                clips.push(ancestor.className);
              }
              ancestor = ancestor.parentElement;
            }
            return {
              left: rect.left,
              right: rect.right,
              width: rect.width,
              height: rect.height,
              viewport: document.documentElement.clientWidth,
              clips,
            };
          });
          expect(measured.width).toBeGreaterThan(0);
          expect(measured.height).toBeGreaterThan(0);
          expect(measured.left).toBeGreaterThanOrEqual(-SUBPIXEL_TOLERANCE_PX);
          expect(measured.right).toBeLessThanOrEqual(measured.viewport + SUBPIXEL_TOLERANCE_PX);
          expect(measured.clips).toEqual([]);
          inspected += 1;
        }
        expect(inspected, 'the route must render a coded device preview').toBeGreaterThan(0);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      });
    }
  });
}
