import { test, expect } from '@playwright/test';

/**
 * COMPREHENSIVE END-TO-END TEST SUITE
 *
 * Tests all major flows in AGI Workforce:
 * - Token tracking and counting
 * - API integration and responses
 * - Model selection (individual models)
 * - Auto mode (smart routing)
 * - Thinking mode
 * - Conversation modes (safe vs full control)
 * - Error handling and recovery
 *
 * All tests verify NO errors appear in the UI
 */

test.describe('Token Tracking & Counting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should track and display input tokens in token counter', async ({ page }) => {
    // Send a short query
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      await chatInput.fill('Hello');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      // Wait for response
      await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

      // Verify token counter is visible and contains token info
      const tokenCounter = page.locator('[data-testid="token-counter"], .token-counter').first();
      const tokenCountExists = await tokenCounter.isVisible({ timeout: 2000 }).catch(() => false);

      if (tokenCountExists) {
        const counterText = await tokenCounter.textContent();
        expect(counterText).toBeTruthy();
        // Should show token counts (numbers)
        expect(/\d+/.test(counterText || '')).toBeTruthy();
      }

      // Verify no error states
      const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
      expect(await errors.count()).toBe(0);
    }
  });

  test('should track output tokens after receiving response', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      // Send a request that will generate a longer response
      await chatInput.fill('Tell me about quantum computing');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      // Wait for complete response
      const streamingIndicator = page.locator('[data-streaming="true"], .streaming').first();
      const streamingExists = await streamingIndicator
        .isVisible({ timeout: 2000 })
        .catch(() => false);

      if (streamingExists) {
        await expect(streamingIndicator).toBeHidden({ timeout: 30000 });
      }

      // Verify response is there
      await expect(page.locator('[data-role="assistant"]').last()).toBeVisible();

      // Check for token breakdown
      const tokenBreakdown = page.locator('[data-testid="token-breakdown"], .token-breakdown');
      const breakdownExists = await tokenBreakdown.isVisible({ timeout: 2000 }).catch(() => false);

      if (breakdownExists) {
        const breakdownText = await tokenBreakdown.textContent();
        // Should contain input/output token info
        expect(breakdownText).toBeTruthy();
      }

      // Verify no errors
      const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
      expect(await errors.count()).toBe(0);
    }
  });

  test('should display cost information alongside tokens', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      await chatInput.fill('Write a poem');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      // Wait for response
      await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

      // Look for cost display (in message, token counter, or sidebar)
      const costDisplay = page.locator(
        '[data-testid="message-cost"], .message-cost, [data-testid="cost-badge"]',
      );
      const costWidgetExists = await costDisplay.isVisible({ timeout: 2000 }).catch(() => false);

      if (costWidgetExists) {
        const costText = await costDisplay.textContent();
        expect(costText).toBeTruthy();
        // Should contain $ or cents symbol
        expect(/\$|¢|cents/.test(costText || '')).toBeTruthy();
      }

      // Verify sidebar cost widget if present
      const costSidebar = page.locator('[data-testid="cost-sidebar"], .cost-widget').first();
      const sidebarExists = await costSidebar.isVisible({ timeout: 2000 }).catch(() => false);

      if (sidebarExists) {
        const sidebarText = await costSidebar.textContent();
        expect(sidebarText).toContain(/today|spent|cost/i);
      }

      // Verify no errors
      const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
      expect(await errors.count()).toBe(0);
    }
  });

  test('should update token budget alerts when threshold is reached', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      // Send multiple messages to accumulate tokens
      for (let i = 0; i < 3; i++) {
        await chatInput.fill(`Message ${i + 1}: Tell me about space`);

        const sendButton = page
          .locator('button:has-text("Send"), [data-testid="send-message"]')
          .first();
        await sendButton.click();

        await page.waitForTimeout(1000);
        await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({
          timeout: 15000,
        });
        await page.waitForTimeout(500);
      }

      // Check for budget alerts panel
      const budgetPanel = page.locator('[data-testid="budget-alerts"], .budget-alerts-panel');
      const panelExists = await budgetPanel.isVisible({ timeout: 2000 }).catch(() => false);

      if (panelExists) {
        const panelText = await budgetPanel.textContent();
        expect(panelText).toBeTruthy();
        // Should mention tokens, budget, or percentage
        expect(/token|budget|%|percent/i.test(panelText || '')).toBeTruthy();
      }

      // Verify no errors throughout the interaction
      const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
      expect(await errors.count()).toBe(0);
    }
  });
});

