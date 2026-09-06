import 'server-only';

import { NeonMcpResponseCacheStore } from '@/lib/connectors/mcp-runtime-cache';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

const SNAPSHOT_METHOD = 'connectors.directory.snapshot';
const SNAPSHOT_PARAMS = 'v1';
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

export async function readSnapshotStamp(): Promise<number | null> {
  return cacheStore.getStamp(snapshotKey());
}

export async function readSnapshotRecords(): Promise<readonly DirectoryRecord[] | null> {
  const entry = await cacheStore.get(snapshotKey());
  if (!entry) return null;
  try {
    return JSON.parse(entry.value) as DirectoryRecord[];
  } catch {
    return null;
  }
}

export async function writeSnapshotRecords(records: readonly DirectoryRecord[]): Promise<number> {
  return cacheStore.set(snapshotKey(), {
    value: JSON.stringify(records),
    expiresAt: Date.now() + SNAPSHOT_TTL_MS,
    scope: 'public',
  });
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
