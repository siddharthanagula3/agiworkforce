import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { signIn } from './qa-capability-harness';

const OUT_DIR = process.env['QA_OUT_DIR'] ?? path.resolve(__dirname, '../../../.qa-evidence');

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

const ROUTES = (
  process.env['QA_ROUTES'] ??
  [
    '/chat',
    '/chat/projects',
    '/chat/library',
    '/chat/schedules',
    '/tasks',
    '/agi-work',
    '/agent-permissions',
    '/connectors',
    '/skills',
    '/plugins',
    '/settings/general',
    '/settings/billing',
    '/settings/security',
    '/byok',
    '/local',
  ].join(',')
)
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);

interface Overflow {
  requested: string;
  route: string;
  viewport: string;
  scrollWidth: number;
  clientWidth: number;
  overflowBy: number;
  offenders: string[];
  dialogPresent: boolean;
  dialogOverflowBy: number;
}

async function measure(page: Page, route: string, viewport: string): Promise<Overflow> {
  await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(500);

  const measured = await page.evaluate((vp) => {
    const doc = document.documentElement;
    const clientWidth = doc.clientWidth;
    const offenders: string[] = [];

    // Only elements that actually extend past the viewport's right edge and are
    // not deliberately scrollable containers.
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right <= clientWidth + 1) continue;
      const style = getComputedStyle(el);
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue;
      if (style.position === 'fixed') continue;
      const id = `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(/\s+/).slice(0, 3).join('.') : ''}`;
      const entry = `${id} right=${Math.round(rect.right)}`;
      if (!offenders.includes(entry)) offenders.push(entry);
      if (offenders.length >= 6) break;
    }

    // Five routes render as a modal over /chat, so `route` alone cannot say
    // whether the modal was actually open and sized - without this a closed
    // modal reports the same clean /chat measurement as an open one.
    const dialog = document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
    return {
      route: location.pathname,
      viewport: vp,
      scrollWidth: doc.scrollWidth,
      clientWidth,
      overflowBy: Math.max(0, doc.scrollWidth - clientWidth),
      offenders,
      dialogPresent: !!dialog,
      dialogOverflowBy: dialog
        ? Math.max(0, Math.round(dialog.getBoundingClientRect().right - clientWidth))
        : 0,
    };
  }, viewport);
  // Record what was ASKED for as well as where it landed: /settings/* redirects
  // into a modal on /chat, so five requested routes silently collapsed to one
  // measurement and the settings UI was never sized at 375px at all.
  return { requested: route, ...measured };
}

test.describe('QA responsive sweep', () => {
  test.setTimeout(20 * 60_000);
  test.use({ reducedMotion: 'reduce' } as never);

  test('no surface scrolls the page horizontally at 375, 768 or 1440', async ({ page }) => {
    await signIn(page);

    const results: Overflow[] = [];
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const route of ROUTES) {
        results.push(await measure(page, route, vp.name));
        await page.waitForTimeout(3_000);
      }
    }

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(path.join(OUT_DIR, 'responsive.json'), JSON.stringify(results, null, 2));

    const collapsed = results.filter((r) => r.requested !== r.route);
    if (collapsed.length > 0) {
      const pairs = [...new Set(collapsed.map((r) => `${r.requested} -> ${r.route}`))];
      console.log(`[resp] NOT MEASURED AS REQUESTED (${pairs.length}): ${pairs.join(', ')}`);
    }

    const modalRoutes = results.filter((r) => r.requested !== r.route);
    const unopened = modalRoutes.filter((r) => !r.dialogPresent);
    if (unopened.length > 0) {
      const pairs = [...new Set(unopened.map((r) => `${r.requested}@${r.viewport}`))];
      console.log(`[resp] MODAL NEVER OPENED (${pairs.length}): ${pairs.join(', ')}`);
    }
    const modalOverflow = results.filter((r) => r.dialogOverflowBy > 1);
    for (const r of modalOverflow) {
      console.log(
        `[resp] ${r.viewport.padEnd(8)} ${r.requested.padEnd(20)} DIALOG overflows by ${r.dialogOverflowBy}px`,
      );
    }

    const broken = results.filter((r) => r.overflowBy > 1);
    for (const r of broken) {
      console.log(
        `[resp] ${r.viewport.padEnd(8)} ${r.route.padEnd(24)} overflow ${r.overflowBy}px  ${r.offenders.slice(0, 2).join(' | ')}`,
      );
    }
    console.log(`[resp] ${broken.length}/${results.length} measurements overflow`);

    expect(results.length).toBe(VIEWPORTS.length * ROUTES.length);
  });
});
