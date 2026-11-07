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
    withErrorHandler: (handler: (request: never) => Promise<Response>) =>
      async (request: never) => {
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
vi.mock('@/lib/server/organization-encryption-keys', () => ({
  readOrganizationKeyStatus: vi.fn(async () => ({
    availability: { state: 'platform_derived', keyId: 'platform-1' },
    status: null,
    lastRotatedAt: null,
    revokedAt: null,
  })),
}));
vi.mock('@/lib/services/audit-streaming-service', () => ({
  auditStreamContinuity: vi.fn(async () => []),
}));
vi.mock('@/lib/server/data-region', async () => {
  const { DEFAULT_DATA_REGION } = await import('@agiworkforce/compliance');
  return {
    readOrganizationRegion: vi.fn(async () => ({
      effective: DEFAULT_DATA_REGION,
      requested: null,
      provisioned: true,
      missing: [],
    })),
  };
});
vi.mock('@/lib/services/organization-ip-allow-list-cache', () => ({
  invalidateIpAllowListCache: vi.fn(),
}));

import { AppError } from '@/lib/errors';
import { readOrganizationKeyStatus } from '@/lib/server/organization-encryption-keys';
import { readOrganizationRegion } from '@/lib/server/data-region';
import { auditStreamContinuity } from '@/lib/services/audit-streaming-service';
import { resolveOrganizationEntitlementPlan } from '@/lib/services/org-entitlements';
import { permissionsForRole } from '@/lib/services/__tests__/organization-permission-service-mock';
import { GET } from '../route';
import type { WorkspacePostureResponse } from '../route';

const SAVED_ORG = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const db = { query: (...args: unknown[]) => mockQuery(...args) };

function bind({ role = 'admin' as 'owner' | 'admin' | 'member' | 'viewer', member = true } = {}) {
  permissionRole.value = role;
  state.membership = member ? 'active' : 'absent';
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
    if (/group by role/i.test(text)) return [{ role: 'owner', count: 1 }];
    if (/from public\.organizations\b/i.test(text)) {
      return [{ name: 'Acme', licensed_seats: 10, seats_consumed: 3 }];
    }
    if (/from public\.sso_connections|from public\.directory_sync_connections/i.test(text)) {
      return [];
    }
    if (/from public\.organization_admin_policies/i.test(text)) return [];
    // No customer-managed key association: this workspace is on the platform
    // key, which is what every workspace is on today.
    if (/from public\.organization_encryption_keys/i.test(text)) return [];
    return [{ count: 0 }];
  });
}

function req(query = '', selector?: string): Request {
  return new Request(`https://app.test/api/settings/organization/posture${query}`, {
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
        'SUBSCRIPTION_REQUIRED' as never,
        'Team administration requires an active Team or Enterprise subscription.',
        403,
      ),
    );

    const res = await GET(req() as never);
    expect(res.status).toBe(403);
  });
});

describe('canonical workspace report isolation', () => {
  function expectNoReportRead() {
    expect(
      mockQuery.mock.calls.every(([sql]) =>
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
      'audit.read',
      expect.any(String),
    );
    expect(mockAudit).toHaveBeenCalledExactlyOnceWith(request, {
      userId: 'user-1',
      organizationId: ORG,
      role: 'admin',
      resourceType: 'workspace_posture',
    });
    const membershipReads = mockQuery.mock.calls.filter(([sql]) =>
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
    expect(body.posture.organizationId).toBe(ORG);
    expect(body.posture.organizationName).toBe('Acme');
    expect(readOrganizationKeyStatus).toHaveBeenCalledExactlyOnceWith(db, ORG);
    expect(readOrganizationRegion).toHaveBeenCalledExactlyOnceWith(db, ORG);
    expect(auditStreamContinuity).toHaveBeenCalledExactlyOnceWith(db, expect.any(Date), ORG);
    expect(resolveOrganizationEntitlementPlan).toHaveBeenCalledExactlyOnceWith(ORG);
    expect(body.posture.groups.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain(SAVED_ORG);
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
      'audit.read',
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
