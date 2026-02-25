# Specification: 10+ Hour Desktop Agent -- Unattended Background Execution

Generated: 2026-02-23T04:30:00Z

---

## Task Overview

Wire the real `AutonomousAgent` LLM+tool loop into the `BackgroundAgent` host, extend the 5-minute kill timer to 24 hours, add OS sleep prevention (macOS `caffeinate`, Windows `SetThreadExecutionState`), and add a morning report (OS notification via `tauri-plugin-notification` + markdown summary file on Desktop).

---

## Team Composition

- **Agent A (rust-tauri-engineer):** Creates `SleepPrevention` module, rewires `execute_background_agent` to use real `AutonomousAgent`, adds summary file writer and completion event emitter.
- **Agent B (rust-tauri-engineer):** Makes `AutonomousAgent::execute_task` public, adds `run_goal` convenience method, registers notification plugin, updates `lib.rs` to pass `router` + `automation` Arcs to `BackgroundAgentManager`, adds Windows Cargo feature, adds npm notification package.
- **Agent C (frontend-engineer):** Adds `background_agent:completed` and `background_agent:failed` listeners to the frontend event hook, with OS notification via `@tauri-apps/plugin-notification` and action log entries.

---

## File Allocation

### Agent A -- Rust Background Agent + Sleep Prevention

**Creates:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/power.rs` (NEW FILE)

**Modifies:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/mod.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/background_agent.rs`

**DO NOT TOUCH:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/autonomous.rs` (Agent B owns this)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/lib.rs` (Agent B owns this)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/Cargo.toml` (Agent B owns this)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/package.json` (Agent B owns this)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/hooks/useAgenticEvents.ts` (Agent C owns this)

---

#### File: `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/power.rs` (NEW)

This file does not exist yet. Agent A creates it.

**Must produce:**

```rust
/// Prevents the OS from going to sleep while a background agent is running.
/// On macOS: spawns `caffeinate -s -w <PID>`.
/// On Windows: calls `SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)`.
/// Implements Drop to clean up (kill caffeinate process / reset execution state).
pub struct SleepPrevention {
    // macOS: Option<std::process::Child> for the caffeinate process
    // Windows: boolean flag indicating state was set
}

impl SleepPrevention {
    /// Enable sleep prevention. Returns Ok(SleepPrevention) on success.
    /// On macOS: spawns `caffeinate -s -w <PID>` where PID is std::process::id().
    ///   If spawn() fails (e.g., non-macOS CI), logs a warning and returns Ok
    ///   with a no-op guard -- does NOT panic.
    /// On Windows: calls SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)
    ///   inside an unsafe {} block.
    /// On Linux/other: no-op, returns Ok immediately.
    pub fn enable() -> anyhow::Result<Self> { ... }
}

impl Drop for SleepPrevention {
    /// macOS: kills the caffeinate child process.
    /// Windows: calls SetThreadExecutionState(ES_CONTINUOUS) to reset.
    fn drop(&mut self) { ... }
}
```

Platform-conditional compilation:

- Use `#[cfg(target_os = "macos")]` for caffeinate logic.
- Use `#[cfg(target_os = "windows")]` for `SetThreadExecutionState`. The `windows` crate (v0.56) feature `"Win32_System_Power"` is needed -- Agent B adds this to Cargo.toml.
- Use `#[cfg(not(any(target_os = "macos", target_os = "windows")))]` for a no-op fallback.

---

#### File: `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/mod.rs`

**Current state (line 1-14):**

```rust
pub mod account;
pub mod api;
pub mod billing;
pub mod commands;
pub mod diagnostics;
pub mod error;
pub mod filesystem;
pub mod logging;
pub mod permissions;
pub mod prompt_enhancement;
pub mod security;
pub mod telemetry;
pub mod test_utils;
pub mod utils;
```

**Agent A adds** one line at the end:

```rust
pub mod power;
```

---

#### File: `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/background_agent.rs`

**Current state summary (1430 lines):**

