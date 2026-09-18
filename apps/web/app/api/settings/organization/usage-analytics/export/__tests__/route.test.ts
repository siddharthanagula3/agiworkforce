import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const permissionRole = vi.hoisted(() => ({ value: 'admin' as string | null }));
vi.mock('@/lib/services/organization-permission-service', async () =>
  (
    await import('@/lib/services/__tests__/organization-permission-service-mock')
  ).organizationPermissionServiceMock(permissionRole),
);

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

import { GET } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';

function bind({
  role = 'admin' as 'owner' | 'admin' | 'member' | 'viewer',
  memberKey = 'user-a',
} = {}) {
  permissionRole.value = role;
  mockQuery.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (/from public\.user_settings/i.test(text)) return [{ organization_id: ORG }];
    if (/from public\.organization_members/i.test(text)) return [{ organization_id: ORG, role }];
    if (/date_trunc\('day'/.test(text)) {
      return [{ day: '2026-08-22T00:00:00.000Z', requests: 4, cost_cents: '120' }];
    }
    if (/unsettled_requests/.test(text)) {
      return [{ latest_activity_at: '2026-08-22T18:30:00.000Z', unsettled_requests: 2 }];
    }
    if (/user_id as key/.test(text)) {
      return [
        {
          key: memberKey,
          requests: 4,
          input_tokens: '90',
          output_tokens: '10',
          cost_cents: '120',
        },
      ];
    }
    if (/group by 1/.test(text)) return [];
    return [{ key: null, requests: 4, input_tokens: '90', output_tokens: '10', cost_cents: '120' }];
  });
}

function req(query = ''): Request {
  return new Request(`https://app.test/api/settings/organization/usage-analytics/export${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: (...args: unknown[]) => mockQuery(...args) },
    userId: 'user-1',
  });
});

describe('GET /api/settings/organization/usage-analytics/export', () => {
  it('refuses a plain member', async () => {
    bind({ role: 'member' });
    expect((await GET(req() as never)).status).toBe(403);
  });

  it('serves an admin a csv attachment carrying the freshness header', async () => {
    bind({ role: 'admin' });

    const res = await GET(req() as never);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const body = await res.text();
    expect(body).toContain('# as_of');
    expect(body).toContain('# latest_activity_at,2026-08-22T18:30:00.000Z');
    expect(body).toContain('# unsettled_requests,2');
    expect(body).toContain('day,requests,cost_cents');
    expect(body).toContain('2026-08-22T00:00:00.000Z,4,120');
  });

  it('exports the dimension that was asked for', async () => {
    bind({ role: 'owner' });

    const body = await (await GET(req('?dimension=member') as never)).text();

    expect(body).toContain('member,requests,input_tokens,output_tokens,cost_cents');
    expect(body).toContain('user-a,4,90,10,120');
  });

  it('falls back to the daily sheet for an unknown dimension', async () => {
    bind({ role: 'owner' });

    const body = await (await GET(req('?dimension=passwords') as never)).text();

    expect(body).toContain('day,requests,cost_cents');
  });

  it('neutralises a key a spreadsheet would run as a formula', async () => {
    bind({ role: 'owner', memberKey: '=cmd|calc' });

    const body = await (await GET(req('?dimension=member') as never)).text();

    expect(body).toContain("'=cmd|calc");
    expect(body).not.toMatch(/^=cmd/m);
  });
});
