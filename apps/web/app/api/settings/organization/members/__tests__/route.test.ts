import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { OrganizationRole } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/logger');
type ScanModule1 = typeof import('@/lib/rate-limit');
type ScanModule2 = typeof import('@/lib/security-audit');
type ScanModule3 = typeof import('@/lib/server/neon-db');
type ScanModule4 = typeof import('@/lib/server/rls-db');
type ScanModule5 = typeof import('@/lib/server/request-context-cache');
type ScanModule6 = typeof import('@/lib/services/organization-permission-service');

vi.mock('server-only', () => ({}));

const session = vi.hoisted(() => ({ userId: 'user-admin', role: 'admin' as OrganizationRole }));
const state = vi.hoisted(() => ({ db: null as unknown }));
const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  recordAuditEvent: vi.fn(async (_event: unknown) => undefined),
  teamAccess: vi.fn(async () => ({ plan: 'enterprise', canManageTeam: true })),
}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  getNeonDb: () => state.db,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/server/request-context-cache', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  getCachedActiveOrganizationId: vi.fn(async () => undefined),
  setCachedActiveOrganizationId: vi.fn(async () => undefined),
}));
vi.mock('@/lib/services/organization-permission-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  ...(await import('../../__tests__/workspace-admin-api-world')).permissionServiceMock(session),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  getTeamAdminAccess: mocks.teamAccess,
  requireTeamAdminAccess: mocks.teamAccess,
}));

import { createError } from '@/lib/errors';
import { clearIpAllowListCacheForTests } from '@/lib/services/organization-ip-allow-list-cache';
import {
  ORG,
  createWorkspaceAdminDb,
  defaultWorld,
  keyHeaders,
  type WorkspaceAdminWorld,
} from '../../__tests__/workspace-admin-api-world';
import { GET } from '../route';

const URL_BASE = 'https://app.test/api/settings/organization/members';

let world: WorkspaceAdminWorld;

function get(query = '', headers: Record<string, string> = {}) {
  return new NextRequest(`${URL_BASE}${query}`, { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearIpAllowListCacheForTests();
  session.userId = 'user-admin';
  session.role = 'admin';
  world = defaultWorld();
  state.db = createWorkspaceAdminDb(world);
  mocks.getUserScopedDb.mockImplementation(async () => ({
    db: state.db,
    userId: session.userId,
    organizationId: ORG,
  }));
  mocks.teamAccess.mockResolvedValue({ plan: 'enterprise', canManageTeam: true });
});

describe('GET /api/settings/organization/members', () => {
  it('refuses a caller with neither a session nor a workspace API key', async () => {
    mocks.getUserScopedDb.mockRejectedValueOnce(createError.unauthorized());

    const response = await GET(get());

    expect(response.status).toBe(401);
  });

  it('lists the active members for an administrator, one page at a time', async () => {
    const response = await GET(get());

    expect(response.status).toBe(200);
    const page = (await response.json()) as {
      data: Array<{ userId: string; email: string; role: string; status: string }>;
      hasMore: boolean;
      firstId: string | null;
      lastId: string | null;
    };
    expect(page.data.map((entry) => entry.userId)).toEqual([
      'user-admin',
      'user-member',
      'user-owner',
      'user-viewer',
    ]);
    expect(page.data.every((entry) => entry.status === 'active')).toBe(true);
    expect(page).toMatchObject({ hasMore: false, firstId: 'user-admin', lastId: 'user-viewer' });
  });

  it('pages with limit and afterId and says when more remain', async () => {
    const first = (await (await GET(get('?limit=2'))).json()) as {
      data: Array<{ userId: string }>;
      hasMore: boolean;
      lastId: string;
    };
    expect(first.data.map((entry) => entry.userId)).toEqual(['user-admin', 'user-member']);
    expect(first.hasMore).toBe(true);

    const second = (await (await GET(get(`?limit=2&afterId=${first.lastId}`))).json()) as {
      data: Array<{ userId: string }>;
      hasMore: boolean;
    };
    expect(second.data.map((entry) => entry.userId)).toEqual(['user-owner', 'user-viewer']);
    expect(second.hasMore).toBe(false);
  });

  it('narrows the list to one address', async () => {
    const page = (await (await GET(get('?email=USER-VIEWER@example.com'))).json()) as {
      data: Array<{ userId: string }>;
    };

    expect(page.data.map((entry) => entry.userId)).toEqual(['user-viewer']);
  });

  it.each([['?limit=0'], ['?limit=101'], ['?email=not-an-address'], ['?cursor=x']])(
    'rejects the malformed query %s',
    async (query) => {
      expect((await GET(get(query))).status).toBe(400);
    },
  );

  it('refuses a member whose role cannot view the member list', async () => {
    session.userId = 'user-member';
    session.role = 'member';

    const response = await GET(get());

    expect(response.status).toBe(403);
  });

  it('serves a workspace API key scoped for the member list, without a session', async () => {
    const response = await GET(get('', keyHeaders()));

    expect(response.status).toBe(200);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
    const page = (await response.json()) as { data: unknown[] };
    expect(page.data).toHaveLength(4);
  });

  it('refuses a workspace API key that is not scoped for the member list', async () => {
    world.keyScopes = ['admin.audit.view'];

    const response = await GET(get('', keyHeaders()));

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('not scoped for admin.members.view');
  });

  it('refuses a workspace API key once the workspace has no Team or Enterprise plan', async () => {
    mocks.teamAccess.mockResolvedValue({ plan: 'free', canManageTeam: false });

    const response = await GET(get('', keyHeaders()));

    expect(response.status).toBe(403);
  });

  it('refuses an unknown or revoked workspace API key', async () => {
    world.keyScopes = null;

    const response = await GET(get('', keyHeaders()));

    expect(response.status).toBe(401);
  });
});
