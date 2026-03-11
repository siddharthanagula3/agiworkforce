# Sub-Feature: Swarm / Multi-Agent

> Massively parallel agent orchestration system inspired by Kimi K2.5 -- decomposes complex goals into subtasks, spawns up to 100 concurrent sub-agents, executes them in dependency order, and aggregates results with configurable strategies.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Swarm core | `apps/desktop/src-tauri/src/core/swarm/` (5 files + tests) |
| Agent runtime | `apps/desktop/src-tauri/src/core/agent/` (planner, executor, autonomous, background_agent, runtime) |
| AGI orchestration | `apps/desktop/src-tauri/src/core/agi/` (core, orchestrator, planner, executor, reflection) |
| IPC commands | `apps/desktop/src-tauri/src/sys/commands/agi.rs` (AGI + orchestrator commands) |
| IPC commands | `apps/desktop/src-tauri/src/sys/commands/agent.rs` (autonomous agent commands) |
| IPC commands | `apps/desktop/src-tauri/src/sys/commands/background_agents.rs` (background agent commands) |
| IPC commands | `apps/desktop/src-tauri/src/sys/commands/background_tasks.rs` (task queue commands) |
| Frontend stores | `apps/desktop/src/stores/chat/agentStore.ts` (agent status + background tasks) |
| Frontend stores | `apps/desktop/src/stores/executionStore.ts` (goal execution tracking) |
| Frontend stores | `apps/desktop/src/stores/agentTaskStore.ts` (AGI goal CRUD) |
| Hooks | `apps/desktop/src/hooks/useAgenticEvents.ts` (Tauri event listeners) |
| Hooks | `apps/desktop/src/hooks/useBackgroundTasks.ts` (background task polling) |
| Components | `apps/desktop/src/components/Agent/` (BrowserAutomationPanel, AutomationHistory) |

## Architecture Overview

The multi-agent system has three layers, each at a different level of abstraction:

```
                       +----------------------------+
                       |   Frontend (TypeScript)    |
                       |   agentTaskStore           |
                       |   executionStore           |
                       |   agentStore               |
                       +---+----+----+---------+----+
                           |    |    |         |
                   invoke()| IPC|    |   listen() events
                           v    v    v         ^
          +----------------+----+----+---------+------------------+
          |                Tauri IPC Layer                         |
          |  agi_*  orchestrator_*  agent_*  background_agent_*   |
          +---+----------+-----------+-----------+----------------+
              |          |           |           |
              v          v           v           v
     +--------+--+  +---+------+ +--+-------+ +-+------------------+
     |  AGICore   |  | Agent    | | Autonomo.| | BackgroundAgent    |
     |  (agi/)    |  | Orchestr.| | Agent    | | Manager            |
     +-----+------+  +---+------+ +--+-------+ +---+----------------+
           |              |           |             |
           v              v           v             v
     +-----+----------------------------------------------+
     |            Swarm Orchestrator (swarm/)               |
     |  TaskDecomposer -> AgentSpawner -> ResultAggregator  |
     +------------------------------------------------------+
```

### Three Orchestration Tiers

**Tier 1 -- Swarm Orchestrator** (`core/swarm/`)
Hub-and-spoke, massively parallel execution. A central `SwarmOrchestrator` breaks a single `Goal` into a `DependencyGraph` of `Subtask` nodes, spawns `SpawnedAgent` instances via `AgentSpawner`, dispatches work through `mpsc` channels, and aggregates results via `ResultAggregator`. Each sub-agent runs its own `AGICore` instance with frozen weights. Max 100 concurrent agents.

**Tier 2 -- Agent Orchestrator** (`core/agi/orchestrator.rs`)
Multi-agent coordination with resource locking. `AgentOrchestrator` manages a pool of `AgentInstance` structs, each wrapping an `AGICore`. It supports `Parallel`, `Sequential`, `Conditional`, and `SupervisorWorker` coordination patterns. Resource contention is resolved through `ResourceLock` (file locks + UI element locks). Emits `agent:spawned` and `agent:status:update` events.

