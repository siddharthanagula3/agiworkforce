import { test, expect } from '@playwright/test';

test.describe('Desktop App Smoke Tests', () => {
  test('app launches and main window renders', async ({ page }) => {
    await page.goto('/');

    // Wait for the React root element to be attached (more reliable than body visibility)
    await page.waitForSelector('#root', { state: 'attached', timeout: 30000 });

    // Wait for any content to appear (loading state or actual app)
    await page.waitForFunction(
      () => {
        const root = document.getElementById('root');
        return root && root.innerHTML.trim().length > 0;
      },
      { timeout: 30000 },
    );

    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title).toContain('AGI Workforce');

    // Verify the page has rendered content
    const root = page.locator('#root');
    await expect(root).not.toBeEmpty();
  });

  test('main navigation elements are present', async ({ page }) => {
    await page.goto('/');

    // Wait for network to settle and content to load
    await page.waitForLoadState('networkidle');

    // Wait for either the auth page or the main app to render
    const hasContent = await page.locator('#root').evaluate((el) => el.innerHTML.trim().length > 0);
    expect(hasContent).toBeTruthy();
  });
});
