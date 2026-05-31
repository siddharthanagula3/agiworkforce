# AGIWorkforce Rust-First CLI Parity — Exploration Ledger

> Phase-1 evidence-driven snapshot, 2026-05-14. Every claim cites file:line, capture filename, or command output. Updated incrementally as later milestones verify additional facts.

## Session Start State

- Branch: `main`
- HEAD: `cd4c259ab` (2026-05-14)
- Dirty files (must not be touched by this initiative):
  - `M apps/cli/src/onboarding.rs`
  - `M apps/desktop/e2e/utils/screenshot-helper.ts`
  - `M apps/extension-vscode/package.json`
  - `M apps/extension-vscode/src/utils/api.ts`
  - `?? .tmp_capture/` (`capture_demo_plan.txt`, 65 bytes)
- Toolchain pinned 1.94.0 (`apps/desktop/src-tauri/rust-toolchain.toml`).
- Shipping binary: `~/.cargo/bin/agiworkforce` v1.0, 6.1 MB (per `AGI_WORKFORCE.md`).

## Workspace Reality

- Root `Cargo.toml` members: `apps/desktop/src-tauri`, `apps/cli`, `crates/*`.
- Comment in `Cargo.toml` lines 7–12: 70 codex-rs port crates removed 2026-05-03; reference preserved at `~/Desktop/reference/codex-cli/`.
- Active workspace crates (14 = 12 utility + apps/cli + apps/desktop/src-tauri):
  - `agiworkforce-async-utils`
  - `agiworkforce-execpolicy`
  - `agiworkforce-network-proxy`
  - `agiworkforce-protocol`
  - `agiworkforce-utils-absolute-path`
  - `agiworkforce-utils-cache`
  - `agiworkforce-utils-home-dir`
  - `agiworkforce-utils-image`
  - `agiworkforce-utils-rustls-provider`
  - `agiworkforce-utils-string`
  - `agiworkforce-utils-template`
  - `sandbox-policy` (a.k.a. `agiworkforce-sandbox-policy`)

## apps/cli/src Inventory

- **202 .rs files**, **161,632 LOC total**.
- `main.rs:1-79` declares 68 modules. Deferred markers: marketplace (62), policy (65), sdk_io (67), a2a (72), memory_pipeline (75), skill_learner (77).
- Active TUI entry: `tui/mod.rs:13 pub use tui_app::run;`.
- 42 modules have `#[cfg(test)]` blocks. **No** `apps/cli/tests/` integration test directory.

### Dead Code Map (`apps/cli/src/tui/`)

`tui/mod.rs:1-15` declares as modules only: `color`, `cost_hud`, `shimmer`, `terminal_palette`, `markdown_renderer`, `tui_app`, `widgets` (the last three without `#[allow(dead_code)]`).

**Not declared as modules → not compiled into the binary:**

- `tui/chatwidget.rs` (9,743 LOC) — imports `agiworkforce_core::*`, `agiworkforce_features::*`, `agiworkforce_git_utils::*`, `agiworkforce_otel::*` (none of these crates exist).
- `tui/chatwidget/` (subdirectory; `tests.rs` 12,648 LOC).
- `tui/app.rs` (8,251 LOC) and `tui/app/` subdir.
- `tui/bottom_pane/` (incl. `chat_composer.rs` 9,873 LOC).
- `tui/exec_cell/`, `tui/exec_command.rs`.
- `tui/notifications/`, `tui/public_widgets/`, `tui/render/`, `tui/status/`, `tui/streaming/`, `tui/widgets/widgets_attic_holder/` (?).
- Various standalone files: `app_event.rs`, `app_event_sender.rs`, `app_backtrack.rs`, `ascii_animation.rs`, `audio_device.rs`, `clipboard_paste.rs`, `clipboard_text.rs`, `collaboration_modes.rs`, `custom_terminal.rs`, `cwd_prompt.rs`, `debug_config.rs`, `diff_render.rs`, `external_editor.rs`, `file_search.rs`, `frames.rs`, `get_git_diff.rs`, `history_cell.rs` (4,462 LOC), `insert_history.rs`, `key_hint.rs`, `line_truncation.rs`, `live_wrap.rs`, `markdown_render.rs`, `markdown_stream.rs`, `markdown.rs`, `mention_codec.rs`, `multi_agents.rs`, `pager_overlay.rs`, `resume_picker.rs`, `selection_list.rs`, `session_log.rs`, `skills_helpers.rs`, `slash_command.rs` (active — see note below), `terminal_title.rs`, `text_formatting.rs`, `theme_picker.rs`, `tooltips.rs`, `ui_consts.rs`, `update_action.rs`, `update_prompt.rs`, `updates.rs`, `voice.rs`, `wrapping.rs`.

