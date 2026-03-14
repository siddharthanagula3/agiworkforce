# Sub-Feature: Workflows & Orchestration

> A DAG-based workflow engine that lets users define, execute, schedule, and share multi-step automated processes composed of agent tasks, scripts, decisions, loops, parallel branches, and tool invocations.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Workflow Engine (Rust) | `apps/desktop/src-tauri/src/core/orchestration/workflow_engine.rs` |
| Workflow Executor (Rust) | `apps/desktop/src-tauri/src/core/orchestration/workflow_executor.rs` |
| Workflow Scheduler (Rust) | `apps/desktop/src-tauri/src/core/orchestration/workflow_scheduler.rs` |
| Orchestration mod | `apps/desktop/src-tauri/src/core/orchestration/mod.rs` |
| IPC Commands | `apps/desktop/src-tauri/src/sys/commands/orchestration.rs` |
| Operations Commands | `apps/desktop/src-tauri/src/sys/commands/operations.rs` |
| Marketplace (Rust) | `apps/desktop/src-tauri/src/features/workflows/marketplace.rs` |
| Publishing (Rust) | `apps/desktop/src-tauri/src/features/workflows/publishing.rs` |
| Social (Rust) | `apps/desktop/src-tauri/src/features/workflows/social.rs` |
| Templates (Rust) | `apps/desktop/src-tauri/src/features/workflows/templates_marketplace.rs` |
| DB Migrations | `apps/desktop/src-tauri/src/data/db/migrations.rs` (v19-v21, v39) |
| API Layer (TS) | `apps/desktop/src/api/workflow.ts` |
| Types (TS) | `apps/desktop/src/types/workflow.ts` |
| Hook | `apps/desktop/src/hooks/useWorkflows.ts` |
| Panel Component | `apps/desktop/src/components/Workflows/WorkflowPanel.tsx` |
| Barrel Export | `apps/desktop/src/components/Workflows/index.ts` |
| Marketplace UI | `apps/desktop/src/components/Marketplace/components/WorkflowMarketplace.tsx` |
| Marketplace UI (cards) | `apps/desktop/src/components/Marketplace/components/WorkflowCard.tsx` |
| Marketplace UI (detail) | `apps/desktop/src/components/Marketplace/components/WorkflowDetailModal.tsx` |
| Marketplace UI (publish) | `apps/desktop/src/components/Marketplace/components/PublishWorkflowTab.tsx` |
| Marketplace UI (search) | `apps/desktop/src/components/Marketplace/components/WorkflowSearch.tsx` |
| Marketplace UI (my workflows) | `apps/desktop/src/components/Marketplace/components/MyWorkflowsTab.tsx` |
| Marketplace UI (favorites) | `apps/desktop/src/components/Marketplace/components/MyFavoritesTab.tsx` |
| Marketplace UI (clones) | `apps/desktop/src/components/Marketplace/components/MyClonesTab.tsx` |
| Marketplace UI (share) | `apps/desktop/src/components/Marketplace/components/ShareModal.tsx` |
| Marketplace UI (clone success) | `apps/desktop/src/components/Marketplace/components/CloneSuccessModal.tsx` |
| Marketplace UI (hero) | `apps/desktop/src/components/Marketplace/components/MarketplaceHero.tsx` |
| Marketplace UI (discover) | `apps/desktop/src/components/Marketplace/components/DiscoverTab.tsx` |
| Governance Integration | `apps/desktop/src/stores/governanceStore.ts` (`logWorkflowExecution`) |
| Scheduler Integration | `apps/desktop/src/stores/schedulerStore.ts` (`workflow` action type) |
| Managed State (lib.rs) | `WorkflowEngineState` managed at app startup |

## Architecture Overview

The Workflows & Orchestration system is **separate from the Swarm system** (`core/swarm/`). They serve different purposes:

- **Workflows** (`core/orchestration/`): User-defined, persistent, DAG-based process automation. Users build multi-step workflows through the UI, persist them to SQLite, and execute/schedule them. Workflows are visible in the WorkflowPanel and can be published to the marketplace.
- **Swarm** (`core/swarm/`): Runtime parallel agent orchestration for decomposing a single complex goal into parallelizable subtasks. Used internally by the agentic system, not user-defined.

