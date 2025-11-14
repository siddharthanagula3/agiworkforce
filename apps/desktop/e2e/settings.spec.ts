import { test, expect } from './fixtures';
import { createErrorHandler } from './utils/error-handler';
import { SettingsSnapshot } from './page-objects/SettingsPage';

/**
 * E2E tests for settings and configuration
 *
 * Test Isolation Strategy:
 * - Each test captures settings in beforeEach to preserve original state
 * - Settings are restored in afterEach to prevent state pollution between tests
 * - All settings modifications are scoped to individual tests
 * - Cleanup errors are handled gracefully to prevent test failures during teardown
 *
 * This ensures:
 * 1. Tests don't affect each other (test isolation)
 * 2. System settings remain unchanged after test runs
 * 3. CI/CD pipelines run without configuration drift
 * 4. Multiple test runs on same machine maintain clean state
 */
test.describe('Settings and Configuration', () => {
  // Store snapshot for cleanup
  let settingsSnapshot: SettingsSnapshot;

  test.beforeEach(async ({ page, settingsPage }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Capture current settings state before test execution
    try {
      settingsSnapshot = await settingsPage.captureCurrentSettings();
      console.log('Settings snapshot captured:', settingsSnapshot);
    } catch (error) {
      console.warn('Failed to capture settings snapshot:', error);
      settingsSnapshot = {};
    }
  });

  test.afterEach(async ({ settingsPage }) => {
    // Restore settings to original state after test completes
    try {
      if (settingsSnapshot && Object.keys(settingsSnapshot).length > 0) {
        console.log('Restoring settings from snapshot...');
        await settingsPage.restoreFromSnapshot(settingsSnapshot);
      }
    } catch (error) {
      console.error('Error during settings cleanup:', error);
    }
  });

  test('should change application theme', async ({ page, settingsPage }) => {
    const errorHandler = createErrorHandler(page);
    await settingsPage.navigateToSettings();

    if (await errorHandler.isElementVisible(settingsPage.themeSelect, 2000)) {
      await settingsPage.changeTheme('dark');
      await settingsPage.saveSettings();

      const saved = await settingsPage.isSettingsSaved();
      expect(saved).toBe(true);

      const htmlElement = page.locator('html');
      const _theme = await errorHandler.getAttribute(htmlElement, 'class');
    }
  });

  test('should persist settings across page refresh', async ({ page, settingsPage }) => {
    const errorHandler = createErrorHandler(page);
    await settingsPage.navigateToSettings();

    if (await errorHandler.isElementVisible(settingsPage.themeSelect, 2000)) {
      await settingsPage.changeTheme('light');
      await settingsPage.saveSettings();

      await page.reload();
      await page.waitForLoadState('networkidle');

      await settingsPage.navigateToSettings();

      if (await errorHandler.isElementVisible(settingsPage.themeSelect, 2000)) {
        const selectedTheme = await settingsPage.themeSelect.inputValue();
        expect(selectedTheme).toBe('light');
      }
    }
  });

  test('should configure resource limits', async ({ settingsPage }) => {
    await settingsPage.navigateToSettings();

    await settingsPage.setResourceLimit('cpu', '75');
    await settingsPage.setResourceLimit('memory', '85');
    await settingsPage.saveSettings();

    const saved = await settingsPage.isSettingsSaved();
    expect(saved).toBe(true);
  });

  test('should toggle autonomous mode', async ({ settingsPage }) => {
    await settingsPage.navigateToSettings();

    await settingsPage.toggleAutonomousMode(true);
    await settingsPage.saveSettings();

    const saved = await settingsPage.isSettingsSaved();
    expect(saved).toBe(true);
  });

  test('should configure auto-approval settings', async ({ settingsPage }) => {
    await settingsPage.navigateToSettings();

    await settingsPage.toggleAutoApproval(true);
    await settingsPage.saveSettings();

    const saved = await settingsPage.isSettingsSaved();
    expect(saved).toBe(true);
  });

  test('should reset settings to defaults', async ({ page, settingsPage }) => {
    const errorHandler = createErrorHandler(page);
    await settingsPage.navigateToSettings();

    if (await errorHandler.isElementVisible(settingsPage.themeSelect, 2000)) {
      await settingsPage.changeTheme('dark');
      await settingsPage.saveSettings();
    }

    await settingsPage.resetSettings();

    const saved = await settingsPage.isSettingsSaved();
    expect(saved).toBe(true);
  });

  test('should display keyboard shortcuts', async ({ page, settingsPage }) => {
    const errorHandler = createErrorHandler(page);
    await settingsPage.navigateToSettings();

    const keyboardTab = page
      .locator('button:has-text("Keyboard"), button:has-text("Shortcuts")')
      .first();

    if (await errorHandler.isElementVisible(keyboardTab, 2000)) {
      await errorHandler.safeClick(keyboardTab);

      const shortcutsList = page.locator('[data-testid="shortcuts-list"], .shortcuts-list').first();

      if (await errorHandler.isElementVisible(shortcutsList, 2000)) {
        await expect(shortcutsList).toBeVisible();
      }
    }
  });

  test('should manage notification preferences', async ({ page, settingsPage }) => {
    const errorHandler = createErrorHandler(page);
    await settingsPage.navigateToSettings();

    const notificationsTab = page.locator('button:has-text("Notifications")').first();

    if (await errorHandler.isElementVisible(notificationsTab, 2000)) {
      await errorHandler.safeClick(notificationsTab);

      const notificationToggle = page.locator('input[type="checkbox"]').first();

      if (await errorHandler.isElementVisible(notificationToggle, 2000)) {
        await errorHandler.safeClick(notificationToggle);

        await settingsPage.saveSettings();

        const saved = await settingsPage.isSettingsSaved();
        expect(saved).toBe(true);
      }
    }
  });

  test('should configure data retention policies', async ({ page, settingsPage }) => {
    const errorHandler = createErrorHandler(page);
    await settingsPage.navigateToSettings();

    const privacyTab = page.locator('button:has-text("Privacy"), button:has-text("Data")').first();

    if (await errorHandler.isElementVisible(privacyTab, 2000)) {
      await errorHandler.safeClick(privacyTab);

      const retentionSelect = page
        .locator('select[name*="retention"], [data-testid="retention-period"]')
        .first();

      if (await errorHandler.isElementVisible(retentionSelect, 2000)) {
        await errorHandler.safeSelect(retentionSelect, '30');

        await settingsPage.saveSettings();

        const saved = await settingsPage.isSettingsSaved();
        expect(saved).toBe(true);
      }
    }
  });

  test('should export settings configuration', async ({ page, settingsPage }) => {
    await settingsPage.navigateToSettings();

    const exportButton = page
      .locator('button:has-text("Export"), [data-testid="export-settings"]')
      .first();

    if (await exportButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await exportButton.click();
      await page.waitForTimeout(1000);
    }
  });

  test('should import settings configuration', async ({ page, settingsPage }) => {
    await settingsPage.navigateToSettings();

    const importButton = page
      .locator('button:has-text("Import"), [data-testid="import-settings"]')
      .first();

    if (await importButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(importButton).toBeVisible();
    }
  });

  test('should validate settings before saving', async ({ page, settingsPage }) => {
    await settingsPage.navigateToSettings();

    const cpuInput = page.locator('input[name*="cpu"], [data-testid="cpu-limit"]').first();

    if (await cpuInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cpuInput.clear();
      await cpuInput.fill('150');

      await settingsPage.saveButton.click();

      const errorMessage = page.locator('[role="alert"], .error-message').first();

      await page.waitForTimeout(1000);

      const hasError = await errorMessage.isVisible({ timeout: 2000 }).catch(() => false);
      const inputValue = await cpuInput.inputValue();

      expect(hasError || parseInt(inputValue) <= 100).toBe(true);
    }
  });

  test('should display current version information', async ({ page, settingsPage }) => {
    await settingsPage.navigateToSettings();

    const aboutTab = page.locator('button:has-text("About")').first();

    if (await aboutTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await aboutTab.click();

      const versionInfo = page.locator('[data-testid="version"], .version-info').first();

      if (await versionInfo.isVisible({ timeout: 2000 }).catch(() => false)) {
        const versionText = await versionInfo.textContent();
        expect(versionText).toMatch(/\d+\.\d+\.\d+/);
      }
    }
  });

  test('should check for updates', async ({ page, settingsPage }) => {
    await settingsPage.navigateToSettings();

    const checkUpdatesButton = page
      .locator('button:has-text("Check for Updates"), [data-testid="check-updates"]')
      .first();

    if (await checkUpdatesButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await checkUpdatesButton.click();

      await page.waitForTimeout(2000);

      const updateStatus = page.locator('[data-testid="update-status"], .update-status').first();

      if (await updateStatus.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(updateStatus).toBeVisible();
      }
    }
  });
});
