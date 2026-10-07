import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { PRIVACY_MODE_DISPLAY } from '@agiworkforce/types';

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
import { evaluatePublicTextContrast } from './lib/public-text-contrast';
import { scanPublicTypography } from './lib/public-typography';

const widths = [320, 360, 390, 768, 1024, 1366, 1440, 1920] as const;
const themes = ['light', 'dark'] as const;
const pathname = '/chrome-extension';
const heroSelector = 'main section.agi-fl-hero[aria-labelledby="agi-fl-chrome-hero-title"]';
const frameSelector = 'figure.agi-dev[data-device="panel"][data-geometry="400x520"]';
const fonts = [{ cssVariable: '--font-geist-sans' }, { cssVariable: '--font-geist-mono' }];
const repositoryRoot = path.resolve(__dirname, '../../..');
type Evidence = Record<string, unknown>;
type ScenePart = {
  selector: string;
  text: string;
  body?: boolean;
  icon?: string;
  matchText?: boolean;
};
const scene: readonly ScenePart[] = [
  { selector: '.agi-dev-title', text: 'AGI · side panel' },
  { selector: '.agi-dev-badge', text: 'Page context' },
  { selector: '.agi-dev-pagestrip-icon', text: '', icon: 'Page context' },
  { selector: '.agi-dev-pagestrip-title', text: 'Q3 Strategy Doc' },
  { selector: '.agi-dev-pagestrip-meta', text: 'docs.google.com' },
  { selector: '.agi-dev-pagestrip-badge', text: 'Context' },
  { selector: '.agi-pn-chips > span', text: 'This page', matchText: true },
  { selector: '.agi-pn-chips > span', text: '/tldr', matchText: true },
  { selector: '.agi-pn-chips > span', text: '/extract', matchText: true },
  { selector: '.agi-pn-msg', text: 'Summarize this page', body: true },
  {
    selector: '.agi-pn-line--ok',
    text: 'Browser page added',
    body: true,
    icon: 'Context attached',
  },
  {
    selector: '.agi-pn-line--dim',
    text: 'Page text included with your question',
    body: true,
  },
  { selector: '.agi-dev-panelcomposer-icon', text: '', icon: 'Page context' },
  { selector: '.agi-dev-type', text: 'Ask about this page…', body: true },
  { selector: '.agi-dev-send', text: '', icon: 'Send message' },
  {
    selector: '.agi-dev-panelcomposer-foot > span',
    text: 'Paired · Desktop bridge',
    matchText: true,
  },
  {
    selector: '.agi-dev-panelcomposer-foot > span',
    text: PRIVACY_MODE_DISPLAY.managed.label,
    matchText: true,
  },
];
const sourcePaths = [
  'apps/web/app/chrome-extension/page.tsx',
  'apps/web/app/layout.tsx',
  'apps/web/app/globals.css',
  'apps/web/features/marketing/components/ProductFrame.tsx',
  'apps/web/features/marketing/components/DeviceMockups.tsx',
  'apps/web/features/marketing/components/mockup-responsive.css',
  'apps/web/features/marketing/components/motion/motion.css',
  'apps/web/features/marketing/components/legacy-landing.css',
  'apps/web/features/marketing/components/legacy-pages.css',
  'apps/web/features/marketing/components/system/system.css',
  'packages/ui/design-tokens/src/tailwind.css',
  'packages/ui/design-tokens/src/foundation.css',
  'packages/contracts/types/src/suite-contracts.ts',
  'apps/web/lib/surface-status.ts',
  'apps/web/shared/lib/cookie-consent.ts',
  'apps/web/e2e/lib/public-page-readiness.ts',
  'apps/web/e2e/lib/public-typography.ts',
  'apps/web/e2e/lib/public-text-contrast.ts',
  'apps/web/e2e/lib/public-route-inventory.ts',
  'apps/web/public/fonts/opendyslexic/OpenDyslexic-Regular.woff2',
  'apps/web/e2e/public-device-mockups.spec.ts',
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

async function reducedMotionComplete(frame: Locator) {
  await expect
    .poll(
      () =>
        frame.evaluate((root) => {
          const animations = new Set(root.getAnimations({ subtree: true }));
          for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement)
            for (const animation of ancestor.getAnimations()) animations.add(animation);
          return {
            reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
            active: [...animations].filter(
              (animation) =>
                animation.pending || ['running', 'paused'].includes(animation.playState),
            ).length,
          };
        }),
      { message: 'The actual panel must complete under reduced motion' },
    )
    .toEqual({ reduced: true, active: 0 });
}

async function panelPaintFingerprint(frame: Locator) {
  return frame.evaluate((root) => {
    const styles = (element: Element, pseudo?: string) => {
      const css = getComputedStyle(element, pseudo);
      return [...css].map((property) => [property, css.getPropertyValue(property)]);
    };
    return JSON.stringify(
      [root, ...root.querySelectorAll('*')].map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          connected: element.isConnected,
          tag: element.localName,
          text: element.textContent,
          attributes: [...element.attributes]
            .filter((attribute) => attribute.name !== 'data-testid')
            .map((attribute) => [attribute.name, attribute.value]),
          rect: [rect.left, rect.top, rect.right, rect.bottom, rect.width, rect.height],
          styles: styles(element),
          before: styles(element, '::before'),
          after: styles(element, '::after'),
          placeholder: element.matches('input,textarea') ? styles(element, '::placeholder') : null,
        };
      }),
    );
  });
}

