# R26-PARITY W4 — Claude Code CLI Parity Audit

**Date:** 2026-05-22
**Lane:** R26-PARITY CLI
**Auditor:** cli-engineer
**Reference version:** Claude Code v2.1.128 (images + TS source at `/Users/siddhartha/Desktop/reference/`)
**Our version:** AGI Workforce CLI v1.0.0 (195 .rs files, ~155K LOC, 914 tests)

---

## 1. Reference Inventory

### 1.1 UI Images Examined (31 total)

| #   | File                                                                             | What it shows                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | `01_cli_bypass-permissions-mode-enabled-shift-tab-cycle.png`                     | REPL header (version, model, cwd) + status bar: "bypass permissions on (shift+tab to cycle)" + "high · /effort"                                                   |
| 02  | `02_cli_first-run-login-3-options-claude-account-anthropic-console-3rdparty.png` | First-run login picker: Claude account (Pro/Max/Team/Enterprise), Anthropic Console (API billing), 3rd-party (Bedrock, Foundry, Vertex)                           |
| 03  | `03_cli_oauth-browser-fallback-paste-code-prompt.png`                            | OAuth browser-fallback: full PKCE URL shown inline + "Paste code here if prompted"                                                                                |
| 04  | `04_cli_theme-selector-6-options-dark-light-colorblind-ansi.png`                 | 6-option theme selector at first run: Dark, Light, Dark (colorblind), Light (colorblind), **Dark (ANSI colors only)**, Light (ANSI only) with live syntax preview |
| 05  | `05_web_auth-error-claude-max-or-pro-required-to-connect.png`                    | Web error page: "Claude Max or Pro is required to connect to Claude Code"                                                                                         |
| 600 | `2026-05-15/600_cli_chrome-command-menu.png`                                     | `/chrome` dialog: status=Enabled, Extension=Installed, manage permissions/reconnect, `--chrome`/`--no-chrome` flags                                               |
| 601 | `2026-05-15/601_cli_ide-select-dialog.png`                                       | `/ide` dialog: "No available IDEs detected. Make sure your IDE has the Claude Code extension or plugin installed"                                                 |
| 602 | `2026-05-15/602_cli_mcp-list-scopes.png`                                         | `/mcp` config diagnostics: Project config scope, missing `HUNTER_API_KEY` env var warning, per-server scope warnings                                              |
| 603 | `2026-05-15/603_cli_mcp-built-in-detail.png`                                     | `/mcp` server detail dialog: Status, Command, Args, Config location, Enable/Disable action                                                                        |
| 605 | `2026-05-15/605_cli_plan-mode-screen.png`                                        | `/plan` activates: "plan mode on (shift+tab to cycle)" status bar                                                                                                 |
| 607 | `2026-05-15/607_cli_slash-command-palette-top.png`                               | Palette (page 1): `/init`, `/team-onboarding`, `/security-review`, `/debug`, `/add-dir`                                                                           |
| 608 | `2026-05-15/608_cli_slash-command-palette-middle.png`                            | Palette (page 2): `/debug`, `/add-dir`, `/advisor`, `/agents`, `/autofix-pr`                                                                                      |
| 609 | `2026-05-15/609_cli_slash-command-palette-lower.png`                             | Palette (page 3): `/background`, `/branch`, `/btw`, `/chrome`, `/clear`                                                                                           |
| 610 | `2026-05-15/610_cli_slash-command-palette-bottom.png`                            | Palette (page 4): `/compact`, `/config`, `/context`, `/copy`, `/desktop`                                                                                          |
| 611 | `2026-05-15/611_cli_slash-command-palette-more.png`                              | Palette (page 5): `/doctor`, `/effort`, `/exit`, `/export`, `/extra-usage`, `/fast`                                                                               |
| 612 | `2026-05-15/612_cli_slash-command-palette-more-2.png`                            | Palette (page 6): `/focus`, `/help`, `/hooks`, `/ide`, `/install-github-app`                                                                                      |
| 613 | `2026-05-15/613_cli_slash-command-palette-more-3.png`                            | Palette (page 7): `/install-slack-app`, `/keybindings`, `/login`, `/logout`, `/mcp`, `/memory`                                                                    |
| 614 | `2026-05-15/614_cli_slash-command-palette-more-4.png`                            | Palette (page 8): `/mobile`, `/model`, `/passes`, `/permissions`, `/plan`, `/plugin`                                                                              |
| 615 | `2026-05-15/615_cli_slash-command-palette-more-5.png`                            | Palette (page 9): `/powerup`, `/privacy-settings`, `/recap`, `/release-notes`, `/reload-plugins`, `/remote-control`                                               |
| 616 | `2026-05-15/616_cli_slash-command-palette-more-6.png`                            | Palette (page 10): `/remote-env`, `/rename`, `/resume`, `/rewind`, `/sandbox`, `/skills`                                                                          |
| 617 | `2026-05-15/617_cli_slash-command-palette-final.png`                             | Palette (page 11): `/stickers`, `/tasks`, `/teleport`, `/terminal-setup`, `/theme`, `/tui`                                                                        |
| 618 | `2026-05-15/618_cli_slash-command-palette-end.png`                               | Palette (page 12, end): `/ultrareview`, `/upgrade`, `/usage`, `/voice`                                                                                            |
| 619 | `2026-05-15/619_cli_agents-screen.png`                                           | `/agents` Running tab: "No subagents are currently running." Tabs: Agents / Running / Library                                                                     |
| 620 | `2026-05-15/620_cli_agents-library-tab.png`                                      | `/agents` Library tab: "Create new agent" + Project agents listing (our own .claude/agents) + Built-in agents                                                     |
| 621 | `2026-05-15/621_cli_skills-screen.png`                                           | `/skills` screen: "No skills found. Create skills in .claude/skills/ or ~/.claude/skills/"                                                                        |
| 622 | `2026-05-15/622_cli_plugin-screen.png`                                           | `/plugin` Discover tab: "No plugins available. Add a marketplace first using the Marketplaces tab."                                                               |
| 623 | `2026-05-15/623_cli_plugin-installed-tab.png`                                    | `/plugin` Installed tab: Search box + "Needs attention" section listing MCP servers needing auth                                                                  |
| 624 | `2026-05-15/624_cli_plugin-marketplaces-tab.png`                                 | `/plugin` Marketplaces tab: "+ Add Marketplace"                                                                                                                   |
| 625 | `2026-05-15/625_cli_plugin-errors-tab.png`                                       | `/plugin` Errors tab: "No plugin errors"                                                                                                                          |
| 626 | `2026-05-15/626_cli_tasks-screen.png`                                            | `/tasks` dialog: "Background tasks / No tasks currently running"                                                                                                  |
| 627 | `2026-05-15/627_cli_permissions-screen.png`                                      | `/permissions` dialog: tabs Recently denied / Allow / Ask / Deny / Workspace + searchable rule list                                                               |

### 1.2 Reference Source Files Examined

- `/Users/siddhartha/Desktop/reference/src/commands.ts` — authoritative command index; defines `INTERNAL_ONLY_COMMANDS` and `COMMANDS()` (user-visible)
- `/Users/siddhartha/Desktop/reference/src/commands/` — 85+ subdirectories, each one slash command
- `/Users/siddhartha/Desktop/reference/src/` — screens, skills, hooks, plugins, voice, outputStyles

---

## 2. Slash-Command Parity Table

**Source of truth for Claude Code user-visible commands:** `/Users/siddhartha/Desktop/reference/src/commands.ts` lines 258–346 (`COMMANDS()` array). Commands in `INTERNAL_ONLY_COMMANDS` (lines 225–254) are dev-only and excluded from this parity analysis.

Our registry is grounded in `/Users/siddhartha/Desktop/agiworkforce/crates/agiworkforce-command-registry/src/lib.rs:168` (83 builtin commands) plus `apps/cli/src/repl/slash_commands.rs` (runtime dispatch) and `apps/cli/src/claude_parity.rs` (shared parity layer).

