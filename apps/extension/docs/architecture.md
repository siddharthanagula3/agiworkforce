# CLAUDE.md — Chrome Extension

This file provides authoritative guidance to Claude Code when working in `apps/extension/`.

---

## What This Is

Chrome MV3 extension (v1.2.0) for AGI Workforce. Bridges the desktop Tauri app to the browser via native messaging. Provides DOM automation, side panel chat (SSE streaming), WebMCP tool discovery, NLWeb detection, job application autofill, page context sync, and scheduled task execution.

- **Min Chrome**: 132 (ES module content scripts)
- **Single production dependency**: DOMPurify (XSS prevention)
- **Host permissions**: `localhost` and `127.0.0.1` ONLY — no remote access

---

## Build & Dev Commands

```bash
pnpm dev              # Vite build --watch (rebuild on file change)
pnpm build            # Production build → dist/
pnpm test             # Vitest run (jsdom env)
pnpm lint             # ESLint (separate config, content-based cache)
pnpm package          # Build + zip dist/ into extension.zip (excludes sourcemaps)
pnpm clean            # rm -rf dist
pnpm format           # Prettier (src/**/*.{js,html})
```

Load into Chrome: `chrome://extensions` → Developer mode → "Load unpacked" → select `dist/` folder.

Separate lint from monorepo root: `pnpm lint:extension` (root package.json).

---

## File Map

```
src/
├── background.ts           # Service worker — native messaging, message routing, HTTP bridge,
│                           #   WebMCP/NLWeb catalog, scheduled alarms, tab groups, reconnect
├── content.ts              # Content script — DOM automation, page context, console capture,
│                           #   WebMCP discovery, SPA navigation, floating FAB overlay
├── popup.ts                # Action popup — connection status, screenshot, side panel launcher
├── side_panel.ts           # Side panel — chat UI (SSE streaming), markdown (DOMPurify),
│                           #   WebMCP tools, action recording, model selection, API key
├── types.ts                # 66 NativeMessageType + 1 InternalMessageType (discriminated union)
├── utils.ts                # logger, RateLimiter, domUtils, formUtils, storageUtils, validators
├── webmcp.ts               # WebMCP tool discovery (declarative + imperative) & invocation
├── nlweb.ts                # NLWeb endpoint detection (/.well-known/nlweb, Schema.org)
├── page-metadata.ts        # JSON-LD, Open Graph, Twitter Card, Schema.org extraction
├── platform-prompts.ts     # Domain prompts (Slack, Gmail, Calendar, Docs, GitHub, etc.)
├── jobAutofill.ts          # Job autofill entry point → runtime module delegation
├── jobAutofill.runtime.d.ts
└── autofill/
    ├── detector.ts         # LinkedIn/Lever form detection (URL patterns, field enumeration)
    ├── filler.ts           # Field population (React-safe native value setter, event dispatch)
    ├── linkedin.ts         # LinkedIn selectors (layered fallback: ID→aria→data→placeholder)
    └── lever.ts            # Lever selectors (stable IDs: #name, #email, custom field0–9)
```

### Config Files

| File               | Purpose                                                         |
| ------------------ | --------------------------------------------------------------- |
| `manifest.json`    | MV3 manifest (permissions, CSP, commands, side panel)           |
| `vite.config.ts`   | 4 Rollup inputs, static copy, stable chunk names                |
| `tsconfig.json`    | Strict mode, ES2020, WebWorker lib                              |
| `.eslintrc.cjs`    | Separate from monorepo — Chrome globals, `no-explicit-any: off` |
| `vitest.config.ts` | jsdom env, globals, restoreMocks                                |

---

## Architecture

### Entry Points (4 Vite rollup inputs)

