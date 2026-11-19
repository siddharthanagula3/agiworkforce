import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import { centsFromCredits } from '@agiworkforce/types';
import { createError } from '@/lib/errors';
type ErrorHandlerModule = typeof import('@/lib/error-handler');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type ActiveWorkspaceServiceModule = typeof import('@/lib/services/active-workspace-service');
type OrgEntitlementsModule = typeof import('@/lib/services/org-entitlements');
type TeamAdminAccessModule = typeof import('@/app/api/settings/team/team-admin-access');
type OrganizationPermissionServiceModule =
  typeof import('@/lib/services/organization-permission-service');
type CsrfModule = typeof import('@/lib/csrf');
type RateLimitModule = typeof import('@/lib/rate-limit');
type CorsModule = typeof import('@/lib/cors');
type SecurityAuditModule = typeof import('@/lib/security-audit');
type SpendLimitServiceModule = typeof import('@/lib/services/spend-limit-service');

const mocks = vi.hoisted(() => ({
  scoped: vi.fn(),
  query: vi.fn(),
  savedSelection: vi.fn(),
  teamAccess: vi.fn(),
  permission: vi.fn(),
  permissions: vi.fn(),
  csrf: vi.fn(),
  rateLimit: vi.fn(),
  read: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
  audit: vi.fn(),
  privilegedDb: { query: vi.fn() },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/error-handler', async () => ({
  ...(await vi.importActual<ErrorHandlerModule>('@/lib/error-handler')),

  withErrorHandler: (handler: (request: NextRequest) => Promise<Response>) => handler,
}));
vi.mock('@/lib/server/rls-db', async () => ({
  ...(await vi.importActual<RlsDbModule>('@/lib/server/rls-db')),
  getUserScopedDb: mocks.scoped,
}));
vi.mock('@/lib/server/neon-db', async () => ({
  ...(await vi.importActual<NeonDbModule>('@/lib/server/neon-db')),
  getNeonDb: () => mocks.privilegedDb,
}));
vi.mock('@/lib/services/active-workspace-service', async () => ({
  ...(await vi.importActual<ActiveWorkspaceServiceModule>(
    '@/lib/services/active-workspace-service',
  )),

  resolveActiveOrganizationId: mocks.savedSelection,
}));
vi.mock('@/lib/services/org-entitlements', async () => ({
  ...(await vi.importActual<OrgEntitlementsModule>('@/lib/services/org-entitlements')),

  getOrganizationEntitlements: vi.fn(),
  getSharedProjectLimitErrorMessage: vi.fn(),
  isOrgResourceLimitError: vi.fn(),
}));
vi.mock('@/app/api/settings/team/team-admin-access', async () => ({
  ...(await vi.importActual<TeamAdminAccessModule>('@/app/api/settings/team/team-admin-access')),

  requireTeamAdminAccess: mocks.teamAccess,
}));
vi.mock('@/lib/services/organization-permission-service', async () => ({
  ...(await vi.importActual<OrganizationPermissionServiceModule>(
    '@/lib/services/organization-permission-service',
  )),

  requireMemberPermission: mocks.permission,
  resolveOrganizationPermissions: mocks.permissions,
}));
vi.mock('@/lib/csrf', async () => ({
  ...(await vi.importActual<CsrfModule>('@/lib/csrf')),
  requireCsrfToken: mocks.csrf,
}));
vi.mock('@/lib/rate-limit', async () => ({
  ...(await vi.importActual<RateLimitModule>('@/lib/rate-limit')),
  withRateLimit: mocks.rateLimit,
}));
vi.mock('@/lib/cors', async () => ({
  ...(await vi.importActual<CorsModule>('@/lib/cors')),
  handleCorsPreflightRequest: vi.fn(),
}));
vi.mock('@/lib/security-audit', async () => ({
  ...(await vi.importActual<SecurityAuditModule>('@/lib/security-audit')),
  recordAuditEvent: mocks.audit,
}));
vi.mock('@/lib/services/spend-limit-service', async () => ({
  ...(await vi.importActual<SpendLimitServiceModule>('@/lib/services/spend-limit-service')),

  readSpendState: mocks.read,
  upsertSpendLimit: mocks.upsert,
  deleteSpendLimit: mocks.remove,
}));

const { GET, PUT, DELETE } = await import('./route');
const SAVED_A = '11111111-1111-4111-8111-111111111111';
const RESOLVED_B = '22222222-2222-4222-8222-222222222222';
const USER = 'scope-user';
const db = { query: mocks.query };
const input = { monthlyCapCredits: 100, enforcement: 'block', alertThresholdPct: 80 };
const state = {
  configured: true,
  monthlyCapCredits: 100,
  enforcement: 'block',
  alertThresholdPct: 80,
  spentCredits: 20,
  usedPct: 20,
  overCap: false,
  overThreshold: false,
};
const handlers = { GET, PUT, DELETE };
type Method = keyof typeof handlers;

