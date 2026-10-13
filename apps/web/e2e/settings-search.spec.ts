import { expect, test, type Locator, type Page } from '@playwright/test';

import { signIn } from './qa-capability-harness';

const PRIVACY_PATH = '/settings/privacy';
const TIME_FOCUS_PATH = '/settings/time-focus';
const HAND_BACK_SETTLE_MS = 100;

interface OpenSettings {
  dialog: Locator;
  pane: Locator;
}

async function openSettings(page: Page, path: string): Promise<OpenSettings> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/chat/);
  return { dialog, pane: dialog.locator('#settings-pane') };
}

async function searchFor(dialog: Locator, query: string): Promise<Locator> {
  await dialog.getByRole('searchbox', { name: 'Search settings' }).fill(query);
  const results = dialog
    .getByRole('navigation', { name: 'Settings navigation' })
    .locator('button[aria-controls="settings-pane"]');
  await expect(results).toHaveText(['General']);
  return results.first();
}

async function expectRevealed(control: Locator): Promise<void> {
  await expect(control).toBeFocused();
  await expect(control).toBeInViewport({ ratio: 1 });
}

/**
 * A closing prompt hands focus back a task after it leaves the page, so a
 * focus read taken the moment the prompt is gone can still be the state the
 * hand-back is about to replace.
 */
async function afterPromptHandsFocusBack(page: Page): Promise<void> {
  await page.evaluate(
    (settle) => new Promise<void>((resolve) => window.setTimeout(resolve, settle)),
    HAND_BACK_SETTLE_MS,
  );
}

test.describe('settings search', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('"font" finds General and a click lands on the Chat font control', async ({ page }) => {
    test.setTimeout(120_000);

    const { dialog, pane } = await openSettings(page, PRIVACY_PATH);
    const general = await searchFor(dialog, 'font');

    await general.click();

    await expect(general).toHaveAttribute('aria-current', 'page');
    await expectRevealed(pane.getByRole('combobox', { name: 'Chat font', exact: true }));
  });

  test('"text size" finds General and the keyboard lands on the Chat text size control', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const { dialog, pane } = await openSettings(page, PRIVACY_PATH);
    const general = await searchFor(dialog, 'text size');

    await page.keyboard.press('Tab');
    await expect(general).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(general).toHaveAttribute('aria-current', 'page');
    await expectRevealed(pane.getByRole('combobox', { name: 'Chat text size', exact: true }));
  });

  test('a section-level query opens General without moving focus to a control', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const { dialog, pane } = await openSettings(page, PRIVACY_PATH);
    const general = await searchFor(dialog, 'custom instructions');

    await general.click();

    await expect(general).toHaveAttribute('aria-current', 'page');
    await expect(pane.getByRole('combobox', { name: 'Chat font', exact: true })).toBeAttached();
    await expect(general).toBeFocused();
  });

  test('the unsaved-changes prompt still guards the jump, and Discard lands on the control', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const { dialog, pane } = await openSettings(page, TIME_FOCUS_PATH);
    const quietHours = pane.getByRole('switch', { name: 'Enable quiet hours' });
    await expect(quietHours).toBeEnabled({ timeout: 20_000 });
    const stored = await quietHours.isChecked();

    await quietHours.click();
    await expect(quietHours).toBeChecked({ checked: !stored });

    const general = await searchFor(dialog, 'font');
    const prompt = page.getByRole('alertdialog');
    const chatFont = pane.getByRole('combobox', { name: 'Chat font', exact: true });

    await general.click();
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Keep editing' }).click();
    await expect(prompt).toBeHidden();
    await afterPromptHandsFocusBack(page);

    await expect(quietHours).toBeChecked({ checked: !stored });
    await expect(chatFont).toHaveCount(0);
    await expect(general).toBeFocused();

    await general.click();
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Discard' }).click();
    await expect(prompt).toBeHidden();
    await afterPromptHandsFocusBack(page);

    await expect(general).toHaveAttribute('aria-current', 'page');
    await expectRevealed(chatFont);

    await dialog.getByRole('searchbox', { name: 'Search settings' }).fill('');
    await dialog.getByRole('button', { name: 'Time and focus', exact: true }).click();
    await expect(quietHours).toBeEnabled({ timeout: 20_000 });
    await expect(quietHours).toBeChecked({ checked: stored });
  });
});