The exact subset that is truly dead vs partially imported (e.g., from `widgets/`) is determined at M8 by `cargo check --workspace -Z unstable-options --message-format=json` + grep.

Conservative estimate: **~150K LOC of `apps/cli/src/tui/` is not compiled.**

### Two Slash-Command Sources of Truth

- `apps/cli/src/command_registry.rs:187-379` — 40 `builtin_slash_registry_commands()` entries (model, plan, fast, compact, clear, review, diff, copy, init, new, resume, fork, rename, save, history, export, rewind, mcp, skills, permissions, hooks, plugins, status, cost, output-style, fallback, replay, insights, context, config, models, memory, btw, voice, theme, login, logout, feedback, help, exit).
- `apps/cli/src/tui/slash_command.rs:7-67` — parallel `SlashCommand` strum enum with ~35 entries: Model, Fast, Approvals, Permissions, ElevateSandbox, SandboxReadRoot, Experimental, Skills, Review, Rename, New, Resume, Fork, Init, Compact, Plan, Collab, Agent, Diff, Copy, Mention, Status, DebugConfig, Title, Statusline, Theme, Mcp, Apps, Plugins, Logout, Quit, Exit, Feedback, Rollout, Ps, Stop/clean, Clear, Personality, Realtime, Settings, TestApproval, MultiAgents/subagents, MemoryDrop, MemoryUpdate.
- Overlap is partial; drift exists. M1 consolidates registry as the single source and rewrites `slash_command.rs` as a derived view.

### Subsystem Reality (file:line)

- **`command_registry.rs` (680 LOC)** — `pub struct CommandRegistry`, `RegistryCommand`, `CommandSource`. `find(name)` matches name + aliases. Registered aliases: `/resume → sessions` (246), `/permissions → perms, approvals` (273), `/help → h, ?` (370), `/exit → quit, q` (377), `/context → ctx` (318), `/models → providers` (326), `/memory → mem` (333), `/voice → v` (347), `/feedback → bug` (363), `/fork → branch` (253), `/model → m` (194). Plugin commands merged at `:427-494`. Custom prompts merged with `prompts:` prefix at `:393-413`.
- **`agents.rs` (464 LOC)** — `AgentDefinition` (name, description, model, tools, disallowed_tools, max_turns, permission_mode, system_prompt). `discover_agents()` probes `.agiworkforce/agents/` (cwd) and `<config>/agents/` (home). YAML frontmatter at lines 87–105. **No** `.claude/agents/` or `.codex/agents/` probe.
- **`skills.rs` (873 LOC)** — `Skill` (name, description, content, body, path, allow_implicit, category, required_env_vars). `discover_skills()` probes `.agiworkforce/skills/`, global, and plugin paths (`:75-123`). **No** `.claude/skills/` probe.
- **`plugins.rs` (694 LOC)** — `ManifestFormat` enum with 5 variants: `Agiworkforce`, `ClaudeCode`, `Codex`, `LegacyApp`, `LegacyMcp`. `MANIFEST_PATHS` probed in priority order (`:69-75`). `LoadedPlugin` carries skill_roots, mcp_servers, manifest_commands, manifest_agents, manifest_skills, manifest_hooks, manifest_dependencies. Project-scoped plugins have hook contribution disabled (`:86-92`).
- **`mcp/mod.rs` (~1,695 LOC)** — 3 transports + OAuth. `McpServerConfig` enum (Tagged with `McpTransport`, Legacy backward-compat). `McpTransport` variants: Stdio, Sse, Http (with OAuth placeholder at `:104`). Functional dispatch for stdio + SSE + HTTP via `connect_*` / `send_request_*` paths.
  - `mcp/http.rs` (555 LOC), `mcp/sse.rs` (171 LOC), `mcp/oauth_flow.rs` (1,048 LOC).
