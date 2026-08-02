/**
 * Desktop Cloud chat turn — the demo spine, on the real Tauri binary.
 *
 * Covers, against the shipping renderer (not a vite-served DOM):
 *   DES-C03  the outbound completions body never carries `thinking_mode: false`
 *            for a model whose catalog entry sets
 *            `reasoning.canDisableThinking: false` (the route answers that with
 *            a 422 `invalid_thinking_configuration` before any generation).
 *   DES-C24  `assistant_message_id` is present (server-side durability net).
 *   DES-C25  `client_timezone` is present and IANA-valid.
 *   DES-C04  a completed turn exposes a Retry that re-issues a completion, and
 *            a mid-stream failure exposes a working Retry rather than a blank
 *            bubble.
 *
 * HOW THE CLOUD SESSION IS OBTAINED WITHOUT A HUMAN
 * The native binary cannot use the dev-browser session seed (`isLocalDevBrowser`
 * is false under Tauri) and `unified-auth-storage` deliberately persists no
 * token — the session is revalidated from the native credential vault on every
 * launch. So this spec mocks the four Tauri commands the device flow actually
 * invokes (`apps/desktop/src/services/cloudAccountAuth.ts` `authorizeCloudAccount`)
 * and answers the app's own `window.fetch` for the managed-cloud origin. No
 * real account, no real network, no reload race: the fetch stub is installed
 * BEFORE sign-in starts, so every request the session makes is already covered.
 *
 * Model ids and reasoning contracts are read from the shared registry at run
 * time — never hardcoded here.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const WEB_ORIGIN = 'https://agiworkforce.com';
const ACCOUNT_ID = 'wdio-cloud-user';

/**
 * The model registry is the source of truth (see the repo rule: never invent or
 * hardcode a model id). Read the catalog JSON directly rather than importing
 * `@agiworkforce/types` — the wdio runner loads specs, not the whole workspace
 * TS graph.
 */
// Specs load as ESM (no __dirname); wdio runs from apps/desktop — same
// assumption wdio.conf.ts's onPrepare already relies on.
const MODELS_JSON_PATH = path.resolve(
  process.cwd(),
  '../../packages/contracts/types/src/models.json',
);

interface CatalogModel {
  id: string;
  name: string;
  availability?: string;
  reasoning?: { canDisableThinking?: boolean };
}

/** A live catalog model that cannot disable thinking — the DES-C03 case. */
const alwaysOnModel = (() => {
  const catalog = JSON.parse(fs.readFileSync(MODELS_JSON_PATH, 'utf8')) as {
    models: Record<string, CatalogModel>;
  };
  const match = Object.values(catalog.models).find(
    (model) =>
      model.reasoning?.canDisableThinking === false && (model.availability ?? 'live') === 'live',
  );
  if (!match) {
    throw new Error(
      'No live catalog model declares reasoning.canDisableThinking === false; ' +
        `update this spec against ${MODELS_JSON_PATH}.`,
    );
  }
  return { id: match.id, name: match.name };
})();

interface CapturedRequest {
  url: string;
  method: string;
  body: string | null;
  authorization: string | null;
}

/**
 * Installs a fetch stub over the managed-cloud origin.
 *
 * Records every request and answers the endpoints a Cloud session touches.
 * `mode` selects the completions behaviour: a clean SSE turn, or a stream that
 * commits a 200 and then fails mid-flight (`x_stream_error`), which is exactly
 * the case DES-C04's Retry has to recover from.
 */
