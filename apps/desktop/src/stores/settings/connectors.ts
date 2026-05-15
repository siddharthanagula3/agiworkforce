import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { McpClient } from '@/api/mcp';
import { CONNECTORS } from '@/components/Connectors/connectorDefinitions';

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

interface ConnectorsState {
  connectedIds: string[];
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  pendingOAuth: Record<string, boolean>;
  oauthStartedAt: Record<string, number>;
  _oauthTimers: Record<string, ReturnType<typeof setTimeout>>;

  connect: (id: string) => Promise<void>;
  connectWithApiKey: (id: string, apiKey: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  fetchConnected: () => Promise<void>;
  completeOAuth: (id: string) => Promise<void>;
  timeoutOAuth: (id: string) => void;
  isConnected: (id: string) => boolean;
  isLoading: (id: string) => boolean;
  getError: (id: string) => string | null;
  clearError: (id: string) => void;
  clearAllTimers: () => void;
  resetOnLogout: () => void;
}

export const useConnectorsStore = create<ConnectorsState>()(
  devtools(
    persist(
      (set, get) => ({
        connectedIds: [],
        loading: {},
        error: {},
        pendingOAuth: {},
        oauthStartedAt: {},
        _oauthTimers: {},

        connect: async (id) => {
          set((state) => ({
            loading: { ...state.loading, [id]: true },
            error: { ...state.error, [id]: null },
          }));
          try {
            const connector = CONNECTORS.find((c) => c.id === id);
            const authType = connector?.authType ?? 'oauth';
            switch (authType) {
              case 'oauth': {
                await McpClient.oauthStartRaw(id);
                const now = Date.now();
                const timerId = setTimeout(() => {
                  get().timeoutOAuth(id);
                }, OAUTH_TIMEOUT_MS);
                set((state) => ({
                  loading: { ...state.loading, [id]: false },
                  pendingOAuth: { ...state.pendingOAuth, [id]: true },
                  oauthStartedAt: { ...state.oauthStartedAt, [id]: now },
                  _oauthTimers: { ...state._oauthTimers, [id]: timerId },
                }));
                return;
              }
              case 'api_key':
                await McpClient.connectConnector(id);
                break;
              case 'mcp_remote':
                await McpClient.connectConnector(id);
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

        connectWithApiKey: async (id, apiKey) => {
          set((state) => ({
            loading: { ...state.loading, [id]: true },
            error: { ...state.error, [id]: null },
          }));
          try {
            await McpClient.saveApiKey(id, apiKey);
            await McpClient.connectConnector(id);
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

        disconnect: async (id) => {
          set((state) => ({
            loading: { ...state.loading, [id]: true },
            error: { ...state.error, [id]: null },
          }));
          try {
            await McpClient.oauthDisconnectRaw(id);
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
            const providers = await McpClient.listConnectedProviders();
            set({ connectedIds: providers });
          } catch {
            /* silently fail */
          }
        },

        completeOAuth: async (id) => {
          const timerId = get()._oauthTimers[id];
          if (timerId !== undefined) clearTimeout(timerId);
          set((state) => ({
            loading: { ...state.loading, [id]: true },
            pendingOAuth: { ...state.pendingOAuth, [id]: false },
            oauthStartedAt: { ...state.oauthStartedAt, [id]: 0 },
            _oauthTimers: {
              ...state._oauthTimers,
              [id]: undefined as unknown as ReturnType<typeof setTimeout>,
            },
          }));
          try {
            await McpClient.connectConnector(id);
            const providers = await McpClient.listConnectedProviders().catch(() => [] as string[]);
            if (!providers.includes(id))
              console.warn(
                `[ConnectorsStore] MCP server for "${id}" not active after OAuth — marking connected anyway (tokens stored)`,
              );
            set((state) => ({
              connectedIds: [...new Set([...state.connectedIds, id])],
              loading: { ...state.loading, [id]: false },
            }));
          } catch {
            set((state) => ({
              connectedIds: [...new Set([...state.connectedIds, id])],
              loading: { ...state.loading, [id]: false },
            }));
          }
        },

        timeoutOAuth: (id) => {
          set((state) => ({
            pendingOAuth: { ...state.pendingOAuth, [id]: false },
            loading: { ...state.loading, [id]: false },
            error: {
              ...state.error,
              [id]: 'Authorization timed out. Please try connecting again.',
            },
            oauthStartedAt: { ...state.oauthStartedAt, [id]: 0 },
          }));
        },
        isConnected: (id) => get().connectedIds.includes(id),
        isLoading: (id) => Boolean(get().loading[id]),
        getError: (id) => get().error[id] ?? null,
        clearError: (id) => {
          set((state) => ({ error: { ...state.error, [id]: null } }));
        },
        clearAllTimers: () => {
          const timers = get()._oauthTimers;
          for (const timerId of Object.values(timers)) {
            if (timerId !== undefined) clearTimeout(timerId);
          }
          set({ _oauthTimers: {} });
        },
        resetOnLogout: () => {
          get().clearAllTimers();
          set({
            connectedIds: [],
            loading: {},
            error: {},
            pendingOAuth: {},
            oauthStartedAt: {},
            _oauthTimers: {},
          });
        },
      }),
      {
        name: 'connectors-store',
        version: 4,
        migrate: (persistedState, version) => {
          if (version < 3)
            return {
              ...(persistedState as object),
              connectedIds: [],
              loading: {},
              error: {},
              pendingOAuth: {},
              oauthStartedAt: {},
              _oauthTimers: {},
            };
          if (version < 4)
            return { ...(persistedState as ConnectorsState), oauthStartedAt: {}, _oauthTimers: {} };
          return persistedState as ConnectorsState;
        },
        partialize: (state) => ({
          connectedIds: state.connectedIds,
          loading: state.loading,
          error: state.error,
          pendingOAuth: state.pendingOAuth,
          oauthStartedAt: state.oauthStartedAt,
        }),
      },
    ),
    { name: 'ConnectorsStore' },
  ),
);
