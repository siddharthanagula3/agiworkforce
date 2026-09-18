import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mockQuery(...args) }),
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: vi.fn(async () => null),
}));

import { requireMemberPermission } from '../organization-permission-service';

const ORG = '11111111-1111-4111-8111-111111111111';

// The real query returns the role beside the permission set, and a null role is
// how a non-member comes back, so a fixture must say which one it is.
function membership(role: string | null, permissions: string[]) {
  return [{ role, permissions }];
}

describe('requireMemberPermission', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('asks the database for the member permission set, not the role name', async () => {
    mockQuery.mockResolvedValue(membership('member', ['content.read', 'audit.read']));

    const permissions = await requireMemberPermission(ORG, 'user-1', 'audit.read', 'denied');

    expect(permissions.has('audit.read')).toBe(true);
    expect(String(mockQuery.mock.calls[0]?.[0])).toContain('organization_member_permissions');
    expect(mockQuery.mock.calls[0]?.[1]).toEqual([ORG, 'user-1']);
  });

  it('refuses with the given message when the permission is missing', async () => {
    mockQuery.mockResolvedValue(membership('member', ['content.read']));

    await expect(
      requireMemberPermission(ORG, 'user-1', 'policy.manage', 'Your role cannot change policy.'),
    ).rejects.toMatchObject({ statusCode: 403, message: 'Your role cannot change policy.' });
  });

  it('ignores permission names the contract does not know', async () => {
    mockQuery.mockResolvedValue(membership('member', ['everything']));

    await expect(requireMemberPermission(ORG, 'user-1', 'audit.read', 'denied')).rejects.toThrow(
      'denied',
    );
  });

  it('refuses a caller with no membership row before it reads a permission', async () => {
    mockQuery.mockResolvedValue(membership(null, []));

    await expect(
      requireMemberPermission(ORG, 'user-1', 'audit.read', 'denied'),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'You are not a member of this workspace.',
    });
  });

  it('gives the Primary Owner the permissions only they may hold', async () => {
    mockQuery.mockResolvedValue(membership('owner', ['content.read', 'workspace.delete']));

    const permissions = await requireMemberPermission(ORG, 'user-1', 'workspace.delete', 'denied');

    expect(permissions.has('workspace.delete')).toBe(true);
  });

  it('refuses an ownership permission granted to somebody who is not the Primary Owner', async () => {
    mockQuery.mockResolvedValue(membership('admin', ['content.read', 'workspace.delete']));

    await expect(
      requireMemberPermission(ORG, 'user-1', 'workspace.delete', 'denied'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
