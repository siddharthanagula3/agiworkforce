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
vi.mock('@/lib/services/organization-activity-service', () => ({
  readOrganizationActivityDays: mockActivity,
}));

import { AppError } from '@/lib/errors';
import { permissionsForRole } from '@/lib/services/__tests__/organization-permission-service-mock';
import { GET } from '../route';
import type { OrganizationUsageResponse } from '../route';

const SAVED_ORG = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const db = { query: (...args: unknown[]) => mockQuery(...args) };

function bind({ role = 'admin' as 'owner' | 'admin' | 'member' | 'viewer' } = {}) {
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
    if (/from public\.managed_usage_requests/i.test(text)) {
      return [
        {
          key: null,
          requests: 3,
          input_tokens: '100',
          output_tokens: '50',
          cost_microusd: '750000',
        },
      ];
    }
    return [];
  });
}

function req(query = '', selector?: string): Request {
  return new Request(`https://app.test/api/settings/organization/usage-analytics${query}`, {
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

describe('GET /api/settings/organization/usage-analytics', () => {
  it('refuses a plain member', async () => {
    bind({ role: 'member' });
    expect((await GET(req() as never)).status).toBe(403);
  });

  it('refuses a viewer', async () => {
    bind({ role: 'viewer' });
    expect((await GET(req() as never)).status).toBe(403);
  });

  it('serves an admin the exact settled charge in credits', async () => {
    bind({ role: 'admin' });
    const res = await GET(req() as never);

    expect(res.status).toBe(200);
    const body = (await res.json()) as OrganizationUsageResponse;
    expect(body.usage.organizationId).toBe(ORG);
    expect(body.usage.totals.credits).toBe(150);
    expect(body.usage.totals).not.toHaveProperty('costCents');
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

  it('serves an admin the per-day code sessions and tool acceptance for the same window', async () => {
    bind({ role: 'admin' });
    const day = {
      day: '2026-10-20T00:00:00.000Z',
      codeSessions: 4,
      toolDecisions: { accepted: 3, rejected: 1 },
      toolAcceptanceRate: 0.75,
    };
    mockActivity.mockResolvedValueOnce([day]);

    const res = await GET(req() as never);
    const body = (await res.json()) as OrganizationUsageResponse;

    expect(body.activity).toEqual({ status: 'ok', days: [day] });
    expect(mockActivity).toHaveBeenCalledWith(expect.anything(), ORG, {
      from: body.usage.from,
      to: body.usage.to,
    });
  });

  it('never reads activity for someone who is not an administrator', async () => {
    bind({ role: 'member' });

    expect((await GET(req() as never)).status).toBe(403);
    expect(mockActivity).not.toHaveBeenCalled();
  });

  it('keeps the spend view when the activity section cannot be read', async () => {
    bind({ role: 'admin' });
    mockActivity.mockRejectedValueOnce(
      new Error('function app_org_code_session_days does not exist'),
    );

    const res = await GET(req() as never);
    const body = (await res.json()) as OrganizationUsageResponse;

    expect(res.status).toBe(200);
    expect(body.usage.totals.credits).toBe(150);
    expect(body.activity).toEqual({
      status: 'unavailable',
      message: 'Daily code activity could not be loaded. Try again later.',
    });
    expect(JSON.stringify(body)).not.toContain('does not exist');
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
      resourceType: 'organization_usage',
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
    const body = await response.json();
    expect(body.currentUserRole).toBe('admin');
    expect(body.usage.organizationId).toBe(ORG);
    expect(body.usage.totals.credits).toBe(150);
    expect(JSON.stringify(body)).not.toContain(SAVED_ORG);
    expect(mockActivity).toHaveBeenCalledExactlyOnceWith(db, ORG, {
      from: body.usage.from,
      to: body.usage.to,
    });
    const reads = mockQuery.mock.calls.filter(([sql]) =>
      /from public\.managed_usage_requests/i.test(String(sql)),
    );
    expect(reads).toHaveLength(9);
    for (const [, params] of reads) {
      expect(params).toEqual([ORG, body.usage.from, body.usage.to]);
    }
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
