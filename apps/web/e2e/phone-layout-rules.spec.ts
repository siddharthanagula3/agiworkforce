import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './qa-capability-harness';

/**
 * What a phone browser needs from every signed-in screen, measured in a real
 * layout engine because none of it exists in jsdom: how big text and fields
 * are drawn, whether a label wrapped, where the composer ended up. The context
 * is a touch phone, so the rules that hang off a coarse pointer apply.
 */

const PHONES = [
  { name: '390', viewport: { width: 390, height: 844 } },
  { name: '320', viewport: { width: 320, height: 568 } },
] as const;

const SCREENS = [
  '/chat',
  '/chat/chats',
  '/chat/projects',
  '/chat/library',
  '/chat/artifacts',
  '/chat/live-artifacts',
  '/chat/images',
  '/chat/agents',
  '/chat/agents/new',
  '/chat/schedules',
  '/chat/sites',
  '/chat/customize',
  '/chat/study',
  '/chat/finance',
  '/chat/health',
  '/code',
  '/code/computer',
  '/tasks',
  '/models',
  '/models/compare',
  '/upgrade',
  '/billing/invoices',
  '/settings/general',
  '/settings/profile',
  '/settings/account',
  '/settings/security',
  '/settings/privacy',
  '/settings/safety',
  '/settings/billing',
  '/settings/usage',
  '/settings/capabilities',
  '/settings/connections',
  '/settings/memory',
  '/settings/notifications',
  '/settings/voice',
  '/settings/time-focus',
  '/settings/reflect',
  '/settings/referrals',
  '/settings/team',
  '/settings/shared-links',
  '/settings/archived',
  '/settings/deleted-chats',
  '/skills',
  '/workspace',
  '/workspace/people',
  '/workspace/usage',
] as const;

const PUBLIC_SCREENS = [
  '/',
  '/about',
  '/agent-permissions',
  '/agi-code',
  '/business',
  '/byok',
  '/changelog',
  '/chrome-extension',
  '/cli',
  '/contact',
  '/desktop',
  '/docs',
  '/download',
  '/enterprise',
  '/faq',
  '/features',
  '/gallery',
  '/help',
  '/local',
  '/login',
  '/mobile',
  '/plugins',
  '/pricing',
  '/privacy',
  '/security',
  '/signup',
  '/status',
  '/terms',
  '/trust',
  '/vscode-extension',
  '/web',
] as const;

const BACK_ROW_SCREENS: ReadonlySet<string> = new Set([
  '/upgrade',
  '/billing/invoices',
  '/workspace',
  '/workspace/people',
  '/workspace/usage',
]);
const COMPOSER_SCREENS: ReadonlySet<string> = new Set(['/chat', '/code']);
/** A screen whose only purpose is typing into its first field, as a dialog opened to type in is. */
const TYPE_FIRST_SCREENS: ReadonlySet<string> = new Set(['/login']);

const RULES = {
  minTextPx: 12,
  minFieldPx: 16,
  gutterPx: 16,
  glyphOverhangPx: 2,
  minTargetPx: 24,
  iconTargetPx: 44,
  switchAspect: 1.4,
  maxLabelChars: 28,
  dialogNearlyFull: 0.9,
  composerBottomGapPx: 24,
  composerControlRows: 2,
} as const;

const LOAD_TIMEOUT_MS = 30_000;
const SETTLE_TIMEOUT_MS = 8_000;
const STILL_SAMPLE_MS = 120;
const CONSENT_WAIT_MS = 4_000;
const CONSENT_DISMISS_LABEL = 'Close and reject non-essential cookies';
const SWEEP_TIMEOUT_MS = 15 * 60_000;
const EVIDENCE_DIR = process.env['QA_RENDER_EVIDENCE_DIR'];
const SHELL_SCREEN = '/chat/projects';
const OPEN_NAVIGATION_LABEL = 'Open navigation';
const NAVIGATION_DRAWER = 'mobile-nav-drawer';
const CHAT_SCREEN = '/chat';
const COMPOSER_MENUS = [
  {
    name: 'model picker',
    opener: /change model$/i,
    surface: '[role="dialog"], [data-radix-popper-content-wrapper]',
  },
  {
    name: 'plus menu',
    opener: /^Add attachments and tools/,
    surface: '[role="menu"], [role="dialog"]',
  },
] as const;

