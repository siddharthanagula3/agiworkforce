import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type TestInfo } from '@playwright/test';
import {
  locatePublicFeatureMockup,
  type PublicFeatureMockupScope,
} from './lib/public-feature-mockup';
import { measurePublicFeatureBodyWords } from './lib/public-feature-body-words';
import { measurePublicFontProof, settlePublicPage } from './lib/public-page-readiness';
import { getPublicRouteInventory } from './lib/public-route-inventory';
import { evaluatePublicTextContrast } from './lib/public-text-contrast';
import {
  measurePublicTypographyWithScroll,
  type PublicTypographyWithScrollReport,
} from './lib/public-typography-scroll';
import {
  capturePublicViewportStrips,
  PublicViewportCaptureError,
  type PublicViewportCapture,
} from './lib/public-viewport-strip-capture';
import {
  COOKIE_CONSENT_STORAGE_KEY,
  NECESSARY_ONLY_PREFERENCES,
  isCookieConsentCurrent,
  parseCookieConsentRecord,
} from '../shared/lib/cookie-consent';

const root = path.resolve(__dirname, '../../..');
const label = 'The AGI workspace console';
const figure = 'figure.agi-dev.agi-console-responsive[data-device="web"]';
const fonts = [{ cssVariable: '--font-geist-sans' }, { cssVariable: '--font-geist-mono' }];
const widths = [320, 360, 390, 768, 1024, 1366, 1440, 1920];
type Caller = {
  name: string;
  pathname: string;
  pageFile: string;
  view: 'members' | 'policy' | 'audit';
  scope: PublicFeatureMockupScope;
  selector: string;
  headingId: string;
  pageFigures: number;
};
const callers: readonly Caller[] = [
  {
    name: 'teams-members',
    pathname: '/teams',
    pageFile: 'apps/web/app/teams/page.tsx',
    view: 'members',
    scope: {
      role: 'region',
      region: 'Seats, roles, and a console that decides what each role can reach.',
      figure: label,
    },
    selector: `main section[aria-labelledby="agi-teams-title"] > .agi-ds-container > .agi-ds-pagehead-split > ${figure}`,
    headingId: 'agi-teams-title',
    pageFigures: 1,
  },
  {
    name: 'enterprise-audit',
    pathname: '/enterprise',
    pageFile: 'apps/web/app/enterprise/page.tsx',
    view: 'audit',
    scope: {
      role: 'article',
      region: 'Every administrative and identity event, readable and streamable.',
      figure: label,
    },
    selector: `main article[aria-labelledby="agi-enterprise-audit-title"] > .agi-ds-split-visual > ${figure}`,
    headingId: 'agi-enterprise-audit-title',
    pageFigures: 4,
  },
  {
    name: 'enterprise-members-hero',
    pathname: '/enterprise',
    pageFile: 'apps/web/app/enterprise/page.tsx',
    view: 'members',
    scope: {
      role: 'region',
      region: 'Your data can stay where it is while the security review runs.',
      figure: label,
    },
    selector: `main section[aria-labelledby="agi-enterprise-title"] > .agi-ds-container > .agi-ds-pagehead-split > ${figure}`,
    headingId: 'agi-enterprise-title',
    pageFigures: 4,
  },
  {
    name: 'enterprise-members-identity',
    pathname: '/enterprise',
    pageFile: 'apps/web/app/enterprise/page.tsx',
    view: 'members',
    scope: {
      role: 'article',
      region: 'SSO and directory provisioning, configured by your owner.',
      figure: label,
    },
    selector: `main article[aria-labelledby="agi-enterprise-identity-title"] > .agi-ds-split-visual > ${figure}`,
    headingId: 'agi-enterprise-identity-title',
    pageFigures: 4,
  },
  {
    name: 'enterprise-policy',
    pathname: '/enterprise',
    pageFile: 'apps/web/app/enterprise/page.tsx',
    view: 'policy',
    scope: {
      role: 'article',
      region: 'A ceiling the console enforces, not a preference it records.',
      figure: label,
    },
    selector: `main article[aria-labelledby="agi-enterprise-policy-title"] > .agi-ds-split-visual > ${figure}`,
    headingId: 'agi-enterprise-policy-title',
    pageFigures: 4,
  },
  {
    name: 'solutions-policy',
    pathname: '/solutions',
    pageFile: 'apps/web/app/solutions/page.tsx',
    view: 'policy',
    scope: { role: 'main', figure: label },
    selector: `main section[aria-labelledby="agi-solutions-map-title"] .agi-ds-bento[role="list"][aria-label="Solution pages"] > a[role="listitem"][href="/business"] > .agi-ds-bento-visual > ${figure}`,
    headingId: 'agi-solutions-map-title',
    pageFigures: 1,
  },
];
const sources = [
  'apps/web/e2e/public-console-mockup.spec.ts',
  'apps/web/e2e/lib/public-feature-mockup.ts',
  'apps/web/e2e/lib/public-feature-body-words.ts',
  'apps/web/e2e/lib/public-page-readiness.ts',
  'apps/web/e2e/lib/public-route-inventory.ts',
  'apps/web/e2e/lib/public-typography.ts',
  'apps/web/e2e/lib/public-typography-scroll.ts',
  'apps/web/e2e/lib/public-text-contrast.ts',
  'apps/web/e2e/lib/public-viewport-strip-capture.ts',
  'apps/web/app/layout.tsx',
  'apps/web/app/globals.css',
  'apps/web/features/marketing/components/DeviceMockups.tsx',
  'apps/web/features/marketing/components/FeatureScenes.tsx',
  'apps/web/features/marketing/components/console-mockup-responsive.css',
  'apps/web/features/marketing/components/mockup-responsive.css',
  'apps/web/features/marketing/components/editor-mockup-responsive.css',
  'apps/web/features/marketing/components/desktop-chrome-mockup-responsive.css',
  'apps/web/features/marketing/components/agent-mockup-responsive.css',
  'apps/web/features/marketing/components/artifact-mockup-responsive.css',
  'apps/web/features/marketing/components/research-mockup-responsive.css',
  'apps/web/features/marketing/components/memory-mockup-responsive.css',
  'apps/web/features/marketing/components/project-mockup-responsive.css',
  'apps/web/features/marketing/components/legacy-pages.css',
  'apps/web/features/marketing/components/legacy-landing.css',
  'apps/web/features/marketing/components/motion/motion.css',
  'apps/web/features/marketing/components/pages/surfaces/shared.tsx',
  'apps/web/features/marketing/components/system/Bento.tsx',
  'apps/web/features/marketing/components/system/SplitFeature.tsx',
  'apps/web/features/marketing/components/system/system.css',
  'apps/web/features/marketing/components/system/page-header.css',
  'apps/web/features/marketing/components/system/public-reference.css',
  'apps/web/features/marketing/components/system/index.ts',
  'apps/web/shared/components/layout/Header.tsx',
  'apps/web/features/marketing/components/system/MarketingHeader.tsx',
  'apps/web/shared/components/CookieConsent.tsx',
  'apps/web/shared/lib/cookie-consent.ts',
  'packages/ui/design-tokens/src/foundation.css',
  'packages/ui/design-tokens/src/tailwind.css',
];
const hashSources = (files: readonly string[]) =>
  Object.fromEntries(
    [...new Set(files)].sort().map((file) => [
      file,
      createHash('sha256')
        .update(readFileSync(path.join(root, file)))
        .digest('hex'),
    ]),
  );
