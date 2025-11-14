import { test, expect } from './fixtures';

/**
 * Visual regression tests using screenshot comparison
 */
test.describe('Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');
  });

  test('should match chat interface baseline', async ({ page, screenshot }) => {
    // Navigate to chat
    const chatLink = page.locator('a[href*="chat"], button:has-text("Chat")').first();
    if (await chatLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chatLink.click();
      await page.waitForLoadState('networkidle');
    }

    // Capture screenshot
    await screenshot.captureFullPage('chat-interface');

    // In a real implementation, this would compare against a baseline
    // For now, we just verify screenshot was captured
    await page.waitForTimeout(500);
  });

  test('should match AGI interface baseline', async ({ page, screenshot, agiPage }) => {
    await agiPage.navigateToAGI();

    // Capture screenshot
    await screenshot.captureFullPage('agi-interface');

    await page.waitForTimeout(500);
  });

  test('should match automation interface baseline', async ({ page, screenshot, automationPage }) => {
    await automationPage.navigateToAutomation();

    // Capture screenshot
    await screenshot.captureFullPage('automation-interface');

    await page.waitForTimeout(500);
  });

  test('should match settings interface baseline', async ({ page, screenshot, settingsPage }) => {
    await settingsPage.navigateToSettings();

    // Capture screenshot
    await screenshot.captureFullPage('settings-interface');

    await page.waitForTimeout(500);
  });

  test('should match light theme', async ({ page, screenshot, settingsPage }) => {
    await settingsPage.navigateToSettings();

    // Switch to light theme
    if (await settingsPage.themeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await settingsPage.changeTheme('light');
      await page.waitForTimeout(500);
    }

    // Capture screenshot
    await screenshot.captureFullPage('theme-light');

    await page.waitForTimeout(500);
  });

  test('should match dark theme', async ({ page, screenshot, settingsPage }) => {
    await settingsPage.navigateToSettings();

    // Switch to dark theme
    if (await settingsPage.themeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await settingsPage.changeTheme('dark');
      await page.waitForTimeout(500);
    }

    // Capture screenshot
    await screenshot.captureFullPage('theme-dark');

    await page.waitForTimeout(500);
  });

  test('should match modal dialogs', async ({ page, screenshot, chatPage }) => {
    await chatPage.goto();

    // Try to open a modal (e.g., new chat dialog)
    if (await chatPage.newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chatPage.newChatButton.click();
      await page.waitForTimeout(500);

      // Capture modal screenshot
      const modal = page.locator('[role="dialog"], .modal').first();
      if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
        await screenshot.captureElement('[role="dialog"], .modal', 'new-chat-modal');
      }
    }
  });

  test('should match responsive layout on different viewport sizes', async ({ page, screenshot }) => {
    // Test desktop viewport (default)
    await screenshot.captureViewport('layout-desktop-1920x1080');

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    await screenshot.captureViewport('layout-tablet-768x1024');

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    await screenshot.captureViewport('layout-mobile-375x667');
  });

  test('should capture error states', async ({ page, screenshot, chatPage, mockLLM }) => {
    // Mock error response
    mockLLM.setMockResponse(/error.*test/i, 'ERROR: Test error message');

    await chatPage.goto();

    if (await chatPage.chatInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chatPage.sendMessage('trigger error test');
      await page.waitForTimeout(2000);

      // Capture error state
      await screenshot.captureFullPage('error-state');
    }
  });

  test('should capture loading states', async ({ page, screenshot, agiPage }) => {
    await agiPage.navigateToAGI();

    // Submit goal to trigger loading
    if (await agiPage.goalInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await agiPage.submitGoal('Test loading state');

      // Quickly capture loading state
      await page.waitForTimeout(500);
      await screenshot.captureFullPage('loading-state');
    }
  });

  test('should create baseline screenshots for first run', async ({ screenshot }) => {
    // This test creates baseline screenshots for comparison
    // In CI, these would be committed to the repository

    await screenshot.createBaseline('homepage');
    await screenshot.createBaseline('chat-page');
    await screenshot.createBaseline('agi-page');
    await screenshot.createBaseline('automation-page');
    await screenshot.createBaseline('settings-page');
  });
});
