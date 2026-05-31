# CLI / TUI Tools Reference Analysis

**Image set covered**:

- `/Users/siddhartha/Desktop/reference/ui/codex-cli/` — 15 images
- `/Users/siddhartha/Desktop/reference/ui/gemini-cli/` — 16 images
- `/Users/siddhartha/Desktop/reference/ui/claude-code/` — 5 images
- `/Users/siddhartha/Desktop/reference/ui-capture-runs/20260513-185809-agent-platform-reference/screenshots/claude-code/` — 15 images (samples from capture run)
- `/Users/siddhartha/Desktop/reference/ui-capture-runs/20260513-185809-agent-platform-reference/screenshots/opencode/` — 0 images (empty)

**Total images read**: 51

---

## Mislabel report

None found — all filenames accurately reflect content.

---

## Per-competitor pattern inventory

### OpenAI Codex (codex-cli)

#### 2. ONBOARDING / AUTH

- Splash screen with ASCII art logo (Codex branding)
- Three sign-in options presented at first run: ChatGPT account, Device Code, API key
- Browser OAuth fallback with long URL (displays full auth link for manual copy if headless)
- OAuth consent screen for Codex application integration with ChatGPT
- Successful signin confirmation page (localhost redirect with checkmark icon)

#### 18. CLI / TUI UX

- Post-signin welcome screen with permissions overview (autonomy level, mistakes, rate limits)
- Status bar with: model (gpt-4-mini medium), directory, reasoning level toggles
- Weekly limit warning banner (prominent alert at top in yellow/amber)
- Tip banner with promotional CTA (Codex App double rate limits, link to landing page)
- Composer shows current model in collapsed box (e.g., "OpenAI Codex v0.117.0")

#### 4. COMPOSER

- Slash command palette in 4 screens:
  - Screen 1: `/all`, `/feat`, `/fix`, `/permissioned`, `/experimental`, `/free` (mode/reasoning selectors, skill toggles)
  - Screen 2: `/resume`, `/fork`, `/plan`, `/collab` (conversation branching/sharing)
  - Screen 3: `/copy`, `/archive`, `/clear`, `/theme`, `/mcp`, `/plugins` (copy to clipboard, archive chat, theme selector, MCP + plugins)
  - Screen 4: `/logout`, `/feedback`, `/clear`, `/subagents` (auth, feedback loop, subagent threading)
- Model selector shows 7+ options (gpt-5.4 primary, gpt-5.4-xhigh, gpt-4.1-codex, etc.)
- Reasoning level selector (Low, Medium/default, Extra high)
- Model changed confirmation banner (red banner: "Model changed to gpt-5.4 xhigh")

### Google Gemini CLI (gemini-cli)

#### 2. ONBOARDING / AUTH

- Splash screen with release notes and update-available banner (yellow/gold box)
- Auth method selector: Google (gcloud), API key, Vertex AI
- Browser confirmation prompt (Yes/No modal for opening browser auth)
- URL polling screen during auth wait with instruction to press Esc/Ctrl+C to cancel
- OAuth success page (Google Developers portal confirmation)
- Post-auth restart prompt (required to apply credentials)

#### 18. CLI / TUI UX

- Status bar with: workspace/directory, branch (main), sandbox mode (no sandbox), model (Auto Gemini 3), context, memory
- Settings accessible via 5-screen scrollable interface covering: vim mode, approval behavior, update notifications, window title display, hidden banner options, footer citations, spinner rendering, IDE mode, overage behavior, memory, gitignore, sandboxing options (YOLO / folder trust), various rendering preferences
- `/permissions trust` command shows permission overview (auto-accept edits)

#### 4. COMPOSER

- Slash command palette in 3 screens:
  - Screen 1: `/about`, `/auth`, `/bug`, `/chat`, `/clear` (system info, auth, bugs, chat controls)
  - Screen 2: `/docs`, `/extensions`, `/help`, `/footer`, `/shortcuts` (help, extensibility)
  - Screen 3: `/rewind`, `/ide`, `/mcp`, `/model`, `/memory`, `/plan` (session/IDE/MCP controls, planning)
- Extended settings menu (15+ boolean toggles + enum selectors)
- Settings categories: personalization (trust), rendering (vim, window title, spinner), rendering preferences (footer citations, context summary), IDE integration, overage warnings, memory strategy, sandboxing

### Anthropic Claude Code (claude-code)

#### 2. ONBOARDING / AUTH

