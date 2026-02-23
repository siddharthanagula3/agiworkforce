# Specification: Browser Automation + Extension Features

Generated: 2026-02-23T12:00:00Z

## Task Overview

Four parallel agents will implement browser automation features and Chrome extension
enhancements across the AGI Workforce monorepo. The work spans Rust (Tauri backend),
TypeScript (desktop frontend), and the Chrome extension codebase. Each track has clear
file boundaries so agents can work without merge conflicts.

## Team Composition

- **Track A (rust-tauri-engineer)**: Permission error wiring, DOCKING_ENABLED re-enable,
  auto-tile on browser_navigate, page context injection into LLM system prompt
- **Track B (rust-tauri-engineer)**: PlaywrightBridge CDP implementation -- connect the
  existing stub methods to the existing CdpClient
- **Track C (browser-extension-engineer)**: Chrome extension -- "Ask AGI Workforce" context
  menu on selected text, Chrome sidePanel API queue, Comet-style floating overlay via
  shadow DOM content script
- **Track D (frontend-engineer)**: Permission modal UI that appears on automation failures,
  browser mode toolbar indicator component

---

## File Allocation

### Track A -- Rust: Permissions + Docking + Page Context

**Allowed Files:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/chat/mod.rs`
  - ONLY lines 2418-2448 (permission error emission) and lines 1708-1913 (system prompt building)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/ui/window/mod.rs`
  - ONLY the constant on line 17 and logic guarded by DOCKING_ENABLED
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/extension.rs`
  - The `process_page_context_event` function (lines 110-163) to expose page context for LLM use

**Current State:**

`chat/mod.rs` line 2435: When `AutomationService::new()` fails, emits `chat:stream-error`
with `"error": "Agent mode requires automation permissions"` and `chat:stream-end` with
`"content": "Agent mode is unavailable (missing automation permissions)."` The frontend
receives this but has NO special handling to show a permissions modal. The system prompt
is built starting at line 1708. System messages are pushed for:

1. Default system prompt (line 1714)
2. Memory context (line 1731)
3. OS context (line 1805)
4. Project folder context (line 1885)
5. Custom instructions (line 1901)

There is NO page context injection. The extension emits `extension:page-context` events
(extension.rs:153) but these are only consumed by the frontend hook (`useAgenticEvents.ts:825`),
never by the LLM prompt builder.

`window/mod.rs` line 17: `const DOCKING_ENABLED: bool = false;` The full dock implementation
exists (apply_dock at line 130, undock at line 180, detect_dock_candidate at line 296, and
event handlers at lines 216-236). All gated behind the DOCKING_ENABLED constant.

`extension.rs`: `PageContext` struct (line 14-22) has fields: `url`, `title`, `html`,
`selected_text`, `tab_id`, `timestamp`. The `process_page_context_event` function
(line 110-163) creates a task_id, plans page actions, and emits `extension:page-context`.
HTML is truncated to 100KB.

**Will Produce:**

1. A new Tauri event `agent:permission-required` emitted from chat/mod.rs alongside the
   existing error events, with payload:

   ```json
   {
     "error_type": "automation_permissions",
     "message": "Agent mode requires automation permissions",
     "permissions_needed": ["accessibility", "screen_recording", "input_monitoring"]
   }
   ```

2. Change `DOCKING_ENABLED` from `false` to `true` on line 17 of window/mod.rs.

3. An auto-tile function that listens for browser_navigate completion and calls
   `apply_dock(window, app_state, DockPosition::Right)`. This should be implemented
   as a new public function `pub fn auto_tile_for_browser(app: &tauri::AppHandle)` in
   window/mod.rs, invoked from browser.rs after `browser_navigate` succeeds.

4. Page context injection into the LLM system prompt. In chat/mod.rs, after the custom
   instructions block (after line 1913), add a new system message block that reads the
   most recent `PageContext` from a shared `Arc<Mutex<Option<PageContext>>>` stored in
   Tauri managed state. The system message format:

   ```
   ## Active Browser Page Context

   The user currently has this page open in their browser:
   - **URL:** {url}
   - **Title:** {title}
   - **Selected Text:** {selected_text or "None"}

   Page HTML (truncated):
   {first 50KB of html}

   Use this context when the user asks about "this page", "summarize this", etc.
   ```

**Interface Contracts (Track A produces for Track D):**

Track A emits `agent:permission-required` event. Track D listens for this event
to show the modal. Event payload TypeScript type:

```typescript
interface PermissionRequiredEvent {
  error_type: 'automation_permissions';
  message: string;
  permissions_needed: ('accessibility' | 'screen_recording' | 'input_monitoring')[];
}
```

**Interface Contracts (Track A produces for Track B):**

Track A adds auto-tile logic in window/mod.rs. Track B's browser_navigate in browser.rs
must call `auto_tile_for_browser(app_handle)` after successful navigation. The function
signature:

```rust
pub fn auto_tile_for_browser(app: &tauri::AppHandle) -> Result<()>
```

**Shared State for Page Context (Track A creates, extension.rs already populates):**

Track A must add to the Tauri managed state (registered in lib.rs):

```rust
pub struct PageContextState(pub Arc<tokio::sync::Mutex<Option<PageContext>>>);
```

The `process_page_context_event` in extension.rs must store the context in this state.
The chat system prompt builder reads from this state.

---

### Track B -- Rust: PlaywrightBridge CDP Implementation

**Allowed Files:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/browser/playwright_bridge.rs`
  - Add new CDP-backed methods: navigate, click, type_text, screenshot, evaluate
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/browser/mod.rs`
  - MAY add imports if needed, but do NOT restructure existing BrowserState
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/browser.rs`
  - Add the `auto_tile_for_browser` call to `browser_navigate` (line 346)

