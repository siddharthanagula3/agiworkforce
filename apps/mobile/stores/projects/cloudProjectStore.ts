/**
 * Cloud project store — PHYSICAL SEPARATION from local MMKV project storage.
 *
 * HARD RULE: Local mode projects live in `useProjectStore` (persisted to
 * `project-store`). Cloud mode projects live here, in their own MMKV namespace
 * (`projects-store-cloud`), and are synced via services/cloudSyncEngine.
 * These two stores MUST NEVER co-mingle.
 *
 * Cloud projects arrive exclusively from the AGI Cloud API delta-sync endpoint
 * (`GET /api/projects/sync?since=<cursor>`). They are identified by UUIDv7 IDs
 * generated client-side and reconciled server-side by last-writer-wins (updatedAt).
 *
 * Shape matches the frozen web contract wire format (camelCase client side,
 * snake_case on the wire — handled by the sync engine).
 *
 * NOTE: `sources` (knowledge-file binaries) are intentionally NOT synced;
 * they are local-only and excluded from the cloud project shape per the
 * web contract comment in /api/projects/sync/route.ts.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';

// ── Cloud project entry (client-side shape) ────────────────────────────────

export interface CloudProject {
  /** UUIDv7 — client-generated, time-ordered, collision-free. */
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  color: string | null;
  isArchived: boolean;
  metadata: Record<string, unknown> | null;
  /** Always 'mobile' for locally-created entries; may be 'web'/'desktop' for pulled entries. */
  source: 'mobile' | 'desktop' | 'web';
  /** ISO 8601 string. LWW key: server accepts the latest updatedAt. */
  createdAt: string;
  updatedAt: string;
  /**
   * Tombstone: when non-null, this project is soft-deleted. The row stays in
   * the store until its delete is pushed and acked by the server. Only then is
   * it hard-removed locally.
   */
  deletedAt: string | null;
}

// ── Store interface ────────────────────────────────────────────────────────

interface CloudProjectState {
  /** All cloud projects for the current user (including un-pushed tombstones). */
  projects: CloudProject[];

  /** Upsert a cloud project (add or replace by id). */
  upsertCloudProject: (project: CloudProject) => void;
  /** Hard-delete a project by id (called only after the server acks the tombstone). */
  hardDeleteCloudProject: (id: string) => void;
  /** Apply a batch of pulled deltas (from /api/projects/sync). */
  applyCloudProjectDeltas: (deltas: CloudProject[]) => void;
  /** Clear all cloud project data (e.g. on sign-out / account switch). */
  clearCloudProjectData: () => void;
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useCloudProjectStore = create<CloudProjectState>()(
  persist(
    (set) => ({
      projects: [],

      upsertCloudProject: (project) => {
        set((state) => {
          const idx = state.projects.findIndex((p) => p.id === project.id);
          if (idx === -1) return { projects: [...state.projects, project] };
          const updated = [...state.projects];
          updated[idx] = project;
          return { projects: updated };
        });
      },

      hardDeleteCloudProject: (id) => {
        set((state) => ({ projects: state.projects.filter((p) => p.id !== id) }));
      },

      applyCloudProjectDeltas: (deltas) => {
        set((state) => {
          const byId = new Map(state.projects.map((p) => [p.id, p]));
          for (const delta of deltas) {
            if (delta.deletedAt !== null) {
              // Tombstone from the server — hard-delete locally. We already
              // applied the delete on our side; the server confirming it means
              // we can remove the row entirely.
              byId.delete(delta.id);
            } else {
              byId.set(delta.id, delta);
            }
          }
          return { projects: Array.from(byId.values()) };
        });
      },

      clearCloudProjectData: () => {
        set({ projects: [] });
      },
    }),
    {
      // SEPARATION: dedicated MMKV key — never shared with local project-store.
      name: 'projects-store-cloud',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[cloudProjectStore] Hydration failed:', error);
      },
      partialize: (state) => ({
        projects: state.projects,
      }),
    },
  ),
);

rehydrateWhenMmkvReady(useCloudProjectStore, 'projects-store-cloud');
