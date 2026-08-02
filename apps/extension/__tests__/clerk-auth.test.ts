import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClerkClient = vi.hoisted(() => vi.fn());

vi.mock('@clerk/chrome-extension/client', () => ({ createClerkClient }));

const ORIGINAL_ENV = { ...process.env };

async function importClerkAuth() {
  return import('../src/features/cloud-bridge/clerkAuth');
}

describe('Clerk Chrome Extension auth', () => {
  beforeEach(() => {
    vi.resetModules();
    createClerkClient.mockReset();
    process.env = { ...ORIGINAL_ENV };
    delete process.env['CLERK_PUBLISHABLE_KEY'];
    delete process.env['CLERK_SYNC_HOST'];
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

  it('loads a foreground client with the validated Sync Host and extension redirects', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'https://clerk.agiworkforce.com';
    const load = vi.fn().mockResolvedValue(undefined);
    createClerkClient.mockReturnValue({
      load,
      session: { id: 'session-ada', getToken: vi.fn().mockResolvedValue('fresh-token') },
      user: {
        id: 'user-ada',
        fullName: 'Ada Lovelace',
        primaryEmailAddress: { emailAddress: 'ada@example.com' },
      },
      addListener: vi.fn(),
      openSignIn: vi.fn(),
      signOut: vi.fn(),
    });

    const auth = await importClerkAuth();

    await expect(auth.getClerkAccountProfile()).resolves.toMatchObject({
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    expect(createClerkClient).toHaveBeenCalledWith({
      publishableKey: 'pk_test_repo_contract',
      syncHost: 'https://clerk.agiworkforce.com',
    });
    expect(load).toHaveBeenCalledWith(
      expect.objectContaining({
        afterSignOutUrl: 'chrome-extension://stable-extension/src/side_panel.html',
        allowedRedirectProtocols: ['chrome-extension:'],
      }),
    );
  });

  it('gets foreground tokens from the background Sync Host client', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'https://clerk.agiworkforce.com';
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      success: true,
      token: 'background-sync-token',
      owner: { accountId: 'user-ada', authIncarnation: 'session-ada' },
    });

    const auth = await importClerkAuth();

    await expect(auth.getFreshClerkToken()).resolves.toBe('background-sync-token');
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
      token: 'newly-synced-token',
      owner: { accountId: 'user-ada', authIncarnation: 'session-new' },
    });

    const auth = await importClerkAuth();

    await expect(auth.getFreshClerkToken(true)).resolves.toBe('newly-synced-token');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'GET_CLOUD_AUTH_TOKEN',
      refresh: true,
    });
  });

  it('hydrates the signed-in account identity on first render', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'https://clerk.agiworkforce.com';
    createClerkClient.mockReturnValue({
      load: vi.fn().mockResolvedValue(undefined),
      session: { id: 'session-ada', getToken: vi.fn().mockResolvedValue('fresh-token') },
      user: {
        id: 'user-ada',
        fullName: 'Ada Lovelace',
        firstName: 'Ada',
        lastName: 'Lovelace',
        primaryEmailAddress: { emailAddress: 'ada@example.com' },
      },
      addListener: vi.fn(),
      signOut: vi.fn(),
    });

    const auth = await importClerkAuth();

    await expect(auth.getClerkAccountProfile()).resolves.toEqual({
      owner: { accountId: 'user-ada', authIncarnation: 'session-ada' },
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      initials: 'AL',
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

  it('uses the background service-worker client so tokens remain fresh', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'http://localhost';
    vi.stubGlobal('document', undefined);
    const getToken = vi.fn().mockResolvedValue('background-token');
    createClerkClient.mockResolvedValue({
      session: { id: 'session-background', user: { id: 'user-background' }, getToken },
      user: { id: 'user-background' },
    });

    const auth = await importClerkAuth();

    await expect(auth.getFreshClerkToken()).resolves.toBe('background-token');
    expect(createClerkClient).toHaveBeenCalledWith({
      publishableKey: 'pk_test_repo_contract',
      syncHost: 'http://localhost',
      background: true,
    });
  });

  it('recreates the background client when a web sign-in refresh is requested', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'http://localhost';
    vi.stubGlobal('document', undefined);
    createClerkClient.mockResolvedValueOnce({ session: null }).mockResolvedValueOnce({
      session: {
        id: 'session-refreshed',
        user: { id: 'user-refreshed' },
        getToken: vi.fn().mockResolvedValue('refreshed-background-token'),
      },
      user: { id: 'user-refreshed' },
    });

    const auth = await importClerkAuth();

    await expect(auth.getFreshClerkToken()).resolves.toBeNull();
    await expect(auth.getFreshClerkToken(true)).resolves.toBe('refreshed-background-token');
    expect(createClerkClient).toHaveBeenCalledTimes(2);
  });

  it('signs out only the exact rejected background session and bearer', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'http://localhost';
    vi.stubGlobal('document', undefined);
    const signOut = vi.fn().mockResolvedValue(undefined);
    const session = {
      id: 'session-a',
      user: { id: 'user-a' },
      getToken: vi.fn().mockResolvedValue('token-a'),
    };
    createClerkClient.mockResolvedValue({ session, user: { id: 'user-a' }, signOut });

    const auth = await importClerkAuth();

    await expect(
      auth.signOutClerkIfCurrent({
        token: 'token-a',
        owner: { accountId: 'user-a', authIncarnation: 'session-a' },
      }),
    ).resolves.toBe(true);
    expect(signOut).toHaveBeenCalledWith({
      sessionId: 'session-a',
      redirectUrl: 'chrome-extension://stable-extension/src/side_panel.html',
    });
  });

  it('does not let a delayed account-A rejection sign out ambient account B', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'http://localhost';
    vi.stubGlobal('document', undefined);
    const signOut = vi.fn().mockResolvedValue(undefined);
    const getToken = vi.fn().mockResolvedValue('token-b');
    createClerkClient.mockResolvedValue({
      session: { id: 'session-b', user: { id: 'user-b' }, getToken },
      user: { id: 'user-b' },
      signOut,
    });

    const auth = await importClerkAuth();

    await expect(
      auth.signOutClerkIfCurrent({
        token: 'token-a',
        owner: { accountId: 'user-a', authIncarnation: 'session-a' },
      }),
    ).resolves.toBe(false);
    expect(getToken).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('does not clear a refreshed bearer for the same account/session', async () => {
    process.env['CLERK_PUBLISHABLE_KEY'] = 'pk_test_repo_contract';
    process.env['CLERK_SYNC_HOST'] = 'http://localhost';
    vi.stubGlobal('document', undefined);
    const signOut = vi.fn().mockResolvedValue(undefined);
    const session = {
      id: 'session-a',
      user: { id: 'user-a' },
      getToken: vi.fn().mockResolvedValue('token-refreshed'),
    };
    createClerkClient.mockResolvedValue({ session, user: { id: 'user-a' }, signOut });

    const auth = await importClerkAuth();

    await expect(
      auth.signOutClerkIfCurrent({
        token: 'token-retired',
        owner: { accountId: 'user-a', authIncarnation: 'session-a' },
      }),
    ).resolves.toBe(false);
    expect(signOut).not.toHaveBeenCalled();
  });
});
