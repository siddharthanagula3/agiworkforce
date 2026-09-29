import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  recordAuditEvent: vi.fn(),
  resolveWorkspaceConsoleAccess: vi.fn(),
  isDirectoryGroupManager: vi.fn(),
  setDirectoryGroupRoles: vi.fn(),
  neonDb: { query: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => mocks.neonDb }));
vi.mock('@/lib/services/organization-role-service', () => ({
  isDirectoryGroupManager: mocks.isDirectoryGroupManager,
  setDirectoryGroupRoles: mocks.setDirectoryGroupRoles,
}));
vi.mock('@/app/api/settings/organization/workspace-access', () => ({
  resolveWorkspaceConsoleAccess: mocks.resolveWorkspaceConsoleAccess,
}));

import { PUT } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const GROUP = '22222222-2222-4222-8222-222222222222';
const ROLE = '33333333-3333-4333-8333-333333333333';

function put(body: unknown, groupId = GROUP) {
  return PUT(
    new NextRequest(`http://localhost/api/settings/organization/groups/${groupId}/roles`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ groupId }) },
  );
}

function accessWith(permissions: string[]) {
  return {
    userId: 'actor-1',
    organizationId: ORG,
    access: { role: 'member', permissions: new Set(permissions) },
  };
}

describe('PUT /api/settings/organization/groups/[groupId]/roles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.resolveWorkspaceConsoleAccess.mockResolvedValue(accessWith(['groups.manage']));
    mocks.isDirectoryGroupManager.mockResolvedValue(false);
    mocks.setDirectoryGroupRoles.mockResolvedValue({ added: [ROLE], removed: [] });
  });

  it('returns the csrf refusal', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await put({ roleIds: [ROLE] });

    expect(response.status).toBe(403);
    expect(mocks.resolveWorkspaceConsoleAccess).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid group id', async () => {
    const response = await put({ roleIds: [ROLE] }, 'nope');

    expect(response.status).toBe(400);
    expect(mocks.resolveWorkspaceConsoleAccess).not.toHaveBeenCalled();
  });

  it('returns 401 for a signed out caller', async () => {
    mocks.resolveWorkspaceConsoleAccess.mockRejectedValue(createError.unauthorized());

    const response = await put({ roleIds: [ROLE] });

    expect(response.status).toBe(401);
  });

  it('refuses a member who neither manages groups nor this group', async () => {
    mocks.resolveWorkspaceConsoleAccess.mockResolvedValue(accessWith([]));

    const response = await put({ roleIds: [ROLE] });

    expect(response.status).toBe(403);
    expect(mocks.isDirectoryGroupManager).toHaveBeenCalledWith(mocks.neonDb, ORG, GROUP, 'actor-1');
    expect(mocks.setDirectoryGroupRoles).not.toHaveBeenCalled();
  });

  it('lets a delegated manager of this group change its roles', async () => {
    mocks.resolveWorkspaceConsoleAccess.mockResolvedValue(accessWith([]));
    mocks.isDirectoryGroupManager.mockResolvedValue(true);

    const response = await put({ roleIds: [ROLE] });

    expect(response.status).toBe(200);
    expect(mocks.setDirectoryGroupRoles).toHaveBeenCalled();
  });

  it('rejects role ids that are not uuids', async () => {
    const response = await put({ roleIds: ['admin'] });

    expect(response.status).toBe(400);
    expect(mocks.setDirectoryGroupRoles).not.toHaveBeenCalled();
  });

  it('sets the roles with the actor permissions and records the change', async () => {
    const response = await put({ roleIds: [ROLE] });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      groupId: GROUP,
      roleIds: [ROLE],
      added: [ROLE],
      removed: [],
    });
    expect(mocks.isDirectoryGroupManager).not.toHaveBeenCalled();
    expect(mocks.setDirectoryGroupRoles).toHaveBeenCalledWith(mocks.neonDb, {
      organizationId: ORG,
      groupId: GROUP,
      roleIds: [ROLE],
      actorUserId: 'actor-1',
      actorPermissions: new Set(['groups.manage']),
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'actor-1',
        organizationId: ORG,
        eventType: 'scim_group_role_mapping_changed',
        detail: expect.objectContaining({ resourceId: GROUP, scopes: [ROLE] }),
      }),
    );
  });

  it('records nothing when the roles did not change', async () => {
    mocks.setDirectoryGroupRoles.mockResolvedValue({ added: [], removed: [] });

    await put({ roleIds: [ROLE] });

    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});
