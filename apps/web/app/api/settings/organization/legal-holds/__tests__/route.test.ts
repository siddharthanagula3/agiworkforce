import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';

vi.mock('server-only', () => ({}));

const permissionRole = vi.hoisted(() => ({ value: 'admin' as string | null }));
vi.mock('@/lib/services/organization-permission-service', async () =>
  (
    await import('@/lib/services/__tests__/organization-permission-service-mock')
  ).organizationPermissionServiceMock(permissionRole),
);

const {
  mockQuery,
  mockGetUserScopedDb,
  mockRequireTeamAdminAccess,
  mockRecordAuditEvent,
  mockSavedSelection,
  mockCsrf,
  mockGetNeonDb,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockSavedSelection: vi.fn(),
  mockCsrf: vi.fn(),
  mockGetNeonDb: vi.fn(),
  mockGetUserScopedDb: vi.fn(),
  mockRequireTeamAdminAccess: vi.fn(async () => ({ plan: 'enterprise', canManageTeam: true })),
  mockRecordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/rate-limit', async () => ({
  ...(await vi.importActual<RateLimitModule>('@/lib/rate-limit')),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/csrf', async () => ({
  ...(await vi.importActual<CsrfModule>('@/lib/csrf')),
  requireCsrfToken: mockCsrf,
}));
vi.mock('@/lib/services/active-workspace-service', async () => ({
  ...(await vi.importActual<ActiveWorkspaceServiceModule>(
    '@/lib/services/active-workspace-service',
  )),

  resolveActiveOrganizationId: mockSavedSelection,
}));
vi.mock('@/lib/services/org-entitlements', async () => ({
  ...(await vi.importActual<OrgEntitlementsModule>('@/lib/services/org-entitlements')),

  getOrganizationEntitlements: vi.fn(),
  getSharedProjectLimitErrorMessage: vi.fn(),
  isOrgResourceLimitError: vi.fn(),
  resolveOrganizationEntitlementPlan: vi.fn(async () => 'enterprise'),
}));
vi.mock('@/lib/observability/error-capture', async () => ({
  ...(await vi.importActual<ErrorCaptureModule>('@/lib/observability/error-capture')),
  captureServerError: vi.fn(),
}));
vi.mock('@/lib/server/support-access-service', async () => ({
  ...(await vi.importActual<SupportAccessServiceModule>('@/lib/server/support-access-service')),
  recordSupportDataAccess: vi.fn(),
}));
vi.mock('@/lib/logger', async () => ({
  ...(await vi.importActual<LoggerModule>('@/lib/logger')),

  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', async () => ({
  ...(await vi.importActual<RlsDbModule>('@/lib/server/rls-db')),
  getUserScopedDb: mockGetUserScopedDb,
}));
vi.mock('@/lib/server/neon-db', async () => ({
  ...(await vi.importActual<NeonDbModule>('@/lib/server/neon-db')),

  getNeonDb: mockGetNeonDb,
}));
vi.mock('@/lib/security-audit', async () => ({
  ...(await vi.importActual<SecurityAuditModule>('@/lib/security-audit')),

  recordAuditEvent: mockRecordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/app/api/settings/team/team-admin-access', async () => ({
  ...(await vi.importActual<TeamAdminAccessModule>('@/app/api/settings/team/team-admin-access')),

  requireTeamAdminAccess: mockRequireTeamAdminAccess,
}));

