# Leading AI product clients: primary-source reference

Status: Historical snapshot
Owner: Repository maintainers
Last updated: 2026-09-14

Superseded for current competitor behavior on 2026-09-21 by
`chatgpt-claude-ecosystem-delta-2026-09-21.md`. The primary-source findings
below remain the September 14 record; later vendor changes use the newer file.

Every fact is sourced from an official document (vendor docs/help center, changelog, release notes, extension-store listing, or official blog) read on 2026-09-14; URL and access date follow each claim. Where an official source could not be reached or confirmed, the claim is marked UNVERIFIED rather than asserted. No specific AI model name or version appears anywhere below. Model pickers are described only as generic controls ("model picker," "effort levels"); effort-level names (e.g. low/medium/high) are not model names and are listed where documented.

---

## 1. Claude in Chrome (Anthropic)

**Side panel vs. standalone.** Panel-only, opened from the Chrome toolbar icon; no standalone window. On Max/Team, and rolling out to Pro, the panel is a Claude Cowork session: history saves, skills/connectors work, and a task started in a tab can finish on desktop/web/mobile. Enterprise needs an admin to enable "Cowork in the cloud" org-wide; otherwise users get "the classic experience" with a three-dot "Switch back to classic" option (support.claude.com/en/articles/12012173, /13065128, accessed 2026-09-14).

**Page/tab context.** Reads visible page text; screenshots of the tab or specific regions (captured on panel-open and added to the conversation); multi-tab work via dragging tabs into a Claude tab group; reads console output "including errors, network requests, and DOM state" (support.claude.com/en/articles/12012173, /12902428, accessed 2026-09-14).

**Browser actions.** Click, type, navigate, fill forms "the way a person would," open/close/switch tabs, download files, screenshot (support.claude.com/en/articles/12012173, accessed 2026-09-14).

**Permission model.** Three named modes: **Manually approve (Manual)** (asks before each action); **Automatically approve (Auto)**, the default (reviews each action for safety, auto-blocks unsafe ones, pauses when needed); **Skip all approvals (Skip)** (no checks). Per site: "Allow this action" (once) or "Always allow actions on this site," or decline. Regardless of mode, Claude always asks before downloads, entering sensitive information, granting authorizations, or changing permission settings. In every mode it is blocked from purchases, account creation, handling card/ID data, downloads from untrusted sources, permanent deletions, financial advice, trades, system file edits, and "Completing instructions from emails or web content" (support.claude.com/en/articles/12902446, accessed 2026-09-14).

**How approvals are presented.** Classic panel: Claude proposes a plan naming sites/approach for upfront review. Cowork panel: asks per action as it proceeds (support.claude.com/en/articles/12902446, accessed 2026-09-14).

**Safety layer.** Content classifiers scan untrusted content for injected instructions; automatic action screening checks each action before running; Anthropic states this holds attack success under 0.08% in internal testing. Default-blocked: adult content, piracy sites; financial/banking/investment/crypto sites need explicit permission (support.claude.com/en/articles/12902428, accessed 2026-09-14).

**Admin controls.** Team ships enabled by default; Enterprise ships disabled, flipping to enabled by default September 10, 2026 unless already disabled. Admins set an allowlist and a blocklist (blocklist overrides other settings); official guidance: "start with a restrictive allowlist." Deployable self-service or via Workspace admin console/MDM. Claude in Chrome has its own permission, separate from Cowork's; 1Password integration is off by default org-wide (support.claude.com/en/articles/13065128, accessed 2026-09-14).

**Connection to Claude Code / Desktop.** Pairs with Claude Code via `@browser` mentions (needs extension v1.0.36+), sharing the browser's login state (code.claude.com/docs/en/vs-code, accessed 2026-09-14). Pairs with Claude Desktop via Settings → Connectors → toggle on; tasks needing local files/computer still require Desktop open and connected (support.claude.com/en/articles/12012173, accessed 2026-09-14).

**Disconnect/reconnect and errors.** Official remediation: restart/update the extension if it won't connect to Claude Code or Desktop; restart/update Desktop if its toggle is inactive; restart/update Claude Code similarly; refresh the page and check site permission if Claude can't see a page; check default-blocked categories or admin restriction if a site is refused (support.claude.com/en/articles/12902405, accessed 2026-09-14). No discrete error codes are documented. A third-party writeup attributes stale "connected" toolbar status to Chrome Manifest V3 killing idle service workers, UNVERIFIED against any Anthropic source.

