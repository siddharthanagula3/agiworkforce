import { test, expect, type Page } from '@playwright/test';
import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/cloud-contracts';
import { installSseChatMock, type SseChatMock } from './lib/sse-chat-mock';

const QA_USER = 'user_3F8wXtZ4rDJ1SZmfO02Lz3BHj2v';
const SHOT_DIR =
  '/private/tmp/claude-501/-Users-siddhartha-Desktop-agiworkforce/20ebdda6-913a-420e-93f7-a9d2e8b09fbe/scratchpad/product-audit';
const VIEWPORT = { width: 1280, height: 800 };
const SETTLE_MS = 900;
const PROMPT = 'Population of the five largest US cities';
const SEARCH_QUERY = 'largest us cities population 2026';
const FAILURE_REASON = 'the provider is over its spending cap for this project';
const TURN_ACTIVE_PLACEHOLDER = 'Follow up';
const COMPOSER_EDITOR_PLACEHOLDER_CLASS = 'composer-editor__placeholder';
const SHIFT_TOLERANCE_PX = 1;
const TYPE_DELAY_MS = 5;
const TYPED_TEXT_TIMEOUT_MS = 15_000;
const CHAT_DOCK_LABEL = 'Chat details';
const CONVERSATION_START_FAILURE = 'Could not start the conversation.';
const START_RETRY_ATTEMPTS = 5;
const START_RETRY_PAUSE_MS = 5_000;
const START_WAIT_MS = 12_000;
const START_POLL_MS = 400;
const START_RETRY_ACTION_LABEL = 'Retry this turn';
const CONVERSATION_PACE_MS = 15_000;
const CACHE_NOTE_TEXT = 'Starts a new prompt cache';
const TURN_FAILED_LEAD = 'Response failed';
const THEME_STORAGE_KEY = 'theme';
const THEMES = ['dark', 'light'] as const;
type CaptureTheme = (typeof THEMES)[number];

async function mintSignInTicket(): Promise<string> {
  const secret = process.env['CLERK_SECRET_KEY'];
  if (!secret) throw new Error('CLERK_SECRET_KEY missing from process.env');
  const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: QA_USER }),
  });
  if (!res.ok) throw new Error(`sign_in_tokens failed: HTTP ${res.status}`);
  const json = (await res.json()) as { token?: string };
  if (!json.token) throw new Error('sign_in_tokens returned no token');
  return json.token;
}

async function applyTheme(page: Page, theme: CaptureTheme): Promise<void> {
  await page.addInitScript(
    (input: { key: string; theme: string }) => {
      window.localStorage.setItem(input.key, input.theme);
    },
    { key: THEME_STORAGE_KEY, theme },
  );
}

async function shoot(page: Page, name: string): Promise<void> {
  const theme = await page.evaluate(
    (key: string) => window.localStorage.getItem(key) ?? 'dark',
    THEME_STORAGE_KEY,
  );
  await page.screenshot({ path: `${SHOT_DIR}/slice-a-${name}-${theme}.png` });
}

async function signIn(page: Page): Promise<void> {
  const ticket = await mintSignInTicket();
  await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => Boolean((window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded),
    { timeout: 30_000 },
  );
  await page.evaluate(async (t) => {
    const clerk = (
      window as unknown as {
        Clerk: {
          client: { signIn: { create: (o: unknown) => Promise<{ createdSessionId?: string }> } };
          setActive: (o: unknown) => Promise<void>;
        };
      }
    ).Clerk;
    const res = await clerk.client.signIn.create({ strategy: 'ticket', ticket: t });
    if (res.createdSessionId) await clerk.setActive({ session: res.createdSessionId });
  }, ticket);
  await page.waitForTimeout(1500);
}

function agentEvent(sequence: number, event: Record<string, unknown>): Record<string, unknown> {
  return {
    x_agent_event: {
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      sessionId: 'spec-session',
      turnId: 'spec-turn',
      sequence,
      emittedAtMs: 1_000 + sequence,
      event,
    },
  };
}

