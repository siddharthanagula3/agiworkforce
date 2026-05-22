import 'server-only';
import { getRedis } from '@/lib/redis';

interface RateLimitInput {
  key: string;
  limit: number;
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

const memoryCounters = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const now = Date.now();
  const resetAt = now + input.windowSeconds * 1000;
  const redis = getRedis();

  if (!redis) {
    const current = memoryCounters.get(input.key);
    const next =
      !current || current.resetAt <= now
        ? { count: 1, resetAt }
        : { count: current.count + 1, resetAt: current.resetAt };
    memoryCounters.set(input.key, next);
    return {
      allowed: next.count <= input.limit,
      remaining: Math.max(0, input.limit - next.count),
      resetAt: next.resetAt,
    };
  }

  const redisKey = `rl:${input.key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.pexpire(redisKey, input.windowSeconds * 1000);
  }
  const ttl = await redis.pttl(redisKey);
  const calculatedResetAt = now + Math.max(ttl, 0);

  return {
    allowed: count <= input.limit,
    remaining: Math.max(0, input.limit - count),
    resetAt: calculatedResetAt,
  };
}
