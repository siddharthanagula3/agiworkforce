# Sub-Feature: Extensions (Chrome + VS Code)

> Browser automation extension and VS Code coding assistant that bridge external environments to the AGI Workforce desktop app via native messaging, WebSocket, and HTTP.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Chrome Extension | `apps/extension/` — Manifest V3, service worker, content scripts, side panel, popup |
| VS Code Extension | `apps/extension-vscode/` — Chat participant, sidebar webview, desktop bridge |
| Rust Backend (commands) | `apps/desktop/src-tauri/src/sys/commands/extension.rs`, `sys/commands/native_messaging.rs` |
| Rust Backend (bridge) | `apps/desktop/src-tauri/src/automation/browser/extension_bridge.rs` |
| Rust Backend (native host binary) | `apps/desktop/src-tauri/src/bin/native_messaging_host.rs` |
| Rust Backend (manifest install) | `apps/desktop/src-tauri/src/integrations/native_messaging/manifest.rs` |
| Rust Backend (native messaging types) | `apps/desktop/src-tauri/src/integrations/native_messaging/mod.rs` |
| Rust Backend (realtime events) | `apps/desktop/src-tauri/src/integrations/realtime/events.rs`, `realtime/websocket_server.rs` |
| Desktop Frontend (hooks) | `apps/desktop/src/hooks/useExtensionEvents.ts`, `hooks/useExtensionBridgeEvents.ts` |
| Desktop Frontend (event constants) | `apps/desktop/src/constants/event-names.ts` |

---

## Chrome Extension

### Architecture Overview

Manifest V3 extension (`manifest.json` v1.1.0) with four execution contexts:

1. **Background Service Worker** (`src/background.ts`) — Central message router. Manages native messaging port to the desktop app, dispatches commands to content scripts, handles screenshot capture, cookie/tab management, chat message streaming, and reconnection logic.

2. **Content Script** (`src/content.ts`) — Injected into all pages at `document_idle`. Performs DOM interactions (click, type, scroll, drag-drop, form detection/fill, accessibility tree building), action recording, and page context capture. Injects a floating overlay button (shadow DOM) for quick side panel access.

3. **Popup** (`src/popup.ts`, `src/popup.html`) — Lightweight status dashboard showing connection state (connected/disconnected to desktop app), current tab info, session timer, action count, and capture/refresh buttons.

4. **Side Panel** (`src/side_panel.ts`, `src/side_panel.html`) — Full streaming chat interface built with pure DOM/TypeScript (no framework). Features include:
   - Markdown rendering (regex-based, no dependencies)
   - HTML sanitization (DOMParser-based, strips dangerous tags/attributes/URLs)
   - Page context capture and attachment to messages
   - Voice input via Web Speech API
   - API key management (stored in `chrome.storage.session`, with migration from `chrome.storage.local`)
   - Configurable bridge URL (`ws://localhost:8765` default)
   - Message persistence (capped at 50 messages in `chrome.storage.local`)

### Permissions

```
Required: activeTab, tabs, storage, nativeMessaging, alarms, contextMenus, sidePanel, scripting, cookies
Optional: downloads, bookmarks, history
Host: <all_urls>
```

### Key Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+A` / `Cmd+Shift+A` | Open popup |
| `Ctrl+Shift+C` / `Cmd+Shift+C` | Capture current page |

### Message Types (`src/types.ts`)

The extension defines 40+ message types organized into categories:

- **DOM Interactions**: `CLICK`, `DOUBLE_CLICK`, `RIGHT_CLICK`, `TYPE`, `GET_TEXT`, `GET_ATTRIBUTE`, `SET_ATTRIBUTE`, `WAIT_FOR_SELECTOR`, `EXECUTE_SCRIPT`, `HOVER`, `SCROLL`, `DRAG_DROP`, `CLICK_AT_COORDINATES`, `SELECT_OPTION`, `CHECK`, `UNCHECK`, `FOCUS`, `BLUR`
- **Page Context**: `GET_PAGE_INFO`, `GET_FORMS`, `FILL_FORM`, `SUBMIT_FORM`, `SYNC_PAGE_CONTEXT`, `RUN_PAGE_ACTIONS`, `CAPTURE_ELEMENT`, `GET_ELEMENT_INFO`
- **Screenshots**: `CAPTURE_SCREENSHOT`
- **Cookies**: `GET_COOKIES`, `SET_COOKIE`, `CLEAR_COOKIES`
- **Tab Management**: `GET_ALL_TABS`, `CREATE_TAB`, `CLOSE_TAB`, `SWITCH_TAB`
- **Accessibility**: `GET_ACCESSIBILITY_TREE`, `BUILD_ACCESSIBILITY_TREE`
- **Recording**: `START_RECORDING`, `STOP_RECORDING`, `GET_RECORDED_ACTIONS`
- **Chat**: `CHAT_MESSAGE` (side panel to background), `CHAT_CHUNK` (background to side panel, internal only)
- **Connection**: `GET_CONNECTION_STATUS`, `CONNECTION_STATUS_CHANGED`, `TAB_READY`
- **Job Autofill**: `AUTO_FILL_JOB_APPLICATION`
- **Internal**: `queue_message`, `open_side_panel`, `BRIDGE_URL_CHANGED`

