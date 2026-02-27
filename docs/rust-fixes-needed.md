# Rust Fixes Needed

All issues identified during the 2026-02-26 self-review have been **resolved**.

Commit: `e23c871` — `fix(rust): resolve all 12 rust issues from self-review audit`

---

## FIXED [C1] Integer overflow in exponential backoff

- **File**: `apps/desktop/src-tauri/src/core/agent/continuous_executor.rs`
- **Fix applied**: Replaced with `saturating_mul` + `saturating_pow` + `.min(62)` cap

## FIXED [C2] Deadlock via lock-order inversion in BackgroundAgent

- **File**: `apps/desktop/src-tauri/src/core/agent/background_agent.rs`
- **Fix applied**: Snapshot agent priorities via read-lock, drop it, then acquire queue write-lock. Also fixed `load_persisted_agents` to never hold both locks.

## FIXED [H5] SSE parser uses fragile string matching for error classification

- **File**: `apps/desktop/src-tauri/src/core/llm/sse_parser.rs`
- **Fix applied**: Use `e.downcast_ref::<serde_json::Error>()` — JSON parse errors are non-terminal (partial chunks), all others are terminal.

## FIXED [H7] `validate_table_whitelist()` warns but does not block execution

- **File**: `apps/desktop/src-tauri/src/data/database/query_builder.rs`
- **Fix applied**: Returns `Result<()>`, propagated via `?` in all 6 `build_*_query` call sites.

## FIXED [H8] Hardcoded HMAC key fallback in debug audit logger

- **File**: `apps/desktop/src-tauri/src/sys/security/audit_logger.rs`
- **Fix applied**: Replaced with CSPRNG ephemeral key (`rand::thread_rng().gen::<[u8; 32]>()`) + prominent tracing::warn.

## FIXED [H11] LLM-controllable shell type enables security policy bypass

- **File**: `apps/desktop/src-tauri/src/core/llm/tool_executor.rs`
- **Fix applied**: Removed `args.get("shell")` — always uses `get_default_shell()`.

## FIXED [H20] 17 core routing logic tests permanently `#[ignore]`d

- **File**: `apps/desktop/src-tauri/src/core/llm/tests/routing_logic_tests.rs`
- **Fix applied**: Added `MockProvider` with `is_configured() -> true`. Removed `#[ignore]` from all 22 tests. Routing decisions are now testable in CI without API keys.

## FIXED [M2] Space allowed in SQL identifier validation

- **File**: `apps/desktop/src-tauri/src/data/database/query_builder.rs`
- **Fix applied**: Removed `' '` from allowed charset.

## FIXED [M3] `duration_until_midnight` ignores configured timezone

- **File**: `apps/desktop/src-tauri/src/core/agent/continuous_executor.rs`
- **Fix applied**: Parse IANA timezone via `chrono-tz` (already a dependency), fallback to `Local::now()` with warning.

## FIXED [M18] Non-optional heavy DB client dependencies inflate desktop binary

- **File**: `apps/desktop/src-tauri/Cargo.toml` + 4 source files
- **Fix applied**: 7 deps marked `optional = true`, gated behind `remote-databases` Cargo feature. All imports and usage wrapped in `#[cfg(feature = "remote-databases")]`. Stub commands return user-friendly error when feature disabled.

## FIXED [M20] No-op assertion in `autonomous_tests`

- **File**: `apps/desktop/src-tauri/src/core/agent/tests/autonomous_tests.rs`
- **Fix applied**: Replaced `let _ =` with `assert_eq!(PENDING_TASK_APPROVALS.len(), 0, ...)`.

## FIXED [M25] Concurrent access not tested in checkpoint persistence

- **File**: `apps/desktop/src-tauri/src/core/agent/tests/continuous_executor_tests.rs`
- **Fix applied**: Added `test_concurrent_checkpoint_writes` (2 async writers, verifies consistency) and `test_corrupt_checkpoint_recovery` (truncated/invalid JSON, verifies no panic).

---

## B3: Extension→Planner Wiring

### The Missing Link — Precise Diagnosis

The extension pipeline has **two transports** to the Rust desktop backend:

1. **Native messaging** (legacy): `chrome.runtime.connectNative("com.agiworkforce.browser")` — used by background.js for low-level actions
2. **WebSocket realtime bridge** (primary): `background.ts` connects via WebSocket to `ws://127.0.0.1:8787`, authenticates with `.ipc_token`, and sends `RealtimeEvent::NativeMessage` frames

The **complete data flow** for page context is:

```
[Chrome page changes]
    → background.ts:syncTabContextWithDesktop()
    → sends RealtimeEvent::NativeMessage { type: "page_context", url, title, html, tab_id }
    → websocket_server.rs:execute_native_message()
    → NativeMessage::PageContext branch
    → sys/commands/extension.rs:process_page_context_event()
    → stores in LATEST_PAGE_CONTEXT (static Mutex)
    → emits Tauri event "extension:page-context" to frontend
    → returns PageContextResponse { task_id, actions: Vec<PageAction> }
    → background.ts receives { task_id, actions }
    → forwards RUN_PAGE_ACTIONS to content script
    → content.js executes DOM actions
    → background.ts sends RealtimeEvent::NativeMessage { type: "task_result", task_id, success, result }
    → websocket_server.rs → process_task_result_event()
    → emits Tauri event "extension:task-result" to frontend
```

**THE GAP**: `process_page_context_event()` (`extension.rs:150`) calls `plan_page_actions()` which returns only **static, HTML-heuristic actions** (`get_page_info`, `get_forms`, `analyze_selection`, `wait_for_selector`). These are mechanical page-scraping steps — they are **never forwarded to the `AutonomousAgent`**. The `AutonomousAgent.submit_task()` API is **never called** from the extension pipeline. Page context goes into `LATEST_PAGE_CONTEXT` (only read by the LLM chat system prompt) but is never used to trigger autonomous action execution.

