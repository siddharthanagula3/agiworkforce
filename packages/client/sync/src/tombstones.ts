/**
 * One deletion vocabulary for every synced object. A client that drops the row
 * keeps no record the deletion reached it, so its next push re-creates the row
 * and undoes the delete. `projects.ts` carried this from the start; the others
 * each spelled deletion differently, or not at all.
 */
export interface SyncTombstone {
  /** When the server tombstoned the row, null while it is live. */
  deletedAt: string | null;
}

/**
 * A store that keeps the tombstone rather than dropping the row. A store that
 * cannot is still correct for a single device; it just cannot tell a deletion
 * it has seen from one it has not, so `remove` stays the fallback.
 */
export interface TombstoneStorePort {
  tombstone?(id: string, deletedAt: string): void;
  remove(id: string): void;
}

export function applySyncTombstone(port: TombstoneStorePort, id: string, deletedAt: string): void {
  if (port.tombstone) port.tombstone(id, deletedAt);
  else port.remove(id);
}