const SOURCES = [
  { url: 'https://census.gov/one', title: 'City and Town Population Totals' },
  { url: 'https://census.gov/two', title: 'Population Growth Holds Steady' },
  { url: 'https://census.gov/three', title: 'Vintage Total Population Estimates' },
  { url: 'https://census.gov/four', title: 'New Population Estimates by Age and Sex' },
  { url: 'https://census.gov/five', title: 'Population Growth Reported Across Cities' },
];

async function readComposerPlaceholder(page: Page): Promise<string> {
  return page.evaluate((placeholderClass) => {
    const textarea = document.querySelector('[data-composer-textarea]');
    if (textarea instanceof HTMLTextAreaElement) return textarea.placeholder;
    const overlay = document.querySelector(`.${placeholderClass}`);
    return overlay?.textContent ?? '';
  }, COMPOSER_EDITOR_PLACEHOLDER_CLASS);
}

async function send(page: Page, text: string): Promise<void> {
  const composer = page.getByRole('textbox').first();
  await composer.click();
  await composer.pressSequentially(text, { delay: TYPE_DELAY_MS });
  await page.waitForFunction(
    (expected: string) => {
      const textarea = document.querySelector('[data-composer-textarea]');
      if (textarea instanceof HTMLTextAreaElement) return textarea.value.includes(expected);
      const editor = document.querySelector('.ProseMirror');
      return Boolean(editor && (editor.textContent ?? '').includes(expected));
    },
    text,
    { timeout: TYPED_TEXT_TIMEOUT_MS },
  );
  await composer.press('Enter');
}

/**
 * The QA account shares a per-minute limiter with everything else on this box,
 * so a conversation create can be refused. The notice offers Retry; taking it
 * keeps the spec measuring the UI instead of the limiter.
 */
async function sendAndOpenStream(page: Page, mock: SseChatMock, text: string): Promise<void> {
  const startFailure = page.getByText(CONVERSATION_START_FAILURE);
  await send(page, text);

  for (let attempt = 0; attempt < START_RETRY_ATTEMPTS; attempt += 1) {
    const deadline = Date.now() + START_WAIT_MS;
    while (Date.now() < deadline) {
      if ((await mock.requestCount()) > 0) return;
      if (await startFailure.isVisible().catch(() => false)) break;
      await page.waitForTimeout(START_POLL_MS);
    }
    if ((await mock.requestCount()) > 0) return;
    await page.waitForTimeout(START_RETRY_PAUSE_MS);
    await page.getByRole('button', { name: START_RETRY_ACTION_LABEL }).first().click();
  }

  throw new Error('sendAndOpenStream: the conversation never opened a completion stream');
}

async function streamSearchTurn(page: Page, mock: SseChatMock): Promise<void> {
  await sendAndOpenStream(page, mock, PROMPT);
  await mock.pushDelta(
    agentEvent(0, {
      type: 'tool-execution-start',
      toolCallId: 'call-search-1',
      name: 'web_search',
      category: 'web-search',
      summary: 'Searching the web',
      input: { query: SEARCH_QUERY },
    }),
  );
  await mock.pushDelta(
    agentEvent(1, {
      type: 'source-list',
      toolCallId: 'call-search-1',
      query: SEARCH_QUERY,
      sources: SOURCES,
    }),
  );
  await mock.pushDelta(
    agentEvent(2, {
      type: 'tool-execution-end',
      toolCallId: 'call-search-1',
      name: 'web_search',
      output: 'ok',
      isError: false,
      elapsedMs: 3_800,
    }),
  );
  await page.waitForTimeout(SETTLE_MS);
}

test.use({ viewport: VIEWPORT });