const failureOf = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));
const containsRange = (ranges: [number, number][], low: number, high: number) =>
  ranges.some(([start, end]) => start <= low && end >= high);

test.describe.configure({ retries: 0 });
test.setTimeout(180_000);

async function reading(frame: Locator) {
  return frame.evaluate((owner) => {
    const box = (rect: DOMRect) => ({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
    const frameBox = owner.getBoundingClientRect();
    const table = owner.querySelector<HTMLElement>('.agi-sc-table');
    const tableBox = table?.getBoundingClientRect();
    const portBox =
      table && tableBox
        ? {
            left: tableBox.left + table.clientLeft,
            right: tableBox.left + table.clientLeft + table.clientWidth,
            top: tableBox.top + table.clientTop,
            bottom: tableBox.top + table.clientTop + table.clientHeight,
          }
        : null;
    const families = getComputedStyle(owner);
    const firstFamily = (value: string) =>
      value
        .split(',')[0]!
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .toLowerCase();
    const sans = firstFamily(families.getPropertyValue('--font-geist-sans'));
    const mono = firstFamily(families.getPropertyValue('--font-geist-mono'));
    const tokenSize = (name: string) => {
      const raw = families.getPropertyValue(name).trim();
      const match = /^(\d+(?:\.\d+)?|\.\d+)(px|rem)$/.exec(raw);
      if (!match) {
        throw new Error(`Console token is not a supported length: ${name}=${JSON.stringify(raw)}`);
      }
      return (
        Number(match[1]) *
        (match[2] === 'rem' ? parseFloat(getComputedStyle(document.documentElement).fontSize) : 1)
      );
    };
    const tokens = {
      body: tokenSize('--public-mockup-text-body'),
      control: tokenSize('--public-mockup-text-control'),
      code: tokenSize('--public-mockup-text-code'),
    };
    const rows = [];
    const walker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (!node.data.trim()) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style,noscript,textarea,option'))
        throw new Error('Console has an unexpected raw text owner');
      const css = getComputedStyle(parent);
      const family = firstFamily(css.fontFamily);
      const range = document.createRange();
      range.selectNodeContents(node);
      const units = [
        ...new Intl.Segmenter(document.documentElement.lang, { granularity: 'grapheme' }).segment(
          node.data,
        ),
      ]
        .filter((part) => !/^\s+$/u.test(part.segment))
        .map((part) => {
          const glyph = document.createRange();
          glyph.setStart(node, part.index);
          glyph.setEnd(node, part.index + part.segment.length);
          const rects = [...glyph.getClientRects()]
            .filter((rect) => rect.width > 0 && rect.height > 0)
            .map(box);
          const visible =
            rects.length > 0 &&
            rects.every(
              (rect) =>
                rect.left >= frameBox.left - 0.05 &&
                rect.right <= frameBox.right + 0.05 &&
                rect.top >= frameBox.top - 0.05 &&
                rect.bottom <= frameBox.bottom + 0.05 &&
                (!table?.contains(node) ||
                  (portBox !== null &&
                    rect.left >= portBox.left - 0.05 &&
                    rect.right <= portBox.right + 0.05 &&
                    rect.top >= portBox.top - 0.05 &&
                    rect.bottom <= portBox.bottom + 0.05)),
            );
          return { low: part.index, high: part.index + part.segment.length, rects, visible };
        });
      rows.push({
        raw: node.data,
        text: node.data.replace(/\s+/g, ' ').trim(),
        table: table?.contains(node) ?? false,
        units,
        rects: [...range.getClientRects()].map(box),
        family,
        size: parseFloat(css.fontSize),
        floor:
          family === mono
            ? tokens.code
            : parent.closest('p,.agi-sc-row')
              ? tokens.body
              : tokens.control,
      });
    }
    const boxes = [...owner.querySelectorAll('*')]
      .filter((element) => element === table || !table?.contains(element))
      .map((element) => box(element.getBoundingClientRect()))
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const masks = [];
    for (const element of [owner, ...owner.querySelectorAll('*')]) {
      const css = getComputedStyle(element);
      if (
        css.maskImage !== 'none' ||
        !['', 'none'].includes(css.getPropertyValue('-webkit-mask-image')) ||
        css.clipPath !== 'none'
      )
        masks.push(element.className);
    }
    for (let ancestor = owner.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const css = getComputedStyle(ancestor);
      if (
        css.maskImage !== 'none' ||
        !['', 'none'].includes(css.getPropertyValue('-webkit-mask-image')) ||
        css.clipPath !== 'none'
      )
        masks.push(ancestor.className);
    }
    return {
      connected: owner.isConnected,
      box: box(frameBox),
      documentBox: {
        x: frameBox.left + scrollX,
        y: frameBox.top + scrollY,
        width: frameBox.width,
        height: frameBox.height,
      },
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      masks,
      boxes,
      rows,
      sans,
      mono,
      tokens,
      declaredTokens: Object.fromEntries(
        [
          '--public-mockup-text-body',
          '--public-mockup-text-control',
          '--public-mockup-text-code',
        ].map((name) => [name, families.getPropertyValue(name).trim()]),
      ),
      table: table
        ? {
            index: [...document.querySelectorAll('*')].indexOf(table),
            x: table.scrollLeft,
            max: table.scrollWidth - table.clientWidth,
            hiddenHeight: table.scrollHeight - table.clientHeight,
            overflowX: getComputedStyle(table).overflowX,
          }
        : null,
    };
  });
}

function assertReading(raw: Awaited<ReturnType<typeof reading>>) {
  expect(raw.connected).toBe(true);
  expect(raw.overflow).toBeLessThanOrEqual(0);
  expect(raw.masks).toEqual([]);
  expect(raw.box.width).toBeGreaterThan(0);
  expect(raw.box.height).toBeGreaterThan(0);
  expect(raw.box.left).toBeGreaterThanOrEqual(0);
  expect(raw.sans).not.toBe('');
  expect(raw.mono).not.toBe('');
  expect(raw.sans).not.toBe(raw.mono);
  expect(raw.tokens).toEqual({ body: 17, control: 16, code: 15 });
  for (const rect of [
    ...raw.boxes,
    ...raw.rows.filter((row) => !row.table).flatMap((row) => row.rects),
  ]) {
    expect(Object.values(rect).every(Number.isFinite)).toBe(true);
    expect(rect.left).toBeGreaterThanOrEqual(raw.box.left - 0.05);
    expect(rect.right).toBeLessThanOrEqual(raw.box.right + 0.05);
    expect(rect.top).toBeGreaterThanOrEqual(raw.box.top - 0.05);
    expect(rect.bottom).toBeLessThanOrEqual(raw.box.bottom + 0.05);
  }
  for (const row of raw.rows) {
    expect([raw.sans, raw.mono]).toContain(row.family);
    expect(row.size).toBeGreaterThanOrEqual(row.floor);
    expect(row.units.length).toBeGreaterThan(0);
    for (const unit of row.units) {
      expect(unit.rects.length).toBeGreaterThan(0);
      expect(unit.rects.every((rect) => Object.values(rect).every(Number.isFinite))).toBe(true);
    }
  }
  if (raw.table) {
    expect(raw.table.hiddenHeight).toBeLessThanOrEqual(1);
    expect(raw.table.overflowX).toBe('auto');
  }
}

function assertComplete(
  report: PublicTypographyWithScrollReport,
  raw: Awaited<ReturnType<typeof reading>>,
) {
  expect(report.findings).toEqual([]);
  expect(report.unmeasured).toEqual([]);
  expect(report.excluded).toEqual([]);
  expect(report.scrollProof.planComplete).toBe(true);
  expect(report.scrollProof.restored).toBe(true);
  expect(report.scrollProof.restorationFailures).toEqual([]);
  expect(report.scrollProof.states).toHaveLength(report.scrollProof.plannedStates);
  expect(
    report.scrollProof.states.every(
      (state) => state.domStable && state.report.excluded.length === 0,
    ),
  ).toBe(true);
  expect(report.coverage.textNodes).toBe(raw.rows.length);
  const keyed = new Map<string, string>();
  for (const sample of report.samples) {
    expect(sample.kind).toBe('text');
    expect(sample.paintUnmeasured).toEqual([]);
    expect(sample.rects.length).toBeGreaterThan(0);
    const rawOwners = raw.rows.filter((row) => row.text === sample.text);
    expect(rawOwners.length).toBeGreaterThan(0);
    expect(sample.renderedSize).not.toBeNull();
    expect(sample.renderedSize!).toBeGreaterThanOrEqual(
      Math.max(...rawOwners.map((row) => row.floor)),
    );
    if (keyed.has(sample.sourceKey)) expect(keyed.get(sample.sourceKey)).toBe(sample.text);
    keyed.set(sample.sourceKey, sample.text);
  }
  expect([...keyed.values()].sort()).toEqual(raw.rows.map((row) => row.text).sort());
  const tableRows = raw.rows.filter((row) => row.table);
  expect(report.scrollProof.sources.map((source) => source.sourceText).sort()).toEqual(
    report.scrollContainers.length ? tableRows.map((row) => row.raw).sort() : [],
  );
  expect(new Set(report.scrollProof.sources.map((source) => source.sourceKey)).size).toBe(
    report.scrollContainers.length ? tableRows.length : 0,
  );
  for (const source of report.scrollProof.sources) {
    expect(source.complete).toBe(true);
    expect(source.containerKeys).toHaveLength(1);
    expect(report.scrollContainers).toHaveLength(1);
    expect(source.containerKeys).toEqual([report.scrollContainers[0]!.key]);
    const witnesses = tableRows.filter((row) => row.raw === source.sourceText);
    expect(witnesses.length).toBeGreaterThan(0);
    for (const row of witnesses)
      for (const unit of row.units) {
        expect(containsRange(source.requiredRanges, unit.low, unit.high)).toBe(true);
        expect(containsRange(source.visibleRanges, unit.low, unit.high)).toBe(true);
      }
  }
  if (raw.table && raw.table.max > 1) {
    expect(report.scrollContainers).toHaveLength(1);
    expect(report.scrollContainers[0]!.elementIndex).toBe(raw.table.index);
  } else expect(report.scrollContainers).toHaveLength(0);
  if (!report.canvasColor) throw new Error('Console contrast has no canonical canvas');
  const contrast = evaluatePublicTextContrast(report.samples, report.canvasColor);
  expect(contrast.findings).toEqual([]);
  expect(contrast.unmeasured).toEqual([]);
  expect(contrast.coverage.measured).toBe(contrast.coverage.eligible);
  expect(contrast.coverage.eligible).toBeGreaterThan(0);
  return contrast;
}

async function capture(
  frame: Locator,
  page: Parameters<typeof capturePublicViewportStrips>[0],
  info: TestInfo,
  files: string[],
  position: number,
  evidence: Record<string, unknown>,
) {
  let result: PublicViewportCapture | undefined;
  let failure: Error | undefined;
  try {
    result = await capturePublicViewportStrips(page, frame, {
      stickyHeader: page.getByRole('banner'),
      bounds: 'frame',
      sourceFiles: files.map((file) => path.join(root, file)),
      outputPath: (index) => info.outputPath(`console-x${position}-strip-${index}.png`),
    });
  } catch (error) {
    if (error instanceof PublicViewportCaptureError) result = error.capture;
    failure = failureOf(error);
  }
  if (result) {
    (evidence['captures'] as unknown[]).push({ x: position, evidence: result.evidence });
    try {
      for (const image of result.images) {
        if (!image.path) throw new Error('Console strip has no native output path');
        await info.attach(`console-x${position}-strip-${image.index}.png`, {
          path: image.path,
          contentType: 'image/png',
        });
      }
    } catch (error) {
      failure ??= failureOf(error);
    }
  }
  if (failure) throw failure;
}

for (const caller of callers)
  for (const width of widths)
    for (const theme of ['light', 'dark'] as const) {
      test(`console-${caller.name}-${width}-${theme}`, async ({ browser }, testInfo) => {
        const baseURL = testInfo.project.use.baseURL;
        if (typeof baseURL !== 'string' || testInfo.config.workers !== 1)
          throw new Error('Console regression requires configured baseURL and one worker');
        const route = getPublicRouteInventory().routes.filter(
          (route) => route.path === caller.pathname,
        );
        expect(route).toHaveLength(1);
        expect(route[0]!.context).toBe('signed-out');
        expect(route[0]!.unresolvedFlags).toEqual([]);
        const files = [
          ...sources,
          caller.pageFile,
          ...route[0]!.sourceFiles.map((file) => path.relative(root, file)),
        ];
        const evidence: Record<string, unknown> = {
          caller,
          width,
          theme,
          repeatEachIndex: testInfo.repeatEachIndex,
          sourceStart: hashSources(files),
          captures: [],
          contextClosed: false,
          limits: [
            'Authored Console illustration, not workspace mutations or availability.',
            'Listed source closure only; held page/cascade changes and unlisted imports are not committed-HEAD proof.',
            'Font registration and Unicode coverage do not prove per-glyph fallback pixels.',
            'Canonical source-range sweep and native wheel replay cover the one table; PNG strips cover each replayed position, not arbitrary overlays or normal motion.',
          ],
        };
        const context = await browser.newContext({
          baseURL,
          viewport: { width, height: 900 },
          colorScheme: theme,
          reducedMotion: 'reduce',
          hasTouch: true,
          storageState: { cookies: [], origins: [] },
        });
        let frameHandle:
          Awaited<ReturnType<typeof locatePublicFeatureMockup>>['frameHandle'] | undefined;
        let failure: Error | undefined;
        try {
          expect(await context.storageState()).toEqual({ cookies: [], origins: [] });
          const page = await context.newPage();
          const expectation = {
            ...route[0]!,
            expectedOrigin: new URL(baseURL).origin,
            expectedQuery: '',
          };
          evidence['initialReadiness'] = await settlePublicPage(page, expectation, {
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
          evidence['consent'] = consent;
          evidence['readiness'] = await settlePublicPage(page, expectation, {
            expectedFonts: fonts,
          });
          expect(
            await page.evaluate(() => ({
              theme: document.documentElement.dataset['theme'],
              scheme: getComputedStyle(document.documentElement).colorScheme,
              light: document.documentElement.classList.contains('light'),
              dark: document.documentElement.classList.contains('dark'),
            })),
          ).toEqual({ theme, scheme: theme, light: theme === 'light', dark: theme === 'dark' });
          const located = await locatePublicFeatureMockup(page, caller.scope);
          frameHandle = located.frameHandle;
          const { frame, scopeSelector } = located;
          await expect(page.locator(`main ${figure}`)).toHaveCount(caller.pageFigures);
          await expect(page.locator(caller.selector)).toHaveCount(1);
          expect(
            await frameHandle.evaluate(
              (element, selector) => document.querySelector(selector) === element,
              caller.selector,
            ),
          ).toBe(true);
          expect(
            await frameHandle.evaluate(
              (element, heading) =>
                element.closest('[aria-labelledby]')?.getAttribute('aria-labelledby') === heading,
              caller.headingId,
            ),
          ).toBe(true);
          await expect(page.locator(`#${caller.headingId}`)).toHaveCount(1);
          evidence['ownership'] = located.ownership;
          const body = frame.locator(':scope > .agi-dev-shell > .agi-dev-body.agi-sc');
          await expect(body).toHaveAttribute('aria-hidden', 'true');
          await expect(
            body.locator('a,button,input,select,textarea,[contenteditable],[tabindex],[hidden]'),
          ).toHaveCount(0);
          await expect(frame.locator('.agi-dev-title')).toHaveText('agiworkforce.com/workspace');
          await expect(frame.locator('.agi-dev-badge')).toHaveText('Console');
          await expect(body.locator('p.agi-console-example')).toHaveText(
            'Authored example. This illustration is not connected to a workspace.',
          );
          await expect(body.locator('.agi-sc-navitem[data-on="true"]')).toHaveText(
            caller.view === 'members' ? 'Members' : caller.view === 'policy' ? 'Policy' : 'Audit',
          );
          await expect(body.locator('.agi-sc-page-title')).toHaveText(
            caller.view === 'members' ? 'Members' : caller.view === 'policy' ? 'Policy' : 'Audit',
          );
          await expect(body.locator('.agi-sc-table')).toHaveCount(caller.view === 'policy' ? 0 : 1);
          if (caller.view === 'members') {
            await expect(body.locator('.agi-sc-row')).toHaveCount(5);
            await expect(body.locator('.agi-sc-table > .agi-mk-table-h')).toHaveText([
              'Name',
              'Role',
              'Email',
              'Status',
            ]);
            await expect(body.locator('.agi-sc-row > span')).toHaveText([
              'A. Okafor',
              'Owner',
              'a.okafor@example.com',
              'active',
              'J. Lindqvist',
              'Admin',
              'j.lindqvist@example.com',
              'active',
              'M. Ferreira',
              'Member',
              'm.ferreira@example.com',
              'active',
              'R. Nakamura',
              'Member',
              'r.nakamura@example.com',
              'active',
              'S. Adeyemi',
              'Viewer',
              's.adeyemi@example.com',
              'active',
            ]);
            await expect(body.locator('.agi-mk-receipt')).toHaveText(
              'Sample names and addresses. No member has been invited or changed.',
            );
          } else if (caller.view === 'policy') {
            await expect(body.locator('.agi-sc-perm')).toHaveText([
              'Local allowed',
              'Your own keys allowed',
              'Managed Cloud allowed',
              'Public sharing denied',
              'Audit export denied',
              'Mobile sync denied',
            ]);
            await expect(body.locator('.agi-sc-instructions')).toHaveText(
              'Enforce retention is off in this unsaved example. No policy has been saved.',
            );
          } else {
            await expect(body.locator('.agi-sc-table > .agi-mk-table-h')).toHaveText([
              'When',
              'Actor',
              'Action',
              'Outcome',
            ]);
            await expect(body.locator('.agi-sc-row > span')).toHaveText([
              'Example',
              'example-owner',
              'admin_policy_changed',
              'success',
              'Example',
              'system',
              'scim_user_provisioned',
              'success',
              'Example',
              'example-admin',
              'data_exported',
              'denied',
              'Example',
              'example-owner',
              'admin_policy_changed',
              'failure',
            ]);
            await expect(body.locator('.agi-sc-panel-foot > span')).toHaveText([
              'Export JSONL',
              'Filter by action',
              'Filter by outcome',
            ]);
            await expect(body.locator('p.agi-sc-note:not(.agi-console-example)')).toHaveText(
              'Illustrative events. No export or stream is running.',
            );
          }
          if (caller.name === 'solutions-policy') {
            const gutter = await frame.evaluate((element) => {
              const parent = element.parentElement;
              const tile = parent?.parentElement;
              const list = tile?.parentElement;
              if (
                !parent?.matches('.agi-ds-bento-visual') ||
                !tile?.matches('a[role="listitem"][href="/business"]') ||
                !list?.matches('.agi-ds-bento[role="list"][aria-label="Solution pages"]')
              )
                throw new Error('Console Bento ancestry does not match the owned caller');
              const css = getComputedStyle(parent);
              const expected = parseFloat(css.getPropertyValue('--space-2'));
              return {
                expected,
                token: css.getPropertyValue('--space-2'),
                start: parseFloat(css.paddingInlineStart),
                end: parseFloat(css.paddingInlineEnd),
                bottom: parseFloat(css.paddingBlockEnd),
                title: tile.querySelector('.agi-ds-bento-title')?.textContent,
              };
            });
            expect(gutter.token.trim()).toMatch(/^\d+(?:\.\d+)?px$/);
            expect(gutter.expected).toBeGreaterThan(0);
            expect(gutter.start).toBe(gutter.expected);
            expect(gutter.end).toBe(gutter.expected);
            expect(gutter.bottom).toBe(gutter.expected);
            expect(gutter.title).toBe('AGI for Business');
            evidence['gutter'] = gutter;
          }
          await frame.scrollIntoViewIfNeeded();
          await expect(frame).toBeVisible();
          const font = await measurePublicFontProof(page, frame, fonts);
          expect(font.fontCoverageGaps).toEqual([]);
          evidence['font'] = font;
          const before = await reading(frame);
          evidence['before'] = before;
          assertReading(before);
          if (before.table) {
            const cells = await frame.evaluate((root) =>
              [...root.querySelectorAll('.agi-sc-table > .agi-mk-table-h, .agi-sc-row > span')].map(
                (element) => {
                  const cell = element.getBoundingClientRect();
                  const range = document.createRange();
                  range.selectNodeContents(element);
                  return {
                    text: element.textContent,
                    cell: {
                      left: cell.left,
                      right: cell.right,
                      top: cell.top,
                      bottom: cell.bottom,
                    },
                    textRects: [...range.getClientRects()].map((rect) => ({
                      left: rect.left,
                      right: rect.right,
                      top: rect.top,
                      bottom: rect.bottom,
                    })),
                  };
                },
              ),
            );
            evidence['cellText'] = cells;
            expect(cells.length).toBeGreaterThan(0);
            expect(
              cells.filter((entry) =>
                entry.textRects.some(
                  (rect) =>
                    rect.left < entry.cell.left - 0.05 ||
                    rect.right > entry.cell.right + 0.05 ||
                    rect.top < entry.cell.top - 0.05 ||
                    rect.bottom > entry.cell.bottom + 0.05,
                ),
              ),
              'Every table label must fit its own cell without overlapping the next column',
            ).toEqual([]);
          }
          expect(before.box.right).toBeLessThanOrEqual(width);
          const options = {
            pageType: 'marketing' as const,
            pathname: caller.pathname,
            scopeSelector,
          };
          const complete = await measurePublicTypographyWithScroll(page, options);
          evidence['complete'] = complete;
          evidence['contrast'] = assertComplete(complete, before);
          const words = await measurePublicFeatureBodyWords(
            frame,
            complete.scrollProof.states[0]!.report,
            { selector: '.agi-dev-body p', fontProofFamilies: font.expectedFontProof },
          );
          expect(words.findings).toEqual([]);
          expect(words.unmeasured).toEqual([]);
          expect(words.coverage.owners).toBe(2);
          expect(words.coverage.ordinaryWords).toBeGreaterThan(0);
          evidence['bodyWords'] = words;
          const table = frame.locator('.agi-sc-table');
          const positions =
            before.table && before.table.max > 1
              ? [
                  ...new Set(
                    complete.scrollProof.states.flatMap((state) =>
                      state.actual.map((port) => port.x),
                    ),
                  ),
                ].sort((a, b) => a - b)
              : [0];
          const native: {
            requestedX: number;
            actualX: number;
            rows: {
              raw: string;
              units: { low: number; high: number; visible: boolean }[];
            }[];
            font: Awaited<ReturnType<typeof measurePublicFontProof>>;
          }[] = [];
          evidence['nativeTable'] = native;
          for (const position of positions) {
            if (before.table) {
              await table.hover();
              const current = await table.evaluate((element) => element.scrollLeft);
              if (Math.abs(position - current) > 0.05)
                await page.mouse.wheel(position - current, 0);
              await expect
                .poll(async () =>
                  Math.abs((await table.evaluate((element) => element.scrollLeft)) - position),
                )
                .toBeLessThanOrEqual(1);
            }
            const state = await reading(frame);
            assertReading(state);
            expect(state.rows.map((row) => row.raw)).toEqual(before.rows.map((row) => row.raw));
            const currentFont = await measurePublicFontProof(page, frame, fonts);
            expect(currentFont.fontCoverageGaps).toEqual([]);
            native.push({
              requestedX: position,
              actualX: state.table?.x ?? 0,
              rows: state.rows
                .filter((row) => row.table)
                .map((row) => ({
                  raw: row.raw,
                  units: row.units.map(({ low, high, visible }) => ({ low, high, visible })),
                })),
              font: currentFont,
            });
            await capture(frame, page, testInfo, files, position, evidence);
          }
          if (before.table) {
            for (const [index, row] of before.rows.filter((row) => row.table).entries())
              for (const unit of row.units)
                expect(
                  native.some((state) =>
                    state.rows[index]?.units.some(
                      (current) =>
                        current.low === unit.low && current.high === unit.high && current.visible,
                    ),
                  ),
                ).toBe(true);
            expect(positions[0]).toBe(0);
            expect(positions.at(-1)!).toBeGreaterThanOrEqual(before.table.max - 1);
            const end = await table.evaluate((element) => element.scrollLeft);
            if (Math.abs(end) > 0.05) {
              await table.hover();
              await page.mouse.wheel(-end, 0);
            }
            await expect
              .poll(() => table.evaluate((element) => Math.abs(element.scrollLeft)))
              .toBeLessThanOrEqual(1);
          }
          await expect(body).toHaveAttribute('aria-hidden', 'true');
          await expect(
            body.locator('a,button,input,select,textarea,[contenteditable],[tabindex],[hidden]'),
          ).toHaveCount(0);
          const after = await reading(frame);
          assertReading(after);
          expect(after.documentBox).toEqual(before.documentBox);
          expect(after.rows.map((row) => row.raw)).toEqual(before.rows.map((row) => row.raw));
          evidence['after'] = after;
          const afterComplete = await measurePublicTypographyWithScroll(page, options);
          evidence['afterComplete'] = afterComplete;
          evidence['afterContrast'] = assertComplete(afterComplete, after);
          const afterWords = await measurePublicFeatureBodyWords(
            frame,
            afterComplete.scrollProof.states[0]!.report,
            {
              selector: '.agi-dev-body p',
              fontProofFamilies: (await measurePublicFontProof(page, frame, fonts))
                .expectedFontProof,
            },
          );
          expect(afterWords.findings).toEqual([]);
          expect(afterWords.unmeasured).toEqual([]);
          expect(afterWords.coverage).toEqual(words.coverage);
          expect(afterWords.owners).toEqual(words.owners);
          evidence['afterBodyWords'] = afterWords;
          expect(
            await frameHandle.evaluate(
              (element, selector) =>
                element.isConnected &&
                document.querySelectorAll(selector).length === 1 &&
                document.querySelector(selector) === element,
              scopeSelector,
            ),
          ).toBe(true);
        } catch (error) {
          failure = failureOf(error);
          evidence['failure'] = error instanceof Error ? error.message : String(error);
        } finally {
          try {
            await frameHandle?.dispose();
          } catch (error) {
            evidence['handleError'] = String(error);
            failure ??= failureOf(error);
          }
          try {
            await context.close();
            evidence['contextClosed'] = true;
          } catch (error) {
            evidence['contextCloseError'] = String(error);
            failure ??= failureOf(error);
          }
          try {
            evidence['sourceEnd'] = hashSources(files);
            expect(evidence['sourceEnd']).toEqual(evidence['sourceStart']);
          } catch (error) {
            evidence['sourceError'] = String(error);
            failure ??= failureOf(error);
          }
          try {
            await testInfo.attach('console-regression.json', {
              body: Buffer.from(JSON.stringify(evidence)),
              contentType: 'application/json',
            });
          } catch (error) {
            failure ??= failureOf(error);
          }
        }
        if (failure) throw failure;
      });
    }