**Tier 3 -- Background Agent Manager** (`core/agent/background_agent.rs`)
User-facing "push to background" system inspired by Cursor's `&` prefix. Up to 8 concurrent background agents, each wrapping an `AutonomousAgent`. Supports pause/resume/cancel/take-over. Persists agent state across sessions via SQLite.

## Swarm System Deep Dive

### Task Decomposition (`swarm/task_decomposer.rs`)

The `TaskDecomposer` uses an LLM call to break a `Goal` into a JSON array of subtasks. Each subtask is typed:

| SubtaskType | Description |
|-------------|-------------|
| `FileOperation` | Read, write, search files |
| `CodeTask` | Code analysis or generation |
| `NetworkRequest` | Web/API requests |
| `DataProcessing` | Data transformation |
| `UiAutomation` | Desktop UI automation |
| `DatabaseQuery` | Database operations |
| `ShellCommand` | Shell command execution |
| `Computation` | Generic computation |
| `Coordination` | Aggregation/coordination |

The decomposer builds a `DependencyGraph` -- a DAG where each `Subtask` has an `id`, `dependencies: Vec<String>`, and a `ParallelizationHint` (estimated duration, resource intensity, side effects, parallelism factor).

**Decomposition cache**: Results are cached using a composite key of `(task_id, SHA-256(description + priority + constraints + success_criteria))` with a 1-hour TTL. Cache hits skip the LLM call entirely. Cache is evicted lazily on lock acquisition and explicitly after goal completion via `invalidate_cache()`.

**Critical path optimization**: Uses Kahn's algorithm (topological sort) + dynamic programming in O(V+E) to find the longest dependency chain. Bottleneck subtasks (those with the most dependents) get their priority boosted to `High`.

**Cycle detection**: DFS-based cycle detection runs after decomposition. Returns the exact cycle path in the error message.

### Agent Spawner (`swarm/agent_spawner.rs`)

`AgentSpawner` dynamically instantiates `SpawnedAgent` instances:

- Concurrency limited by a `tokio::sync::Semaphore` (default max: 100)
- Each agent runs a task loop in a `tokio::spawn` that reads from an `mpsc::Receiver<AgentTask>`
- Tasks are dispatched via `mpsc::Sender` and results returned via `oneshot::Sender<AgentTaskResult>`
- Each agent has a per-agent `CircuitBreaker` (threshold: 3 failures, reset timeout: 30s, half-open retry)
- Sub-agents are **frozen** by default (`enable_learning: false`, `enable_self_improvement: false`) following the Kimi K2.5 pattern
- Resource limits per agent: 10% CPU, 256MB memory, 10Mbps network, 100MB storage

**Circuit breaker states**:
- **Closed** -- Normal operation, failures counted
- **Open** -- After 3 consecutive failures, all requests rejected for 30s
- **Half-Open** -- After 30s, one request allowed through; success resets to Closed, failure re-opens

**Agent lifecycle**: `Healthy` -> `Degraded` -> `CircuitOpen` -> `Recovering` -> `Terminated`

### Orchestrator (`swarm/orchestrator.rs`)

`SwarmOrchestrator::execute_swarm_task(goal)` is the main entry point. The execution pipeline:

1. **Decompose** -- `TaskDecomposer::decompose(goal)` produces a `DependencyGraph`
2. **Optimize** -- `optimize_critical_path()` boosts priorities of bottleneck nodes
3. **Execute** -- `execute_parallel()` loop:
   - Get ready subtasks (all dependencies satisfied)
   - For each ready subtask, acquire or spawn an agent, send task via channel
   - Poll `oneshot::Receiver` results with `try_recv()` (non-blocking)
   - On success: `graph.mark_completed(id)` -- returns newly unblocked subtasks
   - On failure: `graph.mark_failed(id)` -- decrements `retries_remaining`, re-queues if retriable
   - Idempotency guard: `spawned_subtask_ids` set (locked via `tokio::Mutex`) prevents double-dispatch of the same subtask
   - TOCTOU fix: check-and-insert is done atomically under a single lock acquisition
   - Loop exits when `graph.is_complete()` or no progress possible (all remaining tasks blocked)
   - 10ms sleep between iterations to avoid busy-waiting
   - Global timeout enforced (default: 300s)
