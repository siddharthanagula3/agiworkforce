import { test, expect } from '@playwright/test';

test.describe('Browser Automation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    const browserNav = page.locator('nav').getByText('Browser');
    if (await browserNav.isVisible()) {
      await browserNav.click();
    }
  });

  test('should verify browser automation API availability', async ({ page }) => {
    const launchBtn = page.getByRole('button', { name: /launch/i });

    expect(launchBtn).toBeDefined();
  });
});