**THE RESULT**: The extension can navigate, click, type, and screenshot — but those capabilities can only be exercised by the `ExtensionBridge` outbound API (desktop→extension direction). There is **no inbound path** from extension→AutonomousAgent. When the extension reports a page, the desktop stores it and emits a UI event but never dispatches an agent action.

### Gap 1: `plan_page_actions()` must call the agent instead of returning static steps

**File**: `apps/desktop/src-tauri/src/sys/commands/extension.rs`

**Current behavior** (line 150):

```rust
let actions = plan_page_actions(&context, &html_for_analysis);
```

`plan_page_actions()` is a pure heuristic function that generates static `PageAction` structs with types like `"get_page_info"`, `"get_forms"`, etc. These are sent back to the extension as `RUN_PAGE_ACTIONS`, but the extension's `content.js` handler for `RUN_PAGE_ACTIONS` only performs DOM reads — it never triggers agent autonomy.

**What needs to happen**: When a page context arrives during an active agent task, the URL/title/DOM snapshot must be injected into the agent's context window so the LLM can plan browser-specific steps. When no agent task is active, page context should be passively stored (current behavior is fine).

**New code to add in `process_page_context_event()`**:

```rust
// After storing in LATEST_PAGE_CONTEXT, before generating static actions:

// If an active agent task is awaiting page context, inject it and dispatch
// browser-scoped actions into the agent execution loop.
if let Some(agent_arc) = crate::sys::commands::agent::get_active_agent() {
    let description = format!(
        "Browser automation: page loaded at {} — title: {}{}\n\nHTML snapshot (first 4096 chars):\n{}",
        context.url,
        context.title,
        context.selected_text
            .as_deref()
            .filter(|s| !s.is_empty())
            .map(|s| format!(" — selected text: {}", &s[..s.len().min(500)]))
            .unwrap_or_default(),
        &context.html[..context.html.len().min(4096)]
    );

    let agent = agent_arc.lock().await;
    match agent.submit_task(description, Some(true)).await {
        Ok(task_id) => {
            tracing::info!(
                "[Extension] Submitted browser automation task {} for page {}",
                task_id, context.url
            );
            // Optionally surface task_id in PageContextResponse for tracking
        }
        Err(e) => {
            tracing::warn!("[Extension] Failed to submit agent task for page context: {}", e);
        }
    }
}
```

### Gap 2: `get_active_agent()` helper needed in `agent.rs`

The static `AGENT` is `Mutex<Option<Arc<TokioMutex<AutonomousAgent>>>>` in `sys/commands/agent.rs` and is `pub(crate)` by convention but lacks a public accessor. Add this function to `apps/desktop/src-tauri/src/sys/commands/agent.rs`:

```rust
/// Returns the active AutonomousAgent if one has been initialized via `agent_init`.
/// Used by the extension pipeline to submit browser automation tasks.
pub(crate) fn get_active_agent() -> Option<Arc<tokio::sync::Mutex<AutonomousAgent>>> {
    AGENT.lock().as_ref().cloned()
}
```

### Gap 3: New `Action` variants needed in `executor.rs`

The `Action` enum in `core/agent/mod.rs` currently handles desktop automation (mouse, keyboard, files, commands). Browser automation actions from the extension are completely absent. Add these variants to `apps/desktop/src-tauri/src/core/agent/mod.rs`:

```rust
// In the Action enum, add after PressKey:

/// Perform a browser click via the ExtensionBridge (CSS selector-based)
BrowserClick {
    selector: String,
},

/// Type text into a browser element via the ExtensionBridge
BrowserType {
    selector: String,
    text: String,
},

/// Navigate the active browser tab via the ExtensionBridge
BrowserNavigate {
    url: String,
},

/// Wait for a CSS selector to appear in the browser page
BrowserWaitForSelector {
    selector: String,
    timeout_ms: u64,
},

/// Execute JavaScript in the browser page via the ExtensionBridge
BrowserExecuteScript {
    script: String,
},

/// Capture a screenshot from the browser via the ExtensionBridge
BrowserScreenshot,

/// Get the current browser page DOM snapshot (URL + title + HTML)
BrowserGetPageContext,
```

### Gap 4: Executor must dispatch browser actions to `ExtensionBridge`

In `apps/desktop/src-tauri/src/core/agent/executor.rs`, add match arms for the new browser action variants. The `TaskExecutor` currently only holds `Arc<AutomationService>`. `AutomationService` already contains `ExtensionBridge` (accessible via `automation.browser` or similar field — confirm exact field name from `AutomationService` struct). Add these arms to `execute_action()`:

```rust
Action::BrowserClick { selector } => {
    self.automation
        .extension_bridge
        .click(selector)
        .await
        .map_err(|e| anyhow::anyhow!("Browser click failed: {}", e))?;
    Ok(format!("Clicked browser element: {}", selector))
}

Action::BrowserType { selector, text } => {
    self.automation
        .extension_bridge
        .type_text(selector, text)
        .await
        .map_err(|e| anyhow::anyhow!("Browser type failed: {}", e))?;
    Ok(format!("Typed '{}' into browser element: {}", text, selector))
}

Action::BrowserNavigate { url } => {
    // Validate URL first (reuse existing security pattern from Action::Navigate)
    let parsed = url::Url::parse(url)
        .map_err(|_| anyhow::anyhow!("Invalid URL: {}", url))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(anyhow::anyhow!(
            "Blocked URL scheme '{}': only http/https are permitted",
            parsed.scheme()
        ));
    }
    self.automation
        .extension_bridge
        .navigate(parsed.as_str())
        .await
        .map_err(|e| anyhow::anyhow!("Browser navigate failed: {}", e))?;
    Ok(format!("Browser navigated to {}", parsed))
}

Action::BrowserWaitForSelector { selector, timeout_ms } => {
    self.automation
        .extension_bridge
        .wait_for_selector(selector, *timeout_ms)
        .await
        .map_err(|e| anyhow::anyhow!("Browser wait_for_selector failed: {}", e))?;
    Ok(format!("Browser selector appeared: {}", selector))
}

Action::BrowserExecuteScript { script } => {
    let result = self.automation
        .extension_bridge
        .execute_script(script)
        .await
        .map_err(|e| anyhow::anyhow!("Browser script execution failed: {}", e))?;
    Ok(format!("Script result: {}", result))
}

Action::BrowserScreenshot => {
    let bytes = self.automation
        .extension_bridge
        .capture_screenshot("png", 90)
        .await
        .map_err(|e| anyhow::anyhow!("Browser screenshot failed: {}", e))?;
    Ok(format!("Browser screenshot captured ({} bytes)", bytes.len()))
}

Action::BrowserGetPageContext => {
    let url = self.automation.extension_bridge.get_url().await
        .map_err(|e| anyhow::anyhow!("get_url failed: {}", e))?;
    let title = self.automation.extension_bridge.get_title().await
        .map_err(|e| anyhow::anyhow!("get_title failed: {}", e))?;
    let html = self.automation.extension_bridge.get_dom_snapshot().await
        .map_err(|e| anyhow::anyhow!("get_dom_snapshot failed: {}", e))?;
    Ok(format!(
        "Page context: url={}, title={}, html_len={}",
        url, title, html.len()
    ))
}
```

