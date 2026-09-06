import 'server-only';

import {
  readPluginSnapshotRecords,
  readPluginSnapshotStamp,
  readPluginSyncState,
} from './snapshot-cache';
import type { PluginDirectoryEntry } from './types';

interface CachedDirectory {
  readonly stamp: number;
  readonly records: readonly PluginDirectoryEntry[];
  readonly byKey: ReadonlyMap<string, PluginDirectoryEntry>;
}

const EMPTY: Omit<CachedDirectory, 'stamp'> = { records: [], byKey: new Map() };

let cached: CachedDirectory | null = null;

function index(records: readonly PluginDirectoryEntry[]): Map<string, PluginDirectoryEntry> {
  const byKey = new Map<string, PluginDirectoryEntry>();
  for (const record of records) {
    byKey.set(record.id, record);
    if (!byKey.has(record.slug)) byKey.set(record.slug, record);
  }
  return byKey;
}

async function load(): Promise<Omit<CachedDirectory, 'stamp'>> {
  const stamp = await readPluginSnapshotStamp();
  if (stamp === null) {
    cached = null;
    return EMPTY;
  }
  if (cached && cached.stamp === stamp) return cached;
  const records = (await readPluginSnapshotRecords()) ?? [];
  cached = { stamp, records, byKey: index(records) };
  return cached;
}

export async function getPluginDirectoryRecords(): Promise<readonly PluginDirectoryEntry[]> {
  return (await load()).records;
}

export async function findPluginDirectoryRecord(
  idOrSlug: string,
): Promise<PluginDirectoryEntry | null> {
  return (await load()).byKey.get(idOrSlug) ?? null;
}

export interface PluginDirectoryView {
  readonly records: readonly PluginDirectoryEntry[];
  readonly lastSyncAt: string | null;
}

export async function getPluginDirectoryView(): Promise<PluginDirectoryView> {
  const [directory, syncState] = await Promise.all([load(), readPluginSyncState()]);
  return { records: directory.records, lastSyncAt: syncState.lastSyncAt };
}

export function __resetPluginDirectoryMemoryCacheForTests(): void {
  cached = null;
}
