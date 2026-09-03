/**
 * @file Pins the cache-key contract for shared, user-independent render inputs.
 *
 * Two things can silently break a shared render cache: a key that omits a
 * dimension the output varies on (everyone gets one user's answer), and a
 * cached function that reaches for request state (the cache has no notion of
 * who asked). These tests hold the first line.
 */
import { describe, expect, it, vi } from 'vitest';

const unstableCache = vi.hoisted(() =>
  vi.fn(
    (
      cb: (...args: unknown[]) => Promise<unknown>,
      keyParts: string[],
      options: { tags: string[]; revalidate: number },
    ) => {
      const wrapped = (...args: unknown[]) => cb(...args);
      Object.assign(wrapped, { __keyParts: keyParts, __options: options });
      return wrapped;
    },
  ),
);

vi.mock('next/cache', () => ({ unstable_cache: unstableCache }));
vi.mock('server-only', () => ({}));

const {
  RENDER_CACHE_SECONDS,
  RENDER_CACHE_TAGS,
  SERVER_RENDER_LOCALE,
  cachedRenderInput,
  renderCacheKey,
} = await import('../server/render-cache');

async function readRepoFile(relativePath: string): Promise<string> {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('render cache keys', () => {
  it('carries the render locale in every key', () => {
    expect(renderCacheKey(['plugins', 'catalog'])).toEqual([
      'plugins',
      'catalog',
      `locale=${SERVER_RENDER_LOCALE}`,
    ]);
  });

  it('keeps distinct inputs on distinct keys', () => {
    expect(renderCacheKey(['a'])).not.toEqual(renderCacheKey(['b']));
  });

  it('passes tags and a revalidate window through to the cache', async () => {
    const compute = vi.fn(async () => 'value');
    const cached = cachedRenderInput(compute, {
      keyParts: ['demo'],
      tags: ['demo-tag'],
      revalidate: 42,
    });

    await expect(cached()).resolves.toBe('value');
    expect(unstableCache).toHaveBeenCalledWith(
      compute,
      ['demo', `locale=${SERVER_RENDER_LOCALE}`],
      { tags: ['demo-tag'], revalidate: 42 },
    );
  });

  it('falls through to an uncached read when no incremental cache is in scope', async () => {
    const compute = vi.fn(async () => 'fresh');
    unstableCache.mockImplementationOnce(() => () => {
      throw Object.assign(new Error('Invariant: incrementalCache missing in unstable_cache'), {
        __NEXT_ERROR_CODE: 'E469',
      });
    });

    const cached = cachedRenderInput(compute, {
      keyParts: ['no-cache-scope'],
      tags: [],
      revalidate: 60,
    });

    await expect(cached()).resolves.toBe('fresh');
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('still surfaces a genuine failure from the cached function', async () => {
    const compute = vi.fn(async () => {
      throw new Error('registry exploded');
    });
    const cached = cachedRenderInput(compute, {
      keyParts: ['real-failure'],
      tags: [],
      revalidate: 60,
    });

    await expect(cached()).rejects.toThrow('registry exploded');
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('names a tag per plugin so one entry can be dropped without the catalogue', () => {
    expect(RENDER_CACHE_TAGS.pluginEntry('acme')).toBe('plugin-entry:acme');
    expect(RENDER_CACHE_TAGS.pluginEntry('acme')).not.toBe(RENDER_CACHE_TAGS.pluginCatalog);
  });

  it('keeps the live-signal window shorter than the catalogue window', () => {
    expect(RENDER_CACHE_SECONDS.liveSignal).toBeLessThan(RENDER_CACHE_SECONDS.catalog);
  });
});

describe('server render locale invariant', () => {
  it('matches the locale the app actually server-renders in', async () => {
    const { DEFAULT_LANGUAGE } = await import('@agiworkforce/i18n');
    expect(SERVER_RENDER_LOCALE).toBe(DEFAULT_LANGUAGE);
  });

  it('holds the html lang attribute the root layout emits', async () => {
    const layout = await readRepoFile('app/layout.tsx');

    // If this stops matching, the server has started varying its output by
    // request locale and `renderCacheKey` must become request-derived before
    // any shared render output may be cached.
    expect(layout).toMatch(new RegExp(`<html\\b[^>]*\\slang="${SERVER_RENDER_LOCALE}"`));
  });

  it('keeps request-locale detection on the client, where it cannot vary a cached render', async () => {
    const i18n = await readRepoFile('app/i18n/index.ts');

    expect(i18n).toContain("'use client'");
    expect(i18n).toContain('lng: defaultLanguage');
    expect(i18n).toMatch(/typeof window !== 'undefined'[\s\S]*changeLanguage/);
  });
});
