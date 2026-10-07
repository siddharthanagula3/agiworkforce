import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

import {
  COOKIE_CONSENT_STORAGE_KEY,
  isCookieConsentCurrent,
  NECESSARY_ONLY_PREFERENCES,
  parseCookieConsentRecord,
} from '../shared/lib/cookie-consent';
import {
  capturePublicPageCoherence,
  comparePublicPageCoherence,
} from './lib/public-page-coherence';
import { settlePublicPage } from './lib/public-page-readiness';
import { getPublicRouteInventory, type PublicRouteCase } from './lib/public-route-inventory';

const repositoryRoot = path.resolve(__dirname, '../../..');
const widths = [320, 360, 390, 768, 1024, 1366, 1440, 1920] as const;
const themes = ['light', 'dark'] as const;
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
const outputRoot = path.join(
  repositoryRoot,
  '.tmp/codex-public-site/baseline/pricing-reference-captures',
  runId,
);
const expectedCases = widths.flatMap((width) => themes.map((theme) => `${width}-${theme}`));
type Readiness = Awaited<ReturnType<typeof settlePublicPage>>;
type Geometry = Awaited<ReturnType<typeof captureGeometry>>;
type Coherence = Awaited<ReturnType<typeof capturePublicPageCoherence>>;

interface ReferenceCapture {
  key: string;
  width: number;
  theme: (typeof themes)[number];
  viewportHeight: number;
  status: 'running' | 'passed' | 'failed';
  errors: string[];
  contextClosed: boolean | null;
  initialStorage: { cookies: number; origins: number } | null;
  necessaryOnlyRecord: ReturnType<typeof parseCookieConsentRecord>;
  readiness: { cookieVisible: Readiness | null; necessaryOnly: Readiness | null };
  geometry: { cookieVisible: Geometry | null; necessaryOnly: Geometry | null };
  coherence: Coherence[];
  artifacts: {
    state: 'cookie-visible' | 'necessary-only';
    extent: 'viewport' | 'full-page';
    file: string;
    sha256: string;
    bytes: number;
    width: number;
    height: number;
    geometryBefore: Geometry;
    geometryAfter: Geometry;
  }[];
  sourceStart: string | null;
  sourceEnd: string | null;
}

let route: PublicRouteCase | null = null;
let sourceScopes: string[] = [];
let initialSources: Record<string, string> = {};
let setupError: string | null = null;
let finalSourceError: string | null = null;
let browserEngine: string | null = null;
const captures: ReferenceCapture[] = [];
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

function sourceSnapshot() {
  if (!sourceScopes.length) throw new Error('Capture source scopes are missing');
  const sourceFiles = [
    ...new Set(
      execFileSync('git', ['ls-files', '-co', '--exclude-standard', '--', ...sourceScopes], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      })
        .trim()
        .split('\n')
        .filter(Boolean),
    ),
  ].sort();
  if (!sourceFiles.length || sourceFiles.length > 4096)
    throw new Error('Capture source scope is empty or exceeds its bounded budget');
  const hashes = Object.fromEntries(
    sourceFiles.map((file) => [
      file,
      createHash('sha256')
        .update(readFileSync(path.join(repositoryRoot, file)))
        .digest('hex'),
    ]),
  );
  return {
    hashes,
    digest: createHash('sha256').update(JSON.stringify(hashes)).digest('hex'),
  };
}

