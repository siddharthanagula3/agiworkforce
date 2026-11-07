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
  isAccountUnavailableError: vi.fn(() => false),
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/support',
  logAuthFailure: vi.fn(async () => undefined),
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
import { parseAccountDeletionStatus } from '@agiworkforce/cloud-contracts';

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
    mockQuery.mockResolvedValue([{ deletion_requested_at: null, deletion_scheduled_for: null, can_cancel: false }]);

    const response = await GET(statusRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      pending: false,
      canCancel: false,
      requestedAt: null,
      scheduledFor: null,
      status: 'pending',
      statusReason: 'Deletion has been requested and has not started.',
    });
  });

  it('preserves SQL UTC microseconds and the pair snapshot marker', async () => {
    const requestedAt = '2020-01-01T11:00:00.123456Z';
    const scheduledFor = '2020-01-02T11:00:00.123457Z';
    mockQuery.mockResolvedValue([{ deletion_requested_at: requestedAt, deletion_scheduled_for: scheduledFor, can_cancel: true }]);
    const response = await GET(statusRequest());
    expect(response.status).toBe(200);
    expect(parseAccountDeletionStatus(await response.json())).toEqual({
      pending: true, canCancel: true, requestedAt, scheduledFor,
      cancellationPrecondition: 'schedule-pair-v1',
    });
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('HH24:MI:SS.US'), ['user_checking']);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("at time zone 'UTC'"), ['user_checking']);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('clock_timestamp()'), ['user_checking']);
    for (const column of ['deletion_requested_at', 'deletion_scheduled_for']) {
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining(`${column} >= '0001-01-01T00:00:00Z'::timestamptz`), ['user_checking']);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining(`${column} < '10000-01-01T00:00:00Z'::timestamptz`), ['user_checking']);
    }
  });

  it('preserves nullable request timestamps in pair snapshots', async () => {
    const scheduledFor = '2020-01-02T11:00:00.000001Z';
    mockQuery.mockResolvedValue([{ deletion_requested_at: null, deletion_scheduled_for: scheduledFor, can_cancel: false }]);
    expect(parseAccountDeletionStatus(await (await GET(statusRequest())).json())).toEqual({
      pending: true, canCancel: false, requestedAt: null, scheduledFor,
      cancellationPrecondition: 'schedule-pair-v1',
    });
  });

  it.each([new Date('2020-01-01T00:00:00Z'), '2020-01-01T01:00:00+01:00', 'infinity', 'unsupported', '2026-02-30T00:00:00Z'])
    ('fails closed instead of advertising lossy or unsupported timestamps: %s', async (value) => {
      mockQuery.mockResolvedValue([{ deletion_requested_at: null, deletion_scheduled_for: value, can_cancel: true }]);
      const response = await GET(statusRequest());
      expect(response.status).toBe(500);
      expect(await response.json()).not.toHaveProperty('cancellationPrecondition');
    });

  it.each([undefined, null, {}, [{}], [{ deletion_requested_at: null, deletion_scheduled_for: null }]])
    ('fails closed on malformed status adapter results: %j', async (rows) => {
      mockQuery.mockResolvedValue(rows);
      expect((await GET(statusRequest())).status).toBe(500);
    });

  it('preserves no visible profile as no pending schedule without marker', async () => {
    mockQuery.mockResolvedValue([]);
    const body = await (await GET(statusRequest())).json();
    expect(body).toMatchObject({ pending: false, canCancel: false, scheduledFor: null });
    expect(body).not.toHaveProperty('cancellationPrecondition');
  });

  /**
   * The audit row has carried this outcome since deletion was built. Returning
   * it is what turns "something is scheduled" into a receipt the account holder
   * can read, including when a hold is what is really holding it up.
   */
  it('hands back the same outcome the deletion trail records', async () => {
    const scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockQuery.mockResolvedValue([
      { deletion_requested_at: scheduledFor, deletion_scheduled_for: scheduledFor, can_cancel: false },
    ]);

    const body = await (await GET(statusRequest())).json();

    expect(body.status).toBe('pending');
    expect(body.statusReason).toBe(
      `Deletion is scheduled for ${scheduledFor} and has not started.`,
    );
  });

  it('reports pending and cancellable while the grace window is open', async () => {
    const scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const requestedAt = new Date(Date.now() - 60 * 1000).toISOString();
    mockQuery.mockResolvedValue([
      { deletion_requested_at: requestedAt, deletion_scheduled_for: scheduledFor, can_cancel: true },
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
      { deletion_requested_at: scheduledFor, deletion_scheduled_for: scheduledFor, can_cancel: false },
    ]);

    const response = await GET(statusRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.pending).toBe(true);
    expect(body.canCancel).toBe(false);
  });

  it('fails instead of reporting nothing pending when the deletion columns are missing', async () => {
    mockQuery.mockRejectedValue(pgError('42703'));

    const response = await GET(statusRequest());

    expect(response.status).toBe(500);
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
    mockQuery.mockResolvedValue([{ deletion_requested_at: null, deletion_scheduled_for: null, can_cancel: false }]);

    await GET(statusRequest());

    expect(mockExecute).toHaveBeenCalledWith('set local role app_rls');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("set_config('request.jwt.claim.sub', $1, true)"),
      ['user_checking', ''],
    );
  });

  it('ignores an identity smuggled into the query string and scopes to the session user', async () => {
    mockQuery.mockResolvedValue([{ deletion_requested_at: null, deletion_scheduled_for: null, can_cancel: false }]);

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