async function measurePanel(
  page: Page,
  frame: Locator,
  contract: readonly ScenePart[],
  evidence: Evidence,
) {
  evidence['matchedFrames'] = await frame.count();
  expect(evidence['matchedFrames'], 'Exactly one scoped hero panel is required').toBe(1);
  let fontProof: Awaited<ReturnType<typeof measurePublicFontProof>> | null = null;
  try {
    fontProof = await measurePublicFontProof(page, frame, fonts);
    evidence['fontProof'] = fontProof;
  } catch (error) {
    evidence['fontError'] =
      error instanceof PublicReadinessFontError
        ? { message: error.message, diagnostic: error.diagnostic }
        : { message: String(error) };
  }
  const fingerprint = await panelPaintFingerprint(frame);
  const state = await frame.evaluate((root, expected) => {
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
    const selectorOf = (element: Element) => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const testId = element.getAttribute('data-testid');
      if (testId) return `${element.localName}[data-testid=${JSON.stringify(testId)}]`;
      return `${element.localName}${Array.from(element.classList)
        .slice(0, 3)
        .map((value) => `.${CSS.escape(value)}`)
        .join('')}`;
    };
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
    const ancestry = (start: Element) => {
      const result = [];
      for (let element: Element | null = start; element; element = element.parentElement) {
        const css = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const matrix = css.transform === 'none' ? null : new DOMMatrixReadOnly(css.transform);
        result.push({
          selector: selectorOf(element),
          rect: box(element),
          hidden: element.hasAttribute('hidden'),
          inert: element.hasAttribute('inert'),
          ariaHidden: element.getAttribute('aria-hidden'),
          suppressed:
            css.display === 'none' ||
            ['hidden', 'collapse'].includes(css.visibility) ||
            css.contentVisibility === 'hidden' ||
            Number(css.opacity) === 0,
          opacity: Number(css.opacity),
          mask: css.maskImage,
          clipPath: css.clipPath,
          clip: css.clip,
          filter: css.filter,
          backdropFilter: css.getPropertyValue('backdrop-filter'),
          blendMode: css.mixBlendMode,
          overflowX: css.overflowX,
          overflowY: css.overflowY,
          documentPort: element === document.body || element === document.documentElement,
          port: {
            left: rect.left + element.clientLeft,
            top: rect.top + element.clientTop,
            right: rect.left + element.clientLeft + element.clientWidth,
            bottom: rect.top + element.clientTop + element.clientHeight,
          },
          scaled:
            Boolean(
              matrix &&
              (!matrix.is2D ||
                Math.abs(matrix.a - 1) > 0.0001 ||
                Math.abs(matrix.d - 1) > 0.0001 ||
                Math.abs(matrix.b) > 0.0001 ||
                Math.abs(matrix.c) > 0.0001),
            ) ||
            !['none', '1', '1 1'].includes(css.scale) ||
            !['none', '0deg'].includes(css.rotate) ||
            !['', 'normal', '1', '100%'].includes(css.getPropertyValue('zoom')),
        });
      }
      return result;
    };
    const ancestors = ancestry(root);
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const pen = canvas.getContext('2d', { willReadFrequently: true });
    const alpha = (color: string) => {
      if (color === 'none') return 0;
      if (!pen || !CSS.supports('color', color)) return null;
      pen.globalCompositeOperation = 'copy';
      pen.fillStyle = 'rgba(0,0,0,0)';
      pen.fillStyle = color;
      pen.fillRect(0, 0, 1, 1);
      return pen.getImageData(0, 0, 1, 1).data[3]! / 255;
    };
    const vectorWitness = (svg: Element) => ({
      connected: svg.isConnected,
      rect: box(svg),
      ancestors: ancestry(svg),
      graphics: [
        ...svg.querySelectorAll(
          'path,line,rect,circle,ellipse,polyline,polygon,use,text,image,foreignObject',
        ),
      ].map((graphic) => {
        const css = getComputedStyle(graphic);
        const rect = box(graphic);
        const fillAlpha = alpha(css.fill);
        const strokeAlpha = alpha(css.stroke);
        const strokeWidth = parseFloat(css.strokeWidth);
        const filled = fillAlpha !== null && fillAlpha > 0 && Number(css.fillOpacity) > 0;
        const stroked =
          strokeAlpha !== null &&
          strokeAlpha > 0 &&
          Number(css.strokeOpacity) > 0 &&
          strokeWidth > 0;
        const matrix = graphic instanceof SVGGraphicsElement ? graphic.getScreenCTM() : null;
        const coefficients = matrix
          ? [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]
          : null;
        const determinant = matrix ? matrix.a * matrix.d - matrix.b * matrix.c : null;
        const affine =
          matrix !== null &&
          coefficients !== null &&
          coefficients.every(Number.isFinite) &&
          determinant !== null &&
          Number.isFinite(determinant) &&
          determinant !== 0 &&
          (!('is2D' in matrix) || matrix.is2D === true);
        const extentX = stroked && matrix ? (strokeWidth * Math.hypot(matrix.a, matrix.c)) / 2 : 0;
        const extentY = stroked && matrix ? (strokeWidth * Math.hypot(matrix.b, matrix.d)) / 2 : 0;
        return {
          selector: selectorOf(graphic),
          supported:
            graphic instanceof SVGGeometryElement &&
            (!stroked ||
              (affine &&
                css.vectorEffect === 'none' &&
                ['round', 'bevel'].includes(css.strokeLinejoin) &&
                ['round', 'butt'].includes(css.strokeLinecap))),
          matrix: matrix
            ? {
                constructor: matrix.constructor.name,
                is2DPresent: 'is2D' in matrix,
                is2DType: typeof matrix.is2D,
                is2D: matrix.is2D ?? null,
                coefficients,
                determinant,
                affine,
              }
            : null,
          ancestors: ancestry(graphic),
          rect: {
            left: rect.left - extentX,
            top: rect.top - extentY,
            right: rect.right + extentX,
            bottom: rect.bottom + extentY,
            width: rect.width + 2 * extentX,
            height: rect.height + 2 * extentY,
          },
          fill: css.fill,
          fillAlpha,
          fillOpacity: Number(css.fillOpacity),
          stroke: css.stroke,
          strokeAlpha,
          strokeOpacity: Number(css.strokeOpacity),
          strokeWidth,
          painted:
            (filled && rect.width > 0 && rect.height > 0) ||
            (stroked && (rect.width > 0 || rect.height > 0)),
        };
      }),
    });
    const parts = expected.map((part) => {
      const elements = Array.from(root.querySelectorAll(part.selector)).filter(
        (element) =>
          !part.matchText || element.textContent?.replace(/\s+/g, ' ').trim() === part.text,
      );
      return {
        ...part,
        count: elements.length,
        actual: elements.map((element) => element.textContent?.replace(/\s+/g, ' ').trim()),
        icons: part.icon
          ? elements.map(
              (element) =>
                element.querySelectorAll(`svg[aria-label=${JSON.stringify(part.icon)}]`).length,
            )
          : null,
        vectors: part.icon
          ? elements.map((element) =>
              [...element.querySelectorAll(`svg[aria-label=${JSON.stringify(part.icon)}]`)].map(
                vectorWitness,
              ),
            )
          : null,
        rects: elements.map(box),
      };
    });
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
      rows.push({
        sourceKey: `text:${counted}`,
        text,
        selector: selectorOf(parent),
        body: expected.some((part) => part.body && parent.closest(part.selector)),
        family: family(getComputedStyle(parent).fontFamily),
      });
    }
    const structures = [
      '.agi-dev-shell',
      '.agi-dev-bar',
      '.agi-pn',
      '.agi-dev-pagestrip',
      '.agi-pn-main',
      '.agi-dev-panelcomposer',
      '.agi-dev-panelcomposer-row',
      '.agi-dev-panelcomposer-foot',
    ].map((selector) => {
      const elements = Array.from(root.querySelectorAll(selector));
      return { selector, count: elements.length, rects: elements.map(box) };
    });
    const scrollports = Array.from(root.querySelectorAll('*')).flatMap((element) => {
      const css = getComputedStyle(element);
      const x =
        ['auto', 'scroll', 'overlay'].includes(css.overflowX) &&
        element.scrollWidth > element.clientWidth + 1;
      const y =
        ['auto', 'scroll', 'overlay'].includes(css.overflowY) &&
        element.scrollHeight > element.clientHeight + 1;
      return x || y
        ? [
            {
              selector: selectorOf(element),
              x,
              y,
              left: element.scrollLeft,
              top: element.scrollTop,
            },
          ]
        : [];
    });
    const animations = new Set(root.getAnimations({ subtree: true }));
    for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement)
      for (const animation of ancestor.getAnimations()) animations.add(animation);
    return {
      connected: root.isConnected,
      rect: box(root),
      ancestors,
      parts,
      structures,
      rows,
      counted,
      scopedElementIndexes: [...document.querySelectorAll('*')].flatMap((element, index) =>
        root.contains(element) ? [index] : [],
      ),
      scrollports,
      expectedSans: expectedFamily('--font-geist-sans'),
      expectedMono: expectedFamily('--font-geist-mono'),
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      scrollX,
      scrollY,
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      activeAnimations: [...animations].filter(
        (animation) => animation.pending || ['running', 'paused'].includes(animation.playState),
      ).length,
    };
  }, contract);
  evidence['state'] = state;
  const failures: string[] = [];
  const require = (condition: boolean, message: string) => {
    if (!condition) failures.push(message);
  };
  evidence['identityFingerprintBefore'] = createHash('sha256').update(fingerprint).digest('hex');
  const annotation = await frame.evaluateHandle((root, prefix) => {
    const elements = [root, ...root.querySelectorAll('*')];
    for (const [index, element] of elements.entries()) {
      if (element.id && document.querySelectorAll(`#${CSS.escape(element.id)}`).length !== 1)
        throw new Error('Panel measurement requires unique existing element IDs');
      if (document.querySelector(`[data-testid=${JSON.stringify(`${prefix}-${index}`)}]`))
        throw new Error('Panel measurement identity collides with an existing test ID');
    }
    return elements.map((element, index) => {
      const original = element.getAttribute('data-testid');
      element.setAttribute('data-testid', `${prefix}-${index}`);
      return { element, original };
    });
  }, 'public-panel-probe');
  try {
    const annotatedFingerprint = await panelPaintFingerprint(frame);
    evidence['identityFingerprintAnnotated'] = createHash('sha256')
      .update(annotatedFingerprint)
      .digest('hex');
    evidence['identityAnnotationInvariant'] = annotatedFingerprint === fingerprint;
    require(evidence['identityAnnotationInvariant'] ===
      true, 'Panel identity annotation changed measured paint, pseudo styles or geometry');
    const typography = await page.evaluate(scanPublicTypography, {
      pageType: 'marketing' as const,
      pathname,
    });
    evidence['typography'] = typography;
    const scoped = await frame.evaluate(
      (root, input) => {
        const textKeys = new Set(input.textKeys);
        const elements = [...document.querySelectorAll('*')];
        const selectors = new Set(
          [root, ...root.querySelectorAll('*')].map((element) =>
            element.id
              ? `#${CSS.escape(element.id)}`
              : `${element.localName}[data-testid=${JSON.stringify(element.getAttribute('data-testid'))}]`,
          ),
        );
        const belongs = (source: { sourceKey?: string; selector: string }) => {
          if (source.sourceKey?.startsWith('text:')) return textKeys.has(source.sourceKey);
          const indexed = source.sourceKey?.match(
            /^(?:control|pseudo):(\d+)(?::(?:before|after))?$/,
          );
          if (indexed) {
            const element = elements[Number(indexed[1])];
            return Boolean(element && root.contains(element));
          }
          return selectors.has(source.selector);
        };
        return {
          samples: input.report.samples.filter(belongs),
          findings: input.report.findings.filter(belongs),
          unmeasured: input.report.unmeasured.filter(belongs),
          excluded: input.report.excluded.filter(belongs),
          scopedElementIndexes: elements.flatMap((element, index) =>
            root.contains(element) ? [index] : [],
          ),
        };
      },
      { report: typography, textKeys: state.rows.map((row) => row.sourceKey) },
    );
    const afterScanFingerprint = await panelPaintFingerprint(frame);
    evidence['identityFingerprintAfterScan'] = createHash('sha256')
      .update(afterScanFingerprint)
      .digest('hex');
    require(afterScanFingerprint ===
      fingerprint, 'Panel source identity, pseudo styles or geometry changed during canonical scanning');
    const { samples, findings, unmeasured } = scoped;
    evidence['samples'] = samples;
    evidence['scopedFindings'] = findings;
    evidence['scopedUnmeasured'] = unmeasured;
    evidence['scopedExcluded'] = scoped.excluded;
    evidence['contrast'] =
      typography.canvasColor && samples.length
        ? evaluatePublicTextContrast(samples, typography.canvasColor)
        : null;
    type Rect = typeof state.rect;
    const within = (
      rect: Rect,
      container: { left: number; right: number; top: number; bottom: number },
    ) =>
      rect.left >= container.left - 1 &&
      rect.right <= container.right + 1 &&
      rect.top >= container.top - 1 &&
      rect.bottom <= container.bottom + 1;
    const unclipped = (rect: Rect, ancestors: typeof state.ancestors) =>
      ancestors.every(
        (ancestor) =>
          ancestor.documentPort ||
          ((!['hidden', 'clip'].includes(ancestor.overflowX) ||
            (rect.left >= ancestor.port.left - 1 && rect.right <= ancestor.port.right + 1)) &&
            (!['hidden', 'clip'].includes(ancestor.overflowY) ||
              (rect.top >= ancestor.port.top - 1 && rect.bottom <= ancestor.port.bottom + 1))),
      );
    const paintKnown = (ancestors: typeof state.ancestors) =>
      ancestors.every(
        (ancestor) =>
          !ancestor.hidden &&
          !ancestor.suppressed &&
          !ancestor.inert &&
          !ancestor.scaled &&
          ancestor.opacity === 1 &&
          ancestor.mask === 'none' &&
          ancestor.clipPath === 'none' &&
          ['auto', 'rect(auto, auto, auto, auto)'].includes(ancestor.clip) &&
          ancestor.filter === 'none' &&
          ['', 'none'].includes(ancestor.backdropFilter) &&
          ancestor.blendMode === 'normal',
      );
    require(state.connected &&
      state.rect.width > 0 &&
      state.rect.height > 0, 'Panel geometry is absent');
    require(state.reduced &&
      state.activeAnimations === 0, 'Panel reduced-motion completion is unproven');
    require(!state.ancestors.some(
      (ancestor) => ancestor.hidden || ancestor.suppressed,
    ), 'Panel is visually hidden');
    require(!state.ancestors.some((ancestor) => ancestor.inert), 'Panel is inactive/inert');
    require(!state.ancestors.some((ancestor) => ancestor.scaled), 'Panel is scaled or rotated');
    require(!state.ancestors.some(
      (ancestor) =>
        ancestor.mask !== 'none' || ancestor.clipPath !== 'none' || ancestor.filter !== 'none',
    ), 'Panel paint has an unmeasured mask, clip path or filter');
    require(state.rect.left >= -1 &&
      state.rect.right <= state.viewportWidth + 1, 'Panel exceeds the horizontal viewport');
    require(state.scrollWidth <= state.clientWidth + 1, 'Panel has horizontal overflow');
    require(state.scrollports.length === 0, 'Panel has an unobserved internal scroll state');
    require(state.parts.every(
      (part) => part.count === 1 && part.actual[0] === part.text,
    ), 'Panel expected scene content is missing or changed');
    require(state.parts.every(
      (part) => !part.icon || part.icons?.[0] === 1,
    ), 'Panel vector icon witness is missing');
    require(state.parts.every(
      (part) =>
        !part.icon ||
        (part.vectors?.length === 1 &&
          part.vectors[0]?.length === 1 &&
          part.vectors[0].every(
            (vector) =>
              vector.connected &&
              vector.rect.width > 0 &&
              vector.rect.height > 0 &&
              within(vector.rect, state.rect) &&
              paintKnown(vector.ancestors) &&
              unclipped(vector.rect, vector.ancestors) &&
              vector.graphics.length > 0 &&
              vector.graphics.every(
                (graphic) =>
                  graphic.supported &&
                  graphic.painted &&
                  graphic.fillAlpha !== null &&
                  graphic.strokeAlpha !== null &&
                  Number.isFinite(graphic.fillOpacity) &&
                  Number.isFinite(graphic.strokeOpacity) &&
                  within(graphic.rect, vector.rect) &&
                  within(graphic.rect, state.rect) &&
                  paintKnown(graphic.ancestors) &&
                  unclipped(graphic.rect, graphic.ancestors),
              ),
          )),
    ), 'Panel vector icon witness is missing');
    require(JSON.stringify(state.scopedElementIndexes) ===
      JSON.stringify(
        scoped.scopedElementIndexes,
      ), 'Panel element identity changed during canonical scanning');
    require(samples.every((sample) => sample.kind === 'text') &&
      !unmeasured.some(
        (issue) =>
          issue.kind.startsWith('generated-') || issue.kind === 'unsupported-generated-content',
      ), 'Panel generated text is unmeasured');
    require(state.rows.length === contract.filter((part) => part.text).length &&
      state.rows.map((row) => row.text).join('\n') ===
        contract
          .filter((part) => part.text)
          .map((part) => part.text)
          .join('\n'), 'Panel full source text witness is incomplete');
    require(state.counted ===
      typography.coverage.textNodes, 'Panel text identity disagrees with the canonical scanner');
    const shell = state.structures.find((part) => part.selector === '.agi-dev-shell')?.rects[0];
    require(state.structures.every(
      (part) => part.count === 1,
    ), 'Panel required geometry structure is absent');
    require([...state.structures, ...state.parts].every((part) =>
      part.rects.every((rect) => within(rect, state.rect)),
    ), 'Panel part overflows the frame');
    for (const structure of state.structures)
      for (const rect of structure.rects) {
        require(rect.width > 0 &&
          rect.height > 0, `Panel geometry is empty: ${structure.selector}`);
        if (shell)
          require(rect.left >= shell.left - 1 &&
            rect.right <= shell.right + 1 &&
            rect.top >= shell.top - 1 &&
            rect.bottom <=
              shell.bottom + 1, `Panel part overflows the shell: ${structure.selector}`);
      }
    for (const part of state.parts)
      for (const rect of part.rects) {
        require(rect.width > 0 &&
          rect.height > 0, `Panel scene part geometry is empty: ${part.selector}`);
        if (shell) require(within(rect, shell), `Panel part overflows the shell: ${part.selector}`);
      }
    for (const ancestor of state.ancestors) {
      if (ancestor.documentPort) continue;
      if (['hidden', 'clip'].includes(ancestor.overflowX))
        require(state.rect.left >= ancestor.port.left - 1 &&
          state.rect.right <=
            ancestor.port.right +
              1, `Panel is permanently clipped horizontally: ${ancestor.selector}`);
      if (['hidden', 'clip'].includes(ancestor.overflowY))
        require(state.rect.top >= ancestor.port.top - 1 &&
          state.rect.bottom <=
            ancestor.port.bottom +
              1, `Panel is permanently clipped vertically: ${ancestor.selector}`);
    }
    for (const row of state.rows) {
      const painted = samples.filter((sample) => sample.sourceKey === row.sourceKey);
      require(painted.length === 1, `Panel source text lacks one painted sample: ${row.text}`);
      for (const sample of painted) {
        const floor = row.body ? 17 : sample.mono ? 15 : 14;
        require(sample.text === row.text, `Panel painted text identity changed: ${row.text}`);
        require(sample.rects.every((rect) =>
          within(rect, state.rect),
        ), `Panel painted text overflows the frame: ${row.text}`);
        if (shell)
          require(sample.rects.every((rect) =>
            within(rect, shell),
          ), `Panel painted text overflows the shell: ${row.text}`);
        require(sample.declaredSize >= floor - 0.01 &&
          sample.renderedSize !== null &&
          sample.renderedSize >=
            floor - 0.01, `Panel text is below its ${floor}px floor: ${row.text}`);
        require(sample.scaleX !== null &&
          sample.scaleY !== null &&
          Math.abs(sample.scaleX - 1) < 0.001 &&
          Math.abs(sample.scaleY - 1) <
            0.001, `Panel text has scaled or unknown geometry: ${row.text}`);
        require(row.family ===
          (sample.mono
            ? state.expectedMono
            : state.expectedSans), `Panel text uses a noncanonical font: ${row.text}`);
        require(sample.paintUnmeasured.length === 0, `Panel text paint is unmeasured: ${row.text}`);
      }
    }
    require(findings.length === 0, 'Panel canonical typography findings remain');
    require(unmeasured.length === 0, 'Panel canonical geometry or scroll coverage is unmeasured');
    const contrast = evidence['contrast'] as ReturnType<typeof evaluatePublicTextContrast> | null;
    require(contrast !== null &&
      contrast.findings.length === 0 &&
      contrast.unmeasured.length === 0 &&
      contrast.coverage.measured ===
        state.rows.length, 'Panel text contrast is unreadable or unmeasured');
    require(!evidence['fontError'] &&
      fontProof !== null &&
      fontProof.fontCoverageGaps.length === 0, 'Panel actual font and glyph proof failed');
  } finally {
    try {
      const restored = await annotation.evaluate((originals) => {
        for (const { element, original } of originals)
          if (original === null) element.removeAttribute('data-testid');
          else element.setAttribute('data-testid', original);
        return originals.every(
          ({ element, original }) =>
            element.isConnected && element.getAttribute('data-testid') === original,
        );
      });
      const restoredFingerprint = await panelPaintFingerprint(frame);
      evidence['identityFingerprintRestored'] = createHash('sha256')
        .update(restoredFingerprint)
        .digest('hex');
      evidence['identityAnnotationRestored'] = restored && restoredFingerprint === fingerprint;
      require(evidence['identityAnnotationRestored'] ===
        true, 'Panel identity annotation restoration is unproven');
    } finally {
      await annotation.dispose();
    }
  }
  evidence['failures'] = failures;
  return { state, failures };
}

