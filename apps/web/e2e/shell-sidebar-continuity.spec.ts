import { test, expect, type Page } from '@playwright/test';

import { signIn } from './qa-capability-harness';

/**
 * The rail is chrome, not page content: its list scrolls independently of the
 * conversation beside it, it is not rebuilt when the user opens another
 * destination, and its collapsed state outlives a route change.
 *
 * A browser spec rather than a jsdom one for two reasons named in
 * .claude/rules/ui-colour-and-interaction.md. Computed overflow and element
 * identity across a client-side navigation need a real layout and a real
 * router, neither of which jsdom has. And the rail's own window-level
 * arrow-key handler competes with the composer for the same keys, which is
 * exactly the listener ordering jsdom does not reproduce.
 */

const DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;
const LOAD_TIMEOUT_MS = 20_000;
const SETTLE_MS = 700;
const RAIL_SELECTOR = 'nav[style*="width"]';
const MARKER = 'shell-continuity';

async function openChat(page: Page): Promise<void> {
  await signIn(page);
  await page.goto('/chat', { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: LOAD_TIMEOUT_MS }).catch(() => undefined);
  await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
}

function railWidth(page: Page) {
  return page.evaluate(
    (selector) => (document.querySelector(selector) as HTMLElement | null)?.style.width ?? '',
    RAIL_SELECTOR,
  );
}

test.describe('app shell rail continuity', () => {
  test.setTimeout(5 * 60_000);
  test.use({ reducedMotion: 'reduce', viewport: DESKTOP_VIEWPORT } as never);

  test('the rail and the content column each own a scroll container', async ({ page }) => {
    await openChat(page);

    const regions = await page.evaluate((selector) => {
      const rail = document.querySelector(selector);
      const railRegion = rail?.querySelector<HTMLElement>('.overflow-y-auto') ?? null;
      const content = document.getElementById('main-content');
      const overflowOf = (element: HTMLElement | null) =>
        element ? getComputedStyle(element).overflowY : null;
      return {
        railOverflow: overflowOf(railRegion),
        contentOverflow: overflowOf(content),
        railInsideContent: Boolean(content && railRegion && content.contains(railRegion)),
        contentInsideRail: Boolean(rail && content && rail.contains(content)),
      };
    }, RAIL_SELECTOR);

    expect(['auto', 'scroll']).toContain(regions.railOverflow);
    expect(['auto', 'scroll']).toContain(regions.contentOverflow);
    expect(regions.railInsideContent).toBe(false);
    expect(regions.contentInsideRail).toBe(false);
  });

  test('opening another destination reuses the rail rather than rebuilding it', async ({
    page,
  }) => {
    await openChat(page);

    await page.evaluate(
      ([selector, marker]) => {
        const rail = document.querySelector(selector) as HTMLElement | null;
        if (rail) rail.dataset['continuity'] = marker;
      },
      [RAIL_SELECTOR, MARKER] as const,
    );

    await page.getByRole('button', { name: 'Library' }).first().click();
    await page.waitForURL(/\/chat\/library/, { timeout: LOAD_TIMEOUT_MS });
    await page.waitForTimeout(SETTLE_MS);

    const survived = await page.evaluate(
      (selector) =>
        (document.querySelector(selector) as HTMLElement | null)?.dataset['continuity'] ?? null,
      RAIL_SELECTOR,
    );
    expect(survived).toBe(MARKER);
  });

  test('the collapsed rail stays collapsed across a route change', async ({ page }) => {
    await openChat(page);

    const expanded = await railWidth(page);
    await page.locator('[aria-label="Toggle sidebar"]').first().click();
    await page.waitForTimeout(SETTLE_MS);

    const collapsed = await railWidth(page);
    expect(Number.parseInt(collapsed, 10)).toBeLessThan(Number.parseInt(expanded, 10));

    await page.goto('/chat/library', { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: LOAD_TIMEOUT_MS }).catch(() => undefined);
    await page.waitForTimeout(SETTLE_MS);

    expect(await railWidth(page)).toBe(collapsed);
  });

  test('the rail list handler never takes an arrow key from the composer', async ({ page }) => {
    await openChat(page);

    const composer = page.getByRole('textbox').first();
    await composer.click();
    await composer.fill('first line');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(SETTLE_MS);

    const focus = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      return {
        editable: Boolean(
          active &&
          (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT' || active.isContentEditable),
        ),
        insideRail: Boolean(active?.closest('[data-sidebar-session-index]')),
      };
    });

    expect(focus.editable).toBe(true);
    expect(focus.insideRail).toBe(false);
    await expect(composer).toHaveValue('first line');
  });
});