- Splash screen with Claude Code logo (stylized, coral/salmon brand color)
- First-run login with 3 options: Claude account subscription (Pro, Max, Team, or Enterprise), Anthropic Console account (API usage billing), Third-party platform (Jailbreak, Microsoft Founder, or Vertex AI)
- Browser fallback for OAuth (displays long URL, instruction to paste code back if browser doesn't open)
- Auth error screen (Claude Max or Pro required to connect)

#### 15. AGENTIC / COMPUTER USE

- Bypass permissions mode enabled with red banner indicator (keyboard shortcut: Shift+Tab to cycle)
- Reasoning effort indicator shown (high, /effort)

#### 18. CLI / TUI UX

- Status bar not visible in early screens (bypass-permissions takes precedence)
- Theme selector with 6 options: Dark mode, Light mode, Dark mode (Colorblind-Friendly), Light mode (Colorblind-Friendly), Light mode (Dark syntax), Light mode (ANSI colors)

#### 4. COMPOSER

- Slash command palette in 5 screens (extending from sample captures):
  - Top screen: `/init` (initialize CLAUDE.md), `/team-onboarding` (help teammates), `/security-review` (audit PR), `/debug`, `/add-dir` (manage context)
  - Middle screen: `/debug`, `/add-dir`, `/advisor` (Advisor tool config), `/agents` (manage agent configs), `/autofix-pr` (auto-fix issues)
  - Lower screen: `/background`, `/branch`, `/btw` (quick question), `/chrome` (Claude in Chrome settings), `/clear` (new session)
  - Bottom screen: `/compact` (summarize conversation), `/config` (config panel), `/context` (visualize context as grid), `/copy` (copy response), `/desktop` (continue in desktop app)
  - Additional: `/doctor` (diagnose installation), `/effort` (set reasoning effort), `/exit`, `/export` (export conversation), `/extra-usage` (configure extra usage), `/fast` (toggle fast mode)
- Plan mode indicator at bottom right (plan mode on, shows effort level)
- IDE selection dialog (no IDEs detected initially)
- MCP server config viewer (lists scopes, built-in detail view with enable option)
- Remote-control mode indicator (Code in CLI or at session URL shown in header)

---

## Standout patterns worth copying

1. **Multi-page slash command palette** — Codex/Gemini split commands across 3-5 screens with natural grouping (auth, editing modes, session control, extensibility). Claude Code goes further with full descriptions and status indicators inline. We should group by functional domain (chat control, reasoning, model/effort, sandboxing, integration).

2. **Status bar with workspace context** — Gemini CLI shows workspace/branch/model/sandbox/memory at all times. This is essential for developers switching contexts. Implement in our CLI with same fields visible.

3. **Weekly limit warning as top banner** — Codex shows usage in a persistent yellow banner with prompt to run `/status` for breakdown. This is less intrusive than a modal but impossible to miss.

4. **Theme selector (6-8 options)** — Claude Code offers Dark/Light/Colorblind/ANSI variants. Should ship all options upfront (no feature-flagging theme variants).

5. **Reasoning effort selector** — Both Codex and Claude Code have Low/Medium/High (or High/Extra High) selectors with descriptions of cost/performance tradeoff. Place in `/effort` command or status bar.

6. **Browser auth fallback with URL display** — Both Codex and Gemini show the full OAuth URL if browser doesn't open. Essential for headless/SSH sessions.

7. **Auth method selector (2-3 options at first run)** — Gemini offers Google/API/Vertex; Codex offers ChatGPT/Device/API. We should support Claude/Anthropic/3rd-party. Display as numbered menu, not radios.

8. **Post-signin permissions overview** — Codex shows "autonomy level", "rate limits", "how we handle mistakes". Frame as what the user can expect from the system, not what the system wants.

9. **Slash command with inline status** — Claude Code shows "(no content)" next to `/plugin` if nothing is configured. Gives immediate feedback without opening a submenu.

10. **MCP/plugin detail view with inline toggles** — Claude Code shows status (disabled/enabled), command, args, config path, and action options (Enable, Manage permissions, Reconnect) all on one screen. Very high information density.

---

## Anti-patterns or design choices to avoid

1. **Too many settings without search/filter** — Gemini CLI's settings span 5 full screens with no search. Makes it hard to find one toggle. If shipping 20+ settings, add search or group by frequency-of-use.

2. **Unclear model naming** — Codex uses model variants like `gpt-4.1-codex`, `gpt-5.4-xhigh` (with reasoning level baked in). Claude Code separates effort into `/effort` command. The latter is clearer — keep model ID and reasoning effort orthogonal.

3. **Update-available banner without clear action** — Gemini shows an update banner but no clear "run X to update" instruction. Always say "Run `claude --upgrade`" or equivalent.

4. **Confirmation modal for every browser open** — Gemini asks "Do you want to continue?" before opening browser. Every time. Gets annoying. Trust the user or add a "don't ask again" checkbox.

5. **Settings that require restart** — Gemini shows "You've successfully signed in. Gemini CLI needs to be restarted. Press R to restart, or Esc to choose a different authentication method." Better: auto-restart or seamlessly apply auth change.

6. **Sandbox/permission modes with unclear semantics** — Gemini has "YOLO", "folder trust", "no sandbox". The names are opaque. Use clear labels: "Run all edits" / "Run in current folder only" / "Ask before running edits".

---

## Key functional coverage to match

### Must-have

- OAuth with browser fallback (headless paste-code path)
- Slash command palette (navigation: arrow keys, Enter, Esc)
- Model selector with 3+ options visible
- Reasoning/effort selector (Low/Med/High)
- Status bar (workspace, branch, model, sandbox, memory)
- Theme selector (≥4 options)
- Weekly usage limit banner (yellow, actionable)
- Plan mode toggle (with visual indicator)
- Settings screen (≥15 toggles, organized by category)

### Should-have

- MCP server browser with enable/disable per server
- IDE integration selector (VS Code, JetBrains, etc.)
- Computer use / permissions approval mode toggle
- Reasoning level confirmation banner after change
- Multi-screen slash command palette (group by function)
- Post-signin permissions overview

### Nice-to-have

- Vim mode toggle
- Spinner/rendering preference tweaks
- Context visualization (grid or tree)
- Conversation export to clipboard
- `/doctor` diagnostic screen
