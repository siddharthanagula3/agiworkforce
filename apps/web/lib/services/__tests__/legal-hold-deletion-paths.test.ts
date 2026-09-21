import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const ORG = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  deleteStoredMediaObjects: vi.fn(async (paths: (string | null)[]) => ({
    deleted: paths.filter(Boolean).length,
    failedPathnames: [] as string[],
  })),
  deleteStoredMedia: vi.fn(async () => undefined),
  resolveActiveOrganizationId: vi.fn(async () => '11111111-1111-4111-8111-111111111111'),
  verifyCronRequest: vi.fn(() => true),
  recordAuditEvent: vi.fn(async () => undefined),
  db: { current: null as unknown },
}));

vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }));

vi.mock('@/lib/server/media-storage', () => ({
  deleteStoredMediaObjects: mocks.deleteStoredMediaObjects,
  deleteStoredMedia: mocks.deleteStoredMedia,
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: mocks.resolveActiveOrganizationId,
}));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mocks.verifyCronRequest }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => mocks.db.current }));
vi.mock('@agiworkforce/object-storage', () => ({
  abortOrphanedMultipartUploads: vi.fn(async () => ({ aborted: 0 })),
  hasObjectStorageCredentials: () => false,
}));
vi.mock('@/lib/server/object-storage-runtime', () => ({
  getObjectStore: () => ({}),
  objectStorageConfig: () => ({ publicBucket: null, privateBucket: null }),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { purgeSoftDeletedResources } from '@/lib/resources/purge-soft-deleted';
import { permanentlyDeleteMediaAsset } from '@/lib/server/media-assets';
import { purgeTemporaryChatFiles } from '@/lib/server/temporary-files/purge';
import { deleteMessages } from '@/app/api/chat/conversations/[id]/messages/lib/message-thread';
import { createDomainSweepers } from '../domain-retention-service';
import { HELD_DELETION_REFUSAL, legalHoldExclusion } from '../legal-hold-gate';
import { FakePostgres } from './fake-postgres';

const HELD = 'alice';
const FREE = 'bob';

/**
 * One held row and one unheld sibling in every store, all far past whatever
 * window the path enforces, under a custodian hold that is the shape the old
 * member-only lists missed entirely.
 */
function world(hold: 'custodian' | 'released' = 'custodian') {
  const old = '2020-01-01T00:00:00.000Z';
  return new FakePostgres({
    legal_holds: [
      {
        id: 'hold-1',
        organization_id: ORG,
        scope: 'custodian',
        subject_user_id: null,
        resource_types: null,
        released_at: hold === 'released' ? '2026-09-01T00:00:00.000Z' : null,
      },
    ],
    legal_hold_custodians: [{ hold_id: 'hold-1', user_id: HELD }],
    organization_members: [
      { organization_id: ORG, user_id: HELD },
      { organization_id: ORG, user_id: FREE },
    ],
    web_conversations: [
      {
        id: 'conv-held',
        user_id: HELD,
        organization_id: ORG,
        deleted_at: old,
        updated_at: old,
        created_at: old,
        is_temporary: true,
      },
      {
        id: 'conv-free',
        user_id: FREE,
        organization_id: ORG,
        deleted_at: old,
        updated_at: old,
        created_at: old,
        is_temporary: true,
      },
    ],
    web_messages: [
      { id: 'msg-held', conversation_id: 'conv-held', deleted_at: old },
      { id: 'msg-free', conversation_id: 'conv-free', deleted_at: old },
    ],
    web_artifacts: [
      { id: 'art-held', user_id: HELD, organization_id: ORG, deleted_at: old, updated_at: old },
      { id: 'art-free', user_id: FREE, organization_id: ORG, deleted_at: old, updated_at: old },
    ],
    media_assets: [
      {
        id: 'file-held',
        user_id: HELD,
        organization_id: ORG,
        deleted_at: old,
        created_at: old,
        temporary_chat: true,
        storage_pathname: 'held.bin',
      },
      {
        id: 'file-free',
        user_id: FREE,
        organization_id: ORG,
        deleted_at: old,
        created_at: old,
        temporary_chat: true,
        storage_pathname: 'free.bin',
      },
    ],
    notifications: [
      { id: 'note-held', user_id: HELD, created_at: old },
      { id: 'note-free', user_id: FREE, created_at: old },
    ],
  });
}

function ids(db: FakePostgres, table: string): string[] {
  return db
    .rowsIn(table)
    .map((row) => String(row['id']))
    .sort();
}

/**
 * What each path must carry, expressed as the gate's own rendering rather than
 * as a string written here. `legal-hold-gate.test.ts` proves that rendering
 * behaves the way Postgres would, row by row and scope by scope; these tests
 * prove each destructive path carries exactly it, over the store it destroys,
 * inside the statement that destroys rather than in a read before it.
 *
 * Delete the predicate from any one of these paths and its case fails here.
 */
function expectedPredicate(
  resourceType: Parameters<typeof legalHoldExclusion>[0],
  alias: string,
  nextParamIndex: number,
  extra: { organization?: string; owner?: string; coversParam?: string } = {},
): string {
  return legalHoldExclusion(resourceType, { alias, nextParamIndex, ...extra }).sql;
}

interface Recorded {
  sql: string;
  params: unknown[];
}

function recorder(rows: (sql: string) => unknown[] = () => []) {
  const calls: Recorded[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return rows(sql);
  });
  const db = {
    query,
    execute: query,
    transaction: async (run: (tx: unknown) => unknown) => run({ query }),
  } as unknown as DatabaseAdapter;
  return { db, calls };
}

function destructive(calls: Recorded[]): Recorded[] {
  return calls.filter((call) => /delete\s+from|for update/i.test(call.sql));
}

beforeEach(() => vi.clearAllMocks());

describe('every destructive path carries the gate inside its own statement', () => {
  it('the registry purge, for each of the six stores it ends the window for', async () => {
    const { db, calls } = recorder();

    await purgeSoftDeletedResources(db);

    const byStore: Record<string, string> = {
      web_conversations: 'conversation',
      web_messages: 'message',
      web_artifacts: 'artifact',
    };
    const deletes = destructive(calls);
    expect(deletes).toHaveLength(3);
    for (const call of deletes) {
      const table = /delete from public\.(\w+)/u.exec(call.sql)?.[1] ?? '';
      const store = byStore[table];
      expect(store).toBeDefined();
      expect(call.sql).toContain(
        expectedPredicate(store as Parameters<typeof legalHoldExclusion>[0], 'candidate', 3),
      );
      expect(call.params).toContain(store);
    }
  });

  it('the temporary chat attachment purge, which a product promise does not override', async () => {
    const { db, calls } = recorder((sql) =>
      /select candidate\.id/u.test(sql) ? [{ id: 'file-1', storage_pathname: 'a.bin' }] : [],
    );

    await purgeTemporaryChatFiles(db);

    // The candidate read decides before a byte is touched, and the delete
    // carries it again so a hold placed in between still wins.
    const candidates = calls.find((call) => /select candidate\.id/u.test(call.sql));
    expect(candidates?.sql).toContain(expectedPredicate('file', 'candidate', 3));
    expect(candidates?.params).toContain('file');

    const deletion = destructive(calls)[0];
    expect(deletion?.sql).toContain(expectedPredicate('file', 'target', 2));
    expect(deletion?.params).toContain('file');
  });

  it('the deleted media cron, before it reaches object storage', async () => {
    const { db, calls } = recorder((sql) =>
      /select candidate\.id/u.test(sql) ? [{ id: 'file-1', storage_pathname: 'a.bin' }] : [],
    );
    mocks.db.current = db;
    const { GET } = await import('@/app/api/cron/purge-deleted-media/route');

    await GET(new Request('https://x/api/cron') as never);

    const candidates = calls.find((call) => /select candidate\.id/u.test(call.sql));
    expect(candidates?.sql).toContain(expectedPredicate('file', 'candidate', 1));

    // The bytes go only for rows the gated statement returned.
    const candidateIndex = calls.indexOf(candidates as Recorded);
    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(mocks.deleteStoredMediaObjects).toHaveBeenCalledWith(['a.bin']);

    const deletion = destructive(calls)[0];
    expect(deletion?.sql).toContain(expectedPredicate('file', 'target', 2));
  });

  it('the workspace domain sweep, over the store each domain destroys', async () => {
    const sweepers = createDomainSweepers();
    const cases: Array<[keyof typeof sweepers, string, string | null]> = [
      ['files', 'media_assets', 'file'],
      ['work', 'cloud_agent_runs', 'work_run'],
      ['artifacts', 'web_artifacts', 'artifact'],
      ['notifications', 'notifications', null],
      ['research', 'research_reports', 'conversation'],
    ];

    for (const [domain, table, store] of cases) {
      const { db, calls } = recorder((sql) =>
        /object_keys/u.test(sql) ? [{ id: 'row-1', object_keys: ['a.bin'] }] : [],
      );
      await sweepers[domain].sweepBatch(db, {
        organizationId: ORG,
        cutoff: '2026-01-01T00:00:00.000Z',
        resourceType: store as never,
        limit: 10,
      });

      const alias = table === 'notifications' || table === 'research_reports' ? 't' : table;
      const sql = calls.map((call) => call.sql).join('\n');
      expect(sql).toContain(
        expectedPredicate(null, alias, 3, {
          coversParam: '$3',
          organization: '$1',
          owner: `${alias}.user_id`,
        }),
      );
      // An object-backed domain deletes rows in a second statement, which
      // carries the exclusion again over the ids the first one returned.
      if (table === 'media_assets') {
        expect(sql).toContain(
          expectedPredicate(null, 'target', 3, {
            coversParam: '$3',
            organization: '$2',
            owner: 'target.user_id',
          }),
        );
      }
      // The store travels as a bound value, so a hold narrowed away from this
      // domain stops suspending it and one that names it keeps suspending it.
      expect(calls.some((call) => call.params[2] === store)).toBe(true);
    }
  });

  it('the user’s own permanent delete, on the read and on the delete', async () => {
    const { db, calls } = recorder((sql) =>
      /for update/u.test(sql) ? [{ storage_pathname: 'a.bin', held: false }] : [{ id: 'file-1' }],
    );

    await expect(permanentlyDeleteMediaAsset('owner', 'file-1', db)).resolves.toBe(true);

    const read = calls.find((call) => /for update/u.test(call.sql));
    expect(read?.sql).toContain(expectedPredicate('file', 'asset', 4).replace(/^not /, ''));
    const deletion = calls.find((call) => /delete from public\.media_assets/u.test(call.sql));
    expect(deletion?.sql).toContain(expectedPredicate('file', 'asset', 4));
    expect(deletion?.params).toContain('file');
  });

  it('refuses the user’s permanent delete of a held file without touching its bytes', async () => {
    const { db } = recorder((sql) =>
      /for update/u.test(sql) ? [{ storage_pathname: 'a.bin', held: true }] : [],
    );

    await expect(permanentlyDeleteMediaAsset('owner', 'file-1', db)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mocks.deleteStoredMedia).not.toHaveBeenCalled();
  });
});

describe('a hold that cannot be read destroys nothing', () => {
  it('leaves the registry purge with nothing purged and the failure recorded', async () => {
    const { db } = recorder((sql) => {
      if (/delete from public\./u.test(sql)) throw new Error('relation legal_holds does not exist');
      return [];
    });

    const result = await purgeSoftDeletedResources(db);

    expect(result.purged).toBe(0);
    expect(result.failed).toBe(3);
  });
});

describe('a held row survives every path and its unheld sibling does not', () => {
  it('the registry purge of soft-deleted resources', async () => {
    const db = world();
    const result = await purgeSoftDeletedResources(db as unknown as DatabaseAdapter);

    expect(ids(db, 'web_conversations')).toEqual(['conv-held']);
    expect(ids(db, 'web_messages')).toEqual(['msg-held']);
    expect(ids(db, 'web_artifacts')).toEqual(['art-held']);
    expect(result.heldFromPurge).toBe(3);
  });

  it('the registry purge, once the hold is released', async () => {
    const db = world('released');
    await purgeSoftDeletedResources(db as unknown as DatabaseAdapter);
    expect(ids(db, 'web_conversations')).toEqual([]);
    expect(ids(db, 'web_messages')).toEqual([]);
    expect(ids(db, 'web_artifacts')).toEqual([]);
  });

  it('the temporary chat attachment purge, bytes included', async () => {
    const db = world();
    const result = await purgeTemporaryChatFiles(db);

    expect(ids(db, 'media_assets')).toEqual(['file-held']);
    expect(result.heldFromPurge).toBe(1);
    expect(mocks.deleteStoredMediaObjects).toHaveBeenCalledWith(['free.bin']);
  });

  it('the temporary chat attachment purge, once the hold is released', async () => {
    const db = world('released');
    await purgeTemporaryChatFiles(db);
    expect(ids(db, 'media_assets')).toEqual([]);
  });

  it('the deleted media cron, bytes included', async () => {
    const db = world();
    mocks.db.current = db;
    const { GET } = await import('@/app/api/cron/purge-deleted-media/route');

    const res = await GET(new Request('https://x/c') as never);
    const body = await res.json();
    if (res.status !== 200) throw new Error(`media cron ${res.status}: ${JSON.stringify(body)}`);

    expect(ids(db, 'media_assets')).toEqual(['file-held']);
    expect(body.heldFromPurge).toBe(1);
    expect(mocks.deleteStoredMediaObjects).toHaveBeenCalledWith(['free.bin']);
  });

  it('the deleted media cron, once the hold is released', async () => {
    const db = world('released');
    mocks.db.current = db;
    const { GET } = await import('@/app/api/cron/purge-deleted-media/route');

    await GET(new Request('https://x/c') as never);

    expect(ids(db, 'media_assets')).toEqual([]);
  });

  it('the temporary chat cron, over chats and their attachments', async () => {
    const db = world();
    mocks.db.current = db;
    const { GET } = await import('@/app/api/cron/purge-temporary-chats/route');

    const res = await GET(new Request('https://x/c') as never);
    const body = await res.json();
    if (res.status !== 200) throw new Error(`temp cron ${res.status}: ${JSON.stringify(body)}`);

    expect(ids(db, 'web_conversations')).toEqual(['conv-held']);
    expect(body.heldChats).toBe(1);
  });

  it('the temporary chat cron, once the hold is released', async () => {
    const db = world('released');
    mocks.db.current = db;
    const { GET } = await import('@/app/api/cron/purge-temporary-chats/route');

    await GET(new Request('https://x/c') as never);

    expect(ids(db, 'web_conversations')).toEqual([]);
  });

  it('the workspace domain sweep', async () => {
    const db = world();
    await createDomainSweepers().notifications.sweepBatch(db as unknown as DatabaseAdapter, {
      organizationId: ORG,
      cutoff: '2026-09-19T00:00:00.000Z',
      resourceType: null,
      limit: 10,
    });
    expect(ids(db, 'notifications')).toEqual(['note-held']);
  });

  it('the workspace domain sweep, once the hold is released', async () => {
    const db = world('released');
    await createDomainSweepers().notifications.sweepBatch(db as unknown as DatabaseAdapter, {
      organizationId: ORG,
      cutoff: '2026-09-19T00:00:00.000Z',
      resourceType: null,
      limit: 10,
    });
    expect(ids(db, 'notifications')).toEqual([]);
  });

  it('the user’s own permanent file delete is refused and audited', async () => {
    const db = world();

    await expect(
      permanentlyDeleteMediaAsset(HELD, 'file-held', db as unknown as DatabaseAdapter),
    ).rejects.toMatchObject({ statusCode: 403, message: HELD_DELETION_REFUSAL });

    expect(ids(db, 'media_assets')).toContain('file-held');
    expect(mocks.deleteStoredMedia).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'deletion_blocked_by_legal_hold',
        outcome: 'denied',
        detail: expect.objectContaining({ reason: 'legal_hold' }),
      }),
    );
  });

  it('the user’s own permanent file delete still works for a sibling nobody holds', async () => {
    const db = world();

    await expect(
      permanentlyDeleteMediaAsset(FREE, 'file-free', db as unknown as DatabaseAdapter),
    ).resolves.toBe(true);

    expect(ids(db, 'media_assets')).toEqual(['file-held']);
    expect(mocks.deleteStoredMedia).toHaveBeenCalledWith('free.bin');
  });

  it('the user’s own permanent file delete, once the hold is released', async () => {
    const db = world('released');
    await expect(
      permanentlyDeleteMediaAsset(HELD, 'file-held', db as unknown as DatabaseAdapter),
    ).resolves.toBe(true);
    expect(ids(db, 'media_assets')).toEqual(['file-free']);
  });

  it('the user’s own message delete is refused and audited', async () => {
    const db = world();

    await expect(
      deleteMessages(db as unknown as DatabaseAdapter, 'conv-held', ['msg-held'], {
        conversationId: 'conv-held',
        userId: HELD,
        organizationId: ORG,
      }),
    ).rejects.toMatchObject({ statusCode: 403, message: HELD_DELETION_REFUSAL });

    expect(ids(db, 'web_messages')).toContain('msg-held');
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'deletion_blocked_by_legal_hold',
        outcome: 'denied',
        detail: expect.objectContaining({ reason: 'legal_hold' }),
      }),
    );
  });

  it('the user’s own message delete still works for a sibling nobody holds', async () => {
    const db = world();

    await deleteMessages(db as unknown as DatabaseAdapter, 'conv-free', ['msg-free']);

    expect(ids(db, 'web_messages')).toEqual(['msg-held']);
  });

  it('the user’s own message delete, once the hold is released', async () => {
    const db = world('released');
    await deleteMessages(db as unknown as DatabaseAdapter, 'conv-held', ['msg-held']);
    expect(ids(db, 'web_messages')).toEqual(['msg-free']);
  });
});
