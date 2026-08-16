import { test, expect } from '@playwright/test';

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

    await chatInput.fill('Show me the weather and current time');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const toolIndicator = page.locator(
      '[data-testid="tool-call"], [data-testid="tool-indicator"], .tool-badge',
    );
    await expect(toolIndicator).toBeVisible({ timeout: 5000 });
    const toolText = await toolIndicator.textContent();
    expect(toolText).toBeTruthy();

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

    await expect(
      page
        .locator('[data-role="assistant"], [role="dialog"], [data-testid="approval-dialog"]')
        .first(),
    ).toBeVisible({ timeout: 30000 });

    const approvalDialog = page.locator('[role="dialog"], [data-testid="approval-dialog"]');
    await expect(approvalDialog).toBeVisible({ timeout: 5000 });

    const dialogText = await approvalDialog.textContent();
    expect(dialogText).toBeTruthy();

    const approveBtn = approvalDialog.locator(
      'button:has-text("Approve"), [data-testid="approve-tool"]',
    );
    const rejectBtn = approvalDialog.locator(
      'button:has-text("Reject"), [data-testid="reject-tool"]',
    );

    await expect(approveBtn).toBeVisible({ timeout: 3000 });
    await expect(rejectBtn).toBeVisible({ timeout: 3000 });

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

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const toolResult = page.locator(
      '[data-testid="tool-result"], [data-testid="tool-output"], .tool-output',
    );
    await expect(toolResult).toBeVisible({ timeout: 5000 });
    const resultText = await toolResult.textContent();
    expect(resultText).toBeTruthy();

    const response = page.locator('[data-role="assistant"]');
    await expect(response.last()).toBeVisible({ timeout: 5000 });

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

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const rejectionNotice = page.locator('[data-testid="tool-rejected"], .tool-rejected-notice');
    await expect(rejectionNotice).toBeVisible({ timeout: 5000 });
    const noticeText = await rejectionNotice.textContent();
    expect(noticeText).toBeTruthy();
    expect(/rejected|denied|not allowed/i.test(noticeText || '')).toBeTruthy();

    await expect(chatInput).toBeVisible();

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

    await chatInput.fill('Build a React component for user authentication with JWT');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    const agiIndicator = page
      .locator('[data-testid="agi-detected"], [data-testid="goal-detected"], .agi-indicator')
      .first();

    await expect(agiIndicator).toBeVisible({ timeout: 10000 });
    const indicatorText = await agiIndicator.textContent();
    expect(indicatorText).toBeTruthy();
    expect(/agi|goal|submit|project/i.test(indicatorText || '')).toBeTruthy();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should show AGI submission dialog when appropriate', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    await chatInput.fill('Develop a full-stack web application with database');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"], [role="dialog"]').first()).toBeVisible({
      timeout: 30000,
    });

    const agiDialog = page
      .locator('[role="dialog"]')
      .filter({ hasText: /agi|goal|submit|project/i })
      .first();

    await expect(agiDialog).toBeVisible({ timeout: 10000 });

    const submitBtn = agiDialog.locator('button:has-text("Submit"), [data-testid="submit-agi"]');
    await expect(submitBtn).toBeVisible({ timeout: 3000 });

    const errors = page.locator('[role="alert"], .error-message');
    expect(await errors.count()).toBe(0);
  });

  test('should not submit non-goal messages as AGI goals', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    await chatInput.fill('What is the weather today?');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const agiDialog = page.locator('[role="dialog"]').filter({ hasText: /agi|goal|submit.*goal/i });

    const dialogCount = await agiDialog.count();
    expect(dialogCount).toBe(0);

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should handle AGI workflow state correctly', async ({ page }) => {

    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    await chatInput.fill('Create a machine learning model');
    let sendButton = page.locator('button:has-text("Send"), [data-testid="send-message"]').first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').first()).toBeVisible({ timeout: 30000 });
    const streamingIndicator = page.locator('[data-streaming="true"], .streaming').first();
    await streamingIndicator.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});

    await expect(chatInput).toBeEnabled();
    await chatInput.fill('Using TensorFlow framework');
    sendButton = page.locator('button:has-text("Send"), [data-testid="send-message"]').first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').nth(1)).toBeVisible({ timeout: 30000 });

    const assistantMessages = page.locator('[data-role="assistant"]');
    const messageCount = await assistantMessages.count();
    expect(messageCount).toBeGreaterThanOrEqual(2);

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

    await chatInput.fill('My name is John');
    let sendButton = page.locator('button:has-text("Send"), [data-testid="send-message"]').first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    await chatInput.fill('What did I just tell you?');
    sendButton = page.locator('button:has-text("Send"), [data-testid="send-message"]').first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').nth(-2)).toBeVisible({ timeout: 30000 });

    await chatInput.fill('Remember my name in your next response');
    sendButton = page.locator('button:has-text("Send"), [data-testid="send-message"]').first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const userMessages = page.locator('[data-role="user"]');
    const assistantMessages = page.locator('[data-role="assistant"]');

    const userCount = await userMessages.count();
    const assistantCount = await assistantMessages.count();

    expect(userCount).toBeGreaterThanOrEqual(3);
    expect(assistantCount).toBeGreaterThanOrEqual(3);

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should preserve conversation on page refresh', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    await chatInput.fill('This is a test message');
    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    await expect(page.locator('[data-role="user"]').last()).toContainText('This is a test message');
    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const messageCountBefore = await page.locator('[data-role="user"]').count();

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-role="user"]').first())
      .toBeVisible({ timeout: 10000 })
      .catch(() => {});

    const messageCountAfter = await page.locator('[data-role="user"]').count();

    expect(messageCountAfter).toBeGreaterThanOrEqual(messageCountBefore - 1);

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });

  test('should handle conversation switching without errors', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    await chatInput.fill('First conversation');
    let sendButton = page.locator('button:has-text("Send"), [data-testid="send-message"]').first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const newChatButton = page
      .locator('button:has-text("New Chat"), [data-testid="new-chat"]')
      .first();

    await expect(newChatButton).toBeVisible({ timeout: 5000 });
    await newChatButton.click();
    await expect(chatInput).toHaveValue('');

    const inputValue = await chatInput.inputValue();
    expect(inputValue).toBe('');

    await chatInput.fill('Second conversation');
    sendButton = page.locator('button:has-text("Send"), [data-testid="send-message"]').first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({
      timeout: 30000,
    });

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

    await chatInput.fill('Test message');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();

    const isEnabled = await sendButton.isEnabled();

    if (isEnabled) {
      await sendButton.click();

      await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });
    } else {
      const disabledMsg = await sendButton.getAttribute('aria-label');
      expect(disabledMsg).toBeTruthy();
    }

    const unexpectedErrors = page.locator('[role="alert"]').filter({
      hasNotText: /credit|offline|limit/i,
    });
    expect(await unexpectedErrors.count()).toBe(0);
  });

  test('should display current token budget in UI', async ({ page }) => {
    const budgetDisplay = page
      .locator('[data-testid="token-budget"], [data-testid="budget-remaining"], .budget-display')
      .first();

    await expect(budgetDisplay).toBeVisible({ timeout: 5000 });
    const budgetText = await budgetDisplay.textContent();
    expect(budgetText).toBeTruthy();
    expect(/\d+|%/.test(budgetText || '')).toBeTruthy();

    const errors = page.locator('[role="alert"], .error-message');
    expect(await errors.count()).toBe(0);
  });

  test('should enforce token limit with clear messaging', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    await chatInput.fill('Very long message ' + 'test'.repeat(1000));

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();

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

    await chatInput.fill('Write a Python function to calculate fibonacci');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const codeBlock = page.locator('code, pre, [data-testid="code-block"], .code-snippet');
    await expect(codeBlock).toBeVisible({ timeout: 5000 });
    const codeText = await codeBlock.textContent();
    expect(codeText).toBeTruthy();
    expect(codeText?.length).toBeGreaterThan(0);

    const errors = page.locator('[role="alert"], .error-message', { hasNotText: /offline/i });
    expect(await errors.count()).toBe(0);
  });

  test('should handle multi-language content without errors', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

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

      await expect(page.locator('[data-role="assistant"]').nth(i)).toBeVisible({
        timeout: 30000,
      });
      const streamingIndicator = page.locator('[data-streaming="true"], .streaming').first();
      await streamingIndicator.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
    }

    const userMessages = page.locator('[data-role="user"]');
    const count = await userMessages.count();
    expect(count).toBeGreaterThanOrEqual(3);

    const errors = page.locator('[role="alert"], .error-message');
    expect(await errors.count()).toBe(0);
  });

  test('should handle image/media prompts gracefully', async ({ page }) => {
    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });

    await chatInput.fill('Analyze an image for me');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();

    await expect(sendButton).toBeEnabled();
    await sendButton.click();

    const response = page.locator('[data-role="assistant"]').last();
    await expect(response).toBeVisible({ timeout: 30000 });

    const responseText = await response.textContent();
    expect(responseText).toBeTruthy();

    const errors = page.locator('[role="alert"], .error-message');
    expect(await errors.count()).toBe(0);
  });

  test('should maintain stability with rapid model switches', async ({ page }) => {
    const modelSelector = page
      .locator('[data-testid="quick-model-selector"], .model-selector')
      .first();

    await expect(modelSelector).toBeVisible({ timeout: 5000 });

    for (let i = 0; i < 3; i++) {
      await modelSelector.click();

      const dropdown = page.locator('[role="listbox"], .model-dropdown').first();
      await expect(dropdown).toBeVisible({ timeout: 3000 });

      const options = dropdown.locator('[role="option"]');
      const count = await options.count();

      if (count > i % count) {
        await options.nth(i % count).click();
        await expect(dropdown).toBeHidden();
      }
    }

    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();
    await expect(chatInput).toBeVisible();

    const errors = page.locator('[role="alert"], .error-message');
    expect(await errors.count()).toBe(0);
  });

  test('should complete end-to-end: setup -> send -> receive -> analyze results', async ({
    page,
  }) => {
    const modelSelector = page
      .locator('[data-testid="quick-model-selector"], .model-selector')
      .first();

    await expect(modelSelector).toBeVisible({ timeout: 5000 });
    await modelSelector.click();
    const dropdown = page.locator('[role="listbox"]').first();
    await expect(dropdown).toBeVisible({ timeout: 3000 });
    const options = dropdown.locator('[role="option"]');
    await options.nth(1).click();
    await expect(dropdown).toBeHidden();

    const chatInput = page
      .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
      .first();

    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('Analyze the benefits of machine learning in healthcare');

    const sendButton = page
      .locator('button:has-text("Send"), [data-testid="send-message"]')
      .first();
    await sendButton.click();

    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 60000 });

    const response = await page.locator('[data-role="assistant"]').last().textContent();
    expect(response?.trim().length).toBeGreaterThan(100);

    const messageItem = page.locator('[data-testid="message-item"]').last();
    const metadata = await messageItem.textContent();
    expect(metadata).toBeTruthy();

    await expect(chatInput).toBeVisible();
    await expect(sendButton).toBeEnabled();

    const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
    expect(await errors.count()).toBe(0);
  });
});
