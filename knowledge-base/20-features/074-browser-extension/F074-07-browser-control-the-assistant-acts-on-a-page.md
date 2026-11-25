---
id: "F074-07"
type: "feature"
title: "Browser control (the assistant acts on a page)"
aliases: ["Computer Use tab", "Computer use", "Browser control", "Browser task", "Agent loop", "AGI_START_COMPUTER_USE", "Take over / Continue", "Browser task controls (page dock)", "S74.15 Agent action indicator", "S74.16 Browser-control mode", "S74.17 Stop/takeover control"]
area: "74 Browser extension"
available_on: ["chrome"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "built"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S74.15", "S74.16", "S74.17"]
depends_on: ["surface:chrome", "mode:cloud", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-security-and-privacy", "file:apps/extension/src/background.ts", "file:apps/extension/src/features/computer-use/agentLoop.ts", "api:POST /api/llm/v1/chat/completions", "api:GET /api/llm/v1/models", "api:GET /api/usage", "store:chrome-storage-session", "store:chrome-storage-local"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F074-07 Browser control (the assistant acts on a page)

In the Chrome extension, a person gives AGI a goal, from the Computer Use tab or a chat message, and AGI clicks, types and reads on the current tab through Chrome's debugger. It runs on AGI Cloud models, only on approved sites, shows a page overlay and a step log, and can be stopped or taken over.

Area: [74. Browser extension](README.md). Requirement items: [S74.15](../../10-requirements/capabilities/074-browser-extension.md#s7415), [S74.16](../../10-requirements/capabilities/074-browser-extension.md#s7416), [S74.17](../../10-requirements/capabilities/074-browser-extension.md#s7417).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the Chrome extension drive the person's current browser tab to reach a goal they typed. A model on AGI Cloud looks at the page (text and screenshots), picks actions (click, type, navigate, scroll and similar), and the extension carries them out with the Chrome debugger. The person sees each step, can approve risky steps, stop the run, or take the page over and hand it back (apps/extension/src/features/computer-use/agentLoop.ts; apps/extension/src/background.ts:6232-6760).

**Why it exists.** Claude and ChatGPT both offer a browser agent. The brief lists three requirements for it: show clearly that the agent is acting, let the person switch into a browser-control mode with a goal, and give a visible Stop or takeover control (doc: knowledge-base/data/area-briefs/074-browser-extension.md, S74.15 to S74.17). docs/product/requirements.md:81 lists page automation as a Chrome extension duty (doc: docs/product/requirements.md:81).

**Who uses it.** People using the Chrome extension signed in to AGI Cloud who want AGI to do a web task on a site they approved.

**Problems it solves**

- Repetitive multi-step web tasks (find, compare, fill) done by hand
- Not knowing whether an agent is acting on a page
- Needing to stop an agent or finish a login or captcha step by hand and then return control

**Use cases**

- Type 'find the cheapest direct flight to Denver next Friday' in the Computer Use tab on an approved travel site
- Ask in chat to fill a form on the open page and approve each sensitive step
- Press Take over to sign in by hand, then Continue so AGI finishes the task
- Run an unattended task on an already approved site with the YOLO permission mode

## 2. User experience

**Where to find it**

- surface:chrome: side panel, tab labelled 'Computer Use' next to 'Chat' (apps/extension/src/side_panel.ts:13495-13520).
- surface:chrome: a chat message that needs the browser can start a browser task through the chat tool (apps/extension/src/side_panel.ts:7258-7380, startComposerBrowserTask).
- surface:chrome: on the driven web page, a dock named 'Browser task controls' with buttons 'Stop' and 'Take over', a pointer and screen corners (apps/extension/src/features/content/browserRunOverlay.ts:36-85).
- Other apps (web, desktop, mobile, cli, vscode): not available. Desktop has its own computer use that is a separate feature (doc: docs/product/experience-contract.md:586).

**Before you start**

- Signed in to AGI Cloud; the controls bar chip reads 'Signed in' or 'Sign in required' (apps/extension/src/features/side-panel/computerUsePanel.ts:1530-1556).
- An ordinary website tab; browser pages and the Web Store are refused: 'AGI cannot act on this page. Open an ordinary website.' (computerUsePanel.ts:1640-1660).
- The site approved for browser control: card 'Let AGI act on <host>' with button 'Allow browser control on <host>', which asks Chrome for site access and records consent (side_panel.ts:13984-14030; apps/extension/src/features/computer-use/browserControlConsent.ts:7-17).
- A model on the account that supports tools, vision and streaming (apps/extension/src/features/computer-use/cloudAgentClient.ts:50-100).

**Screens and controls**

- Computer Use tab: banner (icon, title, text), controls bar with 'Run Autofill', 'Continue', 'Take over', 'Stop', auth chip, label 'AGI Cloud • powered by AGI' (becomes 'AGI Cloud • agent running'), permission mode select, 'Clear' (computerUsePanel.ts:1102-1330).
- Permission mode select options: 'Ask first', 'Auto', 'Full access', 'YOLO' (_locales/en/messages.json keys spAutonomyAskFirst, spAutonomyAuto, spAutonomyFullAccess, spAutonomyYolo).
- Task form: label 'Task', textarea limited to 4096 characters with placeholder 'Tell AGI what to do on this page, for example: find the cheapest direct flight to Denver next Friday', site hint ('Works on <host>', 'Allow <host> above to start'), button 'Start' (computerUsePanel.ts:1585-1650).
- Step log, approval cards (Allow / Allow for task / Skip) and a usage meter 'Steps: 0/20' (computerUsePanel.ts:1660-1700; apps/extension/src/features/computer-use/agentLoop.ts:55).
- Chat composer shows an indicator naming the page being driven for chat-started tasks (side_panel.ts:10857-10885, element sp-agent-page).

**Journey**

1. Open the side panel and choose 'Computer Use'.
2. If the page is a normal site that is not yet approved, press 'Allow browser control on <host>', accept Chrome's site access prompt and read the consent text 'This grants full DevTools-Protocol control' (browserControlConsent.ts:7-17).
3. Type the goal and press 'Start' or Enter. The Start button is disabled until the site is ready and while a task runs (computerUsePanel.ts:1620-1650).
4. Chrome shows its debugging banner; the page shows the dock, pointer and corners; the label changes to 'AGI Cloud • agent running' and steps appear in the log.
5. Approve or skip sensitive steps in approval cards, or add extra details while it runs.
6. Press 'Take over' (panel or page dock) to pause; the banner says 'Your turn' and 'Choose Continue when you are done'; press 'Continue' to give the page back, or 'Stop' to end the run.
7. The run ends: completed, stopped (with a reason sentence), or error; the label returns to 'AGI Cloud • powered by AGI'.

**What the person sees and gets**

- Step-by-step log and usage meter (steps used of 20, tokens).
- Banner titles: 'Browser control stopped', 'Browser task could not run', 'Your turn' (computerUsePanel.ts:769-805).
- A sentence per stop reason, for example 'You stopped the run.' or 'The tab this run was driving was closed.' (computerUsePanel.ts:809-835).
- Desktop notification for needs-input, finished and failed through notifyBrowserTask (background.ts:6500-6520, 6780-6800).
- Final result: browser context returned to the chat for chat-started tasks (background.ts:6736-6760).

**Settings**

- Permission mode (storage key from ASK_BEFORE_ACTING_KEY in store:chrome-storage-local).
- Approved sites and per-site policy under Options, Permissions (apps/extension/src/features/options/site-allowlist.ts; site-permission-policy.ts).
- Blocked sites list (blocked-sites-section.ts).
- Task notifications toggle (test: task-notifications-toggle.test.ts).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Start admission checks: goal required and at most 4096 characters, tab exists and is active, site on the allowlist, browser-control consent, signed in to AGI Cloud, permission mode loaded, model access verified (apps/extension/src/background.ts:6232-6470).
- One active run with a lease; starting a new run cancels the earlier one with reason 'superseded' (background.ts:6283-6286; apps/extension/src/features/computer-use/runOwnership.ts, ComputerUseRunCoordinator.begin). The first draft said a second start is refused; the code supersedes instead. The panel disables Start while a task runs, and a start is refused while a paired desktop browser command is active (background.ts:6275-6281).
- Run ends on tab closed (background.ts:7710-7718), tab URL leaving the approved page when nothing is in flight and no takeover (background.ts:7720-7745), account change (background.ts:1100-1112, called from GET_CLOUD_AUTH_TOKEN at 5038), site access withdrawn, panel closed (pagehide sends CANCEL_COMPUTER_USE with reason panel_closed, computerUsePanel.ts:1450-1470), debugger bar dismissed (background.ts:6690-6695), worker lost (see F074-11).
- Stop: panel sends CANCEL_COMPUTER_USE with run id and reason; button shows 'Stopping…'; a refusal shows 'The run could not be stopped and may still be driving the tab. Close the tab to be certain.' (computerUsePanel.ts:1405-1450; background.ts:7148-7210). The page dock Stop sends AGI_CU_USER_INPUT command stop, checked against run id, top frame and tab (background.ts:6993-7015).
- Take over and Continue: PAUSE_COMPUTER_USE and RESUME_COMPUTER_USE (background.ts:7088-7146). Take over lasts at most 15 minutes (USER_TAKEOVER_MAX_MS, runOwnership.ts:17), then the run ends with reason takeover_expired (background.ts:1050-1066). Continue re-checks the site is still approved; if not, the run ends as site_access_withdrawn (background.ts:7120-7134).
- Automatic takeover when the person uses the page: real user input on the driven tab while no action is in flight pauses the run with 'You started using the page, so AGI stopped acting on it.' (background.ts:7020-7035; locale key cuTakeoverByInputReason).
- The agent can ask the person to take over with the tool ask_user_to_take_over; in unattended mode it reports the step as unfinished instead (agentLoop.ts:1470-1500, 1550-1585).
- Approval flow: actions needing approval ask the person; the request times out after 5 minutes and is treated as refused (agentLoop.ts:1320; background.ts:6570-6585). In YOLO mode an action that needs approval is not performed (background.ts:6545).
- Chat-started tasks: one browser task at a time per panel ('Another browser task is already running in this panel.'), the task ties to the page and conversation present at start (side_panel.ts:7258-7300, 7340-7376). Unattended (YOLO) chat tasks need the site already approved and Chrome host access, else 'Approve <host> in Permissions before starting an unattended task on this site.' (side_panel.ts:7795-7833).
- Panel safety net: if no sign of life for 90 seconds the panel asks the worker whether the run still exists and reports 'The background service stopped reporting on this run, so it is no longer being tracked here.' (computerUsePanel.ts:1020-1040, 1380-1420). A panel reopened mid-run adopts the run and says 'A browser-control run started before this panel was reopened is still active. Use Stop to end it.' (computerUsePanel.ts:1425-1450).

**Incomplete**

- The page indicator that names the driven page (sp-agent-page) follows only chat-started tasks (composerBrowserRun); a task started from the Computer Use tab is shown by the step log, the label and the on-page dock instead (side_panel.ts:10857-10885).
- Many control labels in the Computer Use panel are English literals in code, not locale keys ('Stop', 'Take over', 'Continue', 'Start', 'Task', 'Clear') (computerUsePanel.ts:1190-1240, 1585-1650). Whether other locales exist for the rest of the panel: unknown.
- No file records that the whole flow was run end to end against a live site; apps/extension/e2e/smoke.mjs exists but was not opened.

**Present but disconnected or switched off**

- The retained Run Autofill button in the same panel is a separate job-application feature and is not part of this feature (side_panel.ts:14058-14095).

**Not available**

- surface:web, surface:desktop, surface:mobile, surface:cli, surface:vscode: not applicable; the brief marks them n/a (doc: knowledge-base/data/area-briefs/074-browser-extension.md:72-85).
- mode:local and mode:own-key: no code path found in the extension that runs the agent loop on a local model or with a user's own provider key; the only model call goes to AGI Cloud (cloudAgentClient.ts:317-340).

## 4. Required behaviour

**Established requirements**

- While the agent acts, the extension clearly shows it is acting. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S74.15)
- The user switches the extension into a mode where it controls the browser for a goal they give. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S74.16)
- A visible control stops the agent or lets the user take over. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S74.17)
- The Chrome extension covers browser context, capture, native bridge and page automation. (source: doc: docs/product/requirements.md:81)

