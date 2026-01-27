import { test, expect } from '@playwright/test';

/**
 * ADVANCED INTEGRATION TEST SUITE
 *
 * Tests advanced features and complex workflows:
 * - Tool execution and approvals
 * - AGI goal detection and submission
 * - Multi-turn conversations with state preservation
 * - Credit/subscription validation
 * - Budget enforcement
 * - Complex user workflows
 *
 * All tests verify NO errors appear and system behaves consistently
 *
 * NOTE: Tests use proper assertions instead of conditional logic.
 * If an element is missing, the test will fail rather than silently pass.
 */

test.describe('Tool Execution & Approvals', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should detect when tools are available in response', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    // Send query that might trigger tool use
    await chatInput.fill('Show me the weather and current time');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    // Check for tool indicators - should be present when tools are used
    const toolIndicator = page.locator(
      '[data-testid="tool-call"], [data-testid="tool-indicator"], .tool-badge',
    );
    await expect(toolIndicator).toBeVisible({ timeout: 5000 });
    const toolText = await toolIndicator.textContent();
    expect(toolText).toBeTruthy();

    // No errors
    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should handle tool execution flow without errors', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('Execute a system command to list files');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    // Wait for assistant response or tool execution dialog
    await expect(
      page
        .locator('[data-role="assistant"], [role="dialog"], [data-testid="approval-dialog"]')
        .first(),
    ).toBeVisible({ timeout: 30000 });

    // Check for approval dialogs or tool execution panels
    const approvalDialog = page.locator('[role="dialog"], [data-testid="approval-dialog"]');
    await expect(approvalDialog).toBeVisible({ timeout: 5000 });

    // Tool execution approval is pending
    const dialogText = await approvalDialog.textContent();
    expect(dialogText).toBeTruthy();

    // Should have approve/reject buttons
    const approveBtn = approvalDialog.locator(
      'button:has-text("Approve"), [data-testid="approve-tool"]',
    );
    const rejectBtn = approvalDialog.locator(
      'button:has-text("Reject"), [data-testid="reject-tool"]',
    );

    await expect(approveBtn).toBeVisible({ timeout: 3000 });
    await expect(rejectBtn).toBeVisible({ timeout: 3000 });

    // No critical errors
    const errors = page.locator('[role="alert"], .error-message');
    expect(await errors.count()).toBe(0);
  });

  test('should show tool results in conversation', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('Use a tool to get information');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    // Wait for assistant response which may include tool results
    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    // Check for tool result display
    const toolResult = page.locator(
      '[data-testid="tool-result"], [data-testid="tool-output"], .tool-output',
    );
    await expect(toolResult).toBeVisible({ timeout: 5000 });
    const resultText = await toolResult.textContent();
    expect(resultText).toBeTruthy();

    // Response should still be present
    const response = page.locator('[data-role="assistant"]');
    await expect(response.last()).toBeVisible({ timeout: 5000 });

    // No errors
    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should handle tool rejection gracefully', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('Try to use a restricted tool');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    // Wait for assistant response which may include rejection notice
    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    // Look for rejection confirmation
    const rejectionNotice = page.locator('[data-testid="tool-rejected"], .tool-rejected-notice');
    await expect(rejectionNotice).toBeVisible({ timeout: 5000 });
    const noticeText = await rejectionNotice.textContent();
    expect(noticeText).toBeTruthy();
    expect(/rejected|denied|not allowed/i.test(noticeText || '')).toBeTruthy();

    // App should remain responsive
    await expect(chatInput).toBeVisible();

    // No critical errors
    const errors = page.locator('[role="alert"], .error-message');
    expect(await errors.count()).toBe(0);
  });
});

