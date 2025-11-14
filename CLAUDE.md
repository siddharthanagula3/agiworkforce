# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AGI Workforce is an autonomous desktop automation platform built on **Tauri 2.0, React 18, TypeScript, and Rust**. The goal is to deliver a secure, low-latency Windows-first agent that orchestrates desktop automation, browser control, API workflows, and marketplace extensions while routing intelligently across multiple LLMs (including local models via Ollama) to minimize cost.

**Current Status:** Pre-alpha with AGI system fully implemented. Build health significantly improved through critical fixes to Rust unsafe code, TypeScript configuration, and dependency management. `pnpm typecheck` and `pnpm lint` pass with minimal errors. AGI Core system is complete with chat integration, resource monitoring, and 15+ tools. SSE streaming implementation is in progress (`router/sse_parser.rs`). Tool connections for browser/API/database are partially complete. Error handling, testing, and security guardrails remain incomplete. Version pinning ensures reproducible builds across the team.

## Commands

### Setup and Installation

```powershell
# Install dependencies
pnpm install

# Lint and type-check
pnpm lint
pnpm typecheck
```

### Development

```powershell
# Run desktop app in dev mode (Vite + Tauri hot reload)
pnpm --filter @agiworkforce/desktop dev

# Build desktop app for production
pnpm --filter @agiworkforce/desktop build

# Run tests for desktop app
pnpm --filter @agiworkforce/desktop test

# Run tests with UI
pnpm --filter @agiworkforce/desktop test:ui

# Run tests with coverage
pnpm --filter @agiworkforce/desktop test:coverage
```

### Rust Commands

```powershell
# Check Rust code (from apps/desktop/src-tauri)
cd apps/desktop/src-tauri
cargo check

# Run Rust tests
cargo test

# Build release binary
cargo build --release

# View dependency tree
cargo tree --depth 1

# Clean build artifacts
cargo clean
```

### Individual Package Commands

```powershell
# Run commands for specific workspace packages
pnpm --filter @agiworkforce/utils test
pnpm --filter @agiworkforce/ui-components test
pnpm --filter @agiworkforce/types typecheck
```

### Monorepo Structure

The repository uses pnpm workspaces with the following structure:

- `apps/desktop` - Primary Tauri + React desktop application
- `apps/mobile` - React Native/Expo companion app (scaffolded, incomplete)
- `apps/extension` - Browser extension bridge (prototype)
- `packages/types` - Shared TypeScript types
- `packages/ui-components` - Shared React components
- `packages/utils` - Shared utilities
- `services/api-gateway` - Node/Express API gateway
- `services/signaling-server` - WebSocket signaling server for P2P
- `services/update-server` - Update distribution service

## Architecture

### Frontend (React/TypeScript)

- **Framework:** React 18 with TypeScript 5.4+, Vite build tool
- **State Management:** Zustand stores (located in `apps/desktop/src/stores/`)
- **UI Components:** Radix UI primitives + Tailwind CSS + custom components
- **Routing:** React Router v6
- **Forms:** React Hook Form with Zod validation
- **Key Libraries:** Monaco Editor, xterm.js, react-markdown, framer-motion

**Store Architecture:**

- Each feature has its own Zustand store (e.g., `chatStore.ts`, `automationStore.ts`, `settingsStore.ts`)
- Stores manage local UI state and communicate with Rust backend via Tauri IPC
- Use `immer` for immutable state updates

### Backend (Rust/Tauri)

- **Framework:** Tauri 2.0 with Tokio async runtime
- **Database:** SQLite (via `rusqlite`) for local persistence
- **Modular Control Primitives (MCPs):** Feature modules organized by domain

**MCP Modules** (in `apps/desktop/src-tauri/src/`):

- `automation/` - Windows UI automation via UIA (UI Automation API)
- `browser/` - Browser automation using Playwright/CDP
- `filesystem/` - File operations, watching, traversal
- `database/` - SQL and NoSQL database connectivity
- `api/` - HTTP client, OAuth2, request templating
- `communications/` - Email (IMAP/SMTP) integration
- `calendar/` - Google Calendar, Outlook integration
- `cloud/` - Drive, Dropbox, OneDrive connectors
- `productivity/` - Notion, Trello, Asana integrations
- `document/` - Document processing (Word, Excel, PDF)
- `terminal/` - PTY session management
- `providers/` - LLM provider implementations
- `router/` - Multi-LLM routing logic
- `security/` - Permission prompts, sandboxing
- `telemetry/` - Logging, tracing, metrics

**Command Registration:**
All Tauri commands are registered in `apps/desktop/src-tauri/src/main.rs` via `invoke_handler!` macro. When adding new commands:

1. Implement the command function in the appropriate module with `#[tauri::command]` attribute
2. Re-export it from `commands/mod.rs`
3. Add it to the `invoke_handler!` list in `main.rs`
4. Ensure proper state management - use `app.manage()` in setup for global state

**State Management:**
The application uses Tauri's managed state pattern. Common state objects initialized in `main.rs` setup:

- `AppDatabase` - SQLite connection for persistence
- `LLMState` - LLM router state
- `BrowserStateWrapper` - Browser automation state
- `SettingsServiceState` - Settings service with database
- `FileWatcherState` - File watching service
- `ApiState` - HTTP client state
- `DatabaseState` - Database connection state
- `CloudState` - Cloud storage state
- `CalendarState` - Calendar integration state
- `TaskManagerState` - Background task manager state

### AGI System Architecture

**Location:** `apps/desktop/src-tauri/src/agi/` and `apps/desktop/src-tauri/src/agent/`

The AGI system is a three-layer autonomous agent architecture:

**1. AGI Core Layer** (`agi/`):

- `core.rs` - Central orchestrator managing all AGI systems
- `tools.rs` - Tool registry with 15+ tools (file operations, UI automation, browser, database, API)
- `knowledge.rs` - SQLite-backed knowledge base storing goals, plans, and experiences
- `resources.rs` - Real-time resource monitoring (CPU, memory, network, storage) using sysinfo
- `planner.rs` - LLM-powered planning with knowledge integration
- `executor.rs` - Step execution engine with dependency resolution
- `memory.rs` - Working memory for context management
- `learning.rs` - Self-improvement system learning from execution history

**2. Autonomous Agent Layer** (`agent/`):

- `autonomous.rs` - 24/7 execution loop for background task processing
- `planner.rs` - LLM-powered task breakdown into executable steps
- `executor.rs` - Step-by-step execution with retry logic
- `vision.rs` - Vision-based automation (screenshot capture, OCR, image matching)
- `approval.rs` - Auto-approval system for safe operations

**3. Enhanced Automation Layer** (`automation/`):

- `uia/` - UI Automation with element caching (30s TTL), waiting strategies, retry logic
- `input/mouse.rs` - Smooth mouse movements, drag-and-drop simulation
- `input/keyboard.rs` - Typing speed control, keyboard macros
- `screen/` - Screen capture (full screen, region, window)

**Chat Integration:**
The AGI system integrates with the chat interface via automatic goal detection. When users type goal-like messages, they are automatically submitted to the AGI planner. Progress updates emit via Tauri events (`agi:goal_progress`, `agi:step_completed`, `agi:goal_completed`).

**Tool Connection Status:**

- ✅ Fully connected: `file_read`, `file_write`, `ui_screenshot`, `ui_click`, `ui_type`, `browser_navigate`, `code_execute`, `db_query`, `api_call`, `image_ocr`
- ⏳ Pending: `llm_reason` (needs router access from AGICore context)

**4. Parallel Agent Orchestration** (`agi/orchestrator.rs`):

The orchestrator enables running 4-8 concurrent AGI agents simultaneously, similar to Cursor's parallel agent system. This allows for complex multi-agent workflows with proper isolation and coordination.

**Key Features:**

- **Agent Pool Management:** Support for 4-8 concurrent agents (configurable)
- **Isolation:** Each agent runs in its own execution context with isolated AGICore instance
- **Shared Knowledge:** All agents share a thread-safe knowledge base via `Arc<RwLock<KnowledgeBase>>`
- **Resource Locking:** Prevents conflicts when multiple agents access the same files or UI elements
- **Coordination Patterns:** Parallel, Sequential, Conditional, and Supervisor-Worker execution modes

**Agent Status Tracking:**

```rust
pub struct AgentStatus {
    pub id: String,
    pub name: String,
    pub status: AgentState, // Idle, Running, Paused, Completed, Failed
    pub current_goal: Option<String>,
    pub current_step: Option<String>,
    pub progress: u8, // 0-100
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub error: Option<String>,
}
```

**Resource Locking:**

The `ResourceLock` system prevents conflicts when multiple agents need the same resources:

```rust
// File locking (prevents concurrent file edits)
let guard = resource_lock.try_acquire_file(&path)?;
// ... work with file
drop(guard); // Automatically releases lock

// UI element locking (prevents concurrent UI interactions)
let guard = resource_lock.try_acquire_ui_element("#submit-button")?;
// ... interact with element
drop(guard); // Automatically releases lock
```

**Tauri Commands:**

- `orchestrator_init(max_agents, config)` - Initialize orchestrator with max agent capacity
- `orchestrator_spawn_agent(goal)` - Spawn a single agent
- `orchestrator_spawn_parallel(goals)` - Spawn multiple agents in parallel
- `orchestrator_get_agent_status(id)` - Get real-time status of an agent
- `orchestrator_list_agents()` - List all active agents
- `orchestrator_cancel_agent(id)` - Cancel a specific agent
- `orchestrator_cancel_all()` - Cancel all running agents
- `orchestrator_wait_all()` - Wait for all agents to complete and return results
- `orchestrator_cleanup()` - Remove completed agents from memory

**Tauri Events:**

- `agent:spawned` - Emitted when a new agent is spawned
- `agent:progress` - Emitted when an agent makes progress
- `agent:completed` - Emitted when an agent completes successfully
- `agent:failed` - Emitted when an agent fails
- `agent:cancelled` - Emitted when an agent is cancelled

**Usage Examples:**

See `apps/desktop/src-tauri/src/agi/orchestrator_examples.rs` for comprehensive examples including:

1. Parallel code analysis (4 agents analyzing different aspects)
2. Sequential workflows (agents depend on previous results)
3. Resource locking (preventing conflicts)
4. Supervisor-worker pattern (one agent delegates to others)
5. Real-time monitoring and status updates
6. Conditional execution (spawn agents based on results)
7. Cleanup and resource management

**Example - Parallel Code Analysis:**

```rust
// Spawn 4 agents to analyze codebase in parallel
let goals = vec![
    Goal { description: "Analyze for bugs".to_string(), ... },
    Goal { description: "Check test coverage".to_string(), ... },
    Goal { description: "Review documentation".to_string(), ... },
    Goal { description: "Identify performance issues".to_string(), ... },
];

let agent_ids = orchestrator.spawn_parallel(goals).await?;
let results = orchestrator.wait_for_all().await;
```

**Example - Sequential Workflow:**

```rust
// Step 1: Design schema
let agent1 = orchestrator.spawn_agent(design_schema_goal).await?;
// Wait for completion...

// Step 2: Implement API (depends on schema)
let agent2 = orchestrator.spawn_agent(implement_api_goal).await?;
// Wait for completion...

// Step 3: Write tests (depends on API)
let agent3 = orchestrator.spawn_agent(write_tests_goal).await?;
```

**Best Practices:**

1. **Use resource locking** when agents might access the same files or UI elements
2. **Monitor agent status** regularly to detect failures early
3. **Cleanup completed agents** periodically to free memory
4. **Start with 4 agents** and scale to 8 only if needed
5. **Use appropriate coordination patterns** based on task dependencies
6. **Handle failures gracefully** - check agent status and retry if needed

### Background Task Management System

**Location:** `apps/desktop/src-tauri/src/tasks/`

The background task system provides async task execution with progress tracking, preventing UI blocking during long-running operations. It addresses a key competitive gap where apps like Cursor have background agents while our platform previously blocked the UI.

**Core Components:**

- `types.rs` - Task definitions (Task, Priority, TaskStatus, TaskResult, TaskContext)
- `queue.rs` - Priority-based task queue (High > Normal > Low, FIFO within priority)
- `executor.rs` - Async task execution with configurable concurrency (default: 4 concurrent tasks)
- `persistence.rs` - SQLite-backed task persistence for crash recovery
- `mod.rs` - TaskManager orchestrating queue, executor, and persistence
- `examples.rs` - Example task executors (analysis, file processing, API sync, codebase indexing)

**Task Lifecycle:**

1. **Submit** - Task created with name, description, priority, and optional payload
2. **Queue** - Added to priority queue (persisted to database)
3. **Execute** - Picked up by executor when capacity available
4. **Progress** - Task emits progress updates (0-100%)
5. **Complete/Fail/Cancel** - Final status persisted and event emitted

**Task Structure:**

```rust
pub struct Task {
    pub id: String,           // UUID
    pub name: String,
    pub description: Option<String>,
    pub priority: Priority,   // Low, Normal, High
    pub status: TaskStatus,   // Queued, Running, Paused, Completed, Failed, Cancelled
    pub progress: u8,         // 0-100
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub result: Option<TaskResult>,
    pub payload: Option<String>, // JSON payload for task data
}
```

**Tauri Commands:**

- `bg_submit_task(name, description, priority, payload)` -> String (task ID)
- `bg_cancel_task(id)` -> Result
- `bg_pause_task(id)` -> Result
- `bg_resume_task(id)` -> Result
- `bg_get_task_status(id)` -> Task
- `bg_list_tasks(filter)` -> Vec<Task>
- `bg_get_task_stats()` -> TaskStats

**Tauri Events:**

- `task:created` - Emitted when a task is created
- `task:started` - Emitted when a task starts executing
- `task:progress` - Emitted with progress updates (includes task_id and progress)
- `task:completed` - Emitted when a task completes successfully
- `task:failed` - Emitted when a task fails with error
- `task:cancelled` - Emitted when a task is cancelled

**Example Usage (Rust):**

```rust
use agiworkforce_desktop::tasks::types::{Priority, TaskContext};
use std::sync::Arc;

// Register a custom task executor
let task_manager: Arc<TaskManager> = /* get from app state */;

task_manager.register_executor(
    "codebase_analysis",
    Arc::new(|ctx: TaskContext| {
        Box::pin(async move {
            ctx.update_progress(10).await?;
            // Perform analysis...
            ctx.check_cancellation().await?;
            ctx.update_progress(50).await?;
            // More work...
            Ok("Analysis complete".to_string())
        })
    })
).await;

// Submit a task
let task_id = task_manager.submit(
    "Analyze TypeScript codebase".to_string(),
    Some("Full semantic analysis".to_string()),
    Priority::High,
    Some(serde_json::json!({
        "project_path": "/path/to/project",
        "include_tests": true
    }).to_string())
).await?;

// Task will execute in background with progress updates emitted as events
```

**Database Schema (Migration v41):**

```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    priority INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'Queued',
    progress INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    result TEXT,
    payload TEXT
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority DESC);
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);
```

**Features:**

