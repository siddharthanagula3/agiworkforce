---
id: "F066-04"
type: "feature"
title: "Terminal and command history"
aliases: ["Integrated terminal", "Terminal tabs", "Command history", "Running in this folder", "Keep running", "Background tasks", "S66.15", "S66.16", "S66.17"]
area: "66 Coding-workspace frontend"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S66.15", "S66.16", "S66.17"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "surface:vscode", "surface:mobile", "mode:local", "mode:cloud", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "F066-01", "SYS-subscriptions-entitlements-and-usage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F066-04 Terminal and command history

Run shell commands tied to the session folder and review what ran. Desktop and web in Electron offer terminal tabs (a real shell, or a one-command-at-a-time fallback) and a list of running commands to stop. Cloud sessions show output, errors and exit codes. The CLI uses a ! prefix and /tasks.

Area: [66. Coding-workspace frontend](README.md). Requirement items: [S66.15](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6615), [S66.16](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6616), [S66.17](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6617).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives a terminal attached to the session folder, shows each command's output and exit status, and lists long-running commands so they can be stopped.

**Why it exists.** A coding agent runs commands, and the person needs to run their own and see what ran (S66.15 to S66.17).

**Who uses it.** Developers on Desktop, web cloud sessions, CLI, VS Code.

**Problems it solves**

- Switching to another terminal app.
- Not knowing a dev server is still running.
- Not seeing why a command failed.

**Use cases**

- Open a terminal tab and run the project's test command.
- Start a dev server with 'Keep running' and stop it from the list later.
- Review the exit code of a failed build.
- In the CLI run !git status and see the result.

## 2. User experience

**Where to find it**

- Desktop and web in Electron: side panel shortcut 'Terminal' (LocalSessionPanel.tsx:705-715; local-code.ts:2022-2030). Bottom dock with tabs labelled 'Terminals', button 'New terminal' (local-code.ts:2029-2031).
- 'Running in this folder' list inside the Changes panel (LocalRunningCommands.tsx; local-code.ts:'runningCommands').
- Cloud session: command box in the changes panel (CodeChangesPanel.tsx:540-575; CODE_COPY.commandLabel).
- CLI: type ! then a command; /tasks list|show|output|stop (tui_app.rs:7383-7405; registry.rs:484-500).
- VS Code: 'Code: Run Terminal Command', 'Code: Add Terminal Output to Chat', 'Code: Explain Terminal Output', 'Code: Suggest Terminal Command' (package.json).
- Mobile: command items in the session timeline (not read in detail), flag-gated.

**Before you start**

- Desktop shell, approved folder, command access allowed (LocalSessionPanel.tsx:662).
- Real shell needs the host's workspaceTerminal capability, which the CLI reports only on Unix systems (developer_host.rs:1063); other systems get 'Command mode'.
- Cloud: sandbox switched on and the session ready (CodeChangesPanel.tsx; commands/route.ts:45-50).
- CLI '!' needs a trusted folder (tui_app.rs:7389-7391).

**Screens and controls**

- Terminal tab strip, each tab closable with 'Close <label>', and 'New terminal'.
- Command mode: prompt '<folder> %', input, buttons 'Stop' and 'Keep running' (LocalTerminal.tsx:259-340).
- PTY mode: a shell with 'Start a new shell' after exit (LocalPtyTerminal.tsx:295-306).
- Running list: 'Stop <command>' and 'Stop all' buttons, 'Preview' (LocalRunningCommands.tsx:140-215).

**Journey**

1. 1. Open Terminal from the side panel; the shell prompts for permission once per folder.
2. 2. Type a command and press Enter.
3. 3. Read output; the last line shows 'exit N' or 'stopped'.
4. 4. For a server choose 'Keep running'; it moves to 'Running in this folder'.
5. 5. Stop it from the list, or close the tab (a dialog warns that closing stops it).
6. 6. Scroll the tab to review earlier commands.

**What the person sees and gets**

- Command mode: output then 'exit N' in error style when not zero (LocalTerminal.tsx:231-247).
- 'Nothing is running in this folder.' when empty.
- '<command> could not be stopped and may still be running.' if a stop fails.
- PTY exit message 'The shell ended with exit code N.' (local-code.ts:1906-1908).

**Settings**

