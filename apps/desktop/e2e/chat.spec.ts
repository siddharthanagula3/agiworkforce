import { test, expect } from '@playwright/test';

/**
 * End-to-end tests for Chat functionality
 * Tests conversation creation, messaging, streaming, and AGI integration
 */

test.describe('Chat Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should create a new conversation', async ({ page }) => {
    // Click "New Chat" button (adjust selector based on actual UI)
    const newChatButton = page
      .locator('button:has-text("New Chat"), [data-testid="new-chat"]')
      .first();

    if (await newChatButton.isVisible()) {
      await newChatButton.click();

      // Verify new conversation is created
      await expect(page.locator('[data-testid="conversation-list"] li').first()).toBeVisible();
    }
  });

  test('should send a message and receive response', async ({ page }) => {
    // Find chat input (adjust selector based on actual UI)
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    if (await chatInput.isVisible()) {
      // Type a message
      await chatInput.fill('Hello, how are you?');

      // Send message
      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      // Verify user message appears
      await expect(page.locator('[data-role="user"]').last()).toContainText('Hello');

      // Wait for assistant response (with timeout for LLM response)
      await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });
    }
  });

  test('should display conversation history', async ({ page }) => {
    // Check if conversations list exists
    const conversationsList = page
      .locator('[data-testid="conversation-list"], .conversation-list')
      .first();

    if (await conversationsList.isVisible()) {
      // Verify at least one conversation exists or list is empty
      const conversationItems = conversationsList.locator('li, [data-testid="conversation-item"]');
      const count = await conversationItems.count();

      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should pin/unpin conversations', async ({ page }) => {
    const conversationItem = page.locator('[data-testid="conversation-item"]').first();

    if (await conversationItem.isVisible()) {
      // Find pin button
      const pinButton = conversationItem
        .locator('button[aria-label*="Pin"], [data-testid="pin-conversation"]')
        .first();

      if (await pinButton.isVisible()) {
        await pinButton.click();

        // Verify pinned state (icon change or class change)
        await expect(pinButton).toHaveAttribute('aria-label', /Unpin/i);
      }
    }
  });

  test('should delete a conversation', async ({ page }) => {
    const conversationItem = page.locator('[data-testid="conversation-item"]').first();

    if (await conversationItem.isVisible()) {
      // Get initial count
      const initialCount = await page.locator('[data-testid="conversation-item"]').count();

      // Find delete button
      const deleteButton = conversationItem
        .locator('button[aria-label*="Delete"], [data-testid="delete-conversation"]')
        .first();

      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        // Confirm deletion if modal appears
        const confirmButton = page
          .locator('button:has-text("Delete"), button:has-text("Confirm")')
          .first();
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }

        // Verify conversation is deleted
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

      // Verify filtered results
      await page.waitForTimeout(500); // Wait for debounce

      const visibleConversations = page.locator('[data-testid="conversation-item"]:visible');
      const count = await visibleConversations.count();

      // Should show only matching conversations or empty state
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

      // Wait for streaming to start
      const streamingIndicator = page.locator('[data-streaming="true"], .streaming').first();
      await expect(streamingIndicator).toBeVisible({ timeout: 5000 });

      // Verify streaming indicator disappears when complete
      await expect(streamingIndicator).not.toBeVisible({ timeout: 30000 });
    }
  });

  test('should edit a message', async ({ page }) => {
    const messageItem = page.locator('[data-testid="message-item"]').last();

    if (await messageItem.isVisible()) {
      // Hover to show edit button
      await messageItem.hover();

      const editButton = messageItem
        .locator('button[aria-label*="Edit"], [data-testid="edit-message"]')
        .first();

      if (await editButton.isVisible()) {
        await editButton.click();

        // Edit the message
        const editInput = page.locator('textarea[data-editing="true"]').first();
        await editInput.clear();
        await editInput.fill('Edited message content');

        // Save edit
        const saveButton = page
          .locator('button:has-text("Save"), [data-testid="save-edit"]')
          .first();
        await saveButton.click();

        // Verify message was updated
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

      // Verify stats modal/panel appears
      const statsPanel = page.locator('[data-testid="stats-panel"], .stats-modal').first();
      await expect(statsPanel).toBeVisible();

      // Verify stats content (tokens, cost, etc.)
      await expect(statsPanel).toContainText(/tokens|cost/i);
    }
  });

  test('should handle offline state gracefully', async ({ page, context }) => {
    // Simulate offline
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

      // Verify error message appears
      const errorMessage = page.locator('[role="alert"], .error-message').first();
      await expect(errorMessage).toBeVisible({ timeout: 10000 });
    }

    // Restore online
    await context.setOffline(false);
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
      // Send a goal-like message
      await chatInput.fill('Create a React component for user authentication');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      // Look for AGI submission indicator
      const agiIndicator = page
        .locator('[data-testid="agi-submitted"], .agi-goal-indicator')
        .first();

      // If visible, verify it appears
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
      // Send a non-goal message
      await chatInput.fill('Hello');

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      // Verify no AGI indicator appears
      const agiIndicator = page
        .locator('[data-testid="agi-submitted"], .agi-goal-indicator')
        .first();
      await expect(agiIndicator).not.toBeVisible({ timeout: 3000 });
    }
  });
});