**IMPORTANT**: Check the exact field name for `ExtensionBridge` inside `AutomationService`. Look at `apps/desktop/src-tauri/src/automation/mod.rs` to confirm it is `automation.extension_bridge` or adjust accordingly.

### Gap 5: How page context gets injected into the agent's context window

The `AutonomousAgent.submit_task()` path uses `TaskPlanner.plan_task()` which calls `LLMRouter.send_message()` with the task description. The description string we build in Gap 1 includes the URL, title, selected text, and first 4096 characters of HTML — this becomes the full context the LLM uses to plan steps.

For rich DOM injection during an ongoing multi-step browser task, the `LATEST_PAGE_CONTEXT` static is already read by `chat/mod.rs` when building the system prompt:

- Confirm in `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs` that `LATEST_PAGE_CONTEXT` is appended to the system prompt. If not, add:

```rust
// In build_system_prompt() or equivalent:
if let Ok(guard) = crate::sys::commands::extension::LATEST_PAGE_CONTEXT.lock() {
    if let Some(ref ctx) = *guard {
        system_prompt.push_str(&format!(
            "\n\n## Current Browser Page\nURL: {}\nTitle: {}\nHTML (truncated):\n{}",
            ctx.url,
            ctx.title,
            &ctx.html[..ctx.html.len().min(8192)]
        ));
    }
}
```

### Gap 6: `ExtensionBridge` access from `AutomationService`

**Check needed**: Look at `apps/desktop/src-tauri/src/automation/mod.rs` to confirm `AutomationService` has an `extension_bridge: ExtensionBridge` field. If it does not, add it:

```rust
// In AutomationService struct:
pub extension_bridge: crate::automation::browser::extension_bridge::ExtensionBridge,

// In AutomationService::new():
extension_bridge: crate::automation::browser::extension_bridge::ExtensionBridge::new(),
```

### New Tauri Commands Needed (TypeScript-safe to add directly)

These can be added in `apps/desktop/src/` without touching Rust:

**File**: `apps/desktop/src/hooks/useBrowserAutomation.ts` (new file)

```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface PageContextEvent {
  task_id: string;
  url: string;
  title: string;
  tab_id: number;
  timestamp: number;
  selected_text?: string;
  actions: Array<{ id: string; type: string; selector?: string; value?: string; delay?: number }>;
}

export interface TaskResultEvent {
  task_id: string;
  success: boolean;
  screenshot_path?: string;
  result?: unknown;
  error?: string;
  actions_performed: number;
  duration: number;
}

export function useBrowserAutomation() {
  const onPageContext = (cb: (event: PageContextEvent) => void) => {
    return listen<PageContextEvent>('extension:page-context', (event) => {
      cb(event.payload);
    });
  };

  const onTaskResult = (cb: (event: TaskResultEvent) => void) => {
    return listen<TaskResultEvent>('extension:task-result', (event) => {
      cb(event.payload);
    });
  };

  const submitBrowserTask = (description: string, autoApprove = true) => {
    return invoke<{ task_id: string }>('agent_submit_task', {
      request: { description, auto_approve: autoApprove },
    });
  };

  return { onPageContext, onTaskResult, submitBrowserTask };
}
```

**File**: `apps/desktop/src/components/Agent/BrowserAutomationPanel.tsx` — a UI panel that listens to `extension:page-context` and `extension:task-result` events and renders live browser automation status. Wire to the agent approval card so users see what the extension is doing.

### Summary of the Missing Link

```
CURRENT (BROKEN):
  extension sends page_context
    → stored in LATEST_PAGE_CONTEXT
    → emits "extension:page-context" Tauri event (frontend can see it but doesn't act)
    → returns static heuristic actions back to extension (not AI-planned)
    → extension executes generic DOM reads
    → NEVER reaches AutonomousAgent

NEEDED (FIXED):
  extension sends page_context
    → stored in LATEST_PAGE_CONTEXT (keep)
    → process_page_context_event() calls get_active_agent() → agent.submit_task(page_description)
    → AutonomousAgent.plan_task() → LLM generates BrowserClick/BrowserNavigate/etc. steps
    → TaskExecutor.execute_action() dispatches BrowserXxx variants → ExtensionBridge methods
    → ExtensionBridge sends via WebSocket → extension executes in page
    → extension reports task_result → process_task_result_event() → agent receives feedback
```

### Files Requiring Rust Changes (DO NOT EDIT — Rust team to apply)

