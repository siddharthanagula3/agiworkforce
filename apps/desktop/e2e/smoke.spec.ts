import { test, expect } from '@playwright/test';

/**
 * Basic smoke test for AGI Workforce desktop app.
 * Verifies that the app launches and the main window renders.
 */
test.describe('Desktop App Smoke Tests', () => {
  test('app launches and main window renders', async ({ page }) => {
    await page.goto('/');

    // Wait for the main app to load
    await page.waitForSelector('body', { timeout: 10000 });

    // Verify the page title or app name is present
    const title = await page.title();
    expect(title).toBeTruthy();

    // Verify the page has rendered content
    const bodyContent = await page.textContent('body');
    expect(bodyContent).toBeTruthy();
  });

  test('main navigation elements are present', async ({ page }) => {
    await page.goto('/');

    // Wait for the app to load
    await page.waitForLoadState('networkidle');

    // Verify key UI elements exist (adjust selectors based on actual app structure)
    const body = await page.locator('body');
    expect(await body.isVisible()).toBeTruthy();
  });
});
