// TODO(task-1.3): migrate to packages/runtime/state (see AppStateStore.ts domain mapping)
/**
 * Image Gallery Store
 *
 * Manages the dedicated Images page: persisted gallery history, active style
 * preset selection, and generation-in-progress state. All image entries are
 * stored in localStorage via Zustand persist so they survive app restarts.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// =============================================================================
// Types
// =============================================================================

export interface ImageEntry {
  id: string;
  url: string;
  prompt: string;
  style: string;
  timestamp: number;
  width?: number;
  height?: number;
}

export type ImageStyleId =
  | 'photorealistic'
  | 'illustration'
  | 'watercolor'
  | 'pixel-art'
  | 'anime'
  | 'oil-painting'
  | 'minimalist'
  | '3d-render';

// =============================================================================
// Store State
// =============================================================================

interface ImageGalleryState {
  images: ImageEntry[];
  selectedStyle: ImageStyleId;
  isGenerating: boolean;

  // Actions
  addImage: (entry: ImageEntry) => void;
  removeImage: (id: string) => void;
  setStyle: (style: ImageStyleId) => void;
  setGenerating: (generating: boolean) => void;
  clearAll: () => void;
}

// =============================================================================
// Store Implementation
// =============================================================================

export const useImageGalleryStore = create<ImageGalleryState>()(
  devtools(
    persist(
      (set) => ({
        images: [],
        selectedStyle: 'photorealistic',
        isGenerating: false,

        addImage: (entry) => set((state) => ({ images: [entry, ...state.images] })),

        removeImage: (id) =>
          set((state) => ({ images: state.images.filter((img) => img.id !== id) })),

        setStyle: (style) => set({ selectedStyle: style }),

        setGenerating: (generating) => set({ isGenerating: generating }),

        clearAll: () => set({ images: [] }),
      }),
      {
        name: 'image-gallery-store',
        version: 1,
        partialize: (state) => ({
          images: state.images,
          selectedStyle: state.selectedStyle,
        }),
      },
    ),
    { name: 'ImageGalleryStore', enabled: import.meta.env.DEV },
  ),
);
