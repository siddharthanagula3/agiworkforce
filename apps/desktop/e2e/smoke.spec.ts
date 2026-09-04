import { test, expect } from '@playwright/test';

test.describe('Desktop App Smoke Tests', () => {
  test('app launches and main window renders', async ({ page }) => {
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });

    expect(response?.status()).toBeLessThan(400);

    await page.waitForLoadState('networkidle', { timeout: 30000 });

    const title = await page.title();
    expect(title).toBeTruthy();

    const html = await page.content();
    const hasRoot = html.includes('id="root"');
    const hasLoginForm =
      html.includes('Sign in') || html.includes('Sign In') || html.includes('Welcome');
    expect(hasRoot || hasLoginForm).toBeTruthy();
  });

  test('main navigation elements are present', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    const interactiveElements = await page.locator('button, a, input').count();
    expect(interactiveElements).toBeGreaterThan(0);
  });

  test('safety-critical landmarks are present (no theater)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    const html = await page.content();
    const hasShell =
      html.includes('id="root"') ||
      html.includes('Sign in') ||
      html.includes('Sign In') ||
      html.includes('Welcome');
    expect(hasShell, 'app shell must render, neither #root nor a login surface was found').toBe(
      true,
    );

    const liveRegions = await page.locator('[role="status"], [aria-live]').count();
    expect(
      liveRegions,
      'at least one status/aria-live region must be mounted so we can surface offline state and errors',
    ).toBeGreaterThan(0);
  });
});
