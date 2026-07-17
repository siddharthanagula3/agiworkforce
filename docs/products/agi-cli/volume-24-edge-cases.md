# AGI CLI — Volume 24 — Edge Cases

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (root), `apps/cli/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `docs/surfaces/cli.md`, `docs/cli/COMMAND_SURFACE.md`. Grounded in `apps/cli/src/{agent/mod.rs,errors.rs,routing/fallback.rs,compaction.rs,local_models.rs,doctor.rs,auth.rs,daemon.rs,repl/mod.rs,permissions.rs,path_security.rs}` and `crates/agiworkforce-app-server`.

## Overview & stance

AGI CLI is the pure-Rust (Ratatui TUI) developer surface with three trust modes: Local, BYOK, and Managed Cloud. Two rules never bend under failure: (1) the privacy boundary holds even when things break — a Local session is never silently re-routed to BYOK or Managed when a local provider dies (`apps/cli/src/agent/mod.rs` `validate_privacy_boundary`, `provider_privacy_mode`); (2) sessions are workspace/session-scoped — no failure path auto-syncs a CLI session to app chat. Every degradation must be legible: typed errors, a remediation, and an exit code — never a silent stub or fabricated success. `agi doctor` (`apps/cli/src/doctor.rs`) is the triage entry point.

## Offline

Fully offline operation is a first-class mode, not a failure. Local providers (Ollama / LM Studio / OpenAI-compatible on `localhost`/`127.*`/`[::1]`) are classified Local and keep running with no network (`apps/cli/src/agent/mod.rs` `is_local_provider_url`, `provider_privacy_mode`). ✅ Built — `PrivacyMode::from_arg` accepts `offline` as a Local alias. When offline, using a BYOK or Managed model must fail closed with a typed `CliError::Network` and a remediation to switch to a local model (`agi models scan`). 🟡 Partial — offline is inferred from request failure, not a proactive probe; `agi doctor` `transport_health_checks` report reachability but there is no "offline banner." Cloud-only features (Managed sync, web search) must degrade to a clear "unavailable offline" message. 🔭 Planned.

## Network Failure

Transient network errors are modeled as `CliError::Network { url, message }` and retryable `CliError::StreamError { is_retryable }` (`apps/cli/src/errors.rs`). ✅ Built. The fallback chain rotates the active model on network/server errors when configured `FallbackOn::All` (`apps/cli/src/routing/fallback.rs`), firing the `FallbackSink` so the TUI shows the rotation. ✅ Built. Requirements: transient failures retry before surfacing; a mid-stream disconnect is classified `stream_disconnect` and resumed or reported without corrupting the transcript; partial tool output is never committed as complete. 🟡 Partial — retry exists via fallback rotation, but per-request exponential backoff tuning is not centrally configurable.

## Authentication Failure

Auth errors are typed `CliError::Auth { provider, message }` (`apps/cli/src/errors.rs`). Token refresh distinguishes recoverable from terminal failure via `RefreshError` — an expired/revoked refresh token demands re-authentication, not a silent retry loop (`apps/cli/src/auth.rs`). ✅ Built. Tokens are always redacted via `redact_token` (first 8 + last 4). ✅ Built. `agi doctor` `auth_checks` reports credential validity per provider. ✅ Built. Requirements: a 401/expired credential prints the exact re-auth command (`agi login`), never leaks the raw token, and never falls back across a trust boundary (a failed Managed token must not silently retry via a BYOK key).

## Provider Failure

Upstream provider faults map to `CliError::Api`, `CliError::RateLimited { retry_after }`, and `CliError::Paywall` (`apps/cli/src/errors.rs`). ✅ Built. On rate-limit or 5xx, the fallback chain rotates to the next primary and continues (`apps/cli/src/routing/fallback.rs` — `FallbackOn::RateLimit` default; `FallbackOn::All` adds network/server) — the deliberate answer to the "rate-limit cliff." ✅ Built. A `Paywall` (Managed limit exhausted) must render the server-provided upgrade path using canon tiers (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise), never invented tiers or INR figures. Requirements: fallback model IDs come only from the catalog (`packages/contracts/types/src/models.json`); provider failure never escalates a Local session to a non-local provider.

## Local Runtime Failure

When the local runtime (Ollama / LM Studio) is down, the probe returns an actionable message — "not reachable: {error}. Start Ollama..." and "not running" in the probe report (`apps/cli/src/local_models.rs`). ✅ Built. A model that is not installed yields a remediation pointing to `agi models scan` and a pull step, not a crash. ✅ Built. The `crates/agiworkforce-app-server` tool host is covered by `agi doctor` `transport_health_checks`. ✅ Built. Requirement: a dead local runtime in a Local session stays Local — the CLI must refuse to switch to a cloud model without the explicit `/continue-with-byok` consent fork (`apps/cli/src/agent/mod.rs` `arm_byok_handoff` / `consume_byok_handoff`). ✅ Built.

## Permission Denied

Filesystem, shell, and network access are approval-gated. Path access is confined to validated workspace roots (`apps/cli/src/path_security.rs` `validate_workspace_path`, `register_additional_workspace_root`); out-of-root reads/writes are rejected. ✅ Built. Command execution runs through permission/policy layers (`apps/cli/src/{permissions,exec_policy,sandbox}.rs`) with a TUI approval broker. ✅ Built. Requirements: a denied tool call returns a typed `CliError::Tool` with the reason and grant path; denial never silently downgrades the sandbox; skip-permissions bypass must be explicit and logged (`apps/cli/src/approval_audit.rs`). 🟡 Partial — audit coverage is not yet uniform across every mutating tool.

## Context Overflow

Overflow is detected across providers via 17 compiled regex patterns (`apps/cli/src/errors.rs` `detect_context_overflow`, `CliError::ContextOverflow`). ✅ Built. Proactively, compaction warns at 85% (`CONTEXT_WARN_THRESHOLD = 0.85`) and auto-compacts at 90% against a `DEFAULT_CONTEXT_LIMIT` of 128,000 tokens, pruning old tool outputs first and truncating oversize text (`apps/cli/src/compaction.rs`). ✅ Built. Requirements: overflow triggers auto-compaction or a `/compact` prompt, never a hard crash; the most recent turns and the current plan are preserved; token estimates use the shared `estimate_tokens` heuristic.

## Interrupted Commands

`Ctrl+C` cancels the current turn / interrupts the active tool (`apps/cli/src/tui/widgets/screen_renderers.rs`). ✅ Built. The REPL handles `ReadlineError::Interrupted` cleanly (`apps/cli/src/repl/mod.rs`); the daemon/app-server register a `SIGINT` handler for graceful shutdown (`apps/cli/src/daemon.rs`); the SDK protocol carries an `Interrupted` signal (`apps/cli/src/sdk_io/protocol.rs`). ✅ Built. Requirements: an interrupt cancels the in-flight model/tool call without corrupting the transcript or leaving a half-written file; a second interrupt escalates to exit; interrupted state is recoverable on next launch.

## Repository Too Large

Context attachment is bounded: `attach_context_files` caps total at 120,000 chars and 40,000 per file, truncating and reporting "attachment budget exhausted" rather than OOMing (`apps/cli/src/agent/mod.rs`). ✅ Built. Search and read tools are scoped to validated workspace roots. ✅ Built. Requirements: a huge repo never blocks startup; scans stream and cap results; oversize files are truncated with a visible marker. 🔭 Planned — a proactive repo-size guard (pre-scan warning + `.agiignore`-style excludes) is not yet built; today large-repo safety relies on per-file/context caps.

## Disk Full

Write failures must surface, never be swallowed. Plan persistence already degrades gracefully — "could not persist plan to disk" is warned and the turn continues (`apps/cli/src/agent/mod.rs` `handle_update_plan`); managed-session saves propagate `save_to_path` errors. 🟡 Partial. Requirements: a full disk on session/checkpoint/log write produces a typed error with the failing path and keeps in-memory conversation state. 🔭 Planned — dedicated ENOSPC classification, a pre-write free-space check, and cache-eviction fallback are not yet built.

## Repository map

- `apps/cli/src/errors.rs` — `CliError` taxonomy, overflow patterns, retryability
- `apps/cli/src/routing/fallback.rs` — fallback chain / rotation policy
- `apps/cli/src/compaction.rs` — context-window thresholds and pruning
- `apps/cli/src/local_models.rs` — local runtime probing and remediation
- `apps/cli/src/agent/mod.rs` — privacy boundary, context attachment, session state
- `apps/cli/src/doctor.rs` — `agi doctor` triage checks
- `apps/cli/src/auth.rs` — auth/refresh classification, token redaction
- `apps/cli/src/{permissions,exec_policy,sandbox,path_security,approval_audit}.rs` — access control
- `apps/cli/src/{daemon,repl,sdk_io}` — interrupt/SIGINT handling
- `crates/agiworkforce-app-server` — JSON-RPC/WS tool host transport

## Competitor notes

Claude Code and Codex CLI handle overflow, rate limits, and auth expiry but assume a single hosted provider — an outage stalls the session. AGI diverges: multi-provider fallback (`routing/fallback.rs`) rotates across catalog models on failure; BYOK (Desktop/CLI/VS Code only) lets a user's own key survive a Managed outage; Local mode keeps working fully offline. The load-bearing divergence is per-surface trust: no failure crosses Local → BYOK → Managed, and none auto-syncs a CLI session to app chat. Remote-control failure modes (Claude Code Remote Control / Codex remote connections) are 🔭 Planned on CLI.

## Acceptance / Definition of Done

Production-ready when every edge case above returns a typed error with a remediation and stable exit code, `agi doctor` surfaces the check, and no degradation crosses a trust boundary or fabricates success.

- [ ] Build: `cargo test -p agiworkforce-cli --lib` green, including privacy-boundary and overflow-detection tests.
- [ ] Trust: offline / provider / local-runtime failures keep a Local session Local (verified by `validate_privacy_boundary`); no auto-sync to app chat on any failure.
- [ ] Security: auth failures redact tokens (`redact_token`); permission denials are typed and audited; disk-full/interrupt paths never write partial secrets or corrupt transcripts.

## Anti-patterns

- Silently routing a broken Local session to BYOK/Managed to "keep going" — always require the explicit consent fork; never auto-sync a failed CLI session to app chat.
- Hardcoding a fallback model ID instead of reading `packages/contracts/types/src/models.json`.
- Rendering removed tiers (Plus / pro_plus / Hobby) or invented Pro/Max INR prices in a paywall/quota message.
- Swallowing disk-full or network errors and reporting success; leaking raw tokens in auth errors.
- Referencing Supabase, renaming `proxy.ts` to `middleware.ts`, or using `agiworkforce <cmd>` in examples — use the `agi` binary.
