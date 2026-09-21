import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  mockAuth,
  mockGetSessionList,
  mockRevokeSession,
  mockGetUserScopedDb,
  mockVerifyToken,
  mockNeonExecute,
  mockNeonQuery,
  mockEmitIdentitySecurityEvent,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetSessionList: vi.fn(),
  mockRevokeSession: vi.fn(),
  mockGetUserScopedDb: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockNeonExecute: vi.fn(async () => 1),
  mockNeonQuery: vi.fn(async () => [] as Record<string, unknown>[]),
  mockEmitIdentitySecurityEvent: vi.fn(async (..._args: unknown[]) => ({
    level: 'none',
    signals: [] as string[],
  })),
}));

vi.mock('@/lib/services/identity-events', () => ({
  emitIdentitySecurityEvent: (...args: unknown[]) => mockEmitIdentitySecurityEvent(...args),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mockGetUserScopedDb(...args),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  clerkClient: vi.fn(async () => ({
    sessions: {
      getSessionList: (...args: unknown[]) => mockGetSessionList(...args),
      revokeSession: (...args: unknown[]) => mockRevokeSession(...args),
    },
  })),
}));

vi.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(async () => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { DELETE, GET } from './route';

const DAY_MS = 24 * 60 * 60 * 1000;

function session(
  id: string,
  overrides: Partial<{
    userId: string;
    status: string;
    createdAt: number;
    lastActiveAt: number;
    expireAt: number;
    latestActivity: Record<string, unknown>;
  }> = {},
) {
  return {
    id,
    clientId: `client-${id}`,
    userId: overrides.userId ?? 'user-1',
    status: overrides.status ?? 'active',
    createdAt: overrides.createdAt ?? Date.now() - DAY_MS,
    updatedAt: Date.parse('2026-07-02T12:00:00.000Z'),
    lastActiveAt: overrides.lastActiveAt ?? Date.parse('2026-07-03T12:00:00.000Z'),
    expireAt: overrides.expireAt ?? Date.now() + 7 * DAY_MS,
    abandonAt: Date.now() + 8 * DAY_MS,
    latestActivity: overrides.latestActivity,
    actor: null,
  };
}

function providerError(status: number, retryAfter?: number): Error {
  return Object.assign(new Error(`provider responded ${status}`), {
    status,
    ...(retryAfter === undefined ? {} : { retryAfter }),
  });
}

function revokeAllRequest() {
  return new Request('http://localhost:3000/api/settings/sessions', {
    method: 'DELETE',
  }) as never;
}

function bearerRequest(method: 'GET' | 'DELETE', token: string) {
  return new Request('http://localhost:3000/api/settings/sessions', {
    method,
    headers: { authorization: `Bearer ${token}` },
  }) as never;
}

describe('/api/settings/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1', sessionId: 'sess_current' });
    mockGetUserScopedDb.mockResolvedValue({
      db: { execute: mockNeonExecute, query: mockNeonQuery },
      userId: 'user-1',
      organizationId: null,
    });
    mockRevokeSession.mockResolvedValue({ status: 'revoked' });
    mockNeonQuery.mockResolvedValue([]);
    process.env['CLERK_SECRET_KEY'] = 'sk_test_clerk_secret';
  });

  describe('browser (Clerk cookie) caller', () => {
    it('lists every active account session with a safe activity projection', async () => {
      mockGetSessionList.mockResolvedValue({
        data: [
          session('sess_phone', {
            latestActivity: {
              id: 'activity-phone',
              isMobile: true,
              ipAddress: '203.0.113.10',
              city: 'Austin',
              country: 'US',
              browserName: 'Mobile Safari',
              browserVersion: '19',
              deviceType: 'iPhone',
            },
          }),
          session('sess_current', {
            lastActiveAt: Date.parse('2026-07-04T12:00:00.000Z'),
            latestActivity: { id: 'activity-current', isMobile: false, deviceType: 'Mac' },
          }),
        ],
        totalCount: 2,
      });

      const response = await GET(
        new Request('http://localhost:3000/api/settings/sessions') as never,
      );
      const body = (await response.json()) as {
        sessions: Array<Record<string, unknown>>;
        totalCount: number;
        currentSessionKnown: boolean;
      };

      expect(response.status).toBe(200);
      expect(body.totalCount).toBe(2);
      expect(body.currentSessionKnown).toBe(true);
      expect(body.sessions[0]).toMatchObject({
        id: 'sess_current',
        isCurrent: true,
        device: 'Mac',
      });
      expect(body.sessions[1]).toMatchObject({
        id: 'sess_phone',
        isCurrent: false,
        device: 'iPhone',
        browser: 'Mobile Safari 19',
        location: 'Austin, US',
      });
      expect(JSON.stringify(body)).not.toContain('203.0.113.10');
      expect(mockGetSessionList).toHaveBeenCalledWith({
        userId: 'user-1',
        status: 'active',
        limit: 100,
        offset: 0,
      });
    });

    it('names the operating system and the surface from the install that registered under the session', async () => {
      mockGetSessionList.mockResolvedValue({
        data: [session('sess_current'), session('sess_cli')],
        totalCount: 2,
      });
      mockNeonQuery.mockResolvedValue([
        {
          identity_session_id: 'sess_cli',
          surface: 'cli',
          os: 'macos',
          os_version: '26.1',
        },
      ]);

      const response = await GET(
        new Request('http://localhost:3000/api/settings/sessions') as never,
      );
      const body = (await response.json()) as { sessions: Array<Record<string, unknown>> };

      expect(response.status).toBe(200);
      expect(body.sessions.find((row) => row['id'] === 'sess_cli')).toMatchObject({
        os: 'macos',
        osVersion: '26.1',
        surface: 'cli',
      });
      expect(body.sessions.find((row) => row['id'] === 'sess_current')).toMatchObject({
        os: null,
        osVersion: null,
        surface: 'web',
      });
    });

    it('still lists sessions when the device registry has not been provisioned', async () => {
      mockGetSessionList.mockResolvedValue({ data: [session('sess_current')], totalCount: 1 });
      mockNeonQuery.mockRejectedValue(
        Object.assign(new Error('relation "device_registrations" does not exist'), {
          code: '42P01',
        }),
      );

      const response = await GET(
        new Request('http://localhost:3000/api/settings/sessions') as never,
      );
      const body = (await response.json()) as { sessions: Array<Record<string, unknown>> };

      expect(response.status).toBe(200);
      expect(body.sessions[0]).toMatchObject({ surface: 'web', os: null });
    });

    it('gives the screen every field a session row shows, and no field it must not', async () => {
      mockGetSessionList.mockResolvedValue({
        data: [
          session('sess_cli', {
            latestActivity: {
              id: 'activity-cli',
              isMobile: false,
              ipAddress: '198.51.100.7',
              city: 'Lisbon',
              country: 'PT',
              browserName: 'Chrome',
              browserVersion: '141',
              deviceType: 'Mac',
            },
          }),
        ],
        totalCount: 1,
      });
      mockNeonQuery.mockResolvedValue([
        { identity_session_id: 'sess_cli', surface: 'cli', os: 'macos', os_version: '26.1' },
      ]);

      const response = await GET(
        new Request('http://localhost:3000/api/settings/sessions') as never,
      );
      const body = (await response.json()) as { sessions: Array<Record<string, unknown>> };
      const row = body.sessions[0] as Record<string, unknown>;

      expect(row['browser']).toBe('Chrome 141');
      expect(row['device']).toBe('Mac');
      expect(row['os']).toBe('macos');
      expect(row['osVersion']).toBe('26.1');
      expect(row['surface']).toBe('cli');
      expect(row['location']).toBe('Lisbon, PT');
      expect(typeof row['lastActiveAt']).toBe('string');
      expect(typeof row['createdAt']).toBe('string');
      expect(typeof row['expiresAt']).toBe('string');
      expect(typeof row['absoluteExpiresAt']).toBe('string');
      expect(row['isCurrent']).toBe(false);
      expect(JSON.stringify(row)).not.toContain('198.51.100.7');
    });

    it('ends a session that has outlived the absolute lifetime and never returns it', async () => {
      const ancient = Date.now() - 400 * DAY_MS;
      mockGetSessionList.mockResolvedValue({
        data: [session('sess_current'), session('sess_ancient', { createdAt: ancient })],
        totalCount: 2,
      });

      const response = await GET(
        new Request('http://localhost:3000/api/settings/sessions') as never,
      );
      const body = (await response.json()) as {
        sessions: Array<{ id: string; absoluteExpiresAt: string | null }>;
        totalCount: number;
        endedByLifetime: number;
      };

      expect(response.status).toBe(200);
      expect(mockRevokeSession).toHaveBeenCalledWith('sess_ancient');
      expect(body.sessions.map((row) => row.id)).toEqual(['sess_current']);
      expect(body.endedByLifetime).toBe(1);
      expect(body.totalCount).toBe(1);
      expect(body.sessions[0]?.absoluteExpiresAt).toBe(
        new Date(Date.parse(String(body.sessions[0]?.absoluteExpiresAt))).toISOString(),
      );
    });

    it('ends a session the provider still lists but whose own expiry has passed', async () => {
      mockGetSessionList.mockResolvedValue({
        data: [session('sess_current'), session('sess_stale', { expireAt: Date.now() - DAY_MS })],
        totalCount: 2,
      });

      const response = await GET(
        new Request('http://localhost:3000/api/settings/sessions') as never,
      );
      const body = (await response.json()) as {
        sessions: Array<{ id: string }>;
        endedByLifetime: number;
        endedByLifetimeBounds: string[];
      };

      expect(response.status).toBe(200);
      expect(mockRevokeSession).toHaveBeenCalledWith('sess_stale');
      expect(body.sessions.map((row) => row.id)).toEqual(['sess_current']);
      expect(body.endedByLifetime).toBe(1);
      expect(body.endedByLifetimeBounds).toEqual(['idle']);
    });

    it('honours a shorter absolute lifetime when policy sets one', async () => {
      process.env['SESSION_ABSOLUTE_LIFETIME_HOURS'] = '12';
      try {
        mockGetSessionList.mockResolvedValue({
          data: [session('sess_yesterday')],
          totalCount: 1,
        });

        const response = await GET(
          new Request('http://localhost:3000/api/settings/sessions') as never,
        );
        const body = (await response.json()) as {
          sessions: unknown[];
          endedByLifetime: number;
        };

        expect(response.status).toBe(200);
        expect(mockRevokeSession).toHaveBeenCalledWith('sess_yesterday');
        expect(body.sessions).toEqual([]);
        expect(body.endedByLifetime).toBe(1);
      } finally {
        delete process.env['SESSION_ABSOLUTE_LIFETIME_HOURS'];
      }
    });

    // Signing other devices out is protective, and the control that calls this
    // sends no step-up header. Gating it would lock out the person who most
    // needs it: one who suspects a takeover and holds no second factor.
    it('ends every other session without asking for a second factor', async () => {
      mockGetSessionList.mockResolvedValue({
        data: [session('sess_current'), session('sess_other')],
        totalCount: 2,
      });

      const response = await DELETE(revokeAllRequest());

      expect(response.status).toBe(200);
      expect(mockRevokeSession.mock.calls.map(([id]) => id)).toContain('sess_other');
    });

    it('tells the account holder every session was ended, and counts what ended', async () => {
      mockGetSessionList.mockResolvedValue({
        data: [session('sess_current'), session('sess_other')],
        totalCount: 2,
      });
      mockNeonQuery.mockResolvedValue([{ id: 'credential-1' }, { id: 'credential-2' }]);

      const response = await DELETE(revokeAllRequest());

      expect(response.status).toBe(200);
      expect(mockEmitIdentitySecurityEvent).toHaveBeenCalledTimes(1);
      const [, emitted] = mockEmitIdentitySecurityEvent.mock.calls[0] as unknown as [
        unknown,
        Record<string, unknown>,
      ];
      expect(emitted['event']).toBe('all_sessions_revoked');
      expect(emitted['userId']).toBe('user-1');
      expect(emitted['context']).toContain('2 sessions ended');
      expect(emitted['detail']).toMatchObject({ count: 2, isCurrent: true, deleted: 2 });
      expect(await response.json()).toMatchObject({ deviceCredentialsRevoked: 2 });
    });

    it('raises nothing when the sweep could not finish', async () => {
      mockGetSessionList.mockResolvedValue({
        data: [session('sess_current'), session('sess_other')],
        totalCount: 2,
      });
      mockRevokeSession.mockRejectedValueOnce(providerError(500));

      const response = await DELETE(revokeAllRequest());

      expect(response.status).toBe(502);
      expect(mockEmitIdentitySecurityEvent).not.toHaveBeenCalled();
    });

    it('revokes other devices before ending the current session', async () => {
      mockGetSessionList.mockResolvedValue({
        data: [session('sess_current'), session('sess_other')],
        totalCount: 2,
      });

      const response = await DELETE(revokeAllRequest());

      expect(response.status).toBe(200);
      expect(mockRevokeSession.mock.calls.map(([id]) => id)).toEqual([
        'sess_other',
        'sess_current',
      ]);
      expect(await response.json()).toMatchObject({ currentSessionRevoked: true, revokedCount: 2 });
      expect(mockNeonQuery).toHaveBeenCalledWith(expect.stringContaining('device_refresh_tokens'), [
        'user-1',
      ]);
    });

    it('keeps the current session active and reports progress when a device cannot be revoked', async () => {
      mockGetSessionList.mockResolvedValue({
        data: [session('sess_current'), session('sess_other')],
        totalCount: 2,
      });
      mockRevokeSession.mockRejectedValueOnce(providerError(500));

      const response = await DELETE(revokeAllRequest());

      expect(response.status).toBe(502);
      expect(mockRevokeSession).toHaveBeenCalledTimes(1);
      expect(mockRevokeSession).not.toHaveBeenCalledWith('sess_current');
      expect(await response.json()).toMatchObject({
        error: 'Ended 0 of 1 sessions, try again to finish.',
        failedCount: 1,
        currentSessionRevoked: false,
      });
    });

    it('waits out a rate limit and finishes the revoke the provider refused', async () => {
      mockGetSessionList.mockResolvedValue({
        data: [session('sess_current'), session('sess_other')],
        totalCount: 2,
      });
      mockRevokeSession
        .mockRejectedValueOnce(providerError(429, 0))
        .mockResolvedValue({ status: 'revoked' });

      const response = await DELETE(revokeAllRequest());

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ revokedCount: 2, currentSessionRevoked: true });
      expect(mockRevokeSession.mock.calls.map(([id]) => id)).toEqual([
        'sess_other',
        'sess_other',
        'sess_current',
      ]);
    });

    it('gives up on a session the provider keeps rate limiting, and says how far it got', async () => {
      mockGetSessionList.mockResolvedValue({
        data: [session('sess_current'), session('sess_other')],
        totalCount: 2,
      });
      mockRevokeSession.mockRejectedValue(providerError(429, 0));

      const response = await DELETE(revokeAllRequest());

      expect(response.status).toBe(502);
      expect(mockRevokeSession).toHaveBeenCalledTimes(3);
      expect(mockRevokeSession).not.toHaveBeenCalledWith('sess_current');
      expect(await response.json()).toMatchObject({
        error: 'Ended 0 of 1 sessions, try again to finish.',
        failedCount: 1,
      });
    });

    it('treats a session the provider has already dropped as ended, not as a failure', async () => {
      mockGetSessionList.mockResolvedValue({
        data: [session('sess_current'), session('sess_gone')],
        totalCount: 2,
      });
      mockRevokeSession.mockImplementation(async (id: string) => {
        if (id === 'sess_gone') throw providerError(404);
        return { status: 'revoked' };
      });

      const response = await DELETE(revokeAllRequest());

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ currentSessionRevoked: true });
    });

    it('lists what it can hold and reports the rest instead of failing on size', async () => {
      const TOTAL = 2500;
      mockGetSessionList.mockImplementation(
        async ({ offset = 0, limit = 100 }: { offset?: number; limit?: number }) => ({
          data: Array.from({ length: Math.max(0, Math.min(limit, TOTAL - offset)) }, (_, index) =>
            session(`sess_${offset + index}`),
          ),
          totalCount: TOTAL,
        }),
      );

      const response = await GET(
        new Request('http://localhost:3000/api/settings/sessions') as never,
      );
      const body = (await response.json()) as {
        sessions: Array<Record<string, unknown>>;
        totalCount: number;
        returnedCount: number;
        truncated: boolean;
      };

      expect(response.status).toBe(200);
      expect(body.truncated).toBe(true);
      expect(body.totalCount).toBe(TOTAL);
      expect(body.returnedCount).toBe(body.sessions.length);
      expect(body.sessions.length).toBeGreaterThan(0);
      expect(body.sessions.length).toBeLessThan(TOTAL);
    });

    it('revokes every other session on an account too large to list in one page', async () => {
      const TOTAL = 2500;
      const active = new Set(
        Array.from({ length: TOTAL - 1 }, (_, index) => `sess_${index}`).concat('sess_current'),
      );
      mockGetSessionList.mockImplementation(async ({ limit = 100 }: { limit?: number }) => ({
        data: [...active].slice(0, limit).map((id) => session(id)),
        totalCount: active.size,
      }));
      mockRevokeSession.mockImplementation(async (id: string) => {
        active.delete(id);
        return { status: 'revoked' };
      });

      const response = await DELETE(revokeAllRequest());

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        currentSessionRevoked: true,
        revokedCount: TOTAL,
      });
      expect(active.size).toBe(0);
    });

    it('rejects a cookie caller that has no Clerk session id', async () => {
      mockAuth.mockResolvedValue({ userId: 'user-1', sessionId: null });
      mockGetSessionList.mockResolvedValue({ data: [], totalCount: 0 });

      const response = await GET(
        new Request('http://localhost:3000/api/settings/sessions') as never,
      );

      expect(response.status).toBe(401);
      expect(mockGetSessionList).not.toHaveBeenCalled();
    });
  });

  describe('Desktop device-token caller', () => {
    beforeEach(() => {
      mockVerifyToken.mockRejectedValue(new Error('not a clerk token'));
    });

    it('lists the account sessions and marks none of them as this device', async () => {
      mockGetSessionList.mockResolvedValue({
        data: [session('sess_browser'), session('sess_current')],
        totalCount: 2,
      });

      const response = await GET(bearerRequest('GET', 'desktop-device-token'));
      const body = (await response.json()) as {
        sessions: Array<{ id: string; isCurrent: boolean }>;
        currentSessionKnown: boolean;
      };

      expect(response.status).toBe(200);
      expect(body.currentSessionKnown).toBe(false);
      expect(body.sessions.map((row) => row.isCurrent)).toEqual([false, false]);
      expect(mockGetSessionList).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', status: 'active' }),
      );
    });

    it('never lets a cookie riding alongside the bearer decide which row is current', async () => {
      mockAuth.mockResolvedValue({ userId: 'user-9', sessionId: 'sess_current' });
      mockGetSessionList.mockResolvedValue({ data: [session('sess_current')], totalCount: 1 });

      const body = (await (await GET(bearerRequest('GET', 'desktop-device-token'))).json()) as {
        sessions: Array<{ isCurrent: boolean }>;
      };

      expect(body.sessions[0]?.isCurrent).toBe(false);
      expect(mockGetSessionList).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('revokes every browser session and reports that its own credential survived', async () => {
      mockGetSessionList.mockResolvedValue({
        data: [session('sess_a'), session('sess_b')],
        totalCount: 2,
      });

      const response = await DELETE(bearerRequest('DELETE', 'desktop-device-token'));

      expect(response.status).toBe(200);
      expect(mockRevokeSession.mock.calls.map(([id]) => id)).toEqual(['sess_a', 'sess_b']);
      expect(await response.json()).toMatchObject({
        revokedCount: 2,
        currentSessionRevoked: false,
      });
    });

    it('does not promise a surviving current session when a revocation fails', async () => {
      mockGetSessionList.mockResolvedValue({
        data: [session('sess_a'), session('sess_b')],
        totalCount: 2,
      });
      mockRevokeSession.mockRejectedValueOnce(new Error('upstream unavailable'));

      const response = await DELETE(bearerRequest('DELETE', 'desktop-device-token'));

      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({
        error: expect.not.stringMatching(/current session remains active/i),
        failedCount: 1,
      });
    });
  });

  describe('Mobile Clerk-session-JWT caller', () => {
    it('marks the row belonging to the calling token and revokes it last', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'user-1', sid: 'sess_mobile' });
      mockGetSessionList.mockResolvedValue({
        data: [session('sess_mobile'), session('sess_desktop_browser')],
        totalCount: 2,
      });

      const listBody = (await (await GET(bearerRequest('GET', 'clerk.session.jwt'))).json()) as {
        sessions: Array<{ id: string; isCurrent: boolean }>;
        currentSessionKnown: boolean;
      };
      expect(listBody.currentSessionKnown).toBe(true);
      expect(listBody.sessions[0]).toMatchObject({ id: 'sess_mobile', isCurrent: true });

      await DELETE(bearerRequest('DELETE', 'clerk.session.jwt'));

      expect(mockRevokeSession.mock.calls.map(([id]) => id)).toEqual([
        'sess_desktop_browser',
        'sess_mobile',
      ]);
    });

    it('ignores a sid whose subject is not the authenticated user', async () => {
      mockVerifyToken.mockResolvedValue({ sub: 'user-2', sid: 'sess_someone_else' });
      mockGetSessionList.mockResolvedValue({
        data: [session('sess_someone_else')],
        totalCount: 1,
      });

      const body = (await (await GET(bearerRequest('GET', 'clerk.session.jwt'))).json()) as {
        sessions: Array<{ isCurrent: boolean }>;
        currentSessionKnown: boolean;
      };

      expect(body.currentSessionKnown).toBe(false);
      expect(body.sessions[0]?.isCurrent).toBe(false);
    });
  });
});
