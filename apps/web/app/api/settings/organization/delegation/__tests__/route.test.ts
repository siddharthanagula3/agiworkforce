import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const permissionRole = vi.hoisted(() => ({ value: 'admin' as string | null }));

vi.mock('@/lib/services/organization-permission-service', async () =>
  (
    await import('@/lib/services/__tests__/organization-permission-service-mock')
  ).organizationPermissionServiceMock(permissionRole),
);

const { mockQuery, mockExecute } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(async () => undefined),
  recordAuditEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/services/org-sharing-service', () => ({
  resolveOrgMembership: vi.fn(async () => ({
    organizationId: '11111111-1111-4111-8111-111111111111',
    role: permissionRole.value,
  })),
  requireOrgMember: (membership: unknown) => membership,
}));

const adapter = {
  query: (...args: unknown[]) => mockQuery(...args),
  execute: (...args: unknown[]) => mockExecute(...args),
};

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => adapter) }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db: adapter, userId: 'actor-user' })),
}));

import { GET, POST } from '../route';

const ENDPOINT = 'http://localhost:3000/api/settings/organization/delegation';

function post(body: unknown) {
  return new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

const futureExpiry = () => new Date(Date.now() + 7 * 86_400_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  permissionRole.value = 'admin';
  mockQuery.mockResolvedValue([]);
});

describe('GET /api/settings/organization/delegation', () => {
  it('names the delegatable permissions and excludes every owner-only one', async () => {
    const response = await GET(new Request(ENDPOINT) as never);
    const body = (await response.json()) as {
      delegatablePermissions: string[];
      canManage: boolean;
    };

    expect(response.status).toBe(200);
    expect(body.canManage).toBe(true);
    expect(body.delegatablePermissions).not.toContain('admin.ownership.manage');
    expect(body.delegatablePermissions).not.toContain('admin.lifecycle.manage');
    expect(body.delegatablePermissions).toContain('admin.billing.view');
  });

  it('refuses a viewer outright', async () => {
    permissionRole.value = 'viewer';
    const response = await GET(new Request(ENDPOINT) as never);
    expect(response.status).toBe(403);
  });
});

describe('POST /api/settings/organization/delegation', () => {
  it('refuses a read-only admin who tries to grant one', async () => {
    permissionRole.value = 'viewer';

    const response = await POST(
      post({
        delegateUserId: 'delegate-user',
        scopes: ['admin.billing.view'],
        expiresAt: futureExpiry(),
      }),
    );

    expect(response.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('refuses an owner-only permission even from an admin who can manage roles', async () => {
    const response = await POST(
      post({
        delegateUserId: 'delegate-user',
        scopes: ['admin.ownership.manage'],
        expiresAt: futureExpiry(),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('cannot be delegated');
  });

  it('refuses a permission the granter does not hold', async () => {
    mockQuery.mockResolvedValueOnce([{ role: 'member' }]);

    const response = await POST(
      post({
        delegateUserId: 'delegate-user',
        scopes: ['admin.owners.manage'],
        expiresAt: futureExpiry(),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('your own role does not include it');
  });

  it('grants a delegation the admin does hold', async () => {
    mockQuery.mockResolvedValueOnce([{ role: 'member' }]).mockResolvedValueOnce([
      {
        id: '44444444-4444-4444-8444-444444444444',
        organization_id: '11111111-1111-4111-8111-111111111111',
        delegate_user_id: 'delegate-user',
        granted_by_user_id: 'actor-user',
        scopes: ['admin.billing.view'],
        reason: null,
        expires_at: futureExpiry(),
        revoked_at: null,
        created_at: '2026-09-18T00:00:00.000Z',
      },
    ]);

    const response = await POST(
      post({
        delegateUserId: 'delegate-user',
        scopes: ['admin.billing.view'],
        expiresAt: futureExpiry(),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { delegation: { scopes: string[] } };
    expect(body.delegation.scopes).toEqual(['admin.billing.view']);
  });
});
