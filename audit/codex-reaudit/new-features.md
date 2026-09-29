# Codex re-audit: new capabilities for the owner to review

These checklist items describe capabilities Claude or ChatGPT have that the
product does not have at all: nothing in our code, UI, docs or copy claims or
partly builds them. The owner decided on 2026-09-27 that missing features are
out of the current run and are reviewed later, so none is scheduled. Each entry
names the capability; decide build, decline (record it in `docs/decisions/`), or
defer, then move it to the ledger or delete it here.

Entries: 146.

## Web

- **01/178**: Raise the per-file cap to at least 30 MB and the per-message count to 20 (and the combined request budget to match) across the contract, presign/put routes, composer hook and hydration, keeping the exceed-limit errors.
- **01/222**: Add a workspace-level Code execution and file creation control (default on, owner/admin only) that narrows the per-user toggle, enforced server-side in code-execution-policy and reflected in /api/me capabilities and the workspace console.
- **01/226**: Add an owner-only workspace setting for the chat code-execution sandbox network (off, package managers only as default, specific domains plus package managers, all domains) enforced in the E2B runtime scope for members' chats.
- **01/243**: Let a project owner share with directory groups (Can view or Can edit) and resolve group membership in project access checks, keeping the existing role restriction and admin disable.
- **01/351**: Add an Artifacts switch to Settings Capabilities (persisted with the other capabilities settings) that stops the model offering and rendering artifacts in chat when off, and document it in the help article.
- **01/365**: Add a workspace-level code-execution-and-file-creation control (and a network-access mode: none, package managers only, allowlist) enforced in resolveCloudCodeExecutionPolicy and the sandbox egress, shown in the workspace console.
- **01/366**: Add a Primary Owner-only organization data export (members, conversations, projects, artifacts) as an async archive with audit event, surfaced on the workspace Data page.
- **01/392**: Add an incident subscription channel on /status: a feed (RSS/JSON) of incidents plus an opt-in browser notification when the notice endpoint reports an incident.
- **02/444**: Publish a network-requirements help page listing the required and reduced host allowlists, generated from the desktop CSP and cloud origins so it cannot drift.
- **02/461**: Add a keyboard-navigable Views menu (useMenuKeyboard) to the code session toolbar that opens the existing diff, terminal and file panes and any plan or task view the session data supports.
- **02/467**: Extend DetachablePanel to the Code changes and terminal panes so they pop out through the existing agi-panel window path and dock back.
- **02/495**: Add Ctrl+Tab / Ctrl+Shift+Tab handlers on the Code page that select the next or previous session in the rail order (effective in the desktop shell, where Ctrl+Tab is not reserved by browser tabs).
- **02/496**: Bind Cmd+Shift+] and Cmd+Shift+[ (Ctrl on Windows) to select the next/previous session in the same handler as Ctrl+Tab.
- **02/497**: When a Code turn (cloud or local) is running and no menu or suggestion is open, Escape calls the existing stop handler.
- **02/498**: Bind Cmd/Ctrl+Shift+D to toggle the Changes (diff) panel on the Code page and list it in the shortcut sheet.
- **02/501**: Bind Ctrl+` (both platforms) to open the terminal in the Changes panel for local sessions and to close it again.
- **02/503**: Build a Code side chat (a read-only branch that answers questions about the session without touching its history) opened with Cmd/Ctrl+;.
- **02/504**: Bind Ctrl+O to toggle the transcript view between Normal and Verbose in the Code page.
- **02/505**: Add a Code effort menu beside the mode and model controls and open the permission-mode, model and effort menus with Cmd/Ctrl+Shift+M, +I and +E.
- **02/507**: Add inline line comments to the diff view that are sent to the agent as one turn, submitted with Cmd/Ctrl+Enter.
- **02/517**: Add @ autocomplete over workspace files in the local session composer (desktop only, as Claude is not in cloud) that inserts the file reference into the turn.
- **02/525**: Record reasoning summaries on turns and add a Thinking transcript mode that appears only once thinking was produced.
- **02/529**: Add an auto-archive-on-PR-merge-or-close setting handled from the existing GitHub pull_request closed webhook, and release the session workspace on archive.
- **02/531**: Let a schedule start a Code session on a repository and list those sessions under a Scheduled section in the Code rail.
- **02/532**: Let the agent propose an out-of-scope task as a chip that starts a new session with its own workspace after user confirmation.
- **02/534**: Give the agent tools to list, read, message, rename and archive the user's other sessions (archive always asks), with messages shown as a sender-titled card linking to the session.
- **02/539**: Remember the chosen local mode per folder (never Plan) and restore it when a session opens in that folder.
- **02/551**: Support multiple terminal tabs (plus button) per local session and an Open in terminal action on folders in the file list.
- **02/557**: Add per-line diff comments with Enter to add and Cmd/Ctrl+Enter to send all comments to the session as one message.
- **02/566**: Add a workspace policy for managed SSH connections (shown read-only) and a host allowlist where an empty list disables SSH.
- **02/570**: Add a workspace policy to disable local Code sessions, gray out Local in the environment menu with an explanatory tooltip and refuse to start one in the desktop.
- **02/622**: Add a workspace-policy allowlist of local folder roots (and a require-sandbox switch for local commands) that the desktop shell fetches and enforces when granting roots and running commands.
- **02/659**: Bypass mode, worktree location and Browser toggles are not applicable to the cloud-only Electron desktop, but the branch prefix (fixed at agi/) and auto-archive after PR merge or close are generic cloud-session settings with no control;...
- **03/788**: Add a 'voice' workspace feature to the workspace controls, enforce it in the capability handshake and live/dictation/speech voice routes, and let clients show it as switched off by the workspace.
- **05/1770**: Add an optional per-environment setup script that runs in the sandbox after clone and before the agent, fails the session with the script's stderr on non-zero exit, and reuses a paused snapshot for later sessions when it ran fast.
- **05/1773**: Add saved named cloud environments (network tier, runtime, extra hosts, setup script) that a user can create, select in the composer, archive and, with admin permission, share across the workspace.
- **05/1777**: Allow a session to attach more than one repository, each with its own branch, cloned into separate workspace folders, with per-repository changes and pull requests.
- **05/1779**: Read `prompt` (alias `q`) and `repositories`/`repo` from the /code URL to prefill the composer draft, never auto-submitting, and skip any prompt_url fetch.
- **05/1787**: Let users add comments on diff lines, queue them, and bundle them into the next message to the agent.
- **05/1821**: Add a Code setting that archives a finished session automatically when its pull request is merged or closed, using the PR status the session already polls.
- **05/1825**: Give the local developer agent session-management tools (list, read, message, rename, archive) that always ask before archiving another session, and let a suggested side task start a new session.
- **05/1831**: Persist the last non-Plan mode per approved folder and use it as the starting mode of the next local session there.
- **05/1840**: Add a +added/-removed indicator, per-line comments on the diff, and a submit-all action that sends the comments to the agent.
- **05/1844**: Let the local terminal run concurrent sessions in tabs with a + control, add a Ctrl+` toggle, and offer Open in terminal on workspace folders.
- **06/1940**: Add an owner-gated workspace data export (members conversations, projects, files manifests) in Workspace Data controls that reuses the streaming exporter without requiring a legal hold, with audit event and step-up.
- **06/1962**: Publish a distinct commercial (organisation) terms page linked from /legal, the enterprise page and workspace creation, with its own revision date, and record org-owner acceptance per version.
- **06/1975**: Publish an incident history on /status backed by a small store and add an Atom feed people can subscribe to.
- **06/1993**: Add an authenticated inbound-email webhook (reply-to token per ticket) that appends a verified reply to the existing ticket thread, and put the tokenised reply-to on customer ticket emails.
- **06/2025**: Add an optional per-member monthly credit cap (default and per-user override) enforced in the managed spend gate alongside the org cap, with admin UI and usage-analytics display.
- **WEB-005**: Build "Share with specific people" as a third share audience (migration, recipients, invites).

## Desktop

- **02/431**: Add a signed and notarized universal-or-per-arch pkg target for managed installs to electron-builder.yml and the release workflow, publish it with checksums, or record an explicit decision that enterprise PKG is cut.
- **02/470**: Add a keyboard-accessible file-path menu (useMenuKeyboard) to paths in code transcripts and the local file editor with Attach as context, Open in editor, Show in Finder and Copy path, wired to the existing runtime commands with per-path...
- **02/500**: After the Browser pane lands, add an element picker that hands the selected element's selector and text to the composer, bound to Cmd/Ctrl+Shift+S.
- **02/554**: Add a server menu to the browser pane toolbar with start/stop, stop all, persist sessions, edit configuration and an auto-verify toggle.
- **02/555**: Read a project launch config (name, command, args, port, cwd, env, autoPort, url, autoVerify) from our own path and prompt on port conflicts.
- **02/556**: Add Settings controls to clear saved browser session data and disable the Code browser pane.
- **02/564**: Add SSH environments to the Code environment menu with a dialog for name, host, port (default 22) and identity file.
- **02/565**: Validate the remote is Linux or macOS and install or update the AGI CLI on it over SSH when an SSH environment is added.
- **02/568**: Add a gear on the local folder that edits environment variables, stored encrypted with Electron safeStorage and passed to the session process.
- **02/600**: Add a macOS background mode that delivers input to the approved app's process without moving the user's cursor or taking focus, so the user can keep working, while keeping pause-on-typing and the stop shortcut.
- **02/651**: Add a 'new' target to the desktop deep-link contract that routes to buildNewChatHref with the q draft (draft only, never auto-sent, length-capped) and cover it with a parser and destination test.
- **02/653**: Folder and file parameters stay out, but a link that opens a new AGI Code session with a prefilled prompt has no counterpart: the Code page reads no q draft and the deep-link contract has no code/new target; add one (draft only, never...
- **02/654**: Let the new deep-link target from 02/651 carry mode=agiwork so an external link opens AGI Work with a prefilled draft, folders and files excluded.
- **05/1814**: Add an environment editor (gear) with encrypted variables for local sessions (stored in the OS credential store, injected into the session shell) and env vars for cloud environments; SSH is tracked in 05/1815 and WSL is not applicable on...
- **05/1815**: Add an SSH environment (name, host, port, identity file) that runs the developer host on a Linux/macOS remote and lists it in the environment picker; the managed sshConfigs/sshHostAllowlist admin part is not required (see 05/1810).
- **F-DESK-017**: Build SSH environments for the Electron desktop Code tab (connection dialog, safe argv, remote CLI install).
- **F-DESK-020**: Add a macOS device-level managed policy (MDM profile) for the public Electron shell, including update control.

## Mobile

- **03/743**: Require a biometric or passkey re-check on mobile before attaching to or steering a remote local or CLI session when the last sign-in is older than a set age, tied to the existing trusted-device list.
- **03/790**: Enable background audio for voice sessions (UIBackgroundModes audio and expo-audio background config), keep the live session alive on lock, handle audio interruptions (calls, Siri), and offer a setting to turn it off.
- **03/821**: Build the read-only iOS Apple Health integration (steps, workouts, sleep, heart rate as derived summaries, opt-in, US only, never written to memory) per the MS-1 constraints, shipped behind a flag until the owner signs the vendor agreement...
- **03/822**: Add code-session and new-code-session product link targets (universal link and agiworkforce:// route) that open cloud-code/[sessionId] or prefill NewCloudCodeSessionSheet from prompt, repo and branch parameters without auto-submitting,...
- **03/832**: Add a permission-mode choice (manual approve, accept edits, plan; never bypass) to remote Code session start/steer in the remote-code contract, CLI host and mobile session view, and an accept-edits option beside Agent/Plan in the cloud...
- **03/833**: Add an attachment (photo/file) path to remote Code steering: new request action and size-bounded encrypted payload in the remote-code contract, mobile picker in CodeSessionView, CLI host handling, no absolute-path leakage.
- **03/835**: Add a Code Projects view on mobile that groups a project's parallel cloud/remote Code sessions under one coordinating conversation, or record a founder decision that Claude Code's Projects tab is not required.
- **03/901**: Add device_alarm_set and device_timer_set phone-step tools (time, recurrence, label) that fire the Android AlarmClock intent after user confirmation, declared in the phone capability list and the web device-tool registry.
- **03/902**: Add an opt-in approximate-location capability on Android (runtime permission, Permissions screen row, per-request approval, off for Team and Enterprise workspaces) that supplies location to chat only when the user allows it.
- **03/903**: Add a read-only Android Health Connect integration (Android 14+, US only, Pro and Max, off in work profiles) with per-data-type permission, disconnect and no memory or training use, consistent with D-2026-09-28-08.
- **04/1104**: Carry image or file attachments in the remote-code steer and start requests and have the CLI host store them and turn them into @ references.

## CLI

- **04/1002**: Add --append-subagent-system-prompt and --append-subagent-system-prompt-file (print mode only) and append the text to every spawned subagent's system prompt, with a test.
- **04/1016**: Add --disable-slash-commands that skips loading custom commands and skills for the run, sharing the plumbing of the --bare item.
- **04/1028**: Add --json-schema <file/inline> for print mode that validates the schema up front (clear error on an invalid schema), constrains or checks the final response, and returns a non-zero exit code on mismatch.
- **04/1036**: Add a repeatable --plugin-dir/--plugin-url flag that loads a plugin for one session without installing it, honouring plugins.require_signed and managed policy.
- **04/1041**: Add --restricted that applies the untrusted-workspace restrictions (no shell, network, secrets, MCP auto-start) non-interactively, ignores user/project settings, keeps managed policy and refuses bypass modes.
- **04/1043**: Add --safe-mode that skips user/project customizations (hooks, plugins, skills, custom commands, MCP auto-start) while keeping managed policy in force.
- **04/1060**: Add a configurable status-line command that gets session JSON on stdin and renders its (multi-line, ANSI/OSC8) output as its own row, trust-gated for project config.
- **04/1070**: Show a dimmed suggested prompt (from recent git history at session start, and a model-derived next prompt after a reply) that Tab or Right accepts, skipped in plan mode and near the limit.
- **04/1082**: Add a ui.max_prose_width setting that caps wrapped response line width in the chat renderer.
- **04/1083**: Add :shortcode: to emoji replacement in the composer with an optional completion popup and a ui setting to turn it off.
- **04/1084**: Add optional composer spellcheck through an installed aspell/hunspell/ispell with enabled, checker and language settings, off by default.
- **04/1099**: Add a Ctrl+R history-search overlay to the TUI (incremental filter, Enter accept, Esc cancel).
- **04/1109**: Add Ctrl+Z suspend and resume on Unix and Alt+P/T/O chords for the model picker, effort and fast mode.
- **04/1111**: Add a prompt-suggestions toggle (grayed next-prompt suggestion) and, if kept, emoji and spellcheck toggles to the CLI /config and TUI composer, or record a specific ruling that closes them.
- **04/1117**: Add a validated insert-mode remap setting (for example jj to Esc within a one-second window) to the TUI Vim editor, readable from user and managed config only.
- **04/1129**: Extend KeybindingAction beyond the six globals to the chat, picker and history actions the TUI already implements, keeping confirmation keys fixed.
- **04/1130**: Accept space-separated chord sequences with a 3s timeout and the meta/win modifier aliases in parse_binding and matching.
- **04/1135**: Enable Kitty keyboard enhancement flags with alternate-key reporting and match bindings by the US-layout base key when the terminal supports it.
- **04/1144**: Add /autocompact [auto/<tokens>] and a config key that set the auto-compact token limit and pass it to the shared context engine.
- **04/1151**: Add /cd <path> that re-roots the session workspace, reloads project instructions and git context, and respects workspace-root allowlisting.
- **04/1162**: Add /dataviz [request] as a prompt command that guides the agent to produce an accessible chart or data visualization from the user's data, registered like /recap.
- **04/1164**: Add /deep-research <question> that runs a fan-out web research pass with the researcher agent and returns a cited report, gated on the deep_research plan capability.
- **04/1193**: Add /loop [interval] [prompt] that re-runs the prompt in the current session on an interval (self-paced when none given) with a visible indicator and a stop command.
- **04/1211**: Add /reload-skills (shared with /reload-plugins) that re-scans skill dirs, rebuilds the command registry and the prompt's skill catalog, and reports the count.
- **04/1261**: Build an Auto mode where a classifier reviews each tool action with allow/deny rules and a 'switch to auto mode' offer on the approval prompt, gated on a supported model and plan and disabled by managed policy.
- **04/1263**: In acceptEdits mode, waive the bash approval for a single-segment mkdir/touch/mv/cp whose every path argument resolves inside the workspace and is not a protected path, using classify_filesystem_effect plus validate_workspace_write_path;...
- **04/1290**: Add a user-level switch (config key and env var) that turns all hooks off and is honoured wherever hooks_allowed() gates a run; shares the isolate-customizations run with 04/1043.
- **04/1305**: Expand @path imports in instruction files (relative to the file, depth cap 4, skipped in code spans), counted against the instruction token budget, and require a one-time approval before importing a path outside the workspace.
- **04/1331**: Add a MessageDisplay event fired before an assistant message is rendered, letting a hook replace the displayed text without changing the stored transcript.
- **04/1340**: Add a ConfigChange event fired when the user config, workspace policy or skills change during a session, with the source in the payload.
- **04/1342**: Fire DirectoryAdded from /add-dir and --add-dir with the path and source, and honour a block.
- **04/1348**: Add a PreModelSwitch event fired from switch_model with from/to model, honouring a block decision so the switch is refused.
- **04/1349**: Add a PostModelSwitch event fired after switch_model and session-resume model restore, with from_model/to_model in the payload.
- **04/1352**: Add an http handler (POST payload, headers, allowed env vars) and command async/shell options first, then prompt/mcp_tool handlers that fit the existing sandbox and consent model.
- **04/1361**: Add a user-level disable-all-hooks setting or --no-hooks flag checked in run_hooks alongside hooks_allowed.
- **04/1365**: Ship built-in read-only explore and plan agent definitions (read tools only, no edits) in discover_agents.
- **04/1366**: Parse and enforce effort, isolation: worktree, initialPrompt, memory scope and per-agent hooks in the agent frontmatter.
- **04/1393**: Expand ${VAR} and ${VAR:-default} in command, args, env, url and headers when loading .mcp.json (failing clearly on an unset variable without a default) and add a trust-gated headersHelper.
- **04/1408**: On resume of a large, long-idle session (over a token threshold), offer Resume from summary (compact first), Resume full session, and Don't ask again; skip Anthropic plan gating.
- **04/1413**: Add a project purge command that deletes every local managed session, checkpoint and metadata for a workspace after confirmation.
- **04/1490**: Add a --debug-file PATH flag (implying debug) that makes init_tracing write to that file, owner-only permissions and redacted.
- **04/1491**: Add a --safe-mode flag that skips hooks, plugins, MCP registry, custom commands, memory and project config for the session, and shows a visible indicator.
- **04/949**: Add requiredMinimumVersion and requiredMaximumVersion to the managed config section and refuse to start (with an actionable message naming agi update) when the running version is outside the range.
- **04/964**: Add a managed-policy setting that restricts login to an organization id (and rejects env-supplied credentials outside it), enforced at agi login and at startup with a clear message.
- **04/986**: Add `agi plugin validate <dir>` that loads the manifest, checks required fields, paths and signature shape, and exits non-zero with each problem listed.
- **04/987**: Add `agi projects purge [path]` with --dry-run, --yes and --all that lists then deletes the local sessions, registry entry and per-project state for that path.
- **04/993**: Before a one-shot run, if the prompt is a single word within edit distance 2 of a subcommand name, print `Did you mean agi <name>?` and exit 2 instead of calling the model.
- **05/1515**: Detect a VS Code integrated terminal in the CLI, offer or run the extension install once, and add an opt-out config key.

## VS Code

- **05/1514**: Add a Troubleshooting section to the README and marketplace description covering Reload Window and the CLI-in-terminal fallback.
- **05/1517**: Document uninstall and reset steps (Extensions view, stored state, sign out, cliPath) in the README.
- **05/1526**: Open editor chats beside the active editor in their own group and lock that group, behind a setting to turn it off.
- **05/1528**: After a reload restores the thread, offer or perform continuation of a turn interrupted within the last hour with an in-chat notice when no other host holds the writer, behind a setting.
- **05/1566**: Add an opt-in setting that starts remote control for the window at startup and applies to open sessions, with a visible indicator, and disconnects open sessions when turned off.
- **05/1574**: Stream reasoning summaries from the runtime and render collapsed expandable thinking rows in the transcript with a toggle for all rows.
- **05/1587**: Strip invisible/format Unicode from pasted text, show a 'Removed N invisible characters' notice, and on send withhold the message and return the cleaned text to the box if any remain.
- **05/1599**: Add an agent-callable notebook execute tool that inserts the code as a new cell, asks Execute or Cancel in a Quick Pick, and refuses without an active Jupyter notebook or Python kernel.
- **05/1609**: Add an archiveInactiveSessions setting (1, 2, 7, 14 days, or never) and auto-archive idle sessions that are not open, unread or grouped.
- **05/1614**: Add per-workspace session groups with create, move, remove, rename and delete, multi-select in the list, and an Add Session Tab to Group command, with flat search results.
- **05/1615**: Add an Active toggle and a Filter by status (Needs input, Working, Completed, Open, Closed) that persists across reload and hides archived while filtering.
- **05/1628**: Add a Focus Last Message command that posts to the webview and focuses the newest message or the waiting approval prompt.
- **05/1632**: Lock the editor group that hosts the Open Chat in Editor tab (workbench.action.lockEditorGroup) behind an agiWorkforce.lockEditorGroups setting defaulting to true.
- **05/1635**: Add a send-key setting (Enter or Cmd/Ctrl+Enter) honoured by the composer keydown handler.
- **05/1639**: Add an agiWorkforce.archiveInactiveSessions setting (days, default 14, 0 disables) that archives idle local sessions via the existing thread/archive method.
- **05/1640**: Persist the in-flight turn marker and, after reload, offer or auto-run continuing the interrupted step, gated by an agiWorkforce.continueAfterReload setting defaulting to true.
- **05/1642**: Add a Focus view toggle (setting plus command) that hides tool and intermediate blocks in the transcript and shows prompts and final replies only.
- **05/1644**: Add a usePythonEnvironment setting (default true) that resolves the workspace interpreter through the Python extension and runs the agent's shell commands with that environment activated.
- **05/1645**: Add a machine-scoped environmentVariables name/value array setting, merged into the runtime spawn env, never settable by a workspace and never logged.

## Chrome

- **05/1706**: Add a built-in blocked-category check (adult content, known pirated-content sites) that refuses browser-agent actions and navigation, alongside the existing sensitive-site classifier.
