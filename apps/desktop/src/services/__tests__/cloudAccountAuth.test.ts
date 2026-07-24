import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  ...(await importOriginal<typeof import('../../lib/runtimeEnvironment')>()),
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
        // Contract-valid /api/me payload (packages/contracts/cloud-contracts/src/me.ts):
        // the route returns unix-second numbers for updated_at/current_period_end
        // and always includes display_name, the two base flags, credits, and
        // routing_preferences. Extra feature flags exercise normalizeFeatureFlags.
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
          },
          feature_flags: {
            beta_features: true,
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
  });

  it('rejects missing access tokens without creating auth state', async () => {
    const result = await cloudAccountAuth.setSession({ access_token: '' });

    expect(result.error?.code).toBe('invalid_token');
    expect(cloudAccountAuth.isAuthenticated()).toBe(false);
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
  });
});
