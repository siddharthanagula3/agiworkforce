import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/server/request-context-cache', () => ({
  invalidateActiveOrganizationCache: vi.fn(async () => undefined),
}));
vi.mock('@/lib/server/identity', () => ({ getIdentityProvider: () => ({}) }));

type DeprovisionInput = { userId: string; organizationId: string };
const deprovisionMember = vi.fn(
  async (_db: unknown, _identity: unknown, _input: DeprovisionInput) => ({
    errors: [] as string[],
    sessionsRevoked: 2,
  }),
);
vi.mock('@/lib/services/deprovision-service', () => ({
  deprovisionMember: (db: unknown, identity: unknown, input: DeprovisionInput) =>
    deprovisionMember(db, identity, input),
}));

type IdentityEventInput = { userId: string; event: string; organizationId?: string | null };
const emitIdentitySecurityEvent = vi.fn(async (_db: unknown, _input: IdentityEventInput) => ({
  level: 'none',
  signals: [],
}));
vi.mock('@/lib/services/identity-events', () => ({
  emitIdentitySecurityEvent: (db: unknown, input: IdentityEventInput) =>
    emitIdentitySecurityEvent(db, input),
}));

vi.mock('@/lib/services/organization-verified-domains', () => ({
  listVerifiedDomains: async () => new Set(['x.test']),
  ownsEmailDomain: (email: string | null, domains: ReadonlySet<string>) =>
    typeof email === 'string' && domains.has(email.split('@')[1]?.toLowerCase() ?? ''),
}));

import { ScimError } from '../scim-protocol';
import {
  createScimUser,
  deleteScimUser,
  getScimGroup,
  listScimUsers,
  parseScimGroupResource,
  parseScimUserResource,
  parseScimResourceVersion,
  patchScimUser,
  replaceScimUser,
  strongestMappedRole,
  type ScimConnectionContext,
} from '../scim-provisioning-service';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '11111111-1111-4111-8111-222222222222';
const CONN_A = '22222222-2222-4222-8222-111111111111';
const CONN_B = '22222222-2222-4222-8222-222222222222';

const ctxA: ScimConnectionContext = { connectionId: CONN_A, organizationId: ORG_A };
const ctxB: ScimConnectionContext = { connectionId: CONN_B, organizationId: ORG_B };

interface UserRow {
  id: string;
  connection_id: string;
  organization_id: string;
  external_id: string | null;
  user_name: string;
  email: string | null;
  given_name: string | null;
  family_name: string | null;
  display_name: string | null;
  active: boolean;
  linked_user_id: string | null;
  linked_at: string | null;
  raw_attributes: unknown;
  version: number;
  created_at: string;
  updated_at: string;
}

