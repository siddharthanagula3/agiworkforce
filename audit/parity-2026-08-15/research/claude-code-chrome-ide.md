# Claude Code, IDE Integrations, and Claude in Chrome — Production State

**Research date:** 2026-08-15
**Scope:** Claude Code CLI (terminal), VS Code extension, JetBrains plugin, Claude Code on the web/cloud, Claude Desktop, Claude Code on mobile, Claude Agent SDK, and Claude in Chrome (both the standalone extension and the `--chrome` integration inside Claude Code).
**Method:** Official docs at `code.claude.com/docs` (Anthropic's current docs host — `docs.claude.com/en/docs/claude-code/*` now 301-redirects here), `claude.com` marketing pages, `support.claude.com` help center, extension marketplace listings, GitHub issues on `anthropics/claude-code` pulled live via `gh` CLI (real reaction counts, not estimates), and Hacker News via the Algolia search API. Reddit could not be fetched (blocked for this tool). Every claim below is sourced; items I could not confirm are explicitly marked **UNVERIFIED**.
**Version baseline:** Claude Code CLI **v2.1.233** (Aug 14, 2026) is current at research time. VS Code extension marketplace also lists **v2.1.233**. Claude in Chrome extension is at **v1.0.85** (Aug 6, 2026).

---

## 1. Executive summary

Claude Code has grown from a terminal tool into a five-surface product family that all share one session/account layer: **CLI**, **VS Code extension**, **JetBrains plugin (beta)**, **Desktop app** (Chat/Cowork/Code tabs), **Claude Code on the web** (`claude.ai/code`, cloud sandbox), plus **mobile** (iOS/Android, client-only) and **Claude Agent SDK** (TypeScript/Python, for building your own agents). The single biggest change in the last ~10 days before this research date is that **Claude Cowork was merged into the Claude in Chrome extension** (Aug 12–13, 2026): the browser side panel is now a full Cowork session whose history, skills, and connectors sync with desktop/web/mobile, rolled out to Max/Team immediately with Pro "in the coming weeks." Independently, Claude Code shipped a new **`auto` permission mode** as the _built-in default_ starting mode on Pro/Max/Team (a classifier reviews actions instead of prompting you), GitLab merge-request support, self-hosted execution runners, cross-session agent messaging (`SendMessage`/`ListAgents`), and a VS Code "Focus view" that collapses tool-call noise. Community sentiment is split: extremely high adoption (VS Code extension: 23.2M installs; Chrome extension: 13M users) paired with notably mediocre store ratings (VS Code 3.5/5 from 757 reviews; Chrome extension 2.8/5 from ~1.5K ratings) and a long tail of GitHub issues about usage-limit surprises, multi-account support, and terminal rendering bugs.

---

## 2. Claude Code CLI — core surfaces

### 2.1 Terminal UX & interactive mode

- Full-screen/alt-screen rendering mode (`fullscreen`) with its own bug class (dialogs stretching past narrow layouts, jump-to-bottom pill, welcome-banner resize glitches — mostly fixed by v2.1.212–2.1.218). [code.claude.com/docs/en/fullscreen]
- Screen reader mode (`--ax-screen-reader` / `axScreenReader` setting) added v2.1.208, with a steady stream of accessibility fixes through v2.1.233 (numbered-list rendering for `/effort`, deletion announcements, VoiceOver echo fixes, startup announcement timing). [code.claude.com/docs/en/accessibility; docs/en/changelog]
- Voice dictation is a documented, separate feature (`docs/en/voice-dictation.md`) — **UNVERIFIED in depth**, page exists but was not fetched in full.
- Vim mode: `s`/`S` substitute commands, yank-register persistence across dialogs, NORMAL-mode navigation improvements landed through July 2026.
- Emoji shortcode autocomplete (`:heart:` → ❤️) added v2.1.217, toggleable via `emojiCompletionEnabled`.
- Terminal responsiveness was a real problem: v2.1.207–2.1.229 fixed freezing/stalling on very long tables (>200 rows now truncated with a "N more rows" notice), quadratic-cost message normalization causing multi-second stalls on long sessions, and up to 79× transcript-size reduction in edit-heavy sessions via pruned file-history backups. This reads as a genuine multi-month performance push, not a one-off fix.
- Customizable status line (`docs/en/statusline.md`) and rebindable keyboard shortcuts (`docs/en/keybindings.md`) are both first-class, documented surfaces.

### 2.2 Sessions, resume, fork, branch

| Command                          | Behavior                                                                                                                                                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/resume`                        | Interactive picker of past sessions, including deleted ones (from agent view since v2.1.212)                                                                                                                                                   |
| `claude --resume` / `--continue` | CLI-level resume/continue; `--fork-session` branches instead of continuing in place                                                                                                                                                            |
| `/branch [name]`                 | Creates a conversation branch to try a different direction from the same point                                                                                                                                                                 |
| `/fork [prompt]`                 | **Redesigned in v2.1.212**: copies the _entire_ conversation into a new **background** session (its own agent-view row, its own worktree) while you keep working in the foreground. Distinct from the old in-session "subagent fork" behavior. |
| `/subtask`                       | New in v2.1.212, replaces the old in-session subagent launch; hands a side task to a subagent whose result returns into the current conversation.                                                                                              |
| `/clear`                         | Fresh context, keeps project memory; resets session cost counter to $0 and subagent spawn budget (v2.1.211/2.1.212).                                                                                                                           |

Session state is durable: Claude Code keeps checkpoints with the conversation so `/rewind` still works after `/resume`, and background sessions survive machine sleep and terminal closure (not full shutdown). [code.claude.com/docs/en/sessions, /docs/en/agent-view]

### 2.3 Checkpoints (`/rewind`)

Fully documented, mechanically specific system — not a marketing gloss:

- Every user prompt creates a checkpoint; the **100 most recent** checkpoints per session keep file snapshots, older ones pruned (except each file's very first snapshot, retained as the VS Code diff baseline).
- `/rewind`, or **double-`Esc`** on an empty prompt, opens a menu with: Restore code and conversation / Restore conversation / Restore code / Summarize from here / Summarize up to here / Never mind.
- **Known limitations, stated plainly in the docs:** Bash-driven file changes (`rm`, `mv`, `cp` run by Claude) are _not_ tracked or restorable; **subagent edits are not restored** by rewind (only "foreground forked skills" are the exception) — you have to use git; externally-made or concurrent-session edits aren't tracked; symlinked/hard-linked paths are skipped entirely with a `Restored the code, but skipped N files` warning. Explicitly **not a replacement for git**.
- Checkpoints auto-expire with the session after 30 days (`cleanupPeriodDays`).
- The VS Code extension exposes rewind per-message via a hover button with three options: fork-from-here, rewind-code-to-here, fork-and-rewind. [code.claude.com/docs/en/checkpointing; docs/en/vs-code]

### 2.4 Plan mode

Read-only research/propose mode. Claude explores and writes a plan; edits stay blocked until you approve (except in bypass-permissions sessions). Enter with `Shift+Tab` or `/plan`; `Ctrl+G` opens the plan in your default text editor for direct editing before acceptance. Approving offers three exits: **"Yes, and use auto mode"**, **"Yes, manually approve edits"**, or **"No, keep planning."** Accepting a plan also auto-names the session from its content. In auto-mode-eligible sessions, shell commands during planning are reviewed by the classifier rather than individually prompted. [code.claude.com/docs/en/permission-modes]

### 2.5 Permission modes — full picture

Six modes exist: `default` (labeled **Manual** in every UI since v2.1.200), `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions`.

| Mode                | What runs unprompted                                                                                                     | Notes                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `default`/Manual    | Reads only                                                                                                               | Baseline; `manual` is now an accepted CLI alias                                                                          |
| `acceptEdits`       | Reads, file edits, common FS commands (`mkdir`,`touch`,`mv`,`cp`,`sed`, and PowerShell `Set-Content`/`Add-Content`/etc.) | Scoped to working directory + `additionalDirectories`; protected paths still prompt                                      |
| `plan`              | Reads + classifier-approved commands when auto mode is available                                                         | See §2.4                                                                                                                 |
| **`auto`**          | Everything, reviewed by a background classifier model (Sonnet 5 by default) instead of you                               | **Now the built-in default starting mode on Pro/Max/Team** (v2.1.228+ mac/Linux/WSL, v2.1.233+ native Windows)           |
| `dontAsk`           | Only pre-approved (`permissions.allow`) tools + built-in read-only commands                                              | For CI/locked-down environments; explicit asks are auto-_denied_, not prompted                                           |
| `bypassPermissions` | Everything, incl. protected-path writes                                                                                  | `--dangerously-skip-permissions`; refuses to start as root/sudo outside a sandbox; requires a one-time acceptance dialog |

**Auto mode is the headline change of 2026 H1/H2.** It's a second classifier model (defaults to Sonnet 5, falls back to session's model or an Opus model under Fable 5) that reviews every non-trivial action against an extensive, versioned, and startlingly specific default rule set — documented block/allow lists cover: `curl | bash`, force-push, `git reset --hard`, unapproved PR merges, secret-manager writes, DNS/TLS changes, disabling CI checks, opening tunnels/reverse shells, printing live credentials to transcript, routing installs around an internal registry, and even **"sending keystrokes to Claude Code's own tmux pane"** (treated as Claude trying to alter its own oversight). It also explicitly reviews **Claude in Chrome browser actions that could send page content, cookies, or credentials off-origin**. Repeated blocks (3 in a row or 20 total) fall back to prompting. Auto mode requires Sonnet 4.6+/Opus 4.6+ or Fable 5 on the first-party API; older models (Sonnet 4.5, Opus 4.5, Haiku, claude-3) are unsupported on any provider. [code.claude.com/docs/en/permission-modes, /docs/en/auto-mode-config]

**Protected paths** (never auto-approved outside bypass mode): `.git`, `.vscode`, `.idea`, `.claude` (except `.claude/worktrees`), shell rc files, `.npmrc`/`.yarnrc`, `.mcp.json`, `.claude.json`, etc. — a fixed list, not configurable per-project.

### 2.6 Subagents

- Defined as Markdown files with YAML frontmatter in `~/.claude/agents/` (personal) or `.claude/agents/` (project), or shipped inside a plugin's `agents/` directory.
- Frontmatter supports: `tools`/`disallowedTools`, `model` (`sonnet`/`opus`/`haiku`/`fable`/full ID/`inherit`), `permissionMode`, `skills` (preload), `memory` (`user`/`project`/`local` persistent scope), `isolation: worktree`, `maxTurns`, `hooks`, `mcpServers`, `background`, `effort`, `color`.
- **Forking** (`subagent_type: "fork"`) became the **default** in v2.1.232 — a fork inherits the _entire_ parent conversation, tool state, and prompt cache, vs. a fresh-context subagent.
- Limits: spawn depth 3 by default (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`), concurrent cap 20 (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`), per-session spawn cap raised then **removed entirely in v2.1.221** (was 200).
- `isolation: 'worktree'` subagents are hard-blocked from running destructive git against the _main_ checkout, including via `git -C`, `--git-dir`, `GIT_DIR`/`GIT_WORK_TREE` redirection, or `cd`-then-git — this required several hardening passes (v2.1.216, v2.1.222) after real bypasses were found.
- Cross-session messaging (`SendMessage`/`ListAgents`) is new (v2.1.224+): subagents and even separate local Claude Code sessions can message each other by name; auto mode's classifier reviews every such message before delivery.
- Auto mode checks subagents at three points: task description at spawn, each in-flight action, and a full-history review on completion (with a "treat as unreviewed" warning if the review call itself fails). [code.claude.com/docs/en/sub-agents]

### 2.7 Hooks

Deterministic shell-command hooks fired at lifecycle events (`PreToolUse`, `PostToolUse`, `Notification`, `SessionStart`, `Stop`, `WorktreeCreate`/`WorktreeRemove`, and more — full event list in `docs/en/hooks.md`). Configured via a `hooks` block in any settings file; `/hooks` is a **read-only** browser for what's configured (edits happen in JSON or via asking Claude to write them). Notable 2026 additions: prompt-based and agent-based hooks (judgment calls via a Claude model instead of a fixed shell exit code), async/MCP-tool hooks, and a `DirectoryAdded` event firing after `/add-dir`. Security hardening has been a recurring theme: exit-code-2 blocking bugs, `PreToolUse` auto-allow bypasses in background agent tasks, and untrusted-folder agent hooks now requiring workspace trust on the agent file's own folder. [code.claude.com/docs/en/hooks-guide, /docs/en/hooks]

### 2.8 Skills (absorbed custom slash commands)

**Custom commands were merged into skills** at some point before this research date. A flat file at `.claude/commands/deploy.md` and a directory-based `.claude/skills/deploy/SKILL.md` both produce `/deploy` and behave identically — old command files keep working. Skills follow the open **Agent Skills** standard (agentskills.io), with Claude Code extensions for invocation control, subagent execution (`context: fork`), and dynamic context injection (inline `` !`shell command` `` substitution inside the skill body). Skill discovery order: managed → `--agents`-style CLI flag → project → personal → plugin. Bundled skills ship with Claude Code itself (`/doctor`, `/code-review`, `/batch`, `/debug`, `/loop`, `/claude-api`, `/run`, `/verify`, `/run-skill-generator`) and can be globally disabled except `/doctor` via `disableBundledSkills`. Skills synced down from claude.ai are sandboxed further (v2.1.228): they can't shadow local commands/MCP prompts and can't run `!` shell substitution or `@` file expansion. [code.claude.com/docs/en/skills]

### 2.9 Plugins & marketplaces

Plugins package skills, agents, hooks, MCP servers, LSP servers, background "monitors," and default settings into a shareable, versioned unit (`.claude-plugin/plugin.json` manifest). Two official marketplaces: **`claude-plugins-official`** (Anthropic-curated, auto-registered on first interactive launch) and **`claude-community`** (public submissions, reviewed, pinned to commit SHAs, synced nightly). New in the last 6 months: an **`archive` plugin source** (install from a `.zip` over HTTPS with optional SHA-256 pinning, no git/npm needed), **GitLab marketplace support** (bare `gitlab.com` repo URLs clone like GitHub), immediate plugin activation from `/plugin` without restart (v2.1.221), and `claude plugin init` scaffolding for "skills-directory plugins" that auto-load with no marketplace step. Local dev loop: `claude --plugin-dir ./my-plugin` (also accepts a `.zip` or a hosted `--plugin-url`), then `/reload-plugins`. [code.claude.com/docs/en/plugins, /docs/en/discover-plugins]

### 2.10 MCP (Model Context Protocol)

Standard external-tool connectivity (`claude mcp add`, `.mcp.json`, `/mcp` for status/OAuth management). 2026 hardening included: OAuth redirect-URI fixes for pre-registered clients like Slack (v2.1.231), `127.0.0.1`-vs-`localhost` strict-authorization-server fix, macOS keychain-timeout 401s fixed, long-running tool calls (>2 min) now auto-background (`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`), and re-enabled **tool search** for Claude 4.5-generation+ models. Two org-level governance primitives matter for enterprises: connector tools an org sets to `ask` always prompt regardless of allow rules or auto mode, and individual MCP tools can be marked `_meta["anthropic/requiresUserInteraction"]` to force a prompt even under `bypassPermissions` or `dontAsk`. MCP servers can also act as **channels**, pushing external events (Telegram, Discord, webhooks) into a running session. [code.claude.com/docs/en/mcp]

### 2.11 Output styles

A separate, smaller customization layer from CLAUDE.md/skills: output styles rewrite the _system prompt_ itself (role/tone/format), applied every turn, vs. CLAUDE.md which is a user-message injection of project facts. Four built-ins: **Default**, **Proactive** (stronger autonomous execution than auto mode, orthogonal to permission mode), **Explanatory** (adds "Insights"), **Learning** (adds `TODO(human)` markers for you to fill in). Custom styles are Markdown + frontmatter (`keep-coding-instructions: true` to retain Claude Code's built-in engineering behavior). Styles apply to the main conversation only — subagents run their own system prompt and ignore the active style, except forks. [code.claude.com/docs/en/output-styles]

### 2.12 Background tasks & agent view (`claude agents`)

A full multi-session terminal dashboard: dispatch prompts, peek at output (`Space`), attach (`Enter`/`→`), detach (`←`), group by state or directory (`Ctrl+S`), pin (`Ctrl+T`), stop/delete (`Ctrl+X` twice). Sessions are hosted by a per-user **supervisor daemon** (`~/.claude/daemon`) that survives terminal closure and machine sleep (not shutdown), auto-updates to new CLI versions, and isolates file edits into per-session **git worktrees** by default. PR/MR labels show inline (`#1234` GitHub, `!1234` GitLab) with color-coded CI/review status. Filtering syntax in the dispatch box: `a:agent-name`, `s:state`, `#1234`, or a pasted URL. Stated limitation: **10 parallel sessions ≈ 10× rate-limit quota usage** — this is a real cost/throughput ceiling users hit. [code.claude.com/docs/en/agent-view]

### 2.13 Git / PR integration

Handled by ordinary prompting ("commit my changes," "create a PR") plus a dedicated `/commit-push-pr` command and `/code-review`/`/review`/`/ultrareview` for review. `/code-review` was redesigned in mid-2026 to run as a **background subagent**; `ultra` triggers a deep multi-agent cloud review. Auto mode's default-block list is unusually specific about git/PR safety: no auto-merge of a PR nobody approved, no approving your own PR, no disabling CI checks, no `git commit --amend` on a pushed or not-Claude-authored commit, no force-push. GitLab support matured a lot in Aug 2026: merge-request URLs work with `--worktree` and show as `!N` in agent view, `glab` CLI gets the same credential-path sandboxing as `gh`, and a full family of GitLab token prefixes (`glrt-`, `glpat-`, `gldt-`, etc.) get secret-redaction coverage. **Auto-fix PRs** (web/Desktop) watches CI failures and review comments and pushes fixes autonomously, with a documented warning about triggering comment-driven automation (Atlantis, Terraform Cloud) since Claude's replies post under your GitHub identity. [code.claude.com/docs/en/claude-code-on-the-web, /docs/en/changelog]

### 2.14 Worktrees

`claude --worktree <name>` (`-w`) creates an isolated `.claude/worktrees/<name>/` checkout on a new branch and starts Claude there; omitting a name auto-generates one (e.g. `bright-running-fox`). As of v2.1.233, `--worktree` also accepts a **GitHub PR number/URL or GitLab MR URL** directly, fetching the right head ref by host. Isolation is enforced at four levels for a worktree-bound session/subagent: file-edit path checks, command working-directory checks, git-redirect blocking, and a catch-all "command shape" check that refuses shell constructs (brace expansion, unquoted heredocs) it can't statically verify — **this last check cannot be turned off**. `.worktreeinclude` (gitignore syntax) copies untracked files like `.env` into every new worktree. Desktop app worktrees every new session automatically. Non-git VCS support exists via `WorktreeCreate`/`WorktreeRemove` hooks. [code.claude.com/docs/en/worktrees]

### 2.15 Claude Code on the web / cloud sessions (claude.ai/code)

**Research preview** for Pro/Max/Team and Enterprise premium/Chat+Code seats. Runs in an Anthropic-managed isolated VM (or an org's self-hosted environment). Key mechanics:

- `claude --cloud "<task>"` starts a cloud session from the terminal; `--teleport` (or `/teleport`, `/tp`) pulls a cloud session _back_ into your terminal, one-way (you can't push a running terminal session to the web).
- `claude -p "msg" --cloud <session-id>` sends an async follow-up to a running cloud session from _any_ machine you're logged into — genuinely useful for CI scripts.
- GitHub access via either the Claude GitHub App (needed for Auto-fix webhooks) or `/web-setup` syncing your local `gh` token.
- Non-GitHub repos (GitLab, Bitbucket) can be sent as a local bundle (git history + uncommitted tracked changes, ≤100MB) but **can't push results back**.
- Sharing: Team/Enterprise get Private/Team visibility; Pro/Max get Private/Public (**public means visible to any claude.ai user** — the docs explicitly warn to check for credentials before sharing).
- Cloud sessions **cannot** use `bypassPermissions` or `dontAsk` even if your settings file requests it — silently ignored, falls back to the mode shown in the dropdown (Accept edits / Plan / Auto only).
- Rate limits are shared with all other Claude usage on the account — no separate cloud-compute charge, but parallel cloud tasks consume quota proportionately.
- Org **IP allowlisting breaks all Anthropic-hosted cloud sessions** (auth fails) unless Anthropic support carves out an exemption — a real enterprise gotcha. [code.claude.com/docs/en/claude-code-on-the-web]

### 2.16 Claude Agent SDK

Library form of the same agent loop (TypeScript + Python only; other languages must shell out to `claude -p --output-format json`). Distinct from the "Client SDK" (raw API, you write the tool loop) and "Managed Agents" (Anthropic-hosted REST product). Full parity with CLI capabilities: built-in tools, hooks, subagents, MCP, permissions, session persistence/resume/fork, skills/commands/memory auto-loaded from `.claude/`, plugins by local path. Branding rules are strict: partners may say "Claude Agent" or "{YourAgentName} Powered by Claude" but are **explicitly barred** from calling anything "Claude Code" or using Claude Code's visual identity. [code.claude.com/docs/en/agent-sdk/overview]

### 2.17 Usage visibility

`/usage` (alias `/cost`) shows plan, signed-in account, and usage bars for session + week with reset countdowns; it now **attributes usage** to skills, subagents, plugins, and MCP servers individually, and flags any single factor responsible for ≥10% of recent usage (cache misses, long context, subagent-heavy sessions) with a targeted tip. VS Code exposes the same data via `/usage` in the command menu → "Account & usage" dialog with a Day/Week toggle, explicitly caveated as **local-machine-only** (doesn't include other devices or claude.ai usage). `/usage-credits` lets you request additional credits from org admins, with confirmation required over $1,000.

### 2.18 Settings hierarchy

Five layers, in ascending precedence: **Managed** (MDM/server-pushed, `managed-settings.json` at OS-specific system paths) → CLI flags → `.claude/settings.local.json` (gitignored, personal) → `.claude/settings.json` (committed, team-shared) → `~/.claude/settings.json` (personal, all projects) — note managed settings and CLI flags win regardless of file-precedence position. `/config key=value` sets a single option without opening the dialog. `permissions.defaultMode: "auto"` **only takes effect from `~/.claude/settings.json` or managed settings** — setting it in project-level `.claude/settings.json` or `.claude/settings.local.json` is silently ignored (a documented, easy-to-hit footgun). Managed-settings validation is fault-tolerant: invalid entries are stripped with a warning rather than failing the whole config, surfaced via `/doctor`.

### 2.19 CLAUDE.md conventions

Load order (root→working-directory, broadest scope first): **Managed policy** CLAUDE.md (OS-specific system path, cannot be excluded by users) → `~/.claude/CLAUDE.md` (personal, all projects) → `./CLAUDE.md` or `./.claude/CLAUDE.md` (project, shared via git) → `./CLAUDE.local.md` (personal, gitignored). All discovered files up the directory tree from the working directory are **concatenated**, not overridden — files closer to the working directory are read _last_ (highest recency-bias in context). Nested subdirectory CLAUDE.md files load on-demand when Claude reads files there, not at launch. `@path/to/file` import syntax works (4-hop max recursion); an import resolving _outside_ the working directory triggers a one-time approval dialog. **`AGENTS.md` is not read directly** — the documented pattern is `@AGENTS.md` import or a symlink; `/init` and `/import` both know how to pull in AGENTS.md, Cursor rules, and Copilot instructions. Path-scoped `.claude/rules/*.md` (with `paths:` frontmatter glob patterns) let teams scope instructions to file types without bloating the always-loaded CLAUDE.md. Recommended size: **under 200 lines** per file; `/doctor` proposes trims. Separate **auto memory** system (Claude writes its own notes to `~/.claude/projects/<project>/memory/MEMORY.md`, capped at 200 lines/25KB for what loads at session start, with overflow into on-demand topic files) is on by default and distinct from CLAUDE.md. [code.claude.com/docs/en/memory, /docs/en/settings]

### 2.20 Notifications

`Notification` hook event fires when Claude is waiting on input/permission — sample configs given for macOS (`osascript`), Linux (`notify-send`), Windows (PowerShell MessageBox). A real recent bug: notification hooks **weren't firing for permission prompts running under Claude Desktop or VS Code** until fixed in v2.1.233 — i.e., desktop-notification hooks silently didn't work in the two GUI surfaces for some period. Remote Control adds mobile **push notifications** for long-running-task completion or decisions needed, with two dedicated `/config` toggles. [code.claude.com/docs/en/hooks-guide, /docs/en/remote-control]

---

## 3. IDE integrations

### 3.1 VS Code extension — checklist

Marketplace: **23,237,666 installs**, **3.5/5 stars (757 reviews)**, current version **2.1.233** (released Jul 23, 2026), free. Requires VS Code ≥1.94.0 (1.98.0 for some sub-features per a separate source — treat 1.94.0 as authoritative per the official doc). Also installs into Cursor, Devin Desktop, Kiro, and other VS Code forks via Open VSX.

| Capability                                     | State                                                                                                                                                                                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar panel + editor tab + secondary sidebar | Yes — drag the panel anywhere; position is remembered                                                                                                                                                                                                                              |
| Multiple sessions                              | Yes — "Open in New Tab"/"New Window"; sessions groupable into named, collapsible, per-workspace-persisted folders (v2.1.229+)                                                                                                                                                      |
| Diff review                                    | Side-by-side comparison; edit the proposed diff directly before accepting and Claude is told you modified it                                                                                                                                                                       |
| Accept/reject                                  | Per-edit permission prompt in Manual mode; "Edit automatically" mode skips it                                                                                                                                                                                                      |
| @-file + selection context                     | `@file#L1-99` fuzzy-matched mentions; `Option+K`/`Alt+K` inserts a reference for the current selection; selection auto-shared unless hidden via the eye-slash toggle or a `Read` deny rule                                                                                         |
| Terminal-output context                        | `@terminal:name` references a named integrated terminal's output                                                                                                                                                                                                                   |
| Diagnostics                                    | Built-in local `ide` MCP server exposes `mcp__ide__getDiagnostics` (read-only) and, uniquely to VS Code, `mcp__ide__executeCode` for running a cell in the active Jupyter kernel — **always gated by a native VS Code Quick Pick**, independent of any `PreToolUse` hook allowlist |
| Plan review                                    | Plan opens as a full Markdown doc; inline comments give feedback before Claude proceeds                                                                                                                                                                                            |
| Model & effort selector                        | Via the `/` command menu                                                                                                                                                                                                                                                           |
| Checkpoints                                    | Full parity with CLI — hover any message for fork/rewind-code/fork-and-rewind                                                                                                                                                                                                      |
| Keyboard shortcuts                             | `Cmd/Ctrl+Esc` focus toggle, `Cmd/Ctrl+Shift+Esc` new tab, `Cmd/Ctrl+N` new conversation (opt-in), `Cmd/Ctrl+Shift+T` reopen closed session, `Option/Alt+K` insert mention, `Ctrl+Option/Alt+F` Focus view toggle                                                                  |
| Settings                                       | Two tiers — VS Code `claudeCode.*` extension settings vs. shared `~/.claude/settings.json` (hooks, MCP, allow/deny rules apply to both CLI and extension)                                                                                                                          |

**Newer/notable features:** **Focus view** (v2.1.221) collapses tool calls/results/thinking behind expandable rows, leaving prompts+responses+live to-do list visible — toggle `Ctrl+Alt+F`. **Session groups** (v2.1.229). **Resume cloud sessions from claude.ai** directly in the "Web" tab of session history (download-and-continue locally; not bidirectionally synced). A `vscode://anthropic.claude-code/open` URI handler for launching prefilled/resumed sessions from external tooling. Chrome browser automation reachable via `@browser` in the prompt box (requires Claude in Chrome extension ≥1.0.36).

**What's _not_ in the extension** (CLI-only): the full skill/command catalog (extension shows a subset), full MCP config editing (add via CLI `claude mcp add`, manage existing via `/mcp`), the `!` bash shortcut, and tab completion. Installing the extension does **not** put `claude` on PATH — it bundles a private CLI copy just for its own chat panel; the standalone CLI install is still required for terminal use. [code.claude.com/docs/en/vs-code; marketplace.visualstudio.com/items?itemName=Anthropic.claude-code]

### 3.2 JetBrains plugin — checklist and gaps vs. VS Code

**Beta** status, distributed as "Claude Code \[Beta]" on JetBrains Marketplace (plugin ID 27310). Supports IntelliJ IDEA, PyCharm, Android Studio, WebStorm, PhpStorm, GoLand and most other JetBrains IDEs. **This plugin does not bundle its own CLI** — it launches the standalone `claude` binary inside the IDE's integrated terminal, so the CLI install is mandatory (not optional as in VS Code, where a bundled copy exists for the panel).

| Capability                  | VS Code                                   | JetBrains                                                                                                                | Gap                                                                                                                                                              |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native GUI chat panel       | Yes                                       | **No** — plugin runs Claude _inside the IDE terminal_; UX is the CLI's TUI, not a graphical panel                        | JetBrains has no chat-panel equivalent; separate third-party GUI plugins exist unofficially (e.g. "Claude Code with GUI" on Marketplace) but are not Anthropic's |
| Diff viewing                | Native side-by-side, editable             | Opens in IDE's native diff viewer (toggle via `/config` → Diff tool)                                                     | Functional parity for diffs specifically                                                                                                                         |
| Selection/open-file context | Automatic                                 | Automatic (same mechanism)                                                                                               | Parity                                                                                                                                                           |
| File-reference shortcut     | `Option+K`/`Alt+K`                        | `Cmd+Option+K` (Mac) / `Ctrl+Alt+K` (Win/Linux)                                                                          | Different keybind, same feature                                                                                                                                  |
| Diagnostics sharing         | `mcp__ide__getDiagnostics`                | Same tool, same read-only scope                                                                                          | Parity                                                                                                                                                           |
| Jupyter cell execution      | `mcp__ide__executeCode`, Quick-Pick gated | **Not exposed** — "The JetBrains plugin does not expose a code-execution tool to the model"                              | JetBrains-specific gap                                                                                                                                           |
| Quick launch                | Spark icon / status bar / Command Palette | `Cmd+Esc`/`Ctrl+Esc` or a UI button                                                                                      | Parity, different chrome                                                                                                                                         |
| Multiple sessions/tabs      | Native tabs/windows                       | Uses IDE terminal tabs (no dedicated session list UI)                                                                    | JetBrains lacks VS Code's Activity Bar session list and session grouping                                                                                         |
| Focus view                  | Yes (v2.1.221+)                           | **Not mentioned in JetBrains docs**                                                                                      | Likely VS Code-only                                                                                                                                              |
| Remote Development          | N/A (VS Code Remote works transparently)  | Must install the plugin on the **remote host**, not the local client — a documented gotcha                               | JetBrains-specific setup step                                                                                                                                    |
| WSL                         | Works                                     | Needs explicit Windows Firewall rule or mirrored networking (`.wslconfig`) for the IDE MCP socket to reach WSL2 over NAT | JetBrains-specific, well-documented workaround                                                                                                                   |

**Security note called out specifically for JetBrains, not VS Code:** in `acceptEdits` mode, Claude can modify IDE configuration files (run/debug configs) that JetBrains may execute automatically, "which may increase the risk of running Claude Code in `acceptEdits` mode and allow bypassing Claude Code's permission prompts for bash execution" — the docs recommend Manual mode for edits specifically in JetBrains.

The IDE MCP server internals are near-identical between the two plugins (ephemeral loopback port, unencrypted `ws://` justified as loopback-only, per-launch random token in a `0600` lock file at `~/.claude/ide/<port>.lock`, `ide` server hidden from `/mcp`) — this is genuinely the _same_ protocol, just fewer exposed tools on JetBrains (1 vs. 2). [code.claude.com/docs/en/jetbrains; plugins.jetbrains.com/plugin/27310-claude-code-beta-]

A companion "Claude Code Usage" plugin (ID 29946) and an unofficial "Claude Code with GUI" plugin (ID 30313) exist separately on the Marketplace, evidence that a first-party graphical JetBrains panel is a gap the community is trying to fill. **UNVERIFIED**: exact JetBrains Marketplace install/rating numbers — the fetch did not return them.

---

## 4. Claude in Chrome

There are **two distinct integration points** that share one browser extension:

1. **The standalone Claude in Chrome extension** — a general-purpose browser agent reachable from the extension's side panel, from Claude Desktop (as a connector), and from Claude Code (`--chrome`).
2. **Claude Code's `--chrome` flag** — Claude Code driving that same extension for build→test→debug loops.

### 4.1 What it is / where it lives

Chrome Web Store extension ID `fcoeoabgfenejglbffodgkkbkcdhcgfn`. **13,000,000 users**, **2.8/5 stars** (~1.5K ratings), current version **1.0.85** (Aug 6, 2026). Requires a **paid** Claude plan (Pro, Max, Team, Enterprise) — free-tier users hit an "upgrade now" wall. [claude.com/claude-in-chrome; Chrome Web Store listing]

### 4.2 The Aug 2026 change: Cowork merges into the Chrome side panel

As of **Aug 12–13, 2026** (within 3 days of this research date), Anthropic shipped **Claude Cowork inside the Chrome extension's side panel**: it is now a full Cowork session rather than an isolated browser-only chat. Concretely:

- Conversations started in the Chrome panel now save into your unified Claude history and can be **resumed on desktop, web, or mobile**.
- Skills and connectors configured elsewhere in your account work automatically inside the browser session.
- A task can start in Chrome (e.g., pulling invoice data from several vendor portals) and continue on Desktop to incorporate local files.
- **Rollout gating:** Max and Team subscribers got it immediately; **Pro is rolling out "in the coming weeks"** (i.e., not yet universal at research date). Enterprise admins can restrict it to approved domains.
- Anthropic's own framing is candid about risk: "Browser agents remain vulnerable to prompt injection," and the mitigations (separate review for consequential actions, required approval for purchases/personal-data sharing) explicitly "cannot eliminate" it.
- **Chrome-only** — other Chromium browsers and mobile are not yet supported for this _specific_ Cowork-merge feature (separately, the plain browser-automation extension itself does work in Edge, Brave, Arc, Vivaldi, Opera — see §4.5). [9to5mac.com/2026/08/12/claude-cowork-chrome; engadget.com/2235919/claude-cowork-can-now-run-in-a-chrome-sidebar; the-decoder.com/anthropic-brings-claude-cowork-to-its-chrome-extension-adding-skills-and-plugins-to-the-browser]

### 4.3 Core capabilities (standalone extension, per support.claude.com and claude.com)

- **DOM/page reading**: reads signed-in pages directly (no screenshot-only fallback needed for most sites).
- **Click/type/scroll/navigate**: full interaction, described as clicking, typing, and filling forms "while you decide what happens next."
- **Multi-tab management**: drag tabs into a Claude-managed tab group to operate on several simultaneously.
- **Console/network reading**: reads console errors and network requests for debugging.
- **Scheduled tasks**: recurring workflows on daily/weekly/monthly/annual cadence.
- **Workflow recording** ("classic panel"): teach Claude a procedure by demonstrating it once.
- **1Password integration**: biometric approval of logins; Claude reportedly never sees the actual password.
- **Background workflows**: tasks continue after you switch tabs away.
- **Image/file uploads to forms**: attach local files to web upload fields.
- **Saved shortcuts**: reusable prompts invoked with `/`.
- **Built-in navigation knowledge** for Slack, Gmail, Google Calendar, GitHub, Google Docs specifically named as pre-optimized targets. [support.claude.com/en/articles/12012173-getting-started-with-claude-in-chrome]

### 4.4 Permissions, site allowlists, approval boundaries (installation-level)

Chrome permissions requested at install: **Scripting** (read page text), **Debugger** (click/type/screenshot — this is the CDP-level control surface), tabs/tab-groups, storage, notifications, downloads. Team/Enterprise admins get org-wide **enable/disable** plus **site allowlist/blocklist** controls (`support.claude.com/en/articles/13065128-claude-in-chrome-admin-controls`, referenced but not independently fetched — **treat detail below this citation as secondary-sourced**). Claude Desktop's own Browser pane explicitly **reuses the same allowlist/blocklist** configured for the extension, and adds two Desktop-specific managed settings: `browserExternalPageTools` (disable Claude's tools on external pages while still letting the user navigate) and `disableBrowserExternalNavigation` (block all external navigation outright, localhost/file-preview still works). [code.claude.com/docs/en/desktop]

### 4.5 Claude Code's `--chrome` integration (separate from the panel product)

- `claude --chrome` (or `/chrome` mid-session, or the VS Code `@browser` mention) connects Claude Code itself to the extension for build-test-debug loops.
- Requires: Google Chrome, Edge, or another Chromium browser (Brave, Arc, Vivaldi, Opera all explicitly supported by auto-detection); extension **≥1.0.36**; a **direct Anthropic plan** (Pro/Max/Team/Enterprise) — **not available through Bedrock, Google Cloud's Agent Platform, or Microsoft Foundry**, and **not usable with API-key or long-lived-token auth** even on a first-party account (silently disabled pre-v2.1.216, hard 403 after).
- **Not supported inside WSL.**
- Browser actions run in a **visible** Chrome window in real time — no headless mode; Claude pauses and hands control back to you on login pages/CAPTCHAs.
- **In plan mode specifically**, read-only browser calls (`read_page`, `get_page_text`, `find`, reading console/network, screenshots) run unprompted; state-changing calls (click, type, navigate, tab/window management, GIF recording) prompt for approval — and a nominally read-only call that sets a state-changing flag (e.g. `save_to_disk` on a screenshot) also prompts.
- **File uploads from Claude Code to a web form**: capped at 10MB total per upload, blocked for files with multiple hard links (common inside `node_modules`), and gated by the session's own `Read` permission on that file.
- **Session-recording as GIF** is a documented capability, with an explicit warning that the recording captures everything visible on screen including account details on logged-in pages.
- Auto mode (§2.5) treats "Claude in Chrome browser actions that could send page content, cookies, or credentials off-origin" as **blocked by default**, and treats navigation to a trusted internal domain/localhost/named URL as **allowed by default** — i.e., the classifier applies its full rule set to browser actions too, not just shell/git.
- Native-messaging-host architecture: a per-OS config file (e.g. `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.anthropic.claude_code_browser_extension.json` on macOS) bridges the CLI process to the extension; Chrome only reads it at Chrome startup, so first-connection failures often need a Chrome restart. [code.claude.com/docs/en/chrome]

### 4.6 Prompt-injection defenses (stated architecture)

Layered, and explicitly **not claimed to be complete**:

1. A **separate safety-classifier review** before consequential actions (same family of classifier that powers auto mode).
2. **Per-site permission approval** — first action on a domain shows a card (Allow once / Always allow / Deny); subdomains need separate approval.
3. **Sensitive-action floor**: financial transactions, account creation, and CAPTCHA-bypass attempts are refused even on an "always allow" site, requiring explicit user input every time.
4. Auto mode's server-side probe additionally "scans incoming tool results and flags suspicious content before Claude reads it" for the CLI/agent side generally.

Anthropic's own language: defenses "have been tested against real attacks" but "aren't foolproof," and explicit guidance to avoid banking/health-record/credential-bearing workflows. [claude.com/claude-in-chrome; code.claude.com/docs/en/desktop; code.claude.com/docs/en/permission-modes]

### 4.7 Incognito restrictions

**UNVERIFIED.** Neither the official Chrome-integration docs, the support-center summary, nor the Chrome Web Store listing text surfaced in this research explicitly states incognito-mode behavior (allowed, blocked, or requires a separate toggle — which is itself a standard Chrome extension setting, "Allow in Incognito," but whether Claude functions correctly there was not confirmed). Flag as a gap to verify directly against the extension's `chrome://extensions` detail page or support docs if this matters for the comparison.

### 4.8 Handoff to desktop / other surfaces

- Chrome panel ↔ Desktop/Web/Mobile: now bidirectional via the Cowork merge (§4.2) — this is new.
- Claude Desktop has its **own** in-app Browser pane (Cmd/Ctrl+Shift+B), separate from the Chrome extension: it runs on a **clean, separate browser profile with none of your logins**, explicitly recommended for building/testing rather than acting as you. When Claude needs to act _as you_ in logged-in sessions, the docs explicitly say to use the Chrome extension instead. This is a deliberate two-tool split (clean sandbox vs. authenticated agent), not a redundancy.
- Claude Code CLI → Chrome is one integration surface; Claude Desktop → Chrome connector is a second, separate one; VS Code's `@browser` is a third front-end onto the same extension. All three share the one extension install and its permission state. [code.claude.com/docs/en/desktop, /docs/en/chrome, /docs/en/vs-code]

### 4.9 Availability / tier gating summary

| Surface                                                               | Minimum plan                                          | Notes                                                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Claude in Chrome extension (any use)                                  | Pro, Max, Team, Enterprise (paid)                     | Free tier blocked at install/use                                                                         |
| Cowork-in-Chrome (side panel history sync, cross-device continuation) | Max, Team now; **Pro rolling out** as of Aug 12, 2026 | Not yet universal                                                                                        |
| Claude Code `--chrome`                                                | Direct Anthropic account (Pro/Max/Team/Enterprise)    | Not available via Bedrock/Vertex/Foundry; not available with API-key-only auth even on a qualifying plan |
| Admin site allowlist/blocklist, org enable/disable                    | Team, Enterprise                                      |                                                                                                          |

---

## 5. Claude Code on the web / cloud sandbox — additional notes

Covered in depth in §2.15. Additional cross-cutting points relevant to competitive comparison:

- **Mobile app is a client only**, not a separate runtime: the iOS/Android Claude app's "Code" tab reaches (a) cloud sessions, (b) a local machine via **Remote Control**, or (c) the Desktop app via **Dispatch** — three different backends behind one UI. Bypass-permissions and `dontAsk` are unreachable from mobile in all three cases. [code.claude.com/docs/en/mobile]
- **Remote Control** (distinct from cloud sessions) keeps execution and filesystem access **entirely local** while letting you drive/monitor from claude.ai/code or the mobile app — useful when the task needs local MCP servers or tools cloud sandboxes don't have. Reconnects automatically after sleep/network loss, queues subagent/workflow status updates during the gap. Requires claude.ai login (no API keys), and is explicitly disabled behind Bedrock/Vertex/Foundry or any non-default `ANTHROPIC_BASE_URL`. [code.claude.com/docs/en/remote-control]
- **Desktop ↔ CLI/Web handoff**: Desktop has a "Continue in" menu to push a local session to the web; the reverse (web → Desktop) isn't described as a menu action but cloud sessions are reachable from Desktop's own Cloud environment option. Desktop's Code tab additionally offers panes the other surfaces don't: integrated terminal, file editor, live app-preview browser pane with auto-verification (screenshots, DOM inspection, form-filling to self-check its own changes), iOS Simulator pane, and PR CI-status monitoring with auto-fix/auto-merge toggles. [code.claude.com/docs/en/desktop]

---

## 6. What's genuinely new in the last ~6 months (Feb–Aug 2026)

Condensed from the full changelog (`code.claude.com/docs/en/changelog`), organized by user-facing significance:

- **Auto mode became the default permission mode** for Pro/Max/Team terminal and VS Code sessions (v2.1.228+/v2.1.233 native Windows) — arguably the single biggest UX shift of the period, moving the median user from "approve every action" to "classifier reviews, you're notified on blocks."
- **Claude Opus 5** shipped as the new default Opus model (1M context, fast mode $10/$50 per Mtok) — v2.1.219, Jul 24, 2026.
- **Self-hosted execution runners** (`claude self-hosted-runner`) — Team/Enterprise can turn their own machines/containers into Claude Code execution environments, v2.1.224.
- **Cross-session messaging** (`SendMessage`/`ListAgents`) — subagents and sibling local sessions can talk to each other, v2.1.224+.
- **`/fork` redesign + `/subtask`** — split what used to be one overloaded "subagent" concept into an explicit background-session fork vs. an in-conversation delegated subtask, v2.1.212.
- **GitLab first-class support** — merge requests in `--worktree` and agent view, marketplace GitLab sources, full GitLab token redaction, v2.1.232–233.
- **Focus view** in VS Code — collapses tool-call noise, v2.1.221.
- **Claude Cowork merges into Claude in Chrome** — see §4.2, Aug 12-13, 2026, the most recent change captured in this research.
- **Screen reader mode** and a steady cadence of accessibility fixes, v2.1.208 onward.
- **Performance**: up to 79× transcript-size reduction, quadratic-cost message-normalization fix, ~7MB binary/startup-memory reduction, ~400MB peak reduction in auto-update memory — a genuine multi-release performance-hardening arc, not one patch.
- **Session groups** in VS Code (v2.1.229), plugin `.zip`/`archive` install source (v2.1.224), immediate plugin activation without restart (v2.1.221).

## 7. What recently regressed / known rough edges

- **Notification hooks silently not firing under Claude Desktop or VS Code** — a real regression class only fixed in the very latest release (v2.1.233), meaning for some prior window, desktop-notification hooks (a commonly-recommended first hook in the docs' own tutorial) simply didn't work in two of the five surfaces.
- **Usage-limit surprises**: multiple high-reaction, still-open GitHub issues (`#16157`, 693 👍; `#38335`, 474 👍, `CONFUSED:42`) report Max-plan users hitting session/usage limits abnormally fast, one explicitly dated "since March 23, 2026" — suggests a metering change around that date that the community didn't get a clear explanation for. Also `#46917` (215 👍): "CC v2.1.100+ inflates `cache_creation` by ~20K tokens vs v2.1.98 — same payload, server-side," a token-accounting regression report.
- **Auto mode's classifier itself can be the failure mode**: the docs dedicate a whole troubleshooting section to "the classifier cannot determine the safety of an action," which on Bedrock specifically "can repeat until your account can invoke the named [classifier] model" — i.e., a provider-specific model-access gap can make auto mode degrade into a stuck state rather than falling back cleanly.
- **Cowork VM-mode 10GB bundle performance issue**: `#22543` (218 👍, labeled `high-priority`/`oncall`/`performance` by maintainers) — "Cowork feature creates 10GB VM bundle that severely degrades performance," still open at research date.
- **Bash `cd`-vs-real-command permission-prompt confusion**: `#28240` (205 👍) — permission prompt incorrectly triggers on `cd` instead of the actual command in compound bash statements; changelog shows repeated related fixes through v2.1.233 ("`/background`: Fixed repeatedly stopping for approval on ordinary `cd <dir> && <command> > file`"), suggesting this class of bug recurred across releases rather than being fixed once.
- **Terminal rendering**: two long-standing, still-open high-reaction bugs — console/terminal flickering (`#769`, 300 👍; `#1913`, 321 👍) and clipboard copy/paste bringing in unwanted indentation/trailing whitespace (`#18170`, 286 👍) — both read as chronic annoyances rather than one-off regressions.

## 8. Loudest community complaints / requests (verified via GitHub `gh` CLI, live reaction counts, 2026-08-15)

| #          | Title                                                                 | 👍        | Status                              | Theme                                                                                                                                                                                    |
| ---------- | --------------------------------------------------------------------- | --------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6235       | Feature Request: Support AGENTS.md                                    | 4,567     | open                                | Cross-tool config standard (Claude Code now supports via `@AGENTS.md` import, but the issue predates and outlives that workaround)                                                       |
| 45596      | "Bring Back Buddy — A Consolidated Plea from the Community"           | 1,168     | marked duplicate                    | A removed feature the community wants restored — **could not identify what "Buddy" refers to**; flagging as **UNVERIFIED/needs follow-up**, not confidently explained by any doc fetched |
| 34229      | [BUG] Phone verification                                              | 821       | labeled `invalid` by maintainers    | Onboarding friction                                                                                                                                                                      |
| 18435      | [FEATURE] Multi-account switching in Desktop                          | 729       | open                                | Desktop can't juggle multiple Claude accounts/profiles                                                                                                                                   |
| 826        | [BUG] Console scrolls to top when Claude adds text (macOS)            | 691       | `duplicate`, `oncall`               | Long-standing terminal rendering bug                                                                                                                                                     |
| 16157      | [BUG] Instantly hitting usage limits with Max subscription            | 693       | `oncall`/critical                   | Billing/rate-limit trust issue                                                                                                                                                           |
| 36151      | [FEATURE] Multi-account switching, Mobile                             | 592       | labeled `invalid`                   | Same multi-account theme, mobile side                                                                                                                                                    |
| 17432      | Feature Request: India-specific (INR) pricing                         | 486       | open                                | Regional pricing gap                                                                                                                                                                     |
| 38335      | [BUG] Max session limits exhausted abnormally fast since Mar 23, 2026 | 474       | labeled `invalid`                   | Usage-metering trust issue, unresolved per maintainers' own labeling                                                                                                                     |
| 31005/1455 | AGENTS.md / XDG Base Directory support                                | 310 / 418 | open                                | Standards-compliance asks                                                                                                                                                                |
| 22543      | Cowork 10GB VM bundle degrades performance                            | 218       | `high-priority`,`oncall`            | Cowork/cloud sandbox weight                                                                                                                                                              |
| 33932      | [FEATURE] VS Code diff review UI like GitHub Copilot Edits Review     | 173       | open                                | UX parity ask vs. a specific competitor                                                                                                                                                  |
| 30154      | [FEATURE] Multi-window support in Desktop                             | 220       | open                                | Desktop UX gap                                                                                                                                                                           |
| 37323      | Support `/btw` in VS Code extension                                   | 164       | open                                | Feature-parity gap between CLI and extension                                                                                                                                             |
| 50246      | Message-queue mode (queue instead of interrupt)                       | 195       | open                                | Interaction-model request                                                                                                                                                                |
| 24726      | VS Code: setting to disable auto-attach of open file/selection        | 209       | open                                | Context-injection annoyance                                                                                                                                                              |
| 28240      | Permission prompt triggers on `cd` not the real command               | 205       | open (recurring fixes in changelog) | see §7                                                                                                                                                                                   |
| 13354      | Continue when session limit reached                                   | 197       | open                                | Usage-limit UX                                                                                                                                                                           |

**Notably**, several of the highest-reaction "bugs" (`#34229`, `#36151`, `#38335`) are labeled `invalid` by maintainers despite hundreds of 👍 — a signal of user-perceived vs. maintainer-classified severity mismatch worth flagging in any parity narrative rather than taking reaction counts at face value.

### Hacker News signal (Algolia search, 2026-08-15; titles as returned, **not independently re-verified against live HN** beyond the API response — treat point/comment counts as approximate)

- "Claude Code is steganographically marking requests" — 2,445 pts / 750 comments. **UNVERIFIED claim**, could not corroborate the underlying allegation from any official source in this research pass; flag for direct follow-up before repeating externally.
- "Claude Code's source code has been leaked via a map file in their NPM registry" — 2,095 pts / 1,022 comments, plus a follow-up "undercover mode" analysis piece at 1,376 pts.
- "Issue: Claude Code is unusable for complex engineering tasks with Feb updates" — 1,364 pts / 753 comments — a capability-regression complaint tied to a specific Feb 2026 update window.
- "Claude Code is being dumbed down?" — 1,085 pts / 701 comments — recurring "quality got worse" sentiment thread, a common pattern across LLM coding tools but notable for volume here.
- **The "OpenClaw" controversy** (multiple corroborating outlets — TechCrunch, VentureBeat, Axios, TheNextWeb, all independently found): Anthropic blocked, then partially reinstated, use of a third-party CLI/agent tool called OpenClaw against Claude subscriptions in a cost-control move (~Apr 2026), including a temporary ban of its creator's account and a later carve-out for "non-interactive use." This is a **subscription/ToS policy story, not a Claude Code product-surface story**, but it's the largest single community-attention event touching Claude Code usage rights in the period and worth knowing as context. [techcrunch.com/2026/04/10; venturebeat.com; docs.openclaw.ai/providers/anthropic]

## 9. Features that are easy to miss / hard to discover

- **`--forward-subagent-text`**: streams subagent thinking/text into `stream-json` output — not discoverable without reading CLI reference or headless docs.
- **`claude auto-mode defaults`**: prints the _entire_ auto-mode allow/block rule set as JSON — the only way to get the ground truth rather than trusting the prose docs, and not mentioned anywhere except deep in `permission-modes.md`.
- **`.worktreeinclude`**: gitignore-syntax file that solves the extremely common "my `.env` isn't in the new worktree" problem — undocumented outside the worktrees page itself.
- **`CCR_FORCE_BUNDLE=1`**: forces the local-repo-bundle upload path for cloud sessions even when GitHub is connected — an escape hatch for private/complex repo setups.
- **`/doctor`'s CLAUDE.md-trimming proposal**: actively suggests deleting content Claude can already derive from the codebase (directory layouts, dependency lists) — most teams writing CLAUDE.md by hand won't know this exists.
- **The VS Code `ide` MCP server's Jupyter `executeCode` tool**: a genuinely different code-execution surface from anything in the CLI, gated by a native Quick Pick that's separate from (and stricter than) any `PreToolUse` hook allowlist — easy to miss because the server is deliberately hidden from `/mcp`.
- **`claude --cloud <session-id>` fire-and-forget messaging**: lets a CI script or a different machine push a follow-up into a running cloud session without any local session state — buried in the "on the web" doc, not the CLI reference.
- **Managed `claudeMd` key**: lets an org embed CLAUDE.md _content_ directly inside `managed-settings.json` instead of deploying a separate file — a deployment simplification most admin docs skimmers would miss.
- **Auto mode's "boundaries you state in conversation"**: telling Claude "don't push" or "wait for my review" in plain chat is treated as a _hard block signal_ by the classifier, but it's re-derived from the transcript each check and can be lost to context compaction — a subtlety with real safety implications that isn't visible from the UI at all.

---

## Sources

**Official Anthropic documentation** (all under `code.claude.com/docs/en/`, fetched 2026-08-15; `docs.claude.com/en/docs/claude-code/*` 301-redirects to this host):

- `/changelog` — full Feb–Aug 2026 release history (checkpoints, plan mode, subagents, hooks, skills, plugins, MCP, output styles, slash commands, background tasks, git/PR, worktrees, web/cloud, sandboxing, IDE integrations, model/provider support)
- `/overview`, `llms.txt` (227-page doc site map)
- `/vs-code` — VS Code extension full reference
- `/jetbrains` — JetBrains plugin full reference
- `/checkpointing` — `/rewind` mechanics and limitations
- `/permission-modes` — all six permission modes, auto mode's full classifier rule set, protected paths
- `/sub-agents` — subagent frontmatter, forking, limits, isolation
- `/hooks-guide`, `/hooks` — hook events, setup, security
- `/skills` — Agent Skills standard, bundled skills, plugin skills
- `/plugins`, `/discover-plugins` — plugin structure, marketplaces, submission process
- `/mcp` — MCP transports, OAuth, org controls, `requiresUserInteraction`
- `/commands` — full built-in command/skill reference table
- `/agent-view` — background sessions, supervisor daemon, worktree isolation
- `/claude-code-on-the-web` — cloud sessions, `--cloud`/`--teleport`, sharing, security/isolation, limitations
- `/mobile` — Claude app iOS/Android, cloud sessions vs. Remote Control vs. Dispatch
- `/desktop` — Desktop app Code tab, Browser pane, permission modes, PR monitoring, worktree parallelism
- `/chrome` — Claude Code's `--chrome` integration, capabilities, prerequisites, plan-mode browser-tool behavior, troubleshooting
- `/worktrees` — `--worktree` flag, isolation enforcement, `.worktreeinclude`, GitLab MR support
- `/memory` — CLAUDE.md hierarchy, auto memory, AGENTS.md interop, `.claude/rules/`
- `/output-styles` — built-in styles, custom style frontmatter, comparison table
- `/agent-sdk/overview` — Agent SDK capabilities, branding rules, licensing
- `/remote-control` — Remote Control setup, requirements, connection modes
- `/settings` (via secondary summarization) — settings hierarchy, precedence

**Marketing/support pages:**

- `claude.com/claude-in-chrome` — Claude in Chrome product page, safety framing, availability
- `support.claude.com/en/articles/12012173-getting-started-with-claude-in-chrome` — feature/shortcut/permission detail

**Marketplace listings:**

- `marketplace.visualstudio.com/items?itemName=Anthropic.claude-code` — 23.2M installs, 3.5/5 (757 reviews), v2.1.233
- Chrome Web Store, extension ID `fcoeoabgfenejglbffodgkkbkcdhcgfn` — 13M users, 2.8/5 (~1.5K ratings), v1.0.85
- `plugins.jetbrains.com/plugin/27310-claude-code-beta-` — plugin existence/beta status confirmed; download/rating numbers **not** retrieved

**News coverage of the Aug 2026 Chrome/Cowork merge:**

- `9to5mac.com/2026/08/12/claude-cowork-chrome/`
- `engadget.com/2235919/claude-cowork-can-now-run-in-a-chrome-sidebar/`
- `techbriefly.com/2026/08/13/claude-cowork-chrome-extension/`
- `thenewstack.io/claude-chrome-cowork-sessions/`
- `the-decoder.com/anthropic-brings-claude-cowork-to-its-chrome-extension-adding-skills-and-plugins-to-the-browser/`

**Community/complaint signal:**

- `github.com/anthropics/claude-code` issues, queried live via `gh issue list --search "sort:reactions-desc"` (real reaction counts, labels, and status as of 2026-08-15)
- Hacker News via `hn.algolia.com/api/v1/search` (story titles/points/comments as returned by the API; content of linked stories not independently re-verified)
- Coverage of the "OpenClaw" Anthropic subscription-policy controversy: `techcrunch.com/2026/04/10/anthropic-temporarily-banned-openclaws-creator-from-accessing-claude/`, `venturebeat.com/technology/anthropic-reinstates-openclaw-and-third-party-agent-usage-on-claude-subscriptions-with-a-catch`, `docs.openclaw.ai/providers/anthropic`, `thenextweb.com/news/anthropic-openclaw-claude-subscription-ban-cost`, `axios.com/2026/03/23/openclaw-agents-nvidia-anthropic-perplexity`

**Explicitly unable to fetch:** `reddit.com` and `old.reddit.com` (tool-blocked for this domain) — no Reddit-sourced claims appear in this report.
