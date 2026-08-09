// TODO(task-1.3): migrate to packages/client/client-runtime/state (see AppStateStore.ts domain mapping)
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { McpClient } from '@/api/mcp';
import { CONNECTORS } from '../features/connectors/connectorDefinitions';

/** Duration (ms) before a pending OAuth flow is treated as timed out */
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Last-known-good fallback for `supportedConnectorIds`, used only (a) before
 * the store has ever successfully fetched the real backend list, and (b) if
 * a later fetch fails — never overwrite a working value with an empty one.
 * Mirrors `get_connector_mcp_mapping`'s keys in
 * `apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs` as of this fix.
 * Intentionally NOT the full `CONNECTOR_DIRECTORY` catalog — this is a
 * fail-closed default (DESKTOP-CONNECTOR-MAPPING-DRIFT-FAKE-CONNECTED-01):
 * an IPC hiccup should never cause an unsupported connector to reappear as
 * connectable.
 */
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

/**
 * Persist key. It used to be `connectors-store`, which the stale duplicate in
 * `stores/settings/connectors.ts` also claims at version 4. Both modules are
 * evaluated (that one via `settingsStore`'s re-export), so each rehydration
 * overwrote the other's payload: this store kept reading back a v4 blob, ran
 * its `version < 6` migration, and reset `supportedConnectorIds` on every
 * boot. Only this store has UI consumers, so it moved to a private key.
 */
const CONNECTORS_PERSIST_KEY = 'agiworkforce-connectors-store';
const LEGACY_SHARED_PERSIST_KEY = 'connectors-store';

/**
 * One-time move of the pre-rename payload onto {@link CONNECTORS_PERSIST_KEY},
 * so an upgrade does not blank the connector list on first paint. Runs before
 * `create()` because persist rehydrates during store construction. The legacy
 * entry is left in place — the duplicate store still owns it.
 */
function adoptLegacyPersistedState(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (window.localStorage.getItem(CONNECTORS_PERSIST_KEY) !== null) return;
    const legacy = window.localStorage.getItem(LEGACY_SHARED_PERSIST_KEY);
    if (legacy !== null) window.localStorage.setItem(CONNECTORS_PERSIST_KEY, legacy);
  } catch {
    // Storage unavailable (private mode, quota) — start from defaults instead.
  }
}

adoptLegacyPersistedState();

// CON-25: `ConnectorPermState`, `ConnectorPermissions`, the persisted
// `connectorPermissions` map, and the `setToolPermission` / `getToolPermission`
// actions were removed. They had ZERO readers: real per-tool enforcement runs in
// Rust (`enforce_mcp_connector_permission` in core/llm/tool_executor), which
// reads the encrypted vault through the `connector_permission_get` /
// `connector_permission_set` / `connector_permission_list` Tauri commands — it
// never consults this zustand map. Any UI wired to these actions would have
// shown allow/deny toggles that granted and blocked nothing.
//
// Use `getConnectorPermissionStore()` from @agiworkforce/unified-chat, which is
// backed by those Tauri commands.

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
  /**
   * Connector ids the backend actually has a real MCP server mapping for
   * (see `mcp_get_supported_connector_ids`). The "Available to connect"
   * grid filters against this instead of trusting the static frontend
   * catalog, so a connector can never be advertised as connectable without
   * real backend support (DESKTOP-CONNECTOR-MAPPING-DRIFT-FAKE-CONNECTED-01).
   * Persisted so a cold start has a last-known-good value to render before
   * the async fetch resolves.
   */
  supportedConnectorIds: string[];

  connect: (id: string) => Promise<void>;
  connectWithApiKey: (id: string, apiKey: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  fetchConnected: () => Promise<void>;
  /**
   * Refreshes `supportedConnectorIds` from the backend. Only overwrites the
   * current value on success — a failed fetch (offline, IPC error) keeps the
   * last-known-good list rather than collapsing to empty.
   */
  fetchSupportedConnectorIds: () => Promise<void>;
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
              case 'mcp_remote': {
                await McpClient.connectConnector(id);
                // AUDIT-FIX (DESKTOP-CONNECTOR-MAPPING-DRIFT-FAKE-CONNECTED-01):
                // `mcp_connect_connector` silently no-ops (returns Ok with no
                // MCP server spawned) when the backend has no mapping for
                // this connector id. Verify a real, persisted MCP server
                // actually backs it before marking connected — mirrors the
                // same check `completeOAuth` already does for the OAuth flow.
                const verifiedProviders = await McpClient.listConnectedProviders();
                if (!verifiedProviders.includes(id)) {
                  throw new Error(
                    'AGI could not verify a live MCP connection for this connector — it may not have a supported backend yet.',
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
            // AUDIT-FIX (DESKTOP-CONNECTOR-MAPPING-DRIFT-FAKE-CONNECTED-01):
            // verify a real MCP server actually backs this connector before
            // marking it connected — see the same check in `connect()`.
            const verifiedProviders = await McpClient.listConnectedProviders();
            if (!verifiedProviders.includes(id)) {
              throw new Error(
                'AGI could not verify a live MCP connection for this connector — it may not have a supported backend yet.',
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
            // Only overwrite on a successful, well-formed response — an
            // empty/errored fetch must never blank out a previously known
            // set of supported connectors (fail-closed, not fail-empty).
            if (Array.isArray(ids) && ids.length > 0) {
              set({ supportedConnectorIds: ids });
            }
          } catch {
            // Best-effort: keep the last-known-good (persisted or fallback)
            // list. Not surfaced as a user-facing error — the grid still
            // renders correctly with the previous value.
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
            // Verify the MCP server actually activated by checking connected providers.
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
            supportedConnectorIds: FALLBACK_SUPPORTED_CONNECTOR_IDS,
          });
        },
      }),
      {
        name: CONNECTORS_PERSIST_KEY,
        // CON-25: v7 drops the dead `connectorPermissions` map from persisted
        // state so stale allow/deny entries stop being rehydrated on upgrade.
        // v8 drops the in-flight OAuth bookkeeping for the same reason.
        version: 8,
        migrate: (persistedState, version) => {
          // Applied before the version chain below, not as another arm of it:
          // every arm returns early, so a reset placed last would only ever run
          // for a payload stored at v7. Any pre-v8 payload carries in-flight
          // OAuth bookkeeping whose timeout timer died with the process that
          // wrote it, so it has to be cleared whatever version we migrate from.
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
        // Do not persist timer IDs — they are runtime-only. `pendingOAuth` and
        // `oauthStartedAt` track a browser round-trip that cannot outlive the
        // process: the timeout timer that would resolve them lives only in
        // `_oauthTimers`, so a restart used to rehydrate a connector stuck
        // mid-flow with nothing left to time it out. Nothing selects either
        // field today (they are written by `connect`/`completeOAuth`/
        // `timeoutOAuth` and read by no view), which is why they were on the
        // persisted-field-has-reader list — restore them to `partialize` only
        // if a view starts rendering an in-flight flow across restarts.
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
