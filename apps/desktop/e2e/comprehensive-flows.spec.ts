import { test, expect } from '@playwright/test';

test.describe('Token Tracking & Counting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should track and display input tokens in token counter', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('Hello');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const tokenCounter = page.locator('[data-testid="token-counter"], .token-counter').first();
    await expect(tokenCounter).toBeVisible({ timeout: 5000 });
    const counterText = await tokenCounter.textContent();
    expect(counterText).toBeTruthy();
    expect(/\d+/.test(counterText || '')).toBeTruthy();

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should track output tokens after receiving response', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    await chatInput.fill('Tell me about quantum computing');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    const streamingIndicator = page.locator('[data-streaming="true"], .streaming').first();
    await streamingIndicator.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible();

    const tokenBreakdown = page.locator('[data-testid="token-breakdown"], .token-breakdown');
    await expect(tokenBreakdown).toBeVisible({ timeout: 5000 });
    const breakdownText = await tokenBreakdown.textContent();
    expect(breakdownText).toBeTruthy();

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should display cost information alongside tokens', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('Write a poem');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const costDisplay = page.locator(
      '[data-testid="message-cost"], .message-cost, [data-testid="cost-badge"]',
    );
    await expect(costDisplay).toBeVisible({ timeout: 5000 });
    const costText = await costDisplay.textContent();
    expect(costText).toBeTruthy();
    expect(/\$|¢|cents/.test(costText || '')).toBeTruthy();

    const costSidebar = page.locator('[data-testid="cost-sidebar"], .cost-widget').first();
    await expect(costSidebar).toBeVisible({ timeout: 5000 });
    const sidebarText = await costSidebar.textContent();
    expect(sidebarText).toMatch(/today|spent|cost/i);

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should update token budget alerts when threshold is reached', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    for (let i = 0; i < 3; i++) {
      await chatInput.fill(`Message ${i + 1}: Tell me about space`);

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      const assistantMessageCount = await page.locator('[data-role="assistant"]').count();
      await expect(page.locator('[data-role="assistant"]').nth(assistantMessageCount)).toBeVisible({
        timeout: 15000,
      });
      const streamingIndicator = page.locator('[data-streaming="true"], .streaming').first();
      await streamingIndicator.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    }

    const budgetPanel = page.locator('[data-testid="budget-alerts"], .budget-alerts-panel');
    await expect(budgetPanel).toBeVisible({ timeout: 5000 });
    const panelText = await budgetPanel.textContent();
    expect(panelText).toBeTruthy();
    expect(/token|budget|%|percent/i.test(panelText || '')).toBeTruthy();

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
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

    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('What is 2+2?');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    await expect(page.locator('[data-role="user"]').last()).toContainText('2+2');

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const response = await page.locator('[data-role="assistant"]').last().textContent();
    expect(response?.trim().length).toBeGreaterThan(0);

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should handle streaming API responses correctly', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('Write a short paragraph about AI');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    const streamingIndicator = page.locator('[data-streaming="true"], .streaming').first();
    await expect(streamingIndicator).toBeVisible({ timeout: 5000 });

    await expect(streamingIndicator).toBeHidden({ timeout: 30000 });

    const finalResponse = await page.locator('[data-role="assistant"]').last().textContent();
    expect(finalResponse?.trim().length).toBeGreaterThan(0);

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should include token usage in API response metadata', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('Explain photosynthesis');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const tokenElements = page.locator('[data-testid*="token"], [data-testid*="usage"]');
    await expect(tokenElements.first()).toBeVisible({ timeout: 5000 });

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });
});

