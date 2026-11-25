---
id: "F071-05"
type: "feature"
title: "Voice conversation"
aliases: ["Live voice", "Voice mode", "Start voice mode", "Voice conversation", "Voice screen", "Voice orb", "Push-to-talk", "Turn-based voice", "Voice bar", "Audio route", "Audio-route controls", "S71.10", "S71.11"]
area: "71 Mobile application"
available_on: ["mobile"]
implementation: {web: "n/a", desktop: "n/a", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S71.10", "S71.11"]
depends_on: ["surface:mobile", "mode:local", "mode:cloud", "api:POST /api/voice/live/sessions", "api:POST /api/voice/speech", "SYS-voice-and-media", "SYS-local-inference", "SYS-subscriptions-entitlements-and-usage", "SYS-inference-providers", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F071-05 Voice conversation

Talking to the assistant in AGI Mobile. In a signed-in Cloud chat a live two-way session runs through AGI Cloud. In Local chats, or when signed out, a turn-based bar listens with on-device speech recognition. A separate voice screen has an orb and push-to-talk. On iOS the person can choose the audio output route.

Area: [71. Mobile application](README.md). Requirement items: [S71.10](../../10-requirements/capabilities/071-mobile-application.md#s7110), [S71.11](../../10-requirements/capabilities/071-mobile-application.md#s7111).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | built | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Starts hands-free voice. Live mode streams audio both ways over a real-time connection with tool calls and approvals. Turn-based mode turns speech into text on the phone, sends it to the selected model and speaks the answer.

**Why it exists.** The brief wants a full-duplex spoken conversation inside a chat (S71.10) and audio output route choice (S71.11). (doc: knowledge-base/data/area-briefs/071-mobile-application.md) The product requirements ask the app to tell dictation from live voice and show why voice is unavailable. (doc: docs/product/requirements.md M-US-005)

**Who uses it.** People who want hands-free chat, for example while walking or driving, in Cloud or Local mode.

**Problems it solves**

- Typing is hard on the move.
- People want to interrupt the assistant while it talks.
- Voice should still work offline for Local answers.

**Use cases**

- Tap Start voice mode in a Cloud chat and talk naturally, interrupting the reply.
- Use turn-based voice in a Local chat with no signed-in account.
- Switch to the speaker or a Bluetooth headset on iOS during a live call.
- Hold the orb to talk and release to send.

## 2. User experience

**Where to find it**

- Mobile chat composer: when the box is empty the send slot shows the control 'Start voice mode' (hint 'Opens hands-free voice conversation') (apps/mobile/src/features/chat/components/ChatInput.tsx:2278-2300). It is hidden when voice mode is not available on the device (chat/[id].tsx:2747).
- Voice screen: route /(app)/voice, from Settings voice (apps/mobile/src/features/settings/voice/index.tsx:519) or the 'voice' intent link (apps/mobile/app/_layout.tsx:218-224).
- Live bar controls: 'Mute microphone' / 'Unmute microphone', 'Type instead' (label 'Switch to text for this chat'), 'End live voice', 'Try live voice again', 'Type a message instead' (apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:397-418, 704-746).
- Audio route picker inside the live bar, iOS only (LiveVoiceBar.tsx:721; apps/mobile/src/features/voice/components/AudioRoutePicker.tsx).

**Before you start**

- Microphone permission; speech recognition permission on iOS (apps/mobile/app.config.js:166-170).
- Live mode: a signed-in account, a Cloud chat, a native build with the real-time module, an HTTPS server, and the voice capability on (apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:21-45).
- Turn-based mode: on-device recognizer; on Android needs API level 33 or higher (apps/mobile/src/features/voice/services/voiceInput.ts:289-292).

**Screens and controls**

- First use: an onboarding sheet, then a voice picker sheet (chat/[id].tsx:1720-1745).
- Live bar: transcript, orb, call time, captions, pause, mute, 'Type instead', 'End live voice', tool approval Allow and Deny, 'Stop the task and keep talking'.
- Turn-based inline bar: 'Start listening', mute, keyboard and exit controls (apps/mobile/src/features/voice/components/VoiceInlineBar.tsx:41-45).
- Voice screen: orb with phase text 'Tap to speak', 'Listening...', 'Thinking...', 'Speaking...', in push-to-talk 'Hold to talk' and 'Release to send', a typed composer, a toggle 'Switch to push-to-talk mode' / 'Switch to hands-free mode' (apps/mobile/app/(app)/voice.tsx:65-95, 495-515, 673).

**Journey**

1. Tap Start voice mode. First time: read the intro, choose a voice, continue.
2. In a signed-in Cloud chat the live bar opens and connects. Otherwise the inline bar opens, with a notice such as 'Live voice runs in AGI Cloud, so Local Mode stays turn based.'
3. Speak. The orb and captions follow; in live mode you may interrupt.
4. In live mode the assistant may call tools; approve or deny when asked.
5. End with 'End live voice' or leave the screen. The session closes and its minutes settle.
6. On a dropped connection the bar says 'Reconnecting live voice...' and retries up to 3 times.

**What the person sees and gets**

- Phase and status text in the bar: 'Reconnecting live voice...', 'Muted, tap the mic to talk', 'Speaking, talk any time to interrupt', 'Listening' (LiveVoiceBar.tsx:166-179).
- Voice screen thinking line: 'Sending to AGI Cloud' for a Cloud model or 'Answering on this device' (voice.tsx:90-95).
- Messages for failures: 'Microphone access was denied. Allow the microphone to use live voice.', 'The live voice connection could not be established.' and others (liveVoiceAvailability.ts:5-15).
- Audio route notice: 'Could not switch audio to <route>. This call may use a different output.' (apps/mobile/src/features/voice/services/audioRoute.ts:70-72).

**Settings**

- Settings, Voice: input on or off, push-to-talk, speech language, voice and preview (apps/mobile/src/features/settings/voice/index.tsx).
- Audio route stored as audioRoute in the settings store: Automatic, Speaker, Bluetooth, Headset (audioRoute.ts:8-25).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Live eligibility: only an execution mode of Cloud and a signed-in user; otherwise a reason string and the turn-based bar (apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:21-28; apps/mobile/app/(app)/chat/[id].tsx:1697-1718).
- Live session over WebRTC: offer sent to POST /api/voice/live/sessions, answer applied, data channel for events; ICE gathering waits up to 10 s; tool calls time out after 20 s (apps/mobile/src/features/voice/services/liveVoiceSession.ts:30, 37, 343; liveVoiceAuthority.ts:14).
- Microphone denial and connection failures map to specific messages (liveVoiceSession.ts:171-176).
- Reconnect: up to 3 attempts with 1 s, 2 s, 4 s waits; time extension requested before the budget ends; session settled on close (apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:66-72, 229-293, 405-430).
- Server session start checks rate limit, entitlement bundle, capability canUseVoice, plan voice permission, a voice budget (402) and a voice-minutes allowance, and opt-out of training rules (apps/web/app/api/voice/live/sessions/route.ts:178-380).
- Turn-based voice: on-device recognition is required (requiresOnDeviceRecognition true) and never falls back to server recognition (apps/mobile/src/features/voice/services/voiceInput.ts:306-312, 438, 493).
- Voice screen: orb, phase labels, push-to-talk, typed fallback and file import; it ends the conversation on close (apps/mobile/app/(app)/voice.tsx:65-95, 395-425).
- Audio route selection exists: four routes, iOS only, applied through the audio session category, shown in the live bar, with tests (audioRoute.ts:1-80; LiveVoiceBar.tsx:721). This contradicts the brief status 'not applicable'.
- Plan or switch gate: starting voice checks the canUseVoice capability and shows 'Voice is unavailable' with the text 'It's paused while we fix an issue and will come back without an update.' when off (chat/[id].tsx:1697-1700; apps/mobile/src/lib/Capabilities.tsx:156-157).

**Incomplete**

- On Android below API 33 the voice button is hidden for chats that need turn-based voice, and startVoiceMode returns without a message if reached (chat/[id].tsx:1706; voiceInput.ts:289-292).
- Audio route picker is absent on Android: audioRouteSwitchingSupported is true only on iOS (audioRoute.ts:56-58).

**Present but disconnected or switched off**

- Live voice also needs a native WebRTC module; without it the app says 'Live voice needs a native build of this app, so voice stays turn based here.' (liveVoiceAvailability.ts:5-15, 36-42).

**Not available**

- Audio route choice on Android.
- Voice on Web, Desktop, CLI, VS Code, Chrome is a separate feature; not part of this page.

## 4. Required behaviour

**Established requirements**

- The user can hold a full-duplex spoken conversation with the assistant inside a chat. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.10)
- During voice the user can choose the audio output route (speaker, Bluetooth, headset) and the session switches. The brief marks this not applicable anywhere. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.11)
- The app distinguishes dictation from live voice; permission prompts use native expectations; if live voice is unavailable the app says so without broken controls. (source: docs/product/requirements.md M-US-005 (doc: docs/product/requirements.md))
- Local inference on mobile is free of any paid subscription; sign-in is a separate question. (source: Product context given to this task)

**Acceptance criteria**

1. Start voice mode in a signed-in Cloud chat opens the live bar and a spoken question gets a spoken answer.
2. In a Local chat the same control opens the turn-based bar with the notice naming Local mode.
3. With the microphone denied, a clear message appears and nothing is left recording.
4. Dropping the network shows 'Reconnecting live voice...' and ends in an error with 'Try live voice again' after 3 failures.
5. On iOS the audio route picker shows four routes and a switch changes the output; on Android no picker shows.
6. With the voice capability off, the control shows 'Voice is unavailable'.
7. Ending the session settles minutes and no further audio is sent.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Voice in Local mode should not depend on a paid plan; the code checks canUseVoice for every mode, so a plan document that denies voice would also stop Local voice. [inferred from chat/[id].tsx:1648, 1697-1700 and useCapability in apps/mobile/src/lib/Capabilities.tsx:126-134]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Skip the plan capability check for on-device voice and keep the operator switch only.
- [proposed] Show a message when Android below API 33 cannot start turn-based voice instead of hiding or ignoring the tap.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LiveVoiceComposer | `apps/mobile/src/features/voice/components/LiveVoiceComposer.tsx` | Mounts the live bar and the session hook for a chat. |
| hook | useLiveVoiceSession | `apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts` | Session lifecycle, reconnect, budget extension, audio route apply. |
| service | liveVoiceSession | `apps/mobile/src/features/voice/services/liveVoiceSession.ts` | WebRTC session, events, tool bridge, settlement. |
| service | liveVoiceAuthority | `apps/mobile/src/features/voice/services/liveVoiceAuthority.ts` | Account-bound fetch for the session path and close. |
| service | liveVoiceAvailability | `apps/mobile/src/features/voice/services/liveVoiceAvailability.ts` | Rules for when live voice may start and the messages. |
| component | LiveVoiceBar | `apps/mobile/src/features/voice/components/LiveVoiceBar.tsx` | Live voice UI with transcript, tools, approvals, mute, end. |
| component | AudioRoutePicker | `apps/mobile/src/features/voice/components/AudioRoutePicker.tsx` | Route choice (iOS). |
| service | audioRoute | `apps/mobile/src/features/voice/services/audioRoute.ts` | Route list, labels, audio session categories. |
| component | VoiceInlineBar and useInlineVoiceBar | `apps/mobile/src/features/voice/components/VoiceInlineBar.tsx` | Turn-based voice bar in the chat. |
| screen | Voice screen | `apps/mobile/app/(app)/voice.tsx` | Orb, phases, push-to-talk, typed fallback. |
| service | voiceInput | `apps/mobile/src/features/voice/services/voiceInput.ts` | On-device speech recognition and the Android version floor. |
| service | voiceOutput and tts | `apps/mobile/src/features/voice/services/voiceOutput.ts` | Speaking replies with a device or server voice. |
| screen | Chat screen voice entry | `apps/mobile/app/(app)/chat/[id].tsx` | startVoiceMode, capability check, onboarding, which bar to show. |
| endpoint | POST /api/voice/live/sessions | `apps/web/app/api/voice/live/sessions/route.ts` | Creates a live session after entitlement and budget checks. |
| endpoint | Session close, extend, settings, tools, active | `apps/web/app/api/voice/live/sessions` | Folders [sessionId]/close, extend, settings, tools and active exist (methods not read). |
| config | Capability matrix and documents | `packages/contracts/types/src/capabilities.ts` | canUseVoice capability definition. |
| test | Live voice tests | `apps/mobile/__tests__/live-voice-session.test.ts` | Session setup, cancellation and consent. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person taps Start voice mode; the app checks the capability, mode and sign-in. | device | chat/[id].tsx:1697-1718 |
| Live: the app asks for Cloud consent, opens the microphone, creates a WebRTC offer and posts it to our servers. | device and our servers | liveVoiceSession.ts:20-24, 343; apps/web/app/api/voice/live/sessions/route.ts:178-380 |
| Our server picks the live model from a routing slot, checks plan and budget, reserves usage, and returns an answer to the offer. | our servers | route.ts:185-230, 296-380 |
| Audio flows between the phone and the live model service; the provider behind the slot is chosen by our server. | outside service | route.ts:191-210 (slot resolves to a managed provider); provider name not established |
| Tool calls from the live model go through our server's tool route and may wait for approval on the phone. | device and our servers | liveVoiceSession.ts:44-52, 188-196; liveVoiceToolCallPath in packages/contracts/cloud-contracts/src/live-voice-tools.ts:71 |
| Turn-based: speech is recognised on the phone, sent as a normal chat turn to the selected model, and the answer is spoken. | device | voice.tsx:272; voiceInput.ts:438, 493; reply source depends on mode (Local on device, Cloud on our servers) |
| On close the session settles minutes with our servers. | device and our servers | liveVoiceSession.ts:403, 817; useLiveVoiceSession.ts:240 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Live audio and transcript turns | transcript held in memory in the bar; server session record in a voice session store | server side store exists (apps/web/app/api/voice/live/sessions/lib/voice-session-store.ts); retention not read | unknown |
| Voice minutes used | our servers (usage and budget records) | yes | per usage policy; not read |
| Audio route, push-to-talk and voice settings | settings store on the device | unknown | until app data is cleared |
| Turn-based transcript | becomes ordinary chat messages in the Local or Cloud store | as chats are | as chats are |

**Models and providers.** Live voice uses a model chosen on the server by a routing slot named in the route code, and a backend reasoning model chosen by plan (route.ts:185-230, 319-321). The provider is not named in the mobile code. Turn-based voice uses whichever chat model is selected, Local or Cloud (voice.tsx:90-95). Recognition is always on the device.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Live voice: signed in (liveVoiceAvailability.ts:25-27). Turn-based: none in Local. |
| Permissions | Microphone (all modes); speech recognition permission on iOS; Bluetooth route selection uses the audio session (app.config.js:166-170; audioRoute.ts). |
| Subscription | Server checks the canUseVoice capability, plan voice permission (403) and voice budget (402) and voice minutes allowance; a free allowance path exists for some plans (route.ts:296-380). The phone also checks canUseVoice before starting any voice (chat/[id].tsx:1648, 1697-1700). |
| Limits and metering | Voice minutes are metered per session in blocks with extensions requested before the budget ends (useLiveVoiceSession.ts:262-293; route.ts:366-372). Route rate limit 'voice-live-session' (route.ts:178). |
| Feature flags | Operator switch for canUseVoice (Capabilities.tsx:126-157); FEATURES flags not used by the live hook in the lines read. |
| Model compatibility | Live model comes from the server slot and must keep inputs out of training when the account demands it (route.ts:325-338). Turn-based works with any chat model. |
| Provider restrictions | Server refuses a model that may train on user data in some cases ('model_may_train', 403) (route.ts:325-338). Provider choice is not in the app. |
| Local mode | Turn-based voice with on-device recognition and a device voice; the answer comes from the Local model. Live mode is refused with 'Live voice runs in AGI Cloud, so Local Mode stays turn based.' The canUseVoice capability check still applies [inferred gap]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Signed out or Local chat | Turn-based inline bar with a notice string. | liveVoiceAvailability.ts:17-28; chat/[id].tsx:1706-1718 |
| Capability off | Alert 'Voice is unavailable' with the paused text. | chat/[id].tsx:1697-1700 |
| Android older than API 33 | Voice button hidden when mode is unavailable; start returns silently. | chat/[id].tsx:1706, 2747; voiceInput.ts:289-292; test:apps/mobile/__tests__/voice-on-device-android-version.test.ts |
| Microphone denied | Specific message; live code stops a microphone granted after cancel. | liveVoiceSession.ts:171-176; test live-voice-session.test.ts |
| Setup timeout | ICE gathering ends after 10 s and the session continues with what it has. | liveVoiceSession.ts:30, 185-200 |
| Tool call takes long | Times out at 20 s by default; the bar shows a slow suffix. | liveVoiceSession.ts:37; LiveVoiceBar.tsx:155 |
| Connection dropped | Reconnect up to 3 times with growing waits, then an error with retry or type. | useLiveVoiceSession.ts:66-67, 405-430 |
| App goes to background during live voice | A test covers background cancel; behaviour not read in detail. | test:apps/mobile/__tests__/LiveVoiceBackgroundCancel.test.tsx |
| Route cannot be applied | Call starts; notice shows the route that did not apply. | useLiveVoiceSession.ts:315-317; test LiveVoiceAudioRouteNotice |
| Cloud consent declined | No microphone opened and nothing sent. | test live-voice-session.test.ts |
| Screen reader | Mute, end and type buttons carry labels; call time has a label. | LiveVoiceBar.tsx:279, 704-746 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/live-voice-session.test.ts`: Microphone granted after cancel is stopped, close acknowledgement window, closing a known session on answer failure, no microphone when Cloud consent is declined.
- `apps/mobile/__tests__/live-voice-authority.test.ts`: Account-bound live voice authority (titles not read).
- `apps/mobile/__tests__/LiveVoiceBar.test.tsx`: Renders only when active, route notice rules, transcript stage and orb sizing.
- `apps/mobile/__tests__/LiveVoiceAudioRouteNotice.test.tsx`: Notice when the saved route fails, none when applied, none where switching is unsupported.
- `apps/mobile/__tests__/AudioRoutePicker.test.tsx`: Route categories, reading a route back from session options, no pretend switch on unsupported platforms, trigger label.
- `apps/mobile/__tests__/LiveVoiceBackgroundCancel.test.tsx`: Background cancel of live voice (titles not read).
- `apps/mobile/__tests__/voice-on-device-android-version.test.ts`: Android on-device floor and iOS unaffected.
- `apps/mobile/__tests__/VoiceConversationPtt.test.tsx`: Typed turns through the voice conversation, transcript, reading column, iPhone margin.
- `apps/mobile/__tests__/VoiceInlineBar.test.tsx`: Turn-based inline bar (titles not read).
- `apps/mobile/__tests__/VoiceOnboarding.test.tsx`: Voice onboarding sheet (titles not read).
- `apps/web/app/api/voice/live/sessions/route.test.ts`: Live session route (titles not read).

**Test scenarios**

- **Live voice in Cloud**
  1. Sign in, open a Cloud chat.
  2. Tap Start voice mode and complete the intro.
  3. Ask a question aloud, interrupt the answer, then tap End live voice.
  - Expected: Live bar shows Listening and Speaking states; interruption works; session closes.
- **Local turn-based voice**
  1. Switch to Local mode, open a chat with an installed model.
  2. Tap Start voice mode.
  - Expected: Inline bar opens with the Local mode notice; speech is recognised on the phone and the answer is spoken.
- **Permission denied**
  1. Deny the microphone in OS settings.
  2. Start live voice.
  - Expected: 'Microphone access was denied...' message.
- **Connection loss**
  1. Start live voice.
  2. Turn network off for 30 s.
  - Expected: 'Reconnecting live voice...' then an error with 'Try live voice again'.
- **Audio route on iOS**
  1. Pair a Bluetooth headset.
  2. In a live call open the route picker and choose Speaker, then Bluetooth.
  - Expected: Output follows the choice; on Android no picker appears.
- **Capability off**
  1. Use an account whose capability document denies voice, or an operator switch off.
  2. Tap Start voice mode in Local and Cloud chats.
  - Expected: Alert 'Voice is unavailable' (records whether Local is blocked).

**Where to look when it fails**

- Server: apps/web/app/api/voice/live/sessions/route.ts error codes (voiceJsonError) such as 'model_may_train' and plan codes.
- Client: LiveVoiceSessionError codes 'microphone_denied', 'microphone_failed', 'no_offer', 'http_<status>' (liveVoiceSession.ts:150-175).
- Settlement call settleLiveVoiceSession (liveVoiceSession.ts:817).

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/071-mobile-application.md](../../70-qa/test-plans/mobile/071-mobile-application.md)

## 10. Gaps and dependencies

- **The brief says audio route selection is not applicable, but it is built for iOS.** Affects: Mobile iOS (built) and Android (absent).. Evidence: apps/mobile/src/features/voice/services/audioRoute.ts:56-58; LiveVoiceBar.tsx:721. Work needed: Update the brief status; decide on an Android route control.
- **The canUseVoice plan check applies to on-device voice too.** Affects: Mobile Local-mode users on a plan whose capability document denies voice.. Evidence: apps/mobile/app/(app)/chat/[id].tsx:1648, 1697-1700; apps/mobile/src/lib/Capabilities.tsx:126-134. Work needed: Confirm whether any plan denies voice; if so, exempt on-device voice. Whether this can happen is unknown.
- **Android below API 33 gets no explanation when turn-based voice cannot start.** Affects: Older Android phones.. Evidence: chat/[id].tsx:1706; voiceInput.ts:289-292. Work needed: Show the 'On-device voice recognition is not available on this device.' message or a settings hint.
- **Voice entry from the intent link 'voice' falls back to the chat on older Android, with no message.** Affects: Older Android users using shortcuts.. Evidence: apps/mobile/app/_layout.tsx:218-224. Work needed: Add an explanation.

**Depends on**

- surface:mobile
- mode:local
- mode:cloud
- api:POST /api/voice/live/sessions
- api:POST /api/voice/speech
- SYS-voice-and-media
- SYS-local-inference
- SYS-subscriptions-entitlements-and-usage
- SYS-inference-providers
- SYS-security-and-privacy

## Unknown

- Which provider and model serve the live voice slot (resolved at run time from the model catalog).
- Retention of live voice transcripts and audio on our servers.
- Whether any plan's capability document denies voice, which would block Local voice.
- Whether the voice screen is reachable from a visible control other than Settings and intent links.
- How Android handles Bluetooth routing without the picker.
- What the close, extend, settings and tools routes accept (only the folders were listed).
- How voice behaves when the app is backgrounded beyond what the test titles say.
