---
id: "DOC-50-competitors-data-lists-to-read-partial-vscode"
type: "comparison-data"
title: "partial vscode"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
## VS Code (88)

**Account and sign-in** (1)
- VP1 Login stored in the OS keyring, a file or memory (ChatGPT): No setting offers a file or in-memory choice

**Plans, billing and usage** (3)
- VP2 Buy more usage when included limits run out ★: Credits cannot be bought inside the editor
- VP3 Plan usage and limits shown in the editor for paid plans ★: No usage bars in the chat panel itself
- VP4 Usage broken down by skill, subagent, plugin and MCP server (Claude): There is no split by skill, plugin or MCP server and no fix suggestions

**Home and navigation** (4)
- VP5 Chat opened as an editor tab, several conversations side by side (Claude): The sidebar badge flags approvals, with no per-tab status dots
- VP6 Dock the chat in the secondary sidebar or an editor group (Claude): There is no lock-editor-group setting
- VP7 Editor toolbar icon and status bar item open the chat (Claude): No status bar item opens the chat
- VP8 Session groups and filters in the sessions list (Claude): No groups

**Composer and input** (1)
- VP9 Choose whether editor context is shared (/ide-context) (ChatGPT): There is no /ide-context command

**Conversations and message actions** (3)
- VP10 Automatic compaction when the context fills, with settings ★: Thresholds and the summary prompt cannot be changed
- VP11 AI-generated session titles (Claude): The editor never calls it
- VP12 Copy a response with a /copy command (Claude): There is no /copy command in the slash menu

**Models and reasoning** (3)
- VP13 Extended thinking toggle (Claude): Setting agent.thinking covers only editor utilities like Explain and Fix, not the chat composer
- VP14 Model and reasoning effort for each subagent (ChatGPT): Not a reasoning effort
- VP15 Notice when a request is moved to another model (ChatGPT): There is no separate reroute or verification notice

**Search and research** (1)
- VP16 Choose live, cached or no web search ★: There is no cached or domain-limited mode

**Files, media and creation** (1)
- VP17 Generate and edit images from the chat (ChatGPT): The chat shows no image preview and takes no reference image

**Accessibility and languages** (5)
- VP18 Chat font size and font family settings ★: It does not read the chat font settings, so chat text cannot be sized apart from the editor
- VP19 Accessibility audit of the panel: A developer script (apps/extension-vscode/scripts/a11y-audit.mjs) is not a user feature
- VP20 Screen reader announcements for replies, approvals and plan reviews (Claude): Approvals and plan reviews have no dedicated announcements and there is no focus-last-message command
- VP21 Translated interface strings: There is no package.nls file, so all command titles a
- VP22 UI language override setting (ChatGPT): There is no extension setting to pick a different language for the panel

**Agents, tasks and automation** (9)
- VP23 Built-in specialist subagents (explore, plan, general purpose) ★: A dedicated read-only explore or plan agent is not selectable and none are listed in the editor
- VP24 Custom subagents defined in files ★: The editor has no list or picker for them
- VP25 Foreground and background subagents and commands, with a list to stop them ★: The editor shows no background command list, no run-in-background button and no stop control
- VP26 Agent switches into a worktree by itself (Claude): Whether the panel follows a mid-session switch was not verified
- VP27 Agent teams: named teammates that message each other (Claude): The editor has no teammate view and no way to message one
- VP28 Local or cloud choice in the composer (ChatGPT): The composer has no local or cloud switch
- VP29 Remote control of this window's sessions from a phone (Claude): Remote Control commands exist in the editor, but the phone side is hidden in mobile v1 by decision
- VP30 Session schedules and self-paced loops (Claude): The editor shows them nowhere and has no /loop
- VP31 Subagent and background task view (Claude): There is no map view

**Browser actions** (1)
- VP32 @browser drives your Chrome from the editor (Claude): There is no @browser mention

