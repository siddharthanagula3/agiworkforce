/**
 * DES-C08 / DES-C09 / DES-C21 — native tour of Desktop Cloud settings.
 *
 * What this proves that no other harness can:
 *
 *  1. Every item in the Cloud settings navigation renders real content. Nine of
 *     them used to open agiworkforce.com in a child window gated on a Clerk
 *     BROWSER COOKIE Desktop never propagates, so they could silently land on
 *     /login while the app showed the user as signed in. The ones that can be
 *     served with the device bearer now render inline; the ones that cannot must
 *     carry an explicit "Sign in again to manage this" route.
 *  2. The founder demo path is screen-capturable. `contentProtected` maps to
 *     `NSWindow.sharingType = .none`, so a protected window is BLACK in any
 *     recording or screen share. The sign-in, account/settings and connector
 *     windows must never set it — on the shipped default, with no preference to
 *     enable first. Content protection has no getter in the Tauri JS API, so the
 *     decision is read from the registry `services/ownedWindowPresentation.ts`
 *     writes where it is made.
 *  3. The Account section exposes the account id, API keys, and account deletion,
 *     and states honestly that the account-wide session list cannot be served to
 *     a device token (`/api/settings/sessions` is Clerk-cookie-only).
 *
 * Session strategy. A real credentialed sign-in cannot run in an agent sandbox
 * (DESK-CLOUD-DCL2-LIVE-VERIFY-01), so this drives the REAL device-authorization
 * code path with its Tauri IPC commands mocked and a `window.fetch` shim for the
 * HTTP half. Nothing in the app is stubbed: `cloudAccountAuth.setSession`,
 * `refreshUserData`, the settings modal, and every API client run for real.
 *
 * Cleanup matters here: wdio specs share one app-data profile, so this spec
 * signs out and returns the shell to Local Mode in `after()` (the lesson from
 * DES-C13, where a leaked Cloud mode poisoned the next spec's boot).
 */

import { waitForDesktopShell } from '../support/desktop-shell';

const MOCK_USER = {
  id: 'wdio-cloud-user',
  email: 'wdio@agiworkforce.test',
  name: 'WDIO Cloud',
};

const SHARE_TITLE = 'Shared quarterly plan';
const ARCHIVED_TITLE = 'Archived launch checklist';
const API_KEY_NAME = 'WDIO seeded key';

/** Nav labels DesktopCloudSettingsModal builds from SETTINGS_NAV_GROUPS_WEB. */
const CLOUD_NAV_LABELS = [
  'General',
  'Account',
  'Team',
  'Privacy',
  'Archived chats',
  'Shared links',
  'Billing',
  'Usage',
  'Capabilities',
  'Cowork',
  'Memory',
  'Security',
  'Safety',
  'Notifications',
  'Reflect',
  'Time and focus',
  'Skills',
  'Connectors',
  'Plugins',
];

/** Sections with no bearer-reachable API — they must offer the re-auth route. */
const BRIDGED_LABELS = new Set([
  'General',
  'Safety',
  'Notifications',
  'Reflect',
  'Time and focus',
  'Plugins',
]);

interface SettingsSnapshot {
  activeLabel: string | null;
  text: string;
  hasFallback: boolean;
  hasReauthButton: boolean;
  hasErrorBoundary: boolean;
}

interface OwnedWindowRecord {
  label: string;
  kind: string;
  contentProtected: boolean;
}

/**
 * Answer every `/api/*` call in-page. Installed once, before sign-in, and torn
 * down in `after()`. A catch-all `{}` keeps an unrouted call from reaching the
 * network — the failure mode that turned DES-C14's Playwright specs vacuous.
 */
