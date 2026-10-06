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
import { measurePublicFontProof, settlePublicPage } from './lib/public-page-readiness';
import { scanPublicTypography } from './lib/public-typography';
import { evaluatePublicTextContrast } from './lib/public-text-contrast';

const repositoryRoot = path.resolve(__dirname, '../../..');
const sourcePaths = [
  'apps/web/app/dev/layout.tsx',
  'apps/web/app/dev/review/web/page.tsx',
  'apps/web/app/dev/review/web/web-reference.css',
  'apps/web/app/globals.css',
  'apps/web/app/layout.tsx',
  'apps/web/app/web/page.tsx',
  'apps/web/e2e/lib/public-page-readiness.ts',
  'apps/web/e2e/lib/public-typography.ts',
  'apps/web/e2e/lib/public-text-contrast.ts',
  'apps/web/features/marketing/components/DeviceMockups.tsx',
  'apps/web/features/marketing/components/FeatureScenes.tsx',
  'apps/web/features/marketing/components/MarketingFooter.tsx',
  'apps/web/features/marketing/components/SurfaceSections.tsx',
  'apps/web/features/marketing/components/agent-mockup-responsive.css',
  'apps/web/features/marketing/components/artifact-mockup-responsive.css',
  'apps/web/features/marketing/components/composer-mockup-responsive.css',
  'apps/web/features/marketing/components/console-mockup-responsive.css',
  'apps/web/features/marketing/components/desktop-chrome-mockup-responsive.css',
  'apps/web/features/marketing/components/editor-mockup-responsive.css',
  'apps/web/features/marketing/components/legacy-landing.css',
  'apps/web/features/marketing/components/legacy-pages.css',
  'apps/web/features/marketing/components/memory-mockup-responsive.css',
  'apps/web/features/marketing/components/mockup-responsive.css',
  'apps/web/features/marketing/components/project-mockup-responsive.css',
  'apps/web/features/marketing/components/research-mockup-responsive.css',
  'apps/web/features/marketing/components/system/ActiveNavLink.tsx',
  'apps/web/features/marketing/components/system/Bento.tsx',
  'apps/web/features/marketing/components/system/Button.tsx',
  'apps/web/features/marketing/components/system/Container.tsx',
  'apps/web/features/marketing/components/system/Eyebrow.tsx',
  'apps/web/features/marketing/components/system/HeaderScrollState.tsx',
  'apps/web/features/marketing/components/system/MarketingHeader.tsx',
  'apps/web/features/marketing/components/system/MarketingMobileNav.tsx',
  'apps/web/features/marketing/components/system/NavGroup.tsx',
  'apps/web/features/marketing/components/system/Prose.tsx',
  'apps/web/features/marketing/components/system/Section.tsx',
  'apps/web/features/marketing/components/system/Stack.tsx',
  'apps/web/features/marketing/components/system/StatBand.tsx',
  'apps/web/features/marketing/components/system/SurfaceStatus.tsx',
  'apps/web/features/marketing/components/system/ThemeToggle.tsx',
  'apps/web/features/marketing/components/system/index.ts',
  'apps/web/features/marketing/components/system/nav.ts',
  'apps/web/features/marketing/components/system/page-header.css',
  'apps/web/features/marketing/components/system/public-reference.css',
  'apps/web/features/marketing/components/system/system.css',
  'apps/web/shared/components/CookieConsent.tsx',
  'apps/web/shared/components/ThemeConstants.ts',
  'apps/web/shared/components/ThemeProvider.tsx',
  'apps/web/shared/components/layout/Header.tsx',
  'apps/web/shared/lib/cookie-consent.ts',
  'packages/ui/design-tokens/src/foundation.css',
  'packages/ui/design-tokens/src/tailwind.css',
  'packages/ui/ui/src/primitives/Sheet.tsx',
] as const;
const reference = '/dev/review/web';
const rootSelector = '[data-design="agi"]:has(> main#main-content)';
const widths = [320, 390, 1440] as const;
const fonts = [{ cssVariable: '--font-geist-sans' }, { cssVariable: '--font-geist-mono' }];

test.describe.configure({ retries: 0 });
test.setTimeout(120_000);

