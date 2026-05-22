# UI-06 CLI Survey — Claude Code, Codex CLI, Gemini CLI

Cross-CLI comparison from `~/Desktop/reference/ui/{claude-code,codex-cli,gemini-cli}/` (5 + 15 + 16 = 36 PNGs). Citations are filename + pixel detail. AGI Workforce CLI is the engine of the platform — `apps/cli/`, Rust, 22 subcommands, 200 .rs files, ~999 tests, ships at `~/.cargo/bin/agiworkforce`. The point of this audit is to extract patterns we should match (auth, bypass, slash discovery, status bar) and patterns we should reject.

---

## 1. Auth & Onboarding

### Q1 — Login pages: browser flow vs token paste vs both

**Claude Code (v2.1.86)** offers **three login options** at first run (`02_cli_first-run-login-3-options-claude-account-anthropic-console-3rdparty.png`): the welcome banner is a low-resolution ASCII pixel-art mascot (orange lobster/horse) above the heading "Welcome to Claude Code v2.1.86", followed by `Claude Code can be used with your Claude subscription or billed based on API usage through your Console account.` Then a numbered selector with a `>` cursor on item 1: **(1) Claude account with subscription** — Pro, Max, Team, or Enterprise; **(2) Anthropic Console account** — API usage billing; **(3) 3rd-party platform** — Amazon Bedrock, Microsoft Foundry, or Vertex AI. Browser-based OAuth is primary; the fallback (`03_cli_oauth-browser-fallback-paste-code-prompt.png`) shows `Browser didn't open? Use the url below to sign in (c to copy)` plus an extremely long URL on a single wrapped line, then `Paste code here if prompted >` — so the token-paste path is the _fallback_, not a peer option.

**Codex CLI (v0.117.0)** also presents **three sign-in options** (`02_cli_welcome-signin-3-options-chatgpt-device-api.png`) under an OpenAI ASCII spiral logo and the line `Welcome to Codex, OpenAI's command-line coding agent`: **(1) Sign in with ChatGPT** — `Usage included with Plus, Pro, Business, and Enterprise plans`; **(2) Sign in with Device Code** — `Sign in from another device with a one-time code`; **(3) Provide your own API key** — `Pay for what you use`. Cursor `>` sits on item 1, which is highlighted in cyan. Footer: `Press Enter to continue`. The browser fallback page (`03_cli_browser-auth-link-fallback.png`) shows `Finish signing in via your browser` with a long auth.openai.com URL and `On a remote or headless machine? Press Esc and choose Sign in with Device Code` + `Press Esc to cancel` — Device Code is a **named first-class peer**, not just a copy-paste fallback. Codex is the only CLI that explicitly calls out the headless-machine use case in the auth UI.

**Gemini CLI (v0.35.3)** presents **three** auth methods (`03_cli_auth-method-selector-google-api-vertex.png`): **(1) Sign in with Google** (highlighted, radio-selected dot `o`); **(2) Use Gemini API Key**; **(3) Vertex AI**. Header reads `Get started` — `How would you like to authenticate for this project?` with `(Use Enter to select)` hint and a `Terms of Services and Privacy Notice for Gemini CLI` link. Browser flow uses an interim **confirmation prompt** (`04_cli_browser-auth-confirm-yes-no-prompt.png`): `Opening authentication page in your browser. Do you want to continue?` with `1. Yes` (radio-selected) `2. No` — Gemini is the _only_ CLI of the three to ask for explicit consent before opening a browser tab. Then `05_cli_waiting-for-authentication-with-url.png` shows `Attempting to open authentication page in your browser. Otherwise navigate to:` + URL, then `Waiting for authentication... (Press Esc or Ctrl+C to cancel)` with a spinning indicator.

**Cross-CLI pattern:** All three offer the same three-tier triplet — paid-plan SSO / account-key / BYO-key. All three primary-pattern OAuth-via-browser with paste-code fallback. **Differences:** Codex names "Device Code" as a peer (best for headless); Gemini adds a confirm-before-browser-open dialog (most user-respectful); Claude Code is barest (no confirm, no remote/headless callout).

### Q2 — First-run wizard / config prompt

