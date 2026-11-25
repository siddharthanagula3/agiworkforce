---
id: "F067-04"
type: "feature"
title: "Start dev servers and inspect a running app"
aliases: ["Dev servers and running-app inspection", "Start development servers (S67.15)", "Inspect browser behavior (S67.16)", "Inspect console errors (S67.17)", "Inspect network failures (S67.18)", "Interact with a simulator (S67.19)", "Watch page", "iOS Simulator pane", "Running commands"]
area: "67 Coding capabilities and developer workflows"
available_on: ["desktop", "cli", "vscode", "chrome"]
implementation: {web: "missing", desktop: "partial", mobile: "missing", cli: "partial", vscode: "partial", chrome: "built"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S67.15", "S67.16", "S67.17", "S67.18", "S67.19"]
depends_on: ["surface:desktop", "surface:cli", "surface:chrome", "surface:web", "surface:vscode", "surface:mobile", "mode:local", "mode:own-key", "mode:cloud", "F067-03", "SYS-execution-boundaries", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-connectors-plugins-and-skills", "file:apps/cli/src/browser_bridge.rs", "file:apps/extension/src/features/browser-tools/pageWatch.ts", "store:extension-tab-capture-buffers"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F067-04 Start dev servers and inspect a running app

The agent starts a dev server that keeps running, opens the app in the paired Chrome browser and reads page text, console messages and network requests. A person-operated iOS Simulator pane exists on Desktop. No agent step drives a simulator. Local privacy mode in the CLI refuses all browser tools.

Area: [67. Coding capabilities and developer workflows](README.md). Requirement items: [S67.15](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6715), [S67.16](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6716), [S67.17](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6717), [S67.18](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6718), [S67.19](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6719).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets the agent run the app it is changing and look at it: start and stop a long-running command, drive and read a Chrome tab, read the tab's console and failed requests. A separate pane lets the person run an iOS Simulator on a Mac.

**Why it exists.** Checking a change often needs the running app, not only tests. The brief lists server start, browser inspection, console, network and simulator items (doc: knowledge-base/data/area-briefs/067-coding-capabilities-and-developer-workflows.md S67.15-S67.19).

**Who uses it.** Developers building web or mobile apps with Desktop or CLI, and the Chrome extension user who pairs a browser.

**Problems it solves**

- Copying console errors into chat by hand.
- Forgetting which server is still running.
- Reproducing a bug in a real page.

**Use cases**

- Ask the agent to start the dev server and open the page.
- Ask why a page is blank; the agent reads console errors.
- Ask which API calls failed on a page.
- Open the Simulator pane to look at a phone build and attach a screenshot to chat.

## 2. User experience

**Where to find it**

- Desktop code page: the 'Running commands' list under the changes panel with a preview opener (apps/web/features/code/components/LocalChangesPanel.tsx:365-376; LocalRunningCommands.tsx).
- Desktop code page: browser pane LocalBrowserPanel and the 'iOS Simulator' pane (apps/web/features/code/components/LocalBrowserPanel.tsx; apps/web/features/code/simulator-pane.ts:11).
- CLI: tools run_command with run_in_background, command_output, command_stop, browser_read_page, browser_console, browser_network (apps/cli/src/platform/runtime/tool_catalog.rs:51-62, 245-246).
- Chrome extension: side panel and a page watch (apps/extension/src/features/browser-tools/pageWatch.ts:79).
- Mobile: view of a session only; no own control (brief: mobile missing for server start).

**Before you start**

- Browser tools: Chrome paired with the Desktop app or CLI, and sites approved in the extension (apps/desktop/electron/browser/browserSteps.ts:31).
- Console and network need the page watch to be on for the tab (apps/cli/src/features/exec/tools/mod.rs:2298).
- Simulator: a Mac with Xcode simulators, and the simulator.control grant (apps/desktop/electron/runtime/dispatcher.ts:1087-1121; apps/web/features/code/simulator-pane.ts:15-17).

**Screens and controls**

- Simulator pane: 'Start simulator', 'Try again', menus Edit, Device, View, 'Shut down', Appearance (Light, Dark), Status bar (Live, Clean) (apps/web/features/code/simulator-pane.ts:11-60).
- Running commands panel: read output, stop, send to the agent (apps/web/features/code/components/LocalChangesPanel.tsx:365-373).
- Approval cards for browser console and network reads: the person is asked before it runs (packages/contracts/local-runtime/src/device-steps.ts:289-298).

**Journey**

1. Ask the agent to start the dev server; approve the command.
2. The agent reads its first output and keeps it running.
3. Ask the agent to open the page in the paired Chrome and read it.
4. If the capture is empty, turn on watching for that tab and reproduce the problem.
5. Ask for console errors or failed requests; read the list.
6. Stop the server when done.

**What the person sees and gets**

- Console list lines '[level] source: text (url:line)' or 'No console messages captured for this tab.' (apps/extension/src/features/browser-tools/consoleCapture.ts:204-206 region).
- Network entries per request with status, with a failedOnly filter (apps/extension/src/features/browser-tools/networkCapture.ts:166, 203).
- CLI note when nothing was recorded (apps/cli/src/features/exec/tools/mod.rs:2298).

**Settings**

- Site approvals and domain rules for browser tools (apps/cli/src/features/exec/tools/mod.rs:2265-2285).
- Simulator settings: appearance and status bar (apps/web/features/code/simulator-pane.ts:35-46).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI starts background commands and returns an id; command_output reads and can type input; command_stop ends it (apps/cli/src/features/exec/tools/bash/mod.rs:74-79, 292-363; apps/cli/src/platform/runtime/tool_catalog.rs:245-246).
- Desktop chat device steps: device_start_command, device_command_output, device_command_stop (packages/contracts/local-runtime/src/device-steps.ts:179-199).
- CLI has browser tools including browser_console and browser_network that call the paired browser through a bridge (apps/cli/src/platform/runtime/tool_catalog.rs:51-62; apps/cli/src/features/exec/tools/mod.rs:2252-2268). This contradicts the brief, which says CLI missing for console and network.
- Desktop chat device steps device_browser_console and device_browser_network exist and the web handler formats them (packages/contracts/local-runtime/src/device-steps.ts:289-298; apps/web/features/desktop-host/lib/device-steps.ts:216-218, 262). This contradicts the brief, which says Web and Desktop... Web missing.
- Chrome extension keeps 200 console entries and 200 network entries per tab (apps/extension/src/features/browser-tools/consoleCapture.ts:4; apps/extension/src/features/browser-tools/networkCapture.ts:3).
- Credential-shaped URL parts are stripped from network entries before storing (apps/extension/src/features/browser-tools/networkCapture.ts:13-50).
- A person-operated iOS Simulator pane exists on the Desktop page with boot, shutdown, home, screenshot, record, clipboard and appearance controls (packages/contracts/local-runtime/src/simulator.ts:1-19; apps/web/features/code/components/LocalSimulatorPane.tsx:1).

**Incomplete**

- Page watch: the CLI hint tells the user to press 'Watch page' in the extension side panel (apps/cli/src/features/exec/tools/mod.rs:2298), but no control with that label and no sender of SET_PAGE_WATCH was found in apps/extension/src; only the background handler (apps/extension/src/background.ts:6902) and an automatic watch during an extension-driven run (apps/extension/src/features/computer-use/agentLoop.ts:1082). Whether another UI exists is unknown.
- VS Code: browser inspection needs CLI-side pairing without Desktop (brief).

**Present but disconnected or switched off**

- Simulator commands are gated by the simulator.control capability (apps/desktop/electron/runtime/dispatcher.ts:1114-1121).

**Not available**

- Agent-driven simulator: none found. device-steps.ts has no simulator step and apps/cli/src has no simulator code (searched both).
- CLI browser tools in Local privacy mode: refused (apps/cli/src/features/exec/tools/mod.rs:724-735).
- Mobile: no own dev-server or browser control.

## 4. Required behaviour

**Established requirements**

- The agent starts a development server and keeps it running while it continues working. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.15)
- The agent opens the app in a browser and inspects it: navigate, click, read, screenshot. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.16)
- The agent reads the console errors and the failed network requests of the app under test. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.17, S67.18)
- The agent drives an iOS or Android simulator. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.19)
- Model-owned launches force network access off in the Desktop sandbox. (source: (doc: docs/decisions/wire-or-cut.md:92))

