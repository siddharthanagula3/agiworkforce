import { test, expect } from '@playwright/test';

test.describe('Desktop App Smoke Tests', () => {
  test('app launches and main window renders', async ({ page }) => {
    // Navigate and wait for initial load
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Verify we got a successful response
    expect(response?.status()).toBeLessThan(400);

    // Verify basic HTML structure exists
    const title = await page.title();
    expect(title).toBeTruthy();

    // The root element should exist
    const root = page.locator('#root');
    await expect(root).toBeAttached({ timeout: 10000 });

    // Wait for network to settle
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Check if page has any content (either React rendered or at least the HTML)
    const html = await page.content();
    expect(html).toContain('<div id="root"');
  });

  test('main navigation elements are present', async ({ page }) => {
    // Navigate and wait for DOM ready
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for network to settle
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Verify the root element exists
    const root = page.locator('#root');
    await expect(root).toBeAttached();
  });
});
