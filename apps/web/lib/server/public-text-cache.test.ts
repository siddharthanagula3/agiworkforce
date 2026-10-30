import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal(
    'AsyncLocalStorage',
    process.getBuiltinModule('node:async_hooks').AsyncLocalStorage,
  );
});
vi.mock('server-only', () => ({}));

import { cachedPublicText } from './public-text-cache';

const entries = new Map<string, unknown>();
let largestEntry = 0;

beforeEach(() => {
  entries.clear();
  largestEntry = 0;
  vi.stubGlobal('__incrementalCache', {
    generateSimpleCacheKey: async (key: string) => key,
    get: async (key: string) =>
      entries.has(key) ? { value: entries.get(key), isStale: false } : null,
    set: async (key: string, value: unknown) => {
      const bytes = Buffer.byteLength(JSON.stringify(value));
      largestEntry = Math.max(largestEntry, bytes);
      if (bytes > 2 * 1024 * 1024) throw new Error('Next data cache entry exceeds 2 MB');
      entries.set(key, value);
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('versioned public text cache', () => {
  it('reuses a 5.7 MB payload across cold readers without exceeding the cache entry limit', async () => {
    const text = 'A'.repeat(5_714_429);
    const source = vi.fn(async () => text);
    await expect(cachedPublicText(source, 'large-public-payload')(1)).resolves.toBe(text);
    await expect(cachedPublicText(source, 'large-public-payload')(1)).resolves.toBe(text);
    expect(source).toHaveBeenCalledTimes(1);
    expect(largestEntry).toBeLessThan(2 * 1024 * 1024);
  });

  it('isolates namespaces and new source versions', async () => {
    const source = vi.fn(async () => 'first');
    const read = cachedPublicText(source, 'one');
    await read(1);
    source.mockResolvedValue('second');
    await expect(read(2)).resolves.toBe('second');
    await expect(cachedPublicText(source, 'two')(1)).resolves.toBe('second');
    expect(source).toHaveBeenCalledTimes(3);
  });

  it('coalesces concurrent cold loads', async () => {
    const source = vi.fn(async () => 'shared');
    const read = cachedPublicText(source, 'concurrent');
    expect(await Promise.all(Array.from({ length: 20 }, () => read(1)))).toEqual(
      Array(20).fill('shared'),
    );
    expect(source).toHaveBeenCalledTimes(1);
  });

  it('does not combine an old manifest with chunks from a newer snapshot', async () => {
    const source = vi.fn(async () => 'old');
    const read = cachedPublicText(source, 'advancing');
    await read(1);
    for (const key of entries.keys()) {
      if (key.includes('advancing,') && key.includes(',chunk,')) entries.delete(key);
    }
    source.mockResolvedValue('new');
    await expect(read(1)).resolves.toBe('new');
    expect(source).toHaveBeenCalledTimes(2);
  });

  it('keeps escaped text within the provider entry limit and preserves Unicode', async () => {
    const text = '\u0000💡'.repeat(100_000);
    const source = vi.fn(async () => text);
    const read = cachedPublicText(source, 'unicode');
    await expect(read(1)).resolves.toBe(text);
    await expect(cachedPublicText(source, 'unicode')(1)).resolves.toBe(text);
    expect(largestEntry).toBeLessThan(2 * 1024 * 1024);
    expect(source).toHaveBeenCalledTimes(1);
  });
});
