# Feature: Browser Automation

> A full-stack browser control system enabling the AI agent and the user to programmatically launch, navigate, interact with, inspect, and record web browsers — using the Chrome DevTools Protocol (CDP) over WebSocket as the primary transport, with a Chrome extension fallback for environments where CDP remote debugging is unavailable.

## Where It Lives

| Layer | Location |
|-------|----------|
| Frontend Components | `apps/desktop/src/components/Browser/BrowserWorkspace.tsx` |
| | `apps/desktop/src/components/Browser/BrowserViewer.tsx` |
| | `apps/desktop/src/components/Browser/BrowserRecorder.tsx` |
| | `apps/desktop/src/components/Browser/BrowserActionLog.tsx` |
| | `apps/desktop/src/components/Browser/BrowserDebugPanel.tsx` |
| | `apps/desktop/src/components/Browser/BrowserVisualization.tsx` |
| | `apps/desktop/src/components/Browser/index.ts` |
| Stores | `apps/desktop/src/stores/browserStore.ts` |
| | `apps/desktop/src/stores/automationStore.ts` |
| Hooks | `apps/desktop/src/hooks/useBrowserAutomation.ts` |
| | `apps/desktop/src/hooks/useAutomationEvents.ts` |
| Rust Commands | `apps/desktop/src-tauri/src/sys/commands/browser.rs` |
| | `apps/desktop/src-tauri/src/sys/commands/automation.rs` |
| | `apps/desktop/src-tauri/src/sys/commands/automation_enhanced.rs` |
| Rust Core Logic | `apps/desktop/src-tauri/src/automation/browser/mod.rs` |
| | `apps/desktop/src-tauri/src/automation/browser/playwright_bridge.rs` |
| | `apps/desktop/src-tauri/src/automation/browser/cdp_client.rs` |
| | `apps/desktop/src-tauri/src/automation/browser/dom_operations.rs` |
| | `apps/desktop/src-tauri/src/automation/browser/tab_manager.rs` |
| | `apps/desktop/src-tauri/src/automation/browser/advanced.rs` |
| | `apps/desktop/src-tauri/src/automation/browser/extension_bridge.rs` |
| | `apps/desktop/src-tauri/src/automation/browser/semantic.rs` |
| Native UI | `apps/desktop/src-tauri/src/ui/window/mod.rs` (`auto_tile_for_browser`) |

---

## Data Flow

### 1. Initialization

```
User opens Browser panel
  → BrowserWorkspace.tsx mounts
  → useEffect detects !initialized
  → useBrowserStore.initialize()
  → invoke('browser_init')  [Tauri IPC]
  → browser.rs: browser_init() checks BrowserStateWrapper.is_available()
  → Returns Ok(()) if BrowserState initialized, Err if degraded mode
  → Store sets initialized = true
  → Three Tauri event listeners registered (NOTE: none of these events are actually emitted by any Rust code — see Known Issues):
      listen('browser:action')  → addAction() → actions[] (never emitted by Rust)
      listen('browser:console') → consoleLogs[] (capped at 5000) (never emitted by Rust)
      listen('browser:network') → networkRequests[] (capped at 5000) (never emitted by Rust)
```

### 2. Launching a Browser

```
User clicks "Launch Browser" → selects "Chromium (Headed)"
  → BrowserWorkspace.handleLaunchBrowser('Chromium', false)
  → useBrowserStore.launchBrowser('Chromium', false)
  → invoke('browser_launch', { browserType: 'Chromium', headless: false })  [Tauri IPC]
  → browser.rs: browser_launch()
      → BrowserOptions::default() (headless=false, viewport=1280×720, timeout=30s)
      → PlaywrightBridge.launch_browser(BrowserType::Chromium, options)
          → build_browser_command() → finds Chrome/Chromium binary via platform paths
              macOS/Linux: "chromium"
              Windows: searches LOCALAPPDATA + Program Files
          → Args: --remote-debugging-port=9222 --no-first-run --no-default-browser-check
          → std::process::Command::new(exe).args(args).spawn()
          → Stores Child process in browser_processes HashMap (keyed by uuid)
          → Returns BrowserHandle { id: uuid, browser_type, ws_endpoint }
  → Returns sessionId (uuid string)
  → Store creates BrowserSession { id, browserType, headless, tabs: [], active: true }
  → Store sets activeSessionId = sessionId
```

### 3. Opening a Tab and Navigating