import { GET, POST, DELETE } from '../route';
import { requireMemberPermission } from '@/lib/services/organization-permission-service';
type RateLimitModule = typeof import('@/lib/rate-limit');
type CsrfModule = typeof import('@/lib/csrf');
type ActiveWorkspaceServiceModule = typeof import('@/lib/services/active-workspace-service');
type OrgEntitlementsModule = typeof import('@/lib/services/org-entitlements');
type ErrorCaptureModule = typeof import('@/lib/observability/error-capture');
type SupportAccessServiceModule = typeof import('@/lib/server/support-access-service');
type LoggerModule = typeof import('@/lib/logger');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type SecurityAuditModule = typeof import('@/lib/security-audit');
type TeamAdminAccessModule = typeof import('@/app/api/settings/team/team-admin-access');

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const HOLD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function holdRow(over: Record<string, unknown> = {}) {
  return {
    id: HOLD_ID,
    organization_id: ORG,
    name: 'Matter 41',
    reason: null,
    scope: 'organization',
    subject_user_id: null,
    created_by_user_id: 'user-1',
    released_at: null,
    released_by_user_id: null,
    created_at: '2026-08-23T00:00:00.000Z',
    ...over,
  };
}

function bind({
  role = 'admin' as 'owner' | 'admin' | 'member' | 'viewer',
  insertThrows = null as string | null,
  active = true,
  storedOrganizationId = ORG,
  releaseReturns = [
    holdRow({ released_at: '2026-08-23T01:00:00.000Z', released_by_user_id: 'user-1' }),
  ],
} = {}) {
  permissionRole.value = role;
  mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const text = String(sql);
    if (/from public\.user_settings/i.test(text)) return [{ organization_id: OTHER_ORG }];
    if (/from public\.organization_members/i.test(text)) {
      return params[0] === ORG && params[1] === 'user-1' && active
        ? [{ organization_id: ORG, role }]
        : [];
    }
    if (/insert into public\.legal_holds/i.test(text)) {
      if (params[0] !== ORG) return [];
      if (insertThrows) throw new Error(insertThrows);
      return [holdRow()];
    }
    if (/update public\.legal_holds/i.test(text)) {
      return params[0] === storedOrganizationId && params[1] === HOLD_ID ? releaseReturns : [];
    }
    if (/from public\.legal_holds/i.test(text)) {
      const organizationId = /where h.id = \$1/.test(text) ? params[1] : params[0];
      return organizationId === storedOrganizationId
        ? [holdRow({ organization_id: storedOrganizationId })]
        : [];
    }
    if (/from public\.organization_retention_sweeps/i.test(text)) return [];
    return [];
  });
}

function req(method: string, body?: unknown, workspace?: string): Request {
  return new Request('https://app.test/api/settings/organization/legal-holds', {
    method,
    headers: {
      ...(workspace === undefined ? {} : { [MANAGED_CLOUD_ORGANIZATION_HEADER]: workspace }),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCsrf.mockResolvedValue(null);
  mockSavedSelection.mockResolvedValue(OTHER_ORG);
  mockGetNeonDb.mockImplementation(() => {
    const db = { query: (...args: unknown[]) => mockQuery(...args) };
    return { ...db, transaction: (run: (tx: typeof db) => unknown) => run(db) };
  });
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: (...args: unknown[]) => mockQuery(...args) },
    userId: 'user-1',
    organizationId: ORG,
  });
});

