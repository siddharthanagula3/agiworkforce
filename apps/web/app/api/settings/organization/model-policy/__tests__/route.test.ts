import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  mockQuery,
  mockPrivilegedQuery,
  mockGetUserScopedDb,
  mockRequireTeamAdminAccess,
  mockRecordAuditEvent,
  mockResolveSavedOrganization,
  mockResolveSavedMembership,
  mockResolvePermissions,
  mockRequirePermission,
  mockRateLimit,
  mockCsrf,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockPrivilegedQuery: vi.fn(),
  mockGetUserScopedDb: vi.fn(),
  mockRequireTeamAdminAccess: vi.fn(),
  mockRecordAuditEvent: vi.fn(),
  mockResolveSavedOrganization: vi.fn(),
  mockResolveSavedMembership: vi.fn(),
  mockResolvePermissions: vi.fn(),
  mockRequirePermission: vi.fn(),
  mockRateLimit: vi.fn(),
  mockCsrf: vi.fn(),
}));

vi.mock('@/lib/error-handler', () => ({
  withErrorHandler:
    (handler: (request: Request) => Promise<Response>) => async (request: Request) => {
      try {
        return await handler(request);
      } catch (error) {
        const failure = error as { statusCode?: number; message: string };
        return Response.json({ error: failure.message }, { status: failure.statusCode ?? 500 });
      }
    },
}));
vi.mock('@/lib/cors', () => ({ handleCorsPreflightRequest: vi.fn(() => null) }));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: mockResolveSavedOrganization,
}));
vi.mock('@/lib/services/org-entitlements', () => ({
  getOrganizationEntitlements: vi.fn(),
  getSharedProjectLimitErrorMessage: vi.fn(),
  isOrgResourceLimitError: vi.fn(),
}));
vi.mock('@/lib/services/org-sharing-service', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  resolveOrgMembership: mockResolveSavedMembership,
}));
vi.mock('@/lib/services/organization-permission-service', () => ({
  resolveOrganizationPermissions: mockResolvePermissions,
  requireMemberPermission: mockRequirePermission,
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockCsrf }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mockPrivilegedQuery(...args) }),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mockRecordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: mockRequireTeamAdminAccess,
}));

import { listCanonicalModels } from '@agiworkforce/types';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import { createError } from '@/lib/errors';
import { permissionsForRole } from '@/lib/services/__tests__/organization-permission-service-mock';
import { GET, PUT } from '../route';
import type { ModelPolicyResponse } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const SAVED_ORG = '22222222-2222-4222-8222-222222222222';
const USER = 'user-1';
type Role = 'owner' | 'admin' | 'member' | 'viewer';
const policies = new Map<string, Record<string, unknown>>();
const memberships = new Map<string, { organization_id: string; role: Role }>();
const roles = new Map<string, Role>();
const deniedPlans = new Set<string>();
const scopedDb = { query: (...args: unknown[]) => mockQuery(...args) };

// Taken from the catalog at run time. Writing a literal id here would violate
// the repo rule that model ids live only in the registry, and would rot.
const SAMPLE = listCanonicalModels()[0]!;

function policyRow(over: Record<string, unknown> = {}) {
  return {
    organization_id: ORG,
    allowed_providers: [],
    blocked_providers: [],
    allowed_models: [],
    blocked_models: [],
    updated_by_user_id: 'user-1',
    updated_at: '2026-08-23T00:00:00.000Z',
    ...over,
  };
}

