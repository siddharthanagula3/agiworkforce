# Feature: MCP Tools

> MCP (Model Context Protocol) is AGI Workforce's integration layer that connects the AI chat and agentic engine to unlimited external tools, services, and data sources through a standardized JSON-RPC 2.0 protocol over STDIO subprocess or HTTP/SSE transports — with no artificial tool count limits.

## Where It Lives

| Layer | Location |
|-------|----------|
| Frontend Components | `apps/desktop/src/components/MCP/MCPWorkspace.tsx` (root workspace), `MCPServerManager.tsx` (lifecycle UI), `MCPServerCard.tsx` (connect/disconnect card), `MCPToolBrowser.tsx` (grouped tool list), `MCPToolExplorer.tsx` (search + test dialog), `MCPConfigEditor.tsx` (JSON editor), `MCPCredentialManager.tsx` (OAuth + API key UI), `MCPConnectionStatus.tsx` (health dashboard), `MCPLogsViewer.tsx` (per-server log dialog), `MCPBundleBrowser.tsx` (bundle install gallery), `MCPServerBrowser.tsx` (server catalog), `McpAppRenderer.tsx` (sandboxed iframe), `McpAppCard.tsx` (app wrapper card), `McpAppGallery.tsx` (session app gallery), `index.tsx` (barrel exports) |
| Stores | `apps/desktop/src/stores/mcpStore.ts` (primary: servers, tools, config, search), `mcpbStore.ts` (bundle registry), `mcpServerStore.ts` (embedded HTTP server), `mcpAppStore.ts` (sandboxed app instances) |
| Hooks | No dedicated MCP hook is authoritative anymore; the live frontend path is `apps/desktop/src/api/mcp.ts` + `apps/desktop/src/stores/mcpStore.ts` |
| Rust Command Files | `apps/desktop/src-tauri/src/sys/commands/mcp.rs` (30+ commands, McpState), `mcp_server.rs` (embedded HTTP server), `mcp_extensions.rs` (.agiext packages), `mcp_oauth.rs` (OAuth PKCE flows), `mcpb.rs` (bundle registry/install) |
| Rust Core Logic | `apps/desktop/src-tauri/src/core/mcp/client.rs` (McpClient, session map), `manager.rs` (ManagedServer, status state machine), `session.rs` (JSON-RPC handshake, tool listing), `transport.rs` (StdioTransport + HttpSseTransport), `registry.rs` (McpToolRegistry, tool ID encoding), `tool_executor.rs` (McpToolExecutor, history/stats), `config.rs` (McpServersConfig, file I/O, credential injection), `health.rs` (McpHealthMonitor), `events.rs` (McpEvent enum), `logs.rs` (log capture), `extensions/` (.agiext format), `server/` (embedded HTTP MCP server), `protocol.rs` (JSON-RPC types), `error.rs` (McpError enum) |
| API Client Layer | `apps/desktop/src/api/mcp.ts` — McpClient static class with timeout/retry wrappers and OAuth helpers |
| Config | `apps/desktop/src-tauri/mcp/default_servers.json` — compile-time embedded defaults |
| Types | `apps/desktop/src/types/mcp.ts` |

## Data Flow

### Startup / Initialization

1. `MCPWorkspace` mounts. `useEffect` checks `!isInitialized` and calls `mcpStore.initialize()`.
2. `mcpStore.initialize()` calls `McpClient.initialize()` which calls `api/mcp.ts:mcpInitialize()`.
3. `mcpInitialize()` invokes `mcp_initialize` via Tauri IPC (60 s timeout with retry).
4. `mcp_initialize` (`sys/commands/mcp.rs:644`) calls `state.reload_active_config(&app)`:
   - Resolves config path: checks `AGIWORKFORCE_PROJECT_FOLDER` env var for project-scope config (`{project}/.mcp.json`, `mcp.json`, `.vscode/mcp.json`); falls back to `{app_data}/mcp-servers-config.json`.
   - Loads config from file. If file does not exist, seeds from in-memory defaults (compiled from `mcp/default_servers.json`).
   - Calls `build_runtime_config()`: resolves credential placeholders (`<from_oauth:github>`, `<from_api_key:X>`) by decrypting stored AES-256-GCM values from `settings_v2` SQLite table. Raw config (with placeholders) stays in memory; runtime config (with real values) used only for connection.
   - Disconnects any pre-existing sessions.
   - For each enabled server in runtime config: `McpClient::connect_server(name, config)` → `McpSession::connect()` → transport selection → `session.initialize()` (JSON-RPC handshake, 10 s timeout) → `session.list_tools()` (caches `Vec<McpToolDefinition>`). Emits `McpEvent::ServerConnectionChanged` and `McpEvent::ToolsUpdated` per server.
   - Emits `McpEvent::SystemInitialized { server_count, tool_count }`.
