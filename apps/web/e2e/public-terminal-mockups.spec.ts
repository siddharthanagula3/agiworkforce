import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

import { CLI_LOCAL_RUNTIMES } from '../lib/marketing-constants';
import {
  PRIVACY_MODE_DISPLAY,
  PRIVACY_MODE_USAGE_IMPLICATION,
  TOOL_STATUS_PRESENTATION,
} from '@agiworkforce/types';
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
import { scanPublicTypography, type PublicTypographyIssue } from './lib/public-typography';

type Evidence = Record<string, unknown>;
type ScenePart = { name: string; selector: string; text: string };

const pathname = '/cli';
const widths = [320, 360, 390, 768, 1024, 1366, 1440, 1920] as const;
const themes = ['light', 'dark'] as const;
const fonts = [{ cssVariable: '--font-geist-sans' }, { cssVariable: '--font-geist-mono' }];
const frameName = 'AGI CLI interface';
const repositoryRoot = path.resolve(__dirname, '../../..');
const captureRun = `${Date.now()}-${process.pid}`;
const scene: readonly ScenePart[] = [
  { name: 'Window title', selector: '.agi-dev-title', text: 'agi · zsh' },
  {
    name: 'Window badge',
    selector: '.agi-dev-badge',
    text: TOOL_STATUS_PRESENTATION['awaiting-approval'].label,
  },
  {
    name: 'Session metadata',
    selector: '.agi-term-strip',
    text: `${PRIVACY_MODE_DISPLAY.local.label}${CLI_LOCAL_RUNTIMES.names[0] ?? ''}`,
  },
  { name: 'Illustration label', selector: '.agi-term-example', text: 'Example · file.txt' },
  { name: 'Pending edit prompt', selector: '.agi-term-cmd', text: 'Allow this edit?' },
  { name: 'Old proposal', selector: '.agi-term-diff > p', text: '- alpha' },
  { name: 'New proposal', selector: '.agi-term-diff > p', text: '+ beta' },
  {
    name: 'Mode usage',
    selector: '.agi-term-usage',
    text: PRIVACY_MODE_USAGE_IMPLICATION.local,
  },
];
const sourcePaths = [
  'apps/web/app/cli/page.tsx',
  'apps/web/app/cli/CliInstallCommand.tsx',
  'apps/web/app/api/releases/cli/latest/route.ts',
  'apps/web/lib/releases/github-cli-releases.ts',
  'apps/web/lib/releases/github-desktop-releases.ts',
  'apps/web/app/layout.tsx',
  'apps/web/app/globals.css',
  'apps/web/lib/marketing-constants.ts',
  'apps/web/lib/surface-status.ts',
  'apps/web/features/marketing/components/ProductFrame.tsx',
  'apps/web/features/marketing/components/DeviceMockups.tsx',
  'apps/web/features/marketing/components/mockup-responsive.css',
  'apps/web/features/marketing/components/legacy-landing.css',
  'apps/web/features/marketing/components/legacy-pages.css',
  'apps/web/features/marketing/components/motion/Typewriter.tsx',
  'apps/web/features/marketing/components/motion/motion.css',
  'apps/web/features/marketing/components/system/system.css',
  'packages/ui/design-tokens/src/foundation.css',
  'packages/ui/design-tokens/src/tailwind.css',
  'packages/ui/ui/src/primitives/Spinner.tsx',
  'packages/contracts/types/src/models.json',
  'packages/contracts/types/src/suite-contracts.ts',
  'packages/contracts/types/src/tool-status.ts',
  'apps/cli/src/features/exec/tools/file_ops/mod.rs',
  'apps/cli/src/tui/tui_app.rs',
  'apps/cli/src/output.rs',
  'apps/web/shared/lib/cookie-consent.ts',
  'apps/web/e2e/lib/public-page-readiness.ts',
  'apps/web/e2e/lib/public-typography.ts',
  'apps/web/e2e/lib/public-text-contrast.ts',
  'apps/web/e2e/lib/public-route-inventory.ts',
  'apps/web/public/fonts/opendyslexic/OpenDyslexic-Regular.woff2',
  'apps/web/e2e/public-terminal-mockups.spec.ts',
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

function terminalFrame(page: Page) {
  return page
    .getByRole('region', { name: 'AGI CLI', exact: true })
    .getByRole('figure', { name: frameName, exact: true, includeHidden: true });
}

async function terminalState(frame: Locator, contract: readonly ScenePart[]) {
  return frame.evaluate((root, expected) => {
    const normalize = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();
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
    const matches = expected.map((part) => ({
      ...part,
      elements: Array.from(root.querySelectorAll(part.selector)).filter(
        (element) => normalize(element.textContent) === part.text,
      ),
    }));
    const orderedParts = matches
      .flatMap((part) => part.elements.map((element) => ({ name: part.name, element })))
      .sort((left, right) => {
        const position = left.element.compareDocumentPosition(right.element);
        return position & Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : position & Node.DOCUMENT_POSITION_PRECEDING
            ? 1
            : 0;
      })
      .map((part) => part.name);
    const rows = [];
    let counted = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style,noscript,textarea,option')) continue;
      const text = normalize(node.data);
      if (!text) continue;
      counted += 1;
      if (!root.contains(parent)) continue;
      rows.push({
        sourceKey: `text:${counted}`,
        selector: selectorOf(parent),
        text,
        owners: matches
          .filter((part) => part.elements.some((element) => element.contains(parent)))
          .map((part) => part.name),
      });
    }
    const elements = Array.from(document.querySelectorAll('*'));
    const sourceKeys = elements.flatMap((element, index) =>
      root.contains(element)
        ? [`control:${index}`, `pseudo:${index}:before`, `pseudo:${index}:after`]
        : [],
    );
    const ancestors = [];
    for (let element: Element | null = root; element; element = element.parentElement) {
      const css = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const matrix = css.transform === 'none' ? null : new DOMMatrixReadOnly(css.transform);
      const zoom = css.getPropertyValue('zoom');
      ancestors.push({
        selector: selectorOf(element),
        rect: box(element),
        documentPort: element === document.body || element === document.documentElement,
        port: {
          left: rect.left + element.clientLeft,
          top: rect.top + element.clientTop,
          right: rect.left + element.clientLeft + element.clientWidth,
          bottom: rect.top + element.clientTop + element.clientHeight,
        },
        overflowX: css.overflowX,
        overflowY: css.overflowY,
        hidden: element.hasAttribute('hidden'),
        inert: element.hasAttribute('inert'),
        ariaHidden: element.getAttribute('aria-hidden'),
        suppressed:
          css.display === 'none' ||
          ['hidden', 'collapse'].includes(css.visibility) ||
          css.contentVisibility === 'hidden' ||
          Number(css.opacity) === 0,
        mask: css.maskImage,
        clipPath: css.clipPath,
        filter: css.filter,
        scaled:
          Boolean(
            matrix &&
            (!matrix.is2D ||
              Math.abs(matrix.a - 1) > 0.0001 ||
              Math.abs(matrix.d - 1) > 0.0001 ||
              Math.abs(matrix.b) > 0.0001 ||
              Math.abs(matrix.c) > 0.0001),
          ) ||
          !['none', '1', '1 1'].includes(css.getPropertyValue('scale')) ||
          !['', 'normal', '1', '100%'].includes(zoom) ||
          !['', 'none', '0deg'].includes(css.getPropertyValue('rotate')) ||
          css.perspective !== 'none',
      });
    }
    const structures = [
      '.agi-dev-shell',
      '.agi-dev-bar',
      '.agi-term',
      expected.some((part) => part.selector === '.agi-term-example')
        ? '.agi-term-proposal'
        : '.agi-mx-typed',
    ].map((selector) => {
      const found = Array.from(root.querySelectorAll(selector));
      return { selector, count: found.length, rects: found.map(box) };
    });
    const animations = new Set(root.getAnimations({ subtree: true }));
    for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement)
      for (const animation of ancestor.getAnimations()) animations.add(animation);
    return {
      connected: root.isConnected,
      rect: box(root),
      rows,
      counted,
      sourceKeys: [...sourceKeys, ...rows.map((row) => row.sourceKey)],
      selectors: [root, ...root.querySelectorAll('*')].map(selectorOf),
      parts: matches.map(({ elements: found, ...part }) => ({
        ...part,
        count: found.length,
        rects: found.map(box),
      })),
      orderedParts,
      structures,
      ancestors,
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      scrollX,
      scrollY,
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      pendingMotion: root.querySelectorAll(
        '[data-typing="true"],[data-active="true"],[aria-busy="true"]',
      ).length,
      activeAnimations: [...animations].filter(
        (animation) => animation.pending || ['running', 'paused'].includes(animation.playState),
      ).length,
    };
  }, contract);
}

