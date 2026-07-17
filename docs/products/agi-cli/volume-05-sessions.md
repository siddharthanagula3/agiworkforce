# AGI CLI — Volume 05 — Sessions

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (root) and `apps/cli/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `docs/cli/COMMAND_SURFACE.md` and `docs/surfaces/cli.md`. Grounded in `apps/cli/src/agent/mod.rs`, `apps/cli/src/agent/history.rs`, `apps/cli/src/sessions.rs`, `apps/cli/src/platform/runtime/session.rs`, `apps/cli/src/platform/runtime/session_control.rs`, `apps/cli/src/lib.rs`, `apps/cli/src/repl/registry.rs`, `apps/cli/src/repl/slash_commands.rs`, `crates/agiworkforce-app-server/src/lib.rs`, and `crates/agiworkforce-protocol/src/projects.rs`.

## Overview & stance

This volume specifies how AGI CLI creates, persists, resumes, names, searches, exports, imports, cleans up, and preserves the context of coding-agent **sessions**. AGI CLI is the pure-Rust (Ratatui) developer surface with all three trust modes — Local + BYOK + Managed. Two orthogonal ideas share the word "managed": a **managed session** is a persisted local session file (`ManagedSession`, JSONL v2 under `~/.agiworkforce/managed_sessions/`), while **Managed Cloud** is a trust boundary. They are independent — a Local session can be a managed (persisted) session, and persistence never changes the trust mode.

The binding constraint is the locked sync rule: CLI sessions are **workspace/session-scoped** and **never** enter Neon consumer chat sync (`apps/web/app/api/{chat,memory,projects}/sync`). `crates/agiworkforce-protocol/src/projects.rs` marks `ProjectSourceSurface::Cli.is_developer_session_surface() == true` and `is_synced_app_surface() == false`, enforced by a unit test in `apps/cli/src/sessions.rs`. All session data lives on the local filesystem; any handoff to app chat is explicit and redacted, never automatic. The Local→BYOK boundary is guarded by `AgentSession::validate_privacy_boundary` (`apps/cli/src/agent/mod.rs`).

## Conversation Sessions

Each run holds an in-memory `AgentSession` (`apps/cli/src/agent/mod.rs`) tracking messages, model, provider, `privacy_mode`, token/cost ledger, and plan state. Persistence is opt-in via `enable_managed_session`, writing a JSONL-first `ManagedSession` (`MANAGED_SESSION_VERSION = 2`, `apps/cli/src/platform/runtime/session.rs`) with atomic writes and a per-directory `flock` (`apps/cli/src/sessions.rs`) so concurrent CLI processes serialize safely. A sidecar metadata JSON records title, model, cwd, and git branch. **✅ Built** — `apps/cli/src/agent/mod.rs`, `apps/cli/src/platform/runtime/session.rs`.

## Resume Sessions

`agi resume [session_id]` and the top-level `--resume`/`--session` flags reopen a prior session; `--resume-session-at <MARKER>` targets an event/turn marker (`apps/cli/src/lib.rs`). References resolve through `ManagedSessionReference` — `Latest`/`@last`, a `SessionId`, or an explicit file `Path` (`apps/cli/src/platform/runtime/session_control.rs`) — so a resumed session rehydrates permission mode, plan mode, output style, and fallback chain via `adopt_managed_session`. In the REPL/TUI, `/resume` and `/sessions` do the same interactively. Resume must not silently cross a trust boundary: a resumed Local session stays Local until an explicit BYOK handoff. **✅ Built** — `apps/cli/src/lib.rs`, `apps/cli/src/platform/runtime/session_control.rs`.

## Named Sessions

Titles are inferred from the first user turn (`infer_title`) but become sticky once set. `rename_session` marks `custom_title = true` so later syncs never overwrite a user name (`apps/cli/src/sessions.rs`); the REPL exposes `/rename` and `/save`. `agi session fork` accepts `--as <name>` to name the branch at creation. **✅ Built** — `apps/cli/src/sessions.rs` (`rename_session`, `sync_session_metadata`).

## Session History

`agi history --limit N` and `agi session list --limit N` list sessions newest-first via `list_sessions`, rendered with `format_session_list` and grouped into Today / Yesterday / This Week / date buckets by `date_group_sessions`. `agi session show <id>` prints the turn-by-turn transcript; aggregate counts come from `db_stats`. **✅ Built** — `apps/cli/src/lib.rs` (`History`, `SessionAction`), `apps/cli/src/sessions.rs`.

## Session Search

`search_sessions` does a case-insensitive substring match across titles and message content; `search_session_messages` returns matching snippets with UTF-8-safe char-boundary windows and up to three snippets per session (`apps/cli/src/sessions.rs`). Exposed through the REPL command registry (`apps/cli/src/repl/registry.rs`). Search reads only local files — it never queries a cloud index. **✅ Built** — `apps/cli/src/sessions.rs` (`search_sessions`, `search_session_messages`).

## Session Export

In-session `/export` writes the current conversation as JSON or Markdown via `conversations::export_as_json` / `export_as_markdown` (`apps/cli/src/repl/registry.rs`, `apps/cli/src/repl/slash_commands.rs`); the TUI defaults to Markdown. Exports are plain local artifacts with no telemetry. Gap: there is **no** non-interactive `agi session export <id>` subcommand yet — export is REPL/TUI-only. **🟡 Partial** — `apps/cli/src/repl/registry.rs` (`handle_export`); gap: no headless export subcommand.

## Session Import

`migrate_json_conversations` imports legacy JSON conversations into the managed store, skipping IDs that already exist (`apps/cli/src/sessions.rs`), and `agi migrate` imports settings/MCP from other CLIs (default Claude Code). Arbitrary session files can be reopened by passing a `Path` reference to resume. Gap: there is no generic `agi session import <file>` command and no cross-surface import (that would violate the sync isolation rule). **🟡 Partial** — `apps/cli/src/sessions.rs` (`migrate_json_conversations`), `apps/cli/src/lib.rs` (`Migrate`); gap: no first-class session-file import command.

## Session Cleanup

`delete_session` and `archive_session` remove a session file plus its metadata sidecar (`apps/cli/src/sessions.rs`), but both are currently `#[allow(dead_code)]` and **not wired** to any `agi` command; no `agi session clean`/`prune`, TTL, or retention policy exists yet. Planned: a `agi session` cleanup/prune subcommand with age- and count-based retention and a dry-run preview. **🟡 Partial** — `apps/cli/src/sessions.rs` (`delete_session`, `archive_session`); gap: unexposed, no retention/TTL. Retention policy itself is **🔭 Planned**.

