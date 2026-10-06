import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { measurePublicFontProof, settlePublicPage } from './lib/public-page-readiness';
import { evaluatePublicTextContrast } from './lib/public-text-contrast';
import { measurePublicTypographyWithScroll } from './lib/public-typography-scroll';
import { capturePublicViewportStrips } from './lib/public-viewport-strip-capture';

const fonts = [{ cssVariable: '--font-geist-sans' }, { cssVariable: '--font-geist-mono' }];
const settings = [
  { width: 320, theme: 'dark', motion: 'reduce' },
  { width: 390, theme: 'light', motion: 'reduce' },
  { width: 1440, theme: 'dark', motion: 'no-preference' },
  { width: 1440, theme: 'light', motion: 'no-preference' },
] as const;
const routes = [
  { path: '/enterprise', code: ['Two rows of an audit export'], transcripts: [] },
  {
    path: '/api-docs',
    code: [
      'One chat completion against the gateway',
      'Which credential each endpoint takes',
      "OpenAI's official libraries against the gateway",
      'AGI endpoints over plain HTTP',
      'Receiving and verifying an event',
    ],
    transcripts: [],
  },
  {
    path: '/providers',
    code: ['How each surface reads the catalog', 'A model swap and a refused move'],
    transcripts: [],
  },
  { path: '/get-started', code: [], transcripts: ['Three commands that reach a working chat'] },
  { path: '/local', code: [], transcripts: ['Pointing AGI at a local model server'] },
  {
    path: '/customers',
    code: [],
    transcripts: ['Two commands quoted from the scenarios on this page'],
  },
  { path: '/features/plugins', code: [], transcripts: ['A plugin install in the AGI CLI'] },
  { path: '/download', code: [], transcripts: ['Example output from verifying a CLI archive'] },
  { path: '/', code: [], transcripts: [] },
] as const;
const root = path.resolve(__dirname, '../../..');
const sourceOwners = [
  'apps/web/app/layout.tsx',
  'apps/web/app/globals.css',
  'apps/web/features/marketing/components/system/CodeTabs.tsx',
  'apps/web/features/marketing/components/system/Transcript.tsx',
  'apps/web/features/marketing/components/code-example-responsive.css',
  'apps/web/features/marketing/components/ShowcaseScenes.tsx',
  'apps/web/features/marketing/components/showcase-mockup-responsive.css',
  'apps/web/features/marketing/components/MarketingLanding.tsx',
  'apps/web/features/marketing/components/FlagshipSections.tsx',
  'apps/web/features/marketing/components/Reveal.tsx',
  'apps/web/features/marketing/components/motion/Stage.tsx',
  'apps/web/features/marketing/components/motion/motionPreferences.ts',
  'apps/web/features/marketing/components/motion/motion.css',
  'apps/web/features/marketing/components/legacy-pages.css',
  'apps/web/features/marketing/components/legacy-landing.css',
  'apps/web/features/marketing/components/system/index.ts',
  'apps/web/features/marketing/components/system/system.css',
  'apps/web/features/marketing/components/system/page-header.css',
  'apps/web/features/marketing/components/system/public-reference.css',
  'apps/web/features/marketing/components/system/SplitFeature.tsx',
  'apps/web/features/marketing/components/pages/surfaces/shared.tsx',
  'packages/ui/design-tokens/src/tailwind.css',
  'packages/ui/design-tokens/src/foundation.css',
  'packages/ui/ui/src/primitives/useTablistKeyboard.ts',
  'apps/web/e2e/lib/public-page-readiness.ts',
  'apps/web/e2e/lib/public-typography.ts',
  'apps/web/e2e/lib/public-typography-scroll.ts',
  'apps/web/e2e/lib/public-text-contrast.ts',
  'apps/web/e2e/lib/public-viewport-strip-capture.ts',
  'apps/web/shared/components/seo/theme-init-script.ts',
  'apps/web/shared/components/CookieConsent.tsx',
  'apps/web/shared/lib/cookie-consent.ts',
];
const firstFamily = (value: string) =>
  (value.split(',')[0] ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .toLowerCase();

test.describe.configure({ retries: 0 });
test.setTimeout(180_000);

async function frameState(frame: Locator) {
  return frame.evaluate((root) => {
    const rect = root.getBoundingClientRect();
    const masks = [];
    for (let owner: Element | null = root; owner; owner = owner.parentElement) {
      const css = getComputedStyle(owner);
      if (
        css.maskImage !== 'none' ||
        !['', 'none'].includes(css.getPropertyValue('-webkit-mask-image'))
      )
        masks.push(owner.localName);
    }
    const stage = root.closest('.agi-mx-stage');
    const body = stage?.querySelector(':scope > .agi-mx-body');
    return {
      index: [...document.querySelectorAll('*')].indexOf(root),
      connected: root.isConnected,
      box: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
      masks,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      stage:
        stage && body
          ? {
              perspective: getComputedStyle(stage).perspective,
              transform: getComputedStyle(body).transform,
            }
          : null,
    };
  });
}

async function proveText(page: Page, frame: Locator, selector: string, pathname: string) {
  await expect(frame).toHaveCount(1);
  const before = await frameState(frame);
  expect(before.connected).toBe(true);
  expect(before.overflow).toBeLessThanOrEqual(0);
  expect(before.masks).toEqual([]);
  expect(before.box.width).toBeGreaterThan(0);
  expect(before.box.height).toBeGreaterThan(0);
  const report = await measurePublicTypographyWithScroll(page, {
    pageType: 'marketing',
    pathname,
    scopeSelector: selector,
  });
  expect(report.scope?.selector).toBe(selector);
  expect(report.scope?.elementIndex).toBe(before.index);
  expect(report.findings).toEqual([]);
  expect(report.unmeasured).toEqual([]);
  expect(report.excluded).toEqual([]);
  expect(report.coverage.textNodes).toBeGreaterThan(0);
  expect(report.scrollProof.planComplete).toBe(true);
  expect(report.scrollProof.restored).toBe(true);
  expect(report.scrollProof.restorationFailures).toEqual([]);
  expect(report.scrollProof.sources.every((source) => source.complete)).toBe(true);
  const families = await page.evaluate(() => {
    const css = getComputedStyle(document.body);
    return ['--font-geist-sans', '--font-geist-mono'].map(
      (name) =>
        css.getPropertyValue(name) ||
        getComputedStyle(document.documentElement).getPropertyValue(name),
    );
  });
  const allowed = families.map(firstFamily);
  expect(allowed.every(Boolean)).toBe(true);
  expect(new Set(allowed).size).toBe(2);
  for (const sample of report.samples) {
    expect(allowed).toContain(firstFamily(sample.fontFamily));
    expect(sample.renderedSize).not.toBeNull();
    expect(sample.renderedSize!).toBeGreaterThanOrEqual(sample.mono ? 15 : 16);
    expect(sample.rects.length).toBeGreaterThan(0);
  }
  for (const state of report.scrollProof.states) {
    expect(state.domStable).toBe(true);
    expect(state.window).toEqual(report.scrollProof.initialWindow);
    for (const sample of state.report.samples) {
      const source = state.report.scrollCoverage.find(
        (entry) => entry.sourceKey === sample.sourceKey,
      );
      const ports = (source?.containerKeys ?? []).map((key) => {
        const port = state.report.scrollContainers.find((entry) => entry.key === key);
        if (!port) throw new Error('Measured source lost its state-owned scroll viewport');
        return port.viewport;
      });
      if (!sample.rects.length) {
        expect(source).toBeDefined();
        expect(
          report.scrollProof.sources.find((entry) => entry.sourceKey === sample.sourceKey)
            ?.complete,
        ).toBe(true);
      }
      for (const box of [before.box, ...ports])
        for (const rect of sample.rects) {
          expect(rect.left, sample.text).toBeGreaterThanOrEqual(box.left - 0.05);
          expect(rect.right, sample.text).toBeLessThanOrEqual(box.right + 0.05);
          expect(rect.top, sample.text).toBeGreaterThanOrEqual(box.top - 0.05);
          expect(rect.bottom, sample.text).toBeLessThanOrEqual(box.bottom + 0.05);
        }
    }
  }
  const requests = fonts.filter((_, index) =>
    report.samples.some((sample) => firstFamily(sample.fontFamily) === allowed[index]),
  );
  const font = await measurePublicFontProof(page, frame, requests);
  expect(font.fontCoverageGaps).toEqual([]);
  for (const family of font.usedFontFamilies) {
    expect(family.generic).toBe(false);
    expect(allowed).toContain(family.family);
  }
  const rawFonts = await frame.evaluate((root) => {
    const groups = new Map<string, { family: string; font: string; points: Set<number> }>();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.parentElement || !(node.textContent ?? '').trim()) continue;
      const css = getComputedStyle(node.parentElement);
      const family = (css.fontFamily.split(',')[0] ?? '')
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .toLowerCase();
      const font = `${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${JSON.stringify(family)}`;
      const group = groups.get(font) ?? { family, font, points: new Set<number>() };
      for (const character of node.textContent ?? '')
        if (!/\s/u.test(character)) group.points.add(character.codePointAt(0)!);
      groups.set(font, group);
    }
    return [...groups.values()].map((group) => ({ ...group, points: [...group.points] }));
  });
  for (const group of rawFonts) {
    const family = font.usedFontFamilies.find((entry) => entry.family === group.family);
    expect(family).toBeDefined();
    const request = family?.requests.find((entry) => entry.font === group.font);
    expect(request, group.font).toBeDefined();
    expect(
      group.points.filter((point) => !request?.codepoints.includes(point)),
      group.font,
    ).toEqual([]);
  }
  if (!report.canvasColor) throw new Error('Coded example has no canonical opaque canvas');
  const contrast = evaluatePublicTextContrast(report.samples, report.canvasColor);
  expect(contrast.findings).toEqual([]);
  expect(contrast.unmeasured).toEqual([]);
  expect(contrast.coverage.eligible).toBeGreaterThan(0);
  expect(contrast.coverage.measured).toBe(contrast.coverage.eligible);
  expect(await frameState(frame)).toEqual(before);
  return { state: before, report, font, rawFonts, contrast };
}

