import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockEntitlements, mockNeonQuery } = vi.hoisted(() => ({
  mockEntitlements: vi.fn(),
  mockNeonQuery: vi.fn(),
}));

vi.mock('@/lib/services/org-entitlements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/org-entitlements')>()),
  getOrganizationEntitlements: mockEntitlements,
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ query: (...args: unknown[]) => mockNeonQuery(...args) })),
}));

import {
  clearProjectMemberAccess,
  isOrgAdminRole,
  listReadableSharedProjectIds,
  listSharedProjects,
  requireOrgAdmin,
  requireOrgMember,
  resolveOrgMembership,
  resolveSharedProjectScope,
  setProjectMemberAccess,
  shareProject,
  unshareProject,
} from '../org-sharing-service';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';

interface Issued {
  sql: string;
  params: unknown[];
}

function makeDb(handler: (sql: string, params: unknown[]) => unknown[]) {
  const issued: Issued[] = [];
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      issued.push({ sql, params });
      return handler(sql, params);
    }),
    execute: vi.fn(),
    transaction: vi.fn(),
    withUser: vi.fn(),
    withOrg: vi.fn(),
    dispose: vi.fn(),
  };
  return { db: db as never, issued };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEntitlements.mockResolvedValue({
    organizationId: ORG,
    plan: 'team',
    sharedProjectLimit: 25,
    sharedConnectorLimit: 25,
  });
});

describe('role gates fail closed', () => {
  it('treats only owner and admin as sharing administrators', () => {
    expect(isOrgAdminRole('owner')).toBe(true);
    expect(isOrgAdminRole('admin')).toBe(true);
    expect(isOrgAdminRole('member')).toBe(false);
    expect(isOrgAdminRole('viewer')).toBe(false);
  });

  it('rejects a missing membership with 403, never a 404 that leaks existence', () => {
    expect(() => requireOrgAdmin(null)).toThrowError(/owner or admin/i);
    expect(() => requireOrgMember(null)).toThrowError(/not a member/i);
    try {
      requireOrgAdmin({ organizationId: ORG, role: 'member' });
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(403);
    }
  });
});

describe('resolveOrgMembership', () => {
  it('reads the role from the membership table for the authenticated subject', async () => {
    const { db, issued } = makeDb(() => [{ organization_id: ORG, role: 'admin' }]);
    const membership = await resolveOrgMembership(db, 'user-1');
    expect(membership).toEqual({ organizationId: ORG, role: 'admin' });

    expect(issued[0]!.sql).toMatch(/from public\.user_settings/i);
    expect(issued[0]!.sql).toMatch(/join public\.organization_members/i);
    expect(issued[0]!.sql).toMatch(/where s\.user_id = \$1/i);
    expect(issued[0]!.params).toEqual(['user-1']);

    expect(issued[1]!.sql).toMatch(/from public\.organization_members/i);
    expect(issued[1]!.sql).toMatch(/where organization_id = \$1 and user_id = \$2/i);
    expect(issued[1]!.params).toEqual([ORG, 'user-1']);
  });

  it('returns null when the caller belongs to no organization', async () => {
    const { db } = makeDb(() => []);
    expect(await resolveOrgMembership(db, 'user-1')).toBeNull();
  });
});

