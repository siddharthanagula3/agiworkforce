/**
 * Connectors store — local MMKV-persisted connected-connector IDs.
 *
 * Connected state is managed locally until FEATURES.connectors is true and
 * the /api/connectors OAuth flow is active. At that point the server becomes
 * the source of truth and this store transitions to a cache layer.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';

interface ConnectorsState {
  /** Set of connected connector IDs (MMKV-persisted) */
  connectedIds: string[];

  isConnected: (id: string) => boolean;
  connect: (id: string) => void;
  disconnect: (id: string) => void;
  toggle: (id: string) => void;
}

export const useConnectorsStore = create<ConnectorsState>()(
  persist(
    (set, get) => ({
      connectedIds: [],

      isConnected: (id) => get().connectedIds.includes(id),

      connect: (id) => {
        if (get().connectedIds.includes(id)) return;
        set((s) => ({ connectedIds: [...s.connectedIds, id] }));
      },

      disconnect: (id) => {
        set((s) => ({ connectedIds: s.connectedIds.filter((c) => c !== id) }));
      },

      toggle: (id) => {
        if (get().connectedIds.includes(id)) {
          set((s) => ({ connectedIds: s.connectedIds.filter((c) => c !== id) }));
        } else {
          set((s) => ({ connectedIds: [...s.connectedIds, id] }));
        }
      },
    }),
    {
      name: 'connectors-store-v1',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[connectorsStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useConnectorsStore, 'connectors-store-v1');
