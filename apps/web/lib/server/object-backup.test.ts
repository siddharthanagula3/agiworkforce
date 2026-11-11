import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
  getObjectStore: vi.fn(),
  objectStorageConfig: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ execute: mocks.execute, query: mocks.query }),
}));
vi.mock('./object-storage-runtime', () => ({
  getObjectStore: mocks.getObjectStore,
  objectStorageConfig: mocks.objectStorageConfig,
}));

import { OBJECT_STORAGE_ACCESS_KEY_ID_ENV } from '@agiworkforce/object-storage';

import {
  BACKUP_ACCESS_KEY_ID_ENV,
  BACKUP_BUCKET_ENV,
  BACKUP_ENDPOINT_ENV,
  BACKUP_SECRET_ACCESS_KEY_ENV,
  backupSharesPrimaryCredential,
  deleteBackupObject,
  missingBackupEnv,
  objectBackupReadiness,
  reconcileBackupDeletions,
  replicateObjectWithLegacyFallback,
  requeueReplicasAfterRestore,
  recordBackupReplica,
} from './object-backup';

function backupStore() {
  return {
    head: vi.fn(),
    delete: vi.fn(async () => undefined),
    put: vi.fn(async () => undefined),
    get: vi.fn(),
    getStream: vi.fn(),
    copyIfMatch: vi.fn(),
    presignPut: vi.fn(),
    presignGet: vi.fn(),
  };
}

function target(store: ReturnType<typeof backupStore>) {
  return { store, bucket: 'agi-backup', region: 'us-west-1', endpoint: 'https://backup' };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.objectStorageConfig.mockReturnValue({
    privateBucket: 'agi-primary',
    endpoint: 'https://primary',
    region: 'us-east-1',
  });
  mocks.execute.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue([]);
});

describe('objectBackupReadiness', () => {
  it('names every unset variable rather than reporting a single boolean', () => {
    const readiness = objectBackupReadiness({});

    expect(readiness.configured).toBe(false);
    expect(readiness.missing).toEqual([
      BACKUP_ENDPOINT_ENV,
      BACKUP_BUCKET_ENV,
      BACKUP_ACCESS_KEY_ID_ENV,
      BACKUP_SECRET_ACCESS_KEY_ENV,
    ]);
  });

  it('calls a backup written under the primary storage key dependent on that key', () => {
    const shared = {
      [BACKUP_ENDPOINT_ENV]: 'https://backup',
      [BACKUP_BUCKET_ENV]: 'agi-backup',
      [BACKUP_ACCESS_KEY_ID_ENV]: 'key-one',
      [BACKUP_SECRET_ACCESS_KEY_ENV]: 'backup-secret',
      [OBJECT_STORAGE_ACCESS_KEY_ID_ENV]: 'key-one',
    };

    expect(backupSharesPrimaryCredential(shared)).toBe(true);
    expect(objectBackupReadiness(shared).independentCredential).toBe(false);
    expect(
      objectBackupReadiness({ ...shared, [OBJECT_STORAGE_ACCESS_KEY_ID_ENV]: 'key-two' })
        .independentCredential,
    ).toBe(true);
  });

  it('does not call an unconfigured backup independent', () => {
    expect(objectBackupReadiness({}).independentCredential).toBe(false);
  });

  it('reports only what is still missing when the backup is half configured', () => {
    expect(
      missingBackupEnv({
        [BACKUP_ENDPOINT_ENV]: 'https://backup',
        [BACKUP_BUCKET_ENV]: 'agi-backup',
      }),
    ).toEqual([BACKUP_ACCESS_KEY_ID_ENV, BACKUP_SECRET_ACCESS_KEY_ENV]);
  });
});

describe('deleteBackupObject', () => {
  it('says unconfigured rather than claiming a delete no bucket received', async () => {
    await expect(deleteBackupObject('k', { target: null })).resolves.toBe('unconfigured');
  });

  it('removes the copy when the backup bucket holds it', async () => {
    const store = backupStore();
    store.head.mockResolvedValue({ contentLength: 10 });

    await expect(deleteBackupObject('k', { target: target(store) })).resolves.toBe('deleted');
    expect(store.delete).toHaveBeenCalledWith('agi-backup', 'k');
  });

  it('does not call delete for a key the backup never held', async () => {
    const store = backupStore();
    store.head.mockResolvedValue(null);

    await expect(deleteBackupObject('k', { target: target(store) })).resolves.toBe('absent');
    expect(store.delete).not.toHaveBeenCalled();
  });
});

describe('recordBackupReplica', () => {
  it('upserts on the object key so a re-copy moves the recovery point', async () => {
    await recordBackupReplica('private-media/a.png', 2_048, 'agi-backup');

    const [sql, params] = mocks.execute.mock.calls[0] ?? [];
    expect(sql).toContain('insert into public.object_backup_replicas');
    expect(sql).toContain('on conflict (object_key) do update');
    expect(params).toEqual(['private-media/a.png', 'agi-backup', 2_048]);
  });
});