- Terminal sandbox note: the shell has the same limits as the agent's commands (local-code.ts:1909-1910).
- Desktop shell permission policy via readShellPolicy and shellSandbox (dispatcher.ts:2378-2395).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web in Electron: terminal dock with tabs (add, close with stop confirmation, arrow-key focus), command mode and PTY mode, keep-running handoff, running list polling and stop/stop all (LocalTerminal.tsx:259-440; LocalPtyTerminal.tsx; LocalRunningCommands.tsx:60-215). The brief says terminal tabs are missing; the code has them.
- Desktop host: shell_run, shell_start, shell_read, shell_stop plus developer_terminal_open/write/resize/scroll/close, each with a permission reason (dispatcher.ts:699-717, 873-892, 2378-2420, 2810).
- Cloud: output, stderr and exit code per command (CodeChangesPanel.tsx:540-562).
- CLI: ! command, background command registry with 1 MiB kept output and last 20 finished commands (terminals.rs:11-15; tui_app.rs:7383).
- VS Code: terminal provider that runs, captures and explains terminal output (providers/terminalProvider.ts).

**Incomplete**

- Local command entries are not stored: the entries array resets when the folder changes and lives in component state (LocalTerminal.tsx:62-64). So 'history' is only the open tab's list.
- In command mode stdout and stderr are merged into one output; separate stderr exists only in cloud (LocalTerminal.tsx:100-108 vs CodeChangesPanel.tsx:555-562).
- Cloud terminal is blocked until the deployment and managed-compute gates pass.

**Present but disconnected or switched off**

- Mobile terminal and command history: part of the remote session view, flag-off (companion: false).
- Cloud command route returns 'Managed Code is not enabled for this deployment' or 'Managed compute is temporarily unavailable' when gates are off (commands/route.ts:45-52).

**Not available**

- Mobile: no terminal to type in.
- Chrome: not applicable.
- Web in a browser tab: no local terminal.
- CLI terminal tabs: none.

## 4. Required behaviour

**Established requirements**

- The user runs shell commands in a terminal attached to the coding session and sees their output. (source: S66.15)
- The user keeps several terminals open side by side or in tabs. (source: S66.16)
- The user can review the commands run in the session with output and exit status. (source: S66.17)
- A running command can be stopped; if it cannot be stopped the person sees it may still be running. (source: local-code.ts:'stopCommandFailed'; LocalRunningCommands.tsx:114-140)
- The desktop asks for shell permission for the folder before commands run. (source: apps/desktop/electron/runtime/dispatcher.ts:699-717,873-892)
- Terminal/test output is a required developer-screen function. (source: doc: docs/product/experience-contract.md:273)

**Acceptance criteria**

