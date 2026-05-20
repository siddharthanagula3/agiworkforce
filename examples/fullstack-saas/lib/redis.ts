import 'server-only';
import Redis from 'ioredis';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

let redis: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (!env.redisUrl) return null;
  if (redis !== undefined) return redis;

  redis = new Redis(env.redisUrl, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: true,
    reconnectOnError(error) {
      return error.message.includes('READONLY');
    },
  });

  redis.on('error', (error) => {
    logger.warn({ error }, 'redis connection error');
  });

  return redis;
}