4. **Aggregate** -- `ResultAggregator::aggregate(results, wall_time)` produces `AggregatedResult`
5. **Cleanup** -- Invalidate decomposition cache, clear spawned subtask set

**Emitted Tauri events during swarm execution**:
- `swarm:started` -- `{ goal_id, description }`
- `swarm:decomposed` -- `{ goal_id, total_subtasks, critical_path_length, max_parallelism }`
- `swarm:subtask_started` -- `{ goal_id, subtask_id, agent_id, description }`
- `swarm:subtask_completed` -- `{ goal_id, subtask_id, execution_time_ms }`
- `swarm:subtask_failed` -- `{ goal_id, subtask_id, error }`
- `swarm:completed` -- `{ goal_id, success, succeeded, failed, wall_time_ms, speedup_ratio }`

### Result Aggregation (`swarm/result_aggregator.rs`)

Six aggregation strategies:

| Strategy | Success condition | Output |
|----------|-------------------|--------|
| `MergeAll` (default) | Any subtask succeeds | Merged JSON object or array of all successful outputs |
| `FirstSuccess` | First success found | Single output from first successful subtask |
| `HighestConfidence` | Any with confidence score | Output with highest `metadata.confidence` |
| `RequireAll` | All subtasks must succeed | Merged output (fails if any fail) |
| `Majority` | Success ratio >= threshold (default 50%) | Merged output |
| `Custom` | User-defined function | User-defined aggregation |

**Speedup ratio**: `total_agent_time / wall_clock_time`. Target is 4.5x (matching Kimi K2.5). Tests verify 4x and 10x scenarios.

### Configuration Constants

```
MAX_CONCURRENT_AGENTS:         100
DEFAULT_SUBTASK_TIMEOUT:       60s
DEFAULT_SWARM_TIMEOUT:         300s (5 min)
CIRCUIT_BREAKER_THRESHOLD:     3 failures
CIRCUIT_BREAKER_RESET_TIMEOUT: 30s
HEARTBEAT_INTERVAL:            5s
MAX_SUBTASK_RETRIES:           2
TARGET_SPEEDUP_RATIO:          4.5x
MIN_PARALLEL_SUBTASKS:         2
MAX_DECOMPOSITION_DEPTH:       5
DECOMPOSITION_CACHE_TTL:       3600s (1 hour)
```

## Agent Runtime

The agent runtime layer (`core/agent/`) implements the plan-execute-verify cycle used by individual agents within the swarm.

### TaskPlanner (`agent/planner.rs`)

Generates an executable plan from a natural language description by prompting the LLM with a structured format. The plan is a `Vec<TaskStep>` where each step has:
- `id` -- Unique step identifier
- `action` -- One of: Screenshot, Click, Type, Navigate, WaitForElement, ExecuteCommand, ReadFile, WriteFile, SearchText, Scroll, PressKey
- `description` -- Human-readable explanation
- `expected_result` -- What success looks like
- `timeout` -- Per-step timeout
- `retry_on_failure` -- Whether to retry on failure

Falls back to a basic screenshot+search plan when the LLM call fails.

### TaskExecutor (`agent/executor.rs`)

Executes individual `TaskStep` actions. Key security hardening:
- **Navigate**: URL validation (http/https only), CDP-first via PlaywrightBridge with OS-level fallback
- **ExecuteCommand**: Validated through `CommandValidator` before spawning (BUG-02 fix)
- **ReadFile/WriteFile**: Path canonicalization, blocked prefixes (`/etc`, `/proc`, `/sys`, `~/.ssh`, etc.), symlink traversal prevention (BUG-01 fix)

### AutonomousAgent (`agent/autonomous.rs`)

