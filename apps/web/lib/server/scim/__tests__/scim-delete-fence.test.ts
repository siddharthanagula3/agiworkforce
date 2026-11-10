import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/server/request-context-cache', () => ({
  invalidateActiveOrganizationCache: vi.fn(async () => undefined),
}));
vi.mock('@/lib/server/identity', () => ({ getIdentityProvider: () => ({}) }));
vi.mock('@/lib/services/deprovision-service', () => ({
  deprovisionMember: vi.fn(async () => ({ errors: [] as string[], sessionsRevoked: 0 })),
}));
vi.mock('@/lib/services/identity-events', () => ({
  emitIdentitySecurityEvent: vi.fn(async () => ({ level: 'none', signals: [] })),
}));

import { ScimError } from '../scim-protocol';
import {
  deleteScimGroup,
  deleteScimUser,
  type ScimConnectionContext,
} from '../scim-provisioning-service';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONNECTION = '22222222-2222-4222-8222-222222222222';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const GROUP_ID = '66666666-6666-4666-8666-666666666666';

const ctx: ScimConnectionContext = { connectionId: CONNECTION, organizationId: ORG };

function norm(sql: string): string {
  return sql.replace(/\s+/gu, ' ').trim().toLowerCase();
}

interface Scenario {
  lockedVersion: number;
  readVersion: number;
}

function raceDb(scenario: Scenario) {
  const log: string[] = [];
  const memberQueries: string[] = [];
  const reconciled: string[][] = [];
  let inTransaction = false;
  let locked = false;

  const userRow = (version: number) => ({
    id: USER_ID,
    connection_id: CONNECTION,
    organization_id: ORG,
    external_id: null,
    user_name: 'jane@example.com',
    email: 'jane@example.com',
    active: true,
    linked_user_id: 'linked-user-1',
    version,
  });

  const adapter: DatabaseAdapter = {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const q = norm(sql);
      if (q.includes('from scim_groups')) {
        if (q.includes('for update')) {
          log.push(`lock-group:${inTransaction ? 'tx' : 'outside'}`);
          locked = true;
          return [{ version: scenario.lockedVersion }] as unknown as T[];
        }
        return [
          {
            id: GROUP_ID,
            connection_id: CONNECTION,
            organization_id: ORG,
            display_name: 'Admins',
            version: scenario.readVersion,
          },
        ] as unknown as T[];
      }
      if (q.includes('from scim_group_members m')) {
        memberQueries.push(inTransaction ? 'tx' : 'outside');
        return (locked ? [{ id: USER_ID, user_name: 'jane@example.com' }] : []) as unknown as T[];
      }
      if (q.includes('from scim_provisioned_users')) {
        if (q.includes('for update')) {
          log.push(`lock-user:${inTransaction ? 'tx' : 'outside'}`);
          return [userRow(scenario.lockedVersion)] as unknown as T[];
        }
        if (q.includes('any($1::uuid[])')) {
          reconciled.push(params[0] as string[]);
          return [];
        }
        return [userRow(scenario.readVersion)] as unknown as T[];
      }
      return [];
    },
    async execute(sql: string): Promise<number> {
      const q = norm(sql);
      if (q.startsWith('delete from organization_members')) {
        log.push(`delete-membership:${inTransaction ? 'tx' : 'outside'}`);
        return 1;
      }
      if (q.startsWith('delete from scim_provisioned_users')) {
        log.push(`delete-user:${inTransaction ? 'tx' : 'outside'}`);
        return 1;
      }
      if (q.startsWith('delete from scim_groups')) {
        log.push(`delete-group:${inTransaction ? 'tx' : 'outside'}`);
        return 1;
      }
      return 1;
    },
    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
      inTransaction = true;
      try {
        return await fn(adapter);
      } finally {
        inTransaction = false;
      }
    },
  } as DatabaseAdapter;

  return { adapter, log, memberQueries, reconciled };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deleting a SCIM group holds the group while it selects the affected members', () => {
  it('reads the members after taking the lock, inside the deleting transaction', async () => {
    const world = raceDb({ lockedVersion: 2, readVersion: 1 });

    await deleteScimGroup(world.adapter, ctx, GROUP_ID);

    expect(world.log).toEqual(['lock-group:tx', 'delete-group:tx']);
    expect(world.memberQueries).toEqual(['tx']);
    expect(world.reconciled).toEqual([[USER_ID]]);
  });

  it('refuses a stale If-Match checked against the locked row and deletes nothing', async () => {
    const world = raceDb({ lockedVersion: 2, readVersion: 1 });

    const failure = await deleteScimGroup(world.adapter, ctx, GROUP_ID, 1).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ScimError);
    expect((failure as ScimError).status).toBe(412);
    expect(world.log).toEqual(['lock-group:tx']);
    expect(world.reconciled).toEqual([]);
  });
});

describe('deleting a SCIM user removes the membership and the resource under one lock', () => {
  it('locks the resource, then deletes the membership and the resource in one transaction', async () => {
    const world = raceDb({ lockedVersion: 1, readVersion: 1 });

    await deleteScimUser(world.adapter, ctx, USER_ID);

    expect(world.log).toEqual(['lock-user:tx', 'delete-membership:tx', 'delete-user:tx']);
  });

  it('refuses a stale If-Match checked against the locked row and removes nothing', async () => {
    const world = raceDb({ lockedVersion: 2, readVersion: 1 });

    const failure = await deleteScimUser(world.adapter, ctx, USER_ID, 1).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ScimError);
    expect((failure as ScimError).status).toBe(412);
    expect(world.log).toEqual(['lock-user:tx']);
  });
});
