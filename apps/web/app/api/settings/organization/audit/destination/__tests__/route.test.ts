import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';

vi.mock('server-only', () => ({}));

const permissionRole = vi.hoisted(() => ({ value: 'admin' as string | null }));
vi.mock('@/lib/services/organization-permission-service', async () =>
  (
    await import('@/lib/services/__tests__/organization-permission-service-mock')
  ).organizationPermissionServiceMock(permissionRole),
);

const mocks = vi.hoisted(() => ({
  capturedOrganizationId: '11111111-1111-4111-8111-111111111111' as string | null,
  resolveActiveOrganizationId: vi.fn(),
  getUserScopedDb: vi.fn(),
  getNeonDb: vi.fn(),
  setAdd: vi.fn(),
  setRemove: vi.fn(),
  fetch: vi.fn(),
  randomBytes: vi.fn(),
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  query: vi.fn(),
  privilegedQuery: vi.fn(),
  recordAuditEvent: vi.fn(async (_event: unknown) => undefined),
  requireTeamAdminAccess: vi.fn(async () => ({ plan: 'enterprise', canManageTeam: true })),
  assertResolvedPublicHostname: vi.fn(async (_url: string) => undefined),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/error-handler', () => ({
  withErrorHandler: (handler: (request: Request) => Promise<Response>) =>
    async (request: Request) => {
      try {
        return await handler(request);
      } catch (error) {
        const failure = error as { statusCode?: number; message?: string };
        return Response.json({ error: failure.message }, { status: failure.statusCode ?? 500 });
      }
    },
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: mocks.resolveActiveOrganizationId,
}));
vi.mock('@/lib/services/org-entitlements', () => ({
  getOrganizationEntitlements: vi.fn(),
  getSharedProjectLimitErrorMessage: vi.fn(),
  isOrgResourceLimitError: vi.fn(),
}));
vi.mock('node:crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:crypto')>()),
  randomBytes: mocks.randomBytes,
}));
vi.mock('@/lib/services/audit-streaming-proxy', () => ({
  buildBoundedDeliveryBody: vi.fn(),
  deliverAuditBatch: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/key-value', () => ({
  getKeyValueStore: () => ({ setAdd: mocks.setAdd, setRemove: mocks.setRemove }),
  getKeyValueRateLimiter: () => null,
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mocks.getNeonDb }));
vi.mock('@/lib/server/organization-encryption-keys', () => ({
  organizationKeyRing: vi.fn(async () => ({ ring: {} })),
}));
vi.mock('@/lib/crypto/envelope', () => ({
  sealEnvelope: vi.fn(() => 'sealed-audit-signing-secret'),
  openEnvelope: vi.fn(() => ({ plaintext: 'fixture-secret' })),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mocks.recordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: mocks.requireTeamAdminAccess,
}));
vi.mock('@/lib/egress-policy', () => ({
  EgressPolicyError: class EgressPolicyError extends Error {},
  assertResolvedPublicHostname: mocks.assertResolvedPublicHostname,
}));

import { createError } from '@/lib/errors';
import { permissionsForRole } from '@/lib/services/__tests__/organization-permission-service-mock';
import { organizationKeyRing } from '@/lib/server/organization-encryption-keys';
import { sealEnvelope, openEnvelope } from '@/lib/crypto/envelope';
import { requireMemberPermission } from '@/lib/services/organization-permission-service';
import { buildBoundedDeliveryBody, deliverAuditBatch } from '@/lib/services/audit-streaming-proxy';
import { EgressPolicyError } from '@/lib/egress-policy';
import { AUDIT_STREAM_ACTIVE_ORGS_REDIS_KEY } from '@/lib/services/audit-streaming-service';
import { DELETE, GET, PATCH, PUT } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const FIXTURE_SECRET = 'ab'.repeat(32);
const scopedDb = { query: mocks.query };
const privilegedDb = { query: mocks.privilegedQuery };
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

type DestinationRow = ReturnType<typeof destinationRow>;
let destinations: Map<string, DestinationRow>;
let membershipMode: 'active' | 'missing' | 'mismatched' = 'active';

