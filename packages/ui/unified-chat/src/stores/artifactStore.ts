import { create } from 'zustand';
import type { Artifact } from '../lib/types';

export type ArtifactViewMode = 'preview' | 'code';

interface ArtifactStoreState {
  activeArtifact: Artifact | null;
  viewMode: ArtifactViewMode;

  artifactsByConversation: Record<string, Artifact[]>;

  openArtifact: (artifact: Artifact, preferredViewMode?: ArtifactViewMode) => void;
  closeArtifact: () => void;
  setViewMode: (mode: ArtifactViewMode) => void;
  reset: () => void;

  setArtifacts: (conversationId: string, artifacts: Artifact[]) => void;
  addArtifact: (conversationId: string, artifact: Artifact) => void;
  updateArtifact: (conversationId: string, artifactId: string, patch: Partial<Artifact>) => void;
  removeArtifact: (conversationId: string, artifactId: string) => void;
  clearConversation: (conversationId: string) => void;
}

export function selectArtifacts(state: ArtifactStoreState, conversationId: string): Artifact[] {
  return state.artifactsByConversation[conversationId] ?? [];
}

export function selectActiveArtifact(state: ArtifactStoreState): Artifact | null {
  return state.activeArtifact;
}

export function selectArtifactById(
  state: ArtifactStoreState,
  conversationId: string,
  artifactId: string,
): Artifact | undefined {
  return (state.artifactsByConversation[conversationId] ?? []).find((a) => a.id === artifactId);
}

export const useArtifactStore = create<ArtifactStoreState>((set) => ({
  activeArtifact: null,
  viewMode: 'preview',
  artifactsByConversation: {},

  openArtifact: (artifact, preferredViewMode = 'preview') =>
    set({
      activeArtifact: artifact,
      viewMode: preferredViewMode,
    }),

  closeArtifact: () =>
    set({
      activeArtifact: null,
      viewMode: 'preview',
    }),

  setViewMode: (mode) => set({ viewMode: mode }),

  reset: () =>
    set({
      activeArtifact: null,
      viewMode: 'preview',
      artifactsByConversation: {},
    }),

  setArtifacts: (conversationId, artifacts) =>
    set((state) => ({
      artifactsByConversation: {
        ...state.artifactsByConversation,
        [conversationId]: artifacts,
      },
    })),

  addArtifact: (conversationId, artifact) =>
    set((state) => {
      const existing = state.artifactsByConversation[conversationId] ?? [];
      const idx = existing.findIndex((a) => a.id === artifact.id);
      const next =
        idx >= 0
          ? [...existing.slice(0, idx), artifact, ...existing.slice(idx + 1)]
          : [...existing, artifact];
      return {
        artifactsByConversation: {
          ...state.artifactsByConversation,
          [conversationId]: next,
        },
      };
    }),

  updateArtifact: (conversationId, artifactId, patch) =>
    set((state) => {
      const existing = state.artifactsByConversation[conversationId] ?? [];
      const next = existing.map((a) => (a.id === artifactId ? { ...a, ...patch } : a));
      return {
        artifactsByConversation: {
          ...state.artifactsByConversation,
          [conversationId]: next,
        },
      };
    }),

  removeArtifact: (conversationId, artifactId) =>
    set((state) => {
      const existing = state.artifactsByConversation[conversationId] ?? [];
      return {
        artifactsByConversation: {
          ...state.artifactsByConversation,
          [conversationId]: existing.filter((a) => a.id !== artifactId),
        },
      };
    }),

  clearConversation: (conversationId) =>
    set((state) => {
      const { [conversationId]: _removed, ...rest } = state.artifactsByConversation;
      return { artifactsByConversation: rest };
    }),
}));
