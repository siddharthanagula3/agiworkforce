import type { NextRequest } from 'next/server';
import type { OrganizationPermission } from '@agiworkforce/types';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getUserScopedDb: vi.fn(),
  resolveActiveOrganizationId: vi.fn(),
  requireTeamAdminAccess: vi.fn(),
  getTeamAdminAccess: vi.fn(),
  requireMemberPermission: vi.fn(),
  resolveOrganizationPermissions: vi.fn(),
  verifyAdminApiKey: vi.fn(),
  getNeonDb: vi.fn(),
  assertOrganizationIpAllowList: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', async () => ({
  ...(await vi.importActual<RlsDbModule>('@/lib/server/rls-db')),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/server/neon-db', async () => ({
  ...(await vi.importActual<NeonDbModule>('@/lib/server/neon-db')),
  getNeonDb: mocks.getNeonDb,
}));
vi.mock('@/lib/services/active-workspace-service', async () => ({
  ...(await vi.importActual<ActiveWorkspaceServiceModule>(
    '@/lib/services/active-workspace-service',
  )),

  resolveActiveOrganizationId: mocks.resolveActiveOrganizationId,
}));
vi.mock('@/lib/services/organization-permission-service', async () => ({
  ...(await vi.importActual<OrganizationPermissionServiceModule>(
    '@/lib/services/organization-permission-service',
  )),

  requireMemberPermission: mocks.requireMemberPermission,
  resolveOrganizationPermissions: mocks.resolveOrganizationPermissions,
}));
vi.mock('@/lib/services/org-entitlements', async () => ({
  ...(await vi.importActual<OrgEntitlementsModule>('@/lib/services/org-entitlements')),

  getOrganizationEntitlements: vi.fn(),
  getSharedProjectLimitErrorMessage: vi.fn(),
  isOrgResourceLimitError: vi.fn(),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: mocks.requireTeamAdminAccess,
  getTeamAdminAccess: mocks.getTeamAdminAccess,
}));
vi.mock('@/lib/ip-allow-list-gate', async () => ({
  ...(await vi.importActual<IpAllowListGateModule>('@/lib/ip-allow-list-gate')),

  assertOrganizationIpAllowList: mocks.assertOrganizationIpAllowList,
}));
vi.mock('@/lib/csrf', async () => ({
  ...(await vi.importActual<CsrfModule>('@/lib/csrf')),
  requireCsrfToken: vi.fn(),
}));
vi.mock('@/lib/server/admin-api-keys', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  verifyAdminApiKey: mocks.verifyAdminApiKey,
}));

import { createError } from '@/lib/errors';
import * as compliance from '../compliance-caller';
import { resolveWorkspaceApiCaller } from '../service-principals/caller';
import { WORKSPACE_ROUTE_ACCESS } from '../service-principals/route-access';
type RlsDbModule = typeof import('@/lib/server/rls-db');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type ActiveWorkspaceServiceModule = typeof import('@/lib/services/active-workspace-service');
type OrganizationPermissionServiceModule =
  typeof import('@/lib/services/organization-permission-service');
type OrgEntitlementsModule = typeof import('@/lib/services/org-entitlements');
type IpAllowListGateModule = typeof import('@/lib/ip-allow-list-gate');
type CsrfModule = typeof import('@/lib/csrf');

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const USER = 'interactive-user';
const KEY = `agiadm_AbCdEf12_${'x'.repeat(43)}`;
const db = { query: mocks.query };
const keyDb = { query: vi.fn() };
const permissions = new Set<OrganizationPermission>(['audit.read']);
const auditRoute = '/api/settings/organization/audit';
const auditDenied = 'Your workspace role does not allow reading the audit trail.';

function request(selector?: string, token?: string): NextRequest {
  return new Request(`https://app.test${auditRoute}`, {
    headers: {
      ...(selector === undefined ? {} : { [MANAGED_CLOUD_ORGANIZATION_HEADER]: selector }),
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
      Cookie: 'session=interactive-session-fixture',
    },
  }) as NextRequest;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  mocks.getUserScopedDb.mockResolvedValue({ db, userId: USER, organizationId: ORG_B });
  mocks.resolveActiveOrganizationId.mockResolvedValue(ORG_A);
  mocks.query.mockResolvedValue([{ organization_id: ORG_B, role: 'admin' }]);
  mocks.requireTeamAdminAccess.mockResolvedValue(undefined);
  mocks.requireMemberPermission.mockResolvedValue(permissions);
  mocks.getNeonDb.mockReturnValue(keyDb);
  mocks.getTeamAdminAccess.mockResolvedValue({ canManageTeam: true });
  mocks.assertOrganizationIpAllowList.mockResolvedValue(undefined);
  mocks.verifyAdminApiKey.mockResolvedValue({
    kind: 'service_principal',
    principalId: 'principal-1',
    keyId: 'key-1',
    organizationId: ORG_A,
    name: 'fixture principal',
    scopes: permissions,
  });
});