- **`plan_mode.rs` (128 LOC)** — `Plan` and `PlanStep` data types, `render_markdown`, `write_to_disk`, unit tests at `:90-127`.
- **`tools.rs` (3,109 LOC)** — dispatch table of 21 tools at `:142-205`. Legacy `plan_mode` tool deleted at `:193` per comment.
- **`app_server.rs` (236 LOC)** — `JsonRpcRequest/Response`, `Processor::process`. Currently handles only `initialize`, `tools/list`, `shutdown` (lines 87-100). `tools/list` returns a 12-name string array without `inputSchema`. `WebSocket` transport on 127.0.0.1:8787 via axum. Separate `run_mcp_server()` at `:187-236` handles MCP-style stdio with a single `agiworkforce_exec` tool (this one has a proper schema). **Wired** in `main.rs:38` (mod), `main.rs:1137` (McpServer command), `main.rs:1158` (AppServer command).
- **`hooks.rs` (1,949 LOC)** — 33 hook events at `:73-134`: 11 Claude Code parity (SessionStart, SessionEnd, PreToolUse, PostToolUse, UserPromptSubmit, BeforeModelResolve, BeforePromptBuild, ToolResultPersist, PermissionRequest, Notification, Stop) + 22 AGI-specific (AfterMessage, PlanModeChanged, SubagentStart, SubagentStop, CronTriggered, WebhookReceived, FileChanged, DaemonStarted, DaemonStopped, PreCompact, PostCompact, …). Memory's "22 events" claim was wrong.
- **`models.rs` (2,589 LOC)** — `Provider` enum: Anthropic, Google, Ollama, OpenAICompatible, Custom. 9 cloud providers wired (Anthropic, OpenAI, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, Google) + Ollama + LMStudio. Mistral dropped 2026-05-03 per `models.rs:310` comment.
- **`sdk_io/*`** — DEFER per `main.rs:67`. Scaffold-only (`mod.rs` 31 LOC).
- **`policy/engine.rs`** — `PolicyDecision`, `PolicyRule`, `PolicyEngine::load_workspace`, `evaluate()`. `#[allow(dead_code)]` — not called from `repl.rs` or `agent.rs`.

### Largest Files

1. `tui/chatwidget/tests.rs` — 12,648 LOC (dead).
2. `tui/bottom_pane/chat_composer.rs` — 9,873 LOC (dead).
3. `tui/chatwidget.rs` — 9,743 LOC (dead).
4. `tui/app.rs` — 8,251 LOC (dead).
5. `tui/history_cell.rs` — 4,462 LOC (dead).

The five largest are all in the codex-rs-port leftover surface, **none of which is the active TUI**.

## Reference Truth Sources

### UI Captures

- Run directory: `/Users/siddhartha/Desktop/reference/ui-capture-runs/20260513-185809-agent-platform-reference/`
- Format: paired `.png` + `.txt` text capture per screen.
- 26 CLI screens captured under `screenshots/claude-code/`, numbered 600–627, deduping the slash-palette scroll captures (607–618) into one row → 16 unique screens.
- `screenshots/codex/` and `screenshots/opencode/` directories are **empty**. Parity target is Claude Code v2.1.128 only.
- Logs: `logs/{capture-summary.md, manifest.jsonl, failures.jsonl, account-state-notes.md, permission-pauses.md, source-derived-next-capture-plan.md}`.

#### Captured CLI Screens

| #       | File                                  | What it shows                                                                                        |
| ------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 600     | `600_cli_chrome-command-menu.txt`     | `/chrome` menu: Status / Extension / Manage permissions / Reconnect / Enabled-by-default / docs link |
| 601     | `601_cli_ide-select-dialog.txt`       | `/ide` empty-state dialog                                                                            |
| 602     | `602_cli_mcp-list-scopes.txt`         | `/mcp` grouped list, 21 servers, status glyphs                                                       |
| 603     | `603_cli_mcp-built-in-detail.txt`     | `/mcp` single-server detail view                                                                     |
| 605     | `605_cli_plan-mode-screen.txt`        | Plan-mode footer: `⏸ plan mode on (shift+tab to cycle)` + `● high · /effort`                         |
| 607–618 | slash command palette scroll          | Scrollable palette starting `/init, /team-onboarding, /security-review, …`                           |
| 619     | `619_cli_agents-screen.txt`           | `/agents` Running tab (empty)                                                                        |
| 620     | `620_cli_agents-library-tab.txt`      | `/agents` Library tab grouped Project + Built-in                                                     |
| 621     | `621_cli_skills-screen.txt`           | `/skills` empty: "Create skills in .claude/skills/ or ~/.claude/skills/"                             |
| 622     | `622_cli_plugin-screen.txt`           | `/plugin` Discover empty                                                                             |
| 623     | `623_cli_plugin-installed-tab.txt`    | Installed grouped Needs attention / Project with glyphs                                              |
| 624     | `624_cli_plugin-marketplaces-tab.txt` | Marketplaces with `❯ + Add Marketplace`                                                              |
| 625     | `625_cli_plugin-errors-tab.txt`       | Errors empty                                                                                         |
| 626     | `626_cli_tasks-screen.txt`            | `/tasks` screen                                                                                      |
| 627     | `627_cli_permissions-screen.txt`      | `/permissions` 5-tab overlay                                                                         |

