import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  resolveOrgMembership: vi.fn(),
  shareProject: vi.fn(),
  unshareProject: vi.fn(),
  setProjectMemberAccess: vi.fn(),
  clearProjectMemberAccess: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db: { query: vi.fn() }, userId: 'admin-1' })),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mocks.recordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/services/org-sharing-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/org-sharing-service')>()),
  resolveOrgMembership: mocks.resolveOrgMembership,
  shareProject: mocks.shareProject,
  unshareProject: mocks.unshareProject,
  setProjectMemberAccess: mocks.setProjectMemberAccess,
  clearProjectMemberAccess: mocks.clearProjectMemberAccess,
}));

import { DELETE, PATCH, PUT } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const PROJECT = '33333333-3333-4333-8333-333333333333';

function request(method: string, body?: unknown): never {
  return new Request(`http://localhost/api/settings/organization/shared/projects/${PROJECT}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;
}

const context = { params: Promise.resolve({ projectId: PROJECT }) };

describe('shared project routes write the workspace audit trail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveOrgMembership.mockResolvedValue({ organizationId: ORG, role: 'admin' });
  });

  it('records who shared which project into the organization trail', async () => {
    mocks.shareProject.mockResolvedValue({
      projectId: PROJECT,
      organizationId: ORG,
      name: 'Launch plan',
      ownerUserId: 'owner-1',
      sharedByUserId: 'admin-1',
      defaultAccess: 'read',
      createdAt: '2026-09-16T00:00:00.000Z',
      memberGrants: [],
    });

    const response = await PUT(request('PUT', {}), context);

    expect(response.status).toBe(200);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        organizationId: ORG,
        eventType: 'project_shared',
        detail: expect.objectContaining({
          resourceType: 'project',
          resourceId: PROJECT,
          resourceName: 'Launch plan',
          scope: 'read',
        }),
      }),
    );
  });

  it('records a per-member access grant with its target', async () => {
    mocks.setProjectMemberAccess.mockResolvedValue({ userId: 'member-9', access: 'none' });

    const response = await PATCH(request('PATCH', { userId: 'member-9', access: 'none' }), context);

    expect(response.status).toBe(200);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'project_member_access_changed',
        organizationId: ORG,
        detail: expect.objectContaining({ targetUserId: 'member-9', scope: 'none' }),
      }),
    );
  });

  it('records nothing when clearing an override that did not exist', async () => {
    mocks.clearProjectMemberAccess.mockResolvedValue(false);

    await PATCH(request('PATCH', { userId: 'member-9', access: 'inherit' }), context);

    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('records an unshare, and nothing when there was no share to remove', async () => {
    mocks.unshareProject.mockResolvedValueOnce(true);
    await DELETE(request('DELETE'), context);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'project_unshared', organizationId: ORG }),
    );

    mocks.recordAuditEvent.mockClear();
    mocks.unshareProject.mockResolvedValueOnce(false);
    const missing = await DELETE(request('DELETE'), context);
    expect(missing.status).toBe(404);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});