```
User enters URL → clicks "Go"
  → BrowserWorkspace.handleOpenTab()
  → useBrowserStore.openTab(url)
  → invoke('browser_open_tab', { url })  [Tauri IPC]
  → browser.rs: browser_open_tab()
      → Tries Chrome HTTP API: PUT http://127.0.0.1:9222/json/new?{url}
          → On success: parses JSON for { id: chromeTargetId }
          → TabManager.register_tab(chromeTargetId, url)
      → On HTTP failure (Chrome not running): falls back to TabManager.open_tab(url)
          → Generates new UUID as tab_id
          → TabInfo { id, url, title: "Loading...", loading: true, created_at }
          → Sets active_tab = tab_id (if no active tab)
  → Returns tabId string
  → Store pushes BrowserTab { id, url, title, active: true } into session.tabs

User types URL → presses Enter or clicks refresh icon
  → BrowserWorkspace.handleNavigate()
  → useBrowserStore.navigateTab(tabId, url)
  → invoke('browser_navigate', { tabId, url })  [Tauri IPC]
  → browser.rs: browser_navigate(app, state, url, tab_id)
      → TabManager verifies tab exists, gets target_tab_id
      → BrowserStateWrapper.get_cdp_client_for_tab(target_tab_id)
          → BrowserState.get_cdp_client(tab_id):
              → Checks cdp_clients HashMap; creates new CdpClient if missing
              → ws_url = "ws://127.0.0.1:9222/devtools/page/{tab_id}"
              → CdpClient.connect():
                  → tokio_tungstenite::connect_async(ws_url)
                  → Spawns writer task (mpsc::unbounded_channel sender)
                  → Spawns reader task (std::sync::mpsc::channel receiver)
              → Caches client in cdp_clients HashMap
      → CdpClient.navigate(url):
          → send_command("Page.navigate", { url })
          → Waits for response matching command id
      → auto_tile_for_browser() [first navigation only, one-shot via AtomicBool]:
          → Docks main app window to DockPosition::Right so browser occupies left half
  → Store updates tab.url, tab.title for local state
```

### 4. Interacting with the Page (Click / Type)

```
User enters CSS selector → clicks "Click Element"
  → BrowserWorkspace.handleClick()
  → useBrowserStore.clickElement(tabId, selector)
  → invoke('browser_click', { tabId, selector })  [Tauri IPC]
  → browser.rs: browser_click(state, selector, tab_id)
      → is_valid_css_selector(selector):
          → Allowlist: alphanumerics + " .#_->+~:[]=^$*|\"'()"
          → Rejects anything outside this set (prevents JS injection via CDP)
      → BrowserStateWrapper.get_client_for_tab(tab_id)
      → DomOperations::click(client, selector, ClickOptions::default()):
          → CdpClient.click_element(selector):
              → Evaluates JS via CDP Runtime.evaluate:
                "document.querySelector('{selector}').click()"
              → Returns error if element not found
```

### 5. Live Screenshot Streaming (BrowserViewer)

```
BrowserViewer mounts with currentTabId
  → useEffect: startStreaming(currentTabId)
  → useBrowserStore.startStreaming(tabId):
      → window.setInterval(500ms, async () => {
          → invoke('browser_get_screenshot_stream', { tabId })
          → browser.rs: browser_get_screenshot_stream():
              → CdpClient.capture_screenshot(full_page=false)
              → send_command("Page.captureScreenshot", { format: "png" })
              → Returns base64-encoded PNG bytes
          → addScreenshot({ id: uuid, timestamp, data: base64, tabId })
              → screenshots[] capped at 50 entries
        })
      → streamIntervalId stored in state
  → BrowserViewer renders <img src="data:image/png;base64,{latest.data}" />
  → Supports zoom (0.5x-3x), pan (mouse drag), fullscreen (Fullscreen API)
  → Element highlight overlay: scaledBounds computed from highlightedElement state
    proportionally scaled to rendered image dimensions via ResizeObserver
```

### 6. Recording User Actions

```
User clicks "Start Recording"
  → useBrowserStore.startRecording()
  → isRecording = true, recordedSteps = []

Any subsequent action (click, navigate, type) succeeds
  → useBrowserStore.addAction(action)
      → if isRecording && action.success:
          → RecordedStep { id: uuid, type, selector, value, timestamp }
          → addRecordedStep(step) [capped at 1000]

User clicks "Stop Recording"
  → useBrowserStore.stopRecording()
  → isRecording = false

User views Code tab in BrowserRecorder
  → generatePlaywrightCode() / generatePuppeteerCode() / generateSeleniumCode()
  → Pure string-template code generation from recordedSteps array
  → No backend call — purely in-store

User downloads .spec.ts file
  → Blob URL created from generated code string → anchor.click()
```

### 7. Recording Replay (useBrowserAutomation hook)

```
hook.playRecording(steps, options)
  → Sets isPlayingBack=true, totalSteps=steps.length
  → listen('browser:playback_progress') for step tracking
  → Iterates steps sequentially:
      navigate → invoke('browser_navigate', ...)
      click    → invoke('browser_click', ...)
      type     → invoke('browser_type', ...)
      wait     → invoke('browser_wait_for_selector', ...)
      screenshot → invoke('browser_screenshot', ...)
      execute  → invoke('browser_evaluate', ...)
  → delayBetweenSteps (default 500ms) between each step
  → stopOnError option aborts loop on first failure
  → playbackAbortRef allows external abort via stopPlayback()
  → Calls onStepStart/onStepComplete/onPlaybackComplete callbacks
```

### 8. Automation Events (OS-level, useAutomationEvents hook)