### Job Autofill System (`src/autofill/`)

Platform-aware job application autofill with dedicated adapters:

- `detector.ts` — Detects which job platform the user is on (Greenhouse, Workday, LinkedIn, Lever, generic)
- `filler.ts` — Generic form-filling engine with profile persistence (`chrome.storage.local`)
- `linkedin.ts` — LinkedIn Easy Apply selectors and multi-step flow handling
- `lever.ts` — Lever-specific selectors including EEO fields and custom question detection

Supports `JobApplicationProfile` with 20+ fields (name, email, phone, URLs, work authorization, custom answers, file attachments).

### Utilities (`src/utils.ts`)

- `RateLimiter` — Per-tab, per-message-type rate limiting (120 req/min, 500ms screenshot cooldown)
- `domUtils` — Safe querySelector, waitForSelector, click with fallback, visibility check
- `formUtils` — Form detection, field filling with change/input event dispatch
- `storageUtils` — Typed wrappers around `chrome.storage.local`
- `validators` — URL safety (blocks `chrome:`, `about:`, `data:` protocols), CSS selector validation, XSS sanitization
- Default config: port 8787 (matches `AGI_REALTIME_PORT`)

---

## VS Code Extension

### Architecture Overview

VS Code extension (`package.json` v0.1.0) activated on `onStartupFinished`. Provides:

1. **Chat Participant** (`src/providers/chatParticipant.ts`) — Registers `@agi` in VS Code Chat panel with 6 slash commands: `/explain`, `/fix`, `/refactor`, `/tests`, `/docs`, `/model`

2. **Sidebar Webview** (`src/providers/sidebarProvider.ts`) — Activity bar panel with conversation UI and history tree view (`src/providers/conversationTreeProvider.ts`)

3. **Code Intelligence Providers**:
   - `codeActionProvider.ts` — Quick fix / refactor code actions on selection
   - `hoverProvider.ts` — AI-powered hover tooltips on identifiers (opt-in via `agiWorkforce.hoverEnabled`)
   - `inlineCompletionProvider.ts` — Ghost-text inline completions (opt-in, requires API key, 300ms debounce)

4. **Agent Mode** (`src/providers/agentModeProvider.ts`) — Full-screen agent panel with plan-before-execute mode

5. **Desktop Bridge** (`src/services/desktopBridge.ts`) — WebSocket + HTTP connection to the desktop app

6. **Services**:
   - `telemetry.ts` — Opt-in anonymous usage telemetry
   - `agentStatus.ts` — Status bar showing running agent sessions, polls desktop bridge or API gateway
   - `modelCatalog.ts` — Remote model catalog fetch with 1-hour cache in globalState
   - `workspaceIndexer.ts` — Workspace file indexing for context

7. **Storage**: `conversationStore.ts` — Conversation persistence in VS Code globalState

### Commands (19 total)