**Current State:**

`playwright_bridge.rs`: The `PlaywrightBridge` struct has:

- `new()` / `with_config()` -- working constructors
- `start_server()` -- launches a stub cmd echo (line 123) -- NOT real
- `stop_server()` -- kills process -- working
- `launch_browser()` -- launches Chrome with `--remote-debugging-port=9222` (line 234),
  stores handle and process -- WORKING for Chrome on macOS
- `close_browser()` / `close_browser_by_id()` -- working
- `list_browsers()` -- working
- `connect_to_browser()` -- uses tungstenite sync connect, then DISCARDS connection
  (line 292-303) -- STUB, does nothing useful
- NO navigate/click/type/screenshot/evaluate methods exist

`cdp_client.rs`: A fully functional CDP WebSocket client with:

- `connect()` -- establishes async WebSocket via tokio-tungstenite (line 73)
- `send_command(method, params)` -- sends CDP JSON and waits for response (line 143)
- `evaluate(expression)` -- Runtime.evaluate wrapper (line 193)
- `click_element(selector)` -- JS click via evaluate (line 217)
- `type_into_element(selector, text, clear_first)` -- JS type via evaluate (line 234)
- `navigate(url)` -- Page.navigate CDP command (line 484)
- `capture_screenshot(full_page)` -- Page.captureScreenshot CDP command (line 465)
- `get_url()`, `get_title()`, `get_content()` -- via evaluate (lines 493-521)

`browser/mod.rs` (line 22-55): `BrowserState` holds:

- `playwright: Arc<Mutex<PlaywrightBridge>>`
- `tab_manager: Arc<Mutex<TabManager>>`
- `extension: Arc<Mutex<ExtensionBridge>>`
- `cdp_clients: Arc<Mutex<HashMap<String, Arc<CdpClient>>>>`
- `get_cdp_client(tab_id)` -- creates CdpClient for `ws://127.0.0.1:9222/devtools/page/{tab_id}`

`browser.rs` command `browser_navigate` (line 315-348): Gets or creates a tab, then calls
`client.navigate(&url)` via CdpClient. Already works via CDP. The PlaywrightBridge is NOT
used for actual page operations.

**Will Produce:**

New methods on `PlaywrightBridge` that delegate to `CdpClient`:

```rust
impl PlaywrightBridge {
    /// Navigate the active browser to a URL via CDP
    pub async fn navigate(&self, browser_id: &str, url: &str) -> Result<()>;

    /// Click an element by CSS selector via CDP
    pub async fn click(&self, browser_id: &str, selector: &str) -> Result<()>;

    /// Type text into an element via CDP
    pub async fn type_text(
        &self,
        browser_id: &str,
        selector: &str,
        text: &str,
        clear_first: bool,
    ) -> Result<()>;

    /// Capture a screenshot via CDP, returns PNG bytes
    pub async fn screenshot(&self, browser_id: &str, full_page: bool) -> Result<Vec<u8>>;

    /// Evaluate JavaScript in the page context via CDP
    pub async fn evaluate(&self, browser_id: &str, expression: &str) -> Result<Value>;
}
```

Each method will:

1. Look up the browser handle by `browser_id` from `self.browsers`
2. Create or retrieve a `CdpClient` connected to `handle.ws_endpoint`
3. Delegate to the corresponding CdpClient method
4. Return the result

Track B must also add a `cdp_client` field to `PlaywrightBridge`:

```rust
cdp_clients: Arc<Mutex<HashMap<String, Arc<CdpClient>>>>,
```

And update `connect_to_browser()` (line 286-303) to actually store a working async
CdpClient instead of using the sync tungstenite connect that currently discards the
connection.

Additionally in `browser.rs`, after the `client.navigate(&url)` call on line 346,
Track B adds:

```rust
// Auto-tile the app window alongside the browser
if let Err(e) = crate::ui::window::auto_tile_for_browser(&app_handle) {
    tracing::warn!("Auto-tile after navigate failed: {}", e);
}
```

Where `app_handle` must be added as a parameter to `browser_navigate` or extracted from
the Tauri State.

---

### Track C -- Chrome Extension: Context Menu + SidePanel + Overlay

**Allowed Files:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/manifest.json`
  - Add `"sidePanel"` permission and `"side_panel"` config
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/background.ts`
  - Add "Ask AGI Workforce" context menu item for selected text
  - Add sidePanel open/toggle logic
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/content.ts`
  - Replace the `addAutomationIndicator()` function with shadow DOM chat overlay
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/types.ts`
  - Add new message types: `ASK_SELECTED_TEXT`, `OPEN_SIDE_PANEL`, `TOGGLE_OVERLAY`
- NEW FILE: `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/sidepanel.html`
- NEW FILE: `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/sidepanel.ts`
- NEW FILE: `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/sidepanel.css`
- NEW FILE: `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/overlay.ts`
  - Shadow DOM chat panel logic, separate from content.ts for clarity

**Current State:**

`manifest.json`: MV3 manifest with permissions: `activeTab`, `tabs`, `storage`,
`webNavigation`, `cookies`, `scripting`, `nativeMessaging`, `alarms`, `contextMenus`.
No `sidePanel` permission. No `side_panel` key. `minimum_chrome_version: "105"`.

`background.ts`:

- `setupContextMenu()` (line 682-715): Creates "Capture Element" and "Get Element Info"
  context menu items on "all" contexts. Handler at line 702 dispatches to content script.
- `handleMessageAsync()` (line 363-481): Switch on message.type. No ASK_SELECTED_TEXT case.
- `syncTabContextWithDesktop()` (line 483-594): Sends page context to native host and runs
  planned actions. Already sends `selected_text` field.

`content.ts`:

- `addAutomationIndicator()` (line 837-871): Creates a fixed-position 40x40 circle in
  bottom-right corner with gear icon. Uses direct DOM injection (no shadow DOM). Clicking
  it shows an alert().
- `buildCurrentPageContext()` (line 175-184): Returns url, title, html (100K), selectedText.
- `handleMessageAsync()` (line 96-162): Large switch with CLICK, TYPE, GET_PAGE_INFO, etc.
  No ASK_SELECTED_TEXT or TOGGLE_OVERLAY case.

`types.ts`: Union type `NativeMessageType` has 20 values. Union type `ExtensionMessage` is
a discriminated union of 22 interfaces. No ASK_SELECTED_TEXT, OPEN_SIDE_PANEL, or
TOGGLE_OVERLAY types.

**Will Produce:**

