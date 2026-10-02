import { expect, test, type Locator, type Page } from '@playwright/test';
import { TOOL_APPROVAL_POLICY_OPTIONS } from '@agiworkforce/types';
import { signIn } from './qa-capability-harness';

const APPROVAL_MODE = 'Approval mode';
const COMPOSER = 'Describe a task or ask a question';
const PLAN = 'Plan';
const PLAN_DIGIT = String(TOOL_APPROVAL_POLICY_OPTIONS.length + 1);

async function openModeMenu(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: APPROVAL_MODE }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return menu;
}

async function checkedPolicyDigit(menu: Locator): Promise<string> {
  const checked = await menu
    .getByRole('menuitemradio')
    .evaluateAll((rows) => rows.findIndex((row) => row.getAttribute('aria-checked') === 'true'));
  expect(checked).toBeGreaterThanOrEqual(0);
  expect(checked).toBeLessThan(TOOL_APPROVAL_POLICY_OPTIONS.length);
  return String(checked + 1);
}

test.describe('digit shortcuts in the Code mode menu', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto('/code', { waitUntil: 'domcontentloaded' });
    const trigger = page.getByRole('button', { name: APPROVAL_MODE });
    await expect(trigger).toBeVisible({ timeout: 30_000 });
    await expect(trigger).not.toHaveAttribute('aria-busy', 'true', { timeout: 30_000 });
  });

  test('the badge digit picks its row and closes the menu', async ({ page }) => {
    const trigger = page.getByRole('button', { name: APPROVAL_MODE });
    const menu = await openModeMenu(page);
    const storedDigit = await checkedPolicyDigit(menu);
    const stored = TOOL_APPROVAL_POLICY_OPTIONS[Number(storedDigit) - 1]!;
    const planOffered =
      (await menu.getByRole('menuitemradio', { name: new RegExp(PLAN) }).count()) > 0;

    await page.keyboard.press(planOffered ? PLAN_DIGIT : storedDigit);

    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger).toContainText(planOffered ? PLAN : stored.shortLabel);

    if (planOffered) {
      await openModeMenu(page);
      await page.keyboard.press(storedDigit);
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect(trigger).toContainText(stored.shortLabel);
    }
  });

  test('a digit typed in the composer stays text', async ({ page }) => {
    const composer = page.getByRole('textbox', { name: COMPOSER });
    await composer.click();

    await page.keyboard.type('123');

    await expect(composer).toHaveValue('123');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await composer.fill('');
  });
});
