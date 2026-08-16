
export type StubBehavior = 'ok' | 'server-error';

export interface CloudApiStubOptions {
  me?: StubBehavior;
  models?: StubBehavior;
  conversations?: StubBehavior;
  projects?: StubBehavior;
  completions?: StubBehavior | 'stall';
}

const APP_MODE_STORAGE_KEY = 'app-mode-store';

export const CLOUD_SIGN_IN_HEADING_SELECTOR = 'h1=Sign in to AGI Cloud';
export const CLOUD_BROWSER_FALLBACK_SELECTOR = 'button=Sign in through your browser instead';

export async function installCloudApiStubs(options: CloudApiStubOptions = {}): Promise<void> {
  await browser.execute((opts: CloudApiStubOptions) => {
    const scope = window as unknown as Record<string, unknown>;
    if (!scope['__agiOriginalFetch']) {
      scope['__agiOriginalFetch'] = window.fetch.bind(window);
    }
    const originalFetch = scope['__agiOriginalFetch'] as typeof fetch;
    scope['__agiCloudStubOptions'] = opts;
    scope['__agiCloudStubCalls'] = [] as string[];

    const jsonResponse = (body: unknown, status = 200): Response =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

    const nowSeconds = () => Math.floor(Date.now() / 1000);

    window.fetch = function stubbedFetch(
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
        // Keep the raw value; the prefix test below simply will not match.
      }

      if (!pathname.startsWith('/api/')) {
        return originalFetch(input as RequestInfo, init);
      }

      const stub = scope['__agiCloudStubOptions'] as CloudApiStubOptions;
      (scope['__agiCloudStubCalls'] as string[]).push(pathname);

      const unavailable = (what: string) =>
        Promise.resolve(jsonResponse({ error: `${what} is temporarily unavailable` }, 503));

      if (pathname === '/api/me') {
        if (stub.me === 'server-error') return unavailable('account');
        return Promise.resolve(
          jsonResponse({
            id: 'user_wdio',
            email: 'wdio@example.com',
            name: 'WDIO Device',
            avatar_url: null,
            created_at: null,
            updated_at: nowSeconds(),
            plan: {
              tier: 'free',
              display_name: 'Free',
              status: 'none',
              current_period_end: null,
            },
            feature_flags: { advanced_model_access: false },
            routing_preferences: {},
          }),
        );
      }

      if (pathname === '/api/models') {
        if (stub.models === 'server-error') return unavailable('model catalog');
        return Promise.resolve(jsonResponse({ models: [] }));
      }

      if (pathname.startsWith('/api/chat/conversations')) {
        if (stub.conversations === 'server-error') return unavailable('conversation list');
        return Promise.resolve(jsonResponse({ conversations: [], hasMore: false, nextOffset: 0 }));
      }

      if (pathname.startsWith('/api/projects')) {
        if (stub.projects === 'server-error') return unavailable('project list');
        return Promise.resolve(jsonResponse({ projects: [] }));
      }

      if (pathname.startsWith('/api/llm/v1/chat/completions')) {
        if (stub.completions === 'server-error') return unavailable('chat completions');
        if (stub.completions === 'stall') {
          const encoder = new TextEncoder();
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    id: 'chatcmpl-wdio',
                    object: 'chat.completion.chunk',
                    choices: [{ index: 0, delta: { role: 'assistant', content: '' } }],
                  })}\n\n`,
                ),
              );
              // Deliberately no `[DONE]` and no close().
            },
          });
          return Promise.resolve(
            new Response(body, {
              status: 200,
              headers: { 'Content-Type': 'text/event-stream' },
            }),
          );
        }
      }

      if (pathname === '/api/auth/logout') {
        return Promise.resolve(jsonResponse({ ok: true }));
      }

      return Promise.resolve(jsonResponse({ error: `unstubbed endpoint ${pathname}` }, 404));
    } as typeof fetch;
  }, options);
}

export async function removeCloudApiStubs(): Promise<void> {
  await browser.execute(() => {
    const scope = window as unknown as Record<string, unknown>;
    const originalFetch = scope['__agiOriginalFetch'] as typeof fetch | undefined;
    if (originalFetch) {
      window.fetch = originalFetch;
      delete scope['__agiOriginalFetch'];
    }
    delete scope['__agiCloudStubOptions'];
    delete scope['__agiCloudStubCalls'];
  });
}

export function recordedCloudApiCalls(): Promise<string[]> {
  return browser.execute(() => {
    const scope = window as unknown as Record<string, unknown>;
    return (scope['__agiCloudStubCalls'] as string[] | undefined) ?? [];
  }) as Promise<string[]>;
}

function fakeDeviceJwt(subject: string, lifetimeSeconds: number): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  const issuedAt = Math.floor(Date.now() / 1000);
  return [
    encode({ alg: 'none', typ: 'JWT' }),
    encode({
      sub: subject,
      email: 'wdio@example.com',
      name: 'WDIO Device',
      iat: issuedAt,
      exp: issuedAt + lifetimeSeconds,
    }),
    'wdio-not-a-signature',
  ].join('.');
}

export interface DeviceAuthorizationMockOptions {
  subject?: string;
  lifetimeSeconds?: number;
  hangCreditsFetch?: boolean;
}

const DEVICE_AUTH_MOCKED_COMMANDS = [
  'account_store_api_base_url',
  'account_start_device_authorization',
  'account_poll_device_authorization',
];

async function missingPageMocks(commands: string[]): Promise<string[]> {
  return browser.execute((names: string[]) => {
    const mocks =
      (window as unknown as { __wdio_mocks__?: Record<string, unknown> }).__wdio_mocks__ ?? {};
    return names.filter((name) => typeof mocks[name] !== 'function');
  }, commands);
}

export async function mockDeviceAuthorization(
  options: DeviceAuthorizationMockOptions = {},
): Promise<void> {
  await registerDeviceAuthorizationMocks(options);

  let missing = await missingPageMocks(DEVICE_AUTH_MOCKED_COMMANDS);
  if (missing.length > 0) {
    await browser.tauri.restoreAllMocks().catch(() => {});
    await registerDeviceAuthorizationMocks(options);
    missing = await missingPageMocks(DEVICE_AUTH_MOCKED_COMMANDS);
  }
  if (missing.length > 0) {
    throw new Error(
      `Device-authorization mocks never reached the page seam (missing: ${missing.join(', ')}). ` +
        'Driving sign-in now would perform REAL device authorization.',
    );
  }
}

async function registerDeviceAuthorizationMocks(
  options: DeviceAuthorizationMockOptions = {},
): Promise<void> {
  const subject = options.subject ?? 'user_wdio';
  const lifetimeSeconds = options.lifetimeSeconds ?? 3600;
  const accessToken = fakeDeviceJwt(subject, lifetimeSeconds);
  const refreshToken = `wdio-refresh-${subject}`;

  const apiBaseUrlMock = await browser.tauri.mock('account_store_api_base_url');
  await apiBaseUrlMock.mockImplementation(function rememberCloudOrigin(args) {
    const apiBaseUrl = args?.['apiBaseUrl'];
    if (typeof apiBaseUrl !== 'string' || apiBaseUrl.length === 0) {
      throw new Error('WDIO expected Desktop to store its Cloud API base URL before sign-in.');
    }
    (
      globalThis as typeof globalThis & {
        __agiWdioCloudOrigin?: string;
      }
    ).__agiWdioCloudOrigin = new URL(apiBaseUrl).origin;
    return null;
  });

  const startMock = await browser.tauri.mock('account_start_device_authorization');
  await startMock.mockImplementation(function startDeviceAuthorization() {
    const verificationOrigin = (
      globalThis as typeof globalThis & {
        __agiWdioCloudOrigin?: string;
      }
    ).__agiWdioCloudOrigin;
    if (typeof verificationOrigin !== 'string') {
      throw new Error('WDIO did not observe Desktop storing its canonical Cloud origin.');
    }
    return {
      status: 200,
      body: JSON.stringify({
        device_code: 'wdio-device-code',
        user_code: 'WDIO-CODE',
        verification_uri: `${verificationOrigin}/auth/device`,
        verification_uri_complete: `${verificationOrigin}/auth/device?user_code=WDIO-CODE&surface=desktop`,
        interval: 1,
        expires_in: 600,
      }),
    };
  });

  const pollMock = await browser.tauri.mock('account_poll_device_authorization');
  await pollMock.mockReturnValue({
    status: 200,
    body: JSON.stringify({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: lifetimeSeconds,
    }),
  });

  for (const command of [
    'account_store_access_token',
    'account_store_refresh_token',
    'account_clear_tokens',
    'llm_ensure_managed_cloud',
  ]) {
    const mock = await browser.tauri.mock(command);
    await mock.mockResolvedValue(null);
  }

  const creditsMock = await browser.tauri.mock('fetch_user_profile');
  if (options.hangCreditsFetch) {
    await creditsMock.mockImplementation(function hangForever() {
      return new Promise(() => {});
    });
  } else {
    await creditsMock.mockResolvedValue({
      id: 'user_wdio',
      email: 'wdio@example.com',
      credits: null,
    });
  }
}

export async function completeMockedDeviceSignIn(): Promise<void> {
  const signInButton = await $(CLOUD_BROWSER_FALLBACK_SELECTOR);
  await signInButton.waitForDisplayed({ timeout: 20_000 });
  await signInButton.click();

  await browser.waitUntil(
    async () => (await browser.getWindowHandles()).includes('cloud-sign-in'),
    {
      timeout: 20_000,
      interval: 250,
      timeoutMsg: 'The mocked Cloud sign-in never opened its owned authorization window',
    },
  );

  await browser.waitUntil(
    async () => {
      const handles = await browser.getWindowHandles();
      return !handles.includes('cloud-sign-in');
    },
    {
      timeout: 60_000,
      interval: 500,
      timeoutMsg: 'The owned Cloud sign-in window never closed after a mocked approval',
    },
  );
}

export async function closeOwnedTauriWindow(label: string): Promise<boolean> {
  await browser.switchToWindow('main');
  return browser.execute(async (ownedWindowLabel: string) => {
    const tauri = (
      window as unknown as {
        __TAURI__?: {
          webviewWindow?: {
            WebviewWindow?: {
              getByLabel(label: string): Promise<{ close(): Promise<void> } | null>;
            };
          };
        };
      }
    ).__TAURI__;
    const WebviewWindow = tauri?.webviewWindow?.WebviewWindow;
    if (!WebviewWindow) return false;
    const ownedWindow = await WebviewWindow.getByLabel(ownedWindowLabel);
    if (!ownedWindow) return false;
    await ownedWindow.close();
    return true;
  }, label) as Promise<boolean>;
}

export function persistedAppMode(): Promise<string | null> {
  return browser.execute((key: string) => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { state?: { mode?: string } };
      return parsed.state?.mode ?? null;
    } catch {
      return null;
    }
  }, APP_MODE_STORAGE_KEY) as Promise<string | null>;
}

export async function writePersistedAppMode(state: {
  mode: 'local' | 'cloud';
  hasSelectedMode: boolean;
  hasOnboarded?: boolean;
}): Promise<void> {
  await browser.execute(
    (key: string, next: { mode: string; hasSelectedMode: boolean; hasOnboarded?: boolean }) => {
      const raw = window.localStorage.getItem(key);
      let version = 3;
      let previous: Record<string, unknown> = {};
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { state?: Record<string, unknown>; version?: number };
          previous = parsed.state ?? {};
          if (typeof parsed.version === 'number') version = parsed.version;
        } catch {
          // Fall through with the defaults above.
        }
      }
      window.localStorage.setItem(
        key,
        JSON.stringify({
          state: {
            ...previous,
            mode: next.mode,
            hasSelectedMode: next.hasSelectedMode,
            hasOnboarded: next.hasOnboarded ?? previous['hasOnboarded'] ?? true,
          },
          version,
        }),
      );
    },
    APP_MODE_STORAGE_KEY,
    state,
  );
}

export async function restoreLocalModeProfile(): Promise<void> {
  await browser.tauri.restoreAllMocks().catch(() => undefined);
  await removeCloudApiStubs().catch(() => undefined);
  await writePersistedAppMode({ mode: 'local', hasSelectedMode: true, hasOnboarded: true });
  await browser.refresh();
  const composer = await $('textarea[aria-label="Chat message input"]');
  await composer.waitForDisplayed({ timeout: 60_000 });
}

export async function deviceSignInCardVisible(): Promise<boolean> {
  return browser.execute(() => {
    const headings = Array.from(document.querySelectorAll('h1'));
    return headings.some(
      (heading) => (heading.textContent ?? '').trim() === 'Sign in to AGI Cloud',
    );
  }) as Promise<boolean>;
}