The workflow engine uses a **graph model** (nodes + edges) where nodes represent steps and edges define execution flow. This maps naturally to a visual node-graph builder (React Flow-compatible types are defined in `types/workflow.ts`).

### Data Flow

```
User (WorkflowPanel) --> invoke() --> orchestration.rs IPC commands
                                        |
                                  WorkflowEngineState
                                   /       |        \
                            Engine    Executor    Scheduler
                              |          |            |
                           SQLite    tokio::spawn   cron
                                        |
                                   execute_node() (recursive)
                                   /  |  |  |  |  \  \
                              Agent Decision Loop Parallel Wait Script Tool
```

### State Registration

In `lib.rs`, `WorkflowEngineState` is constructed with the database path and registered via `app.manage()`:

```rust
let workflow_engine_state = WorkflowEngineState::new(db_path.to_string_lossy().to_string());
app.manage(workflow_engine_state);
```

This provides all IPC commands access to the shared `Arc<WorkflowEngine>`, `Arc<WorkflowExecutor>`, and `Arc<WorkflowScheduler>`.

## Workflow Engine

**File**: `core/orchestration/workflow_engine.rs` (785 lines)

The engine is the persistence and data layer. It owns a SQLite database path and creates fresh connections per operation (no connection pooling).

### Core Data Model

#### WorkflowDefinition

The top-level workflow object stored in `workflow_definitions`:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` | UUID, auto-generated if empty |
| `user_id` | `String` | Owner user ID |
| `name` | `String` | Human-readable name |
| `description` | `Option<String>` | Optional description |
| `nodes` | `Vec<WorkflowNode>` | Steps in the workflow (JSON-serialized in DB) |
| `edges` | `Vec<WorkflowEdge>` | Connections between nodes (JSON-serialized in DB) |
| `triggers` | `Vec<WorkflowTrigger>` | How the workflow is initiated |
| `metadata` | `HashMap<String, Value>` | Arbitrary key-value metadata |
| `created_at` | `i64` | Unix timestamp |
| `updated_at` | `i64` | Unix timestamp |

#### WorkflowNode (7 variants)

Nodes are tagged enums (`#[serde(tag = "type")]`), each with an `id`, `position` (x/y for visual layout), and type-specific `data`:

| Node Type | Data Struct | Purpose |
|-----------|-------------|---------|
| `agent` | `AgentNodeData` | Spawns an AGI agent via `ORCHESTRATOR`. Has `input_mapping` / `output_mapping` for variable wiring, `agent_template_id`, and `config`. |
| `decision` | `DecisionNodeData` | Conditional branching. Evaluates `condition` (expression, output_contains, output_equals, custom) and stores result as `decision_{label}` variable. Routing done via edge conditions. |
| `loop` | `LoopNodeData` | Iteration: count-based, condition-based (with 1000-iteration safety limit), or for-each over a collection variable. |
| `parallel` | `ParallelNodeData` | Fork/join. Lists `branches` (node IDs), clones context per branch, executes concurrently via `tokio::spawn`, merges variables back. Configurable `wait_for_all` and `timeout_seconds` (default 300s). |
| `wait` | `WaitNodeData` | Delays execution: fixed duration, until a timestamp, or until a condition is met (polls every 1s, max 3600s). Uses interruptible sleep that checks for cancellation/pause every second. |
| `script` | `ScriptNodeData` | Runs JavaScript (deno/node), Python (python3/python), or Bash as a subprocess. Passes workflow variables as `WF_*` environment variables. Output captured as `script_output` variable. Max 1MB output. Configurable timeout (default 30s); timed-out children are killed before the node returns an error. |
| `tool` | `ToolNodeData` | Invokes a named tool with input parameters. Currently a **stub** -- sleeps 100ms and sets `{tool_name}_output` variable with placeholder string `"Tool {name} executed"`. Does not actually invoke MCP tools or system tools. |

#### WorkflowEdge

