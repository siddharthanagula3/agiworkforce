# AGI CLI — Volume 21 — Local Storage

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root) and `apps/cli/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (binding canon); `docs/surfaces/cli.md`. Grounded in real repo paths: `apps/cli/src/config.rs`, `apps/cli/src/sessions.rs`, `apps/cli/src/platform/runtime/session.rs`, `apps/cli/src/platform/runtime/session_control.rs`, `apps/cli/src/auth.rs`, `apps/cli/src/mcp/oauth_store.rs`, `apps/cli/src/model_catalog.rs`, `apps/cli/src/models/openrouter_models.rs`, `apps/cli/src/tier_cache.rs`, `apps/cli/src/local_models.rs`, `apps/cli/src/daemon.rs`, `apps/cli/src/approval_audit.rs`, `apps/cli/src/repl/mod.rs`, `apps/cli/src/agent/mod.rs`, and `packages/types/src/models.json`.

## Overview & stance

AGI CLI is the pure-Rust (Ratatui TUI) developer surface. Every byte it persists lives on the local filesystem under the user's home directory — there is **no cloud row** for CLI state. This is a product invariant, not an accident: `apps/cli/src/sessions.rs` documents that CLI sessions are workspace/session-scoped and must never write the synced app tables (`chat_messages`, `conversations`, `user_projects`), and `ProjectSourceSurface::Cli.is_synced_app_surface()` returns `false`. Cross-device Neon delta-sync is Web ↔ Mobile ↔ Desktop only; the CLI is deliberately excluded.

CLI supports all three trust modes (Local + BYOK + Managed), and local storage must respect those boundaries at rest. The `PrivacyMode` enum in `apps/cli/src/agent/mod.rs` (Local / Byok / Managed) is ✅ Built and blocks a Local session from silently reaching a non-local provider; on-disk artifacts inherit the same rule — a Local transcript is never quietly uploaded, and Local→BYOK/Managed is an explicit, consented fork. Everything below describes the single-root store rooted at `~/.agiworkforce/` (`apps/cli/src/config.rs`).

## Configuration

✅ Built — `apps/cli/src/config.rs`. Global config resolves to `~/.agiworkforce/config.toml`; the config dir (`~/.agiworkforce/`) is created on demand. A project-level overlay is read from `.agiworkforce/config.toml` in the working directory and merged over the global file, with provenance tracked so `agi` can report which path a value came from. Requirement: config must be TOML, parse failures surface a clear error (never a silent default), and the MED-1 guard means a project-shipped provider block is untrusted until recorded in `~/.agiworkforce/trusted_project_providers.json`.

## Sessions

✅ Built — `apps/cli/src/platform/runtime/session_control.rs`, `apps/cli/src/platform/runtime/session.rs`, `apps/cli/src/sessions.rs`. Live sessions persist as JSON/JSONL under `~/.agiworkforce/managed_sessions/` (`MANAGED_SESSION_DIR_NAME = "managed_sessions"`, JSONL extension, `MANAGED_SESSION_VERSION = 2` with version-guarded load). Session metadata (model, cwd, message index) is mirrored under `~/.agiworkforce/managed_session_metadata/`. Writes are atomic (tempfile + rename under a per-directory `flock`) so concurrent `agi` processes cannot corrupt a session file. Requirement: `agi session`, `agi resume`, and `agi fork` operate only on these local files; no session write leaves the device.

## Conversation History

✅ Built — `apps/cli/src/sessions.rs`, surfaced via the `agi history` subcommand (`docs/surfaces/cli.md`). Conversation transcripts live under `~/.agiworkforce/conversations/` and the managed-session store above; the module explicitly does not read or write cloud consumer-chat tables. REPL input history (the line-editor recall buffer, not model transcripts) is a separate `~/.agiworkforce/history.txt` (`apps/cli/src/repl/mod.rs`). Requirement: history is device-local and workspace-scoped; any promotion into an app chat must be an explicit, redacted handoff, never automatic.

## Workspace Cache

🟡 Partial — concrete pieces exist; a unified workspace-scoped cache index does not. Built today: per-session shell environment snapshots (`apps/cli/src/shell_snapshot.rs`, captured under the config dir and garbage-collected via `cleanup_stale`) and a `~/.agiworkforce/tool-output/` area for large tool payloads. Gap (🔭): there is no single addressable "workspace cache" keyed by repo root with an eviction policy; derived data is currently spread across the session store and `tool-output/`. Requirement for the planned unifier: keyed by canonical workspace root, size-bounded, and safe to delete without data loss.

## Provider Configuration

✅ Built — `apps/cli/src/config.rs` (provider blocks) + `apps/cli/src/local_models.rs`. Named and `Custom` providers are declared in `[providers.*]` config blocks; local providers (Ollama, LM Studio) are probed at runtime by `discover_all` rather than stored statically. Trust-mode classification is derived from the provider, not hardcoded: `provider_privacy_mode` in `apps/cli/src/agent/mod.rs` marks a keyless local base URL (localhost / 127.\* / [::1] / 0.0.0.0) as Local and everything else as BYOK. Project-supplied provider blocks stay untrusted until allowlisted (`trusted_project_providers.json`). Requirement: never infer a provider's trust mode from its name; derive it from URL + key presence.

## Authentication Tokens

✅ Built — `apps/cli/src/auth.rs`, `apps/cli/src/mcp/oauth_store.rs`. Provider API keys and OAuth tokens persist to `~/.agiworkforce/auth.json`, which is forced to owner-only `0o600` permissions on Unix and checked on read; token display is redacted (first 8 + last 4). MCP server OAuth secrets prefer the OS keyring (`keyring` crate, `apps/cli/src/mcp/oauth_store.rs`) with an env-gated file fallback. 🔭 Planned: routing provider API keys themselves through the OS keychain rather than a `0o600` file. Requirement: secrets are never logged, never synced, and never embedded in a session transcript.

## Runtime Cache

✅ Built — TTL caches under `~/.agiworkforce/cache/`. Model catalog cache `cache/models.json` (5-minute, version-aware TTL — `apps/cli/src/model_catalog.rs`); OpenRouter dynamic-model cache `cache/openrouter_models.json` (`apps/cli/src/models/openrouter_models.rs`); subscription-tier cache `cache/tier.toml` (1-hour TTL — `apps/cli/src/tier_cache.rs`), populated from `/api/me` over HTTPS for tier resolution only. Requirement: every cache entry is TTL-bounded, safe to delete, and rebuilt on next use; caches never hold prompt/chat content.

## Logs

✅ Built — `apps/cli/src/daemon.rs`, `apps/cli/src/approval_audit.rs`. Background/daemon runs log to `~/.agiworkforce/daemon-logs/`; tool-approval decisions append to `~/.agiworkforce/approvals.jsonl`; a `security-audit.log` records security-relevant events. Requirement: logs are local, redact secrets, and are inspectable via `agi doctor`. 🔭 Planned: log rotation/retention caps so long-lived daemons do not grow logs unbounded.

## Model Registry

✅ Built — `apps/cli/src/model_catalog.rs`. The single source of truth is `packages/types/src/models.json`, compiled into the binary via `include_str!` (Tier 1); the runtime cache above is Tier 2; locally discovered models (`apps/cli/src/local_models.rs`) are Tier 3. Model IDs are read from `models.json` — never invented, hardcoded, or maintained in a separate CLI table. Requirement: unknown hosted IDs fail closed (`AgentSession::new_checked`), and any parse failure of `models.json` is a hard error, not a silent fallback.

## Repository map

- `apps/cli/src/config.rs` — `~/.agiworkforce/` root, `config.toml`, project overlay, `trusted_project_providers.json`
- `apps/cli/src/sessions.rs`, `apps/cli/src/platform/runtime/session.rs`, `apps/cli/src/platform/runtime/session_control.rs` — session/conversation persistence
- `apps/cli/src/auth.rs`, `apps/cli/src/mcp/oauth_store.rs` — token storage
- `apps/cli/src/model_catalog.rs`, `apps/cli/src/models/openrouter_models.rs`, `apps/cli/src/tier_cache.rs`, `apps/cli/src/local_models.rs` — registry + caches
- `apps/cli/src/daemon.rs`, `apps/cli/src/approval_audit.rs`, `apps/cli/src/repl/mod.rs`, `apps/cli/src/shell_snapshot.rs` — logs, audit, REPL history, snapshots
- `apps/cli/src/agent/mod.rs` — `PrivacyMode` enforcement over stored state
- `packages/types/src/models.json` — model registry SSOT

## Competitor notes

Claude Code and Codex CLI both keep local session/config state (Claude under `~/.claude`, Codex under `~/.codex`) and are largely single-provider (Anthropic / OpenAI). AGI's deliberate divergence: a single `~/.agiworkforce/` root that is explicitly multi-provider (named providers + `Custom` + local Ollama/LM Studio), stores per-provider trust mode at the boundary, and enforces Local/BYOK/Managed at rest. Unlike cloud-first assistants, CLI storage never delta-syncs; any move into app chat is an explicit, redacted fork. Remote control of a running CLI session from phone/web (parity: Claude Code Remote Control, Codex remote connections) is 🔭 and would still keep the session — and its files — local, streaming outbound-only.

## Acceptance / Definition of Done

Production-ready when every artifact resolves under `~/.agiworkforce/` (or the OS keyring), secrets are `0o600`/keyring-only, caches are TTL-bounded and deletable, and no CLI code path writes a synced cloud table.

- [ ] Build: `cargo test -p agiworkforce-cli` green for config/session/auth/cache modules; `agi doctor` reports the store layout.
- [ ] Trust: automated check confirms no CLI write to `chat_messages` / `conversations` / `user_projects`; a Local session's files are never uploaded; Local→BYOK/Managed requires explicit consent.
- [ ] Security: `auth.json` is `0o600` and verified on read; tokens redacted in all output; logs and transcripts contain no plaintext secrets.

## Anti-patterns

- Writing CLI session/history into Neon or any synced app table — breaks the workspace-scoped rule in `apps/cli/src/sessions.rs`.
- Silently uploading a Local transcript, or treating drafting as consent for a BYOK/Managed handoff.
- Storing provider keys world-readable, in `config.toml`, or in a session file instead of `0o600` `auth.json` / the keyring.
- Hardcoding or inventing model IDs, or maintaining a CLI model table beside `packages/types/src/models.json`.
- Unbounded caches or logs; caches that hold prompt/chat content.
- Referencing Supabase (fully migrated away), Next.js `middleware.ts` (use `proxy.ts`), removed tiers (`Plus`, `pro_plus`, `Hobby`), credit top-ups, or invented INR prices for Pro/Max.
- Using `agiworkforce <cmd>` in examples — the primary binary is `agi`.
