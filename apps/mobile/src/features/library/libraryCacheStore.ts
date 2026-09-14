import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import type { LibraryAsset } from './libraryClient';

interface LibraryCacheState {
  ownerId: string | null;
  assets: LibraryAsset[];
  rememberLibraryPage: (ownerId: string, assets: LibraryAsset[]) => void;
  readLibraryPage: (ownerId: string | null) => LibraryAsset[] | null;
  clearLibraryCache: () => void;
}

export const useLibraryCacheStore = create<LibraryCacheState>()(
  persist(
    (set, get) => ({
      ownerId: null,
      assets: [],

      rememberLibraryPage: (ownerId, assets) => set({ ownerId, assets }),

      readLibraryPage: (ownerId) => {
        const state = get();
        if (!ownerId || state.ownerId !== ownerId || state.assets.length === 0) return null;
        return state.assets;
      },

      clearLibraryCache: () => set({ ownerId: null, assets: [] }),
    }),
    {
      name: 'library-store-cloud',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[libraryCacheStore] Hydration failed:', error);
      },
      partialize: (state) => ({ ownerId: state.ownerId, assets: state.assets }),
    },
  ),
);

rehydrateWhenMmkvReady(useLibraryCacheStore, 'library-store-cloud');
