import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

import type {
  KeyValueBatch,
  KeyValueHashFields,
  KeyValueScanOptions,
  KeyValueScanPage,
  KeyValueSetOptions,
  KeyValueSortedEntry,
  KeyValueStore,
  RateLimiter,
  RateLimitVerdict,
  RateLimitWindow,
} from '../types';

export const UPSTASH_REST_URL_ENV_NAMES = ['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL'] as const;
export const UPSTASH_REST_TOKEN_ENV_NAMES = [
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

/**
 * One retry, not the client's default of five.
 *
 * Callers race their commands against a request-path budget and then decide
 * fail-open or fail-closed. The SDK default retries five times over about
 * 4.3 seconds, so during an outage every call outlived the race and burned four
 * more requests against a dead endpoint after the decision was already made.
 */
const UPSTASH_RETRIES = 1;

const POSITIVE_SCORE_BOUND = '+inf';
const NEGATIVE_SCORE_BOUND = '-inf';
const SINGLE_INCREMENT = 1;
const DELETED_NONE = 0;

interface UpstashSetOptions {
  ex?: number;
  px?: number;
  nx?: true;
}

type UpstashScoreBound = number | typeof POSITIVE_SCORE_BOUND | typeof NEGATIVE_SCORE_BOUND;

interface UpstashPipelineLike {
  get(key: string): unknown;
  set(key: string, value: unknown, options?: UpstashSetOptions): unknown;
  incr(key: string): unknown;
  incrby(key: string, amount: number): unknown;
  expire(key: string, ttlSeconds: number): unknown;
  pexpire(key: string, ttlMilliseconds: number): unknown;
  pexpireat(key: string, epochMilliseconds: number): unknown;
  hset(key: string, fields: KeyValueHashFields): unknown;
  hgetall(key: string): unknown;
  zadd(key: string, entry: KeyValueSortedEntry): unknown;
  zremrangebyscore(key: string, minScore: UpstashScoreBound, maxScore: UpstashScoreBound): unknown;
  zrange(
    key: string,
    minScore: UpstashScoreBound,
    maxScore: UpstashScoreBound,
    options: { byScore: true },
  ): unknown;
  exec(): Promise<unknown[]>;
}

/**
 * The subset of the Upstash client this adapter uses. Declared structurally so
 * a test can hand the adapter a double without dragging the SDK's overloads in.
 */
export interface UpstashRedisLike {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: UpstashSetOptions): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  incrby(key: string, amount: number): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<unknown>;
  hset(key: string, fields: KeyValueHashFields): Promise<unknown>;
  hgetall<T>(key: string): Promise<T | null>;
  sadd(key: string, member: string): Promise<unknown>;
  srem(key: string, member: string): Promise<unknown>;
  scard(key: string): Promise<number>;
  zadd(key: string, entry: KeyValueSortedEntry): Promise<unknown>;
  zrem(key: string, member: string): Promise<unknown>;
  zremrangebyscore(
    key: string,
    minScore: UpstashScoreBound,
    maxScore: UpstashScoreBound,
  ): Promise<unknown>;
  zcard(key: string): Promise<number>;
  scan(cursor: string, options: KeyValueScanOptions): Promise<[string | number, string[]]>;
  pipeline(): UpstashPipelineLike;
}

export interface UpstashCredentials {
  url: string;
  token: string;
}

