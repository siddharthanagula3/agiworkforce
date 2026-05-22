# CLI / TUI current state

**Frontend tree root**: `apps/cli/src/tui/`
**Approximate component count / file count**: 125 TUI files, ~155K LOC (incl. snapshot tests); 200 total `.rs` files

---

## Per-category inventory

#### 1. APP SHELL

HAS:

- Full-terminal Ratatui TUI with persistent top/main viewport and fixed bottom pane (composer + footer/status bar)
- Session header rendered by `chatwidget/session_header.rs` (thread name, model label)
- Terminal title customization via `/title` (configurable fields: model, branch, session, dir) — `bottom_pane/title_setup.rs`, `tui/terminal_title.rs`
- Transcript overlay (full-screen pager, `Ctrl+T`) — `tui/pager_overlay.rs`
- Multi-agent thread navigation: `tui/app/agent_navigation.rs`, `/agent` slash command switches active thread
- Background terminal list: `/ps` slash command + `tui/exec_command.rs`
- No multi-window / tab chrome (terminal emulator handles that)

#### 2. ONBOARDING / AUTH

HAS:

- Interactive first-run wizard at `src/onboarding.rs` (inquire-based, not Ratatui)
- Auth method selection: AGI Workforce managed cloud OAuth, raw API key entry, provider-specific OAuth (OpenAI, Anthropic, GitHub Copilot, OpenRouter, NVIDIA, Ollama), or skip
- Provider OAuth via device-flow / browser redirect: `src/auth.rs`, `src/auth_oauth.rs`, `src/oauth.rs`
- `.setup_complete` marker written on finish; re-runs if absent
- Onboarding model picker built from catalog (no hardcoded IDs): `src/onboarding.rs:301`
- `/logout` slash command available in TUI
  MISSING:
- Post-signin permissions overview screen (onboarding jumps straight to TUI after auth)
- Mode/profile selection step (Local vs Cloud not surfaced in onboarding; set via config/flags only)

#### 3. EMPTY STATE

PARTIAL:

- No dedicated hero/splash empty state widget; when the conversation is blank the composer is simply open with placeholder text
- Splash animation exists for startup: `tui/ascii_animation.rs`
- Update-available prompt shown before TUI starts if newer version detected: `tui/update_prompt.rs`
  MISSING:
- Suggested prompts / quick-action chips in empty state
- Model badge shown in empty-state hero area (model is only visible in status bar)
- Productivity-first framing copy block

#### 4. COMPOSER

HAS:

- Multi-line `TextArea` with paste support, undo/redo, cursor movement: `bottom_pane/composer/`
- `@mention` file search popup (fuzzy, `tui/file_search.rs`, `bottom_pane/file_search_popup.rs`)
- `@mention` connector/app popup: `chatwidget/connectors_popup.rs`
- `@mention` skill popup: `bottom_pane/skill_popup.rs`
- Slash command palette (inline autocomplete popup): `bottom_pane/slash_commands.rs`, `tui/slash_command.rs`
- Image attachment: local image paths parsed from text; remote URL attachments retained in history
- Paste-burst detection (large clipboard paste handled gracefully): `bottom_pane/paste_burst.rs`
- Voice hold-to-talk (space-hold-to-record + transcription): `bottom_pane/chat_composer_voice.rs`, `tui/voice.rs` — gated `#[cfg(not(target_os = "linux"))]`
- Composer history (cross-session text, in-session full entries with attachments): `bottom_pane/chat_composer_history.rs`
- External editor integration: `tui/external_editor.rs`
- Send / stop / interrupt key handling: `bottom_pane/composer/key_handling.rs`
- Pending input preview (shows content before confirming): `bottom_pane/pending_input_preview.rs`
  PARTIAL:
- Model picker accessible via `/model` slash command (not a persistent inline picker chip in composer bar)
- No screenshot attachment (local file path only, no screen-capture trigger)
- No cloud-drive / notebook attachment source
- Voice: push-to-talk wired; realtime duplex mode (`/realtime`) is experimental and behind feature flag

#### 5. CHAT / MESSAGES

HAS:

- User message cells: `tui/history_cell.rs:UserHistoryCell` — text + attachment labels rendered
- Assistant markdown rendering: `tui/markdown_render.rs`, `tui/markdown_renderer.rs`, `tui/markdown_stream.rs` — code blocks with syntax highlighting, diff blocks, tables
- Thinking/reasoning blocks: `tui/history_cell.rs:ReasoningSummaryCell` — collapsed summary cell shown after thinking completes
- Inline tool-use (exec cells): `tui/exec_cell/` — collapsible call block showing command + stdout/stderr, truncated with middle-elision, expandable via pager
- Tool approval prompts inline in bottom pane: `bottom_pane/approval_overlay.rs`, `tui/widgets/approval_overlay.rs`
- MCP elicitation forms: `bottom_pane/mcp_server_elicitation.rs` — structured input overlays for MCP tool calls
- Copy latest output to clipboard: `/copy` slash command
- Session transcript view: `Ctrl+T` pager overlay with live streaming tail
- Git diff rendering: `tui/diff_render.rs`
- Diff review overlay: `tui/widgets/diff_review.rs` (per-file approve/reject)
- Update-available history cell: `tui/history_cell.rs:UpdateAvailableHistoryCell`
- Cost / token HUD overlay: `tui/cost_hud.rs` (input tokens, output tokens, cache hits, running cost)
  PARTIAL:
- Thinking blocks shown as collapsed summary only; no expandable in-flight duration display with clock icon
- No inline web search results with favicons or citation chips
- No copy/rate/regenerate per-message action buttons (only global `/copy`)
- No scroll-to-bottom FAB (TUI scrolling is keyboard-driven: PgDn / arrow keys)
- No comparison A/B layout

#### 6. ARTIFACTS / SIDEBAR

N/A: Terminal TUI has no split-pane artifact sidebar. Code blocks are inline in the message stream. `/copy` extracts last output to clipboard. No preview/download panel.

#### 7. PROJECTS / SPACES

PARTIAL:

- Project context: `src/project_scope.rs`, `src/project_registry.rs` (module exists but marked `#[allow(dead_code)]` / DEFER per audit)
- `/init` creates `AGENTS.md` project doc for the current directory
- Thread rename (`/rename`), fork (`/fork`), resume picker (`/resume`, `tui/resume_picker.rs`) — session management exists
  MISSING:
- Gallery grid view of projects
- Project detail view with Chats / Sources / Knowledge tabs
- Project-level system prompt UI (config file only, no TUI picker)

#### 8. CONNECTORS / TOOLS / SKILLS

HAS:

- Skills management: `/skills` → `SkillsToggleView` (searchable enable/disable list, auto-saves): `bottom_pane/skills_toggle_view.rs`, `tui/widgets/skills_toggle.rs`
- Skill slash-command inline invocation: skill popup via `@mention` in composer
- Connector (Apps) popup via `@mention` or `/apps`: `chatwidget/connectors_popup.rs`
- Plugin browser: `/plugins` slash command — `chatwidget/plugins.rs`
- MCP server tool listing: `/mcp` slash command
- MCP elicitation (structured form + approval): `bottom_pane/mcp_server_elicitation.rs`
  PARTIAL:
- No per-connector OAuth grant modal (auth happens out-of-band / in browser)
- No directory/gallery grid view; connectors are a flat list popup

#### 9. SETTINGS

HAS:

- Status line configurator: `/statusline` → `StatusLineSetupView` (multi-select + reorder, live preview): `bottom_pane/status_line_setup.rs`
- Terminal title configurator: `/title` → `TerminalTitleSetupView`: `bottom_pane/title_setup.rs`
- Theme / syntax highlight picker: `/theme` → `tui/theme_picker.rs`, `tui/widgets/theme_picker.rs`
- Approvals/permissions picker: `/approvals`, `/permissions` → `bottom_pane/list_selection_view.rs`
- Sandbox elevation: `/setup-default-sandbox`, `/sandbox-add-read-dir`
- Experimental features toggle: `/experimental` → `bottom_pane/experimental_features_view.rs`
- Collaboration mode picker: `/collab` → `tui/collaboration_modes.rs`
- Personality / communication style picker: `/personality`
- Realtime audio device settings: `/settings` → audio device selector
- Debug config view: `/debug-config`
- Feedback submission: `/feedback`
  MISSING:
- Settings left-nav UI (settings are all slash-command-invoked overlays, no unified settings screen)
- Billing / Usage / Notifications / Worktrees / Environments / Git sections as navigable pages