function bind({
  role = 'admin' as 'owner' | 'admin' | 'member' | 'viewer',
  existing = null as Record<string, unknown> | null,
  written = policyRow(),
} = {}) {
  roles.set(ORG, role);
  memberships.set(ORG, { organization_id: ORG, role });
  if (existing) policies.set(ORG, existing);
  else policies.delete(ORG);
  mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
    if (/from public\.user_settings/i.test(sql)) {
      expect(params).toEqual([USER]);
      return [{ organization_id: SAVED_ORG }];
    }
    if (/from public\.organization_members/i.test(sql)) {
      expect(sql).toMatch(/organization_id = \$1 and user_id = \$2/);
      expect(sql).toMatch(/status = 'active'/);
      expect(params[1]).toBe(USER);
      const member = memberships.get(String(params[0]));
      return member ? [member] : [];
    }
    if (/from public\.organization_model_policies/i.test(sql)) {
      expect(params).toHaveLength(1);
      const row = policies.get(String(params[0]));
      return row ? [row] : [];
    }
    throw new Error(`Unexpected scoped query: ${sql}`);
  });
  mockPrivilegedQuery.mockImplementation(async (sql: string, params: unknown[]) => {
    expect(sql).toMatch(/insert into public\.organization_model_policies/i);
    expect(params).toHaveLength(6);
    const row = policyRow({
      organization_id: params[0],
      allowed_providers: params[1],
      blocked_providers: params[2],
      allowed_models: params[3],
      blocked_models: params[4],
      updated_by_user_id: params[5],
      updated_at: written.updated_at,
    });
    policies.set(String(params[0]), row);
    return [row];
  });
}

