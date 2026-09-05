import {
  resolveKeyValueRuntime,
  type KeyValueProvider,
  type KeyValueRuntime,
  type KeyValueStore,
  type RateLimiter,
} from '@agiworkforce/key-value';

/**
 * The one place this app resolves a key-value backend. Every consumer takes the
 * port from here, so swapping the backend is an environment change rather than
 * an edit at each call site, and a single process holds one connection.
 */
let runtime: KeyValueRuntime | null = null;

function keyValueRuntime(): KeyValueRuntime {
  runtime ??= resolveKeyValueRuntime();
  return runtime;
}

export function getKeyValueStore(): KeyValueStore | null {
  return keyValueRuntime().store;
}

export function getKeyValueRateLimiter(): RateLimiter | null {
  return keyValueRuntime().rateLimiter;
}

export function getKeyValueProvider(): KeyValueProvider {
  return keyValueRuntime().provider;
}
