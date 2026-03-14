# Feature: Connectors

> A gallery-style integration hub that lets users authenticate to 63 external services and automatically activates an MCP stdio server per connector, injecting decrypted credentials at runtime.

## Where It Lives

| Layer | Location |
|-------|----------|
| Frontend Components | `apps/desktop/src/components/Connectors/ConnectorsGallery.tsx` |
| | `apps/desktop/src/components/Connectors/ConnectorCard.tsx` |
| | `apps/desktop/src/components/Connectors/ConnectorOAuthFlow.tsx` |
| | `apps/desktop/src/components/Connectors/ConnectorApiKeyDialog.tsx` |
| | `apps/desktop/src/components/Connectors/connectorDefinitions.ts` |
| Stores | `apps/desktop/src/stores/connectorsStore.ts` (Zustand persist v4) |
| Hooks | `apps/desktop/src/hooks/useDeepLink.ts` |
| API Service Layer | `apps/desktop/src/api/mcp.ts` |
| Rust Commands | `apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs` |
| Rust Core Logic | `apps/desktop/src-tauri/src/core/mcp/config.rs` |
| Cloud Integrations | `apps/desktop/src-tauri/src/integrations/cloud/` |
| API Integrations | `apps/desktop/src-tauri/src/integrations/api_integrations/` |

## Data Flow

### OAuth Path (GitHub, Google, Slack, Notion, Figma, Microsoft, Atlassian)

1. Settings > Connectors tab mounts. `ConnectorsGallery` calls `fetchConnected()`, and `connectorsStore` uses `apps/desktop/src/api/mcp.ts` / `McpClient.listConnectedProviders()` to hydrate `connectedIds` from `settings_v2` in SQLite.

2. User clicks `+` on an OAuth connector. `handleConnectClick` → `connect(id)` in store.

3. Store detects `authType: 'oauth'`, calls `McpClient.oauthStartRaw(id)` which invokes `mcp_oauth_start({ provider: id })`.

4. Rust `mcp_oauth_start`:
   - Resolves `McpOAuthProvider` from the string.
   - Reads client ID/secret from env vars (e.g., `GITHUB_CLIENT_ID`) or encrypted `settings_v2`.
   - Generates PKCE code verifier (64-char random) + SHA-256 code challenge.
   - Generates 32-byte random `state` for CSRF protection.
   - Builds the authorization URL with PKCE and state params. Google gets `&access_type=offline&prompt=consent`. Slack uses `user_scope` instead of `scope`.
   - Stores `PendingOAuthFlow { provider, code_verifier, created_at }` in `McpOAuthState::pending_flows` (`Arc<RwLock<HashMap>>`).
   - Calls `open_url_in_browser()`: `open` on macOS, `cmd /C start` on Windows, `xdg-open` on Linux.
   - Returns `OAuthStartResponse { auth_url, state }`.

5. Store sets `pendingOAuth[id] = true`, starts a 5-minute `setTimeout` to call `timeoutOAuth(id)` if OAuth is abandoned.

6. User authorizes in the browser. Provider redirects to `agiworkforce://oauth/mcp/{provider}?code=...&state=...`.

7. `tauri-plugin-deep-link` captures the URL, fires `onOpenUrl`. The `useDeepLink` hook (mounted in the app root) handles it.

8. `handleDeepLink()` parses the URL with regex `/^\/oauth\/mcp\/([a-zA-Z0-9_-]+)$/`. Dispatches `mcp-oauth-callback` DOM CustomEvent on success, `mcp-oauth-error` on failure.

9. `ConnectorsGallery` listener fires. Calls `McpClient.oauthCallbackRaw(provider, code, state)`, which invokes `mcp_oauth_callback`.