#### 10. PROFILE / USER POPOVER

PARTIAL:

- `/status` slash command shows current session config: model, sandbox, git branch, token usage
- `/logout` available
- Account info shown in status bar (model, limits)
  MISSING:
- Account info popover/card with plan badge and Upgrade CTA
- Zoom / font controls (terminal controls those)

#### 11. MODEL / MODE FEATURES

HAS:

- Model picker with provider-grouped list + search: `/model` → `tui/widgets/model_picker.rs`
  - Shows model name, capability label, context window, pricing per provider section
  - Effort selector embedded in model picker: Low / Medium / High / Max
- Reasoning effort standalone picker: `/effort` → `tui/widgets/effort_picker.rs`
- Fast mode toggle: `/fast [on|off]` — toggles faster inference at 2x plan usage
- Plan mode: `/plan [accept|reject|show]` — `chatwidget/plan.rs`, `src/plan_mode.rs` — `update_plan` tool
- Collaboration mode cycle: `/collab` — `tui/collaboration_modes.rs`
- Multi-agent thread switch: `/agent`, `/subagents`
- Model-changed banner: `chatwidget/model_config.rs`
- Thinking state tracked in terminal title: `TerminalTitleStatusKind::Thinking`
  PARTIAL:
- No Quick mode modal (closest is `/fast` toggle)
- No Auto vs manual model selection toggle (always manual)
- No region/routing toggles (US-only flag not exposed in TUI)
  MISSING:
- Inline per-mode model-changed banner in chat stream

#### 12. PRICING / UPGRADE

HAS:

- Rate limit warnings: `chatwidget/rate_limit.rs` + `tui/status/rate_limits.rs`
  - 5-hour usage limit display (FiveHourLimit status bar item)
  - Weekly usage limit display (WeeklyLimit status bar item) with countdown text
  - Usage limit exceeded error → `RateLimitErrorKind::UsageLimit` → user-visible warning + optional provider-switch prompt
  - Server overloaded error surfaced: `RateLimitErrorKind::ServerOverloaded`
- Cost HUD: `tui/cost_hud.rs` — live running cost + token counts overlay
- Tier cache: `src/tier_cache.rs` — reads user tier from backend
  MISSING:
- Inline paywall card blocking actions
- Plans modal with tier comparison table
- Individual vs team/enterprise tabs
- Credit balance + auto-refill UI
- Upgrade CTA / link in TUI (no clickable links in terminal)

#### 13. ADMIN / ENTERPRISE

N/A: CLI has no team admin console, audit log UI, SSO setup, or seat management. `src/teams.rs` exists but is infrastructure-only (no TUI).

#### 14. MOBILE / COMPACT MODE

N/A: Terminal TUI adapts to narrow terminal widths at the ratatui layout level but has no explicit mobile/compact mode. No bottom-sheet, edge-swipe, or full-screen modal patterns.

#### 15. AGENTIC / COMPUTER USE

HAS:

- Approval overlay (Ask vs Act): `bottom_pane/approval_overlay.rs` — presents exec, apply-patch, permissions, MCP elicitation requests with Accept / Deny / Always-allow / Always-deny options
- Pending thread approvals queue: `bottom_pane/pending_thread_approvals.rs`
- Approval modes cycle: `/approvals` picker (Ask / Suggest / Full-auto / Custom)
- Sandbox modes: `/setup-default-sandbox` (elevate to full sandbox), `/sandbox-add-read-dir` (add read path)
- Yolo / bypass-permissions: `--dangerously-skip-permissions` flag (CLI only, not TUI toggle)
- Guardian (action safety gate): `chatwidget/guardian.rs` — approved/denied action cells in history
- Agent turn status bar during execution: spinner + interrupt hint in `bottom_pane/footer.rs`
- Background terminal processes (`/ps`, `/stop`): `tui/exec_command.rs`
- Shift-Tab sandbox mode cycle: present in approval overlay key handling
  PARTIAL:
- No visual action replay log (exec cells are inline but not a separate replay pane)
- No bypass-permissions warning banner in TUI (flag is command-line only)
  MISSING:
- Computer use screen-capture / pixel-level interaction (CLI is text-only)

#### 16. BROWSER EXTENSION UX

