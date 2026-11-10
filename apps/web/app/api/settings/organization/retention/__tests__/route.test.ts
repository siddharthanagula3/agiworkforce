import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import { RETENTION_DOMAINS, type OrganizationPermission } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

const fixture = vi.hoisted(() => ({
  organizationId: null as string | null,
  roles: new Map<string, string>(),
  deniedPlans: new Set<string>(),
  members: new Map<string, { organization_id: string; role: string }>(),
  policies: new Map<string, Record<string, unknown>[]>(),
  scopedQuery: vi.fn(),
  mockQuery: vi.fn(),
  mockRecordAuditEvent: vi.fn(),
  logAdminDataAccess: vi.fn(),
  savedMembership: vi.fn(),
  savedOrganization: vi.fn(),
  forbiddenIo: vi.fn(() => {
    throw new Error('Unexpected retention fixture I/O');
  }),
}));
const { mockQuery, mockRecordAuditEvent } = fixture;

vi.mock('@/lib/services/organization-permission-service', async () => {
  const { permissionsForRole } =
    await import('@/lib/services/__tests__/organization-permission-service-mock');
  const { createError } = await import('@/lib/errors');
  return {
    ...(await vi.importActual<OrganizationPermissionServiceModule>(
      '@/lib/services/organization-permission-service',
    )),

    resolveOrganizationPermissions: vi.fn(async (organizationId: string) =>
      permissionsForRole(fixture.roles.get(organizationId) ?? null),
    ),
    requireMemberPermission: vi.fn(
      async (
        organizationId: string,
        userId: string,
        permission: OrganizationPermission,
        message: string,
      ) => {
        expect(userId).toBe('user-1');
        const permissions = permissionsForRole(fixture.roles.get(organizationId) ?? null);
        if (!permissions.has(permission)) throw createError.forbidden(message);
        return permissions;
      },
    ),
  };
});
vi.mock('@/lib/services/org-sharing-service', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  resolveOrgMembership: fixture.savedMembership,
}));
vi.mock('@/lib/services/active-workspace-service', async () => ({
  ...(await vi.importActual<ActiveWorkspaceServiceModule>(
    '@/lib/services/active-workspace-service',
  )),

  resolveActiveOrganizationId: fixture.savedOrganization,
}));
vi.mock('@/lib/services/org-entitlements', async () => ({
  ...(await vi.importActual<OrgEntitlementsModule>('@/lib/services/org-entitlements')),

  getOrganizationEntitlements: fixture.forbiddenIo,
  getSharedProjectLimitErrorMessage: fixture.forbiddenIo,
  isOrgResourceLimitError: fixture.forbiddenIo,
}));
vi.mock('@/lib/resources/purge-soft-deleted', async () => ({
  ...(await vi.importActual<PurgeSoftDeletedModule>('@/lib/resources/purge-soft-deleted')),
  purgeDerivedRecords: fixture.forbiddenIo,
}));
vi.mock('@/lib/server/media-storage', async () => ({
  ...(await vi.importActual<MediaStorageModule>('@/lib/server/media-storage')),
  deleteStoredMediaObjects: fixture.forbiddenIo,
}));
vi.mock('@/lib/server/object-storage', async () => ({
  ...(await vi.importActual<ObjectStorageModule>('@/lib/server/object-storage')),
  objectKeyFromStorageUri: fixture.forbiddenIo,
}));
vi.mock('@/lib/server/project-knowledge-object-storage', async () => ({
  ...(await vi.importActual<ProjectKnowledgeObjectStorageModule>(
    '@/lib/server/project-knowledge-object-storage',
  )),

  deleteProjectKnowledgeObject: fixture.forbiddenIo,
}));
vi.mock('@/lib/services/organization-policy-service', async () => ({
  ...(await vi.importActual<OrganizationPolicyServiceModule>(
    '@/lib/services/organization-policy-service',
  )),

  readOrganizationPolicy: fixture.forbiddenIo,
  readWorkspaceCodeControls: fixture.forbiddenIo,
}));
vi.mock('@/lib/error-handler', async () => {
  const { AppError } = await import('@/lib/errors');
  return {
    ...(await vi.importActual<ErrorHandlerModule>('@/lib/error-handler')),

    withErrorHandler:
      (handler: (request: Request) => Promise<Response>) => async (request: Request) => {
        try {
          return await handler(request);
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          return Response.json({ error: error.message }, { status: error.statusCode });
        }
      },
  };
});
vi.mock('@/lib/rate-limit', async () => ({
  ...(await vi.importActual<RateLimitModule>('@/lib/rate-limit')),
  withRateLimit: vi.fn(),
}));
vi.mock('@/lib/csrf', async () => ({
  ...(await vi.importActual<CsrfModule>('@/lib/csrf')),
  requireCsrfToken: vi.fn(),
}));
vi.mock('@/lib/cors', async () => ({
  ...(await vi.importActual<CorsModule>('@/lib/cors')),
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/logger', async () => ({
  ...(await vi.importActual<LoggerModule>('@/lib/logger')),

  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', async () => ({
  ...(await vi.importActual<RlsDbModule>('@/lib/server/rls-db')),

  getUserScopedDb: vi.fn(async () => ({
    db: { query: fixture.scopedQuery },
    userId: 'user-1',
    organizationId: fixture.organizationId,
  })),
}));
vi.mock('@/lib/server/neon-db', async () => ({
  ...(await vi.importActual<NeonDbModule>('@/lib/server/neon-db')),

  getNeonDb: vi.fn(() => ({ query: fixture.mockQuery })),
}));
vi.mock('@/lib/server/admin-data-access', () => ({
  logAdminDataAccess: fixture.logAdminDataAccess,
}));
vi.mock('@/lib/security-audit', async () => ({
  ...(await vi.importActual<SecurityAuditModule>('@/lib/security-audit')),

  recordAuditEvent: fixture.mockRecordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: fixture.forbiddenIo,
}));
vi.mock('@/app/api/settings/team/team-admin-access', async () => {
  const { createError } = await import('@/lib/errors');
  return {
    ...(await vi.importActual<TeamAdminAccessModule>('@/app/api/settings/team/team-admin-access')),

    requireTeamAdminAccess: vi.fn(async (_db: unknown, userId: string, organizationId: string) => {
      expect(userId).toBe('user-1');
      if (fixture.deniedPlans.has(organizationId)) throw createError.forbidden('Plan denied');
      return { plan: 'enterprise', canManageTeam: true };
    }),
  };
});

