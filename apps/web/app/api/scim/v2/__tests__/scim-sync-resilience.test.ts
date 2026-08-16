
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockWithRateLimit = vi.fn(async () => null as Response | null);
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (...args: unknown[]) => mockWithRateLimit(...(args as [])),
}));

const { getDb } = vi.hoisted(() => ({ getDb: { current: null as unknown } }));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => getDb.current,
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createFakeScimDb, type FakeScimDbState } from './fake-scim-db';
import { createScimToken } from '@/lib/server/scim/scim-token-service';
import { SCIM_SCHEMA } from '@/lib/server/scim/scim-protocol';

import { POST as usersPost } from '../Users/route';
import { DELETE as userDelete, GET as userGet, PATCH as userPatch } from '../Users/[userId]/route';
import { POST as groupsPost } from '../Groups/route';
import {
  DELETE as groupDelete,
  PATCH as groupPatch,
  PUT as groupPut,
} from '../Groups/[groupId]/route';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONNECTION = '33333333-3333-4333-8333-333333333333';
const ADMIN = 'admin-user';
const BASE = 'https://app.example.com/api/scim/v2';

const ABSENT_MEMBER_ID = '99999999-9999-4999-8999-999999999999';

interface Harness {
  state: FakeScimDbState;
  adapter: DatabaseAdapter;
  rawToken: string;
}

