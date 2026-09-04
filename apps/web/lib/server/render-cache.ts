import 'server-only';

import { unstable_cache } from 'next/cache';
import { DEFAULT_LANGUAGE } from '@agiworkforce/i18n';

/**
 * The locale the server actually renders in.
 *
 * Translation on the web surface runs entirely in the browser: `app/i18n`
 * initialises i18next with `lng: DEFAULT_LANGUAGE` and only calls
 * `changeLanguage()` behind a `typeof window !== 'undefined'` guard, and the
 * root layout hardcodes `<html lang="en">`. Server output is therefore the same
 * for every visitor regardless of their Accept-Language or language cookie.
 *
 * It is still a cache-key dimension, because the day server-side locale lands
 * this constant has to become request-derived, and every key built through
 * {@link renderCacheKey} follows it. `render-cache.locale.test.ts` fails if the
 * invariant is broken without the keys being updated.
 */
export const SERVER_RENDER_LOCALE = DEFAULT_LANGUAGE;

export const RENDER_CACHE_TAGS = {
  statusHealth: 'status-health',
  pluginCatalog: 'plugin-catalog',
  pluginEntry: (id: string) => `plugin-entry:${id}`,
} as const;

/**
 * Cache profiles in seconds. Each is a statement about how stale the rendered
 * output of a shared page is allowed to be, not a performance knob.
 */
export const RENDER_CACHE_SECONDS = {
  /** Live-ish signals: the status page's dependency probes. */
  liveSignal: 60,
  /** Catalogue content that only changes when someone publishes. */
  catalog: 300,
} as const;

export function renderCacheKey(parts: readonly string[]): string[] {
  return [...parts, `locale=${SERVER_RENDER_LOCALE}`];
}

function isMissingIncrementalCache(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { __NEXT_ERROR_CODE?: unknown }).__NEXT_ERROR_CODE;
  if (code === 'E469') return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.includes('incrementalCache missing');
}

export function cachedRenderInput<TArgs extends unknown[], TResult>(
  compute: (...args: TArgs) => Promise<TResult>,
  options: { keyParts: readonly string[]; tags: readonly string[]; revalidate: number },
): (...args: TArgs) => Promise<TResult> {
  const cached = unstable_cache(compute, renderCacheKey(options.keyParts), {
    tags: [...options.tags],
    revalidate: options.revalidate,
  });

  return async (...args: TArgs): Promise<TResult> => {
    try {
      return await cached(...args);
    } catch (error) {
      if (!isMissingIncrementalCache(error)) throw error;
      return compute(...args);
    }
  };
}
