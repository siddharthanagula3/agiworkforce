import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const { mockRecordAuditEvent } = vi.hoisted(() => ({
  mockRecordAuditEvent: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args),
}));

vi.mock('@/lib/server/request-context-cache', () => ({
  invalidateActiveOrganizationCache: vi.fn(async () => undefined),
}));

import {
  deleteScimUser,
  reconcileGroupMembers,
  reconcileMembership,
  type ScimConnectionContext,
} from '../scim-provisioning-service';
import type { ScimProvisionedUserRow } from '@/lib/server/neon-types';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONNECTION = '22222222-2222-4222-8222-222222222222';
const SCIM_USER = '33333333-3333-4333-8333-333333333333';
const LINKED_USER = 'linked-user-1';
const TOKEN_ID = '44444444-4444-4444-8444-444444444444';

interface Membership {
  organization_id: string;
  user_id: string;
  role: string;
  provisioning_source: string | null;
}

interface Group {
  id: string;
  connection_id: string;
  mapped_role: string | null;
}

interface World {
  memberships: Membership[];
  groupMembers: Array<{ scim_user_id: string; group_id: string; organization_id: string }>;
  groups: Group[];
  verifiedDomains: string[];
}

function fakeDb(world: World): DatabaseAdapter {
  return {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const q = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (q.startsWith('select lower(domain) as domain from sso_connections')) {
        return world.verifiedDomains.map((domain) => ({ domain })) as unknown as T[];
      }

      if (q.startsWith('select g.mapped_role') && q.includes('scim_group_members')) {
        const scimUserId = params[0] as string;
        return world.groupMembers
          .filter((m) => m.scim_user_id === scimUserId)
          .map((m) => world.groups.find((g) => g.id === m.group_id))
          .filter((g): g is Group => Boolean(g))
          .map((g) => ({ mapped_role: g.mapped_role })) as unknown as T[];
      }

      if (q.startsWith('select m.scim_user_id, g.mapped_role')) {
        const ids = params[0] as string[];
        return world.groupMembers
          .filter((m) => ids.includes(m.scim_user_id))
          .map((m) => ({
            scim_user_id: m.scim_user_id,
            mapped_role: world.groups.find((g) => g.id === m.group_id)?.mapped_role ?? null,
          })) as unknown as T[];
      }

      if (q.startsWith('select role, provisioning_source from organization_members')) {
        const [orgId, userId] = params as [string, string];
        return world.memberships
          .filter((m) => m.organization_id === orgId && m.user_id === userId)
          .map((m) => ({
            role: m.role,
            provisioning_source: m.provisioning_source,
          })) as unknown as T[];
      }

      if (
        q.startsWith('select user_id from organization_members') &&
        q.includes("role <> 'owner'")
      ) {
        const [orgId, ids] = params as [string, string[]];
        return world.memberships
          .filter(
            (m) => m.organization_id === orgId && ids.includes(m.user_id) && m.role !== 'owner',
          )
          .map((m) => ({ user_id: m.user_id })) as unknown as T[];
      }

      if (q.startsWith('select user_id, role, provisioning_source from organization_members')) {
        const [orgId, ids] = params as [string, string[]];
        return world.memberships
          .filter((m) => m.organization_id === orgId && ids.includes(m.user_id))
          .map((m) => ({
            user_id: m.user_id,
            role: m.role,
            provisioning_source: m.provisioning_source,
          })) as unknown as T[];
      }

      if (q.startsWith('select id from profiles')) {
        return [] as unknown as T[];
      }

      return [] as unknown as T[];
    },
    async execute(sql: string, params: unknown[] = []): Promise<number> {
      const q = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (q.startsWith('delete from organization_members') && q.includes('any(')) {
        const [orgId, ids] = params as [string, string[]];
        const before = world.memberships.length;
        world.memberships = world.memberships.filter(
          (m) => !(m.organization_id === orgId && ids.includes(m.user_id) && m.role !== 'owner'),
        );
        return before - world.memberships.length;
      }

      if (q.startsWith('delete from organization_members')) {
        const [orgId, userId] = params as [string, string];
        const before = world.memberships.length;
        world.memberships = world.memberships.filter(
          (m) => !(m.organization_id === orgId && m.user_id === userId && m.role !== 'owner'),
        );
        return before - world.memberships.length;
      }

      if (
        q.startsWith('insert into organization_members') &&
        q.includes('unnest($2::text[], $3::text[])')
      ) {
        const [orgId, userIds, roles] = params as [string, string[], string[]];
        userIds.forEach((userId, index) => {
          const role = roles[index] as string;
          const existing = world.memberships.find(
            (m) => m.organization_id === orgId && m.user_id === userId,
          );
          if (existing) {
            if (existing.role !== 'owner') existing.role = role;
            existing.provisioning_source = 'scim';
          } else {
            world.memberships.push({
              organization_id: orgId,
              user_id: userId,
              role,
              provisioning_source: 'scim',
            });
          }
        });
        return userIds.length;
      }

      if (q.startsWith('insert into organization_members') && q.includes('unnest($2::text[])')) {
        const [orgId, userIds] = params as [string, string[]];
        userIds.forEach((userId) => {
          const existing = world.memberships.find(
            (m) => m.organization_id === orgId && m.user_id === userId,
          );
          if (existing) {
            if (existing.role !== 'owner' && existing.provisioning_source === 'scim') {
              existing.role = 'member';
            }
            existing.provisioning_source = 'scim';
          } else {
            world.memberships.push({
              organization_id: orgId,
              user_id: userId,
              role: 'member',
              provisioning_source: 'scim',
            });
          }
        });
        return userIds.length;
      }

      if (q.startsWith('insert into organization_members')) {
        const [orgId, userId, mappedRole] = params as [string, string, string | null];
        const existing = world.memberships.find(
          (m) => m.organization_id === orgId && m.user_id === userId,
        );
        if (existing) {
          if (existing.role === 'owner') {
            // untouchable
          } else if (existing.provisioning_source === 'scim') {
            existing.role = mappedRole ?? 'member';
          } else if (mappedRole !== null) {
            existing.role = mappedRole;
          }
          existing.provisioning_source = 'scim';
        } else {
          world.memberships.push({
            organization_id: orgId,
            user_id: userId,
            role: mappedRole ?? 'member',
            provisioning_source: 'scim',
          });
        }
        return 1;
      }

      return 0;
    },
    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
      return fn(fakeDb(world));
    },
  } as unknown as DatabaseAdapter;
}

