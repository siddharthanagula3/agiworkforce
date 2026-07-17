# AGI CLI — Volume 19 — AI Runtime

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/cli/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `docs/surfaces/cli.md`. Grounded in `apps/cli/src/agent/{mod,chat,executor,prompt}.rs`, `apps/cli/src/routing/{fallback,strategy}.rs`, `apps/cli/src/models/{streaming,sse_decoder,provider_dispatch,mod}.rs`, `apps/cli/src/{errors,compaction,cost_ledger,sandbox,hooks}.rs`, `apps/cli/src/platform/runtime/{tool_catalog,session_control}.rs`, `crates/agiworkforce-app-server/src/lib.rs`, and model IDs from `packages/contracts/types/src/models.json`.

## Overview & stance

This volume specifies the AGI CLI **inference engine**: how a turn goes from a user message to a streamed, tool-augmented model response and back. The CLI is the pure-Rust surface with the widest trust exposure — Local + BYOK + Managed Cloud — so the runtime's first duty is boundary enforcement, not throughput. Every turn passes through `AgentSession::validate_privacy_boundary` (`apps/cli/src/agent/mod.rs`) before any bytes leave the process; a `PrivacyMode::Local` session with a non-local provider fails closed. Sessions are workspace/session-scoped: the runtime never auto-syncs a turn to app chat, and Local→BYOK is an explicit, consented fork. Model IDs come from `packages/contracts/types/src/models.json` and the catalog — never hardcoded.

## Conversation Context

The turn buffer is `AgentSession.messages` with the system prompt pinned at index 0 (`apps/cli/src/agent/mod.rs`). ✅ Built. Context is enriched without spending a user turn via `add_context_dir` (registers an extra workspace root + directory instructions) and `attach_context_files` (budgeted at 120 000 chars total / 40 000 per file, truncation reported). Managed-session persistence rehydrates `messages`, `permission_mode`, `plan_mode`, and the fallback chain from disk (`platform/runtime/session_control.rs`). Requirement: injected blocks are XML-fenced with an escaped `path`; attachment budgets are enforced and truncation surfaced, never silent.

## Prompt Assembly

`prompt::build_system_prompt` / `assemble_system_prompt` (`apps/cli/src/agent/prompt.rs`) compose the system message from `SystemContext`, an optional custom prompt, project instruction files, discovered skills, memory, and rules. ✅ Built. Two hardening steps are mandatory and present: (1) `neutralize_instruction_markers` defuses injected `system:`/`developer:`/"ignore previous instructions" lines in untrusted content, and (2) the `LLM_FAILURE_PREVENTION_CONTRACT` enforces the no-invented-APIs / fail-closed / no-silent-Local→BYOK contract in-band. Output-style and `/add-dir` context mutate the pinned system message in place. Requirement: assembly is deterministic given identical inputs and re-runnable via `BeforePromptBuild` without duplicating memory or skills.

## Model Routing

Routing today is the explicit `FallbackChain` (`apps/cli/src/routing/fallback.rs`, ✅ Built): a comma-separated `--model`/config list where `should_rotate` classifies errors (`RateLimit`, `Transient` = rate-limit + network + 5xx, or `Any`) to decide rotation. `switch_model` (`agent/mod.rs`) re-detects the provider — including runtime OpenRouter BYOK models — and re-adopts the privacy mode, refusing unknown IDs. The composable, cost/complexity-aware `CompositeRouter` (`apps/cli/src/routing/strategy.rs`) is 🟡 Partial — the chain-of-responsibility strategies exist but carry a `PHASE2` marker and are not yet wired into `AgentSession`. Requirement: routing never crosses a trust boundary; a rotation that changes provider must re-run `validate_privacy_boundary`.

## Inference Pipeline

