import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

import {
  COOKIE_CONSENT_STORAGE_KEY,
  isCookieConsentCurrent,
  NECESSARY_ONLY_PREFERENCES,
  parseCookieConsentRecord,
} from '../shared/lib/cookie-consent';
import {
  measurePublicFontProof,
  PublicReadinessFontError,
  settlePublicPage,
} from './lib/public-page-readiness';
import { getPublicRouteInventory } from './lib/public-route-inventory';
import { scanPublicTypography, type PublicTypographyOptions } from './lib/public-typography';

const widths = [320, 390, 1440] as const;
const themes = ['light', 'dark'] as const;
const routePaths = ['/web', '/features'] as const;
const frameSelector = 'figure.agi-web-responsive[data-device="web"]';
type Evidence = Record<string, unknown>;
const repositoryRoot = path.resolve(__dirname, '../../..');
const captureRun = `${Date.now()}-${process.pid}`;
const sourcePaths = [
  'apps/web/app/web/page.tsx',
  'apps/web/app/features/page.tsx',
  'apps/web/features/marketing/components/DeviceMockups.tsx',
  'apps/web/features/marketing/components/mockup-responsive.css',
  'apps/web/features/marketing/components/legacy-landing.css',
  'apps/web/features/marketing/components/legacy-pages.css',
  'apps/web/features/marketing/components/system/ScrollFeatures.tsx',
  'apps/web/features/marketing/components/system/system.css',
  'packages/ui/design-tokens/src/tailwind.css',
  'apps/web/e2e/lib/public-page-readiness.ts',
  'apps/web/e2e/lib/public-typography.ts',
  'apps/web/e2e/lib/public-route-inventory.ts',
  'apps/web/e2e/public-web-mockup.spec.ts',
];

function sourceSnapshot() {
  return Object.fromEntries(
    sourcePaths.map((file) => [
      file,
      createHash('sha256')
        .update(readFileSync(path.join(repositoryRoot, file)))
        .digest('hex'),
    ]),
  );
}

async function themeState(page: Page) {
  return page.evaluate(() => ({
    marker: document.documentElement.dataset['theme'],
    light: document.documentElement.classList.contains('light'),
    dark: document.documentElement.classList.contains('dark'),
    scheme: getComputedStyle(document.documentElement).colorScheme,
    prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
  }));
}

async function frameGeometry(frame: Locator) {
  return frame.evaluate((root) => {
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const select = (selector: string) => {
      const element = root.querySelector(selector);
      if (!element) throw new Error(`Missing Web mockup part: ${selector}`);
      return element;
    };
    const ancestors = [];
    for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const css = getComputedStyle(ancestor);
      const rect = ancestor.getBoundingClientRect();
      const x = ['hidden', 'clip'].includes(css.overflowX);
      const y = ['hidden', 'clip'].includes(css.overflowY);
      const clipPath = css.clipPath;
      const mask = css.maskImage;
      const clipMargin = css.getPropertyValue('overflow-clip-margin');
      const documentPort = ancestor === document.body || ancestor === document.documentElement;
      const unknown = [];
      if (clipPath !== 'none') unknown.push('non-rectangular-clip-path');
      if (mask !== 'none') unknown.push('ancestor-mask');
      if (
        (css.overflowX === 'clip' || css.overflowY === 'clip') &&
        !/^(?:(?:padding-box) )?0(?:px)?$/.test(clipMargin.trim())
      )
        unknown.push('overflow-clip-margin');
      const transform = css.transform === 'none' ? null : new DOMMatrixReadOnly(css.transform);
      if (
        transform &&
        (!transform.is2D ||
          Math.abs(transform.a - 1) > 0.0001 ||
          Math.abs(transform.d - 1) > 0.0001 ||
          Math.abs(transform.b) > 0.0001 ||
          Math.abs(transform.c) > 0.0001)
      )
        unknown.push('non-translation-transform');
      ancestors.push({
        tag: ancestor.localName,
        className: ancestor.className,
        documentPort,
        overflowX: css.overflowX,
        overflowY: css.overflowY,
        clipX: x,
        clipY: y,
        clipPath,
        mask,
        clipMargin,
        transform: css.transform,
        unknown,
        rect: box(ancestor),
        port: {
          left: rect.left + ancestor.clientLeft,
          top: rect.top + ancestor.clientTop,
          right: rect.left + ancestor.clientLeft + ancestor.clientWidth,
          bottom: rect.top + ancestor.clientTop + ancestor.clientHeight,
        },
      });
    }
    return {
      frame: box(root),
      shell: box(select('.agi-dev-shell')),
      bar: box(select('.agi-dev-bar')),
      body: box(select('.agi-web')),
      sidebar: box(select('.agi-desk-side')),
      chat: box(select('.agi-mk-main')),
      composer: box(select('.agi-mk-composer')),
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      mask: getComputedStyle(root).maskImage,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      viewportX: scrollX,
      viewportY: scrollY,
      ancestors,
      hiddenAncestor: root.closest('[hidden],[inert],[aria-hidden="true"]')?.localName ?? null,
    };
  });
}