describe('legal holds', () => {
  it('refuses a plain member on every verb', async () => {
    bind({ role: 'member' });
    expect((await GET(req('GET') as never)).status).toBe(403);
    expect((await POST(req('POST', { name: 'x', scope: 'organization' }) as never)).status).toBe(
      403,
    );
    expect((await DELETE(req('DELETE', { holdId: HOLD_ID }) as never)).status).toBe(403);
  });

  it('refuses a viewer', async () => {
    bind({ role: 'viewer' });
    expect((await GET(req('GET') as never)).status).toBe(403);
  });

  it('lists holds and sweeps for an admin', async () => {
    bind({ role: 'admin' });
    const res = await GET(req('GET') as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { holds: unknown[]; sweeps: unknown[] };
    expect(body.holds).toHaveLength(1);
    expect(Array.isArray(body.sweeps)).toBe(true);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'data_accessed',
        organizationId: ORG,
        detail: expect.objectContaining({ resourceType: 'legal_hold', count: 1 }),
      }),
    );
  });

  it('reports the deletion backlog the sweep tracks internally', async () => {
    permissionRole.value = 'admin';
    mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const text = String(sql);
      if (/from public\.user_settings/i.test(text)) return [{ organization_id: OTHER_ORG }];
      if (/from public\.organization_members/i.test(text)) {
        return params[0] === ORG && params[1] === 'user-1'
          ? [{ organization_id: ORG, role: 'admin' }]
          : [];
      }
      if (/from public\.organization_admin_policies/i.test(text)) {
        return [{ retention_days: 30, retention_enforced: true }];
      }
      if (/from public\.web_conversations candidate/i.test(text)) {
        return [{ count: /and not exists/.test(text) ? 900 : 4 }];
      }
      if (/from public\.organization_retention_sweeps/i.test(text)) {
        return [
          { created_at: '2026-09-16T00:00:00.000Z' },
          { created_at: '2026-09-15T00:00:00.000Z' },
        ];
      }
      return [];
    });

    const res = await GET(req('GET') as never);
    const body = (await res.json()) as { backlog: Record<string, unknown> };

    expect(res.status).toBe(200);
    expect(body.backlog).toMatchObject({
      organizationId: ORG,
      enforced: true,
      retentionDays: 30,
      pendingDeletions: 900,
      heldFromDeletion: 4,
      lastSweptAt: '2026-09-16T00:00:00.000Z',
    });
    expect(Number(body.backlog['runsRemaining'])).toBeGreaterThan(0);
    expect(body.backlog['estimatedCompletionAt']).toBe('2026-09-17T00:00:00.000Z');
  });

  it('reports no backlog for a workspace that does not enforce retention', async () => {
    bind({ role: 'admin' });
    const res = await GET(req('GET') as never);
    const body = (await res.json()) as { backlog: Record<string, unknown> };
    expect(body.backlog['enforced']).toBe(false);
    expect(body.backlog['pendingDeletions']).toBe(0);
  });

  it('places an organization-wide hold and records it', async () => {
    bind({ role: 'owner' });
    const res = await POST(
      req('POST', { name: 'Matter 41', scope: 'organization', reason: 'Litigation' }) as never,
    );

    expect(res.status).toBe(201);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'legal_hold_created', organizationId: ORG }),
    );
  });

  it('refuses a member-scoped hold with no subject, which would hold nothing', async () => {
    bind({ role: 'owner' });
    const res = await POST(req('POST', { name: 'Matter 41', scope: 'member' }) as never);
    expect(res.status).toBe(400);
  });

  it('turns a duplicate hold into an explanation, not a 500', async () => {
    bind({ role: 'owner', insertThrows: 'duplicate key value violates unique constraint' });
    const res = await POST(req('POST', { name: 'Matter 41', scope: 'organization' }) as never);

    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/already has an active/i);
  });

  it('records a release at critical severity', async () => {
    // Releasing a hold is the moment held records become deletable again. It is
    // the single most consequential action on this surface.
    bind({ role: 'owner' });
    const res = await DELETE(req('DELETE', { holdId: HOLD_ID }) as never);

    expect(res.status).toBe(200);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'legal_hold_released', severity: 'critical' }),
    );
  });

  it('answers the same way for another org’s hold as for an already-released one', async () => {
    // Distinguishing them would let a caller probe which hold ids exist
    // elsewhere.
    bind({ role: 'owner', releaseReturns: [] });
    const res = await DELETE(req('DELETE', { holdId: HOLD_ID }) as never);
    expect(res.status).toBe(404);
  });

  it('rejects a malformed hold id rather than querying with it', async () => {
    bind({ role: 'owner' });
    const res = await DELETE(req('DELETE', { holdId: 'not-a-uuid' }) as never);
    expect(res.status).toBe(400);
  });

  it('checks the plan entitlement before reading anything', async () => {
    bind({ role: 'owner' });
    const { AppError } = await import('@/lib/errors');
    mockRequireTeamAdminAccess.mockRejectedValueOnce(
      new AppError('SUBSCRIPTION_REQUIRED' as never, 'Upgrade required', 403),
    );
    expect((await GET(req('GET') as never)).status).toBe(403);
  });
});