1. **Context menu "Ask AGI Workforce"**: Add to `setupContextMenu()` in background.ts:

   ```typescript
   chrome.contextMenus.create({
     id: 'ask-agi-workforce',
     title: 'Ask AGI Workforce about "%s"',
     contexts: ['selection'],
   });
   ```

   Handler sends the selected text + page URL to native host as a chat message:

   ```typescript
   // In contextMenus.onClicked handler:
   if (info.menuItemId === 'ask-agi-workforce' && info.selectionText) {
     sendNativeRequest({
       type: 'chat_message',
       text: info.selectionText,
       url: info.pageUrl || '',
       source: 'context_menu',
     });
   }
   ```

2. **Chrome sidePanel**: Add to manifest.json:

   ```json
   "permissions": [..., "sidePanel"],
   "side_panel": {
     "default_path": "src/sidepanel.html"
   },
   "minimum_chrome_version": "114"
   ```

   Create `sidepanel.html` with a mini chat queue UI. The panel communicates with
   background.ts via `chrome.runtime.sendMessage`. The panel displays pending messages
   (chat queue) and allows sending new queries. Messages flow:
   sidePanel -> background.ts -> native host -> desktop app.

3. **Comet-style floating overlay**: Replace `addAutomationIndicator()` in content.ts
   with a shadow DOM chat panel. Structure:
   ```typescript
   function createOverlayPanel(): void {
     const host = document.createElement('div');
     host.id = 'agi-workforce-overlay-host';
     const shadow = host.attachShadow({ mode: 'closed' });
     // Inject styles and mini-chat UI into shadow DOM
     // Includes: text input, send button, message list, minimize button
     // The panel is draggable and starts minimized (just the icon)
     document.body.appendChild(host);
   }
   ```
   The overlay communicates with background.ts via `chrome.runtime.sendMessage({ type: 'SYNC_PAGE_CONTEXT', ... })` for context and a new `ASK_SELECTED_TEXT` type for queries.

**New types to add to types.ts:**

```typescript
// Add to NativeMessageType union:
| 'ASK_SELECTED_TEXT'
| 'OPEN_SIDE_PANEL'
| 'TOGGLE_OVERLAY'

// New interfaces:
export interface AskSelectedTextMessage extends BaseMessage {
  type: 'ASK_SELECTED_TEXT';
  selectedText: string;
  pageUrl: string;
  pageTitle: string;
}

export interface OpenSidePanelMessage extends BaseMessage {
  type: 'OPEN_SIDE_PANEL';
}

export interface ToggleOverlayMessage extends BaseMessage {
  type: 'TOGGLE_OVERLAY';
  visible?: boolean;
}
```

---

### Track D -- Frontend: Permission Modal + Browser Mode Indicator

**Allowed Files:**

