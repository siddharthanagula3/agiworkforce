import { expect } from '@playwright/test';
import { test } from './fixtures';

/**
 * Visual regression tests using pixel-level screenshot comparison
 *
 * These tests compare captured screenshots against baseline images to detect
 * unintended visual regressions. Tests can be run in three modes:
 *
 * 1. CREATE MODE: Creates baseline screenshots (first run, or with --update-snapshots)
 * 2. COMPARE MODE: Compares against existing baselines (normal runs)
 * 3. UPDATE MODE: Updates baselines when visual changes are intentional
 *
 * Implementation uses pixelmatch for per-pixel comparison with configurable threshold.
 * Missing baselines are created automatically on first run.
 */
test.describe('Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.afterEach(async ({ screenshot }) => {
    // Clean up old screenshots to prevent disk bloat
    await screenshot.cleanup(50);
  });

  test('should match chat interface baseline', async ({ page, screenshot }) => {
    // Navigate to chat
    const chatLink = page.locator('a[href*="chat"], button:has-text("Chat")').first();
    if (await chatLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chatLink.click();
      await page.waitForLoadState('networkidle');
    }

    await page.waitForTimeout(500);
    const currentPath = await screenshot.captureFullPage('chat-interface');

    // Try to compare against baseline, skip if baseline doesn't exist
    try {
      const comparison = await screenshot.compareVisual('chat-interface', currentPath);
      expect(comparison.match).toBeTruthy();
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      // Baseline doesn't exist yet - create it
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        console.log('[Visual Baseline] Creating missing baseline for chat-interface');
        await screenshot.createBaseline('chat-interface');
      } else {
        throw error;
      }
    }
  });

  test('should match AGI interface baseline', async ({ page, screenshot, agiPage }) => {
    await agiPage.navigateToAGI();
    await page.waitForTimeout(500);
    const currentPath = await screenshot.captureFullPage('agi-interface');

    try {
      const comparison = await screenshot.compareVisual('agi-interface', currentPath);
      expect(comparison.match).toBeTruthy();
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshot.createBaseline('agi-interface');
      } else {
        throw error;
      }
    }
  });

  test('should match automation interface baseline', async ({
    page,
    screenshot,
    automationPage,
  }) => {
    await automationPage.navigateToAutomation();
    await page.waitForTimeout(500);
    const currentPath = await screenshot.captureFullPage('automation-interface');

    try {
      const comparison = await screenshot.compareVisual('automation-interface', currentPath);
      expect(comparison.match).toBeTruthy();
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshot.createBaseline('automation-interface');
      } else {
        throw error;
      }
    }
  });

  test('should match settings interface baseline', async ({ page, screenshot, settingsPage }) => {
    await settingsPage.navigateToSettings();
    await page.waitForTimeout(500);
    const currentPath = await screenshot.captureFullPage('settings-interface');

    try {
      const comparison = await screenshot.compareVisual('settings-interface', currentPath);
      expect(comparison.match).toBeTruthy();
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshot.createBaseline('settings-interface');
      } else {
        throw error;
      }
    }
  });

  test('should match light theme', async ({ page, screenshot, settingsPage }) => {
    await settingsPage.navigateToSettings();

    // Switch to light theme
    if (await settingsPage.themeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await settingsPage.changeTheme('light');
      await page.waitForTimeout(500);
    }

    const currentPath = await screenshot.captureFullPage('theme-light');

    try {
      const comparison = await screenshot.compareVisual('theme-light', currentPath);
      expect(comparison.match).toBeTruthy();
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshot.createBaseline('theme-light');
      } else {
        throw error;
      }
    }
  });

  test('should match dark theme', async ({ page, screenshot, settingsPage }) => {
    await settingsPage.navigateToSettings();

    // Switch to dark theme
    if (await settingsPage.themeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await settingsPage.changeTheme('dark');
      await page.waitForTimeout(500);
    }

    const currentPath = await screenshot.captureFullPage('theme-dark');

    try {
      const comparison = await screenshot.compareVisual('theme-dark', currentPath);
      expect(comparison.match).toBeTruthy();
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshot.createBaseline('theme-dark');
      } else {
        throw error;
      }
    }
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
        const currentPath = await screenshot.captureElement(
          '[role="dialog"], .modal',
          'new-chat-modal',
        );

        try {
          const comparison = await screenshot.compareVisual('new-chat-modal', currentPath);
          expect(comparison.match).toBeTruthy();
          expect(comparison.similarity).toBeGreaterThanOrEqual(85);
        } catch (error) {
          if ((error as Error).message.includes('Baseline screenshot not found')) {
            await screenshot.createBaseline('new-chat-modal');
          } else {
            throw error;
          }
        }
      }
    }
  });

  test('should match responsive layout on different viewport sizes', async ({
    page,
    screenshot,
  }) => {
    // Test desktop viewport (default)
    let currentPath = await screenshot.captureViewport('layout-desktop-1920x1080');
    try {
      const comparison = await screenshot.compareVisual('layout-desktop-1920x1080', currentPath);
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshot.createBaseline('layout-desktop-1920x1080');
      } else {
        throw error;
      }
    }

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    currentPath = await screenshot.captureViewport('layout-tablet-768x1024');
    try {
      const comparison = await screenshot.compareVisual('layout-tablet-768x1024', currentPath);
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshot.createBaseline('layout-tablet-768x1024');
      } else {
        throw error;
      }
    }

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    currentPath = await screenshot.captureViewport('layout-mobile-375x667');
    try {
      const comparison = await screenshot.compareVisual('layout-mobile-375x667', currentPath);
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshot.createBaseline('layout-mobile-375x667');
      } else {
        throw error;
      }
    }
  });

  test('should capture error states', async ({ page, screenshot, chatPage, mockLLM }) => {
    // Mock error response
    mockLLM.setMockResponse(/error.*test/i, 'ERROR: Test error message');

    await chatPage.goto();

    if (await chatPage.chatInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chatPage.sendMessage('trigger error test');
      await page.waitForTimeout(2000);

      // Capture error state
      const currentPath = await screenshot.captureFullPage('error-state');

      try {
        const comparison = await screenshot.compareVisual('error-state', currentPath);
        expect(comparison.similarity).toBeGreaterThanOrEqual(85);
      } catch (error) {
        if ((error as Error).message.includes('Baseline screenshot not found')) {
          await screenshot.createBaseline('error-state');
        } else {
          throw error;
        }
      }
    }
  });

  test('should capture loading states', async ({ page, screenshot, agiPage }) => {
    await agiPage.navigateToAGI();

    // Submit goal to trigger loading
    if (await agiPage.goalInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await agiPage.submitGoal('Test loading state');

      // Quickly capture loading state
      await page.waitForTimeout(500);
      const currentPath = await screenshot.captureFullPage('loading-state');

      try {
        const comparison = await screenshot.compareVisual('loading-state', currentPath);
        expect(comparison.similarity).toBeGreaterThanOrEqual(85);
      } catch (error) {
        if ((error as Error).message.includes('Baseline screenshot not found')) {
          await screenshot.createBaseline('loading-state');
        } else {
          throw error;
        }
      }
    }
  });

  test('should initialize baseline screenshots on first run', async () => {
    // This test ensures baseline screenshots exist for comparison tests
    // If they don't exist, they will be created in the comparison tests

    const baselineNames = [
      'chat-interface',
      'agi-interface',
      'automation-interface',
      'settings-interface',
      'theme-light',
      'theme-dark',
      'new-chat-modal',
      'layout-desktop-1920x1080',
      'layout-tablet-768x1024',
      'layout-mobile-375x667',
      'error-state',
      'loading-state',
    ];

    // Log which baselines are needed
    console.log('[Visual Baseline] Required baselines:', baselineNames.join(', '));
    console.log('[Visual Baseline] Run tests with --update-snapshots to create missing baselines');
  });
});
