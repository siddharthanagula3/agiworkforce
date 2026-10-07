import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { OG_IMAGE } from '../lib/seo/site';
import {
  capturePublicPageCoherence,
  comparePublicPageCoherence,
} from './lib/public-page-coherence';
import {
  measurePublicKeyboardFocus,
  measurePublicPageIntegrity,
  measurePublicReducedMotion,
} from './lib/public-page-integrity';
import {
  getPublicRouteInventory,
  selectPublicRouteCases,
  type PublicRouteCase,
  type PublicRouteStateInput,
} from './lib/public-route-inventory';
import { settlePublicPage } from './lib/public-page-readiness';
import { evaluatePublicTextContrast } from './lib/public-text-contrast';
import { measurePublicTypographyWithScroll } from './lib/public-typography-scroll';

const inventory = getPublicRouteInventory();
type PublicDesignCase = PublicRouteCase & {
  state?: string;
  dataAccess?: PublicRouteStateInput['dataAccess'];
  expectedNotFoundUi?: boolean;
  expectedRobots?: 'noindex' | null;
};

const stateCases: PublicDesignCase[] = inventory.stateSamples.flatMap((state) => {
  if (!state.path || state.dataAccess === 'fixture-required') return [];
  const source = [...inventory.unresolvedDynamic, ...inventory.unavailableDynamic].find(
    (candidate) => candidate.pattern === state.pattern,
  );
  if (!source) throw new Error(`Public state has no route source: ${state.pattern}`);
  return [
    {
      route: state.route,
      path: state.path,
      pattern: state.pattern,
      kind: 'generated',
      sourceFiles: source.sourceFiles,
      dataSource: state.source,
      pageType: state.pageType,
      expectedHttpStatuses: state.expectedHttpStatuses,
      expectedFinalPath: state.expectedFinalPath,
      ownership: state.ownership,
      context: state.context,
      unresolvedFlags: state.unresolvedFlags,
      state: state.state,
      dataAccess: state.dataAccess,
      expectedNotFoundUi: state.expectedNotFoundUi,
      expectedRobots: state.expectedRobots,
    },
  ];
});
const measurableCases: PublicDesignCase[] = [...inventory.routes, ...stateCases];
if (new Set(measurableCases.map((route) => route.path)).size !== measurableCases.length) {
  throw new Error('The public matrix contains duplicate content or state paths');
}
const widths = [320, 360, 390, 768, 1024, 1366, 1440, 1920] as const;
const themes = ['light', 'dark'] as const;
const selectedPaths = process.env['PUBLIC_DESIGN_ROUTES']?.split(',');
if (selectedPaths && new Set(selectedPaths).size !== selectedPaths.length) {
  throw new Error('PUBLIC_DESIGN_ROUTES contains a duplicate');
}
const selectedWidths = process.env['PUBLIC_DESIGN_WIDTHS']?.split(',').map(Number);
if (
  selectedWidths &&
  (selectedWidths.length === 0 || selectedWidths.some((width) => !widths.includes(width as never)))
) {
  throw new Error('PUBLIC_DESIGN_WIDTHS must contain only widths in the public acceptance matrix');
}
if (selectedWidths && new Set(selectedWidths).size !== selectedWidths.length) {
  throw new Error('PUBLIC_DESIGN_WIDTHS contains a duplicate');
}
const cases = selectPublicRouteCases(
  { ...inventory, routes: measurableCases },
  { paths: selectedPaths },
);
const points = widths.filter((width) => !selectedWidths || selectedWidths.includes(width));

test.use({ screenshot: 'off', video: 'off', trace: 'off' });

