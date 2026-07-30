/**
 * Tenant/user/conversation-scoped E2B sandbox session store.
 *
 * Maps `{ tenantId, userId, conversationId } -> { sandboxId, contexts }` so a
 * paused-and-resumed sandbox (and its per-language code contexts) can be found again on
 * the NEXT request by the same authenticated owner. Conversation ids are not globally
 * trusted authorization tokens, so they must never be sufficient to resume or delete a
 * sandbox. Backed by Upstash Redis (already provisioned for rate limiting).
 *
 * FAIL-OPEN by design (not a security boundary): if Redis is unconfigured (local dev) or
 * a lookup/write errors, callers treat it as "no prior session" and fall back to creating
 * a fresh sandbox. Worst case is losing cross-turn state / paying for a redundant sandbox
 * create, never a security or correctness violation.
 */
import 'server-only';

import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';
import type { CloudCodeNetworkAccess } from '@agiworkforce/types';

// Prefer Vercel's managed KV-integration names, falling back to native UPSTASH_*
// (matches lib/rate-limit.ts). `||` so an empty KV_* still falls through.
const redisRestUrl = process.env['KV_REST_API_URL'] || process.env['UPSTASH_REDIS_REST_URL'];
const redisRestToken = process.env['KV_REST_API_TOKEN'] || process.env['UPSTASH_REDIS_REST_TOKEN'];
const hasRedisEnv = !!redisRestUrl && !!redisRestToken;

const redis = hasRedisEnv ? new Redis({ url: redisRestUrl!, token: redisRestToken! }) : null;

/** A previously created E2B code context, cached so it can be reused across calls/turns. */
export interface StoredContext {
  id: string;
  language: string;
  cwd: string;
}

export interface E2BSession {
  sandboxId: string;
  /** Cached code contexts keyed by (mapped) language, e.g. "python" | "javascript". */
  contexts: Record<string, StoredContext>;
  /**
   * GOV-5: epoch ms at which the CURRENT billable interval began (sandbox
   * created or resumed). Cleared when the sandbox is paused/killed and the
   * interval has been metered, so a resumed sandbox opens a fresh interval and
   * no interval is ever billed twice.
   */
  activeSinceMs?: number;
  /** Egress policy applied to a managed Code sandbox. */
  networkAccess?: CloudCodeNetworkAccess;
}

export interface E2BSessionScope {
  /** Trust-boundary namespace. Managed Web/Mobile/Desktop cloud uses this value. */
  tenantId: string;
  /** Authenticated Clerk principal that owns the resource. */
  userId: string;
  /** Owned web_conversations.id, validated before the sandbox path is reached. */
  conversationId?: string;
  /** Non-conversation managed resource. Currently used by the Web Code surface. */
  resource?: {
    kind: 'code_session';
    id: string;
  };
  /** Requested managed Code egress policy. Ignored for chat conversations. */
  networkAccess?: CloudCodeNetworkAccess;
  /**
   * GOV-4: the owner's billing plan, when the caller already knows it. Optional
   * so existing call sites keep compiling; `runtime.ts` resolves the tier from
   * the subscription when it is absent, and FAILS CLOSED if it cannot.
   */
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

/** Key TTL: generous upper bound on how long a paused sandbox mapping stays resumable. */
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

/* ────────────────────────────────────────────────────────────────────────────
 * GOV-24: serialize a user's sandbox-creation critical section.
 *
 * `runtime.ts` counted a user's live sandboxes and then created one with
 * NOTHING serialising the check, so two concurrent requests both observed 4
 * against a cap of 5 and both created — the cap was advisory under exactly the
 * concurrency it exists to stop. This short-lived Redis lock makes
 * count-then-create atomic per user.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Upper bound on how long one create critical section may hold the lock. */
const SANDBOX_LOCK_TTL_MS = 30_000;
/** Total time a waiter will spend trying to acquire before giving up. */
const SANDBOX_LOCK_WAIT_MS = 10_000;
const SANDBOX_LOCK_POLL_MS = 100;

function sandboxLockKey(tenantId: string, userId: string): string {
  return ['e2b:create-lock:v1', encodeKeyPart(tenantId), encodeKeyPart(userId)].join(':');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `critical` while holding this user's sandbox-creation lock.
 *
 * Returns `{ locked: false }` WITHOUT running `critical` when the lock could
 * not be taken within `SANDBOX_LOCK_WAIT_MS`; the caller decides whether that
 * is a denial. When Redis is unconfigured (local dev) the section runs
 * unserialised — same posture as the rest of this store, which is explicitly
 * not a security boundary.
 */
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
    // A lock-store failure must not be more disruptive than the unserialised
    // behaviour it replaces: run the section and let the team cap backstop.
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
      // Only release OUR lock: a section that overran the TTL must not delete
      // the lock a different request has since taken.
      const current = await redis.get<string>(key);
      if (current === token) await redis.del(key);
    } catch (err) {
      logger.warn({ err, userId: scope.userId }, '[e2b] sandbox lock release failed');
    }
  }
}
