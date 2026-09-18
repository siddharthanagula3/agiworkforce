import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(),
  query: vi.fn(),
  getKeyValueStore: vi.fn(),
  objectBackupReadiness: vi.fn(),
  isCrossRegionBackup: vi.fn(),
  replicateObject: vi.fn(),
  resolveObjectBackupTarget: vi.fn(),
  recordBackupReplica: vi.fn(),
  reconcileBackupDeletions: vi.fn(),
  backupReplicaSummary: vi.fn(),
  error: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mocks.verifyCronRequest }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ query: mocks.query }) }));
vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: mocks.getKeyValueStore }));
vi.mock('@/lib/server/object-backup', () => ({
  objectBackupReadiness: mocks.objectBackupReadiness,
  isCrossRegionBackup: mocks.isCrossRegionBackup,
  replicateObject: mocks.replicateObject,
  resolveObjectBackupTarget: mocks.resolveObjectBackupTarget,
  recordBackupReplica: mocks.recordBackupReplica,
  reconcileBackupDeletions: mocks.reconcileBackupDeletions,
  backupReplicaSummary: mocks.backupReplicaSummary,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: mocks.error, debug: vi.fn() },
}));

import { NextRequest } from 'next/server';

import { GET } from './route';

const ROUTE = '/api/cron/replicate-object-backups';

function request(): NextRequest {
  return new NextRequest(`https://agiworkforce.com${ROUTE}`);
}

const ASSETS = [
  { id: 'a1', storage_pathname: 'private-media/image/a/1.png', created_at: '2026-09-16T10:00:00Z' },
  { id: 'a2', storage_pathname: 'private-media/image/a/2.png', created_at: '2026-09-16T11:00:00Z' },
];

const TARGET = { store: {}, bucket: 'agi-backup', region: 'us-west-1', endpoint: 'https://backup' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCronRequest.mockReturnValue(true);
  mocks.objectBackupReadiness.mockReturnValue({ configured: true, missing: [], crossRegion: true });
  mocks.isCrossRegionBackup.mockReturnValue(true);
  mocks.query.mockResolvedValue(ASSETS);
  mocks.replicateObject.mockResolvedValue({ outcome: 'replicated', bytes: 1_024 });
  mocks.resolveObjectBackupTarget.mockReturnValue(TARGET);
  mocks.recordBackupReplica.mockResolvedValue(undefined);
  mocks.reconcileBackupDeletions.mockResolvedValue({ checked: 0, deleted: 0, retained: 0 });
  mocks.backupReplicaSummary.mockResolvedValue({
    tracked: 2,
    newestReplicatedAt: '2026-09-16T11:00:00.000Z',
    oldestVerifiedAt: '2026-09-16T10:00:00.000Z',
  });
  mocks.getKeyValueStore.mockReturnValue(null);
});

describe(`GET ${ROUTE}`, () => {
  it('admits only the scheduler credential', async () => {
    mocks.verifyCronRequest.mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('fails the run and names the unset variables when no backup is configured', async () => {
    mocks.objectBackupReadiness.mockReturnValue({
      configured: false,
      missing: ['AGI_STORAGE_BACKUP_ENDPOINT', 'AGI_STORAGE_BACKUP_BUCKET'],
      crossRegion: false,
    });

    const response = await GET(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      replicated: 0,
      reason: 'unconfigured',
      missing: ['AGI_STORAGE_BACKUP_ENDPOINT', 'AGI_STORAGE_BACKUP_BUCKET'],
    });
    expect(mocks.error).toHaveBeenCalled();
    expect(mocks.replicateObject).not.toHaveBeenCalled();
  });

  it('replicates each stored object and reports whether the copy leaves the region', async () => {
    const response = await GET(request());

    expect(mocks.replicateObject).toHaveBeenCalledTimes(2);
    expect(mocks.replicateObject).toHaveBeenCalledWith(ASSETS[0]?.storage_pathname);
    await expect(response.json()).resolves.toMatchObject({
      scanned: 2,
      replicated: 2,
      crossRegion: true,
      cursor: '2026-09-16T11:00:00.000Z',
    });
  });

  it('records every key it copied so a later deletion can reach the backup', async () => {
    await GET(request());

    expect(mocks.recordBackupReplica).toHaveBeenCalledTimes(2);
    expect(mocks.recordBackupReplica).toHaveBeenCalledWith(
      ASSETS[0]?.storage_pathname,
      1_024,
      TARGET.bucket,
    );
  });

  it('does not record a key it failed to copy', async () => {
    mocks.replicateObject
      .mockResolvedValueOnce({ outcome: 'missing-source', bytes: 0 })
      .mockResolvedValueOnce({ outcome: 'too-large', bytes: 0 });

    await GET(request());

    expect(mocks.recordBackupReplica).not.toHaveBeenCalled();
  });

  it('propagates deletions the primary already made and reports the backlog it tracks', async () => {
    mocks.reconcileBackupDeletions.mockResolvedValue({ checked: 5, deleted: 2, retained: 3 });

    const response = await GET(request());

    expect(mocks.reconcileBackupDeletions).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ target: TARGET }),
    );
    await expect(response.json()).resolves.toMatchObject({
      reconciled: 5,
      backupDeletesPropagated: 2,
      tracked: 2,
      newestReplicatedAt: '2026-09-16T11:00:00.000Z',
      oldestVerifiedAt: '2026-09-16T10:00:00.000Z',
    });
  });

  it('counts an object already in the backup separately from one it had to copy', async () => {
    mocks.replicateObject
      .mockResolvedValueOnce({ outcome: 'already-present', bytes: 10 })
      .mockResolvedValueOnce({ outcome: 'too-large', bytes: 0 });

    const response = await GET(request());

    await expect(response.json()).resolves.toMatchObject({
      replicated: 0,
      alreadyPresent: 1,
      tooLarge: 1,
    });
  });

  it('resumes from the stored cursor instead of rescanning the lookback window', async () => {
    const store = {
      get: vi.fn(async () => '2026-09-16T09:00:00.000Z'),
      set: vi.fn(async () => true),
    };
    mocks.getKeyValueStore.mockReturnValue(store);

    await GET(request());

    expect(mocks.query).toHaveBeenCalledWith(expect.any(String), ['2026-09-16T09:00:00.000Z']);
    expect(store.set).toHaveBeenCalledWith(
      'agi-object-backup:cursor',
      '2026-09-16T11:00:00.000Z',
      expect.objectContaining({ ttlSeconds: expect.any(Number) }),
    );
  });

  it('answers 500 without leaking the failure to the scheduler body', async () => {
    mocks.query.mockRejectedValue(new Error('connection terminated'));

    const response = await GET(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Internal server error' });
    expect(mocks.error).toHaveBeenCalled();
  });
});