describe('listSharedProjects', () => {
  it('reads the cross-member share list through the bypass connection, not the caller-scoped one', async () => {
    mockNeonQuery.mockResolvedValue([
      {
        organization_id: ORG,
        project_id: PROJECT,
        shared_by_user_id: 'admin-1',
        default_access: 'read',
        created_at: '2026-01-01T00:00:00.000Z',
        name: 'Roadmap',
        user_id: 'owner-1',
      },
    ]);
    const { db, issued } = makeDb(() => [
      { project_id: PROJECT, user_id: 'member-2', access: 'none' },
    ]);

    const shared = await listSharedProjects(db, ORG);

    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({
      projectId: PROJECT,
      organizationId: ORG,
      name: 'Roadmap',
      ownerUserId: 'owner-1',
      memberGrants: [{ userId: 'member-2', access: 'none' }],
    });
    expect(issued.every(({ sql }) => !/organization_shared_projects/i.test(sql))).toBe(true);
  });

  it('binds the organization on both the share read and the grant read', async () => {
    mockNeonQuery.mockResolvedValue([
      {
        organization_id: ORG,
        project_id: PROJECT,
        shared_by_user_id: 'admin-1',
        default_access: 'read',
        created_at: '2026-01-01T00:00:00.000Z',
        name: 'Roadmap',
        user_id: 'owner-1',
      },
    ]);
    const { db, issued } = makeDb(() => [
      { project_id: PROJECT, user_id: 'member-2', access: 'none' },
    ]);

    await listSharedProjects(db, ORG);

    const [sharesSql, sharesParams] = mockNeonQuery.mock.calls[0]!;
    expect(sharesSql).toMatch(/organization_id = \$1/i);
    expect((sharesParams as unknown[])[0]).toBe(ORG);
    for (const { sql, params } of issued) {
      expect(sql).toMatch(/organization_id = \$1/i);
      expect(params[0]).toBe(ORG);
    }
  });

  it('skips the grant read entirely when nothing is shared', async () => {
    mockNeonQuery.mockResolvedValue([]);
    const { db, issued } = makeDb(() => []);
    expect(await listSharedProjects(db, ORG)).toEqual([]);
    expect(issued).toHaveLength(0);
    expect(mockNeonQuery).toHaveBeenCalledTimes(1);
  });

  it('hides soft-deleted projects so a deleted project cannot linger in the org view', async () => {
    mockNeonQuery.mockResolvedValue([]);
    const { db } = makeDb(() => []);
    await listSharedProjects(db, ORG);
    expect(String(mockNeonQuery.mock.calls[0]![0])).toMatch(/p\.deleted_at is null/i);
  });
});

describe('listReadableSharedProjectIds', () => {
  it('excludes a project the member is explicitly denied', async () => {
    const { db, issued } = makeDb(() => [{ project_id: PROJECT }]);
    const ids = await listReadableSharedProjectIds(db, ORG, 'member-1');
    expect(ids).toEqual([PROJECT]);
    expect(issued[0]!.sql).toMatch(/organization_project_access/);
    expect(issued[0]!.sql).toMatch(/a\.access = 'none'/);
    expect(issued[0]!.params).toEqual([ORG, 'member-1']);
  });
});

describe('resolveSharedProjectScope', () => {
  it('returns the caller’s org and readable ids', async () => {
    const { db } = makeDb((sql) =>
      /organization_members/i.test(sql)
        ? [{ organization_id: ORG, role: 'member' }]
        : [{ project_id: PROJECT }],
    );
    expect(await resolveSharedProjectScope(db, 'member-1')).toEqual({
      organizationId: ORG,
      projectIds: [PROJECT],
    });
  });

  it('returns null for a user in no organization, so project reads stay personal', async () => {
    const { db } = makeDb(() => []);
    expect(await resolveSharedProjectScope(db, 'solo-user')).toBeNull();
  });

  it('degrades to null — not an exception — when 0086 has not been applied', async () => {
    const db = {
      query: vi.fn(async () => {
        const error: Error & { code?: string } = new Error(
          'relation "organization_shared_projects" does not exist',
        );
        error.code = '42P01';
        throw error;
      }),
    } as never;
    expect(await resolveSharedProjectScope(db, 'user-1')).toBeNull();
  });

  it('re-throws a real database failure instead of silently widening scope', async () => {
    const db = {
      query: vi.fn(async () => {
        throw new Error('connection terminated');
      }),
    } as never;
    await expect(resolveSharedProjectScope(db, 'user-1')).rejects.toThrow(/connection terminated/);
  });
});

