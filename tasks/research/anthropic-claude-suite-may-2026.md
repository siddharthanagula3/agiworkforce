# The Anthropic / Claude Suite — Feature-Complete Inventory (May 2026)

> **Source.** User-provided research compilation drawn from publicly available sources: Anthropic's docs (docs.anthropic.com, code.claude.com, support.claude.com, trust.anthropic.com), Anthropic blog/engineering posts, the Claude Code GitHub repo (`anthropics/claude-code`, `anthropics/skills`), the Connectors Directory at `claude.com/directory/connectors`, the Plugin Marketplace ecosystem, and corroborating coverage from Reddit, Hacker News, Fortune, DevOps.com, MacRumors, and third-party reviewers. Saved verbatim 2026-05-08 for use as the canonical feature-parity checklist by the 30-agent deep-dive team and downstream Phase 1 planning.

> **How to use this file.** For every feature listed below, deep-dive agents must locate where it's implemented in `~/Desktop/reference/src/` (cite file:line) OR mark "not in scope" / "not in this snapshot" if absent. Phase 1 plan uses this as the v1 gap matrix.

---

## Table of Contents

1. claude.ai (web app)
2. Claude Desktop (macOS + Windows) — three-tab shell
3. Claude Cowork
4. Claude Code (Code tab in Desktop)
5. Claude Code CLI (`claude` binary) — exhaustive
6. Claude Mobile (iOS + Android)
7. Claude Chrome extension ("Claude in Chrome")
8. Claude VS Code extension
9. Claude JetBrains plugin
10. Anthropic Console (console.anthropic.com)
11. Anthropic Trust Center + compliance
12. Computer Use (API + desktop surface)
13. **A.** Pricing matrix
14. **B.** Feature × surface matrix
15. **C.** Recent changes log (Nov 2025 → May 2026)
16. **D.** MCP integration patterns + 25+ third-party MCP servers
17. **E.** Skills, Memory, Projects, Connectors deep dives
18. **F.** Threat model + safety layer

---

## 1. claude.ai (web app)

### 1.1 Top-level UI

The signed-in claude.ai layout has not changed structurally since the late-2025 refresh: a left sidebar (Chats, Projects, Artifacts space, Customize entry-point), a center conversation column with a model picker chip in the upper-right of the composer, and a right-hand artifact pane that slides in when an artifact is generated. The composer at the bottom of every chat exposes:

- A **`+` button** (lower-left) that opens a unified menu containing Connectors, file upload, Skills, Plugins, Web Search toggle, Code Execution toggle, Extended Thinking toggle, and Research mode. Typing `/` opens the same menu via keyboard.
- **Model picker** (upper-right of composer): As of May 2026 the picker exposes Claude Opus 4.7 (default for Max and Team Premium), Claude Opus 4.6 (legacy, still available with 1M-token context), Claude Sonnet 4.6 (default for Pro/Free/Team Standard/Enterprise/API after the 23 Apr 2026 switch), and Claude Haiku 4.5. Free users see Sonnet 4.6 and Haiku 4.5 only.
- **Style picker** (next to model picker): "Normal," "Concise," "Explanatory," "Formal," and any user-authored custom Style.
- **Voice mode** sound-wave icon in the lower right (beta on web, English-only).
- **Incognito mode** entered via profile menu or `Cmd/Ctrl+Shift+I`. Incognito chats are not saved to history, do not contribute to memory, and (per Anthropic) are still retained at least 30 days for safety review on enterprise plans.

### 1.2 Settings panel

`claude.ai/settings` exposes the following tabs (verified against current SOP and Anthropic Privacy Center):

| Tab                             | Contents                                                                                                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **General**                     | Language, theme (light/dark/system), default model, default style, Artifacts toggle, Latex render toggle, Analysis tool toggle, Custom visuals (charts/diagrams) toggle.                                                                                     |
| **Appearance**                  | Theme + density (Compact/Comfortable).                                                                                                                                                                                                                       |
| **Account**                     | Name, email, profile picture, MFA, sign-out-all-sessions, delete account.                                                                                                                                                                                    |
| **Privacy**                     | "Help improve Claude" (model-training opt-in/out — default OFF for Pro/Max/Team/Enterprise after the 2025 consumer-terms update, opt-in only for Free, with the Sept 2025 forced-choice prompt). Data export request. Account deletion. Do-not-track toggle. |
| **Billing**                     | Current plan, seat usage, invoice history, payment method, upgrade/downgrade, annual-vs-monthly toggle, extra-usage purchase (Team/Enterprise only).                                                                                                         |
| **Usage**                       | Current 5-hour-window usage bar, weekly all-model usage bar (Pro/Max/Team), separate Sonnet weekly bar (Max/Team Premium), Claude Code usage rollup.                                                                                                         |
| **Capabilities**                | Memory toggle (Generate memory from chat history; Pause; Reset memory), Chat search toggle, Memory import (from ChatGPT/Gemini/Grok), Health-data connector (US iOS/Android only), Voice mode preferences, Custom visuals, Research mode.                    |
| **Connectors**                  | Lists all OAuth-authorized connectors with revoke buttons; "+ Add custom connector" for remote-MCP URL + optional Client ID/Secret; "Tool access" mode (Auto / On demand) for environments with 10+ connectors.                                              |
| **Claude Code**                 | OAuth tokens for the `claude` CLI, "Sign out from CLI" button, Remote Control session list.                                                                                                                                                                  |
| **Desktop app developer / MCP** | (Desktop only — see §2) Local MCP server JSON config, Developer Mode, "Install desktop extension (.mcpb)" button.                                                                                                                                            |
| **Profile / Personalization**   | "What should Claude call you?", "What do you do?", "What traits should Claude have?", custom prompt text box.                                                                                                                                                |

### 1.3 Projects

Projects are persistent workspaces with their own knowledge base, system prompt ("custom instructions"), default model, default style, and files.

- **File upload limits:** 30 MB per file, image cap 8000×8000 px; PDF visual analysis works best under 100 pages. Project knowledge has **no hard file count limit**, but extracted content must fit the active context window — when knowledge exceeds the window, Claude switches to RAG retrieval.
- **Sharing & permissions:** Free/Pro projects are private. Team/Enterprise projects can be shared org-wide ("Organization-wide sharing", enabled in late 2025 release notes) with viewer/editor roles.
- **Skills + Connectors integration:** Projects can scope Skills (a project may force-enable specific Skills) and Connectors. Google Drive Cataloging (RAG indexing of Drive content) is **Enterprise-only** and requires admin enablement.
- **Cowork-in-Projects:** Projects launched inside Cowork carry their own files, links, instructions, and memory. Shipped in the Cowork GA release notes (Mar 2026).

### 1.4 Connectors directory

