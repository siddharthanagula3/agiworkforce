# AGI CLI — Volume 23 — UI Components

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/cli/AGENTS.md`, and the real repo paths this volume grounds in: `apps/cli/src/lib.rs`, `apps/cli/src/cli_options.rs`, `apps/cli/src/output.rs`, `apps/cli/src/markdown.rs`, `apps/cli/src/terminal_style.rs`, `apps/cli/src/tui/markdown_renderer.rs`, `apps/cli/src/tui/terminal_palette.rs`, `apps/cli/src/tui/shimmer.rs`, `apps/cli/src/tui/widgets/{interactive,diff_review,command_popup,theme_picker}.rs`, `apps/cli/src/agent/mod.rs`, `apps/cli/Cargo.toml`, `docs/surfaces/cli.md`.

## Overview & stance

This volume specifies the terminal UI components of AGI CLI — the pure-Rust surface built on `ratatui` + `crossterm` (`apps/cli/Cargo.toml`). "UI" here means the parser that turns argv and slash input into intents, the interactive prompts/overlays, and the rendering primitives (streaming, markdown, progress, tables, ANSI, diff, status) shared across the exec, REPL, and full-screen TUI paths.

Trust modes shape every component. The CLI runs Local + BYOK + Managed, and `apps/cli/src/agent/mod.rs` (`PrivacyMode`, `validate_privacy_boundary`) is ✅ Built and blocks a Local session from silently reaching a non-local provider. UI components therefore never merely decorate: the status bar and approval overlays must surface the active provider and privacy label so the trust boundary is visible, and any Local→BYOK step must be an explicit consented fork, not a silent style change. Sessions are workspace/session-scoped; there is no automatic app-chat sync from these UI surfaces.

Known remaining TUI work — live-streaming render-context, styled diff overlay, and theme semantic-token routing — are large refactors of proven-working core, tracked as 🟡/🔭 below and in `docs/agent-context` CLI roadmap notes.

## Command Parser

`clap` defines the top-level `Cli` (`#[derive(Parser)]`, `apps/cli/src/lib.rs:137`) and the `Commands` subcommand enum (`apps/cli/src/lib.rs:512`) with short aliases (e.g. `exec`→`e`, `apply`→`a`, `completions`). `apps/cli/src/cli_options.rs` holds `CliOptions`; `shlex` tokenizes shell-style input. In-session slash commands parse via `apps/cli/src/tui/widgets/command_popup.rs` plus `crates/agiworkforce-command-registry`. ✅ Built. Requirements: unknown subcommand → non-zero exit with usage; `--help`/`-h` and `agi completions` are clap-generated; the binary is `agi` (`Cargo.toml` `[[bin]] name = "agi"`) — `agiworkforce` is a compatibility alias only and must never appear in examples. Never assert exact command/flag counts without re-reading source.

## Interactive Prompts

Line prompts use `dialoguer` 0.11; the REPL uses `rustyline` 14 (`Cargo.toml`). Full-screen overlays implement the `InteractiveView` trait (`KeyAction`/`ViewAction`) in `apps/cli/src/tui/widgets/interactive.rs`, with concrete views for approvals, elicitation, model/effort pickers, the command popup, theme picker, and diff review. ✅ Built. Trust requirements: approval and picker prompts must display the provider and privacy-mode label; a Local→BYOK prompt must present context selection, secret scan, payload preview, visible provider label, and explicit consent (backed by `agent/mod.rs` `arm_byok_handoff`/`consume_byok_handoff`). Non-interactive/exec paths must fail closed on approvals unless the caller explicitly passed a skip-permissions flag.

## Streaming Renderer

`apps/cli/src/markdown.rs` `MarkdownRenderer::process_chunk` consumes SSE fragments, buffering incomplete lines and emitting complete ones; `apps/cli/src/models/streaming.rs` drives the provider stream and `MessageDelta` callbacks. ✅ Built for exec/REPL. 🟡 Live-streaming inside the full-screen TUI: the turn loop holds `&mut app.session` across `send()`, parking redraw so output appears all-at-once and the spinner freezes (`apps/cli/src/tui/tui_app.rs`); the de-risked fix routes render through a disjoint-borrow `RenderCtx`. Requirements: never split an ANSI escape across chunk boundaries; cancel mid-stream shows `⊘ Stopped` and the session recovers.

## Markdown Renderer

Two renderers exist. The ANSI streaming path (`apps/cli/src/markdown.rs`) formats headings, lists, rules, code fences, and tables for exec/REPL. The full-screen path (`apps/cli/src/tui/markdown_renderer.rs`) `render_markdown()` parses via `pulldown-cmark` into styled ratatui `Line`s with `syntect` + `two-face` syntax highlighting. ✅ Built. Requirements: fenced code highlights by language tag; unknown languages degrade to plain text; GFM tables render (a prior regression made them vanish — guard with a snapshot test). Highlighting is fully offline — no network, no data leaves the host.

## Progress Indicators

`apps/cli/src/output.rs` provides `create_progress_bar` (indicatif, templated by `terminal_style::PROGRESS_BAR_TEMPLATE`) and `create_spinner` (braille tick set, 80 ms steady tick, `SPINNER_TEMPLATE`); `apps/cli/src/tui/shimmer.rs` adds the shimmer "thinking" animation with an AGI verb. ✅ Built. 🟡 A truly animated in-turn spinner in the TUI depends on the same render-context refactor. Requirement: under `NO_COLOR` or a non-TTY, indicators degrade to plain lines with no escape spam.

## Tables