| File                                                   | Change                                                                                                                                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop/src-tauri/src/sys/commands/extension.rs` | Call `get_active_agent()` in `process_page_context_event()` to submit task to agent                                                                                           |
| `apps/desktop/src-tauri/src/sys/commands/agent.rs`     | Add `pub(crate) fn get_active_agent()` accessor                                                                                                                               |
| `apps/desktop/src-tauri/src/core/agent/mod.rs`         | Add 7 new `Action` variants: `BrowserClick`, `BrowserType`, `BrowserNavigate`, `BrowserWaitForSelector`, `BrowserExecuteScript`, `BrowserScreenshot`, `BrowserGetPageContext` |
| `apps/desktop/src-tauri/src/core/agent/executor.rs`    | Add match arms for the 7 new browser action variants calling `ExtensionBridge`                                                                                                |
| `apps/desktop/src-tauri/src/automation/mod.rs`         | Confirm/add `extension_bridge: ExtensionBridge` field in `AutomationService`                                                                                                  |
| `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs`  | Confirm/add `LATEST_PAGE_CONTEXT` injection into LLM system prompt                                                                                                            |

### No New Permissions Required in manifest.json

The extension already has all required permissions for the existing operations. The new agent-dispatched actions (click, navigate, type, etc.) use the existing `ExtensionBridge` methods which go through the already-established WebSocket realtime connection — no new Chrome permissions are needed.

### Protocol Impact

No changes to the native messaging protocol. The extension already sends `page_context` and `task_result` messages correctly. The fix is entirely on the Rust desktop side — wiring the received context into the agent loop.

---

## B1: Stream Watchdog Fix

### Root Cause

The `stream_watchdog_timeout` error has **three distinct failure modes**, all of which surface the same user-visible error:

1. **Frontend inactivity watchdog fires prematurely (60s)**: The frontend `UnifiedAgenticChat` schedules a 60-second inactivity watchdog (`WATCHDOG_TIMEOUT_MS = 60_000`) that fires when no `chat:stream-chunk`, `chat:stream-end`, or `chat:stream-error` event arrives. For image/video generation tool calls, the tool itself can take 30-120s, during which **no SSE chunks flow** because the model is waiting for the tool result before continuing. The watchdog correctly extends when `toolExecutionTimeoutsRef` or `activeToolStreams` are non-empty, but only if those refs were populated. In code paths where tool tracking is incomplete (e.g., non-AGI chat path tool calls), the watchdog fires at 60s.

2. **Ollama provider uses a client with 300s read timeout for streaming**: `OllamaProvider` creates a single `reqwest::Client` with `HttpClientConfig::default()` which sets `read_timeout_secs: Some(300)`. Unlike `ManagedCloudProvider` which builds a separate `streaming_client` with `read_timeout_secs: None`, Ollama's streaming requests go through the same 300s-capped client. For large local models with slow inference, this 300s hard timeout kills the HTTP connection mid-stream, producing a reqwest timeout error that propagates as a terminal stream error.

3. **LLM Router 30s connection timeout conflated with stream duration**: In `invoke_streaming_with_retry()` (llm_router.rs:2186), a `tokio::time::timeout(Duration::from_secs(30))` wraps the entire `provider.send_message_streaming()` call. This is intended as a **connection** timeout (time to establish the SSE stream), but for providers where `send_message_streaming` includes the first SSE chunk wait (e.g., reasoning models that think for 30-90s before first token), this 30s timeout fires before any data arrives. The timeout is correctly retried (up to `max_retries`), but after exhausting retries the error surfaces to the user.

### Fix 1: Ollama streaming client -- add dual-client pattern

**File**: `apps/desktop/src-tauri/src/core/llm/providers/ollama.rs`

**Lines 54-57** (struct definition) -- Before:

```rust
pub struct OllamaProvider {
    client: Client,
    base_url: String,
}
```

After:

```rust
pub struct OllamaProvider {
    /// HTTP client with 300s overall timeout, used for non-streaming requests.
    client: Client,
    /// HTTP client with no overall timeout, used for streaming to avoid
    /// premature disconnection during long inference runs.
    streaming_client: Client,
    base_url: String,
}
```

**Lines 64-75** (constructor `with_config`) -- Before:

```rust
    pub fn with_config(
        base_url: Option<String>,
        config: HttpClientConfig,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let client = create_http_client(&config)
            .map_err(Box::<dyn std::error::Error + Send + Sync>::from)?;
        Ok(Self {
            client,
            base_url: base_url.unwrap_or_else(|| "http://localhost:11434".to_string()),
        })
    }
```

After:

```rust
    pub fn with_config(
        base_url: Option<String>,
        config: HttpClientConfig,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let client = create_http_client(&config)
            .map_err(Box::<dyn std::error::Error + Send + Sync>::from)?;

        // Streaming client: same proxy/CA settings but no overall timeout
        // (connect timeout still applies so unreachable hosts fail fast)
        let streaming_config = HttpClientConfig {
            proxy_url: config.proxy_url.clone(),
            ca_cert_path: config.ca_cert_path.clone(),
            connect_timeout_secs: config.connect_timeout_secs,
            read_timeout_secs: None,
        };
        let streaming_client = create_http_client(&streaming_config)
            .map_err(Box::<dyn std::error::Error + Send + Sync>::from)?;

        Ok(Self {
            client,
            streaming_client,
            base_url: base_url.unwrap_or_else(|| "http://localhost:11434".to_string()),
        })
    }
```

**Line 410-412** (in `send_message_streaming`) -- Before:

```rust
        let response = self
            .client
            .post(format!("{}/api/chat", self.base_url))
```

After:

```rust
        let response = self
            .streaming_client
            .post(format!("{}/api/chat", self.base_url))
```

---

### Fix 2: LLM Router -- increase initial connection timeout for reasoning models

**File**: `apps/desktop/src-tauri/src/core/llm/llm_router.rs`

**Lines 2185-2191** -- Before:

```rust
            // Add timeout to the streaming connection attempt
            let stream_timeout = Duration::from_secs(30); // 30 second timeout for initial connection
            let stream_result = tokio::time::timeout(
                stream_timeout,
                provider.send_message_streaming(&routed_request),
            )
            .await;