async function terminalFingerprint(frame: Locator) {
  return frame.evaluate((root) =>
    [root, ...root.querySelectorAll('*')].map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const before = getComputedStyle(element, '::before');
      const after = getComputedStyle(element, '::after');
      return {
        tag: element.localName,
        text: element.textContent,
        rect: [rect.left, rect.top, rect.width, rect.height],
        styles: Array.from(style).map((property) => [property, style.getPropertyValue(property)]),
        before: Array.from(before).map((property) => [property, before.getPropertyValue(property)]),
        after: Array.from(after).map((property) => [property, after.getPropertyValue(property)]),
      };
    }),
  );
}

async function measureTerminal(
  page: Page,
  frame: Locator,
  contract: readonly ScenePart[],
  evidence: Evidence,
) {
  const failures: string[] = [];
  const require = (condition: boolean, message: string) => {
    if (!condition) failures.push(message);
  };
  evidence['matchedFrames'] = await frame.count();
  if (evidence['matchedFrames'] !== 1) {
    failures.push('Terminal requires exactly one scoped frame');
    evidence['failures'] = failures;
    return { failures, state: null, fontReady: false };
  }
  let fontReady = false;
  try {
    const declaredFonts = await frame.evaluate((root) => {
      const families = new Set<string>();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (
          !parent ||
          !node.textContent?.trim() ||
          parent.closest('script,style,template,noscript')
        )
          continue;
        const family = getComputedStyle(parent)
          .fontFamily.split(',')[0]
          ?.trim()
          .replace(/^['"]|['"]$/g, '');
        if (!family) throw new Error('Terminal source text has no declared font family');
        families.add(family);
      }
      return [...families].sort().map((family) => ({ family }));
    });
    evidence['requiredFonts'] = declaredFonts;
    const fontProof = await measurePublicFontProof(page, frame, declaredFonts);
    evidence['fontProof'] = fontProof;
    fontReady = fontProof.fontCoverageGaps.length === 0;
    require(fontReady, 'Terminal font coverage has unmeasured glyphs');
  } catch (error) {
    evidence['fontError'] =
      error instanceof PublicReadinessFontError
        ? { message: error.message, diagnostic: error.diagnostic }
        : { message: String(error) };
    failures.push('Terminal actual font proof failed');
  }
  evidence['fontReady'] = fontReady;
  const initial = await terminalState(frame, contract);
  evidence['initialState'] = initial;
  require(initial.reduced &&
    initial.pendingMotion === 0 &&
    initial.activeAnimations === 0, 'Terminal motion completion is unproven');
  if (!initial.reduced || initial.pendingMotion !== 0 || initial.activeAnimations !== 0) {
    evidence['failures'] = failures;
    return { failures, state: initial, fontReady };
  }
  const fingerprint = await terminalFingerprint(frame);
  const annotation = await frame.evaluateHandle((root, prefix) => {
    const elements = [root, ...root.querySelectorAll('*')];
    for (const element of elements)
      if (element.id && document.querySelectorAll(`#${CSS.escape(element.id)}`).length !== 1)
        throw new Error('Terminal measurement requires unique existing element IDs');
    return elements.map((element, index) => {
      const original = element.getAttribute('data-testid');
      element.setAttribute('data-testid', `${prefix}-${index}`);
      return { element, original };
    });
  }, `public-terminal-probe-${captureRun}`);
  try {
    require(JSON.stringify(await terminalFingerprint(frame)) ===
      JSON.stringify(
        fingerprint,
      ), 'Terminal identity annotation changed measured paint or geometry');
    const state = await terminalState(frame, contract);
    evidence['state'] = state;
    const typography = await page.evaluate(scanPublicTypography, {
      pageType: 'marketing' as const,
      pathname,
    });
    evidence['typography'] = typography;
    const belongs = (issue: PublicTypographyIssue) =>
      issue.sourceKey
        ? state.sourceKeys.includes(issue.sourceKey)
        : state.selectors.includes(issue.selector) ||
          (issue.selector === 'html' && typography.unmeasured.includes(issue));
    const samples = typography.samples.filter((sample) =>
      state.sourceKeys.includes(sample.sourceKey),
    );
    const findings = typography.findings.filter(belongs);
    const unmeasured = typography.unmeasured.filter(belongs);
    evidence['samples'] = samples;
    evidence['scopedFindings'] = findings;
    evidence['scopedUnmeasured'] = unmeasured;
    evidence['scopedExcluded'] = typography.excluded.filter((entry) =>
      state.selectors.includes(entry.selector),
    );
    const afterScan = await terminalState(frame, contract);
    require(JSON.stringify(afterScan) ===
      JSON.stringify(
        state,
      ), 'Terminal source identity or geometry changed during the canonical scan');
    require(state.counted ===
      typography.coverage
        .textNodes, 'Terminal source identity disagrees with the canonical text walker');
    require(state.connected &&
      state.rect.width > 0 &&
      state.rect.height > 0, 'Terminal geometry is absent');
    require(!state.ancestors.some(
      (ancestor) => ancestor.hidden || ancestor.suppressed,
    ), 'Terminal is visually hidden');
    require(!state.ancestors.some((ancestor) => ancestor.inert), 'Terminal is inactive or inert');
    require(!state.ancestors.some(
      (ancestor) => ancestor.scaled,
    ), 'Terminal has scaled or unknown geometry');
    require(!state.ancestors.some(
      (ancestor) =>
        ancestor.mask !== 'none' || ancestor.clipPath !== 'none' || ancestor.filter !== 'none',
    ), 'Terminal paint has an unmeasured mask, clip path or filter');
    require(state.rect.left >= -1 &&
      state.rect.right <= state.viewportWidth + 1, 'Terminal exceeds the horizontal viewport');
    require(state.scrollWidth <= state.clientWidth + 1, 'Terminal frame has horizontal overflow');
    require(state.parts.every((part) => part.count === 1) &&
      JSON.stringify(state.orderedParts) ===
        JSON.stringify(
          contract.map((part) => part.name),
        ), 'Terminal scene content is missing, altered, duplicated or reordered');
    require(state.rows.length > 0 &&
      state.rows.every(
        (row) => row.owners.length === 1,
      ), 'Terminal full source text witness is incomplete');
    require(state.structures.every(
      (structure) => structure.count === 1,
    ), 'Terminal required frame structure is absent');
    const shell = state.structures.find((structure) => structure.selector === '.agi-dev-shell');
    const shellRect = shell?.rects[0];
    for (const part of [...state.structures, ...state.parts])
      for (const rect of part.rects) {
        require(rect.width > 0 && rect.height > 0, `Terminal has empty geometry: ${part.selector}`);
        require(rect.left >= state.rect.left - 1 &&
          rect.right <= state.rect.right + 1 &&
          rect.top >= state.rect.top - 1 &&
          rect.bottom <= state.rect.bottom + 1, 'Terminal part overflows its frame');
        if (shellRect)
          require(rect.left >= shellRect.left - 1 &&
            rect.right <= shellRect.right + 1 &&
            rect.top >= shellRect.top - 1 &&
            rect.bottom <=
              shellRect.bottom + 1, `Terminal part overflows its shell: ${part.selector}`);
      }
    for (const ancestor of state.ancestors) {
      if (ancestor.documentPort) continue;
      if (['hidden', 'clip'].includes(ancestor.overflowX))
        require(state.rect.left >= ancestor.port.left - 1 &&
          state.rect.right <=
            ancestor.port.right +
              1, `Terminal is permanently clipped horizontally: ${ancestor.selector}`);
      if (['hidden', 'clip'].includes(ancestor.overflowY))
        require(state.rect.top >= ancestor.port.top - 1 &&
          state.rect.bottom <=
            ancestor.port.bottom +
              1, `Terminal is permanently clipped vertically: ${ancestor.selector}`);
    }
    require(samples.every(
      (sample) => sample.kind === 'text',
    ), 'Terminal generated or control text lacks an explicit scene contract');
    for (const row of state.rows) {
      const painted = samples.filter((sample) => sample.sourceKey === row.sourceKey);
      require(painted.length === 1 &&
        painted[0]?.text ===
          row.text, `Terminal source text lacks one identical painted sample: ${row.text}`);
    }
    require(samples.every(
      (sample) =>
        sample.scaleX !== null &&
        sample.scaleY !== null &&
        Math.abs(sample.scaleX - 1) < 0.001 &&
        Math.abs(sample.scaleY - 1) < 0.001,
    ), 'Terminal text has scaled or unknown geometry');
    require(findings.length === 0, 'Terminal canonical typography findings remain');
    require(unmeasured.length ===
      0, 'Terminal canonical text geometry or scroll coverage is unmeasured');
    const contrast =
      typography.canvasColor && samples.length
        ? evaluatePublicTextContrast(samples, typography.canvasColor)
        : null;
    evidence['contrast'] = contrast;
    require(contrast !== null &&
      contrast.findings.length === 0 &&
      contrast.unmeasured.length === 0 &&
      contrast.coverage.measured ===
        state.rows.length, 'Terminal text contrast is unreadable or unmeasured');
    require(JSON.stringify(await terminalState(frame, contract)) ===
      JSON.stringify(state), 'Terminal source identity or motion changed during paint measurement');
  } finally {
    try {
      const attributesRestored = await annotation.evaluate((originals) => {
        for (const { element, original } of originals)
          if (original === null) element.removeAttribute('data-testid');
          else element.setAttribute('data-testid', original);
        return originals.every(
          ({ element, original }) =>
            element.isConnected && element.getAttribute('data-testid') === original,
        );
      });
      evidence['identityAnnotationRestored'] =
        attributesRestored &&
        JSON.stringify(await terminalFingerprint(frame)) === JSON.stringify(fingerprint);
      require(evidence['identityAnnotationRestored'] ===
        true, 'Terminal identity annotation restoration is unproven');
    } finally {
      await annotation.dispose();
    }
  }
  const finalState = await terminalState(frame, contract);
  evidence['finalState'] = finalState;
  require(JSON.stringify(finalState) ===
    JSON.stringify(initial), 'Terminal source identity or geometry changed during measurement');
  evidence['failures'] = failures;
  return { failures, state: finalState, fontReady };
}

async function captureTerminal(
  page: Page,
  frame: Locator,
  testInfo: TestInfo,
  evidence: Evidence,
  beforeMeasurement: Awaited<ReturnType<typeof measureTerminal>>,
) {
  if (!beforeMeasurement.fontReady || !beforeMeasurement.state) {
    evidence['capture'] = {
      status: 'unmeasured',
      reason: 'Terminal font-settled measurement is absent',
    };
    throw new Error('Terminal capture requires proven scoped font readiness');
  }
  const before = await terminalState(frame, scene);
  const beforePaint = await terminalFingerprint(frame);
  const beforeStable = JSON.stringify(before) === JSON.stringify(beforeMeasurement.state);
  const clip = {
    x: Math.max(0, before.rect.left),
    y: Math.max(0, before.rect.top),
    width: Math.min(before.viewportWidth, before.rect.right) - Math.max(0, before.rect.left),
    height: Math.min(before.viewportHeight, before.rect.bottom) - Math.max(0, before.rect.top),
  };
  if (!(clip.width > 0 && clip.height > 0))
    throw new Error('Unmeasured terminal capture: no viewport intersection');
  const destination = path.join(
    repositoryRoot,
    '.tmp/codex-public-site/baseline/terminal-mockup',
    captureRun,
    testInfo.testId,
    'terminal.png',
  );
  const png = await page.screenshot({ path: destination, clip, animations: 'allow', type: 'png' });
  const pixelScale = await page.evaluate(() => devicePixelRatio);
  const dimensions = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  const capture: Evidence = {
    status: 'failed',
    beforeFailures: beforeMeasurement.failures,
    beforeStable,
    destination,
    before,
    clip,
    pixelScale,
    dimensions,
    bytes: png.length,
    sha256: createHash('sha256').update(png).digest('hex'),
    coverage:
      clip.width >= before.rect.width - 1 && clip.height >= before.rect.height - 1
        ? 'entire-frame'
        : 'visible-viewport-intersection',
  };
  evidence['capture'] = capture;
  await testInfo.attach('terminal.png', { path: destination, contentType: 'image/png' });
  const afterEvidence: Evidence = {};
  evidence['captureAfterMeasurement'] = afterEvidence;
  const afterMeasurement = await measureTerminal(page, frame, scene, afterEvidence);
  const after = await terminalState(frame, scene);
  const afterPaint = await terminalFingerprint(frame);
  const afterStable =
    JSON.stringify(after) === JSON.stringify(afterMeasurement.state) &&
    JSON.stringify(after) === JSON.stringify(before);
  const paintStable = JSON.stringify(afterPaint) === JSON.stringify(beforePaint);
  Object.assign(capture, {
    afterFailures: afterMeasurement.failures,
    afterStable,
    paintStable,
    after,
  });
  expect(beforeStable, 'Terminal changed after its font-settled measurement').toBe(true);
  expect(after, 'Terminal changed while its PNG was captured').toEqual(before);
  expect(afterStable, 'Terminal changed after its capture measurement').toBe(true);
  expect(paintStable, 'Terminal paint changed across its PNG capture').toBe(true);
  expect(
    beforeMeasurement.failures,
    'Terminal capture began with failed scene or paint proof',
  ).toEqual([]);
  expect(
    afterMeasurement.failures,
    'Terminal capture ended with failed scene or paint proof',
  ).toEqual([]);
  expect(afterMeasurement.fontReady, 'Terminal capture ended without scoped font proof').toBe(true);
  expect(dimensions.width).toBeGreaterThanOrEqual(Math.floor(clip.width * pixelScale));
  expect(dimensions.width).toBeLessThanOrEqual(Math.ceil(clip.width * pixelScale));
  expect(dimensions.height).toBeGreaterThanOrEqual(Math.floor(clip.height * pixelScale));
  expect(dimensions.height).toBeLessThanOrEqual(Math.ceil(clip.height * pixelScale));
  capture['status'] = 'passed';
}

test.use({ screenshot: 'off', video: 'off', trace: 'off' });
test.describe.configure({ retries: 0 });

for (const width of widths)
  for (const theme of themes)
    test(`TerminalWindow baseline ${pathname} ${width}px ${theme}`, async ({
      browser,
      baseURL,
    }, testInfo) => {
      if (!baseURL || testInfo.config.workers !== 1)
        throw new Error('Terminal baseline requires a base URL and one worker');
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
          'One decorative Local TerminalWindow in the /cli hero; no route or variant certification.',
        sourceTruth: {
          status: 'bounded source-backed example',
          sources: [
            'Privacy mode, usage and tool status use their exported contract owners.',
            'The Local runtime label uses CLI_LOCAL_RUNTIMES.',
            'The pending edit prompt and proposal formatting use the real file edit request; alpha/beta and file.txt are its existing fixture inputs.',
          ],
          limits: [
            'This illustrates a pending proposal, not a recorded session or completed edit.',
            'The Rust-owned approval choices require a generated presentation binding before the public example can show them.',
          ],
        },
        floors: 'Canonical typography policy: mono >=15px, body >=17px, other labels >=14px.',
        limits: [
          'This measures reduced-motion completion only; normal-motion timing and no-JavaScript rendering remain unmeasured.',
          'Canonical font proof proves registration, loading and declared Unicode coverage, not glyph fallback pixels.',
          'Internal scrolling must be completely observed by a future scoped scroll proof; pending states fail here.',
          'Computed paint and axis-aligned geometry do not prove rounded-corner paint or external/pointer-transparent overlays.',
          'Decorative aria-hidden is recorded; no accessible terminal interaction or executable command is certified.',
          'PNG evidence covers the visible viewport intersection, not necessarily every part of a tall frame.',
          'Source hashes cover only the listed owners, not every transitive input or runtime environment value.',
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
        const themeState = await page.evaluate(() => ({
          marker: document.documentElement.dataset['theme'],
          light: document.documentElement.classList.contains('light'),
          dark: document.documentElement.classList.contains('dark'),
          scheme: getComputedStyle(document.documentElement).colorScheme,
          prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
        }));
        report['themeState'] = themeState;
        expect(themeState).toEqual({
          marker: theme,
          light: theme === 'light',
          dark: theme === 'dark',
          scheme: theme,
          prefersDark: theme === 'dark',
        });
        await expect(page.getByRole('region', { name: 'AGI CLI', exact: true })).toHaveCount(1);
        const frame = terminalFrame(page);
        report['matchedFrames'] = await frame.count();
        await expect(frame).toHaveCount(1);
        await frame.scrollIntoViewIfNeeded();
        const measured = await measureTerminal(page, frame, scene, report);
        await captureTerminal(page, frame, testInfo, report, measured);
        report['finalUrl'] = page.url();
        expect(page.url()).toBe(destination.href);
        expect(
          measured.failures,
          'Terminal baseline retains failed and unmeasured witnesses',
        ).toEqual([]);
      } catch (error) {
        failure = error;
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
            failure = new Error('Terminal source changed during measurement');
        } catch (error) {
          report['sourceEndError'] = String(error);
          failure ??= error;
        }
        report['status'] = failure ? 'failed' : 'passed';
        if (failure) report['error'] = failure instanceof Error ? failure.message : String(failure);
        await testInfo.attach('terminal-baseline.json', {
          body: JSON.stringify(report, null, 2),
          contentType: 'application/json',
        });
      }
      if (failure) throw failure;
    });