test('the public acceptance matrix retains runtime content and navigation proof gaps', async () => {
  const testInfo = test.info();
  const coverage = {
    patterns: inventory.patterns,
    knownPaths: inventory.routes.map((route) => route.path),
    selectedPaths: cases.map((route) => route.path),
    selectedWidths: points,
    themes,
    partial: Boolean(selectedPaths || selectedWidths),
    runtimeStates: inventory.stateSamples,
    runtimePaths: stateCases.map((route) => route.path),
    unverifiedRuntimeExecution: stateCases
      .filter((route) => route.unresolvedFlags.some((flag) => flag.endsWith('-unverified')))
      .map((route) => ({
        path: route.path,
        dataAccess: route.dataAccess,
        unresolvedFlags: route.unresolvedFlags,
      })),
    unavailablePatterns: inventory.unavailableDynamic,
    unknownNavigation: measurableCases.filter((route) => route.expectedHttpStatuses === null),
  };
  await testInfo.attach('public-coverage.json', {
    body: JSON.stringify(coverage, null, 2),
    contentType: 'application/json',
  });
  expect(
    inventory.stateSamples.filter((state) => state.dataAccess === 'fixture-required'),
    'Successful runtime content needs local fixtures before complete public proof',
  ).toEqual([]);
  expect(
    coverage.unverifiedRuntimeExecution,
    'Handler source guards do not establish full route execution or data-access proof',
  ).toEqual([]);
  expect(
    coverage.unknownNavigation,
    'Conditional public navigation needs explicit state expectations',
  ).toEqual([]);
});

