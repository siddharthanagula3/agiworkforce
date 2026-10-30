import 'server-only';

import {
  readIconIndex,
  readIconIndexStamp,
  readSnapshotRecords,
  readSnapshotStamp,
  readSyncState,
  encodeStoredJson,
  decodeStoredJson,
} from '@/lib/connectors/directory/snapshot-cache';
import {
  computeDirectoryCounts,
  orderDirectoryRecords,
  withDefaultBadge,
  type DirectoryCounts,
} from '@/lib/connectors/directory/snapshot-view';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';
import { cachedPublicText } from '@/lib/server/public-text-cache';

const readStoredSnapshot = cachedPublicText(async (_stamp) => {
  const records = await readSnapshotRecords();
  return records ? encodeStoredJson(records) : null;
}, 'connector-directory-records');
const readStoredIconIndex = cachedPublicText(async (_stamp) => {
  const index = await readIconIndex();
  return index ? encodeStoredJson(index) : null;
}, 'connector-directory-icon-index');

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

  const encoded = await readStoredSnapshot(stamp);
  const stored = encoded ? ((await decodeStoredJson(encoded)) as DirectoryRecord[]) : [];
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
      const encoded = await readStoredIconIndex(stamp);
      const index = encoded ? ((await decodeStoredJson(encoded)) as Record<string, string>) : null;
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
