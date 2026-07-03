# AGI CLI — Volume 14 — Context Management

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/cli/AGENTS.md`. Grounded in real repo code: `apps/cli/src/context.rs`, `apps/cli/src/compaction.rs`, `apps/cli/src/agent/mod.rs`, `apps/cli/src/agent/chat.rs`, `apps/cli/src/repl/slash_commands.rs`, `apps/cli/src/repl/registry.rs`, `apps/cli/src/claude_parity.rs`, `apps/cli/src/path_security.rs`; model context windows via `apps/cli/src/model_catalog.rs` → `packages/types/src/models.json`.

## Overview & stance

Context management is how AGI CLI decides what the model sees on every turn: repository facts, the workspace roots it may touch, attached files, prior conversation, memory, and instruction files — all fitted inside a token budget. On this surface the discipline is shaped by two hard rules. First, sessions are **workspace/session-scoped**: gathered context lives in the local session and is never automatically synced to app chat or the Neon delta-sync path (`apps/web/app/api/{chat,memory,projects}/sync`); any handoff is explicit and redacted. Second, context assembly is **trust-mode aware**. `PrivacyMode::{Local, Byok, Managed}` (`apps/cli/src/agent/mod.rs`) gates whether assembled context may leave the device at all: a Local session blocks any provider that would route context off-device (`validate_privacy_boundary`), and Local→BYOK is an explicit, consented fork — never a silent redirect. Context management therefore is not just packing tokens; it is packing tokens under a trust boundary.

## Repository Context

✅ Built — `apps/cli/src/context.rs`. `gather_system_context()` builds a `SystemContext` from the cwd: git branch, a summarized `git status --short` (modified/added/deleted/untracked counts), the `origin` remote URL, project type + language (Rust/Node/Python/Go/Ruby/Java/dotnet/Elixir/Make), monorepo tool, package manager (from lockfiles), containerization, CI providers, and editor configs. It renders as an `<environment>` block injected into the system prompt. Requirements: detection is read-only and heuristic (marker files/lockfiles), must degrade to fewer lines when signals are absent, and must never shell out to network. `find_project_root` (`apps/cli/src/compaction.rs`, `ROOT_MARKERS`) locates the repo boundary by walking upward for `.git`/`Cargo.toml`/`package.json`/`go.mod`/`pyproject.toml`.

## Workspace Context

✅ Built — `apps/cli/src/agent/mod.rs` (`add_context_dir`) + `apps/cli/src/path_security.rs`. The session starts scoped to one workspace root; additional roots are **opt-in only** via `agi` `--add-dir` or the `/add-dir` slash command (`apps/cli/src/claude_parity.rs::handle_add_dir`), each canonicalized through `register_additional_workspace_root`. Adding a root loads its instruction lineage as an `<additional_directory_context>` message. Requirements: every tool file access must validate against the registered root set (`validate_workspace_path`) — no path traversal outside declared roots; roots are session-local and are not persisted to any cloud store. This is the CLI mirror of Claude Code `/add-dir`, kept workspace-scoped by design.

## File Context

✅ Built — `apps/cli/src/agent/mod.rs` (`attach_context_files`) + `/attach` (`apps/cli/src/claude_parity.rs`). Files are read into the session as `<attached_file path="…">` system blocks without sending a user turn. Hard caps: `MAX_TOTAL_CHARS = 120_000` across the batch and `MAX_PER_FILE_CHARS = 40_000` per file; over-cap files are truncated and flagged `truncated="true"`, and the report records added/skipped/failed/truncated. Requirements: paths are resolved through workspace validation (`resolve_context_file`), duplicates are skipped, and attachment metadata is surfaced so the user knows exactly what entered context. In Local mode attached files must not leave the device; a BYOK handoff must re-state that attached files are not implicitly carried over.

## Conversation Context

✅ Built — `apps/cli/src/agent/mod.rs`. The live transcript is `AgentSession.messages: Vec<Message>` beginning with one assembled system message (instructions + skills + memory + rules; `apps/cli/src/memory.rs`, `apps/cli/src/memory_pipeline.rs`). `/clear` truncates history to the system prompt and resets turn/plan/attachment state. Durable conversation is opt-in via `ManagedSession` persistence (`enable_managed_session`, `persist_managed_session`) written to local session storage — never auto-synced to app chat. `save_checkpoint`/`restore_checkpoint` snapshot message state for undo. Requirement: persistence and rehydration stay local and workspace-scoped; remote control of a running session (phone/web window) is 🔭 Planned and, when built, must keep the session running locally with outbound-only, approval-gated access.

## Token Budget

✅ Built — `apps/cli/src/compaction.rs`. Tokens are estimated with a `BYTES_PER_TOKEN = 4` heuristic (`estimate_tokens`, `message_tokens`, `block_tokens`; images use an 85-token base + base64/4). `context_usage()` returns used/limit/fraction and a `near_limit` flag. Separately, the session tracks _real_ provider-reported usage — `total_input_tokens`, `total_output_tokens`, `total_cache_read_tokens`, `total_cache_creation_tokens`, `total_reasoning_tokens` — plus a `CostLedger` and an optional `max_budget_usd` cap with a `BudgetSink` callback that stops the loop when cumulative USD spend is exceeded (`apps/cli/src/agent/mod.rs`). Requirement: the estimate drives compaction decisions; billing/limits must use provider-reported counts, never the 4-bytes heuristic.

## Context Prioritization

✅ Built — `apps/cli/src/compaction.rs`. Recency-weighted: `history_split` preserves the last `preserve_fraction = 0.30` of messages untouched (adjusted to a user-message boundary so no turn is orphaned) and only the older 70% is eligible for compression. `reverse_budget_tool_outputs` walks tool results newest-first, keeping recent outputs at full fidelity and truncating older ones to their last 30 lines once the `tool_output_budget = 50_000` is spent. `compact_with_focus` can prepend a focus hint so a named topic is prioritized. Requirement: the newest turn and the active plan/instructions must survive any prioritization pass.

## Context Compression

✅ Built — `apps/cli/src/compaction.rs` (`compact_with_config`) + `/compact` (`apps/cli/src/repl/registry.rs::handle_compact`). A six-phase pipeline runs in order, short-circuiting once the target fits: (1) reverse tool-output budget, (2) history split, (3) prune tool results over `max_prune_tokens = 1_000` to a head summary, (4) truncate text over `max_truncate_tokens = 500`, (5) drop tool-result blocks, (6) select the most recent messages that fit. It returns a `CompressionStatus` (`Unnecessary` / `TruncationOnly` / `Compressed` / `FailedInflated`). Critical invariant: `normalize_tool_pairs` repairs `tool_use`/`tool_result` pairing that compaction breaks — appending a synthetic aborted result for orphaned calls and dropping orphaned results — so history stays valid for native tool-use providers.

## Context Window Management

✅ Built — `apps/cli/src/agent/chat.rs` + `apps/cli/src/compaction.rs`. Per-model limits come from `context_limit()` → `model_catalog::context_window` → `packages/types/src/models.json` (never hardcoded here), with `DEFAULT_CONTEXT_LIMIT = 128_000` for unknown models. On each send, if usage exceeds 90% the loop auto-compacts to 70% of the limit, firing `PreCompact`/`PostCompact` hooks and printing `format_context_report` (`Context: [####…] NN% (xK / yK tokens)`); at `CONTEXT_WARN_THRESHOLD = 0.85` it warns without compacting. `/context` (`/ctx`) prints the live report on demand. 🟡 Partial: `CompressionConfig.auto_trigger_fraction` (0.90) is a config field but the send loop currently uses a hardcoded `0.90`; the two should be unified so the threshold is configurable, not duplicated.

## Repository map

- `apps/cli/src/context.rs` — repository/environment context gathering.
- `apps/cli/src/compaction.rs` — token estimation, usage, compaction pipeline, instruction/root loading.
- `apps/cli/src/agent/mod.rs` — session state, privacy modes, add-dir, attach-files, managed persistence, token/cost counters.
- `apps/cli/src/agent/chat.rs` — per-turn auto-compaction and warnings.
- `apps/cli/src/repl/slash_commands.rs`, `apps/cli/src/repl/registry.rs`, `apps/cli/src/claude_parity.rs` — `/context`, `/compact`, `/clear`, `/memory`, `/add-dir`, `/attach`, `/privacy-mode`.
- `apps/cli/src/path_security.rs` — workspace-root validation.
- `apps/cli/src/memory.rs`, `apps/cli/src/memory_pipeline.rs` — memory/rules injected into the system prompt.
- `packages/types/src/models.json` — SSOT for per-model context windows.

## Competitor notes

Claude Code and Codex CLI both auto-compact near the window limit and inject repo/environment context; Codex QR-pairs a phone to steer a host. AGI CLI matches the compaction and `/add-dir`/`/attach` ergonomics but diverges deliberately: (1) context assembly is **multi-provider and BYOK-capable** (Desktop/CLI/VS Code only), so per-model limits are read from `models.json`, not tied to one vendor; (2) a **trust boundary** gates whether assembled context may leave the device — Local sessions block off-device routing and require an explicit consented BYOK fork; (3) context is **local-first and workspace-scoped** with no automatic cloud sync. Remote control of a running session is a 🔭 parity target, not a data-to-cloud move.

## Acceptance / Definition of Done

Production-ready when repository/workspace/file/conversation context assembles deterministically, compaction preserves valid tool pairing and recent turns, budgets use real provider counts for billing, and no context crosses a trust boundary without consent.

- [ ] Build: `cargo test -p agiworkforce-cli --lib` passes for `compaction`, `context`, and `agent` modules; `/context`, `/compact`, `/add-dir`, `/attach`, `/clear` behave per spec.
- [ ] Trust: a Local session blocks off-device providers (`validate_privacy_boundary`); attached files and gathered repo context never auto-sync to app chat or Neon; Local→BYOK requires explicit consent with a visible provider label.
- [ ] Security: all file/dir context is validated against registered workspace roots (no traversal); compaction never emits orphaned `tool_use`/`tool_result` blocks; budget caps halt runaway spend.

## Anti-patterns

- Silently routing Local repo/file/conversation context to BYOK or Managed Cloud, or auto-syncing CLI context to app chat.
- Hardcoding a model's context window instead of reading `packages/types/src/models.json`; inventing model IDs.
- Using the 4-bytes/token estimate for billing instead of provider-reported counts.
- Compacting in a way that orphans tool calls (skipping `normalize_tool_pairs`) or discards the newest turn/active plan.
- Reading files or directories outside registered workspace roots.
- Referencing removed tiers (Plus/Hobby/pro_plus), credit top-ups, `middleware.ts`, or Supabase.
- Using `agiworkforce <cmd>` in examples — user-facing commands are always `agi`.
