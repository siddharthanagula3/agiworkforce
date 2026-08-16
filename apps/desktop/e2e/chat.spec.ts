import { test, expect, type Page } from '@playwright/test';
import modelsCatalogJson from '@agiworkforce/types/models.json' with { type: 'json' };
import { injectMockCloudAuth } from './utils/mock-cloud-auth';
import {
  cloudConversationFixture,
  expectCloudShellReady,
  mockCloudApi,
} from './utils/mock-cloud-api';

interface CatalogFixtureModel {
  name: string;
  provider: string;
  modelType: string;
  status?: string;
  availability?: string;
}

const DESKTOP_CHAT_MODEL_TYPES = new Set(['chat', 'code', 'reasoning', 'multimodal', 'search']);

function resolveEconomyChatModels(): Array<{ id: string; name: string; provider: string }> {
  const catalog = modelsCatalogJson as unknown as {
    models: Record<string, CatalogFixtureModel>;
    tierAllowedModels: Record<string, string[]>;
  };
  const economyIds = catalog.tierAllowedModels['economy'] ?? [];
  const seeded = economyIds.flatMap((id) => {
    const model = catalog.models[id];
    if (!model) return [];
    if (!DESKTOP_CHAT_MODEL_TYPES.has(model.modelType)) return [];
    if (model.status === 'deprecated') return [];
    if ((model.availability ?? 'live') !== 'live') return [];
    return [{ id, name: model.name, provider: model.provider }];
  });

  if (seeded.length === 0) {
    throw new Error('The economy tier has no live chat-capable model to seed the picker with.');
  }
  return seeded;
}

const SEEDED_MODELS = resolveEconomyChatModels();

const ALPHA_TITLE = 'Alpha seeded conversation';
const BETA_TITLE = 'Beta seeded conversation';

const SEEDED_CONVERSATIONS = [
  cloudConversationFixture({ id: 'conv-alpha', title: ALPHA_TITLE }),
  cloudConversationFixture({ id: 'conv-beta', title: BETA_TITLE }),
];

function conversationRow(page: Page, title: string) {
  return page.getByTestId('conversation-row').filter({ hasText: title }).first();
}

async function openRowMenu(row: ReturnType<typeof conversationRow>): Promise<void> {
  await row.hover();
  await row.locator('button').last().click();
}

