import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockExecute = vi.fn();
const mockQuery = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    execute: mockExecute,
    query: mockQuery,
    transaction: mockTransaction,
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

const mockGetClerkAuthUser = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

const mockGetUserScopedDb = vi.fn();
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mockGetUserScopedDb(...args),
}));

const mockCreateApiKey = vi.fn();
const mockRevokeApiKey = vi.fn();
vi.mock('@/lib/services/api-key-service', () => ({
  ApiKeyService: {
    createApiKey: (...args: unknown[]) => mockCreateApiKey(...args),
    revokeApiKey: (...args: unknown[]) => mockRevokeApiKey(...args),
  },
}));

vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: vi.fn().mockResolvedValue({ maxMembers: null }),
}));

import { NextRequest } from 'next/server';
import { recordAuditEvent } from '@/lib/security-audit';
import { POST as createApiKey } from '@/app/api/settings/api-keys/route';
import { DELETE as revokeApiKey } from '@/app/api/settings/api-keys/[keyId]/route';
import { PATCH as updateMemberRole } from '@/app/api/settings/team/[memberId]/route';

const SECURITY_LOG_INSERT = /INSERT INTO security_audit_logs/i;
const ENTERPRISE_WRITER = /record_enterprise_audit_event/i;

function auditInserts(): Array<[string, unknown[]]> {
  return (mockExecute.mock.calls as Array<[string, unknown[]]>).filter(([sql]) =>
    SECURITY_LOG_INSERT.test(sql),
  );
}

function auditParams(index = 0): unknown[] {
  const call = auditInserts()[index];
  if (!call) throw new Error('no audit INSERT was issued');
  return call[1];
}

function decodeAuditRow(params: unknown[]) {
  return {
    userId: params[0],
    eventType: params[1],
    severity: params[2],
    ipAddress: params[3],
    userAgent: params[4],
    endpoint: params[5],
    details: JSON.parse(String(params[6])) as Record<string, unknown>,
  };
}

function enterpriseWrites(): Array<[string, unknown[]]> {
  return (mockQuery.mock.calls as Array<[string, unknown[]]>).filter(([sql]) =>
    ENTERPRISE_WRITER.test(sql),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockResolvedValue(1);
  mockQuery.mockResolvedValue([]);
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ query: mockQuery, execute: mockExecute }),
  );
  mockGetUserScopedDb.mockImplementation(async () => {
    const authUser = await mockGetClerkAuthUser();
    return {
      db: { query: mockQuery, execute: mockExecute, transaction: mockTransaction },
      userId: authUser?.userId,
      organizationId: null,
    };
  });
});

