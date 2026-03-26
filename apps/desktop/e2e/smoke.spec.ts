import { test, expect } from '@playwright/test';

test.describe('Desktop App Smoke Tests', () => {
  test('app launches and main window renders', async ({ page }) => {
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Verify we got a response (may redirect to login)
    expect(response?.status()).toBeLessThan(400);

    // Wait for page to settle
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Page should have content — either the app or the login page
    const title = await page.title();
    expect(title).toBeTruthy();

    const html = await page.content();
    // Either the #root div (SPA) or a login form should be present
    const hasRoot = html.includes('id="root"');
    const hasLoginForm =
      html.includes('Sign in') || html.includes('Sign In') || html.includes('Welcome');
    expect(hasRoot || hasLoginForm).toBeTruthy();
  });

  test('main navigation elements are present', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // The page should have interactive elements (buttons, links, inputs)
    const interactiveElements = await page.locator('button, a, input').count();
    expect(interactiveElements).toBeGreaterThan(0);
  });
});
