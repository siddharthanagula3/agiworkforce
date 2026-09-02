import { expect, test } from '@playwright/test';

const ROUTE = '/dev/landing-preview';
const PHONE = { width: 390, height: 844 };
const MIN_TARGET_PX = 44;
const SHEET_LINKS = ['Product', 'Pricing', 'Docs', 'Sign in', 'Try AGI Web'];

test.describe('marketing mobile navigation', () => {
  test.use({ viewport: PHONE });

  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'networkidle' });
  });

  test('the header nav is unreachable without the menu button below 768px', async ({ page }) => {
    await expect(page.locator('nav[aria-label="Primary"]')).toBeHidden();

    const trigger = page.getByRole('button', { name: 'Menu' });
    await expect(trigger).toBeVisible();

    const box = await trigger.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  });

  test('the sheet carries every header destination and the primary call to action', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Menu' }).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();

    const nav = sheet.getByRole('navigation', { name: 'Site' });
    for (const label of SHEET_LINKS) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }

    await expect(nav.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing');
    await expect(nav.getByRole('link', { name: 'Try AGI Web' })).toHaveAttribute(
      'href',
      /^\/login\?redirectTo=/,
    );
  });

  test('escape closes the sheet and returns focus to the menu button', async ({ page }) => {
    const trigger = page.getByRole('button', { name: 'Menu' });
    await trigger.click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    await expect(trigger).toBeFocused();
  });

  test('the page behind the sheet cannot scroll while it is open', async ({ page }) => {
    const overflowWhileClosed = await page.evaluate(() => getComputedStyle(document.body).overflow);
    expect(overflowWhileClosed).not.toBe('hidden');

    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
      .toBe('hidden');

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
      .not.toBe('hidden');
  });
});
