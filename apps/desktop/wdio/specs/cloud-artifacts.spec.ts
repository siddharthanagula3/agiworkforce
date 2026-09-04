import {
  installCloudApiStubs,
  mockDeviceAuthorization,
  completeMockedDeviceSignIn,
  deviceSignInCardVisible,
  restoreLocalModeProfile,
  writePersistedAppMode,
} from '../helpers/cloudSession';

const CONVERSATION_ID = 'wdio-artifacts-conversation';
const CONVERSATION_TITLE = 'Artifact demo';

const MAX_METADATA_LENGTH = 32_000;

function installArtifactCloudOverlay(conversationId: string, title: string): void {
  const STORE_KEY = '__wdioArtifactStoredMessages';
  const CALLS_KEY = '__wdioArtifactCalls';
  const scope = window as unknown as Record<string, unknown>;

  const delegate = window.fetch.bind(window);
  scope[CALLS_KEY] = [] as Array<{ url: string; method: string; body: string }>;

  const readStored = (): Array<Record<string, unknown>> => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? (JSON.parse(raw) as Array<Record<string, unknown>>) : [];
    } catch {
      return [];
    }
  };
  const appendStored = (message: Record<string, unknown>) => {
    const next = readStored();
    next.push(message);
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  };

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const conversationWire = () => ({
    id: conversationId,
    title,
    model: null,
    project_id: null,
    pinned: false,
    starred: false,
    archived: false,
    is_temporary: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const sseFromContent = (content: string) => {
    const encoder = new TextEncoder();
    const step = Math.max(1, Math.ceil(content.length / 8));
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < content.length; i += step) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  id: 'chatcmpl-wdio',
                  object: 'chat.completion.chunk',
                  choices: [{ index: 0, delta: { content: content.slice(i, i + step) } }],
                })}\n\n`,
              ),
            );
          }
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                id: 'chatcmpl-wdio',
                object: 'chat.completion.chunk',
                choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
              })}\n\n`,
            ),
          );
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    );
  };

  window.fetch = function artifactOverlayFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const raw =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    let pathname = raw;
    try {
      pathname = new URL(raw, window.location.origin).pathname;
    } catch {
      // Keep the raw value; the prefix tests below simply will not match.
    }
    const method = (
      init?.method ??
      (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET') ??
      'GET'
    ).toUpperCase();
    const body = typeof init?.body === 'string' ? init.body : '';
    (scope[CALLS_KEY] as Array<{ url: string; method: string; body: string }>).push({
      url: pathname,
      method,
      body,
    });

    if (pathname.startsWith('/api/chat/conversations')) {
      if (method === 'POST' && /\/messages$/.test(pathname)) {
        const parsed = body ? (JSON.parse(body) as Record<string, unknown>) : {};
        const metadataLength = JSON.stringify(parsed['metadata'] ?? {}).length;
        if (metadataLength > MAX_METADATA_LENGTH) {
          return Promise.resolve(
            json(
              {
                error: `Message metadata exceeds ${MAX_METADATA_LENGTH} characters.`,
              },
              400,
            ),
          );
        }
        appendStored({
          id: parsed['id'],
          role: parsed['role'],
          content: parsed['content'],
          model: parsed['model'] ?? null,
          provider: null,
          metadata: parsed['metadata'] ?? null,
          input_tokens: 0,
          output_tokens: 0,
          created_at: new Date().toISOString(),
        });
        return Promise.resolve(json({ ok: true }));
      }
      if (method === 'POST') {
        return Promise.resolve(json({ conversation: conversationWire() }));
      }
      if (method === 'GET' && /\/api\/chat\/conversations\/[^/]+$/.test(pathname)) {
        return Promise.resolve(
          json({ conversation: conversationWire(), messages: readStored(), hasMore: false }),
        );
      }
      if (method === 'GET') {
        return Promise.resolve(
          json({
            conversations: readStored().length > 0 ? [conversationWire()] : [],
            hasMore: false,
            nextOffset: 0,
          }),
        );
      }
    }

    if (pathname.startsWith('/api/llm/v1/chat/completions')) {
      const staged = scope['__wdioStagedCompletion'] as string | undefined;
      if (staged) return Promise.resolve(sseFromContent(staged));
    }

    return delegate(input as RequestInfo, init);
  } as typeof fetch;
}

