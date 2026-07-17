# AGI CLI — Volume 04 — CLI Interface

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` + `apps/cli/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `docs/surfaces/cli.md`; `docs/cli/COMMAND_SURFACE.md`. Grounded in `apps/cli/src/{lib.rs,agent/mod.rs,agent/chat.rs,repl/,tui/,claude_parity.rs,command_registry.rs}`, `crates/agiworkforce-{command-registry,app-server}/`, and `packages/contracts/types/src/models.json`.

## Overview & stance

This volume specifies the surface shape of AGI CLI — how a developer drives the pure-Rust (Ratatui) terminal agent: interactive TUI, non-interactive `agi exec`, the REPL, the command/subcommand/flag/argument grammar, shell completion, streaming, rendering, progress affordances, keyboard control, and interrupt handling.

AGI CLI is a **Local + BYOK + Managed Cloud** surface. The three trust modes are encoded as `PrivacyMode { Local, Byok, Managed }` in `apps/cli/src/agent/mod.rs:184` (✅ Built); Local sessions are blocked from silently using a non-local provider mode, and Local→BYOK is an explicit, armed handoff via `pending_byok_handoff` (`apps/cli/src/agent/mod.rs:144-147`, ✅ Built). Sessions are **workspace/session-scoped**: the CLI never auto-syncs into app chat; any handoff is explicit and redacted. The interface must always show the active trust mode and provider/model label; no affordance may cross a boundary implicitly. Examples use the `agi` binary only (`name = "agi"`, `apps/cli/src/lib.rs:139`); `agiworkforce` is a compatibility alias and never appears in examples.

## Interactive Mode — TUI

Default launch (no subcommand, no piped stdin) starts the full-screen Ratatui TUI (`apps/cli/src/tui/`, ✅ Built). Two dispatch paths coexist: the modern `ChatWidget` (`apps/cli/src/tui/chatwidget.rs`, `slash_command.rs`) and the legacy `TuiApp` (`apps/cli/src/tui/tui_app.rs`). The TUI renders a transcript, composer, and a footer showing model, trust mode, sandbox state, and cost. `--no-tui` (`apps/cli/src/lib.rs:313`) drops to the classic REPL. Requirement: the footer shows a red "no sandbox" indicator when `--no-sandbox` is set (`apps/cli/src/lib.rs:316-320`).

## Non-interactive Mode — agi exec

`agi exec "<prompt>"` (alias `agi e`) runs one-shot and exits (`Command::Exec`, `apps/cli/src/lib.rs:514-529`, ✅ Built). It accepts `--model`, `--provider`, `--full-auto`, and `--json`. Output mode resolves through `resolve_oneshot_output_mode` (`apps/cli/src/lib.rs:463`) across `Text | RawText | JsonPretty | JsonLine`. Requirement: exec is scriptable; provider/model must be explicit for BYOK and Local runs (managed cloud may use `--auto`). Example: `agi exec "summarize CHANGELOG.md" --model <id-from-models.json>`.

## REPL

`--no-tui` runs the classic line REPL (`apps/cli/src/repl/`, ✅ Built) with a match-based slash handler (`apps/cli/src/repl/slash_commands.rs`). It supports the shared core plus REPL-only entries (`/load`, `/delete`, `/import`, `/migrate`, `/setup`) per `docs/cli/COMMAND_SURFACE.md`. Requirement: any registry-driven help migration must preserve REPL-only commands or explicitly demote them; parity requires handler behavior, not registry shape alone.

## Commands

Slash commands are advertised from the shared builtin registry (`crates/agiworkforce-command-registry/src/lib.rs`, re-exported via `apps/cli/src/command_registry.rs`, ✅ Built). `docs/cli/COMMAND_SURFACE.md` records the snapshot count (58 builtins as of 2026-05-19) plus aliases; **verify the live set from the registry before repeating any count** — do not hardcode it. TUI runtime coverage is test-enforced by `registered_builtin_commands_have_tui_runtime_coverage`. `/remote-control` (`/rc`) currently renders a desktop-bridge stub (`apps/cli/src/claude_parity.rs:960`, 🟡 Partial); true phone/web remote control is 🔭 Planned (see Keyboard/Interrupt notes).

## Subcommands

