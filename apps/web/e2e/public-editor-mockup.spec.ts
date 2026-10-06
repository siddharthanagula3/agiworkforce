import { expect, test, type Locator } from '@playwright/test';
import { measurePublicFontProof, settlePublicPage } from './lib/public-page-readiness';
import { scanPublicTypography, type PublicTypographyReport } from './lib/public-typography';
import { measurePublicTypographyWithScroll } from './lib/public-typography-scroll';
import { capturePublicViewportStrips } from './lib/public-viewport-strip-capture';

const figure = 'figure.agi-dev.agi-editor-responsive[data-device="editor"]';
const fonts = [{ cssVariable: '--font-geist-sans' }, { cssVariable: '--font-geist-mono' }];
const widths = [320, 360, 390, 768, 1024, 1366, 1440, 1920];
const callers = [
  {
    name: 'vscode',
    path: '/vscode-extension',
    selector: `main .agi-fl-hero-frame--main ${figure}`,
    title: 'AGI · VS Code',
    badge: '@agi',
    widths,
  },
  {
    name: 'home',
    path: '/',
    selector: `main .agi-fl-surface-panel[data-state="active"] ${figure}`,
    title: 'example.ts · AGI in VS Code',
    badge: 'VS Code',
    widths: [320, 390, 1440],
  },
  {
    name: 'solutions',
    path: '/solutions',
    selector: `main .agi-ds-bento[aria-label="Solution pages"] > a[href="/agi-code"] .agi-ds-bento-visual > ${figure}`,
    title: 'example.ts · AGI in VS Code',
    badge: 'VS Code',
    widths: [320, 390, 1440],
  },
];
const lines = [
  'export function greet(',
  'name: string',
  ') : string {',
  'const trimmed = name.trim()',
  "return trimmed ? `Hello, ${trimmed}` : 'Hello'",
  '}',
];
const normalizeFamily = (value: string) =>
  (value.split(',')[0] ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .toLowerCase();

test.describe.configure({ retries: 0 });
test.setTimeout(120_000);

function assertText(
  report: PublicTypographyReport,
  bounds: { left: number; right: number; top: number; bottom: number },
  minimum: number,
) {
  expect(report.findings).toEqual([]);
  expect(report.unmeasured).toEqual([]);
  expect(report.excluded).toEqual([]);
  expect(report.coverage.textNodes).toBeGreaterThan(0);
  expect(report.coverage.paintedTextNodes).toBe(report.coverage.textNodes);
  expect(report.samples.filter((sample) => sample.kind === 'text')).toHaveLength(
    report.coverage.textNodes,
  );
  for (const sample of report.samples) {
    expect(sample.renderedSize).not.toBeNull();
    expect(sample.renderedSize!).toBeGreaterThanOrEqual(
      sample.mono ? 15 : sample.selector === 'p' ? 17 : minimum,
    );
    expect(sample.rects.length).toBeGreaterThan(0);
    for (const rect of sample.rects) {
      expect(rect.left, sample.text).toBeGreaterThanOrEqual(bounds.left - 0.05);
      expect(rect.right, sample.text).toBeLessThanOrEqual(bounds.right + 0.05);
      expect(rect.top, sample.text).toBeGreaterThanOrEqual(bounds.top - 0.05);
      expect(rect.bottom, sample.text).toBeLessThanOrEqual(bounds.bottom + 0.05);
    }
  }
}

async function geometry(frame: Locator) {
  return frame.evaluate((root) => {
    const box = root.getBoundingClientRect();
    const masked = [];
    for (let owner: Element | null = root; owner; owner = owner.parentElement) {
      const css = getComputedStyle(owner);
      if (
        css.maskImage !== 'none' ||
        !['', 'none'].includes(css.getPropertyValue('-webkit-mask-image'))
      )
        masked.push(owner.getAttribute('class'));
    }
    const shell = root.querySelector<HTMLElement>('.agi-dev-shell');
    const chat = root.querySelector<HTMLElement>('.agi-ed-chat');
    if (!shell || !chat) throw new Error('Editor shell/chat owner is missing');
    return {
      connected: root.isConnected,
      box: {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      },
      masked,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      shellOverflow: getComputedStyle(shell).overflow,
      shellHiddenHeight: shell.scrollHeight - shell.clientHeight,
      chatOverflow: getComputedStyle(chat).overflow,
      chatHiddenHeight: chat.scrollHeight - chat.clientHeight,
      directBento: root.parentElement?.matches('.agi-ds-bento-visual') ?? false,
    };
  });
}

for (const caller of callers)
  for (const width of caller.widths)
    for (const theme of ['light', 'dark'] as const) {
      test(`editor-${caller.name}-${width}-${theme}`, async ({ browser }, testInfo) => {
        const baseURL = testInfo.project.use.baseURL;
        if (typeof baseURL !== 'string')
          throw new Error('Editor regression requires configured baseURL');
        const context = await browser.newContext({
          baseURL,
          viewport: { width, height: 900 },
          colorScheme: theme,
          reducedMotion: 'reduce',
          storageState: { cookies: [], origins: [] },
        });
        const page = await context.newPage();
        const evidence: Record<string, unknown> = { caller, width, theme };
        try {
          evidence['readiness'] = await settlePublicPage(
            page,
            {
              path: caller.path,
              expectedHttpStatuses: [200],
              expectedFinalPath: caller.path,
              expectedOrigin: new URL(baseURL).origin,
              expectedQuery: '',
            },
            { expectedFonts: fonts },
          );
          const banner = page.getByRole('region', { name: 'Cookie consent', exact: true });
          await expect(banner).toBeVisible();
          await banner.getByRole('button', { name: 'Necessary only', exact: true }).click();
          await expect(banner).toHaveCount(0);
          expect(
            await page.evaluate(() => ({
              theme: document.documentElement.dataset['theme'],
              scheme: getComputedStyle(document.documentElement).colorScheme,
              light: document.documentElement.classList.contains('light'),
              dark: document.documentElement.classList.contains('dark'),
            })),
          ).toEqual({ theme, scheme: theme, light: theme === 'light', dark: theme === 'dark' });
          if (caller.name === 'home') {
            const tab = page.getByRole('tab', { name: 'AGI in VS Code', exact: true });
            await expect(tab).toHaveCount(1);
            await tab.click();
            await expect(tab).toBeFocused();
            await expect(tab).toHaveAttribute('aria-selected', 'true');
            await expect(
              page.getByRole('tabpanel', { name: 'AGI in VS Code', exact: true }),
            ).toBeVisible();
          }
          const frame = page.locator(caller.selector);
          await expect(frame).toHaveCount(1);
          await expect(page.locator(`main ${figure}`)).toHaveCount(1);
          await expect(frame).toHaveAttribute('aria-label', 'AGI VS Code extension interface');
          await frame.scrollIntoViewIfNeeded();
          await expect(frame).toBeVisible();
          await expect(frame.locator('.agi-dev-title')).toHaveText(caller.title);
          await expect(frame.locator('.agi-dev-badge')).toHaveText(caller.badge);
          const body = frame.locator('.agi-dev-body.agi-ed');
          await expect(body).toHaveAttribute('aria-hidden', 'true');
          await expect(body.locator('button,a,input,textarea,[tabindex],[hidden]')).toHaveCount(0);
          await expect(body.locator('.agi-mk-receipt')).toHaveCount(0);
          await expect(body.locator('.agi-ed-msg > p')).toHaveText(
            'Example request: add a fallback for an empty name.',
          );
          await expect(body.locator('.agi-mk-agi > p')).toHaveText(
            "Proposed example: trim the name and use 'Hello' when it is empty. Review these changes before applying them.",
          );
          await expect(body.locator('.agi-mk-actions > span')).toHaveText(['Accept', 'Reject']);
          expect(await body.textContent()).not.toMatch(
            /@agi\/sdk|ProviderError|processChat|tokens|passed|completed/,
          );
          await expect(body.locator('.agi-editor-tools > span > svg.agi-editor-icon')).toHaveCount(
            6,
          );
          await expect(body.locator('.agi-editor-tools')).toHaveCount(2);
          for (const group of await body.locator('.agi-editor-tools').all()) {
            await expect(group.locator('span > svg.agi-editor-icon')).toHaveCount(3);
            const rows = await group
              .locator('span')
              .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
            expect(new Set(rows).size).toBe(1);
          }
          await expect(body.locator('.agi-ed-row > .agi-ed-source')).toHaveText(lines);
          const font = await measurePublicFontProof(page, frame, fonts);
          expect(font.fontCoverageGaps).toEqual([]);
          evidence['font'] = font;
          const before = await geometry(frame);
          evidence['before'] = before;
          expect(before.connected).toBe(true);
          expect(before.box.width).toBeGreaterThan(0);
          expect(before.box.height).toBeGreaterThan(0);
          expect(before.directBento).toBe(caller.name === 'solutions');
          const partitions = [];
          for (const [part, minimum] of [
            ['.agi-dev-bar', 15],
            ['.agi-ed-panel', 16],
          ] as const) {
            const report = await page.evaluate(scanPublicTypography, {
              pageType: 'marketing' as const,
              pathname: caller.path,
              scopeSelector: `${caller.selector} ${part}`,
            });
            partitions.push(report);
            assertText(report, before.box, minimum);
          }
          for (const paragraph of await body.locator('.agi-ed-msg p').all())
            expect(
              await paragraph.evaluate((owner) => parseFloat(getComputedStyle(owner).fontSize)),
            ).toBeGreaterThanOrEqual(17);
          evidence['partitions'] = partitions;
          const code = frame.locator('.agi-ed-editor');
          const codeSelector = `${caller.selector} .agi-ed-editor`;
          const complete = await measurePublicTypographyWithScroll(page, {
            pageType: 'marketing',
            pathname: caller.path,
            scopeSelector: codeSelector,
          });
          evidence['code'] = complete;
          assertText(complete, before.box, 15);
          expect(complete.scrollProof.planComplete).toBe(true);
          expect(complete.scrollProof.restored).toBe(true);
          expect(complete.scrollProof.restorationFailures).toEqual([]);
          expect(complete.scrollProof.sources.every((source) => source.complete)).toBe(true);
          expect(complete.scrollContainers.length).toBeLessThanOrEqual(1);
          const codeState = await code.evaluate((owner) => ({
            x: owner.scrollLeft,
            max: owner.scrollWidth - owner.clientWidth,
            overflowX: getComputedStyle(owner).overflowX,
            rawCodepoints: [
              ...new Set(
                [...(owner.textContent ?? '')]
                  .filter((character) => !/\s/u.test(character))
                  .map((character) => character.codePointAt(0)!),
              ),
            ],
          }));
          expect(codeState.x).toBe(0);
          expect(codeState.overflowX).toBe('auto');
          const monoFamily = await page.evaluate(() =>
            (
              getComputedStyle(document.body).getPropertyValue('--font-geist-mono') ||
              getComputedStyle(document.documentElement).getPropertyValue('--font-geist-mono')
            )
              .split(',')[0]!
              .trim()
              .replace(/^['"]|['"]$/g, '')
              .toLowerCase(),
          );
          const codeFonts = [];
          const positions = [
            ...new Set([
              0,
              ...complete.scrollProof.states.flatMap((state) => state.actual.map((port) => port.x)),
            ]),
          ].sort((a, b) => a - b);
          if (codeState.max > 0) expect(positions.at(-1)).toBeGreaterThanOrEqual(codeState.max - 1);
          for (const position of positions) {
            await code.hover();
            const prior = await code.evaluate((owner) => owner.scrollLeft);
            if (position !== prior) await page.mouse.wheel(position - prior, 0);
            await expect
              .poll(async () =>
                Math.abs((await code.evaluate((owner) => owner.scrollLeft)) - position),
              )
              .toBeLessThanOrEqual(1);
            const proof = await measurePublicFontProof(page, code, [
              { cssVariable: '--font-geist-mono' },
            ]);
            expect(proof.fontCoverageGaps).toEqual([]);
            codeFonts.push({ x: await code.evaluate((owner) => owner.scrollLeft), proof });
          }
          const glyphs = new Set(
            codeFonts.flatMap(({ proof }) =>
              proof.usedFontFamilies
                .filter((family) => family.family === monoFamily)
                .flatMap((family) => family.requests.flatMap((request) => request.codepoints)),
            ),
          );
          expect(codeState.rawCodepoints.filter((point) => !glyphs.has(point))).toEqual([]);
          for (const sample of complete.samples)
            expect(normalizeFamily(sample.fontFamily)).toBe(monoFamily);
          const end = await code.evaluate((owner) => owner.scrollLeft);
          if (end !== 0) {
            await code.hover();
            await page.mouse.wheel(-end, 0);
          }
          await expect
            .poll(() => code.evaluate((owner) => Math.abs(owner.scrollLeft)))
            .toBeLessThanOrEqual(1);
          evidence['nativeCodeWheel'] = {
            positions,
            codeState,
            codeFonts,
            restored: await code.evaluate((owner) => owner.scrollLeft),
          };
          const capture = await capturePublicViewportStrips(page, frame, {
            stickyHeader: page.locator('header.agi-ds-header'),
            sourceFiles: [__filename],
          });
          evidence['viewportCapture'] = capture.evidence;
          for (const image of capture.images) {
            await testInfo.attach(`editor-strip-${image.index}.png`, {
              body: image.bytes,
              contentType: 'image/png',
            });
          }
          const after = await geometry(frame);
          evidence['after'] = after;
          for (const reading of [before, after]) {
            expect(reading.overflow).toBeLessThanOrEqual(0);
            expect(reading.masked).toEqual([]);
            expect(reading.shellOverflow).toBe('visible');
            expect(reading.chatOverflow).toBe('visible');
            expect(reading.shellHiddenHeight).toBeLessThanOrEqual(0);
            expect(reading.chatHiddenHeight).toBeLessThanOrEqual(0);
          }
          for (const [part, minimum] of [
            ['.agi-dev-bar', 15],
            ['.agi-ed-panel', 16],
          ] as const)
            assertText(
              await page.evaluate(scanPublicTypography, {
                pageType: 'marketing' as const,
                pathname: caller.path,
                scopeSelector: `${caller.selector} ${part}`,
              }),
              after.box,
              minimum,
            );
          await expect(body.locator('.agi-ed-row > .agi-ed-source')).toHaveText(lines);
        } finally {
          try {
            await testInfo.attach('editor-regression.json', {
              body: Buffer.from(JSON.stringify(evidence)),
              contentType: 'application/json',
            });
          } finally {
            await context.close();
          }
        }
      });
    }
