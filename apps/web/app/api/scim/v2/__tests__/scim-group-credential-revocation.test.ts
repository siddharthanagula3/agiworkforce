import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  withRateLimit: vi.fn(async () => null),
}));

const { getDb } = vi.hoisted(() => ({ getDb: { current: null as unknown } }));

vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getNeonDb: () => getDb.current,
}));

vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/server/identity', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getIdentityProvider: () => ({}),
}));

type DeprovisionInput = { userId: string; organizationId: string };
const { deprovisionMember } = vi.hoisted(() => ({
  deprovisionMember: vi.fn(async (_db: unknown, _identity: unknown, _input: DeprovisionInput) => ({
    errors: [] as string[],
    sessionsRevoked: 0,
  })),
}));

vi.mock('@/lib/services/deprovision-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  deprovisionMember,
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createFakeScimDb, type FakeScimDbState } from './fake-scim-db';
import { createScimToken } from '@/lib/server/scim/scim-token-service';
import { SCIM_SCHEMA } from '@/lib/server/scim/scim-protocol';

import { POST as usersPost } from '../Users/route';
import { POST as groupsPost } from '../Groups/route';
import {
  DELETE as groupDelete,
  PATCH as groupPatch,
  PUT as groupPut,
} from '../Groups/[groupId]/route';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONNECTION = '33333333-3333-4333-8333-333333333333';
const ADMIN = 'admin-user';
const LEAVER = 'clerk_ada';
const BASE = 'https://app.example.com/api/scim/v2';

interface Harness {
  state: FakeScimDbState;
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
    sso_connections: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        organization_id: ORG,
        domain: 'example.com',
        domain_verified_at: '2026-01-01T00:00:00.000Z',
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

  return { state, rawToken };
}

