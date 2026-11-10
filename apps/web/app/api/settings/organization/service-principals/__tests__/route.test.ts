import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';

vi.mock('server-only', () => ({}));

const requestScope = vi.hoisted(() => ({ organizationId: null as string | null }));
const permissionRole = vi.hoisted(() => ({ value: 'owner' as string | null }));
vi.mock('@/lib/services/organization-permission-service', async () =>
  (
    await import('@/lib/services/__tests__/organization-permission-service-mock')
  ).organizationPermissionServiceMock(permissionRole),
);

const { mockQuery, mockRecordAuditEvent } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockRecordAuditEvent: vi.fn(async (_event: unknown) => undefined),
}));

vi.mock('@/lib/rate-limit', async () => ({
  ...(await vi.importActual<RateLimitModule>('@/lib/rate-limit')),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/csrf', async () => ({
  ...(await vi.importActual<CsrfModule>('@/lib/csrf')),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', async () => ({
  ...(await vi.importActual<LoggerModule>('@/lib/logger')),

  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', async () => ({
  ...(await vi.importActual<RlsDbModule>('@/lib/server/rls-db')),

  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mockQuery(...args) },
    userId: 'user-1',
    organizationId: requestScope.organizationId,
  })),
}));
vi.mock('@/lib/server/key-value', async () => ({
  ...(await vi.importActual<KeyValueModule>('@/lib/server/key-value')),
  getKeyValueStore: () => null,
}));
vi.mock('@/lib/server/neon-db', async () => ({
  ...(await vi.importActual<NeonDbModule>('@/lib/server/neon-db')),

  getNeonDb: () => ({ query: (...args: unknown[]) => mockQuery(...args) }),
}));
vi.mock('@/lib/security-audit', async () => ({
  ...(await vi.importActual<SecurityAuditModule>('@/lib/security-audit')),

  recordAuditEvent: mockRecordAuditEvent,
  getClientIp: vi.fn(() => '192.0.2.1'),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: vi.fn(async () => ({ plan: 'enterprise', canManageTeam: true })),
  getTeamAdminAccess: vi.fn(async () => ({ plan: 'enterprise', canManageTeam: true })),
}));

import { GET, PATCH } from '../route';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';
import { requireMemberPermission } from '@/lib/services/organization-permission-service';
import { clearIpAllowListCacheForTests } from '@/lib/services/organization-ip-allow-list-cache';
type RateLimitModule = typeof import('@/lib/rate-limit');
type CsrfModule = typeof import('@/lib/csrf');
type LoggerModule = typeof import('@/lib/logger');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type KeyValueModule = typeof import('@/lib/server/key-value');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type SecurityAuditModule = typeof import('@/lib/security-audit');

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const PRINCIPAL_ID = '33333333-3333-4333-8333-333333333333';
const KEY_ID = '44444444-4444-4444-8444-444444444444';
const KEY_TOKEN = `agiadm_AbCdEf12_${'x'.repeat(43)}`;

function principalRow(over: Record<string, unknown> = {}) {
  return {
    id: PRINCIPAL_ID,
    organization_id: ORG,
    name: 'SIEM',
    description: null,
    max_scopes: ['audit.read', 'identity.read'],
    created_by_user_id: 'user-1',
    created_at: '2026-09-17T00:00:00.000Z',
    disabled_at: null,
    ...over,
  };
}

function bind(
  role: string,
  over: { principalDisabledAt?: string | null; principalOrganizationId?: string } = {},
) {
  const principalOrganizationId = over.principalOrganizationId ?? ORG;
  permissionRole.value = role;
  mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/from public\.user_settings/i.test(sql)) return [{ organization_id: ORG }];
    if (/from public\.organization_members/i.test(sql)) {
      return params[1] === 'user-1' && [ORG, OTHER_ORG].includes(String(params[0]))
        ? [{ organization_id: params[0], role }]
        : [];
    }
    if (/update public\.organization_service_principals/i.test(sql)) {
      if (params[0] !== principalOrganizationId || params[1] !== PRINCIPAL_ID) return [];
      return [
        principalRow({
          organization_id: principalOrganizationId,
          disabled_at: params[2] === true ? '2026-09-18T00:00:00.000Z' : null,
        }),
      ];
    }
    if (/update public\.organization_admin_api_keys/i.test(sql)) {
      return [
        {
          id: KEY_ID,
          organization_id: ORG,
          key_hash: sql.includes('key_hash') ? String(params[0]) : '',
          scopes: ['identity.read'],
          service_principal_id: PRINCIPAL_ID,
          principal_name: 'SIEM',
          principal_max_scopes: ['identity.read'],
          principal_disabled_at: over.principalDisabledAt ?? null,
        },
      ];
    }
    if (/from public\.organization_service_principals/i.test(sql)) {
      return params[0] === principalOrganizationId
        ? [principalRow({ organization_id: principalOrganizationId })]
        : [];
    }
    return [];
  });
}

