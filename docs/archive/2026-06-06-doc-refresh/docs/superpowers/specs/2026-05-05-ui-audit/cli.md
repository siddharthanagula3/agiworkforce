# CLI UI/UX Gap Audit — 2026-05-05

## Surface

- App path: `apps/cli/`
- Refs studied: 36 screenshots from `claude-code/` (5), `codex-cli/` (15), `gemini-cli/` (16)
- Engineer: cli-engineer

---

## A. Current state inventory

1. **First-run / onboarding** — `apps/cli/src/onboarding.rs:69-229`: ASCII art banner + `dialoguer::Select` menu for auth provider (4 choices: AGI Workforce sub, BYOK, Other OAuth, Skip). Directory trust prompt precedes auth.
2. **Login / auth flow** — `apps/cli/src/auth.rs` (1,429 LOC): `interactive_login()`, `oauth_login()`, `device_code_login()`, token store at `~/.agiworkforce/auth.json` (0o600). `agiworkforce login [--provider <name>]` dispatched from `main.rs:1361-1387`.
3. **Slash command palette (REPL mode)** — `apps/cli/src/repl.rs:492-760`: 30+ slash commands dispatched via plain `match` on string. No paginated TUI picker — user types `/` and sees a raw match. Includes `/model`, `/plan`, `/fast`, `/branch`, `/fork`, `/compact`, `/skills`, `/hooks`, `/permissions`, `/status`, `/cost`, `/sessions`, etc.
4. **Model picker** — `apps/cli/src/repl.rs:505-513`: `/model <name>` with inline arg; no interactive selector widget. `/models` prints list via `provider::format_model_list()`.
5. **Status line / footer** — `apps/cli/src/tui/bottom_pane/footer.rs:1-80`, `chatwidget.rs:869-875`: `status_line_branch`, `status_line_enabled`, `context_window_percent` — rendered as a configurable bottom row via `StatusLineItem`. Mirrors Gemini CLI footer pattern partially.
6. **Plan mode** — `apps/cli/src/repl.rs:618-679`: Full 3-state `/plan on|off|accept|reject|show` wired into `PermissionMode::Plan`; `update_plan` model tool dual-shipped with `plan_approved` gate at `tools.rs:193, 2198`.
7. **Theme / syntax highlighting** — `apps/cli/src/tui/app.rs:4247-4268`: `SyntaxThemeSelected` event wired; `tui_theme` config field; `resolve_theme_by_name()` + `set_syntax_theme()`. No interactive `/theme` selector in the REPL slash dispatch (no match for `/theme`).
8. **Permission / bypass mode** — `apps/cli/src/cli_options.rs:19`: 5 modes (`Default`, `Plan`, `AcceptEdits`, `BypassPermissions`, `FullAuto`). Status shown via `/status`. No keyboard-shortcut cycle (unlike Claude Code's shift+tab).

---

## B. Pattern audit

### 1. First-run login screen — provider list presentation

- Reference: `claude-code/02_cli_first-run-login-3-options-claude-account-anthropic-console-3rdparty.png` — ASCII logo + 3-option menu with plan labels (Pro/Max/Team; Console billing; Bedrock/Foundry/Vertex)
- Reference: `codex-cli/02_cli_welcome-signin-3-options-chatgpt-device-api.png` — ASCII logo + 3-option menu with plan labels (Plus/Pro/Business; Device Code; BYOK)
- Ours: `apps/cli/src/onboarding.rs:210-230` — 4-option `dialoguer::Select` with plan context in-line (BYOK, OAuth, Skip)
- Gap: Our 4-option menu matches the pattern well. However, option descriptions are left-aligned plain strings truncated to terminal width with no visual separator between option name and plan hint. Both refs bold the option name and dim the plan hint. Our strings concatenate them with spaces only.
- Verdict: ADJUST
- Impact: 2
- Effort: S
- Priority: P2

### 2. ASCII art / splash identity

- Reference: `codex-cli/02_cli_welcome-signin-3-options-chatgpt-device-api.png` — large ASCII art logo centered above welcome text
- Reference: `gemini-cli/02_cli_splash-version-changes-update-available.png` — compact diamond logo + version + policy banner + update notice + tips block
- Ours: `apps/cli/src/onboarding.rs:70-113` — amber-colored ASCII wordmark (`AGI Workforce`) + version + 4-bullet differentiation points
- Gap: Our splash only fires during first-run onboarding. Subsequent runs show no identity header. Gemini CLI shows logo + version on every launch; Codex shows its logo on every launch. Regular `agiworkforce` invocations start cold with no context about the product version or active provider.
- Verdict: ADJUST
- Impact: 3
- Effort: S
- Priority: P2

### 3. Post-signin permissions overview screen

- Reference: `codex-cli/07_cli_post-signin-welcome-permissions-overview.png` — "Before you start" checklist: autonomy grant, mistake disclaimer, training notice with hyperlink
- Reference: `claude-code/01_cli_bypass-permissions-mode-enabled-shift-tab-cycle.png` — bypass mode label with keyboard hint
- Ours: `apps/cli/src/onboarding.rs` — no post-auth permissions overview screen; trust prompt fires before auth, not after
- Gap: No "here is what this tool can do / review your autonomy settings" screen after login. Users land directly in the REPL. This is a safety UX expectation; Codex surfaces it explicitly.
- Verdict: ADD
- Impact: 3
- Effort: M
- Priority: P1

### 4. OAuth browser-fallback / paste-code prompt

- Reference: `claude-code/03_cli_oauth-browser-fallback-paste-code-prompt.png` — "Browser didn't open? Use the url below to sign in (c to copy)" + full URL displayed + "Paste code here if prompted"
- Reference: `codex-cli/03_cli_browser-auth-link-fallback.png` — similar browser-fallback prompt
- Ours: `apps/cli/src/auth.rs` (1,429 LOC) + `oauth.rs:24-60` — OAuth flow present; inspect needed for fallback UX text
- Gap: Auth module exists but the fallback copy-code UX is not verified to surface the URL and copy hint the way refs do. Likely emits raw URL without the "c to copy" shortcut.
- Verdict: ADJUST
- Impact: 2
- Effort: S
- Priority: P2

### 5. Theme selector — interactive picker

- Reference: `claude-code/04_cli_theme-selector-6-options-dark-light-colorblind-ansi.png` — numbered list of 6 themes with live code preview block below the selector
- Ours: `apps/cli/src/tui/app.rs:4247-4268` — theme selection wired into app event; no `/theme` slash command in `repl.rs` dispatch; TUI has `SyntaxThemeSelected` event but no interactive picker in REPL mode
- Gap: Theme selection is TUI-internal only (reached via some TUI menu path), not exposed as a `/theme` slash command. The live-preview code block pattern (shown below the theme list in Claude Code) is absent.
- Verdict: ADD
- Impact: 3
- Effort: M
- Priority: P1

### 6. Slash command palette — paginated discovery

- Reference: `codex-cli/09_cli_slash-commands-1-model-permissions-skills.png` through `12_cli_slash-commands-4-logout-feedback-clear-subagents.png` — 4-page slash command picker rendered as a bordered overlay showing command + one-line description, scrollable with arrow keys
- Reference: `gemini-cli/08_cli_slash-commands-1-about-auth-bug-chat-clear.png` through `10_cli_slash-commands-3-rewind-ide-mcp-model-memory-plan.png` — similar 3-page paginated picker with status bar visible below
- Ours: `apps/cli/src/tui/bottom_pane/command_popup.rs` — command popup exists in TUI; REPL mode (`apps/cli/src/repl.rs:492-760`) dispatches via raw string match with no discoverable picker
- Gap: REPL mode (non-TUI, headless) has no slash-command picker — users must know command names. The TUI `command_popup.rs` exists but may not show one-line descriptions. Refs show paginated pickers with descriptions always visible.
- Verdict: ADJUST
- Impact: 4
- Effort: M
- Priority: P1

### 7. Model picker — interactive selector with descriptions

- Reference: `codex-cli/13_cli_model-selector-gpt-5-codex-options.png` — numbered list picker with model name + one-line description per entry; "Press enter to select reasoning effort, or esc to dismiss"
- Ours: `apps/cli/src/repl.rs:505-513` — `/model <name>` accepts a name as inline arg; `/models` prints list; no interactive numbered picker with descriptions
- Gap: `/model` requires knowing the model name. No interactive selector. No model description shown alongside name. 13 providers wired (`models.rs:287-304`) but not surfaced in a discoverable picker.
- Verdict: REBUILD
- Impact: 5
- Effort: M
- Priority: P0

### 8. Reasoning level selector

- Reference: `codex-cli/14_cli_reasoning-level-selector-low-medium-high.png` — 4-level picker (Low / Medium / High / Extra High) with descriptions; linked to current model; "Press enter to confirm or esc to go back"
- Ours: No reasoning level selector found in REPL slash commands or TUI. `--effort` flag exists at CLI invocation level (`cli_options.rs`) but no in-session `/effort` or `/reasoning` command.
- Gap: No in-session reasoning/effort level adjustment. Users must restart with a different `--effort` flag.
- Verdict: ADD
- Impact: 4
- Effort: S
- Priority: P1

### 9. Status bar — persistent context row

- Reference: `gemini-cli/16_cli_main-prompt-status-bar-workspace-branch-model.png` — bottom row with 7 labeled columns: `[INSERT]` mode | workspace (path) | branch | sandbox | /model | context % | memory MB
- Reference: `codex-cli/08_cli_main-prompt-empty-state-weekly-limit-warning.png` — single status line below prompt: `o4-mini medium · 100% left · ~/Desktop/agiworkforce`
- Ours: `apps/cli/src/tui/bottom_pane/footer.rs:66-80` + `chatwidget.rs:869-875` — `status_line_branch`, `context_window_percent`, `status_line_enabled` all present; rendered in TUI mode. REPL mode has no persistent status line.
- Gap: TUI has a status line; REPL/headless mode has none. Gemini CLI's 7-column footer is richer: it shows sandbox status (colored red when off), mode indicator (`[INSERT]`), memory, and MCP server count — none of which we display.
- Verdict: ADJUST
- Impact: 4
- Effort: M
- Priority: P1

### 10. Model-changed confirmation banner

- Reference: `codex-cli/15_cli_model-changed-confirmation-banner.png` — inline line "Model changed to gpt-5.4 xhigh" rendered between prompt widget and status bar in amber/highlighted color
- Ours: `apps/cli/src/repl.rs:509-512` — `output::print_info(&format!("Switched to {} ({})", arg, provider))` — plain `eprintln!` with `print_info` styling; no styled in-band banner
- Gap: Model switch confirmation is a plain text line, not a visually distinct in-band banner. No confirmation of reasoning level change. On narrow terminals this blends into normal output.
- Verdict: ADJUST
- Impact: 2
- Effort: S
- Priority: P2

### 11. Rate limit / weekly usage warning

- Reference: `codex-cli/08_cli_main-prompt-empty-state-weekly-limit-warning.png` — amber triangle warning at top: "Heads up, you have less than 10% of your weekly limit left. Run /status for a breakdown."
- Ours: `/cost` and `/status` report token/cost info on demand; no proactive at-launch usage warning banner
- Gap: No proactive warning when quota is low. For Hobby-tier users (the only paid MVP tier) this is a meaningful UX omission — they will hit limits without notice.
- Verdict: ADD
- Impact: 3
- Effort: S
- Priority: P1

### 12. Update-available notice

- Reference: `gemini-cli/02_cli_splash-version-changes-update-available.png` — inline notification at launch: "Gemini CLI update available! 0.33.0 → 0.35.3 / Installed with npm. Attempting to automatically update now..."
- Ours: No update-check or update-available banner at launch.
- Gap: No version-update awareness. With `cargo install` this is harder, but an HTTP check against a releases endpoint (or checking crates.io) is standard CLI practice.
- Verdict: ADD
- Impact: 2
- Effort: M
- Priority: P2

### 13. Settings panel — in-session searchable settings

- Reference: `gemini-cli/11_cli_settings-1-vim-approval-update-notifications.png` through `15_cli_settings-5-sandboxing-yolo-folder-trust.png` — 5-page Ratatui settings overlay accessible via `/settings`; searchable filter input at top; bool toggles with descriptions; `Apply To: User/Workspace/System Settings` scope selector at bottom
- Ours: `apps/cli/src/repl.rs:732-734` — `/config <key> <value>` sets individual config keys; no interactive settings panel; `/setup` maps to `handle_setup()` for provider config only
- Gap: No interactive in-session settings panel. Gemini CLI's searchable settings overlay (with 40+ settings, scope selector, and bool toggles) is the richest settings UX of the three refs. We have only `handle_config()` key-value manipulation and `handle_setup()` for provider config.
- Verdict: ADD
- Impact: 4
- Effort: L
- Priority: P1

### 14. Bypass/permissions mode — keyboard cycling

- Reference: `claude-code/01_cli_bypass-permissions-mode-enabled-shift-tab-cycle.png` — persistent footer label "bypass permissions on (shift+tab to cycle)" on left; "high · /effort" on right
- Ours: `apps/cli/src/cli_options.rs:19` — 5 permission modes; `session.skip_permissions` tracked; no keyboard shortcut to cycle modes in-session; mode shown only via `/status`
- Gap: No keyboard shortcut to cycle through permission modes. Users must use `/plan on|off` or restart with a flag. The shift+tab cycling UX (Claude Code) and `/permissions` menu (Codex) are both missing from our TUI input layer.
- Verdict: ADJUST
- Impact: 3
- Effort: M
- Priority: P1

### 15. Sandbox status indicator

- Reference: `gemini-cli/16_cli_main-prompt-status-bar-workspace-branch-model.png` — "no sandbox" shown in red in the footer when sandboxing is disabled
- Ours: `apps/cli/src/sandbox.rs:8-14` — macOS Seatbelt + Linux bwrap wired; no visual sandbox indicator in TUI footer or REPL mode
- Gap: Sandbox active/inactive is never surfaced to the user during a session. Given we have the strongest sandbox story of any competitor (macOS + Linux), not showing it is a missed trust signal.
- Verdict: ADD
- Impact: 3
- Effort: S
- Priority: P1

---

## C. Top 10 priority gaps (ranked)

1. **Model picker — no interactive selector** — Ref: `codex-cli/13_cli_model-selector-gpt-5-codex-options.png` — Ours: `apps/cli/src/repl.rs:505-513` — Add numbered interactive picker with descriptions for all 13 providers' model lists — P0 (Impact 5, Effort M)

2. **Slash command palette — no paginated discovery** — Ref: `codex-cli/09-12_cli_slash-commands-*.png` — Ours: `apps/cli/src/tui/bottom_pane/command_popup.rs` (TUI only) — Surface one-line descriptions in the TUI picker; add equivalent to REPL mode — P1 (Impact 4, Effort M)

3. **Settings panel — no in-session interactive settings** — Ref: `gemini-cli/11-15_cli_settings-*.png` — Ours: `apps/cli/src/repl.rs:732` (`/config key value` only) — Add Ratatui overlay with searchable settings, bool toggles, and User/Workspace/System scope — P1 (Impact 4, Effort L)

4. **Status bar — sandbox indicator missing** — Ref: `gemini-cli/16_cli_main-prompt-status-bar-workspace-branch-model.png` — Ours: `apps/cli/src/tui/bottom_pane/footer.rs` — Add sandbox active/inactive column (colored red when off) to TUI footer — P1 (Impact 3, Effort S)

5. **Reasoning/effort level — no in-session selector** — Ref: `codex-cli/14_cli_reasoning-level-selector-low-medium-high.png` — Ours: no `/effort` slash command — Add `/effort` slash command with interactive picker (low/medium/high) and update status bar display — P1 (Impact 4, Effort S)

6. **Post-auth permissions overview screen** — Ref: `codex-cli/07_cli_post-signin-welcome-permissions-overview.png` — Ours: `apps/cli/src/onboarding.rs` (no post-auth screen) — Add "Before you start" checklist screen after successful auth — P1 (Impact 3, Effort M)

7. **Rate limit / quota warning** — Ref: `codex-cli/08_cli_main-prompt-empty-state-weekly-limit-warning.png` — Ours: no proactive banner — Add launch-time quota check with amber warning when <10% of Hobby-tier credits remain — P1 (Impact 3, Effort S)

8. **Theme selector — no REPL `/theme` command** — Ref: `claude-code/04_cli_theme-selector-6-options-dark-light-colorblind-ansi.png` — Ours: `apps/cli/src/tui/app.rs:4247` (TUI event only) — Add `/theme` REPL slash command with numbered picker and live preview — P1 (Impact 3, Effort M)

9. **Permission mode cycling — no keyboard shortcut** — Ref: `claude-code/01_cli_bypass-permissions-mode-enabled-shift-tab-cycle.png` — Ours: `apps/cli/src/cli_options.rs:19` — Wire shift+tab to cycle `PermissionMode` in TUI input handler; show active mode in footer — P1 (Impact 3, Effort M)

10. **Splash / version header on every launch** — Ref: `gemini-cli/02_cli_splash-version-changes-update-available.png` — Ours: `apps/cli/src/onboarding.rs:69` (first-run only) — Show compact version+provider header on every interactive launch — P2 (Impact 3, Effort S)

---

## D. Anti-patterns from refs we should NOT copy

1. **Single-provider login as the only option (Claude Code / Codex)** — `claude-code/02_...` offers only "Claude account / Anthropic Console / 3rd-party"; `codex-cli/02_...` offers only "ChatGPT / Device Code / API key". We have 13 providers wired — our onboarding must remain provider-agnostic with BYOK and Local LLM (Ollama + LMStudio) as first-class options. Do not collapse the provider list to feature one brand.

2. **Subscription upsell gate (Claude Code/05_web_auth-error)** — "Claude Max or Pro is required to connect to Claude Code" hard-gates non-subscribers. We are BYOK + Local = free forever. Never gating the tool on a subscription is a core differentiator — do not replicate any paywall on the CLI launch path.

3. **Reasoning level tied to a single provider's model family (Codex)** — `codex-cli/14_...` shows a reasoning picker only for `gpt-5.4` family. Our reasoning effort must be provider-aware — different providers expose effort differently (Claude `thinking` budget, OpenAI `reasoning_effort`, Gemini `thinking_budget`). A single unified `/effort` picker must map to the correct per-provider parameter, not assume one model family.

4. **"Tips" that advertise a competing product** — `codex-cli/08_...` shows an inline tip: "Try the Codex App with 2x rate limits". We should not embed cross-product marketing in our status bar. Any usage tip should be provider-neutral.

5. **Policy/ToS prompt every launch (Gemini CLI)** — `gemini-cli/02_...` shows a policy banner on every splash. One-time ToS acceptance at first-run is correct; repeating it every session erodes trust. Our onboarding marks `~/.agiworkforce/.setup_complete` — do not abandon this pattern.

---

## E. Open product questions (need user decision)

1. **REPL vs TUI parity** — The TUI (`apps/cli/src/tui/`) has richer widgets (command popup, status line, theme selection) than the REPL mode (`repl.rs`). Should the REPL mode be brought to parity, or is the TUI the canonical interactive surface going forward? This determines effort scope for gaps 2, 8, 9.

2. **`/effort` parameter naming** — Should the slash command be `/effort`, `/reasoning`, or `/thinking`? "Reasoning" aligns with Claude Code; "effort" aligns with Codex; "thinking" aligns with Gemini. Since we are provider-agnostic, which term wins in our UX vocabulary?

3. **Update-check mechanism** — Should the binary check crates.io or a first-party releases endpoint? Crates.io is simpler; a first-party endpoint lets us gate pre-release channels. Pick one before implementing the update banner (gap #12 / C-rank 10).

4. **Settings scope** — Gemini CLI's settings have three scopes: User / Workspace / System. Should our `/settings` panel replicate this three-tier hierarchy, or map to the two-tier `~/.agiworkforce/config.toml` (global) vs `.agiworkforce/config.toml` (project)?

5. **Sandbox indicator color convention** — Gemini CLI colors "no sandbox" red. Should we follow the same convention (red = unsafe) or use amber (our brand color) for "sandboxed" as a positive trust signal and dim/grey for "no sandbox"?