const fixtureOrigin = 'http://terminal-fixture.invalid';
const fixtureScene: readonly ScenePart[] = [
  { name: 'Window title', selector: '.agi-dev-title', text: 'ABC' },
  { name: 'Window badge', selector: '.agi-dev-badge', text: 'DEF' },
  { name: 'Session metadata', selector: '.agi-term-strip', text: 'GHIJKL' },
  { name: 'Transcript read', selector: '.agi-mx-typed-line', text: 'MNO' },
  { name: 'Transcript run', selector: '.agi-mx-typed-line', text: 'PQR' },
  { name: 'Transcript result', selector: '.agi-mx-typed-line', text: 'STU' },
  { name: 'Composer prompt', selector: '.agi-term-line', text: 'VWX YZA' },
  { name: 'Session footer', selector: '.agi-term-line', text: 'BCD' },
];
const fixtureMarkup = `<html lang="en"><head><style>
@font-face{font-family:FixtureSans;src:url('/fixture.woff2');unicode-range:U+0020-005A}
@font-face{font-family:FixtureMono;src:url('/fixture.woff2');unicode-range:U+0020-005A}
:root{--font-geist-sans:FixtureSans;--font-geist-mono:FixtureMono;color-scheme:light}
*{box-sizing:border-box}html,body{margin:0;background:white;color:black;font:17px FixtureSans}
main{padding:20px}figure{margin:0;width:350px}p{margin:0;font-size:17px;line-height:1.5}
.agi-dev-shell{padding:16px;overflow:hidden;background:white;border:1px solid black}
.agi-dev-bar{display:flex;gap:16px;align-items:center;margin-bottom:16px}
.agi-dev-title{font:15px FixtureMono}.agi-dev-badge{font:14px FixtureSans}
.agi-term{display:flex;flex-direction:column;gap:16px}.agi-term-strip{display:flex;gap:16px}
pre{margin:0;font:15px/1.5 FixtureMono}.agi-mx-typed-line{display:block}
@keyframes terminal-fixture-pulse{from{opacity:1}to{opacity:.8}}
</style></head><body><main><section aria-labelledby="fixture-title"><h1 id="fixture-title" style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">AGI CLI</h1><div aria-hidden="true"><figure aria-label="${frameName}" data-device="terminal"><div class="agi-dev-shell"><div class="agi-dev-bar" aria-hidden="true"><span class="agi-dev-title">ABC</span><span class="agi-dev-badge">DEF</span></div><div class="agi-term" aria-hidden="true"><p class="agi-term-strip"><span>GHI</span><span class="agi-term-hud">JKL</span></p><pre class="agi-mx-typed" aria-label="AGI CLI session transcript"><span class="agi-mx-typed-line">MNO</span><span class="agi-mx-typed-line">PQR</span><span class="agi-mx-typed-line">STU</span></pre><p class="agi-term-line"><span>VWX</span> YZA</p><p class="agi-term-line">BCD</p></div></div></figure></div></section><p>OUTSIDE</p></main></body></html>`;