const PLANTED_FAULTS = [
  { rule: 'text-too-small', marker: 'ten pixel text' },
  { rule: 'text-inside-the-gutter', marker: 'edge text' },
  { rule: 'field-zooms-the-page', marker: '[small field]' },
  { rule: 'switch-lost-its-shape', marker: '[squashed switch]' },
  { rule: 'target-too-small', marker: '[tiny target]' },
  { rule: 'icon-button-under-44', marker: '[narrow icon]' },
  { rule: 'label-wrapped', marker: 'Two words' },
] as const;

interface Finding {
  rule: string;
  where: string;
  value: string;
}

interface ScreenReport {
  screen: string;
  landedOn: string;
  findings: Finding[];
}

async function measureScreen(
  page: Page,
  options: {
    app: boolean;
    needsHeader: boolean;
    needsWayBack?: boolean;
    hasComposer: boolean;
    typeFirst?: boolean;
  },
): Promise<Finding[]> {
  return page.evaluate(
    ({ rules, app, needsHeader, needsWayBack, hasComposer, typeFirst }) => {
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const findings: { rule: string; where: string; value: string }[] = [];
      const reported = new Set<string>();

      const label = (element: Element): string => {
        if (element === document.body || element === document.documentElement) return 'page';
        const name =
          element.getAttribute('data-testid') ??
          element.getAttribute('aria-label') ??
          (element as HTMLInputElement).labels?.[0]?.textContent?.trim();
        const text = (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 32);
        return `${element.tagName.toLowerCase()}${name ? `[${name}]` : ''} "${text}"`;
      };
      const report = (rule: string, element: Element, value: string) => {
        const where = label(element);
        const key = `${rule}|${where}|${value}`;
        if (reported.has(key)) return;
        reported.add(key);
        findings.push({ rule, where, value });
      };

      const shown = (element: Element): boolean => {
        if (element.closest('[inert], [aria-hidden="true"]')) return false;
        const visible = (
          element as Element & { checkVisibility?: (options: object) => boolean }
        ).checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true });
        if (visible === false) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return false;
        const style = getComputedStyle(element);
        return style.clipPath === 'none' && style.clip === 'auto';
      };
      const scrollsSideways = (element: Element): boolean => {
        for (let node: Element | null = element; node; node = node.parentElement) {
          const overflowX = getComputedStyle(node).overflowX;
          if (
            (overflowX === 'auto' || overflowX === 'scroll') &&
            node.scrollWidth > node.clientWidth
          )
            return true;
        }
        return false;
      };
      const hitBox = (element: Element) => {
        const rect = element.getBoundingClientRect();
        let { left, top, right, bottom } = rect;
        for (const pseudo of ['::before', '::after']) {
          const style = getComputedStyle(element, pseudo);
          if (style.content === 'none' || style.position !== 'absolute') continue;
          const inset = (value: string) => (value.endsWith('px') ? parseFloat(value) : 0);
          left = Math.min(left, rect.left + inset(style.left));
          top = Math.min(top, rect.top + inset(style.top));
          right = Math.max(right, rect.right - inset(style.right));
          bottom = Math.max(bottom, rect.bottom - inset(style.bottom));
        }
        return { width: right - left, height: bottom - top };
      };
      const textLines = (element: Element): number => {
        const range = document.createRange();
        const tops: number[] = [];
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent?.trim()) continue;
          range.selectNodeContents(node);
          for (const rect of Array.from(range.getClientRects())) {
            if (rect.width < 1) continue;
            if (!tops.some((top) => Math.abs(top - rect.top) < rect.height / 2))
              tops.push(rect.top);
          }
        }
        return tops.length;
      };

      if (document.documentElement.scrollWidth > viewportWidth) {
        report(
          'page-scrolls-sideways',
          document.documentElement,
          `${document.documentElement.scrollWidth} > ${viewportWidth}`,
        );
      }

      const active = document.activeElement;
      if (
        !typeFirst &&
        active &&
        active.matches('input, textarea, select, [contenteditable="true"]')
      ) {
        report('field-focused-on-load', active, 'opens the keyboard before a tap');
      }

      const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const textRange = document.createRange();
      for (let node = textWalker.nextNode(); node; node = textWalker.nextNode()) {
        const parent = node.parentElement;
        if (!parent || !node.textContent?.trim() || !shown(parent)) continue;
        if (parent.closest('script, style, noscript, option')) continue;
        const size = parseFloat(getComputedStyle(parent).fontSize);
        if (size < rules.minTextPx) report('text-too-small', parent, `${size}px`);
        if (parent.closest('[data-app-header]') || scrollsSideways(parent)) continue;
        textRange.selectNodeContents(node);
        for (const rect of Array.from(textRange.getClientRects())) {
          if (rect.width < 1 || rect.left < 0 || rect.right > viewportWidth) continue;
          const nearest = Math.min(rect.left, viewportWidth - rect.right);
          if (nearest < rules.gutterPx - rules.glyphOverhangPx) {
            report('text-inside-the-gutter', parent, `${Math.round(nearest)}px from the edge`);
          }
        }
      }

      const fields = document.querySelectorAll(
        'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable="true"]',
      );
      for (const field of Array.from(fields)) {
        if (!shown(field)) continue;
        const size = parseFloat(getComputedStyle(field).fontSize);
        if (size < rules.minFieldPx) report('field-zooms-the-page', field, `${size}px`);
      }

      for (const control of Array.from(document.querySelectorAll('[role="switch"]'))) {
        if (!shown(control)) continue;
        const rect = control.getBoundingClientRect();
        if (rect.width < rect.height * rules.switchAspect) {
          report(
            'switch-lost-its-shape',
            control,
            `${Math.round(rect.width)}x${Math.round(rect.height)}`,
          );
        }
      }

      const controls = document.querySelectorAll(
        'button, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], [role="checkbox"], [role="radio"], summary, select, a[href], input[type="checkbox"], input[type="radio"]',
      );
      for (const control of Array.from(controls)) {
        if (!shown(control)) continue;
        const inlineLink =
          control.tagName === 'A' && getComputedStyle(control).display === 'inline';
        const untappable =
          control.matches(':disabled, [aria-disabled="true"]') ||
          getComputedStyle(control).pointerEvents === 'none';
        if (inlineLink || untappable) continue;
        const nativeBox = control.matches('input[type="checkbox"], input[type="radio"]');
        const box = hitBox((nativeBox && control.closest('label')) || control);
        const size = `${Math.round(box.width)}x${Math.round(box.height)}`;
        const text = (control.textContent ?? '').trim();
        if (box.width < rules.minTargetPx || box.height < rules.minTargetPx) {
          report('target-too-small', control, size);
        } else if (
          text === '' &&
          !control.matches('input, select') &&
          (box.width < rules.iconTargetPx || box.height < rules.iconTargetPx)
        ) {
          report('icon-button-under-44', control, size);
        }
        const singleLabel =
          text.length > 0 &&
          text.length <= rules.maxLabelChars &&
          control.matches('button, [role="button"], [role="tab"], a[href]') &&
          Array.from(control.querySelectorAll('*')).filter((child) =>
            Array.from(child.childNodes).some(
              (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
            ),
          ).length <= 1;
        const style = getComputedStyle(control);
        const drawnAsButton =
          parseFloat(style.borderTopWidth) > 0 ||
          !/^(rgba\(0, 0, 0, 0\)|transparent)$/.test(style.backgroundColor);
        if (singleLabel && drawnAsButton && textLines(control) > 1) {
          report('label-wrapped', control, text);
        }
      }

      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(shown);
      for (const dialog of dialogs) {
        const rect = dialog.getBoundingClientRect();
        const fills =
          rect.left <= 0.5 &&
          rect.top <= 0.5 &&
          rect.right >= viewportWidth - 0.5 &&
          rect.bottom >= viewportHeight - 0.5;
        const nearlyFills =
          rect.width >= viewportWidth * rules.dialogNearlyFull &&
          rect.height >= viewportHeight * rules.dialogNearlyFull;
        if (nearlyFills && !fills) {
          report(
            'dialog-nearly-fills-the-screen',
            dialog,
            `${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)} in ${viewportWidth}x${viewportHeight}`,
          );
        }
      }

      if (needsHeader && dialogs.length === 0) {
        const header = document.querySelector('[data-app-header]');
        const opener = header?.querySelector('button[aria-controls], button[aria-expanded]');
        if (!header || !shown(header)) {
          report('no-app-header', document.body, 'nothing leads back to the rest of the app');
        } else if (!opener) {
          report('header-without-navigation', header, 'no button opens the side panel');
        } else {
          const heading = document.querySelector('#main-content h1');
          if (heading && shown(heading) && getComputedStyle(heading).textAlign !== 'center') {
            const row = Array.from(heading.parentElement?.children ?? [heading]).filter(shown);
            const left = Math.round(
              Math.min(...row.map((item) => item.getBoundingClientRect().left)),
            );
            if (Math.abs(left - rules.gutterPx) > 1) {
              report('page-title-off-the-gutter', heading, `${left}px from the left edge`);
            }
          }
        }
      }

      if (needsWayBack && dialogs.length === 0) {
        const back = Array.from(document.querySelectorAll('a[href], button')).find((control) => {
          const name = control.getAttribute('aria-label') ?? control.textContent ?? '';
          return shown(control) && /\bback\b/i.test(name);
        });
        if (!back) {
          report(
            'no-way-back',
            document.body,
            'no back control on a screen without the app header',
          );
        } else if (hitBox(back).height < rules.iconTargetPx) {
          report('back-control-under-44', back, `${Math.round(hitBox(back).height)}px tall`);
        }
      }

      if (app) {
        for (const heading of Array.from(document.querySelectorAll('h1')).filter(shown)) {
          const text = (heading.textContent ?? '').trim();
          const lines = textLines(heading);
          if (
            text.length <= rules.maxLabelChars &&
            getComputedStyle(heading).textAlign !== 'center' &&
            lines > 1
          ) {
            report('title-squeezed', heading, `${lines} lines`);
          }
        }
      }

      if (hasComposer) {
        const composer = document.querySelector(
          '[data-testid="chat-composer"], [data-testid="code-composer-area"]',
        );
        if (!composer || !shown(composer)) {
          report('composer-not-found', document.body, 'no composer on a screen that has one');
        } else {
          const rect = composer.getBoundingClientRect();
          const gap = Math.round(viewportHeight - rect.bottom);
          if (gap > rules.composerBottomGapPx || gap < 0) {
            report('composer-not-at-the-bottom', composer, `${gap}px above the bottom edge`);
          }
          const field = composer.querySelector(
            'textarea, [role="textbox"], [contenteditable="true"]',
          );
          const fieldTop = field ? field.getBoundingClientRect().top : rect.top;
          const rows: number[] = [];
          for (const button of Array.from(composer.querySelectorAll('button')).filter(shown)) {
            const box = button.getBoundingClientRect();
            const middle = box.top + box.height / 2;
            if (middle < fieldTop) continue;
            if (!rows.some((row) => Math.abs(row - middle) < box.height / 2)) rows.push(middle);
          }
          if (rows.length > rules.composerControlRows) {
            report('composer-controls-wrapped', composer, `${rows.length} rows of controls`);
          }
        }
      }

      return findings;
    },
    {
      rules: RULES,
      app: options.app,
      needsHeader: options.needsHeader,
      needsWayBack: options.needsWayBack ?? false,
      typeFirst: options.typeFirst ?? false,
      hasComposer: options.hasComposer,
    },
  );
}