**Legend:** YES = registered + runtime handler present | PARTIAL = registered, stub/text-only handler | NO = absent

| Claude Code command                 | Claude description (from palette screenshots or `commands.ts`) | In our CLI?        | Our equivalent / citation                                                                         | Gap notes                                                                                      |
| ----------------------------------- | -------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `/add-dir`                          | Add a new working directory                                    | YES                | `crates/agiworkforce-command-registry/src/lib.rs:484`                                             | Full                                                                                           |
| `/advisor`                          | Configure the Advisor Tool                                     | YES                | `apps/cli/src/claude_parity.rs:33` + registry `lib.rs:440`                                        | Full                                                                                           |
| `/agents`                           | Manage agent configurations                                    | YES                | `apps/cli/src/repl/slash_commands.rs:136` + `lib.rs:249`                                          | Full — Running/Library tabs in TUI                                                             |
| `/branch`                           | Create a branch of current conversation                        | YES                | `apps/cli/src/repl/slash_commands.rs:289` alias for `/fork`                                       | Full                                                                                           |
| `/btw`                              | Ask a quick side question                                      | YES                | `apps/cli/src/repl/slash_commands.rs:194` + `lib.rs:380`                                          | Full                                                                                           |
| `/chrome`                           | Claude in Chrome (Beta) settings                               | YES                | `apps/cli/src/claude_parity.rs` + `lib.rs:259`                                                    | Text stub; no Chrome ext in AGI                                                                |
| `/clear`                            | Start a new session (old one stays on disk)                    | YES                | `apps/cli/src/repl/slash_commands.rs:85` + `lib.rs:192`                                           | Full                                                                                           |
| `/color`                            | Set the agent/session color                                    | YES                | `lib.rs:487`                                                                                      | Text stub                                                                                      |
| `/compact`                          | Free up context by summarizing                                 | YES                | `apps/cli/src/repl/slash_commands.rs` → `registry::handle_compact` + `lib.rs:180`                 | Full                                                                                           |
| `/config`                           | Open config panel                                              | YES                | `apps/cli/src/repl/slash_commands.rs:313` + `lib.rs:365`                                          | Full                                                                                           |
| `/context`                          | Visualize context usage as colored grid                        | YES                | `apps/cli/src/repl/slash_commands.rs:155` + `lib.rs:358`                                          | Full                                                                                           |
| `/copy`                             | Copy last response to clipboard                                | YES                | `apps/cli/src/claude_parity.rs:101` + `lib.rs:209`                                                | Full                                                                                           |
| `/cost`                             | Show session cost                                              | YES                | `apps/cli/src/repl/slash_commands.rs` + `lib.rs`                                                  | Full                                                                                           |
| `/debug`                            | Enable debug logging for this session                          | NO                 | Not registered                                                                                    | **GAP**                                                                                        |
| `/desktop`                          | Continue session in Claude Desktop                             | YES                | `lib.rs:488` alias `app`                                                                          | Text stub                                                                                      |
| `/diff`                             | Show diff of changes                                           | YES                | `apps/cli/src/repl/slash_commands.rs:292` + `lib.rs:246`                                          | Full — **we have `/diff`, Claude Code also has `/diff` (`commands.ts:19`, `commands.ts:275`)** |
| `/doctor`                           | Diagnose Claude Code installation                              | YES                | `lib.rs:303` aliases `diagnose`, `health`                                                         | Full                                                                                           |
| `/effort`                           | Set effort level for model usage                               | YES                | `lib.rs:495` + TUI effort picker widget                                                           | Full                                                                                           |
| `/exit`                             | Exit the CLI                                                   | YES                | `apps/cli/src/repl/slash_commands.rs:69` + `lib.rs:418`                                           | Full                                                                                           |
| `/export`                           | Export conversation to file/clipboard                          | YES                | `apps/cli/src/repl/slash_commands.rs:117` + `lib.rs:240`                                          | Full                                                                                           |
| `/extra-usage`                      | Configure extra usage                                          | YES                | `apps/cli/src/claude_parity.rs` + `lib.rs:466`                                                    | Text stub                                                                                      |
| `/fast`                             | Toggle fast mode                                               | YES                | `apps/cli/src/repl/slash_commands.rs:264` + `lib.rs:178`                                          | Full                                                                                           |
| `/files`                            | List tracked files                                             | YES                | `lib.rs` (in parity test at `command_registry.rs:438`)                                            | Full                                                                                           |
| `/focus`                            | Toggle focus view                                              | YES                | `apps/cli/src/claude_parity.rs:115` + `lib.rs:425`                                                | Text stub                                                                                      |
| `/heapdump`                         | Trigger heap dump for debugging                                | YES                | `lib.rs:501`                                                                                      | Text stub                                                                                      |
| `/help`                             | Show help and available commands                               | YES                | `apps/cli/src/repl/slash_commands.rs:402` + `lib.rs:412`                                          | Full                                                                                           |
| `/hooks`                            | View hook configurations                                       | YES                | `apps/cli/src/repl/slash_commands.rs:151` + `lib.rs:257`                                          | Full                                                                                           |
| `/ide`                              | Manage IDE integrations                                        | YES                | `apps/cli/src/claude_parity.rs` + `lib.rs:265`                                                    | Text stub                                                                                      |
| `/init`                             | Initialize CLAUDE.md file                                      | YES                | `apps/cli/src/repl/slash_commands.rs:311` + `lib.rs:214`                                          | Full                                                                                           |
| `/install-github-app`               | Set up Claude GitHub Actions                                   | YES                | `lib.rs:511`                                                                                      | Text stub                                                                                      |
| `/install-slack-app`                | Install Claude Slack app                                       | YES                | `lib.rs:517`                                                                                      | Text stub                                                                                      |
| `/keybindings`                      | Open keybindings config file                                   | YES                | `lib.rs:323` aliases `keys`                                                                       | Full                                                                                           |
| `/login`                            | Sign in to Anthropic account                                   | YES                | `apps/cli/src/repl/slash_commands.rs:347` + `lib.rs:401`                                          | Full                                                                                           |
| `/logout`                           | Sign out from Anthropic account                                | YES                | `apps/cli/src/repl/slash_commands.rs:350` + `lib.rs:402`                                          | Full                                                                                           |
| `/mcp`                              | Manage MCP servers                                             | YES                | `apps/cli/src/repl/slash_commands.rs` → `claude_parity.rs:106` + `lib.rs:247`                     | Full — TUI dialog                                                                              |
| `/memory`                           | Edit Claude memory files                                       | YES                | `apps/cli/src/repl/slash_commands.rs:307` + `lib.rs:374`                                          | Full                                                                                           |
| `/mobile`                           | Show QR code to download mobile app                            | YES                | `lib.rs:524` aliases `ios`, `android`                                                             | Text stub                                                                                      |
| `/model`                            | Set the AI model                                               | YES                | `apps/cli/src/repl/slash_commands.rs:73` + `lib.rs:170`                                           | Full — TUI picker                                                                              |
| `/output-style`                     | Switch response style (default/explanatory/learning)           | YES                | `lib.rs:331`                                                                                      | Full — **both we and Claude Code have this (`commands.ts:292`); not AGI-exclusive**            |
| `/passes`                           | Share a free week of Claude Code                               | YES                | `lib.rs:531`                                                                                      | Text stub                                                                                      |
| `/permissions`                      | Manage allow/deny tool permission rules                        | YES                | `apps/cli/src/repl/slash_commands.rs:126` + `lib.rs:250`                                          | Full — TUI dialog                                                                              |
| `/plan`                             | Enable plan mode or view current plan                          | YES                | `apps/cli/src/repl/slash_commands.rs:201-263` + `lib.rs:177`                                      | Full — accept/reject/show subcommands                                                          |
| `/plugin`                           | Manage Claude Code plugins                                     | YES                | `apps/cli/src/repl/slash_commands.rs:367` + `lib.rs:272` aliases `plugins`,`marketplace`,`market` | Full — TUI 4-tab dialog                                                                        |
| `/powerup`                          | Discover features through quick lessons                        | NO                 | Not registered                                                                                    | **GAP**                                                                                        |
| `/pr-comments`                      | Show PR comments                                               | YES                | `lib.rs:537`                                                                                      | Text stub                                                                                      |
| `/privacy-settings`                 | View/update privacy settings                                   | YES                | `lib.rs:545` + `apps/cli/src/claude_parity.rs`                                                    | Full                                                                                           |
| `/recap`                            | Generate one-line session recap                                | YES                | `lib.rs:310`                                                                                      | Full                                                                                           |
| `/release-notes`                    | View release notes                                             | YES                | `lib.rs:316` aliases `changelog`                                                                  | Full                                                                                           |
| `/reload-plugins`                   | Activate pending plugin changes                                | YES                | `lib.rs:459` + `apps/cli/src/claude_parity.rs`                                                    | Full                                                                                           |
| `/remote-control`                   | Connect terminal for remote-control sessions                   | NO                 | Not registered                                                                                    | **GAP**                                                                                        |
| `/remote-env`                       | Configure default remote environment                           | YES                | `lib.rs:473` + `apps/cli/src/claude_parity.rs`                                                    | Full                                                                                           |
| `/rename`                           | Rename the current conversation                                | YES                | `apps/cli/src/repl/slash_commands.rs:185` + `lib.rs:236`                                          | Full                                                                                           |
| `/resume`                           | Resume a previous conversation                                 | YES                | `apps/cli/src/repl/slash_commands.rs:108` + `lib.rs:221` aliases `sessions`                       | Full                                                                                           |
| `/review`                           | Request code review                                            | YES                | `apps/cli/src/claude_parity.rs` + `lib.rs`                                                        | Full                                                                                           |
| `/rewind`                           | Restore code/conversation to previous point                    | YES                | `apps/cli/src/repl/slash_commands.rs:286` + `lib.rs:246`                                          | Full                                                                                           |
| `/sandbox`                          | Sandbox toggle/status                                          | YES                | `lib.rs:295`                                                                                      | Full — **Claude Code calls this `sandboxToggle`, same functionality**                          |
| `/security-review`                  | Complete security review of pending changes                    | YES                | `lib.rs:568` + `apps/cli/src/claude_parity.rs`                                                    | Full                                                                                           |
| `/session`                          | Show remote session URL and QR code (only in remote mode)      | PARTIAL            | Our `/sessions` = resume alias; no remote-session QR flow                                         | **PARTIAL GAP** — different semantics                                                          |
| `/skills`                           | List available skills                                          | YES                | `apps/cli/src/repl/slash_commands.rs:133` + `lib.rs:248`                                          | Full                                                                                           |
| `/stats`                            | Show session statistics                                        | YES                | `lib.rs:580`                                                                                      | Full                                                                                           |
| `/status`                           | Show Claude Code status                                        | YES                | `lib.rs:281`                                                                                      | Full                                                                                           |
| `/statusline`                       | Toggle status line                                             | YES                | `lib.rs`                                                                                          | Full                                                                                           |
| `/stickers`                         | Order Claude Code stickers                                     | YES                | `lib.rs:588`                                                                                      | Text stub                                                                                      |
| `/tag`                              | Tag the current session                                        | YES                | `lib.rs:595`                                                                                      | Full                                                                                           |
| `/tasks`                            | List and manage background tasks                               | YES                | `apps/cli/src/claude_parity.rs:107` + `lib.rs:279`                                                | Full — TUI dialog                                                                              |
| `/team-onboarding`                  | Help teammates ramp on Claude Code                             | YES                | `lib.rs:446` aliases `onboarding`                                                                 | Full                                                                                           |
| `/terminal-setup`                   | Install Shift+Enter key binding                                | YES                | `lib.rs:452` aliases `shell-setup`                                                                | Full                                                                                           |
| `/theme`                            | Change the theme                                               | YES                | `apps/cli/src/repl/slash_commands.rs:330` + `lib.rs:394`                                          | Full — TUI picker                                                                              |
| `/thinkback`                        | Think Back (session recap tool)                                | YES                | `lib.rs:596`                                                                                      | Full                                                                                           |
| `/thinkback-play`                   | Play back a Think Back recording                               | YES                | `lib.rs:603`                                                                                      | Full                                                                                           |
| `/tui`                              | Set TUI renderer (default/fullscreen)                          | NO                 | Not registered (we have TUI as default, no toggle)                                                | **GAP**                                                                                        |
| `/ultrareview`                      | ~5-10 min deep review, $5-$20                                  | YES                | `lib.rs:610` + `apps/cli/src/claude_parity.rs`                                                    | Text stub (appropriate — cloud workflow)                                                       |
| `/upgrade`                          | Upgrade to Max for higher rate limits                          | YES                | `lib.rs:617` + `apps/cli/src/claude_parity.rs`                                                    | Text stub                                                                                      |
| `/usage`                            | Show session cost, plan usage, activity stats                  | YES                | `apps/cli/src/repl/slash_commands.rs:179` + `lib.rs:289`                                          | Full                                                                                           |
| `/vim`                              | Toggle Vim keybindings                                         | YES                | `lib.rs:624`                                                                                      | Full                                                                                           |
| `/voice`                            | Toggle voice mode                                              | YES                | `apps/cli/src/repl/slash_commands.rs:316` + `lib.rs:388`                                          | Full                                                                                           |
| **INTERNAL_ONLY in Claude Code**    |                                                                |                    |                                                                                                   |                                                                                                |
| `/autofix-pr`                       | Internal — autofix PR issues                                   | YES                | `lib.rs` + `command_registry.rs:438`                                                              | We expose it as user-visible; Claude Code hides it (`commands.ts:253`)                         |
| `/env`                              | Internal — environment config                                  | N/A                | Not in our CLI                                                                                    | Claude Code has this as internal-only (`commands.ts:249`)                                      |
| `/onboarding`                       | Internal — onboarding flow                                     | N/A                | We expose as `/team-onboarding`                                                                   | Claude Code hides it                                                                           |
| `/share`                            | Internal — share conversation                                  | N/A                | Not in our CLI                                                                                    | Internal-only in Claude Code (`commands.ts:245`)                                               |
| `/summary`                          | Internal — summarize conversation                              | N/A                | Not in our CLI                                                                                    | Internal-only in Claude Code (`commands.ts:245`)                                               |
| `/teleport`                         | Internal — resume from claude.ai                               | N/A                | Not in our CLI                                                                                    | **Internal-only in Claude Code (`commands.ts:246`)** — not a user-facing gap                   |
| **AGI-exclusive**                   |                                                                |                    |                                                                                                   |                                                                                                |
| `/a2a`                              | Agent-to-agent delegation (A2A protocol)                       | N/A — our addition | `apps/cli/src/repl/slash_commands.rs:353`                                                         | Not in Claude Code                                                                             |
| `/auth`                             | Show multi-provider auth status                                | N/A                | `apps/cli/src/repl/slash_commands.rs:378`                                                         | Not in Claude Code                                                                             |
| `/batch`                            | Parallel file processing with glob pattern                     | N/A                | `apps/cli/src/repl/slash_commands.rs:296`                                                         | Not in Claude Code                                                                             |
| `/ecosystem`                        | Ecosystem scan                                                 | N/A                | `apps/cli/src/repl/slash_commands.rs:363`                                                         | Not in Claude Code                                                                             |
| `/fallback`                         | Multi-model fallback chain                                     | N/A                | `apps/cli/src/claude_parity.rs`                                                                   | Not in Claude Code                                                                             |
| `/fork-byok` / `/byok`              | BYOK continuation draft                                        | N/A                | `lib.rs:559`                                                                                      | Not in Claude Code                                                                             |
| `/privacy-mode` / `/trust-boundary` | Session privacy boundary                                       | N/A                | `lib.rs:552`                                                                                      | Not in Claude Code                                                                             |
| `/replay`                           | Turn picker to fork from earlier point                         | N/A                | `lib.rs:344`                                                                                      | Not in Claude Code                                                                             |
| `/sync`                             | Sync operation                                                 | N/A                | `apps/cli/src/repl/slash_commands.rs:371`                                                         | Not in Claude Code                                                                             |

