import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockRevokeDirectorySyncGrants, mockRecordAuditEvent, mockGetClerkAuthUser } = vi.hoisted(
  () => ({
    mockRevokeDirectorySyncGrants: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    mockRecordAuditEvent: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
    mockGetClerkAuthUser: vi.fn<(...args: unknown[]) => Promise<{ userId: string }>>(),
  }),
);

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logSecurityEvent: vi.fn(async () => undefined),
  getClientIp: vi.fn(() => '203.0.113.7'),
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args),
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));
vi.mock('@/lib/server/identity', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getIdentityProvider: vi.fn(() => ({})),
}));
vi.mock('@/lib/services/directory-sync-revocation', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  revokeDirectorySyncGrants: (...args: unknown[]) => mockRevokeDirectorySyncGrants(...args),
}));

const { getDb } = vi.hoisted(() => ({ getDb: { current: null as unknown } }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => getDb.current }));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createFakeScimDb } from '@/app/api/scim/v2/__tests__/fake-scim-db';
import { DELETE as connectionDelete } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONNECTION = '33333333-3333-4333-8333-333333333333';
const URL_BASE = 'https://app.example.com/api/admin/directory-sync';

function seed() {
  const { adapter, state } = createFakeScimDb({
    directory_sync_connections: [
      {
        id: CONNECTION,
        organization_id: ORG,
        provider: 'okta',
        directory_id: 'dir-1',
        display_name: 'Okta',
        is_active: true,
        last_sync_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    organization_members: [
      {
        organization_id: ORG,
        user_id: 'admin-user',
        role: 'owner',
        provisioning_source: 'manual',
        provisioned_at: null,
        joined_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    subscriptions: [
      {
        id: 'sub-1',
        user_id: 'admin-user',
        plan_tier: 'enterprise',
        status: 'active',
        current_period_start: '2026-01-01T00:00:00.000Z',
        current_period_end: '2027-01-01T00:00:00.000Z',
        stripe_subscription_id: 'sub_stripe',
        stripe_price_id: null,
        apple_original_transaction_id: null,
        google_purchase_token: null,
      },
    ],
  });
  const statements: string[] = [];
  const recording = {
    ...adapter,
    query: async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
      statements.push(sql);
      return adapter.query<T>(sql, params);
    },
    execute: async (sql: string, params?: unknown[]): Promise<number> => {
      statements.push(sql);
      return adapter.execute(sql, params);
    },
  };
  getDb.current = recording as unknown as DatabaseAdapter;
  return { state, statements };
}

function deleteRequest() {
  return new Request(`${URL_BASE}?id=${CONNECTION}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
  }) as never;
}

function revocationResult(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    connectionId: CONNECTION,
    membershipsRevoked: 4,
    membersDeprovisioned: 4,
    credentialsNotRevoked: 0,
    ownersRetained: 1,
    errors: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetClerkAuthUser.mockResolvedValue({ userId: 'admin-user' });
  mockRevokeDirectorySyncGrants.mockResolvedValue(revocationResult());
});

describe('DELETE /api/admin/directory-sync revokes what the connection granted', () => {
  it('revokes the grants for the connection being deleted', async () => {
    seed();

    const response = await connectionDelete(deleteRequest());

    expect(response.status).toBe(200);
    expect(mockRevokeDirectorySyncGrants).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { organizationId: ORG, connectionId: CONNECTION },
    );

    const body = await response.json();
    expect(body.revoked).toEqual({ memberships: 4, credentials: 4 });
    expect(body.ownersRetained).toBe(1);
    expect(body.warnings).toEqual([]);
  });

  it('revokes before the connection row is gone, because the SCIM rows cascade with it', async () => {
    const { statements } = seed();
    let statementsAtRevocation = 0;
    mockRevokeDirectorySyncGrants.mockImplementation(async () => {
      statementsAtRevocation = statements.length;
      return revocationResult();
    });

    const response = await connectionDelete(deleteRequest());

    expect(response.status).toBe(200);
    const deleteIndex = statements.findIndex((sql) =>
      sql.includes('delete from directory_sync_connections'),
    );
    expect(deleteIndex).toBeGreaterThanOrEqual(0);
    expect(deleteIndex).toBeGreaterThanOrEqual(statementsAtRevocation);
  });

  it('keeps the connection when revocation fails, instead of orphaning the access', async () => {
    const { statements } = seed();
    mockRevokeDirectorySyncGrants.mockRejectedValue(new Error('deadlock detected'));

    const response = await connectionDelete(deleteRequest());

    expect(response.status).toBe(500);
    expect(statements.some((sql) => sql.includes('delete from directory_sync_connections'))).toBe(
      false,
    );
  });

  it('records the revocation counts on the audit row and fails it when access remained', async () => {
    seed();
    mockRevokeDirectorySyncGrants.mockResolvedValue(
      revocationResult({
        membersDeprovisioned: 3,
        credentialsNotRevoked: 1,
        errors: ['user-d: sessions could not be listed'],
      }),
    );

    const response = await connectionDelete(deleteRequest());
    const body = await response.json();

    expect(body.warnings).toEqual(['user-d: sessions could not be listed']);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'directory_sync_connection_deleted',
        outcome: 'failure',
        severity: 'critical',
        detail: expect.objectContaining({
          count: 4,
          reason: 'user-d: sessions could not be listed',
        }),
      }),
    );
  });
});