function bindRole(role: 'owner' | 'admin' | 'member' | 'viewer', stored = [destinationRow()]) {
  permissionRole.value = role;
  destinations = new Map(stored.map((row) => [row.organization_id, row]));
  mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (/from public\.user_settings/i.test(sql)) {
      expect(params).toEqual(['admin-1']);
      return [{ organization_id: ORG }];
    }
    if (/from public\.organization_members/i.test(sql)) {
      expect(sql).toMatch(/organization_id = \$1 and user_id = \$2/);
      expect(sql).toMatch(/status = 'active'/);
      expect(params).toEqual([mocks.capturedOrganizationId, 'admin-1']);
      if (membershipMode === 'missing') return [];
      return [{ organization_id: membershipMode === 'mismatched' ? ORG : params[0], role }];
    }
    if (/from public\.organization_audit_destinations/i.test(sql)) {
      expect(sql).toMatch(/where organization_id = \$1/);
      expect(params).toHaveLength(1);
      const row = destinations.get(String(params[0]));
      return row ? [row] : [];
    }
    throw new Error(`Unexpected scoped query: ${sql}`);
  });
  mocks.privilegedQuery.mockImplementation(async (sql: string, params: unknown[]) => {
    const organizationId = String(params[0]);
    if (/insert into public\.organization_audit_destinations/i.test(sql)) {
      expect(params).toHaveLength(7);
      const row = destinationRow({
        organization_id: organizationId,
        endpoint_url: params[1],
        secret_prefix: params[4],
        enabled: params[5],
      });
      destinations.set(organizationId, row);
      return [row];
    }
    expect(sql).toMatch(/where organization_id = \$1/);
    const row = destinations.get(organizationId);
    if (/update public\.organization_audit_destinations/i.test(sql)) {
      expect(params).toHaveLength(2);
      if (!row) return [];
      const updated = { ...row, enabled: Boolean(params[1]) };
      destinations.set(organizationId, updated);
      return [updated];
    }
    if (/delete from public\.organization_audit_destinations/i.test(sql)) {
      expect(params).toHaveLength(1);
      if (!row) return [];
      destinations.delete(organizationId);
      return [{ organization_id: organizationId }];
    }
    throw new Error(`Unexpected privileged query: ${sql}`);
  });
}