test.describe('Chat Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockCloudAuth(page);
    await mockCloudApi(page, { models: SEEDED_MODELS, conversations: SEEDED_CONVERSATIONS });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expectCloudShellReady(page);
  });

  test('should create a new conversation', async ({ page }) => {
    const rows = page.getByTestId('conversation-row');
    await expect(rows.filter({ hasText: ALPHA_TITLE })).toHaveCount(1);
    const before = await rows.count();

    const newChatButton = page.getByRole('button', { name: /new chat/i }).first();
    await expect(newChatButton, 'New chat button not available').toBeVisible();
    await newChatButton.click();

    await expect(rows).toHaveCount(before + 1);
    await expect(page.getByRole('textbox', { name: /message/i })).toBeVisible();
  });

  test('should send a message and receive response', async ({ page }) => {
    const chatInput = page.getByRole('textbox', { name: /message/i });
    await expect(chatInput, 'Chat input not available').toBeVisible();

    await chatInput.fill('Hello, how are you?');
    const sendButton = page.getByRole('button', { name: /send/i });
    await sendButton.click();

    await expect(page.locator('[data-role="user"]').last()).toContainText('Hello');
    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });
  });

  test('should display conversation history', async ({ page }) => {
    const rows = page.getByTestId('conversation-row');
    await expect(rows.filter({ hasText: ALPHA_TITLE }), 'Seeded conversation missing').toHaveCount(
      1,
    );
    await expect(rows.filter({ hasText: BETA_TITLE })).toHaveCount(1);
  });

  test('should pin/unpin conversations', async ({ page }) => {
    const row = conversationRow(page, ALPHA_TITLE);
    await expect(row, 'No conversation rows available').toBeVisible();

    await openRowMenu(row);
    await expect(page.getByRole('menuitem', { name: /^pin$/i })).toBeVisible();
    await page.getByRole('menuitem', { name: /^pin$/i }).click();

    await openRowMenu(row);
    await expect(page.getByRole('menuitem', { name: /^unpin$/i })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('should delete a conversation', async ({ page }) => {
    const rows = page.getByTestId('conversation-row');
    const before = await rows.count();
    const row = conversationRow(page, ALPHA_TITLE);
    await expect(row, 'No conversation rows available').toBeVisible();

    await openRowMenu(row);
    await page.getByRole('menuitem', { name: /^delete$/i }).click();
    await page.getByRole('menuitem', { name: /^confirm delete$/i }).click();

    await expect(rows.filter({ hasText: ALPHA_TITLE })).toHaveCount(0);
    await expect(rows).toHaveCount(before - 1);
  });

  test('should search conversations', async ({ page }) => {
    await page
      .getByRole('button', { name: /search/i })
      .first()
      .click();

    const panel = page.getByTestId('search-modal-panel');
    await expect(panel, 'Search panel did not open').toBeVisible();

    await panel.locator('input').first().fill('Alpha');
    await expect(panel).toContainText(ALPHA_TITLE);
    await page.keyboard.press('Escape');
  });

  test('should display streaming response', async ({ page }) => {
    const chatInput = page.getByRole('textbox', { name: /message/i });
    await expect(chatInput, 'Chat input not available').toBeVisible();

    await chatInput.fill('Tell me a long story');
    await page.getByRole('button', { name: /send/i }).click();

    const stopButton = page.getByRole('button', { name: /stop/i });
    await expect(stopButton).toBeVisible({ timeout: 5000 });
    await expect(stopButton).toBeHidden({ timeout: 30000 });
  });

  test('should edit a message', async ({ page }) => {
    const messageItem = page.locator('[data-testid="message-item"][data-role="user"]').last();
    await expect(messageItem, 'No user message available to edit').toBeVisible();

    await messageItem.hover();
    const editButton = messageItem.getByRole('button', { name: /edit message/i });
    await expect(editButton, 'Edit button not present').toBeVisible();

    await editButton.click();

    const editInput = page.locator('textarea[data-editing="true"]').first();
    await editInput.clear();
    await editInput.fill('Edited message content');

    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(
      page.locator('[data-testid="message-item"][data-role="user"]').last(),
    ).toContainText('Edited message content');
  });

  test('should display message statistics', async ({ page }) => {
    const chatInput = page.getByRole('textbox', { name: /message/i });
    await chatInput.fill('How many tokens does this cost?');
    await page.getByRole('button', { name: /send/i }).click();
    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 30000 });

    const statsButton = page.getByRole('button', { name: /stats/i });
    await expect(statsButton, 'Stats button not available').toBeVisible();

    await statsButton.click();

    const statsPanel = page.getByTestId('stats-panel');
    await expect(statsPanel).toBeVisible();
    await expect(statsPanel).toContainText(/tokens|cost/i);
    await expect(statsPanel).toContainText('128');
    await expect(statsPanel).toContainText('64');
  });

  test('should handle offline state gracefully', async ({ page }) => {
    const chatInput = page.getByRole('textbox', { name: /message/i });
    await expect(chatInput, 'Chat input not available').toBeVisible();

    await page.route('**/api/llm/v1/chat/completions', (route) =>
      route.abort('internetdisconnected'),
    );

    await chatInput.fill('This should fail');
    await page.getByRole('button', { name: /send/i }).click();

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 });
  });

  test('should complete entire flow: send query and receive answer without errors', async ({
    page,
  }) => {
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    const chatInput = page.getByRole('textbox', { name: /message/i });

    if (!(await chatInput.isVisible({ timeout: 5000 }).catch(() => false))) {
      const newChatButton = page.getByRole('button', { name: /new chat|new/i });
      if (await newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await newChatButton.click();
        await page.waitForTimeout(1000);
      }
    }

    await expect(chatInput, 'Chat input not available').toBeVisible({ timeout: 5000 });

    const testQuery = 'What is the capital of France?';
    await chatInput.fill(testQuery);
    expect(await chatInput.inputValue()).toBe(testQuery);

    const sendButton = page.getByRole('button', { name: /send/i });
    await expect(sendButton, 'Send button not available').toBeVisible({ timeout: 2000 });

    await sendButton.click();

    const userMessage = page.locator('[data-role="user"]').last();
    await expect(userMessage).toContainText(testQuery, { timeout: 10000 });

    const streamingIndicator = page.locator('[data-streaming="true"]').first();
    if (await streamingIndicator.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(streamingIndicator).toBeHidden({ timeout: 30000 });
    }

    const assistantMessage = page.locator('[data-role="assistant"]').last();
    await expect(assistantMessage).toBeVisible({ timeout: 30000 });

    const responseText = await assistantMessage.textContent();
    expect(responseText?.trim().length).toBeGreaterThan(0);

    const errorCount = await page.getByRole('alert').count();
    expect(errorCount).toBe(0);
  });
});

test.describe('Chat AGI Integration', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockCloudAuth(page);
    await mockCloudApi(page, { models: SEEDED_MODELS });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expectCloudShellReady(page);
  });

  test.fixme('should detect and submit goal-like messages', async ({ page }) => {
    const chatInput = page.getByRole('textbox', { name: /message/i });
    await expect(chatInput, 'Chat input not available').toBeVisible();

    await chatInput.fill('Create a React component for user authentication');
    const sendButton = page.getByRole('button', { name: /send/i });
    await sendButton.click();

    const agiIndicator = page.getByTestId('agi-submitted');
    await expect(agiIndicator, 'AGI submission indicator not rendered').toBeVisible({
      timeout: 3000,
    });
  });

  test.fixme('should not submit non-goal messages to AGI', async ({ page }) => {
    const chatInput = page.getByRole('textbox', { name: /message/i });
    await expect(chatInput, 'Chat input not available').toBeVisible();

    await chatInput.fill('Hello');
    const sendButton = page.getByRole('button', { name: /send/i });
    await sendButton.click();

    const agiIndicator = page.getByTestId('agi-submitted');
    await expect(agiIndicator).not.toBeVisible({ timeout: 3000 });
  });
});
