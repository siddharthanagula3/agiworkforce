import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { deprovisionMember } from '../deprovision-service';

const USER = 'user-leaver';
const OTHER_USER = 'user-stays';
const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';

interface ConnectorFixture {
  id: string;
  ownerUserId: string;
}

interface ShareFixture {
  organizationId: string;
  connectorRowId: string;
  sharedByUserId: string;
  orgShortId: string;
}

/** The leaver's own connector, shared into the workspace they are leaving. */
const LEAVER_SHARE: ShareFixture = {
  organizationId: ORG,
  connectorRowId: 'conn-leaver-this-org',
  sharedByUserId: USER,
  orgShortId: 'aaaaaaaaaa',
};

/** The leaver's own connector, shared into a workspace they are staying in. */
const LEAVER_OTHER_ORG_SHARE: ShareFixture = {
  organizationId: OTHER_ORG,
  connectorRowId: 'conn-leaver-other-org',
  sharedByUserId: USER,
  orgShortId: 'bbbbbbbbbb',
};

/**
 * A connector owned by someone who is staying, which reached this workspace
 * through the leaver. Ownership, not who pressed share, decides whose token is
 * about to be orphaned, so this one must survive.
 */
const COLLEAGUE_SHARE: ShareFixture = {
  organizationId: ORG,
  connectorRowId: 'conn-colleague',
  sharedByUserId: USER,
  orgShortId: 'cccccccccc',
};

const CONNECTORS: ConnectorFixture[] = [
  { id: LEAVER_SHARE.connectorRowId, ownerUserId: USER },
  { id: LEAVER_OTHER_ORG_SHARE.connectorRowId, ownerUserId: USER },
  { id: COLLEAGUE_SHARE.connectorRowId, ownerUserId: OTHER_USER },
];

const ALL_SHARES: ShareFixture[] = [LEAVER_SHARE, LEAVER_OTHER_ORG_SHARE, COLLEAGUE_SHARE];

function identityStub({
  sessions = ['sess_1', 'sess_2'],
  listThrows = false,
  failIds = [] as string[],
} = {}) {
  const revoked: string[] = [];
  const listed = (id: string) => ({
    id,
    userId: USER,
    status: 'active',
    createdAt: null,
    lastActiveAt: null,
    expireAt: null,
    latestActivity: null,
  });
  return {
    revoked,
    identity: {
      listUserSessions: vi.fn(async (_userId: string, options: { offset?: number } = {}) => {
        if (listThrows) throw new Error('identity provider unavailable');
        const page = (options.offset ?? 0) === 0 ? sessions.map(listed) : [];
        return { sessions: page, totalCount: sessions.length };
      }),
      revokeSession: vi.fn(async (id: string) => {
        if (failIds.includes(id)) throw new Error('revoke failed');
        revoked.push(id);
      }),
    },
  };
}

/**
 * Reads the value a statement binds to a column, or null when the statement
 * does not constrain it at all. The share fixtures are filtered by exactly the
 * predicates the statement carries, the way Postgres would: a widened or
 * dropped bound returns the extra rows here too, instead of the stub quietly
 * answering with the rows the test hoped for.
 */
function boundValue(text: string, column: string, params: unknown[]): { value: unknown } | null {
  const match = new RegExp(`${column}\\s*=\\s*\\$(\\d+)`).exec(text);
  return match ? { value: params[Number(match[1]) - 1] } : null;
}