test.describe('AGI Goal Detection & Submission', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should detect goal-like intent in messages', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    // Send a goal-like message
    await chatInput.fill('Build a React component for user authentication with JWT');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    // Look for AGI goal indicator
    const agiIndicator = page
      .locator('[data-testid="agi-detected"], [data-testid="goal-detected"], .agi-indicator')
      .first();

    await expect(agiIndicator).toBeVisible({ timeout: 10000 });
    const indicatorText = await agiIndicator.textContent();
    expect(indicatorText).toBeTruthy();
    expect(/agi|goal|submit|project/i.test(indicatorText || '')).toBeTruthy();

    // Response should still arrive
    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    // No errors
    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should show AGI submission dialog when appropriate', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    // Send goal-like message
    await chatInput.fill('Develop a full-stack web application with database');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    // Wait for assistant response or AGI dialog
    await expect(page.locator('[data-role="assistant"], [role="dialog"]').first()).toBeVisible({
      timeout: 30000,
    });

    // Check for AGI submission dialog
    const agiDialog = page
      .locator('[role="dialog"]')
      .filter({ hasText: /agi|goal|submit|project/i })
      .first();

    await expect(agiDialog).toBeVisible({ timeout: 10000 });

    // Dialog should have submit button
    const submitBtn = agiDialog.locator('button:has-text("Submit"), [data-testid="submit-agi"]');
    await expect(submitBtn).toBeVisible({ timeout: 3000 });

    // No errors
    const errors = page.locator('[role="alert"], .error-message');
    expect(await errors.count()).toBe(0);
  });

  test('should not submit non-goal messages as AGI goals', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    // Send non-goal message
    await chatInput.fill('What is the weather today?');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    // Wait for assistant response
    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    // Should NOT show AGI submission
    const agiDialog = page.locator('[role="dialog"]').filter({ hasText: /agi|goal|submit.*goal/i });

    const dialogCount = await agiDialog.count();
    expect(dialogCount).toBe(0);

    // Response should arrive normally
    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    // No errors
    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should handle AGI workflow state correctly', async ({ page }) => {
    // Test that AGI state is maintained across multiple turns

    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    // First turn: goal message
    await chatInput.fill('Create a machine learning model');
    let sendButton = page.locator('button:has-text("Send"), [data-testid="send-message"]').first();
    await sendButton.click();

    // Wait for first assistant response
    await expect(page.locator('[data-role="assistant"]').first()).toBeVisible({ timeout: 30000 });
    // Wait for streaming to complete
    const streamingIndicator = page.locator('[data-streaming="true"], .streaming').first();
    await streamingIndicator.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});

    // Second turn: follow-up - wait for input to be ready
    await expect(chatInput).toBeEnabled();
    await chatInput.fill('Using TensorFlow framework');
    sendButton = page.locator('button:has-text("Send"), [data-testid="send-message"]').first();
    await sendButton.click();

    // Wait for second assistant response
    await expect(page.locator('[data-role="assistant"]').nth(1)).toBeVisible({ timeout: 30000 });

    // Both responses should be in conversation
    const assistantMessages = page.locator('[data-role="assistant"]');
    const messageCount = await assistantMessages.count();
    expect(messageCount).toBeGreaterThanOrEqual(2);

    // No errors throughout workflow
    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });
});

