/**
 * Directory-sync reconciliation under the conditions a real IdP produces.
 *
 * `scim-routes.test.ts` covers the happy path plus authentication, entitlement
 * and tenant isolation. This suite covers the five failure classes CRIT-012
 * names, none of which are exercised there:
 *
 *   idempotency    — Okta and Entra retry aggressively; replaying a delivered
 *                    operation must converge, not double-apply or 500.
 *   out-of-order   — group membership routinely arrives before the user it
 *                    references, and deletes arrive after deletes.
 *   partial failure— a multi-statement write that fails halfway must leave NO
 *                    partial state, because the IdP will retry the whole call.
 *   rate limiting  — a throttled IdP must receive a parseable SCIM error, not
 *                    an HTML or bare 429 it will treat as a protocol fault.
 *   deletion       — a deprovision must actually remove access, and a repeat
 *                    deprovision must be a clean 404.
 */

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

/** A well-formed UUID that is deliberately not any resource in the tenant. */
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

/** Provision a linked user and return its SCIM resource id. */
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

/**
 * Make one statement fail the way a real outage would — a lock timeout, a
 * constraint the application did not anticipate, a dropped connection.
 *
 * The point is to prove the OTHER statements in the same call did not stick.
 */
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

// ---------------------------------------------------------------------------
// Partial failure
// ---------------------------------------------------------------------------

describe('SCIM user writes are all-or-nothing', () => {
  it('leaves no unprovisionable resource behind when the membership write fails', async () => {
    const h = await harness();
    h.state.profiles.push({ id: 'clerk_ada', email: 'ada@example.com' });
    failStatementsMatching(h, 'insert into organization_members');

    const response = await usersPost(
      scimRequest('/Users', { method: 'POST', token: h.rawToken, body: userPayload() }),
    );

    expect(response.status).toBe(500);

    // The IdP retries a 500 with the identical body. A surviving resource row
    // would make that retry collide with the userName uniqueness index and
    // answer 409 from then on — a user who can never be provisioned and whose
    // resource grants no access.
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

    // The worst half-success in this system: a resource that reads
    // `active: false` next to a person who still has access. Either both land
    // or neither does.
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

    // The IdP was told the create failed, so it will retry the identical
    // request. If a row survived here that retry answers 409 uniqueness
    // forever and the group can never converge.
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

    // Re-reconcile so the mapping actually lands before the failing PUT.
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
          // The absent id is sent FIRST on purpose. A non-atomic PUT deletes
          // the whole member set, then fails on the first id it tries to
          // re-add, so nothing is ever put back. With the bad id last, the
          // valid member happens to be re-inserted before the throw and the
          // damage is invisible — this ordering is what makes the assertion
          // below discriminate.
          members: [{ value: ABSENT_MEMBER_ID }, { value: memberId }],
          displayName: 'Renamed By A Doomed Request',
        },
      }),
      { params: Promise.resolve({ groupId }) },
    );

    expect(response.status).toBe(400);

    // A PUT replaces the member set wholesale, so a non-atomic implementation
    // empties the group before it discovers the bad id — silently stripping
    // the admin role of everyone who was in it.
    expect(h.state.scim_group_members).toHaveLength(1);
    expect(h.state.scim_group_members[0]!['scim_user_id']).toBe(memberId);
    expect(memberRole(h.state, 'clerk_ada')).toBe('admin');
    // The rename rode along in the same failed request and must be gone too.
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
    // RFC 7644 §3.5.2: a PATCH is a single atomic operation. The `remove` must
    // not survive the failure of the `add` that followed it.
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

    // The demotion is the statement that fails.
    failStatementsMatching(h, 'insert into organization_members');

    const response = await groupDelete(
      scimRequest(`/Groups/${groupId}`, { method: 'DELETE', token: h.rawToken }),
      { params: Promise.resolve({ groupId }) },
    );
    expect(response.status).toBe(500);

    // Either the group and the admin role it granted both go, or neither does.
    // The forbidden outcome is the group vanishing while the elevated role it
    // justified survives with nothing left to explain or revoke it.
    expect(h.state.scim_groups).toHaveLength(1);
    expect(memberRole(h.state, 'clerk_ada')).toBe('admin');
  });
});

// ---------------------------------------------------------------------------
// Out-of-order delivery
// ---------------------------------------------------------------------------

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

    // 400 with a SCIM error, not a 500 and not a silently dropped member: the
    // IdP retries a 400 after it has created the user, and would never retry a
    // 200 that quietly did nothing.
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

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

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
    // The retry must not re-grant, duplicate, or error.
    expect(memberRole(h.state, 'clerk_ada')).toBeUndefined();
    expect(h.state.organization_members).toHaveLength(1); // the owner only
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

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe('SCIM rate limiting speaks SCIM', () => {
  it('re-shapes a throttled request into a parseable SCIM error', async () => {
    const h = await harness();
    mockWithRateLimit.mockResolvedValue(new Response('rate limited', { status: 429 }));

    const response = await usersPost(
      scimRequest('/Users', { method: 'POST', token: h.rawToken, body: userPayload() }),
    );

    expect(response.status).toBe(429);
    // An IdP parses the body; a bare text/plain 429 from the shared limiter is
    // a protocol fault to Okta, not a retry signal.
    expect(response.headers.get('content-type')).toContain('application/scim+json');
    const parsed = await body(response);
    expect(parsed['schemas']).toEqual([SCIM_SCHEMA.error]);
    expect(parsed['scimType']).toBe('tooMany');

    // Throttling happens BEFORE authentication and before any write.
    expect(h.state.scim_provisioned_users).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

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

    // The deprovision is auditable, which is what lets an admin prove access
    // was removed at a point in time.
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

    // Deleting the group that granted admin must take the grant with it.
    expect(memberRole(h.state, 'clerk_ada')).toBe('member');
    expect(h.state.scim_group_members).toHaveLength(0);
  });
});
