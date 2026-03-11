# Feature: Agentic Mode
> Autonomous multi-turn tool-use loop that runs inside the LLM streaming pipeline — the model calls MCP tools repeatedly until a goal is achieved, with a parallel AutonomousAgent path for desktop automation tasks.

## Where It Lives

| Layer | Location |
|-------|----------|
| Frontend Components | `components/UnifiedAgenticChat/index.tsx` — AgenticLoopStatusBar, PendingMessagesBubbles; `ToolLabel.tsx` — single tool entry; `ToolTimeline.tsx` — collapsible timeline per message; `Cards/ToolExecutionCard.tsx`, `Cards/ApprovalRequestCard.tsx` |
| Stores | `stores/chat/chatStore.ts` — `toolTimelineByMessage`, `agenticLoopStatus`; `stores/chat/toolStore.ts` — `activeToolStreams`, `actionLog`, `pendingApprovals`, `plan`, `trustedWorkflows`; `stores/chat/agentStore.ts` — `actionTrail`, `isAutonomousMode`, `backgroundTasks`, `agents` |
| Hooks | `hooks/useAgenticEvents.ts` — master hook (fans to 3 sub-hooks); `hooks/useAgentLoopEvents.ts` — plan/action/permission/metrics events; `hooks/useToolEvents.ts` — MCP tool/stream/approval events; `hooks/useFileTerminalEvents.ts` — file/terminal events |
| Rust Commands | `sys/commands/chat/send_message.rs` — inline streaming tool loop (lines 1350-1850); `sys/commands/agent.rs` — `agent_init`, `agent_stop`, `agent_submit_task`, `agent_resolve_approval`; `sys/commands/background_agents.rs` — background agent CRUD |
| Rust Core | `core/agent/autonomous.rs` — `AutonomousAgent::run_autonomous_loop()`; `core/agent/planner.rs` — `TaskPlanner::plan_task()` (LLM-driven step decomposition); `core/agent/executor.rs` — `TaskExecutor::execute_step()` for all `Action` variants; `core/agent/approval.rs` — `ApprovalManager`; `core/agent/background_agent.rs` — `BackgroundAgent` |
| Tool Events | `sys/commands/chat/tool_events.rs` — `ToolEvent` enum (Started/Progress/Completed), `get_tool_display_info()` (MCP name → Claude Code-style labels), rate-limited `should_emit_progress()` (100ms gap) |
| Event Channels | `tool:event` (Started/Progress/Completed); `agentic:loop-started/status/ended/message-consumed`; `chat:agent-progress`; `agent:thinking`, `agent:finished`; `agent:plan_update`, `agent:action_update`, `agent:permission_required`; `agent:budget-warning`, `agent:budget-exceeded`, `agent:loop-iteration-limit` |

## Two Agentic Paths

### Path A: Streaming Tool Loop (primary — most users experience this)

Triggered when LLM returns `tool_calls` during `chat_send_message`. Runs inside `send_message.rs`.

1. **Tool loop entry** — `has_tool_calls=true && !was_stopped`: emits `agentic:loop-started` with `max_iterations` (25 standard, 8 fast-metadata)

2. **Per-iteration** (up to 25 or 600s total):
   - Emits `agentic:loop-status` with current iteration
   - `execute_tool_calls_batch()` — for each tool call:
     - `get_tool_display_info(name, args)` → display label (e.g. `Read(src/main.rs)`)
     - Emits `tool:event(Started)` with display info, iteration
     - Executes tool via MCP dispatch (timeout: 120s default, 300s for long-running)
     - Emits `tool:event(Completed)` with `duration_ms`, `result_preview` (first 200 chars), `success`
   - Injects pending user messages via `pop_pending_message_for_conversation()`
   - Context compaction if >20 messages
   - Follow-up streaming request with tool results
   - If follow-up has tool calls → continue; else → break

3. **Loop termination** — emits `agentic:loop-ended` with reason: `"stop"`, `"timeout"`, `"limit_reached"`, `"paused"`

### Path B: AutonomousAgent (desktop automation — requires macOS Accessibility)

Triggered when `detect_agent_mode()` returns true (requires `AXIsProcessTrusted()` on macOS).

1. `send_message.rs:938` spawns `AgentOrchestrator::process_instruction()`

2. `AgentOrchestrator` → `AutonomousAgent`:
   - `planner.plan_task(description)` — LLM-driven, parses JSON array of `TaskStep` with `Action` variants: `Screenshot`, `Click`, `Type`, `Navigate`, `WaitForElement`, `ExecuteCommand`, `ReadFile`, `WriteFile`, `SearchText`, `Scroll`, `PressKey`

3. `run_autonomous_loop()`:
   - Budget check: `router.get_cumulative_cost()` vs `config.max_session_cost` ($50 default). Emits `agent:budget-warning` at 80%, `agent:budget-exceeded` at 100%
   - `TaskExecutor::execute_step()` per pending task
   - `Action::Navigate` uses `PlaywrightBridge` (CDP) if available, else OS `open`
   - Re-plans on step failure (up to `MAX_REPLAN_COUNT=2`)
   - Hard cap at 25 iterations

4. Final synthesis LLM call (non-streaming) produces clean response. Emits `agent:finished`.

## Data Flow (Path A — Primary)

