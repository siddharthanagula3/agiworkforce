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

import { GET } from '../route';
import type { OrganizationUsageResponse } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';

function bind({ role = 'admin' as 'owner' | 'admin' | 'member' | 'viewer' } = {}) {
  mockQuery.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (/from public\.user_settings/i.test(text)) return [{ organization_id: ORG }];
    if (/from public\.organization_members/i.test(text)) return [{ organization_id: ORG, role }];
    if (/from public\.managed_usage_requests/i.test(text)) {
      return [
        { key: null, requests: 3, input_tokens: '100', output_tokens: '50', cost_cents: '75' },
      ];
    }
    return [];
  });
}

function req(query = ''): Request {
  return new Request(`https://app.test/api/settings/organization/usage-analytics${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: (...args: unknown[]) => mockQuery(...args) },
    userId: 'user-1',
  });
});

describe('GET /api/settings/organization/usage-analytics', () => {
  it('refuses a plain member', async () => {
    bind({ role: 'member' });
    expect((await GET(req() as never)).status).toBe(403);
  });

  it('refuses a viewer', async () => {
    bind({ role: 'viewer' });
    expect((await GET(req() as never)).status).toBe(403);
  });

  it('serves an admin', async () => {
    bind({ role: 'admin' });
    const res = await GET(req() as never);

    expect(res.status).toBe(200);
    const body = (await res.json()) as OrganizationUsageResponse;
    expect(body.usage.organizationId).toBe(ORG);
    expect(body.usage.totals.costCents).toBe(75);
  });

  it('clamps an open-ended window rather than scanning everything', async () => {
    bind({ role: 'owner' });
    const res = await GET(req('?from=1999-01-01T00:00:00.000Z') as never);
    const body = (await res.json()) as OrganizationUsageResponse;

    const days = (Date.parse(body.usage.to) - Date.parse(body.usage.from)) / 86_400_000;
    expect(days).toBeLessThanOrEqual(366);
  });

  it('survives a malformed date instead of returning Invalid Date', async () => {
    bind({ role: 'owner' });
    const body = (await (
      await GET(req('?from=nonsense&to=nonsense') as never)
    ).json()) as OrganizationUsageResponse;

    expect(Number.isNaN(Date.parse(body.usage.from))).toBe(false);
    expect(Number.isNaN(Date.parse(body.usage.to))).toBe(false);
  });

  it('checks the plan entitlement before reading anything', async () => {
    bind({ role: 'owner' });
    const { AppError } = await import('@/lib/errors');
    mockRequireTeamAdminAccess.mockRejectedValueOnce(
      new AppError('SUBSCRIPTION_REQUIRED' as never, 'Upgrade required', 403),
    );
    expect((await GET(req() as never)).status).toBe(403);
  });
});