function sourceSnapshot() {
  return Object.fromEntries(
    sourcePaths.map((sourcePath) => {
      const bytes = readFileSync(path.join(repositoryRoot, sourcePath));
      return [
        sourcePath,
        {
          sha256: createHash('sha256').update(bytes).digest('hex'),
          bytes: bytes.length,
          text: bytes.toString('utf8'),
        },
      ];
    }),
  );
}

function paletteContract(source: ReturnType<typeof sourceSnapshot>, theme: 'light' | 'dark') {
  const css = source['apps/web/app/dev/review/web/web-reference.css']!.text;
  const selector = "body:has([data-public-reference='web-neutral']) [data-design='agi']";
  expect(css.trim().startsWith(selector + ' {')).toBe(true);
  expect(css.trim().endsWith('}')).toBe(true);
  const body = css.slice(css.indexOf('{') + 1, css.lastIndexOf('}'));
  const declaration = /\s*(--(?:agi|public)-[\w-]+):\s*var\((--public-[\w-]+)\);/gu;
  const aliases = [...body.matchAll(declaration)].map((match) => ({
    property: match[1]!,
    target: match[2]!,
  }));
  expect(aliases.length).toBeGreaterThan(0);
  expect(new Set(aliases.map(({ property }) => property)).size).toBe(aliases.length);
  expect(body.replace(declaration, '').trim()).toBe('');
  const owner = source['packages/ui/design-tokens/src/tailwind.css']!.text;
  const block = (marker: string) => {
    const start = owner.indexOf(marker);
    expect(start, marker).toBeGreaterThanOrEqual(0);
    const open = owner.indexOf('{', start + marker.length - 1);
    const close = owner.indexOf('}', open);
    expect(open).toBeGreaterThanOrEqual(0);
    expect(close).toBeGreaterThan(open);
    return Object.fromEntries(
      [...owner.slice(open + 1, close).matchAll(/(--public-[\w-]+):\s*([^;]+);/gu)].map((match) => [
        match[1]!,
        match[2]!.trim(),
      ]),
    );
  };
  const declared = {
    ...block("body:has([data-design='agi'][data-public-reference]) {"),
    ...(theme === 'light'
      ? block("html[data-theme='light'] body:has([data-design='agi'][data-public-reference]) {")
      : {}),
  };
  for (const { target } of aliases) expect(declared[target], target).toBeTruthy();
  return { aliases, declared };
}

async function themeProof(page: Page, theme: 'light' | 'dark') {
  const result = await page.evaluate(() => ({
    marker: document.documentElement.dataset['theme'],
    light: document.documentElement.classList.contains('light'),
    dark: document.documentElement.classList.contains('dark'),
    scheme: getComputedStyle(document.documentElement).colorScheme,
    prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
  }));
  expect(result).toEqual({
    marker: theme,
    light: theme === 'light',
    dark: theme === 'dark',
    scheme: theme,
    prefersDark: theme === 'dark',
  });
  return result;
}

async function necessaryOnly(page: Page) {
  const banner = page.getByRole('region', { name: 'Cookie consent', exact: true });
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Necessary only', exact: true }).click();
  await expect(banner).toHaveCount(0);
  const consent = parseCookieConsentRecord(
    await page.evaluate((key) => localStorage.getItem(key), COOKIE_CONSENT_STORAGE_KEY),
  );
  expect(isCookieConsentCurrent(consent)).toBe(true);
  expect({ necessary: consent?.necessary, analytics: consent?.analytics }).toEqual(
    NECESSARY_ONLY_PREFERENCES,
  );
  return consent;
}

