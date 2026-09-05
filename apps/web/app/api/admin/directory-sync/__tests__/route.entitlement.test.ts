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

vi.mock('@/lib/security-audit', () => ({
  logSecurityEvent: vi.fn(async () => undefined),
  getClientIp: vi.fn(() => '203.0.113.7'),
  recordAuditEvent: vi.fn(async () => undefined),
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
import {
  DELETE as connectionDelete,
  GET as connectionsGet,
  POST as connectionsPost,
} from '../route';
import { GET as tokensGet, POST as tokensPost } from '../tokens/route';
import { DELETE as tokenDelete } from '../tokens/[tokenId]/route';

const ORG = '11111111-1111-4111-8111-111111111111';
const SECOND_ORG = '22222222-2222-4222-8222-222222222222';
const CONNECTION = '33333333-3333-4333-8333-333333333333';
const FOREIGN_CONNECTION = '44444444-4444-4444-8444-444444444444';

function subscription(planTier: string, status = 'active') {
  return {
    id: 'sub-1',
    user_id: 'admin-user',
    plan_tier: planTier,
    status,
    current_period_start: '2026-01-01T00:00:00.000Z',
    current_period_end: '2027-01-01T00:00:00.000Z',
    stripe_subscription_id: 'sub_stripe',
    stripe_price_id: null,
    apple_original_transaction_id: null,
    google_purchase_token: null,
  };
}

function seed(
  options: { planTier?: string; roles?: Array<{ organization_id: string; role: string }> } = {},
): FakeScimDbState {
  const { planTier = 'enterprise', roles = [{ organization_id: ORG, role: 'owner' }] } = options;

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
      {
        id: FOREIGN_CONNECTION,
        organization_id: SECOND_ORG,
        provider: 'okta',
        directory_id: 'dir-2',
        display_name: 'Someone else',
        is_active: true,
        last_sync_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    organization_members: roles.map((entry) => ({
      organization_id: entry.organization_id,
      user_id: 'admin-user',
      role: entry.role,
      provisioning_source: 'manual',
      provisioned_at: null,
      joined_at: '2026-01-01T00:00:00.000Z',
    })),
    subscriptions: planTier === 'none' ? [] : [subscription(planTier)],
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

describe('directory sync admin entitlement gate', () => {
  it.each(['free', 'basic', 'pro', 'max', 'max_15x', 'team'])(
    'refuses a %s plan on every verb, enterprise_controls is enterprise-only',
    async (planTier) => {
      const state = seed({ planTier });

      const list = await connectionsGet(jsonRequest(LIST_URL));
      const create = await connectionsPost(
        jsonRequest(LIST_URL, 'POST', { provider: 'okta', directory_id: 'dir-new' }),
      );
      const remove = await connectionDelete(jsonRequest(`${LIST_URL}?id=${CONNECTION}`, 'DELETE'));
      const mint = await tokensPost(
        jsonRequest(TOKENS_URL, 'POST', { connectionId: CONNECTION, name: 'Okta' }),
      );

      for (const response of [list, create, remove, mint]) {
        expect(response.status).toBe(403);
      }
      await expect(list.json()).resolves.toMatchObject({
        code: 'SUBSCRIPTION_REQUIRED',
        currentPlan: planTier,
        requiredPlans: ['enterprise'],
      });

      expect(state.directory_sync_connections).toHaveLength(2);
      expect(state.scim_tokens).toHaveLength(0);
    },
  );

  it('fails closed when the caller has no subscription row at all', async () => {
    seed({ planTier: 'none' });
    expect((await connectionsGet(jsonRequest(LIST_URL))).status).toBe(403);
  });

  it('fails closed on a tier string the catalog does not recognise', async () => {
    seed({ planTier: 'business' });
    const response = await connectionsGet(jsonRequest(LIST_URL));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ currentPlan: 'free' });
  });

  it('fails closed when an enterprise subscription is not in an entitled status', async () => {
    const { adapter, state } = createFakeScimDb({
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
      subscriptions: [subscription('enterprise', 'canceled')],
    });
    getDb.current = adapter as unknown as DatabaseAdapter;
    expect(state.subscriptions[0]?.['status']).toBe('canceled');

    expect((await connectionsGet(jsonRequest(LIST_URL))).status).toBe(403);
  });

  it('allows an enterprise owner through', async () => {
    seed();
    const response = await connectionsGet(jsonRequest(LIST_URL));
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body['organization_id']).toBe(ORG);
    expect(body['scim_base_url']).toBe('https://app.example.com/api/scim/v2');
    expect(Array.isArray(body['connections'])).toBe(true);
  });

  it('rejects an unauthenticated caller before any plan lookup', async () => {
    seed();
    mockGetClerkAuthUser.mockRejectedValueOnce(new Error('no session'));
    expect((await connectionsGet(jsonRequest(LIST_URL))).status).toBe(401);
  });

  it('rejects a caller who is only a plain member of the organization', async () => {
    seed({ roles: [{ organization_id: ORG, role: 'member' }] });
    expect((await connectionsGet(jsonRequest(LIST_URL))).status).toBe(403);
  });
});

describe('directory sync organization resolution', () => {
  it('refuses to guess when the caller administers several organizations', async () => {
    seed({
      roles: [
        { organization_id: ORG, role: 'owner' },
        { organization_id: SECOND_ORG, role: 'admin' },
      ],
    });

    const response = await connectionsGet(jsonRequest(LIST_URL));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      organizationIds: expect.arrayContaining([ORG, SECOND_ORG]),
    });
  });

  it('honours an explicitly named organization', async () => {
    seed({
      roles: [
        { organization_id: ORG, role: 'owner' },
        { organization_id: SECOND_ORG, role: 'admin' },
      ],
    });

    const response = await connectionsGet(jsonRequest(`${LIST_URL}?organizationId=${SECOND_ORG}`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ organization_id: SECOND_ORG });
  });

  it('refuses an organization the caller does not administer', async () => {
    seed({ roles: [{ organization_id: ORG, role: 'owner' }] });
    const response = await connectionsGet(jsonRequest(`${LIST_URL}?organizationId=${SECOND_ORG}`));
    expect(response.status).toBe(403);
  });

  it('rejects a non-UUID organizationId instead of passing it to Postgres', async () => {
    seed();
    expect(
      (await connectionsGet(jsonRequest(`${LIST_URL}?organizationId=not-a-uuid`))).status,
    ).toBe(400);
  });
});