10. Rust `mcp_oauth_callback`:
    - Acquires write lock on `pending_flows`. Validates state match, provider match, and that the flow is under 10 minutes old. Atomically removes (consumes) the flow.
    - POSTs to the provider's token URL with `grant_type=authorization_code`, `code`, `code_verifier`, `client_id`, `client_secret`, `redirect_uri`.
    - Extracts `access_token`, `refresh_token`, `expires_in`. (Slack: reads from `authed_user` object.)
    - Fetches user profile from the provider's userinfo endpoint.
    - Builds `StoredTokens` and encrypts with AES-256-GCM (machine-derived key). Writes three rows to `settings_v2`: full blob (`mcp_oauth_tokens_{provider}`), access token, refresh token.
    - Returns `OAuthTokenResponse { provider, connected: true, expires_at }`.

11. Gallery calls `completeOAuth(id)` on the store. Store clears the timeout timer and calls `McpClient.connectConnector(id)`.

12. Rust `mcp_connect_connector`:
    - Looks up `ConnectorMcpMapping` for the connector ID. If none, emits `connector:connected` and returns (allows UI-only connectors).
    - Decrypts stored OAuth token via `retrieve_tokens_by_id()`.
    - Builds two env maps: `runtime_env` (plaintext token → injected into process) and `persisted_env` (placeholder string like `<from_oauth:github>` → written to disk).
    - For Notion: wraps token in `{"Authorization": "Bearer ...", "Notion-Version": "2022-06-28"}` JSON as `OPENAPI_MCP_HEADERS`.
    - Upserts the persisted config into `McpState.config` (parking_lot Mutex), calls `persist_config_snapshot()` to write `mcp-servers-config.json`.
    - Calls `mcp_state.client.connect_server(server_name, server_config)` to spawn the stdio MCP process with the runtime env.
    - Emits `McpEvent::ServerConnectionChanged { connected: true }` and `McpEvent::ToolsUpdated { tool_count }`.
    - Emits Tauri event `connector:connected`.

13. Store adds `id` to `connectedIds`. `ConnectorCard` renders green "Connected" badge with Configure/Disconnect popover.

### API Key Path (Vercel, Stripe, Supabase, Sentry, Linear, etc.)

1. User clicks `+`. `handleConnectClick` opens `ConnectorApiKeyDialog`.
2. User enters key, clicks Connect. Gallery calls `connectWithApiKey(connector, apiKey)`.
3. Store calls `McpClient.saveApiKey(id, apiKey)`. Rust encrypts and upserts under `api_key_{provider}` in `settings_v2`.
4. Store calls `McpClient.connectConnector(id)`. Rust calls `retrieve_api_key()` to decrypt, injects as environment variable (e.g., `STRIPE_SECRET_KEY`, `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`).
5. Same MCP server activation path as step 12-13 above.

### MCP Remote Path (Context7, Excalidraw, PubMed)

`authType: 'mcp_remote'`, `mcpTransport: 'http'`. Store calls `McpClient.connectConnector(id)`. These connectors have no entry in `get_connector_mcp_mapping()`, so Rust emits `connector:connected` immediately without spawning a process. Effectively stubs today.

### Disconnect Path

1. Popover → Disconnect. Store calls `disconnect(id)`, which uses `McpClient.oauthDisconnectRaw(id)` to invoke `mcp_oauth_disconnect({ provider: id })`.
2. Rust: disconnects the MCP stdio process, removes from persisted config, deletes OAuth tokens (all rows + legacy key), deletes API key. Emits `McpEvent::ServerConnectionChanged { connected: false }`, `McpEvent::ToolsUpdated { tool_count: 0 }`, and Tauri event `connector:disconnected`.
3. Store removes `id` from `connectedIds`.

## Rust Commands (IPC)

Registered in `apps/desktop/src-tauri/src/lib.rs` lines 1522–1530. All param names must be camelCase in `invoke()` per the Tauri IPC rules.