async function capturePanel(
  page: Page,
  frame: Locator,
  contract: readonly ScenePart[],
  testInfo: TestInfo,
  evidence: Evidence,
) {
  const beforeScene: Evidence = {};
  const measuredBefore = await measurePanel(page, frame, contract, beforeScene);
  evidence['beforeCapture'] = beforeScene;
  expect(measuredBefore.failures, 'Panel scene must pass before capture').toEqual([]);
  const before = await frame.boundingBox();
  if (!before) throw new Error('Panel capture has no geometry');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Panel capture has no viewport');
  const clip = {
    x: Math.max(0, before.x),
    y: Math.max(0, before.y),
    width: Math.min(viewport.width, before.x + before.width) - Math.max(0, before.x),
    height: Math.min(viewport.height, before.y + before.height) - Math.max(0, before.y),
  };
  if (clip.width <= 0 || clip.height <= 0) throw new Error('Panel capture is outside the viewport');
  const png = await page.screenshot({ clip, animations: 'allow' });
  const after = await frame.boundingBox();
  const pixelScale = await page.evaluate(() => devicePixelRatio);
  const dimensions = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  evidence['capture'] = {
    before,
    after,
    clip,
    dimensions,
    pixelScale,
    sha256: createHash('sha256').update(png).digest('hex'),
    fullFrame: clip.width >= before.width - 1 && clip.height >= before.height - 1,
  };
  await testInfo.attach('side-panel.png', { body: png, contentType: 'image/png' });
  expect(dimensions.width).toBeGreaterThanOrEqual(Math.floor(clip.width * pixelScale));
  expect(dimensions.width).toBeLessThanOrEqual(Math.ceil(clip.width * pixelScale));
  expect(dimensions.height).toBeGreaterThanOrEqual(Math.floor(clip.height * pixelScale));
  expect(dimensions.height).toBeLessThanOrEqual(Math.ceil(clip.height * pixelScale));
  expect(after, 'Panel geometry changed during capture').toEqual(before);
  const measuredAfter = await measurePanel(page, frame, contract, evidence);
  expect(measuredAfter.failures, 'Panel scene must pass after capture').toEqual([]);
  expect(measuredAfter.state, 'Measured panel scene changed during capture').toEqual(
    measuredBefore.state,
  );
  for (const key of [
    'samples',
    'scopedFindings',
    'scopedUnmeasured',
    'scopedExcluded',
    'contrast',
    'fontProof',
  ])
    expect(evidence[key], `Panel ${key} changed during capture`).toEqual(beforeScene[key]);
  for (const key of ['identityFingerprintBefore', 'identityFingerprintRestored']) {
    expect(beforeScene[key], 'Panel full paint before capture is unmeasured').toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(evidence[key], 'Panel full paint after capture is unmeasured').toMatch(/^[a-f0-9]{64}$/);
    expect(evidence[key], 'Panel full paint changed during capture').toBe(beforeScene[key]);
  }
  evidence['captureSceneStable'] = true;
  return measuredAfter;
}