5. `mcp_initialize` calls `state.start_health_monitoring(app)` — spawns 30 s interval background task.
6. `mcpStore.initialize()` sequentially calls `refreshServers()`, `refreshTools()`, `refreshStats()`, `loadConfig()`, `refreshConfigLocation()`.
7. `mcpStore.isInitialized` becomes `true`. Components re-render with populated server and tool lists.

### Connecting a Server (User Action)

1. User clicks "Connect" on `MCPServerCard`. Component calls `mcpStore.connectServer(name)`.
2. `mcpStore.connectServer()` → `McpClient.connect(name)` → `api/mcp.ts:mcpConnectServer()` → invokes `mcp_connect_server` (with retry, 30 s timeout).
3. `mcp_connect_server` (`mcp.rs:676`):
   - If already connected, returns early.
   - Creates `ToolConfirmationRequest` (risk: Medium) and calls `request_tool_confirmation()` — user must approve in 120 s.
   - On approval: looks up server config, calls `build_runtime_config()` for credential injection.
   - Calls `state.client.connect_server(name, runtime_config)`.
4. `McpClient::connect_server()` (`client.rs:37`):
   - `McpSession::connect(name, config)` → `Transport::from_config()` selects transport:
     - `config.transport = Some(Http {...})` → `HttpSseTransport` (HTTP POST for requests, SSE for server-push; up to 5 reconnect attempts at 1 s intervals).
     - `config.transport = None` → `StdioTransport` (spawns subprocess via `tokio::process::Command` with augmented PATH for `npx`/`node` discovery in Tauri desktop environment).
   - `session.initialize()`: sends `initialize` JSON-RPC request (protocol version `"2024-11-05"`, client info `"AGI Workforce"`). Sends `notifications/initialized` notification. Stores server info and capabilities in `RwLock`.
   - `session.list_tools()`: sends `tools/list` request. Caches `Vec<McpToolDefinition>` in `RwLock`.
   - Stores `Arc<McpSession>` keyed by server name.
5. Command emits `McpEvent::ServerConnectionChanged { connected: true }` and `McpEvent::ToolsUpdated`.
6. `mcpStore.connectServer()` refreshes servers, tools, and stats after the backend events are emitted.

### Tool Execution (Agentic Invocation)

1. LLM returns tool call: `name: "mcp__b64_ZmlsZXN5c3RlbQ__b64_cmVhZF9maWxl"` (base64-encoded `filesystem / read_file`).
2. Agentic executor obtained tool list from `McpToolRegistry::get_all_tool_definitions()` when building the LLM prompt.
3. Executor calls Tauri `mcp_call_tool` with `toolId` and `arguments`.
4. `mcp_call_tool` (`mcp.rs`) :
   - Generates UUID correlation ID for structured logging.
   - Extracts server name from tool ID prefix for logging.
   - Creates `ToolConfirmationRequest` (risk: High; tier: RequiresExplicitApproval). All MCP tools require explicit user approval.
   - Calls `request_tool_confirmation()` — 120 s window for user to approve or deny.
   - On denial: returns error `"Tool execution cancelled by user"`.
   - Emits `McpEvent::ToolExecutionStarted`.
   - Calls `state.tool_executor.execute_tool(&tool_id, arguments)` so timeout/history/stats use the shared runtime executor.
5. `McpToolExecutor::execute_tool()` (`tool_executor.rs`):
   - Decodes the MCP tool ID, validates server existence, executes the request through `McpClient::call_tool()`, and records duration/history/stats.
6. `McpClient::call_tool()` (`client.rs:128`):
   - Retrieves `Arc<McpSession>` from sessions map.
   - Normalizes arguments (plain object passed through; non-object wrapped in `{ "input": value }`).
   - `session.call_tool(tool_name, args_map)` → sends `tools/call` JSON-RPC request. STDIO timeout: 120 s. HTTP timeout: 30 s.