Full autonomous execution loop with self-healing:
- Plans task via `TaskPlanner`
- Executes steps sequentially via `TaskExecutor`
- On failure: retries with `MAX_SELF_HEAL_RETRIES` (3), re-plans with `replan_on_failure` (up to `MAX_REPLAN_COUNT` = 2)
- User approval flow: suspends execution, inserts `oneshot::Sender<bool>` into global `PENDING_APPROVALS` map, waits up to 300s for user response via `resolve_task_approval` command
- Safety caps: `MAX_LOOP_ITERATIONS` = 25, `MAX_PENDING_TASKS` = 500
- Budget tracking: emits `agent:budget_warning` when cumulative cost reaches 80% of session cap
- Step outcome history (capped at 20 entries) is fed back to LLM for context-aware re-planning

### AgentRuntime (`agent/runtime.rs`)

Higher-level task queue with priority scheduling:
- Priority levels: Low (0), Normal (1), High (2), Critical (3)
- Task statuses: Queued, Running, Completed, Failed, Cancelled
- Timeline events emitted: `TaskQueued`, `TaskStarted`, `StepStarted`, `StepCompleted`, `TaskCompleted`, `TaskFailed`
- Integrates with `ChangeTracker` for file change auditing
- Integrates with `AGICore` for goal submission
- Integrates with `McpClient` for MCP tool execution

## Background Agents

### BackgroundAgentManager (`agent/background_agent.rs`)

Cursor-inspired "&" prefix pattern for pushing conversations to the background:

- Max 8 concurrent background agents (`MAX_BACKGROUND_AGENTS`)
- Default timeout: 24 hours (`DEFAULT_AGENT_TIMEOUT_SECS`)
- Each agent wraps an `AutonomousAgent` with its own `BackgroundAgentContext` (working directory, env vars, conversation snapshot, active MCP servers, custom instructions)
- Status lifecycle: `Queued` -> `Running` -> `Completed` | `Failed` | `Paused` | `Cancelled`
- Supports pause/resume/cancel/take-over operations
- Progress tracking with `AgentProgress` struct (percentage, current step, ETA)
- Old completed agents auto-cleaned after 24 hours

### "&" Prefix Detection

`background_agent_should_push(goal)` detects the `&` prefix:
- `"& write tests for auth"` -> `(true, "write tests for auth")`
- `"write tests"` -> `(false, "write tests")`

## Rust Commands (IPC)

### AGI Core Commands (`sys/commands/agi.rs`)

| Command | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `agi_init` | `config: AGIConfig` | `()` | Initialize AGI core with config |
| `agi_submit_goal` | `request: { description, priority?, deadline?, successCriteria? }` | `{ goalId }` | Submit a goal for execution |
| `agi_submit_goal_parallel` | `request: { description, priority?, deadline?, successCriteria?, numAgents? }` | `{ bestResult: ScoredResult }` | Submit goal for parallel multi-agent execution |
| `agi_get_goal_status` | `goalId: string` | `{ context: ExecutionContext }` | Get goal execution status |
| `agi_list_goals` | -- | `Goal[]` | List all active goals |
| `agi_cancel_goal` | `goalId: string` | `()` | Cancel a running goal |
| `agi_stop` | -- | `()` | Stop the AGI core |

### Orchestrator Commands (`sys/commands/agi.rs`)

| Command | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `orchestrator_init` | `{ maxAgents, config: AGIConfig }` | `()` | Initialize multi-agent orchestrator |
| `orchestrator_init_default` | -- | `()` | Initialize with defaults (4 agents) |
| `orchestrator_spawn_agent` | `{ description, priority?, deadline?, successCriteria? }` | `{ agentId }` | Spawn a single agent |
| `orchestrator_spawn_parallel` | `{ goals: SpawnAgentRequest[] }` | `{ agentIds }` | Spawn multiple agents in parallel |
| `orchestrator_get_agent_status` | `agentId: string` | `AgentStatus?` | Get agent status |
| `orchestrator_list_agents` | -- | `AgentStatus[]` | List all active agents |
| `orchestrator_cancel_agent` | `agentId: string` | `()` | Cancel a specific agent |
| `orchestrator_cancel_all` | -- | `()` | Cancel all agents |
| `orchestrator_wait_all` | -- | `AgentResult[]` | Wait for all agents to complete |
| `orchestrator_cleanup` | -- | `usize` | Clean up completed agents |