async function installCloudFetchStub(mode: 'ok' | 'midstream-error'): Promise<void> {
  await browser.execute(
    (origin: string, userId: string, streamMode: string) => {
      const win = window as unknown as {
        fetch: typeof fetch;
        __agiRealFetch?: typeof fetch;
        __agiCloudRequests?: CapturedRequest[];
        __agiStreamMode?: string;
      };
      win.__agiStreamMode = streamMode;
      win.__agiCloudRequests = win.__agiCloudRequests ?? [];
      if (win.__agiRealFetch) return;
      win.__agiRealFetch = win.fetch.bind(window);

      const json = (payload: unknown, status = 200): Response =>
        new Response(JSON.stringify(payload), {
          status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });

      const sse = (lines: string[]): Response => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            for (const line of lines) controller.enqueue(encoder.encode(line));
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Access-Control-Allow-Origin': '*',
          },
        });
      };

      const chunk = (text: string) =>
        `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;

      win.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const rawUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : (input as Request).url;
        const url = new URL(rawUrl, window.location.href);
        if (url.origin !== new URL(origin).origin) {
          return win.__agiRealFetch!(input as RequestInfo, init);
        }

        const headers = new Headers(init?.headers ?? {});
        win.__agiCloudRequests!.push({
          url: url.toString(),
          method: (init?.method ?? 'GET').toUpperCase(),
          body: typeof init?.body === 'string' ? init.body : null,
          authorization: headers.get('authorization'),
        });

        const path = url.pathname;

        if (path === '/api/me') {
          return json({
            id: userId,
            email: 'wdio@agiworkforce.test',
            name: 'WDIO Cloud User',
            avatar_url: null,
            created_at: null,
            updated_at: Math.floor(Date.now() / 1000),
            plan: {
              tier: 'max',
              display_name: 'Max',
              status: 'active',
              current_period_end: null,
            },
            feature_flags: { advanced_model_access: true, code_execution: true },
            routing_preferences: {},
          });
        }

        if (path.startsWith('/api/chat/conversations')) {
          if (path === '/api/chat/conversations') {
            if ((init?.method ?? 'GET').toUpperCase() === 'POST') {
              const payload = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
              return json({
                conversation: {
                  id: payload['id'],
                  title: payload['title'] ?? 'New chat',
                  model: payload['model'] ?? 'auto',
                  projectId: null,
                  pinned: false,
                  starred: false,
                  archived: false,
                  isTemporary: false,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              });
            }
            return json({ conversations: [], hasMore: false, nextOffset: 0 });
          }
          // Message create / delete / single-conversation read.
          if ((init?.method ?? 'GET').toUpperCase() === 'DELETE') {
            return json({ success: true });
          }
          if ((init?.method ?? 'GET').toUpperCase() === 'POST') {
            const payload = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
            return json({ message: { id: payload['id'] } });
          }
          return json({
            conversation: {
              id: path.split('/')[4],
              title: 'New chat',
              model: 'auto',
              projectId: null,
              pinned: false,
              starred: false,
              archived: false,
              isTemporary: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            messages: [],
            total: 0,
            hasMore: false,
          });
        }

        if (path.startsWith('/api/llm/v1/chat/completions')) {
          if (win.__agiStreamMode === 'midstream-error') {
            return sse([
              chunk('Partial answer'),
              `data: ${JSON.stringify({
                choices: [
                  {
                    delta: {
                      x_stream_error: {
                        message: 'The model connection dropped mid-response.',
                        retryable: true,
                      },
                    },
                  },
                ],
              })}\n\n`,
              'data: [DONE]\n\n',
            ]);
          }
          return sse([chunk('Cloud reply for the demo.'), 'data: [DONE]\n\n']);
        }

        if (path.startsWith('/api/projects')) {
          return json({ projects: [] });
        }
        if (path.startsWith('/api/settings/sync')) {
          return json({ settings: {}, updatedAt: null });
        }
        if (path.startsWith('/api/usage')) {
          return json({ credits: { balanceCents: 1_000_00 } });
        }

        // Anything else on our cloud origin: succeed emptily rather than
        // letting a real request escape the harness.
        return json({});
      };
    },
    WEB_ORIGIN,
    ACCOUNT_ID,
    mode,
  );
}

async function setStreamMode(mode: 'ok' | 'midstream-error'): Promise<void> {
  await browser.execute((next: string) => {
    (window as unknown as { __agiStreamMode?: string }).__agiStreamMode = next;
  }, mode);
}

async function readCapturedRequests(): Promise<CapturedRequest[]> {
  return browser.execute(
    () =>
      (window as unknown as { __agiCloudRequests?: CapturedRequest[] }).__agiCloudRequests ?? [],
  ) as Promise<CapturedRequest[]>;
}

async function clearCapturedRequests(): Promise<void> {
  await browser.execute(() => {
    (window as unknown as { __agiCloudRequests?: CapturedRequest[] }).__agiCloudRequests = [];
  });
}

function completionBodies(requests: CapturedRequest[]): Record<string, unknown>[] {
  return requests
    .filter((request) => request.url.includes('/api/llm/v1/chat/completions') && request.body)
    .map((request) => JSON.parse(String(request.body)) as Record<string, unknown>);
}

/** Mocks the four Tauri commands the in-app device sign-in actually invokes. */
async function mockApprovedDeviceSignIn(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  const accessToken = [
    encode({ alg: 'none', typ: 'JWT' }),
    encode({ sub: ACCOUNT_ID, email: '', iat: now, exp: now + 3600 }),
    'wdio',
  ].join('.');

  const storeBase = await browser.tauri.mock('account_store_api_base_url');
  await storeBase.mockReturnValue(null);
  const storeAccess = await browser.tauri.mock('account_store_access_token');
  await storeAccess.mockReturnValue(null);
  const storeRefresh = await browser.tauri.mock('account_store_refresh_token');
  await storeRefresh.mockReturnValue(null);

  const startAuth = await browser.tauri.mock('account_start_device_authorization');
  await startAuth.mockReturnValue({
    status: 200,
    body: JSON.stringify({
      device_code: 'wdio-device-code',
      user_code: 'WDIO-CODE',
      verification_uri: `${WEB_ORIGIN}/auth/device`,
      // Same origin as WEB_APP_URL — requestDeviceAuthorization rejects any other.
      verification_uri_complete: `${WEB_ORIGIN}/auth/device?user_code=WDIO-CODE&surface=desktop`,
      interval: 1,
      expires_in: 300,
    }),
  });

  const pollAuth = await browser.tauri.mock('account_poll_device_authorization');
  await pollAuth.mockReturnValue({
    status: 200,
    body: JSON.stringify({
      access_token: accessToken,
      refresh_token: 'wdio-refresh-token',
      token_type: 'Bearer',
      expires_in: 3600,
    }),
  });
}

async function enterCloudModeSignedIn(): Promise<void> {
  await browser.waitUntil(
    async () =>
      (await $('button[role="tab"]=Cloud').isExisting()) ||
      (await $('button=Use Local Mode').isExisting()),
    { timeout: 60_000, interval: 500, timeoutMsg: 'Desktop shell never finished loading' },
  );

  const cloudTab = await $('button[role="tab"]=Cloud');
  await cloudTab.waitForDisplayed({ timeout: 20_000 });
  await cloudTab.click();

  const signIn = await $('button=Sign in to AGI Cloud');
  await signIn.waitForDisplayed({ timeout: 20_000 });
  await signIn.click();

  // The mocked device flow approves on the first poll (interval clamps to the
  // 3s floor in requestDeviceAuthorization), then /api/me resolves off the stub.
  const composer = await $('textarea[aria-label="Chat message input"]');
  await composer.waitForDisplayed({ timeout: 60_000 });
}

/**
 * Selects `modelName` in the composer's model popover, expanding every
 * collapsed provider group first.
 */
async function selectComposerModel(modelName: string): Promise<void> {
  const trigger = await $('button[aria-label="Select model"]');
  await trigger.waitForDisplayed({ timeout: 20_000 });
  await trigger.click();

  // Scope every popover query to the portalled Radix content: the trigger
  // itself renders the selected model's name, so an unscoped text match would
  // hit the trigger (closing the popover) instead of the option.
  const popover = await $('[data-radix-popper-content-wrapper]');
  await popover.waitForDisplayed({ timeout: 10_000 });

  // Provider groups can start collapsed; expand them all before looking.
  const groupHeaders = await popover.$$('button[aria-expanded="false"]');
  for (const header of groupHeaders) {
    if (await header.isDisplayed()) await header.click();
  }

  const option = await popover.$(`button*=${modelName}`);
  await option.waitForDisplayed({ timeout: 10_000 });
  await option.click();

  await browser.waitUntil(
    async () => !(await $('[data-radix-popper-content-wrapper]').isExisting()),
    {
      timeout: 10_000,
      interval: 250,
      timeoutMsg: 'Model popover did not close after selecting a model',
    },
  );
  expect(await $('button[aria-label="Select model"]').getText()).toContain(modelName);
}

async function sendTurn(text: string): Promise<void> {
  const composer = await $('textarea[aria-label="Chat message input"]');
  await composer.waitForDisplayed({ timeout: 20_000 });
  await composer.click();
  await composer.addValue(text);

  const send = await $('button[aria-label*="Send message ("]');
  await send.waitForDisplayed({ timeout: 10_000 });
  await send.click();
}

describe('AGI Desktop Cloud chat turn', () => {
  before(async function () {
    this.timeout(180_000);
    await browser.pause(1_500);
    await installCloudFetchStub('ok');
    await mockApprovedDeviceSignIn();
    await enterCloudModeSignedIn();
  });

  after(async () => {
    await browser.tauri.restoreAllMocks();
    // Leave the shared wdio profile in Local mode so the next spec file does
    // not boot into the Cloud auth screen.
    const localReturn = await $('button[role="tab"]=Local');
    if (await localReturn.isExisting()) await localReturn.click();
  });

  it('sends a body the completions route accepts for an always-on reasoning model', async function () {
    this.timeout(180_000);
    await setStreamMode('ok');
    await clearCapturedRequests();
    await selectComposerModel(alwaysOnModel.name);
    await sendTurn('Give me one sentence for the demo.');

    const assistant = await $('[data-role="assistant"]');
    await assistant.waitForDisplayed({ timeout: 60_000 });

    await browser.waitUntil(async () => completionBodies(await readCapturedRequests()).length > 0, {
      timeout: 30_000,
      interval: 250,
      timeoutMsg: 'No completions request was captured',
    });

    const [body] = completionBodies(await readCapturedRequests());
    expect(body).toBeDefined();
    expect(body!['model']).toBe(alwaysOnModel.id);

    // DES-C03: the 422 trigger. Either the field is absent or it is true —
    // `false` is the exact value the route refuses for this model.
    expect(body!['thinking_mode']).not.toBe(false);

    // DES-C24 / DES-C25.
    expect(typeof body!['assistant_message_id']).toBe('string');
    expect(String(body!['assistant_message_id'])).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    const timeZone = body!['client_timezone'];
    expect(typeof timeZone).toBe('string');
    expect(String(timeZone).length).toBeLessThanOrEqual(64);
    expect(Intl.supportedValuesOf('timeZone')).toContain(String(timeZone));

    // The turn rendered a reply, not an error bubble.
    expect(await assistant.getText()).toContain('Cloud reply');
  });

  it('exposes a Retry on a completed assistant turn that re-issues a completion', async function () {
    this.timeout(180_000);
    const retry = await $('[data-role="assistant"] button[aria-label="Retry"]');
    await retry.waitForDisplayed({ timeout: 20_000 });

    await clearCapturedRequests();
    await retry.click();

    await browser.waitUntil(async () => completionBodies(await readCapturedRequests()).length > 0, {
      timeout: 30_000,
      interval: 250,
      timeoutMsg: 'Retry did not re-issue a completions request',
    });

    // The replacement re-sends the SAME prompt, and only after it runs are the
    // superseded durable rows dropped.
    const requests = await readCapturedRequests();
    const [replay] = completionBodies(requests);
    const messages = (replay!['messages'] ?? []) as Array<{ role: string; content: unknown }>;
    expect(messages.some((message) => message.role === 'user')).toBe(true);
    await browser.waitUntil(
      async () =>
        (await readCapturedRequests()).some(
          (request) =>
            request.method === 'DELETE' && request.url.includes('/api/chat/conversations/'),
        ),
      {
        timeout: 30_000,
        interval: 250,
        timeoutMsg: 'Regenerate never deleted the superseded durable rows',
      },
    );
  });

  it('renders a working Retry when the stream fails mid-response', async function () {
    this.timeout(180_000);
    await setStreamMode('midstream-error');
    await clearCapturedRequests();
    await sendTurn('Now fail mid-stream.');

    // The "Response may be incomplete" notice owns the mid-stream Retry.
    const notice = await $('button[aria-label="Regenerate this response"]');
    await notice.waitForDisplayed({ timeout: 60_000 });

    await setStreamMode('ok');
    await clearCapturedRequests();
    await notice.click();

    await browser.waitUntil(async () => completionBodies(await readCapturedRequests()).length > 0, {
      timeout: 30_000,
      interval: 250,
      timeoutMsg: 'Mid-stream Retry did not re-issue a completions request',
    });

    await browser.waitUntil(
      async () => !(await $('button[aria-label="Regenerate this response"]').isExisting()),
      {
        timeout: 60_000,
        interval: 500,
        timeoutMsg: 'The incomplete-response notice survived a successful retry',
      },
    );
  });
});