test.use({ screenshot: 'off', video: 'off', trace: 'off' });
test.describe.configure({ retries: 0 });

for (const width of widths)
  for (const theme of themes) {
    test(`SidePanelCard baseline ${pathname} ${width}px ${theme}`, async ({
      browser,
      baseURL,
    }, testInfo) => {
      if (!baseURL || testInfo.config.workers !== 1)
        throw new Error('Panel baseline requires a base URL and one worker');
      const routes = getPublicRouteInventory().routes.filter((route) => route.path === pathname);
      expect(routes).toHaveLength(1);
      const route = routes[0]!;
      expect(route.context).toBe('signed-out');
      expect(route.unresolvedFlags).toEqual([]);
      const report: Evidence = {
        pathname,
        width,
        theme,
        sourceStart: sourceSnapshot(),
        contextClosed: false,
        scope:
          'One decorative SidePanelCard hero only; these cases do not certify a route or other variants.',
        limits: [
          'Canonical font proof proves registration, loading and declared Unicode coverage, not glyph fallback pixels.',
          'The panel has no native scroll/control contract; pending internal scroll states fail rather than becoming clip passes.',
          'Axis-aligned geometry does not prove rounded-corner paint, external overlays or pointer-transparent occlusion.',
          'SVG witnesses cover positive primitive geometry and computed fill or stroke, not shape identity or antialiased pixels.',
          'Contrast uses canonical computed paint layers; unknown masks, gradients and filters remain unmeasured.',
          'Expected decorative aria-hidden is recorded separately; this spec does not claim accessible panel interaction.',
          'PNG evidence is the visible viewport intersection; full-frame geometry is not full-frame paint acceptance.',
          'Source hashes cover the listed owners, not every transitive input or environment value.',
        ],
      };
      const context = await browser.newContext({
        baseURL,
        viewport: { width, height: width < 768 ? 844 : 900 },
        colorScheme: theme,
        reducedMotion: 'reduce',
        hasTouch: width < 768,
        storageState: { cookies: [], origins: [] },
      });
      let failure: unknown;
      try {
        expect(await context.storageState()).toEqual({ cookies: [], origins: [] });
        const page = await context.newPage();
        const destination = new URL(pathname, baseURL);
        const expectation = {
          ...route,
          expectedOrigin: destination.origin,
          expectedQuery: destination.search,
        };
        report['initialReadiness'] = await settlePublicPage(page, expectation, {
          expectedFonts: [{ cssVariable: '--font-geist-sans' }],
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
        report['readiness'] = await settlePublicPage(page, expectation, {
          expectedFonts: [{ cssVariable: '--font-geist-sans' }],
        });
        await expect(banner).toHaveCount(0);
        report['theme'] = await page.evaluate(() => ({
          marker: document.documentElement.dataset['theme'],
          light: document.documentElement.classList.contains('light'),
          dark: document.documentElement.classList.contains('dark'),
          scheme: getComputedStyle(document.documentElement).colorScheme,
          prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
        }));
        expect(report['theme']).toEqual({
          marker: theme,
          light: theme === 'light',
          dark: theme === 'dark',
          scheme: theme,
          prefersDark: theme === 'dark',
        });
        const hero = page.locator(heroSelector);
        await expect(hero).toHaveCount(1);
        await expect(
          hero.getByRole('link', { name: 'See AGI Desktop', exact: true }),
        ).toHaveAttribute('href', '/desktop');
        await expect(hero.getByRole('link', { name: 'Get Started', exact: true })).toHaveAttribute(
          'href',
          '/get-started',
        );
        await expect(hero.locator('.agi-fl-eyebrow')).toHaveText('AGI in Chrome · coming soon');
        const frame = hero.locator(frameSelector);
        await expect(frame).toHaveCount(1);
        await expect(hero.locator('.agi-fl-hero-visual')).toHaveAttribute('aria-hidden', 'true');
        await expect(frame.locator('.agi-dev-bar')).toHaveAttribute('aria-hidden', 'true');
        await expect(frame.locator('.agi-pn')).toHaveAttribute('aria-hidden', 'true');
        await frame.scrollIntoViewIfNeeded();
        await reducedMotionComplete(frame);
        await expect(frame.locator('.agi-dev-type')).toHaveText('Ask about this page…');
        const measured = await capturePanel(page, frame, scene, testInfo, report);
        report['finalUrl'] = page.url();
        expect(page.url()).toBe(destination.href);
        expect(
          measured.failures,
          'SidePanelCard baseline retains every failed or unmeasured witness',
        ).toEqual([]);
        report['status'] = 'passed';
      } catch (error) {
        failure = error;
        report['status'] = 'failed';
        report['error'] = error instanceof Error ? error.message : String(error);
        if (error instanceof PublicReadinessFontError)
          report['readinessFontDiagnostic'] = error.diagnostic;
      } finally {
        try {
          await context.close();
          report['contextClosed'] = true;
        } catch (error) {
          report['contextCloseError'] = String(error);
          failure ??= error;
        }
        try {
          report['sourceEnd'] = sourceSnapshot();
          report['sourceUnchanged'] =
            JSON.stringify(report['sourceStart']) === JSON.stringify(report['sourceEnd']);
          if (!report['sourceUnchanged'] && !failure)
            failure = new Error('Panel source changed during measurement');
        } catch (error) {
          report['sourceEndError'] = String(error);
          failure ??= error;
        }
        report['status'] = failure ? 'failed' : 'passed';
        if (failure) report['error'] = failure instanceof Error ? failure.message : String(failure);
        await testInfo.attach('side-panel-baseline.json', {
          body: JSON.stringify(report, null, 2),
          contentType: 'application/json',
        });
      }
      if (failure) throw failure;
    });
  }

const fixtureScene = scene.map((part, index) => ({
  ...part,
  icon: undefined,
  text: part.matchText ? `ABC${String.fromCharCode(65 + index)}` : 'ABC',
}));
const fixtureMarkup =
  '<figure class="agi-dev" data-device="panel" data-geometry="400x520"><div class="agi-dev-shell"><div class="agi-dev-bar" aria-hidden="true"><span class="agi-dev-title">ABC</span><span class="agi-dev-badge">ABC</span></div><div class="agi-pn" aria-hidden="true"><div class="agi-dev-pagestrip"><span class="agi-dev-pagestrip-icon">ABC</span><span><span class="agi-dev-pagestrip-title">ABC</span><span class="agi-dev-pagestrip-meta">ABC</span></span><span class="agi-dev-pagestrip-badge">ABC</span></div><div class="agi-pn-main"><div class="agi-pn-chips"><span>ABCG</span><span>ABCH</span><span>ABCI</span></div><p class="agi-pn-msg">ABC</p><p class="agi-pn-line--ok">ABC</p><p class="agi-pn-line--dim">ABC</p></div><div class="agi-dev-panelcomposer"><div class="agi-dev-panelcomposer-row"><span class="agi-dev-panelcomposer-icon">ABC</span><span class="agi-dev-panelcomposer-ghost"><span class="agi-dev-type">ABC</span></span><span class="agi-dev-send">ABC</span></div><div class="agi-dev-panelcomposer-foot"><span>ABCP</span><span>ABCQ</span></div></div></div></div></figure>';

async function installFixture(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('http://side-panel-fixture.invalid/**', (request) =>
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
        : `<style>@font-face{font-family:FixtureSans;src:url('/fixture.woff2');unicode-range:U+0041-005A}@font-face{font-family:FixtureMono;src:url('/fixture.woff2');unicode-range:U+0041-005A}:root{--font-geist-sans:FixtureSans;--font-geist-mono:FixtureMono;color-scheme:light}*{box-sizing:border-box}html,body{margin:0;background:white;color:black;font:17px FixtureSans}main{padding:20px}figure{margin:0;width:350px;height:620px}.agi-dev-shell{height:620px;overflow:hidden;background:white}.agi-dev-bar{height:40px;font-family:FixtureMono}.agi-pn{height:580px;display:flex;flex-direction:column}.agi-dev-pagestrip{height:100px}.agi-pn-main{height:330px}.agi-dev-panelcomposer{height:150px}.agi-dev-panelcomposer-row{height:90px}.agi-dev-panelcomposer-foot{height:60px;font-family:FixtureMono}span{display:inline-block}p{margin:5px 0}@keyframes fixture-drift{from{transform:translateX(0)}to{transform:translateX(1px)}}</style><main><div class="agi-fl-hero-visual" aria-hidden="true">${fixtureMarkup}</div><p id="decoy">ABC</p></main>`,
    }),
  );
  return settlePublicPage(
    page,
    {
      path: 'http://side-panel-fixture.invalid/fixture',
      expectedHttpStatuses: [200],
      expectedFinalPath: '/fixture',
      expectedOrigin: 'http://side-panel-fixture.invalid',
      expectedQuery: '',
    },
    { samples: 3, intervalMs: 20, readinessTimeout: 1000, expectedFonts: fonts },
  );
}

