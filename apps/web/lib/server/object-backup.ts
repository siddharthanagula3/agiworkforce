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
import { getNeonDb } from '@/lib/server/neon-db';

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

export const BACKUP_REQUIRED_ENV: ReadonlyArray<string> = [
  BACKUP_ENDPOINT_ENV,
  BACKUP_BUCKET_ENV,
  BACKUP_ACCESS_KEY_ID_ENV,
  BACKUP_SECRET_ACCESS_KEY_ENV,
];

export function missingBackupEnv(env: Environment = environment()): string[] {
  return BACKUP_REQUIRED_ENV.filter((name) => !env[name]);
}

export function isObjectBackupConfigured(env: Environment = environment()): boolean {
  return missingBackupEnv(env).length === 0;
}

export interface ObjectBackupReadiness {
  configured: boolean;
  missing: string[];
  crossRegion: boolean;
  independentCredential: boolean;
}

/**
 * A backup the primary's own key can delete is lost with that key, so the
 * copy is only independent when it is written under a credential of its own.
 */
export function backupSharesPrimaryCredential(env: Environment = environment()): boolean {
  const backupKeyId = env[BACKUP_ACCESS_KEY_ID_ENV]?.trim();
  if (!backupKeyId) return false;
  return resolveObjectStorageConfig(env).accessKeyId?.trim() === backupKeyId;
}

/**
 * What a production host can answer about its own backup without holding a
 * credential: which variables are unset by name, whether the copy leaves the
 * primary's failure domain, and whether the primary's key can reach it. Names
 * only, never values.
 */
export function objectBackupReadiness(env: Environment = environment()): ObjectBackupReadiness {
  const missing = missingBackupEnv(env);
  const configured = missing.length === 0;
  return {
    configured,
    missing,
    crossRegion: configured && isCrossRegionBackup(env),
    independentCredential: configured && !backupSharesPrimaryCredential(env),
  };
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

export type BackupDeletionOutcome = 'unconfigured' | 'deleted' | 'absent';

export async function deleteBackupObject(
  key: string,
  options: { target?: BackupTarget | null } = {},
): Promise<BackupDeletionOutcome> {
  const target = options.target === undefined ? resolveObjectBackupTarget() : options.target;
  if (!target) return 'unconfigured';

  const existing = await target.store.head(target.bucket, key);
  if (!existing) return 'absent';

  await target.store.delete(target.bucket, key);
  return 'deleted';
}

const REPLICA_TABLE = 'object_backup_replicas';

export interface BackupReplicaSummary {
  tracked: number;
  newestReplicatedAt: string | null;
  oldestVerifiedAt: string | null;
}

export async function recordBackupReplica(
  key: string,
  bytes: number,
  backupBucket: string,
): Promise<void> {
  await getNeonDb().execute(
    `insert into public.${REPLICA_TABLE} (object_key, backup_bucket, bytes)
     values ($1, $2, $3)
     on conflict (object_key) do update
        set backup_bucket = excluded.backup_bucket,
            bytes = excluded.bytes,
            replicated_at = now(),
            verified_at = now()`,
    [key, backupBucket, bytes],
  );
}

export async function replicasDueForReconciliation(limit: number): Promise<string[]> {
  const rows = await getNeonDb().query<{ object_key: string }>(
    `select object_key
       from public.${REPLICA_TABLE}
      order by verified_at asc
      limit $1`,
    [limit],
  );
  return rows.map((row) => row.object_key);
}

/**
 * Marks every tracked replica due again. A point-in-time restore rolls this
 * table back to a moment when deleted objects were still tracked as verified,
 * so without this the next sweeps re-check the wrong keys for weeks and erased
 * objects keep sitting in the backup bucket.
 */
export async function requeueReplicasAfterRestore(): Promise<number> {
  // Counted in SQL: the table holds every backed up object, too many to return.
  const rows = await getNeonDb().query<{ requeued: string | number }>(
    `with requeued as (
       update public.${REPLICA_TABLE}
          set verified_at = 'epoch'::timestamptz
        returning 1
     )
     select count(*) as requeued from requeued`,
  );
  return Number(rows[0]?.requeued ?? 0);
}

export async function markReplicaVerified(key: string): Promise<void> {
  await getNeonDb().execute(
    `update public.${REPLICA_TABLE} set verified_at = now() where object_key = $1`,
    [key],
  );
}

export async function forgetBackupReplicas(keys: ReadonlyArray<string>): Promise<number> {
  if (keys.length === 0) return 0;
  const rows = await getNeonDb().query<{ object_key: string }>(
    `delete from public.${REPLICA_TABLE} where object_key = any($1::text[]) returning object_key`,
    [keys],
  );
  return rows.length;
}

export async function backupReplicaSummary(): Promise<BackupReplicaSummary> {
  const rows = await getNeonDb().query<{
    tracked: string | number;
    newest_replicated_at: string | null;
    oldest_verified_at: string | null;
  }>(
    `select count(*) as tracked,
            max(replicated_at) as newest_replicated_at,
            min(verified_at) as oldest_verified_at
       from public.${REPLICA_TABLE}`,
  );
  const row = rows[0];
  return {
    tracked: Number(row?.tracked ?? 0),
    newestReplicatedAt: row?.newest_replicated_at ?? null,
    oldestVerifiedAt: row?.oldest_verified_at ?? null,
  };
}

/**
 * The backup is a copy of what exists, so a deletion the primary has already
 * made has to reach it or an erased object survives in the second bucket. The
 * sweep asks the primary about each tracked key rather than trusting a delete
 * notification that no path guarantees.
 */
export async function reconcileBackupDeletions(
  limit: number,
  options: { source?: ObjectStore; target?: BackupTarget | null; sourceBucket?: string } = {},
): Promise<{ checked: number; deleted: number; retained: number }> {
  const target = options.target === undefined ? resolveObjectBackupTarget() : options.target;
  if (!target) return { checked: 0, deleted: 0, retained: 0 };

  const source = options.source ?? getObjectStore();
  const sourceBucket = options.sourceBucket ?? objectStorageConfig().privateBucket;
  if (!sourceBucket) return { checked: 0, deleted: 0, retained: 0 };

  const keys = await replicasDueForReconciliation(limit);
  const orphaned: string[] = [];
  let retained = 0;

  for (const key of keys) {
    const head = await source.head(sourceBucket, key);
    if (head) {
      retained += 1;
      await markReplicaVerified(key);
      continue;
    }
    await deleteBackupObject(key, { target });
    orphaned.push(key);
  }

  await forgetBackupReplicas(orphaned);
  return { checked: keys.length, deleted: orphaned.length, retained };
}