async function captureFrame(
  page: Page,
  frame: Locator,
  evidence: Evidence,
  testInfo: TestInfo,
  name: string,
) {
  const before = await frameGeometry(frame);
  evidence['captureBefore'] = before;
  const left = Math.max(0, before.frame.left);
  const top = Math.max(0, before.frame.top);
  const right = Math.min(before.viewportWidth, before.frame.right);
  const bottom = Math.min(before.viewportHeight, before.frame.bottom);
  const clip = {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
  evidence['captureClip'] = clip;
  evidence['captureCoverage'] =
    left === before.frame.left &&
    top === before.frame.top &&
    right === before.frame.right &&
    bottom === before.frame.bottom
      ? 'entire-frame'
      : 'visible-frame-intersection';
  try {
    if (!(clip.width > 0 && clip.height > 0))
      throw new Error('Unmeasured screenshot: Web frame has no viewport intersection');
    const destination = path.join(
      repositoryRoot,
      '.tmp/codex-public-site/baseline/web-mockup-native',
      captureRun,
      testInfo.testId,
      `${name}.png`,
    );
    const png = await page.screenshot({ path: destination, clip, type: 'png' });
    const dimensions = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
    evidence['capture'] = {
      path: destination,
      sha256: createHash('sha256').update(png).digest('hex'),
      bytes: png.length,
      dimensions,
    };
    await testInfo.attach(`${name}.png`, { path: destination, contentType: 'image/png' });
    const after = await frameGeometry(frame);
    evidence['captureAfter'] = after;
    expect(
      after,
      'Web frame geometry or clipping changed while its native PNG was captured',
    ).toEqual(before);
    expect(Math.abs(dimensions.width - clip.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(dimensions.height - clip.height)).toBeLessThanOrEqual(1);
  } catch (error) {
    evidence['captureError'] = error instanceof Error ? error.message : String(error);
    throw error;
  }
  return before;
}

test('Web mockup capture instrument retains the native viewport intersection after scroll', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(
    '<style>body{margin:0}#spacer{height:300px}figure{margin:0 20px;width:350px;height:1100px;background:rgb(20,30,40)}.agi-dev-shell{height:1100px}.agi-dev-bar{height:64px;background:rgb(40,60,80)}.agi-web{height:1036px}.agi-mk-composer{height:100px;background:rgb(80,100,120)}</style><main><div id="spacer"></div><figure class="agi-web-responsive"><div class="agi-dev-shell"><div class="agi-dev-bar">Window</div><div class="agi-web"><aside class="agi-desk-side">Navigation</aside><div class="agi-mk-main">Conversation<div class="agi-mk-composer">Composer</div></div></div></div></figure></main>',
  );
  await page.evaluate(async () => {
    scrollTo({ top: 205, behavior: 'instant' });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  const frame = page.locator('figure');
  expect(await page.evaluate(() => scrollY)).toBe(205);
  const original = await frame.boundingBox();
  expect(original).toEqual({ x: 20, y: 95, width: 350, height: 1100 });
  const expectedClip = { x: 20, y: 95, width: 350, height: 749 };
  const reference = await page.screenshot({ clip: expectedClip, type: 'png' });
  const wrongCoordinateCapture = await page.screenshot({
    clip: { ...expectedClip, y: expectedClip.y + 205 },
    type: 'png',
  });
  expect(wrongCoordinateCapture.readUInt32BE(20)).toBe(544);
  expect(wrongCoordinateCapture.equals(reference)).toBe(false);
  const evidence: Evidence = {};
  try {
    await captureFrame(page, frame, evidence, testInfo, 'fixture-scrolled-web');
    expect(evidence['captureClip']).toEqual(expectedClip);
    const capture = evidence['capture'] as {
      path: string;
      dimensions: { width: number; height: number };
    };
    expect(capture.dimensions).toEqual({ width: 350, height: 749 });
    expect(readFileSync(capture.path).equals(reference)).toBe(true);
  } finally {
    await testInfo.attach('scrolled-capture-state.json', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
  }
});

test('Web mockup capture instrument rejects document coordinates beyond the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(
    '<style>body{margin:0}main{height:2000px}aside{margin-top:1000px;height:100px;background:rgb(20,30,40)}</style><main>Viewport witness<aside>Below-fold witness</aside></main>',
  );
  await page.evaluate(async () => {
    scrollTo({ top: 1000, behavior: 'instant' });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  expect(await page.evaluate(() => scrollY)).toBe(1000);
  await expect(
    page.screenshot({ clip: { x: 0, y: 1000, width: 390, height: 100 }, type: 'png' }),
  ).rejects.toThrow('Clipped area is either empty or outside');
  const viewportCapture = await page.screenshot({
    clip: { x: 0, y: 0, width: 390, height: 100 },
    type: 'png',
  });
  expect(viewportCapture.readUInt32BE(16)).toBe(390);
  expect(viewportCapture.readUInt32BE(20)).toBe(100);
});

async function prepareFrameViewport(page: Page, frame: Locator, evidence: Evidence) {
  const before = await frameGeometry(frame);
  evidence['viewportBefore'] = before;
  if (before.hiddenAncestor) throw new Error('Web frame has a hidden or inert ancestor');
  const state = await frame.evaluate((element) => {
    const stickyAncestors = [];
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
      if (getComputedStyle(ancestor).position === 'sticky')
        stickyAncestors.push({ tag: ancestor.localName, className: ancestor.className });
    }
    const visual = element.closest('.agi-ds-scrollfeature-visual');
    return {
      connected: element.isConnected,
      stickyAncestors,
      selectedVisual: visual?.hasAttribute('data-active') ?? false,
    };
  });
  const intersects =
    Math.min(before.frame.right, before.viewportWidth) > Math.max(before.frame.left, 0) &&
    Math.min(before.frame.bottom, before.viewportHeight) > Math.max(before.frame.top, 0);
  const preserve = state.stickyAncestors.length > 0 && state.selectedVisual && intersects;
  evidence['viewportPreparation'] = {
    ...state,
    intersects,
    action: preserve ? 'preserve-intersecting-selected-sticky-frame' : 'scroll-into-view',
  };
  expect(state.connected).toBe(true);
  if (!preserve) await frame.scrollIntoViewIfNeeded();
  await page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  const after = await frameGeometry(frame);
  evidence['viewportAfter'] = after;
  if (after.hiddenAncestor) throw new Error('Web frame has a hidden or inert ancestor');
  if (preserve) {
    expect(after.viewportX, 'Preserving the selected sticky frame changed window scroll').toBe(
      before.viewportX,
    );
    expect(after.viewportY, 'Preserving the selected sticky frame changed window scroll').toBe(
      before.viewportY,
    );
  }
}

async function selectStoryFrame(
  firstArticle: Locator,
  stage: Locator,
  width: number,
  evidence: Evidence,
) {
  const inline = firstArticle.locator('.agi-ds-scrollfeature-visual--inline');
  await expect(stage).toHaveCount(1);
  await expect(inline).toHaveCount(1);
  const observe = (wrapper: Locator) =>
    wrapper.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const css = getComputedStyle(element);
      let displaySuppressed = false;
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        const parentCss = getComputedStyle(ancestor);
        if (parentCss.display === 'none' || ['hidden', 'collapse'].includes(parentCss.visibility))
          displaySuppressed = true;
      }
      return {
        connected: element.isConnected,
        display: css.display,
        visibility: css.visibility,
        width: rect.width,
        height: rect.height,
        displayed: element.isConnected && !displaySuppressed && rect.width > 0 && rect.height > 0,
      };
    });
  const stageState = await observe(stage);
  const inlineState = await observe(inline);
  evidence['presentation'] = { requestedWidth: width, stage: stageState, inline: inlineState };
  expect(stageState.connected).toBe(true);
  expect(inlineState.connected).toBe(true);
  if (stageState.displayed === inlineState.displayed)
    throw new Error(
      'Unmeasured story presentation: exactly one inline or stage layout must display',
    );
  const presentation = inlineState.displayed ? 'inline' : 'stage';
  return {
    presentation,
    frame:
      presentation === 'inline'
        ? inline.locator(frameSelector)
        : stage.locator('.agi-ds-scrollfeature-visual').first().locator(frameSelector),
  };
}