A turn resolves provider via `models::resolve_selected_provider` (fail-closed for unknown hosted IDs) in `AgentSession::new_checked`, assembles the prompt, runs `BeforeModelResolve`, then calls `models::stream_completion` with the effective tool definitions and, for Anthropic, `thinking_budget_tokens` (`apps/cli/src/agent/chat.rs`). ✅ Built. Provider dispatch lives in `apps/cli/src/models/provider_dispatch.rs`. Requirement: one code path serves exec, REPL, TUI, and app-server so behavior is identical; token accounting (input, cache-read/creation, reasoning) accumulates on `AgentSession` every turn.

## Streaming

Streaming is SSE-decoded in `apps/cli/src/models/sse_decoder.rs` and assembled in `apps/cli/src/models/streaming.rs`. ✅ Built. The CLI exposes a json-events-aware chunk callback (`agent/chat.rs`): when `json_events` is set, all chunks — including continuation, retry, and fallback turns — emit `MessageDelta` JSONL with `json_session_id`; otherwise text prints incrementally. TUI surfaces additionally receive tool-lifecycle events via `ToolEventSink`. Requirement: partial output is preserved on cancellation and mid-stream cancels are reconciled into history (see Error Recovery), so a resumed session never has a dangling assistant turn.

## Tool Calling

The tool catalog is built by `platform/runtime/tool_catalog.rs` and filtered per turn by `AgentSession::effective_tool_definitions` (allow/deny lists, team tools, MCP tools, and a plan-mode lock that hides mutating tools until a plan is approved). ✅ Built. Model tool-use blocks become `executor::ToolCall` (`apps/cli/src/agent/executor.rs`); `PreToolUse` hooks can rewrite args, block, or stop before execution. AGI can also _be_ a full local agent host through the typed stdio/WebSocket developer session in `crates/agiworkforce-app-server`. Reverse MCP execution is not yet wired: `agi mcp-server` advertises an empty catalog. Requirement: unknown tools and schema-invalid args are rejected, not guessed; tool results are untrusted data, never instructions.

## Planning

Plan mode is `permission_mode = Plan` plus the `update_plan` tool handled by `AgentSession::handle_update_plan` (`agent/mod.rs`). ✅ Built. Plans persist to disk keyed by session ID; while a plan is unapproved, mutating tools stay locked (`effective_tool_definitions`) and the model is told to await approval. `auto_approve_plan` and `plan_rejection_feedback` gate the approve/revise loop; `reset_plan_state` clears all four plan fields on `clear()`. Requirement: no mutating tool executes before `plan_approved` unless auto-approval was explicitly enabled.

## Execution

