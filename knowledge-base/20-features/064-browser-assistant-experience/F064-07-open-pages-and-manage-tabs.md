---
id: "F064-07"
type: "feature"
title: "Open pages and manage tabs"
aliases: ["Open URL", "Open a page", "Back/forward/reload", "Create or close tab", "browser_navigate", "browser_history", "browser_open_tab", "navigate", "go_back", "go_forward", "reload", "open_tab", "switch_tab", "close_tab", "Organize tabs (S64.13, not built)"]
area: "64 Browser-assistant experience"
available_on: ["desktop", "cli", "vscode", "chrome"]
implementation: {web: "missing", desktop: "partial", mobile: "missing", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S64.10", "S64.11", "S64.12", "S64.13"]
depends_on: ["surface:chrome", "surface:desktop", "surface:cli", "surface:vscode", "surface:web", "mode:cloud", "SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-authorization-and-workspaces", "F064-12", "F064-09", "file:apps/extension/src/features/computer-use/agentLoop.ts", "file:apps/desktop/electron/browser/browserSteps.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F064-07 Open pages and manage tabs

The assistant sends a browser to a web address, steps back or forward, and reloads. In the Chrome extension it can also open, switch to and close tabs it created. Desktop, the CLI and VS Code reach the user's paired Chrome through Desktop. The Desktop browser pane is driven by the person, not by the assistant.

Area: [64. Browser-assistant experience](README.md). Requirement items: [S64.10](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6410), [S64.11](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6411), [S64.12](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6412), [S64.13](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6413).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Moves a browser page: open an address, go back or forward one history step, reload, and (Chrome extension only) open, switch to or close a tab owned by the task. Every move is checked against the sites the person or the workspace allows.

**Why it exists.** A browsing task starts by getting to the right page, and a mistaken move can lose unsaved work or land on a site the person never approved. The feature gives the assistant that ability while keeping each move inside site rules and approval rules.

**Who uses it.** People who ask the assistant to do something on a website from the Chrome side panel, from AGI Desktop chat, from the CLI or from the VS Code extension; and people who browse by hand in the Desktop browser pane.

**Problems it solves**

- The assistant cannot reach a page without a way to open an address.
- A person who goes back or reloads by mistake loses unsaved form data, so these moves have approval rules.
- A redirect can land on a blocked site, so every landing page is checked.

**Use cases**

- In Chrome the person says 'open the pricing page of this site'; the assistant calls navigate and confirms the page it landed on.
- In Desktop chat the model opens an address in the person's paired Chrome and then reads the page.
- A task in Chrome opens a second tab to compare, then closes it after the person approves.
- In a Desktop coding session the person types a local preview address into the browser pane and uses Back and Reload.

## 2. User experience

**Where to find it**

- Chrome extension: side panel, give a browser task a goal; tools navigate, go_back, go_forward, reload, open_tab, switch_tab, close_tab, list_tabs are offered to the model (apps/extension/src/features/computer-use/browserToolDefinitions.ts:35-48, 121-176). Step titles read 'Open task tab: <url>', 'Go back in the task tab', 'Reload the task tab' (apps/extension/src/features/side-panel/computerUsePanel.ts:1983-2000).
- Web app inside AGI Desktop only: Composer plus menu, row 'Use the browser', dialog 'Use the browser', button 'Open a page', field 'Address' (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:179,1165-1168; apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:30,79,89). The row is shown only when a desktop host exists (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6019).
- Desktop browser pane in a coding session: buttons 'Back', 'Forward', 'Reload', address field 'Type a URL', 'Close browser' (apps/web/features/code/local-code.ts:209-216; apps/web/features/code/components/LocalBrowserPanel.tsx:170-218).
- CLI and VS Code: the model calls browser_navigate and browser_history; the terminal shows 'Open(<url>)', 'Go back', 'Go forward' (apps/cli/src/platform/runtime/tool_catalog.rs:181-196). VS Code lists a 'Browser' tool group that can be switched off per session (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1098-1114).

**Before you start**

- Chrome extension: signed-in AGI account; the site approved for browser control (apps/extension/src/features/computer-use/agentLoop.ts:268-281; apps/extension/src/features/computer-use/approvalPolicy.ts for site classes).
- Desktop dialog, CLI, VS Code: AGI Desktop running and Chrome paired with it; otherwise the dialog shows 'No browser is paired yet. Open Settings, Capabilities to pair the Extension with this Mac.' (apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:33-34). The CLI offers browser tools only when a paired browser is available (apps/cli/src/platform/runtime/tool_catalog.rs:1328-1350).
- Desktop browser pane: AGI Desktop with a local coding session open (apps/web/features/desktop-host/components/BrowserPaneSettings.tsx:57-85).

**Screens and controls**

- Chrome side panel step log (one line per tool call and result) and the in-page dock with 'Stop' and 'Take over' (apps/extension/src/features/content/browserRunOverlay.ts:46-56).
- Approval card 'Approve action: <tool>' with Allow, 'Allow for this task' and 'Skip' (apps/extension/src/features/side-panel/computerUsePanel.ts:879-912).
- Desktop dialog 'Use the paired browser?' with Cancel and 'Allow once' for each manual action (apps/desktop/electron/runtime/dispatcher.ts:2092-2113).
- Desktop pane address field, Back, Forward, Reload.

**Journey**

1. Chrome: the person gives a goal and starts the task on an approved site.
2. The model calls navigate with an http or https address (apps/extension/src/features/computer-use/browserToolDefinitions.ts:403-417).
3. The extension checks the destination, navigates, waits for the page to settle, reads the real URL and checks it again against the site allowlist (apps/extension/src/features/computer-use/agentLoop.ts:871-898).
4. For back, forward or reload the extension first resolves the adjacent history entry, asks for approval where the mode requires it, moves, then compares the history cursor and URL (apps/extension/src/features/computer-use/agentLoop.ts:459-505).
5. For a new tab the model calls open_tab with a url; the extension prepares a plan, asks if the mode requires it, opens the tab in the same window and switches to it (apps/extension/src/features/computer-use/agentLoop.ts:441-457; apps/extension/__tests__/task-tabs-background.test.ts:233).
6. Desktop dialog: the person picks 'Open a page', types an address, presses Run, answers 'Allow once', and reads 'Opened <url>.' in the result box (apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:156-159, 262-280).
7. Desktop pane: the person types an address; an unknown site first asks 'Open this site in the browser?' with 'Allow <host>' (apps/desktop/electron/browserPane.ts:177-196).

**What the person sees and gets**

- Chrome result text such as 'Moved back in the current task tab. Actual URL: ...' or 'Chrome accepted the back request, but its resulting history position was not verified' (apps/extension/src/features/computer-use/agentLoop.ts:495).
- Desktop dialog result 'Opened <url>.' and an activity row (apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:156-159, 428-444).
- Pane refusal message "<host> isn't allowed in the browser pane." with 'Try again' (apps/web/features/code/local-code.ts:224-225).
- If a landing page is refused the result says 'The page is on <url>, a site your workspace administrator does not allow, so nothing from it was read.' (apps/desktop/electron/browser/browserSteps.ts:111-116).

**Settings**

- Chrome options: 'Browser control' mode with Auto, ask first, Full access and an unattended mode (apps/extension/src/features/options/site-permission-policy.ts:57-89).
- Chrome options: approved sites list and 'Blocked sites' list (apps/extension/src/features/options/blocked-sites-section.ts:37).
- Desktop Settings, Browser: 'Allowed sites' and 'Blocked sites' for the pane (apps/web/features/desktop-host/components/BrowserPaneSettings.tsx:26-35).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Chrome extension: navigate, go_back, go_forward, reload, list_tabs, open_tab, switch_tab, close_tab are defined and executed; tab tools are offered only when a task-tab scope exists (apps/extension/src/features/computer-use/browserToolDefinitions.ts:35-48; apps/extension/src/features/computer-use/agentLoop.ts:427-505). The brief marks create/close tab missing for Chrome; the code has them.
- Chrome: after navigation the real URL is read and checked; a landing off the allowlist raises an error that aborts the run (apps/extension/src/features/computer-use/agentLoop.ts:874-886).
- Chrome: back and forward are verified by reversing the history lookup and comparing entry ids and URL (apps/extension/src/features/computer-use/agentLoop.ts:480-494).
- Desktop to paired Chrome: the command set includes browser_navigate, browser_open_tab, browser_history and browser_stop (packages/contracts/types/src/browser-bridge.ts:180-195). Each is validated: only http and https; open_tab rejects addresses with credentials (apps/desktop/electron/browser/commandGate.ts:46-58, 177-200, 265-278).
- Desktop to paired Chrome: workspace website rules are checked before opening and again on the landing page; a tab that moved onto a blocked page is sent back with browser_history (apps/desktop/electron/browser/browserSteps.ts:67-117, 143-150). Extension side repeats the check before and after (apps/extension/src/features/native-bridge/desktopCommands.ts:266-312).
- Desktop: browser_open_tab is accepted from a local client with no paired browser; the desktop then asks before opening the default browser (apps/desktop/electron/browser/bridgeServer.ts:785; apps/desktop/electron/runtime/dispatcher.ts:2219-2229).
- Desktop pane: Back, Forward, Reload do nothing when there is no history entry, and a history target that is now blocked is refused (apps/desktop/electron/browserPane.ts:354-379).
- CLI: browser_navigate and browser_history exist, are approval-gated when confirmation is on, and navigate is refused by workspace site rules and domain rules (apps/cli/src/platform/runtime/tool_catalog.rs:46-57; apps/cli/src/features/exec/tools/mod.rs:1028-1040, 1351-1356, 1503-1506).
- VS Code: shows a 'Browser' tool group the person can disable; the work itself is done by the CLI engine (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1098-1114) [inferred from the tool names matching the CLI list].

**Incomplete**

- Desktop chat (cloud turn) device steps offer only device_browser_navigate; no history, no reload, no open tab (packages/contracts/local-runtime/src/device-steps.ts:52-59, 269-272).
- Desktop paired Chrome has no reload command and no close-tab command (packages/contracts/types/src/browser-bridge.ts:180-195).
- The web dialog hides browser_open_tab, browser_find, browser_fill_form and browser_history from its action list (apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:57-60), so 'Go back' is not a dialog action.
- CLI has no reload and no open tab or close tab tool (apps/cli/src/platform/runtime/tool_catalog.rs:46-57).
- In the Chrome extension, going back or reloading asks only in Ask first and Full access modes; in the default Auto mode it does not ask (apps/extension/src/features/computer-use/crucialActions.ts:20-30; apps/extension/src/features/computer-use/askBeforeActing.ts:47-51).

**Present but disconnected or switched off**

- Desktop browser pane controls exist for the person only; no agent tool drives the pane. The device step list has no pane step (packages/contracts/local-runtime/src/device-steps.ts:52-59) and docs say 'agent tools use the paired Chrome' (doc: docs/architecture/desktop-local-runtime.md:301).
- Chrome tab tools are filtered out of the model's tool list when the run has no task-tab scope (apps/extension/src/features/computer-use/browserToolDefinitions.ts:35-43).

**Not available**

- Organize tabs (group, sort, tidy) on any app: no code found (brief S64.13; searched the extension, desktop and CLI tool lists).
- Mobile: no browser control of any kind found for this feature (brief S64.10 to S64.12 mark mobile missing).
- Web in an ordinary browser tab: the 'Use the browser' row is shown only with a desktop host (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1289).

## 4. Required behaviour

**Established requirements**

- The assistant opens a web address in the browser for the user. (source: brief S64.10)
- The assistant can go back, go forward or reload the page it is working on. (source: brief S64.11)
- The assistant can open a new tab or close one as part of a task. (source: brief S64.12)
- The assistant groups, sorts or tidies the user's open tabs. (source: brief S64.13)
- Browser and computer use treats external content as untrusted, has site permission prompts, allowlists and blocklists, and asks before high-impact actions. (source: doc: docs/product/requirements.md (section 21.4 Browser And Computer Use))
- Chrome page content is untrusted and browser data does not enter global memory or synced chat by default. (source: doc: docs/product/requirements.md (section 14))

**Acceptance criteria**

1. In Chrome, navigate to an approved address ends with the tab on that address and a result line that names the actual URL.
2. In Chrome, navigate to an address whose redirect lands off the allowlist aborts the run with a 'not on the site allowlist' message.
3. In Chrome with Ask first, go_back shows an approval card; pressing Skip leaves the tab on the same page.
4. In Chrome, close_tab always asks, and cannot close the original tab.
5. In Desktop's 'Use the browser' dialog, 'Open a page' with 'ftp://x' is refused with 'Only http and https addresses are supported.'
6. In Desktop with a workspace deny rule, opening a denied address does not touch the browser.
7. In the Desktop pane, Back with no history does nothing and shows no error.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A single shared set of tab and history commands across Chrome, Desktop and CLI would remove the differences in the tool lists [inferred from the three separate command sets].
- Reload should be available wherever back and forward are, since the pane, Chrome tools and the brief all treat the three together [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add browser_reload and browser_close_tab to the Desktop bridge and the CLI tool list.
- [proposed] Add device_browser_history to the cloud-chat device steps so Desktop chat can go back.
- [proposed] Decide whether back and reload should ask in Auto mode, since the code asks in Ask first and Full access only.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | Chrome browser tool definitions | `apps/extension/src/features/computer-use/browserToolDefinitions.ts` | Defines navigate, go_back, go_forward, reload, list_tabs, open_tab, switch_tab, close_tab and which are offered. |
| service | Chrome agent loop | `apps/extension/src/features/computer-use/agentLoop.ts` | Executes navigate (871), tab actions (441), history and reload (459) with verification. |
| service | Approval policy | `apps/extension/src/features/computer-use/approvalPolicy.ts` | Marks go_back, go_forward, reload and close_tab as always-ask reasons (lines 358-367). |
| service | Ask-before-acting modes | `apps/extension/src/features/computer-use/askBeforeActing.ts` | Decides whether an always-ask action really asks in each browser permission mode. |
| config | Crucial action table | `apps/extension/src/features/computer-use/crucialActions.ts` | Says history_navigation and reload are not crucial, so Auto mode does not ask. |
| service | Task tabs broker | `apps/extension/src/features/browser-tools/taskTabs.ts` | Owns the list of task tabs and prepares and runs open, switch and close plans (imported at apps/extension/src/background.ts:169). |
| service | Desktop-issued browser commands in Chrome | `apps/extension/src/features/native-bridge/desktopCommands.ts` | Runs browser_navigate, browser_history and browser_open_tab for Desktop, with site-rule checks before and after. |
| service | Command planner | `apps/desktop/electron/browser/commandGate.ts` | Validates arguments and writes the approval wording for each browser command. |
| service | Browser step runner | `apps/desktop/electron/browser/browserSteps.ts` | Runs a cloud-chat browser step with grant, optional review prompt, site rules and landing check. |
| service | Bridge server | `apps/desktop/electron/browser/bridgeServer.ts` | Loopback server for the paired Chrome and local clients; queues commands, times out after 45 s; allows browser_open_tab without a pairing (line 785). |
| service | Desktop runtime dispatcher | `apps/desktop/electron/runtime/dispatcher.ts` | runBrowserCommand (line 2152) asks permission and runs a command; pane commands at 2452-2487; browser_step at 2633. |
| service | Browser pane | `apps/desktop/electron/browserPane.ts` | The person-driven pane: navigate, back, forward, reload, site decision. |
| schema | Browser bridge contract | `packages/contracts/types/src/browser-bridge.ts` | Lists BROWSER_COMMANDS and the 45 s command timeout. |
| schema | Pane contract | `packages/contracts/local-runtime/src/browser-pane.ts` | Pane commands, state shape, address parsing and the allow/block decision. |
| schema | Device step definitions | `packages/contracts/local-runtime/src/device-steps.ts` | Defines device_browser_navigate and the browser_step command used by cloud chat. |
| component | BrowserToolsDialog | `apps/web/features/desktop-host/components/BrowserToolsDialog.tsx` | The 'Use the browser' dialog with 'Open a page'. |
| component | LocalBrowserPanel | `apps/web/features/code/components/LocalBrowserPanel.tsx` | Back, Forward, Reload and address field of the Desktop pane. |
| config | CLI tool catalog | `apps/cli/src/platform/runtime/tool_catalog.rs` | BROWSER_TOOLS list (line 46), status lines (181), tool schemas (1048+), offered only when a browser is paired (1328). |
| service | CLI tool execution | `apps/cli/src/features/exec/tools/mod.rs` | Site-rule refusal for browser_navigate, approvals, and execute_browser_command. |
| service | CLI bridge client | `apps/cli/src/browser_bridge.rs` | Sends browser commands to Desktop with a 60 s timeout. |
| component | Run overlay | `apps/extension/src/features/content/browserRunOverlay.ts` | On-page dock with Stop and Take over during a Chrome run. |
| test | Task tab tests | `apps/extension/__tests__/task-tabs-background.test.ts` | Covers open, switch and close of task tabs. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Chrome: the side panel starts a run on the signed-in account; the loop sends the goal, page text and tool list to AGI Cloud. | device and our servers | apps/extension/src/features/computer-use/agentLoop.ts:1099-1180; apps/extension/src/features/computer-use/cloudAgentClient.ts:317 |
| The model returns a navigate, history, reload or tab tool call. | our servers | apps/extension/src/features/computer-use/cloudAgentClient.ts:306-320 |
| The extension resolves the target (adjacent history entry, tab plan), decides whether to ask, shows an approval card if needed. | device | apps/extension/src/features/computer-use/agentLoop.ts:1380-1440; apps/extension/src/background.ts:6490-6560 |
| The extension moves the tab through the Chrome debugger, waits for the page to settle, reads the real URL and checks it against site policy. | device | apps/extension/src/features/computer-use/agentLoop.ts:871-898 |
| Desktop chat: a cloud turn names device_browser_navigate; the web page calls the desktop 'browser_step' command with the address and optional site rules. | device and our servers | apps/web/features/desktop-host/lib/device-steps.ts:196-205; packages/contracts/local-runtime/src/device-steps.ts:269-272 |
| Desktop checks site rules, asks for the browser grant once, optionally shows a 'Check this step' prompt, queues the command to the paired Chrome, which acts and answers; Desktop checks the landing address again. | device | apps/desktop/electron/browser/browserSteps.ts:134-187; apps/desktop/electron/browser/bridgeServer.ts:1052-1105 |
| CLI: the model calls browser_navigate or browser_history; the CLI checks site rules, asks the user, and posts the command to Desktop's loopback bridge using a token file. | device | apps/cli/src/features/exec/tools/mod.rs:1028-1040, 1112-1113; apps/cli/src/browser_bridge.rs:270-340 |
| Desktop pane: the person types an address; the main process decides loopback, allowed, blocked or ask, and loads the page in its own session. | device | apps/desktop/electron/browserPane.ts:198-217; packages/contracts/local-runtime/src/browser-pane.ts:93-110 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chrome task tab ids and run marker (run id, tab ids) | chrome.storage.session key agi_cu_run_in_progress | no (session storage of the browser) | removed when the run ends or after a lost worker is cleaned up (apps/extension/src/features/computer-use/runMarker.ts:1-60) |
| Desktop browser activity list (time, client, command, target, outcome) | memory of the Desktop main process, last 200 entries | no | lost when Desktop closes (apps/desktop/electron/browser/bridgeServer.ts:1142-1170); the dialog says 'Nothing has used the paired browser since Desktop opened.' |
| Pane allowed and blocked site lists | file desktop-browser-sites.json in the Desktop user data folder, mode 0600 | no | kept until the person removes a site (apps/desktop/electron/browserPane.ts:44-96) |
| Pane page history and cookies | Electron persistent partition persist:agi-browser-pane | no | deleted by 'Clear browsing data' (apps/desktop/electron/browserPane.ts:18, 423-427) |

**Models and providers.** Chrome tab and page moves are decided by a model reached only through AGI Cloud (POST /api/llm/v1/chat/completions); the model is picked from the account's admitted models and must support tools, vision and streaming (apps/extension/src/features/computer-use/cloudAgentClient.ts:62-103, 317). The tools themselves run on the device. Desktop chat, the CLI and VS Code use whatever model the chat or CLI session uses; the browser command layer is model independent. No provider name is hardcoded in the browser code that was read.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Chrome: a signed-in AGI Cloud account is required, else 'no authenticated AGI Cloud session is available' (apps/extension/src/features/computer-use/agentLoop.ts:268-281). Desktop pane and pairing: no account check found in the code read. Web dialog: reached through the hosted web app inside Desktop; whether sign-in is required there was not established. |
| Permissions | Chrome: per-site approval and browser-control consent, plus Chrome's debugger bar (apps/extension/src/features/computer-use/browserControlConsent.ts). Desktop: capability browser.site granted once, per client for local clients (apps/desktop/electron/runtime/dispatcher.ts:2152-2200; apps/desktop/electron/browser/commandGate.ts:121-124). Pane: ask before each new site. |
| Subscription | Chrome browser tasks run on Managed Cloud with plan-admitted models (apps/extension/src/features/computer-use/cloudAgentClient.ts:62-103). No plan check specific to navigation was found. The paired-Chrome path through Desktop has no subscription check in the browser code. |
| Limits and metering | Chrome: a step cap per run (DEFAULT_MAX_AGENT_STEPS, apps/extension/src/features/computer-use/agentLoop.ts:55, 1294-1296); managed quota errors are classified (apps/extension/src/features/computer-use/cloudAgentClient.ts:370). Desktop: 45 s command timeout (packages/contracts/types/src/browser-bridge.ts:178); CLI 60 s (apps/cli/src/browser_bridge.rs:25). Pane site lists capped at 200 (packages/contracts/local-runtime/src/browser-pane.ts:20). |
| Feature flags | none found in the code for these moves. The CLI offers the family only when a browser is paired and the plan mode filters it to reads (apps/cli/src/platform/runtime/tool_catalog.rs:1328-1350). |
| Model compatibility | Chrome needs a model with tools, vision and streaming (apps/extension/src/features/computer-use/cloudAgentClient.ts:96-101). Others: none found. |
| Provider restrictions | Chrome: managed traffic must be permitted for the model (isManagedTrafficPermitted, apps/extension/src/features/computer-use/cloudAgentClient.ts:73-80). Others: none found. |
| Local mode | Desktop pane and the Desktop to paired Chrome commands run on the device over loopback and need no cloud call themselves (apps/desktop/electron/browser/bridgeServer.ts: loopback check in route). The Chrome extension agent has no Local or own-key path: it calls the AGI gateway (apps/extension/src/features/computer-use/cloudAgentClient.ts:317); the docs call Chrome a cloud-only browser-task product (doc: docs/product/experience-contract.md section 12.6). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Chrome waits for the page to be stable up to 3 s after navigate, back and forward; the pane reports loading state; the dialog shows a Running spinner. | apps/extension/src/features/computer-use/agentLoop.ts:466-468, 874; apps/desktop/electron/browserPane.ts:150; apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:410 |
| Empty history | Chrome: 'No adjacent web history entry is available in this task tab.' Pane: nothing happens. | apps/extension/src/features/computer-use/agentLoop.ts:466-468; apps/desktop/electron/browserPane.ts:362-363 |
| Blocked landing | Chrome aborts the run; Desktop sends back and refuses with a message; pane hides the page and shows the refused host. | apps/extension/src/features/computer-use/agentLoop.ts:876-885; apps/desktop/electron/browser/browserSteps.ts:108-116; apps/desktop/electron/browserPane.ts:163-167 |
| Not paired | Desktop returns 'No browser is paired with this desktop app.' except for browser_open_tab, which proceeds to ask about the default browser. | apps/desktop/electron/browser/bridgeServer.ts:785-792; apps/desktop/electron/runtime/dispatcher.ts:2219-2229 |
| Timeout | Desktop rejects with 'The paired browser did not answer.' after 45 s. | apps/desktop/electron/browser/bridgeServer.ts:1074-1085 |
| Cancel | Declining the Desktop prompt gives 'That browser action was not run.' (manual) or a cancelled refusal (cloud chat). Skip on a Chrome card skips the tool. | apps/desktop/electron/runtime/dispatcher.ts:2205-2207; apps/desktop/electron/browser/browserSteps.ts:162-167 |
| Approval card unanswered | Chrome skips the action after the approval timeout and the card reads 'Skipped (no response)'. | apps/extension/src/features/side-panel/computerUsePanel.ts:949-962 |
| Offline | Not handled in the code for navigation specifically; the Desktop dialog shows 'The paired browser is not answering...' when pairing exists but Chrome is not polling. | apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:35-36, 314-316 |
| Accessibility | Dialog uses role=dialog, aria-modal; pane buttons have aria-labels; the Chrome approval card is an alertdialog with labelled title and description. | apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:291-295; apps/web/features/code/components/LocalBrowserPanel.tsx:170-191; apps/extension/src/features/side-panel/computerUsePanel.ts:884-888 |
| App differences | Tab creation and close exist only in Chrome; reload exists only in Chrome and the pane; back and forward exist in Chrome, pane, CLI and the Desktop-issued command set. | apps/extension/src/features/computer-use/browserToolDefinitions.ts:121-176; apps/cli/src/platform/runtime/tool_catalog.rs:46-57 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/task-tabs-background.test.ts`: Task tabs activate only after the approved destination is verified; creates a tab in the background then switches; closes an inactive created tab; refuses a tab whose document changed.
- `apps/extension/__tests__/computer-use-approval-policy.test.ts`: Approval policy decisions for browser actions (file name; contents not opened).
- `apps/extension/__tests__/browser-approval-modes.test.ts`: Behaviour per browser permission mode (file name; contents not opened).
- `apps/extension/__tests__/computer-use-agent-loop.test.ts`: The Chrome agent loop (file name; contents not opened).
- `apps/extension/__tests__/desktop-browser-commands.test.ts`: Desktop-issued commands in Chrome: refuses unknown commands, unapproved sites, no open page; reads page, captures tab.
- `apps/desktop/electron/__tests__/browserSteps.test.ts`: Paired browser under workspace rules: refuses blocked address, goes back after a blocked redirect, withholds reads from blocked sites, refuses unreadable address under an allow list, sends rules with the command.
- `apps/desktop/electron/__tests__/browserCommandGate.test.ts`: Wording and labelled lines of each browser command's approval text.
- `apps/desktop/electron/__tests__/browserPane.test.ts`: Pane opens local pages without asking, asks for other sites, refuses blocked sites, holds redirects, opens no new windows, grants pages no permissions.
- `apps/desktop/electron/__tests__/browserBridge.test.ts`: The loopback bridge (file name; contents not opened).
- `apps/web/features/code/components/LocalBrowserPanel.test.tsx`: The pane panel UI (file name; contents not opened).
- `apps/cli/src/platform/runtime/tool_catalog.rs`: Inline tests: browser family offered only when paired; plan mode offers only reads; only reads classified read-only.

**Test scenarios**

- **Chrome navigate and verify**
  1. Sign in to the extension and approve a test site.
  2. Start a task: 'Open <test site>/about and tell me the page title'.
  3. Watch the side panel step log.
  - Expected: A 'navigate' step runs, the result shows 'verified: actual URL = <test site>/about', and the final report names the title.
- **Chrome back asks in Ask first**
  1. Set Browser control to the ask-first option.
  2. Run a task that visits two pages then goes back.
  3. Press Skip on the approval card.
  - Expected: A card says leaving the page may discard unsaved changes; after Skip the tab stays on the second page.
- **Chrome open and close a tab**
  1. Run a task that opens a second tab on an approved site, reads it, then closes it.
  2. Approve the close card.
  - Expected: A task-owned tab opens and becomes current; close needs approval in every mode; the original tab cannot be closed.
- **Desktop dialog opens a page**
  1. Pair Chrome with Desktop.
  2. Open Use the browser, choose Open a page, type https://example.com, Run, answer Allow once.
  - Expected: Result 'Opened https://example.com/.' and an activity row with outcome done.
- **Blocked landing is sent back**
  1. Set a workspace deny rule for a test host.
  2. Open an address that redirects to that host.
  - Expected: The tab returns to its previous page and the step fails with 'a site your workspace administrator does not allow'.
- **Pane back with no history**
  1. Open the Desktop pane on a fresh session.
  2. Press Back and Forward.
  - Expected: Buttons are disabled or do nothing; no error appears.

**Where to look when it fails**

- Desktop console line '[browser-bridge] <client> ran <command> in the paired browser' (apps/desktop/electron/browser/bridgeServer.ts:1168).
- Chrome cancellation copy keyed by reason, for example site_access_withdrawn, tab_intent_changed (apps/extension/src/features/side-panel/computerUsePanel.ts:813-832).
- Error classes NavigationOffAllowlistError and BrowserStepRefused (reason permission, cancelled or site).
- Desktop: 'Browser activity' list in the dialog (Recent activity).

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/064-browser-assistant-experience.md](../../70-qa/test-plans/desktop/064-browser-assistant-experience.md)
- CLI: [70-qa/test-plans/cli/064-browser-assistant-experience.md](../../70-qa/test-plans/cli/064-browser-assistant-experience.md)
- VS Code: [70-qa/test-plans/vscode/064-browser-assistant-experience.md](../../70-qa/test-plans/vscode/064-browser-assistant-experience.md)
- Chrome: [70-qa/test-plans/chrome/064-browser-assistant-experience.md](../../70-qa/test-plans/chrome/064-browser-assistant-experience.md)

## 10. Gaps and dependencies

- **Desktop chat cannot go back, reload or open or close a tab; the Desktop-issued command set has no reload or close.** Affects: Desktop and Web-in-Desktop users in chat; CLI and VS Code users. Evidence: packages/contracts/local-runtime/src/device-steps.ts:52-59; packages/contracts/types/src/browser-bridge.ts:180-195. Work needed: Add the commands to the bridge contract, extension handler, planner and device step list, then test each.
- **CLI and VS Code have no reload and no tab tools.** Affects: CLI, VS Code. Evidence: apps/cli/src/platform/runtime/tool_catalog.rs:46-57. Work needed: Add the tools to the CLI catalog and bridge.
- **Organize tabs does not exist anywhere.** Affects: All apps. Evidence: brief S64.13 (missing on desktop, cli, vscode); no code found. Work needed: Decide scope and permissions, then build.
- **The Desktop browser pane cannot be driven by the assistant.** Affects: Desktop coding sessions. Evidence: packages/contracts/local-runtime/src/device-steps.ts:52-59; doc: docs/architecture/desktop-local-runtime.md:301. Work needed: Either add agent steps for the pane or record the decision to keep it person-only.
- **Web in an ordinary browser tab and Mobile have no browser control.** Affects: Web (non-Desktop), Mobile. Evidence: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1289. Work needed: Product decision; Mobile has no code.
- **The brief's code citations for CLI (apps/cli/src/features/exec/tools/mod.rs:1236, apps/cli/src/agent/chat.rs:688) and VS Code (webviewContent.ts:5654, localRuntimeClient.ts:948) do not point at browser code; the brief's 'done' for VS Code Open URL is unverified.** Affects: Knowledge base accuracy for CLI and VS Code. Evidence: apps/cli/src/features/exec/tools/mod.rs:1225-1250 (lsp tools); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5640-5670 (side question UI). Work needed: Correct the brief citations to the real lines listed in this page.
- Not built on: Web, Mobile (from the capability ledger).

**Depends on**

- surface:chrome
- surface:desktop
- surface:cli
- surface:vscode
- surface:web
- mode:cloud
- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- F064-12
- F064-09
- file:apps/extension/src/features/computer-use/agentLoop.ts
- file:apps/desktop/electron/browser/browserSteps.ts

## Unknown

- Whether the web dialog and the pane require a signed-in account is not established.
- Whether VS Code can actually run the browser tools end to end was not verified; only the tool group list was read.
- Where workspace website rules (siteRules) are produced and sent for cloud-chat steps was not traced.
- Contents of computer-use-agent-loop.test.ts, browser-approval-modes.test.ts and browserBridge.test.ts were not opened.
- Whether any test run has passed: no results file was read.
