import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const permissionRole = vi.hoisted(() => ({ value: 'admin' as string | null }));
vi.mock('@/lib/services/organization-permission-service', async () =>
  (
    await import('@/lib/services/__tests__/organization-permission-service-mock')
  ).organizationPermissionServiceMock(permissionRole),
);

const { mockQuery, mockRecordAuditEvent } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockRecordAuditEvent: vi.fn(async (_event: unknown) => undefined),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mockQuery(...args) },
    userId: 'user-1',
  })),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mockQuery(...args) }),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mockRecordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: vi.fn(async () => ({ plan: 'enterprise', canManageTeam: true })),
}));

import { GET, PUT } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';

function bind(role: string, stored: Record<string, unknown>[] = []) {
  permissionRole.value = role;
  mockQuery.mockImplementation(async (sql: string) => {
    if (/from public\.user_settings/i.test(sql)) return [{ organization_id: ORG }];
    if (/from public\.organization_members/i.test(sql)) return [{ organization_id: ORG, role }];
    if (/from public\.organization_domain_retention_policies/i.test(sql)) return stored;
    if (/from public\.organization_domain_retention_sweeps/i.test(sql)) return [];
    return [];
  });
}

function put(body: unknown): Request {
  return new Request('https://app.test/api/settings/organization/retention', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => vi.clearAllMocks());

describe('/api/settings/organization/retention', () => {
  it('lists a window for every domain, defaulting to not enforced', async () => {
    bind('admin', [
      {
        organization_id: ORG,
        domain: 'files',
        retention_days: 30,
        enforced: true,
        updated_at: null,
      },
    ]);

    const res = await GET(new Request('https://app.test/x') as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.canManageRetention).toBe(true);
    expect(body.policies).toHaveLength(8);
    expect(body.policies.find((p: { domain: string }) => p.domain === 'files')).toMatchObject({
      retentionDays: 30,
      enforced: true,
    });
    expect(body.policies.find((p: { domain: string }) => p.domain === 'work').enforced).toBe(false);
  });

  it('refuses a member without audit.read', async () => {
    bind('member');

    expect((await GET(new Request('https://app.test/x') as never)).status).toBe(403);
  });

  it('saves each domain separately and records the change as critical when enforcement starts', async () => {
    bind('owner');

    const res = await PUT(
      put({ policies: [{ domain: 'notifications', retentionDays: 30, enforced: true }] }) as never,
    );

    expect(res.status).toBe(200);
    const upsert = mockQuery.mock.calls.find(([sql]) =>
      /insert into public\.organization_domain_retention_policies/i.test(String(sql)),
    );
    expect(upsert?.[1]).toEqual([ORG, 'notifications', 30, true, 'user-1']);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'retention_policy_changed',
        severity: 'critical',
        detail: expect.objectContaining({ changedKeys: ['notifications:enforced:30d'] }),
      }),
    );
  });

  it('refuses a change from a role without policy.manage', async () => {
    bind('viewer');

    const res = await PUT(
      put({ policies: [{ domain: 'files', retentionDays: 30, enforced: true }] }) as never,
    );

    expect(res.status).toBe(403);
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('rejects an unknown domain or a window outside the allowed range', async () => {
    bind('owner');

    expect(
      (
        await PUT(
          put({ policies: [{ domain: 'email', retentionDays: 30, enforced: true }] }) as never,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await PUT(
          put({ policies: [{ domain: 'files', retentionDays: 0, enforced: true }] }) as never,
        )
      ).status,
    ).toBe(400);
  });
});
