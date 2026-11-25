---
id: "F048-05"
type: "feature"
title: "Push-to-talk and interrupting the reply"
aliases: ["Push-to-talk", "Hold to talk", "Hold the orb to speak", "Barge-in", "Interrupt the assistant", "Talk over the assistant", "Stop the task", "Stop the task and keep talking", "Do not send that"]
area: "48 Voice conversation interface"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S48.12", "S48.14", "S48.41"]
depends_on: ["surface:mobile", "surface:web", "surface:desktop", "surface:cli", "mode:local", "mode:cloud", "mode:own-key", "F048-01", "F048-03", "F048-04", "SYS-voice-and-media", "SYS-local-inference", "SYS-agents-tools-and-automation", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F048-05 Push-to-talk and interrupting the reply

Mobile's on-device voice companion has hold-to-talk. Web live voice has no push-to-talk. Interrupting is a provider-side behaviour on live calls: mobile shows a 'Go ahead' state when the person talks over the reply, web has no equivalent. Stopping the running task is separate from ending the call on web and mobile. The CLI has hold-to-record dictation.

Area: [48. Voice conversation interface](README.md). Requirement items: [S48.12](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4812), [S48.14](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4814), [S48.41](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4841).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the person record only while a control is held, interrupt the assistant by speaking or tapping, and stop a running task without hanging up.

**Why it exists.** Noisy places need push-to-talk. Natural conversation needs interruption. A wrong or long task needs a stop that does not end the call.

**Who uses it.** Mobile users in noisy places; anyone who changes their mind mid-answer; CLI users dictating.

**Problems it solves**

- Background noise sending false turns.
- Having to wait for a long reply to finish.
- Having to hang up to cancel a tool run.

**Use cases**

- On the mobile companion, hold the orb, speak, release to send.
- Say 'wait' over the reply on mobile live voice and see 'Go ahead'.
- Press 'Stop the task' on web to cancel a running action but keep talking.
- In the CLI, hold SPACE to record and press Enter to stop.

## 2. User experience

**Where to find it**

- Mobile push-to-talk: Settings > Voice, mode 'Push to talk' ('Hold the orb to speak, release to send.') and the hand icon on the companion screen labelled 'Switch to push-to-talk mode' (apps/mobile/src/features/settings/voice/index.tsx:45-60; apps/mobile/app/(app)/voice.tsx:653-672). Default is off (apps/mobile/stores/settingsStore.ts:132).
- Mobile live bar: 'Stop the task and keep talking' (LiveVoiceBar.tsx:674).
- Web: 'Stop the task' button in the agent status row (VoiceModeSurface.tsx:595-607) and 'Do not send that' on the pending-utterance chip (VoiceModeSurface.tsx:39-40, 385-399).
- CLI: SPACE to record, Enter or release to stop, Escape to cancel (voice.rs:735-765).

**Before you start**

- A call or the companion screen; for push-to-talk the 'Push to talk' mode must be on (mobile).

**Screens and controls**

- Companion orb: onPress, onPressIn, onPressOut (voice.tsx:CompanionOrb at 118-142; useVoiceConversation.ts:299-330).
- Phase text in push-to-talk: 'Hold to talk' when idle and 'Release to send' while listening (voice.tsx:82-92).

**Journey**

1. Push-to-talk (mobile companion): 1. turn the mode on. 2. press and hold the orb; if the assistant is speaking, its speech stops. 3. speak. 4. release; the audio is transcribed on the device and sent as a turn. 5. the reply is spoken.
2. Interrupt on live voice (mobile): 1. the assistant speaks. 2. the person talks. 3. the app sees user words arriving while the assistant is speaking and shows 'Go ahead'.
3. Stop the task (web, mobile live): 1. a tool runs and the status row appears. 2. press 'Stop the task'. 3. pending work is ended, the live model is told the task stopped, and the call stays open.

**What the person sees and gets**

- Web stop-task hint 'Stops the running action and keeps the call open.' (VoiceModeSurface.tsx:44-45).
- Mobile companion label 'Voice paused when AGI left the foreground.' if the app leaves the screen (useVoiceConversation.ts:370-395).
- CLI prints '(recording too short, skipped)' under 300 ms and '(max recording time 120s reached)' (voice.rs:~196, 735-740).

**Settings**

- Mobile voicePushToTalk (settingsStore.ts:132); Auto-listen is forced off when push-to-talk is on (useVoiceConversation.ts:~395).
- CLI --voice-lang.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Mobile companion push-to-talk: press in starts capture (and stops any speech first), press out stops and processes (useVoiceConversation.ts:312-330; test VoiceConversationPtt.test.tsx:268).
- Mobile companion tap-to-interrupt: tapping the orb while the assistant speaks stops the speech and starts listening (useVoiceConversation.ts:299-310).
- Mobile live: user transcript arriving while the assistant is speaking sets interrupted and clears speaking (apps/mobile/src/features/voice/services/liveVoiceSession.ts:726-731; test live-voice-session.test.ts:303; label LiveVoiceBar.tsx:177-178).
- Cancel the task without ending the call: web cancelBackendWork ends pending delegations, cancels function tools and appends an instruction that the user stopped the task (live-voice-session.ts:58-59, 1187-1200; use-voice-session.ts:974-977). Mobile exposes the same through onStopTask (LiveVoiceComposer.tsx:62).
- Web 'Do not send that' cancels a pending utterance before it is sent (VoiceModeSurface.tsx:385-399; reducer event cancelUtterance in voice-session-machine.ts).
- CLI hold-to-record dictation with a 300 ms minimum and 120 s maximum (voice.rs:35-47, 735-765).

**Incomplete**

- Web barge-in: the reducer has a bargeIn event and advanceBargeIn helper, but no web code calls them (packages/ui/unified-chat/src/voice/voice-session-machine.ts:156, 301; searched apps/web and packages/ui). Whether the provider stops the reply itself when the person talks is unknown.
- Provider cannot cancel a Responses delegation; only closing the session cancels queued backend work, so 'Stop the task' ends the tools this app runs and tells the model to drop the result (live-voice-session.ts:1181-1186).
- No control stops only the spoken audio on web; mute only stops the microphone.

**Present but disconnected or switched off**

- Push-to-talk is off by default on mobile (settingsStore.ts:132).
- The desktop Tauri code has bargeInEnabled and bargeInSensitivity settings defaulting to off, but the public Desktop shows the hosted web app (apps/desktop/src/stores/settings/voice.ts:36, 59; AGENTS.md section 5).

**Not available**

- Web and Desktop push-to-talk: none found.
- Mobile live voice push-to-talk: none found; only the on-device companion has it.
- VS Code and Chrome: no call.

## 4. Required behaviour

**Established requirements**

- A push-to-talk mode records only while a key or button is held and sends on release. (source: brief S48.12)
- Speaking while the assistant talks interrupts its spoken reply. (source: brief S48.14)
- The user can stop the spoken reply without cancelling the underlying task, and cancel the task separately. (source: brief S48.41)
- Distinguish dictation, read-aloud, push-to-talk and live conversation; test interruptions and turn-taking. (source: doc: docs/product/competitive-guidance.md:399-408 (items 121, 122))

**Acceptance criteria**

1. With push-to-talk on, mobile records nothing until the orb is held and sends on release.
2. Tapping the orb while the companion speaks stops the speech.
3. On mobile live voice, talking over the assistant shows 'Go ahead' and the assistant's reply stops [reply stop: unverified].
4. On web, pressing 'Stop the task' keeps the call open and the assistant does not speak the stopped task's result.
5. A recording under 300 ms in the CLI is skipped.
6. Web push-to-talk is absent and is not claimed.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Web barge-in should be measured with a real call before being marked done [inferred from the unused helper].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'Stop speaking' control on web and mobile live that silences only the reply.
- [proposed] Add push-to-talk for web as hold-Space on the orb.
- [proposed] Wire advanceBargeIn or delete it so the code does not suggest a feature that is not connected.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | useVoiceConversation | `apps/mobile/src/features/voice/hooks/useVoiceConversation.ts` | Orb press, press-in, press-out, speech stop, auto-listen. |
| screen | Voice companion | `apps/mobile/app/(app)/voice.tsx` | Push-to-talk toggle and orb handlers. |
| store | settingsStore voicePushToTalk | `apps/mobile/stores/settingsStore.ts` | Preference, default false. |
| screen | Mobile voice settings | `apps/mobile/src/features/settings/voice/index.tsx` | Conversation mode switch. |
| service | liveVoiceSession interruption | `apps/mobile/src/features/voice/services/liveVoiceSession.ts` | Marks interruption (726-731). |
| component | LiveVoiceBar | `apps/mobile/src/features/voice/components/LiveVoiceBar.tsx` | 'Go ahead' state and 'Stop the task and keep talking'. |
| service | LiveVoiceSession.cancelBackendWork | `apps/web/features/chat/lib/live-voice-session.ts` | Cancels tool work and tells the model (1187-1200). |
| component | VoiceModeSurface stop and cancel controls | `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx` | 'Stop the task' and 'Do not send that'. |
| service | voice-session-machine | `packages/ui/unified-chat/src/voice/voice-session-machine.ts` | bargeIn event and advanceBargeIn helper (not called by web). |
| command | record_audio | `apps/cli/src/voice.rs` | CLI hold-to-record loop. |
| service | holdToTalk | `apps/mobile/src/features/voice/holdToTalk.ts` | File exists; not opened. |
| component | VoiceInputButton | `apps/mobile/src/features/voice/components/VoiceInputButton.tsx` | Mobile dictation hold button; not opened. |
| test | VoiceConversationPtt | `apps/mobile/__tests__/VoiceConversationPtt.test.tsx` | Push-to-talk and hands-free tests. |
| test | live-voice-session mobile | `apps/mobile/__tests__/live-voice-session.test.ts` | Interruption test (303). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Mobile companion: hold starts on-device speech recognition capture. | device | useVoiceConversation.ts:312-322, 199-260 |
| Release stops capture; text is produced on the device and sent as a normal chat message to the selected model (local or Cloud). | device and our servers | voice.tsx:259-281, 82-100 |
| The reply is spoken by the device voice. | device | useVoiceConversation.ts:140-160; voice.tsx speechOptions |
| Live interrupt: provider streams the user's transcript while it is speaking; the app marks interruption. | outside service | liveVoiceSession.ts:726-731 |
| Stop the task: the app cancels its own tool calls and sends an instruction event so the live model drops the result. | device | live-voice-session.ts:1187-1200 |
| CLI: records audio with cpal, encodes a WAV, transcribes via the chosen backend, shows text, sends on Enter. | device and our servers | voice.rs:176-262 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| CLI recording WAV | temporary owner-only folder | No | Removed with its folder; stale ones swept (voice.rs:884-930; tests at 1405-1445) |
| Push-to-talk preference | mobile settings store | No evidence of sync | Device |

**Models and providers.** Mobile companion uses on-device recognition and speech plus the chat model selected for the conversation (voice.tsx:82-100). CLI uses the AGI account transcription, an OpenAI-style key, or a local speech binary; the transcription model is read from a shared routing slot, not typed in the file (voice.rs:1015-1025; test at 1511). No identifiers recorded.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Mobile companion: none for on-device speech; the reply needs the chosen model (Cloud needs sign-in). CLI: AGI account for the managed backend, or none with a local binary (voice.rs:427-445). |
| Permissions | Microphone. CLI asks for agreement before recording (voice.rs:379-425). |
| Subscription | Mobile companion voice capability is gated by canUseVoice (voice.tsx:195-196, 590-595). Live stop-task follows the live voice allowance. CLI managed transcription is billed to the account [inferred from the 'Managed' backend label at voice.rs:108-115]. |
| Limits and metering | CLI: 300 ms minimum, 120 s maximum, sample cap 96000*2*120 (voice.rs:35-47). |
| Feature flags | 'canUseVoice' capability on mobile (voice.tsx:195). |
| Model compatibility | Stop-task relies on the provider having no cancel command; documented in code (live-voice-session.ts:1181-1186). |
| Provider restrictions | CLI Local privacy mode blocks cloud transcription unless AGIWORKFORCE_VOICE_ALLOW_CLOUD=1 (voice.rs:55-100, 458-510). |
| Local mode | Mobile Local mode: push-to-talk works fully on the device with a local model, labelled 'Answering on this device' (voice.tsx:90-97). CLI Local: a local speech binary, else voice is refused with guidance (voice.rs:117-135). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Release before capture is ready | Capture stops immediately if the hold ended. | useVoiceConversation.ts:260-265 |
| Muted in the companion | Hold does nothing; the phase says 'Microphone is muted'. | voice.tsx:84-86; VoiceConversationPtt.test.tsx:401 |
| App leaves foreground | Voice stops and the preview says 'Voice paused when AGI left the foreground.' | useVoiceConversation.ts:370-395 |
| Recognizer not on device | The companion screen redirects to chat. | voice.tsx:144-170 |
| CLI terminal without key release | Enter stops recording. | voice.rs:743-755 |
| CLI transcription fails | Retry offered. | voice.rs:207-224 |
| Stop the task with nothing running | The control is only shown while there is activity. | VoiceModeSurface.tsx:586-610 |
| Barge-in on web | not handled in the code | No web caller of bargeIn or advanceBargeIn found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/VoiceConversationPtt.test.tsx`: Companion push-to-talk, hands-free, muted wording, typed text.
- `apps/mobile/__tests__/VoiceConversationSpeechOwnership.test.tsx`: Speech ownership between companion turns.
- `apps/mobile/__tests__/live-voice-session.test.ts`: Interruption reported when the user speaks over the assistant.
- `apps/mobile/__tests__/LiveVoiceBar.test.tsx`: Talk-over hint text.
- `apps/mobile/__tests__/voice-service-natural-stop.test.ts`: Natural stop of speech service.
- `packages/ui/unified-chat/src/voice/voice-session-machine.test.ts`: advanceBargeIn thresholds.
- `apps/web/features/chat/components/Voice/VoiceModeSurface.test.tsx`: Taking back a pending utterance.
- `apps/cli/src/voice.rs`: Rust tests for recording storage, cloud gate and backend selection.

**Test scenarios**

- **Hold to talk on mobile**
  1. Turn on Push to talk.
  2. Open the companion.
  3. Hold the orb, say a sentence, release.
  - Expected: Text is sent only on release and the reply is spoken.
- **Tap to interrupt**
  1. Let the companion speak.
  2. Tap the orb.
  - Expected: Speech stops and listening starts.
- **Talk over live reply**
  1. Start mobile live voice.
  2. While the assistant speaks, talk.
  - Expected: Label becomes 'Go ahead'; record whether the audio actually stops.
- **Stop the task**
  1. Ask for a long action on web.
  2. Press 'Stop the task'.
  - Expected: Status row disappears, call stays open, assistant does not announce the result.
- **CLI recording limits**
  1. Run /voice.
  2. Tap SPACE very briefly.
  3. Then hold SPACE and press Enter.
  - Expected: First is skipped as too short; second is transcribed and shown for confirmation.

**Where to look when it fails**

- Mobile voice failure classes in voiceFailure.ts.
- Web console warnings from stop-task or tool bridge.
- CLI stderr lines starting 'voice:'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/048-voice-conversation-interface.md](../../70-qa/test-plans/web/048-voice-conversation-interface.md)
- Desktop: [70-qa/test-plans/desktop/048-voice-conversation-interface.md](../../70-qa/test-plans/desktop/048-voice-conversation-interface.md)
- Mobile: [70-qa/test-plans/mobile/048-voice-conversation-interface.md](../../70-qa/test-plans/mobile/048-voice-conversation-interface.md)
- CLI: [70-qa/test-plans/cli/048-voice-conversation-interface.md](../../70-qa/test-plans/cli/048-voice-conversation-interface.md)

## 10. Gaps and dependencies

- **Web and desktop have no push-to-talk.** Affects: Web and Desktop users in noisy places.. Evidence: No code found; brief S48.12.. Work needed: Design and build, or mark not planned.
- **Barge-in is not verified on any surface; the web reducer path is unused.** Affects: All live voice users.. Evidence: voice-session-machine.ts:156, 301 with no caller; liveVoiceSession.ts:726-731 only reports it.. Work needed: Run a real call and record whether reply audio stops; wire or remove the helper.
- **No separate 'stop speaking' control.** Affects: Web and mobile live.. Evidence: VoiceModeSurface.tsx, LiveVoiceBar.tsx have only stop-task and mute.. Work needed: Add the control or document that mute and stop-task are the only options.
- **Push-to-talk exists only in the on-device companion, not live voice.** Affects: Mobile live users.. Evidence: useLiveVoiceSession.ts has no hold handling.. Work needed: Decide scope.

**Depends on**

- surface:mobile
- surface:web
- surface:desktop
- surface:cli
- mode:local
- mode:cloud
- mode:own-key
- F048-01
- F048-03
- F048-04
- SYS-voice-and-media
- SYS-local-inference
- SYS-agents-tools-and-automation
- SYS-execution-boundaries

## Unknown

- Whether the provider stops the reply audio itself when the person speaks (no code or test in this repo records it).
- Whether the mobile dictation hold button (VoiceInputButton.tsx) and holdToTalk.ts are the push-to-talk the brief cites; neither was opened.
- Whether the CLI voice build is exercised in CI with a microphone.
- Whether the stopped task result is really suppressed by the provider after the instruction.
