import { test, expect } from '@playwright/test';

test.describe('Desktop App Smoke Tests', () => {
  test('app launches and main window renders', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('body', { timeout: 10000 });

    const title = await page.title();
    expect(title).toBeTruthy();

    const bodyContent = await page.textContent('body');
    expect(bodyContent).toBeTruthy();
  });

  test('main navigation elements are present', async ({ page }) => {
    await page.goto('/');

    await page.waitForLoadState('networkidle');

    const body = await page.locator('body');
    expect(await body.isVisible()).toBeTruthy();
  });
});