interface GroupRow {
  id: string;
  connection_id: string;
  organization_id: string;
  external_id: string | null;
  display_name: string;
  mapped_role: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface World {
  users: UserRow[];
  groups: GroupRow[];
  members: Array<{ organization_id: string; user_id: string; role: string; source: string | null }>;
  profiles: Array<{ id: string; email: string }>;
  events: Array<{ eventType: string; payload: Record<string, unknown> | null }>;
}

let world: World;
let nextId = 0;

function uuid(): string {
  nextId += 1;
  return `33333333-3333-4333-8333-${String(nextId).padStart(12, '0')}`;
}

function norm(sql: string): string {
  return sql.replace(/\s+/gu, ' ').trim().toLowerCase();
}

function makeDb(): DatabaseAdapter {
  const adapter = {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const t = norm(sql);

      if (t.startsWith('select') && t.includes('from profiles')) {
        const email = String(params[0]).toLowerCase();
        return world.profiles.filter((p) => p.email.toLowerCase() === email) as unknown as T[];
      }

      if (t.includes('count(*)') && t.includes('from scim_provisioned_users')) {
        return [{ count: matchUsers(t, params).length }] as unknown as T[];
      }

      if (t.startsWith('select') && t.includes('from scim_provisioned_users')) {
        return matchUsers(t, params).map((row) => ({ ...row })) as unknown as T[];
      }

      if (t.startsWith('select') && t.includes('from scim_groups')) {
        return world.groups
          .filter(
            (g) =>
              g.id === params[0] &&
              g.connection_id === params[1] &&
              g.organization_id === params[2],
          )
          .map((g) => ({ ...g })) as unknown as T[];
      }

      if (t.startsWith('select') && t.includes('from organization_members')) {
        return world.members
          .filter((m) => m.organization_id === params[0] && m.user_id === params[1])
          .map((m) => ({ role: m.role, provisioning_source: m.source })) as unknown as T[];
      }

      if (t.includes('insert into scim_provisioned_users')) {
        const row: UserRow = {
          id: uuid(),
          connection_id: params[0] as string,
          organization_id: params[1] as string,
          external_id: params[2] as string | null,
          user_name: params[3] as string,
          email: params[4] as string | null,
          given_name: params[5] as string | null,
          family_name: params[6] as string | null,
          display_name: params[7] as string | null,
          active: params[8] as boolean,
          linked_user_id: null,
          linked_at: null,
          raw_attributes: params[9] ?? null,
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const clash = world.users.find(
          (u) =>
            u.connection_id === row.connection_id &&
            (u.user_name.toLowerCase() === row.user_name.toLowerCase() ||
              (row.external_id !== null && u.external_id === row.external_id)),
        );
        if (clash) throw Object.assign(new Error('duplicate'), { code: '23505' });
        world.users.push(row);
        return [{ ...row }] as unknown as T[];
      }

      if (t.includes('update scim_provisioned_users') && t.includes('version = version + 1')) {
        const row = world.users.find(
          (u) =>
            u.id === params[0] && u.connection_id === params[1] && u.organization_id === params[2],
        );
        if (!row) return [] as unknown as T[];
        const stale = t.includes('and version = $12') || t.includes('and version = $11');
        if (stale && row.version !== params[params.length - 1]) return [] as unknown as T[];
        const isReplace = t.includes('raw_attributes');
        if (isReplace) {
          row.external_id = params[3] as string | null;
          row.user_name = params[4] as string;
          row.email = params[5] as string | null;
          row.active = params[9] as boolean;
        } else {
          row.user_name = params[3] as string;
          row.external_id = params[4] as string | null;
          row.email = params[5] as string | null;
          row.active = params[9] as boolean;
        }
        row.version += 1;
        return [{ ...row }] as unknown as T[];
      }

      return [] as unknown as T[];
    },

    async execute(sql: string, params: unknown[] = []): Promise<number> {
      const t = norm(sql);

      if (t.includes('insert into directory_sync_events')) {
        world.events.push({
          eventType: params[2] as string,
          payload: params[4] ? (JSON.parse(params[4] as string) as Record<string, unknown>) : null,
        });
        return 1;
      }

      if (t.includes('update scim_provisioned_users') && t.includes('linked_user_id')) {
        const row = world.users.find((u) => u.id === params[1]);
        if (row) row.linked_user_id = params[0] as string;
        return 1;
      }

      if (t.includes('delete from organization_members')) {
        const before = world.members.length;
        world.members = world.members.filter(
          (m) =>
            !(m.organization_id === params[0] && m.user_id === params[1] && m.role !== 'owner'),
        );
        return before - world.members.length;
      }

      if (t.includes('insert into organization_members')) {
        const role = (params[2] as string | null) ?? 'member';
        const existing = world.members.find(
          (m) => m.organization_id === params[0] && m.user_id === params[1],
        );
        if (existing) {
          if (existing.role !== 'owner') existing.role = role;
          existing.source = 'scim';
        } else {
          world.members.push({
            organization_id: params[0] as string,
            user_id: params[1] as string,
            role,
            source: 'scim',
          });
        }
        return 1;
      }

      if (t.includes('delete from scim_provisioned_users')) {
        const before = world.users.length;
        world.users = world.users.filter((u) => u.id !== params[0]);
        return before - world.users.length;
      }

      return 1;
    },

    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
      return fn(adapter as DatabaseAdapter);
    },
  };
  return adapter as unknown as DatabaseAdapter;
}

function matchUsers(t: string, params: unknown[]): UserRow[] {
  if (t.includes('where id = $1')) {
    return world.users.filter(
      (u) => u.id === params[0] && u.connection_id === params[1] && u.organization_id === params[2],
    );
  }
  const scoped = world.users.filter(
    (u) => u.connection_id === params[0] && u.organization_id === params[1],
  );
  if (t.includes('external_id = $3')) return scoped.filter((u) => u.external_id === params[2]);
  if (t.includes('lower(user_name) = lower($3)')) {
    return scoped.filter((u) => u.user_name.toLowerCase() === String(params[2]).toLowerCase());
  }
  return scoped;
}