| Command | Description |
|---------|-------------|
| `agi-workforce.chat` | Open chat panel (VS Code Chat > Copilot > sidebar fallback) |
| `agi-workforce.agentMode` | Open agent mode panel |
| `agi-workforce.explain` | Explain selected code |
| `agi-workforce.fix` | Fix issues in selected code |
| `agi-workforce.refactor` | Refactor selected code |
| `agi-workforce.generateTests` | Generate tests for selected code |
| `agi-workforce.setApiKey` | Set API key (VS Code SecretStorage) |
| `agi-workforce.clearApiKey` | Clear stored API key |
| `agi-workforce.selectModel` | Quick pick from 15+ models (auto-balanced/economy/premium, Claude, GPT, Gemini, DeepSeek, etc.) |
| `agi-workforce.openConversation` | Open conversation in read-only Markdown tab |
| `agi-workforce.deleteConversation` | Delete a conversation from history |
| `agi-workforce.refreshConversations` | Refresh conversation tree |
| `agi-workforce.sendToDesktop` | Send code snippet to desktop agent |
| `agi-workforce.syncContextToDesktop` | Sync workspace context (folders, active file) to desktop |
| `agi-workforce.triggerAgentAction` | Trigger desktop agent action (open-chat, run-task, open-tool) |
| `agi.git.status` | Git status in terminal |
| `agi.git.diff` | Git diff in terminal |
| `agi.git.commit` | Git add -u + commit with message prompt |
| `agi.test.run` | Auto-detect test runner and run tests |

### Key Keybindings

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+A` / `Cmd+Shift+A` | Open chat |
| `Ctrl+Shift+Alt+E` / `Cmd+Shift+Alt+E` | Explain selection |
| `Ctrl+Shift+Alt+G` / `Cmd+Shift+Alt+G` | Agent mode |

### Configuration (`agiWorkforce.*`)

| Setting | Default | Description |
|---------|---------|-------------|
| `apiEndpoint` | `https://agiworkforce.com/api/llm/v1` | API base URL |
| `model` | `auto-balanced` | Default LLM model |
| `streamingEnabled` | `true` | Enable streaming responses |
| `contextLines` | `50` | Surrounding lines for context |
| `fallbackToVscodeLm` | `true` | Fall back to VS Code Language Model API |
| `telemetryEnabled` | `false` | Anonymous usage telemetry |
| `hoverEnabled` | `false` | AI hover tooltips |
| `autoApplyFixes` | `false` | Auto-apply AI fix suggestions |
| `inlineCompletions.enabled` | `false` | Ghost-text completions |
| `inlineCompletions.debounceMs` | `300` | Debounce for inline completions |
| `inlineCompletions.maxLength` | `500` | Max completion length |
| `agent.planMode` | `false` | Show plan before executing |
| `agent.maxIterations` | `25` | Max autonomous iterations |
| `mcp.enabled` | `false` | Enable MCP tool integrations |
| `desktopBridge.enabled` | `true` | Connect to desktop app |
| `desktopBridge.port` | `8787` | Desktop bridge port |

---

## Native Messaging Bridge

### How Chrome Extension and Desktop App Communicate

The Chrome extension communicates with the desktop app through a **Chrome Native Messaging** pipeline:

```
Chrome Extension (background.ts)
    |
    | chrome.runtime.connectNative("com.agiworkforce.browser")
    | (stdio: length-prefixed JSON over stdin/stdout)
    v
Native Messaging Host Binary (bin/native_messaging_host.rs)
    |
    | WebSocket ws://127.0.0.1:8787
    | (authenticated via .ipc_token)
    v
Desktop App Realtime WebSocket Server (integrations/realtime/websocket_server.rs)
    |
    | RealtimeEvent::NativeMessage / NativeResponse
    v
Rust Backend (processes commands, emits Tauri events)
```

### Native Messaging Host Binary (`src/bin/native_messaging_host.rs`)

A standalone Rust binary that:

1. **Reads Chrome's length-prefixed JSON** from stdin (Chrome launches it per the manifest)
2. **Connects to the desktop app** via WebSocket at `ws://127.0.0.1:8787`
3. **Authenticates** using `.ipc_token` file (supports both sandboxed and legacy app data paths on macOS)
4. **Forwards messages bidirectionally**: Chrome stdin -> WebSocket (as `RealtimeEvent::NativeMessage`), WebSocket -> Chrome stdout (as `NativeResponse`)
5. **Supports `--install-manifests` mode** for self-installing the native messaging manifest

### Manifest Installation (`integrations/native_messaging/manifest.rs`)

The `NativeHostManifest` struct generates `com.agiworkforce.browser.json` with:
- `name`: `com.agiworkforce.browser`
- `type`: `stdio`
- `path`: Path to the native messaging host binary
- `allowed_origins`: `chrome-extension://<extension_id>/`

Platform-specific install locations:

| Platform | Chrome Path | Edge Path |
|----------|-------------|-----------|
| macOS | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` | `~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/` |
| Linux | `~/.config/google-chrome/NativeMessagingHosts/` (or chromium) | `~/.config/microsoft-edge/NativeMessagingHosts/` |
| Windows | `%LOCALAPPDATA%\Google\Chrome\User Data\NativeMessagingHosts\` | `%LOCALAPPDATA%\Microsoft\Edge\User Data\NativeMessagingHosts\` |

**macOS-specific handling**: The bundled sidecar binary inherits app sandbox entitlements. The installer copies it to an external location and re-signs it ad-hoc (`codesign --force --sign -`) to remove sandbox entitlements. Falls back to an external helper binary if direct install fails.

### Connection Handshake (background.ts)

1. `chrome.runtime.connectNative("com.agiworkforce.browser")` opens the native port
2. Background sends `{ type: "connect", extension_id: chrome.runtime.id }` and awaits success
3. Background sends `{ type: "ping" }` and awaits success
4. On both success: marks `isNativeConnected = true`, resets reconnect counter
5. On failure: exponential backoff reconnect (1s base, 30s max, 8 max attempts before giving up)

### Extension Bridge (`automation/browser/extension_bridge.rs`)

The `ExtensionBridge` struct provides a high-level Rust API for browser automation through the extension. It communicates via the realtime WebSocket server, not directly through native messaging.

**Supported operations** (each wraps an `ExtensionMessage` enum variant):

| Method | Description |
|--------|-------------|
| `execute_script(script)` | Execute arbitrary JavaScript in the active tab |
| `click(selector)` | Click element by CSS selector |
| `type_text(selector, text)` | Type into element |
| `navigate(url)` | Navigate active tab to URL |
| `hover(selector)` | Hover over element |
| `wait_for_selector(selector, timeout_ms)` | Wait for element to appear |
| `get_dom_snapshot()` | Get full page HTML |
| `get_url()` / `get_title()` | Get current tab URL/title |
| `get_attribute(selector, attr)` | Read element attribute |
| `select_option(selector, value)` | Select dropdown option |
| `set_checked(selector, checked)` | Toggle checkbox/radio |
| `focus(selector)` | Focus element |
| `scroll_into_view(selector)` | Scroll element into view |
| `get_text(selector)` | Extract text content |
| `get_cookies()` / `set_cookie()` / `clear_cookies()` | Cookie management |
| `get_local_storage()` / `set_local_storage()` / `clear_local_storage()` | localStorage management |
| `capture_screenshot(format, quality)` | Capture tab screenshot |

**Authentication flow**: Reads `.ipc_token` from app data directory, connects to `ws://127.0.0.1:8787`, sends `RealtimeEvent::Authenticate`, waits for `Authenticated` response (4s timeout), then sends `NativeMessage` and waits for `NativeResponse` (15s timeout). Retries up to 3 times with 250ms base exponential backoff (non-retryable errors like auth failures short-circuit).

**Error categorization**: Three internal prefixes for error triage:
- `extension_bridge_config_error:` — Missing token, invalid URL (non-retryable)
- `extension_bridge_auth_error:` — Authentication failures (non-retryable)
- `native_response_error:` — Extension-side failures (non-retryable)

---

## VS Code Desktop Bridge

### How VS Code Extension Communicates with Desktop App

The VS Code extension uses a separate, simpler bridge:

```
VS Code Extension (desktopBridge.ts)
    |
    |--- HTTP POST http://127.0.0.1:8787/api/bridge/<command>
    |    (for request/response commands)
    |
    |--- WebSocket ws://127.0.0.1:8787/ws
    |    (for real-time events)
    v
Desktop App Realtime Server
```

### DesktopBridge Class

Singleton class with lifecycle management:

- **Health check**: `GET /api/health` every 30 seconds
- **Auto-reconnect**: 5-second interval on disconnect
- **HTTP API**: `POST /api/bridge/<command>` with 10s timeout
- **WebSocket**: Announces `vscode:connected` with workspace folders and extension version

### Convenience Methods

| Method | HTTP Endpoint | Description |
|--------|--------------|-------------|
| `sendCodeSnippet(code, lang, path)` | `POST /api/bridge/code-snippet` | Send selected code to desktop agent |
| `shareContext()` | `POST /api/bridge/sync-context` | Sync workspace folders, active file, language |
| `triggerAgentAction(action, params)` | `POST /api/bridge/agent-action` | Trigger desktop agent actions |

### Inbound Message Handlers (Desktop -> VS Code)