async function assertStorySelection(
  article: Locator,
  frame: Locator,
  evidence: Evidence,
  phase: string,
) {
  const story = await article.evaluate((element) => ({
    connected: element.isConnected,
    active: element.getAttribute('data-active'),
    scrollY,
  }));
  const visual = await frame.evaluate((element) => ({
    connected: element.isConnected,
    hiddenAncestor: element.closest('[hidden],[inert],[aria-hidden="true"]')?.localName ?? null,
    inline: Boolean(element.closest('.agi-ds-scrollfeature-visual--inline')),
    active: element.closest('.agi-ds-scrollfeature-visual')?.getAttribute('data-active') ?? null,
    scrollY,
  }));
  evidence[phase] = { story, visual };
  expect(story.connected, `Selected story disconnected after ${phase}`).toBe(true);
  expect(story.active, `Native Observer changed the selected story after ${phase}`).toBe('true');
  expect(visual.connected, `Selected Web frame disconnected after ${phase}`).toBe(true);
  expect(visual.hiddenAncestor, `Selected Web frame became hidden after ${phase}`).toBeNull();
  if (!visual.inline)
    expect(visual.active, `Native Observer changed the selected visual after ${phase}`).toBe(
      'true',
    );
}

async function measureFrame(
  page: Page,
  frame: Locator,
  pathname: string,
  width: number,
  evidence: Evidence,
  testInfo: TestInfo,
  name: string,
  selectedStory?: Locator,
) {
  evidence['matchedFrames'] = await frame.count();
  await expect(frame).toHaveCount(1);
  await expect(frame).toBeVisible();
  await prepareFrameViewport(page, frame, evidence);
  if (selectedStory) await assertStorySelection(selectedStory, frame, evidence, 'prepared');
  const geometry = await captureFrame(page, frame, evidence, testInfo, name);
  evidence['geometry'] = geometry;
  if (selectedStory) await assertStorySelection(selectedStory, frame, evidence, 'captured');
  const typographyOptions: PublicTypographyOptions = { pageType: 'marketing', pathname };
  const typography = await page.evaluate(scanPublicTypography, typographyOptions);
  evidence['typography'] = typography;
  const textMap = await frame.evaluate((root) => {
    const family = (value: string) =>
      (value.split(',')[0] ?? '')
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .toLowerCase();
    const expectedFamily = (variable: string) =>
      family(
        getComputedStyle(document.body).getPropertyValue(variable) ||
          getComputedStyle(document.documentElement).getPropertyValue(variable),
      );
    const rows = [];
    let counted = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style,noscript,textarea,option')) continue;
      const text = node.data.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      counted += 1;
      if (!root.contains(parent)) continue;
      const css = getComputedStyle(parent);
      rows.push({
        sourceKey: `text:${counted}`,
        text,
        family: family(css.fontFamily),
        body: Boolean(parent.closest('.agi-mk-user,.agi-mk-ghost,.agi-desk-brand,td')),
        codepoints: [
          ...new Set(
            [...node.data]
              .filter((letter) => !/\s/u.test(letter))
              .map((letter) => `U+${(letter.codePointAt(0) ?? 0).toString(16).toUpperCase()}`),
          ),
        ],
      });
    }
    return {
      rows,
      counted,
      expectedSans: expectedFamily('--font-geist-sans'),
      expectedMono: expectedFamily('--font-geist-mono'),
    };
  });
  evidence['textMap'] = textMap;
  const samples = textMap.rows.flatMap((row) =>
    typography.samples.filter((sample) => sample.sourceKey === row.sourceKey),
  );
  evidence['samples'] = samples;
  const scopedClipping = typography.findings.filter(
    (finding) =>
      finding.kind === 'text-clipped' &&
      samples.some(
        (sample) => sample.selector === finding.selector && sample.text === finding.text,
      ),
  );
  evidence['scopedClipping'] = scopedClipping;
  const scopedUnknownGeometry = typography.unmeasured.filter(
    (finding) =>
      finding.kind !== 'unobserved-scroll-state' &&
      samples.some((sample) =>
        finding.sourceKey
          ? sample.sourceKey === finding.sourceKey
          : sample.selector === finding.selector && sample.text === finding.text,
      ),
  );
  const scopedUnknownPaint = samples.flatMap((sample) =>
    sample.paintUnmeasured
      .filter((kind) => kind !== 'unobserved-scroll-state')
      .map((kind) => ({ kind, sourceKey: sample.sourceKey, text: sample.text })),
  );
  evidence['scopedUnknownGeometry'] = scopedUnknownGeometry;
  evidence['scopedUnknownPaint'] = scopedUnknownPaint;
  expect(scopedClipping, 'Web mockup text is permanently clipped').toEqual([]);
  expect(scopedUnknownGeometry, 'Web text clipping or geometry is unmeasured').toEqual([]);
  expect(scopedUnknownPaint, 'Web text paint is unmeasured').toEqual([]);
  expect(geometry.hiddenAncestor).toBeNull();
  expect(geometry.frame.width).toBeGreaterThan(0);
  expect(geometry.frame.height).toBeGreaterThan(0);
  expect(geometry.mask).toBe('none');
  expect(geometry.frame.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.frame.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  for (const part of [geometry.bar, geometry.body, geometry.composer]) {
    expect(part.top).toBeGreaterThanOrEqual(geometry.shell.top - 1);
    expect(part.bottom).toBeLessThanOrEqual(geometry.shell.bottom + 1);
    expect(part.left).toBeGreaterThanOrEqual(geometry.shell.left - 1);
    expect(part.right).toBeLessThanOrEqual(geometry.shell.right + 1);
  }
  if (width < 768) expect(geometry.sidebar.bottom).toBeLessThanOrEqual(geometry.chat.top + 1);
  for (const ancestor of geometry.ancestors) {
    expect(
      ancestor.unknown,
      `Unmeasured ancestor clipping: ${ancestor.tag}.${ancestor.className}`,
    ).toEqual([]);
    if (ancestor.documentPort) continue;
    for (const part of [geometry.frame, geometry.composer]) {
      if (ancestor.clipX) {
        expect(
          part.left,
          `Ancestor clips Web frame horizontally: ${ancestor.className}`,
        ).toBeGreaterThanOrEqual(ancestor.port.left - 1);
        expect(
          part.right,
          `Ancestor clips Web frame horizontally: ${ancestor.className}`,
        ).toBeLessThanOrEqual(ancestor.port.right + 1);
      }
      if (ancestor.clipY) {
        expect(
          part.top,
          `Ancestor clips Web frame vertically: ${ancestor.className}`,
        ).toBeGreaterThanOrEqual(ancestor.port.top - 1);
        expect(
          part.bottom,
          `Ancestor clips Web frame vertically: ${ancestor.className}`,
        ).toBeLessThanOrEqual(ancestor.port.bottom + 1);
      }
    }
  }
  expect(textMap.counted, 'Canonical typography text identity changed during measurement').toBe(
    typography.coverage.textNodes,
  );
  expect(textMap.rows.length, 'A missing Web mockup cannot certify its text floor').toBeGreaterThan(
    0,
  );
  expect(textMap.expectedSans, 'Missing canonical Geist CSS variable').not.toBe('');
  expect(textMap.expectedMono, 'Missing canonical Geist Mono CSS variable').not.toBe('');
  for (const row of textMap.rows) {
    const matching = typography.samples.filter((sample) => sample.sourceKey === row.sourceKey);
    expect(matching, `Missing or duplicate painted Web text: ${row.text}`).toHaveLength(1);
    const sample = matching[0]!;
    expect(sample.text).toBe(row.text);
    expect(sample.renderedSize, `Unmeasured rendered size: ${row.text}`).not.toBeNull();
    expect(sample.scaleX, `Unmeasured horizontal scale: ${row.text}`).not.toBeNull();
    expect(sample.scaleY, `Unmeasured vertical scale: ${row.text}`).not.toBeNull();
    expect(sample.scaleX!).toBeCloseTo(1, 3);
    expect(sample.scaleY!).toBeCloseTo(1, 3);
    const floor = row.body ? 17 : sample.mono ? 15 : 14;
    expect(sample.declaredSize, row.text).toBeGreaterThanOrEqual(floor - 0.01);
    expect(sample.renderedSize!, row.text).toBeGreaterThanOrEqual(floor - 0.01);
    expect(
      sample.fontFamily
        .split(',')[0]
        ?.trim()
        .replace(/^['"]|['"]$/g, '')
        .toLowerCase(),
    ).toBe(sample.mono ? textMap.expectedMono : textMap.expectedSans);
  }
  const fontProof = await measurePublicFontProof(page, frame, [
    { cssVariable: '--font-geist-sans' },
    { cssVariable: '--font-geist-mono' },
  ]);
  evidence['fontProof'] = fontProof;
  expect(
    fontProof.fontCoverageGaps,
    'Actual Web text contains unsupported canonical-font glyphs',
  ).toEqual([]);
  if (selectedStory) await assertStorySelection(selectedStory, frame, evidence, 'measured');
  return { geometry, textMap, samples, fontProof };
}

async function focusAndScroll(page: Page, frame: Locator, evidence: Evidence) {
  const region = frame.getByRole('region', {
    name: 'Example comparison of EU AI Act duties',
    exact: true,
  });
  await expect(region).toHaveCount(1);
  await expect(region).toHaveAttribute('tabindex', '0');
  await region.scrollIntoViewIfNeeded();
  const pointer = await region.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const owner = document.elementFromPoint(x, y);
    return {
      width: rect.width,
      height: rect.height,
      x,
      y,
      insideViewport: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight,
      ownsCenter: owner !== null && (owner === element || element.contains(owner)),
      pointerEvents: getComputedStyle(element).pointerEvents,
    };
  });
  evidence['pointer'] = pointer;
  expect(pointer.insideViewport).toBe(true);
  expect(pointer.ownsCenter).toBe(true);
  expect(pointer.pointerEvents).toBe('auto');
  await region.click();
  await expect(region).toBeFocused();
  const entry = await region.evaluate((element) => {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]'),
    ).filter((candidate) => {
      if (
        candidate.tabIndex < 0 ||
        candidate.matches(':disabled') ||
        candidate.closest('[hidden],[inert],[aria-hidden="true"]')
      )
        return false;
      for (let parent: Element | null = candidate; parent; parent = parent.parentElement) {
        const css = getComputedStyle(parent);
        if (css.display === 'none' || ['hidden', 'collapse'].includes(css.visibility)) return false;
      }
      return true;
    });
    if (candidates.some((candidate) => candidate.tabIndex > 0))
      throw new Error('Scoped Tab entry cannot assume a positive-tabindex order');
    const index = candidates.indexOf(element as HTMLElement);
    const previous = candidates[index - 1];
    if (index < 1 || !previous) throw new Error('No observed preceding native Tab stop');
    previous.focus({ preventScroll: true });
    if (document.activeElement !== previous)
      throw new Error('Preceding native Tab stop did not focus');
    return {
      tag: previous.localName,
      label: previous.getAttribute('aria-label') ?? previous.textContent?.trim(),
      setup:
        'Focus the preceding current native Tab stop with preventScroll, then press native Tab.',
    };
  });
  evidence['entry'] = entry;
  await page.keyboard.press('Tab');
  await expect(region).toBeFocused();
  const focus = await region.evaluate((element) => {
    const css = getComputedStyle(element);
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const pen = canvas.getContext('2d');
    let outlineAlpha: number | null = null;
    if (pen && css.outlineColor) {
      pen.fillStyle = '#010203';
      pen.fillStyle = css.outlineColor;
      const first = pen.fillStyle;
      pen.fillStyle = '#040506';
      pen.fillStyle = css.outlineColor;
      if (first === pen.fillStyle) {
        pen.fillRect(0, 0, 1, 1);
        outlineAlpha = pen.getImageData(0, 0, 1, 1).data[3]! / 255;
      }
    }
    return {
      focusVisible: element.matches(':focus-visible'),
      outlineStyle: css.outlineStyle,
      outlineWidth: Number.parseFloat(css.outlineWidth),
      outlineColor: css.outlineColor,
      outlineAlpha,
      hiddenAncestor: element.closest('[hidden],[inert],[aria-hidden="true"]')?.localName ?? null,
      start: element.scrollLeft,
      maximum: element.scrollWidth - element.clientWidth,
      overflowX: css.overflowX,
    };
  });
  evidence['focus'] = focus;
  expect(focus.hiddenAncestor).toBeNull();
  expect(focus.focusVisible).toBe(true);
  expect(focus.outlineStyle).not.toBe('none');
  expect(focus.outlineWidth).toBeGreaterThan(0);
  expect(focus.outlineAlpha, 'Unmeasured native outline alpha').not.toBeNull();
  expect(focus.outlineAlpha!).toBeGreaterThan(0);
  if (focus.maximum > 1) {
    expect(['auto', 'scroll']).toContain(focus.overflowX);
    for (let index = 0; index < 16; index += 1) await page.keyboard.press('ArrowRight');
    await expect
      .poll(() => region.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(focus.start);
    await expect
      .poll(() =>
        region.evaluate((element) =>
          Math.abs(element.scrollLeft - (element.scrollWidth - element.clientWidth)),
        ),
      )
      .toBeLessThanOrEqual(1);
    const rightEdge = await region.evaluate((element) => {
      const table = element.querySelector('table');
      if (!table) throw new Error('The scroll region lost its comparison table');
      const rect = element.getBoundingClientRect();
      return {
        scrollLeft: element.scrollLeft,
        tableRight: table.getBoundingClientRect().right,
        portRight: rect.left + element.clientLeft + element.clientWidth,
      };
    });
    evidence['rightEdge'] = rightEdge;
    expect(
      rightEdge.tableRight,
      'Native scrolling did not reveal the comparison right edge',
    ).toBeLessThanOrEqual(rightEdge.portRight + 1);
    await expect(region).toBeFocused();
    for (let index = 0; index < 20; index += 1) await page.keyboard.press('ArrowLeft');
    await expect
      .poll(() => region.evaluate((element) => element.scrollLeft))
      .toBeLessThanOrEqual(1);
  }
  evidence['finalScroll'] = await region.evaluate((element) => element.scrollLeft);
}