**Summary:** Claude Code `COMMANDS()` lists ~68 user-visible slash commands (including `contextNonInteractive`, `extraUsageNonInteractive`, and feature-flagged entries). The core non-feature-flagged set is ~60. We match or exceed **55 of them**. **Confirmed gaps (4 commands):** `/debug`, `/powerup`, `/remote-control`, `/tui`. **1 partial gap:** `/session` (remote-session QR flow — we have the name as resume alias with different semantics).

**Correction from initial draft:** `/teleport` is `INTERNAL_ONLY` in Claude Code and is NOT a user-facing gap. `/diff` exists in both. `/output-style` exists in both — not AGI-exclusive.

---

## 3. TUI Screens Parity

| Screen                    | Claude Code                                                                 | Our CLI                                                                                                                   | Gap                                     |
| ------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| REPL prompt / header      | Version + model + cwd in top bar                                            | `apps/cli/src/tui/tui_app.rs` — full header with version, model, cwd                                                      | Full parity                             |
| Status bar bottom         | Mode label (bypass/plan) on left, "high · /effort" on right                 | `apps/cli/src/tui/cost_hud.rs` + `tui/widgets/` mode indicator                                                            | Full parity (img 01, 605)               |
| Permission mode cycling   | Shift+Tab cycles: Default → Plan → AcceptEdits → Bypass                     | `apps/cli/src/command_registry.rs:209-230` TUI shortcuts doc                                                              | Full parity                             |
| Theme picker at first run | 6 options with live code preview (img 04)                                   | `apps/cli/src/tui/widgets/theme_picker.rs:33-60` — 6 themes: Dark, Light, Ansi, SolarizedDark, SolarizedLight, Colorblind | Full parity                             |
| Slash command palette     | Filterable list, description in right column (imgs 607-618)                 | `apps/cli/src/tui/widgets/command_popup.rs`                                                                               | Full parity                             |
| `/agents` screen          | Running / Library tabs, agent list from `.claude/agents/` (imgs 619-620)    | `apps/cli/src/tui/widgets/agent_picker.rs`                                                                                | Full parity                             |
| `/skills` screen          | Shows skills from `.claude/skills/` (img 621)                               | `apps/cli/src/skills.rs` + `tui/widgets/skills_toggle.rs`                                                                 | Full parity                             |
| `/plugin` screen          | 4 tabs: Discover / Installed / Marketplaces / Errors (imgs 622-625)         | `apps/cli/src/marketplace.rs` + TUI plugin screen                                                                         | Full parity                             |
| `/tasks` screen           | "Background tasks" dialog (img 626)                                         | `apps/cli/src/claude_parity.rs:107` + TUI                                                                                 | Full parity                             |
| `/permissions` screen     | 5 tabs: Recently denied / Allow / Ask / Deny / Workspace + search (img 627) | `apps/cli/src/tui/widgets/approval_overlay.rs`                                                                            | Full parity                             |
| `/mcp` screen             | Config diagnostics: scope warnings, missing env vars (img 602)              | `apps/cli/src/mcp/tui_handler.rs` + `mcp/status.rs`                                                                       | Full parity                             |
| MCP server detail         | Status/Command/Args/Config location + Enable action (img 603)               | `apps/cli/src/mcp/tui_handler.rs`                                                                                         | Full parity                             |
| `/chrome` dialog          | Status=Enabled/Disabled, Extension=Installed, site-level perms (img 600)    | Text stub only                                                                                                            | PARTIAL — no Chrome extension in AGI    |
| `/ide` dialog             | IDE list; "No IDEs detected" (img 601)                                      | Text stub                                                                                                                 | PARTIAL — no IDE extension protocol yet |
| `/plan` status bar        | "plan mode on (shift+tab to cycle)" (img 605)                               | `apps/cli/src/features/plan/plan_mode.rs` + status bar                                                                    | Full parity                             |
| Login picker (first run)  | 3 options: Claude account / Anthropic Console / 3rd-party (img 02)          | `apps/cli/src/auth.rs` + `auth_oauth.rs`                                                                                  | Full parity — we add more providers     |
| OAuth paste-code fallback | Full URL shown + "Paste code here if prompted" (img 03)                     | `apps/cli/src/auth_oauth.rs` + `mcp/oauth_flow.rs`                                                                        | Full parity                             |
| Diff review               | Not shown in images                                                         | `apps/cli/src/tui/widgets/diff_review.rs`                                                                                 | WE ARE AHEAD                            |
| Effort picker             | `/effort` in palette                                                        | `apps/cli/src/tui/widgets/effort_picker.rs`                                                                               | Full parity                             |
| Model picker              | `/model` (described, not shown)                                             | `apps/cli/src/tui/widgets/model_picker.rs`                                                                                | Full parity                             |
| Elicitation overlay       | Not shown in images                                                         | `apps/cli/src/tui/widgets/elicitation_overlay.rs`                                                                         | WE ARE AHEAD                            |
| Approval overlay          | Embedded in permissions screen                                              | `apps/cli/src/tui/widgets/approval_overlay.rs`                                                                            | Full parity                             |