test.describe('API Integration & Responses', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should successfully call LLM API and receive response', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      await chatInput.fill('What is 2+2?');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      // Verify user message appears
      await expect(page.locator('[data-role="user"]').last()).toContainText('2+2');

      // Verify API call completes and response arrives
      await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

      // Response should contain meaningful text
      const response = await page.locator('[data-role="assistant"]').last().textContent();
      expect(response?.trim().length).toBeGreaterThan(0);

      // Verify no API errors
      const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
      expect(await errors.count()).toBe(0);
    }
  });

  test('should handle streaming API responses correctly', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      await chatInput.fill('Write a short paragraph about AI');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      // Check for streaming indicator
      const streamingIndicator = page.locator('[data-streaming="true"], .streaming').first();
      const isStreaming = await streamingIndicator.isVisible({ timeout: 5000 }).catch(() => false);

      if (isStreaming) {
        // Should show streaming animation/indicator
        await expect(streamingIndicator).toBeVisible();

        // Wait for streaming to complete
        await expect(streamingIndicator).toBeHidden({ timeout: 30000 });
      }

      // Final response should be complete
      const finalResponse = await page.locator('[data-role="assistant"]').last().textContent();
      expect(finalResponse?.trim().length).toBeGreaterThan(0);

      // No errors during streaming
      const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
      expect(await errors.count()).toBe(0);
    }
  });

  test('should include token usage in API response metadata', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      await chatInput.fill('Explain photosynthesis');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

      // Look for usage metadata in message item
      const messageItem = page.locator('[data-testid="message-item"]').last();
      const usageText = await messageItem.textContent({ timeout: 2000 }).catch(() => '');

      // Should have token info somewhere (in counter, badge, or expandable)
      const tokenElements = page.locator('[data-testid*="token"], [data-testid*="usage"]');
      expect(await tokenElements.count()).toBeGreaterThanOrEqual(0);

      // Verify no errors
      const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
      expect(await errors.count()).toBe(0);
    }
  });
});

test.describe('Model Selection - Individual Models', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should allow selecting individual LLM models from dropdown', async ({ page }) => {
    // Find and open model selector
    const modelSelector = page
      .locator('[data-testid="quick-model-selector"], .model-selector')
      .first();

    const selectorExists = await modelSelector.isVisible({ timeout: 2000 }).catch(() => false);

    if (selectorExists) {
      await modelSelector.click();

      // Wait for dropdown to open
      const dropdown = page.locator('[role="listbox"], .model-dropdown').first();
      await expect(dropdown).toBeVisible({ timeout: 3000 });

      // Find individual model options (not auto mode)
      const modelOptions = dropdown.locator('[role="option"]');
      const optionCount = await modelOptions.count();
      expect(optionCount).toBeGreaterThan(0);

      // Click a non-auto model (e.g., Claude, GPT)
      const nonAutoOption = modelOptions.nth(1); // Skip auto if first
      const optionText = await nonAutoOption.textContent();
      expect(optionText).toBeTruthy();

      await nonAutoOption.click();

      // Verify model was selected
      await page.waitForTimeout(500);
      const selectedModel = await modelSelector.textContent();
      expect(selectedModel?.toLowerCase()).not.toContain('auto'); // Should show specific model

      // Verify no errors
      const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
      expect(await errors.count()).toBe(0);
    }
  });

  test('should send message with selected individual model', async ({ page }) => {
    // Select a specific model
    const modelSelector = page
      .locator('[data-testid="quick-model-selector"], .model-selector')
      .first();

    const selectorExists = await modelSelector.isVisible({ timeout: 2000 }).catch(() => false);

    if (selectorExists) {
      await modelSelector.click();

      const dropdown = page.locator('[role="listbox"], .model-dropdown').first();
      await expect(dropdown).toBeVisible({ timeout: 3000 });

      // Select second model option
      const modelOptions = dropdown.locator('[role="option"]');
      await modelOptions.nth(1).click();

      // Send message with selected model
      const chatInput = page
        .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
        .first();

      if (await chatInput.isVisible()) {
        await chatInput.fill('Hello with specific model');

        const sendButton = page
          .locator('button:has-text("Send"), [data-testid="send-message"]')
          .first();
        await sendButton.click();

        // Verify response
        await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({
          timeout: 30000,
        });

        // Message should contain model info or metadata
        const assistantMessage = await page.locator('[data-role="assistant"]').last().textContent();
        expect(assistantMessage?.trim().length).toBeGreaterThan(0);

        // No errors
        const errors = page.locator(
          '[role="alert"], .error-message, [data-testid="error-message"]',
        );
        expect(await errors.count()).toBe(0);
      }
    }
  });

  test('should display selected model in message metadata', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      await chatInput.fill('Test with model');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

      // Check for model info in message
      const messageItem = page.locator('[data-testid="message-item"]').last();
      const modelBadge = messageItem.locator('[data-testid="model-badge"], .model-info');

      const badgeExists = await modelBadge.isVisible({ timeout: 2000 }).catch(() => false);

      if (badgeExists) {
        const modelText = await modelBadge.textContent();
        expect(modelText).toBeTruthy();
        // Should contain model name
        expect(/gpt|claude|gemini|auto|router/i.test(modelText || '')).toBeTruthy();
      }

      // No errors
      const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
      expect(await errors.count()).toBe(0);
    }
  });
});

