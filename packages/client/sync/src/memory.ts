import type { MemoryWireDelta } from '@agiworkforce/cloud-contracts';

export type SyncMemorySource = 'mobile' | 'desktop' | 'web' | 'auto';

export interface SyncMemoryRecord {
  id: string;
  content: string;
  category: string | null;
  source: SyncMemorySource;
  pinned: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  serverVersion?: string;
}

const KNOWN_NON_WEB_SOURCES: ReadonlySet<string> = new Set(['mobile', 'desktop', 'auto']);

export function mapMemoryWireDelta(delta: MemoryWireDelta): SyncMemoryRecord {
  return {
    id: delta.id,
    content: delta.content,
    category: delta.category,
    source:
      delta.source && KNOWN_NON_WEB_SOURCES.has(delta.source)
        ? (delta.source as SyncMemorySource)
        : 'web',
    pinned: delta.pinned,
    isDeleted: delta.is_deleted,
    createdAt: delta.created_at,
    updatedAt: delta.updated_at,
    serverVersion: delta.server_version,
  };
}

export function applyMemoryDeltas(
  current: ReadonlyArray<SyncMemoryRecord>,
  deltas: ReadonlyArray<SyncMemoryRecord>,
  dirtyMemoryIds: ReadonlyArray<string> = [],
): SyncMemoryRecord[] {
  const byId = new Map(current.map((e) => [e.id, e]));
  for (const delta of deltas) {
    if (delta.isDeleted) {
      byId.delete(delta.id);
    } else {
      const existing = byId.get(delta.id);
      byId.set(
        delta.id,
        dirtyMemoryIds.includes(delta.id) && existing
          ? { ...existing, serverVersion: delta.serverVersion }
          : delta,
      );
    }
  }
  return Array.from(byId.values());
}

export interface MemoryPushItem {
  id: string;
  content: string;
  category: string | null;
  source: SyncMemorySource;
  pinned: boolean;
  baseVersion: string;
  isDeleted: boolean;
}

export function toMemoryPushItem(record: SyncMemoryRecord): MemoryPushItem {
  return {
    id: record.id,
    content: record.content,
    category: record.category,
    source: record.source,
    pinned: record.pinned,
    baseVersion: record.serverVersion ?? '0',
    isDeleted: record.isDeleted,
  };
}

export function memorySyncContentMatches(
  left: SyncMemoryRecord,
  right: SyncMemoryRecord,
): boolean {
  return (
    left.id === right.id &&
    left.content === right.content &&
    left.category === right.category &&
    left.source === right.source &&
    left.pinned === right.pinned &&
    left.isDeleted === right.isDeleted
  );
}