**Coding agent** (16)
- VP33 Admin settings file that locks hooks and plugins ★: The CLI reads a managed settings file that can require signed plugins, allow only listed hook commands and limit hooks…
- VP34 Dev container support ★: No ready-made dev container feature is provided
- VP35 Lifecycle hooks that block, rewrite or add context ★: Only command hooks were verified, not the other handler types
- VP36 Permission modes in the prompt box ★: None has a model judging approvals
- VP37 Sandbox choice for commands ★: Commands are sandboxed by default: the process default is Contained and launch_mode with no flags returns Contained (ap…
- VP38 /plan with a task, and /plan open to open the plan file (Claude): 'plan' is not a prompt command, so '/plan fix X' is sent as plain text
- VP39 Admin limits on approval mode, sandbox and full access (ChatGPT): The managed policy is not hooks and plugins only
- VP40 Attach a note when answering an approval (Claude): Allowing carries no note
- VP41 Keyboard shortcut to insert a file reference (Claude): Mention File in Chat has no default key
- VP42 Language-server code intelligence for the agent (Claude): There is no per-language install flow in the editor
- VP43 Review base branch or uncommitted changes, inline or separate chat (ChatGPT): There is no base-branch choice and no inline-or-separate setting
- VP44 Run a shell command yourself next to the session (ChatGPT): Its output is not added to the session as a turn
- VP45 Run the agent in WSL from a Windows window (ChatGPT): No setting moves the agent into WSL from a Windows window
- VP46 Summarize from or up to a chosen message (Claude): There is no summarize-from-here
- VP47 Web search mode: cached, live or off (ChatGPT): There is no cached versus live choice
- VP48 Website allow and deny rules for the agent's web access (ChatGPT): Shell command traffic is not covered

**Connectors, apps, plugins and skills** (8)
- VP49 Add, refresh and remove plugin marketplaces ★: Marketplaces are managed only with the agi marketplace commands in a terminal
- VP50 MCP resources readable by the agent or by mention ★: The editor shows no resource list and the @ resource mention exists only in the terminal screen
- VP51 Skills from user, project, nested and plugin folders ★: There is no admin-managed or account-synced location
- VP52 Admin allowlist of approved MCP servers (Claude): Stdio servers have no matcher and are refused when a list is active
- VP53 Import settings, skills and sessions from another coding agent (ChatGPT): The editor has no import screen and covers no other agent
- VP54 MCP server controls: required, timeouts, tool allow and deny lists (ChatGPT): A server cannot be marked required and per-server timeouts and tool allow or deny lists are not exposed
- VP55 Per-skill visibility: On, Name only, or locked (Claude): There is no name-only state and no locked marker
- VP56 Plugins and plugin marketplaces (Claude): Ours installs only from a Git URL or folder with a sha256 pin, toggles and removes (apps/extension-vscode/src/features/…

**Cross-device continuity** (2)
- VP57 Chats come back after reloading the editor (Claude): The sidebar chat is not reopened and interrupted steps are not resumed
- VP58 Remote Control: drive an editor session from phone or browser (Claude): Conflicts with row 'Remote control of this window's sessions from a phone', rated Partial for the same feature; they ne…

**Device and OS integration** (4)
- VP59 Connection to the vendor's desktop app (ChatGPT): A one-way link exists. The web app that Desktop loads builds a vscode:// developer-session link behind an 'Open in VS C…
- VP60 Link that opens the chat with a prefilled prompt or session (Claude): There is no general open link with a typed prompt
- VP61 Run the agent in WSL from VS Code on Windows (ChatGPT): There is no such setting (25 settings in apps/extension-vscode/package.json, none for WSL)
- VP62 Shortcut that toggles focus between the editor and the chat (Claude): Does not return focus to the editor, and Open Chat takes no prompt argument

**Help, feedback and support** (1)
- VP63 Library of ready-made prompts with a reason why each works (Claude): There is no library of task prompts

**Install, release and update** (4)
- VP64 Available in Cursor, Windsurf and other forks (Open VSX) ★: Runs only when the OPEN_VSX_PUBLISH variable is true
- VP65 Listed on the VS Code Marketplace ★: A Marketplace publish job exists, but the extension is a 0.0.1 preview and the research file lists AGI Code as coming s…
- VP66 Minimum VS Code version (Claude): Ours needs VS Code 1.100 or newer, a higher floor than either Claude figure
- VP67 Stable and pre-release channels: The extension is version 0.0.1 with preview true (apps/extension-vscode/package.json:22) and row 'Listed on the VS Code…

**Memory and personalization** (1)
- VP68 Instruction file size limit (ChatGPT): The limit cannot be changed

**Privacy, security and data** (4)
- VP69 Switch the command sandbox mode ★: The editor has no sandbox switch or view
- VP70 Actions no mode approves silently (push, protected paths) (Claude): There is no fixed protected-path list found
- VP71 Control which environment variables reach agent commands (ChatGPT): There is no user policy to choose variables
- VP72 Do not keep session history (ChatGPT): The editor has no switch for it

**Settings** (11)
- VP73 Permission modes: ask, accept edits, plan, bypass, dont-ask ★: The engine Dont-ask mode is not offered
- VP74 Settings layers: user, project, local and admin-managed ★: There is no project-local file
- VP75 Choose where chat opens (sidebar, panel or editor) (Claude): No setting picks the default location
- VP76 Move where config, sessions and logs are kept (ChatGPT): There is no setting in the editor
- VP77 Plan approval choices (approve with auto mode, approve and review edits, keep planning, clear context) (Claude): No choice of the mode to run in afterward and no clear-context option
- VP78 Save open files before the agent edits (autosave setting) (Claude): Has no setting for saving before edits
- VP79 Scroll to the bottom when you send (Claude): Only the off switch (scrollToBottomOnSend false) is missing
- VP80 Separate model for code review (ChatGPT): The editor's Code Review command takes only an effort level and has no review model choice
- VP81 Setting for when the context indicator appears (contextUsageThreshold) (Claude): No threshold setting among the 25 settings
- VP82 Setting to hide the onboarding card (Claude): There is no setting to turn it off
- VP83 View and edit permission rules (Claude): Only as one set for every session, not per project

**Teams and admin** (5)
- VP84 Organisation-managed settings that override local ones ★: There is no server-delivered policy and the panel does not say a setting is managed
- VP85 Admin command rules, read denials and allowed permission profiles (ChatGPT): There is no admin read-denial list or profile allowlist
- VP86 Admin hooks, plugin and MCP server allowlists, marketplace sources (ChatGPT): No admin allowlist of MCP servers or marketplace sources found
- VP87 Corporate proxy support (Claude): The extension has no proxy setting and does not read VS Code's http.proxy
- VP88 Team onboarding guide shared with teammates (/team-onboarding) (Claude): It cannot upload or share it, and the extension cannot run the command
