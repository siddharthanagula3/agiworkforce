import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { signIn } from './qa-capability-harness';

const OUT_DIR = process.env['QA_OUT_DIR'] ?? path.resolve(__dirname, '../../../.qa-evidence');

/**
 * Controls that mutate or destroy the founder's real account data. The crawl
 * signs in as a real user against a real database, so these are enumerated and
 * reported but never clicked.
 */
const DESTRUCTIVE = new RegExp(
  [
    'delete',
    'remove',
    'archive',
    'revoke',
    'disconnect',
    'unlink',
    'reset',
    'sign out',
    'log out',
    'logout',
    'cancel subscription',
    'downgrade',
    'upgrade',
    'buy',
    'purchase',
    'pay',
    'checkout',
    'subscribe',
    'clear all',
    'erase',
    'wipe',
    'deactivate',
    'close account',
    'leave',
    'transfer',
    'regenerate',
    'rotate',
    'invite',
    'send',
  ].join('|'),
  'i',
);

interface Control {
  index: number;
  tag: string;
  role: string | null;
  name: string;
  selector: string;
  disabled: boolean;
  width: number;
  height: number;
  visible: boolean;
}

interface ClickOutcome {
  route: string;
  control: string;
  role: string | null;
  skipped: 'destructive' | 'disabled' | 'offscreen' | null;
  domChanged: boolean;
  urlChanged: boolean;
  newUrl: string | null;
  dialogOpened: boolean;
  toastAppeared: boolean;
  requestsFired: number;
  focusMoved: boolean;
  consoleErrors: string[];
  dead: boolean;
  tinyTarget: boolean;
  error: string | null;
}

async function enumerateControls(page: Page): Promise<Control[]> {
  return page.evaluate(() => {
    const SEL =
      'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"], [role="radio"], [role="combobox"], [role="link"], [contenteditable="true"], summary';
    const out: Control[] = [] as never;
    // Routes like /skills and /connectors render a modal over /chat. Controls
    // behind an open dialog are correctly click-blocked by the overlay, so
    // enumerating them produces a timeout per control that looks like a defect
    // and is really the modal doing its job.
    const dialog = document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
    const root: ParentNode = dialog ?? document;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>(SEL)).filter((el) => {
      // A skip link is deliberately offscreen until focused; clicking it blind
      // times out. It is exercised by the keyboard pass instead.
      const cls = String(el.className);
      return !cls.includes('sr-only') && !el.closest('.sr-only');
    });
    nodes.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none';
      const name = (
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        (el as HTMLInputElement).placeholder ||
        el.textContent ||
        el.getAttribute('name') ||
        ''
      )
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 70);
      el.setAttribute('data-qa-crawl', String(i));
      out.push({
        index: i,
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        name,
        selector: `[data-qa-crawl="${i}"]`,
        disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        visible,
      });
    });
    return out;
  });
}

async function snapshot(page: Page): Promise<string> {
  return page.evaluate(
    () => document.body.innerHTML.length + '|' + document.body.innerText.slice(0, 4000),
  );
}