async function installCloudApiShim(): Promise<void> {
  await browser.execute(
    (user: { id: string; email: string; name: string }, shareTitle, archivedTitle, apiKeyName) => {
      const scope = window as unknown as {
        fetch: typeof fetch;
        __wdioOriginalFetch?: typeof fetch;
      };
      if (!scope.__wdioOriginalFetch) scope.__wdioOriginalFetch = scope.fetch.bind(window);

      const nowIso = new Date().toISOString();
      const laterIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });

      const routes: Array<[RegExp, (method: string, url: URL) => Response]> = [
        [
          /^\/api\/me$/,
          () =>
            json({
              id: user.id,
              email: user.email,
              name: user.name,
              avatar_url: null,
              created_at: null,
              updated_at: Math.floor(Date.now() / 1000),
              plan: {
                tier: 'max',
                display_name: 'Max',
                status: 'active',
                current_period_end: null,
              },
              feature_flags: { code_execution: true },
              routing_preferences: {},
            }),
        ],
        [
          /^\/api\/settings\/sync/,
          (method) =>
            method === 'POST'
              ? json({ applied: true, cursor: '0' })
              : json({ settings: {}, cursor: '0', hasMore: false }),
        ],
        [/^\/api\/projects/, () => json({ projects: [] })],
        [/^\/api\/csrf/, () => json({ token: 'wdio-csrf' })],
        [/^\/api\/library/, () => json({ items: [], has_more: false, next_offset: null })],
        [/^\/api\/llm\/v1\/chat\/completions\/runs/, () => json({ runs: [], nextCursor: null })],
        [/^\/api\/connectors/, () => json({ connectors: [], available: [] })],
        [/^\/api\/skills/, () => json({ skills: [] })],
        [/^\/api\/memory/, () => json({ memories: [], total: 0 })],
        [
          /^\/api\/usage/,
          () =>
            json({
              plan_tier: 'max',
              usage_percentage: 12,
              usage_reset_at: laterIso,
              has_usage_remaining: true,
              period_start: nowIso,
              period_end: laterIso,
              subscription_status: 'active',
              session_usage_percentage: 4,
              session_reset_at: laterIso,
              weekly_usage_percentage: 8,
              weekly_reset_at: laterIso,
              flagship_weekly_usage_percentage: 2,
              flagship_weekly_reset_at: laterIso,
            }),
        ],
        [/^\/api\/share\/[^/]+$/, () => json({ success: true })],
        [
          /^\/api\/share$/,
          () =>
            json({
              shares: [
                {
                  token: 'wdio-share-token',
                  title: shareTitle,
                  shareUrl: 'https://agiworkforce.com/share/wdio-share-token',
                  modelId: null,
                  provider: null,
                  messageCount: 6,
                  createdAt: nowIso,
                  expiresAt: laterIso,
                  expired: false,
                },
              ],
            }),
        ],
        [/^\/api\/settings\/2fa/, () => json({ enabled: true, backup_codes_remaining: 5 })],
        [
          /^\/api\/settings\/activity/,
          () =>
            json({
              activities: [
                {
                  id: 'wdio-activity-1',
                  userId: user.id,
                  type: 'login',
                  description: 'Signed in from AGI Desktop',
                  ipAddress: null,
                  userAgent: null,
                  metadata: {},
                  createdAt: nowIso,
                },
              ],
              limit: 10,
              offset: 0,
            }),
        ],
        [/^\/api\/settings\/api-keys\/[^/]+$/, () => json({ message: 'API key revoked' })],
        [
          /^\/api\/settings\/api-keys$/,
          (method) =>
            method === 'POST'
              ? json(
                  {
                    api_key: {
                      id: 'wdio-key-2',
                      name: 'Created by WDIO',
                      key_prefix: 'sk_live_wdio2',
                      scopes: ['models:read'],
                      created_at: nowIso,
                      last_used_at: null,
                    },
                    full_key: 'sk_live_wdio2_secret',
                  },
                  201,
                )
              : json({
                  api_keys: [
                    {
                      id: 'wdio-key-1',
                      name: apiKeyName,
                      key_prefix: 'sk_live_wdio1',
                      scopes: ['models:read', 'inference:write'],
                      created_at: nowIso,
                      last_used_at: null,
                    },
                  ],
                }),
        ],
        [
          /^\/api\/chat\/conversations\/[^/]+$/,
          (method) =>
            method === 'GET'
              ? json({
                  conversation: {
                    id: 'wdio-archived-1',
                    title: archivedTitle,
                    model: null,
                    project_id: null,
                    pinned: false,
                    starred: false,
                    archived: true,
                    is_temporary: false,
                    created_at: nowIso,
                    updated_at: nowIso,
                  },
                  messages: [],
                  total: 0,
                  hasMore: false,
                })
              : method === 'DELETE'
                ? json({ success: true })
                : json({
                    conversation: {
                      id: 'wdio-archived-1',
                      title: archivedTitle,
                      model: null,
                      project_id: null,
                      pinned: false,
                      starred: false,
                      archived: false,
                      is_temporary: false,
                      created_at: nowIso,
                      updated_at: nowIso,
                    },
                  }),
        ],
        [
          /^\/api\/chat\/conversations$/,
          (_method, url) =>
            json({
              conversations:
                url.searchParams.get('archived') === 'only'
                  ? [
                      {
                        id: 'wdio-archived-1',
                        title: archivedTitle,
                        model: null,
                        project_id: null,
                        pinned: false,
                        starred: false,
                        archived: true,
                        is_temporary: false,
                        created_at: nowIso,
                        updated_at: nowIso,
                      },
                    ]
                  : [],
              hasMore: false,
              nextOffset: 0,
            }),
        ],
      ];

      scope.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const rawUrl =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        let url: URL;
        try {
          url = new URL(rawUrl, window.location.href);
        } catch {
          return scope.__wdioOriginalFetch!(input as RequestInfo, init);
        }
        if (!url.pathname.startsWith('/api/')) {
          return scope.__wdioOriginalFetch!(input as RequestInfo, init);
        }
        const method = (
          init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')
        ).toUpperCase();
        for (const [pattern, handler] of routes) {
          if (pattern.test(url.pathname)) return handler(method, url);
        }
        return json({});
      }) as typeof fetch;
    },
    MOCK_USER,
    SHARE_TITLE,
    ARCHIVED_TITLE,
    API_KEY_NAME,
  );
}