- **Priority Queuing** - High priority tasks execute first, FIFO within same priority
- **Concurrency Control** - Configurable max concurrent tasks (default: 4)
- **Progress Tracking** - Real-time progress updates via events
- **Cancellation Support** - Tasks can be cancelled gracefully mid-execution
- **Pause/Resume** - Support for pausing and resuming long-running tasks
- **Crash Recovery** - Tasks persisted to database, auto-restored on restart
- **Event Emission** - All status changes emit Tauri events for UI updates

**Integration with AGI Executor:**

The task system is designed to work seamlessly with the AGI executor. Long-running AGI goals can be wrapped as background tasks to prevent UI blocking and provide progress visibility.

### Multi-LLM Router

**Location:** `apps/desktop/src-tauri/src/router/`

The router intelligently selects between multiple LLM providers:

- **Providers:** OpenAI, Anthropic, Google, Ollama (local)
- **Strategy:** Prioritize Ollama for cost-free local inference, fall back to cloud providers based on quality/latency thresholds
- **Cost Tracking:** All requests log tokens, cost, and provider to SQLite for analytics
- **Configuration:** Provider credentials stored via Windows Credential Manager (DPAPI), not in SQLite

**Key Modules:**

- `Provider` enum defines available providers
- `LLMProvider` trait must be implemented by all providers
- `LLMRouter` handles provider selection and fallback logic
- `RouterPreferences` and `RoutingStrategy` control routing behavior
- `sse_parser.rs` - Real SSE streaming implementation (in progress)
- `cache_manager.rs` - Response caching system
- `cost_calculator.rs` - Token cost calculation
- `token_counter.rs` - Accurate token counting per provider

**Streaming Implementation:**

SSE (Server-Sent Events) streaming is currently being implemented to replace fake streaming. The `sse_parser.rs` module provides:

- `StreamChunk` type for streaming content
- `SseStreamParser` that buffers incomplete events
- Provider-specific SSE format handling (OpenAI, Anthropic, Google, Ollama)
- Token usage tracking in streaming responses

See `LLM_ENHANCEMENT_PLAN.md` for the complete roadmap including function calling, vision support, and code completion.

### Hook System for Event-Driven Automation

**Location:** `apps/desktop/src-tauri/src/hooks/`

The hook system enables event-driven automation by executing custom scripts or commands in response to AGI system events. This provides extensibility, CI/CD integration, and workflow automation capabilities similar to Git hooks or VS Code's event system.

**Supported Event Types (14 total):**

1. **Session Events:**
   - `SessionStart` - Triggered when a new session begins
   - `SessionEnd` - Triggered when a session ends

2. **Tool Events:**
   - `PreToolUse` - Triggered before a tool is executed
   - `PostToolUse` - Triggered after successful tool execution
   - `ToolError` - Triggered when a tool execution fails

3. **Step Events:**
   - `StepStart` - Triggered when a plan step begins
   - `StepCompleted` - Triggered when a step completes successfully
   - `StepError` - Triggered when a step fails

4. **Goal Events:**
   - `GoalStart` - Triggered when a goal is initiated
   - `GoalCompleted` - Triggered when a goal completes successfully
   - `GoalError` - Triggered when a goal fails

5. **User Interaction Events:**
   - `UserPromptSubmit` - Triggered when a user submits a prompt

6. **Approval Events:**
   - `ApprovalRequired` - Triggered when user approval is requested
   - `ApprovalGranted` - Triggered when approval is granted
   - `ApprovalDenied` - Triggered when approval is denied

**Key Features:**

- **Multiple hooks per event** - Register multiple hooks for the same event type
- **Priority ordering** - Hooks execute in priority order (1-100, lower = higher priority)
- **Async execution** - Hooks run asynchronously without blocking the main workflow
- **Error handling** - Configurable `continue_on_error` to handle hook failures gracefully
- **Timeout protection** - Configurable timeout per hook (default: 30s)
- **Environment variables** - Event data passed via `HOOK_EVENT_JSON`, `HOOK_EVENT_TYPE`, `HOOK_SESSION_ID`
- **YAML configuration** - Hooks defined in `~/.agiworkforce/hooks.yaml`

**Hook Configuration Format:**

```yaml
hooks:
  - name: "Hook Name"
    events: [SessionStart, SessionEnd, GoalCompleted]
    priority: 10  # 1-100, lower = higher priority
    command: "path/to/script.sh"  # Shell command or script
    enabled: true
    timeout_secs: 30
    continue_on_error: true  # Continue if hook fails
    env:  # Optional environment variables
      CUSTOM_VAR: "value"
    working_dir: "/path/to/workdir"  # Optional working directory
```

**Tauri Commands:**

- `hooks_initialize()` - Initialize the hook registry
- `hooks_list()` - List all registered hooks
- `hooks_add(hook)` - Add a new hook
- `hooks_remove(name)` - Remove a hook by name
- `hooks_toggle(name, enabled)` - Enable/disable a hook
- `hooks_update(hook)` - Update an existing hook
- `hooks_get_config_path()` - Get the configuration file path
- `hooks_create_example()` - Create example hooks configuration
- `hooks_export()` - Export hooks as YAML
- `hooks_import(yaml)` - Import hooks from YAML
- `hooks_reload()` - Reload hooks from configuration file
- `hooks_get_event_types()` - Get list of available event types

