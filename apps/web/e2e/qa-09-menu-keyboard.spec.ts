import { test, expect } from '@playwright/test';

import { signIn } from './qa-capability-harness';

/**
 * The unit test for this pattern passes in jsdom even when the behaviour is
 * broken in a real browser: the sidebar runs its own arrow-key list navigation
 * at document level, and it consumed ArrowDown before the menu's React handler
 * saw it, walking focus out of the open menu and into the conversation list.
 * jsdom has no competing listener, so only a live run catches the regression.
 */
test.describe('sidebar menu keyboard pattern', () => {
  test.setTimeout(10 * 60_000);
  test.use({ reducedMotion: 'reduce' } as never);

  test('arrow keys stay inside the open menu and Escape restores the trigger', async ({ page }) => {
    await signIn(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(1_200);

    const trigger = page.getByRole('button', { name: 'Organize chats' }).first();
    await expect(trigger).toBeVisible();
    await trigger.click();
    await page.waitForTimeout(700);

    const read = () =>
      page.evaluate(() => {
        const panel = document.querySelector('[role="menu"]');
        return {
          open: !!panel,
          itemCount: panel ? panel.querySelectorAll('[role="menuitem"]').length : 0,
          activeRole: document.activeElement?.getAttribute('role') ?? null,
          activeInPanel: panel ? panel.contains(document.activeElement) : false,
          activeText: (document.activeElement?.textContent ?? '').trim().slice(0, 40),
        };
      });

    const opened = await read();
    expect(opened.open, 'menu did not open').toBe(true);
    expect(opened.itemCount).toBeGreaterThan(1);
    expect(opened.activeInPanel, 'focus was not moved into the menu on open').toBe(true);
    expect(opened.activeRole).toBe('menuitem');
    const firstLabel = opened.activeText;

    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(250);
    const moved = await read();
    expect(moved.activeInPanel, 'ArrowDown moved focus out of the menu').toBe(true);
    expect(moved.activeRole).toBe('menuitem');
    expect(moved.activeText).not.toBe(firstLabel);

    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(250);
    const back = await read();
    expect(back.activeInPanel).toBe(true);
    expect(back.activeText).toBe(firstLabel);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    const closed = await page.evaluate(() => ({
      gone: !document.querySelector('[role="menu"]'),
      label: document.activeElement?.getAttribute('aria-label') ?? null,
    }));
    expect(closed.gone, 'Escape did not close the menu').toBe(true);
    expect(closed.label, 'focus was not returned to the trigger').toBe('Organize chats');
  });

  test('the project detail menu behaves like its sibling on the list page', async ({ page }) => {
    // Both surfaces render the same role="menu" with the same items. The list
    // page got the keyboard contract; the detail page kept outside-mousedown
    // only, so the same control behaved differently depending on where it was.
    await signIn(page);
    await page.goto('/chat/projects', { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(1_200);

    // Not skipped when there is no project: this spec can only verify the menu
    // by opening one, so a missing fixture must fail loudly rather than report
    // a green run that checked nothing.
    const open = page.getByRole('button', { name: /^Open project/ }).first();
    await expect(
      open,
      'no project to open, the account fixture this spec needs is gone',
    ).toBeVisible();
    await open.click();
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(1_200);

    const trigger = page.getByTestId('project-detail-menu-btn').first();
    await expect(trigger).toBeVisible();
    await trigger.click();
    await page.waitForTimeout(700);

    const opened = await page.evaluate(() => {
      const menu = document.querySelector('[data-testid="project-detail-menu"]');
      return {
        open: !!menu,
        focusInside: menu ? menu.contains(document.activeElement) : false,
      };
    });
    expect(opened.open, 'menu did not open').toBe(true);
    expect(opened.focusInside, 'focus was not moved into the menu').toBe(true);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    const closed = await page.evaluate(() => ({
      gone: !document.querySelector('[data-testid="project-detail-menu"]'),
      label: document.activeElement?.getAttribute('aria-label') ?? null,
    }));
    expect(closed.gone, 'Escape did not close the detail menu').toBe(true);
    expect(closed.label, 'focus was not returned to the trigger').toBe('Project options');
  });
});
