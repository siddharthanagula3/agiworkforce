/**
 * Cloud memory delta-apply — pure logic extracted from mobile's
 * cloudSyncEngine.ts (pullMemory's snake→camel mapping) and
 * cloudMemoryStore.ts (applyCloudMemoryDeltas's upsert/tombstone reducer,
 * which was already a pure `(entries, deltas) => entries` reducer with no
 * side effects besides the Zustand `set` call at its boundary).
 *
 * Full port extraction (unlike projects — see projects.ts): the engine is the
 * ONLY caller of the store's applyCloudMemoryDeltas action, so rerouting it
 * through this shared reducer + a plain `setState({ entries })` reproduces
 * the exact same end state with no second, divergent copy of the merge rule.
 */
import type { MemoryWireDelta } from '../cloud-contracts/sync';

export type SyncMemorySource = 'mobile' | 'desktop' | 'web' | 'auto';

/** The fields every surface's local cloud-memory record needs for delta-sync apply. */
export interface SyncMemoryRecord {
  id: string;
  content: string;
  category: string | null;
  source: SyncMemorySource;
  pinned: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

const KNOWN_NON_WEB_SOURCES: ReadonlySet<string> = new Set(['mobile', 'desktop', 'auto']);

/**
 * Map a wire memory delta (snake_case) to the client-domain record
 * (camelCase). The wire `source` is a free-form string; unknown/absent
 * values normalize to 'web' (matches mobile's pre-Wave-4 pullMemory()).
 */
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
  };
}

/**
 * Upsert-by-id-with-tombstone-delete reducer. A tombstoned delta
 * (`isDeleted`) hard-deletes the row: the client already applied the delete
 * locally (that's how it became dirty and got pushed), so a server
 * confirmation means it is safe to drop the row entirely rather than keep it
 * as a local tombstone.
 */
export function applyMemoryDeltas(
  current: ReadonlyArray<SyncMemoryRecord>,
  deltas: ReadonlyArray<SyncMemoryRecord>,
): SyncMemoryRecord[] {
  const byId = new Map(current.map((e) => [e.id, e]));
  for (const delta of deltas) {
    if (delta.isDeleted) byId.delete(delta.id);
    else byId.set(delta.id, delta);
  }
  return Array.from(byId.values());
}
