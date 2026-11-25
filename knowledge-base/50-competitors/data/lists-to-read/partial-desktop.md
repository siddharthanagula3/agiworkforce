---
id: "DOC-50-competitors-data-lists-to-read-partial-desktop"
type: "comparison-data"
title: "partial desktop"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
## Desktop (136)

**Account and sign-in** (4)
- DP1 Limit sign-in to the company workspace and block personal accounts ★: No device policy blocks personal accounts or restricts login methods on managed computers
- DP2 Import settings, skills, projects and recent chats from another agent app (ChatGPT): Instructions, skills, projects and chats are not imported and there is no sync or import history
- DP3 Members create access tokens for non-interactive automation (ChatGPT): There is no admin switch limiting who may create them for workspace automation
- DP4 Signing out turns off Remote Control but keeps pairings (ChatGPT): I found no saved pairing that turns back on after the next sign-in

**Plans, billing and usage** (3)
- DP5 Admin spend limits with alerts ★: No per-user or per-group caps
- DP6 History of usage-limit resets received and used (30 days) (ChatGPT): There is no history of resets received or used
- DP7 Usage history charts by surface, model and speed (ChatGPT): No split by surface, speed or token type

**Home and navigation** (8)
- DP8 Approve or decline a request with Enter or Escape (ChatGPT): Chat tool approvals have no Enter or Escape handling
- DP9 Assign your own key for any action in Keyboard Shortcuts settings (ChatGPT): Four in-app commands can be rebound and global chords can be picked from a list; menu and other shortcuts are fixed
- DP10 Context-aware suggested prompts and tasks to resume (ChatGPT): Nothing suggests tasks to resume
- DP11 Jump to recent chat 1 to 6 by shortcut (ChatGPT): No chord opens recent chats by position
- DP12 Layout shortcuts: full view, cycle layout, toggle bottom panel, switch between chat and tabs (ChatGPT): There is no full view, no layout cycle and no bottom-panel toggle
- DP13 Mouse back and forward buttons navigate chats (ChatGPT): The shell has no handler for the mouse side buttons
- DP14 Shortcuts to archive, pin, rename, mark unread or copy a link to the current chat (ChatGPT): None has a keyboard chord
- DP15 Undo and redo the last app action with Cmd+Z (ChatGPT): Cmd+Z in the Edit menu only undoes typing, and there is no redo for app actions

**Composer and input** (5)
- DP16 Suggested next message after a reply, accepted with Tab ★: There is no ghost text accepted with Tab
- DP17 @mention a custom GPT in the composer (ChatGPT): There are no custom GPTs to mention
- DP18 Steer a running answer and queue follow-up messages (ChatGPT): They cannot be reordered
- DP19 Stop a streaming answer with Command+. (ChatGPT): Is not bound
- DP20 Take Screenshot from the plus menu, pick an open window (ChatGPT): There is no window list to pick from

**Conversations and message actions** (1)
- DP21 Revert the conversation to before a turn ★: There is no plain revert

**Files, media and creation** (2)
- DP22 Expandable tables and charts from data analysis, download a chart (ChatGPT): No table expand view or cell selection for analysis results was found
- DP23 Generated image viewer with Focused and Canvas views and version choice (ChatGPT): There is no grid of all chat images and no version picker

**Accessibility and languages** (1)
- DP24 Menus, tray and system dialogs in the app language ★: The menus, tray, notifications and dialogs are fixed English text and the build keeps English locale files only