**Toolbar popup.** Opens the side panel "which stays visible while you browse"; pinnable via Chrome's puzzle-piece menu (support.claude.com/en/articles/12012173, accessed 2026-09-14).

---

## 2. ChatGPT / OpenAI browser use in Chrome

**Atlas retirement.** OpenAI's help center article "Evolving Atlas into ChatGPT for browser-based agentic work" (help.openai.com/en/articles/20001371, title/existence confirmed, accessed 2026-09-14; body blocked by bot protection on direct fetch) announced retiring the standalone ChatGPT Atlas browser; Atlas shut down August 9, 2026 (help.openai.com/en/collections/16051538, title confirmed, accessed 2026-09-14). Atlas's persistent sidebar, tab grouping, and page analysis moved into an official ChatGPT Chrome extension.

**The official extension.** Published by OpenAI, Chrome Web Store id `hehggadaopoacecdllhhajmbjkdcmajg`: "the full power of ChatGPT directly inside your browser" via side chat plus desktop-app browser control (chromewebstore.google.com/detail/chatgpt/hehggadaopoacecdllhhajmbjkdcmajg, accessed 2026-09-14). Works in Chrome, Edge, Brave, Vivaldi (not Opera); opens via toolbar, Extensions menu, or Cmd+Shift+. on macOS (learn.chatgpt.com/docs/chrome-extension, accessed 2026-09-14). A second, older OpenAI-published "ChatGPT" listing (id `fnmihdojmnkclgjpcoonokmkhjpjechg`, 5M+ users) also exists; which one is the currently promoted install path is UNVERIFIED (chromewebstore.google.com/publisher/openai/u33f3849923dbb9495ad540f8634ab579, accessed 2026-09-14).

**Page/tab context.** In the desktop app, `@`-mention open tabs; highlight a selection into chat without copying the full page; right-click "Ask ChatGPT"; YouTube pages with captions support timestamped transcript analysis (learn.chatgpt.com/docs/chrome-extension, accessed 2026-09-14).

**Browser actions.** Navigate, click, type, scroll, forms, screenshots, and (via a debugger permission) DOM/network inspection (learn.chatgpt.com/docs/chrome-extension, accessed 2026-09-14). A distinct **Agent mode** is how ChatGPT takes actions rather than only discusses the page: "open pages, click, type, inspect rendered state, take screenshots, and verify the result of its work"; it cannot automate file uploads in the built-in browser (learn.chatgpt.com/docs/browser, accessed 2026-09-14).

**Site permission model.** Tiered: "Allow once," "Allow for this site," "Allow for all sites" (flagged as elevated risk), "Decline"; allowlist/blocklist by domain in Settings → Computer Use (learn.chatgpt.com/docs/chrome-extension, accessed 2026-09-14). ChatGPT asks before each new site by host (learn.chatgpt.com/docs/browser, accessed 2026-09-14). Browser-history access is scoped per-request with no "always allow" option (help.openai.com/en/articles/12628199, title confirmed, body via search index, accessed 2026-09-14).

**Approvals.** Confirmation required before "submitting information, making a purchase, changing permissions, or deleting data," and separately for Developer-mode Chrome DevTools Protocol access. Sign-in flows get an extra phishing-screening pass before the secure form is shown (learn.chatgpt.com/docs/browser, accessed 2026-09-14).

**A separate surface: the desktop app's built-in browser.** Not the Chrome extension: it has its own profile and history, no import of Chrome tabs, sessions, or credentials (learn.chatgpt.com/docs/browser, accessed 2026-09-14).

**Connection to desktop/Codex.** Set up in Settings → Computer Use; selected via `@`-mention in ChatGPT Work or Codex chats; a Browser toggle controls `@`-mention visibility (learn.chatgpt.com/docs/chrome-extension, accessed 2026-09-14).

**Error states / toolbar popup.** Beyond a connection-status "Manage" indicator once paired, granular error states are UNVERIFIED (learn.chatgpt.com/docs/chrome-extension, accessed 2026-09-14).

---

## 3. Codex VS Code extension

Supports VS Code, Cursor, Windsurf, Xcode, JetBrains (learn.chatgpt.com/docs/codex/ide, accessed 2026-09-14).