- NEW FILE: `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/PermissionModal.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/index.tsx`
  - ONLY the stream-error listener (around line 1152-1260) to detect permission errors
    and trigger the modal
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Settings/AutomationPermissionsSettings.tsx`
  - READ ONLY -- reuse the `AutomationPermissions` interface and `invoke` patterns
- NEW FILE: `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/BrowserModeIndicator.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/hooks/useAgenticEvents.ts`
  - Add listener for `agent:permission-required` event (around the extension event block
    starting at line 825)

**Current State:**

`AutomationPermissionsSettings.tsx`: Already has a full permissions settings panel with
`invoke('check_automation_permissions')` and `invoke('request_automation_permission', { kind })`.
The component shows check/X icons and "Grant" buttons that open System Settings. This file
is UNTRACKED (new, not yet committed).

`UnifiedAgenticChat/index.tsx` line 1154: Listens for `chat:stream-error`. When error string
contains permission-related text, currently just displays the error as a message. No modal
is shown.

`useAgenticEvents.ts`: Listens for `extension:page-context` at line 825. Does NOT listen
for `agent:permission-required` (event does not exist yet -- Track A creates it).

`tauri-mock.ts` line 27-30: Already mocks `check_automation_permissions` and
`request_automation_permission`.

**Will Produce:**

1. **PermissionModal.tsx**: A dialog/modal component that:
   - Appears when `agent:permission-required` event fires
   - Shows which permissions are missing (reuses `invoke('check_automation_permissions')`)
   - Has "Open System Preferences" buttons per permission (reuses
     `invoke('request_automation_permission', { kind })`)
   - Auto-refreshes permission status on a 2-second interval while open
   - Has a "Retry" button that re-sends the last chat message
   - Has a "Dismiss" button

   Interface consumed from Track A:

   ```typescript
   interface PermissionRequiredEvent {
     error_type: 'automation_permissions';
     message: string;
     permissions_needed: ('accessibility' | 'screen_recording' | 'input_monitoring')[];
   }
   ```

   Tauri commands used (already exist):
   - `check_automation_permissions` -> `AutomationPermissions`
   - `request_automation_permission` -> `void`

2. **BrowserModeIndicator.tsx**: A toolbar component that shows:
   - Green dot + "Browser Connected" when browser CDP is active
   - Orange dot + "Docked" when window is docked
   - Listens for `window:state` event (already emitted by window/mod.rs:388)

   Interface from existing events:

   ```typescript
   interface DockState {
     dock: 'Left' | 'Right' | null;
     pinned: boolean;
     always_on_top: boolean;
     maximized: boolean;
     fullscreen: boolean;
   }
   ```

3. **Event listener in useAgenticEvents.ts**: Add a new listener for
   `agent:permission-required` that sets a store flag to show the modal.

---

## Interface Contracts

### Track A -> Track D: Permission Required Event

- **Event name:** `agent:permission-required`
- **Emitted from:** `chat/mod.rs` line ~2435 (alongside existing `chat:stream-error`)
- **Payload:**
  ```rust
  // Rust emission:
  serde_json::json!({
      "error_type": "automation_permissions",
      "message": "Agent mode requires automation permissions",
      "permissions_needed": ["accessibility", "screen_recording", "input_monitoring"]
  })
  ```
- **Consumed by:** Track D's `useAgenticEvents.ts` listener and `PermissionModal.tsx`
- **TypeScript type:**
  ```typescript
  interface PermissionRequiredEvent {
    error_type: 'automation_permissions';
    message: string;
    permissions_needed: ('accessibility' | 'screen_recording' | 'input_monitoring')[];
  }
  ```

### Track A -> Track B: Auto-Tile Function

- **Function:** `pub fn auto_tile_for_browser(app: &tauri::AppHandle) -> Result<()>`
- **Location:** `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/ui/window/mod.rs`
- **Called by:** Track B in `browser.rs` after `browser_navigate` completes (line 346)
- **Behavior:** Gets the main window, calls `apply_dock(window, app_state, DockPosition::Right)`

### Track A -> Chat System: Page Context State

- **Type:** `pub struct PageContextState(pub Arc<tokio::sync::Mutex<Option<PageContext>>>);`
- **Registered in:** lib.rs as Tauri managed state
- **Written by:** `process_page_context_event()` in extension.rs
- **Read by:** System prompt builder in chat/mod.rs (after line 1913)
- **PageContext struct** (already defined in extension.rs:14-22):
  ```rust
  pub struct PageContext {
      pub url: String,
      pub title: String,
      pub html: String,
      pub selected_text: Option<String>,
      pub tab_id: u32,
      pub timestamp: u64,
  }
  ```

### Track C -> Extension Types: New Message Types

- **New NativeMessageType values:** `'ASK_SELECTED_TEXT'`, `'OPEN_SIDE_PANEL'`, `'TOGGLE_OVERLAY'`
- **Location:** `apps/extension/src/types.ts`
- **Consumed by:** background.ts switch statement and content.ts switch statement

### Track C -> Native Host: Chat Message from Context Menu

- **Native message format:**
  ```json
  {
    "type": "chat_message",
    "text": "<selected text>",
    "url": "<page URL>",
    "source": "context_menu"
  }
  ```
- **Consumed by:** The desktop app's native messaging handler. NOTE: The desktop app may
  need to handle a new `chat_message` native message type. Track C should document this
  requirement but NOT modify the Rust native messaging handler (which is in Track A's
  territory if needed).

---

## DO NOT TOUCH Sections

### Critical -- No Agent May Modify:

1. **`/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/lib.rs`**
   - Core entry point. Only Track A may add the `PageContextState` to managed state.
   - NO other track may modify lib.rs.

2. **`/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/`**
   - Agent runtime (planner.rs, executor.rs, autonomous.rs, ai_orchestrator.rs)
   - These files control the agent execution pipeline and must not be touched.

3. **`/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/`**
   - LLM routing, provider adapters, SSE parser, cost calculator
   - No changes needed for this feature set.

4. **`/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/`**
   - Master password, secret management, auth
   - Security-sensitive code must not be touched.

5. **`/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/`**
   - Database, settings, state persistence
   - No schema changes needed.

6. **`/Users/siddhartha/Desktop/agiworkforce/packages/types/`**
   - Shared TypeScript type definitions -- cross-package types
   - No changes needed.

7. **`/Users/siddhartha/Desktop/agiworkforce/apps/web/`**
   - Next.js web app -- completely out of scope.

8. **`/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/`**
   - Zustand stores. Track D may add a small boolean flag for modal visibility to the
     appropriate store, but must NOT restructure any existing store.

### Track-Specific Boundaries:

- **Track A** must NOT touch `playwright_bridge.rs` or `cdp_client.rs` (Track B's territory)
- **Track B** must NOT touch `chat/mod.rs` or `extension.rs` (Track A's territory)
- **Track B** must NOT touch any extension files (Track C's territory)
- **Track C** must NOT touch any Rust files or desktop frontend files
- **Track D** must NOT touch any Rust files or extension files
- **Track D** must NOT modify the `AutomationPermissionsSettings.tsx` file (it can import
  patterns from it but should not edit it)

### Overlap Zone -- Coordination Required:

- `browser.rs` line 346: Track B adds the `auto_tile_for_browser` call. Track A creates
  the `auto_tile_for_browser` function in `window/mod.rs`. Track A's code must be merged
  first or Track B must compile with `auto_tile_for_browser` as a no-op stub.

- `lib.rs` managed state: Only Track A may add `PageContextState`. The PR must register
  it alongside existing state. Other tracks must not touch lib.rs.

- `extension.rs` `process_page_context_event`: Track A modifies this to write to
  `PageContextState`. Track C does NOT touch this file.

---

## Compilation & Lint Notes

- Rust: `deny(unused)` and `deny(dead_code)` are active. Every new function must be used
  or gated with `#[allow(dead_code)]` temporarily.
