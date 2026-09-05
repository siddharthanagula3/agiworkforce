import type {
  KeyValueBatch,
  KeyValueHashFields,
  KeyValueScanOptions,
  KeyValueScanPage,
  KeyValueSetOptions,
  KeyValueSortedEntry,
  KeyValueStore,
} from '../types';

const POSITIVE_SCORE_BOUND = '+inf';
const NEGATIVE_SCORE_BOUND = '-inf';
const SET_OK = 'OK';
const EMPTY_COUNT = 0;
const SINGLE_INCREMENT = 1;
const SCAN_MATCH_ARGUMENT = 'MATCH';
const SCAN_COUNT_ARGUMENT = 'COUNT';
const SET_EXPIRE_SECONDS_ARGUMENT = 'EX';
const SET_EXPIRE_MILLISECONDS_ARGUMENT = 'PX';
const SET_IF_ABSENT_ARGUMENT = 'NX';
const IOREDIS_MODULE = 'ioredis';

const PIPELINE_ERROR_INDEX = 0;
const PIPELINE_RESULT_INDEX = 1;

type RedisPipelineReply = Array<[Error | null, unknown]> | null;

interface RedisPipelineLike {
  exec(): Promise<RedisPipelineReply>;
  [command: string]: unknown;
}

/**
 * The node-Redis command surface this adapter drives. Kept structural so the
 * client module stays a lazy import: a deployment that never selects the local
 * Redis provider never loads it.
 */
export interface NodeRedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: Array<string | number>): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  incrby(key: string, amount: number): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<number>;
  hset(key: string, fields: Record<string, string>): Promise<number>;
  hgetall(key: string): Promise<Record<string, string>>;
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  scard(key: string): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<unknown>;
  zrem(key: string, member: string): Promise<number>;
  zremrangebyscore(
    key: string,
    minScore: number | string,
    maxScore: number | string,
  ): Promise<number>;
  zcard(key: string): Promise<number>;
  scan(cursor: string, ...args: Array<string | number>): Promise<[string, string[]]>;
  pipeline(): RedisPipelineLike;
}

export type NodeRedisConnect = () => Promise<NodeRedisLike>;

function scoreBound(score: number): number | string {
  if (score === Number.POSITIVE_INFINITY) return POSITIVE_SCORE_BOUND;
  if (score === Number.NEGATIVE_INFINITY) return NEGATIVE_SCORE_BOUND;
  return score;
}

function encode(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Mirrors what the Upstash REST client does on the way back: a stored document
 * comes back decoded, and a value that is not JSON comes back as the raw
 * string, which is the shape existing readers already branch on.
 */
function decode<T>(raw: string | null): T | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

function setArguments(options: KeyValueSetOptions | undefined): Array<string | number> {
  const args: Array<string | number> = [];
  if (options?.ttlSeconds !== undefined) {
    args.push(SET_EXPIRE_SECONDS_ARGUMENT, options.ttlSeconds);
  }
  if (options?.ttlMilliseconds !== undefined) {
    args.push(SET_EXPIRE_MILLISECONDS_ARGUMENT, options.ttlMilliseconds);
  }
  if (options?.onlyIfAbsent) args.push(SET_IF_ABSENT_ARGUMENT);
  return args;
}

function hashArguments(fields: KeyValueHashFields): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, String(value)]));
}

class NodeRedisKeyValueStore implements KeyValueStore {
  private connection: Promise<NodeRedisLike> | null = null;

  constructor(private readonly connect: NodeRedisConnect) {}

  private client(): Promise<NodeRedisLike> {
    this.connection ??= this.connect();
    return this.connection;
  }

  async get<T>(key: string): Promise<T | null> {
    return decode<T>(await (await this.client()).get(key));
  }

  async set(key: string, value: unknown, options?: KeyValueSetOptions): Promise<boolean> {
    const reply = await (await this.client()).set(key, encode(value), ...setArguments(options));
    return options?.onlyIfAbsent ? reply === SET_OK : true;
  }

  async delete(...keys: string[]): Promise<number> {
    if (keys.length === EMPTY_COUNT) return EMPTY_COUNT;
    return (await this.client()).del(...keys);
  }

  async increment(key: string, amount: number = SINGLE_INCREMENT): Promise<number> {
    return (await this.client()).incrby(key, amount);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await (await this.client()).expire(key, ttlSeconds);
  }