Only **Claude Code** has a meaningful first-run _theme_ selector after auth (`04_cli_theme-selector-6-options-dark-light-colorblind-ansi.png`): `Let's get started.` then `Choose the text style that looks best with your terminal` with `To change this later, run /theme` and 6 options: 1. Dark mode, 2. Light mode, 3. Dark mode (colorblind-friendly), 4. Light mode (colorblind-friendly), **5. Dark mode (ANSI colors only)** ✓ (cursor here, marked default), 6. Light mode (ANSI colors only). A live preview pane shows `function greet() { console.log("Hello, World!"); }` with a `-` deleted line and a `+` `console.log("Hello, Claude!")` added line in green — proving syntax-theme renders before commit. Footer: `Syntax theme: ansi (ctrl+t to disable)`.

**Codex CLI** post-signin shows a single info screen (`07_cli_post-signin-welcome-permissions-overview.png`) summarizing **before-you-start** notes — no theme picker, no interactive setup beyond auth: `Signed in with your ChatGPT account` (green check) → `Before you start: Decide how much autonomy you want to grant Codex` + `For more details see the Codex docs` link → `Codex can make mistakes. Review the code it writes and commands it runs` → `Powered by your ChatGPT account. Uses your plan's rate limits and training data preferences` → `Press Enter to continue`. So Codex is permission-overview-first, no theme.

**Gemini CLI** has no first-run wizard; settings live behind `/settings` only (5 pages, see Q23) and folder-trust is its "first interactive consent" gate (`/permissions trust` is shown as the prior command in `15_cli_settings-5-sandboxing-yolo-folder-trust.png` and `16_cli_main-prompt-status-bar-workspace-branch-model.png`).

### Q3 — Account / project switching after login

Claude Code: not visible in the 5 screenshots provided; web auth-error page (`05_web_auth-error-claude-max-or-pro-required-to-connect.png`) shows the upgrade prompt: dark-themed claude.ai page, sunburst logo, `Claude Max or Pro is required to connect to Claude Code` + `Sign up for a Max or Pro subscription to connect your account, or use your API key.` + `Upgrade to Max or Pro` button. Codex CLI: `/logout`, `/exit`, `/feedback` shown in slash-command page 4 (`12_cli_slash-commands-4-logout-feedback-clear-subagents.png`). Gemini CLI: `/auth` (Manage authentication) is in slash-page-1 (`08_cli_slash-commands-1-about-auth-bug-chat-clear.png`); the post-auth status row in `08` reads `Signed in with Google: siddharthanagula3@gmail.com /auth — Plan: Gemini Code Assist in Google One AI Pro /upgrade` showing email + plan inline. Account-switch is `/auth`; project-switch is implied by `/permissions trust` and folder trust (page 5 settings).

---

## 2. Permissions & Tools

### Q4 — Bypass-permissions / yolo / auto mode

**All three CLIs ship a launch-flag bypass** but with very different naming and warning styles.

- **Claude Code:** `claude --dangerously-skip-permissions` (visible at top of every Claude Code screenshot, e.g. `01_cli_bypass-permissions-mode-enabled-shift-tab-cycle.png`). When on, the status row shows `>> bypass permissions on (shift+tab to cycle)` in red/orange, with right-aligned `● high · /effort`. So bypass is **runtime-toggleable** via `shift+tab` cycle, not just a launch-flag — that's a subtle but big affordance.
- **Codex CLI:** `codex --dangerously-bypass-approvals-and-sandbox` (`01_cli_blank-terminal-bypass-flag.png` shows the user typing it pre-launch — the flag is even longer than Claude's). No runtime toggle visible in the post-signin screens; bypass appears to be launch-flag-only.
- **Gemini CLI:** Setting page 5 (`15_cli_settings-5-sandboxing-yolo-folder-trust.png`) lists `Disable YOLO Mode` (Disables YOLO mode, even if enabled by a flag — `false`) and `Disable Always Allow` (Disables "Always allow" options in tool confirmation dialogs — `false`). YOLO is the colloquial name of the bypass mode. There's no obvious shift-tab cycle in the prompt screens; a `Tool Sandboxing` boolean ("Experimental tool-level sandboxing — implementation in progress") makes Gemini the only CLI advertising the sandbox tier as configurable in-band.

**Warning copy (compared):** Claude Code uses `--dangerously-skip-permissions` (8-syllable scary); Codex uses `--dangerously-bypass-approvals-and-sandbox` (12-syllable scarier, plus mentions sandbox); Gemini calls it `YOLO Mode` (irreverent — but the disable-toggle treats it as the safer default).

### Q5 — Tool approval prompt format

None of the supplied screenshots show a tool-approval modal mid-execution — the screenshots are all auth/onboarding/empty-state. **Inference from settings UI:** Gemini's setting `Allow Permanent Tool Approval` ("Enables the 'Allow for all future sessions' option in tool confirmation dialogs — `true`") tells us Gemini's modal supports y/n + an "Always allow for future sessions" checkbox. `Auto-add to Policy by Default` ("When enabled, the 'Allow for all future sessions' option becomes the default choice for low-risk tools in trusted workspaces — `false`") shows progressive disclosure of risk. Claude Code's bypass status `(shift+tab to cycle)` implies a 3-state cycle: ask / always-allow / bypass (similar to Claude Cowork's mode picker). Codex's `/permissions` slash command (`09_cli_slash-commands-1-model-permissions-skills.png` — `/permissions: choose what Codex is allowed to do`) implies a per-session permission menu, but the modal contents aren't shown.

