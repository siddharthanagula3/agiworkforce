import 'server-only';

import { readSnapshotRecords, readSnapshotStamp } from '@/lib/connectors/directory/snapshot-cache';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

let cachedStamp: number | null = null;
let cachedRecords: readonly DirectoryRecord[] = [];

export async function getSnapshotRecords(): Promise<readonly DirectoryRecord[]> {
  const stamp = await readSnapshotStamp();
  if (stamp === null) {
    cachedStamp = null;
    cachedRecords = [];
    return cachedRecords;
  }
  if (stamp === cachedStamp) return cachedRecords;

  const records = await readSnapshotRecords();
  cachedStamp = stamp;
  cachedRecords = records ?? [];
  return cachedRecords;
}

export function __resetSnapshotMemoryCacheForTests(): void {
  cachedStamp = null;
  cachedRecords = [];
}