async function activateScrollStory(article: Locator, evidence: Evidence) {
  evidence['activationBefore'] = await article.evaluate((element) => ({
    top: element.getBoundingClientRect().top,
    bottom: element.getBoundingClientRect().bottom,
    viewportHeight: innerHeight,
    scrollY,
    active: element.getAttribute('data-active'),
  }));
  evidence['nativeScroll'] = await article.evaluate(async (element) => {
    const rect = element.getBoundingClientRect();
    const target = scrollY + rect.top + rect.height / 2 - innerHeight / 2;
    scrollTo({ top: target, behavior: 'instant' });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return {
      target,
      scrollY,
      actualTop: element.getBoundingClientRect().top,
      actualBottom: element.getBoundingClientRect().bottom,
      viewportHeight: innerHeight,
    };
  });
  await expect(article, 'Native scrolling must activate the actual story Observer').toHaveAttribute(
    'data-active',
    'true',
  );
  evidence['activation'] = await article.evaluate((element) => ({
    top: element.getBoundingClientRect().top,
    bottom: element.getBoundingClientRect().bottom,
    viewportHeight: innerHeight,
    scrollY,
    active: element.getAttribute('data-active'),
  }));
}

test('Web mockup story instrument activates the actual native observer band', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(
    '<style>body{margin:0}.spacer{height:500px}article{height:200px}.gap{height:600px}#second{height:400px}.tail{height:900px}</style><main><div class="spacer"></div><article id="first">First story</article><div class="gap"></div><article id="second">Second story</article><div class="tail"></div></main><script>window.observedStories=[];const stories=[...document.querySelectorAll("article")];const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;for(const story of stories){if(story===entry.target)story.setAttribute("data-active","true");else story.removeAttribute("data-active")}window.observedStories.push(entry.target.id)}},{rootMargin:"-45% 0px -45% 0px",threshold:0});for(const story of stories)observer.observe(story)</script>',
  );
  const first = page.locator('#first');
  const second = page.locator('#second');
  await page.evaluate(() => scrollTo({ top: 1050, behavior: 'instant' }));
  await expect(second).toHaveAttribute('data-active', 'true');
  await page.evaluate(async () => {
    scrollTo({ top: 400, behavior: 'instant' });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  expect(await first.boundingBox()).toMatchObject({ y: 100, height: 200 });
  await expect(second).toHaveAttribute('data-active', 'true');
  const evidence: Evidence = {};
  try {
    await activateScrollStory(first, evidence);
    await expect(first).toHaveAttribute('data-active', 'true', { timeout: 1000 });
    await expect(second).not.toHaveAttribute('data-active', 'true');
  } finally {
    await testInfo.attach('native-story-activation.json', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
  }
});

test('Web mockup font proof rejects an unsupported glyph added after page readiness', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('http://web-mockup-fixture.invalid/**', (request) => {
    if (new URL(request.request().url()).pathname.endsWith('.woff2'))
      return request.fulfill({
        contentType: 'font/woff2',
        body: readFileSync(
          path.join(
            repositoryRoot,
            'apps/web/public/fonts/opendyslexic/OpenDyslexic-Regular.woff2',
          ),
        ),
      });
    return request.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<style>@font-face{font-family:FixtureFont;src:url("/fixture-font.woff2");unicode-range:U+0041-005A}:root{--font-geist-sans:FixtureFont;--font-geist-mono:FixtureFont}body{margin:0;font-family:FixtureFont;font-size:17px}figure{margin:20px;width:350px}.agi-dev-shell{border:1px solid black}.agi-dev-bar{height:30px}.agi-desk-side{height:30px}.agi-mk-main{height:100px}.agi-mk-composer{height:30px}</style><main><figure class="agi-web-responsive"><div class="agi-dev-shell"><div class="agi-dev-bar">ABC</div><div class="agi-web"><aside class="agi-desk-side">ABC</aside><div class="agi-mk-main"><span id="late-font">ABC</span><div class="agi-mk-composer">ABC</div></div></div></div></figure></main>',
    });
  });
  const readiness = await settlePublicPage(
    page,
    {
      path: 'http://web-mockup-fixture.invalid/fixture',
      expectedHttpStatuses: [200],
      expectedFinalPath: '/fixture',
      expectedOrigin: 'http://web-mockup-fixture.invalid',
      expectedQuery: '',
    },
    {
      samples: 3,
      intervalMs: 20,
      readinessTimeout: 1000,
      expectedFonts: [{ cssVariable: '--font-geist-sans' }],
    },
  );
  expect(readiness.fontCoverageGaps).toEqual([]);
  await page.locator('#late-font').evaluate((element) => {
    element.textContent = 'ABC→';
  });
  await expect(page.locator('#late-font')).toHaveText('ABC→');
  const evidence: Evidence = { initialFontCoverageGaps: readiness.fontCoverageGaps };
  try {
    await expect(
      measureFrame(page, page.locator('figure'), '/web', 390, evidence, testInfo, 'late-glyph-web'),
    ).rejects.toThrow('Actual Web text contains unsupported canonical-font glyphs');
  } finally {
    await testInfo.attach('late-glyph-font-proof.json', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
  }
});