async function appearance(page: Page, aliases: { property: string; target: string }[]) {
  return page.locator(rootSelector).evaluate((root, entries) => {
    const css = getComputedStyle(root);
    const value = (property: string) => css.getPropertyValue(property).trim();
    const select = (selector: string) => {
      const elements = root.querySelectorAll(selector);
      if (elements.length !== 1) throw new Error('Palette target must have one owner: ' + selector);
      return getComputedStyle(elements[0]!);
    };
    const primary = select('.agi-fl-hero .agi-fl-cta--primary');
    const secondary = select('.agi-fl-hero .agi-fl-cta--secondary');
    const body = getComputedStyle(document.body);
    const publicProperties = [...new Set(entries.map(({ target }) => target))];
    return {
      aliases: Object.fromEntries(entries.map(({ property }) => [property, value(property)])),
      public: Object.fromEntries(publicProperties.map((property) => [property, value(property)])),
      body: Object.fromEntries(
        ['--background', '--foreground', ...publicProperties].map((property) => [
          property,
          body.getPropertyValue(property).trim(),
        ]),
      ),
      paints: {
        rootBackground: css.backgroundColor,
        rootInk: css.color,
        heading: select('#agi-web-status-title').color,
        prose: select('#numbers .agi-ds-prose').color,
        eyebrow: select('.agi-fl-hero .agi-fl-eyebrow').color,
        primaryBackground: primary.backgroundColor,
        primaryInk: primary.color,
        secondaryBackground: secondary.backgroundColor,
        secondaryInk: secondary.color,
        insideBackground: select('#inside').backgroundColor,
      },
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  }, aliases);
}

async function assertPalette(scope: Locator, contract: ReturnType<typeof paletteContract>) {
  const result = await scope.evaluate((root, { aliases, declared }) => {
    const css = getComputedStyle(root);
    const value = (property: string) => css.getPropertyValue(property).trim();
    const expected = (property: string, visited: string[] = []): string => {
      if (visited.includes(property) || visited.length > Object.keys(declared).length)
        throw new Error('Cyclic palette owner declaration: ' + property);
      const expression = declared[property];
      if (!expression) throw new Error('Missing palette owner declaration: ' + property);
      const variable = /^var\((--[\w-]+)\)$/u.exec(expression);
      if (!variable) {
        if (!CSS.supports('color', expression))
          throw new Error('Unsupported source palette colour: ' + property);
        return expression;
      }
      const target = variable[1]!;
      if (target.startsWith('--public-')) return expected(target, [...visited, property]);
      const primitive = value(target);
      if (!primitive || !CSS.supports('color', primitive))
        throw new Error('Missing source palette primitive: ' + target);
      return primitive;
    };
    return aliases.map(({ property, target }) => ({
      property,
      target,
      actual: value(property),
      public: value(target),
      expected: expected(target),
    }));
  }, contract);
  for (const entry of result) {
    expect(entry.actual, entry.property).not.toBe('');
    expect(entry.actual, entry.property).toBe(entry.public);
    expect(entry.public, entry.target).toBe(entry.expected);
  }
  return result;
}

async function expectedPaints(scope: Locator, properties: string[]) {
  return scope.evaluate((root, entries) => {
    const css = getComputedStyle(root);
    return Object.fromEntries(
      entries.map((property) => {
        const value = css.getPropertyValue(property).trim();
        if (!value || !CSS.supports('color', value))
          throw new Error('Missing palette paint value: ' + property);
        const resolver = document.createElement('span');
        resolver.style.color = value;
        root.appendChild(resolver);
        try {
          return [property, getComputedStyle(resolver).color];
        } finally {
          resolver.remove();
        }
      }),
    );
  }, properties);
}

async function content(page: Page) {
  return page.getByRole('main').evaluate((main) => ({
    text: main.textContent,
    links: [...main.querySelectorAll('a')].map((link) => ({
      href: link.getAttribute('href'),
      text: link.textContent,
    })),
    figures: [...main.querySelectorAll('figure')].map((figure) => ({
      device: figure.getAttribute('data-device'),
      geometry: figure.getAttribute('data-geometry'),
      label: figure.getAttribute('aria-label'),
      text: figure.textContent,
    })),
  }));
}

async function typography(
  page: Page,
  scope: Locator,
  name: string,
  pathname: string,
  cssVariable: string | readonly string[],
  floor = 14,
) {
  await expect(scope).toHaveCount(1);
  await scope.scrollIntoViewIfNeeded();
  await expect(scope).toBeVisible();
  await scope.evaluate((element, value) => {
    if (element.hasAttribute('data-public-audit-scope'))
      throw new Error('Existing palette audit scope');
    element.setAttribute('data-public-audit-scope', value);
  }, name);
  try {
    const requestedFonts = (typeof cssVariable === 'string' ? [cssVariable] : cssVariable).map(
      (variable) => ({ cssVariable: variable }),
    );
    const font = await measurePublicFontProof(page, scope, requestedFonts);
    const report = await page.evaluate(scanPublicTypography, {
      pageType: 'marketing' as const,
      pathname,
      scopeSelector: '[data-public-audit-scope="' + name + '"]',
    });
    expect(font.fontCoverageGaps).toEqual([]);
    expect(font.expectedFontProof).toHaveLength(requestedFonts.length);
    for (const proof of font.expectedFontProof) {
      expect(proof.family).not.toBe('');
      expect(proof.usedTextNodes).toBeGreaterThan(0);
      expect(proof.requests).toBeGreaterThan(0);
      expect(proof.matchedRequests).toBe(proof.requests);
    }
    expect(report.findings).toEqual([]);
    expect(report.unmeasured).toEqual([]);
    expect(report.excluded).toEqual([]);
    expect(report.coverage.textNodes).toBeGreaterThan(0);
    expect(report.coverage.paintedTextNodes).toBe(report.coverage.textNodes);
    expect(report.samples.filter(({ kind }) => kind === 'text')).toHaveLength(
      report.coverage.textNodes,
    );
    for (const sample of report.samples) {
      expect(sample.renderedSize).not.toBeNull();
      expect(sample.renderedSize!).toBeGreaterThanOrEqual(sample.mono ? 15 : floor);
    }
    return { font, report };
  } finally {
    await scope.evaluate((element) => element.removeAttribute('data-public-audit-scope'));
  }
}

async function currentWebReady(page: Page, aliases: { property: string; target: string }[]) {
  await expect(page).toHaveURL((url) => url.pathname === '/web' && url.search === '');
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'What is live today.', exact: true }),
  ).toBeVisible();
  await expect(page.locator(rootSelector)).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  const observations = [];
  for (let index = 0; index < 16; index += 1) {
    observations.push({
      appearance: await appearance(page, aliases),
      state: await page.evaluate(() => ({
        fonts: document.fonts.status,
        active: document
          .getAnimations()
          .filter(
            (animation) => animation.pending || ['running', 'paused'].includes(animation.playState),
          ).length,
      })),
    });
    await page.waitForTimeout(250);
  }
  const final = observations.at(-1)!;
  expect(final.state).toEqual({ fonts: 'loaded', active: 0 });
  expect(
    observations.slice(-3).every((entry) => JSON.stringify(entry) === JSON.stringify(final)),
  ).toBe(true);
  return observations;
}

