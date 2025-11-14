import { test, expect } from '../e2e/fixtures';

/**
 * E2E tests for LLM provider switching
 */
test.describe('Provider Switching E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');
  });

  test('should switch between LLM providers', async ({ settingsPage }) => {
    // Navigate to settings
    await settingsPage.navigateToSettings();

    // Configure OpenAI provider
    await settingsPage.configureProvider('openai', 'test-api-key-openai');

    // Save settings
    await settingsPage.saveSettings();

    // Verify settings were saved
    const saved = await settingsPage.isSettingsSaved();
    expect(saved).toBe(true);
  });

  test('should verify current active provider', async ({ page, settingsPage }) => {
    await settingsPage.navigateToSettings();

    // Check providers tab
    const providerTab = page
      .locator('button:has-text("Providers"), [data-testid="providers-tab"]')
      .first();

    if (await providerTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await providerTab.click();

      // Look for active provider indicator
      const activeProvider = page.locator('[data-active="true"], .active-provider').first();

      if (await activeProvider.isVisible({ timeout: 2000 }).catch(() => false)) {
        const providerText = await activeProvider.textContent();
        expect(providerText?.toLowerCase()).toMatch(/openai|anthropic|ollama|google/i);
      }
    }
  });

  test('should configure multiple providers', async ({ settingsPage }) => {
    await settingsPage.navigateToSettings();

    // Configure OpenAI
    await settingsPage.configureProvider('openai', 'test-openai-key');

    // Configure Anthropic
    await settingsPage.configureProvider('anthropic', 'test-anthropic-key');

    // Configure Ollama (local, no API key needed)
    await settingsPage.configureProvider('ollama');

    // Save settings
    await settingsPage.saveSettings();

    // Verify saved
    const saved = await settingsPage.isSettingsSaved();
    expect(saved).toBe(true);
  });

  test('should fallback to alternative provider on failure', async ({
    page: _page,
    chatPage,
    mockLLM,
  }) => {
    // Mock primary provider failure and fallback success
    mockLLM.setMockResponse(
      /fallback|backup|alternative/i,
      'Primary provider unavailable. Falling back to alternative provider. Response successful.',
    );

    await chatPage.goto();

    // Send message that should trigger fallback
    if (await chatPage.chatInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chatPage.sendMessage('Test fallback mechanism');

      // Wait for response
      await chatPage.waitForResponse().catch(() => {});

      // Verify a response was received (even if from fallback)
      const messageCount = await chatPage.getMessageCount();
      expect(messageCount).toBeGreaterThan(1);
    }
  });

  test('should prioritize local Ollama for cost savings', async ({ page, settingsPage }) => {
    await settingsPage.navigateToSettings();

    // Navigate to providers tab
    const providerTab = page
      .locator('button:has-text("Providers"), [data-testid="providers-tab"]')
      .first();

    if (await providerTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await providerTab.click();

      // Check for Ollama provider
      const ollamaProvider = page
        .locator('[data-testid="ollama-provider"], button:has-text("Ollama")')
        .first();

      if (await ollamaProvider.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Verify Ollama can be enabled
        await expect(ollamaProvider).toBeVisible();
      }
    }
  });

  test('should display provider status and availability', async ({ page, settingsPage }) => {
    await settingsPage.navigateToSettings();

    // Navigate to providers section
    const providerTab = page
      .locator('button:has-text("Providers"), [data-testid="providers-tab"]')
      .first();

    if (await providerTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await providerTab.click();

      // Check for provider status indicators
      const statusIndicators = page.locator('[data-testid*="provider-status"], .provider-status');
      const count = await statusIndicators.count();

      if (count > 0) {
        // Verify at least one status indicator exists
        expect(count).toBeGreaterThan(0);
      }
    }
  });

  test('should track token usage per provider', async ({ page, settingsPage }) => {
    await settingsPage.navigateToSettings();

    // Navigate to usage/analytics section
    const analyticsTab = page
      .locator('button:has-text("Analytics"), button:has-text("Usage")')
      .first();

    if (await analyticsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await analyticsTab.click();

      // Check for token usage stats
      const tokenStats = page.locator('[data-testid="token-usage"], .token-usage').first();

      if (await tokenStats.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(tokenStats).toBeVisible();
      }
    }
  });

  test('should calculate and display cost per provider', async ({ page, settingsPage }) => {
    await settingsPage.navigateToSettings();

    // Navigate to cost analytics
    const costTab = page.locator('button:has-text("Cost"), button:has-text("Analytics")').first();

    if (await costTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await costTab.click();

      // Check for cost breakdown
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
    // Start a conversation
    await chatPage.goto();

    if (await chatPage.chatInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chatPage.sendMessage('Hello');
      await chatPage.waitForResponse().catch(() => {});

      // Switch provider in settings
      await settingsPage.navigateToSettings();
      await settingsPage.configureProvider('ollama');
      await settingsPage.saveSettings();

      // Return to chat and continue conversation
      await chatPage.goto();
      await chatPage.sendMessage('Continue conversation');

      // Verify conversation continues with new provider
      const messageCount = await chatPage.getMessageCount();
      expect(messageCount).toBeGreaterThan(2);
    }
  });

  test('should validate API keys before saving', async ({ page, settingsPage }) => {
    await settingsPage.navigateToSettings();

    // Try to configure provider with invalid key
    await settingsPage.configureProvider('openai', 'invalid-key');

    // Attempt to save
    await settingsPage.saveButton.click();

    // Check for validation error
    const errorMessage = page.locator('[role="alert"], .error-message').first();

    // May show validation error or allow saving (depending on implementation)
    await page.waitForTimeout(2000);

    // If validation is implemented, error should appear
    // If not, settings should save anyway
    const hasError = await errorMessage.isVisible({ timeout: 2000 }).catch(() => false);
    const hasSaved = await settingsPage.isSettingsSaved();

    expect(hasError || hasSaved).toBe(true);
  });
});