**Layout/context.** Sidebar chat, opened via Command Palette "Codex: Open Codex Sidebar" if not visible. Composer attaches an open file, a selection, or a recent chat; uses "the context already open in your editor" (learn.chatgpt.com/docs/codex/ide, accessed 2026-09-14).

**Local vs. cloud.** "Keep quick iterations local, or connect Codex web when a task needs more time and room", so a local session can be delegated to the cloud mid-task (learn.chatgpt.com/docs/codex/ide, accessed 2026-09-14).

**Diff review.** Changes render "beside your code" as a summary plus changed lines, no extra nav pane: "Review a summary, inspect a focused diff, and follow up in the same chat" (learn.chatgpt.com/docs/codex/ide, accessed 2026-09-14).

**Checkpoints.** Docs recommend the user "Create Git checkpoints before and after a task", which is manual, git-based, not a first-class checkpoint UI (learn.chatgpt.com/docs/codex/ide, accessed 2026-09-14).

**Terminal.** An integrated terminal is listed among the extension's workflow features; invocation UX beyond that is UNVERIFIED (learn.chatgpt.com/docs/codex/ide, accessed 2026-09-14).

**Approval modes.** A picker below the chat input offers three: **Chat** (read-only), **Agent** (the default: edits files, runs commands like tests, asks approval before executing), **Agent (full access)** (broader filesystem and network access, minimal restriction). High-confidence but not verbatim-verified by direct fetch of the IDE-specific page (developers.openai.com/codex/ide via search index, corroborated by community.openai.com/t/1355908, accessed 2026-09-14).