**Agents, tasks and automation** (13)
- DP25 Agent prefers a connector, then shell, then browser, then screen control (Claude): I found no rule that orders them with screen control last
- DP26 Apple Messages send approval per chat (Allow once or Always allow) (ChatGPT): No per-chat approval for sending messages in Messages
- DP27 Computer use approvals expire after 30 minutes in phone-started tasks (Claude): There is no timed re-prompt
- DP28 Custom agents defined with name, instructions, skills and model (ChatGPT): They are standalone assistants, not helpers a running task can call
- DP29 Custom rules and approval tiers for a personal agent (ChatGPT): No free-text custom rules
- DP30 Data plugin: business questions answered with dashboards on team metric definitions (ChatGPT): There are no admin-managed team metric definitions
- DP31 Download a task's data to continue it in the local coding tool, and export all task data (Claude): A single task cannot be downloaded and reopened in a local coding session
- DP32 Keep the computer awake while agents run (ChatGPT): RunningTurns come only from local coding session events (apps/desktop/electron/agentNotifications.ts:45-52,107
- DP33 Plugin connections shared across chat, work and code (ChatGPT): The only evidence is apps/web/app/agent-permissions/page.tsx, a public policy page that is not a product route, so the…
- DP34 Record a workflow once and replay it as a skill (Record and Replay) (ChatGPT): The row's own difference says clicks and typing are not captured (apps/web/features/skill-recorder/components/SkillReco…
- DP35 Send a task from the phone to run on the paired desktop (Dispatch) (Claude): The phone side is hidden in mobile v1 by owner decision, and there is no single persistent thread
- DP36 Stop shortcut that halts every agent from any app: It does not halt every agent: stopAgents interrupts only local coding turns and takes the screen back (apps/desktop/ele…
- DP37 Work across sessions: the assistant lists, reads and messages your other sessions (Claude): The assistant does read other chats: with the Memory setting on, relevant excerpts from past chats and the last 24 hour…

**Browser actions** (8)
- DP38 Admin limits on browser sites, uploads, downloads, history and saved approvals ★: There are no per-site upload or download rules set by the admin
- DP39 Built-in browser pane inside the app ★: Only inside a coding session on this computer
- DP40 Per-site agent permissions for downloads, uploads and risky actions ★: Ours has no per-site download or upload setting: the Chrome agent always asks for those (apps/extension/src/features/co…
- DP41 Use your own Chrome through a paired extension ★: Chrome only
- DP42 Address bar that searches browsing history (ChatGPT): The browser pane takes an address from a running dev server only
- DP43 Approval duration choice (this turn or this thread) and auto-review of browser actions (ChatGPT): There is no thread-long choice or reviewer that approves actions for you
- DP44 Browser extension also for Edge, Brave, Opera and Vivaldi (ChatGPT): Brave, Opera and Vivaldi are not covered and there is no @ browser mention
- DP45 Site tools (WebMCP): pages expose actions the agent can call (ChatGPT): The built-in pane has no tools menu or admin flag

**Coding agent** (45)
- DP46 Approval modes: ask every time, read-only auto, skip approvals, admin-limited ★: But nothing can set it: the policy PATCH schema has n
- DP47 Archive a session and auto-archive after the pull request merges ★: There is no setting that archives a cloud session after its pull request merges
- DP48 Built-in diff pane with inline comments, commit, push and pull request ★: Inline comments for the agent and hunk-level revert are not in the cloud panel
- DP49 Connect to a remote machine over SSH ★: It does not read your ~/.ssh/config
- DP50 Generate, review, apply and verify a security patch ★: There is no re-run to verify the fix
- DP51 Permission modes for code sessions (ask, accept edits, auto, bypass) ★: No classifier-based Auto and no accept-edits mode
- DP52 Scan only changes: branch diff, PR or commit ★: You cannot pick a pull request, commit or range
- DP53 Scan setup: model, effort and additional context ★: No free-text additional context
- DP54 Scheduled recurring coding tasks ★: Return text only, without research or media
- DP55 Side chat that asks about the session without changing it ★: A side chat opens a separate conversation beside the chat and does not share the session context
- DP56 Slash commands and file or skill mentions in the composer ★: /init and /compact are not offered
- DP57 Turn an issue into a pull request ★: It does not read an issue or support GitLab
- DP58 A separate reviewer agent approves or denies actions for you (ChatGPT): No model reviews each request and no custom reviewer policy exists
- DP59 App shortcuts: new chat, clear unread, copy conversation path (ChatGPT): There is no clear-all-unread or copy-path shortcut
- DP60 Appshots: hotkey attaches an app window to a thread (ChatGPT): It does not attach a chosen app window
- DP61 Artifacts and design handoff from a Code session (Claude): No command pulls a design system from a repository into designs
- DP62 Attach a note when answering a permission prompt (Claude): Chat approvals do take a note: apps/web/features/chat/components/approvals/ApprovalInbox.tsx:227-239 has a field 'Add g…
- DP63 Automatic context compaction and manual compact (Claude): There is no command to compact on demand
- DP64 Command and network approvals grouped by host, with allowed hosts (ChatGPT): Ours has no such prompt: a cloud session picks one of three fixed network modes before it starts (apps/web/features/cod…
- DP65 Context usage card with per-category breakdown and /context (Claude): There is no per-category breakdown and no /context command
- DP66 Custom agents and parallel subagents (ChatGPT): Code sessions run one agent per task with no parallel child agents
- DP67 Default permission mode remembered for new sessions (Claude): It is not remembered per folder or repository
- DP68 Diff view with line counts, file by file (Claude): No +/- line counts
- DP69 Effort level selector in code sessions (Claude): The code composer has no effort selector
- DP70 False-positive reasons carried into later scans (ChatGPT): Dismiss marks a finding dismissed in that report with no reason
- DP71 Fast mode for the top model (lower latency, higher cost) (Claude): The code composer does not offer it
- DP72 Interrupt, or steer a running task by typing a correction (Claude): The message box cannot send while a task runs, so a correction needs Stop first
- DP73 Keyboard shortcuts list with rebinding (Claude): The Desktop app group has no recorder (apps/web/features/chat/components/dialogs/KeyboardShortcutsDialog.tsx:303-31
- DP74 Long-running tasks and multi-day migrations (Claude): A task stops after its step bound (12, 24 or 48) or a time limit; larger jobs need further tasks
- DP75 Model picker in the session start row (Claude): The model follows the account model choice, with a per-session picker only for coding-agent harnesses
- DP76 Move a CLI session into the desktop app (Claude): There is no command that opens a terminal session in the app
- DP77 Network access limits with allowed domains for sandboxed commands (ChatGPT): There are no deny rules
- DP78 Pane layout: drag, resize, pop out and minimize panes (Claude): Diff, terminal and other code panes cannot
- DP79 Pinned, scheduled and recent session lists (Claude): Sessions cannot be pinned and scheduled runs are not a group
- DP80 Plan steps (pending, in progress, completed) and combined turn diff (ChatGPT): No plan checklist with step status is shown
- DP81 Project instruction files with fallback names and size limit (ChatGPT): Cloud sessions read AGENTS.md, CLAUDE.md and .agiworkforce/instructions.md, up to two sources; names and cap are fixed
- DP82 Project instructions files layered by folder (AGENTS.md, nearest wins) (ChatGPT): A cloud Code session does not read layered instruction files from the repository
- DP83 Record and Replay: turn a demonstrated workflow into a skill (ChatGPT): The skill recorder takes screenshots every few seconds and records no clicks or typing
- DP84 Review scopes and hunk-level stage or revert (ChatGPT): There are no hunk actions and no staged, branch or last-turn views
- DP85 Session details panel beside the chat: where it runs, connectors, files it made, changes, background tasks (Claude): There is no card for where it runs, no connectors count and no list of files the session made
- DP86 Share a coding session by link as a read-only snapshot (ChatGPT): Public means anyone signed in to AGI, the link shows the session as it is when opened rather than a frozen snapshot, an…
- DP87 Share plugins with workspace teammates (ChatGPT): The cited route is read-only: apps/web/app/api/plugins/organization/route.ts exports GET only and lists what the worksp…
- DP88 Status line while a coding task runs: elapsed time, tokens and current phase (Claude): No token count
- DP89 The agent asks you short questions with a free-form answer (ChatGPT): Apps/web has no reference to it
- DP90 Transcript view modes: Normal, Thinking, Verbose (Claude): Cloud Code offers Normal and Verbose only

**Connectors, apps, plugins and skills** (4)
- DP91 Curated role plugin packs and single-app plugins ★: No curated role packs were found
- DP92 Record a skill by demonstrating a workflow ★: There is no update-existing-skill proposal
- DP93 Plugin install scope: you, a repository or local (Claude): There is no per-repository scope
- DP94 Reload plugins, skills and MCP servers mid-session (Claude): It is a repair button in the plugin screen, no

**Cross-device continuity** (1)
- DP95 Control another of your computers from this desktop app (ChatGPT): There is no Connections setting, and you send a task rather than open that computer's chats

**Device and OS integration** (8)
- DP96 Command Palette item in the View menu ★: The native View menu has Search, not a Command Palette item
- DP97 Share the front window with chat (Appshot, click a window) ★: Only on Mac (it needs the computer-use input helper) and pastes into the main window
- DP98 Split view: two conversations side by side ★: There is no two-full-conversations split
- DP99 Admin allow or block of computer use per app (ChatGPT): They cannot list apps
- DP100 Attach a screenshot from the quick shortcut (Claude): You cannot drag a region, and it hides Quick Ask instead of attaching there
- DP101 Confirm before quitting while work is running: Does not cover what the row says
- DP102 Deep links to Skills, the new scheduled task form and a plugin's install page (ChatGPT): None opens the Skills page, the new-schedule form or a plugin install page
- DP103 Let an always-on personal agent use this computer, with Allow and Revoke per computer (ChatGPT): There is no per-agent Allow or Revoke and no offline state shown

**Help, feedback and support** (2)
- DP104 Send feedback with logs or the chat attached (ChatGPT): It deliberately attaches no logs and no conversation, and has no share-this-chat option
- DP105 Task Manager and performance trace (ChatGPT): There is no Task Manager, though Settings lists what is running in the background

**Notifications** (2)
- DP106 Activity list of running, waiting and finished work with filters (ChatGPT): It has no running or waiting view and no filters
- DP107 Settings to choose which alerts you get, with sound (ChatGPT): Only for coding sessions on this computer

**Privacy and security** (1)
- DP108 Per-site rules for agent browsing (access, uploads, downloads) (ChatGPT): No separate upload, download or history permission

**Privacy, security and data** (1)
- DP109 Export usage and activity events to your collector (OpenTelemetry) ★: There is no OTLP export or prompt-capture policy

**Projects and organization** (2)
- DP110 Projects as workspaces with own instructions, scheduled tasks and context (Claude): No project-scoped scheduled tasks or import path
- DP111 Sidebar filter, sort and chronological view (ChatGPT): No filters by source or archived state and no sort options

**Settings** (15)
- DP112 Computer use limits: no terminals, no admin prompts, view-only browsers ★: There are no view-only tiers and no hard block
- DP113 Quick chat shortcut: double-tap a key or Option+Space ★: Option+Space and double-tap Option are not offered
- DP114 Appearance: theme, accent colour, fonts, code theme (ChatGPT): No custom background or foreground colours, UI font or theme sharing
- DP115 Browser data: history, clear data, download folder (ChatGPT): No history, time range or download folder, and the pane serves coding sessions
- DP116 Check for updates, with a switch to turn update checks off (ChatGPT): No switch to turn checks off and no admin version pinning
- DP117 Commands, slash commands and deep links reference (ChatGPT): No reference lists the deep links
- DP118 Dock and menu bar visibility, autocorrect off (ChatGPT): There is no Dock hide option and no autocorrect setting
- DP119 Extensions manager for installable desktop extensions (Claude): There is no installable extension package or directory
- DP120 Keep the computer awake while the app works (Claude): Only while a coding session on this computer runs or a phone is connected, not for chat, Work or computer-use runs
- DP121 Next-prompt predictions toggle (ChatGPT): There are no predictions written into the empty composer
- DP122 Open chat links in the default browser preference (ChatGPT): There is no preference to choose otherwise
- DP123 Output style for coding sessions (explanatory, learning, custom) (Claude): Code sessions have no output style setting
- DP124 Profile card with activity insights (ChatGPT): No token totals, streaks, picture or username
- DP125 Set a custom shortcut combination (Claude): You pick from three preset chords per shortcut, or none
- DP126 Work with Apps: read the frontmost app and edit its content (ChatGPT): Nothing reads an app's text or lists compatible apps, and there is no switch

**Teams and admin** (6)
- DP127 Stream organization activity to a SIEM or OpenTelemetry collector ★: It is not OpenTelemetry and carries no per-action desktop agent events
- DP128 Admin policy for the desktop in-app browser (allow and block lists, downloads, cookies) (ChatGPT): Cannot set per-site, download or cookie policies for the in-app browser
- DP129 Admin pushes organization MCP servers and local MCP rules to the desktop (Claude): Cannot push or block local MCP servers on a device
- DP130 Cloud and local policy kept apart (Global policy API versus local-device policy) (ChatGPT): There is no separate device-level layer
- DP131 Enterprise deployment packages for IT (Claude): No pkg installer or Windows package
- DP132 Remote Control controls: admin blocks it or requires verified devices (Claude): There is no admin rule that requires device verification before a member steers a desktop

**Voice** (4)
- DP133 Dictation shortcut that works from any app ★: Caps Lock is not offered
- DP134 Voice chat hotkey (ChatGPT): What is missing is the leader's setting: the chord cannot be chosen (n
- DP135 Voice conversation that works across Chat, Work and Code (ChatGPT): It does not exist in Code: grep for voice in apps/web/features/code/components/CodeComposer.tsx finds nothing, and the…
- DP136 Voice starts, checks and steers other tasks (ChatGPT): It cannot check on or steer other existing tasks or switch to them
