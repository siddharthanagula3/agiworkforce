import { expect, test, type Locator } from '@playwright/test';
import { PRIVACY_MODE_DISPLAY } from '@agiworkforce/types';
import { APP_NAV_DESTINATIONS } from '../shared/components/layout/app-nav-items';
import {
  COOKIE_CONSENT_STORAGE_KEY,
  isCookieConsentCurrent,
  NECESSARY_ONLY_PREFERENCES,
  parseCookieConsentRecord,
} from '../shared/lib/cookie-consent';
import { measurePublicFontProof, settlePublicPage } from './lib/public-page-readiness';
import { scanPublicTypography } from './lib/public-typography';
import {
  capturePublicViewportStrips,
  PublicViewportCaptureError,
} from './lib/public-viewport-strip-capture';

const widths = [320, 360, 390, 768, 1024, 1366, 1440, 1920] as const;
const examples = [
  { path: '/desktop', kind: 'desktop', owner: 'desktop-page', widths, tab: null },
  {
    path: '/',
    kind: 'desktop',
    owner: 'home-desktop',
    widths: [320, 390, 1440],
    tab: 'AGI Desktop',
  },
  {
    path: '/',
    kind: 'chrome',
    owner: 'home-chrome',
    widths: [320, 390, 1440],
    tab: 'AGI in Chrome',
  },
] as const;
const fonts = [{ cssVariable: '--font-geist-sans' }, { cssVariable: '--font-geist-mono' }];

test.describe.configure({ retries: 0 });
test.setTimeout(90_000);