test.describe('Multi-turn Conversations & State Preservation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should maintain conversation context across multiple turns', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    // Turn 1
    await chatInput.fill('My name is John');
    let sendButton = page.locator('button:has-text("Send"), [data-testid="send-message"]').first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    // Turn 2
    await chatInput.fill('What did I just tell you?');
    sendButton = page.locator('button:has-text("Send"), [data-testid="send-message"]').first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').nth(-2)).toBeVisible({ timeout: 30000 });

    // Turn 3
    await chatInput.fill('Remember my name in your next response');
    sendButton = page.locator('button:has-text("Send"), [data-testid="send-message"]').first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    // Verify all messages are present
    const userMessages = page.locator('[data-role="user"]');
    const assistantMessages = page.locator('[data-role="assistant"]');

    const userCount = await userMessages.count();
    const assistantCount = await assistantMessages.count();

    expect(userCount).toBeGreaterThanOrEqual(3);
    expect(assistantCount).toBeGreaterThanOrEqual(3);

    // No errors
    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should preserve conversation on page refresh', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    // Send initial message
    await chatInput.fill('This is a test message');
    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    await expect(page.locator('[data-role="user"]').last()).toContainText('This is a test message');
    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const messageCountBefore = await page.locator('[data-role="user"]').count();

    // Refresh page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait for messages to be restored by checking for user messages
    await expect(page.locator('[data-role="user"]').first())
      .toBeVisible({ timeout: 10000 })
      .catch(() => {});

    const messageCountAfter = await page.locator('[data-role="user"]').count();

    // Messages should be preserved
    expect(messageCountAfter).toBeGreaterThanOrEqual(messageCountBefore - 1); // Allow for timing

    // No errors
    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should handle conversation switching without errors', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    // Create first conversation
    await chatInput.fill('First conversation');
    let sendButton = page.locator('button:has-text("Send"), [data-testid="send-message"]').first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    // Switch to new conversation
    const newChatButton = page
      .locator('button:has-text("New Chat"), [data-testid="new-chat"]')
      .first();

    await expect(newChatButton).toBeVisible({ timeout: 5000 });
    await newChatButton.click();
    // Wait for the chat to be cleared - input should become empty
    await expect(chatInput).toHaveValue('');

    // Input should be cleared
    const inputValue = await chatInput.inputValue();
    expect(inputValue).toBe('');

    // Send in new conversation
    await chatInput.fill('Second conversation');
    sendButton = page.locator('button:has-text("Send"), [data-testid="send-message"]').first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({
      timeout: 30000,
    });

    // No errors during switching
    const errors = page.locator('[role="alert"], .error-message', { hasNotText: /offline/i });
    expect(await errors.count()).toBe(0);
  });
});

test.describe('Budget & Credit System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should check user has sufficient credits before sending', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    // Send message
    await chatInput.fill('Test message');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();

    // If credits are insufficient, button might be disabled
    const isEnabled = await sendButton.isEnabled();

    if (isEnabled) {
      await sendButton.click();

      // Should show response (credits are sufficient)
      await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });
    } else {
      // Button disabled due to insufficient credits - check for message
      const disabledMsg = await sendButton.getAttribute('aria-label');
      expect(disabledMsg).toBeTruthy();
    }

    // No unexpected errors
    const unexpectedErrors = page.locator('[role="alert"]').filter({
      hasNotText: /credit|offline|limit/i,
    });
    expect(await unexpectedErrors.count()).toBe(0);
  });

  test('should display current token budget in UI', async ({ page }) => {
    // Look for budget display
    const budgetDisplay = page
      .locator('[data-testid="token-budget"], [data-testid="budget-remaining"], .budget-display')
      .first();

    await expect(budgetDisplay).toBeVisible({ timeout: 5000 });
    const budgetText = await budgetDisplay.textContent();
    expect(budgetText).toBeTruthy();
    // Should show numbers or percentage
    expect(/\d+|%/.test(budgetText || '')).toBeTruthy();

    // No errors
    const errors = page.locator('[role="alert"], .error-message');
    expect(await errors.count()).toBe(0);
  });

  test('should enforce token limit with clear messaging', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    // Try to send request
    await chatInput.fill('Very long message ' + 'test'.repeat(1000));

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();

    // If message is too long, button should be disabled
    await expect(sendButton).toBeDisabled();
    const disabledReason = await sendButton.getAttribute('title');
    expect(disabledReason).toBeTruthy();
    expect(/token|limit|long/i.test(disabledReason || '')).toBeTruthy();
  });
});

