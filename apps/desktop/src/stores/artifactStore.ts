import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  artifactGet,
  artifactUpdate,
  artifactRollback,
  artifactDelete,
  artifactArchive,
  artifactUnarchive,
  artifactPin,
  artifactListPersisted,
} from '@/api/artifacts';

export type {
  ArtifactType,
  ArtifactStatus,
  ArtifactMetadata,
  Artifact,
  ArtifactSummary,
} from '@/api/artifacts';

import type { ArtifactStatus, ArtifactMetadata, Artifact, ArtifactSummary } from '@/api/artifacts';

export interface ArtifactDraft {
  key: string;
  title: string | null;
  artifactType: string | null;
  content: string;
  language: string | null;
  complete: boolean;
}

interface ArtifactStoreState {
  artifacts: Map<string, Artifact>;
  summaries: ArtifactSummary[];

  isLoading: boolean;
  summariesError: string | null;

  draft: ArtifactDraft | null;

  getArtifact: (id: string) => Promise<Artifact | null>;

  updateArtifact: (
    id: string,
    content: string,
    changeDescription?: string,
    title?: string,
    metadata?: ArtifactMetadata,
    tags?: string[],
  ) => Promise<Artifact | null>;

  rollbackArtifact: (id: string, version: number) => Promise<Artifact | null>;
  deleteArtifact: (id: string) => Promise<boolean>;
  archiveArtifact: (id: string) => Promise<boolean>;
  unarchiveArtifact: (id: string) => Promise<boolean>;
  pinArtifact: (id: string, pinned: boolean) => Promise<boolean>;

  listPersistedArtifacts: (conversationId?: string, limit?: number) => Promise<ArtifactSummary[]>;

  updateArtifactDraft: (draft: ArtifactDraft) => void;
  finalizeArtifactDraft: () => void;
  discardArtifactDraft: (key?: string) => void;

  resetOnLogout: () => void;
}

function withArtifactStatus(
  state: ArtifactStoreState,
  id: string,
  status: ArtifactStatus,
): Partial<ArtifactStoreState> {
  const artifact = state.artifacts.get(id);
  const artifacts = artifact
    ? new Map(state.artifacts).set(id, { ...artifact, status })
    : state.artifacts;
  return {
    artifacts,
    summaries: state.summaries.map((summary) =>
      summary.id === id ? { ...summary, status } : summary,
    ),
  };
}

export const useArtifactStore = create<ArtifactStoreState>()(
  devtools(
    (set, get) => ({
      artifacts: new Map(),
      summaries: [],
      isLoading: false,
      summariesError: null,
      draft: null,

      getArtifact: async (id) => {
        const cached = get().artifacts.get(id);
        if (cached) return cached;

        try {
          const artifact = await artifactGet(id);
          set((state) => {
            const newArtifacts = new Map(state.artifacts);
            newArtifacts.set(artifact.id, artifact);
            return { artifacts: newArtifacts };
          });
          return artifact;
        } catch (error) {
          console.error('Error getting artifact:', error);
          return null;
        }
      },

      updateArtifact: async (id, content, changeDescription, title, metadata, tags) => {
        set({ isLoading: true });
        try {
          const artifact = await artifactUpdate(
            id,
            content,
            changeDescription,
            title,
            metadata,
            tags,
          );
          set((state) => {
            const newArtifacts = new Map(state.artifacts);
            newArtifacts.set(artifact.id, artifact);
            return { artifacts: newArtifacts, isLoading: false };
          });
          return artifact;
        } catch (error) {
          console.error('Error updating artifact:', error);
          return null;
        } finally {
          set({ isLoading: false });
        }
      },

      rollbackArtifact: async (id, version) => {
        set({ isLoading: true });
        try {
          const artifact = await artifactRollback(id, version);
          set((state) => {
            const newArtifacts = new Map(state.artifacts);
            newArtifacts.set(artifact.id, artifact);
            return { artifacts: newArtifacts, isLoading: false };
          });
          return artifact;
        } catch (error) {
          console.error('Error rolling back artifact:', error);
          return null;
        } finally {
          set({ isLoading: false });
        }
      },

      deleteArtifact: async (id) => {
        try {
          await artifactDelete(id);
          set((state) => {
            const newArtifacts = new Map(state.artifacts);
            newArtifacts.delete(id);
            return {
              artifacts: newArtifacts,
              summaries: state.summaries.filter((summary) => summary.id !== id),
            };
          });
          return true;
        } catch (error) {
          console.error('Error deleting artifact:', error);
          return false;
        }
      },

      archiveArtifact: async (id) => {
        try {
          await artifactArchive(id);
          set((state) => withArtifactStatus(state, id, 'archived'));
          return true;
        } catch (error) {
          console.error('Error archiving artifact:', error);
          return false;
        }
      },

      unarchiveArtifact: async (id) => {
        try {
          await artifactUnarchive(id);
          set((state) => withArtifactStatus(state, id, 'complete'));
          return true;
        } catch (error) {
          console.error('Error unarchiving artifact:', error);
          return false;
        }
      },

      pinArtifact: async (id, pinned) => {
        try {
          await artifactPin(id, pinned);
          set((state) => {
            const artifact = state.artifacts.get(id);
            if (artifact) {
              const newArtifacts = new Map(state.artifacts);
              newArtifacts.set(id, { ...artifact, pinned });
              return { artifacts: newArtifacts };
            }
            return state;
          });
          return true;
        } catch (error) {
          console.error('Error pinning artifact:', error);
          return false;
        }
      },

      listPersistedArtifacts: async (conversationId, limit) => {
        set({ isLoading: true });
        try {
          const summaries = await artifactListPersisted(conversationId, limit);
          set({ summaries, summariesError: null, isLoading: false });
          return summaries;
        } catch (error) {
          console.error('Error listing persisted artifacts:', error);
          // Returning [] without saying so renders the empty state, which
          // tells someone who has artifacts that they have none.
          set({
            summariesError:
              error instanceof Error ? error.message : 'Could not load your artifacts.',
            isLoading: false,
          });
          return [];
        }
      },

      updateArtifactDraft: (draft) => set({ draft: { ...draft } }),

      finalizeArtifactDraft: () => set((state) => (state.draft ? { draft: null } : state)),

      discardArtifactDraft: (key) =>
        set((state) => {
          if (!state.draft) return state;
          if (key !== undefined && state.draft.key !== key) return state;
          return { draft: null };
        }),

      resetOnLogout: () =>
        set({
          artifacts: new Map(),
          summaries: [],
          isLoading: false,
          draft: null,
        }),
    }),
    { name: 'ArtifactStore', enabled: import.meta.env.DEV },
  ),
);