async function readDevice(frame: Locator) {
  return frame.evaluate((root) => {
    const rect = (box: DOMRect) => ({
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
    });
    const textNodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const parent = node.parentElement;
      const text = node.data.replace(/\s+/gu, ' ').trim();
      if (!text || !parent || parent.closest('script,style,noscript,textarea,option')) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const clips = [];
      for (let element: Element | null = parent; element; element = element.parentElement) {
        const css = getComputedStyle(element);
        if (css.overflowX !== 'visible' || css.overflowY !== 'visible') {
          const box = element.getBoundingClientRect();
          clips.push({
            tag: element.localName,
            class: element.getAttribute('class'),
            x: css.overflowX !== 'visible',
            y: css.overflowY !== 'visible',
            box: rect(box),
          });
        }
      }
      textNodes.push({
        text,
        rawText: node.data,
        rects: [...range.getClientRects()]
          .filter((box) => box.width > 0 && box.height > 0)
          .map(rect),
        clips,
      });
    }
    const masks = [];
    for (let element: Element | null = root; element; element = element.parentElement) {
      const css = getComputedStyle(element);
      if (
        css.maskImage !== 'none' ||
        !['', 'none'].includes(css.getPropertyValue('-webkit-mask-image'))
      )
        masks.push({
          tag: element.localName,
          class: element.getAttribute('class'),
          mask: css.maskImage,
          webkitMask: css.getPropertyValue('-webkit-mask-image'),
        });
    }
    return {
      connected: root.isConnected,
      box: rect(root.getBoundingClientRect()),
      textNodes,
      masks,
      viewportWidth: document.documentElement.clientWidth,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

async function assertScene(frame: Locator, kind: 'desktop' | 'chrome') {
  await expect(frame).toHaveClass(new RegExp('(?:^|\\s)agi-' + kind + '-responsive(?:\\s|$)', 'u'));
  await expect(frame).toHaveAttribute('data-device', kind);
  await expect(frame).toHaveAttribute('data-geometry', '720x480');
  await expect(frame.locator('.agi-dev-badge')).toHaveText(kind === 'desktop' ? 'Cloud' : 'Chrome');
  await expect(frame.locator('.agi-dev-lights i')).toHaveCount(3);
  await expect(frame.locator('.agi-device-example-label')).toHaveText('Example prompt');
  await expect(frame.locator('.agi-dev-body')).toHaveAttribute('aria-hidden', 'true');
  await expect(
    frame.locator(
      'button,a,input,textarea,select,[tabindex],[contenteditable],[role="button"],[hidden],[inert]',
    ),
  ).toHaveCount(0);
  await expect(
    frame.locator(
      '.agi-mk-tool,.agi-mk-approval,.agi-mk-receipt,.agi-mk-cite,.agi-cr-msg--agi,.agi-mk-actions',
    ),
  ).toHaveCount(0);
  await expect(frame).not.toContainText(
    /Always|Insert as comment|¶|\d+(?:\.\d+)?\s+s\b|\d+\s+lines added/u,
  );
  await expect(frame).not.toContainText(/Ollama|Served by Local|Served by BYOK|Auto · Local/u);
  if (kind === 'desktop') {
    await expect(frame).toHaveAttribute('aria-label', 'AGI Workforce desktop app authored example');
    await expect(frame.locator('.agi-dev-title')).toHaveText('AGI Workforce');
    await expect(frame.locator('.agi-desk-brand')).toHaveText('AGI');
    await expect(frame.locator('.agi-desk-new')).toHaveText('New chat');
    const destinations = APP_NAV_DESTINATIONS.filter(
      ({ id }) => id === 'projects' || id === 'library',
    );
    expect(destinations.map(({ id }) => id)).toEqual(['projects', 'library']);
    await expect(frame.locator('.agi-desk-item')).toHaveText([
      'Search',
      ...destinations.map(({ label }) => label),
    ]);
    await expect(frame.locator('.agi-desk-group')).toHaveText('Example chats');
    await expect(frame.locator('.agi-desk-recent')).toHaveText([
      'Release notes',
      'Quarterly notes',
      'Project checklist',
    ]);
    await expect(frame.locator('.agi-desk-count,.agi-desk-beta')).toHaveCount(0);
    await expect(frame.locator('.agi-desk-foot')).toHaveText(PRIVACY_MODE_DISPLAY.managed.label);
    await expect(frame.locator('.agi-device-example-title')).toHaveText('Release notes');
    await expect(frame.locator('.agi-mk-agi > p:not(.agi-device-example-title)')).toHaveText(
      'Review the launch checklist, record the open questions, and plan the next update.',
    );
    await expect(frame.locator('.agi-mk-ghost')).toHaveText(
      'Draft a release note from these notes.',
    );
    await expect(frame.locator('.agi-mk-seg span')).toHaveText(['Chat', 'AGI Work']);
    await expect(frame.locator('.agi-mk-chip--model')).toHaveText(
      'Auto · ' + PRIVACY_MODE_DISPLAY.managed.label,
    );
    await expect(frame.locator('svg.agi-device-icon')).toHaveCount(6);
    await expect(frame.locator('.agi-dev-send svg.lucide-arrow-up')).toHaveCount(1);
    await expect(frame.locator('.agi-mk-chip--model svg.lucide-chevron-down')).toHaveCount(1);
  } else {
    await expect(frame).toHaveAttribute('aria-label', 'AGI Chrome extension authored example');
    await expect(frame.locator('.agi-cr-tab-label')).toHaveText([
      'Q3 Strategy · Google Docs',
      'New Tab',
    ]);
    await expect(frame.locator('.agi-cr-url')).toHaveText('docs.google.com');
    await expect(frame.locator('.agi-cr-ext')).toHaveText('AGI');
    await expect(frame.locator('.agi-cr-doc-title')).toHaveText('Q3 Strategy Document');
    await expect(frame.locator('.agi-cr-doc-copy')).toHaveText(
      'Review the launch checklist and record the open questions before the next team meeting.',
    );
    await expect(frame.locator('.agi-cr-panel-logo')).toHaveText('AGI');
    await expect(frame.locator('.agi-cr-panel-mode')).toHaveText(
      PRIVACY_MODE_DISPLAY.managed.label,
    );
    await expect(frame.locator('.agi-dev-pagestrip-title')).toHaveText('Q3 Strategy Doc');
    await expect(frame.locator('.agi-dev-pagestrip-meta')).toHaveText('docs.google.com');
    await expect(frame.locator('.agi-dev-pagestrip-badge')).toHaveText('Context');
    await expect(frame.locator('.agi-dev-type')).toHaveText(
      'Summarise this page into a short checklist.',
    );
    await expect(frame.locator('.agi-dev-panelcomposer-foot')).toContainText('Desktop optional');
    await expect(frame.locator('.agi-dev-panelcomposer-foot')).toContainText(
      PRIVACY_MODE_DISPLAY.managed.label,
    );
    await expect(frame.locator('.agi-dev-panelcomposer-foot')).not.toContainText('Paired');
    await expect(frame.locator('svg.agi-device-icon')).toHaveCount(12);
    await expect(frame.locator('.agi-dev-send svg.lucide-arrow-up')).toHaveCount(1);
  }
  const prose = frame.locator(
    '.agi-device-example-label,.agi-mk-agi > p,.agi-cr-doc-copy,.agi-mk-ghost,.agi-dev-type',
  );
  for (const paragraph of await prose.all())
    expect(
      await paragraph.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
    ).toBeGreaterThanOrEqual(17);
  const controls = frame.locator(
    '.agi-desk-new,.agi-desk-item,.agi-mk-seg span,.agi-mk-chip--model,.agi-cr-tab-label',
  );
  for (const control of await controls.all())
    expect(
      await control.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
    ).toBeGreaterThanOrEqual(16);
}

for (const example of examples) {
  for (const width of example.widths) {
    for (const theme of ['light', 'dark'] as const) {
      test('device-' + example.owner + '-' + width + '-' + theme, async ({ browser }, testInfo) => {
        const baseURL = testInfo.project.use.baseURL;
        if (typeof baseURL !== 'string')
          throw new Error('Device regression requires configured baseURL');
        const context = await browser.newContext({
          baseURL,
          viewport: { width, height: 900 },
          colorScheme: theme,
          reducedMotion: 'reduce',
          storageState: { cookies: [], origins: [] },
        });
        const page = await context.newPage();
        const pageErrors: string[] = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        const evidence: Record<string, unknown> = {
          path: example.path,
          kind: example.kind,
          owner: example.owner,
          width,
          theme,
        };
        let frame: Locator | undefined;
        let scoped = false;
        try {
          evidence['readiness'] = await settlePublicPage(
            page,
            {
              path: example.path,
              expectedHttpStatuses: [200],
              expectedFinalPath: example.path,
              expectedOrigin: new URL(baseURL).origin,
              expectedQuery: '',
            },
            { expectedFonts: fonts },
          );
          await expect(page.getByRole('main')).toHaveCount(1);
          const banner = page.getByRole('region', { name: 'Cookie consent', exact: true });
          await expect(banner).toBeVisible();
          await banner.getByRole('button', { name: 'Necessary only', exact: true }).click();
          await expect(banner).toHaveCount(0);
          const consent = parseCookieConsentRecord(
            await page.evaluate((key) => localStorage.getItem(key), COOKIE_CONSENT_STORAGE_KEY),
          );
          expect(isCookieConsentCurrent(consent)).toBe(true);
          expect(consent).toMatchObject({ ...NECESSARY_ONLY_PREFERENCES });
          evidence['consent'] = consent;
          const themeReading = await page.evaluate(() => ({
            marker: document.documentElement.dataset['theme'],
            light: document.documentElement.classList.contains('light'),
            dark: document.documentElement.classList.contains('dark'),
            scheme: getComputedStyle(document.documentElement).colorScheme,
            prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
          }));
          expect(themeReading).toEqual({
            marker: theme,
            light: theme === 'light',
            dark: theme === 'dark',
            scheme: theme,
            prefersDark: theme === 'dark',
          });
          evidence['theme'] = themeReading;
          const selector = 'figure.agi-dev[data-device="' + example.kind + '"]';
          let expectedFrameCount = 1;
          if (example.path === '/') {
            const deck = page.getByRole('group', { name: 'The six surfaces', exact: true });
            await expect(deck).toHaveCount(1);
            const step = deck.getByRole('listitem').filter({
              has: page.getByRole('link', { name: example.tab, exact: true }),
            });
            await expect(step).toHaveCount(1);
            await step.scrollIntoViewIfNeeded();
            const pinned = (await deck.getAttribute('data-pinned')) === 'true';
            if (pinned) await expect(step).toHaveAttribute('data-active', 'true');
            const owner = pinned
              ? deck.locator('.agi-mx-deck-stage .agi-mx-deck-card[data-active="true"]')
              : step.locator('.agi-mx-deck-inline');
            await expect(owner).toHaveCount(1);
            frame = owner.locator(selector);
            expectedFrameCount = pinned ? 1 : 2;
            evidence['homeSelection'] = { surface: example.tab, pinned };
          } else {
            const hero = page.getByRole('region', { name: 'AGI Desktop', exact: true });
            await expect(hero).toHaveCount(1);
            frame = hero.locator(selector);
          }
          await expect(page.getByRole('main').locator(selector)).toHaveCount(expectedFrameCount);
          await expect(frame).toHaveCount(1);
          await frame.scrollIntoViewIfNeeded();
          await expect(frame).toBeVisible();
          await expect
            .poll(() =>
              frame!.evaluate((root) => {
                const animations = new Set(root.getAnimations({ subtree: true }));
                for (let element = root.parentElement; element; element = element.parentElement)
                  for (const animation of element.getAnimations()) animations.add(animation);
                return {
                  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
                  active: [...animations].filter(
                    (animation) =>
                      animation.pending || ['running', 'paused'].includes(animation.playState),
                  ).length,
                };
              }),
            )
            .toEqual({ reduced: true, active: 0 });
          const scope = 'device-' + example.owner + '-' + width + '-' + theme;
          await frame.evaluate((element, value) => {
            if (element.hasAttribute('data-public-audit-scope'))
              throw new Error('Unexpected existing audit scope');
            element.setAttribute('data-public-audit-scope', value);
          }, scope);
          scoped = true;
          const auditSelector = 'figure[data-public-audit-scope="' + scope + '"]';
          await expect(page.locator(auditSelector)).toHaveCount(1);
          const before = await readDevice(frame);
          const beforeTypography = await page.evaluate(scanPublicTypography, {
            pageType: 'marketing' as const,
            pathname: example.path,
            scopeSelector: auditSelector,
          });
          evidence['before'] = { reading: before, typography: beforeTypography };
          const beforeFont = await measurePublicFontProof(page, frame, fonts);
          evidence['beforeFont'] = beforeFont;
          let capture: Awaited<ReturnType<typeof capturePublicViewportStrips>>;
          try {
            capture = await capturePublicViewportStrips(page, frame, {
              stickyHeader: page.locator('header.agi-ds-header'),
              sourceFiles: [__filename],
            });
          } catch (error) {
            if (error instanceof PublicViewportCaptureError) {
              evidence['viewportCapture'] = error.capture.evidence;
              evidence['viewportCaptureError'] = { name: error.name, message: error.message };
              try {
                await testInfo.attach('device-viewport-capture-error.json', {
                  body: Buffer.from(
                    JSON.stringify({
                      path: example.path,
                      kind: example.kind,
                      owner: example.owner,
                      width,
                      theme,
                      error: evidence['viewportCaptureError'],
                      capture: error.capture.evidence,
                    }),
                  ),
                  contentType: 'application/json',
                });
                for (const image of error.capture.images) {
                  await testInfo.attach(`device-rejected-strip-${image.index}.png`, {
                    body: image.bytes,
                    contentType: 'image/png',
                  });
                }
              } catch (attachmentError) {
                evidence['captureDiagnosticAttachError'] =
                  attachmentError instanceof Error
                    ? attachmentError.message
                    : String(attachmentError);
              }
            }
            throw error;
          }
          evidence['viewportCapture'] = capture.evidence;
          for (const image of capture.images) {
            await testInfo.attach(`device-strip-${image.index}.png`, {
              body: image.bytes,
              contentType: 'image/png',
            });
          }
          const afterFont = await measurePublicFontProof(page, frame, fonts);
          const after = await readDevice(frame);
          const afterTypography = await page.evaluate(scanPublicTypography, {
            pageType: 'marketing' as const,
            pathname: example.path,
            scopeSelector: auditSelector,
          });
          evidence['after'] = { reading: after, typography: afterTypography, font: afterFont };
          await assertScene(frame, example.kind);
          for (const [reading, typography, font] of [
            [before, beforeTypography, beforeFont],
            [after, afterTypography, afterFont],
          ] as const) {
            expect(font.fontCoverageGaps).toEqual([]);
            expect(font.expectedFontProof).toHaveLength(2);
            const families = font.expectedFontProof.map((entry) => entry.family);
            expect(new Set(families).size).toBe(2);
            for (const proof of font.expectedFontProof) {
              expect(proof.family).not.toBe('');
              expect(proof.usedTextNodes).toBeGreaterThan(0);
              expect(proof.requests).toBeGreaterThan(0);
              expect(proof.matchedRequests).toBe(proof.requests);
            }
            expect(
              font.usedFontFamilies.every(
                (entry) => !entry.generic && families.includes(entry.family),
              ),
            ).toBe(true);
            expect(
              font.usedFontFamilies.reduce((total, entry) => total + entry.usedTextNodes, 0),
            ).toBe(reading.textNodes.length);
            expect(typography.findings).toEqual([]);
            expect(typography.unmeasured).toEqual([]);
            expect(typography.excluded).toEqual([]);
            expect(typography.coverage.textNodes).toBe(reading.textNodes.length);
            expect(typography.coverage.paintedTextNodes).toBe(reading.textNodes.length);
            const samples = typography.samples.filter((entry) => entry.kind === 'text');
            expect(samples.map((entry) => entry.text)).toEqual(
              reading.textNodes.map((entry) => entry.text),
            );
            for (const sample of typography.samples) {
              expect(sample.renderedSize).not.toBeNull();
              expect(sample.renderedSize!).toBeGreaterThanOrEqual(sample.mono ? 15 : 14);
            }
            expect(reading.textNodes.length).toBeGreaterThan(0);
            expect(reading.connected).toBe(true);
            expect(reading.box.width).toBeGreaterThan(0);
            expect(reading.box.height).toBeGreaterThan(0);
            expect(reading.box.left).toBeGreaterThanOrEqual(-0.05);
            expect(reading.box.right).toBeLessThanOrEqual(reading.viewportWidth + 0.05);
            expect(reading.documentOverflow).toBeLessThanOrEqual(0);
            expect(reading.masks).toEqual([]);
            for (const node of reading.textNodes) {
              expect(node.rects.length, node.text).toBeGreaterThan(0);
              for (const box of node.rects) {
                expect(box.left, node.text).toBeGreaterThanOrEqual(reading.box.left - 0.05);
                expect(box.right, node.text).toBeLessThanOrEqual(reading.box.right + 0.05);
                expect(box.top, node.text).toBeGreaterThanOrEqual(reading.box.top - 0.05);
                expect(box.bottom, node.text).toBeLessThanOrEqual(reading.box.bottom + 0.05);
                for (const clip of node.clips) {
                  if (clip.x) {
                    expect(box.left, node.text).toBeGreaterThanOrEqual(clip.box.left - 0.05);
                    expect(box.right, node.text).toBeLessThanOrEqual(clip.box.right + 0.05);
                  }
                  if (clip.y) {
                    expect(box.top, node.text).toBeGreaterThanOrEqual(clip.box.top - 0.05);
                    expect(box.bottom, node.text).toBeLessThanOrEqual(clip.box.bottom + 0.05);
                  }
                }
              }
            }
          }
          expect(after.textNodes.map((entry) => entry.rawText)).toEqual(
            before.textNodes.map((entry) => entry.rawText),
          );
          expect(afterFont.usedFontFamilies).toEqual(beforeFont.usedFontFamilies);
          expect(pageErrors).toEqual([]);
        } catch (error) {
          evidence['error'] = error instanceof Error ? error.message : String(error);
          throw error;
        } finally {
          try {
            if (frame && scoped)
              await frame.evaluate((element) => element.removeAttribute('data-public-audit-scope'));
            evidence['pageErrors'] = pageErrors;
            await testInfo.attach('desktop-chrome-regression.json', {
              body: Buffer.from(JSON.stringify(evidence)),
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
