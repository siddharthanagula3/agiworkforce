import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readSnapshotStamp: vi.fn(),
  readSnapshotRecords: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/connectors/directory/snapshot-cache', () => ({
  readSnapshotStamp: () => mocks.readSnapshotStamp(),
  readSnapshotRecords: () => mocks.readSnapshotRecords(),
}));

import {
  __resetSnapshotMemoryCacheForTests,
  getSnapshotRecords,
} from '@/lib/connectors/directory/memory-cache';

describe('getSnapshotRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetSnapshotMemoryCacheForTests();
  });

  it('fetches the blob on a cold cache and caches it under the current stamp', async () => {
    mocks.readSnapshotStamp.mockResolvedValue(1);
    mocks.readSnapshotRecords.mockResolvedValueOnce([{ id: 'notion' }]);

    await expect(getSnapshotRecords()).resolves.toEqual([{ id: 'notion' }]);
    expect(mocks.readSnapshotRecords).toHaveBeenCalledTimes(1);
  });

  it('serves from memory on a second call with the same stamp, never re-fetching the blob', async () => {
    mocks.readSnapshotStamp.mockResolvedValue(1);
    mocks.readSnapshotRecords.mockResolvedValueOnce([{ id: 'notion' }]);

    await getSnapshotRecords();
    await getSnapshotRecords();
    await getSnapshotRecords();

    expect(mocks.readSnapshotStamp).toHaveBeenCalledTimes(3);
    expect(mocks.readSnapshotRecords).toHaveBeenCalledTimes(1);
  });

  it('refetches the blob once the stamp changes', async () => {
    mocks.readSnapshotStamp.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    mocks.readSnapshotRecords
      .mockResolvedValueOnce([{ id: 'notion' }])
      .mockResolvedValueOnce([{ id: 'notion' }, { id: 'slack' }]);

    await expect(getSnapshotRecords()).resolves.toEqual([{ id: 'notion' }]);
    await expect(getSnapshotRecords()).resolves.toEqual([{ id: 'notion' }, { id: 'slack' }]);
    expect(mocks.readSnapshotRecords).toHaveBeenCalledTimes(2);
  });

  it('returns an empty array without touching the blob when nothing has ever been ingested', async () => {
    mocks.readSnapshotStamp.mockResolvedValue(null);

    await expect(getSnapshotRecords()).resolves.toEqual([]);
    expect(mocks.readSnapshotRecords).not.toHaveBeenCalled();
  });
});