1. Opening Terminal on a new folder triggers a permission request; denying it leaves no running shell.
2. A command that exits non-zero shows 'exit N' in the error style.
3. Stop ends a running command; if the stop fails the row says it may still be running.
4. 'Keep running' moves a dev server into 'Running in this folder' and the entry reads 'Running in the background. Stop it from Running in this folder.'
5. Closing a tab with a running command asks 'Close this terminal?' and names the command.
6. On a platform without PTY support the terminal shows 'Command mode' with its hint.
7. Cloud commands show stdout, stderr and exit code, and are refused with a message when the sandbox is off.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The PTY shell and agent commands share one sandbox policy (LOCAL_TERMINAL_COPY.sandboxed).
- [inferred] A local terminal tab's history ends when the page reloads, since entries are page state.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Persist per-session command history so it can be reviewed after reload.
- [proposed] Show separate stderr in command mode.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LocalTerminal, LocalTerminalDock, WorkspaceTerminalDocks | `apps/web/features/code/components/LocalTerminal.tsx` | Command-mode terminal, tabbed dock, terminal state hook. |
| component | LocalPtyTerminal | `apps/web/features/code/components/LocalPtyTerminal.tsx` | Real shell view with exit and restart. |
| component | LocalRunningCommands | `apps/web/features/code/components/LocalRunningCommands.tsx` | Running list with stop, preview and console error hand-off. |
| component | LocalChangesPanel | `apps/web/features/code/components/LocalChangesPanel.tsx` | Hosts the running list (line 385). |
| component | CodeChangesPanel terminal | `apps/web/features/code/components/CodeChangesPanel.tsx` | Cloud command box and history with stdout, stderr and exit code. |
| hook | use-show-terminal | `apps/web/features/code/use-show-terminal.ts` | Keyboard toggle for the terminal. |
| config | LOCAL_TERMINAL_COPY and LOCAL_PANEL_COPY | `apps/web/features/code/local-code.ts` | Terminal and tab labels (lines 1898-1912, 2022-2040). |
| service | Desktop dispatcher shell and terminal commands | `apps/desktop/electron/runtime/dispatcher.ts` | shell_run, shell_start, developer_terminal_*, with policy and sandbox. |
| endpoint | POST /api/code/sessions/[sessionId]/commands | `apps/web/app/api/code/sessions/[sessionId]/commands/route.ts` | Runs a command in the cloud sandbox with entitlement and managed-compute checks. |
| service | CLI terminals registry | `apps/cli/src/terminals.rs` | Background commands with kept output. |
| command | CLI ! and /tasks | `apps/cli/src/tui/tui_app.rs` | Bang command (line 7383), task list commands. |
| command | CLI tasks_for_display | `apps/cli/src/repl/registry.rs` | /tasks list, show, output, stop (lines 484-500). |
| service | App-server capabilities | `apps/cli/src/app_server/developer_host.rs` | workspace_terminal and background_commands flags (lines 1063-1064). |
| component | VS Code terminalProvider | `apps/extension-vscode/src/providers/terminalProvider.ts` | Run, capture and explain terminal output. |
| component | Mobile CodeSessionView | `apps/mobile/src/features/companion/components/CodeSessionView.tsx` | Timeline of tool and command items (flag-gated). |
| service | codeRemoteController | `packages/platform/utils/src/remoteControl/codeRemoteController.ts` | Sends tool history and running tasks in snapshots (line 600+). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person opens a terminal; the host asks for permission and, for PTY, a confirmation dialog 'Open interactive terminal?' with folder, shell, sandbox and network state. | device | dispatcher.ts:2810-2830 |
| A command runs in the folder under the shell policy and sandbox; output streams back as shell-output events. | device | dispatcher.ts:2378-2395 |
| The page appends output (last chunk limit) and shows exit code when the run result arrives. | device | LocalTerminal.tsx:95-150 |
| Keep running starts a background command; the running list polls the host and offers stop. | device | LocalTerminal.tsx:155-190; LocalRunningCommands.tsx:80-90 |
| Cloud: POST commands runs the command in the sandbox after plan, managed-compute and rate checks. | our servers | commands/route.ts:32-83 |
| Cloud sandbox executes the command. | outside service | E2B (gate.ts); call not read |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Command text, output and exit code | Local: page state only. Cloud: terminalEntries returned by the session API (CloudCodePage.tsx:719,1070); store behind it not read. | cloud entries are server-side; local not synced | local lost on reload; cloud retention unknown |
| Background command runs | Host process memory (CLI keeps last 20 finished, 1 MiB output) | no | ends with the host process |

