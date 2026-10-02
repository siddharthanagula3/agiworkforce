import 'server-only';

import { promisify } from 'node:util';
import { brotliCompress, brotliDecompress, constants as zlibConstants } from 'node:zlib';

import { logger } from '@/lib/logger';
import { NeonMcpResponseCacheStore } from '@/lib/connectors/mcp-runtime-cache';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

const SNAPSHOT_METHOD = 'connectors.directory.snapshot';
const LEGACY_SNAPSHOT_PARAMS = 'v1';
const SNAPSHOT_PARAMS = 'v2';
const ICON_INDEX_METHOD = 'connectors.directory.icon-index';
const ICON_INDEX_PARAMS = 'v1';
const SYNC_STATE_METHOD = 'connectors.directory.sync-state';
const SYNC_STATE_PARAMS = 'v1';
const INGEST_LEASE_METHOD = 'connectors.directory.ingest-lease';
const INGEST_LEASE_PARAMS = 'v1';
const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const SYNC_STATE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const COMPRESSED_VALUE_PREFIX = 'br64:';
const SNAPSHOT_BROTLI_QUALITY = 9;

const compress = promisify(brotliCompress);
const decompress = promisify(brotliDecompress);

const cacheStore = new NeonMcpResponseCacheStore();

function snapshotKey() {
  return { method: SNAPSHOT_METHOD, params: SNAPSHOT_PARAMS, partition: '' };
}

function legacySnapshotKey() {
  return { method: SNAPSHOT_METHOD, params: LEGACY_SNAPSHOT_PARAMS, partition: '' };
}

function iconIndexKey() {
  return { method: ICON_INDEX_METHOD, params: ICON_INDEX_PARAMS, partition: '' };
}

function syncStateKey() {
  return { method: SYNC_STATE_METHOD, params: SYNC_STATE_PARAMS, partition: '' };
}

function ingestLeaseKey() {
  return { method: INGEST_LEASE_METHOD, params: INGEST_LEASE_PARAMS, partition: '' };
}

export class DirectorySnapshotUnreadableError extends Error {
  constructor(version: string, cause: unknown) {
    super(`Connector directory snapshot ${version} exists but could not be decoded`, { cause });
    this.name = 'DirectorySnapshotUnreadableError';
  }
}

export async function encodeStoredJson(value: unknown): Promise<string> {
  const json = Buffer.from(JSON.stringify(value), 'utf8');
  const compressed = await compress(json, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: SNAPSHOT_BROTLI_QUALITY,
      [zlibConstants.BROTLI_PARAM_SIZE_HINT]: json.length,
    },
  });
  return `${COMPRESSED_VALUE_PREFIX}${compressed.toString('base64')}`;
}

export async function decodeStoredJson(value: string): Promise<unknown> {
  if (!value.startsWith(COMPRESSED_VALUE_PREFIX)) return JSON.parse(value);
  const compressed = Buffer.from(value.slice(COMPRESSED_VALUE_PREFIX.length), 'base64');
  return JSON.parse((await decompress(compressed)).toString('utf8'));
}

function iconIndexFor(records: readonly DirectoryRecord[]): Record<string, string> {
  const index: Record<string, string> = {};
  for (const record of records) {
    if (record.iconUrl) index[record.id] = record.iconUrl;
  }
  return index;
}

async function refreshCompressedSnapshot(
  records: readonly DirectoryRecord[],
  expiresAt: number | undefined,
  seenCompressedStamp: number | null,
): Promise<void> {
  const keepUntil = expiresAt ?? Date.now() + SNAPSHOT_TTL_MS;
  const entry = {
    value: await encodeStoredJson(records),
    expiresAt: keepUntil,
    scope: 'public' as const,
  };
  try {
    const written =
      seenCompressedStamp === null
        ? await cacheStore.insertIfAbsent(snapshotKey(), entry)
        : await cacheStore.replaceIfStamp(snapshotKey(), entry, seenCompressedStamp);
    if (written === null) return;
    await cacheStore.set(iconIndexKey(), {
      value: await encodeStoredJson(iconIndexFor(records)),
      expiresAt: keepUntil,
      scope: 'public',
    });
  } catch (error) {
    logger.warn({ error }, 'Connector directory snapshot refresh failed');
  }
}