async function fixtureReadiness(page: Page) {
  return settlePublicPage(
    page,
    {
      path: `${fixtureOrigin}/fixture`,
      expectedHttpStatuses: [200],
      expectedFinalPath: '/fixture',
      expectedOrigin: fixtureOrigin,
      expectedQuery: '',
    },
    { samples: 3, intervalMs: 20, readinessTimeout: 1000, expectedFonts: fonts },
  );
}

test('Terminal instrument accepts a fitting decorative fixture and rejects controlled defects', async ({
  browser,
}, testInfo) => {
  const report: Evidence = { sourceStart: sourceSnapshot(), contextClosed: false };
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    colorScheme: 'light',
    storageState: { cookies: [], origins: [] },
  });
  let failure: unknown;
  try {
    expect(await context.storageState()).toEqual({ cookies: [], origins: [] });
    const page = await context.newPage();
    await page.route(`${fixtureOrigin}/**`, (request) =>
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
          : fixtureMarkup,
      }),
    );
    report['readiness'] = await fixtureReadiness(page);
    const frame = terminalFrame(page);
    const fitting: Evidence = {};
    expect(
      (await measureTerminal(page, frame, fixtureScene, fitting)).failures,
      'A fitting decorative control must prove the instrument can pass',
    ).toEqual([]);
    report['positiveControl'] = fitting;
    await page.getByRole('main').evaluate((main) => {
      const outside = document.createElement('pre');
      outside.className = 'agi-mx-typed';
      outside.style.cssText = 'font:9px Arial';
      const line = document.createElement('span');
      line.className = 'agi-mx-typed-line';
      line.textContent = 'MNO';
      outside.append(line);
      main.append(outside);
    });
    const outsideDefect: Evidence = {};
    expect(
      (await measureTerminal(page, frame, fixtureScene, outsideDefect)).failures,
      'Identical text outside the chosen hero frame must not be mistaken for its source',
    ).toEqual([]);
    expect(
      (outsideDefect['typography'] as ReturnType<typeof scanPublicTypography>).findings.some(
        (issue) => issue.text === 'MNO' && issue.kind === 'declared-size-floor',
      ),
    ).toBe(true);
    report['outside defective transcript is out of scope'] = outsideDefect;
    const defects = [
      { name: 'tiny mono text', text: 'MNO', style: 'font-size:14px', kind: 'declared-size-floor' },
      {
        name: 'tiny non-code UI text',
        text: 'BCD',
        style: 'font-size:13px',
        kind: 'declared-size-floor',
      },
      {
        name: 'tiny label text',
        text: 'DEF',
        style: 'font-size:13px',
        kind: 'declared-size-floor',
      },
      { name: 'wrong font', text: 'MNO', style: 'font-family:Arial', kind: 'font-family' },
      {
        name: 'partial transcript clipping',
        text: 'MNO',
        style: 'width:10px;overflow:hidden',
        kind: 'text-clipped',
      },
    ];
    for (const defect of defects) {
      await fixtureReadiness(page);
      await frame
        .getByText(defect.text, { exact: true })
        .evaluate((element, style) => element.setAttribute('style', style), defect.style);
      const evidence: Evidence = {};
      const measured = await measureTerminal(page, frame, fixtureScene, evidence);
      report[defect.name] = evidence;
      expect(measured.failures).toContain('Terminal canonical typography findings remain');
      expect(
        (evidence['scopedFindings'] as { kind: string }[]).some(
          (issue) => issue.kind === defect.kind,
        ),
        defect.name,
      ).toBe(true);
    }
    for (const mutation of ['altered', 'missing', 'reordered'] as const) {
      await fixtureReadiness(page);
      if (mutation === 'altered')
        await frame.getByText('MNO', { exact: true }).evaluate((element) => {
          element.textContent = 'ZZZ';
        });
      else if (mutation === 'missing')
        await frame.getByText('MNO', { exact: true }).evaluate((element) => element.remove());
      else
        await frame
          .getByLabel('AGI CLI session transcript', { exact: true })
          .evaluate((element) => {
            const line = Array.from(element.querySelectorAll('.agi-mx-typed-line')).find(
              (candidate) => candidate.textContent === 'MNO',
            );
            if (!line) throw new Error('Fixture transcript line is absent');
            element.append(line);
          });
      const evidence: Evidence = {};
      expect((await measureTerminal(page, frame, fixtureScene, evidence)).failures).toContain(
        'Terminal scene content is missing, altered, duplicated or reordered',
      );
      report[`${mutation} transcript`] = evidence;
    }
    await fixtureReadiness(page);
    await frame.getByText('MNO', { exact: true }).evaluate((element) => {
      (element as HTMLElement).style.maskImage = 'linear-gradient(black,transparent)';
    });
    const masked: Evidence = {};
    expect((await measureTerminal(page, frame, fixtureScene, masked)).failures).toContain(
      'Terminal text contrast is unreadable or unmeasured',
    );
    expect(
      (masked['contrast'] as ReturnType<typeof evaluatePublicTextContrast>).unmeasured.some(
        (item) => item.text === 'MNO' && item.reasons.includes('mask-image'),
      ),
    ).toBe(true);
    report['unmeasured masked transcript'] = masked;
    await fixtureReadiness(page);
    await frame.evaluate((element) => {
      (element as HTMLElement).style.transform = 'scale(.5)';
    });
    const scaled: Evidence = {};
    expect((await measureTerminal(page, frame, fixtureScene, scaled)).failures).toContain(
      'Terminal has scaled or unknown geometry',
    );
    report['scaled frame'] = scaled;
    for (const motion of ['animation', 'typing-marker'] as const) {
      await fixtureReadiness(page);
      if (motion === 'animation')
        await frame.evaluate((element) => {
          (element as HTMLElement).style.animation = 'terminal-fixture-pulse 60s linear infinite';
        });
      else
        await frame
          .getByLabel('AGI CLI session transcript', { exact: true })
          .evaluate((element) => element.setAttribute('data-typing', 'true'));
      const evidence: Evidence = {};
      expect((await measureTerminal(page, frame, fixtureScene, evidence)).failures).toContain(
        'Terminal motion completion is unproven',
      );
      report[`noncompletion ${motion}`] = evidence;
    }
    await fixtureReadiness(page);
    await page.getByRole('region', { name: 'AGI CLI', exact: true }).evaluate((element) => {
      const original = element.querySelector('figure[aria-label="AGI CLI interface"]');
      if (!original) throw new Error('Fixture terminal is absent');
      element.append(original.cloneNode(true));
    });
    const duplicate: Evidence = {};
    expect((await measureTerminal(page, frame, fixtureScene, duplicate)).failures).toContain(
      'Terminal requires exactly one scoped frame',
    );
    report['duplicate frame'] = duplicate;
  } catch (error) {
    failure = error;
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
        failure = new Error('Terminal instrument source changed during controls');
    } catch (error) {
      report['sourceEndError'] = String(error);
      failure ??= error;
    }
    report['status'] = failure ? 'failed' : 'passed';
    if (failure) report['error'] = failure instanceof Error ? failure.message : String(failure);
    await testInfo.attach('terminal-instrument.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
  }
  if (failure) throw failure;
});