Header on every capture: logo box + `Claude Code v2.1.128` + `Sonnet 4.6 with high effort · Claude Max` + `~/Desktop/agiworkforce` + `/remote-control is active …`.

Deferred (per `logs/source-derived-next-capture-plan.md`): 604 (computer-use TCC), 606 (file-edit IDE diff handoff).

Not captured for CLI: `/model`, `/theme`, `/effort` (described in reference TS source, lower priority).

### Reference Source

- `/Users/siddhartha/Desktop/reference/src/commands/` — 103 typescript/Ink command files: agents, plugin, permissions, mcp, chrome, ide, plan, model, theme, effort, tasks, statusline.tsx.
- `/Users/siddhartha/Desktop/reference/src/components/` — Ink/React TUI widgets (agents/AgentsMenu.tsx, mcp/MCPListScopes.tsx, mcp/MCPDetail.tsx, plugin/PluginTabs.tsx, permissions/PermissionsTable.tsx).
- `/Users/siddhartha/Desktop/reference/src/tools/`, `tasks/`, `services/`, `utils/` — supporting modules.
- Reference is TypeScript. We port behavior, not code (license clean-room).

### Other Reference Repos

- `/Users/siddhartha/Desktop/reference/codex-cli/` — Rust + TypeScript, preserved from 2026-05-03 70-crate removal.
- `/Users/siddhartha/Desktop/reference/openclaw/` — TS monorepo.
- `/Users/siddhartha/Desktop/reference/claw-code/` — TS + Node.js + Ink.
- `/Users/siddhartha/Desktop/reference/gemini-cli/`, `/Users/siddhartha/Desktop/reference/opencode/` — out of immediate parity scope.

## Pre-Existing Planning Artifacts

- `/Users/siddhartha/Desktop/agiworkforce/AGI_WORKFORCE.md` — SSOT (CLI v1.0 shipped 2026-05-03, 22 subcommands, 10+ providers).
- `/Users/siddhartha/Desktop/agiworkforce/BUILD.md` — per-surface build commands, Rust toolchain.
- `/Users/siddhartha/Desktop/agiworkforce/CLAUDE.md` — locked rules: models.json SSOT, lowercase commitlint ≤100 chars, web-search before competitor facts, 14 active crates.
- `/Users/siddhartha/Desktop/agiworkforce/docs/plans/UNIFIED_LAUNCH_PLAN.md` — canonical 2026-05-04, 11 P0 + 27 P1.
- Three artifact files (this initiative's deliverables) **created in M0**:
  - `AGIWORKFORCE_RUST_REVERSE_ENGINEERING_PLAN.md`
  - `AGIWORKFORCE_EXPLORATION_LEDGER.md` (this file)
  - `AGIWORKFORCE_IMPLEMENTATION_LOG.md`

## Contradictions Found vs Prior Memory

1. **Memory: "22 canonical hook events"** → **Reality: 33** (`hooks.rs:73-134`).
2. **Memory: "200 .rs files in apps/cli"** → **Reality: 202** (verified via `find` + `wc -l`).
3. **Prompt: "app_server.rs is currently likely a stub"** → **Reality: functional** (236 LOC, JsonRpc + WebSocket + stdio + MCP-style fallback). Gap is `tools/call` dispatch, not stub status.
4. **Memory: "skills.rs ~430 LOC"** → **Reality: 873 LOC**.
5. **Memory: "44 buildable but unused crates"** in `crates/` → **Reality: only 12 utility crates remain**; the 70 codex-rs ports were deleted from disk per `Cargo.toml:7-12`.
6. **Memory: "Captured CLI screens include /tasks"** — confirmed (`626_cli_tasks-screen.txt`).
7. **Prompt: "active TUI is currently `apps/cli/src/tui/tui_app.rs`"** — confirmed. **But** the brief implied the ~12K LOC `chatwidget.rs` was the active widget; it's not — it's dead code.

## Open Questions Resolved in Plan

- "Full rewrite vs incremental extraction" — **incremental** (plan approved).
- "Where do `/chrome`, `/ide`, `/agents`, `/tasks` live today?" — **nowhere**; not registered.
- "Are `/plugin` / `/plugins` / `/marketplace` aliased?" — **no**; `/plugins` is standalone, `/marketplace` is in `repl.rs` text-only, `/plugin` does not exist.
- "Does `tools/call` work in app_server?" — **no** (`app_server.rs:87-100` lacks the arm).
- "Is the OAuth flow wired?" — programmatically yes (transport works); UX hook in `/mcp` overlay is the gap.

## Updates (populated as milestones land)

(empty)