async function stylesheetEvidence(page: Page) {
  return page.evaluate(() =>
    [...document.styleSheets].map((sheet) => {
      const rules = [...sheet.cssRules].map((rule) => rule.cssText);
      return {
        href: sheet.href,
        hasWebReferenceRule: rules.some((rule) => rule.includes('web-neutral')),
      };
    }),
  );
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const state = () =>
    page.evaluate(() => {
      const frames = document.querySelectorAll('.agi-fl-hero figure[data-device="web"]');
      if (frames.length !== 1)
        throw new Error('Viewport observation needs one actual Web hero frame');
      const frame = frames[0]!;
      const box = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      const header = document.querySelector('header.agi-ds-header');
      const table = frame.querySelector('.agi-web-table-region');
      if (!header || !table) throw new Error('Viewport observation owner is missing');
      return {
        scroll: { x: scrollX, y: scrollY },
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        document: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        },
        frame: { rect: box(frame), text: frame.textContent },
        header: box(header),
        table: { rect: box(table), scrollLeft: table.scrollLeft, scrollTop: table.scrollTop },
        fonts: document.fonts.status,
      };
    });
  const before = await state();
  expect(before.fonts).toBe('loaded');
  expect(before.document.width).toBeLessThanOrEqual(before.viewport.width);
  expect(before.frame.rect.x).toBeGreaterThanOrEqual(0);
  expect(before.frame.rect.x + before.frame.rect.width).toBeLessThanOrEqual(before.viewport.width);
  const bytes = await page.screenshot({
    fullPage: false,
    scale: 'css',
    animations: 'allow',
    caret: 'initial',
  });
  const after = await state();
  expect(after).toEqual(before);
  await testInfo.attach(name + '-viewport-observation.png', {
    body: bytes,
    contentType: 'image/png',
  });
  return {
    before,
    after,
    png: { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length },
    limit:
      'Native viewport observation at recorded scroll state; no whole-frame strip coverage certification.',
  };
}