test('Terminal instrument rejects a translated shell and owned text outside the figure', async ({
  browser,
}, testInfo) => {
  const report: Evidence = { sourceStart: sourceSnapshot(), contextClosed: false };
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    colorScheme: 'light',
    storageState: { cookies: [], origins: [] },
  });
  let failure: unknown;
  try {
    expect(await context.storageState()).toEqual({ cookies: [], origins: [] });
    const page = await context.newPage();
    await page.route(`${fixtureOrigin}/**`, (request) =>
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
          : fixtureMarkup,
      }),
    );
    report['readiness'] = await fixtureReadiness(page);
    const frame = terminalFrame(page);
    const fitting: Evidence = {};
    expect(
      (await measureTerminal(page, frame, fixtureScene, fitting)).failures,
      'The fresh translated-shell control must begin with a fitting scene',
    ).toEqual([]);
    report['positiveControl'] = fitting;
    await frame.evaluate((figure) => {
      const shells = figure.querySelectorAll<HTMLElement>('.agi-dev-shell');
      if (shells.length !== 1) throw new Error('Fixture requires one terminal shell');
      const shell = shells.item(0);
      shell.style.transform = `translateY(${figure.getBoundingClientRect().height + 24}px)`;
    });
    const counterexample = await frame.evaluate((figure) => {
      const shells = figure.querySelectorAll<HTMLElement>('.agi-dev-shell');
      if (shells.length !== 1) throw new Error('Fixture requires one terminal shell');
      const shell = shells.item(0);
      const rectangle = (rect: DOMRect) => ({
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });
      const ownedText: { text: string; rects: ReturnType<typeof rectangle>[] }[] = [];
      const walker = document.createTreeWalker(shell, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node.textContent?.replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        ownedText.push({ text, rects: Array.from(range.getClientRects(), rectangle) });
      }
      return {
        figure: rectangle(figure.getBoundingClientRect()),
        shell: rectangle(shell.getBoundingClientRect()),
        ownedText,
        viewport: { width: innerWidth, height: innerHeight },
      };
    });
    report['independentCounterexample'] = counterexample;
    expect(
      counterexample.shell.top,
      'The translated shell must be below the figure',
    ).toBeGreaterThan(counterexample.figure.bottom + 1);
    expect(counterexample.shell.left).toBeGreaterThanOrEqual(0);
    expect(counterexample.shell.right).toBeLessThanOrEqual(counterexample.viewport.width);
    expect(counterexample.shell.bottom).toBeLessThanOrEqual(counterexample.viewport.height);
    expect(counterexample.ownedText.length).toBeGreaterThan(0);
    for (const text of counterexample.ownedText) {
      expect(
        text.rects.length,
        `Owned fixture text must have measured paint: ${text.text}`,
      ).toBeGreaterThan(0);
      for (const rect of text.rects) {
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);
        expect(rect.top, `Owned text must lie outside the figure: ${text.text}`).toBeGreaterThan(
          counterexample.figure.bottom + 1,
        );
        expect(rect.left).toBeGreaterThanOrEqual(counterexample.shell.left - 1);
        expect(rect.right).toBeLessThanOrEqual(counterexample.shell.right + 1);
        expect(rect.top).toBeGreaterThanOrEqual(counterexample.shell.top - 1);
        expect(rect.bottom).toBeLessThanOrEqual(counterexample.shell.bottom + 1);
      }
    }
    const translated: Evidence = {};
    const measured = await measureTerminal(page, frame, fixtureScene, translated);
    report['translatedShell'] = translated;
    expect(measured.failures).toContain('Terminal part overflows its frame');
  } catch (error) {
    failure = error;
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
        failure = new Error('Terminal instrument source changed during translated-shell control');
    } catch (error) {
      report['sourceEndError'] = String(error);
      failure ??= error;
    }
    report['status'] = failure ? 'failed' : 'passed';
    if (failure) report['error'] = failure instanceof Error ? failure.message : String(failure);
    await testInfo.attach('terminal-translated-shell-instrument.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
  }
  if (failure) throw failure;
});