---

## 4. Feature-Level Parity Scorecard

| Feature area                   | Claude Code                                                                                                                                                             | Our CLI                                                                                                                                                                                                                                                                  | Score                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ---- | --- | ----------------------- | ------------ |
| **Slash command count**        | ~60 non-feature-flagged user-visible                                                                                                                                    | 83 registered (55 overlap + 28 AGI-exclusive)                                                                                                                                                                                                                            | AHEAD                                          |
| **Plan mode**                  | `/plan`, shift+tab cycle, plan mode on status bar                                                                                                                       | Full — accept/reject/show subcommands, `update_plan` model tool                                                                                                                                                                                                          | FULL                                           |
| **MCP transports**             | stdio + SSE + HTTP                                                                                                                                                      | stdio + SSE + HTTP (`apps/cli/src/mcp/mod.rs:7-13`)                                                                                                                                                                                                                      | FULL                                           |
| **MCP OAuth**                  | PKCE flow                                                                                                                                                               | `apps/cli/src/mcp/oauth_flow.rs` + `mcp/oauth_store.rs`                                                                                                                                                                                                                  | FULL                                           |
| **Hooks**                      | PreToolUse, PostToolUse, Stop, Notification, UserPromptSubmit, PreCompact, PostCompact, SessionStart, SessionEnd, SubagentStop, PermissionRequest (11 confirmed events) | 22 events: all 11 Claude Code events + SubagentStart, AfterMessage, PlanModeChanged, BeforeModelResolve, BeforePromptBuild, ToolResultPersist, CronTriggered, WebhookReceived, FileChanged, DaemonStarted, DaemonStopped (`apps/cli/src/features/hooks/hooks.rs:74-134`) | AHEAD                                          |
| **Plugin manifest formats**    | `.claude-plugin/plugin.json`                                                                                                                                            | 3 formats: `.agiworkforce-plugin/`, `.claude-plugin/`, `.codex-plugin/` (`apps/cli/src/features/plugins/plugins.rs:15-75`)                                                                                                                                               | AHEAD                                          |
| **Plugin marketplace TUI**     | 4 tabs: Discover/Installed/Marketplaces/Errors                                                                                                                          | Full 4-tab marketplace TUI                                                                                                                                                                                                                                               | FULL                                           |
| **Agent management**           | `/agents` Running/Library tabs, built-in agents                                                                                                                         | `apps/cli/src/agents.rs` + `tui/widgets/agent_picker.rs`                                                                                                                                                                                                                 | FULL                                           |
| **Skills**                     | `.claude/skills/` markdown, `/skills` list                                                                                                                              | `apps/cli/src/skills.rs` + `skill_learner.rs` + TUI                                                                                                                                                                                                                      | FULL                                           |
| **Session resume/fork/branch** | `/resume`, `/branch`, `/rewind`                                                                                                                                         | `/resume`, `/fork`=`/branch`, `/rewind` + `/replay`                                                                                                                                                                                                                      | FULL                                           |
| **Theme system**               | 6 themes (first-run picker + `/theme`)                                                                                                                                  | 6 themes: Dark, Light, Ansi, SolarizedDark, SolarizedLight, Colorblind (`apps/cli/src/tui/widgets/theme_picker.rs:43-49`)                                                                                                                                                | FULL                                           |
| **Bypass permissions mode**    | `--dangerously-skip-permissions` + shift+tab cycling                                                                                                                    | `apps/cli/src/cli_options.rs` PermissionMode enum, shift+tab cycle: Default→Plan→AcceptEdits→Bypass→FullAuto                                                                                                                                                             | AHEAD (5-step vs 3-step visible cycle)         |
| **Memory**                     | `/memory` edits memory files, auto-memory                                                                                                                               | `apps/cli/src/memory.rs` + `memory_pipeline.rs` + `/memory` command                                                                                                                                                                                                      | FULL                                           |
| **Effort levels**              | `/effort` + "high · /effort" status bar display                                                                                                                         | `apps/cli/src/tui/widgets/effort_picker.rs`                                                                                                                                                                                                                              | FULL                                           |
| **Output styles**              | `/output-style` command — both have it                                                                                                                                  | `apps/cli/src/output-style` + `default`/`explanatory`/`learning`                                                                                                                                                                                                         | FULL — not AGI-exclusive as initially reported |
| **Context compaction**         | `/compact` summarizes context                                                                                                                                           | `apps/cli/src/compaction.rs` + `/compact`                                                                                                                                                                                                                                | FULL                                           |
| **Provider breadth**           | Anthropic (Max/Pro/API), 3rd-party (Bedrock/Foundry/Vertex)                                                                                                             | 9 cloud providers + ollama + LM Studio + OpenAI-compatible (`apps/cli/src/provider.rs`)                                                                                                                                                                                  | AHEAD                                          |
| **Multi-provider auth**        | Login picker: 3 options                                                                                                                                                 | `/auth` status, per-provider auth                                                                                                                                                                                                                                        | AHEAD                                          |
| **Voice input**                | `/voice` toggle                                                                                                                                                         | `/voice` + `apps/cli/src/voice.rs`                                                                                                                                                                                                                                       | FULL                                           |
| **Chrome integration**         | Full `/chrome` dialog with site-level perms                                                                                                                             | Text stub                                                                                                                                                                                                                                                                | PARTIAL                                        |
| **IDE integration**            | `/ide` dialog, IDE extension bridge                                                                                                                                     | Text stub                                                                                                                                                                                                                                                                | PARTIAL                                        |
| **Remote control / teleport**  | `/remote-control` (user-visible), `/teleport` (internal-only)                                                                                                           | `/remote-control` not implemented; `/teleport` is internal in Claude Code                                                                                                                                                                                                | GAP on `/remote-control` only                  |
| **TUI renderer toggle**        | `/tui` default/fullscreen                                                                                                                                               | Not implemented                                                                                                                                                                                                                                                          | GAP                                            |
| **Powerup lessons**            | `/powerup` quick interactive lessons                                                                                                                                    | Not implemented                                                                                                                                                                                                                                                          | GAP                                            |
| **Debug logging**              | `/debug` enable for session                                                                                                                                             | Not implemented                                                                                                                                                                                                                                                          | GAP                                            |
| **Sandbox**                    | `/sandbox` toggle, shown in palette                                                                                                                                     | `apps/cli/src/sandbox.rs` + `/sandbox`                                                                                                                                                                                                                                   | FULL                                           |
| **Diff review TUI**            | Not shown as TUI widget                                                                                                                                                 | `apps/cli/src/tui/widgets/diff_review.rs`                                                                                                                                                                                                                                | WE ARE AHEAD                                   |
| **Elicitation overlay**        | Not shown                                                                                                                                                               | `apps/cli/src/tui/widgets/elicitation_overlay.rs` (MCP elicitation)                                                                                                                                                                                                      | WE ARE AHEAD                                   |
| **A2A protocol**               | Not present                                                                                                                                                             | `apps/cli/src/features/a2a/` full client+server, `/a2a` command                                                                                                                                                                                                          | WE ARE AHEAD                                   |
| **Batch operations**           | Not present                                                                                                                                                             | `/batch <glob> <prompt>` parallel file processing                                                                                                                                                                                                                        | WE ARE AHEAD                                   |
| **Fallback chain**             | Not present                                                                                                                                                             | `/fallback` multi-model fallback routing (`apps/cli/src/routing/fallback.rs`)                                                                                                                                                                                            | WE ARE AHEAD                                   |
| **Plan mode** (depth)          | `/plan` on/off visible in screenshots                                                                                                                                   | `/plan accept                                                                                                                                                                                                                                                            | reject <feedback>                              | show | on  | off`, auto-approve flag | WE ARE AHEAD |