async function tableReachability(page: Page, frame: Locator, testInfo: TestInfo, outline: string) {
  const region = frame.getByRole('region', {
    name: 'Example comparison of EU AI Act duties',
    exact: true,
  });
  await expect(region).toHaveCount(1);
  await expect(region).toHaveAttribute('tabindex', '0');
  await expect(region.getByRole('table', { name: 'EU AI Act duties', exact: true })).toHaveCount(1);
  await region.scrollIntoViewIfNeeded();
  await expect(region).toBeVisible();
  const entry = await region.evaluate((element) => {
    const candidates = [
      ...document.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]'),
    ].filter((candidate) => {
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
      throw new Error('Unexpected positive-tabindex native order');
    const index = candidates.indexOf(element as HTMLElement);
    const previous = candidates[index - 1];
    if (index < 1 || !previous) throw new Error('Missing observed preceding native Tab stop');
    previous.focus({ preventScroll: true });
    if (document.activeElement !== previous) throw new Error('Preceding Tab stop did not focus');
    return {
      tag: previous.localName,
      label: previous.getAttribute('aria-label') ?? previous.textContent,
    };
  });
  await page.keyboard.press('Tab');
  await expect(region).toBeFocused();
  const focus = await region.evaluate((element) => {
    const css = getComputedStyle(element);
    return {
      focusVisible: element.matches(':focus-visible'),
      outlineStyle: css.outlineStyle,
      outlineWidth: Number.parseFloat(css.outlineWidth),
      outlineColor: css.outlineColor,
      maximum: element.scrollWidth - element.clientWidth,
      start: element.scrollLeft,
      overflowX: css.overflowX,
      hiddenAncestor: element.closest('[hidden],[inert],[aria-hidden="true"]')?.localName ?? null,
    };
  });
  expect(focus.focusVisible).toBe(true);
  expect(focus.hiddenAncestor).toBeNull();
  expect(focus.outlineStyle).not.toBe('none');
  expect(focus.outlineWidth).toBeGreaterThan(0);
  expect(focus.outlineColor).toBe(outline);
  const left = await capture(page, testInfo, 'web-reference-table-left');
  let right: Awaited<ReturnType<typeof capture>> | undefined;
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
    const edges = await region.evaluate((element) => {
      const table = element.querySelector('table');
      if (!table) throw new Error('Comparison table disappeared');
      const rect = element.getBoundingClientRect();
      return {
        right: table.getBoundingClientRect().right,
        portRight: rect.left + element.clientLeft + element.clientWidth,
      };
    });
    expect(edges.right).toBeLessThanOrEqual(edges.portRight + 1);
    await expect(region).toBeFocused();
    right = await capture(page, testInfo, 'web-reference-table-right');
    for (let index = 0; index < 20; index += 1) await page.keyboard.press('ArrowLeft');
    await expect
      .poll(() => region.evaluate((element) => element.scrollLeft))
      .toBeLessThanOrEqual(1);
  }
  await expect(region).toBeFocused();
  return {
    entry,
    focus,
    left,
    right,
    finalScroll: await region.evaluate((element) => element.scrollLeft),
  };
}

