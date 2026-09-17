import 'server-only';

import {
  resolveObjectStorageConfig,
  resolveObjectStorageRuntime,
  OBJECT_STORAGE_ACCESS_KEY_ID_ENV,
  OBJECT_STORAGE_BUCKET_ENV,
  OBJECT_STORAGE_ENDPOINT_ENV,
  OBJECT_STORAGE_FORCE_PATH_STYLE_ENV,
  OBJECT_STORAGE_PROVIDER_ENV,
  OBJECT_STORAGE_REGION_ENV,
  OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV,
  type ObjectStore,
} from '@agiworkforce/object-storage';

import { logger } from '@/lib/logger';

import { getObjectStore, objectStorageConfig } from './object-storage-runtime';
import {
  OBJECT_STORAGE_CONNECTION_TIMEOUT_MS,
  OBJECT_STORAGE_REQUEST_TIMEOUT_MS,
} from './object-storage-timeouts';

export const BACKUP_ENV_PREFIX = 'AGI_STORAGE_BACKUP_';

export const BACKUP_ENDPOINT_ENV = `${BACKUP_ENV_PREFIX}ENDPOINT`;
export const BACKUP_REGION_ENV = `${BACKUP_ENV_PREFIX}REGION`;
export const BACKUP_BUCKET_ENV = `${BACKUP_ENV_PREFIX}BUCKET`;
export const BACKUP_ACCESS_KEY_ID_ENV = `${BACKUP_ENV_PREFIX}ACCESS_KEY_ID`;
export const BACKUP_SECRET_ACCESS_KEY_ENV = `${BACKUP_ENV_PREFIX}SECRET_ACCESS_KEY`;
export const BACKUP_FORCE_PATH_STYLE_ENV = `${BACKUP_ENV_PREFIX}FORCE_PATH_STYLE`;

export const OBJECT_BACKUP_MAX_BYTES = 256 * 1024 * 1024;

export type ReplicationOutcome =
  'unconfigured' | 'replicated' | 'already-present' | 'missing-source' | 'too-large';

export interface BackupTarget {
  store: ObjectStore;
  bucket: string;
  region: string;
  endpoint: string | undefined;
}

type Environment = Record<string, string | undefined>;

function environment(): Environment {
  return typeof process === 'undefined' ? {} : process.env;
}

/**
 * The backup target is the same resolver fed its own variables, so a copy in
 * another region is an endpoint and a bucket rather than a second storage
 * client with its own opinions. Cross-region is therefore configuration: point
 * the backup endpoint and region somewhere the primary is not.
 */
function backupEnvironment(env: Environment): Environment {
  return {
    [OBJECT_STORAGE_PROVIDER_ENV]: 's3',
    [OBJECT_STORAGE_ENDPOINT_ENV]: env[BACKUP_ENDPOINT_ENV],
    [OBJECT_STORAGE_REGION_ENV]: env[BACKUP_REGION_ENV],
    [OBJECT_STORAGE_BUCKET_ENV]: env[BACKUP_BUCKET_ENV],
    [OBJECT_STORAGE_ACCESS_KEY_ID_ENV]: env[BACKUP_ACCESS_KEY_ID_ENV],
    [OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV]: env[BACKUP_SECRET_ACCESS_KEY_ENV],
    [OBJECT_STORAGE_FORCE_PATH_STYLE_ENV]: env[BACKUP_FORCE_PATH_STYLE_ENV],
  };
}

export function isObjectBackupConfigured(env: Environment = environment()): boolean {
  return Boolean(
    env[BACKUP_ENDPOINT_ENV] &&
    env[BACKUP_BUCKET_ENV] &&
    env[BACKUP_ACCESS_KEY_ID_ENV] &&
    env[BACKUP_SECRET_ACCESS_KEY_ENV],
  );
}

let cached: { identity: string; target: BackupTarget } | null = null;

export function resolveObjectBackupTarget(env: Environment = environment()): BackupTarget | null {
  if (!isObjectBackupConfigured(env)) return null;

  const backupEnv = backupEnvironment(env);
  const config = resolveObjectStorageConfig(backupEnv);
  const identity = [config.endpoint ?? '', config.region, config.publicBucket ?? ''].join('|');
  if (cached?.identity === identity) return cached.target;

  const runtime = resolveObjectStorageRuntime({
    env: backupEnv,
    timeouts: {
      connectionTimeoutMs: OBJECT_STORAGE_CONNECTION_TIMEOUT_MS,
      requestTimeoutMs: OBJECT_STORAGE_REQUEST_TIMEOUT_MS,
    },
  });
  if (!runtime.store || !config.publicBucket) return null;

  const target: BackupTarget = {
    store: runtime.store,
    bucket: config.publicBucket,
    region: config.region,
    endpoint: config.endpoint,
  };
  cached = { identity, target };
  return target;
}

/**
 * True when the backup lands somewhere the primary's failure cannot reach.
 * A second bucket behind the same endpoint and region is a copy, not a
 * disaster-recovery copy, and the difference is worth reporting rather than
 * assuming.
 */
export function isCrossRegionBackup(env: Environment = environment()): boolean {
  const target = resolveObjectBackupTarget(env);
  if (!target) return false;
  const primary = objectStorageConfig();
  return target.endpoint !== primary.endpoint || target.region !== primary.region;
}

export interface ReplicationResult {
  outcome: ReplicationOutcome;
  bytes: number;
}

export async function replicateObject(
  key: string,
  options: { source?: ObjectStore; target?: BackupTarget | null; sourceBucket?: string } = {},
): Promise<ReplicationResult> {
  const target = options.target === undefined ? resolveObjectBackupTarget() : options.target;
  if (!target) return { outcome: 'unconfigured', bytes: 0 };

  const source = options.source ?? getObjectStore();
  const sourceBucket = options.sourceBucket ?? objectStorageConfig().privateBucket;
  if (!sourceBucket) return { outcome: 'unconfigured', bytes: 0 };

  const head = await source.head(sourceBucket, key);
  if (!head) return { outcome: 'missing-source', bytes: 0 };
  if ((head.contentLength ?? 0) > OBJECT_BACKUP_MAX_BYTES) {
    logger.warn(
      { key, bytes: head.contentLength },
      '[object-backup] object exceeds the copy limit',
    );
    return { outcome: 'too-large', bytes: head.contentLength ?? 0 };
  }

  const existing = await target.store.head(target.bucket, key);
  if (existing && existing.contentLength === head.contentLength) {
    return { outcome: 'already-present', bytes: existing.contentLength ?? 0 };
  }

  const stored = await source.get(sourceBucket, key);
  if (!stored) return { outcome: 'missing-source', bytes: 0 };

  await target.store.put({
    bucket: target.bucket,
    key,
    body: stored.data,
    contentType: stored.contentType ?? head.contentType ?? 'application/octet-stream',
    contentLength: stored.data.byteLength,
  });

  return { outcome: 'replicated', bytes: stored.data.byteLength };
}