function slug(screen: string): string {
  return screen.replace(/^\//, '').replace(/\//g, '_');
}

/**
 * A drawer or sheet is measured only once it has stopped moving. A panel still
 * four pixels short of its place reads as text inside the gutter.
 */
async function waitUntilStill(surface: Locator): Promise<void> {
  await expect
    .poll(
      async () => {
        const before = await surface.boundingBox();
        await surface.page().waitForTimeout(STILL_SAMPLE_MS);
        const after = await surface.boundingBox();
        return before !== null && JSON.stringify(before) === JSON.stringify(after);
      },
      { timeout: SETTLE_TIMEOUT_MS },
    )
    .toBe(true);
}

async function openScreen(page: Page, screen: string, consentWaitMs: number): Promise<void> {
  await page.goto(screen, { waitUntil: 'domcontentloaded', timeout: LOAD_TIMEOUT_MS });
  await page
    .getByRole('button', { name: CONSENT_DISMISS_LABEL })
    .click({ timeout: consentWaitMs })
    .catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: SETTLE_TIMEOUT_MS }).catch(() => undefined);
  await page.waitForFunction(() => document.fonts.status === 'loaded');
}

async function plantFaults(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = document.createElement('div');
    const important = (element: HTMLElement, styles: Record<string, string>) => {
      for (const [name, value] of Object.entries(styles)) {
        element.style.setProperty(name, value, 'important');
      }
    };
    important(host, {
      position: 'fixed',
      left: '0',
      top: '64px',
      width: '100%',
      'z-index': '2147483647',
      background: 'Canvas',
      color: 'CanvasText',
    });
    const plant = (
      tag: string,
      text: string,
      styles: Record<string, string>,
      attributes: Record<string, string> = {},
    ) => {
      const element = document.createElement(tag);
      element.textContent = text;
      for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
      important(element, { 'margin-left': '16px', display: 'block', ...styles });
      host.append(element);
    };
    plant('p', 'ten pixel text', { 'font-size': '10px' });
    plant('p', 'edge text', { 'font-size': '14px', 'margin-left': '4px' });
    plant('input', '', { 'font-size': '12px', width: '120px' }, { 'aria-label': 'small field' });
    plant(
      'button',
      '',
      { width: '40px', height: '40px', 'min-height': '0' },
      { role: 'switch', 'aria-checked': 'false', 'aria-label': 'squashed switch' },
    );
    plant(
      'button',
      '',
      { width: '20px', height: '20px', 'min-height': '0' },
      { 'aria-label': 'tiny target' },
    );
    plant('button', '', { width: '30px', height: '40px' }, { 'aria-label': 'narrow icon' });
    plant('button', 'Two words', {
      width: '48px',
      'white-space': 'normal',
      'font-size': '14px',
      border: '1px solid currentColor',
    });
    document.querySelector('#main-content')?.append(host);
  });
}

