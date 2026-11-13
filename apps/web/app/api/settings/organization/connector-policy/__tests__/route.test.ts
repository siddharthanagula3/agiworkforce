import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  mockQuery,
  mockScopedQuery,
  mockPrivilegedQuery,
  mockGetUserScopedDb,
  mockRequireTeamAdminAccess,
  mockRecordAuditEvent,
  mockResolveActiveOrganizationId,
  mockResolvePermissions,
  mockRequirePermission,
  mockRateLimit,
  mockCsrf,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockScopedQuery: vi.fn(),
  mockPrivilegedQuery: vi.fn(),
  mockGetUserScopedDb: vi.fn(),
  mockRequireTeamAdminAccess: vi.fn(),
  mockRecordAuditEvent: vi.fn(),
  mockResolveActiveOrganizationId: vi.fn(),
  mockResolvePermissions: vi.fn(),
  mockRequirePermission: vi.fn(),
  mockRateLimit: vi.fn(),
  mockCsrf: vi.fn(),
}));

vi.mock('@/lib/services/organization-permission-service', async () => ({
  ...(await vi.importActual<OrganizationPermissionServiceModule>(
    '@/lib/services/organization-permission-service',
  )),

  resolveOrganizationPermissions: mockResolvePermissions,
  requireMemberPermission: mockRequirePermission,
}));
vi.mock('@/lib/services/active-workspace-service', async () => ({
  ...(await vi.importActual<ActiveWorkspaceServiceModule>(
    '@/lib/services/active-workspace-service',
  )),

  resolveActiveOrganizationId: mockResolveActiveOrganizationId,
}));
vi.mock('@/lib/services/org-entitlements', async () => ({
  ...(await vi.importActual<OrgEntitlementsModule>('@/lib/services/org-entitlements')),

  getOrganizationEntitlements: vi.fn(),
  getSharedProjectLimitErrorMessage: vi.fn(),
  isOrgResourceLimitError: vi.fn(),
}));
vi.mock('@/lib/error-handler', async () => ({
  ...(await vi.importActual<ErrorHandlerModule>('@/lib/error-handler')),

  withErrorHandler:
    (handler: (request: Request) => Promise<Response>) => async (request: Request) => {
      try {
        return await handler(request);
      } catch (error) {
        const failure = error as { statusCode?: number; message?: string };
        return Response.json({ error: failure.message }, { status: failure.statusCode ?? 500 });
      }
    },
}));
vi.mock('@/lib/cors', async () => ({
  ...(await vi.importActual<CorsModule>('@/lib/cors')),
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/rate-limit', async () => ({
  ...(await vi.importActual<RateLimitModule>('@/lib/rate-limit')),
  withRateLimit: mockRateLimit,
}));
vi.mock('@/lib/csrf', async () => ({
  ...(await vi.importActual<CsrfModule>('@/lib/csrf')),
  requireCsrfToken: mockCsrf,
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

  getNeonDb: () => ({ query: mockPrivilegedQuery }),
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
vi.mock('@/lib/user-connector-tools', async () => ({
  ...(await vi.importActual<UserConnectorToolsModule>('@/lib/user-connector-tools')),

  getOperatorMappedConnectorIds: () => new Set(['fixture-alpha', 'fixture-beta']),
}));

import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
  type ConnectorPolicyResponse,
} from '@agiworkforce/cloud-contracts';
import { createError } from '@/lib/errors';

import { GET, PUT } from '../route';
type OrganizationPermissionServiceModule =
  typeof import('@/lib/services/organization-permission-service');
type ActiveWorkspaceServiceModule = typeof import('@/lib/services/active-workspace-service');
type OrgEntitlementsModule = typeof import('@/lib/services/org-entitlements');
type ErrorHandlerModule = typeof import('@/lib/error-handler');
type CorsModule = typeof import('@/lib/cors');
type RateLimitModule = typeof import('@/lib/rate-limit');
type CsrfModule = typeof import('@/lib/csrf');
type LoggerModule = typeof import('@/lib/logger');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type SecurityAuditModule = typeof import('@/lib/security-audit');
type TeamAdminAccessModule = typeof import('@/app/api/settings/team/team-admin-access');
type UserConnectorToolsModule = typeof import('@/lib/user-connector-tools');

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const scopedDb = { query: mockScopedQuery };
const permissionRoles = new Map<string, string>();

function row(over: Record<string, unknown> = {}) {
  return {
    organization_id: ORG,
    allowed_connectors: [],
    blocked_connectors: [],
    allow_custom_connectors: true,
    allowed_plugins: [],
    blocked_plugins: [],
    allowed_mcp_hosts: [],
    allowed_web_domains: [],
    blocked_web_domains: [],
    updated_by_user_id: 'user-1',
    updated_at: '2026-08-23T00:00:00.000Z',
    ...over,
  };
}

function bind({
  role = 'admin' as 'owner' | 'admin' | 'member' | 'viewer',
  existing = null as Record<string, unknown> | null,
  written = row(),
} = {}) {
  permissionRoles.set(ORG, role);
  mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
    const text = String(sql);
    if (/from public\.user_settings/i.test(text)) return [{ organization_id: ORG }];
    if (/from public\.organization_members/i.test(text)) {
      return params[0] === ORG && params[1] === 'user-1' ? [{ organization_id: ORG, role }] : [];
    }
    if (/insert into public\.organization_connector_policies/i.test(text)) {
      return params[0] === ORG ? [written] : [];
    }
    if (/from public\.organization_connector_policies/i.test(text)) {
      return params[0] === ORG && existing ? [existing] : [];
    }
    return [];
  });
}