| Message Type | Action |
|-------------|--------|
| `desktop:open-file` | Open file in editor |
| `desktop:show-message` | Show information notification |
| `desktop:run-command` | Execute VS Code command (allowlisted: 12 commands) |

**Security**: Inbound `desktop:run-command` messages are validated against `ALLOWED_BRIDGE_COMMANDS` set. Disallowed commands are logged and blocked.

---

## Desktop Integration

### Rust Commands (IPC)

#### Extension Commands (`sys/commands/extension.rs`)

| Command | Parameters | Returns | Description |
|---------|-----------|---------|-------------|
| `extension_page_context` | `PageContext { url, title, html, selected_text, tab_id, timestamp }` | `PageContextResponse` | Receives page context from browser extension, stores in `LATEST_PAGE_CONTEXT` global, plans page actions, emits `extension:page-context` event |
| `extension_analyze_forms` | `FormData { url, tab_id, forms[] }` | `FormAnalysisResponse` | Analyzes detected forms — classifies type (login, registration, search, contact), extracts required fields |
| `extension_task_result` | `TaskResult { task_id, success, screenshot, result, error, actions_performed, duration }` | `TaskResultResponse` | Receives task completion from extension, saves screenshots to `extension_captures/`, emits `extension:task-result` event |
| `extension_status` | None | JSON diagnostics | Returns extension transport health: realtime token validity, native connection state, extension ID, recommendations |

#### Native Messaging Commands (`sys/commands/native_messaging.rs`)

| Command | Parameters | Returns | Description |
|---------|-----------|---------|-------------|
| `native_messaging_check_status` | None | `NativeMessagingStatus` | Check if native messaging manifests are installed, connection state |
| `native_messaging_install` | `extension_id?: String` | `Vec<String>` (installed paths) | Install native messaging manifests for Chrome and Edge |
| `native_messaging_uninstall` | None | `()` | Remove native messaging manifests |
| `native_messaging_set_extension_id` | `extension_id: String` | `()` | Set extension ID and reinstall manifests with updated allowed_origins |
| `native_messaging_get_connection_state` | None | `String` | Get current connection state (disconnected/connecting/connected/error) |

### Page Context Processing

When the extension sends page context, `process_page_context_event` in `extension.rs`:

1. Validates URL and title are non-empty
2. Stores in `LATEST_PAGE_CONTEXT` static Mutex (read by chat system prompt builder)
3. Truncates HTML to 100KB for analysis
4. Runs `plan_page_actions()` which generates actions based on page content:
   - Always: `get_page_info`
   - If `<form>` detected: `get_forms`
   - If selected text: `analyze_selection` (truncated to 1000 chars)
   - If password field: `wait_for_selector` for `input[type='password']`
5. Emits `extension:page-context` Tauri event with task_id, URL, title, tab_id, actions

### Auto-Install on Startup (`lib.rs`)

At app startup, `lib.rs` automatically installs native messaging manifests with a hardcoded extension ID:
```rust
install_manifests(Some("bblfoadbknbnmbchfjpgcefpkccpdnfc"))
```

---

## Tauri Events

| Event | Payload | Source | Description |
|-------|---------|--------|-------------|
| `extension:page-context` | `{ task_id, url, title, tab_id, timestamp, selected_text, actions[] }` | `extension.rs` | Page context received from browser extension |
| `extension:task-result` | `{ task_id, success, screenshot_path, result, error, actions_performed, duration }` | `extension.rs` | Browser task completed or failed |
| `extension:connection-status` | `{ connected, status, extension_id, reason, timestamp }` | Realtime server | Extension connection state changed |

### Frontend Event Handling

**`useExtensionEvents.ts`** — Subscribes to all three events. Tracks page URL/title, agent status (idle/planning/executing/done/error), connection state. Auto-opens the extension sidecar panel on first page-context event. Provides `stopAgent()` and `resetState()` callbacks.

**`useExtensionBridgeEvents.ts`** — Lower-level hook extracted from `useAgenticEvents.ts`. Handles:
- Preflight diagnostics: calls `extension_status` command to check token validity and connection state, writes results to action log and action trail
- Page context events: creates action log entries and inline extension artifacts in chat messages
- Connection status: tracks connected/disconnected state, re-runs preflight on reconnect
- Task results: writes completion/failure artifacts with screenshot paths, action counts, duration

Both hooks write to `useUnifiedChatStore` for action trail entries and message artifacts.

---