function dbStub({
  deviceRows = [{ id: 'd1' }, { id: 'd2' }],
  keyRows = [{ id: 'k1' }],
  deviceThrows = false,
  keyThrows = false,
  connectors = [] as ConnectorFixture[],
  shares = [] as ShareFixture[],
  discoveryThrows = false,
  unshareThrows = false,
} = {}) {
  const statements: string[] = [];
  /** Share rows still in the table, mutated by the unshare DELETE below. */
  const live: ShareFixture[] = [...shares];
  const ownerOf = (rowId: string) => connectors.find((c) => c.id === rowId)?.ownerUserId;

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const text = String(sql);
    statements.push(text);
    if (/device_refresh_tokens/.test(text)) {
      if (deviceThrows) throw new Error('device table unavailable');
      return deviceRows;
    }
    if (/api_keys/.test(text)) {
      if (keyThrows) throw new Error('api key table unavailable');
      return keyRows;
    }
    if (/^\s*select/i.test(text) && /organization_shared_connectors/.test(text)) {
      if (discoveryThrows) throw new Error('share table unavailable');
      const org = boundValue(text, 's\\.organization_id', params);
      const owner = boundValue(text, 'c\\.user_id', params);
      const sharer = boundValue(text, 's\\.shared_by_user_id', params);
      return (
        live
          // The join to user_custom_connectors drops shares whose connector row
          // no longer exists.
          .filter((share) => ownerOf(share.connectorRowId) !== undefined)
          .filter((share) => (org ? share.organizationId === org.value : true))
          .filter((share) => (owner ? ownerOf(share.connectorRowId) === owner.value : true))
          .filter((share) => (sharer ? share.sharedByUserId === sharer.value : true))
          .map((share) => ({ connector_row_id: share.connectorRowId }))
      );
    }
    if (/^\s*delete\s+from\s+public\.organization_shared_connectors/i.test(text)) {
      if (unshareThrows) throw new Error('unshare failed');
      const [organizationId, connectorRowId] = params as [string, string];
      const index = live.findIndex(
        (share) =>
          share.organizationId === organizationId && share.connectorRowId === connectorRowId,
      );
      if (index === -1) return [];
      const [removed] = live.splice(index, 1);
      return [{ org_short_id: removed!.orgShortId }];
    }
    return [];
  });
  return { db: { query, execute: vi.fn() } as unknown as DatabaseAdapter, query, statements, live };
}

beforeEach(() => vi.clearAllMocks());

