# AGI Workforce CLI Architecture

This document describes the current `apps/cli` implementation. It is intentionally
short and path-checked so it does not drift into stale reference material.

## Current Shape

- Source tree: 186 Rust source files under `apps/cli/src`.
- Entry point: `src/main.rs` delegates to `agiworkforce_cli::run_main()` in `src/lib.rs`.
- Primary session engine: `src/agent/mod.rs`, with prompt/tool/history helpers under `src/agent/`.
- Main TUI: `src/tui/tui_app.rs`, supported by 29 Rust files under `src/tui/`.
- Tool catalog: `src/platform/runtime/tool_catalog.rs`.
- Tool execution: `src/features/exec/tools/`.
- App-server and MCP server wiring: `src/app_server.rs`, backed by the shared crate at
  `../../crates/agiworkforce-app-server`.

## Runtime Flow

1. `src/main.rs` calls `run_main()`.
2. `src/lib.rs` parses CLI flags and subcommands, loads configuration, and dispatches into
   TUI, REPL, one-shot exec, MCP server, app-server, cloud, session, plugin, or utility modes.
3. Interactive and one-shot paths create an `AgentSession` from `src/agent/mod.rs`.
4. The session builds provider/model configuration, emits tool definitions from the runtime
   catalog, streams model output, executes tool calls through `src/features/exec/tools/`, and
   records session state/events.
5. The TUI path renders transcript, input, status, overlays, model pickers, approval prompts,
   and command popups through `src/tui/tui_app.rs` and `src/tui/widgets/`.

## Tool And Permission Model

- Built-in tool schemas live in `src/platform/runtime/tool_catalog.rs`.
- Executable tool dispatch is in `src/features/exec/tools/mod.rs`.
- File operations are in `src/features/exec/tools/file_ops.rs` and must pass workspace path
  validation plus read-state/freshness checks before mutating files.
- Shell execution is in `src/features/exec/tools/bash.rs`, with command safety and permission
  persistence handled through `src/permissions.rs`.
- Web fetch/search logic is in `src/features/exec/tools/web.rs`; fetched content is marked
  untrusted before it is returned to the model.
- The app-server surface is deliberately read-only. Mutating tools require the TUI/REPL approval
  path and are not silently approved over WebSocket.

## TUI Layout

- `src/tui/tui_app.rs` owns the event loop, transcript state, input buffer, approval callback,
  tool-event rendering, and overlay routing.
- Shared overlay/navigation primitives live in `src/tui/widgets/interactive.rs`.
- Slash commands use the `CommandPopup` overlay in `src/tui/widgets/command_popup.rs`.
- Tool approval UI lives in `src/tui/widgets/approval_overlay.rs`; queued approval requests are
  brokered by `src/tui/approval_broker.rs`.
- Snapshot tests for reusable TUI surfaces live in `src/tui/widgets/snapshot_smoke.rs` and
  `src/tui/widgets/snapshots/`.

## External Surfaces

- `agi mcp-server` uses the local MCP stdio handler in `src/app_server.rs`.
- `agi app-server --listen <addr>` uses the shared app-server crate and requires a WebSocket
  auth token for non-stdio transport.
- The npm wrapper lives in `apps/cli/npm/` and resolves only an explicit binary path, bundled
  vendor binary, or matching platform package.

## Verification Baseline

The current implementation is expected to pass:

```bash
cargo check -p agiworkforce-cli
cargo test -p agiworkforce-app-server
cargo test -p agiworkforce-cli
cargo clippy -p agiworkforce-cli --all-targets -- -D warnings
cargo audit
npm test --prefix apps/cli/npm
npm run --prefix apps/cli/npm package-check
npm audit --prefix apps/cli/npm --omit=dev
```
