/**
 * @file The plugin registry is read on public pages that are identical for
 * every visitor. These tests pin that the reads collapse onto a shared cache,
 * that one plugin's cached answer can never be served for another, and that a
 * URL-supplied id cannot grow server memory without bound.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface CacheCall {
  keyParts: string[];
  tags: string[];
  revalidate: number;
}

const cacheCalls = vi.hoisted(() => [] as CacheCall[]);

vi.mock('server-only', () => ({}));

vi.mock('next/cache', () => ({
  unstable_cache: (
    cb: (...args: unknown[]) => Promise<unknown>,
    keyParts: string[],
    options: { tags: string[]; revalidate: number },
  ) => {
    cacheCalls.push({ keyParts, tags: options.tags, revalidate: options.revalidate });
    return (...args: unknown[]) => cb(...args);
  },
}));

const registryReads = vi.hoisted(() => ({ list: 0, get: 0 }));

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));

vi.mock('@/lib/services/plugin-registry-service', () => ({
  listPluginRegistryEntries: async () => {
    registryReads.list += 1;
    return { entries: [{ id: 'alpha' }] };
  },
  getPluginRegistryEntry: async (_db: unknown, id: string) => {
    registryReads.get += 1;
    return { entry: { id, name: `plugin ${id}` }, manifest: null };
  },
}));

const { loadPluginCatalog, loadPluginEntry } = await import('../registry-source');

function keysFor(prefix: string): CacheCall[] {
  return cacheCalls.filter((call) => call.keyParts[1] === prefix);
}

describe('plugin registry render cache', () => {
  beforeEach(() => {
    registryReads.list = 0;
    registryReads.get = 0;
  });

  it('reads the catalogue through a tagged, time-bounded cache', async () => {
    await loadPluginCatalog();

    const [call] = keysFor('catalog');
    expect(call).toBeDefined();
    expect(call?.keyParts).toEqual(['plugins', 'catalog', 'locale=en']);
    expect(call?.tags).toContain('plugin-catalog');
    expect(call?.revalidate).toBeGreaterThan(0);
  });

  it('gives each plugin its own cache key and its own invalidation tag', async () => {
    await loadPluginEntry('alpha');
    await loadPluginEntry('beta');

    const alpha = keysFor('entry').find((call) => call.keyParts.includes('alpha'));
    const beta = keysFor('entry').find((call) => call.keyParts.includes('beta'));

    expect(alpha?.keyParts).not.toEqual(beta?.keyParts);
    expect(alpha?.tags).toContain('plugin-entry:alpha');
    expect(beta?.tags).toContain('plugin-entry:beta');
    expect(alpha?.tags).not.toContain('plugin-entry:beta');
  });

  it('routes repeat lookups of one id through a single cache wrapper', async () => {
    const id = `dedupe-${cacheCalls.length}`;
    const before = keysFor('entry').length;

    const [first, second] = await Promise.all([loadPluginEntry(id), loadPluginEntry(id)]);

    expect(first).toEqual(second);
    // One wrapper for the id, so the detail route's `generateMetadata` and body
    // lookups share a cache entry instead of each opening their own. React's
    // `cache` collapses them further inside a real request; this environment has
    // no request scope, so only the shared wrapper is observable here.
    expect(keysFor('entry').length - before).toBe(1);
  });

  it('does not build an unbounded reader per URL-supplied id', async () => {
    const before = keysFor('entry').length;
    for (let i = 0; i < 400; i++) {
      await loadPluginEntry(`probe-${i}`);
    }
    const created = keysFor('entry').length - before;

    // Every id still resolves, but the retained wrapper set is capped, so the
    // wrappers get rebuilt rather than accumulating one per id forever.
    expect(created).toBe(400);
    const { entryReaderCountForTests } = await import('../registry-source');
    expect(entryReaderCountForTests()).toBeLessThanOrEqual(256);
  });
});
