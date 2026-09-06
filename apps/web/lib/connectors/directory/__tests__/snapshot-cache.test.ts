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
  DEFAULT_SYNC_STATE,
  clearIngestLease,
  readIngestLease,
  readSnapshotRecords,
  readSnapshotStamp,
  readSyncState,
  writeIngestLease,
  writeSnapshotRecords,
  writeSyncState,
} from '@/lib/connectors/directory/snapshot-cache';

const NOW_MS = Date.parse('2026-09-05T06:15:00.000Z');
const LEASE_TTL_MS = 60_000;
const LEASE = {
  startedAt: new Date(NOW_MS - LEASE_TTL_MS).toISOString(),
  expiresAt: new Date(NOW_MS + LEASE_TTL_MS).toISOString(),
};

function leaseRow(expiresAtMs: number) {
  return {
    value: JSON.stringify(LEASE),
    stamp: '1',
    expires_at_ms: String(expiresAtMs),
    scope: 'public',
  };
}

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
      bootstrapStartedAt: null,
      lastSyncAt: null,
      authProbeCursor: null,
      siteIconCursor: null,
    });
    expect(DEFAULT_SYNC_STATE.authProbeCursor).toBeNull();
    expect(DEFAULT_SYNC_STATE.siteIconCursor).toBeNull();
  });

  it('round-trips a written state', async () => {
    const state = {
      nextIngestCursor: 'cursor-1',
      bootstrapComplete: true,
      bootstrapStartedAt: '2026-08-31T00:00:00.000Z',
      lastSyncAt: '2026-09-01T00:00:00.000Z',
      authProbeCursor: 'io.github.someone/tool',
      siteIconCursor: 'com.vendor/site',
    };
    mocks.query.mockResolvedValueOnce([
      { value: JSON.stringify(state), stamp: '1', expires_at_ms: null, scope: 'public' },
    ]);

    await expect(readSyncState()).resolves.toEqual(state);
  });

  it('fills fields a state written by an older build did not know about', async () => {
    const legacy = { nextIngestCursor: null, bootstrapComplete: true, lastSyncAt: null };
    mocks.query.mockResolvedValueOnce([
      { value: JSON.stringify(legacy), stamp: '1', expires_at_ms: null, scope: 'public' },
    ]);

    await expect(readSyncState()).resolves.toEqual({
      ...legacy,
      bootstrapStartedAt: null,
      authProbeCursor: null,
      siteIconCursor: null,
    });
  });

  it('writes state as a small json value distinct from the snapshot row', async () => {
    mocks.query.mockResolvedValueOnce([{ stamp: '2' }]);

    await writeSyncState(DEFAULT_SYNC_STATE);

    const params = mocks.query.mock.calls[0]?.[1] as unknown[];
    expect(params[0]).toBe('connectors.directory.sync-state');
  });
});

describe('ingest lease', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports no lease when no run holds one', async () => {
    mocks.query.mockResolvedValueOnce([]);
    await expect(readIngestLease(NOW_MS)).resolves.toBeNull();
  });

  it('returns a lease that is still live', async () => {
    mocks.query.mockResolvedValueOnce([leaseRow(NOW_MS + LEASE_TTL_MS)]);
    await expect(readIngestLease(NOW_MS)).resolves.toEqual(LEASE);
  });

  it('treats a lease past its expiry as released, whatever the row still says', async () => {
    mocks.query.mockResolvedValueOnce([leaseRow(NOW_MS - 1)]);
    await expect(readIngestLease(NOW_MS)).resolves.toBeNull();
  });

  it('writes the lease under its own key and uses the lease expiry as the row ttl', async () => {
    mocks.query.mockResolvedValueOnce([{ stamp: '3' }]);

    await writeIngestLease(LEASE);

    const params = mocks.query.mock.calls[0]?.[1] as unknown[];
    expect(params[0]).toBe('connectors.directory.ingest-lease');
    expect(params[3]).toBe(JSON.stringify(LEASE));
    expect(params[4]).toBe(Date.parse(LEASE.expiresAt));
  });

  it('clears only the lease row', async () => {
    mocks.execute.mockResolvedValueOnce(undefined);

    await clearIngestLease();

    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(String(mocks.execute.mock.calls[0]?.[0])).toContain('delete');
    expect((mocks.execute.mock.calls[0]?.[1] as unknown[])[0]).toBe(
      'connectors.directory.ingest-lease',
    );
  });
});
