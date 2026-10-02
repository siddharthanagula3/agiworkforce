import 'server-only';

import {
  readIconIndex,
  readIconIndexStamp,
  readSnapshotRecords,
  readSnapshotStamp,
  readSyncState,
} from '@/lib/connectors/directory/snapshot-cache';
import {
  computeDirectoryCounts,
  orderDirectoryRecords,
  withDefaultBadge,
  type DirectoryCounts,
} from '@/lib/connectors/directory/snapshot-view';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

interface CachedSnapshot {
  readonly stamp: number;
  readonly records: readonly DirectoryRecord[];
  readonly counts: DirectoryCounts;
}

const EMPTY_SNAPSHOT: Omit<CachedSnapshot, 'stamp'> = {
  records: [],
  counts: computeDirectoryCounts([]),
};

let cached: CachedSnapshot | null = null;

interface CachedIconIndex {
  readonly stamp: number;
  readonly index: Readonly<Record<string, string>>;
}

let cachedIconIndex: CachedIconIndex | null = null;

async function loadSnapshot(): Promise<Omit<CachedSnapshot, 'stamp'>> {
  const stamp = await readSnapshotStamp();
  if (stamp === null) {
    cached = null;
    return EMPTY_SNAPSHOT;
  }
  if (cached && cached.stamp === stamp) return cached;

  const stored = (await readSnapshotRecords()) ?? [];
  const records = orderDirectoryRecords(stored.map(withDefaultBadge));
  cached = { stamp, records, counts: computeDirectoryCounts(records) };
  return cached;
}

export async function getSnapshotRecords(): Promise<readonly DirectoryRecord[]> {
  return (await loadSnapshot()).records;
}

export interface DirectorySnapshotView {
  readonly records: readonly DirectoryRecord[];
  readonly counts: DirectoryCounts;
  readonly bootstrapComplete: boolean;
  readonly lastSyncAt: string | null;
}

export async function getSnapshotView(): Promise<DirectorySnapshotView> {
  const [snapshot, syncState] = await Promise.all([loadSnapshot(), readSyncState()]);
  return {
    records: snapshot.records,
    counts: snapshot.counts,
    bootstrapComplete: syncState.bootstrapComplete,
    lastSyncAt: syncState.lastSyncAt,
  };
}

export async function getDirectoryIconUrl(connectorId: string): Promise<string | null> {
  const stamp = await readIconIndexStamp();
  if (stamp !== null) {
    if (cachedIconIndex?.stamp !== stamp) {
      const index = await readIconIndex();
      cachedIconIndex = index ? { stamp, index } : null;
    }
    if (cachedIconIndex) {
      return Object.hasOwn(cachedIconIndex.index, connectorId)
        ? (cachedIconIndex.index[connectorId] ?? null)
        : null;
    }
  }
  const records = await getSnapshotRecords();
  return records.find((entry) => entry.id === connectorId)?.iconUrl ?? null;
}

export function __resetSnapshotMemoryCacheForTests(): void {
  cached = null;
  cachedIconIndex = null;
}
