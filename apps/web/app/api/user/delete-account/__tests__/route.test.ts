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
  logAuthFailure: vi.fn(async () => undefined),
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

vi.mock('@/lib/server/account-erasure', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/account-erasure')>()),
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

import { recordAuditEvent } from '@/lib/security-audit';

import { DELETE } from '../route';

function auditDetail(): Record<string, unknown> {
  const call = vi.mocked(recordAuditEvent).mock.calls.at(-1)?.[0] as
    { detail?: Record<string, unknown> } | undefined;
  return call?.detail ?? {};
}

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
  backupObjectsDeleted: 0,
  backupObjectsFailed: 0,
  knowledgeObjectsDeleted: 0,
  knowledgeObjectsFailed: 0,
  avatarObjectsDeleted: 0,
  avatarObjectsFailed: 0,
  cacheKeysDeleted: 0,
  cacheKeysFailed: 0,
  tables: { web_conversations: { deleted: true } },
  anonymized: {},
  complete: true,
  profileRetained: false,
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
    mockQuery.mockResolvedValue([]);
  });

  function ownsAlone(...workspaces: Array<{ id: string; name: string | null }>) {
    mockQuery.mockImplementation(async (sql: unknown) =>
      String(sql).includes('organization_members') ? workspaces : [],
    );
  }

  it('refuses while the account is the only owner of a workspace, and deletes nothing', async () => {
    // The owner invariant is already enforced when a sole owner tries to leave,
    // be demoted, or be removed. Deleting the account reached the same end by a
    // route that never asked, leaving a workspace nobody could administer.
    mockExecute.mockResolvedValue(1);
    ownsAlone({ id: 'org-1', name: 'Acme' });

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.reason).toBe('sole_organization_owner');
    expect(body.error).toContain('Acme');
    expect(body.workspaces).toEqual([{ id: 'org-1', name: 'Acme' }]);
    expect(mockExecute).not.toHaveBeenCalledWith(
      expect.stringContaining('deletion_requested_at'),
      expect.anything(),
    );
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('names every workspace the account owns alone, so the user knows what to hand over', async () => {
    mockExecute.mockResolvedValue(1);
    ownsAlone({ id: 'org-1', name: 'Acme' }, { id: 'org-2', name: 'Globex' });

    const body = await (await DELETE(deleteRequest())).json();

    expect(body.error).toContain('Acme');
    expect(body.error).toContain('Globex');
  });

  it('still refuses when the workspace has no name', async () => {
    mockExecute.mockResolvedValue(1);
    ownsAlone({ id: 'org-1', name: null });

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(409);
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
  });

  it('proceeds when the sole-owned workspace is already scheduled for deletion', async () => {
    // The query excludes those rows, so an owner who decommissioned the
    // workspace first is not trapped between two deletions.
    mockExecute.mockResolvedValue(1);
    let ownershipSql = '';
    mockQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('organization_members')) ownershipSql = String(sql);
      return [];
    });

    expect((await DELETE(deleteRequest())).status).toBe(200);
    expect(ownershipSql).toContain('deletion_scheduled_for is null');
  });

  it('still guards ownership where the deletion-schedule column is not there yet', async () => {
    // Refusing every account deletion because a later migration has not run is a
    // worse answer than asking the question the schema can answer.
    mockExecute.mockResolvedValue(1);
    const seen: string[] = [];
    mockQuery.mockImplementation(async (sql: unknown) => {
      const text = String(sql);
      if (!text.includes('organization_members')) return [];
      seen.push(text);
      if (text.includes('deletion_scheduled_for')) throw pgError('42703');
      return [{ id: 'org-1', name: 'Acme' }];
    });

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(409);
    expect(seen).toHaveLength(2);
    expect(seen[1]).not.toContain('deletion_scheduled_for');
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
  });

  it('proceeds when the account owns nothing alone', async () => {
    mockExecute.mockResolvedValue(1);

    expect((await DELETE(deleteRequest())).status).toBe(200);
  });

  it('deletes nothing when the ownership lookup fails, rather than assuming nobody is owned', async () => {
    mockExecute.mockResolvedValue(1);
    mockQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('organization_members')) throw new Error('connection reset');
      return [];
    });

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(503);
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('schedules deletion when the update touches the profile row', async () => {
    mockExecute.mockResolvedValue(1);

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scheduledFor).toBeTruthy();
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(auditDetail()).toMatchObject({
      status: 'pending',
      reason: expect.stringContaining(body.scheduledFor),
    });
  });

  it('erases immediately only when the deletion columns are missing (42703)', async () => {
    mockExecute.mockRejectedValue(pgError('42703'));

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scheduledFor).toBeUndefined();
    expect(mockEraseUserAccountData).toHaveBeenCalledWith('user_deleting');
    expect(mockDeleteUser).toHaveBeenCalledWith('user_deleting');
    expect(auditDetail()).toMatchObject({ status: 'complete' });
    // The holder reads a plain sentence; store and hold counts stay in the audit row.
    expect(body.status).toBe('complete');
    expect(body.statusReason).toBe('Everything in your account has been deleted.');
    expect(String(auditDetail()['reason'])).toMatch(/stores cleared/);
    expect(body.statusReason).not.toMatch(/store|hold/i);
  });

  it('records a legal hold as blocked rather than as a deletion that happened', async () => {
    mockExecute.mockRejectedValue(pgError('42703'));
    mockEraseUserAccountData.mockResolvedValue({
      ...completeErasure,
      tables: {
        legal_holds: {
          deleted: false,
          retainedForRetry: true,
          error: 'Subject is under an active legal hold; data preserved.',
        },
      },
      complete: false,
    });

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(500);
    expect(mockDeleteUser).not.toHaveBeenCalled();
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
