import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockAuth, mockGetSessionList, mockRevokeSession } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetSessionList: vi.fn(),
  mockRevokeSession: vi.fn(),
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

describe('/api/settings/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1', sessionId: 'sess_current' });
    mockRevokeSession.mockResolvedValue({ status: 'revoked' });
  });

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

    const response = await GET(new Request('http://localhost:3000/api/settings/sessions') as never);
    const body = (await response.json()) as {
      sessions: Array<Record<string, unknown>>;
      totalCount: number;
    };

    expect(response.status).toBe(200);
    expect(body.totalCount).toBe(2);
    expect(body.sessions[0]).toMatchObject({ id: 'sess_current', isCurrent: true, device: 'Mac' });
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
    expect(mockRevokeSession.mock.calls.map(([id]) => id)).toEqual(['sess_other', 'sess_current']);
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
});
