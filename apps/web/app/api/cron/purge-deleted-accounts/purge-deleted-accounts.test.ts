/**
 * The purge cron is the only thing that ends the deletion grace window, and —
 * since 0103 — the only thing that keeps an erased subject erased. Its due
 * queue reads `profiles.deletion_scheduled_for`, a column that lives on the row
 * the erasure deletes, so without the suppression list a restore resurrects an
 * account permanently and no query anywhere can see that it should not exist.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mocks.verifyCronRequest }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
  }),
}));
vi.mock('@/lib/server/media-storage', () => ({
  deleteStoredMediaObjects: vi.fn(async () => ({ deleted: 0, failedPathnames: [] })),
}));
vi.mock('@/lib/server/object-storage', () => ({
  deleteObject: vi.fn(),
  isObjectStorageConfigured: () => true,
  objectKeyFromPublicUrl: () => null,
  objectKeyFromStorageUri: (value: string) => value,
}));
vi.mock('@/lib/server/project-knowledge-object-storage', () => ({
  deleteProjectKnowledgeObject: vi.fn(),
  isProjectKnowledgeObjectStorageConfigured: () => true,
}));
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({ users: { deleteUser: mocks.deleteUser } }),
}));

import { GET } from './route';

interface Fixture {
  /** Undefined makes the due query throw `undefined_column`, as an unmigrated deployment would. */
  due?: Array<{ id: string }>;
  tombstones?: Array<{ user_id: string; profile_present: boolean }>;
  /** Statement fragment whose execution throws, and the pg error code it throws. */
  failStatement?: { matching: string; code?: string };
}

function primeDb(fixture: Fixture = {}): void {
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('erasure_tombstones')) {
      if (fixture.tombstones === undefined) {
        const missing = Object.assign(new Error('relation does not exist'), { code: '42P01' });
        throw missing;
      }
      return fixture.tombstones;
    }
    if (sql.includes('deletion_scheduled_for <= now()')) {
      if (fixture.due === undefined) {
        throw Object.assign(new Error('column does not exist'), { code: '42703' });
      }
      return fixture.due;
    }
    if (sql.includes('avatar_url')) return [{ avatar_url: null }];
    return [];
  });
  mocks.execute.mockImplementation(async (sql: string) => {
    if (fixture.failStatement && sql.includes(fixture.failStatement.matching)) {
      throw Object.assign(new Error('tombstone write failed'), {
        ...(fixture.failStatement.code ? { code: fixture.failStatement.code } : {}),
      });
    }
    return 1;
  });
}

function executedStatements(): string[] {
  return mocks.execute.mock.calls.map((call) => String(call[0]));
}

function indexOfStatement(fragment: string): number {
  return executedStatements().findIndex((sql) => sql.includes(fragment));
}

function cronRequest() {
  return new Request('https://agiworkforce.com/api/cron/purge-deleted-accounts') as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCronRequest.mockReturnValue(true);
  mocks.deleteUser.mockResolvedValue(undefined);
});

