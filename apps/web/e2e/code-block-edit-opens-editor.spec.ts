import { expect, test, type Page } from '@playwright/test';
import { EXPLICIT_ARTIFACT_DERIVATION_POLICY } from '@agiworkforce/artifacts';
import { apiCall, signIn } from './qa-capability-harness';

/**
 * The code block's Edit button has to land the reader in a focused source
 * editor. jsdom cannot see what else moves focus in the page: the artifacts
 * panel's own overlay focus handling on a phone, the dynamically loaded editor
 * mounting after the click, and the page's window-level shortcut listeners.
 *
 * The transcript is a fixture served over a conversation this spec creates and
 * deletes. Every write other than that conversation's own rows, and every
 * request to a route that could call a model, is refused.
 */

const CHAT_ROUTE = '/chat';
const CONVERSATIONS_PATH = '/api/chat/conversations';
const CONVERSATION_PATH_PATTERN = /^\/api\/chat\/conversations\/[0-9a-f-]{36}$/;
const MODEL_BACKED_PATH = /^\/api\/(?:llm|media|models\/[^/]+\/completions)(?:\/|$)/;
const MEDIA_AVAILABILITY_PATH = '/api/media/availability';
const API_ROUTE = '**/api/**';
const READ_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);
const DATABASE_ONLY_WRITES: ReadonlyArray<{ method: string; path: RegExp }> = [
  { method: 'POST', path: /^\/api\/consent$/ },
  { method: 'PUT', path: CONVERSATION_PATH_PATTERN },
  { method: 'DELETE', path: CONVERSATION_PATH_PATTERN },
];

const LOAD_TIMEOUT_MS = 30_000;
const CONSENT_WAIT_MS = 6_000;
const CONSENT_DISMISS_LABEL = 'Close and reject non-essential cookies';
const ASSISTANT_BUBBLE = '[data-role="assistant"]';
const EDIT_LABEL = 'Edit this code beside the chat';
const EDITOR_CONTENT = '[data-testid="artifact-source-editor"] .cm-content';

const ORIGINAL_SOURCE = '<main>Original page</main>';
const EDITED_SOURCE = '<main>Edited in the panel</main>';
const MESSAGE_IDS = {
  user: '3e9c8f4d-a051-426b-8d74-f8a9b0c1d2e3',
  assistant: '4fad905e-b162-437c-9e85-a9b0c1d2e3f4',
} as const;

const LAYOUTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'phone', viewport: { width: 390, height: 844 } },
] as const;

async function guardNetwork(page: Page): Promise<{ createdConversations: string[] }> {
  const createdConversations: string[] = [];
  await page.route(API_ROUTE, async (route) => {
    const request = route.request();
    const method = request.method();
    const { pathname } = new URL(request.url());
    const refuse = () => route.abort('blockedbyclient');
    const isRead = READ_METHODS.has(method);
    if (isRead && pathname === MEDIA_AVAILABILITY_PATH) return route.fallback();
    if (MODEL_BACKED_PATH.test(pathname)) return refuse();
    if (isRead) return route.fallback();
    if (method === 'POST' && pathname === CONVERSATIONS_PATH) {
      const response = await route.fetch();
      const body = (await response.json().catch(() => null)) as {
        conversation?: { id?: string };
      } | null;
      if (body?.conversation?.id) createdConversations.push(body.conversation.id);
      return route.fulfill({ response });
    }
    const databaseOnly = DATABASE_ONLY_WRITES.some(
      (write) => write.method === method && write.path.test(pathname),
    );
    return databaseOnly ? route.fallback() : refuse();
  });
  return { createdConversations };
}

async function serveTranscript(page: Page, conversationId: string): Promise<void> {
  const startedAt = Date.now();
  const stored = (id: string, parentId: string | null, role: string, offsetMs: number) => ({
    id,
    parent_id: parentId,
    role,
    model: null,
    provider: null,
    input_tokens: 0,
    output_tokens: 0,
    created_at: new Date(startedAt + offsetMs).toISOString(),
  });
  await page.route(`**${CONVERSATIONS_PATH}/${conversationId}?*`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    return route.fulfill({
      response,
      json: {
        ...body,
        messages: [
          {
            ...stored(MESSAGE_IDS.user, null, 'user', 0),
            content: 'Write a one line page',
            metadata: null,
          },
          {
            ...stored(MESSAGE_IDS.assistant, MESSAGE_IDS.user, 'assistant', 1),
            content: `Here it is:\n\n\`\`\`html\n${ORIGINAL_SOURCE}\n\`\`\``,
            metadata: { artifactDerivation: EXPLICIT_ARTIFACT_DERIVATION_POLICY },
          },
        ],
        total: 2,
        hasMore: false,
      },
    });
  });
}

async function previewFrameShows(page: Page, text: string): Promise<boolean> {
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    const body = await frame
      .locator('body')
      .innerText({ timeout: 1_000 })
      .catch(() => '');
    if (body.includes(text)) return true;
  }
  return false;
}

for (const layout of LAYOUTS) {
  test.describe(`code block Edit (${layout.name})`, () => {
    test.use({ viewport: layout.viewport });

    test('opens a focused source editor and previews the saved edit', async ({ page }) => {
      await signIn(page);
      const guard = await guardNetwork(page);
      try {
        const created = await apiCall(page, CONVERSATIONS_PATH, {
          method: 'POST',
          body: { title: 'Code block edit spec' },
        });
        expect(created.status).toBe(201);
        const conversationId = guard.createdConversations[0];
        if (!conversationId) throw new Error('the conversation was not created');
        await serveTranscript(page, conversationId);

        await page.goto(`${CHAT_ROUTE}/${conversationId}`, { waitUntil: 'domcontentloaded' });
        await page
          .getByRole('button', { name: CONSENT_DISMISS_LABEL })
          .click({ timeout: CONSENT_WAIT_MS })
          .catch(() => undefined);

        const bubble = page.locator(ASSISTANT_BUBBLE).last();
        await bubble.getByRole('button', { name: EDIT_LABEL }).click({ timeout: LOAD_TIMEOUT_MS });

        const editor = page.locator(EDITOR_CONTENT);
        await expect(editor).toBeFocused({ timeout: LOAD_TIMEOUT_MS });
        await expect(editor).toHaveText(ORIGINAL_SOURCE);

        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.insertText(EDITED_SOURCE);
        await expect(editor).toBeFocused();
        await expect(editor).toHaveText(EDITED_SOURCE);

        await page.getByRole('button', { name: 'Save artifact source' }).click();
        await expect(page.getByRole('button', { name: 'Close artifact viewer' })).toBeInViewport({
          ratio: 1,
        });
        await page.getByRole('button', { name: 'Preview', exact: true }).click();
        await expect
          .poll(() => previewFrameShows(page, 'Edited in the panel'), { timeout: LOAD_TIMEOUT_MS })
          .toBe(true);
        expect(await previewFrameShows(page, 'Original page')).toBe(false);
      } finally {
        for (const id of guard.createdConversations) {
          await apiCall(page, `${CONVERSATIONS_PATH}/${id}`, { method: 'DELETE' });
        }
      }
    });
  });
}