test('SidePanel instrument accepts a fitting decorative fixture and rejects controlled defects', async ({
  page,
}, testInfo) => {
  const evidence: Evidence = {};
  try {
    evidence['readiness'] = await installFixture(page);
    const frame = page.locator(frameSelector);
    await reducedMotionComplete(frame);
    const fitting = await measurePanel(page, frame, fixtureScene, evidence);
    expect(
      fitting.failures,
      'Fitting aria-hidden fixture must establish a positive instrument control',
    ).toEqual([]);
    const scrolled: Evidence = {};
    await page.locator('main').evaluate((element) => {
      element.style.paddingTop = '1020px';
    });
    await page.evaluate(() => scrollTo({ top: 900, behavior: 'instant' }));
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await capturePanel(page, frame, fixtureScene, testInfo, scrolled);
    expect(scrolled['capture']).toMatchObject({
      dimensions: { width: 350, height: 620 },
      fullFrame: true,
    });
    evidence['scrolled viewport capture'] = scrolled;
    await page.locator('main').evaluate((element) => element.removeAttribute('style'));
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await frame
      .locator('.agi-dev-type')
      .evaluate((element) => element.setAttribute('data-testid', 'panel-typing-fixture'));
    const defects = [
      {
        name: 'hidden frame with outside decoy',
        selector: '.agi-dev',
        style: 'display:none',
        expected: 'Panel is visually hidden',
      },
      {
        name: 'hidden required text',
        selector: '.agi-dev-type',
        style: 'display:none',
        expected: 'Panel source text lacks one painted sample',
      },
      {
        name: 'clipped composer',
        selector: '.agi-dev-panelcomposer',
        style: 'transform:translateY(80px)',
        expected: 'Panel part overflows the shell',
      },
      {
        name: 'scaled text',
        selector: '.agi-pn-msg',
        style: 'scale:.5',
        expected: 'Panel text has scaled or unknown geometry',
      },
      {
        name: 'partially clipped text with test id',
        selector: '.agi-dev-type',
        style: 'width:10px;overflow:hidden',
        expected: 'Panel canonical typography findings remain',
      },
      {
        name: 'ancestor animation under reduced motion',
        selector: '.agi-fl-hero-visual',
        style: 'animation:fixture-drift 10s linear infinite',
        expected: 'Panel reduced-motion completion is unproven',
      },
      {
        name: 'unreadable text',
        selector: '.agi-pn-msg',
        style: 'font-size:9px',
        expected: 'Panel text is below its',
      },
      {
        name: 'unregistered custom font',
        selector: '.agi-pn-msg',
        style: 'font-family:MissingFixtureFont',
        expected: 'Panel actual font and glyph proof failed',
      },
      {
        name: 'unreadable contrast',
        selector: '.agi-pn-msg',
        style: 'color:white',
        expected: 'Panel text contrast is unreadable or unmeasured',
      },
      {
        name: 'masked panel',
        selector: '.agi-dev',
        style: 'mask-image:linear-gradient(black,transparent)',
        expected: 'Panel paint has an unmeasured mask',
      },
    ];
    for (const defect of defects) {
      const target =
        defect.selector === '.agi-dev'
          ? frame
          : defect.selector === '.agi-fl-hero-visual'
            ? page.locator(defect.selector)
            : frame.locator(defect.selector);
      await target.evaluate((element, style) => element.setAttribute('style', style), defect.style);
      const result: Evidence = {};
      const measured = await measurePanel(page, frame, fixtureScene, result);
      evidence[defect.name] = result;
      expect(
        measured.failures.some((failure) => failure.includes(defect.expected)),
        defect.name,
      ).toBe(true);
      await target.evaluate((element) => element.removeAttribute('style'));
    }
    await frame.evaluate((element) => element.setAttribute('inert', ''));
    const inert: Evidence = {};
    expect((await measurePanel(page, frame, fixtureScene, inert)).failures).toContain(
      'Panel is inactive/inert',
    );
    evidence['inert'] = inert;
    await frame.evaluate((element) => element.removeAttribute('inert'));
    await frame.locator('.agi-dev-type').evaluate((element) => {
      element.textContent = 'ABC Ω';
    });
    const unsupported: Evidence = {};
    const lateContract = fixtureScene.map((part) =>
      part.selector === '.agi-dev-type' ? { ...part, text: 'ABC Ω' } : part,
    );
    expect((await measurePanel(page, frame, lateContract, unsupported)).failures).toContain(
      'Panel actual font and glyph proof failed',
    );
    evidence['unsupported glyph after readiness'] = unsupported;
    await frame.evaluate((element) => element.parentElement?.append(element.cloneNode(true)));
    await expect(measurePanel(page, frame, fixtureScene, {})).rejects.toThrow(
      'Exactly one scoped hero panel is required',
    );
    await frame.nth(1).evaluate((element) => element.remove());
    await frame.evaluate((element) => element.remove());
    await expect(measurePanel(page, frame, fixtureScene, {})).rejects.toThrow(
      'Exactly one scoped hero panel is required',
    );
  } finally {
    await testInfo.attach('side-panel-instrument.json', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
  }
});

const fixtureVectors = [
  { selector: '.agi-dev-pagestrip-icon', label: 'Page context', text: '' },
  { selector: '.agi-pn-line--ok', label: 'Context attached', text: 'ABC' },
  { selector: '.agi-dev-panelcomposer-icon', label: 'Page context', text: '' },
  { selector: '.agi-dev-send', label: 'Send message', text: '' },
] as const;
const vectorFixtureScene = fixtureScene.map((part) => {
  const vector = fixtureVectors.find((candidate) => candidate.selector === part.selector);
  return vector ? { ...part, text: vector.text, icon: vector.label } : part;
});

async function installVectorFixture(page: Page) {
  const readiness = await installFixture(page);
  const frame = page.locator(frameSelector);
  await frame.evaluate((element, vectors) => {
    for (const vector of vectors) {
      const parent = element.querySelector(vector.selector);
      if (!parent) throw new Error(`Vector fixture parent is missing: ${vector.selector}`);
      parent.textContent = vector.text;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('aria-label', vector.label);
      svg.setAttribute('role', 'img');
      svg.setAttribute('width', '24');
      svg.setAttribute('height', '24');
      svg.setAttribute('viewBox', '0 0 24 24');
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '12');
      circle.setAttribute('cy', '12');
      circle.setAttribute('r', '8');
      circle.setAttribute('fill', 'currentColor');
      svg.append(circle);
      parent.append(svg);
    }
  }, fixtureVectors);
  return { readiness, frame };
}

for (const defect of [
  { name: 'hidden labelled SVG', style: 'display:none' },
  { name: 'zero-size labelled SVG', style: 'width:0;height:0' },
] as const) {
  test(`SidePanel instrument rejects ${defect.name}`, async ({ page }, testInfo) => {
    const evidence: Evidence = {};
    try {
      const { readiness, frame } = await installVectorFixture(page);
      evidence['readiness'] = readiness;
      const baseline: Evidence = {};
      expect((await measurePanel(page, frame, vectorFixtureScene, baseline)).failures).toEqual([]);
      evidence['baseline'] = baseline;
      const svg = frame.locator('.agi-dev-panelcomposer-icon').getByRole('img', {
        name: 'Page context',
        exact: true,
        includeHidden: true,
      });
      await expect(svg).toHaveCount(1);
      await expect(svg).toBeVisible();
      const positive = await svg.boundingBox();
      expect(positive?.width).toBe(24);
      expect(positive?.height).toBe(24);
      await svg.evaluate((element, style) => element.setAttribute('style', style), defect.style);
      evidence['injection'] = await svg.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          display: getComputedStyle(element).display,
          width: rect.width,
          height: rect.height,
        };
      });
      await expect(svg).toBeHidden();
      const result: Evidence = {};
      const measured = await measurePanel(page, frame, vectorFixtureScene, result);
      evidence['defect'] = result;
      expect(measured.failures).toContain('Panel vector icon witness is missing');
    } finally {
      await testInfo.attach('side-panel-vector-counterexample.json', {
        body: JSON.stringify(evidence, null, 2),
        contentType: 'application/json',
      });
    }
  });
}

for (const defect of ['missing', 'changed', 'duplicate'] as const) {
  test(`SidePanel instrument rejects ${defect} regular scene text`, async ({ page }, testInfo) => {
    const evidence: Evidence = {};
    try {
      evidence['readiness'] = await installFixture(page);
      const frame = page.locator(frameSelector);
      const baseline: Evidence = {};
      expect((await measurePanel(page, frame, fixtureScene, baseline)).failures).toEqual([]);
      evidence['baseline'] = baseline;
      const span = frame.locator('.agi-dev-type');
      await expect(span).toHaveCount(1);
      await expect(span).toHaveText('ABC');
      await span.evaluate((element, mutation) => {
        if (mutation === 'missing') element.remove();
        else if (mutation === 'changed') element.textContent = 'XYZ';
        else element.after(element.cloneNode(true));
      }, defect);
      const injected = await frame.locator('.agi-dev-type').allTextContents();
      evidence['injection'] = injected;
      expect(injected).toEqual(
        defect === 'missing' ? [] : defect === 'changed' ? ['XYZ'] : ['ABC', 'ABC'],
      );
      const result: Evidence = {};
      const measured = await measurePanel(page, frame, fixtureScene, result);
      evidence['defect'] = result;
      expect(measured.failures).toContain('Panel expected scene content is missing or changed');
    } finally {
      await testInfo.attach('side-panel-dom-counterexample.json', {
        body: JSON.stringify(evidence, null, 2),
        contentType: 'application/json',
      });
    }
  });
}

