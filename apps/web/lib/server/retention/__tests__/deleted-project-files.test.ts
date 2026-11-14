import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { FakePostgres } from '@/lib/services/__tests__/fake-postgres';
import { purgeDeletedProjectFiles } from '../deleted-project-files';

const ORG = '11111111-1111-4111-8111-111111111111';
const LONG_AGO = '2026-01-01T00:00:00.000Z';
const LAST_WEEK = '2026-09-15T00:00:00.000Z';

const RELEASED = 'knowledge-files/projects/p-alice/released.pdf';
const SECOND_HOLD = 'knowledge-files/projects/p-carol/second-hold.pdf';
const LIVE = 'knowledge-files/projects/p-alice/live.pdf';
const RECENT = 'knowledge-files/projects/p-alice/recent.pdf';

/**
 * Hold one preserved alice and carol and has been released; hold two still
 * preserves carol. Every object starts in storage.
 */
function world(firstHold: 'released' | 'active' = 'released') {
  const db = new FakePostgres({
    legal_holds: [
      {
        id: 'hold-1',
        organization_id: ORG,
        scope: 'custodian',
        subject_user_id: null,
        resource_types: ['project_file'],
        released_at: firstHold === 'released' ? '2026-09-01T00:00:00.000Z' : null,
      },
      {
        id: 'hold-2',
        organization_id: ORG,
        scope: 'custodian',
        subject_user_id: null,
        resource_types: null,
        released_at: null,
      },
    ],
    legal_hold_custodians: [
      { hold_id: 'hold-1', user_id: 'alice' },
      { hold_id: 'hold-1', user_id: 'carol' },
      { hold_id: 'hold-2', user_id: 'carol' },
    ],
    user_projects: [
      { id: 'p-alice', user_id: 'alice', organization_id: ORG },
      { id: 'p-carol', user_id: 'carol', organization_id: ORG },
    ],
    project_knowledge_files: [
      { id: 'f-released', project_id: 'p-alice', deleted_at: LONG_AGO, storage_uri: RELEASED },
      {
        id: 'f-second-hold',
        project_id: 'p-carol',
        deleted_at: LONG_AGO,
        storage_uri: SECOND_HOLD,
      },
      { id: 'f-live', project_id: 'p-alice', deleted_at: null, storage_uri: LIVE },
      { id: 'f-copy-of-live', project_id: 'p-alice', deleted_at: LONG_AGO, storage_uri: LIVE },
      { id: 'f-recent', project_id: 'p-alice', deleted_at: LAST_WEEK, storage_uri: RECENT },
    ],
  });
  const stored = new Set([RELEASED, SECOND_HOLD, LIVE, RECENT]);
  const deleteObject = vi.fn(async (key: string) => {
    stored.delete(key);
  });
  return { db, stored, deleteObject };
}

function rowIds(db: FakePostgres): string[] {
  return db
    .rowsIn('project_knowledge_files')
    .map((row) => String(row['id']))
    .sort();
}

function failingHoldReads(db: FakePostgres): DatabaseAdapter {
  const query = async (sql: string, params: unknown[] = []) => {
    if (sql.includes('legal_hold_preserves')) {
      throw new Error('permission denied for function legal_hold_preserves');
    }
    return db.query(sql, params);
  };
  const adapter = {
    query,
    execute: async (sql: string, params: unknown[] = []) => {
      await query(sql, params);
    },
    transaction: async <T>(run: (tx: unknown) => Promise<T>) => run(adapter),
  };
  return adapter as unknown as DatabaseAdapter;
}

beforeEach(() => vi.clearAllMocks());

