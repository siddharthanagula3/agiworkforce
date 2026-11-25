---
id: "F066-09"
type: "feature"
title: "Background tasks, subagents and running servers"
aliases: ["Subagents", "Subagent panel (S66.30)", "Background task list (S66.29)", "Running-server list (S66.33)", "Running in this folder", "LocalRunningCommands", "/tasks", "child tasks"]
area: "66 Coding-workspace frontend"
available_on: ["desktop", "cli", "vscode"]
implementation: {web: "missing", desktop: "partial", mobile: "missing", cli: "partial", vscode: "built", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S66.29", "S66.30", "S66.33"]
depends_on: ["surface:desktop", "surface:cli", "surface:vscode", "mode:local", "SYS-agents-tools-and-automation", "SYS-execution-boundaries", "F066-07", "F066-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F066-09 Background tasks, subagents and running servers

Shows work running beside the main agent. The desktop-hosted web session panel lists subagents (child tasks) with their state and lists commands running in the folder, such as dev servers, with a Stop button. The CLI has a /tasks command. VS Code can list and stop subagents. Mobile has none.

Area: [66. Coding-workspace frontend](README.md). Requirement items: [S66.29](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6629), [S66.30](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6630), [S66.33](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6633).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | built (this page lists unfinished parts) | partly built | not seen by a person |
| VS Code | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows each subagent the session started, with its title and state, and shows long-running commands in the open folder with how long they have run. The person can stop one command or all of them. A server with a printed address gets a 'Preview' button.

**Why it exists.** A coding agent can leave processes running or hand work to subagents. People need to see and end them. (S66.29, S66.30, S66.33 Should lines.)

**Who uses it.** Developers running local coding sessions on the desktop, and terminal users of the CLI.

**Problems it solves**

- Forgotten dev servers that keep a port busy.
- Not knowing what a subagent is doing or whether it failed.
- Interrupted work that would otherwise vanish.

**Use cases**

- See 'Subagents (3) · 2 running · 1 done' and open it for titles and states.
- Press the stop button next to 'npm run dev' when the session ends.
- Use 'Stop all' when several commands run.
- In the CLI, run /tasks and then /tasks stop <id>.

## 2. User experience

**Where to find it**

- Desktop-hosted web session panel: 'Subagents (n) · counts' details block under the transcript (apps/web/features/code/components/LocalSessionPanel.tsx:174-203,1606).
- Desktop-hosted changes side panel: 'Running in this folder' section with 'Stop <command>' buttons, 'Stop all' and 'Preview' (apps/web/features/code/components/LocalRunningCommands.tsx; mounted at LocalChangesPanel.tsx:385).
- CLI: slash command /tasks with list, show, transcript and stop subcommands (apps/cli/src/repl/registry.rs:484-567).
- VS Code: webview message stopChildTask and openChildTaskTranscript (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:438-439,1673-1679).
- Mobile: not found.

**Before you start**

- Desktop app with a local folder session (host bridge); these panels call desktop host commands (apps/web/features/desktop-host/lib/runtime-client.ts:270).
- Subagents only appear when the CLI reports child tasks (use-local-session.ts:249).

**Screens and controls**

- Subagents block: open automatically while any task is running, queued or waiting for input (LocalSessionPanel.tsx:176-181); each row shows title and a state label.
- State labels: Queued, Running, Waiting for input, Interrupted, Done, Stopped, Failed (packages/contracts/local-runtime/src/developer-session.ts:161-169).
- Paused tasks show 'Interrupted work is kept for review and will not restart on its own.' (LocalSessionPanel.tsx:195-198).
- Running list: command text, 'Running for N min' or 'Started just now', stop square button, 'Preview' button when a URL was seen (LocalRunningCommands.tsx:171-205).

**Journey**

1. 1. Start a local session that spawns a subagent or a dev server.
2. 2. Open the session panel; the Subagents block appears.
3. 3. Open the changes panel; 'Running in this folder' lists commands (polled every 3 seconds).
4. 4. Press the stop button on a command, or 'Stop all'.
5. 5. If the stop fails, an alert says the command 'could not be stopped and may still be running'.
6. 6. The list refreshes and the stopped command disappears.

**What the person sees and gets**

- '<command> could not be stopped and may still be running.' stays visible until the run ends (local-code.ts:155-156; LocalRunningCommands.tsx:88-118).
- 'What is running could not be read.' when the list cannot load (local-code.ts:150).
- 'Stop <command>' as the button's accessible name.

**Settings**

- none found in the code for this feature.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Subagent list with counts and live updates from session events on the desktop-hosted page (apps/web/features/code/hooks/use-local-session.ts:172,249,340,964).
- Running commands list scoped to the folder, polling, stop one or all, per-run failure alerts, preview open and send-console-errors action (LocalRunningCommands.tsx).
- Desktop host returns commands from its shell-run table and can stop one (apps/desktop/electron/runtime/backgroundActivity.ts:47-90; dispatcher.ts:2395-2396,2642-2651).
- CLI /tasks (apps/cli/src/repl/registry.rs:484-567).
- VS Code subagents webview with stop and transcript (ChatStateManager.ts:1673-1679; test apps/extension-vscode/src/__tests__/subagents.webview.test.ts).

**Incomplete**

- The brief's empty-state text 'Nothing is running in this folder.' is defined (apps/web/features/code/local-code.ts:149) but never rendered: the list returns nothing when empty and no error (LocalRunningCommands.tsx:131).
- The draft said a stop is confirmed first; the stop path calls the host directly with no confirmation dialog in the files read (LocalRunningCommands.tsx:94-118; dispatcher.ts:2395).
- Subagent rows have no stop button in the web panel; only title and state (LocalSessionPanel.tsx:185-201).

**Present but disconnected or switched off**

- none found.

**Not available**

- Mobile: no subagent or process list found in the remote code session view.
- Remote SSH sessions: host commands such as listing local runs are unavailable there (dispatcher.ts:3385-3395).
- Cloud sessions on the web: no equivalent list found.

## 4. Required behaviour

**Established requirements**

- The user sees the session's background tasks (long commands, spawned jobs) and their state. (source: S66.29 Should)
- The user sees the subagents the session spawned, what each is doing and its result. (source: S66.30 Should)
- The user sees dev servers the session started and can stop them. (source: S66.33 Should)
- No second task or test panel inside VS Code (S66.29 and S66.38 in VS Code are cut). (source: docs/decisions/2026-09-27-founder-decisions.md:103-107)
- An agent never destroys user data on its own; stopping a process the user chose is a user action. (source: doc: AGENTS.md section 9 [inferred applicability])

**Acceptance criteria**

1. With three subagents in different states the header shows the count and per-state totals and the block is open while any is active.
2. A paused task shows the interrupted note.
3. A command run in this folder appears within about 3 seconds, with its running time.
4. Stop removes the command from the list on the next refresh.
5. If the host rejects the stop, an alert names the command and says it may still be running, and stays until the command leaves the list.
6. 'Stop all' appears only with two or more commands.
7. With nothing running and no error, the section is absent.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The empty-state string should either be shown or deleted; today it is dead copy [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a stop action per subagent in the web panel, as VS Code has.
- [proposed] Show subagents and stop controls in the mobile remote session.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LocalSubagents | `apps/web/features/code/components/LocalSessionPanel.tsx` | Subagent details block (lines 174-203). |
| component | LocalRunningCommands | `apps/web/features/code/components/LocalRunningCommands.tsx` | Running commands list, stop, preview, console errors. |
| component | LocalChangesPanel | `apps/web/features/code/components/LocalChangesPanel.tsx` | Mounts the running list (line 385). |
| hook | useLocalSession childTasks | `apps/web/features/code/hooks/use-local-session.ts` | Holds child tasks from the transcript and events. |
| config | Child task labels | `packages/contracts/local-runtime/src/developer-session.ts` | State labels (line 161). |
| service | runtime-client | `apps/web/features/desktop-host/lib/runtime-client.ts` | cancelLocalCommand calls shell_cancel (line 270). |
| service | backgroundActivity | `apps/desktop/electron/runtime/backgroundActivity.ts` | Reads and stops background work. |
| service | dispatcher background_activity / background_stop / shell_cancel | `apps/desktop/electron/runtime/dispatcher.ts` | Commands the page calls (lines 2395, 2642-2651). |
| command | /tasks | `apps/cli/src/repl/registry.rs` | CLI task list, show, transcript, stop. |
| service | SubagentManager | `apps/cli/src/subagent.rs` | CLI subagent manager used by /tasks (referenced at tui_app.rs:7735). |
| component | ChatStateManager subagents | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | VS Code subagent list, stop, transcript. |
| config | LOCAL_CODE_COPY running strings | `apps/web/features/code/local-code.ts` | Labels and messages (lines 146-156). |
| test | LocalRunningCommands test | `apps/web/features/code/components/LocalRunningCommands.test.tsx` | List, stop, failure, preview cases. |
| test | backgroundActivity test | `apps/desktop/electron/__tests__/backgroundActivity.test.ts` | Host activity listing. |
| test | subagents webview test | `apps/extension-vscode/src/__tests__/subagents.webview.test.ts` | VS Code subagent view. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The AGI CLI on the computer runs the agent and reports child tasks in session events and the transcript. | device | apps/web/features/code/hooks/use-local-session.ts:249 |
| The page renders the child tasks as the Subagents block. | device | LocalSessionPanel.tsx:174-203,1606 |
| Every 3 seconds the page asks the desktop host for background activity and keeps this folder's commands. | device | LocalRunningCommands.tsx:21,60-77 |
| Stop sends shell_cancel with the run id; failures are collected per command. | device | LocalRunningCommands.tsx:94-118; runtime-client.ts:270-272; dispatcher.ts:2395-2396 |
| The page reloads the list after the stop. | device | LocalRunningCommands.tsx:119 |
| CLI: /tasks stop stops a background terminal or a subagent task. | device | apps/cli/src/repl/registry.rs:490-500 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Command runs and subagent states | desktop host memory and CLI session state | No | Command runs vanish when they end; child task records follow the thread transcript (unknown retention) |

**Models and providers.** Subagents are model turns run by the CLI under the session's model and mode; they may use more tokens (SYS-chat-turn-pipeline, SYS-agents-tools-and-automation). The running-commands list uses no model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The running list needs no account in code; the page itself needs the desktop host. Subagent use depends on the CLI runtime. |
| Permissions | Starting commands is governed by the approval mode (F066-07); stop has no extra permission in the code read. |
| Subscription | none found in the code for these panels. |
| Limits and metering | none found in the code; subagent turns are metered like other turns when they use managed models [inferred]. |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Everything described here runs on the device in Local mode: the CLI runs subagents, and the desktop host lists and stops shell runs. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Nothing running | The running section renders nothing; the 'Nothing is running in this folder.' text is unused. | LocalRunningCommands.tsx:131; local-code.ts:149 |
| Listing fails | Alert 'What is running could not be read.' | LocalRunningCommands.tsx:78-80 |
| Stop in progress | Stop button disabled for that run. | LocalRunningCommands.tsx:197 |
| Stop fails | Per-run alert, kept until the run leaves the list. | LocalRunningCommands.tsx:60-72,105-118 |
| Subagent interrupted | Shown as 'Interrupted' with a no-restart note. | LocalSessionPanel.tsx:195-198 |
| Polling | Every 3 seconds; cleared on unmount. | LocalRunningCommands.tsx:84-88 |
| Offline or reconnect | not handled in the code beyond the repeating poll. | LocalRunningCommands.tsx:84-88 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/components/LocalRunningCommands.test.tsx`: Lists only this folder's runs with durations; stops one or all; failed stop stays visible; per-run results of stop-all; shows nothing when empty; preview open and failure; console error offer, send, clear.
- `apps/desktop/electron/__tests__/backgroundActivity.test.ts`: Desktop host background activity listing and stop.
- `apps/extension-vscode/src/__tests__/subagents.webview.test.ts`: VS Code subagent view.
- `apps/web/features/code/hooks/use-local-session.test.ts`: Local session hook; whether child tasks are covered was not read.

**Test scenarios**

- **Stop a dev server**
  1. In a local session ask the agent to run a dev server.
  2. Open the changes panel.
  3. Press 'Stop <command>'.
  - Expected: The entry leaves the list; the port is free.
- **Failed stop**
  1. Start a command the host cannot stop (for example use a test double).
  2. Press stop.
  - Expected: Alert '... could not be stopped and may still be running.'
- **Subagent states**
  1. Ask for work that spawns several subagents.
  2. Open the Subagents block.
  - Expected: Count and per-state totals update live; Done and Failed rows show.
- **Empty folder**
  1. Open a session with no running commands.
  - Expected: No section; confirm the unused empty text is not shown.
- **CLI tasks**
  1. In the CLI run a background command and /tasks, then /tasks stop <id>.
  - Expected: Task listed then reported stopped.

**Where to look when it fails**

- Desktop host command names background_activity, background_stop, shell_cancel.
- Page alert texts above.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/066-coding-workspace-frontend.md](../../70-qa/test-plans/desktop/066-coding-workspace-frontend.md)
- CLI: [70-qa/test-plans/cli/066-coding-workspace-frontend.md](../../70-qa/test-plans/cli/066-coding-workspace-frontend.md)
- VS Code: [70-qa/test-plans/vscode/066-coding-workspace-frontend.md](../../70-qa/test-plans/vscode/066-coding-workspace-frontend.md)

## 10. Gaps and dependencies

- **Brief says web and desktop have no subagent or running-command list, but the desktop-hosted web page has both.** Affects: Brief accuracy for surface:web and surface:desktop. Evidence: LocalSessionPanel.tsx:174-203; LocalRunningCommands.tsx. Work needed: Update the brief; live-verify on the desktop app.
- **Brief says VS Code subagents are missing, but code and a test exist.** Affects: surface:vscode. Evidence: ChatStateManager.ts:1673-1679; subagents.webview.test.ts. Work needed: Update the brief; the founder decision still cuts a task panel in VS Code (docs/decisions/2026-09-27-founder-decisions.md:103).
- **Empty-state copy is defined but never shown.** Affects: surface:desktop. Evidence: local-code.ts:149; LocalRunningCommands.tsx:131. Work needed: Show it or remove it.
- **No stop control for a subagent on the web panel; no confirmation before stopping a command.** Affects: surface:desktop. Evidence: LocalSessionPanel.tsx:185-201; LocalRunningCommands.tsx:94. Work needed: Add per-task stop and decide whether stop needs confirmation.
- **Mobile has no view of subagents or running commands.** Affects: surface:mobile. Evidence: No code found in apps/mobile/src/features/companion. Work needed: Add if wanted; not in the brief's required list for mobile beyond S66.29-30 missing.
- Not built on: Web, Mobile (from the capability ledger).

**Depends on**

- surface:desktop
- surface:cli
- surface:vscode
- mode:local
- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- F066-07
- F066-10

## Unknown

- Whether the stop also ends a command's child processes (host cancelShellRun not read).
- Whether subagent records persist across reload in all cases.
- How many subagents the CLI allows at once.
- Whether the Tauri build has its own list.
