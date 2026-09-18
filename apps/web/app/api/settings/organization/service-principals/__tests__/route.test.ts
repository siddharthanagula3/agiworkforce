import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

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

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mockQuery(...args) },
    userId: 'user-1',
  })),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mockQuery(...args) }),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mockRecordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: vi.fn(async () => ({ plan: 'enterprise', canManageTeam: true })),
  getTeamAdminAccess: vi.fn(async () => ({ plan: 'enterprise', canManageTeam: true })),
}));

import { GET, PATCH } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
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

function bind(role: string, over: { principalDisabledAt?: string | null } = {}) {
  permissionRole.value = role;
  mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/from public\.user_settings/i.test(sql)) return [{ organization_id: ORG }];
    if (/from public\.organization_members/i.test(sql)) return [{ organization_id: ORG, role }];
    if (/update public\.organization_service_principals/i.test(sql)) {
      return [
        principalRow({ disabled_at: params[2] === true ? '2026-09-18T00:00:00.000Z' : null }),
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
    if (/from public\.organization_service_principals/i.test(sql)) return [principalRow()];
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
    expect(await response.text()).toContain('identity.read');
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
  });
});
