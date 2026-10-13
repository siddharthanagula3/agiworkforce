import { expect, test, type Locator, type Page } from '@playwright/test';

import { SUPPORT_WIDGET_ROUTE_PREFIXES } from '../features/support/lib/route-visibility';
import { helpArticlePath } from '../lib/support/help-paths';
import {
  COOKIE_CONSENT_STORAGE_KEY,
  NECESSARY_ONLY_PREFERENCES,
  buildCookieConsentRecord,
} from '../shared/lib/cookie-consent';

const ARTICLES = ['getting-started', 'billing-and-plans'] as const;
// 591x378 is 1182x757 at 200 percent zoom. 1157 is the narrowest width at which
// the round launcher floats beside the column and 1140 one at which it would
// lie over it, so the pair holds the width where it docks. 1116 is where the
// column stops growing, the tightest fit for the wider touch launcher.
const ARTICLE_SURFACES = [
  { width: 1182, height: 757, touch: false },
  { width: 1157, height: 757, touch: false },
  { width: 1140, height: 757, touch: false },
  { width: 1024, height: 768, touch: false },
  { width: 768, height: 1024, touch: false },
  { width: 390, height: 844, touch: false },
  { width: 591, height: 378, touch: false },
  { width: 1116, height: 800, touch: true },
  { width: 1024, height: 768, touch: true },
  { width: 768, height: 1024, touch: true },
  { width: 390, height: 844, touch: true },
] as const;
const ENTRY_SURFACES = [
  { width: 1182, height: 757, touch: false },
  { width: 390, height: 844, touch: false },
  { width: 390, height: 844, touch: true },
] as const;
// A4 at 96 dpi. Paper is narrower than the single-column breakpoint whatever
// the width of the window the article is printed from.
const PRINTED_PAGE = { width: 794, height: 1123 } as const;
const SCROLL_STOPS = ['top', 'middle', 'end'] as const;
const MINIMUM_TARGET_PX = 24;
const MINIMUM_TOUCH_TARGET_PX = 44;
const OVERLAP_TOLERANCE_PX = 0.5;

interface Surface {
  width: number;
  height: number;
  touch: boolean;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface HitTarget {
  box: Box;
  hitWidth: number;
  hitHeight: number;
  viewport: { width: number; height: number };
  coarsePointer: boolean;
}

interface LauncherMeasurement {
  launcher: Box;
  column: Box;
  textRectangles: number;
  covered: { text: string; box: Box }[];
  rootBackground: string;
  rowProbeInsideWidget: boolean;
}

function surfaceName(surface: Surface): string {
  return `${surface.width}x${surface.height}${surface.touch ? ' on a touch screen' : ''}`;
}

function minimumTarget(surface: Surface): number {
  return surface.touch ? MINIMUM_TOUCH_TARGET_PX : MINIMUM_TARGET_PX;
}

test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ([key, record]) => {
      window.localStorage.setItem(key, record);
    },
    [
      COOKIE_CONSENT_STORAGE_KEY,
      JSON.stringify(buildCookieConsentRecord(NECESSARY_ONLY_PREFERENCES)),
    ] as const,
  );
  await page.route('**/api/support/**', (route) => {
    const signedOut = route.request().url().includes('/api/support/account/context');
    return route.fulfill({
      status: signedOut ? 401 : 404,
      contentType: 'application/json',
      body: JSON.stringify(signedOut ? { error: 'unauthorized' } : {}),
    });
  });
});

async function openHelpPage(page: Page, path: string): Promise<Locator> {
  expect((await page.goto(path))?.status(), `${path} must be served`).toBe(200);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('region', { name: 'Cookie consent', exact: true })).toBeHidden();
  const launcher = page.getByRole('button', { name: 'Open product support', exact: true });
  await expect(launcher).toBeVisible();
  await expect(launcher).toHaveAttribute('aria-haspopup', 'dialog');
  return launcher;
}

async function scrollToStop(page: Page, stop: (typeof SCROLL_STOPS)[number]): Promise<void> {
  const fraction = stop === 'top' ? 0 : stop === 'middle' ? 0.5 : 1;
  await expect
    .poll(() =>
      page.evaluate((share) => {
        const scroller = document.documentElement;
        const target = Math.round((scroller.scrollHeight - scroller.clientHeight) * share);
        window.scrollTo({ top: target, behavior: 'instant' });
        return Math.abs(window.scrollY - target);
      }, fraction),
    )
    .toBeLessThanOrEqual(1);
}