function scimUser(overrides: Partial<ScimProvisionedUserRow> = {}): ScimProvisionedUserRow {
  return {
    id: SCIM_USER,
    connection_id: CONNECTION,
    organization_id: ORG,
    external_id: null,
    user_name: 'jane@example.com',
    email: 'jane@example.com',
    given_name: 'Jane',
    family_name: 'Doe',
    display_name: 'Jane Doe',
    active: true,
    linked_user_id: LINKED_USER,
    linked_at: '2026-01-01T00:00:00.000Z',
    raw_attributes: {},
    version: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as ScimProvisionedUserRow;
}

const ctx: ScimConnectionContext = {
  connectionId: CONNECTION,
  organizationId: ORG,
  tokenId: TOKEN_ID,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reconcileMembership audit trail', () => {
  it('records scim_membership_granted for a brand new membership, attributed to the token', async () => {
    const world: World = {
      memberships: [],
      groupMembers: [],
      groups: [],
      verifiedDomains: ['example.com'],
    };

    await reconcileMembership(fakeDb(world), ctx, scimUser());

    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        eventType: 'scim_membership_granted',
        organizationId: ORG,
        severity: 'info',
        detail: expect.objectContaining({
          resourceType: 'organization_member',
          resourceId: LINKED_USER,
          targetUserId: LINKED_USER,
          role: 'member',
          subjectRef: `scim_token:${TOKEN_ID}`,
          source: 'scim',
        }),
      }),
    );
  });

  it('records scim_membership_granted again when a mapped role change actually changes the role', async () => {
    const world: World = {
      memberships: [
        { organization_id: ORG, user_id: LINKED_USER, role: 'member', provisioning_source: 'scim' },
      ],
      groupMembers: [{ scim_user_id: SCIM_USER, group_id: 'g1', organization_id: ORG }],
      groups: [{ id: 'g1', connection_id: CONNECTION, mapped_role: 'admin' }],
      verifiedDomains: ['example.com'],
    };

    await reconcileMembership(fakeDb(world), ctx, scimUser());

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'scim_membership_granted',
        detail: expect.objectContaining({ targetUserId: LINKED_USER, role: 'admin' }),
      }),
    );
  });

  it('does not raise an audit event when a resync leaves the role unchanged', async () => {
    const world: World = {
      memberships: [
        { organization_id: ORG, user_id: LINKED_USER, role: 'member', provisioning_source: 'scim' },
      ],
      groupMembers: [],
      groups: [],
      verifiedDomains: ['example.com'],
    };

    await reconcileMembership(fakeDb(world), ctx, scimUser());

    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('never audits a change to a protected owner row', async () => {
    const world: World = {
      memberships: [
        {
          organization_id: ORG,
          user_id: LINKED_USER,
          role: 'owner',
          provisioning_source: 'manual',
        },
      ],
      groupMembers: [{ scim_user_id: SCIM_USER, group_id: 'g1', organization_id: ORG }],
      groups: [{ id: 'g1', connection_id: CONNECTION, mapped_role: 'admin' }],
      verifiedDomains: ['example.com'],
    };

    await reconcileMembership(fakeDb(world), ctx, scimUser());

    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
    expect(world.memberships[0]?.role).toBe('owner');
  });

  it('records scim_membership_revoked when a deactivated user loses membership', async () => {
    const world: World = {
      memberships: [
        { organization_id: ORG, user_id: LINKED_USER, role: 'member', provisioning_source: 'scim' },
      ],
      groupMembers: [],
      groups: [],
      verifiedDomains: ['example.com'],
    };

    await reconcileMembership(fakeDb(world), ctx, scimUser({ active: false }));

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'scim_membership_revoked',
        severity: 'warning',
        organizationId: ORG,
        detail: expect.objectContaining({
          targetUserId: LINKED_USER,
          subjectRef: `scim_token:${TOKEN_ID}`,
        }),
      }),
    );
    expect(world.memberships).toHaveLength(0);
  });

  it('omits subjectRef when the caller did not carry a token id', async () => {
    const world: World = {
      memberships: [],
      groupMembers: [],
      groups: [],
      verifiedDomains: ['example.com'],
    };
    const ctxWithoutToken: ScimConnectionContext = {
      connectionId: CONNECTION,
      organizationId: ORG,
    };

    await reconcileMembership(fakeDb(world), ctxWithoutToken, scimUser());

    const [call] = mockRecordAuditEvent.mock.calls;
    expect(call?.[0]).not.toHaveProperty('detail.subjectRef');
    expect((call?.[0] as { detail: Record<string, unknown> }).detail['subjectRef']).toBeUndefined();
  });
});