1. User sends message with tools enabled
2. LLM returns `finish_reason=tool_calls` with tool call array
3. Rust emits `agentic:loop-started` → frontend shows `AgenticLoopStatusBar`
4. For each tool: `tool:event(Started)` → frontend adds `ToolLabel` to `ToolTimeline`
5. MCP tool executes → `tool:event(Completed)` → `ToolLabel` shows checkmark + duration
6. Tool results sent back to LLM as follow-up
7. LLM responds — if more tool calls, repeat from step 4
8. When done: `agentic:loop-ended` → `ToolTimeline` auto-collapses

## Component Tree

```
UnifiedAgenticChat (index.tsx)
├── AgenticLoopStatusBar          ("Agent working step N/M")
├── PendingMessagesBubbles        (queued follow-ups during loop)
│
├── ChatStream
│   └── MessageBubble (×N)
│       └── ToolTimeline          (toolTimelineByMessage[messageId])
│           └── ToolCallCard (×N)
│               └── ToolLabel     (status icon + Name(args) + duration)
│
├── Cards/ApprovalRequestCard     (when pendingApprovals > 0)
└── Sidecar/ActiveOperationsSection (tool stream live view)
```

## IPC Contracts

| Frontend Call | Rust Handler | Params (camelCase) | Returns |
|---|---|---|---|
| `invoke('chat_send_message', {request: {..., enableAgentMode: true}})` | `chat_send_message` | `enableAgentMode: boolean` in request | Sentinel response; real content via events |
| `invoke('agent_submit_task', {description, autoApprove?})` | `agent_submit_task` | `description: string, autoApprove?: boolean` | `string` (task_id) |
| `invoke('agent_init', {config})` | `agent_init` | `config: AgentConfig` | `void` |
| `invoke('agent_stop')` | `agent_stop` | none | `void` |
| `invoke('agent_get_task_status', {taskId})` | `agent_get_task_status` | `taskId: string` | `TaskStatusResponse` |
| `invoke('agent_resolve_approval', {approvalId, decision, trust?, reason?})` | `agent_resolve_approval` | `approvalId: string, decision: string, trust?: boolean, reason?: string` | `void` |
| `invoke('cancel_tool_confirmation', {toolCallId})` | `cancel_tool_confirmation` | `toolCallId: string` | `void` |
| `invoke('get_tool_safety_tier', {toolName})` | `get_tool_safety_tier` | `toolName: string` | `SafetyTier` |
| `invoke('chat_add_pending_message', {request})` | `chat_add_pending_message` | `request: { content, conversationId? }` | `PendingUserMessage` |

## Dependencies

- **Requires**: `McpState` (tool registry for Path A), `AutomationService` (macOS Accessibility for Path B), `LLMRouter` (planning + follow-up requests), `ToolGuard` (security validation before tool execution), `ProjectContextState` (working directory for file tools), `PlaywrightBridge` optional (CDP navigation for Path B)
- **Required by**: Background Agents (calls `AutonomousAgent::run_goal()`), Swarm orchestration (`core/swarm/`) uses `AgentRuntime`, Mobile companion app consumes `agentic:loop-*` events via signaling server

## Known Gaps

- **Two parallel agentic paths**: Path A (streaming tool loop in `send_message.rs`) and Path B (`AutonomousAgent`/`AgentOrchestrator`) are largely independent codebases. Most "agentic" behavior (MCP tool calls) uses Path A; desktop automation uses Path B.
- **`agent:plan_update`/`agent:action_update` events** are listened for in `useAgentLoopEvents.ts` but only Path B emits them. Path A (the primary path) never emits plan/action updates. UI elements depending on these (`AgentTaskPanel`, action log plan entries) only activate during desktop automation.
- **`ToolEvent::Progress`** is defined and rate-limited but nothing in current MCP execution calls `emit_tool_event(Progress{...})`. The progress channel is wired but never driven.
- **`parallel_group`** field in `ToolEvent::Started` is always `None` in `execute_tool_calls_batch()`. `ToolTimeline.tsx` has grouping logic for parallel tools but Rust never populates it. All tools appear sequential.
- **Path B final synthesis** uses non-streaming mode — users see nothing until the entire agent task completes (no progressive output).
- **`PENDING_TASK_APPROVALS` DashMap** (static in `autonomous.rs`) — oneshot channels for approval flow — never cleaned up on app restart.

## Design Decisions

- **Streaming tool loop inside `chat_send_message`** — rather than a separate agent command, the primary agentic loop runs as a continuation of the initial LLM stream. Gives seamless UX (tokens stream per iteration) and keeps all state in a single async task. Downside: ~1500-line `send_message.rs`.
- **Tool display name mapping in Rust** (`tool_events.rs:78`) — MCP tool name + JSON args mapped to Claude Code-style labels (`Read(src/main.rs)`) entirely in Rust. Ensures consistency across streaming and non-streaming contexts.
- **Rate-limited progress events** — `should_emit_progress()` enforces 100ms minimum between progress events per tool ID. Global `LazyLock<Mutex<HashMap<String, Instant>>>` as rate-limit map, cleared when >500 entries.
- **Approval timeout** — autonomous tasks use 300s (`APPROVAL_TIMEOUT_SECS`) oneshot channel. Auto-fails if user doesn't approve within 5 minutes.
- **ToolTimeline auto-collapse** — `ToolTimeline.tsx` auto-expands while tools running (`hasRunning`). Collapses on loop end to save space.
- **Message queuing during active loop** — `useSendMessage.ts` detects `agenticLoopStatus?.active` and calls `chat_add_pending_message` instead of starting new `chat_send_message`. Rust atomically dequeues and injects as user messages between tool iterations.
