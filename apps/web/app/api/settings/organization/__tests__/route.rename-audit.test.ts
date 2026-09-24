import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

const { mockQuery, mockExecute, mockRecordAuditEvent } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockRecordAuditEvent: vi.fn(async () => undefined),
}));

const permissionRole = vi.hoisted(() => ({ value: 'owner' as string | null }));
vi.mock('@/lib/services/organization-permission-service', async () =>
  (
    await import('@/lib/services/__tests__/organization-permission-service-mock')
  ).organizationPermissionServiceMock(permissionRole),
);

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-auth')>()),
  getClerkAuthUser: vi.fn(async () => ({ userId: 'owner-user' })),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security-audit')>()),
  recordAuditEvent: mockRecordAuditEvent,
}));
vi.mock('@/lib/services/active-workspace-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/active-workspace-service')>()),
  resolveActiveOrganizationId: vi.fn(async () => ORGANIZATION_ID),
}));
vi.mock('@/app/api/settings/team/team-admin-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/api/settings/team/team-admin-access')>()),
  requireTeamAdminAccess: vi.fn(async () => ({
    plan: 'team',
    canManageTeam: true,
    maxMembers: null,
  })),
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/neon-db')>()),
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockQuery(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
  })),
}));

import { PATCH } from '../route';

const membership = {
  organization_id: ORGANIZATION_ID,
  user_id: 'owner-user',
  role: 'owner',
  provisioning_source: 'manual',
  provisioned_at: null,
  joined_at: '2026-07-23T00:00:00.000Z',
};

function request(body: unknown) {
  return new Request('http://localhost:3000/api/settings/organization', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('PATCH /api/settings/organization leaves an audit record', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionRole.value = 'owner';
    mockExecute.mockResolvedValue(1);
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes('from public.organization_members')) return [membership];
      return [];
    });
  });

  it('records who renamed the workspace, what changed and the new name', async () => {
    const response = await PATCH(request({ name: 'Research Guild' }));

    expect(response.status).toBe(200);
    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/update public\.organizations set .*name = \$2 where id = \$1/);
    expect(params).toEqual([ORGANIZATION_ID, 'Research Guild']);
    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-user',
        eventType: 'admin_policy_changed',
        organizationId: ORGANIZATION_ID,
        detail: expect.objectContaining({
          resourceType: 'organization',
          resourceId: ORGANIZATION_ID,
          resourceName: 'Research Guild',
          changedKeys: ['name'],
        }),
      }),
    );
  });

  it('records a slug change without inventing a name', async () => {
    await PATCH(request({ slug: 'research-guild' }));

    const [[event]] = mockRecordAuditEvent.mock.calls as unknown as [
      [{ detail: Record<string, unknown> }],
    ];
    expect(event.detail['changedKeys']).toEqual(['slug']);
    expect(event.detail).not.toHaveProperty('resourceName');
  });

  it('says a slug is taken and records nothing when another workspace holds it', async () => {
    mockExecute.mockRejectedValueOnce(
      new Error('duplicate key value violates unique constraint "organizations_slug_key"'),
    );

    const response = await PATCH(request({ slug: 'taken-slug' }));

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toBe('That organization slug is already taken');
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('records nothing when the role may not change workspace settings', async () => {
    permissionRole.value = 'member';

    const response = await PATCH(request({ name: 'Taken Over' }));

    expect(response.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });
});
