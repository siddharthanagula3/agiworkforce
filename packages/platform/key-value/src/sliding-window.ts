import type { KeyValueStore, RateLimiter, RateLimitVerdict, RateLimitWindow } from './types';
import { parseWindowMilliseconds } from './window';

const MILLISECONDS_PER_SECOND = 1_000;
const NO_REMAINING = 0;
const KEY_SEPARATOR = ':';
const MEMBER_SEPARATOR = '-';
const NONCE_RADIX = 36;
const NONCE_START = 2;

function windowKey(namespace: string, identifier: string): string {
  return [namespace, identifier].join(KEY_SEPARATOR);
}

function member(nowMs: number): string {
  return [nowMs, Math.random().toString(NONCE_RADIX).slice(NONCE_START)].join(MEMBER_SEPARATOR);
}

export interface SlidingWindowRateLimiterOptions {
  now?: () => number;
}

/**
 * One sliding-window implementation over the KeyValue port, so the local Redis
 * lane and the single-process lane enforce the same shape of limit rather than
 * each inventing one. Production stays on the Upstash limiter, whose script is
 * atomic; this one trades that atomicity for portability and is exact enough
 * for a development deployment and for tests.
 */
class SlidingWindowRateLimiter implements RateLimiter {
  private readonly now: () => number;

  constructor(
    private readonly store: KeyValueStore,
    options: SlidingWindowRateLimiterOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  async limit(
    namespace: string,
    identifier: string,
    window: RateLimitWindow,
  ): Promise<RateLimitVerdict> {
    const windowMs = parseWindowMilliseconds(window.window);
    const nowMs = this.now();
    const key = windowKey(namespace, identifier);

    await this.store.sortedRemoveByScore(key, Number.NEGATIVE_INFINITY, nowMs - windowMs);
    const used = await this.store.sortedSize(key);

    if (used >= window.limit) {
      return {
        success: false,
        limit: window.limit,
        remaining: NO_REMAINING,
        resetAtMs: nowMs + windowMs,
      };
    }

    await this.store
      .batch()
      .sortedAdd(key, { score: nowMs, member: member(nowMs) })
      .expire(key, Math.ceil(windowMs / MILLISECONDS_PER_SECOND))
      .exec();

    return {
      success: true,
      limit: window.limit,
      remaining: window.limit - used - 1,
      resetAtMs: nowMs + windowMs,
    };
  }
}

export function createSlidingWindowRateLimiter(
  store: KeyValueStore,
  options: SlidingWindowRateLimiterOptions = {},
): RateLimiter {
  return new SlidingWindowRateLimiter(store, options);
}