## Key Patterns

### Native Messaging Protocol

Chrome Native Messaging uses **length-prefixed JSON** over stdio:
- Messages are prefixed with a 4-byte little-endian unsigned integer indicating the message length
- Maximum message size: 1MB (Chrome limit)
- The host binary (`native_messaging_host`) reads from stdin, writes to stdout
- Logging goes to stderr to avoid corrupting the stdio protocol

### Realtime WebSocket Authentication

Both the native messaging host and the extension bridge authenticate via:
1. Read `.ipc_token` from the app data directory (generated by the desktop app on startup)
2. Send `RealtimeEvent::Authenticate { user_id, token }` over WebSocket
3. Wait for `RealtimeEvent::Authenticated` or `AuthenticationFailed`
4. The token file location is resolved per-platform, with macOS supporting both sandboxed (`Library/Containers/com.agiworkforce.desktop/Data/`) and legacy (`Library/Application Support/com.agiworkforce.desktop/`) paths

### Content Script Isolation

- Content script uses shadow DOM for the floating overlay button to avoid CSS conflicts
- Automation indicator is injected as a data attribute on `<html>` element
- Script execution from extension uses `chrome.scripting.executeScript` (Manifest V3)
- The `injected.js` file is a placeholder for future web-accessible resource needs

### API Key Security

- **Chrome Extension**: API key stored in `chrome.storage.session` (cleared on browser close). Migration from `chrome.storage.local` for legacy keys. Never persisted across sessions.
- **VS Code Extension**: API key stored in VS Code `SecretStorage` (encrypted by the OS keychain).
- **Desktop App**: Secrets managed via `SecretManager` (Argon2id + AES-GCM).

### VS Code Command Allowlisting

The desktop bridge handler in `desktopBridge.ts` maintains a strict allowlist of 12 VS Code commands that the desktop app is permitted to trigger remotely. Any command not in `ALLOWED_BRIDGE_COMMANDS` is blocked and logged.

### Rate Limiting

The Chrome extension applies per-tab, per-message-type rate limiting:
- General: 120 requests per minute per tab per message type
- Screenshots: additional 500ms cooldown between captures

---

## Known Issues / Tech Debt

1. **Hardcoded extension ID**: `lib.rs` hardcodes `bblfoadbknbnmbchfjpgcefpkccpdnfc` for auto-install at startup. If the extension is rebuilt with a different key, native messaging will fail until the ID is updated.

2. **Windows registry registration**: `register_windows_native_host()` in `manifest.rs` is a stub (`tracing::info!` only). Windows native messaging requires actual registry entries under `HKCU\Software\Google\Chrome\NativeMessagingHosts\`.

3. **`injected.js` is a no-op**: The web-accessible script is a placeholder. It is not referenced in `manifest.json` `web_accessible_resources` and does nothing.

4. **Side panel markdown renderer is regex-based**: The `renderMarkdown()` function in `side_panel.ts` uses regex patterns that may fail on edge cases (nested formatting, complex list structures). No external markdown library is used to keep the extension dependency-free.

5. **Extension bridge `resolve_app_data_dir` is duplicated**: Both `extension_bridge.rs` and `native_messaging_host.rs` have independent implementations for resolving the app data directory and reading `.ipc_token`. These should be consolidated.

6. **VS Code bridge has no authentication**: The `DesktopBridge` WebSocket connection (`ws://127.0.0.1:8787/ws`) does not send an `.ipc_token` for authentication, unlike the Chrome extension path. It relies solely on localhost access control.

7. **No end-to-end encryption**: Messages between the Chrome extension and desktop app travel as plaintext JSON over local WebSocket. While this is local-only traffic, sensitive page content (passwords, form data) is not encrypted in transit.

8. **`LATEST_PAGE_CONTEXT` uses `std::sync::Mutex`**: The global page context storage in `extension.rs` uses a blocking `std::sync::Mutex` instead of `tokio::sync::Mutex`, which could block the async runtime if the lock is contended.

9. **VS Code agent status polling**: `agentStatus.ts` polls every 5 seconds when the bridge is disconnected. This should use exponential backoff or stop polling entirely when the desktop app is not running.

10. **Chrome extension reconnect gives up permanently**: After 8 failed reconnection attempts, `nativeReconnectGaveUp` is set to `true` and no further attempts are made until the user manually triggers a reconnection. There is no automatic recovery after the desktop app restarts.