// A box is not the area that answers a pointer: the last half pixel against a
// viewport edge does not hit-test, and a rounded corner or anything drawn on top
// takes its share. The spans are the longest unbroken runs through the centre.
function measureHitTarget(button: Element): HitTarget {
  const stepPx = 0.25;
  const bounds = button.getBoundingClientRect();
  const owns = (x: number, y: number) => {
    const hit = document.elementFromPoint(x, y);
    return hit !== null && button.contains(hit);
  };
  const longestRun = (from: number, to: number, owned: (position: number) => boolean) => {
    let longest = 0;
    let current = 0;
    for (let position = from + stepPx / 2; position < to; position += stepPx) {
      current = owned(position) ? current + stepPx : 0;
      longest = Math.max(longest, current);
    }
    return longest;
  };
  const centreX = (bounds.left + bounds.right) / 2;
  const centreY = (bounds.top + bounds.bottom) / 2;
  return {
    box: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom },
    hitWidth: longestRun(bounds.left, bounds.right, (x) => owns(x, centreY)),
    hitHeight: longestRun(bounds.top, bounds.bottom, (y) => owns(centreX, y)),
    viewport: { width: innerWidth, height: innerHeight },
    coarsePointer: matchMedia('(pointer: coarse)').matches,
  };
}

function measureLauncher(tolerance: number): LauncherMeasurement {
  const widget = document.querySelector('[data-support-widget]');
  const launcher = widget?.querySelector('button[aria-haspopup="dialog"]');
  const column = document.querySelector('main#main-content article');
  if (!widget || !launcher || !column) {
    throw new Error('The help article or its support launcher is absent');
  }
  const launcherBox = launcher.getBoundingClientRect();
  const columnBox = column.getBoundingClientRect();
  const covered: { text: string; box: Box }[] = [];
  let textRectangles = 0;
  const walker = document.createTreeWalker(column, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    const text = node.textContent?.trim().replace(/\s+/gu, ' ');
    if (!parent || !text) continue;
    const style = getComputedStyle(parent);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    const clip = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    for (let element: Element | null = parent; element; element = element.parentElement) {
      const overflow = getComputedStyle(element);
      if (overflow.overflowX === 'visible' && overflow.overflowY === 'visible') continue;
      const bounds = element.getBoundingClientRect();
      clip.left = Math.max(clip.left, bounds.left);
      clip.top = Math.max(clip.top, bounds.top);
      clip.right = Math.min(clip.right, bounds.right);
      clip.bottom = Math.min(clip.bottom, bounds.bottom);
    }
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      const box = {
        left: Math.max(rect.left, clip.left),
        top: Math.max(rect.top, clip.top),
        right: Math.min(rect.right, clip.right),
        bottom: Math.min(rect.bottom, clip.bottom),
      };
      if (box.right <= box.left || box.bottom <= box.top) continue;
      textRectangles += 1;
      const overlapX =
        Math.min(box.right, launcherBox.right) - Math.max(box.left, launcherBox.left);
      const overlapY =
        Math.min(box.bottom, launcherBox.bottom) - Math.max(box.top, launcherBox.top);
      if (overlapX > tolerance && overlapY > tolerance) {
        covered.push({ text: text.slice(0, 60), box });
      }
    }
  }
  const rowProbe = document.elementFromPoint(
    Math.max(columnBox.left, 0) + 8,
    (launcherBox.top + launcherBox.bottom) / 2,
  );
  return {
    launcher: {
      left: launcherBox.left,
      top: launcherBox.top,
      right: launcherBox.right,
      bottom: launcherBox.bottom,
    },
    column: {
      left: columnBox.left,
      top: columnBox.top,
      right: columnBox.right,
      bottom: columnBox.bottom,
    },
    textRectangles,
    covered,
    rootBackground: getComputedStyle(widget).backgroundColor,
    rowProbeInsideWidget: rowProbe !== null && widget.contains(rowProbe),
  };
}

function expectUsableTarget(target: HitTarget, surface: Surface): void {
  const minimum = minimumTarget(surface);
  expect(target.coarsePointer, 'the pointer the page reports').toBe(surface.touch);
  expect(target.box.right - target.box.left, 'launcher width').toBeGreaterThanOrEqual(minimum);
  expect(target.box.bottom - target.box.top, 'launcher height').toBeGreaterThanOrEqual(minimum);
  expect(target.hitWidth, 'launcher width that answers a pointer').toBeGreaterThanOrEqual(minimum);
  expect(target.hitHeight, 'launcher height that answers a pointer').toBeGreaterThanOrEqual(
    minimum,
  );
  expect(target.box.left, 'launcher left edge inside the viewport').toBeGreaterThanOrEqual(0);
  expect(target.box.top, 'launcher top edge inside the viewport').toBeGreaterThanOrEqual(0);
  expect(target.box.right, 'launcher right edge inside the viewport').toBeLessThanOrEqual(
    target.viewport.width,
  );
  expect(target.box.bottom, 'launcher bottom edge inside the viewport').toBeLessThanOrEqual(
    target.viewport.height,
  );
}

