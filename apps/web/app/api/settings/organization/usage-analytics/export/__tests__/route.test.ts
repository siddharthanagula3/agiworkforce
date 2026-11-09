import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';

vi.mock('server-only', () => ({}));

const permissionRole = vi.hoisted(() => ({ value: 'admin' as string | null }));
const state = vi.hoisted(() => ({
  membership: 'active' as 'active' | 'absent' | 'mismatched',
  denyPlan: false,
  denyPermission: false,
}));
const {
  mockQuery,
  mockGetUserScopedDb,
  mockRequireTeamAdminAccess,
  mockPermission,
  mockAudit,
  mockRateLimit,
  mockSavedWorkspace,
  mockActivity,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGetUserScopedDb: vi.fn(),
  mockRequireTeamAdminAccess: vi.fn(),
  mockPermission: vi.fn(),
  mockAudit: vi.fn(),
  mockRateLimit: vi.fn(),
  mockSavedWorkspace: vi.fn(),
  mockActivity: vi.fn(),
}));

// Keep the handler, membership helper and report builders real; isolate I/O and middleware.
vi.mock('@/lib/error-handler', async () => {
  const { NextResponse } = await import('next/server');
  const { AppError } = await import('@/lib/errors');
  const { applySensitiveNoStore } = await import('@/lib/private-cache-policy');
  return {
    withErrorHandler:
      (handler: (request: never) => Promise<Response>) => async (request: never) => {
        let response: Response;
        try {
          response = await handler(request);
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          response = NextResponse.json({ error: error.code }, { status: error.statusCode });
        }
        applySensitiveNoStore(request, response);
        return response;
      },
  };
});
vi.mock('@/lib/cors', () => ({ handleCorsPreflightRequest: vi.fn(() => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => {
    throw new Error('Unexpected unscoped database access');
  }),
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: mockSavedWorkspace,
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: mockRequireTeamAdminAccess,
}));
vi.mock('@/lib/services/organization-permission-service', () => ({
  requireMemberPermission: mockPermission,
  resolveOrganizationPermissions: vi.fn(),
}));
vi.mock('@/lib/server/admin-data-access', () => ({ logAdminDataAccess: mockAudit }));
vi.mock('@/lib/services/org-entitlements', () => ({
  getOrganizationEntitlements: vi.fn(async () => ({})),
  getSharedProjectLimitErrorMessage: vi.fn(() => ''),
  isOrgResourceLimitError: vi.fn(() => false),
  resolveOrganizationEntitlementPlan: vi.fn(async () => 'enterprise'),
  resolveUserPersonalPlanTier: vi.fn(async () => 'enterprise'),
}));

import { AppError } from '@/lib/errors';
import { permissionsForRole } from '@/lib/services/__tests__/organization-permission-service-mock';
import { GET } from '../route';

const SAVED_ORG = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const db = { query: (...args: unknown[]) => mockQuery(...args) };

function bind({
  role = 'admin' as 'owner' | 'admin' | 'member' | 'viewer',
  memberKey = 'user-a',
} = {}) {
  permissionRole.value = role;
  mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const text = String(sql);
    if (/from public\.user_settings/i.test(text)) {
      return [{ organization_id: SAVED_ORG }];
    }
    if (/from public\.organization_members/i.test(text) && !/group by role/i.test(text)) {
      if (params[0] === SAVED_ORG) {
        return [{ organization_id: SAVED_ORG, role: 'owner' }];
      }
      if (params[0] !== ORG || params[1] !== 'user-1') return [];
      if (state.membership === 'absent') return [];
      return [
        {
          organization_id: state.membership === 'mismatched' ? SAVED_ORG : ORG,
          role,
        },
      ];
    }
    if (params[0] !== ORG) {
      throw new Error('Report query crossed the canonical workspace boundary');
    }
    if (/date_trunc\('day'/.test(text)) {
      return [{ day: '2026-08-22T00:00:00.000Z', requests: 4, cost_microusd: '1200000' }];
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
          cost_microusd: '1200000',
        },
      ];
    }
    if (/group by 1/.test(text)) return [];
    return [
      { key: null, requests: 4, input_tokens: '90', output_tokens: '10', cost_microusd: '1200000' },
    ];
  });
}

