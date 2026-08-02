/**
 * Shared scaffolding for the Desktop Cloud wdio specs.
 *
 * The native harness drives the REAL Tauri binary, so a Cloud spec has to
 * satisfy two independent boundaries:
 *
 *   1. Tauri IPC — device authorization runs through
 *      `account_start_device_authorization` / `account_poll_device_authorization`
 *      (see `apps/desktop/src/services/cloudAccountAuth.ts`), so
 *      `browser.tauri.mock` can complete a sign-in without a browser approval.
 *   2. HTTP — everything else (`/api/me`, `/api/models`,
 *      `/api/chat/conversations`, `/api/projects`, chat completions) leaves the
 *      webview through `guardedFetch`, which calls the page's global `fetch`.
 *      Patching `window.fetch` in-page therefore intercepts the exact requests
 *      the product makes, with no product-side test hooks.
 *
 * Response shapes are taken from the shared contracts, NOT invented:
 *   - `/api/me`                  → `MeResponseSchema`            (packages/contracts/cloud-contracts/src/me.ts)
 *   - `/api/chat/conversations`  → `ManagedCloudConversationListResponseSchema`
 *   - `/api/projects`            → `ManagedCloudProjectListResponseSchema`
 *   - `/api/models`              → `{ models: [...] }`           (apps/desktop/src/api/cloudApi.ts getCloudModels)
 *
 * No model id is hardcoded anywhere here. `/api/models` is stubbed EMPTY on
 * purpose: `resolveDesktopCloudPickerModels` still prepends the canonical Auto
 * routing profile from `@agiworkforce/types`, so the picker is non-empty
 * without this file asserting anything about the model catalog.
 */

/** How a stubbed endpoint should behave for a given spec. */
export type StubBehavior = 'ok' | 'server-error';

export interface CloudApiStubOptions {
  /** GET /api/me — the account snapshot that resolves the plan tier. */
  me?: StubBehavior;
  /** GET /api/models — public discovery catalog. */
  models?: StubBehavior;
  /** GET /api/chat/conversations — the Cloud conversation list. */
  conversations?: StubBehavior;
  /** GET /api/projects — the Cloud project list. */
  projects?: StubBehavior;
  /**
   * POST /api/llm/v1/chat/completions. `'stall'` opens an SSE stream that
   * never completes, which is how a spec holds the app in a streaming state.
   */
  completions?: StubBehavior | 'stall';
}

const APP_MODE_STORAGE_KEY = 'app-mode-store';

/**
 * Replaces `window.fetch` with a stub for the Managed Cloud API surface.
 *
 * Anything that is not an `/api/` path falls through to the original `fetch`,
 * so the Vite dev server the debug binary is pointed at keeps working.
 * Unhandled `/api/` paths deliberately answer 404 rather than a fake success —
 * a spec must never pass because an endpoint it forgot silently "worked".
 */
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
        // Empty on purpose — see the file header.
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
          // An SSE stream that emits one role delta and then never finishes,
          // holding the app in the streaming state for the whole test.
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

/** Restores the page's real `fetch`. Safe to call when no stub was installed. */
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

/** Every `/api/` path the stub has answered since it was installed. */
export function recordedCloudApiCalls(): Promise<string[]> {
  return browser.execute(() => {
    const scope = window as unknown as Record<string, unknown>;
    return (scope['__agiCloudStubCalls'] as string[] | undefined) ?? [];
  }) as Promise<string[]>;
}

/**
 * Builds an unsigned JWT the desktop session decoder can read.
 *
 * `cloudAccountAuth.buildSession` only base64-decodes the payload for `sub`,
 * `exp` and friends — it never verifies a signature (the server does that on
 * every request). This is a test credential for the local decoder, not a
 * forged server credential: nothing accepts it except the stubbed endpoints.
 */
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
  /** `sub` claim of the minted bearer. */
  subject?: string;
  /** Bearer lifetime in seconds. */
  lifetimeSeconds?: number;
  /**
   * When true the credits call (`fetch_user_profile`) never resolves, holding
   * the auth orchestrator inside the entitlement window that DES-C17 is about.
   */
  hangCreditsFetch?: boolean;
}

