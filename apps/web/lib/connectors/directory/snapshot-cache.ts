import 'server-only';

import { NeonMcpResponseCacheStore } from '@/lib/connectors/mcp-runtime-cache';
import type { DirectoryRecord, DirectorySnapshot } from '@/lib/connectors/directory/types';

const SNAPSHOT_CACHE_METHOD = 'connectors.directory.snapshot';
const SNAPSHOT_CACHE_PARAMS = 'v1';
const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

const cacheStore = new NeonMcpResponseCacheStore();

function snapshotCacheKey() {
  return { method: SNAPSHOT_CACHE_METHOD, params: SNAPSHOT_CACHE_PARAMS, partition: '' };
}

export async function readDirectorySnapshot(): Promise<DirectorySnapshot | null> {
  const entry = await cacheStore.get(snapshotCacheKey());
  if (!entry) return null;
  try {
    return JSON.parse(entry.value) as DirectorySnapshot;
  } catch {
    return null;
  }
}

export async function writeDirectorySnapshot(snapshot: DirectorySnapshot): Promise<void> {
  await cacheStore.set(snapshotCacheKey(), {
    value: JSON.stringify(snapshot),
    expiresAt: Date.now() + SNAPSHOT_TTL_MS,
    scope: 'public',
  });
}

export async function upsertDirectoryRecord(record: DirectoryRecord): Promise<void> {
  const snapshot = await readDirectorySnapshot();
  const records = snapshot ? [...snapshot.records] : [];
  const index = records.findIndex((existing) => existing.id === record.id);
  if (index >= 0) records[index] = record;
  else records.push(record);

  await writeDirectorySnapshot({
    records,
    nextIngestCursor: snapshot?.nextIngestCursor ?? null,
    bootstrapComplete: snapshot?.bootstrapComplete ?? false,
    lastSyncAt: snapshot?.lastSyncAt ?? null,
    updatedAt: new Date().toISOString(),
  });
}