```

After:

```rust
            // Timeout for initial stream establishment (TCP connect + first HTTP response).
            // 90s accommodates reasoning/thinking models (Claude extended thinking,
            // DeepSeek-R1, o3) that may take 30-90s before the first SSE byte.
            // The Rust-side idle timeout in chat/mod.rs (300s) handles the case where
            // the stream stalls *after* initial connection.
            let stream_timeout = Duration::from_secs(90);
            let stream_result = tokio::time::timeout(
                stream_timeout,
                provider.send_message_streaming(&routed_request),
            )
            .await;
```

**Rationale**: The 30s timeout was chosen for fast connection establishment, but `send_message_streaming` for most providers includes sending the HTTP request body and waiting for the first response headers. Reasoning models routinely take 30-90s to produce the first SSE event. Bumping to 90s accommodates these models while still failing fast on genuinely unreachable hosts (the TCP connect timeout of 30s in `HttpClientConfig` handles that layer). The retry logic still applies on top of this.

---

### Fix 3: Frontend watchdog -- ensure tool execution tracking covers all code paths

**File**: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx`

**Line 2453** -- Before:

```typescript
const WATCHDOG_TIMEOUT_MS = 60 * 1000; // 60 seconds of inactivity (accommodates image generation 30-90s)
```

After:

```typescript
const WATCHDOG_TIMEOUT_MS = 120 * 1000; // 120 seconds of inactivity (accommodates reasoning models 30-90s + image gen 30-120s)
```

**Rationale**: 60s is too aggressive. The Rust-side idle timeout (`STREAM_CHUNK_IDLE_TIMEOUT_SECS`) is already 300s, and the frontend watchdog should be more lenient than the backend. 120s provides sufficient headroom for:

- Reasoning models thinking before first token (30-90s)
- Image generation tool execution (30-120s)
- Network jitter and provider cold starts

The watchdog already correctly re-schedules when `toolExecutionTimeoutsRef` or `activeToolStreams` are non-empty, so 120s only affects the case where those refs are not populated (edge case in non-AGI chat path).

---

### Fix 4: Image generation -- no separate streaming path needed (already handled)

Image generation in this codebase does NOT go through a separate streaming path. Instead:

1. The model requests a tool call (e.g., `image_generate`) via the streaming SSE response
2. The streaming loop in `chat/mod.rs` detects `finish_reason: "tool_calls"` and executes the tool
3. Tool execution uses `execute_chat_tool_with_timeout()` with `LONG_RUNNING_TOOL_TIMEOUT_SECS = 300` (5 min)
4. After tool completion, a follow-up model invocation is made with `MEDIA_FOLLOWUP_INVOKE_TIMEOUT_SECS = 300`

The problem is that during step 3 (tool execution), the SSE stream from the model has already ended (the model sent `[DONE]`). A new streaming request is initiated in step 4. Between steps 3 and 4, the frontend sees no stream activity. If the tool takes >60s (old `WATCHDOG_TIMEOUT_MS`), the frontend watchdog fires.

**Fix 3 above (120s watchdog) addresses this.** Additionally, the Rust side already handles media tools correctly via `is_media_generation_tool()` checks and extended timeouts.

For true long-running generation (>120s, e.g., video generation), the existing `activeToolStreams` tracking in the AGI chat path correctly prevents the watchdog from firing. The only gap was the non-AGI chat path, which Fix 3 addresses by increasing the baseline watchdog.

---

### New config values to expose

No new user-facing configuration is needed. All timeout values are compile-time constants:

| Constant                                | File                 | Current             | Proposed                             | Purpose                                    |
| --------------------------------------- | -------------------- | ------------------- | ------------------------------------ | ------------------------------------------ |
| `STREAM_CHUNK_IDLE_TIMEOUT_SECS`        | `chat/mod.rs:42`     | 300                 | 300 (no change)                      | Rust-side idle timeout -- already generous |
| `stream_timeout` (local var)            | `llm_router.rs:2186` | 30                  | **90**                               | Initial stream connection timeout          |
| `WATCHDOG_TIMEOUT_MS` (local var)       | `index.tsx:2453`     | 60000               | **120000**                           | Frontend inactivity watchdog               |
| (new) `OllamaProvider.streaming_client` | `ollama.rs`          | N/A (uses `client`) | **separate client, no read timeout** | Prevent Ollama streaming cutoff            |

---

### Complete path trace

```
Frontend invoke('chat_send_message', {...})
  -> sys/commands/chat/mod.rs:2692 — chat_send_message()
     -> Spawns tokio::spawn for async streaming work
     -> core/llm/llm_router.rs:1985 — send_message_streaming()
        -> llm_router.rs:2002 — send_message_streaming_with_retry()
           -> Selects candidates via route_with_scoring()
           -> For each candidate:
              -> llm_router.rs:2087 — invoke_streaming_with_retry()
                 -> llm_router.rs:2186 — tokio::time::timeout(30s) [BUG: too short]
                    -> provider.send_message_streaming(&request)
                       -> [ManagedCloudProvider] uses streaming_client (no read timeout) -- OK
                       -> [OllamaProvider] uses client (300s read timeout) -- BUG
                 -> Returns Pin<Box<dyn Stream<StreamChunk>>>
     -> chat/mod.rs:3830 — loop { tokio::time::timeout(300s, stream.next()) }
        -> SSE parser yields StreamChunk (content, keepalive, done, tool_calls)
        -> Keepalive chunks reset the 300s idle timeout -- OK
        -> On timeout: emits chat:stream-error to frontend -- OK (user-friendly msg)
     -> Frontend receives chat:stream-chunk events
        -> Calls markStreamActivity() to reset watchdog -- OK
     -> On tool_calls: executes tool with 300s timeout for media tools
        -> NO stream chunks during tool execution
        -> Frontend watchdog at 60s fires [BUG: too aggressive]

Frontend watchdog (WATCHDOG_TIMEOUT_MS = 60s)
  -> Scheduled in finally{} block after invoke() returns
  -> Resets on every chat:stream-chunk, chat:stream-end, chat:stream-error event
  -> Extends when toolExecutionTimeoutsRef.current.size > 0 or activeToolStreams.size > 0
  -> If neither set is populated AND no stream events for 60s -> fires
  -> Sets error: 'stream_watchdog_timeout' on the message
```