**Integration Points:**

Hooks are automatically triggered from:
- `apps/desktop/src-tauri/src/agi/executor.rs` - Step and tool execution
- `apps/desktop/src-tauri/src/agi/core.rs` - Goal lifecycle (when implemented)
- `apps/desktop/src-tauri/src/main.rs` - Session lifecycle (when implemented)

**Example Hooks:**

See `examples/hooks/` for complete examples including:

1. **Event Logger** (`log-all-events.sh`) - Log all events to a file
2. **Tool Usage Tracker** (`track-tool-usage.js`) - Track and analyze tool usage statistics
3. **Session Report Generator** (`session-report.sh`) - Generate reports on session end
4. **Slack Notifier** (`notify-slack.js`) - Send notifications to Slack for errors
5. **Pre-commit Validator** (`pre-commit-hook.sh`) - Run linting and type-checking on session end

**Common Use Cases:**

- **Logging and analytics** - Track tool usage, execution times, and error patterns
- **CI/CD integration** - Trigger builds, run tests, deploy changes on specific events
- **Notifications** - Send alerts to Slack, email, or other services on errors or completions
- **Validation** - Run linters, type-checkers, or security scans before commits
- **Backup and recovery** - Create snapshots or checkpoints at key milestones
- **Custom workflows** - Integrate with external tools and services

**Best Practices:**

1. **Keep hooks fast** - Use appropriate timeout values to prevent hanging
2. **Handle errors gracefully** - Set `continue_on_error: true` for non-critical hooks
3. **Use priority wisely** - Order hooks logically (logging first, cleanup last)
4. **Test thoroughly** - Test hooks in isolation before deploying to production
5. **Be secure** - Validate all inputs, avoid executing untrusted code
6. **Log appropriately** - Use stderr for errors, stdout for results

### Database Schema

**Location:** `apps/desktop/src-tauri/src/db/migrations/`

SQLite schema includes:

- Conversations and messages (chat history)
- Settings (key-value store)
- Provider usage and cost analytics
- Calendar accounts and events
- File watch subscriptions
- Terminal session history

Run migrations automatically on app startup via `migrations::run_migrations()` in `main.rs`.

### Semantic Browser Automation

**Location:** `apps/desktop/src-tauri/src/browser/semantic.rs`

The semantic browser automation system provides self-healing, natural language-based element finding that survives UI changes, making browser automation more robust than traditional CSS/XPath selectors.

**Key Components:**

1. **SemanticSelector** - Multi-strategy selector with priority ordering:
   - Priority 1: `data-testid` attribute
   - Priority 2: `aria-label`
   - Priority 3: ARIA role + accessible name
   - Priority 4: Visible text content
   - Priority 5: `placeholder` attribute
   - Priority 6: CSS selector
   - Priority 7: XPath (last resort)

2. **Natural Language Parser** - Converts queries like "the login button" into semantic selectors:
   ```rust
   let selector = SemanticElementFinder::from_natural_language("the email input field");
   // Automatically generates multiple fallback strategies
   ```

3. **Self-Healing Finder** - Tries strategies in priority order with automatic fallback:
   ```rust
   // Old way (brittle)
   browser.click("#btn-login-123").await?;

   // New way (semantic, self-healing)
   browser.click_semantic("the login button").await?;
   ```

4. **Accessibility Tree Analysis** - Analyzes DOM structure using accessibility attributes for robust element finding

5. **DOM Semantic Graph** - Builds a graph of semantic relationships between elements for context-aware selection

**Available Commands:**

- `find_element_semantic(query: String)` - Find element using natural language
- `find_all_elements_semantic(query: String)` - Find all matching elements
- `click_semantic(query: String)` - Click element by semantic query
- `type_semantic(query: String, text: String)` - Type text into element
- `get_accessibility_tree()` - Get full accessibility tree
- `test_selector_strategies(query: String)` - Test all strategies for a query
- `get_dom_semantic_graph()` - Get DOM semantic relationship graph
- `get_interactive_elements()` - Get all interactive elements
- `find_by_role(role: String, name: Option<String>)` - Find by ARIA role

**Example Usage:**

```rust
// Natural language selectors
click_semantic("the submit button").await?;
type_semantic("email input field", "user@example.com").await?;

// Self-healing with multiple strategies
let selector = SemanticSelector::new("the login button")
    .with_strategy(SelectorStrategy::DataTestId("login-btn".into()))
    .with_strategy(SelectorStrategy::AriaLabel("Login".into()))
    .with_strategy(SelectorStrategy::Role("button".into(), "Login".into()))
    .with_strategy(SelectorStrategy::Text("Login".into()))
    .with_strategy(SelectorStrategy::Css("#login-button".into()));

// Will try each strategy until one succeeds
let element = find_with_healing(&selector, &page).await?;
```

**Integration with AGI Tools:**

The semantic selectors integrate with the AGI tool system for adaptive browser automation. Tools like `browser_click` and `browser_type` can use semantic selectors for more robust automation that adapts to UI changes.

**Benefits:**