function req(method: string, body?: unknown, selector?: string): Request {
  const headers = new Headers();
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (selector !== undefined) headers.set(MANAGED_CLOUD_ORGANIZATION_HEADER, selector);
  return new Request('https://app.test/api/settings/organization/model-policy', {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const EMPTY = {
  allowedProviders: [],
  blockedProviders: [],
  allowedModels: [],
  blockedModels: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  policies.clear();
  memberships.clear();
  roles.clear();
  deniedPlans.clear();
  roles.set(SAVED_ORG, 'owner');
  memberships.set(SAVED_ORG, { organization_id: SAVED_ORG, role: 'owner' });
  policies.set(
    SAVED_ORG,
    policyRow({
      organization_id: SAVED_ORG,
      blocked_providers: [String(SAMPLE.provider)],
    }),
  );
  mockGetUserScopedDb.mockResolvedValue({ db: scopedDb, userId: USER, organizationId: ORG });
  mockResolveSavedOrganization.mockResolvedValue(SAVED_ORG);
  mockResolveSavedMembership.mockResolvedValue({ organizationId: SAVED_ORG, role: 'owner' });
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockResolvedValue(null);
  mockRecordAuditEvent.mockResolvedValue(undefined);
  mockRequireTeamAdminAccess.mockImplementation(async (db, userId, organizationId) => {
    expect(db).toBe(scopedDb);
    expect(userId).toBe(USER);
    if (deniedPlans.has(organizationId)) throw createError.forbidden('Plan does not permit this');
    return { canManageTeam: true };
  });
  mockResolvePermissions.mockImplementation(async (organizationId, userId) => {
    expect(userId).toBe(USER);
    return permissionsForRole(roles.get(organizationId) ?? null);
  });
  mockRequirePermission.mockImplementation(async (organizationId, userId, permission, message) => {
    const permissions = await mockResolvePermissions(organizationId, userId);
    if (!permissions.has(permission)) throw createError.forbidden(message);
    return permissions;
  });
  bind();
});

describe('GET /api/settings/organization/model-policy', () => {
  it('serves a plain member, who needs it to know why a model is unavailable', async () => {
    // Withholding this produces a picker that silently omits models with no
    // reason given, which reads as a broken product rather than as governance.
    bind({ role: 'member' });
    const res = await GET(req('GET') as never);

    expect(res.status).toBe(200);
    const body = (await res.json()) as ModelPolicyResponse;
    expect(body.canManagePolicy).toBe(false);
    expect(body.organizationId).toBe(ORG);
    expect(body.currentUserRole).toBe('member');
    expect(mockRequireTeamAdminAccess).toHaveBeenCalledWith(scopedDb, USER, ORG);
    expectNoSavedFallback();
  });

  it('tells an admin they may change it', async () => {
    bind({ role: 'admin' });
    const body = (await (await GET(req('GET') as never)).json()) as ModelPolicyResponse;
    expect(body.canManagePolicy).toBe(true);
  });

  it('distinguishes no policy row from an empty policy', async () => {
    bind({ existing: null });
    const body = (await (await GET(req('GET') as never)).json()) as ModelPolicyResponse;
    expect(body.configured).toBe(false);

    bind({ existing: policyRow() });
    const withRow = (await (await GET(req('GET') as never)).json()) as ModelPolicyResponse;
    expect(withRow.configured).toBe(true);
  });

  it('serves the catalog so no model id has to be typed by hand', async () => {
    bind();
    const body = (await (await GET(req('GET') as never)).json()) as ModelPolicyResponse;

    expect(body.catalog.models.length).toBeGreaterThan(0);
    expect(body.catalog.providers.length).toBeGreaterThan(0);
    expect(body.catalog.models.some((m) => m.id === SAMPLE.id)).toBe(true);
  });
});

describe('PUT /api/settings/organization/model-policy', () => {
  it('refuses a plain member', async () => {
    bind({ role: 'member' });
    expect((await PUT(req('PUT', EMPTY) as never)).status).toBe(403);
  });

  it('refuses a viewer', async () => {
    bind({ role: 'viewer' });
    expect((await PUT(req('PUT', EMPTY) as never)).status).toBe(403);
  });

  it('saves a block an admin made', async () => {
    bind({
      role: 'admin',
      written: policyRow({ blocked_models: [SAMPLE.id.toLowerCase()] }),
    });
    const res = await PUT(req('PUT', { ...EMPTY, blockedModels: [SAMPLE.id] }) as never);

    expect(res.status).toBe(200);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'admin_policy_changed',
        detail: expect.objectContaining({ resourceType: 'organization_model_policy' }),
      }),
    );
  });

  it('refuses a model that is both approved and blocked', async () => {
    bind({ role: 'admin' });
    const res = await PUT(
      req('PUT', { ...EMPTY, allowedModels: [SAMPLE.id], blockedModels: [SAMPLE.id] }) as never,
    );

    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/both approved and blocked/i);
  });

  it('refuses a provider that is both approved and blocked', async () => {
    bind({ role: 'admin' });
    const provider = String(SAMPLE.provider);
    const res = await PUT(
      req('PUT', {
        ...EMPTY,
        allowedProviders: [provider],
        blockedProviders: [provider],
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('refuses a model id the catalog does not know', async () => {
    // A rule naming an unknown id governs nothing, so accepting it would leave
    // an administrator believing they had restricted something.
    bind({ role: 'admin' });
    const res = await PUT(
      req('PUT', { ...EMPTY, blockedModels: ['definitely-not-a-catalog-model'] }) as never,
    );

    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/not in the catalog/i);
  });

  it('refuses a provider the catalog does not know', async () => {
    bind({ role: 'admin' });
    const res = await PUT(
      req('PUT', { ...EMPTY, blockedProviders: ['not-a-real-provider'] }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('rejects a list beyond the table ceiling instead of failing in the database', async () => {
    bind({ role: 'admin' });
    const tooMany = Array.from({ length: 513 }, (_, i) => `model-${i}`);
    const res = await PUT(req('PUT', { ...EMPTY, blockedModels: tooMany }) as never);
    expect(res.status).toBe(400);
  });

  it('writes the whole policy rather than a partial patch', async () => {
    bind({ role: 'admin' });
    await PUT(req('PUT', { ...EMPTY, blockedModels: [SAMPLE.id] }) as never);

    const insert = mockPrivilegedQuery.mock.calls.find((call) =>
      /insert into public\.organization_model_policies/i.test(String(call[0])),
    );
    const params = insert?.[1] as unknown[];
    expect(params).toHaveLength(6);
    expect(params[0]).toBe(ORG);
  });
});

function expectNoSavedFallback() {
  expect(mockResolveSavedOrganization).not.toHaveBeenCalled();
  expect(mockResolveSavedMembership).not.toHaveBeenCalled();
  expect(mockQuery.mock.calls.some(([sql]) => /user_settings/i.test(String(sql)))).toBe(false);
}

function expectNoPolicyEffects() {
  expect(
    mockQuery.mock.calls.some(([sql]) => /organization_model_policies/i.test(String(sql))),
  ).toBe(false);
  expect(mockPrivilegedQuery).not.toHaveBeenCalled();
  expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  expectNoSavedFallback();
}

describe('captured model-policy workspace boundary', () => {
  it.each([ORG, undefined])(
    'reads captured B with selector %s despite saved A',
    async (selector) => {
      bind({ existing: policyRow({ blocked_models: [SAMPLE.id.toLowerCase()] }) });
      const savedBefore = structuredClone(policies.get(SAVED_ORG));
      const response = await GET(req('GET', undefined, selector) as never);
      const body = (await response.json()) as ModelPolicyResponse;

      expect(response.status).toBe(200);
      expect(body.organizationId).toBe(ORG);
      expect(body.policy.blockedModels).toEqual([SAMPLE.id.toLowerCase()]);
      expect(body.policy.blockedProviders).toEqual([]);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('organization_members'), [
        ORG,
        USER,
      ]);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('organization_model_policies'),
        [ORG],
      );
      expect(mockRequireTeamAdminAccess).toHaveBeenCalledWith(scopedDb, USER, ORG);
      expect(mockResolvePermissions).toHaveBeenCalledWith(ORG, USER);
      expect(mockPrivilegedQuery).not.toHaveBeenCalled();
      expect(mockRecordAuditEvent).not.toHaveBeenCalled();
      expect(policies.get(SAVED_ORG)).toEqual(savedBefore);
      expectNoSavedFallback();
    },
  );

  it.each([ORG, undefined])(
    'writes and audits only captured B with selector %s',
    async (selector) => {
      bind({ existing: policyRow() });
      const savedBefore = structuredClone(policies.get(SAVED_ORG));
      const request = req('PUT', { ...EMPTY, blockedModels: [SAMPLE.id] }, selector);
      const response = await PUT(request as never);
      const body = (await response.json()) as ModelPolicyResponse;

      expect(response.status).toBe(200);
      expect(body).toEqual({
        organizationId: ORG,
        configured: true,
        canManagePolicy: true,
        currentUserRole: 'admin',
        policy: {
          ...EMPTY,
          blockedModels: [SAMPLE.id.toLowerCase()],
          updatedAt: '2026-08-23T00:00:00.000Z',
        },
        catalog: expect.objectContaining({
          models: expect.arrayContaining([expect.objectContaining({ id: SAMPLE.id })]),
          providers: expect.arrayContaining([String(SAMPLE.provider)]),
        }),
      });
      expect(mockPrivilegedQuery).toHaveBeenCalledTimes(1);
      expect(mockPrivilegedQuery).toHaveBeenCalledWith(
        expect.stringContaining('insert into public.organization_model_policies'),
        [ORG, [], [], [], [SAMPLE.id.toLowerCase()], USER],
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('organization_model_policies'),
        [ORG],
      );
      expect(mockRequirePermission).toHaveBeenCalledWith(
        ORG,
        USER,
        'policy.manage',
        expect.any(String),
      );
      expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
      expect(mockRecordAuditEvent).toHaveBeenCalledWith({
        userId: USER,
        eventType: 'admin_policy_changed',
        organizationId: ORG,
        request,
        outcome: 'success',
        severity: 'warning',
        detail: {
          resourceType: 'organization_model_policy',
          resourceId: ORG,
          role: 'admin',
          status: 'updated',
          changedKeys: ['blockedModels'],
        },
      });
      expect(policies.get(ORG)).toEqual(policyRow({ blocked_models: [SAMPLE.id.toLowerCase()] }));
      expect(policies.get(SAVED_ORG)).toEqual(savedBefore);
      expect(mockQuery.mock.calls.every(([, params]) => params[0] === ORG)).toBe(true);
      expectNoSavedFallback();
    },
  );

  describe.each(['GET', 'PUT'] as const)('%s refusal boundaries', (method) => {
    const invoke = (selector?: string) => {
      const request = req(method, method === 'PUT' ? EMPTY : undefined, selector);
      return method === 'GET' ? GET(request as never) : PUT(request as never);
    };

    it.each([MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE, undefined])(
      'refuses captured Personal with selector %s without saved fallback',
      async (selector) => {
        mockGetUserScopedDb.mockResolvedValue({ db: scopedDb, userId: USER, organizationId: null });
        expect((await invoke(selector)).status).toBe(403);
        expect(mockQuery).not.toHaveBeenCalled();
        expect(mockRequireTeamAdminAccess).not.toHaveBeenCalled();
        expect(mockResolvePermissions).not.toHaveBeenCalled();
        expectNoPolicyEffects();
      },
    );

    it.each(['missing', 'mismatched'] as const)('refuses %s active B membership', async (kind) => {
      if (kind === 'missing') memberships.delete(ORG);
      else memberships.set(ORG, { organization_id: SAVED_ORG, role: 'owner' });
      expect((await invoke(ORG)).status).toBe(403);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("status = 'active'"), [
        ORG,
        USER,
      ]);
      expect(mockRequireTeamAdminAccess).not.toHaveBeenCalled();
      expect(mockResolvePermissions).not.toHaveBeenCalled();
      expectNoPolicyEffects();
    });

    it('refuses B plan denial despite A entitlement and owner rights', async () => {
      deniedPlans.add(ORG);
      expect((await invoke(ORG)).status).toBe(403);
      expect(mockRequireTeamAdminAccess).toHaveBeenCalledWith(scopedDb, USER, ORG);
      expect(mockResolvePermissions).not.toHaveBeenCalled();
      expectNoPolicyEffects();
    });

    it('returns the rate-limit response before authentication or storage', async () => {
      const limited = Response.json({ error: 'limited' }, { status: 429 });
      mockRateLimit.mockResolvedValue(limited);
      expect(await invoke(ORG)).toBe(limited);
      expect(mockGetUserScopedDb).not.toHaveBeenCalled();
      expectNoPolicyEffects();
    });
  });

  it('refuses B permission denial despite A owner rights', async () => {
    roles.set(ORG, 'viewer');
    expect((await PUT(req('PUT', EMPTY, ORG) as never)).status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledWith(
      ORG,
      USER,
      'policy.manage',
      expect.any(String),
    );
    expectNoPolicyEffects();
  });

  it('returns CSRF refusal before rate limiting or authentication', async () => {
    const refusal = Response.json({ error: 'csrf' }, { status: 403 });
    mockCsrf.mockResolvedValue(refusal);
    expect(await PUT(req('PUT', EMPTY, ORG) as never)).toBe(refusal);
    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(mockGetUserScopedDb).not.toHaveBeenCalled();
    expectNoPolicyEffects();
  });

  it.each([
    { blockedModels: [SAMPLE.id] },
    { ...EMPTY, organizationId: SAVED_ORG },
    { ...EMPTY, blockedModels: ['definitely-not-a-catalog-model'] },
    { ...EMPTY, blockedProviders: ['not-a-real-provider'] },
    { ...EMPTY, allowedModels: [SAMPLE.id], blockedModels: [SAMPLE.id] },
    {
      ...EMPTY,
      allowedProviders: [String(SAMPLE.provider)],
      blockedProviders: [String(SAMPLE.provider)],
    },
  ])('rejects schema, catalog, or coherence violation without policy effects: %j', async (body) => {
    const savedBefore = structuredClone(policies.get(SAVED_ORG));
    expect((await PUT(req('PUT', body, ORG) as never)).status).toBe(400);
    expect(policies.get(SAVED_ORG)).toEqual(savedBefore);
    expectNoPolicyEffects();
  });
});

type ImportedModule0 = typeof import('@/lib/services/org-sharing-service');
