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
 * through the shared Cloud-session helper and answers the app's own
 * `window.fetch` for the managed-cloud origin. No real account, no real
 * network, no reload race: the fetch stub is installed BEFORE sign-in starts,
 * so every request the session makes is already covered.
 *
 * Model ids and reasoning contracts are read from the shared registry at run
 * time — never hardcoded here.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  completeMockedDeviceSignIn,
  mockDeviceAuthorization,
  restoreLocalModeProfile,
} from '../helpers/cloudSession';

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
  provider: string;
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
  return { id: match.id, name: match.name, provider: match.provider };
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
    (userId: string, streamMode: string, discoveredModel: CatalogModel) => {
      const win = window as unknown as {
        fetch: typeof fetch;
        __agiRealFetch?: typeof fetch;
        __agiCloudRequests?: CapturedRequest[];
        __agiStreamMode?: string;
        __agiWdioCloudOrigin?: string;
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

      const conversationWire = (
        id: unknown,
        title: unknown = 'New chat',
        model: unknown = 'auto',
      ) => {
        const now = new Date().toISOString();
        return {
          id,
          title,
          model,
          project_id: null,
          pinned: false,
          starred: false,
          archived: false,
          is_temporary: false,
          created_at: now,
          updated_at: now,
        };
      };

      win.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const rawUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : (input as Request).url;
        const url = new URL(rawUrl, window.location.href);
        // mockDeviceAuthorization learns the canonical WEB_APP_URL from the
        // app's real `account_store_api_base_url` call. Match that value at
        // request time so this test follows Vite env resolution instead of
        // duplicating a production or localhost origin in Node.
        if (
          typeof win.__agiWdioCloudOrigin !== 'string' ||
          url.origin !== win.__agiWdioCloudOrigin
        ) {
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

        if (path === '/api/models') {
          return json({
            models: [
              {
                id: discoveredModel.id,
                name: discoveredModel.name,
                provider: discoveredModel.provider,
              },
            ],
          });
        }

        if (path.startsWith('/api/chat/conversations')) {
          if (path === '/api/chat/conversations') {
            if ((init?.method ?? 'GET').toUpperCase() === 'POST') {
              const payload = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
              return json({
                conversation: conversationWire(payload['id'], payload['title'], payload['model']),
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
          if ((init?.method ?? 'GET').toUpperCase() === 'PUT') {
            const payload = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
            return json({
              conversation: conversationWire(
                path.split('/')[4],
                payload['title'],
                payload['model'],
              ),
            });
          }
          return json({
            conversation: conversationWire(path.split('/')[4]),
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
    ACCOUNT_ID,
    mode,
    alwaysOnModel,
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

async function enterCloudModeSignedIn(): Promise<void> {
  await browser.waitUntil(
    async () =>
      (await $('button[role="tab"]=Cloud').isExisting()) ||
      (await $('button=Use Local Mode').isExisting()),
    { timeout: 60_000, interval: 500, timeoutMsg: 'Desktop shell never finished loading' },
  );

  // A prior interrupted Cloud journey can leave the isolated profile on the
  // signed-out Cloud surface. Normalize through the product's own Local-mode
  // action before looking for the shell tab strip.
  const useLocalMode = await $('button=Use Local Mode');
  if (await useLocalMode.isExisting()) {
    await useLocalMode.click();
  }

  const cloudTab = await $('button[role="tab"]=Cloud');
  await cloudTab.waitForDisplayed({ timeout: 20_000 });
  await cloudTab.click();

  // Native email/password sign-in is primary. This journey deliberately uses
  // the explicit browser fallback because its approval boundary is mocked.
  await completeMockedDeviceSignIn();

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
  await browser.waitUntil(async () => (await trigger.getText()).trim() !== 'Select model', {
    timeout: 30_000,
    interval: 250,
    timeoutMsg: 'Cloud model discovery never populated the composer picker',
  });
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

  // The embedded WebKit driver reports portalled Radix descendants as hidden
  // even while their containing popover is visibly rendered. Resolve the
  // button inside the already-verified visible popover and dispatch its normal
  // DOM click so the React selection handler still owns the state change.
  const selected = await browser.execute(
    (root: Element, expectedName: string) => {
      const option = Array.from(root.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes(expectedName),
      );
      if (!option) return false;
      option.click();
      return true;
    },
    popover,
    modelName,
  );
  if (!selected) {
    throw new Error(`Cloud model picker did not contain ${modelName}.`);
  }

  await browser.waitUntil(
    async () => (await $('button[aria-label="Select model"]').getText()).includes(modelName),
    {
      timeout: 10_000,
      interval: 250,
      timeoutMsg: `Composer did not select ${modelName}`,
    },
  );

  // A programmatic click preserves the component's selection handler but the
  // embedded WebKit provider does not deliver Radix's dismissable-layer event.
  // Close the still-open popover through its real trigger before interacting
  // with the composer underneath it.
  if ((await trigger.getAttribute('data-state')) === 'open') {
    await trigger.click();
  }
  await browser.waitUntil(async () => (await trigger.getAttribute('data-state')) !== 'open', {
    timeout: 10_000,
    interval: 250,
    timeoutMsg: 'Model popover did not close before composing a message',
  });
}

async function sendTurn(text: string): Promise<void> {
  const composer = await $('textarea[aria-label="Chat message input"]');
  await composer.waitForDisplayed({ timeout: 20_000 });
  await composer.click();
  await composer.addValue(text);

  const send = await $('button[aria-label*="Send message ("]');
  await send.waitForDisplayed({ timeout: 10_000 });
  try {
    await send.waitForEnabled({ timeout: 10_000 });
  } catch {
    throw new Error(
      `Cloud composer did not enable Send (draft=${JSON.stringify(
        await composer.getValue(),
      )}, model=${JSON.stringify(await $('button[aria-label="Select model"]').getText())}).`,
    );
  }
  await send.click();
  await browser.waitUntil(async () => (await composer.getValue()) === '', {
    timeout: 10_000,
    interval: 250,
    timeoutMsg: 'Cloud composer did not consume the draft after Send',
  });
}

describe('AGI Desktop Cloud chat turn', () => {
  before(async function () {
    this.timeout(180_000);
    await browser.pause(1_500);
    await installCloudFetchStub('ok');
    await mockDeviceAuthorization({ subject: ACCOUNT_ID });
    await enterCloudModeSignedIn();
  });

  after(async () => {
    // Leave the shared wdio profile in Local mode so the next spec file does
    // not boot into the Cloud auth screen, even when a before/test assertion
    // failed while the signed-out Cloud surface was mounted.
    await restoreLocalModeProfile();
  });

  it('sends a body the completions route accepts for an always-on reasoning model', async function () {
    this.timeout(180_000);
    await setStreamMode('ok');
    await clearCapturedRequests();
    await selectComposerModel(alwaysOnModel.name);
    await sendTurn('Give me one sentence for the demo.');

    try {
      await browser.waitUntil(
        async () => completionBodies(await readCapturedRequests()).length > 0,
        {
          timeout: 30_000,
          interval: 250,
          timeoutMsg: 'No completions request was captured',
        },
      );
    } catch (error) {
      const requests = await readCapturedRequests();
      const ui = await browser.execute(() => ({
        userTurns: document.querySelectorAll('[data-role="user"]').length,
        assistantTurns: document.querySelectorAll('[data-role="assistant"]').length,
        alerts: Array.from(document.querySelectorAll('[data-sonner-toast], [role="alert"]'))
          .map((node) => (node.textContent ?? '').trim())
          .filter(Boolean),
      }));
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}; captured ${JSON.stringify(
          requests.map(({ url, method }) => ({ url, method })),
        )}; ui ${JSON.stringify(ui)}`,
      );
    }

    const assistant = await $('[data-role="assistant"]');
    await assistant.waitForDisplayed({ timeout: 60_000 });

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
