import { expect, type ElementHandle, type Locator, type Page } from '@playwright/test';

import { publicMaskPaintHandle } from './public-mask-paint';

export type PublicReadinessRoute = {
  path: string;
  expectedHttpStatuses: readonly number[] | null;
  expectedFinalPath: string | null;
  expectedOrigin: string | null;
  expectedQuery: string | null;
};

export type PublicExpectedFont =
  { family: string; cssVariable?: never } | { cssVariable: string; family?: never };

export type PublicReadinessOptions = {
  navigationTimeout?: number;
  readinessTimeout?: number;
  intervalMs?: number;
  samples?: number;
  expectedFonts?: PublicExpectedFont[];
};

async function inspectReadiness(
  page: Page,
  expectedFonts: PublicExpectedFont[],
  scope: ElementHandle<SVGElement | HTMLElement> | null = null,
) {
  const maskPaintHandle = await publicMaskPaintHandle(page);
  const inspection = page.evaluate(
    ({ fontRequests, fontScope, maskPaint }) => {
      if (fontScope && !fontScope.isConnected) throw new Error('Unmeasured font scope is detached');
      const normalize = (value: string) =>
        value
          .trim()
          .replace(/^['"]|['"]$/g, '')
          .toLowerCase();
      const families = (value: string) => value.split(',').map(normalize).filter(Boolean);
      const requestedFamilies = fontRequests.map((request) => {
        const value =
          request.family ??
          (getComputedStyle(document.body).getPropertyValue(request.cssVariable ?? '') ||
            getComputedStyle(document.documentElement).getPropertyValue(request.cssVariable ?? ''));
        return { requested: request, family: families(value)[0] ?? '' };
      });
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const pen = canvas.getContext('2d');
      if (!pen) throw new Error('Readiness color probe has no canvas context');
      const alpha = (color: string) => {
        pen.fillStyle = '#010203';
        pen.fillStyle = color;
        const first = pen.fillStyle;
        pen.fillStyle = '#040506';
        pen.fillStyle = color;
        if (first !== pen.fillStyle) return null;
        pen.clearRect(0, 0, 1, 1);
        pen.fillRect(0, 0, 1, 1);
        return (pen.getImageData(0, 0, 1, 1).data[3] ?? 0) / 255;
      };
      type Box = { left: number; top: number; right: number; bottom: number };
      const clip = (box: Box, parent: Box, x = true, y = true): Box => ({
        left: x ? Math.max(box.left, parent.left) : box.left,
        top: y ? Math.max(box.top, parent.top) : box.top,
        right: x ? Math.min(box.right, parent.right) : box.right,
        bottom: y ? Math.min(box.bottom, parent.bottom) : box.bottom,
      });
      const paintBox = (element: Element, initial: Box) => {
        let box = initial;
        for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
          const css = getComputedStyle(ancestor);
          if (
            css.display === 'none' ||
            ['hidden', 'collapse'].includes(css.visibility) ||
            css.contentVisibility === 'hidden' ||
            Number(css.opacity) === 0 ||
            css.clipPath !== 'none' ||
            css.clip !== 'auto'
          )
            return null;
          const rect = ancestor.getBoundingClientRect();
          box = clip(box, rect, css.overflowX !== 'visible', css.overflowY !== 'visible');
          if (box.right - box.left < 2 || box.bottom - box.top < 2) return null;
        }
        return box;
      };
      const textPaintBox = (element: Element, initial: Box) => {
        const textCss = getComputedStyle(element);
        const fill = textCss.getPropertyValue('-webkit-text-fill-color') || textCss.color;
        const fillAlpha = alpha(fill);
        const colorAlpha = alpha(textCss.color);
        if (fillAlpha === null || fillAlpha <= 0 || colorAlpha === null || colorAlpha <= 0)
          return null;
        let box = initial;
        for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
          if (getComputedStyle(ancestor).filter !== 'none') return null;
          const paint = maskPaint(ancestor);
          if (paint.mask === 'unsupported') return null;
          if (paint.mask === 'fade') {
            const opaque = paint.clip(box);
            if (!opaque) return null;
            box = opaque;
          }
        }
        return paintBox(element, box);
      };
      const mains = [...document.querySelectorAll('main,[role="main"]')].filter((main) => {
        const rect = main.getBoundingClientRect();
        return !main.closest('[hidden],[inert],[aria-hidden="true"]') && paintBox(main, rect);
      });
      const pendingControls = [
        ...document.querySelectorAll('[aria-busy="true"],[role="progressbar"]'),
      ]
        .filter((element) => paintBox(element, element.getBoundingClientRect()))
        .map((element) => ({ tag: element.localName, label: element.getAttribute('aria-label') }));
      const textSamples: {
        text: string;
        glyphs: number[];
        fontFamily: string;
        fontStyle: string;
        fontWeight: string;
        fontSize: string;
        lineHeight: string;
        letterSpacing: string;
        color: string;
        backgroundColor: string;
        paintStyles: string[][];
        geometry: number[][];
      }[] = [];
      let paintedMainTextNodes = 0;
      const fontPaintCandidates: {
        family: string;
        text: string;
        textTruncated: boolean;
        paintedBoxes: number;
        ancestorChainTruncated: boolean;
        ancestors: {
          tag: string;
          className: string;
          opacity: string;
          display: string;
          visibility: string;
          contentVisibility: string;
          overflowX: string;
          overflowY: string;
          clip: string;
          clipPath: string;
          maskImage: string;
          filter: string;
          textFillColor: string;
          animationName: string;
          animationDelay: string;
          animationDuration: string;
          animationPlayState: string;
        }[];
      }[] = [];
      const fontCandidateCounts = new Map<string, number>();
      let visited = 0;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        visited += 1;
        if (visited > 15_000)
          throw new Error('Readiness text sampling exceeded its bounded budget');
        const parent = node.parentElement;
        const text = node.textContent?.replace(/\s+/g, ' ').trim();
        if (!parent || !text || parent.closest('script,style,template,noscript')) continue;
        if (fontScope && !fontScope.contains(parent)) continue;
        const css = getComputedStyle(parent);
        const firstFamily = families(css.fontFamily)[0] ?? '';
        if (requestedFamilies.some((request) => request.family === firstFamily)) {
          const count = (fontCandidateCounts.get(firstFamily) ?? 0) + 1;
          fontCandidateCounts.set(firstFamily, count);
          if (count <= 8) {
            const ancestors = [];
            let ancestor: Element | null = parent;
            while (ancestor && ancestors.length < 20) {
              const paint = getComputedStyle(ancestor);
              ancestors.push({
                tag: ancestor.localName,
                className: String(ancestor.className),
                opacity: paint.opacity,
                display: paint.display,
                visibility: paint.visibility,
                contentVisibility: paint.contentVisibility,
                overflowX: paint.overflowX,
                overflowY: paint.overflowY,
                clip: paint.clip,
                clipPath: paint.clipPath,
                maskImage: paint.maskImage,
                filter: paint.filter,
                textFillColor: paint.getPropertyValue('-webkit-text-fill-color'),
                animationName: paint.animationName,
                animationDelay: paint.animationDelay,
                animationDuration: paint.animationDuration,
                animationPlayState: paint.animationPlayState,
              });
              ancestor = ancestor.parentElement;
            }
            const candidateRange = document.createRange();
            candidateRange.selectNodeContents(node);
            fontPaintCandidates.push({
              family: firstFamily,
              text: text.slice(0, 160),
              textTruncated: text.length > 160,
              paintedBoxes: [...candidateRange.getClientRects()].filter(
                (rect) => textPaintBox(parent, rect) !== null,
              ).length,
              ancestorChainTruncated: ancestor !== null,
              ancestors,
            });
          }
        }
        const range = document.createRange();
        range.selectNodeContents(node);
        const boxes = [...range.getClientRects()]
          .map((rect) => textPaintBox(parent, rect))
          .filter((box) => box !== null);
        if (!boxes.length) continue;
        textSamples.push({
          text,
          glyphs: [
            ...new Set(
              [...(node.textContent ?? '')]
                .filter((character) => !/\s/u.test(character))
                .map((character) => character.codePointAt(0) ?? 0),
            ),
          ].sort((a, b) => a - b),
          fontFamily: css.fontFamily,
          fontStyle: css.fontStyle,
          fontWeight: css.fontWeight,
          fontSize: css.fontSize,
          lineHeight: css.lineHeight,
          letterSpacing: css.letterSpacing,
          color: css.color,
          backgroundColor: css.backgroundColor,
          paintStyles: (() => {
            const chain: string[][] = [];
            for (
              let ancestor: Element | null = parent;
              ancestor;
              ancestor = ancestor.parentElement
            ) {
              const paint = getComputedStyle(ancestor);
              chain.push([
                paint.opacity,
                paint.backgroundColor,
                paint.clipPath,
                paint.clip,
                paint.maskImage,
                paint.filter,
                paint.getPropertyValue('-webkit-text-fill-color'),
                paint.visibility,
              ]);
            }
            return chain;
          })(),
          geometry: boxes.map((box) =>
            [box.left, box.top, box.right, box.bottom].map(
              (value) => Math.round(value * 100) / 100,
            ),
          ),
        });
        if (mains.length !== 1 || !mains[0]?.contains(parent)) continue;
        const visible = boxes.some((box) => {
          const viewportBox = clip(box, {
            left: 0,
            top: 0,
            right: innerWidth,
            bottom: innerHeight,
          });
          if (viewportBox.right - viewportBox.left < 2 || viewportBox.bottom - viewportBox.top < 2)
            return false;
          const hit = document.elementFromPoint(
            (viewportBox.left + viewportBox.right) / 2,
            (viewportBox.top + viewportBox.bottom) / 2,
          );
          return hit !== null && (hit === parent || parent.contains(hit) || hit.contains(parent));
        });
        if (visible) paintedMainTextNodes += 1;
      }
      const fontFaces = [...document.fonts]
        .map((face) => ({
          family: normalize(face.family),
          status: face.status,
          style: face.style,
          weight: face.weight,
          stretch: face.stretch,
          unicodeRange: face.unicodeRange,
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      const genericFamilies = new Set([
        'serif',
        'sans-serif',
        'monospace',
        'cursive',
        'fantasy',
        'system-ui',
        'ui-serif',
        'ui-sans-serif',
        'ui-monospace',
        'ui-rounded',
        'math',
        'emoji',
        'fangsong',
      ]);
      const usedFontSamples = [
        ...new Set(textSamples.map((sample) => families(sample.fontFamily)[0] ?? '')),
      ].map((family) => {
        const used = textSamples.filter((sample) => families(sample.fontFamily)[0] === family);
        const registeredFaces = fontFaces.filter((face) => face.family === family);
        const ranges = registeredFaces.flatMap((face) =>
          face.unicodeRange.split(',').map((entry) => {
            const match = /^U\+([\dA-F?]{1,6})(?:-([\dA-F]{1,6}))?$/i.exec(entry.trim());
            if (!match) throw new Error(`Unmeasured font Unicode range: ${face.family}`);
            const start = parseInt((match[1] ?? '').replace(/\?/g, '0'), 16);
            const end = parseInt(match[2] ?? (match[1] ?? '').replace(/\?/g, 'F'), 16);
            if (!Number.isFinite(start) || !Number.isFinite(end) || start > end)
              throw new Error(`Unmeasured font Unicode range: ${face.family}`);
            return { start, end };
          }),
        );
        const glyphRequests = new Map<string, Set<number>>();
        for (const sample of used) {
          const font = `${sample.fontStyle} ${sample.fontWeight} ${sample.fontSize} ${JSON.stringify(family)}`;
          const glyphs = glyphRequests.get(font) ?? new Set<number>();
          for (const codepoint of sample.glyphs) glyphs.add(codepoint);
          if (glyphs.size > 2048)
            throw new Error('Readiness glyph sampling exceeded its bounded budget');
          glyphRequests.set(font, glyphs);
        }
        const requests = [...glyphRequests]
          .map(([font, glyphs]) => {
            const codepoints = [...glyphs].sort((a, b) => a - b);
            return {
              font,
              text: codepoints.map((point) => String.fromCodePoint(point)).join(''),
              codepoints,
              uncoveredCodepoints: registeredFaces.length
                ? codepoints.filter(
                    (point) => !ranges.some(({ start, end }) => point >= start && point <= end),
                  )
                : [],
            };
          })
          .sort((a, b) => a.font.localeCompare(b.font));
        if (requests.length > 64)
          throw new Error('Readiness font requests exceeded their bounded budget');
        return {
          family,
          generic: genericFamilies.has(family),
          usedTextNodes: used.length,
          requests,
          registeredFaces,
        };
      });
      const fontCoverageGaps = usedFontSamples
        .filter((sample) => !sample.generic)
        .flatMap((sample) =>
          sample.requests
            .filter((request) => request.uncoveredCodepoints.length)
            .map((request) => ({
              reason: 'unicode-range-gap' as const,
              family: sample.family,
              font: request.font,
              text: request.uncoveredCodepoints
                .map((point) => String.fromCodePoint(point))
                .join(''),
              codepoints: request.uncoveredCodepoints.map(
                (point) => `U+${point.toString(16).toUpperCase()}`,
              ),
              registeredUnicodeRanges: sample.registeredFaces.map((face) => face.unicodeRange),
            })),
        );
      const expectedFontSamples = requestedFamilies.map(({ requested, family }) => {
        const used = usedFontSamples.find((sample) => sample.family === family);
        return {
          requested,
          family,
          usedTextNodes: used?.usedTextNodes ?? 0,
          requests: used?.requests ?? [],
          registeredFaces: fontFaces.filter((face) => face.family === family),
        };
      });
      const geometry = {
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      };
      return {
        fonts: document.fonts.status,
        fontFaces,
        expectedFontSamples,
        fontPaintCandidates,
        fontCandidateCounts: [...fontCandidateCounts].map(([family, count]) => ({
          family,
          count,
          truncated: count > 8,
        })),
        usedFontSamples,
        fontCoverageGaps,
        mainCount: mains.length,
        paintedMainTextNodes,
        textNodeCount: textSamples.length,
        pendingControls,
        ...geometry,
        signature: JSON.stringify({
          geometry,
          textSamples,
          fontFaces,
          expectedFontSamples,
          usedFontSamples,
          fontCoverageGaps,
          paintedMainTextNodes,
          pendingControls,
          documentStyle: [document.documentElement, document.body].map((element) => {
            const css = getComputedStyle(element);
            return {
              color: css.color,
              backgroundColor: css.backgroundColor,
              fontFamily: css.fontFamily,
              opacity: css.opacity,
            };
          }),
        }),
      };
    },
    { fontRequests: expectedFonts, fontScope: scope, maskPaint: maskPaintHandle },
  );
  return inspection.finally(() => maskPaintHandle.dispose());
}

type FontPaintProbe = Awaited<ReturnType<typeof inspectReadiness>>;
type FontPaintDiagnostic = {
  initial: Pick<
    FontPaintProbe,
    'expectedFontSamples' | 'fontPaintCandidates' | 'fontCandidateCounts'
  >;
  final: Pick<
    FontPaintProbe,
    'expectedFontSamples' | 'fontPaintCandidates' | 'fontCandidateCounts'
  >;
  observations: {
    elapsedMs: number;
    fonts: string;
    expectedFonts: { family: string; usedTextNodes: number }[];
  }[];
};

export class PublicReadinessFontError extends Error {
  constructor(
    message: string,
    readonly diagnostic: FontPaintDiagnostic,
  ) {
    super(message);
    this.name = 'PublicReadinessFontError';
  }
}

async function loadExpectedFontRequests(
  page: Page,
  probe: FontPaintProbe,
  readinessTimeout: number,
) {
  if (probe.fontFaces.some((face) => face.status === 'error'))
    throw new Error('Failed FontFace cannot prove readiness');
  const fontProof = [];
  const fontDeadline = Date.now() + readinessTimeout;
  for (const sample of probe.expectedFontSamples) {
    if (!sample.family || !sample.registeredFaces.length)
      throw new Error('Unmeasured expected font: missing registered family');
    if (!sample.usedTextNodes)
      throw new Error(`Unmeasured expected font: ${sample.family} is unused by painted text`);
  }
  for (const sample of probe.expectedFontSamples.length
    ? probe.usedFontSamples.filter((font) => !font.generic)
    : []) {
    if (!sample.family || !sample.registeredFaces.length)
      throw new Error(`Unmeasured used custom font: ${sample.family} has no registered face`);
    let matchedRequests = 0;
    for (const request of sample.requests) {
      const remaining = fontDeadline - Date.now();
      if (remaining <= 0)
        throw new Error('Expected font loads exceeded their bounded readiness budget');
      const load = page.evaluate(async (fontRequest) => {
        const loaded = await document.fonts.load(fontRequest.font, fontRequest.text);
        return loaded.map((face) => ({
          family: face.family
            .trim()
            .replace(/^['"]|['"]$/g, '')
            .toLowerCase(),
          status: face.status,
        }));
      }, request);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const faces = await (async () => {
        try {
          return await Promise.race([
            load,
            new Promise<never>((_, reject) => {
              timeout = setTimeout(
                () => reject(new Error('Expected font load exceeded its bounded readiness budget')),
                remaining,
              );
            }),
          ]);
        } finally {
          if (timeout !== undefined) clearTimeout(timeout);
        }
      })();
      if (faces.some((face) => face.family === sample.family && face.status === 'loaded'))
        matchedRequests += 1;
      else if (
        !request.codepoints.length ||
        request.uncoveredCodepoints.length !== request.codepoints.length
      )
        throw new Error(
          `Unmeasured expected font: ${sample.family} load returned no matching face for ${request.font} using ${JSON.stringify(request.text)}`,
        );
    }
    fontProof.push({
      family: sample.family,
      usedTextNodes: sample.usedTextNodes,
      requests: sample.requests.length,
      matchedRequests,
    });
  }
  return fontProof;
}

function assertLoadedPublicFonts(probe: FontPaintProbe) {
  for (const font of probe.expectedFontSamples) {
    const glyphOnly =
      font.requests.length > 0 &&
      font.requests.every(
        (request) =>
          request.codepoints.length > 0 &&
          request.uncoveredCodepoints.length === request.codepoints.length,
      );
    if (
      !font.usedTextNodes ||
      !font.registeredFaces.length ||
      (!glyphOnly && !font.registeredFaces.some((face) => face.status === 'loaded'))
    )
      throw new Error(
        `Unmeasured expected font: ${font.family} lost its painted use or loaded face`,
      );
  }
  for (const font of probe.expectedFontSamples.length
    ? probe.usedFontSamples.filter((sample) => !sample.generic)
    : []) {
    const glyphOnly =
      font.requests.length > 0 &&
      font.requests.every(
        (request) =>
          request.codepoints.length > 0 &&
          request.uncoveredCodepoints.length === request.codepoints.length,
      );
    if (
      !font.registeredFaces.length ||
      (!glyphOnly && !font.registeredFaces.some((face) => face.status === 'loaded'))
    )
      throw new Error(`Unmeasured used custom font: ${font.family} has no loaded face`);
  }
}

export async function measurePublicFontProof(
  page: Page,
  scope: Locator,
  expectedFonts: PublicExpectedFont[],
  readinessTimeout = 15_000,
) {
  if (!Number.isFinite(readinessTimeout) || readinessTimeout <= 0 || !expectedFonts.length)
    throw new Error('Scoped font proof needs explicit expected fonts and a positive finite budget');
  if (
    expectedFonts.some(
      (font) =>
        Number(Boolean(font.family)) + Number(Boolean(font.cssVariable)) !== 1 ||
        (font.cssVariable && !font.cssVariable.startsWith('--')),
    )
  )
    throw new Error('Expected fonts require one non-empty family or CSS variable');
  await expect(scope, 'Scoped font proof needs exactly one current frame').toHaveCount(1);
  const handle = await scope.elementHandle();
  if (!handle) throw new Error('Unmeasured font scope is missing');
  try {
    const initial = await inspectReadiness(page, expectedFonts, handle);
    const expectedFontProof = await loadExpectedFontRequests(page, initial, readinessTimeout);
    const final = await inspectReadiness(page, expectedFonts, handle);
    expect(
      final.fontFaces.some((face) => face.status === 'error'),
      'Failed FontFace during scoped font proof',
    ).toBe(false);
    const requests = (probe: FontPaintProbe) =>
      probe.usedFontSamples.map((font) => ({
        family: font.family,
        usedTextNodes: font.usedTextNodes,
        requests: font.requests,
      }));
    expect(
      requests(final),
      'Actual scoped font text or face coverage changed during load proof',
    ).toEqual(requests(initial));
    assertLoadedPublicFonts(final);
    return {
      expectedFontProof,
      fontCoverageGaps: final.fontCoverageGaps,
      usedFontFamilies: final.usedFontSamples,
      fontPaintCandidates: final.fontPaintCandidates,
      fontCandidateCounts: final.fontCandidateCounts,
    };
  } finally {
    await handle.dispose();
  }
}

export async function settlePublicPage(
  page: Page,
  route: PublicReadinessRoute,
  options: PublicReadinessOptions = {},
) {
  const navigationTimeout = options.navigationTimeout ?? 30_000;
  const readinessTimeout = options.readinessTimeout ?? 15_000;
  const intervalMs = options.intervalMs ?? 250;
  const samples = options.samples ?? 16;
  const expectedFonts = options.expectedFonts ?? [];
  if (
    ![navigationTimeout, readinessTimeout, intervalMs].every(
      (value) => Number.isFinite(value) && value > 0,
    ) ||
    !Number.isInteger(samples) ||
    samples < 3 ||
    samples > 120
  )
    throw new Error('Readiness needs positive finite budgets and three to 120 samples');
  for (const field of [
    'expectedHttpStatuses',
    'expectedFinalPath',
    'expectedOrigin',
    'expectedQuery',
  ] as const) {
    if (route[field] === null || route[field] === undefined)
      throw new Error(`Unmeasured transport expectation: ${field}`);
  }
  if (
    !Array.isArray(route.expectedHttpStatuses) ||
    !route.expectedHttpStatuses.length ||
    route.expectedHttpStatuses.some(
      (value) => !Number.isInteger(value) || value < 100 || value > 599,
    ) ||
    new Set(route.expectedHttpStatuses).size !== route.expectedHttpStatuses.length
  )
    throw new Error('Readiness needs explicit nonempty valid distinct HTTP statuses');
  const origin = new URL(route.expectedOrigin ?? '');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== route.expectedOrigin)
    throw new Error('Readiness expectedOrigin must be an exact HTTP(S) origin');
  if (
    !route.expectedFinalPath?.startsWith('/') ||
    route.expectedFinalPath.includes('?') ||
    route.expectedFinalPath.includes('#')
  )
    throw new Error('Readiness needs an explicit final pathname');
  if (route.expectedQuery !== '' && !route.expectedQuery?.startsWith('?'))
    throw new Error('Readiness needs an explicit empty or leading-question-mark query');
  if (
    expectedFonts.some(
      (font) =>
        Number(Boolean(font.family)) + Number(Boolean(font.cssVariable)) !== 1 ||
        (font.cssVariable && !font.cssVariable.startsWith('--')),
    )
  )
    throw new Error('Expected fonts require one non-empty family or CSS variable');
  const assertLocation = () => {
    const url = new URL(page.url());
    if (url.origin !== route.expectedOrigin)
      throw new Error(`Unmeasured navigation origin: ${url.origin}`);
    expect(url.pathname, 'Public page pathname').toBe(route.expectedFinalPath);
    expect(url.search, 'Public page query').toBe(route.expectedQuery);
  };
  const response = await page.goto(route.path, {
    waitUntil: 'domcontentloaded',
    timeout: navigationTimeout,
  });
  if (!response) throw new Error('Public navigation returned no HTTP response');
  expect(route.expectedHttpStatuses, route.path).toContain(response.status());
  assertLocation();
  await expect(page.getByRole('main')).toHaveCount(1, { timeout: readinessTimeout });
  await expect
    .poll(
      async () => {
        const probe = await inspectReadiness(page, expectedFonts);
        if (probe.fontFaces.some((face) => face.status === 'error'))
          throw new Error('Failed FontFace cannot prove readiness');
        return {
          fonts: probe.fonts,
          paintedMainTextNodes: probe.paintedMainTextNodes > 0,
          pending: probe.pendingControls.length,
        };
      },
      {
        timeout: readinessTimeout,
        message: 'Visible loading state or unpainted main did not become ready',
      },
    )
    .toEqual({ fonts: 'loaded', paintedMainTextNodes: true, pending: 0 });
  let initial = await inspectReadiness(page, expectedFonts);
  const fontPaintStarted = Date.now();
  const summarizePaint = (probe: FontPaintProbe) => ({
    expectedFontSamples: probe.expectedFontSamples,
    fontPaintCandidates: probe.fontPaintCandidates,
    fontCandidateCounts: probe.fontCandidateCounts,
  });
  const fontPaintDiagnostic: FontPaintDiagnostic = {
    initial: summarizePaint(initial),
    final: summarizePaint(initial),
    observations: [],
  };
  for (const sample of initial.expectedFontSamples) {
    if (!sample.family || !sample.registeredFaces.length)
      throw new PublicReadinessFontError(
        'Unmeasured expected font: missing registered family',
        fontPaintDiagnostic,
      );
  }
  if (expectedFonts.length) {
    try {
      await expect
        .poll(
          async () => {
            initial = await inspectReadiness(page, expectedFonts);
            fontPaintDiagnostic.final = summarizePaint(initial);
            fontPaintDiagnostic.observations.push({
              elapsedMs: Date.now() - fontPaintStarted,
              fonts: initial.fonts,
              expectedFonts: initial.expectedFontSamples.map((font) => ({
                family: font.family,
                usedTextNodes: font.usedTextNodes,
              })),
            });
            if (initial.fontFaces.some((face) => face.status === 'error'))
              throw new Error('Failed FontFace cannot prove readiness');
            if (
              initial.expectedFontSamples.some(
                (font) => !font.family || !font.registeredFaces.length,
              )
            )
              throw new Error('Unmeasured expected font: missing registered family');
            return initial.expectedFontSamples.every((font) => font.usedTextNodes > 0);
          },
          {
            timeout: readinessTimeout,
            intervals: [intervalMs],
            message: 'Expected font is unused by painted text within the bounded readiness window',
          },
        )
        .toBe(true);
    } catch (error) {
      throw new PublicReadinessFontError(
        error instanceof Error ? error.message : String(error),
        fontPaintDiagnostic,
      );
    }
  }
  const fontProof = await loadExpectedFontRequests(page, initial, readinessTimeout);
  const scroll = await page.evaluate(async () => {
    let previousHeight = 0;
    let rounds = 0;
    while (rounds < 3 && document.documentElement.scrollHeight !== previousHeight) {
      previousHeight = document.documentElement.scrollHeight;
      for (let y = 0; y < previousHeight; y += innerHeight * 0.75) {
        scrollTo({ top: y, behavior: 'instant' });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      rounds += 1;
    }
    scrollTo({ top: 0, behavior: 'instant' });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return { rounds, height: previousHeight, finalHeight: document.documentElement.scrollHeight };
  });
  expect(scroll.finalHeight, 'Lazy content must finish within the bounded sweep').toBe(
    scroll.height,
  );
  const observations = [];
  const started = Date.now();
  for (let index = 0; index < samples; index += 1) {
    await page.waitForTimeout(intervalMs);
    assertLocation();
    observations.push({
      ...(await inspectReadiness(page, expectedFonts)),
      elapsedMs: Date.now() - started,
    });
  }
  const final = observations.at(-1);
  if (!final) throw new Error('Readiness observation samples are missing');
  expect(
    observations.some((sample) => sample.fontFaces.some((face) => face.status === 'error')),
    'Failed FontFace observed during readiness',
  ).toBe(false);
  expect(
    observations.slice(-3).every((sample) => sample.signature === final.signature),
    'Text, font and paint geometry did not settle across the final samples',
  ).toBe(true);
  expect(final.fonts, 'Font loading remains unverified').toBe('loaded');
  expect(final.mainCount, 'One painted main is required').toBe(1);
  expect(final.paintedMainTextNodes, 'Painted main text is missing').toBeGreaterThan(0);
  expect(final.pendingControls, 'Visible loading state remains unverified').toEqual([]);
  assertLoadedPublicFonts(final);
  return {
    fonts: final.fonts,
    fontFaces: final.fontFaces,
    expectedFontProof: expectedFonts.length ? fontProof : null,
    fontPaintDiagnostic: expectedFonts.length ? fontPaintDiagnostic : null,
    fontCoverageGaps: final.fontCoverageGaps,
    width: final.width,
    scrollWidth: final.scrollWidth,
    pendingControls: final.pendingControls,
    paintedMainTextNodes: final.paintedMainTextNodes,
    textNodeCount: final.textNodeCount,
    samples: observations.map((sample) => ({
      elapsedMs: sample.elapsedMs,
      paintedMainTextNodes: sample.paintedMainTextNodes,
      fontStatus: sample.fonts,
    })),
    usedFontFamilies: final.usedFontSamples.map((font) => ({
      family: font.family,
      generic: font.generic,
      usedTextNodes: font.usedTextNodes,
      registeredFaces: font.registeredFaces,
    })),
    httpStatus: response.status(),
    allowedHttpStatuses: route.expectedHttpStatuses,
    finalPath: new URL(page.url()).pathname,
    finalOrigin: new URL(page.url()).origin,
    finalQuery: new URL(page.url()).search,
    scroll,
    limits: [
      'The bounded sample window cannot prove content or styles will never change after it ends.',
      'Unmarked loading text, missing business content and semantic correctness require explicit state contracts or review.',
      'Paint evidence uses text geometry, ancestor styles and browser hit ownership; it is not a pixel screenshot or proof against pointer-transparent painted overlays.',
      'Text under a filter and text with transparent or unparsed fill is conservatively excluded from paint evidence; closed shadow roots and embedded documents are not traversed.',
      'Under a mask, paint evidence is proven only for one top-to-bottom two-stop linear gradient from an opaque colour to transparent with initial mask size, position, repeat, origin, clip, composite and mode on an upright axis-aligned block box: a text box counts where at least 2px of it lies above the first stop, where mask alpha is exactly 1. Text wholly inside the fading band and text under any other mask form is excluded.',
      'Font proof checks requested families used by rendered text, registered faces and matching load results, not glyph-level fallback or unused font downloads.',
      'Generic and installed system-family identity is not proven by FontFace registration; typography policy must judge their use.',
      ...(expectedFonts.length
        ? []
        : ['Canonical font identity was not requested in this generic readiness measurement.']),
    ],
  };
}
