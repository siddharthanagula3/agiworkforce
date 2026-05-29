import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: 'user_123',
          email: 'user@example.com',
          name: 'Example User',
          avatar_url: null,
          created_at: '2026-05-28T00:00:00.000Z',
          updated_at: '2026-05-28T00:00:00.000Z',
          plan: {
            tier: 'pro',
            status: 'active',
            current_period_end: '2026-07-12T00:00:00.000Z',
          },
          feature_flags: {
            cloud_managed: true,
            local_only: false,
          },
        }),
      }),
    );
    await cloudAccountAuth.signOut();
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
});
