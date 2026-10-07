import { expect, test, type Locator, type Page } from '@playwright/test';

import { deepEqual, rejects } from 'node:assert/strict';

import { readFileSync } from 'node:fs';

import {
  FOOTER_MAX_HEIGHT_PX,
  equalFooterState,
  footerCaptureFixture,
  footerFocusReturn,
  footerLegacyRules,
  footerNativeImages,
  footerNativeState,
  matchingFooterMaterial,
  stableFooterState,
} from './lib/public-footer-capture';
import { mockAuthProvider } from './lib/mock-auth-provider';

test.use({ storageState: { cookies: [], origins: [] } });

const SKIP_TARGET_ID = 'main-content';
const FOCUSABLE_MAIN_ROUTES = [
  '/',
  '/desktop',
  '/mobile',
  '/web',
  '/cli',
  '/chrome-extension',
  '/vscode-extension',
  '/pricing',
  '/business',
  '/agi-code',
  '/docs/byok-env',
  '/api-docs',
];
const ID_ONLY_MAIN_ROUTES = ['/customers', '/enterprise', '/partners', '/teams'];
const LAYOUT_ROUTES = ['/', '/desktop', '/pricing', '/docs/byok-env'];
const VIEWPORTS = [
  { width: 1180, height: 757 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];
const FOOTER_ROUTE = '/pricing';
const FOOTER_TABLET_VIEWPORT = { width: 900, height: 800 };
const FOOTER_COLUMNS_BY_WIDTH = [
  { viewport: VIEWPORTS[0]!, columns: 5 },
  { viewport: FOOTER_TABLET_VIEWPORT, columns: 3 },
  { viewport: VIEWPORTS[1]!, columns: 2 },
  { viewport: VIEWPORTS[2]!, columns: 2 },
];

const requestedRoutes = process.env['LANDMARK_ROUTES']?.split(',').filter(Boolean);
const selected = (routes: readonly string[]): readonly string[] =>
  requestedRoutes ? routes.filter((route) => requestedRoutes.includes(route)) : routes;

const edges = (locator: Locator) =>
  locator.evaluate((element) => {
    const { left, right, top } = element.getBoundingClientRect();
    return { left, right, top };
  });

test.describe('the skip link reaches the main landmark on every public template', () => {
  for (const route of selected([...FOCUSABLE_MAIN_ROUTES, ...ID_ONLY_MAIN_ROUTES])) {
    test(`${route} skip link moves keyboard navigation past the header`, async ({ page }) => {
      await mockAuthProvider(page);
      await page.goto(route);

      const main = page.getByRole('main');
      await expect(main).toHaveCount(1);
      await expect(main).toHaveAttribute('id', SKIP_TARGET_ID);
      await expect(page.getByRole('banner')).toHaveCount(1);
      await expect(page.getByRole('contentinfo')).toHaveCount(1);

      await page.keyboard.press('Tab');
      const skipLink = page.getByRole('link', { name: 'Skip to main content', exact: true });
      await expect(skipLink).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`#${SKIP_TARGET_ID}$`));
      if (FOCUSABLE_MAIN_ROUTES.includes(route)) await expect(main).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(main.locator(':focus')).toHaveCount(1);
    });
  }
});

for (const viewport of VIEWPORTS) {
  test.describe(`site header and footer span the page at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    for (const route of selected(LAYOUT_ROUTES)) {
      test(`${route} keeps the header and footer full width and the header stuck`, async ({
        page,
      }) => {
        await mockAuthProvider(page);
        await page.goto(route);

        const header = page.getByRole('banner');
        const footer = page.getByRole('contentinfo');
        await expect(header).toHaveCount(1);
        await expect(footer).toHaveCount(1);

        const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);
        for (const chrome of [header, footer]) {
          const box = await edges(chrome);
          expect(box.left).toBeCloseTo(0, 0);
          expect(box.right).toBeCloseTo(pageWidth, 0);
        }

        await page.evaluate(() =>
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
        );
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
        await expect.poll(async () => Math.round((await edges(header)).top)).toBe(0);

        const horizontalOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(horizontalOverflow).toBeLessThanOrEqual(0);
      });
    }
  });
}

for (const { viewport, columns } of FOOTER_COLUMNS_BY_WIDTH) {
  test.describe(`the shared footer reflows at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    for (const route of selected([FOOTER_ROUTE])) {
      test(`${route} footer stays compact and every link stays inside the viewport`, async ({
        page,
      }) => {
        await mockAuthProvider(page);
        await page.goto(route);

        const footer = page.getByRole('contentinfo');
        await expect(footer).toHaveCount(1);
        await expect(footer.locator('.agi-ds-footer-watermark')).toHaveCount(0);

        const trackCount = await footer
          .getByRole('navigation', { name: 'Footer' })
          .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
        expect(trackCount).toBe(columns);

        if (viewport.width >= 1024) {
          const footerHeight = await footer.evaluate(
            (element) => element.getBoundingClientRect().height,
          );
          expect(footerHeight).toBeLessThanOrEqual(FOOTER_MAX_HEIGHT_PX);

          const wordmarkType = (locator: Locator) =>
            locator.evaluate((element) => {
              const { fontFamily, fontWeight, fontSize } = getComputedStyle(element);
              return { fontFamily, fontWeight, fontSize };
            });
          expect(await wordmarkType(footer.locator('.agi-ds-footer-wordmark'))).toEqual(
            await wordmarkType(page.getByRole('banner').locator('.agi-ds-wordmark')),
          );
        }

        const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);
        const linkBoxes = await footer.getByRole('link').evaluateAll((links) =>
          links.map((link) => {
            const { left, right } = link.getBoundingClientRect();
            return { left, right, text: link.textContent ?? '' };
          }),
        );
        expect(linkBoxes.length).toBeGreaterThan(0);
        for (const box of linkBoxes) {
          expect(box.left, box.text).toBeGreaterThanOrEqual(0);
          expect(box.right, box.text).toBeLessThanOrEqual(pageWidth);
        }

        const horizontalOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(horizontalOverflow).toBeLessThanOrEqual(0);
      });
    }
  });
}