// These fixtures exercise route/service arguments, not selector parsing or SQL/RLS enforcement.
describe('legal holds captured workspace binding', () => {
  const verbs = [
    { method: 'GET', handler: GET, body: undefined, status: 200, eventType: 'data_accessed' },
    {
      method: 'POST',
      handler: POST,
      body: { name: 'Matter 41', scope: 'organization' },
      status: 201,
      eventType: 'legal_hold_created',
    },
    {
      method: 'DELETE',
      handler: DELETE,
      body: { holdId: HOLD_ID },
      status: 200,
      eventType: 'legal_hold_released',
    },
  ];

  function expectNoResources() {
    expect(
      mockQuery.mock.calls.filter(([sql]) =>
        /public\.(legal_holds|legal_hold_custodians|organization_retention_sweeps|organization_admin_policies|web_conversations)/i.test(
          String(sql),
        ),
      ),
    ).toEqual([]);
    expect(mockGetNeonDb).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  }

  it.each(verbs)(
    '$method uses captured B instead of saved A',
    async ({ method, handler, body, status, eventType }) => {
      bind();
      const request = req(method, body, ORG);
      const response = await handler(request as never);

      expect(response.status).toBe(status);
      expect(mockGetUserScopedDb).toHaveBeenCalledWith(request);
      expect(mockSavedSelection).not.toHaveBeenCalled();
      expect(mockQuery.mock.calls.some(([sql]) => /public\.user_settings/.test(String(sql)))).toBe(
        false,
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/organization_id = \$1 and user_id = \$2\s+and status = 'active'/),
        [ORG, 'user-1'],
      );
      expect(mockRequireTeamAdminAccess).toHaveBeenCalledWith(expect.anything(), 'user-1', ORG);
      expect(requireMemberPermission).toHaveBeenCalledWith(
        ORG,
        'user-1',
        'content.govern',
        expect.any(String),
      );
      expect(mockRecordAuditEvent).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          organizationId: ORG,
          userId: 'user-1',
          eventType,
        }),
      );
      const resources = mockQuery.mock.calls.filter(([sql]) =>
        /public\.(legal_holds|organization_retention_sweeps|organization_admin_policies)/i.test(
          String(sql),
        ),
      );
      expect(resources.length).toBeGreaterThan(0);
      for (const [sql, params] of resources) {
        expect(params[/where h.id = \$1/.test(String(sql)) ? 1 : 0]).toBe(ORG);
        expect(params).not.toContain(OTHER_ORG);
      }
      if (method === 'GET') {
        expect(await response.json()).toMatchObject({
          organizationId: ORG,
          holds: [{ organizationId: ORG }],
        });
        expect(mockGetNeonDb).not.toHaveBeenCalled();
      } else {
        expect(mockGetNeonDb).toHaveBeenCalledOnce();
        expect(await response.json()).toMatchObject({ hold: { organizationId: ORG } });
      }
    },
  );

  it.each(verbs)(
    '$method preserves headerless captured B',
    async ({ method, handler, body, status }) => {
      bind();
      const request = req(method, body);
      expect(request.headers.has(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(false);
      expect((await handler(request as never)).status).toBe(status);
      expect(mockSavedSelection).not.toHaveBeenCalled();
      expect(requireMemberPermission).toHaveBeenCalledWith(
        ORG,
        'user-1',
        'content.govern',
        expect.any(String),
      );
      expect(mockRecordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG }),
      );
    },
  );

  it.each(verbs)(
    '$method refuses captured Personal without falling back to saved A',
    async ({ method, handler, body }) => {
      bind();
      mockGetUserScopedDb.mockResolvedValueOnce({
        db: { query: mockQuery },
        userId: 'user-1',
        organizationId: null,
      });
      expect(
        (await handler(req(method, body, MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE) as never))
          .status,
      ).toBe(403);
      expect(mockSavedSelection).not.toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
      expect(mockRequireTeamAdminAccess).not.toHaveBeenCalled();
      expect(requireMemberPermission).not.toHaveBeenCalled();
      expectNoResources();
    },
  );

  it.each(verbs)(
    '$method refuses missing active membership in captured B',
    async ({ method, handler, body }) => {
      bind({ active: false });
      expect((await handler(req(method, body, ORG) as never)).status).toBe(403);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("status = 'active'"), [
        ORG,
        'user-1',
      ]);
      expect(mockRequireTeamAdminAccess).not.toHaveBeenCalled();
      expect(requireMemberPermission).not.toHaveBeenCalled();
      expectNoResources();
    },
  );

  it.each(verbs)(
    '$method rejects a mismatched membership row',
    async ({ method, handler, body }) => {
      bind();
      mockQuery.mockResolvedValueOnce([{ organization_id: OTHER_ORG, role: 'owner' }]);
      expect((await handler(req(method, body) as never)).status).toBe(403);
      expect(mockRequireTeamAdminAccess).not.toHaveBeenCalled();
      expect(requireMemberPermission).not.toHaveBeenCalled();
      expectNoResources();
    },
  );

  it.each(verbs)(
    '$method stops at the permission denial for B',
    async ({ method, handler, body }) => {
      bind({ role: 'member' });
      expect((await handler(req(method, body) as never)).status).toBe(403);
      expect(requireMemberPermission).toHaveBeenCalledWith(
        ORG,
        'user-1',
        'content.govern',
        expect.any(String),
      );
      expectNoResources();
    },
  );

  it.each(verbs)('$method stops at the plan denial for B', async ({ method, handler, body }) => {
    bind();
    const { AppError } = await import('@/lib/errors');
    mockRequireTeamAdminAccess.mockRejectedValueOnce(
      new AppError('SUBSCRIPTION_REQUIRED' as never, 'Upgrade required', 403),
    );
    expect((await handler(req(method, body) as never)).status).toBe(403);
    expect(mockRequireTeamAdminAccess).toHaveBeenCalledWith(expect.anything(), 'user-1', ORG);
    expect(requireMemberPermission).not.toHaveBeenCalled();
    expectNoResources();
  });

  it('does not release an A-only hold while operating in B', async () => {
    bind({ storedOrganizationId: OTHER_ORG });
    const response = await DELETE(req('DELETE', { holdId: HOLD_ID }, ORG) as never);
    expect(response.status).toBe(404);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringMatching(/update public\.legal_holds/), [
      ORG,
      HOLD_ID,
      'user-1',
    ]);
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
    expect(mockSavedSelection).not.toHaveBeenCalled();
  });

  it.each(verbs.filter(({ method }) => method !== 'GET'))(
    '$method stops at CSRF rejection',
    async ({ method, handler, body }) => {
      bind();
      mockCsrf.mockResolvedValueOnce(new Response(null, { status: 403 }));
      expect((await handler(req(method, body) as never)).status).toBe(403);
      expect(mockGetUserScopedDb).not.toHaveBeenCalled();
      expectNoResources();
    },
  );

  it.each([
    { name: 'Matter 41', scope: 'custodian' },
    { name: 'Matter 41', scope: 'organization', resourceTypes: [] },
    { name: 'Matter 41', scope: 'organization', resourceTypes: ['not-a-resource'] },
    { name: 'Matter 41', scope: 'organization', organizationId: OTHER_ORG },
  ])('rejects invalid scope/resource input before writes: %j', async (body) => {
    bind();
    expect((await POST(req('POST', body) as never)).status).toBe(400);
    expectNoResources();
  });
});

type CompleteMockModule0 = typeof import('@/lib/services/org-entitlements');

type RetainedMockModule1 = typeof import('@/lib/logger');