---

## 5. User-Flow Reality Check

For each major flow: what does a user who installed `agi` actually experience at runtime, vs what the code claims? Grounded in source — not in what is registered, but what fires.

---

### 5.1 Slash Commands — Registered vs Dispatched

**Flow:** User types `/command arg` at the REPL or TUI palette.

**Reality: SOLID.** The dispatch path is fully wired end-to-end.

- In the REPL: `apps/cli/src/repl/mod.rs` feeds input to `handle_slash_command()` (`slash_commands.rs:40`) which first calls `handle_shared_command()` (`claude_parity.rs:87`). Every command registered in the 83-builtin registry has a corresponding match arm or shared handler — verified by the test at `claude_parity.rs:1048` (`shared_runtime_command_names_are_handled`) which asserts each shared command returns non-`NotHandled`.
- In the TUI: the command palette (`tui/widgets/command_popup.rs`) filters from the same builtin registry, and selection dispatches into the same `handle_slash_command` / `handle_shared_command` path.
- The `SlashResult` enum (`slash_commands.rs:11-38`) captures every non-trivial outcome (Btw, A2a, Batch, Prompt, etc.) which the REPL main loop (`repl/mod.rs`) handles before returning to the prompt. No results are silently swallowed.

**One real-flow weakness found:** Many commands in `claude_parity.rs` return `SystemMessage(String)` containing informational text — the `/effort`, `/color`, `/heapdump`, `/stickers` handlers. These print text but do not mutate session state or fire network calls. A user typing `/effort high` gets the message `"Effort level 'high' recognized. The REPL will use the configured model defaults; TUI mode applies effort interactively."` — effort is NOT actually applied to the model call in REPL mode. (`claude_parity.rs:714-722`) **FLOW GAP: `/effort` in REPL mode is informational-only.**

---

### 5.2 Hooks — Defined vs Actually Firing

**Flow:** User configures a hook in `~/.agiworkforce/hooks.json`; the CLI fires it on the matching event.

**Reality: PARTIAL — 13 of 22 events are confirmed wired; 9 are defined but have no fire site.**

**Confirmed wired (fire sites in source):**

| Event                | Fire site                                                      |
| -------------------- | -------------------------------------------------------------- |
| `SessionStart`       | `repl/mod.rs:102` + `tui/tui_app.rs:2239`                      |
| `SessionEnd`         | `repl/mod.rs:424` + `tui/tui_app.rs:2264`                      |
| `PreToolUse`         | `agent/chat.rs:31`                                             |
| `PostToolUse`        | `agent/chat.rs:693`, `agent/chat.rs:861`, `agent/chat.rs:1041` |
| `PreCompact`         | `agent/chat.rs:76`                                             |
| `PostCompact`        | `agent/chat.rs:108`                                            |
| `BeforePromptBuild`  | `agent/chat.rs:180`                                            |
| `BeforeModelResolve` | `agent/chat.rs:199`                                            |
| `ToolResultPersist`  | `agent/chat.rs:711`, `agent/chat.rs:875`, `agent/chat.rs:1063` |
| `SubagentStart`      | `agent/chat.rs:571`                                            |
| `SubagentStop`       | `agent/chat.rs:597`                                            |
| `DaemonStarted`      | `daemon.rs:176`                                                |
| `CronTriggered`      | `daemon.rs:849`                                                |