for (const phone of PHONES) {
  test.describe(`signed-in screens on a ${phone.name} wide phone`, () => {
    test.use({
      viewport: phone.viewport,
      hasTouch: true,
      isMobile: true,
      reducedMotion: 'reduce',
    } as never);

    test('every screen follows the phone layout rules', async ({ page }) => {
      test.setTimeout(SWEEP_TIMEOUT_MS);
      await signIn(page);
      const reports: ScreenReport[] = [];
      const evidence = EVIDENCE_DIR ? path.join(EVIDENCE_DIR, 'phone-layout', phone.name) : null;
      if (evidence) mkdirSync(evidence, { recursive: true });

      for (const screen of SCREENS) {
        await test.step(screen, async () => {
          await openScreen(page, screen, reports.length === 0 ? CONSENT_WAIT_MS : 1);

          const landedOn = new URL(page.url()).pathname;
          const findings = await measureScreen(page, {
            app: true,
            needsHeader: !BACK_ROW_SCREENS.has(screen),
            needsWayBack: BACK_ROW_SCREENS.has(screen),
            hasComposer: COMPOSER_SCREENS.has(screen),
          });
          reports.push({ screen, landedOn, findings });
          if (evidence) await page.screenshot({ path: path.join(evidence, `${slug(screen)}.png`) });
          expect.soft(findings, `${screen} at ${phone.name} wide`).toEqual([]);
        });
      }

      if (evidence) {
        writeFileSync(path.join(evidence, 'findings.json'), JSON.stringify(reports, null, 2));
      }
    });

    test('the navigation drawer follows the same rules', async ({ page }) => {
      await signIn(page);
      await openScreen(page, SHELL_SCREEN, CONSENT_WAIT_MS);
      await page.getByRole('button', { name: OPEN_NAVIGATION_LABEL }).tap();
      await expect(page.getByTestId(NAVIGATION_DRAWER)).toBeVisible();
      await page
        .waitForLoadState('networkidle', { timeout: SETTLE_TIMEOUT_MS })
        .catch(() => undefined);
      await waitUntilStill(page.getByTestId(NAVIGATION_DRAWER));

      const findings = await measureScreen(page, {
        app: true,
        needsHeader: false,
        hasComposer: false,
      });
      if (EVIDENCE_DIR) {
        const evidence = path.join(EVIDENCE_DIR, 'phone-layout', phone.name);
        mkdirSync(evidence, { recursive: true });
        await page.screenshot({ path: path.join(evidence, 'navigation-drawer.png') });
        writeFileSync(
          path.join(evidence, 'navigation-drawer.json'),
          JSON.stringify(findings, null, 2),
        );
      }
      expect(findings).toEqual([]);
    });

    for (const menu of COMPOSER_MENUS) {
      test(`the composer's ${menu.name} follows the same rules when open`, async ({ page }) => {
        await signIn(page);
        await openScreen(page, CHAT_SCREEN, CONSENT_WAIT_MS);
        await page.getByRole('button', { name: menu.opener }).first().tap();
        await expect(page.locator(menu.surface).first()).toBeVisible();
        await page
          .waitForLoadState('networkidle', { timeout: SETTLE_TIMEOUT_MS })
          .catch(() => undefined);
        await waitUntilStill(page.locator(menu.surface).first());

        const findings = await measureScreen(page, {
          app: true,
          needsHeader: false,
          hasComposer: false,
        });
        if (EVIDENCE_DIR) {
          const evidence = path.join(EVIDENCE_DIR, 'phone-layout', phone.name);
          mkdirSync(evidence, { recursive: true });
          const file = menu.name.replace(/\s+/g, '-');
          await page.screenshot({ path: path.join(evidence, `${file}.png`) });
          writeFileSync(path.join(evidence, `${file}.json`), JSON.stringify(findings, null, 2));
        }
        expect(findings).toEqual([]);
      });
    }

    test('the check finds each kind of fault when one is planted', async ({ page }) => {
      await signIn(page);
      await openScreen(page, SHELL_SCREEN, CONSENT_WAIT_MS);
      await plantFaults(page);

      const findings = await measureScreen(page, {
        app: true,
        needsHeader: true,
        hasComposer: false,
      });
      for (const planted of PLANTED_FAULTS) {
        expect(
          findings.some(
            (finding) => finding.rule === planted.rule && finding.where.includes(planted.marker),
          ),
          `${planted.rule} on ${planted.marker}: ${JSON.stringify(findings)}`,
        ).toBe(true);
      }
    });
  });
}

