import {
  resolveObjectStorageConfig,
  resolveObjectStorageRuntime,
  ObjectStorageConfigError,
  OBJECT_STORAGE_ACCESS_KEY_ID_ENV,
  OBJECT_STORAGE_ENDPOINT_ENV,
  OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV,
  type ObjectStorageConfig,
  type ObjectStore,
} from '@agiworkforce/object-storage';
import {
  OBJECT_STORAGE_CONNECTION_TIMEOUT_MS,
  OBJECT_STORAGE_REQUEST_TIMEOUT_MS,
} from './object-storage-timeouts';

/**
 * The one place this app resolves an object-storage backend. Every consumer
 * takes the port from here, so swapping the bucket host is an environment
 * change rather than an edit at each call site, and a single process holds one
 * client per endpoint.
 */
let cached: { identity: string; store: ObjectStore } | null = null;

export function objectStorageConfig(): ObjectStorageConfig {
  return resolveObjectStorageConfig();
}

function connectionIdentity(config: ObjectStorageConfig): string {
  return [config.provider, config.endpoint ?? '', config.region, config.forcePathStyle].join('|');
}

export function getObjectStore(): ObjectStore {
  const config = objectStorageConfig();
  const identity = connectionIdentity(config);
  if (cached?.identity === identity) return cached.store;

  const runtime = resolveObjectStorageRuntime({
    timeouts: {
      connectionTimeoutMs: OBJECT_STORAGE_CONNECTION_TIMEOUT_MS,
      requestTimeoutMs: OBJECT_STORAGE_REQUEST_TIMEOUT_MS,
    },
  });
  if (!runtime.store) {
    throw new ObjectStorageConfigError(
      `Object storage is not configured. Set ${OBJECT_STORAGE_ENDPOINT_ENV}, ` +
        `${OBJECT_STORAGE_ACCESS_KEY_ID_ENV} and ${OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV}.`,
    );
  }
  cached = { identity, store: runtime.store };
  return runtime.store;
}