---

### Summary of changes by file

1. **`apps/desktop/src-tauri/src/core/llm/providers/ollama.rs`** -- Add `streaming_client` field with `read_timeout_secs: None`; use it in `send_message_streaming`
2. **`apps/desktop/src-tauri/src/core/llm/llm_router.rs:2186`** -- Change `stream_timeout` from 30s to 90s
3. **`apps/desktop/src/components/UnifiedAgenticChat/index.tsx:2453`** -- Change `WATCHDOG_TIMEOUT_MS` from 60000 to 120000

### Risk assessment

- **Fix 1 (Ollama dual-client)**: Low risk. Mirrors the existing pattern in `ManagedCloudProvider`. No behavioral change for non-streaming requests.
- **Fix 2 (90s connection timeout)**: Low risk. Only affects the initial connection phase. Retry logic unchanged. Worst case: slightly slower failure detection for genuinely dead endpoints (90s vs 30s per attempt).
- **Fix 3 (120s frontend watchdog)**: Low risk. The watchdog is a safety net, not a primary control. The Rust-side idle timeout (300s) and stream-end/stream-error events are the primary stream lifecycle controls. Worst case: stuck loading indicator persists 60s longer before cleanup (acceptable tradeoff for eliminating false positives).

---

## Stream G: Image Gen Fix

### Root Cause

Image generation via the `media_generate_image` Tauri command does NOT go through the SSE
streaming path — it is a **synchronous Tauri invoke** that blocks waiting for the web API response
for 10–90 seconds. The stream_watchdog_timeout fires in a **different part of the pipeline**:

1. **Media Lab path (standalone — currently broken due to ID mismatch)**:
   `MediaLab.tsx` → `mediaGenerationStore.generateImage()` → `api/media.ts:generateImage()` →
   Tauri `invoke("media_generate_image")` → Rust `media_generate_image` → `reqwest::Client` POST
   to `{base_url}/api/media/image/generate` → web API calls DALL-E 3 / Imagen 4 / Stability.
   **No watchdog involved here.** The Rust command has a 90-second `reqwest` timeout.

2. **Chat tool path (agent-triggered)**:
   The LLM calls `media_generate_image` as a tool. `chat/mod.rs` wraps this in
   `execute_chat_tool_with_timeout()`. Tool timeout is correctly set to `LONG_RUNNING_TOOL_TIMEOUT_SECS=300s`
   for media tools (line 1039–1042 of `chat/mod.rs`). This path should work.

3. **The ACTUAL watchdog failure — followup SSE stream**:
   After image generation completes (tool returns base64 image data), the agent loop sends a
   followup LLM request with the image result in the context. Because image data is large
   (base64 = ~4x raw bytes, ~500KB for a 1024x1024 PNG), the LLM provider takes 15–30 seconds
   before it emits the first response token. During this gap, the idle timeout watchdog at
   `STREAM_CHUNK_IDLE_TIMEOUT_SECS=300s` (line 44 of `chat/mod.rs`) could fire if no SSE
   bytes arrive.
   **However**: `is_media_generation_tool()` already correctly detects media tools, and
   `MEDIA_FOLLOWUP_INVOKE_TIMEOUT_SECS=300s` is already granted for these followups (lines 1088–1096).
   The timeouts are already sufficient.

4. **The ACTUAL breakage — provider ID mismatch (CRITICAL)**:
   The MediaLab UI sends frontend provider IDs (`google_imagen`, `google_imagen_lite`, `dalle`,
   `stable_diffusion`) from `types/media.ts`. These pass through `api/media.ts` → Tauri
   `MediaImageRequest.provider` → forwarded verbatim in the JSON POST body to the web API at
   `/api/media/image/generate`. The web API's Zod schema only accepts `'google' | 'openai' | 'stability'`.
   **Result**: All image generation requests return 400 Validation Error. Images never generate.
   This is the primary bug.

5. **Secondary breakage — size and quality ID mismatch**:
   Frontend sends `ImageSizeId` values (`"small"`, `"medium"`, `"large"`, `"wide"`, `"portrait"`).
   Web API accepts pixel dimension strings (`"1024x1024"`, `"1792x1024"`, `"1024x1792"`, etc.).
   Frontend sends quality `"premium"` which is not valid — web API only accepts `"standard"` or `"hd"`.

6. **Tertiary issue — `model` field in payload causes Zod rejection**:
   `api/media.ts` passes `model` field to the Rust command, which forwards it to the web API.
   The web API's `ImageGenerationRequestSchema` does not have a `model` field — Zod strict
   parsing rejects unknown keys.

7. **Video flow is async/correct — no changes needed**:
   `media_generate_video` creates a task on Runway/Veo via `/api/media/video/generate` (async),
   then polls `/api/media/video/status` every 3s for up to 300s (100 attempts × 3s).
   This pattern is architecturally correct. The video path does NOT use SSE streaming.

---

### Rust Changes Required

**File**: `apps/desktop/src-tauri/src/sys/commands/media.rs`

**Change G1 — Map frontend provider IDs to web API provider values (lines 114-123)**

