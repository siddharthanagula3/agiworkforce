import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const permissionRole = vi.hoisted(() => ({
  value: 'viewer' as string | null,
  grants: ['members.manage'] as readonly string[],
}));

vi.mock('@/lib/services/organization-permission-service', async () =>
  (
    await import('@/lib/services/__tests__/organization-permission-service-mock')
  ).organizationPermissionServiceMock(permissionRole as never),
);

const { mockQuery, mockExecute, mockTransaction, recordAuditEvent } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockTransaction: vi.fn(),
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
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
  recordAuditEvent,
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

import { PATCH } from '../route';

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

/** lock, requester lookup, target lookup. */
function transactionRows(requesterRole: string, targetUserId: string, targetRole: string) {
  mockQuery
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([member('actor-user', requesterRole)])
    .mockResolvedValueOnce([member(targetUserId, targetRole)]);
}

beforeEach(() => {
  vi.clearAllMocks();
  permissionRole.value = 'viewer';
  permissionRole.grants = ['members.manage'];
  mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      query: (...args: unknown[]) => mockQuery(...args),
      execute: (...args: unknown[]) => mockExecute(...args),
    }),
  );
});

describe('a role change stays inside what the actor holds', () => {
  it('refuses a viewer who was granted members.manage and promotes themselves', async () => {
    transactionRows('viewer', 'actor-user', 'viewer');

    const response = await PATCH(patchRequest('actor-user', 'admin'), params('actor-user'));

    expect(response.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: expect.objectContaining({ message: expect.stringContaining('policy.manage') }),
    });
  });

  it('records the refused self-grant at critical severity', async () => {
    transactionRows('viewer', 'actor-user', 'viewer');

    await PATCH(patchRequest('actor-user', 'admin'), params('actor-user'));

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'denied', severity: 'critical' }),
    );
  });

  it('refuses the same actor promoting somebody else', async () => {
    transactionRows('viewer', 'target-user', 'member');

    const response = await PATCH(patchRequest('target-user', 'admin'), params('target-user'));

    expect(response.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'denied', severity: 'warning' }),
    );
  });

  it('still lets an admin set a role the admin bundle covers', async () => {
    permissionRole.value = 'admin';
    permissionRole.grants = [];
    transactionRows('admin', 'target-user', 'viewer');
    mockExecute.mockResolvedValueOnce(undefined);

    const response = await PATCH(patchRequest('target-user', 'member'), params('target-user'));

    expect(response.status).toBe(200);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('still lets an admin confer admin', async () => {
    permissionRole.value = 'admin';
    permissionRole.grants = [];
    transactionRows('admin', 'target-user', 'member');
    mockExecute.mockResolvedValueOnce(undefined);

    const response = await PATCH(patchRequest('target-user', 'admin'), params('target-user'));

    expect(response.status).toBe(200);
  });
});
