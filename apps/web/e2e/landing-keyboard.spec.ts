import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { deepEqual, rejects } from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  COOKIE_CONSENT_STORAGE_KEY,
  isCookieConsentCurrent,
  NECESSARY_ONLY_PREFERENCES,
  parseCookieConsentRecord,
} from '../shared/lib/cookie-consent';
import { measurePublicFontProof, settlePublicPage } from './lib/public-page-readiness';
import { scanPublicTypography } from './lib/public-typography';
import { evaluatePublicTextContrast } from './lib/public-text-contrast';
import { publicCapturePngDimensions } from './lib/public-viewport-strip-capture';

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
const FOOTER_MAX_HEIGHT_PX = 640;
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

const FOOTER_SAMPLE_ROUTES = [
  { name: 'ordinary', pathname: '/web', condensed: false },
  { name: 'reference', pathname: '/pricing', condensed: false },
  { name: 'condensed', pathname: '/api-docs', condensed: true },
] as const;
const FOOTER_WIDTHS = [320, 360, 390, 768, 1024, 1366, 1440, 1920] as const;
const FOOTER_THEMES = ['light', 'dark'] as const;
const FOOTER_SOURCE_FILES = [
  'apps/web/app/layout.tsx',
  'apps/web/app/globals.css',
  'apps/web/app/web/page.tsx',
  'apps/web/app/pricing/page.tsx',
  'apps/web/app/api-docs/page.tsx',
  'apps/web/features/marketing/components/MarketingFooter.tsx',
  'apps/web/features/marketing/components/system/MarketingFooter.tsx',
  'apps/web/features/marketing/components/system/nav.ts',
  'apps/web/features/marketing/components/system/Container.tsx',
  'apps/web/features/marketing/components/system/system.css',
  'apps/web/features/marketing/components/system/public-footer.css',
  'apps/web/features/marketing/components/system/public-reference.css',
  'apps/web/shared/components/agi/AgiMark.tsx',
  'apps/web/shared/components/CookiePreferencesTrigger.tsx',
  'apps/web/shared/components/CookieConsent.tsx',
  'apps/web/shared/lib/cookie-consent.ts',
  'apps/web/lib/legal-constants.ts',
  'apps/web/lib/surface-status.ts',
  'packages/ui/design-tokens/src/foundation.css',
  'packages/ui/design-tokens/src/tailwind.css',
  'apps/web/e2e/landing-keyboard.spec.ts',
  'apps/web/e2e/public-typography-instrument.spec.ts',
  'apps/web/e2e/lib/public-page-readiness.ts',
  'apps/web/e2e/lib/public-typography.ts',
  'apps/web/e2e/lib/public-text-contrast.ts',
  'apps/web/e2e/lib/public-viewport-strip-capture.ts',
];
const FOOTER_REPOSITORY_ROOT = path.resolve(__dirname, '../../..');
const footerSourceSnapshot = () =>
  Object.fromEntries(
    FOOTER_SOURCE_FILES.map((file) => [
      file,
      createHash('sha256')
        .update(readFileSync(path.join(FOOTER_REPOSITORY_ROOT, file)))
        .digest('hex'),
    ]),
  );

