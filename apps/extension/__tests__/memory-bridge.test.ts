/**
 * Tests for src/background/memory-bridge.ts
 *
 * Covers:
 *   - memoryList() returns [] when storage is empty
 *   - memoryList() returns valid entries, filters corrupt ones
 *   - memoryAdd() creates an item with id/timestamps
 *   - memoryAdd() trims and slices content to 2000 chars
 *   - memoryAdd() returns null for empty content
 *   - memoryAdd() returns null when at MAX_MEMORY_ITEMS
 *   - memoryUpdate() modifies content + updatedAt for existing id
 *   - memoryUpdate() returns null for unknown id
 *   - memoryUpdate() returns null for empty new content
 *   - memoryDelete() removes the item and returns true
 *   - memoryDelete() returns false for unknown id
 *   - MEMORY_STORAGE_KEY, MAX_MEMORY_ITEMS, MAX_CONTENT_CHARS are exported
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMock = vi.hoisted(() => {
  let store: Record<string, unknown> = {};

  const mock = {
    local: {
      _store: store,
      get: vi.fn(async (key: string) => {
        return { [key]: store[key] };
      }),
      set: vi.fn(async (obj: Record<string, unknown>) => {
        Object.assign(store, obj);
      }),
      _reset: () => {
        store = {};
        mock.local._store = store;
        mock.local.get = vi.fn(async (key: string) => {
          return { [key]: store[key] };
        });
        mock.local.set = vi.fn(async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        });
      },
    },
  };
  (globalThis as Record<string, unknown>).chrome = { storage: mock };
  return mock;
});

import {
  memoryList,
  memoryAdd,
  memoryUpdate,
  memoryDelete,
  MEMORY_STORAGE_KEY,
  MAX_MEMORY_ITEMS,
  MAX_CONTENT_CHARS,
} from '../src/background/memory-bridge.ts';

beforeEach(() => {
  storageMock.local._reset();
  vi.clearAllMocks();
});

describe('memoryList', () => {
  it('returns [] when storage is empty', async () => {
    const result = await memoryList();
    expect(result).toEqual([]);
  });

  it('returns [] when stored value is not an array', async () => {
    await storageMock.local.set({ [MEMORY_STORAGE_KEY]: 'bad' });
    const result = await memoryList();
    expect(result).toEqual([]);
  });

  it('filters out corrupt entries missing required fields', async () => {
    const items = [
      {
        id: 'a',
        content: 'Valid',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { id: 'b' }, // missing content/createdAt/updatedAt
      null,
      42,
    ];
    await storageMock.local.set({ [MEMORY_STORAGE_KEY]: items });
    const result = await memoryList();
    expect(result.length).toBe(1);
    expect(result[0]!.id).toBe('a');
  });

  it('returns all valid entries in insertion order', async () => {
    const items = [
      {
        id: 'x1',
        content: 'First',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'x2',
        content: 'Second',
        createdAt: '2026-01-02T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      },
    ];
    await storageMock.local.set({ [MEMORY_STORAGE_KEY]: items });
    const result = await memoryList();
    expect(result.map((m) => m.id)).toEqual(['x1', 'x2']);
  });
});

describe('memoryAdd', () => {
  it('creates an item with id, content, createdAt, updatedAt', async () => {
    const item = await memoryAdd('User prefers TypeScript strict mode');
    expect(item).not.toBeNull();
    expect(typeof item!.id).toBe('string');
    expect(item!.content).toBe('User prefers TypeScript strict mode');
    expect(typeof item!.createdAt).toBe('string');
    expect(typeof item!.updatedAt).toBe('string');
  });

  it('persists the item so memoryList() returns it', async () => {
    await memoryAdd('Persisted fact');
    const list = await memoryList();
    expect(list.length).toBe(1);
    expect(list[0]!.content).toBe('Persisted fact');
  });

  it('trims leading/trailing whitespace', async () => {
    const item = await memoryAdd('   trimmed   ');
    expect(item!.content).toBe('trimmed');
  });

  it('slices content to MAX_CONTENT_CHARS', async () => {
    const long = 'x'.repeat(MAX_CONTENT_CHARS + 100);
    const item = await memoryAdd(long);
    expect(item!.content.length).toBe(MAX_CONTENT_CHARS);
  });

  it('returns null for whitespace-only content', async () => {
    const item = await memoryAdd('   ');
    expect(item).toBeNull();
  });

  it('returns null for empty string', async () => {
    const item = await memoryAdd('');
    expect(item).toBeNull();
  });

  it('returns null when at MAX_MEMORY_ITEMS', async () => {
    const existing = Array.from({ length: MAX_MEMORY_ITEMS }, (_, i) => ({
      id: `id-${i}`,
      content: `content-${i}`,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }));
    await storageMock.local.set({ [MEMORY_STORAGE_KEY]: existing });
    const item = await memoryAdd('One too many');
    expect(item).toBeNull();
  });

  it('generates unique ids across consecutive calls', async () => {
    const a = await memoryAdd('Fact A');
    const b = await memoryAdd('Fact B');
    expect(a!.id).not.toBe(b!.id);
  });
});

describe('memoryUpdate', () => {
  it('updates content for existing id', async () => {
    const item = await memoryAdd('Original content');
    const updated = await memoryUpdate(item!.id, 'Updated content');
    expect(updated).not.toBeNull();
    expect(updated!.content).toBe('Updated content');
    expect(updated!.id).toBe(item!.id);
  });

  it('updates updatedAt but preserves createdAt', async () => {
    const item = await memoryAdd('Original');
    await new Promise((r) => setTimeout(r, 5));
    const updated = await memoryUpdate(item!.id, 'Changed');
    expect(updated!.createdAt).toBe(item!.createdAt);
    expect(typeof updated!.updatedAt).toBe('string');
  });

  it('persists the update', async () => {
    const item = await memoryAdd('Old');
    await memoryUpdate(item!.id, 'New');
    const list = await memoryList();
    expect(list[0]!.content).toBe('New');
  });

  it('returns null for unknown id', async () => {
    await memoryAdd('Existing');
    const result = await memoryUpdate('nonexistent-id', 'content');
    expect(result).toBeNull();
  });

  it('returns null for empty new content', async () => {
    const item = await memoryAdd('Existing');
    const result = await memoryUpdate(item!.id, '   ');
    expect(result).toBeNull();
  });

  it('trims and slices new content', async () => {
    const item = await memoryAdd('Short');
    const long = 'y'.repeat(MAX_CONTENT_CHARS + 50);
    const updated = await memoryUpdate(item!.id, `  ${long}  `);
    expect(updated!.content.length).toBe(MAX_CONTENT_CHARS);
  });
});

describe('memoryDelete', () => {
  it('returns true and removes the item', async () => {
    const item = await memoryAdd('Delete me');
    const result = await memoryDelete(item!.id);
    expect(result).toBe(true);
    const list = await memoryList();
    expect(list.length).toBe(0);
  });

  it('does not affect other items when deleting one', async () => {
    const a = await memoryAdd('Keep A');
    const b = await memoryAdd('Delete B');
    await memoryDelete(b!.id);
    const list = await memoryList();
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe(a!.id);
  });

  it('returns false for an unknown id', async () => {
    await memoryAdd('Existing');
    const result = await memoryDelete('nonexistent-id');
    expect(result).toBe(false);
  });

  it('does not modify storage for an unknown id', async () => {
    await memoryAdd('Untouched');
    await memoryDelete('no-such-id');
    const list = await memoryList();
    expect(list.length).toBe(1);
  });
});

// Exported constants

describe('exported constants', () => {
  it('MEMORY_STORAGE_KEY is "agi_memories"', () => {
    expect(MEMORY_STORAGE_KEY).toBe('agi_memories');
  });

  it('MAX_MEMORY_ITEMS is 200', () => {
    expect(MAX_MEMORY_ITEMS).toBe(200);
  });

  it('MAX_CONTENT_CHARS is 2000', () => {
    expect(MAX_CONTENT_CHARS).toBe(2000);
  });
});
