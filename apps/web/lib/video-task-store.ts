/**
 * Video task ownership store.
 *
 * Maps `task_id -> userId` with a 6-hour TTL so the status endpoint can prove
 * the polling user is the one who created the task. Provider-side task ids are
 * guessable enough that this is a real authorization boundary, not a cache.
 *
 * Backed by Upstash Redis (already provisioned for rate limiting and the E2B
 * session store), with the previous in-process Map kept as a same-instance
 * layer. That combination is what makes this correct under horizontal scaling:
 * a poll that lands on a different serverless instance than the one that
 * created the task now resolves through Redis instead of 403-ing the legitimate
 * owner.
 *
 * FAIL-CLOSED, unlike `lib/e2b/session-store.ts` which this otherwise mirrors:
 * if neither layer can produce an owner — unconfigured Redis, lookup error,
 * expired entry — the caller must deny. Never fall back to "no record, allow".
 */
import 'server-only';

import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';

// Prefer Vercel's managed KV-integration names, falling back to native UPSTASH_*
// (matches lib/rate-limit.ts and lib/e2b/session-store.ts). `||` so an empty
// KV_* still falls through.
const redisRestUrl = process.env['KV_REST_API_URL'] || process.env['UPSTASH_REDIS_REST_URL'];
const redisRestToken = process.env['KV_REST_API_TOKEN'] || process.env['UPSTASH_REDIS_REST_TOKEN'];
const hasRedisEnv = !!redisRestUrl && !!redisRestToken;

const redis = hasRedisEnv ? new Redis({ url: redisRestUrl!, token: redisRestToken! }) : null;

const TTL_SECONDS = 6 * 60 * 60; // 6 hours
const TTL_MS = TTL_SECONDS * 1000;

export interface VideoTaskRecord {
  userId: string;
  /**
   * Catalog model id the task was submitted with. The status endpoint needs it
   * to emit the EU AI Act Article 50(2) marker on the finished video, and the
   * provider's status payload never echoes it back.
   */
  model?: string;
}

interface TaskEntry extends VideoTaskRecord {
  expiresAt: number;
}

/**
 * Same-instance layer. Retained so local development and single-instance
 * deployments keep working with no Redis configured, and so a transient Redis
 * write failure does not lock the owner out of their own task on the instance
 * that created it.
 */
const localStore = new Map<string, TaskEntry>();

function taskKey(taskId: string): string {
  return `video-task-owner:${taskId}`;
}

function pruneLocal(now: number): void {
  for (const [key, entry] of localStore.entries()) {
    if (entry.expiresAt < now) localStore.delete(key);
  }
}

/** Record `taskId -> {userId, model}` for TTL, in Redis and in-process. */
export async function storeVideoTask(
  taskId: string,
  userId: string,
  model?: string,
): Promise<void> {
  const now = Date.now();
  pruneLocal(now);
  localStore.set(taskId, { userId, ...(model ? { model } : {}), expiresAt: now + TTL_MS });

  if (!redis) return;
  try {
    await redis.set(taskKey(taskId), { userId, ...(model ? { model } : {}) }, { ex: TTL_SECONDS });
  } catch (err) {
    // The task exists provider-side and the same-instance layer still holds it,
    // but a poll landing elsewhere will now be denied. Loud, because the user
    // has already been billed for the generation at this point.
    logger.error(
      { err, taskId, userId },
      '[video-task-store] failed to persist task ownership; cross-instance polling will be denied',
    );
  }
}

/**
 * Resolve the record for `taskId`, or `undefined` when ownership cannot be
 * proven. Callers must treat `undefined` as "deny".
 */
export async function getVideoTask(taskId: string): Promise<VideoTaskRecord | undefined> {
  const local = localStore.get(taskId);
  if (local) {
    if (local.expiresAt >= Date.now()) {
      return { userId: local.userId, ...(local.model ? { model: local.model } : {}) };
    }
    localStore.delete(taskId);
  }

  if (!redis) return undefined;
  try {
    const stored = await redis.get<VideoTaskRecord | string>(taskKey(taskId));
    if (!stored) return undefined;
    // Entries written before the model was recorded are a bare userId string.
    // They stay valid for authorization; they just carry no model.
    if (typeof stored === 'string') return { userId: stored };
    return stored.userId ? stored : undefined;
  } catch (err) {
    logger.warn(
      { err, taskId },
      '[video-task-store] ownership lookup failed; denying (fail-closed)',
    );
    return undefined;
  }
}
