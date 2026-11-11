import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const capturedScope = vi.hoisted(() => ({ organizationId: null as string | null }));

const permissionRole = vi.hoisted(() => ({ value: 'owner' as string | null }));
vi.mock('@/lib/services/organization-permission-service', async () =>
  (
    await import('@/lib/services/__tests__/organization-permission-service-mock')
  ).organizationPermissionServiceMock(permissionRole),
);

const { mockQuery, mockRecordAuditEvent, transactions } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockRecordAuditEvent: vi.fn(async (_event: unknown) => undefined),
  transactions: [] as Array<{
    statements: string[];
    outcome: 'open' | 'committed' | 'rolled_back';
  }>,
}));

vi.mock('@/lib/observability/error-capture', async () => ({
  ...(await vi.importActual<ErrorCaptureModule>('@/lib/observability/error-capture')),
  captureServerError: vi.fn(),
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
    organizationId: capturedScope.organizationId,
  })),
}));
vi.mock('@/lib/server/neon-db', async () => ({
  ...(await vi.importActual<NeonDbModule>('@/lib/server/neon-db')),

  getNeonDb: () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const record: { statements: string[]; outcome: 'open' | 'committed' | 'rolled_back' } = {
        statements: [],
        outcome: 'open',
      };
      transactions.push(record);
      try {
        const result = await fn({
          query: (sql: string, params?: unknown[]) => {
            record.statements.push(sql);
            return mockQuery(sql, params);
          },
        });
        record.outcome = 'committed';
        return result;
      } catch (error) {
        record.outcome = 'rolled_back';
        throw error;
      }
    },
  }),
}));
vi.mock('@/lib/security-audit', async () => ({
  ...(await vi.importActual<SecurityAuditModule>('@/lib/security-audit')),

  recordAuditEvent: mockRecordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/app/api/settings/team/team-admin-access', async () => ({
  ...(await vi.importActual<TeamAdminAccessModule>('@/app/api/settings/team/team-admin-access')),

  requireTeamAdminAccess: vi.fn(async () => ({ plan: 'enterprise', canManageTeam: true })),
}));

vi.mock('@/lib/server/request-context-cache', async () => ({
  ...(await vi.importActual<RequestContextCacheModule>('@/lib/server/request-context-cache')),

  getCachedActiveOrganizationId: vi.fn(async () => undefined),
  setCachedActiveOrganizationId: vi.fn(async () => undefined),
}));
vi.mock('@/lib/services/org-entitlements', async () => ({
  ...(await vi.importActual<OrgEntitlementsModule>('@/lib/services/org-entitlements')),

  getOrganizationEntitlements: vi.fn(),
  getSharedProjectLimitErrorMessage: vi.fn(),
  isOrgResourceLimitError: vi.fn(),
}));

process.env['CSRF_SECRET'] = 'admin-key-reveal-step-up-secret-long-enough';

import { MANAGED_CLOUD_ORGANIZATION_HEADER } from '@agiworkforce/cloud-contracts';
import { requireCsrfToken } from '@/lib/csrf';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';
import { requireMemberPermission } from '@/lib/services/organization-permission-service';
import { STEP_UP_TOKEN_HEADER } from '@/lib/server/step-up-auth';
import { createStepUpGrant } from '@/lib/server/step-up/grant-token';
import { DELETE, GET, POST } from '../route';
type ErrorCaptureModule = typeof import('@/lib/observability/error-capture');
type RateLimitModule = typeof import('@/lib/rate-limit');
type CsrfModule = typeof import('@/lib/csrf');
type LoggerModule = typeof import('@/lib/logger');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type SecurityAuditModule = typeof import('@/lib/security-audit');
type TeamAdminAccessModule = typeof import('@/app/api/settings/team/team-admin-access');
type RequestContextCacheModule = typeof import('@/lib/server/request-context-cache');
type OrgEntitlementsModule = typeof import('@/lib/services/org-entitlements');

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '44444444-4444-4444-8444-444444444444';
const KEY_ID = '22222222-2222-4222-8222-222222222222';
const PRINCIPAL_ID = '33333333-3333-4333-8333-333333333333';