| File            | Chrome Context                  | Role                                                                                                                                                                       |
| --------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `background.ts` | Service worker                  | Orchestrator: native messaging port, message routing, WebMCP/NLWeb catalog per tab, HTTP bridge (localhost:8765), scheduled task alarms, tab group management              |
| `content.ts`    | Content script (all http/https) | DOM automation (click, type, scroll, forms, a11y tree), page context extraction, console log capture, WebMCP/NLWeb discovery, SPA navigation watcher, floating FAB overlay |
| `popup.ts`      | Action popup (`popup.html`)     | Connection status, screenshot capture, side panel launcher, tab grouping, session stats                                                                                    |
| `side_panel.ts` | Side panel (`side_panel.html`)  | Chat UI with SSE streaming, markdown rendering (DOMPurify), WebMCP tool display, action recording, model selection, API key management                                     |

### Communication Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│  Desktop (Tauri)                                                      │
│    ↕ native messaging port (com.agiworkforce.browser)                 │
├──────────────────────────────────────────────────────────────────────┤
│  background.ts (service worker)                                       │
│    - connectNative() → chrome.runtime.connectNative()                 │
│    - handshake: connect + ping                                        │
│    - forward native messages to content/side panel                    │
│    - manage WebMCP tools per tab (Map<tabId, tools>)                  │
│    - track NLWeb detection per tab                                    │
│    - HTTP bridge: localhost:8765 for chat SSE streaming               │
│    - schedule alarms for recurring tasks                              │
│    ↕ chrome.tabs.sendMessage              ↕ chrome.runtime messages   │
├─────────────────────────────┬────────────────────────────────────────┤
│  content.ts (per tab)       │  side_panel.ts (panel UI)              │
│  - DOM automation handlers  │  - chat message submission             │
│  - page context extraction  │  - SSE chunk rendering                 │
│  - WebMCP tool discovery    │  - markdown sanitization               │
│  - NLWeb endpoint probing   │  - API key (session storage)           │
│  - console log interception │  - model selection                     │
│  - floating FAB overlay     │  - action recording display            │
└─────────────────────────────┴────────────────────────────────────────┘
```

**Key flows:**

1. **Desktop → Content**: Desktop sends command → background forwards via `chrome.tabs.sendMessage(tabId, msg)` → content executes DOM action → response flows back
2. **Chat streaming**: Side panel `CHAT_MESSAGE` → background → HTTP bridge (localhost:8765) SSE → background fires `CHAT_CHUNK` (internal) → side panel renders incrementally
3. **Page context**: Content extracts (URL, title, HTML ≤100K, metadata) → `SYNC_PAGE_CONTEXT` → background → native port → desktop
4. **WebMCP/NLWeb**: Content discovers tools/endpoints → `WEBMCP_TOOLS_CHANGED` / `NLWEB_DETECTED` → background catalogs per tab

---

## Message Type System (`types.ts`)

### NativeMessageType (66 types)

**Envelope format:** `{ id: string, type: string, success?: boolean, error?: string, data?: unknown }`

| Category                | Types                                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DOM Automation** (18) | `CLICK`, `DOUBLE_CLICK`, `RIGHT_CLICK`, `TYPE`, `GET_TEXT`, `GET_ATTRIBUTE`, `SET_ATTRIBUTE`, `SELECT_OPTION`, `CHECK`, `UNCHECK`, `FOCUS`, `BLUR`, `HOVER`, `SCROLL`, `DRAG_DROP`, `CLICK_AT_COORDINATES`, `WAIT_FOR_SELECTOR`, `EXECUTE_SCRIPT` |
| **Page Info** (6)       | `GET_PAGE_INFO`, `GET_FORMS`, `FILL_FORM`, `SUBMIT_FORM`, `CAPTURE_ELEMENT`, `GET_ELEMENT_INFO`                                                                                                                                                   |
| **Accessibility** (2)   | `BUILD_ACCESSIBILITY_TREE`, `GET_ACCESSIBILITY_TREE`                                                                                                                                                                                              |
| **Recording** (4)       | `START_RECORDING`, `STOP_RECORDING`, `GET_RECORDED_ACTIONS`, `RUN_PAGE_ACTIONS`                                                                                                                                                                   |
| **Screenshot** (2)      | `CAPTURE_SCREENSHOT`, `CAPTURE_ELEMENT`                                                                                                                                                                                                           |
| **Console** (2)         | `GET_CONSOLE_LOGS`, `CLEAR_CONSOLE_LOGS`                                                                                                                                                                                                          |
| **Connection** (5)      | `GET_CONNECTION_STATUS`, `RECONNECT_NATIVE`, `CONNECTION_STATUS_CHANGED`, `TAB_READY`, `SYNC_PAGE_CONTEXT`                                                                                                                                        |
| **Chat** (3)            | `CHAT_MESSAGE`, `queue_message`, `open_side_panel`                                                                                                                                                                                                |
| **Cookies** (3)         | `GET_COOKIES`, `SET_COOKIE`, `CLEAR_COOKIES`                                                                                                                                                                                                      |
| **Tabs** (4)            | `GET_ALL_TABS`, `CREATE_TAB`, `CLOSE_TAB`, `SWITCH_TAB`                                                                                                                                                                                           |
| **Tab Groups** (2)      | `ADD_TAB_TO_GROUP`, `REMOVE_TAB_FROM_GROUP`                                                                                                                                                                                                       |
| **WebMCP** (3)          | `WEBMCP_DISCOVER_TOOLS`, `WEBMCP_CALL_TOOL`, `WEBMCP_TOOLS_CHANGED`                                                                                                                                                                               |
| **NLWeb** (1)           | `NLWEB_DETECTED`                                                                                                                                                                                                                                  |
| **Shortcuts** (4)       | `SAVE_SHORTCUT`, `LIST_SHORTCUTS`, `DELETE_SHORTCUT`, `REPLAY_SHORTCUT`                                                                                                                                                                           |
| **Scheduled Tasks** (4) | `CREATE_SCHEDULED_TASK`, `LIST_SCHEDULED_TASKS`, `UPDATE_SCHEDULED_TASK`, `DELETE_SCHEDULED_TASK`                                                                                                                                                 |
| **Job Autofill** (1)    | `AUTO_FILL_JOB_APPLICATION`                                                                                                                                                                                                                       |
| **Bridge** (1)          | `BRIDGE_URL_CHANGED`                                                                                                                                                                                                                              |

### InternalMessageType (1 type — NEVER sent to native host)

| Type         | Flow                    | Purpose                       |
| ------------ | ----------------------- | ----------------------------- |
| `CHAT_CHUNK` | background → side_panel | Streaming SSE response chunks |

### ConnectionStatus

`'connected' | 'disconnected' | 'connecting' | 'error'`

---

## Constants & Configuration

### Timeouts & Limits (background.ts)

```
NATIVE_HOST_NAME                  = 'com.agiworkforce.browser'
NATIVE_REQUEST_TIMEOUT_MS         = 10_000      (10s per native request)
CONTENT_SCRIPT_FORWARD_TIMEOUT_MS = 30_000      (30s for content script forwarding)
NATIVE_CONNECT_MAX_WAIT_MS        = 2_000       (2s handshake wait)
NATIVE_RECONNECT_BASE_DELAY_MS    = 1_000       (1s initial backoff)
NATIVE_RECONNECT_MAX_DELAY_MS     = 30_000      (30s max backoff)
NATIVE_RECONNECT_MAX_ATTEMPTS     = 8           (then stop — macOS popup protection)
NATIVE_CONNECT_POLL_INTERVAL_MS   = 100
MAX_SHORTCUTS                     = 50
MAX_TASKS                         = 50
SHORTCUTS_STORAGE_KEY             = 'agi_saved_shortcuts'
TASKS_STORAGE_KEY                 = 'agi_scheduled_tasks'
TASK_ALARM_PREFIX                 = 'agi_task_'
TAB_GROUP_NAME                    = 'AGI Workforce'
```

### Limits (content.ts)

```
MAX_CONTEXT_HTML_CHARS            = 100_000     (avoid hanging on huge SPAs)
MAX_CONSOLE_BUFFER                = 200         (console log entries)
MAX_CONSOLE_ENTRY_CHARS           = 1_000       (per entry truncation)
PAGE_EXTRACTION_TIMEOUT_MS        = 5_000       (metadata extraction timeout)
```

### Limits (side_panel.ts)

```
STORAGE_KEY                       = 'agi_side_panel_messages'
MAX_STORED_MESSAGES               = 50
API_KEY_STORAGE_KEY               = 'agi_api_key'
UI_FEEDBACK_DURATION_MS           = 2_000
REFRESH_FEEDBACK_DURATION_MS      = 1_000
```

### Rate Limiter (utils.ts)

```
maxRequestsPerMinute              = 120         (per tab, per message type)
screenshotCooldownMs              = 500         (CAPTURE_SCREENSHOT cooldown)
```

---

## Chrome API Usage Map

| API                               | Where                      | Purpose                                              |
| --------------------------------- | -------------------------- | ---------------------------------------------------- |
| `chrome.runtime.connectNative()`  | background                 | Native messaging port to desktop                     |
| `chrome.runtime.onMessage`        | all entry points           | Inter-context message routing                        |
| `chrome.runtime.sendMessage()`    | content, popup, side_panel | Send to background                                   |
| `chrome.tabs.sendMessage()`       | background                 | Forward to content scripts                           |
| `chrome.tabs.query()`             | background, popup          | Get active/all tabs                                  |
| `chrome.tabs.captureVisibleTab()` | background                 | Screenshot capture                                   |
| `chrome.tabs.onActivated`         | background                 | Tab switch detection                                 |
| `chrome.storage.local`            | all                        | Persistent state (shortcuts, tasks, messages, stats) |
| `chrome.storage.session`          | side_panel                 | API key (session-only, never persisted)              |
| `chrome.storage.onChanged`        | popup, side_panel          | React to storage mutations                           |
| `chrome.alarms.create/onAlarm`    | background                 | Scheduled task execution                             |
| `chrome.cookies.get/set/remove`   | background                 | Cookie management                                    |
| `chrome.sidePanel.setOptions()`   | background                 | Side panel configuration                             |
| `chrome.contextMenus`             | background                 | Right-click menu                                     |
| `chrome.tabGroups`                | background                 | Tab group management                                 |
| `chrome.scripting`                | background                 | Content script injection                             |
| `chrome.notifications`            | background                 | User notifications                                   |

---

## Manifest Permissions

```json
{
  "permissions": [
    "activeTab",
    "tabs",
    "storage",
    "nativeMessaging",
    "alarms",
    "contextMenus",
    "sidePanel",
    "scripting",
    "cookies",
    "notifications",
    "tabGroups"
  ],
  "host_permissions": ["http://localhost/*", "http://127.0.0.1/*"],
  "commands": {
    "_execute_action": { "suggested_key": "Ctrl+Shift+A" },
    "capture_page": { "suggested_key": "Ctrl+Shift+C" }
  }
}
```

---

## Coding Patterns

### Message Handling

Every entry point follows the same pattern:

```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isValidMessage(message)) return false;
  handleMessage(message, sender).then(sendResponse);
  return true; // keep message channel open for async response
});
```

Message validation:

```typescript
function isValidMessage(msg: unknown): msg is ExtensionMessage {
  return (
    msg !== null &&
    typeof msg === 'object' &&
    'type' in msg &&
    typeof (msg as any).type === 'string'
  );
}
```

### Native Messaging Envelope

```typescript
// Request
{ id: crypto.randomUUID(), type: NativeMessageType, data?: unknown }