**Acceptance criteria**

1. Ask the agent to start a dev server; the approval names the exact command; the server stays running after the step.
2. Read the running command's output later; new output appears since the last read.
3. Stop the command; the process and its children end.
4. With the tab watched, trigger a console error; the agent's console read lists it.
5. With the tab not watched, the CLI read returns the 'Nothing is recorded for this tab' note.
6. In CLI Local privacy mode, a browser read is refused with the Local privacy message.
7. Open the Simulator pane on a Mac; the device list shows and Start boots one.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Console reads should work on every app that has browser tools; they do on CLI and Desktop chat in code, so the brief's missing marks look stale. [inferred]
- A person should be able to turn page watch on from the extension; a UI for that was not found. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a visible 'Watch page' control in the extension side panel or change the CLI hint.
- [proposed] Add an agent step for the simulator with its own approval, or drop the simulator from the area if it stays person-only.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | CLI bash tool background mode | `apps/cli/src/features/exec/tools/bash/mod.rs` | run_in_background start and command_output reading (lines 74, 292). |
| service | CLI browser command runner | `apps/cli/src/features/exec/tools/mod.rs` | execute_browser_command, argument mapping, domain rules, empty-capture note, Local privacy refusal. |
| integration | browser_bridge | `apps/cli/src/browser_bridge.rs` | CLI client identity and command runner to the paired browser (lines 119, 270). |
| config | CLI tool_catalog | `apps/cli/src/platform/runtime/tool_catalog.rs` | BROWSER_TOOLS list and background command tool names. |
| config | device-steps | `packages/contracts/local-runtime/src/device-steps.ts` | Chat device steps for commands and browser reads. |
| service | web device-steps handler | `apps/web/features/desktop-host/lib/device-steps.ts` | Turns browser step results into text for chat. |
| service | browserSteps | `apps/desktop/electron/browser/browserSteps.ts` | Desktop gate for browser steps: permission, site rules, landing checks. |
| service | bridgeServer | `apps/desktop/electron/browser/bridgeServer.ts` | Desktop end of the Chrome bridge (imported at browserSteps.ts:21). |
| component | consoleCapture | `apps/extension/src/features/browser-tools/consoleCapture.ts` | Per-tab console buffer of 200 entries and its text format. |
| component | networkCapture | `apps/extension/src/features/browser-tools/networkCapture.ts` | Per-tab request buffer of 200 entries with credential stripping. |
| service | pageWatch | `apps/extension/src/features/browser-tools/pageWatch.ts` | Attaches the debugger to a tab so console and network are recorded. |
| service | extension background handlers | `apps/extension/src/background.ts` | SET_PAGE_WATCH (6902) and READ_PAGE_CONSOLE (6920) message handlers. |
| component | LocalRunningCommands | `apps/web/features/code/components/LocalRunningCommands.tsx` | List of running commands with read and stop. |
| component | LocalBrowserPanel | `apps/web/features/code/components/LocalBrowserPanel.tsx` | In-session browser pane for previews. |
| component | LocalSimulatorPane | `apps/web/features/code/components/LocalSimulatorPane.tsx` | Person-operated iOS Simulator pane. |
| hook | useSimulator | `apps/web/features/code/hooks/use-simulator.ts` | Polls frames every 500 ms and wraps boot, shutdown, capture calls. |
| service | simulatorService | `apps/desktop/electron/runtime/simulatorService.ts` | Runs simulator control on the Mac through simctl. |
| config | simulator contract | `packages/contracts/local-runtime/src/simulator.ts` | Simulator command list, capture limits, unavailable reasons. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The agent asks to start a command with run_in_background; the person approves; the process starts in the sandbox and an id and first output return. | device | apps/cli/src/features/exec/tools/bash/mod.rs:74-79, 342-363 |
| The agent reads output with command_output and ends the process with command_stop. | device | apps/cli/src/platform/runtime/tool_catalog.rs:245-246 |
| For a browser read, the CLI refuses in Local privacy mode; otherwise it sends the command through the browser bridge to the paired browser. | device | apps/cli/src/features/exec/tools/mod.rs:724-735, 2262-2266 |
| The extension returns console or network records recorded since the tab was watched; the CLI checks the landing site against domain rules before returning the text. | device | apps/cli/src/features/exec/tools/mod.rs:2268-2294; apps/extension/src/features/browser-tools/pageWatch.ts:79 |
| The text goes to the model as a tool result. | outside service | apps/web/features/code/local-code.ts:552-554 |
| The Simulator pane asks the desktop shell for status and frames every 500 ms and shows them; the person controls it. | device | packages/contracts/local-runtime/src/simulator.ts:122; apps/web/features/code/hooks/use-simulator.ts:62-70 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Console and network buffers | Extension memory per tab, 200 entries each (apps/extension/src/features/browser-tools/consoleCapture.ts:4). | No. | Cleared with the tab through clearConsoleEntries and clearNetworkEntries (apps/extension/src/features/browser-tools/consoleCapture.ts:200). |
| Simulator screenshots and recordings | On the Mac (capture limit 40, recording limit 10 minutes) (packages/contracts/local-runtime/src/simulator.ts:119-120). | No. | Person can delete a capture (simulator_capture_delete). |