  async hashSet(key: string, fields: KeyValueHashFields): Promise<void> {
    await (await this.client()).hset(key, hashArguments(fields));
  }

  async hashGetAll<T>(key: string): Promise<T | null> {
    const record = await (await this.client()).hgetall(key);
    return Object.keys(record).length === EMPTY_COUNT ? null : (record as unknown as T);
  }

  async setAdd(key: string, member: string): Promise<void> {
    await (await this.client()).sadd(key, member);
  }

  async setRemove(key: string, member: string): Promise<void> {
    await (await this.client()).srem(key, member);
  }

  async setSize(key: string): Promise<number> {
    return (await this.client()).scard(key);
  }

  async sortedAdd(key: string, entry: KeyValueSortedEntry): Promise<void> {
    await (await this.client()).zadd(key, entry.score, entry.member);
  }

  async sortedRemove(key: string, member: string): Promise<void> {
    await (await this.client()).zrem(key, member);
  }

  async sortedRemoveByScore(key: string, minScore: number, maxScore: number): Promise<void> {
    await (await this.client()).zremrangebyscore(key, scoreBound(minScore), scoreBound(maxScore));
  }

  async sortedSize(key: string): Promise<number> {
    return (await this.client()).zcard(key);
  }

  async scan(cursor: string, options: KeyValueScanOptions): Promise<KeyValueScanPage> {
    const [next, keys] = await (
      await this.client()
    ).scan(cursor, SCAN_MATCH_ARGUMENT, options.match, SCAN_COUNT_ARGUMENT, options.count);
    return { cursor: next, keys };
  }

  batch(): KeyValueBatch {
    const queued: Array<(pipeline: RedisPipelineLike) => void> = [];
    const queue = (command: string, args: Array<string | number>): void => {
      queued.push((pipeline) => {
        (pipeline[command] as (...values: Array<string | number>) => unknown)(...args);
      });
    };

    const batch: KeyValueBatch = {
      get: (key) => {
        queue('get', [key]);
        return batch;
      },
      set: (key, value, options) => {
        queue('set', [key, encode(value), ...setArguments(options)]);
        return batch;
      },
      increment: (key, amount = SINGLE_INCREMENT) => {
        queue('incrby', [key, amount]);
        return batch;
      },
      expire: (key, ttlSeconds) => {
        queue('expire', [key, ttlSeconds]);
        return batch;
      },
      expireIn: (key, ttlMilliseconds) => {
        queue('pexpire', [key, ttlMilliseconds]);
        return batch;
      },
      expireAt: (key, epochMilliseconds) => {
        queue('pexpireat', [key, epochMilliseconds]);
        return batch;
      },
      hashSet: (key, fields) => {
        queued.push((pipeline) => {
          (pipeline['hset'] as (target: string, values: Record<string, string>) => unknown)(
            key,
            hashArguments(fields),
          );
        });
        return batch;
      },
      hashGetAll: (key) => {
        queue('hgetall', [key]);
        return batch;
      },
      sortedAdd: (key, entry) => {
        queue('zadd', [key, entry.score, entry.member]);
        return batch;
      },
      sortedRemoveByScore: (key, minScore, maxScore) => {
        queue('zremrangebyscore', [key, scoreBound(minScore), scoreBound(maxScore)]);
        return batch;
      },
      sortedRangeByScore: (key, minScore, maxScore) => {
        queue('zrangebyscore', [key, scoreBound(minScore), scoreBound(maxScore)]);
        return batch;
      },
      exec: async () => {
        const pipeline = (await this.client()).pipeline();
        for (const apply of queued) apply(pipeline);
        const replies = await pipeline.exec();
        return (replies ?? []).map((reply) => {
          if (reply[PIPELINE_ERROR_INDEX]) return null;
          const value = reply[PIPELINE_RESULT_INDEX];
          return typeof value === 'string' ? decode(value) : value;
        });
      },
    };
    return batch;
  }
}

export function createNodeRedisKeyValueStore(connect: NodeRedisConnect): KeyValueStore {
  return new NodeRedisKeyValueStore(connect);
}

export function connectToLocalRedis(url: string): NodeRedisConnect {
  return async () => {
    const module = (await import(IOREDIS_MODULE)) as {
      default: new (connectionUrl: string) => NodeRedisLike;
    };
    return new module.default(url);
  };
}