describe('purgeDeletedProjectFiles after a legal hold is released', () => {
  it('completes the deletion the user asked for: object and row both go, and it is audited', async () => {
    const { db, stored, deleteObject } = world();

    const result = await purgeDeletedProjectFiles(db as unknown as DatabaseAdapter, {
      deleteObject,
    });

    expect(rowIds(db)).not.toContain('f-released');
    expect(stored.has(RELEASED)).toBe(false);
    expect(deleteObject).toHaveBeenCalledWith(RELEASED);
    expect(result).toMatchObject({ rowsPurged: 2, objectsDeleted: 1, heldFromPurge: 1 });
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'deleted_content_purged',
        organizationId: ORG,
        detail: expect.objectContaining({
          resourceType: 'project_file',
          source: 'cron/purge-deleted-media',
          deleted: 2,
          count: 1,
        }),
      }),
    );
  });

  it('keeps a deleted file that a second, still active hold covers', async () => {
    const { db, stored, deleteObject } = world();

    await purgeDeletedProjectFiles(db as unknown as DatabaseAdapter, { deleteObject });

    expect(rowIds(db)).toContain('f-second-hold');
    expect(stored.has(SECOND_HOLD)).toBe(true);
    expect(deleteObject).not.toHaveBeenCalledWith(SECOND_HOLD);
  });

  it('never touches a file nobody deleted, nor the object a live copy still uses', async () => {
    const { db, stored, deleteObject } = world();

    await purgeDeletedProjectFiles(db as unknown as DatabaseAdapter, { deleteObject });

    expect(rowIds(db)).toContain('f-live');
    expect(rowIds(db)).not.toContain('f-copy-of-live');
    expect(stored.has(LIVE)).toBe(true);
    expect(deleteObject).not.toHaveBeenCalledWith(LIVE);
  });

  it('waits out the recovery window an unheld deletion gets', async () => {
    const { db, stored } = world();

    await purgeDeletedProjectFiles(db as unknown as DatabaseAdapter, {
      deleteObject: async (key) => {
        stored.delete(key);
      },
    });

    expect(rowIds(db)).toContain('f-recent');
    expect(stored.has(RECENT)).toBe(true);
  });

  it('reclaims nothing while the first hold is still active', async () => {
    const { db, stored, deleteObject } = world('active');

    const result = await purgeDeletedProjectFiles(db as unknown as DatabaseAdapter, {
      deleteObject,
    });

    expect(rowIds(db)).toContain('f-released');
    expect(stored.has(RELEASED)).toBe(true);
    expect(deleteObject).not.toHaveBeenCalledWith(RELEASED);
    expect(result).toMatchObject({ heldFromPurge: 3, rowsPurged: 0, objectsDeleted: 0 });
  });

  it('reclaims nothing when the hold state cannot be read', async () => {
    const { db, stored, deleteObject } = world();

    await expect(purgeDeletedProjectFiles(failingHoldReads(db), { deleteObject })).rejects.toThrow(
      /legal_hold_preserves/,
    );

    expect(deleteObject).not.toHaveBeenCalled();
    expect(stored.size).toBe(4);
    expect(rowIds(db)).toHaveLength(5);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('keeps the row of an object storage would not delete, and finishes it on the next run', async () => {
    const { db, stored } = world();
    const refusing = vi.fn(async () => {
      throw new Error('storage unavailable');
    });

    const first = await purgeDeletedProjectFiles(db as unknown as DatabaseAdapter, {
      deleteObject: refusing,
    });

    expect(rowIds(db)).toContain('f-released');
    expect(stored.has(RELEASED)).toBe(true);
    expect(first.objectsFailed).toBe(1);

    const second = await purgeDeletedProjectFiles(db as unknown as DatabaseAdapter, {
      deleteObject: async (key) => {
        stored.delete(key);
      },
    });

    expect(rowIds(db)).not.toContain('f-released');
    expect(stored.has(RELEASED)).toBe(false);
    expect(second.objectsDeleted).toBe(1);
  });

  it('is idempotent: a second run finds nothing and writes no second audit entry', async () => {
    const { db, deleteObject } = world();

    await purgeDeletedProjectFiles(db as unknown as DatabaseAdapter, { deleteObject });
    const again = await purgeDeletedProjectFiles(db as unknown as DatabaseAdapter, {
      deleteObject,
    });

    expect(again).toMatchObject({ candidates: 0, rowsPurged: 0, objectsDeleted: 0 });
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('takes the workspace hold-placement lock before any object is deleted', async () => {
    const { db, deleteObject } = world();

    await purgeDeletedProjectFiles(db as unknown as DatabaseAdapter, { deleteObject });

    const lock = db.statements.findIndex((sql) => /pg_advisory_xact_lock_shared/.test(sql));
    const destroy = db.statements.findIndex((sql) =>
      /delete from public\.project_knowledge_files/.test(sql),
    );
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(destroy);
  });

  // Mobile and the CLI learn a project's deletion only from its tombstone in
  // the /api/projects/sync delta, so the record has to outlive every offline device.
  it('never purges a deleted project record, even once its last file is gone', async () => {
    const { db, deleteObject } = world();
    db.tables.set('user_projects', [
      ...db.rowsIn('user_projects'),
      { id: 'p-gone', user_id: 'alice', organization_id: ORG, deleted_at: LONG_AGO },
    ]);
    db.rowsIn('project_knowledge_files').push({
      id: 'f-gone',
      project_id: 'p-gone',
      deleted_at: LONG_AGO,
      storage_uri: 'knowledge-files/projects/p-gone/last.pdf',
    });

    await purgeDeletedProjectFiles(db as unknown as DatabaseAdapter, { deleteObject });

    expect(rowIds(db)).not.toContain('f-gone');
    expect(db.rowsIn('user_projects').map((row) => row['id'])).toContain('p-gone');
    expect(db.statements.some((sql) => /delete\s+from\s+public\.user_projects/i.test(sql))).toBe(
      false,
    );
  });

  it('leaves an object the reference ledger tracks to the lifecycle worker', async () => {
    const { db, stored, deleteObject } = world();
    db.tables.set('project_knowledge_objects', [
      { object_key: RELEASED, state: 'queued', reference_count: 0 },
    ]);

    const result = await purgeDeletedProjectFiles(db as unknown as DatabaseAdapter, {
      deleteObject,
    });

    expect(rowIds(db)).not.toContain('f-released');
    expect(deleteObject).not.toHaveBeenCalled();
    expect(stored.has(RELEASED)).toBe(true);
    expect(result).toMatchObject({
      rowsPurged: 2,
      objectsDeleted: 0,
      objectsLeftToLifecycle: 1,
    });
  });
});

type ImportedModule1 = typeof import('@/lib/logger');
type ImportedModule0 = typeof import('@/lib/security-audit');