`apps/cli/src/output.rs` `format_table` renders aligned columns with a `─` header separator; the TUI markdown path renders GFM tables (`Tag::Table` handling in `tui/markdown_renderer.rs`). ✅ Built. Requirements: column width = max(header, cell) per column; empty headers → empty string. 🟡 Gap: `format_table` measures width with byte/char length, so CJK and other wide glyphs misalign; adopt display-width measurement (as `diff_review::truncate_cols` already counts scalar values) before claiming full Unicode support.

## ANSI Formatting

`apps/cli/src/terminal_style.rs` centralizes semantic wrappers over `colored` (`muted`, `accent`, `brand`, `success`, `warning`, `danger`, their `*_header` variants, `addition`, `deletion`, `code`, `link`, `prompt`, and `info/warn/error` labels). `output.rs::detect_color_level` resolves capability from `NO_COLOR`/`COLORTERM`/`TERM` (None/Ansi16/Ansi256/TrueColor); `apps/cli/src/tui/terminal_palette.rs` performs light/dark detection (COLORFGBG); `apps/cli/src/tui/color.rs` maps palette entries. ✅ Built. 🟡 `/theme` (`tui/widgets/theme_picker.rs`) does not yet re-route colors through a semantic-token layer — the theme re-route is a tracked refactor. Requirement: honor `NO_COLOR` everywhere and downgrade truecolor to 256/16 by detected level.

## Diff Viewer

`apps/cli/src/tui/widgets/diff_review.rs` `DiffReviewView` presents per-file diffs (`FileDiff { path, hunks, additions, deletions }`) with `y`/`n`/`s` decisions, `↑`/`↓` navigation, and `Enter` to finalize (`ReviewDecision`); patch application lives in `apps/cli/src/apply_patch.rs`. ✅ Built (functional review + additions/deletions colored via `terminal_style::addition`/`deletion` in the ANSI path). 🟡 Styled overlay gap: `InteractiveView::render()` returns a plain `String` drawn as unstyled `Line`s (`tui_app.rs`), so the overlay lacks syntax highlighting, a change gutter, and colored `+/-`; fixing it touches the shared overlay display path used by all pickers, so it is scoped as an isolated refactor.

## Status Messages

`terminal_style.rs` provides `info_label`/`warn_label`/`error_label`; `output.rs::print_user_prompt` renders the input marker; the width-priority status bar plus context fill bar live in `tui_app.rs` and `apps/cli/src/tui/cost_hud.rs`; `apps/cli/src/tui/widgets/statusline_setup.rs` and `apps/cli/src/mcp/status.rs` cover statusline/MCP health. ✅ Built. Requirements: errors are actionable and human-readable (no raw provider JSON — a bad-key raw-JSON leak was fixed); the status bar must show the active model and privacy-mode label so the Local/BYOK/Managed boundary is always visible.

## Repository map

- `apps/cli/src/lib.rs`, `apps/cli/src/cli_options.rs`, `apps/cli/src/command_registry.rs`, `apps/cli/src/custom_commands.rs` — argv + slash parsing.
- `apps/cli/src/output.rs`, `apps/cli/src/markdown.rs`, `apps/cli/src/terminal_style.rs` — exec/REPL rendering primitives.
- `apps/cli/src/tui/markdown_renderer.rs`, `apps/cli/src/tui/{shimmer,color,terminal_palette,cost_hud,tui_app}.rs` — full-screen TUI rendering.
- `apps/cli/src/tui/widgets/{interactive,diff_review,command_popup,model_picker,effort_picker,approval_overlay,elicitation_overlay,theme_picker,statusline_setup,snapshot_smoke}.rs` — overlays + snapshot tests.
- `crates/agiworkforce-command-registry` — slash-command registry.

## Competitor notes

Claude Code CLI and OpenAI Codex CLI ship polished single-provider terminal UIs. AGI's deliberate divergence: multi-provider rendering (10+ providers per `Cargo.toml`), BYOK where the surface allows it (Desktop/CLI/VS Code only), per-surface trust with the privacy mode surfaced in the status bar and approval overlays, and local-first rendering — syntax highlighting and markdown run fully offline via `syntect`/`two-face`, so a Local session's content never leaves the host to be styled. Parity references only; no proprietary code or branding is copied.

## Acceptance / Definition of Done

- [ ] Build/behavior: `cargo test -p agiworkforce-cli --lib` passes, including tool-definition and snapshot smoke tests; `cargo check -p agiworkforce-cli` clean; markdown/table/diff snapshots stable.
- [ ] Rendering: markdown (incl. GFM tables + highlighted code), spinner/progress, tables, and diff review render correctly on a truecolor terminal and degrade cleanly under `NO_COLOR` and non-TTY pipes.
- [ ] Trust: every prompt/status surface shows provider + privacy label; a Local session cannot reach a non-local provider without the explicit BYOK fork (`validate_privacy_boundary`); exec approvals fail closed without an explicit skip flag.

## Anti-patterns

- Rendering that hides the trust boundary — omitting the provider/privacy label, or styling a Local→BYOK transition without the consented fork.
- Emitting raw ANSI/escape sequences when `NO_COLOR` is set or output is piped; splitting an escape across stream chunks.
- Printing raw provider JSON as an error instead of an actionable message.
- Claiming the live-streaming, styled-diff, or theme-reroute work is shipped — they are 🟡/🔭.
- Hardcoding or inventing model IDs in table/status examples (model IDs come only from `packages/contracts/types/src/models.json`); referencing removed tiers (Plus, `pro_plus`, Hobby) or credit top-ups; using `agiworkforce <cmd>` in examples instead of `agi`; referencing Supabase.
