import { beforeEach, describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/logger');
type McpRuntimeCacheModule = typeof import('@/lib/connectors/mcp-runtime-cache');

import { directoryRecord } from './fixtures';

interface StoredRow {
  value: string;
  stamp: number;
  expiresAt?: number;
}

const store = vi.hoisted(() => {
  const rows = new Map<string, StoredRow>();
  let nextStamp = 1;
  return {
    rows,
    keyOf: (key: { method: string; params?: string }) => `${key.method}|${key.params ?? ''}`,
    reset() {
      rows.clear();
      nextStamp = 1;
    },
    put(key: string, value: string) {
      rows.set(key, { value, stamp: nextStamp++ });
    },
    mint() {
      return nextStamp++;
    },
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/connectors/mcp-runtime-cache', async (importOriginal) => ({
  ...(await importOriginal<McpRuntimeCacheModule>()),
  NeonMcpResponseCacheStore: class {
    async getStamp(key: { method: string; params?: string }) {
      return store.rows.get(store.keyOf(key))?.stamp ?? null;
    }
    async get(key: { method: string; params?: string }) {
      const row = store.rows.get(store.keyOf(key));
      return row ? { ...row } : undefined;
    }
    async set(
      key: { method: string; params?: string },
      entry: { value: string; expiresAt?: number },
    ) {
      const stamp = store.mint();
      store.rows.set(store.keyOf(key), { value: entry.value, stamp, expiresAt: entry.expiresAt });
      return stamp;
    }
    async replaceIfStamp(
      key: { method: string; params?: string },
      entry: { value: string; expiresAt?: number },
      expectedStamp: number,
    ) {
      const row = store.rows.get(store.keyOf(key));
      if (!row || row.stamp !== expectedStamp) return null;
      const stamp = store.mint();
      store.rows.set(store.keyOf(key), { value: entry.value, stamp, expiresAt: entry.expiresAt });
      return stamp;
    }
    async insertIfAbsent(
      key: { method: string; params?: string },
      entry: { value: string; expiresAt?: number },
    ) {
      if (store.rows.has(store.keyOf(key))) return null;
      const stamp = store.mint();
      store.rows.set(store.keyOf(key), { value: entry.value, stamp, expiresAt: entry.expiresAt });
      return stamp;
    }
    async delete(key: { method: string; params?: string }) {
      store.rows.delete(store.keyOf(key));
    }
  },
}));

import {
  DirectorySnapshotUnreadableError,
  decodeStoredJson,
  encodeStoredJson,
  readIconIndex,
  readSnapshotRecords,
  readSnapshotRecordsForIngest,
  writeSnapshotRecords,
} from '@/lib/connectors/directory/snapshot-cache';

const COMPRESSED = 'connectors.directory.snapshot|v2';
const LEGACY = 'connectors.directory.snapshot|v1';
const ICON_INDEX = 'connectors.directory.icon-index|v1';

function directory(size: number) {
  return Array.from({ length: size }, (_, index) =>
    directoryRecord({
      id: `io.github.example/server-${index}`,
      iconUrl: index % 2 === 0 ? `https://cdn.example.com/icons/${index}.png` : null,
    }),
  );
}

describe('connector directory snapshot storage', () => {
  beforeEach(() => store.reset());

  it('stores the snapshot compressed, so a read moves a fraction of the plain json', async () => {
    const records = directory(400);
    await writeSnapshotRecords(records);

    const stored = store.rows.get(COMPRESSED)!.value;
    expect(stored.startsWith('br64:')).toBe(true);
    expect(stored.length).toBeLessThan(JSON.stringify(records).length / 4);
    await expect(readSnapshotRecords()).resolves.toEqual(records);
  });

  it('keeps the plain json row an older build reads complete, so a rollback serves the full directory', async () => {
    const records = directory(12);
    await writeSnapshotRecords(records);

    expect(JSON.parse(store.rows.get(LEGACY)!.value)).toEqual(records);
  });

  it('writes an icon index with only the connectors that have icons', async () => {
    await writeSnapshotRecords(directory(4));

    await expect(readIconIndex()).resolves.toEqual({
      'io.github.example/server-0': 'https://cdn.example.com/icons/0.png',
      'io.github.example/server-2': 'https://cdn.example.com/icons/2.png',
    });
  });

  it('copies a legacy-only snapshot to the compressed row once, leaving the legacy row as it was', async () => {
    const records = directory(6);
    store.put(LEGACY, JSON.stringify(records));

    await expect(readSnapshotRecords()).resolves.toEqual(records);

    expect(await decodeStoredJson(store.rows.get(COMPRESSED)!.value)).toEqual(records);
    expect(store.rows.get(LEGACY)!.value).toBe(JSON.stringify(records));
    expect(store.rows.has(ICON_INDEX)).toBe(true);
  });

  it('keeps serving the compressed row while it is newer than the legacy row', async () => {
    store.put(LEGACY, JSON.stringify(directory(9)));
    const fresh = directory(3);
    store.put(COMPRESSED, await encodeStoredJson(fresh));

    await expect(readSnapshotRecords()).resolves.toEqual(fresh);
    expect(JSON.parse(store.rows.get(LEGACY)!.value)).toHaveLength(9);
  });

  it('rolls forward onto what an older build wrote during a rollback instead of the stale compressed row', async () => {
    await writeSnapshotRecords(directory(3));
    const writtenDuringRollback = directory(5);
    store.put(LEGACY, JSON.stringify(writtenDuringRollback));

    await expect(readSnapshotRecords()).resolves.toEqual(writtenDuringRollback);
    expect(await decodeStoredJson(store.rows.get(COMPRESSED)!.value)).toEqual(
      writtenDuringRollback,
    );
    await expect(readSnapshotRecords()).resolves.toEqual(writtenDuringRollback);
  });

  it('serves nothing rather than throwing on a corrupt row, but refuses to let an ingest merge onto it', async () => {
    store.put(COMPRESSED, 'br64:not-brotli');

    await expect(readSnapshotRecords()).resolves.toBeNull();
    await expect(readSnapshotRecordsForIngest()).rejects.toBeInstanceOf(
      DirectorySnapshotUnreadableError,
    );
  });

  it('refuses an ingest over a legacy row that is not json', async () => {
    store.put(LEGACY, '{"truncated');

    await expect(readSnapshotRecordsForIngest()).rejects.toBeInstanceOf(
      DirectorySnapshotUnreadableError,
    );
  });

  it('lets an ingest start from nothing when no snapshot exists at all', async () => {
    await expect(readSnapshotRecordsForIngest()).resolves.toBeNull();
  });
});