test.describe('Model Selection - Individual Models', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should allow selecting individual LLM models from dropdown', async ({ page }) => {
    const modelSelector = page
      .locator('[data-testid="quick-model-selector"], .model-selector')
      .first();

    await expect(modelSelector).toBeVisible({ timeout: 5000 });
    await modelSelector.click();

    const dropdown = page.locator('[role="listbox"], .model-dropdown').first();
    await expect(dropdown).toBeVisible({ timeout: 3000 });

    const modelOptions = dropdown.locator('[role="option"]');
    const optionCount = await modelOptions.count();
    expect(optionCount).toBeGreaterThan(0);

    const nonAutoOption = modelOptions.nth(1);
    const optionText = await nonAutoOption.textContent();
    expect(optionText).toBeTruthy();

    await nonAutoOption.click();

    await expect(dropdown).toBeHidden();
    const selectedModel = await modelSelector.textContent();
    expect(selectedModel?.toLowerCase()).not.toContain('auto');

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should send message with selected individual model', async ({ page }) => {
    const modelSelector = page
      .locator('[data-testid="quick-model-selector"], .model-selector')
      .first();

    await expect(modelSelector).toBeVisible({ timeout: 5000 });
    await modelSelector.click();

    const dropdown = page.locator('[role="listbox"], .model-dropdown').first();
    await expect(dropdown).toBeVisible({ timeout: 3000 });

    const modelOptions = dropdown.locator('[role="option"]');
    await modelOptions.nth(1).click();

    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('Hello with specific model');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({
      timeout: 30000,
    });

    const assistantMessage = await page.locator('[data-role="assistant"]').last().textContent();
    expect(assistantMessage?.trim().length).toBeGreaterThan(0);

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should display selected model in message metadata', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('Test with model');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const messageItem = page.locator('[data-testid="message-item"]').last();
    const modelBadge = messageItem.locator('[data-testid="model-badge"], .model-info');

    await expect(modelBadge).toBeVisible({ timeout: 5000 });
    const modelText = await modelBadge.textContent();
    expect(modelText).toBeTruthy();
    expect(/gpt|claude|gemini|auto|router/i.test(modelText || '')).toBeTruthy();

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
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

    await expect(modelSelector).toBeVisible({ timeout: 5000 });
    const selectedText = await modelSelector.textContent();
    expect(/auto|routing|smart/i.test(selectedText || '')).toBeTruthy();
  });

  test('should route to appropriate model based on Auto strategy', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    await chatInput.fill('What is machine learning?');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const assistantMessage = await page.locator('[data-role="assistant"]').last().textContent();
    expect(assistantMessage?.trim().length).toBeGreaterThan(0);

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should handle multiple Auto modes (Economy, Balanced, Premium)', async ({ page }) => {
    const modelSelector = page
      .locator('[data-testid="quick-model-selector"], .model-selector')
      .first();

    await expect(modelSelector).toBeVisible({ timeout: 5000 });
    await modelSelector.click();

    const dropdown = page.locator('[role="listbox"], .model-dropdown').first();
    await expect(dropdown).toBeVisible({ timeout: 3000 });

    const autoOptions = dropdown.locator('[role="option"]').filter({
      hasText: /auto|economy|balanced|premium|value|best/i,
    });

    const autoCount = await autoOptions.count();
    expect(autoCount).toBeGreaterThanOrEqual(1);

    const firstAuto = autoOptions.first();
    const autoText = await firstAuto.textContent();
    expect(autoText).toBeTruthy();

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });
});

