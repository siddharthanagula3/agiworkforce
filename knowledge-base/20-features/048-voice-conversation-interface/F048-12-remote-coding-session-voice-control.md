---
id: "F048-12"
type: "feature"
title: "Remote coding session voice control"
aliases: ["Remote coding session voice control", "Remote computer voice input", "Start voice input", "RemoteComputerScreen", "Voice control of a remote session (S48.40)", "Your computer page"]
area: "48 Voice conversation interface"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S48.40"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "provider:openai", "plan:free", "SYS-voice-and-media", "SYS-sync-and-continuity", "SYS-agents-tools-and-automation", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "F048-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F048-12 Remote coding session voice control

On web, a person who has paired a browser to their computer can speak a task into the 'Your computer' page or the Code composer using a 'Start voice input' button. This is dictation: speech becomes text, which is then sent to the computer as a task. It is not live conversation. iPhone has no such control.

Area: [48. Voice conversation interface](README.md). Requirement items: [S48.40](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4840).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Turns a spoken sentence into text for a task that Desktop on another computer runs, so the person can steer a coding or computer task without typing (apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:283-299).

**Why it exists.** Coding and computer tasks are long to type; voice makes quick direction possible from a browser. The brief lists steering a remote coding session by voice (S48.40).

**Who uses it.** A signed-in web user who has Desktop running on a linked computer, or who uses the Code composer with a Cloud session.

**Problems it solves**

- Typing long task instructions in a browser.
- Quick follow-up steering of a remote task.

**Use cases**

- Paste a pairing link, press 'Start voice input', say 'run the tests and fix the first failure', and send.
- In the Cloud Code composer, dictate a prompt then review it before sending.
- Dictate into the task box, edit the text, and press 'Send to computer'.

## 2. User experience

**Where to find it**

- Web page 'Your computer' under Code at /code/computer (apps/web/app/code/computer/page.tsx; apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:33-34).
- Code composer mic button 'Start voice input' (apps/web/features/code/code-surface.ts:141; apps/web/features/code/components/CodeComposer.tsx:2047-2058).
- Public Desktop shows the same web pages [inferred from doc: AGENTS.md section 5].

**Before you start**

- Signed in. For the computer page: Desktop on the computer with Settings, Capabilities, Remote Control, Pair a phone, then Copy link for a browser; paste the link and press 'Connect' (apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:41-42, 62, 217-231).
- Dictation switched on in Settings > Voice and not switched off by the service (apps/web/features/chat/hooks/use-dictation.ts:42-60, 147).
- Code composer: the destination must be a supported Cloud session; otherwise the button is disabled with 'Voice input requires a supported Cloud session.' (apps/web/features/code/components/CodeComposer.tsx:1794-1807; code-surface.ts:142).

**Screens and controls**

- Task box 'Task' with placeholder 'Describe what AGI should do on your computer', button 'Send to computer', mic icon button 'Start voice input' (RemoteComputerPage.tsx:52-53, 31, 360-390).
- Dictation strip with cancel, stop, send, retry and upgrade controls (RemoteComputerPage.tsx:364-381).
- Computer list 'Computers on your account' with presence (RemoteComputerPage.tsx:36, 331-345).

**Journey**

1. 1. Open /code/computer and connect with a pairing link ('Connect').
2. 2. Wait for 'Connected to <computer name>'.
3. 3. Press 'Start voice input' and speak.
4. 4. Press stop; the audio is transcribed and the text is added to the box, or use Send in the strip to send at once.
5. 5. Review the text, press 'Send to computer'.
6. 6. Watch task status with cancel and send-again controls.

**What the person sees and gets**

- Strip states recording, stopped transcribing, transcript ready; errors with Retry; limit with Upgrade (apps/web/features/chat/hooks/use-dictation.ts:31-37; RemoteComputerPage.tsx:364-381; tests RemoteComputerPage.test.tsx:256-330).
- Task rows with status; failures such as 'The task did not reach your computer. Check the connection and try again.' (RemoteComputerPage.tsx:54).

**Settings**

- Settings > Voice: Dictation on/off, dictation language, 'Microphone' (apps/web/features/settings/sections/VoiceSection.tsx:45-47, 125-168).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Dictation into the remote task box and send (apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:283-299, 364-390).
- Pairing claim and secured relay with signed envelopes, heartbeat 25 s, receipt timeout 8 s, up to 3 send attempts (apps/web/features/remote-dispatch/lib/remote-dispatch-client.ts:9-34; apps/web/features/remote-dispatch/lib/dispatch-envelope.ts).
- Transcription route with dictation kill switch and the shared monthly free voice allowance (apps/web/app/api/voice/transcribe/route.ts:14-29; apps/web/app/api/llm/v1/audio/transcriptions/route.ts:594-652).
- Code composer dictation gated to managed Cloud destinations (CodeComposer.tsx:1794-1807).

