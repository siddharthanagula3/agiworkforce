import { create } from 'zustand';
import type { Artifact } from '../lib/types';

export type ArtifactViewMode = 'preview' | 'code';

interface ArtifactStoreState {
  activeArtifact: Artifact | null;
  viewMode: ArtifactViewMode;
  openArtifact: (artifact: Artifact, preferredViewMode?: ArtifactViewMode) => void;
  closeArtifact: () => void;
  setViewMode: (mode: ArtifactViewMode) => void;
  reset: () => void;
}

export const useArtifactStore = create<ArtifactStoreState>((set) => ({
  activeArtifact: null,
  viewMode: 'preview',

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
    }),
}));