describe('SCIM token administration', () => {
  it('returns the raw token exactly once and never again', async () => {
    const state = seed();

    const minted = await tokensPost(
      jsonRequest(TOKENS_URL, 'POST', { connectionId: CONNECTION, name: 'Okta production' }),
    );
    expect(minted.status).toBe(201);

    const body = (await minted.json()) as Record<string, any>;
    expect(body['raw_token']).toMatch(/^scim_[0-9a-f]{16}_[0-9a-f]{48}$/);
    expect(body['scim_base_url']).toBe('https://app.example.com/api/scim/v2');
    expect(body['token']).not.toHaveProperty('token_hash');

    expect(state.scim_tokens).toHaveLength(1);
    expect(String(state.scim_tokens[0]?.['token_hash'])).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(state.scim_tokens[0])).not.toContain(body['raw_token']);

    const listed = await tokensGet(jsonRequest(TOKENS_URL));
    const listBody = (await listed.json()) as Record<string, any>;
    expect(listBody['tokens']).toHaveLength(1);
    expect(JSON.stringify(listBody)).not.toContain(body['raw_token']);
    expect(listBody['tokens'][0]).not.toHaveProperty('token_hash');
  });

  it('refuses to mint a token against another tenant’s connection', async () => {
    const state = seed();
    const response = await tokensPost(
      jsonRequest(TOKENS_URL, 'POST', { connectionId: FOREIGN_CONNECTION, name: 'Sneaky' }),
    );
    expect(response.status).toBe(404);
    expect(state.scim_tokens).toHaveLength(0);
  });

  it('validates the mint payload', async () => {
    seed();
    for (const body of [
      { name: 'Okta' },
      { connectionId: 'not-a-uuid', name: 'Okta' },
      { connectionId: CONNECTION },
      { connectionId: CONNECTION, name: '' },
      { connectionId: CONNECTION, name: 'x'.repeat(121) },
      { connectionId: CONNECTION, name: 'Okta', expiresAt: 'yesterday' },
      { connectionId: CONNECTION, name: 'Okta', expiresAt: '2020-01-01T00:00:00.000Z' },
    ]) {
      const response = await tokensPost(jsonRequest(TOKENS_URL, 'POST', body));
      expect(response.status).toBe(400);
    }
  });

  it('revokes a token and refuses to revoke another tenant’s', async () => {
    const state = seed();
    const minted = await tokensPost(
      jsonRequest(TOKENS_URL, 'POST', { connectionId: CONNECTION, name: 'Okta' }),
    );
    const tokenId = String(((await minted.json()) as Record<string, any>)['token']['id']);

    const revoked = await tokenDelete(jsonRequest(`${TOKENS_URL}/${tokenId}`, 'DELETE'), {
      params: Promise.resolve({ tokenId }),
    });
    expect(revoked.status).toBe(200);
    expect(state.scim_tokens[0]?.['revoked_at']).not.toBeNull();

    const again = await tokenDelete(jsonRequest(`${TOKENS_URL}/${tokenId}`, 'DELETE'), {
      params: Promise.resolve({ tokenId }),
    });
    expect(again.status).toBe(404);

    const bogus = await tokenDelete(jsonRequest(`${TOKENS_URL}/not-a-uuid`, 'DELETE'), {
      params: Promise.resolve({ tokenId: 'not-a-uuid' }),
    });
    expect(bogus.status).toBe(404);
  });

  it('refuses token administration below the enterprise plan', async () => {
    const state = seed({ planTier: 'team' });
    expect((await tokensGet(jsonRequest(TOKENS_URL))).status).toBe(403);
    expect(
      (
        await tokenDelete(jsonRequest(`${TOKENS_URL}/${CONNECTION}`, 'DELETE'), {
          params: Promise.resolve({ tokenId: CONNECTION }),
        })
      ).status,
    ).toBe(403);
    expect(state.scim_tokens).toHaveLength(0);
  });
});

describe('directory sync connection CRUD', () => {
  it('creates a connection scoped to the caller’s organization', async () => {
    const state = seed();
    const response = await connectionsPost(
      jsonRequest(LIST_URL, 'POST', {
        provider: 'azure_ad',
        directory_id: 'dir-entra',
        display_name: 'Entra',
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      scim_base_url: 'https://app.example.com/api/scim/v2',
    });
    expect(state.directory_sync_connections).toHaveLength(3);
    expect(state.directory_sync_connections[2]).toMatchObject({ organization_id: ORG });
  });

  it('rejects an unlisted provider', async () => {
    seed();
    const response = await connectionsPost(
      jsonRequest(LIST_URL, 'POST', { provider: 'evil_idp', directory_id: 'dir-x' }),
    );
    expect(response.status).toBe(400);
  });

  it('cannot delete another tenant’s connection', async () => {
    const state = seed();
    const response = await connectionDelete(
      jsonRequest(`${LIST_URL}?id=${FOREIGN_CONNECTION}`, 'DELETE'),
    );
    expect(response.status).toBe(404);
    expect(state.directory_sync_connections).toHaveLength(2);
  });
});
