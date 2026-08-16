import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockWithRateLimit = vi.fn(async () => null);
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (...args: unknown[]) => mockWithRateLimit(...(args as [])),
}));

const { getDb } = vi.hoisted(() => {
  const holder: { current: unknown } = { current: null };
  return {
    getDb: holder,
  };
});

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => getDb.current,
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createFakeScimDb, type FakeScimDbState } from './fake-scim-db';
import { createScimToken } from '@/lib/server/scim/scim-token-service';
import { SCIM_SCHEMA } from '@/lib/server/scim/scim-protocol';

import { GET as usersGet, POST as usersPost } from '../Users/route';
import {
  DELETE as userDelete,
  GET as userGet,
  PATCH as userPatch,
  PUT as userPut,
} from '../Users/[userId]/route';
import { GET as groupsGet, POST as groupsPost } from '../Groups/route';
import { PATCH as groupPatch } from '../Groups/[groupId]/route';
import { GET as serviceProviderConfigGet } from '../ServiceProviderConfig/route';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const CONNECTION = '33333333-3333-4333-8333-333333333333';
const OTHER_CONNECTION = '44444444-4444-4444-8444-444444444444';
const ADMIN = 'admin-user';

const BASE = 'https://app.example.com/api/scim/v2';

interface Harness {
  state: FakeScimDbState;
  adapter: DatabaseAdapter;
  rawToken: string;
}

async function harness(
  options: {
    planTier?: string;
    subscriptionStatus?: string;
    withSubscription?: boolean;
    adminRole?: 'owner' | 'admin' | 'member';
    connectionActive?: boolean;
  } = {},
): Promise<Harness> {
  const {
    planTier = 'enterprise',
    subscriptionStatus = 'active',
    withSubscription = true,
    adminRole = 'owner',
    connectionActive = true,
  } = options;

  const { adapter, state } = createFakeScimDb({
    directory_sync_connections: [
      {
        id: CONNECTION,
        organization_id: ORG,
        provider: 'okta',
        directory_id: 'dir-1',
        display_name: 'Okta',
        is_active: connectionActive,
        last_sync_at: null,
      },
      {
        id: OTHER_CONNECTION,
        organization_id: OTHER_ORG,
        provider: 'okta',
        directory_id: 'dir-2',
        display_name: 'Other tenant Okta',
        is_active: true,
        last_sync_at: null,
      },
    ],
    organization_members: [
      {
        organization_id: ORG,
        user_id: ADMIN,
        role: adminRole,
        provisioning_source: 'manual',
        provisioned_at: null,
        joined_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    subscriptions: withSubscription
      ? [
          {
            id: 'sub-1',
            user_id: ADMIN,
            plan_tier: planTier,
            status: subscriptionStatus,
            current_period_start: '2026-01-01T00:00:00.000Z',
            current_period_end: '2027-01-01T00:00:00.000Z',
            stripe_subscription_id: 'sub_stripe',
            stripe_price_id: null,
            apple_original_transaction_id: null,
            google_purchase_token: null,
          },
        ]
      : [],
  });

  const db = adapter as unknown as DatabaseAdapter;
  getDb.current = db;

  const { rawToken } = await createScimToken(db, {
    connectionId: CONNECTION,
    organizationId: ORG,
    name: 'Okta production',
    createdByUserId: ADMIN,
  });

  return { state, adapter: db, rawToken };
}

function scimRequest(
  path: string,
  init: { method?: string; token?: string | null; body?: unknown } = {},
) {
  const headers = new Headers({ 'content-type': 'application/scim+json' });
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  return new Request(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  }) as never;
}

function userPayload(overrides: Record<string, unknown> = {}) {
  return {
    schemas: [SCIM_SCHEMA.user],
    userName: 'ada@example.com',
    name: { givenName: 'Ada', familyName: 'Lovelace' },
    emails: [{ value: 'ada@example.com', primary: true }],
    active: true,
    externalId: 'okta-ada',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWithRateLimit.mockResolvedValue(null);
});

describe('SCIM authentication', () => {
  it('refuses a request with no Authorization header', async () => {
    await harness();
    const response = await usersGet(scimRequest('/Users'));

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toBe('application/scim+json');
    expect(response.headers.get('www-authenticate')).toBe('Bearer realm="scim"');
    await expect(response.json()).resolves.toMatchObject({
      schemas: [SCIM_SCHEMA.error],
      status: '401',
    });
  });

  it('refuses an unknown bearer token', async () => {
    await harness();
    const response = await usersGet(
      scimRequest('/Users', { token: `scim_${'ab'.repeat(8)}_${'cd'.repeat(24)}` }),
    );
    expect(response.status).toBe(401);
  });

  it('refuses a Clerk-shaped or API-key-shaped credential', async () => {
    await harness();
    for (const token of ['sk_live_deadbeefdeadbeef_secret', 'eyJhbGciOiJIUzI1NiJ9.body.sig']) {
      const response = await usersGet(scimRequest('/Users', { token }));
      expect(response.status).toBe(401);
    }
  });

  it('gives the same 401 whether the token is unknown, revoked, or has a bad secret', async () => {
    const { state, rawToken } = await harness();

    const unknown = await usersGet(
      scimRequest('/Users', { token: `scim_${'11'.repeat(8)}_${'22'.repeat(24)}` }),
    );
    const badSecret = await usersGet(
      scimRequest('/Users', {
        token: `${rawToken.slice(0, -1)}${rawToken.endsWith('a') ? 'b' : 'a'}`,
      }),
    );

    state.scim_tokens[0]!['revoked_at'] = new Date().toISOString();
    const revoked = await usersGet(scimRequest('/Users', { token: rawToken }));

    const bodies = await Promise.all([unknown.json(), badSecret.json(), revoked.json()]);
    expect(unknown.status).toBe(401);
    expect(badSecret.status).toBe(401);
    expect(revoked.status).toBe(401);
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[1]).toEqual(bodies[2]);
  });

  it('refuses a mutating call with no credential without writing anything', async () => {
    const { state } = await harness();
    const response = await usersPost(
      scimRequest('/Users', { method: 'POST', body: userPayload() }),
    );

    expect(response.status).toBe(401);
    expect(state.scim_provisioned_users).toHaveLength(0);
    expect(state.organization_members).toHaveLength(1);
  });

  it('gates the discovery documents on the same credential', async () => {
    const { rawToken } = await harness();

    expect((await serviceProviderConfigGet(scimRequest('/ServiceProviderConfig'))).status).toBe(
      401,
    );

    const ok = await serviceProviderConfigGet(
      scimRequest('/ServiceProviderConfig', { token: rawToken }),
    );
    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toMatchObject({ patch: { supported: true } });
  });
});