for (const defect of ['transparent', 'clipped', 'unpainted'] as const) {
  test(`SidePanel instrument rejects ${defect} labelled SVG paint`, async ({ page }, testInfo) => {
    const evidence: Evidence = {};
    try {
      const { readiness, frame } = await installVectorFixture(page);
      evidence['readiness'] = readiness;
      const baseline: Evidence = {};
      expect((await measurePanel(page, frame, vectorFixtureScene, baseline)).failures).toEqual([]);
      evidence['baseline'] = baseline;
      const parent = frame.locator('.agi-dev-panelcomposer-icon');
      const svg = parent.getByRole('img', {
        name: 'Page context',
        exact: true,
        includeHidden: true,
      });
      await expect(svg).toHaveCount(1);
      if (defect === 'clipped')
        await parent.evaluate((element) =>
          element.setAttribute('style', 'width:8px;height:8px;overflow:hidden'),
        );
      else if (defect === 'transparent')
        await svg.evaluate((element) => element.setAttribute('style', 'opacity:0'));
      else
        await svg
          .locator('circle')
          .evaluate((element) => element.setAttribute('style', 'fill:none;stroke:none'));
      const injected = await svg.evaluate((element) => {
        const circle = element.querySelector('circle');
        const parent = element.parentElement;
        if (!circle || !parent) throw new Error('SVG paint fixture is incomplete');
        return {
          opacity: getComputedStyle(element).opacity,
          width: element.getBoundingClientRect().width,
          parentWidth: parent.getBoundingClientRect().width,
          overflow: getComputedStyle(parent).overflow,
          fill: getComputedStyle(circle).fill,
          stroke: getComputedStyle(circle).stroke,
        };
      });
      evidence['injection'] = injected;
      expect(injected.width).toBe(24);
      if (defect === 'transparent') expect(injected.opacity).toBe('0');
      else if (defect === 'clipped') {
        expect(injected.parentWidth).toBe(8);
        expect(injected.overflow).toBe('hidden');
      } else
        expect({ fill: injected.fill, stroke: injected.stroke }).toEqual({
          fill: 'none',
          stroke: 'none',
        });
      const result: Evidence = {};
      const measured = await measurePanel(page, frame, vectorFixtureScene, result);
      evidence['defect'] = result;
      expect(measured.failures).toContain('Panel vector icon witness is missing');
    } finally {
      await testInfo.attach('side-panel-vector-paint-counterexample.json', {
        body: JSON.stringify(evidence, null, 2),
        contentType: 'application/json',
      });
    }
  });
}