- Line 43: `pub const DEFAULT_AGENT_TIMEOUT_SECS: u64 = 300;`
- Lines 328-339: `BackgroundAgentManager` struct with fields: `agents`, `handles`, `db_conn`, `app_handle`, `queue`.
- Lines 341-351: `BackgroundAgentManager::new(db_conn)` -- takes only `db_conn`.
- Lines 743-793: `start_agent_execution()` -- spawns `execute_background_agent()` with current args.
- Lines 1055-1206: `execute_background_agent()` -- the STUB function. Currently: simulates 10 steps, each sleeping 1 second. This is the primary rewrite target.
- Lines 1208-1248: `persist_agent_to_db()` -- standalone helper, no changes needed.

**Changes Agent A must make:**

1. **Line 43:** Change `DEFAULT_AGENT_TIMEOUT_SECS` from `300` to `86400`.

2. **Struct `BackgroundAgentManager` (line 328):** Add two new fields:

   ```rust
   pub struct BackgroundAgentManager {
       agents: Arc<RwLock<HashMap<String, BackgroundAgent>>>,
       handles: Arc<Mutex<HashMap<String, AgentHandle>>>,
       db_conn: Arc<std::sync::Mutex<Connection>>,
       app_handle: Option<AppHandle>,
       queue: Arc<RwLock<Vec<String>>>,
       // NEW FIELDS:
       router: Option<Arc<RwLock<crate::core::llm::LLMRouter>>>,
       automation: Option<Arc<crate::automation::AutomationService>>,
   }
   ```

3. **`BackgroundAgentManager::new()` (line 343):** Change signature to accept optional router and automation:

   ```rust
   pub fn new(
       db_conn: Arc<std::sync::Mutex<Connection>>,
       router: Option<Arc<RwLock<crate::core::llm::LLMRouter>>>,
       automation: Option<Arc<crate::automation::AutomationService>>,
   ) -> Self {
       Self {
           agents: Arc::new(RwLock::new(HashMap::new())),
           handles: Arc::new(Mutex::new(HashMap::new())),
           db_conn,
           app_handle: None,
           queue: Arc::new(RwLock::new(Vec::new())),
           router,
           automation,
       }
   }
   ```

4. **`start_agent_execution()` (lines 743-793):** Pass `router` and `automation` clones to the spawned `execute_background_agent()`:

   ```rust
   let router = self.router.clone();
   let automation = self.automation.clone();
   // ... in tokio::spawn:
   execute_background_agent(
       agent_id_owned,
       agent,
       command_rx,
       agents,
       db_conn,
       app_handle,
       timeout_secs,
       router,       // NEW
       automation,   // NEW
   ).await
   ```

5. **`execute_background_agent()` (lines 1055-1206):** FULL REWRITE. New signature:

   ```rust
   async fn execute_background_agent(
       agent_id: String,
       agent: BackgroundAgent,
       mut command_rx: mpsc::Receiver<AgentCommand>,
       agents: Arc<RwLock<HashMap<String, BackgroundAgent>>>,
       db_conn: Arc<std::sync::Mutex<Connection>>,
       app_handle: Option<AppHandle>,
       timeout_secs: u64,
       router: Option<Arc<RwLock<crate::core::llm::LLMRouter>>>,
       automation: Option<Arc<crate::automation::AutomationService>>,
   )
   ```

   **Implementation outline:**
   - (a) FIRST THING: Call `SleepPrevention::enable()` and bind the returned guard to a `let _sleep_guard = ...;` so it lives for the entire function scope. If it fails, log a warning but continue.
   - (b) Check that `router` and `automation` are `Some`. If either is `None`, fail the agent immediately with an appropriate error.
   - (c) Create `AutonomousAgent`:
     ```rust
     use crate::core::agent::{AgentConfig, AutonomousAgent};
     let config = AgentConfig { auto_approve: true, ..Default::default() };
     let autonomous = AutonomousAgent::new(config, automation.unwrap(), router.unwrap())?;
     if let Some(ref handle) = app_handle {
         autonomous.set_app_handle(handle.clone());
     }
     ```
   - (d) Call `autonomous.run_goal(agent.goal.clone())` inside `tokio::select!` with three branches:
     - `result = autonomous.run_goal(...)` -- the main work
     - `Some(cmd) = command_rx.recv()` -- handle Cancel/TakeOver/Pause commands
     - `_ = tokio::time::sleep(Duration::from_secs(timeout_secs))` -- timeout
   - (e) On success: build `AgentSummary` from the result, call `write_summary_file()`, update agent status via `agents` lock + `persist_agent_to_db`, call `emit_completion_event`.
   - (f) On failure/timeout/cancel: update agent status accordingly, emit failure event.
   - (g) The `_sleep_guard` drops automatically when the function returns, restoring OS sleep.