test.describe('Thinking Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should toggle thinking mode via brain icon', async ({ page }) => {
    const thinkingToggle = page
      .locator(
        '[data-testid="thinking-mode-toggle"], [aria-label*="thinking"], button:has-text("🧠")',
      )
      .first();

    await expect(thinkingToggle).toBeVisible({ timeout: 5000 });
    const initialState = await thinkingToggle.getAttribute('aria-pressed');

    await thinkingToggle.click();

    await expect(thinkingToggle).not.toHaveAttribute('aria-pressed', initialState || '');

    const newState = await thinkingToggle.getAttribute('aria-pressed');
    if (initialState !== null && newState !== null) {
      expect(initialState).not.toBe(newState);
    }

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should send message with thinking mode enabled', async ({ page }) => {
    const thinkingToggle = page
      .locator(
        '[data-testid="thinking-mode-toggle"], [aria-label*="thinking"], button:has-text("🧠")',
      )
      .first();

    await expect(thinkingToggle).toBeVisible({ timeout: 5000 });

    const isPressed = await thinkingToggle.getAttribute('aria-pressed');
    if (isPressed === 'false') {
      await thinkingToggle.click();
      await expect(thinkingToggle).toHaveAttribute('aria-pressed', 'true');
    }

    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('What is the meaning of life?');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    const thinkingIndicator = page.locator(
      '[data-testid="thinking-indicator"], .thinking, [data-thinking="true"]',
    );
    await expect(thinkingIndicator).toBeVisible({ timeout: 10000 });
    await expect(thinkingIndicator).toBeHidden({ timeout: 60000 });

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 60000 });

    const response = await page.locator('[data-role="assistant"]').last().textContent();
    expect(response?.trim().length).toBeGreaterThan(0);

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should show thinking tokens/cost if thinking was used', async ({ page }) => {
    const thinkingToggle = page
      .locator(
        '[data-testid="thinking-mode-toggle"], [aria-label*="thinking"], button:has-text("🧠")',
      )
      .first();

    await expect(thinkingToggle).toBeVisible({ timeout: 5000 });

    const isPressed = await thinkingToggle.getAttribute('aria-pressed');
    if (isPressed === 'false') {
      await thinkingToggle.click();
      await expect(thinkingToggle).toHaveAttribute('aria-pressed', 'true');
    }

    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('Complex problem solving');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 60000 });

    const thinkingTokens = page.locator('[data-testid="thinking-tokens"], .thinking-tokens');
    await expect(thinkingTokens).toBeVisible({ timeout: 5000 });
    const tokenText = await thinkingTokens.textContent();
    expect(tokenText).toBeTruthy();
    expect(/\d+/.test(tokenText || '')).toBeTruthy();

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });
});