function get(headers: Record<string, string> = {}): Request {
  return new Request('https://agiworkforce.com/api/settings/organization/service-principals', {
    headers,
  });
}

function patch(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://agiworkforce.com/api/settings/organization/service-principals', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('organization service principals route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearIpAllowListCacheForTests();
    requestScope.organizationId = ORG;
    bind('owner');
  });

  it('serves a signed-in member the workspace principals', async () => {
    const response = await GET(get() as never);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      principals: { id: string }[];
      canManage: boolean;
      reachableRoutes: string[];
    };
    expect(body.principals[0]?.id).toBe(PRINCIPAL_ID);
    expect(body.canManage).toBe(true);
    expect(body.reachableRoutes).toContain('/api/settings/organization/service-principals');
  });

  it('serves a workspace API key a route outside the three compliance endpoints', async () => {
    const response = await GET(get({ authorization: `Bearer ${KEY_TOKEN}` }) as never);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { canManage: boolean; principals: unknown[] };
    expect(body.principals).toHaveLength(1);
    expect(body.canManage).toBe(false);
  });

  it('refuses a workspace API key that is not scoped for the route permission', async () => {
    mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/update public\.organization_admin_api_keys/i.test(sql)) {
        return [
          {
            id: KEY_ID,
            organization_id: ORG,
            key_hash: String(params[0]),
            scopes: ['audit.read'],
            service_principal_id: PRINCIPAL_ID,
            principal_name: 'SIEM',
            principal_max_scopes: ['audit.read'],
            principal_disabled_at: null,
          },
        ];
      }
      return [];
    });

    const response = await GET(get({ authorization: `Bearer ${KEY_TOKEN}` }) as never);
    expect(response.status).toBe(403);
    const refusal = await response.text();
    expect(refusal).toContain('not scoped for admin.identity.view');
    expect(refusal).toContain('It carries admin.audit.view');
  });

  it('refuses a workspace API key on the write, whatever it is scoped for', async () => {
    const response = await PATCH(
      patch(
        { principalId: PRINCIPAL_ID, disabled: true },
        { authorization: `Bearer ${KEY_TOKEN}` },
      ) as never,
    );
    expect(response.status).toBe(403);
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('disables a principal for a member who may manage identity and records it', async () => {
    const response = await PATCH(patch({ principalId: PRINCIPAL_ID, disabled: true }) as never);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { principal: { disabledAt: string | null } };
    expect(body.principal.disabledAt).not.toBeNull();
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'admin_policy_changed',
        detail: expect.objectContaining({ resourceType: 'service_principal' }),
      }),
    );
  });

  it('refuses a member whose role cannot manage identity', async () => {
    bind('member');
    const response = await PATCH(patch({ principalId: PRINCIPAL_ID, disabled: true }) as never);
    expect(response.status).toBe(403);
    expect(principalWrites()).toEqual([]);
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });
});

function principalWrites() {
  return mockQuery.mock.calls.filter(([sql]) =>
    /update public\.organization_service_principals/i.test(String(sql)),
  );
}

function expectCapturedScope(organizationId: string) {
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringMatching(/where organization_id = \$1 and user_id = \$2/),
    [organizationId, 'user-1'],
  );
  expect(mockQuery.mock.calls.some(([sql]) => /public\.user_settings/i.test(String(sql)))).toBe(
    false,
  );
  expect(requireTeamAdminAccess).toHaveBeenCalledWith(expect.anything(), 'user-1', organizationId);
}

