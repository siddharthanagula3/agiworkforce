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

function keyRow(over: Record<string, unknown> = {}) {
  return {
    id: KEY_ID,
    organization_id: ORG,
    name: 'SIEM',
    key_prefix: 'agiadm_AbCdEf12',
    scopes: ['audit.read'],
    created_by: 'user-1',
    created_at: '2026-09-17T00:00:00.000Z',
    expires_at: null,
    last_used_at: null,
    revoked_at: null,
    ...over,
  };
}

function bind(role: string) {
  permissionRole.value = role;
  mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
    if (/from public\.user_settings/i.test(sql)) return [{ organization_id: ORG }];
    if (/from public\.organization_members/i.test(sql)) return [{ organization_id: ORG, role }];
    if (/insert into public\.organization_admin_api_keys/i.test(sql)) {
      return [keyRow({ key_prefix: params[2], scopes: params[4] })];
    }
    if (/update public\.organization_admin_api_keys/i.test(sql)) {
      return [keyRow({ revoked_at: '2026-09-17T01:00:00.000Z' })];
    }
    if (/from public\.organization_admin_api_keys/i.test(sql)) return [keyRow()];
    return [];
  });
}

function send(method: string, body: unknown): Request {
  return new Request('https://app.test/api/settings/organization/admin-api-keys', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => vi.clearAllMocks());

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

  it('revokes a key and records it', async () => {
    bind('owner');

    const res = await DELETE(send('DELETE', { keyId: KEY_ID }) as never);

    expect(res.status).toBe(200);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'admin_api_key_revoked' }),
    );
  });
});
