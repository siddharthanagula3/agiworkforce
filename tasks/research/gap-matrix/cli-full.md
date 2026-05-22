# Gap Matrix — `apps/cli/` (Rust TUI) vs Anthropic Claude Code CLI

**Surface:** `apps/cli/` — 201 `.rs` files, ~100 K LOC (89K excluding snapshots), 22 binary subcommands, 41 TUI slash commands, ~22 REPL slash commands.
**Reference:** Claude Code CLI v2.1.133 (May 2026). 207 `commands/` files, ~92 distinct slash commands + 17 bundled skills, 27 hook events × 6 handler types, ~125 settings keys, plugin marketplace ecosystem with 4,200+ skills / 770+ MCP servers.
**Method:** Read every CLI source file, grep liberally, cite file:line for every claim. Compare to deep-dives at `tasks/research/deep/`.

---

## Have (1 line each)

- **Binary entry + clap dispatcher**: 22 subcommands wired (`apps/cli/src/main.rs:454-553`).
- **REPL slash commands** (~22 user-visible): /exit, /model, /clear, /cost, /save, /load, /history, /delete, /export, /providers, /setup, /permissions, /models, /skills, /hooks, /context, /status, /sessions, /rename, /import, /compact, /btw, /plan (5-state), /fast, /rewind, /branch, /fork, /diff, /batch, /memory, /init, /config, /voice, /theme, /login, /logout, /a2a, /ecosystem, /marketplace, /sync, /onboarding, /auth, /help (`apps/cli/src/repl.rs:496-840`).
- **TUI slash commands** (41 entries via strum enum at `apps/cli/src/tui/slash_command.rs:12-67`): Model, Fast, Approvals, Permissions, ElevateSandbox, SandboxReadRoot, Experimental, Skills, Review, Rename, New, Resume, Fork, Init, Compact, Plan, Collab, Agent, Diff, Copy, Mention, Status, DebugConfig, Title, Statusline, Theme, Mcp, Apps, Plugins, Logout, Quit, Exit, Feedback, Rollout, Ps, Stop, Clear, Personality, Realtime, Settings, TestApproval, MultiAgents, MemoryDrop, MemoryUpdate.
- **Tool dispatcher with 17 built-in tools** (`apps/cli/src/tools.rs:155-202`): read_file, write_file, run_command, search_files, list_directory, edit_file, web_search, web_fetch, apply_patch, grep_files, tool_search, glob, batch, multiedit, todo_read, todo_write, ask_user, read_many_files (+ task subagent) — schema in `apps/cli/src/runtime/tool_catalog.rs:48-249`.
- **Hooks system** with 22 events (`apps/cli/src/hooks.rs:74-134`); legacy alias resolver with deprecation warnings (`hooks.rs:176-231`).
- **MCP client** with 3 transports (stdio/SSE/HTTP) + OAuth (PKCE) + RFC 9728/8414/7591 discovery (`apps/cli/src/mcp/mod.rs:1-12`, `oauth_flow.rs:1-1048`).
- **Subagent manager** with concurrent OS-thread runtime, max 7 default, cancellation (`apps/cli/src/subagent.rs:78-200`).
- **Plan mode (real)**: `update_plan` tool + 5-state slash command (on/off/accept/reject/show); approval gate before mutating tools (`apps/cli/src/plan_mode.rs:1-128`, `repl.rs:624-692`).
- **Sandbox**: macOS Seatbelt (deny-default, network gate) + Linux bwrap (`apps/cli/src/sandbox.rs:178-280`).
- **Permissions store** (allow/deny lists, persistent + session) (`apps/cli/src/permissions.rs:1-198`).
- **Auth/OAuth**: Anthropic + OpenAI + AGI Workforce w/ PKCE (`apps/cli/src/oauth.rs:23-57`).
- **Sessions**: managed JSON/JSONL on disk, list/show/fork (`apps/cli/src/sessions.rs:1-870`, `main.rs:733-806`).
- **Compaction**: token estimation, multi-phase pruning, /compact with focus (`apps/cli/src/compaction.rs:1-1235`).
- **Skills**: SKILL.md frontmatter, project + global, scoring matcher (`apps/cli/src/skills.rs:30-475`).
- **Agents**: AgentDefinition with model/tool/permission overrides, project + global (`apps/cli/src/agents.rs:22-100`).
- **Voice mode**: Whisper API + push-to-talk (`apps/cli/src/voice.rs:1-110`).
- **Streaming JSON events**: AgentEvent enum with 9 variants (`apps/cli/src/agent_events.rs:25-78`).
- **Output styles**: 3 built-in (default/explanatory/learning) + user-editable (`apps/cli/src/output_styles.rs:1-70`).
- **Daemon mode**: file watcher, cron, webhooks (`apps/cli/src/daemon.rs:1-700`).
- **Marketplace** (search, install path/git, list, update) (`apps/cli/src/marketplace.rs:140-300`).
- **Plugins manager** with 5 manifest formats (agi/claude/codex/legacy×2) (`apps/cli/src/plugins.rs:28-75`).
- **Memory** at `~/.agiworkforce/memory/` + tiered global/project/local (`apps/cli/src/memory.rs:1-870`).
- **Effort flag** (low/medium/high/max) maps to max_turns/max_tokens (`apps/cli/src/main.rs:391-400, 1714-1735`).
- **Multi-model fallback** with `--fallback-model` flag and FallbackTriggered event (`apps/cli/src/main.rs:228-229`, `agent_events.rs:58-64`).
- **Permission modes** (default/plan/acceptEdits/bypassPermissions/dontAsk) (`apps/cli/src/cli_options.rs:19-31`).
- **Demo mode** synthetic 429 (`apps/cli/src/main.rs:338-342`).
- **Shell completions** for bash/zsh/fish (`apps/cli/src/main.rs:441-447, 1512`).
- **Ecosystem scanner** for Claude/Codex/Cursor/JetBrains MCP imports (`apps/cli/src/ecosystem.rs`).
- **Sync** (status/export/import dotfiles bundle) (`apps/cli/src/main.rs:617-628`).
- **A2A protocol** (Phase-2 gated; module exists) (`apps/cli/src/a2a.rs`, `agent.rs:359-381`).
- **Init command** generates AGENTS.md + project scaffold (`apps/cli/src/init.rs:1-271`).
- **Onboarding wizard** (`apps/cli/src/onboarding.rs:1-757`).
- **Markdown render** + theme picker + 3 widgets (model/effort/theme) (`apps/cli/src/tui/widgets/`).
- **Notifications subsystem** (BEL + OSC 9) (`apps/cli/src/tui/notifications/`).
- **Streaming controller** with chunking + commit-tick (`apps/cli/src/tui/streaming/`).
- **History cell** rendering, custom_terminal, mention_codec (`apps/cli/src/tui/`).
- **Custom prompts** under `~/.agiworkforce/prompts/` surfaced as `/prompts:<name>` (`apps/cli/src/command_registry.rs:113-128`).

