import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { deprovisionMember } from '../deprovision-service';

const USER = 'user-leaver';
const ORG = '11111111-1111-4111-8111-111111111111';

function clerkStub({
  sessions = ['sess_1', 'sess_2'],
  listThrows = false,
  failIds = [] as string[],
} = {}) {
  const revoked: string[] = [];
  return {
    revoked,
    client: {
      sessions: {
        getSessionList: vi.fn(async ({ offset }: { offset: number }) => {
          if (listThrows) throw new Error('clerk unavailable');
          return { data: offset === 0 ? sessions.map((id) => ({ id })) : [] };
        }),
        revokeSession: vi.fn(async (id: string) => {
          if (failIds.includes(id)) throw new Error('revoke failed');
          revoked.push(id);
          return {};
        }),
      },
    },
  };
}

function dbStub({
  deviceRows = [{ id: 'd1' }, { id: 'd2' }],
  keyRows = [{ id: 'k1' }],
  deviceThrows = false,
  keyThrows = false,
} = {}) {
  const statements: string[] = [];
  const query = vi.fn(async (sql: string) => {
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
    return [];
  });
  return { db: { query, execute: vi.fn() } as unknown as DatabaseAdapter, query, statements };
}

beforeEach(() => vi.clearAllMocks());

describe('deprovisionMember', () => {
  it('revokes every live session, device token, and API key', async () => {
    const clerk = clerkStub();
    const db = dbStub();

    const result = await deprovisionMember(db.db, clerk.client, {
      userId: USER,
      organizationId: ORG,
    });

    expect(result.sessionsRevoked).toBe(2);
    expect(result.deviceTokensRevoked).toBe(2);
    expect(result.apiKeysRevoked).toBe(1);
    expect(result.errors).toEqual([]);
    expect(clerk.revoked).toEqual(['sess_1', 'sess_2']);
  });

  it('does not report zero sessions when it could not list them', async () => {
    // Reporting zero would read as "this user had no sessions", which is the
    // opposite of the truth and would let an administrator believe the leaver
    // was cut off.
    const clerk = clerkStub({ listThrows: true });
    const db = dbStub();

    const result = await deprovisionMember(db.db, clerk.client, {
      userId: USER,
      organizationId: ORG,
    });

    expect(result.sessionsRevoked).toBe(0);
    expect(result.errors.join(' ')).toMatch(/could not list sessions/i);
  });

  it('still revokes local credentials when Clerk is unavailable', async () => {
    // A Clerk outage must not leave the leaver's developer keys live as well.
    const clerk = clerkStub({ listThrows: true });
    const db = dbStub();

    const result = await deprovisionMember(db.db, clerk.client, {
      userId: USER,
      organizationId: ORG,
    });

    expect(result.deviceTokensRevoked).toBe(2);
    expect(result.apiKeysRevoked).toBe(1);
  });

  it('still revokes sessions when the device table is unreachable', async () => {
    const clerk = clerkStub();
    const db = dbStub({ deviceThrows: true });

    const result = await deprovisionMember(db.db, clerk.client, {
      userId: USER,
      organizationId: ORG,
    });

    expect(result.sessionsRevoked).toBe(2);
    expect(result.apiKeysRevoked).toBe(1);
    expect(result.errors.join(' ')).toMatch(/device tokens were not revoked/i);
  });

  it('reports sessions it failed to revoke rather than counting them as done', async () => {
    const clerk = clerkStub({ failIds: ['sess_2'] });
    const db = dbStub();

    const result = await deprovisionMember(db.db, clerk.client, {
      userId: USER,
      organizationId: ORG,
    });

    expect(result.sessionsRevoked).toBe(1);
    expect(result.sessionsFailed).toBe(1);
    expect(result.errors.join(' ')).toMatch(/may still be live/i);
  });

  it('only touches credentials that are still live', async () => {
    const clerk = clerkStub();
    const db = dbStub();
    await deprovisionMember(db.db, clerk.client, { userId: USER, organizationId: ORG });

    for (const sql of db.statements) {
      expect(sql).toMatch(/revoked_at is null/);
      expect(sql).toMatch(/user_id = \$1/);
    }
  });

  it('never deletes the account, only its credentials', async () => {
    // Removing a member from one workspace must not destroy their personal
    // account. They sign in again and land in personal scope.
    const clerk = clerkStub();
    const db = dbStub();
    await deprovisionMember(db.db, clerk.client, { userId: USER, organizationId: ORG });

    for (const sql of db.statements) {
      expect(sql).not.toMatch(/delete from/i);
      expect(sql).not.toMatch(/profiles/i);
    }
  });

  it('pages through more sessions than one request returns', async () => {
    const many = Array.from({ length: 50 }, (_, i) => `sess_${i}`);
    const clerk = clerkStub({ sessions: many });
    const db = dbStub();

    const result = await deprovisionMember(db.db, clerk.client, {
      userId: USER,
      organizationId: ORG,
    });

    expect(result.sessionsRevoked).toBe(50);
    expect(clerk.client.sessions.getSessionList).toHaveBeenCalledTimes(2);
  });
});