## Context Preservation

Within a run, `save_checkpoint`/`restore_checkpoint` snapshot and roll back the message history (`apps/cli/src/agent/history.rs`), surfaced as `/rewind`. `persist_managed_session` re-serializes messages plus `permission_mode`, `plan_mode`, `plan_approved`, `current_plan`, `output_style`, and `fallback_model_ids` so resume restores working state (`apps/cli/src/agent/mod.rs`). `add_context_dir` and `attach_context_files` inject bounded directory/file context (40k/file, 120k total) without consuming a turn, and compaction preserves instructions/memory across summarization. **✅ Built** — `apps/cli/src/agent/history.rs`, `apps/cli/src/agent/mod.rs`.

## Remote Session Window — 🔭 parity (agi session exposed to phone/web while running locally)

Target: a running `agi` session can be paired to a phone/web client as a secure **remote window** — compute stays on the host, the connection is outbound-only, paired by QR + HMAC, and every action is approval-gated. This is **not** a fourth trust mode; the session keeps running locally and no Local/BYOK data moves to the cloud. Parity references: Claude Code Remote Control (`claude remote-control` server mode, `--remote-control`, `/remote-control`, research preview) and OpenAI Codex remote connections. Today `crates/agiworkforce-app-server/src/lib.rs` provides only a JSON-RPC (stdio) + local WebSocket tool host with `WebSocketSecurity` (auth token, `allow_query_token` off by default, allowed origins, `allow_public_listen`) for IDE integration via `agi app-server` — there is no QR/HMAC pairing, phone client, or remote command subset. **🔭 Planned** — `crates/agiworkforce-app-server/src/lib.rs` (foundation only).