---

## Partial (gap detail per item; effort to close)

### P-1. Hooks: 22 events, 1 handler type — Claude has 27 events × 6 handler types

- **What we have:** 22 `HookEvent` variants (`apps/cli/src/hooks.rs:74-134`), all `command`-only via shell spawn (`hooks.rs:31-60`), with `if`/`matcher` regex filters, deprecation aliases.
- **Gap:** Claude ships **27 events** × **6 handler types** (`tasks/research/deep/m4-hooks-system.md:42-77`). We're missing events: `Setup`, `InstructionsLoaded`, `PostToolUseFailure`, `StopFailure`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `Elicitation`, `ElicitationResult`, `ConfigChange`, `CwdChanged`, `WorktreeCreate`, `WorktreeRemove`. Handler types missing: **HTTP** (POST hook with allowlist + SSRF guard, `execHttpHook.ts`), **prompt** (LLM-evaluated hook with Haiku-class small-fast model, `execPromptHook.ts`), **agent** (sub-agent multi-turn loop with 50-turn cap, `execAgentHook.ts`), **callback/function** (in-memory SDK callback). Async hooks (`{"async": true}` first-line stdout) missing entirely. AsyncHookRegistry missing. Trust gating before hook fire missing. Plugin variable substitution `${CLAUDE_PLUGIN_ROOT}` / `${user_config.X}` missing.
- **Effort:** **5 days** (1d HTTP+SSRF, 1d prompt+agent, 1d async registry, 1d remaining 13 events, 1d trust+vars).

### P-2. MCP: stdio + SSE + HTTP + OAuth — but no Elicitation, no IdP setup CLI, no SEP-990

- **What we have:** 3 transports + OAuth PKCE + RFC 9728/8414/7591 (`mcp/mod.rs`, `oauth_flow.rs`).
- **Gap:** No **Elicitation** support (server prompts user mid-call) which is referenced from MCP 2025 spec and surfaces in Claude as `Elicitation`/`ElicitationResult` hooks. No `mcp xaa setup` / SEP-990 IdP CLI subcommand (CMD1 §3.3 `xaaIdpCommand.ts:24+`). No `--mcp-config` JSON file array merging (we accept `Vec<String>` but limited validation). No "duplicate of claude.ai connector" detection. No remote-MCP shareable connector pattern (Claude calls these "custom connectors", configured server-side).
- **Effort:** **3 days** (1d Elicitation events+roundtrip, 1d IdP CLI, 1d connector dedup + multi-config merge tests).

### P-3. Subagents: concurrent thread pool — but no Library UI, no built-in subagents, no markdown frontmatter scope control

- **What we have:** SubagentManager with 7 concurrent default (`subagent.rs:79`), per-thread tokio runtime, cancellation; AgentDefinition supports model/tools/permission_mode/system_prompt overrides (`agents.rs:22-41`).
- **Gap:** No `/agents` Library interactive UI (Personal/Project scope toggle + "Generate with Claude" wizard — Claude `commands/agents/agents.tsx:6-11`). No built-in subagents (Claude ships **Explore**, **Plan**, **general-purpose**, **statusline-setup** as factory subagents — none in our repo). No `whenToUse` frontmatter or `paths:` scope filter. No "PROACTIVELY"/"MUST BE USED" stronger-trigger semantics. `/agents` slash command in TUI enum (`slash_command.rs:34`) but no implementation handler — opens nothing.
- **Effort:** **4 days** (1d /agents Library TUI screen, 1d wizard, 1d 4 built-in subagents, 1d frontmatter extensions + tests).

### P-4. Slash commands: ~22 in REPL, 41 in TUI enum — but Claude ships ~92 commands + 17 bundled skills

- **What we have:** REPL handlers for ~22 commands (`repl.rs:496-840`); TUI strum enum lists 41 names (`tui/slash_command.rs:12-67`) but most are not implemented — they're enum variants without dispatch.
- **Gap (commands missing entirely):** `/security-review`, `/loop`, `/simplify`, `/debug`, `/stuck`, `/remember`, `/lorem-ipsum`, `/skillify`, `/verify`, `/dream`, `/hunter`, `/run-skill-generator` (bundled skills in Claude per CMD1 §3.8). Built-ins missing: `/usage`, `/cost` (we have `/cost` partial but no breakdown), `/insights` (3,200 LOC `insights.ts` — major gap), `/doctor`, `/heapdump`, `/feedback`, `/stickers`, `/tag`, `/resume <PR-URL>`, `/review <PR>`, `/install-github-app`, `/install-slack-app`, `/chrome`, `/ide`, `/output-style` (we have `output_styles.rs` but no slash command), `/team-onboarding`, `/copy N`, `/passes`, `/upgrade`, `/privacy-settings`, `/terminal-setup`, `/release-notes`, `/extra-usage`, `/keybindings`, `/tasks` (manage background bashes), `/heapdump`, `/voice <toggle>` works partially, `/btw` works but no cache reuse via `getLastCacheSafeParams`, `/desktop`, `/mobile`, `/session` (remote QR), `/remote-control`, `/web-setup`, `/remote-env`, `/teleport`, `/share`, `/summary`, `/rate-limit-options`, `/effort` slash command (we have flag only).
- **Effort:** **8 days** (3d 12 bundled skills, 2d /security-review + /insights + /doctor, 2d /usage/cost/upgrade/feedback flow, 1d /ide+/desktop+/mobile).