- **Self-Healing**: Automatically adapts when UI changes (CSS classes, IDs)
- **Natural Language**: Describe elements in plain English
- **Accessibility-First**: Leverages ARIA attributes and roles
- **Multiple Fallbacks**: Priority-ordered strategies prevent brittle automation
- **Context-Aware**: Uses parent relationships and semantic graph

## TypeScript Configuration

The monorepo uses TypeScript 5.4+ with strict mode enabled:

- **Base Config:** `tsconfig.base.json` (root level, extends to all packages)
- **Module Resolution:** `bundler` mode (required for Tauri API compatibility)
- **Path Aliases:** Each package defines its own `tsconfig.json` with project references

**Important:** All imports of `@tauri-apps/*`, `react`, `lucide-react`, and shared packages must resolve through local package manifests. If you encounter module resolution errors, verify the package has proper `dependencies` in its `package.json`.

## Version Pinning and Reproducibility

This project enforces strict version pinning to ensure reproducible builds across all environments:

- **Node.js:** Version 20.11.0+ (enforced via `.nvmrc` and `package.json` engines field)
  - Use `nvm use` to automatically switch to the correct version
  - Supports Node v20.x and v22.x
- **pnpm:** Version 9.15.0+ (enforced via `package.json` engines and `.npmrc`)
  - The `.npmrc` file sets `engine-strict=true` to fail on version mismatches
  - Package manager is pinned to 9.15.3 via packageManager field
- **Rust:** Version 1.90.0 (enforced via `rust-toolchain.toml`)
  - rustup automatically uses the pinned version when in the project directory

### First-Time Setup

```powershell
# Install Node.js (if not using nvm)
# Download from nodejs.org and install version 20.11.0+

# OR use nvm (recommended)
nvm install 20.11.0
nvm use  # Reads from .nvmrc

# Install pnpm globally
npm install -g pnpm@9.15.3

# Install Rust (rustup will read rust-toolchain.toml)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Verify versions
node --version    # Should output v20.x.x or v22.x.x
pnpm --version    # Should output 9.15.0+
rustc --version   # Should output rustc 1.90.0

# Install dependencies
pnpm install
```

## Development Workflow

### Adding a New Feature

1. **Backend (Rust):**
   - Create or extend MCP module in `apps/desktop/src-tauri/src/`
   - Add command functions with `#[tauri::command]` attribute
   - Register commands in `main.rs`
   - Add database migrations if needed
   - Write Rust tests

2. **Frontend (TypeScript):**
   - Create Zustand store in `apps/desktop/src/stores/`
   - Create React components in `apps/desktop/src/components/`
   - Add Tauri API calls via `@tauri-apps/api`
   - Write Vitest tests

3. **Integration:**
   - Update types in `packages/types/` if shared across apps
   - Test end-to-end workflow
   - Update documentation

### Working with Ollama (Local LLM)

