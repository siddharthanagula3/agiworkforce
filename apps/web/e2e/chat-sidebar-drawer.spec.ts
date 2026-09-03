import { test, expect, type Page } from '@playwright/test';

import { signIn } from './qa-capability-harness';

const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const DRAWER_TEST_ID = 'chat-mobile-nav-drawer';
const TRIGGER_NAME = 'Open navigation';
const TRIGGER_SELECTOR = `[aria-label="${TRIGGER_NAME}"]`;
const SETTLE_MS = 700;
const LOAD_TIMEOUT_MS = 20_000;

async function openChat(page: Page): Promise<void> {
  await signIn(page);
  await page.goto('/chat', { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: LOAD_TIMEOUT_MS }).catch(() => undefined);
  await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
}

/** Where focus actually is, read from the live document rather than inferred. */
function readFocus(page: Page) {
  return page.evaluate((testId) => {
    const drawer = document.querySelector(`[data-testid="${testId}"]`);
    const active = document.activeElement;
    return {
      insideDrawer: drawer ? drawer.contains(active) : false,
      activeLabel: active?.getAttribute('aria-label') ?? null,
    };
  }, DRAWER_TEST_ID);
}

test.describe('chat sidebar drawer', () => {
  test.setTimeout(5 * 60_000);
  // `as never` matches qa-09-menu-keyboard.spec.ts: the installed
  // @playwright/test types do not surface `reducedMotion` on the fixtures type.
  test.use({ reducedMotion: 'reduce', viewport: MOBILE_VIEWPORT } as never);

  test('the trigger opens the drawer and moves focus into it', async ({ page }) => {
    await openChat(page);

    const trigger = page.getByRole('button', { name: TRIGGER_NAME });
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId(DRAWER_TEST_ID)).toHaveCount(0);

    await trigger.click();
    await page.waitForTimeout(SETTLE_MS);

    const drawer = page.getByTestId(DRAWER_TEST_ID);
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator(TRIGGER_SELECTOR)).toHaveAttribute('aria-expanded', 'true');
    // The sidebar itself, not just the panel that frames it. Exact, so the
    // project rows' "New chat in {name}" cannot stand in for it.
    await expect(drawer.getByRole('button', { name: 'New chat', exact: true })).toBeVisible();

    const focus = await readFocus(page);
    expect(focus.insideDrawer, 'focus stayed outside the open drawer').toBe(true);
  });

  test('Escape closes the drawer and returns focus to the trigger', async ({ page }) => {
    await openChat(page);

    const trigger = page.getByRole('button', { name: TRIGGER_NAME });
    await trigger.click();
    await page.waitForTimeout(SETTLE_MS);
    await expect(page.getByTestId(DRAWER_TEST_ID)).toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(SETTLE_MS);

    await expect(page.getByTestId(DRAWER_TEST_ID)).toHaveCount(0);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // Radix has no Trigger to restore to here (the button lives outside the
    // sheet), so the page does the hand-back itself in onCloseAutoFocus. If
    // that were dropped, focus would land on <body> and a keyboard user would
    // be back at the top of the document.
    const focus = await readFocus(page);
    expect(focus.activeLabel, 'focus was not returned to the drawer trigger').toBe(TRIGGER_NAME);
  });

  test('clicking the overlay closes the drawer', async ({ page }) => {
    await openChat(page);

    const trigger = page.getByRole('button', { name: TRIGGER_NAME });
    await trigger.click();
    await page.waitForTimeout(SETTLE_MS);
    await expect(page.getByTestId(DRAWER_TEST_ID)).toBeVisible();

    // The overlay is the sheet's sibling inside the portal and covers the full
    // viewport; click far to the right of the 280px panel so the press lands on
    // the overlay rather than on anything inside the drawer.
    await page.mouse.click(MOBILE_VIEWPORT.width - 20, Math.round(MOBILE_VIEWPORT.height / 2));
    await page.waitForTimeout(SETTLE_MS);

    await expect(page.getByTestId(DRAWER_TEST_ID)).toHaveCount(0);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  /**
   * The sidebar's row menu portals its panel straight to <body>, outside the
   * Radix layer, and a modal Radix dialog sets `pointer-events: none` on
   * <body> while it is open. The hand-rolled drawer never touched body pointer
   * events, so this only became reachable with the Sheet. A panel that renders
   * and ignores every tap looks identical to a working one in a screenshot and
   * in jsdom.
   */
  test('the row action menu stays operable inside the drawer', async ({ page }) => {
    await openChat(page);

    const trigger = page.getByRole('button', { name: TRIGGER_NAME });
    await trigger.click();
    await page.waitForTimeout(SETTLE_MS);

    const drawer = page.getByTestId(DRAWER_TEST_ID);
    const row = drawer.locator('[data-sidebar-session-index]').first();
    await expect(
      row,
      'no conversation in the sidebar, the account fixture this spec needs is gone',
    ).toBeVisible();

    await row.hover();
    await row.getByRole('button', { name: 'Conversation actions' }).click();
    await page.waitForTimeout(SETTLE_MS);

    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible();
    const pointerEvents = await menu.evaluate((el) => getComputedStyle(el).pointerEvents);
    expect(pointerEvents, 'the portalled menu inherited the dialog body lock').toBe('auto');
    await expect(menu.getByRole('menuitem').first()).toBeEnabled();

    // Escape belongs to the menu, not the drawer behind it: the menu's own
    // capture-phase handler stops the event before Radix's dialog listener.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(SETTLE_MS);
    await expect(menu).toHaveCount(0);
    await expect(drawer, 'Escape tore down the drawer along with the menu').toBeVisible();
  });

  test('selecting a conversation closes the drawer and opens that conversation', async ({
    page,
  }) => {
    await openChat(page);

    const trigger = page.getByRole('button', { name: TRIGGER_NAME });
    await trigger.click();
    await page.waitForTimeout(SETTLE_MS);

    const drawer = page.getByTestId(DRAWER_TEST_ID);
    await expect(drawer).toBeVisible();

    // Not skipped when the account has no conversations: this spec can only
    // verify the close-on-select wiring by selecting one, so a missing fixture
    // must fail loudly rather than report a green run that checked nothing.
    const row = drawer.locator('[data-sidebar-session-index] button').first();
    await expect(
      row,
      'no conversation in the sidebar, the account fixture this spec needs is gone',
    ).toBeVisible();

    await row.click();
    await page.waitForTimeout(SETTLE_MS);

    await expect(drawer).toHaveCount(0);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page).toHaveURL(/\/chat\/.+/);
  });
});