### P-5. Plugin system: marketplace + manifest formats — but no `claude plugin tag`, no marketplace browse UI, no progressive trust

- **What we have:** `plugin install/list/uninstall/update/search`, 5 manifest formats, install scopes (user/project/local), plugin command registry contributing to slash list (`plugins.rs`, `marketplace.rs`).
- **Gap:** No `agiworkforce plugin tag` (creates Git release tags with version validation, May 2026 in Claude). No interactive `/plugin` browse UI with `<PluginSettings>`, `BrowseMarketplace.tsx`, `AddMarketplace.tsx`, `DiscoverPlugins.tsx`, `ManageMarketplaces.tsx`, `PluginErrors.tsx`, `PluginOptionsDialog.tsx`, `PluginTrustWarning.tsx`, `ValidatePlugin.tsx`, `UnifiedInstalledCell.tsx` (16 files of plugin UI — none in our repo). No `extraKnownMarketplaces` / `strictKnownMarketplaces` settings keys. No `enabledPlugins` settings key. No `--plugin-url` flag (May 2026). No multi-marketplace registry support beyond single `registry.agiworkforce.com`.
- **Effort:** **5 days** (2d plugin TUI screens, 1d tag command, 1d settings keys + flags, 1d trust warnings).

### P-6. Settings.json: ~30 keys recognized, ~95 missing

- **What we have:** Effective config in `config.rs:1-1410` (1,410 LOC). Hierarchy: managed → project → user with trust opt-in.
- **Gap:** Claude's settings.json has **~125 keys** (per anthropic-claude-suite-may-2026 §5.10). We're missing: `enabledPlugins`, `extraKnownMarketplaces`, `strictKnownMarketplaces`, `disableAllHooks`, `allowManagedHooksOnly`, `allowedHookHttpUrls`, `allowedHookEnvVars`, `disableAutoMode`, `useAutoModeInPlanMode`, `worktree.baseRef` (`fresh`|`head`), `sandbox.bwrapPath`, `sandbox.socatPath`, `forceLoginMethod`, `forceLoginOrgUUID`, `otelHeadersHelper`, `parentSettingsBehavior`, `permissions.defaultMode`, `permissions.disableBypassPermissionsMode`, `permissions.additionalDirectories`, `outputStyle`, `mcpServers` (under settings, separate from .mcp.json), 80+ others. Conflict resolution rules (deny>ask>allow) in `permissions.allow/deny/ask` not enforced beyond simple allow/deny in `permissions.rs:53-74`.
- **Effort:** **6 days** (3d parse + apply 95 keys, 1d hierarchy precedence, 2d test coverage).

### P-7. Streaming JSON: 9 event variants — Claude ships 30+ event kinds

- **What we have:** AgentEvent enum: spawning, ready_for_prompt, running_tool, tool_result, message_delta, turn_usage, fallback_triggered, finished, error (`agent_events.rs:25-78`).
- **Gap:** Claude `--output-format stream-json` emits SDK-event types: `system`, `user`, `assistant`, `tool_use`, `tool_result`, `permission_request`, `permission_decision`, `partial_assistant_message` (with `--include-partial-messages`), `result`, `error`, `interrupt`, `usage`, plus typed initialization headers, plus mid-stream `permissionDecision` rounds. Our `--include-partial-messages` flag exists (`main.rs:367`) but doesn't differentiate stream_event vs assistant_message clearly. No `result.is_error`, no MCP server status events. ControlRequest for SDK in `sdk_io/protocol.rs:210` defined but only one variant (SetPermissionMode) — Claude's SDK control plane has dozens.
- **Effort:** **3 days** (2d expand event union to match Claude SDK schema, 1d ControlRequest dozens).

### P-8. Sandbox: Seatbelt + bwrap — but no auto-mode classifier, no Windows, no Landlock

- **What we have:** macOS Seatbelt (deny-default with network gate at `sandbox.rs:194-225`) + Linux bubblewrap (`sandbox.rs:227-280`) with workspace path validation against SBPL injection.
- **Gap:** Per FINAL_AUDIT §9, Windows and Landlock are enum stubs — silent fallthrough at `sandbox.rs:159` is a P1. No auto-mode classifier (Claude's "Auto Mode" uses an LLM to classify safe vs requires-approval — `--enable-auto-mode` flag missing). No `sandbox.bwrapPath` / `sandbox.socatPath` settings keys. No SSRF guard for HTTP-hook routing (the network-proxy crate is partial). No documented Auto-Mode bypass mitigations (Claude's `/proc/self/root/usr/bin/npx` issue).
- **Effort:** **5 days** (2d auto-mode classifier, 2d Windows AppContainer or Job Object, 1d Landlock).

### P-9. Compaction: prune + render — no LLM-summary path, no PreCompact gate, no /rewind state