N/A: Not a browser extension surface.

#### 17. VSCODE EXTENSION UX

N/A: Not a VS Code extension surface.

#### 18. CLI / TUI UX

HAS:

- Status bar (fully configurable via `/statusline`): items include model name, reasoning level, current dir, project root, git branch, context remaining/used, context window size, 5-hour limit, weekly limit, session ID, token counts, fast-mode indicator, app version — `bottom_pane/status_line_setup.rs`
- Slash command palette: 40+ commands (see `tui/slash_command.rs`) — popup with fuzzy filtering, description per command
- Model picker: grouped by provider, search, effort selector, inline pricing/context display — `/model`
- Reasoning effort selector: Low / Medium / High / Max — `/effort`
- Theme (syntax highlight) selector: `/theme` — `tui/theme_picker.rs`
- Sandbox mode management: `/setup-default-sandbox`, `/sandbox-add-read-dir`, Shift-Tab cycle in approval overlay
- Yolo / full-auto mode: `--dangerously-skip-permissions` CLI flag; `/approvals` picker covers ask/suggest/full-auto
- Folder trust: `src/exec_policy.rs`, `src/permissions.rs`
- Splash / update-available banner: full-screen `UpdatePromptScreen` before TUI starts if newer version detected — `tui/update_prompt.rs`
- Update-available history cell injected into chat on startup — `tui/history_cell.rs:UpdateAvailableHistoryCell`
- Weekly limit warnings: rate limit state machine in `chatwidget/rate_limit.rs` + `tui/status/rate_limits.rs`
- Fast mode banner: `/fast` toggle with status bar `FastMode` item
- Plan mode prompt: `/plan` slash command — `chatwidget/plan.rs`
- Collaboration mode switcher: `/collab`
- Multi-agent thread switch: `/agent`, `/subagents`
- Realtime voice mode (experimental): `/realtime`, `/settings` for device selection
- Personality / communication style: `/personality`
- Compact context: `/compact` — summarizes conversation to save context
- Session fork/resume: `/fork`, `/resume` (resume picker with searchable session list)
- Diff review overlay: `/review` — per-file approve/reject pane
- Debug config view: `/debug-config` — shows config layers and constraint sources
- Key hints rendered in footer: `tui/key_hint.rs`
- Tooltip system: `tui/tooltips.rs`
  PARTIAL:
- Post-signin permissions overview: not shown; permissions are configured separately via `/approvals`
- No explicit `--mode plan` banner in status bar (plan mode is slash-command invoked)
  MISSING:
- Inline upgrade / paywall prompt triggered by usage limit hit (shows error text only)
- Graphical onboarding permissions overview screen

---

## Component reuse opportunities

- Chat rendering is entirely bespoke Ratatui (`tui/history_cell.rs`, `tui/exec_cell/`, `tui/markdown_render.rs`) — no shared package with `packages/chat` or `packages/unified-chat`
- Design tokens (`packages/design-tokens` teal/terracotta) are not consumed; colors are declared locally in `tui/color.rs` and `tui/design_system.rs`
- `packages/llm-normalize` tool-call normalization is not used by the CLI; CLI has its own provider normalization in `src/models.rs` + `src/provider.rs`
- `packages/mcp` is not used; CLI has its own MCP implementation in `src/mcp/`
- The model catalog is read from `packages/types/src/models.json` via `src/model_catalog.rs` — this is correct and shared with other surfaces

## Known gaps the surface owner already knows about

1. Ghost model `claude-opus-4-6-mini` reachable in TUI at `tui/chatwidget.rs:412` and `tui/bottom_pane/list_selection_view.rs:1415,1497` (P0 per FINAL_AUDIT §9)
2. `FAST_STATUS_MODEL = "gpt-5.4"` hardcoded const at `tui/chatwidget.rs:344` — violates locked models-from-catalog rule (P0)
3. Sandbox: Windows + Linux Landlock are enum stubs (`sandbox.rs:159` silent fallthrough = P1)
4. MCP: stdio transport only; SSE and Streamable HTTP wired in `src/mcp/` but not surfaced as TUI config options
5. Voice: hold-to-talk is `#[cfg(not(target_os = "linux"))]`-gated — Linux users have no voice input; realtime duplex mode is experimental-only
