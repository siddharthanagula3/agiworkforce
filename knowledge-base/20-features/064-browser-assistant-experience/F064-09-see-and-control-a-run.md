---
id: "F064-09"
type: "feature"
title: "See and control a run"
aliases: ["Visible action timeline", "Live browser preview", "Active-tab indicator", "Pause/stop", "Browser-task result summary", "Stop", "Recent activity", "Agent finished", "Browser task controls"]
area: "64 Browser-assistant experience"
available_on: ["desktop", "cli", "vscode", "chrome"]
implementation: {web: "missing", desktop: "partial", mobile: "missing", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S64.18", "S64.19", "S64.20", "S64.25", "S64.32"]
depends_on: ["surface:chrome", "surface:desktop", "surface:cli", "surface:vscode", "SYS-observability-and-operations", "SYS-agents-tools-and-automation", "SYS-shared-ui-and-design", "F064-07", "F064-08", "F064-10", "file:apps/extension/src/features/side-panel/computerUsePanel.ts", "file:apps/extension/src/features/content/browserRunOverlay.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F064-09 See and control a run

Shows the person what a browser task is doing and lets them stop it. In Chrome each tool call and result is logged, the task tab is grouped and outlined, an in-page dock offers Stop and Take over, and the run ends with a reason or a summary. Desktop and the CLI list actions with running, done or failed.

Area: [64. Browser-assistant experience](README.md). Requirement items: [S64.18](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6418), [S64.19](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6419), [S64.20](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6420), [S64.25](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6425), [S64.32](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6432).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Makes browser actions visible: a step log, a marked task tab, Stop and Take over buttons, an end-of-run summary and reason, and (Desktop) a recent-activity list.

**Why it exists.** An assistant that clicks in a signed-in browser must be watchable and stoppable. The product requirements ask for clear visible state while AGI controls the browser, logs and a manual takeover path.

**Who uses it.** Anyone running a browser task from Chrome, Desktop, CLI or VS Code.

**Problems it solves**

- The person cannot tell what the assistant did.
- A runaway task cannot be stopped.
- A task that quietly ends leaves the person guessing why.

**Use cases**

- Chrome task: the person watches steps appear, then presses Stop when a step looks wrong.
- Desktop dialog: after 'Click' the activity row shows done or 'failed: <error>'.
- CLI session: terminal lines 'Open(<url>)' and 'Click(<selector>)' show each action.
- A task ends because the site was removed from the approved list; the panel says so.

## 2. User experience

**Where to find it**

- Chrome side panel: step log with a 'Stop' button (aria-label 'Stop computer use') shown during a run (apps/extension/src/features/side-panel/computerUsePanel.ts:1206-1222, 1316).
- Chrome page: closed-shadow overlay with glowing corners, a pointer, and a dock named 'Browser task controls' with 'Stop' and 'Take over' (apps/extension/src/features/content/browserRunOverlay.ts:9-56).
- Chrome tab group named 'AGI' marks the task tab (apps/extension/src/background.ts:1394, 2547-2571).
- Desktop: web dialog 'Use the browser', section 'Recent activity' (apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:38, 422-446).
- CLI: status line per tool (apps/cli/src/platform/runtime/tool_catalog.rs:181-215).
- VS Code: 'Stop response' button and tool rows with a globe icon for computer-use tools (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3365, 8805).

**Before you start**

- A browser task running (Chrome) or a paired browser used (Desktop, CLI).
- Desktop activity list needs the dialog open.

**Screens and controls**

- Step log rows with title, detail (click to expand), time, and screenshots (computerUsePanel.ts:1829-1962).
- Header text 'AGI Cloud • agent running' while running (computerUsePanel.ts:1303-1305).
- Stop, Take over, Continue buttons (computerUsePanel.ts:1214-1237).
- Banner with titles such as 'Browser control stopped', 'Your turn' (computerUsePanel.ts:796-805).
- Clear button that stops the run before clearing the log.

**Journey**

1. The person starts a browser task; the panel marks it running and shows Stop.
2. Each tool call appears as a row, then its result as Completed, Not verified or Skipped.
3. A screenshot step shows the captured image with a viewer button.
4. The person may press Stop in the panel or on the page dock; the background cancels the exact run.
5. The run ends with 'Agent finished' and the final message, or a banner with the reason it stopped.
6. On Desktop, the person opens the dialog and reads each action with time, client, command, target and 'running', 'done' or 'failed: <error>'.

**What the person sees and gets**

- 'Agent finished' with the final message (computerUsePanel.ts:1928-1938).
- A cancellation reason sentence for each of account_changed, debugger_detached, panel_closed, site_access_withdrawn, superseded, tab_intent_changed, tab_removed, takeover_expired, user_cleared, user_stopped (computerUsePanel.ts:813-832).
- 'Chrome stopped the extension in the background, so this task ended...' for a lost worker (computerUsePanel.ts:828-830).
- Desktop activity row text 'running', 'done', 'failed: <error>' (BrowserToolsDialog.tsx:102-106).
- A system notification when a run needs input (apps/extension/src/background.ts:6554 notifyBrowserTask).

**Settings**

- Chrome 'Browser control' mode decides how often a card appears.
- Chrome notifications row in options (apps/extension/src/features/options/notifications-row.ts).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Chrome: step log with tool calls, results labelled by verification, errors, final message, injection notices and screenshots (apps/extension/src/features/side-panel/computerUsePanel.ts:1829-1962).
- Chrome: Stop is shown only while a run is active and sends an exact-run cancel; the panel waits for the background answer and shows a refused-stop message rather than claiming idle (computerUsePanel.ts:1316, 1505-1520; apps/extension/__tests__/computer-use-stop-ui.test.ts:162-221).
- Chrome: end reasons mapped to plain sentences (computerUsePanel.ts:813-832).
- Chrome: the panel reconciles with the background after silence so a dead worker does not show 'running' forever (computerUsePanel.ts:1384-1420).
- Chrome: the task tab is placed in a tab group named 'AGI' while the run is active and ungrouped after (apps/extension/src/background.ts:2547-2571, 6794). Chrome shows its debugging bar too (copy mentions it: computerUsePanel.ts:817-818).
- Chrome: the on-page overlay shows corner glow and a pointer that follows actions, and a dock with Stop and Take over (apps/extension/src/features/content/browserRunOverlay.ts; content.ts:406-412). This is the live view: the person watches the real tab.
- Desktop: every browser command from the dialog, cloud chat or a local client is recorded with time, client, command, target and outcome; the list holds 200 entries (apps/desktop/electron/browser/bridgeServer.ts:1142-1178; apps/desktop/electron/browser/browserSteps.ts:168-184).
- CLI: tool_status_line gives one line per browser tool and tools print it (apps/cli/src/platform/runtime/tool_catalog.rs:181-215; apps/cli/src/features/exec/tools/mod.rs:1520-1525).
- VS Code: a Stop response button exists for the chat turn (webviewContent.ts:3365) and tool events carry the computer-use category (apps/extension-vscode/src/integrations/localRuntimeClient.ts:1170-1193).

**Incomplete**

- There is no separate live preview pane: Chrome shows the real tab plus screenshots in the log only when the model calls screenshot (computerUsePanel.ts:1836-1842, 1951-1961). The brief cites agentLoop.ts:135 and computerUsePanel.ts:1312 for a preview; those lines are the step type and a Stop-class toggle, not a preview.
- Desktop activity list is memory only and appears only in the dialog; no timeline in chat (bridgeServer.ts:1142).
- Desktop: no Stop for a paired-browser step except Stop loading; the extension can cancel a paired command through CANCEL_COMPUTER_USE with no run id (apps/extension/src/background.ts:7148-7162).
- The summary at the end is whatever the model writes; the code has no structured summary of done and remaining items (agentLoop.ts:1294-1296 shows only the step-limit message).

**Present but disconnected or switched off**

- Take over exists in Chrome but is covered by F064-10; here it is only listed as a control.

**Not available**

- Mobile: nothing found.
- Web in an ordinary browser tab: nothing found.
- Desktop active-tab indicator: none for the paired browser; none for the pane (brief S64.20 marks desktop missing).
- Pause (without takeover) as a separate control: not found; Take over is the pause.

## 4. Required behaviour

**Established requirements**

- Each browser action the assistant takes is listed for the user as it happens. (source: brief S64.18)
- The user can watch the browser the assistant is driving while it works. (source: brief S64.19)
- A visible marker shows which tab the assistant is working in. (source: brief S64.20)
- The user can pause or stop the assistant's browser task at any moment. (source: brief S64.25)
- When a browser task ends the assistant reports what it did and what still needs the user. (source: brief S64.32)
- Clear visible state while AGI controls browser or apps; logs and audit trail; manual takeover path. (source: doc: docs/product/requirements.md (section 21.4))

**Acceptance criteria**

1. Starting a Chrome task shows the Stop button; when the run ends it is hidden.
2. Pressing Stop ends the run, and the panel shows 'You stopped the run.'
3. Pressing Stop on the in-page dock has the same effect as the panel button.
4. The task tab appears in a tab group named AGI while running and is ungrouped afterwards.
5. Each Chrome tool result shows Completed only when verified.
6. In the Desktop dialog an action that fails shows 'failed: <error text>'.
7. Closing the side panel mid-run ends the run with the 'side panel closed' sentence.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A final message that lists what is done and what still needs the person is expected by S64.32 but is only prompted, not enforced [inferred from agentLoop.ts:1138].
- The tab group and page overlay together are the intended active-tab indicator [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the Desktop activity list inside chat as a timeline.
- [proposed] Add a structured end summary with done, unverified and needs-you lists.
- [proposed] Add a live preview of the paired Chrome tab in Desktop.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Computer use panel | `apps/extension/src/features/side-panel/computerUsePanel.ts` | Step log, Stop, Take over, Continue, banners, cancellation copy. |
| component | Run overlay | `apps/extension/src/features/content/browserRunOverlay.ts` | Corner glow, pointer, dock with Stop and Take over. |
| service | Content script overlay wiring | `apps/extension/src/content.ts` | Creates the overlay and sends AGI_CU_USER_INPUT stop or takeover (lines 402-412). |
| service | Background run control | `apps/extension/src/background.ts` | AGI_CU_USER_INPUT (6993), PAUSE/RESUME_COMPUTER_USE (7088), CANCEL_COMPUTER_USE (7148), tab group (2547). |
| service | Run ownership | `apps/extension/src/features/computer-use/runOwnership.ts` | Cancellation reasons and run leases. |
| service | Run marker | `apps/extension/src/features/computer-use/runMarker.ts` | Records a running run in session storage to clean up after a lost worker. |
| service | Agent loop | `apps/extension/src/features/computer-use/agentLoop.ts` | Emits tool_call, tool_result, final events and the step-limit message. |
| service | Describe action | `apps/extension/src/features/computer-use/describeAction.ts` | Words for approval descriptions. |
| service | Bridge activity log | `apps/desktop/electron/browser/bridgeServer.ts` | recordBrowserActivity, settleBrowserActivity, listBrowserActivity (1142-1178). |
| service | Desktop dispatcher | `apps/desktop/electron/runtime/dispatcher.ts` | browser_activity command (2635). |
| component | BrowserToolsDialog | `apps/web/features/desktop-host/components/BrowserToolsDialog.tsx` | Recent activity list and Downloads section. |
| config | CLI tool status lines | `apps/cli/src/platform/runtime/tool_catalog.rs` | tool_status_line (181). |
| service | CLI tool printing | `apps/cli/src/features/exec/tools/mod.rs` | print_tool_status call in execute_browser_command (about 1520). |
| component | VS Code chat webview | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Stop response button and tool row icons. |
| service | VS Code runtime client | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | Parses tool-execution events with the computer-use category. |
| test | Stop UI test | `apps/extension/__tests__/computer-use-stop-ui.test.ts` | Stop lifecycle tests. |
| test | Run ownership test | `apps/extension/__tests__/computer-use-run-ownership.test.ts` | Cancellation and ownership tests. |
| test | Run marker test | `apps/extension/__tests__/computer-use-run-marker.test.ts` | Run marker tests (name only). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The agent loop emits progress events for each tool call and result. | device | apps/extension/src/features/computer-use/agentLoop.ts:1560-1575 |
| The background broadcasts AGI_CU_STATE (running, paused, stopped with reason) to the panel and the page overlay. | device | apps/extension/src/background.ts:1074-1090, 6816-6850 |
| Stop in the panel sends CANCEL_COMPUTER_USE with the run id; the background cancels that run. | device | apps/extension/src/features/side-panel/computerUsePanel.ts:1505-1520; apps/extension/src/background.ts:7148-7200 |
| Stop on the page dock sends AGI_CU_USER_INPUT command stop; only accepted from the run's tab and top frame. | device | apps/extension/src/background.ts:6993-7012 |
| Cancelling aborts the in-flight model call to AGI Cloud. | device and our servers | lease.controller signal used in cloudAgentClient (apps/extension/src/features/computer-use/runOwnership.ts:28) |
| Desktop records an activity entry per command and settles it with ok or failed. | device | apps/desktop/electron/browser/bridgeServer.ts:1153-1176 |
| The dialog reads the list through the browser_activity command. | device | apps/desktop/electron/runtime/dispatcher.ts:2635; BrowserToolsDialog.tsx:216-220 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Step log rows | side panel page memory | no | until Clear or the panel closes (Clear stops a running run first, computer-use-stop-ui.test.ts:184) |
| Run marker | chrome.storage.session agi_cu_run_in_progress | no | removed at run end; used to clean up after a worker restart (runMarker.ts) |
| Desktop activity entries | Desktop main memory, 200 max | no | lost on exit |
| Download records | chrome.storage.session key agi_session_downloads, 50 max | no | apps/extension/src/features/browser-tools/downloads.ts:5-6 |

**Models and providers.** The log and controls are model independent. The final summary text is written by the model that ran the task: in Chrome, a model from the account's admitted list reached through AGI Cloud (apps/extension/src/features/computer-use/cloudAgentClient.ts:62-103).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Chrome: signed-in account to start a run; the run stops with 'account_changed' if the account changes (computerUsePanel.ts:814-815). Desktop dialog: none found beyond pairing. |
| Permissions | Stop is accepted only from a trusted extension page (computer-use-run-ownership.test.ts:138) or the run's own tab and top frame (background.ts:6996-7003). |
| Subscription | none found in the code for the visibility controls. |
| Limits and metering | Desktop activity list 200 entries; Chrome step cap per run; approval cards time out (computerUsePanel.ts:949). |
| Feature flags | none found in the code |
| Model compatibility | none found for the controls. |
| Provider restrictions | none found for the controls. |
| Local mode | Desktop activity list and the pane need no cloud. Chrome's run log is produced by a cloud-model run; no Local mode for that run exists. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Idle | Stop hidden; header reads 'AGI Cloud • powered by AGI'. | computerUsePanel.ts:1303-1305, 1298 |
| Running | Stop shown; header 'AGI Cloud • agent running'; watchdog reconciles after silence. | computerUsePanel.ts:1296-1310 |
| Stop refused or unanswered | The panel keeps the run and shows a stop-refused message. | computerUsePanel.ts:845-846, 1505-1510; computer-use-stop-ui.test.ts:202-221 |
| Panel closed | Run stops with 'The side panel closed, so the run was stopped.' | computerUsePanel.ts:822 |
| Worker evicted | Panel asks the background and reports the task ended. | computerUsePanel.ts:828-830, 1384-1420 |
| Debugger bar dismissed | Run stops with copy telling the person to start again. | computerUsePanel.ts:817-819 |
| Empty activity (Desktop) | 'Nothing has used the paired browser since Desktop opened.' | BrowserToolsDialog.tsx:39, 424-426 |
| Failed action (Desktop) | Row shows 'failed: <error>' in the danger colour. | BrowserToolsDialog.tsx:102-106, 439-441 |
| Reduced motion / forced colours | The pointer transition is off under reduced motion; corners use a system highlight in forced colours. | browserRunOverlay.ts:31-33 |
| Offline | not handled in the code for the log itself; model call errors surface as error rows. | computerUsePanel.ts:1914-1922 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/computer-use-stop-ui.test.ts`: Visible Stop lifecycle: neutral refused rendering, single check for verified success, Stop sends exact-run cancel, Clear cancels first, run kept until background answers, refused stop is surfaced.
- `apps/extension/__tests__/computer-use-run-ownership.test.ts`: A supersedes B atomically; stale panels cannot stop a newer run; CANCEL accepted only from a trusted extension page.
- `apps/extension/__tests__/computer-use-run-marker.test.ts`: Run marker (name only; contents not opened).
- `apps/extension/__tests__/side-panel-stop.test.ts`: Side panel stop (name only).
- `apps/web/features/desktop-host/__tests__/BrowserToolsDialog.result.test.tsx`: Dialog result display (name only; contents not opened).
- `apps/web/features/desktop-host/__tests__/BrowserToolsDialog.stop.test.tsx`: Stop loading stops the paired page.
- `apps/cli/src/platform/runtime/tool_catalog.rs`: Inline tests on tool offering; a test for tool_status_line was not found.

**Test scenarios**

- **Stop from the panel**
  1. Start a long Chrome task.
  2. Press Stop in the side panel.
  - Expected: Run ends, Stop disappears, banner 'You stopped the run.'
- **Stop from the page dock**
  1. Start a task.
  2. Press Stop in the dock on the page.
  - Expected: Same result; the dock and overlay are removed.
- **Tab marker**
  1. Start a task on a tab outside any group.
  2. Look at the tab strip during and after.
  - Expected: A group titled AGI holds the tab while running; it is ungrouped afterwards.
- **Reason on site withdrawal**
  1. Start a task.
  2. Remove the site from approved sites mid-run.
  - Expected: Run stops and the banner says access to the site was withdrawn.
- **Desktop activity**
  1. Open Use the browser, Read the page, then run an action that fails (unknown selector).
  - Expected: Recent activity lists both with done and 'failed: <error>'.
- **CLI status line**
  1. Ask the CLI to open an address in the paired Chrome.
  - Expected: Terminal shows Open(<url>) before the result.

**Where to look when it fails**

- Panel banner titles 'Browser control stopped', 'Browser task could not run', 'Your turn'.
- Cancellation reason codes in runOwnership.ts:5-15.
- Desktop '[browser-bridge] ... ran ...' console line (bridgeServer.ts:1168).
- chrome.storage.session key agi_cu_run_in_progress.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/064-browser-assistant-experience.md](../../70-qa/test-plans/desktop/064-browser-assistant-experience.md)
- CLI: [70-qa/test-plans/cli/064-browser-assistant-experience.md](../../70-qa/test-plans/cli/064-browser-assistant-experience.md)
- VS Code: [70-qa/test-plans/vscode/064-browser-assistant-experience.md](../../70-qa/test-plans/vscode/064-browser-assistant-experience.md)
- Chrome: [70-qa/test-plans/chrome/064-browser-assistant-experience.md](../../70-qa/test-plans/chrome/064-browser-assistant-experience.md)

## 10. Gaps and dependencies

- **No live preview as a separate view; only the real tab and optional screenshots.** Affects: Chrome, Desktop, Web, Mobile. Evidence: computerUsePanel.ts:1836-1842; brief S64.19 cites lines that are not a preview. Work needed: Decide whether the real tab is enough; if not, build a preview and correct the brief.
- **Desktop paired-browser work has no active-tab marker and no chat timeline.** Affects: Desktop, Web-in-Desktop. Evidence: bridgeServer.ts:1142-1178 (memory list); brief S64.20 desktop missing. Work needed: Add a marker in Chrome for Desktop-driven commands and show the list in chat.
- **No guaranteed structured end summary.** Affects: All. Evidence: agentLoop.ts:1138 only asks for a concise report. Work needed: Add a summary contract (done, unverified, needs you).
- **Mobile and plain web have none of this.** Affects: Mobile, Web. Evidence: brief S64.18 to S64.32 mark them missing. Work needed: Product decision.
- **Brief says VS Code has timeline and stop 'done' but cites unrelated code.** Affects: VS Code. Evidence: ChatStateManager.ts:3999 is an attachment picker, not stop. Work needed: Verify and correct the citation.
- Not built on: Web, Mobile (from the capability ledger).

**Depends on**

- surface:chrome
- surface:desktop
- surface:cli
- surface:vscode
- SYS-observability-and-operations
- SYS-agents-tools-and-automation
- SYS-shared-ui-and-design
- F064-07
- F064-08
- F064-10
- file:apps/extension/src/features/side-panel/computerUsePanel.ts
- file:apps/extension/src/features/content/browserRunOverlay.ts

## Unknown

- Whether the Chrome tab group is visible to every user (depends on chrome.tabGroups being available, background.ts:2548).
- Whether a results summary is stored anywhere after the panel closes was not established.
- How the VS Code Stop response button cancels a browser tool in flight was not traced.
- Contents of several test files (marker, side-panel-stop, dialog result) were not opened.
- Whether the CLI tool_status_line has tests was not found.