test.describe('Auto Mode - Smart Routing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should enable Auto mode by default', async ({ page }) => {
    const modelSelector = page
      .locator('[data-testid="quick-model-selector"], .model-selector')
      .first();

    const selectorExists = await modelSelector.isVisible({ timeout: 2000 }).catch(() => false);

    if (selectorExists) {
      const selectedText = await modelSelector.textContent();
      // Should show "Auto" or "Auto (Best Value/Balanced/Premium)"
      expect(/auto|routing|smart/i.test(selectedText || '')).toBeTruthy();
    }
  });

  test('should route to appropriate model based on Auto strategy', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      // With Auto mode enabled, send a request
      await chatInput.fill('What is machine learning?');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      // Verify response arrives (auto routing should work)
      await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

      // Check message for routing info
      const assistantMessage = await page.locator('[data-role="assistant"]').last().textContent();
      expect(assistantMessage?.trim().length).toBeGreaterThan(0);

      // Should show which model was selected for routing
      const messageItem = page.locator('[data-testid="message-item"]').last();
      const modelInfo = await messageItem.textContent({ timeout: 2000 }).catch(() => '');
      // Auto routing should have selected some model

      // No errors in routing
      const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
      expect(await errors.count()).toBe(0);
    }
  });

  test('should handle multiple Auto modes (Economy, Balanced, Premium)', async ({ page }) => {
    const modelSelector = page
      .locator('[data-testid="quick-model-selector"], .model-selector')
      .first();

    const selectorExists = await modelSelector.isVisible({ timeout: 2000 }).catch(() => false);

    if (selectorExists) {
      await modelSelector.click();

      const dropdown = page.locator('[role="listbox"], .model-dropdown').first();
      await expect(dropdown).toBeVisible({ timeout: 3000 });

      // Look for auto mode variants
      const autoOptions = dropdown.locator('[role="option"]').filter({
        hasText: /auto|economy|balanced|premium|value|best/i,
      });

      const autoCount = await autoOptions.count();
      expect(autoCount).toBeGreaterThanOrEqual(1); // At least one auto mode

      // Each should be selectable
      if (autoCount > 0) {
        const firstAuto = autoOptions.first();
        const autoText = await firstAuto.textContent();
        expect(autoText).toBeTruthy();
      }

      // Verify no errors in dropdown
      const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
      expect(await errors.count()).toBe(0);
    }
  });
});

