import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  mockQuery,
  mockExecute,
  mockGetClerkAuthUser,
  mockRequireCsrfToken,
  mockWithRateLimit,
  mockRecordAuditEvent,
  mockGetNeonDb,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockGetClerkAuthUser: vi.fn(),
  mockRequireCsrfToken: vi.fn(),
  mockWithRateLimit: vi.fn(),
  mockRecordAuditEvent: vi.fn(),
  mockGetNeonDb: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (...args: unknown[]) => mockWithRateLimit(...args),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: (...args: unknown[]) => mockRequireCsrfToken(...args),
}));

vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
  getCorsHeaders: vi.fn(() => ({})),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: async (...args: unknown[]) => {
    const { userId } = (await mockGetClerkAuthUser(...args)) as { userId: string };
    return {
      db: {
        query: (...queryArgs: unknown[]) => mockQuery(...queryArgs),
        execute: (...executeArgs: unknown[]) => mockExecute(...executeArgs),
        transaction: async (callback: (tx: unknown) => unknown) =>
          callback({
            query: (...queryArgs: unknown[]) => mockQuery(...queryArgs),
            execute: (...executeArgs: unknown[]) => mockExecute(...executeArgs),
          }),
      },
      userId,
      organizationId: null,
    };
  },
}));

vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args),
  BLOCK_APPEAL_PATH: '/support',
  logAuthFailure: vi.fn(async () => undefined),
  getClientIp: vi.fn(),
  logRateLimitExceeded: vi.fn(),
}));

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mockGetNeonDb }));

vi.mock('@/lib/server/pseudonymize', () => ({
  pseudonymizeIdentifier: vi.fn(() => 'subject-ref'),
}));

import { POST } from '../route';

function cancelRequest() {
  return new Request('http://localhost:3000/api/user/delete-account/cancel', {
    method: 'POST',
  }) as never;
}

function pgError(code: string): Error {
  return Object.assign(new Error(`postgres error ${code}`), { code });
}

describe('POST /api/user/delete-account/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_cancelling' });
    mockRequireCsrfToken.mockResolvedValue(null);
    mockWithRateLimit.mockResolvedValue(null);
  });

  it('cancels a deletion inside the grace window and records it symmetrically with scheduling', async () => {
    mockQuery.mockResolvedValueOnce([{ id: 'user_cancelling' }]);

    const response = await POST(cancelRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cancelled).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const update = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('deletion_requested_at'),
    );
    const [sql, params] = update as [string, unknown[]];
    expect(sql).toMatch(/deletion_requested_at\s*=\s*null/i);
    expect(sql).toMatch(/deletion_scheduled_for\s*=\s*null/i);
    expect(sql).toMatch(/deletion_scheduled_for\s*>\s*now\(\)/i);
    expect(params).toEqual(['user_cancelling']);

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'account_deletion_cancelled',
        detail: expect.objectContaining({ resourceType: 'account', subjectRef: 'subject-ref' }),
      }),
    );
  });

  it('is a clean no-op when nothing is pending, not a 500', async () => {
    mockQuery
      .mockResolvedValueOnce([]) // conditional UPDATE matches nothing
      .mockResolvedValueOnce([{ deletion_scheduled_for: null }]); // follow-up SELECT

    const response = await POST(cancelRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cancelled).toBe(false);
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses to cancel once the grace window has closed, and does not touch the columns', async () => {
    const expired = new Date(Date.now() - 60 * 1000).toISOString();
    mockQuery
      .mockResolvedValueOnce([]) // conditional UPDATE matches nothing (expired)
      .mockResolvedValueOnce([{ deletion_scheduled_for: expired }]);

    const response = await POST(cancelRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.cancelled).toBe(false);
    expect(body.reason).toBe('grace_window_expired');
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('treats missing deletion columns as nothing pending instead of failing', async () => {
    mockQuery.mockRejectedValueOnce(pgError('42703'));

    const response = await POST(cancelRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cancelled).toBe(false);
  });

  it('returns 401 when the caller is not authenticated, and never touches the database', async () => {
    mockGetClerkAuthUser.mockRejectedValue(new Error('no session'));

    const response = await POST(cancelRequest());

    expect(response.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is scoped to the caller: the UPDATE is parameterised by their own userId, not a client-supplied id', async () => {
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_other_caller' });
    mockQuery.mockResolvedValueOnce([{ id: 'user_other_caller' }]);

    await POST(cancelRequest());

    const update = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('deletion_requested_at'),
    );
    const [, params] = update as [string, unknown[]];
    expect(params).toEqual(['user_other_caller']);
  });

  it('runs the cancellation update on the caller-scoped client, never the schema owner', async () => {
    mockQuery.mockResolvedValueOnce([{ id: 'user_cancelling' }]);

    await POST(cancelRequest());

    expect(mockGetNeonDb).not.toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('deletion_requested_at'), [
      'user_cancelling',
    ]);
  });

  it('ignores an identity smuggled into the query string and cancels for the session user', async () => {
    mockQuery.mockResolvedValueOnce([{ id: 'user_cancelling' }]);

    const response = await POST(
      new Request('http://localhost:3000/api/user/delete-account/cancel?userId=victim-user', {
        method: 'POST',
      }) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cancelled).toBe(true);
    expect(
      mockQuery.mock.calls.some(
        ([, params]) => Array.isArray(params) && params.includes('victim-user'),
      ),
    ).toBe(false);
  });

  it('rejects the request when CSRF validation fails', async () => {
    const csrfResponse = new Response(JSON.stringify({ error: 'CSRF token invalid' }), {
      status: 403,
    });
    mockRequireCsrfToken.mockResolvedValue(csrfResponse);

    const response = await POST(cancelRequest());

    expect(response.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects the request when the rate limit is exceeded', async () => {
    const rateLimitResponse = new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
    });
    mockWithRateLimit.mockResolvedValue(rateLimitResponse);

    const response = await POST(cancelRequest());

    expect(response.status).toBe(429);
    expect(mockGetClerkAuthUser).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('does not hard-fail on an unexpected database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection terminated'));

    const response = await POST(cancelRequest());

    expect(response.status).toBe(500);
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });
});
