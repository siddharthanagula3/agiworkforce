# CLI Agent Rules

Status: Current
Owner: CLI lead
Last updated: 2026-05-21

Read root `AGENTS.md`, then this file, then `apps/cli/README.md`.

## Scope

`apps/cli` owns the terminal coding-agent surface and reusable developer-engine behavior that has not yet moved into `crates/`.

## Lane Contract

- Primary lane: `cli-app`.
- Owned write path: `apps/cli/**`.
- Read-only context: `crates/**`, CLI docs, and command registry tests unless the task is explicitly assigned to the Rust platform lane.
- Shared-file edits, Cargo workspace edits, and command-registry crate edits require integrator or `rust-command-registry` ownership.

## High-Risk Areas

- Shell execution, file edits, workspace roots, sandbox policy, MCP, hooks, plugins, slash commands, session replay/forking, and Local/BYOK/Managed routing.
- Do not weaken approvals or expand filesystem/network access without an explicit security/privacy review.
- Do not panic in production paths; prefer typed errors and user-actionable diagnostics.

## TUI Module Ownership

`apps/cli/src/tui/mod.rs` declares exactly 12 live submodules (see `tui/mod.rs` for the canonical declaration set):
`app_event`, `approval_broker`, `color`, `cost_hud`, `icons`, `pane_view`, `shimmer`, `terminal_palette`, `transcript_cell`, `markdown_renderer`, `tui_app`, `widgets`.

The actual live ratatui implementation is `tui_app.rs`. All other TUI features are implemented within `widgets/` and the supporting submodules above.

**Rule:** Any new `.rs` file added under `apps/cli/src/tui/` MUST have a corresponding `mod` declaration in `tui/mod.rs` in the same commit. Files without a declaration are never compiled — `cargo check` will not catch the error.

**History:** A pre-existing orphan tree of ~370 files (~108K LOC) was removed in commit `e3a316d39` (2026-05-22). The orphan files used `crate::bottom_pane::*` import paths incompatible with `tui` submodule nesting — they were paste-from-upstream-Codex code never adapted for this codebase. See `docs/agent-context/known-flaws.md` row `CLI-TUI-ORPHAN-01`.

## Verification

- Small change: `cargo check -p agiworkforce-cli`
- CLI behavior: `cargo test -p agiworkforce-cli --lib`
- Command registry changes: `cargo test -p agiworkforce-command-registry --test slash_palette_golden`
