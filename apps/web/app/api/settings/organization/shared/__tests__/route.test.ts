import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockNeonQuery, mockGetUserScopedDb } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockNeonQuery: vi.fn(),
  mockGetUserScopedDb: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ query: (...args: unknown[]) => mockNeonQuery(...args) })),
}));

import { GET } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const CONNECTOR = '44444444-4444-4444-8444-444444444444';

function respondFor(role: 'owner' | 'admin' | 'member' | 'viewer') {
  mockNeonQuery.mockImplementation(async (sql: string) => {
    if (/from public\.organization_shared_projects s/i.test(sql)) {
      return [
        {
          organization_id: ORG,
          project_id: PROJECT,
          shared_by_user_id: 'user-owner',
          default_access: 'read',
          created_at: '2026-01-03T00:00:00.000Z',
          name: 'Roadmap',
          user_id: 'user-owner',
        },
      ];
    }
    return [];
  });
  mockQuery.mockImplementation(async (sql: string) => {
    if (/from public\.user_settings/i.test(sql) && /where s\.user_id = \$1/i.test(sql)) {
      return [{ organization_id: ORG }];
    }
    if (
      /from public\.organization_members/i.test(sql) &&
      /where organization_id = \$1 and user_id = \$2/i.test(sql)
    ) {
      return [{ organization_id: ORG, role }];
    }
    if (/select user_id, role, joined_at/i.test(sql)) {
      return [
        { user_id: 'user-owner', role: 'owner', joined_at: '2026-01-01T00:00:00.000Z' },
        { user_id: 'user-member', role: 'member', joined_at: '2026-01-02T00:00:00.000Z' },
      ];
    }
    if (/from public\.organization_project_access/i.test(sql)) {
      return [{ project_id: PROJECT, user_id: 'user-member', access: 'none' }];
    }
    if (/from public\.organization_shared_connectors s/i.test(sql)) {
      return [
        {
          organization_id: ORG,
          connector_row_id: CONNECTOR,
          org_short_id: 'a1b2c3d4e5',
          shared_by_user_id: 'user-owner',
          created_at: '2026-01-03T00:00:00.000Z',
          name: 'Jira',
          url: 'https://mcp.example.com/sse',
          transport: 'sse',
          user_id: 'user-owner',
          auth_header_enc: 'ENCRYPTED-SECRET',
        },
      ];
    }
    return [];
  });
}

function get() {
  return GET(new Request('http://localhost:3000/api/settings/organization/shared') as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: (...args: unknown[]) => mockQuery(...args) },
    userId: 'caller',
    organizationId: null,
  });
});

describe('GET /api/settings/organization/shared', () => {
  it('returns the shared projects, their per-member denials, and the connectors', async () => {
    respondFor('admin');

    const response = await get();
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      organizationId: string;
      canManageSharing: boolean;
      members: { userId: string }[];
      sharedProjects: { projectId: string; memberGrants: { userId: string; access: string }[] }[];
      sharedConnectors: { orgShortId: string }[];
    };

    expect(body.organizationId).toBe(ORG);
    expect(body.members.map((m) => m.userId)).toEqual(['user-owner', 'user-member']);
    expect(body.sharedProjects[0]!.projectId).toBe(PROJECT);
    expect(body.sharedProjects[0]!.memberGrants).toEqual([
      { userId: 'user-member', access: 'none' },
    ]);
    expect(body.sharedConnectors[0]!.orgShortId).toBe('a1b2c3d4e5');
    expect(
      mockQuery.mock.calls.some(([sql]) =>
        /from public\.organization_shared_projects s/i.test(String(sql)),
      ),
    ).toBe(false);
    expect(mockNeonQuery).toHaveBeenCalledTimes(1);
  });

  it('never lets a connector credential reach the wire', async () => {
    respondFor('owner');
    const body = await (await get()).text();
    expect(body).not.toContain('ENCRYPTED-SECRET');
    expect(body).not.toContain('auth_header_enc');
  });

  it('lets a plain member READ the shared surface — that is the point of sharing', async () => {
    respondFor('member');

    const response = await get();
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      canManageSharing: boolean;
      currentUserRole: string;
      sharedProjects: unknown[];
    };
    expect(body.currentUserRole).toBe('member');
    expect(body.canManageSharing).toBe(false);
    expect(body.sharedProjects).toHaveLength(1);
  });

  it('marks owner and admin as able to manage sharing', async () => {
    for (const role of ['owner', 'admin'] as const) {
      vi.clearAllMocks();
      mockGetUserScopedDb.mockResolvedValue({
        db: { query: (...args: unknown[]) => mockQuery(...args) },
        userId: 'caller',
        organizationId: null,
      });
      respondFor(role);
      const body = (await (await get()).json()) as { canManageSharing: boolean };
      expect(body.canManageSharing).toBe(true);
    }
  });

  it('marks a viewer as read-only', async () => {
    respondFor('viewer');
    const body = (await (await get()).json()) as { canManageSharing: boolean };
    expect(body.canManageSharing).toBe(false);
  });
});