| Command | camelCase Params | Return | Description |
|---------|-----------------|--------|-------------|
| `mcp_oauth_start` | `provider: String` | `Result<OAuthStartResponse, String>` | PKCE + state generation, browser open |
| `mcp_oauth_callback` | `provider`, `code`, `callbackState: String` | `Result<OAuthTokenResponse, String>` | Token exchange, encrypted storage |
| `mcp_oauth_status` | `provider: String` | `Result<OAuthConnectionStatus, String>` | Token existence and expiry check |
| `mcp_oauth_disconnect` | `provider: String` | `Result<(), String>` | MCP server stop + credential deletion |
| `mcp_oauth_refresh` | `provider: String` | `Result<OAuthTokenResponse, String>` | Refresh token grant |
| `mcp_oauth_set_credentials` | `provider`, `clientId`, `clientSecret: String` | `Result<(), String>` | Store OAuth app credentials (BYOK OAuth) |
| `mcp_list_connected_providers` | none | `Result<Vec<String>, String>` | Scan `settings_v2` for all stored credentials |
| `mcp_connect_connector` | `connectorId: String` | `Result<(), String>` | Spawn MCP stdio server with decrypted env |
| `save_api_key` | `provider`, `key: String` | `Result<(), String>` | Encrypt and store API key |

Response types:
- `OAuthStartResponse`: `{ authUrl: String, state: String }`
- `OAuthTokenResponse`: `{ provider: String, connected: bool, expiresAt: Option<i64> }`
- `OAuthConnectionStatus`: `{ connected: bool, userInfo: Option<UserInfo>, expiresAt: Option<i64> }`
- `UserInfo`: `{ id: String, name: Option<String>, email: Option<String>, avatarUrl: Option<String> }`

## Store Schema

### `connectorsStore` — `apps/desktop/src/stores/connectorsStore.ts`

Persist key: `connectors-store`, version 4.

| Field | Type | Persisted | Notes |
|-------|------|-----------|-------|
| `connectedIds` | `string[]` | Yes | Currently connected connector IDs |
| `loading` | `Record<string, boolean>` | Yes | Per-connector loading indicator |
| `error` | `Record<string, string \| null>` | Yes | Per-connector last error |
| `pendingOAuth` | `Record<string, boolean>` | Yes | Awaiting OAuth callback |
| `oauthStartedAt` | `Record<string, number>` | Yes | ms timestamp when flow started |
| `_oauthTimers` | `Record<string, ReturnType<typeof setTimeout>>` | No | Runtime only; excluded from persist |

Migration history: v3 reset all fields; v4 added `oauthStartedAt` + `_oauthTimers`.

### `connectionStore` — `apps/desktop/src/stores/connectionStore.ts`

This store handles mobile companion WebRTC pairing (QR code, `RTCPeerConnection`, `SignalingClient`). Despite the similar name it is completely unrelated to the service Connectors gallery.

## Component Tree

```
SettingsPanel (activeTab === 'connectors')
  ConnectorsGallery
    Tabs (Featured | All)
    Search input
    Category Select
    TabsContent (Featured)
      ConnectorCard (grid, 1–2 cols)   x N
        img icon (emoji fallback)
        Name + Description + Error
        Action: "Coming Soon" badge | Loader2 | Connected state | Plus button
          Connected: "Connected" badge + Popover(Configure, Disconnect)
    TabsContent (All)
      ConnectorCard x N
    ConnectorOAuthFlow (Dialog)         -- idle | connecting | success | error
    ConnectorApiKeyDialog (Dialog)      -- initial connect
    ConnectorApiKeyDialog (Dialog)      -- re-configure
```

## Key Patterns

### Auth-Type Dispatch

`ConnectorDef.authType` is the routing key. `connectorsStore.connect()` is a switch on this value: `oauth` triggers browser-based PKCE flow; `api_key` opens the key dialog; `mcp_remote` and `none` skip credential gathering.

### Dual-Config MCP Injection

`mcp_connect_connector` builds two environment maps: `runtime_env` (plaintext token, passed to the process) and `persisted_env` (placeholder strings like `<from_oauth:github>`, written to `mcp-servers-config.json`). On startup, `mcp/config.rs` detects these placeholders and re-resolves them from `settings_v2` before spawning each server. This ensures plaintext secrets never touch disk.