Top-level process subcommands are Clap-driven (`Command` enum, `apps/cli/src/lib.rs:513`, ✅ Built): `exec`, `review`, `apply`, `sandbox`, `mcp-server`, `completion`, `app-server`, `resume`, `fork`, `session`, `cloud`, `mcp`, `hooks`, `features`, `execpolicy`, `cost`, `auth`, `login`, `logout`, `auth-status`, `plugin`, `init`, `onboarding`, `daemon`, `ecosystem`, `sync`, `a2a`, `models`. Nested groups (e.g. `session`, `cloud`, `plugin`, `ecosystem`, `sync`) are owned by their modules. `app-server` bridges IDE clients over `crates/agiworkforce-app-server` (JSON-RPC/WS + stdio, ✅ Built). **Verify the current subcommand set from source**; `docs/surfaces/cli.md` and `COMMAND_SURFACE.md` disagree on totals, so cite the enum, not a fixed number.

## Flags

Top-level flags live on `Cli` (`apps/cli/src/lib.rs:145-431`, ✅ Built): model/provider selection (`--model`, `--provider`, `--auto` — conflicts with `--model`), output control (`--json`, `--raw`, `--print`, `--output-format`/`--output`, `--json-events`), streaming (`--stream` default true, `--no-stream`), session (`--continue`, `--resume`, `--session`, `--fork-session`, `--session-id`), permissions/safety (`--permission-mode`/`--mode`, `--allowedTools`, `--disallowedTools`, `-y/--yes`, `--dangerously-skip-permissions`, `--no-sandbox`), context (`-f/--file`, `--add-dir`, `--system-prompt`, `--append-system-prompt`), MCP (`--mcp-config`, `--strict-mcp-config`), and budget (`--max-budget-usd`). Requirement: `--dump-system-prompt` (`:429`) must make no API call. Flags must never silently switch trust mode.

## Arguments

Positional arguments: an optional one-shot `PROMPT` on the root command (`apps/cli/src/lib.rs:151`); a required `prompt` on `exec`; `SHELL` on `completion`; and a trailing command vector on `sandbox` (`apps/cli/src/lib.rs:551`). Requirement: when a positional prompt and piped stdin both exist, stdin handling follows the documented `--stdin` behavior (`apps/cli/src/lib.rs:198-200`, auto-detected when piped). Arguments must be validated (fail-closed) rather than defaulted into a wrong provider.

## Shell Completion

`agi completion <bash|zsh|fish|...>` (alias `completions`) generates completion scripts via `clap_complete::generate` with bin name pinned to `"agi"` (`generate_shell_completion`, `apps/cli/src/lib.rs:503-506`, ✅ Built; `Command::Completion`, `:556-561`). The deprecated top-level `--completions <SHELL>` flag remains as backward-compat (`:245-246`). Requirement: emitted scripts use `agi` as the completed binary name — a test asserts this (`completion_output_is_generated_for_agi_binary_name`).

## Streaming Output

Streaming is on by default (`--stream`, disabled by `--no-stream`). In human mode the agent streams chunks via a raw `print!` sink (`apps/cli/src/agent/chat.rs:150`, ✅ Built); when `json_events` is set, chunks are emitted as JSONL `MessageDelta` events carrying a session id (`apps/cli/src/agent/mod.rs:160-166`). The `StreamJson` output format (`apps/cli/src/lib.rs:451`) yields newline-delimited JSON for CI. Requirement: streamed output must remain parseable line-by-line in JSONL mode and flush incrementally in text mode.

## ANSI Rendering

Terminal styling routes through the `colored` crate and `apps/cli/src/terminal_style.rs` (aliased `ts`, `apps/cli/src/lib.rs:130`, ✅ Built), with Markdown rendering in `apps/cli/src/markdown.rs`. A dumb-terminal fallback path exists (ASCII substitutes in `apps/cli/src/tui/icons.rs`). Requirement: respect `NO_COLOR`/non-TTY detection (`std::io::IsTerminal`) and never emit unreadable low-contrast text; `--raw` prints unformatted text.

## Progress Indicators

While a turn runs, the TUI shows a working indicator ("… working — Esc or Ctrl-C to cancel", `apps/cli/src/tui/tui_app.rs:688`, ✅ Built) plus live token/cost counters surfaced through `/cost`, `/usage`, and the footer. Requirement: indicators must reflect real state (streaming, tool-call, fallback rotation) and never show a fake "available"/"working" state when idle or errored.

## Spinners