function request(method: Method, selector: string | null = RESOLVED_B, body: unknown = input) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (selector !== null) headers.set(MANAGED_CLOUD_ORGANIZATION_HEADER, selector);
  return new NextRequest('https://example.test/api/settings/organization/spend-limit', {
    method,
    headers,
    ...(method === 'PUT' ? { body: JSON.stringify(body) } : {}),
  });
}

function expectNoStorageOrAudit() {
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.upsert).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
  expect(mocks.privilegedDb.query).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.scoped.mockResolvedValue({ db, userId: USER, organizationId: RESOLVED_B });
  mocks.savedSelection.mockResolvedValue(SAVED_A);
  mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (/user_settings/i.test(sql)) throw new Error('Unexpected saved-selection query');
    expect(sql).toMatch(/from public\.organization_members/i);
    expect(sql).toMatch(/where organization_id = \$1 and user_id = \$2/i);
    expect(sql).toMatch(/and status = 'active'/i);
    expect(params).toEqual([RESOLVED_B, USER]);
    return [{ organization_id: RESOLVED_B, role: 'admin' }];
  });
  mocks.teamAccess.mockResolvedValue({ plan: 'team', canManageTeam: true });
  mocks.permissions.mockResolvedValue(new Set(['policy.manage']));
  mocks.permission.mockResolvedValue(undefined);
  mocks.csrf.mockResolvedValue(null);
  mocks.rateLimit.mockResolvedValue(null);
  mocks.read.mockResolvedValue(state);
  mocks.upsert.mockResolvedValue({
    organizationId: RESOLVED_B,
    monthlyCapCents: Math.ceil(centsFromCredits(input.monthlyCapCredits)),
    enforcement: input.enforcement,
    alertThresholdPct: input.alertThresholdPct,
  });
  mocks.remove.mockResolvedValue(true);
  mocks.privilegedDb.query.mockImplementation(() => {
    throw new Error('Storage is mocked; no privileged query is permitted');
  });
});

