---
id: "F070-07"
type: "feature"
title: "Local shell commands"
aliases: ["Run a local command", "Local shell execution", "Local command runner", "Terminal (Code sessions)", "shell_run / shell_start / shell_read / shell_stop", "device_run_command", "S70.15"]
area: "70 Desktop application"
available_on: ["desktop"]
implementation: {web: "n/a", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S70.15"]
depends_on: ["surface:desktop", "mode:cloud", "SYS-execution-boundaries", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-authorization-and-workspaces", "file:apps/desktop/electron/runtime/shellService.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F070-07 Local shell commands

In AGI Desktop (Electron) the user, or the assistant on the user's behalf, runs one program inside a folder the user approved. A native dialog asks first, the program runs in an operating-system sandbox where one exists, and output streams back live. A separate interactive terminal exists inside Code sessions.

Area: [70. Desktop application](README.md). Requirement items: [S70.15](../../10-requirements/capabilities/070-desktop-application.md#s7015).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person or the assistant start a program (for example a test run or a build) in an approved folder on the computer, see its output as it arrives, and stop it. It has two paths: a no-shell command runner (the 'Run a local command' dialog and the assistant's device steps), and an interactive terminal in Code sessions run by the AGI CLI.

**Why it exists.** Developers need real programs to run on their own machine, not in the cloud. The product keeps this safe by limiting runs to approved folders, asking before each unlisted program, sandboxing, and withholding secrets from the program's environment (apps/desktop/electron/runtime/shellService.ts:220).

**Who uses it.** Developers and power users on AGI Desktop for macOS; the assistant acts for them when a cloud chat asks for a device step.

**Problems it solves**

- Running a command without leaving the chat
- Letting the assistant run tests or builds in a project without giving it free access to the whole computer
- Seeing live output and stopping a runaway command

**Use cases**

- Type 'npm test' into 'Run a local command' and attach the transcript to the chat
- The assistant asks to run a build; the user approves once
- The assistant starts a dev server, reads its output, then stops it
- Open a terminal tab in a Code session and type commands yourself

## 2. User experience

**Where to find it**

- surface:desktop only. Composer plus menu row 'Run a local command' (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:178, opened at apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6025). Shown only when the page runs inside the desktop shell (ChatComposerNew.tsx:6011).
- Settings > Capabilities > 'Local access' > 'Folders' and 'Commands' (apps/web/features/desktop-host/components/LocalAccessSection.tsx:37-39; mounted at apps/web/features/settings/sections/CapabilitiesSection.tsx:213).
- Code sessions: bottom panel 'Terminals' with 'New terminal' (apps/web/features/code/local-code.ts:2029-2030).
- Settings > Developer > 'Terminal' (cursor, blinking, copy on select, scrollback) (apps/web/features/desktop-host/components/TerminalSettings.tsx:16).

**Before you start**

- Signed in: the shell loads the hosted app, which shows sign-in when signed out (apps/desktop/electron/main.ts:1326).
- At least one approved folder ('Add a folder', LocalAccessSection.tsx:55). With none, the dialog says to choose one first (LocalCommandDialog.tsx:23).
- The 'shell.execute' permission for that folder, asked on first use (dispatcher.ts:699, :3417).

**Screens and controls**

- Dialog 'Run a local command': folder picker, optional sub-folder, 'Command' field, 'Run', stop, 'Command output' pane, add transcript to chat (LocalCommandDialog.tsx:20, :101, :166).
- Native approval 'Run a local command?' with buttons 'Cancel' and 'Run once', and a checkbox 'Allow network access for this command' (dispatcher.ts:1999-2020, ALLOW_NETWORK_LABEL).
- Native approval 'Run without a sandbox?' when no sandbox exists, with 'Cancel' and 'Run without a sandbox' (dispatcher.ts:2022-2034).
- Native approval 'Type into <program>?' with 'Cancel' and 'Type it' for text the assistant types into a running command (dispatcher.ts:2050-2068).
- Native 'Open interactive terminal?' with 'Keep closed' and 'Open terminal', listing folder, shell, sandbox and network (dispatcher.ts:2810-2835).
- Commands list in Local access: allowed and blocked programs; the exact text says anything not listed asks every time (LocalAccessSection.tsx:39-46).

**Journey**

1. 1. Open the composer plus menu and choose 'Run a local command'.
2. 2. Pick an approved folder (or add one). Type one program and its arguments. Pipes, redirects and variables are not available because there is no shell (LocalCommandDialog.tsx:21).
3. 3. Press Run. The first time for a folder the app asks for the 'shell.execute' permission.
4. 4. Unless the program is on the allowed list, a native dialog quotes the exact command and asks.
5. 5. Output streams into the pane; stderr is marked. Stop ends it.
6. 6. The outcome line says 'Finished in Ns', 'Exited with code N', 'Stopped' or 'Stopped: the command ran past its time limit.' (LocalCommandDialog.tsx:52-57).
7. 7. Optionally attach the transcript to the chat.
8. Assistant path: the cloud chat returns a device step; the same approvals apply; for long-running commands the assistant reads output and stops the command (device-steps.ts:172-198).

**What the person sees and gets**

- Streamed stdout/stderr chunks via the 'shell-output' event (dispatcher.ts:2388).
- Result with exit code, signal, truncated and timedOut flags and duration (shellService.ts:761-775).
- Refusal messages in plain words, for example 'That workspace is no longer approved. Choose the folder again.' (dispatcher.ts:632).

**Settings**

- Allowed and blocked program lists, stored in desktop-shell-policy.json (shellPolicyStore.ts:15); adding to the allowed list is itself confirmed in main (dispatcher.ts:1342).
- Terminal appearance preferences (TerminalSettings.tsx).
- Per-folder 'Run commands and coding sessions' permission, withdrawable under Permissions (LocalAccessSection.tsx:70).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- No-shell runner: parses one program and arguments, refuses control characters, evaluates the allow/deny policy, then asks, sandboxes and spawns with shell:false (shellService.ts:554-684, :705).
- Sandbox: macOS seatbelt, Linux bubblewrap, otherwise none (shellSandbox.ts:189-203). Without a sandbox the user is asked every run, even for allowed programs (shellService.ts:604-610).
- Folder pinning: before a sandboxed run the approved folder must still resolve to the same real path, not be a link, not the filesystem root and not contain the home folder; otherwise 'This folder changed since it was approved ... Choose it again to run commands in it.' (shellService.ts:359-395).
- Unknown or revoked folder is refused with 'That workspace is no longer approved. Choose the folder again.' (dispatcher.ts:628-634).
- Environment allowlist; loader hooks and names containing KEY, SECRET or TOKEN are withheld (shellService.ts:220, :288-295).
- Limits: command up to 4,000 characters, timeout default 120 s and maximum 600 s, output capped at 1,000,000 bytes after which the run is stopped and marked truncated (packages/contracts/local-runtime/src/shell.ts:44-48; shellService.ts:731-740).
- Background commands: start, read (with typed input), stop, list; typed input is always asked about (shellService.ts:953-1070; dispatcher.ts:2412-2423).
- Interactive terminal in Code sessions through the AGI CLI, with a plan dialog before it opens (developerSessionService.ts:1967-2054; dispatcher.ts:2810).
- A server-set 'review' makes even an allowed program ask (shellService.ts:604-610, :84-90).

**Incomplete**

- Windows and Linux: the sandbox code exists for Linux but the desktop installer is built for macOS only (apps/desktop/electron-builder.yml:80, .github/workflows/release-desktop-cloud.yml:162). Not verified on Linux.

**Present but disconnected or switched off**

- The brief's code pointers for S70.15 (CapabilitiesSection.tsx:88, LocalAccessSection.tsx:415) point to the folder list and approvals, not to the runner itself.

**Not available**

- surface:web, surface:mobile, surface:cli, surface:vscode, surface:chrome: no equivalent runner in these apps' desktop-host feature; the brief marks them n/a (data/area-briefs/070-desktop-application.md S70.15).
- Shell features such as pipes, redirects and variables (LocalCommandDialog.tsx:21).

## 4. Required behaviour

**Established requirements**

- The user or assistant can run a program in an approved folder, with approval, sandboxing and streamed output. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.15)
- Commands run only in an approved folder and inside the same sandbox as agent commands; the assistant cannot type into the user's terminal; a folder that is no longer approved is refused with a message to choose the folder again. (source: task brief for F070-07; terminal copy at apps/desktop/electron/runtime/dispatcher.ts:643; refusal text at dispatcher.ts:632)
- An action a user cannot undo asks first and names the consequence. (source: AGENTS.md section 9)

**Acceptance criteria**

1. With no approved folder, 'Run a local command' tells the user to choose a folder first and Run does nothing.
2. An unlisted program shows the native dialog quoting the exact command; Cancel means the program never starts.
3. With the network box unticked, a sandboxed program cannot reach the network; ticking it applies to that one run only.
4. Revoking the folder, then running, returns 'That workspace is no longer approved. Choose the folder again.'
5. A command that outputs more than about 1 MB is stopped and shown as cut off; one that runs past its limit shows 'Stopped: the command ran past its time limit.'
6. A command containing a pipe or redirect is refused with an explanation that there is no shell.
7. Typed input to a background command always raises 'Type into <program>?'.
8. The terminal opens only after 'Open terminal' is chosen in the plan dialog.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The assistant cannot drive the user's interactive terminal because the device-step table lists only shell_run, shell_start, shell_read and shell_stop and no terminal command (packages/contracts/local-runtime/src/device-steps.ts:172-198); the terminal commands are not in that file.
- [inferred] The terminal shares the agent sandbox only as far as the AGI CLI enforces it; the desktop code shows the plan the CLI returns (developerSessionService.ts:1990-1999).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add one test that asserts the terminal's sandbox plan equals the agent command plan.
- [proposed] Show the folder-changed refusal with a button that reopens the folder picker.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | shellService | `apps/desktop/electron/runtime/shellService.ts` | Prepares, approves, sandboxes, spawns, streams, cancels and tracks commands; background commands. |
| service | shellSandbox | `apps/desktop/electron/runtime/shellSandbox.ts` | Detects and builds the seatbelt or bubblewrap sandbox plan. |
| store | shellPolicyStore | `apps/desktop/electron/runtime/shellPolicyStore.ts` | Reads and writes the allowed and blocked program lists in desktop-shell-policy.json. |
| service | dispatcher (shell and terminal cases) | `apps/desktop/electron/runtime/dispatcher.ts` | Gates shell_* and developer_terminal_* commands by permission, builds approval dialogs, resolves the approved folder. |
| service | developerSessionService (terminal) | `apps/desktop/electron/runtime/developerSessionService.ts` | Opens, writes, resizes, scrolls and closes interactive terminals through the AGI CLI. |
| config | shell policy contract | `packages/contracts/local-runtime/src/shell.ts` | Limits, parser, always-refused programs, evaluateShellPolicy. |
| config | device step table | `packages/contracts/local-runtime/src/device-steps.ts` | Maps assistant steps device_run_command, device_start_command, device_command_output, device_command_stop to shell_* commands. |
| component | LocalCommandDialog | `apps/web/features/desktop-host/components/LocalCommandDialog.tsx` | The 'Run a local command' dialog. |
| component | ComposerPlusMenu LocalCommandRow | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Menu row that opens the dialog. |
| component | LocalAccessSection | `apps/web/features/desktop-host/components/LocalAccessSection.tsx` | Folders, Commands lists and standing permissions. |
| service | runtime-client (startLocalCommand) | `apps/web/features/desktop-host/lib/runtime-client.ts` | Page-side calls to shell_run, shell_cancel, shell_policy_read/write. |
| component | LocalPtyTerminal / LocalTerminal | `apps/web/features/code/components/LocalPtyTerminal.tsx` | Terminal view and tabs in Code sessions. |
| component | TerminalSettings | `apps/web/features/desktop-host/components/TerminalSettings.tsx` | Terminal appearance settings. |
| store | workspaceStore | `apps/desktop/electron/runtime/workspaceStore.ts` | Approved folders (getRoot, listRoots). |
| command | shell_run / shell_start / shell_read / shell_stop / shell_cancel / shell_policy_read / shell_policy_write | `apps/desktop/electron/runtime/dispatcher.ts` | Runtime commands at lines 2378-2427. |
| event | shell-output runtime event | `apps/desktop/electron/runtime/dispatcher.ts` | Streams output chunks to the page (line 2388). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| User types a command in the dialog, or the cloud model returns a device step the page forwards. | device | apps/web/features/desktop-host/lib/runtime-client.ts:290-319; packages/contracts/local-runtime/src/device-steps.ts:172 |
| For an assistant step the chat reply that produced it comes from the managed chat service. | our servers | dispatcher.ts:3242 states Desktop answers every conversation in the cloud |
| Main checks the folder is still approved and asks for the shell.execute permission if not yet granted. | device | dispatcher.ts:3417-3490 |
| The policy denies, allows or asks; the sandbox and pinned folder are checked; a native dialog is shown when required. | device | shellService.ts:554-640 |
| The program is spawned without a shell, output is streamed and capped, then the result is returned. | device | shellService.ts:686-815 |
| A program the user allowed network for may itself contact outside services. | outside service | dispatcher.ts:2071-2086 (allowNetwork) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Allowed and blocked program lists | desktop-shell-policy.json in the app's user data folder | No sync found in the code | Kept until the user edits; a corrupt file is treated as empty (shellPolicyStore.ts:28-37) |
| Standing permission answers | Permission manager store on the device | unknown | Withdrawn from Settings > Permissions |
| Command output and per-run scratch folder | Memory while running; scratch folder in a private temp parent | The transcript leaves the device only if the user attaches it to a chat | Scratch removed when the run ends; older leftovers can be cleared in Storage (storageService.ts:185-195) |

**Models and providers.** The runner itself uses no model. The assistant path depends on whichever model answers the cloud chat; the device step is the same for any model. Public Desktop chat is Cloud only (dispatcher.ts:3242).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The shell loads the hosted app, which needs sign-in (main.ts:1326). The runner itself checks no account. |
| Permissions | Capability 'shell.execute' per approved folder (dispatcher.ts:699-720), plus a native approval per unlisted program, plus approval of every typed input. |
| Subscription | none found in the code |
| Limits and metering | 4,000-character command, 120 s default and 600 s maximum timeout, 1,000,000-byte output cap (packages/contracts/local-runtime/src/shell.ts:44-48). No usage metering found. |
| Feature flags | none found in the code |
| Model compatibility | Not model dependent; any model that returns the device step can use it. |
| Provider restrictions | none found in the code |
| Local mode | The runner works on the device with no model and no subscription. The desktop app has no local inference runtime: the dispatcher refuses local model commands (dispatcher.ts:3242, :3366). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner 'Loading approved folders' | LocalCommandDialog.tsx:246 |
| Empty | No folder approved: 'No folders are approved yet. Choose one first...' | LocalCommandDialog.tsx:23 |
| Error | Refusal text from main, else 'That command did not run.' | LocalCommandDialog.tsx:24, :44-50 |
| Cancel | Stop button, closing the dialog or unmounting the composer cancels the run; a cancel before start is remembered ('That command was cancelled before it started.') | LocalCommandDialog.tsx:138-150; shellService.ts:170 |
| Timeout | Run stopped and flagged timedOut | shellService.ts:731-735 |
| No sandbox | Asks every time with a stronger warning | dispatcher.ts:2022-2034 |
| Offline | Local runs do not need the network; assistant steps need the cloud chat | dispatcher.ts:3242 |
| Reconnect / recovery | not handled in the code for running commands after an app restart; commands are in memory only | shellService.ts:109-113 (in-memory maps) |
| Accessibility | Dialog has aria-label and keyboard handling; spinner labelled 'Running' | LocalCommandDialog.tsx:224, :319 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/shellService.test.ts`: Runs allowed programs, exit codes, stderr, sub-folder, refusals, approval flow, timeout, cancel, duplicate run id, truncation, environment allowlist
- `apps/desktop/electron/__tests__/shellServiceSandbox.test.ts`: Sandboxed spawn behaviour
- `apps/desktop/electron/__tests__/shellSandbox.test.ts`: Sandbox profile construction
- `apps/desktop/electron/__tests__/shellPolicyStore.test.ts`: Policy store reads and writes
- `apps/desktop/electron/__tests__/dispatcher.test.ts`: Command gating; also references the developer terminal
- `apps/desktop/electron/__tests__/developerSessionService.test.ts`: Terminal open and write through the CLI
- `apps/web/features/desktop-host/__tests__/LocalCommandDialog.test.tsx`: Dialog states: empty, streaming, exit codes, truncation, stop, refusal, attach transcript
- `apps/web/features/desktop-host/__tests__/LocalAccessSection.test.tsx`: Folders, commands lists, permissions
- `apps/web/features/desktop-host/__tests__/TerminalSettings.test.tsx`: Terminal settings
- `apps/web/features/code/components/LocalPtyTerminal.test.tsx`: Terminal view

**Test scenarios**

- **Approve and run**
  1. Approve a folder
  2. Open 'Run a local command'
  3. Run an unlisted program
  4. Choose 'Run once'
  - Expected: Output streams, outcome line shows Finished or an exit code
- **Refuse**
  1. Run an unlisted program
  2. Choose Cancel
  - Expected: Message says running it was not approved; nothing started
- **Folder revoked**
  1. Remove the folder in Local access
  2. Run a command in the open dialog
  - Expected: 'That workspace is no longer approved. Choose the folder again.'
- **Network blocked**
  1. Run a program that fetches a URL with the network box unticked
  2. Repeat with it ticked
  - Expected: First fails to connect, second succeeds
- **Assistant typed input**
  1. Ask the assistant to start an interactive program
  2. Let it type
  - Expected: 'Type into <program>?' appears each time
- **Terminal**
  1. Open a Code session
  2. New terminal
  3. Choose Open terminal
  - Expected: Plan dialog lists folder, shell, sandbox and network; the shell opens only after choosing

**Where to look when it fails**

- ShellCommandRefused reasons: not-listed, always-refused, denied-by-policy, unparseable, control-characters, too-long, sandbox-unavailable (shellService.ts, shell.ts:237+)
- DesktopRuntimeError codes permission-denied and unsupported-platform
- desktop-shell-policy.json in the user data folder
- Console prefix [shell] not found; unknown

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/070-desktop-application.md](../../70-qa/test-plans/desktop/070-desktop-application.md)

## 10. Gaps and dependencies

- **The brief's code pointers for S70.15 do not locate the runner** Affects: Engineers and testers reading the brief. Evidence: data/area-briefs/070-desktop-application.md S70.15 vs shellService.ts. Work needed: Correct the brief to cite shellService.ts, dispatcher.ts and LocalCommandDialog.tsx
- **Whether the interactive terminal runs in the same sandbox as agent commands is stated in copy but enforced by the CLI, not shown in desktop code** Affects: surface:desktop users relying on the terminal's limits. Evidence: dispatcher.ts:643; developerSessionService.ts:1990-1999. Work needed: Verify the CLI's terminal plan against the agent command sandbox and add a test
- **No sandbox on platforms other than macOS and Linux; every run asks** Affects: Any future Windows build. Evidence: shellSandbox.ts:189-203. Work needed: Add a Windows sandbox or keep refusing
- **Running commands are lost when the app restarts** Affects: surface:desktop. Evidence: shellService.ts:109-113. Work needed: Decide whether to list or clean up orphaned commands on start

**Depends on**

- surface:desktop
- mode:cloud
- SYS-execution-boundaries
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- file:apps/desktop/electron/runtime/shellService.ts

## Unknown

- Whether the interactive terminal is sandboxed identically to agent commands (enforced in the AGI CLI, not read)
- Behaviour on Linux and Windows; no installer is built for them
- Which database tables, if any, record command runs: none named in the code read
- Whether permission answers sync across devices