// Response (correlated by id)
{ id: string, type: string, success: boolean, data?: unknown, error?: string }
```

Pending requests tracked in `Map<id, { resolve, reject, timeout }>`. Timeout rejects automatically.

### Error Handling

- **Content script**: Wrap all DOM operations in try/catch, return `{ success: false, error }` — never throw
- **Background**: try/catch in async handlers, return structured error responses
- **Utils**: Never throw — return `null`, empty string, or `false` on failure; always log
- **DOM injection**: Wrapped in try/catch because CSP-restricted or XML/SVG pages throw

### Async Patterns

- `withTimeout<T>(promise, ms = 30000)` — race with rejection on timeout
- `domUtils.waitForSelector(selector, timeout, visible)` — polls 100ms interval
- `chrome.runtime.sendMessage()` — Promise-based
- Always check `chrome.runtime.lastError` in callbacks
- No bare `await` without error boundary

### React-Compatible Input Filling

React overrides `HTMLInputElement.value` setter. Must bypass:

```typescript
function setNativeValue(element: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  nativeInputValueSetter?.call(element, value);
  // Then dispatch: focus → input → change → blur
}
```

### State Management

- **Service worker state is ephemeral** — Chrome kills it at any time
- **Persistent** → `chrome.storage.local` (shortcuts, tasks, messages, stats)
- **Sensitive** → `chrome.storage.session` (API key — expires on browser quit)
- **Per-tab** → `Map<tabId, state>` in memory (lost on worker restart, restored via TAB_READY)
- **CRIT: Never use `chrome.storage.local` for credentials** — it persists plaintext across sessions

### DOM Injection

```typescript
try {
  const indicator = document.createElement('div');
  indicator.style.cssText = '...'; // inline styles only (CSP compliance)
  document.body.appendChild(indicator);
} catch {
  // CSP-restricted or XML/SVG page — non-fatal, silently skip
}
```

Always use **inline styles** — external stylesheets are blocked by CSP.

---

## Security Model

### URL Validation

```typescript
validators.isSafeUrl(url); // blocks chrome://, about:, data:, javascript:, file://
validators.isLocalUrl(url); // checks localhost, 127.0.0.1, [::1], 0.0.0.0
```

### Bridge URL Security

`ALLOWED_BRIDGE_HOSTS` whitelist: `localhost`, `127.0.0.1`, `[::1]`, `0.0.0.0`. Rejects any other host.

### Cookie Domain Blocklist

Background blocks cookie operations on: banks (Chase, Wells Fargo, etc.), payment (PayPal, Venmo), government (.gov), healthcare domains.

### Input Sanitization

- `validators.sanitizeInput(input)` — escapes HTML via `textContent → innerHTML`
- `CSS.escape()` for selector safety
- `DOMPurify.sanitize()` for markdown rendering (side panel)

### Cross-Extension Isolation

Messages validated: `sender.id === chrome.runtime.id` — rejects cross-extension messages.

### Host Permissions

Localhost-only `host_permissions` — the extension cannot make requests to arbitrary origins. Cross-origin WebMCP/NLWeb probes go through background script fetch.

---

## WebMCP System (`webmcp.ts`)

### Declarative Discovery

```html
<form tool-name="search" tool-description="Search products">
  <input name="q" tool-param-description="Search query" required />
