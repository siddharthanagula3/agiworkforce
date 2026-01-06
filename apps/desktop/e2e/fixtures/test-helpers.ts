import { Page, expect } from '@playwright/test';

/**
 * TEST HELPERS & UTILITIES
 *
 * Common utilities for E2E tests:
 * - Chat interactions
 * - Model selection
 * - Error checking
 * - Wait conditions
 * - Assertions
 */

// ============================================
// CHAT INTERACTION HELPERS
// ============================================

export async function sendChatMessage(page: Page, message: string, timeout = 30000) {
  const chatInput = page
    .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
    .first();

  if (!(await chatInput.isVisible({ timeout: 5000 }).catch(() => false))) {
    throw new Error('Chat input not visible');
  }

  await chatInput.fill(message);
  await expect(chatInput).toHaveValue(message);

  const sendButton = page.locator('button:has-text("Send"), [data-testid="send-message"]').first();

  if (!(await sendButton.isEnabled())) {
    throw new Error('Send button is not enabled');
  }

  await sendButton.click();

  // Verify user message appears
  await expect(page.locator('[data-role="user"]').last()).toContainText(message.substring(0, 20));

  // Wait for assistant response
  await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout });

  return page.locator('[data-role="assistant"]').last();
}

export async function getLastAssistantMessage(page: Page): Promise<string> {
  const message = page.locator('[data-role="assistant"]').last();
  const text = await message.textContent();
  return text || '';
}

export async function getLastUserMessage(page: Page): Promise<string> {
  const message = page.locator('[data-role="user"]').last();
  const text = await message.textContent();
  return text || '';
}

export async function getConversationLength(page: Page): Promise<number> {
  const userMessages = page.locator('[data-role="user"]');
  return await userMessages.count();
}

export async function clearChat(page: Page) {
  const newChatButton = page
    .locator('button:has-text("New Chat"), [data-testid="new-chat"]')
    .first();

  if (await newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await newChatButton.click();
    await page.waitForTimeout(500);
  }
}

// ============================================
// MODEL SELECTION HELPERS
// ============================================

export async function selectModel(page: Page, modelName: string) {
  const modelSelector = page
    .locator('[data-testid="quick-model-selector"], .model-selector')
    .first();

  if (!(await modelSelector.isVisible({ timeout: 2000 }).catch(() => false))) {
    throw new Error('Model selector not visible');
  }

  await modelSelector.click();

  const dropdown = page.locator('[role="listbox"], .model-dropdown').first();
  if (!(await dropdown.isVisible({ timeout: 2000 }).catch(() => false))) {
    throw new Error('Model dropdown not visible');
  }

  const option = dropdown.locator('[role="option"]').filter({ hasText: modelName }).first();
  if (!(await option.isVisible({ timeout: 1000 }).catch(() => false))) {
    throw new Error(`Model "${modelName}" not found in dropdown`);
  }

  await option.click();
  await page.waitForTimeout(500);

  return true;
}

export async function getSelectedModel(page: Page): Promise<string> {
  const modelSelector = page
    .locator('[data-testid="quick-model-selector"], .model-selector')
    .first();

  const text = await modelSelector.textContent();
  return text || 'unknown';
}

export async function isAutoModeEnabled(page: Page): Promise<boolean> {
  const selectedModel = await getSelectedModel(page);
  return /auto|routing|smart/i.test(selectedModel);
}

export async function toggleThinkingMode(page: Page, enable?: boolean) {
  const thinkingToggle = page
    .locator('[data-testid="thinking-mode-toggle"], button:has-text("🧠")')
    .first();

  if (!(await thinkingToggle.isVisible({ timeout: 2000 }).catch(() => false))) {
    return null; // Thinking mode not available
  }

  const currentState = await thinkingToggle.getAttribute('aria-pressed');
  const isEnabled = currentState === 'true';

  if (enable !== undefined && enable !== isEnabled) {
    await thinkingToggle.click();
    await page.waitForTimeout(500);
  }

  return (await thinkingToggle.getAttribute('aria-pressed')) === 'true';
}

export async function setConversationMode(page: Page, mode: 'safe' | 'full-control') {
  const modeSelector = page.locator('[data-testid="conversation-mode"]').first();

  if (!(await modeSelector.isVisible({ timeout: 2000 }).catch(() => false))) {
    return null; // Mode selector not available
  }

  await modeSelector.click();

  const option = page
    .locator('[role="option"]')
    .filter({
      hasText: mode === 'safe' ? /safe/i : /full|control/i,
    })
    .first();

  if (await option.isVisible({ timeout: 1000 }).catch(() => false)) {
    await option.click();
    await page.waitForTimeout(500);
    return true;
  }

  return false;
}

// ============================================
// ERROR DETECTION & VALIDATION
// ============================================