describe('shareProject', () => {
  it('shares only a project the ACTOR owns, and enforces the ceiling in the database', async () => {
    const { db, issued } = makeDb(() => [
      {
        organization_id: ORG,
        project_id: PROJECT,
        shared_by_user_id: 'admin-1',
        default_access: 'read',
        created_at: '2026-01-01T00:00:00.000Z',
        name: 'Roadmap',
        user_id: 'admin-1',
      },
    ]);

    const shared = await shareProject(db, {
      organizationId: ORG,
      projectId: PROJECT,
      actorUserId: 'admin-1',
      defaultAccess: 'read',
    });

    expect(shared.projectId).toBe(PROJECT);
    const { sql, params } = issued[0]!;
    expect(sql).toMatch(/from public\.user_projects\s+where id = \$2\s+and user_id = \$3/i);
    expect(sql).toMatch(/public\.assert_org_resource_limit\('org_shared_projects', \$1, \$5\)/i);
    expect(params).toEqual([ORG, PROJECT, 'admin-1', 'read', 25]);
  });

  it('answers 404 when the project is not the actor’s — never a silent success', async () => {
    const { db } = makeDb(() => []);
    await expect(
      shareProject(db, {
        organizationId: ORG,
        projectId: PROJECT,
        actorUserId: 'admin-1',
        defaultAccess: 'read',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('maps the ceiling violation to 409, not 500', async () => {
    const db = {
      query: vi.fn(async () => {
        const error: Error & { code?: string } = new Error('org_resource_limit_reached');
        error.code = 'P0001';
        throw error;
      }),
    } as never;

    await expect(
      shareProject(db, {
        organizationId: ORG,
        projectId: PROJECT,
        actorUserId: 'admin-1',
        defaultAccess: 'read',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('refuses before touching the database when the org plan includes no shared projects', async () => {
    mockEntitlements.mockResolvedValue({
      organizationId: ORG,
      plan: 'free',
      sharedProjectLimit: 0,
      sharedConnectorLimit: 0,
    });
    const { db, issued } = makeDb(() => []);
    await expect(
      shareProject(db, {
        organizationId: ORG,
        projectId: PROJECT,
        actorUserId: 'admin-1',
        defaultAccess: 'read',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(issued).toHaveLength(0);
  });
});

describe('unshareProject / member access', () => {
  it('deletes only within the caller’s organization', async () => {
    const { db, issued } = makeDb(() => [{ project_id: PROJECT }]);
    expect(await unshareProject(db, ORG, PROJECT)).toBe(true);
    expect(issued[0]!.sql).toMatch(/where organization_id = \$1\s+and project_id = \$2/i);
    expect(issued[0]!.params).toEqual([ORG, PROJECT]);
  });

  it('reports a miss rather than pretending the un-share happened', async () => {
    const { db } = makeDb(() => []);
    expect(await unshareProject(db, OTHER_ORG, PROJECT)).toBe(false);
  });

  it('upserts a per-member grant bound to the caller’s organization', async () => {
    const { db, issued } = makeDb(() => [{ user_id: 'member-2', access: 'none' }]);
    const grant = await setProjectMemberAccess(db, {
      organizationId: ORG,
      projectId: PROJECT,
      targetUserId: 'member-2',
      access: 'none',
      grantedByUserId: 'admin-1',
    });
    expect(grant).toEqual({ userId: 'member-2', access: 'none' });
    expect(issued[0]!.params).toEqual([ORG, PROJECT, 'member-2', 'none', 'admin-1']);
    expect(issued[0]!.sql).toMatch(
      /on conflict \(organization_id, project_id, user_id\) do update/i,
    );
  });

  it('404s when the FK refuses — the project is not shared, or the target is not a member', async () => {
    const { db } = makeDb(() => []);
    await expect(
      setProjectMemberAccess(db, {
        organizationId: ORG,
        projectId: PROJECT,
        targetUserId: 'stranger',
        access: 'read',
        grantedByUserId: 'admin-1',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('clears an override so the member falls back to the share default', async () => {
    const { db, issued } = makeDb(() => [{ user_id: 'member-2' }]);
    expect(await clearProjectMemberAccess(db, ORG, PROJECT, 'member-2')).toBe(true);
    expect(issued[0]!.sql).toMatch(
      /where organization_id = \$1\s+and project_id = \$2\s+and user_id = \$3/i,
    );
    expect(issued[0]!.params).toEqual([ORG, PROJECT, 'member-2']);
  });
});
