import type { S3Client } from '@aws-sdk/client-s3';
import { createMemoryObjectStore, type MemoryObjectStoreOptions } from './adapters/memory';
import { createS3Client, createS3ObjectStore, type S3ClientTimeouts } from './adapters/s3';
import {
  resolveObjectStorageConfig,
  type ObjectStorageConfig,
  type ObjectStorageEnvironment,
} from './config';
import { ObjectStorageConfigError, type ObjectStore, type ObjectStorageProvider } from './types';

export interface ObjectStorageRuntime {
  provider: ObjectStorageProvider;
  config: ObjectStorageConfig;
  store: ObjectStore | null;
}

export interface ResolveObjectStorageRuntimeOptions {
  env?: ObjectStorageEnvironment;
  timeouts?: S3ClientTimeouts;
  client?: S3Client;
  memory?: MemoryObjectStoreOptions;
}

/**
 * The one place a storage provider is chosen. Everything above this reads the
 * port, so moving the bytes to another host is an endpoint and a bucket in the
 * environment rather than an edit at each call site.
 */
export function resolveObjectStorageRuntime(
  options: ResolveObjectStorageRuntimeOptions = {},
): ObjectStorageRuntime {
  const config = resolveObjectStorageConfig(options.env);

  switch (config.provider) {
    case 's3': {
      if (!options.timeouts) {
        throw new ObjectStorageConfigError(
          'The s3 provider needs connection and request deadlines; pass them to the runtime.',
        );
      }
      const client = options.client ?? createS3Client(config, options.timeouts);
      return {
        provider: config.provider,
        config,
        store: createS3ObjectStore({ client, requestTimeoutMs: options.timeouts.requestTimeoutMs }),
      };
    }
    case 'memory':
      return { provider: config.provider, config, store: createMemoryObjectStore(options.memory) };
    case 'none':
      return { provider: config.provider, config, store: null };
  }
}
