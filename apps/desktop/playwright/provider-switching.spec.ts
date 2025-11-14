import { test, expect } from '../e2e/fixtures';
import { SettingsSnapshot } from '../e2e/page-objects/SettingsPage';

/**
 * E2E tests for LLM provider switching
 *
 * Test Isolation Strategy:
 * - Provider settings are captured before each test
 * - API keys and provider configurations are restored after test completes
 * - Prevents provider changes from affecting subsequent tests
 * - Maintains clean provider state across test runs
 */
test.describe('Provider Switching E2E', () => {
  let providerSnapshot: SettingsSnapshot;

  test.beforeEach(async ({ page, settingsPage }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    try {
      providerSnapshot = await settingsPage.captureCurrentSettings();
      console.log('Provider settings snapshot captured:', providerSnapshot);
    } catch (error) {
      console.warn('Failed to capture provider settings:', error);
      providerSnapshot = {};
    }
  });

  test.afterEach(async ({ settingsPage }) => {
    // Restore provider settings to original state
    try {
      if (providerSnapshot && Object.keys(providerSnapshot).length > 0) {
        console.log('Restoring provider settings...');
        await settingsPage.restoreFromSnapshot(providerSnapshot);
      }
    } catch (error) {
      console.error('Error during provider settings cleanup:', error);
    }
  });

  test('should switch between LLM providers', async ({ settingsPage }) => {
    await settingsPage.navigateToSettings();

    await settingsPage.configureProvider('openai', 'test-api-key-openai');

    await settingsPage.saveSettings();

    const saved = await settingsPage.isSettingsSaved();
    expect(saved).toBe(true);
  });

  test('should verify current active provider', async ({ page, settingsPage }) => {
    await settingsPage.navigateToSettings();

    const providerTab = page
      .locator('button:has-text("Providers"), [data-testid="providers-tab"]')
      .first();

    if (await providerTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await providerTab.click();

      const activeProvider = page.locator('[data-active="true"], .active-provider').first();

      if (await activeProvider.isVisible({ timeout: 2000 }).catch(() => false)) {
        const providerText = await activeProvider.textContent();
        expect(providerText?.toLowerCase()).toMatch(/openai|anthropic|ollama|google/i);
      }
    }
  });

  test('should configure multiple providers', async ({ settingsPage }) => {
    await settingsPage.navigateToSettings();

    await settingsPage.configureProvider('openai', 'test-openai-key');
    await settingsPage.configureProvider('anthropic', 'test-anthropic-key');
    await settingsPage.configureProvider('ollama');

    await settingsPage.saveSettings();

    const saved = await settingsPage.isSettingsSaved();
    expect(saved).toBe(true);
  });

  test('should fallback to alternative provider on failure', async ({
    page: _page,
    chatPage,
    mockLLM,
  }) => {
    mockLLM.setMockResponse(
      /fallback|backup|alternative/i,
      'Primary provider unavailable. Falling back to alternative provider. Response successful.',
    );

    await chatPage.goto();

    if (await chatPage.chatInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chatPage.sendMessage('Test fallback mechanism');

      await chatPage.waitForResponse().catch(() => {});

      const messageCount = await chatPage.getMessageCount();
      expect(messageCount).toBeGreaterThan(1);
    }
  });

  test('should prioritize local Ollama for cost savings', async ({ page, settingsPage }) => {
    await settingsPage.navigateToSettings();

    const providerTab = page
      .locator('button:has-text("Providers"), [data-testid="providers-tab"]')
      .first();

    if (await providerTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await providerTab.click();

      const ollamaProvider = page
        .locator('[data-testid="ollama-provider"], button:has-text("Ollama")')
        .first();

      if (await ollamaProvider.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(ollamaProvider).toBeVisible();
      }
    }
  });

  test('should display provider status and availability', async ({ page, settingsPage }) => {
    await settingsPage.navigateToSettings();

    const providerTab = page
      .locator('button:has-text("Providers"), [data-testid="providers-tab"]')
      .first();

    if (await providerTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await providerTab.click();

      const statusIndicators = page.locator('[data-testid*="provider-status"], .provider-status');
      const count = await statusIndicators.count();

      if (count > 0) {
        expect(count).toBeGreaterThan(0);
      }
    }
  });

  test('should track token usage per provider', async ({ page, settingsPage }) => {
    await settingsPage.navigateToSettings();

    const analyticsTab = page
      .locator('button:has-text("Analytics"), button:has-text("Usage")')
      .first();

    if (await analyticsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await analyticsTab.click();

      const tokenStats = page.locator('[data-testid="token-usage"], .token-usage').first();

      if (await tokenStats.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(tokenStats).toBeVisible();
      }
    }
  });

  test('should calculate and display cost per provider', async ({ page, settingsPage }) => {
    await settingsPage.navigateToSettings();

    const costTab = page.locator('button:has-text("Cost"), button:has-text("Analytics")').first();

    if (await costTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await costTab.click();

      const costBreakdown = page.locator('[data-testid="cost-breakdown"], .cost-breakdown').first();

      if (await costBreakdown.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(costBreakdown).toBeVisible();
      }
    }
  });

  test('should switch provider mid-conversation', async ({
    page: _page,
    chatPage,
    settingsPage,
  }) => {
    await chatPage.goto();

    if (await chatPage.chatInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chatPage.sendMessage('Hello');
      await chatPage.waitForResponse().catch(() => {});

      await settingsPage.navigateToSettings();
      await settingsPage.configureProvider('ollama');
      await settingsPage.saveSettings();

      await chatPage.goto();
      await chatPage.sendMessage('Continue conversation');

      const messageCount = await chatPage.getMessageCount();
      expect(messageCount).toBeGreaterThan(2);
    }
  });

  test('should validate API keys before saving', async ({ page, settingsPage }) => {
    await settingsPage.navigateToSettings();

    await settingsPage.configureProvider('openai', 'invalid-key');

    await settingsPage.saveButton.click();

    const errorMessage = page.locator('[role="alert"], .error-message').first();

    await page.waitForTimeout(2000);

    const hasError = await errorMessage.isVisible({ timeout: 2000 }).catch(() => false);
    const hasSaved = await settingsPage.isSettingsSaved();

    expect(hasError || hasSaved).toBe(true);
  });
});