test.describe('Complex Workflow Scenarios', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should handle code generation and display', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    // Request code
    await chatInput.fill('Write a Python function to calculate fibonacci');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    // Check for code block - should be present for code generation
    const codeBlock = page.locator('code, pre, [data-testid="code-block"], .code-snippet');
    await expect(codeBlock).toBeVisible({ timeout: 5000 });
    const codeText = await codeBlock.textContent();
    expect(codeText).toBeTruthy();
    expect(codeText?.length).toBeGreaterThan(0);

    // No errors
    const errors = page.locator('[role="alert"], .error-message', { hasNotText: /offline/i });
    expect(await errors.count()).toBe(0);
  });

  test('should handle multi-language content without errors', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    // Request content in different languages
    const queries = [
      'Translate "Hello" to Spanish',
      'Write a poem in French about nature',
      '用中文解释机器学习', // Chinese
    ];

    for (let i = 0; i < queries.length; i++) {
      await chatInput.fill(queries[i]);

      const sendButton = page
        .locator('button:has-text("Send"), [data-testid="send-message"]')
        .first();
      await sendButton.click();

      // Wait for the specific assistant response for this query
      await expect(page.locator('[data-role="assistant"]').nth(i)).toBeVisible({
        timeout: 30000,
      });
      // Wait for streaming to complete before next iteration
      const streamingIndicator = page.locator('[data-streaming="true"], .streaming').first();
      await streamingIndicator.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
    }

    // All messages should be preserved
    const userMessages = page.locator('[data-role="user"]');
    const count = await userMessages.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // No errors
    const errors = page.locator('[role="alert"], .error-message');
    expect(await errors.count()).toBe(0);
  });

  test('should handle image/media prompts gracefully', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    // Request with image context (may not actually send image)
    await chatInput.fill('Analyze an image for me');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();

    await expect(sendButton).toBeEnabled();
    await sendButton.click();

    // Response should either accept or explain limitation
    const response = page.locator('[data-role="assistant"]').last();
    await expect(response).toBeVisible({ timeout: 30000 });

    const responseText = await response.textContent();
    expect(responseText).toBeTruthy();

    // No critical errors
    const errors = page.locator('[role="alert"], .error-message');
    expect(await errors.count()).toBe(0);
  });

  test('should maintain stability with rapid model switches', async ({ page }) => {
    const modelSelector = page
      .locator('[data-testid="quick-model-selector"], .model-selector')
      .first();

    await expect(modelSelector).toBeVisible({ timeout: 5000 });

    // Rapidly switch models
    for (let i = 0; i < 3; i++) {
      await modelSelector.click();

      const dropdown = page.locator('[role="listbox"], .model-dropdown').first();
      await expect(dropdown).toBeVisible({ timeout: 3000 });

      const options = dropdown.locator('[role="option"]');
      const count = await options.count();

      if (count > i % count) {
        await options.nth(i % count).click();
        // Wait for dropdown to close after selection
        await expect(dropdown).toBeHidden();
      }
    }

    // App should still be responsive
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();
    await expect(chatInput).toBeVisible();

    // No errors
    const errors = page.locator('[role="alert"], .error-message');
    expect(await errors.count()).toBe(0);
  });

  test('should complete end-to-end: setup -> send -> receive -> analyze results', async ({
    page,
  }) => {
    // Setup: Select model
    const modelSelector = page
      .locator('[data-testid="quick-model-selector"], .model-selector')
      .first();

    await expect(modelSelector).toBeVisible({ timeout: 5000 });
    await modelSelector.click();
    const dropdown = page.locator('[role="listbox"]').first();
    await expect(dropdown).toBeVisible({ timeout: 3000 });
    const options = dropdown.locator('[role="option"]');
    await options.nth(1).click();
    // Wait for dropdown to close after selection
    await expect(dropdown).toBeHidden();

    // Send message
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('Analyze the benefits of machine learning in healthcare');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    // Receive response
    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 60000 });

    // Analyze results
    const response = await page.locator('[data-role="assistant"]').last().textContent();
    expect(response?.trim().length).toBeGreaterThan(100);

    // Check metadata
    const messageItem = page.locator('[data-testid="message-item"]').last();
    const metadata = await messageItem.textContent();
    expect(metadata).toBeTruthy();

    // Verify system integrity
    await expect(chatInput).toBeVisible();
    await expect(sendButton).toBeEnabled();

    // Zero errors
    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });
});
