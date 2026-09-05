import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(async () => null),
}));

const { mockRecordAuditEvent } = vi.hoisted(() => ({
  mockRecordAuditEvent: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock('@/lib/security-audit', () => ({
  logSecurityEvent: vi.fn(async () => undefined),
  getClientIp: vi.fn(() => '203.0.113.7'),
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));

const { mockGetClerkAuthUser } = vi.hoisted(() => ({
  mockGetClerkAuthUser: vi.fn(async () => ({ userId: 'admin-user' })),
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...(args as [])),
}));

const { getDb } = vi.hoisted(() => ({ getDb: { current: null as unknown } }));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => getDb.current,
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createFakeScimDb, type FakeScimDbState } from '@/app/api/scim/v2/__tests__/fake-scim-db';
import { DELETE as connectionDelete, POST as connectionsPost } from '../route';
import { POST as tokensPost } from '../tokens/route';
import { DELETE as tokenDelete } from '../tokens/[tokenId]/route';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONNECTION = '33333333-3333-4333-8333-333333333333';

function seed(): FakeScimDbState {
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

  getDb.current = adapter as unknown as DatabaseAdapter;
  return state;
}

function jsonRequest(url: string, method = 'GET', body?: unknown) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;
}

const LIST_URL = 'https://app.example.com/api/admin/directory-sync';
const TOKENS_URL = 'https://app.example.com/api/admin/directory-sync/tokens';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetClerkAuthUser.mockResolvedValue({ userId: 'admin-user' });
});

describe('directory sync connection audit trail', () => {
  it('records directory_sync_connection_created on POST', async () => {
    seed();

    const response = await connectionsPost(
      jsonRequest(LIST_URL, 'POST', {
        provider: 'azure_ad',
        directory_id: 'dir-new',
        display_name: 'Entra ID',
      }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { connection: { id: string } };

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-user',
        eventType: 'directory_sync_connection_created',
        organizationId: ORG,
        severity: 'warning',
        detail: expect.objectContaining({
          resourceType: 'directory_sync_connection',
          resourceId: body.connection.id,
          resourceName: 'Entra ID',
          source: 'azure_ad',
        }),
      }),
    );
  });

  it('records directory_sync_connection_deleted on DELETE', async () => {
    seed();

    const response = await connectionDelete(jsonRequest(`${LIST_URL}?id=${CONNECTION}`, 'DELETE'));
    expect(response.status).toBe(200);

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-user',
        eventType: 'directory_sync_connection_deleted',
        organizationId: ORG,
        severity: 'critical',
        detail: expect.objectContaining({
          resourceType: 'directory_sync_connection',
          resourceId: CONNECTION,
          resourceName: 'dir-1',
          source: 'okta',
        }),
      }),
    );
  });
});

describe('SCIM token audit trail', () => {
  it('records scim_token_created with the token id and connection reference, never the raw token', async () => {
    seed();

    const response = await tokensPost(
      jsonRequest(TOKENS_URL, 'POST', { connectionId: CONNECTION, name: 'Okta production' }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { token: { id: string }; raw_token: string };

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-user',
        eventType: 'scim_token_created',
        organizationId: ORG,
        severity: 'warning',
        detail: expect.objectContaining({
          resourceType: 'scim_token',
          resourceId: body.token.id,
          resourceName: 'Okta production',
          subjectRef: CONNECTION,
        }),
      }),
    );
    const [call] = mockRecordAuditEvent.mock.calls;
    expect(JSON.stringify(call)).not.toContain(body.raw_token);
  });

  it('records scim_token_revoked on DELETE', async () => {
    const state = seed();
    const minted = await tokensPost(
      jsonRequest(TOKENS_URL, 'POST', { connectionId: CONNECTION, name: 'Okta production' }),
    );
    const tokenId = ((await minted.json()) as { token: { id: string } }).token.id;
    mockRecordAuditEvent.mockClear();

    const response = await tokenDelete(
      jsonRequest(`${TOKENS_URL}/${tokenId}?organizationId=${ORG}`, 'DELETE'),
      { params: Promise.resolve({ tokenId }) },
    );
    expect(response.status).toBe(200);
    expect(state.scim_tokens[0]?.['revoked_at']).not.toBeNull();

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-user',
        eventType: 'scim_token_revoked',
        organizationId: ORG,
        severity: 'warning',
        detail: expect.objectContaining({ resourceType: 'scim_token', resourceId: tokenId }),
      }),
    );
  });
});
