import { createMemoryKeyValueStore, type MemoryKeyValueStoreOptions } from './adapters/memory';
import { connectToLocalRedis, createNodeRedisKeyValueStore } from './adapters/redis';
import {
  createUpstashKeyValueStore,
  createUpstashRateLimiter,
  createUpstashRedisClient,
  readUpstashCredentials,
  type UpstashRedisLike,
} from './adapters/upstash';
import { createSlidingWindowRateLimiter } from './sliding-window';
import {
  KeyValueConfigError,
  type KeyValueProvider,
  type KeyValueStore,
  type RateLimiter,
} from './types';

export const KEY_VALUE_PROVIDER_ENV = 'AGI_KV_PROVIDER';
export const KEY_VALUE_REDIS_URL_ENV = 'AGI_KV_REDIS_URL';

const KEY_VALUE_PROVIDERS: readonly KeyValueProvider[] = ['upstash', 'redis', 'memory', 'none'];

export interface KeyValueRuntime {
  provider: KeyValueProvider;
  store: KeyValueStore | null;
  rateLimiter: RateLimiter | null;
}

export interface ResolveKeyValueRuntimeOptions extends MemoryKeyValueStoreOptions {
  provider?: KeyValueProvider;
  upstashClient?: UpstashRedisLike;
  redisUrl?: string;
}

function readEnv(name: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function readConfiguredProvider(): KeyValueProvider | undefined {
  const configured = readEnv(KEY_VALUE_PROVIDER_ENV)?.toLowerCase();
  if (!configured) return undefined;
  if ((KEY_VALUE_PROVIDERS as readonly string[]).includes(configured)) {
    return configured as KeyValueProvider;
  }
  throw new KeyValueConfigError(
    `${KEY_VALUE_PROVIDER_ENV}="${configured}" is not one of: ${KEY_VALUE_PROVIDERS.join(', ')}`,
  );
}

/**
 * The one place a provider is chosen. Explicit configuration wins; otherwise
 * the deployment is read from the credentials it actually carries, so a
 * production process keeps the shared Upstash database and a developer with a
 * local Redis URL stops spending the shared quota.
 */
export function selectKeyValueProvider(
  options: ResolveKeyValueRuntimeOptions = {},
): KeyValueProvider {
  const explicit = options.provider ?? readConfiguredProvider();
  if (explicit) return explicit;
  if (options.upstashClient || readUpstashCredentials()) return 'upstash';
  if (options.redisUrl ?? readEnv(KEY_VALUE_REDIS_URL_ENV)) return 'redis';
  return 'none';
}

export function resolveKeyValueRuntime(
  options: ResolveKeyValueRuntimeOptions = {},
): KeyValueRuntime {
  const provider = selectKeyValueProvider(options);

  switch (provider) {
    case 'upstash': {
      const credentials = readUpstashCredentials();
      const client =
        options.upstashClient ?? (credentials ? createUpstashRedisClient(credentials) : null);
      if (!client) {
        throw new KeyValueConfigError(
          `The upstash provider needs REST credentials; set one of ` +
            `KV_REST_API_URL or UPSTASH_REDIS_REST_URL with its matching token.`,
        );
      }
      return {
        provider,
        store: createUpstashKeyValueStore(client),
        rateLimiter: createUpstashRateLimiter(client),
      };
    }
    case 'redis': {
      const url = options.redisUrl ?? readEnv(KEY_VALUE_REDIS_URL_ENV);
      if (!url) {
        throw new KeyValueConfigError(
          `The redis provider needs a connection URL; set ${KEY_VALUE_REDIS_URL_ENV}.`,
        );
      }
      const store = createNodeRedisKeyValueStore(connectToLocalRedis(url));
      return { provider, store, rateLimiter: createSlidingWindowRateLimiter(store, options) };
    }
    case 'memory': {
      const store = createMemoryKeyValueStore(options);
      return { provider, store, rateLimiter: createSlidingWindowRateLimiter(store, options) };
    }
    case 'none':
      return { provider, store: null, rateLimiter: null };
  }
}