function saveManifest(final = false) {
  const completed = captures.map((capture) => capture.key);
  const missing = expectedCases.filter((key) => !completed.includes(key));
  const successful =
    final &&
    !setupError &&
    !finalSourceError &&
    missing.length === 0 &&
    completed.length === expectedCases.length &&
    new Set(completed).size === completed.length &&
    captures.every((capture) => capture.status === 'passed' && capture.contextClosed === true);
  writeFileSync(
    path.join(outputRoot, 'manifest.json'),
    JSON.stringify(
      {
        runId,
        writtenAt: new Date().toISOString(),
        successful,
        status: final ? (successful ? 'complete' : 'failed-or-incomplete') : 'in-progress',
        route,
        environment: 'dev-server at localhost:3000',
        browserEngine,
        reducedMotion: 'reduce',
        context: 'new signed-out empty-storage browser context for every width/theme',
        cookieStates: ['default cookie-visible', 'actual Necessary only choice'],
        beforeEvidence: 'None created or substituted; these captures show the current reference.',
        expectedCases,
        missing,
        setupError,
        finalSourceError,
        sourceHashes: initialSources,
        captures,
        limits: [
          'Captures are not production performance measurements, accessibility acceptance or full-launch proof.',
          'Reduced-motion screenshots do not prove normal-motion behavior or transitions.',
          'Necessary-only state is reached through the real banner control; no overlay CSS or storage injection is used.',
          'Source stability covers the listed route, public assembly, token, contract and English copy files, not every transitive dependency or server configuration.',
          'Readiness uses the canonical bounded scroll and font helper; its explicit limits remain in each state report.',
          'A successful manifest requires every requested case and all three images; partial or failed attempts stay explicit.',
        ],
      },
      null,
      2,
    ) + '\n',
  );
}