async function footerNativeState(page: Page, footer: Locator, details = true) {
  const material = await footer.evaluate((root, full) => {
    const rect = (box: DOMRect) => ({
      x: box.x + scrollX,
      y: box.y + scrollY,
      width: box.width,
      height: box.height,
    });
    const style = (element: Element, pseudo?: string) => {
      const css = getComputedStyle(element, pseudo);
      return [...css].sort().map((property) => [property, css.getPropertyValue(property)]);
    };
    const elements = [root, ...root.querySelectorAll('*')];
    const ancestors: Element[] = [];
    for (let node = root.parentElement; node; node = node.parentElement) ancestors.push(node);
    const active = document.activeElement;
    const text = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent?.trim() || node.parentElement?.closest('script,style,noscript'))
        continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      text.push({ text: node.textContent, rects: [...range.getClientRects()].map(rect) });
    }
    return {
      html: root.outerHTML,
      rect: rect(root.getBoundingClientRect()),
      text,
      geometry: elements.map((element) => {
        const css = getComputedStyle(element);
        return {
          rect: rect(element.getBoundingClientRect()),
          display: css.display,
          visibility: css.visibility,
          opacity: css.opacity,
          scroll: [
            element.scrollLeft,
            element.scrollTop,
            element.scrollWidth,
            element.scrollHeight,
          ],
        };
      }),
      paint: full
        ? {
            elements: elements.map((element) => ({
              style: style(element),
              before: style(element, '::before'),
              after: style(element, '::after'),
            })),
            ancestors: ancestors.map((element) => ({
              tag: element.localName,
              attributes: [...element.attributes]
                .map((attribute) => [attribute.name, attribute.value])
                .sort(),
              style: style(element),
              before: style(element, '::before'),
              after: style(element, '::after'),
            })),
          }
        : null,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      scroll: { x: scrollX, y: scrollY },
      document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      media: {
        coarse: matchMedia('(pointer: coarse)').matches,
        fine: matchMedia('(pointer: fine)').matches,
        hover: matchMedia('(hover: hover)').matches,
        touch: navigator.maxTouchPoints,
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        dark: matchMedia('(prefers-color-scheme: dark)').matches,
      },
      fonts: {
        status: document.fonts.status,
        faces: [...document.fonts]
          .map((font) => [
            font.family,
            font.style,
            font.weight,
            font.stretch,
            font.unicodeRange,
            font.status,
          ])
          .sort(),
      },
      animations: root
        .getAnimations({ subtree: true })
        .filter((animation) => animation.playState === 'running').length,
      focus: active
        ? {
            tag: active.localName,
            id: active.id,
            role: active.getAttribute('role'),
            inFooter: root.contains(active),
            footerElementIndex: elements.indexOf(active),
          }
        : null,
    };
  }, details);
  const headerBottom = await page
    .getByRole('banner')
    .evaluate((root) => Math.max(0, root.getBoundingClientRect().bottom));
  return { ...material, headerBottom };
}

function footerMaterial(state: Awaited<ReturnType<typeof footerNativeState>>) {
  const { scroll, headerBottom, ...material } = state;
  return material;
}

async function preserveFooterFailure(
  actual: unknown,
  expected: unknown,
  label: string,
  error: unknown,
): Promise<never> {
  try {
    const info = test.info();
    const name = `footer-state-failure-${randomUUID()}.json`;
    const file = info.outputPath(name);
    writeFileSync(file, JSON.stringify({ label, actual, expected }));
    await info.attach(name, { path: file, contentType: 'application/json' });
  } catch (saveError) {
    throw new AggregateError([error, saveError], `${label}; raw state preservation failed`);
  }
  throw error;
}

async function equalFooterState(
  actual: unknown,
  expected: unknown,
  label: string,
  raw = { actual, expected },
) {
  try {
    deepEqual(actual, expected, new Error(label));
  } catch (error) {
    await preserveFooterFailure(raw.actual, raw.expected, label, error);
  }
}

async function matchingFooterMaterial(
  actual: Awaited<ReturnType<typeof footerNativeState>>,
  expected: Awaited<ReturnType<typeof footerNativeState>>,
  label: string,
) {
  const split = (state: Awaited<ReturnType<typeof footerNativeState>>) => {
    const { rect, text, geometry, ...material } = footerMaterial(state);
    return {
      material: {
        ...material,
        text: text.map(({ rects, ...node }) => node),
        geometry: geometry.map(({ rect, ...element }) => element),
      },
      rectangles: [
        rect,
        ...geometry.map((element) => element.rect),
        ...text.flatMap((node) => node.rects),
      ],
    };
  };
  const a = split(actual);
  const b = split(expected);
  await equalFooterState(a.material, b.material, label, { actual, expected });
  try {
    expect(a.rectangles.length, label).toBe(b.rectangles.length);
    for (let index = 0; index < a.rectangles.length; index += 1) {
      for (const field of ['x', 'y', 'width', 'height'] as const)
        expect(
          Math.abs(a.rectangles[index]![field] - b.rectangles[index]![field]),
          `${label}: document rectangle ${index}.${field}`,
        ).toBeLessThanOrEqual(0.001);
    }
  } catch (error) {
    await preserveFooterFailure(actual, expected, label, error);
  }
}