**Incomplete**

- The mic button on the remote page is not disabled when dictation is switched off; start() returns silently (apps/web/features/chat/hooks/use-dictation.ts:147; RemoteComputerPage.tsx:383-392) [inferred dead-click].

**Present but disconnected or switched off**

- none found.

**Not available**

- Live voice conversation with a remote session: not found.
- iPhone: no remote computer page or voice control found in apps/mobile src or app (search for remote-dispatch, sendTask returned nothing); the experience contract lists remote control as feature-off on mobile (doc: docs/product/experience-contract.md:635-642).
- CLI, VS Code, Chrome: not listed in the brief.

## 4. Required behaviour

**Established requirements**

- The user can steer a remote coding session running on another device by voice. (source: S48.40)
- Voice failures (permission, microphone, transcription) must be recoverable and exit must release capture. (source: doc: docs/product/experience-contract.md:786 (W13))
- Do not claim realtime audio behaviour for a transcription-only path. (source: doc: docs/product/experience-contract.md:786)

**Acceptance criteria**

1. With a connected computer, 'Start voice input' records, transcribes and puts the sentence in the task box.
2. The Send action in the strip sends the combined text to the computer and the task appears in the list.
3. With dictation turned off in Voice settings the control either is disabled or explains why.
4. An exhausted Free allowance shows Upgrade, not a retry.
5. In the Code composer a non-Cloud destination disables the button with the stated reason.
6. Disconnect asks for confirmation and stops the pairing.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The remote page should explain why the mic does nothing when dictation is off [inferred from the Code composer's disabled reasons].
- Voice here is dictation, so the brief's 'voice control' wording should say dictation [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Disable the remote page mic with the same reason strings as the Code composer.
- [proposed] Decide whether a mobile control is wanted; the mobile app lacks the whole remote page.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | RemoteComputerScreen | `apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx` | Pairing, task box, dictation, task list. |
| screen | /code/computer page | `apps/web/app/code/computer/page.tsx` | Route that mounts the screen. |
| service | remote-dispatch-client | `apps/web/features/remote-dispatch/lib/remote-dispatch-client.ts` | Claims pairing, opens relay, sends and cancels tasks. |
| service | dispatch-envelope | `apps/web/features/remote-dispatch/lib/dispatch-envelope.ts` | Signs and opens task envelopes. |
| service | browser-pairing | `apps/web/features/remote-dispatch/lib/browser-pairing.ts` | Reads the pairing link. |
| hook | useDictation | `apps/web/features/chat/hooks/use-dictation.ts` | Recording, transcript, send and insert. |
| component | DictationStrip | `apps/web/features/chat/components/Composer/DictationStrip.tsx` | Strip with stop, send, cancel, retry, upgrade. |
| store | voice-input-store | `apps/web/features/chat/stores/voice-input-store.ts` | Microphone capture and upload to /api/voice/transcribe (16, 280). |
| component | CodeComposer | `apps/web/features/code/components/CodeComposer.tsx` | Mic button with disabled reasons (1794-1827, 2047-2058). |
| config | code-surface copy | `apps/web/features/code/code-surface.ts` | 'Start voice input' and 'Voice input requires a supported Cloud session.' (141-142). |
| endpoint | POST /api/voice/transcribe | `apps/web/app/api/voice/transcribe/route.ts` | Dictation admission and transcription (kill switch). |
| endpoint | POST /api/llm/v1/audio/transcriptions | `apps/web/app/api/llm/v1/audio/transcriptions/route.ts` | Shared transcription handler with free-allowance grants (594-652). |
| endpoint | POST /api/pair/claim | `apps/web/app/api/pair/claim/route.ts` | Browser claims a pairing. |
| endpoint | GET /api/settings/devices | `apps/web/app/api/settings/devices/route.ts` | Lists computers on the account (DEVICES_PATH). |
| component | VoiceSection | `apps/web/features/settings/sections/VoiceSection.tsx` | Dictation switch, language, microphone. |
| config | dictation kill switch | `apps/web/lib/feature-flags/kill-switches.ts` | DICTATION_CAPABILITY used by the transcribe route (imported at route.ts:6). |
| test | RemoteComputerPage test | `apps/web/features/remote-dispatch/components/__tests__/RemoteComputerPage.test.tsx` | Dictation limit and retry cases (256-330). |
| test | remote-dispatch-client test | `apps/web/features/remote-dispatch/lib/remote-dispatch-client.test.ts` | Client behaviour (cases not read). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The browser records microphone audio in the voice input store. | device | apps/web/features/chat/stores/voice-input-store.ts:280-295 |
| The recording is posted to our transcription route, which checks sign-in, the dictation switch and, on Free, the monthly voice allowance. | our servers | apps/web/app/api/voice/transcribe/route.ts:18-29; apps/web/app/api/llm/v1/audio/transcriptions/route.ts:594-652 |
| The route passes the audio to OpenAI's transcription service and returns text; our servers keep no audio. | outside service | apps/web/app/subprocessors/page.tsx:115 |
| The text lands in the task box (insert) or is sent at once (send). | device | apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:292-298 |
| The task is wrapped in a signed envelope and sent over the relay to the paired computer. | device and our servers | apps/web/features/remote-dispatch/lib/remote-dispatch-client.ts:1-34 (relay service role inferred from SignalingClient) |
| Desktop on the computer runs the task with the folders, apps and browser allowed there. | device | apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:34-35 |
| Status returns over the same relay to the task list. | device and our servers | apps/web/features/remote-dispatch/lib/remote-dispatch-client.ts:36-45 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Dictation audio | Not stored by AGI per the subprocessor page | No | OpenAI policy cited on the page (apps/web/app/subprocessors/page.tsx:115) |
| Task text and status | Browser memory in the page; relay and Desktop task store (not read) | Via relay to the computer | Page state cleared on disconnect; Desktop retention unknown |
| Dictation language and microphone | store:voice-input-store | No | Browser storage |

**Models and providers.** Transcription uses the transcription route in the model catalog, on OpenAI (apps/web/app/api/llm/v1/audio/transcriptions/route.ts; apps/web/app/subprocessors/page.tsx:115). The task itself runs on the computer's Desktop with whatever model Desktop is set to (not traced).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; the pairing must belong to the same account ('That computer is signed in to a different account.') (apps/web/features/remote-dispatch/lib/remote-dispatch-client.ts:25). |
| Permissions | Browser microphone permission; Desktop on the computer must accept tasks (computers needing an update are flagged 'update Desktop on it to send tasks') (RemoteComputerPage.tsx:37-39). |
| Subscription | Dictation on Free draws on the same 10 minutes a month as live voice (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:594-652; packages/contracts/types/src/model-catalog.ts:1255-1256). Paid plans: path through assertTierUnitAllowance for voice_minutes (route.ts:600). |
| Limits and metering | Task text limited by REMOTE_CODE_LIMITS.messageLength (RemoteComputerPage.tsx:358); dictation allowance as above. |
| Feature flags | Dictation switch (user setting) and DICTATION_CAPABILITY kill switch (apps/web/features/chat/hooks/use-dictation.ts:42-60; apps/web/app/api/voice/transcribe/route.ts:23). |
| Model compatibility | Not tied to the chat model. In the Code composer the chat model must be on the managed gateway for the mic button to be enabled (CodeComposer.tsx:1794-1798). |
| Provider restrictions | Dictation needs the managed transcription route; a non-managed destination disables it in the Code composer. |
| Local mode | Code composer: dictation is refused for non-Cloud destinations with 'Voice input requires a supported Cloud session.' The remote computer page checks only that a computer is connected, not a Local/Cloud mode (RemoteComputerPage.tsx:283-291) so dictation audio there still goes to the Cloud transcription route [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Not connected | Pairing form; dictation unavailable. | RemoteComputerPage.tsx:283-291, 400-430 |
| Computer went offline | 'Your computer went offline. This page reconnects when it is back.' | RemoteComputerPage.tsx:48 |
| Task not delivered | Error text and Send again; unconfirmed marker after 8 seconds and 3 attempts. | remote-dispatch-client.ts:28-34; RemoteComputerPage.tsx:54-56 |
| Dictation allowance spent | Upgrade offered instead of retry. | RemoteComputerPage.test.tsx:256-278 |
| Dictation off in settings | start() returns silently; no message on the remote page. | use-dictation.ts:147 |
| Passing failure | Retry without Upgrade. | RemoteComputerPage.test.tsx:306 |
| Connection replaced during dictation | Dictation becomes unavailable via isAvailable checks and is cancelled. | RemoteComputerPage.tsx:283-291; use-dictation.ts:253 |
| Disconnect | Confirmation dialog explaining the link stops working. | RemoteComputerPage.tsx:44-46, 235-245 |
| Phone width | App header with navigation button. | RemoteComputerPage.test.tsx:336 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/remote-dispatch/components/__tests__/RemoteComputerPage.test.tsx`: Disconnect confirm, per-connection task controls, dictation limit with Upgrade, plans fallback, retry for passing failure, layout.
- `apps/web/features/remote-dispatch/lib/remote-dispatch-client.test.ts`: Client (cases not read).
- `apps/web/features/chat/hooks/useDictation.test.tsx`: Dictation hook (cases not read).
- `apps/web/features/chat/lib/dictation-machine.test.ts`: Dictation state machine.
- `apps/web/features/chat/stores/voice-input-store.test.ts`: Capture store.
- `apps/web/__tests__/api/voice-transcribe.test.ts`: Transcribe route.
- `apps/web/app/api/voice/transcribe/__tests__/route.kill-switch.test.ts`: Dictation kill switch.
- `apps/web/features/code/components/CodeUsageRing.test.tsx`: Not about voice; listed to avoid confusion (usage ring only).

**Test scenarios**

- **Dictate a task**
  1. Pair a browser to Desktop on a computer.
  2. Open /code/computer, press 'Start voice input', say a short task, stop.
  3. Press 'Send to computer'.
  - Expected: Text appears in the box and the task is queued then shown running.
- **Dictation off**
  1. Turn off Dictation in Settings > Voice.
  2. Press the mic on the remote page.
  - Expected: Observed behaviour to be recorded; code suggests nothing happens.
- **Allowance spent**
  1. Use a Free account with the monthly minutes consumed.
  2. Press the mic and speak.
  - Expected: Strip shows the limit with Upgrade.
- **Code composer non-Cloud**
  1. Select a local or own-key model in Code.
  2. Hover the mic.
  - Expected: Disabled with 'Voice input requires a supported Cloud session.'
- **Computer offline**
  1. Quit Desktop on the paired computer.
  - Expected: 'Your computer went offline...' message and reconnect when back.

**Where to look when it fails**

- Dictation errors in the strip (e.g. 'That recording could not be transcribed. Try again.').
- Server: transcribe route kill-switch response; usage_events rows for dictation grants.
- Relay: connection errors 'The connection to your computer ended...' in the page.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/048-voice-conversation-interface.md](../../70-qa/test-plans/web/048-voice-conversation-interface.md)
- Desktop: [70-qa/test-plans/desktop/048-voice-conversation-interface.md](../../70-qa/test-plans/desktop/048-voice-conversation-interface.md)

## 10. Gaps and dependencies

- **The feature is dictation, not live voice, but the brief describes it as voice control** Affects: Documentation and testers. Evidence: apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:31, 283-299. Work needed: Reword S48.40.
- **Mic button on the remote page may do nothing when dictation is switched off** Affects: Web users with dictation off. Evidence: apps/web/features/chat/hooks/use-dictation.ts:147; RemoteComputerPage.tsx:383-392. Work needed: Disable with a reason or explain.
- **No mobile control** Affects: iPhone. Evidence: no remote-dispatch usage in apps/mobile; doc: docs/product/experience-contract.md:641-642. Work needed: Decide whether needed; feature is off on mobile in v1.
- **Remote dictation on the pairing page ignores Local/Cloud mode in the checks read** Affects: Local-mode users. Evidence: RemoteComputerPage.tsx:283-291. Work needed: Confirm that audio leaving the device on this page is acceptable and labelled.
- **Voice commands are text only; the code does not parse spoken commands specially** Affects: Spec wording. Evidence: RemoteComputerPage.tsx:292-298. Work needed: Not traced further beyond dictation.
- Not built on: Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- provider:openai
- plan:free
- SYS-voice-and-media
- SYS-sync-and-continuity
- SYS-agents-tools-and-automation
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- F048-10

## Unknown

- What the relay stores and for how long; the signaling service was not opened.
- How Desktop on the computer shows or logs a voice-originated task; Desktop side not read.
- Whether the Code composer dictation also covers remote developer sessions beyond Cloud code sessions.
- Whether the brief intended live voice rather than dictation for S48.40.
- Which model Desktop uses to run a remote task.
- Whether mobile has any dispatch client elsewhere (search limited to apps/mobile/src and app).