**Models and providers.** No model is involved when the person types a command. The agent's own commands are model-driven in the chat turn pipeline (SYS-chat-turn-pipeline).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Local terminal needs no account call found; cloud commands need sign-in. |
| Permissions | shell.execute per folder, with reasons shown to the user (dispatcher.ts:699-717); PTY adds a main-process confirmation dialog (dispatcher.ts:2812-2830). |
| Subscription | Cloud commands call evaluateManagedComputeAccess against the entitlement bundle (commands/route.ts:55-70). |
| Limits and metering | Command length limit CODE_LIMITS.command = 2000 (code-surface.ts:73); local run timeout SHELL_TIMEOUT_MAX_MS (LocalTerminal.tsx:104); cloud handler maxDuration 600 s (commands/route.ts:22); rate limit 'chat-conversation'. Sandbox compute is metered (compute-metering, not read). |
| Feature flags | AGI_E2B_EXECUTION, E2B_API_KEY, AGI_MANAGED_COMPUTE_PRIVATE_BETA for cloud; capability workspace_terminal (Unix only) for PTY. |
| Model compatibility | none found in the code. |
| Provider restrictions | Cloud sandbox is E2B. |
| Local mode | Mode:local terminal runs on the device under the folder's permission and sandbox, with no payment and no server call. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Starting | 'Starting the shell…'. | local-code.ts:1904 |
| Start failed | 'The terminal could not start.' with restart. | LocalPtyTerminal.tsx:295-306 |
| Running | Spinner 'Working' and a Stop button. | LocalTerminal.tsx:236-240,316-320 |
| Command failed to start | Entry with 'That command could not be run.' | LocalTerminal.tsx:107-120 |
| Stop cannot be confirmed | Failure line stays until the run ends. | LocalRunningCommands.tsx:88-95 test; local-code.ts:'stopCommandFailed' |
| Empty running list | 'Nothing is running in this folder.' | local-code.ts:runningCommandsEmpty |
| Close with running command | Confirmation 'Close this terminal?'. | LocalTerminal.tsx:421-440 |
| Tab closed while a background start is pending | The start is cancelled. | LocalTerminal.test.tsx 'cancels a background start that is still starting when its tab is closed' |
| Offline / reconnect | not handled in the code for the local terminal. | not handled in the code (searched LocalTerminal.tsx) |
| Accessibility | Output area aria-live polite; labelled command input; arrow keys move between tabs. | LocalTerminal.tsx:290,312-320; tab focus code lines 440-450 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/components/LocalTerminal.test.tsx`: Keep-running hand-off to the list, background exit, stop of a pending start, tab close behaviour, prompt with folder name, command-mode hint.
- `apps/web/features/code/components/LocalPtyTerminal.test.tsx`: PTY terminal view (cases not read).
- `apps/web/features/code/components/LocalRunningCommands.test.tsx`: Per-folder list with durations, stop one or all, failed stop stays visible, preview open and console error hand-off.
- `apps/web/features/code/components/LocalSessionPanel.panes.test.tsx`: Panel panes including terminal (cases not read).
- `apps/extension-vscode/src/__tests__/terminalProvider.test.ts`: VS Code terminal provider.
- `apps/extension-vscode/src/__tests__/terminalShellIntegration.test.ts`: Shell integration capture.
- `apps/cli/tests/developer_session_host.rs`: App-server developer host (terminal cases not read).
- `apps/desktop/electron/__tests__/dispatcher.test.ts`: Dispatcher commands (shell cases not read).

**Test scenarios**

- **Failing command**
  1. Open Terminal, run 'false' (or any failing command).
  - Expected: Output area ends with 'exit 1' in the error style.
- **Dev server**
  1. Type a server command, press 'Keep running', open the Changes panel.
  - Expected: It appears in 'Running in this folder' with its run time; Stop removes it.
- **Permission denial**
  1. Deny shell permission for a new folder, open Terminal.
  - Expected: No shell starts and the refusal is explained.
- **Close running tab**
  1. Run a long command, click the tab close button.
  - Expected: A dialog warns the command stops, and confirming stops it.
- **Cloud off**
  1. On a deployment without the sandbox switch, send a cloud command.
  - Expected: The route refuses with 'Managed Code is not enabled for this deployment'.
- **CLI bang command**
  1. In an untrusted folder type !ls.
  - Expected: Message says shell commands stay off until /trust grant.

**Where to look when it fails**

- shell-output runtime events.
- Error strings commandFailed, runningCommandsFailed, stopCommandFailed, LOCAL_TERMINAL_COPY.failed and closeFailed.
- Server errors capabilityUnavailable and managed-compute gate responses.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/066-coding-workspace-frontend.md](../../70-qa/test-plans/web/066-coding-workspace-frontend.md)
- Desktop: [70-qa/test-plans/desktop/066-coding-workspace-frontend.md](../../70-qa/test-plans/desktop/066-coding-workspace-frontend.md)
- Mobile: [70-qa/test-plans/mobile/066-coding-workspace-frontend.md](../../70-qa/test-plans/mobile/066-coding-workspace-frontend.md)
- CLI: [70-qa/test-plans/cli/066-coding-workspace-frontend.md](../../70-qa/test-plans/cli/066-coding-workspace-frontend.md)
- VS Code: [70-qa/test-plans/vscode/066-coding-workspace-frontend.md](../../70-qa/test-plans/vscode/066-coding-workspace-frontend.md)

## 10. Gaps and dependencies

- **Brief says terminal tabs missing on web and Desktop; the code has them.** Affects: Web, Desktop. Evidence: LocalTerminal.tsx:355-450. Work needed: Update brief.
- **No persisted command history; local history lives in page state only.** Affects: Web, Desktop. Evidence: LocalTerminal.tsx:62-64. Work needed: Decide on storage and retention.
- **Mobile terminal and history are flag-off.** Affects: Mobile. Evidence: v1FeatureFlags.ts:16. Work needed: Enable or remove.
- **Command mode merges stderr into stdout.** Affects: Web and Desktop on non-Unix systems. Evidence: LocalTerminal.tsx:100-108. Work needed: Separate streams if the host provides them.
- **No terminal tabs in the CLI.** Affects: CLI. Evidence: terminals.rs and tui_app.rs show no tab concept. Work needed: Decide whether needed.
- **Cloud terminal depends on undone switch-on and live check.** Affects: Web. Evidence: brief S66.15 'Unfinished'. Work needed: Set settings, run live checks.

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- surface:vscode
- surface:mobile
- mode:local
- mode:cloud
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- F066-01
- SYS-subscriptions-entitlements-and-usage

## Unknown

- Where cloud terminal entries are stored and for how long.
- How mobile shows command history.
- Whether the PTY terminal works on Windows (capability is Unix-only in the host flags).
- Whether VS Code terminal output is stored.
- Metering details of sandbox minutes.