async function footerBounded<T>(work: Promise<T>, deadline: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Footer cheap state exceeded its native settling budget')),
          Math.max(1, deadline - Date.now()),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function stableFooterState(page: Page, footer: Locator) {
  const deadline = Date.now() + 2000;
  let previous = '';
  let consecutive = 0;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    await footerBounded(
      page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      ),
      deadline,
    );
    const state = await footerBounded(footerNativeState(page, footer, false), deadline);
    if (Date.now() >= deadline)
      throw new Error('Footer cheap state exceeded its native settling budget');
    const signature = JSON.stringify(state);
    consecutive = signature === previous ? consecutive + 1 : 0;
    if (consecutive >= 2) {
      expect(state.fonts.status).toBe('loaded');
      expect(state.animations).toBe(0);
      const full = await footerNativeState(page, footer);
      await equalFooterState(
        { ...full, paint: null },
        state,
        'Full paint snapshot differs from settled cheap state',
        { actual: full, expected: state },
      );
      await equalFooterState(
        await footerNativeState(page, footer, false),
        state,
        'State changed during full paint read',
      );
      return full;
    }
    previous = signature;
  }
  throw new Error('Footer cheap state did not settle within its native budget');
}

async function footerNativeImages(
  page: Page,
  footer: Locator,
  info: TestInfo,
  measured?: Awaited<ReturnType<typeof footerNativeState>>,
) {
  const initial = await stableFooterState(page, footer);
  if (measured)
    await matchingFooterMaterial(
      initial,
      measured,
      'Footer paint changed since typography and contrast measurement',
    );
  expect(initial.rect.width).toBeGreaterThan(0);
  expect(initial.rect.height).toBeGreaterThan(0);
  const visible = [
    ...initial.geometry
      .filter(
        (element) =>
          element.display !== 'none' &&
          !['hidden', 'collapse'].includes(element.visibility) &&
          Number(element.opacity) > 0,
      )
      .map((element) => element.rect),
    ...initial.text.flatMap((node) => node.rects),
  ].filter((rect) => rect.width > 0 && rect.height > 0);
  const escaping = visible.filter(
    (rect) =>
      rect.x < initial.rect.x - 1 ||
      rect.y < initial.rect.y - 1 ||
      rect.x + rect.width > initial.rect.x + initial.rect.width + 1 ||
      rect.y + rect.height > initial.rect.y + initial.rect.height + 1,
  );
  if (escaping.length) throw new Error('Footer text or descendants escape its bounds');
  const top = initial.rect.y;
  const bottom = top + initial.rect.height;
  const strips: {
    index: number;
    top: number;
    bottom: number;
    hash: string;
    file: string;
    state: Omit<Awaited<ReturnType<typeof footerNativeState>>, 'paint'> & { paintHash: string };
  }[] = [];
  let covered = top;
  let captureFailure: unknown;
  let result:
    | {
        initial: typeof initial;
        strips: typeof strips;
        covered: number;
        bounds: { top: number; bottom: number };
        complete: boolean;
      }
    | undefined;
  try {
    for (let index = 0; index < 32 && covered < bottom - 1; index += 1) {
      await page.evaluate(
        (y) => window.scrollTo({ top: y, behavior: 'instant' }),
        Math.max(0, covered - initial.headerBottom),
      );
      const before = await stableFooterState(page, footer);
      await matchingFooterMaterial(
        before,
        initial,
        'Footer paint or focus changed between native views',
      );
      const start = Math.max(top, before.scroll.y + before.headerBottom);
      const end = Math.min(bottom, before.scroll.y + before.viewport.height);
      expect(start).toBeLessThanOrEqual(covered + 1);
      expect(end).toBeGreaterThan(covered + 1);
      const file = info.outputPath(`footer-strip-${index}.png`);
      const bytes = await page.screenshot({ path: file });
      const after = await footerNativeState(page, footer);
      await equalFooterState(
        after,
        before,
        'Native screenshot must preserve footer paint, geometry, pointer, fonts and focus',
      );
      expect(publicCapturePngDimensions(bytes)).toEqual({
        width: initial.viewport.width,
        height: initial.viewport.height,
      });
      const hash = createHash('sha256').update(bytes).digest('hex');
      await info.attach(`footer-strip-${index}.png`, { path: file, contentType: 'image/png' });
      const { paint, ...state } = before;
      const paintHash = createHash('sha256').update(JSON.stringify(paint)).digest('hex');
      expect(paintHash).toBe(
        createHash('sha256').update(JSON.stringify(initial.paint)).digest('hex'),
      );
      strips.push({ index, top: start, bottom: end, hash, file, state: { ...state, paintHash } });
      covered = end;
    }
    expect(strips.length).toBeGreaterThan(0);
    expect(covered).toBeGreaterThanOrEqual(bottom - 1);
    result = { initial, strips, covered, bounds: { top, bottom }, complete: true };
  } catch (error) {
    captureFailure = error;
  }
  try {
    await page.evaluate(
      (position) => window.scrollTo({ left: position.x, top: position.y, behavior: 'instant' }),
      initial.scroll,
    );
    await equalFooterState(
      await stableFooterState(page, footer),
      initial,
      'Footer paint and focus changed on restoration',
    );
  } catch (error) {
    if (captureFailure)
      throw new AggregateError(
        [captureFailure, error],
        `${captureFailure instanceof Error ? captureFailure.message : String(captureFailure)}; Footer restoration failed`,
      );
    throw error;
  }
  if (captureFailure) throw captureFailure;
  if (!result) throw new Error('Footer native capture produced no result');
  return result;
}

