import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  CHAT_RENDERING_FIXTURES,
  QA_EMAIL_SOURCE,
  QA_WRITING_SOURCES,
  QA_CITATION_SOURCES,
} from '../test/fixtures/chat-rendering';
import { signIn, apiCall } from './qa-capability-harness';
import { ASSISTANT_CONTENT_CHANGED_REASON } from '../features/chat/lib/assistant-content-edit-contract';

const ONLY_CASE = process.env['QA_RENDER_CASE'];

test.beforeEach(async ({ page, baseURL }) => {
  expect(['127.0.0.1', 'localhost']).toContain(new URL(baseURL ?? '').hostname);
  expect(process.env['CLERK_SECRET_KEY']?.startsWith('sk_test_')).toBe(true);
  const database = new URL(process.env['DATABASE_URL'] ?? '');
  expect(['127.0.0.1', 'localhost']).toContain(database.hostname);
  await signIn(page);
});

for (const fixture of CHAT_RENDERING_FIXTURES.filter(
  (item) => !ONLY_CASE || item.id === ONLY_CASE,
)) {
  test(`separate local conversation: ${fixture.title}`, async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    let generationCalls = 0;
    const requests: Record<string, unknown>[] = [];
    await page.route('**/api/media/image/**', async (route) => {
      generationCalls++;
      await route.abort();
    });
    await page.route('**/qa-render-image-*.svg', async (route) => {
      const id = /image-(\d)/.exec(route.request().url())?.[1] ?? '1';
      await route.fulfill({
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="white"/><text x="20" y="80">Fixture image ${id}</text></svg>`,
      });
    });
    await page.route('**/api/llm/v1/chat/completions', async (route) => {
      const request = route.request().postDataJSON() as Record<string, unknown>;
      requests.push(request);
      const chunks = fixture.content.match(/[\s\S]{1,80}/g) ?? [];
      const prelude =
        fixture.id === 'citations'
          ? [
              {
                choices: [
                  {
                    delta: {
                      x_search_results: {
                        tool: 'web_search',
                        content: QA_CITATION_SOURCES.map((source) => ({
                          type: 'web_search_result',
                          url: source.url,
                          title: source.title,
                          encrypted_content: source.snippet,
                        })),
                      },
                    },
                  },
                ],
              },
              ...QA_CITATION_SOURCES.map((source) => ({
                choices: [{ delta: { x_citation: { url: source.url, title: source.title } } }],
              })),
            ]
              .map((event) => `data: ${JSON.stringify(event)}\n\n`)
              .join('')
          : '';
      const events = chunks
        .map(
          (content) =>
            `data: ${JSON.stringify({ model: request['model'], choices: [{ delta: { content } }] })}\n\n`,
        )
        .join('');
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'cache-control': 'no-store' },
        body:
          prelude +
          events +
          `data: ${JSON.stringify({ model: request['model'], choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
      });
    });
    await page.goto('/chat');
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.getByRole('button', { name: /^new chat$/i }).click();
    const consent = page.getByRole('button', { name: 'Necessary only', exact: true });
    if (await consent.isVisible()) await consent.click();
    const composer = page.getByRole('textbox', { name: 'Message input', exact: true });
    await expect(composer).toBeEditable({ timeout: 30_000 });
    await composer.fill(fixture.prompt);
    const send = page.getByRole('button', { name: 'Send message', exact: true });
    await expect(send).toBeEnabled();
    await send.click();
    await expect.poll(() => requests.length, { timeout: 30000 }).toBe(1);
    await expect(page).toHaveURL(/\/chat\/[a-f0-9-]+/);
    const conversationId = new URL(page.url()).pathname.split('/').at(-1)!;
    expect(conversationId).not.toBe('chat');
    const assistant = page.locator('[data-role="assistant"]').last();
    await expect(assistant).toBeVisible();
    await expect(
      assistant.getByRole('button', { name: 'Copy message', exact: true }),
    ).toBeVisible();
    await assistant.getByRole('button', { name: 'Copy message', exact: true }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    if (fixture.id === 'email') expect(copied).toBe(QA_EMAIL_SOURCE);
    else expect(copied.length).toBeGreaterThan(0);
    await expect
      .poll(
        async () => {
          const result = await apiCall(page, `/api/chat/conversations/${conversationId}`);
          if (result.status !== 200) return false;
          const response = JSON.parse(result.body) as {
            messages?: { role: string; content: string }[];
          };
          return (
            response.messages?.some(
              (message) => message.role === 'assistant' && message.content === fixture.content,
            ) ?? false
          );
        },
        { timeout: 20000 },
      )
      .toBe(true);
    if (fixture.id === 'email') {
      const email = assistant.locator('[data-rich-block="email"]');
      await email
        .getByLabel('Subject', { exact: true })
        .fill(`Saved local subject ${randomUUID()}`);
      const savedSubject = await email.getByLabel('Subject', { exact: true }).inputValue();
      const save = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url().includes(`/conversations/${conversationId}/messages/`),
      );
      await email.getByRole('button', { name: 'Save changes', exact: true }).click();
      expect((await save).status()).toBe(200);
      await page.reload();
      await expect(
        page.locator('[data-rich-block="email"]').getByLabel('Subject', { exact: true }),
      ).toHaveValue(savedSubject);
    } else if (fixture.id === 'writing') {
      const blocks = assistant.locator('[data-rich-block]');
      await expect(blocks).toHaveCount(7);
      await blocks.nth(2).getByRole('button', { name: 'Edit text', exact: true }).click();
      const edited = '# Saved local report\n\nThis block was saved through the real API.';
      await blocks.nth(2).getByRole('textbox').fill(edited);
      const save = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url().includes(`/conversations/${conversationId}/messages/`),
      );
      await blocks.nth(2).getByRole('button', { name: 'Save changes', exact: true }).click();
      expect((await save).status()).toBe(200);
      const result = await apiCall(page, `/api/chat/conversations/${conversationId}`);
      expect(result.status).toBe(200);
      const response = JSON.parse(result.body) as { messages: { role: string; content: string }[] };
      expect(response.messages.find((message) => message.role === 'assistant')?.content).toBe(
        fixture.content.replace(QA_WRITING_SOURCES[2][1], edited),
      );
      await page.reload();
      await expect(page.locator('[data-rich-block]')).toHaveCount(7);
      await expect(page.locator('[data-rich-block]').nth(2)).toContainText(
        'This block was saved through the real API.',
      );
      await expect(page.locator('[data-rich-block]').nth(0)).toContainText(
        QA_WRITING_SOURCES[0][1],
      );
    } else {
      await page.reload();
      await expect(
        page
          .locator('[data-role="assistant"]')
          .last()
          .getByRole('button', { name: 'Copy message', exact: true }),
      ).toBeVisible();
    }
    if (fixture.id === 'citations') {
      const sources = page.getByRole('button', { name: 'Show sources', exact: true });
      await expect(sources).toBeVisible();
      await sources.click();
      const panel = page.getByLabel('Research panel', { exact: true });
      await expect(panel).toBeVisible();
      const reopenedAssistant = page.locator('[data-role="assistant"]').last();
      for (const [index, source] of QA_CITATION_SOURCES.entries()) {
        await expect(
          reopenedAssistant.getByRole('link', {
            name: `Source ${index + 1}: ${source.title}`,
            exact: true,
          }),
        ).toHaveAttribute('href', source.url);
        const sourceLink = panel.getByRole('link').filter({
          has: page.getByText(source.title, { exact: true }),
        });
        await expect(sourceLink).toBeVisible();
        const assertExactHref = async () =>
          expect(await sourceLink.getAttribute('href')).toBe(source.url);
        await assertExactHref();
        const differentHost = new URL(source.url);
        differentHost.hostname = differentHost.hostname.replaceAll('.', 'x');
        const hostileSuffix = new URL(source.url);
        hostileSuffix.hostname += '.attacker.example';
        for (const rejected of [differentHost.href, hostileSuffix.href]) {
          try {
            await sourceLink.evaluate(
              (element, href) => element.setAttribute('href', href),
              rejected,
            );
            await expect(assertExactHref()).rejects.toThrow();
          } finally {
            await sourceLink.evaluate(
              (element, href) => element.setAttribute('href', href),
              source.url,
            );
          }
        }
        await assertExactHref();
      }
    }
    expect(generationCalls).toBe(0);
    await apiCall(page, `/api/chat/conversations/${conversationId}`, { method: 'DELETE' });
  });
}

test('a late continuation cannot replace an edit saved in another tab', async ({
  page,
  context,
}) => {
  const original = '```document\n# Draft\n\nOriginal project text.\n```';
  const edited = '# Reviewed draft\n\nThis is the authoritative saved edit.';
  let releaseContinuation = () => {};
  const continuationReady = new Promise<void>((resolve) => {
    releaseContinuation = resolve;
  });
  let calls = 0;
  await context.route('**/api/llm/v1/chat/completions', async (route) => {
    const request = route.request().postDataJSON() as { model: string };
    calls++;
    const initial = calls === 1;
    if (!initial) await continuationReady;
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ model: request.model, choices: [{ delta: { content: initial ? original : '\n\nA late appended paragraph.' }, finish_reason: initial ? 'length' : 'stop' }] })}\n\ndata: [DONE]\n\n`,
    });
  });
  await page.goto('/chat');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /^new chat$/i }).click();
  const consent = page.getByRole('button', { name: 'Necessary only', exact: true });
  if (await consent.isVisible()) await consent.click();
  const composer = page.getByRole('textbox', { name: 'Message input', exact: true });
  await expect(composer).toBeEditable();
  await composer.fill('Write an editable project document.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page).toHaveURL(/\/chat\/[a-f0-9-]+/);
  const conversationId = new URL(page.url()).pathname.split('/').at(-1)!;
  const savedAnswer = async () => {
    const result = await apiCall(page, `/api/chat/conversations/${conversationId}`);
    expect(result.status).toBe(200);
    return (
      JSON.parse(result.body) as {
        messages: {
          id: string;
          role: string;
          content: string;
          metadata?: Record<string, unknown>;
        }[];
      }
    ).messages.find((message) => message.role === 'assistant');
  };
  await expect.poll(async () => (await savedAnswer())?.content).toBe(original);
  const second = await context.newPage();
  try {
    await second.goto(page.url());
    await second
      .getByRole('button', { name: 'Continue generating this response', exact: true })
      .click();
    await expect.poll(() => calls).toBe(2);
    const block = page.locator('[data-rich-block="document"]');
    await block.getByRole('button', { name: 'Edit text', exact: true }).click();
    await block.getByRole('textbox').fill(edited);
    const save = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' && response.url().includes('/messages/'),
    );
    await block.getByRole('button', { name: 'Save changes', exact: true }).click();
    expect((await save).status()).toBe(200);
    const authoritative = await savedAnswer();
    expect(authoritative?.content).toContain(edited);
    expect(authoritative?.metadata?.['assistantContentEdit']).toEqual(expect.any(String));
    const staleSave = second.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().endsWith('/messages'),
    );
    releaseContinuation();
    const refused = await staleSave;
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toMatchObject({
      error: { details: { reason: ASSISTANT_CONTENT_CHANGED_REASON } },
    });
    await expect(
      second.getByRole('button', { name: 'Reopen saved chat', exact: true }),
    ).toBeVisible();
    expect((await savedAnswer())?.content).toBe(authoritative?.content);
    await second.getByRole('button', { name: 'Reopen saved chat', exact: true }).click();
    await expect(second.locator('[data-rich-block="document"]')).toContainText(
      'This is the authoritative saved edit.',
    );
    await expect(second.getByText('A late appended paragraph.', { exact: true })).toHaveCount(0);
  } finally {
    releaseContinuation();
    await second.close();
    await apiCall(page, `/api/chat/conversations/${conversationId}`, { method: 'DELETE' });
  }
});
