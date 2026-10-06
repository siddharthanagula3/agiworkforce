import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  expect,
  type Browser,
  type BrowserContext,
  type TestInfo,
  type ElementHandle,
  type Locator,
  type Page,
} from '@playwright/test';

import {
  COOKIE_CONSENT_STORAGE_KEY,
  isCookieConsentCurrent,
  NECESSARY_ONLY_PREFERENCES,
  parseCookieConsentRecord,
} from '../../shared/lib/cookie-consent';
import { measurePublicFontProof, settlePublicPage } from './public-page-readiness';
import {
  measurePublicFeatureBodyWords,
  type PublicFeatureBodyWordContract,
} from './public-feature-body-words';
import { PUBLIC_APPROVED_FADES, publicMaskPaintHandle } from './public-mask-paint';
import { getPublicRouteInventory } from './public-route-inventory';
import { evaluatePublicTextContrast } from './public-text-contrast';
import { scanPublicTypography } from './public-typography';
import {
  assertPublicViewportCapture,
  capturePublicViewportStrips,
  publicCapturePngDimensions,
  PublicViewportCaptureError,
  type PublicViewportCapture,
} from './public-viewport-strip-capture';

export type PublicFeatureMockupScope = {
  figure: string;
} & ({ role: 'main'; region?: never } | { role: 'region' | 'article'; region: string });

export type PublicFeatureMockupScene = PublicFeatureMockupScope & {
  name: string;
  pathname: string;
  sourceFiles: readonly string[];
  bodyWords?: PublicFeatureBodyWordContract;
};

const fonts = [{ cssVariable: '--font-geist-sans' }, { cssVariable: '--font-geist-mono' }];
const repositoryRoot = path.resolve(__dirname, '../../../..');
const instrumentSources = [
  path.relative(repositoryRoot, __filename),
  'apps/web/e2e/lib/public-feature-body-words.ts',
  'apps/web/e2e/lib/public-mask-paint.ts',
  'apps/web/e2e/lib/public-route-inventory.ts',
  'apps/web/e2e/lib/public-page-readiness.ts',
  'apps/web/e2e/lib/public-typography.ts',
  'apps/web/e2e/lib/public-text-contrast.ts',
  'apps/web/e2e/lib/public-viewport-strip-capture.ts',
  'apps/web/shared/lib/cookie-consent.ts',
];

export function scopePublicFadedText<Sample extends { paintUnmeasured: readonly string[] }>(
  samples: readonly Sample[],
  masks: readonly { selector: string; mask: string; frame: boolean }[],
) {
  const faded = samples.filter((sample) => sample.paintUnmeasured.includes('mask-fade'));
  return {
    opaque: samples.filter((sample) => !sample.paintUnmeasured.includes('mask-fade')),
    faded,
    unapprovedMasks: masks.filter(
      (element) =>
        !element.frame ||
        !Object.values(PUBLIC_APPROVED_FADES).some((fade) => fade.image.test(element.mask)),
    ),
    unexplainedFaded: masks.some((element) => element.frame) ? [] : faded,
  };
}

function snapshot(files: string[]) {
  return Object.fromEntries(
    [...new Set(files)].sort().map((file) => [
      file,
      createHash('sha256')
        .update(readFileSync(path.join(repositoryRoot, file)))
        .digest('hex'),
    ]),
  );
}