### Q6 — Per-tool approval granularity

Gemini's settings expose `Extension Source Regex Allowlist` ("List of Regex patterns for allowed extensions. If non-empty, only extensions that match the patterns in this list are allowed. Overrides the blockListExtensions setting") — that's per-extension/tool granularity at config level. Codex has `/skills` (`use skills to improve how Codex performs specific tasks`) and `/mcp` (`list configured MCP tools`) suggesting per-MCP-server toggles. Claude Code has nothing visible in 5 screenshots.

### Q7 — Sandbox indicator

**Gemini wins this category outright.** The status bar (`16_cli_main-prompt-status-bar-workspace-branch-model.png`) shows a dedicated `sandbox` column — value `no sandbox` rendered in **bright red/coral text** (visible warning), unlike `branch: main` / `/model: Auto (Gemini 3)` / `context: 0% used` / `memory: 204.8 MB` which are all white-on-dark. So Gemini surfaces sandbox state as a first-class status bar field with color-coded urgency. Codex does not have a visible sandbox indicator in its main-prompt empty state (`08_cli_main-prompt-empty-state-weekly-limit-warning.png` only shows `model: o4-mini medium / directory: ~/Desktop/agiworkforce`). Claude Code's bypass-mode banner (`01_*`) is the only visible sandbox-state indicator and only appears when bypass is on.

---

## 3. UI Structure

### Q8/Q9 — Status bar contents and position

All three CLIs put their status info **at the top below the launch row** — never bottom (which is a deliberate departure from `bash` PS1 / `zsh` RPROMPT habits).

- **Claude Code (`01_*`):** A 3-line "card" — Line 1 `Claude Code v2.1.86`; Line 2 `Opus 4.6 (1M context) with high effort · Claude Max`; Line 3 `~/Desktop/agiworkforce`. Below the input line, a 1-line status row: `>> bypass permissions on (shift+tab to cycle)` (left, red) | `● high · /effort` (right). So Claude shows: model+context+plan, cwd, mode/effort. **No token usage, no cost.**
- **Codex CLI (`08_cli_main-prompt-empty-state-weekly-limit-warning.png`):** A bordered 3-line card: `>_ OpenAI Codex (v0.117.0)` / `model: o4-mini medium /model to change` / `directory: ~/Desktop/agiworkforce`. Above the card: a yellow warning line `△ Heads up, you have less than 10% of your weekly limit left. Run /status for a breakdown.`. Below the input, a single-line footer: `o4-mini medium · 100% left · ~/Desktop/agiworkforce`. So Codex shows model, weekly-limit-remaining, cwd. **No git branch.** After `/model` (`15_cli_model-changed-confirmation-banner.png`), the footer updates to `gpt-5.4 xhigh · 100% left · ~/Desktop/agiworkforce` — model and reasoning concatenated as one string.
- **Gemini CLI (`16_*`):** Most information-dense status bar of the three — a **6-column horizontal strip** below the input: `workspace (/directory) ~/Desktop/agiworkforce` | `branch main` | `sandbox no sandbox` (red) | `/model Auto (Gemini 3)` | `context 0% used` | `memory 204.8 MB` (right-aligned). Above it: yellow status row `auto-accept edits Shift+Tab to plan` (left) and `3 GEMINI.md files | 7 MCP servers` (right). Above that line: cursor `>` with placeholder `Press 'Esc' for NORMAL mode.` and `[INSERT]` mode tag bottom-left. So Gemini surfaces 6 metrics simultaneously: workspace, branch, sandbox, model, context, memory.

