import 'server-only';

import { after } from 'next/server';

import { getKeyValueStore } from '@/lib/server/key-value';
import { logger } from '@/lib/logger';
import { readRedisWithinBudget, wasRedisReadAbandoned } from '@/lib/server/bounded-redis-read';

const CACHE_KEY_PREFIX = 'req-ctx:v1';
export const REQUEST_CONTEXT_CACHE_TTL_SECONDS = 5 * 60;

function writeOffRequestPath(write: () => Promise<void>): void {
  const pending = write();
  try {
    after(pending);
  } catch {
    void pending;
  }
}

interface CachedAccountStatus {
  status: string | null;
}

interface CachedActiveOrganization {
  organizationId: string | null;
}

function accountStatusKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}:account-status:${userId}`;
}

function activeOrganizationKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}:active-org:${userId}`;
}

/**
 * Never throws. A misconfigured or unavailable Redis client is exactly the
 * outage this cache must fall through on, not a reason to fail the request.
 */
function resolveStore(): ReturnType<typeof getKeyValueStore> {
  try {
    return getKeyValueStore();
  } catch {
    return null;
  }
}

/**
 * Returns `undefined` on a cache miss or a Redis outage, either of which
 * means the caller must fall through to Postgres. A cached "no value" state
 * (status null, no active organization) comes back as `null`, distinct from
 * a miss.
 */
export async function getCachedAccountStatus(userId: string): Promise<string | null | undefined> {
  const store = resolveStore();
  if (!store) return undefined;
  try {
    const cached = await readRedisWithinBudget(
      store.get<CachedAccountStatus>(accountStatusKey(userId)),
    );
    if (wasRedisReadAbandoned(cached) || !cached) return undefined;
    return cached.status;
  } catch (err) {
    logger.debug({ err, userId }, '[request-context-cache] account-status read failed');
    return undefined;
  }
}

export async function setCachedAccountStatus(userId: string, status: string | null): Promise<void> {
  const store = resolveStore();
  if (!store) return;
  writeOffRequestPath(async () => {
    try {
      await store.set(accountStatusKey(userId), { status } satisfies CachedAccountStatus, {
        ttlSeconds: REQUEST_CONTEXT_CACHE_TTL_SECONDS,
      });
    } catch (err) {
      logger.debug({ err, userId }, '[request-context-cache] account-status write failed');
    }
  });
}

export async function invalidateAccountStatusCache(userId: string): Promise<void> {
  const store = resolveStore();
  if (!store) return;
  try {
    await store.delete(accountStatusKey(userId));
  } catch (err) {
    logger.debug({ err, userId }, '[request-context-cache] account-status invalidation failed');
  }
}

export async function getCachedActiveOrganizationId(
  userId: string,
): Promise<string | null | undefined> {
  const store = resolveStore();
  if (!store) return undefined;
  try {
    const cached = await readRedisWithinBudget(
      store.get<CachedActiveOrganization>(activeOrganizationKey(userId)),
    );
    if (wasRedisReadAbandoned(cached) || !cached) return undefined;
    return cached.organizationId;
  } catch (err) {
    logger.debug({ err, userId }, '[request-context-cache] active-organization read failed');
    return undefined;
  }
}

export async function setCachedActiveOrganizationId(
  userId: string,
  organizationId: string | null,
): Promise<void> {
  const store = resolveStore();
  if (!store) return;
  writeOffRequestPath(async () => {
    try {
      await store.set(
        activeOrganizationKey(userId),
        { organizationId } satisfies CachedActiveOrganization,
        { ttlSeconds: REQUEST_CONTEXT_CACHE_TTL_SECONDS },
      );
    } catch (err) {
      logger.debug({ err, userId }, '[request-context-cache] active-organization write failed');
    }
  });
}

export async function invalidateActiveOrganizationCache(userId: string): Promise<void> {
  const store = resolveStore();
  if (!store) return;
  try {
    await store.delete(activeOrganizationKey(userId));
  } catch (err) {
    logger.debug(
      { err, userId },
      '[request-context-cache] active-organization invalidation failed',
    );
  }
}