function req(method: string, body?: unknown, headerOrganizationId?: string): never {
  return new Request('https://app.test/api/settings/organization/audit/destination', {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(headerOrganizationId === undefined
        ? {}
        : { [MANAGED_CLOUD_ORGANIZATION_HEADER]: headerOrganizationId }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;
}

beforeEach(() => {
  vi.resetAllMocks();
  membershipMode = 'active';
  mocks.capturedOrganizationId = ORG;
  permissionRole.value = 'admin';
  mocks.getUserScopedDb.mockImplementation(async () => ({
    db: scopedDb,
    userId: 'admin-1',
    organizationId: mocks.capturedOrganizationId,
  }));
  mocks.getNeonDb.mockReturnValue(privilegedDb);
  mocks.resolveActiveOrganizationId.mockResolvedValue(ORG);
  mocks.requireTeamAdminAccess.mockResolvedValue({ plan: 'enterprise', canManageTeam: true });
  vi.mocked(requireMemberPermission).mockImplementation(async (_org, _user, permission, message) => {
    const permissions = permissionsForRole(permissionRole.value);
    if (!permissions.has(permission)) {
      throw createError.forbidden(message).asUserSafe();
    }
    return permissions;
  });
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.assertResolvedPublicHostname.mockResolvedValue(undefined);
  mocks.randomBytes.mockImplementation((size: number) => {
    expect(size).toBe(32);
    return Buffer.from(FIXTURE_SECRET, 'hex');
  });
  vi.mocked(organizationKeyRing).mockResolvedValue({ ring: {} } as never);
  vi.mocked(sealEnvelope).mockReturnValue('sealed-audit-signing-secret');
  vi.mocked(openEnvelope).mockReturnValue({ plaintext: 'fixture-secret' } as never);
  mocks.fetch.mockImplementation(() => {
    throw new Error('Unexpected network access');
  });
  vi.stubGlobal('fetch', mocks.fetch);
  bindRole('admin');
});

afterEach(() => {
  expect(mocks.resolveActiveOrganizationId).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(deliverAuditBatch).not.toHaveBeenCalled();
  expect(buildBoundedDeliveryBody).not.toHaveBeenCalled();
  expect(openEnvelope).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('/api/settings/organization/audit/destination', () => {
  it('refuses a plain member on every method', async () => {
    bindRole('member');

    expect((await GET(req('GET'))).status).toBe(403);
    expect((await PUT(req('PUT', { endpointUrl: ENDPOINT }))).status).toBe(403);
    expect((await DELETE(req('DELETE'))).status).toBe(403);
    expect((await PATCH(req('PATCH', { enabled: false }))).status).toBe(403);
    expect(mocks.privilegedQuery).not.toHaveBeenCalled();
  });

  it('reads the destination without exposing the secret hash', async () => {
    bindRole('admin', [
      destinationRow({
        secret_hash: 'fixture-private-hash',
        secret_ciphertext: 'fixture-private-ciphertext',
      }),
    ]);

    const res = await GET(req('GET'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.destination).toMatchObject({ endpointUrl: ENDPOINT, secretPrefix: 'abcd1234' });
    expect(JSON.stringify(body)).not.toContain('secret_hash');
    expect(JSON.stringify(body)).not.toContain('secret_ciphertext');
    expect(JSON.stringify(body)).not.toContain('fixture-private-hash');
    expect(JSON.stringify(body)).not.toContain('fixture-private-ciphertext');
  });

  it('saves a destination, returns the signing secret once, and audits the change without it', async () => {
    bindRole('owner');

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
    expect(mocks.privilegedQuery).not.toHaveBeenCalled();
    expect(organizationKeyRing).not.toHaveBeenCalled();
    expect(sealEnvelope).not.toHaveBeenCalled();
    expect(mocks.randomBytes).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('pauses delivery without rotating the secret', async () => {
    bindRole('admin');

    const res = await PATCH(req('PATCH', { enabled: false }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.destination.enabled).toBe(false);
    expect(body.signingSecret).toBeUndefined();
    expect(organizationKeyRing).not.toHaveBeenCalled();
    expect(sealEnvelope).not.toHaveBeenCalled();
    expect(mocks.randomBytes).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'audit_destination_configured',
        detail: expect.objectContaining({ enabled: false, changedKeys: ['enabled'] }),
      }),
    );
  });

  it('removes the destination and records the removal as critical', async () => {
    bindRole('admin');

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

    const res = await DELETE(req('DELETE'));

    expect(res.status).toBe(404);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});

const methods = [
  { method: 'GET', handler: GET, body: undefined },
  { method: 'PUT', handler: PUT, body: { endpointUrl: ENDPOINT } },
  { method: 'PATCH', handler: PATCH, body: { enabled: false } },
  { method: 'DELETE', handler: DELETE, body: undefined },
] as const;

function expectNoDestinationAccess() {
  expect(
    mocks.query.mock.calls.filter(([sql]) => /organization_audit_destinations/i.test(sql)),
  ).toEqual([]);
  expect(mocks.getNeonDb).not.toHaveBeenCalled();
  expect(mocks.privilegedQuery).not.toHaveBeenCalled();
  expect(organizationKeyRing).not.toHaveBeenCalled();
  expect(sealEnvelope).not.toHaveBeenCalled();
  expect(mocks.randomBytes).not.toHaveBeenCalled();
  expect(mocks.assertResolvedPublicHostname).not.toHaveBeenCalled();
  expect(mocks.setAdd).not.toHaveBeenCalled();
  expect(mocks.setRemove).not.toHaveBeenCalled();
  expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
}

function expectCapturedMembership() {
  const calls = mocks.query.mock.calls.filter(([sql]) => /organization_members/i.test(sql));
  expect(calls).toHaveLength(1);
  expect(calls[0]?.[1]).toEqual([ORG_B, 'admin-1']);
  expect(calls[0]?.[0]).toMatch(/status = 'active'/);
  expect(mocks.query.mock.calls.some(([sql]) => /user_settings/i.test(sql))).toBe(false);
}

describe('captured audit destination organization with saved workspace A', () => {
  for (const { method, handler, body } of methods) {
    for (const header of [ORG_B, undefined]) {
      const selector = header ? 'an explicit B header' : 'no header';
      it(`${method} targets captured B with ${selector}`, async () => {
        mocks.capturedOrganizationId = ORG_B;
        const rowA = destinationRow();
        const rowB = destinationRow({ organization_id: ORG_B });
        bindRole('admin', [rowA, rowB]);
        const response = await handler(req(method, body, header));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.organizationId).toBe(ORG_B);
        expectCapturedMembership();
        expect(mocks.requireTeamAdminAccess).toHaveBeenCalledExactlyOnceWith(
          scopedDb,
          'admin-1',
          ORG_B,
        );
        expect(requireMemberPermission).toHaveBeenCalledExactlyOnceWith(
          ORG_B,
          'admin-1',
          'policy.manage',
          expect.any(String),
        );
        expect(destinations.get(ORG)).toEqual(rowA);
        for (const [sql, params] of mocks.query.mock.calls) {
          if (/organization_audit_destinations/i.test(sql)) {
            expect(params).toEqual([ORG_B]);
          }
        }
        for (const [, params] of mocks.privilegedQuery.mock.calls) {
          expect(params[0]).toBe(ORG_B);
        }
        if (method === 'GET') {
          expect(payload.destination).toMatchObject({ organizationId: ORG_B, endpointUrl: ENDPOINT });
          expect(mocks.privilegedQuery).not.toHaveBeenCalled();
          expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
        } else {
          expect(mocks.privilegedQuery).toHaveBeenCalledTimes(1);
          expect(mocks.recordAuditEvent).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
              organizationId: ORG_B,
              userId: 'admin-1',
              detail: expect.objectContaining({
                resourceId: ORG_B,
                resourceName: 'siem.example.test',
              }),
            }),
          );
        }
        if (method === 'PUT') {
          expect(response.headers.get('cache-control')).toBe('no-store');
          expect(payload.signingSecret).toBe(FIXTURE_SECRET);
          expect(payload.destination).toMatchObject({ organizationId: ORG_B, enabled: true });
          expect(mocks.privilegedQuery).toHaveBeenCalledWith(
            expect.stringMatching(/insert into public\.organization_audit_destinations/i),
            [
              ORG_B,
              ENDPOINT,
              expect.stringMatching(/^[0-9a-f]{64}$/),
              'sealed-audit-signing-secret',
              FIXTURE_SECRET.slice(0, 8),
              true,
              'admin-1',
            ],
          );
          expect(organizationKeyRing).toHaveBeenCalledExactlyOnceWith(privilegedDb, ORG_B);
          expect(sealEnvelope).toHaveBeenCalledExactlyOnceWith(
            {},
            FIXTURE_SECRET,
            'versioned',
            `organization-audit-destination:${ORG_B}`,
          );
          expect(mocks.setAdd).toHaveBeenCalledExactlyOnceWith(
            AUDIT_STREAM_ACTIVE_ORGS_REDIS_KEY,
            ORG_B,
          );
          expect(mocks.setRemove).not.toHaveBeenCalled();
          expect(JSON.stringify(mocks.recordAuditEvent.mock.calls)).not.toContain(FIXTURE_SECRET);
        } else {
          expect(payload.signingSecret).toBeUndefined();
          expect(organizationKeyRing).not.toHaveBeenCalled();
          expect(sealEnvelope).not.toHaveBeenCalled();
          expect(mocks.randomBytes).not.toHaveBeenCalled();
          expect(mocks.assertResolvedPublicHostname).not.toHaveBeenCalled();
        }
        if (method === 'PATCH') {
          expect(payload.destination).toMatchObject({ organizationId: ORG_B, enabled: false });
          expect(mocks.privilegedQuery.mock.calls[0]?.[1]).toEqual([ORG_B, false]);
        }
        if (method === 'DELETE') {
          expect(payload.destination).toBeNull();
          expect(destinations.has(ORG_B)).toBe(false);
          expect(mocks.privilegedQuery.mock.calls[0]?.[1]).toEqual([ORG_B]);
        }
        if (method === 'PATCH' || method === 'DELETE') {
          expect(mocks.setRemove).toHaveBeenCalledExactlyOnceWith(
            AUDIT_STREAM_ACTIVE_ORGS_REDIS_KEY,
            ORG_B,
          );
          expect(mocks.setAdd).not.toHaveBeenCalled();
        }
        expect(JSON.stringify(payload.destination)).not.toContain('secret_hash');
        expect(JSON.stringify(payload.destination)).not.toContain('secret_ciphertext');
        expect(JSON.stringify(payload.destination)).not.toContain('sealed-audit-signing-secret');
      });
    }

    for (const selector of [
      { name: 'Personal header', value: MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE },
      { name: 'mismatched B header', value: ORG_B },
    ]) {
      it(`${method} refuses captured Personal with ${selector.name} and saved A`, async () => {
        mocks.capturedOrganizationId = null;
        const response = await handler(req(method, body, selector.value));
        expect(response.status).toBe(403);
        expect(mocks.query).not.toHaveBeenCalled();
        expect(mocks.requireTeamAdminAccess).not.toHaveBeenCalled();
        expect(requireMemberPermission).not.toHaveBeenCalled();
        expectNoDestinationAccess();
      });
    }

    for (const mode of ['missing', 'mismatched'] as const) {
      it(`${method} refuses ${mode} active B membership without falling back to A`, async () => {
        mocks.capturedOrganizationId = ORG_B;
        membershipMode = mode;
        const response = await handler(req(method, body, ORG_B));
        expect(response.status).toBe(403);
        expectCapturedMembership();
        expect(mocks.requireTeamAdminAccess).not.toHaveBeenCalled();
        expect(requireMemberPermission).not.toHaveBeenCalled();
        expectNoDestinationAccess();
      });
    }

    it(`${method} refuses a B plan failure before permission or resources`, async () => {
      mocks.capturedOrganizationId = ORG_B;
      mocks.requireTeamAdminAccess.mockRejectedValue(createError.forbidden('B plan denied'));
      const response = await handler(req(method, body, ORG_B));
      expect(response.status).toBe(403);
      expectCapturedMembership();
      expect(mocks.requireTeamAdminAccess).toHaveBeenCalledExactlyOnceWith(
        scopedDb,
        'admin-1',
        ORG_B,
      );
      expect(requireMemberPermission).not.toHaveBeenCalled();
      expectNoDestinationAccess();
    });

    it(`${method} refuses a B permission failure before resources`, async () => {
      mocks.capturedOrganizationId = ORG_B;
      vi.mocked(requireMemberPermission).mockImplementation(async (organizationId) => {
        if (organizationId === ORG_B) {
          throw createError.forbidden('B permission denied');
        }
        return new Set(['policy.manage']);
      });
      const response = await handler(req(method, body, ORG_B));
      expect(response.status).toBe(403);
      expectCapturedMembership();
      expect(requireMemberPermission).toHaveBeenCalledExactlyOnceWith(
        ORG_B,
        'admin-1',
        'policy.manage',
        expect.any(String),
      );
      expectNoDestinationAccess();
    });

    it(`${method} stops on rate limiting before authentication`, async () => {
      mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
      const response = await handler(req(method, body));
      expect(response.status).toBe(429);
      expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
      expect(mocks.query).not.toHaveBeenCalled();
      expectNoDestinationAccess();
    });

    if (method !== 'GET') {
      it(`${method} stops on CSRF failure before rate limiting or authentication`, async () => {
        mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));
        const response = await handler(req(method, body));
        expect(response.status).toBe(403);
        expect(mocks.withRateLimit).not.toHaveBeenCalled();
        expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
        expect(mocks.query).not.toHaveBeenCalled();
        expectNoDestinationAccess();
      });
    }
  }

  for (const { method, handler, body } of methods.filter(({ method }) => method !== 'PUT')) {
    it(`${method} leaves an A-only destination untouched when captured B is absent`, async () => {
      mocks.capturedOrganizationId = ORG_B;
      const rowA = destinationRow();
      bindRole('admin', [rowA]);
      const response = await handler(req(method, body, ORG_B));
      expect(response.status).toBe(method === 'GET' ? 200 : 404);
      if (method === 'GET') {
        expect(await response.json()).toEqual({ organizationId: ORG_B, destination: null });
      }
      expectCapturedMembership();
      expect(destinations.get(ORG)).toEqual(rowA);
      expect(destinations.has(ORG_B)).toBe(false);
      expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
      for (const [, params] of mocks.privilegedQuery.mock.calls) {
        expect(params[0]).toBe(ORG_B);
      }
      expect(organizationKeyRing).not.toHaveBeenCalled();
      expect(sealEnvelope).not.toHaveBeenCalled();
      expect(mocks.randomBytes).not.toHaveBeenCalled();
      expect(mocks.assertResolvedPublicHostname).not.toHaveBeenCalled();
      expect(mocks.setAdd).not.toHaveBeenCalled();
      if (method === 'DELETE') {
        expect(mocks.setRemove).toHaveBeenCalledExactlyOnceWith(
          AUDIT_STREAM_ACTIVE_ORGS_REDIS_KEY,
          ORG_B,
        );
      } else {
        expect(mocks.setRemove).not.toHaveBeenCalled();
      }
    });
  }

  it.each([
    { method: 'PUT', handler: PUT, body: { endpointUrl: ENDPOINT, unexpected: true } },
    { method: 'PATCH', handler: PATCH, body: { enabled: 'false' } },
    { method: 'PATCH', handler: PATCH, body: { enabled: false, unexpected: true } },
  ])(
    '$method rejects invalid body without writes or key generation',
    async ({ method, handler, body }) => {
      const response = await handler(req(method, body));
      expect(response.status).toBe(400);
      expectNoDestinationAccess();
    },
  );
});