for (const phone of PHONES) {
  test.describe(`public screens on a ${phone.name} wide phone`, () => {
    test.use({
      viewport: phone.viewport,
      hasTouch: true,
      isMobile: true,
      reducedMotion: 'reduce',
    } as never);

    test('every public screen follows the phone layout rules', async ({ page }) => {
      test.setTimeout(SWEEP_TIMEOUT_MS);
      const reports: ScreenReport[] = [];
      const evidence = EVIDENCE_DIR
        ? path.join(EVIDENCE_DIR, 'phone-layout-public', phone.name)
        : null;
      if (evidence) mkdirSync(evidence, { recursive: true });

      for (const screen of PUBLIC_SCREENS) {
        await test.step(screen, async () => {
          await openScreen(page, screen, reports.length === 0 ? CONSENT_WAIT_MS : 1);
          const findings = await measureScreen(page, {
            app: false,
            needsHeader: false,
            hasComposer: false,
            typeFirst: TYPE_FIRST_SCREENS.has(screen),
          });
          reports.push({ screen, landedOn: new URL(page.url()).pathname, findings });
          if (evidence) await page.screenshot({ path: path.join(evidence, `${slug(screen)}.png`) });
          expect.soft(findings, `${screen} at ${phone.name} wide`).toEqual([]);
        });
      }

      if (evidence) {
        writeFileSync(path.join(evidence, 'findings.json'), JSON.stringify(reports, null, 2));
      }
    });
  });
}