async function loadSnapshotRecords(): Promise<readonly DirectoryRecord[] | null> {
  const [compressedStamp, legacyStamp] = await Promise.all([
    cacheStore.getStamp(snapshotKey()),
    cacheStore.getStamp(legacySnapshotKey()),
  ]);
  if (compressedStamp !== null && (legacyStamp === null || compressedStamp > legacyStamp)) {
    const current = await cacheStore.get(snapshotKey());
    if (current) {
      try {
        return (await decodeStoredJson(current.value)) as DirectoryRecord[];
      } catch (error) {
        throw new DirectorySnapshotUnreadableError(SNAPSHOT_PARAMS, error);
      }
    }
  }
  const legacy = await cacheStore.get(legacySnapshotKey());
  if (!legacy) return null;
  let records: DirectoryRecord[];
  try {
    records = JSON.parse(legacy.value) as DirectoryRecord[];
  } catch (error) {
    throw new DirectorySnapshotUnreadableError(LEGACY_SNAPSHOT_PARAMS, error);
  }
  await refreshCompressedSnapshot(records, legacy.expiresAt, compressedStamp);
  return records;
}

export async function readSnapshotStamp(): Promise<number | null> {
  const [compressedStamp, legacyStamp] = await Promise.all([
    cacheStore.getStamp(snapshotKey()),
    cacheStore.getStamp(legacySnapshotKey()),
  ]);
  if (compressedStamp === null) return legacyStamp;
  if (legacyStamp === null) return compressedStamp;
  return Math.max(compressedStamp, legacyStamp);
}

export async function readSnapshotRecords(): Promise<readonly DirectoryRecord[] | null> {
  try {
    return await loadSnapshotRecords();
  } catch (error) {
    if (!(error instanceof DirectorySnapshotUnreadableError)) throw error;
    logger.warn({ error }, 'Connector directory snapshot unreadable');
    return null;
  }
}

export async function readSnapshotRecordsForIngest(): Promise<readonly DirectoryRecord[] | null> {
  return loadSnapshotRecords();
}

export async function writeSnapshotRecords(records: readonly DirectoryRecord[]): Promise<number> {
  const expiresAt = Date.now() + SNAPSHOT_TTL_MS;
  await cacheStore.set(iconIndexKey(), {
    value: await encodeStoredJson(iconIndexFor(records)),
    expiresAt,
    scope: 'public',
  });
  await cacheStore.set(legacySnapshotKey(), {
    value: JSON.stringify(records),
    expiresAt,
    scope: 'public',
  });
  return cacheStore.set(snapshotKey(), {
    value: await encodeStoredJson(records),
    expiresAt,
    scope: 'public',
  });
}

export async function readIconIndexStamp(): Promise<number | null> {
  return cacheStore.getStamp(iconIndexKey());
}

export async function readIconIndex(): Promise<Readonly<Record<string, string>> | null> {
  const entry = await cacheStore.get(iconIndexKey());
  if (!entry) return null;
  try {
    return (await decodeStoredJson(entry.value)) as Record<string, string>;
  } catch {
    return null;
  }
}

export interface DirectorySyncState {
  readonly nextIngestCursor: string | null;
  readonly bootstrapComplete: boolean;
  readonly bootstrapStartedAt: string | null;
  readonly lastSyncAt: string | null;
  readonly authProbeCursor: string | null;
  readonly siteIconCursor: string | null;
}

export const DEFAULT_SYNC_STATE: DirectorySyncState = {
  nextIngestCursor: null,
  bootstrapComplete: false,
  bootstrapStartedAt: null,
  lastSyncAt: null,
  authProbeCursor: null,
  siteIconCursor: null,
};

export async function readSyncState(): Promise<DirectorySyncState> {
  const entry = await cacheStore.get(syncStateKey());
  if (!entry) return DEFAULT_SYNC_STATE;
  try {
    return { ...DEFAULT_SYNC_STATE, ...(JSON.parse(entry.value) as Partial<DirectorySyncState>) };
  } catch {
    return DEFAULT_SYNC_STATE;
  }
}

export async function writeSyncState(state: DirectorySyncState): Promise<void> {
  await cacheStore.set(syncStateKey(), {
    value: JSON.stringify(state),
    expiresAt: Date.now() + SYNC_STATE_TTL_MS,
    scope: 'public',
  });
}

export interface DirectoryIngestLease {
  readonly startedAt: string;
  readonly expiresAt: string;
}

export async function readIngestLease(nowMs: number): Promise<DirectoryIngestLease | null> {
  const entry = await cacheStore.get(ingestLeaseKey());
  if (!entry || entry.expiresAt === undefined || entry.expiresAt <= nowMs) return null;
  try {
    return JSON.parse(entry.value) as DirectoryIngestLease;
  } catch {
    return null;
  }
}

export async function writeIngestLease(lease: DirectoryIngestLease): Promise<void> {
  await cacheStore.set(ingestLeaseKey(), {
    value: JSON.stringify(lease),
    expiresAt: Date.parse(lease.expiresAt),
    scope: 'public',
  });
}

export async function clearIngestLease(): Promise<void> {
  await cacheStore.delete(ingestLeaseKey());
}