async function keyboardScroll(
  page: Page,
  port: Locator,
  info: TestInfo,
  name: string,
  requiresOverflow = false,
) {
  const start = await port.evaluate((root) => ({
    text: root.textContent,
    x: root.scrollLeft,
    max: root.scrollWidth - root.clientWidth,
  }));
  await expect(port).toHaveAttribute('tabindex', '0');
  expect(
    await port.evaluate((root) => root.closest('[hidden],[inert],[aria-hidden="true"]') === null),
  ).toBe(true);
  await port.focus();
  await port.press('Shift+Tab');
  await expect(port).not.toBeFocused();
  await page.keyboard.press('Tab');
  await expect(port).toBeFocused();
  if (requiresOverflow) expect(start.max).toBeGreaterThan(1);
  const positions = [start.x];
  for (const [key, target] of [
    ['ArrowRight', start.max],
    ['ArrowLeft', start.x],
  ] as const) {
    let current = await port.evaluate((root) => root.scrollLeft);
    let steps = 0;
    while (Math.abs(current - target) > 1 && steps < 256) {
      const previous = current;
      await port.press(key);
      await expect.poll(() => port.evaluate((root) => root.scrollLeft)).not.toBe(previous);
      current = await port.evaluate((root) => root.scrollLeft);
      positions.push(current);
      steps += 1;
    }
    await expect
      .poll(() => port.evaluate((root, expected) => Math.abs(root.scrollLeft - expected), target))
      .toBeLessThanOrEqual(1);
    expect(await port.textContent()).toBe(start.text);
    await info.attach(`${name}-${key}.png`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
  }
  await expect(port).toBeFocused();
  expect(await port.evaluate((root) => root.isConnected)).toBe(true);
  if (start.max > 1) expect(new Set(positions).size).toBeGreaterThan(1);
  return {
    ...start,
    overflowed: start.max > 1,
    positions,
    restored: await port.evaluate((root) => root.scrollLeft),
  };
}

async function reachCodeWithTab(page: Page, frame: Locator, port: Locator) {
  const selected = frame.getByRole('tab', { selected: true });
  await selected.focus();
  const limit = (await frame.getByRole('tab').count()) + 3;
  for (
    let step = 0;
    step < limit && !(await port.evaluate((root) => root === document.activeElement));
    step += 1
  )
    await page.keyboard.press('Tab');
  await expect(port).toBeFocused();
}

for (const route of routes)
  for (const setting of settings) {
    test(`coded-examples-${route.path === '/' ? 'home' : route.path.slice(1).replaceAll('/', '-')}-${setting.width}-${setting.theme}`, async ({
      browser,
    }, info) => {
      const baseURL = info.project.use.baseURL;
      if (typeof baseURL !== 'string') throw new Error('Coded examples need configured baseURL');
      const context = await browser.newContext({
        baseURL,
        viewport: { width: setting.width, height: 900 },
        colorScheme: setting.theme,
        reducedMotion: setting.motion,
        storageState: { cookies: [], origins: [] },
        permissions: ['clipboard-read', 'clipboard-write'],
      });
      const sourceFiles = [
        ...new Set([
          __filename,
          path.join(
            root,
            route.path === '/' ? 'apps/web/app/page.tsx' : `apps/web/app${route.path}/page.tsx`,
          ),
          ...sourceOwners.map((owner) => path.join(root, owner)),
        ]),
      ].sort();
      const pins = () =>
        Object.fromEntries(
          sourceFiles.map((file) => [
            file,
            createHash('sha256').update(readFileSync(file)).digest('hex'),
          ]),
        );
      const evidence: Record<string, unknown> = {
        path: route.path,
        ...setting,
        examples: [],
        contextClosed: false,
      };
      let failed = false;
      let failure: unknown;
      try {
        evidence['sourceStart'] = pins();
        const page = await context.newPage();
        evidence['readiness'] = await settlePublicPage(
          page,
          {
            path: route.path,
            expectedHttpStatuses: [200],
            expectedFinalPath: route.path,
            expectedOrigin: new URL(baseURL).origin,
            expectedQuery: '',
          },
          { expectedFonts: fonts },
        );
        const banner = page.getByRole('region', { name: 'Cookie consent', exact: true });
        await expect(banner).toBeVisible();
        await banner.getByRole('button', { name: 'Necessary only', exact: true }).click();
        await expect(banner).toHaveCount(0);
        await expect(page.getByRole('main')).toHaveCount(1);
        expect(
          await page.evaluate(() => ({
            theme: document.documentElement.dataset['theme'],
            scheme: getComputedStyle(document.documentElement).colorScheme,
          })),
        ).toEqual({ theme: setting.theme, scheme: setting.theme });
        await expect(page.locator('main figure.agi-ds-codetabs.agi-code-responsive')).toHaveCount(
          route.code.length,
        );
        await expect(page.locator('main pre.agi-lp-terminal.agi-code-responsive')).toHaveCount(
          route.transcripts.length,
        );
        for (const [codeIndex, label] of route.code.entries()) {
          const selector = `main figure.agi-ds-codetabs.agi-code-responsive[aria-label="${label}"]`;
          const frame = page.getByRole('main').getByRole('figure', { name: label, exact: true });
          await expect(frame).toHaveCount(1);
          await expect(frame).toHaveClass(/agi-code-responsive/);
          await frame.scrollIntoViewIfNeeded();
          const tabs = frame.getByRole('tab');
          const count = await tabs.count();
          const names = await tabs.allTextContents();
          expect(new Set(names).size).toBe(count);
          expect(count).toBeGreaterThan(0);
          await tabs.first().focus();
          await tabs.first().press('End');
          await expect(tabs.last()).toBeFocused();
          await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
          await tabs.last().press('Home');
          await expect(tabs.first()).toBeFocused();
          await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
          const panels = [];
          for (let index = 0; index < count; index += 1) {
            const selected = frame.getByRole('tab', { selected: true });
            await expect(selected).toHaveCount(1);
            await expect(selected).toHaveText(names[index]!);
            await expect(selected).toBeFocused();
            await expect(selected).toHaveAttribute('tabindex', '0');
            expect(
              await tabs.evaluateAll((items) =>
                items.map((item) => ({
                  selected: item.getAttribute('aria-selected'),
                  tabIndex: item.getAttribute('tabindex'),
                })),
              ),
            ).toEqual(
              names.map((_, position) => ({
                selected: position === index ? 'true' : 'false',
                tabIndex: position === index ? '0' : '-1',
              })),
            );
            const panel = frame.getByRole('tabpanel');
            await expect(panel).toHaveAttribute(
              'aria-labelledby',
              (await selected.getAttribute('id'))!,
            );
            await expect(selected).toHaveAttribute(
              'aria-controls',
              (await panel.getAttribute('id'))!,
            );
            const lines = await panel.locator('.agi-ds-codetabs-line').allTextContents();
            expect(lines.length).toBeGreaterThan(0);
            await frame.getByRole('button', { name: 'Copy', exact: true }).click();
            await expect(frame.getByRole('status')).toHaveText('Copied to clipboard');
            const clipboard = await page.evaluate(() => navigator.clipboard.readText());
            expect(clipboard.split('\n').map((line) => line || ' ')).toEqual(lines);
            await expect(frame.getByRole('button', { name: 'Copy', exact: true })).toBeVisible();
            for (const control of await frame.locator('button').all())
              expect(
                await control.evaluate((root) => parseFloat(getComputedStyle(root).fontSize)),
              ).toBeGreaterThanOrEqual(16);
            for (const note of await frame.locator('figcaption').all())
              expect(
                await note.evaluate((root) => parseFloat(getComputedStyle(root).fontSize)),
              ).toBeGreaterThanOrEqual(17);
            const proof = await proveText(page, frame, selector, route.path);
            await reachCodeWithTab(page, frame, panel);
            const keyboard = await keyboardScroll(page, panel, info, `code-${codeIndex}-${index}`);
            expect(await panel.locator('.agi-ds-codetabs-line').allTextContents()).toEqual(lines);
            panels.push({
              selected: await selected.textContent(),
              lines,
              clipboard,
              proof,
              keyboard,
            });
            if (index + 1 < count) {
              await selected.focus();
              await selected.press('ArrowRight');
            }
          }
          (evidence['examples'] as unknown[]).push({ label, panels });
        }
        for (const label of route.transcripts) {
          const selector = `main pre.agi-lp-terminal.agi-code-responsive[aria-label="${label}"]`;
          const frame = page.getByRole('main').getByRole('region', { name: label, exact: true });
          await expect(frame).toHaveCount(1);
          await frame.scrollIntoViewIfNeeded();
          const lines = await frame.locator('.agi-lp-terminal-line').allTextContents();
          expect(lines.length).toBeGreaterThan(0);
          const proof = await proveText(page, frame, selector, route.path);
          const keyboard = await keyboardScroll(page, frame, info, 'transcript');
          expect(await frame.locator('.agi-lp-terminal-line').allTextContents()).toEqual(lines);
          (evidence['examples'] as unknown[]).push({ label, lines, proof, keyboard });
        }
        for (const [className, label, ports] of [
          [
            'agi-dw',
            'AGI reviewing a code diff',
            ['Before TypeScript example', 'After TypeScript example'],
          ],
          ['agi-ap', 'AGI asking for tool approval', ['Command example']],
        ] as const) {
          const selector = `main figure.${className}.agi-showcase-responsive`;
          await expect(page.locator(selector)).toHaveCount(route.path === '/' ? 1 : 0);
          if (route.path !== '/') continue;
          const frame = page.getByRole('main').getByRole('figure', { name: label, exact: true });
          await frame.scrollIntoViewIfNeeded();
          expect((await frameState(frame)).stage).toEqual({
            perspective: 'none',
            transform: 'none',
          });
          if (className === 'agi-dw') {
            await expect(frame.locator('.agi-dw-file')).toHaveText('TypeScript example');
            await expect(frame.locator('.agi-dw-badge')).toHaveText('Authored example');
            await expect(frame.locator('.agi-dw-actions > span')).toHaveText(['Approve', 'Reject']);
            await expect(frame.locator('.agi-dw-line')).toHaveCount(10);
          } else {
            await expect(frame.locator('.agi-ap-chrome > span')).toHaveText([
              'Tool Approval',
              'CLI example',
            ]);
            await expect(frame.locator('.agi-ap-ask')).toHaveText('Allow this command?');
            await expect(frame.locator('.agi-ap-actions > span')).toHaveText([
              'Yes',
              'No',
              'Allow Session',
            ]);
            expect(
              await frame
                .locator('.agi-ap-ask')
                .evaluate((root) => parseFloat(getComputedStyle(root).fontSize)),
            ).toBeGreaterThanOrEqual(17);
          }
          for (const control of await frame
            .locator('.agi-dw-actions > span,.agi-ap-actions > span')
            .all())
            expect(
              await control.evaluate((root) => parseFloat(getComputedStyle(root).fontSize)),
            ).toBeGreaterThanOrEqual(16);
          const proof = await proveText(page, frame, selector, route.path);
          const keyboard = [];
          for (const portLabel of ports) {
            const port = frame.getByRole('region', { name: portLabel, exact: true });
            await expect(port).toHaveCount(1);
            await expect(port).toHaveAttribute('tabindex', '0');
            keyboard.push({
              label: portLabel,
              proof: await keyboardScroll(
                page,
                port,
                info,
                portLabel.replaceAll(' ', '-'),
                portLabel === 'Command example' && setting.width < 768,
              ),
            });
          }
          const state = await frameState(frame);
          if (setting.width === 1440) {
            await frame.hover({ position: { x: 1, y: 1 } });
            await expect
              .poll(() =>
                frame.evaluate((root) => {
                  const stage = root.closest<HTMLElement>('.agi-mx-stage');
                  if (!stage) throw new Error('Showcase native stage is missing');
                  return (
                    Math.abs(parseFloat(stage.style.getPropertyValue('--agi-mx-rx')) || 0) +
                    Math.abs(parseFloat(stage.style.getPropertyValue('--agi-mx-ry')) || 0)
                  );
                }),
              )
              .toBeGreaterThan(0);
            expect(await frameState(frame)).toEqual(state);
            await page.mouse.move(1, 1);
            await expect.poll(() => frameState(frame)).toEqual(state);
          }
          await expect
            .poll(() =>
              frame.evaluate(async (root) => {
                const stage = root.closest('.agi-mx-stage');
                const body = stage?.querySelector(':scope > .agi-mx-body');
                if (!stage || !body) throw new Error('Showcase stage is missing before capture');
                const readings: string[] = [];
                for (let count = 0; count < 3; count += 1) {
                  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                  readings.push(
                    JSON.stringify(
                      [stage, body].map((owner) => ({
                        style: owner.getAttribute('style'),
                        computed: [...getComputedStyle(owner)]
                          .sort()
                          .map((name) => [name, getComputedStyle(owner).getPropertyValue(name)]),
                      })),
                    ),
                  );
                }
                return (
                  readings.every((reading) => reading === readings[0]) &&
                  stage.getAttribute('style')?.includes('will-change') !== true
                );
              }),
            )
            .toBe(true);
          const captures = [];
          for (const part of [`.${className}-chrome`, `.${className}-foot`]) {
            const capture = await capturePublicViewportStrips(page, frame.locator(part), {
              stickyHeader: page.getByRole('banner'),
              sourceFiles,
            });
            captures.push(capture.evidence);
            for (const image of capture.images)
              await info.attach(`${className}-${part.slice(1)}-${image.index}.png`, {
                body: image.bytes,
                contentType: 'image/png',
              });
          }
          (evidence['examples'] as unknown[]).push({ label, proof, keyboard, captures });
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
        ).toBeLessThanOrEqual(0);
      } catch (error) {
        failed = true;
        failure = error;
        evidence['failure'] = String(error);
      } finally {
        try {
          evidence['sourceEnd'] = pins();
          expect(evidence['sourceEnd']).toEqual(evidence['sourceStart']);
        } catch (error) {
          evidence['sourceEndError'] = String(error);
          if (!failed) {
            failed = true;
            failure = error;
          }
        }
        try {
          await context.close();
          evidence['contextClosed'] = true;
        } catch (error) {
          evidence['contextCloseError'] = String(error);
          if (!failed) {
            failed = true;
            failure = error;
          }
        }
        try {
          await info.attach('coded-examples.json', {
            body: Buffer.from(JSON.stringify(evidence)),
            contentType: 'application/json',
          });
        } catch (error) {
          if (!failed) {
            failed = true;
            failure = error;
          }
        }
      }
      if (failed) throw failure;
    });
  }