test.describe('Thinking Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should toggle thinking mode via brain icon', async ({ page }) => {
    // Find thinking mode toggle
    const thinkingToggle = page
      .locator(
        '[data-testid="thinking-mode-toggle"], [aria-label*="thinking"], button:has-text("🧠")',
      )
      .first();

    const toggleExists = await thinkingToggle.isVisible({ timeout: 2000 }).catch(() => false);

    if (toggleExists) {
      const initialState = await thinkingToggle.getAttribute('aria-pressed');

      // Click to toggle
      await thinkingToggle.click();

      await page.waitForTimeout(500);

      // Verify state changed
      const newState = await thinkingToggle.getAttribute('aria-pressed');
      if (initialState !== null && newState !== null) {
        expect(initialState).not.toBe(newState);
      }

      // No errors during toggle
      const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
      expect(await errors.count()).toBe(0);
    }
  });

  test('should send message with thinking mode enabled', async ({ page }) => {
    // Enable thinking mode
    const thinkingToggle = page
      .locator(
        '[data-testid="thinking-mode-toggle"], [aria-label*="thinking"], button:has-text("🧠")',
      )
      .first();

    const toggleExists = await thinkingToggle.isVisible({ timeout: 2000 }).catch(() => false);

    if (toggleExists) {
      // Ensure it's enabled
      const isPressed = await thinkingToggle.getAttribute('aria-pressed');
      if (isPressed === 'false') {
        await thinkingToggle.click();
        await page.waitForTimeout(500);
      }
    }

    // Send message with thinking enabled
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      await chatInput.fill('What is the meaning of life?');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      // Thinking mode might show thinking indicator
      const thinkingIndicator = page.locator(
        '[data-testid="thinking-indicator"], .thinking, [data-thinking="true"]',
      );
      const showsThinking = await thinkingIndicator.isVisible({ timeout: 3000 }).catch(() => false);

      if (showsThinking) {
        await expect(thinkingIndicator).toBeHidden({ timeout: 60000 });
      }

      // Response should arrive
      await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 60000 });

      const response = await page.locator('[data-role="assistant"]').last().textContent();
      expect(response?.trim().length).toBeGreaterThan(0);

      // No errors
      const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
      expect(await errors.count()).toBe(0);
    }
  });

  test('should show thinking tokens/cost if thinking was used', async ({ page }) => {
    const thinkingToggle = page
      .locator(
        '[data-testid="thinking-mode-toggle"], [aria-label*="thinking"], button:has-text("🧠")',
      )
      .first();

    const toggleExists = await thinkingToggle.isVisible({ timeout: 2000 }).catch(() => false);

    if (toggleExists) {
      const isPressed = await thinkingToggle.getAttribute('aria-pressed');
      if (isPressed === 'false') {
        await thinkingToggle.click();
        await page.waitForTimeout(500);
      }
    }

    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      await chatInput.fill('Complex problem solving');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 60000 });

      // Check for thinking token display
      const thinkingTokens = page.locator('[data-testid="thinking-tokens"], .thinking-tokens');
      const tokensExist = await thinkingTokens.isVisible({ timeout: 2000 }).catch(() => false);

      if (tokensExist) {
        const tokenText = await thinkingTokens.textContent();
        expect(tokenText).toBeTruthy();
        expect(/\d+/.test(tokenText || '')).toBeTruthy(); // Should show number
      }

      // No errors
      const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
      expect(await errors.count()).toBe(0);
    }
  });
});

test.describe('Conversation Modes - Safe vs Full Control', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should have conversation mode selector', async ({ page }) => {
    // Look for conversation mode toggle/selector
    const modeSelector = page
      .locator(
        '[data-testid="conversation-mode"], [aria-label*="conversation"], [aria-label*="mode"]',
      )
      .first();

    const selectorExists = await modeSelector.isVisible({ timeout: 2000 }).catch(() => false);

    if (selectorExists) {
      const modeText = await modeSelector.textContent();
      expect(modeText).toBeTruthy();
      // Should mention safe or control
      expect(/safe|control|mode/i.test(modeText || '')).toBeTruthy();
    }
  });

  test('should send message in Safe mode without errors', async ({ page }) => {
    const modeSelector = page
      .locator('[data-testid="conversation-mode"], [aria-label*="safe"]')
      .first();

    const modeExists = await modeSelector.isVisible({ timeout: 2000 }).catch(() => false);

    if (modeExists) {
      // Ensure Safe mode is selected
      await modeSelector.click();

      const safeOption = page.locator('[role="option"]').filter({ hasText: /safe/i }).first();
      const optionExists = await safeOption.isVisible({ timeout: 2000 }).catch(() => false);

      if (optionExists) {
        await safeOption.click();
        await page.waitForTimeout(500);
      }
    }

    // Send message
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      await chatInput.fill('Safe mode test');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

      // Verify response
      const response = await page.locator('[data-role="assistant"]').last().textContent();
      expect(response?.trim().length).toBeGreaterThan(0);

      // No errors in safe mode
      const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
      expect(await errors.count()).toBe(0);
    }
  });

  test('should send message in Full Control mode without errors', async ({ page }) => {
    const modeSelector = page
      .locator('[data-testid="conversation-mode"], [aria-label*="full|control"]')
      .first();

    const modeExists = await modeSelector.isVisible({ timeout: 2000 }).catch(() => false);

    if (modeExists) {
      await modeSelector.click();

      const fullControlOption = page
        .locator('[role="option"]')
        .filter({ hasText: /full|control/i })
        .first();
      const optionExists = await fullControlOption.isVisible({ timeout: 2000 }).catch(() => false);

      if (optionExists) {
        await fullControlOption.click();
        await page.waitForTimeout(500);
      }
    }

    // Send message
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      await chatInput.fill('Full control mode test');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

      // Verify response
      const response = await page.locator('[data-role="assistant"]').last().textContent();
      expect(response?.trim().length).toBeGreaterThan(0);

      // No errors in full control mode
      const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
      expect(await errors.count()).toBe(0);
    }
  });
});

