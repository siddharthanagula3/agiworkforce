import { describe, expect, it } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { createScimGroup } from '../scim-provisioning-service';

/**
 * Batching the reconcile path rewrote the statements that assign organization
 * roles and protect owners, so "fewer round trips" is not the property that
 * matters here: the rows have to come out the same.
 *
 * Every expectation below was taken from the per-user implementation this
 * replaced, by running both against these same simulated tables and diffing the
 * final state. The comparison is kept as explicit expectations rather than a
 * second copy of the old service, which would rot.
 *
 * The fake models only the columns these statements touch and recognises
 * statements by shape rather than parsing SQL.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const CONNECTION = '22222222-2222-4222-8222-222222222222';
const GROUP = '33333333-3333-4333-8333-333333333333';
const ctx = { connectionId: CONNECTION, organizationId: ORG } as never;

type Role = 'owner' | 'admin' | 'member' | 'viewer';

interface ScimUser {
  id: string;
  email: string | null;
  active: boolean;
  linked_user_id: string | null;
  mapped_role: Role | null;
}

interface Membership {
  user_id: string;
  role: Role;
  provisioning_source: string | null;
}

interface World {
  users: ScimUser[];
  profiles: Array<{ id: string; email: string }>;
  memberships: Membership[];
}

function clone(world: World): World {
  return JSON.parse(JSON.stringify(world)) as World;
}

function simulate(world: World) {
  const norm = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();

  const upsert = (userId: string, role: Role, incomingWasNull: boolean) => {
    const existing = world.memberships.find((m) => m.user_id === userId);
    if (!existing) {
      world.memberships.push({ user_id: userId, role, provisioning_source: 'scim' });
      return;
    }
    if (existing.role === 'owner') {
      existing.provisioning_source = 'scim';
      return;
    }
    if (existing.provisioning_source === 'scim') existing.role = role;
    else if (!incomingWasNull) existing.role = role;
    existing.provisioning_source = 'scim';
  };

  const adapter: DatabaseAdapter = {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const t = norm(sql);

      if (t.includes('insert into scim_groups') || t.includes('update scim_groups')) {
        return [
          {
            id: GROUP,
            connection_id: CONNECTION,
            organization_id: ORG,
            external_id: null,
            display_name: 'G',
            mapped_role: null,
            version: 1,
          },
        ] as unknown as T[];
      }
      if (t.startsWith('select') && t.includes('from scim_groups')) {
        return [
          {
            id: GROUP,
            connection_id: CONNECTION,
            organization_id: ORG,
            external_id: null,
            display_name: 'G',
            mapped_role: null,
            version: 1,
          },
        ] as unknown as T[];
      }
      if (t.includes('from sso_connections')) {
        return [{ domain: 'x.test' }] as unknown as T[];
      }
      if (t.includes('from profiles')) {
        // The pre-batching path binds one email; the batched one binds an array.
        const raw = params[0];
        const list = Array.isArray(raw) ? (raw as string[]) : [raw as string];
        const wanted = new Set(list.map((e) => e.toLowerCase()));
        return world.profiles
          .filter((p) => wanted.has(p.email.toLowerCase()))
          .map((p) => ({ id: p.id, email: p.email.toLowerCase() })) as unknown as T[];
      }
      if (t.includes('from scim_provisioned_users')) {
        const ids = t.includes('any(') ? (params[0] as string[]) : [params[0] as string];
        return world.users
          .filter((u) => ids.includes(u.id))
          .map((u) => ({
            ...u,
            connection_id: CONNECTION,
            organization_id: ORG,
            user_name: u.id,
            external_id: null,
          })) as unknown as T[];
      }
      // mapped-role lookup, single or batched
      if (t.includes('from scim_group_members m')) {
        const ids = t.includes('any(') ? (params[0] as string[]) : [params[0] as string];
        return world.users
          .filter((u) => ids.includes(u.id) && u.mapped_role !== null)
          .map((u) => ({ scim_user_id: u.id, mapped_role: u.mapped_role })) as unknown as T[];
      }
      return [] as unknown as T[];
    },

    async execute(sql: string, params: unknown[] = []): Promise<number> {
      const t = norm(sql);

      if (t.includes('update scim_provisioned_users') && t.includes('linked_user_id')) {
        if (t.includes('unnest(')) {
          const ids = params[0] as string[];
          const linked = params[1] as string[];
          ids.forEach((id, i) => {
            const user = world.users.find((u) => u.id === id);
            if (user) user.linked_user_id = linked[i] ?? null;
          });
        } else {
          const user = world.users.find((u) => u.id === (params[1] as string));
          if (user) user.linked_user_id = params[0] as string;
        }
        return 1;
      }

      if (t.includes('delete from organization_members')) {
        const ids = t.includes('any(') ? (params[1] as string[]) : [params[1] as string];
        const before = world.memberships.length;
        world.memberships = world.memberships.filter(
          (m) => !(ids.includes(m.user_id) && m.role !== 'owner'),
        );
        return before - world.memberships.length;
      }

      if (t.includes('insert into organization_members')) {
        if (t.includes('entry.role')) {
          const users = params[1] as string[];
          const roles = params[2] as Role[];
          users.forEach((u, i) => upsert(u, roles[i] as Role, false));
        } else if (t.includes("'member', 'scim'")) {
          for (const u of params[1] as string[]) upsert(u, 'member', true);
        } else {
          // single-user form: coalesce($3::text, 'member')
          const role = (params[2] as Role | null) ?? 'member';
          upsert(params[1] as string, role, params[2] === null);
        }
        return 1;
      }

      if (t.includes('scim_group_members')) return 1;
      return 1;
    },

    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
      return fn(adapter);
    },
    withUser() {
      return adapter;
    },
  } as unknown as DatabaseAdapter;

  return adapter;
}

function sortState(world: World) {
  return {
    memberships: [...world.memberships].sort((a, b) => a.user_id.localeCompare(b.user_id)),
    linked: world.users
      .map((u) => ({ id: u.id, linked: u.linked_user_id }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

async function run(world: World) {
  const memberIds = world.users.map((u) => u.id);
  const after = clone(world);
  await createScimGroup(simulate(after), ctx, {
    displayName: 'G',
    externalId: null,
    memberIds,
  } as never);
  return sortState(after);
}

const uid = (n: number) => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;

describe('batched reconcile produces the same rows as the per-user path', () => {
  it('grants a mapped role to an active linked user', async () => {
    const after = await run({
      users: [
        { id: uid(1), email: 'a@x.test', active: true, linked_user_id: 'p1', mapped_role: 'admin' },
      ],
      profiles: [],
      memberships: [],
    });
    expect(after.memberships).toEqual([
      { user_id: 'p1', role: 'admin', provisioning_source: 'scim' },
    ]);
  });

  it('defaults to member when no group maps a role', async () => {
    const after = await run({
      users: [
        { id: uid(1), email: 'a@x.test', active: true, linked_user_id: 'p1', mapped_role: null },
      ],
      profiles: [],
      memberships: [],
    });
    expect(after.memberships[0]?.role).toBe('member');
  });

  it('never demotes an owner, with or without a mapped role', async () => {
    const withRole = await run({
      users: [
        {
          id: uid(1),
          email: 'a@x.test',
          active: true,
          linked_user_id: 'p1',
          mapped_role: 'viewer',
        },
      ],
      profiles: [],
      memberships: [{ user_id: 'p1', role: 'owner', provisioning_source: 'manual' }],
    });
    expect(withRole.memberships[0]?.role).toBe('owner');

    const withoutRole = await run({
      users: [
        { id: uid(1), email: 'a@x.test', active: true, linked_user_id: 'p1', mapped_role: null },
      ],
      profiles: [],
      memberships: [{ user_id: 'p1', role: 'owner', provisioning_source: 'manual' }],
    });
    expect(withoutRole.memberships[0]?.role).toBe('owner');
  });

  it('leaves a manually-set role alone when no role is mapped', async () => {
    const after = await run({
      users: [
        { id: uid(1), email: 'a@x.test', active: true, linked_user_id: 'p1', mapped_role: null },
      ],
      profiles: [],
      memberships: [{ user_id: 'p1', role: 'admin', provisioning_source: 'manual' }],
    });
    expect(after.memberships[0]?.role).toBe('admin');
  });

  it('overwrites a manually-set role when a role IS mapped', async () => {
    const after = await run({
      users: [
        {
          id: uid(1),
          email: 'a@x.test',
          active: true,
          linked_user_id: 'p1',
          mapped_role: 'viewer',
        },
      ],
      profiles: [],
      memberships: [{ user_id: 'p1', role: 'admin', provisioning_source: 'manual' }],
    });
    expect(after.memberships[0]?.role).toBe('viewer');
  });

  it('downgrades a scim-provisioned role to member when the mapping disappears', async () => {
    const after = await run({
      users: [
        { id: uid(1), email: 'a@x.test', active: true, linked_user_id: 'p1', mapped_role: null },
      ],
      profiles: [],
      memberships: [{ user_id: 'p1', role: 'admin', provisioning_source: 'scim' }],
    });
    expect(after.memberships[0]?.role).toBe('member');
  });

  it('revokes non-owner membership for an inactive user', async () => {
    const after = await run({
      users: [
        {
          id: uid(1),
          email: 'a@x.test',
          active: false,
          linked_user_id: 'p1',
          mapped_role: 'admin',
        },
      ],
      profiles: [],
      memberships: [{ user_id: 'p1', role: 'admin', provisioning_source: 'scim' }],
    });
    expect(after.memberships).toEqual([]);
  });

  it('does not revoke an owner who went inactive', async () => {
    const after = await run({
      users: [
        { id: uid(1), email: 'a@x.test', active: false, linked_user_id: 'p1', mapped_role: null },
      ],
      profiles: [],
      memberships: [{ user_id: 'p1', role: 'owner', provisioning_source: 'manual' }],
    });
    expect(after.memberships[0]?.role).toBe('owner');
  });

  it('links an unlinked user by email, then grants membership', async () => {
    const after = await run({
      users: [
        {
          id: uid(1),
          email: 'A@X.test',
          active: true,
          linked_user_id: null,
          mapped_role: 'viewer',
        },
      ],
      profiles: [{ id: 'p9', email: 'a@x.TEST' }],
      memberships: [],
    });
    expect(after.linked[0]?.linked).toBe('p9');
    expect(after.memberships).toEqual([
      { user_id: 'p9', role: 'viewer', provisioning_source: 'scim' },
    ]);
  });

  it('grants nothing for an unlinked user with no matching profile', async () => {
    const after = await run({
      users: [
        {
          id: uid(1),
          email: 'nobody@x.test',
          active: true,
          linked_user_id: null,
          mapped_role: 'admin',
        },
      ],
      profiles: [],
      memberships: [],
    });
    expect(after.memberships).toEqual([]);
  });

  it('handles a mixed population in one pass', async () => {
    const after = await run({
      users: [
        { id: uid(1), email: 'a@x.test', active: true, linked_user_id: 'p1', mapped_role: 'admin' },
        { id: uid(2), email: 'b@x.test', active: true, linked_user_id: 'p2', mapped_role: null },
        {
          id: uid(3),
          email: 'c@x.test',
          active: false,
          linked_user_id: 'p3',
          mapped_role: 'viewer',
        },
        {
          id: uid(4),
          email: 'd@x.test',
          active: true,
          linked_user_id: null,
          mapped_role: 'viewer',
        },
        { id: uid(5), email: null, active: true, linked_user_id: null, mapped_role: 'admin' },
        {
          id: uid(6),
          email: 'f@x.test',
          active: true,
          linked_user_id: 'p6',
          mapped_role: 'member',
        },
      ],
      profiles: [{ id: 'p4', email: 'd@x.test' }],
      memberships: [
        { user_id: 'p1', role: 'owner', provisioning_source: 'manual' },
        { user_id: 'p2', role: 'admin', provisioning_source: 'manual' },
        { user_id: 'p3', role: 'admin', provisioning_source: 'scim' },
        { user_id: 'p6', role: 'viewer', provisioning_source: 'scim' },
      ],
    });
    expect(after.memberships).toEqual([
      { user_id: 'p1', role: 'owner', provisioning_source: 'scim' },
      { user_id: 'p2', role: 'admin', provisioning_source: 'scim' },
      { user_id: 'p4', role: 'viewer', provisioning_source: 'scim' },
      { user_id: 'p6', role: 'member', provisioning_source: 'scim' },
    ]);
    expect(after.linked.find((entry) => entry.id === uid(4))?.linked).toBe('p4');
    expect(after.linked.find((entry) => entry.id === uid(5))?.linked).toBeNull();
  });
});