async function captureGeometry(page: Page, width: number, theme: (typeof themes)[number]) {
  const geometry = await page.evaluate(() => {
    const root = document.documentElement;
    const boxOf = (element: Element) => {
      const box = element.getBoundingClientRect();
      const values = [box.x, box.y, box.width, box.height];
      if (!values.every(Number.isFinite)) throw new Error('Capture geometry is not finite');
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const mains = [...document.querySelectorAll('main,[role="main"]')];
    const elements = [
      ...document.querySelectorAll('header,main,footer,h1,h2,table,[role="region"]'),
    ];
    const styleOf = (element: Element) => {
      const css = getComputedStyle(element);
      return Object.fromEntries(
        [
          'display',
          'font-family',
          'font-size',
          'line-height',
          'min-block-size',
          'padding-block-start',
          'padding-block-end',
          'row-gap',
          'column-gap',
          'grid-template-columns',
          'content-visibility',
          'contain-intrinsic-size',
          'animation-name',
          'animation-delay',
          'animation-duration',
        ].map((property) => [property, css.getPropertyValue(property)]),
      );
    };
    if (elements.length > 512) throw new Error('Capture geometry exceeded its bounded budget');
    return {
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      document: { width: root.scrollWidth, height: root.scrollHeight },
      scroll: { x: scrollX, y: scrollY },
      media: Object.fromEntries(
        [
          '(pointer: coarse)',
          '(pointer: fine)',
          '(hover: hover)',
          '(max-width: 767px)',
          '(min-width: 768px)',
          '(orientation: portrait)',
          'print',
        ].map((query) => [query, matchMedia(query).matches]),
      ),
      visualViewport: visualViewport
        ? {
            width: visualViewport.width,
            height: visualViewport.height,
            offsetLeft: visualViewport.offsetLeft,
            offsetTop: visualViewport.offsetTop,
            scale: visualViewport.scale,
          }
        : null,
      rootStyle: styleOf(root),
      bodyStyle: styleOf(document.body),
      theme: {
        marker: root.dataset['theme'],
        light: root.classList.contains('light'),
        dark: root.classList.contains('dark'),
        colorScheme: getComputedStyle(root).colorScheme,
        prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
      },
      fonts: document.fonts.status,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      mainCount: mains.length,
      mainTextLength: mains[0]?.textContent?.trim().length ?? 0,
      elements: elements.map((element) => ({
        tag: element.localName,
        id: element.id,
        role: element.getAttribute('role'),
        label: element.getAttribute('aria-label'),
        text: element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? '',
        box: boxOf(element),
        style: styleOf(element),
      })),
      footerControls: [...document.querySelectorAll('footer a,footer button')]
        .slice(0, 64)
        .map((element) => ({
          text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          box: boxOf(element),
          style: styleOf(element),
        })),
      images: [...document.images].map((image) => ({
        source: image.currentSrc || image.src,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        box: boxOf(image),
      })),
    };
  });
  expect(geometry.viewport.width).toBe(width);
  expect(geometry.viewport.devicePixelRatio).toBe(1);
  expect(geometry.scroll).toEqual({ x: 0, y: 0 });
  expect(geometry.theme).toEqual({
    marker: theme,
    light: theme === 'light',
    dark: theme === 'dark',
    colorScheme: theme,
    prefersDark: theme === 'dark',
  });
  expect(geometry.fonts).toBe('loaded');
  expect(geometry.reducedMotion).toBe(true);
  expect(geometry.mainCount).toBe(1);
  expect(geometry.mainTextLength).toBeGreaterThan(0);
  expect(geometry.document.width).toBeLessThanOrEqual(width + 1);
  expect(
    geometry.images.filter(
      (image) =>
        image.box.width > 0 && image.box.height > 0 && (!image.complete || image.naturalWidth <= 0),
    ),
    'Rendered images must finish loading before a successful capture',
  ).toEqual([]);
  return geometry;
}

async function screenshot(
  page: Page,
  capture: ReferenceCapture,
  state: 'cookie-visible' | 'necessary-only',
  fullPage = false,
) {
  const recordedGeometry =
    state === 'cookie-visible' ? capture.geometry.cookieVisible : capture.geometry.necessaryOnly;
  if (!recordedGeometry) throw new Error('Capture state geometry is missing');
  const geometryBefore = await captureGeometry(page, capture.width, capture.theme);
  expect(geometryBefore.viewport).toEqual(recordedGeometry.viewport);
  expect(geometryBefore.document).toEqual(recordedGeometry.document);
  const before = await capturePublicPageCoherence(
    page,
    `${state}-${fullPage ? 'full' : 'viewport'}-before`,
  );
  const file = path.join(
    outputRoot,
    `${capture.key}-${state}-${fullPage ? 'full-page' : 'viewport'}.png`,
  );
  const buffer = await page.screenshot({
    path: file,
    fullPage,
    animations: 'allow',
    caret: 'initial',
    scale: 'css',
  });
  const imageWidth = buffer.readUInt32BE(16);
  const imageHeight = buffer.readUInt32BE(20);
  const geometryAfter = await captureGeometry(page, capture.width, capture.theme);
  capture.artifacts.push({
    state,
    extent: fullPage ? 'full-page' : 'viewport',
    file: path.relative(repositoryRoot, file),
    sha256: createHash('sha256').update(buffer).digest('hex'),
    bytes: buffer.length,
    width: imageWidth,
    height: imageHeight,
    geometryBefore,
    geometryAfter,
  });
  saveManifest();
  expect(
    captureDimensionProblems(
      geometryBefore,
      geometryAfter,
      { width: imageWidth, height: imageHeight },
      fullPage,
    ),
    'Screenshot dimensions and fresh document geometry must agree',
  ).toEqual([]);
  const after = await capturePublicPageCoherence(
    page,
    `${state}-${fullPage ? 'full' : 'viewport'}-after`,
  );
  capture.coherence.push(before, after);
  expect(
    comparePublicPageCoherence(before, after),
    'The page changed during screenshot capture',
  ).toEqual([]);
}

function captureDimensionProblems(
  before: Pick<Geometry, 'viewport' | 'document'>,
  after: Pick<Geometry, 'viewport' | 'document'>,
  image: { width: number; height: number },
  fullPage: boolean,
) {
  const problems: string[] = [];
  const dimensions = [
    before.viewport.width,
    before.viewport.height,
    before.viewport.devicePixelRatio,
    before.document.width,
    before.document.height,
    after.viewport.width,
    after.viewport.height,
    after.viewport.devicePixelRatio,
    after.document.width,
    after.document.height,
    image.width,
    image.height,
  ];
  if (!dimensions.every((dimension) => Number.isFinite(dimension) && dimension > 0))
    problems.push('invalid-dimensions');
  if (JSON.stringify(before.viewport) !== JSON.stringify(after.viewport))
    problems.push('viewport-changed');
  if (JSON.stringify(before.document) !== JSON.stringify(after.document))
    problems.push('document-changed');
  if (image.width !== before.viewport.width) problems.push('image-width-mismatch');
  const expectedHeight = fullPage
    ? Math.max(before.viewport.height, before.document.height)
    : before.viewport.height;
  if (Math.abs(image.height - expectedHeight) > 1) problems.push('image-height-mismatch');
  return problems;
}

test.use({ screenshot: 'off', video: 'off', trace: 'off' });
test.describe.configure({ retries: 0 });

test.beforeAll(async ({ browserName }, testInfo) => {
  browserEngine = browserName;
  mkdirSync(outputRoot, { recursive: true });
  saveManifest();
  try {
    if (testInfo.config.workers !== 1) throw new Error('Reference captures require --workers=1');
    const disk = statfsSync(outputRoot);
    if (disk.bavail * disk.bsize < 20 * 1024 ** 3)
      throw new Error('Reference captures require 20 GB of free disk');
    const candidates = getPublicRouteInventory().routes.filter(
      (candidate) => candidate.path === '/pricing',
    );
    if (candidates.length !== 1)
      throw new Error('Canonical inventory must identify exactly one Pricing route');
    route = candidates[0]!;
    expect(route.kind).toBe('fixed');
    expect(route.context).toBe('signed-out');
    expect(route.unresolvedFlags).toEqual([]);
    sourceScopes = [
      ...route.sourceFiles.map((file) => path.relative(repositoryRoot, file)),
      'apps/web/app/layout.tsx',
      'apps/web/app/globals.css',
      'apps/web/features/marketing/components/pricing',
      'apps/web/features/marketing/components/system',
      'apps/web/shared/components/layout/Header.tsx',
      'apps/web/shared/components/accessibility/SkipLinks.tsx',
      'apps/web/shared/components/seo/theme-init-script.ts',
      'apps/web/shared/components/CookieConsent.tsx',
      'apps/web/shared/lib/cookie-consent.ts',
      'apps/web/lib/legal-constants.ts',
      'packages/ui/design-tokens/src',
      'packages/ui/ui/src/primitives',
      'packages/ui/i18n/locales/en',
      'packages/contracts/types/src',
      'packages/contracts/compliance/src',
      'apps/web/e2e/lib/public-route-inventory.ts',
      'apps/web/e2e/lib/public-page-readiness.ts',
      'apps/web/e2e/lib/public-page-coherence.ts',
      path.relative(repositoryRoot, __filename),
    ];
    initialSources = sourceSnapshot().hashes;
    saveManifest();
  } catch (error) {
    setupError = errorText(error);
    saveManifest();
    throw error;
  }
});

test.afterAll(async () => {
  try {
    expect(sourceSnapshot().hashes, 'Live source changed during the capture run').toEqual(
      initialSources,
    );
  } catch (error) {
    finalSourceError = errorText(error);
    throw error;
  } finally {
    saveManifest(true);
  }
});

for (const width of widths) {
  for (const theme of themes) {
    test(`Pricing reference captures ${width}px ${theme}`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const capture: ReferenceCapture = {
        key: `${width}-${theme}`,
        width,
        theme,
        viewportHeight: width < 768 ? 844 : 900,
        status: 'running',
        errors: [],
        contextClosed: null,
        initialStorage: null,
        necessaryOnlyRecord: null,
        readiness: { cookieVisible: null, necessaryOnly: null },
        geometry: { cookieVisible: null, necessaryOnly: null },
        coherence: [],
        artifacts: [],
        sourceStart: null,
        sourceEnd: null,
      };
      captures.push(capture);
      saveManifest();
      let context: Awaited<ReturnType<typeof browser.newContext>> | null = null;
      let failure: unknown;
      let failed = false;
      try {
        if (!baseURL || new URL(baseURL).origin !== 'http://localhost:3000')
          throw new Error(
            'Reference captures require the existing localhost:3000 development server',
          );
        if (!route) throw new Error('Canonical Pricing route is missing');
        expect(sourceSnapshot().hashes).toEqual(initialSources);
        capture.sourceStart = sourceSnapshot().digest;
        context = await browser.newContext({
          baseURL,
          viewport: { width, height: capture.viewportHeight },
          deviceScaleFactor: 1,
          colorScheme: theme,
          reducedMotion: 'reduce',
          locale: 'en-US',
          hasTouch: width < 1024,
          storageState: { cookies: [], origins: [] },
        });
        const initial = await context.storageState();
        capture.initialStorage = {
          cookies: initial.cookies.length,
          origins: initial.origins.length,
        };
        expect(capture.initialStorage).toEqual({ cookies: 0, origins: 0 });
        const page = await context.newPage();
        const destination = new URL(route.path, baseURL);
        const readinessRoute = {
          ...route,
          expectedOrigin: destination.origin,
          expectedQuery: destination.search,
        };
        capture.readiness.cookieVisible = await settlePublicPage(page, readinessRoute, {
          expectedFonts: [{ cssVariable: '--font-geist-sans' }],
        });
        expect(capture.readiness.cookieVisible.expectedFontProof).not.toBeNull();
        expect(capture.readiness.cookieVisible.fontCoverageGaps).toEqual([]);
        const banner = page.getByRole('region', { name: 'Cookie consent', exact: true });
        await expect(banner).toHaveCount(1);
        await expect(banner).toBeVisible();
        capture.geometry.cookieVisible = await captureGeometry(page, width, theme);
        await screenshot(page, capture, 'cookie-visible');
        await banner.getByRole('button', { name: 'Necessary only', exact: true }).click();
        await expect(banner).toHaveCount(0);
        capture.necessaryOnlyRecord = parseCookieConsentRecord(
          await page.evaluate((key) => localStorage.getItem(key), COOKIE_CONSENT_STORAGE_KEY),
        );
        expect(capture.necessaryOnlyRecord).toMatchObject({ ...NECESSARY_ONLY_PREFERENCES });
        expect(isCookieConsentCurrent(capture.necessaryOnlyRecord)).toBe(true);
        capture.readiness.necessaryOnly = await settlePublicPage(page, readinessRoute, {
          expectedFonts: [{ cssVariable: '--font-geist-sans' }],
        });
        expect(capture.readiness.necessaryOnly.expectedFontProof).not.toBeNull();
        expect(capture.readiness.necessaryOnly.fontCoverageGaps).toEqual([]);
        await expect(banner).toHaveCount(0);
        capture.geometry.necessaryOnly = await captureGeometry(page, width, theme);
        await screenshot(page, capture, 'necessary-only');
        await screenshot(page, capture, 'necessary-only', true);
        const necessaryOnlySamples = capture.coherence.filter((sample) =>
          sample.phase.startsWith('necessary-only-'),
        );
        const initialNecessaryOnly = necessaryOnlySamples[0];
        if (!initialNecessaryOnly) throw new Error('Necessary-only coherence evidence is missing');
        for (const sample of necessaryOnlySamples.slice(1))
          expect(
            comparePublicPageCoherence(initialNecessaryOnly, sample),
            'Necessary-only viewport and full-page images must show a coherent page',
          ).toEqual([]);
        expect(capture.artifacts).toHaveLength(3);
        capture.sourceEnd = sourceSnapshot().digest;
        expect(sourceSnapshot().hashes, 'Live source changed during this capture').toEqual(
          initialSources,
        );
        expect(capture.sourceEnd).toBe(capture.sourceStart);
        capture.status = 'passed';
      } catch (error) {
        capture.status = 'failed';
        capture.errors.push(errorText(error));
        failed = true;
        failure = error;
      } finally {
        if (context) {
          try {
            await context.close();
            capture.contextClosed = true;
          } catch (error) {
            capture.contextClosed = false;
            capture.status = 'failed';
            capture.errors.push(errorText(error));
            failure = failed
              ? new AggregateError([failure, error], 'Capture and context close failed')
              : error;
            failed = true;
          }
        }
        saveManifest();
      }
      if (failed) throw failure;
    });
  }
}