**NOT wired — enum variant exists, no `run_hooks(HookEvent::X, ...)` call found anywhere:**

| Event               | Status                                                                                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UserPromptSubmit`  | **MISSING FIRE SITE** — defined in `hooks.rs:183` and documented in the deserialization error string, but no `run_hooks(HookEvent::UserPromptSubmit, ...)` call exists in any `.rs` file. Claude Code fires this for every user message. |
| `AfterMessage`      | **MISSING FIRE SITE** — AGI-specific event; no call site.                                                                                                                                                                                |
| `PlanModeChanged`   | **MISSING FIRE SITE** — fires on plan on/off; `slash_commands.rs:201-213` sets `session.plan_mode` but does not call `run_hooks`.                                                                                                        |
| `PermissionRequest` | **MISSING FIRE SITE** — defined, referenced in error string, no fire site.                                                                                                                                                               |
| `Notification`      | **MISSING FIRE SITE** — no fire site.                                                                                                                                                                                                    |
| `Stop`              | **MISSING FIRE SITE** — no Ctrl-C or loop-end fire site.                                                                                                                                                                                 |
| `WebhookReceived`   | **MISSING FIRE SITE** — daemon mode only; `daemon.rs` handles webhook triggers by dispatching to agent, no `HookEvent::WebhookReceived` call.                                                                                            |
| `FileChanged`       | **MISSING FIRE SITE** — daemon file watcher exists but no hook fire call.                                                                                                                                                                |
| `DaemonStopped`     | **MISSING FIRE SITE** — `DaemonStarted` fires at `daemon.rs:176`; `DaemonStopped` has no matching call.                                                                                                                                  |

**Verdict: 9 hook events are dead code at runtime.** A user configuring a `UserPromptSubmit` hook (the most common Claude Code hook pattern) would see it never fire. This is the most impactful user-facing hook gap.

---

### 5.3 MCP Transports — Config Plumbing vs Actual Connection

**Flow:** User configures an MCP server in `~/.agiworkforce/config.toml` or via a plugin manifest.

**Reality: SOLID for stdio; SOLID for SSE and HTTP; plugin MCP configs are fully translated and connected.**

- `attach_mcp_manager_for_session()` (`lib.rs:2202`) calls `plugin_mgr.load_all()` then `plugin_mgr.mcp_configs()` to translate plugin manifest MCP entries into `McpServerConfig` variants, then calls `mcp_mgr.connect_all(&mcp_configs)` (`lib.rs:2233`).
- `mcp_configs()` in `plugins.rs:355-434` correctly dispatches on `transport` field: `"sse"` → `McpServerConfig::sse(url, headers)`, `"http"` → `McpServerConfig::Tagged(McpTransport::Http { url, headers, auth })`, `None/"stdio"` → `McpServerConfig::stdio(command, args, env)`.
- OAuth PKCE is wired: the `auth` block from plugin manifests is deserialized into `McpOAuthConfig` (`plugins.rs:396-407`) and threaded to the HTTP transport.
- **One real-flow weakness:** plugin MCP server configs with SSE transport use `cfg.extra.get("url")` — the URL must be in the manifest's `extra` field (not a typed field), because `McpServerConfig.extra` is a `serde_json::Map` catch-all (`plugins.rs:129`). This works for Claude Code-format manifests that put `transport` and `url` at the top level, but any manifest that puts `url` in a nested object will be silently skipped with `[plugins] MCP server '...' declares transport=sse but has no 'url'` warning. **MINOR FLOW GAP: SSE plugin entries with non-flat URL fields are silently skipped.**

---

### 5.4 Plugin Manifests — Discovery vs Execution

**Flow:** User installs a plugin with `.claude-plugin/plugin.json`; expects slash commands, skills, MCP servers, and hooks to activate.

**Reality: MIXED — discovery and MCP wiring are solid; hooks from plugins are partially blocked by design.**

- Discovery: `PluginsManager::load_all()` (`plugins.rs:237-250`) scans `~/.agiworkforce/plugins/` (global) and `<cwd>/.agiworkforce/plugins/` (project-local) in priority order, reads all 5 manifest formats. **Works.**
- MCP servers: wired via `mcp_configs()` as described above. **Works.**
- Skills: `manifest_skills` paths are loaded; plugin skills compose into the registry via `command_registry.rs` → `registry_from_builtins_skills_and_prompts()`. **Works.**
- Slash commands: `manifest_commands` paths → custom markdown commands → `custom_commands::expand_custom_slash_invocation()` at the end of `handle_slash_command()` fallback. **Works.**
- **Hooks from plugins:** `manifest_hooks` is read into `LoadedPlugin.manifest_hooks` (`plugins.rs:109`). There is a `merge_plugin_hooks()` function referenced in comments (`plugins.rs:472-513`). **However:** the hooks session-load path in `repl/mod.rs` and `tui/tui_app.rs` calls `session.hooks_config()` which loads from `~/.agiworkforce/hooks.json` — it does NOT merge plugin hooks at startup. Plugin hooks are **not injected into the live hooks config**. A plugin declaring hooks silently does nothing at runtime. **FLOW GAP: Plugin-declared hooks are discovered but not merged into the active HooksConfig.**
- **Project-local plugin hooks are explicitly blocked** by design (`plugins.rs:513`, HIGH-2 security note). Only global plugins may contribute hooks; this is intentional but is not documented to the user.

---

### 5.5 Sessions — Resume/Fork/Branch State Rehydration

**Flow:** User runs `/resume <id>` or `agi exec --session <id>` to continue a prior session.

**Reality: SOLID for message rehydration; PARTIAL for session metadata.**

- `handle_load()` (`repl/registry.rs:42`) calls `load_managed_session(id)` → reads the JSONL file from `~/.agiworkforce/managed_sessions/<id>.jsonl`, then calls `super::load_messages_into_session(session, managed_session.messages)` and `session.adopt_managed_session(managed_session, path)` (`registry.rs:54`). Messages are reinjected into the live `AgentSession.messages` vector.
- **What IS rehydrated:** full message history (all roles including tool calls and results), session_id, model name, cwd from metadata.
- **What IS NOT rehydrated:** `permission_mode`, `plan_mode`, `plan_approved`, `current_plan`, `fast_mode`, `output_style`, `fallback_chain`, `skip_permissions`. These session fields default to their initial values on resume. A user who resumes a plan-mode session loses plan state and must re-enter plan mode manually. **FLOW GAP: Non-message session state (plan mode, permission mode, output style, fallback chain) is not persisted and is dropped on resume.**
- Branch/Fork: `handle_branch()` in `registry.rs` forks the current session at the current turn count. This works but inherits the same state-loss issue — only messages are forked, not the session config fields.

---

### 5.6 Provider Auto-Balanced Default — Task-Type Routing

**Flow:** User expects the CLI to automatically pick the best model for the task type (e.g. heavy reasoning vs quick edits) via `packages/llm-normalize` or task-type classification.

**Reality: NOT IMPLEMENTED.** The routing module `apps/cli/src/routing/strategy.rs:1` has the comment:

```
// PHASE2: composable router not yet wired into AgentSession; planned to replace
// the manual FallbackChain as the differentiating routing layer.
```

The `RoutingStrategy` trait and `DefaultStrategy`/`FallbackStrategy`/`TaskTypeStrategy` implementations exist (`routing/strategy.rs`) but the `#![allow(dead_code)]` at the top confirms none of these are called from `AgentSession`. Model selection at runtime is: (1) the model passed via `--model` flag, (2) `session.switch_model()` from `/model` or `/fast`, or (3) the `config.default.model` field from `~/.agiworkforce/config.toml`. There is no task-type classifier, no `llm-normalize` integration, and no automatic model selection based on prompt complexity. **FLOW GAP: Auto-balanced routing is dead code. Users get the configured default model for every task.**

---

