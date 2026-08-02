/**
 * cloud-artifacts.spec.ts — DES-C05 / DES-C06 / DES-C15, on the real binary.
 *
 * Three findings meet here, and only the packaged app can settle the third:
 *
 *  DES-C05  Desktop Cloud could not produce an artifact at all. The only cloud
 *           artifact source read `payload.artifact` off the SSE chunk — a key the
 *           managed completions route never emits — and nothing derived artifacts
 *           from the message body the way web and mobile do. Asking the Cloud
 *           model for an HTML page showed a raw code block and nothing else.
 *
 *  DES-C06  Cloud artifacts were persisted INSIDE the 32 000-char message
 *           metadata budget shared with thinking/toolCalls/generatedFiles. One
 *           real artifact overflowed it, the save 400'd, and the ENTIRE assistant
 *           turn was lost on reopen — not just the artifact.
 *
 *  DES-C15  Artifact previews are same-document `srcdoc` iframes, which INHERIT
 *           the app CSP (`script-src 'self' 'wasm-unsafe-eval'` in
 *           `apps/desktop/src-tauri/tauri.conf.json`). Interactive HTML therefore
 *           renders inert inside the packaged binary. Vitest cannot see this:
 *           jsdom has no CSP engine and the dev server's policy is not the
 *           packaged one. This is the one assertion that requires WDIO.
 *
 * SESSION + API DOUBLES. Reuses `wdio/helpers/cloudSession.ts` (the shared Cloud
 * scaffolding: Tauri-side device authorization + a `window.fetch` stub for the
 * managed API) and layers ONE artifact-specific overlay on top of it, for the
 * two routes that helper deliberately does not model — assistant-message
 * persistence and per-turn completion content. The overlay delegates everything
 * else back to whatever `fetch` it wrapped, so it cannot silently shadow the
 * shared stub's contract-shaped responses.
 *
 * DO NOT relax any CSP, and do not add `allow-same-origin` to an artifact
 * preview, to make the DES-C15 assertion take its happy path. A preview that
 * cannot run scripts is a finding to report, not a test to bend.
 */

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

/** Mirrors MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH in @agiworkforce/cloud-contracts. */
const MAX_METADATA_LENGTH = 32_000;

/**
 * Artifact-specific overlay over the shared cloud stub.
 *
 * Handles exactly three things the shared helper does not:
 *   - POST /api/chat/conversations            → conversation creation
 *   - POST /api/chat/conversations/:id/messages → message save, enforcing the
 *     SAME 32 000-char metadata cap the server enforces, so a client that still
 *     routes artifact bytes through metadata fails here exactly as in production
 *   - GET  /api/chat/conversations(/:id)      → the saved turns, served back on
 *     reopen
 *   - POST /api/llm/v1/chat/completions       → an SSE stream of staged content
 *
 * Saved messages live in `localStorage`, not in this closure, so a
 * `browser.refresh()` models a restart against a backend that still holds the
 * turn — which is precisely what the 400 used to destroy.
 */