function readEnv(name: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export function readUpstashCredentials(): UpstashCredentials | null {
  const url = UPSTASH_REST_URL_ENV_NAMES.map(readEnv).find(Boolean);
  const token = UPSTASH_REST_TOKEN_ENV_NAMES.map(readEnv).find(Boolean);
  return url && token ? { url, token } : null;
}

export function createUpstashRedisClient(credentials: UpstashCredentials): UpstashRedisLike {
  return new Redis({
    url: credentials.url,
    token: credentials.token,
    retry: { retries: UPSTASH_RETRIES },
  }) as unknown as UpstashRedisLike;
}

function scoreBound(score: number): UpstashScoreBound {
  if (score === Number.POSITIVE_INFINITY) return POSITIVE_SCORE_BOUND;
  if (score === Number.NEGATIVE_INFINITY) return NEGATIVE_SCORE_BOUND;
  return score;
}

function setOptions(options: KeyValueSetOptions | undefined): UpstashSetOptions | undefined {
  if (!options) return undefined;
  const translated: UpstashSetOptions = {};
  if (options.ttlSeconds !== undefined) translated.ex = options.ttlSeconds;
  if (options.ttlMilliseconds !== undefined) translated.px = options.ttlMilliseconds;
  if (options.onlyIfAbsent) translated.nx = true;
  return Object.keys(translated).length > DELETED_NONE ? translated : undefined;
}

class UpstashKeyValueStore implements KeyValueStore {
  constructor(private readonly client: UpstashRedisLike) {}

  get<T>(key: string): Promise<T | null> {
    return this.client.get<T>(key);
  }

  async set(key: string, value: unknown, options?: KeyValueSetOptions): Promise<boolean> {
    const translated = setOptions(options);
    const result = translated
      ? await this.client.set(key, value, translated)
      : await this.client.set(key, value);
    return options?.onlyIfAbsent ? Boolean(result) : true;
  }

  delete(...keys: string[]): Promise<number> {
    return keys.length === DELETED_NONE ? Promise.resolve(DELETED_NONE) : this.client.del(...keys);
  }

  increment(key: string, amount: number = SINGLE_INCREMENT): Promise<number> {
    return amount === SINGLE_INCREMENT ? this.client.incr(key) : this.client.incrby(key, amount);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  async hashSet(key: string, fields: KeyValueHashFields): Promise<void> {
    await this.client.hset(key, fields);
  }

  hashGetAll<T>(key: string): Promise<T | null> {
    return this.client.hgetall<T>(key);
  }

  async setAdd(key: string, member: string): Promise<void> {
    await this.client.sadd(key, member);
  }

  async setRemove(key: string, member: string): Promise<void> {
    await this.client.srem(key, member);
  }

  setSize(key: string): Promise<number> {
    return this.client.scard(key);
  }

  async sortedAdd(key: string, entry: KeyValueSortedEntry): Promise<void> {
    await this.client.zadd(key, entry);
  }

  async sortedRemove(key: string, member: string): Promise<void> {
    await this.client.zrem(key, member);
  }

  async sortedRemoveByScore(key: string, minScore: number, maxScore: number): Promise<void> {
    await this.client.zremrangebyscore(key, scoreBound(minScore), scoreBound(maxScore));
  }

  sortedSize(key: string): Promise<number> {
    return this.client.zcard(key);
  }

  async scan(cursor: string, options: KeyValueScanOptions): Promise<KeyValueScanPage> {
    const [next, keys] = await this.client.scan(cursor, options);
    return { cursor: String(next), keys };
  }

  batch(): KeyValueBatch {
    const pipeline = this.client.pipeline();
    const batch: KeyValueBatch = {
      get: (key) => {
        pipeline.get(key);
        return batch;
      },
      set: (key, value, options) => {
        const translated = setOptions(options);
        if (translated) pipeline.set(key, value, translated);
        else pipeline.set(key, value);
        return batch;
      },
      increment: (key, amount = SINGLE_INCREMENT) => {
        if (amount === SINGLE_INCREMENT) pipeline.incr(key);
        else pipeline.incrby(key, amount);
        return batch;
      },
      expire: (key, ttlSeconds) => {
        pipeline.expire(key, ttlSeconds);
        return batch;
      },
      expireIn: (key, ttlMilliseconds) => {
        pipeline.pexpire(key, ttlMilliseconds);
        return batch;
      },
      expireAt: (key, epochMilliseconds) => {
        pipeline.pexpireat(key, epochMilliseconds);
        return batch;
      },
      hashSet: (key, fields) => {
        pipeline.hset(key, fields);
        return batch;
      },
      hashGetAll: (key) => {
        pipeline.hgetall(key);
        return batch;
      },
      sortedAdd: (key, entry) => {
        pipeline.zadd(key, entry);
        return batch;
      },
      sortedRemoveByScore: (key, minScore, maxScore) => {
        pipeline.zremrangebyscore(key, scoreBound(minScore), scoreBound(maxScore));
        return batch;
      },
      sortedRangeByScore: (key, minScore, maxScore) => {
        pipeline.zrange(key, scoreBound(minScore), scoreBound(maxScore), { byScore: true });
        return batch;
      },
      exec: () => pipeline.exec(),
    };
    return batch;
  }
}

export function createUpstashKeyValueStore(client: UpstashRedisLike): KeyValueStore {
  return new UpstashKeyValueStore(client);
}

class UpstashRateLimiter implements RateLimiter {
  private readonly limiters = new Map<string, Ratelimit>();

  constructor(private readonly client: UpstashRedisLike) {}

  private limiterFor(namespace: string, window: RateLimitWindow): Ratelimit {
    const cacheKey = `${namespace}:${window.limit}:${window.window}`;
    const cached = this.limiters.get(cacheKey);
    if (cached) return cached;

    const limiter = new Ratelimit({
      redis: this.client as unknown as ConstructorParameters<typeof Ratelimit>[0]['redis'],
      limiter: Ratelimit.slidingWindow(
        window.limit,
        window.window as Parameters<typeof Ratelimit.slidingWindow>[1],
      ),
      // Off deliberately. Nothing in this repo reads the analytics tables, and
      // ingest is a second command per check that ZINCRBYs one member per
      // distinct identifier per hour bucket with no EXPIRE and no trim anywhere
      // in the path, the `retention` option is read-side only. That is unbounded
      // storage growth keyed on cumulative distinct users, and when the database
      // reaches its size ceiling the writes fail and every fail-closed key
      // refuses every user on their first request of the day.
      analytics: false,
      prefix: namespace,
    });
    this.limiters.set(cacheKey, limiter);
    return limiter;
  }

  async limit(
    namespace: string,
    identifier: string,
    window: RateLimitWindow,
  ): Promise<RateLimitVerdict> {
    const { success, limit, remaining, reset } = await this.limiterFor(namespace, window).limit(
      identifier,
    );
    return { success, limit, remaining, resetAtMs: reset };
  }
}

export function createUpstashRateLimiter(client: UpstashRedisLike): RateLimiter {
  return new UpstashRateLimiter(client);
}
