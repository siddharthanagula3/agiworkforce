import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';

export interface CloudMemoryEntry {
  id: string;
  content: string;
  category: string | null;
  source: 'mobile' | 'desktop' | 'web' | 'auto';
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  serverVersion?: string;
  isDeleted: boolean;
}

interface CloudMemoryState {
  entries: CloudMemoryEntry[];

  upsertCloudMemory: (entry: CloudMemoryEntry) => void;
  hardDeleteCloudMemory: (id: string) => void;
  applyCloudMemoryDeltas: (deltas: CloudMemoryEntry[]) => void;
  clearCloudMemoryData: () => void;
}

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
      name: 'memory-store-cloud',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[cloudMemoryStore] Hydration failed:', error);
      },
      partialize: (state) => ({
        entries: state.entries,
      }),
    },
  ),
);

rehydrateWhenMmkvReady(useCloudMemoryStore, 'memory-store-cloud');
