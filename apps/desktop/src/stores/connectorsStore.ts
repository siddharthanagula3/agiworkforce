import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { invoke } from '@/lib/tauri-mock';
import { CONNECTORS } from '../components/Connectors/connectorDefinitions';

interface ConnectorsState {
  connectedIds: string[];
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  /** IDs of connectors waiting for OAuth callback */
  pendingOAuth: Record<string, boolean>;

  connect: (id: string) => Promise<void>;
  connectWithApiKey: (id: string, apiKey: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  fetchConnected: () => Promise<void>;
  /** Called after OAuth callback succeeds — marks connector as connected + activates MCP */
  completeOAuth: (id: string) => Promise<void>;
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
        pendingOAuth: {},

        connect: async (id: string) => {
          set((state) => ({
            loading: { ...state.loading, [id]: true },
            error: { ...state.error, [id]: null },
          }));
          try {
            const connector = CONNECTORS.find((c) => c.id === id);
            const authType = connector?.authType ?? 'oauth';

            switch (authType) {
              case 'oauth':
                // Start OAuth flow — opens browser. Do NOT mark connected yet.
                // The connector will be marked connected when completeOAuth() is
                // called after the OAuth callback succeeds.
                await invoke('mcp_oauth_start', { provider: id });
                set((state) => ({
                  loading: { ...state.loading, [id]: false },
                  pendingOAuth: { ...state.pendingOAuth, [id]: true },
                }));
                return; // Early return — don't mark connected
              case 'api_key':
                await invoke('mcp_connect_connector', { connectorId: id });
                break;
              case 'mcp_remote':
                await invoke('mcp_connect_connector', { connectorId: id });
                break;
              case 'none':
                break;
            }

            set((state) => ({
              connectedIds: [...new Set([...state.connectedIds, id])],
              loading: { ...state.loading, [id]: false },
            }));
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            set((state) => ({
              loading: { ...state.loading, [id]: false },
              error: { ...state.error, [id]: message },
            }));
            throw err;
          }
        },

        connectWithApiKey: async (id: string, apiKey: string) => {
          set((state) => ({
            loading: { ...state.loading, [id]: true },
            error: { ...state.error, [id]: null },
          }));
          try {
            await invoke('save_api_key', { provider: id, key: apiKey });
            await invoke('mcp_connect_connector', { connectorId: id });
            set((state) => ({
              connectedIds: [...new Set([...state.connectedIds, id])],
              loading: { ...state.loading, [id]: false },
            }));
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            set((state) => ({
              loading: { ...state.loading, [id]: false },
              error: { ...state.error, [id]: message },
            }));
            throw err;
          }
        },

        disconnect: async (id: string) => {
          set((state) => ({
            loading: { ...state.loading, [id]: true },
            error: { ...state.error, [id]: null },
          }));
          try {
            await invoke('mcp_oauth_disconnect', { provider: id });
            set((state) => ({
              connectedIds: state.connectedIds.filter((cid) => cid !== id),
              loading: { ...state.loading, [id]: false },
              pendingOAuth: { ...state.pendingOAuth, [id]: false },
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

        completeOAuth: async (id: string) => {
          set((state) => ({
            loading: { ...state.loading, [id]: true },
            pendingOAuth: { ...state.pendingOAuth, [id]: false },
          }));
          try {
            // OAuth tokens are already stored by the callback handler.
            // Now activate the MCP server with those credentials.
            await invoke('mcp_connect_connector', { connectorId: id });
            set((state) => ({
              connectedIds: [...new Set([...state.connectedIds, id])],
              loading: { ...state.loading, [id]: false },
            }));
          } catch {
            // MCP server might not exist for this connector — still mark connected
            // since the OAuth tokens are stored and available for other uses.
            set((state) => ({
              connectedIds: [...new Set([...state.connectedIds, id])],
              loading: { ...state.loading, [id]: false },
            }));
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
      {
        name: 'connectors-store',
        version: 3,
        migrate: (persistedState, version) => {
          if (version < 3) {
            return {
              ...(persistedState as object),
              connectedIds: [],
              loading: {},
              error: {},
              pendingOAuth: {},
            };
          }
          return persistedState as ConnectorsState;
        },
      },
    ),
    { name: 'ConnectorsStore' },
  ),
);
