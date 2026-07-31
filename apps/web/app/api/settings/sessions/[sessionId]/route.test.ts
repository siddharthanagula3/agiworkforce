import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockAuth, mockGetSession, mockRevokeSession } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetSession: vi.fn(),
  mockRevokeSession: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  clerkClient: vi.fn(async () => ({
    sessions: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
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

import { DELETE } from './route';

function request(sessionId: string) {
  return DELETE(
    new Request(`http://localhost:3000/api/settings/sessions/${sessionId}`, {
      method: 'DELETE',
    }) as never,
    { params: Promise.resolve({ sessionId }) },
  );
}

describe('DELETE /api/settings/sessions/[sessionId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1', sessionId: 'sess_current' });
    mockRevokeSession.mockResolvedValue({ status: 'revoked' });
  });

  it('revokes an owned session and reports whether it was current', async () => {
    mockGetSession.mockResolvedValue({
      id: 'sess_current',
      userId: 'user-1',
      status: 'active',
    });

    const response = await request('sess_current');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: 'Session revoked', isCurrent: true });
    expect(mockRevokeSession).toHaveBeenCalledWith('sess_current');
  });

  it('does not disclose or revoke another user session', async () => {
    mockGetSession.mockResolvedValue({
      id: 'sess_otheruser',
      userId: 'user-2',
      status: 'active',
    });

    const response = await request('sess_otheruser');

    expect(response.status).toBe(404);
    expect(mockRevokeSession).not.toHaveBeenCalled();
  });

  it('rejects malformed session identifiers before calling Clerk', async () => {
    const response = await request('../user-2');

    expect(response.status).toBe(400);
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockRevokeSession).not.toHaveBeenCalled();
  });
});
