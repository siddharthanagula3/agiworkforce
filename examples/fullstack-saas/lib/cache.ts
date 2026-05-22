import 'server-only';
import { getRedis } from '@/lib/redis';

export async function getJsonCache<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  const value = await redis.get(`cache:${key}`);
  return value ? (JSON.parse(value) as T) : null;
}

export async function setJsonCache<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(`cache:${key}`, JSON.stringify(value), 'EX', ttlSeconds);
}

export async function invalidateCache(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(`cache:${key}`);
}