describe('replicateObjectWithLegacyFallback', () => {
  function sourceHolding(bucket: string | null) {
    return {
      head: vi.fn(async (name: string) => (name === bucket ? { contentLength: 3 } : null)),
      get: vi.fn(async () => ({ data: new Uint8Array([1, 2, 3]), contentType: 'text/plain' })),
    };
  }

  it('copies from the private bucket and never looks at the public one when it holds the object', async () => {
    mocks.objectStorageConfig.mockReturnValue({
      privateBucket: 'agi-primary',
      publicBucket: 'agi-public',
    });
    const store = backupStore();
    store.head.mockResolvedValue(null);
    const source = sourceHolding('agi-primary');

    const result = await replicateObjectWithLegacyFallback('a.png', {
      source: source as never,
      target: target(store),
    });

    expect(result).toEqual({ outcome: 'replicated', bytes: 3 });
    expect(source.head).toHaveBeenCalledTimes(1);
    expect(source.head).toHaveBeenCalledWith('agi-primary', 'a.png');
  });

  it('copies an object only the legacy public bucket holds', async () => {
    mocks.objectStorageConfig.mockReturnValue({
      privateBucket: 'agi-primary',
      publicBucket: 'agi-public',
    });
    const store = backupStore();
    store.head.mockResolvedValue(null);
    const source = sourceHolding('agi-public');

    const result = await replicateObjectWithLegacyFallback('legacy.pdf', {
      source: source as never,
      target: target(store),
    });

    expect(result).toEqual({ outcome: 'replicated', bytes: 3 });
    expect(source.get).toHaveBeenCalledWith('agi-public', 'legacy.pdf');
    expect(store.put).toHaveBeenCalledWith(expect.objectContaining({ key: 'legacy.pdf' }));
  });

  it('reports a missing source when no public bucket is configured', async () => {
    const store = backupStore();
    const source = sourceHolding(null);

    const result = await replicateObjectWithLegacyFallback('gone.pdf', {
      source: source as never,
      target: target(store),
    });

    expect(result).toEqual({ outcome: 'missing-source', bytes: 0 });
    expect(store.put).not.toHaveBeenCalled();
  });
});

describe('reconcileBackupDeletions', () => {
  it('deletes the backup copy of a key the primary no longer holds', async () => {
    const store = backupStore();
    store.head.mockResolvedValue({ contentLength: 10 });
    const source = { head: vi.fn(async () => null) };
    mocks.query
      .mockResolvedValueOnce([{ object_key: 'gone.png' }])
      .mockResolvedValueOnce([{ object_key: 'gone.png' }]);

    const result = await reconcileBackupDeletions(10, {
      target: target(store),
      source: source as never,
    });

    expect(source.head).toHaveBeenCalledWith('agi-primary', 'gone.png');
    expect(store.delete).toHaveBeenCalledWith('agi-backup', 'gone.png');
    expect(result).toEqual({ checked: 1, deleted: 1, retained: 0, failed: 0 });
  });

  it('keeps going past a key that fails and still forgets the orphans it finished', async () => {
    const store = backupStore();
    store.head.mockImplementation(async (_bucket: string, key: string) => {
      if (key === 'stuck.png') throw new Error('backup HEAD refused');
      return { contentLength: 10 };
    });
    const source = { head: vi.fn(async () => null) };
    mocks.query
      .mockResolvedValueOnce([
        { object_key: 'done-before.png' },
        { object_key: 'stuck.png' },
        { object_key: 'gone-after.png' },
      ])
      .mockResolvedValueOnce([{ object_key: 'done-before.png' }, { object_key: 'gone-after.png' }]);

    const result = await reconcileBackupDeletions(10, {
      target: target(store),
      source: source as never,
    });

    expect(store.delete).toHaveBeenCalledWith('agi-backup', 'done-before.png');
    expect(store.delete).toHaveBeenCalledWith('agi-backup', 'gone-after.png');
    expect(result).toEqual({ checked: 3, deleted: 2, retained: 0, failed: 1 });
    const [forgetSql, forgetParams] = mocks.query.mock.calls[1] as unknown as [string, unknown[]];
    expect(forgetSql).toContain('delete from public.object_backup_replicas');
    expect(forgetParams).toEqual([['done-before.png', 'gone-after.png']]);
  });

  it('keeps the copy of a key the primary still holds and re-stamps its check', async () => {
    const store = backupStore();
    const source = { head: vi.fn(async () => ({ contentLength: 10 })) };
    mocks.query.mockResolvedValueOnce([{ object_key: 'live.png' }]);

    const result = await reconcileBackupDeletions(10, {
      target: target(store),
      source: source as never,
    });

    expect(store.delete).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 1, deleted: 0, retained: 1, failed: 0 });
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('set verified_at = now()'), [
      'live.png',
    ]);
  });

  it('does nothing when no backup is configured', async () => {
    await expect(reconcileBackupDeletions(10, { target: null })).resolves.toEqual({
      checked: 0,
      deleted: 0,
      retained: 0,
      failed: 0,
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe('requeueReplicasAfterRestore', () => {
  it('marks every tracked replica due so the sweep re-checks the whole bucket', async () => {
    mocks.query.mockResolvedValueOnce([{ requeued: '2' }]);

    await expect(requeueReplicasAfterRestore()).resolves.toBe(2);

    const [sql] = mocks.query.mock.calls[0] as [string];
    expect(sql).toContain('object_backup_replicas');
    expect(sql).toContain("set verified_at = 'epoch'::timestamptz");
    expect(sql).not.toContain('where');
    expect(sql).toContain('count(*)');
  });
});
