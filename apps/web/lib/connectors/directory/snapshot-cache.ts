import 'server-only';

import { brotliCompressSync, brotliDecompressSync, constants as zlibConstants } from 'node:zlib';

import { logger } from '@/lib/logger';
import { NeonMcpResponseCacheStore } from '@/lib/connectors/mcp-runtime-cache';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

const SNAPSHOT_METHOD = 'connectors.directory.snapshot';
const SNAPSHOT_PARAMS = 'v1';
const ICON_INDEX_METHOD = 'connectors.directory.icon-index';
const ICON_INDEX_PARAMS = 'v1';
const COMPRESSED_VALUE_PREFIX = 'br64:';
const SNAPSHOT_BROTLI_QUALITY = 9;
const SYNC_STATE_METHOD = 'connectors.directory.sync-state';
const SYNC_STATE_PARAMS = 'v1';
const INGEST_LEASE_METHOD = 'connectors.directory.ingest-lease';
const INGEST_LEASE_PARAMS = 'v1';
const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const SYNC_STATE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

const cacheStore = new NeonMcpResponseCacheStore();

function snapshotKey() {
  return { method: SNAPSHOT_METHOD, params: SNAPSHOT_PARAMS, partition: '' };
}

function syncStateKey() {
  return { method: SYNC_STATE_METHOD, params: SYNC_STATE_PARAMS, partition: '' };
}

function ingestLeaseKey() {
  return { method: INGEST_LEASE_METHOD, params: INGEST_LEASE_PARAMS, partition: '' };
}

function iconIndexKey() {
  return { method: ICON_INDEX_METHOD, params: ICON_INDEX_PARAMS, partition: '' };
}

export function encodeStoredJson(value: unknown): string {
  const json = Buffer.from(JSON.stringify(value), 'utf8');
  const compressed = brotliCompressSync(json, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: SNAPSHOT_BROTLI_QUALITY,
      [zlibConstants.BROTLI_PARAM_SIZE_HINT]: json.length,
    },
  });
  return `${COMPRESSED_VALUE_PREFIX}${compressed.toString('base64')}`;
}

export function decodeStoredJson(value: string): unknown {
  if (!value.startsWith(COMPRESSED_VALUE_PREFIX)) return JSON.parse(value);
  const compressed = Buffer.from(value.slice(COMPRESSED_VALUE_PREFIX.length), 'base64');
  return JSON.parse(brotliDecompressSync(compressed).toString('utf8'));
}

function iconIndexFor(records: readonly DirectoryRecord[]): Record<string, string> {
  const index: Record<string, string> = {};
  for (const record of records) {
    if (record.iconUrl) index[record.id] = record.iconUrl;
  }
  return index;
}

async function writeIconIndex(records: readonly DirectoryRecord[], expiresAt: number) {
  await cacheStore.set(iconIndexKey(), {
    value: encodeStoredJson(iconIndexFor(records)),
    expiresAt,
    scope: 'public',
  });
}

async function compactLegacySnapshot(
  records: readonly DirectoryRecord[],
  stamp: number,
  expiresAt: number | undefined,
): Promise<void> {
  const keepUntil = expiresAt ?? Date.now() + SNAPSHOT_TTL_MS;
  try {
    const replaced = await cacheStore.replaceIfStamp(
      snapshotKey(),
      { value: encodeStoredJson(records), expiresAt: keepUntil, scope: 'public' },
      stamp,
    );
    if (replaced !== null) await writeIconIndex(records, keepUntil);
  } catch (error) {
    logger.warn({ error }, 'Connector directory snapshot compaction failed');
  }
}

export async function readSnapshotStamp(): Promise<number | null> {
  return cacheStore.getStamp(snapshotKey());
}

export async function readSnapshotRecords(): Promise<readonly DirectoryRecord[] | null> {
  const entry = await cacheStore.get(snapshotKey());
  if (!entry) return null;
  let records: DirectoryRecord[];
  try {
    records = decodeStoredJson(entry.value) as DirectoryRecord[];
  } catch {
    return null;
  }
  if (!entry.value.startsWith(COMPRESSED_VALUE_PREFIX) && typeof entry.stamp === 'number') {
    await compactLegacySnapshot(records, entry.stamp, entry.expiresAt);
  }
  return records;
}

export async function writeSnapshotRecords(records: readonly DirectoryRecord[]): Promise<number> {
  const expiresAt = Date.now() + SNAPSHOT_TTL_MS;
  const stamp = await cacheStore.set(snapshotKey(), {
    value: encodeStoredJson(records),
    expiresAt,
    scope: 'public',
  });
  await writeIconIndex(records, expiresAt);
  return stamp;
}

export async function readIconIndexStamp(): Promise<number | null> {
  return cacheStore.getStamp(iconIndexKey());
}

export async function readIconIndex(): Promise<Readonly<Record<string, string>> | null> {
  const entry = await cacheStore.get(iconIndexKey());
  if (!entry) return null;
  try {
    return decodeStoredJson(entry.value) as Record<string, string>;
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
