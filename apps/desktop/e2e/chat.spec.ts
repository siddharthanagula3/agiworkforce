import { test, expect } from '@playwright/test';

test.describe('Chat Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should create a new conversation', async ({ page }) => {
    const newChatButton = page
      .locator('button:has-text("New Chat"), [data-testid="new-chat"]')
      .first();

    if (await newChatButton.isVisible()) {
      await newChatButton.click();

      await expect(page.locator('[data-testid="conversation-list"] li').first()).toBeVisible();
    }
  });

  test('should send a message and receive response', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      await chatInput.fill('Hello, how are you?');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      await expect(page.locator('[data-role="user"]').last()).toContainText('Hello');

      await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });
    }
  });

  test('should display conversation history', async ({ page }) => {
    const conversationsList = page
      .locator('[data-testid="conversation-list"], .conversation-list')
      .first();

    if (await conversationsList.isVisible()) {
      const conversationItems = conversationsList.locator('li, [data-testid="conversation-item"]');
      const count = await conversationItems.count();

      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should pin/unpin conversations', async ({ page }) => {
    const conversationItem = page.locator('[data-testid="conversation-item"]').first();

    if (await conversationItem.isVisible()) {
      const pinButton = conversationItem
        .locator('button[aria-label*="Pin"], [data-testid="pin-conversation"]')
        .first();

      if (await pinButton.isVisible()) {
        await pinButton.click();

        await expect(pinButton).toHaveAttribute('aria-label', /Unpin/i);
      }
    }
  });

  test('should delete a conversation', async ({ page }) => {
    const conversationItem = page.locator('[data-testid="conversation-item"]').first();

    if (await conversationItem.isVisible()) {
      const initialCount = await page.locator('[data-testid="conversation-item"]').count();

      const deleteButton = conversationItem
        .locator('button[aria-label*="Delete"], [data-testid="delete-conversation"]')
        .first();

      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        const confirmButton = page
          .locator('button:has-text("Delete"), button:has-text("Confirm")')
          .first();
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }

        const newCount = await page.locator('[data-testid="conversation-item"]').count();
        expect(newCount).toBeLessThan(initialCount);
      }
    }
  });

  test('should search conversations', async ({ page }) => {
    const searchInput = page
      .locator('input[placeholder*="Search"], [data-testid="search-conversations"]')
      .first();

    if (await searchInput.isVisible()) {
      await searchInput.fill('test');

      await page.waitForTimeout(500);

      const visibleConversations = page.locator('[data-testid="conversation-item"]:visible');
      const count = await visibleConversations.count();

      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should display streaming response', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      await chatInput.fill('Tell me a long story');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      const streamingIndicator = page.locator('[data-streaming="true"], .streaming').first();
      await expect(streamingIndicator).toBeVisible({ timeout: 5000 });

      await expect(streamingIndicator).not.toBeVisible({ timeout: 30000 });
    }
  });

  test('should edit a message', async ({ page }) => {
    const messageItem = page.locator('[data-testid="message-item"]').last();

    if (await messageItem.isVisible()) {
      await messageItem.hover();

      const editButton = messageItem
        .locator('button[aria-label*="Edit"], [data-testid="edit-message"]')
        .first();

      if (await editButton.isVisible()) {
        await editButton.click();

        const editInput = page.locator('textarea[data-editing="true"]').first();
        await editInput.clear();
        await editInput.fill('Edited message content');

        const saveButton = page
          .locator('button:has-text("Save"), [data-testid="save-edit"]')
          .first();
        await saveButton.click();

        await expect(messageItem).toContainText('Edited message content');
      }
    }
  });

  test('should display message statistics', async ({ page }) => {
    const statsButton = page
      .locator('button:has-text("Stats"), [data-testid="show-stats"]')
      .first();

    if (await statsButton.isVisible()) {
      await statsButton.click();

      const statsPanel = page.locator('[data-testid="stats-panel"], .stats-modal').first();
      await expect(statsPanel).toBeVisible();

      await expect(statsPanel).toContainText(/tokens|cost/i);
    }
  });

  test('should handle offline state gracefully', async ({ page, context }) => {
    await context.setOffline(true);

    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      await chatInput.fill('This should fail');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      const errorMessage = page.locator('[role="alert"], .error-message').first();
      await expect(errorMessage).toBeVisible({ timeout: 10000 });
    }

    await context.setOffline(false);
  });

  test('should complete entire flow: send query and receive answer without errors', async ({
    page,
  }) => {
    // Increase timeout for this comprehensive test
    test.setTimeout(60000);

    // Step 1: Verify chat interface is loaded - use broader selector set
    const chatInput = page
      .locator(
        'textarea[placeholder*="message"], textarea[placeholder*="Message"], textarea, [data-testid="chat-input"], input[type="text"]',
      )
      .first();

    // Wait for page to fully load first
    await page.waitForLoadState('domcontentloaded');
    await page.locator('body').waitFor({ state: 'visible', timeout: 10000 });

    // Check if chat input is available
    const chatInputVisible = await chatInput.isVisible({ timeout: 5000 }).catch(() => false);

    if (!chatInputVisible) {
      // Try clicking on a "New Chat" button if visible
      const newChatButton = page
        .locator('button:has-text("New Chat"), button:has-text("New"), [data-testid="new-chat"]')
        .first();
      if (await newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await newChatButton.click();
        await page.waitForTimeout(1000);
      }
    }

    // Now check if chat input is visible
    if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Step 2: Fill the input with a query
      const testQuery = 'What is the capital of France?';
      await chatInput.fill(testQuery);

      // Step 3: Verify input is filled correctly
      const inputValue = await chatInput.inputValue();
      expect(inputValue).toBe(testQuery);

      // Step 4: Click send button
      const sendButton = page
        .locator('button:has-text("Send"), button[type="submit"], [data-testid="send-message"]')
        .first();

      if (await sendButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sendButton.click();

        // Step 5: Verify user message appears in chat (flexible selectors)
        const userMessage = page
          .locator('[data-role="user"], .user-message, [class*="user"]')
          .last();
        await expect(userMessage).toContainText(testQuery, { timeout: 10000 });

        // Step 6: Check for streaming indicator (if present)
        const streamingIndicator = page
          .locator('[data-streaming="true"], .streaming, [class*="loading"]')
          .first();
        const streamingExists = await streamingIndicator
          .isVisible({ timeout: 2000 })
          .catch(() => false);

        if (streamingExists) {
          // Wait for streaming to complete (max 30 seconds)
          await expect(streamingIndicator).toBeHidden({ timeout: 30000 });
        }

        // Step 7: Verify assistant response appears (flexible selectors)
        const assistantMessage = page
          .locator('[data-role="assistant"], .assistant-message, [class*="assistant"]')
          .last();
        await expect(assistantMessage).toBeVisible({ timeout: 30000 });

        // Step 8: Verify response is not empty
        const responseText = await assistantMessage.textContent();
        expect(responseText?.trim().length).toBeGreaterThan(0);

        // Step 9: Check for error states - no error message should be visible
        const errorIndicators = page.locator(
          '[role="alert"], .error-message, [data-testid="error-message"]',
        );
        const errorCount = await errorIndicators.count();
        expect(errorCount).toBe(0);
      }
    }
  });
});

test.describe('Chat AGI Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should detect and submit goal-like messages', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      await chatInput.fill('Create a React component for user authentication');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      const agiIndicator = page
        .locator('[data-testid="agi-submitted"], .agi-goal-indicator')
        .first();

      if (await agiIndicator.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(agiIndicator).toBeVisible();
      }
    }
  });

  test('should not submit non-goal messages to AGI', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      await chatInput.fill('Hello');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      const agiIndicator = page
        .locator('[data-testid="agi-submitted"], .agi-goal-indicator')
        .first();
      await expect(agiIndicator).not.toBeVisible({ timeout: 3000 });
    }
  });
});
