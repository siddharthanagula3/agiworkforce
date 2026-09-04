import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
  }),
}));

import {
  readSnapshotRecords,
  readSnapshotStamp,
  readSyncState,
  writeSnapshotRecords,
  writeSyncState,
} from '@/lib/connectors/directory/snapshot-cache';

describe('readSnapshotStamp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads only the stamp column, never the value', async () => {
    mocks.query.mockResolvedValueOnce([{ stamp: '9' }]);

    await expect(readSnapshotStamp()).resolves.toBe(9);
    expect(String(mocks.query.mock.calls[0]?.[0])).not.toContain('value');
  });

  it('returns null when nothing has ever been ingested', async () => {
    mocks.query.mockResolvedValueOnce([]);
    await expect(readSnapshotStamp()).resolves.toBeNull();
  });
});

describe('readSnapshotRecords and writeSnapshotRecords', () => {
  beforeEach(() => vi.clearAllMocks());

  it('round-trips a records array through json', async () => {
    mocks.query.mockResolvedValueOnce([
      {
        value: JSON.stringify([{ id: 'notion' }]),
        stamp: '1',
        expires_at_ms: null,
        scope: 'public',
      },
    ]);

    await expect(readSnapshotRecords()).resolves.toEqual([{ id: 'notion' }]);
  });

  it('returns null for an empty snapshot', async () => {
    mocks.query.mockResolvedValueOnce([]);
    await expect(readSnapshotRecords()).resolves.toBeNull();
  });

  it('writes the records as a single json blob and returns the new stamp', async () => {
    mocks.query.mockResolvedValueOnce([{ stamp: '5' }]);

    await expect(writeSnapshotRecords([{ id: 'notion' } as never])).resolves.toBe(5);
    expect(mocks.query.mock.calls[0]?.[1]?.[3]).toBe(JSON.stringify([{ id: 'notion' }]));
  });
});

describe('readSyncState and writeSyncState', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the default state when nothing has been synced yet', async () => {
    mocks.query.mockResolvedValueOnce([]);
    await expect(readSyncState()).resolves.toEqual({
      nextIngestCursor: null,
      bootstrapComplete: false,
      lastSyncAt: null,
    });
  });

  it('round-trips a written state', async () => {
    const state = {
      nextIngestCursor: 'cursor-1',
      bootstrapComplete: true,
      lastSyncAt: '2026-09-01T00:00:00.000Z',
    };
    mocks.query.mockResolvedValueOnce([
      { value: JSON.stringify(state), stamp: '1', expires_at_ms: null, scope: 'public' },
    ]);

    await expect(readSyncState()).resolves.toEqual(state);
  });

  it('writes state as a small json value distinct from the snapshot row', async () => {
    mocks.query.mockResolvedValueOnce([{ stamp: '2' }]);

    await writeSyncState({ nextIngestCursor: null, bootstrapComplete: true, lastSyncAt: null });

    const params = mocks.query.mock.calls[0]?.[1] as unknown[];
    expect(params[0]).toBe('connectors.directory.sync-state');
  });
});