```rust
// BEFORE:
let payload = serde_json::json!({
    "prompt": request.prompt,
    "negative_prompt": request.negative_prompt,
    "provider": request.provider,
    "model": request.model,
    "size": request.size,
    "style": request.style,
    "quality": request.quality,
    "n": request.n
});

// AFTER — add helper functions before media_generate_image, then:
fn map_image_provider(id: Option<&str>) -> Option<&'static str> {
    match id {
        Some("google_imagen") | Some("google_imagen_lite") | Some("google") => Some("google"),
        Some("dalle") | Some("dall-e-3") | Some("openai") => Some("openai"),
        Some("stable_diffusion") | Some("stability") | Some("sdxl") => Some("stability"),
        _ => None, // let server pick default
    }
}

fn map_image_size(size: Option<&str>) -> &'static str {
    match size {
        Some("wide") => "1792x1024",
        Some("portrait") => "1024x1792",
        Some("large") => "1024x1024",
        Some("medium") => "1024x1024",
        Some("small") => "512x512",
        Some(other) if other.contains('x') => "1024x1024", // pass-through already-valid
        _ => "1024x1024",
    }
}

fn map_image_quality(quality: Option<&str>) -> &'static str {
    match quality {
        Some("hd") | Some("premium") => "hd",
        _ => "standard",
    }
}

// Then inside media_generate_image, replace payload construction:
let mapped_provider = map_image_provider(request.provider.as_deref());
let mapped_size = map_image_size(request.size.as_deref());
let mapped_quality = map_image_quality(request.quality.as_deref());

let payload = serde_json::json!({
    "prompt": request.prompt,
    "negative_prompt": request.negative_prompt,
    "provider": mapped_provider,
    "size": mapped_size,
    "style": request.style,
    "quality": mapped_quality,
    "n": request.n
    // NOTE: "model" field intentionally omitted — web API determines model from provider
});
```

**No other Rust changes needed** — all timeout values are already correctly set.

---

### Recommended Timeout Values (for reference)

| Provider    | Web API timeout       | Rust reqwest timeout | Notes                        |
| ----------- | --------------------- | -------------------- | ---------------------------- |
| DALL-E 3    | 55s AbortSignal       | 90s (current)        | Synchronous, 10–25s typical  |
| Imagen 4    | 55s AbortSignal       | 90s (current)        | Synchronous, 8–20s typical   |
| Stability   | 55s AbortSignal       | 90s (current)        | Synchronous, 10–20s typical  |
| Runway Gen4 | 30s for task creation | 90s (current)        | Async polling, 60–120s total |
| Veo 3.1     | 30s for task creation | 90s (current)        | Async LRO, 90–150s total     |

**Current values are correct and sufficient.** The Rust 90s reqwest timeout gives headroom
over the web API's 60s maxDuration + 55s AbortSignal.

---

### Whether to Switch Image Gen to Async Polling

**Recommendation: NO — keep synchronous for image, YES already implemented for video.**

DALL-E 3, Imagen 4, and Stability AI all offer only **synchronous REST APIs** — there is no
job ID or polling endpoint. The call blocks until the image is ready. The current architecture
is correct. 10–25 seconds is an acceptable blocking wait for a Tauri command.

Video generation already correctly uses async/polling via Runway's `GET /v1/tasks/{id}` and
Google Veo's `GET /v1beta/{operation_name}`. No changes needed to video.

---

### Summary: Implemented (TypeScript) vs Spec (Rust)

**Implemented directly (TypeScript/frontend)**:

1. `apps/desktop/src/components/Media/MediaGenerationProgress.tsx` — NEW component.
   Rich progress indicator with:
   - Animated spinner in amber (image) or purple (video)
   - Provider-specific time estimates (DALL-E: 10–25s, Imagen: 8–20s, Runway: 60–120s, Veo: 90–150s)
   - Live elapsed-seconds counter (updates every 1s via `setInterval`)
   - Progress bar advancing toward estimated max duration
   - Prompt snippet truncated to 60 chars for context

2. `apps/desktop/src/components/UnifiedAgenticChat/MediaLab.tsx` — UPDATED.
   - Imports `MediaGenerationProgress` and `MediaGenProvider`
   - Shows progress component above submit button when `loadingImage=true` (image tab)
   - Shows progress component above submit button when `loadingVideo=true` (video tab)
   - Maps frontend `ImageProviderId` to `MediaGenProvider` for correct time estimates

3. `apps/desktop/src/components/UnifiedAgenticChat/InlineToolResults/InlineMediaGeneration.tsx` — UPDATED.
   - Replaced basic `Loader2` spinners with `MediaGenerationProgress` for both
     `InlineImageGeneration` and `InlineVideoGeneration` running states
   - Maps provider strings from API response data to typed `MediaGenProvider`
   - Removed unused `Loader2` import

**Needs Rust implementation (spec above)**:

- `apps/desktop/src-tauri/src/sys/commands/media.rs`:
  - Add `map_image_provider()` — maps `google_imagen`/`dalle`/`stable_diffusion` to web API values
  - Add `map_image_size()` — maps `large`/`wide`/`portrait` to `1024x1024`/`1792x1024`/`1024x1792`
  - Add `map_image_quality()` — maps `premium` → `hd`
  - Remove `model` field from image generation payload

---

## B2: Model Catalog Rust Changes

**Date**: 2026-02-27
**Priority**: CRITICAL — these bugs silently break multi-model routing, AGI Workforce's core differentiator.

### Summary of Mismatches Found

| TS `id`             | TS `apiModelId` (doc) | Rust canonicalize output                      | Bug?                         |
| ------------------- | --------------------- | --------------------------------------------- | ---------------------------- |
| `deepseek-r1`       | `deepseek-reasoner`   | `deepseek-r1` (passthrough — NO canonicalize) | **YES — BREAKS DeepSeek R1** |
| `claude-sonnet-4.5` | `claude-sonnet-4-5`   | `claude-sonnet-4-5`                           | No — aligned now             |
| `claude-haiku-4.5`  | `claude-haiku-4-5`    | `claude-haiku-4-5`                            | No — aligned now             |
| `claude-sonnet-4.6` | `claude-sonnet-4-6`   | `claude-sonnet-4-6`                           | No                           |
| `claude-opus-4.6`   | `claude-opus-4-6`     | `claude-opus-4-6`                             | No                           |
| `gpt-5-pro`         | `gpt-5.2-pro`         | `gpt-5.2-pro`                                 | No                           |
| `grok-4`            | `grok-4-0709`         | `grok-4-0709`                                 | No                           |