describe('SCIM entitlement gate', () => {
  it.each([
    ['free', 'free'],
    ['pro', 'pro'],
    ['team', 'team'],
    ['business', 'business'],
  ])('refuses a %s plan — enterprise_controls is enterprise-only', async (_label, planTier) => {
    const { rawToken, state } = await harness({ planTier });

    const response = await usersPost(
      scimRequest('/Users', { method: 'POST', token: rawToken, body: userPayload() }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      schemas: [SCIM_SCHEMA.error],
      status: '403',
      detail: 'Directory sync requires an active Enterprise subscription',
    });
    expect(state.scim_provisioned_users).toHaveLength(0);
  });

  it('fails closed when the issuing admin has no subscription row at all', async () => {
    const { rawToken } = await harness({ withSubscription: false });
    const response = await usersGet(scimRequest('/Users', { token: rawToken }));
    expect(response.status).toBe(403);
  });

  it('fails closed the moment an enterprise subscription lapses', async () => {
    const { rawToken, state } = await harness();

    expect((await usersGet(scimRequest('/Users', { token: rawToken }))).status).toBe(200);

    state.subscriptions[0]!['status'] = 'canceled';

    expect((await usersGet(scimRequest('/Users', { token: rawToken }))).status).toBe(403);
  });

  it('records a denial so an admin can explain the outage', async () => {
    const { rawToken, state } = await harness({ planTier: 'team' });
    await usersGet(scimRequest('/Users', { token: rawToken }));

    expect(state.directory_sync_events).toHaveLength(1);
    expect(state.directory_sync_events[0]).toMatchObject({
      organization_id: ORG,
      event_type: 'sync.denied',
    });
    expect(String(state.directory_sync_events[0]?.['error'])).toContain('Enterprise');
  });

  it('stops provisioning when the issuing admin loses their admin role', async () => {
    const { rawToken, state } = await harness();

    expect((await usersGet(scimRequest('/Users', { token: rawToken }))).status).toBe(200);

    state.organization_members[0]!['role'] = 'member';

    const response = await usersGet(scimRequest('/Users', { token: rawToken }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      detail: expect.stringContaining('no longer administers'),
    });
  });

  it('refuses a token whose connection has been disabled', async () => {
    const { rawToken } = await harness({ connectionActive: false });
    const response = await usersGet(scimRequest('/Users', { token: rawToken }));
    expect(response.status).toBe(403);
  });

  it('refuses a token whose connection has been deleted', async () => {
    const { rawToken, state } = await harness();
    state.directory_sync_connections = state.directory_sync_connections.filter(
      (row) => row['id'] !== CONNECTION,
    );
    expect((await usersGet(scimRequest('/Users', { token: rawToken }))).status).toBe(401);
  });
});

