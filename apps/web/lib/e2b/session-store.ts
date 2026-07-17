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

const hasRedisEnv =
  !!process.env['UPSTASH_REDIS_REST_URL'] && !!process.env['UPSTASH_REDIS_REST_TOKEN'];

const redis = hasRedisEnv
  ? new Redis({
      url: process.env['UPSTASH_REDIS_REST_URL']!,
      token: process.env['UPSTASH_REDIS_REST_TOKEN']!,
    })
  : null;

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
}

export interface E2BSessionScope {
  /** Trust-boundary namespace. Managed Web/Mobile/Desktop cloud uses this value. */
  tenantId: string;
  /** Authenticated Clerk principal that owns the conversation. */
  userId: string;
  /** Owned web_conversations.id, validated before the sandbox path is reached. */
  conversationId: string;
}

export const MANAGED_CLOUD_E2B_TENANT_ID = 'managed-cloud';

export function managedCloudE2BSessionScope(
  userId: string,
  conversationId: string,
): E2BSessionScope {
  return { tenantId: MANAGED_CLOUD_E2B_TENANT_ID, userId, conversationId };
}

/** Key TTL: generous upper bound on how long a paused sandbox mapping stays resumable. */
const SESSION_TTL_SECONDS = 24 * 60 * 60;

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value);
}

function sessionKey(scope: E2BSessionScope): string {
  return [
    'e2b:session:v2',
    encodeKeyPart(scope.tenantId),
    encodeKeyPart(scope.userId),
    encodeKeyPart(scope.conversationId),
  ].join(':');
}

export async function getE2BSession(scope: E2BSessionScope): Promise<E2BSession | null> {
  if (!redis) return null;
  try {
    const value = await redis.get<E2BSession>(sessionKey(scope));
    return value ?? null;
  } catch (err) {
    logger.warn(
      { err, tenantId: scope.tenantId, userId: scope.userId, conversationId: scope.conversationId },
      '[e2b] session-store get failed; treating as no session',
    );
    return null;
  }
}

export async function saveE2BSession(
  scope: E2BSessionScope,
  session: E2BSession,
): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(sessionKey(scope), session, { ex: SESSION_TTL_SECONDS });
  } catch (err) {
    logger.warn(
      { err, tenantId: scope.tenantId, userId: scope.userId, conversationId: scope.conversationId },
      '[e2b] session-store save failed',
    );
  }
}

export async function deleteE2BSession(scope: E2BSessionScope): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(sessionKey(scope));
  } catch (err) {
    logger.warn(
      { err, tenantId: scope.tenantId, userId: scope.userId, conversationId: scope.conversationId },
      '[e2b] session-store delete failed',
    );
  }
}