**Verdict:** Gemini is the gold standard for status density. Claude Code emphasizes plan/effort. Codex emphasizes weekly-limit. We should at minimum match Gemini's **branch + sandbox** columns (we already have model + cwd).

### Q10 — Multi-line input editor / vim mode

- **Claude Code:** Single-line `>` prompt visible in screenshots; no vim mode evident in 5 PNGs.
- **Codex CLI:** No vim mode evident; the input has placeholder text `implement {feature}` rendered ghost-gray (`08_*`).
- **Gemini CLI:** **Vim mode is a first-class setting.** Settings-1 (`11_cli_settings-1-vim-approval-update-notifications.png`) lists `Vim Mode` — Enable Vim keybindings — `True` (selected). Status indicator `[INSERT]` in the left-bottom of the prompt area (`16_*`) confirms it's active. Composer placeholder reads `Press 'Esc' for NORMAL mode.` So Gemini ships a real modal-editor mini-mode — Esc enters NORMAL, default is INSERT.

### Q11 — Composer placeholder text

- Claude Code: blank `>` prompt, no placeholder text visible.
- Codex: `implement {feature}` (literal placeholder, ghost-gray, in `08_*` and `15_*`).
- Gemini: `Press 'Esc' for NORMAL mode.` (`16_*`) — placeholder doubles as a vim-mode hint.

### Q12 — Sidebar / split panes

None. All three are pure single-column terminal UIs in these screenshots. The composer + history is a single vertical scrollback. Claude Code's theme picker is the only screenshot showing a horizontal divider line, separating selector from preview pane.

### Q13 — Conversation history within session — scrollback

Standard terminal scrollback in all three. Codex has explicit `/resume` (resume a saved chat), `/fork` (fork the current chat), `/init` (create an AGENTS.md), `/compact` (`summarize conversation to prevent hitting the context limit`) in `10_cli_slash-commands-2-resume-fork-plan-collab.png`. Gemini has `/clear` (clear the screen and conversation history), `/compress` (compress the context by replacing it with a summary), `/chat` (`Browse auto-saved conversations and manage chat checkpoints`) in `08_*`.

---

## 4. Slash Commands

### Q14 — Slash command discovery

All three CLIs autocomplete on `/`. Codex and Gemini both render an **inline modal-style dropdown** at the bottom of the screen above the input row. Claude Code's discovery isn't shown in 5 screenshots but is well-known to use `/help`.

### Q15 — Built-in command lists

**Codex CLI** has its slash-commands paginated across 4 screens (`09`, `10`, `11`, `12`) — total **~28 commands** visible:

Page 1 (`09_*`): `/model`, `/fast` (toggle Fast mode for fastest inference at 2X plan usage), `/permissions` (choose what Codex is allowed to do), `/experimental` (toggle experimental features), `/skills` (use skills to improve task performance), `/review` (review my current changes and find issues), `/rename` (rename the current thread), `/new` (start a new chat conversation).

Page 2 (`10_*`): `/resume`, `/fork`, `/init`, `/compact`, `/plan` (switch to Plan mode), `/collab` (change collaboration mode — experimental), `/agent` (switch the active agent thread), `/diff` (show git diff including untracked files).

Page 3 (`11_*`): `/copy` (copy latest Codex output to your clipboard), `/mention` (mention a file), `/status`, `/title` (configure terminal title), `/statusline` (configure status-line items), `/theme`, `/mcp` (list configured MCP tools), `/plugins` (browse plugins).

Page 4 (`12_*`): `/logout`, `/exit`, `/feedback` (send logs to maintainers), `/ps` (list background terminals), `/stop` (stop all background terminals), `/clear`, `/personality` (choose a communication style for Codex), `/subagents` (switch the active agent thread).

**Gemini CLI** paginates its slash commands across 3 screens (`08`, `09`, `10`) — total **~22 commands** visible:

Page 1 (`08_*`): `/about` (Show version info), `/auth` (Manage authentication), `/bug` (Submit a bug report), `/chat` (Browse auto-saved conversations and manage chat checkpoints), `/clear` (Clear the screen and conversation history), `/commands` (Manage custom slash commands. Usage: /commands [reload]), `/compress` (Compresses the context by replacing it with a summary), `/copy` (Copy the last result or code snippet to clipboard).

Page 2 (`09_*`): `/docs` (Open full Gemini CLI documentation in your browser), `/directory` (Manage workspace directories), `/editor` (Set external editor preference), `/extensions` (Manage extensions), `/footer` (For help on gemini-cli), `/help` (For help on gemini-cli), `/shortcuts` (Toggle the shortcuts panel above the input). [Truncated at "v" / "(1/68)"]

Page 3 (`10_*`): `/rewind` (Jump back to a specific message and restart the conversation), `/ide` (Manage IDE integration), `/init` (Analyzes the project and creates a tailored GEMINI.md file), `/mcp` (Manage configured Model Context Protocol (MCP) servers), `/model` (Manage model configuration), `/memory` (Commands for interacting with memory), `/permissions` (Manage folder trust settings and other permissions), `/plan` (Switch to Plan Mode and view current plan).

Status footer of every Gemini slash page reads `(17/68)` etc. → **68 total commands paginated**.

**Claude Code:** No slash-commands page is in the 5-PNG set. Externally I know `/help`, `/login`, `/logout`, `/theme`, `/model`, `/clear`, `/exit`, `/init`, `/cost`, `/compact`, `/resume`, `/agents`, `/mcp`, `/memory`, `/output-style`, `/rewind`, `/security-review`, `/skill`, `/plan`, `/think` exist — but I don't have screenshots in this batch to cite. (Open question — see Open Questions §1.)

### Q16 — Custom user slash commands

Gemini CLI: `/commands` reload + `Manage custom slash commands. Usage: /commands [reload]` (`08_*`) explicitly supports custom commands. Codex: not directly visible — `/skills` is the closest equivalent (skills can wrap custom commands). Claude Code: not visible in the 5 PNGs.

---

## 5. Output Formatting

### Q17 — Markdown rendering in terminal

Not directly visible — no chat-response screenshots in the auth/onboarding-heavy 36-PNG set. Claude Code's theme preview (`04_*`) renders syntax-highlighted JS with line numbers and colored diff `-`/`+` markers, proving Claude does syntax-theme + diff rendering inline.

### Q18 — Syntax highlighting in code blocks

Claude Code's theme picker (`04_*`) is the only direct evidence: ANSI 16-color highlighting visible. Gemini settings (`13_cli_settings-3-footer-citations-spinner-rendering.png`) has `Show Line Numbers` (Show line numbers in the chat — `true`) and `Use Alternate Screen Buffer` (Use an alternate screen buffer for the UI, preserving shell history — `false`) as renderer toggles. Gemini also has `Show Citations` (Show citations for generated text in the chat — `true`).

### Q19 — Diff rendering

Claude Code: confirmed inline diff (`04_*` preview): `1 - console.log("Hello, World!");` red-tinted, `2 + console.log("Hello, Claude!");` green-tinted. Gemini: not shown but `Allow Permanent Tool Approval` and `Tool Output Truncation Threshold` (default 100000) imply diff-tool patches are first-class.

### Q20 — Tool-result formatting

Not visible in this batch — open question.

---

## 6. Plan Mode

### Q21 — Plan Mode visual

Claude Code: not directly visible in the 5 PNGs — no plan-mode screenshot included. The single `>> bypass permissions on` banner (`01_*`) implies Plan mode would render similarly. (Open question.)

Codex CLI: `/plan` (`switch to Plan mode`) listed in slash-commands page 2 (`10_*`). The setting page 1 first row `Plan Mode Routing — Automatically switch between Pro and Flash models based on Plan Mode status. Uses Pro for the planning phase and Flash for the implementation phase.` (`11_cli_settings-1-vim-approval-update-notifications.png` for **Gemini**, not Codex — sorry, see correction below.)