```
App root mounts useAutomationEvents()
  → Registers Tauri event listeners:
      'automation:recording_started'
          → normalizes snake_case payload (session_id → sessionId)
          → automationStore.handleRecordingStarted()
      'automation:recording_stopped'
          → normalizeRecording() + automationStore.handleRecordingStopped()
      'automation:action_recorded'
          → normalizeRecordedAction() + automationStore.handleActionRecorded()
      'shortcut_action' → automationStore.handleShortcutAction()
      'shortcut_registered' → automationStore.handleShortcutRegistered()
      'shortcut_unregistered' → automationStore.handleShortcutUnregistered()
  → Cleanup: all unlisten functions called on component unmount
  → Uses isMountedRef guard to prevent state updates after unmount
  → Uses handlersRef + store.subscribe() to always hold latest handler refs
    without re-registering listeners on every render
```

### 9. JavaScript Evaluation (Security-Gated)

```
User enters script → clicks "Execute Script"
  → useBrowserStore.executeScript(tabId, script)
  → invoke('browser_evaluate', { tabId, script })  [Tauri IPC]
  → browser.rs: browser_evaluate(app, state, confirmation_state, script, tab_id)
      → Creates ToolConfirmationRequest {
            tool_name: "browser_evaluate",
            risk_level: RiskLevel::Critical,
            safety_tier: ToolSafetyTier::RequiresExplicitApproval,
            reversible: false
          }
      → request_tool_confirmation(app, confirmation_state, request, timeout=120s)
          → Shows confirmation dialog to user
      → If not approved: returns Err("JavaScript evaluation cancelled by user")
      → If approved: CdpClient.evaluate(script)
          → send_command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
          → Returns serde_json::Value
```

### 10. Extension Bridge Fallback Path

```
When CDP is unavailable (no Chrome with --remote-debugging-port):
  → ExtensionBridge.send_message(ExtensionMessage::...)
      → extension_message_to_native_payload() converts to JSON NativeMessage
      → send_native_message_via_realtime(payload):
          → Retries up to 3 times with exponential backoff (250ms base)
          → Per attempt: send_native_message_once(payload):
              → Reads ~/.ipc_token for auth
              → WebSocket connect to ws://127.0.0.1:8787 (signaling server)
              → Sends RealtimeEvent::Authenticate { user_id, token }
              → Awaits RealtimeEvent::Authenticated (4s timeout)
              → Sends RealtimeEvent::NativeMessage { id: uuid, payload }
              → Awaits RealtimeEvent::NativeResponse { id, success, data } (15s timeout)
          → Non-retryable errors: config errors, auth errors, native response errors
          → Transient errors (network timeout): retried
```

---

## Rust Commands (IPC)

All commands live in `apps/desktop/src-tauri/src/sys/commands/browser.rs` and receive `State<'_, BrowserStateWrapper>`. All parameters use camelCase in `invoke()` calls per the Tauri IPC rule.