export async function hasErrors(page: Page, filterWarnings = true): Promise<boolean> {
  let errorLocator = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');

  if (filterWarnings) {
    errorLocator = errorLocator.filter({
      hasNotText: /warning|info|offline|deprecated/i,
    });
  }

  const count = await errorLocator.count();
  return count > 0;
}

export async function getErrorMessage(page: Page): Promise<string | null> {
  const errorLocator = page
    .locator('[role="alert"], .error-message, [data-testid="error-message"]')
    .first();

  if (await errorLocator.isVisible({ timeout: 1000 }).catch(() => false)) {
    return await errorLocator.textContent();
  }

  return null;
}

export async function assertNoErrors(page: Page) {
  const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
  const count = await errors.count();
  expect(count).toBe(0);
}

export async function dismissErrors(page: Page) {
  const closeButtons = page.locator(
    '[role="alert"] button[aria-label*="close"], .error-message button',
  );
  let count = await closeButtons.count();

  while (count > 0) {
    await closeButtons.first().click();
    await page.waitForTimeout(200);
    count = await closeButtons.count();
  }
}

// ============================================
// TOKEN & COST CHECKING
// ============================================

export async function getTokenCount(page: Page): Promise<number | null> {
  const tokenCounter = page.locator('[data-testid="token-counter"], .token-counter').first();

  if (!(await tokenCounter.isVisible({ timeout: 1000 }).catch(() => false))) {
    return null;
  }

  const text = await tokenCounter.textContent();
  const match = text?.match(/(\d+(?:,\d+)?)/);
  return match ? parseInt(match[1].replace(/,/g, '')) : null;
}

export async function getCostDisplay(page: Page): Promise<string | null> {
  const costDisplay = page
    .locator('[data-testid="message-cost"], .message-cost, [data-testid="cost-badge"]')
    .first();

  if (!(await costDisplay.isVisible({ timeout: 1000 }).catch(() => false))) {
    return null;
  }

  return await costDisplay.textContent();
}

export async function getBudgetRemaining(page: Page): Promise<number | null> {
  const budgetDisplay = page.locator('[data-testid="token-budget"], .budget-display').first();

  if (!(await budgetDisplay.isVisible({ timeout: 1000 }).catch(() => false))) {
    return null;
  }

  const text = await budgetDisplay.textContent();
  const match = text?.match(/(\d+(?:,\d+)?)/);
  return match ? parseInt(match[1].replace(/,/g, '')) : null;
}

// ============================================
// WAIT & POLLING HELPERS
// ============================================

export async function waitForResponseStreaming(page: Page, timeout = 30000) {
  const streamingIndicator = page.locator('[data-streaming="true"], .streaming').first();
  const maxWait = Date.now() + timeout;

  while (Date.now() < maxWait) {
    if (await streamingIndicator.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(streamingIndicator).toBeHidden({ timeout: timeout });
      return true;
    }
    await page.waitForTimeout(100);
  }

  return false;
}

export async function waitForCondition(
  page: Page,
  condition: () => Promise<boolean>,
  timeout = 5000,
  interval = 100,
): Promise<boolean> {
  const maxWait = Date.now() + timeout;

  while (Date.now() < maxWait) {
    if (await condition()) {
      return true;
    }
    await page.waitForTimeout(interval);
  }

  return false;
}

export async function waitForNewMessage(page: Page, previousCount: number, timeout = 30000) {
  return await waitForCondition(
    page,
    async () => {
      const currentCount = await page.locator('[data-role="assistant"]').count();
      return currentCount > previousCount;
    },
    timeout,
  );
}

// ============================================
// NAVIGATION & SETUP
// ============================================

