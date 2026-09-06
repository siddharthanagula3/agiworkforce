import { beforeEach, describe, expect, it, vi } from 'vitest';

import { directoryRecord } from './fixtures';

const mocks = vi.hoisted(() => ({
  readSnapshotStamp: vi.fn(),
  readSnapshotRecords: vi.fn(),
  readSyncState: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/connectors/directory/snapshot-cache', () => ({
  readSnapshotStamp: () => mocks.readSnapshotStamp(),
  readSnapshotRecords: () => mocks.readSnapshotRecords(),
  readSyncState: () => mocks.readSyncState(),
}));

import {
  __resetSnapshotMemoryCacheForTests,
  getSnapshotRecords,
  getSnapshotView,
} from '@/lib/connectors/directory/memory-cache';

const notion = directoryRecord({ id: 'notion', badge: 'first-party', connectable: 'connect' });
const slack = directoryRecord({ id: 'slack', badge: 'first-party', connectable: 'connect' });
const tool = directoryRecord({ id: 'tool', badge: 'community' });

describe('getSnapshotRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetSnapshotMemoryCacheForTests();
    mocks.readSyncState.mockResolvedValue({
      nextIngestCursor: null,
      bootstrapComplete: true,
      bootstrapStartedAt: null,
      lastSyncAt: '2026-09-05T06:15:00.000Z',
      authProbeCursor: null,
    });
  });

  it('fetches the blob on a cold cache and caches it under the current stamp', async () => {
    mocks.readSnapshotStamp.mockResolvedValue(1);
    mocks.readSnapshotRecords.mockResolvedValueOnce([notion]);

    await expect(getSnapshotRecords()).resolves.toEqual([notion]);
    expect(mocks.readSnapshotRecords).toHaveBeenCalledTimes(1);
  });

  it('serves from memory on a second call with the same stamp, never re-fetching the blob', async () => {
    mocks.readSnapshotStamp.mockResolvedValue(1);
    mocks.readSnapshotRecords.mockResolvedValueOnce([notion]);

    await getSnapshotRecords();
    await getSnapshotRecords();
    await getSnapshotRecords();

    expect(mocks.readSnapshotStamp).toHaveBeenCalledTimes(3);
    expect(mocks.readSnapshotRecords).toHaveBeenCalledTimes(1);
  });

  it('refetches the blob once the stamp changes', async () => {
    mocks.readSnapshotStamp.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    mocks.readSnapshotRecords
      .mockResolvedValueOnce([notion])
      .mockResolvedValueOnce([notion, slack]);

    await expect(getSnapshotRecords()).resolves.toEqual([notion]);
    await expect(getSnapshotRecords()).resolves.toEqual([notion, slack]);
    expect(mocks.readSnapshotRecords).toHaveBeenCalledTimes(2);
  });

  it('returns an empty array without touching the blob when nothing has ever been ingested', async () => {
    mocks.readSnapshotStamp.mockResolvedValue(null);

    await expect(getSnapshotRecords()).resolves.toEqual([]);
    expect(mocks.readSnapshotRecords).not.toHaveBeenCalled();
  });

  it('hands out records in the default directory order', async () => {
    mocks.readSnapshotStamp.mockResolvedValue(1);
    mocks.readSnapshotRecords.mockResolvedValueOnce([tool, slack, notion]);

    const records = await getSnapshotRecords();
    expect(records.map((record) => record.id)).toEqual(['notion', 'slack', 'tool']);
  });
});

describe('getSnapshotView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetSnapshotMemoryCacheForTests();
    mocks.readSyncState.mockResolvedValue({
      nextIngestCursor: 'cursor',
      bootstrapComplete: false,
      bootstrapStartedAt: '2026-09-05T06:15:00.000Z',
      lastSyncAt: null,
      authProbeCursor: null,
    });
  });

  it('carries the ordered records, whole-snapshot counts and the sync flags', async () => {
    mocks.readSnapshotStamp.mockResolvedValue(1);
    mocks.readSnapshotRecords.mockResolvedValueOnce([tool, notion]);

    const view = await getSnapshotView();

    expect(view.records.map((record) => record.id)).toEqual(['notion', 'tool']);
    expect(view.counts.totalRecords).toBe(2);
    expect(view.counts.byBadge).toEqual({
      'first-party': 1,
      official: 0,
      verified: 0,
      registry: 0,
      community: 1,
    });
    expect(view.counts.byConnectable['connect']).toBe(1);
    expect(view.bootstrapComplete).toBe(false);
    expect(view.lastSyncAt).toBeNull();
  });

  it('computes counts once per stamp while re-reading the small sync state every time', async () => {
    mocks.readSnapshotStamp.mockResolvedValue(1);
    mocks.readSnapshotRecords.mockResolvedValueOnce([tool, notion]);

    const first = await getSnapshotView();
    const second = await getSnapshotView();

    expect(second.counts).toBe(first.counts);
    expect(mocks.readSnapshotRecords).toHaveBeenCalledTimes(1);
    expect(mocks.readSyncState).toHaveBeenCalledTimes(2);
  });

  it('serves a registry record persisted without a badge as community and counts it there', async () => {
    const { badge: _badge, ...legacy } = directoryRecord({ id: 'io.github.someone/legacy' });
    mocks.readSnapshotStamp.mockResolvedValue(1);
    mocks.readSnapshotRecords.mockResolvedValueOnce([legacy, notion]);

    const view = await getSnapshotView();

    expect(view.records.find((record) => record.id === legacy.id)?.badge).toBe('community');
    expect(view.counts.byBadge.community).toBe(1);
  });

  it('reports zero counts and the sync flags for an empty directory', async () => {
    mocks.readSnapshotStamp.mockResolvedValue(null);

    const view = await getSnapshotView();

    expect(view.records).toEqual([]);
    expect(view.counts.totalRecords).toBe(0);
    expect(view.bootstrapComplete).toBe(false);
  });
});