test.describe('shared footer measured readability and controls', () => {
  for (const route of FOOTER_SAMPLE_ROUTES) {
    for (const width of FOOTER_WIDTHS) {
      for (const theme of FOOTER_THEMES) {
        test(`footer measured ${route.name} at ${width}px ${theme}`, async ({
          browser,
          baseURL,
        }, testInfo) => {
          const evidence: Record<string, unknown> = {
            route,
            width,
            theme,
            repeatEachIndex: testInfo.repeatEachIndex,
            contextClosed: false,
            limits: [
              'Three representative footer callers only, not all public pages.',
              'Reduced-motion native viewport screenshots with footer coverage, not the static mockup capture contract, production CSS ordering, normal motion or full-page acceptance.',
              'Source snapshots cover declared inputs, not every transitive dependency or runtime value.',
            ],
          };
          let context: Awaited<ReturnType<typeof browser.newContext>> | undefined;
          let failure: unknown;
          try {
            if (!baseURL) throw new Error('Footer measurement requires a base URL');
            evidence['sourceStart'] = footerSourceSnapshot();
            context = await browser.newContext({
              baseURL,
              viewport: { width, height: 844 },
              colorScheme: theme,
              reducedMotion: 'reduce',
              hasTouch: width < 1024,
              storageState: { cookies: [], origins: [] },
            });
            expect(await context.storageState()).toEqual({ cookies: [], origins: [] });
            const page = await context.newPage();
            const destination = new URL(route.pathname, baseURL);
            const expectation = {
              path: route.pathname,
              expectedHttpStatuses: [200],
              expectedFinalPath: destination.pathname,
              expectedOrigin: destination.origin,
              expectedQuery: destination.search,
            };
            evidence['initialReadiness'] = await settlePublicPage(page, expectation);
            const consentBanner = page.getByRole('region', { name: 'Cookie consent', exact: true });
            await expect(consentBanner).toBeVisible();
            await consentBanner
              .getByRole('button', { name: 'Necessary only', exact: true })
              .click();
            await expect(consentBanner).toHaveCount(0);
            const consent = parseCookieConsentRecord(
              await page.evaluate((key) => localStorage.getItem(key), COOKIE_CONSENT_STORAGE_KEY),
            );
            expect(consent).toMatchObject({ ...NECESSARY_ONLY_PREFERENCES });
            expect(isCookieConsentCurrent(consent)).toBe(true);
            evidence['readiness'] = await settlePublicPage(page, expectation);
            const footer = page.getByRole('contentinfo');
            await expect(footer).toHaveCount(1);
            await expect(footer).toHaveClass(/agi-ds-footer/u);
            const scopeSelector = 'footer.agi-ds-footer';
            const ownership = await footer.evaluate(
              (root, selector) => ({
                matches: document.querySelectorAll(selector).length,
                sameElement: document.querySelector(selector) === root,
                elementIndex: [...document.querySelectorAll('*')].indexOf(root),
                tag: root.localName,
                label: root.getAttribute('aria-label'),
              }),
              scopeSelector,
            );
            expect(ownership.matches).toBe(1);
            expect(ownership.sameElement).toBe(true);
            await footer.scrollIntoViewIfNeeded();
            await page.mouse.move(0, 0);
            const measuredState = await stableFooterState(page, footer);
            evidence['footerHeight'] = measuredState.rect.height;
            if (width >= 1024)
              expect.soft(measuredState.rect.height).toBeLessThanOrEqual(FOOTER_MAX_HEIGHT_PX);
            let fontFailure: unknown;
            try {
              evidence['fontProof'] = await measurePublicFontProof(page, footer, [
                { cssVariable: '--font-geist-sans' },
              ]);
            } catch (error) {
              fontFailure = error;
              evidence['fontProofError'] = String(error);
            }
            expect.soft(fontFailure, 'Footer font proof').toBeUndefined();
            const typography = await page.evaluate(scanPublicTypography, {
              pageType: 'marketing' as const,
              pathname: route.pathname,
              scopeSelector,
            });
            evidence['typography'] = typography;
            expect.soft(typography.scope).toEqual({
              selector: scopeSelector,
              elementIndex: ownership.elementIndex,
              tag: ownership.tag,
              label: ownership.label,
            });
            expect.soft(typography.samples.length).toBeGreaterThan(0);
            const rawTextCount = await footer.evaluate((root) => {
              const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
              let count = 0;
              while (walker.nextNode()) {
                const node = walker.currentNode;
                if (
                  node.textContent?.trim() &&
                  !node.parentElement?.closest('script,style,noscript')
                )
                  count += 1;
              }
              return count;
            });
            evidence['rawTextCount'] = rawTextCount;
            expect.soft(rawTextCount).toBeGreaterThan(0);
            expect.soft(typography.coverage.textNodes).toBe(rawTextCount);
            expect
              .soft(typography.samples.filter((sample) => sample.kind === 'text').length)
              .toBe(rawTextCount);
            expect
              .soft(new Set(typography.samples.map((sample) => sample.sourceKey)).size)
              .toBe(typography.samples.length);
            expect.soft(typography.findings).toEqual([]);
            expect.soft(typography.unmeasured).toEqual([]);
            expect.soft(typography.excluded).toEqual([]);
            const contrast = typography.canvasColor
              ? evaluatePublicTextContrast(typography.samples, typography.canvasColor)
              : null;
            evidence['contrast'] = contrast;
            expect.soft(contrast).not.toBeNull();
            if (contrast) {
              expect.soft(contrast.findings).toEqual([]);
              expect.soft(contrast.unmeasured).toEqual([]);
              expect.soft(contrast.coverage.measured).toBe(typography.samples.length);
            }
            const pointer = await page.evaluate(() => ({
              coarse: matchMedia('(pointer: coarse)').matches,
              touch: navigator.maxTouchPoints,
            }));
            evidence['pointer'] = pointer;
            const targetMinimum = pointer.coarse ? 44 : 24;
            const targets = await footer.locator('a[href],button').evaluateAll((elements) =>
              elements.map((element) => {
                const rect = element.getBoundingClientRect();
                const css = getComputedStyle(element);
                return {
                  text: element.textContent,
                  width: rect.width,
                  height: rect.height,
                  left: rect.left,
                  right: rect.right,
                  display: css.display,
                  visibility: css.visibility,
                  disabled: element.hasAttribute('disabled'),
                  tabindex: element.tabIndex,
                  pointerEvents: css.pointerEvents,
                  inert: element.closest('[inert]') !== null,
                  ariaDisabled: element.getAttribute('aria-disabled'),
                };
              }),
            );
            evidence['targets'] = targets;
            expect.soft(targets.length).toBeGreaterThan(0);
            for (const target of targets) {
              expect.soft(target.width, target.text ?? '').toBeGreaterThanOrEqual(targetMinimum);
              expect.soft(target.height, target.text ?? '').toBeGreaterThanOrEqual(targetMinimum);
              expect.soft(target.left, target.text ?? '').toBeGreaterThanOrEqual(0);
              expect.soft(target.right, target.text ?? '').toBeLessThanOrEqual(width);
              expect.soft(target.disabled).toBe(false);
              expect.soft(target.inert).toBe(false);
              expect.soft(target.ariaDisabled).not.toBe('true');
              expect.soft(target.tabindex).toBeGreaterThanOrEqual(0);
              expect.soft(target.pointerEvents).not.toBe('none');
            }
            const columns = footer.getByRole('navigation', { name: 'Footer', exact: true });
            await expect(columns).toHaveCount(route.condensed ? 0 : 1);
            await expect(
              footer.getByRole('navigation', { name: 'Legal', exact: true }),
            ).toHaveCount(1);
            expect
              .soft(
                await footer
                  .locator('.agi-ds-footer-legal')
                  .evaluate((element) => getComputedStyle(element).fontSize),
              )
              .toBe('14px');
            if (!route.condensed) {
              const tracks = await columns.evaluate(
                (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
              );
              evidence['columns'] = tracks;
              const brandSize = await footer
                .locator('.agi-ds-footer-statement')
                .evaluate((element) => getComputedStyle(element).fontSize);
              expect.soft(brandSize).toBe('17px');
              const phraseLines = await footer
                .getByText('AI-assisted', { exact: true })
                .evaluate((element) => {
                  const range = document.createRange();
                  range.selectNodeContents(element);
                  return range.getClientRects().length;
                });
              evidence['brandPhraseLines'] = phraseLines;
              expect.soft(phraseLines).toBe(1);
              const navigationSizes = await columns
                .getByRole('heading', { level: 2 })
                .evaluateAll((headings) =>
                  headings.map((element) => getComputedStyle(element).fontSize),
                );
              expect.soft(navigationSizes).toEqual(Array(5).fill('16px'));
              const linkSizes = await columns
                .getByRole('link')
                .evaluateAll((links) => links.map((element) => getComputedStyle(element).fontSize));
              expect.soft(linkSizes.length).toBeGreaterThan(0);
              expect.soft(linkSizes.every((size) => size === '16px')).toBe(true);
              expect.soft(tracks).toBe(width >= 1024 ? 5 : width >= 768 ? 3 : 2);
            }
            const header = page.getByRole('banner');
            await expect(header).toHaveCount(1);
            evidence['nativeViews'] = await footerNativeImages(
              page,
              footer,
              testInfo,
              measuredState,
            );
            const controls = footer.locator('a[href],button');
            await controls.first().focus();
            await page.keyboard.press('Shift+Tab');
            await page.keyboard.press('Tab');
            for (let index = 0; index < (await controls.count()); index += 1) {
              const control = controls.nth(index);
              await expect(control).toBeFocused();
              await expect(control).toBeVisible();
              const controlFocus = await control.evaluate((element) => ({
                visible: element.matches(':focus-visible'),
                style: getComputedStyle(element).outlineStyle,
                width: parseFloat(getComputedStyle(element).outlineWidth),
              }));
              expect.soft(controlFocus.visible).toBe(true);
              expect.soft(controlFocus.style).not.toBe('none');
              expect.soft(controlFocus.width).toBeGreaterThan(0);
              await control.click({ trial: true });
              if (index + 1 < (await controls.count())) await page.keyboard.press('Tab');
            }
            evidence['footerNativeTabOrderAndActionability'] = true;
            const opener = footer.getByRole('button', { name: 'Cookie preferences', exact: true });
            await opener.focus();
            await expect(opener).toBeFocused();
            const focusStyle = await opener.evaluate((element) => {
              const css = getComputedStyle(element);
              const canvas = document.createElement('canvas');
              canvas.width = canvas.height = 1;
              const pen = canvas.getContext('2d');
              if (!pen) throw new Error('Focus color probe is unavailable');
              pen.fillStyle = css.outlineColor;
              pen.fillRect(0, 0, 1, 1);
              return {
                style: css.outlineStyle,
                width: parseFloat(css.outlineWidth),
                color: css.outlineColor,
                alpha: pen.getImageData(0, 0, 1, 1).data[3],
                focusVisible: element.matches(':focus-visible'),
              };
            });
            evidence['focusStyle'] = focusStyle;
            expect.soft(focusStyle.style).not.toBe('none');
            expect.soft(focusStyle.width).toBeGreaterThan(0);
            expect.soft(focusStyle.alpha).toBe(255);
            expect.soft(focusStyle.focusVisible).toBe(true);
            await page.keyboard.press('Space');
            const dialog = page.getByRole('dialog', { name: 'Cookie preferences', exact: true });
            await expect(dialog).toBeVisible();
            await expect(dialog.locator(':focus')).toHaveCount(1);
            await page.keyboard.press('Escape');
            await expect(dialog).toHaveCount(0);
            evidence['cookieKeyboardOpenedAndClosed'] = true;
            evidence['cookieFocusImmediatelyReturned'] = await opener.evaluate(
              (element) => element === document.activeElement,
            );
            const focusReturn = await footerFocusReturn(opener);
            evidence['cookieFocusAtWaitStart'] = focusReturn.immediatelyReturned;
            evidence['cookieFocusReturned'] = focusReturn.returned;
            expect.soft(evidence['cookieFocusReturned']).toBe(true);
            const accessibility = await new AxeBuilder({ page: page as never })
              .include(scopeSelector)
              .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
              .analyze();
            evidence['scopedAccessibility'] = accessibility;
            expect
              .soft(
                accessibility.violations.filter((item) =>
                  ['serious', 'critical'].includes(item.impact ?? ''),
                ),
              )
              .toEqual([]);
            expect
              .soft(
                accessibility.incomplete.filter((item) =>
                  ['serious', 'critical'].includes(item.impact ?? ''),
                ),
              )
              .toEqual([]);
            evidence['themeState'] = await page.evaluate(() => ({
              marker: document.documentElement.dataset['theme'],
              light: document.documentElement.classList.contains('light'),
              dark: document.documentElement.classList.contains('dark'),
              scheme: getComputedStyle(document.documentElement).colorScheme,
              prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
            }));
            expect(evidence['themeState']).toEqual({
              marker: theme,
              light: theme === 'light',
              dark: theme === 'dark',
              scheme: theme,
              prefersDark: theme === 'dark',
            });
            const legacySource = execFileSync(
              'git',
              ['show', 'HEAD:apps/web/features/marketing/components/system/system.css'],
              { cwd: FOOTER_REPOSITORY_ROOT, encoding: 'utf8' },
            );
            const legacy = await footerLegacyRules(page, legacySource);
            expect(legacy.selectors).toBeGreaterThan(0);
            expect(legacy.content).toContain('.agi-ds-footer-brand');
            expect(legacy.content).toContain('.agi-ds-footer-wordmark');
            expect(legacy.content).toContain('.agi-ds-footer-legal');
            const beforeLegacy = await stableFooterState(page, footer);
            await page.addStyleTag({ content: legacy.content });
            await equalFooterState(
              await stableFooterState(page, footer),
              beforeLegacy,
              'Footer changes when committed base rules load after scoped CSS',
            );
            evidence['committedBaseFooterIsolation'] = {
              fullSourceHash: createHash('sha256').update(legacySource).digest('hex'),
              selectors: legacy.selectors,
              injectedRulesHash: createHash('sha256').update(legacy.content).digest('hex'),
              unchanged: true,
              limit:
                'Only committed base footer selectors injected late; this does not verify production CSS chunks or page styles outside the footer.',
            };
            if (testInfo.errors.length)
              throw new Error('Footer has failed or unmeasured witnesses');
          } catch (error) {
            failure = error;
          } finally {
            try {
              await context?.close();
              evidence['contextClosed'] = context !== undefined;
            } catch (error) {
              failure ??= error;
              evidence['contextCloseError'] = String(error);
            }
            try {
              evidence['sourceEnd'] = footerSourceSnapshot();
              evidence['sourceUnchanged'] =
                JSON.stringify(evidence['sourceStart']) === JSON.stringify(evidence['sourceEnd']);
              if (!evidence['sourceUnchanged'])
                failure ??= new Error('Footer source changed during measurement');
            } catch (error) {
              failure ??= error;
            }
            evidence['status'] = failure ? 'failed' : 'passed';
            if (failure)
              evidence['error'] = failure instanceof Error ? failure.message : String(failure);
            const evidencePath = testInfo.outputPath('footer-measurement.json');
            writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
            await testInfo.attach('footer-measurement.json', {
              path: evidencePath,
              contentType: 'application/json',
            });
          }
          if (failure) throw failure;
        });
      }
    }
  }
});

async function footerFocusReturn(opener: Locator, timeout = 1000) {
  const immediatelyReturned = await opener.evaluate(
    (element) => element === document.activeElement,
  );
  await expect(opener).toBeFocused({ timeout });
  const returned = await opener.evaluate((element) => element === document.activeElement);
  return { immediatelyReturned, returned };
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

async function footerLegacyRules(page: Page, css: string) {
  return page.evaluate((source) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(source);
    let selectors = 0;
    const collect = (rules: CSSRuleList): string =>
      [...rules]
        .map((rule) => {
          if (rule instanceof CSSStyleRule) {
            const footerSelectors = rule.selectorText
              .split(',')
              .filter((selector) => selector.includes('.agi-ds-footer'));
            selectors += footerSelectors.length;
            return footerSelectors.length
              ? `${footerSelectors.join(',')} {${rule.style.cssText}}`
              : '';
          }
          if (rule instanceof CSSMediaRule) {
            const content = collect(rule.cssRules);
            return content.trim() ? `@media ${rule.conditionText} {${content}}` : '';
          }
          return '';
        })
        .join('\n');
    const content = collect(sheet.cssRules);
    return { content, selectors };
  }, css);
}

async function footerCaptureFixture(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setContent(
    '<html><head><style>body{margin:0;font:16px Arial}header{position:fixed;inset:0 0 auto;height:48px;background:white;z-index:2}main{height:80px}footer{height:1600px;background:white;color:black}a,button{display:block;min-height:48px}</style></head><body><header>Header</header><main></main><footer><a href="#fixture">Fixture link</a><button type="button">Fixture button</button><p>Native footer capture</p></footer></body></html>',
  );
  await page.evaluate(() => document.fonts.ready);
  return page.getByRole('contentinfo');
}

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
