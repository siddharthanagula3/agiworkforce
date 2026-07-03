# AGI CLI — Volume 17 — Performance

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: Grounded in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/cli/AGENTS.md`, and these real repo paths — `Cargo.toml` (`[profile.release]`), `apps/cli/Cargo.toml`, `apps/cli/src/models/{streaming.rs,sse_decoder.rs,mod.rs}`, `apps/cli/src/compaction.rs`, `apps/cli/src/context.rs`, `apps/cli/src/subagent.rs`, `apps/cli/src/subagent_v2.rs`, `apps/cli/src/teams.rs`, and `apps/cli/src/agent/mod.rs`.

## Overview & stance

AGI CLI is a pure-Rust (Ratatui) developer surface, and its performance edge is deliberate: no garbage collector, no runtime, a size-optimized native binary, and a workspace/session-scoped execution model that keeps hot paths on the host. Performance work must never bend a trust boundary. `apps/cli/src/agent/mod.rs` enforces `PrivacyMode::{Local, Byok, Managed}` and `validate_privacy_boundary()`; a Local session's context building, compaction, indexing, and parallel work stay on-device and are never offloaded to BYOK or Managed Cloud as an "optimization." CLI sessions do not ride Neon delta-sync (that path is Web↔Mobile↔Desktop, Managed-Cloud chats only), so there is no background sync tax on throughput. This volume sets testable requirements and labels each capability Built / Partial / Planned. Examples use the `agi` binary.

## Startup time

The release build is tuned for a small, fast-loading native binary. **✅ Built** — root `Cargo.toml` `[profile.release]` sets `codegen-units = 1`, `lto = true`, `opt-level = "z"` (size-optimized), `strip = true`, and `panic = "abort"`, trading compile time for a lean stripped binary. Historical binary/compile-weight work is real: `apps/cli/AGENTS.md` records removal of a ~370-file / ~108K-LOC orphan tree (commit `e3a316d39`) never compiled into the surface.

Requirements: cold start MUST do only the work a turn needs — `AgentSession::new` already loads memory, discovers skills, and captures a shell snapshot eagerly, so any _new_ startup cost must be lazy or measured. A published startup-time budget and benchmark harness (first-prompt latency percentiles) are **🔭 Planned** — do not claim a startup SLO without a measured target in the repo.

## Memory usage

Working-set growth is bounded at the context layer rather than by a global allocator budget. **✅ Built** — `apps/cli/src/agent/mod.rs` caps context attachment at `MAX_TOTAL_CHARS` (120,000) and `MAX_PER_FILE_CHARS` (40,000), and `apps/cli/src/compaction.rs` prunes/truncates tool output and old messages against a token budget (`BYTES_PER_TOKEN = 4`, `RECENT_WINDOW_TOKENS = 50,000`). Rust ownership plus `panic = "abort"` removes GC pause and unwind-table overhead.

Requirements: message history and tool output MUST NOT grow unbounded within a session — compaction is the backstop. A per-process resident-memory budget with regression guards is **🟡 Partial** (bounding caps exist; no RSS ceiling or leak-detection harness); the memory-budget SLO is **🔭 Planned**.

## CPU usage

CLI work is I/O-bound (provider streams, file/process syscalls), so CPU is spent decoding and orchestrating, not spinning. **✅ Built** — the async runtime is Tokio (`apps/cli/Cargo.toml`), streaming consumes chunks incrementally rather than re-parsing whole buffers (see Streaming), and per-turn tool-schema payload is trimmed by `effective_tool_definitions()` in `apps/cli/src/agent/mod.rs` (deferred/allowed/disallowed filtering) so the model isn't handed the full catalog every turn. The crate denies dead code and unused symbols (`apps/cli/Cargo.toml` `[lints.rust]`).

Requirements: no busy-wait loops; blocking work stays off the async executor. A CPU-profiling gate and budget are **🔭 Planned**.

## Streaming performance

Token streaming is a first-class, correctness-critical hot path. **✅ Built** — `apps/cli/src/models/streaming.rs` reads provider SSE off the wire and pushes deltas through `StreamCallback` (`apps/cli/src/models/mod.rs`). `apps/cli/src/models/sse_decoder.rs` implements `Utf8StreamDecoder`, which retains an incomplete trailing multibyte codepoint across chunk boundaries and emits only valid UTF-8 — avoiding the `from_utf8_lossy`-per-chunk corruption (`�`) that splits emoji/CJK on TCP boundaries. `STREAM_IDLE_TIMEOUT` (300s) bounds a stalled stream instead of hanging forever.

Requirements: first-token latency and inter-token cadence MUST be dominated by provider round-trip, not local buffering; the decoder MUST never emit replacement characters for split codepoints; idle streams MUST abort on the timeout with an actionable error.

## Context building

Context assembly and compaction are the largest local compute cost per turn. **✅ Built** — `apps/cli/src/agent/mod.rs` assembles the system prompt from instructions, discovered skills, layered memory, and rules once at session start; `apps/cli/src/compaction.rs` runs a multi-phase strategy (reverse token-budget on tool outputs, 30/70 history split, prune, truncate, remove, select) with `CONTEXT_WARN_THRESHOLD = 0.85` and auto-compaction at 0.90 of the model's window (`DEFAULT_CONTEXT_LIMIT = 128,000` when uncatalogued; `MAX_INSTRUCTION_TOKENS = 10,000`).

Requirements: token estimation MUST be cheap (byte-ratio heuristic is acceptable) and compaction MUST preserve the most recent window. Context building for a Local session MUST stay on-device — never resolve or summarize context via a hosted call. Model context limits MUST come from catalog metadata, never hardcoded per model.

## Parallel operations

Fan-out is bounded and concurrency-safe. **✅ Built** — `apps/cli/src/subagent.rs` runs Task-tool subagents with `DEFAULT_MAX_CONCURRENT = 7`, each on a dedicated thread with its own runtime (sidestepping the `Send` constraint of `tokio::spawn`) for true parallelism; `apps/cli/src/subagent_v2.rs` uses `tokio::spawn` join handles; `apps/cli/src/teams.rs` coordinates teammates. The cap returns an actionable "maximum concurrent subagents reached" error rather than oversubscribing.

Requirements: the concurrency ceiling MUST be enforced and surfaced; each worker MUST inherit the parent's trust mode and approval policy — a Local parent MUST NOT spawn a BYOK/Managed child — and workers MUST NOT interleave writes that corrupt session state.

## Large repositories

Cost on big trees is bounded by hard result caps and workspace confinement, not by scanning everything. **🟡 Partial** — search tools cap output (`glob` at `MAX_GLOB_RESULTS = 1,000`; ripgrep `--max-count=100` and a 50 KB read cap; command output truncated with save-to-file) and refuse to escape the resolved roots (Volume 13; `apps/cli/src/features/exec/tools/dir_ops`). The gap: no persistent code index — every search re-scans — so an incremental/on-disk index is **🔭 Planned**.

Requirements: no full-tree read into context; results cap deterministically; a Local session's scans never leave the host.

## Monorepo optimization

The CLI detects monorepo topology and feeds it into context, but does not yet scope work per package. **🟡 Partial** — `apps/cli/src/context.rs` `detect_monorepo_type` recognizes pnpm workspaces, lerna, nx, turbo, and rush, and `detect_package_manager` reads the lockfile (pnpm/yarn/npm/bun/cargo/go/pipenv/poetry); this topology is injected into system context. The gap: build-graph awareness, per-package scoping of search/edits, and affected-package targeting are **🔭 Planned**.

Requirements: detection MUST be marker-based and cheap (no recursive crawl at startup); planned per-package scoping MUST keep cost proportional to the touched package, not the whole monorepo.

## Repository map

- `Cargo.toml` — `[profile.release]` (LTO, `opt-level = "z"`, strip, `panic = abort`); `apps/cli/Cargo.toml` — Tokio runtime, deny-dead-code lints.
- `apps/cli/src/models/{streaming.rs,sse_decoder.rs,mod.rs}` — streaming path, `Utf8StreamDecoder`, `STREAM_IDLE_TIMEOUT`, `StreamCallback`.
- `apps/cli/src/compaction.rs` — token estimation, multi-phase compaction; `apps/cli/src/context.rs` — monorepo/package-manager detection.
- `apps/cli/src/{subagent.rs,subagent_v2.rs,teams.rs}` — parallel/team execution and concurrency cap.
- `apps/cli/src/agent/mod.rs` — `PrivacyMode`, context assembly, attach caps, `effective_tool_definitions`; `apps/cli/AGENTS.md` — orphan-tree removal history.

## Competitor notes

Claude Code and Codex CLI are Node/TypeScript agents whose startup and steady-state cost carry a runtime and a GC. AGI's deliberate divergence is a native Rust binary (no runtime, no GC, size-optimized release profile) with the same streaming/compaction/parallel-agent capabilities, plus **multi-provider** reach so streaming performance is measured across many backends, not one. AGI keeps context building, compaction, and large-repo scans **on-host and per-surface trust-scoped** — a Local session gets local-first performance with zero cloud dependency, and BYOK adds no markup. Remote control of a running CLI session from a phone/web window is **🔭 Planned** (parity with Claude Code Remote Control and Codex remote connections): a window over a session that keeps executing locally, not a performance offload.

## Acceptance / Definition of Done

Performance is production-ready when every subsection is shipped with the cited path or labeled Planned, streaming never corrupts split codepoints, context stays bounded by compaction, parallel work respects the concurrency cap and trust inheritance, and no optimization crosses a boundary.

- [ ] Build: `cargo test -p agiworkforce-cli --lib` green; release built with `[profile.release]`; streaming, compaction, and subagent tests pass.
- [ ] Trust: Local-session context building, compaction, search, and parallel workers stay on-device; no subagent escalates to BYOK/Managed; CLI sessions never enter Neon delta-sync.
- [ ] Security: `STREAM_IDLE_TIMEOUT` aborts stalled streams; search/glob caps and workspace confinement hold on large repos; no unbounded memory growth per session.

## Anti-patterns

- Offloading context building, compaction, indexing, or search to BYOK/Managed Cloud as an "optimization," or syncing CLI sessions to Neon.
- Letting a Local parent spawn a BYOK/Managed subagent, or ignoring `DEFAULT_MAX_CONCURRENT`.
- Per-chunk `from_utf8_lossy` decoding that corrupts split multibyte codepoints; removing the stream idle timeout.
- Claiming a startup SLO, RSS budget, CPU budget, or code index with no measured target or implementation in the repo — mark them 🔭.
- Hardcoding a model's context window instead of reading catalog metadata; inventing model IDs, routes, env vars, or INR prices; referencing Supabase; using removed tiers (Plus/Hobby/pro_plus) or credit top-ups.
- Writing user examples as `agiworkforce <cmd>` — always use the `agi` binary.
