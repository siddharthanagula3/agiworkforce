import { beforeEach, describe, expect, it, vi } from 'vitest';

import { directoryRecord } from './fixtures';

interface StoredRow {
  value: string;
  stamp: number;
  expiresAt?: number;
}

const store = vi.hoisted(() => {
  const rows = new Map<string, StoredRow>();
  let nextStamp = 1;
  const keyOf = (key: { method: string; params?: string }) => `${key.method}|${key.params ?? ''}`;
  return {
    rows,
    keyOf,
    stampMovesBeforeReplace: false,
    reset() {
      rows.clear();
      nextStamp = 1;
      this.stampMovesBeforeReplace = false;
    },
    seed(method: string, value: string) {
      rows.set(`${method}|v1`, { value, stamp: nextStamp++ });
    },
    mint() {
      return nextStamp++;
    },
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/connectors/mcp-runtime-cache', () => ({
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
      if (store.stampMovesBeforeReplace && row) row.stamp = store.mint();
      if (!row || row.stamp !== expectedStamp) return null;
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
  decodeStoredJson,
  readIconIndex,
  readSnapshotRecords,
  writeSnapshotRecords,
} from '@/lib/connectors/directory/snapshot-cache';

const SNAPSHOT = 'connectors.directory.snapshot';
const ICON_INDEX = 'connectors.directory.icon-index';

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

  it('stores the snapshot compressed, so a read moves a fraction of the plain JSON', async () => {
    const records = directory(400);
    await writeSnapshotRecords(records);

    const stored = store.rows.get(`${SNAPSHOT}|v1`)!.value;
    expect(stored.startsWith('br64:')).toBe(true);
    expect(stored.length).toBeLessThan(JSON.stringify(records).length / 4);
    await expect(readSnapshotRecords()).resolves.toEqual(records);
  });

  it('writes an icon index beside the snapshot with only the connectors that have icons', async () => {
    const records = directory(4);
    await writeSnapshotRecords(records);

    await expect(readIconIndex()).resolves.toEqual({
      'io.github.example/server-0': 'https://cdn.example.com/icons/0.png',
      'io.github.example/server-2': 'https://cdn.example.com/icons/2.png',
    });
  });

  it('reads a snapshot stored as plain JSON and rewrites it compressed with its icon index', async () => {
    const records = directory(6);
    store.seed(SNAPSHOT, JSON.stringify(records));

    await expect(readSnapshotRecords()).resolves.toEqual(records);

    const rewritten = store.rows.get(`${SNAPSHOT}|v1`)!.value;
    expect(rewritten.startsWith('br64:')).toBe(true);
    expect(decodeStoredJson(rewritten)).toEqual(records);
    expect(store.rows.has(`${ICON_INDEX}|v1`)).toBe(true);
  });

  it('never overwrites a snapshot that a sync replaced while the plain copy was being read', async () => {
    const records = directory(6);
    store.seed(SNAPSHOT, JSON.stringify(records));
    store.stampMovesBeforeReplace = true;

    await expect(readSnapshotRecords()).resolves.toEqual(records);

    expect(store.rows.get(`${SNAPSHOT}|v1`)!.value).toBe(JSON.stringify(records));
    expect(store.rows.has(`${ICON_INDEX}|v1`)).toBe(false);
  });

  it('returns null rather than throwing when the stored value is corrupt', async () => {
    store.seed(SNAPSHOT, 'br64:not-brotli');

    await expect(readSnapshotRecords()).resolves.toBeNull();
  });
});