### Autonomous Agent Commands (`sys/commands/agent.rs`)

| Command | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `agent_init` | `config: AgentConfig` | `()` | Initialize the autonomous agent |
| `agent_submit_task` | `{ description, autoApprove? }` | `{ taskId }` | Submit a desktop automation task |
| `agent_get_task_status` | `taskId: string` | `{ task: Task }` | Get task status |
| `agent_list_tasks` | -- | `{ tasks: Task[] }` | List all tasks |
| `agent_stop` | -- | `()` | Stop the agent |
| `agent_resolve_approval` | `{ approvalId, decision, trust?, reason? }` | `()` | Approve/reject a pending action |
| `agent_set_workflow_hash` | `{ workflowHash? }` | `()` | Set current workflow hash |
| `agent_list_trusted_workflows` | -- | `HashMap<String, Vec<String>>` | List trusted workflow hashes |

### Background Agent Commands (`sys/commands/background_agents.rs`)

| Command | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `background_agent_push` | `{ conversationId, goal, workingDirectory?, conversationHistory?, activeMcpServers?, customInstructions?, priority?, timeoutSecs? }` | `{ agentId, queuePosition?, started }` | Push conversation to background |
| `background_agent_list` | -- | `{ agents, activeCount, maxAgents }` | List all background agents |
| `background_agent_list_active` | -- | `BackgroundAgent[]` | List only active agents |
| `background_agent_get` | `agentId: string` | `BackgroundAgent?` | Get specific agent |
| `background_agent_pause` | `agentId: string` | `()` | Pause a running agent |
| `background_agent_resume` | `agentId: string` | `()` | Resume a paused agent |
| `background_agent_cancel` | `agentId: string` | `()` | Cancel an agent |
| `background_agent_take_over` | `agentId: string` | `{ agent, context }` | Take over (bring to foreground) |
| `background_agent_stats` | -- | `BackgroundAgentStats` | Get agent statistics |
| `background_agent_cleanup` | -- | `usize` | Clean up old agents (>24h) |
| `background_agent_should_push` | `goal: string` | `(bool, string)` | Detect "&" prefix |

### Background Task Queue Commands (`sys/commands/background_tasks.rs`)

| Command | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `bg_submit_task` | `{ name, description?, priority, payload? }` | `string` | Submit a background task |
| `bg_cancel_task` | `taskId: string` | `()` | Cancel a task |
| `bg_pause_task` | `taskId: string` | `()` | Pause a task |
| `bg_resume_task` | `taskId: string` | `()` | Resume a task |
| `bg_get_task_status` | `taskId: string` | `Task` | Get task status |
| `bg_list_tasks` | `{ status?, priority?, limit? }` | `Task[]` | List tasks with filters |
| `bg_get_task_stats` | -- | `TaskStats` | Get task statistics |

Aliases for frontend compatibility: `background_task_list`, `background_task_cancel`, `background_task_status`.

## Store Schemas

### agentStore.ts

```typescript
interface AgentState {
  agents: AgentStatus[];              // All known agents
  agentStatus: AgentStatus | null;    // Currently focused agent
  backgroundTasks: BackgroundTask[];  // Background task queue
  actionTrail: ActionTrailEntry[];    // Action log (capped at 5000)
  fadeTimers: Map<string, Timeout>;   // Auto-remove timers
  isAutonomousMode: boolean;          // Whether autonomous mode is active
  missionControlOpen: boolean;        // Mission control panel state
}

interface AgentStatus {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  currentGoal?: string;
  currentStep?: string;
  progress: number;                   // 0-100
  resourceUsage?: { cpu: number; memory: number };
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

interface BackgroundTask {
  id: string;
  name: string;
  description?: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  priority: 'low' | 'normal' | 'high';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}
```

### executionStore.ts