function req(query = '', selector?: string): Request {
  return new Request(`https://app.test/api/settings/organization/usage-analytics/export${query}`, {
    headers: selector ? { [MANAGED_CLOUD_ORGANIZATION_HEADER]: selector } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const mock of [
    mockQuery,
    mockGetUserScopedDb,
    mockSavedWorkspace,
    mockRateLimit,
    mockAudit,
    mockActivity,
    mockRequireTeamAdminAccess,
    mockPermission,
  ]) {
    mock.mockReset();
  }
  permissionRole.value = 'admin';
  state.membership = 'active';
  state.denyPlan = false;
  state.denyPermission = false;
  mockGetUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: ORG });
  mockSavedWorkspace.mockResolvedValue(SAVED_ORG);
  mockRateLimit.mockResolvedValue(null);
  mockAudit.mockResolvedValue(undefined);
  mockActivity.mockResolvedValue([]);
  mockRequireTeamAdminAccess.mockImplementation(async (_db, _userId, organizationId) => {
    if (organizationId === ORG && state.denyPlan) {
      throw new AppError('SUBSCRIPTION_REQUIRED' as never, 'Upgrade required', 403);
    }
    return { plan: 'enterprise', canManageTeam: true };
  });
  mockPermission.mockImplementation(async (organizationId, _userId, permission, message) => {
    const role = organizationId === ORG ? permissionRole.value : 'owner';
    if (
      (organizationId === ORG && state.denyPermission) ||
      !permissionsForRole(role).has(permission)
    ) {
      throw new AppError('FORBIDDEN' as never, message, 403);
    }
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
    expect(body).toContain('day,requests,credits');
    expect(body).toContain('2026-08-22T00:00:00.000Z,4,240');
    expect(body).not.toContain('cost_cents');
  });

  it('exports the dimension that was asked for', async () => {
    bind({ role: 'owner' });

    const body = await (await GET(req('?dimension=member') as never)).text();

    expect(body).toContain('member,requests,input_tokens,output_tokens,credits');
    expect(body).toContain('user-a,4,90,10,240');
  });

  it('declares what a dimension export leaves out, and nothing on the daily sheet', async () => {
    bind({ role: 'owner' });

    const member = await (await GET(req('?dimension=member') as never)).text();
    const daily = await (await GET(req('?dimension=daily') as never)).text();

    expect(member).toContain('# breakdown_row_limit,50\n');
    expect(member).toContain('# omitted_requests,0\n');
    expect(member).toContain('# omitted_credits,0\n');
    expect(daily).not.toContain('# omitted_requests');
  });

  it('reports the requests and credits a capped member list omits', async () => {
    bind({ role: 'owner' });
    const answer = mockQuery.getMockImplementation()!;
    mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const text = String(sql);
      if (/user_id as key/.test(text)) {
        return Array.from({ length: 50 }, (_, index) => ({
          key: `user-${index}`,
          requests: 1,
          input_tokens: '1',
          output_tokens: '1',
          cost_microusd: '1000000',
        }));
      }
      if (/count\(distinct user_id\)/.test(text)) {
        return [
          {
            key: null,
            requests: 52,
            input_tokens: '52',
            output_tokens: '52',
            cost_microusd: '52000000',
          },
        ];
      }
      return answer(sql, params);
    });

    const body = await (await GET(req('?dimension=member') as never)).text();

    expect(body).toContain('# omitted_requests,2\n');
    expect(body).toMatch(/# omitted_credits,\d/);
    expect(body).not.toContain('# omitted_credits,0\n');
  });

  it('falls back to the daily sheet for an unknown dimension', async () => {
    bind({ role: 'owner' });

    const body = await (await GET(req('?dimension=passwords') as never)).text();

    expect(body).toContain('day,requests,credits');
  });

  it('neutralises a key a spreadsheet would run as a formula', async () => {
    bind({ role: 'owner', memberKey: '=cmd|calc' });

    const body = await (await GET(req('?dimension=member') as never)).text();

    expect(body).toContain("'=cmd|calc");
    expect(body).not.toMatch(/^=cmd/m);
  });
});

