---
id: "DOC-50-competitors-data-lists-to-read-partial-cli"
type: "comparison-data"
title: "partial cli"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
## CLI (370)

**Account and sign-in** (8)
- CP1 Auth status showing expiry ★: Gives no warning before sign-in ends and no JSON
- CP2 Long-lived token or API key for CI and scripts ★: It is a session token, not a long-lived CI token, and agi keys create only opens account settings (lib.rs:2229-223
- CP3 Sign in to a remote MCP server from the shell ★: No fixed callback port or pre-registered client options
- CP4 Choose where login credentials are stored (ChatGPT): No auto or in-memory setting
- CP5 Free plan can use the CLI (ChatGPT): Cloud in the CLI needs Pro or higher, so Free and Basic cannot use it: like Claude, unlike Codex which lets Free and Go…
- CP6 Import setup and chats from another agent CLI (ChatGPT): It does not import past chats
- CP7 Several accounts side by side with separate config folders (Claude): Ours moves the config folder with AGIWORKFORCE_HOME, but sign-in lives in the OS keyring under one service name
- CP8 Sign out one CLI sign-in from the account's device list without signing out everywhere (Claude): The CLI cannot sign another device out and agi logout only clears this machine

**Plans, billing and usage** (5)
- CP9 Estimated number of messages per five-hour window by model (ChatGPT): /usage shows credits used, left and reset time for each window, not message-count estimates per model
- CP10 Slash command /rate-limit-options: Prints advice on fallback models and /fast, with no live limit data
- CP11 Status line shows session cost and context window usage (Claude): Has no session duration and no user script that receives the data
- CP12 Ultrafast mode that trades extra usage for speed (ChatGPT): There is no tier-gated higher-speed level
- CP13 Usage broken down by skill, subagent, plugin and MCP server (Claude): It does not split by skill, subagent, plugin or MCP server

**Home and navigation** (1)
- CP14 Custom status line from your own script (Claude): No user script or JSON feed

**Composer and input** (12)
- CP15 Vim editing mode for the prompt ★: The full-screen composer has none
- CP16 Keys to toggle thinking and fast mode, open the model picker (Claude): No thinking or fast-mode toggle keys
- CP17 New line without sending (Ctrl+J, Alt/Shift+Enter) (Claude): Shift+Enter only works where the terminal reports it, and backslash+Enter is not handled
- CP18 Prompt history recall with Up and Down (Claude): In one global history file, not per working folder
- CP19 Prompt prefixes: / ! @ : ? (Claude): No emoji or ? shortcut found
- CP20 Push-to-talk voice dictation (Claude): It is a command, not a Space hold-to-talk key
- CP21 Queue a message while the agent works (Claude): There is no send-now key
- CP22 Raw output mode and paste-burst setting (ChatGPT): There is no always-raw mode
- CP23 Rebindable actions across contexts (chat, select, transcript, diff, voice and more) (Claude): Seven global actions can be rebound in config (quit, cycle_mode, cycle_model, redraw, clear_chat, clear_input, open_pal…
- CP24 Stash the current draft (Ctrl+S) (Claude): No stash key
- CP25 Stop all background subagents (Ctrl+X Ctrl+K) (Claude): No single key chord
- CP26 Toggle verbose transcript and tool output (Claude): No separate transcript viewer mode

**Conversations and message actions** (8)
- CP27 Steer or queue a message while a turn is running ★: It cannot steer the running turn and Up does not pull queued text back (a stop returns it to the composer)
- CP28 Name a session when starting it: The value is kept in memory only (apps/cli/src/agent/mod.rs:340), never written as the session title, and resolution ne…
- CP29 Session picker: preview, scope widening, search by PR link, rename key (Claude): It has no preview, no worktree or project scope switch and no search by pull request link
- CP30 Slash command /rename: It cannot rename the current session without its id, which is what Claude /rename does
- CP31 Slash command /reset (alias of /clear) (Claude): /reset is not accepted
- CP32 Slash command /tag: Sets the session's name in memory and shows it; /rename is the one that saves a name
- CP33 Terminal title follows the conversation (Claude): It is not written from the conversation
- CP34 Transcript mode with search, scroll keys and Jump to bottom (Claude): There is no separate transcript mode with search keys

**Models and reasoning** (9)
- CP35 1M-token context window on models that support it, with opt-in or opt-out ★: The user cannot opt into a larger or smaller window
- CP36 Choose a model for each subagent (agent file, per call, forced for all) ★: There is no per-call choice and no switch that forces one model on all subagents
- CP37 Control when conversation history is auto-compacted (window, threshold, off) ★: There is no setting to move or turn off the threshold
- CP38 Default reasoning effort saved between sessions ★: One effort is saved for the user or project (default.reasoning_effort, /effort), not one per model, and there is no aut…
- CP39 Fast mode setting, per-session opt-in and off switch (fastMode, fastModePerSessionOptIn, CLAUDE_CODE_DISABLE_FAST_MODE) (Claude): No per-session opt-in key and no off switch
- CP40 Hooks that run before and after a model switch (Claude): No hook runs on /model, the picker or fallback to block or add guidance
- CP41 Model family aliases that follow the newest version (opus, sonnet, haiku, best, default) (Claude): There are no vendor-family aliases that move to the newest version
- CP42 Startup check that the model is reachable, with fallback for the session (Claude): The terminal does not check at startup and fails on the first turn
- CP43 Switch the advisor tool off (CLAUDE_CODE_DISABLE_ADVISOR_TOOL) (Claude): No dedicated switch

**Search and research** (3)
- CP44 Web search tool availability ★: Web_search works only after you save a Brave or Tavily key
- CP45 Switch web fetch off while search stays (CLAUDE_CODE_DISABLE_WEB_FETCH) (Claude): No dedicated switch
- CP46 Web fetch tool with page summarising (Claude): No cache and no separate summarising model

**Files, media and creation** (1)
- CP47 Oldest images and PDFs trimmed when a request hits the limit (Claude): When the held images reach the limit, the next image is refused with a message rather than the oldest being trimmed

**Artifacts and documents** (2)
- CP48 Publish the agent's own work as a private interactive page (Claude): The agent cannot publish a file from the session
- CP49 Read an artifact shared with you (Claude): Shared pages from others are not opened

**Accessibility and languages** (5)
- CP50 Colorblind-safe themes (light and dark) (Claude): Ours has one colorblind theme plus two high-contrast themes, with no separate light colorblind theme
- CP51 Dictation languages (Claude): It lacks Greek, Indonesian and Ukrainian that Claude lists
- CP52 Spoken-style transcript labels for every message type (Claude): Errors, warnings and thinking carry no label
- CP53 Terminal bell when the agent needs you or finishes (Claude): No bell for long tools
- CP54 Turn off syntax highlighting (Claude): Ours has no switch for highlighting alone

**Agents** (1)
- CP55 Multi-agent limits and named roles (ChatGPT): Subagents have a concurrency cap (7), depth cap (3) and named agents via --agent, none user-configurable

**Agents, tasks and automation** (30)
- CP56 Built-in subagent types (Explore, Plan, general-purpose) ★: Read-only explorer and planner agents must be written as agent files
- CP57 Cap on parallel subagents ★: Ours caps running subagents at 7 as a fixed constant that users cannot change
- CP58 Hook input fields (session_id, transcript_path, cwd, permission_mode, hook_event_name, agent_id) ★: No transcript path, working directory, permission mode or agent id
- CP59 Hook locations by scope (user, project, local, managed, plugin) ★: There is no project hooks file and hooks from project-local plugins are blocked
- CP60 Hooks on agent events ★: A hook can only be a shell command or a program (:22-63): no http, prompt, agent or mcp_tool handlers
- CP61 List subagents and sessions (/list-agents, /subagents) ★: It does not list other local or cloud sessions
- CP62 Attach to and detach from a running background session (Claude): A running session cannot be attached or detached live
- CP63 Auto permission mode with an action classifier (Claude): Nothing in apps/cli/src/safety/ calls a model
- CP64 Background session commands (list, logs, stop, remove, attach) (Claude): No respawn or shell-command background job
- CP65 Background shell commands and move-to-background key (Claude): There is no key to move a running command to the background
- CP66 CronCreate, CronList and CronDelete tools for session schedules (Claude): Nothing schedules a prompt inside the running session
- CP67 Daemon that keeps the agent alive in the background (ChatGPT): There is no /daemon restart command
- CP68 Fork a session into a background copy (Claude): It does not start a background copy or a subtask row
- CP69 Hook can block an action with exit code 2 and a message (Claude): A hook cannot answer ask or allow to override the permission prompt
- CP70 Hook output size cap and spill to disk (additionalContextLimit) (ChatGPT): Nothing is saved to disk and the cap is not a setting
- CP71 Isolate edits for non-git projects through a worktree hook (Claude): It is a notice and cannot replace how the worktree is made
- CP72 Manage background sessions: list, logs, stop, remove, attach (Claude): Has no live dashboard, peek-and-reply panel or respawn
- CP73 Notification when a session needs input or finishes (Claude): The terminal does not ring or send a desktop notice on its own
- CP74 PermissionDenied hook with retry (Claude): Hook output has no retry field
- CP75 PreModelRequest and PostModelRequest hooks (ChatGPT): Nothing fires after each model request
- CP76 RemoteTrigger tool for cloud scheduled tasks (Claude): No tool updates or runs one (agi schedules edit and run do that from the shell)
- CP77 Set up GitHub so @claude mentions run the agent in PRs and issues (Claude): It writes no workflow or key
- CP78 Show or hide the task checklist with a key (Claude): There is no toggle key
- CP79 Split one large change across many isolated subagents (/batch) (Claude): Ours /batch runs a prompt over up to 25 files matched by a glob, with no per-agent worktree
- CP80 Subagent limits: concurrent count and nesting depth (Claude): Up to 7 subagents at once and 3 levels deep, both fixed in code with no setting to change them
- CP81 Subagent scopes and priority (managed, session flag, project, user, plugin) (Claude): No managed scope and no session-only agents
- CP82 Task checklist tools and a toggle to show it (Claude): There is no key to toggle it or shared lists across sessions
- CP83 TaskStop tool stops a background task or agent (Claude): No tool stops a subagent by name
- CP84 TeammateIdle hook (Claude): Whether a blocking answer keeps the teammate working was not traced
- CP85 Workflow run limits and cost warning (Claude): No size warning or limit setting

**Browser actions** (4)
- CP86 Browser tools on by default and an install prompt for the extension (Claude): There is no install prompt or default-on setting
- CP87 Drive Chrome from the CLI (--chrome, @browser) (Claude): It needs the desktop app and has no --chrome flag
- CP88 Per-site permission before browser actions (Claude): The terminal has no per-site prompt
- CP89 Slash command /chrome (Claude): It does not start the connection

**Cloud** (1)
- CP90 Cloud environment setup scripts, caching and network access levels ★: The CLI has no cloud environment, cache or network level settings

**Coding agent** (95)
- CP91 /init drafts project instructions from the repository ★: The agent does not read the repo to fill it
- CP92 /init writes project instructions from the repo ★: /init writes a blank AGENTS.md template and does not read the project
- CP93 Admin allowlist for MCP servers and commands ★: No MCP server allowlist
- CP94 Agent SDK to embed the agent in other programs ★: No SDK package is published
- CP95 Auto mode where a model judges each action ★: Commands the rules cannot clear still ask, so it is safer
- CP96 Continue or resume inside a one-shot run ★: Agi exec has no resume
- CP97 Continue the last session or resume one by id or name ★: The name given with -n is kept in memory only (apps/cli/src/agent/mod.rs:340
- CP98 Domain allow and deny rules for sandboxed command traffic ★: Sandboxed commands only get network on or off
- CP99 Hook handler types beyond shell commands (http, mcp_tool, prompt, agent) ★: No http, MCP tool, model-prompt or agent handlers
- CP100 Hook JSON output: stop, rewrite tool input, add context, replace output ★: No decision/systemMessage fields
- CP101 Permission rules in Tool(specifier) syntax with allow, ask, deny ★: Ours stores command-prefix allow/ask/deny rules and regex policy.toml rules, not one Tool(specifier) syntax usable ever…
- CP102 Read deny rules for secrets and generated code ★: Users cannot add Read deny rules for paths such as dist
- CP103 Review a pull request and post the review ★: Nothing reviews every new PR automatically
- CP104 Review and trust of project hooks before they run ★: There is no per-hook hash review screen
- CP105 Stop hook that keeps the agent working ★: The Stop hook runs only when the session quits, not at each turn end, and cannot make the agent continue
- CP106 /simplify review of changed code with parallel agents (Claude): There is no parallel-agent simplify pass
- CP107 Allow, ask and deny rules saved in settings (Claude): No committed per-repo settings file for them
- CP108 API key or token for automation and CI auth (ChatGPT): No service accounts or per-run key
- CP109 Approve recently blocked actions from /permissions (Claude): Approving from it is not wired
- CP110 Auto-fix a pull request for CI failures and review comments (Claude): No watcher runs for you
- CP111 Bare mode and safe mode start without auto-discovered extras (Claude): No one flag turns everything off
- CP112 Bundled ripgrep with a system override (USE_BUILTIN_RIPGREP) (Claude): None is bundled
- CP113 Bundled skills such as /batch, /debug and /loop (Claude): No bundled /batch or /loop playbooks
- CP114 Check how rules treat a given command (ChatGPT): It cannot test a command
- CP115 Choose a 1M-token context window on supported models (Claude): There is no per-session switch to pick a larger-window variant of a model
- CP116 Claude in Chrome from the CLI (/chrome) (Claude): It has no settings screen
- CP117 Code Mode: one program makes many tool calls (Claude): No user-facing program mode is wired
- CP118 Commit and open pull requests from the agent (Claude): The pull-request flow with push consent is in the app server used by AGI Code, and the terminal has no PR command of it…
- CP119 Context window breakdown by category (Claude): Not tools, MCP or subagent tokens
- CP120 Custom newline and submit keys (Claude): A key config rebinds quit, mode, model, redraw, clear and palette only
- CP121 Deep multi-agent review running in the cloud (Claude): Its text points at a file only this repo owns
- CP122 Deny rules that match a tool's input parameters (Claude): Policy rules match a tool name plus a regular expression on its arguments, not named parameters
- CP123 Deny-read globs for secret files (ChatGPT): Users and admins cannot add their own deny-read globs (the glob type is unused)
- CP124 Detect child sessions from environment markers (Claude): Not confirmed for hooks and MCP servers
- CP125 Diagnostics shown after each edit (Claude): Edits do not report new issues on their own
- CP126 Env caps for output tokens, turns, retries and context size (CLAUDE_CODE_MAX_OUTPUT_TOKENS, _MAX_TURNS, _MAX_RETRIES, _MAX_CONTEXT_TOKENS) (Claude): No env for turns, retries or context size
- CP127 Fast mode command (ChatGPT): There is no separate /ultrafast tier
- CP128 Hooks can answer prompts or defer a tool call for later (Claude): It cannot allow, ask, defer or rewrite tool input
- CP129 Hooks can inject extra context into the model (Claude): Other events cannot inject context
- CP130 IDE extension with account sign-in linked to cloud tasks (ChatGPT): The CLI ships no editor extension itself
- CP131 Import setup from another coding agent (ChatGPT): Agi migrate and /import bring in Claude Code settings, MCP servers and instructions only
- CP132 Language server tools for code intelligence: Tools are lsp_definition, lsp_hover, lsp_diagnostics, lsp_completion, lsp_document_symbols and lsp_format (apps/cli/src…
- CP133 Large change split into units, each in its own worktree with a pull request (/batch) (Claude): /batch runs one instruction over up to 25 files matched by a glob in a single turn, with no worktrees or pull requests,…
- CP134 Login shell and shell snapshot settings (allow_login_shell, shell_snapshot) (ChatGPT): Config has no key for either
- CP135 Long-running workflow of many stages (Claude): No hours-long run mode
- CP136 Machine-readable CLI manifest, completions and self-update (ChatGPT): No manifest or schema output
- CP137 Monitor tool that watches a background process (Claude): The agent has no monitor tool that wakes on output
- CP138 Name a chat when starting it (ChatGPT): Kept in memory only and never saved as the title or used to find the session (apps/cli/src/agent/mod.rs:340, apps/cli/s…
- CP139 One-shot run that skips saving the session and writes the reply to a file (ChatGPT): No flag writes the final reply to a file
- CP140 Organization-managed settings (Claude): Not full settings
- CP141 Periodic sweep of old agent worktrees (Claude): Cleanup archives worktrees past a newest-N count, not by age, and has no retention setting
- CP142 Pick the sandbox for a one-shot run (ChatGPT): Exec has --full-auto only
- CP143 PowerShell tool (Claude): A powershell tool exists behind a read-only allowlist, so it cannot run general scripts
- CP144 Project MCP server approval and reset (Claude): No reset-choices command found
- CP145 Prompt history search (Ctrl+R) (Claude): Ctrl-R search works in the plain REPL only
- CP146 Prompt suggestions and idle recap (Claude): There are no next-prompt suggestions or idle compaction
- CP147 Readline line-editing keys (Claude): The full-screen composer binds only Ctrl+U among them
- CP148 Review actions: --fix, --max-findings, --comment (Claude): There is no flag to apply fixes or cap findings
- CP149 Rewind by pressing Esc twice, and /undo (Claude): There is no /undo alias
- CP150 Run a command under the sandbox to test it (ChatGPT): Takes no profile and prints no denial log
- CP151 Run the coding agent from Slack and an SDK (ChatGPT): There is no assign-a-task-in-Slack flow
- CP152 Send the current session to the cloud with an & prefix (Claude): No & prefix
- CP153 Separate accept-edits mode (Claude): There is no edits-only mode
- CP154 Session metadata event at stream start (Claude): A session-start status event is emitted without tools, servers or plugin errors
- CP155 Setting for commit and pull request attribution (Claude): Our commits carry no attribution trailer and there is no setting to add or edit one
- CP156 Settings key that grants extra working directories (Claude): No saved setting adds them for every session
- CP157 Setup checkup (/doctor) (Claude): They do not audit instruction files or slow hooks
- CP158 Shell keeps its working directory between commands (Claude): A cd in one command does not carry to the next
- CP159 Shell timeout and output limits (Claude): Commands stop after a fixed 30 seconds and output is cut at 50 KB with the rest saved to a file; neither is adjustable
- CP160 Slash command /approve: Not in the full-screen view
- CP161 Slash command /apps (list connected apps) (ChatGPT): No slash command shows them inside a session
- CP162 Slash command /autofix-pr (Claude): Nothing watches the PR
- CP163 Slash command /batch (parallel units of one change) (Claude): It does not plan separate units first
- CP164 Slash command /clear (new conversation, name the old one) (Claude): Does not take a name for the old conversation
- CP165 Slash command /cloud (ChatGPT): No /cloud command
- CP166 Slash command /code-review (Claude name for /review) (Claude): It is a generic review prompt without --comment, --fix or the ultra cloud review
- CP167 Slash command /import (bring in other tools settings) (Claude): Not Codex, Gemini or Cursor
- CP168 Slash command /insights (usage report) (Claude): There is no report
- CP169 Slash command /keymap (ChatGPT): Bindings are set in config, not through a command
- CP170 Slash command /passes: The name suggests passes it does not manage
- CP171 Slash command /powerup (interactive lessons) (Claude): There are no animated demos
- CP172 Slash command /presets (ChatGPT): Custom command files do the same job with no fixed slots
- CP173 Slash command /privacy-settings (Claude): /privacy-settings shows the privacy mode and provider route; changing it is by privacy-mode command
- CP174 Slash command /resume and session picker (Claude): No worktree scoping or background marker was found
- CP175 Slash command /teleport (Claude): There is no slash form
- CP176 Slash command /tui (renderer switch) (Claude): /tui only tells you to restart with or without --no-tui
- CP177 Slash command /ultrareview (Claude): Runs one long review prompt on the local agent, not a cloud multi-agent review
- CP178 Slash command /workflows (Claude): There is no progress view to pause or save
- CP179 Slash commands /upgrade and /usage-credits (Claude): Credits and top-ups are only shown by /extra-usage, not configured
- CP180 Steer a running turn by sending a message (ChatGPT): The app server can steer, the terminal screen cannot
- CP181 Token streaming in stream-json (Claude): Stream-json carries text and thinking deltas, but --include-partial-messages is rejected as an unknown flag
- CP182 Transcript viewer (Ctrl+O) (Claude): There is no separate transcript viewer
- CP183 Web search modes: cached, live, disabled (ChatGPT): No cached or disabled mode setting
- CP184 Wildcard patterns in permission rules (Claude): There is no * wildcard syntax in rules
- CP185 WorktreeCreate and WorktreeRemove hooks (Claude): A hook cannot return a path to replace the git worktree

**Connectors, apps, plugins and skills** (62)
- CP186 Admin allow and deny lists for MCP servers ★: No deny list or command matching
- CP187 Admin control of plugins and marketplaces ★: No marketplace-source rules or forced plugins
- CP188 Install a marketplace plugin by name ★: The plugin hooks, commands, agents and MCP servers are not downloaded or loaded in the CLI (skills may still arrive thr…
- CP189 MCP OAuth scopes, preset client and callback port ★: No CIMD and no per-login scope flag
- CP190 MCP startup and tool timeouts ★: No required-server startup failure
- CP191 Organization control of marketplaces and plugins ★: No marketplace allowlist, required plugins or trust message
- CP192 Per-tool allow, ask and block for MCP tools ★: Ask is not a forced prompt: an Ask decision falls back to require_confirmation (apps/cli/src/agent/tools.rs:77-99), whi…
- CP193 Plugins and plugin marketplaces ★: Marketplace installs do not reach the CLI: agi marketplace get only records the install on the account and says it is l…
- CP194 Plugins synced from the account into the CLI ★: Installed account plugins do not auto-load
- CP195 Skill visibility overrides and per-skill on/off ★: No name-only or user-only states
- CP196 Skills from nested folders and added directories ★: Nested-folder skills and --add-dir skills are not discovered
- CP197 /mcp reconnect: retry every failed or sign-in-needed server (Claude): There is no per-server reconnect entry and it does not start a pending sign-in
- CP198 Account connectors (claude.ai connectors) inside the CLI (Claude): /connectors and agi connectors show what the plan and workspace policy allow; connecting an app is done on the web
- CP199 Account plugins and skills sync (Claude): Account plugins do not, and no setting turns the skill sync off
- CP200 Automatic MCP reconnection (Claude): No backoff schedule
- CP201 Bundled skills (/batch, /debug, /loop) (Claude): No /loop or API-reference skill
- CP202 Code intelligence (language servers) (Claude): Servers cannot be added by plugin
- CP203 Codex Security plugin (ChatGPT): No installable security plugin
- CP204 Connect GitHub for cloud sessions (/web-setup) (Claude): No one-step connect from the local gh login
- CP205 Curated skill installer (ChatGPT): No curated catalog installer
- CP206 Custom output style files (Claude): No project or managed styles
- CP207 Enable or disable a plugin at a scope (Claude): Enable and disable have no scope
- CP208 Import settings from another coding CLI: Codex and Cursor are not importable
- CP209 Installed plugins list: type to filter, toggle, mark favorites (Claude): There are no favorites
- CP210 Manage marketplaces: list, refresh and remove, with JSON output (Claude): There is no manual refresh command and no JSON output
- CP211 Manifest metadata and listing fields: display name, author, homepage, license, keywords, icon, support and policy links (Claude): Ignored (kept as extra keys and only named in a debug line)
- CP212 Marketplace sources beyond GitHub (Claude): No local-path or hosted-JSON marketplaces
- CP213 MCP config warnings (Claude): No whitespace or duplicate-name warnings
- CP214 MCP resources as @ mentions (Claude): The picker does not list resources
- CP215 MCP server status indicators (connected, needs sign-in, failed with detail, pending) (Claude): No pending or tools-fetch-failed state with the failure detail in agi mcp list
- CP216 MCP servers connect in the background at startup, with batch size and discovery cache controls (Claude): Servers are connected one after another in a loop and there is no batch size, discovery cache or non-blocking switch
- CP217 MCP timeouts for startup, tool call and idle (Claude): No per-server timeout or idle timeout
- CP218 MCP tool search: defer tool schemas, load on demand (Claude): No setting to force on, off or a percent threshold
- CP219 Per-app controls for connector tools: on or off, destructive and open-world tool gating, approval mode (ChatGPT): There is no rule that gates tools by their destructive or open-world hints, and none of this applies to account connect…
- CP220 Plugin auto-update by marketplace (Claude): No background auto-update setting
- CP221 Plugin code registers a new tool for the model (description and JSON schema) (Claude): There is no in-process tool registration
- CP222 Plugin code registers a slash command with its own handler, display-only output and /config rows (Claude): A plugin cannot run its own code for a command, print text the model does not see, or add /config rows
- CP223 Plugin dependencies and engines range (Claude): No cross-plugin conflict resolution
- CP224 Plugin dependencies with version ranges (Claude): None is built in (apps/cli/src/installs.rs:182-186
- CP225 Plugin details and token cost (Claude): No component inventory or token cost
- CP226 Plugin details with always-on token cost (Claude): It does not give a token cost
- CP227 Plugin environment variables: plugins root, cache, git timeout, seed folder, offline and watch (Claude): No per-session plugin dir variable, cache dir, git timeout, seed dir, offline or watch variables
- CP228 Plugin Errors tab that lists load failures with guidance (Claude): /plugin has no Errors tab that gathers load failures with next steps
- CP229 Plugin install flags: scope, preset options (--config) and JSON output (Claude): Scope exists only on agi marketplace install and is a label
- CP230 Plugin install scopes: user, project, local (Claude): Every install lands in the user plugins folder and nothing reads the label to decide where a plugin loads (apps/cli/src…
- CP231 Plugin installs from a git ref or commit (Claude): Not a commit id (apps/cli/src/features/plugins/plugins.rs:1196
- CP232 Plugin list command with JSON output, available plugins and data size (Claude): Agi plugin list takes no flags: no JSON, no available-from-marketplace view and no data size
- CP233 Plugin manifest component types (Claude): No LSP, output styles or inline command content
- CP234 Plugin path variables for root and data dir (Claude): A persistent data directory variable was not found
- CP235 Plugin suggestions from the project (Claude): No automatic tip or start notice
- CP236 Plugin uninstall with keep-data and prune options (Claude): No keep-data or prune-dependencies option
- CP237 Plugin validate, test, eval and tag commands for authors (Claude): No validate, test or eval command
- CP238 Reject a project .mcp.json server and reset approvals (Claude): There is no command that resets the project approvals
- CP239 Same-name skill resolution: organization beats personal beats project (Claude): There is no organization tier, so a repository can replace a personal skill of the same name once its skills are consen…
- CP240 Saved plugin options substitute into MCP, LSP, hooks and skill content and are exported as environment variables (Claude): Export of options as environment variables to plugin processes was not found
- CP241 Size and time limits on marketplace file and archive downloads (Claude): There are no archive downloads to limit
- CP242 Skill frontmatter: allowed-tools, disallowed-tools and model override (Claude): It cannot pre-approve tools or set model or effort
- CP243 Skill frontmatter: free-form metadata, license and compatibility fields (Claude): Metadata, license and compatibility are not read
- CP244 Skill frontmatter: paths globs and manual-only (Claude): There is no file-glob activation
- CP245 Skill string substitutions and argument hints (Claude): Skills have no substitutions
- CP246 Slash command /reload-plugins: The running session's commands are not rebuilt
- CP247 Streamable HTTP MCP auth options: bearer token from an env var, env-based headers, header helper, OAuth (ChatGPT): OAuth and fixed headers work. A bearer token or header read from an environment variable is refused: importing a Codex…

**Cross-device continuity** (1)
- CP248 Remote Control server mode: capacity, spawn mode, name prefix, QR code (Claude): The server options this row lists are missing in the CLI itself, whatever the phone does: agi remote-control takes no f…

**Device and OS integration** (2)
- CP249 Editor diagnostics and selection as context (Claude): A plain terminal has no link to an editor
- CP250 Terminal setup command fixes Shift+Enter, Option-as-Meta, clipboard and editor terminal settings (Claude): It changes no terminal setting

**Help, feedback and support** (5)
- CP251 Debug log file and category filters ★: There is no flag to write the debug log to a chosen file
- CP252 Corporate proxy and custom CA certificates (Claude): No extra CA bundle setting is supported
- CP253 Setting that turns off feedback uploads, plus a local diagnostics bundle (ChatGPT): No config or managed key turns /feedback uploads off
- CP254 Slash command /powerup: It is not a scripted lesson
- CP255 Test whether plugins can load (Claude): No command says why plugins cannot load

**Install, release and update** (3)
- CP256 Background auto-update ★: Nothing updates itself
- CP257 Frequent releases ★: No release rhythm yet
- CP258 Installer variables for scripted installs: non-interactive mode and install folder (ChatGPT): There are no environment-variable forms

**Instructions** (2)
- CP259 Fallback instruction filenames (configurable list) (ChatGPT): The filename list is not configurable
- CP260 Instruction size limit (32 KiB default, raisable) (ChatGPT): Ours refuses a single instruction, rule or skill file over 1 MiB and has no combined cap or setting

**Memory and personalization** (5)
- CP261 Auto memory on or off (autoMemoryEnabled, CLAUDE_CODE_DISABLE_AUTO_MEMORY) (Claude): No switch was found that stops the local session-summary and consolidation pass
- CP262 Auto-compact setting and window size (Claude): There is no switch or window setting
- CP263 Import another tool's instructions and settings (Claude): /init does not fold in Cursor or Copilot rules
- CP264 Instruction files in subfolders load on demand (Claude): Subfolder files are not added as the agent opens them
- CP265 Slash command /dream (consolidate auto memory on demand) (Claude): No command runs that pass on demand

**Model** (1)
- CP266 Extended thinking default and controls ★: No thinking on/off setting or token cap

**Notifications** (4)
- CP267 Run an external program when a turn completes ★: The Stop hook fires only on quit, and there is no notify setting
- CP268 Alert when the agent needs you or finishes: There is no built-in desktop notice or sound
- CP269 Notification hook with types (permission prompt, idle, auth, input needed) (Claude): The Notification hook fires only for loop-detection warnings
- CP270 System notices shown in the status row (context low, updates, MCP errors) (Claude): They do not share the status line

**Planning** (1)
- CP271 Plans folder setting and plan file kept across compaction (Claude): Plans save as files under the config folder, not configurable or re-injected after compaction

**Privacy, security and data** (23)
- CP272 Managed settings that only the organization can set ★: There is no flag making managed rules the only source
- CP273 Permission rules: allow, ask and deny with layered scopes ★: The rule syntax is regex and there is no gitignored local layer
- CP274 Sandbox network allow and deny domain lists ★: Users cannot list allowed or denied domains
- CP275 Scan changes only: branch diff, PR or commit ★: No PR or single-commit scan target
- CP276 Account choice of whether sessions are used for model improvement, reachable from the CLI (Claude): It has no model-improvement choice and does not open the account's data settings
- CP277 Admin can disable auto mode or bypass mode (Claude): There are no dedicated switches
- CP278 Auto-allow sandboxed shell commands without a prompt (Claude): It is not tied to a command being inside the sandbox
- CP279 Delete local project data in one command (claude purge) (Claude): There is no project-wide or all-data purge command
- CP280 Environment filtering for spawned commands (shell_environment_policy) (ChatGPT): Users cannot set include or exclude lists
- CP281 Invisible Unicode characters stripped from prompts (Claude): Typed or pasted prompts are not stripped
- CP282 Linux sandbox dependency guidance and an AppArmor profile for Ubuntu 24.04 (Claude): No AppArmor profile or setup step ships for distributions that restrict unprivileged user namespaces
- CP283 One switch to disable all non-essential traffic (Claude): There is no single switch that also stops update checks
- CP284 Plugin marketplace trust tiers and integrity checks (Claude): There are no marketplace tiers or reserved names
- CP285 Print mode: restrict the available tool set with --tools (Claude): There is no flag that limits the whole tool set to a named list
- CP286 Project config cannot redirect credentials (base URL and key keys ignored from a repository) (ChatGPT): A repository's provider entry with a non-local base URL is not ignored
- CP287 Protection against deleting root, home or the project (Claude): There is no mounted-drive prompt or per-path removal check
- CP288 Run without saving a transcript (Claude): There is no environment switch or transcript size cap
- CP289 Safe-run flags for unfamiliar repositories (--bare, setting sources) (Claude): There is no --bare or disable-all-hooks flag
- CP290 Sandbox filesystem path controls (allowWrite, denyRead and similar) (Claude): There is no setting to add or block paths
- CP291 Sandbox settings panel with Mode, Overrides, Config and Dependencies tabs (Claude): There is no tabbed panel
- CP292 Signed release checksums and verified install (Claude): The row says code signing is not stated in the repo
- CP293 Telemetry and error-report opt-outs (Claude): No DO_NOT_TRACK or one switch that stops all background network calls
- CP294 Turn off session history saving or cap its size (ChatGPT): Only the size cap is missing

**Projects and organization** (1)
- CP295 Session list filters and search (ChatGPT): No filter by folder or sort order

**Settings** (45)
- CP296 --settings flag loads a settings file or JSON for one run ★: It cannot supply a file or inline values
- CP297 Auto mode with a safety classifier reviewing actions ★: What is missing is a model-based reviewer and its settings
- CP298 Corporate proxy variables, NO_PROXY and proxy DNS ★: No own proxy setting and local calls bypass it
- CP299 Custom color themes and colorblind presets ★: No user theme files or .tmTheme syntax themes
- CP300 Debug logging options ★: No log-folder or level override
- CP301 Desktop notifications when a turn finishes or needs input ★: No desktop notification option
- CP302 Import setup from other coding tools ★: No other tool, no sync
- CP303 One-session settings override and -c key=value ★: It takes no inline JSON and there is no key=value override flag
- CP304 Plan mode with approval choices after the plan ★: No three-choice menu
- CP305 Project instruction size limit and excludes ★: No setting caps what enters the first turn or excludes chosen files
- CP306 Sandbox writable roots, temp dir and network access options ★: Exposes no config keys for them
- CP307 Settings layers (managed, flags, local, project, user) ★: No personal per-project layer
- CP308 Settings layers and precedence ★: No untracked local layer or profile files
- CP309 Settings sources and managed source in /status ★: Not which settings files loaded, writable folders or approval policy
- CP310 ! shell commands add output to context without a reply (Claude): Has no toggle to make the model respond
- CP311 Admin switches to remove auto or bypass mode (Claude): There is no separate switch for auto or bypass
- CP312 Agent doctor lists rejected settings and prompt audit (Claude): It does not list dropped settings entries or audit instructions
- CP313 Auto mode pause after repeated blocks (Claude): Auto mode does not pause after a run of blocks and keeps no editable block list
- CP314 Auto mode with a safety classifier (Claude): No separate reviewer model, no model choice, /auto-mode-setup only guides setup
- CP315 Bypass permissions mode (Claude): No warning dialog and no root refusal found
- CP316 Config keys for extra developer instructions or a replacement model instructions file (ChatGPT): No config key keeps it for every session
- CP317 Custom key bindings (/keymap) (ChatGPT): No in-app editor
- CP318 Default shell for ! commands (Claude): No setting picks the shell for ! commands
- CP319 Dependency-only plugin installs a curated bundle (Claude): Out of the box a dependency-only plugin installs nothing
- CP320 Detailed transcript viewer (Claude): No separate viewer with timestamps, prompt jumps or open in editor
- CP321 Feature flag listing (ChatGPT): No sample file of every key
- CP322 File picker respects .gitignore, with a toggle (Claude): Cannot be switched to include ignored files
- CP323 Install a plugin from a marketplace (Claude): /plugin in a session handles enable, disable, remove, update and configure only (apps/cli/src/installs.rs:555-580)
- CP324 Keybinding chords, contexts and file checks (Claude): No multi-key chords, contexts or binding a key to a slash command
- CP325 Load a plugin folder and reload plugins (Claude): No flag loads a plugin folder for one session
- CP326 Memory settings (ChatGPT): There are no keys for models, rate-limit threshold or external-context disable
- CP327 Named permission profiles (ChatGPT): No custom profiles with file deny globs or domain lists
- CP328 Open prompt in an external editor (Ctrl+G) (Claude): It does not offer the last response as starting text
- CP329 Project root markers setting (ChatGPT): Ours finds the project root from a fixed marker list (.git, Cargo.toml, package.json, go.mod, pyproject.toml), not conf…
- CP330 Project-level custom output style files (Claude): Ours reads custom styles only from the user's home folder, not from a folder inside the project
- CP331 Prompt caching controls (Claude): No switch to turn caching off or change its lifetime
- CP332 Remote Control start setting and starting mode (Claude): No start-at-launch setting or starting permission mode (mobile v1 hides Remote Control by decision)
- CP333 Searchable settings screen (/config) (ChatGPT): It is not a searchable screen
- CP334 Settings error and warning dialogs for invalid files (Claude): There is no dialog offering to fix or continue
- CP335 Shell completions for Bash, Zsh, Fish, PowerShell (ChatGPT): PowerShell is not offered
- CP336 Slash command /config (ChatGPT): Not searchable
- CP337 Slash command /keybindings (ChatGPT): Shows the active bindings; changing them is done in config
- CP338 Syntax highlighting toggle for code blocks (Claude): Offers no switch to turn highlighting off
- CP339 Terminal compatibility switches (Claude): No switches for syntax highlighting, synchronized output, strikethrough or tmux truecolor
- CP340 Vim keys in the prompt: The full-screen composer has no vi editing and /vim only explains the setting

**Sharing and collaboration** (1)
- CP341 Read-only share link of a session (ChatGPT): Creating a share link from the CLI is the missing part

**Teams and admin** (26)
- CP342 Admin audit trail and SIEM events ★: Nothing is shipped to a SIEM and settings changes are not audited
- CP343 Admin toggles for CLI access, cloud sessions, remote control and fast mode ★: The CLI reads only the hooks switch
- CP344 Disable auto mode and set starting permission mode by policy ★: No key removes auto approval as a choice
- CP345 Managed MCP server allow and deny policy ★: No local managed file, deny list, exclusive config file or admin-provided server list
- CP346 Managed pin of permission mode and lock on bypass ★: There is no separate switch that removes bypass or full-access for everyone
- CP347 Managed policy delivered by MDM, cached, fails closed ★: No cloud fetch or expiry
- CP348 Managed settings that pin permissions and block bypass ★: No disable-bypass key
- CP349 Managed-source precedence and merge behavior ★: No merge mode or setting to change it
- CP350 Organization-managed settings for the CLI ★: The device file pins only three config keys plus rules and trust (apps/cli/src/platform/policy/managed.rs:36-58) and th…
- CP351 OS-level policy delivery (MDM plist, Windows registry) ★: No plist, registry or MDM templates
- CP352 Spend limits and usage analytics for the admin ★: Org spend limits and per-member analytics are not in the CLI
- CP353 --mcp-config and --strict-mcp-config are refused when the admin has exclusive MCP control (Claude): The flags are never refused at startup and there is no exclusive managed MCP file
- CP354 A repository declares the marketplaces and plugins its contributors should install (Claude): It cannot name marketplace plugins for teammates to be prompted to install
- CP355 Admin disable of bypass or auto mode (Claude): Has no separate disable switch
- CP356 Admin read denial for files (deny_read) (ChatGPT): Managed config has no setting for them
- CP357 Admin usage reporting and spend controls for the CLI (Claude): The CLI exports no usage telemetry or reporting API of its own
- CP358 Check which policy source is active (/status, doctor) (Claude): No verified view naming the active managed policy source
- CP359 Corporate proxy and custom CA support (Claude): No client certificate settings, CA bundle option or published host allowlist
- CP360 Fail-closed startup when the policy cannot be fetched (Claude): Startup itself is never blocked by a missed fetch
- CP361 Invalid managed entries: drop the bad entry, keep the valid ones, restrictive keys fail closed (Claude): Valid entries in the same file are not applied, and no per-entry error is listed
- CP362 Managed MCP policy errors and blocked-server list (Claude): There is no managed-mcp file or specific add and remove messages
- CP363 Managed signed-plugin requirement: The trusted publisher keys come only from the user own config.toml (features/plugins/signature.rs:23-37,61-66
- CP364 Minimum and maximum client version by policy (Claude): No admin-set version range in managed settings
- CP365 Slash command /team-onboarding: Despite its description nothing generates one
- CP366 Streaming stall watchdog timers (Claude): What is missing is tuning them by setting or variable
- CP367 Telemetry and nonessential traffic opt-out by policy (Claude): An administrator cannot pin them off through managed policy

**Voice** (3)
- CP368 Dictation does not count against usage (Claude): No code shows it is excluded from usage, so unverified
- CP369 Linux audio fallback recorders and diagnostics (Claude): Have no arecord or SoX fallback
- CP370 Tap-to-toggle recording mode and a saved voice setting (Claude): There is no tap mode or saved voice setting
