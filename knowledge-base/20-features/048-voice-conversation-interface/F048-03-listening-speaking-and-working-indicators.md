---
id: "F048-03"
type: "feature"
title: "Listening, speaking and working indicators"
aliases: ["Orb", "Voice orb", "Listening indicator", "Speaking indicator", "Thinking indicator", "Working indicator", "Waveform", "Level visual", "Live bar status", "Agent status"]
area: "48 Voice conversation interface"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S48.05", "S48.06", "S48.07", "S48.08"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "F048-01", "F048-04", "SYS-shared-ui-and-design", "SYS-voice-and-media", "SYS-agents-tools-and-automation", "mode:cloud", "mode:local"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F048-03 Listening, speaking and working indicators

A round orb and status text show whether the assistant is connecting, listening, speaking, muted or working on a task, and the orb moves with the microphone or reply level. Web also announces state changes to screen readers. Mobile shows the same states in its live bar and companion screen.

Area: [48. Voice conversation interface](README.md). Requirement items: [S48.05](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4805), [S48.06](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4806), [S48.07](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4807), [S48.08](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4808).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Tells the person what the call is doing right now and follows the sound level so they can see they are heard.

**Why it exists.** In a spoken call there is no screen text to wait on; a clear state avoids talking over a busy assistant or wondering whether the microphone works.

**Who uses it.** Everyone on a voice call, including screen reader users and people who prefer less motion.

**Problems it solves**

- Is it listening me or thinking?
- Is a tool still running or did it stall?
- Is my microphone muted?

**Use cases**

- Watch the orb change from listening to speaking when the assistant answers.
- See 'Working on your request' with a Stop the task button while a tool runs.
- Hear 'Assistant is speaking' announced by a screen reader.
- On mobile see 'Speaking, talk any time to interrupt'.

## 2. User experience

**Where to find it**

- Web/Desktop: the orb in the voice surface above the composer row (VoiceModeSurface.tsx:290-300, 562-568), the call timer, and the agent status line (574-610).
- Mobile live: LiveVoiceBar status text, orb, glow and waveform (LiveVoiceBar.tsx:164-181; components VoiceOrb.tsx, VoiceStateGlow.tsx, Waveform.tsx).
- Mobile companion: orb with phase label and sublabel (voice.tsx:75-100).
- CLI: a 'REC' line with a level meter while recording and spinners 'Transcribing...' and 'Thinking...' (voice.rs:766, 846, 203, 261).

**Before you start**

- A running call. Indicators need no setting.

**Screens and controls**

- Orb states: idle, listening, thinking, speaking, muted with labels '', 'Listening', 'Thinking', 'Speaking', 'Muted' (packages/ui/unified-chat/src/voice/voice-session-machine.ts:232-238).
- Web shows thinking when the backend is busy while the state is listening (apps/web/features/chat/components/Voice/VoiceOrb.tsx:26-29).
- Web agent status shows the tool label or 'Working on your request', a spinner, and a 'Stop the task' button with hint 'Stops the running action and keeps the call open.' (VoiceModeSurface.tsx:40-45, 574-610).
- Web slow tool: the label plus 'is taking longer than usual' and an alert icon (VoiceModeSurface.tsx:44, 215-221).
- Mobile status strings: 'Reconnecting live voice...', 'Connecting live voice...', 'Live voice stopped', 'Muted, tap the mic to talk', 'Go ahead', 'Speaking, talk any time to interrupt', 'Listening' (LiveVoiceBar.tsx:164-181); working label 'Working on your request' (line 81).
- Companion strings: 'Tap to speak', 'Listening...', 'Thinking...', 'Speaking...' and sublabels 'Speech stays on this device', 'Speak naturally', 'AI is responding', 'Sending to AGI Cloud' or 'Answering on this device' (voice.tsx:75-100).

**Journey**

