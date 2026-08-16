// TODO(task-1.3): migrate to packages/client/client-runtime/state (see AppStateStore.ts domain mapping)

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { applyDiff } from '@/lib/diffUtils';
import {
  artifactCreate,
  artifactCreateStreaming,
  artifactAppendStreaming,
  artifactFinalizeStreaming,
  artifactGet,
  artifactGetRendered,
  artifactUpdate,
  artifactApplyDiff,
  artifactRollback,
  artifactDelete,
  artifactArchive,
  artifactUnarchive,
  artifactPin,
  artifactAddTags,
  artifactRemoveTags,
  artifactList,
  artifactGetByConversation,
  artifactGetVersions,
  artifactGetDiff,
  artifactGetStats,
  artifactExportAll,
  artifactImportAll,
  artifactClearAll,
  artifactListPersisted,
} from '@/api/artifacts';

export type {
  ArtifactType,
  ArtifactStatus,
  CodeMetadata,
  DocumentMetadata,
  TocEntry,
  SpreadsheetMetadata,
  DiagramMetadata,
  WebMetadata,
  ChartMetadata,
  ArtifactMetadata,
  ArtifactVersion,
  Artifact,
  ArtifactSummary,
  VersionDiff,
  ArtifactStoreStats,
  ArtifactAction,
  RenderedArtifact,
  VersionInfo,
  RenderedContent,
  CodeRenderData,
  DocumentRenderData,
  SpreadsheetRenderData,
  ColumnInfo,
  DiagramRenderData,
  WebRenderData,
  ChartRenderData,
  PresentationRenderData,
  SlideData,
  ImageRenderData,
  ArtifactDiffHunk,
  ArtifactListFilter,
} from '@/api/artifacts';

import type {
  ArtifactType,
  ArtifactStatus,
  ArtifactMetadata,
  ArtifactVersion,
  Artifact,
  ArtifactSummary,
  VersionDiff,
  ArtifactStoreStats,
  RenderedArtifact,
  ArtifactListFilter,
} from '@/api/artifacts';

export interface ArtifactDiff {
  hunks: Array<{
    startLine: number;
    endLine: number;
    originalContent: string;
    newContent: string;
  }>;
  changeDescription?: string;
}

export interface ArtifactDraft {
  key: string;
  title: string | null;
  artifactType: string | null;
  content: string;
  language: string | null;
  complete: boolean;
  openedPanel: boolean;
}

interface ArtifactStoreState {
  artifacts: Map<string, Artifact>;
  summaries: ArtifactSummary[];

  activeArtifactId: string | null;
  selectedVersion: number | null;

  panelOpen: boolean;
  panelWidth: number;

  isLoading: boolean;
  isStreaming: string | null;

  draft: ArtifactDraft | null;

  createArtifact: (
    title: string,
    artifactType: ArtifactType,
    content: string,
    metadata?: ArtifactMetadata,
    conversationId?: number,
    messageId?: number,
    tags?: string[],
  ) => Promise<Artifact | null>;

  createStreamingArtifact: (
    title: string,
    artifactType: ArtifactType,
    metadata?: ArtifactMetadata,
    conversationId?: number,
    messageId?: number,
  ) => Promise<Artifact | null>;

  appendStreamingContent: (id: string, delta: string) => Promise<void>;
  finalizeStreamingArtifact: (id: string, changeDescription?: string) => Promise<Artifact | null>;

  getArtifact: (id: string) => Promise<Artifact | null>;
  getRenderedArtifact: (id: string) => Promise<RenderedArtifact | null>;

  updateArtifact: (
    id: string,
    content: string,
    changeDescription?: string,
    title?: string,
    metadata?: ArtifactMetadata,
    tags?: string[],
  ) => Promise<Artifact | null>;

  applyDiffToArtifact: (id: string, diff: ArtifactDiff) => Promise<Artifact | null>;

  rollbackArtifact: (id: string, version: number) => Promise<Artifact | null>;
  deleteArtifact: (id: string) => Promise<boolean>;
  archiveArtifact: (id: string) => Promise<boolean>;
  unarchiveArtifact: (id: string) => Promise<boolean>;
  pinArtifact: (id: string, pinned: boolean) => Promise<boolean>;
  addTags: (id: string, tags: string[]) => Promise<boolean>;
  removeTags: (id: string, tags: string[]) => Promise<boolean>;

  listArtifacts: (filter?: ArtifactListFilter) => Promise<ArtifactSummary[]>;

  getArtifactsByConversation: (conversationId: number) => Promise<ArtifactSummary[]>;
  listPersistedArtifacts: (conversationId?: string, limit?: number) => Promise<ArtifactSummary[]>;
  getVersionHistory: (id: string) => Promise<ArtifactVersion[] | null>;
  getVersionDiff: (
    id: string,
    fromVersion: number,
    toVersion: number,
  ) => Promise<VersionDiff | null>;
  getStats: () => Promise<ArtifactStoreStats | null>;