6. **Add `write_summary_file()` helper** (new function after `execute_background_agent`):

   ```rust
   fn write_summary_file(agent_id: &str, goal: &str, summary: &AgentSummary) {
       let desktop_dir = dirs::desktop_dir().unwrap_or_else(|| {
           dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("."))
       });
       let filename = format!("agent-report-{}.md", &agent_id[..8.min(agent_id.len())]);
       let path = desktop_dir.join(&filename);
       let content = format!(
           "# Background Agent Report\n\n\
            **Agent ID:** {}\n\
            **Goal:** {}\n\
            **Result:** {}\n\n\
            ## Actions Taken\n\n{}\n\n\
            ## Files Changed\n\n{}\n\n\
            ## Warnings\n\n{}\n",
           agent_id,
           goal,
           summary.description,
           summary.actions_taken.iter().map(|a| format!("- {}", a)).collect::<Vec<_>>().join("\n"),
           summary.files_changed.iter().map(|f| format!("- {}", f)).collect::<Vec<_>>().join("\n"),
           summary.warnings.iter().map(|w| format!("- {}", w)).collect::<Vec<_>>().join("\n"),
       );
       if let Err(e) = std::fs::write(&path, &content) {
           tracing::warn!("[BackgroundAgent] Failed to write summary to {:?}: {}", path, e);
       } else {
           tracing::info!("[BackgroundAgent] Summary written to {:?}", path);
       }
   }
   ```

7. **Add `emit_completion_event()` helper** (new function):
   ```rust
   fn emit_completion_event(
       app_handle: &Option<AppHandle>,
       agent_id: &str,
       summary: &AgentSummary,
   ) {
       if let Some(ref app) = app_handle {
           let _ = app.emit(
               "background_agent:completed",
               serde_json::json!({
                   "agentId": agent_id,
                   "goalAchieved": summary.goal_achieved,
                   "description": summary.description,
                   "filesChanged": summary.files_changed,
                   "actionsTaken": summary.actions_taken,
                   "warnings": summary.warnings,
               }),
           );
       }
   }
   ```

**Test update:** The existing test `create_test_manager()` at line 1305 calls `BackgroundAgentManager::new(Arc::new(...))`. Agent A must update this to pass `None, None` for the two new parameters:

```rust
BackgroundAgentManager::new(Arc::new(std::sync::Mutex::new(conn)), None, None)
```

---

### Agent B -- AutonomousAgent API + Plugin Registration + lib.rs Wiring

