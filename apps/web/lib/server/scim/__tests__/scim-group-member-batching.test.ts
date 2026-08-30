import { describe, expect, it } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  createScimGroup,
  parseMemberFilterIds,
  patchScimGroup,
  type ScimConnectionContext,
} from '../scim-provisioning-service';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONNECTION = '22222222-2222-4222-8222-222222222222';
const GROUP = '33333333-3333-4333-8333-333333333333';

const ctx: ScimConnectionContext = {
  connectionId: CONNECTION,
  organizationId: ORG,
} as ScimConnectionContext;

function memberId(index: number): string {
  return `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`;
}

interface Call {
  sql: string;
  params: unknown[];
}

/**
 * Records every statement so a test can count round trips rather than assert on
 * wall-clock time, which would be measuring the fake.
 */
function fakeDb(memberIds: string[]) {
  const calls: Call[] = [];
  const known = new Set(memberIds);

  const adapter: DatabaseAdapter = {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      calls.push({ sql, params });
      const text = sql.replace(/\s+/g, ' ').toLowerCase();

      if (text.includes('insert into scim_groups') || text.includes('update scim_groups')) {
        return [
          {
            id: GROUP,
            connection_id: CONNECTION,
            organization_id: ORG,
            external_id: null,
            display_name: 'Engineering',
            mapped_role: null,
            version: 1,
          },
        ] as unknown as T[];
      }

      if (text.includes('from scim_groups') && text.includes('where')) {
        return [
          {
            id: GROUP,
            connection_id: CONNECTION,
            organization_id: ORG,
            external_id: null,
            display_name: 'Engineering',
            mapped_role: null,
            version: 1,
          },
        ] as unknown as T[];
      }

      if (text.includes('from scim_provisioned_users')) {
        const requested = (params[0] as string[]) ?? [];
        return requested
          .filter((id) => known.has(id))
          .map((id) => ({
            id,
            connection_id: CONNECTION,
            organization_id: ORG,
            external_id: null,
            user_name: `user-${id}`,
            email: `${id}@example.test`,
            // Pre-linked and active so reconcileMembership takes its shortest
            // path; this test is about membership writes, not account linking.
            linked_user_id: `linked-${id}`,
            active: true,
          })) as unknown as T[];
      }

      // resolveMappedRole and group-member reads
      return [] as unknown as T[];
    },

    async execute(sql: string, params: unknown[] = []): Promise<number> {
      calls.push({ sql, params });
      return 1;
    },

    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
      return fn(adapter);
    },

    withUser() {
      return adapter;
    },
  } as unknown as DatabaseAdapter;

  const matching = (needle: string) =>
    calls.filter((call) => call.sql.replace(/\s+/g, ' ').toLowerCase().includes(needle));

  return { adapter, calls, matching };
}

