---
id: "F059-10"
type: "feature"
title: "Take over the agent's screen or browser"
aliases: ["User takeover (S59.29)", "Take over", "Hand back", "Continue", "Hand Back Screen Control", "computer_take_over", "computer_hand_back", "computer-use-handed-back"]
area: "59 Approvals and human-in-the-loop UI"
available_on: ["desktop", "chrome"]
implementation: {web: "n/a", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "built"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S59.29"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-voice-and-media", "SYS-shared-ui-and-design", "file:packages/contracts/local-runtime/src/protocol.ts", "file:apps/desktop/electron/runtime/computerUseSession.ts", "file:apps/extension/src/features/computer-use/runOwnership.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F059-10 Take over the agent's screen or browser

While the agent drives the screen or a browser tab, the person can press Take over to pause it, use the screen themselves, then hand control back. Built on Desktop (Electron) and Chrome. On Desktop the agent is told to look again before carrying on. Chrome ends the task after 15 minutes without a hand back.

Area: [59. Approvals and human-in-the-loop UI](README.md). Requirement items: [S59.29](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5929).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Pauses the agent's control of the computer or a browser tab on request or when the person starts using it, and lets the person hand control back so the task goes on.

**Why it exists.** A person must always be able to stop an agent that controls their screen and fix things by hand. Product requirements list a manual takeover path.

**Who uses it.** Desktop and Chrome users running computer use or browser tasks.

**Problems it solves**

- Agent stuck on a login or captcha the person must do.
- Person needs to correct something the agent got wrong.
- Agent clicking while the person is typing.

**Use cases**

- Desktop: press Take over, sign in to a website, press Hand back.
- Chrome: the agent hands the page over to enter a password; the person presses Continue.
- Desktop: move the mouse during a run and the agent pauses by itself.
- Chrome: leave a taken-over tab for 15 minutes and the task ends.

## 2. User experience

**Where to find it**

- Desktop (hosted web UI in Electron): floating status bar 'AGI is using your computer' with buttons 'Take over' and 'Stop'; when paused 'Paused. You have the screen.' with 'Hand back' and 'Stop' (apps/web/features/desktop-host/components/ComputerUseControlBar.tsx:31,53; mounted in DesktopHostMount.tsx:55).
- Desktop tray menu: 'Hand Back Screen Control' while the screen is taken (apps/desktop/electron/tray.ts:152). The stop shortcut also takes the screen back (apps/desktop/electron/main.ts:1794).
- Chrome side panel: browser-task bubble button 'Take over' / 'Hand back' (apps/extension/src/features/side-panel/bubbles.ts:1587) and computer-use panel buttons 'Take over' and 'Continue' (apps/extension/src/features/side-panel/computerUsePanel.ts:1227,1234).
- Chrome page: in-page run dock with 'Stop' and 'Take over'; while paused the dock shows 'You have the page.' (apps/extension/src/features/content/browserRunOverlay.ts:55,76-78).

**Before you start**

- Desktop: computer use turned on in settings and permission granted, macOS or supported OS (apps/desktop/electron/runtime/computerUseSession.ts:81-99,263-265).
- Chrome: an active browser or computer-use run on a tab.

**Screens and controls**

- Take over, Hand back, Stop (Desktop bar).
- Native confirmation 'Hand the screen back?' with buttons 'Keep control' and 'Hand back' (apps/desktop/electron/runtime/computerUseSteps.ts:138-150), reached through computer_hand_back (dispatcher.ts:2606-2607).
- Chrome Take over, Hand back or Continue, Stop; banner 'You have the page.'

**Journey**

1. 1. The agent is controlling the screen or tab.
2. 2. The person presses Take over (or moves the mouse or types).
3. 3. The agent pauses; its next screen step waits.
4. 4. The person uses the screen.
5. 5. The person presses Hand back (Desktop asks to confirm) or Continue (Chrome).
6. 6. Desktop: the agent is told the screen may have changed, takes a fresh screenshot and carries on; the chat is sent a resume prompt. Chrome: the held step finishes and the loop continues.

**What the person sees and gets**

- Desktop hint 'It paused when you moved the pointer or typed. Hand back to let it carry on.' (ComputerUseControlBar.tsx:34-40).
- Desktop notification 'AGI paused: You used the mouse or keyboard, so it stopped where it was...' (computerUseSession.ts:252-256).
- Chrome text 'The page was not handed back within 15 minutes, so the task ended and AGI let go of the tab.' (computerUsePanel.ts:825).
- Chrome errors 'AGI could not hand you the page. Use Stop to end the run.' (computerUsePanel.ts:1350).

**Settings**

- Desktop: computer use on or off in Settings, Desktop app (computerUseSession.ts:56 message).
- Desktop stop shortcut shown in the bar (ComputerUseControlBar.tsx:20).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Desktop: take over pauses an active run and releases the stop shortcut; hand back resumes, resets the idle clock and releases held steps (apps/desktop/electron/runtime/computerUseSession.ts:344-370).
- Desktop auto-pauses when the mouse moves or a key is pressed (computerUseSession.ts:160-167) and tells the person (252-256).
- Desktop held step: a screen step that waits while paused ends after 10 minutes as 'expired' (computerUseSession.ts:38,191); the agent is told the user has not handed it back (50).
- After hand back a non-observing step is refused with 'The user handed control back after using the computer themselves, so the screen may have changed and this step did not run. Take a fresh screenshot and carry on from what it shows.' (computerUseSession.ts:48,278); screenshots, zoom and wait run (OBSERVING_COMMANDS, line 40).
- When a resume is owed the main process sends computer-use-handed-back (apps/desktop/electron/main.ts:2658; packages/contracts/local-runtime/src/protocol.ts:128) and the web host sends a chat message 'I have handed control of the computer back to you. Take a fresh screenshot and carry on from where you stopped.' (apps/web/features/desktop-host/hooks/use-computer-use-resume.ts:10-39).
- Desktop commands computer_take_over and computer_hand_back are registered (apps/desktop/electron/runtime/dispatcher.ts:2604-2607; apps/web/features/desktop-host/lib/runtime-client.ts:417-422).
- Chrome: PAUSE_COMPUTER_USE and RESUME_COMPUTER_USE messages (apps/extension/src/background.ts:7088; apps/extension/src/types.ts:1165); a takeover object holds the tool step until handed back (apps/extension/src/features/computer-use/runOwnership.ts:120-136; background.ts:1029-1050); a 15 minute limit cancels the run with reason takeover_expired (runOwnership.ts:17; background.ts:1053-1064).
- Chrome watches user input on the tab and pauses with 'You started using the page, so AGI stopped acting on it.' (background.ts:1015-1027; messages.json cuTakeoverByInputReason).

**Incomplete**

- Desktop hand back is not a literal continue from the same step: the held step is refused unless it only observes, and the agent re-plans from a fresh screenshot. This differs from the brief's 'resumes from where it stopped'.
- Chrome in-page dock offers Take over but no hand back; hand back is in the side panel (browserRunOverlay.ts:55-78).
- Chrome label differs by surface: 'Hand back' in the bubble, 'Continue' in the computer-use panel (bubbles.ts:1587; computerUsePanel.ts:1234).
- Desktop has no per-takeover time limit beyond the 10 minute held step (computerUseSession.ts:38).

**Present but disconnected or switched off**

- apps/desktop/src ComputerUseControlStatus is the internal Tauri build and does not reach the Electron window (apps/desktop/src/features/voice/ComputerUseControlStatus.tsx:5; AGENTS.md section 5).

**Not available**

- Web (without the Desktop host), Mobile, CLI and VS Code: no takeover control (n/a in the brief; none found).

## 4. Required behaviour

**Established requirements**

- While the agent controls a screen or browser, the user can take over control and later hand it back. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S59.29)
- The take-over protocol message is defined in packages/contracts/local-runtime/src/protocol.ts. (source: F059-10 brief text; code shows computer-use-handed-back at protocol.ts:128)
- Computer use needs clear visible state while AGI controls browser or app, logs, and a manual takeover path. (source: doc: docs/product/requirements.md (safety list near line 1636-1642))
- Computer-use actions with real-world consequences need approval. (source: doc: docs/product/requirements.md section 9.7)