Directed connections between nodes:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` | Edge identifier |
| `source` | `String` | Source node ID |
| `target` | `String` | Target node ID |
| `source_handle` | `Option<String>` | Port on source (for visual builder) |
| `target_handle` | `Option<String>` | Port on target |
| `condition` | `Option<String>` | Optional condition that must evaluate true for this edge to be followed |
| `label` | `Option<String>` | Display label |

#### WorkflowTrigger (4 variants)

| Trigger | Fields | Description |
|---------|--------|-------------|
| `manual` | (none) | User-initiated execution |
| `scheduled` | `cron`, `timezone` | Cron-based recurring execution |
| `event` | `event_type`, `filter` | Triggered by system events |
| `webhook` | `url`, `method`, `auth_token` | External HTTP trigger |

#### WorkflowStatus

7-state lifecycle: `Pending` -> `Running` -> `Completed` | `Failed` | `Cancelled` | `Paused` | `WaitingApproval`

#### WorkflowExecution

Runtime execution record stored in `workflow_executions`:

| Field | Type |
|-------|------|
| `id` | `String` (UUID) |
| `workflow_id` | `String` (FK) |
| `status` | `WorkflowStatus` |
| `current_node_id` | `Option<String>` |
| `inputs` | `HashMap<String, Value>` |
| `outputs` | `HashMap<String, Value>` |
| `error` | `Option<String>` |
| `started_at` | `Option<i64>` |
| `completed_at` | `Option<i64>` |

#### WorkflowExecutionLog

Per-node event log stored in `workflow_execution_logs`:

| Field | Type |
|-------|------|
| `id` | `String` (UUID) |
| `execution_id` | `String` (FK) |
| `node_id` | `String` |
| `event_type` | `LogEventType` (Started, Completed, Failed, Skipped) |
| `data` | `Option<Value>` |
| `timestamp` | `i64` |

### Engine Operations

- `create_workflow(definition)` -- INSERT with auto-generated UUID and timestamps
- `update_workflow(id, definition)` -- UPDATE by ID, bumps `updated_at`
- `delete_workflow(id)` -- DELETE by ID (cascades to executions via FK)
- `get_workflow(id)` -- SELECT with JSON deserialization of nodes/edges/triggers/metadata
- `get_user_workflows(user_id)` -- SELECT all for user, ordered by `updated_at DESC`
- `create_execution(workflow_id, inputs)` -- Creates execution record with `Pending` status
- `update_execution_status(execution_id, status, current_node_id, error)` -- Updates status, auto-sets `completed_at` on terminal states
- `get_execution_status(execution_id)` -- Returns current execution state
- `add_execution_log(execution_id, node_id, event_type, data)` -- Appends log entry
- `get_execution_logs(execution_id)` -- Returns all logs ordered by timestamp ASC
- `cleanup_old_executions(max_age_seconds)` -- Deletes terminal executions older than threshold
- `get_stuck_executions(threshold_seconds)` -- Finds non-terminal executions older than threshold

## Workflow Executor

**File**: `core/orchestration/workflow_executor.rs` (1090 lines)

The executor is the runtime that traverses the workflow graph and executes nodes.

### ExecutionContext

Mutable state carried through the execution:

| Field | Type | Purpose |
|-------|------|---------|
| `execution_id` | `String` | Current execution ID |
| `workflow_id` | `String` | Workflow being executed |
| `variables` | `HashMap<String, Value>` | Shared variable store (inputs + outputs from nodes) |
| `current_node_id` | `Option<String>` | Currently executing node |
| `execution_path` | `Vec<String>` | Ordered list of visited node IDs |
| `loop_counters` | `HashMap<String, i32>` | Per-loop iteration counters |

### Execution Flow

1. **`execute_workflow(workflow_id, inputs)`** -- Creates an execution record, fetches the workflow definition, and spawns a `tokio` task to run it asynchronously. Returns the execution ID immediately.

2. **`run_workflow(workflow, context)`** -- Sets status to `Running`, finds the start node (the node with no incoming edges), and begins recursive execution. On completion, sets status to `Completed` or `Failed`.

3. **`find_start_node(workflow)`** -- Identifies the entry point by counting incoming edges per node. The first node with zero incoming edges is the start node.

4. **`execute_node(workflow, node, context)`** -- Recursive, pinned async function. For each node:
   - Sets `current_node_id` on context
   - Appends node ID to `execution_path`
   - Logs `Started` event
   - Updates execution status with current node
   - Dispatches to type-specific handler
   - On success: logs `Completed`, calls `execute_next_nodes`
   - On failure: logs `Failed` with error data, propagates error

5. **`execute_next_nodes(workflow, current_node, context)`** -- Finds all outgoing edges from the current node. For each edge, evaluates optional conditions. If the condition passes (or is absent), executes the target node. This enables conditional branching.

### Node Execution Details

**Agent Node**: Uses the global `ORCHESTRATOR` to spawn an AGI agent with a `Goal` constructed from the node's label and input mappings. Polls agent status every 100ms for up to 60 seconds. On completion, maps the agent's result to output variables.

**Decision Node**: Evaluates the condition string against context variables. Stores the boolean result as `decision_{label}` in context. The actual branching happens via edge conditions in `execute_next_nodes`.

**Loop Node**: Three modes:
- *Count*: Iterates N times, setting the item variable to the index
- *Condition*: Loops while condition is true, with a hard 1000-iteration safety limit
- *ForEach*: Iterates over a JSON array variable

**Parallel Node**: Creates independent execution contexts (cloned), spawns each branch in its own `tokio::spawn`, wraps each in a `tokio::time::timeout`. After all branches complete, merges variables back into the parent context. If `wait_for_all` is true, collects all errors; otherwise fails fast on first error.

**Wait Node**: Three modes:
- *Duration*: Sleeps for N seconds using interruptible sleep (checks cancel/pause every 1s)
- *UntilTime*: Sleeps until a target Unix timestamp (skips if already past)
- *Condition*: Polls condition every 1s for up to 3600s

**Script Node**: Spawns a subprocess with the appropriate runtime:
- JavaScript: prefers `deno` (with `--allow-env`), falls back to `node`
- Python: prefers `python3`, falls back to `python`
- Bash: uses `bash -c` (or `cmd /C` on Windows)

Workflow variables are passed as `WF_*` environment variables. Output is truncated at 1MB. Result stored as `script_output` variable.

**Tool Node**: **Currently a stub.** Sets `{tool_name}_output` with a placeholder string. Does not actually invoke MCP tools or system tools.

### Lifecycle Controls

- **`pause_execution(execution_id)`** -- Sets status to `Paused`. Only from `Running` or `WaitingApproval`. The interruptible sleep in wait nodes and the execution loop check for this status.
- **`resume_execution(execution_id)`** -- Sets status to `Running`. Reconstructs context from stored inputs/outputs and resumes from `current_node_id`. If no current node, restarts from the beginning.
- **`cancel_execution(execution_id)`** -- Sets status to `Cancelled` with "Cancelled by user" error. Only from non-terminal states.
- **`approve_execution(execution_id)`** -- Resumes from `WaitingApproval` state (delegates to `resume_execution`).
- **`reject_execution(execution_id, reason)`** -- Fails from `WaitingApproval` state with rejection reason.
- **`pause_for_approval(execution_id, reason)`** -- Sets status to `WaitingApproval`. The caller is responsible for presenting the approval UI.
- **`execute_workflow_with_timeout(workflow_id, inputs, timeout_seconds)`** -- Same as `execute_workflow` but wraps the entire run in a `tokio::time::timeout`.

### Condition Evaluation

The condition evaluator is minimal: if the condition starts with `$`, it looks up the variable name and returns its boolean value. Otherwise, it returns `true`. This means edge conditions and decision nodes only support simple variable-based branching today.

## Workflow Scheduler

**File**: `core/orchestration/workflow_scheduler.rs` (211 lines)

The scheduler handles recurring and event-based workflow triggering.

### Cron Scheduling

- Uses the `cron` crate for expression parsing and next-execution-time calculation
- `schedule_workflow(workflow_id, cron_expr, timezone)` -- Validates the cron expression, registers the schedule in the live runtime scheduler, and exposes it through `list_scheduled_workflows()`. The current implementation is runtime-scoped and does not yet restore schedules automatically after an app restart.
- `get_next_execution_time(cron_expr)` -- Computes the next upcoming execution timestamp from a cron expression. This is fully functional.
- The scheduler loop runs in a background `tokio::spawn`, checking every 60 seconds.

### Event-Based Triggers

Trigger registration methods exist but are **stubs** that only log the registration:

- `trigger_on_event(workflow_id, event_type, event_data)` -- Immediately executes the workflow with event data as inputs
- `trigger_via_webhook(workflow_id, auth_token, payload)` -- Validates the configured webhook auth token and then executes the workflow with payload as inputs
- `register_file_watcher_trigger(workflow_id, path, event_types)` -- Logs registration only
- `register_email_trigger(workflow_id, account_id, filter)` -- Logs registration only
- `register_database_trigger(workflow_id, database_id, table, operation)` -- Logs registration only
- `register_api_trigger(workflow_id, endpoint, method)` -- Logs registration only

### ScheduledWorkflow

Data structure for listing scheduled workflows:

| Field | Type |
|-------|------|
| `workflow_id` | `String` |
| `workflow_name` | `String` |
| `trigger_type` | `String` |
| `cron_expression` | `Option<String>` |
| `next_execution` | `Option<i64>` |
| `last_execution` | `Option<i64>` |
| `enabled` | `bool` |

## Workflow Builder

There is **no dedicated visual workflow builder component** yet. The `WorkflowPanel` creates workflows with name/description but starts them with empty node/edge arrays and a `manual` trigger. The type system includes `ReactFlowNode`, `ReactFlowEdge`, and `NodeLibraryItem` types in `types/workflow.ts`, indicating a React Flow-based visual builder is planned.

The `NodeLibraryItem` type defines three categories: `control`, `action`, and `integration` -- which would populate a node palette in a visual builder.

## Rust Commands (IPC)

### Core Workflow Commands (`sys/commands/orchestration.rs`)

Registered in `lib.rs` at lines 1697-1740.

| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `create_workflow` | `definition: WorkflowDefinition` | `String` (ID) | Create a new workflow |
| `update_workflow` | `id: String, definition: WorkflowDefinition` | `()` | Update workflow definition |
| `delete_workflow` | `id: String` | `()` | Delete a workflow |
| `get_workflow` | `id: String` | `WorkflowDefinition` | Get workflow by ID |
| `get_user_workflows` | `userId: String` | `Vec<WorkflowDefinition>` | List user's workflows |
| `execute_workflow` | `workflowId: String, inputs: HashMap` | `String` (execution ID) | Start workflow execution |
| `pause_workflow` | `executionId: String` | `()` | Pause running execution |
| `resume_workflow` | `executionId: String` | `()` | Resume paused execution |
| `cancel_workflow` | `executionId: String` | `()` | Cancel execution |
| `get_workflow_status` | `executionId: String` | `WorkflowExecution` | Get execution status |
| `get_execution_logs` | `executionId: String` | `Vec<WorkflowExecutionLog>` | Get execution logs |
| `schedule_workflow` | `workflowId, cronExpr, timezone?` | `()` | Schedule recurring execution |
| `trigger_workflow_on_event` | `workflowId, eventType, eventData` | `String` (execution ID) | Trigger on event |
| `get_next_execution_time` | `cronExpr: String` | `i64` | Calculate next cron execution |

### Marketplace Commands (registered in `lib.rs`)

| Command | Description |
|---------|-------------|
| `publish_workflow` | Publish a workflow to the marketplace |
| `unpublish_workflow` | Remove from marketplace |
| `get_featured_workflows` | Get featured/high-rated workflows |
| `get_trending_workflows` | Get trending workflows (last 7 days) |
| `search_marketplace_workflows` | Full-text search with filters |
| `get_published_workflows` | List published workflows |
| `get_workflow_by_id` | Get published workflow by ID |
| `get_my_published_workflows` | Get user's published workflows |
| `clone_marketplace_workflow` | Clone a published workflow to user's library |
| `rate_workflow` | Rate a published workflow (1-5 stars) |
| `get_workflow_reviews` | Get reviews for a workflow |
| `get_user_workflow_rating` | Get user's rating for a workflow |
| `comment_on_workflow` | Add a comment |
| `get_workflow_comments` | Get comments |
| `delete_workflow_comment` | Delete own comment |
| `favorite_workflow` | Add to favorites |
| `unfavorite_workflow` | Remove from favorites |
| `is_workflow_favorited` | Check if favorited |
| `share_workflow` | Generate share URL/embed code |
| `get_workflow_stats` | Get view/clone/rating stats |
| `get_workflow_analytics` | Get analytics data |
| `get_workflow_share_url` | Get share URL |
| `get_workflow_embed_code` | Get embed code |
| `increment_workflow_view_count` | Track views |
| `get_workflow_templates` | Get pre-built templates |

### Operations Commands (`sys/commands/operations.rs`)

| Command | Description |
|---------|-------------|
| `approve_operation` | Approve a pending operation (uses `ApprovalWorkflow` from security module) |
| `reject_operation` | Reject a pending operation with optional reason |

These emit Tauri events: `agi:approval_granted` / `agi:approval_denied` and `approval:granted` / `approval:denied`.

### Governance Integration

The `governanceStore.ts` has a `logWorkflowExecution(userId, teamId, workflowId, status, metadata?)` method that invokes `log_workflow_execution` to record workflow executions in the governance audit trail.

## Database Schema

### Core Tables (migration v19-v21)

**`workflow_definitions`** (v19):
```sql
id TEXT PRIMARY KEY,
user_id TEXT NOT NULL,
name TEXT NOT NULL,
description TEXT,
nodes TEXT NOT NULL,          -- JSON array of WorkflowNode
edges TEXT NOT NULL,          -- JSON array of WorkflowEdge
triggers TEXT,                -- JSON array of WorkflowTrigger
metadata TEXT,                -- JSON object
created_at INTEGER,
updated_at INTEGER
-- Indexes: user_id, created_at DESC, updated_at DESC
```

**`workflow_executions`** (v20):
```sql
id TEXT PRIMARY KEY,
workflow_id TEXT NOT NULL,     -- FK -> workflow_definitions(id) CASCADE
status TEXT NOT NULL,
current_node_id TEXT,
inputs TEXT,                   -- JSON object
outputs TEXT,                  -- JSON object
error TEXT,
started_at INTEGER,
completed_at INTEGER
-- Indexes: workflow_id, status, started_at DESC
```

**`workflow_execution_logs`** (v21):
```sql
id TEXT PRIMARY KEY,
execution_id TEXT NOT NULL,    -- FK -> workflow_executions(id) CASCADE
node_id TEXT NOT NULL,
event_type TEXT NOT NULL,
data TEXT,                     -- JSON, nullable
timestamp INTEGER
-- Indexes: (execution_id, timestamp), node_id
```

### Marketplace Tables (migration v39)

**`published_workflows`**:
```sql
id TEXT PRIMARY KEY,
title TEXT NOT NULL,
description TEXT NOT NULL,
category TEXT NOT NULL,
creator_id TEXT NOT NULL,
creator_name TEXT NOT NULL,
workflow_definition TEXT NOT NULL,  -- Full JSON definition
thumbnail_url TEXT,
share_url TEXT NOT NULL UNIQUE,
clone_count INTEGER DEFAULT 0,
view_count INTEGER DEFAULT 0,
favorite_count INTEGER DEFAULT 0,
avg_rating REAL DEFAULT 0.0,
rating_count INTEGER DEFAULT 0,
tags TEXT NOT NULL,                 -- JSON array
estimated_time_saved INTEGER DEFAULT 0,
estimated_cost_saved REAL DEFAULT 0.0,
is_verified INTEGER CHECK(0,1),
is_featured INTEGER CHECK(0,1),
created_at INTEGER NOT NULL,
updated_at INTEGER NOT NULL
-- Indexes: category, creator_id
```

**`workflow_clones`**: Tracks who cloned what (workflow_id FK, cloner_id, cloner_name, cloned_at)

**`workflow_ratings`**: Per-user ratings (composite PK: workflow_id + user_id, rating 1-5, comment, created_at)

**`workflow_favorites`**: Per-user favorites (composite PK: workflow_id + user_id, favorited_at)

**`workflow_comments`**: Discussion threads (id PK, workflow_id FK, user_id, user_name, comment, created_at)

## Store Schema

There is **no dedicated Zustand workflow store**. The `useWorkflows` hook manages all workflow state locally via `useState`:

```typescript
// From useWorkflows.ts
const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
const [activeExecutions, setActiveExecutions] = useState<Map<string, WorkflowExecutionState>>(new Map());
const [isLoading, setIsLoading] = useState(false);
const [isExecuting, setIsExecuting] = useState(false);
const [error, setError] = useState<string | null>(null);
```

The hook listens on three Tauri events for real-time execution tracking:
- `workflow:status_changed` -- Updates execution status and current node
- `workflow:log` -- Appends execution log entries
- `workflow:error` -- Sets error state and shows toast

### Related Store References

- **`schedulerStore.ts`**: Defines `workflow` as a valid `SchedulerActionType`, meaning the scheduler can trigger workflows as scheduled jobs
- **`governanceStore.ts`**: Has `logWorkflowExecution()` for audit logging
- **`featureFlagStore.ts`**: May gate workflow features behind flags
- **`billingStore.ts`**: Workflow limits may be tied to subscription tier

## Component Tree

```
WorkflowPanel (main panel)
  |-- Header (title, count badge, refresh button, "New" button)
  |-- Error Banner (dismissible, shown on error)
  |-- EmptyState (shown when no workflows; CTA to create)
  |-- ScrollArea > WorkflowItem[] (sorted: active first, then by updated_at)
  |     |-- Expand/collapse toggle
  |     |-- Status icon (animated spinner when running)
  |     |-- Workflow info (name, step count, trigger label, duration)
  |     |-- Action buttons (play/pause/resume/cancel, context menu)
  |     |-- Expanded details card
  |           |-- Description, timestamps, trigger/node counts
  |           |-- Recent Activity (last 5 execution logs)
  |           |-- Error display (red banner with error text)
  |-- Create Workflow Dialog (name + description input)
  |-- Delete Confirmation AlertDialog