import { requireCsrfToken } from '@/lib/csrf';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { getNeonDb } from '@/lib/server/neon-db';
import { requireMemberPermission } from '@/lib/services/organization-permission-service';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';
import { GET, PUT } from '../route';
type OrganizationPermissionServiceModule =
  typeof import('@/lib/services/organization-permission-service');
type ActiveWorkspaceServiceModule = typeof import('@/lib/services/active-workspace-service');
type OrgEntitlementsModule = typeof import('@/lib/services/org-entitlements');
type PurgeSoftDeletedModule = typeof import('@/lib/resources/purge-soft-deleted');
type MediaStorageModule = typeof import('@/lib/server/media-storage');
type ObjectStorageModule = typeof import('@/lib/server/object-storage');
type ProjectKnowledgeObjectStorageModule =
  typeof import('@/lib/server/project-knowledge-object-storage');
type OrganizationPolicyServiceModule = typeof import('@/lib/services/organization-policy-service');
type ErrorHandlerModule = typeof import('@/lib/error-handler');
type RateLimitModule = typeof import('@/lib/rate-limit');
type CsrfModule = typeof import('@/lib/csrf');
type CorsModule = typeof import('@/lib/cors');
type LoggerModule = typeof import('@/lib/logger');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type SecurityAuditModule = typeof import('@/lib/security-audit');
type TeamAdminAccessModule = typeof import('@/app/api/settings/team/team-admin-access');

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const BODY = { policies: [{ domain: 'notifications', retentionDays: 30, enforced: true }] };

function bind(role: string, stored: Record<string, unknown>[] = []) {
  fixture.roles.set(ORG, role);
  fixture.members.set(ORG, { organization_id: ORG, role });
  fixture.policies.set(ORG, structuredClone(stored));
}

function put(body: unknown, selector?: string): Request {
  return new Request('https://app.test/api/settings/organization/retention', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...(selector === undefined ? {} : { [MANAGED_CLOUD_ORGANIZATION_HEADER]: selector }),
    },
  });
}

function requestFor(method: 'GET' | 'PUT', selector?: string): Request {
  return method === 'PUT'
    ? put(BODY, selector)
    : new Request('https://app.test/api/settings/organization/retention', {
        headers: selector === undefined ? {} : { [MANAGED_CLOUD_ORGANIZATION_HEADER]: selector },
      });
}