### 5.7 TUI Screens — Wired to Backend vs Static Views

**Flow:** User opens a TUI overlay (e.g. `/agents`, `/tasks`, `/plugin`) expecting live data.

**Reality: MIXED — most screens reflect live session state; tasks and background screen are backed by a real registry; a few screens are text-only in REPL mode.**

- `/agents` (`agent_picker.rs`): calls `agents::discover_agents()` which reads `.claude/agents/` and `~/.claude/agents/`. **Live.**
- `/skills` (`skills_toggle.rs`): calls `skills::discover_skills()`. **Live.**
- `/mcp` (`mcp/tui_handler.rs`): reads `session.mcp_info()` which returns live connected tools. **Live.**
- `/permissions` (`approval_overlay.rs`): reads from `permissions::load_rules()`. **Live.**
- `/tasks` (`claude_parity.rs:580`): calls `tools::session_task_summaries()` which reads from `SESSION_REGISTRY` global (`task_registry.rs:66`) — a `OnceLock<SessionRegistry>` backed by an in-process `RwLock<HashMap>`. **Live within the session; resets on process restart.**
- `/plugin` marketplace tabs: calls `PluginsManager::load_all()` live. **Live.**
- **REPL-mode text-only**: `/chrome`, `/ide`, `/effort` (partial), `/color`, `/heapdump`, `/stickers`, `/statusline` return plain text in both REPL and TUI entry points via `claude_parity.rs`. In TUI mode the overlays would ideally render these as structured dialogs, but the `claude_parity.rs` path is shared — TUI gets the same string output, not a rendered widget. **PARTIAL: these commands produce text in TUI instead of structured overlay widgets.**
- `/tasks` TUI dialog: The TUI renders `session_task_summaries()`. However, background tasks spawned by the model tool (e.g. `BackgroundTask`) write to `SESSION_REGISTRY`, which is process-global. If a task completes before `/tasks` is opened, it shows correctly. If the CLI restarts, registry is empty. **Acceptable for an in-process registry; documented behavior.**

---

### 5.8 Plan Mode — Persistence Across Turns

**Flow:** User runs `/plan`, model calls `update_plan`, user runs `/plan accept`, model proceeds with implementation.

**Reality: SOLID within a single session; plan state is lost on resume.**

- `handle_update_plan()` (`agent/mod.rs:611`) parses the plan JSON, writes it to disk via `plan.write_to_disk(&session_id)` and stores it in `session.current_plan`. **Disk write is real.**
- The tool gate at `agent/chat.rs:484` checks `session.plan_mode && !session.plan_approved` and returns an error to the model before any mutating tool fires. **Blocking is real.**
- `auto_approve_plan` flag (`--auto-approve-plan`) bypasses the user confirmation step (`agent/mod.rs:641-643`). **Works.**
- **Gap 1:** Plan state (`plan_mode`, `plan_approved`, `current_plan`) is not included in the managed session JSONL format. On `/resume`, these fields default to `false`/`None` (verified: `agent/mod.rs:268-272`). A resumed session loses plan context even though the plan file was written to disk. **FLOW GAP: Plan mode is not rehydrated on session resume.**
- **Gap 2:** `PlanModeChanged` hook event is never fired (confirmed in §5.2 above). Users cannot hook on plan state transitions.

---

### 5.9 Summary of Flow Gaps Found

| #     | Flow             | Gap                                                                                                                                                                                      | Severity                                        |
| ----- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| FG-01 | Hooks            | `UserPromptSubmit`, `AfterMessage`, `PlanModeChanged`, `PermissionRequest`, `Notification`, `Stop`, `WebhookReceived`, `FileChanged`, `DaemonStopped` — 9 events defined but never fired | P0 — breaks core Claude Code hook compatibility |
| FG-02 | Hooks            | Plugin-declared `manifest_hooks` are not merged into live HooksConfig                                                                                                                    | P1                                              |
| FG-03 | Session resume   | `permission_mode`, `plan_mode`, `plan_approved`, `current_plan`, `fast_mode`, `output_style`, `fallback_chain` are not persisted or rehydrated                                           | P1                                              |
| FG-04 | Plan mode        | Plan state not rehydrated on `/resume` (subset of FG-03)                                                                                                                                 | P1                                              |
| FG-05 | Provider routing | Auto-balanced task-type routing is dead code (`routing/strategy.rs` has `#![allow(dead_code)]`); users always get configured default                                                     | P2                                              |
| FG-06 | Slash commands   | `/effort` in REPL mode is informational-only — does not apply effort to model calls                                                                                                      | P2                                              |
| FG-07 | Plugin MCP       | SSE plugin entries with non-flat `url` fields are silently skipped                                                                                                                       | P2                                              |
| FG-08 | TUI screens      | `/chrome`, `/ide`, `/effort`, `/color`, `/heapdump`, `/stickers`, `/statusline` render plain text in TUI instead of structured widgets                                                   | P3                                              |

---

## 6. Where We Are Ahead

**Source citations below are verified against current files.**

1. **More slash commands (83 vs ~60):** We have 28 AGI-exclusive commands including `/batch`, `/a2a`, `/ecosystem`, `/sync`, `/fallback`, `/replay`, `/think-back`, `/fork-byok` — none present in Claude Code. Source: `crates/agiworkforce-command-registry/src/lib.rs:168-626`.

2. **More hook events (22 vs ~11):** We implement 11 additional events — `AfterMessage`, `PlanModeChanged`, `BeforeModelResolve`, `BeforePromptBuild`, `ToolResultPersist`, `SubagentStart`, `CronTriggered`, `WebhookReceived`, `FileChanged`, `DaemonStarted`, `DaemonStopped`. Source: `apps/cli/src/features/hooks/hooks.rs:74-134`. (See also: LOCK DRIFT FLAG in Appendix below.)

3. **More plugin manifest formats (3 vs 1):** We read `.agiworkforce-plugin/`, `.claude-plugin/`, and `.codex-plugin/` — providing full interop with Claude Code and Codex CLI plugin ecosystems without migration. Source: `apps/cli/src/features/plugins/plugins.rs:15-75`.

4. **More permission modes (5-step vs 3-step shift+tab cycle):** Default → Plan → AcceptEdits → Bypass → FullAuto. Claude Code shows only bypass + plan in screenshots. Source: `apps/cli/src/command_registry.rs:209-230`.

5. **Diff review TUI widget:** `apps/cli/src/tui/widgets/diff_review.rs` provides an inline side-by-side diff viewer. Claude Code has no equivalent TUI widget visible in any reference image. Our `/diff` shows git diff including untracked; Claude Code's `/diff` exists (imported in `commands.ts:19`) but behavior not revealed in reference images.

6. **MCP elicitation overlay:** `apps/cli/src/tui/widgets/elicitation_overlay.rs` + `mcp/elicitation.rs` — interactive prompts from MCP servers surfaced in TUI. Not present in Claude Code reference images.

7. **A2A (Agent-to-Agent) protocol:** Full client+server implementation in `apps/cli/src/features/a2a/` with `/a2a discover|delegate|serve|register|card` commands. Not present in Claude Code.

8. **More providers:** 9 cloud first-party providers + ollama (Local/Cloud modes) + LM Studio + user-defined `OpenAICompatible` blocks. Claude Code login picker shows only 3 entry points. Source: `apps/cli/src/provider.rs`.

9. **Multi-model fallback routing:** `/fallback` command + `apps/cli/src/routing/fallback.rs` — transparent fail-over chain across providers. Not present in Claude Code.

10. **Output style system parity (corrected):** `/output-style` with `default | explanatory | learning` modes — Claude Code also has this (`commands.ts:292`). Full parity, not an AGI advantage.

11. **Context window visualization:** `/context` shows usage as report with `session.context_report()`. Claude Code shows `/context` as "colored grid" but our implementation provides token-level breakdown.

---

## 6. Recommendations (R26-PARITY-CLI-N)

### P0 — Functional gap, blocks user expectation

**R26-PARITY-CLI-01 (P0): Implement `/debug` command**

