---
id: "F065-99"
type: "feature"
title: "Other items in Computer-use experience"
aliases: ["Other items in Computer-use experience", "Computer use controls", "Screen control", "AGI is using your computer", "Stop, take over, hand back", "Application allowlist and blocklist", "Remote computer", "Your computer page"]
area: "65 Computer-use experience"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S65.03", "S65.04", "S65.05", "S65.06", "S65.07", "S65.08", "S65.09", "S65.10", "S65.11", "S65.12", "S65.13", "S65.14", "S65.15", "S65.16", "S65.17", "S65.18", "S65.19", "S65.20", "S65.21", "S65.22", "S65.23", "S65.24", "S65.25", "S65.26", "S65.27", "S65.28", "S65.29"]
depends_on: ["F065-01", "surface:desktop", "surface:chrome", "surface:web", "surface:mobile", "mode:cloud", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-observability-and-operations", "table:managed_usage_requests", "api:POST /api/llm/v1/chat/completions", "api:POST /api/devices/heartbeat", "file:apps/desktop/electron/runtime/computerUseSteps.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F065-99 Other items in Computer-use experience

Everything else in computer use after setup. On Desktop the agent screenshots, clicks, types, scrolls, drags and opens apps, one app at a time with prompts, Refused apps, clipboard and sensitive-step review, loop guard, Escape stop, pause when the user moves the mouse, and hand back. The Chrome extension drives tabs. Web can send tasks to your computer.

Area: [65. Computer-use experience](README.md). Requirement items: [S65.03](../../10-requirements/capabilities/065-computer-use-experience.md#s6503), [S65.04](../../10-requirements/capabilities/065-computer-use-experience.md#s6504), [S65.05](../../10-requirements/capabilities/065-computer-use-experience.md#s6505), [S65.06](../../10-requirements/capabilities/065-computer-use-experience.md#s6506), [S65.07](../../10-requirements/capabilities/065-computer-use-experience.md#s6507), [S65.08](../../10-requirements/capabilities/065-computer-use-experience.md#s6508), [S65.09](../../10-requirements/capabilities/065-computer-use-experience.md#s6509), [S65.10](../../10-requirements/capabilities/065-computer-use-experience.md#s6510), [S65.11](../../10-requirements/capabilities/065-computer-use-experience.md#s6511), [S65.12](../../10-requirements/capabilities/065-computer-use-experience.md#s6512), [S65.13](../../10-requirements/capabilities/065-computer-use-experience.md#s6513), [S65.14](../../10-requirements/capabilities/065-computer-use-experience.md#s6514), [S65.15](../../10-requirements/capabilities/065-computer-use-experience.md#s6515), [S65.16](../../10-requirements/capabilities/065-computer-use-experience.md#s6516), [S65.17](../../10-requirements/capabilities/065-computer-use-experience.md#s6517), [S65.18](../../10-requirements/capabilities/065-computer-use-experience.md#s6518), [S65.19](../../10-requirements/capabilities/065-computer-use-experience.md#s6519), [S65.20](../../10-requirements/capabilities/065-computer-use-experience.md#s6520), [S65.21](../../10-requirements/capabilities/065-computer-use-experience.md#s6521), [S65.22](../../10-requirements/capabilities/065-computer-use-experience.md#s6522), [S65.23](../../10-requirements/capabilities/065-computer-use-experience.md#s6523), [S65.24](../../10-requirements/capabilities/065-computer-use-experience.md#s6524), [S65.25](../../10-requirements/capabilities/065-computer-use-experience.md#s6525), [S65.26](../../10-requirements/capabilities/065-computer-use-experience.md#s6526), [S65.27](../../10-requirements/capabilities/065-computer-use-experience.md#s6527), [S65.28](../../10-requirements/capabilities/065-computer-use-experience.md#s6528), [S65.29](../../10-requirements/capabilities/065-computer-use-experience.md#s6529).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| Chrome | built (this page lists unfinished parts) | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Covers the running experience of computer use: what the agent does on screen, how the person sees and controls it, and where it stops. Desktop (macOS) captures a chosen display, clicks, types, scrolls, drags, presses keys and opens installed apps through a small signed helper, with approval per app, per task and per sensitive step. The Chrome extension drives browser tabs with its own loop, overlay and approvals. The web 'Your computer' page and mobile send tasks to a paired computer. (apps/desktop/electron/runtime/computerUseService.ts header; apps/desktop/electron/runtime/dispatcher.ts:2555-2613; apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:1-60)

**Why it exists.** An agent that controls a computer must stay visible, interruptible and bounded. The requirements ask for app permission prompts, allow and block lists, high-impact confirmations, clear visible state, an audit trail and a manual takeover path. (doc: docs/product/requirements.md section 21.4)

**Who uses it.** People letting the agent do tasks in apps or browser tabs; people sending tasks to their own computer from the web or phone; testers and engineers of the Desktop runtime and the Chrome extension.

**Problems it solves**

- The agent cannot touch an app the person did not allow or refused.
- The person can stop, pause or take over at any moment.
- Sensitive steps (payments, passwords, sending) are reviewed before they run.
- A stuck agent that repeats itself is stopped.
- An offline computer is reported rather than silently ignored.

**Use cases**

- The agent opens a native app, clicks through a form and types, asking once per app.
- The person moves the mouse mid-run, the agent pauses, and the person later presses Hand back.
- The agent reaches a payment page and a 'Check this step' dialog asks Deny or Allow once.
- From the web 'Your computer' page the person sends a task to a paired desktop.

## 2. User experience

**Where to find it**

- Desktop: Settings, Computer use for 'Allowed apps', 'Refused apps' (with an add-app picker) and Take over / Stop / Hand back; floating bar 'AGI is using your computer'; File menu items; native notifications (ComputerUseSettings.tsx:104-110,248-310; ComputerUseControlBar.tsx; appMenu.ts:196-212).
- Desktop Settings, Permissions: 'Your answers' list with removable answers (DesktopPermissionsSection.tsx:29-31).
- Chrome extension side panel Computer Use tab: Stop, Take over, Continue buttons, approval cards, step log, screenshot steps, usage meter (apps/extension/src/features/side-panel/computerUsePanel.ts:1218-1240, 1111-1130).
- Web: /code/computer page titled 'Your computer' (apps/web/app/code/computer/page.tsx; RemoteComputerPage.tsx:46-47).
- Mobile: 'Desktop unreachable' and 'Approval may be outdated' banners in the companion screen (apps/mobile/src/features/companion/components/StatusBanners.tsx).
- CLI, VS Code: no screen control; local-folder permission is separate (brief S65.12; line references in the brief for CLI and VS Code did not verify).

**Before you start**

- Computer use turned on and macOS permissions granted (F065-01).
- Signed-in AGI account with a cloud chat turn that has the device declared.
- For remote use: a Desktop paired from Settings, Capabilities, Remote Control (RemoteComputerPage.tsx:55-56) and online.
- For Chrome: signed-in AGI Cloud session in the extension and a site allowed for the task (agentLoop.ts:120-129).

**Screens and controls**

- Native dialog 'Let the agent use your screen?' with Cancel and 'Allow for this task' (dispatcher.ts:1950-1966).
- Native dialog per app asking to control that app, with a Never allow option and extra warnings for terminals, code editors, Finder and System Settings (applicationControl.ts:50-68,104-118).
- Native dialog 'Check this step' with Deny and 'Allow once' for steps the model marked as paying, sending, deleting, security changes or password entry, and for typing into a password field (computerUseSteps.ts:75-109).
- Clipboard dialog before copy, cut or paste key chords (computerUseSteps.ts:29-73).
- Control bar with 'Take over' / 'Hand back' and 'Stop' (ComputerUseControlBar.tsx:44-58); native dialog 'Hand the screen back?' with Keep control and Hand back (computerUseSteps.ts:138-152).
- Escape key stops, registered globally during a run; File menu 'Stop Computer Use' (computerUseSession.ts:123-132; appMenu.ts:196-202).
- Refused apps list with an app picker; Allowed apps list with remove (ComputerUseSettings.tsx:248-310).
- Chrome: Stop, Take over, Continue, approval cards with allow, allow for task, deny, and a mode selector (computerUsePanel.ts:1218-1240).

**Journey**

1. 1. The person asks the agent for a task needing the screen.
2. 2. First screen step: the app asks 'Let the agent use your screen?' (once per task).
3. 3. The agent takes a screenshot of a display; the model sees the picture and which app and window is in front.
4. 4. Before a click or key, the app under the target is asked about: allow once, always or Never allow.
5. 5. Sensitive steps raise 'Check this step'; clipboard keys raise a clipboard question.
6. 6. The step runs. A macOS notification 'AGI is using your computer' appears with the stop key; the bar shows Take over and Stop.
7. 7. If the person moves the mouse or types, the run pauses ('Paused. You have the screen.'). They press Hand back, confirm, and the agent takes a fresh screenshot and carries on.
8. 8. The run ends by Stop, by 2 minutes without steps, or when the window closes; a notification says 'AGI finished using your computer'.

**What the person sees and gets**

- Per-step result text to the model and chat tool entries: 'Clicked at x, y. In front: <app>, window "<title>". Take a screenshot to see what changed.' (apps/web/features/desktop-host/lib/device-steps.ts:269-300; frontNote at line 84).
- Screenshot reply naming the display, size and other displays, with the picture (device-steps.ts:137-162).
- Tool status running, completed or failed with image in the chat (useChatStream.ts:1888-1920).
- Refusal messages: own window, app not allowed, loop detected, macOS password prompts the agent cannot answer (applicationControl.ts:38-40; computer-use.ts:51-62; computerUseLoop.ts).

**Settings**

- Allowed apps and Refused apps (application.control per bundle id).
- Clipboard permission clipboard.read (global).
- Chrome permission mode Ask first / Auto / Full access / YOLO and per-site approvals.
- Workspace administrator feature access for computer use (request-processor.ts:3363-3375).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Desktop screenshot, zoom, move, click, drag, scroll, type, key, wait and open-app steps wired through the dispatcher (dispatcher.ts:2555-2594).
- Display choice: model may name a display; the app remembers the last one; unknown display returns an error listing how to see connected ones (computerUseService.ts targetDisplay; computerUseProtocol.ts chooseCaptureDisplay).
- Front app and window title are read through the helper and attached to results (agi-input.swift frontWindow; computerUseService.ts readFrontWindow; device-steps.ts:84-90).
- Per-app prompts, refused apps and re-check just before input so a swapped app is not hit (applicationControl.ts:125-187; computerUseSteps.ts:119-136).
- Own-window protection (applicationControl.ts:135-142) and refusal to open or list AGI itself (applicationLaunch.ts:102-140).
- Clipboard permission for copy, cut, paste chords (computerUseSteps.ts:53-73).
- Sensitive review for steps declared with a review sentence and for typing into secure input fields (computerUseSteps.ts:75-109; device-tools.ts REVIEW).
- Input arbitration: polls cursor and idle time every 250 ms and pauses when the user acts (computerUseSession.ts:146-168).
- Emergency stop by Escape, bar, menu, and Stop Agents; stop withdraws the grant and kills the helper (computerUseSession.ts:335-342; dispatcher.ts:1138-1141).
- Pause, take over and hand back with a native confirmation; a held step waits up to 10 minutes (computerUseSession.ts:38,184-194,344-371; computerUseSteps.ts:138-152).
- Loop guard: repeat limit 5 and cycle limit 4 unless the screen changed (computerUseLoop.ts:11-12; dispatcher.ts:585-599).
- Quiet limit: a run ends after 2 minutes without steps (computerUseSession.ts:37,170-178); the per-task allow lapses after 5 minutes without a step (computerUseRuns.ts:12).
- Permission revoked: revoking computer.use stops the run; a revoked app grant is rechecked before input (dispatcher.ts:1253; applicationControl.ts:184-186).
- Device offline: the cloud workflow waits up to 60 minutes for a sleeping device, tells the person 'Waiting for <device> to come online', then continues without it (cloud-agent-workflow.ts:12-60; device-clearance-step.ts:110-135).
- Remote computer page: pairing link, task send, cancel, resend, disconnect, offline message (RemoteComputerPage.tsx:46-100).
- Chrome extension: background-tab capture with focus emulation, cursor overlay via AGI_CU_SHOW_ACTION, input watch overlay, Stop, Take over, Continue, approval policy with sensitive site classes and always-ask reasons, purchase refusal (cdpDriver.ts:1413-1434; content.ts:388-416; agentLoop.ts:1468-1580; approvalPolicy.ts:1-40).

**Incomplete**

- Window selection: brief lists web and desktop missing, and no window-targeting argument was found in the dispatcher steps read (brief S65.05).
- Native file-dialog interaction: brief web missing; no dedicated code found (brief S65.17).
- Desktop background operation and authentication handoff are missing per the brief (S65.18, S65.24). The Chrome background-tab behaviour is unverified: the brief's own note asks for a live check that capture and input keep working in a background tab (brief S65.18).
- Mobile remote dispatch is partial: needs a live check after the signaling server redeploy (brief S65.29).
- Brief marks Chrome pause, takeover and return control as missing, but the extension code has Take over and Continue buttons and a hand-off tool, so the brief appears out of date. [inferred] (computerUsePanel.ts:1224-1240; agentLoop.ts:1468,1573)
- Chrome drag: brief says missing, yet agentLoop.ts has a 'drag' tool case (agentLoop.ts:710-725). [inferred] brief is out of date or the tool is not exposed; not established.

**Present but disconnected or switched off**

- The Tauri build keeps its own computer-use store and settings; not the public Desktop (apps/desktop/src/features/settings/ComputerUseSettings.tsx).
- Quit and Stop Agents interplay not read.

**Not available**

- Web outside Desktop: no controls, no preview, no allow lists (brief web missing).
- CLI: no click, type, scroll or drag (brief cli missing).
- VS Code and Mobile: no local screen control; mobile only banners and dispatching to a desktop.
- Windows and Linux Desktop: unsupported (computerUseService.ts:226-232).
- Pointer overlay on Desktop: not found; only Chrome has a cursor overlay (content.ts:388-393).

## 4. Required behaviour

**Established requirements**

- The user lists which applications the agent may control. (source: S65.03)
- The user lists applications the agent must never control. (source: S65.04)
- The agent can be pointed at one window rather than the whole screen. (source: S65.05)
- On a multi-monitor setup computer use can target a chosen display. (source: S65.06)
- The user sees what the agent sees on screen as it works. (source: S65.07)
- The agent's pointer position or action target is shown visually as it acts. (source: S65.08)
- The product shows which application and which window the agent is currently working in. (source: S65.09, S65.10)
- Clipboard access by the agent needs its own permission. (source: S65.11)
- The user grants the agent specific local folders and can revoke them. (source: S65.12)
- The agent can open an application; click and type; scroll; drag and drop. (source: S65.13, S65.14, S65.15, S65.16)
- The agent can work native open/save file dialogs. (source: S65.17)
- The agent can operate an application in the background without taking over the user's screen. (source: S65.18)
- When the user moves the mouse or types, the agent yields rather than fighting for control. (source: S65.19)
- One immediate control stops all computer control. (source: S65.20)
- The user pauses the agent and takes control, then hands control back and the agent continues. (source: S65.21, S65.22)
- Sensitive actions (payments, passwords, sending) require the user's review before the agent does them. (source: S65.23)
- When sign-in is required the agent hands off to the user and continues afterwards. (source: S65.24)
- Each action leaves a record of what was done and whether it worked. (source: S65.25)
- When an application cannot be controlled the product says why. (source: S65.26)
- When the target computer is offline the product says so and waits or stops clearly. (source: S65.27)
- When a permission is revoked the agent stops and the user is told how to restore it. (source: S65.28)
- From another device the user directs work on their own permitted computer. (source: S65.29)
- Required controls: site/app permission prompts, allowlists and blocklists, high-impact confirmations, no sensitive action without approval, visible state, logs and audit trail, manual takeover. (source: doc: docs/product/requirements.md section 21.4)
- Never use provider-native tools in Local mode; ask consent before sending computer-use screenshots to the provider. (source: doc: docs/product/requirements.md:125-133)

**Acceptance criteria**

1. A click aimed at an app that has no answer raises a per-app prompt naming that app; Never allow adds it to Refused apps and later steps on it are refused without a prompt.
2. A click or type step landing on AGI Desktop's own window is refused with the own-window message.
3. Pressing Escape during a run stops it, the helper is killed, the computer.use grant is withdrawn and the next screen step is refused.
4. Moving the mouse during an active run pauses it within about a second and a notification 'AGI paused' appears; Hand back with Keep control leaves it paused and Hand back resumes it with a fresh screenshot.
5. A step with a review sentence shows 'Check this step' and does nothing when Deny is chosen.
6. Pasting with the keyboard asks for clipboard permission once; refusing returns the clipboard-refused message.
7. Sending the same click five times with no screen change stops with a loop message.
8. With the paired computer offline, a cloud run reports 'Waiting for <device> to come online' and continues without the device after the wait budget.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Brief status for Chrome pause, takeover and drag may be stale; a re-audit of the extension is needed. [inferred]
- A separate action audit view on Desktop was not found; receipts are the chat tool entries. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add window-level targeting using the window id the helper already returns (agi-input.swift frontWindow).
- [proposed] Add a visible pointer or highlight overlay on Desktop for S65.08.
- [proposed] Add a background-app mode so the user's screen is not taken over (S65.18).
- [proposed] Show a live preview of what the agent sees on Desktop outside the chat tool entry.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | computerUseService | `apps/desktop/electron/runtime/computerUseService.ts` | Helper process, screen capture, display choice, pointer, keyboard, front window, availability reasons |
| other | agi-input helper | `apps/desktop/electron/native/macos/agi-input.swift` | Signed macOS helper that posts CGEvents and reads front window, window id and secure-input owner |
| service | computerUseProtocol | `apps/desktop/electron/runtime/computerUseProtocol.ts` | Helper line framing, display choice, physical capture size |
| service | computerUseSession | `apps/desktop/electron/runtime/computerUseSession.ts` | Run phases, input arbitration, stop shortcut, pause, hand back, notifications |
| service | computerUseSteps | `apps/desktop/electron/runtime/computerUseSteps.ts` | Step pipeline: app gate, step review, clipboard gate, recheck, run, hand-back confirmation |
| service | applicationControl | `apps/desktop/electron/runtime/applicationControl.ts` | Per-app prompts, own-window refusal, reach warnings, recheck before input |
| service | applicationLaunch | `apps/desktop/electron/runtime/applicationLaunch.ts` | Find, list and open installed apps; refuse AGI itself |
| service | computerUseLoop | `apps/desktop/electron/runtime/computerUseLoop.ts` | Repeat and cycle detector and screen-change sampling |
| service | computerUseRuns | `apps/desktop/electron/runtime/computerUseRuns.ts` | One allowed run at a time with a 5 minute idle limit |
| service | dispatcher | `apps/desktop/electron/runtime/dispatcher.ts` | Command table, guardScreenStep, per-task confirm, refuseApplication, revoke handling, device declaration |
| service | permissionManager | `apps/desktop/electron/runtime/permissionManager.ts` | Stores application.control, clipboard.read and computer.use answers; withdrawGrant; review list |
| component | appMenu | `apps/desktop/electron/appMenu.ts` | File menu Stop Computer Use, Take Over, Hand Back |
| component | ComputerUseControlBar | `apps/web/features/desktop-host/components/ComputerUseControlBar.tsx` | On-screen bar for active and paused runs |
| component | RefuseAppPicker | `apps/web/features/desktop-host/components/RefuseAppPicker.tsx` | Adds an installed app to Refused apps (used by ComputerUseSettings) |
| service | device-steps (web side executor) | `apps/web/features/desktop-host/lib/device-steps.ts` | Turns model steps into desktop commands and results; front-window notes; screenshot reply |
| schema | device step contract | `packages/contracts/local-runtime/src/device-steps.ts` | Declaration parsing, step tools, review length, capability names |
| schema | front-window refusals | `packages/contracts/local-runtime/src/computer-use.ts` | macOS password and login prompts the agent cannot answer |
| service | device tool definitions | `apps/web/lib/device-steps/device-tools.ts` | Tools offered to the model, including the review field description |
| service | useChatStream device driving | `apps/web/lib/hooks/useChatStream.ts` | Executes pending device steps, updates tool entries with images, resumes the turn (lines 1886-1960) |
| job | cloudAgentWorkflow device clearance | `apps/web/lib/workflows/cloud-agent-workflow.ts` | Waits up to 60 minutes for an offline device, then continues without it |
| service | device registry clearance | `apps/web/lib/device-steps/device-registry.ts` | Decides ready, wait or withdrawn from presence, credential, capability (line 396) |
| component | RemoteComputerPage | `apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx` | Web page 'Your computer' for pairing and sending tasks |
| component | extension agent loop | `apps/extension/src/features/computer-use/agentLoop.ts` | Chrome browser run loop, approvals, takeover tool, action points |
| component | extension side panel | `apps/extension/src/features/side-panel/computerUsePanel.ts` | Computer Use tab: Stop, Take over, Continue, approval cards, step log |
| service | extension approval policy | `apps/extension/src/features/computer-use/approvalPolicy.ts` | Always-ask reasons, sensitive site classes, authorization and permission pages |
| component | companion status banners | `apps/mobile/src/features/companion/components/StatusBanners.tsx` | Mobile 'Desktop unreachable' and 'Approval may be outdated' banners |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The cloud model emits a device step request in the chat stream; the page reads it. | our servers | apps/web/lib/hooks/useChatStream.ts:3549-3552 |
| The desktop page runs executeDeviceStep, which sends a runtime command with the task run id to the Electron main process. A step for a different device is answered with 'waiting on <device>'. | device | useChatStream.ts:1886-1899; device-steps.ts:427-453 |
| Main process gate: refuse if off or stopped; ask for computer.use if undecided; confirm the task run; execute. | device | dispatcher.ts:3416-3452 |
| guardScreenStep starts or resumes a run, handles pause waiting, and applies the loop detector. | device | dispatcher.ts:585-599; computerUseSession.ts:281-289 |
| For input steps: gate apps, review sensitive step, gate clipboard keys, recheck apps, then run the helper command with the input watch suspended. | device | computerUseSteps.ts:119-136 |
| The macOS helper posts mouse or key events; screenshots are captured by Electron desktopCapturer and scaled to at most 1280 pixels wide, PNG or JPEG. | device | computerUseService.ts:68-71,149-164; agi-input.swift |
| Results and any screenshot are posted back to our resume endpoint, and the model decides the next step. | device and our servers | useChatStream.ts:1930-1960; DEVICE_STEP_RESUME_PATH |
| Before a device-bound run continues, the server re-checks the device registry and waits or withdraws device tools. | our servers | cloud-agent-workflow.ts:19-60; device-clearance-step.ts:40-90 |
| Chrome: the extension agent loop calls AGI Cloud chat completions, runs browser tools through the Chrome DevTools Protocol in the tab, and shows approval cards. | device and our servers | apps/extension/src/features/computer-use/cloudAgentClient.ts:317-328; cdpDriver.ts:1413-1434 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Screenshots and zooms | Held in memory and sent to the model route as images; chat tool entries keep a result image | Sent to our servers as step results | Retention not established from the code read |
| Application answers (allowed, refused) per bundle id | Desktop permission store; refused apps persist as always | No sync found | Removable in Settings; refusals cleared only through a confirmation in main (dispatcher.ts:1295-1310) |
| Telemetry events desktop_control started, ok, refused | Desktop log file in the app logs folder | unknown | unknown |
| Server audit event computer_use_action and metered request | Server tool audit and table managed_usage_requests | Server side | Retention not established |
| Device presence and capabilities | Server device registry (heartbeat route) | Yes | unknown |

**Models and providers.** A cloud model chooses each step on our servers; the Desktop returns screenshots to it, so images go to the provider that serves the turn. Default routing for kind 'computer-use' prefers premium computer-use slots, then computer-use, then workhorse slots (packages/contracts/types/src/model-catalog.ts:2879-2889). The extension also sends its run through the same chat completions route. No local-model path was found.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account for cloud chat turns, device registry and remote dispatch (useChatStream.ts:1930-1938; agentLoop.ts:120-129). |
| Permissions | macOS Accessibility and Screen Recording; computer.use; per-task allow; application.control per app; clipboard.read; folder permissions are separate (dispatcher.ts:1099-1108; applicationControl.ts:104-118; computerUseSteps.ts:64-73). |
| Subscription | Computer-use model slots are listed for Pro, Max and Enterprise and not for Free (model-catalog.ts:1235-1372). The upgrade card for 'computer use' exists (paywall-vocabulary.ts:30-33; InlinePaywallCard.tsx:135). |
| Limits and metering | Unit computer_use_requests counted monthly from managed_usage_requests where quotaFeature is computer_use; soft and hard caps per plan (tier-unit-quota-service.ts:61-65,122-130,175-180; request-processor.ts:6132-6146). Message code computer_use_monthly_limit_reached. The Usage settings page lists the unit (account-usage-client.ts:5-17). |
| Feature flags | Workspace feature access computer_use can switch it off for an organization (request-processor.ts:3363-3375). Chrome extension mode ask, auto, full, yolo. |
| Model compatibility | Not established; the tool list is the same for any model that serves the turn. Metering follows the model slot [inferred]. |
| Provider restrictions | none found in the code |
| Local mode | Not found. Steps are produced by the cloud tool loop; the Desktop device profile reports localModels false and no local-model driver of computer use was found. The requirement is that Local mode never uses provider-native tools (doc: docs/product/requirements.md:133). How Local mode treats computer use is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Paused by user input | Run pauses, notification 'AGI paused', held steps wait for hand back up to 10 minutes then return an expired message and the run is owed a resume. | computerUseSession.ts:38,247-259,269-279 |
| Resumed after hand back | A non-observing step that was waiting does not run; the model is told to take a fresh screenshot. | computerUseSession.ts:48-49,278 |
| Stopped | Next steps get a stop message until the run ends and the stopped flag clears; grant withdrawn; refusal kept. | computerUseSession.ts:46-47,261-267,335-342 |
| Timeout of helper | Helper not answering for 15 seconds returns 'The input helper did not answer.' | computerUseService.ts:71 and sendToHelper |
| Helper crash | Pending calls fail with 'The input helper stopped unexpectedly.' | computerUseService.ts startHelper exit handler |
| Quiet run | Ends after 2 minutes without a step and notifies 'AGI finished using your computer'. | computerUseSession.ts:37,170-178,240-243 |
| Task allow expires | After 5 idle minutes the per-task allow lapses and the next task asks again. | computerUseRuns.ts:12 |
| Secure input or macOS password prompt in front | Agent told it cannot answer; user must do it. | computer-use.ts:51-62; computerUseSteps.ts:79-82 |
| Device offline | Cloud run waits up to 60 minutes with a visible waiting entry, then continues without the device; credential revoked or remote work off withdraws immediately. | cloud-agent-workflow.ts:12-60; device-registry.ts:396-440 |
| Remote page offline | 'Your computer went offline. This page reconnects when it is back.' | RemoteComputerPage.tsx:62 |
| Permission revoked mid-run | Revoking computer.use calls stop; a revoked app is rechecked before input; the Settings row for an app answer can be removed. | dispatcher.ts:1253; applicationControl.ts:184-186 |
| Mobile | Banner 'Desktop unreachable' with Reconnect; 'Approval may be outdated' when last contact is old. | StatusBanners.tsx:30-75 |
| Accessibility | Control bar is a polite live region; dialogs are native macOS dialogs. Full screen-reader review not done in the code read. | ComputerUseControlBar.tsx:27-30 |
| Retry | Not handled by the app for a failed step; the model decides the next step. Remote page has 'Send again'. | RemoteComputerPage.tsx:52-54 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/computerUseSteps.test.ts`: Typing only when the approved app is still in front; refuses key press and click when focus or app changes during prompts; refuses when approval is withdrawn during review; no app read for a step with no target
- `apps/desktop/electron/__tests__/computerUseSession.test.ts`: Stop withdraws grant and never clears a refusal
- `apps/desktop/electron/__tests__/computerUseLoop.test.ts`: Repeat and alternating loop detection, step signatures, screen-change sampling
- `apps/desktop/electron/__tests__/applicationLaunch.test.ts`: Finding apps by name and bundle id, refusing AGI Desktop, opening the resolved bundle, listing apps
- `apps/desktop/electron/__tests__/computerUseProtocol.test.ts`: Helper protocol and display choice (by file name)
- `apps/desktop/electron/__tests__/computerUseServiceSecureInput.test.ts`: Secure input reading through the helper
- `apps/desktop/electron/__tests__/dispatcher.test.ts`: Dispatcher including computer use and per-task confirmation (73 matches; not all read)
- `apps/desktop/electron/__tests__/approvalReview.test.ts`: Approval review dialogs (by file name)
- `apps/web/features/desktop-host/__tests__/ComputerUseSettings.test.tsx`: Allowed and refused app lists, refuse picker, removing an answer
- `apps/web/features/desktop-host/__tests__/device-step-displays.test.ts`: Display descriptions in screenshot results
- `apps/web/lib/device-steps/__tests__/device-clearance-step.test.ts`: Device clearance for cloud runs (by file name)
- `apps/web/lib/device-steps/__tests__/device-registry.test.ts`: Device presence and capability clearance (by file name)
- `apps/web/features/desktop-host/__tests__/dispatch-task-reply.test.ts`: Dispatch task replies (by file name)
- `apps/extension/__tests__/computer-use-approval-policy.test.ts`: Extension approval policy (by file name)
- `apps/extension/__tests__/computer-use-agent-loop.test.ts`: Extension agent loop (by file name)
- `apps/extension/__tests__/computer-use-input-watch.test.ts`: Input watch lease (by file name)
- `apps/extension/__tests__/computer-use-run-ownership.test.ts`: Run ownership (by file name)
- `apps/extension/__tests__/browser-approval-modes.test.ts`: Ask first, Auto, Full access and YOLO behaviour (by file name)

**Test scenarios**

- **Per-app prompt and Never allow**
  1. Allow computer use
  2. Ask the agent to click inside an app that has no answer
  3. Choose Never allow
  4. Ask again for the same app
  - Expected: First step asks about that app; after Never allow the app is under Refused apps and the next step is refused with 'has not allowed AGI to control <app>' and no prompt.
- **User input pause and hand back**
  1. Start a long task
  2. Move the mouse
  3. Press Hand back, choose Keep control, then Hand back again
  - Expected: Run pauses with notification; Keep control leaves it paused; Hand back resumes after a fresh screenshot.
- **Escape stop**
  1. Start a task
  2. Press Escape
  - Expected: Run ends, helper killed, grant withdrawn, further steps refused until the task ends.
- **Sensitive review**
  1. Ask for a step that sends a message or pays
  2. Observe the 'Check this step' dialog
  3. Choose Deny
  - Expected: Step does not run and the model is told the user did not allow it.
- **Offline desktop from cloud run**
  1. Start a cloud task that targets a desktop
  2. Put that computer to sleep
  - Expected: Chat shows 'Waiting for <device> to come online' and later 'Continuing without <device>' after the wait budget.
- **Remote page**
  1. Pair from Desktop Remote Control
  2. Paste the link on /code/computer
  3. Send a task and cancel it
  - Expected: Task status updates; cancel reaches the computer; offline shows the reconnect message.

**Where to look when it fails**

- Desktop telemetry domain desktop_control (computerUseSession.ts:212,241,338; dispatcher.ts:594).
- ComputerUseRefused reason strings and runtime failure codes permission-denied, unsupported-platform, io-error (dispatcher.ts:3199-3207).
- Server logs '[cloud-agent] device withdrawn from the run' and 'device registry unreadable' (device-clearance-step.ts).
- Audit event type computer_use_action (tool-loop.ts:3503-3507).
- Chrome: step log in the panel and cancel reasons such as debugger_detached (background.ts:6731-6733).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/065-computer-use-experience.md](../../70-qa/test-plans/web/065-computer-use-experience.md)
- Desktop: [70-qa/test-plans/desktop/065-computer-use-experience.md](../../70-qa/test-plans/desktop/065-computer-use-experience.md)
- Mobile: [70-qa/test-plans/mobile/065-computer-use-experience.md](../../70-qa/test-plans/mobile/065-computer-use-experience.md)
- Chrome: [70-qa/test-plans/chrome/065-computer-use-experience.md](../../70-qa/test-plans/chrome/065-computer-use-experience.md)

## 10. Gaps and dependencies

- **No window selection** Affects: Desktop and web users. Evidence: Brief S65.05 missing on web and desktop; helper returns a windowId but steps take no window argument in dispatcher.ts:2555-2594. Work needed: Add a window target to capture and input steps.
- **No native file-dialog handling** Affects: Desktop users. Evidence: Brief S65.17; no dedicated code found. Work needed: Design and test open/save dialog flows, including secure prompts.
- **No background operation on Desktop** Affects: Desktop users, who lose their screen during a run. Evidence: Brief S65.18 desktop missing; run pauses when the user touches input (computerUseSession.ts:146-168). Work needed: Background-capable input or virtual display; Chrome background live check still owed.
- **No authentication handoff on Desktop** Affects: Desktop users. Evidence: Brief S65.24 desktop missing; macOS password prompts are refused with advice to answer them manually (computer-use.ts:58-62). Work needed: A handoff tool like the Chrome ask_user_to_take_over.
- **No pointer or action overlay on Desktop** Affects: Desktop users. Evidence: Brief S65.08 lists only chrome done; content.ts AGI_CU_SHOW_ACTION is extension only. Work needed: Overlay window drawn at the action point.
- **Web outside Desktop and CLI have no controls** Affects: Web and CLI users. Evidence: Brief web missing for most items; CLI missing for S65.14-S65.16. Work needed: Decide scope; at least explain and hand off to Desktop.
- **Brief status for Chrome pause, take over, return control and drag looks out of date** Affects: Planning accuracy. Evidence: computerUsePanel.ts:1224-1240; agentLoop.ts:710-725,1468. Work needed: Re-audit and update the brief; live-test.
- **Mobile remote dispatch needs live validation after relay redeploy** Affects: Mobile users. Evidence: Brief S65.29 note. Work needed: Run the live check named in the brief.
- **Local mode behaviour is not defined in the code read** Affects: Users of Local and own-key modes. Evidence: No local driver found; doc: docs/product/requirements.md:133. Work needed: State whether Local and own-key can use computer use and enforce consent for screenshots sent to a provider.
- **Free plan treatment unknown** Affects: Free users. Evidence: Catalog lists no computer_use slot for Free. Work needed: Define and test the Free experience.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- F065-01
- surface:desktop
- surface:chrome
- surface:web
- surface:mobile
- mode:cloud
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-observability-and-operations
- table:managed_usage_requests
- api:POST /api/llm/v1/chat/completions
- api:POST /api/devices/heartbeat
- file:apps/desktop/electron/runtime/computerUseSteps.ts

## Unknown

- Whether screenshots are retained on our servers and for how long.
- How Local mode and own-key mode should treat computer use; no code found either way.
- Whether Chrome drag, pause and take over are fully working end to end (code exists; brief says missing; no live run recorded).
- Whether the Chrome background-tab behaviour works live (brief asks for a live check).
- Mobile dispatch result after the relay redeploy.
- The CLI and VS Code folder-permission code at the brief's line references could not be matched and was not read in depth (S65.12).
- Desktop telemetry retention and sync.
- Contents of most individual test cases in dispatcher.test.ts and the extension test files; only titles or file names were used.