</form>
```

Scans `form[tool-name]` attributes, extracts JSON Schema from field annotations.

### Imperative Discovery

1. `navigator.modelContextTesting.listTools()` — Chromium early preview
2. `navigator.modelContext.listTools()` — MCPB browser extensions

### Tool Invocation Priority

1. `navigator.modelContextTesting.executeTool(name, args)`
2. `navigator.modelContext.callTool({ name, arguments })`
3. Fallback: find matching `form[tool-name]`, fill fields, call `form.requestSubmit()`

### Change Watching

- `MutationObserver` on `document.body` for `[tool-name]` attribute changes
- `navigator.modelContext.addEventListener('toolschanged', ...)`
- Fires `WEBMCP_TOOLS_CHANGED` to background for catalog update

---

## NLWeb System (`nlweb.ts`)

### Endpoints Probed

| Endpoint             | Method   | Purpose        |
| -------------------- | -------- | -------------- |
| `/.well-known/nlweb` | GET/HEAD | NLWeb manifest |
| `/ask`               | HEAD     | Ask endpoint   |
| `/mcp`               | HEAD     | MCP endpoint   |

### Schema Types Detected

JSON-LD `@type`: `SearchAction`, `AskAction`, `WebAPI`, `EntryPoint`

### Cross-Origin Strategy

- Same-origin: direct fetch
- Cross-origin: `NLWEB_PROBE` message to background (has `host_permissions`)

---

## Job Autofill System

### Detection (`autofill/detector.ts`)

| Platform | URL Pattern                                | Form Discovery                                    |
| -------- | ------------------------------------------ | ------------------------------------------------- |
| LinkedIn | `linkedin.com/jobs/`, `linkedin.com/job/`  | Class selectors, aria-label, data-test attributes |
| Lever    | `jobs.lever.co/`, `app.lever.co/.../apply` | Stable IDs: `#name`, `#email`, `#phone`, `#org`   |