const storyFixtureFrame = `<figure class="agi-web-responsive" data-device="web"><div class="agi-dev-shell"><div class="agi-dev-bar">ABC</div><div class="agi-web"><aside class="agi-desk-side">ABC</aside><div class="agi-mk-main"><a href="#first">ABC</a><div class="agi-web-table-region" role="region" aria-label="Example comparison of EU AI Act duties" tabindex="0"><table><tbody><tr><td>ABC</td><td>ABC</td><td>ABC</td></tr></tbody></table></div><div class="agi-mk-composer">ABC</div></div></div></div></figure>`;

async function installStickyStoryFixture(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('http://web-story-fixture.invalid/**', (request) =>
    request.fulfill({
      contentType: request.request().url().endsWith('.woff2')
        ? 'font/woff2'
        : 'text/html; charset=utf-8',
      body: request.request().url().endsWith('.woff2')
        ? readFileSync(
            path.join(
              repositoryRoot,
              'apps/web/public/fonts/opendyslexic/OpenDyslexic-Regular.woff2',
            ),
          )
        : `<style>@font-face{font-family:FixtureFont;src:url("/fixture.woff2")}:root{--font-geist-sans:FixtureFont;--font-geist-mono:FixtureFont}*{box-sizing:border-box}body{margin:0;font-family:FixtureFont;font-size:17px}.spacer{height:1088px}.agi-ds-scrollfeatures{display:grid;grid-template-columns:600px 600px;gap:40px;height:1800px;margin-inline:40px}article{height:334px}.article-gap{height:50px}.agi-ds-scrollfeatures-stage{position:sticky;top:96px;align-self:start;display:grid;height:839.25px}.agi-ds-scrollfeature-visual{grid-area:1/1;pointer-events:none}.agi-ds-scrollfeature-visual[data-active]{pointer-events:auto}.agi-ds-scrollfeature-visual--inline{display:none}figure{margin:0;width:600px;height:839.25px}.agi-dev-shell{height:839.25px;background:white}.agi-dev-bar{height:40px}.agi-web{height:799.25px}.agi-desk-side{height:100px}.agi-mk-main{height:699.25px;display:flex;flex-direction:column}.agi-web-table-region{width:320px;margin:20px;overflow-x:auto;outline:2px solid black}.agi-web-table-region table{width:650px;table-layout:fixed;font:inherit}.agi-mk-composer{height:75px;margin-top:auto}.tail{height:900px}</style><main><div class="spacer"></div><div class="agi-ds-scrollfeatures"><div class="agi-ds-scrollfeatures-list"><article id="first">ABC<div class="agi-ds-scrollfeature-visual--inline">${storyFixtureFrame}</div></article><div class="article-gap"></div><article id="second">ABC</article></div><div class="agi-ds-scrollfeatures-stage"><div class="agi-ds-scrollfeature-visual">${storyFixtureFrame}</div><div class="agi-ds-scrollfeature-visual"><div>ABC</div></div></div></div><div class="tail"></div></main><script>window.observedStories=[];const stories=[...document.querySelectorAll("article")];const visuals=[...document.querySelector(".agi-ds-scrollfeatures-stage").children];const apply=index=>{stories.forEach((story,i)=>{if(i===index)story.setAttribute("data-active","true");else story.removeAttribute("data-active")});visuals.forEach((visual,i)=>{if(i===index){visual.setAttribute("data-active","true");visual.removeAttribute("aria-hidden");visual.inert=false}else{visual.removeAttribute("data-active");visual.setAttribute("aria-hidden","true");visual.inert=true}})};apply(0);const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;apply(stories.indexOf(entry.target));window.observedStories.push({id:entry.target.id,scrollY})}},{rootMargin:"-45% 0px -45% 0px",threshold:0});stories.forEach(story=>observer.observe(story))</script>`,
    }),
  );
  await page.goto('http://web-story-fixture.invalid/fixture');
  await page.evaluate(() => document.fonts.ready);
}