1. Install [Ollama for Windows](https://ollama.com/download)
2. Pull a model: `ollama pull llama3`
3. Start service: `ollama serve`
4. Configure in desktop app settings (once UI is complete)
5. Router will automatically detect and prioritize Ollama for zero-cost inference

### Security Considerations

- **Never store API keys in SQLite or plaintext** - use Windows Credential Manager via `keyring` crate
- **Permission prompts required** before automation actions (filesystem, automation, browser)
- **Sandbox enforcement** via Tauri capabilities system
- **Structured logging** for all MCP invocations and provider calls
- **Prompt injection detection** middleware should escalate risky commands

### Error Handling and Recovery

**Location:** `apps/desktop/src-tauri/src/error/`

The application implements production-grade error handling with sophisticated retry, recovery, and categorization strategies.

#### Error Type Hierarchy

```rust
// Main error types
AGIError {
    ToolError,         // Tool-specific errors
    PlanningError,     // Planning failures
    LLMError,          // LLM provider errors
    ResourceError,     // Resource limit errors
    PermissionError,   // Permission denied
    TransientError,    // Retryable errors
    FatalError,        // Non-retryable errors
    ConfigurationError,// Config issues
    TimeoutError,      // Timeout errors
}
```

#### Error Categorization

Errors are automatically categorized to determine retry and recovery strategies:

- **Transient**: Network issues, timeouts - retry immediately
- **ResourceLimit**: Rate limits, memory limits - wait and retry
- **Permanent**: Invalid input, not found - don't retry
- **Permission**: Access denied - request user intervention
- **Configuration**: Missing API keys - fix settings
- **Unknown**: Uncategorized - log and fail

All errors implement the `Categorizable` trait:

```rust
pub trait Categorizable {
    fn category(&self) -> ErrorCategory;
    fn is_retryable(&self) -> bool;
    fn suggested_action(&self) -> String;
    fn retry_delay_ms(&self) -> Option<u64>;
}
```

#### Retry Policies

Multiple pre-configured retry policies with different backoff strategies:

```rust
// Pre-configured policies
RetryPolicy::default()      // 3 attempts, exponential + jitter
RetryPolicy::aggressive()   // 5 attempts, fast exponential
RetryPolicy::network()      // 4 attempts, network-optimized
RetryPolicy::llm()          // 4 attempts, handles rate limits
RetryPolicy::browser()      // 5 attempts, UI automation
RetryPolicy::database()     // 5 attempts, DB operations
RetryPolicy::filesystem()   // 3 attempts, file operations

// Backoff strategies
BackoffStrategy::Fixed(duration)
BackoffStrategy::Linear(base)
BackoffStrategy::Exponential { base, max }
BackoffStrategy::ExponentialWithJitter { base, max }
```

**Usage:**

```rust
use crate::error::{retry_with_policy, RetryPolicy};

let policy = RetryPolicy::network();
let result = retry_with_policy(&policy, || async {
    // Your operation here
    make_api_call().await
}).await?;
```

#### Recovery Strategies

The `RecoveryManager` provides automatic recovery strategies for common error scenarios:

**Built-in Recovery Strategies:**

1. **Browser Automation**:
   - Element not found → Try semantic selectors, use vision model
   - Browser crash → Restart browser
   - Timeout → Increase timeout and retry

2. **LLM Errors**:
   - Rate limit → Switch to alternative provider or wait
   - Context length → Summarize context
   - Model unavailable → Switch to fallback model

3. **File System**:
   - File not found → Request user for correct path
   - Disk full → Request user to free space

4. **API Errors**:
   - Rate limit → Wait 60 seconds
   - Authentication → Request user to check credentials

5. **Resource Limits**:
   - Memory limit → Clear caches, reduce workload

**Usage:**

```rust
use crate::error::{RecoveryManager, RecoveryAction};

let recovery_manager = RecoveryManager::new();
let action = recovery_manager.recover(&error).await?;

match action {
    RecoveryAction::Retry => { /* retry operation */ },
    RecoveryAction::Fallback(msg) => { /* use alternative approach */ },
    RecoveryAction::Skip => { /* skip this step */ },
    RecoveryAction::Abort => { /* stop execution */ },
    RecoveryAction::RequestUserInput(msg) => { /* ask user */ },
    RecoveryAction::WaitAndRetry(ms) => { /* wait and retry */ },
}
```

#### Error Context Tracking

Every error creates a detailed context for debugging and user feedback:

```rust
use crate::error::ErrorContext;

let context = ErrorContext::new(error)
    .with_step("Execute API call".to_string())
    .with_tool("api_call".to_string())
    .with_input(params_json);

// Context includes:
// - Unique ID
// - Timestamp
// - Error category
// - User-friendly message
// - Suggested action
// - Stacktrace
// - Recovery attempts
```

#### Integration with AGI Executor

The executor automatically wraps tool execution with retry and recovery:

```rust
use crate::error::{execute_tool_with_recovery, EnhancedExecutionContext};

// Method 1: Direct integration
let recovery_manager = RecoveryManager::new();
let result = execute_tool_with_recovery(
    "api_call",
    || async { make_api_call().await },
    &recovery_manager
).await?;

// Method 2: Enhanced execution context
let ctx = EnhancedExecutionContext::new()
    .with_app_handle(app_handle);

let result = ctx.execute_step_with_recovery(
    "Call weather API",
    "api_call",
    || async { make_api_call().await }
).await?;
```

#### Tauri Commands for Error Management

Frontend can interact with error system via Tauri commands:

```rust
// Get error context
#[tauri::command]
fn get_error_context(error_id: String) -> Result<ErrorContextResponse>;

// Get all errors
#[tauri::command]
fn get_all_error_contexts() -> Result<Vec<ErrorContextResponse>>;

// Retry failed step
#[tauri::command]
fn retry_failed_step(error_id: String) -> Result<String>;

// Skip failed step
#[tauri::command]
fn skip_failed_step(error_id: String) -> Result<String>;

// Abort execution
#[tauri::command]
fn abort_execution(error_id: String) -> Result<String>;

// Get recovery suggestion
#[tauri::command]
fn get_recovery_suggestion(error_id: String) -> Result<String>;
```

#### Error Events

Errors emit events to the frontend for real-time monitoring:

```typescript
// Listen for error events
import { listen } from '@tauri-apps/api/event';

await listen('agi:error', (event) => {
  const {
    error_id,
    error_type,
    message,
    category,
    is_retryable,
    user_message,
    suggested_action,
    step,
    tool,
    recovery_attempts,
    timestamp
  } = event.payload;

  // Update UI with error information
});
```

#### Best Practices

1. **Always use retry policies** for operations that might fail transiently
2. **Select appropriate policy** based on operation type (network, LLM, browser, etc.)
3. **Create error contexts** for debugging and user feedback
4. **Emit error events** to keep frontend informed
5. **Use recovery manager** for sophisticated error handling
6. **Convert errors early** using `convert_tool_error()` for consistent error types
7. **Log errors** with tracing for debugging

## Testing

### TypeScript Tests (Vitest)

```powershell
# Run all tests
pnpm test

# Run desktop tests with UI
pnpm --filter @agiworkforce/desktop test:ui

# Run with coverage
pnpm --filter @agiworkforce/desktop test:coverage
```

Tests located in `apps/desktop/src/__tests__/` and co-located `*.test.ts` files.

### Rust Tests

```powershell
cd apps/desktop/src-tauri
cargo test
```

Dev dependencies include `mockall`, `tempfile`, `serial_test`, and `proptest` for comprehensive testing.

### E2E Tests (Playwright)

```powershell
pnpm --filter @agiworkforce/desktop test:e2e
```

Playwright config in `apps/desktop/playwright.config.ts`.

## Common Issues and Solutions

### TypeScript Errors After Adding Dependencies

**Status:** Significantly improved. TypeScript error count reduced from ~1,200 to under 100 through critical fixes in Phases 1-3.

**Key Fixes Applied:**

- Added missing `tsconfig.json` files to `packages/types` and `packages/utils`
- Relaxed `exactOptionalPropertyTypes` to `false` in `tsconfig.base.json` for better Tauri API compatibility
- Fixed Rust undefined behavior in screen capture module (RGBQUAD zero-initialization)
- Installed missing API gateway dependencies

**If you still encounter TypeScript errors:**

- Run `pnpm install` at root
- Verify `tsconfig.json` project references are correct
- Check that dependencies are listed in the package's `package.json`, not just root
- Ensure you're using the correct Node.js version: `node --version` (should be v20.x or v22.x)
- Verify pnpm version matches: `pnpm --version` (should be 9.15.0+)

### Tauri Build Failures

- Ensure Rust toolchain is up to date: `rustup update`
- Verify WebView2 runtime is installed (Windows)
- Check Tauri prerequisites: https://tauri.app/v1/guides/getting-started/prerequisites

### Windows Linker Error LNK1318 (PDB Limit Exceeded)

If you encounter `LINK : fatal error LNK1318: Unexpected PDB error; LIMIT (12)`:

**Root Cause:** With 1,040+ crates, debug info generation exceeds Windows linker PDB (Program Database) file limits.

**Solution:** Add a `[profile.dev]` section to the **workspace root** `Cargo.toml` (not the package `Cargo.toml`):

```toml
# In the root Cargo.toml (C:\Users\...\agiworkforce\Cargo.toml)
[profile.dev]
debug = 0  # Disable debug info to prevent LNK1318
incremental = false  # Disable incremental compilation
opt-level = 0  # Keep fast compile times
```

Then clean and rebuild:

```powershell
cd apps/desktop/src-tauri
cargo clean
cd ../..
pnpm --filter @agiworkforce/desktop dev
```

**Why this works:** Cargo workspaces require profile settings at the workspace root, not in member packages. Setting `debug = 0` at the profile level forces Rust to compile without any debug information, completely avoiding PDB file generation. Environment variables like `RUSTFLAGS=-Cdebuginfo=0` are ineffective because they can be overridden by Cargo's default dev profile settings.

### Module Resolution Errors

- The repo uses `moduleResolution: "bundler"`
- All imports must resolve through package manifests
- Use workspace protocol in `package.json`: `"@agiworkforce/types": "workspace:*"`

### Database Migration Errors

- Migrations run automatically on startup
- If schema is corrupted, delete `agiworkforce.db` in app data directory
- Check migration files in `apps/desktop/src-tauri/src/db/migrations/`

## Git Workflow

This repo uses conventional commits with commitlint and husky hooks:

- Format: `type(scope): description`
- Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`
- Pre-commit: runs `lint-staged` (ESLint + Prettier)
- Pre-push: runs type-check

## Performance Considerations

### Bundle Size

- Desktop app uses Vite with tree-shaking
- Monaco Editor and xterm.js are large dependencies - ensure code-splitting
- Use dynamic imports for heavy components

### Rust Performance

- Use `rayon` for CPU-bound parallel operations
- Use `dashmap` and `parking_lot` for concurrent data structures
- Profile with `cargo bench` (benchmarks in `benches/`)

### Database

- SQLite connection pooled via `tokio-rusqlite`
- Indexes exist on frequently queried columns
- Use prepared statements to prevent SQL injection

## Debugging

### Rust Backend

```powershell
# Enable Tauri devtools
$env:TAURI_CONFIG="{'build': {'devPath': 'http://localhost:5173', 'devtools': true}}"
pnpm --filter @agiworkforce/desktop dev
```

Rust logs appear in terminal. Configure log level via `RUST_LOG` env var:

```powershell
$env:RUST_LOG="debug"
```

### Frontend

- React DevTools and Redux DevTools extensions supported
- Zustand stores debuggable via browser console
- Vite HMR for rapid iteration

## Documentation

Key documentation files in the repository:

- `README.md` - Setup and getting started guide
- `STATUS.md` - Current implementation status and recent improvements
- `CLAUDE.md` (this file) - Development guide for AI assistants
- `PROJECT_OVERVIEW.md` - Consolidated project status and architecture
- `LLM_ENHANCEMENT_PLAN.md` - Roadmap for LLM feature parity with Cursor (streaming, function calling, vision)
- `CHANGELOG.md` - Version history (Phases 1-8 documented)
- `docs/` - Additional technical documentation

**Note:** Many redundant status/implementation files have been consolidated into `STATUS.md`. Always update `STATUS.md` when making significant changes to the codebase.

Update documentation in the same PR that changes functionality.
