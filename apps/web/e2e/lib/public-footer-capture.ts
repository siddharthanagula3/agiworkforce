import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

import { deepEqual } from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { publicCapturePngDimensions } from './public-viewport-strip-capture';

export const FOOTER_MAX_HEIGHT_PX = 640;
export const FOOTER_SAMPLE_ROUTES = [
  { name: 'ordinary', pathname: '/web', condensed: false },
  { name: 'reference', pathname: '/pricing', condensed: false },
  { name: 'condensed', pathname: '/api-docs', condensed: true },
] as const;
export const FOOTER_WIDTHS = [320, 360, 390, 768, 1024, 1366, 1440, 1920] as const;
export const FOOTER_THEMES = ['light', 'dark'] as const;
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
  'apps/web/e2e/lib/public-footer-capture.ts',
  'apps/web/e2e/matrix/public-footer-measured.spec.ts',
  'apps/web/e2e/public-typography-instrument.spec.ts',
  'apps/web/e2e/lib/public-page-readiness.ts',
  'apps/web/e2e/lib/public-typography.ts',
  'apps/web/e2e/lib/public-text-contrast.ts',
  'apps/web/e2e/lib/public-viewport-strip-capture.ts',
];
export const FOOTER_REPOSITORY_ROOT = path.resolve(__dirname, '../../../..');
export const footerSourceSnapshot = () =>
  Object.fromEntries(
    FOOTER_SOURCE_FILES.map((file) => [
      file,
      createHash('sha256')
        .update(readFileSync(path.join(FOOTER_REPOSITORY_ROOT, file)))
        .digest('hex'),
    ]),
  );

export async function footerNativeState(page: Page, footer: Locator, details = true) {
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

export async function equalFooterState(
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

export async function matchingFooterMaterial(
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

export async function stableFooterState(page: Page, footer: Locator) {
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

export async function footerNativeImages(
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

export async function footerFocusReturn(opener: Locator, timeout = 1000) {
  const immediatelyReturned = await opener.evaluate(
    (element) => element === document.activeElement,
  );
  await expect(opener).toBeFocused({ timeout });
  const returned = await opener.evaluate((element) => element === document.activeElement);
  return { immediatelyReturned, returned };
}

export async function footerLegacyRules(page: Page, css: string) {
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

export async function footerCaptureFixture(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setContent(
    '<html><head><style>body{margin:0;font:16px Arial}header{position:fixed;inset:0 0 auto;height:48px;background:white;z-index:2}main{height:80px}footer{height:1600px;background:white;color:black}a,button{display:block;min-height:48px}</style></head><body><header>Header</header><main></main><footer><a href="#fixture">Fixture link</a><button type="button">Fixture button</button><p>Native footer capture</p></footer></body></html>',
  );
  await page.evaluate(() => document.fonts.ready);
  return page.getByRole('contentinfo');
}