for (const width of points) {
  for (const theme of themes) {
    test.describe(`public standard ${width}px ${theme}`, () => {
      for (const route of cases) {
        test(`${route.path} renders readable, accessible public content`, async ({
          browser,
          baseURL,
        }, testInfo) => {
          if (!baseURL) throw new Error('Public acceptance requires a configured base URL');
          const context = await browser.newContext({
            baseURL,
            viewport: { width, height: width < 768 ? 844 : 900 },
            colorScheme: theme,
            reducedMotion: 'reduce',
            hasTouch: width < 1024,
            storageState: { cookies: [], origins: [] },
          });
          try {
            const page = await context.newPage();
            const expectedLocation = new URL(route.path, baseURL);
            const readiness = await settlePublicPage(
              page,
              {
                ...route,
                expectedOrigin: expectedLocation.origin,
                expectedQuery: expectedLocation.search,
              },
              { expectedFonts: [{ cssVariable: '--font-geist-sans' }] },
            );
            expect(
              readiness.expectedFontProof,
              'Canonical font loading must be measured',
            ).not.toBeNull();
            const expectedState = measurableCases.find(
              (candidate) => candidate.path === route.path,
            );
            if (expectedState?.expectedNotFoundUi) {
              await expect(page.locator('[data-route-state="not-found"]')).toBeVisible();
            }
            if (expectedState?.state === 'unavailable-artifact') {
              await expect(
                page.getByRole('heading', { level: 1, name: 'Shared artifact unavailable' }),
              ).toBeVisible();
            }
            if (expectedState?.state === 'unknown-device') {
              await expect(page.locator('#agi-connect-unknown-title')).toBeVisible();
              await expect(page.locator('#connect-device')).toHaveCount(0);
            }
            if (expectedState?.state === 'device-sign-in-instructions') {
              await expect(page.locator('#agi-connect-device-title')).toBeVisible();
              await expect(page.locator('#connect-unknown')).toHaveCount(0);
            }
            if (expectedState?.expectedRobots === 'noindex') {
              const robots = await page.locator('meta[name="robots" i]').evaluateAll((elements) =>
                elements.flatMap((element) =>
                  (element.getAttribute('content') ?? '')
                    .toLowerCase()
                    .split(',')
                    .map((directive) => directive.trim()),
                ),
              );
              expect(robots, 'Unavailable public content must not be indexed').toContain('noindex');
            }
            const appliedTheme = await page.evaluate(() => ({
              value: document.documentElement.dataset['theme'],
              light: document.documentElement.classList.contains('light'),
              dark: document.documentElement.classList.contains('dark'),
              scheme: getComputedStyle(document.documentElement).colorScheme,
              prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
            }));
            expect(appliedTheme.value, 'The requested theme must actually be applied').toBe(theme);
            expect(appliedTheme.light).toBe(theme === 'light');
            expect(appliedTheme.dark).toBe(theme === 'dark');
            expect(appliedTheme.scheme).toBe(theme);
            expect(appliedTheme.prefersDark).toBe(theme === 'dark');
            const coherence = [await capturePublicPageCoherence(page, 'ready')];
            const motion = await measurePublicReducedMotion(page, {
              durationMs: 1400,
              sampleCount: 8,
            });
            coherence.push(await capturePublicPageCoherence(page, 'motion'));
            const typography = await measurePublicTypographyWithScroll(page, {
              pageType: route.pageType === 'utility' ? 'marketing' : route.pageType,
              pathname: route.path,
            });
            coherence.push(await capturePublicPageCoherence(page, 'typography'));
            if (!typography.canvasColor)
              throw new Error('Browser canvas colour could not be measured');
            const contrast = evaluatePublicTextContrast(typography.samples, typography.canvasColor);
            const integrity = await measurePublicPageIntegrity(page, {
              expectedCanonical: new URL(route.path, baseURL).href,
              expectedShareImage: new URL(OG_IMAGE.url, baseURL).href,
              touch: width < 1024,
            });
            coherence.push(await capturePublicPageCoherence(page, 'integrity'));
            const focus = await measurePublicKeyboardFocus(page);
            coherence.push(await capturePublicPageCoherence(page, 'focus'));
            const accessibility = await new AxeBuilder({ page: page as never })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
              .analyze();
            coherence.push(await capturePublicPageCoherence(page, 'accessibility'));
            const initialState = coherence[0];
            if (!initialState) throw new Error('Missing initial public measurement state');
            const coherenceFindings = coherence
              .slice(1)
              .flatMap((state) => comparePublicPageCoherence(initialState, state));
            const serious = accessibility.violations.filter(
              (violation) => violation.impact === 'serious' || violation.impact === 'critical',
            );
            const seriousIncomplete = accessibility.incomplete.filter(
              (finding) => finding.impact === 'serious' || finding.impact === 'critical',
            );
            const report = {
              route,
              width,
              theme,
              appliedTheme,
              coherence: { phases: coherence, findings: coherenceFindings },
              browserVersion: browser.version(),
              context: 'fresh-signed-out',
              reducedMotion: true,
              scope: {
                knownPaths: inventory.routes.length,
                runtimePaths: stateCases.length,
                selectedPaths: cases.length,
                selectedWidths: points,
                partial: Boolean(selectedPaths || selectedWidths),
              },
              readiness,
              typography,
              contrast,
              integrity,
              focus,
              motion,
              accessibility: {
                violations: accessibility.violations,
                incomplete: accessibility.incomplete,
              },
              limits: [
                'This development-server gate does not prove production performance or loaded-library necessity.',
                'This sample does not activate every control or prove asynchronous success, empty and error states.',
                'Metadata presence and URL agreement do not prove that title and description copy is true or that the share image depicts this page correctly.',
                'Share-image resources, sitemap membership and link destinations require separate checks.',
                'Phase snapshots bind measurements to the same URL, theme, used registered font families, main font assignments and main text/rendering state; they do not establish approved palette values or detect every transient mutation between snapshots.',
                ...readiness.limits,
                ...integrity.limits,
                ...focus.limits,
                ...motion.limits,
              ],
            };
            await testInfo.attach('public-design-report.json', {
              body: JSON.stringify(report, null, 2),
              contentType: 'application/json',
            });
            expect
              .soft(readiness.scrollWidth, 'Page horizontal overflow')
              .toBeLessThanOrEqual(readiness.width);
            expect.soft(coherenceFindings, 'Consistent page across measurement phases').toEqual([]);
            expect
              .soft(readiness.fontCoverageGaps, 'Custom font glyph coverage needing review')
              .toEqual([]);
            expect.soft(typography.findings, 'Typography, wrapping and clipping').toEqual([]);
            expect.soft(typography.unmeasured, 'Typography measurement coverage').toEqual([]);
            expect.soft(contrast.findings, 'Text contrast and forbidden opacity').toEqual([]);
            expect.soft(contrast.unmeasured, 'Contrast measurement coverage').toEqual([]);
            expect
              .soft(integrity.findings, 'Metadata, headings, landmarks and hit areas')
              .toEqual([]);
            expect.soft(focus.findings, 'Keyboard focus').toEqual([]);
            expect.soft(motion.findings, 'Reduced motion').toEqual([]);
            expect.soft(serious, 'Serious or critical accessibility findings').toEqual([]);
            expect
              .soft(seriousIncomplete, 'Serious or critical accessibility checks needing review')
              .toEqual([]);
          } finally {
            await context.close();
          }
        });
      }
    });
  }
}
