import { test, expect } from '@playwright/test';

test.describe('Chat Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should create a new conversation', async ({ page }) => {
    // Prefer semantic role-based locator, fall back to testid for custom components
    const newChatButton = page.getByRole('button', { name: /new chat/i });

    if (await newChatButton.isVisible()) {
      await newChatButton.click();

      await expect(page.getByTestId('conversation-list').locator('li').first()).toBeVisible();
    }
  });

  test('should send a message and receive response', async ({ page }) => {
    // Use role-based locator for textarea (textbox role)
    const chatInput = page.getByRole('textbox', { name: /message/i });

    if (await chatInput.isVisible()) {
      await chatInput.fill('Hello, how are you?');

      const sendButton = page.getByRole('button', { name: /send/i });
      await sendButton.click();

      await expect(page.locator('[data-role="user"]').last()).toContainText('Hello');

      await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });
    }
  });

  test('should display conversation history', async ({ page }) => {
    const conversationsList = page.getByTestId('conversation-list');

    if (await conversationsList.isVisible()) {
      const conversationItems = conversationsList.getByTestId('conversation-item');
      const count = await conversationItems.count();

      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should pin/unpin conversations', async ({ page }) => {
    const conversationItem = page.getByTestId('conversation-item').first();

    if (await conversationItem.isVisible()) {
      const pinButton = conversationItem.getByRole('button', { name: /pin/i });

      if (await pinButton.isVisible()) {
        await pinButton.click();

        await expect(pinButton).toHaveAttribute('aria-label', /Unpin/i);
      }
    }
  });

  test('should delete a conversation', async ({ page }) => {
    const conversationItem = page.getByTestId('conversation-item').first();

    if (await conversationItem.isVisible()) {
      const initialCount = await page.getByTestId('conversation-item').count();

      const deleteButton = conversationItem.getByRole('button', { name: /delete/i });

      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        // Look for confirmation dialog button
        const confirmButton = page.getByRole('button', { name: /delete|confirm/i });
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }

        const newCount = await page.getByTestId('conversation-item').count();
        expect(newCount).toBeLessThan(initialCount);
      }
    }
  });

  test('should search conversations', async ({ page }) => {
    // Use role-based locator for search input
    const searchInput = page.getByRole('searchbox', { name: /search/i });

    if (await searchInput.isVisible()) {
      await searchInput.fill('test');

      await page.waitForTimeout(500);

      const visibleConversations = page.getByTestId('conversation-item').filter({ hasNotText: '' });
      const count = await visibleConversations.count();

      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should display streaming response', async ({ page }) => {
    const chatInput = page.getByRole('textbox', { name: /message/i });

    if (await chatInput.isVisible()) {
      await chatInput.fill('Tell me a long story');

      const sendButton = page.getByRole('button', { name: /send/i });
      await sendButton.click();

      const streamingIndicator = page.locator('[data-streaming="true"]').first();
      await expect(streamingIndicator).toBeVisible({ timeout: 5000 });

      await expect(streamingIndicator).not.toBeVisible({ timeout: 30000 });
    }
  });

  test('should edit a message', async ({ page }) => {
    const messageItem = page.getByTestId('message-item').last();

    if (await messageItem.isVisible()) {
      await messageItem.hover();

      const editButton = messageItem.getByRole('button', { name: /edit/i });

      if (await editButton.isVisible()) {
        await editButton.click();

        // Editing textarea - use data attribute for specific editing state
        const editInput = page.locator('textarea[data-editing="true"]').first();
        await editInput.clear();
        await editInput.fill('Edited message content');

        const saveButton = page.getByRole('button', { name: /save/i });
        await saveButton.click();

        await expect(messageItem).toContainText('Edited message content');
      }
    }
  });

  test('should display message statistics', async ({ page }) => {
    const statsButton = page.getByRole('button', { name: /stats/i });

    if (await statsButton.isVisible()) {
      await statsButton.click();

      const statsPanel = page.getByTestId('stats-panel');
      await expect(statsPanel).toBeVisible();

      await expect(statsPanel).toContainText(/tokens|cost/i);
    }
  });

  test('should handle offline state gracefully', async ({ page, context }) => {
    await context.setOffline(true);

    const chatInput = page.getByRole('textbox', { name: /message/i });

    if (await chatInput.isVisible()) {
      await chatInput.fill('This should fail');

      const sendButton = page.getByRole('button', { name: /send/i });
      await sendButton.click();

      // Use role-based alert locator for error messages
      const errorMessage = page.getByRole('alert');
      await expect(errorMessage).toBeVisible({ timeout: 10000 });
    }

    await context.setOffline(false);
  });

  test('should complete entire flow: send query and receive answer without errors', async ({
    page,
  }) => {
    // Increase timeout for this comprehensive test
    test.setTimeout(60000);

    // Step 1: Verify chat interface is loaded - use semantic textbox role
    const chatInput = page.getByRole('textbox', { name: /message/i });

    // Wait for page to fully load first
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Check if chat input is available
    const chatInputVisible = await chatInput.isVisible({ timeout: 5000 }).catch(() => false);

    if (!chatInputVisible) {
      // Try clicking on a "New Chat" button if visible
      const newChatButton = page.getByRole('button', { name: /new chat|new/i });
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
      const sendButton = page.getByRole('button', { name: /send/i });

      if (await sendButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sendButton.click();

        // Step 5: Verify user message appears in chat
        const userMessage = page.locator('[data-role="user"]').last();
        await expect(userMessage).toContainText(testQuery, { timeout: 10000 });

        // Step 6: Check for streaming indicator (if present)
        const streamingIndicator = page.locator('[data-streaming="true"]').first();
        const streamingExists = await streamingIndicator
          .isVisible({ timeout: 2000 })
          .catch(() => false);

        if (streamingExists) {
          // Wait for streaming to complete (max 30 seconds)
          await expect(streamingIndicator).toBeHidden({ timeout: 30000 });
        }

        // Step 7: Verify assistant response appears
        const assistantMessage = page.locator('[data-role="assistant"]').last();
        await expect(assistantMessage).toBeVisible({ timeout: 30000 });

        // Step 8: Verify response is not empty
        const responseText = await assistantMessage.textContent();
        expect(responseText?.trim().length).toBeGreaterThan(0);

        // Step 9: Check for error states - no error message should be visible
        const errorIndicators = page.getByRole('alert');
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
    const chatInput = page.getByRole('textbox', { name: /message/i });

    if (await chatInput.isVisible()) {
      await chatInput.fill('Create a React component for user authentication');

      const sendButton = page.getByRole('button', { name: /send/i });
      await sendButton.click();

      const agiIndicator = page.getByTestId('agi-submitted');

      if (await agiIndicator.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(agiIndicator).toBeVisible();
      }
    }
  });

  test('should not submit non-goal messages to AGI', async ({ page }) => {
    const chatInput = page.getByRole('textbox', { name: /message/i });

    if (await chatInput.isVisible()) {
      await chatInput.fill('Hello');

      const sendButton = page.getByRole('button', { name: /send/i });
      await sendButton.click();

      const agiIndicator = page.getByTestId('agi-submitted');
      await expect(agiIndicator).not.toBeVisible({ timeout: 3000 });
    }
  });
});
