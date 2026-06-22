/**
 * Cloud memory store — PHYSICAL SEPARATION from local SQLite memory.
 *
 * HARD RULE: Local mode memories live in SQLite (storage/memory.ts) and are
 * managed by `useMemoryStore`. Cloud mode memories live here, in their own
 * MMKV namespace ('memory-store-cloud'), and are synced via
 * services/cloudSyncEngine. These two stores MUST NEVER co-mingle.
 *
 * Cloud memories arrive exclusively from the AGI Cloud API delta-sync endpoint
 * (`GET /api/memory/sync?since=<cursor>`). They are identified by UUIDv7 IDs
 * generated client-side and reconciled server-side by last-writer-wins (updatedAt).
 *
 * Shape matches the frozen web contract wire format (camelCase client side,
 * snake_case on the wire — handled by the sync engine).
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';

// ── Cloud memory entry (client-side shape) ─────────────────────────────────

export interface CloudMemoryEntry {
  /** UUIDv7 — client-generated, time-ordered, collision-free. */
  id: string;
  content: string;
  category: string | null;
  /** Always 'mobile' for locally-created entries; may be 'web'/'desktop'/'auto' for pulled entries. */
  source: 'mobile' | 'desktop' | 'web' | 'auto';
  /** ISO 8601 string. LWW key: server accepts the latest updatedAt. */
  createdAt: string;
  updatedAt: string;
  /**
   * Tombstone flag. A deleted entry stays in the store with isDeleted:true
   * until its delete has been pushed and acked by the server. Only then is it
   * hard-deleted from the local store.
   */
  isDeleted: boolean;
}

// ── Store interface ────────────────────────────────────────────────────────

interface CloudMemoryState {
  /** All cloud memory entries for the current user (including un-pushed tombstones). */
  entries: CloudMemoryEntry[];

  /** Upsert a cloud memory entry (add or replace by id). */
  upsertCloudMemory: (entry: CloudMemoryEntry) => void;
  /** Hard-delete an entry by id (called only after the server acks the tombstone). */
  hardDeleteCloudMemory: (id: string) => void;
  /** Apply a batch of pulled deltas (from /api/memory/sync). */
  applyCloudMemoryDeltas: (deltas: CloudMemoryEntry[]) => void;
  /** Clear all cloud memory data (e.g. on sign-out / account switch). */
  clearCloudMemoryData: () => void;
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useCloudMemoryStore = create<CloudMemoryState>()(
  persist(
    (set) => ({
      entries: [],

      upsertCloudMemory: (entry) => {
        set((state) => {
          const idx = state.entries.findIndex((e) => e.id === entry.id);
          if (idx === -1) return { entries: [...state.entries, entry] };
          const updated = [...state.entries];
          updated[idx] = entry;
          return { entries: updated };
        });
      },

      hardDeleteCloudMemory: (id) => {
        set((state) => ({ entries: state.entries.filter((e) => e.id !== id) }));
      },

      applyCloudMemoryDeltas: (deltas) => {
        set((state) => {
          const byId = new Map(state.entries.map((e) => [e.id, e]));
          for (const delta of deltas) {
            if (delta.isDeleted) {
              // Tombstone from the server — hard-delete locally (we already
              // applied the delete on our side; the server confirming it means
              // we can remove the row entirely).
              byId.delete(delta.id);
            } else {
              byId.set(delta.id, delta);
            }
          }
          return { entries: Array.from(byId.values()) };
        });
      },

      clearCloudMemoryData: () => {
        set({ entries: [] });
      },
    }),
    {
      // SEPARATION: dedicated MMKV key — never shared with local SQLite memory.
      name: 'memory-store-cloud',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[cloudMemoryStore] Hydration failed:', error);
      },
      partialize: (state) => ({
        // Exclude un-pushed tombstones that are still dirty — they're in the dirty
        // queue in memorySyncStateStore and will be persisted there. Keeping them
        // here means they survive even if the dirty queue itself fails.
        entries: state.entries,
      }),
    },
  ),
);

rehydrateWhenMmkvReady(useCloudMemoryStore, 'memory-store-cloud');