function scimRequest(path: string, token: string, method: string, body?: unknown) {
  const headers = new Headers({ 'content-type': 'application/scim+json' });
  headers.set('authorization', `Bearer ${token}`);
  return new Request(`${BASE}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;
}

async function idOf(response: Response): Promise<string> {
  return String(((await response.json()) as Record<string, unknown>)['id']);
}

async function inactiveDirectoryUser(h: Harness): Promise<string> {
  const response = await usersPost(
    scimRequest('/Users', h.rawToken, 'POST', {
      schemas: [SCIM_SCHEMA.user],
      userName: 'ada@example.com',
      emails: [{ value: 'ada@example.com', primary: true }],
      active: false,
    }),
  );
  expect(response.status).toBe(201);
  return idOf(response);
}

function joinWorkspaceByInvitation(h: Harness): void {
  h.state.profiles.push({ id: LEAVER, email: 'ada@example.com' });
  h.state.organization_members.push({
    organization_id: ORG,
    user_id: LEAVER,
    role: 'member',
    provisioning_source: 'manual',
    provisioned_at: null,
    joined_at: '2026-02-01T00:00:00.000Z',
  });
}

async function createGroup(h: Harness, members: string[]): Promise<string> {
  const response = await groupsPost(
    scimRequest('/Groups', h.rawToken, 'POST', {
      schemas: [SCIM_SCHEMA.group],
      displayName: 'Engineering',
      members: members.map((value) => ({ value })),
    }),
  );
  expect(response.status).toBe(201);
  return idOf(response);
}

function isMember(h: Harness, userId: string): boolean {
  return h.state.organization_members.some((row) => row['user_id'] === userId);
}

function lastEvent(h: Harness, eventType: string): Record<string, unknown> {
  const events = h.state.directory_sync_events.filter((row) => row['event_type'] === eventType);
  return (events.at(-1)?.['raw_payload'] ?? {}) as Record<string, unknown>;
}

const groupWrites: Array<{
  name: string;
  eventType: string;
  run: (h: Harness, scimUserId: string) => Promise<Response>;
}> = [
  {
    name: 'a PATCH adding the member',
    eventType: 'group.updated',
    run: async (h, scimUserId) => {
      const groupId = await createGroup(h, []);
      joinWorkspaceByInvitation(h);
      return groupPatch(
        scimRequest(`/Groups/${groupId}`, h.rawToken, 'PATCH', {
          schemas: [SCIM_SCHEMA.patchOp],
          Operations: [{ op: 'add', path: 'members', value: [{ value: scimUserId }] }],
        }),
        { params: Promise.resolve({ groupId }) },
      );
    },
  },
  {
    name: 'a PUT naming the member',
    eventType: 'group.updated',
    run: async (h, scimUserId) => {
      const groupId = await createGroup(h, []);
      joinWorkspaceByInvitation(h);
      return groupPut(
        scimRequest(`/Groups/${groupId}`, h.rawToken, 'PUT', {
          schemas: [SCIM_SCHEMA.group],
          displayName: 'Engineering',
          members: [{ value: scimUserId }],
        }),
        { params: Promise.resolve({ groupId }) },
      );
    },
  },
  {
    name: 'a POST creating a group with the member',
    eventType: 'group.provisioned',
    run: async (h, scimUserId) => {
      joinWorkspaceByInvitation(h);
      return groupsPost(
        scimRequest('/Groups', h.rawToken, 'POST', {
          schemas: [SCIM_SCHEMA.group],
          displayName: 'Engineering',
          members: [{ value: scimUserId }],
        }),
      );
    },
  },
  {
    name: 'a DELETE of a group holding the member',
    eventType: 'group.deprovisioned',
    run: async (h, scimUserId) => {
      const groupId = await createGroup(h, [scimUserId]);
      joinWorkspaceByInvitation(h);
      return groupDelete(scimRequest(`/Groups/${groupId}`, h.rawToken, 'DELETE'), {
        params: Promise.resolve({ groupId }),
      });
    },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a group write that ends the workspace access of a deactivated member', () => {
  for (const write of groupWrites) {
    it(`${write.name} revokes the credentials that membership authorized`, async () => {
      const h = await harness();
      const scimUserId = await inactiveDirectoryUser(h);
      expect(isMember(h, LEAVER)).toBe(false);

      const response = await write.run(h, scimUserId);

      expect(response.status).toBeLessThan(300);
      expect(isMember(h, LEAVER)).toBe(false);
      expect(deprovisionMember).toHaveBeenCalledTimes(1);
      expect(deprovisionMember.mock.calls[0]?.[2]).toEqual({
        userId: LEAVER,
        organizationId: ORG,
      });
      expect(lastEvent(h, write.eventType)).toMatchObject({
        membershipsRevoked: 1,
        credentialsRevoked: true,
        revocationWarnings: [],
      });
    });
  }

  it('reports on the sync event what it could not revoke, and still answers the IdP with success', async () => {
    deprovisionMember.mockResolvedValueOnce({
      errors: ['1 session(s) could not be revoked and may still be live.'],
      sessionsRevoked: 0,
    });
    const h = await harness();
    const scimUserId = await inactiveDirectoryUser(h);

    const response = await groupWrites[0]!.run(h, scimUserId);

    expect(response.status).toBe(200);
    expect(isMember(h, LEAVER)).toBe(false);
    expect(lastEvent(h, 'group.updated')).toMatchObject({
      membershipsRevoked: 1,
      credentialsRevoked: false,
      revocationWarnings: [`${LEAVER}: 1 session(s) could not be revoked and may still be live.`],
    });
  });

  it('revokes nothing for an active member the group keeps in the workspace', async () => {
    const h = await harness();
    h.state.profiles.push({ id: LEAVER, email: 'ada@example.com' });
    const created = await usersPost(
      scimRequest('/Users', h.rawToken, 'POST', {
        schemas: [SCIM_SCHEMA.user],
        userName: 'ada@example.com',
        emails: [{ value: 'ada@example.com', primary: true }],
        active: true,
      }),
    );
    const scimUserId = await idOf(created);

    const response = await groupsPost(
      scimRequest('/Groups', h.rawToken, 'POST', {
        schemas: [SCIM_SCHEMA.group],
        displayName: 'Engineering',
        members: [{ value: scimUserId }],
      }),
    );

    expect(response.status).toBe(201);
    expect(isMember(h, LEAVER)).toBe(true);
    expect(deprovisionMember).not.toHaveBeenCalled();
    expect(lastEvent(h, 'group.provisioned')).toMatchObject({
      membershipsRevoked: 0,
      credentialsRevoked: false,
      revocationWarnings: [],
    });
  });
});
