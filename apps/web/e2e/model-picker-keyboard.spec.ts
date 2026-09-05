import { test, expect } from '@playwright/test';
import { signIn } from './qa-capability-harness';

/**
 * jsdom has no competing listeners, so the menu keyboard fix passed its unit
 * test while broken in Chrome once before: the sidebar's own arrow handler
 * consumed the event first. These assertions only mean something in a browser.
 */
test.describe('model picker keyboard event order', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });
    await page.locator('#model-selector').waitFor({ timeout: 30_000 });
  });

  test('arrows walk the short list rather than the sidebar behind it', async ({ page }) => {
    await page.locator('#model-selector').click();
    const panel = page.getByRole('dialog', { name: 'Models' });
    await panel.waitFor();

    await page.keyboard.press('ArrowDown');
    const focusedInPanel = await page.evaluate(() => {
      const active = document.activeElement;
      const dialog = document.querySelector('[role="dialog"]');
      return Boolean(active && dialog?.contains(active));
    });
    expect(focusedInPanel).toBe(true);
  });

  test('escape unwinds the catalogue first and the short list second', async ({ page }) => {
    await page.locator('#model-selector').click();
    const panel = page.getByRole('dialog', { name: 'Models' });
    await panel.waitFor();
    await panel.getByRole('button', { name: /All models/ }).click();
    await panel.getByRole('textbox', { name: 'Search models' }).waitFor();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Models' })).toBeVisible();
    await expect(
      page.getByRole('dialog', { name: 'Models' }).getByRole('textbox', { name: 'Search models' }),
    ).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Models' })).toHaveCount(0);
    await expect(page.locator('#model-selector')).toBeFocused();
  });

  test('tab keeps focus inside the catalogue and does not close it', async ({ page }) => {
    await page.locator('#model-selector').click();
    const panel = page.getByRole('dialog', { name: 'Models' });
    await panel.waitFor();
    await panel.getByRole('button', { name: /All models/ }).click();
    await panel.getByRole('textbox', { name: 'Search models' }).waitFor();

    for (let press = 0; press < 6; press += 1) await page.keyboard.press('Tab');

    await expect(page.getByRole('dialog', { name: 'Models' })).toBeVisible();
    expect(
      await page.evaluate(() => {
        const active = document.activeElement;
        const dialog = document.querySelector('[role="dialog"]');
        return Boolean(active && dialog?.contains(active));
      }),
    ).toBe(true);
  });

  test('typing on the short list opens the catalogue on that query', async ({ page }) => {
    await page.locator('#model-selector').click();
    const panel = page.getByRole('dialog', { name: 'Models' });
    await panel.waitFor();

    await page.keyboard.type('cla');
    const search = panel.getByRole('textbox', { name: 'Search models' });
    await search.waitFor({ timeout: 10_000 });
    await expect(search).toHaveValue('cla');
  });
});