test('footer focus return waits for deferred restoration to the exact opener', async ({ page }) => {
  await page.setContent('<button type="button">Cookie preferences</button>');
  const opener = page.getByRole('button', { name: 'Cookie preferences', exact: true });
  await expect(opener).not.toBeFocused();
  await page.evaluate(() => {
    setTimeout(() => document.querySelector('button')?.focus(), 200);
  });
  expect(await footerFocusReturn(opener)).toEqual({ immediatelyReturned: false, returned: true });
  await expect(opener).toBeFocused();
});

test('footer focus return rejects missing restoration within its deadline', async ({ page }) => {
  await page.setContent('<button type="button">Cookie preferences</button>');
  const opener = page.getByRole('button', { name: 'Cookie preferences', exact: true });
  await expect(opener).not.toBeFocused();
  const start = Date.now();
  await expect(footerFocusReturn(opener, 500)).rejects.toThrow(/toBeFocused/u);
  expect(Date.now() - start).toBeLessThan(2000);
  await expect(opener).not.toBeFocused();
});

test('footer focus return rejects restoration to another control', async ({ page }) => {
  await page.setContent(
    '<button type="button">Cookie preferences</button><button type="button">Other action</button>',
  );
  const opener = page.getByRole('button', { name: 'Cookie preferences', exact: true });
  const other = page.getByRole('button', { name: 'Other action', exact: true });
  await other.focus();
  await expect(footerFocusReturn(opener, 500)).rejects.toThrow(/toBeFocused/u);
  await expect(other).toBeFocused();
});

test('footer native capture covers a tall interactive footer without changing its viewport or controls', async ({
  page,
}, testInfo) => {
  const footer = await footerCaptureFixture(page);
  await footer.getByRole('button', { name: 'Fixture button' }).focus();
  const before = await footerNativeState(page, footer);
  const proof = await footerNativeImages(page, footer, testInfo);
  expect(proof.complete).toBe(true);
  expect(proof.strips.length).toBeGreaterThan(1);
  expect(proof.covered).toBe(proof.bounds.bottom);
  await equalFooterState(
    await footerNativeState(page, footer),
    before,
    'Fixture state changed after native capture',
  );
  await expect(footer.getByRole('button')).toBeFocused();
});

test('footer native state assertions reject and preserve nested paint differences', async () => {
  const testInfo = test.info();
  const expected = { paint: { elements: [{ color: 'rgb(0, 0, 0)' }] } };
  const actual = { paint: { elements: [{ color: 'rgb(100, 0, 0)' }] } };
  await equalFooterState(expected, structuredClone(expected), 'Equal fixture state');
  await rejects(
    equalFooterState(actual, expected, 'Nested fixture paint changed'),
    { name: 'Error', message: 'Nested fixture paint changed' },
    'State comparison must retain the original assertion error',
  );
  const attachments = testInfo.attachments.filter((attachment) =>
    attachment.name.startsWith('footer-state-failure-'),
  );
  expect(attachments).toHaveLength(1);
  const attachment = attachments[0]!;
  if (!attachment.path) throw new Error('Failed state comparison has no path attachment');
  deepEqual(
    JSON.parse(readFileSync(attachment.path, 'utf8')),
    { label: 'Nested fixture paint changed', actual, expected },
    'Failed comparison must preserve both raw states',
  );
  deepEqual(
    readFileSync(attachment.path),
    readFileSync(testInfo.outputPath(attachment.name)),
    'Failed comparison attachment differs from its original',
  );
});