| Command Name | Key Parameters | Return Type | Notes |
|---|---|---|---|
| `browser_init` | — | `Result<(), String>` | Checks if BrowserStateWrapper is available; errors in degraded mode |
| `browser_check_status` | — | `Result<Value, String>` | Returns `{ available: bool, error: string \| null }` — **NOT REGISTERED in `generate_handler![]`; function exists in `browser.rs` but IPC calls will fail** |
| `browser_launch` | `options?: { headless: bool }` | `Result<String, String>` | Spawns browser process, returns session UUID |
| `browser_open_tab` | `url?: String` | `Result<String, String>` | Creates tab via CDP HTTP API `PUT /json/new`, falls back to internal tracking |
| `browser_close_tab` | `tabId?: String` | `Result<(), String>` | Closes via `GET /json/close/{id}`, removes from TabManager |
| `browser_switch_tab` | `tabId: String` | `Result<(), String>` | Sets active tab in TabManager |
| `browser_list_tabs` | — | `Result<Vec<String>, String>` | Returns vec of tab IDs |
| `browser_navigate` | `url: String`, `tabId?: String` | `Result<(), String>` | CDP `Page.navigate`; triggers `auto_tile_for_browser` on first call |
| `browser_go_back` | `tabId?: String` | `Result<(), String>` | Evaluates `window.history.back()` via CDP |
| `browser_go_forward` | `tabId?: String` | `Result<(), String>` | Evaluates `window.history.forward()` via CDP |
| `browser_reload` | `tabId?: String` | `Result<(), String>` | Evaluates `window.location.reload()` via CDP |
| `browser_get_url` | `tabId?: String` | `Result<String, String>` | CDP Runtime.evaluate → `window.location.href` |
| `browser_get_title` | `tabId?: String` | `Result<String, String>` | CDP Runtime.evaluate → `document.title` |
| `browser_click` | `selector: String`, `tabId?: String` | `Result<(), String>` | CSS allowlist validation + `element.click()` via CDP |
| `browser_type` | `selector: String`, `text: String`, `tabId?: String` | `Result<(), String>` | CSS allowlist validation + sets `element.value`, dispatches `input`/`change` events |
| `browser_hover` | `selector: String`, `tabId?: String` | `Result<(), String>` | Dispatches `mouseover`/`mouseenter` via CDP |
| `browser_focus` | `selector: String`, `tabId?: String` | `Result<(), String>` | Calls `element.focus()` via CDP |
| `browser_get_text` | `selector: String`, `tabId?: String` | `Result<String, String>` | Returns `element.textContent \|\| element.innerText` |
| `browser_get_attribute` | `selector: String`, `attribute: String`, `tabId?: String` | `Result<Option<String>, String>` | Returns `element.getAttribute(attr)` |
| `browser_wait_for_selector` | `selector: String`, `timeout?: u64`, `tabId?: String` | `Result<(), String>` | Polls DOM every 100ms up to timeout (default 30s) |
| `browser_select_option` | `selector: String`, `value: String`, `tabId?: String` | `Result<(), String>` | Sets `select.value`, dispatches `change` |
| `browser_check` | `selector: String`, `tabId?: String` | `Result<(), String>` | Sets `element.checked = true`, dispatches `change` |
| `browser_uncheck` | `selector: String`, `tabId?: String` | `Result<(), String>` | Sets `element.checked = false`, dispatches `change` |
| `browser_scroll_into_view` | `selector: String`, `tabId?: String` | `Result<(), String>` | Calls `element.scrollIntoView({ behavior: 'smooth', block: 'center' })` |
| `browser_query_all` | `selector: String`, `tabId?: String` | `Result<Vec<String>, String>` | Returns text content of all matching elements |
| `browser_screenshot` | `selector?: String`, `tabId?: String` | `Result<String, String>` | Returns base64 PNG; selector parameter not yet supported |
| `browser_get_screenshot_stream` | `tabId?: String` | `Result<String, String>` | Same as screenshot; called on 500ms interval for live view |
| `browser_get_content` | `tabId?: String` | `Result<String, String>` | Returns `document.documentElement.outerHTML` |
| `browser_get_dom_snapshot` | `tabId?: String` | `Result<String, String>` | Alias for `browser_get_content` |
| `browser_evaluate` | `script: String`, `tabId?: String` | `Result<Value, String>` | **Requires explicit user confirmation (Critical risk)** before CDP Runtime.evaluate |
| `browser_execute_async_js` | `script: String`, `tabId?: String` | `Result<Value, String>` | **Requires explicit user confirmation (Critical risk)**; wraps script in `Promise.resolve().then(async () => {...})` |
| `browser_get_element_state` | `selector: String`, `tabId?: String` | `Result<Value, String>` | Returns `{ visible, enabled, checked, selected, focused, tagName, id, classes }` via inline JS |
| `browser_wait_for_interactive` | `selector: String`, `timeoutMs?: u64`, `tabId?: String` | `Result<(), String>` | Polls 100ms until element is visible+enabled; default 30s timeout |
| `browser_fill_form` | `selector: String`, `data: Value`, `tabId?: String` | `Result<(), String>` | Iterates JSON object fields; matches inputs by `name`, `id`, or selector within form |
| `browser_drag_and_drop` | `source: String`, `target: String`, `tabId?: String` | `Result<(), String>` | Dispatches `dragstart`/`dragenter`/`dragover`/`drop`/`dragend` events via CDP |
| `browser_upload_file` | `selector: String`, `paths: Vec<String>`, `tabId?: String` | `Result<(), String>` | Validates paths (no `..`, no null bytes, file must exist); sets `input.files` via DataTransfer API |
| `browser_get_cookies` | `tabId?: String` | `Result<Vec<Value>, String>` | CDP `Network.getCookies` via AdvancedBrowserOps |
| `browser_set_cookie` | `cookie: Value`, `tabId?: String` | `Result<(), String>` | CDP `Network.setCookie` |
| `browser_clear_cookies` | `tabId?: String` | `Result<(), String>` | CDP `Network.clearBrowserCookies` |
| `browser_get_performance_metrics` | `tabId?: String` | `Result<Value, String>` | Reads `performance.timing` + paint entries + `performance.memory` |
| `browser_wait_for_navigation` | `timeoutMs?: u64`, `tabId?: String` | `Result<(), String>` | Polls `window.location.href` change + listens for `load` event |
| `browser_highlight_element` | `selector: String`, `tabId?: String` | `Result<Value, String>` | Returns `{ success, bounds: { x, y, width, height } }` from `getBoundingClientRect()` |
| `browser_get_console_logs` | — | `Result<Vec<String>, String>` | **Stub — returns empty vec** |
| `browser_get_network_activity` | — | `Result<Vec<Value>, String>` | **Stub — returns empty vec** |
| `browser_get_frames` | — | `Result<Vec<String>, String>` | **Stub — returns empty vec; NOT REGISTERED in `generate_handler![]`** |
| `browser_execute_in_frame` | `frameId: String`, `script: String` | `Result<Value, String>` | **Stub — returns null; NOT REGISTERED in `generate_handler![]`** |
| `browser_call_function` | `function: String`, `args: Value` | `Result<Value, String>` | **Stub — returns null; NOT REGISTERED in `generate_handler![]`** |
| `browser_enable_request_interception` | `enabled: bool` | `Result<(), String>` | **Stub — no-op; NOT REGISTERED in `generate_handler![]`** |
| `find_element_semantic` | `query: String` | `Result<String, String>` | **Stub — returns `"#semantic-element"`** |
| `find_all_elements_semantic` | `query: String` | `Result<Vec<String>, String>` | **Stub — returns empty vec** |
| `click_semantic` | `query: String` | `Result<(), String>` | **Stub — no-op** |
| `type_semantic` | `query: String`, `text: String` | `Result<(), String>` | **Stub — no-op** |
| `get_accessibility_tree` | — | `Result<Value, String>` | **Stub — returns null** |
| `get_interactive_elements` | — | `Result<Vec<String>, String>` | **Stub — returns empty vec; NOT REGISTERED in `generate_handler![]`** |
| `find_by_role` | `role: String`, `name?: String` | `Result<String, String>` | **Stub — returns `"#element-by-role"`; NOT REGISTERED in `generate_handler![]`** |