**Acceptance criteria**

1. Start with an empty goal or a goal over 4096 characters is refused with 'AGI_START_COMPUTER_USE: goal is required' or 'goal must be 4096 characters or fewer'.
2. Start on a site that is not approved is refused and the site card offers 'Allow browser control on <host>'.
3. While a run is active the label reads 'AGI Cloud • agent running', the on-page dock with Stop and Take over is visible, and Start is disabled.
4. Pressing Stop ends the run, the panel returns to idle and the sentence 'You stopped the run.' is shown.
5. Pressing Take over pauses the agent, shows 'Your turn', and Continue resumes it; after 15 minutes without Continue the run ends with the take-over-expired sentence.
6. Closing the driven tab, navigating it away from the approved page, or changing the signed-in account ends the run with the matching sentence.
7. In YOLO mode a chat-started task on a site that is not approved is refused before any action.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The run-id format cu_run_ plus an identifier ties every panel and page message to one run, so a stale panel cannot control a newer run [inferred from COMPUTER_USE_RUN_ID_PATTERN and ownsRun checks].
- Browser control must stay on the person's device and use the person's signed-in session only on sites they approved [inferred from the consent text and allowlist checks].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the page indicator (host name) for Computer Use tab runs as well as chat runs.
- [proposed] Move the panel's English literals into locale keys.
- [proposed] Decide whether browser control should have a Local or own-key route, given the product requirement that all three modes are explicit.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Side panel Computer Use tab | `apps/extension/src/side_panel.ts` | Builds the Chat and Computer Use tabs, starts runs (startComputerUseRun 13949), approves sites (13984), listens for AGI_CU_STATE, AGI_CU_STEP, AGI_CU_USAGE, AGI_CU_APPROVE_REQUEST (13786-13850), and starts chat browser tasks (7258). |
| component | buildComputerUsePanel | `apps/extension/src/features/side-panel/computerUsePanel.ts` | The panel UI: banner, controls, Stop, Take over, Continue, task form, site card, usage meter, stop-reason copy, watchdog and run adoption. |
| service | Start, pause, cancel, state handlers | `apps/extension/src/background.ts` | Service worker cases AGI_START_COMPUTER_USE, PAUSE/RESUME_COMPUTER_USE, CANCEL_COMPUTER_USE, GET_COMPUTER_USE_STATE, AGI_CU_USER_INPUT, ADD_COMPUTER_USE_GUIDANCE; tab and account listeners. |
| service | ComputerUseRunCoordinator | `apps/extension/src/features/computer-use/runOwnership.ts` | Single active run lease, takeover state, 15 minute limit, cancellation reasons. |
| service | runAgentLoop | `apps/extension/src/features/computer-use/agentLoop.ts` | The step loop: asks the model, runs tools, hand-off tool, approvals, unattended rules, step cap (20). |
| service | Cloud agent client | `apps/extension/src/features/computer-use/cloudAgentClient.ts` | Chooses the model for the account (browser_dom routing slot, Auto routing) and streams chat completions from AGI Cloud. |
| service | CDP driver | `apps/extension/src/features/computer-use/cdpDriver.ts` | Performs clicks, typing and capture through the Chrome debugger. |
| service | Browser-control consent | `apps/extension/src/features/computer-use/browserControlConsent.ts` | Per-origin consent record and the consent text shown before approval. |
| service | Approval policy | `apps/extension/src/features/computer-use/approvalPolicy.ts` | Decides which actions need a person's approval in each permission mode. |
| component | Page run overlay | `apps/extension/src/features/content/browserRunOverlay.ts` | On-page dock with Stop and Take over, pointer and corner frame; only trusted clicks count. |
| service | Content script handlers | `apps/extension/src/content.ts` | Handles AGI_CU_WATCH_INPUT and AGI_CU_SHOW_ACTION and forwards user input to the worker (content.ts:388-412). |
| store | Run marker | `apps/extension/src/features/computer-use/runMarker.ts` | Writes a marker in session storage while a run is active so a lost run is cleaned up after a worker restart. |
| service | Run input watch | `apps/extension/src/features/computer-use/inputWatch.ts` | Detects the person's own input on the driven tab to pause the agent (file exists; name and background.ts:6680 use indicate this). |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Server route the agent loop streams model turns from (path built in cloudAgentClient.ts:317). |
| endpoint | GET /api/llm/v1/models and GET /api/usage | `apps/web/app/api/llm/v1/models/route.ts` | Account model access and usage read before a run (freeTrialClient.ts:115-116, getManagedModelAccess). |
| config | Manifest permissions | `apps/extension/manifest.json` | Declares debugger, tabs, scripting, sidePanel and optional host permissions; incognito not_allowed. |
| component | Permission mode select and site policy | `apps/extension/src/features/computer-use/askBeforeActing.ts` | Stored permission mode values (ask, auto, full, yolo). |
| test | computer-use-run-ownership.test.ts | `apps/extension/__tests__/computer-use-run-ownership.test.ts` | Run lease, deferred admission and cancellation policy. |
| test | computer-use-stop-ui.test.ts | `apps/extension/__tests__/computer-use-stop-ui.test.ts` | Visible Stop lifecycle and words for every way a run can end. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person types a goal and presses Start; the panel creates a run id and sends AGI_START_COMPUTER_USE with goal, tab id and the selected model choice. | device | apps/extension/src/side_panel.ts:13949-13975 |
| The worker checks goal length, tab, allowlist, consent, active tab, sign-in, permission mode and model access, then creates the run lease and cancels any earlier run. | device | apps/extension/src/background.ts:6232-6470 |
| Model access and usage are read from AGI Cloud with the person's token. | our servers | apps/extension/src/features/cloud-bridge/freeTrialClient.ts:115-116, 252-300 |
| The loop reads the page and takes screenshots, sends them with the goal to the AGI Cloud chat completions route, and streams back tool calls. | device and our servers | apps/extension/src/features/computer-use/cloudAgentClient.ts:317-345 |
| The gateway sends the turn to a model provider chosen by AGI routing. Which provider serves a given turn is not visible in the extension. | outside service | unknown: provider selection is server side; extension only sends a model id (cloudAgentClient.ts:326) |
| Each tool call is checked against the approval policy; approval cards go to the panel; approved actions run through the Chrome debugger on the tab; the page dock and pointer show the action point. | device | apps/extension/src/background.ts:6520-6700; apps/extension/src/content.ts:388-412 |
| Progress, usage and state events are broadcast to the panel; the run ends and the worker clears the marker, releases the debugger and sends a completed, stopped or error state. | device | apps/extension/src/background.ts:6760-6860 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Run state (lease, takeover, run id) | service worker memory only | no | lost when the worker stops; recovery ends the run (F074-11) |
| Run marker (run id, tab ids) | store:chrome-storage-session, key agi_cu_run_in_progress | no | removed when the run ends or on recovery (runMarker.ts:62-110) |
| Permission mode and browser-control consent | store:chrome-storage-local | not by this feature; whether Chrome sync mirrors them: unknown | kept until changed or site removed |
| Goal, page text, screenshots, model turns | sent to AGI Cloud; whether and how long the server keeps them: unknown | to AGI Cloud | unknown |
| Chat-started task result | conversation history of the chat | through the chat sync feature | per chat retention |