Returns `DetectionResult { platform, isJobApplication, fields[] }`.

### Field Filling (`autofill/filler.ts`)

1. `setNativeValue()` — bypass React value descriptor
2. `dispatchFillEvents()` — focus → input → change → blur sequence
3. Handles: text/email/tel/textarea (native setter), select (option matching), file (skipped — browser security)

### Platform Selectors

- **LinkedIn** (`linkedin.ts`): Per-key fallback: stable ID → aria-label → data attribute → placeholder. Easy Apply modal pagination detection.
- **Lever** (`lever.ts`): Stable IDs (`#name`, `#email`), custom fields `#field0–#field9` → `customAnswers.*`

### Profile Shape

```typescript
JobApplicationProfile {
  firstName?, lastName?, fullName?, email?, phone?
  locationCity?, locationState?, locationCountry?
  linkedinUrl?, githubUrl?, portfolioUrl?, websiteUrl?
  currentCompany?, currentTitle?, yearsOfExperience?
  workAuthorization?, requiresSponsorship?, salaryExpectation?
  resumeText?, coverLetterText?
  files?: { resumeDataUrl?, coverLetterDataUrl? }
  customAnswers?: Record<string, string>
}
```

---

## Utility Reference (`utils.ts`)

### logger

Prefixes all messages with `[AGI Workforce]`.