---

## Store Schema

### `useBrowserStore` (`browserStore.ts`)

**Core State**

| Field | Type | Description |
|---|---|---|
| `sessions` | `BrowserSession[]` | All launched browser sessions |
| `activeSessionId` | `string \| null` | Currently focused session |
| `initialized` | `boolean` | Whether `browser_init` succeeded |
| `screenshots` | `Screenshot[]` | Screenshot history, capped at 50 |
| `actions` | `BrowserAction[]` | All executed actions log, capped at 1000 |
| `domSnapshots` | `DOMSnapshot[]` | DOM HTML captures, capped at 50 |
| `consoleLogs` | `ConsoleLog[]` | Browser console output, capped at 5000 |
| `networkRequests` | `NetworkRequest[]` | Observed HTTP requests, capped at 5000 |
| `highlightedElement` | `ElementBounds \| null` | Bounding box for viewer overlay |
| `isRecording` | `boolean` | Whether step recording is active |
| `recordedSteps` | `RecordedStep[]` | Recorded automation steps, capped at 1000 |
| `isStreaming` | `boolean` | Whether 500ms screenshot poll is active |
| `streamIntervalId` | `number \| null` | `window.setInterval` handle |

**Key Types**

```typescript
interface BrowserSession {
  id: string;
  browserType: 'Chromium' | 'Firefox' | 'Webkit';
  headless: boolean;
  tabs: BrowserTab[];
  active: boolean;
}

interface BrowserTab {
  id: string;  // Chrome DevTools target ID (UUID v4)
  url: string;
  title: string;
  active: boolean;
}

type ActionType = 'navigate' | 'click' | 'type' | 'extract' | 'screenshot' | 'scroll' | 'wait' | 'execute';

interface BrowserAction {
  id: string;
  type: ActionType;
  timestamp: number;
  duration?: number;
  success: boolean;
  details: { url?: string; selector?: string; text?: string; script?: string; result?: unknown; error?: string; };
  screenshotId?: string;
}

interface RecordedStep {
  id: string;
  type: ActionType;
  selector?: string;
  value?: string;
  timestamp: number;
}
```

**Selectors exported** (memo-safe): `selectActiveSession`, `selectActiveTab`, `selectHasActiveSessions`, `selectIsStreaming`, `selectBrowserIsRecording`, `selectFailedRequests`, `selectErrorLogs`, etc.

**Middleware stack**: `devtools` (DEV only) → `subscribeWithSelector` → `immer`

---

### `useAutomationStore` (`automationStore.ts`)

Tracks OS-level desktop automation (window enumeration, UIA element search, keyboard/mouse input, script library) — distinct from browser automation but shares the recording/playback mental model.

| Field | Type | Description |
|---|---|---|
| `windows` | `AutomationElementInfo[]` | Discovered OS windows |
| `elements` | `AutomationElementInfo[]` | Found UI elements |
| `isRecording` | `boolean` | OS-level action recording active |
| `currentRecording` | `RecordingSession \| null` | Active recording session metadata |
| `pendingActions` | `RecordedAction[]` | Actions collected during recording |
| `recordings` | `Recording[]` | Completed recordings |
| `scripts` | `AutomationScript[]` | Saved automation scripts |
| `selectedScript` | `AutomationScript \| null` | Currently selected script |
| `isExecuting` | `boolean` | Script playback in progress |
| `executionProgress` | `number` | 0–100 progress indicator |
| `executionHistory` | `ExecutionHistory[]` | Past execution results |
| `currentExecution` | `ExecutionResult \| null` | Latest execution result |
| `inspector.isActive` | `boolean` | Element inspector mode |
| `inspector.currentElement` | `DetailedElementInfo \| undefined` | Inspected element |
| `shortcuts` | `Shortcut[]` | Registered hotkeys |
| `lastTriggeredShortcut` | `string \| null` | Most recently fired shortcut action |

**Key IPC calls**: `automation_record_start` → `automation_record_stop` → `save_recording_as_script` → `list_automation_scripts` → `execute_automation_script`

---

## Component Tree