7. Transport delivers request to MCP server subprocess or remote HTTP endpoint. Response flows back.
8. `ToolCallResult` deserialized. If `is_error: true`, returns `McpError::ToolExecutionError`.
9. `mcp_call_tool` emits `McpEvent::ToolExecutionCompleted { success, duration_ms }`.
10. Result (`serde_json::Value`) returned to agentic executor → included in next LLM context message.

### Config Update Flow

1. User edits config in `MCPConfigEditor` → toggles enable flags or edits raw JSON → clicks Save.
2. `mcpStore.updateConfig(newConfig)` → `McpClient.updateConfig(config)` → invokes `mcp_update_config` with `{ newConfig: config }`.
3. `mcp_update_config` (`mcp.rs:1069`):
   - Deserializes `new_config: Value` into `McpServersConfig`.
   - `restore_redacted_env_values()`: any env value equal to `"<redacted>"` is restored from in-memory config. Prevents users accidentally clearing secrets shown as redacted in the UI.
   - `build_runtime_config()` injects credentials.
   - `state.persist_config_snapshot()`: acquires `persist_lock`, writes to disk atomically (temp file + fsync + rename).
   - Updates in-memory config with the raw (placeholder) config.
   - Disconnects all active sessions, emitting `ServerConnectionChanged { connected: false }`.
   - Reconnects all enabled servers from runtime config.
   - Emits `McpEvent::ConfigurationUpdated`.

### Bundle Install Flow

1. `MCPBundleBrowser` mounts → `mcpbStore.fetchRegistry()` fires 4 parallel Tauri invocations: `mcpb_fetch_registry`, `mcpb_get_categories`, `mcpb_get_featured`, `mcpb_get_installed_bundles`.
2. User clicks "Install" on a bundle → `mcpbStore.installBundle(bundleId)` → invokes `mcpb_install_bundle`.
3. Backend (`mcpb.rs`) runs npm install, emits `mcpb:install_progress` events.
4. `MCPBundleBrowser` subscribed via `listen('mcpb:install_progress')` → updates `installProgress` state with phase and percentage.
5. On completion, `mcpbStore` refreshes `installedBundles` via `mcpb_get_installed_bundles`.

### OAuth Credential Flow

1. User clicks "Connect GitHub" in `MCPCredentialManager`.
2. Component calls `invoke('mcp_oauth_start', { provider: 'github' })` → backend generates PKCE code verifier, builds auth URL with state parameter, returns `{ authUrl, state }`.
3. Browser opens to GitHub. User grants permission. Callback URL triggers deep link.
4. `invoke('mcp_oauth_callback', { provider, code, callbackState })`:
   - Verifies state parameter matches stored value (CSRF protection).
   - Exchanges authorization code for access token using PKCE code verifier.
   - Encrypts token with AES-256-GCM using machine-derived key.
   - Stores encrypted token in `settings_v2` SQLite table under key `mcp_oauth_tokens_{provider}`.
5. On next `mcp_connect_server` or `mcp_initialize`, `build_runtime_config()` resolves `<from_oauth:github>` by decrypting the stored token and injecting it as `GITHUB_PERSONAL_ACCESS_TOKEN`.

## Rust Commands (IPC)

All commands in `sys/commands/mcp.rs` unless noted. TS callers must use camelCase param names.

