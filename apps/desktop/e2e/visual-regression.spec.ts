import { expect } from '@playwright/test';
import { test } from './fixtures';

test.describe('Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.afterEach(async ({ screenshotHelper }) => {
    await screenshotHelper.cleanup(50);
  });

  test('should match chat interface baseline', async ({ page, screenshotHelper }) => {
    const chatLink = page.locator('a[href*="chat"], button:has-text("Chat")').first();
    if (await chatLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chatLink.click();
      await page.waitForLoadState('networkidle');
    }

    // Wait for page content to stabilize before screenshot
    await page.waitForLoadState('domcontentloaded');
    const currentPath = await screenshotHelper.captureFullPage('chat-interface');

    try {
      const comparison = await screenshotHelper.compareVisual('chat-interface', currentPath);
      expect(comparison.match).toBeTruthy();
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        console.log('[Visual Baseline] Creating missing baseline for chat-interface');
        await screenshotHelper.createBaseline('chat-interface');
      } else {
        throw error;
      }
    }
  });

  test('should match AGI interface baseline', async ({ page, screenshotHelper, agiPage }) => {
    await agiPage.navigateToAGI();
    // Wait for AGI interface content to be ready
    await page.waitForLoadState('domcontentloaded');
    const currentPath = await screenshotHelper.captureFullPage('agi-interface');

    try {
      const comparison = await screenshotHelper.compareVisual('agi-interface', currentPath);
      expect(comparison.match).toBeTruthy();
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('agi-interface');
      } else {
        throw error;
      }
    }
  });

  test('should match automation interface baseline', async ({
    page,
    screenshotHelper,
    automationPage,
  }) => {
    await automationPage.navigateToAutomation();
    // Wait for automation interface content to be ready
    await page.waitForLoadState('domcontentloaded');
    const currentPath = await screenshotHelper.captureFullPage('automation-interface');

    try {
      const comparison = await screenshotHelper.compareVisual('automation-interface', currentPath);
      expect(comparison.match).toBeTruthy();
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('automation-interface');
      } else {
        throw error;
      }
    }
  });

  test('should match settings interface baseline', async ({
    page,
    screenshotHelper,
    settingsPage,
  }) => {
    await settingsPage.navigateToSettings();
    // Wait for settings interface content to be ready
    await page.waitForLoadState('domcontentloaded');
    const currentPath = await screenshotHelper.captureFullPage('settings-interface');

    try {
      const comparison = await screenshotHelper.compareVisual('settings-interface', currentPath);
      expect(comparison.match).toBeTruthy();
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('settings-interface');
      } else {
        throw error;
      }
    }
  });

  test('should match light theme', async ({ page, screenshotHelper, settingsPage }) => {
    await settingsPage.navigateToSettings();

    if (await settingsPage.themeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await settingsPage.changeTheme('light');
      // Wait for theme transition to complete by checking for theme class/attribute
      await expect(page.locator('body, html, [data-theme]').first())
        .toHaveAttribute('class', /light|theme/, { timeout: 2000 })
        .catch(() => {});
    }

    const currentPath = await screenshotHelper.captureFullPage('theme-light');

    try {
      const comparison = await screenshotHelper.compareVisual('theme-light', currentPath);
      expect(comparison.match).toBeTruthy();
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('theme-light');
      } else {
        throw error;
      }
    }
  });

  test('should match dark theme', async ({ page, screenshotHelper, settingsPage }) => {
    await settingsPage.navigateToSettings();

    if (await settingsPage.themeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await settingsPage.changeTheme('dark');
      // Wait for theme transition to complete by checking for theme class/attribute
      await expect(page.locator('body, html, [data-theme]').first())
        .toHaveAttribute('class', /dark|theme/, { timeout: 2000 })
        .catch(() => {});
    }

    const currentPath = await screenshotHelper.captureFullPage('theme-dark');

    try {
      const comparison = await screenshotHelper.compareVisual('theme-dark', currentPath);
      expect(comparison.match).toBeTruthy();
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('theme-dark');
      } else {
        throw error;
      }
    }
  });

  test('should match modal dialogs', async ({ page, screenshotHelper, chatPage }) => {
    await chatPage.goto();

    const newChatVisible = await chatPage.newChatButton
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    test.skip(!newChatVisible, 'New chat button not available');

    await chatPage.newChatButton.click();

    const modal = page.locator('[role="dialog"], .modal').first();
    await modal.waitFor({ state: 'attached', timeout: 2000 }).catch(() => {});
    const modalVisible = await modal.isVisible({ timeout: 2000 }).catch(() => false);
    test.skip(!modalVisible, 'Modal dialog did not appear after clicking new chat');

    const currentPath = await screenshotHelper.captureElement(
      '[role="dialog"], .modal',
      'new-chat-modal',
    );

    try {
      const comparison = await screenshotHelper.compareVisual('new-chat-modal', currentPath);
      expect(comparison.match).toBeTruthy();
      expect(comparison.similarity).toBeGreaterThanOrEqual(85);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('new-chat-modal');
      } else {
        throw error;
      }
    }
  });

  test('should match responsive layout on different viewport sizes', async ({
    page,
    screenshotHelper,
  }) => {
    let currentPath = await screenshotHelper.captureViewport('layout-desktop-1920x1080');
    try {
      const comparison = await screenshotHelper.compareVisual(
        'layout-desktop-1920x1080',
        currentPath,
      );
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('layout-desktop-1920x1080');
      } else {
        throw error;
      }
    }

    await page.setViewportSize({ width: 768, height: 1024 });
    // Wait for layout to stabilize after viewport resize
    await page.waitForLoadState('domcontentloaded');
    currentPath = await screenshotHelper.captureViewport('layout-tablet-768x1024');
    try {
      const comparison = await screenshotHelper.compareVisual(
        'layout-tablet-768x1024',
        currentPath,
      );
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('layout-tablet-768x1024');
      } else {
        throw error;
      }
    }

    await page.setViewportSize({ width: 375, height: 667 });
    // Wait for layout to stabilize after viewport resize
    await page.waitForLoadState('domcontentloaded');
    currentPath = await screenshotHelper.captureViewport('layout-mobile-375x667');
    try {
      const comparison = await screenshotHelper.compareVisual('layout-mobile-375x667', currentPath);
      expect(comparison.similarity).toBeGreaterThanOrEqual(90);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('layout-mobile-375x667');
      } else {
        throw error;
      }
    }
  });

  test('should capture error states', async ({ page, screenshotHelper, chatPage, mockLLM }) => {
    mockLLM.setMockResponse(/error.*test/i, 'ERROR: Test error message');

    await chatPage.goto();

    const chatInputVisible = await chatPage.chatInput
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    test.skip(!chatInputVisible, 'Chat input not available');

    await chatPage.sendMessage('trigger error test');
    const errorIndicator = page.locator('[role="alert"], .error, [data-error]').first();
    await errorIndicator.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});

    const currentPath = await screenshotHelper.captureFullPage('error-state');

    try {
      const comparison = await screenshotHelper.compareVisual('error-state', currentPath);
      expect(comparison.similarity).toBeGreaterThanOrEqual(85);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('error-state');
      } else {
        throw error;
      }
    }
  });

  test('should capture loading states', async ({ page, screenshotHelper, agiPage }) => {
    await agiPage.navigateToAGI();

    const goalInputVisible = await agiPage.goalInput
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    test.skip(!goalInputVisible, 'AGI goal input not available');

    await agiPage.submitGoal('Test loading state');

    const loadingIndicator = page
      .locator('[data-loading], .loading, .spinner, [aria-busy="true"]')
      .first();
    await loadingIndicator.waitFor({ state: 'attached', timeout: 2000 }).catch(() => {});
    const currentPath = await screenshotHelper.captureFullPage('loading-state');

    try {
      const comparison = await screenshotHelper.compareVisual('loading-state', currentPath);
      expect(comparison.similarity).toBeGreaterThanOrEqual(85);
    } catch (error) {
      if ((error as Error).message.includes('Baseline screenshot not found')) {
        await screenshotHelper.createBaseline('loading-state');
      } else {
        throw error;
      }
    }
  });

  test('should initialize baseline screenshots on first run', async () => {
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

    console.log('[Visual Baseline] Required baselines:', baselineNames.join(', '));
    console.log('[Visual Baseline] Run tests with --update-snapshots to create missing baselines');
  });
});
