import { test, expect, type Page } from '@playwright/test';

import { signIn } from './qa-capability-harness';

/**
 * Browser rather than jsdom, for the reason `.claude/rules/ui-colour-and-interaction.md`
 * gives: every claim here turns on listener ordering. Radix's dismissable layer
 * takes Escape on `document` in the capture phase and mounts before anything
 * the sidebar opens inside it, so a field that cancels its own edit still loses
 * the drawer. jsdom has no equivalent and passed the broken build.
 */

const PHONE = { width: 390, height: 844 } as const;
const SMALL_PHONE = { width: 320, height: 568 } as const;
const DRAWER_TEST_ID = 'chat-mobile-nav-drawer';
const SETTLE_MS = 700;
const LOAD_TIMEOUT_MS = 20_000;

async function openChat(page: Page): Promise<void> {
  await signIn(page);
  await page.goto('/chat', { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: LOAD_TIMEOUT_MS }).catch(() => undefined);
  await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: LOAD_TIMEOUT_MS });
}

async function openDrawer(page: Page) {
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.waitForTimeout(SETTLE_MS);
  const drawer = page.getByTestId(DRAWER_TEST_ID);
  await expect(drawer).toBeVisible();
  return drawer;
}

test.describe('responsive interaction regressions', () => {
  test.setTimeout(6 * 60_000);
  test.use({ reducedMotion: 'reduce', viewport: PHONE } as never);

  test('Escape cancelling an inline rename leaves the navigation drawer open', async ({ page }) => {
    await openChat(page);
    const drawer = await openDrawer(page);

    const row = drawer.locator('[data-sidebar-session-index]').first();
    await expect(
      row,
      'no conversation in the sidebar, the account fixture this spec needs is gone',
    ).toBeVisible();
    await row.getByRole('button', { name: 'Conversation actions' }).click();
    await page.waitForTimeout(SETTLE_MS);
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    await page.waitForTimeout(SETTLE_MS);

    // Addressed as a user sees it, a focused text field inside the drawer, so
    // the assertion does not depend on the attribute the fix happens to use.
    const field = drawer.locator('input[type="text"], input:not([type])');
    await expect(field.first(), 'the rename field never opened').toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(SETTLE_MS);

    await expect(field, 'Escape left the rename field open').toHaveCount(0);
    await expect(
      drawer,
      'Escape cancelling the rename tore down the whole navigation drawer',
    ).toBeVisible();
  });

  test('the drawer still takes the Escape that follows a cancelled rename', async ({ page }) => {
    await openChat(page);
    const drawer = await openDrawer(page);

    const row = drawer.locator('[data-sidebar-session-index]').first();
    await row.getByRole('button', { name: 'Conversation actions' }).click();
    await page.waitForTimeout(SETTLE_MS);
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    await page.waitForTimeout(SETTLE_MS);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(SETTLE_MS);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(SETTLE_MS);

    await expect(
      drawer,
      'the guard kept declining after the rename closed, so Escape could never close the drawer',
    ).toHaveCount(0);
  });

  test('a send with the connection down names the connection, not a render failure', async ({
    page,
    context,
  }) => {
    await openChat(page);
    await context.setOffline(true);

    try {
      await page.getByRole('textbox').first().click();
      await page.keyboard.type('offline probe');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(6000);

      const alert = page
        .getByRole('alert')
        .filter({ hasText: /offline|reach the server|rendering/i });
      await expect(alert, 'no failure state appeared for a send with the network down').toBeVisible(
        {
          timeout: LOAD_TIMEOUT_MS,
        },
      );
      const copy = (await alert.innerText()).replace(/\s+/g, ' ');
      expect(copy, 'the offline failure still blamed rendering').not.toMatch(
        /rendering this conversation/i,
      );
      expect(copy).toMatch(/offline|reach the server/i);
      await expect(page.getByRole('link', { name: 'Back to chat' })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test('the row menu and its delete confirmation stay inside a 320px viewport', async ({
    page,
  }) => {
    await page.setViewportSize(SMALL_PHONE);
    await openChat(page);
    const drawer = await openDrawer(page);

    const row = drawer.locator('[data-sidebar-session-index]').first();
    await row.getByRole('button', { name: 'Conversation actions' }).click();
    await page.waitForTimeout(SETTLE_MS);
    await expect(page.locator('[role="menu"]').first()).toBeVisible();
    expect(await outsideViewport(page), 'the row menu rendered outside the viewport').toEqual([]);

    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.waitForTimeout(SETTLE_MS);

    // The drawer is itself a `role="dialog"`, so the confirmation is addressed
    // by its own copy rather than by position in the dialog list.
    const confirm = page
      .locator('[role="alertdialog"], [role="dialog"]')
      .filter({ hasText: /cannot be undone/i })
      .last();
    await expect(confirm).toBeVisible();
    expect(
      await confirm.innerText(),
      'the delete confirmation must name the consequence, not ask "are you sure"',
    ).toMatch(/cannot be undone/i);
    expect(await outsideViewport(page), 'the confirmation rendered outside the viewport').toEqual(
      [],
    );

    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(SETTLE_MS);
    await expect(confirm).toHaveCount(0);
  });
});

/** Overlays whose box leaves the viewport, read from the live layout. */
function outsideViewport(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    const ch = document.documentElement.clientHeight;
    const out: string[] = [];
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>(
        '[role="menu"], [role="dialog"], [role="alertdialog"]',
      ),
    )) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const bad: string[] = [];
      if (r.left < -1) bad.push(`left ${Math.round(r.left)}`);
      if (r.right > cw + 1) bad.push(`right ${Math.round(r.right)} > ${cw}`);
      if (r.top < -1) bad.push(`top ${Math.round(r.top)}`);
      if (r.bottom > ch + 1) bad.push(`bottom ${Math.round(r.bottom)} > ${ch}`);
      if (bad.length) out.push(`${el.getAttribute('role')}: ${bad.join(', ')}`);
    }
    return out;
  });
}