**Acceptance criteria**

1. Desktop: during a run press Take over; no further clicks or keys come from the agent.
2. Desktop: moving the mouse during a run pauses it and shows the pause notice.
3. Desktop: Hand back asks to confirm, then the agent takes a screenshot before acting.
4. Chrome: Take over pauses; Continue resumes the same task.
5. Chrome: after 15 minutes paused the task ends with the takeover_expired message.
6. Stop ends the run on both apps and the agent is told not to try another screen step.
7. No takeover control appears on Web, Mobile, CLI or VS Code.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The same wording for the resume button on every Chrome surface.
- [inferred] Desktop should state its 10 minute hold limit to the person like Chrome states 15.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add Hand back to the Chrome page dock.
- [proposed] Show the hold limit on the Desktop bar.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | computerUseSession | `apps/desktop/electron/runtime/computerUseSession.ts` | Phases, take over, hand back, user-input pause, held-step limit |
| service | computerUseSteps | `apps/desktop/electron/runtime/computerUseSteps.ts` | Hand-back confirmation dialog and screen step guard |
| command | computer_take_over and computer_hand_back | `apps/desktop/electron/runtime/dispatcher.ts` | Runtime commands called by the web host |
| event | computer-use-handed-back | `packages/contracts/local-runtime/src/protocol.ts` | Runtime event telling the chat to resume |
| service | Electron main wiring | `apps/desktop/electron/main.ts` | Sends the handed-back event, stop shortcut takes the screen, tray refresh |
| component | tray | `apps/desktop/electron/tray.ts` | 'Hand Back Screen Control' menu item |
| component | ComputerUseControlBar | `apps/web/features/desktop-host/components/ComputerUseControlBar.tsx` | Take over, Hand back, Stop bar |
| hook | useComputerUse | `apps/web/features/desktop-host/hooks/use-computer-use.ts` | Calls take over and hand back |
| service | runtime-client | `apps/web/features/desktop-host/lib/runtime-client.ts` | invoke computer_take_over and computer_hand_back |
| hook | useComputerUseResume | `apps/web/features/desktop-host/hooks/use-computer-use-resume.ts` | Sends the resume prompt when control is handed back |
| component | DesktopChatRunner | `apps/web/features/desktop-host/components/DesktopChatRunner.tsx` | Mounts the resume hook |
| service | Chrome background takeover | `apps/extension/src/background.ts` | Pause and resume messages, takeover wait, 15 minute limit, input watcher |
| service | runOwnership | `apps/extension/src/features/computer-use/runOwnership.ts` | Run lease and takeover object, USER_TAKEOVER_MAX_MS |
| component | computerUsePanel | `apps/extension/src/features/side-panel/computerUsePanel.ts` | Take over and Continue buttons, takeover_expired text |
| component | bubbles run bar | `apps/extension/src/features/side-panel/bubbles.ts` | Take over / Hand back toggle in the browser-task bubble |
| component | browserRunOverlay | `apps/extension/src/features/content/browserRunOverlay.ts` | In-page Stop and Take over dock |
| schema | ComputerUseTakeoverMessage | `apps/extension/src/types.ts` | PAUSE_COMPUTER_USE and RESUME_COMPUTER_USE types |
| config | takeover strings | `apps/extension/_locales/en/messages.json` | Labels and limit texts |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses Take over; the web host calls the Electron runtime command computer_take_over. | device | runtime-client.ts:417; dispatcher.ts:2604 |
| The session moves to paused, the stop shortcut is released and the agent's next screen step waits. | device | computerUseSession.ts:247-262,344-352 |
| Person presses Hand back, confirms in a native dialog; the phase returns to active and held steps are released. | device | computerUseSteps.ts:138-150; computerUseSession.ts:355-370 |
| The held step is refused unless it only observes; if a resume is owed the chat sends a resume prompt to the model. | device and our servers | computerUseSession.ts:269-279; use-computer-use-resume.ts:29-43 |
| The model (Cloud, own key or local, as the chat uses) takes a fresh screenshot and decides the next step. | outside service | use-computer-use-resume.ts:39-42 (model taken from the last answer) |
| Chrome: the extension service worker pauses the tool loop and waits on a promise until hand back, or cancels at 15 minutes. | device | background.ts:1029-1064 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Computer-use phase and pause cause | Memory in the Electron main process | No | Reset when the run ends (computerUseSession.ts:203,231) |
| Chrome run lease and takeover | Memory in the extension service worker | No | Cleared on cancel or hand back (runOwnership.ts:131-136) |
| Desktop event record of control (domain desktop_control) | Desktop event log via recordDesktopEvent | unknown | unknown |

