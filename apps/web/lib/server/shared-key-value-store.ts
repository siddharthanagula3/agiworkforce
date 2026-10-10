import 'server-only';

import type { KeyValueStore } from '@agiworkforce/key-value';

import { logger } from '@/lib/logger';
import { getKeyValueProvider, getKeyValueStore } from '@/lib/server/key-value';

const SHARED_STORE_PROVIDERS: ReadonlySet<string> = new Set(['upstash', 'redis']);

/**
 * The key-value store, only when every server instance reads the same one.
 * A per-process store would let each instance spend a shared allowance on
 * its own, so outside development it counts as no store at all.
 */
export function sharedKeyValueStore(nodeEnv: string | undefined): KeyValueStore | null {
  try {
    const store = getKeyValueStore();
    if (!store) return null;
    return SHARED_STORE_PROVIDERS.has(getKeyValueProvider()) || nodeEnv === 'development'
      ? store
      : null;
  } catch (error) {
    logger.error({ error }, '[shared-state] shared state store could not be resolved');
    return null;
  }
}