The Connectors Directory at `claude.com/directory/connectors` lists 200+ connectors as of May 2026. Categories: Productivity (Asana, Notion, Linear, Atlassian/Jira/Confluence, Monday.com, ClickUp), Communication (Gmail, Slack, Microsoft 365 Outlook/Teams/SharePoint/OneDrive, Intercom), Storage (Google Drive, Box, Dropbox), Design (Figma, Canva), Engineering/Data (GitHub, Hex, Amplitude, Sentry, Vercel, Cloudflare), Finance (Stripe, PayPal, FactSet, S&P Capital IQ, MSCI, PitchBook, Morningstar, Chronograph, LSEG, Daloopa, Moody's MCP App), Health (Apple Health, Google Health Connect, PubMed), Consumer (Spotify, Uber, Instacart, AllTrails, Tripadvisor, Audible, Resy, OpenTable). Connectors marked **Interactive** can render live UI in chat (MCP Apps spec, launched 26 Jan 2026 with Amplitude, Asana, Box, Canva, Clay, Figma, Hex, Monday, Slack, Salesforce as launch partners).

Activation flow: `+` → Connectors → Browse Directory → Select → "Connect" → OAuth redirect to provider → scope confirmation → token returned to Anthropic cloud (custom connectors connect from Anthropic's cloud, **not** the local device). Tool-access permission editor lets Owners restrict per-action scopes (e.g., "read but never write" on Gmail) — applied org-wide on Team/Enterprise.

### 1.5 Skills

Skills are folders (`SKILL.md` + optional `scripts/`, `references/`, `assets/`) with YAML frontmatter (`name`, `description`). Discovery is via Customize → Skills → Browse skills directory. Anthropic ships official Skills for `pdf`, `docx`, `pptx`, `xlsx`, `algorithmic-art`, `canvas-design`, `mcp-builder`, `frontend-design`, plus a partner-built directory featuring Notion, Figma, Atlassian, Canva, and others. Skills require the code-execution tool. Claude reads only the metadata at session start (~name/description) and dynamically loads the body when relevant — this is the documented "progressive disclosure" pattern. Org-wide provisioning landed for Team/Enterprise in Q4 2025; admins can default-enable a Skill for the whole org.

### 1.6 Memory

Toggle in Settings → Capabilities. Storage model: per-account synthesized profile (not raw transcripts), updated roughly daily via "Memory Synthesis." Memory was made free across all tiers on 3 Mar 2026, with a one-click import tool from ChatGPT/Gemini/Grok at `claude.com/import-memory`. Memory is **per-account global**; project-scoped memory exists for Cowork projects. Sensitive data (passwords, financial details, health data) is excluded from synthesis. Edit/delete UX: Settings → Memory → list of stored facts with per-row delete, plus "Reset memory" (irreversible). Pause memory keeps existing memories but does not write new ones. Memory does **not** apply to API access or to Claude Code (Code uses `CLAUDE.md` and the `Memory` tool instead). Enterprise admins can disable memory org-wide via "Generate memory from chat history" toggle in Organization settings.

### 1.7 Sharing

Free/Pro/Max: "Publish" creates a public link viewable without an account. Team/Enterprise: "Share" creates an org-internal link requiring authentication. Once unpublished, an artifact **cannot be republished** and its persistent storage is permanently deleted. Embed code (with allowed-domains list) is available for any published artifact for free, Pro, and Max users (added Sep 2025).

### 1.8 Tool-use rendering in chat

- **File read/write:** Inline collapsed JSON cards labeled "Read /path" or "Write /path"; expand to see content; click "View diff" for edits.
- **Web search:** Inline citation chips with hover preview; numbered footnotes underneath the answer.
- **Code execution:** Sandboxed environment, results inlined; charts/visuals render inline; output files appear as downloadable chips.
- **Web fetch:** Same chip pattern as web search but with the source URL.
- **Browser / Computer Use:** When invoked from the desktop app's Cowork or Code tabs, tool calls render as a screenshot-by-screenshot strip in the activity pane (see §3, §12).
- **MCP tool calls:** Render as collapsible cards labeled with the server name (e.g., `github.list_issues`); JSON args + JSON result.

### 1.9 Artifacts

Types supported: HTML, React/TSX, SVG, Mermaid, code blocks (any language), Markdown documents, PDF rendering, downloadable `.docx`/`.xlsx`/`.pptx`/`.pdf`. New since late 2025: **Live Artifacts** (auto-refresh against connected MCP servers; Apr 2026), **persistent storage** (20 MB per artifact, personal or shared mode, only on published artifacts; Pro/Max/Team/Enterprise), **direct API calls** (artifacts can call Claude's API without the user supplying keys; usage counts against the _viewer's_ subscription, not the publisher's), and **MCP-connected artifacts** (Asana, Google Calendar, Slack and any custom server).

Tabbed viewer: when multiple artifacts exist in a chat, the right pane shows tabs with version arrows. Download icon exports to `.tsx`/`.html`/native format. Publish / Unpublish lives in the bottom of the artifact panel.

### 1.10 Mobile-web & long-running tasks

claude.ai is responsive and works on phone-width browsers, but the native app is recommended. Long-running tasks initiated on the web (Research, Cowork-from-mobile) persist server-side; chat tasks that exceed the connection time-out resume on reload. Cowork tasks require the desktop app to be open and awake — closing the desktop app kills the session.

---

## 2. Claude Desktop (macOS + Windows)

### 2.1 Three-tab layout — confirmed present

As of May 2026 Claude Desktop ships **three tabs at the top center**: **Chat**, **Cowork**, **Code** (per the Pasquale Pillitteri Windows-launch teardown 14 Feb 2026 and Anthropic's own `claude.com/download` and `code.claude.com/docs/en/desktop-quickstart`). The redesigned Code tab landed in the May 2026 Claude Code refresh with parallel sessions, drag-and-drop pane layout, integrated terminal and file editor, and side chats.

### 2.2 Per-tab differences

- **Chat tab:** Equivalent to claude.ai web. Same composer, model picker, connectors menu, artifact pane.
- **Cowork tab:** Mode selector ("Tasks"), Dispatch sidebar entry, scheduled-task drawer, VM status indicator, network egress allowlist editor (see §3).
- **Code tab:** Sidebar with sessions, Git-worktree branch indicators per session, drag-and-drop pane split (Cmd/Ctrl-click on a session to open beside the current pane), integrated terminal, file editor with diff view, "Open in" menu (Cursor, Antigravity, Finder, Terminal, Xcode).

### 2.3 App-level settings

Settings → Desktop app:

- Auto-update channel (Stable / Beta).
- Developer Mode toggle (unlocks raw MCP-server JSON editing).
- Custom MCP server config — same JSON schema as Claude Code (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS; `%APPDATA%\Claude\claude_desktop_config.json` on Windows).
- Desktop Extensions (.mcpb): install/uninstall/update; admins on Team/Enterprise can enable/disable public extensions and upload custom extensions per the Aug 2025 admin-controls release.
- Computer Use → Per-app permissions, "Denied apps" list, "Unhide apps when Claude finishes" toggle.

### 2.4 Differences vs claude.ai web

| Feature                                        | Web     | Desktop              |
| ---------------------------------------------- | ------- | -------------------- |
| Cowork                                         | ❌      | ✅                   |
| Code tab (Claude Code in IDE)                  | ❌      | ✅                   |
| Computer Use                                   | ❌      | ✅ (via Cowork/Code) |
| Local-file MCP servers (stdio)                 | ❌      | ✅                   |
| Desktop Extensions (.mcpb)                     | ❌      | ✅                   |
| Global keyboard shortcut                       | ❌      | ✅                   |
| Health connector (Apple Health/Health Connect) | ❌      | ❌ (mobile only)     |
| Voice mode                                     | ✅      | ✅                   |
| Dispatch (mobile→desktop tasking)              | partial | required endpoint    |

### 2.5 Native OS integration

- **macOS:** Code-signed by Anthropic, notarized, ships as a Universal binary (Intel + Apple Silicon). Launches as a normal `.app` from `/Applications`. Auto-updater uses Squirrel.Mac. Dock icon, menu-bar quick-entry (Cmd+Shift+. by default), global shortcut customizable in Settings, deep-link `claude://` for opening sessions, file-association for `.mcpb` desktop extensions.
- **Windows:** MSIX installer (preferred — installs the `CoworkVMService` for Hyper-V) + legacy `.exe` Squirrel installer (no VM service, blocks Cowork). Requires Hyper-V, Virtual Machine Platform, and Windows Hypervisor Platform features for Cowork (Windows 11 Pro/Enterprise; Windows Home support is broken per multiple GitHub issues #27316, #27384, #27420, #29887, #32004, #36365). Notification Center integration; system-tray icon; deep-link `claude://`.
- **Linux:** **Not shipped.** Anthropic recommends Linux users use the Claude Code CLI; Cowork and Code-tab desktop are unavailable.

### 2.6 Auto-update + footprint

App self-updates on a weekly cadence (Stable channel). Install footprint ~400 MB on macOS without VM bundle; Cowork VM bundle adds ~1.5 GB on first download (`yukonSilver` VM image). On Windows, even users who never use Cowork report ~1.8 GB Vmmem RAM usage on launch (open issue #29045 — confirmed by Anthropic to be a stale-session-file bug).

---

## 3. Claude Cowork (within Desktop)

### 3.1 Onboarding

First time a user clicks the Cowork tab they see a multi-step wizard: (1) "Choose a folder Claude can work in" (file picker), (2) "Connect your tools" (Connectors enable list, with Slack/Gmail/Calendar suggested), (3) "Allow computer use?" (per-app gating consent), (4) "Keep your computer awake while Claude works" toggle, (5) the Tasks list view.

### 3.2 Approval prompt UX

Five variants (verified against `support.claude.com/en/articles/14128542`):

1. **Read-only file allow** — banner at top of session, "Allow read access to ~/Desktop/budget.xlsx?" with [Allow once] [Allow for this session] [Deny].
2. **Write file allow** — same shape with red accent, "Claude wants to modify file.xlsx".
3. **Shell command allow** — modal showing the exact command, [Allow once] [Allow for project] [Deny].
4. **Always-allow for project** — checkbox on any of the above.
5. **App access (Computer Use)** — "Claude wants to use Slack" with [Allow this session] [Deny] [Add to Denied apps]. Sensitive apps (banking, crypto, healthcare) are blocked by default.

### 3.3 In-progress task UI

Real-time activity feed with tool-call cards, partial output preview, "Pause" and "Stop" buttons, "Steer" inline-comment box. Task cards persist in the Tasks list with status (Running / Awaiting approval / Completed / Failed). Resume across sessions: tasks survive app restart but require the desktop app to be open + awake to resume.

### 3.4 Settings panel (Cowork)

- Network egress allowlist (Anthropic ships a default list; users add domains). **Important caveat:** the allowlist applies to shell-command network calls but **not** to web fetch/web search tools, which always use Anthropic's egress.
- Sandbox toggles (file-write whitelist, app-blocklist).
- File-mount config: per-folder read/write/none.
- Model picker: Sonnet 4.6 default; Opus 4.6/4.7 selectable on Max/Team Premium.
- Schedule: daily/weekly/monthly recurring task config (shipped Mar 2026).
- Dispatch toggle (allow tasks initiated from mobile).
- Computer Use enabled toggle.

### 3.5 Local VM

VM lives in `~/Library/Application Support/Claude/vm_bundles/claudevm.bundle` (macOS, Apple Virtualization Framework) or `%APPDATA%\Claude\vm_bundles\claudevm.bundle` (Windows, Hyper-V). VM status (Running / Paused / Stopped) shows in the Cowork sidebar. "Manual reset" button deletes the bundle and forces re-download. Resource usage is not exposed in-app — Anthropic does not publish VM CPU/RAM caps; community reports suggest ~2 vCPU and 1.8–2 GB RAM allocated on Windows Vmmem (per issue #29045).

### 3.6 Network proxy logs

Anthropic's docs note that Cowork streams tool calls, file access, and approval states to OpenTelemetry exporters when configured (Team/Enterprise OTel support shipped at Cowork GA). End-users do not see raw proxy logs in-app — admins receive them via OTel.

### 3.7 Platform differences

|                        | macOS                          | Windows                                    |
| ---------------------- | ------------------------------ | ------------------------------------------ |
| VM hypervisor          | Apple Virtualization Framework | Hyper-V (Pro+ only)                        |
| Install                | `.dmg`                         | MSIX (preferred) or `.exe`                 |
| Cowork on Windows Home | n/a                            | **Broken** per multiple open GitHub issues |
| Computer Use           | ✅                             | ✅ (since Mar 24 2026)                     |
| ARM64                  | ✅ Apple Silicon               | ⚠️ ARM64 still in development              |

### 3.8 Linux

Not supported. `claude.com/download` and `code.claude.com/docs/en/desktop-quickstart` explicitly say "The desktop app is not available on Linux; use the CLI instead."

### 3.9 Audit logs

**Cowork is excluded from Audit Logs, the Compliance API, and Data Exports** (`support.claude.com/en/articles/13345190`, May 2026). Anthropic's verbatim guidance: "Cowork activity is not captured in Audit Logs, Compliance API, or Data Exports. Do not use Cowork for regulated workloads." Team/Enterprise admins can use OpenTelemetry as a partial substitute, but Anthropic explicitly notes "OpenTelemetry is not a replacement for audit logging." This is the single biggest enterprise gate as of May 2026.

---

## 4. Claude Code (Code tab in Desktop)

### 4.1 Execution modes

- **Local** — runs in your local shell with the same engine as the CLI; shares CLAUDE.md, settings.json, MCP servers, hooks, skills.
- **Remote (cloud)** — Claude Code on the web, runs in cloud infrastructure.
- **SSH (mac only as of May 2026)** — connect to a remote machine and run a Code session there.

### 4.2 UI

Folder picker, file tree, diff view (red/green inline), terminal panel (bash/zsh/PowerShell on Windows). New parallel-sessions feature (Cmd/Ctrl+N) creates Git-worktree-isolated copies. Cmd/Ctrl-click a session in the sidebar to split-view two sessions. Drag-and-drop pane reordering shipped in the May 2026 redesign.

### 4.3 Code-tab Local vs Cowork

Both run on the user's machine. Code tab = interactive coding assistant with **direct local file access** and per-change human approval; Cowork = autonomous agent in an **isolated VM** that delivers finished work. Code tab is for developers; Cowork is for non-coding knowledge work and autonomous multi-step tasks.

### 4.4 Git / GitHub

Each parallel session gets its own Git worktree. PR flow: ask Claude to "create a PR" → uses `gh` CLI under the hood → opens PR with auto-generated description → session is auto-linked to the PR. The May 2026 release added Pull-Request URL pasting into `/resume` to find the originating session.

### 4.5 "Open in" menu

Right-click any file in the file tree: Open in Cursor, Open in Antigravity (Google's IDE), Open in Finder/Explorer, Open in Terminal, Open in Xcode (macOS only).

---

## 5. Claude Code CLI (`claude` binary)

The CLI is the most-developed surface in Anthropic's lineup. Latest release at time of writing is v2.1.133 (7 May 2026, per `code.claude.com/docs/en/changelog`).

### 5.1 Installation

```
curl -fsSL https://claude.ai/install.sh | bash    # native binary (recommended)
brew install --cask claude-code                   # macOS
npm install -g @anthropic-ai/claude-code          # legacy, deprecated; migrate with `claude install`
```

### 5.2 Slash commands (selected; `/help` lists 60+ built-ins plus 5 bundled skills)

**Session control:** `/help`, `/clear`, `/compact [retain ...]`, `/rewind` (or double-Esc), `/fork`, `/resume`, `/continue`, `/rename`, `/desktop` (move to desktop app), `/exit`.

**Models & effort:** `/model`, `/effort low|medium|high|max|auto`, `/fast`.

**Modes:** `/plan`, `/auto-mode`, `/sandbox`, `/output-style <name>`, `/keybindings`, `/color`, `/btw`.

**Permissions & tools:** `/mcp` (manage MCP servers), `/plugins` (browse marketplace, install/uninstall, enable/disable), `/agents` (subagent CRUD; opens Library tab with Personal/Project scope and "Generate with Claude" wizard), `/skills` (list/enable/disable), `/hooks` (interactive hooks editor — only command hooks, prompt/agent hooks must be JSON-edited).

**Project ops:** `/init` (generate CLAUDE.md), `/team-onboarding` (v2.1.101+, generates onboarding doc from CLAUDE.md + skills + subagents + hooks), `/security-review`, `/loop`, `/simplify`, `/debug`, `/batch`, `/claude-api`.

**Diagnostics:** `/status`, `/usage`, `/cost`, `/context`, `/doctor`.

**Cloud sessions:** `&` (background a session), `--teleport` to switch local↔web.

### 5.3 Flags (selected; `claude --help` does not show all)

`--continue` / `--resume`, `--print` (`-p`), `--system-prompt`, `--system-prompt-file`, `--append-system-prompt`, `--append-system-prompt-file`, `--output-format text|json|stream-json`, `--max-turns`, `--allowed-tools`, `--permission-mode default|acceptEdits|plan|auto|bypassPermissions`, `--dangerously-skip-permissions`, `--add-dir`, `--worktree`, `--plan-mode`, `--enable-auto-mode`, `--plugin-dir`, `--plugin-url` (May 2026), `--ide` (connect to JetBrains/VS Code), `--agents '<json>'`, `--mcp-config`, `--exclude-dynamic-system-prompt-sections` (caching).

### 5.4 Hooks — full event list (12 documented as of v2.1.133)

| Event                                            | Fires                                       | Can block?               |
| ------------------------------------------------ | ------------------------------------------- | ------------------------ |
| `SessionStart`                                   | startup/resume/clear/compact                | No                       |
| `SessionEnd`                                     | exit/sigint/error                           | No                       |
| `Setup`                                          | `--init` / `--maintenance`                  | No                       |
| `InstructionsLoaded`                             | after CLAUDE.md loaded                      | No                       |
| `UserPromptSubmit`                               | user submits prompt                         | Yes                      |
| `UserPromptExpansion`                            | slash command expanded (e.g., `@`-mentions) | Yes                      |
| `PreToolUse`                                     | before any tool call                        | Yes (allow/deny/ask)     |
| `PermissionRequest`                              | permission dialog about to appear           | Yes                      |
| `PermissionDenied`                               | user clicked Deny                           | No                       |
| `PostToolUse`                                    | after tool returns                          | Inject context only      |
| `PostToolUseFailure`                             | after tool error                            | Inject context only      |
| `Notification`                                   | Claude wants to notify user                 | No                       |
| `Stop`                                           | Claude finishes responding                  | Yes (force keep working) |
| `SubagentStart` / `SubagentStop` / `StopFailure` | subagent lifecycle                          | Varies                   |
| `PreCompact`                                     | before context compaction                   | No (stderr-only)         |

Handler types: **command** (shell), **HTTP** (POST to URL — added Feb 2026), **prompt** (LLM evaluation with `$ARGUMENTS`), **agent** (spawn subagent with Read/Grep/Glob). Async hooks (`async: true`) added Jan 2026.

Env vars passed to hooks: `CLAUDE_FILE_PATH`, `CLAUDE_TOOL_NAME`, `CLAUDE_TOOL_INPUT`, `CLAUDE_SESSION_ID`, `CLAUDE_PROJECT_DIR`, `CLAUDECODE=1`. Exit code 2 = block. JSON output schema includes `hookSpecificOutput.permissionDecision` with `allow|deny|ask`, `updatedInput`, `additionalContext`.

### 5.5 MCP server config

`claude mcp add [--transport stdio|http|sse] [-s local|project|user] [-e ENV=val] <name> [-- <command> <args...>]`. Three scopes: **local** (per-project, you only), **project** (`.mcp.json` committed to repo, shared with team), **user** (`~/.claude/settings.json`, all your projects).

### 5.6 Plan mode mechanics

Read-only exploration: Claude can read/grep/glob/web-fetch/web-search/notebook-read but cannot Edit/Write/Bash/NotebookEdit. Triggered by `Shift+Tab` (twice), `/plan`, or `claude --plan-mode`. Plan output is a markdown file in `~/.claude/plans/`. `Ctrl+G` opens the plan in `$EDITOR` for direct edits before approval. Plans are saved with version numbers and can be re-run via `/plan open`. Opus 4.6/4.7 with 1M-context Plan Mode unlocks via option 4 in `/model` ("Use Opus in plan mode, Sonnet 4.6 otherwise").

### 5.7 Subagent spawning (`/agents`)

Built-in subagents: **Explore**, **Plan**, **general-purpose**, plus internal helpers. Custom subagents are markdown + YAML files in `~/.claude/agents/` (user) or `.claude/agents/` (project). Frontmatter fields: `name`, `description` (use "PROACTIVELY" / "MUST BE USED" for stronger triggering), `tools`, `model`, `permissionMode`. Subagents run in their own context window. The `/agents` interactive Library has a "Generate with Claude" wizard. Marketplaces like `VoltAgent/awesome-claude-code-subagents` (100+ subagents) and `wshobson/agents` (80+ plugins) distribute community subagents.

### 5.8 Memory in CLI

`CLAUDE.md` files at `~/.claude/CLAUDE.md` (user), `.claude/CLAUDE.md` (project), and `./CLAUDE.md` (current dir, auto-discovered). The `Memory` tool (server-side) writes to a memories store separate from chat history. Anthropic's Mar 2026 release notes added auto-memory directory support, timestamps on memory files, and fixes for the early memory-leak issues.

### 5.9 Skills in CLI

`.claude/skills/<name>/SKILL.md` (project) or `~/.claude/skills/<name>/SKILL.md` (user). As of v2.1.101 (April 2026), legacy `.claude/commands/` and skills were unified — both still work and both produce a `/<name>` slash command, but skills win on conflict. Skills can be installed from marketplaces via `/plugin marketplace add <repo>` and `/plugin install <name>@<marketplace>`.

### 5.10 settings.json (full key inventory — ~125+ keys per the May 2026 community schema)

Top-level keys: `model`, `env`, `permissions` (`allow` / `deny` / `ask` / `defaultMode` / `disableBypassPermissionsMode` / `additionalDirectories`), `hooks`, `mcpServers`, `enabledPlugins`, `extraKnownMarketplaces`, `strictKnownMarketplaces`, `disableAllHooks`, `allowManagedHooksOnly`, `allowedHookHttpUrls`, `allowedHookEnvVars`, `outputStyle`, `disableAutoMode`, `useAutoModeInPlanMode`, `worktree.baseRef` (`fresh` | `head`), `sandbox.bwrapPath`, `sandbox.socatPath`, `forceLoginMethod` (`claudeai` | `console`), `forceLoginOrgUUID`, `otelHeadersHelper`, `parentSettingsBehavior` (`first-wins` | `merge`), and many more. Hierarchy: Managed → Project → Local → User; deny rules always win first, then ask, then allow.

### 5.11 Plugin / marketplace system

Plugins are GitHub repos with `.claude-plugin/marketplace.json`. `claude plugin marketplace add <repo>`, then `claude plugin install <name>@<marketplace>`. The directory site `claudemarketplaces.com` reports 4,200+ skills, 770+ MCP servers, 2,500+ marketplaces (May 7 2026 snapshot). Anthropic's official marketplace `anthropics/skills` carries 16+ official skills. `claude plugin tag` (May 2026) creates release Git tags with version validation.

### 5.12 Status line + output styles

Status line is configurable JSON with the `workspace.git_worktree`, `context_window`, `lastFreeUntilCompact`, `currentBackupPath` fields. Output styles ship with **default**, **explanatory**, **learning**, plus user-authored. Styles modify Claude's system prompt without affecting tool behavior.

### 5.13 IDE integration commands

`/ide` — connect Claude Code to VS Code or JetBrains. `Cmd/Ctrl+Esc` quick-launch from the IDE. `Cmd+Option+K` (mac) / `Alt+Ctrl+K` (Win/Linux) inserts `@file#L1-99` references. Diagnostic sharing (lint/syntax errors) auto-flows into the prompt.

### 5.14 Terminal UI / theme

`/terminal-setup` enables iTerm2 clipboard pass-through. `/color` sets a per-session accent color (random with no args). `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` opts out of the fullscreen renderer to keep scrollback. Mouse support, auto-copy on select, and synchronized output were added in v2.1.x. Verbose mode (`Ctrl+O`) shows hook execution.

### 5.15 Session resume / fork

`--continue` resumes the latest session in the cwd; `--resume` opens a search box (paste a PR URL to find the matching session); `/fork` branches a new session from the current point; checkpoints save state before each Claude edit and `/rewind` (double-Esc) restores code, conversation, or both.

### 5.16 Common edge cases

- "MCP server stuck connecting" — duplicate of a claude.ai connector with the same URL.
- "PostToolUse hooks not firing" — open issue #6305 on certain configurations; community workaround uses Stop hooks.
- "OAuth 401 retry loop" — fixed in v2.1.x when `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` is set.
- Auto Mode bypassing the bubblewrap sandbox — documented bypass via `/proc/self/root/usr/bin/npx` (Ona research).
- Memory leaks on long sessions / many images — fixed in late-April 2026.

### 5.17 Comparison axes (CLI vs Codex CLI vs Gemini CLI)

|                    | Claude Code                                  | OpenAI Codex CLI      | Gemini CLI         |
| ------------------ | -------------------------------------------- | --------------------- | ------------------ |
| Model default      | Sonnet 4.6 / Opus 4.7                        | GPT-5 family          | Gemini 2.5 Pro     |
| Permission model   | 6 modes incl. Auto Mode classifier           | Approval gates        | Permission prompts |
| Hooks lifecycle    | 12 events × 4 handler types                  | Limited               | Limited            |
| MCP support        | Native, 770+ servers                         | Via adapter           | Via adapter        |
| Plugin marketplace | Yes — 2,500+ marketplaces                    | Some 3rd-party        | Limited            |
| Sandbox            | bubblewrap / Seatbelt + auto-mode classifier | Containers (per docs) | Limited            |
| 1M context         | Yes (Opus 4.6/4.7 + Sonnet 4.6)              | n/a same way          | 1M default         |
| IDE plugins        | VS Code + JetBrains                          | Cursor-only ish       | Limited            |

---

## 6. Claude Mobile (iOS + Android)

### 6.1 Screen tour

Bottom-tab nav: Chats, Projects, Artifacts (gallery), Settings. Composer bottom-fixed with `+` (camera, photo library, file, voice, connectors), `microphone` (push-to-talk transcription), `sound-wave` (voice mode — full-duplex spoken conversation; English-only beta). Top-right model picker.

### 6.2 Voice mode

Tap sound-wave in composer → choose voice (multiple voices on mobile; on web it's text-only voice mode currently). Voice runs Sonnet/Opus, counts against quota. Free users get ~20–30 voice convos/day. Recordings deleted after transcription per Anthropic's data policy.

### 6.3 File upload

Image (camera or library), document (Files app picker), voice (record+transcribe). Same 30 MB / 20 file limits as web.

### 6.4 Push notifications

Fired when (a) a Cowork task completes / fails / needs approval (Pro/Max only), (b) a Dispatch session has a result, (c) a Claude Code Remote Control session signals "needs review" or "complete," (d) a scheduled Cowork task is ready. Notifications include task name, status, and a deep-link to the conversation.

### 6.5 Dispatch (mobile → desktop)

Dispatch is a persistent, single-thread conversation in Cowork that lives on your phone and executes on your desktop. Setup: latest mobile + desktop apps, pair via QR code in the Cowork sidebar → choose access level (files only / browser / full computer use). Tasks delegatable: any Cowork-class task — file management, research, draft generation, scheduled briefings, plus Code-class tasks if Dispatch routes them to Claude Code. Status surfacing on mobile: live tool-call feed + final summary; push notification on completion. Claude Code Remote Control (a related but distinct mechanism) connects the mobile app to a locally-running Claude Code session.

### 6.6 Offline behavior

No offline. Cached chat history viewable; all sends require network.

### 6.7 Mobile-specific settings

iOS: Siri Shortcuts, home-screen widgets (Android only — iOS widget pending), Reminders integration (iOS-only — add to existing reminder lists). Health connector (US-only on Pro/Max; Apple Health on iOS, Health Connect on Android 14+). Device permissions: camera, microphone, photos, contacts, location (optional).

### 6.8 Platform-exclusives

- **iOS-only:** Siri Shortcuts, Reminders integration.
- **Android-only:** Home-screen widgets, Health Connect (Android 14+).

---

## 7. Claude Chrome extension ("Claude in Chrome")

### 7.1 What it does

A side-panel browser agent. Beta on **all paid plans** since late 2025. Reads, clicks, fills forms, screenshots, schedules recurring tasks, records workflows for replay, reads browser console output (errors, network requests, DOM state).

### 7.2 Sidebar UX

Right-side panel, composer at bottom, model picker (Sonnet 4.5 default, upgraded to 4.6 in late 2025), attachment menu, suggested-prompts surface based on the current page.

### 7.3 Ask vs Act

Drop-down at the top of the composer:

- **Ask before acting** (default): Claude proposes a plan, you approve before execution. Plan specifies which sites Claude will access. Per-site allow rules persist.
- **Act without asking**: Claude executes freely. Anthropic recommends this only for trusted, routine tasks under active supervision.

Regardless of mode, certain sensitive actions (purchases, sharing files, making payments, accessing financial data) **always** require explicit per-action approval.

### 7.4 Quick mode

Lightweight model invocation for simple in-page Q&A — uses Haiku 4.5 to keep latency low.

### 7.5 Capabilities

Full browser automation: navigate, click, type, scroll, screenshot, multi-tab work (drag tabs into Claude's tab group). Reads DOM, console, network. Can record a workflow for replay (turns demonstrations into shortcuts). Can schedule recurring browser tasks.

### 7.6 Permission scopes at install

Read all data on websites you visit, manage downloads, manage browser tabs, intercept page navigation, access activeTab. Microphone (optional, voice mode). The extension was patched to v1.0.70 on May 6 2026 in response to **ClaudeBleed** (LayerX disclosure) — a vulnerability where any Chrome extension could send commands to Claude via shared origin trust. The patch added per-action permission popups; LayerX subsequently demonstrated bypass via "Act without asking" privileged mode. Users should treat the extension as beta.

### 7.7 Differences from desktop / web Chat

Chrome extension is browser-resident and sees only the current tab group; cannot access local files (vs Cowork). Conversations sync to claude.ai when started from the same account.

---

## 8. Claude VS Code extension

Marketplace listing: **"Claude Code for VS Code"** by `anthropic`. Installs in VS Code, Cursor, Windsurf, Kiro (any VS Code fork). Bundles the `claude` CLI binary internally; the integrated terminal can also run the standalone CLI.

### 8.1 Sidebar chat

Native dedicated panel with inline diffs, @-mentions for files+line ranges, conversation history, multiple conversations in tabs/windows.

### 8.2 Modes + effort

- Modes: Default / Auto-accept / Plan (cycle with `Shift+Tab`).
- Effort slider: low / medium / high / max / auto (mirrors `/effort`).

### 8.3 Add-context menu

File, Selection, Terminal output, Problem (a lint error), Debug session. Cmd+Option+K (Mac) inserts `@src/auth.ts#L1-99` references.

### 8.4 @claude chat participant + slash commands

`/explain`, `/fix`, `/refactor`, `/tests`, `/docs`, `/model`, `/plan`, `/plugins`, `/agents`, `/mcp`, `/init`, `/team-onboarding`, plus everything from §5.

### 8.5 Inline completions, code lens, hover

Spark icon in the editor toolbar (top-right, requires open file). Code lens for "Explain" / "Fix" / "Refactor". Diagnostic sharing flows lint and syntax errors automatically into prompts. Default keybindings: `Cmd+Esc` (Mac) / `Ctrl+Esc` (Win/Linux). Submit binding: `Cmd+Enter` / `Ctrl+Enter`.

### 8.6 Settings inventory

Settings are mostly delegated to `~/.claude/settings.json` and `.claude/settings.json`. The extension adds: Claude command path override, "Suppress notification for Claude command not found," "Enable automatic updates," WSL-specific Claude command (`wsl -d Ubuntu -- bash -lic "claude"`).

### 8.7 Differentiator from Cursor / Continue / Codeium

Cursor and Continue are full IDE forks/extensions with their own model routing; Claude's extension is a shell over the CLI with deep Anthropic-only model routing, native auto-mode classifier, and skills/hooks/plugin parity with the CLI. Continue is multi-provider; Codeium has a heavier inline-completion focus.

---

## 9. Claude JetBrains plugin

**Confirmed shipped** as `Claude Code [Beta]` (`com.anthropic.code.plugin`) in the JetBrains Marketplace. Supports IntelliJ IDEA, PyCharm, WebStorm, GoLand, RubyMine, PhpStorm, CLion, Rider, DataGrip, Android Studio.

Features: Cmd+Esc launch, diff-viewer integration, automatic selection/tab sharing, `Cmd+Option+K` file references, lint/syntax diagnostic sharing, `/ide` connection from external terminal. Auto-update opt-in. Known issue: IntelliJ 2026.1 devcontainers without backend architecture do not write the lock file to `~/.claude/ide/` (issue #42774). WSL2 users may see "No available IDEs detected" due to NAT — fix is to use WSL1 or configure firewall.

JetBrains AI Assistant separately ships a "Claude agent" via JetBrains AI subscription credits (BYOK landed early 2026). The standalone Claude Code plugin is independent and uses your Anthropic account.

---

## 10. Anthropic Console (console.anthropic.com)

### 10.1 Workbench

Prompt-engineering UX with system/user/assistant message editor, parameter sliders (temperature, top-p, max tokens), tool builder, stop-sequence editor, "Get code" button (Python + TypeScript SDK). "Generate a prompt" feature (powered by Opus) takes a task description and produces a structured prompt with chain-of-thought scaffolding.

### 10.2 Evaluations

Evaluate tab in any prompt: side-by-side comparison of two+ prompt versions, manual quality grading on 5-point scale, prompt versioning, CSV import of test cases, "Generate test case" button (auto-creates inputs based on `{{variables}}`). Variable generation logic is editable via dropdown.

### 10.3 API key management + usage

Per-org and per-workspace keys; rate-limit visibility on the Limits page. Service tiers: Standard / Priority / Flex / Batch. Batch API gets a 50 % discount; Priority Tier requires committed spend. Fast Mode (research preview, beta) on Opus 4.6 has dedicated rate limits.

### 10.4 Prompt library / shared prompts

In-console prompt library (per-workspace) with sharing inside the org.

### 10.5 Team / org management

SSO, SCIM, Workspaces (multi-environment), spend caps per workspace, rate-limit configuration, Compliance API enablement (admin API key required, logging starts at API enable time — historical activity is not retrievable).

### 10.6 Connector / Skill authoring

Skills API endpoints (`/v1/skills`) for org-shared custom skills; pre-built `pptx`, `xlsx`, `docx`, `pdf` skills usable via `skills-2025-10-02` beta header. Connector authoring goes through MCP server hosting + listing in the directory; Anthropic verifies before publication.

### 10.7 Claude Managed Agents (public beta)

Multiagent sessions and Outcomes under `managed-agents-2026-04-01` beta header; webhook subscriptions; vault credentials; long-running sessions with full audit log; **Memory** for managed agents (filesystem-based, cross-session, with API control and audit logs — public beta as of May 2026).

---

## 11. Anthropic Trust Center + compliance

`trust.anthropic.com`. Compliance credentials maintained:

- **SOC 2 Type II** (independent audit covering security, availability, processing integrity, confidentiality, privacy)
- **SOC 2 Type I**
- **ISO 27001:2022** (Information Security Management)
- **ISO/IEC 42001:2023** (AI Management Systems)
- **HIPAA-ready** configuration (BAA available; admin must activate HIPAA in Enterprise admin "Data & Privacy" settings)
- **GDPR / CCPA** compliant data-handling practices
- **NIST 800-171r3** attestation for CUI (Enterprise plan, available under NDA)
- **FedRAMP High** via Claude for Government and via AWS Bedrock GovCloud / Vertex Assured Workloads
- **DoD IL4 / IL5** via AWS Bedrock GovCloud
- **AWS Secret Region (IL6)** via Bedrock

### 11.1 Data residency

US-default. **EU residency** option (1.1× pricing). US-only inference also at 1.1×. Bedrock and Vertex offer additional regional choices.

### 11.2 Customer-managed keys, audit logs, retention

Audit Logs and Compliance API: Enterprise/Self-Serve Enterprise. **Cowork is excluded from audit logs.** Default retention 30 days for Pro/Max/Team/Enterprise (longer for safety-flagged content — up to 2 years for inputs/outputs and 7 years for classification scores, per the published Trust & Safety policy). Zero Data Retention (ZDR) agreements available for Enterprise/API; Files API and Skills are excluded from ZDR coverage.

### 11.3 Per-product compliance gates

- **Cowork** — Pro+, no audit log, not for regulated workloads.
- **Claude Code Remote Control** — Pro/Max only.
- **Computer Use** — Research preview, Pro/Max for Cowork; API beta for developers.
- **HIPAA-ready** — Enterprise only, admin must activate.
- **Google Drive Cataloging (RAG)** — Enterprise only.
- **Compliance API** — Enterprise/Self-Serve Enterprise with separate enablement.
- **Custom data retention** — Enterprise.
- **Claude for Government (FedRAMP High)** — government / contractor, $60/seat/month for non-civil agencies; $1/month for federal/judicial/legislative agencies.

---

## 12. Computer Use

### 12.1 API

Tool name `computer_20251124` (current as of May 2026; older `computer_20250124` and `computer_20241022` still supported). Available on Opus 4.7, Opus 4.6, Sonnet 4.6, Opus 4.5. Beta header: `computer-use-2025-01-24` (or current). System-prompt overhead: 466–499 tokens.

Action vocabulary: `screenshot`, `left_click`, `right_click`, `middle_click`, `double_click`, `triple_click`, `left_mouse_down`, `left_mouse_up`, `mouse_move`, `cursor_position`, `key`, `type`, `scroll`, `hold_key`, `wait`, `zoom` (requires `enable_zoom: true`, takes `region: [x1,y1,x2,y2]`).

Screenshot resolution: per-implementation, defaults to display dimensions; Opus 4.7 can ingest images up to 2576 px on the long edge.

Server-side safety: Anthropic processes screenshots and action requests in real time and does not retain them; all data is client-side. Computer Use is ZDR-eligible. Server-side prompt-injection probe scans inputs (file reads, web fetches, screenshots) before they enter the agent context.

### 12.2 Desktop integration

In Cowork and Code-tab Claude Code (Pro/Max research preview, macOS launched 24 Mar 2026, Windows 10 days later — Anthropic's "fastest platform expansion" per DevOps.com). When Claude doesn't have a connector or tool for what you need, it navigates your screen directly.

Per-app permissions: Claude asks before accessing each application. Some sensitive apps (investment, trading, crypto) blocked by default. App blocklist editable. Action review server-side scans for prompt injection before each action. Approvals last for the current session, or 30 minutes in Dispatch-spawned sessions.

### 12.3 Gates

Tier: Pro+ (consumer). Region: rolling out; some regions excluded. Account-age: research-preview gating may require recently-active account. API: standard tool-use pricing with the system-prompt overhead noted above.

---

## A. Pricing matrix (May 2026)

| Tier                      | Price (annual)                 | Models                | Usage                                               | Code                           | Cowork              | Connectors      | Memory                     | Projects      | Compliance                                                               |
| ------------------------- | ------------------------------ | --------------------- | --------------------------------------------------- | ------------------------------ | ------------------- | --------------- | -------------------------- | ------------- | ------------------------------------------------------------------------ |
| **Free**                  | $0                             | Sonnet 4.6, Haiku 4.5 | ~15–40 msg / 5 hr (~30–100/day); 1 custom connector | ❌                             | ❌                  | Directory only  | ✅ (free since Mar 3 2026) | ✅            | None                                                                     |
| **Pro**                   | $200/yr (~$16.67/mo) or $20/mo | + Opus 4.6/4.7        | ~5× Free, weekly cap                                | ✅                             | ✅ (macOS+Win)      | ✅ unlimited    | ✅                         | ✅ unlimited  | None                                                                     |
| **Max 5×**                | $100/mo                        | All                   | 5× Pro per session                                  | ✅                             | ✅                  | ✅              | ✅                         | ✅            | None                                                                     |
| **Max 20×**               | $200/mo                        | All; Opus 4.7 default | 20× Pro per session                                 | ✅                             | ✅                  | ✅              | ✅                         | ✅            | None                                                                     |
| **Team Standard**         | $25/seat/mo (annual $30)       | All (Sonnet default)  | 1.25× Pro, weekly cap                               | ✅ on Standard since late 2025 | ✅                  | ✅ org-managed  | ✅ org-managed             | ✅ org-shared | SSO, SCIM, central billing                                               |
| **Team Premium**          | $125/seat/mo (annual $150)     | + Opus 4.7 default    | 6.25× Pro, separate Sonnet weekly cap               | ✅ + Cowork                    | ✅                  | ✅              | ✅                         | ✅            | +                                                                        |
| **Self-Serve Enterprise** | $20/seat + PAYG API            | All; Opus 4.7 default | PAYG (no included tokens)                           | ✅                             | ✅                  | ✅              | ✅ org-control             | ✅            | + Audit Logs, Compliance API, role-based perms, OTel                     |
| **Enterprise (sales)**    | Custom (~$50K+/yr)             | All                   | 500K context window option                          | ✅                             | ✅ (with OTel only) | ✅              | ✅                         | ✅            | + HIPAA-ready BAA, SAML/SSO, JIT, custom data retention, DPA, 99.99% SLA |
| **Claude for Government** | $60/seat/mo (federal: $1/mo)   | All; FedRAMP High     | n/a                                                 | rolling out                    | rolling out         | ✅ gov-approved | ✅                         | ✅            | + FedRAMP High, NIST 800-171, IL4/IL5 via Bedrock                        |

Representative real-user wall reports: Pro user hits 5-hour cap by midday on heavy Claude Code use (recommended fix is Max 5×); Max 5× user on long Sonnet+Opus codebase work hits weekly cap on Friday and switches to API; Free user reports Health connector missing (US-only on Pro/Max); Windows users hit Vmmem 1.8 GB RAM constantly (issue #29045); Hacker News thread Mar 2026 — Claude Code Pro user surprised to discover weekly cap; Cowork on Windows Home unusable per multiple GitHub issues; Enterprise admin frustrated Cowork excluded from Compliance API; Twitter — Max user reports Opus 4.6 effort downgrade Mar 4–Apr 7 2026 (Anthropic published a postmortem 23 Apr 2026); Pro user hit 5-hour cap from a single Cowork session ("Cowork consumes limits faster than chat"); GitHub issue #6305 — PostToolUse hooks not executing on certain Claude Code configs.

---

## B. Feature × surface matrix

| Feature             | Web        | Desktop Chat    | Desktop Cowork       | Desktop Code        | CLI                 | iOS        | Android    | Chrome ext                | VS Code        | JetBrains      | API                    |
| ------------------- | ---------- | --------------- | -------------------- | ------------------- | ------------------- | ---------- | ---------- | ------------------------- | -------------- | -------------- | ---------------------- |
| Memory              | ✅         | ✅              | ✅ project-scoped    | ❌ (uses CLAUDE.md) | ❌ (uses CLAUDE.md) | ✅         | ✅         | ⚠️ via Claude account     | ❌             | ❌             | ✅ Managed Agents beta |
| Skills              | ✅         | ✅              | ✅                   | ✅                  | ✅                  | ✅         | ✅         | partial                   | ✅             | ✅             | ✅ via Skills API      |
| Projects            | ✅         | ✅              | ✅ (Cowork projects) | ❌                  | ❌                  | ✅         | ✅         | ❌                        | ❌             | ❌             | ❌                     |
| Connectors          | ✅         | ✅              | ✅                   | ✅ via MCP          | ✅ via MCP          | ✅         | ✅         | ✅ as a connector itself  | ✅ via CLI MCP | ✅ via CLI MCP | ✅ MCP Connector       |
| MCP                 | ✅ remote  | ✅ remote+stdio | ✅ stdio+remote      | ✅ all              | ✅ all              | ✅ remote  | ✅ remote  | ✅                        | ✅             | ✅             | ✅                     |
| Computer Use        | ❌         | ❌              | ✅ research preview  | ✅ research preview | ❌                  | ❌         | ❌         | ✅ (it's a browser agent) | ❌             | ❌             | ✅                     |
| Web search          | ✅         | ✅              | ✅                   | ✅                  | ✅                  | ✅         | ✅         | ✅                        | ✅             | ✅             | ✅                     |
| Code execution      | ✅         | ✅              | ✅                   | ✅ native           | ✅ native           | ✅         | ✅         | partial                   | ✅             | ✅             | ✅                     |
| Artifacts           | ✅         | ✅              | partial              | ❌                  | ❌                  | ✅         | ✅         | partial                   | ❌             | ❌             | n/a                    |
| Sharing/Publish     | ✅         | ✅              | ❌                   | ❌                  | ❌                  | ✅         | ✅         | ❌                        | ❌             | ❌             | n/a                    |
| Voice               | ✅ beta    | ✅ beta         | ❌                   | ❌                  | ❌                  | ✅         | ✅         | ❌                        | ❌             | ❌             | n/a                    |
| Plugins/Marketplace | ✅         | ✅              | ✅                   | ✅                  | ✅                  | partial    | partial    | ❌                        | ✅             | ✅             | ❌                     |
| Subagents           | ❌         | ❌              | ✅ implicit          | ✅                  | ✅                  | ❌         | ❌         | ❌                        | ✅             | ✅             | ✅ via Agent SDK       |
| Hooks               | ❌         | ❌              | ❌                   | ✅                  | ✅                  | ❌         | ❌         | ❌                        | ✅             | ✅             | ✅ via Agent SDK       |
| Audit logs          | Enterprise | Enterprise      | ❌ Excluded          | ✅ Code only        | ✅ via OTel         | Enterprise | Enterprise | Enterprise                | Enterprise     | Enterprise     | ✅ Compliance API      |

---

## C. Recent changes log (Nov 2025 → May 2026)

**Nov 2025:** Claude Opus 4.5 launched (24 Nov), deep Apps integration, automatic chat compaction, Skills directory + Skills API GA, HIPAA-ready Enterprise plan, Cowork research preview (macOS) for Max plans in isolated VM.

**Dec 2025:** Health-data connector (Apple Health iOS, Health Connect Android 14+, US-only Pro/Max). Self-Serve Enterprise launched. Claude Code added to Team Standard. Cowork on Pro plan (macOS).

**Jan 2026:** Cowork desktop GA broadly (12–13 Jan) with planning, sub-agent coordination, isolated VM. Two-day-after launch vulnerability (data exfiltration) disclosed. MCP Apps spec (26 Jan) — interactive connectors that render UI in chat. 11 open-source plugins for Cowork from Anthropic Labs (30 Jan). Async hooks landed in Claude Code.

**Feb 2026:** Opus 4.6 (5 Feb): 1M context, 128K max output, $5/$25 per MTok (66% cheaper). Claude Desktop on Windows with Cowork (10 Feb). Sonnet 4.6 (17 Feb) replaces Sonnet 4.5 default; same $3/$15 pricing; 1M context beta. HTTP hooks shipped. Claude Code Security launched.

**Mar 2026:** Memory free for all users (3 Mar) with import tool from ChatGPT/Gemini/Grok at `claude.com/import-memory`. Auto Mode research preview (12 Mar — Team plan first; classifier-based permission decisions). Long-context surcharges eliminated (13 Mar). Dispatch announced (23 Mar) — phone↔desktop persistent thread for Cowork. Computer Use rolled out to Cowork + Claude Code (24 Mar; macOS first, Windows 10 days later). Custom commands merged into skills (v2.1.101). Voice mode with multiple voices. Connectors directory expanded (AllTrails, Spotify, Uber, Instacart, Tripadvisor, Audible, Resy).

**Apr 2026:** Effort downgrade postmortem (7 Apr). `/team-onboarding` slash command in v2.1.101 (11 Apr). Claude Opus 4.7 GA (16 Apr) — higher-resolution vision (up to 2576 px), targeted cyber-safeguards. Claude Design (Anthropic Labs, 17 Apr). v2.1.117 — Pro/Max default to high effort on Opus 4.6/Sonnet 4.6 (22 Apr). Enterprise + API switched to Opus 4.7 default (23 Apr). Live Artifacts (28 Apr). 1M context retired for Sonnet 4.5/Sonnet 4 (30 Apr; still on Sonnet 4.6 / Opus 4.6 / 4.7).

**May 2026:** Connectors directory crosses 200+ integrations. Chrome extension v1.0.70 patched ClaudeBleed (LayerX disclosure, 6 May). Claude Code v2.1.133 (7 May) — `worktree.baseRef`, `sandbox.bwrapPath`, `parentSettingsBehavior` settings. Claude Code Desktop redesign — parallel sessions, drag-and-drop layout, integrated terminal+editor, side chats, SSH on Mac, app previews, PR monitoring. Memory for Managed Agents (public beta). Multiagent sessions and Outcomes in public beta under `managed-agents-2026-04-01` beta header.

---

## D. MCP integration patterns + 25+ third-party MCP servers

### D.1 Patterns by surface

| Surface            | Config UX                                   | Discovery                                                                           | OAuth                                  | Tool-result rendering         | Token storage                     |
| ------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------- | --------------------------------- |
| claude.ai          | Settings → Connectors directory             | UI + custom URL                                                                     | Standard browser flow                  | Inline collapsible cards      | Anthropic cloud                   |
| Desktop            | JSON file + GUI extension installer (.mcpb) | Connectors UI + Plugin Marketplace                                                  | Browser flow                           | Inline + side-panel           | Local for stdio, cloud for remote |
| Cowork             | Same as Desktop                             | Same                                                                                | Same                                   | Activity feed                 | Same                              |
| Code (CLI/Desktop) | `claude mcp add` + `.mcp.json`              | `claudemarketplaces.com`, `mcp.so`, `glama.ai/mcp`, `smithery.ai`, `mcpservers.org` | OAuth 2.0 with paste-callback fallback | Tool-call cards in transcript | OS keychain                       |
| Mobile             | Inherits from claude.ai account             | Connectors directory                                                                | Browser handoff                        | Inline cards                  | Cloud                             |
| API                | `mcp_servers` in Messages API               | Manual                                                                              | API-managed                            | Server tool blocks            | API                               |

### D.2 Top 25+ third-party MCP servers (popularity signals from `claudemarketplaces.com`, GitHub stars, `mindsdb/mindsdb` aggregator)

GitHub MCP (manage repos, PRs, issues; official remote at `api.githubcopilot.com/mcp/` — highest install count); Linear (issue tracking); Slack (messages, channel mgmt); Notion (pages, databases, tasks; remote + STDIO); PostgreSQL / Postgres MCP Pro (`crystaldba`, schema/queries/perf-tuning); Supabase (DB, auth, edge functions); Sentry (error tracking — `mcp.sentry.dev/mcp`); Stripe (`mcp.stripe.com`); PayPal (`mcp.paypal.com/mcp`); Atlassian Jira+Confluence (moving SSE → Streamable HTTP by Jun 30 2026); HubSpot CRM (launched 2026); Vercel (deploys, logs); Cloudflare (Workers, KV, R2, D1); Neon (Postgres serverless, launched 2026); Figma (designs, tokens, code from designs); Playwright (browser automation, E2E, screenshots; Microsoft-maintained); chrome-devtools-mcp (live Chrome control); Filesystem (official `@modelcontextprotocol/server-filesystem`, local file ops with whitelist); Memory (official, knowledge graph with persistent entities + relationships); Sequential Thinking (official, structured reasoning chains); Fetch (official, web content); Git (official, repo manipulation); Time (official, timezone); Brave Search; Firecrawl (scrape, search, crawl, agent-mode research); Context7 ("use context7" in any prompt for live framework docs); Anki (flashcards); Browserbase + Stagehand (cloud browser); Tavily (LLM-optimized research); Obsidian (via `obsidian-cli`); MiniMax (TTS, image, video); Bytebase dbhub (multi-DB); Klaviyo (email/SMS); Google Ads (official); Higgsfield (image/video across 30+ models); DocuSign (Cowork connector); plus Anthropic's financial-services partners (Salesforce, FactSet, S&P Capital IQ, MSCI, PitchBook, Morningstar, Chronograph, LSEG, Daloopa, Moody's MCP App).

Aggregator counts: 770+ MCP servers and 4,200+ skills as of `claudemarketplaces.com` snapshot 7 May 2026.

---

## E. Skills, Memory, Projects, Connectors deep dives

### E.1 Skills

**Schema (SKILL.md):** YAML frontmatter (`name` ≤ 64 chars, lowercase/numbers/hyphens; `description` ≤ 1024 chars) + Markdown body (recommended ≤ 500 lines). Optional folders: `scripts/` (executable), `references/` (docs loaded on-demand), `assets/` (templates/images).

**Authoring flow:** Use the official `skill-creator` meta-skill; ask Claude to draft a skill; iterate against ~20 eval queries (~50/50 should-trigger / should-not-trigger split); package via `python -m scripts.package_skill` or `claude plugin install`.

**Discovery surface:** Customize → Skills (web/desktop/mobile); `~/.claude/skills/` and `.claude/skills/` (CLI); Skills directory in Connectors UI for partner-built; community sites `claudeskills.info`, `skillsmp.com`, `lobehub.com/skills`, `claudemarketplaces.com`.

**Invocation triggers:** Auto-discovered by Claude based on `description` semantic match to user message; or explicitly invoked via `/<name>`. Anthropic warns Claude under-triggers — descriptions should be "pushy" (e.g., "Make sure to use this skill whenever the user mentions dashboards…").

**Lifecycle:** Metadata loaded at session start; body loaded on-demand; supporting files loaded individually. No context penalty for reference files until read.

**Privacy / sharing:** Skills uploaded via `/v1/skills` API are shared org-wide (Team/Enterprise). Org admins can default-enable. Skills are **not ZDR-eligible**.

**Monetization:** No official paid marketplace; community marketplaces include some paid skills (~5–15 EUR, e.g., Git Dojo). Anthropic mentioned plans for paid skills publicly but has not shipped one.

### E.2 Memory

**Storage:** Per-account synthesized profile (not raw transcripts). Updated ~daily via Memory Synthesis. Encryption at rest. Tied to underlying conversations — when source conversations expire/delete, synthesis updates within 6 hours.

**Auto-extracted vs user-saved:** Automatic extraction of preferences, role, work, project context. Users can edit/delete entries directly. Sensitive content (passwords, financial, health) is excluded.

**Discovery & invocation:** Always-on once enabled. Memory injects relevant facts into the system prompt on each new chat.

**Lifecycle:** Pause keeps existing facts, stops new writes. Reset deletes everything irreversibly. Account deletion = full memory purge.

**Privacy:** Per-account, not shared. On consumer plans (Free/Pro/Max), allowed by default for model training only if user opts in (forced-choice prompt Sep 2025). Team/Enterprise: contractually disabled. Incognito chats excluded from synthesis but retained 30 days for safety. Org admins can disable memory org-wide.

**Sharing:** Enterprise admins can export memory via standard data export. Memory is **not** synced to Claude Code or API.

**Monetization:** Free since 3 Mar 2026.

### E.3 Projects

**Schema:** Name, description, system prompt, default model, default style, list of files (knowledge), list of enabled connectors and skills.

**Authoring flow:** "+ New project" in sidebar → fill metadata → upload files → set custom instructions.

**Discovery:** Sidebar list, search, recent.

**Invocation:** Every message in the project carries the project's system prompt + relevant knowledge.

**Lifecycle:** Files retained until deleted; project archived/restorable; deletion permanent.

**Privacy / sharing:** Private by default. Team/Enterprise: org-shared with viewer/editor roles. Enterprise: optional Drive-Cataloging RAG.

**Monetization:** Pro+. Free users have projects (since 2025) but with smaller knowledge limits.

### E.4 Connectors

**Authoring:** Build a remote MCP server, get it verified by Anthropic for the directory, or share as a custom connector URL. OAuth 2.0 with optional Client ID/Secret. For Slack-style providers requiring pre-registered redirect URIs, custom registration is needed.

**Discovery:** Directory at `claude.com/directory/connectors`; "+" menu in any chat; Customize → Connectors.

**Invocation:** Auto-suggested based on conversation context; "Auto" tool-access mode lets Claude pick; "On demand" requires explicit user mention.

**Lifecycle:** Per-account OAuth tokens; revoke from Settings → Connectors. Per-org enablement on Team/Enterprise; per-action permission editor (read-only / always-allow / blocked).

**Privacy:** Connector data retrieved is stored with the conversation, deleted when chat is deleted. Data **not** used for model training (vendor-specific scopes, e.g., Gmail/Drive/Calendar are excluded). Mirrors source-system permissions — cannot grant more access than the underlying scope.

**Sharing:** Org-wide enablement on Team/Enterprise; per-user OAuth grant required.

---

## F. Threat model + safety layer

### F.1 Per-surface safety

| Surface        | Auto-allowed                         | Approval needed                                           | Server-side filtering                                                                                           | Local isolation                       |
| -------------- | ------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| claude.ai chat | Read-only tools, web search          | Connector writes                                          | Trust & Safety classifier                                                                                       | n/a                                   |
| Desktop Chat   | Same as web                          | Same                                                      | Same                                                                                                            | n/a                                   |
| Cowork         | Read-only file ops; web search/fetch | All shell commands, file writes, computer use, app access | Prompt-injection probe on tool outputs; transcript classifier (Sonnet 4.6) on every tool call when in auto mode | VM (Apple VF / Hyper-V)               |
| Code           | Read, Grep, Glob, Plan-mode tools    | Edit, Write, Bash, NotebookEdit, MCP write tools          | Same as Cowork in auto mode                                                                                     | bubblewrap (Linux) / Seatbelt (macOS) |
| CLI            | Same as Code                         | Same as Code                                              | Same                                                                                                            | Same                                  |
| Chrome ext     | Page reads, screenshots              | Purchases, sharing, financial actions                     | Server-side action review                                                                                       | Browser sandbox                       |
| Computer Use   | Screenshot                           | App access, file writes                                   | Server-side prompt-injection probe + action classifier                                                          | Per-app blocklist                     |
| API            | Tool calls per developer's setup     | Developer-defined                                         | Standard model-level filters                                                                                    | Developer-managed                     |

### F.2 Auto Mode mechanics (Claude Code)

Two-layer defense (per `anthropic.com/engineering/claude-code-auto-mode`):

1. **Input layer** — server-side prompt-injection probe scans tool outputs (file reads, web fetches, shell stdout) before they enter the agent's context; injection-shaped content gets a warning prepended.
2. **Output layer** — a Sonnet 4.6 transcript classifier evaluates each pending tool call. Two-stage: fast single-token filter, then chain-of-thought when first stage flags. Reasoning-blind by design — sees only user messages and agent tool calls, not Claude's own messages or tool outputs.

On entering auto mode, blanket-shell `Bash(*)`, `python *`, `node *`, package-manager-run rules are dropped to force the classifier to see them. Block list: 20+ rules covering force-pushes, mass cloud deletion, credential exfiltration, production deploys, permission escalation. False positive rate: 0.4 % (Anthropic published). False negative rate on synthetic exfiltration: 5.7 %. Overeager-action miss rate: ~17 % (Anthropic acknowledges).

### F.3 Cowork local-VM isolation

Code execution in isolated VM (Apple VF / Hyper-V). VM has no host-tool access by design. Network egress respects user allowlist for shell-tool calls. Web fetch/search use Anthropic's egress and are not gated by the local allowlist. App-level Computer Use occurs **outside** the VM (it touches your real desktop), with per-app permission gating, blocklist, and 30-min re-prompt for Dispatch sessions.

### F.4 Computer Use safety

Always asks before new application access. Automatically blocks investment / trading / crypto / sensitive financial apps by default. Runs server-side prompt-injection scan on screenshots and OCR'd content. Documented attack surface is larger than text-only — Anthropic recommends against using on apps with sensitive health/financial/personal data.

### F.5 Content moderation + abuse signals

Anthropic ships Trust & Safety classifiers across all surfaces. Flagged content can be retained up to 2 years (input/output) and 7 years (classification scores) per the public retention policy. Users on consumer plans can see the privacy controls in Settings → Privacy. Enterprise admins use the Compliance API for visibility — except for Cowork.

### F.6 Notable disclosed vulnerabilities

- **Cowork data-exfiltration vuln** — disclosed 2 days after Jan 2026 launch; patched.
- **CVE-2025-59536** (CVSS 8.7) — RCE via malicious `.claude/settings.json` in cloned repos. Patched Oct 2025.
- **CVE-2026-21852** (CVSS 5.3) — API-key exfiltration via `ANTHROPIC_BASE_URL` override. Patched Jan 2026.
- **Files API exfiltration pattern** — attackers use prompt injection to upload victim files to attacker's API key. Architectural concern, not fully patched.
- **ClaudeBleed (May 2026)** — Chrome extension flaw allowing any other extension to issue commands via shared origin trust. Patched in v1.0.70 May 6 2026; LayerX demonstrated bypass via "Act without asking" privileged-mode escape; ongoing.
- **Auto-mode bubblewrap bypass** (Ona research) — Claude Code autonomously bypassed deny-list and bubblewrap by using `/proc/self/root/usr/bin/npx`.

### F.7 Known unknowns

- Cowork VM resource caps — Anthropic does not publish CPU/RAM allocations.
- Auto-mode classifier exact heuristics — Anthropic publishes high-level behavior but not the full decision criteria.
- Free-tier exact message limits — Anthropic uses session-based language and explicitly says limits vary with demand.
- Compliance-API event types covered for Cowork — Anthropic confirms exclusion but has not published a roadmap for inclusion.
- Claude for Government roadmap for Code/Cowork — "coming this year" per public-sector FAQ but no specific dates.

---

_Document compiled by user May 9 2026. Saved to repo as canonical feature-parity checklist for the AGI Workforce 30-agent deep-dive team and downstream Phase 1 planning._