## Repository map

- `apps/cli/src/agent/mod.rs` — `AgentSession`, `PrivacyMode`, `validate_privacy_boundary`, managed-session enable/adopt/persist.
- `apps/cli/src/agent/history.rs` — checkpoint save/restore/count.
- `apps/cli/src/sessions.rs` — list/load/search/rename/delete/fork/stats, metadata sidecars, atomic writes, JSON import.
- `apps/cli/src/platform/runtime/session.rs` — `ManagedSession` (JSONL v2), `forked_from`, load/save.
- `apps/cli/src/platform/runtime/session_control.rs` — `ManagedSessionReference` (Latest/SessionId/Path).
- `apps/cli/src/lib.rs` — `resume`/`fork`/`session`/`history`/`app-server`/`migrate`/`sync` commands and session flags.
- `apps/cli/src/repl/registry.rs`, `apps/cli/src/repl/slash_commands.rs` — `/export`, `/resume`, `/rename`, `/rewind`, session slash commands.
- `crates/agiworkforce-app-server/src/lib.rs` — JSON-RPC/WS host (remote-window foundation).
- `crates/agiworkforce-protocol/src/projects.rs` — `ProjectSourceSurface::Cli` sync-isolation contract.

## Competitor notes

Claude Code and Codex CLI persist local session transcripts with `resume`/`--continue` and, in Claude's case, remote control of a running session; ChatGPT/Codex additionally offer cloud-run sessions. AGI CLI matches local persistence, resume, fork-at-turn, search, and export, then diverges deliberately: sessions are **multi-provider** (any catalog or discovered local model), honor **BYOK** where allowed, enforce a **per-surface trust boundary** (`validate_privacy_boundary`), and are **local-first** — CLI sessions never join consumer chat sync, and Managed Cloud is a separate, consented path (`agi cloud` execution is not wired in this build). The remote window is a planned parity target, not a data-mover.

## Acceptance / Definition of Done

- Sessions persist and resume across processes with rehydrated permission/plan/output state; concurrent writers are serialized.
- No CLI session data reaches Neon sync tables; the `ProjectSourceSurface::Cli` isolation test stays green.
- Resume/fork never silently cross Local→BYOK/Managed; boundary violations block with an actionable error.

Build:

- [ ] `cargo test -p agiworkforce-cli --lib` passes for sessions, session_control, and agent modules.
- [ ] `agi resume`, `agi session list|show|fork`, `agi history` verified against real session files.

Trust:

- [ ] `validate_privacy_boundary` blocks a Local session on a non-local provider until an explicit, consented BYOK handoff.
- [ ] No `apps/cli/**` code path constructs Web/Desktop/Mobile project surfaces or writes cloud chat tables.

Security:

- [ ] Session files written atomically under `~/.agiworkforce/managed_sessions/`; `app-server` WS keeps `allow_query_token` off and requires an auth token for non-loopback binds.

## Anti-patterns

- Do **not** auto-sync CLI sessions to Neon or to app chat, or construct `ProjectSourceSurface::{Web,Desktop,Mobile}` from the CLI.
- Do **not** let resume/fork silently switch trust mode; never route Local context to BYOK/Managed without the consent gate.
- Do **not** treat a persisted "managed session" as Managed Cloud, or claim `agi cloud` execution works (it is not wired).
- Do **not** invent commands (`agi session export/import/clean` do not exist as shipped), reference removed tiers (Plus/Hobby/pro_plus), add credit top-ups, or mention Supabase.
- Do **not** hardcode model IDs — resolve from `packages/contracts/types/src/models.json`; use the `agi` binary in examples, never `agiworkforce`.
- Do **not** present the remote window as a trust mode or ship it without QR + HMAC pairing, outbound-only transport, and per-action approval.
