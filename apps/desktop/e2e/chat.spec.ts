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

const ALPHA_TITLE = 'Alpha seeded conversation';
const BETA_TITLE = 'Beta seeded conversation';

/**
 * Conversations the sidebar tests act on.
 *
 * `mockCloudApi` defaults to none, so the sidebar rendered only its own "New
 * chat" row and every conversation assertion had nothing to find.
 */
const SEEDED_CONVERSATIONS = [
  cloudConversationFixture({ id: 'conv-alpha', title: ALPHA_TITLE }),
  cloudConversationFixture({ id: 'conv-beta', title: BETA_TITLE }),
];

/** A sidebar conversation row by its title. */
function conversationRow(page: Page, title: string) {
  return page.getByTestId('conversation-row').filter({ hasText: title }).first();
}

/**
 * Open a row's action menu. Pin, Rename, Archive and Delete live behind the
 * row's "More options" overflow button — they are not direct buttons on the
 * row, which is what the previous revision of these tests assumed.
 */
async function openRowMenu(row: ReturnType<typeof conversationRow>): Promise<void> {
  await row.hover();
  await row.locator('button').last().click();
}

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

    // The same entry has to flip, or "pinned" was never recorded.
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
    // Deleting is a two-click confirm inside the menu itself, not a separate
    // dialog: the first click flips the same entry to "Confirm delete" and only
    // the second one calls onDelete (ConversationRow.tsx). The previous
    // revision clicked once and then looked for a confirm *button* that never
    // renders, so it asserted a deletion that had not been requested.
    await page.getByRole('menuitem', { name: /^delete$/i }).click();
    await page.getByRole('menuitem', { name: /^confirm delete$/i }).click();

    await expect(rows.filter({ hasText: ALPHA_TITLE })).toHaveCount(0);
    await expect(rows).toHaveCount(before - 1);
  });

  test('should search conversations', async ({ page }) => {
    // Search is a command-palette style modal opened from the sidebar, not an
    // inline searchbox — there is no element with role=searchbox on this shell.
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

    // The composer's send control is a three-state button: it becomes Stop for
    // exactly the duration of the stream. There is no `data-streaming`
    // attribute anywhere in the source — the Stop affordance IS the rendered
    // streaming state, so assert on it rather than on a marker that never
    // existed.
    const stopButton = page.getByRole('button', { name: /stop/i });
    await expect(stopButton).toBeVisible({ timeout: 5000 });
    await expect(stopButton).toBeHidden({ timeout: 30000 });
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

  test('should handle offline state gracefully', async ({ page }) => {
    const chatInput = page.getByRole('textbox', { name: /message/i });
    await expect(chatInput, 'Chat input not available').toBeVisible();

    // `context.setOffline(true)` alone proves nothing here: every `/api/` call
    // is fulfilled by a Playwright route, and a locally fulfilled route never
    // touches the network, so it succeeds offline exactly as it does online.
    // This test only ever went green because the completion endpoint was
    // unimplemented and failed for every send, offline or not. Abort the
    // completion instead, which is the condition being asserted.
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
