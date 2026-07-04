/**
 * Conversation-scoped E2B sandbox session store.
 *
 * Maps `conversationId -> { sandboxId, contexts }` so a paused-and-resumed sandbox (and
 * its per-language code contexts) can be found again on the NEXT request in the same
 * conversation, even though each request is its own serverless invocation with no shared
 * process memory (same class of problem as `lib/rate-limit.ts`'s per-instance-memory
 * warning). Backed by Upstash Redis (already provisioned for rate limiting).
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

/** Key TTL: generous upper bound on how long a paused sandbox mapping stays resumable. */
const SESSION_TTL_SECONDS = 24 * 60 * 60;

function sessionKey(conversationId: string): string {
  return `e2b:session:${conversationId}`;
}

export async function getE2BSession(conversationId: string): Promise<E2BSession | null> {
  if (!redis) return null;
  try {
    const value = await redis.get<E2BSession>(sessionKey(conversationId));
    return value ?? null;
  } catch (err) {
    logger.warn({ err, conversationId }, '[e2b] session-store get failed; treating as no session');
    return null;
  }
}

export async function saveE2BSession(conversationId: string, session: E2BSession): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(sessionKey(conversationId), session, { ex: SESSION_TTL_SECONDS });
  } catch (err) {
    logger.warn({ err, conversationId }, '[e2b] session-store save failed');
  }
}

export async function deleteE2BSession(conversationId: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(sessionKey(conversationId));
  } catch (err) {
    logger.warn({ err, conversationId }, '[e2b] session-store delete failed');
  }
}