| Command | Rust Params (snake_case) | Return Type | Notes |
|---------|--------------------------|-------------|-------|
| `mcp_initialize` | — | `Result<String>` | Loads config, connects enabled servers, starts health monitoring |
| `mcp_list_servers` | — | `Result<Vec<McpServerInfo>>` | Merges config + connected sessions + stats |
| `mcp_connect_server` | `name: String` | `Result<String>` | User confirmation required (Medium risk) |
| `mcp_disconnect_server` | `name: String` | `Result<String>` | Calls `session.shutdown()` |
| `mcp_enable_server` | `name: String` | `Result<String>` | Sets `enabled: true`, persists config |
| `mcp_disable_server` | `name: String` | `Result<String>` | Sets `enabled: false`, disconnects, persists |
| `mcp_list_tools` | — | `Result<Vec<McpToolInfo>>` | All cached tools across sessions |
| `mcp_search_tools` | `query: String` | `Result<Vec<McpToolInfo>>` | Case-insensitive name+description search |
| `mcp_call_tool` | `tool_id: String`, `arguments: HashMap<String,Value>` | `Result<Value>` | User confirmation required (High risk); 300 s execution timeout |
| `mcp_get_tool_schemas` | — | `Result<Vec<Value>>` | OpenAI function-call format for all tools |
| `mcp_get_config` | — | `Result<Value>` | Returns config with secrets as `"<redacted>"` |
| `mcp_get_config_location` | — | `Result<McpConfigLocation>` | File path, source (`"project"`/`"global"`), exists flag |
| `mcp_update_config` | `new_config: Value` | `Result<String>` | Full replace: persist + reconnect all enabled servers |
| `mcp_get_registry` | — | `Result<Vec<RegistryPackage>>` | 10-item curated catalog with install status |
| `mcp_install_server` | `server_id: String` | `Result<String>` | Adds config entry (disabled); user confirmation required |
| `mcp_get_stats` | — | `Result<HashMap<String,usize>>` | Tool count per server name |
| `mcp_get_execution_history` | `limit: Option<usize>` | `Result<Vec<ToolExecutionResult>>` | Recent MCP tool executions, newest first |
| `mcp_get_tool_execution_stats` | — | `Result<Vec<ToolStats>>` | Per-tool execution totals, failures, avg duration |
| `mcp_get_health` | — | `Result<Vec<ServerHealth>>` | Refreshes connected-server health and drops stale disconnected rows |
| `mcp_check_server_health` | `server_name: String` | `Result<ServerHealth>` | Immediate health check |
| `mcp_get_server_logs` | `serverName: String` (camelCase in Rust per `#[allow(non_snake_case)]`), `lines: Option<usize>` | `Result<Vec<String>>` | Last N lines from log ring-buffer |
| `mcp_store_credential` | `server_name: String`, `key: String`, `value: String` | `Result<String>` | Encrypts + stores in settings_v2 |
| `mcp_set_credential` | `server_name: String`, `key: String`, `value: String` | `Result<String>` | Primary implementation (store_credential delegates here) |
| `mcp_delete_credential` | `server_name: String`, `key: String` | `Result<String>` | Removes from settings_v2 |
| `mcp_oauth_start` | `provider: String` | `Result<{auth_url,state}>` | In `mcp_oauth.rs`; PKCE + CSRF state |
| `mcp_oauth_callback` | `provider: String`, `code: String`, `callback_state: String` | `Result<{provider,connected,expires_at}>` | Exchange code, encrypt + store token |
| `mcp_oauth_status` | `provider: String` | `Result<{connected,user_info,expires_at}>` | Read + decrypt token status |
| `mcp_oauth_disconnect` | `provider: String` | `Result<()>` | Delete stored OAuth tokens |
| `mcp_oauth_refresh` | `provider: String` | `Result<{provider,connected,expires_at}>` | Refresh access token |
| `mcp_oauth_set_credentials` | `provider: String`, `client_id: String`, `client_secret: String` | `Result<()>` | Store OAuth app credentials |
| `mcp_server_start` | — | `Result<()>` | `mcp_server.rs`; starts embedded HTTP MCP server |
| `mcp_server_stop` | — | `Result<()>` | Stops embedded HTTP MCP server |
| `mcp_server_status` | — | `Result<bool>` | Returns `is_running()` — **NOT REGISTERED in lib.rs; unreachable from frontend** |
| `mcp_server_get_config` | — | `Result<Value>` | Returns `{port, token, enabled_tools, running}` |
| `mcp_server_update_config` | `port: Option<u16>`, `enabled_tools: Option<Vec<String>>` | `Result<()>` | Updates port and tool allowlist |
| `mcp_server_list_tools` | — | `Result<Value>` | Tools exposed by embedded server — **NOT REGISTERED in lib.rs; unreachable from frontend** |
| `mcpb_fetch_registry` | — | `Result<Vec<McpBundle>>` | `mcpb.rs`; bundle catalog |
| `mcpb_search_bundles` | `query: String` | `Result<Vec<McpBundle>>` | Bundle search |
| `mcpb_install_bundle` | `bundle_id: String` | `Result<void>` | npm install |
| `mcpb_uninstall_bundle` | `bundle_id: String` | `Result<void>` | Remove bundle |
| `mcpb_get_bundle_details` | `bundle_id: String` | `Result<McpBundle>` | Single bundle info |
| `mcpb_check_updates` | — | `Result<Vec<McpBundle>>` | Bundles with available updates |
| `mcpb_update_bundle` | `bundle_id: String` | `Result<void>` | Update bundle |
| `mcpb_get_installed_bundles` | — | `Result<Vec<McpBundle>>` | Installed bundle list |
| `mcpb_get_categories` | — | `Result<Vec<McpBundleCategory>>` | Bundle categories |
| `mcpb_get_featured` | — | `Result<Vec<McpBundle>>` | Featured bundles |

