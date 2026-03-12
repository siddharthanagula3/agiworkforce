# Desktop Cowork Competitive Plan

Status: active  
Scope: `apps/desktop`  
Benchmark date: March 12, 2026

## Purpose

Use Anthropic Cowork as a concrete benchmark for AGI Workforce desktop.

This document is not a marketing comparison. It is an execution plan for what the desktop app must match or beat in order to compete credibly in the `Claude Cowork` category while still aiming beyond it.

## Verified Cowork Benchmark

Based on Anthropic’s official Cowork docs and help center:

- Cowork uses the same agentic architecture as `Claude Code`, but exposed inside `Claude Desktop`.
- It is task-mode oriented, not just turn-by-turn chat.
- Claude plans work, breaks it into subtasks, and coordinates parallel workstreams.
- It can read, edit, and create files in explicitly shared local folders.
- It runs tasks in an isolated VM environment while still being able to affect local files you authorize.
- It supports scheduled tasks.
- It supports plugins that bundle skills, connectors, slash commands, and sub-agents.
- It exposes progress and reasoning while work is running.
- It requires explicit approval before permanent file deletion.
- It requires the desktop app to stay open while tasks run.
- It stores history locally and Anthropic states Cowork activity is not captured in Audit Logs, Compliance API, or Data Exports.

## What Cowork Proves

Cowork validates several core AGI Workforce product decisions:

1. `Desktop-native agent runtime` is a real product category.
2. `Task mode` is more important than chat-only UX.
3. `Folder-scoped local execution` matters for trust and usefulness.
4. `Visible planning and progress` are expected, not optional.
5. `Plugins / skills / connectors / sub-agents` are part of the product, not implementation detail.

## Where AGI Workforce Must Beat Cowork

Cowork is a strong benchmark, but AGI Workforce should not stop at feature parity.

### 1. Better transcript visibility

Cowork shows planning and progress, but AGI Workforce should make the transcript itself the full execution surface:

- reasoning inline
- tool/MCP/connector usage inline
- approvals inline
- results inline
- progress inline

The user should not need a side panel or detached inspector to understand what happened.

### 2. Stronger runtime unification

Cowork is desktop-specific. AGI Workforce should build one agent runtime that can also power:

- web
- mobile companion / approvals
- browser extension
- VS Code extension

Desktop remains the flagship runtime, but not the only surface.

### 3. Better model neutrality

Cowork is Anthropic-native. AGI Workforce should remain:

- model-agnostic
- provider-routable
- MCP-first
- connector-first

The desktop product should feel like one AI operating surface, not one vendor shell.

### 4. Better memory and continuity

Anthropic currently documents no cross-session memory for Cowork. AGI Workforce should outperform on:

- memory-backed assistance
- session continuity
- reusable workspace context
- project/folder-specific behavior

### 5. Better enterprise auditability

Anthropic explicitly warns that Cowork activity is not included in audit/compliance export surfaces. AGI Workforce should treat this as an opportunity:

- structured action log
- transcript-owned runtime activity
- approval history
- exportable execution trace
- stable governance surface

## Current AGI Workforce Desktop Position

The desktop stabilization work already completed gives AGI Workforce a better base for transcript-centric execution UX:

- reasoning is shown inline
- approvals are shown inline
- persisted runtime activity is shown inline
- tool/MCP/connector labels are moving toward decoded human-readable names
- sidecar runtime visibility is manual/secondary

This is the correct direction and should continue.

## Competitive Execution Plan

### Phase 1 — Match Cowork’s trust model

Desktop must be reliably task-safe before anything else.

Required:

- one canonical send path
- one canonical stream path
- one canonical approval path
- one canonical runtime activity model
- explicit deletion approval
- stable folder-scoped permissions
- inline visibility into what the agent is doing

Release blocker:

- if the user cannot tell what the agent is doing from the transcript, desktop is not ready

### Phase 2 — Match Cowork’s task-mode ergonomics

Desktop should feel like a task workspace, not only a chat window.

Required:

- explicit `Chat` vs `Task` posture in the desktop UX
- visible plan creation and plan updates
- long-running progress states that do not feel like a stuck spinner
- resumable tasks where possible
- stronger artifact/result grouping per task

### Phase 3 — Match Cowork’s extensibility packaging

Desktop should present extensibility as product surface, not scattered settings.

Required:

- first-class `Customize` surface for:
  - skills
  - connectors
  - MCP servers
  - plugins / bundles
  - slash commands
  - sub-agents
- transcript-visible attribution of which plugin / skill / connector was used

### Phase 4 — Beat Cowork on cross-surface continuity

Required:

- task continuity between desktop and web
- mobile approval / monitoring for desktop tasks
- shared memory and workspace context across surfaces
- shared runtime contracts between desktop and other clients

### Phase 5 — Beat Cowork on auditability

Required:

- exportable activity trail
- transcript-owned action history
- approval traceability
- structured execution metadata for enterprise visibility

## Immediate Desktop Build Order

This is the recommended order for implementation work in the current repo.

### Tranche A — Runtime normalization

Goal: eliminate split sources of truth in the desktop runtime.

Do next:

1. finish moving repeated event shaping into shared helpers
2. introduce one normalized per-message activity mapper
3. make both `useTauriStreamListeners.ts` and `useAgenticEvents.ts` feed that mapper
4. keep chat transcript as the primary render surface

### Tranche B — Task-mode UX

Goal: make the desktop app feel like Cowork-class task execution, not chat with tool traces.

Do next:

1. explicit task session state in the chat shell
2. clearer plan/progress header per active task
3. durable task completion summary
4. stronger grouping of reasoning, actions, approvals, and results per task run

### Tranche C — Permissions and governance

Goal: make local execution trustworthy.

Do next:

1. folder access review UX
2. deletion approval hardening
3. clearer connector/MCP permission visibility
4. exportable execution history

### Tranche D — Packaging and customization

Goal: compete with Cowork plugins and customization surfaces.

Do next:

1. unify skills/connectors/MCP/plugins into one desktop customization entry point
2. show which package contributed which command/tool/action
3. keep transcript attribution inline

## Non-Goals

Do not chase Cowork parity by adding more raw surface area before runtime stability exists.

Specifically avoid:

- side-panel-first execution UX
- duplicate listener systems
- duplicate send/runtime implementations
- plugin surfaces that do not expose runtime attribution inline

## Release Questions

Desktop is not Cowork-competitive until the answers below are all `yes`:

1. Can the user run a real multi-step task from the desktop app without the transcript becoming opaque?
2. Can the user see the plan, reasoning, tools, approvals, and results inline?
3. Can the user understand exactly which connector / MCP / tool executed?
4. Can the user trust folder access and destructive-action approvals?
5. Can the desktop runtime serve as the core agent surface for the rest of the suite?

## Official Benchmark Sources

- https://claude.com/docs/cowork
- https://support.claude.com/en/articles/13345190-get-started-with-cowork
- https://claude.com/blog/cowork-research-preview
- https://support.claude.com/en/articles/13837440-use-plugins-in-cowork
- https://claude.com/product/cowork
