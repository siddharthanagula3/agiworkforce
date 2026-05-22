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

## Orphan Module Tree (pre-existing, do NOT silently delete)

`apps/cli/src/tui/mod.rs` declares only 8 live submodules:
`color`, `cost_hud`, `icons`, `shimmer`, `terminal_palette`, `markdown_renderer`, `tui_app`, `widgets`.

Everything else inside `apps/cli/src/tui/` exists on disk but is **never compiled** by `cargo`:

| Path                     | .rs files | Notes                                                                               |
| ------------------------ | --------- | ----------------------------------------------------------------------------------- |
| `tui/*.rs` (loose files) | ~57       | includes `app.rs`, `chatwidget.rs`, `app_event.rs`, etc.                            |
| `tui/bottom_pane/`       | 40        | full `BottomPane` implementation with `StatusLineItem`, `StatusLineSetupView`, etc. |
| `tui/chatwidget/`        | 21        | `ChatWidget` with streaming, exec, plan, agent submodules                           |

**Why `cargo check` passes:** Rust never parses files that have no `mod` declaration pointing to them.

**History:** The orphan tree predates commit `2ee09d98f` by 20+ commits. That commit added `CachedInputTokens` and `ReasoningOutputTokens` variants to `status_line_setup.rs` — a pre-existing orphaned file. It did not create the orphan tree.

**Decision (2026-05-22):** Do not delete (would remove ~118 files including a 6,852-line chatwidget.rs). Do not wire silently (wiring `bottom_pane/` and `chatwidget/` into `tui/mod.rs` is multi-day work — they use `crate::bottom_pane::*` import paths inconsistent with being nested under `tui`). **Escalate to team-lead for a deliberate re-integration or removal decision.**

See `docs/agent-context/known-flaws.md` row `CLI-TUI-ORPHAN-01` for the tracked entry.

## Verification

- Small change: `cargo check -p agiworkforce-cli`
- CLI behavior: `cargo test -p agiworkforce-cli --lib`
- Command registry changes: `cargo test -p agiworkforce-command-registry --test slash_palette_golden`
