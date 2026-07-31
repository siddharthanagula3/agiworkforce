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
        // and always includes display_name, entitlement/deployment flags, credits, and
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

  it('rotates an expired saved session with the encrypted refresh credential', async () => {
    const expiredAccessToken = jwtWithClaims({
      sub: 'user_123',
      email: 'user@example.com',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    const nextAccessToken = jwtWithClaims({
      sub: 'user_123',
      email: 'user@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'account_restore_access_token') return expiredAccessToken;
      if (command === 'account_restore_refresh_token') return 'saved-refresh-token';
      return undefined;
    });
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes('/api/auth/device/refresh')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: nextAccessToken,
            refresh_token: 'rotated-refresh-token',
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'user_123',
          email: 'user@example.com',
          name: 'Example User',
          avatar_url: null,
          created_at: null,
          updated_at: 1751712000,
          plan: null,
          feature_flags: {},
          credits: null,
          routing_preferences: {},
        }),
      } as Response;
    });

    await cloudAccountAuth.checkSession();

    expect(fetch).toHaveBeenCalledWith(
      `${WEB_APP_URL}/api/auth/device/refresh`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        body: JSON.stringify({ refresh_token: 'saved-refresh-token' }),
      }),
    );
    expect(cloudAccountAuth.getSession()?.access_token).toBe(nextAccessToken);
    expect(cloudAccountAuth.getSession()?.refresh_token).toBe('rotated-refresh-token');
    expect(invokeMock).toHaveBeenCalledWith('account_store_access_token', {
      accessToken: nextAccessToken,
    });
    expect(invokeMock).toHaveBeenCalledWith('account_store_refresh_token', {
      refreshToken: 'rotated-refresh-token',
    });
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

  it('backfills the account email from /api/me when the bearer claim is empty', async () => {
    // /api/auth/device/token mints `email: ''` whenever the browser approval had
    // no email claim, so /api/me is the only authoritative source of the address.
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