// These are forwarding tests: getUserScopedDb is the auth/scope boundary, not a header parser.
describe('spend-limit forwards the first resolved workspace', () => {
  it.each(['GET', 'PUT', 'DELETE'] as const)(
    '%s binds membership, gates and storage to B, not saved A',
    async (method) => {
      const req = request(method);
      const response = await handlers[method](req);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        organizationId: RESOLVED_B,
        canManageLimit: true,
        currentUserRole: 'admin',
        state,
      });
      expect(mocks.scoped).toHaveBeenCalledExactlyOnceWith(req);
      expect(mocks.query).toHaveBeenCalledTimes(1);
      expect(mocks.savedSelection).not.toHaveBeenCalled();
      expect(mocks.teamAccess).toHaveBeenCalledExactlyOnceWith(db, USER, RESOLVED_B);
      expect(mocks.read).toHaveBeenCalledExactlyOnceWith(RESOLVED_B);
      if (method === 'GET') {
        expect(mocks.permissions).toHaveBeenCalledExactlyOnceWith(RESOLVED_B, USER);
        expect(mocks.permission).not.toHaveBeenCalled();
        expect(mocks.upsert).not.toHaveBeenCalled();
        expect(mocks.remove).not.toHaveBeenCalled();
        expect(mocks.audit).not.toHaveBeenCalled();
      } else {
        expect(mocks.permission).toHaveBeenCalledExactlyOnceWith(
          RESOLVED_B,
          USER,
          'policy.manage',
          expect.any(String),
        );
        expect(mocks.audit).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            userId: USER,
            organizationId: RESOLVED_B,
            request: req,
            eventType: 'admin_policy_changed',
            detail: expect.objectContaining({ resourceId: RESOLVED_B }),
          }),
        );
        if (method === 'PUT') {
          expect(mocks.upsert).toHaveBeenCalledExactlyOnceWith(
            mocks.privilegedDb,
            RESOLVED_B,
            {
              monthlyCapCents: Math.ceil(centsFromCredits(input.monthlyCapCredits)),
              enforcement: 'block',
              alertThresholdPct: 80,
            },
            USER,
          );
          expect(mocks.remove).not.toHaveBeenCalled();
        } else {
          expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(mocks.privilegedDb, RESOLVED_B);
          expect(mocks.upsert).not.toHaveBeenCalled();
        }
      }
    },
  );

  it.each(['GET', 'PUT', 'DELETE'] as const)(
    '%s refuses resolved Personal despite saved A',
    async (method) => {
      mocks.scoped.mockResolvedValue({ db, userId: USER, organizationId: null });
      await expect(
        handlers[method](request(method, MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE)),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.savedSelection).not.toHaveBeenCalled();
      expect(mocks.teamAccess).not.toHaveBeenCalled();
      expect(mocks.permission).not.toHaveBeenCalled();
      expect(mocks.permissions).not.toHaveBeenCalled();
      expectNoStorageOrAudit();
    },
  );

  it.each(['GET', 'PUT', 'DELETE'] as const)(
    '%s retains the headerless first resolution when saved selection differs',
    async (method) => {
      await handlers[method](request(method, null));
      expect(mocks.scoped).toHaveBeenCalledTimes(1);
      expect(mocks.savedSelection).not.toHaveBeenCalled();
      expect(mocks.read).toHaveBeenCalledExactlyOnceWith(RESOLVED_B);
    },
  );

  it.each(['GET', 'PUT', 'DELETE'] as const)(
    '%s refuses missing active B membership before gates or storage',
    async (method) => {
      mocks.query.mockResolvedValue([]);
      await expect(handlers[method](request(method))).rejects.toMatchObject({ statusCode: 403 });
      expect(mocks.teamAccess).not.toHaveBeenCalled();
      expect(mocks.permission).not.toHaveBeenCalled();
      expectNoStorageOrAudit();
    },
  );

  it.each(['GET', 'PUT', 'DELETE'] as const)('%s honors B entitlement denial', async (method) => {
    mocks.teamAccess.mockRejectedValue(createError.forbidden('B plan is ineligible'));
    await expect(handlers[method](request(method))).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.teamAccess).toHaveBeenCalledExactlyOnceWith(db, USER, RESOLVED_B);
    expect(mocks.permission).not.toHaveBeenCalled();
    expectNoStorageOrAudit();
  });

  it.each(['PUT', 'DELETE'] as const)('%s cannot borrow policy.manage from A', async (method) => {
    mocks.permission.mockImplementation(async (organizationId: string) => {
      if (organizationId !== SAVED_A) throw createError.forbidden('B denies policy.manage');
    });
    await expect(handlers[method](request(method))).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.savedSelection).not.toHaveBeenCalled();
    expectNoStorageOrAudit();
  });

  it('GET reports B read-only permission without mutating its limit', async () => {
    mocks.permissions.mockResolvedValue(new Set());
    const response = await GET(request('GET'));
    expect(await response.json()).toMatchObject({
      organizationId: RESOLVED_B,
      canManageLimit: false,
    });
    expect(mocks.permissions).toHaveBeenCalledExactlyOnceWith(RESOLVED_B, USER);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(['PUT', 'DELETE'] as const)(
    '%s returns CSRF refusal before resolving scope',
    async (method) => {
      const refusal = NextResponse.json({ error: 'CSRF' }, { status: 403 });
      mocks.csrf.mockResolvedValue(refusal);
      expect(await handlers[method](request(method))).toBe(refusal);
      expect(mocks.scoped).not.toHaveBeenCalled();
      expectNoStorageOrAudit();
    },
  );

  it.each(['GET', 'PUT', 'DELETE'] as const)('%s preserves rate-limit refusal', async (method) => {
    const refusal = NextResponse.json({ error: 'rate limit' }, { status: 429 });
    mocks.rateLimit.mockResolvedValue(refusal);
    expect(await handlers[method](request(method))).toBe(refusal);
    expect(mocks.scoped).not.toHaveBeenCalled();
    expectNoStorageOrAudit();
  });

  it.each([
    { ...input, monthlyCapCredits: 0 },
    { ...input, enforcement: 'unknown' },
    { ...input, alertThresholdPct: 101 },
    { ...input, organizationId: SAVED_A },
  ])('PUT rejects invalid input before storage', async (body) => {
    await expect(PUT(request('PUT', RESOLVED_B, body))).rejects.toMatchObject({ statusCode: 400 });
    expectNoStorageOrAudit();
  });

  it('PUT rejects malformed JSON before storage', async () => {
    const req = new NextRequest('https://example.test/api/settings/organization/spend-limit', {
      method: 'PUT',
      headers: { [MANAGED_CLOUD_ORGANIZATION_HEADER]: RESOLVED_B },
      body: '{',
    });
    await expect(PUT(req)).rejects.toMatchObject({ statusCode: 400 });
    expectNoStorageOrAudit();
  });

  it.each(['GET', 'PUT', 'DELETE'] as const)(
    '%s honors authentication boundary refusal',
    async (method) => {
      const failure = createError.forbidden('Authentication boundary refused');
      mocks.scoped.mockRejectedValue(failure);
      await expect(handlers[method](request(method))).rejects.toBe(failure);
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.savedSelection).not.toHaveBeenCalled();
      expectNoStorageOrAudit();
    },
  );

  it('DELETE does not audit a missing cap as a removal', async () => {
    mocks.remove.mockResolvedValue(false);
    expect((await DELETE(request('DELETE'))).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(mocks.privilegedDb, RESOLVED_B);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
