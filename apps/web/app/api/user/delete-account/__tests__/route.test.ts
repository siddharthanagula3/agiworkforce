import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockExecute, mockQuery, mockEraseUserAccountData, mockDeleteUser, mockGetSubscription } =
  vi.hoisted(() => ({
    mockExecute: vi.fn(),
    mockQuery: vi.fn(),
    mockEraseUserAccountData: vi.fn(),
    mockDeleteUser: vi.fn(),
    mockGetSubscription: vi.fn(),
  }));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(async () => null),
}));

vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
  getCorsHeaders: vi.fn(() => ({})),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user_deleting' })),
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
    execute: (...args: unknown[]) => mockExecute(...args),
    query: (...args: unknown[]) => mockQuery(...args),
    transaction: async (callback: (tx: unknown) => unknown) =>
      callback({
        execute: (...args: unknown[]) => mockExecute(...args),
        query: (...args: unknown[]) => mockQuery(...args),
      }),
  })),
}));

vi.mock('@/lib/server/account-erasure', () => ({
  eraseUserAccountData: (...args: unknown[]) => mockEraseUserAccountData(...args),
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({ users: { deleteUser: mockDeleteUser } })),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
  },
}));

import { DELETE } from '../route';

function deleteRequest(url = 'http://localhost:3000/api/user/delete-account') {
  return new Request(url, {
    method: 'DELETE',
  }) as never;
}

function pgError(code: string): Error {
  return Object.assign(new Error(`postgres error ${code}`), { code });
}

const completeErasure = {
  userId: 'user_deleting',
  mediaObjectsDeleted: 0,
  mediaObjectsFailed: 0,
  mediaRowsDeleted: 0,
  tables: {},
  complete: true,
};

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_row_1',
    user_id: 'user_deleting',
    plan_tier: 'pro',
    status: 'active',
    current_period_start: new Date('2026-08-01T00:00:00.000Z'),
    current_period_end: new Date('2026-09-01T00:00:00.000Z'),
    cancel_at_period_end: false,
    stripe_subscription_id: null,
    stripe_price_id: null,
    ...overrides,
  };
}

describe('DELETE /api/user/delete-account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEraseUserAccountData.mockResolvedValue(completeErasure);
    mockDeleteUser.mockResolvedValue(undefined);
    mockGetSubscription.mockResolvedValue(null);
  });

  it('schedules deletion when the update touches the profile row', async () => {
    mockExecute.mockResolvedValue(1);

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scheduledFor).toBeTruthy();
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('erases immediately only when the deletion columns are missing (42703)', async () => {
    mockExecute.mockRejectedValue(pgError('42703'));

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scheduledFor).toBeUndefined();
    expect(mockEraseUserAccountData).toHaveBeenCalledWith('user_deleting');
    expect(mockDeleteUser).toHaveBeenCalledWith('user_deleting');
  });

  it('does not hard-delete on a transient database error', async () => {
    mockExecute.mockRejectedValue(
      Object.assign(new Error('terminating connection due to administrator command'), {
        code: '57P01',
      }),
    );

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(body.error).toMatch(/Nothing was deleted/i);
  });

  it('does not hard-delete on an error carrying no Postgres code', async () => {
    mockExecute.mockRejectedValue(new Error('fetch failed'));

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(500);
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('fails loudly when the update matches no profile row', async () => {
    mockExecute.mockResolvedValue(0);

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.scheduledFor).toBeUndefined();
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it.each(['active', 'trialing', 'past_due'])(
    'refuses deletion with 409 while a paid subscription is %s',
    async (status) => {
      mockExecute.mockResolvedValue(1);
      mockGetSubscription.mockResolvedValue(subscription({ status }));

      const response = await DELETE(deleteRequest());
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.reason).toBe('active_subscription');
      expect(body.error).toMatch(/cancel/i);
      expect(mockExecute).not.toHaveBeenCalled();
      expect(mockEraseUserAccountData).not.toHaveBeenCalled();
      expect(mockDeleteUser).not.toHaveBeenCalled();
    },
  );

  it('tells a user whose plan is already cancelled when it ends instead of asking again', async () => {
    mockGetSubscription.mockResolvedValue(subscription({ cancel_at_period_end: true }));

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.cancelAtPeriodEnd).toBe(true);
    expect(body.error).toContain('2026-09-01');
  });

  it.each([
    ['no subscription row', null],
    ['a free plan', subscription({ plan_tier: 'free' })],
    ['a canceled paid plan', subscription({ status: 'canceled' })],
  ])('schedules deletion for %s', async (_label, sub) => {
    mockExecute.mockResolvedValue(1);
    mockGetSubscription.mockResolvedValue(sub);

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scheduledFor).toBeTruthy();
  });

  it('does not delete anything when the subscription lookup fails', async () => {
    mockGetSubscription.mockRejectedValue(new Error('connection terminated'));

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toMatch(/nothing was deleted/i);
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('does not claim data was untouched when an immediate erasure is partial', async () => {
    mockExecute.mockRejectedValue(pgError('42703'));
    mockEraseUserAccountData.mockResolvedValue({
      ...completeErasure,
      tables: { web_conversations: { deleted: true }, profiles: { deleted: false, error: 'boom' } },
      complete: false,
    });

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).not.toMatch(/no data was partially removed/i);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('binds the scheduling update to the claimed session scope', async () => {
    mockExecute.mockResolvedValue(1);

    await DELETE(deleteRequest());

    expect(mockExecute).toHaveBeenCalledWith('set local role app_rls');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("set_config('request.jwt.claim.sub', $1, true)"),
      ['user_deleting', ''],
    );
  });

  it('ignores an identity smuggled into the query string and schedules deletion for the session user', async () => {
    mockExecute.mockResolvedValue(1);

    const response = await DELETE(
      deleteRequest('http://localhost:3000/api/user/delete-account?userId=victim-user'),
    );

    expect(response.status).toBe(200);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('where id = $3'),
      expect.arrayContaining(['user_deleting']),
    );
    expect(
      mockExecute.mock.calls.some(
        ([, params]) => Array.isArray(params) && params.includes('victim-user'),
      ),
    ).toBe(false);
  });
});