describe('recordAuditEvent, writes a real security_audit_logs row', () => {
  it('records actor, action, severity, ip, user-agent, endpoint and details', async () => {
    const request = new Request('https://app.example.com/api/settings/api-keys', {
      method: 'POST',
      headers: {
        'x-forwarded-for': '9.9.9.9, 203.0.113.7',
        'user-agent': 'AGI-Desktop/1.2.3',
      },
    });

    await recordAuditEvent({
      userId: 'user_actor',
      eventType: 'api_key_created',
      request,
      detail: { resourceType: 'api_key', resourceId: 'key_1', resourceName: 'CI key' },
    });

    expect(auditInserts()).toHaveLength(1);
    const row = decodeAuditRow(auditParams());

    expect(row.userId).toBe('user_actor');
    expect(row.eventType).toBe('api_key_created');
    expect(row.severity).toBe('info');
    expect(row.userAgent).toBe('AGI-Desktop/1.2.3');
    expect(row.endpoint).toBe('/api/settings/api-keys');
    expect(row.details).toEqual({
      resourceType: 'api_key',
      resourceId: 'key_1',
      resourceName: 'CI key',
      resource_type: 'api_key',
      resource_id: 'key_1',
    });
  });

  it('takes the RIGHTMOST x-forwarded-for hop, never the spoofable leftmost one', async () => {
    const request = new Request('https://app.example.com/api/auth/set-token', {
      method: 'POST',
      headers: { 'x-forwarded-for': '1.2.3.4, 198.51.100.22' },
    });

    await recordAuditEvent({ userId: 'user_actor', eventType: 'login', request });

    expect(decodeAuditRow(auditParams()).ipAddress).toBe('198.51.100.22');
  });

  it('prefers the platform-set x-real-ip header', async () => {
    const request = new Request('https://app.example.com/api/auth/set-token', {
      method: 'POST',
      headers: { 'x-real-ip': '198.51.100.99', 'x-forwarded-for': '1.2.3.4' },
    });

    await recordAuditEvent({ userId: 'user_actor', eventType: 'login', request });

    expect(decodeAuditRow(auditParams()).ipAddress).toBe('198.51.100.99');
  });

  it('records a system-actor event with no request (Stripe webhook shape)', async () => {
    await recordAuditEvent({
      userId: 'user_target',
      eventType: 'plan_changed',
      endpoint: '/api/stripe-webhook',
      surface: 'stripe_webhook',
      detail: { previousPlanTier: 'pro', planTier: 'free', source: 'stripe_webhook' },
    });

    const row = decodeAuditRow(auditParams());
    expect(row.eventType).toBe('plan_changed');
    expect(row.endpoint).toBe('/api/stripe-webhook');
    expect(row.ipAddress).toBeNull();
    expect(row.userAgent).toBeNull();
    expect(row.details).toMatchObject({ previousPlanTier: 'pro', planTier: 'free' });
  });

  it('carries a non-success outcome into the row details and raises severity', async () => {
    await recordAuditEvent({
      userId: 'user_actor',
      eventType: 'device_authorization_denied',
      outcome: 'denied',
      endpoint: '/api/auth/device/approve',
    });

    const row = decodeAuditRow(auditParams());
    expect(row.severity).toBe('warning');
    expect(row.details['outcome']).toBe('denied');
  });
});

describe('recordAuditEvent, enterprise dual-write', () => {
  it('calls the 0087 SECURITY DEFINER writer when an organizationId is present', async () => {
    await recordAuditEvent({
      userId: 'user_admin',
      eventType: 'member_role_changed',
      organizationId: '11111111-2222-3333-4444-555555555555',
      endpoint: '/api/settings/team/x',
      detail: {
        resourceType: 'organization_member',
        resourceId: 'user_target',
        role: 'admin',
        previousRole: 'member',
      },
    });

    const writes = enterpriseWrites();
    expect(writes).toHaveLength(1);

    const [, params] = writes[0]!;
    expect(params[0]).toBe('11111111-2222-3333-4444-555555555555');
    expect(params[1]).toBe('user_admin');
    expect(params[2]).toBe('web');
    expect(params[3]).toBe('member_role_changed');
    expect(params[4]).toBe('organization_member');
    expect(params[5]).toBe('user_target');
    expect(['success', 'failure', 'denied']).toContain(params[6]);
    expect(['info', 'warning', 'critical']).toContain(params[7]);
  });

  it('does NOT touch enterprise_audit_events for personal (non-org) events', async () => {
    await recordAuditEvent({
      userId: 'user_actor',
      eventType: 'api_key_created',
      endpoint: '/api/settings/api-keys',
    });

    expect(enterpriseWrites()).toHaveLength(0);
  });

  it('infers a resource_type when the caller did not supply one', async () => {
    await recordAuditEvent({
      userId: 'user_admin',
      eventType: 'member_invited',
      organizationId: '11111111-2222-3333-4444-555555555555',
      endpoint: '/api/settings/team',
    });

    const [, params] = enterpriseWrites()[0]!;
    expect(params[4]).toBe('organization_member');
  });

  it('carries the captured ip address and user agent into the metadata argument', async () => {
    const request = new Request('https://app.example.com/api/settings/team', {
      method: 'PATCH',
      headers: {
        'x-forwarded-for': '9.9.9.9, 203.0.113.7',
        'user-agent': 'AGI-Desktop/1.2.3',
      },
    });

    await recordAuditEvent({
      userId: 'user_admin',
      eventType: 'member_role_changed',
      organizationId: '11111111-2222-3333-4444-555555555555',
      request,
    });

    const [, params] = enterpriseWrites()[0]!;
    const metadata = JSON.parse(String(params[8])) as Record<string, unknown>;
    expect(metadata['ipAddress']).toBe('203.0.113.7');
    expect(metadata['userAgent']).toBe('AGI-Desktop/1.2.3');
  });

  it('omits ip address and user agent from metadata when no request was given', async () => {
    await recordAuditEvent({
      userId: 'user_admin',
      eventType: 'member_invited',
      organizationId: '11111111-2222-3333-4444-555555555555',
      endpoint: '/api/settings/team',
    });

    const [, params] = enterpriseWrites()[0]!;
    const metadata = JSON.parse(String(params[8])) as Record<string, unknown>;
    expect(metadata['ipAddress']).toBeUndefined();
    expect(metadata['userAgent']).toBeUndefined();
  });
});

