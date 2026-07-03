# AGI Runtime — Volume 06 — Planning Engine

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: grounds in `AGENTS.md`, `services/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and the real runtime paths it documents: `crates/agiworkforce-task-runtime/src/lib.rs`, `crates/agiworkforce-plugin-runtime/src/lib.rs`, `crates/agiworkforce-protocol/src/models.rs`, `services/signaling-server/src/index.ts`, `apps/mobile/services/companion.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/web/app/api/{chat,memory,projects}/sync/route.ts`, `apps/web/app/api/control-plane/status/route.ts`. Model IDs, where referenced, come only from `packages/types/src/models.json`.

## Overview & stance

The Planning Engine turns a user objective into an ordered, dependency-aware set of executable steps, then keeps that plan honest as reality diverges. It is **internal plumbing** shared by the six surfaces — not a seventh app. It sits above the task lifecycle registry (`crates/agiworkforce-task-runtime/src/lib.rs`) and below whatever surface renders the plan (Desktop task view, CLI TUI, Mobile companion).

Trust modes shape it hard. A plan carries a **trust label per step**, inherited from the session that produced it. Local plans execute on-device and never silently spawn a BYOK or Managed-Cloud step; any such step is an explicit Local→BYOK fork (context selection, secret scan, payload preview, visible provider label, consent). BYOK planning exists only on Desktop, CLI, and VS Code — never on Web or Mobile. Managed-Cloud plans stay a distinct boundary. Under Remote Control the planner runs **on the host**; a paired phone/web client only observes and approves steps — planning compute does not move to the cloud.

Honesty note: today the runtime has a task **lifecycle** substrate but no first-class planner. Most of this volume is therefore 🔭 Planned, anchored to the real primitives below.

## Goal Analysis — interpret user objectives

The planner must convert a free-text objective into a typed plan: ordered steps, each with a `TaskKind`, a trust label, required tools/permissions, and success criteria. Analysis must (a) classify the objective's trust ceiling from the originating session, (b) refuse cross-boundary steps without an explicit fork, and (c) select the reasoning model only from `packages/types/src/models.json` — never a hardcoded ID.

- 🟡 Partial: task typing exists — `TaskKind` (`LocalShell`, `LocalAgent`, `RemoteAgent`, `InProcessTeammate`, `LocalWorkflow`, `MonitorMcp`, `Dream`) in `crates/agiworkforce-task-runtime/src/lib.rs`. Objectives can become typed tasks, but no code parses an objective into a multi-step plan.
- 🔭 Planned: goal-to-plan decomposition, trust-ceiling classifier, per-step success criteria. No planner module exists.

## Task Graphs — dependency graphs

Plans are DAGs, not flat lists: each step declares upstream dependencies; the scheduler runs a topological order, parallelizing independent branches up to a tier-gated concurrency cap (Free lowest; Basic $8/₹399, Pro $20, Max $100 and $200, Enterprise higher — no top-ups). Cycles are rejected at build time. Cross-surface fan-out travels the control channel, never a hidden cloud hop.

- 🟡 Partial: dependency **declaration** exists for plugins — `dependencies: Vec<String>` (cross-plugin, `name@marketplace` shorthand) in `crates/agiworkforce-plugin-runtime/src/lib.rs`. This is a declaration shape, not a task-graph scheduler, and there is no topological resolver or cycle check for tasks.
- 🔭 Planned: task-level DAG type, edge validation, cycle rejection, concurrency-capped topological scheduler.

## Milestones — execution checkpoints

A milestone is a named checkpoint that gates progression: the plan cannot advance past it until its member steps reach terminal-success. Milestones are the natural human-in-the-loop points — under Remote Control a milestone boundary raises an `approval_request` to the paired client and blocks until `approval_response`, session still local.

- ✅ Built: the per-task state machine that milestones would gate — `TaskStatus` (`Pending`, `Running`, `Completed`, `Failed`, `Stopped`) with enforced `valid_transition` in `crates/agiworkforce-task-runtime/src/lib.rs`. A milestone can read these states.
- 🟡 Partial: the approval transport exists — `approval_request` / `approval_response` verbs in `services/signaling-server/src/index.ts` (offline queueing supported).
- 🔭 Planned: the milestone type, member-step aggregation, and the gate that pauses the scheduler.

## Plan Revision — adapt plans dynamically

Plans are living: new information (a failed probe, unexpected tool output, a user edit) triggers revision — insert, remove, reorder, or re-scope steps — without discarding completed work. Every revision is versioned and diffable so a Remote-Control client can review the delta. Revision must never **upgrade** a step's trust mode silently; raising a Local step to BYOK/Cloud is a fork requiring consent.

- 🟡 Partial: revised plans persist over cross-device delta-sync — the cursor + tombstone + idempotent-upsert APIs in `apps/web/app/api/{chat,memory,projects}/sync/route.ts` carry Managed-Cloud plan state Web↔Mobile↔Desktop. Local/BYOK plan rows never sync.
- 🔭 Planned: the plan-diff/versioning model, re-decomposition trigger, and consent gate on trust-mode changes. No revision code exists.

## Failure Recovery — re-plan failed steps

When a step fails, the engine must classify it (transient vs. deterministic), retry with backoff where safe and idempotent, and otherwise re-plan the affected sub-graph rather than abort the whole plan. Recovery must respect trust: a failed Local step is retried locally, never rerouted to Cloud. Cancellation is first-class and must stop in-flight work cleanly.

- ✅ Built: failure detection substrate — `TaskStatus::Failed` with error capture, and `StallWatchdog` (marks a stalled task `Failed` with `"stall timeout"`) in `crates/agiworkforce-task-runtime/src/lib.rs`. `cancel` is a wired control verb in `services/signaling-server/src/index.ts`.
- 🟡 Partial: `Failed` is a **terminal** state in the current machine (no `Failed → Running`); retry today means creating a fresh task, not resuming.
- 🔭 Planned: failure classification, backoff/retry policy, idempotency guards, sub-graph re-planning.

## Progress Tracking — measure completion

Completion is measured from the graph: percent-complete = terminal-success steps over total, weighted by milestone. Progress streams to the originating surface and, under Remote Control, mirrors to the paired window via heartbeats. Cross-surface presence (which surface runs which plan) is a separate concern and not yet real.

- ✅ Built: per-task progress primitives — `append_output` / `read_output` (tailable step logs) and terminal timestamps in `crates/agiworkforce-task-runtime/src/lib.rs`; streaming status enums (`LocalShellStatus` = `Completed` / `InProgress` / `Incomplete`) in `crates/agiworkforce-protocol/src/models.rs`.
- 🟡 Partial: liveness transport exists — `heartbeat` / `heartbeat_ack` in `services/signaling-server/src/index.ts`; the Mobile companion emits `dispatch_request` and pings via `apps/mobile/services/companion.ts`, but both `companion` and `dispatch` are `false` in `apps/mobile/lib/v1FeatureFlags.ts`, so mobile progress mirroring is dark.
- 🔭 Planned: graph-level percent-complete aggregation and cross-surface presence — `apps/web/app/api/control-plane/status/route.ts` hard-codes surface status `unknown` and the `surface_heartbeats` table does not exist.

## Repository map

- `crates/agiworkforce-task-runtime/src/lib.rs` — task lifecycle registry, state machine, stall watchdog (execution substrate).
- `crates/agiworkforce-plugin-runtime/src/lib.rs` — cross-plugin dependency declarations.
- `crates/agiworkforce-protocol/src/models.rs` — status/streaming enums the planner emits.
- `crates/agiworkforce-app-server/src/lib.rs`, `crates/agiworkforce-command-registry/src/lib.rs`, `packages/runtime/src/state/AppStateStore.ts` — local tool host and shared runtime state.
- `services/signaling-server/src/index.ts` — control verbs (`dispatch_request/response`, `approval_request/response`, `sync_request/response`, `heartbeat`, `cancel`).
- `services/api-gateway/src/routes/{mobile,pair}.ts` — pairing-code issuance / pairing.
- `apps/mobile/services/companion.ts`, `apps/mobile/lib/v1FeatureFlags.ts` — mobile dispatch client (flagged off).
- `apps/web/app/api/{chat,memory,projects}/sync/route.ts` — Neon delta-sync for Managed-Cloud plan state.
- `apps/web/app/api/control-plane/status/route.ts` — presence stub (no backing table yet).

## Competitor notes

Claude Code, ChatGPT, and Codex bind planning to one provider and, increasingly, a cloud runtime. AGI diverges deliberately: the planner is **provider-agnostic** (model chosen from `packages/types/src/models.json`), **trust-partitioned** (per-step Local/BYOK/Cloud labels that cannot cross without an explicit fork), and **local-first** — under Remote Control the plan executes on the host exactly like Claude Code Remote Control and Codex remote connections, with the phone/web client as an approval window. BYOK planning is offered only where the canon allows it (Desktop, CLI, VS Code), never on Web or Mobile.

## Acceptance / Definition of Done

A production-ready Planning Engine decomposes an objective into a validated DAG, executes it with milestone gating, revises and recovers under failure, and reports graph-level progress — never crossing a trust boundary implicitly.

- [ ] Build: DAG type with cycle rejection; topological scheduler with tier-gated concurrency; milestone gate; plan-diff/versioning; failure classification + safe retry + sub-graph re-plan; graph percent-complete.
- [ ] Trust: every step carries a Local/BYOK/Cloud label; no revision or recovery upgrades a step's trust mode without an explicit fork (context selection, secret scan, payload preview, provider label, consent); Local/BYOK plan state never enters delta-sync.
- [ ] Security: milestone/high-risk steps require `approval_request` acknowledgement; `cancel` cleanly stops in-flight steps; Remote-Control plan control is QR + HMAC paired, outbound-only, and host-executed.

## Anti-patterns

- Claiming a "planner daemon" ships — it does not; cite `task-runtime` and label the rest 🔭.
- Silently routing a Local step to BYOK/Cloud during revision or recovery; skipping the fork consent flow.
- Syncing Local/BYOK plan rows through the delta-sync APIs, or moving Remote-Control planning compute to the cloud.
- Hardcoding a reasoning model ID instead of reading `packages/types/src/models.json`.
- Reintroducing removed tiers (`Plus`, `pro_plus`, `Hobby`) or inventing Pro/Max INR prices for concurrency gating; note `packages/runtime/src/state/AppStateStore.ts` still carries a legacy `hobby` `PlanTier` — 🟡 pending the separate billing-catalog reconciliation.
- Referencing Supabase (fully migrated to Clerk + Neon + Stripe) or renaming Next.js `proxy.ts` to `middleware.ts`.
- Treating `Failed` as recoverable in-place today (it is terminal) or presenting the flagged-off mobile companion as live progress mirroring.