## Store Schema

### `mcpStore.ts` — `useMcpStore`

```typescript
interface McpState {
  servers: McpServerInfo[];           // { name, enabled, connected, toolCount, command }
  tools: McpToolInfo[];               // { id, name, description, server, parameters }
  config: McpServersConfig | null;    // Raw config; env values shown as "<redacted>"
  configLocation: McpConfigLocation | null; // { path, source, projectFolder, exists }
  stats: Record<string, number>;      // Tool count per server name
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  selectedServer: string | null;      // UI detail panel selection
  searchQuery: string;                // Live tool search
}
```

Middleware: `devtools(subscribeWithSelector(...))`. Not persisted (ephemeral; refreshed from backend on startup). Key derived selectors: `selectConnectedServers`, `selectDisconnectedServers`, `selectServerByName`, `selectToolsByServer`, `selectToolCount`, `selectServerCount`.

### `mcpbStore.ts` — `useMcpbStore`

```typescript
interface McpbState {
  bundles: McpBundle[];               // { id, name, version, description, author, category, npmPackage, tags, ... }
  installedBundles: McpBundle[];
  featuredBundles: McpBundle[];
  categories: McpBundleCategory[];
  selectedCategory: McpBundleCategory | null;
  searchQuery: string;
  isLoading: boolean;
  isInstalling: boolean;
  installProgress: BundleInstallProgress | null; // { phase, message, percentage, error? }
  error: string | null;
}
```

Key derived selector: `selectFilteredBundles` — applies category filter + client-side fuzzy search on name/description/tags. `selectBundlesWithUpdates` for update badge count.

### `mcpServerStore.ts` — `useMcpServerStore`

The embedded HTTP MCP server store is a thin typed client wrapper over `apps/desktop/src/api/mcp.ts`:
`McpClient.getRuntimeServerConfig()`, `startRuntimeServer()`, `stopRuntimeServer()`, and
`updateRuntimeServerConfig()`. It should not call raw Tauri `invoke()` directly. The store also
owns the live error channel for the embedded server surface, and `MCPServerSettings.tsx` keeps its
port input controlled from store config so runtime refreshes do not drift from the UI.

```typescript
interface McpServerConfig {
  port: number;
  token: string;           // Bearer auth token for embedded HTTP server
  enabled_tools: string[]; // Tool allowlist exposed by embedded server
  running: boolean;
}
interface McpServerStore {
  config: McpServerConfig | null;
  loading: boolean;
}
```

No middleware. Manages the _outbound_ embedded HTTP MCP server (AGI Workforce acting as an MCP server for external clients), distinct from the inbound client connections to external MCP servers.

### `mcpAppStore.ts` — `useMcpAppStore`

```typescript
interface McpApp {
  id: string;              // "mcp-app-{Date.now()}-{random6}"
  toolName: string;        // Which MCP tool produced this app
  mcpServer: string;       // Which server provided it
  content: McpAppContent;  // { type: 'html'|'url', payload: string, height?, allowedOrigins? }
  timestamp: number;
  interactionLog: McpInteraction[]; // { timestamp, type, data }
}
interface McpAppState {
  apps: Record<string, McpApp>;
}
```

Middleware: `devtools(...)`. In-memory registry of sandboxed mini-apps spawned when MCP tool results contain HTML or URL payloads. Not persisted across sessions.

## Component Tree