describe('canonical workspace report isolation', () => {
  function expectNoReportRead() {
    expect(
      mockQuery.mock.calls.every(
        ([sql]) =>
          /from public\.organization_members/i.test(String(sql)) &&
          !/group by role/i.test(String(sql)),
      ),
    ).toBe(true);
    expect(mockActivity).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
    expect(mockSavedWorkspace).not.toHaveBeenCalled();
  }

  it.each([
    ['explicit B', ORG],
    ['headerless canonical B', undefined],
  ])('attributes %s to B despite saved A ownership', async (_label, selector) => {
    bind();
    const request = req('', selector);
    const response = await GET(request as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mockGetUserScopedDb).toHaveBeenCalledExactlyOnceWith(request);
    expect(mockSavedWorkspace).not.toHaveBeenCalled();
    expect(mockRequireTeamAdminAccess).toHaveBeenCalledExactlyOnceWith(db, 'user-1', ORG);
    expect(mockPermission).toHaveBeenCalledExactlyOnceWith(
      ORG,
      'user-1',
      'billing.read',
      expect.any(String),
    );
    expect(mockAudit).toHaveBeenCalledExactlyOnceWith(request, {
      userId: 'user-1',
      organizationId: ORG,
      role: 'admin',
      resourceType: 'organization_usage_export',
    });
    const membershipReads = mockQuery.mock.calls.filter(
      ([sql]) =>
        /from public\.organization_members/i.test(String(sql)) &&
        !/group by role/i.test(String(sql)),
    );
    expect(membershipReads).toHaveLength(1);
    expect(membershipReads[0]?.[0]).toContain("status = 'active'");
    expect(membershipReads[0]?.[1]).toEqual([ORG, 'user-1']);
    for (const [, params] of mockQuery.mock.calls) {
      expect(params[0]).toBe(ORG);
    }
    const body = await response.text();
    expect(body).toContain(`# organization_id,${ORG}\n`);
    expect(body).toContain('2026-08-22T00:00:00.000Z,4,240');
    expect(body).not.toContain(SAVED_ORG);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain('attachment');
  });

  it.each([
    ['explicit Personal', MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE],
    ['headerless canonical null', undefined],
  ])('refuses %s without saved A fallback', async (_label, selector) => {
    bind();
    mockGetUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });

    expect((await GET(req('', selector) as never)).status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockRequireTeamAdminAccess).not.toHaveBeenCalled();
    expect(mockPermission).not.toHaveBeenCalled();
    expectNoReportRead();
  });

  it.each(['absent', 'mismatched'] as const)(
    'refuses %s canonical B membership even when A has an owner',
    async (membership) => {
      bind();
      state.membership = membership;

      expect((await GET(req('', ORG) as never)).status).toBe(403);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0]?.[1]).toEqual([ORG, 'user-1']);
      expect(mockRequireTeamAdminAccess).not.toHaveBeenCalled();
      expect(mockPermission).not.toHaveBeenCalled();
      expectNoReportRead();
    },
  );

  it('denies the B plan without borrowing the saved A entitlement', async () => {
    bind();
    state.denyPlan = true;

    expect((await GET(req('', ORG) as never)).status).toBe(403);
    expect(mockRequireTeamAdminAccess).toHaveBeenCalledExactlyOnceWith(db, 'user-1', ORG);
    expect(mockPermission).not.toHaveBeenCalled();
    expectNoReportRead();
  });

  it('denies B permission without borrowing the saved A owner role', async () => {
    bind();
    state.denyPermission = true;

    expect((await GET(req('', ORG) as never)).status).toBe(403);
    expect(mockPermission).toHaveBeenCalledExactlyOnceWith(
      ORG,
      'user-1',
      'billing.read',
      expect.any(String),
    );
    expectNoReportRead();
  });

  it('returns the rate limit before auth, membership, report or audit', async () => {
    bind();
    mockRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    const request = req('', ORG);

    expect((await GET(request as never)).status).toBe(429);
    expect(mockRateLimit).toHaveBeenCalledExactlyOnceWith(request, 'settings-org');
    expect(mockGetUserScopedDb).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockRequireTeamAdminAccess).not.toHaveBeenCalled();
    expect(mockPermission).not.toHaveBeenCalled();
    expectNoReportRead();
  });
});

describe('canonical B bounded usage windows', () => {
  it.each([
    '?from=nonsense&to=nonsense',
    '?from=1999-01-01T00:00:00.000Z&to=2026-11-07T00:00:00.000Z',
    '?from=2026-11-08T00:00:00.000Z&to=2026-11-07T00:00:00.000Z',
  ])('normalizes %s before every B usage query', async (query) => {
    bind();
    const response = await GET(req(query, ORG) as never);

    expect(response.status).toBe(200);
    const reads = mockQuery.mock.calls.filter(([sql]) =>
      /from public\.managed_usage_requests/i.test(String(sql)),
    );
    expect(reads).toHaveLength(9);
    const [, from, to] = reads[0]?.[1] as [string, string, string];
    expect(Number.isNaN(Date.parse(from))).toBe(false);
    expect(Number.isNaN(Date.parse(to))).toBe(false);
    expect(Date.parse(from)).toBeLessThanOrEqual(Date.parse(to));
    expect((Date.parse(to) - Date.parse(from)) / 86_400_000).toBeLessThanOrEqual(366);
    for (const [, params] of reads) {
      expect(params).toEqual([ORG, from, to]);
    }
  });
});

describe('canonical B export cell safety', () => {
  it.each(['=cmd|calc', '+SUM(1)', '-1+2', '@SUM(1)', '\tformula', '\rformula'])(
    'guards the B member key %s without changing attribution',
    async (memberKey) => {
      bind({ memberKey });
      const response = await GET(req('?dimension=member', ORG) as never);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(body).toContain(`# organization_id,${ORG}\n`);
      expect(body).toContain(`'${memberKey},4,90,10,240`);
      expect(body).not.toContain(SAVED_ORG);
    },
  );
});