async function crawlRoute(page: Page, route: string, max: number): Promise<ClickOutcome[]> {
  const outcomes: ClickOutcome[] = [];
  await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(800);

  const controls = (await enumerateControls(page)).filter((c) => c.visible);

  for (const control of controls.slice(0, max)) {
    const base: ClickOutcome = {
      route,
      control: `${control.tag}${control.role ? `[${control.role}]` : ''} "${control.name}"`,
      role: control.role,
      skipped: null,
      domChanged: false,
      urlChanged: false,
      newUrl: null,
      dialogOpened: false,
      toastAppeared: false,
      requestsFired: 0,
      focusMoved: false,
      consoleErrors: [],
      dead: false,
      tinyTarget: control.width > 0 && (control.width < 24 || control.height < 24),
      error: null,
    };

    if (DESTRUCTIVE.test(control.name)) {
      base.skipped = 'destructive';
      outcomes.push(base);
      continue;
    }
    if (control.disabled) {
      base.skipped = 'disabled';
      outcomes.push(base);
      continue;
    }

    // Reset to a known state so each control is judged independently. Clearing
    // persisted UI state matters as much as reloading: "Collapse sidebar" writes
    // to localStorage, so without this every later control is judged against a
    // collapsed sidebar and reads as dead when it is not.
    await page
      .evaluate(() => {
        for (const key of Object.keys(localStorage)) {
          if (!key.toLowerCase().includes('clerk') && key !== 'theme') localStorage.removeItem(key);
        }
      })
      .catch(() => undefined);
    await page
      .goto(route, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      .catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    await enumerateControls(page);

    const target = page.locator(control.selector).first();
    if ((await target.count()) === 0) {
      base.error = 'control vanished after reload';
      outcomes.push(base);
      continue;
    }

    const errors: string[] = [];
    let requests = 0;
    const onConsole = (m: { type: () => string; text: () => string }) => {
      if (m.type() === 'error') errors.push(m.text().slice(0, 200));
    };
    const onRequest = () => {
      requests += 1;
    };
    page.on('console', onConsole);
    page.on('request', onRequest);

    const beforeDom = await snapshot(page);
    const beforeUrl = page.url();
    const beforeFocus = await page.evaluate(
      () => document.activeElement?.getAttribute('data-qa-crawl') ?? 'none',
    );

    try {
      await target.click({ timeout: 5_000, trial: false });
      await page.waitForTimeout(1_100);
    } catch (error) {
      base.error = String(error).slice(0, 120);
    }

    const afterDom = await snapshot(page);
    const afterUrl = page.url();
    const post = await page.evaluate(() => ({
      dialog: !!document.querySelector('[role="dialog"], [role="alertdialog"]'),
      menu: !!document.querySelector(
        '[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]',
      ),
      toast: !!document.querySelector(
        '[role="status"], [role="alert"], [data-sonner-toast], .toast',
      ),
      focus: document.activeElement?.getAttribute('data-qa-crawl') ?? 'none',
    }));

    page.off('console', onConsole);
    page.off('request', onRequest);

    base.domChanged = beforeDom !== afterDom;
    base.urlChanged = beforeUrl !== afterUrl;
    base.newUrl = base.urlChanged ? new URL(afterUrl).pathname : null;
    base.dialogOpened = post.dialog || post.menu;
    base.toastAppeared = post.toast;
    base.focusMoved = post.focus !== beforeFocus;
    base.requestsFired = requests;
    base.consoleErrors = errors;
    // "Clicking works but nothing visibly acknowledges it" - no DOM change, no
    // navigation, no dialog, no toast and no network call means the user got
    // no feedback whatsoever.
    base.dead =
      !base.domChanged &&
      !base.urlChanged &&
      !base.dialogOpened &&
      !base.toastAppeared &&
      requests === 0 &&
      !base.error;

    outcomes.push(base);
  }

  return outcomes;
}

const ROUTES = (process.env['QA_CRAWL_ROUTES'] ?? '/chat')
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);
const MAX = Number(process.env['QA_CRAWL_MAX'] ?? '25');

test.describe('QA interaction crawl', () => {
  test.setTimeout(45 * 60_000);
  test.use({ reducedMotion: 'reduce' } as never);

  test('every visible control is clicked and its feedback recorded', async ({ page }) => {
    await signIn(page);

    const all: ClickOutcome[] = [];
    for (const route of ROUTES) {
      all.push(...(await crawlRoute(page, route, MAX)));
    }

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(
      path.join(OUT_DIR, `interaction-crawl-${ROUTES[0]!.replace(/\W+/g, '_')}.json`),
      JSON.stringify(all, null, 2),
    );

    const dead = all.filter((o) => o.dead);
    const tiny = all.filter((o) => o.tinyTarget && !o.skipped);
    const errored = all.filter((o) => o.consoleErrors.length > 0);
    console.log(
      `[crawl] ${all.length} controls | dead=${dead.length} tinyTarget=${tiny.length} consoleErr=${errored.length} skipped=${all.filter((o) => o.skipped).length}`,
    );
    expect(all.length).toBeGreaterThan(0);
  });
});
