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

vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireCsrfToken: vi.fn(async () => null),
}));

vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logSecurityEvent: vi.fn(async () => undefined),
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/services/subscription-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  SubscriptionService: {
    getSubscription: vi.fn(async () => ({ plan_tier: 'enterprise', status: 'active' })),
  },
}));

const { getDb } = vi.hoisted(() => ({ getDb: { current: null as unknown } }));

vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getUserScopedDb: async () => ({ db: getDb.current, userId: 'owner-user', organizationId: null }),
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

import { createFakeScimDb, type FakeScimDbState } from '@/app/api/scim/v2/__tests__/fake-scim-db';
import { PATCH } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONNECTION = '22222222-2222-4222-8222-222222222222';
const GROUP = '33333333-3333-4333-8333-333333333333';
const SCIM_USER = '44444444-4444-4444-8444-444444444444';
const OWNER = 'owner-user';
const LEAVER = 'clerk_ada';

function norm(sql: string): string {
  return sql.replace(/\s+/gu, ' ').trim().toLowerCase();
}

function world(active: boolean) {
  const { adapter, state } = createFakeScimDb({
    scim_provisioned_users: [
      {
        id: SCIM_USER,
        connection_id: CONNECTION,
        organization_id: ORG,
        external_id: null,
        user_name: 'ada@example.com',
        email: 'ada@example.com',
        given_name: null,
        family_name: null,
        display_name: null,
        active,
        linked_user_id: LEAVER,
        linked_at: '2026-02-01T00:00:00.000Z',
        raw_attributes: null,
        version: 1,
        created_at: '2026-02-01T00:00:00.000Z',
        updated_at: '2026-02-01T00:00:00.000Z',
      },
    ],
    scim_groups: [
      {
        id: GROUP,
        connection_id: CONNECTION,
        organization_id: ORG,
        external_id: null,
        display_name: 'Engineering',
        mapped_role: null,
        version: 1,
        created_at: '2026-02-01T00:00:00.000Z',
        updated_at: '2026-02-01T00:00:00.000Z',
      },
    ],
    scim_group_members: [{ group_id: GROUP, scim_user_id: SCIM_USER, organization_id: ORG }],
    sso_connections: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        organization_id: ORG,
        domain: 'example.com',
        domain_verified_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    organization_members: [
      { organization_id: ORG, user_id: OWNER, role: 'owner', provisioning_source: 'manual' },
      { organization_id: ORG, user_id: LEAVER, role: 'member', provisioning_source: 'manual' },
    ],
  });

  const groupRow = () => state.scim_groups.find((row) => row['id'] === GROUP)!;
  const routeDb = {
    ...adapter,
    query: async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
      const q = norm(sql);
      if (q.startsWith('select id, connection_id, display_name, mapped_role from scim_groups')) {
        return (params[0] === GROUP && params[1] === ORG ? [{ ...groupRow() }] : []) as T[];
      }
      if (q.startsWith('select g.id, g.connection_id, g.external_id')) {
        return [{ ...groupRow(), member_count: state.scim_group_members.length }] as T[];
      }
      return adapter.query<T>(sql, params);
    },
    execute: async (sql: string, params: unknown[] = []): Promise<number> => {
      if (norm(sql).startsWith('update scim_groups set mapped_role')) {
        groupRow()['mapped_role'] = params[2];
        return 1;
      }
      return adapter.execute(sql, params);
    },
  };
  routeDb.transaction = async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(routeDb);
  getDb.current = routeDb;
  return state;
}

function changeMapping(mappedRole: string | null) {
  return PATCH(
    new Request('https://app.example.com/api/admin/directory-sync/groups', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ groupId: GROUP, mappedRole, organizationId: ORG }),
    }) as never,
  );
}

function isMember(state: FakeScimDbState, userId: string): boolean {
  return state.organization_members.some((row) => row['user_id'] === userId);
}

function mappingEvent(state: FakeScimDbState): Record<string, unknown> {
  const event = state.directory_sync_events.find(
    (row) => row['event_type'] === 'group.role_mapping_changed',
  );
  return (event?.['raw_payload'] ?? {}) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a group role mapping change that re-reconciles a deactivated member', () => {
  it('revokes the credentials of the member whose workspace access it ends', async () => {
    const state = world(false);

    const response = await changeMapping('admin');

    expect(response.status).toBe(200);
    expect(isMember(state, LEAVER)).toBe(false);
    expect(deprovisionMember).toHaveBeenCalledTimes(1);
    expect(deprovisionMember.mock.calls[0]?.[2]).toEqual({ userId: LEAVER, organizationId: ORG });
    expect(mappingEvent(state)).toMatchObject({
      membersReconciled: 1,
      membershipsRevoked: 1,
      credentialsRevoked: true,
      revocationWarnings: [],
    });
  });

  it('records what it could not revoke on the sync event', async () => {
    deprovisionMember.mockResolvedValueOnce({
      errors: ['Could not list sessions, so none were revoked.'],
      sessionsRevoked: 0,
    });
    const state = world(false);

    const response = await changeMapping('viewer');

    expect(response.status).toBe(200);
    expect(mappingEvent(state)).toMatchObject({
      membershipsRevoked: 1,
      credentialsRevoked: false,
      revocationWarnings: [`${LEAVER}: Could not list sessions, so none were revoked.`],
    });
  });

  it('revokes nothing when every member stays in the workspace', async () => {
    const state = world(true);

    const response = await changeMapping('admin');

    expect(response.status).toBe(200);
    expect(isMember(state, LEAVER)).toBe(true);
    expect(deprovisionMember).not.toHaveBeenCalled();
    expect(mappingEvent(state)).toMatchObject({ membershipsRevoked: 0, credentialsRevoked: false });
  });
});