test('footer native capture rejects a paint change after the screenshot', async ({
  page,
}, testInfo) => {
  const footer = await footerCaptureFixture(page);
  const original = page.screenshot.bind(page);
  page.screenshot = async (...args: Parameters<Page['screenshot']>) => {
    const bytes = await original(...args);
    await footer.evaluate((root) => {
      (root as HTMLElement).style.color = 'rgb(100, 0, 0)';
    });
    return bytes;
  };
  await expect(footerNativeImages(page, footer, testInfo)).rejects.toThrow(
    'Native screenshot must preserve footer paint',
  );
});

test('footer native capture rejects a settled scroll-triggered paint change', async ({
  page,
}, testInfo) => {
  const footer = await footerCaptureFixture(page);
  await page.evaluate(() => {
    addEventListener(
      'scroll',
      () => {
        const footer = document.querySelector('footer');
        if (footer) footer.style.color = 'rgb(100,0,0)';
      },
      { once: true },
    );
  });
  await expect(footerNativeImages(page, footer, testInfo)).rejects.toThrow(
    /Footer paint or focus changed|Footer paint and focus changed/u,
  );
});

test('footer native capture rejects an ancestor paint change during the screenshot', async ({
  page,
}, testInfo) => {
  const footer = await footerCaptureFixture(page);
  const original = page.screenshot.bind(page);
  page.screenshot = async (...args: Parameters<Page['screenshot']>) => {
    const bytes = await original(...args);
    await page.evaluate(() => {
      document.body.style.opacity = '0.5';
    });
    return bytes;
  };
  await expect(footerNativeImages(page, footer, testInfo)).rejects.toThrow(
    'Native screenshot must preserve footer paint',
  );
});

test('footer native capture rejects visible descendants outside a collapsed root', async ({
  page,
}, testInfo) => {
  const footer = await footerCaptureFixture(page);
  await footer.evaluate((root) => {
    (root as HTMLElement).style.height = '1px';
  });
  await expect(footerNativeImages(page, footer, testInfo)).rejects.toThrow(
    'Footer text or descendants escape its bounds',
  );
});

test('footer cheap settling rejects a stalled animation frame within its deadline', async ({
  page,
}) => {
  const footer = await footerCaptureFixture(page);
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
  });
  const start = Date.now();
  await expect(stableFooterState(page, footer)).rejects.toThrow(
    'Footer cheap state exceeded its native settling budget',
  );
  expect(Date.now() - start).toBeLessThan(2500);
});

test('footer cross-scroll geometry tolerates observed numeric drift and rejects a pixel shift', async ({
  page,
}) => {
  const footer = await footerCaptureFixture(page);
  const baseline = await footerNativeState(page, footer);
  const drift = structuredClone(baseline);
  drift.geometry.at(-1)!.rect.y += 0.00000762939453125;
  await matchingFooterMaterial(drift, baseline, 'Observed floating precision');
  drift.geometry.at(-1)!.rect.y += 1;
  await rejects(
    matchingFooterMaterial(drift, baseline, 'Real geometry shift'),
    (error: unknown) =>
      error instanceof Error &&
      !(error instanceof AggregateError) &&
      error.message.includes('Real geometry shift'),
    'Geometry comparison must retain the original pixel-shift failure',
  );
  const attachments = test
    .info()
    .attachments.filter((attachment) => attachment.name.startsWith('footer-state-failure-'));
  expect(attachments).toHaveLength(1);
  if (!attachments[0]!.path) throw new Error('Geometry failure has no raw state attachment');
  deepEqual(
    JSON.parse(readFileSync(attachments[0]!.path, 'utf8')),
    { label: 'Real geometry shift', actual: drift, expected: baseline },
    'Geometry comparison must preserve both original full snapshots',
  );
});

test('footer legacy rule reader retains footer media rules and drops shared header selectors', async ({
  page,
}) => {
  await page.setContent('<header>Header</header><footer>Footer</footer>');
  const read = await footerLegacyRules(
    page,
    '.agi-ds-wordmark,.agi-ds-footer-wordmark{font-size:17px}.other{color:red}@media(max-width:767px){.agi-ds-footer-col{display:flex}.agi-ds-nav{display:none}}.agi-ds-footer-legal{font-size:12px}',
  );
  expect(read.selectors).toBe(3);
  expect(read.content).toContain('.agi-ds-footer-wordmark');
  expect(read.content).toContain('.agi-ds-footer-col');
  expect(read.content).toContain('.agi-ds-footer-legal');
  expect(read.content).toContain('@media');
  expect(read.content).not.toContain('.agi-ds-wordmark');
  expect(read.content).not.toContain('.agi-ds-nav');
  expect(read.content).not.toContain('.other');
});
