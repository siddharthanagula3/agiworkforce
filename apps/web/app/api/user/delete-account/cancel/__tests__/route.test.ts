import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  mockQuery,
  mockExecute,
  mockGetClerkAuthUser,
  mockRequireCsrfToken,
  mockWithRateLimit,
  mockRecordAuditEvent,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockGetClerkAuthUser: vi.fn(),
  mockRequireCsrfToken: vi.fn(),
  mockWithRateLimit: vi.fn(),
  mockRecordAuditEvent: vi.fn(),
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

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args),
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
    mockQuery
      .mockResolvedValueOnce([]) // claimed-scope bind ahead of the UPDATE
      .mockResolvedValueOnce([{ id: 'user_cancelling' }]);

    const response = await POST(cancelRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cancelled).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(2);
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
      .mockResolvedValueOnce([]) // claimed-scope bind ahead of the UPDATE
      .mockResolvedValueOnce([]) // conditional UPDATE matches nothing
      .mockResolvedValueOnce([]) // claimed-scope bind ahead of the follow-up SELECT
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
      .mockResolvedValueOnce([]) // claimed-scope bind ahead of the UPDATE
      .mockResolvedValueOnce([]) // conditional UPDATE matches nothing (expired)
      .mockResolvedValueOnce([]) // claimed-scope bind ahead of the follow-up SELECT
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
    mockQuery
      .mockResolvedValueOnce([]) // claimed-scope bind ahead of the UPDATE
      .mockResolvedValueOnce([{ id: 'user_other_caller' }]);

    await POST(cancelRequest());

    const update = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('deletion_requested_at'),
    );
    const [, params] = update as [string, unknown[]];
    expect(params).toEqual(['user_other_caller']);
  });

  it('binds the cancellation update to the claimed session scope', async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'user_cancelling' }]);

    await POST(cancelRequest());

    expect(mockExecute).toHaveBeenCalledWith('set local role app_rls');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("set_config('request.jwt.claim.sub', $1, true)"),
      ['user_cancelling', ''],
    );
  });

  it('ignores an identity smuggled into the query string and cancels for the session user', async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'user_cancelling' }]);

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