async function harness(): Promise<Harness> {
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
      },
    ],
    organization_members: [
      {
        organization_id: ORG,
        user_id: ADMIN,
        role: 'owner',
        provisioning_source: 'manual',
        provisioned_at: null,
        joined_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    subscriptions: [
      {
        id: 'sub-1',
        user_id: ADMIN,
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

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function provisionLinkedUser(
  h: Harness,
  overrides: Record<string, unknown> = {},
  profile: { id: string; email: string } = { id: 'clerk_ada', email: 'ada@example.com' },
): Promise<string> {
  h.state.profiles.push({ id: profile.id, email: profile.email });
  const created = await usersPost(
    scimRequest('/Users', { method: 'POST', token: h.rawToken, body: userPayload(overrides) }),
  );
  expect(created.status).toBe(201);
  return String((await body(created))['id']);
}

function memberRole(state: FakeScimDbState, userId: string): unknown {
  return state.organization_members.find((row) => row['user_id'] === userId)?.['role'];
}

function failStatementsMatching(h: Harness, needle: string): void {
  const adapter = h.adapter as unknown as {
    query: (sql: string, params?: unknown[]) => Promise<unknown>;
    execute: (sql: string, params?: unknown[]) => Promise<number>;
  };
  const realExecute = adapter.execute.bind(adapter);
  adapter.execute = async (sql: string, params?: unknown[]) => {
    if (sql.replace(/\s+/gu, ' ').toLowerCase().includes(needle)) {
      throw new Error(`injected failure: ${needle}`);
    }
    return realExecute(sql, params);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWithRateLimit.mockResolvedValue(null);
});

describe('SCIM user writes are all-or-nothing', () => {
  it('leaves no unprovisionable resource behind when the membership write fails', async () => {
    const h = await harness();
    h.state.profiles.push({ id: 'clerk_ada', email: 'ada@example.com' });
    failStatementsMatching(h, 'insert into organization_members');

    const response = await usersPost(
      scimRequest('/Users', { method: 'POST', token: h.rawToken, body: userPayload() }),
    );

    expect(response.status).toBe(500);

    expect(h.state.scim_provisioned_users).toHaveLength(0);
    expect(memberRole(h.state, 'clerk_ada')).toBeUndefined();
  });

  it('does not report a deprovision it failed to carry out', async () => {
    const h = await harness();
    const memberId = await provisionLinkedUser(h);
    expect(memberRole(h.state, 'clerk_ada')).toBe('member');

    failStatementsMatching(h, 'delete from organization_members');

    const response = await userPatch(
      scimRequest(`/Users/${memberId}`, {
        method: 'PATCH',
        token: h.rawToken,
        body: {
          schemas: [SCIM_SCHEMA.patchOp],
          Operations: [{ op: 'replace', path: 'active', value: false }],
        },
      }),
      { params: Promise.resolve({ userId: memberId }) },
    );

    expect(response.status).toBe(500);

    expect(h.state.scim_provisioned_users[0]!['active']).toBe(true);
    expect(memberRole(h.state, 'clerk_ada')).toBe('member');
  });
});

describe('SCIM group writes are all-or-nothing', () => {
  it('leaves no orphan group when a create names a member that does not exist', async () => {
    const h = await harness();
    const memberId = await provisionLinkedUser(h);

    const response = await groupsPost(
      scimRequest('/Groups', {
        method: 'POST',
        token: h.rawToken,
        body: {
          schemas: [SCIM_SCHEMA.group],
          displayName: 'Engineering',
          members: [{ value: memberId }, { value: ABSENT_MEMBER_ID }],
        },
      }),
    );

    expect(response.status).toBe(400);

    expect(h.state.scim_groups).toHaveLength(0);
    expect(h.state.scim_group_members).toHaveLength(0);
  });

  it('keeps the previous member set when a PUT names a member that does not exist', async () => {
    const h = await harness();
    const memberId = await provisionLinkedUser(h);

    const created = await groupsPost(
      scimRequest('/Groups', {
        method: 'POST',
        token: h.rawToken,
        body: {
          schemas: [SCIM_SCHEMA.group],
          displayName: 'Engineering',
          members: [{ value: memberId }],
        },
      }),
    );
    const groupId = String((await body(created))['id']);
    h.state.scim_groups[0]!['mapped_role'] = 'admin';

    await groupPatch(
      scimRequest(`/Groups/${groupId}`, {
        method: 'PATCH',
        token: h.rawToken,
        body: {
          schemas: [SCIM_SCHEMA.patchOp],
          Operations: [{ op: 'add', path: 'members', value: [{ value: memberId }] }],
        },
      }),
      { params: Promise.resolve({ groupId }) },
    );
    expect(memberRole(h.state, 'clerk_ada')).toBe('admin');

    const response = await groupPut(
      scimRequest(`/Groups/${groupId}`, {
        method: 'PUT',
        token: h.rawToken,
        body: {
          schemas: [SCIM_SCHEMA.group],
          members: [{ value: ABSENT_MEMBER_ID }, { value: memberId }],
          displayName: 'Renamed By A Doomed Request',
        },
      }),
      { params: Promise.resolve({ groupId }) },
    );

    expect(response.status).toBe(400);

    expect(h.state.scim_group_members).toHaveLength(1);
    expect(h.state.scim_group_members[0]!['scim_user_id']).toBe(memberId);
    expect(memberRole(h.state, 'clerk_ada')).toBe('admin');
    expect(h.state.scim_groups[0]!['display_name']).toBe('Engineering');
  });

  it('does not apply the earlier operations of a PATCH whose later operation fails', async () => {
    const h = await harness();
    const memberId = await provisionLinkedUser(h);

    const created = await groupsPost(
      scimRequest('/Groups', {
        method: 'POST',
        token: h.rawToken,
        body: {
          schemas: [SCIM_SCHEMA.group],
          displayName: 'Engineering',
          members: [{ value: memberId }],
        },
      }),
    );
    const groupId = String((await body(created))['id']);

    const response = await groupPatch(
      scimRequest(`/Groups/${groupId}`, {
        method: 'PATCH',
        token: h.rawToken,
        body: {
          schemas: [SCIM_SCHEMA.patchOp],
          Operations: [
            { op: 'remove', path: 'members' },
            { op: 'add', path: 'members', value: [{ value: ABSENT_MEMBER_ID }] },
          ],
        },
      }),
      { params: Promise.resolve({ groupId }) },
    );

    expect(response.status).toBe(400);
    expect(h.state.scim_group_members).toHaveLength(1);
  });

  it('does not leave a mapped role behind when deleting its group fails', async () => {
    const h = await harness();
    const memberId = await provisionLinkedUser(h);

    const created = await groupsPost(
      scimRequest('/Groups', {
        method: 'POST',
        token: h.rawToken,
        body: { schemas: [SCIM_SCHEMA.group], displayName: 'Engineering Admins' },
      }),
    );
    const groupId = String((await body(created))['id']);
    h.state.scim_groups[0]!['mapped_role'] = 'admin';

    await groupPatch(
      scimRequest(`/Groups/${groupId}`, {
        method: 'PATCH',
        token: h.rawToken,
        body: {
          schemas: [SCIM_SCHEMA.patchOp],
          Operations: [{ op: 'add', path: 'members', value: [{ value: memberId }] }],
        },
      }),
      { params: Promise.resolve({ groupId }) },
    );
    expect(memberRole(h.state, 'clerk_ada')).toBe('admin');

    failStatementsMatching(h, 'insert into organization_members');

    const response = await groupDelete(
      scimRequest(`/Groups/${groupId}`, { method: 'DELETE', token: h.rawToken }),
      { params: Promise.resolve({ groupId }) },
    );
    expect(response.status).toBe(500);

    expect(h.state.scim_groups).toHaveLength(1);
    expect(memberRole(h.state, 'clerk_ada')).toBe('admin');
  });
});

describe('SCIM tolerates out-of-order delivery', () => {
  it('refuses a membership add for a user the IdP has not created yet', async () => {
    const h = await harness();
    const created = await groupsPost(
      scimRequest('/Groups', {
        method: 'POST',
        token: h.rawToken,
        body: { schemas: [SCIM_SCHEMA.group], displayName: 'Engineering' },
      }),
    );
    const groupId = String((await body(created))['id']);

    const response = await groupPatch(
      scimRequest(`/Groups/${groupId}`, {
        method: 'PATCH',
        token: h.rawToken,
        body: {
          schemas: [SCIM_SCHEMA.patchOp],
          Operations: [{ op: 'add', path: 'members', value: [{ value: ABSENT_MEMBER_ID }] }],
        },
      }),
      { params: Promise.resolve({ groupId }) },
    );

    expect(response.status).toBe(400);
    expect((await body(response))['scimType']).toBe('invalidValue');
    expect(h.state.scim_group_members).toHaveLength(0);
  });

  it('answers a second delete of the same user with 404 rather than a server fault', async () => {
    const h = await harness();
    const memberId = await provisionLinkedUser(h);

    const first = await userDelete(
      scimRequest(`/Users/${memberId}`, { method: 'DELETE', token: h.rawToken }),
      { params: Promise.resolve({ userId: memberId }) },
    );
    expect(first.status).toBe(204);

    const second = await userDelete(
      scimRequest(`/Users/${memberId}`, { method: 'DELETE', token: h.rawToken }),
      { params: Promise.resolve({ userId: memberId }) },
    );
    expect(second.status).toBe(404);
    expect((await body(second))['schemas']).toEqual([SCIM_SCHEMA.error]);
  });

  it('treats a deactivate arriving after a delete as a clean 404, not a resurrection', async () => {
    const h = await harness();
    const memberId = await provisionLinkedUser(h);

    await userDelete(scimRequest(`/Users/${memberId}`, { method: 'DELETE', token: h.rawToken }), {
      params: Promise.resolve({ userId: memberId }),
    });

    const late = await userPatch(
      scimRequest(`/Users/${memberId}`, {
        method: 'PATCH',
        token: h.rawToken,
        body: {
          schemas: [SCIM_SCHEMA.patchOp],
          Operations: [{ op: 'replace', path: 'active', value: false }],
        },
      }),
      { params: Promise.resolve({ userId: memberId }) },
    );

    expect(late.status).toBe(404);
    expect(h.state.scim_provisioned_users).toHaveLength(0);
  });
});

describe('SCIM operations are idempotent under retry', () => {
  it('converges when the same deactivate is delivered twice', async () => {
    const h = await harness();
    const memberId = await provisionLinkedUser(h);
    expect(memberRole(h.state, 'clerk_ada')).toBe('member');

    const deactivate = () =>
      userPatch(
        scimRequest(`/Users/${memberId}`, {
          method: 'PATCH',
          token: h.rawToken,
          body: {
            schemas: [SCIM_SCHEMA.patchOp],
            Operations: [{ op: 'replace', path: 'active', value: false }],
          },
        }),
        { params: Promise.resolve({ userId: memberId }) },
      );

    const first = await deactivate();
    expect(first.status).toBe(200);
    expect(memberRole(h.state, 'clerk_ada')).toBeUndefined();

    const second = await deactivate();
    expect(second.status).toBe(200);
    expect((await body(second))['active']).toBe(false);
    expect(memberRole(h.state, 'clerk_ada')).toBeUndefined();
    expect(h.state.organization_members).toHaveLength(1);
  });

  it('adds a member to a group exactly once however many times the IdP sends it', async () => {
    const h = await harness();
    const memberId = await provisionLinkedUser(h);

    const created = await groupsPost(
      scimRequest('/Groups', {
        method: 'POST',
        token: h.rawToken,
        body: { schemas: [SCIM_SCHEMA.group], displayName: 'Engineering' },
      }),
    );
    const groupId = String((await body(created))['id']);

    const add = () =>
      groupPatch(
        scimRequest(`/Groups/${groupId}`, {
          method: 'PATCH',
          token: h.rawToken,
          body: {
            schemas: [SCIM_SCHEMA.patchOp],
            Operations: [{ op: 'add', path: 'members', value: [{ value: memberId }] }],
          },
        }),
        { params: Promise.resolve({ groupId }) },
      );

    expect((await add()).status).toBe(200);
    expect((await add()).status).toBe(200);

    expect(h.state.scim_group_members).toHaveLength(1);
  });
});

describe('SCIM rate limiting speaks SCIM', () => {
  it('re-shapes a throttled request into a parseable SCIM error', async () => {
    const h = await harness();
    mockWithRateLimit.mockResolvedValue(new Response('rate limited', { status: 429 }));

    const response = await usersPost(
      scimRequest('/Users', { method: 'POST', token: h.rawToken, body: userPayload() }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('content-type')).toContain('application/scim+json');
    const parsed = await body(response);
    expect(parsed['schemas']).toEqual([SCIM_SCHEMA.error]);
    expect(parsed['scimType']).toBe('tooMany');

    expect(h.state.scim_provisioned_users).toHaveLength(0);
  });
});

describe('SCIM deletion actually removes access', () => {
  it('revokes the organization membership and the resource together', async () => {
    const h = await harness();
    const memberId = await provisionLinkedUser(h);
    expect(memberRole(h.state, 'clerk_ada')).toBe('member');

    const response = await userDelete(
      scimRequest(`/Users/${memberId}`, { method: 'DELETE', token: h.rawToken }),
      { params: Promise.resolve({ userId: memberId }) },
    );
    expect(response.status).toBe(204);

    expect(memberRole(h.state, 'clerk_ada')).toBeUndefined();
    expect(h.state.scim_provisioned_users).toHaveLength(0);

    const readBack = await userGet(scimRequest(`/Users/${memberId}`, { token: h.rawToken }), {
      params: Promise.resolve({ userId: memberId }),
    });
    expect(readBack.status).toBe(404);

    expect(
      h.state.directory_sync_events.some((row) => row['event_type'] === 'user.deprovisioned'),
    ).toBe(true);
  });

  it('demotes the members of an admin-mapped group when the group is deleted', async () => {
    const h = await harness();
    const memberId = await provisionLinkedUser(h);

    const created = await groupsPost(
      scimRequest('/Groups', {
        method: 'POST',
        token: h.rawToken,
        body: { schemas: [SCIM_SCHEMA.group], displayName: 'Engineering Admins' },
      }),
    );
    const groupId = String((await body(created))['id']);
    h.state.scim_groups[0]!['mapped_role'] = 'admin';

    await groupPatch(
      scimRequest(`/Groups/${groupId}`, {
        method: 'PATCH',
        token: h.rawToken,
        body: {
          schemas: [SCIM_SCHEMA.patchOp],
          Operations: [{ op: 'add', path: 'members', value: [{ value: memberId }] }],
        },
      }),
      { params: Promise.resolve({ groupId }) },
    );
    expect(memberRole(h.state, 'clerk_ada')).toBe('admin');

    const response = await groupDelete(
      scimRequest(`/Groups/${groupId}`, { method: 'DELETE', token: h.rawToken }),
      { params: Promise.resolve({ groupId }) },
    );
    expect(response.status).toBe(204);

    expect(memberRole(h.state, 'clerk_ada')).toBe('member');
    expect(h.state.scim_group_members).toHaveLength(0);
  });
});
