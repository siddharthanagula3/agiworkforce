import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  permissions: new Set<string>(),
  listed: [] as Array<string | undefined>,
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: async () => null }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ query: async () => [] }) }));
vi.mock('@/lib/services/organization-role-service', () => ({
  listDirectoryGroupsWithRoles: async (_db: unknown, _org: string, managerId?: string) => {
    mocks.listed.push(managerId);
    return [];
  },
}));
vi.mock('../../workspace-access', () => ({
  resolveWorkspaceConsoleAccess: async () => ({
    db: {},
    userId: 'user_1',
    organizationId: 'org_1',
    access: { organizationId: 'org_1', role: 'member', permissions: mocks.permissions },
  }),
}));

import { GET } from '../route';

function request(): NextRequest {
  return new NextRequest('https://example.test/api/settings/organization/groups');
}

async function listedManagerId(granted: readonly string[]): Promise<string | undefined> {
  mocks.permissions = new Set(granted);
  mocks.listed = [];
  await GET(request());
  return mocks.listed[0];
}

beforeEach(() => {
  mocks.permissions = new Set();
  mocks.listed = [];
});

describe('the directory group roster answers the level the caller holds', () => {
  it('shows every group to a role granted only the view half', async () => {
    expect(await listedManagerId(['admin.groups.view'])).toBeUndefined();
  });

  it('shows every group to a manager, in either vocabulary', async () => {
    expect(await listedManagerId(['groups.manage'])).toBeUndefined();
    expect(await listedManagerId(['admin.groups.manage'])).toBeUndefined();
  });

  it('shows a member only the groups they manage', async () => {
    expect(await listedManagerId(['content.read'])).toBe('user_1');
  });

  it('reports management separately from the roster it serves', async () => {
    mocks.permissions = new Set(['admin.groups.view']);
    const viewer = await (await GET(request())).json();
    mocks.permissions = new Set(['groups.manage']);
    const manager = await (await GET(request())).json();

    expect(viewer.canManageGroups).toBe(false);
    expect(manager.canManageGroups).toBe(true);
  });
});