function expectNoResources() {
  expect(getNeonDb).not.toHaveBeenCalled();
  expect(mockQuery).not.toHaveBeenCalled();
  expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  expect(fixture.logAdminDataAccess).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.organizationId = ORG;
  fixture.roles.clear();
  fixture.members.clear();
  fixture.policies.clear();
  fixture.deniedPlans.clear();
  fixture.roles.set(ORG_A, 'owner');
  fixture.members.set(ORG_A, { organization_id: ORG_A, role: 'owner' });
  fixture.policies.set(ORG_A, [
    {
      organization_id: ORG_A,
      domain: 'files',
      retention_days: 90,
      enforced: true,
      updated_at: null,
    },
  ]);
  bind('admin');
  fixture.savedMembership.mockReset().mockResolvedValue({ organizationId: ORG_A, role: 'owner' });
  fixture.savedOrganization.mockReset().mockResolvedValue(ORG_A);
  vi.mocked(requireCsrfToken).mockReset().mockResolvedValue(null);
  vi.mocked(withRateLimit).mockReset().mockResolvedValue(null);
  fixture.mockRecordAuditEvent.mockReset().mockResolvedValue(undefined);
  fixture.logAdminDataAccess.mockReset().mockResolvedValue(undefined);
  fixture.scopedQuery.mockReset().mockImplementation(async (sql: string, params: unknown[]) => {
    if (/from public\.organization_members/i.test(sql)) {
      expect(sql).toMatch(/organization_id = \$1 and user_id = \$2/);
      expect(sql).toMatch(/status = 'active'/);
      expect(params).toEqual([fixture.organizationId, 'user-1']);
      const row = fixture.members.get(String(params[0]));
      return row ? [row] : [];
    }
    throw new Error(`Unexpected scoped SQL: ${sql}`);
  });
  mockQuery.mockReset().mockImplementation(async (sql: string, params: unknown[]) => {
    const organizationId = String(params[0]);
    expect([ORG_A, ORG]).toContain(organizationId);
    if (/insert into public\.organization_domain_retention_policies/i.test(sql)) {
      expect(sql).toMatch(/values \(\$1, \$2, \$3, \$4, \$5\)/);
      expect(params).toHaveLength(5);
      const rows = fixture.policies.get(organizationId) ?? [];
      fixture.policies.set(organizationId, [
        ...rows.filter((row) => row['domain'] !== params[1]),
        {
          organization_id: organizationId,
          domain: params[1],
          retention_days: params[2],
          enforced: params[3],
          updated_at: null,
        },
      ]);
      return [];
    }
    expect(sql).toMatch(/where organization_id = \$1/);
    if (/from public\.organization_domain_retention_policies/i.test(sql)) {
      expect(params).toEqual([organizationId]);
      return structuredClone(fixture.policies.get(organizationId) ?? []);
    }
    if (/from public\.organization_domain_retention_sweeps/i.test(sql)) {
      expect(params).toEqual([organizationId, 40]);
      return [];
    }
    throw new Error(`Unexpected privileged SQL: ${sql}`);
  });
});