Approved tool calls execute through the executor with safety gating: `apps/cli/src/safety/{approval,dangerous_commands}.rs` classify risk, and destructive/privileged actions require approval via `ToolApprovalSink`. Shell execution is sandboxed by `apps/cli/src/sandbox.rs` — macOS Seatbelt and Linux bwrap are ✅ Built; Windows and Linux-without-bwrap currently fall through and are 🟡 Partial (tracked hard-refuse gap, V5 §17 risk #10). Repeated identical calls are caught by `detect_content_loop` / `loop_strike_count` (`agent/executor.rs`, threshold 5). Requirement: no production panics; failures return typed, user-actionable errors.

## Retry Logic

`CliError` classifies transient failures and computes backoff in `apps/cli/src/errors.rs`. ✅ Built. `is_retryable` covers `RateLimited`, `Network`, `Api` status in {429, 500, 502, 503, 504}, and retryable `StreamError`. `retry_delay` honors a provider `Retry-After` hint; `retry_delay_with_backoff` applies exponential backoff (base ×2^(n−1)) capped at `MAX_BACKOFF_MS` = 30 000. Requirement: hard errors (auth, invalid payload, config) surface immediately and never retry; retries respect the original call's trust boundary.

## Error Recovery

Recovery layers on top of retries: on a classified transient error the `FallbackChain` rotates to the next model and fires the `FallbackSink` callback so the rotation is visible (`agent/mod.rs`, `routing/fallback.rs`, ✅ Built). Context/token overflow is detected by `CliError::is_context_overflow` and recovered by compaction (see below) rather than a hard failure. Cancelled-mid-stream turns are reconciled back into history so the buffer stays valid (`agent/chat.rs`). Requirement: every recovery path is observable and leaves `messages` resendable.

## Cost Optimization

The runtime tracks spend in `AgentSession.cost_ledger` (`apps/cli/src/cost_ledger.rs`, ✅ Built) and enforces a hard stop via `max_budget_usd` + `BudgetSink` when cumulative spend exceeds the cap. Auto-compaction reduces token pressure: `chat.rs` triggers `compaction::compact_messages` when `context_usage` crosses ~90% (warn at `CONTEXT_WARN_THRESHOLD` = 0.85), shrinking toward a lower target while keeping recent turns. Prompt-cache read/creation tokens are accounted separately. Cost-aware _routing_ (`CostStrategy` in `routing/strategy.rs`) is 🟡 Partial (PHASE2, not wired). Remote control of a running CLI session from phone/web — steering, approving, or watching cost from a paired device — is 🔭 Planned (parity with Claude Code Remote Control / Codex remote connections; compute stays on the host, outbound-only, QR + HMAC, approval-gated).

## Repository map

- `apps/cli/src/agent/{mod,chat,executor,prompt,history,tools}.rs` — session, turn loop, executor, prompt assembly.
- `apps/cli/src/routing/{fallback,strategy}.rs` — fallback chain (✅) and composable router (🟡).
- `apps/cli/src/models/{mod,streaming,sse_decoder,provider_dispatch,serialization}.rs` — inference + streaming.
- `apps/cli/src/{errors,compaction,cost_ledger,sandbox,hooks}.rs` — retry/backoff, context, cost, execution safety, hook events.
- `apps/cli/src/safety/{approval,dangerous_commands}.rs` — approval + risk classification.
- `apps/cli/src/platform/runtime/{tool_catalog,session_control}.rs` — tool catalog, managed sessions.
- `crates/agiworkforce-app-server/src/lib.rs` — JSON-RPC/WS tool host.
- `packages/contracts/types/src/models.json` — model-ID + capability SSOT.

## Competitor notes

Claude Code and Codex run a single-vendor runtime (Anthropic / OpenAI) with cloud-run sessions as a first-class path. AGI CLI diverges deliberately: (1) **multi-provider** routing over an OpenAI-compatible client with a user-authored `FallbackChain` that rotates on rate-limit cliffs instead of ending the turn; (2) **BYOK where allowed** (CLI is one of three BYOK surfaces) with no markup; (3) **per-surface trust** with a runtime privacy boundary that blocks Local→cloud leakage by construction; (4) **local-first** — one pipeline drives on-device and hosted models. Remote control is a _window_ over a locally running session, not a cloud handoff.

## Acceptance / Definition of Done

- [ ] **Build:** exec, REPL, TUI, and app-server share one turn pipeline; token/cost accounting matches across entry points; `cargo test -p agiworkforce-cli --lib` passes for routing, compaction, retry, and privacy-boundary tests.
- [ ] **Trust:** a `PrivacyMode::Local` session fails closed on any non-local provider and on any fallback rotation that changes provider; Local→BYOK requires an explicit consented handoff; no turn auto-syncs to app chat.
- [ ] **Security:** tool args and results are schema-validated and treated as untrusted; mutating tools are locked until a plan is approved; destructive actions require approval; sandbox gaps (Windows / no-bwrap) are hard-refused, not silently bypassed.

## Anti-patterns

- Routing or rotating a Local session to BYOK/Managed without re-validating the privacy boundary.
- Hardcoding a model ID anywhere in the runtime; read from `packages/contracts/types/src/models.json`.
- Retrying hard errors (auth, invalid payload) or ignoring `Retry-After` / backoff caps.
- Executing model/tool output as shell, SQL, or privileged action without approval gates.
- Claiming the `CompositeRouter`, cost-aware routing, or remote control as shipped — they are 🟡/🔭.
- Referencing Supabase, `middleware.ts`, removed tiers (Plus / Hobby / pro_plus), credit top-ups, or invented INR prices; use `agi …` in examples, never `agiworkforce …`.