async function expectLauncherOpensSupport(
  page: Page,
  launcher: Locator,
  surface: Surface,
): Promise<void> {
  if (surface.touch) await launcher.tap();
  else await launcher.click();
  const dialog = page.getByRole('dialog', { name: 'Product support', exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(launcher).toBeFocused();
  await expect(launcher).toHaveAttribute('aria-expanded', 'false');
  const ring = await launcher.evaluate((button) => {
    const style = getComputedStyle(button);
    const box = button.getBoundingClientRect();
    const reach = Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset);
    return {
      drawn: button.matches(':focus-visible') && style.outlineStyle !== 'none',
      width: Number.parseFloat(style.outlineWidth),
      left: box.left - reach,
      top: box.top - reach,
      right: box.right + reach,
      bottom: box.bottom + reach,
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  expect(ring.drawn, 'the launcher shows a focus ring after Escape').toBe(true);
  expect(ring.width, 'focus ring width').toBeGreaterThan(0);
  expect(ring.left, 'focus ring left edge inside the viewport').toBeGreaterThanOrEqual(0);
  expect(ring.top, 'focus ring top edge inside the viewport').toBeGreaterThanOrEqual(0);
  expect(ring.right, 'focus ring right edge inside the viewport').toBeLessThanOrEqual(
    ring.viewport.width,
  );
  expect(ring.bottom, 'focus ring bottom edge inside the viewport').toBeLessThanOrEqual(
    ring.viewport.height,
  );
}

for (const article of ARTICLES) {
  for (const surface of ARTICLE_SURFACES) {
    test.describe(`${article} at ${surfaceName(surface)}`, () => {
      test.use({
        viewport: { width: surface.width, height: surface.height },
        hasTouch: surface.touch,
      });

      test('the support launcher covers no article text at the top, middle or end', async ({
        page,
      }) => {
        const launcher = await openHelpPage(page, helpArticlePath(article));

        for (const stop of SCROLL_STOPS) {
          await scrollToStop(page, stop);
          const measurement = await page.evaluate(measureLauncher, OVERLAP_TOLERANCE_PX);
          expect(
            measurement.textRectangles,
            `the article must have text to measure at the ${stop}`,
          ).toBeGreaterThan(0);
          expectUsableTarget(await launcher.evaluate(measureHitTarget), surface);
          // Which line sits under the launcher at one scroll position depends on
          // how the article wraps; sharing no horizontal span with the column is
          // what holds for every line at every position.
          expect(
            measurement.launcher.left,
            `at the ${stop} the launcher must sit beside the article column, not over it`,
          ).toBeGreaterThanOrEqual(measurement.column.right - OVERLAP_TOLERANCE_PX);
          expect(measurement.covered, `article text under the launcher at the ${stop}`).toEqual([]);
          expect(
            measurement.rootBackground,
            'the widget container must not paint over the page',
          ).toMatch(/^(?:transparent|rgba\(0, 0, 0, 0\))$/u);
          expect(
            measurement.rowProbeInsideWidget,
            `at the ${stop} the launcher's row must belong to the page, not the widget container`,
          ).toBe(false);
        }

        await expectLauncherOpensSupport(page, launcher, surface);
      });
    });
  }
}

for (const touch of [false, true]) {
  test.describe(`a help article printed from ${touch ? 'a touch screen' : 'a desktop'}`, () => {
    test.use({ viewport: PRINTED_PAGE, hasTouch: touch });

    test('prints at full width, without the launcher or the gutter kept for it', async ({
      page,
    }) => {
      const launcher = await openHelpPage(page, helpArticlePath(ARTICLES[0]));
      const main = page.locator('main#main-content');
      const gutter = await main.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).paddingRight),
      );
      expect(gutter, 'on screen the article keeps a gutter for the launcher').toBeGreaterThan(
        minimumTarget({ ...PRINTED_PAGE, touch }),
      );
      await page.emulateMedia({ media: 'print' });
      await expect(launcher).not.toBeVisible();
      await expect(main).toHaveCSS('padding-right', '0px');
    });
  });
}

for (const route of SUPPORT_WIDGET_ROUTE_PREFIXES) {
  for (const surface of ENTRY_SURFACES) {
    test.describe(`${route} at ${surfaceName(surface)}`, () => {
      test.use({
        viewport: { width: surface.width, height: surface.height },
        hasTouch: surface.touch,
      });

      test('the support launcher is a named, usable target that opens support', async ({
        page,
      }) => {
        const launcher = await openHelpPage(page, route);
        expectUsableTarget(await launcher.evaluate(measureHitTarget), surface);
        await expectLauncherOpensSupport(page, launcher, surface);
      });
    });
  }
}
