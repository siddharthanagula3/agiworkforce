import 'server-only';

import { logger } from '@/lib/logger';
import { getKeyValueStore } from '@/lib/server/key-value';
import type { CloudCodeNetworkAccess } from '@agiworkforce/types';

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
  extraHosts?: readonly string[];
  templateId?: string;
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
  /** E2B template id. Omitted means the SDK's default image. */
  templateId?: string | null;
  /**
   * A harness credential the caller supplied directly, bypassing managed
   * provider resolution. Wins over it when present.
   */
  explicitCredential?: { envVar: string; value: string } | null;
  /** Extra hostnames allowed on top of the networkAccess preset. */
  extraHosts?: readonly string[];
}

export const MANAGED_CLOUD_E2B_TENANT_ID = 'managed-cloud';

// Single source of truth for the scope-less chat sandbox's egress policy. It runs
// model-directed code that can act on untrusted content, so it gets the trusted
// package/source allowlist plus deny-all rather than the SDK's internet-open default.
export const CHAT_SANDBOX_NETWORK_ACCESS: CloudCodeNetworkAccess = 'trusted';

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
  templateId?: string | null,
  explicitCredential?: { envVar: string; value: string } | null,
  extraHosts?: readonly string[],
): E2BSessionScope {
  return {
    tenantId: MANAGED_CLOUD_E2B_TENANT_ID,
    userId,
    resource: { kind: 'code_session', id: codeSessionId },
    networkAccess,
    ...(planTier ? { planTier } : {}),
    ...(templateId ? { templateId } : {}),
    ...(explicitCredential ? { explicitCredential } : {}),
    ...(extraHosts && extraHosts.length > 0 ? { extraHosts } : {}),
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
  const store = getKeyValueStore();
  if (!store) return null;
  try {
    const value = await store.get<E2BSession>(sessionKey(scope));
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
  const store = getKeyValueStore();
  if (!store) return;
  try {
    await store.set(sessionKey(scope), session, { ttlSeconds: SESSION_TTL_SECONDS });
  } catch (err) {
    logger.warn({ err, ...scopeLog(scope) }, '[e2b] session-store save failed');
  }
}

export async function deleteE2BSession(scope: E2BSessionScope): Promise<void> {
  const store = getKeyValueStore();
  if (!store) return;
  try {
    await store.delete(sessionKey(scope));
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
const SCAN_START_CURSOR = '0';

function userScopedKeyPatterns(owner: string): string[] {
  return [
    `e2b:session:v2:*:${owner}:*`,
    `e2b:session:v3:*:${owner}:*`,
    `e2b:create-lock:v1:*:${owner}`,
  ];
}

export async function deleteE2BSessionsForUser(userId: string): Promise<E2BCachePurgeResult> {
  const store = getKeyValueStore();
  if (!store) return { deleted: 0, failed: 0, reachable: false };

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
    let cursor = SCAN_START_CURSOR;
    try {
      do {
        const page = await store.scan(cursor, { match, count: SCAN_PAGE });
        cursor = page.cursor;
        if (page.keys.length > 0) {
          await store.delete(...page.keys);
          deleted += page.keys.length;
        }
      } while (cursor !== SCAN_START_CURSOR);
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
  const store = getKeyValueStore();
  if (!store) return { locked: true, result: await critical() };

  const key = sandboxLockKey(scope.tenantId, scope.userId);
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + SANDBOX_LOCK_WAIT_MS;

  let held = false;
  try {
    while (Date.now() < deadline) {
      const acquired = await store.set(key, token, {
        onlyIfAbsent: true,
        ttlMilliseconds: SANDBOX_LOCK_TTL_MS,
      });
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
      const current = await store.get<string>(key);
      if (current === token) await store.delete(key);
    } catch (err) {
      logger.warn({ err, userId: scope.userId }, '[e2b] sandbox lock release failed');
    }
  }
}
