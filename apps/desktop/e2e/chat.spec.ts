import { test, expect } from '@playwright/test';
import modelsCatalogJson from '@agiworkforce/types/models.json' with { type: 'json' };
import { injectMockCloudAuth } from './utils/mock-cloud-auth';
import { expectCloudShellReady, mockCloudApi } from './utils/mock-cloud-api';

interface CatalogFixtureModel {
  name: string;
  provider: string;
  modelType: string;
  status?: string;
  availability?: string;
}

/**
 * The managed models `GET /api/models` must report for this suite to be able to
 * chat at all.
 *
 * `mockCloudApi` defaults to `models: []`, and its own comment says that empty
 * "deliberately makes the managed picker unavailable" — a useful default for
 * suites asserting the degraded path, and exactly wrong here. With no models,
 * `resolveDesktopCloudPickerModels` returns [], App.tsx throws "No managed
 * models are available for this account and Desktop", the shell renders "The
 * managed model catalog is unavailable", `selectedModelId` stays '', and the
 * composer's Send button is disabled forever. Every test that types a message
 * then failed on a disabled button, which reads as a broken composer rather
 * than an unseeded fixture.
 *
 * Derived from the catalog rather than written as literals: concrete model ids
 * belong only to the registry (AGENTS.md), and a hardcoded id here would rot
 * silently the next time the economy tier moves. The economy tier is the one
 * every plan is entitled to, so this seeds a picker for any seeded plan.
 */
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

/**
 * Chat workflow E2E.
 *
 * WHY THE SESSION IS SEEDED, and why this suite proved nothing before it was.
 * The previous revision did `page.goto('/')` and nothing else, then guarded all
 * 13 tests with `test.skip(!(await control.isVisible()))`. This project runs the
 * plain-browser web-target bundle, so `supportsLocalAppMode` is false, the app
 * boots in Cloud mode, and `App.tsx` renders `<AuthPage />` until a cloud session
 * exists — the same trick `v3-smoke.spec.ts` and `gdpr.spec.ts` document.
 *
 * So every control these tests look for was behind a login screen, every
 * `isVisible()` was false, and all 13 skipped. Playwright reports a skip exactly
 * like a pass, so the suite was green in CI while asserting nothing at all: the
 * failure it existed to catch — chat is unreachable — was the state that made it
 * green.
 *
 * The skips are gone rather than made conditional on something better. A control
 * this suite needs and cannot find is a failure, and it should say so.
 */
