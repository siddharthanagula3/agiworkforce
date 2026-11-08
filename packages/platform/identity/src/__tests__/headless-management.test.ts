import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClerkSessionManager } from '../management';

afterEach(() => vi.unstubAllGlobals());

describe('headless session management', () => {
  it('loads the public entry under react-server without loading Next request components', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--conditions=react-server',
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        "const api = await import('@agiworkforce/identity/management'); if (typeof api.createClerkSessionManager !== 'function') process.exit(1)",
      ],
      { cwd: new URL('../..', import.meta.url), encoding: 'utf8', timeout: 15_000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('uses the backend SDK for scoped paging and session revocation', async () => {
    const requests: URL[] = [];
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push(url);
      if (url.pathname.endsWith('/revoke')) return Response.json({ object: 'session' });
      return Response.json({
        data: [
          {
            object: 'session',
            id: 'sess_1',
            user_id: 'user_1',
            status: 'active',
            created_at: 1,
            last_active_at: 2,
            expire_at: 3,
          },
        ],
        total_count: 7,
      });
    });
    vi.stubGlobal('fetch', fetch);
    const manager = createClerkSessionManager(`sk_test_${'x'.repeat(40)}`);

    await expect(
      manager.listUserSessions('user_1', { status: 'active', limit: 1, offset: 2 }),
    ).resolves.toEqual({
      totalCount: 7,
      sessions: [
        {
          id: 'sess_1',
          userId: 'user_1',
          status: 'active',
          createdAt: 1,
          lastActiveAt: 2,
          expireAt: 3,
          latestActivity: null,
        },
      ],
    });
    await manager.revokeSession('sess_1');
    expect(requests[0]?.searchParams.get('user_id')).toBe('user_1');
    expect(requests[0]?.searchParams.get('status')).toBe('active');
    expect(requests[0]?.searchParams.get('limit')).toBe('1');
    expect(requests[0]?.searchParams.get('offset')).toBe('2');
    expect(requests[1]?.pathname).toBe('/v1/sessions/sess_1/revoke');
  });

  it('reports a provider refusal instead of treating it as an empty session list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { errors: [{ code: 'authorization_invalid', message: 'denied' }] },
          { status: 403 },
        ),
      ),
    );
    const manager = createClerkSessionManager(`sk_test_${'x'.repeat(40)}`);
    await expect(manager.listUserSessions('user_1')).rejects.toThrow();
    await expect(manager.revokeSession('sess_1')).rejects.toThrow();
  });
});