1. 1. Call connects; the orb shows connecting then listening.
2. 2. The person speaks; the level moves the orb.
3. 3. The assistant works on a request; the orb shows thinking and an agent status line appears.
4. 4. The assistant speaks; the orb shows speaking and follows the reply audio level.
5. 5. A screen reader hears each state change in a polite region.

**What the person sees and gets**

- Announcements: 'Connecting to voice', 'Listening', 'Transcribing what you said', 'Sending your turn', 'Working on your request', 'Assistant is speaking', 'Microphone muted', 'An action is waiting for your approval on screen' (voice-announcements.ts:4-12).
- Call time shown with role timer, 'Call time ...' (VoiceModeSurface.tsx:574-584).
- Errors and reconnect have their own alert and status roles so they are not repeated in the state region (voice-announcements.ts:28-33).

**Settings**

- Web follows the operating system reduced motion preference through usePrefersReducedMotion (use-voice-session.ts:742).
- Mobile haptics setting only affects the companion taps (voice.tsx hapticsEnabled).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: the controller maps session status plus backendBusy to an orb state; speaking is detected from reply audio level at or above 0.03 held 350 ms, sampled every 50 ms (live-voice-session.ts:48-51, 918-972).
- The orb level source returns the larger of microphone and reply level, and the microphone level is 0 while muted (live-voice-session.ts:436-438, 940-950).
- Announcements for each status, muted, thinking and approval pending (voice-announcements.ts:23-46).
- Tool activity from delegations is shown with a timeout notice using the descriptor timeout, default 20 s (live-voice-session.ts:55, 1081-1110).
- Spoken progress: after 3 s the live model is told to say 'Still working on it' at most once every 8 s (live-voice-session.ts:1081-1130).
- Mobile live bar state labels and glow, plus interruption state set when the user speaks over the assistant (liveVoiceSession.ts:726-731).

**Incomplete**

- CLI: the brief marks listening, working and waveform as done; code has a REC level meter and spinners but no speaking indicator because no spoken reply exists (voice.rs:766, 846).
- Whether reduced motion removes all orb animation is delegated to the shared orb and was not opened.

**Present but disconnected or switched off**

- Mobile 'Speaking' phase in the companion uses a fixed level 0.5 rather than real reply audio (useVoiceConversation.ts:~160 audioLevel 0.5) [inferred from the setAudioLevel(0.5) call in the speech start callback].

**Not available**

- VS Code and Chrome: none, no voice call.

## 4. Required behaviour

**Established requirements**

- While the assistant is listening, a visible and announced listening state is shown. (source: brief S48.05)
- While the assistant speaks, a visible speaking state is shown. (source: brief S48.06)
- While the assistant works (thinking or running a tool), a working state is shown. (source: brief S48.07)
- A waveform or amplitude visual follows the live microphone or reply audio level. (source: brief S48.08)
- Provide an understandable connection state. (source: doc: docs/product/competitive-guidance.md:404)

**Acceptance criteria**

