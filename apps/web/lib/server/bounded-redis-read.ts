import 'server-only';

import { logger } from '@/lib/logger';

export const REDIS_REQUEST_PATH_READ_TIMEOUT_ENV = 'AGI_REQUEST_PATH_REDIS_READ_TIMEOUT_MS';

const DEFAULT_REQUEST_PATH_READ_TIMEOUT_MS = 250;
const MIN_REQUEST_PATH_READ_TIMEOUT_MS = 1;

export function resolveRequestPathRedisReadTimeoutMs(): number {
  const configured = process.env[REDIS_REQUEST_PATH_READ_TIMEOUT_ENV]?.trim();
  if (!configured) return DEFAULT_REQUEST_PATH_READ_TIMEOUT_MS;

  const budgetMs = Number(configured);
  if (!Number.isInteger(budgetMs) || budgetMs < MIN_REQUEST_PATH_READ_TIMEOUT_MS) {
    logger.error(
      { [REDIS_REQUEST_PATH_READ_TIMEOUT_ENV]: configured },
      '[bounded-redis-read] unrecognised read budget; using the default',
    );
    return DEFAULT_REQUEST_PATH_READ_TIMEOUT_MS;
  }

  return budgetMs;
}

export const REDIS_READ_ABANDONED = Symbol('redis read abandoned');

export type BoundedRedisRead<T> = T | typeof REDIS_READ_ABANDONED;

export function wasRedisReadAbandoned<T>(
  result: BoundedRedisRead<T>,
): result is typeof REDIS_READ_ABANDONED {
  return result === REDIS_READ_ABANDONED;
}

/**
 * Only apply this where the caller's "Redis said nothing" branch is already
 * correct: an abandoned read returns that branch's answer, so a caller that
 * needs the value is wrong rather than slow.
 */
export async function readRedisWithinBudget<T>(
  read: Promise<T>,
  budgetMs: number = resolveRequestPathRedisReadTimeoutMs(),
): Promise<BoundedRedisRead<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abandoned = new Promise<typeof REDIS_READ_ABANDONED>((resolve) => {
    timer = setTimeout(() => resolve(REDIS_READ_ABANDONED), budgetMs);
  });
  try {
    return await Promise.race([read, abandoned]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