export async function navigateToChat(page: Page, url = 'http://localhost:3000') {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

export async function createNewConversation(page: Page) {
  const newChatButton = page
    .locator('button:has-text("New Chat"), [data-testid="new-chat"]')
    .first();

  if (await newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await newChatButton.click();
    await page.waitForTimeout(500);
    return true;
  }

  return false;
}

export async function getConversationList(page: Page): Promise<string[]> {
  const conversations = page.locator('[data-testid="conversation-item"]');
  const count = await conversations.count();
  const list: string[] = [];

  for (let i = 0; i < count; i++) {
    const text = await conversations.nth(i).textContent();
    if (text) list.push(text);
  }

  return list;
}

// ============================================
// VALIDATION HELPERS
// ============================================

export async function validateResponseContent(page: Page, minLength = 10): Promise<boolean> {
  const response = await getLastAssistantMessage(page);
  return response.trim().length >= minLength;
}

export async function validateMessageFormat(page: Page, hasTimestamp = true, hasModel = false) {
  const message = page.locator('[data-testid="message-item"]').last();

  if (!(await message.isVisible({ timeout: 1000 }).catch(() => false))) {
    return false;
  }

  const content = await message.textContent();

  if (hasTimestamp) {
    // Check for time patterns (HH:MM, etc.)
    if (!/\d{1,2}:\d{2}|ago/.test(content || '')) {
      return false;
    }
  }

  if (hasModel) {
    // Check for model indication
    if (!/gpt|claude|gemini|model/i.test(content || '')) {
      return false;
    }
  }

  return true;
}

export async function validateInputCleared(page: Page): Promise<boolean> {
  const chatInput = page
    .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
    .first();

  const value = await chatInput.inputValue();
  return value === '';
}

// ============================================
// TOOL & AGI HELPERS
// ============================================

export async function detectAGIGoal(page: Page, timeout = 5000): Promise<boolean> {
  const agiIndicator = page
    .locator('[data-testid="agi-detected"], [data-testid="goal-detected"], .agi-indicator')
    .first();

  return await agiIndicator.isVisible({ timeout }).catch(() => false);
}

export async function detectToolExecution(page: Page, timeout = 3000): Promise<boolean> {
  const toolCall = page
    .locator('[data-testid="tool-call"], [data-testid="tool-indicator"], .tool-badge')
    .first();
  return await toolCall.isVisible({ timeout }).catch(() => false);
}

export async function getToolResults(page: Page): Promise<string | null> {
  const toolResult = page
    .locator('[data-testid="tool-result"], [data-testid="tool-output"], .tool-output')
    .first();

  if (await toolResult.isVisible({ timeout: 1000 }).catch(() => false)) {
    return await toolResult.textContent();
  }

  return null;
}

export async function approveToolExecution(page: Page): Promise<boolean> {
  const approveBtn = page
    .locator('button:has-text("Approve"), [data-testid="approve-tool"]')
    .first();

  if (await approveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await approveBtn.click();
    return true;
  }

  return false;
}

export async function rejectToolExecution(page: Page): Promise<boolean> {
  const rejectBtn = page.locator('button:has-text("Reject"), [data-testid="reject-tool"]').first();

  if (await rejectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await rejectBtn.click();
    return true;
  }

  return false;
}

// ============================================
// SCREENSHOT & DEBUGGING
// ============================================

export async function takeDebugScreenshot(page: Page, name: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `debug-${name}-${timestamp}.png`;
  await page.screenshot({ path: `test-results/${filename}`, fullPage: true });
  return filename;
}

export async function logPageState(page: Page) {
  const state = {
    url: page.url(),
    title: await page.title(),
    messages: await page.locator('[data-role="user"], [data-role="assistant"]').count(),
    errors: await page.locator('[role="alert"], .error-message').count(),
    isInputVisible: await page
      .locator('[data-testid="chat-input"]')
      .isVisible()
      .catch(() => false),
  };

  console.log('Page State:', JSON.stringify(state, null, 2));
  return state;
}

// ============================================
// PERFORMANCE HELPERS
// ============================================

export async function measureResponseTime(page: Page, message: string): Promise<number> {
  const startTime = Date.now();

  await sendChatMessage(page, message);

  const endTime = Date.now();
  return endTime - startTime;
}

export async function measureStreamingTime(page: Page, message: string): Promise<number> {
  const startTime = Date.now();

  const chatInput = page
    .locator('textarea[placeholder*="message"], [data-testid="chat-input"]')
    .first();

  await chatInput.fill(message);

  const sendButton = page.locator('button:has-text("Send"), [data-testid="send-message"]').first();

  await sendButton.click();

  // Wait for streaming to complete
  await waitForResponseStreaming(page);

  const endTime = Date.now();
  return endTime - startTime;
}

// ============================================
// BATCH OPERATIONS
// ============================================

export async function sendMultipleMessages(
  page: Page,
  messages: string[],
  delayMs = 500,
): Promise<number[]> {
  const times: number[] = [];

  for (const message of messages) {
    const time = await measureResponseTime(page, message);
    times.push(time);
    await page.waitForTimeout(delayMs);
  }

  return times;
}

export async function testMultipleModels(
  page: Page,
  modelNames: string[],
  testMessage: string,
): Promise<{ model: string; success: boolean; duration: number }[]> {
  const results: { model: string; success: boolean; duration: number }[] = [];

  for (const model of modelNames) {
    try {
      await selectModel(page, model);
      const startTime = Date.now();

      await sendChatMessage(page, testMessage);

      const duration = Date.now() - startTime;
      const hasErrors = await hasErrors(page);

      results.push({
        model,
        success: !hasErrors,
        duration,
      });

      await clearChat(page);
    } catch (error) {
      results.push({
        model,
        success: false,
        duration: 0,
      });
    }
  }

  return results;
}

export default {
  sendChatMessage,
  getLastAssistantMessage,
  getLastUserMessage,
  selectModel,
  toggleThinkingMode,
  setConversationMode,
  hasErrors,
  assertNoErrors,
  getTokenCount,
  waitForResponseStreaming,
  navigateToChat,
  createNewConversation,
  validateResponseContent,
  detectAGIGoal,
  detectToolExecution,
  approveToolExecution,
  measureResponseTime,
  sendMultipleMessages,
  testMultipleModels,
};