### PKCE OAuth with Single-Use State

All OAuth flows use PKCE (S256 method). The `code_verifier` lives in Rust's in-memory `pending_flows` map. The `state` is consumed atomically under a write lock in `mcp_oauth_callback` to prevent replay. Flows older than 10 minutes are pruned at each new `mcp_oauth_start`.

### Tauri Deep-Link Bridge

OAuth redirect URI: `agiworkforce://oauth/mcp/{provider}`. The `tauri-plugin-deep-link` plugin fires `onOpenUrl` in the React WebView. `useDeepLink` hook (mounted once in app root) parses the URL with `/^\/oauth\/mcp\/([a-zA-Z0-9_-]+)$/` and dispatches DOM `CustomEvent` (`mcp-oauth-callback` or `mcp-oauth-error`). `ConnectorsGallery` listens and drives the token exchange. This decouples the deep link infrastructure from connector-specific logic.

### 5-Minute OAuth Timeout

After `mcp_oauth_start`, the store sets a `setTimeout(timeoutOAuth, 300_000)`. If the user abandons the browser flow, the error state is shown automatically. The timer ID is not persisted to avoid ghost timers after restart.

### Encryption at Rest

AES-256-GCM with a 12-byte random nonce per write. Key derived via `KeyPurpose::McpCredentials` in `sys/security/machine_key.rs` (machine-unique). Nonce prepended to ciphertext, result base64-encoded. Applied to OAuth tokens, API keys, and OAuth app client credentials.

### Provider Normalization

`McpOAuthProvider::from_str()` maps many connector IDs to the same enum variant. `"gmail"`, `"google_drive"`, `"google_calendar"`, `"bigquery"` all resolve to `McpOAuthProvider::Google`. A single Google token serves all Google connectors. A legacy key migration handles `google_drive` → `google` in `retrieve_tokens()`.

### ComingSoon Gating

`ConnectorDef.comingSoon: true` renders a badge instead of a connect button. No IPC calls are made. 48 of 63 connectors are currently gated this way.

## Known Issues / Tech Debt

1. **`mcp_list_connected_providers` is still a hardcoded allowlist.** New connectors added to `connectorDefinitions.ts` must still be added to that list in `mcp_oauth.rs`, but Google-family aliases now resolve through the canonical token lookup path so `gmail`, `google_calendar`, and `google_drive` do not disappear after restart when only `mcp_oauth_tokens_google` exists.

2. **`completeOAuth` marks connected even if MCP server fails.** The `catch` block in `connectorsStore.completeOAuth()` still adds the ID to `connectedIds` and only logs a warning if `mcp_connect_connector` fails. The user sees "Connected" with no MCP tools available.

3. **MCP remote connectors are stubs.** `context7`, `excalidraw`, `pubmed` (and others) have `authType: 'mcp_remote'` but no entry in `get_connector_mcp_mapping()`. Connecting them emits `connector:connected` but activates nothing.

4. **No automatic token refresh.** `mcp_oauth_refresh` exists as a command but is never called automatically. Expired access tokens cause silent MCP server failures. The user must disconnect and reconnect.

5. **Notion special-casing is a hardcoded string match.** `connector_id == "notion"` check in `mcp_connect_connector` wraps the token in a JSON header object. Any rename of the connector ID would silently break this.

6. **OAuth app credentials require env vars.** `get_client_credentials()` requires `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` etc. to be set at build or runtime. There is no in-app UI for operators to configure these (beyond `mcp_oauth_set_credentials`), which is not surfaced in the settings.

7. **Pending OAuth flows are in-memory only.** An app crash between `mcp_oauth_start` and the callback loses the `PendingOAuthFlow`. The subsequent callback invocation fails with "Invalid or expired OAuth state" and the user must restart the flow.

8. **`connectionStore.ts` naming is misleading.** The file name implies connector state management, but it manages the mobile WebRTC pairing session. This creates navigational confusion for developers browsing the stores directory.