describe('POST /api/settings/api-keys writes api_key_created', () => {
  it('records the key id, label and scopes', async () => {
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_actor' });
    mockQuery.mockResolvedValue([{ count: '0' }]);
    mockCreateApiKey.mockResolvedValue({
      apiKey: {
        id: 'key_abc',
        user_id: 'user_actor',
        name: 'CI deploy key',
        key_prefix: 'sk_live_abcd',
        scopes: ['inference:write'],
        created_at: '2026-08-04T00:00:00Z',
        last_used_at: null,
      },
      rawKey: 'sk_live_0123456789abcdef_supersecretvalue',
    });

    const response = await createApiKey(
      new NextRequest('https://app.example.com/api/settings/api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.5' },
        body: JSON.stringify({ name: 'CI deploy key', scopes: ['inference:write'] }),
      }),
    );

    expect(response.status).toBe(201);

    expect(auditInserts()).toHaveLength(1);
    const row = decodeAuditRow(auditParams());
    expect(row.eventType).toBe('api_key_created');
    expect(row.userId).toBe('user_actor');
    expect(row.ipAddress).toBe('203.0.113.5');
    expect(row.endpoint).toBe('/api/settings/api-keys');
    expect(row.details['resourceId']).toBe('key_abc');
    expect(row.details['resourceName']).toBe('CI deploy key');
    expect(row.details['scopes']).toEqual(['inference:write']);
  });
});

