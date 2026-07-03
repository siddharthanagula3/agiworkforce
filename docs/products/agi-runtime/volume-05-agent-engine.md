# AGI Runtime — Volume 05 — Agent Engine

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root); `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `apps/mobile/AGENTS.md` (active surface). Grounded in `crates/agiworkforce-task-runtime/src/lib.rs`, `crates/agiworkforce-app-server/src/lib.rs`, `crates/agiworkforce-protocol/src/plan_tool.rs`, `services/signaling-server/src/index.ts`, `apps/mobile/services/companion.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`, `services/api-gateway/src/routes/{mobile,pair}.ts`, `apps/web/app/api/control-plane/status/route.ts`.

## Overview & stance

The Agent Engine is the internal state machine that takes a unit of work from creation to a terminal outcome. It is not a surface and not a daemon. Its concrete core is `crates/agiworkforce-task-runtime`: a `TaskRegistry` owning a `Task { id, kind, status, command, output_path, started_at, ended_at, exit_code, error }` and a strict status machine. `TaskKind` enumerates the shapes of work — `LocalShell`, `LocalAgent`, `RemoteAgent`, `InProcessTeammate`, plus `LocalWorkflow`, `MonitorMcp`, `Dream` (✅ `crates/agiworkforce-task-runtime/src/lib.rs`).

Trust modes shape every kind. `LocalShell`, `LocalAgent`, and `LocalWorkflow` run under **Local** trust — compute and data stay on the host, never silently routed to BYOK or Cloud. `RemoteAgent` is the only kind that reaches a remote provider and inherits the surface's allowed modes: **BYOK** on Desktop/CLI/VS Code only (explicit Local→BYOK fork with context selection, secret scan, payload preview, provider label, consent) or **Managed Cloud** for signed-in users. `InProcessTeammate` runs in the host process under the parent's trust. Remote control never adds a mode: a phone or web client is a window over a session that keeps executing locally. Model selection for any `RemoteAgent` reads IDs only from `packages/types/src/models.json`.

## Agent Lifecycle — creation through completion

`TaskRegistry::create(kind, command)` mints a `Uuid`, pre-creates the per-task output file under `~/.agiworkforce/tasks`, and records status `Pending`. `update_status` drives `Pending → Running → {Completed, Failed, Stopped}`; `valid_transition` rejects illegal moves (e.g. `Completed → Running`), stamps `started_at` on first `Running`, and `ended_at` on any terminal state. ✅ Built (`crates/agiworkforce-task-runtime/src/lib.rs`). The higher-level agent loop (tool-call turns, reflection, memory) that would drive a `LocalAgent`/`RemoteAgent` through those states is 🔭 Planned — the registry is the substrate, not the reasoning loop.

## Task Planning — build execution plans

The plan/checklist primitive is the `update_plan` tool: `UpdatePlanArgs { explanation, plan: Vec<PlanItemArg> }` where each `PlanItemArg { step, status }` carries `StepStatus` of `Pending | InProgress | Completed`. ✅ Built as a typed, schema-validated tool (`crates/agiworkforce-protocol/src/plan_tool.rs`; `#[serde(deny_unknown_fields)]`). Requirement: a plan is an ordered, mutable list an agent revises as it works; the UI renders it and the engine persists revisions. Automatic decomposition of a natural-language goal into a plan is 🔭 Planned — today the model emits the plan via the tool; the engine does not synthesize one.

## Task Scheduling — schedule execution order

The registry is a flat `HashMap<TaskId, Task>` with `create`/`list`; there is no priority queue, dependency graph, or ordering component, and scheduled execution is disabled on the active surface (`schedules: false`, `apps/mobile/lib/v1FeatureFlags.ts`). 🔭 Planned: a scheduler honoring dependencies, priority, and time/cron triggers, feeding ready tasks into the pipeline. Requirement: ordering must be deterministic and inspectable (`agi tasks list` shows queue position), and no scheduled task may cross a trust boundary implicitly. The `StallWatchdog` is the only time-based control today.

## Delegation — delegate subtasks

Delegation targets already exist as kinds: `RemoteAgent` (delegate to a remote provider/host) and `InProcessTeammate` (delegate to a co-resident worker). The dispatch primitive is the app-server `ToolDispatch` trait — `tools/list` / `tools/call` over JSON-RPC stdio or loopback WebSocket, consumed only by the CLI (✅ `crates/agiworkforce-app-server/src/lib.rs`). Remote delegation across devices rides `dispatch_request` / `dispatch_response` on the signaling relay (🟡 `services/signaling-server/src/index.ts` — allowlisted, but Desktop↔Mobile is unwired: `dispatch: false`/`companion: false` in `apps/mobile/lib/v1FeatureFlags.ts`, and mobile control events re-emit as an unlistened window `CustomEvent`). Automatic parent→child subtask spawning and result-merging is 🔭 Planned. Every delegated subtask must carry its parent's trust mode; a Local parent must not spawn a Cloud child without an explicit fork.

## Parallel Agents — execute multiple agents concurrently

The registry is `Arc<RwLock<HashMap<…>>>` and each running task is an independent `tokio` future with its own output file and `StallWatchdog` (per-task `JoinHandle`), so many tasks coexist safely today (🟡 `crates/agiworkforce-task-runtime/src/lib.rs` — no concurrency limit, pool, or fair-scheduling manager). 🔭 Planned: a bounded worker pool with per-surface and per-plan concurrency caps, and cross-surface fan-out. Managed-Cloud concurrency is metered against the subscriber's plan (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise); Local and BYOK parallelism are free access modes, not metered. No credit top-ups.

## Execution Pipeline — control task execution