Gemini CLI: `/plan — Switch to Plan Mode and view current plan` (`10_*`). Plan mode is an explicit settings toggle: Settings page 1 (`11_cli_settings-1-vim-approval-update-notifications.png`) lists `Plan Mode Routing — Automatically switch between Pro and Flash models based on Plan Mode status. Uses Pro for the planning phase and Flash for the implementation phase.`. Status row also shows `plan Shift+Tab to manual` in `08_*`. So Gemini's plan mode is **shift+tab toggle** (same chord as Claude bypass — convergent design) and uses model-routing (Pro for planning / Flash for execution). The "auto-accept edits Shift+Tab to plan" status row in `16_*` confirms the **3-state cycle: auto-accept → plan → manual**.

### Q22 — Auto-execute after approval

Settings imply it: Gemini's `Auto-add to Policy by Default` (`15_*`: `When enabled, the 'Allow for all future sessions' option becomes the default choice for low-risk tools in trusted workspaces — false`) gates step-by-step vs auto-execute. With it off (default), step-by-step. With it on + folder trust + low-risk classification, auto-executes.

---

## 7. Settings / Config

### Q23 — Settings inside CLI vs config file

**Gemini CLI is the runaway leader here.** `/settings` opens an **interactive 5-page Settings panel** (`11`-`15`). Each page is a search-filter-able scrollable list of named toggles + descriptions + default values + scope-toggle (User Settings / Workspace Settings / System Settings tabs at the bottom).

Pages observed:

- **Page 1 (`11_*`):** Vim Mode (true), Default Approval Mode (Plan), Enable Auto Update (true), Enable Notifications (false), Plan Directory (undefined), Plan Mode Routing (true), Retry Fetch Errors (true), Max Chat Model Attempts (10), Debug Keystroke Logging (false), Enable Session Cleanup (true), Keep chat history (30d), Output Format (Text), Auto Theme Switching (off), Terminal Background Polling Interval (0).
- **Page 2 (`12_*`):** Hide Window Title (false), Inline Thinking (off/on/full), Show Thoughts in Title (true), Dynamic Window Title (true), Show Home Directory Warning (true), Show Compatibility Warnings (true), Hide Tips (false), Escape Pasted @ Symbols (true), Show Shortcuts Hint (true), Hide Banner (false), Hide Context Summary (false), Hide CWD (false), Hide Sandbox Status (false), **Hide Model Info (false — currently selected, the row that controls the status bar's `/model` column)**.
- **Page 3 (`13_*`):** Hide Context Window Percentage (false), Hide Footer (false), Show Memory Usage (true), Show Line Numbers (true), Show Citations (true), Show Model Info in Chat (true), Show User Identity (true), Use Alternate Screen Buffer (false), Use Background Color (false), Incremental Rendering (true), Show Spinner (true), Loading Phrases (Tips), Error Verbosity (false), Screen Reader Mode (false).
- **Page 4 (`14_*`):** IDE Mode (false), Overage Strategy (Ask each time), Model (auto-gemini-1-5-pro), Max Session Turns (-1), Context Compression Threshold (0.6 — 60%, 0.85 max), Disable Loop Detection (false), Skip Next Speaker Check (true), Memory Discovery Max Dirs (200), Load Memory From Include Directories (true), Respect .gitignore (false), Respect .geminiignore (true), Enable Recursive File Search (true), Enable Fuzzy Search (true), **Custom Ignore File Paths (currently focused row)**.
- **Page 5 (`15_*`):** Enable Interactive Shell (true), Show Color (true), Use Ripgrep (false), Tool Output Truncation Threshold (10000000000), Disable LLM Correction (false), Tool Sandboxing (false), Disable YOLO Mode (false), Disable Always Allow (false), Allow Permanent Tool Approval (true), Auto-add to Policy by Default (false), Blocks extensions from Git (false), Extension Source Regex Allowlist (empty), Folder Trust (true), **Enable Environment Variable Reduction (currently focused, false — Enable reduction of environment variables that may contain secrets)**.

Footer of every page: `Apply To: User Settings / Workspace Settings / System Settings` + `(Use Enter to select, Ctrl+L to reset, Tab to change focus, Esc to close)`. The 3-tier scope is sophisticated — User vs project-Workspace vs System.

**Codex CLI** is much lighter — no full /settings panel in the 15 PNGs; toml-config implied (`07_*` references "config.toml" via `~/.codex/config.toml` per `13_*` line `Access legacy models by running codex -m <model_name> or in your config.toml`). Codex's `/title`, `/statusline`, `/theme`, `/personality`, `/permissions` are individual one-off slash commands that mutate config rather than expose it as a panel.

**Claude Code** uses `/theme` to mutate config (theme picker proves it) and `~/.claude/settings.json` (per general knowledge — not in 5 PNGs). No interactive multi-page settings panel.

---

## 8. Error & Failure UX

### Q24 — Tool failure rendering, retry UX

Not directly visible in any screenshot. Inferred Gemini settings: `Retry Fetch Errors` (Retry on 'exception TypeErrors': fetch failed sending request errors — `true`); `Max Chat Model Attempts` (Maximum number of attempts for requests to the main chat model. Cannot exceed 10 — `10`). So Gemini retries up to 10 times silently.

### Q25 — Network / API error UX

Codex shows a yellow weekly-limit warning prepended to the main prompt (`08_*`): `△ Heads up, you have less than 10% of your weekly limit left. Run /status for a breakdown.` This is a polite proactive nudge, not a blocking error. Claude Code's `05_web_auth-error-claude-max-or-pro-required-to-connect.png` shows the **web equivalent** error: when an unentitled user tries to connect, the browser callback throws a paywall page rather than a CLI error — that's notable: the CLI itself doesn't error; the _web flow_ errors and the user is sent back to the CLI to try again.

---

## 9. Cross-CLI Comparison

### Q26 — Most distinctive Claude Code feature

**Theme picker as part of first-run** (`04_*`). 6 themes including 2 colorblind-friendly variants and 2 ANSI-only variants. Live preview pane shows sample diff. No competitor offers this much accessibility-aware theming on first launch.

Runner-up: **shift+tab cycle for bypass mode** (`01_*` `bypass permissions on (shift+tab to cycle)`) — a single chord toggles between ask/auto/bypass, which is more discoverable than relaunching with a flag.

### Q27 — Most distinctive Codex CLI feature

**Plan-mode + collab-mode as named first-class slash commands** (`10_*`: `/plan`, `/collab — change collaboration mode (experimental)`). Codex also has the most slash commands of the three (~28 vs Gemini's 22 visible vs Claude's hidden) and the only one with an explicit `/personality — choose a communication style for Codex`. Codex's `/fast` (toggle Fast mode at 2X plan usage) is also unique — letting users opt into quota burn for speed.

Runner-up: **Device Code as named auth peer** (not just paste-fallback) — best for headless CI/dev-container use cases.

### Q28 — Most distinctive Gemini CLI feature

**Status bar density + interactive /settings** — the 6-column status bar (`16_*`) with workspace/branch/sandbox/model/context/memory simultaneously visible is information-dense and color-codes danger states (red `no sandbox`). The 5-page interactive `/settings` panel is the most polished settings UX of any CLI I've seen — searchable, scoped (User/Workspace/System), every setting has a one-line description.

Runner-up: **Vim mode as first-class** with `[INSERT]`/`NORMAL` mode tags in the prompt area — only Gemini ships modal editing.

### Q29 — Anything we should NOT copy

1. **Claude Code's `--dangerously-skip-permissions` length** is theatrical-scary but typing "dangerous" once is enough; Codex's `--dangerously-bypass-approvals-and-sandbox` is over-engineered. We should pick **one** clear name. Gemini's `YOLO Mode` is too jokey for a security boundary — it trivializes the threat model.
2. **Codex's lack of git-branch indicator** in the status footer (`08_*`) is a regression vs Gemini — branch matters and we should always show it.
3. **Claude Code's silent placeholder** — `>` with no hint is unfriendly for new users; Codex's literal `implement {feature}` ghost text is better. Gemini's `Press 'Esc' for NORMAL mode.` is conditional on vim-mode-on; needs an alternate placeholder when vim-mode-off.
4. **Codex's `o4-mini medium` concatenated model+effort string in footer** (`08_*`, `15_*`) is hard to parse — Gemini's separation `/model: Auto (Gemini 3)` plus `context: 0% used` is cleaner.
5. **Gemini's 68-command pile** (per the `(17/68)` footer in `08_*`) is overwhelming — we should curate to ~20-25 high-value commands, then let users add custom commands. 68 is choice-paralysis territory.
6. **Gemini's `Disable YOLO Mode` setting** as the disable-by-default toggle is confusingly inverted (double negative). Don't ship "Disable X = false" semantics.

---

## 10. Open Questions

1. **Claude Code slash commands**: The provided 5-PNG set has zero slash-command screenshots for Claude Code. We need to either (a) capture more screenshots with `/help` open, or (b) cite Anthropic's public docs. Without this we can't compare Claude's curation vs Codex's 28 vs Gemini's 68.
2. **Tool-approval modal mid-execution**: None of the 36 screenshots shows a live tool-approval prompt. We need pixels on what the actual y/n/a dialog looks like in each CLI to inform our `apps/cli/src/tools.rs` UX. Specifically: how is "always allow" rendered? Is it a third option, a checkbox, or a follow-up prompt?
3. **Plan mode visual proposal**: Codex `/plan` and Gemini `/plan` both exist but no screenshot shows the **plan tree itself** or the approve/edit/reject controls. Need to capture an actual plan render.
4. **Diff rendering in real responses**: Claude Code's theme preview (`04_*`) is the only diff in the set; no real chat-response diff is shown. How does each CLI render large multi-file diffs? Side-by-side or unified?
5. **Cost / token usage display**: None of the three CLIs show cost in their status bars — only Codex shows `100% left` (weekly quota). Why? Is this a deliberate choice (don't make users price-anxious) or just an oversight? AGI Workforce should make a deliberate decision (we have BYOK + Hobby; users will care about token spend in different ways).
6. **Custom slash commands UX**: Gemini's `/commands [reload]` is documented but the actual file-discovery convention is undocumented in the screenshots. Where do user `.gemini/commands/*.md` files live? (Inferred from Gemini docs but not visible in PNGs.)
7. **Account-switch UX**: All three have `/logout` but none shows multi-account switching (e.g., dev vs personal). For users with both a Hobby and a BYOK key, what's the switch UX?
8. **Sandbox tier in-band**: Gemini's `sandbox: no sandbox` red text is the cleanest pattern, but the actual sandbox tiers (seatbelt / bwrap / Landlock per our `apps/cli/src/sandbox.rs`) need their own status-bar enum values. What does Gemini show when sandbox IS on? (Not in screenshots.)

---

## 11. Recommendations for AGI Workforce CLI (apps/cli/)

Tying back to mission context:

1. **Auth flow** — Match Codex's three-tier triplet (Plus-plan / Device-Code / API-key) since we support BYOK + Hobby + Local. Add Gemini's "Do you want to continue?" confirm before opening browser (security UX win). Use Claude's three-line card structure for the welcome banner.
2. **Bypass-permissions** — Single clear flag name `--dangerously-bypass-permissions` (mid-length) + runtime `shift+tab` cycle (Claude pattern) showing 3 states: ask / auto-edit / bypass. Status row colors: ask=neutral, auto=yellow, bypass=red.
3. **Status bar** — 6-column Gemini layout adapted: workspace | branch | sandbox (red if off) | model+effort | context% | tokens-used. Replace Gemini's `memory: 204.8 MB` with our `tokens: 1.2k` since users care about input tokens more than process RSS.
4. **Slash-command discovery** — Curate to ~25 commands (between Claude's hidden minimal set and Gemini's 68 overload). Show paginated dropdown like Codex/Gemini. Group by Setup / Conversation / Tool / Workspace.
5. **Settings panel** — Build a `/settings` panel modeled on Gemini's 5-page interactive panel with search + scope-tabs (User / Project / System). This is currently a CLI gap for us.
6. **First-run wizard** — Add a Claude-style theme picker on first run (we already have ANSI-only fallback per `apps/cli/src/tui/theme.rs`). 4 options is enough: Dark, Light, Dark colorblind, Light colorblind.
7. **Plan mode** — Match Gemini's shift+tab cycle (auto-accept ↔ plan ↔ manual). Use our existing `update_plan` tool (per memory note: `legacy plan_mode was DELETED at tools.rs:193`).
8. **Sandbox status** — Make `sandbox` a first-class status-bar column. Render sandbox tier name (`seatbelt` / `bwrap` / `landlock-stub` / `none`) with color coding. None = red. This addresses our open P1 about Windows + Landlock being silent stubs.

---

Word count: ~2,950.