1. Listening, speaking, thinking and muted each show a distinct orb state and label on web.
2. A screen reader announces each state change once.
3. With the microphone muted the orb level is zero while the assistant still animates when it speaks.
4. When a tool takes longer than its timeout the status line says it is taking longer than usual.
5. With reduced motion on, the orb is non-animated.
6. Mobile shows 'Speaking, talk any time to interrupt' while the assistant speaks and 'Go ahead' after an interruption.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Muting must not make the orb claim it is listening [inferred from voice-announcements.ts:28-31 and the muted orb state].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Verify the reduced-motion rendering with a test that reads the rendered orb.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Web VoiceOrb wrapper | `apps/web/features/chat/components/Voice/VoiceOrb.tsx` | Maps status and backendBusy to an orb state. |
| component | Shared VoiceOrb and canvas | `packages/ui/unified-chat/src/components/VoiceOrb.tsx` | Draws the orb, level, focus, reduced motion. |
| service | voice-session-machine | `packages/ui/unified-chat/src/voice/voice-session-machine.ts` | Status and event reducer, orb state labels, thresholds. |
| service | voice-announcements | `apps/web/features/chat/components/Voice/voice-announcements.ts` | Polite announcement strings. |
| component | VoiceModeSurface | `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx` | Live region, timer, agent status, Stop the task. |
| service | LiveVoiceSession level and speaking detection | `apps/web/features/chat/lib/live-voice-session.ts` | Analyser sampling, speaking flag, tool activity. |
| hook | useVoiceSession | `apps/web/features/chat/hooks/use-voice-session.ts` | Exposes audioLevel, reducedMotion, backendBusy, toolActivity. |
| component | VoiceActivityAffordance and VoiceActivityPanel | `apps/web/features/chat/components/Voice/VoiceActivityPanel.tsx` | Opens agent activity for a message during voice. |
| component | LiveVoiceBar | `apps/mobile/src/features/voice/components/LiveVoiceBar.tsx` | Mobile status label, orb, working label. |
| component | Mobile VoiceOrb | `apps/mobile/src/features/voice/components/VoiceOrb.tsx` | Mobile orb driven by phase and audio level. |
| component | VoiceStateGlow and Waveform | `apps/mobile/src/features/voice/components/VoiceStateGlow.tsx` | Glow behind the orb; waveform in Waveform.tsx. |
| service | Mobile liveVoiceSession interruption | `apps/mobile/src/features/voice/services/liveVoiceSession.ts` | Sets interrupted when the user speaks over the assistant (726-731). |
| screen | Voice companion | `apps/mobile/app/(app)/voice.tsx` | Phase label, sublabel, orb. |
| command | level_meter | `apps/cli/src/voice.rs` | CLI recording level meter and spinners. |
| test | Orb state tests | `apps/web/features/chat/components/Voice/VoiceOrb.test.tsx` | Web orb tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser analysers read the microphone and the reply audio every 50 ms. | device | live-voice-session.ts:48, 918-957 |
| A reply level of 0.03 or more marks the assistant as speaking and keeps that for 350 ms. | device | live-voice-session.ts:49-51, 950-957 |
| Delegation events from the provider mark the backend busy and name the running tool. | outside service | live-voice-session.ts:1021-1045, 1081-1110 |
| The reducer and store turn these into a status; the orb and the live region render it. | device | voice-session-machine.ts:166-175; VoiceModeSurface.tsx:216-244 |
| Mobile derives its status from session callbacks and the interruption flag. | device | useLiveVoiceSession.ts:331-345; LiveVoiceBar.tsx:164-181 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Audio level and status | in-memory only | No | Gone with the call |