**Models and providers.** The model reads text and screenshots returned by tools; no model is needed to capture them. Which models accept images was not checked. Model selection follows F067-01.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Browser tools need a paired Chrome extension signed in; sign-in rules of pairing not read. |
| Permissions | Desktop capability browser.site, and browser.cdp for console and network (packages/contracts/local-runtime/src/device-steps.ts:289-298); shell.execute for commands; simulator.control for the pane (apps/desktop/electron/runtime/dispatcher.ts:1114-1121). Chrome acts only on sites the person approved in the extension (apps/desktop/electron/browser/browserSteps.ts:31). |
| Subscription | No plan gate found for starting a command or reading the browser in the folder paths read. |
| Limits and metering | 200 entries per tab buffer; CLI limit parameter on console and network (apps/cli/src/features/exec/tools/mod.rs:2233-2240 region); simulator 500 ms frame interval. |
| Feature flags | None found for these paths. |
| Model compatibility | Not established. |
| Provider restrictions | None found. |
| Local mode | CLI Local privacy mode refuses every browser tool, so console and network reads are unavailable in Local; starting a command still works (apps/cli/src/features/exec/tools/mod.rs:724-735). The Simulator pane needs no network. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No console messages | 'No console messages captured for this tab.' | apps/extension/src/features/browser-tools/consoleCapture.ts:206 |
| Tab not watched | CLI adds a note asking the user to start watching and reproduce. | apps/cli/src/features/exec/tools/mod.rs:2298 |
| Blocked site | Content is not returned; a blocked-site message is shown. | apps/cli/src/features/exec/tools/mod.rs:2270-2278 |
| Browser unreachable | The CLI returns the bridge failure message as a failed tool result. | apps/cli/src/features/exec/tools/mod.rs:2304-2309 |
| Simulator unavailable | Pane shows the reason and only 'Try again'. | apps/web/features/code/components/LocalSimulatorPane.test.tsx:186 |
| No simulators installed | Message pointing to Xcode components. | apps/web/features/code/simulator-pane.ts:15-17 |
| Frames stop | Retries every 3 seconds and says the screen is not updating. | apps/web/features/code/hooks/use-simulator.ts:38; apps/web/features/code/components/LocalSimulatorPane.test.tsx:324 |
| Permission refused for simulator | Pane says it needs permission and where to allow it. | apps/web/features/code/simulator-pane.ts:14 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/components/LocalSimulatorPane.test.tsx`: Unavailable reasons, permission message, no devices, start, device selection, frame polling, retry, unmount.
- `apps/web/features/code/components/LocalRunningCommands.test.tsx`: Running commands list (titles not read).
- `apps/web/features/code/components/LocalBrowserPanel.test.tsx`: Browser pane (titles not read).
- `apps/web/features/desktop-host/__tests__`: Desktop host client tests (folder exists; titles not read).
- `apps/cli/src/features/exec/tools/mod.rs`: In-file tool tests (batch, patch approval); browser tests not found.

**Test scenarios**

- **Dev server lifecycle**
  1. In the CLI ask to start a dev server.
  2. Read its output twice.
  3. Stop it.
  - Expected: Id returned; new output on each read; process ends on stop.
- **Console error read**
  1. Pair Chrome.
  2. Open a page that logs an error with the tab watched.
  3. Ask the agent for console errors.
  - Expected: The error line appears in the list.
- **Unwatched tab**
  1. Repeat without watching.
  - Expected: Empty list plus the note about watching.
- **Local privacy**
  1. Run the CLI in Local privacy mode.
  2. Ask for a browser read.
  - Expected: Refusal text about Local privacy mode.
- **Failed requests**
  1. Load a page that has a failing request.
  2. Ask for failedOnly network entries.
  - Expected: Only failed requests, with status and address.
- **Simulator pane**
  1. On a Mac open the Code page in Desktop.
  2. Open the iOS Simulator pane and press Start simulator.
  - Expected: A device boots and frames appear.

**Where to look when it fails**

- Text 'Nothing is recorded for this tab' (apps/cli/src/features/exec/tools/mod.rs:2298).
- BrowserStepRefused with reason permission, cancelled or site (apps/desktop/electron/browser/browserSteps.ts:33-40).
- Simulator unavailable reasons (packages/contracts/local-runtime/src/simulator.ts:27-44).
- Nothing was run; no result recorded.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/desktop/067-coding-capabilities-and-developer-workflows.md)
- CLI: [70-qa/test-plans/cli/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/cli/067-coding-capabilities-and-developer-workflows.md)
- VS Code: [70-qa/test-plans/vscode/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/vscode/067-coding-capabilities-and-developer-workflows.md)
- Chrome: [70-qa/test-plans/chrome/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/chrome/067-coding-capabilities-and-developer-workflows.md)

## 10. Gaps and dependencies

- **Brief says CLI console and network missing; the code has both tools.** Affects: CLI; documentation.. Evidence: apps/cli/src/platform/runtime/tool_catalog.rs:51-62; apps/cli/src/features/exec/tools/mod.rs:2178-2250. Work needed: Correct the brief status after a live check.
- **Brief says Web missing for console and network; Desktop chat device steps handle both when Web runs in the Desktop shell.** Affects: Web in Desktop shell.. Evidence: apps/web/features/desktop-host/lib/device-steps.ts:216-218, 262. Work needed: Correct brief; Web in a plain browser still has none.
- **No visible control found to start page watch; CLI instructions name a button not found in the extension source.** Affects: Chrome extension, CLI, Desktop users reading console and network.. Evidence: apps/cli/src/features/exec/tools/mod.rs:2298; apps/extension/src/background.ts:6902. Work needed: Find or build the control, then test the whole path.
- **No agent step drives the iOS Simulator; the pane is human-operated, and Android has nothing.** Affects: All apps (S67.19).. Evidence: packages/contracts/local-runtime/src/device-steps.ts and apps/cli/src have no simulator step. Work needed: Design agent steps with approval, or narrow the requirement.
- **Browser tools are refused in CLI Local privacy mode, so local-only users cannot inspect a page they run themselves.** Affects: Local mode users.. Evidence: apps/cli/src/features/exec/tools/mod.rs:724-735. Work needed: Decide whether a localhost-only exception is allowed [proposed].
- Not built on: Web, Mobile (from the capability ledger).

**Depends on**

- surface:desktop
- surface:cli
- surface:chrome
- surface:web
- surface:vscode
- surface:mobile
- mode:local
- mode:own-key
- mode:cloud
- F067-03
- SYS-execution-boundaries
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-connectors-plugins-and-skills
- file:apps/cli/src/browser_bridge.rs
- file:apps/extension/src/features/browser-tools/pageWatch.ts
- store:extension-tab-capture-buffers

## Unknown

- Whether any extension control starts page watch.
- Whether VS Code reaches the paired browser in the shipped build.
- Which Mobile control, if any, shows running servers.
- Whether simulator frames can go to the agent without the person pressing 'add to chat'.
- Android simulator support: nothing found.
- Test coverage of the CLI browser command path.
