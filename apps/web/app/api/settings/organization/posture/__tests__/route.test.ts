import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockGetUserScopedDb, mockRequireTeamAdminAccess } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGetUserScopedDb: vi.fn(),
  mockRequireTeamAdminAccess: vi.fn(async () => ({ plan: 'enterprise', canManageTeam: true })),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: mockRequireTeamAdminAccess,
}));

import { AppError, type ErrorCodeValue } from '@/lib/errors';
import { GET } from '../route';
import type { WorkspacePostureResponse } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';

function bind({ role = 'admin' as 'owner' | 'admin' | 'member' | 'viewer', member = true } = {}) {
  mockQuery.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (/from public\.user_settings/i.test(text)) {
      return member ? [{ organization_id: ORG }] : [];
    }
    if (/from public\.organization_members/i.test(text)) {
      if (!member) return [];
      // The posture's own role-count query selects `role, count(*)`.
      return /group by role/i.test(text)
        ? [{ role: 'owner', count: 1 }]
        : [{ organization_id: ORG, role }];
    }
    if (/from public\.organizations\b/i.test(text)) {
      return [{ name: 'Acme', licensed_seats: 10, seats_consumed: 3 }];
    }
    if (/from public\.sso_connections|from public\.directory_sync_connections/i.test(text)) {
      return [];
    }
    if (/from public\.organization_admin_policies/i.test(text)) return [];
    return [{ count: 0 }];
  });
}

function req(): Request {
  return new Request('https://app.test/api/settings/organization/posture');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: (...args: unknown[]) => mockQuery(...args) },
    userId: 'user-1',
  });
});

describe('GET /api/settings/organization/posture', () => {
  it('refuses a plain member', async () => {
    bind({ role: 'member' });
    expect((await GET(req() as never)).status).toBe(403);
  });

  it('refuses a viewer', async () => {
    bind({ role: 'viewer' });
    expect((await GET(req() as never)).status).toBe(403);
  });

  it('refuses a caller with no workspace', async () => {
    bind({ member: false });
    expect((await GET(req() as never)).status).toBe(403);
  });

  it('serves an owner', async () => {
    bind({ role: 'owner' });
    const res = await GET(req() as never);

    expect(res.status).toBe(200);
    const body = (await res.json()) as WorkspacePostureResponse;
    expect(body.currentUserRole).toBe('owner');
    expect(body.posture.organizationId).toBe(ORG);
    expect(body.posture.groups.length).toBeGreaterThan(0);
  });

  it('serves an admin', async () => {
    bind({ role: 'admin' });
    expect((await GET(req() as never)).status).toBe(200);
  });

  it('respects the plan entitlement gate before reading anything', async () => {
    bind({ role: 'owner' });
    mockRequireTeamAdminAccess.mockRejectedValueOnce(
      new AppError(
        'SUBSCRIPTION_REQUIRED' as ErrorCodeValue,
        'Team administration requires an active Team or Enterprise subscription.',
        403,
      ),
    );

    const res = await GET(req() as never);
    expect(res.status).toBe(403);
  });
});
