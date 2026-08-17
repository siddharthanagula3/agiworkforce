import 'server-only';

import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';
import type { CloudCodeNetworkAccess } from '@agiworkforce/types';

const redisRestUrl = process.env['KV_REST_API_URL'] || process.env['UPSTASH_REDIS_REST_URL'];
const redisRestToken = process.env['KV_REST_API_TOKEN'] || process.env['UPSTASH_REDIS_REST_TOKEN'];
const hasRedisEnv = !!redisRestUrl && !!redisRestToken;

const redis = hasRedisEnv ? new Redis({ url: redisRestUrl!, token: redisRestToken! }) : null;

export interface StoredContext {
  id: string;
  language: string;
  cwd: string;
}

export interface E2BSession {
  sandboxId: string;
  contexts: Record<string, StoredContext>;
  activeSinceMs?: number;
  networkAccess?: CloudCodeNetworkAccess;
}

export interface E2BSessionScope {
  tenantId: string;
  userId: string;
  conversationId?: string;
  resource?: {
    kind: 'code_session';
    id: string;
  };
  networkAccess?: CloudCodeNetworkAccess;
  planTier?: string;
}

export const MANAGED_CLOUD_E2B_TENANT_ID = 'managed-cloud';

export function managedCloudE2BSessionScope(
  userId: string,
  conversationId: string,
): E2BSessionScope {
  return { tenantId: MANAGED_CLOUD_E2B_TENANT_ID, userId, conversationId };
}

export function managedCloudCodeSessionScope(
  userId: string,
  codeSessionId: string,
  networkAccess: CloudCodeNetworkAccess,
  planTier?: string,
): E2BSessionScope {
  return {
    tenantId: MANAGED_CLOUD_E2B_TENANT_ID,
    userId,
    resource: { kind: 'code_session', id: codeSessionId },
    networkAccess,
    ...(planTier ? { planTier } : {}),
  };
}

const SESSION_TTL_SECONDS = 24 * 60 * 60;

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value);
}

function sessionKey(scope: E2BSessionScope): string {
  if (scope.resource) {
    return [
      'e2b:session:v3',
      encodeKeyPart(scope.tenantId),
      encodeKeyPart(scope.userId),
      encodeKeyPart(scope.resource.kind),
      encodeKeyPart(scope.resource.id),
    ].join(':');
  }
  return [
    'e2b:session:v2',
    encodeKeyPart(scope.tenantId),
    encodeKeyPart(scope.userId),
    encodeKeyPart(scope.conversationId ?? ''),
  ].join(':');
}

function scopeLog(scope: E2BSessionScope): Record<string, string | undefined> {
  return {
    tenantId: scope.tenantId,
    userId: scope.userId,
    conversationId: scope.conversationId,
    resourceKind: scope.resource?.kind,
    resourceId: scope.resource?.id,
  };
}

export async function getE2BSession(scope: E2BSessionScope): Promise<E2BSession | null> {
  if (!redis) return null;
  try {
    const value = await redis.get<E2BSession>(sessionKey(scope));
    return value ?? null;
  } catch (err) {
    logger.warn(
      { err, ...scopeLog(scope) },
      '[e2b] session-store get failed; treating as no session',
    );
    return null;
  }
}

export async function saveE2BSession(scope: E2BSessionScope, session: E2BSession): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(sessionKey(scope), session, { ex: SESSION_TTL_SECONDS });
  } catch (err) {
    logger.warn({ err, ...scopeLog(scope) }, '[e2b] session-store save failed');
  }
}

export async function deleteE2BSession(scope: E2BSessionScope): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(sessionKey(scope));
  } catch (err) {
    logger.warn({ err, ...scopeLog(scope) }, '[e2b] session-store delete failed');
  }
}

export interface E2BCachePurgeResult {
  deleted: number;
  failed: number;
  reachable: boolean;
}

const GLOB_METACHARACTERS = /[*?[\]\\^]/u;
const SCAN_PAGE = 500;

function userScopedKeyPatterns(owner: string): string[] {
  return [
    `e2b:session:v2:*:${owner}:*`,
    `e2b:session:v3:*:${owner}:*`,
    `e2b:create-lock:v1:*:${owner}`,
  ];
}

export async function deleteE2BSessionsForUser(userId: string): Promise<E2BCachePurgeResult> {
  if (!redis) return { deleted: 0, failed: 0, reachable: false };

  const owner = encodeKeyPart(userId);
  if (GLOB_METACHARACTERS.test(owner)) {
    logger.error(
      { userId },
      '[e2b] refusing to purge sandbox cache: the owner id would widen the match pattern',
    );
    return { deleted: 0, failed: userScopedKeyPatterns(owner).length, reachable: true };
  }

  let deleted = 0;
  let failed = 0;
  for (const match of userScopedKeyPatterns(owner)) {
    let cursor = '0';
    try {
      do {
        const [next, keys] = await redis.scan(cursor, { match, count: SCAN_PAGE });
        cursor = String(next);
        if (keys.length > 0) {
          await redis.del(...keys);
          deleted += keys.length;
        }
      } while (cursor !== '0');
    } catch (err) {
      failed += 1;
      logger.error({ err, userId, match }, '[e2b] sandbox cache purge failed for a key pattern');
    }
  }

  return { deleted, failed, reachable: true };
}

const SANDBOX_LOCK_TTL_MS = 30_000;
const SANDBOX_LOCK_WAIT_MS = 10_000;
const SANDBOX_LOCK_POLL_MS = 100;

function sandboxLockKey(tenantId: string, userId: string): string {
  return ['e2b:create-lock:v1', encodeKeyPart(tenantId), encodeKeyPart(userId)].join(':');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withUserSandboxLock<T>(
  scope: Pick<E2BSessionScope, 'tenantId' | 'userId'>,
  critical: () => Promise<T>,
): Promise<{ locked: boolean; result?: T }> {
  if (!redis) return { locked: true, result: await critical() };

  const key = sandboxLockKey(scope.tenantId, scope.userId);
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + SANDBOX_LOCK_WAIT_MS;

  let held = false;
  try {
    while (Date.now() < deadline) {
      const acquired = await redis.set(key, token, { nx: true, px: SANDBOX_LOCK_TTL_MS });
      if (acquired) {
        held = true;
        break;
      }
      await sleep(SANDBOX_LOCK_POLL_MS);
    }
  } catch (err) {
    logger.warn({ err, userId: scope.userId }, '[e2b] sandbox lock unavailable; proceeding');
    return { locked: true, result: await critical() };
  }

  if (!held) {
    logger.warn(
      { userId: scope.userId },
      '[e2b] sandbox create lock not acquired within the wait budget',
    );
    return { locked: false };
  }

  try {
    return { locked: true, result: await critical() };
  } finally {
    try {
      const current = await redis.get<string>(key);
      if (current === token) await redis.del(key);
    } catch (err) {
      logger.warn({ err, userId: scope.userId }, '[e2b] sandbox lock release failed');
    }
  }
}