function keyRow(over: Record<string, unknown> = {}) {
  return {
    id: KEY_ID,
    organization_id: ORG,
    name: 'SIEM',
    key_prefix: 'agiadm_AbCdEf12',
    scopes: ['audit.read'],
    service_principal_id: PRINCIPAL_ID,
    created_by: 'user-1',
    created_at: '2026-09-17T00:00:00.000Z',
    expires_at: null,
    last_used_at: null,
    revoked_at: null,
    ...over,
  };
}

function principalRow(over: Record<string, unknown> = {}) {
  return {
    id: PRINCIPAL_ID,
    organization_id: ORG,
    name: 'SIEM',
    description: null,
    max_scopes: ['audit.read'],
    created_by_user_id: 'user-1',
    created_at: '2026-09-17T00:00:00.000Z',
    disabled_at: null,
    ...over,
  };
}

interface IdempotencyRecord {
  status: string;
  request_fingerprint: string;
  response_status: number | null;
  response_body: unknown;
}

const idempotency = new Map<string, IdempotencyRecord>();

function bind(
  role: string,
  principal: Record<string, unknown> | null = principalRow(),
  organizationId = ORG,
  membership: Record<string, unknown> | null = { organization_id: organizationId, role },
) {
  permissionRole.value = role;
  mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/from public\.user_settings/i.test(sql)) return [{ organization_id: ORG }];
    if (/from public\.organization_members/i.test(sql)) return membership ? [membership] : [];
    if (/insert into public\.admin_request_idempotency/i.test(sql)) {
      const key = `${params[0]}|${params[1]}|${params[2]}`;
      if (idempotency.has(key)) return [];
      idempotency.set(key, {
        status: 'in_progress',
        request_fingerprint: String(params[3]),
        response_status: null,
        response_body: null,
      });
      return [{ organization_id: organizationId }];
    }
    if (/update public\.admin_request_idempotency/i.test(sql)) {
      const row = idempotency.get(`${params[0]}|${params[1]}|${params[2]}`);
      if (row) {
        row.status = 'completed';
        row.response_status = Number(params[3]);
        row.response_body = JSON.parse(String(params[4]));
      }
      return [];
    }
    if (/from public\.admin_request_idempotency/i.test(sql)) {
      const row = idempotency.get(`${params[0]}|${params[1]}|${params[2]}`);
      return row ? [row] : [];
    }
    if (/insert into public\.organization_service_principals/i.test(sql)) {
      return [principalRow({ organization_id: params[0], name: params[1], max_scopes: params[3] })];
    }
    if (/from public\.organization_service_principals/i.test(sql)) {
      return principal && principal['organization_id'] === params[0] ? [principal] : [];
    }
    if (/insert into public\.organization_admin_api_keys/i.test(sql)) {
      return [
        keyRow({
          organization_id: params[0],
          key_prefix: params[2],
          scopes: params[4],
          service_principal_id: params[5],
        }),
      ];
    }
    if (/update public\.organization_admin_api_keys/i.test(sql)) {
      return params[0] === organizationId
        ? [keyRow({ organization_id: organizationId, revoked_at: '2026-09-17T01:00:00.000Z' })]
        : [];
    }
    if (/from public\.organization_admin_api_keys/i.test(sql)) {
      return params[0] === organizationId ? [keyRow({ organization_id: organizationId })] : [];
    }
    return [];
  });
}

function revealProof(organizationId = ORG): Record<string, string> {
  const { token } = createStepUpGrant({
    userId: 'user-1',
    action: 'api_credential.reveal',
    resourceId: organizationId,
    method: 'second_factor',
  });
  return { [STEP_UP_TOKEN_HEADER]: token };
}