| Method                      | Level |
| --------------------------- | ----- |
| `logger.debug(msg, data?)`  | Debug |
| `logger.info(msg, data?)`   | Info  |
| `logger.warn(msg, data?)`   | Warn  |
| `logger.error(msg, error?)` | Error |

### RateLimiter

Per-tab, per-message-type. 120 req/min, 500ms screenshot cooldown. State: `Map<"tabId:type", { count, resetTime, lastScreenshot }>`. Resets every 60s per key.

### domUtils

| Function           | Signature                          | Returns                    |
| ------------------ | ---------------------------------- | -------------------------- |
| `querySelector`    | `(selector: string)`               | `Element \| null`          |
| `querySelectorAll` | `(selector: string)`               | `Element[]`                |
| `waitForSelector`  | `(selector, timeoutMs?, visible?)` | `Promise<Element \| null>` |
| `safeClick`        | `(element, button?)`               | `boolean`                  |
| `getText`          | `(element)`                        | `string`                   |
| `getElementRect`   | `(element)`                        | `DOMRect \| null`          |
| `scrollIntoView`   | `(element)`                        | `boolean`                  |
| `isVisible`        | `(element)`                        | `boolean`                  |

### formUtils

| Function        | Signature                                                                      |
| --------------- | ------------------------------------------------------------------------------ |
| `getForms`      | `(): HTMLFormElement[]`                                                        |
| `getFormFields` | `(form?): Array<HTMLInputElement \| HTMLSelectElement \| HTMLTextAreaElement>` |
| `fillField`     | `(field, value): boolean`                                                      |
| `submitForm`    | `(form?): boolean`                                                             |

### storageUtils (chrome.storage.local wrappers)

| Function     | Signature                                       |
| ------------ | ----------------------------------------------- |
| `getItem<T>` | `(key, defaultValue?): Promise<T \| undefined>` |
| `setItem<T>` | `(key, value): Promise<void>`                   |
| `removeItem` | `(key): Promise<void>`                          |
| `clear`      | `(): Promise<void>`                             |