describe('deleteScimUser audit trail', () => {
  it('records scim_membership_revoked when the deleted user held membership', async () => {
    const world: World = {
      memberships: [
        { organization_id: ORG, user_id: LINKED_USER, role: 'member', provisioning_source: 'scim' },
      ],
      groupMembers: [],
      groups: [],
      verifiedDomains: ['example.com'],
    };
    const db = fakeDb(world);
    db.query = (async (sql: string, params: unknown[] = []) => {
      const q = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (q.startsWith('select id, connection_id, organization_id')) {
        return [scimUser()];
      }
      return fakeDb(world).query(sql, params);
    }) as DatabaseAdapter['query'];

    await deleteScimUser(db, ctx, SCIM_USER);

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'scim_membership_revoked',
        detail: expect.objectContaining({ targetUserId: LINKED_USER }),
      }),
    );
  });
});

describe('reconcileGroupMembers audit trail', () => {
  it('audits every membership that actually changes in a batch, and none that do not', async () => {
    const secondScimUser = '55555555-5555-4555-8555-555555555555';
    const secondLinkedUser = 'linked-user-2';

    const world: World = {
      memberships: [
        { organization_id: ORG, user_id: LINKED_USER, role: 'member', provisioning_source: 'scim' },
        {
          organization_id: ORG,
          user_id: secondLinkedUser,
          role: 'admin',
          provisioning_source: 'scim',
        },
      ],
      groupMembers: [{ scim_user_id: SCIM_USER, group_id: 'g1', organization_id: ORG }],
      groups: [{ id: 'g1', connection_id: CONNECTION, mapped_role: 'admin' }],
      verifiedDomains: ['example.com'],
    };

    const users = [
      scimUser(),
      scimUser({
        id: secondScimUser,
        user_name: 'second@example.com',
        email: 'second@example.com',
        linked_user_id: secondLinkedUser,
      }),
    ];

    const db = fakeDb(world);
    db.query = (async (sql: string, params: unknown[] = []) => {
      const q = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (q.startsWith('select id, connection_id, organization_id, external_id, user_name')) {
        const ids = params[0] as string[];
        return users.filter((u) => ids.includes(u.id));
      }
      return fakeDb(world).query(sql, params);
    }) as DatabaseAdapter['query'];

    await reconcileGroupMembers(db, ctx, [SCIM_USER, secondScimUser]);

    // First user: member -> admin (mapped role), a real change.
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'scim_membership_granted',
        detail: expect.objectContaining({ targetUserId: LINKED_USER, role: 'admin' }),
      }),
    );
    // Second user has no group mapping and was already 'admin' via scim, so
    // the upsert leaves it at 'member' by default. Only a real change audits.
    const secondUserCalls = mockRecordAuditEvent.mock.calls.filter(
      (call) =>
        (call[0] as { detail: { targetUserId: string } }).detail.targetUserId === secondLinkedUser,
    );
    expect(secondUserCalls).toHaveLength(1);
    expect(secondUserCalls[0]?.[0]).toMatchObject({
      eventType: 'scim_membership_granted',
      detail: expect.objectContaining({ role: 'member' }),
    });
  });

  it('audits a batch revoke for deactivated members', async () => {
    const world: World = {
      memberships: [
        { organization_id: ORG, user_id: LINKED_USER, role: 'member', provisioning_source: 'scim' },
      ],
      groupMembers: [],
      groups: [],
      verifiedDomains: ['example.com'],
    };
    const inactiveUser = scimUser({ active: false });

    const db = fakeDb(world);
    db.query = (async (sql: string, params: unknown[] = []) => {
      const q = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (q.startsWith('select id, connection_id, organization_id, external_id, user_name')) {
        const ids = params[0] as string[];
        return ids.includes(SCIM_USER) ? [inactiveUser] : [];
      }
      return fakeDb(world).query(sql, params);
    }) as DatabaseAdapter['query'];

    await reconcileGroupMembers(db, ctx, [SCIM_USER]);

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'scim_membership_revoked',
        detail: expect.objectContaining({ targetUserId: LINKED_USER }),
      }),
    );
    expect(world.memberships).toHaveLength(0);
  });
});
