import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClerkClient = vi.hoisted(() => vi.fn());

vi.mock('@clerk/chrome-extension/client', () => ({ createClerkClient }));

const fetchMock = vi.fn();
const ORIGINAL_ENV = { ...process.env };

const TEST_TOKEN_EXPIRY = Math.floor(Date.now() / 1000) + 3600;

function sessionToken(
  accountId: string,
  sessionId: string,
  claims: Record<string, unknown> = {},
): string {
  return (
    'header.' +
    btoa(
      JSON.stringify({
        sub: accountId,
        sid: sessionId,
        azp: 'chrome-extension://stable-extension',
        exp: TEST_TOKEN_EXPIRY,
        ...claims,
      }),
    ) +
    '.signature'
  );
}

async function importClerkAuth() {
  return import('../src/features/cloud-bridge/clerkAuth');
}

describe('Clerk Chrome Extension auth', () => {
  beforeEach(() => {
    vi.resetModules();
    createClerkClient.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env = { ...ORIGINAL_ENV };
    delete process.env['CLERK_PUBLISHABLE_KEY'];
    delete process.env['CLERK_SYNC_HOST'];
    vi.stubEnv('VITE_AGI_WEB_API_BASE_URL', '');
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://stable-extension/${path}`),
        sendMessage: vi.fn(),
      },
      tabs: {
        create: vi.fn().mockResolvedValue({ id: 42 }),
      },
    });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('does not load the SDK when the publishable key is absent', async () => {
    const auth = await importClerkAuth();

    await expect(auth.getFreshClerkToken()).resolves.toBeNull();
    expect(auth.isClerkExtensionAuthConfigured()).toBe(false);
    expect(createClerkClient).not.toHaveBeenCalled();
  });

  it('fails closed when a key is baked in without the required Sync Host', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    const auth = await importClerkAuth();

    expect(auth.isClerkExtensionAuthConfigured()).toBe(false);
    await expect(auth.openClerkSignIn()).rejects.toThrow(/CLERK_SYNC_HOST is required/i);
    expect(createClerkClient).not.toHaveBeenCalled();
  });

  it('gets foreground tokens from the background Sync Host client', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'https://clerk.agiworkforce.com';
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      success: true,
      token: sessionToken('user-ada', 'session-ada'),
      owner: { accountId: 'user-ada', authIncarnation: 'session-ada' },
    });

    const auth = await importClerkAuth();

    await expect(auth.getFreshClerkToken()).resolves.toBe(sessionToken('user-ada', 'session-ada'));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'GET_CLOUD_AUTH_TOKEN',
      refresh: false,
    });
    expect(createClerkClient).not.toHaveBeenCalled();
  });

  it('forces the background Sync Host client to reload after web sign-in', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'https://clerk.agiworkforce.com';
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      success: true,
      token: sessionToken('user-ada', 'session-new'),
      owner: { accountId: 'user-ada', authIncarnation: 'session-new' },
    });

    const auth = await importClerkAuth();

    await expect(auth.getFreshClerkToken(true)).resolves.toBe(
      sessionToken('user-ada', 'session-new'),
    );
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'GET_CLOUD_AUTH_TOKEN',
      refresh: true,
    });
  });

  it('rejects a Sync Host that is not an origin-only HTTPS URL', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_live_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'https://clerk.agiworkforce.com/untrusted/path';

    const auth = await importClerkAuth();

    expect(auth.isClerkExtensionAuthConfigured()).toBe(false);
    await expect(auth.openClerkSignIn()).rejects.toThrow(/origin only/i);
    expect(createClerkClient).not.toHaveBeenCalled();
  });

  it('opens the web sign-in flow so OAuth is supported outside the side panel', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'https://clerk.agiworkforce.com';

    const auth = await importClerkAuth();
    await auth.openClerkSignIn();

    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://agiworkforce.com/sign-in?redirectTo=%2Fauth%2Fchrome-extension',
    });
    expect(createClerkClient).not.toHaveBeenCalled();
  });

  it('signs into the configured local web app instead of a different Clerk instance', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'http://localhost:3100';
    vi.stubEnv('VITE_AGI_WEB_API_BASE_URL', 'http://localhost:3100');

    const auth = await importClerkAuth();
    await auth.openClerkSignIn();

    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'http://localhost:3100/sign-in?redirectTo=%2Fauth%2Fchrome-extension',
    });
  });

  it('fails closed instead of opening sign-in on an untrusted web origin', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'https://clerk.agiworkforce.com';
    vi.stubEnv('VITE_AGI_WEB_API_BASE_URL', 'https://untrusted.example');

    const auth = await importClerkAuth();

    await expect(auth.openClerkSignIn()).rejects.toThrow(/invalid web origin/i);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('uses the background service-worker client so tokens remain fresh', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'http://localhost';
    vi.stubGlobal('document', undefined);
    const getToken = vi
      .fn()
      .mockResolvedValue(sessionToken('user-background', 'session-background'));
    createClerkClient.mockResolvedValue({
      session: { id: 'session-background', user: { id: 'user-background' }, getToken },
      user: { id: 'user-background' },
    });

    const auth = await importClerkAuth();

    await expect(auth.getFreshClerkToken()).resolves.toBe(
      sessionToken('user-background', 'session-background'),
    );
    expect(createClerkClient).toHaveBeenCalledWith({
      publishableKey: 'pk_test_repo_contract',
      syncHost: 'http://localhost',
      background: true,
    });
    expect(getToken).toHaveBeenCalledWith({ skipCache: true });
  });

  it('recreates the background client when a web sign-in refresh is requested', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'http://localhost';
    vi.stubGlobal('document', undefined);
    createClerkClient.mockResolvedValueOnce({ session: null }).mockResolvedValueOnce({
      session: {
        id: 'session-refreshed',
        user: { id: 'user-refreshed' },
        getToken: vi.fn().mockResolvedValue(sessionToken('user-refreshed', 'session-refreshed')),
      },
      user: { id: 'user-refreshed' },
    });

    const auth = await importClerkAuth();

    await expect(auth.getFreshClerkToken()).resolves.toBeNull();
    await expect(auth.getFreshClerkToken(true)).resolves.toBe(
      sessionToken('user-refreshed', 'session-refreshed'),
    );
    expect(createClerkClient).toHaveBeenCalledTimes(2);
  });

  it('preserves SDK caching for an existing token bound to this extension origin', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'http://localhost';
    vi.stubGlobal('document', undefined);
    const getToken = vi
      .fn()
      .mockResolvedValue(sessionToken('user-background', 'session-background'));
    createClerkClient.mockResolvedValue({
      session: {
        id: 'session-background',
        user: { id: 'user-background' },
        lastActiveToken: { jwt: { claims: { azp: 'chrome-extension://stable-extension' } } },
        getToken,
      },
      user: { id: 'user-background' },
    });

    const auth = await importClerkAuth();

    await expect(auth.getFreshClerkToken()).resolves.toBe(
      sessionToken('user-background', 'session-background'),
    );
    expect(getToken).toHaveBeenCalledWith({ skipCache: false });
  });

  it('renews a token minted for another origin before returning an extension credential', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'http://localhost';
    vi.stubGlobal('document', undefined);
    const getToken = vi
      .fn()
      .mockResolvedValue(sessionToken('user-background', 'session-background'));
    createClerkClient.mockResolvedValue({
      session: {
        id: 'session-background',
        user: { id: 'user-background' },
        lastActiveToken: { jwt: { claims: { azp: 'https://other.example' } } },
        getToken,
      },
      user: { id: 'user-background' },
    });

    const auth = await importClerkAuth();

    await expect(auth.getFreshClerkToken()).resolves.toBe(
      sessionToken('user-background', 'session-background'),
    );
    expect(getToken).toHaveBeenCalledWith({ skipCache: true });
  });

  it('renews the actual cached token when SDK lastActiveToken incorrectly appears origin-bound', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'http://localhost';
    vi.stubGlobal('document', undefined);
    const unbound = sessionToken('user-a', 'session-a', { azp: null });
    const bound = sessionToken('user-a', 'session-a');
    const getToken = vi.fn().mockResolvedValueOnce(unbound).mockResolvedValueOnce(bound);
    createClerkClient.mockResolvedValue({
      session: {
        id: 'session-a',
        user: { id: 'user-a' },
        lastActiveToken: { jwt: { claims: { azp: 'chrome-extension://stable-extension' } } },
        getToken,
      },
      user: { id: 'user-a' },
    });
    const auth = await importClerkAuth();

    await expect(auth.getFreshClerkAuthContext()).resolves.toEqual({
      token: bound,
      owner: { accountId: 'user-a', authIncarnation: 'session-a' },
    });
    expect(getToken.mock.calls).toEqual([[{ skipCache: false }], [{ skipCache: true }]]);
  });

  it.each([
    { azp: null },
    { azp: 'http://localhost' },
    { exp: 0 },
    { sub: 'user-b' },
    { sid: 'session-b' },
  ])('fails closed if renewal still returns invalid actual claims %j', async (claims) => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'http://localhost';
    vi.stubGlobal('document', undefined);
    const getToken = vi.fn().mockResolvedValue(sessionToken('user-a', 'session-a', claims));
    const signOut = vi.fn();
    createClerkClient.mockResolvedValue({
      session: { id: 'session-a', user: { id: 'user-a' }, getToken },
      user: { id: 'user-a' },
      signOut,
    });
    const auth = await importClerkAuth();

    await expect(auth.getFreshClerkAuthContext()).rejects.toThrow(/origin-bound/);
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('does not label a token from a replaced session as the previous owner', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'http://localhost';
    vi.stubGlobal('document', undefined);
    const session = { id: 'session-a', user: { id: 'user-a' }, getToken: vi.fn() };
    const clerk = { session, user: { id: 'user-a' } };
    session.getToken.mockImplementation(async () => {
      clerk.session = { ...session, id: 'session-b' };
      return sessionToken('user-a', 'session-b');
    });
    createClerkClient.mockResolvedValue(clerk);
    const auth = await importClerkAuth();

    await expect(auth.getFreshClerkAuthContext()).rejects.toThrow(/origin-bound/);
  });

  it('forces one background renewal when the foreground relay actually carries an unbound token', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'http://localhost';
    const owner = { accountId: 'user-a', authIncarnation: 'session-a' };
    const bound = sessionToken('user-a', 'session-a');
    vi.mocked(chrome.runtime.sendMessage)
      .mockResolvedValueOnce({
        success: true,
        token: sessionToken('user-a', 'session-a', { azp: null }),
        owner,
      })
      .mockResolvedValueOnce({ success: true, token: bound, owner });
    const auth = await importClerkAuth();

    await expect(auth.getFreshClerkAuthContext()).resolves.toEqual({ token: bound, owner });
    expect(chrome.runtime.sendMessage).toHaveBeenNthCalledWith(1, {
      type: 'GET_CLOUD_AUTH_TOKEN',
      refresh: false,
    });
    expect(chrome.runtime.sendMessage).toHaveBeenNthCalledWith(2, {
      type: 'GET_CLOUD_AUTH_TOKEN',
      refresh: true,
    });
    expect(createClerkClient).not.toHaveBeenCalled();
  });

  it('rejects a foreground relay whose actual sid/sub differs from its reported owner', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'http://localhost';
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      success: true,
      token: sessionToken('user-b', 'session-b'),
      owner: { accountId: 'user-a', authIncarnation: 'session-a' },
    });
    const auth = await importClerkAuth();

    await expect(auth.getFreshClerkAuthContext()).rejects.toThrow(/origin-bound/);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(createClerkClient).not.toHaveBeenCalled();
  });

  it('bounds an explicit foreground refresh to one request when the response remains unbound', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'http://localhost';
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      success: true,
      token: sessionToken('user-a', 'session-a', { azp: null }),
      owner: { accountId: 'user-a', authIncarnation: 'session-a' },
    });
    const auth = await importClerkAuth();

    await expect(auth.getFreshClerkAuthContext(true)).rejects.toThrow(/origin-bound/);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('signs out from the panel without navigating its extension page', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'http://localhost';
    const signOut = vi.fn().mockImplementation(async (onSignOut: () => void) => onSignOut());
    createClerkClient.mockResolvedValue({ signOut });

    const auth = await importClerkAuth();

    await expect(auth.signOutClerk()).resolves.toBeUndefined();
    expect(signOut).toHaveBeenCalledWith(expect.any(Function));
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('does not call the sync host to revoke a session that does not exist', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'https://clerk.agiworkforce.com';
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true, token: null });

    const auth = await importClerkAuth();
    await auth.revokeSyncedWebSession();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches a CSRF token then deletes the current session on the sync host, reading the session id from the same background relay the rest of the panel trusts', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'https://clerk.agiworkforce.com';
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      success: true,
      token: sessionToken('user-ada', 'sess_current'),
      owner: { accountId: 'user-ada', authIncarnation: 'sess_current' },
    });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ token: 'csrf-test-token' }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue({}) });

    const auth = await importClerkAuth();
    await auth.revokeSyncedWebSession();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://agiworkforce.com/api/csrf',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://agiworkforce.com/api/settings/sessions/sess_current',
      expect.objectContaining({
        method: 'DELETE',
        credentials: 'include',
        headers: expect.objectContaining({
          'x-csrf-token': 'csrf-test-token',
          'x-requested-with': 'agiworkforce-chrome-extension',
        }),
      }),
    );
    expect(createClerkClient).not.toHaveBeenCalled();
  });

  it('surfaces a refused session-revoke response to the caller instead of swallowing it', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'https://clerk.agiworkforce.com';
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      success: true,
      token: sessionToken('user-ada', 'sess_current'),
      owner: { accountId: 'user-ada', authIncarnation: 'sess_current' },
    });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ token: 'csrf-test-token' }),
      })
      .mockResolvedValueOnce({ ok: false, status: 403, json: vi.fn().mockResolvedValue({}) });

    const auth = await importClerkAuth();

    await expect(auth.revokeSyncedWebSession()).rejects.toThrow(/403/);
  });
});