describe('service principal route request scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearIpAllowListCacheForTests();
    requestScope.organizationId = OTHER_ORG;
    bind('owner', { principalOrganizationId: OTHER_ORG });
  });

  it('lists captured B rather than saved A without reparsing the request selector', async () => {
    const request = get();
    const response = await GET(request as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      organizationId: OTHER_ORG,
      canManage: true,
      principals: [{ id: PRINCIPAL_ID, organizationId: OTHER_ORG }],
    });
    expect(getUserScopedDb).toHaveBeenCalledExactlyOnceWith(request);
    expectCapturedScope(OTHER_ORG);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringMatching(
        /from public\.organization_service_principals[\s\S]*where organization_id = \$1/,
      ),
      [OTHER_ORG],
    );
    expect(requireMemberPermission).toHaveBeenCalledWith(
      OTHER_ORG,
      'user-1',
      'identity.read',
      expect.any(String),
    );
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('updates only captured B and audits B for its permitted owner despite saved A', async () => {
    const request = patch({ principalId: PRINCIPAL_ID, disabled: true });
    const response = await PATCH(request as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      principal: { id: PRINCIPAL_ID, organizationId: OTHER_ORG, disabledAt: expect.any(String) },
    });
    expectCapturedScope(OTHER_ORG);
    expect(requireMemberPermission).toHaveBeenCalledWith(
      OTHER_ORG,
      'user-1',
      'identity.manage',
      expect.any(String),
    );
    expect(principalWrites()).toEqual([
      [
        expect.stringMatching(/where organization_id = \$1 and id = \$2/),
        [OTHER_ORG, PRINCIPAL_ID, true, 'user-1'],
      ],
    ]);
    expect(mockRecordAuditEvent).toHaveBeenCalledExactlyOnceWith({
      userId: 'user-1',
      organizationId: OTHER_ORG,
      eventType: 'admin_policy_changed',
      request,
      severity: 'warning',
      detail: {
        resourceType: 'service_principal',
        resourceId: PRINCIPAL_ID,
        resourceName: 'SIEM',
        changedKeys: ['disabled'],
      },
    });
  });

  it('refuses Personal before membership, storage, permissions, or audit despite saved A', async () => {
    requestScope.organizationId = null;
    const response = await PATCH(patch({ principalId: PRINCIPAL_ID, disabled: true }) as never);
    expect(response.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(requireTeamAdminAccess).not.toHaveBeenCalled();
    expect(requireMemberPermission).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('returns not found for an A-only principal while scoped to B without writing A', async () => {
    bind('owner');
    const response = await PATCH(patch({ principalId: PRINCIPAL_ID, disabled: true }) as never);
    expect(response.status).toBe(404);
    expectCapturedScope(OTHER_ORG);
    expect(principalWrites()).toEqual([
      [
        expect.stringMatching(/where organization_id = \$1 and id = \$2/),
        [OTHER_ORG, PRINCIPAL_ID, true, 'user-1'],
      ],
    ]);
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses B permission denial before a principal write or audit', async () => {
    bind('member', { principalOrganizationId: OTHER_ORG });
    const response = await PATCH(patch({ principalId: PRINCIPAL_ID, disabled: true }) as never);
    expect(response.status).toBe(403);
    expectCapturedScope(OTHER_ORG);
    expect(requireMemberPermission).toHaveBeenCalledWith(
      OTHER_ORG,
      'user-1',
      'identity.manage',
      expect.any(String),
    );
    expect(principalWrites()).toEqual([]);
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it.each([OTHER_ORG, MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE])(
    'keeps key GET in A and refuses key PATCH despite selector %s',
    async (selector) => {
      bind('owner');
      requestScope.organizationId = selector === OTHER_ORG ? OTHER_ORG : null;
      const headers = {
        authorization: `Bearer ${KEY_TOKEN}`,
        [MANAGED_CLOUD_ORGANIZATION_HEADER]: selector,
      };
      const response = await GET(get(headers) as never);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        organizationId: ORG,
        canManage: false,
        principals: [{ id: PRINCIPAL_ID, organizationId: ORG }],
      });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(
          /from public\.organization_service_principals[\s\S]*where organization_id = \$1/,
        ),
        [ORG],
      );
      const refused = await PATCH(
        patch({ principalId: PRINCIPAL_ID, disabled: true }, headers) as never,
      );
      expect(refused.status).toBe(403);
      expect(getUserScopedDb).not.toHaveBeenCalled();
      expect(requireTeamAdminAccess).not.toHaveBeenCalled();
      expect(requireMemberPermission).not.toHaveBeenCalled();
      expect(principalWrites()).toEqual([]);
      expect(mockRecordAuditEvent).not.toHaveBeenCalled();
    },
  );
});