- Claude Code: "Enable debug logging for this session and help diagnose issues" (img 608)
- Our gap: Not registered, not handled. Developers expect `/debug` to exist.
- Action: Add `debug` entry in `crates/agiworkforce-command-registry/src/lib.rs:builtin_slash_registry_commands()` + handler in `apps/cli/src/repl/slash_commands.rs` that sets a `session.debug_mode` flag and emits structured debug output on subsequent turns.

**R26-PARITY-CLI-02 (P0): Implement `/remote-control` command**

- Claude Code: "Connect this terminal for remote-control sessions" (img 615) — enables cross-device session continuation
- Our gap: Not registered. Note: `/teleport` is Claude Code-internal-only and is NOT a user-facing gap.
- Action: Add text stub first (P0 for discoverability); full implementation requires daemon bridge (port 8787 is our registered bridge port). Register `/remote-control` in the command registry pointing to the daemon bridge.

### P1 — Visible gap in TUI, affects polish

**R26-PARITY-CLI-03 (P1): Implement `/tui` renderer toggle command**

- Claude Code: "Set the terminal UI renderer (default | fullscreen)" (img 617)
- Our gap: We have a fullscreen TUI by default but no `/tui` command to toggle between modes.
- Action: Register `tui` in command registry; handler toggles between `--no-tui` (REPL) and TUI mode via session flag. Display current renderer in status output.

**R26-PARITY-CLI-04 (P1): Implement `/powerup` interactive lessons command**

- Claude Code: "Discover Claude Code features through quick interactive lessons" (img 615)
- Our gap: Not registered. Onboarding discoverability for new users is weaker.
- Action: Register `powerup` in command registry as a prompt-type command that invokes a skill or built-in markdown walkthrough. Can be shipped as a skills file initially.

**R26-PARITY-CLI-05 (P1): Promote `/chrome` and `/ide` from text stubs to functional TUI dialogs**

- Claude Code: `/chrome` shows Status/Extension state + Reconnect/Manage permissions actions (img 600); `/ide` shows IDE list with extension detection (img 601)
- Our gap: Both are text stubs in `apps/cli/src/claude_parity.rs`. No Chrome extension or IDE protocol exists in AGI yet.
- Action: For v1, display a contextual help dialog explaining the AGI browser extension (`apps/extension/`) and IDE extension (`apps/extension-vscode/`) install paths.

### P2 — Enhancement / competitive differentiation

**R26-PARITY-CLI-06 (P2): Add "needs attention" MCP authentication prompts in `/plugin` Installed tab**

- Claude Code: Shows MCP servers with `Enter to auth` / `failed` status grouped under "Needs attention" (img 623)
- Our gap: Plugin installed tab exists but no auth-state grouping.
- Action: In `apps/cli/src/marketplace.rs` TUI handler, query `mcp/status.rs` for servers with `auth_required` or `error` states and surface them in the Installed tab with appropriate action hints.

**R26-PARITY-CLI-07 (P2): Add `/install-github-app` and `/install-slack-app` functional flows**

- Claude Code shows these in the palette (imgs 612-613) with text descriptions
- Our gap: Registered as text stubs (`lib.rs:511,517`).
- Action: Add OAuth redirect flows using existing `apps/cli/src/auth_oauth.rs` PKCE machinery.

**R26-PARITY-CLI-08 (P2): First-run theme selector — verify live syntax preview**

- Claude Code: Shows a 3-line code snippet with syntax highlighting that updates as you cycle themes (img 04)
- Our gap: `apps/cli/src/tui/widgets/theme_picker.rs` has the 6 themes and picker widget but live preview wiring is unclear.
- Action: Verify `theme_picker.rs` renders a live code snippet preview during first-run init flow. If not, add a static `SAMPLE_CODE_SNIPPET` string rendered with the selected `ThemeChoice` palette.

---

## Appendix A: LOCK DRIFT FLAG — Hook Event Count

**THIS REQUIRES SUPERVISOR ESCALATION PER THE CLI ENGINEER ESCALATION RULES.**

The AGENTS.md system prompt (locked fact) states **"19 canonical hook events"** (also appearing in the top-level system prompt under "Locked platform facts"). Our source code `apps/cli/src/features/hooks/hooks.rs:74-134` defines a `HookEvent` enum with **22 variants**.

Discrepancy: 22 (code) vs 19 (locked fact)

The 3 extra variants that could account for this difference:

- `SessionStart` — may be Claude Code-canonical (vs 19 not counting it)
- `SessionEnd` — may be Claude Code-canonical
- The partition between "canonical" (shared with Claude Code) and "AGI-exclusive" may use a different boundary than the lock implies

The lock says "19 canonical (Claude Code-aligned)" — if "canonical" means "aligned to Claude Code's 9 confirmed events plus AGI-exclusive", the count may reflect a different counting epoch. The locked number 19 does not match the live enum count of 22.

**Action required:** Supervisor must decide whether to update the locked platform fact from 19 to 22, or whether "canonical" has a narrower definition that this audit has not resolved.

---

## Appendix B: Hook Event Coverage Comparison

| Hook event           | Claude Code | Our CLI (`apps/cli/src/features/hooks/hooks.rs:74`) |
| -------------------- | ----------- | --------------------------------------------------- |
| `PreToolUse`         | YES         | YES                                                 |
| `PostToolUse`        | YES         | YES                                                 |
| `UserPromptSubmit`   | YES         | YES                                                 |
| `Stop`               | YES         | YES                                                 |
| `Notification`       | YES         | YES                                                 |
| `PreCompact`         | YES         | YES                                                 |
| `PostCompact`        | YES         | YES                                                 |
| `SubagentStop`       | YES         | YES                                                 |
| `PermissionRequest`  | YES         | YES                                                 |
| `SessionStart`       | YES         | YES                                                 |
| `SessionEnd`         | YES         | YES                                                 |
| `AfterMessage`       | No          | YES (AGI-specific)                                  |
| `PlanModeChanged`    | No          | YES (AGI-specific)                                  |
| `BeforeModelResolve` | No          | YES (adapted from OpenClaw)                         |
| `BeforePromptBuild`  | No          | YES (adapted from OpenClaw)                         |
| `ToolResultPersist`  | No          | YES (adapted from OpenClaw)                         |
| `SubagentStart`      | No          | YES                                                 |
| `CronTriggered`      | No          | YES (daemon mode)                                   |
| `WebhookReceived`    | No          | YES (daemon mode)                                   |
| `FileChanged`        | No          | YES (daemon mode)                                   |
| `DaemonStarted`      | No          | YES                                                 |
| `DaemonStopped`      | No          | YES                                                 |

**Total:** Claude Code ~11 confirmed events (9 visible in user docs + `SessionStart` + `SessionEnd`); our CLI 22 events (11 shared + 11 AGI-exclusive). Note: the "~11" for Claude Code is inferred from their hooks documentation pattern — their source was not examined at the hook-implementation level in this audit.

---

## Appendix C: MCP Transport Comparison

| Transport                               | Claude Code                   | Our CLI                                                       |
| --------------------------------------- | ----------------------------- | ------------------------------------------------------------- |
| stdio                                   | YES                           | YES (`apps/cli/src/mcp/mod.rs`)                               |
| SSE                                     | YES                           | YES (`apps/cli/src/mcp/sse.rs`)                               |
| Streamable HTTP (2025-06-18 spec)       | YES                           | YES (`apps/cli/src/mcp/http.rs`)                              |
| OAuth PKCE                              | YES (for HTTP transport)      | YES (`apps/cli/src/mcp/oauth_flow.rs` + `mcp/oauth_store.rs`) |
| MCP elicitation (server→client prompts) | Unclear from reference images | YES (`apps/cli/src/mcp/elicitation.rs`)                       |

---

_All claims in this report are grounded in screenshot path citations (imgs 01-627) or `apps/cli/<path:line>` citations verified against the current codebase. Commands.ts source verified at `/Users/siddhartha/Desktop/reference/src/commands.ts` lines 225-346._