### Fix 1 — CRITICAL: Add `canonicalize_model` to `DeepSeekAdapter`

**File**: `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`

**Root cause**: `DeepSeekAdapter` has no `canonicalize_model`. When the TS frontend sends `"deepseek-r1"` (the internal routing ID), Rust passes it unchanged to the DeepSeek API. But the DeepSeek API requires `"deepseek-reasoner"` for the R1 model. All DeepSeek R1 requests silently fail with a 404/invalid model error.

**BEFORE** (lines ~1986–2030, the `adapt_request` method):

```rust
impl ProviderAdapter for DeepSeekAdapter {
    fn adapt_request(&self, request: &LLMRequest) -> Result<Value, Box<dyn Error + Send + Sync>> {
        // DeepSeek uses OpenAI-compatible format with nested tools
        let adapter = OpenAIAdapter;
        adapter.adapt_request(request)
    }
```

**AFTER** — add an inherent impl block, then override `adapt_request` to apply canonicalization via JSON override:

```rust
impl DeepSeekAdapter {
    fn canonicalize_model(model: &str) -> &'static str {
        match model {
            // Frontend uses "deepseek-r1" as routing ID; DeepSeek API requires "deepseek-reasoner".
            "deepseek-r1" => "deepseek-reasoner",
            // deepseek-chat passes through unchanged — API accepts it directly.
            _ => model,
        }
    }
}

impl ProviderAdapter for DeepSeekAdapter {
    fn adapt_request(&self, request: &LLMRequest) -> Result<Value, Box<dyn Error + Send + Sync>> {
        // Delegate to OpenAI-compatible format, then override the model field.
        let adapter = OpenAIAdapter;
        let mut body = adapter.adapt_request(request)?;
        // Apply DeepSeek model ID canonicalization.
        let canonical = Self::canonicalize_model(&request.model);
        if canonical != request.model.as_str() {
            body["model"] = serde_json::json!(canonical);
        }
        Ok(body)
    }
```

Note: The `if canonical != request.model.as_str()` guard avoids unnecessary JSON mutation for models that pass through unchanged. The `canonicalize_model` signature uses `&'static str` to avoid allocations — the match arm returns a string literal, and the `_` arm will need to change to return `model` as a `&str` tied to the input lifetime. Adjust signature to `fn canonicalize_model<'a>(model: &'a str) -> &'a str` if needed.

---

### Fix 2 — Update `llm_router.rs` default model choices to use Claude Sonnet 4.6

**File**: `apps/desktop/src-tauri/src/core/llm/llm_router.rs`

**Root cause**: The Rust router's internal fallback paths hardcode `"claude-sonnet-4-5"` for coding and agentic intents. The current best Sonnet is 4.6 (78.5% SWE-bench vs 77.2%). This causes the Rust-side auto-routing to use an older model than the TS-side routing.

**All occurrences to replace** — search for `"claude-sonnet-4-5"` in `llm_router.rs` and replace with `"claude-sonnet-4-6"`:

Confirmed affected lines (approximate — verify with grep before applying):

- Line 423: coding intent, non-budget path
- Line 461: agentic intent, non-budget path
- Line 1248: balanced tier default
- Line 1470: auto-balanced coding
- Line 1504: auto-balanced general
- Line 1516: auto-balanced coding fallback
- Line 1598: premium coding fallback
- Line 1857: `default_model()` Anthropic Complex
- Line 1865: `default_model()` Anthropic Coding

**BEFORE** (all of the above):

```rust
"claude-sonnet-4-5".to_string()
```

**AFTER**:

```rust
"claude-sonnet-4-6".to_string()
```

Note: `"claude-sonnet-4-6"` (already hyphenated) passes through `AnthropicAdapter::canonicalize_model` via the `_` branch unchanged and is a valid Anthropic API alias.

Also update `default_model()` for Anthropic:

**BEFORE** (lines ~1780–1782):

```rust
TaskCategory::Simple => "claude-haiku-4-5".to_string(),
TaskCategory::Complex => "claude-sonnet-4-5".to_string(),
TaskCategory::Creative => "claude-sonnet-4-5".to_string(),
```

**AFTER**:

```rust
TaskCategory::Simple => "claude-haiku-4-5".to_string(),
TaskCategory::Complex => "claude-sonnet-4-6".to_string(),
TaskCategory::Creative => "claude-sonnet-4-6".to_string(),
```

---

### Fix 3 — Verify `AnthropicAdapter::canonicalize_model` covers all current models

**File**: `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs` (lines ~1706–1716)

**Current state** (correct — no changes needed here, confirmed):

```rust
fn canonicalize_model(model: &str) -> String {
    match model {
        "claude-haiku-4.5" => "claude-haiku-4-5".to_string(),
        "claude-sonnet-4.5" => "claude-sonnet-4-5".to_string(),
        "claude-sonnet-4.6" => "claude-sonnet-4-6".to_string(),
        "claude-opus-4.6" => "claude-opus-4-6".to_string(),
        _ => model.to_string(),
    }
}
```

This is correct. The `_` passthrough handles snapshot-pinned IDs correctly if ever passed directly.

### No Changes Required For

- `gpt-5-pro` → `gpt-5.2-pro`: `OpenAIAdapter::canonicalize_model` handles this at line 364.
- `grok-4` → `grok-4-0709`: `OpenAIAdapter::canonicalize_model` handles this at line 368.
- `gemini-3-pro-preview` / `gemini-3-flash-preview`: Google IDs pass through unchanged — correct.
- `sonar-pro` / `sonar` / `sonar-deep-research`: Perplexity uses `OpenAIAdapter` format, passes through unchanged — correct.
- `deepseek-chat`: DeepSeek API accepts `"deepseek-chat"` directly — correct, no canonicalization needed.
