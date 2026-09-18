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

import {
  BACKUP_ACCESS_KEY_ID_ENV,
  BACKUP_BUCKET_ENV,
  BACKUP_ENDPOINT_ENV,
  BACKUP_SECRET_ACCESS_KEY_ENV,
  deleteBackupObject,
  missingBackupEnv,
  objectBackupReadiness,
  reconcileBackupDeletions,
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
    expect(result).toEqual({ checked: 1, deleted: 1, retained: 0 });
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
    expect(result).toEqual({ checked: 1, deleted: 0, retained: 1 });
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('set verified_at = now()'), [
      'live.png',
    ]);
  });

  it('does nothing when no backup is configured', async () => {
    await expect(reconcileBackupDeletions(10, { target: null })).resolves.toEqual({
      checked: 0,
      deleted: 0,
      retained: 0,
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