async function stageCompletion(content: string): Promise<void> {
  await browser.execute((staged: string) => {
    (window as unknown as Record<string, unknown>)['__wdioStagedCompletion'] = staged;
  }, content);
}

async function installWebviewStubs(): Promise<void> {
  await installCloudApiStubs({ completions: 'ok' });
  await browser.execute(installArtifactCloudOverlay, CONVERSATION_ID, CONVERSATION_TITLE);
}

async function enterMockedCloudMode(): Promise<void> {
  await writePersistedAppMode({ mode: 'cloud', hasSelectedMode: true, hasOnboarded: true });
  await browser.refresh();
  await installWebviewStubs();

  const composerDisplayed = async () =>
    $('textarea[aria-label="Chat message input"]')
      .isDisplayed()
      .catch(() => false);
  await browser.waitUntil(
    async () => (await deviceSignInCardVisible()) || (await composerDisplayed()),
    {
      timeout: 60_000,
      interval: 500,
      timeoutMsg: 'Neither the Cloud sign-in card nor the composer appeared after refresh',
    },
  );

  if (await deviceSignInCardVisible()) {
    await mockDeviceAuthorization();
    await completeMockedDeviceSignIn();
  }

  const composer = await $('textarea[aria-label="Chat message input"]');
  await composer.waitForDisplayed({ timeout: 90_000 });
}

async function sendTurn(prompt: string): Promise<void> {
  const composer = await $('textarea[aria-label="Chat message input"]');
  await composer.waitForDisplayed({ timeout: 20_000 });
  await composer.click();
  await composer.setValue(prompt);
  await browser.keys(['Enter']);
}

async function assistantSaves(): Promise<Array<{ contentLength: number; metadataLength: number }>> {
  return browser.execute(() => {
    const calls =
      ((window as unknown as Record<string, unknown>)['__wdioArtifactCalls'] as Array<{
        url: string;
        method: string;
        body: string;
      }>) ?? [];
    return calls
      .filter((call) => call.method === 'POST' && /\/messages$/.test(call.url))
      .map((call) => JSON.parse(call.body || '{}') as Record<string, unknown>)
      .filter((parsed) => parsed['role'] === 'assistant')
      .map((parsed) => ({
        contentLength: String(parsed['content'] ?? '').length,
        metadataLength: JSON.stringify(parsed['metadata'] ?? {}).length,
      }));
  }) as Promise<Array<{ contentLength: number; metadataLength: number }>>;
}