```
MCPWorkspace
├── Header: title "Tool Management", refresh button
├── Alert: error display with dismiss
├── Stats bar: server count, tool count, connected count
└── Tabs
    ├── "Servers"
    │   ├── MCPServerCard[] (one per mcpStore.servers entry)
    │   │   ├── Status icon (connected / disabled / error)
    │   │   ├── Tool count badge (from mcpStore.stats)
    │   │   └── Connect / Disconnect button
    │   └── MCPServerManager
    │       ├── Curated catalog (filesystem, git, github, terminal, stripe, ...)
    │       ├── ServerConfigDialog (endpoint config input)
    │       ├── MCPLogsViewer (Dialog, 200-line log fetch via mcp_get_server_logs)
    │       └── Install button → invoke('mcp_install_server')
    ├── "Tools"
    │   ├── MCPToolBrowser: tools grouped by server, collapsible with expand/collapse
    │   └── MCPToolExplorer: search, star/unstar, schema viewer
    │       └── ToolTestDialog: custom arg input → invoke('mcp_call_tool')
    ├── "Config"
    │   └── MCPConfigEditor
    │       ├── Per-server enable/disable Switch toggles
    │       └── Raw JSON editor → mcpStore.updateConfig()
    ├── "Credentials"
    │   └── MCPCredentialManager
    │       ├── OAuth cards (GitHub, Google Drive, Slack) → mcp_oauth_start / mcp_oauth_callback
    │       └── API key input forms → mcpStore.storeCredential()
    └── "Status"
        └── MCPConnectionStatus
            ├── Summary cards: total / healthy / unhealthy / total tools
            ├── Per-server health rows (response_time_ms, consecutive_failures, last_check)
            └── Per-unhealthy: "Test Connection" → mcp_check_server_health
                             "Reconnect" → mcp_connect_server

MCPBundleBrowser (standalone panel)
├── Category tabs (all, search, automation, data, productivity, development, communication, ...)
├── Search input → mcpbStore.searchBundles()
├── Featured bundle cards
├── Bundle grid with Install / Uninstall / Update buttons
│   └── Installation: mcpbStore.installBundle() + listen('mcpb:install_progress')
└── Progress overlay: phase + percentage bar

McpAppGallery (chat panel or standalone)
├── Server filter dropdown
└── McpAppCard[]
    ├── Header: toolName, mcpServer badge, security label, timestamp, collapse toggle
    └── McpAppRenderer (sandboxed iframe)
        ├── sandbox="allow-scripts allow-forms allow-popups" (NO allow-same-origin)
        ├── referrerPolicy="no-referrer"
        ├── srcDoc for HTML payloads; src for URL payloads
        └── postMessage bridge (origin-validated against allowedOrigins)
```

## Key Patterns

### Tool ID Encoding for OpenAI Compliance

MCP tool IDs must satisfy OpenAI function naming rules: `^[a-zA-Z0-9_-]+$`, max 64 characters. The `McpToolRegistry` (`registry.rs`) uses a 3-tier scheme:

1. **Tagged base64** (preferred): `mcp__b64_{url_safe_b64(server)}__b64_{url_safe_b64(tool)}`. Example: `mcp__b64_ZmlsZXN5c3RlbQ__b64_cmVhZF9maWxl` for `filesystem/read_file`.
2. **Compact base64** (when tagged form exceeds 64 chars): drops the `b64_` prefix tags.
3. **SHA-256 hash** (final fallback for very long names): `mcp__h__{hex40}`.

Decoding mirrors encoding in `parse_tool_id()`. Both `hex_`/`hex:` (legacy) and `b64_`/`b64:` (current) prefixes are supported for backward compatibility. Hashed IDs require a linear scan of all registered tools at execution time.

### Credential Placeholder System

Config files use safe placeholders instead of raw secrets:
- `<from_oauth:github>` — resolved to decrypted OAuth access token from `settings_v2`
- `<from_api_key:provider>` — resolved to stored API key
- `<from_credential_manager>` — legacy fallback

`build_runtime_config()` calls `config.inject_credentials()` which replaces placeholders at connection time. The raw config (with placeholders) is persisted to disk and shown in the UI (redacted). `restore_redacted_env_values()` prevents `"<redacted>"` values from overwriting real secrets when the user saves an edited config.

### Atomic Config Persistence

`McpServersConfig::save_to_file()` (`config.rs:133`) uses temp file → fsync → atomic rename to prevent partial writes. On Windows, handles the case where rename cannot overwrite an existing file. A `TokioMutex` (`persist_lock` in `McpState`) serializes concurrent save operations from different command handlers.

### Transport Selection

`Transport::from_config()` in `transport.rs` selects transport at connection time:
- `config.transport = Some(TransportConfig::Http { url, bearer_token, timeout_secs })` → `HttpSseTransport`: JSON-RPC via HTTP POST, server-push notifications via SSE (5 reconnect attempts, 1 s delay, 30 s request timeout).
- `config.transport = None` (default) → `StdioTransport`: spawns subprocess via `tokio::process::Command`. PATH is augmented with common Node.js install locations (Homebrew, nvm, npm global) to work in Tauri's minimal shell environment. Requests/responses are newline-delimited JSON on stdin/stdout (120 s round-trip timeout, 300 s execution timeout). Zombie prevention via `Drop` impl that kills child process.