The pending spinner uses braille frames `["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]` (`BRAILLE_FRAMES`, `apps/cli/src/tui/icons.rs:41`, ✅ Built), advanced by `spinner_frame(tick)` (`:64`) with an ASCII frame set for dumb terminals. Requirement: spinner selection honors terminal capability; a covering test exists (`spinner_frames_cycle`).

## Keyboard Shortcuts

The TUI binds Esc / Ctrl-C to cancel the in-flight turn (`apps/cli/src/tui/tui_app.rs:688`, ✅ Built); `/keybindings` documents the map. 🔭 Planned: a remote-control key path so a QR-paired phone/web window can steer the running session (parity: Claude Code Remote Control, Codex remote connections) — compute stays on the host, outbound-only, HMAC-paired, approval-gated; not a fourth trust mode.

## Interrupt Handling

Ctrl-C during a stream cancels the current turn and preserves whatever streamed so far (`apps/cli/src/tui/tui_app.rs:3590-3691`, ✅ Built); the REPL treats Ctrl-C as cancel with "(Ctrl-C to cancel, /exit to quit)" guidance (`apps/cli/src/repl/mod.rs:513-518`, ✅ Built). Requirement: an interrupt must never corrupt persisted session state and must leave the trust mode unchanged.

## Repository map

- `apps/cli/src/lib.rs` — `Cli` root flags/args, `Command` enum, completion generation, output-mode resolution.
- `apps/cli/src/agent/{mod.rs,chat.rs}` — `AgentSession`, `PrivacyMode`, BYOK handoff arming, streaming sinks.
- `apps/cli/src/repl/` — classic line REPL and slash handler.
- `apps/cli/src/tui/` — Ratatui TUI (`tui_app.rs`, `chatwidget.rs`, `slash_command.rs`, `icons.rs`).
- `apps/cli/src/command_registry.rs` + `crates/agiworkforce-command-registry/` — shared slash registry.
- `apps/cli/src/claude_parity.rs` — parity slash fallbacks incl. `/remote-control` stub.
- `apps/cli/src/{terminal_style.rs,markdown.rs}` — ANSI/markdown rendering.
- `crates/agiworkforce-app-server/` — `app-server` JSON-RPC/WS + stdio host.
- `docs/cli/COMMAND_SURFACE.md`, `docs/surfaces/cli.md` — drift artifacts.

## Competitor notes

Claude Code and Codex CLI ship polished single-vendor TUIs with slash commands, streaming, and (Claude Code) remote control. AGI diverges: **multi-provider** selection sourced only from `packages/contracts/types/src/models.json`; **BYOK** direct-key runs here (never Web/Mobile); **per-surface trust** with a visible `PrivacyMode` and explicit Local→BYOK fork; **local-first** default (Ollama/LMStudio) never silently upgraded to cloud. Remote control is a 🔭 parity target — a secure remote window, not a data migration.

## Acceptance / Definition of Done

The interface is production-ready when every advertised command/flag has a real handler, help text, and a test; trust mode is always visible and never crosses implicitly; and streaming/interrupt paths are corruption-free.

- [ ] Build: `cargo test -p agiworkforce-cli` green; `agi completion <shell>` emits `agi`-named scripts; TUI-coverage test passes for every registry builtin.
- [ ] Trust: `PrivacyMode` label rendered in footer/exec output; Local never routes to BYOK/Managed without the armed `pending_byok_handoff` fork (context selection, secret scan, payload preview, consent, provider label).
- [ ] Security: `--no-sandbox` shows the red indicator; interrupts preserve session state and trust mode; no command auto-syncs to app chat.

## Anti-patterns

- Using `agiworkforce <cmd>` in examples (alias-only; use `agi`).
- Silently routing a Local session to BYOK/Managed, or auto-syncing CLI sessions into app chat.
- Hardcoding model IDs instead of reading `packages/contracts/types/src/models.json`; inventing routes, flags, subcommands, or command counts (verify from source).
- Claiming remote control is shipped (it is 🔭; only the `/remote-control` stub exists).
- Referencing removed tiers ("Plus"/`pro_plus`/"Hobby"), inventing Pro/Max INR prices, or adding credit top-ups.
- Referencing Supabase, or renaming Next.js `proxy.ts` to `middleware.ts` in any cross-surface note.
- Showing fake "available"/"working" indicators, unreadable ANSI output, or dead slash commands.