The local execution path is real: a client calls `tools/call` on the app-server, the dispatched tool runs the work, and `TaskRegistry::append_output` streams stdout/stderr to the task's file while `read_output(id, max_bytes)` tails it (✅ `crates/agiworkforce-app-server/src/lib.rs`, `crates/agiworkforce-task-runtime/src/lib.rs`; exec safety via `crates/agiworkforce-execpolicy` and `crates/sandbox-policy`). Requirement: the pipeline is pause/cancel-aware — `TaskRegistry::stop` moves a live task to `Stopped` and stamps `ended_at`; cancellation propagates over the relay `cancel` verb and mobile "emergency stop" (`apps/mobile/services/companion.ts`, 🟡). A single unified pipeline object spanning all `TaskKind`s is 🔭 Planned.

## Retry Logic — recover from failures

There is intentionally **no** retry in the core today: `Failed` is terminal — `valid_transition` forbids `Failed → Running`, so a failed task cannot silently re-enter execution (✅ guardrail, `crates/agiworkforce-task-runtime/src/lib.rs`). The `StallWatchdog` marks a stalled task `Failed` with error `"stall timeout"` when the output file stops growing. The only resilience primitive shipped is offline approval queueing on the relay (🟡 `services/signaling-server/src/index.ts`). 🔭 Planned: bounded retry with exponential backoff, idempotency keys, and a distinct `Retrying` state (a new task or an explicit re-create — never an illegal in-place transition). Retries must not change trust mode or provider without consent.

## Completion — finalize task execution

`update_status(Completed, exit_code, …)` and `stop(…)` are the finalizers: they set `ended_at`, persist `exit_code`/`error`, and cause the `StallWatchdog` to observe a terminal status and exit its poll loop (✅ `crates/agiworkforce-task-runtime/src/lib.rs`). Final output is read once via `read_output`. Requirement: completion is idempotent and observable — a terminal task never re-runs, and its record is queryable via `agi tasks get <id>`. Cross-surface completion signals (presence, "task done" fan-out) are 🔭 Planned: `apps/web/app/api/control-plane/status/route.ts` exists, but the `surface_heartbeats` table it implies does not. Managed-Cloud chat completions that must reach other devices go through Neon delta-sync (`apps/web/app/api/{chat,memory,projects}/sync`), not the task engine.

## Repository map

- `crates/agiworkforce-task-runtime/src/lib.rs` — `Task`, `TaskKind`, `TaskStatus`, `TaskRegistry`, `valid_transition`, `StallWatchdog` (engine core).
- `crates/agiworkforce-protocol/src/plan_tool.rs` — `update_plan` plan/checklist tool types.
- `crates/agiworkforce-app-server/src/lib.rs` — `ToolDispatch`, `tools/list`/`tools/call` dispatch host.
- `crates/agiworkforce-command-registry/`, `crates/agiworkforce-plugin-runtime/`, `packages/runtime/` — command/plugin surfaces the engine invokes.
- `crates/agiworkforce-execpolicy/`, `crates/sandbox-policy/` — exec/sandbox gating for the pipeline.
- `services/signaling-server/src/index.ts`; `services/api-gateway/src/routes/{mobile,pair}.ts` — delegation/remote-control fabric.
- `apps/mobile/services/companion.ts`; `apps/mobile/lib/v1FeatureFlags.ts` — companion control verbs and feature gates.
- `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs` — loopback WS/IPC host.

## Competitor notes

Claude Code, ChatGPT, and Codex expose an agent loop, a todo/plan tool, subagent delegation, and parallel/background runs — but each is single-provider and cloud-anchored. AGI's divergence: the engine is provider-neutral and reads model IDs from `packages/types/src/models.json`; `LocalShell`/`LocalAgent` keep compute on-device; `RemoteAgent` is the only remote kind and honors per-surface trust (BYOK only where allowed, Managed Cloud otherwise); and remote control is a window over a locally-running session (Claude Code Remote Control / Codex parity), not a lift-and-shift to the cloud. Retry, scheduling, and cross-surface presence are deliberately unbuilt rather than faked.

## Acceptance / Definition of Done

- [ ] **Build:** every `TaskKind` round-trips `create → Running → terminal`; illegal transitions and stall timeouts are covered by tests (`crates/agiworkforce-task-runtime/src/lib.rs` suite green); `agi tasks {list,get,stop}` reflect real registry state.
- [ ] **Trust:** no code path routes a `LocalShell`/`LocalAgent`/`LocalWorkflow` task to BYOK or Cloud; `RemoteAgent` on a delegated subtask inherits the parent's mode and requires an explicit fork to cross Local→BYOK; model IDs resolve only from `packages/types/src/models.json`.
- [ ] **Security:** delegation and cancel verbs stay on the signaling allowlist with per-role HMAC pair tokens; loopback host origin checks and IP lockout hold; no retry re-runs a `Failed` task in place.

## Anti-patterns

- Inventing a monolithic "runtime daemon" or a scheduler/retry engine as shipped — they are 🔭.
- Adding a `Failed → Running` transition, or any in-place retry, to bypass the terminal-state guard.
- Silently promoting a Local task to `RemoteAgent`/Cloud, or delegating a subtask into a different trust mode without an explicit fork (context selection, secret scan, payload preview, provider label, consent).
- Hardcoding or inventing model IDs, routes, env vars, or command names; treating remote control as a fourth trust mode.
- Referencing Supabase (use Clerk + Neon + Stripe) or removed tiers (Plus, `pro_plus`, Hobby, top-ups). Use only Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise.
- Claiming Desktop↔Mobile dispatch or cross-surface presence works while `dispatch`/`companion` are off and `surface_heartbeats` does not exist.