test.describe('chat run recovery', () => {
  // Every test starts a conversation on the shared QA account, whose
  // per-minute limiter is not this spec's subject. One retry covers a refusal
  // the in-test Retry loop could not outlast.
  test.describe.configure({ retries: 1 });

  // Every test here starts a conversation, and six creates inside one minute
  // trips the account's shared per-minute limiter. Pacing them keeps the spec
  // measuring the UI rather than the limiter.
  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.retry === 0) {
      await new Promise((resolve) => setTimeout(resolve, CONVERSATION_PACE_MS));
    }
    await applyTheme(page, (process.env['SLICE_A_THEME'] as CaptureTheme) ?? 'dark');
    await signIn(page);
  });

  test('search results stay out of the transcript and the trace names the query', async ({
    page,
  }) => {
    const mock = await installSseChatMock(page);
    await page.goto('/chat');
    await streamSearchTurn(page, mock);

    const transcript = page.getByTestId('agent-activity-rows').first();
    await expect(transcript).toContainText(SEARCH_QUERY);
    for (const source of SOURCES) {
      await expect(transcript.getByRole('link', { name: source.title })).toHaveCount(0);
    }

    await shoot(page, 'a4-search-trace');

    await mock.push('The five largest cities total about 18 million people.');
    await mock.finish();
    await page.waitForTimeout(SETTLE_MS);
    await shoot(page, 'a4-search-answered');
  });

  test('the user bubble does not move while trace rows arrive', async ({ page }) => {
    const mock = await installSseChatMock(page);
    await page.goto('/chat');

    await sendAndOpenStream(page, mock, PROMPT);
    await mock.pushDelta(
      agentEvent(0, {
        type: 'progress-update',
        progressId: 'generation',
        summary: 'Reasoning',
        status: 'running',
      }),
    );
    await page.waitForTimeout(SETTLE_MS);

    const bubble = page.locator('[data-role="user"]').last();
    const first = await bubble.boundingBox();
    expect(first).not.toBeNull();
    let previousY = first!.y;
    const downwardMoves: number[] = [];

    for (let index = 0; index < 4; index += 1) {
      await mock.pushDelta(
        agentEvent(1 + index * 3, {
          type: 'tool-execution-start',
          toolCallId: `call-shift-${index}`,
          name: 'web_search',
          category: 'web-search',
          summary: 'Searching the web',
          input: { query: `${SEARCH_QUERY} ${index}` },
        }),
      );
      await mock.pushDelta(
        agentEvent(2 + index * 3, {
          type: 'source-list',
          toolCallId: `call-shift-${index}`,
          query: `${SEARCH_QUERY} ${index}`,
          sources: SOURCES,
        }),
      );
      await mock.pushDelta(
        agentEvent(3 + index * 3, {
          type: 'tool-execution-end',
          toolCallId: `call-shift-${index}`,
          name: 'web_search',
          output: 'ok',
          isError: false,
          elapsedMs: 1_200,
        }),
      );
      await page.waitForTimeout(SETTLE_MS);
      const after = await bubble.boundingBox();
      expect(after).not.toBeNull();
      const delta = after!.y - previousY;
      if (delta > SHIFT_TOLERANCE_PX) downwardMoves.push(delta);
      previousY = after!.y;
    }

    expect(downwardMoves).toEqual([]);

    await shoot(page, 'a8-no-shift');
  });

  test('a failed turn carries one inline notice with Retry and Switch model', async ({ page }) => {
    const mock = await installSseChatMock(page);
    await page.goto('/chat');

    await sendAndOpenStream(page, mock, PROMPT);
    await mock.pushDelta({
      x_stream_error: {
        message: FAILURE_REASON,
        code: 'provider_quota_exhausted',
        retryable: true,
      },
    });
    await mock.finish();
    await page.waitForTimeout(SETTLE_MS);

    // One row: the run's own summary line carries the reason and the links.
    const rowsWithReason = await page.evaluate((reason: string) => {
      return Array.from(document.querySelectorAll('*'))
        .filter((node) => {
          const own = Array.from(node.childNodes)
            .filter((child) => child.nodeType === Node.TEXT_NODE)
            .map((child) => child.textContent ?? '')
            .join('');
          return own.includes(reason);
        })
        .map((node) => (node.textContent ?? '').trim());
    }, FAILURE_REASON);
    expect(rowsWithReason).toHaveLength(1);
    expect(rowsWithReason[0]).toContain(TURN_FAILED_LEAD);
    await expect(page.getByRole('button', { name: 'Open the model picker' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Regenerate this response' })).toBeVisible();

    await shoot(page, 'a6-inline-failure');

    await page.getByRole('button', { name: 'Open the model picker' }).click();
    await expect(page.getByRole('dialog', { name: 'Models' })).toBeVisible();
    await shoot(page, 'a6-picker-opened');
  });

  test('switching model mid-conversation asks nothing and notes the cache', async ({ page }) => {
    const mock = await installSseChatMock(page);
    await page.goto('/chat');

    await sendAndOpenStream(page, mock, PROMPT);
    await mock.push('About 18 million people in total.');
    await mock.finish();
    await page.waitForTimeout(SETTLE_MS);

    await page.getByRole('button', { name: /change model/i }).click();
    const picker = page.getByRole('dialog', { name: 'Models' });
    await expect(picker).toBeVisible();
    const currentModel = (
      await page.getByRole('button', { name: /change model/i }).textContent()
    )?.trim();
    const modelRows = picker.locator('button[data-picker-row]').filter({
      hasNot: page.getByRole('switch'),
    });
    const count = await modelRows.count();
    let clicked = false;
    for (let index = 0; index < count; index += 1) {
      const row = modelRows.nth(index);
      const label = ((await row.textContent()) ?? '').trim();
      if (!label || label === 'Effort' || (currentModel && label.startsWith(currentModel))) {
        continue;
      }
      await row.click();
      clicked = true;
      break;
    }
    expect(clicked).toBe(true);

    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByText('Switch model mid-conversation?')).toHaveCount(0);
    await expect(page.getByText(CACHE_NOTE_TEXT)).toBeVisible();
    await expect(picker).toBeHidden();

    await shoot(page, 'a1-cache-note');
  });

  test('the composer says Follow up and marks a queued message', async ({ page }) => {
    const mock = await installSseChatMock(page);
    await page.goto('/chat');

    await sendAndOpenStream(page, mock, PROMPT);
    await mock.push('Working on it');
    await page.waitForTimeout(SETTLE_MS);

    const placeholder = await readComposerPlaceholder(page);
    expect(placeholder).toBe(TURN_ACTIVE_PLACEHOLDER);
    expect(placeholder).not.toContain('sends when the current response finishes');

    const composer = page.getByRole('textbox').first();
    await composer.click();
    await composer.fill('And the median household income for each');
    await composer.press('Enter');
    await page.waitForTimeout(SETTLE_MS);

    await expect(page.getByTestId('composer-queued-chip')).toBeVisible();
    await shoot(page, 'a7-queued-chip');

    await mock.finish();
  });

  test('the dock in a plain chat is titled by the chat and holds two sections', async ({
    page,
  }) => {
    const mock = await installSseChatMock(page);
    await page.goto('/chat');
    await streamSearchTurn(page, mock);
    await mock.push('About 18 million people in total.');
    await mock.finish();
    await page.waitForTimeout(SETTLE_MS);

    const dock = page.getByRole('complementary', { name: CHAT_DOCK_LABEL });
    if (!(await dock.isVisible().catch(() => false))) {
      await page
        .getByRole('button', { name: `Open ${CHAT_DOCK_LABEL}` })
        .first()
        .click();
    }
    await expect(page.getByRole('complementary', { name: CHAT_DOCK_LABEL })).toBeVisible();
    await expect(dock.getByText('In this chat', { exact: true })).toBeVisible();
    await expect(dock.getByText('Sources', { exact: true })).toBeVisible();
    await expect(page.getByText('AGI Work session')).toHaveCount(0);
    await expect(dock.getByText('Outputs', { exact: true })).toHaveCount(0);
    await expect(dock.getByText('Context', { exact: true })).toHaveCount(0);

    await shoot(page, 'a5-chat-dock');
  });
});