test.describe('Chat Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockCloudAuth(page);
    await mockCloudApi(page, { models: SEEDED_MODELS });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expectCloudShellReady(page);
  });

  test('should create a new conversation', async ({ page }) => {
    const newChatButton = page.getByRole('button', { name: /new chat/i });
    await expect(newChatButton, 'New chat button not available').toBeVisible();

    await newChatButton.click();
    await expect(page.getByTestId('conversation-list').locator('li').first()).toBeVisible();
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
    const conversationsList = page.getByTestId('conversation-list');
    await expect(conversationsList, 'Conversation list not available').toBeVisible();

    await expect(conversationsList).toBeVisible();
  });

  test('should pin/unpin conversations', async ({ page }) => {
    const conversationItem = page.getByTestId('conversation-item').first();
    await expect(conversationItem, 'No conversation items available').toBeVisible();

    const pinButton = conversationItem.getByRole('button', { name: /pin/i });
    await expect(pinButton, 'Pin button not present').toBeVisible();

    await pinButton.click();
    await expect(pinButton).toHaveAttribute('aria-label', /Unpin/i);
  });

  test('should delete a conversation', async ({ page }) => {
    const conversationItem = page.getByTestId('conversation-item').first();
    await expect(conversationItem, 'No conversation items available').toBeVisible();

    const initialCount = await page.getByTestId('conversation-item').count();
    const deleteButton = conversationItem.getByRole('button', { name: /delete/i });
    await expect(deleteButton, 'Delete button not present').toBeVisible();

    await deleteButton.click();

    const confirmButton = page.getByRole('button', { name: /delete|confirm/i });
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
    }

    const newCount = await page.getByTestId('conversation-item').count();
    expect(newCount).toBeLessThan(initialCount);
  });

  test('should search conversations', async ({ page }) => {
    const searchInput = page.getByRole('searchbox', { name: /search/i });
    await expect(searchInput, 'Search input not available').toBeVisible();

    await searchInput.fill('test');
    await page.waitForTimeout(500);

    // Search renders a filtered list — the list itself should be visible
    await expect(page.getByTestId('conversation-list')).toBeVisible();
  });

  test('should display streaming response', async ({ page }) => {
    const chatInput = page.getByRole('textbox', { name: /message/i });
    await expect(chatInput, 'Chat input not available').toBeVisible();

    await chatInput.fill('Tell me a long story');
    const sendButton = page.getByRole('button', { name: /send/i });
    await sendButton.click();

    const streamingIndicator = page.locator('[data-streaming="true"]').first();
    await expect(streamingIndicator).toBeVisible({ timeout: 5000 });
    await expect(streamingIndicator).not.toBeVisible({ timeout: 30000 });
  });

  test('should edit a message', async ({ page }) => {
    const messageItem = page.getByTestId('message-item').last();
    await expect(messageItem, 'No messages available to edit').toBeVisible();

    await messageItem.hover();
    const editButton = messageItem.getByRole('button', { name: /edit/i });
    await expect(editButton, 'Edit button not present').toBeVisible();

    await editButton.click();

    const editInput = page.locator('textarea[data-editing="true"]').first();
    await editInput.clear();
    await editInput.fill('Edited message content');

    const saveButton = page.getByRole('button', { name: /save/i });
    await saveButton.click();

    await expect(messageItem).toContainText('Edited message content');
  });

  test('should display message statistics', async ({ page }) => {
    const statsButton = page.getByRole('button', { name: /stats/i });
    await expect(statsButton, 'Stats button not available').toBeVisible();

    await statsButton.click();

    const statsPanel = page.getByTestId('stats-panel');
    await expect(statsPanel).toBeVisible();
    await expect(statsPanel).toContainText(/tokens|cost/i);
  });

  test('should handle offline state gracefully', async ({ page, context }) => {
    const chatInput = page.getByRole('textbox', { name: /message/i });
    await expect(chatInput, 'Chat input not available').toBeVisible();

    await context.setOffline(true);
    await chatInput.fill('This should fail');

    const sendButton = page.getByRole('button', { name: /send/i });
    await sendButton.click();

    const errorMessage = page.getByRole('alert');
    await expect(errorMessage).toBeVisible({ timeout: 10000 });

    await context.setOffline(false);
  });

  test('should complete entire flow: send query and receive answer without errors', async ({
    page,
  }) => {
    test.setTimeout(60000);

    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    const chatInput = page.getByRole('textbox', { name: /message/i });

    // Try revealing the input via the new-chat button if it isn't visible yet
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

    // Wait for streaming to finish if the indicator appears
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
    // Same seeded session as the suite above, and for the same reason: this
    // block used to `goto('/')` and nothing else, so the app rendered
    // <AuthPage /> and every control these two tests look for was behind a
    // login screen. Seeding auth and the model catalog is what puts a composer
    // on the page at all.
    await injectMockCloudAuth(page);
    await mockCloudApi(page, { models: SEEDED_MODELS });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expectCloudShellReady(page);
  });

  test('should detect and submit goal-like messages', async ({ page }) => {
    const chatInput = page.getByRole('textbox', { name: /message/i });
    await expect(chatInput, 'Chat input not available').toBeVisible();

    await chatInput.fill('Create a React component for user authentication');
    const sendButton = page.getByRole('button', { name: /send/i });
    await sendButton.click();

    // The skip that used to sit here was followed by an assertion of the exact
    // predicate it skipped on — visible, or skip; then assert visible. That
    // assertion could never fail. `gdpr.spec.ts` carried six of the same shape.
    const agiIndicator = page.getByTestId('agi-submitted');
    await expect(agiIndicator, 'AGI submission indicator not rendered').toBeVisible({
      timeout: 3000,
    });
  });

  test('should not submit non-goal messages to AGI', async ({ page }) => {
    const chatInput = page.getByRole('textbox', { name: /message/i });
    await expect(chatInput, 'Chat input not available').toBeVisible();

    await chatInput.fill('Hello');
    const sendButton = page.getByRole('button', { name: /send/i });
    await sendButton.click();

    const agiIndicator = page.getByTestId('agi-submitted');
    await expect(agiIndicator).not.toBeVisible({ timeout: 3000 });
  });
});