**Models and providers.** Takeover itself uses no model. The resume prompt goes to the same model the last answer used, falling back to the desktop chat model (use-computer-use-resume.ts:14-42). Screens may be sent to the model provider as screenshots; routing is owned by SYS-model-catalog-and-routing.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Desktop takeover controls need no account; the resume prompt goes through a chat that may need one. Chrome needs the managed owner account for Cloud runs (background.ts:6698 region). |
| Permissions | Desktop requires the computer-use setting and the OS grant (computerUseSession.ts:56,263-265). Chrome requires site access for the tab and cancels when access is withdrawn (runOwnership.ts:9). |
| Subscription | none found in the code for takeover and hand back. Whether computer use itself is plan gated was not checked. |
| Limits and metering | Desktop quiet run limit 2 minutes, held step limit 10 minutes (computerUseSession.ts:37-38). Chrome takeover limit 15 minutes (runOwnership.ts:17). |
| Feature flags | Desktop computerUseEnabled preference (computerUseSession.ts:68). |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Takeover works on device with no server. Whether a local on-device model can drive computer use: not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| User moves the mouse or types | Auto pause with notification (Desktop); auto pause with banner (Chrome) | computerUseSession.ts:160-167,252-256; background.ts:1015-1027 |
| Held step waits too long | Desktop ends the held step after 10 minutes; Chrome ends the run after 15 | computerUseSession.ts:191; background.ts:1053-1064 |
| Stopped while paused | Agent told not to try another screen step | computerUseSession.ts:46,270 |
| Reply ended while the user had the screen | Step refused: 'This reply ended while the user had the screen' | computerUseSession.ts:52 |
| Computer use switched off | Step refused with a message pointing to Settings | computerUseSession.ts:53 |
| Take over or hand back fails (Chrome) | Error banner with advice to use Stop | computerUsePanel.ts:1350-1358 |
| Unsupported OS or grant missing (Desktop) | Status shows unavailableReason | computerUseSession.ts:84-92 |
| Accessibility | Desktop bar has role status with aria-live polite; Chrome dock is a labelled group | ComputerUseControlBar.tsx:22-26; browserRunOverlay.ts:42-44 |
| Offline | not handled in the code for the takeover itself; the resume prompt needs the chat connection | use-computer-use-resume.ts:39 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/computerUseSession.test.ts`: Stopping computer use withdraws the grant and never clears a refusal; no take-over or hand-back test found
- `apps/desktop/electron/__tests__/computerUseSteps.test.ts`: Screen step guard (hand-back dialog coverage unverified)
- `apps/desktop/electron/__tests__/computerUseProtocol.test.ts`: Computer-use protocol contract
- `apps/extension/__tests__/computer-use-stop-ui.test.ts`: Take over button in the panel and the takeover_expired 15 minute text (lines 385-390)
- `apps/extension/__tests__/browser-control-contract.test.ts`: Cancellation reason list including takeover_expired (line 125)
- `apps/desktop/src/stores/__tests__/computerUseStore.test.ts`: Internal Tauri store, not the public Desktop

**Test scenarios**

- **Desktop take over and hand back**
  1. Start a computer-use task on Desktop.
  2. Press Take over, move a window, press Hand back and confirm.
  - Expected: Agent pauses, then takes a fresh screenshot and continues; the chat shows the resume prompt.
- **Desktop auto pause**
  1. Start a task.
  2. Move the mouse.
  - Expected: Pause notification appears and the bar shows 'Paused. You have the screen.'
- **Desktop hold expiry**
  1. Take over and wait more than 10 minutes with a step waiting.
  - Expected: Step ends with the message that the user has not handed control back.
- **Chrome takeover limit**
  1. Run a browser task, press Take over, wait 15 minutes.
  - Expected: Task ends with the takeover_expired text.
- **Chrome Continue**
  1. Take over, edit the page, press Continue.
  - Expected: Task resumes on the same tab.
- **No control elsewhere**
  1. Open Mobile, CLI and VS Code during a run.
  - Expected: No Take over control.

**Where to look when it fails**

- Desktop messages in computerUseSession.ts:46-53; event record domain desktop_control.
- Chrome cancellation reasons in runOwnership.ts:5-15.
- Runtime event computer-use-changed carries phase and pausedBy (protocol.ts:122).
- Check Electron main console for 'computer_hand_back' dispatch errors.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/desktop/059-approvals-and-human-in-the-loop-ui.md)
- Chrome: [70-qa/test-plans/chrome/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/chrome/059-approvals-and-human-in-the-loop-ui.md)

## 10. Gaps and dependencies

- **Hand back refuses the held step and relies on a fresh screenshot, not a literal resume** Affects: Desktop. Evidence: computerUseSession.ts:278. Work needed: Align the brief and UI wording, or restore the exact step
- **Chrome page dock has no hand back** Affects: Chrome. Evidence: browserRunOverlay.ts:55-78. Work needed: Add a control or point to the side panel
- **Inconsistent resume labels (Hand back versus Continue)** Affects: Chrome. Evidence: bubbles.ts:1587; computerUsePanel.ts:1234. Work needed: Use one label from the locale file
- **No test found for Desktop take over and hand back** Affects: Desktop. Evidence: computerUseSession.test.ts has only stop tests. Work needed: Add tests for pause, hand back and held-step expiry
- **Hold limits differ (10 minutes versus 15) and are not shown on Desktop** Affects: Desktop, Chrome. Evidence: computerUseSession.ts:38; runOwnership.ts:17. Work needed: Decide one rule and show it

**Depends on**

- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-voice-and-media
- SYS-shared-ui-and-design
- file:packages/contracts/local-runtime/src/protocol.ts
- file:apps/desktop/electron/runtime/computerUseSession.ts
- file:apps/extension/src/features/computer-use/runOwnership.ts

## Unknown

- Whether computer use or browser control is plan gated.
- Whether a local on-device model can drive computer use.
- Retention of the desktop_control event record.
- Whether any test covers Desktop take over and hand back.
- Whether the Chrome in-page Take over button maps to the same pause as the side panel (types.ts:987 shows a takeover command, handler not read).