describe('AGI Desktop Cloud artifacts', () => {
  before(async function () {
    this.timeout(240_000);
    await browser.pause(1_500);
    await browser.execute(() => {
      localStorage.removeItem('__wdioArtifactStoredMessages');
    });
    await enterMockedCloudMode();
  });

  after(async () => {
    await browser.execute(() => {
      localStorage.removeItem('__wdioArtifactStoredMessages');
    });
    await restoreLocalModeProfile();
  });

  it('DES-C05 · turns a fenced HTML answer into an openable artifact', async function () {
    this.timeout(150_000);

    await stageCompletion(
      'Here is the page you asked for.\n\n```html\n' +
        '<!DOCTYPE html><html><head><title>Pricing</title></head>' +
        '<body><h1>Pricing</h1><p>Simple plans.</p></body></html>\n' +
        '```\n\nTell me what to change.',
    );
    await sendTurn('Build me a pricing page in HTML');

    const card = await $('[data-testid="message-artifacts"]');
    await card.waitForDisplayed({ timeout: 90_000 });
    expect(await card.getText()).toContain('Pricing');

    const assistantRow = await $$('[data-message-row="assistant"]');
    const transcript = await assistantRow[assistantRow.length - 1]!.getText();
    expect(transcript).toContain('Tell me what to change.');
    expect(transcript).not.toContain('<!DOCTYPE html>');

    const artifactsToggle = await $('button[aria-label^="Toggle artifacts panel"]');
    await artifactsToggle.waitForDisplayed({ timeout: 30_000 });
    expect(await artifactsToggle.getAttribute('aria-label')).toContain('(1)');

    await card.click();
    const preview = await $('[data-testid="artifact-panel-html-preview"]');
    await preview.waitForDisplayed({ timeout: 30_000 });
    await browser.saveScreenshot('/tmp/agi-desktop-cloud-artifact-open.png');
  });

  it('DES-C06 · a >32KB artifact still saves the turn, and it survives a reload', async function () {
    this.timeout(240_000);

    const bigHtml =
      '<!DOCTYPE html><html><head><title>Report</title></head><body>' +
      '<h1>Quarterly report</h1>' +
      '<p>Line of the quarterly report body.</p>'.repeat(1_100) +
      '</body></html>';
    expect(bigHtml.length).toBeGreaterThan(MAX_METADATA_LENGTH);

    await stageCompletion(
      `Full report below.\n\n\`\`\`html\n${bigHtml}\n\`\`\`\n\nThat is the whole report.`,
    );
    await sendTurn('Write the full quarterly report as one HTML page');

    await browser.waitUntil(
      async () => (await $('body').getText()).includes('That is the whole report.'),
      {
        timeout: 120_000,
        interval: 500,
        timeoutMsg: 'The large-artifact assistant turn never finished rendering',
      },
    );
    expect(await $('body').getText()).not.toContain('Could not save the Cloud reply');

    const saves = await assistantSaves();
    expect(saves.length).toBeGreaterThan(0);
    for (const save of saves) {
      expect(save.metadataLength).toBeLessThanOrEqual(MAX_METADATA_LENGTH);
    }
    expect(saves[saves.length - 1]!.contentLength).toBeGreaterThan(MAX_METADATA_LENGTH);

    await enterMockedCloudMode();

    const conversationEntry = await $(`=${CONVERSATION_TITLE}`);
    await conversationEntry.waitForDisplayed({ timeout: 90_000 });
    await conversationEntry.click();

    await browser.waitUntil(
      async () => (await $('body').getText()).includes('That is the whole report.'),
      {
        timeout: 90_000,
        interval: 500,
        timeoutMsg:
          'The large-artifact assistant turn did not survive the reload, the metadata ' +
          'budget guard did not prevent the 400 that discards the whole turn.',
      },
    );

    const restoredCard = await $('[data-testid="message-artifacts"]');
    await restoredCard.waitForDisplayed({ timeout: 60_000 });
    expect(await restoredCard.getText()).toContain('Report');
    await browser.saveScreenshot('/tmp/agi-desktop-cloud-artifact-reopen.png');
  });

  it('DES-C15 · an interactive HTML artifact either mutates its preview DOM or says it cannot', async function () {
    this.timeout(180_000);

    await stageCompletion(
      'Interactive demo:\n\n```html\n' +
        '<!DOCTYPE html><html><head><title>Live counter</title></head><body>' +
        '<p id="target">not-yet-run</p>' +
        '<script>document.getElementById("target").textContent = "script-ran-in-preview";</script>' +
        '</body></html>\n```\n\nClick to try it.',
    );
    await sendTurn('Give me an interactive HTML page');

    const cards = await $$('[data-testid="message-artifacts"]');
    const card = cards[cards.length - 1]!;
    await card.waitForDisplayed({ timeout: 90_000 });
    await card.click();

    const preview = await $('[data-testid="artifact-panel-html-preview"]');
    await preview.waitForDisplayed({ timeout: 60_000 });

    const notice = await $('[data-testid="artifact-preview-scripts-blocked"]');
    await browser.waitUntil(
      async () =>
        (await notice.isExisting()) ||
        (await $('[data-testid="artifact-panel-html-preview"] iframe').isExisting()),
      {
        timeout: 30_000,
        interval: 500,
        timeoutMsg:
          'The HTML preview settled into neither a running iframe nor the blocked-scripts notice',
      },
    );

    if (await notice.isExisting()) {
      expect(await notice.getText()).toContain('security policy');
      await browser.saveScreenshot('/tmp/agi-desktop-cloud-artifact-scripts-blocked.png');
      return;
    }

    const iframe = await $('[data-testid="artifact-panel-html-preview"] iframe');
    await iframe.waitForExist({ timeout: 30_000 });
    await browser.switchToFrame(iframe);
    const mutated = await $('#target');
    await mutated.waitForExist({ timeout: 20_000 });
    expect(await mutated.getText()).toBe('script-ran-in-preview');
    await browser.switchToParentFrame();
    await browser.saveScreenshot('/tmp/agi-desktop-cloud-artifact-interactive.png');
  });
});