```typescript
interface ExecutionState {
  activeGoal: ActiveGoal | null;      // Currently executing goal
  steps: ExecutionStep[];             // Steps for current goal (capped at 200)
  terminalLogs: TerminalLog[];        // Terminal output (capped at 1000)
  browserActions: BrowserAction[];    // Browser actions (capped at 100)
  fileChanges: FileChange[];          // File changes (capped at 500)
  researchTasks: Record<string, ResearchTask>;
  currentLLMStream: string;           // Current LLM output being streamed
  isStreaming: boolean;               // Whether LLM is streaming
  panelVisible: boolean;
  activeTab: 'thinking' | 'terminal' | 'browser' | 'files' | 'reflection';
  reflection: ReflectionState;        // Reflection engine state
}

interface ActiveGoal {
  id: string;
  description: string;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  startTime: number;
  endTime?: number;
  totalSteps: number;
  completedSteps: number;
  progressPercent: number;            // 0-100
}
```

### agentTaskStore.ts

```typescript
interface AgentTaskState {
  tasks: AgentTask[];                 // Persisted to localStorage
  loading: boolean;
  submitGoal(goal, options?): Promise<string>;    // options.parallel invokes agi_submit_goal_parallel
  fetchTasks(): Promise<void>;                    // Calls agi_list_goals
  getTaskStatus(taskId): Promise<AgentTask | null>; // Calls agi_get_goal_status
  cancelTask(taskId): Promise<void>;              // Calls agi_cancel_goal
  fetchInsights(taskId): Promise<string[]>;       // Calls agi_get_reflection_insights
}
```

## Component Tree

```
Agent/
  BrowserAutomationPanel.tsx    -- Chrome extension browser automation status panel
  AutomationHistory.tsx         -- History of automation runs with step-by-step timeline

UnifiedAgenticChat/
  DynamicSidecar.tsx            -- Hosts swarm-related inline panels
  InlinePanels/InlinePanel.tsx  -- Renders swarm subtask progress inline
```

The `BrowserAutomationPanel` shows live browser automation status: current URL, page title, agent status chip (planning/executing/done/error/idle), last action description, and a stop button. It uses the `useExtensionEvents` hook to receive real-time updates from the Chrome extension.

The `AutomationHistory` component renders a timeline of all automation runs from `executionStore`, showing each goal with its steps, status icons, and durations.

## Tauri Events

### Swarm Events (emitted by `SwarmOrchestrator`)

| Event | Payload | Direction |
|-------|---------|-----------|
| `swarm:started` | `{ goal_id, description }` | Rust -> TS |
| `swarm:decomposed` | `{ goal_id, total_subtasks, critical_path_length, max_parallelism }` | Rust -> TS |
| `swarm:subtask_started` | `{ goal_id, subtask_id, agent_id, description }` | Rust -> TS |
| `swarm:subtask_completed` | `{ goal_id, subtask_id, execution_time_ms }` | Rust -> TS |
| `swarm:subtask_failed` | `{ goal_id, subtask_id, error }` | Rust -> TS |
| `swarm:completed` | `{ goal_id, success, succeeded, failed, wall_time_ms, speedup_ratio }` | Rust -> TS |

### AGI Goal Events (emitted by `AGICore`)

| Event | Payload | Direction |
|-------|---------|-----------|
| `agi:goal:submitted` | `{ goal_id, description }` | Rust -> TS |
| `agi:goal:plan_created` | `{ goal_id, total_steps, estimated_duration_ms }` | Rust -> TS |
| `agi:goal:step_started` | `{ goal_id, step_id, step_index, total_steps, description }` | Rust -> TS |
| `agi:goal:step_completed` | `{ goal_id, step_id, step_index, total_steps, success, execution_time_ms, error? }` | Rust -> TS |
| `agi:goal:progress` | `{ goal_id, completed_steps, total_steps, progress_percent }` | Rust -> TS |
| `agi:goal:achieved` | `{ goal_id, total_steps, completed_steps }` | Rust -> TS |
| `agi:goal:error` | `{ goal_id, error }` | Rust -> TS |
| `agi:goal:iteration_start` | `{ goal_id, iteration }` | Rust -> TS |
| `agi:goal:unachievable` | `{ goal_id, iterations, consecutive_failures, final_insight }` | Rust -> TS |

### Reflection Events (emitted by `ReflectionEngine`)

