import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { McpClient } from '@/api/mcp';
import { CONNECTORS } from '../components/Connectors/connectorDefinitions';

/** Duration (ms) before a pending OAuth flow is treated as timed out */
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface ConnectorsState {
  connectedIds: string[];
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  /** IDs of connectors waiting for OAuth callback */
  pendingOAuth: Record<string, boolean>;
  /** Timestamp (ms) when each pending OAuth flow was started */
  oauthStartedAt: Record<string, number>;
  /** Timer IDs for OAuth timeouts, keyed by connector ID */
  _oauthTimers: Record<string, ReturnType<typeof setTimeout>>;

  connect: (id: string) => Promise<void>;
  connectWithApiKey: (id: string, apiKey: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  fetchConnected: () => Promise<void>;
  /** Called after OAuth callback succeeds — marks connector as connected + activates MCP */
  completeOAuth: (id: string) => Promise<void>;
  /** Called when the OAuth flow times out — marks connector as failed */
  timeoutOAuth: (id: string) => void;
  isConnected: (id: string) => boolean;
  isLoading: (id: string) => boolean;
  getError: (id: string) => string | null;
  clearError: (id: string) => void;
  /** Clears all pending OAuth timeout timers to prevent leaks */
  clearAllTimers: () => void;
  /** Full reset for logout — clears timers, state, and persisted data */
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

        connect: async (id: string) => {
          set((state) => ({
            loading: { ...state.loading, [id]: true },
            error: { ...state.error, [id]: null },
          }));
          try {
            const connector = CONNECTORS.find((c) => c.id === id);
            const authType = connector?.authType ?? 'oauth';

            switch (authType) {
              case 'oauth': {
                // Start OAuth flow — opens browser. Do NOT mark connected yet.
                // The connector will be marked connected when completeOAuth() is
                // called after the OAuth callback succeeds.
                await McpClient.oauthStartRaw(id);
                const now = Date.now();
                // Schedule an automatic timeout to clean up stale OAuth flows
                const timerId = setTimeout(() => {
                  get().timeoutOAuth(id);
                }, OAUTH_TIMEOUT_MS);
                set((state) => ({
                  loading: { ...state.loading, [id]: false },
                  pendingOAuth: { ...state.pendingOAuth, [id]: true },
                  oauthStartedAt: { ...state.oauthStartedAt, [id]: now },
                  _oauthTimers: { ...state._oauthTimers, [id]: timerId },
                }));
                return; // Early return — don't mark connected
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

        connectWithApiKey: async (id: string, apiKey: string) => {
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

        disconnect: async (id: string) => {
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
            // Silently fail — the backend command may not exist yet
          }
        },

        completeOAuth: async (id: string) => {
          // Clear the timeout timer — OAuth completed in time
          const timerId = get()._oauthTimers[id];
          if (timerId !== undefined) {
            clearTimeout(timerId);
          }
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
            // OAuth tokens are already stored by the callback handler.
            // Now activate the MCP server with those credentials.
            await McpClient.connectConnector(id);
            // Verify the MCP server actually activated by checking connected providers
            const providers = await McpClient.listConnectedProviders().catch(() => [] as string[]);
            const mcpActive = providers.includes(id);
            if (!mcpActive) {
              console.warn(
                `[ConnectorsStore] MCP server for "${id}" not active after OAuth — marking connected anyway (tokens stored)`,
              );
            }
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

        timeoutOAuth: (id: string) => {
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

        isConnected: (id: string) => get().connectedIds.includes(id),
        isLoading: (id: string) => Boolean(get().loading[id]),
        getError: (id: string) => get().error[id] ?? null,
        clearError: (id: string) => {
          set((state) => ({
            error: { ...state.error, [id]: null },
          }));
        },

        clearAllTimers: () => {
          const timers = get()._oauthTimers;
          for (const timerId of Object.values(timers)) {
            if (timerId !== undefined) {
              clearTimeout(timerId);
            }
          }
          set({ _oauthTimers: {} });
        },

        resetOnLogout: () => {
          // Clear all pending OAuth timers first to prevent leaks
          get().clearAllTimers();
          // Reset all state to defaults
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
          if (version < 3) {
            return {
              ...(persistedState as object),
              connectedIds: [],
              loading: {},
              error: {},
              pendingOAuth: {},
              oauthStartedAt: {},
              _oauthTimers: {},
            };
          }
          if (version < 4) {
            return {
              ...(persistedState as ConnectorsState),
              oauthStartedAt: {},
              _oauthTimers: {},
            };
          }
          return persistedState as ConnectorsState;
        },
        // Do not persist timer IDs — they are runtime-only
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