**Modifies:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/autonomous.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/Cargo.toml`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/package.json`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/lib.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/capabilities/default.json`

**DO NOT TOUCH:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/background_agent.rs` (Agent A owns this)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/power.rs` (Agent A owns this)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/mod.rs` (Agent A owns this)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/hooks/useAgenticEvents.ts` (Agent C owns this)

---

#### File: `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/autonomous.rs`

**Current state (795 lines):**

- Line 29-41: `AutonomousAgent` struct with fields: `config`, `automation`, `router`, `planner`, `executor`, `vision`, `approval`, `task_queue`, `running_tasks`, `stop_signal`, `app_handle`.
- Line 44-67: `AutonomousAgent::new(config, automation, router)` constructor.
- Line 116-164: `submit_task(&self, description, auto_approve) -> Result<String>` -- plans the task, creates a `Task`, pushes to queue, returns task ID.
- Line 330: `async fn execute_task(&self, task_id: String) -> Result<()>` -- PRIVATE. This is the core execution loop with self-healing, replanning, step events, etc.

**Changes Agent B must make:**

1. **Line 330:** Make `execute_task` public:

   ```rust
   // BEFORE (line 330):
   async fn execute_task(&self, task_id: String) -> Result<()> {
   // AFTER:
   pub async fn execute_task(&self, task_id: String) -> Result<()> {
   ```

2. **After line 164 (after `submit_task`), add `run_goal` method:**

   ```rust
   /// Convenience method for background agents: plans and executes a goal
   /// synchronously (blocks until complete or fails). Returns the final task status.
   ///
   /// This combines submit_task + start + wait-for-completion into a single call.
   /// Uses auto_approve=true since background agents run unattended.
   pub async fn run_goal(&self, goal: String) -> Result<String> {
       let task_id = self.submit_task(goal, Some(true)).await?;

       // Start the autonomous loop to process this task
       // We run the loop until the task reaches a terminal state
       let timeout = std::time::Duration::from_secs(86400); // 24h max
       let start = std::time::Instant::now();

       loop {
           if start.elapsed() > timeout {
               return Err(anyhow!("run_goal timed out after 24 hours"));
           }

           // Process one cycle of the task queue
           self.process_task_queue().await?;

           // Check if our task is done
           if let Some(task) = self.get_task_status(&task_id)? {
               match &task.status {
                   TaskStatus::Completed => {
                       return Ok(format!("Task completed: {}", task.description));
                   }
                   TaskStatus::Failed(err) => {
                       return Err(anyhow!("Task failed: {}", err));
                   }
                   TaskStatus::Cancelled => {
                       return Err(anyhow!("Task was cancelled"));
                   }
                   _ => {
                       // Still running, continue loop
                   }
               }
           } else {
               return Err(anyhow!("Task {} disappeared from queue", task_id));
           }

           tokio::time::sleep(std::time::Duration::from_millis(100)).await;
       }
   }
   ```

   **Important:** `process_task_queue` is currently private (line 166). Agent B must also make it `pub(crate)`:

   ```rust
   // Line 166: BEFORE
   async fn process_task_queue(&self) -> Result<()> {
   // AFTER
   pub(crate) async fn process_task_queue(&self) -> Result<()> {
   ```

---

#### File: `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/Cargo.toml`

**Current state:**

- Line 32: `tauri-plugin-notification = "2.3.3"` -- ALREADY PRESENT. No change needed here.
- Lines 202-223: `[target.'cfg(windows)'.dependencies]` section with `windows` crate features. Does NOT currently include `"Win32_System_Power"`.

**Agent B adds** `"Win32_System_Power"` to the `windows` crate features list (needed for `SetThreadExecutionState`):

```toml
windows = { version = "0.56", features = [
    "Win32_Foundation",
    "Win32_System_Threading",
    "Win32_UI_WindowsAndMessaging",
    "Win32_UI_Input_KeyboardAndMouse",
    "Win32_UI_Accessibility",
    "Win32_Graphics_Gdi",
    "Win32_Graphics_Dxgi",
    "Win32_Graphics_Direct3D11",
    "Win32_System_Com",
    "Win32_System_DataExchange",
    "Win32_System_Ole",
    "Win32_UI_Shell",
    "Win32_Security",
    "Win32_System_Memory",
    "Win32_System_SystemServices",
    "Win32_System_Registry",
    "Win32_System_Power",              # <-- ADD THIS LINE
    "Media_SpeechRecognition",
    "Storage_Streams",
    "Globalization"
] }
```

---

#### File: `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/package.json`

**Current state:** Does NOT contain `@tauri-apps/plugin-notification` in dependencies.

**Agent B adds** to `"dependencies"`:

```json
"@tauri-apps/plugin-notification": "^2"
```

Place it alphabetically near the other `@tauri-apps/` entries (after `@tauri-apps/plugin-fs` line 50).

---

#### File: `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/lib.rs`

**Current state of BackgroundAgentManager init (lines 468-487):**

```rust
// Background Agent Manager for "&" prefix background tasks
{
    use crate::core::agent::{BackgroundAgentManager, BackgroundAgentManagerState};
    let bg_agent_manager = BackgroundAgentManager::new(db_conn_arc.clone());
    let mut bg_manager_with_handle = bg_agent_manager;
    bg_manager_with_handle.set_app_handle(app.handle().clone());
    let bg_state = BackgroundAgentManagerState::new(bg_manager_with_handle);
    // ... initialization spawn ...
    app.manage(bg_state);
    tracing::info!("Background Agent Manager initialized");
}
```

**Relevant existing state that provides the Arcs we need:**

- `LLMState` is managed at line 206: `app.manage(LLMState::new());`. `LLMState` has field `pub router: Arc<RwLock<LLMRouter>>` (from `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/llm.rs` line 40-41).
- `AutomationService` is managed at line 360: `app.manage(Some(std::sync::Arc::new(automation_service)));` -- stored as `Option<Arc<AutomationService>>`.

**Agent B must change** the BackgroundAgentManager init block (lines 468-487) to:

```rust
// Background Agent Manager for "&" prefix background tasks
{
    use crate::core::agent::{BackgroundAgentManager, BackgroundAgentManagerState};
    use crate::sys::commands::llm::LLMState;

    // Retrieve the LLM router and automation service Arcs for background agent use
    let llm_state: tauri::State<LLMState> = app.state();
    let router = Some(llm_state.router.clone());

    let automation_state: tauri::State<Option<std::sync::Arc<crate::automation::AutomationService>>> = app.state();
    let automation = automation_state.inner().clone();

    let bg_agent_manager = BackgroundAgentManager::new(
        db_conn_arc.clone(),
        router,
        automation,
    );
    let mut bg_manager_with_handle = bg_agent_manager;
    bg_manager_with_handle.set_app_handle(app.handle().clone());
    let bg_state = BackgroundAgentManagerState::new(bg_manager_with_handle);

    // Initialize and restore any persisted agents
    let bg_state_clone = bg_state.0.clone();
    tauri::async_runtime::spawn(async move {
        let manager = bg_state_clone.read().await;
        if let Err(e) = manager.initialize().await {
            tracing::warn!("Failed to initialize background agent manager: {}. Background agent features may be degraded.", e);
        }
    });

    app.manage(bg_state);
    tracing::info!("Background Agent Manager initialized");
}
```

**CRITICAL:** The `LLMState` must be managed BEFORE this block. It is managed at line 206 (`app.manage(LLMState::new())`), and the `AutomationService` at line 358-367. Both are above line 468. The ordering is safe.

---

#### File: `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/capabilities/default.json`

**Current state:** Already contains comprehensive notification permissions (lines 230-244):

```json
"notification:allow-is-permission-granted",
"notification:allow-request-permission",
"notification:allow-notify",
"notification:allow-register-action-types",
"notification:allow-register-listener",
"notification:allow-cancel",
"notification:allow-get-pending",
"notification:allow-remove-active",
"notification:allow-get-active",
"notification:allow-check-permissions",
"notification:allow-show",
"notification:allow-batch",
"notification:allow-list-channels",
"notification:allow-delete-channel",
"notification:allow-create-channel",
```

**No changes needed.** All notification permissions are already present.

Also: `tauri_plugin_notification::init()` is ALREADY registered in `lib.rs` at line 95:

```rust
.plugin(tauri_plugin_notification::init())
```

**No plugin registration change needed.**

---

### Agent C -- Frontend Event Listeners

**Modifies:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/hooks/useAgenticEvents.ts`

**DO NOT TOUCH:**

- All Rust files (Agent A and Agent B own them)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/package.json` (Agent B owns this)

---

#### File: `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/hooks/useAgenticEvents.ts`

**Current state (1500+ lines):**

- Line 1: Imports `invoke`, `listen`, `UnlistenFn` from `../lib/tauri-mock`.
- Line 5: Imports `isTauri` from `../lib/tauri-mock`.
- Line 219-780+: `useAgenticEvents()` function with event listeners.
- Line 780: `const push = (fn: UnlistenFn) => unlistenFns.current.push(fn);`
- Lines 1406-1427: `agent:task-failed` listener -- this is the insertion point AFTER which Agent C adds new listeners.
- Lines 1429-1452: `task:progress`, `task:completed`, `task:failed` listeners.

**Changes Agent C must make:**

1. **Add import at the top of the file (after line 1):**

   ```typescript
   import {
     sendNotification,
     isPermissionGranted,
     requestPermission,
   } from '@tauri-apps/plugin-notification';
   ```

2. **After line 1427 (after `push(unlistenTaskFailed2);`) and BEFORE line 1429 (`const unlistenTaskProgress`), insert two new listeners:**

   ```typescript
   // --- Background Agent completion listener ---
   const unlistenBgAgentCompleted = await listen<{
     agentId: string;
     goalAchieved?: boolean;
     description?: string;
     filesChanged?: string[];
     actionsTaken?: string[];
     warnings?: string[];
   }>('background_agent:completed', async (event) => {
     if (!isMountedRef.current) return;
     const { agentId, goalAchieved, description, filesChanged, actionsTaken } = event.payload;

     // OS notification
     try {
       let permissionGranted = await isPermissionGranted();
       if (!permissionGranted) {
         const permission = await requestPermission();
         permissionGranted = permission === 'granted';
       }
       if (permissionGranted) {
         sendNotification({
           title: goalAchieved
             ? 'Background Task Completed'
             : 'Background Task Partially Completed',
           body: description || `Agent ${agentId.slice(0, 8)} finished.`,
         });
       }
     } catch (notifErr) {
       console.warn('Failed to send background agent notification:', notifErr);
     }

     // Action log entry
     upsertActionLogEntry({
       id: `bg-agent-${agentId}`,
       type: 'plan',
       title: goalAchieved ? 'Background agent completed' : 'Background agent partially completed',
       description: description || 'Background agent finished execution.',
       status: 'success',
       metadata: {
         agentId,
         filesChanged: filesChanged ?? [],
         actionsTaken: actionsTaken ?? [],
       },
     });
   });
   push(unlistenBgAgentCompleted);

   // --- Background Agent failure listener ---
   const unlistenBgAgentFailed = await listen<{
     agentId: string;
     message?: string;
   }>('background_agent:failed', async (event) => {
     if (!isMountedRef.current) return;
     const { agentId, message: errorMessage } = event.payload;

     // OS notification
     try {
       let permissionGranted = await isPermissionGranted();
       if (!permissionGranted) {
         const permission = await requestPermission();
         permissionGranted = permission === 'granted';
       }
       if (permissionGranted) {
         sendNotification({
           title: 'Background Task Failed',
           body: errorMessage || `Agent ${agentId.slice(0, 8)} failed.`,
         });
       }
     } catch (notifErr) {
       console.warn('Failed to send background agent failure notification:', notifErr);
     }

     // Action log entry
     upsertActionLogEntry({
       id: `bg-agent-${agentId}`,
       type: 'plan',
       title: 'Background agent failed',
       description: errorMessage || 'Background agent encountered an error.',
       status: 'failed',
       error: errorMessage,
       metadata: { agentId },
     });
   });
   push(unlistenBgAgentFailed);
   ```

---

## Interface Contracts

### Agent B -> Agent A: `AutonomousAgent::run_goal`

Agent A's rewritten `execute_background_agent` calls `autonomous.run_goal(goal)` which Agent B creates.

```rust
// Produced by Agent B in autonomous.rs
impl AutonomousAgent {
    pub async fn run_goal(&self, goal: String) -> Result<String>;
}
```

- **Input:** `goal: String` -- the natural language goal description.
- **Output:** `Ok(String)` -- a human-readable completion message (e.g., "Task completed: ..."). `Err(anyhow::Error)` on failure.
- **Behavior:** Plans the task with `submit_task(goal, Some(true))`, then polls `process_task_queue()` in a loop until the task reaches a terminal status.

### Agent B -> Agent A: `BackgroundAgentManager::new` signature change

Agent A changes the signature:

```rust
pub fn new(
    db_conn: Arc<std::sync::Mutex<Connection>>,
    router: Option<Arc<RwLock<crate::core::llm::LLMRouter>>>,
    automation: Option<Arc<crate::automation::AutomationService>>,
) -> Self
```

Agent B calls this in `lib.rs` with the extracted Arcs:

```rust
BackgroundAgentManager::new(db_conn_arc.clone(), router, automation)
```

### Agent A -> Agent C: Event payload contracts

**`background_agent:completed` event** (emitted by Agent A's `emit_completion_event`):

```json
{
  "agentId": "string (UUID)",
  "goalAchieved": "boolean",
  "description": "string",
  "filesChanged": ["string"],
  "actionsTaken": ["string"],
  "warnings": ["string"]
}
```

**`background_agent:failed` event** (emitted by Agent A in the failure path):

```json
{
  "agentId": "string (UUID)",
  "message": "string (error description)"
}
```

These are already the shapes used in the existing code (see `background_agent.rs` lines 1117-1122 and 1194-1198). Agent C's TypeScript types must match these payloads exactly.

### Agent B -> Agent C: `@tauri-apps/plugin-notification` npm package

Agent C imports `sendNotification`, `isPermissionGranted`, `requestPermission` from `@tauri-apps/plugin-notification`. Agent B adds this package to `package.json`. The import will NOT resolve until `pnpm install` is run after Agent B's changes.

---

## DO NOT TOUCH Sections

These files and code sections must NOT be modified by ANY agent:

| File                                                                | Reason                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `BackgroundAgentStatus` enum (lines 46-63 of `background_agent.rs`) | Explicitly forbidden -- no new variants                                   |
| `background_agents` SQLite schema                                   | Explicitly forbidden -- no schema changes                                 |
| `AgentCommand` enum (lines 304-314 of `background_agent.rs`)        | Preserve existing Pause/Cancel/TakeOver/Resume commands                   |
| `AgentProgress` struct (lines 95-120 of `background_agent.rs`)      | Preserve existing tracking                                                |
| `persist_agent` and `persist_agent_to_db` functions                 | Preserve existing persistence pattern                                     |
| `load_persisted_agents` and `resume_queued_agents`                  | Crash recovery must continue to work                                      |
| `BackgroundAgentManagerState` wrapper (line 1260)                   | No changes needed                                                         |
| `apps/desktop/src-tauri/src/core/agent/mod.rs`                      | Re-exports are fine; do NOT add new re-exports without matching pub items |
| `apps/desktop/src-tauri/src/core/agent/executor.rs`                 | Not part of this task                                                     |
| `apps/desktop/src-tauri/src/core/agent/planner.rs`                  | Not part of this task                                                     |
| `apps/desktop/src-tauri/src/core/llm/llm_router.rs`                 | Not part of this task                                                     |
| All files under `apps/desktop/src-tauri/src/sys/commands/`          | Not part of this task                                                     |
| `apps/desktop/src-tauri/src/automation/mod.rs`                      | Not part of this task                                                     |

---

## Existing Patterns to Reuse

1. **`persist_agent_to_db(&db_conn, agent)`** -- standalone function at line 1208. Used inside `execute_background_agent` for status persistence. Agent A should continue using this.

2. **`AutonomousAgent::set_app_handle(handle)`** -- line 70 of `autonomous.rs`. Agent A must call this when creating the `AutonomousAgent` inside `execute_background_agent` so that step events (`agent:step-started`, `agent:step-completed`, `agent:step-failed`, etc.) are emitted to the frontend.

3. **`AgentConfig { auto_approve: true, ..Default::default() }`** -- use for unattended background runs. `AgentConfig::default()` is at line 284 of `mod.rs`.

4. **`command_rx` drain pattern** -- Agent A's `tokio::select!` should use `command_rx.recv()` for cancellation. When `AgentCommand::Cancel` is received, the agent should be failed/cancelled. When `AgentCommand::TakeOver` is received, mark as taken over.

5. **`truncate_string(s, max_len)`** -- utility at line 1251 of `background_agent.rs`. Already available for notification body truncation.

6. **`upsertActionLogEntry`** -- Agent C's helper defined at line 432 of `useAgenticEvents.ts`. Used to create or update action log entries in the store.

---

## Dependency Graph

```
Agent B: autonomous.rs changes
  |
  +--> Agent A: background_agent.rs (calls run_goal)
  |
Agent B: Cargo.toml + package.json + lib.rs
  |
  +--> Agent A: background_agent.rs (needs new BackgroundAgentManager::new signature in lib.rs)
  +--> Agent C: useAgenticEvents.ts (needs @tauri-apps/plugin-notification npm package)
```

**Recommended execution order:**

1. Agent B runs FIRST -- makes `autonomous.rs`, `Cargo.toml`, `package.json`, `lib.rs`, and `capabilities/default.json` changes.
2. Agent A runs SECOND (or in parallel, understanding it cannot compile until Agent B completes) -- creates `power.rs`, modifies `mod.rs` and `background_agent.rs`.
3. Agent C runs in PARALLEL with Agent A -- TypeScript does not require Rust compilation. However, the `@tauri-apps/plugin-notification` import will not resolve until `pnpm install` is run after Agent B adds it to `package.json`.

---

## Verification Checklist

- [x] All file paths verified to exist in the codebase (except `power.rs` which is NEW)
- [x] `tauri-plugin-notification` Rust crate already in `Cargo.toml` (line 32) and plugin already registered in `lib.rs` (line 95)
- [x] Notification capability permissions already in `capabilities/default.json` (lines 230-244)
- [x] `@tauri-apps/plugin-notification` npm package NOT yet in `package.json` -- Agent B must add it
- [x] `Win32_System_Power` feature NOT yet in `Cargo.toml` Windows features -- Agent B must add it
- [x] `Win32_System_SystemServices` IS already present (line 218) -- no duplication risk
- [x] `LLMState` is managed before BackgroundAgentManager init (line 206 vs line 468) -- safe ordering
- [x] `AutomationService` is managed before BackgroundAgentManager init (line 358 vs line 468) -- safe ordering
- [x] `AutonomousAgent::new` takes `(config, Arc<AutomationService>, Arc<RwLock<LLMRouter>>)` -- matches Arcs we extract
- [x] `execute_task` at line 330 is private; Agent B makes it public
- [x] `process_task_queue` at line 166 is private; Agent B makes it `pub(crate)`
- [x] No circular dependencies between agent scopes
- [x] DO NOT TOUCH sections clearly defined
- [x] Event payload contracts documented for both Rust emitter and TypeScript listener
- [x] Test at line 1305 uses `BackgroundAgentManager::new(...)` -- Agent A must update call site

---

## Risk Notes

1. **Compilation dependency:** Agent A's code will not compile until Agent B's `run_goal` method exists in `autonomous.rs`. If agents run truly in parallel, Agent A should write the code expecting `run_goal` to exist and accept a compile error until Agent B merges.

2. **`pnpm install` required:** After Agent B adds `@tauri-apps/plugin-notification` to `package.json`, someone must run `pnpm install` before Agent C's TypeScript compiles. This should be done as part of the integration step.

3. **`SleepPrevention` on CI:** macOS CI environments may not have `caffeinate` or may run in restricted sandbox. The `enable()` method must log a warning and return a no-op guard if `spawn()` fails -- never panic.

4. **Windows unsafe block:** `SetThreadExecutionState` requires `unsafe`. This is acceptable but should have a `// SAFETY:` comment explaining why it is sound.