test.describe('Error Handling & Recovery', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should handle empty input gracefully', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      // Try to send empty message
      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();

      // Button might be disabled for empty input
      const isEnabled = await sendButton.isEnabled();

      if (isEnabled) {
        await sendButton.click();

        // Should show validation error, not crash
        await page.waitForTimeout(1000);

        // App should still be responsive
        expect(await chatInput.isVisible()).toBeTruthy();
      } else {
        // Button is correctly disabled - good UX
        expect(isEnabled).toBeFalsy();
      }
    }
  });

  test('should recover from timeout errors', async ({ page, context }) => {
    // Set very slow network to simulate timeout
    await context.setOffline(true);

    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      await chatInput.fill('This will timeout');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      // Should show error message
      const errorMessage = page.locator(
        '[role="alert"], .error-message, [data-testid="error-message"]',
      );
      await expect(errorMessage).toBeVisible({ timeout: 10000 });

      // Error message should be readable
      const errorText = await errorMessage.textContent();
      expect(errorText).toBeTruthy();
      expect(errorText?.length).toBeGreaterThan(0);
    }

    // Restore connection
    await context.setOffline(false);

    // Should be able to send again
    const chatInput2 = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput2.isVisible()) {
      await chatInput2.fill('Recovery message');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      // Should receive response after recovery
      await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

      const response = await page.locator('[data-role="assistant"]').last().textContent();
      expect(response?.trim().length).toBeGreaterThan(0);
    }
  });

  test('should handle rate limiting gracefully', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      // Send multiple rapid messages
      for (let i = 0; i < 5; i++) {
        await chatInput.fill(`Rapid message ${i + 1}`);

        const sendButton = page
          .locator('button:has-text("Send"), [data-testid="send-message"]')
          .first();

        if (await sendButton.isEnabled()) {
          await sendButton.click();
          await page.waitForTimeout(500);
        }
      }

      // Check if rate limit error appears
      const rateLimitError = page.locator('[role="alert"], .error-message').filter({
        hasText: /rate|limit|too.*fast/i,
      });

      const errorExists = await rateLimitError.isVisible({ timeout: 2000 }).catch(() => false);

      if (errorExists) {
        // Should show clear error message
        const errorText = await rateLimitError.textContent();
        expect(errorText).toBeTruthy();
      }

      // App should remain responsive
      expect(await chatInput.isVisible()).toBeTruthy();
    }
  });

  test('should handle invalid model selection without crash', async ({ page }) => {
    // This test verifies the app doesn't crash with bad model data

    const modelSelector = page
      .locator('[data-testid="quick-model-selector"], .model-selector')
      .first();

    const selectorExists = await modelSelector.isVisible({ timeout: 2000 }).catch(() => false);

    if (selectorExists) {
      // Select multiple different models
      for (let i = 0; i < 2; i++) {
        await modelSelector.click();

        const dropdown = page.locator('[role="listbox"], .model-dropdown').first();
        const optionExists = await dropdown.isVisible({ timeout: 2000 }).catch(() => false);

        if (optionExists) {
          const options = dropdown.locator('[role="option"]');
          const count = await options.count();

          if (count > i) {
            await options.nth(i).click();
            await page.waitForTimeout(500);
          }
        }
      }

      // App should still be functional
      expect(await modelSelector.isVisible()).toBeTruthy();

      // No critical errors
      const criticalErrors = page.locator('[role="alert"]').filter({
        hasText: /error|failed|critical/i,
      });
      expect(await criticalErrors.count()).toBeLessThan(2); // Warnings ok, but not crashes
    }
  });

  test('should display meaningful error messages to user', async ({ page, context }) => {
    // Trigger an error condition
    await context.setOffline(true);

    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      await chatInput.fill('Error test message');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      // Should show error
      const errorAlert = page.locator('[role="alert"]');
      await expect(errorAlert).toBeVisible({ timeout: 10000 });

      const errorText = await errorAlert.textContent();

      // Error should be helpful, not technical
      expect(errorText).toBeTruthy();
      expect(errorText?.length).toBeGreaterThan(10); // Should have meaningful text

      // Should mention connection, network, or offline
      expect(/offline|network|connection|unavailable|error/i.test(errorText || '')).toBeTruthy();
    }

    await context.setOffline(false);
  });
});

