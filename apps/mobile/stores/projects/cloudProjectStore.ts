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

  /**
   * The cloud project that the next NEW cloud chat will be assigned to (null = no
   * project). Cloud-namespace only — physically separate from the local store's
   * activeProjectId so a local project id can never leak into a cloud chat.
   */
  activeProjectId: string | null;

  /** Upsert a cloud project (add or replace by id). */
  upsertCloudProject: (project: CloudProject) => void;
  /** Hard-delete a project by id (called only after the server acks the tombstone). */
  hardDeleteCloudProject: (id: string) => void;
  /** Apply a batch of pulled deltas (from /api/projects/sync). */
  applyCloudProjectDeltas: (deltas: CloudProject[]) => void;
  /**
   * Select the active cloud project for new chats. Accepts only an id that exists
   * with `deletedAt === null` (or `null` to clear); an unknown or tombstoned id is
   * rejected so a new chat is never stamped with a dangling cloud project_id.
   */
  setActiveCloudProject: (id: string | null) => void;
  /** Clear all cloud project data (e.g. on sign-out / account switch). */
  clearCloudProjectData: () => void;
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useCloudProjectStore = create<CloudProjectState>()(
  persist(
    (set) => ({
      projects: [],
      activeProjectId: null,

      upsertCloudProject: (project) => {
        set((state) => {
          const idx = state.projects.findIndex((p) => p.id === project.id);
          const projects =
            idx === -1
              ? [...state.projects, project]
              : state.projects.map((p, i) => (i === idx ? project : p));
          // SINGLE catch-all for dangling-ref prevention: if THIS upsert tombstones
          // the currently-active project, clear the active id. Every soft-delete path
          // (user deleteProject, update-driven delete, applied sync tombstone) funnels
          // through upsertCloudProject with deletedAt set, so clearing here guarantees
          // the next cloud chat is never stamped with a tombstoned project_id.
          const activeProjectId =
            project.deletedAt !== null && state.activeProjectId === project.id
              ? null
              : state.activeProjectId;
          return { projects, activeProjectId };
        });
      },

      hardDeleteCloudProject: (id) => {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        }));
      },

      applyCloudProjectDeltas: (deltas) => {
        set((state) => {
          const byId = new Map(state.projects.map((p) => [p.id, p]));
          let activeProjectId = state.activeProjectId;
          for (const delta of deltas) {
            if (delta.deletedAt !== null) {
              // Tombstone from the server — hard-delete locally. We already
              // applied the delete on our side; the server confirming it means
              // we can remove the row entirely.
              byId.delete(delta.id);
              if (activeProjectId === delta.id) activeProjectId = null;
            } else {
              byId.set(delta.id, delta);
            }
          }
          return { projects: Array.from(byId.values()), activeProjectId };
        });
      },

      setActiveCloudProject: (id) => {
        set((state) => {
          if (id === null) return { activeProjectId: null };
          // Reject unknown or tombstoned ids — only a live cloud project may be active.
          const live = state.projects.some((p) => p.id === id && p.deletedAt === null);
          return live ? { activeProjectId: id } : state;
        });
      },

      clearCloudProjectData: () => {
        set({ projects: [], activeProjectId: null });
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
        activeProjectId: state.activeProjectId,
      }),
    },
  ),
);

rehydrateWhenMmkvReady(useCloudProjectStore, 'projects-store-cloud');