- TypeScript: ESLint runs with `--max-warnings=15`. New code must not introduce warnings.
- Extension: The `apps/extension/` directory is EXCLUDED from monorepo linting. Extension
  code has its own standards.
- `minimum_chrome_version` in manifest.json must be bumped from "105" to "114" for
  sidePanel API support.

---

## Verification Checklist

Before spawning agents, verify:

- [x] All file paths verified to exist in the codebase
- [x] `playwright_bridge.rs` -- confirmed stub methods, no navigate/click/type/screenshot
- [x] `cdp_client.rs` -- confirmed full CDP implementation exists to delegate to
- [x] `window/mod.rs` line 17 -- confirmed `DOCKING_ENABLED: bool = false`
- [x] `chat/mod.rs` line 2435 -- confirmed permission error emission path
- [x] `chat/mod.rs` line 1708-1913 -- confirmed system prompt building with no page context
- [x] `extension.rs` -- confirmed PageContext struct and process_page_context_event
- [x] `system_permissions.rs` -- confirmed Tauri commands exist and are registered in lib.rs
- [x] `AutomationPermissionsSettings.tsx` -- confirmed component exists untracked
- [x] `manifest.json` -- confirmed no sidePanel permission, min_chrome "105"
- [x] `background.ts` -- confirmed context menu has only 2 items, no "Ask" item
- [x] `content.ts` -- confirmed basic indicator, no shadow DOM overlay
- [x] `types.ts` -- confirmed no ASK_SELECTED_TEXT or sidePanel types
- [x] No circular dependencies between agent scopes
- [x] Interface contracts (event payloads, function signatures) are explicitly defined
- [x] DO NOT TOUCH sections are comprehensive