function req(method: string, body?: unknown): Request {
  return new Request('https://app.test/api/settings/organization/connector-policy', {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  });
}

const BASE = {
  allowedConnectors: [],
  blockedConnectors: [],
  allowCustomConnectors: true,
  allowedPlugins: [],
  blockedPlugins: [],
  allowedMcpHosts: [],
  allowedWebDomains: [],
  blockedWebDomains: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  permissionRoles.clear();
  mockScopedQuery.mockImplementation((...args: unknown[]) => mockQuery(...args));
  mockPrivilegedQuery.mockImplementation((...args: unknown[]) => mockQuery(...args));
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockResolvedValue(null);
  mockRecordAuditEvent.mockResolvedValue(undefined);
  mockResolveActiveOrganizationId.mockResolvedValue(ORG);
  mockRequireTeamAdminAccess.mockResolvedValue({ plan: 'enterprise', canManageTeam: true });
  mockResolvePermissions.mockImplementation(async (organizationId: string, userId: string) => {
    if (userId !== 'user-1') throw new Error('Unexpected user');
    const role = permissionRoles.get(organizationId);
    return new Set(role === 'owner' || role === 'admin' ? ['policy.manage'] : []);
  });
  mockRequirePermission.mockImplementation(
    async (organizationId: string, userId: string, permission: string, message: string) => {
      const permissions = await mockResolvePermissions(organizationId, userId);
      if (!permissions.has(permission)) throw createError.forbidden(message);
      return permissions;
    },
  );
  mockGetUserScopedDb.mockResolvedValue({
    db: scopedDb,
    userId: 'user-1',
    organizationId: ORG,
  });
});