test('SidePanel capture rejects a scene change inside an unchanged frame', async ({
  page,
}, testInfo) => {
  const evidence: Evidence = {};
  const originalScreenshot = page.screenshot;
  let screenshotCalled = false;
  try {
    evidence['readiness'] = await installFixture(page);
    const frame = page.locator(frameSelector);
    const initial = await frame.boundingBox();
    page.screenshot = async (options) => {
      screenshotCalled = true;
      await frame.locator('.agi-dev-type').evaluate((element) => {
        (element as HTMLElement).style.marginInlineStart = '20px';
      });
      return originalScreenshot.call(page, options);
    };
    await expect(capturePanel(page, frame, fixtureScene, testInfo, evidence)).rejects.toThrow(
      'Measured panel scene changed during capture',
    );
    expect(screenshotCalled).toBe(true);
    expect(await frame.boundingBox()).toEqual(initial);
    expect((evidence['beforeCapture'] as Evidence)['failures']).toEqual([]);
    expect(evidence['failures']).toEqual([]);
    expect(evidence['captureSceneStable']).toBeUndefined();
  } finally {
    page.screenshot = originalScreenshot;
    await testInfo.attach('side-panel-capture-change-counterexample.json', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
  }
});

test('SidePanel instrument rejects a shell translated outside its figure', async ({
  page,
}, testInfo) => {
  const evidence: Evidence = {};
  try {
    evidence['readiness'] = await installFixture(page);
    const frame = page.locator(frameSelector);
    const baseline: Evidence = {};
    expect((await measurePanel(page, frame, fixtureScene, baseline)).failures).toEqual([]);
    evidence['baseline'] = baseline;
    await frame.locator('.agi-dev-shell').evaluate((element) => {
      (element as HTMLElement).style.transform = 'translateX(-40px)';
    });
    const injected = await frame.evaluate((element) => {
      const figure = element.getBoundingClientRect();
      const shell = element.querySelector('.agi-dev-shell');
      if (!shell) throw new Error('Translated fixture shell is missing');
      const bounds = shell.getBoundingClientRect();
      const text = [...shell.querySelectorAll('span,p')]
        .filter((part) => part.textContent?.trim())
        .map((part) => part.getBoundingClientRect());
      return {
        figureLeft: figure.left,
        shellLeft: bounds.left,
        viewportLeft: 0,
        textCount: text.length,
        textInsideShell: text.every(
          (rect) =>
            rect.left >= bounds.left &&
            rect.right <= bounds.right &&
            rect.top >= bounds.top &&
            rect.bottom <= bounds.bottom,
        ),
      };
    });
    evidence['injection'] = injected;
    expect(injected.shellLeft).toBeLessThan(injected.figureLeft);
    expect(injected.shellLeft).toBeLessThan(injected.viewportLeft);
    expect(injected.textCount).toBeGreaterThan(0);
    expect(injected.textInsideShell).toBe(true);
    const result: Evidence = {};
    const measured = await measurePanel(page, frame, fixtureScene, result);
    evidence['defect'] = result;
    expect(measured.failures).toContain('Panel part overflows the frame');
  } finally {
    await testInfo.attach('side-panel-shell-counterexample.json', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
  }
});

test('SidePanel instrument rejects unexpected generated scene text', async ({ page }, testInfo) => {
  const evidence: Evidence = {};
  try {
    evidence['readiness'] = await installFixture(page);
    const frame = page.locator(frameSelector);
    const baseline: Evidence = {};
    expect((await measurePanel(page, frame, fixtureScene, baseline)).failures).toEqual([]);
    evidence['baseline'] = baseline;
    const style = await page.addStyleTag({
      content: '.agi-dev-type::after { content:"XYZ"; font-size:9px; color:black; }',
    });
    try {
      const injected = await frame.locator('.agi-dev-type').evaluate((element) => ({
        sourceText: element.textContent,
        generatedText: getComputedStyle(element, '::after').content,
        generatedSize: getComputedStyle(element, '::after').fontSize,
        generatedDisplay: getComputedStyle(element, '::after').display,
      }));
      evidence['injection'] = injected;
      expect(injected).toEqual({
        sourceText: 'ABC',
        generatedText: '"XYZ"',
        generatedSize: '9px',
        generatedDisplay: 'inline',
      });
      const result: Evidence = {};
      const measured = await measurePanel(page, frame, fixtureScene, result);
      evidence['defect'] = result;
      expect(measured.failures).toContain('Panel generated text is unmeasured');
    } finally {
      await style.evaluate((element) => element.parentNode?.removeChild(element));
      await style.dispose();
    }
  } finally {
    await testInfo.attach('side-panel-generated-counterexample.json', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
  }
});

test('SidePanel instrument records geometry after its scoped font load', async ({
  page,
}, testInfo) => {
  type LateFontSnapshot = {
    status: FontFaceLoadStatus;
    fontFamily: string;
    checked: boolean;
    rect: {
      left: number;
      top: number;
      right: number;
      bottom: number;
      width: number;
      height: number;
    };
  };
  type LateFontRuntime = typeof window & {
    sidePanelLateFont?: { restore: () => void; snapshot: () => LateFontSnapshot };
  };
  const evidence: Evidence = {};
  const fontUrl = 'http://side-panel-fixture.invalid/late-fixture.woff2';
  const bindingName = 'releaseSidePanelLateFont';
  const fontLoads: { font: string; text: string; routeWasHeld: boolean }[] = [];
  const routeWork: Promise<void>[] = [];
  let released = false;
  let fulfilled = false;
  let releaseResource: (() => void) | undefined;
  let signalRouteStarted: (() => void) | undefined;
  const heldResource = new Promise<void>((resolve) => {
    releaseResource = resolve;
  });
  const routeStarted = new Promise<void>((resolve) => {
    signalRouteStarted = resolve;
  });
  const fontRoute: Parameters<Page['route']>[1] = (route) => {
    const work = (async () => {
      signalRouteStarted?.();
      await heldResource;
      await route.fulfill({
        contentType: 'font/woff2',
        body: readFileSync(
          path.join(
            repositoryRoot,
            'apps/web/public/fonts/opendyslexic/OpenDyslexic-Regular.woff2',
          ),
        ),
      });
      fulfilled = true;
    })();
    routeWork.push(work);
    return work;
  };
  const readFontSnapshot = () =>
    page.evaluate(() => {
      const runtime = window as LateFontRuntime;
      if (!runtime.sidePanelLateFont) throw new Error('Late-font fixture state is missing');
      return runtime.sidePanelLateFont.snapshot();
    });
  let binding: Awaited<ReturnType<Page['exposeBinding']>> | undefined;
  try {
    evidence['readiness'] = await installFixture(page);
    const frame = page.locator(frameSelector);
    const baseline: Evidence = {};
    expect((await measurePanel(page, frame, fixtureScene, baseline)).failures).toEqual([]);
    evidence['baseline'] = baseline;
    await page.route(fontUrl, fontRoute);
    binding = await page.exposeBinding(
      bindingName,
      (_source, request: { font: string; text: string }) => {
        if (!/\blatesans\b/i.test(request.font))
          throw new Error('Late-font resource requires the scoped LateSans proof request');
        fontLoads.push({
          font: request.font,
          text: request.text,
          routeWasHeld: routeWork.length > 0 && !released && !fulfilled,
        });
        released = true;
        releaseResource?.();
      },
    );
    await frame.evaluate(
      (element, options) => {
        const runtime = window as LateFontRuntime;
        const face = new FontFace('LateSans', `url("${options.fontUrl}")`, {
          unicodeRange: 'U+0041-005A',
          display: 'swap',
        });
        const figure = element as HTMLElement;
        const bodySans = document.body.style.getPropertyValue('--font-geist-sans');
        const bodyPriority = document.body.style.getPropertyPriority('--font-geist-sans');
        const figureFamily = figure.style.getPropertyValue('font-family');
        const figurePriority = figure.style.getPropertyPriority('font-family');
        const originalLoad = document.fonts.load;
        const originalLoadDescriptor = Object.getOwnPropertyDescriptor(document.fonts, 'load');
        runtime.sidePanelLateFont = {
          restore: () => {
            if (originalLoadDescriptor)
              Object.defineProperty(document.fonts, 'load', originalLoadDescriptor);
            else Reflect.deleteProperty(document.fonts, 'load');
            if (bodySans)
              document.body.style.setProperty('--font-geist-sans', bodySans, bodyPriority);
            else document.body.style.removeProperty('--font-geist-sans');
            if (figureFamily) figure.style.setProperty('font-family', figureFamily, figurePriority);
            else figure.style.removeProperty('font-family');
            document.fonts.delete(face);
            delete runtime.sidePanelLateFont;
          },
          snapshot: () => {
            const span = figure.querySelector('.agi-dev-type');
            if (!span) throw new Error('Late-font fixture text span is missing');
            const rect = span.getBoundingClientRect();
            return {
              status: face.status,
              fontFamily: getComputedStyle(span).fontFamily,
              checked: document.fonts.check('17px LateSans', 'ABC'),
              rect: {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
              },
            };
          },
        };
        document.fonts.add(face);
        document.fonts.load = async (font, text) => {
          if (/\blatesans\b/i.test(font)) {
            const release = (
              window as unknown as Record<
                string,
                ((request: { font: string; text: string }) => Promise<void>) | undefined
              >
            )[options.bindingName];
            if (!release) throw new Error('Late-font release binding is missing');
            await release({ font, text: text ?? '' });
          }
          return originalLoad.call(document.fonts, font, text);
        };
        document.body.style.setProperty('--font-geist-sans', 'LateSans');
        figure.style.fontFamily = 'LateSans, serif';
        runtime.sidePanelLateFont.snapshot();
      },
      { fontUrl, bindingName },
    );
    await routeStarted;
    const fallback = await readFontSnapshot();
    evidence['fallback'] = fallback;
    expect(fallback.status).toBe('loading');
    expect(fallback.checked).toBe(false);
    expect(fallback.fontFamily).toBe('LateSans, serif');
    expect(fallback.rect.width).toBeGreaterThan(0);
    expect(fallback.rect.height).toBeGreaterThan(0);
    expect(released).toBe(false);
    expect(fulfilled).toBe(false);
    expect(fontLoads).toEqual([]);
    const result: Evidence = {};
    const measured = await measurePanel(page, frame, fixtureScene, result);
    evidence['measurement'] = result;
    const loaded = await readFontSnapshot();
    evidence['loaded'] = loaded;
    evidence['scopedFontLoadSignals'] = fontLoads;
    evidence['resource'] = { released, fulfilled, routedRequests: routeWork.length };
    expect(fontLoads.length).toBeGreaterThan(0);
    expect(fontLoads[0]?.routeWasHeld).toBe(true);
    expect(fontLoads.some((request) => request.text.includes('ABC'))).toBe(true);
    expect(released).toBe(true);
    expect(fulfilled).toBe(true);
    expect(loaded.status).toBe('loaded');
    expect(loaded.checked).toBe(true);
    expect(
      fallback.rect.width !== loaded.rect.width || fallback.rect.height !== loaded.rect.height,
      'The controlled fallback and loaded font must have independently different span metrics',
    ).toBe(true);
    const recorded = measured.state.parts.find((part) => part.selector === '.agi-dev-type');
    expect(recorded?.count).toBe(1);
    expect(
      recorded?.rects,
      'Recorded part geometry must equal its actual post-load geometry',
    ).toEqual([loaded.rect]);
    expect(measured.failures).toEqual([]);
  } finally {
    evidence['scopedFontLoadSignals'] = fontLoads;
    evidence['resource'] = { released, fulfilled, routedRequests: routeWork.length };
    releaseResource?.();
    try {
      await Promise.all(routeWork);
    } finally {
      try {
        if (!page.isClosed()) {
          await page.evaluate(() => {
            const runtime = window as LateFontRuntime;
            runtime.sidePanelLateFont?.restore();
          });
        }
      } finally {
        try {
          await page.unroute(fontUrl, fontRoute);
        } finally {
          try {
            await binding?.dispose();
          } finally {
            await testInfo.attach('side-panel-late-font-counterexample.json', {
              body: JSON.stringify(evidence, null, 2),
              contentType: 'application/json',
            });
          }
        }
      }
    }
  }
});

test('SidePanel instrument excludes invalid outside text with the same class and content', async ({
  page,
}, testInfo) => {
  const evidence: Evidence = {};
  try {
    evidence['readiness'] = await installFixture(page);
    const frame = page.locator(frameSelector);
    const baseline: Evidence = {};
    expect((await measurePanel(page, frame, fixtureScene, baseline)).failures).toEqual([]);
    evidence['baseline'] = baseline;
    const outside = await page.evaluateHandle(() => {
      const main = document.querySelector('main');
      if (!main) throw new Error('Outside text fixture main is missing');
      const span = document.createElement('span');
      span.className = 'agi-dev-title';
      span.textContent = 'ABC';
      span.style.cssText = 'font:9px FixtureMono;color:black';
      main.append(span);
      return span;
    });
    try {
      const injected = await outside.evaluate((element, selector) => {
        const frame = document.querySelector(selector);
        if (!frame) throw new Error('Outside text fixture frame is missing');
        const rect = element.getBoundingClientRect();
        const inside = frame.querySelector('.agi-dev-title');
        return {
          outsideFrame: !frame.contains(element),
          className: element.className,
          text: element.textContent,
          fontSize: getComputedStyle(element).fontSize,
          fontFamily: getComputedStyle(element).fontFamily,
          loaded: document.fonts.check('9px FixtureMono', 'ABC'),
          width: rect.width,
          height: rect.height,
          insideClassName: inside?.className,
          insideText: inside?.textContent,
          matchingElements: document.querySelectorAll('.agi-dev-title').length,
        };
      }, frameSelector);
      evidence['injection'] = injected;
      expect(injected).toMatchObject({
        outsideFrame: true,
        className: 'agi-dev-title',
        text: 'ABC',
        fontSize: '9px',
        fontFamily: 'FixtureMono',
        loaded: true,
        insideClassName: 'agi-dev-title',
        insideText: 'ABC',
        matchingElements: 2,
      });
      expect(injected.width).toBeGreaterThan(0);
      expect(injected.height).toBeGreaterThan(0);
      const global = await page.evaluate(scanPublicTypography, {
        pageType: 'marketing' as const,
        pathname,
      });
      evidence['globalScanner'] = global;
      const outsideSamples = global.samples.filter(
        (sample) =>
          sample.selector === 'span.agi-dev-title' &&
          sample.text === 'ABC' &&
          sample.declaredSize === 9,
      );
      expect(outsideSamples).toHaveLength(1);
      const outsideFloors = global.findings.filter(
        (issue) =>
          issue.selector === 'span.agi-dev-title' &&
          issue.text === 'ABC' &&
          issue.actual === 9 &&
          ['declared-size-floor', 'rendered-size-floor'].includes(issue.kind),
      );
      expect(outsideFloors.map((issue) => issue.kind).sort()).toEqual([
        'declared-size-floor',
        'rendered-size-floor',
      ]);
      expect(outsideFloors.every((issue) => issue.sourceKey === undefined)).toBe(true);
      const scoped: Evidence = {};
      const measured = await measurePanel(page, frame, fixtureScene, scoped);
      evidence['scopedMeasurement'] = scoped;
      expect(
        measured.failures,
        'Clean panel must exclude keyless findings from the outside element',
      ).toEqual([]);
    } finally {
      await outside.evaluate((element) => element.remove());
      await outside.dispose();
    }
  } finally {
    await testInfo.attach('side-panel-outside-class-counterexample.json', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
  }
});

test('SidePanel capture rejects a visible border paint change inside stable geometry', async ({
  page,
}, testInfo) => {
  const evidence: Evidence = {};
  const originalScreenshot = page.screenshot;
  let title: Locator | undefined;
  let originalStyle: string | null | undefined;
  let screenshotCalled = false;
  try {
    evidence['readiness'] = await installFixture(page);
    const frame = page.locator(frameSelector);
    title = frame.locator('.agi-dev-title');
    await expect(title).toHaveCount(1);
    originalStyle = await title.getAttribute('style');
    await title.evaluate((element) => element.setAttribute('style', 'border:2px solid black'));
    const baseline: Evidence = {};
    expect((await measurePanel(page, frame, fixtureScene, baseline)).failures).toEqual([]);
    evidence['baseline'] = baseline;
    const snapshot = () =>
      frame.evaluate((element) => {
        const title = element.querySelector('.agi-dev-title');
        if (!title) throw new Error('Border paint fixture title is missing');
        const css = getComputedStyle(title);
        const frame = element.getBoundingClientRect();
        const rect = title.getBoundingClientRect();
        return {
          text: element.textContent,
          titleText: title.textContent,
          frame: [frame.left, frame.top, frame.width, frame.height],
          title: [rect.left, rect.top, rect.width, rect.height],
          color: css.borderTopColor,
          widths: [
            css.borderTopWidth,
            css.borderRightWidth,
            css.borderBottomWidth,
            css.borderLeftWidth,
          ],
          styles: [
            css.borderTopStyle,
            css.borderRightStyle,
            css.borderBottomStyle,
            css.borderLeftStyle,
          ],
          opacity: css.opacity,
          visibility: css.visibility,
          backdrop: getComputedStyle(document.body).backgroundColor,
        };
      });
    const before = await snapshot();
    evidence['beforePaint'] = before;
    expect(before.color).toBe('rgb(0, 0, 0)');
    expect(before.widths).toEqual(['2px', '2px', '2px', '2px']);
    expect(before.styles).toEqual(['solid', 'solid', 'solid', 'solid']);
    expect(before.opacity).toBe('1');
    expect(before.visibility).toBe('visible');
    expect(before.backdrop).toBe('rgb(255, 255, 255)');
    expect(before.titleText).toBe('ABC');
    expect(before.title[2]).toBeGreaterThan(4);
    expect(before.title[3]).toBeGreaterThan(4);
    page.screenshot = async (options) => {
      screenshotCalled = true;
      await frame.locator('.agi-dev-title').evaluate((element) => {
        (element as HTMLElement).style.borderColor = 'rgb(255, 0, 0)';
      });
      return originalScreenshot.call(page, options);
    };
    const capture: Evidence = {};
    evidence['captureMeasurement'] = capture;
    const captured = capturePanel(page, frame, fixtureScene, testInfo, capture);
    try {
      await captured;
    } catch (error) {
      evidence['captureError'] = String(error);
    }
    const after = await snapshot();
    evidence['afterPaint'] = after;
    expect(screenshotCalled).toBe(true);
    expect(after.color).toBe('rgb(255, 0, 0)');
    expect(after.frame).toEqual(before.frame);
    expect(after.title).toEqual(before.title);
    expect(after.text).toBe(before.text);
    expect(after.titleText).toBe(before.titleText);
    expect(after.widths).toEqual(before.widths);
    expect(after.styles).toEqual(before.styles);
    expect(after.opacity).toBe(before.opacity);
    expect(after.visibility).toBe(before.visibility);
    expect(after.backdrop).toBe(before.backdrop);
    const priorCapture = capture['beforeCapture'] as Evidence;
    expect(priorCapture['failures']).toEqual([]);
    expect(capture['failures']).toEqual([]);
    expect(capture['identityFingerprintBefore']).not.toBe(
      priorCapture['identityFingerprintBefore'],
    );
    expect(capture['identityFingerprintRestored']).not.toBe(
      priorCapture['identityFingerprintRestored'],
    );
    await expect(captured).rejects.toThrow('Panel full paint changed during capture');
  } finally {
    page.screenshot = originalScreenshot;
    try {
      if (title && originalStyle !== undefined)
        await title.evaluate((element, style) => {
          if (style === null) element.removeAttribute('style');
          else element.setAttribute('style', style);
        }, originalStyle);
    } finally {
      await testInfo.attach('side-panel-paint-capture-counterexample.json', {
        body: JSON.stringify(evidence, null, 2),
        contentType: 'application/json',
      });
    }
  }
});

test('SidePanel instrument accepts a fitting opaque stroked SVG', async ({ page }, testInfo) => {
  const evidence: Evidence = {};
  let host: Locator | undefined;
  let originalMarkup: string | undefined;
  try {
    evidence['readiness'] = await installFixture(page);
    const frame = page.locator(frameSelector);
    const baseline: Evidence = {};
    expect((await measurePanel(page, frame, fixtureScene, baseline)).failures).toEqual([]);
    evidence['baseline'] = baseline;
    host = frame.locator('.agi-dev-pagestrip-icon');
    await expect(host).toHaveCount(1);
    originalMarkup = await host.innerHTML();
    await host.evaluate((element) => {
      element.textContent = '';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'Opaque stroked path');
      svg.setAttribute('width', '24');
      svg.setAttribute('height', '24');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('style', 'display:block');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M5 12 L10 17 L19 7');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'rgb(0,0,0)');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.append(path);
      element.append(svg);
    });
    const svg = host.getByRole('img', {
      name: 'Opaque stroked path',
      exact: true,
      includeHidden: true,
    });
    await expect(svg).toHaveCount(1);
    await expect(svg).toBeVisible();
    const witness = await svg.evaluate((element) => {
      const path = element.querySelector('path');
      const host = element.parentElement;
      const frame = element.closest('figure');
      if (!(path instanceof SVGGeometryElement) || !host || !frame)
        throw new Error('Stroked SVG fixture geometry is missing');
      const box = (target: Element) => {
        const rect = target.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      };
      const css = getComputedStyle(path);
      const matrix = path.getScreenCTM();
      const local = path.getBBox();
      return {
        connected: element.isConnected && path.isConnected,
        text: host.textContent,
        frame: box(frame),
        host: box(host),
        svg: box(element),
        path: box(path),
        local: { x: local.x, y: local.y, width: local.width, height: local.height },
        length: path.getTotalLength(),
        matrix: matrix
          ? {
              constructor: matrix.constructor.name,
              is2DPresent: 'is2D' in matrix,
              is2DType: typeof matrix.is2D,
              is2D: matrix.is2D ?? null,
              coefficients: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f],
              determinant: matrix.a * matrix.d - matrix.b * matrix.c,
            }
          : null,
        fill: css.fill,
        stroke: css.stroke,
        strokeWidth: css.strokeWidth,
        strokeOpacity: css.strokeOpacity,
        vectorEffect: css.vectorEffect,
        linecap: css.strokeLinecap,
        linejoin: css.strokeLinejoin,
        paint: [path, element, host, frame].map((target) => {
          const style = getComputedStyle(target);
          return {
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            mask: style.maskImage,
            clipPath: style.clipPath,
          };
        }),
      };
    });
    evidence['independentStrokeWitness'] = witness;
    expect(witness.connected).toBe(true);
    expect(witness.text).toBe('');
    expect(witness.svg.width).toBe(24);
    expect(witness.svg.height).toBe(24);
    expect(witness.path.width).toBeGreaterThan(0);
    expect(witness.path.height).toBeGreaterThan(0);
    expect(witness.local).toEqual({ x: 5, y: 7, width: 14, height: 10 });
    expect(witness.length).toBeGreaterThan(0);
    expect(witness.matrix).not.toBeNull();
    if (!witness.matrix) throw new Error('Stroked SVG has no screen transform');
    expect(witness.matrix.coefficients).toHaveLength(6);
    expect(witness.matrix.coefficients.every(Number.isFinite)).toBe(true);
    expect(witness.matrix.coefficients.slice(0, 4)).toEqual([1, 0, 0, 1]);
    expect(witness.matrix.determinant).toBe(1);
    expect(witness.fill).toBe('none');
    expect(witness.stroke).toBe('rgb(0, 0, 0)');
    expect(witness.strokeWidth).toBe('2px');
    expect(witness.strokeOpacity).toBe('1');
    expect(witness.vectorEffect).toBe('none');
    expect(witness.linecap).toBe('round');
    expect(witness.linejoin).toBe('round');
    for (const paint of witness.paint) {
      expect(paint.display).not.toBe('none');
      expect(paint.visibility).toBe('visible');
      expect(paint.opacity).toBe('1');
      expect(paint.mask).toBe('none');
      expect(paint.clipPath).toBe('none');
    }
    expect(witness.svg.left).toBeGreaterThanOrEqual(witness.frame.left);
    expect(witness.svg.right).toBeLessThanOrEqual(witness.frame.right);
    expect(witness.svg.top).toBeGreaterThanOrEqual(witness.frame.top);
    expect(witness.svg.bottom).toBeLessThanOrEqual(witness.frame.bottom);
    expect(witness.svg).toEqual(witness.host);
    expect(witness.path.left - 1).toBeGreaterThan(witness.svg.left);
    expect(witness.path.right + 1).toBeLessThan(witness.svg.right);
    expect(witness.path.top - 1).toBeGreaterThan(witness.svg.top);
    expect(witness.path.bottom + 1).toBeLessThan(witness.svg.bottom);
    const strokedFixtureScene = fixtureScene.map((part) =>
      part.selector === '.agi-dev-pagestrip-icon'
        ? { ...part, text: '', icon: 'Opaque stroked path' }
        : part,
    );
    const measurement: Evidence = {};
    const measured = await measurePanel(page, frame, strokedFixtureScene, measurement);
    evidence['strokedMeasurement'] = measurement;
    expect(measured.failures, 'A fitting opaque stroked SVG must be supported').toEqual([]);
  } finally {
    try {
      if (host && originalMarkup !== undefined)
        await host.evaluate((element, markup) => {
          element.innerHTML = markup;
        }, originalMarkup);
    } finally {
      await testInfo.attach('side-panel-stroked-svg-positive-counterexample.json', {
        body: JSON.stringify(evidence, null, 2),
        contentType: 'application/json',
      });
    }
  }
});