### Health Monitoring

`McpHealthMonitor` runs a background tokio task on 30 s intervals. For each connected server: calls `client.list_server_tools(name)` — empty list → `Degraded`; error → `Unhealthy`. Tracks `consecutive_failures` counter. On `Unhealthy`, emits `mcp:server_unhealthy` Tauri event. The authoritative frontend path is now `apps/desktop/src/api/mcp.ts` → `apps/desktop/src/stores/mcpStore.ts` → `apps/desktop/src/components/MCP/MCPConnectionStatus.tsx`. `mcp_get_health` actively refreshes currently connected servers before returning, `useAgenticEvents` pushes immediate store updates on `mcp:server_unhealthy`, and `MCPConnectionStatus` keeps an optional 5 s auto-refresh only as a fallback.

### Tool Confirmation Gate

Every `mcp_call_tool` invocation creates a `ToolConfirmationRequest` (risk: High; tier: `RequiresExplicitApproval`) before execution. `mcp_connect_server` requires Medium risk confirmation. This integrates with the shared ToolGuard / ToolConfirmationState system used across all agentic tools, ensuring users always see and approve MCP tool invocations.

### McpState Composition in AppState

`McpState::new()` (`mcp.rs:90`) composes:
- `Arc<McpClient>` — owns all `McpSession` instances in a `RwLock<HashMap>`
- `Arc<McpToolRegistry>` — wraps `McpClient` for tool ID encoding and schema conversion
- `Arc<Mutex<McpServersConfig>>` — in-memory raw config (with credential placeholders)
- `Arc<TokioMutex<()>>` — serializes config persistence
- `Arc<McpHealthMonitor>` — health records and background check task

`McpState` is registered via `app.manage()` in `lib.rs` and passed as `State<'_, McpState>` to all MCP command handlers.

### McpApp Sandboxed Rendering

When MCP tools return HTML or URL payloads, `McpAppRenderer` (`McpAppRenderer.tsx`) renders them in iframes with `sandbox="allow-scripts allow-forms allow-popups"` — deliberately excluding `allow-same-origin`, preventing iframe scripts from accessing parent DOM or cookies. HTML payloads use `srcDoc` (no network request). postMessage communication is validated against `content.allowedOrigins`. The store registers apps with `useMcpAppStore.registerApp()` and records user interactions in `interactionLog`.

### Embedded HTTP MCP Server (Outbound)

`McpHttpServer` (`core/mcp/server/http_server.rs`) is a separate capability from the client connections: AGI Workforce can _serve_ as an MCP server for other clients. It binds to `127.0.0.1:{port}` (localhost-only enforcement), uses bearer token authentication (`McpAuth`), and exposes only the tools in its `enabled_tools` allowlist. `tools/call` is routed through the injected `DesktopMcpServerExecutor` (`core/mcp/server/executor.rs`), which reuses the live desktop backend command/runtime states instead of a second shadow runtime. Start/stop is controlled via `mcp_server_start`/`mcp_server_stop` commands and the `mcpServerStore`.

### .agiext Extension Package Format

`core/mcp/extensions/` defines a proprietary extension format: `.agiext` files are ZIP archives containing `manifest.json` (metadata + config schema), `server/` (Node.js or binary entry point), and optional `assets/`. `ExtensionInstaller` extracts and installs the package; `ExtensionRepository` (SQLite-backed) tracks installed extensions; `ExtensionManager` handles lifecycle. This is distinct from the npm-based bundle system in `mcpb.rs`.

## Known Issues / Tech Debt

1. **Duplicate tool ID decoding in three places.** `parse_tool_id()` / decode logic exists independently in `core/mcp/registry.rs`, `core/mcp/tool_executor.rs`, and inline in `sys/commands/mcp.rs:mcp_call_tool`. Any future encoding change must be applied to all three. A single shared utility in `core/mcp/mod.rs` would eliminate divergence risk.

2. **Resolved: MCP docs now point at the live frontend path.** The authoritative frontend/runtime surface is `apps/desktop/src/api/mcp.ts` + `apps/desktop/src/stores/mcpStore.ts`, not the removed `useMCP.ts` hook.