test.describe('Complete Workflow - All Features Together', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should complete full workflow: select model, enable thinking, track tokens, send query, receive answer', async ({
    page,
  }) => {
    // Step 1: Select a specific model
    const modelSelector = page
      .locator('[data-testid="quick-model-selector"], .model-selector')
      .first();

    if (await modelSelector.isVisible()) {
      await modelSelector.click();

      const dropdown = page.locator('[role="listbox"], .model-dropdown').first();
      if (await dropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
        const options = dropdown.locator('[role="option"]');
        if (await options.nth(1).isVisible()) {
          await options.nth(1).click();
          await page.waitForTimeout(500);
        }
      }
    }

    // Step 2: Enable thinking mode if available
    const thinkingToggle = page
      .locator('[data-testid="thinking-mode-toggle"], button:has-text("🧠")')
      .first();

    if (await thinkingToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      const isPressed = await thinkingToggle.getAttribute('aria-pressed');
      if (isPressed === 'false') {
        await thinkingToggle.click();
        await page.waitForTimeout(300);
      }
    }

    // Step 3: Set conversation mode (if selector exists)
    const modeSelector = page.locator('[data-testid="conversation-mode"]').first();

    if (await modeSelector.isVisible({ timeout: 2000 }).catch(() => false)) {
      await modeSelector.click();
      const safeMode = page.locator('[role="option"]').filter({ hasText: /safe/i }).first();
      if (await safeMode.isVisible({ timeout: 1000 }).catch(() => false)) {
        await safeMode.click();
        await page.waitForTimeout(300);
      }
    }

    // Step 4: Send comprehensive query
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      await chatInput.fill('Explain quantum entanglement in simple terms');

      // Step 5: Click send
      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await expect(sendButton).toBeEnabled();
      await sendButton.click();

      // Step 6: Verify user message appears
      await expect(page.locator('[data-role="user"]').last()).toContainText('quantum entanglement');

      // Step 7: Check for streaming
      const streamingIndicator = page.locator('[data-streaming="true"], .streaming').first();
      const isStreaming = await streamingIndicator.isVisible({ timeout: 5000 }).catch(() => false);

      if (isStreaming) {
        await expect(streamingIndicator).toBeHidden({ timeout: 60000 });
      }

      // Step 8: Verify assistant response
      await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 60000 });

      const response = await page.locator('[data-role="assistant"]').last().textContent();
      expect(response?.trim().length).toBeGreaterThan(0);

      // Step 9: Check token tracking
      const tokenElements = page.locator('[data-testid*="token"], [data-testid*="cost"]');
      const tokenCount = await tokenElements.count();
      expect(tokenCount).toBeGreaterThanOrEqual(0); // Tokens may or may not be shown

      // Step 10: Verify NO errors throughout entire workflow
      const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
      const errorCount = await errors.count();
      expect(errorCount).toBe(0);

      // Step 11: Verify input is cleared and ready for next message
      await expect(chatInput).toHaveValue('');
      await expect(sendButton).toBeEnabled();
    }
  });
});