describe('connector policy', () => {
  it('serves a plain member, who needs it to know why an integration is missing', async () => {
    bind({ role: 'member' });
    const res = await GET(req('GET') as never);

    expect(res.status).toBe(200);
    expect(((await res.json()) as ConnectorPolicyResponse).canManagePolicy).toBe(false);
  });

  it('refuses a member trying to change it', async () => {
    bind({ role: 'member' });
    expect((await PUT(req('PUT', BASE) as never)).status).toBe(403);
  });

  it('refuses a viewer trying to change it', async () => {
    bind({ role: 'viewer' });
    expect((await PUT(req('PUT', BASE) as never)).status).toBe(403);
  });

  it('distinguishes no policy row from a permissive one', async () => {
    bind({ existing: null });
    expect(
      ((await (await GET(req('GET') as never)).json()) as ConnectorPolicyResponse).configured,
    ).toBe(false);

    bind({ existing: row() });
    expect(
      ((await (await GET(req('GET') as never)).json()) as ConnectorPolicyResponse).configured,
    ).toBe(true);
  });

  it('derives the catalog from the product rather than a list in the route', async () => {
    bind();
    const body = (await (await GET(req('GET') as never)).json()) as ConnectorPolicyResponse;
    expect(body.catalog).toEqual(['fixture-alpha', 'fixture-beta']);
  });

  it('saves a block and records it', async () => {
    bind({ role: 'admin', written: row({ blocked_connectors: ['fixture-alpha'] }) });
    const res = await PUT(req('PUT', { ...BASE, blockedConnectors: ['fixture-alpha'] }) as never);

    expect(res.status).toBe(200);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ resourceType: 'organization_connector_policy' }),
      }),
    );
  });

  it('refuses a connector that is both approved and blocked', async () => {
    bind({ role: 'admin' });
    const res = await PUT(
      req('PUT', {
        ...BASE,
        allowedConnectors: ['fixture-alpha'],
        blockedConnectors: ['fixture-alpha'],
      }) as never,
    );

    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/both approved and blocked/i);
  });

  it('saves plugin and MCP host allowlists and records which lists changed', async () => {
    bind({
      role: 'admin',
      written: row({ allowed_plugins: ['acme-review'], allowed_mcp_hosts: ['*.corp.example'] }),
    });
    const res = await PUT(
      req('PUT', {
        ...BASE,
        allowedPlugins: ['Acme-Review'],
        allowedMcpHosts: ['*.corp.example'],
      }) as never,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as ConnectorPolicyResponse;
    expect(body.policy.allowedPlugins).toEqual(['acme-review']);
    expect(body.policy.allowedMcpHosts).toEqual(['*.corp.example']);
    const insert = mockQuery.mock.calls.find(([sql]) =>
      /insert into public\.organization_connector_policies/i.test(String(sql)),
    );
    expect(insert?.[1]).toEqual([
      ORG,
      [],
      [],
      true,
      ['acme-review'],
      [],
      ['*.corp.example'],
      [],
      [],
      '[]',
      'user-1',
    ]);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          changedKeys: ['allowedPlugins', 'allowedMcpHosts'],
        }),
      }),
    );
  });

  it('refuses a plugin that is both approved and blocked, and a malformed host', async () => {
    bind({ role: 'admin' });
    const both = await PUT(
      req('PUT', { ...BASE, allowedPlugins: ['acme'], blockedPlugins: ['acme'] }) as never,
    );
    expect(both.status).toBe(400);
    expect(JSON.stringify(await both.json())).toMatch(/plugin cannot be both/i);

    const badHost = await PUT(
      req('PUT', { ...BASE, allowedMcpHosts: ['https://mcp.example.com/path'] }) as never,
    );
    expect(badHost.status).toBe(400);
  });

  it('refuses a body that omits the plugin lists rather than wiping them', async () => {
    bind({ role: 'admin' });
    const res = await PUT(
      req('PUT', {
        allowedConnectors: [],
        blockedConnectors: [],
        allowCustomConnectors: true,
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('rejects a list beyond the table ceiling instead of failing in the database', async () => {
    bind({ role: 'admin' });
    const tooMany = Array.from({ length: 513 }, (_, i) => `c-${i}`);
    expect((await PUT(req('PUT', { ...BASE, blockedConnectors: tooMany }) as never)).status).toBe(
      400,
    );
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

function bindCapturedWorkspace({
  organizationId = OTHER_ORG as string | null,
  membership = { organization_id: OTHER_ORG, role: 'admin' } as {
    organization_id: string;
    role: string;
  } | null,
  planAllowed = true,
} = {}) {
  const policies = new Map<string, Record<string, unknown>>([
    [
      ORG,
      row({
        blocked_connectors: ['saved-a'],
        tool_rules: [{ connectorId: 'saved-a', toolName: 'write_a', level: 'deny' }],
      }),
    ],
    [
      OTHER_ORG,
      row({
        organization_id: OTHER_ORG,
        blocked_connectors: ['captured-b'],
        tool_rules: [{ connectorId: 'captured-b', toolName: 'write_b', level: 'ask' }],
      }),
    ],
  ]);
  const savedPolicy = JSON.stringify(policies.get(ORG));
  permissionRoles.set(ORG, 'owner');
  permissionRoles.set(OTHER_ORG, membership?.role ?? 'member');
  mockGetUserScopedDb.mockResolvedValue({ db: scopedDb, userId: 'user-1', organizationId });
  mockRequireTeamAdminAccess.mockImplementation(
    async (db: unknown, userId: string, targetId: string) => {
      if (db !== scopedDb || userId !== 'user-1') throw new Error('Unexpected scope');
      if (targetId === OTHER_ORG && !planAllowed) {
        throw createError.forbidden('Captured workspace requires an upgrade');
      }
      if (targetId !== ORG && targetId !== OTHER_ORG) throw new Error('Unexpected workspace');
      return { plan: 'enterprise', canManageTeam: true };
    },
  );
  mockScopedQuery.mockImplementation(async (sql: string, params: unknown[]) => {
    if (/from public\.organization_members/i.test(sql)) {
      expect(sql).toMatch(/organization_id = \$1 and user_id = \$2/);
      expect(sql).toMatch(/status = 'active'/);
      if (params[1] !== 'user-1') throw new Error('Unexpected membership user');
      if (params[0] === ORG) return [{ organization_id: ORG, role: 'owner' }];
      if (params[0] === OTHER_ORG) return membership ? [membership] : [];
    }
    if (/from public\.organization_connector_policies/i.test(sql)) {
      expect(sql).toMatch(/where organization_id = \$1/);
      const policy = policies.get(String(params[0]));
      return policy ? [policy] : [];
    }
    throw new Error(`Unexpected scoped query: ${sql}`);
  });
  mockPrivilegedQuery.mockImplementation(async (sql: string, params: unknown[]) => {
    if (!/insert into public\.organization_connector_policies/i.test(sql)) {
      throw new Error(`Unexpected privileged query: ${sql}`);
    }
    const targetId = String(params[0]);
    if (!policies.has(targetId)) throw new Error('Unexpected policy target');
    const written = row({
      organization_id: targetId,
      allowed_connectors: params[1],
      blocked_connectors: params[2],
      allow_custom_connectors: params[3],
      allowed_plugins: params[4],
      blocked_plugins: params[5],
      allowed_mcp_hosts: params[6],
      allowed_web_domains: params[7],
      blocked_web_domains: params[8],
      tool_rules: JSON.parse(String(params[9])),
      updated_by_user_id: params[10],
    });
    policies.set(targetId, written);
    return [written];
  });
  return { policies, savedPolicy };
}

function scopedRequest(method: string, header: string | null, body?: unknown): Request {
  const request = req(method, body);
  if (header !== null) request.headers.set(MANAGED_CLOUD_ORGANIZATION_HEADER, header);
  return request;
}

function expectNoWrite() {
  expect(mockPrivilegedQuery).not.toHaveBeenCalled();
  expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  expect(mockResolveActiveOrganizationId).not.toHaveBeenCalled();
}

function expectCapturedMembership() {
  expect(mockScopedQuery).toHaveBeenCalledWith(
    expect.stringMatching(/from public\.organization_members/i),
    [OTHER_ORG, 'user-1'],
  );
  expect(mockResolveActiveOrganizationId).not.toHaveBeenCalled();
  expect(mockScopedQuery.mock.calls.every(([, params]) => params[0] === OTHER_ORG)).toBe(true);
}

describe('captured connector-policy workspace', () => {
  it.each([OTHER_ORG, null])(
    'reads captured B rather than saved A with header %s',
    async (header) => {
      const { policies, savedPolicy } = bindCapturedWorkspace({
        membership: { organization_id: OTHER_ORG, role: 'member' },
      });
      const response = await GET(scopedRequest('GET', header) as never);
      const body = (await response.json()) as ConnectorPolicyResponse;

      expect(response.status).toBe(200);
      expect(body.organizationId).toBe(OTHER_ORG);
      expect(body.currentUserRole).toBe('member');
      expect(body.canManagePolicy).toBe(false);
      expect(body.policy.blockedConnectors).toEqual(['captured-b']);
      expect(body.policy.toolRules).toEqual(policies.get(OTHER_ORG)?.['tool_rules']);
      expect(mockRequireTeamAdminAccess).toHaveBeenCalledWith(scopedDb, 'user-1', OTHER_ORG);
      expect(mockResolvePermissions).toHaveBeenCalledWith(OTHER_ORG, 'user-1');
      expectCapturedMembership();
      expectNoWrite();
      expect(JSON.stringify(policies.get(ORG))).toBe(savedPolicy);
    },
  );

  it.each([OTHER_ORG, null])(
    'writes only captured B with header %s and preserves omitted rules',
    async (header) => {
      const { policies, savedPolicy } = bindCapturedWorkspace();
      const priorRules = policies.get(OTHER_ORG)?.['tool_rules'];
      const response = await PUT(
        scopedRequest('PUT', header, {
          ...BASE,
          blockedConnectors: [' Fixture-Beta ', 'fixture-beta'],
          allowedPlugins: ['Acme-Review', 'acme-review'],
          allowedMcpHosts: ['*.corp.example', '*.corp.example'],
          allowedWebDomains: ['Example.COM', 'example.com'],
        }) as never,
      );
      const body = (await response.json()) as ConnectorPolicyResponse;

      expect(response.status).toBe(200);
      expect(body.organizationId).toBe(OTHER_ORG);
      expect(body.canManagePolicy).toBe(true);
      expect(body.policy.blockedConnectors).toEqual(['fixture-beta']);
      expect(body.policy.toolRules).toEqual(priorRules);
      expect(mockPrivilegedQuery).toHaveBeenCalledTimes(1);
      expect(mockPrivilegedQuery).toHaveBeenCalledWith(
        expect.stringMatching(/insert into public\.organization_connector_policies/i),
        [
          OTHER_ORG,
          [],
          ['fixture-beta'],
          true,
          ['acme-review'],
          [],
          ['*.corp.example'],
          ['example.com'],
          [],
          JSON.stringify(priorRules),
          'user-1',
        ],
      );
      expect(mockRequireTeamAdminAccess).toHaveBeenCalledWith(scopedDb, 'user-1', OTHER_ORG);
      expect(mockRequirePermission).toHaveBeenCalledWith(
        OTHER_ORG,
        'user-1',
        'policy.manage',
        expect.any(String),
      );
      expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
      expect(mockRecordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          organizationId: OTHER_ORG,
          eventType: 'admin_policy_changed',
          detail: {
            resourceType: 'organization_connector_policy',
            resourceId: OTHER_ORG,
            role: 'admin',
            status: 'updated',
            changedKeys: [
              'blockedConnectors',
              'allowedPlugins',
              'allowedMcpHosts',
              'allowedWebDomains',
            ],
          },
        }),
      );
      expectCapturedMembership();
      expect(JSON.stringify(policies.get(ORG))).toBe(savedPolicy);
    },
  );

  it.each([
    ['GET', MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE],
    ['PUT', MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE],
    ['GET', null],
    ['PUT', null],
  ] as const)('refuses canonical Personal for %s with header %s', async (method, header) => {
    bindCapturedWorkspace({ organizationId: null });
    const response =
      method === 'GET'
        ? await GET(scopedRequest('GET', header) as never)
        : await PUT(scopedRequest('PUT', header, BASE) as never);

    expect(response.status).toBe(403);
    expect(mockScopedQuery).not.toHaveBeenCalled();
    expect(mockRequireTeamAdminAccess).not.toHaveBeenCalled();
    expect(mockResolvePermissions).not.toHaveBeenCalled();
    expectNoWrite();
  });

  it.each([
    ['GET', null],
    ['PUT', null],
    ['GET', { organization_id: ORG, role: 'owner' }],
    ['PUT', { organization_id: ORG, role: 'owner' }],
  ] as const)(
    'refuses %s with absent or mismatched B membership %j',
    async (method, membership) => {
      bindCapturedWorkspace({ membership });
      const response =
        method === 'GET' ? await GET(req('GET') as never) : await PUT(req('PUT', BASE) as never);

      expect(response.status).toBe(403);
      expectCapturedMembership();
      expect(mockScopedQuery).toHaveBeenCalledTimes(1);
      expect(mockRequireTeamAdminAccess).not.toHaveBeenCalled();
      expect(mockResolvePermissions).not.toHaveBeenCalled();
      expectNoWrite();
    },
  );

  it.each(['GET', 'PUT'])('applies B plan denial to %s despite A entitlement', async (method) => {
    bindCapturedWorkspace({ planAllowed: false });
    const response =
      method === 'GET' ? await GET(req('GET') as never) : await PUT(req('PUT', BASE) as never);

    expect(response.status).toBe(403);
    expect(mockRequireTeamAdminAccess).toHaveBeenCalledWith(scopedDb, 'user-1', OTHER_ORG);
    expectCapturedMembership();
    expect(mockScopedQuery).toHaveBeenCalledTimes(1);
    expect(mockResolvePermissions).not.toHaveBeenCalled();
    expectNoWrite();
  });

  it('denies B policy changes despite saved A owner permissions', async () => {
    bindCapturedWorkspace({ membership: { organization_id: OTHER_ORG, role: 'member' } });
    const response = await PUT(req('PUT', BASE) as never);

    expect(response.status).toBe(403);
    expect(mockResolvePermissions).toHaveBeenCalledWith(OTHER_ORG, 'user-1');
    expectCapturedMembership();
    expect(mockScopedQuery).toHaveBeenCalledTimes(1);
    expectNoWrite();
  });

  it.each(['csrf', 'rate'])('stops PUT before scope resolution on %s rejection', async (gate) => {
    bindCapturedWorkspace();
    const status = gate === 'csrf' ? 403 : 429;
    (gate === 'csrf' ? mockCsrf : mockRateLimit).mockResolvedValueOnce(
      Response.json({ error: gate }, { status }),
    );

    expect((await PUT(req('PUT', BASE) as never)).status).toBe(status);
    expect(mockGetUserScopedDb).not.toHaveBeenCalled();
    expect(mockScopedQuery).not.toHaveBeenCalled();
    if (gate === 'csrf') expect(mockRateLimit).not.toHaveBeenCalled();
    expectNoWrite();
  });

  it('stops rate-limited GET before scope resolution', async () => {
    bindCapturedWorkspace();
    mockRateLimit.mockResolvedValueOnce(Response.json({ error: 'rate' }, { status: 429 }));
    expect((await GET(req('GET') as never)).status).toBe(429);
    expect(mockGetUserScopedDb).not.toHaveBeenCalled();
    expect(mockScopedQuery).not.toHaveBeenCalled();
    expectNoWrite();
  });

  it.each([
    { ...BASE, unexpected: true },
    { ...BASE, allowedConnectors: [' Fixture-Alpha '], blockedConnectors: ['fixture-alpha'] },
    { ...BASE, allowedPlugins: ['Acme'], blockedPlugins: ['acme'] },
    { ...BASE, allowedWebDomains: ['Example.COM'], blockedWebDomains: ['example.com'] },
  ])('rejects invalid or overlapping B policy without a write: %j', async (body) => {
    const { policies, savedPolicy } = bindCapturedWorkspace();
    const priorPolicy = JSON.stringify(policies.get(OTHER_ORG));
    expect((await PUT(req('PUT', body) as never)).status).toBe(400);
    expectCapturedMembership();
    expectNoWrite();
    expect(JSON.stringify(policies.get(ORG))).toBe(savedPolicy);
    expect(JSON.stringify(policies.get(OTHER_ORG))).toBe(priorPolicy);
  });

  it('normalizes and deduplicates explicit B tool rules using the last level', async () => {
    const { policies, savedPolicy } = bindCapturedWorkspace();
    const response = await PUT(
      req('PUT', {
        ...BASE,
        toolRules: [
          { connectorId: ' Fixture-Beta ', toolName: ' write_b ', level: 'allow' },
          { connectorId: 'fixture-beta', toolName: 'write_b', level: 'deny' },
        ],
      }) as never,
    );
    const body = (await response.json()) as ConnectorPolicyResponse;

    expect(response.status).toBe(200);
    expect(body.policy.toolRules).toEqual([
      { connectorId: 'fixture-beta', toolName: 'write_b', level: 'deny' },
    ]);
    expect(mockPrivilegedQuery.mock.calls[0]?.[1]?.[9]).toBe(JSON.stringify(body.policy.toolRules));
    expectCapturedMembership();
    expect(JSON.stringify(policies.get(ORG))).toBe(savedPolicy);
  });
});