describe('DELETE /api/settings/api-keys/[keyId] writes api_key_revoked', () => {
  it('records the revoked key id', async () => {
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_actor' });
    mockQuery.mockResolvedValue([{ id: 'key_abc', user_id: 'user_actor', revoked_at: null }]);
    mockRevokeApiKey.mockResolvedValue(undefined);

    const response = await revokeApiKey(
      new NextRequest('https://app.example.com/api/settings/api-keys/key_abc', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ keyId: 'key_abc' }) },
    );

    expect(response.status).toBe(200);

    const row = decodeAuditRow(auditParams());
    expect(row.eventType).toBe('api_key_revoked');
    expect(row.details['resourceId']).toBe('key_abc');
  });

  it('still returns 200 when the audit write fails (audit never breaks the request)', async () => {
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_actor' });
    mockQuery.mockResolvedValue([{ id: 'key_abc', user_id: 'user_actor', revoked_at: null }]);
    mockRevokeApiKey.mockResolvedValue(undefined);
    mockExecute.mockRejectedValue(new Error('relation "security_audit_logs" does not exist'));

    const response = await revokeApiKey(
      new NextRequest('https://app.example.com/api/settings/api-keys/key_abc', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ keyId: 'key_abc' }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'API key revoked' });
    expect(mockRevokeApiKey).toHaveBeenCalledOnce();
  });

  it('still returns 200 when the enterprise dual-write fails', async () => {
    mockQuery.mockRejectedValue(new Error('permission denied for function'));

    await expect(
      recordAuditEvent({
        userId: 'user_admin',
        eventType: 'member_removed',
        organizationId: 'not-a-uuid',
        endpoint: '/api/settings/team/x',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('PATCH /api/settings/team/[memberId] writes member_role_changed', () => {
  it('records the previous and new role, and dual-writes to the org audit trail', async () => {
    const organizationId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_admin' });

    mockQuery.mockImplementation(async (sql: string) => {
      if (/pg_advisory_xact_lock/.test(sql)) return [];
      if (ENTERPRISE_WRITER.test(sql)) return [{ record_enterprise_audit_event: 'row-uuid' }];
      if (/from public\.organization_members/.test(sql)) {
        const calls = mockQuery.mock.calls.filter(([s]) =>
          /from public\.organization_members/.test(String(s)),
        ).length;
        return [
          {
            organization_id: organizationId,
            user_id: calls === 1 ? 'user_admin' : 'user_target',
            role: calls === 1 ? 'owner' : 'member',
            provisioning_source: 'manual',
            provisioned_at: null,
            joined_at: '2026-01-01T00:00:00Z',
          },
        ];
      }
      return [];
    });

    const response = await updateMemberRole(
      new NextRequest(`https://app.example.com/api/settings/team/${organizationId}:user_target`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'admin' }),
      }),
      { params: Promise.resolve({ memberId: `${organizationId}:user_target` }) },
    );

    expect(response.status).toBe(200);

    const row = decodeAuditRow(auditParams());
    expect(row.eventType).toBe('member_role_changed');
    expect(row.userId).toBe('user_admin');
    expect(row.severity).toBe('warning');
    expect(row.details).toMatchObject({
      organizationId,
      targetUserId: 'user_target',
      previousRole: 'member',
      role: 'admin',
    });

    const writes = enterpriseWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0]![1][0]).toBe(organizationId);
    expect(writes[0]![1][3]).toBe('member_role_changed');
  });
});

describe('recordAuditEvent, the two writes fail independently', () => {
  it('still attempts the enterprise row when the per-user log INSERT fails', async () => {
    mockExecute.mockRejectedValue(new Error('security_audit_logs unavailable'));

    await expect(
      recordAuditEvent({
        userId: 'user_admin',
        eventType: 'member_removed',
        organizationId: '11111111-2222-3333-4444-555555555555',
        endpoint: '/api/settings/team/x',
      }),
    ).resolves.toBeUndefined();

    expect(enterpriseWrites()).toHaveLength(1);
  });

  it('still writes the per-user log when the enterprise writer is unavailable', async () => {
    mockQuery.mockRejectedValue(new Error('function record_enterprise_audit_event does not exist'));

    await expect(
      recordAuditEvent({
        userId: 'user_admin',
        eventType: 'member_invited',
        organizationId: '11111111-2222-3333-4444-555555555555',
        endpoint: '/api/settings/team',
      }),
    ).resolves.toBeUndefined();

    expect(auditInserts()).toHaveLength(1);
  });
});

describe('recordAuditEvent, rows are readable through the existing audit-log endpoint', () => {
  it("emits details->>'resource_type' and 'resource_id', the keys the read route filters on", async () => {
    await recordAuditEvent({
      userId: 'user_actor',
      eventType: 'connector_removed',
      endpoint: '/api/connectors',
      detail: { resourceType: 'connector', resourceId: 'conn_1', connectorId: 'github' },
    });

    const details = decodeAuditRow(auditParams()).details;
    expect(details['resource_type']).toBe('connector');
    expect(details['resource_id']).toBe('conn_1');
  });

  it('uses the event_type strings the read layer already advertises', async () => {
    for (const eventType of ['login', 'logout', 'api_key_created', 'api_key_revoked'] as const) {
      mockExecute.mockClear();
      await recordAuditEvent({ userId: 'user_actor', eventType, endpoint: '/api/test' });
      expect(decodeAuditRow(auditParams()).eventType).toBe(eventType);
    }
  });
});
