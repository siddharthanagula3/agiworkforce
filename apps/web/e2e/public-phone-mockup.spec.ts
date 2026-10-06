import { expect, test, type Locator } from '@playwright/test';
import { measurePublicFontProof, settlePublicPage } from './lib/public-page-readiness';
import { scanPublicTypography } from './lib/public-typography';

const phone = 'figure.agi-dev.agi-phone-responsive[data-device="phone"]';
const mobileStories = [
  'Chat that runs on the phone',
  'Your data stays on the phone',
  'A complete workspace, not a companion app',
];
const homeOwner = `main .agi-fl-surface-panel[data-state="active"] ${phone}`;
const reply =
  'From your memory: the demo runs from the CLI in Local mode, the deck lives in the Investor project, and the dry run is Thursday at 4pm. Want a reminder?';
const widths = [320, 360, 390, 768, 1024, 1366, 1440, 1920];

test.describe.configure({ retries: 0 });
test.setTimeout(90_000);

async function readPhone(frame: Locator) {
  return frame.evaluate((root) => {
    const box = root.getBoundingClientRect();
    const rect = (value: DOMRect) => ({
      left: value.left,
      right: value.right,
      top: value.top,
      bottom: value.bottom,
      width: value.width,
      height: value.height,
    });
    const textNodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (!node.data.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      textNodes.push({
        text: node.data.replace(/\s+/g, ' ').trim(),
        rects: [...range.getClientRects()]
          .filter((value) => value.width > 0 && value.height > 0)
          .map(rect),
      });
    }
    const masks = [];
    for (let owner: Element | null = root; owner; owner = owner.parentElement) {
      const css = getComputedStyle(owner);
      if (
        css.maskImage !== 'none' ||
        !['', 'none'].includes(css.getPropertyValue('-webkit-mask-image'))
      )
        masks.push({
          tag: owner.localName,
          class: owner.getAttribute('class'),
          mask: css.maskImage,
          webkitMask: css.getPropertyValue('-webkit-mask-image'),
        });
    }
    return {
      connected: root.isConnected,
      box: rect(box),
      textNodes,
      masks,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

for (const path of ['/mobile', '/'] as const) {
  for (const width of path === '/mobile' ? widths : [320, 390, 1440]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`phone-${path === '/mobile' ? 'mobile' : 'home'}-${width}-${theme}`, async ({
        browser,
      }, testInfo) => {
        const baseURL = testInfo.project.use.baseURL;
        if (typeof baseURL !== 'string')
          throw new Error('Phone regression requires configured baseURL');
        const context = await browser.newContext({
          baseURL,
          viewport: { width, height: 900 },
          colorScheme: theme,
          reducedMotion: 'reduce',
          storageState: { cookies: [], origins: [] },
        });
        const page = await context.newPage();
        const evidence: Record<string, unknown>[] = [];
        try {
          await settlePublicPage(page, {
            path,
            expectedHttpStatuses: [200],
            expectedFinalPath: path,
            expectedOrigin: new URL(baseURL).origin,
            expectedQuery: '',
          });
          await expect(page.getByRole('main')).toHaveCount(1);
          const banner = page.getByRole('region', { name: 'Cookie consent', exact: true });
          await expect(banner).toBeVisible();
          await banner.getByRole('button', { name: 'Necessary only', exact: true }).click();
          await expect(banner).toHaveCount(0);
          expect(
            await page.evaluate(() => ({
              marker: document.documentElement.dataset['theme'],
              light: document.documentElement.classList.contains('light'),
              dark: document.documentElement.classList.contains('dark'),
              scheme: getComputedStyle(document.documentElement).colorScheme,
              prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
            })),
          ).toEqual({
            marker: theme,
            light: theme === 'light',
            dark: theme === 'dark',
            scheme: theme,
            prefersDark: theme === 'dark',
          });
          if (path === '/') {
            const tab = page.getByRole('tab', { name: 'AGI Mobile', exact: true });
            await expect(tab).toHaveCount(1);
            await tab.click();
            await expect(tab).toHaveAttribute('aria-selected', 'true');
            await expect(
              page.getByRole('tabpanel', { name: 'AGI Mobile', exact: true }),
            ).toBeVisible();
          }
          const frames =
            path === '/mobile'
              ? [
                  page.locator(`main .agi-fl-hero-frame--main ${phone}`),
                  ...mobileStories.map((name) =>
                    page
                      .getByRole('listitem')
                      .filter({
                        has: page.getByRole('heading', { name, exact: true }),
                      })
                      .locator(phone),
                  ),
                ]
              : [page.locator(homeOwner)];
          await expect(page.locator(`main ${phone}`)).toHaveCount(frames.length);
          for (const [index, frame] of frames.entries()) {
            await expect(frame).toHaveCount(1);
            const scope = `phone-${index}`;
            await frame.evaluate(
              (element, value) => element.setAttribute('data-public-audit-scope', value),
              scope,
            );
            const selector = `figure[data-public-audit-scope="${scope}"]`;
            await expect(page.locator(selector)).toHaveCount(1);
            await expect(frame).toHaveAttribute('aria-label', 'AGI Mobile interface');
            await frame.scrollIntoViewIfNeeded();
            await expect(frame).toBeVisible();
            const body = frame.locator('.agi-dev-body.agi-ph');
            await expect(body).toHaveAttribute('aria-hidden', 'true');
            await expect(body.locator('button,a,input,textarea,[tabindex],[hidden]')).toHaveCount(
              0,
            );
            await expect(body.locator('.agi-ph-time')).toHaveText('11:10');
            await expect(body.locator('.agi-ph-name')).toHaveText('AGI');
            await expect(body.locator('.agi-ph-toggle-btn')).toHaveText(['Local', 'Cloud']);
            await expect(body.locator('.agi-mk-user')).toHaveText(
              'What did we decide for the launch demo?',
            );
            await expect(
              body.locator('.agi-mk-agi > p:not(.agi-mk-tool):not(.agi-mk-receipt)'),
            ).toHaveText(reply);
            await expect(body.locator('.agi-mk-tool')).toHaveAttribute('data-state', 'done');
            await expect(body.locator('.agi-mk-tool-meta')).toHaveText('3 facts');
            await expect(body.locator('.agi-mk-receipt')).toHaveText(/^Local · .+ · 1\.1 s$/u);
            await expect(body.locator('.agi-ph-ghost')).toHaveText('Message AGI…');
            await expect(body.locator('.agi-ph-model')).toHaveText('AGI Standard');
            await expect(body.locator('svg.agi-phone-icon')).toHaveCount(10);
            await expect(
              body.locator('.agi-ph-composer-foot > span:not(.agi-ph-model)'),
            ).toHaveText(['', '', '']);
            for (const name of [
              'Navigation',
              'New chat',
              'Memory found',
              'Attach',
              'Microphone',
              'Send',
            ])
              await expect(body.locator(`svg[aria-label="${name}"]`)).toHaveCount(1);
            for (const paragraph of await body
              .locator('.agi-mk-user, .agi-mk-agi > p:not(.agi-mk-receipt):not(.agi-mk-tool)')
              .all()) {
              expect(
                await paragraph.evaluate((element) =>
                  parseFloat(getComputedStyle(element).fontSize),
                ),
              ).toBeGreaterThanOrEqual(17);
            }
            const font = await measurePublicFontProof(page, frame, [
              { cssVariable: '--font-geist-sans' },
              { cssVariable: '--font-geist-mono' },
            ]);
            const before = await readPhone(frame);
            const typography = await page.evaluate(scanPublicTypography, {
              pageType: 'marketing' as const,
              pathname: path,
              scopeSelector: selector,
            });
            evidence.push({
              index,
              selector,
              font: font.expectedFontProof,
              fontCoverageGaps: font.fontCoverageGaps,
              before,
              coverage: typography.coverage,
              findings: typography.findings,
              unmeasured: typography.unmeasured,
              excluded: typography.excluded,
              samples: typography.samples.map(({ text, fontFamily, renderedSize, mono }) => ({
                text,
                fontFamily,
                renderedSize,
                mono,
              })),
            });
            await testInfo.attach(`phone-${index}.png`, {
              body: await frame.screenshot({ animations: 'disabled' }),
              contentType: 'image/png',
            });
            const after = await readPhone(frame);
            const afterTypography = await page.evaluate(scanPublicTypography, {
              pageType: 'marketing' as const,
              pathname: path,
              scopeSelector: selector,
            });
            evidence[index]!['after'] = {
              ...after,
              coverage: afterTypography.coverage,
              findings: afterTypography.findings,
              unmeasured: afterTypography.unmeasured,
              excluded: afterTypography.excluded,
            };
            expect(font.fontCoverageGaps).toEqual([]);
            expect(before.textNodes.length).toBeGreaterThan(0);
            for (const [report, reading] of [
              [typography, before],
              [afterTypography, after],
            ] as const) {
              expect(report.findings).toEqual([]);
              expect(report.unmeasured).toEqual([]);
              expect(report.excluded).toEqual([]);
              expect(report.coverage.textNodes).toBe(reading.textNodes.length);
              expect(report.coverage.paintedTextNodes).toBe(reading.textNodes.length);
              expect(report.samples.filter((sample) => sample.kind === 'text')).toHaveLength(
                reading.textNodes.length,
              );
              for (const sample of report.samples) {
                expect(sample.renderedSize).not.toBeNull();
                expect(sample.renderedSize!).toBeGreaterThanOrEqual(sample.mono ? 15 : 14);
              }
            }
            expect(after.textNodes.map((node) => node.text)).toEqual(
              before.textNodes.map((node) => node.text),
            );
            for (const reading of [before, after]) {
              expect(reading.connected).toBe(true);
              expect(reading.box.width).toBeGreaterThan(0);
              expect(reading.box.height).toBeGreaterThan(0);
              expect(reading.documentOverflow).toBeLessThanOrEqual(0);
              expect(reading.masks).toEqual([]);
              for (const node of reading.textNodes) {
                expect(node.rects.length, node.text).toBeGreaterThan(0);
                for (const rect of node.rects) {
                  expect(rect.left, node.text).toBeGreaterThanOrEqual(reading.box.left - 0.05);
                  expect(rect.right, node.text).toBeLessThanOrEqual(reading.box.right + 0.05);
                  expect(rect.top, node.text).toBeGreaterThanOrEqual(reading.box.top - 0.05);
                  expect(rect.bottom, node.text).toBeLessThanOrEqual(reading.box.bottom + 0.05);
                }
              }
            }
          }
        } finally {
          try {
            await testInfo.attach('phone-regression.json', {
              body: Buffer.from(JSON.stringify({ path, width, theme, evidence })),
              contentType: 'application/json',
            });
          } finally {
            await context.close();
          }
        }
      });
    }
  }
}