| Event | Payload | Direction |
|-------|---------|-----------|
| `agi:reflection:completed` | `{ goal_id, iteration, insight: ReflectionInsight }` | Rust -> TS |
| `agi:reflection:failure_patterns` | `{ goal_id, iteration, patterns: FailurePattern[] }` | Rust -> TS |
| `agi:reflection:corrections` | `{ goal_id, iteration, corrections: Correction[] }` | Rust -> TS |
| `agi:reflection:recommendations` | `{ goal_id, iteration, recommendations: string[] }` | Rust -> TS |
| `agi:reflection:sub_goals` | `{ goal_id, sub_goals: SubGoal[] }` | Rust -> TS |
| `agi:reflection:plan_revised` | `{ goal_id, iteration, corrections_applied, new_steps_count }` | Rust -> TS |

### Agent Lifecycle Events

| Event | Payload | Direction |
|-------|---------|-----------|
| `agent:spawned` | `{ agent_id, goal }` | Rust -> TS |
| `agent:status:update` | `AgentStatusPayload` (id, status, currentGoal, progress, etc.) | Rust -> TS |
| `agent:action_update` | `{ action: { id, status, requiresApproval, error? } }` | Rust -> TS |
| `agent:budget_warning` | `{ cumulative_cost, session_cap, percentage }` | Rust -> TS |
| `agi:approval_granted` | `{ approval: { id } }` | Rust -> TS |
| `agi:approval_denied` | `{ approval: { id, rejectionReason } }` | Rust -> TS |
| `approval:granted` | `{ id }` | Rust -> TS |
| `approval:denied` | `{ id, reason }` | Rust -> TS |

### Execution Sidecar Events

| Event | Payload | Direction |
|-------|---------|-----------|
| `agi:llm_chunk` | `{ step_id, chunk }` | Rust -> TS |
| `agi:llm_complete` | `{ step_id }` | Rust -> TS |
| `agi:terminal_output` | `{ command, output, exit_code? }` | Rust -> TS |
| `agi:browser_action` | `{ type, url?, selector?, value?, screenshot_base64?, success, error? }` | Rust -> TS |
| `agi:file_changed` | `{ path, operation, old_content?, new_content?, language? }` | Rust -> TS |

### Background Task Events

| Event | Payload | Direction |
|-------|---------|-----------|
| `task:progress` | `{ task: BackendTaskResponse }` | Rust -> TS |
| `task:completed` | `{ task: BackendTaskResponse }` | Rust -> TS |
| `task:failed` | `{ task: BackendTaskResponse }` | Rust -> TS |

## Key Patterns

### Task Decomposition Strategy

1. LLM is prompted with the goal description, priority, constraints, and success criteria
2. Response must be a JSON array of subtask objects with `id`, `description`, `type`, `dependencies`, `estimated_duration_ms`, `parallelizable`, `has_side_effects`, `priority`
3. If LLM response cannot be parsed, a single fallback subtask wrapping the entire goal is created
4. Decomposition results are cached (SHA-256 keyed) to prevent duplicate LLM costs on retries
5. Critical path is optimized post-decomposition by boosting priorities of bottleneck nodes

### Agent Communication

- **Hub-and-spoke**: All communication goes through the orchestrator (hub), agents never communicate directly
- **Message types**: `AssignTask`, `TaskComplete`, `TaskFailed`, `CancelTask`, `Heartbeat`, `Shutdown`
- **Channels**: `mpsc` for task dispatch (orchestrator -> agent), `oneshot` for results (agent -> orchestrator)
- **Non-blocking polling**: The orchestrator uses `try_recv()` on oneshot channels to check for results without blocking the main loop

### Error Recovery

1. **Subtask-level retry**: Each subtask gets `MAX_SUBTASK_RETRIES` (2) attempts. On failure, the subtask is re-queued with `status: Pending`
2. **Circuit breaker**: Per-agent circuit breaker opens after 3 consecutive failures, blocking new work for 30s. Agent health transitions to `CircuitOpen`
3. **Agent restart**: `AgentSpawner::restart_agent()` terminates the old agent (cooperative signal + handle abort) and spawns a fresh one
4. **Unhealthy agent recovery**: `restart_unhealthy_agents()` finds `CircuitOpen` or `Degraded` agents and restarts them
5. **Autonomous agent self-healing**: Up to 3 retry attempts with step-by-step re-planning on failure
6. **Graceful degradation**: If the LLM decomposition fails, a single fallback subtask is used. If all agents fail for a subtask, the error is reported but other subtasks continue

