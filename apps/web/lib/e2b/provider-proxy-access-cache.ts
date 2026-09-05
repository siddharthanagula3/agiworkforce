import 'server-only';

import { logger } from '@/lib/logger';
import { getKeyValueStore } from '@/lib/server/key-value';
import type { ManagedComputeAccessDecision } from '@/lib/services/managed-compute-access';

const CACHE_KEY_PREFIX = 'provider-proxy:gate:v1';

/**
 * How long an ALLOWED gate decision may be trusted without a fresh database
 * read. Bounds, rather than eliminates, the window in which a session keeps
 * spending after its workspace flips to `billing_read_only` mid-session: the
 * whole reason this cache exists is to keep the per-call hot path off the
 * database, so some staleness is the deliberate trade. A REFUSED decision is
 * never cached, {@link invalidateCachedProviderProxyAccess} clears any stale
 * ALLOWED entry instead, so a session that starts failing re-checks on every
 * following call rather than being pinned to a snapshot from before it failed.
 */
const CACHE_TTL_SECONDS = 30;

interface MemoryCacheEntry {
  decision: ManagedComputeAccessDecision;
  expiresAtMs: number;
}

const memoryCache = new Map<string, MemoryCacheEntry>();

function cacheKey(sessionId: string): string {
  return `${CACHE_KEY_PREFIX}:${sessionId}`;
}

export async function readCachedProviderProxyAccess(
  sessionId: string,
): Promise<ManagedComputeAccessDecision | null> {
  const store = getKeyValueStore();
  if (store) {
    try {
      return (await store.get<ManagedComputeAccessDecision>(cacheKey(sessionId))) ?? null;
    } catch (err) {
      logger.warn({ err, sessionId }, '[e2b] provider-proxy gate cache read failed');
      return null;
    }
  }
  const entry = memoryCache.get(sessionId);
  if (!entry) return null;
  if (entry.expiresAtMs <= Date.now()) {
    memoryCache.delete(sessionId);
    return null;
  }
  return entry.decision;
}

export async function writeCachedProviderProxyAccess(
  sessionId: string,
  decision: ManagedComputeAccessDecision,
): Promise<void> {
  const store = getKeyValueStore();
  if (store) {
    try {
      await store.set(cacheKey(sessionId), decision, { ttlSeconds: CACHE_TTL_SECONDS });
      return;
    } catch (err) {
      logger.warn({ err, sessionId }, '[e2b] provider-proxy gate cache write failed');
    }
  }
  memoryCache.set(sessionId, { decision, expiresAtMs: Date.now() + CACHE_TTL_SECONDS * 1000 });
}

export async function invalidateCachedProviderProxyAccess(sessionId: string): Promise<void> {
  memoryCache.delete(sessionId);
  const store = getKeyValueStore();
  if (!store) return;
  try {
    await store.delete(cacheKey(sessionId));
  } catch (err) {
    logger.warn({ err, sessionId }, '[e2b] provider-proxy gate cache invalidation failed');
  }
}
