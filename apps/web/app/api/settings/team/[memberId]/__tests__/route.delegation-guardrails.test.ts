import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const permissionRole = vi.hoisted(() => ({ value: 'admin' as string | null }));
const requesterRole = vi.hoisted(() => ({ value: 'admin' as string }));

vi.mock('@/lib/services/organization-permission-service', async () =>
  (
    await import('@/lib/services/__tests__/organization-permission-service-mock')
  ).organizationPermissionServiceMock(permissionRole),
);

const { mockQuery, mockExecute, mockTransaction } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'actor-user' })),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: vi.fn(async () => ({
    plan: 'team',
    canManageTeam: true,
    maxMembers: null,
  })),
}));
vi.mock('@/lib/security-audit', () => ({
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(async () => undefined),
  recordAuditEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/services/deprovision-service', () => ({
  deprovisionMember: vi.fn(async () => ({
    sessionsRevoked: 0,
    deviceTokensRevoked: 0,
    apiKeysRevoked: 0,
    errors: [],
  })),
}));
vi.mock('@/lib/server/identity', () => ({
  getRequestIdentity: vi.fn(async () => null),
  getIdentityProvider: vi.fn(() => ({})),
}));
vi.mock('@/lib/server/request-context-cache', () => ({
  getCachedActiveOrganizationId: vi.fn(async () => null),
  invalidateActiveOrganizationCache: vi.fn(async () => undefined),
}));

const adapter = {
  query: (...args: unknown[]) => mockQuery(...args),
  execute: (...args: unknown[]) => mockExecute(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args),
};

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => adapter) }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: adapter,
    userId: 'actor-user',
    organizationId: null,
  })),
}));

import { DELETE, PATCH } from '../route';

const organizationId = '11111111-1111-4111-8111-111111111111';

function member(userId: string, role: string) {
  return {
    organization_id: organizationId,
    user_id: userId,
    role,
    provisioning_source: 'manual',
    provisioned_at: null,
    joined_at: '2026-07-23T00:00:00.000Z',
  };
}

function params(targetUserId: string) {
  return { params: Promise.resolve({ memberId: `${organizationId}:${targetUserId}` }) };
}

function patchRequest(targetUserId: string, role: string) {
  return new Request(`http://localhost:3000/api/settings/team/${organizationId}:${targetUserId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role }),
  }) as never;
}

function deleteRequest(targetUserId: string) {
  return new Request(`http://localhost:3000/api/settings/team/${organizationId}:${targetUserId}`, {
    method: 'DELETE',
  }) as never;
}

/** lock, requester lookup, target lookup, owner count. */
function transactionRows(targetRole: string, ownerCount: string) {
  mockQuery
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([member('actor-user', requesterRole.value)])
    .mockResolvedValueOnce([member('target-user', targetRole)])
    .mockResolvedValueOnce([{ owner_count: ownerCount }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  permissionRole.value = 'admin';
  requesterRole.value = 'admin';
  mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      query: (...args: unknown[]) => mockQuery(...args),
      execute: (...args: unknown[]) => mockExecute(...args),
    }),
  );
});

describe('owner protection on the member route', () => {
  it('refuses a delegated admin who tries to remove an owner', async () => {
    transactionRows('owner', '3');

    const response = await DELETE(deleteRequest('target-user'), params('target-user'));

    expect(response.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('refuses a delegated admin who tries to demote an owner', async () => {
    transactionRows('owner', '3');

    const response = await PATCH(patchRequest('target-user', 'member'), params('target-user'));

    expect(response.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('refuses an owner who would leave the workspace with none', async () => {
    requesterRole.value = 'owner';
    permissionRole.value = 'owner';
    transactionRows('owner', '1');

    const response = await DELETE(deleteRequest('target-user'), params('target-user'));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: expect.objectContaining({ message: expect.stringContaining('cannot be recovered') }),
    });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('lets an owner demote another owner once a second one exists', async () => {
    requesterRole.value = 'owner';
    permissionRole.value = 'owner';
    transactionRows('owner', '2');
    mockExecute.mockResolvedValueOnce(undefined);

    const response = await PATCH(patchRequest('target-user', 'admin'), params('target-user'));

    expect(response.status).toBe(200);
  });

  it('serializes simultaneous owner updates so the second one sees the first', async () => {
    requesterRole.value = 'owner';
    permissionRole.value = 'owner';
    // Two owners, and two requests that each demote the other one. Without the
    // lock both read a count of two and the workspace ends with no owner.
    const roles = new Map([
      ['actor-user', 'owner'],
      ['owner-b', 'owner'],
    ]);
    const ownerCount = () => [...roles.values()].filter((role) => role === 'owner').length;

    mockQuery.mockImplementation(async (sql: string, args: unknown[] = []) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('owner_count')) return [{ owner_count: String(ownerCount()) }];
      const userId = String(args[1]);
      const role = roles.get(userId);
      return role ? [member(userId, role)] : [];
    });
    mockExecute.mockImplementation(async (_sql: string, args: unknown[] = []) => {
      roles.set(String(args[2]), String(args[0]));
    });

    // The advisory lock the route takes is what makes the count trustworthy,
    // so the mock holds one transaction at a time exactly as Postgres would.
    let lock = Promise.resolve();
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const run = lock.then(() =>
        callback({
          query: (...args: unknown[]) => mockQuery(...args),
          execute: (...args: unknown[]) => mockExecute(...args),
        }),
      );
      lock = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    });

    const [first, second] = await Promise.all([
      PATCH(patchRequest('owner-b', 'admin'), params('owner-b')),
      PATCH(patchRequest('actor-user', 'admin'), params('actor-user')),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(ownerCount()).toBe(1);
  });

  it('takes the advisory lock before it reads the owner count', async () => {
    requesterRole.value = 'owner';
    permissionRole.value = 'owner';
    transactionRows('owner', '1');

    await PATCH(patchRequest('target-user', 'member'), params('target-user'));

    expect(mockQuery.mock.calls[0]![0]).toContain('pg_advisory_xact_lock');
    expect(mockQuery.mock.calls.at(-1)![0]).toContain('owner_count');
  });
});

describe('read-only admin cannot mutate through the API', () => {
  it('refuses a role change', async () => {
    permissionRole.value = 'viewer';
    transactionRows('member', '1');

    const response = await PATCH(patchRequest('target-user', 'admin'), params('target-user'));

    expect(response.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('refuses a removal', async () => {
    permissionRole.value = 'viewer';
    transactionRows('member', '1');

    const response = await DELETE(deleteRequest('target-user'), params('target-user'));

    expect(response.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