describe('/api/settings/organization/retention', () => {
  it('lists a window for every domain, defaulting to not enforced', async () => {
    bind('admin', [
      {
        organization_id: ORG,
        domain: 'files',
        retention_days: 30,
        enforced: true,
        updated_at: null,
      },
    ]);

    const res = await GET(new Request('https://app.test/x') as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.canManageRetention).toBe(true);
    expect(body.policies).toHaveLength(RETENTION_DOMAINS.length);
    expect(body.policies.find((p: { domain: string }) => p.domain === 'files')).toMatchObject({
      retentionDays: 30,
      enforced: true,
    });
    expect(body.policies.find((p: { domain: string }) => p.domain === 'work').enforced).toBe(false);
  });

  it('refuses a member without audit.read', async () => {
    bind('member');

    expect((await GET(new Request('https://app.test/x') as never)).status).toBe(403);
  });

  it('saves each domain separately and records the change as critical when enforcement starts', async () => {
    bind('owner');

    const res = await PUT(
      put({ policies: [{ domain: 'notifications', retentionDays: 30, enforced: true }] }) as never,
    );

    expect(res.status).toBe(200);
    const upsert = mockQuery.mock.calls.find(([sql]) =>
      /insert into public\.organization_domain_retention_policies/i.test(String(sql)),
    );
    expect(upsert?.[1]).toEqual([ORG, 'notifications', 30, true, 'user-1']);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'retention_policy_changed',
        severity: 'critical',
        detail: expect.objectContaining({ changedKeys: ['notifications:enforced:30d'] }),
      }),
    );
  });

  it('refuses a change from a role without policy.manage', async () => {
    bind('viewer');

    const res = await PUT(
      put({ policies: [{ domain: 'files', retentionDays: 30, enforced: true }] }) as never,
    );

    expect(res.status).toBe(403);
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('rejects an unknown domain or a window outside the allowed range', async () => {
    bind('owner');

    expect(
      (
        await PUT(
          put({ policies: [{ domain: 'email', retentionDays: 30, enforced: true }] }) as never,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await PUT(
          put({ policies: [{ domain: 'files', retentionDays: 0, enforced: true }] }) as never,
        )
      ).status,
    ).toBe(400);
  });
});

// These source-only fixtures do not establish runtime authentication or database RLS behavior.
afterEach(() => {
  expect(fixture.savedMembership).not.toHaveBeenCalled();
  expect(fixture.savedOrganization).not.toHaveBeenCalled();
  expect(fixture.forbiddenIo).not.toHaveBeenCalled();
});

describe('authoritative retention workspace', () => {
  for (const method of ['GET', 'PUT'] as const) {
    const invoke = (request: Request) =>
      method === 'GET' ? GET(request as never) : PUT(request as never);

    for (const selector of [ORG, undefined]) {
      const header = selector ? 'explicit' : 'no';
      it(`${method} uses captured B rather than saved A with ${header} header`, async () => {
        const beforeA = structuredClone(fixture.policies.get(ORG_A));
        const request = requestFor(method, selector);
        const response = await invoke(request);
        const body = await response.json();
        expect(response.status).toBe(200);
        expect(getUserScopedDb).toHaveBeenCalledWith(request);
        expect(body.organizationId).toBe(ORG);
        expect(body.canManageRetention).toBe(true);
        expect(fixture.scopedQuery).toHaveBeenCalledTimes(1);
        expect(fixture.scopedQuery).toHaveBeenCalledWith(expect.any(String), [ORG, 'user-1']);
        expect(requireTeamAdminAccess).toHaveBeenCalledWith(
          { query: fixture.scopedQuery },
          'user-1',
          ORG,
        );
        expect(requireMemberPermission).toHaveBeenCalledWith(
          ORG,
          'user-1',
          method === 'GET' ? 'audit.read' : 'policy.manage',
          expect.any(String),
        );
        expect(mockQuery).toHaveBeenCalled();
        for (const [, params] of mockQuery.mock.calls) {
          expect(params[0]).toBe(ORG);
        }
        expect(fixture.policies.get(ORG_A)).toEqual(beforeA);
        if (method === 'GET') {
          expect(fixture.logAdminDataAccess).toHaveBeenCalledWith(request, {
            userId: 'user-1',
            organizationId: ORG,
            role: 'admin',
            resourceType: 'organization_retention',
            count: 0,
          });
          expect(mockRecordAuditEvent).not.toHaveBeenCalled();
          expect(
            mockQuery.mock.calls.some(([sql]) => /\b(insert|update|delete)\b/i.test(sql)),
          ).toBe(false);
          expect(
            body.policies.find((policy: { domain: string }) => policy.domain === 'files').enforced,
          ).toBe(false);
        } else {
          expect(mockQuery).toHaveBeenCalledWith(
            expect.stringMatching(/insert into public\.organization_domain_retention_policies/i),
            [ORG, 'notifications', 30, true, 'user-1'],
          );
          expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
          expect(mockRecordAuditEvent).toHaveBeenCalledWith({
            userId: 'user-1',
            organizationId: ORG,
            eventType: 'retention_policy_changed',
            request,
            outcome: 'success',
            severity: 'critical',
            detail: {
              resourceType: 'organization_retention',
              resourceId: ORG,
              role: 'admin',
              changedKeys: ['notifications:enforced:30d'],
            },
          });
          expect(
            body.policies.find((policy: { domain: string }) => policy.domain === 'notifications'),
          ).toMatchObject({ retentionDays: 30, enforced: true });
          expect(fixture.policies.get(ORG)).toContainEqual(
            expect.objectContaining({
              domain: 'notifications',
              retention_days: 30,
              enforced: true,
            }),
          );
          expect(fixture.logAdminDataAccess).not.toHaveBeenCalled();
        }
      });
    }

    it(`${method} also honors explicitly captured A`, async () => {
      fixture.organizationId = ORG_A;
      const response = await invoke(requestFor(method, ORG_A));
      expect(response.status).toBe(200);
      expect((await response.json()).organizationId).toBe(ORG_A);
      expect(fixture.scopedQuery).toHaveBeenCalledWith(expect.any(String), [ORG_A, 'user-1']);
      for (const [, params] of mockQuery.mock.calls) {
        expect(params[0]).toBe(ORG_A);
      }
    });

    it(`${method} refuses Personal before membership, resource access, or audits`, async () => {
      fixture.organizationId = null;
      expect(
        (await invoke(requestFor(method, MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE))).status,
      ).toBe(403);
      expect(fixture.scopedQuery).not.toHaveBeenCalled();
      expect(requireTeamAdminAccess).not.toHaveBeenCalled();
      expect(requireMemberPermission).not.toHaveBeenCalled();
      expectNoResources();
    });

    for (const membership of ['missing', 'mismatched'] as const) {
      it(`${method} refuses ${membership} active B membership despite A ownership`, async () => {
        if (membership === 'missing') {
          fixture.members.delete(ORG);
        } else {
          fixture.members.set(ORG, { organization_id: ORG_A, role: 'owner' });
        }
        expect((await invoke(requestFor(method, ORG))).status).toBe(403);
        expect(fixture.scopedQuery).toHaveBeenCalledWith(expect.any(String), [ORG, 'user-1']);
        expect(requireTeamAdminAccess).not.toHaveBeenCalled();
        expect(requireMemberPermission).not.toHaveBeenCalled();
        expectNoResources();
      });
    }

    it(`${method} refuses B permission despite A ownership`, async () => {
      bind(method === 'GET' ? 'member' : 'viewer');
      expect((await invoke(requestFor(method, ORG))).status).toBe(403);
      expect(requireMemberPermission).toHaveBeenCalledWith(
        ORG,
        'user-1',
        method === 'GET' ? 'audit.read' : 'policy.manage',
        expect.any(String),
      );
      expectNoResources();
    });

    it(`${method} refuses B plan despite A entitlement`, async () => {
      fixture.deniedPlans.add(ORG);
      expect((await invoke(requestFor(method, ORG))).status).toBe(403);
      expect(requireTeamAdminAccess).toHaveBeenCalledWith(
        { query: fixture.scopedQuery },
        'user-1',
        ORG,
      );
      expect(requireMemberPermission).not.toHaveBeenCalled();
      expectNoResources();
    });

    it(`${method} keeps rate limiting before authentication`, async () => {
      vi.mocked(withRateLimit).mockResolvedValueOnce(new Response(null, { status: 429 }) as never);
      expect((await invoke(requestFor(method))).status).toBe(429);
      expect(withRateLimit).toHaveBeenCalledWith(
        expect.any(Request),
        method === 'GET' ? 'settings-org' : 'settings-org-patch',
      );
      expect(getUserScopedDb).not.toHaveBeenCalled();
      expect(fixture.scopedQuery).not.toHaveBeenCalled();
      expectNoResources();
    });
  }

  it('keeps PUT CSRF refusal before rate limiting and authentication', async () => {
    vi.mocked(requireCsrfToken).mockResolvedValueOnce(new Response(null, { status: 403 }) as never);
    expect((await PUT(put(BODY) as never)).status).toBe(403);
    expect(withRateLimit).not.toHaveBeenCalled();
    expect(getUserScopedDb).not.toHaveBeenCalled();
    expectNoResources();
  });

  it.each([
    { policies: [{ domain: 'email', retentionDays: 30, enforced: true }] },
    { policies: [{ domain: 'files', retentionDays: 0, enforced: true }] },
    { policies: [] },
    { policies: [{ domain: 'files', retentionDays: 30, enforced: true, organizationId: ORG_A }] },
    { ...BODY, organizationId: ORG_A },
  ])(
    'rejects invalid or scope-injecting PUT payload before privileged access: %j',
    async (body) => {
      expect((await PUT(put(body) as never)).status).toBe(400);
      expectNoResources();
    },
  );
});

type ImportedModule0 = typeof import('@/lib/services/org-sharing-service');