let db: DatabaseAdapter;

beforeEach(() => {
  nextId = 0;
  deprovisionMember.mockClear();
  deprovisionMember.mockResolvedValue({ errors: [], sessionsRevoked: 2 });
  emitIdentitySecurityEvent.mockClear();
  world = {
    users: [],
    groups: [],
    members: [],
    profiles: [
      { id: 'profile-a', email: 'ada@x.test' },
      { id: 'profile-b', email: 'grace@x.test' },
    ],
    events: [],
  };
  db = makeDb();
});

const body = (over: Record<string, unknown> = {}) => ({
  userName: 'ada@x.test',
  externalId: 'ext-1',
  emails: [{ value: 'ada@x.test', primary: true }],
  active: true,
  ...over,
});

describe('external ID collision across tenants', () => {
  it('does not merge two users who share an externalId in different workspaces', async () => {
    const a = await createScimUser(db, ctxA, parseScimUserResource(body()), body());
    const bBody = body({ userName: 'grace@x.test', emails: [{ value: 'grace@x.test' }] });
    const b = await createScimUser(db, ctxB, parseScimUserResource(bBody), bBody);

    expect(a.id).not.toBe(b.id);
    expect(a.external_id).toBe('ext-1');
    expect(b.external_id).toBe('ext-1');

    const found = await listScimUsers(
      db,
      ctxA,
      { attribute: 'externalId', operator: 'eq', value: 'ext-1' },
      { startIndex: 1, count: 10, offset: 0 },
    );
    expect(found.rows.map((row) => row.id)).toEqual([a.id]);
  });

  it('refuses a second user with the same externalId inside one connection', async () => {
    await createScimUser(db, ctxA, parseScimUserResource(body()), body());
    const second = body({ userName: 'grace@x.test', emails: [{ value: 'grace@x.test' }] });
    await expect(
      createScimUser(db, ctxA, parseScimUserResource(second), second),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('cross-org group reads', () => {
  it('will not return another workspace group by id', async () => {
    const groupId = uuid();
    world.groups.push({
      id: groupId,
      connection_id: CONN_A,
      organization_id: ORG_A,
      external_id: null,
      display_name: 'Engineering',
      mapped_role: 'member',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    expect(await getScimGroup(db, ctxA, groupId)).not.toBeNull();
    expect(await getScimGroup(db, ctxB, groupId)).toBeNull();
  });
});

describe('malicious display names', () => {
  it.each([
    ['right-to-left override', 'Ada‮eciffO'],
    ['newline', 'Ada\nAdmin'],
    ['zero width space', 'Ad​a'],
    ['null byte', 'Ada '],
  ])('refuses a %s in a user display name', async (_label, displayName) => {
    expect(() => parseScimUserResource(body({ displayName }))).toThrow(ScimError);
  });

  it('refuses a control character in a group display name', () => {
    expect(() => parseScimGroupResource({ displayName: 'Eng‭ineering' })).toThrow(ScimError);
  });

  it('keeps an ordinary non-latin name', () => {
    const parsed = parseScimUserResource(body({ displayName: 'Ада Лавлейс' }));
    expect(parsed.displayName).toBe('Ада Лавлейс');
  });
});

describe('deprovision revokes live credentials', () => {
  async function provisioned() {
    const created = await createScimUser(db, ctxA, parseScimUserResource(body()), body());
    expect(world.members).toHaveLength(1);
    return created;
  }

  it('revokes sessions and device tokens when the IdP deletes the user', async () => {
    const user = await provisioned();
    await deleteScimUser(db, ctxA, user.id);

    expect(world.members).toHaveLength(0);
    expect(deprovisionMember).toHaveBeenCalledTimes(1);
    expect(deprovisionMember.mock.calls[0]?.[2]).toMatchObject({
      userId: 'profile-a',
      organizationId: ORG_A,
    });
    const event = world.events.find((e) => e.eventType === 'user.deprovisioned');
    expect(event?.payload).toMatchObject({ membershipRevoked: true, credentialsRevoked: true });
  });

  it('tells the person their sessions ended, through the shared identity event', async () => {
    const user = await provisioned();
    await deleteScimUser(db, ctxA, user.id);

    expect(emitIdentitySecurityEvent).toHaveBeenCalledTimes(1);
    expect(emitIdentitySecurityEvent.mock.calls[0]?.[1]).toMatchObject({
      userId: 'profile-a',
      event: 'all_sessions_revoked',
      organizationId: ORG_A,
      surface: 'scim',
    });
  });

  it('stays silent when the removal ended no live session', async () => {
    const user = await provisioned();
    deprovisionMember.mockResolvedValue({ errors: [], sessionsRevoked: 0 });

    await deleteScimUser(db, ctxA, user.id);

    expect(emitIdentitySecurityEvent).not.toHaveBeenCalled();
  });

  it('records an announcement failure without failing the deprovision', async () => {
    const user = await provisioned();
    emitIdentitySecurityEvent.mockRejectedValueOnce(new Error('notifications are down'));

    await expect(deleteScimUser(db, ctxA, user.id)).resolves.toBeUndefined();

    const event = world.events.find((e) => e.eventType === 'user.deprovisioned');
    expect(event?.payload).toMatchObject({ membershipRevoked: true, credentialsRevoked: false });
    expect(event?.payload?.['revocationWarnings']).toEqual([
      'Revocation was not announced: notifications are down',
    ]);
  });

  it('revokes them on a deactivating PATCH too, and records what it could not reach', async () => {
    const user = await provisioned();
    deprovisionMember.mockResolvedValue({
      errors: ['2 session(s) could not be revoked'],
      sessionsRevoked: 0,
    });

    await patchScimUser(db, ctxA, user.id, [{ op: 'replace', path: 'active', value: false }]);

    expect(world.members).toHaveLength(0);
    expect(deprovisionMember).toHaveBeenCalledTimes(1);
    const event = world.events.find((e) => e.eventType === 'user.deactivated');
    expect(event?.payload).toMatchObject({ membershipRevoked: true, credentialsRevoked: false });
    expect(event?.payload?.['revocationWarnings']).toEqual(['2 session(s) could not be revoked']);
  });

  it('restores membership when the IdP re-enables the same user', async () => {
    const user = await provisioned();
    await patchScimUser(db, ctxA, user.id, [{ op: 'replace', path: 'active', value: false }]);
    expect(world.members).toHaveLength(0);

    await patchScimUser(db, ctxA, user.id, [{ op: 'replace', path: 'active', value: true }]);
    expect(world.members).toHaveLength(1);
    expect(deprovisionMember).toHaveBeenCalledTimes(1);
  });
});

describe('out-of-order writes', () => {
  it('reads the version an IdP sent back', () => {
    expect(parseScimResourceVersion('W/"7"')).toBe(7);
    expect(parseScimResourceVersion('"7"')).toBe(7);
    expect(parseScimResourceVersion('*')).toBeNull();
    expect(parseScimResourceVersion(null)).toBeNull();
    expect(() => parseScimResourceVersion('garbage')).toThrow(ScimError);
  });

  it('refuses a replace built from a stale read', async () => {
    const user = await createScimUser(db, ctxA, parseScimUserResource(body()), body());
    const next = body({ displayName: 'Ada L' });
    await replaceScimUser(db, ctxA, user.id, parseScimUserResource(next), next, user.version);

    await expect(
      replaceScimUser(db, ctxA, user.id, parseScimUserResource(next), next, user.version),
    ).rejects.toMatchObject({ status: 412 });
  });

  it('refuses a deactivating patch that arrives after a newer write', async () => {
    const user = await createScimUser(db, ctxA, parseScimUserResource(body()), body());
    await patchScimUser(db, ctxA, user.id, [
      { op: 'replace', path: 'displayName', value: 'Ada L' },
    ]);

    await expect(
      patchScimUser(
        db,
        ctxA,
        user.id,
        [{ op: 'replace', path: 'active', value: false }],
        user.version,
      ),
    ).rejects.toMatchObject({ status: 412 });
    expect(world.members).toHaveLength(1);
  });
});

describe('overlapping group role mappings', () => {
  it('gives a member of several groups the strongest role, in any order', () => {
    expect(strongestMappedRole(['viewer', 'admin', 'member'])).toBe('admin');
    expect(strongestMappedRole(['admin', 'viewer'])).toBe('admin');
    expect(strongestMappedRole(['viewer', 'member'])).toBe('member');
    expect(strongestMappedRole([null, 'viewer'])).toBe('viewer');
    expect(strongestMappedRole([null, null])).toBeNull();
  });
});
