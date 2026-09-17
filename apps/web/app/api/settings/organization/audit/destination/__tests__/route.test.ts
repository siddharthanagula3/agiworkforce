import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const permissionRole = vi.hoisted(() => ({ value: 'admin' as string | null }));
vi.mock('@/lib/services/organization-permission-service', async () =>
  (
    await import('@/lib/services/__tests__/organization-permission-service-mock')
  ).organizationPermissionServiceMock(permissionRole),
);

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  privilegedQuery: vi.fn(),
  recordAuditEvent: vi.fn(async (_event: unknown) => undefined),
  requireTeamAdminAccess: vi.fn(async () => ({ plan: 'enterprise', canManageTeam: true })),
  assertResolvedPublicHostname: vi.fn(async (_url: string) => undefined),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/key-value', () => ({
  getKeyValueStore: () => null,
  getKeyValueRateLimiter: () => null,
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'admin-1',
  })),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mocks.privilegedQuery(...args) }),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mocks.recordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: mocks.requireTeamAdminAccess,
}));
vi.mock('@/lib/egress-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/egress-policy')>()),
  assertResolvedPublicHostname: mocks.assertResolvedPublicHostname,
}));

import { EgressPolicyError } from '@/lib/egress-policy';
import { DELETE, GET, PATCH, PUT } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const ENDPOINT = 'https://siem.example.test/hook';

function destinationRow(over: Record<string, unknown> = {}) {
  return {
    organization_id: ORG,
    endpoint_url: ENDPOINT,
    secret_prefix: 'abcd1234',
    enabled: true,
    last_delivered_at: null,
    last_delivered_id: null,
    last_attempt_at: null,
    last_status: null,
    consecutive_failures: 0,
    created_at: '2026-09-16T00:00:00.000Z',
    ...over,
  };
}

function bindRole(role: 'owner' | 'admin' | 'member' | 'viewer', stored = [destinationRow()]) {
  permissionRole.value = role;
  mocks.query.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (/from public\.user_settings/i.test(text)) return [{ organization_id: ORG }];
    if (/from public\.organization_members/i.test(text)) return [{ organization_id: ORG, role }];
    if (/from public\.organization_audit_destinations/i.test(text)) return stored;
    return [];
  });
}

function req(method: string, body?: unknown): never {
  return new Request('https://app.test/api/settings/organization/audit/destination', {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertResolvedPublicHostname.mockResolvedValue(undefined);
});

describe('/api/settings/organization/audit/destination', () => {
  it('refuses a plain member on every method', async () => {
    bindRole('member');

    expect((await GET(req('GET'))).status).toBe(403);
    expect((await PUT(req('PUT', { endpointUrl: ENDPOINT }))).status).toBe(403);
    expect((await DELETE(req('DELETE'))).status).toBe(403);
    expect(mocks.privilegedQuery).not.toHaveBeenCalled();
  });

  it('reads the destination without exposing the secret hash', async () => {
    bindRole('admin');

    const res = await GET(req('GET'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.destination).toMatchObject({ endpointUrl: ENDPOINT, secretPrefix: 'abcd1234' });
    expect(JSON.stringify(body)).not.toContain('secret_hash');
  });

  it('saves a destination, returns the signing secret once, and audits the change without it', async () => {
    bindRole('owner');
    mocks.privilegedQuery.mockResolvedValue([destinationRow()]);

    const res = await PUT(req('PUT', { endpointUrl: ENDPOINT }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.signingSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(mocks.assertResolvedPublicHostname).toHaveBeenCalledWith(ENDPOINT);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        organizationId: ORG,
        eventType: 'audit_destination_configured',
        detail: expect.objectContaining({ resourceName: 'siem.example.test', enabled: true }),
      }),
    );
    expect(JSON.stringify(mocks.recordAuditEvent.mock.calls)).not.toContain(body.signingSecret);
  });

  it('refuses a plaintext http endpoint before touching the database', async () => {
    bindRole('admin');

    const res = await PUT(req('PUT', { endpointUrl: 'http://siem.example.test/hook' }));

    expect(res.status).toBe(400);
    expect(mocks.privilegedQuery).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('answers a private-address endpoint with a plain validation error', async () => {
    bindRole('admin');
    mocks.assertResolvedPublicHostname.mockRejectedValue(new EgressPolicyError(ENDPOINT));

    const res = await PUT(req('PUT', { endpointUrl: ENDPOINT }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(JSON.stringify(body)).toContain('private or unreachable');
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('pauses delivery without rotating the secret', async () => {
    bindRole('admin');
    mocks.privilegedQuery.mockResolvedValue([destinationRow({ enabled: false })]);

    const res = await PATCH(req('PATCH', { enabled: false }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.destination.enabled).toBe(false);
    expect(body.signingSecret).toBeUndefined();
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'audit_destination_configured',
        detail: expect.objectContaining({ enabled: false, changedKeys: ['enabled'] }),
      }),
    );
  });

  it('removes the destination and records the removal as critical', async () => {
    bindRole('admin');
    mocks.privilegedQuery.mockResolvedValue([{ organization_id: ORG }]);

    const res = await DELETE(req('DELETE'));

    expect(res.status).toBe(200);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'audit_destination_deleted',
        severity: 'critical',
        detail: expect.objectContaining({ resourceName: 'siem.example.test' }),
      }),
    );
  });

  it('answers 404 and records nothing when there is no destination to remove', async () => {
    bindRole('admin', []);
    mocks.privilegedQuery.mockResolvedValue([]);

    const res = await DELETE(req('DELETE'));

    expect(res.status).toBe(404);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});
