---
id: "F070-05"
type: "feature"
title: "Screen capture and computer use"
aliases: ["Screenshot to Chat", "Window to Chat", "Screen capture", "Computer use", "Screen control", "Take over", "Hand back", "S70.19", "S70.21"]
area: "70 Desktop application"
available_on: ["desktop"]
implementation: {web: "n/a", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S70.19", "S70.21"]
depends_on: ["surface:desktop", "mode:cloud", "file:apps/desktop/electron/screenshot.ts", "file:apps/desktop/electron/runtime/computerUseSession.ts", "api:POST /api/llm/v1/chat/completions", "F070-03", "F070-02", "SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F070-05 Screen capture and computer use

On the desktop app a shortcut or menu item captures the screen, or the front window of another app, and pastes it into the chat composer. Separately, a cloud model turn can see the screen and move the mouse and keyboard on macOS, only after the user turns it on and approves each task.

Area: [70. Desktop application](README.md). Requirement items: [S70.19](../../10-requirements/capabilities/070-desktop-application.md#s7019), [S70.21](../../10-requirements/capabilities/070-desktop-application.md#s7021).

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

**What it does.** Captures the display under the cursor (or the front window of another app on macOS) to the clipboard, pastes it into the chat composer and clears the clipboard. Also runs computer use: screenshots, pointer, keyboard and app-open steps requested by the model, with stop, take over and hand back. (screenshot.ts:142-243, computerUseSession.ts:200-394)

**Why it exists.** Briefs S70.19 and S70.21: capture the screen into chat, and let the assistant see and control the computer after permission with stop and take-over. The product spec lists computer use for Desktop (doc: docs/product/requirements.md:80).

**Who uses it.** Desktop users asking about what is on screen or delegating on-screen tasks (macOS for control).

**Problems it solves**

- Attach a screenshot without saving a file.
- Let an agent act in apps that have no API, with the user able to stop it at any moment.
- Prevent a screen picture from staying on the clipboard.

**Use cases**

- Press Screenshot key, ask 'what does this error mean?'.
- Press Window to Chat to send only the app in front.
- Ask the assistant to fill a form in a desktop app; approve 'Allow for this task'.
- Press Escape during a run to stop.

## 2. User experience

**Where to find it**

- Desktop only. File > 'Screenshot to Chat'; tray items 'Screenshot to Chat' and 'Window to Chat'; shortcuts in Settings 'Screenshot to chat shortcut' and 'Window to chat shortcut' (appMenu.ts:189-194, tray.ts:179-190, DesktopSettingsSection.tsx:100-107).
- Computer use: Settings section headed 'Computer use' with hint 'Let AGI see your screen and use the mouse and keyboard in apps you allow.' (ComputerUseSettings.tsx:34-35); control bar 'AGI is using your computer' with buttons 'Take over', 'Hand back', 'Stop' (ComputerUseControlBar.tsx:30-57); File > 'Stop Computer Use', 'Take Over Screen Control', 'Hand Back Screen Control' (appMenu.ts:196-212); tray 'Hand Back Screen Control' and 'Stop Computer Use and Revoke Access...' (tray.ts:151-161).

**Before you start**

- Computer use is off by default (garnishCore.ts:567) and must be turned on in Settings.
- Computer use runs on macOS only; other systems report 'supported on macOS only' (computerUseService.ts:226-232).
- Window capture needs the macOS helper, so it is macOS only too (computerUseService.ts:392-394).
- macOS Screen Recording permission for screenshots and Accessibility for pointer and keyboard (computerUseService.ts:245-262, systemPermissions.ts:22-31).
- A cloud chat turn on a model that calls device tools (request-processor.ts:6359-6362).

**Screens and controls**

- Control bar over the page with role 'status' and live region (ComputerUseControlBar.tsx:23-26).
- Native dialog 'Let the agent use your screen?' with buttons 'Cancel' and 'Allow for this task' (dispatcher.ts:1950-1960).
- Macros: Stop key is Escape, registered globally only while a run is active (computer-use.ts:24, computerUseSession.ts:123-132).
- Settings Computer use section lists Control (Any app, Chrome), Allowed apps, Refused apps and a Stop button (ComputerUseSettings.tsx:34-60).

**Journey**

1. Screenshot: press the key. The Quick Ask panel and main window hide for 300 ms, the display under the cursor is captured, written to the clipboard, the main window is shown and the composer focused, and a paste runs (screenshot.ts:190-243).
2. After one second the clipboard is cleared, or the earlier text restored, if it still holds the capture (screenshot.ts:92-107, :235-238).
3. Computer use: enable it in Settings; ask a task; the agent's screen step raises a native 'Allow for this task' prompt; a notification 'AGI is using your computer' says how to stop (computerUseSession.ts:213-218).
4. While running, press Escape or the Stop button to stop; Take over pauses so the user can act; Hand back resumes (computerUseSession.ts:313-340).
5. Moving the mouse or typing during a run pauses it automatically with a notice 'AGI paused' (computerUseSession.ts:231-238, :146-168).

**What the person sees and gets**

- Notifications: 'Screenshot copied', 'Screenshot copied to clipboard', 'Screenshot failed', 'Window capture failed' (screenshot.ts:114, :135-138, :217-221, :159-173).
- Dialog 'Screen recording permission needed' naming System Settings > Privacy & Security > Screen & System Audio Recording and asking for a relaunch, shown once per run of the app (screenshot.ts:39-52).
- Notification 'AGI finished using your computer' (computerUseSession.ts:259).
- Step results include the screen size and the picture (device-steps.ts:140-160 in apps/web/features/desktop-host/lib).

**Settings**

- computerUseEnabled preference (garnishCore.ts:567, computerUseSession.ts:108).
- Screenshot and window shot chords (F070-03).
- Allowed and refused apps lists (ComputerUseSettings.tsx:47-50).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Full-screen and front-window capture to chat with clipboard cleanup and destination checks (screenshot.ts:142-243).
- If the chat window is gone, the image stays on the clipboard with a notice (screenshot.ts:113-116).
- The paste goes only into the same page and conversation that asked (screenshot.ts:59-72, :126-134).
- Computer use session: active, paused, idle phases, stop shortcut, user-input pause, take over, hand back, quiet-run timeout 2 minutes, held-step limit 10 minutes (computerUseSession.ts:37-38, :200-340).
- Per-task native yes with a 5 minute idle expiry (computerUseRuns.ts:13, dispatcher.ts:1925-1963).
- The computer.use grant is high risk: it never persists past the session (permissionCore.ts:57-71, capabilities.ts:66-73).
- Repeat and cycle detector refuses a model stuck on the same click (computerUseLoop.ts:11-13, dispatcher.ts:585-600).
- Cloud turn is offered device tools only if the shell declared them; workspace controls can withhold computer.use (request-processor.ts:3365-3379, dispatcher.ts:2252-2282).
- Revoke: stopComputerUse withdraws the grant, so the agent must ask again (computerUseSession.ts:300-308).

**Incomplete**

- Screenshot to chat on Windows and Linux uses the Electron capturer; the permission message is Mac only (screenshot.ts:39-41).
- Window capture fails with 'No other app window is in front' when the helper is unavailable, which includes all non-Mac systems (screenshot.ts:157-160, computerUseService.ts:392-394).

**Present but disconnected or switched off**

- Computer use is off by default (garnishCore.ts:567); a step while off is refused with a message naming Settings, Desktop app (computerUseSession.ts:53).

**Not available**

- Computer use on Windows and Linux (computerUseService.ts:226-232).
- Computer use from Local (on-device) models: not found; the device registry reports localModels false (dispatcher.ts:2298) and the declaration is sent in a cloud chat request header (host-headers.ts:44-50).
- Web, Mobile, CLI, VS Code: none for screen control; the doc matrix lists Chrome extension as present for its own computer use (doc: docs/product/surface-feature-matrix.md:512-521).

## 4. Required behaviour

**Established requirements**

- The user can capture the screen or a chosen window into the chat from the desktop app. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.19)
- The assistant can see the screen and move, click and type after permission, with stop and take-over. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.21)
- Capture copies to the clipboard, pastes into chat, then clears the clipboard if it still holds only the capture. (source: task Should list; screenshot.ts:89-107)
- If the chat window is closed, the image stays on the clipboard and the user is told. (source: task Should list; screenshot.ts:113-116)
- Missing screen recording permission produces a message naming it and asking for a relaunch. (source: task Should list; screenshot.ts:45-51)
- Computer use can be stopped at any time; take-over pauses; hand-back resumes; revoke removes the grant. (source: task Should list; computerUseSession.ts:300-340)
- Browser and computer use must treat external content as untrusted. (source: doc: docs/product/requirements.md:1630-1632)

**Acceptance criteria**

1. Press the screenshot chord with the app visible: the composer receives the image of the display under the cursor and the clipboard no longer holds it a second later.
2. Copy text first, capture, wait: the text is back on the clipboard.
3. Close the main window, capture: a notice says the image is on the clipboard.
4. On Mac with Screen Recording denied, capture shows 'Screen recording permission needed' once.
5. Enable computer use and run a task: a native prompt 'Allow for this task' appears before the first screen step; Cancel makes the agent stop trying.
6. During a run press Escape: the run stops and the grant is withdrawn; the next task asks again.
7. Move the mouse during a run: the run pauses and Hand back resumes it.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The capture is taken of the display the cursor is on [inferred from screenshot.ts:209].
- The per-task prompt can be shown only on the device with the native dialog, so a web page cannot approve it [inferred from dispatcher.ts:1950].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show on Windows and Linux a clear message in Settings that computer use is macOS only.
- [proposed] Offer window capture on Windows and Linux without the helper.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | screenshot | `apps/desktop/electron/screenshot.ts` | Capture, clipboard handling, paste and cleanup (screenshot.ts:142-243). |
| service | computerUseSession | `apps/desktop/electron/runtime/computerUseSession.ts` | Phase, stop key, user-input watch, take over, hand back, enable. |
| service | computerUseService | `apps/desktop/electron/runtime/computerUseService.ts` | Helper process, platform support, permission checks, front window (computerUseService.ts:226-401). |
| service | computerUseRuns | `apps/desktop/electron/runtime/computerUseRuns.ts` | Per-task allowance with 5 minute idle end. |
| service | computerUseLoop | `apps/desktop/electron/runtime/computerUseLoop.ts` | Repeat and cycle detector. |
| service | dispatcher computer commands | `apps/desktop/electron/runtime/dispatcher.ts` | computer_* commands, guardScreenStep, confirmComputerRun, declareDeviceHost (dispatcher.ts:585, :1099-1108, :1925, :2252, :2555-2609). |
| service | permissionManager | `apps/desktop/electron/runtime/permissionManager.ts` | Grants, withdrawals, persistence (permissionManager.ts:1-90). |
| service | systemPermissions | `apps/desktop/electron/runtime/systemPermissions.ts` | OS permission status and settings links (systemPermissions.ts:22-71). |
| component | ComputerUseControlBar | `apps/web/features/desktop-host/components/ComputerUseControlBar.tsx` | On-screen status and buttons (ComputerUseControlBar.tsx:10-60). |
| component | ComputerUseSettings | `apps/web/features/desktop-host/components/ComputerUseSettings.tsx` | Settings section. |
| service | device-steps client | `apps/web/features/desktop-host/lib/device-steps.ts` | Runs device screen steps and returns images (device-steps.ts:140-300). |
| config | device step definitions | `packages/contracts/local-runtime/src/device-steps.ts` | Tool names, scopes and required capabilities (device-steps.ts:30-190). |
| endpoint | chat completions route | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Accepts the device host header and offers device tools (request-processor.ts:3354-3379, :3708-3716, :6359-6362). |
| service | host-headers | `apps/web/lib/device-steps/host-headers.ts` | Builds the declaration header for desktop chat requests (host-headers.ts:34-57). |
| service | capture picker | `apps/desktop/electron/main.ts` | 'Share a screen or window' picker for in-page capture (main.ts:855-885). |
| test | screenshot test | `apps/desktop/electron/__tests__/screenshot.test.ts` | Clipboard cleanup and paste destination. |
| test | computerUseSession test | apps/desktop/electron/runtime/__tests__/computerUseSession.test.ts (not found) (not found) | Session phases and stop. |
| test | computerUseLoop test | apps/desktop/electron/runtime/__tests__/computerUseLoop.test.ts (not found) (not found) | Loop detection. |
| test | ComputerUseSettings test | `apps/web/features/desktop-host/__tests__/ComputerUseSettings.test.tsx` | Settings section. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A chord or menu click calls captureToChat or captureWindowToChat. | device | main.ts:1937-1938, screenshot.ts:142-243 |
| The capture is made by the OS capturer, copied to the clipboard and pasted into the composer; the file is not sent anywhere until the user sends the message. | device | screenshot.ts:209-228 |
| The user sends the message; the image goes with the chat request. | our servers | chat pipeline (SYS-chat-turn-pipeline); not opened here |
| For computer use the page sends a chat request with a header declaring this device's capabilities. | our servers | host-headers.ts:44-57, request-processor.ts:3708-3716 |
| The cloud model asks for a device step; the page calls the local runtime; main asks for a per-task yes, then the helper takes a screenshot or acts. | device | device-steps.ts:140-160, dispatcher.ts:585-600, :1925-1963 |
| The screenshot is returned to the cloud model as an image. | our servers | device-steps.ts:150-160 (image returned), cloud side not opened |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Screen capture picture | clipboard for about a second, then composer attachment in memory; uploaded as an attachment when sent | yes once sent, as part of the conversation [inferred] | Clipboard cleaned (screenshot.ts:92-107); retention of the sent image follows chat storage, unknown. |
| Computer-use grant and phase | memory (high-risk grants are not persisted) | no | Ends on stop, quit or per-task expiry. |
| Computer-use telemetry counts | desktop telemetry (domain desktop_control) | unknown | unknown |

**Models and providers.** Computer use needs a cloud model turn that supports tools and image input; which models and providers qualify is decided by SYS-model-catalog-and-routing and was not established here. The device steps are model-neutral names (device-steps.ts:30-60). Local on-device models: not established (dispatcher.ts:2298 localModels false).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Capture needs none to run, but the paste target is the signed-in chat. Computer use requires a signed-in chat request to a cloud model [inferred from host-headers.ts]. |
| Permissions | macOS Screen Recording and Accessibility; in-app grant 'computer.use' (high risk, session only); per-task native yes (permissionCore.ts:57-71, dispatcher.ts:1950). |
| Subscription | none found in the desktop code. Cloud side: a workspace can withhold computer.use (request-processor.ts:3370-3372). Any plan gate for computer use in the cloud is unknown; the doc matrix labels it 'experimental' (doc: docs/product/surface-feature-matrix.md:102). |
| Limits and metering | Idle run end 2 minutes without a step (computerUseSession.ts:37); task allowance idle 5 minutes (computerUseRuns.ts:13); held step 10 minutes (computerUseSession.ts:38); repeat limit 5 and cycle limit 4 (computerUseLoop.ts:11-12). Chat usage for the turn is metered by the chat pipeline. |
| Feature flags | computerUseEnabled preference default false (garnishCore.ts:567); chat composer toggle deviceStepsEnabled (host-headers.ts:28-32); workspace feature access computer_use (request-processor.ts:3371). |
| Model compatibility | Needs tool calling and images; list of qualifying models is unknown. |
| Provider restrictions | none found in the desktop code; provider routing is cloud side. |
| Local mode | Screenshot to chat works with no plan and is a device action. Computer use with an on-device model is not found in the code; the declaration travels with cloud chat requests only. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Capture already running | A second press is ignored. | screenshot.ts:146, :191 |
| No screen content | Notification 'Screenshot failed' with Mac permission advice. | screenshot.ts:216-224 |
| Paste target changed | Not pasted; notice that the image is on the clipboard. | screenshot.ts:126-138 |
| Chat window closed | Image stays on the clipboard with a notice. | screenshot.ts:113-116 |
| User copied something after paste | Clipboard left alone. | screenshot.ts:96-100 |
| Computer use off | Step refused with message naming Settings. | computerUseSession.ts:53, :165-168 |
| Stopped | Further steps refused this reply. | computerUseSession.ts:46, :170-174 |
| Paused by user input | Steps wait for hand back, up to 10 minutes, then expire. | computerUseSession.ts:184-194, :237-243 |
| Driver window closed | Run ends as finished. | computerUseSession.ts:196-199 |
| Secure text field in the front app | Handled for typing (secureInput flag). | computerUseService.ts:340-351; detail not read |
| Accessibility | Control bar is a live status region with button labels. | ComputerUseControlBar.tsx:23-26 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/screenshot.test.ts`: Clipboard take-back, text restore, paste destination checks.
- apps/desktop/electron/runtime/__tests__/computerUseSession.test.ts (not found) (not found): Session phases, stop, take over, hand back.
- apps/desktop/electron/runtime/__tests__/computerUseLoop.test.ts (not found) (not found): Repeat and cycle detection.
- apps/desktop/electron/runtime/__tests__/computerUseSteps.test.ts (not found) (not found): Screen step handling.
- apps/desktop/electron/runtime/__tests__/computerUseProtocol.test.ts (not found) (not found): Helper protocol.
- apps/desktop/electron/runtime/__tests__/computerUseServiceSecureInput.test.ts (not found) (not found): Secure input handling.
- `apps/web/features/desktop-host/__tests__/ComputerUseSettings.test.tsx`: Settings section.
- `packages/contracts/local-runtime/src/__tests__/device-steps.test.ts`: Device step contract.

**Test scenarios**

- **Screenshot round trip**
  1. Open a chat in the desktop app.
  2. Press the screenshot chord from another app.
  3. Wait 2 seconds and paste in a text editor.
  - Expected: Image is in the composer; the clipboard no longer holds the image.
- **Closed window**
  1. Close the main window.
  2. Press the screenshot chord.
  - Expected: Notice 'Screenshot copied'; paste elsewhere gives the image.
- **Permission missing (Mac)**
  1. Deny Screen Recording for the app.
  2. Press the chord.
  - Expected: Dialog 'Screen recording permission needed' once.
- **Per-task approval**
  1. Turn computer use on.
  2. Ask the assistant to open an app.
  3. Choose Cancel in the dialog.
  - Expected: The agent reports it was not allowed and does not retry screen steps.
- **Take over and hand back**
  1. Start a run.
  2. Choose Take over.
  3. Move the mouse, then Hand back.
  - Expected: Run pauses, then resumes with a fresh screenshot.
- **Revoke**
  1. Press Escape or Stop.
  2. Start a new task needing the screen.
  - Expected: A new approval is requested.

**Where to look when it fails**

- Console '[screenshot] capture failed' and 'could not be taken back off the clipboard' (screenshot.ts:105, :230).
- Desktop telemetry domain 'desktop_control' (computerUseSession.ts:208).
- Refusal messages returned to the model by ComputerUseRefused.
- No run results found in files.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/070-desktop-application.md](../../70-qa/test-plans/desktop/070-desktop-application.md)

## 10. Gaps and dependencies

- **Brief cites ChatComposerNew.tsx:4461 as the capture UI; that line is queued follow-up code. The capture entry points are the shell menu, tray and chord.** Affects: Docs and testers. Evidence: ChatComposerNew.tsx:4440-4480. Work needed: Correct the brief reference.
- **Computer use and window capture work only on macOS but the brief says 'desktop done' without that limit.** Affects: Windows and Linux users. Evidence: computerUseService.ts:226-232. Work needed: State the limit or build support.
- **Whether Local (on-device) models can use screen steps is not available; steps are offered only on cloud chat requests.** Affects: Local-mode users. Evidence: host-headers.ts:44-57, dispatcher.ts:2298. Work needed: Decide the rule and document it under SYS-local-inference.
- **Subscription rule for computer use is not established.** Affects: Billing and access. Evidence: no plan check in the desktop files. Work needed: Read the cloud entitlement code for device tools.

**Depends on**

- surface:desktop
- mode:cloud
- file:apps/desktop/electron/screenshot.ts
- file:apps/desktop/electron/runtime/computerUseSession.ts
- api:POST /api/llm/v1/chat/completions
- F070-03
- F070-02
- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing

## Unknown

- Whether a plan or entitlement is required for computer use in the cloud.
- Which models and providers support device steps.
- Whether Local on-device models can drive screen steps.
- What the stop key value Escape does to other apps during a run (it is global while active).
- Retention of sent screenshots in chat storage.
- COMPUTER_USE_STOP_SHORTCUT handling when Escape is already held.