// Scoped auth is a seam: these fixtures do not execute selector parsing, SQL/RLS, or HTTP serialization.
describe.each([
  {
    name: 'workspace',
    resolve: (req: NextRequest) => resolveWorkspaceApiCaller(req, auditRoute, 'GET'),
  },
  {
    name: 'compliance',
    resolve: (req: NextRequest) =>
      compliance.resolveComplianceCaller(req, 'audit.read', auditDenied),
  },
])('$name interactive caller workspace binding', ({ resolve }) => {
  it.each([ORG_B, undefined])(
    'retains captured B scope with selector %s despite saved A',
    async (selector) => {
      const req = request(selector);
      const caller = await resolve(req);
      expect(mocks.getUserScopedDb).toHaveBeenCalledExactlyOnceWith(req);
      expect(mocks.resolveActiveOrganizationId).not.toHaveBeenCalled();
      expect(mocks.query).toHaveBeenCalledExactlyOnceWith(
        expect.stringMatching(
          /where organization_id = \$1 and user_id = \$2\s+and status = 'active'/u,
        ),
        [ORG_B, USER],
      );
      expect(mocks.requireTeamAdminAccess).toHaveBeenCalledExactlyOnceWith(db, USER, ORG_B);
      expect(mocks.requireMemberPermission).toHaveBeenCalledExactlyOnceWith(
        ORG_B,
        USER,
        'audit.read',
        auditDenied,
      );
      expect(caller).toEqual({
        kind: 'member',
        db,
        actorUserId: USER,
        organizationId: ORG_B,
        role: 'admin',
        keyId: null,
        servicePrincipalId: null,
        permissions,
      });
      expect(caller.db).toBe(db);
      expect(caller.permissions).toBe(permissions);
      expect(mocks.getNeonDb).not.toHaveBeenCalled();
    },
  );

  it('refuses captured Personal scope before membership queries or authorization gates', async () => {
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: USER, organizationId: null });
    await expect(
      resolve(request(MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE)),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.resolveActiveOrganizationId).not.toHaveBeenCalled();
    expect(mocks.requireTeamAdminAccess).not.toHaveBeenCalled();
    expect(mocks.requireMemberPermission).not.toHaveBeenCalled();
    expect(mocks.getNeonDb).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'absent or inactive membership filtered out by SQL', rows: [] },
    { name: 'mismatched organization row', rows: [{ organization_id: ORG_A, role: 'owner' }] },
  ])('refuses $name without authorization side effects', async ({ rows }) => {
    mocks.query.mockResolvedValue(rows);
    await expect(resolve(request(ORG_B))).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.query).toHaveBeenCalledWith(expect.any(String), [ORG_B, USER]);
    expect(mocks.resolveActiveOrganizationId).not.toHaveBeenCalled();
    expect(mocks.requireTeamAdminAccess).not.toHaveBeenCalled();
    expect(mocks.requireMemberPermission).not.toHaveBeenCalled();
  });

  it('propagates authentication failure before any membership or gate work', async () => {
    const error = createError.unauthorized('No interactive session');
    mocks.getUserScopedDb.mockRejectedValue(error);
    await expect(resolve(request())).rejects.toBe(error);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.requireTeamAdminAccess).not.toHaveBeenCalled();
    expect(mocks.requireMemberPermission).not.toHaveBeenCalled();
  });

  it('propagates membership DB failure without saved-workspace fallback', async () => {
    const error = new Error('membership database unavailable');
    mocks.query.mockRejectedValue(error);
    await expect(resolve(request())).rejects.toBe(error);
    expect(mocks.resolveActiveOrganizationId).not.toHaveBeenCalled();
    expect(mocks.requireTeamAdminAccess).not.toHaveBeenCalled();
    expect(mocks.requireMemberPermission).not.toHaveBeenCalled();
  });

  it('refuses B entitlement denial before evaluating permissions', async () => {
    const error = createError.forbidden('B has no team entitlement');
    mocks.requireTeamAdminAccess.mockRejectedValue(error);
    await expect(resolve(request(ORG_B))).rejects.toBe(error);
    expect(mocks.requireTeamAdminAccess).toHaveBeenCalledExactlyOnceWith(db, USER, ORG_B);
    expect(mocks.requireMemberPermission).not.toHaveBeenCalled();
  });

  it('propagates B permission denial instead of admitting saved A', async () => {
    const error = createError.forbidden(auditDenied);
    mocks.requireMemberPermission.mockRejectedValue(error);
    await expect(resolve(request(ORG_B))).rejects.toBe(error);
    expect(mocks.requireMemberPermission).toHaveBeenCalledExactlyOnceWith(
      ORG_B,
      USER,
      'audit.read',
      auditDenied,
    );
    expect(mocks.resolveActiveOrganizationId).not.toHaveBeenCalled();
  });
});

