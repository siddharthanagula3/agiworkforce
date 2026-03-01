import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { invoke } from '@/lib/tauri-mock';

interface ConnectorsState {
  connectedIds: string[];
  loading: Record<string, boolean>;
  error: Record<string, string | null>;

  connect: (id: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  fetchConnected: () => Promise<void>;
  isConnected: (id: string) => boolean;
  isLoading: (id: string) => boolean;
  getError: (id: string) => string | null;
  clearError: (id: string) => void;
}

export const useConnectorsStore = create<ConnectorsState>()(
  devtools(
    persist(
      (set, get) => ({
        connectedIds: [],
        loading: {},
        error: {},

        connect: async (id: string) => {
          set((state) => ({
            loading: { ...state.loading, [id]: true },
            error: { ...state.error, [id]: null },
          }));
          try {
            await invoke('mcp_oauth_start', { provider: id });
            set((state) => ({
              connectedIds: state.connectedIds.includes(id)
                ? state.connectedIds
                : [...state.connectedIds, id],
              loading: { ...state.loading, [id]: false },
            }));
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Connection failed';
            set((state) => ({
              loading: { ...state.loading, [id]: false },
              error: { ...state.error, [id]: message },
            }));
          }
        },

        disconnect: async (id: string) => {
          set((state) => ({
            loading: { ...state.loading, [id]: true },
            error: { ...state.error, [id]: null },
          }));
          try {
            await invoke('mcp_oauth_revoke', { provider: id });
            set((state) => ({
              connectedIds: state.connectedIds.filter((cid) => cid !== id),
              loading: { ...state.loading, [id]: false },
            }));
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Disconnection failed';
            set((state) => ({
              loading: { ...state.loading, [id]: false },
              error: { ...state.error, [id]: message },
            }));
          }
        },

        fetchConnected: async () => {
          try {
            const providers = await invoke<string[]>('mcp_list_connected_providers');
            set({ connectedIds: providers });
          } catch {
            // Silently fail — the backend command may not exist yet
          }
        },

        isConnected: (id: string) => get().connectedIds.includes(id),
        isLoading: (id: string) => Boolean(get().loading[id]),
        getError: (id: string) => get().error[id] ?? null,
        clearError: (id: string) => {
          set((state) => ({
            error: { ...state.error, [id]: null },
          }));
        },
      }),
      { name: 'connectors-store', version: 1 },
    ),
    { name: 'ConnectorsStore' },
  ),
);