function send(method: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://app.test/api/settings/organization/admin-api-keys', {
    method,
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...(method === 'POST' ? revealProof() : {}),
      ...headers,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Network access is not allowed in admin-key source fixtures');
    }),
  );
  idempotency.clear();
  transactions.length = 0;
  capturedScope.organizationId = ORG;
  vi.mocked(requireCsrfToken).mockResolvedValue(null);
  vi.mocked(withRateLimit).mockResolvedValue(null);
  vi.mocked(requireTeamAdminAccess).mockResolvedValue({
    plan: 'enterprise',
    canManageTeam: true,
    maxMembers: null,
    seatsConsumed: null,
    seatsAvailable: null,
    seatSource: 'unknown',
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/api/settings/organization/admin-api-keys', () => {
  it('lists keys without their hashes, in the namespaced scope vocabulary, for a role with identity.read', async () => {
    bind('admin');

    const res = await GET(new Request('https://app.test/x') as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.canManageKeys).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/key_hash|keyHash/);
    expect(body.keys[0]).toMatchObject({
      keyPrefix: 'agiadm_AbCdEf12',
      scopes: ['admin.audit.view'],
    });
  });

  it('creates a scoped key, returns the secret once and stores only its hash and namespaced scopes', async () => {
    bind('owner');

    const res = await POST(
      send('POST', {
        name: 'SIEM',
        scopes: ['audit.read', 'content.govern'],
        expiresInDays: 90,
      }) as never,
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.key).toMatch(/^agiadm_[A-Za-z0-9]{8}_[A-Za-z0-9_-]{43}$/);
    const insert = mockQuery.mock.calls.find(([sql]) =>
      /insert into public\.organization_admin_api_keys/i.test(String(sql)),
    );
    const params = insert?.[1] as unknown[];
    expect(params[3]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(params)).not.toContain(body.key);
    expect(params[4]).toEqual(['admin.audit.view', 'feature.content.govern']);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'admin_api_key_created', severity: 'critical' }),
    );
    expect(JSON.stringify(mockRecordAuditEvent.mock.calls)).not.toContain(body.key);
  });

  it('refuses a scope the creator does not hold', async () => {
    permissionRole.value = 'owner';
    bind('owner');
    const res = await POST(
      send('POST', { name: 'x', scopes: ['ownership.transfer'], expiresInDays: null }) as never,
    );

    expect(res.status).toBe(403);
    expect(mockQuery.mock.calls.some(([sql]) => /insert into/i.test(String(sql)))).toBe(false);
  });

  it('refuses creation to an admin, who holds identity.read but not identity.manage', async () => {
    bind('admin');

    const res = await POST(
      send('POST', { name: 'x', scopes: ['audit.read'], expiresInDays: null }) as never,
    );

    expect(res.status).toBe(403);
  });

  it('gives every key a service principal of its own rather than the creator identity', async () => {
    bind('owner');

    const res = await POST(
      send('POST', { name: 'SIEM', scopes: ['audit.read'], expiresInDays: null }) as never,
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.servicePrincipal).toMatchObject({
      id: PRINCIPAL_ID,
      maxScopes: ['admin.audit.view'],
    });
    expect(body.record.servicePrincipalId).toBe(PRINCIPAL_ID);
    const insert = mockQuery.mock.calls.find(([sql]) =>
      /insert into public\.organization_service_principals/i.test(String(sql)),
    );
    expect((insert?.[1] as unknown[])[3]).toEqual(['admin.audit.view']);
  });

  it('refuses a scope above the named principal ceiling and mints nothing', async () => {
    bind('owner', principalRow({ max_scopes: ['billing.read'] }));

    const res = await POST(
      send('POST', {
        name: 'SIEM',
        scopes: ['audit.read'],
        expiresInDays: null,
        servicePrincipalId: PRINCIPAL_ID,
      }) as never,
    );

    expect(res.status).toBe(403);
    expect(
      mockQuery.mock.calls.some(([sql]) =>
        /insert into public\.organization_admin_api_keys/i.test(String(sql)),
      ),
    ).toBe(false);
  });

  it('refuses a key for a disabled principal', async () => {
    bind('owner', principalRow({ disabled_at: '2026-09-18T00:00:00.000Z' }));

    const res = await POST(
      send('POST', {
        name: 'SIEM',
        scopes: ['audit.read'],
        expiresInDays: null,
        servicePrincipalId: PRINCIPAL_ID,
      }) as never,
    );

    expect(res.status).toBe(403);
  });

  it('replays the first response when the same Idempotency-Key is retried', async () => {
    bind('owner');
    const body = { name: 'SIEM', scopes: ['audit.read'], expiresInDays: null };
    const headers = { 'Idempotency-Key': 'retry-key-0001' };

    const first = await POST(send('POST', body, headers) as never);
    const firstBody = await first.json();
    const second = await POST(send('POST', body, headers) as never);
    const secondBody = await second.json();

    expect(first.status).toBe(201);
    expect(first.headers.get('Idempotency-Replayed')).toBe('false');
    expect(second.status).toBe(201);
    expect(second.headers.get('Idempotency-Replayed')).toBe('true');
    expect(secondBody.key).toBe(firstBody.key);
    const inserts = mockQuery.mock.calls.filter(([sql]) =>
      /insert into public\.organization_admin_api_keys/i.test(String(sql)),
    );
    expect(inserts).toHaveLength(1);
    const created = mockRecordAuditEvent.mock.calls.filter(
      ([event]) => (event as { eventType?: string }).eventType === 'admin_api_key_created',
    );
    expect(created).toHaveLength(1);
  });

  it('writes the principal, the key and the replay receipt in one transaction', async () => {
    bind('owner');

    const res = await POST(
      send(
        'POST',
        { name: 'SIEM', scopes: ['audit.read'], expiresInDays: null },
        { 'Idempotency-Key': 'retry-key-0001' },
      ) as never,
    );

    expect(res.status).toBe(201);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.outcome).toBe('committed');
    const inside = transactions[0]?.statements.join('\n') ?? '';
    expect(inside).toMatch(/insert into public\.admin_request_idempotency/i);
    expect(inside).toMatch(/insert into public\.organization_service_principals/i);
    expect(inside).toMatch(/insert into public\.organization_admin_api_keys/i);
    expect(inside).toMatch(/update public\.admin_request_idempotency/i);
  });

  it('leaves no key and no principal behind when the replay receipt cannot be completed', async () => {
    bind('owner');
    const answer = mockQuery.getMockImplementation();
    mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/update public\.admin_request_idempotency/i.test(sql)) {
        throw new Error('completion update failed');
      }
      return answer?.(sql, params);
    });

    const res = await POST(
      send(
        'POST',
        { name: 'SIEM', scopes: ['audit.read'], expiresInDays: null },
        { 'Idempotency-Key': 'retry-key-0001' },
      ) as never,
    );

    expect(res.status).toBe(500);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.outcome).toBe('rolled_back');
    for (const table of ['organization_service_principals', 'organization_admin_api_keys']) {
      const pattern = new RegExp(`insert into public\\.${table}`, 'i');
      const issued = mockQuery.mock.calls.filter(([sql]) => pattern.test(String(sql)));
      const inside = transactions[0]?.statements.filter((sql) => pattern.test(sql)) ?? [];
      expect(issued.length).toBeGreaterThan(0);
      expect(inside).toHaveLength(issued.length);
    }
    expect(mockRecordAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'admin_api_key_created' }),
    );
  });

  it('leaves no principal behind when the key insert fails without an Idempotency-Key', async () => {
    bind('owner');
    const answer = mockQuery.getMockImplementation();
    mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/insert into public\.organization_admin_api_keys/i.test(sql)) {
        throw new Error('key insert failed');
      }
      return answer?.(sql, params);
    });

    const res = await POST(
      send('POST', { name: 'SIEM', scopes: ['audit.read'], expiresInDays: null }) as never,
    );

    expect(res.status).toBe(500);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.outcome).toBe('rolled_back');
    expect(transactions[0]?.statements.join('\n')).toMatch(
      /insert into public\.organization_service_principals/i,
    );
    expect(
      mockQuery.mock.calls.filter(([sql]) =>
        /insert into public\.organization_service_principals/i.test(String(sql)),
      ),
    ).toHaveLength(1);
    expect(mockRecordAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'admin_api_key_created' }),
    );
  });

  it('refuses the same Idempotency-Key used for a different key request', async () => {
    bind('owner');
    const headers = { 'Idempotency-Key': 'retry-key-0001' };

    await POST(
      send('POST', { name: 'SIEM', scopes: ['audit.read'], expiresInDays: null }, headers) as never,
    );
    const res = await POST(
      send(
        'POST',
        { name: 'Other', scopes: ['audit.read'], expiresInDays: null },
        headers,
      ) as never,
    );

    expect(res.status).toBe(409);
  });

  it('refuses an unusable Idempotency-Key before doing any work', async () => {
    bind('owner');

    const res = await POST(
      send(
        'POST',
        { name: 'SIEM', scopes: ['audit.read'], expiresInDays: null },
        {
          'Idempotency-Key': 'short',
        },
      ) as never,
    );

    expect(res.status).toBe(400);
    expect(
      mockQuery.mock.calls.some(([sql]) => /insert into public\.organization/i.test(String(sql))),
    ).toBe(false);
  });

  it('revokes a key and records it', async () => {
    bind('owner');

    const res = await DELETE(send('DELETE', { keyId: KEY_ID }) as never);

    expect(res.status).toBe(200);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'admin_api_key_revoked' }),
    );
  });
});

