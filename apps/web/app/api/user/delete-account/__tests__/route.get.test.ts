import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockExecute, mockGetClerkAuthUser } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockGetClerkAuthUser: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
  getCorsHeaders: vi.fn(() => ({})),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/support',
  getClientIp: vi.fn(),
  logRateLimitExceeded: vi.fn(),
}));

vi.mock('@/lib/server/pseudonymize', () => ({
  pseudonymizeIdentifier: vi.fn(() => 'subject-ref'),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockQuery(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
    transaction: async (callback: (tx: unknown) => unknown) =>
      callback({
        query: (...args: unknown[]) => mockQuery(...args),
        execute: (...args: unknown[]) => mockExecute(...args),
      }),
  })),
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({ users: { deleteUser: vi.fn() } })),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn(async () => null) },
}));

import { GET } from '../route';

function statusRequest(url = 'http://localhost:3000/api/user/delete-account') {
  return new Request(url, {
    method: 'GET',
  }) as never;
}

function pgError(code: string): Error {
  return Object.assign(new Error(`postgres error ${code}`), { code });
}

describe('GET /api/user/delete-account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_checking' });
  });

  it('reports nothing pending when no deletion is scheduled', async () => {
    mockQuery.mockResolvedValue([{ deletion_requested_at: null, deletion_scheduled_for: null }]);

    const response = await GET(statusRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      pending: false,
      canCancel: false,
      requestedAt: null,
      scheduledFor: null,
    });
  });

  it('reports pending and cancellable while the grace window is open', async () => {
    const scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const requestedAt = new Date(Date.now() - 60 * 1000).toISOString();
    mockQuery.mockResolvedValue([
      { deletion_requested_at: requestedAt, deletion_scheduled_for: scheduledFor },
    ]);

    const response = await GET(statusRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.pending).toBe(true);
    expect(body.canCancel).toBe(true);
    expect(body.scheduledFor).toBe(scheduledFor);
    expect(body.requestedAt).toBe(requestedAt);
  });

  it('reports pending but not cancellable once the grace window has closed', async () => {
    const scheduledFor = new Date(Date.now() - 60 * 1000).toISOString();
    mockQuery.mockResolvedValue([
      { deletion_requested_at: scheduledFor, deletion_scheduled_for: scheduledFor },
    ]);

    const response = await GET(statusRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.pending).toBe(true);
    expect(body.canCancel).toBe(false);
  });

  it('treats missing deletion columns as nothing pending instead of failing', async () => {
    mockQuery.mockRejectedValue(pgError('42703'));

    const response = await GET(statusRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.pending).toBe(false);
  });

  it('returns 401 when the caller is not authenticated', async () => {
    mockGetClerkAuthUser.mockRejectedValue(new Error('no session'));

    const response = await GET(statusRequest());

    expect(response.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns 500 on an unexpected database error rather than guessing a status', async () => {
    mockQuery.mockRejectedValue(new Error('connection terminated'));

    const response = await GET(statusRequest());

    expect(response.status).toBe(500);
  });

  it('binds the read to the claimed session scope before checking deletion status', async () => {
    mockQuery.mockResolvedValue([{ deletion_requested_at: null, deletion_scheduled_for: null }]);

    await GET(statusRequest());

    expect(mockExecute).toHaveBeenCalledWith('set local role app_rls');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("set_config('request.jwt.claim.sub', $1, true)"),
      ['user_checking', ''],
    );
  });

  it('ignores an identity smuggled into the query string and scopes to the session user', async () => {
    mockQuery.mockResolvedValue([{ deletion_requested_at: null, deletion_scheduled_for: null }]);

    await GET(statusRequest('http://localhost:3000/api/user/delete-account?userId=victim-user'));

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('where id = $1'), [
      'user_checking',
    ]);
    expect(
      mockQuery.mock.calls.some(
        ([, params]) => Array.isArray(params) && params.includes('victim-user'),
      ),
    ).toBe(false);
  });
});
