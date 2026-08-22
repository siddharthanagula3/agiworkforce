import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  mockAuth,
  mockGetSessionList,
  mockRevokeSession,
  mockGetClerkAuthUser,
  mockVerifyToken,
  mockNeonExecute,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetSessionList: vi.fn(),
  mockRevokeSession: vi.fn(),
  mockGetClerkAuthUser: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockNeonExecute: vi.fn(async () => 1),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ execute: mockNeonExecute }),
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

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
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

function session(
  id: string,
  overrides: Partial<{
    userId: string;
    status: string;
    lastActiveAt: number;
    latestActivity: Record<string, unknown>;
  }> = {},
) {
  return {
    id,
    clientId: `client-${id}`,
    userId: overrides.userId ?? 'user-1',
    status: overrides.status ?? 'active',
    createdAt: Date.parse('2026-07-01T12:00:00.000Z'),
    updatedAt: Date.parse('2026-07-02T12:00:00.000Z'),
    lastActiveAt: overrides.lastActiveAt ?? Date.parse('2026-07-03T12:00:00.000Z'),
    expireAt: Date.parse('2026-08-01T12:00:00.000Z'),
    abandonAt: Date.parse('2026-08-02T12:00:00.000Z'),
    latestActivity: overrides.latestActivity,
    actor: null,
  };
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
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-1' });
    mockRevokeSession.mockResolvedValue({ status: 'revoked' });
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

    it('revokes other devices before ending the current session', async () => {
      mockGetSessionList.mockResolvedValue({
        data: [session('sess_current'), session('sess_other')],
        totalCount: 2,
      });

      const response = await DELETE(
        new Request('http://localhost:3000/api/settings/sessions', { method: 'DELETE' }) as never,
      );

      expect(response.status).toBe(200);
      expect(mockRevokeSession.mock.calls.map(([id]) => id)).toEqual([
        'sess_other',
        'sess_current',
      ]);
      expect(await response.json()).toMatchObject({ currentSessionRevoked: true, revokedCount: 2 });
      expect(mockNeonExecute).toHaveBeenCalledWith(
        expect.stringContaining('device_refresh_tokens'),
        ['user-1'],
      );
    });

    it('keeps the current session active when another device cannot be revoked', async () => {
      mockGetSessionList.mockResolvedValue({
        data: [session('sess_current'), session('sess_other')],
        totalCount: 2,
      });
      mockRevokeSession.mockRejectedValueOnce(new Error('upstream unavailable'));

      const response = await DELETE(
        new Request('http://localhost:3000/api/settings/sessions', { method: 'DELETE' }) as never,
      );

      expect(response.status).toBe(502);
      expect(mockRevokeSession).toHaveBeenCalledTimes(1);
      expect(mockRevokeSession).not.toHaveBeenCalledWith('sess_current');
      expect(await response.json()).toMatchObject({
        error: expect.stringMatching(/current session remains active/i),
        failedCount: 1,
      });
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
