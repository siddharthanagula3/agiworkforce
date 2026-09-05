import 'server-only';

import { after } from 'next/server';

import { getSharedRedisClient } from '@/lib/rate-limit';
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
function resolveRedis(): ReturnType<typeof getSharedRedisClient> | null {
  try {
    return getSharedRedisClient();
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
  const redis = resolveRedis();
  if (!redis) return undefined;
  try {
    const cached = await readRedisWithinBudget(
      redis.get<CachedAccountStatus>(accountStatusKey(userId)),
    );
    if (wasRedisReadAbandoned(cached) || !cached) return undefined;
    return cached.status;
  } catch (err) {
    logger.debug({ err, userId }, '[request-context-cache] account-status read failed');
    return undefined;
  }
}

export async function setCachedAccountStatus(userId: string, status: string | null): Promise<void> {
  const redis = resolveRedis();
  if (!redis) return;
  writeOffRequestPath(async () => {
    try {
      await redis.set<CachedAccountStatus>(
        accountStatusKey(userId),
        { status },
        { ex: REQUEST_CONTEXT_CACHE_TTL_SECONDS },
      );
    } catch (err) {
      logger.debug({ err, userId }, '[request-context-cache] account-status write failed');
    }
  });
}

export async function invalidateAccountStatusCache(userId: string): Promise<void> {
  const redis = resolveRedis();
  if (!redis) return;
  try {
    await redis.del(accountStatusKey(userId));
  } catch (err) {
    logger.debug({ err, userId }, '[request-context-cache] account-status invalidation failed');
  }
}

export async function getCachedActiveOrganizationId(
  userId: string,
): Promise<string | null | undefined> {
  const redis = resolveRedis();
  if (!redis) return undefined;
  try {
    const cached = await readRedisWithinBudget(
      redis.get<CachedActiveOrganization>(activeOrganizationKey(userId)),
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
  const redis = resolveRedis();
  if (!redis) return;
  writeOffRequestPath(async () => {
    try {
      await redis.set<CachedActiveOrganization>(
        activeOrganizationKey(userId),
        { organizationId },
        { ex: REQUEST_CONTEXT_CACHE_TTL_SECONDS },
      );
    } catch (err) {
      logger.debug({ err, userId }, '[request-context-cache] active-organization write failed');
    }
  });
}

export async function invalidateActiveOrganizationCache(userId: string): Promise<void> {
  const redis = resolveRedis();
  if (!redis) return;
  try {
    await redis.del(activeOrganizationKey(userId));
  } catch (err) {
    logger.debug(
      { err, userId },
      '[request-context-cache] active-organization invalidation failed',
    );
  }
}