// Source fixtures remain UNRUN. Auth supplies captured scope; these do not test header parsing or RLS.
describe('captured workspace scope', () => {
  const createBody = { name: 'SIEM', scopes: ['audit.read'], expiresInDays: null };

  function requestFor(method: 'GET' | 'POST' | 'DELETE', headers: Record<string, string> = {}) {
    return method === 'GET'
      ? new Request('https://app.test/api/settings/organization/admin-api-keys', { headers })
      : send(method, method === 'POST' ? createBody : { keyId: KEY_ID }, headers);
  }

  function expectNoStorage() {
    expect(
      mockQuery.mock.calls.some(([sql]) =>
        /public\.(organization_admin_api_keys|organization_service_principals|admin_request_idempotency)/i.test(
          String(sql),
        ),
      ),
    ).toBe(false);
  }

  function expectCapturedMembership() {
    const membershipReads = mockQuery.mock.calls.filter(([sql]) =>
      /from public\.organization_members/i.test(String(sql)),
    );
    expect(membershipReads).toHaveLength(1);
    expect(membershipReads[0]?.[1]).toEqual([OTHER_ORG, 'user-1']);
    expect(membershipReads[0]?.[0]).toMatch(/status = 'active'/);
    expect(mockQuery.mock.calls.some(([sql]) => /public\.user_settings/i.test(String(sql)))).toBe(
      false,
    );
    expect(requireTeamAdminAccess).toHaveBeenCalledWith(expect.anything(), 'user-1', OTHER_ORG);
  }

  it.each([true, false])(
    'lists captured B over saved A, with workspace header present=%s',
    async (withHeader) => {
      capturedScope.organizationId = OTHER_ORG;
      bind('owner', principalRow({ organization_id: OTHER_ORG }), OTHER_ORG);
      const res = await GET(
        requestFor(
          'GET',
          withHeader ? { [MANAGED_CLOUD_ORGANIZATION_HEADER]: OTHER_ORG } : {},
        ) as never,
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.organizationId).toBe(OTHER_ORG);
      expect(body.keys[0].organizationId).toBe(OTHER_ORG);
      expect(body.servicePrincipals[0].organizationId).toBe(OTHER_ORG);
      expectCapturedMembership();
      expect(requireMemberPermission).toHaveBeenCalledWith(
        OTHER_ORG,
        'user-1',
        'identity.read',
        expect.any(String),
      );
      for (const [sql, params] of mockQuery.mock.calls) {
        if (
          /from public\.(organization_admin_api_keys|organization_service_principals)/i.test(
            String(sql),
          )
        ) {
          expect(params).toEqual([OTHER_ORG]);
        }
      }
    },
  );

  it.each(['GET', 'POST', 'DELETE'] as const)(
    'refuses Personal before %s storage, plan, permission, step-up or audit',
    async (method) => {
      bind('owner');
      capturedScope.organizationId = null;
      const res = await { GET, POST, DELETE }[method](requestFor(method) as never);

      expect(res.status).toBe(403);
      expect(mockQuery).not.toHaveBeenCalled();
      expect(requireTeamAdminAccess).not.toHaveBeenCalled();
      expect(requireMemberPermission).not.toHaveBeenCalled();
      expect(mockRecordAuditEvent).not.toHaveBeenCalled();
    },
  );

  it.each(['GET', 'POST', 'DELETE'] as const)(
    'refuses absent and mismatched B membership on %s',
    async (method) => {
      for (const member of [null, { organization_id: ORG, role: 'owner' }]) {
        vi.clearAllMocks();
        capturedScope.organizationId = OTHER_ORG;
        bind('owner', principalRow(), ORG, member);
        const res = await { GET, POST, DELETE }[method](requestFor(method) as never);
        expect(res.status).toBe(403);
        expectNoStorage();
        expect(requireTeamAdminAccess).not.toHaveBeenCalled();
        expect(requireMemberPermission).not.toHaveBeenCalled();
        expect(mockRecordAuditEvent).not.toHaveBeenCalled();
      }
    },
  );

  it('binds mint, principal, step-up, idempotency and audit to B and rechecks proof before replay', async () => {
    const headers = { 'Idempotency-Key': 'same-key-both-workspaces' };
    bind('owner');
    expect((await POST(requestFor('POST', headers) as never)).status).toBe(201);
    capturedScope.organizationId = OTHER_ORG;
    bind('owner', principalRow({ organization_id: OTHER_ORG }), OTHER_ORG);
    vi.clearAllMocks();
    const proof = revealProof(OTHER_ORG);
    const first = await POST(requestFor('POST', { ...headers, ...proof }) as never);
    const body = await first.json();
    const second = await POST(requestFor('POST', { ...headers, ...proof }) as never);

    expect(first.status).toBe(201);
    expect(first.headers.get('Idempotency-Replayed')).toBe('false');
    expect(second.headers.get('Idempotency-Replayed')).toBe('true');
    expect((await second.json()).key).toBe(body.key);
    expect(body.record.organizationId).toBe(OTHER_ORG);
    expect(body.servicePrincipal.organizationId).toBe(OTHER_ORG);
    expect(requireMemberPermission).toHaveBeenCalledWith(
      OTHER_ORG,
      'user-1',
      'identity.manage',
      expect.any(String),
    );
    const keyInserts = mockQuery.mock.calls.filter(([sql]) =>
      /insert into public\.organization_admin_api_keys/i.test(String(sql)),
    );
    expect(keyInserts).toHaveLength(1);
    expect(keyInserts[0]?.[1]?.[0]).toBe(OTHER_ORG);
    const principalInsert = mockQuery.mock.calls.find(([sql]) =>
      /insert into public\.organization_service_principals/i.test(String(sql)),
    );
    expect(principalInsert?.[1]?.[0]).toBe(OTHER_ORG);
    const claim = mockQuery.mock.calls.find(([sql]) =>
      /insert into public\.admin_request_idempotency/i.test(String(sql)),
    );
    expect(claim?.[1]).toEqual([
      OTHER_ORG,
      'admin-api-keys:create',
      headers['Idempotency-Key'],
      expect.any(String),
      'user-1',
    ]);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: OTHER_ORG,
        eventType: 'step_up_satisfied',
        endpoint: '/api/settings/organization/admin-api-keys',
        detail: expect.objectContaining({ resourceId: 'api_credential.reveal', scope: OTHER_ORG }),
      }),
    );
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: OTHER_ORG,
        userId: 'user-1',
        eventType: 'admin_api_key_created',
        detail: expect.objectContaining({
          resourceId: KEY_ID,
          subjectRef: `service_principal:${PRINCIPAL_ID}`,
        }),
      }),
    );

    vi.clearAllMocks();
    const refused = await POST(requestFor('POST', headers) as never);
    expect(refused.status).toBe(403);
    expectNoStorage();
    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: OTHER_ORG,
        eventType: 'step_up_challenged',
        detail: expect.objectContaining({ reason: 'subject_mismatch', scope: OTHER_ORG }),
      }),
    );
  });

  it('refuses an A-only principal under B without minting or creation audit', async () => {
    capturedScope.organizationId = OTHER_ORG;
    bind('owner', principalRow(), OTHER_ORG);
    const res = await POST(
      send(
        'POST',
        { ...createBody, servicePrincipalId: PRINCIPAL_ID },
        revealProof(OTHER_ORG),
      ) as never,
    );
    expect(res.status).toBe(404);
    const read = mockQuery.mock.calls.find(([sql]) =>
      /from public\.organization_service_principals/i.test(String(sql)),
    );
    expect(read?.[1]).toEqual([OTHER_ORG, PRINCIPAL_ID]);
    expect(mockQuery.mock.calls.some(([sql]) => /insert into/i.test(String(sql)))).toBe(false);
    expect(mockRecordAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'admin_api_key_created' }),
    );
  });

  it.each([true, false])(
    'revokes only B keys and audits only successful B revocation, key in B=%s',
    async (inB) => {
      capturedScope.organizationId = OTHER_ORG;
      bind('owner', principalRow(), inB ? OTHER_ORG : ORG, {
        organization_id: OTHER_ORG,
        role: 'owner',
      });
      const res = await DELETE(requestFor('DELETE') as never);
      expect(res.status).toBe(inB ? 200 : 404);
      expectCapturedMembership();
      expect(requireMemberPermission).toHaveBeenCalledWith(
        OTHER_ORG,
        'user-1',
        'identity.manage',
        expect.any(String),
      );
      const update = mockQuery.mock.calls.find(([sql]) =>
        /update public\.organization_admin_api_keys/i.test(String(sql)),
      );
      expect(update?.[1]).toEqual([OTHER_ORG, KEY_ID, 'user-1']);
      if (inB) {
        expect(mockRecordAuditEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            organizationId: OTHER_ORG,
            eventType: 'admin_api_key_revoked',
          }),
        );
      } else {
        expect(mockRecordAuditEvent).not.toHaveBeenCalled();
      }
    },
  );

  it.each(['GET', 'POST', 'DELETE'] as const)(
    'preserves plan and permission gates on %s',
    async (method) => {
      capturedScope.organizationId = OTHER_ORG;
      bind('owner', principalRow(), OTHER_ORG);
      vi.mocked(requireTeamAdminAccess).mockRejectedValueOnce(
        createError.forbidden('Plan unavailable'),
      );
      const planDenied = await { GET, POST, DELETE }[method](requestFor(method) as never);
      expect(planDenied.status).toBe(403);
      expect(requireMemberPermission).not.toHaveBeenCalled();
      expectNoStorage();
      expect(mockRecordAuditEvent).not.toHaveBeenCalled();

      vi.clearAllMocks();
      bind('viewer', principalRow(), OTHER_ORG);
      permissionRole.value = null;
      const permissionDenied = await { GET, POST, DELETE }[method](requestFor(method) as never);
      expect(permissionDenied.status).toBe(403);
      expect(requireMemberPermission).toHaveBeenCalled();
      expectNoStorage();
      expect(mockRecordAuditEvent).not.toHaveBeenCalled();
    },
  );

  it.each(['GET', 'POST', 'DELETE'] as const)(
    'preserves rate limiting before %s scope resolution',
    async (method) => {
      bind('owner');
      vi.mocked(withRateLimit).mockResolvedValueOnce(new Response(null, { status: 429 }) as never);
      const res = await { GET, POST, DELETE }[method](requestFor(method) as never);
      expect(res.status).toBe(429);
      expect(getUserScopedDb).not.toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
      expect(mockRecordAuditEvent).not.toHaveBeenCalled();
    },
  );

  it.each(['POST', 'DELETE'] as const)(
    'preserves CSRF and strict body validation before %s writes',
    async (method) => {
      bind('owner');
      vi.mocked(requireCsrfToken).mockResolvedValueOnce(
        new Response(null, { status: 403 }) as never,
      );
      expect((await { POST, DELETE }[method](requestFor(method) as never)).status).toBe(403);
      expect(getUserScopedDb).not.toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
      expect(mockRecordAuditEvent).not.toHaveBeenCalled();

      const invalid =
        method === 'POST' ? { ...createBody, organizationId: OTHER_ORG } : { keyId: 'invalid' };
      expect((await { POST, DELETE }[method](send(method, invalid) as never)).status).toBe(400);
      expectNoStorage();
      expect(mockRecordAuditEvent).not.toHaveBeenCalled();
    },
  );
});