function failureOf(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function frameReading(frame: Locator) {
  return frame.evaluate((root) => {
    const box = (rect: DOMRect) => ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
    const selectorOf = (element: Element) => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const testId = element.getAttribute('data-testid');
      if (testId) return `${element.localName}[data-testid=${JSON.stringify(testId)}]`;
      return (
        element.localName +
        [...element.classList]
          .slice(0, 3)
          .map((name) => `.${CSS.escape(name)}`)
          .join('')
      );
    };
    const rows = [];
    let totalTextNodes = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const element = node.parentElement;
      if (!element || element.closest('script,style,noscript,textarea,option')) continue;
      const text = node.data.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      totalTextNodes += 1;
      const identity = { sourceKey: `text:${totalTextNodes}`, selector: selectorOf(element), text };
      if (!root.contains(element)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const css = getComputedStyle(element);
      rows.push({
        ...identity,
        rects: [...range.getClientRects()].map(box),
        fontSize: css.fontSize,
        fontFamily: css.fontFamily,
        display: css.display,
        visibility: css.visibility,
        opacity: css.opacity,
      });
    }
    const descendants = [...root.querySelectorAll('*')].map((element) => {
      const css = getComputedStyle(element);
      return {
        selector: selectorOf(element),
        rect: box(element.getBoundingClientRect()),
        display: css.display,
        visibility: css.visibility,
        opacity: css.opacity,
        overflowX: css.overflowX,
        overflowY: css.overflowY,
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop,
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
        transform: css.transform,
        zoom: css.getPropertyValue('zoom'),
        mask: css.maskImage,
        clipPath: css.clipPath,
      };
    });
    const ancestry = [];
    for (let element: Element | null = root; element; element = element.parentElement) {
      const css = getComputedStyle(element);
      ancestry.push({
        selector: selectorOf(element),
        rect: box(element.getBoundingClientRect()),
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
        overflowX: css.overflowX,
        overflowY: css.overflowY,
        transform: css.transform,
        zoom: css.getPropertyValue('zoom'),
        mask: css.maskImage,
        clipPath: css.clipPath,
        hidden: element.hasAttribute('hidden'),
        inert: element.hasAttribute('inert'),
        ariaHidden: element.getAttribute('aria-hidden'),
      });
    }
    const rect = root.getBoundingClientRect();
    return {
      label: root.getAttribute('aria-label'),
      device: root.getAttribute('data-device'),
      geometry: root.getAttribute('data-geometry'),
      rect: box(rect),
      documentRect: {
        x: rect.left + scrollX,
        y: rect.top + scrollY,
        width: rect.width,
        height: rect.height,
      },
      viewport: { width: innerWidth, height: innerHeight },
      pageWidth: document.documentElement.scrollWidth,
      totalTextNodes,
      rows,
      descendants,
      ancestry,
    };
  });
}

async function scopeWitness(frame: ElementHandle<HTMLElement | SVGElement>, selector: string) {
  return frame.evaluate((root, scopeSelector) => {
    const matches = [...document.querySelectorAll(scopeSelector)];
    return {
      selector: scopeSelector,
      matches: matches.length,
      sameElement: matches.length === 1 && matches[0] === root,
      connected: root.isConnected,
      elementIndex: [...document.querySelectorAll('*')].indexOf(root),
      tag: root.localName,
      label: root.getAttribute('aria-label'),
    };
  }, selector);
}

export async function locatePublicFeatureMockup(page: Page, scope: PublicFeatureMockupScope) {
  const region =
    scope.role === 'main'
      ? page.getByRole('main')
      : page.getByRole(scope.role, { name: scope.region, exact: true });
  await expect(region, 'Feature mockup must have exactly one role owner').toHaveCount(1);
  const frame = region.getByRole('figure', {
    name: scope.figure,
    exact: true,
    includeHidden: true,
  });
  await expect(frame, 'Feature mockup must have exactly one figure in its role owner').toHaveCount(
    1,
  );
  const frameHandle = await frame.elementHandle();
  if (!frameHandle) throw new Error('The role-located frame has no current element');
  let resolved = false;
  try {
    const scopeSelector = await region.evaluate(
      (root, scope) => {
        if (scope.role === 'main') {
          if (root.localName !== 'main' && root.getAttribute('role') !== 'main')
            throw new Error('The role-located main is not a canonical main owner');
          const owner = root.id
            ? `${root.localName}[id=${JSON.stringify(root.id)}]`
            : root.localName === 'main'
              ? 'main'
              : `${root.localName}[role="main"]`;
          return `${owner} figure[aria-label=${JSON.stringify(scope.label)}]`;
        }
        const heading = root.getAttribute('aria-labelledby');
        if (!heading) throw new Error('Frame region has no canonical heading owner');
        return `${root.localName}[aria-labelledby=${JSON.stringify(heading)}] figure[aria-label=${JSON.stringify(scope.label)}]`;
      },
      { label: scope.figure, role: scope.role },
    );
    const ownership = await scopeWitness(frameHandle, scopeSelector);
    expect(ownership.matches, 'Feature mockup CSS scope must match exactly one figure').toBe(1);
    expect(ownership.sameElement, 'Feature mockup CSS scope must own the role-located figure').toBe(
      true,
    );
    expect(ownership.connected, 'Feature mockup figure must remain connected').toBe(true);
    resolved = true;
    return { region, frame, frameHandle, scopeSelector, ownership };
  } finally {
    if (!resolved) await frameHandle.dispose();
  }
}

