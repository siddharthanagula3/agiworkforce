import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('../../lib/runtimeEnvironment');

const authorizeDesktopDeviceMock = vi.hoisted(() => vi.fn());
const openDesktopCloudSignInWindowMock = vi.hoisted(() => vi.fn());
const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('../desktopDeviceAuthorization', () => ({
  authorizeDesktopDevice: authorizeDesktopDeviceMock,
}));
vi.mock('../desktopCloudSignInWindow', () => ({
  openDesktopCloudSignInWindow: openDesktopCloudSignInWindowMock,
}));
vi.mock('../../lib/runtimeEnvironment', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  isTauri: true,
  supportsLocalAppMode: true,
  isCloudWeb: false,
}));
vi.mock('../../lib/tauri-mock', () => ({
  invoke: invokeMock,
}));
vi.mock('../../lib/egressGuard', () => ({
  guardedFetch: (...args: Parameters<typeof fetch>) => fetch(...args),
}));

import { cloudAccountAuth } from '../cloudAccountAuth';
import { WEB_APP_URL } from '../../api/config';

function jwtWithClaims(claims: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `${header}.${payload}.signature`;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((settle) => {
      resolve = settle;
    }),
    resolve,
  };
}

async function waitFor(assertion: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (assertion()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for CloudAccountAuth.');
}

function meResponse(
  id: string,
  tier: 'free' | 'pro',
  featureFlags: Record<string, boolean>,
): Response {
  return new Response(
    JSON.stringify({
      id,
      email: `${id}@example.test`,
      name: id,
      avatar_url: null,
      created_at: null,
      updated_at: 1_751_712_000,
      plan: {
        tier,
        display_name: tier === 'pro' ? 'Pro' : 'Free',
        status: tier === 'pro' ? 'active' : 'none',
        current_period_end: 1_752_278_400,
        cancel_at_period_end: false,
        subscription_source: tier === 'pro' ? 'stripe' : 'none',
      },
      feature_flags: {
        advanced_model_access: tier === 'pro',
        ...featureFlags,
      },
      credits: null,
      routing_preferences: {},
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('cloudAccountAuth', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    authorizeDesktopDeviceMock.mockReset();
    openDesktopCloudSignInWindowMock.mockReset();
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'account_restore_access_token') {
        throw new Error('No saved Cloud session');
      }
      return undefined;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: 'user_123',
          email: 'user@example.com',
          name: 'Example User',
          avatar_url: null,
          created_at: null,
          updated_at: 1751712000,
          plan: {
            tier: 'pro',
            display_name: 'Pro',
            status: 'active',
            current_period_end: 1752278400,
            cancel_at_period_end: true,
            subscription_source: 'apple',
          },
          feature_flags: {
            advanced_model_access: true,
            cloud_managed: true,
            local_only: false,
          },
          credits: null,
          routing_preferences: {},
        }),
      }),
    );
    await cloudAccountAuth.signOut();
    vi.mocked(fetch).mockClear();
    invokeMock.mockClear();
  });

  it('restores and validates a machine-encrypted Cloud session on startup', async () => {
    const accessToken = jwtWithClaims({
      sub: 'user_123',
      email: 'user@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'account_restore_access_token') return accessToken;
      return undefined;
    });

    await cloudAccountAuth.checkSession();

    expect(invokeMock).toHaveBeenCalledWith('account_restore_access_token');
    expect(cloudAccountAuth.getSession()?.access_token).toBe(accessToken);
    expect(cloudAccountAuth.getPlanTier()).toBe('pro');
  });

  function expiredAndRenewed(subject = 'user_123') {
    const claims = { sub: subject, email: `${subject}@example.com` };
    return {
      expired: jwtWithClaims({ ...claims, exp: Math.floor(Date.now() / 1000) - 60 }),
      renewed: jwtWithClaims({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600 }),
    };
  }

  function refreshFetches() {
    return vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => String(input).includes('/api/auth/device/refresh'));
  }

  it('renews an expired saved session through the host and never sees a refresh token', async () => {
    const { expired, renewed } = expiredAndRenewed();
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'account_restore_access_token') return expired;
      if (command === 'account_refresh_session') {
        return { status: 'renewed', accessToken: renewed };
      }
      return undefined;
    });

    await cloudAccountAuth.checkSession();

    expect(invokeMock).toHaveBeenCalledWith('account_refresh_session');
    expect(refreshFetches()).toEqual([]);
    expect(cloudAccountAuth.getSession()?.access_token).toBe(renewed);
    expect(cloudAccountAuth.getSession()?.refresh_token).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith('account_store_access_token', {
      accessToken: renewed,
    });
    const commands = invokeMock.mock.calls.map(([command]) => command);
    expect(commands).not.toContain('account_restore_refresh_token');
    expect(commands).not.toContain('account_store_refresh_token');
    expect(JSON.stringify(invokeMock.mock.calls)).not.toContain('refreshToken');
  });

  it('renews with only a saved refresh credential and stays quiet when nothing is saved', async () => {
    const { renewed } = expiredAndRenewed();
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'account_restore_access_token') return null;
      if (command === 'account_refresh_session') return { status: 'signed_out' };
      return undefined;
    });

    await cloudAccountAuth.checkSession();

    expect(cloudAccountAuth.isAuthenticated()).toBe(false);
    expect(cloudAccountAuth.getState().error).toBeNull();
    expect(cloudAccountAuth.getState().isLoading).toBe(false);
    expect(invokeMock).not.toHaveBeenCalledWith('account_clear_tokens');

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'account_restore_access_token') return null;
      if (command === 'account_refresh_session') {
        return { status: 'renewed', accessToken: renewed };
      }
      return undefined;
    });

    await cloudAccountAuth.checkSession();

    expect(cloudAccountAuth.getSession()?.access_token).toBe(renewed);
  });

  it('signs out and clears the saved session when the server rejects the refresh credential', async () => {
    const { expired } = expiredAndRenewed();
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'account_restore_access_token') return expired;
      if (command === 'account_refresh_session') return { status: 'rejected' };
      return undefined;
    });

    await cloudAccountAuth.checkSession();

    expect(cloudAccountAuth.isAuthenticated()).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith('account_clear_tokens');
    expect(cloudAccountAuth.getState().error).toContain('could not be renewed');
  });

  it.each([
    ['the host reports the server unreachable', { status: 'unreachable', reason: 'fetch failed' }],
    ['the host answers something this page cannot read', { status: 'renewing' }],
  ])('keeps the saved sign-in at launch when %s', async (_label, outcome) => {
    const { expired } = expiredAndRenewed();
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'account_restore_access_token') return expired;
      if (command === 'account_refresh_session') return outcome;
      return undefined;
    });

    await cloudAccountAuth.checkSession();

    expect(invokeMock).not.toHaveBeenCalledWith('account_clear_tokens');
    expect(cloudAccountAuth.isAuthenticated()).toBe(true);
    expect(cloudAccountAuth.getState().user?.id).toBe('user_123');
    expect(cloudAccountAuth.getState().error).toBe(
      'AGI Cloud could not be reached to renew your session. Your sign-in is kept and will be tried again.',
    );
    await expect(cloudAccountAuth.getValidSession()).resolves.toBeNull();
    expect(cloudAccountAuth.isAuthenticated()).toBe(true);
  });

  it('keeps the saved sign-in when the host command itself fails', async () => {
    const { expired } = expiredAndRenewed();
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'account_restore_access_token') return expired;
      if (command === 'account_refresh_session') throw 'The system credential vault is locked';
      return undefined;
    });

    await cloudAccountAuth.checkSession();

    expect(invokeMock).not.toHaveBeenCalledWith('account_clear_tokens');
    expect(cloudAccountAuth.isAuthenticated()).toBe(true);
  });

  it('keeps working on a still-valid token while unreachable, retries on the next need, and renews when it can', async () => {
    const soon = Math.floor(Date.now() / 1000) + 120;
    const nearExpiry = jwtWithClaims({ sub: 'user_123', email: 'user@example.com', exp: soon });
    const { renewed } = expiredAndRenewed();
    let outcome: unknown = { status: 'unreachable', reason: 'fetch failed' };
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'account_refresh_session') return outcome;
      return undefined;
    });
    const renewals = () =>
      invokeMock.mock.calls.filter(([command]) => command === 'account_refresh_session').length;
    await cloudAccountAuth.setSession({ access_token: nearExpiry });
    const now = vi.spyOn(Date, 'now');
    const start = Date.now();
    now.mockReturnValue(start);

    await expect(cloudAccountAuth.getValidSession()).resolves.toMatchObject({
      access_token: nearExpiry,
    });
    expect(renewals()).toBe(1);
    expect(invokeMock).not.toHaveBeenCalledWith('account_clear_tokens');

    await cloudAccountAuth.getValidSession();
    expect(renewals(), 'a need inside the pause does not call the host again').toBe(1);

    now.mockReturnValue(start + 31_000);
    outcome = { status: 'renewed', accessToken: renewed };
    await expect(cloudAccountAuth.getValidSession()).resolves.toMatchObject({
      access_token: renewed,
    });
    expect(renewals()).toBe(2);
    expect(cloudAccountAuth.getState().error).toBeNull();
  });

  it.each([
    [400, { status: 'rejected' }, true],
    [
      403,
      { status: 'refused', reason: 'Accept the terms.', code: 'terms_acceptance_required' },
      false,
    ],
    [
      429,
      { status: 'unreachable', reason: 'AGI Cloud did not renew the session (status 429).' },
      false,
    ],
    [
      503,
      { status: 'unreachable', reason: 'AGI Cloud did not renew the session (status 503).' },
      false,
    ],
  ])(
    'ends the saved session on a %i refresh refusal only when the credential is gone',
    async (_status, renewal, cleared) => {
      const { expired } = expiredAndRenewed();
      invokeMock.mockImplementation(async (command: string) => {
        if (command === 'account_restore_access_token') return expired;
        if (command === 'account_refresh_session') return renewal;
        return undefined;
      });
      invokeMock.mockClear();

      await cloudAccountAuth.checkSession();

      const clears = invokeMock.mock.calls.filter(
        ([command]) => command === 'account_clear_tokens',
      );
      expect(clears.length > 0).toBe(cleared);
      expect(cloudAccountAuth.getState().isLoading).toBe(false);
      if (renewal.status === 'refused') {
        expect(cloudAccountAuth.getState().error).toBe('Accept the terms.');
      }
    },
  );

  it('fails closed when a restored Cloud token is expired or revoked', async () => {
    const accessToken = jwtWithClaims({
      sub: 'user_123',
      email: 'user@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'account_restore_access_token') return accessToken;
      return undefined;
    });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    await cloudAccountAuth.checkSession();

    expect(cloudAccountAuth.isAuthenticated()).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith('account_clear_tokens');
    expect(cloudAccountAuth.getState().error).toContain('expired');
  });

  it('hydrates a Clerk-backed session from a bearer token and /api/me', async () => {
    const accessToken = jwtWithClaims({
      sub: 'user_123',
      email: 'user@example.com',
      name: 'Example User',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const result = await cloudAccountAuth.setSession({
      access_token: accessToken,
      refresh_token: 'refresh-token',
    });

    expect(result.error).toBeNull();
    expect(cloudAccountAuth.getUser()?.id).toBe('user_123');
    expect(cloudAccountAuth.getSession()?.refresh_token).toBe('refresh-token');
    expect(cloudAccountAuth.getPlanTier()).toBe('pro');
    expect(cloudAccountAuth.hasFeature('cloud_managed')).toBe(true);
    expect(cloudAccountAuth.getState().subscription).toMatchObject({
      current_period_end: new Date(1752278400 * 1000).toISOString(),
      cancel_at_period_end: true,
      subscription_source: 'apple',
    });
  });

  it('drops account A /api/me results that arrive after account B becomes current', async () => {
    const accountAToken = jwtWithClaims({
      sub: 'account-a',
      email: 'account-a@example.test',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const accountBToken = jwtWithClaims({
      sub: 'account-b',
      email: 'account-b@example.test',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const accountASnapshot = deferred<Response>();

    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const authorization = (init?.headers as Record<string, string> | undefined)?.[
        'Authorization'
      ];
      if (url.includes('/api/me') && authorization === `Bearer ${accountAToken}`) {
        return accountASnapshot.promise;
      }
      if (url.includes('/api/me') && authorization === `Bearer ${accountBToken}`) {
        return meResponse('account-b', 'free', { account_b_only: true });
      }
      return new Response('{}', { status: 200 });
    });

    const accountAResult = cloudAccountAuth.setSession({
      access_token: accountAToken,
      refresh_token: 'refresh-a',
    });
    await waitFor(() =>
      vi.mocked(fetch).mock.calls.some(([, init]) => {
        const headers = init?.headers as Record<string, string> | undefined;
        return headers?.['Authorization'] === `Bearer ${accountAToken}`;
      }),
    );

    await expect(
      cloudAccountAuth.setSession({
        access_token: accountBToken,
        refresh_token: 'refresh-b',
      }),
    ).resolves.toEqual({ error: null });

    accountASnapshot.resolve(meResponse('account-a', 'pro', { account_a_only: true }));
    await accountAResult;

    const current = cloudAccountAuth.getState();
    expect(current.user?.id).toBe('account-b');
    expect(current.session?.access_token).toBe(accountBToken);
    expect(current.profile?.id).toBe('account-b');
    expect(current.subscription?.plan_tier).toBe('free');
    expect(current.featureFlags).toMatchObject({
      advanced_model_access: false,
      account_b_only: true,
    });
  });

  it('serializes native vault writes so account B is always written after a delayed account A', async () => {
    const accountAToken = jwtWithClaims({
      sub: 'account-a',
      email: 'account-a@example.test',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const accountBToken = jwtWithClaims({
      sub: 'account-b',
      email: 'account-b@example.test',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const accountAWrite = deferred<void>();
    const accessTokenWriteOrder: string[] = [];

    invokeMock.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'account_store_access_token') {
        const token = String(args?.['accessToken']);
        accessTokenWriteOrder.push(token);
        if (token === accountAToken) await accountAWrite.promise;
      }
      return undefined;
    });
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const authorization = (init?.headers as Record<string, string> | undefined)?.[
        'Authorization'
      ];
      return authorization === `Bearer ${accountBToken}`
        ? meResponse('account-b', 'free', { account_b_only: true })
        : meResponse('account-a', 'pro', { account_a_only: true });
    });

    const accountAResult = cloudAccountAuth.setSession({
      access_token: accountAToken,
      refresh_token: 'refresh-a',
    });
    await waitFor(() => accessTokenWriteOrder.includes(accountAToken));

    const accountBResult = cloudAccountAuth.setSession({
      access_token: accountBToken,
      refresh_token: 'refresh-b',
    });
    expect(cloudAccountAuth.getUser()?.id).toBe('account-b');
    expect(accessTokenWriteOrder).toEqual([accountAToken]);

    accountAWrite.resolve();
    await Promise.all([accountAResult, accountBResult]);

    expect(accessTokenWriteOrder).toEqual([accountAToken, accountBToken]);
    expect(cloudAccountAuth.getUser()?.id).toBe('account-b');
    expect(cloudAccountAuth.getSession()?.access_token).toBe(accountBToken);
  });

  it('cannot resurrect a signed-out account when an older renewal resolves late', async () => {
    const { expired, renewed } = expiredAndRenewed('account-a');
    const renewal = deferred<unknown>();
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'account_refresh_session') return renewal.promise;
      return undefined;
    });

    const refreshResult = cloudAccountAuth.setSession({ access_token: expired });
    await waitFor(() =>
      invokeMock.mock.calls.some(([command]) => command === 'account_refresh_session'),
    );

    await cloudAccountAuth.signOut();
    renewal.resolve({ status: 'renewed', accessToken: renewed });
    await refreshResult;

    expect(cloudAccountAuth.isAuthenticated()).toBe(false);
    expect(cloudAccountAuth.getSession()).toBeNull();
    expect(invokeMock).not.toHaveBeenCalledWith('account_store_access_token', {
      accessToken: renewed,
    });
  });

  it.each([['success', 200] as const, ['unauthorized', 401] as const])(
    'does not let a late account A profile %s mutate or invalidate account B',
    async (_label, patchStatus) => {
      const accountAToken = jwtWithClaims({
        sub: 'account-a',
        email: 'account-a@example.test',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const accountBToken = jwtWithClaims({
        sub: 'account-b',
        email: 'account-b@example.test',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const accountAPatch = deferred<Response>();

      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const authorization = (init?.headers as Record<string, string> | undefined)?.[
          'Authorization'
        ];
        if (String(input).includes('/api/me') && init?.method === 'PATCH') {
          return accountAPatch.promise;
        }
        return authorization === `Bearer ${accountBToken}`
          ? meResponse('account-b', 'free', { account_b_only: true })
          : meResponse('account-a', 'pro', { account_a_only: true });
      });

      await cloudAccountAuth.setSession({
        access_token: accountAToken,
        refresh_token: 'refresh-a',
      });
      const profileUpdate = cloudAccountAuth.updateProfile({ display_name: 'Changed A' });
      await waitFor(() => vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'PATCH'));

      await cloudAccountAuth.setSession({
        access_token: accountBToken,
        refresh_token: 'refresh-b',
      });
      accountAPatch.resolve(
        new Response(
          patchStatus === 200
            ? JSON.stringify({ display_name: 'Changed A', avatar_url: null })
            : '{}',
          { status: patchStatus, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      await expect(profileUpdate).resolves.toEqual({
        error: expect.objectContaining({
          message: 'The AGI Cloud account changed before the profile was saved.',
        }),
      });

      const current = cloudAccountAuth.getState();
      expect(current.user?.id).toBe('account-b');
      expect(current.session?.access_token).toBe(accountBToken);
      expect(current.profile?.display_name).toBe('account-b');
      expect(current.featureFlags).toMatchObject({ account_b_only: true });
      expect(cloudAccountAuth.isAuthenticated()).toBe(true);
    },
  );

  it('does not let a superseded browser authorization overwrite a newer native sign-in', async () => {
    const oldBrowserToken = jwtWithClaims({
      sub: 'account-a',
      email: 'account-a@example.test',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const nativeToken = jwtWithClaims({
      sub: 'account-b',
      email: 'account-b@example.test',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const oldWindowClose = deferred<void>();
    const close = vi.fn(() => oldWindowClose.promise);

    openDesktopCloudSignInWindowMock.mockResolvedValue({ close });
    authorizeDesktopDeviceMock.mockImplementation(async (options) => {
      await options.openAuthorization(`${WEB_APP_URL}/auth/device?user_code=OLD-A`);
      return {
        accessToken: oldBrowserToken,
        refreshToken: 'refresh-a',
        expiresAt: Date.now() + 3_600_000,
      };
    });
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const authorization = (init?.headers as Record<string, string> | undefined)?.[
        'Authorization'
      ];
      return authorization === `Bearer ${nativeToken}`
        ? meResponse('account-b', 'free', { account_b_only: true })
        : meResponse('account-a', 'pro', { account_a_only: true });
    });

    const oldBrowserSignIn = cloudAccountAuth.signIn();
    await waitFor(() => close.mock.calls.length === 1);

    await cloudAccountAuth.adoptNativeCredential({
      accessToken: nativeToken,
      refreshToken: 'refresh-b',
    });
    oldWindowClose.resolve();
    const oldResult = await oldBrowserSignIn;

    expect(oldResult.error?.code).toBe('authorization_superseded');
    const current = cloudAccountAuth.getState();
    expect(current.user?.id).toBe('account-b');
    expect(current.session?.access_token).toBe(nativeToken);
    expect(current.error).toBeNull();
    expect(current.featureFlags).toMatchObject({ account_b_only: true });
  });

  it('backfills the account email from /api/me when the bearer claim is empty', async () => {
    const accessToken = jwtWithClaims({
      sub: 'user_123',
      email: '',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    await cloudAccountAuth.setSession({ access_token: accessToken });

    expect(cloudAccountAuth.getUser()?.email).toBe('user@example.com');
  });

  it('rejects missing access tokens without creating auth state', async () => {
    const result = await cloudAccountAuth.setSession({ access_token: '' });

    expect(result.error?.code).toBe('invalid_token');
    expect(cloudAccountAuth.isAuthenticated()).toBe(false);
  });

  it('does not erase unrelated Desktop session state during Cloud sign-out', async () => {
    window.sessionStorage.setItem('desktop-ui-state', 'keep-me');

    await cloudAccountAuth.signOut();

    expect(window.sessionStorage.getItem('desktop-ui-state')).toBe('keep-me');
  });

  it('waits for retiring-run cleanup before remotely revoking the bearer', async () => {
    const accessToken = jwtWithClaims({
      sub: 'user_123',
      email: 'user@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    await cloudAccountAuth.setSession({ access_token: accessToken });
    vi.mocked(fetch).mockClear();
    const cleanup = deferred<void>();
    let cleanupStarted = false;

    const signOut = cloudAccountAuth.signOut({
      beforeCredentialRevocation: async () => {
        cleanupStarted = true;
        await cleanup.promise;
      },
    });
    await waitFor(() => cleanupStarted);

    expect(
      vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes('/api/auth/logout')),
    ).toBe(false);

    cleanup.resolve(undefined);
    await signOut;

    expect(
      vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes('/api/auth/logout')),
    ).toBe(true);
  });

  it('uses an in-app device authorization window for Desktop sign-in', async () => {
    const accessToken = jwtWithClaims({
      sub: 'user_123',
      email: 'user@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const close = vi.fn(async () => undefined);
    openDesktopCloudSignInWindowMock.mockResolvedValue({ close });
    authorizeDesktopDeviceMock.mockImplementation(async (options) => {
      await options.openAuthorization('https://agiworkforce.com/auth/device?user_code=ABCD-1234');
      return {
        accessToken,
        refreshToken: 'desktop-refresh-token',
        expiresAt: Date.now() + 3_600_000,
      };
    });

    const result = await cloudAccountAuth.signIn({
      email: 'user@example.com',
      password: 'not-sent-to-desktop',
    });

    expect(result.error).toBeNull();
    expect(authorizeDesktopDeviceMock).toHaveBeenCalledOnce();
    expect(openDesktopCloudSignInWindowMock).toHaveBeenCalledWith(
      'https://agiworkforce.com/auth/device?user_code=ABCD-1234',
      expect.objectContaining({ onUserClosed: expect.any(Function) }),
    );
    expect(close).toHaveBeenCalledOnce();
    expect(cloudAccountAuth.getSession()?.access_token).toBe(accessToken);
    expect(cloudAccountAuth.getSession()?.refresh_token).toBe('desktop-refresh-token');
  });

  it('uses the native allowlisted transport for Desktop device authorization', async () => {
    const accessToken = jwtWithClaims({
      sub: 'user_123',
      email: 'user@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    invokeMock.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'account_start_device_authorization') {
        return { status: 200, body: '{"device_code":"device-code"}' };
      }
      if (command === 'account_poll_device_authorization') {
        expect(args).toEqual({ deviceCode: 'device-code' });
        return { status: 403, body: '{"error":"authorization_pending"}' };
      }
      return undefined;
    });
    openDesktopCloudSignInWindowMock.mockResolvedValue({
      close: vi.fn(async () => undefined),
    });
    authorizeDesktopDeviceMock.mockImplementation(async (options) => {
      await expect(options.post(`${WEB_APP_URL}/api/auth/device/code`, {})).resolves.toEqual({
        status: 200,
        body: '{"device_code":"device-code"}',
      });
      await expect(
        options.post(`${WEB_APP_URL}/api/auth/device/token`, {
          device_code: 'device-code',
        }),
      ).resolves.toEqual({
        status: 403,
        body: '{"error":"authorization_pending"}',
      });
      await options.openAuthorization(`${WEB_APP_URL}/auth/device?user_code=ABCD-1234`);
      return { accessToken, expiresAt: Date.now() + 3_600_000 };
    });

    const result = await cloudAccountAuth.signIn({
      email: '',
      password: '',
    });

    expect(result.error).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith('account_start_device_authorization');
    expect(invokeMock).toHaveBeenCalledWith('account_poll_device_authorization', {
      deviceCode: 'device-code',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