```
BrowserWorkspace
├── Header bar (Globe icon, session count, "Launch Browser" dropdown)
│   └── DropdownMenu → handleLaunchBrowser(browserType, headless)
├── [No session] → Empty state placeholder
└── [Active session]
    ├── Navigation bar (Back, Forward, Refresh, URL Input, Go button)
    └── Tabs
        ├── Controls tab
        │   ├── CSS Selector input
        │   ├── "Click Element" button → handleClick()
        │   ├── Text input
        │   └── "Type Text" button → handleType()
        ├── Content tab
        │   ├── "Get Page Content" button → handleGetContent()
        │   └── <pre> showing HTML
        ├── Screenshot tab
        │   ├── "Capture Screenshot" button → handleScreenshot()
        │   └── <img src="data:image/png;base64,...">
        └── Script tab
            ├── <textarea> for JS
            └── "Execute Script" button → handleExecuteScript()

BrowserVisualization
├── TabsList → "Preview" / "Console"
├── TabsContent("live") → BrowserViewer
└── TabsContent("actions") → BrowserActionLog

BrowserViewer
├── Control bar
│   ├── Play/Pause streaming toggle
│   ├── Zoom controls (ZoomOut, %, ZoomIn, Reset)
│   └── Fullscreen toggle
├── Image canvas (pan+zoom with mouse drag)
│   ├── <img ref={imageRef}> with latest screenshot (base64)
│   └── Highlight overlay (yellow border box, "Target Element" label)
└── Status bar (last updated time, screenshot count)

BrowserRecorder
├── Header (recording indicator dot, step count badge)
│   ├── "Start Recording" / "Stop" button
│   └── Trash (clear) button → useConfirm dialog
└── Tabs
    ├── Steps tab → ScrollArea of RecordedStep list
    │   └── Each step: index circle, action badge, timestamp, selector/value, Edit button
    └── Code tab
        ├── Format selector (playwright | puppeteer | selenium)
        ├── Copy / Download buttons
        └── <pre><code>{generateCode()}</code></pre>

BrowserActionLog
├── Search bar + Export JSON + Clear buttons
├── Filter buttons (All, navigate, click, type, extract, screenshot, scroll, wait, execute)
└── ScrollArea of BrowserAction entries (timeline with connector lines)
    └── Each entry: colored icon, action badge, timestamp, duration, success/fail indicator

BrowserDebugPanel
├── Header (Code icon, Refresh button)
└── Tabs
    ├── DOM tab → HTML snapshot viewer with selector search
    ├── Console tab → filterable log list (log/info/warn/error)
    ├── Network tab → HTTP request timeline (method, URL, status, duration)
    ├── Storage tab (StorageViewer sub-component)
    │   ├── Type selector (localStorage / sessionStorage / cookies)
    │   ├── Search input
    │   └── Key/value list [NOTE: currently renders mock data, not live CDP data]
    └── Performance tab (PerformanceMetrics sub-component)
        ├── Core Web Vitals grid [NOTE: currently renders hardcoded mock values]
        ├── Memory usage bar chart [NOTE: hardcoded mock]
        └── Quick action buttons (Clear Cache, Force GC, Export Report) [NOTE: no-ops]
```

---

## Key Patterns

### Graceful Degradation — `BrowserStateWrapper`

`BrowserStateWrapper` wraps `Option<BrowserState>`. If `BrowserState::new()` fails at startup (no Chromium binary, init error), the wrapper is created in degraded mode via `new_degraded(error)`. All commands call `state.get()` which returns the `BROWSER_UNAVAILABLE_ERROR` string immediately instead of panicking. The `is_available()` check lets the frontend show a meaningful error on `browser_init` rather than a cryptic Tauri IPC failure.

### CDP over WebSocket — Two Implementations

There are two CDP transport implementations in the codebase:

1. **`CdpClient`** (`cdp_client.rs`): Async implementation using `tokio-tungstenite`. Connects to `ws://127.0.0.1:9222/devtools/page/{tab_id}` with dedicated read/write tokio tasks and a shutdown `AtomicBool`. This is the production path — all `#[tauri::command]` handlers use it.

2. **`PlaywrightBridge`** internal CDP (`playwright_bridge.rs`): Synchronous implementation using `tungstenite` (blocking). Has `send_cdp_command()`, `navigate()`, `click_selector()`, `type_text()`, `screenshot_base64()`, `evaluate_js()`. These methods are all `#[allow(dead_code)]` — they are **not wired** into any live command handler. The bridge currently only calls `launch_browser()` (to spawn the process) and `close_browser_by_id()` (to kill it); all actual page interaction goes through `CdpClient`.

### CSS Selector Injection Prevention

`browser_click`, `browser_type`, `browser_get_text`, `browser_get_attribute`, `browser_wait_for_selector`, `browser_select_option` all run `is_valid_css_selector(selector)` before touching CDP. This allowlist rejects any character outside `[A-Za-z0-9 .#_->+~:[]=^$*|"'()]`. The separately defined `sanitize_selector()` (used in `browser_get_element_state`, `browser_wait_for_interactive`, `browser_fill_form`, `browser_drag_and_drop`, `browser_upload_file`, `browser_highlight_element`) uses `serde_json::to_string()` to JSON-encode the selector, then strips outer quotes — a more robust approach since it handles all Unicode and control characters correctly.

### Two-Layer Security for JS Execution

`browser_evaluate` and `browser_execute_async_js` both require passing through `request_tool_confirmation()` with `RiskLevel::Critical` and `ToolSafetyTier::RequiresExplicitApproval`. A modal is shown to the user with a 120-second timeout. The user must explicitly approve before any JavaScript reaches the browser page. This prevents AI agents or malicious prompts from silently exfiltrating data.

### Auto-Tile on First Navigation