describe('deprovisionMember', () => {
  it('revokes every live session, device token, and API key', async () => {
    const identity = identityStub();
    const db = dbStub();

    const result = await deprovisionMember(db.db, identity.identity, {
      userId: USER,
      organizationId: ORG,
    });

    expect(result.sessionsRevoked).toBe(2);
    expect(result.deviceTokensRevoked).toBe(2);
    expect(result.apiKeysRevoked).toBe(1);
    expect(result.errors).toEqual([]);
    expect(identity.revoked).toEqual(['sess_1', 'sess_2']);
  });

  it('does not report zero sessions when it could not list them', async () => {
    // Reporting zero would read as "this user had no sessions", which is the
    // opposite of the truth and would let an administrator believe the leaver
    // was cut off.
    const identity = identityStub({ listThrows: true });
    const db = dbStub();

    const result = await deprovisionMember(db.db, identity.identity, {
      userId: USER,
      organizationId: ORG,
    });

    expect(result.sessionsRevoked).toBe(0);
    expect(result.errors.join(' ')).toMatch(/could not list sessions/i);
  });

  it('still revokes local credentials when the identity provider is unavailable', async () => {
    // A provider outage must not leave the leaver's developer keys live as well.
    const identity = identityStub({ listThrows: true });
    const db = dbStub();

    const result = await deprovisionMember(db.db, identity.identity, {
      userId: USER,
      organizationId: ORG,
    });

    expect(result.deviceTokensRevoked).toBe(2);
    expect(result.apiKeysRevoked).toBe(1);
  });

  it('still revokes sessions when the device table is unreachable', async () => {
    const identity = identityStub();
    const db = dbStub({ deviceThrows: true });

    const result = await deprovisionMember(db.db, identity.identity, {
      userId: USER,
      organizationId: ORG,
    });

    expect(result.sessionsRevoked).toBe(2);
    expect(result.apiKeysRevoked).toBe(1);
    expect(result.errors.join(' ')).toMatch(/device tokens were not revoked/i);
  });

  it('reports sessions it failed to revoke rather than counting them as done', async () => {
    const identity = identityStub({ failIds: ['sess_2'] });
    const db = dbStub();

    const result = await deprovisionMember(db.db, identity.identity, {
      userId: USER,
      organizationId: ORG,
    });

    expect(result.sessionsRevoked).toBe(1);
    expect(result.sessionsFailed).toBe(1);
    expect(result.errors.join(' ')).toMatch(/may still be live/i);
  });

  it('only touches credentials that are still live', async () => {
    const identity = identityStub();
    const db = dbStub();
    await deprovisionMember(db.db, identity.identity, { userId: USER, organizationId: ORG });

    // Scoped to the credential-revocation writes this policed from the start.
    // The shared-connector steps run against a table that has no revoked_at
    // column and are asserted by behaviour in the cases below; re-revoking an
    // already-revoked token is what this one exists to catch.
    const revocations = db.statements.filter((sql) => /^\s*update/i.test(sql));
    expect(revocations).toHaveLength(2);
    for (const sql of revocations) {
      expect(sql).toMatch(/revoked_at is null/);
      expect(sql).toMatch(/user_id = \$1/);
    }
  });

  it('never deletes the account, only its credentials', async () => {
    // Removing a member from one workspace must not destroy their personal
    // account. They sign in again and land in personal scope.
    const identity = identityStub();
    const db = dbStub();
    await deprovisionMember(db.db, identity.identity, { userId: USER, organizationId: ORG });

    for (const sql of db.statements) {
      expect(sql).not.toMatch(/delete from/i);
      expect(sql).not.toMatch(/profiles/i);
    }
  });

  it('pages through more sessions than one request returns', async () => {
    const many = Array.from({ length: 50 }, (_, i) => `sess_${i}`);
    const identity = identityStub({ sessions: many });
    const db = dbStub();

    const result = await deprovisionMember(db.db, identity.identity, {
      userId: USER,
      organizationId: ORG,
    });

    expect(result.sessionsRevoked).toBe(50);
    expect(identity.identity.listUserSessions).toHaveBeenCalledTimes(2);
  });

  describe('connectors the leaver shared with the workspace', () => {
    function run(overrides: Parameters<typeof dbStub>[0] = {}) {
      const identity = identityStub();
      const db = dbStub({ connectors: CONNECTORS, shares: ALL_SHARES, ...overrides });
      return {
        db,
        result: deprovisionMember(db.db, identity.identity, { userId: USER, organizationId: ORG }),
      };
    }

    /**
     * Every share row the discovery step decided to remove. Asserted directly
     * because the DELETE is itself organization-scoped: a discovery query that
     * had lost its organization bound would still leave the other workspace's
     * row in place, and only the attempt reveals it.
     */
    function unshareAttempts(db: ReturnType<typeof dbStub>) {
      return db.query.mock.calls
        .filter(([sql]) =>
          /^\s*delete\s+from\s+public\.organization_shared_connectors/i.test(String(sql)),
        )
        .map(([, params]) => params);
    }

    it('unshares the connector they own and shared with this workspace', async () => {
      // Their bearer token is the credential the session and key revocations
      // cannot reach: the org keeps invoking the tool with it until the share
      // row is gone.
      const { db, result } = run();

      expect((await result).sharedConnectorsUnshared).toBe(1);
      expect(db.live.map((share) => share.connectorRowId)).not.toContain(
        LEAVER_SHARE.connectorRowId,
      );
      expect(unshareAttempts(db)).toEqual([[ORG, LEAVER_SHARE.connectorRowId]]);
    });

    it('leaves the connector they share with a different workspace alone', async () => {
      // They are still a member there. Removing that share would deprovision a
      // workspace nobody asked about.
      const { db, result } = run();
      await result;

      expect(db.live).toContainEqual(LEAVER_OTHER_ORG_SHARE);
      expect(unshareAttempts(db)).not.toContainEqual([ORG, LEAVER_OTHER_ORG_SHARE.connectorRowId]);
    });

    it("leaves another member's connector shared with this workspace alone", async () => {
      // The leaver pressed share, but the token belongs to a colleague who is
      // staying, unsharing it would cut the workspace off from a live
      // connector for no reason.
      const { db, result } = run();

      expect((await result).sharedConnectorsUnshared).toBe(1);
      expect(db.live).toContainEqual(COLLEAGUE_SHARE);
      expect(unshareAttempts(db)).not.toContainEqual([ORG, COLLEAGUE_SHARE.connectorRowId]);
    });

    it('still reports the earlier revocations when unsharing fails', async () => {
      const { result } = run({ unshareThrows: true });
      const settled = await result;

      expect(settled.sessionsRevoked).toBe(2);
      expect(settled.deviceTokensRevoked).toBe(2);
      expect(settled.apiKeysRevoked).toBe(1);
      expect(settled.sharedConnectorsUnshared).toBe(0);
      expect(settled.errors.join(' ')).toMatch(/were not unshared/i);
    });

    it('still reports the earlier revocations when the shares cannot be listed', async () => {
      const { result } = run({ discoveryThrows: true });
      const settled = await result;

      expect(settled.sessionsRevoked).toBe(2);
      expect(settled.deviceTokensRevoked).toBe(2);
      expect(settled.apiKeysRevoked).toBe(1);
      expect(settled.errors.join(' ')).toMatch(/were not unshared/i);
    });
  });
});