  setActiveArtifact: (id: string | null) => void;
  setSelectedVersion: (version: number | null) => void;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  setPanelWidth: (width: number) => void;

  updateArtifactDraft: (draft: Omit<ArtifactDraft, 'openedPanel'>) => void;
  finalizeArtifactDraft: (artifactId: string) => void;
  discardArtifactDraft: (key?: string) => void;

  clearAllArtifacts: () => Promise<boolean>;
  exportAllArtifacts: () => Promise<Artifact[] | null>;
  importAllArtifacts: (artifacts: Artifact[]) => Promise<boolean>;

  clearCache: () => void;
  resetOnLogout: () => void;
}

export const useArtifactStore = create<ArtifactStoreState>()(
  devtools(
    persist(
      (set, get) => ({
        artifacts: new Map(),
        summaries: [],
        activeArtifactId: null,
        selectedVersion: null,
        panelOpen: false,
        panelWidth: 480,
        isLoading: false,
        isStreaming: null,
        draft: null,

        createArtifact: async (
          title,
          artifactType,
          content,
          metadata,
          conversationId,
          messageId,
          tags,
        ) => {
          set({ isLoading: true });
          try {
            const artifact = await artifactCreate(
              title,
              artifactType,
              content,
              metadata,
              conversationId,
              messageId,
              tags,
            );
            set((state) => {
              const newArtifacts = new Map(state.artifacts);
              newArtifacts.set(artifact.id, artifact);
              return { artifacts: newArtifacts, isLoading: false };
            });
            return artifact;
          } catch (error) {
            console.error('Error creating artifact:', error);
            return null;
          } finally {
            set({ isLoading: false });
          }
        },

        createStreamingArtifact: async (
          title,
          artifactType,
          metadata,
          conversationId,
          messageId,
        ) => {
          try {
            const artifact = await artifactCreateStreaming(
              title,
              artifactType,
              metadata,
              conversationId,
              messageId,
            );
            set((state) => {
              const newArtifacts = new Map(state.artifacts);
              newArtifacts.set(artifact.id, artifact);
              return { artifacts: newArtifacts, isStreaming: artifact.id };
            });
            return artifact;
          } catch (error) {
            console.error('Error creating streaming artifact:', error);
            return null;
          }
        },

        appendStreamingContent: async (id, delta) => {
          try {
            await artifactAppendStreaming(id, delta);

            set((state) => {
              const artifact = state.artifacts.get(id);
              if (artifact) {
                const newArtifacts = new Map(state.artifacts);
                newArtifacts.set(id, {
                  ...artifact,
                  content: artifact.content + delta,
                });
                return { artifacts: newArtifacts };
              }
              return state;
            });
          } catch (error) {
            console.error('Error appending streaming content:', error);
          }
        },

        finalizeStreamingArtifact: async (id, changeDescription) => {
          try {
            const artifact = await artifactFinalizeStreaming(id, changeDescription);
            set((state) => {
              const newArtifacts = new Map(state.artifacts);
              newArtifacts.set(artifact.id, artifact);
              return { artifacts: newArtifacts, isStreaming: null };
            });
            return artifact;
          } catch (error) {
            console.error('Error finalizing streaming artifact:', error);
            set({ isStreaming: null });
            return null;
          }
        },

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

        getRenderedArtifact: async (id) => {
          try {
            return await artifactGetRendered(id);
          } catch (error) {
            console.error('Error getting rendered artifact:', error);
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

        applyDiffToArtifact: async (id, diff) => {
          set({ isLoading: true });
          try {
            try {
              const artifact = await artifactApplyDiff(id, diff.hunks, diff.changeDescription);
              set((state) => {
                const newArtifacts = new Map(state.artifacts);
                newArtifacts.set(artifact.id, artifact);
                return { artifacts: newArtifacts, isLoading: false };
              });
              return artifact;
            } catch {
              // Command not yet registered — apply the diff locally and call artifact_update
            }

            const cached = get().artifacts.get(id);
            if (!cached) {
              return null;
            }

            const newContent = applyDiff(cached.content, diff);
            return get().updateArtifact(id, newContent, diff.changeDescription);
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
                activeArtifactId: state.activeArtifactId === id ? null : state.activeArtifactId,
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
            set((state) => {
              const artifact = state.artifacts.get(id);
              if (artifact) {
                const newArtifacts = new Map(state.artifacts);
                newArtifacts.set(id, { ...artifact, status: 'archived' as ArtifactStatus });
                return { artifacts: newArtifacts };
              }
              return state;
            });
            return true;
          } catch (error) {
            console.error('Error archiving artifact:', error);
            return false;
          }
        },

        unarchiveArtifact: async (id) => {
          try {
            await artifactUnarchive(id);
            set((state) => {
              const artifact = state.artifacts.get(id);
              if (artifact) {
                const newArtifacts = new Map(state.artifacts);
                newArtifacts.set(id, { ...artifact, status: 'complete' as ArtifactStatus });
                return { artifacts: newArtifacts };
              }
              return state;
            });
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

        addTags: async (id, tags) => {
          try {
            await artifactAddTags(id, tags);
            await get().getArtifact(id);
            return true;
          } catch (error) {
            console.error('Error adding tags:', error);
            return false;
          }
        },

        removeTags: async (id, tags) => {
          try {
            await artifactRemoveTags(id, tags);
            await get().getArtifact(id);
            return true;
          } catch (error) {
            console.error('Error removing tags:', error);
            return false;
          }
        },

        listArtifacts: async (filter) => {
          set({ isLoading: true });
          try {
            const summaries = await artifactList(filter);
            set({ summaries, isLoading: false });
            return summaries;
          } catch (error) {
            console.error('Error listing artifacts:', error);
            return [];
          } finally {
            set({ isLoading: false });
          }
        },

        getArtifactsByConversation: async (conversationId) => {
          try {
            return await artifactGetByConversation(conversationId);
          } catch (error) {
            console.error('Error getting artifacts by conversation:', error);
            return [];
          }
        },

        listPersistedArtifacts: async (conversationId, limit) => {
          try {
            const summaries = await artifactListPersisted(conversationId, limit);
            set({ summaries });
            return summaries;
          } catch (error) {
            console.error('Error listing persisted artifacts:', error);
            return [];
          }
        },

        getVersionHistory: async (id) => {
          try {
            return await artifactGetVersions(id);
          } catch (error) {
            console.error('Error getting version history:', error);
            return null;
          }
        },

        getVersionDiff: async (id, fromVersion, toVersion) => {
          try {
            return await artifactGetDiff(id, fromVersion, toVersion);
          } catch (error) {
            console.error('Error getting version diff:', error);
            return null;
          }
        },

        getStats: async () => {
          try {
            return await artifactGetStats();
          } catch (error) {
            console.error('Error getting stats:', error);
            return null;
          }
        },

        setActiveArtifact: (id) => set({ activeArtifactId: id, selectedVersion: null }),
        setSelectedVersion: (version) => set({ selectedVersion: version }),
        openPanel: () => set({ panelOpen: true }),
        closePanel: () => set({ panelOpen: false }),
        togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
        setPanelWidth: (width) => set({ panelWidth: width }),

        updateArtifactDraft: (draft) =>
          set((state) => {
            const isSameDraft = state.draft?.key === draft.key;
            const openedPanel = isSameDraft
              ? (state.draft?.openedPanel ?? false)
              : !state.panelOpen;
            return {
              draft: {
                key: draft.key,
                title: draft.title,
                artifactType: draft.artifactType,
                content: draft.content,
                language: draft.language,
                complete: draft.complete,
                openedPanel,
              },
              panelOpen: true,
            };
          }),

        finalizeArtifactDraft: (artifactId) =>
          set((state) =>
            state.draft
              ? { draft: null, activeArtifactId: artifactId, selectedVersion: null }
              : state,
          ),

        discardArtifactDraft: (key) =>
          set((state) => {
            if (!state.draft) return state;
            if (key !== undefined && state.draft.key !== key) return state;
            return {
              draft: null,
              panelOpen: state.draft.openedPanel ? false : state.panelOpen,
            };
          }),

        clearAllArtifacts: async () => {
          set({ isLoading: true });
          try {
            await artifactClearAll();
            set({ artifacts: new Map(), summaries: [], isLoading: false });
            return true;
          } catch (error) {
            console.error('Error clearing all artifacts:', error);
            return false;
          } finally {
            set({ isLoading: false });
          }
        },

        exportAllArtifacts: async () => {
          try {
            return await artifactExportAll();
          } catch (error) {
            console.error('Error exporting artifacts:', error);
            return null;
          }
        },

        importAllArtifacts: async (artifacts) => {
          set({ isLoading: true });
          try {
            await artifactImportAll(artifacts);
            const summaries = await artifactList();
            set({ summaries, isLoading: false });
            return true;
          } catch (error) {
            console.error('Error importing artifacts:', error);
            return false;
          } finally {
            set({ isLoading: false });
          }
        },

        clearCache: () => set({ artifacts: new Map(), summaries: [] }),
        resetOnLogout: () =>
          set({
            artifacts: new Map(),
            summaries: [],
            activeArtifactId: null,
            selectedVersion: null,
            panelOpen: false,
            isLoading: false,
            isStreaming: null,
            draft: null,
          }),
      }),
      {
        name: 'artifact-store',
        version: 1,
        partialize: (state) => ({
          panelWidth: state.panelWidth,
        }),
      },
    ),
    { name: 'ArtifactStore', enabled: import.meta.env.DEV },
  ),
);
