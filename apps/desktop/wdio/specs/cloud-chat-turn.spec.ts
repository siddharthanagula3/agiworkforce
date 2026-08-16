import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  completeMockedDeviceSignIn,
  mockDeviceAuthorization,
  restoreLocalModeProfile,
} from '../helpers/cloudSession';

const ACCOUNT_ID = 'wdio-cloud-user';

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

  const useLocalMode = await $('button=Use Local Mode');
  if (await useLocalMode.isExisting()) {
    await useLocalMode.click();
  }

  const cloudTab = await $('button[role="tab"]=Cloud');
  await cloudTab.waitForDisplayed({ timeout: 20_000 });
  await cloudTab.click();

  await completeMockedDeviceSignIn();

  const composer = await $('textarea[aria-label="Chat message input"]');
  await composer.waitForDisplayed({ timeout: 60_000 });
}

async function selectComposerModel(modelName: string): Promise<void> {
  const trigger = await $('button[aria-label="Select model"]');
  await trigger.waitForDisplayed({ timeout: 20_000 });
  await browser.waitUntil(async () => (await trigger.getText()).trim() !== 'Select model', {
    timeout: 30_000,
    interval: 250,
    timeoutMsg: 'Cloud model discovery never populated the composer picker',
  });
  await trigger.click();

  const popover = await $('[data-radix-popper-content-wrapper]');
  await popover.waitForDisplayed({ timeout: 10_000 });

  const groupHeaders = await popover.$$('button[aria-expanded="false"]');
  for (const header of groupHeaders) {
    if (await header.isDisplayed()) await header.click();
  }

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

    expect(body!['thinking_mode']).not.toBe(false);

    expect(typeof body!['assistant_message_id']).toBe('string');
    expect(String(body!['assistant_message_id'])).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    const timeZone = body!['client_timezone'];
    expect(typeof timeZone).toBe('string');
    expect(String(timeZone).length).toBeLessThanOrEqual(64);
    expect(Intl.supportedValuesOf('timeZone')).toContain(String(timeZone));

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
