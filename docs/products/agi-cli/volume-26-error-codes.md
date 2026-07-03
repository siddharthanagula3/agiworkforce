# AGI CLI — Volume 26 — Error Codes

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: grounded in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/cli/AGENTS.md`, and the real CLI paths this volume documents: `apps/cli/src/errors.rs`, `apps/cli/src/doctor.rs`, `apps/cli/src/agent/mod.rs`, `apps/cli/src/approval_audit.rs`, `apps/cli/src/lib.rs`, and `crates/agiworkforce-app-server/src/lib.rs`. Model IDs are governed by `packages/types/src/models.json` and are never restated here.

## Overview & stance

This volume specifies how AGI CLI classifies, presents, and recovers from errors. AGI CLI is the pure-Rust (Ratatui) developer surface with three trust modes — **Local**, **BYOK**, and **Managed Cloud** — enforced by `PrivacyMode` in `apps/cli/src/agent/mod.rs`. Error handling is a trust-boundary surface: an error message must never leak Local prompt/file context to a cloud provider, must name the provider and trust mode it concerns, and must fail closed. The design goal is a **typed, machine-readable, actionable** error model: every error carries a stable `kind()` string for CI/`jq`, a one-sentence imperative `hint()`, and a deterministic exit code. Commands below use the `agi` binary only.

## Authentication Errors

`CliError::Auth { provider, message }` (`apps/cli/src/errors.rs`) covers missing keys, expired tokens, and revoked credentials. Kind: `auth_expired`; exit code `1`; not retryable (`is_retryable()` returns false). ✅ Built. The hint directs the user to `agi login <provider>` or the provider API-key env var. Requirements: BYOK auth failures name the provider whose key failed; Managed-Cloud auth failures reference the AGI account/token, never a raw provider key; **Local sessions require no credentials** and must never emit an auth error demanding a cloud key. Preflight auth state is surfaced by the `auth.providers` check in `agi doctor` (`apps/cli/src/doctor.rs`). 🔭 Planned: interactive re-auth prompt on a mid-session 401.

## Provider Errors

Provider-side failures are typed in `apps/cli/src/errors.rs`: `Api { provider, status, message }` (kinds `api_http_error`, or `api_server_error` for 5xx), `RateLimited { provider, retry_after }` (kind `api_rate_limit`), `ContextOverflow { model, token_count, limit }` (kind `context_overflow`), `StreamError { provider, message, is_retryable }` (kind `stream_disconnect`), and `Paywall { feature, required_tier, reason }` (kind `paywall`). ✅ Built. Overflow is detected across providers by `detect_context_overflow()` — 17 case-insensitive regex patterns (`OVERFLOW_PATTERNS`) covering Anthropic, OpenAI, Gemini, Bedrock, Groq, OpenRouter, and more. The `Paywall` variant maps a Managed-Cloud tier cap (HTTP 429 with a `kind:"paywall"` body) to exit code `78` (EX_CONFIG) and points at `agiworkforce.com/pricing`; `required_tier` must be a real ladder tier (Free / Basic / Pro / Max / Enterprise) and must never render `Plus`/`Hobby`/`pro_plus`. 🟡 Gap: `hint()` embeds literal model-ID example strings for fallback (`--model …`); these are hardcoded in source and must be reconciled to read from `packages/types/src/models.json` rather than drift — do not treat those strings as canonical IDs.

## CLI Errors

Invocation-level failures — unknown flags, unknown subcommands, and unresolvable model selectors. `AgentSession::switch_model` (`apps/cli/src/agent/mod.rs`) returns an actionable error for an unknown model that tells the user to run `agi models scan` (local) or `agi models list` (catalog). ✅ Built. Requirements: argument errors exit non-zero with usage context; an unknown model must never silently fall through to a provider default (production entry points use `new_checked`, which fails closed on unknown hosted IDs). The top-level error path in `apps/cli/src/lib.rs` walks the `anyhow` error chain, downcasts to `CliError`, and calls `exit_code()` so paywall exits `78` and all others exit `1`.

## Configuration Errors

`CliError::Config { message }` (kind `config_invalid`, exit `1`, not retryable) covers missing config, TOML parse failures, and invalid defaults. ✅ Built. The hint recommends `agi init` to regenerate defaults or fixing the named file. `agi doctor` validates config shape non-destructively via `state.config`, `mcp.config`, `transport.config`, and `plugins.load` checks (`apps/cli/src/doctor.rs`), each returning Pass/Warn/Fail/Unknown without starting an LLM request. Requirement: config errors must name the offending file path and key; never guess env vars, routes, or schema fields that the repo does not define.

## Runtime Errors

Runtime failures include network (`CliError::Network { url, message }`, kind `network`, retryable), sandbox/workspace-root violations (`apps/cli/src/path_security.rs`, `apps/cli/src/sandbox.rs`), daemon/transport faults, and the trust-boundary guard itself. `validate_privacy_boundary()` (`apps/cli/src/agent/mod.rs`) returns a blocking error when a Local session targets a non-Local provider, instructing the user to use `/continue-with-byok` — this is a hard runtime error, not a warning. ✅ Built. The app-server transport returns JSON-RPC 2.0 errors: `-32601` method not found, `-32602` invalid params, `-32603` internal/tool error (`crates/agiworkforce-app-server/src/lib.rs`). Per `apps/cli/AGENTS.md`, production paths must not panic; prefer typed errors and user-actionable diagnostics.

## Tool Errors

`CliError::Tool { tool_name, message }` (kind `tool_failed`, exit `1`, not retryable) covers tool-not-found and execution failure; the hint points to `agi execpolicy` to see allowed commands. ✅ Built. Over the app-server, a failed `tools/call` returns JSON-RPC `-32603` with a `Tool error: …` message, and a missing tool name returns `-32602`. Approval denials are recorded, not silent: `ApprovalAuditEntry` (`apps/cli/src/approval_audit.rs`) logs `Approved` / `Denied` / `BlockedByRule` with tool, target, risk, reason, and cwd (fields capped at `MAX_FIELD_CHARS = 1000`). Requirement: tool-input validation errors must be returned as structured failures, never swallowed.

## Recovery

Recovery is deterministic and typed in `apps/cli/src/errors.rs`. ✅ Built: `is_retryable()` retries `RateLimited`, `Network`, retryable `StreamError`, and `Api` with status in `RETRYABLE_API_STATUSES = [429, 500, 502, 503, 504]`. `retry_delay_with_backoff(attempt)` applies exponential backoff from a 2s base, honoring a provider `retry_after`, capped at `MAX_BACKOFF_MS = 30_000`. Context overflow recovery routes to `/compact` or a larger-context model. Provider rotation uses the session fallback chain (`FallbackChain`, `apps/cli/src/agent/mod.rs`), and checkpoints allow restore. Trust rule: fallback and retry stay **within the active trust mode** — a Local session never silently rotates to a BYOK or Managed provider on failure.

## Logging

Structured logging uses the `tracing` crate across runtime paths (`apps/cli/src/daemon.rs`, `apps/cli/src/models/streaming.rs`, `apps/cli/src/models/provider_dispatch.rs`, `apps/cli/src/tier_cache.rs`, `apps/cli/src/a2a_ws.rs`). ✅ Built. `--debug`/verbose mode enables debug-level output (`apps/cli/src/lib.rs`). Approval decisions are appended as JSONL audit records via `apps/cli/src/approval_audit.rs`. When `--json-events` is set, streaming and errors emit machine-readable `MessageDelta` JSONL keyed by session ID. Requirements: logs must not persist Local prompt/file bodies to any cloud sink; secrets must be redacted before any handoff to app chat (which is always explicit and redacted, never automatic).

## Diagnostics

`agi doctor` (`apps/cli/src/doctor.rs`) is the read-mostly preflight: it validates runtime dependencies (`runtime.git`, `runtime.shell`, `runtime.rg`, `runtime.node`, `runtime.cargo`), auth (`auth.providers`), sandbox (`sandbox.os`), state dirs (`state.config`, `state.managed_sessions`, `state.cache`, `state.daemon_logs`), MCP/plugins (`mcp.config`, `plugins.load`), model access (`model.default_access`), transport (`transport.config`), and git hygiene (`git.repository`, `git.stale_branches`) without starting an LLM request or connecting to user MCP servers. ✅ Built. Each check returns `Pass`/`Warn`/`Fail`/`Unknown`; `--json` emits a `DoctorReport` for CI. 🔭 Planned: a `--fix` mode and remote-control-session diagnostics.

## Repository map

- `apps/cli/src/errors.rs` — `CliError` enum, `kind()`, `hint()`, `exit_code()`, retry/backoff, overflow detection.
- `apps/cli/src/doctor.rs` — `agi doctor` checks, `DoctorReport`, JSON output.
- `apps/cli/src/agent/mod.rs` — `PrivacyMode`, `validate_privacy_boundary()`, `switch_model()`, fallback chain.
- `apps/cli/src/approval_audit.rs` — approval decision audit log.
- `apps/cli/src/lib.rs` — top-level exit-code resolution, `--debug`.
- `crates/agiworkforce-app-server/src/lib.rs` — JSON-RPC error codes.

## Competitor notes

Claude Code and Codex CLI expose provider-shaped errors for a single vendor's API and generally assume one trust context. AGI CLI diverges deliberately: errors are **multi-provider** (17-pattern overflow detection spanning vendors), **trust-mode-aware** (a Local session's boundary violation is a first-class error, not a silent reroute), and **BYOK-honest** (auth errors name the user's own key). AGI adds a stable `kind()` taxonomy and sysexits-based exit codes for CI, plus a paywall error that maps to the real Managed-Cloud ladder rather than a generic 402.

## Acceptance / Definition of Done

Production-ready when every user-facing failure resolves to a typed `CliError` (or JSON-RPC error over the app-server) with a stable `kind()`, an imperative `hint()`, and a correct exit code; when no error path panics in production; and when no error leaks Local context across a trust boundary.

- [ ] Build: `cargo test -p agiworkforce-cli --lib` green; `errors.rs` and `doctor.rs` test suites pass.
- [ ] Trust: Local→cloud provider always errors via `validate_privacy_boundary()`; no fallback/retry crosses trust modes; paywall `required_tier` renders only Free/Basic/Pro/Max/Enterprise.
- [ ] Security: approval denials audited; logs redact secrets and never persist Local bodies to a cloud sink.

## Anti-patterns

- Rerouting a Local session to BYOK/Managed on error, or emitting an auth error that demands a cloud key in Local mode.
- `panic!`/`unwrap()` on production error paths instead of typed `CliError`.
- Hardcoding or inventing model IDs in error strings — read from `packages/types/src/models.json`; the existing `hint()` example strings are a tracked drift risk, not canon.
- Rendering removed tiers (`Plus`, `Hobby`, `pro_plus`) or inventing INR prices in paywall messages; offering credit top-ups.
- Referencing Supabase, renaming `proxy.ts` to `middleware.ts`, or using `agiworkforce <cmd>` in examples instead of `agi`.
- Swallowing tool/config/validation errors, or logging unredacted secrets or Local file bodies.