describe('GET /api/cron/purge-deleted-accounts', () => {
  it('401s and erases NOTHING without cron authorization', async () => {
    mocks.verifyCronRequest.mockReturnValue(false);
    primeDb({ due: [{ id: 'user-1' }], tombstones: [] });

    const response = await GET(cronRequest());

    expect(response.status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('tombstones a due account BEFORE erasing it and settles the tombstone', async () => {
    primeDb({ due: [{ id: 'user-1' }], tombstones: [] });

    const response = await GET(cronRequest());

    expect(await response.json()).toMatchObject({ purged: 1, failed: 0 });
    const opened = indexOfStatement('insert into public.erasure_tombstones');
    expect(opened).toBe(0);
    // The profile row is the last pointer to the account; the record that the
    // subject must stay erased has to be settled while it still exists.
    expect(indexOfStatement('set erased_at = now()')).toBeLessThan(
      indexOfStatement('delete from public.profiles where id = $1'),
    );
    expect(mocks.deleteUser).toHaveBeenCalledWith('user-1');
  });

  it('re-erases a resurrected account that no longer carries a deletion timestamp', async () => {
    // The whole point of the suppression list: this profile came back from a
    // restore, so nothing in `profiles` says it was ever scheduled for erasure.
    primeDb({ due: [], tombstones: [{ user_id: 'ghost-1', profile_present: true }] });

    const response = await GET(cronRequest());

    expect(await response.json()).toMatchObject({
      candidates: 0,
      resurrected: 1,
      reErased: 1,
      reErasureFailed: 0,
    });
    const statements = executedStatements();
    expect(statements.some((sql) => sql.includes('delete from public.web_conversations'))).toBe(
      true,
    );
    expect(
      statements.some((sql) => sql.includes('delete from public.profiles where id = $1')),
    ).toBe(true);
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('delete from public.'), [
      'ghost-1',
    ]);
    // The resurrected row may also mean an earlier run erased the data but
    // failed at Clerk, so the sweep has to finish the identity delete too.
    expect(mocks.deleteUser).toHaveBeenCalledWith('ghost-1');
  });

  it('keeps a resurrected profile row when the sweep cannot delete the identity', async () => {
    // Without this the sweep deletes `profiles` — and with it the only retry
    // pointer — while the identity stays signed-in-able forever.
    primeDb({ due: [], tombstones: [{ user_id: 'ghost-1', profile_present: true }] });
    mocks.deleteUser.mockRejectedValue(new Error('clerk is down'));

    const response = await GET(cronRequest());

    expect(await response.json()).toMatchObject({ reErased: 0, reErasureFailed: 1 });
    // The data still goes; it is the identity delete that failed, and only the
    // profile row can bring this subject back to either queue.
    expect(indexOfStatement('delete from public.web_conversations')).toBeGreaterThan(-1);
    expect(mocks.deleteUser).toHaveBeenCalledWith('ghost-1');
    expect(indexOfStatement('delete from public.profiles where id = $1')).toBe(-1);
  });

  it('queues resurrections first, then unfinished erasures, then a round-robin re-sweep', async () => {
    // A restore that brings back child tables without `profiles` leaves nothing
    // for the resurrection join to see, so the walk over the whole list is the
    // only thing that reaches it. Its clauses cannot be asserted through a
    // mocked driver, so the query itself is the contract.
    primeDb({ due: [], tombstones: [] });

    await GET(cronRequest());

    const sweep = mocks.query.mock.calls
      .map((call) => String(call[0]))
      .find((sql) => sql.includes('public.erasure_tombstones'))!;
    expect(sweep).toContain('profile.id is not null');
    expect(sweep).toContain('tombstone.erased_at is null');
    expect(sweep).toContain("tombstone.last_swept_at < now() - interval '30 days'");
    // All three tiers must be ORDER BY keys. `erased_at is null` in the WHERE
    // alone would let a 30-day-stale settled tombstone outrank an erasure that
    // never finished, which is the opposite of this test's name.
    expect(sweep).toContain('order by (profile.id is not null) desc');
    expect(sweep).toContain('(tombstone.erased_at is null) desc');
    expect(sweep).toContain('tombstone.last_swept_at asc\n');
    // Each sweep is a full erasure and shares the run's timeout with the due queue.
    expect(sweep).toContain('limit 5');
  });

  it('sweeps the suppression list even where the deletion columns were never provisioned', async () => {
    primeDb({ tombstones: [{ user_id: 'ghost-1', profile_present: true }] });

    const response = await GET(cronRequest());

    expect(await response.json()).toMatchObject({
      message: 'Account deletion columns are not provisioned',
      resurrected: 1,
      reErased: 1,
    });
  });

  it('does not erase a tombstoned subject twice in one run', async () => {
    primeDb({
      due: [{ id: 'user-1' }],
      tombstones: [{ user_id: 'user-1', profile_present: true }],
    });

    const response = await GET(cronRequest());

    expect(await response.json()).toMatchObject({ purged: 1, reErased: 0 });
    const profileDeletes = executedStatements().filter((sql) =>
      sql.includes('delete from public.profiles where id = $1'),
    );
    expect(profileDeletes).toHaveLength(1);
  });

  it('erases NOTHING when the tombstone cannot be written', async () => {
    // Erasing without a suppression-list entry is the exact state that made a
    // restore permanent. The guard is only worth anything before the deletes,
    // so the data and the retry pointer must both survive the run.
    primeDb({
      due: [{ id: 'user-1' }],
      tombstones: [],
      failStatement: { matching: 'insert into public.erasure_tombstones' },
    });

    const response = await GET(cronRequest());

    expect(await response.json()).toMatchObject({ purged: 0, failed: 1 });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(indexOfStatement('delete from public.web_conversations')).toBe(-1);
    expect(indexOfStatement('delete from public.profiles where id = $1')).toBe(-1);
    // The failed insert is the only statement the run got to execute.
    expect(executedStatements()).toHaveLength(1);
  });

  it('still purges the due queue on a deployment without the tombstone table', async () => {
    primeDb({
      due: [{ id: 'user-1' }],
      failStatement: { matching: 'public.erasure_tombstones', code: '42P01' },
    });

    const response = await GET(cronRequest());

    expect(await response.json()).toMatchObject({
      purged: 1,
      failed: 0,
      sweepAvailable: false,
      reErased: 0,
    });
    expect(mocks.deleteUser).toHaveBeenCalledWith('user-1');
  });
});
