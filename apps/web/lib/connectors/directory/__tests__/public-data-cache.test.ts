type SnapshotCacheModule = typeof import('../snapshot-cache');

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  vi.stubGlobal(
    'AsyncLocalStorage',
    process.getBuiltinModule('node:async_hooks').AsyncLocalStorage,
  );
  return { query: vi.fn(), stamp: 1, records: vi.fn(), iconIndex: vi.fn() };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mocks.query, execute: vi.fn() }),
}));
vi.mock('@/lib/connectors/directory/snapshot-cache', async (importOriginal) => ({
  ...(await importOriginal<SnapshotCacheModule>()),
  readSnapshotStamp: async () => mocks.stamp,
  readIconIndexStamp: async () => mocks.stamp,
  readSnapshotRecords: () => mocks.records(),
  readIconIndex: () => mocks.iconIndex(),
  readSyncState: async () => ({ bootstrapComplete: true, lastSyncAt: null }),
}));

import { getIconForUrl } from '../icon-fetch';
import {
  __resetSnapshotMemoryCacheForTests,
  getDirectoryIconUrl,
  getSnapshotRecords,
} from '../memory-cache';

beforeEach(() => {
  const entries = new Map<string, unknown>();
  vi.stubGlobal('__incrementalCache', {
    generateSimpleCacheKey: async (key: string) => key,
    get: async (key: string) =>
      entries.has(key) ? { value: entries.get(key), isStale: false } : null,
    set: async (key: string, value: unknown) => {
      entries.set(key, value);
    },
  });
  __resetSnapshotMemoryCacheForTests();
  mocks.stamp = 1;
  mocks.records.mockResolvedValue([]);
  mocks.iconIndex.mockResolvedValue({ connector: 'https://cdn.example.com/icon.png' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('public directory data cache with the installed Next cache implementation', () => {
  it('transfers a repeated large icon value from Postgres once across 50 reads', async () => {
    const icon = { contentType: 'image/png', base64: 'AAAA'.repeat(50_000) };
    mocks.query.mockResolvedValue([
      {
        value: JSON.stringify(icon),
        stamp: 1,
        scope: 'public',
        expires_at_ms: Date.now() + 60_000,
      },
    ]);
    for (let i = 0; i < 50; i++) {
      await expect(getIconForUrl('https://cdn.example.com/icon.png')).resolves.toEqual(icon);
    }
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('separates icon URLs in the shared cache', async () => {
    const icon = { contentType: 'image/png', base64: 'AAAA' };
    mocks.query.mockResolvedValue([
      {
        value: JSON.stringify(icon),
        stamp: 1,
        scope: 'public',
        expires_at_ms: Date.now() + 60_000,
      },
    ]);
    await getIconForUrl('https://cdn.example.com/first.png');
    await getIconForUrl('https://cdn.example.com/second.png');
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it('shares directory and icon-index payloads across cold process-memory reads and observes new stamps', async () => {
    for (let i = 0; i < 10; i++) {
      __resetSnapshotMemoryCacheForTests();
      await getSnapshotRecords();
      await expect(getDirectoryIconUrl('connector')).resolves.toBe(
        'https://cdn.example.com/icon.png',
      );
    }
    expect(mocks.records).toHaveBeenCalledTimes(1);
    expect(mocks.iconIndex).toHaveBeenCalledTimes(1);
    mocks.stamp = 2;
    mocks.iconIndex.mockResolvedValue({ connector: 'https://cdn.example.com/new.png' });
    await getSnapshotRecords();
    await expect(getDirectoryIconUrl('connector')).resolves.toBe('https://cdn.example.com/new.png');
    expect(mocks.records).toHaveBeenCalledTimes(2);
    expect(mocks.iconIndex).toHaveBeenCalledTimes(2);
  });
});