export async function measurePublicFeatureMockup(
  browser: Browser,
  baseURL: string | undefined,
  testInfo: TestInfo,
  scene: PublicFeatureMockupScene,
  width: number,
  theme: 'light' | 'dark',
  prepare?: (
    page: Page,
    evidence: Record<string, unknown>,
  ) => Promise<{
    scope: PublicFeatureMockupScope;
    preserveScroll: boolean;
    assertRetained: (phase: string) => Promise<void>;
  }>,
) {
  const evidence: Record<string, unknown> = {
    scene,
    theme,
    width,
    repeatEachIndex: testInfo.repeatEachIndex,
    sourceTruth:
      'Authored example labels, capabilities, metrics and legal statements are unverified by this responsiveness instrument.',
    limits: [
      'One requested figure per named caller and listed case; unlisted figures and caller cases remain unmeasured.',
      'Reduced-motion geometry only; normal motion, interaction, accessibility and product truth are outside scope.',
      'Canonical font proof covers registered faces and Unicode coverage, not glyph fallback pixels.',
      'Typography includes every canonical text, control, pseudo and block witness in the validated figure scope.',
      'Contrast is required for text with at least 2px inside the fully opaque band of an approved fade on the figure; text wholly in the fading band is listed under fadedText and keeps every typography, containment and body-word requirement.',
      'Internal scrolling is not swept; unobserved scroll states fail rather than count as complete coverage.',
      'Raw descendant border boxes must fit the frame; internal scroll content needs a later scroll and containment proof.',
      'Original viewport strips cover independent frame/text/descendant document bounds without changing pointer mode or enlarging the viewport; clipping or unresolved paint still fails.',
      'Source hashes cover the listed inputs, not all transitive dependencies or runtime values.',
    ],
    contextClosed: false,
  };
  let context: BrowserContext | undefined;
  let frameHandle: ElementHandle<HTMLElement | SVGElement> | null = null;
  let failure: Error | undefined;
  let sources = [
    ...instrumentSources,
    path.relative(repositoryRoot, testInfo.file),
    ...scene.sourceFiles,
  ];
  try {
    if (!baseURL || testInfo.config.workers !== 1)
      throw new Error('Feature baseline requires a base URL and one worker');
    const routes = getPublicRouteInventory().routes.filter(
      (route) => route.path === scene.pathname,
    );
    expect(routes).toHaveLength(1);
    const route = routes[0]!;
    expect(route.context).toBe('signed-out');
    expect(route.unresolvedFlags).toEqual([]);
    sources = [...sources, ...route.sourceFiles.map((file) => path.relative(repositoryRoot, file))];
    evidence['sourceStart'] = snapshot(sources);
    context = await browser.newContext({
      baseURL,
      viewport: { width, height: 844 },
      colorScheme: theme,
      reducedMotion: 'reduce',
      hasTouch: true,
      storageState: { cookies: [], origins: [] },
    });
    expect(await context.storageState()).toEqual({ cookies: [], origins: [] });
    const page = await context.newPage();
    const destination = new URL(scene.pathname, baseURL);
    const expectation = {
      ...route,
      expectedOrigin: destination.origin,
      expectedQuery: destination.search,
    };
    evidence['initialReadiness'] = await settlePublicPage(page, expectation);
    const banner = page.getByRole('region', { name: 'Cookie consent', exact: true });
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Necessary only', exact: true }).click();
    await expect(banner).toHaveCount(0);
    const consent = parseCookieConsentRecord(
      await page.evaluate((key) => localStorage.getItem(key), COOKIE_CONSENT_STORAGE_KEY),
    );
    evidence['consent'] = consent;
    expect(consent).toMatchObject({ ...NECESSARY_ONLY_PREFERENCES });
    expect(isCookieConsentCurrent(consent)).toBe(true);
    evidence['readiness'] = await settlePublicPage(page, expectation);
    const preparation = await prepare?.(page, evidence);
    const scope = preparation?.scope ?? scene;
    evidence['resolvedScope'] = scope;
    if (scope.figure !== scene.figure)
      throw new Error('Prepared feature scope must keep the requested figure');
    const located = await locatePublicFeatureMockup(page, scope);
    const { region, frame, scopeSelector } = located;
    frameHandle = located.frameHandle;
    await expect(region).toHaveCount(1);
    evidence['matchedFrames'] = await frame.count();
    await expect(frame).toHaveCount(1);
    if (!preparation?.preserveScroll) await frame.scrollIntoViewIfNeeded();
    const header = page.getByRole('banner');
    await expect(header).toHaveCount(1);
    const headerBox = await header.boundingBox();
    if (!headerBox) throw new Error('Public header geometry is unmeasured');
    evidence['barBeforeScroll'] = await frame.evaluate(
      (root, headerBottom) => ({
        frameTop: root.getBoundingClientRect().top,
        headerBottom,
      }),
      headerBox.y + headerBox.height,
    );
    if (!preparation?.preserveScroll) {
      await frame.evaluate((root, headerBottom) => {
        window.scrollBy(0, root.getBoundingClientRect().top - headerBottom);
      }, headerBox.y + headerBox.height);
    }
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await preparation?.assertRetained('viewport-prepared');
    const barVisibility = await frame.evaluate((root) => {
      const bar = root.querySelector('.agi-dev-bar');
      const banner = document.querySelector('header');
      if (!bar || !banner) throw new Error('Native bar and header owners are missing');
      const rect = bar.getBoundingClientRect();
      const headerRect = banner.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        barTop: rect.top,
        headerBottom: headerRect.bottom,
        centerHitOwned: hit !== null && bar.contains(hit),
      };
    });
    evidence['barVisibility'] = barVisibility;
    expect(barVisibility.barTop).toBeGreaterThanOrEqual(barVisibility.headerBottom);
    expect(barVisibility.centerHitOwned).toBe(true);
    if (!frameHandle) throw new Error('The role-located frame has no current element');
    const ownership = await scopeWitness(frameHandle, scopeSelector);
    evidence['scopeOwnership'] = ownership;
    expect(ownership.matches).toBe(1);
    expect(ownership.sameElement).toBe(true);
    expect(ownership.connected).toBe(true);
    let fontFailure: Error | undefined;
    let fontProof: Awaited<ReturnType<typeof measurePublicFontProof>> | undefined;
    try {
      fontProof = await measurePublicFontProof(page, frame, fonts);
      evidence['fontProof'] = fontProof;
    } catch (error) {
      fontFailure = failureOf(error);
      evidence['fontProofError'] = error instanceof Error ? error.message : String(error);
    }
    const reading = await frameReading(frame);
    evidence['reading'] = reading;
    const maskPaint = await publicMaskPaintHandle(page);
    const typography = await page
      .evaluate(scanPublicTypography, {
        pageType: 'marketing' as const,
        pathname: scene.pathname,
        scopeSelector,
        maskPaint,
      })
      .finally(() => maskPaint.dispose());
    evidence['typography'] = typography;
    const bodyWordOptions = scene.bodyWords && {
      ...scene.bodyWords,
      fontProofFamilies: fontProof?.expectedFontProof ?? [],
    };
    const bodyWords = bodyWordOptions
      ? await measurePublicFeatureBodyWords(frame, typography, bodyWordOptions)
      : null;
    if (bodyWords) evidence['bodyWords'] = bodyWords;
    const samples = typography.samples;
    const masks = [
      ...reading.ancestry.map((element, index) => ({ ...element, frame: index === 0 })),
      ...reading.descendants.map((element) => ({ ...element, frame: false })),
    ]
      .filter((element) => element.mask !== 'none')
      .map(({ selector, mask, frame }) => ({ selector, mask, frame }));
    evidence['masks'] = masks;
    const fadeScope = scopePublicFadedText(samples, masks);
    const opaqueSamples = fadeScope.opaque;
    evidence['fadedText'] = fadeScope.faded.map(({ sourceKey, selector, text }) => ({
      sourceKey,
      selector,
      text,
    }));
    const contrast =
      typography.canvasColor && opaqueSamples.length
        ? evaluatePublicTextContrast(opaqueSamples, typography.canvasColor)
        : null;
    evidence['contrast'] = contrast;
    const boxes = [
      reading.rect,
      ...samples.flatMap((sample) => sample.rects),
      ...reading.descendants
        .filter(
          (element) =>
            element.rect.width > 0 &&
            element.rect.height > 0 &&
            element.display !== 'none' &&
            !['hidden', 'collapse'].includes(element.visibility) &&
            Number(element.opacity) > 0,
        )
        .map((element) => element.rect),
    ];
    const bounds = {
      left: Math.min(...boxes.map((box) => box.left)),
      top: Math.min(...boxes.map((box) => box.top)),
      right: Math.max(...boxes.map((box) => box.right)),
      bottom: Math.max(...boxes.map((box) => box.bottom)),
    };
    const containment = boxes.filter(
      (box) =>
        box.left < reading.rect.left - 1 ||
        box.right > reading.rect.right + 1 ||
        box.top < reading.rect.top - 1 ||
        box.bottom > reading.rect.bottom + 1,
    );
    evidence['outsideFrameBoxes'] = containment;
    const windowPosition = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    const clip = {
      x: Math.floor(bounds.left + windowPosition.x),
      y: Math.floor(bounds.top + windowPosition.y),
      width:
        Math.ceil(bounds.right + windowPosition.x) - Math.floor(bounds.left + windowPosition.x),
      height:
        Math.ceil(bounds.bottom + windowPosition.y) - Math.floor(bounds.top + windowPosition.y),
    };
    evidence['captureBounds'] = clip;
    await preparation?.assertRetained('before-capture');
    const beforeCapture = await frameReading(frame);
    evidence['beforeCapture'] = beforeCapture;
    let captureFailure: Error | undefined;
    let capture: PublicViewportCapture | undefined;
    try {
      capture = await capturePublicViewportStrips(page, frame, {
        stickyHeader: header,
        bounds: 'union',
        preserveScroll: preparation?.preserveScroll,
        sourceFiles: sources.map((file) => path.join(repositoryRoot, file)),
        outputPath: (index) => testInfo.outputPath(`frame-strip-${index}.png`),
      });
    } catch (error) {
      captureFailure = failureOf(error);
      if (error instanceof PublicViewportCaptureError) capture = error.capture;
      evidence['captureError'] = error instanceof Error ? error.message : String(error);
    }
    if (capture) {
      evidence['viewportCapture'] = capture.evidence;
      for (const original of capture.images) {
        const strip = capture.evidence.strips[original.index];
        if (
          !original.path ||
          !path.isAbsolute(original.path) ||
          !strip ||
          strip.index !== original.index ||
          strip.png.path !== original.path
        )
          throw new Error('Viewport strip original path is unmeasured');
        const name = `frame-strip-${original.index}.png`;
        const attachmentIndex = testInfo.attachments.length;
        await testInfo.attach(name, {
          path: original.path,
          contentType: 'image/png',
        });
        const attachment = testInfo.attachments[attachmentIndex];
        if (
          testInfo.attachments.length !== attachmentIndex + 1 ||
          !attachment ||
          attachment.name !== name ||
          attachment.contentType !== 'image/png' ||
          !attachment.path ||
          !path.isAbsolute(attachment.path) ||
          attachment.path === original.path ||
          attachment.body !== undefined
        )
          throw new Error('Viewport strip copied path attachment is unmeasured');
        const attachedBytes = readFileSync(attachment.path);
        const dimensions = publicCapturePngDimensions(attachedBytes);
        if (
          !attachedBytes.equals(original.bytes) ||
          dimensions.width !== strip.png.width ||
          dimensions.height !== strip.png.height ||
          createHash('sha256').update(attachedBytes).digest('hex') !== strip.png.hash
        )
          throw new Error('Viewport strip copied attachment differs from the original PNG');
      }
    }
    await preparation?.assertRetained('after-capture');
    const readingAfter = await frameReading(frame);
    evidence['readingAfter'] = readingAfter;
    const bodyWordsAfter = bodyWordOptions
      ? await measurePublicFeatureBodyWords(frame, typography, bodyWordOptions)
      : null;
    if (bodyWordsAfter) evidence['bodyWordsAfter'] = bodyWordsAfter;
    const ownershipAfter = await scopeWitness(frameHandle, scopeSelector);
    evidence['scopeOwnershipAfter'] = ownershipAfter;
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
    expect.soft(reading.rect.width).toBeGreaterThan(0);
    expect.soft(reading.rect.height).toBeGreaterThan(0);
    expect.soft(reading.rect.left).toBeGreaterThanOrEqual(-1);
    expect.soft(reading.rect.right).toBeLessThanOrEqual(reading.viewport.width + 1);
    expect.soft(reading.pageWidth).toBeLessThanOrEqual(reading.viewport.width + 1);
    expect.soft(reading.rows.length, 'Frame cannot pass without text').toBeGreaterThan(0);
    expect.soft(typography.scope, 'Canonical scope disagrees with the role-located frame').toEqual({
      selector: scopeSelector,
      elementIndex: ownership.elementIndex,
      tag: ownership.tag,
      label: ownership.label,
    });
    expect.soft(ownershipAfter, 'Exact frame ownership changed').toEqual(ownership);
    expect.soft(beforeCapture, 'Full frame state changed during the scan').toEqual(reading);
    expect.soft(readingAfter, 'Full frame state changed during capture').toEqual(beforeCapture);
    expect
      .soft(typography.coverage.textNodes, 'Canonical scanner text coverage changed')
      .toBe(reading.rows.length);
    expect
      .soft(
        samples
          .filter((sample) => sample.kind === 'text')
          .map((sample) => ({
            sourceKey: sample.sourceKey,
            selector: sample.selector,
            text: sample.text,
          })),
        'Every raw frame text node needs exactly one canonical sample',
      )
      .toEqual(
        reading.rows.map(({ sourceKey, selector, text }) => ({
          sourceKey,
          selector,
          text,
        })),
      );
    expect
      .soft(
        new Set(samples.map((sample) => sample.sourceKey)).size,
        'Canonical sample keys must be unique',
      )
      .toBe(samples.length);
    expect.soft(samples.length, 'Frame cannot pass without painted text').toBeGreaterThan(0);
    expect
      .soft(
        fadeScope.unapprovedMasks,
        'Only an approved fade on the figure itself may mask frame text',
      )
      .toEqual([]);
    expect
      .soft(fadeScope.unexplainedFaded, 'Text cannot count as faded without a figure fade')
      .toEqual([]);
    expect
      .soft(opaqueSamples.length, 'Frame cannot pass without text in its fully opaque band')
      .toBeGreaterThan(0);
    expect
      .soft(typography.findings, 'Scoped canonical text floors, scale, wrapping and clipping')
      .toEqual([]);
    expect.soft(typography.unmeasured, 'Scoped geometry must be measured').toEqual([]);
    expect.soft(typography.excluded, 'No frame text may disappear from measurement').toEqual([]);
    expect
      .soft(containment, 'Text and descendant boxes must remain inside their frame')
      .toEqual([]);
    expect.soft(captureFailure, 'Viewport strip capture failed').toBeUndefined();
    expect.soft(capture, 'Original strip coverage is missing').toBeDefined();
    if (capture && !captureFailure) {
      assertPublicViewportCapture(capture);
      expect
        .soft(capture.evidence.target, 'Capture bounds differ from independent visible geometry')
        .toEqual(clip);
      expect.soft(capture.images.length).toBe(capture.evidence.strips.length);
    }
    expect.soft(contrast, 'Contrast needs painted text and an opaque canvas').not.toBeNull();
    if (contrast) {
      expect.soft(contrast.findings).toEqual([]);
      expect.soft(contrast.unmeasured).toEqual([]);
      expect.soft(contrast.coverage.measured).toBe(opaqueSamples.length);
    }
    expect.soft(fontFailure, 'Scoped font proof failed').toBeUndefined();
    if (bodyWords) {
      expect
        .soft(bodyWords.coverage.owners, 'Body word contract must own prose')
        .toBeGreaterThan(0);
      expect
        .soft(bodyWords.coverage.ordinaryWords, 'Body word contract needs ordinary words')
        .toBeGreaterThan(0);
      expect.soft(bodyWords.findings, 'Ordinary body words must remain on one line').toEqual([]);
      expect.soft(bodyWords.unmeasured, 'Body word geometry must be proven').toEqual([]);
      expect
        .soft(bodyWordsAfter, 'Body word sources and geometry changed during capture')
        .toEqual(bodyWords);
    }
    expect(page.url()).toBe(destination.href);
    if (testInfo.errors.length)
      throw new Error('Feature mockup retains failed or unmeasured witnesses');
  } catch (error) {
    failure = failureOf(error);
  } finally {
    try {
      await frameHandle?.dispose();
    } catch (error) {
      evidence['frameHandleDisposeError'] = String(error);
      failure ??= failureOf(error);
    }
    try {
      await context?.close();
      evidence['contextClosed'] = context !== undefined;
    } catch (error) {
      evidence['contextCloseError'] = String(error);
      failure ??= failureOf(error);
    }
    try {
      evidence['sourceEnd'] = snapshot(sources);
      evidence['sourceUnchanged'] =
        JSON.stringify(evidence['sourceStart']) === JSON.stringify(evidence['sourceEnd']);
      if (!evidence['sourceUnchanged'])
        failure ??= new Error('Feature source changed during measurement');
    } catch (error) {
      evidence['sourceEndError'] = String(error);
      failure ??= failureOf(error);
    }
    evidence['status'] = failure ? 'failed' : 'passed';
    if (failure) evidence['error'] = failure.message;
    try {
      await testInfo.attach('feature-mockup.json', {
        body: Buffer.from(JSON.stringify(evidence, null, 2)),
        contentType: 'application/json',
      });
    } catch (error) {
      evidence['reportAttachError'] = String(error);
      failure ??= failureOf(error);
      evidence['status'] = 'failed';
      evidence['error'] = failure.message;
    }
  }
  if (failure) throw failure;
}