describe('workspace caller route and key boundaries', () => {
  it.each(WORKSPACE_ROUTE_ACCESS)('uses declared permission for $method $route', async (access) => {
    await resolveWorkspaceApiCaller(request(ORG_B), access.route, access.method);
    expect(mocks.requireMemberPermission).toHaveBeenCalledExactlyOnceWith(
      ORG_B,
      USER,
      access.permission,
      access.deniedMessage,
    );
  });

  it('refuses an undeclared route before either authentication branch', async () => {
    await expect(
      resolveWorkspaceApiCaller(request(ORG_B, KEY), '/api/undeclared', 'GET'),
    ).rejects.toThrow('has no workspace route access declaration');
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
    expect(mocks.verifyAdminApiKey).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('refuses keys on members-only routes before verifying or using a cookie', async () => {
    await expect(
      resolveWorkspaceApiCaller(
        request(ORG_B, KEY),
        '/api/settings/organization/service-principals',
        'PATCH',
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.verifyAdminApiKey).not.toHaveBeenCalled();
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
    expect(mocks.getNeonDb).not.toHaveBeenCalled();
  });

  it.each(WORKSPACE_ROUTE_ACCESS.filter((access) => access.servicePrincipals === 'allowed'))(
    'delegates the exact request and permission for $method $route',
    async (access) => {
      const delegated = {} as compliance.ComplianceCaller;
      const spy = vi.spyOn(compliance, 'resolveComplianceCaller').mockResolvedValue(delegated);
      const req = request(ORG_B, KEY);
      expect(await resolveWorkspaceApiCaller(req, access.route, access.method)).toBe(delegated);
      expect(spy).toHaveBeenCalledExactlyOnceWith(req, access.permission, access.deniedMessage);
      expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
      expect(mocks.query).not.toHaveBeenCalled();
    },
  );
});

describe('compliance key scope is independent of interactive selection', () => {
  it.each([ORG_B, MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE])(
    'keeps verified key organization A with selector %s',
    async (selector) => {
      const req = request(selector, KEY);
      const caller = await compliance.resolveComplianceCaller(req, 'audit.read', auditDenied);
      expect(caller).toEqual({
        kind: 'service_principal',
        db: keyDb,
        actorUserId: 'service_principal:principal-1',
        organizationId: ORG_A,
        role: 'service_principal',
        keyId: 'key-1',
        servicePrincipalId: 'principal-1',
        permissions,
      });
      expect(mocks.verifyAdminApiKey).toHaveBeenCalledExactlyOnceWith(keyDb, KEY);
      expect(mocks.getTeamAdminAccess).toHaveBeenCalledExactlyOnceWith(keyDb, '', ORG_A);
      expect(mocks.assertOrganizationIpAllowList).toHaveBeenCalledExactlyOnceWith(
        ORG_A,
        'service_principal:principal-1',
        req,
      );
      expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
      expect(mocks.resolveActiveOrganizationId).not.toHaveBeenCalled();
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.requireMemberPermission).not.toHaveBeenCalled();
    },
  );

  it.each(['invalid-bearer', KEY])(
    'never falls back to cookies for denied bearer %s',
    async (token) => {
      mocks.verifyAdminApiKey.mockResolvedValue(null);
      await expect(
        compliance.resolveComplianceCaller(request(ORG_B, token), 'audit.read', auditDenied),
      ).rejects.toMatchObject({ statusCode: 401 });
      expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.getTeamAdminAccess).not.toHaveBeenCalled();
      expect(mocks.requireMemberPermission).not.toHaveBeenCalled();
    },
  );
});

type ImportedModule0 = typeof import('@/lib/server/admin-api-keys');