for (const width of widths) {
  for (const theme of ['light', 'dark'] as const) {
    test('web-reference-' + width + '-' + theme, async ({ browser }, testInfo) => {
      const baseURL = testInfo.project.use.baseURL;
      if (typeof baseURL !== 'string')
        throw new Error('Web palette proof requires configured baseURL');
      const contexts = [];
      const evidence: Record<string, unknown> = { width, theme };
      const pageErrors: string[] = [];
      let sourceStart: ReturnType<typeof sourceSnapshot> | undefined;
      try {
        sourceStart = sourceSnapshot();
        evidence['sourceStart'] = sourceStart;
        const contract = paletteContract(sourceStart, theme);
        const options = {
          baseURL,
          viewport: { width, height: 900 },
          colorScheme: theme,
          reducedMotion: 'reduce' as const,
          storageState: { cookies: [], origins: [] },
        };
        const baselineContext = await browser.newContext(options);
        contexts.push(baselineContext);
        const baselinePage = await baselineContext.newPage();
        baselinePage.on('pageerror', (error) => pageErrors.push(error.message));
        evidence['baselineReadiness'] = await settlePublicPage(
          baselinePage,
          {
            path: '/web',
            expectedHttpStatuses: [200],
            expectedFinalPath: '/web',
            expectedOrigin: new URL(baseURL).origin,
            expectedQuery: '',
          },
          { expectedFonts: fonts },
        );
        evidence['baselineConsent'] = await necessaryOnly(baselinePage);
        evidence['baselineTheme'] = await themeProof(baselinePage, theme);
        await expect(baselinePage.locator('[data-public-reference]')).toHaveCount(0);
        const baseline = await appearance(baselinePage, contract.aliases);
        const baselineContent = await content(baselinePage);
        expect(baselineContent.figures.length).toBeGreaterThan(0);
        evidence['baseline'] = { appearance: baseline, content: baselineContent };
        await baselineContext.close();
        contexts.pop();

        const context = await browser.newContext(options);
        contexts.push(context);
        const page = await context.newPage();
        page.on('pageerror', (error) => pageErrors.push(error.message));
        evidence['referenceReadiness'] = await settlePublicPage(
          page,
          {
            path: reference,
            expectedHttpStatuses: [200],
            expectedFinalPath: reference,
            expectedOrigin: new URL(baseURL).origin,
            expectedQuery: '',
          },
          { expectedFonts: fonts },
        );
        evidence['referenceConsent'] = await necessaryOnly(page);
        evidence['referenceTheme'] = await themeProof(page, theme);
        const marker = page.locator('[data-public-reference="web-neutral"]');
        await expect(marker).toHaveCount(1);
        await expect(marker).toHaveAttribute('data-design', 'agi');
        const root = page.locator(rootSelector);
        await expect(root).toHaveCount(1);
        expect(await content(page)).toEqual(baselineContent);
        const before = await appearance(page, contract.aliases);
        const palette = await assertPalette(root, contract);
        const paints = await expectedPaints(root, [
          '--public-surface-page',
          '--public-ink',
          '--public-ink-secondary',
          '--public-accent',
          '--public-action-fill',
          '--public-action-ink',
          '--public-surface-subtle',
        ]);
        expect(before.paints).toEqual({
          rootBackground: paints['--public-surface-page'],
          rootInk: paints['--public-ink'],
          heading: paints['--public-ink'],
          prose: paints['--public-ink-secondary'],
          eyebrow: paints['--public-accent'],
          primaryBackground: paints['--public-action-fill'],
          primaryInk: paints['--public-action-ink'],
          secondaryBackground: paints['--public-surface-subtle'],
          secondaryInk: paints['--public-ink'],
          insideBackground: paints['--public-surface-subtle'],
        });
        expect(before.documentOverflow).toBeLessThanOrEqual(0);
        const prose = page
          .getByRole('region', { name: 'AGI Web in numbers', exact: true })
          .locator('.agi-ds-prose');
        evidence['beforeTypography'] = await typography(
          page,
          prose,
          'web-reference-prose-' + width + '-' + theme,
          reference,
          '--font-geist-sans',
          17,
        );
        evidence['eyebrowTypography'] = await typography(
          page,
          root.locator('.agi-fl-hero .agi-fl-eyebrow'),
          'web-reference-eyebrow-' + width + '-' + theme,
          reference,
          '--font-geist-mono',
        );
        const frame = page.getByRole('main').locator('.agi-fl-hero figure[data-device="web"]');
        await expect(frame).toHaveCount(1);
        await expect(frame).toHaveAttribute('aria-label', 'The AGI Web chat interface');
        evidence['frameFontBefore'] = await measurePublicFontProof(page, frame, fonts);
        await frame.locator('.agi-dev-bar').scrollIntoViewIfNeeded();
        evidence['frameStartViewport'] = await capture(page, testInfo, 'web-reference-frame-start');
        evidence['tableReachability'] = await tableReachability(
          page,
          frame,
          testInfo,
          paints['--public-accent']!,
        );
        await frame.locator('.agi-mk-composer').scrollIntoViewIfNeeded();
        evidence['frameEndViewport'] = await capture(page, testInfo, 'web-reference-frame-end');
        const frameFontAfter = await measurePublicFontProof(page, frame, fonts);
        expect(frameFontAfter).toEqual(evidence['frameFontBefore']);
        evidence['frameFontAfter'] = frameFontAfter;
        evidence['afterTypography'] = await typography(
          page,
          prose,
          'web-reference-prose-after-' + width + '-' + theme,
          reference,
          '--font-geist-sans',
          17,
        );
        const after = await appearance(page, contract.aliases);
        expect(after).toEqual(before);
        evidence['reference'] = {
          before,
          after,
          palette,
          paints,
          stylesheets: await stylesheetEvidence(page),
        };
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        const header = page.getByRole('banner');
        await expect(header).toHaveCount(1);
        if (width < 768) {
          const trigger = header.getByRole('button', { name: 'Menu', exact: true });
          await trigger.click();
          const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
          await expect(menu).toHaveCount(1);
          await expect(menu).toBeVisible();
          await expect(menu).toHaveAttribute('data-design', 'agi');
          expect(
            await menu.evaluate(
              (element) => element.closest('[data-public-reference="web-neutral"]') === null,
            ),
          ).toBe(true);
          const menuPaletteBefore = await assertPalette(menu, contract);
          const menuPaints = await menu.evaluate((element) => {
            const css = getComputedStyle(element);
            const title = element.querySelector('.agi-ds-mobile-nav-title');
            if (!title) throw new Error('Missing actual mobile menu title');
            return { background: css.backgroundColor, title: getComputedStyle(title).color };
          });
          expect(menuPaints).toEqual({
            background: paints['--public-surface-page'],
            title: paints['--public-ink-secondary'],
          });
          const link = menu.getByRole('link', { name: 'AGI Web', exact: true });
          await expect(link).toHaveCount(1);
          await expect(link).toHaveAttribute('href', '/web');
          await expect(link).toBeVisible();
          evidence['menuTitleTypography'] = await typography(
            page,
            menu.getByRole('heading', { name: 'Menu', exact: true }),
            'web-reference-menu-title-' + width + '-' + theme,
            reference,
            '--font-geist-sans',
            16,
          );
          evidence['menuLinkTypography'] = await typography(
            page,
            link,
            'web-reference-menu-link-' + width + '-' + theme,
            reference,
            '--font-geist-sans',
            16,
          );
          evidence['menuViewport'] = await capture(page, testInfo, 'web-reference-menu');
          const menuPaletteAfter = await assertPalette(menu, contract);
          expect(menuPaletteAfter).toEqual(menuPaletteBefore);
          evidence['menu'] = {
            before: menuPaletteBefore,
            after: menuPaletteAfter,
            paints: menuPaints,
          };
          await page.keyboard.press('Escape');
          await expect(menu).toHaveCount(0);
          await expect(trigger).toBeFocused();
          await trigger.click();
          await expect(menu).toBeVisible();
          await menu.getByRole('link', { name: 'AGI Web', exact: true }).click();
        } else {
          const primary = header.getByRole('navigation', { name: 'Primary', exact: true });
          const group = primary.locator('.agi-ds-navgroup').filter({
            has: page.getByRole('button', { name: 'Product', exact: true }),
          });
          await expect(group).toHaveCount(1);
          const trigger = group.getByRole('button', { name: 'Product', exact: true });
          await trigger.focus();
          await trigger.press('Space');
          await expect(trigger).toHaveAttribute('aria-expanded', 'true');
          const panel = group.locator('.agi-ds-navpanel');
          await expect(panel).toHaveCount(1);
          await expect(panel).toBeVisible();
          const panelIndex = await panel.evaluate((element) =>
            [...document.querySelectorAll('*')].indexOf(element),
          );
          const descriptions = await panel.locator('.agi-ds-navpanel-desc').allTextContents();
          expect(descriptions.length).toBeGreaterThan(0);
          const panelTypography = await typography(
            page,
            panel,
            'web-reference-product-panel-' + width + '-' + theme,
            reference,
            ['--font-geist-sans', '--font-geist-mono'],
            16,
          );
          expect(panelTypography.report.scope?.elementIndex).toBe(panelIndex);
          const descriptionSamples = panelTypography.report.samples.filter(
            (sample) => sample.selector === 'span.agi-ds-navpanel-desc',
          );
          expect(descriptionSamples.map(({ text }) => text)).toEqual(descriptions);
          for (const description of descriptionSamples) {
            expect(description.mono).toBe(false);
            expect(description.renderedSize).not.toBeNull();
            expect(description.renderedSize!).toBeGreaterThanOrEqual(17);
          }
          const canvas = panelTypography.report.canvasColor;
          if (!canvas) throw new Error('Product menu has no canonical opaque canvas');
          const panelContrast = evaluatePublicTextContrast(panelTypography.report.samples, canvas);
          expect(panelContrast.findings).toEqual([]);
          expect(panelContrast.unmeasured).toEqual([]);
          expect(panelContrast.coverage.eligible).toBeGreaterThan(0);
          expect(panelContrast.coverage.measured).toBe(panelContrast.coverage.eligible);
          evidence['desktopProductMenu'] = { descriptions, panelTypography, panelContrast };
          evidence['desktopProductMenuViewport'] = await capture(
            page,
            testInfo,
            'web-reference-product-menu',
          );
          await expect(panel).toBeVisible();
          await expect(trigger).toHaveAttribute('aria-expanded', 'true');
          const link = panel.getByRole('link', { name: 'AGI Web', exact: true });
          await expect(link).toHaveAttribute('href', '/web');
          await expect(link).toBeVisible();
          await link.click();
        }
        evidence['navigationReadiness'] = await currentWebReady(page, contract.aliases);
        evidence['afterNavigationTheme'] = await themeProof(page, theme);
        await expect(page.locator('[data-public-reference]')).toHaveCount(0);
        await expect(page.getByRole('dialog')).toHaveCount(0);
        expect(new URL(page.url()).origin).toBe(new URL(baseURL).origin);
        expect(await content(page)).toEqual(baselineContent);
        const returnedBefore = await appearance(page, contract.aliases);
        expect(returnedBefore).toEqual(baseline);
        evidence['returnedTypographyBefore'] = await typography(
          page,
          page
            .getByRole('region', { name: 'AGI Web in numbers', exact: true })
            .locator('.agi-ds-prose'),
          'web-return-prose-' + width + '-' + theme,
          '/web',
          '--font-geist-sans',
          17,
        );
        evidence['returnedViewport'] = await capture(page, testInfo, 'web-after-reference');
        evidence['returnedTypographyAfter'] = await typography(
          page,
          page
            .getByRole('region', { name: 'AGI Web in numbers', exact: true })
            .locator('.agi-ds-prose'),
          'web-return-prose-after-' + width + '-' + theme,
          '/web',
          '--font-geist-sans',
          17,
        );
        const returnedAfter = await appearance(page, contract.aliases);
        expect(returnedAfter).toEqual(returnedBefore);
        evidence['returned'] = {
          before: returnedBefore,
          after: returnedAfter,
          stylesheets: await stylesheetEvidence(page),
        };
        expect(pageErrors).toEqual([]);
      } catch (error) {
        evidence['error'] = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        let finalizationError: unknown;
        try {
          evidence['sourceEnd'] = sourceSnapshot();
          expect(evidence['sourceEnd']).toEqual(sourceStart);
        } catch (error) {
          evidence['sourceEndError'] = error instanceof Error ? error.message : String(error);
          finalizationError = error;
        }
        for (const context of contexts) {
          try {
            await context.close();
          } catch (error) {
            evidence['contextCloseError'] = error instanceof Error ? error.message : String(error);
            finalizationError ??= error;
          }
        }
        evidence['pageErrors'] = pageErrors;
        await testInfo.attach('web-reference-palette.json', {
          body: Buffer.from(JSON.stringify(evidence)),
          contentType: 'application/json',
        });
        if (finalizationError) throw finalizationError;
      }
    });
  }
}