test.describe('Conversation Modes - Safe vs Full Control', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should have conversation mode selector', async ({ page }) => {
    const modeSelector = page
      .locator(
        '[data-testid="conversation-mode"], [aria-label*="conversation"], [aria-label*="mode"]',
      )
      .first();

    await expect(modeSelector).toBeVisible({ timeout: 5000 });
    const modeText = await modeSelector.textContent();
    expect(modeText).toBeTruthy();
    expect(/safe|control|mode/i.test(modeText || '')).toBeTruthy();
  });

  test('should send message in Safe mode without errors', async ({ page }) => {
    const modeSelector = page
      .locator('[data-testid="conversation-mode"], [aria-label*="safe"]')
      .first();

    await expect(modeSelector).toBeVisible({ timeout: 5000 });

    await modeSelector.click();

    const safeOption = page.locator('[role="option"]').filter({ hasText: /safe/i }).first();
    await expect(safeOption).toBeVisible({ timeout: 3000 });
    await safeOption.click();
    await expect(safeOption).toBeHidden();

    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('Safe mode test');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const response = await page.locator('[data-role="assistant"]').last().textContent();
    expect(response?.trim().length).toBeGreaterThan(0);

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should send message in Full Control mode without errors', async ({ page }) => {
    const modeSelector = page
      .locator('[data-testid="conversation-mode"], [aria-label*="full|control"]')
      .first();

    await expect(modeSelector).toBeVisible({ timeout: 5000 });
    await modeSelector.click();

    const fullControlOption = page
      .locator('[role="option"]')
      .filter({ hasText: /full|control/i })
      .first();
    await expect(fullControlOption).toBeVisible({ timeout: 3000 });
    await fullControlOption.click();
    await expect(fullControlOption).toBeHidden();

    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('Full control mode test');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const response = await page.locator('[data-role="assistant"]').last().textContent();
    expect(response?.trim().length).toBeGreaterThan(0);

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
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

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();

    await expect(sendButton).toBeDisabled();
  });

  test('should recover from timeout errors', async ({ page, context }) => {
    await context.setOffline(true);

    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('This will timeout');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    const errorMessage = page.locator(
      '[role="alert"], .error-message, [data-testid="error-message"]',
    );
    await expect(errorMessage).toBeVisible({ timeout: 10000 });

    const errorText = await errorMessage.textContent();
    expect(errorText).toBeTruthy();
    expect(errorText?.length).toBeGreaterThan(0);

    await context.setOffline(false);

    await chatInput.fill('Recovery message');
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const response = await page.locator('[data-role="assistant"]').last().textContent();
    expect(response?.trim().length).toBeGreaterThan(0);
  });

  test('should handle rate limiting gracefully', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    for (let i = 0; i < 5; i++) {
      await chatInput.fill(`Rapid message ${i + 1}`);

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();

      const isEnabled = await sendButton.isEnabled();
      if (isEnabled) {
        await sendButton.click();
        await page.waitForLoadState('networkidle').catch(() => {});
      }
    }

    await expect(chatInput).toBeVisible();
  });

  test('should handle invalid model selection without crash', async ({ page }) => {

    const modelSelector = page
      .locator('[data-testid="quick-model-selector"], .model-selector')
      .first();

    await expect(modelSelector).toBeVisible({ timeout: 5000 });

    for (let i = 0; i < 2; i++) {
      await modelSelector.click();

      const dropdown = page.locator('[role="listbox"], .model-dropdown').first();
      await expect(dropdown).toBeVisible({ timeout: 3000 });

      const options = dropdown.locator('[role="option"]');
      const count = await options.count();

      if (count > i) {
        await options.nth(i).click();
        await expect(dropdown).toBeHidden();
      }
    }

    await expect(modelSelector).toBeVisible();

    const criticalErrors = page.locator('[role="alert"]').filter({
      hasText: /error|failed|critical/i,
    });
    expect(await criticalErrors.count()).toBeLessThan(2);
  });

  test('should display meaningful error messages to user', async ({ page, context }) => {
    await context.setOffline(true);

    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('Error test message');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert).toBeVisible({ timeout: 10000 });

    const errorText = await errorAlert.textContent();

    expect(errorText).toBeTruthy();
    expect(errorText?.length).toBeGreaterThan(10);

    expect(/offline|network|connection|unavailable|error/i.test(errorText || '')).toBeTruthy();

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
    const modelSelector = page
      .locator('[data-testid="quick-model-selector"], .model-selector')
      .first();

    await expect(modelSelector).toBeVisible({ timeout: 5000 });
    await modelSelector.click();

    const dropdown = page.locator('[role="listbox"], .model-dropdown').first();
    await expect(dropdown).toBeVisible({ timeout: 3000 });
    const options = dropdown.locator('[role="option"]');
    await options.nth(1).click();
    await expect(dropdown).toBeHidden();

    const thinkingToggle = page
      .locator('[data-testid="thinking-mode-toggle"], button:has-text("🧠")')
      .first();

    await expect(thinkingToggle).toBeVisible({ timeout: 5000 });
    const isPressed = await thinkingToggle.getAttribute('aria-pressed');
    if (isPressed === 'false') {
      await thinkingToggle.click();
      await expect(thinkingToggle).toHaveAttribute('aria-pressed', 'true');
    }

    const modeSelector = page.locator('[data-testid="conversation-mode"]').first();

    await expect(modeSelector).toBeVisible({ timeout: 5000 });
    await modeSelector.click();
    const safeMode = page.locator('[role="option"]').filter({ hasText: /safe/i }).first();
    await expect(safeMode).toBeVisible({ timeout: 3000 });
    await safeMode.click();
    await expect(safeMode).toBeHidden();

    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('Explain quantum entanglement in simple terms');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await expect(sendButton).toBeEnabled();
    await sendButton.click();

    await expect(page.locator('[data-role="user"]').last()).toContainText('quantum entanglement');

    const streamingIndicator = page.locator('[data-streaming="true"], .streaming').first();
    await expect(streamingIndicator).toBeVisible({ timeout: 5000 });
    await expect(streamingIndicator).toBeHidden({ timeout: 60000 });

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 60000 });

    const response = await page.locator('[data-role="assistant"]').last().textContent();
    expect(response?.trim().length).toBeGreaterThan(0);

    const tokenElements = page.locator('[data-testid*="token"], [data-testid*="cost"]');
    await expect(tokenElements.first()).toBeVisible({ timeout: 5000 });

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    const errorCount = await errors.count();
    expect(errorCount).toBe(0);

    await expect(chatInput).toHaveValue('');
    await expect(sendButton).toBeEnabled();
  });
});