### Cancellation

- **Swarm level**: `SwarmOrchestrator::stop()` sets `stop_signal` AtomicBool, checked on each iteration of the execution loop
- **Agent level**: `SpawnedAgent::stop()` sets a per-agent `stop_signal`, and `JoinHandle::abort()` for immediate termination
- **AGI level**: `AGICore::stop()` sets `stop_signal` AtomicBool checked in the goal execution loop
- **Autonomous agent**: `AutonomousAgent::stop()` sets stop signal checked between step executions
- **Background agent**: `BackgroundAgentManager::cancel_agent()` updates status and signals the wrapped autonomous agent

### Resource Management

- `ResourceLock` provides mutual exclusion on files and UI elements across concurrent agents
- `FileGuard` and `UiGuard` auto-release on drop (RAII pattern)
- Per-agent resource limits via `ResourceLimits` struct (CPU, memory, network, storage)
- Agent semaphore prevents exceeding max capacity
- Per-agent `SubAgentConfig` controls operation timeout and concurrent task limits

## Known Issues / Tech Debt

1. **Swarm events not fully wired to frontend**: The `swarm:*` events are emitted from Rust but only three frontend files reference `swarm:` -- `DynamicSidecar.tsx`, `InlinePanel.tsx`, and `InlineToolResults/index.ts`. There is no dedicated swarm progress UI component or store listener for `swarm:decomposed`/`swarm:subtask_*` events.

2. **No swarm-specific Tauri commands**: The swarm system is only accessible indirectly through `AGICore::submit_goal()` when the swarm orchestrator is wired. There are no direct `swarm_*` IPC commands for the frontend to control swarm execution, inspect subtask graphs, or configure swarm parameters at runtime.

3. **Agent orchestrator vs. swarm orchestrator duplication**: `core/agi/orchestrator.rs` (`AgentOrchestrator`) and `core/swarm/orchestrator.rs` (`SwarmOrchestrator`) both implement multi-agent coordination with overlapping concerns. The AGI orchestrator manages agent instances with resource locking, while the swarm orchestrator handles task decomposition and parallel scheduling. These could be unified or clearly composed.

4. **Frozen sub-agents bypass learning**: Sub-agents in the swarm are frozen (`enable_learning: false`), meaning execution patterns and failures are not fed back into the learning system. Only the orchestrator-level metrics capture execution quality.

5. **No heartbeat monitoring**: The `SwarmMessage::Heartbeat` variant is defined but the orchestrator's execution loop does not implement heartbeat polling or dead-agent detection. Agent liveness is only detected when a task's `oneshot` channel closes unexpectedly.

6. **Decomposition cache not bounded**: The decomposition cache grows until entries expire (1-hour TTL) with lazy eviction. There is no hard cap on cache size, which could be an issue if many unique goals are submitted in a short period.

7. **Background agent persistence partial**: `BackgroundAgentManager` stores agent state in memory. While it has SQLite integration for task checkpoints, full agent state persistence across app restarts (conversation context, MCP connections, etc.) is not fully implemented.

8. **Stream timeout on execution store**: A 60s stream timeout in `executionStore.ts` auto-clears stuck `isStreaming` state, but this could prematurely clear legitimate long-running LLM operations.

9. **`refresh_agent_status` bootstrap**: The `agentStore.ts` calls `invoke('refresh_agent_status')` on initialization but silently swallows errors. If the orchestrator is not yet initialized, agents array is set to empty with no retry mechanism.

10. **Autonomous agent global static**: `AGENT` in `sys/commands/agent.rs` is a global `Mutex<Option<...>>`, meaning only one autonomous agent instance can exist at a time. This conflicts with the multi-agent design of the swarm and orchestrator systems.