3. **`McpServerManager` (`manager.rs`) is instantiated but not wired.** The `ManagedServer` status state machine with restart logic and log ring-buffer was designed to replace inline connection management in command handlers. However, `McpState::new()` does not instantiate `McpServerManager` — connection logic is implemented inline in `mcp.rs` command handlers. The manager's auto-restart and log features are therefore unused.

4. **Resolved: `McpToolExecutor` history/stats now have a frontend command surface.** `mcp_get_execution_history` and `mcp_get_tool_execution_stats` expose runtime telemetry to `api/mcp.ts`, `mcpStore.ts`, and `MCPConnectionStatus.tsx`, so MCP runtime state is no longer backend-only.

5. **Resolved: health monitor events now update the frontend reactively.** `mcp:server_unhealthy` is consumed in `useAgenticEvents.ts`, which upserts server health into `mcpStore` immediately and refreshes server/runtime state.

6. **Resolved: MCP settings/components now use the typed client/store surface.** `MCPServerBrowser.tsx`, `MCPServerManager.tsx`, `MCPCredentialManager.tsx`, `MCPLogsViewer.tsx`, and `OAuthCredentialsPanel.tsx` now use `api/mcp.ts` / `McpClient` instead of raw MCP `invoke()` calls.

7. **Registry is a hardcoded static catalog.** `mcp_get_registry` returns 10 servers defined as Rust literals. There is no live registry API. The `mcpb.rs` module is intended to be the registry-backed bundle system, but `MCPServerBrowser` independently lists servers from its own curated catalog. These two paths should converge.

8. **`mcp_get_server_logs` uses non-idiomatic `#[allow(non_snake_case)]`.** The Rust parameter is named `serverName` (camelCase) to match the incoming camelCase IPC param directly. The correct pattern is to use `server_name` (snake_case) in Rust and let Tauri's serde deserialization handle the camelCase ↔ snake_case mapping automatically.

9. **No circuit breaker state visible to frontend.** The CLAUDE.md documents an MCP circuit breaker (Closed/Open/HalfOpen with 30 s cooldown) implemented in Sprint S2, but `McpState` contains no circuit breaker field and no circuit breaker state is surfaced through any command or event for the UI to display.

10. **Credential persistence still has two backend entrypoints.** Both `mcp_store_credential` and `mcp_set_credential` are registered and map to the same behavior. The live `api/mcp.ts` path is correct, but the backend surface can be simplified to one canonical credential-write command.

11. **`mcp_server_status` and `mcp_server_list_tools` are NOT registered in `lib.rs`.** They are defined in `mcp_server.rs` but absent from the `generate_handler![]` macro. Frontend calls to these commands will silently fail. Either register them or remove the dead functions.

12. **7 MCP extension commands are NOT registered in `lib.rs`.** `extension_get_config`, `extension_set_config`, `extension_validate`, `extension_list_by_status`, `extension_start_all`, `extension_stop_all`, and `extension_get_directory` are defined in `mcp_extensions.rs` but never wired. Only `extension_list`, `extension_get`, `extension_install`, `extension_uninstall`, `extension_enable`, `extension_disable`, and `extension_select_package` are registered.

---

**Essential Files for Understanding This Feature**

Rust Core:
- `/apps/desktop/src-tauri/src/sys/commands/mcp.rs`
- `/apps/desktop/src-tauri/src/core/mcp/client.rs`
- `/apps/desktop/src-tauri/src/core/mcp/session.rs`
- `/apps/desktop/src-tauri/src/core/mcp/transport.rs`
- `/apps/desktop/src-tauri/src/core/mcp/registry.rs`
- `/apps/desktop/src-tauri/src/core/mcp/config.rs`
- `/apps/desktop/src-tauri/src/core/mcp/events.rs`
- `/apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs`

TypeScript Frontend:
- `/apps/desktop/src/stores/mcpStore.ts`
- `/apps/desktop/src/stores/mcpbStore.ts`
- `/apps/desktop/src/stores/mcpServerStore.ts`
- `/apps/desktop/src/stores/mcpAppStore.ts`
- `/apps/desktop/src/api/mcp.ts`
- `/apps/desktop/src/components/MCP/MCPWorkspace.tsx`
- `/apps/desktop/src/components/MCP/MCPServerManager.tsx`
- `/apps/desktop/src/components/MCP/McpAppRenderer.tsx`

---