### validators

| Function                    | Purpose                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `isSafeUrl(url)`            | Blocks `chrome:`, `about:`, `data:`, `javascript:`, `file:` |
| `isLocalUrl(url)`           | Checks `localhost`, `127.0.0.1`, `[::1]`, `0.0.0.0`         |
| `isValidSelector(selector)` | Tries `document.querySelector` — catches parse errors       |
| `sanitizeInput(input)`      | HTML entity escaping via `textContent → innerHTML`          |

---

## Testing

### Framework

- **Vitest** with jsdom environment
- Default URL: `https://acme.myworkdayjobs.com/en-US/careers`
- `restoreMocks: true` — mocks auto-restore between tests
- Tests in `__tests__/` directory

### Test Files (12)

| File                            | Coverage                                             |
| ------------------------------- | ---------------------------------------------------- |
| `content.test.ts`               | Message dispatcher, DOM automation, security         |
| `webmcp.test.ts`                | WebMCP declarative + imperative discovery            |
| `webmcp-extended.test.ts`       | Dynamic discovery, tool watching, advanced scenarios |
| `utils.test.ts`                 | Logger, RateLimiter, domUtils, formUtils, validators |
| `sidePanelMarkdown.test.ts`     | Link sanitization, XSS prevention                    |
| `connection-lifecycle.test.ts`  | State machine, reconnect logic, error classification |
| `popup.test.ts`                 | UI state, event listeners, connection status         |
| `page-metadata.test.ts`         | JSON-LD, OG, Twitter Card, Schema.org extraction     |
| `background.reconnect.test.ts`  | Permanent vs transient error detection               |
| `background.cookies.test.ts`    | Cookie domain blocklist validation                   |
| `bridge-url-validation.test.ts` | HTTP bridge security (localhost-only)                |
| `jobAutofill.runtime.test.ts`   | Greenhouse/Workday platform detection + filling      |

### Mocking Strategy

```typescript
// Chrome APIs (no jsdom support)
vi.hoisted(() => {
  globalThis.chrome = {
    runtime: { onMessage: { addListener: vi.fn() }, sendMessage: vi.fn(), id: 'test-id' },
    tabs: { query: vi.fn(), sendMessage: vi.fn() },
    storage: { local: { get: vi.fn(), set: vi.fn() }, session: { ... } },
    alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } },
    // ... etc
  };
});
```

- `vi.hoisted()` for module-level chrome globals
- `vi.mock()` for dependencies
- Fixtures: HTML strings with form elements, meta tags, JSON-LD blocks
- No real network calls or API keys

---

## Build System

### Vite Config (4 entry points)

```typescript
rollupOptions: {
  input: {
    background: 'src/background.ts',
    content: 'src/content.ts',
    popup: 'src/popup.ts',
    side_panel: 'src/side_panel.ts'
  },
  output: {
    entryFileNames: 'src/[name].js',  // stable names — no hash (Chrome review)
    chunkFileNames: 'assets/[name].js', // stable chunk names
    assetFileNames: (info) => info.name?.endsWith('.html')
      ? 'src/[name][extname]'
      : 'assets/[name]-[hash][extname]'
  }
}
```

Static copy plugin: `manifest.json`, `icons/`, `popup.html`, `side_panel.html` → dist/

### Output Structure

```
dist/
├── src/
│   ├── background.js       (service worker)
│   ├── content.js          (content script)
│   ├── popup.js            (popup)
│   ├── side_panel.js       (side panel)
│   ├── popup.html
│   └── side_panel.html
├── assets/                 (shared chunks, stable names)
├── icons/                  (16, 32, 48, 128)
└── manifest.json
```

### TypeScript Config