- **What we have:** Token estimation, multi-phase pruning, `/compact` with focus arg (`compaction.rs:1-1235`); checkpoints in agent.rs (`agent.rs:649-668`).
- **Gap:** No LLM-driven summary that replaces older messages (Claude does a Haiku-call summarization). `PreCompact` hook event is declared (`hooks.rs:93`) but not actually fired before compact runs (no integration call site found). `/rewind` restores last checkpoint but no double-Esc binding, no "restore code/conversation/both" choice (Claude's `/rewind` has 3 modes). No file-checkpoint snapshots tied to git stash on each Edit.
- **Effort:** **3 days** (1d LLM summary call, 1d PreCompact wiring, 1d /rewind 3-mode + file snapshots).

### P-10. /plan mode: real model-driven plan — but no plan re-run, no version history, no $EDITOR open, no Opus-in-plan

- **What we have:** Real model-written plan via `update_plan` tool, 5-state slash command, mutating-tool gate (`plan_mode.rs`, `repl.rs:624-692`).
- **Gap:** No `/plan open` to re-run a saved plan. No version numbers on plans (Claude saves `~/.claude/plans/<id>-v1.md`, `-v2.md`). No `Ctrl+G` shortcut to open plan in `$EDITOR` for direct edit before approve. No "Use Opus in plan mode, Sonnet otherwise" mode (option 4 in Claude's `/model`). No `--plan-mode` CLI flag wired through (we have `--mode plan` but Claude has explicit alias). No Shift+Tab toggle.
- **Effort:** **2 days** (1d versioning + open + $EDITOR, 1d Opus-in-plan + Shift+Tab).

### P-11. Voice: Whisper push-to-talk — no full-duplex, no realtime API

- **What we have:** Whisper API STT (`voice.rs:71-330`), push-to-talk via space.
- **Gap:** No realtime WebRTC voice mode (Claude mobile has full-duplex). No multiple-voice picker. No quota tracking. No `Realtime` slash command (in TUI enum `slash_command.rs:57` but not implemented).
- **Effort:** **4 days** (3d realtime WebRTC, 1d voice picker + quota).

### P-12. Web search: Tavily-only — no hosted Anthropic web tool, no citations

- **What we have:** Tavily client (`tools.rs:1029-1311`).
- **Gap:** No Anthropic-hosted web search (Claude provides web tool that doesn't require user API key). No citation chips with hover preview. No numbered footnotes injected into assistant output (Claude's UI renders these).
- **Effort:** **2 days** (1d hosted web wire, 1d citations).

### P-13. /init wizard: minimal vs Claude's 7-phase NEW_INIT

- **What we have:** `init.rs:1-271` writes AGENTS.md and registers project.
- **Gap:** No 7-phase wizard with `AskUserQuestion` interactive Q&A: project vs personal vs both, skills+hooks selection, format-on-edit hooks, `/verify` skill, GitHub CLI/lint/skill-creator suggestions (Claude's `init.ts:28-224`). No `/init-verifiers` 5-phase Playwright/Tmux/curl auto-detection wizard (262 LOC, Claude `init-verifiers.ts:1-262`). No `maybeMarkProjectOnboardingComplete` flag.
- **Effort:** **3 days** (2d wizard phases, 1d /init-verifiers).

### P-14. /security-review and /pr-comments are stubs — no migration helper

- **What we have:** Nothing wired.
- **Gap:** No `createMovedToPluginCommand` helper that lets a built-in command redirect to plugin install. Claude uses this for `/security-review` (243 LOC) + `/pr-comments`. No `shell-substitution-in-prompt` (`!\`git diff\``) wrapper which Claude's `executeShellCommandsInPrompt`provides. No frontmatter`allowed-tools:` parsing.
- **Effort:** **3 days** (1d /security-review, 1d /pr-comments + helper, 1d shell-sub-in-prompt).

### P-15. Status / cost / context: REPL `/status` shows 9 fields — no UI cards

- **What we have:** `/status` prints 9 lines (`repl.rs:584-604`), `/context` calls `session.context_report()`, `/cost` shows session cost.
- **Gap:** No interactive status card with version + plan + token usage bars. No `/usage` (5-hour-window bar, weekly bar, Claude Code rollup). No `/cost` breakdown (input vs output, cache hit rate). No `/extra-usage` overage configurator. No `/rate-limit-options` UI. No interactive `<HelpV2 commands>` typeahead in TUI like Claude's `commands/help/help.tsx`.
- **Effort:** **3 days** (2d cards, 1d bars).

### P-16. Theme picker: 1 widget — no per-session accent color

- **What we have:** `theme_picker.rs` widget + `/theme` slash command (`tui/widgets/theme_picker.rs`).
- **Gap:** No `/color [color|default]` setter. No persistence of `prompt-bar color` across sessions. No `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN` env-var equivalent (we lack `AGI_DISABLE_ALTERNATE_SCREEN`). No mouse-support / auto-copy on select / synchronized-output additions (Claude added these in v2.1.x).
- **Effort:** **2 days** (1d color, 1d alternate-screen + mouse).

### P-17. Custom prompts: name-prefixed `/prompts:<name>` — but no shell-sub, no AskUserQuestion, no allowed-tools frontmatter

- **What we have:** `command_registry.rs:113-128` parses CustomPrompts → `/prompts:<name>` slash entries.
- **Gap:** No frontmatter `allowed-tools:` parsing per-prompt. No `$ARGUMENTS` substitution (Claude's `argumentSubstitution.ts`). No skill-takeover unification (Claude unified `.claude/commands/` and `.claude/skills/` — both produce `/<name>` and skills win on conflict). No `paths:` glob filter for path-scoped prompts.
- **Effort:** **2 days** (1d frontmatter + $ARGUMENTS, 1d unify .commands/.skills).

### P-18. /resume / --resume / --continue: managed-session + JSON fallback — no PR-URL paste, no session search modal

- **What we have:** `resolve_resume_payload` falls back from managed → legacy JSON (`main.rs:696-728`); `--resume <id>`, `--continue` (`main.rs:147-150, 198-200`); `Session List/Show/Fork` subcommands.
- **Gap:** No "paste PR URL" → find session matching that PR. No interactive search modal (Claude opens an Ink picker). No `latest`/`@latest` tokens (we have those — `main.rs:669` — partial). No `--add-dir` joins (we have flag at `main.rs:310-311`).
- **Effort:** **2 days** (1d PR URL parse + GitHub API, 1d Ink picker).

### P-19. /ide: ecosystem scanner — no JetBrains/VS Code lock-file IPC

- **What we have:** `ecosystem.rs` detects JetBrains paths (`ecosystem.rs:195-200`).
- **Gap:** No `/ide` slash command implemented. No lock-file at `~/.agiworkforce/ide/` advertising the running CLI to IDE plugins (Claude's pattern at `~/.claude/ide/`). No `Cmd/Ctrl+Esc` quick-launch protocol. No `Cmd+Option+K` `@file#L1-99` insert protocol. No diagnostic-sharing IPC.
- **Effort:** **4 days** (1d lockfile, 2d IDE handshake protocol, 1d diagnostic forwarding).

### P-20. Marketplace: search + install — no remote-registry actually deployed

- **What we have:** `marketplace.rs:75 DEFAULT_REGISTRY_URL = "https://registry.agiworkforce.com/plugins/v1"`; HTTP GET with graceful empty-list fallback.
- **Gap:** Per project memory: "registry.agiworkforce.com not deployed" (`apps/cli/src/main.rs:60` PHASE2 marker). No marketplace.json schema. No 4,200+ skills / 770+ MCP servers / 2,500+ marketplaces ecosystem. No `claudemarketplaces.com` equivalent.
- **Effort:** **10 days** (off-CLI infra: 5d registry deploy, 3d submission flow, 2d auth + moderation).

### P-21. Notebook tools: zero

- **What we have:** No notebook tools.
- **Gap:** Claude ships `NotebookEdit` and `NotebookRead` tools for Jupyter `.ipynb` files. Useful for ML/data workflows. Per `tasks/research/deep/t4-mcp-lsp-skill-tools.md` references.
- **Effort:** **2 days** (1d JSON parse + cell ops, 1d output preservation).

### P-22. Worktree: zero CLI surface

- **What we have:** No `--worktree` flag handling.
- **Gap:** Claude has `--worktree` flag and `WorktreeCreate`/`WorktreeRemove` hooks. `/batch` skill uses git worktrees for parallel-isolated workers. No `worktree.baseRef` settings key.
- **Effort:** **3 days** (1d --worktree flag, 1d worktree manager, 1d hook events).

---

## Missing (per category)

### Tools (in addition to Partial P-21)

- **NotebookEdit / NotebookRead** — Jupyter cell ops.
- **Computer Use tool family** (screenshot, mouse, keyboard, double_click, scroll, etc.) — Claude API, not CLI tool, but our roadmap mentions parity gaps.
- **Sandbox proxy logs** — not exposed in-CLI.
- **File suggestion typeahead** — Claude's `executeFileSuggestionCommand` 5-second timeout shell hook (`hooks.ts:4577-4738`).
- **Status-line shell hook** — Claude's `executeStatusLineCommand` (separate from `Statusline` slash; our `statusline.rs` is a TUI status indicator, not a configurable shell-hook status line — gap).

### Sub-agents

- Built-in subagents: **Explore**, **Plan**, **general-purpose**, **statusline-setup** (none in our repo).
- "Generate with Claude" Library wizard.
- `/agents` interactive scope toggle (Personal/Project).
- `whenToUse`, `paths:` frontmatter fields.
- "PROACTIVELY"/"MUST BE USED" semantic triggers.
- Agent marketplace integration (VoltAgent's `awesome-claude-code-subagents` 100+; `wshobson/agents` 80+).

### Agent teams (Cowork / Dispatch parity at CLI level)

- **TeammateIdle / TaskCreated / TaskCompleted** hooks.
- Cowork-style background-task runner.
- `/dispatch` mobile→CLI bridge.
- `/team-onboarding` (Claude v2.1.101+).

### MCP

- **Elicitation / ElicitationResult** events round-trip.
- `/mcp xaa setup --issuer ... --client-id ...` SEP-990 IdP CLI subcommand.
- MCP Apps interactive UI rendering (Asana, Box, Canva, Clay, Figma, Hex, Monday, Slack, Salesforce launch partners).
- MCP server health probe + status.
- `mcp__<server>__<tool>` namespace conventions in tool names (we have generic `mcp` prefixing but no automatic namespacing of MCP tools).

### Plugins

- **Marketplace browse UI** (16 component files in Claude `commands/plugin/`).
- `claude plugin tag` Git release tags with version validation.
- `--plugin-url` flag (May 2026).
- `enabledPlugins` settings array.
- `extraKnownMarketplaces` / `strictKnownMarketplaces`.
- Multi-marketplace federation.
- Plugin trust warnings UI.
- Plugin options dialog.

### Skills

- **17 bundled skills** (we have 0 first-party skills bundled in binary): `/loop`, `/simplify`, `/debug`, `/batch`, `/verify`, `/stuck`, `/remember`, `/lorem-ipsum`, `/skillify`, `/update-config`, `/keybindings`, `/claude-api`, `/claude-in-chrome`, `/schedule-remote-agents`, `/dream`, `/hunter`, `/run-skill-generator`.
- `/loop [interval] <prompt>` recurring scheduler.
- `/schedule-remote-agents` cron remote agents.
- Skill marketplace install (`/plugin marketplace add <repo>`).
- `whenToUse`, `paths:` filter on skills.
- Plugin-bundled skills (Claude has `builtinPluginSkills` ordering).
- `disableModelInvocation` distinct from `userInvocable` (we have these in registry but not enforced consistently — `command_registry.rs:38-39`).

### Hooks (in addition to Partial P-1)

- **HTTP** handler with allowedHttpHookUrls + SSRF guard.
- **prompt** handler (LLM-evaluated with Haiku-class model).
- **agent** handler (multi-turn 50-cap subagent hook).
- **callback** / **function** handler (in-memory SDK).
- Async hooks with first-line `{"async": true}` + AsyncHookRegistry.
- Trust-gate before any hook fires.
- 13 missing event names: Setup, InstructionsLoaded, PostToolUseFailure, StopFailure, TeammateIdle, TaskCreated, TaskCompleted, Elicitation, ElicitationResult, ConfigChange, CwdChanged, WorktreeCreate, WorktreeRemove.
- `executeInBackground` / `asyncRewake`.
- Plugin variable substitution (`${CLAUDE_PLUGIN_ROOT}`, `${user_config.X}`).
- Per-event env var contract (`CLAUDE_FILE_PATH`, `CLAUDE_TOOL_NAME`, `CLAUDE_TOOL_INPUT`, `CLAUDE_SESSION_ID`, `CLAUDE_PROJECT_DIR`, `CLAUDECODE=1`) — none verified in our `hooks.rs`.
- `hookSpecificOutput.permissionDecision allow|deny|ask` schema.
- `hookSpecificOutput.updatedInput` (model uses this instead of original tool input).
- `hookSpecificOutput.additionalContext` injection.
- `hookSpecificOutput.watchPaths` for FileChanged registration.
- `hookSpecificOutput.initialUserMessage` (SessionStart-only).
- `getHooksConfig` 7-source merge (managed/project/user/session/skill/plugin/built-in).

### System architecture

- **CCR (Claude Code Remote)** — `--teleport` to switch local↔web, `&` background a session, ant-only `/share` & `/summary`.
- **Bridge mode** with WebSocket + remote-control; `/remote-control` `/rc` slash command.
- **ant-only INTERNAL commands** namespace (we have no `USER_TYPE='ant'` partition).
- `BRIDGE_SAFE_COMMANDS` / `REMOTE_SAFE_COMMANDS` allowlists.
- `getMcpSkillCommands` MCP-served prompts when `MCP_SKILLS` flag on.
- `clearCommandsCache` / `clearCommandMemoizationCaches` (we don't memoize loaders heavily).
- `formatDescriptionWithSource` provenance suffix rendering (`(plugin)`, `(bundled)`, `(workflow)`).
- Lazy-load `load: () => import(...)` per-command code-splitting (Rust analog: feature-gated modules).
- `INTERNAL_ONLY_COMMANDS` partition (`commands.ts:225-254`).
- `availability: ['claude-ai' | 'console']` auth gates.
- `kind: 'workflow'` badge.
- `isSensitive` arg redaction.
- `immediate: true` mid-generation bypass semantics.
- `/desktop` deep-link `claude://` (we have no `agiworkforce://` URL scheme).
- `.mcpb` desktop-extension package format.
- `getEnhancedPRAttribution` for changelog.

### Streaming

- See P-7 above. Add: `result.is_error`, `interrupt`, MCP server status events, ControlRequest dozens.

### Compaction

- LLM-summary path.
- Real `PreCompact` hook firing.
- `/compact [retain ...]` flag retention markers.
- `lastFreeUntilCompact` status field (Claude tracks this for the status line).

### Sandbox

- **Auto Mode classifier** (`--enable-auto-mode`).
- Windows AppContainer / Job Object.
- Linux Landlock LSM.
- `sandbox.bwrapPath` / `sandbox.socatPath` settings.
- Network proxy with domain allowlist returning 403 for blocks.
- Hyper-V / yukonSilver VM bundle (Cowork-class — out of CLI scope but referenced).

### Auth

- **Subscriber-based auth** (Claude Max OAuth, ChatGPT Plus OAuth — we have OAuth wired but no enforcement of subscription tier).
- `forceLoginMethod claudeai|console`.
- `forceLoginOrgUUID`.
- `oauthRefresh` command (we have OAuth refresh but no slash trigger).
- Bedrock / Vertex / Foundry / custom-base-URL providers (Claude excludes these from `console` availability).
- "Sign out from CLI" button in Claude Web → revokes our token (we have no equivalent server endpoint).
- Remote Control session list per-user.

### Permissions

- `permissions.allow / deny / ask / defaultMode / disableBypassPermissionsMode / additionalDirectories` settings keys — only allow/deny implemented.
- `--dangerously-skip-permissions` (we have at `main.rs:212`).
- 6-mode permission model (we have 5 — Claude has `default`, `acceptEdits`, `plan`, `auto`, `bypassPermissions`, `dontAsk`; we lack `auto`).
- Per-skill `paths:` glob gate.
- Per-tool `permissionDecision` round (we have boolean approve/deny only).
- Path-scoped allow rules `Read(~/...)` / `Edit(~/.claude/settings.json)`.

### Status line

- **Configurable status-line via shell hook** (Claude's `executeStatusLineCommand` 5-s timeout shell hook with JSON output; `workspace.git_worktree`, `context_window`, `lastFreeUntilCompact`, `currentBackupPath` fields).
- We have a TUI status indicator widget (`status_indicator_widget.rs`) but no shell-hook configurable status line.
- `/statusline` slash command in TUI enum but unimplemented (`tui/slash_command.rs:42`).
- `statusline-setup` subagent.

### Keybindings

- **Customizable keybindings** at `~/.agiworkforce/keybindings.json` — Claude has `~/.claude/keybindings.json`. We have `/keybindings` mentioned in tooltips (`tooltips.txt`) but no implementation in `apps/cli/src/`.
- `Shift+Tab` (twice) to toggle plan mode.
- `Ctrl+G` open plan in $EDITOR.
- `Ctrl+B` background bash.
- `Cmd/Ctrl+.` global shortcut (desktop).
- Custom-key chord bindings.
- `Ctrl+O` verbose mode (shows hook execution).

### Vim mode

- **Zero**. Claude has `/vim` toggle (`commands/vim/index.ts:1-12`); REPL composer respects vim-modal editing. Our composer uses crossterm raw mode without modal commands.
- **Effort:** 4 days (1d normal/insert/visual modes, 2d motion + operator commands, 1d undo).

### Voice

- **Realtime full-duplex** mode (Claude has experimental web voice + mobile full-duplex).
- Multi-voice picker.
- Voice output (we transcribe input only).
- Quota tracking (~20-30 voice convos/day Free).
- `/voice <toggle>` works partially in REPL (`repl.rs:747-760`).

### Slash commands (in addition to P-4)

- `/teleport`, `/share`, `/summary`, `/insights` (3,200 LOC), `/install-github-app` (11-step wizard), `/install-slack-app`, `/chrome`, `/passes`, `/tasks` (background bashes), `/tag`, `/heapdump`, `/mobile`, `/desktop`, `/ide`, `/feedback` modal, `/upgrade` upsell, `/extra-usage`, `/privacy-settings`, `/terminal-setup`, `/release-notes`, `/copy N` with N-th-latest selection.
- `/loop [interval] <prompt>` parsing (Claude's regex: `\d+[smhd]` lead, "every <N><unit>" trail).
- `/agents` Library UI.
- `/skills` interactive list (we print plain text — `repl.rs:573-576`).
- `/permissions` interactive editor (we delegate to `handle_permissions(arg)`).

### Screens

- **HelpV2** typeahead help.
- **AgentsMenu** Personal/Project.
- **HooksConfigMenu**.
- **PluginSettings** + 15 plugin sub-screens.
- **ResumePicker** (we have `tui/resume_picker.rs` 2,433 LOC — partial coverage).
- **Login** factory + OAuth UI.
- **ModePicker / Onboarding wizard** (we have `onboarding.rs` 757 LOC).
- **InstallGithubApp 11-step wizard**.
- **CowOnboarding wizard** (4-step Cowork onboarding — out of CLI scope).
- **Stickers** order page.
- **Thinkback animation** (Year in Review).

### Settings

- See P-6: ~95 keys missing.

### Workflow

- **Workflows directory** at `.claude/workflows/`.
- `getWorkflowCommands(cwd)` discovery.
- `kind: 'workflow'` badge in autocomplete.
- `WorkflowTool` (`tools/WorkflowTool/createWorkflowCommand.ts:404`).

### System prompts

- `--exclude-dynamic-system-prompt-sections` (caching) — Claude flag.
- `--system-prompt-file` ✓ (we have at `main.rs:357`).
- `--append-system-prompt-file` ✓ (we have at `main.rs:361`).
- `--dump-system-prompt` ✓ (we have at `main.rs:386`).
- Multiple system-prompt sections with cache-bust controls.
- Project-instructions injection from `<project_instructions>` block.
- Skill-progressive-disclosure: Claude reads only `name`+`description` at session start, dynamically loads body when relevant. We load full body in `format_skills_for_prompt` (`skills.rs:403-417`).

### Design (TUI / UX)

- Mouse support, auto-copy on select, synchronized output (Claude added v2.1.x).
- `iTerm2 clipboard pass-through` via `/terminal-setup` (Apple Terminal: Option+Enter for newline + visual bell).
- Random per-session accent color via `/color`.
- `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN` opt-out (we lack `AGI_DISABLE_ALTERNATE_SCREEN`).
- Verbose-mode (`Ctrl+O`) hook execution display.
- Background-task indicator (Claude's `/tasks` + `/bashes` UI).
- Inline approval modal vs banner (we use dialoguer prompt — Claude has 5 distinct approval UIs).

---

## Per-axis percentage

| Axis                             | Have                                           | Total Claude features                                                                              | % parity |
| -------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| **Tools (built-in)**             | 18                                             | ~22 (incl. NotebookEdit/NotebookRead, status-line hook, file-suggestion hook, computer-use family) | **82%**  |
| **Web search / Answer**          | Tavily                                         | Anthropic-hosted + citations + footnotes                                                           | **40%**  |
| **MCP**                          | stdio + SSE + HTTP + OAuth (3 transports)      | + Elicitation + IdP CLI + MCP Apps + dedup                                                         | **70%**  |
| **Plugins**                      | manifest + install + search + 5 formats        | + browse UI + tag + 16-component panel + multi-marketplace                                         | **45%**  |
| **Skills**                       | discover + score + match                       | + 17 bundled + paths/whenToUse + progressive disclosure                                            | **35%**  |
| **Sub-agents**                   | manager + AgentDefinition + concurrent runtime | + 4 built-ins + Library UI + wizard + frontmatter + marketplace                                    | **45%**  |
| **Hooks**                        | 22 events × 1 type                             | 27 events × 6 types + async + trust + 5 dispatch fields                                            | **20%**  |
| **Permissions**                  | allow/deny + 5 modes                           | 6 modes + 8 settings keys + path-scoped rules                                                      | **55%**  |
| **Sandbox**                      | Seatbelt + bwrap                               | + Auto-Mode classifier + Windows + Landlock + proxy                                                | **45%**  |
| **Compaction**                   | prune + render + checkpoints                   | + LLM summary + PreCompact wiring + retain markers + 3-mode rewind                                 | **55%**  |
| **Streaming**                    | 9 events                                       | 30+ events + ControlRequest plane                                                                  | **35%**  |
| **Slash commands**               | ~22 implemented + 41 enum stubs                | ~92 + 17 bundled = 109 user-visible                                                                | **22%**  |
| **Settings**                     | ~30 keys                                       | ~125 keys                                                                                          | **24%**  |
| **Keybindings**                  | None customizable                              | `~/.claude/keybindings.json` + 6 chord bindings                                                    | **5%**   |
| **Vim mode**                     | None                                           | `/vim` modal editing                                                                               | **0%**   |
| **Voice**                        | Whisper STT push-to-talk                       | Realtime full-duplex + voice picker                                                                | **30%**  |
| **Status line**                  | TUI widget                                     | Shell-hook configurable + 4 fields                                                                 | **30%**  |
| **Screens**                      | ~5 (resume, theme, onboarding, model, effort)  | ~30 (incl. plugin x16, agents, hooks, install-github-app x11)                                      | **17%**  |
| **Workflow / `kind:'workflow'`** | None                                           | `.claude/workflows/` + WorkflowTool                                                                | **0%**   |
| **System prompts**               | dump + system + append + file variants         | + cache-bust + skill-progressive-disclosure                                                        | **70%**  |
| **Auth**                         | OAuth Anthropic+OpenAI+AGI                     | + force-login + Bedrock/Vertex exclusion + remote sign-out                                         | **50%**  |
| **Design (TUI UX)**              | Ratatui base + theme + markdown                | + mouse + auto-copy + iTerm + verbose mode + 5 approval UIs                                        | **50%**  |

---

## Surface percentage estimate

**Weighted average: ~36% parity to Claude Code CLI v2.1.133.**

Justification:

- Heavy weight on **slash commands (22%)**, **hooks (20%)**, **screens (17%)**, **keybindings (5%)**, **vim mode (0%)**, **workflow (0%)** drags down the overall score — these are user-visible everyday-experience axes.
- **Tools (82%)**, **MCP (70%)**, **system prompts (70%)** are strong — the engine is solid.
- **Skills (35%)** and **bundled skills (0% out of 17)** are a major gap because Claude's daily-driver flows like `/loop`, `/simplify`, `/debug`, `/batch`, `/security-review` literally don't exist in our binary.
- **Plugin marketplace (45%)** is foundational but blocked on `registry.agiworkforce.com` deployment per PHASE2 marker (`apps/cli/src/main.rs:60`).
- We over-invest in **streaming events**, **A2A**, **routing**, **daemon mode** that have no Claude analogue — these don't move the parity needle but consume LOC.
- Claude differentiates on multi-provider, BYOK, local LLM (per project memory) — those are _our_ differentiators and should not regress.

**Reasonable upper-bound if we close all P-items: 78%** (Vim, Workflows, Voice realtime, Auto-Mode classifier, full hook system are the long tail).

---

## Effort to reach 100% (days breakdown)

| Workstream                                                                          | Days | P# refs              |
| ----------------------------------------------------------------------------------- | ---- | -------------------- |
| **Hook system overhaul (HTTP/prompt/agent/async/13 events)**                        | 5    | P-1                  |
| **MCP completion (Elicitation, IdP CLI, dedup)**                                    | 3    | P-2                  |
| **Subagent Library + 4 built-ins**                                                  | 4    | P-3                  |
| **Slash commands (12 bundled skills + 12 built-ins)**                               | 8    | P-4                  |
| **Plugin UI + tag + multi-marketplace**                                             | 5    | P-5                  |
| **Settings.json 95 keys**                                                           | 6    | P-6                  |
| **Streaming event union + ControlRequest**                                          | 3    | P-7                  |
| **Sandbox auto-mode + Windows + Landlock**                                          | 5    | P-8                  |
| **Compaction LLM summary + PreCompact + 3-mode rewind**                             | 3    | P-9                  |
| **Plan-mode versioning + open + Opus-in-plan**                                      | 2    | P-10                 |
| **Voice realtime + picker + quota**                                                 | 4    | P-11                 |
| **Hosted web search + citations**                                                   | 2    | P-12                 |
| **Init wizard + init-verifiers**                                                    | 3    | P-13                 |
| **/security-review + /pr-comments + shell-sub-in-prompt**                           | 3    | P-14                 |
| **Status / cost / context cards + bars**                                            | 3    | P-15                 |
| **Theme picker + /color + alt-screen + mouse**                                      | 2    | P-16                 |
| **Custom prompts: shell-sub + $ARGUMENTS + skill unify**                            | 2    | P-17                 |
| **/resume PR-URL + Ink picker + --add-dir polish**                                  | 2    | P-18                 |
| **/ide lockfile + IDE handshake + diagnostic**                                      | 4    | P-19                 |
| **Marketplace registry deploy**                                                     | 10   | P-20 (off-CLI infra) |
| **Notebook tools (Edit/Read)**                                                      | 2    | P-21                 |
| **Worktree CLI + manager + hooks**                                                  | 3    | P-22                 |
| **Vim mode (modal/motion/operator/undo)**                                           | 4    | Missing              |
| **Keybindings.json + chord bindings + 6 reserved**                                  | 3    | Missing              |
| **Workflow directory + WorkflowTool + kind badge**                                  | 2    | Missing              |
| **Configurable status-line shell hook + fields**                                    | 2    | Missing              |
| **17 bundled skills (loop/simplify/debug/batch/etc.)**                              | 6    | Missing              |
| **CCR / bridge / teleport / share / summary**                                       | 6    | Missing              |
| **HelpV2 + 5 approval UIs + tasks/feedback/upgrade screens**                        | 5    | Missing              |
| **GitHub app + Slack app + Chrome wizards**                                         | 4    | Missing              |
| **Stickers / passes / thinkback / privacy-settings**                                | 2    | Missing              |
| **`.mcpb` desktop-extension format + `agiworkforce://` URL**                        | 2    | Missing              |
| **TUI mouse + auto-copy + iTerm clipboard + verbose**                               | 2    | Missing              |
| **Auto-discovery for managed/project/user/session/skill/plugin/builtin hook merge** | 2    | Missing              |
| **Skill progressive disclosure (name+description-only at start)**                   | 1    | Missing              |
| **Test coverage uplift to 999→1500 with new code**                                  | 5    | Cross-cutting        |

**Total: ~127 days at 1 dev / single-track pace.** At AI velocity (Claude Max parallel-agent dispatch per `dev-methodology.md`), with 4-way fan-out for independent workstreams: **~32–40 calendar days**.

**Pragmatic 80%-parity slice (top 10 leverage items):** ~28 days = 5–7 calendar weeks at AI velocity.

---

## Notes on cited file:line accuracy

- All `apps/cli/src/*` references inspected directly via Read/Grep.
- Claude reference paths use the form `~/Desktop/reference/src/...` — preserved verbatim from the deep-dives at `tasks/research/deep/cmd1-commands-all.md`, `m4-hooks-system.md`, `anthropic-claude-suite-may-2026.md` §5.
- Parts that say "tasks/research/deep/m4-hooks-system.md:N" are absolute references inside this repo's research drop.
- Counts of slash commands in TUI enum (41) vs implemented in REPL (~22) reflects actual code state — many TUI enum variants like `Realtime`, `TestApproval`, `Statusline`, `MultiAgents`, `Apps`, `Plugins`, `Settings`, `Personality`, `MemoryDrop`, `MemoryUpdate`, `DebugConfig`, `Title`, `Mention`, `ElevateSandbox`, `SandboxReadRoot` lack implementation handlers and represent the `apps/cli/src/tui/slash_command.rs:189-196` `is_visible()` filter only, not real working commands.
- 999 test count per CLI audit 2026-05-05 (project memory).