Marketplace (separate page/section)
  WorkflowMarketplace
    |-- Search bar
    |-- Featured Workflows grid (WorkflowCard[])
    |-- Trending This Week grid (WorkflowCard[])
    |-- Browse by Category (category buttons with counts)
    |-- Pre-built Templates grid (TemplateCard[])
  WorkflowCard
    |-- Thumbnail, title, featured badge
    |-- Description, creator info
    |-- Stats (clones, rating, time saved)
    |-- Tags
    |-- Clone & Share buttons
  MarketplaceHero
  DiscoverTab
  PublishWorkflowTab
  MyWorkflowsTab
  MyClonesTab
  MyFavoritesTab
  ShareModal
  CloneSuccessModal
  WorkflowDetailModal
  WorkflowSearch
```

### Status Visualization

The `STATUS_CONFIG` object maps each workflow status to an icon, color, and label:

| Status | Icon | Color | Label |
|--------|------|-------|-------|
| `pending` | Clock | `text-muted-foreground` | Pending |
| `running` | Loader2 (spinning) | `text-blue-500` | Running |
| `paused` | Pause | `text-yellow-500` | Paused |
| `completed` | CheckCircle | `text-green-500` | Completed |
| `failed` | XCircle | `text-red-500` | Failed |
| `cancelled` | Square | `text-muted-foreground` | Cancelled |

## API Layer

**File**: `apps/desktop/src/api/workflow.ts` (212 lines)

Thin wrapper over `invoke()` calls. Every function has a mock fallback for web-mode development (`!isTauri` guard). All parameter names use **camelCase** per Tauri IPC convention.

Functions: `createWorkflow`, `updateWorkflow`, `deleteWorkflow`, `getWorkflow`, `getUserWorkflows`, `executeWorkflow`, `pauseWorkflow`, `resumeWorkflow`, `cancelWorkflow`, `getWorkflowStatus`, `getExecutionLogs`, `scheduleWorkflow`, `getNextExecutionTime`, `triggerWorkflowOnEvent`.

## Key Patterns

### Asynchronous Execution

Workflow execution is fully async. `execute_workflow` creates the execution record and returns the execution ID immediately, then spawns a `tokio` task to run the workflow. The frontend tracks progress via the returned ID and Tauri event listeners.

### Recursive Node Traversal

`execute_node` is a recursive `Pin<Box<dyn Future>>` that traverses the DAG. After executing a node, it calls `execute_next_nodes` which follows all outgoing edges (evaluating conditions) and recursively executes target nodes. This handles linear chains, branches, and merges.

### Variable Passing

All nodes share an `ExecutionContext` with a `variables: HashMap<String, Value>` map. Each node reads inputs from and writes outputs to this shared map. Variable wiring between nodes is done via:
- Agent nodes: `input_mapping` / `output_mapping` dictionaries
- Script nodes: environment variables (`WF_*` prefix) for input, `script_output` for output
- Decision nodes: `decision_{label}` boolean result
- Tool nodes: `{tool_name}_output` placeholder

### Interruptible Sleep

Wait nodes use an interruptible sleep pattern that breaks the wait into 1-second chunks, checking the execution status each second. If cancelled, it returns an error. If paused, it extends the remaining duration (freezing the timer).

### Parallel Branch Isolation

Parallel nodes clone the execution context for each branch, ensuring branches cannot interfere with each other's variables during execution. After all branches complete, their variables are merged back into the parent context via `HashMap::extend` (last-write-wins for overlapping keys).

### Marketplace Social Features

The marketplace module (`features/workflows/`) provides a full social layer:
- **Publishing**: Convert a local workflow definition into a published marketplace entry with category, tags, ROI estimates
- **Discovery**: Featured, trending, category-based browsing, full-text search with sort options
- **Social**: Ratings (1-5 stars), comments, favorites, clone tracking, view counting
- **Sharing**: Generate share URLs, embed codes, social media sharing (Twitter, LinkedIn, direct link)
- **Templates**: Pre-built workflow templates across 10 categories with difficulty levels, setup instructions, success stories, and ROI estimates

### Template Categories

10 categories defined in `WorkflowCategory`:
CustomerSupport, SalesMarketing, Development, Operations, PersonalProductivity, Finance, HR, DataAnalysis, ContentCreation, Custom

## Known Issues / Tech Debt

### Critical

1. **Tool node is a stub** -- `execute_tool_node` does not actually invoke any tools. It sleeps 100ms and sets a placeholder variable. Needs integration with MCP tool system or ToolGuard.

2. **Condition evaluator is trivial** -- Only supports `$variable_name` for boolean lookup. No expression parsing, no comparison operators, no `output_contains`/`output_equals` despite the `ConditionType` enum defining them. Decision nodes and edge conditions are effectively limited to boolean variable checks.

3. **Scheduler is runtime-scoped** -- `schedule_workflow` now registers and executes live cron schedules within the running desktop process, but schedules are not yet restored automatically after an app restart.

### High

4. **No visual workflow builder** -- React Flow types are defined but no builder component exists. Users can only create empty workflows via the panel. Editing nodes/edges requires code or a future builder UI.

5. **`WorkflowStatus` mismatch** -- The Rust `WorkflowStatus` enum includes `WaitingApproval` (7 states) but the TypeScript `WorkflowStatus` type only defines 6 states (missing `waiting_approval`). The `STATUS_CONFIG` in `WorkflowPanel.tsx` also only handles 6 states.

6. **Single-connection-per-operation** -- `WorkflowEngine` opens a new SQLite connection for every operation via `get_connection()`. No connection pooling or reuse. Could cause performance issues under load.

7. **Agent node polling** -- The agent execution in `execute_agent_node` polls every 100ms for up to 60 seconds. This is a hard timeout that may be too short for complex agent tasks. No configurable timeout per agent node.

8. **Parallel node variable merge is last-write-wins** -- When merging branch variables back into the parent context, overlapping keys are silently overwritten. This can cause data loss if branches write to the same variable names.

### Medium

9. **Event triggers are fire-and-forget stubs** -- `register_file_watcher_trigger`, `register_email_trigger`, `register_database_trigger`, and `register_api_trigger` only log the registration without setting up actual listeners.

10. **Duplicate scheduler hierarchy remains** -- `core/orchestration/workflow_scheduler.rs` is the live runtime scheduler for workflow triggers, but `sys/commands/scheduler.rs` still maintains a separate flat scheduled-job type system for UI-driven scheduled tasks. Those two hierarchies are still not unified.

11. **No workflow versioning** -- Updates overwrite the entire definition. No version history, no rollback, no diff between versions.

12. **No execution output persistence** -- The executor only stores `inputs` in the execution record. The `outputs` field is initialized as an empty map and never updated with the final context variables after execution completes.

13. **Script node security** -- Script execution passes workflow variables as environment variables and runs arbitrary code. While there is a subprocess timeout, there is no sandboxing, no filesystem restriction, and no resource limiting beyond the 1MB output cap.

14. **Marketplace uses hardcoded user IDs** -- `WorkflowMarketplace.tsx` uses `'current_user_id'` and `'Current User'` as hardcoded values instead of reading from the auth store.

15. **SQL query truncation** -- The `get_execution_status` query has a typo: `completed_a` instead of `completed_at` in the SELECT column list (line 560-561 of `workflow_engine.rs`). This will cause a runtime SQL error when querying execution status.
