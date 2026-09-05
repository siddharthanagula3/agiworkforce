export type {
  KeyValueBatch,
  KeyValueHashFields,
  KeyValueProvider,
  KeyValueScanOptions,
  KeyValueScanPage,
  KeyValueSetOptions,
  KeyValueSortedEntry,
  KeyValueStore,
  RateLimiter,
  RateLimitVerdict,
  RateLimitWindow,
} from './types';

export { KeyValueConfigError } from './types';

export {
  KEY_VALUE_PROVIDER_ENV,
  KEY_VALUE_REDIS_URL_ENV,
  resolveKeyValueRuntime,
  selectKeyValueProvider,
  type KeyValueRuntime,
  type ResolveKeyValueRuntimeOptions,
} from './factory';

export {
  createMemoryKeyValueStore,
  MemoryKeyValueStore,
  type MemoryKeyValueStoreOptions,
} from './adapters/memory';

export {
  createUpstashKeyValueStore,
  createUpstashRateLimiter,
  createUpstashRedisClient,
  readUpstashCredentials,
  UPSTASH_REST_TOKEN_ENV_NAMES,
  UPSTASH_REST_URL_ENV_NAMES,
  type UpstashCredentials,
  type UpstashRedisLike,
} from './adapters/upstash';

export {
  connectToLocalRedis,
  createNodeRedisKeyValueStore,
  type NodeRedisConnect,
  type NodeRedisLike,
} from './adapters/redis';

export {
  createSlidingWindowRateLimiter,
  type SlidingWindowRateLimiterOptions,
} from './sliding-window';

export { parseWindowMilliseconds } from './window';