**Plan mode.** A `/plan` command switches to a planning-first mode; official guidance recommends it before multi-file edits (developers.openai.com/codex, accessed 2026-09-14). Whether the IDE renders the plan as a distinct reviewable document (as Claude Code's extension does) is UNVERIFIED.

**Slash commands.** IDE-specific: `/auto-context`, `/cloud`; enabled skills also appear in the slash list (developers.openai.com/codex/ide/slash-commands via search index, accessed 2026-09-14). Shared across surfaces: `/init`, `/status`, `/mcp`, `/plan`, `/review`, `/feedback`, `/goal` (learn.chatgpt.com/docs/developer-commands, accessed 2026-09-14).

**Skills.** Invoked with a `$` mention or a skills selector; a skill's `SKILL.md` lives in a directory named for it (developers.openai.com/codex via search index, accessed 2026-09-14).

**MCP.** "The CLI and IDE extension share the same configuration, including MCP servers" (developers.openai.com/codex/mcp via search index, accessed 2026-09-14).

**Subagents.** A "background-agent UI" shows active subagents above the composer; expanding shows status, a stop-all control, or an individual thread; completed ones appear under a **Done** list with read-only result. Invoked by direct request ("spawn two agents," "delegate this work in parallel") or by project/skill instructions (learn.chatgpt.com/docs/agent-configuration/subagents, accessed 2026-09-14).

**Model/effort, status, context, settings.** A model-picker control and, where supported, a separate effort-level control exist in the composer; more granular IDE-specific status/context/settings UI is UNVERIFIED from the pages retrieved (no model name is reproduced here regardless).

**Worktrees.** Documented at the shared engine level: `--worktree`/`/worktree` create isolated checkouts for new or forked sessions, choosing a branch or carrying local changes, then browsable and resumable (developers.openai.com/codex via search index, accessed 2026-09-14). Whether the IDE exposes a graphical worktree picker is UNVERIFIED.

---

## 4. Claude Code VS Code extension

Source: code.claude.com/docs/en/vs-code (accessed 2026-09-14), all facts below unless noted.

**Layout.** A Spark icon in the editor's top-right toolbar opens the panel (shown only when a file is open); a separate, always-visible Activity Bar Spark icon opens the sessions list; Command Palette and an optional Status Bar entry are alternate entry points. The panel can dock to the secondary sidebar, primary sidebar, or an editor tab; location preference persists.

**Local vs. cloud, resume.** "Session history" has **Local** and **Web** tabs. Web lists Claude Code on the web (claude.ai) cloud sessions; resuming downloads and continues locally, **not** synced back; only sessions started from a GitHub repo appear; requires a Claude.ai subscription sign-in, not Console. Local sessions auto-archive after 14 days idle by default (or "Never"), unless open, unread, or grouped. A session that ended in plan mode restores plan mode on resume (v2.1.246+), unless the extension's starting-mode logic or a configured process wrapper overrides it.

**Context.** Selected editor text is seen automatically; `Option+K`/`Alt+K` inserts an explicit `@file.ts#5-10` reference; `@` fuzzy-matches files/folders; PDFs can be scoped to specific pages; images paste or drag-attach.

**Diff review.** In Manual mode, edits show as a side-by-side comparison with accept/reject/redirect; editing the diff directly before accepting tells Claude the content was modified.

**Terminal.** The extension bundles a private CLI copy for its own chat panel only; running `claude` in the integrated terminal needs the separate standalone CLI install (not added to PATH by the extension). The CLI auto-integrates with the IDE via a built-in local MCP server named `ide` (loopback `ws://`, random port 10000–65535, token in a `0600`-permission lock file). Only two tools are model-visible: `mcp__ide__getDiagnostics` (read-only) and `mcp__ide__executeCode` (runs code in an active Jupyter kernel behind an always-shown native Execute/Cancel prompt that no permission allowlist entry can bypass).

**Permission modes.** Four, from the prompt-box mode indicator: **Auto** (classifier reviews most actions instead of asking), **Manual** (asks before file edits and most shell commands), **Plan** (describes the plan and waits; VS Code opens it as a commentable Markdown document before Claude begins), **Edit automatically** (no asking). Pro/Max/Team default new conversations to Auto.

**Model/effort.** "Switch model…" in the command menu, or click the model name in the prompt box; an **Effort** row appears alongside it when the model supports effort levels (names withheld per the model-name-exclusion rule; effort-level names themselves appear in §5's CLI flag documentation).

**Command menu (`/`).** Attach files, switch models, toggle extended thinking; a **Customize** section reaches MCP servers, slash commands, output styles, hooks, memory, permissions, plugins; a **Settings** section has "Enable Remote Control for all sessions" and **Focus view** (collapses tool calls/results/thinking, keeps the to-do list visible).

**Checkpoints.** Hovering any message reveals a rewind button with three choices: **Fork conversation from here**, **Rewind code to here**, **Fork conversation and rewind code**.

**Slash commands.** A documented **subset** of the CLI's ("Subset (type `/` to see available)" vs. "All" on the CLI). Notable: `/usage` (Account & usage dialog with per-skill/subagent/plugin/MCP-server attribution), `/remote-control`, `/mcp`, `/plugins`, `/btw` (side questions in a separate panel, 20-exchange retention, doesn't join the main conversation), `/bug`/`/feedback`, `/compact`. The `!` bash shortcut and Tab completion are CLI-only.

**MCP/subagents.** MCP servers add/remove/enable/reconnect via a `/mcp` dialog or `claude mcp add` in the terminal, the same underlying config. Subagents appear via an **agent map**: a tree under the main agent, each row showing status, elapsed time, token count; click to see prompt/tool calls, a read-only transcript, or stop it.

**Status indicators.** A context-window usage indicator in the prompt box (auto-compacts, or manual `/compact`); a tab's Spark icon shows a colored dot (blue = permission pending, orange = finished while hidden); a shared PR footer underlines the PR link by review state when a GitHub token is available.

**Settings.** **Extension settings** in VS Code proper (`useTerminal`, `initialPermissionMode`, `preferredLocation`, `autosave`, `archiveInactiveSessions`, `focusView`, `allowDangerouslySkipPermissions`, etc.) and **Claude Code settings** in `~/.claude/settings.json`, shared with the CLI.

**Shares with CLI.** Same conversation history (`claude --resume` opens an interactive picker including extension sessions); same `~/.claude/settings.json`; same plugins/marketplaces ("uses the same CLI commands under the hood").

**Screen reader.** Built into the chat panel with no toggle (distinct from the CLI's opt-in mode); announces completed replies, permission/question prompts, status changes (working/ready/compacting), and errors; stays silent on session reopen.

---

## 5. Claude Code CLI and Codex CLI

### Claude Code CLI

Source: code.claude.com/docs/en/cli-reference (accessed 2026-09-14) unless noted.

**Resume/continue.** `claude -c`/`--continue` loads the most recent conversation in the current directory (including finished background sessions, v2.1.257+), skipping `-p`/SDK/first-`/loop` sessions unless `-p` is also passed. `claude -r`/`--resume <id-or-name>` resumes one or opens a picker (background sessions marked `bg`); `--name`/`-n` sets a display name (`/rename` mid-session); `--fork-session` starts a new ID on resume.

**Model/effort.** `--model` takes an alias or full identifier (none reproduced here); `--effort` takes a named level (**low, medium, high, xhigh, max, ultracode**); availability depends on the active model.

**Permission modes.** Exactly `default` (alias `manual`, UI label "Manual"), `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions`. `Shift+Tab` cycles `default → acceptEdits → plan → auto → dontAsk`; `bypassPermissions` joins the cycle only via `--allow-dangerously-skip-permissions`. `--dangerously-skip-permissions` starts directly in `bypassPermissions`.

**Slash commands (non-exhaustive).** `/clear`, `/undo`, `/compact`, `/plan`, `/autocompact`, `/rename`, `/tasks` (running shells and subagents, distinct from the to-do checklist), `/mcp`, `/bug`/`/feedback`, `/usage`, `/desktop` (hands the session to the desktop app; macOS and x64 Windows only), `/ide`, `/import`, `/rate-limit-options`, `/btw`.

**Project context files.** `CLAUDE.md`, `CLAUDE.local.md`, shared with the VS Code extension and desktop app (code.claude.com/docs/en/desktop, accessed 2026-09-14).

**Tool rendering.** Tool calls render inline; a PR-status footer appears on a branch with an open PR, underlined by review state, refreshing after each relevant `git push`/`gh pr` command, needing a GitHub token or `gh auth`.

**Status line.** `/statusline` takes a natural-language description and generates a script under `~/.claude/`; the script gets JSON on stdin including `model.display_name`, `context_window.used_percentage`, `rate_limits.five_hour.used_percentage`, `rate_limits.seven_day.used_percentage` (code.claude.com/docs/en/statusline, accessed 2026-09-14).

**Background tasks.** `claude --bg "<task>"` starts a detached session and prints its ID; `claude agents` opens a monitor/dispatch view; `claude attach/logs/stop (alias kill)/respawn/rm <id>` manage one; in-session `Ctrl+B` backgrounds a running Bash command or agent. A supervisor daemon hosts them (`claude daemon status/stop`); idle (30+ min) background tasks are reaped under memory pressure on macOS/Linux unless disabled.

**Context/compaction.** Automatic, or manual `/compact`; `--autocompact <auto|tokens>` overrides the session window without changing saved settings.

**Terminal conventions.** A fullscreen renderer (`?` for shortcuts) with a flat fallback via `--ax-screen-reader`. Returning after 3+ idle minutes and 3+ completed turns shows a one-line recap, generated in the background, never twice in a row. The to-do checklist marks items **pending**, **in progress**, or **complete** (code.claude.com/docs/en/interactive-mode, accessed 2026-09-14).

### Codex CLI

Source: learn.chatgpt.com/docs/codex/cli (accessed 2026-09-14) unless noted.

**Session UX.** An interactive loop whose header shows working directory, a context-remaining percentage ("100% context left"), a "? for shortcuts" hint, and a generic model/effort control.

**Resume.** `codex resume` reopens recent repo chats or searches local chats; `codex resume --last` continues the most recent for the working directory; `codex resume <SESSION_ID>` / `--all` also work. `codex fork` branches a prior session into a new thread, preserving the transcript. `codex archive`/`unarchive` and `codex delete` manage saved sessions (developers.openai.com/codex/developer-commands, accessed 2026-09-14).

**Approval policy vs. sandbox mode: independent axes.** `approval_policy` (config.toml) governs _when_ it pauses: `untrusted`, `on-request`, `never` (plus a granular per-category form); official guidance calls `never` fit "for trusted developer laptops" and `untrusted` right "for unattended CI and production runs." `sandbox_mode` governs _what_ it can touch, independent of approval: `workspace-write`, `danger-full-access` (ephemeral containers needing unrestricted access), `read-only` (developers.openai.com/codex/config-basic via search index, accessed 2026-09-14). In-session, `/approval` or `/permissions` selects these.

**Slash commands.** `/init` (creates `AGENTS.md`), `/status`, `/permissions`, `/model` (model+effort, generic control), `/review`, `/plan`, `/mcp`, `/feedback`, `/goal`.

**Project context files.** `AGENTS.md` (via `/init`) for repeatable per-repo instructions; `config.toml` for model/approval/sandbox/MCP/skills.

**Tool rendering.** Command execution, diffs, and tool invocations render inline in the transcript as they happen.

**Non-interactive/CI.** `codex exec` (alias `codex e`) streams to stdout or JSONL, optionally resuming a session. `codex review` runs a non-interactive review of uncommitted changes, a base-branch diff, a commit, or custom instructions. `codex doctor` reports on install/config/auth/runtime/git/terminal/app-server/thread inventory.

**MCP/plugins.** `codex mcp` manages MCP servers; `codex plugin` manages plugins from configured marketplaces; shared with the IDE extension (§3).

**Worktrees.** `--worktree`/`/worktree` create isolated checkouts for new or forked sessions, choosing a branch or carrying local changes, then browsable and resumable (developers.openai.com/codex via search index, accessed 2026-09-14).

**Status line.** The header's context-remaining percentage is the primary indicator; no separate customizable status-line system analogous to Claude Code's `/statusline` was found; UNVERIFIED whether one exists.

---

## 6. Desktop apps

### Claude desktop (Anthropic)

Source: code.claude.com/docs/en/desktop and support.claude.com/en/articles/10065433 (accessed 2026-09-14) unless noted.

**App shell.** Three tabs: **Chat** (free plan included), **Cowork** ("Dispatch and longer agentic work"), **Code** (dev sessions, each with its own chat history and project folder, run in parallel via the sidebar). Platforms: macOS 11+, Windows 10+, Linux beta (Ubuntu 22.04+/Debian 12+, x64/arm64). Code and Cowork need Pro/Max/Team/Enterprise; Chat is free.

**Desktop-only features (Code tab).** Permission modes Manual/Accept edits/Plan/Auto/Bypass permissions; a side-by-side diff pane with inline comments (submit Cmd/Ctrl+Enter) and a one-click "Review code" pass focused on "compile errors, definite logic errors, security vulnerabilities, and obvious bugs"; an integrated terminal (`` Ctrl+` ``, local sessions only, shares the session's environment); a live-app-preview Browser pane that auto-starts a dev server after edits, where "Claude takes screenshots, inspects the DOM, clicks elements, fills forms, and fixes issues it finds"; GitHub PR monitoring with a CI status bar plus **Auto-fix** (reads failing checks and iterates) and **Auto-merge** (squash-merges once green) toggles, needing an installed and authenticated `gh` CLI; plus file, plan, tasks, subagent, and iOS Simulator panes.

**Cowork tab.** Dispatch-originated Code sessions carry a **Dispatch badge** and push a phone notification on finish; Dispatch needs Pro or Max, not Team/Enterprise.

**Computer use (macOS/Windows, Pro/Max only).** Off by default; once enabled, gated per-app into **View only**, **Click only**, **Full control**.

**Connectors.** Local/SSH sessions only, added via the `+` button (Calendar, Slack, GitHub, Linear, Notion, etc.).

**Global shortcuts.** (Cmd macOS / Ctrl Windows.) `⌘/` shortcuts list; `⌘N`/`⌘W` new/close session; `⌘⇧]`/`[` next/prev session; `Esc` stop response; `⌘⇧D`/`⌘⇧B` toggle diff/Browser pane; `⌘⇧S` select element in Browser; `` Ctrl+` `` toggle terminal (both platforms); `⌘\` close focused pane; `⌘;` side chat; `Ctrl O` cycle views; `⌘⇧M`/`⌘⇧I`/`⌘⇧E` permission-mode/model/effort menus; `1`–`9` select a menu item.

**Settings.** Settings → **Claude Code** (computer-use toggle, denied-apps list, unhide-on-finish, worktree location/branch prefix, auto-archive after PR merge/close, clear session data, browser toggles); Settings → **Connectors**; a local environment editor (encrypted per-machine vars); a per-session transcript view (Normal/Verbose/Summary).

**Account.** Sign-in/out in the app menu (macOS **Claude** menu; Windows **Help** menu); Enterprise can mandate SSO; top troubleshooting fix is "Sign out and back in."

**Window/session behavior.** New session via sidebar `+`/`⌘N`; optional Git-worktree isolation per session; `⌘`+click a sidebar session opens a split-view pane; manual or auto-archive after PR merge/close; an OS notification fires when a Code session finishes. Environment types: **Local**, **Cloud** (Anthropic-managed, "continues even if you close the app"), **SSH** (pre-configurable via managed `sshConfigs`), **WSL** (Windows/WSL2 only).

**Updates/deep links.** macOS/Windows auto-update on launch (manual check in app/Help menu); Linux via `apt`. Platform-specific download-redirect URLs; the CLI's `/desktop` command hands a running session to the desktop app (macOS and x64 Windows only, needs a signed-in subscription).

**Cross-session messaging.** A session can list, read, and message other Code-tab sessions (local/SSH/WSL only, not cloud or CLI), always asking permission before archiving another and unable to message from an unattended scheduled run.

### ChatGPT desktop (OpenAI)

Facts below are drawn mainly via search-index summaries of official OpenAI pages: direct WebFetch of help.openai.com and openai.com returned HTTP 403 (bot protection) throughout this research pass on 2026-09-14. Each fact still cites the specific official URL; lower confidence is flagged where a claim rests only on secondary reporting of an official change.

**App shell.** From July 9, 2026, the standalone Codex desktop app merged into one shared ChatGPT desktop app (macOS/Windows) spanning three modes (**Chat**, **Work**, **Codex**), confirmed as an official pairing by OpenAI's own help article "ChatGPT Work and Codex" (help.openai.com/en/articles/20001275, title/existence confirmed, accessed 2026-09-14); the "one shell, three modes" framing itself is secondary reporting (developersdigest.tech, accessed 2026-09-14), UNVERIFIED verbatim.

**Companion window.** Global shortcut macOS **Option+Space** / Windows **Alt+Space**: an always-in-front window to ask ChatGPT, upload files, generate an image, or start a conversation; customizable on Windows under Settings → App → Companion window hotkey; remembers last position, resets to bottom-center (help.openai.com/en/articles/9982051, title confirmed, body via search index, accessed 2026-09-14; corroborated by OpenAI's own announcement of the macOS companion window).

**Voice.** Shipped to desktop, letting a user direct multiple agents running in ChatGPT Work or Codex by voice; reported available on Plus/Pro/Business/Edu/Enterprise with Enterprise/Edu getting two weeks' early access; macOS-only **Appshots** lets Voice see the foreground app without pasting; plan-availability specifics are UNVERIFIED verbatim against OpenAI's own text (reported via search-index summary, accessed 2026-09-14).

**macOS integrations.** Initial direct integration with VS Code, Xcode, Terminal (secondary reporting of an official feature, UNVERIFIED verbatim, accessed 2026-09-14).

**Built-in browser vs. Chrome extension.** A distinct surface from §2's extension, with its own profile and history, no Chrome import (learn.chatgpt.com/docs/browser, accessed 2026-09-14).

**Account switching.** Supported on ChatGPT web; explicitly **not yet** in "Codex desktop or the native ChatGPT mobile apps" (help.openai.com/en/articles/20001068, title confirmed, body via search index, accessed 2026-09-14).

**Remote/mobile.** Supported desktop Codex sessions reachable from a "Remote" tab in the ChatGPT mobile app; the desktop app can auto-detect hosts from local SSH config to run threads remotely as it does locally (secondary reporting, UNVERIFIED verbatim, accessed 2026-09-14).

**Settings structure and update mechanism.** Not confirmed via direct fetch in this pass; UNVERIFIED beyond the Companion-window hotkey path above.

---

## 7. Cross-product vocabulary for long-running work

A cell reading "no fixed vocabulary found" means the retrieved official docs describe the behavior narratively rather than naming a discrete status label; it does not rule out such a label existing in the product's live UI.

| Concept              | Claude in Chrome / Cowork                                                                              | Claude Code (CLI/VS Code/Desktop)                                                                    | ChatGPT Agent mode / Codex cloud                                                                                                                       | Codex IDE subagents                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Queued               | no fixed vocabulary found (support.claude.com/en/articles/13345190)                                    | background session tagged `bg` in the resume picker (code.claude.com/docs/en/cli-reference)          | no fixed vocabulary found                                                                                                                              | n/a (local)                                                                                                 |
| Working              | "Progress indicators show what Claude is doing at each step" (support.claude.com/en/articles/13345190) | to-do item marked **in progress** (code.claude.com/docs/en/interactive-mode)                         | narrated live, interruptible "at any point" (help.openai.com/en/articles/11752874, via search index)                                                   | **Active** list (learn.chatgpt.com/docs/agent-configuration/subagents)                                      |
| Waiting for approval | a per-action Allow/Decline prompt (support.claude.com/en/articles/12902446)                            | a permission prompt, or a rendered **plan** awaiting approval (code.claude.com/docs/en/vs-code)      | pauses for clarification/confirmation, e.g. "take control of the virtual browser" for sign-in (help.openai.com/en/articles/11752874, via search index) | agent-count dot state; Codex-specific wording UNVERIFIED                                                    |
| Completed            | no fixed vocabulary found                                                                              | to-do item marked **complete** (code.claude.com/docs/en/interactive-mode)                            | task "reaches a reviewable result," no single status word confirmed (developers.openai.com/codex, via search index)                                    | **Done** list with read-only result (learn.chatgpt.com/docs/agent-configuration/subagents)                  |
| Failed               | UNVERIFIED                                                                                             | UNVERIFIED, no documented status word                                                                | UNVERIFIED                                                                                                                                             | UNVERIFIED                                                                                                  |
| Cancelled            | UNVERIFIED                                                                                             | ended via `claude stop`/`kill`; no distinct "cancelled" word (code.claude.com/docs/en/cli-reference) | user can "stop it entirely and receive partial results" (help.openai.com/en/articles/11752874, via search index)                                       | subagent panel lets the user "stop it while it runs" (learn.chatgpt.com/docs/agent-configuration/subagents) |

**Approval-mode names by product/surface:**

| Product/surface                          | Mode names                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Claude in Chrome                         | Manually approve (Manual) · Automatically approve (Auto) · Skip all approvals (Skip)   |
| Claude Cowork                            | Manual mode · Auto mode · Skip mode                                                    |
| Claude Code (CLI flag values)            | `default`/`manual` · `acceptEdits` · `plan` · `auto` · `dontAsk` · `bypassPermissions` |
| Claude Code (VS Code/Desktop labels)     | Auto · Manual · Plan · Edit automatically · (Desktop adds) Bypass permissions          |
| ChatGPT/Codex shared permission-mode doc | Ask for approval (default) · Approve for me (Auto-review) · Full access                |
| Codex CLI `approval_policy`              | `untrusted` · `on-request` · `never`                                                   |
| Codex CLI `sandbox_mode` (separate axis) | `workspace-write` · `danger-full-access` · `read-only`                                 |
| Codex IDE picker                         | Chat · Agent · Agent (full access)                                                     |
| ChatGPT Chrome extension (per-site)      | Allow once · Allow for this site · Allow for all sites · Decline                       |

Sources as cited per-product in §§1–6 above, all accessed 2026-09-14. A decision-relevant pattern: **Codex names its approval control differently on every surface** (CLI config values, IDE picker labels, and the shared ChatGPT permission-modes doc all differ), while **Claude Code uses one underlying mode set** (`default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions`) with only display-label differences across CLI, VS Code extension, and desktop.

---

## Unverified

- Exact body wording of help.openai.com's Atlas-retirement article (title/URL confirmed; body blocked by bot protection on direct fetch).
- Which of the two OpenAI "ChatGPT" Chrome Web Store listings is the currently promoted install path post-Atlas.
- Discrete error-state vocabulary for Claude in Chrome beyond remediation steps, and the Manifest-V3-service-worker explanation for stale toolbar status (third-party claim, not confirmed by Anthropic).
- ChatGPT desktop's settings-page section names beyond "App"/"Data Controls," its full global-shortcut list beyond the companion hotkey, and its update mechanism.
- ChatGPT Voice's exact plan-availability list and "two weeks early access" detail, verbatim against OpenAI's own text.
- Codex IDE extension's status-bar/context-window indicator design, and whether it exposes a graphical worktree picker beyond the CLI's flag.
- Whether Codex CLI has a status-line system analogous to `/statusline`.
- A confirmed, product-native "failed" status word for long-running tasks on any of the four surfaces in §7; none of the retrieved pages used one.
- Codex cloud task list's exact on-screen status badge text, described only narratively in retrieved docs; a direct fetch of the cloud-tasks page timed out.
