// TODO(task-1.3): migrate to packages/client/client-runtime/state (see AppStateStore.ts domain mapping)
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { McpClient } from '@/api/mcp';
import { CONNECTORS } from '../features/connectors/connectorDefinitions';

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

export const FALLBACK_SUPPORTED_CONNECTOR_IDS: string[] = [
  'github',
  'slack',
  'google_drive',
  'figma',
  'stripe',
  'vercel',
  'sentry',
  'linear',
  'notion',
  'cloudflare',
  'gmail',
  'google_calendar',
  'outlook',
  'jira',
];

const CONNECTORS_PERSIST_KEY = 'agiworkforce-connectors-store';
const LEGACY_SHARED_PERSIST_KEY = 'connectors-store';

/**
 * One-time move of the pre-rename payload onto {@link CONNECTORS_PERSIST_KEY},
 * so an upgrade does not blank the connector list on first paint. Runs before
 * `create()` because persist rehydrates during store construction. The legacy
 * entry is left in place, the duplicate store still owns it.
 */
function adoptLegacyPersistedState(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (window.localStorage.getItem(CONNECTORS_PERSIST_KEY) !== null) return;
    const legacy = window.localStorage.getItem(LEGACY_SHARED_PERSIST_KEY);
    if (legacy !== null) window.localStorage.setItem(CONNECTORS_PERSIST_KEY, legacy);
  } catch {
    // Storage unavailable (private mode, quota), start from defaults instead.
  }
}

adoptLegacyPersistedState();

interface ConnectorsState {
  connectedIds: string[];
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  pendingOAuth: Record<string, boolean>;
  oauthStartedAt: Record<string, number>;
  _oauthTimers: Record<string, ReturnType<typeof setTimeout>>;
  supportedConnectorIds: string[];

  connect: (id: string) => Promise<void>;
  connectWithApiKey: (id: string, apiKey: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  fetchConnected: () => Promise<void>;
  fetchSupportedConnectorIds: () => Promise<void>;
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
        supportedConnectorIds: FALLBACK_SUPPORTED_CONNECTOR_IDS,

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
              case 'mcp_remote': {
                await McpClient.connectConnector(id);
                const verifiedProviders = await McpClient.listConnectedProviders();
                if (!verifiedProviders.includes(id)) {
                  throw new Error(
                    'AGI could not verify a live MCP connection for this connector, it may not have a supported backend yet.',
                  );
                }
                break;
              }
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
            const verifiedProviders = await McpClient.listConnectedProviders();
            if (!verifiedProviders.includes(id)) {
              throw new Error(
                'AGI could not verify a live MCP connection for this connector, it may not have a supported backend yet.',
              );
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
          } catch (err) {
            const message =
              err instanceof Error ? err.message : 'Failed to load connected providers';
            set((state) => ({ error: { ...state.error, __list: message } }));
          }
        },

        fetchSupportedConnectorIds: async () => {
          try {
            const ids = await McpClient.getSupportedConnectorIds();
            if (Array.isArray(ids) && ids.length > 0) {
              set({ supportedConnectorIds: ids });
            }
          } catch {
            // Best-effort: keep the last-known-good (persisted or fallback)
            // list. Not surfaced as a user-facing error, the grid still
            // renders correctly with the previous value.
          }
        },

        completeOAuth: async (id: string) => {
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
            await McpClient.connectConnector(id);
            const providers = await McpClient.listConnectedProviders();
            if (!providers.includes(id)) {
              const message =
                'Authorization finished, but the MCP connector is not active yet. Refresh MCP Tools or reconnect.';
              set((state) => ({
                loading: { ...state.loading, [id]: false },
                error: { ...state.error, [id]: message },
              }));
              throw new Error(message);
            }
            set((state) => ({
              connectedIds: [...new Set([...state.connectedIds, id])],
              loading: { ...state.loading, [id]: false },
              error: { ...state.error, [id]: null },
            }));
          } catch (err) {
            const message =
              err instanceof Error
                ? err.message
                : 'Authorization finished, but the MCP connector did not activate.';
            set((state) => ({
              loading: { ...state.loading, [id]: false },
              error: { ...state.error, [id]: message },
            }));
            throw err;
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
          get().clearAllTimers();
          set({
            connectedIds: [],
            loading: {},
            error: {},
            pendingOAuth: {},
            oauthStartedAt: {},
            _oauthTimers: {},
            supportedConnectorIds: FALLBACK_SUPPORTED_CONNECTOR_IDS,
          });
        },
      }),
      {
        name: CONNECTORS_PERSIST_KEY,
        version: 8,
        migrate: (persistedState, version) => {
          const incoming =
            version < 8
              ? ({
                  ...(persistedState as object),
                  pendingOAuth: {},
                  oauthStartedAt: {},
                } as ConnectorsState)
              : (persistedState as ConnectorsState);
          if (version < 3) {
            return {
              ...(incoming as object),
              connectedIds: [],
              loading: {},
              error: {},
              _oauthTimers: {},
            } as unknown as ConnectorsState;
          }
          if (version < 4) {
            return {
              ...incoming,
              _oauthTimers: {},
            } as ConnectorsState;
          }
          if (version < 6) {
            return {
              ...incoming,
              supportedConnectorIds: FALLBACK_SUPPORTED_CONNECTOR_IDS,
            } as ConnectorsState;
          }
          if (version < 7) {
            const { connectorPermissions: _dropped, ...rest } = incoming as ConnectorsState & {
              connectorPermissions?: unknown;
            };
            void _dropped;
            return rest as ConnectorsState;
          }
          return incoming;
        },
        partialize: (state) => ({
          connectedIds: state.connectedIds,
          loading: state.loading,
          error: state.error,
          supportedConnectorIds: state.supportedConnectorIds,
        }),
      },
    ),
    { name: 'ConnectorsStore' },
  ),
);