`browser_navigate` calls `auto_tile_for_browser(&app)` on the first successful navigation, controlled by a static `AtomicBool BROWSER_ALREADY_TILED`. This docks the main app window to the right half of the screen so the browser can occupy the left half. The flag is only set after a successful tile (never on failure) so retries work correctly.

### Recording as a Side-Effect of Action Logging

When `isRecording` is true, every call to `addAction()` that produces `success: true` automatically constructs a `RecordedStep` from the action and appends it to `recordedSteps`. There is no separate "recording mode" at the Rust layer — recording is entirely a frontend concern managed in `browserStore.ts`.

### Screenshot Streaming Loop

Live view is implemented as a `window.setInterval(500ms)` in the frontend, not as a server-push event. The interval calls `browser_get_screenshot_stream` which internally calls `CdpClient.capture_screenshot()` on every tick. This is a polling model, not a true stream. The `isStreaming` flag prevents duplicate intervals, and `stopStreaming()` calls `window.clearInterval()`.

### Event Normalization in `useAutomationEvents`

The Rust backend emits events with snake_case field names (`session_id`, `start_time`, `is_recording`, `action_type`, `timestamp_ms`, `duration_ms`, `created_at`). The hook `useAutomationEvents` normalizes these to camelCase (`sessionId`, `startTime`, etc.) before pushing them into `automationStore`. This pattern avoids polluting the store types with raw Rust casing.

### `useBrowserAutomation` Hook — Unified Action Logger

The hook wraps every `invoke()` call in an `executeCommand()` helper that:
1. Records `startTime = Date.now()`
2. Calls `invoke<T>(commandName, args)`
3. On success: calls `addAction({ type, success: true, duration, details })`
4. On error: sets `lastError` + calls `addAction({ type, success: false, duration, details.error })`
5. Always clears `isExecuting` in `finally`

This means every command called through `useBrowserAutomation` is automatically logged to the `browserStore.actions[]` array without extra boilerplate.

### Tab ID = Chrome Target ID

Tabs created via the CDP HTTP API (`PUT /json/new`) use the real Chrome DevTools target ID as the tab identifier. This same ID is used as the key path segment in the CDP WebSocket URL (`ws://127.0.0.1:9222/devtools/page/{tab_id}`). When the CDP HTTP API is unavailable (Chrome not running with `--remote-debugging-port`), a UUID is generated instead — in this case CDP connections will fail when they try to use this ID as a real target ID.

### Lock Ordering in `TabManager`

All `TabManager` methods that touch both `tabs: Arc<Mutex<HashMap>>` and `active_tab: Arc<Mutex<Option<TabId>>>` acquire them in the same order: `tabs` first, then `active_tab`. Methods that need to sleep (like `navigate()` and `reload()`) release locks before the `tokio::time::sleep()` call to prevent holding a lock across an await point. Comments in the code explicitly document these decisions as deadlock fixes.

### Extension Bridge Authentication

The `ExtensionBridge` does not use the CDP path at all. Instead, it connects to the local signaling server (`ws://127.0.0.1:8787`), authenticates with a token from `~/.ipc_token`, and sends a `NativeMessage` event. The Chrome extension receives this via its own WebSocket connection to the same server and executes the action in the browser page. Three error classes have custom prefixes for non-retryable detection: `extension_bridge_config_error:`, `extension_bridge_auth_error:`, `native_response_error:`. Internal prefixes are stripped before surfacing to the caller.

---

## Known Issues / Tech Debt

### Critical — Unregistered Commands and Stubs

Several commands exist as Rust functions in `browser.rs` but are **NOT registered** in `lib.rs` `generate_handler![]`, meaning any frontend `invoke()` call to them will fail:

- `browser_check_status` — function exists but not registered
- `browser_get_frames`, `browser_execute_in_frame`, `browser_call_function`, `browser_enable_request_interception` — stubs AND not registered
- `get_interactive_elements`, `find_by_role` — stubs AND not registered

### Critical — Stubs Masquerading as Features

The following registered commands return empty/null results silently and provide no indication to the caller that they are not implemented. Any code path that depends on them will silently receive empty data:

- `browser_get_console_logs` — returns `[]` always; the `consoleLogs` store array is only populated by the `browser:console` Tauri event (which is never emitted by any Rust code in the codebase).
- `browser_get_network_activity` — same: returns `[]`; `networkRequests` store only populated by `browser:network` event (never emitted).
- All semantic commands (`find_element_semantic`, `click_semantic`, `type_semantic`, `find_all_elements_semantic`) — stubs returning hardcoded strings (these ARE registered).
- `get_accessibility_tree` — stub (IS registered).

The `BrowserDebugPanel` Storage and Performance tabs render hardcoded mock data with no live CDP connection. This is a significant user-experience gap — the debug panel's Storage and Performance views are purely cosmetic.

### Architecture — Two Separate CDP Implementations

`PlaywrightBridge.send_cdp_command()` (synchronous, `tungstenite`) and `CdpClient.send_command()` (async, `tokio-tungstenite`) are parallel implementations of the same CDP JSON-RPC transport. All the navigation/click/evaluate methods on `PlaywrightBridge` are unused (`#[allow(dead_code)]`). The bridge was the original implementation and `CdpClient` was added as a cleaner async replacement. The bridge methods should be deleted to avoid confusion about which path is active.

