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
}));

import { DELETE, GET, POST } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
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

function bind(role: string, principal: Record<string, unknown> | null = principalRow()) {
  permissionRole.value = role;
  mockQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/from public\.user_settings/i.test(sql)) return [{ organization_id: ORG }];
    if (/from public\.organization_members/i.test(sql)) return [{ organization_id: ORG, role }];
    if (/insert into public\.admin_request_idempotency/i.test(sql)) {
      const key = `${params[1]}|${params[2]}`;
      if (idempotency.has(key)) return [];
      idempotency.set(key, {
        status: 'in_progress',
        request_fingerprint: String(params[3]),
        response_status: null,
        response_body: null,
      });
      return [{ organization_id: ORG }];
    }
    if (/update public\.admin_request_idempotency/i.test(sql)) {
      const row = idempotency.get(`${params[1]}|${params[2]}`);
      if (row) {
        row.status = 'completed';
        row.response_status = Number(params[3]);
        row.response_body = JSON.parse(String(params[4]));
      }
      return [];
    }
    if (/from public\.admin_request_idempotency/i.test(sql)) {
      const row = idempotency.get(`${params[1]}|${params[2]}`);
      return row ? [row] : [];
    }
    if (/insert into public\.organization_service_principals/i.test(sql)) {
      return [principalRow({ name: params[1], max_scopes: params[3] })];
    }
    if (/from public\.organization_service_principals/i.test(sql)) {
      return principal ? [principal] : [];
    }
    if (/insert into public\.organization_admin_api_keys/i.test(sql)) {
      return [
        keyRow({ key_prefix: params[2], scopes: params[4], service_principal_id: params[5] }),
      ];
    }
    if (/update public\.organization_admin_api_keys/i.test(sql)) {
      return [keyRow({ revoked_at: '2026-09-17T01:00:00.000Z' })];
    }
    if (/from public\.organization_admin_api_keys/i.test(sql)) return [keyRow()];
    return [];
  });
}

function send(method: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://app.test/api/settings/organization/admin-api-keys', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  idempotency.clear();
});

describe('/api/settings/organization/admin-api-keys', () => {
  it('lists keys without their hashes for a role with identity.read', async () => {
    bind('admin');

    const res = await GET(new Request('https://app.test/x') as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.canManageKeys).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/key_hash|keyHash/);
    expect(body.keys[0]).toMatchObject({ keyPrefix: 'agiadm_AbCdEf12', scopes: ['audit.read'] });
  });

  it('creates a scoped key, returns the secret once and stores only its hash', async () => {
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
    expect(params[4]).toEqual(['audit.read', 'content.govern']);
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
    expect(body.servicePrincipal).toMatchObject({ id: PRINCIPAL_ID, maxScopes: ['audit.read'] });
    expect(body.record.servicePrincipalId).toBe(PRINCIPAL_ID);
    const insert = mockQuery.mock.calls.find(([sql]) =>
      /insert into public\.organization_service_principals/i.test(String(sql)),
    );
    expect((insert?.[1] as unknown[])[3]).toEqual(['audit.read']);
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
    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
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