**Models and providers.** The extension asks AGI Cloud for the models the account may use and picks one that supports tools, vision and streaming. With Auto it routes by the browser task profile and drops to another provider if one rejects the call (cloudAgentClient.ts:50-135). No model id is written here; ids come from the generated catalog.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sign-in to AGI Cloud is required: 'AGI_START_COMPUTER_USE: sign in to AGI Cloud before starting computer use' (apps/extension/src/background.ts:6362-6368). |
| Permissions | Chrome permissions debugger, tabs, scripting, sidePanel in the manifest; per-site optional host permission requested at approval; the site must be on the approved list and have browser-control consent; user blocked sites and site policy are checked (background.ts:6310-6340; side_panel.ts:13984-14030; apps/extension/manifest.json). |
| Subscription | The only plan-linked checks found are the models the account may use and gateway refusals: 401 asks to sign in again, 403 'AGI Cloud browser actions are not available for this account.' and 429 'AGI Cloud cannot accept this request right now. Check your usage or try again later.' (cloudAgentClient.ts:345-390). Which plans may use browser control: unknown. The extension does not read the canUseBrowserAutomation capability (grep found none in apps/extension/src). |
| Limits and metering | Goal 4096 characters; 20 steps (DEFAULT_CALLER_TOOL_MAX_STEPS, packages/contracts/cloud-contracts/src/tool-call-limits.ts:5); take over 15 minutes; approval wait 5 minutes; panel silence check 90 seconds; max_tokens 2048 per turn (cloudAgentClient.ts:326). Usage is metered on the server through the gateway; the panel shows steps and tokens. |
| Feature flags | The request carries a header x-agi-managed-compute-beta and the code maps server refusals named public_launch_blocked, managed_compute_private_beta and not_private_beta to a message (cloudAgentClient.ts:333-352). Server-side flag values: unknown. |
| Model compatibility | A model must support tools, vision and streaming or the run is refused with '<name> does not support browser tools, screenshots, and streaming.' (cloudAgentClient.ts:97-100). |
| Provider restrictions | Only models allowed for Managed Cloud traffic and live, not deprecated (cloudAgentClient.ts:84-92). Provider names are not read by the extension. |
| Local mode | mode:local is not available for this feature: no local model path was found in the extension. The agent still acts on the local browser through the local Chrome debugger; only the thinking happens on AGI Cloud. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading or starting | Panel sets running at once; if the worker refuses, the state returns to idle and the error text shows in the banner; default text 'Computer use could not start. Please try again.' | side_panel.ts:13949-13983 |
| Empty or unsupported page | Start disabled; hint 'AGI cannot act on this page. Open an ordinary website.' or 'Allow <host> above to start'. | computerUsePanel.ts:1640-1660 |
| Error from AGI Cloud | Run ends with AGI_CU_ESCALATE and AGI_CU_STATE error; banner 'Browser task could not run' with the server-safe message. | background.ts:6820-6860 |
| Cancel | Stop disables the button, shows 'Stopping…', waits up to 15 seconds for the worker; no answer shows the refusal sentence. | computerUsePanel.ts:1385-1450 |
| Timeout or silence | Approval requests expire after 5 minutes and count as refused; panel asks the worker after 90 seconds of silence. | agentLoop.ts:1320; computerUsePanel.ts:1020-1040 |
| Offline | Not handled in a dedicated way; a failed gateway call ends the run as an error with a generic message 'AGI Cloud is temporarily unavailable. Try again later.' | cloudAgentClient.ts:362-372 |
| Recovery after worker stop | See F074-11: marker found on next worker start, tab released, panel told. | background.ts:9219-9236 |
| Accessibility | Page dock is a group labelled 'Browser task controls'; buttons are at least 44 px on coarse pointers; reduced-motion and forced-colors rules exist; the site hint has role status; paused state moves focus to Continue. | browserRunOverlay.ts:30-60; computerUsePanel.ts:1300-1310 |
| Account switch | The run ends with 'The signed-in AGI Cloud account changed, so the run was stopped.' Detection happens when the worker reads the auth context. | background.ts:1100-1112, 5038 |
| Second start while one is active | The older run is cancelled as superseded; in the panel the Start button is disabled so this is reached from chat or other callers. | background.ts:6283-6286 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/computer-use-run-ownership.test.ts`: Describe titles: 'computer-use run ownership coordinator', 'computer-use deferred admission ownership', 'computer-use cancellation policy'.
- `apps/extension/__tests__/computer-use-stop-ui.test.ts`: 'computer-use visible Stop lifecycle', 'every way a run can end has words for the user', 'computer-use Assistant steps disclosure', 'computer-use Add details input'.
- `apps/extension/__tests__/side-panel-stop.test.ts`: 'side panel Stop confirmation'.
- `apps/extension/__tests__/unattended-browser-mode.test.ts`: 'unattended browser tasks' (YOLO rules).
- `apps/extension/__tests__/composer-browser-task.test.ts`: 'browser tasks from the real composer functions'.
- `apps/extension/__tests__/browser-control-contract.test.ts`: 'one agent, one set of tools', 'addressing an element', 'putting a file into a page', 'every way a run can end has something that ends it'.
- `apps/extension/__tests__/computer-use-run-marker.test.ts`: 'a browser task that dies with the worker'.
- `apps/extension/__tests__/service-worker-lifecycle.test.ts`: 'a computer-use run that dies with the worker ends visibly' and worker wake rules.
- `apps/extension/__tests__/side-panel-restricted-page.test.ts`: 'restricted page card' and 'agent page indicator'.
- `apps/extension/__tests__/computer-use-browser-control-consent.test.ts`: Consent storage; contents not opened, name only.
- `apps/extension/__tests__/computer-use-agent-loop.test.ts`: Agent loop; contents not opened, name only.
- `apps/extension/__tests__/computer-use-approval-policy.test.ts`: Approval policy; contents not opened, name only.

**Test scenarios**

- **Start and stop on an approved site**
  1. Sign in to AGI Cloud in the extension.
  2. Open an ordinary site, open Computer Use, approve browser control for the host.
  3. Type a simple goal and press Start.
  4. Press Stop in the panel while it runs.
  - Expected: Debug banner and dock appear, label shows 'AGI Cloud • agent running', then Stop ends the run with 'You stopped the run.' and the dock disappears.
- **Take over and hand back**
  1. Start a task on an approved site.
  2. Press Take over on the page dock.
  3. Click on the page yourself.
  4. Press Continue in the panel.
  - Expected: Banner 'Your turn'; the agent does nothing while paused; after Continue it re-reads the page and carries on.
- **Take over limit**
  1. Start a task and press Take over.
  2. Leave the page for 15 minutes.
  - Expected: Run ends with the take-over-expired sentence and the tab is released.
- **Tab leaves the approved page**
  1. Start a task.
  2. In the driven tab type a different address by hand while the agent is between actions.
  - Expected: Run ends with 'The tab left the page this run was approved for...'.
- **YOLO on an unapproved site**
  1. Set permission mode to YOLO.
  2. On a site that is not approved, send a chat message that needs the browser.
  - Expected: Task is refused with 'Approve <host> in Permissions before starting an unattended task on this site.' and nothing runs.
- **Account change mid-run**
  1. Start a task.
  2. Sign out or switch the AGI Cloud account.
  - Expected: Run ends with the account-changed sentence.

**Where to look when it fails**

- Service worker console (chrome://extensions, inspect): lines 'Computer-use agent loop error' and 'Browser task cleanup failed' (background.ts).
- Error prefix 'AGI_START_COMPUTER_USE:' identifies which admission check failed.
- Session storage key agi_cu_run_in_progress shows a leftover run marker.
- Server side: gateway logs for the chat completions route; names not read.

**Hands-on test plans**

- Chrome: [70-qa/test-plans/chrome/074-browser-extension.md](../../70-qa/test-plans/chrome/074-browser-extension.md)

## 10. Gaps and dependencies

- **No Local or own-key route for browser control; only AGI Cloud models.** Affects: People who want browser tasks without a Cloud account, and the three-mode product requirement, on surface:chrome.. Evidence: cloudAgentClient.ts:317-340 is the only model call; legacy provider credentials are cleaned up (test legacy-provider-credential-cleanup.test.ts name only).. Work needed: Product decision on whether extension browser control should offer Local (through the paired desktop) or own-key; then routing work.
- **Plan or entitlement for browser control is not checked in the extension; only model access and gateway refusal decide.** Affects: surface:chrome users on plans that should not have browser control; subscription consistency.. Evidence: No use of canUseBrowserAutomation in apps/extension/src; background.ts:6389-6399 checks models only.. Work needed: Confirm the server rule, then read the capability document in the panel and show a clear upgrade or denial message.
- **Page indicator that names the driven page appears only for chat-started tasks.** Affects: People starting from the Computer Use tab.. Evidence: side_panel.ts:10857-10885 uses composerBrowserRun.. Work needed: Feed the Computer Use run's tab into updateAgentPageIndicator.
- **Hard-coded English labels in the Computer Use panel.** Affects: Non-English users of surface:chrome.. Evidence: computerUsePanel.ts:1190-1240, 1585-1650.. Work needed: Move strings to locale keys.
- **No recorded end-to-end run of the whole feature.** Affects: Release confidence.. Evidence: No result file found; only unit tests and apps/extension/e2e/smoke.mjs (not opened).. Work needed: Run the scenarios above on a real build and record them.

**Depends on**

- surface:chrome
- mode:cloud
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-security-and-privacy
- file:apps/extension/src/background.ts
- file:apps/extension/src/features/computer-use/agentLoop.ts
- api:POST /api/llm/v1/chat/completions
- api:GET /api/llm/v1/models
- api:GET /api/usage
- store:chrome-storage-session
- store:chrome-storage-local

## Unknown

- Which plans may use browser control (server rule not read).
- Whether goals, page text and screenshots are stored by the server and for how long.
- Which model providers serve browser turns.
- Whether Chrome sync mirrors the permission mode or consent.
- Whether apps/extension/e2e/smoke.mjs covers a browser run.
- Contents of tests marked name only.
