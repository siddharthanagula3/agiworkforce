# Batch 26: VS Code Extension + CLI Marketing Accuracy Audit

Audit date: 2026-05-24
Auditor: Claude Code (automated)
Image base: ~/Desktop/reference/ui
Marketing pages: apps/web/app/vscode-extension/page.tsx, apps/web/app/cli/page.tsx

CRITICAL CONTEXT: The reference screenshots are from **Claude Code** (Anthropic's product), not AGI's own VS Code extension or CLI. The AGI marketing pages describe AGI's own product with its own feature set. This audit checks whether AGI's marketing claims are realistic and internally consistent, and flags where Claude Code reference screenshots reveal features AGI's marketing pages do not yet address or where AGI marketing claims features not evidenced in the reference product.

---

## VS Code Extension Marketing Page

Page: `apps/web/app/vscode-extension/page.tsx`
Reference product: Claude Code for VS Code (Anthropic)

### PAGE-LEVEL FINDINGS

| Check | Result |
|-------|--------|
| Page title accurate | ACCEPTABLE - "Multi-provider coding assistant" differentiates from Claude Code's single-provider model |
| Install link | ACCEPTABLE - points to GitHub Releases VSIX, consistent with "Listing in review" status |
| Provider link | OK - links to /providers |
| Marketplace status | ACCURATE - page says "Listing in review -- install via VSIX from GitHub Releases" |
| Desktop bridge claim | UNVERIFIABLE - "connects to desktop on localhost:8787 for full computer use" is not evidenced |
| Auth claim | ACCEPTABLE - "BYOK across providers" is consistent with product strategy |
| Slash commands listed | 6 commands: /explain, /fix, /refactor, /tests, /docs, /model |

### MARKETING GAPS FROM REFERENCE SCREENSHOTS

The Claude Code VS Code extension screenshots reveal many features that AGI's marketing page does NOT mention. These are features the reference competitor has that AGI should consider addressing or differentiating against:

1. **Modes system** (Ask before edits, Edit automatically, Plan mode, Bypass permissions) - Claude Code has 4 operating modes with effort slider. AGI page does not mention any mode system.
2. **Effort slider** (Low/Medium/High) - visible in Claude Code. Not mentioned on AGI page.
3. **Session history** (Local/Web tabs, session list with timestamps) - Claude Code shows full session history browser. AGI page has no session management mention.
4. **Context attachment** (Upload from computer, Add context, Attach file, Mention file from project) - Claude Code has rich context menus. AGI page does not mention context attachment.
5. **Thinking toggle** - Claude Code has an explicit thinking mode toggle. Not mentioned.
6. **Account & usage** - Claude Code shows usage limits and upgrade prompts. Not mentioned.
7. **Settings depth** - Claude Code has 13+ settings (Autosave, Git Ignore, Ctrl Enter to Send, Python Environment, Preferred Location, Hide Onboarding, etc.). AGI page lists zero settings.
8. **"Code-only software" toggle** - visible in Claude Code sidebar. Not mentioned.
9. **Rewind capability** - visible in Claude Code actions menu. Not mentioned.
10. **Clear conversation** - visible in actions menu. Not mentioned.

---

## IMG: 01_vscode-extension_marketplace-detail-page.png
- Feature depicted: Claude Code for VS Code marketplace detail page showing extension description, 6M downloads, version 2.1.86, key features list (Powerful intelligence, Works alongside you, New friendlier interface, Integrated with editor, Powerful agentic features)
- Image path: ~/Desktop/reference/ui/vscode-extension/claude/01_vscode-extension_marketplace-detail-page.png
- Client type: vscode-ext
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: inaccurate
- Marketing gaps:
  - Claude Code lists "Powerful agentic features like subagents, custom slash commands, and MCP" -- AGI page does not mention subagents or MCP support in the VS Code extension
  - Claude Code mentions "Integrated with the editor: Claude knows about your current file and text selection" -- AGI mentions code lens + hover but not file/selection awareness explicitly
  - Claude Code has 6M downloads; AGI is still at VSIX-only distribution

## IMG: 02_vscode-sidebar_chat-new-chat-empty-state.png
- Feature depicted: Claude Code VS Code extension sidebar with chat panel, usage limit warning ("You've reached your limit"), Upgrade to Pro+ prompt, marketplace info panel
- Image path: ~/Desktop/reference/ui/vscode-extension/claude/02_vscode-sidebar_chat-new-chat-empty-state.png
- Client type: vscode-ext
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Usage limits and upgrade prompts are not mentioned on AGI's page at all
  - "Code-only software / New Chat" toggle in sidebar header -- no equivalent mentioned
  - Agent/Auto mode selector visible -- AGI page does not describe operating modes

## IMG: 03_vscode-extension_settings-editor-view.png
- Feature depicted: Claude Code VS Code settings panel showing 13 extension settings (Allow Dangerously Skip Permissions, Autosave, Claude Process Wrapper, Disable Login Prompt, Enable New Conversation Shortcut, Environment Variables, Hide Onboarding, Initial Permission Mode, etc.)
- Image path: ~/Desktop/reference/ui/vscode-extension/claude/03_vscode-extension_settings-editor-view.png
- Client type: vscode-ext
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - AGI page mentions zero configuration options; Claude Code shows 13+ configurable settings
  - Permission modes (bypass permissions, initial permission mode) not mentioned
  - Environment variables support not mentioned
  - Conversation shortcut (Cmd/Ctrl+N) not mentioned

## IMG: 04_vscode-extension_settings-with-usage-limit-sidebar.png
- Feature depicted: Additional Claude Code settings including Preferred Location (panel), Respect Git Ignore, Use Ctrl Enter To Send, Use Python Environment, Use Terminal option, plus usage limit sidebar
- Image path: ~/Desktop/reference/ui/vscode-extension/claude/04_vscode-extension_settings-with-usage-limit-sidebar.png
- Client type: vscode-ext
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Git ignore respect not mentioned
  - Terminal vs native UI option not mentioned
  - Python environment integration not mentioned
  - Preferred location (panel vs editor) not mentioned

## IMG: 05_vscode-chat_modes-dropdown-and-effort-slider.png
- Feature depicted: Claude Code VS Code chat panel showing Modes dropdown (Ask before edits, Edit automatically, Plan mode, Bypass permissions) with effort slider (High) and Bypass permissions mode active
- Image path: ~/Desktop/reference/ui/vscode-extension/claude/05_vscode-chat_modes-dropdown-and-effort-slider.png
- Client type: vscode-ext
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - No mention of operating modes on AGI page (the reference has 4 modes)
  - No mention of effort slider (Low/Medium/High)
  - No mention of plan mode capability
  - No mention of bypass permissions option
  - Shift+Tab to cycle modes not mentioned

## IMG: 06_vscode-chat_actions-and-settings-menu.png
- Feature depicted: Claude Code VS Code chat actions/settings popup menu showing: Context section (Attach file, Mention file from this project, Clear conversation, Rewind), Model section (Switch model, Effort slider, Thinking toggle, Account & usage, Toggle fast mode)
- Image path: ~/Desktop/reference/ui/vscode-extension/claude/06_vscode-chat_actions-and-settings-menu.png
- Client type: vscode-ext
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - File attachment and project file mention not described
  - Rewind capability not mentioned
  - Switch model capability exists in AGI's /model slash command but the in-chat dropdown is not described
  - Thinking mode toggle not mentioned
  - Fast mode toggle not mentioned
  - Account & usage panel not mentioned

## IMG: 07_vscode-chat_input-add-context-menu.png
- Feature depicted: Claude Code VS Code chat input area showing context attachment popup with "Upload from computer" and "Add context" options, plus a "Prefer the Terminal experience? Switch back in Settings" notice
- Image path: ~/Desktop/reference/ui/vscode-extension/claude/07_vscode-chat_input-add-context-menu.png
- Client type: vscode-ext
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - File upload from computer not mentioned
  - Context addition system not described
  - Terminal fallback option not mentioned
  - Input toolbar (+ button, file icon, bypass permissions indicator) not described

## IMG: 08_vscode-main-editor_chat-empty-state-full-screen.png
- Feature depicted: Claude Code VS Code in full editor mode (not sidebar), showing empty state with mascot, chat input at bottom, "Prefer the Terminal experience?" notice, Bypass permissions mode active
- Image path: ~/Desktop/reference/ui/vscode-extension/claude/08_vscode-main-editor_chat-empty-state-full-screen.png
- Client type: vscode-ext
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Full editor mode (vs sidebar panel) not mentioned as a layout option
  - Agent mode selector (sidebar top) not described
  - Local model indicator not mentioned

## IMG: 09_vscode-main-editor_chat-sessions-history-dropdown.png
- Feature depicted: Claude Code VS Code session history dropdown showing Local/Web tabs, session search, list of past sessions with timestamps (from 3 minutes to 3 days ago), session titles, delete/fork buttons
- Image path: ~/Desktop/reference/ui/vscode-extension/claude/09_vscode-main-editor_chat-sessions-history-dropdown.png
- Client type: vscode-ext
- Marketing page: apps/web/app/vscode-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Session history browsing not mentioned at all
  - Local vs Web session tabs not mentioned
  - Session search not mentioned
  - Session deletion and forking not mentioned
  - Session timestamps and naming not mentioned

---

## CLI Marketing Page

Page: `apps/web/app/cli/page.tsx`
Reference product: Claude Code CLI (Anthropic)

### PAGE-LEVEL FINDINGS

| Check | Result |
|-------|--------|
| Page title | INACCURATE - says "Pure Rust. Ratatui TUI." but the reference screenshots show Claude Code is a Node.js/TypeScript CLI, not Rust. AGI's own CLI may be Rust but this is an aspirational claim that needs verification. |
| Install methods | UNVERIFIABLE - Homebrew tap, cargo install, curl install.sh all listed but none are publicly available |
| Subcommands listed | 15 subcommands listed; many overlap with Claude Code slash commands but naming differs |
| "Sandboxed by default" claim | PARTIALLY ACCURATE - Claude Code screenshots show /sandbox command exists but sandbox appears "disabled" in screenshot 616. AGI claims macOS Seatbelt + Linux bwrap. |
| "Sessions you can replay" | ACCURATE CONCEPT - Claude Code shows /resume, session history. AGI markets resume/fork/branch. |
| GitHub source link | Points to https://github.com/siddharthanagula3/agiworkforce |

### MARKETING GAPS FROM REFERENCE SCREENSHOTS

The Claude Code CLI screenshots reveal extensive features not covered on AGI's CLI marketing page:

1. **50+ slash commands** - Claude Code has a massive slash command palette (images 607-618 show ~50 commands). AGI page lists only 15 subcommands.
2. **Agents system** (/agents with Agents, Running, Library tabs, project agents + built-in agents) - not mentioned on AGI CLI page
3. **Skills system** (/skills) - not mentioned
4. **Plugin system** (/plugin with Discover, Installed, Marketplaces, Errors tabs) - AGI lists "plugin" as a subcommand but does not describe the multi-tab plugin management system
5. **Chrome integration** (/chrome for browser control) - not mentioned
6. **IDE integration** (/ide for connecting to IDEs) - not mentioned
7. **MCP server management** (/mcp with scope-based config) - "mcp-server" subcommand listed but not the client-side MCP management
8. **Plan mode** (/plan) - not mentioned as a mode
9. **Tasks/background tasks** (/tasks) - not mentioned
10. **Permissions management** (/permissions with Recently denied, Allow, Ask, Deny, Workspace tabs) - not mentioned
11. **Theme selector** (6 themes: Dark, Light, Dark colorblind, Light colorblind, Dark ANSI, Light ANSI) - not mentioned
12. **Login options** (3 methods: Claude subscription, Anthropic Console API, 3rd-party platform) - AGI lists "login" subcommand but doesn't describe the options
13. **OAuth browser fallback** with paste-code prompt - not mentioned
14. **Remote control** (/remote-control with web session URL) - not mentioned
15. **Voice mode** (/voice) - not mentioned
16. **Teleport** (/teleport for resuming from claude.ai) - not mentioned
17. **Ultrareview** (/ultrareview for paid bug finding) - not mentioned

---

## IMG: 01_cli_bypass-permissions-mode-enabled-shift-tab-cycle.png
- Feature depicted: Claude Code CLI with bypass permissions mode enabled (--dangerously-skip-permissions flag), showing Opus 4.6 1M context, Claude Max, effort indicator (high), shift+tab to cycle modes
- Image path: ~/Desktop/reference/ui/cli/claude-code/01_cli_bypass-permissions-mode-enabled-shift-tab-cycle.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Bypass permissions mode not mentioned on AGI CLI page
  - Effort level indicator not mentioned
  - Mode cycling (shift+tab) not mentioned
  - Model display (Opus 4.6 1M context) in header not described

## IMG: 02_cli_first-run-login-3-options-claude-account-anthropic-console-3rdparty.png
- Feature depicted: Claude Code first-run login screen with ASCII art, 3 login methods: (1) Claude account with subscription (Pro, Max, Team, Enterprise), (2) Anthropic Console account (API usage billing), (3) 3rd-party platform (Amazon Bedrock, Microsoft Foundry, Vertex AI)
- Image path: ~/Desktop/reference/ui/cli/claude-code/02_cli_first-run-login-3-options-claude-account-anthropic-console-3rdparty.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: inaccurate
- Marketing gaps:
  - AGI page shows `agiworkforce login` but doesn't describe any login method options
  - Claude Code supports subscription + API + 3rd-party. AGI's BYOK model is different but not explained on the CLI page
  - ASCII art welcome screen not described

## IMG: 03_cli_oauth-browser-fallback-paste-code-prompt.png
- Feature depicted: Claude Code OAuth flow with browser fallback -- shows full OAuth URL and "Paste code here if prompted" input
- Image path: ~/Desktop/reference/ui/cli/claude-code/03_cli_oauth-browser-fallback-paste-code-prompt.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - OAuth authentication flow not described
  - Browser-based auth with CLI fallback not mentioned
  - Auth flow UX not documented

## IMG: 04_cli_theme-selector-6-options-dark-light-colorblind-ansi.png
- Feature depicted: Claude Code theme selector showing 6 options: Dark mode, Light mode, Dark mode (colorblind-friendly), Light mode (colorblind-friendly), Dark mode (ANSI colors only), Light mode (ANSI colors only), with syntax theme preview
- Image path: ~/Desktop/reference/ui/cli/claude-code/04_cli_theme-selector-6-options-dark-light-colorblind-ansi.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Theme selection not mentioned at all on AGI CLI page
  - Accessibility (colorblind-friendly) modes not mentioned
  - ANSI-only fallback not mentioned
  - Syntax highlighting configuration not mentioned

## IMG: 05_web_auth-error-claude-max-or-pro-required-to-connect.png
- Feature depicted: Browser page at claude.ai showing "Claude Max or Pro is required to connect to Claude Code" with upgrade button
- Image path: ~/Desktop/reference/ui/cli/claude-code/05_web_auth-error-claude-max-or-pro-required-to-connect.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Subscription requirements for CLI access not mentioned
  - AGI's auth model differs (BYOK) but pricing/access tiers are not described on CLI page

## IMG: 600_cli_chrome-command-menu.png
- Feature depicted: Claude Code /chrome command showing "Claude in Chrome (Beta)" integration -- browser control, navigate websites, fill forms, capture screenshots, record GIFs, debug with console logs. Status: Enabled, Extension: Installed.
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/600_cli_chrome-command-menu.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Chrome/browser integration not mentioned on AGI CLI page
  - Computer use capabilities not mentioned
  - Extension-based browser control not described

## IMG: 601_cli_ide-select-dialog.png
- Feature depicted: Claude Code /ide command showing "Select IDE" dialog -- "Connect to an IDE for integrated development features", with message "No available IDEs detected"
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/601_cli_ide-select-dialog.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - IDE integration from CLI not mentioned (only VS Code extension page mentions desktop bridge)
  - /ide command and app-server relationship not described

## IMG: 602_cli_mcp-list-scopes.png
- Feature depicted: Claude Code /mcp command showing MCP config diagnostics with scope warnings, conflicting endpoints, and router-level MCP configuration
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/602_cli_mcp-list-scopes.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: inaccurate
- Marketing gaps:
  - AGI lists "mcp-server" subcommand (run as MCP server) but not MCP client management
  - MCP diagnostics and scope management not described
  - Router-level MCP config not mentioned

## IMG: 603_cli_mcp-built-in-detail.png
- Feature depicted: Claude Code /mcp showing individual MCP server detail (Apify MCP Server) with Status, Command, Args, Config location, and Enable/Disable option
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/603_cli_mcp-built-in-detail.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - MCP server management UI not described
  - Per-server enable/disable not mentioned
  - MCP config file location display not mentioned

## IMG: 605_cli_plan-mode-screen.png
- Feature depicted: Claude Code /plan command enabling plan mode, with "plan mode on (shift+tab to cycle)" status bar and effort/slash-command indicators
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/605_cli_plan-mode-screen.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Plan mode not mentioned on AGI CLI page
  - Mode cycling (shift+tab) not mentioned
  - Status bar indicators not described

## IMG: 607_cli_slash-command-palette-top.png
- Feature depicted: Claude Code slash command palette showing: /init, /team-onboarding, /security-review, /debug, /add-dir
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/607_cli_slash-command-palette-top.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - /init (CLAUDE.md initialization) - AGI lists "init" but for ~/.agiworkforce/, not project docs
  - /team-onboarding not mentioned
  - /security-review not mentioned
  - /debug not mentioned
  - /add-dir not mentioned

## IMG: 608_cli_slash-command-palette-middle.png
- Feature depicted: Slash commands: /debug, /add-dir, /advisor, /agents, /autofix-pr
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/608_cli_slash-command-palette-middle.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - /advisor (stronger model consultation) not mentioned
  - /agents (agent management) not mentioned as a slash command (only as "subcommand" concept)
  - /autofix-pr not mentioned

## IMG: 609_cli_slash-command-palette-lower.png
- Feature depicted: Slash commands: /background, /branch, /btw, /chrome, /clear
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/609_cli_slash-command-palette-lower.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - /background (continue in background) not mentioned
  - /branch (branch conversation) not mentioned
  - /btw (side question) not mentioned
  - /chrome not mentioned
  - /clear not mentioned

## IMG: 610_cli_slash-command-palette-bottom.png
- Feature depicted: Slash commands: /compact, /config, /context, /copy, /desktop
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/610_cli_slash-command-palette-bottom.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - /compact (context compaction) not mentioned
  - /config (config panel) not mentioned
  - /context (context usage visualization) not mentioned
  - /copy (clipboard) not mentioned
  - /desktop (continue in Claude Desktop) not mentioned

## IMG: 611_cli_slash-command-palette-more.png
- Feature depicted: Slash commands: /doctor, /effort, /exit, /export, /extra-usage, /fast
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/611_cli_slash-command-palette-more.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - /doctor (installation diagnostics) not mentioned
  - /effort (effort level) not mentioned
  - /export (conversation export) not mentioned
  - /extra-usage (usage limits configuration) not mentioned
  - /fast (fast mode toggle, Opus only) not mentioned

## IMG: 612_cli_slash-command-palette-more-2.png
- Feature depicted: Slash commands: /focus, /help, /hooks, /ide, /install-github-app
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/612_cli_slash-command-palette-more-2.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - /focus (toggle focus view) not mentioned
  - /hooks (view hook configurations) not mentioned
  - /ide (IDE integration) not mentioned
  - /install-github-app (GitHub Actions setup) not mentioned

## IMG: 613_cli_slash-command-palette-more-3.png
- Feature depicted: Slash commands: /install-slack-app, /keybindings, /login, /logout, /mcp, /memory
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/613_cli_slash-command-palette-more-3.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - /install-slack-app not mentioned
  - /keybindings (keybindings configuration) not mentioned
  - /memory (memory files editing) not mentioned
  - Login/logout exist as subcommands but slash command equivalents not mentioned

## IMG: 614_cli_slash-command-palette-more-4.png
- Feature depicted: Slash commands: /mobile, /model, /passes, /permissions, /plan, /plugin
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/614_cli_slash-command-palette-more-4.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - /mobile (QR code to download mobile app) not mentioned
  - /model (set AI model) not mentioned as slash command
  - /passes (share free week) not mentioned
  - /permissions (allow/deny tool permission rules) not mentioned
  - /plan (plan mode) not mentioned

## IMG: 615_cli_slash-command-palette-more-5.png
- Feature depicted: Slash commands: /powerup, /privacy-settings, /recap, /release-notes, /reload-plugins, /remote-control
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/615_cli_slash-command-palette-more-5.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - /powerup (interactive feature lessons) not mentioned
  - /privacy-settings not mentioned
  - /recap (session recap) not mentioned
  - /release-notes not mentioned
  - /reload-plugins not mentioned
  - /remote-control (connect for remote sessions) not mentioned

## IMG: 616_cli_slash-command-palette-more-6.png
- Feature depicted: Slash commands: /remote-env, /rename, /resume, /rewind, /sandbox, /skills
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/616_cli_slash-command-palette-more-6.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: inaccurate
- Marketing gaps:
  - /remote-env (teleport session config) not mentioned
  - /rename (conversation rename) not mentioned
  - /resume exists as subcommand but slash command equivalent not mentioned
  - /rewind (restore code/conversation to previous point) not mentioned
  - /sandbox shows "disabled" in screenshot -- AGI claims "Sandboxed by default" which may be aspirational
  - /skills not mentioned

## IMG: 617_cli_slash-command-palette-final.png
- Feature depicted: Slash commands: /stickers, /tasks, /teleport, /terminal-setup, /theme, /tui
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/617_cli_slash-command-palette-final.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - /stickers (order stickers) -- novelty feature, not expected on marketing page
  - /tasks (background task management) not mentioned
  - /teleport (resume from claude.ai) not mentioned
  - /terminal-setup (Shift+Enter keybinding) not mentioned
  - /theme (change theme) not mentioned
  - /tui (set terminal UI renderer) not mentioned

## IMG: 618_cli_slash-command-palette-end.png
- Feature depicted: Slash commands: /ultrareview, /upgrade, /usage, /voice
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/618_cli_slash-command-palette-end.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - /ultrareview (paid bug finding, $5-$20 est. cost) not mentioned
  - /upgrade not mentioned
  - /usage (session cost, plan usage, activity stats) not mentioned
  - /voice (voice mode) not mentioned

## IMG: 619_cli_agents-screen.png
- Feature depicted: Claude Code /agents dialog showing tabbed interface: Agents, Running, Library. "No subagents are currently running."
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/619_cli_agents-screen.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Agent management system not described on CLI page
  - Running agents view not mentioned
  - Agent library not mentioned

## IMG: 620_cli_agents-library-tab.png
- Feature depicted: Claude Code /agents Library tab showing project agents (chrome-ext-engineer, cli-engineer, desktop-engineer, mobile-engineer, supervisor, vscode-ext-engineer, web-engineer) and built-in agents (claude, claude-code-guide, Explore, general-purpose, Plan, statusline-setup) with model assignments
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/620_cli_agents-library-tab.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Project agent definitions (.claude/agents/) not mentioned
  - Built-in agents not mentioned
  - Model assignment per agent not mentioned
  - "Create new agent" option not mentioned

## IMG: 621_cli_skills-screen.png
- Feature depicted: Claude Code /skills dialog showing "No skills found. Create skills in .claude/skills/ or ~/.claude/skills/"
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/621_cli_skills-screen.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Skills system not mentioned on CLI page
  - Skills discovery paths not mentioned

## IMG: 622_cli_plugin-screen.png
- Feature depicted: Claude Code /plugin dialog showing 5 tabs: Plugins, Discover, Installed, Marketplaces, Errors. "Discover plugins" view with "No plugins available. Add a marketplace first."
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/622_cli_plugin-screen.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: inaccurate
- Marketing gaps:
  - AGI lists "plugin" as a subcommand with description "Manage plugins" -- this is underspecified
  - Plugin discovery, marketplace integration, error tracking tabs not described
  - 5-tab plugin management system not reflected in the one-line subcommand description

## IMG: 623_cli_plugin-installed-tab.png
- Feature depicted: Claude Code /plugin Installed tab showing search, "Needs attention" section with MCP plugins requiring auth (Airtable, Google Calendar, Google Drive, n8n, Slack), "Project" section
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/623_cli_plugin-installed-tab.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Plugin auth management not described
  - "Needs attention" plugin states not mentioned
  - MCP-based plugins (Airtable, Google Calendar, Drive, n8n, Slack) not listed as integration options

## IMG: 624_cli_plugin-marketplaces-tab.png
- Feature depicted: Claude Code /plugin Marketplaces tab showing "+ Add Marketplace" option
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/624_cli_plugin-marketplaces-tab.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Plugin marketplace concept not mentioned
  - Marketplace management (add/remove marketplaces) not described

## IMG: 625_cli_plugin-errors-tab.png
- Feature depicted: Claude Code /plugin Errors tab showing "No plugin errors"
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/625_cli_plugin-errors-tab.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Plugin error tracking/debugging not mentioned

## IMG: 626_cli_tasks-screen.png
- Feature depicted: Claude Code /tasks dialog showing "Background tasks -- No tasks currently running"
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/626_cli_tasks-screen.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Background task management not mentioned on CLI page
  - Task monitoring not described

## IMG: 627_cli_permissions-screen.png
- Feature depicted: Claude Code /permissions dialog showing tabbed interface: Recently denied, Allow, Ask, Deny, Workspace. Allow tab active with search, showing allowed tool rules (Bash, Bash(cargo *), Bash(cat *), Bash(cp *), plus specific file-path-based rules)
- Image path: ~/Desktop/reference/ui/cli/claude-code/2026-05-15/627_cli_permissions-screen.png
- Client type: cli
- Marketing page: apps/web/app/cli/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Granular permissions management not described
  - Tool-specific allow/deny rules not mentioned
  - Workspace-scoped permissions not mentioned
  - Pattern-based permissions (e.g., Bash(cargo *)) not mentioned
  - Recently denied permissions tracking not mentioned

---

## Summary

### VS Code Extension Page
- **Images audited:** 9
- **Accurate:** 0
- **Inaccurate:** 1 (marketplace listing comparison)
- **Missing from marketing:** 8 (modes, effort slider, session history, context attachment, settings depth, thinking toggle, usage limits, terminal fallback)
- **Key finding:** AGI's VS Code extension marketing page is extremely thin compared to the reference product. It describes 3 features (chat participant, inline completions, code lens) and 6 slash commands, while the reference shows 13+ settings, 4 operating modes, session history, context attachment, file upload, model switching, and thinking/effort controls.

### CLI Page
- **Images audited:** 31
- **Accurate:** 0
- **Inaccurate:** 4 (login options, MCP scope, sandbox claim, plugin depth)
- **Missing from marketing:** 27 (agents, skills, plugins detail, chrome, IDE, plan mode, tasks, permissions, themes, OAuth, voice, teleport, ultrareview, background, branch, compact, context, copy, desktop, doctor, effort, export, focus, hooks, keybindings, memory, powerup)
- **Key finding:** AGI's CLI marketing page lists 15 subcommands in a flat table. The reference product has 50+ slash commands plus dedicated management screens for agents, skills, plugins (5-tab system), permissions (5-tab system), MCP servers, tasks, and themes. The "Pure Rust. Ratatui TUI." claim differentiates from the reference but the feature set described is a small fraction of what the reference product offers.

### Critical Issues
1. **Feature coverage gap:** Both pages describe roughly 10-20% of the features visible in the reference screenshots
2. **"Pure Rust" claim:** The CLI page claims "Pure Rust. Ratatui TUI." -- this is a differentiator from Claude Code (Node.js) but needs verification that these features are actually implemented
3. **Sandbox claim:** Page says "Sandboxed by default" but reference screenshot shows sandbox as "disabled" -- if AGI's implementation differs this should be clarified
4. **Install methods:** Homebrew tap, cargo install, and curl install.sh are listed but may not be publicly available yet
5. **No screenshots or demos:** Neither marketing page includes any screenshots or visual demos of the actual product