test('Terminal instrument rejects pseudo paint changed by identity annotation', async ({
  browser,
}, testInfo) => {
  const report: Evidence = { sourceStart: sourceSnapshot(), contextClosed: false };
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    colorScheme: 'light',
    storageState: { cookies: [], origins: [] },
  });
  let failure: unknown;
  try {
    expect(await context.storageState()).toEqual({ cookies: [], origins: [] });
    const page = await context.newPage();
    await page.route(`${fixtureOrigin}/**`, (request) =>
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
          : fixtureMarkup,
      }),
    );
    report['readiness'] = await fixtureReadiness(page);
    const frame = terminalFrame(page);
    await page.addStyleTag({
      content: `.agi-term{position:relative}.agi-term::after{content:"";position:absolute;display:block;left:200px;top:0;width:12px;height:12px;background-color:rgb(0,0,0);opacity:1;visibility:visible;pointer-events:none}`,
    });
    const fitting: Evidence = {};
    expect(
      (await measureTerminal(page, frame, fixtureScene, fitting)).failures,
      'A fitting scene with an opaque empty pseudo-element must pass before its paint is changed',
    ).toEqual([]);
    report['positiveControl'] = fitting;
    await page.addStyleTag({
      content:
        '.agi-term[data-testid^="public-terminal-probe-"]::after{background-color:rgb(255,0,0)}',
    });
    const witnessHandle = await frame.evaluateHandle((root) => {
      const hosts = root.querySelectorAll('.agi-term');
      if (hosts.length !== 1) throw new Error('Pseudo fixture requires exactly one terminal body');
      const host = hosts.item(0);
      const original = host.getAttribute('data-testid');
      const rectangle = (rect: DOMRect) => ({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });
      const inspect = () => {
        const pseudo = getComputedStyle(host, '::after');
        const hostRect = host.getBoundingClientRect();
        const left = hostRect.left + Number.parseFloat(pseudo.left);
        const top = hostRect.top + Number.parseFloat(pseudo.top);
        const width = Number.parseFloat(pseudo.width);
        const height = Number.parseFloat(pseudo.height);
        return {
          content: pseudo.content,
          backgroundColor: pseudo.backgroundColor,
          display: pseudo.display,
          visibility: pseudo.visibility,
          opacity: pseudo.opacity,
          transform: pseudo.transform,
          position: pseudo.position,
          computedBox: { left, top, right: left + width, bottom: top + height, width, height },
          pseudoStyles: Array.from(pseudo).map((property) => [
            property,
            pseudo.getPropertyValue(property),
          ]),
          ordinary: [root, ...root.querySelectorAll('*')].map((element) => {
            const style = getComputedStyle(element);
            return {
              tag: element.localName,
              text: element.textContent,
              rect: rectangle(element.getBoundingClientRect()),
              styles: Array.from(style).map((property) => [
                property,
                style.getPropertyValue(property),
              ]),
            };
          }),
          host: rectangle(hostRect),
          figure: rectangle(root.getBoundingClientRect()),
        };
      };
      const witness = {
        before: inspect(),
        annotated: [] as ReturnType<typeof inspect>[],
        restored: [] as ReturnType<typeof inspect>[],
      };
      const observer = new MutationObserver(() => {
        const testId = host.getAttribute('data-testid');
        if (testId?.startsWith('public-terminal-probe-')) witness.annotated.push(inspect());
        else if (testId === original) witness.restored.push(inspect());
      });
      observer.observe(host, { attributes: true, attributeFilter: ['data-testid'] });
      return { witness, observer };
    });
    let counterexample: Awaited<ReturnType<typeof witnessHandle.jsonValue>>['witness'];
    const changedPaint: Evidence = {};
    let measured: Awaited<ReturnType<typeof measureTerminal>>;
    try {
      measured = await measureTerminal(page, frame, fixtureScene, changedPaint);
      counterexample = await witnessHandle.evaluate(({ witness }) => witness);
    } finally {
      await witnessHandle.evaluate(({ observer }) => observer.disconnect());
      await witnessHandle.dispose();
    }
    report['independentPseudoPaintWitness'] = counterexample;
    report['changedPseudoPaint'] = changedPaint;
    expect(counterexample.before.content).toBe('""');
    expect(counterexample.before.backgroundColor).toBe('rgb(0, 0, 0)');
    expect(counterexample.before.display).toBe('block');
    expect(counterexample.before.visibility).toBe('visible');
    expect(counterexample.before.opacity).toBe('1');
    expect(counterexample.before.transform).toBe('none');
    expect(counterexample.before.position).toBe('absolute');
    expect(counterexample.before.computedBox.width).toBeGreaterThan(0);
    expect(counterexample.before.computedBox.height).toBeGreaterThan(0);
    for (const container of [counterexample.before.host, counterexample.before.figure]) {
      expect(counterexample.before.computedBox.left).toBeGreaterThanOrEqual(container.left);
      expect(counterexample.before.computedBox.top).toBeGreaterThanOrEqual(container.top);
      expect(counterexample.before.computedBox.right).toBeLessThanOrEqual(container.right);
      expect(counterexample.before.computedBox.bottom).toBeLessThanOrEqual(container.bottom);
    }
    expect(counterexample.annotated.length).toBeGreaterThan(0);
    for (const annotated of counterexample.annotated) {
      expect(annotated.content).toBe(counterexample.before.content);
      expect(annotated.computedBox).toEqual(counterexample.before.computedBox);
      expect(annotated.ordinary).toEqual(counterexample.before.ordinary);
      expect(annotated.backgroundColor).toBe('rgb(255, 0, 0)');
      expect(annotated.pseudoStyles).not.toEqual(counterexample.before.pseudoStyles);
    }
    expect(counterexample.restored.length).toBeGreaterThan(0);
    for (const restored of counterexample.restored) expect(restored).toEqual(counterexample.before);
    expect(changedPaint['identityAnnotationRestored']).toBe(true);
    expect(measured.failures).toContain(
      'Terminal identity annotation changed measured paint or geometry',
    );
  } catch (error) {
    failure = error;
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
        failure = new Error('Terminal instrument source changed during pseudo-paint control');
    } catch (error) {
      report['sourceEndError'] = String(error);
      failure ??= error;
    }
    report['status'] = failure ? 'failed' : 'passed';
    if (failure) report['error'] = failure instanceof Error ? failure.message : String(failure);
    await testInfo.attach('terminal-pseudo-paint-instrument.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
  }
  if (failure) throw failure;
});