describe('SCIM group membership writes are batched', () => {
  it('inserts 500 members in one statement instead of 500', async () => {
    const members = Array.from({ length: 500 }, (_, i) => memberId(i));
    const db = fakeDb(members);

    await createScimGroup(db.adapter, ctx, {
      displayName: 'Engineering',
      externalId: null,
      memberIds: members,
    } as never);

    expect(db.matching('insert into scim_group_members')).toHaveLength(1);
  });

  it('resolves member existence in one read instead of one per member', async () => {
    const members = Array.from({ length: 500 }, (_, i) => memberId(i));
    const db = fakeDb(members);

    await createScimGroup(db.adapter, ctx, {
      displayName: 'Engineering',
      externalId: null,
      memberIds: members,
    } as never);

    const existenceReads = db
      .matching('from scim_provisioned_users')
      .filter((call) => call.sql.toLowerCase().includes('any('));
    // One for addGroupMembers, one for reconcileGroupMembers. Previously this
    // was 2 per member, so 1000 for this group.
    expect(existenceReads).toHaveLength(2);
  });

  it('chunks a group larger than the write chunk so no single statement is unbounded', async () => {
    const members = Array.from({ length: 2500 }, (_, i) => memberId(i));
    const db = fakeDb(members);

    await createScimGroup(db.adapter, ctx, {
      displayName: 'Engineering',
      externalId: null,
      memberIds: members,
    } as never);

    const inserts = db.matching('insert into scim_group_members');
    expect(inserts).toHaveLength(3);
    for (const insert of inserts) {
      expect((insert.params[1] as string[]).length).toBeLessThanOrEqual(1000);
    }
    const written = inserts.flatMap((insert) => insert.params[1] as string[]);
    expect(new Set(written).size).toBe(2500);
  });

  it('deletes many members in one statement instead of one each', async () => {
    const members = Array.from({ length: 300 }, (_, i) => memberId(i));
    const db = fakeDb(members);

    await patchScimGroup(db.adapter, ctx, GROUP, [
      { op: 'remove', path: 'members', value: members.map((value) => ({ value })) },
    ] as never);

    const deletes = db.matching('delete from scim_group_members');
    expect(deletes).toHaveLength(1);
    expect((deletes[0]?.params[2] as string[]).length).toBe(300);
  });

  it('still rejects an unknown member id with 400, naming the first one', async () => {
    const members = [memberId(1), memberId(2)];
    const db = fakeDb([memberId(1)]);

    await expect(
      createScimGroup(db.adapter, ctx, {
        displayName: 'Engineering',
        externalId: null,
        memberIds: members,
      } as never),
    ).rejects.toMatchObject({ status: 400 });

    // Nothing was written for the valid member either: the whole PATCH fails.
    expect(db.matching('insert into scim_group_members')).toHaveLength(0);
  });

  it('still rejects a malformed member id with 404', async () => {
    const db = fakeDb([]);

    await expect(
      createScimGroup(db.adapter, ctx, {
        displayName: 'Engineering',
        externalId: null,
        memberIds: ['not-a-uuid'],
      } as never),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('reports the unknown id when a malformed one comes later, as the per-id lookup did', async () => {
    // The old loop threw on whichever id it reached first, so an unknown id
    // ahead of a malformed one is a 400, not a 404.
    const db = fakeDb([]);

    await expect(
      createScimGroup(db.adapter, ctx, {
        displayName: 'Engineering',
        externalId: null,
        memberIds: [memberId(9), 'not-a-uuid'],
      } as never),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('writes nothing when there are no members', async () => {
    const db = fakeDb([]);

    await createScimGroup(db.adapter, ctx, {
      displayName: 'Engineering',
      externalId: null,
      memberIds: [],
    } as never);

    expect(db.matching('insert into scim_group_members')).toHaveLength(0);
    expect(db.matching('from scim_provisioned_users')).toHaveLength(0);
  });
});

describe('SCIM filtered member removal (RFC 7644 3.5.2.2)', () => {
  it('removes only the filtered member, never the whole group', async () => {
    const members = [memberId(1), memberId(2), memberId(3)];
    const db = fakeDb(members);

    await patchScimGroup(db.adapter, ctx, GROUP, [
      { op: 'remove', path: `members[value eq "${memberId(2)}"]` },
    ] as never);

    const deletes = db.matching('delete from scim_group_members');
    expect(deletes).toHaveLength(1);
    const sql = deletes[0]?.sql ?? '';
    expect(sql, 'a filtered remove must not be an unscoped delete').toContain('scim_user_id');
    expect(deletes[0]?.params[2]).toEqual([memberId(2)]);
  });

  it('removes each member named by an or-joined filter', async () => {
    const members = [memberId(1), memberId(2), memberId(3)];
    const db = fakeDb(members);

    await patchScimGroup(db.adapter, ctx, GROUP, [
      {
        op: 'remove',
        path: `members[value eq "${memberId(1)}" or value eq "${memberId(3)}"]`,
      },
    ] as never);

    const deletes = db.matching('delete from scim_group_members');
    expect(deletes[0]?.params[2]).toEqual([memberId(1), memberId(3)]);
  });

  it('still clears the group when the path carries no filter at all', async () => {
    const members = [memberId(1), memberId(2)];
    const db = fakeDb(members);

    await patchScimGroup(db.adapter, ctx, GROUP, [{ op: 'remove', path: 'members' }] as never);

    const deletes = db.matching('delete from scim_group_members');
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.sql).not.toContain('scim_user_id');
  });

  it('rejects a filter it cannot read rather than falling back to clearing', () => {
    expect(() => parseMemberFilterIds('members[display eq "Engineering"]')).toThrow();
    expect(() => parseMemberFilterIds('members[value eq "not-a-uuid"]')).toThrow();
    expect(parseMemberFilterIds('members')).toEqual([]);
    expect(parseMemberFilterIds(undefined)).toEqual([]);
  });
});