test('Web mockup sticky instrument preserves the native selected story during measurement', async ({
  page,
}, testInfo) => {
  await installStickyStoryFixture(page);
  const first = page.locator('#first');
  const stage = page.locator('.agi-ds-scrollfeatures-stage');
  const frame = stage.locator(frameSelector);
  const activation: Evidence = {};
  const measurement: Evidence = {};
  const keyboard: Evidence = {};
  const evidence: Evidence = { activation, measurement, keyboard };
  try {
    await activateScrollStory(first, activation);
    const before = await frameGeometry(frame);
    evidence['before'] = before;
    expect(before.viewportY).toBe(805);
    expect(before.frame.top).toBe(283);
    expect(before.frame.height).toBe(839.25);
    expect(before.frame.bottom).toBeGreaterThan(before.viewportHeight);
    expect(before.hiddenAncestor).toBeNull();
    await measureFrame(
      page,
      frame,
      '/features',
      1440,
      measurement,
      testInfo,
      'sticky-story',
      first,
    );
    await expect(first).toHaveAttribute('data-active', 'true');
    expect(await page.evaluate(() => scrollY)).toBe(before.viewportY);
    await focusAndScroll(page, frame, keyboard);
    await assertStorySelection(first, frame, evidence, 'keyboard-complete');
    await expect(first).toHaveAttribute('data-active', 'true');
    expect((await frameGeometry(frame)).hiddenAncestor).toBeNull();
  } finally {
    evidence['final'] = await frameGeometry(frame);
    evidence['stories'] = await page.locator('article').evaluateAll((articles) =>
      articles.map((article) => ({
        id: article.id,
        active: article.getAttribute('data-active'),
      })),
    );
    evidence['observer'] = await page.evaluate(() => Reflect.get(window, 'observedStories'));
    await testInfo.attach('sticky-story-measurement.json', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
  }
});

test('Web mockup sticky native legacy scroll witness changes the actual Observer selection', async ({
  page,
}, testInfo) => {
  await installStickyStoryFixture(page);
  const first = page.locator('#first');
  const second = page.locator('#second');
  const frame = page.locator('.agi-ds-scrollfeatures-stage').locator(frameSelector);
  const evidence: Evidence = {};
  try {
    await activateScrollStory(first, evidence);
    const before = await frameGeometry(frame);
    evidence['before'] = before;
    expect(before.viewportY).toBe(805);
    expect(before.frame.top).toBe(283);
    expect(before.hiddenAncestor).toBeNull();
    await frame.scrollIntoViewIfNeeded();
    await page.evaluate(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    await expect(second).toHaveAttribute('data-active', 'true');
    await expect(first).not.toHaveAttribute('data-active', 'true');
    const after = await frameGeometry(frame);
    evidence['after'] = after;
    expect(after.viewportY).toBe(1027);
    expect(after.hiddenAncestor).toBe('div');
  } finally {
    await testInfo.attach('native-legacy-sticky-scroll.json', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
  }
});

test('Web mockup sticky instrument rejects a genuinely inactive frame without reactivating it', async ({
  page,
}, testInfo) => {
  await installStickyStoryFixture(page);
  const first = page.locator('#first');
  const second = page.locator('#second');
  const frame = page.locator('.agi-ds-scrollfeatures-stage').locator(frameSelector);
  const evidence: Evidence = {};
  try {
    await activateScrollStory(second, evidence);
    await expect(first).not.toHaveAttribute('data-active', 'true');
    const before = await frameGeometry(frame);
    expect(before.hiddenAncestor).toBe('div');
    await expect(prepareFrameViewport(page, frame, evidence)).rejects.toThrow(
      'Web frame has a hidden or inert ancestor',
    );
    await expect(second).toHaveAttribute('data-active', 'true');
    expect(await page.evaluate(() => scrollY)).toBe(before.viewportY);
    expect((await frameGeometry(frame)).hiddenAncestor).toBe('div');
  } finally {
    await testInfo.attach('inactive-sticky-story.json', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
  }
});

for (const { width, presentation } of [
  { width: 800, presentation: 'inline' },
  { width: 1440, presentation: 'stage' },
] as const) {
  test(`Web mockup presentation instrument observes the ${presentation} branch at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(
      `<style>body{margin:0}.agi-ds-scrollfeatures-stage{display:grid}.agi-ds-scrollfeature-visual--inline{display:none}figure{width:300px;height:200px;margin:0}@media(max-width:960px){.agi-ds-scrollfeatures-stage{display:none}.agi-ds-scrollfeature-visual--inline{display:block}}</style><main><article><div class="agi-ds-scrollfeature-visual--inline">${storyFixtureFrame}</div></article><div class="agi-ds-scrollfeatures-stage"><div class="agi-ds-scrollfeature-visual">${storyFixtureFrame}</div></div></main>`,
    );
    const evidence: Evidence = {};
    try {
      const selected = await selectStoryFrame(
        page.locator('article'),
        page.locator('.agi-ds-scrollfeatures-stage'),
        width,
        evidence,
      );
      expect(selected.presentation).toBe(presentation);
      await expect(selected.frame).toBeVisible();
      expect(
        await selected.frame.evaluate((element) =>
          Boolean(element.closest('.agi-ds-scrollfeature-visual--inline')),
        ),
      ).toBe(presentation === 'inline');
    } finally {
      await testInfo.attach('observed-story-presentation.json', {
        body: JSON.stringify(evidence, null, 2),
        contentType: 'application/json',
      });
    }
  });
}

for (const display of ['block', 'none'] as const) {
  test(`Web mockup presentation instrument rejects ambiguous ${display} layouts`, async ({
    page,
  }, testInfo) => {
    await page.setContent(
      `<style>.agi-ds-scrollfeatures-stage,.agi-ds-scrollfeature-visual--inline{display:${display}}figure{width:300px;height:200px;margin:0}</style><main><article><div class="agi-ds-scrollfeature-visual--inline">${storyFixtureFrame}</div></article><div class="agi-ds-scrollfeatures-stage"><div class="agi-ds-scrollfeature-visual">${storyFixtureFrame}</div></div></main>`,
    );
    const evidence: Evidence = {};
    try {
      await expect(
        selectStoryFrame(
          page.locator('article'),
          page.locator('.agi-ds-scrollfeatures-stage'),
          800,
          evidence,
        ),
      ).rejects.toThrow('exactly one inline or stage layout must display');
    } finally {
      await testInfo.attach('ambiguous-story-presentation.json', {
        body: JSON.stringify(evidence, null, 2),
        contentType: 'application/json',
      });
    }
  });
}

test('Web mockup viewport instrument still scrolls an offscreen static selected visual', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(
    `<style>body{margin:0}.spacer{height:1200px}.tail{height:900px}figure{margin:0;width:600px;height:200px}.agi-dev-shell{height:200px}.agi-dev-bar{height:30px}.agi-web{height:170px}.agi-desk-side{height:30px}.agi-mk-main{height:140px}.agi-mk-composer{height:30px}</style><main><div class="spacer"></div><div class="agi-ds-scrollfeature-visual" data-active="true">${storyFixtureFrame}</div><div class="tail"></div></main>`,
  );
  const frame = page.locator(frameSelector);
  const evidence: Evidence = {};
  try {
    const before = await frameGeometry(frame);
    expect(before.frame.top).toBe(1200);
    expect(before.viewportY).toBe(0);
    await prepareFrameViewport(page, frame, evidence);
    const after = await frameGeometry(frame);
    expect(after.viewportY).toBeGreaterThan(before.viewportY);
    expect(after.frame.top).toBeGreaterThanOrEqual(0);
    expect(after.frame.bottom).toBeLessThanOrEqual(after.viewportHeight);
    expect(evidence['viewportPreparation']).toMatchObject({
      action: 'scroll-into-view',
      selectedVisual: true,
      intersects: false,
      stickyAncestors: [],
    });
  } finally {
    await testInfo.attach('offscreen-static-selected-visual.json', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
  }
});

async function inspectStage(page: Page, width: number, evidence: Evidence, testInfo: TestInfo) {
  const stories = page.locator('.agi-ds-scrollfeatures');
  const stage = stories.locator('.agi-ds-scrollfeatures-stage');
  const firstArticle = stories.locator('article').first();
  const secondArticle = stories.locator('article').nth(1);
  await activateScrollStory(firstArticle, evidence);
  const state = () =>
    stage.evaluate((element) => ({
      hidden: element.closest('[aria-hidden="true"],[inert]')?.localName ?? null,
      display: getComputedStyle(element).display,
      height: element.getBoundingClientRect().height,
      visuals: Array.from(element.children).map((child) => ({
        active: child.hasAttribute('data-active'),
        ariaHidden: child.getAttribute('aria-hidden'),
        inert: (child as HTMLElement).inert,
        pointerEvents: getComputedStyle(child).pointerEvents,
        connected: child.isConnected,
      })),
    }));
  const before = await state();
  evidence['before'] = before;
  const { frame, presentation } = await selectStoryFrame(firstArticle, stage, width, evidence);
  const measurement: Evidence = {};
  evidence['measured'] = measurement;
  const measured = await measureFrame(
    page,
    frame,
    '/features',
    width,
    measurement,
    testInfo,
    'stage-web',
    firstArticle,
  );
  await expect(firstArticle).toHaveAttribute('data-active', 'true');
  expect(before.hidden).toBeNull();
  expect(before.display === 'none').toBe(presentation === 'inline');
  expect(before.visuals.filter((visual) => visual.active)).toHaveLength(1);
  for (const visual of before.visuals) {
    expect(visual.connected).toBe(true);
    expect(visual.inert).toBe(!visual.active);
    expect(visual.ariaHidden).toBe(visual.active ? null : 'true');
    expect(visual.pointerEvents).toBe(visual.active ? 'auto' : 'none');
  }
  let inactiveFocus: boolean | null = null;
  if (presentation === 'stage') {
    const secondActivation: Evidence = {};
    evidence['secondActivation'] = secondActivation;
    await activateScrollStory(secondArticle, secondActivation);
    const inactiveWeb = stage.locator('.agi-ds-scrollfeature-visual').first();
    await expect(inactiveWeb).toHaveAttribute('inert', '');
    await expect(inactiveWeb).toHaveAttribute('aria-hidden', 'true');
    inactiveFocus = await inactiveWeb.locator('.agi-web-table-region').evaluate((element) => {
      (element as HTMLElement).focus({ preventScroll: true });
      return document.activeElement === element;
    });
    evidence['inactiveFocus'] = inactiveFocus;
    expect(inactiveFocus).toBe(false);
    const firstActivation: Evidence = {};
    evidence['reactivation'] = firstActivation;
    await activateScrollStory(firstArticle, firstActivation);
    const restored = await state();
    evidence['restored'] = restored;
    expect(restored.height).toBeCloseTo(before.height, 0);
  }
  const keyboard: Evidence = {};
  evidence['keyboard'] = keyboard;
  await focusAndScroll(page, frame, keyboard);
  await assertStorySelection(firstArticle, frame, evidence, 'keyboard-complete');
  const after = await state();
  evidence['after'] = after;
  expect(after.visuals.filter((visual) => visual.active)).toHaveLength(1);
  expect(after.visuals[0]?.active).toBe(true);
  evidence['inactiveFocus'] = inactiveFocus;
  return measured;
}

test.use({ screenshot: 'off', video: 'off', trace: 'off' });
test.describe.configure({ retries: 0 });

for (const width of widths) {
  for (const theme of themes) {
    for (const pathname of routePaths) {
      test(`Web mockup ${pathname} ${width}px ${theme}`, async ({ browser, baseURL }, testInfo) => {
        if (!baseURL) throw new Error('Web mockup proof requires a configured base URL');
        if (testInfo.config.workers !== 1) throw new Error('Web mockup proof requires one worker');
        const routes = getPublicRouteInventory().routes.filter((route) => route.path === pathname);
        expect(routes).toHaveLength(1);
        const route = routes[0]!;
        expect(route.context).toBe('signed-out');
        expect(route.unresolvedFlags).toEqual([]);
        const sourceStart = sourceSnapshot();
        const context = await browser.newContext({
          baseURL,
          viewport: { width, height: width < 768 ? 844 : 900 },
          colorScheme: theme,
          reducedMotion: 'reduce',
          hasTouch: width < 768,
          storageState: { cookies: [], origins: [] },
        });
        const report: Record<string, unknown> = {
          scope: 'WebWindow and ScrollFeatures only; not whole-page acceptance',
          pathname,
          width,
          theme,
          sourceStart,
          status: 'running',
          contextClosed: false,
          beforeEvidence: 'No native historical before run is asserted by this spec.',
          limits: [
            'Inherited palette and other mockup variants are outside these scoped checks.',
            'Canonical readiness font diagnostics outside the measured frame are retained separately.',
            'Scoped native Tab entry starts at an observed predecessor with preventScroll; it does not prove an entire-page keyboard tour.',
            'Native pointer ownership is checked at the comparison center; pointer-transparent painted overlays need independent paint/contrast proof.',
            'Source identity covers the listed files, not every transitive dependency or environment value.',
            'PNG captures show the current visible frame intersection when the frame is taller than the viewport; they are not full-page captures.',
            'Ancestor clipping checks bound axis-aligned overflow boxes; rounded-corner paint and external overlays require independent paint proof.',
            'Canonical unmeasured scroll-state records are retained; native Arrow keys must reach both ends, but this spec does not certify every glyph at every scroll offset.',
          ],
        };
        let failure: Error | null = null;
        try {
          const initialStorage = await context.storageState();
          expect(initialStorage).toEqual({ cookies: [], origins: [] });
          const page = await context.newPage();
          const destination = new URL(pathname, baseURL);
          const expectation = {
            ...route,
            expectedOrigin: destination.origin,
            expectedQuery: destination.search,
          };
          const fonts = [
            { cssVariable: '--font-geist-sans' },
            { cssVariable: '--font-geist-mono' },
          ];
          report['initialReadiness'] = await settlePublicPage(page, expectation, {
            expectedFonts: fonts,
          });
          const banner = page.getByRole('region', { name: 'Cookie consent', exact: true });
          await expect(banner).toBeVisible();
          await banner.getByRole('button', { name: 'Necessary only', exact: true }).click();
          await expect(banner).toHaveCount(0);
          const consent = parseCookieConsentRecord(
            await page.evaluate((key) => localStorage.getItem(key), COOKIE_CONSENT_STORAGE_KEY),
          );
          expect(consent).toMatchObject({ ...NECESSARY_ONLY_PREFERENCES });
          expect(isCookieConsentCurrent(consent)).toBe(true);
          report['consent'] = consent;
          const readiness = await settlePublicPage(page, expectation, { expectedFonts: fonts });
          expect(readiness.expectedFontProof).not.toBeNull();
          await expect(banner).toHaveCount(0);
          expect(await themeState(page)).toEqual({
            marker: theme,
            light: theme === 'light',
            dark: theme === 'dark',
            scheme: theme,
            prefersDark: theme === 'dark',
          });
          report['readiness'] = readiness;
          const hero =
            pathname === '/web'
              ? page.locator('.agi-fl-hero-visual').locator(frameSelector)
              : page.locator('.agi-lp-hero-stage').locator(frameSelector);
          const measurement: Evidence = {};
          const keyboard: Evidence = {};
          report['hero'] = { measured: measurement, keyboard };
          const measured = await measureFrame(
            page,
            hero,
            pathname,
            width,
            measurement,
            testInfo,
            'hero-web',
          );
          await focusAndScroll(page, hero, keyboard);
          const stageEvidence: Evidence = {};
          report['stage'] = pathname === '/features' ? stageEvidence : null;
          const stage =
            pathname === '/features'
              ? await inspectStage(page, width, stageEvidence, testInfo)
              : null;
          const frames = [measured, ...(stage ? [stage] : [])];
          const scopedFontGaps = readiness.fontCoverageGaps.filter((gap) =>
            frames.some((frame) =>
              frame.textMap.rows.some(
                (row) =>
                  row.family === gap.family &&
                  row.codepoints.some((codepoint) => gap.codepoints.includes(codepoint)),
              ),
            ),
          );
          report['scopedFontGaps'] = scopedFontGaps;
          expect(
            scopedFontGaps,
            'Actual Web text contains unsupported canonical-font glyphs',
          ).toEqual([]);
          report['finalUrl'] = page.url();
          expect(page.url(), 'Mockup interactions changed the measured destination').toBe(
            destination.href,
          );
          expect(await themeState(page)).toEqual({
            marker: theme,
            light: theme === 'light',
            dark: theme === 'dark',
            scheme: theme,
            prefersDark: theme === 'dark',
          });
        } catch (error) {
          if (error instanceof PublicReadinessFontError)
            report['fontReadinessDiagnostic'] = error.diagnostic;
          failure = error instanceof Error ? error : new Error(String(error));
        } finally {
          try {
            await context.close();
            report['contextClosed'] = true;
          } catch (error) {
            report['contextCloseError'] = error instanceof Error ? error.message : String(error);
            failure ??= error instanceof Error ? error : new Error(String(error));
          }
          try {
            const sourceEnd = sourceSnapshot();
            report['sourceEnd'] = sourceEnd;
            expect(sourceEnd, 'Frozen mockup source changed during native measurement').toEqual(
              sourceStart,
            );
          } catch (error) {
            report['sourceIdentityError'] = error instanceof Error ? error.message : String(error);
            failure ??= error instanceof Error ? error : new Error(String(error));
          }
          report['status'] = failure ? 'failed' : 'passed';
          report['error'] = failure?.message ?? null;
          await testInfo.attach('public-web-mockup.json', {
            body: JSON.stringify(report, null, 2),
            contentType: 'application/json',
          });
        }
        if (failure) throw failure;
      });
    }
  }
}