function installArtifactCloudOverlay(conversationId: string, title: string): void {
  const STORE_KEY = '__wdioArtifactStoredMessages';
  const CALLS_KEY = '__wdioArtifactCalls';
  const scope = window as unknown as Record<string, unknown>;

  // Wrap whatever fetch is currently installed (the shared cloud stub), never
  // the pristine one — otherwise this overlay would silently drop /api/me.
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

/** Stages the assistant content the next mocked completion streams back. */
async function stageCompletion(content: string): Promise<void> {
  await browser.execute((staged: string) => {
    (window as unknown as Record<string, unknown>)['__wdioStagedCompletion'] = staged;
  }, content);
}

/** Reinstalls both in-webview stubs. Required after every page load. */
async function installWebviewStubs(): Promise<void> {
  await installCloudApiStubs({ completions: 'ok' });
  await browser.execute(installArtifactCloudOverlay, CONVERSATION_ID, CONVERSATION_TITLE);
}

/**
 * Boot into Cloud mode with a signed-in mocked session.
 *
 * Two mock layers with different lifetimes: `browser.tauri.mock` intercepts in
 * the Rust host and survives a reload, while the `window.fetch` stubs live in
 * the webview and do not. So every load reinstalls the fetch stubs and, if the
 * device sign-in card is showing, re-completes the mocked device flow.
 */
async function enterMockedCloudMode(): Promise<void> {
  await writePersistedAppMode({ mode: 'cloud', hasSelectedMode: true, hasOnboarded: true });
  await browser.refresh();
  await installWebviewStubs();

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

/** Every assistant-message save the client issued, with its measured sizes. */
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
      // A previous run's persisted turns would make the first assertion pass
      // for the wrong reason.
      localStorage.removeItem('__wdioArtifactStoredMessages');
    });
    await enterMockedCloudMode();
  });

  after(async () => {
    // Specs share ONE app-data profile and only `onPrepare` wipes it, so a spec
    // that leaves Cloud selected boots the next file into AuthPage (DES-C13).
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

    // The transcript renders an artifact card, not a raw code block.
    const card = await $('[data-testid="message-artifacts"]');
    await card.waitForDisplayed({ timeout: 90_000 });
    expect(await card.getText()).toContain('Pricing');

    // The fenced block is lifted out of the body so the answer is not duplicated.
    const assistantRow = await $$('[data-message-row="assistant"]');
    const transcript = await assistantRow[assistantRow.length - 1]!.getText();
    expect(transcript).toContain('Tell me what to change.');
    expect(transcript).not.toContain('<!DOCTYPE html>');

    // The conversation header advertises the artifact, with a count.
    const artifactsToggle = await $('button[aria-label^="Toggle artifacts panel"]');
    await artifactsToggle.waitForDisplayed({ timeout: 30_000 });
    expect(await artifactsToggle.getAttribute('aria-label')).toContain('(1)');

    // Opening the card opens the panel with a live preview.
    await card.click();
    const preview = await $('[data-testid="artifact-panel-html-preview"]');
    await preview.waitForDisplayed({ timeout: 30_000 });
    await browser.saveScreenshot('/tmp/agi-desktop-cloud-artifact-open.png');
  });

  it('DES-C06 · a >32KB artifact still saves the turn, and it survives a reload', async function () {
    this.timeout(240_000);

    // ~48 KB of HTML: over the 32 000-char metadata cap, under the 100 000-char
    // message-content cap. Exactly the size class that used to 400 the save and
    // take the whole assistant turn with it.
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

    // The save that went out fit the server budget — proving the CLIENT-side
    // guard ran, not that the double happened to be lenient.
    const saves = await assistantSaves();
    expect(saves.length).toBeGreaterThan(0);
    for (const save of saves) {
      expect(save.metadataLength).toBeLessThanOrEqual(MAX_METADATA_LENGTH);
    }
    // The artifact bytes travel in the message body, which has its own 100k cap.
    expect(saves[saves.length - 1]!.contentLength).toBeGreaterThan(MAX_METADATA_LENGTH);

    // Reload and reopen. The double keeps its persisted turns in localStorage,
    // so this is a restart against a backend that still holds the message.
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
          'The large-artifact assistant turn did not survive the reload — the metadata ' +
          'budget guard did not prevent the 400 that discards the whole turn.',
      },
    );

    // And the artifact comes back with it, re-derived from the message body
    // rather than restored from metadata that no longer carries it.
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

    // The capability probe (`packages/ui/unified-chat/src/lib/artifact-preview-capability.ts`)
    // measures whether a same-document preview may run scripts under the CSP
    // this packaged binary actually ships. Both outcomes are legitimate; a
    // preview that silently renders nothing and explains nothing is not.
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
      // Packaged-CSP path: the inherited `script-src 'self' 'wasm-unsafe-eval'`
      // wins over the artifact's own meta policy, so the page is inert. The user
      // must be told why, in words. Delete this branch once the dedicated
      // artifact URI-scheme origin lands (the remaining half of DES-C15).
      expect(await notice.getText()).toContain('security policy');
      await browser.saveScreenshot('/tmp/agi-desktop-cloud-artifact-scripts-blocked.png');
      return;
    }

    // Scripts are permitted here, so the mutated DOM must actually be visible
    // INSIDE the preview iframe. Only the native binary can settle this — jsdom
    // has no CSP engine and no real iframe navigation.
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