describe('SCIM provision -> update -> deprovision', () => {
  it('grants a real organization membership when the person already has an account', async () => {
    const { rawToken, state } = await harness();
    state.profiles.push({ id: 'clerk_ada', email: 'Ada@Example.com' });

    const created = await usersPost(
      scimRequest('/Users', { method: 'POST', token: rawToken, body: userPayload() }),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as Record<string, any>;

    expect(createdBody).toMatchObject({
      schemas: [SCIM_SCHEMA.user],
      userName: 'ada@example.com',
      active: true,
    });
    expect(createdBody['id']).toBeTruthy();
    expect(created.headers.get('location')).toBe(`${BASE}/Users/${createdBody['id']}`);
    expect(createdBody['urn:agiworkforce:params:scim:schemas:extension:2.0:Provisioning']).toEqual({
      linked: true,
      membershipGranted: true,
    });

    const membership = state.organization_members.find((row) => row['user_id'] === 'clerk_ada');
    expect(membership).toMatchObject({
      organization_id: ORG,
      role: 'member',
      provisioning_source: 'scim',
    });
    expect(state.directory_sync_connections[0]?.['last_sync_at']).not.toBeNull();

    const scimUserId = String(createdBody['id']);

    const probe = await usersGet(
      scimRequest(`/Users?filter=${encodeURIComponent('userName eq "ada@example.com"')}`, {
        token: rawToken,
      }),
    );
    expect(probe.status).toBe(200);
    await expect(probe.json()).resolves.toMatchObject({
      schemas: [SCIM_SCHEMA.listResponse],
      totalResults: 1,
      itemsPerPage: 1,
    });

    const patched = await userPatch(
      scimRequest(`/Users/${scimUserId}`, {
        method: 'PATCH',
        token: rawToken,
        body: {
          schemas: [SCIM_SCHEMA.patchOp],
          Operations: [{ op: 'replace', path: 'name.familyName', value: 'Byron' }],
        },
      }),
      { params: Promise.resolve({ userId: scimUserId }) },
    );
    expect(patched.status).toBe(200);
    await expect(patched.json()).resolves.toMatchObject({
      name: { familyName: 'Byron' },
      active: true,
    });
    expect(state.organization_members.some((row) => row['user_id'] === 'clerk_ada')).toBe(true);

    const deactivated = await userPatch(
      scimRequest(`/Users/${scimUserId}`, {
        method: 'PATCH',
        token: rawToken,
        body: {
          schemas: [SCIM_SCHEMA.patchOp],
          Operations: [{ op: 'replace', path: 'active', value: false }],
        },
      }),
      { params: Promise.resolve({ userId: scimUserId }) },
    );
    expect(deactivated.status).toBe(200);
    await expect(deactivated.json()).resolves.toMatchObject({ active: false });

    expect(state.organization_members.some((row) => row['user_id'] === 'clerk_ada')).toBe(false);
    expect(state.scim_provisioned_users).toHaveLength(1);

    const reactivated = await userPatch(
      scimRequest(`/Users/${scimUserId}`, {
        method: 'PATCH',
        token: rawToken,
        body: {
          schemas: [SCIM_SCHEMA.patchOp],
          Operations: [{ op: 'replace', value: { active: true } }],
        },
      }),
      { params: Promise.resolve({ userId: scimUserId }) },
    );
    expect(reactivated.status).toBe(200);
    expect(state.organization_members.some((row) => row['user_id'] === 'clerk_ada')).toBe(true);

    const deleted = await userDelete(
      scimRequest(`/Users/${scimUserId}`, { method: 'DELETE', token: rawToken }),
      { params: Promise.resolve({ userId: scimUserId }) },
    );
    expect(deleted.status).toBe(204);
    expect(state.scim_provisioned_users).toHaveLength(0);
    expect(state.organization_members.some((row) => row['user_id'] === 'clerk_ada')).toBe(false);

    expect(state.directory_sync_events.map((row) => row['event_type'])).toEqual([
      'user.provisioned',
      'user.updated',
      'user.deactivated',
      'user.updated',
      'user.deprovisioned',
    ]);

    const gone = await userGet(scimRequest(`/Users/${scimUserId}`, { token: rawToken }), {
      params: Promise.resolve({ userId: scimUserId }),
    });
    expect(gone.status).toBe(404);
  });

  it('creates an honest PENDING resource when the person has no AGI account yet', async () => {
    const { rawToken, state } = await harness();

    const created = await usersPost(
      scimRequest('/Users', {
        method: 'POST',
        token: rawToken,
        body: userPayload({ userName: 'nobody@example.com', emails: undefined }),
      }),
    );

    expect(created.status).toBe(201);
    const body = (await created.json()) as Record<string, any>;
    expect(body['urn:agiworkforce:params:scim:schemas:extension:2.0:Provisioning']).toEqual({
      linked: false,
      membershipGranted: false,
    });
    expect(state.scim_provisioned_users).toHaveLength(1);
    expect(state.organization_members).toHaveLength(1);

    const scimUserId = String(body['id']);
    const deleted = await userDelete(
      scimRequest(`/Users/${scimUserId}`, { method: 'DELETE', token: rawToken }),
      { params: Promise.resolve({ userId: scimUserId }) },
    );
    expect(deleted.status).toBe(204);
    expect(state.scim_provisioned_users).toHaveLength(0);
  });

  it('links a pending resource once the account exists and PUT re-runs reconciliation', async () => {
    const { rawToken, state } = await harness();

    const created = await usersPost(
      scimRequest('/Users', {
        method: 'POST',
        token: rawToken,
        body: userPayload({
          userName: 'late@example.com',
          emails: [{ value: 'late@example.com' }],
        }),
      }),
    );
    const scimUserId = String(((await created.json()) as Record<string, any>)['id']);
    expect(state.organization_members).toHaveLength(1);

    state.profiles.push({ id: 'clerk_late', email: 'late@example.com' });

    const replaced = await userPut(
      scimRequest(`/Users/${scimUserId}`, {
        method: 'PUT',
        token: rawToken,
        body: userPayload({
          userName: 'late@example.com',
          emails: [{ value: 'late@example.com', primary: true }],
        }),
      }),
      { params: Promise.resolve({ userId: scimUserId }) },
    );

    expect(replaced.status).toBe(200);
    expect(state.organization_members.some((row) => row['user_id'] === 'clerk_late')).toBe(true);
  });

  it('refuses a duplicate userName with SCIM uniqueness rather than a 500', async () => {
    const { rawToken } = await harness();
    await usersPost(
      scimRequest('/Users', { method: 'POST', token: rawToken, body: userPayload() }),
    );

    const duplicate = await usersPost(
      scimRequest('/Users', {
        method: 'POST',
        token: rawToken,
        body: userPayload({ userName: 'ADA@example.com' }),
      }),
    );

    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({ scimType: 'uniqueness' });
  });

  it('never removes an organization owner, whatever the IdP says', async () => {
    const { rawToken, state } = await harness();
    state.profiles.push({ id: ADMIN, email: 'owner@example.com' });

    const created = await usersPost(
      scimRequest('/Users', {
        method: 'POST',
        token: rawToken,
        body: userPayload({
          userName: 'owner@example.com',
          emails: [{ value: 'owner@example.com', primary: true }],
        }),
      }),
    );
    const scimUserId = String(((await created.json()) as Record<string, any>)['id']);

    expect(state.organization_members[0]).toMatchObject({ user_id: ADMIN, role: 'owner' });

    await userDelete(scimRequest(`/Users/${scimUserId}`, { method: 'DELETE', token: rawToken }), {
      params: Promise.resolve({ userId: scimUserId }),
    });
    expect(state.organization_members).toHaveLength(1);
    expect(state.organization_members[0]).toMatchObject({ user_id: ADMIN, role: 'owner' });
  });

  it('rejects an unrecognised PATCH path instead of returning 200 and changing nothing', async () => {
    const { rawToken } = await harness();
    const created = await usersPost(
      scimRequest('/Users', { method: 'POST', token: rawToken, body: userPayload() }),
    );
    const scimUserId = String(((await created.json()) as Record<string, any>)['id']);

    const response = await userPatch(
      scimRequest(`/Users/${scimUserId}`, {
        method: 'PATCH',
        token: rawToken,
        body: {
          schemas: [SCIM_SCHEMA.patchOp],
          Operations: [{ op: 'replace', path: 'linked_user_id', value: 'someone-else' }],
        },
      }),
      { params: Promise.resolve({ userId: scimUserId }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ scimType: 'invalidPath' });
  });
});

describe('SCIM tenant isolation', () => {
  it('cannot read or mutate another tenant’s resource by id', async () => {
    const { rawToken, state } = await harness();

    const foreignId = '99999999-9999-4999-8999-999999999999';
    state.scim_provisioned_users.push({
      id: foreignId,
      connection_id: OTHER_CONNECTION,
      organization_id: OTHER_ORG,
      external_id: null,
      user_name: 'victim@other.example.com',
      email: 'victim@other.example.com',
      given_name: null,
      family_name: null,
      display_name: null,
      active: true,
      linked_user_id: 'clerk_victim',
      linked_at: null,
      raw_attributes: null,
      version: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    state.organization_members.push({
      organization_id: OTHER_ORG,
      user_id: 'clerk_victim',
      role: 'member',
      provisioning_source: 'manual',
      provisioned_at: null,
      joined_at: '2026-01-01T00:00:00.000Z',
    });

    const read = await userGet(scimRequest(`/Users/${foreignId}`, { token: rawToken }), {
      params: Promise.resolve({ userId: foreignId }),
    });
    expect(read.status).toBe(404);

    const destroy = await userDelete(
      scimRequest(`/Users/${foreignId}`, { method: 'DELETE', token: rawToken }),
      { params: Promise.resolve({ userId: foreignId }) },
    );
    expect(destroy.status).toBe(404);

    expect(state.organization_members.some((row) => row['user_id'] === 'clerk_victim')).toBe(true);
    expect(state.scim_provisioned_users).toHaveLength(1);
  });

  it('never lists another tenant’s users', async () => {
    const { rawToken, state } = await harness();
    state.scim_provisioned_users.push({
      id: '99999999-9999-4999-8999-999999999998',
      connection_id: OTHER_CONNECTION,
      organization_id: OTHER_ORG,
      external_id: null,
      user_name: 'victim@other.example.com',
      email: null,
      given_name: null,
      family_name: null,
      display_name: null,
      active: true,
      linked_user_id: null,
      linked_at: null,
      raw_attributes: null,
      version: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });

    const response = await usersGet(scimRequest('/Users', { token: rawToken }));
    await expect(response.json()).resolves.toMatchObject({ totalResults: 0, Resources: [] });
  });
});

describe('SCIM listing', () => {
  it('paginates with 1-based startIndex and reports the full total', async () => {
    const { rawToken } = await harness();

    for (const name of ['a@example.com', 'b@example.com', 'c@example.com']) {
      await usersPost(
        scimRequest('/Users', {
          method: 'POST',
          token: rawToken,
          body: userPayload({ userName: name, emails: [{ value: name, primary: true }] }),
        }),
      );
    }

    const page = await usersGet(scimRequest('/Users?startIndex=2&count=2', { token: rawToken }));
    const body = (await page.json()) as Record<string, any>;

    expect(body).toMatchObject({ totalResults: 3, startIndex: 2, itemsPerPage: 2 });
    expect(body['Resources'].map((r: Record<string, unknown>) => r['userName'])).toEqual([
      'b@example.com',
      'c@example.com',
    ]);
  });

  it('returns an empty list rather than a 404 when the probe finds nothing', async () => {
    const { rawToken } = await harness();
    const response = await usersGet(
      scimRequest(`/Users?filter=${encodeURIComponent('userName eq "ghost@example.com"')}`, {
        token: rawToken,
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ totalResults: 0, Resources: [] });
  });

  it('rejects an unsupported filter with invalidFilter', async () => {
    const { rawToken } = await harness();
    const response = await usersGet(
      scimRequest(`/Users?filter=${encodeURIComponent('userName sw "a"')}`, { token: rawToken }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ scimType: 'invalidFilter' });
  });
});

describe('SCIM groups', () => {
  it('promotes a member when they join a group mapped to admin, and demotes on removal', async () => {
    const { rawToken, state } = await harness();
    state.profiles.push({ id: 'clerk_ada', email: 'ada@example.com' });

    const createdUser = await usersPost(
      scimRequest('/Users', { method: 'POST', token: rawToken, body: userPayload() }),
    );
    const scimUserId = String(((await createdUser.json()) as Record<string, any>)['id']);
    expect(state.organization_members.find((row) => row['user_id'] === 'clerk_ada')?.['role']).toBe(
      'member',
    );

    const createdGroup = await groupsPost(
      scimRequest('/Groups', {
        method: 'POST',
        token: rawToken,
        body: { schemas: [SCIM_SCHEMA.group], displayName: 'Engineering Admins' },
      }),
    );
    expect(createdGroup.status).toBe(201);
    const groupId = String(((await createdGroup.json()) as Record<string, any>)['id']);

    state.scim_groups[0]!['mapped_role'] = 'admin';

    const added = await groupPatch(
      scimRequest(`/Groups/${groupId}`, {
        method: 'PATCH',
        token: rawToken,
        body: {
          schemas: [SCIM_SCHEMA.patchOp],
          Operations: [{ op: 'add', path: 'members', value: [{ value: scimUserId }] }],
        },
      }),
      { params: Promise.resolve({ groupId }) },
    );
    expect(added.status).toBe(200);
    expect(state.organization_members.find((row) => row['user_id'] === 'clerk_ada')?.['role']).toBe(
      'admin',
    );

    const removed = await groupPatch(
      scimRequest(`/Groups/${groupId}`, {
        method: 'PATCH',
        token: rawToken,
        body: {
          schemas: [SCIM_SCHEMA.patchOp],
          Operations: [{ op: 'remove', path: 'members', value: [{ value: scimUserId }] }],
        },
      }),
      { params: Promise.resolve({ groupId }) },
    );
    expect(removed.status).toBe(200);
    expect(state.organization_members.find((row) => row['user_id'] === 'clerk_ada')?.['role']).toBe(
      'member',
    );
  });

  it('never demotes a manually-appointed admin that SCIM did not create', async () => {
    const { rawToken, state } = await harness();
    state.profiles.push({ id: 'clerk_manual', email: 'manual@example.com' });
    state.organization_members.push({
      organization_id: ORG,
      user_id: 'clerk_manual',
      role: 'admin',
      provisioning_source: 'manual',
      provisioned_at: null,
      joined_at: '2026-01-01T00:00:00.000Z',
    });

    await usersPost(
      scimRequest('/Users', {
        method: 'POST',
        token: rawToken,
        body: userPayload({
          userName: 'manual@example.com',
          emails: [{ value: 'manual@example.com', primary: true }],
        }),
      }),
    );

    expect(
      state.organization_members.find((row) => row['user_id'] === 'clerk_manual')?.['role'],
    ).toBe('admin');
  });

  it('refuses a member id belonging to another tenant', async () => {
    const { rawToken, state } = await harness();

    const createdGroup = await groupsPost(
      scimRequest('/Groups', {
        method: 'POST',
        token: rawToken,
        body: { schemas: [SCIM_SCHEMA.group], displayName: 'Engineers' },
      }),
    );
    const groupId = String(((await createdGroup.json()) as Record<string, any>)['id']);

    const foreignId = '99999999-9999-4999-8999-999999999997';
    state.scim_provisioned_users.push({
      id: foreignId,
      connection_id: OTHER_CONNECTION,
      organization_id: OTHER_ORG,
      user_name: 'victim@other.example.com',
      external_id: null,
      email: null,
      given_name: null,
      family_name: null,
      display_name: null,
      active: true,
      linked_user_id: null,
      linked_at: null,
      raw_attributes: null,
      version: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });

    const response = await groupPatch(
      scimRequest(`/Groups/${groupId}`, {
        method: 'PATCH',
        token: rawToken,
        body: {
          schemas: [SCIM_SCHEMA.patchOp],
          Operations: [{ op: 'add', path: 'members', value: [{ value: foreignId }] }],
        },
      }),
      { params: Promise.resolve({ groupId }) },
    );

    expect(response.status).toBe(400);
    expect(state.scim_group_members).toHaveLength(0);
  });

  it('supports the displayName existence probe on groups', async () => {
    const { rawToken } = await harness();
    await groupsPost(
      scimRequest('/Groups', {
        method: 'POST',
        token: rawToken,
        body: { schemas: [SCIM_SCHEMA.group], displayName: 'Engineers' },
      }),
    );

    const response = await groupsGet(
      scimRequest(`/Groups?filter=${encodeURIComponent('displayName eq "engineers"')}`, {
        token: rawToken,
      }),
    );
    await expect(response.json()).resolves.toMatchObject({ totalResults: 1 });
  });
});