- Target: ES2020, Lib: `[ES2020, DOM, DOM.Iterable, WebWorker]`
- Strict mode: `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, `noImplicitReturns`
- Module resolution: bundler, `isolatedModules`

### ESLint (`.eslintrc.cjs` — separate from monorepo)

- `env`: browser, webextensions, es2021
- `chrome` global: readonly
- `@typescript-eslint/no-unused-vars`: warn (ignore `^_`)
- `@typescript-eslint/no-explicit-any`: **off** (Chrome API types need it)
- `no-undef`: off

---

## Performance Considerations

| Concern                 | Mitigation                                                    |
| ----------------------- | ------------------------------------------------------------- |
| Huge DOM serialization  | `MAX_CONTEXT_HTML_CHARS = 100_000`                            |
| Page extraction stalls  | `PAGE_EXTRACTION_TIMEOUT_MS = 5_000`                          |
| Rapid-fire requests     | Rate limiter: 120/min per tab per type                        |
| Screenshot spam         | 500ms cooldown on `CAPTURE_SCREENSHOT`                        |
| Console buffer bloat    | Max 200 entries, 1000 chars each                              |
| Storage bloat           | Max 50 shortcuts, 50 tasks, 50 chat messages                  |
| Duplicate context syncs | Fingerprint-based dedup (hash of URL + title + selected text) |
| Malformed JSON-LD       | try/catch on every parse (common on real sites)               |

---

## Naming Conventions

| Entity           | Convention                    | Example                                      |
| ---------------- | ----------------------------- | -------------------------------------------- |
| Message types    | SCREAMING_SNAKE               | `CAPTURE_SCREENSHOT`, `GET_PAGE_INFO`        |
| Storage keys     | snake*case with `agi*` prefix | `agi_saved_shortcuts`, `agi_api_key`         |
| Alarm names      | prefix + id                   | `agi_task_${id}`                             |
| Functions        | camelCase                     | `handleMessage`, `connectToNativeHost`       |
| Interfaces       | PascalCase                    | `AutomationState`, `WebMCPToolInfo`          |
| Constants        | SCREAMING_SNAKE               | `MAX_CONTEXT_HTML_CHARS`, `NATIVE_HOST_NAME` |
| Files            | camelCase                     | `jobAutofill.ts`, `platform-prompts.ts`      |
| Autofill modules | lowercase platform            | `linkedin.ts`, `lever.ts`                    |

---

## Gotchas

- **MV3 service worker lifecycle**: Background script terminated by Chrome at any time. All state in `background.ts` is ephemeral — persistent state goes to `chrome.storage.local` or `.session`.
- **Content script CSP**: DOM injections (indicator, overlay, FAB) wrapped in try/catch — CSP-restricted or XML/SVG pages throw on `appendChild`.
- **`host_permissions`**: Only `localhost` and `127.0.0.1` — NO broad host access. WebMCP/NLWeb cross-origin probes go through background fetch.
- **Chunk file naming**: `chunkFileNames: 'assets/[name].js'` (no hash) — stable names for Chrome extension review reproducibility.
- **Internal vs native messages**: `CHAT_CHUNK` is `InternalMessageType` — flows between extension contexts only. **Never add it to `NativeMessageType`.**
- **Rate limiting**: Background applies per-tab rate limits (120/min) and screenshot cooldown (500ms). Content script has separate HTML (100K) and console (200) limits.
- **SPA navigation**: Content script watches `popstate`, `hashchange`, `replaceState`, and `pushState` to re-sync page context.
- **React-controlled inputs**: Must use `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set` to bypass React's value descriptor override.
- **macOS permission popups**: Reconnect stops after 8 attempts — exponential backoff with hard cap prevents infinite popup loops.
- **Permanent error detection**: Patterns "not found", "forbidden", "not allowed" in disconnect error → blocks reconnect loop.
- **File input filling**: Browser security prevents programmatic file input — autofill stores data URIs in profile but filler is a no-op for file fields.
- **Scheduled task alarms**: Must be re-registered on every service worker startup — Chrome destroys alarms when worker terminates.
- **API key storage**: Use `chrome.storage.session` ONLY — never `chrome.storage.local` (persists plaintext across sessions).