**Models and providers.** Indicators are computed locally from audio levels and provider delegation events. The model that does the work only shows through tool labels. No model or provider is chosen by this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Same as F048-01. |
| Permissions | Microphone for level; none extra. |
| Subscription | none found in the code; indicators carry no entitlement. |
| Limits and metering | Sampling every 50 ms; tool timeout defaults to 20 s unless the tool descriptor says otherwise (live-voice-session.ts:55, 1081). |
| Feature flags | none found in the code. |
| Model compatibility | Tool labels come from the tool list the server returns with the session (route.ts:723-727). |
| Provider restrictions | Same as F048-01. |
| Local mode | Mobile Local companion shows phase labels with 'Answering on this device' when the reply model is on the device (voice.tsx:90-97). Web has no voice in Local. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Muted | Orb shows Muted; announcement 'Microphone muted' unless the assistant is speaking. | voice-announcements.ts:28-31 |
| Error | State region stays empty; the error row has its own alert. | voice-announcements.ts:25-27 |
| Reconnecting | Spinner row 'Reconnecting, attempt N of 3' with role status. | VoiceModeSurface.tsx:300-312 |
| Approval pending | Announcement overrides others. | voice-announcements.ts:27 |
| Tool slow | Status 'is taking longer than usual' and the live model is told to say so. | live-voice-session.ts:1096-1106 |
| Audio autoplay blocked | Notice 'Your browser paused the assistant's audio.' with 'Tap to hear the assistant'. | VoiceModeSurface.tsx:41-42, 418-432 |
| Reduced motion | Flag passed to the orb; rendering effect not verified. | VoiceModeSurface.tsx:290-299 |
| Android screen reader | Explicit announcements only on iOS in the companion; not handled in the code seen for Android. | voice.tsx:236-239 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/voice/voice-session-machine.test.ts`: Status transitions, assistant speech on a full-duplex transport, mute kept while speaking, barge-in helper.
- `apps/web/features/chat/components/Voice/VoiceOrb.test.tsx`: Web orb rendering.
- `packages/ui/unified-chat/src/components/__tests__/VoiceOrb.test.tsx`: Shared orb.
- `apps/mobile/__tests__/VoiceOrb.test.tsx`: Mobile orb effects and colours.
- `apps/mobile/__tests__/VoiceStateGlow.test.tsx`: Glow states.
- `apps/mobile/__tests__/LiveVoiceBar.test.tsx`: Connecting, microphone denied, talk-over hint.
- `apps/web/features/chat/components/Voice/VoiceModeSurface.test.tsx`: Surface states.

**Test scenarios**

- **State cycle**
  1. Start voice.
  2. Stay silent, then speak, then wait for the answer.
  - Expected: Orb listens, shows thinking while the backend works, then speaking; labels and announcements match.
- **Muted level**
  1. Mute the microphone.
  2. Speak loudly.
  - Expected: Orb shows Muted and its level does not follow your voice.
- **Slow tool**
  1. Ask for an action that takes over the tool timeout.
  - Expected: Status line shows the label plus 'is taking longer than usual'.
- **Reduced motion**
  1. Turn on reduced motion in the operating system.
  2. Start voice.
  - Expected: The orb does not animate; state still readable.
- **Mobile interruption**
  1. On mobile live voice, talk while the assistant speaks.
  - Expected: Label changes to 'Go ahead'.

**Where to look when it fails**

- Browser console for analyser errors.
- Check store fields session.status, backendBusy and toolActivity in React dev tools.
- Server events for delegation start and end are not logged here; see the provider event stream.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/048-voice-conversation-interface.md](../../70-qa/test-plans/web/048-voice-conversation-interface.md)
- Desktop: [70-qa/test-plans/desktop/048-voice-conversation-interface.md](../../70-qa/test-plans/desktop/048-voice-conversation-interface.md)
- Mobile: [70-qa/test-plans/mobile/048-voice-conversation-interface.md](../../70-qa/test-plans/mobile/048-voice-conversation-interface.md)
- CLI: [70-qa/test-plans/cli/048-voice-conversation-interface.md](../../70-qa/test-plans/cli/048-voice-conversation-interface.md)

## 10. Gaps and dependencies

- **Reduced-motion behaviour of the orb is not verified end to end.** Affects: Users sensitive to motion.. Evidence: VoiceModeSurface.tsx:290-299; use-voice-session.ts:742.. Work needed: Open the shared orb and add a test.
- **CLI has no speaking or thinking indicator beyond a spinner; brief says done.** Affects: CLI users.. Evidence: voice.rs:203, 261, 766.. Work needed: Correct the brief.
- **Mobile companion speaking level is a constant.** Affects: Mobile on-device voice users.. Evidence: useVoiceConversation.ts:setAudioLevel(0.5) in speech start callback.. Work needed: Drive the level from audio output if available.
- **No Android announcement path found.** Affects: Android TalkBack users.. Evidence: voice.tsx:236-239 only iOS.. Work needed: Verify and add.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- F048-01
- F048-04
- SYS-shared-ui-and-design
- SYS-voice-and-media
- SYS-agents-tools-and-automation
- mode:cloud
- mode:local

## Unknown

- Whether the shared orb removes animation under reduced motion.
- The exact path of usePrefersReducedMotion was inferred from an import alias.
- Whether mobile VoiceOrb honours reduce motion.
- Whether Android screen readers get announcements elsewhere.