/**
 * The origin `apps/desktop/src/api/config.ts` resolves `WEB_APP_URL` to.
 *
 * `requestDeviceAuthorization` refuses a `verification_uri_complete` whose
 * origin differs from the client's trusted origin, so a drift here fails the
 * spec loudly ("AGI Cloud returned an untrusted verification URL") instead of
 * silently exercising the wrong boundary. Mirrors config.ts's own default.
 */
const CLOUD_ORIGIN = process.env['VITE_WEB_APP_URL'] ?? 'https://agiworkforce.com';

/**
 * Mocks the native half of the device authorization flow so "Sign in to AGI
 * Cloud" completes without a real browser approval.
 *
 * Wire shapes come from `packages/client/client-runtime/src/deviceAuthorization.ts`
 * (`requestDeviceAuthorization` / `pollDeviceAuthorization`), which is what the
 * desktop client parses.
 */
export async function mockDeviceAuthorization(
  options: DeviceAuthorizationMockOptions = {},
): Promise<void> {
  const subject = options.subject ?? 'user_wdio';
  const lifetimeSeconds = options.lifetimeSeconds ?? 3600;
  const accessToken = fakeDeviceJwt(subject, lifetimeSeconds);
  const refreshToken = `wdio-refresh-${subject}`;
  const verificationOrigin = new URL(CLOUD_ORIGIN).origin;

  const startMock = await browser.tauri.mock('account_start_device_authorization');
  await startMock.mockReturnValue({
    status: 200,
    body: JSON.stringify({
      device_code: 'wdio-device-code',
      user_code: 'WDIO-CODE',
      verification_uri: `${verificationOrigin}/auth/device`,
      verification_uri_complete: `${verificationOrigin}/auth/device?user_code=WDIO-CODE&surface=desktop`,
      interval: 1,
      expires_in: 600,
    }),
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

  // Native credential-vault writes: succeed silently, store nothing real.
  for (const command of [
    'account_store_api_base_url',
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
    // Never resolves. `accountApi.withTimeout` gives up after 30 s, so this
    // holds the auth orchestrator between STEP 1 (credential projected) and
    // STEP 4 (plan tier written) — precisely the window in which the shell used
    // to bounce a freshly approved device back to the sign-in screen.
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

/** Clicks the device sign-in button and waits for the owned window to close. */
export async function completeMockedDeviceSignIn(): Promise<void> {
  const signInButton = await $('button=Sign in to AGI Cloud');
  await signInButton.waitForDisplayed({ timeout: 20_000 });
  await signInButton.click();

  // `authorizeDesktopDevice` opens the authorization window, then waits one
  // clamped poll interval (>= 3 s) before the first — already approved — poll.
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

/** Reads the persisted app mode without depending on any product test hook. */
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

/**
 * Rewrites the persisted app-mode snapshot.
 *
 * Specs share ONE app-data profile (`wdio.conf.ts` globs every spec into a
 * single run and only wipes the profile in `onPrepare`), so a spec that leaves
 * Cloud selected boots the next spec into `AuthPage` — the failure recorded as
 * DES-C13. Every Cloud spec must restore Local in an `after()` hook.
 */
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

/**
 * Returns the shell to a clean signed-out Local boot for the next spec file.
 */
export async function restoreLocalModeProfile(): Promise<void> {
  await browser.tauri.restoreAllMocks().catch(() => undefined);
  await removeCloudApiStubs().catch(() => undefined);
  await writePersistedAppMode({ mode: 'local', hasSelectedMode: true, hasOnboarded: true });
  await browser.refresh();
  const composer = await $('textarea[aria-label="Chat message input"]');
  await composer.waitForDisplayed({ timeout: 60_000 });
}

/** True when the Cloud device sign-in card is on screen. */
export async function deviceSignInCardVisible(): Promise<boolean> {
  return browser.execute(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.some((button) => (button.textContent ?? '').trim() === 'Sign in to AGI Cloud');
  }) as Promise<boolean>;
}