async function restoreCloudApiShim(): Promise<void> {
  await browser.execute(() => {
    const scope = window as unknown as {
      fetch: typeof fetch;
      __wdioOriginalFetch?: typeof fetch;
    };
    if (scope.__wdioOriginalFetch) {
      scope.fetch = scope.__wdioOriginalFetch;
      delete scope.__wdioOriginalFetch;
    }
  });
}

async function setPresentationMode(enabled: boolean): Promise<void> {
  await browser.execute((on: boolean) => {
    if (on) window.localStorage.setItem('agi.desktop.presentation-mode', 'on');
    else window.localStorage.removeItem('agi.desktop.presentation-mode');
  }, enabled);
}

async function mockDeviceAuthorizationIpc(): Promise<void> {
  const start = await browser.tauri.mock('account_start_device_authorization');
  await start.mockReturnValue({
    status: 200,
    body: JSON.stringify({
      device_code: '11111111-1111-4111-8111-111111111111',
      user_code: 'WDIO-TEST',
      verification_uri: 'https://agiworkforce.com/auth/device',
      verification_uri_complete: 'https://agiworkforce.com/auth/device?user_code=WDIO-TEST',
      interval: 1,
      expires_in: 600,
    }),
  });

  // A device bearer whose payload the desktop session builder can decode. The
  // signature is never verified client-side; the server half is shimmed above.
  const base64Url = (value: unknown) =>
    Buffer.from(JSON.stringify(value), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

  const header = base64Url({ alg: 'none', typ: 'JWT' });
  const claims = base64Url({
    sub: MOCK_USER.id,
    email: MOCK_USER.email,
    name: MOCK_USER.name,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  const poll = await browser.tauri.mock('account_poll_device_authorization');
  await poll.mockReturnValue({
    status: 200,
    body: JSON.stringify({
      access_token: `${header}.${claims}.wdio`,
      refresh_token: 'wdio-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
    }),
  });

  for (const command of [
    'account_store_api_base_url',
    'account_store_access_token',
    'account_store_refresh_token',
    'account_clear_tokens',
  ]) {
    const mock = await browser.tauri.mock(command);
    await mock.mockReturnValue(null);
  }
}

function readSettingsSnapshot(): Promise<SettingsSnapshot> {
  return browser.execute(() => {
    const nav = document.querySelector('nav[aria-label="Settings navigation"]');
    const pane = document.querySelector('#settings-pane');
    const text = (pane?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const buttons = Array.from(pane?.querySelectorAll('button') ?? []);
    return {
      activeLabel: nav?.querySelector('button[aria-current="page"]')?.textContent?.trim() ?? null,
      text,
      hasFallback: /No content for section/i.test(text),
      hasReauthButton: buttons.some(
        (button) => (button.textContent ?? '').trim() === 'Sign in again to manage this',
      ),
      hasErrorBoundary: /encountered an unexpected error|Something went wrong/i.test(text),
    };
  }) as Promise<SettingsSnapshot>;
}

function clickSettingsNav(label: string): Promise<boolean> {
  return browser.execute((navLabel: string) => {
    const nav = document.querySelector('nav[aria-label="Settings navigation"]');
    const match = Array.from(nav?.querySelectorAll('button') ?? []).find(
      (button) => (button.textContent ?? '').trim() === navLabel,
    );
    if (!match) return false;
    (match as HTMLButtonElement).click();
    return true;
  }, label) as Promise<boolean>;
}

function readOwnedWindowRecord(label: string): Promise<OwnedWindowRecord | null> {
  return browser.execute((windowLabel: string) => {
    const registry = (
      window as unknown as {
        __agiOwnedCloudWindows?: Record<string, OwnedWindowRecord>;
      }
    ).__agiOwnedCloudWindows;
    return registry?.[windowLabel] ?? null;
  }, label) as Promise<OwnedWindowRecord | null>;
}

describe('AGI Desktop Cloud settings tour', () => {
  before(async function () {
    this.timeout(180_000);
    await waitForDesktopShell();

    // Normalize a leaked Cloud selection from an earlier spec.
    const localReturn = await $('button=Use Local Mode');
    if (await localReturn.isExisting()) {
      await localReturn.click();
      await browser.pause(500);
    }

    await installCloudApiShim();
    // Explicitly OFF: the sign-in window must be capturable on the shipped
    // default, not only when a preference the signed-out user cannot reach is on.
    await setPresentationMode(false);
    await mockDeviceAuthorizationIpc();
  });

  after(async function () {
    this.timeout(120_000);
    // Leave the shared profile exactly as this spec found it (DES-C13).
    await setPresentationMode(false);
    await restoreCloudApiShim();
    await browser.execute(() => {
      window.localStorage.removeItem('app-mode-store');
    });
    await browser.tauri.restoreAllMocks();
  });

  it('signs a mocked device into Cloud Mode and opens the sign-in window capturable', async function () {
    this.timeout(180_000);

    const cloudTab = await $('button[role="tab"]=Cloud');
    await cloudTab.waitForDisplayed({ timeout: 30_000 });
    await cloudTab.click();

    const signIn = await $('button=Sign in to AGI Cloud');
    await signIn.waitForDisplayed({ timeout: 30_000 });
    await signIn.click();

    await browser.waitUntil(async () => (await readOwnedWindowRecord('cloud-sign-in')) !== null, {
      timeout: 30_000,
      interval: 250,
      timeoutMsg: 'Desktop never created the owned Cloud sign-in window',
    });

    // DES-C09: the first step of the demo must be visible to a screen recorder
    // on the shipped default, with no preference to remember first.
    const signInWindow = await readOwnedWindowRecord('cloud-sign-in');
    expect(signInWindow?.contentProtected).toBe(false);

    // The device poll approves on the first interval, so the shell must reach
    // the signed-in Cloud surface without any real credential.
    await browser.waitUntil(async () => await $('button[aria-label="Settings"]').isExisting(), {
      timeout: 60_000,
      interval: 500,
      timeoutMsg: 'Desktop did not reach the signed-in Cloud shell after device approval',
    });

    const bodyText = await $('body').getText();
    expect(bodyText).not.toContain('Could not open Cloud Mode');
  });

  it('opens Cloud settings on a real section instead of the developer fallback', async function () {
    this.timeout(60_000);

    const gear = await $('button[aria-label="Settings"]');
    await gear.waitForDisplayed({ timeout: 20_000 });
    await gear.click();

    const nav = await $('nav[aria-label="Settings navigation"]');
    await nav.waitForDisplayed({ timeout: 20_000 });

    const snapshot = await readSettingsSnapshot();
    expect(snapshot.hasFallback).toBe(false);
    expect(snapshot.hasErrorBoundary).toBe(false);
    expect(snapshot.text.length).toBeGreaterThan(0);
  });

  for (const label of CLOUD_NAV_LABELS) {
    it(`section "${label}" shows real content, never a /login landing`, async function () {
      this.timeout(60_000);

      const clicked = await clickSettingsNav(label);
      expect(clicked).toBe(true);

      // Lazy sections resolve through Suspense and then fetch.
      await browser.pause(900);
      const snapshot = await readSettingsSnapshot();

      expect(snapshot.activeLabel).toBe(label);
      expect(snapshot.hasFallback).toBe(false);
      expect(snapshot.hasErrorBoundary).toBe(false);
      expect(snapshot.text.length).toBeGreaterThan(0);

      // The old copy advertised a "content-protected child window" — the exact
      // window that is invisible on a shared screen (DES-C09).
      expect(snapshot.text).not.toContain('content-protected child window');

      if (BRIDGED_LABELS.has(label)) {
        // DES-C08: a section Desktop cannot serve with its bearer must name the
        // separate web sign-in and offer the recovery, not a bare Open button.
        expect(snapshot.hasReauthButton).toBe(true);
      }
    });
  }

  it('renders shared links inline and offers a revoke control', async function () {
    this.timeout(60_000);

    expect(await clickSettingsNav('Shared links')).toBe(true);
    await browser.waitUntil(
      async () => (await $('[data-testid="cloud-shared-links"]').isExisting()) === true,
      { timeout: 20_000, interval: 250, timeoutMsg: 'Shared links did not render inline' },
    );

    await browser.waitUntil(async () => (await $('body').getText()).includes(SHARE_TITLE), {
      timeout: 20_000,
      interval: 250,
      timeoutMsg: 'Shared links did not list the account share',
    });
    expect(await $('button=Revoke').isExisting()).toBe(true);
  });

  it('renders archived chats inline with restore and delete', async function () {
    this.timeout(60_000);

    expect(await clickSettingsNav('Archived chats')).toBe(true);
    await browser.waitUntil(
      async () => (await $('[data-testid="cloud-archived-chats"]').isExisting()) === true,
      { timeout: 20_000, interval: 250, timeoutMsg: 'Archived chats did not render inline' },
    );

    await browser.waitUntil(async () => (await $('body').getText()).includes(ARCHIVED_TITLE), {
      timeout: 20_000,
      interval: 250,
      timeoutMsg: 'Archived chats did not list the account conversation',
    });
    expect(await $('button=Restore').isExisting()).toBe(true);
  });

  it('renders the Cloud security posture inline', async function () {
    this.timeout(60_000);

    expect(await clickSettingsNav('Security')).toBe(true);
    await browser.waitUntil(
      async () => (await $('[data-testid="cloud-security"]').isExisting()) === true,
      { timeout: 20_000, interval: 250, timeoutMsg: 'Security did not render inline' },
    );

    await browser.waitUntil(async () => (await $('#settings-pane').getText()).includes('Enabled'), {
      timeout: 20_000,
      interval: 250,
      timeoutMsg: 'Security did not report the account two-factor status',
    });
    // Presentation mode is a device preference and must be visible to the user
    // who needs a capturable demo.
    expect(await $('input[aria-label="Presentation mode"]').isExisting()).toBe(true);
  });

  it('exposes account id, API keys and account deletion, and is honest about sessions', async function () {
    this.timeout(60_000);

    expect(await clickSettingsNav('Account')).toBe(true);
    await browser.waitUntil(
      async () => (await $('[data-testid="cloud-account-controls"]').isExisting()) === true,
      { timeout: 20_000, interval: 250, timeoutMsg: 'Account controls did not render' },
    );

    await browser.waitUntil(
      async () => (await $('#settings-pane').getText()).includes(API_KEY_NAME),
      { timeout: 20_000, interval: 250, timeoutMsg: 'Account section never listed the API keys' },
    );

    const paneText = await $('#settings-pane').getText();
    expect(paneText).toContain(MOCK_USER.id);
    expect(await $('[data-testid="cloud-delete-account"]').isExisting()).toBe(true);
    expect(await $('[data-testid="cloud-sign-out-this-device"]').isExisting()).toBe(true);
    // The blocked control must be explained, not faked.
    expect(paneText).toContain('does not accept');
  });

  it('opens a bridged section in a capturable window', async function () {
    this.timeout(90_000);

    expect(await clickSettingsNav('Reflect')).toBe(true);
    await browser.waitUntil(
      async () => (await $('[data-testid="cloud-bridged-reflect"]').isExisting()) === true,
      { timeout: 20_000, interval: 250, timeoutMsg: 'Reflect did not render the bridged section' },
    );

    const open = await $('button=Open Reflect');
    await open.waitForDisplayed({ timeout: 10_000 });
    await open.click();

    await browser.waitUntil(async () => (await readOwnedWindowRecord('cloud-account')) !== null, {
      timeout: 30_000,
      interval: 250,
      timeoutMsg: 'Desktop never created the owned Cloud account window',
    });

    // DES-C09: the settings window is a read/manage surface and must never be
    // excluded from screen capture, presentation mode or not.
    const accountWindow = await readOwnedWindowRecord('cloud-account');
    expect(accountWindow?.contentProtected).toBe(false);

    const handles = await browser.getWindowHandles();
    if (handles.includes('cloud-account')) {
      await browser.switchToWindow('cloud-account');
      await browser.closeWindow();
      await browser.switchToWindow('main');
    }
  });

  it('returns the shell to Local Mode for the next spec', async function () {
    this.timeout(90_000);

    await browser.keys('Escape');
    await browser.pause(500);

    const localTab = await $('button[role="tab"]=Local');
    await localTab.waitForDisplayed({ timeout: 20_000 });
    await localTab.click();

    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 30_000 });
  });
});