### Tab Lifecycle — No Browser Process Association

`BrowserSession` (in the frontend store) holds a list of `BrowserTab` objects, but there is no mapping between a session and the browser process (child PID) on the Rust side. `BrowserStateWrapper` holds one global `PlaywrightBridge` (which has a `browser_processes` HashMap keyed by UUID). The frontend `closeBrowser(sessionId)` calls `invoke('browser_close', { browserId: sessionId })` but `browser.rs` has no `browser_close` command registered — this call will fail silently (the store still cleans up the UI state). Only `browser_close_tab` exists.

### Screenshot Stream — No True Push

The live view polling at 500ms creates one HTTP round-trip per tick (CDP WebSocket request/response). For a busy page this can cause visible lag. A proper implementation would use CDP `Page.screencastFrame` events, which push JPEG frames at a configurable rate. This would require a persistent CDP event subscription rather than a per-request model.

### `CdpClient` Connection Sharing

`BrowserState.cdp_clients` caches one `CdpClient` per `tab_id`. The `CdpClient.connection` is a `Mutex<Option<CdpConnection>>` where `CdpConnection.receiver` is a `std::sync::mpsc::Receiver` (synchronous, single-consumer). If two concurrent commands target the same tab, the `send_command()` method will both receive on the same synchronous channel from a blocking loop inside the async context (`conn.receiver.recv()` inside an `async fn`). This blocks the tokio thread for the duration of the CDP round-trip. Under high concurrency this will degrade throughput and risk thread pool exhaustion.

### File Upload Implementation

`browser_upload_file` validates file paths on the Rust side (no `..`, no null bytes, file must exist, no `file://` prefix, max 4096 chars) but then constructs a `fetch('file://' + path)` call inside a JavaScript snippet that runs in the browser page. The browser page's fetch context will reject `file://` URLs with CORS errors in most security contexts. The CDP `DOM.setFileInputFiles` method (implemented in `advanced.rs`) is the correct approach but is not wired into the command handler.

### `PlaywrightBridge.start_server()` Stub

`start_server()` launches a Windows `cmd /C echo` command as a placeholder. On macOS/Linux, `Command::new("cmd")` will fail. This method is never called from production code paths, but its existence is misleading and will cause a confusing error if ever invoked.

### `automationStore.saveRecordingAsScript` — IPC Violation

```typescript
const script = await invoke<AutomationScript>('save_recording_as_script', {
  recording_id: recording.id,  // snake_case — violates Tauri IPC rule
  ...
});
```

Per the project's Tauri IPC rule, all `invoke()` parameters must be camelCase. `recording_id` will arrive as `undefined` on the Rust side. The store has a local fallback that catches the error, so the UI does not crash, but the data is never persisted to the backend.

Similarly in `executeScript`:
```typescript
const result = await invoke<ExecutionResult>('execute_automation_script', {
  script_id: script.id,  // snake_case
  script,
});
```

### `BrowserViewer` Streaming Cleanup Race

In `useEffect`, `startStreaming(currentTabId)` is called if `!isStreaming`. The cleanup returns `stopStreaming()` only if `isStreaming` is true at cleanup time. If the component unmounts before the first streaming tick completes, `isStreaming` may still be false at cleanup, and `stopStreaming()` is never called — but the interval was already started. The interval ID is stored in Zustand state, not in a ref, so the closure over `isStreaming` can be stale. The `streamIntervalId` in state should be cleaned up via `clearInterval` from within the cleanup function unconditionally.

---

## Essential Files Reference

The following files are the most critical for understanding the Browser Automation feature end-to-end:

| File | Why Essential |
|---|---|
| `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/browser.rs` | All 40+ Tauri command handlers, security gating, CSS injection prevention, BrowserStateWrapper degraded-mode pattern |
| `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/browser/cdp_client.rs` | The active CDP transport — all DOM operations ultimately call into this |
| `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/browser/playwright_bridge.rs` | Browser process lifecycle (spawn/kill), CDP command model, and the defunct second CDP implementation |
| `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/browser/tab_manager.rs` | Tab state machine, deadlock-safe locking patterns, navigation lifecycle |
| `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/browser/mod.rs` | `BrowserState` struct — the three subsystems: PlaywrightBridge, TabManager, ExtensionBridge, CdpClient cache |
| `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/browser/extension_bridge.rs` | CDP-free fallback via realtime WebSocket relay + auth token + retry logic |
| `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/browserStore.ts` | Complete frontend state model, all IPC calls, streaming loop, recording side-effect, event listeners |
| `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/hooks/useBrowserAutomation.ts` | Rich hook API wrapping all IPC calls with unified action logging and playback engine |
| `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/hooks/useAutomationEvents.ts` | Snake_case→camelCase normalization for Rust-emitted events; listener lifecycle management |
| `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Browser/BrowserWorkspace.tsx` | Primary user-facing entry point for manual browser control |
| `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Browser/BrowserViewer.tsx` | Live screenshot viewer with zoom/pan/highlight overlay |
| `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Browser/BrowserRecorder.tsx` | Step recording + multi-framework code generation |
