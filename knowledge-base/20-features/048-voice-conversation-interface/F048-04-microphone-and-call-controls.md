---
id: "F048-04"
type: "feature"
title: "Microphone and call controls"
aliases: ["Mute", "Turn off microphone", "End voice session", "End live voice", "Pause call", "Resume call", "Hands free", "Auto-listen", "Call controls"]
area: "48 Voice conversation interface"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S48.09", "S48.10", "S48.11", "S48.13"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "mode:local", "F048-01", "F048-03", "F048-05", "SYS-subscriptions-entitlements-and-usage", "SYS-voice-and-media", "SYS-observability-and-operations", "table:voice_sessions", "api:POST /api/voice/live/sessions/{sessionId}/close", "api:POST /api/voice/live/sessions/{sessionId}/extend"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F048-04 Microphone and call controls

During a call the person can mute the microphone, end the call, or pause it, and the call keeps listening without a button each turn. Pausing on web and mobile closes the live connection and resuming opens a new one. The CLI can only end its loop with Escape and has no hands-free mode.

Area: [48. Voice conversation interface](README.md). Requirement items: [S48.09](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4809), [S48.10](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4810), [S48.11](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4811), [S48.13](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4813).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives the basic call controls: mute without hanging up, end the call and settle its usage, pause so nothing is used, and an always-listening mode.

**Why it exists.** A call must be controllable and must stop costing minutes when the person stops talking.

**Who uses it.** Everyone on a voice call.

**Problems it solves**

- Cough or side talk should not reach the assistant.
- Leaving the call must stop billing and release the microphone.
- Hands-free use needs no per-turn press.

**Use cases**

- Press the microphone button to mute while a colleague talks.
- Press Escape or the X button to end the call.
- Choose 'Pause call' to step away without using minutes, then 'Resume'.
- On mobile switch between hands-free and push-to-talk on the companion screen.

## 2. User experience

**Where to find it**

- Web/Desktop: composer row in voice mode: microphone button labelled 'Turn off microphone' or 'Turn on microphone' (testid voice-mute-toggle) and round X labelled 'End voice session' (testid voice-exit-button) (VoiceComposer.tsx:9-16, 118, 138). Pause: plus menu 'In this chat' > 'This call' > 'Pause call' (VoiceChatDock.tsx:26, 133-142; testid voice-pause-toggle). Keyboard: Escape ends; Space toggles mute only while the text field is empty (VoiceComposer.tsx:57-75).
- Mobile live: header 'Pause call' or 'Resume call' (testID live-voice-pause), 'Mute microphone' or 'Unmute microphone', 'End live voice' (LiveVoiceBar.tsx:231-232, 296, 726, 746).
- Mobile on-device: 'Mute microphone' or 'Unmute' and a toggle 'Switch to push-to-talk mode' or 'Switch to hands-free mode' (voice.tsx:646-673); 'Close voice companion' (voice.tsx:~590).
- Settings: Voice > 'Auto-listen' and the conversation modes 'Hands free' (description 'Listening restarts on its own. Best for quiet places.') and 'Push to talk' (apps/mobile/src/features/settings/voice/index.tsx:45-60, 393).
- CLI: Escape exits voice mode; no mute or pause (voice.rs:563-580).

**Before you start**

- A started call (F048-01).

**Screens and controls**

- Web paused state: hint 'Paused. The call is closed and nothing is being used. Resume to pick up this conversation.' with a Resume button (testid voice-resume) (VoiceModeSurface.tsx:63-64, 361-372).
- Web muted hint text from mutedHint (VoiceModeSurface.tsx:376-379).
- Web call timer excludes paused time (use-voice-session.ts:756-780).

**Journey**

1. 1. Mute: press the microphone button; the app disables the audio track and tells the provider to mute; the orb shows Muted.
2. 2. Unmute reverses it.
3. 3. Pause: the app ends the live connection, records the paused flag and shows the paused hint.
4. 4. Resume: the app opens a new live session with the current settings.
5. 5. End: the app asks the provider to close, waits up to 3 seconds, posts the usage seconds to the close endpoint, and the server settles the usage.
6. 6. Hands-free: with no button needed the provider detects when the person stops talking and replies, turn after turn.

**What the person sees and gets**

- Microphone button shows pressed state with the device name in its tooltip (VoiceComposer.tsx:41-48; test VoiceComposer.test.tsx:41).
- Web toast if closing is not recorded: 'This voice session did not close cleanly, so it may keep counting toward your voice usage for a few more minutes.' (use-voice-session.ts:333-338).
- Mobile notices on end: 'The live voice session ended.' (liveVoiceAvailability.ts:14).

**Settings**

- Mobile 'Auto-listen' per mode (local or cloud) default true (apps/mobile/stores/settings/localSettingsStore.ts:80).
- Mobile push-to-talk preference default false (apps/mobile/stores/settingsStore.ts:132).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Mute: web disables microphone tracks and sends session.input_audio.mute or unmute; a mute chosen while connecting is replayed after the session starts (live-voice-session.ts:772-787, 1003-1010).
- The server accepts these browser events on the data channel: mute, unmute, instructions append, thinking append, commentary append, response item create, response create and session close; session.update is excluded (route.ts:138-147, 559).
- End: close() cancels backend work, stops tracks, sends session.close and waits up to 3 s, then settle posts seconds, reason, last turn and backend usage to the close endpoint (live-voice-session.ts:789-815, 591-600; close/route.ts:63-175).
- Pause on web: pause() sets the flag, ends the live session with reason 'paused' and mutes; resume() starts a new session (use-voice-session.ts:940-959).
- Mobile pause: LiveVoiceComposer sets the session inactive while paused so the live session is closed, and resumes by starting again (LiveVoiceComposer.tsx:25-43).
- Hands-free on web and mobile live: there is no per-turn control in the live path; the provider session is open-microphone until muted [inferred from live-voice-session.ts: no commit or press events are sent].
- Mobile companion: hands-free restarts listening after each reply when Auto-listen is on (useVoiceConversation.ts:299-310, 352).
- Web ends the call on page hide and mobile ends it when the app goes to the background (use-voice-session.ts:926-927; useLiveVoiceSession.ts:480-486).

**Incomplete**

- Pause does not keep the connection; it closes it and a new session is created on resume, which reserves a new minute block (use-voice-session.ts:942-959; route.ts:373-400). The brief's 'should keep the call' is therefore only met at the conversation level.
- CLI: Escape is the only exit; brief says end is done and hands-free missing, which matches (voice.rs:563-580).

**Present but disconnected or switched off**

- Web 'Pause call' is hidden once the call is in error or already paused (VoiceModeSurface.tsx:641-643).

**Not available**

- CLI: mute, pause, hands-free.
- VS Code and Chrome: no call.
- Lock-screen or background control (brief S48.34, S48.35 missing).

## 4. Required behaviour

**Established requirements**

- The user can mute and unmute the microphone without ending the conversation. (source: brief S48.09)
- A control ends the conversation, closing the session and settling its usage. (source: brief S48.10)
- The user can pause the whole conversation (mic and assistant) and resume it later without ending it. (source: brief S48.11)
- A hands-free mode keeps listening across turns without a button press per turn. (source: brief S48.13)
- Meter actual voice usage and disclose limits. (source: doc: docs/product/competitive-guidance.md:408)

**Acceptance criteria**

1. Mute stops the assistant from hearing, keeps the call open, and the orb shows Muted.
2. A mute chosen before the call connects is still muted when it starts.
3. End closes the session; the voice_sessions row is closed and the billed seconds are returned.
4. Pause shows the paused hint, the call timer stops, and no new minutes are reserved until resume.
5. Resume starts listening again in the same chat with earlier turns as context.
6. After 3 or more turns the person never had to press anything on hands-free.
7. Closing the browser tab ends the session and settles usage within the lease.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Pause should say plainly that the call is closed (it does) and resume opens a new session that can be refused by a spent allowance [inferred from route.ts:373-418].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show remaining voice allowance at resume so a pause is not a surprise refusal.
- [proposed] Offer a hands-free mode in the CLI only after a live path exists.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | VoiceComposer | `apps/web/features/chat/components/Voice/VoiceComposer.tsx` | Mute, end, Space and Escape keys. |
| component | VoiceChatDock | `apps/web/features/chat/components/Voice/VoiceChatDock.tsx` | Pause call menu item. |
| component | VoiceModeSurface | `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx` | Paused hint, Resume, muted hint, Escape listener (246-252). |
| hook | useVoiceSession pause, resume, toggleMute, exit | `apps/web/features/chat/hooks/use-voice-session.ts` | Control handlers (940-970), page hide end (926-931). |
| service | LiveVoiceSession mute and close | `apps/web/features/chat/lib/live-voice-session.ts` | setMuted, close, settle, extend. |
| endpoint | POST /api/voice/live/sessions/{sessionId}/close | `apps/web/app/api/voice/live/sessions/[sessionId]/close/route.ts` | Closes the record and settles usage. |
| endpoint | POST /api/voice/live/sessions/{sessionId}/extend | `apps/web/app/api/voice/live/sessions/[sessionId]/extend/route.ts` | Extends the funded block while a call runs. |
| service | voice-session-settlement | `apps/web/app/api/voice/live/sessions/lib/voice-session-settlement.ts` | Settles and sweeps abandoned sessions. |
| service | live-voice-billing | `apps/web/lib/voice/live-voice-billing.ts` | Block size and lease constants. |
| component | LiveVoiceBar and LiveVoiceComposer | `apps/mobile/src/features/voice/components/LiveVoiceComposer.tsx` | Mobile mute, pause, end. |
| hook | useLiveVoiceSession mute and background end | `apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts` | toggleMute, AppState background end. |
| hook | useVoiceConversation | `apps/mobile/src/features/voice/hooks/useVoiceConversation.ts` | Companion mute, auto-listen, end. |
| store | settingsStore | `apps/mobile/stores/settingsStore.ts` | voicePushToTalk default false (132). |
| store | localSettingsStore | `apps/mobile/stores/settings/localSettingsStore.ts` | autoListenEnabled default true (80). |
| screen | Mobile voice settings | `apps/mobile/src/features/settings/voice/index.tsx` | Auto-listen, Hands free and Push to talk modes. |
| command | wait_for_key | `apps/cli/src/voice.rs` | CLI SPACE and ESC handling. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Mute disables the local audio track and sends a mute event on the data channel. | device | live-voice-session.ts:772-787 |
| Provider stops hearing the microphone. | outside service | route.ts:138-142 allows the event |
| End: the browser sends session.close, then posts the usage report to the close endpoint. | device and our servers | live-voice-session.ts:789-815; close/route.ts:63-175 |
| The server reads the canonical record, closes it and settles billed seconds against the reservation or free allowance. | our servers | close/route.ts:96-165 |
| While a call runs the browser asks for the next minute block 15 s before the ceiling; if refused the call ends with the notice. | device and our servers | use-voice-session.ts:60-62, 394-430; extend/route.ts |
| A tab that vanished is swept and settled by the server on the next start or active-session read. | our servers | route.ts:619-632; active/route.ts:34-45 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Usage seconds and close reason | voice_sessions row and the managed-usage ledger | Server side | Retention unknown |
| Paused flag | in-memory store | No | Reset when the session ends |

**Models and providers.** Muting and closing are provider data-channel events on the voice_live slot model's session; billing uses the provider cost of the live model and the backend model for the plan (live-voice-billing.ts:80-83). Identifiers not recorded.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in (close and extend endpoints use the user's session). |
| Permissions | Microphone; CSRF and rate limit on close, settings and create. |
| Subscription | Usage is metered per minute block: Free plan draws the monthly allowance (voiceMinutesPerMonth), paid plans draw the plan's usage budget and the 'voice_minutes' unit (route.ts:341-418). |
| Limits and metering | Block 60 s, lease 10 minutes, extension lead 15 s, first extension block 2 (live-voice-billing.ts:20-28; use-voice-session.ts:60-62). Pause stops the clock. |
| Feature flags | none found in the code for mute, pause or end. |
| Model compatibility | The provider must support mute and close events; the route lists them explicitly (route.ts:138-147). |
| Provider restrictions | Only the listed client events are allowed so the browser cannot change the backend model, tools or reasoning (route.ts:132-137). |
| Local mode | Web: no voice in Local. Mobile Local companion: mute, end and hands-free are on-device; Auto-listen is stored per mode (speechSettings.ts:autoListenEnabled). CLI: Escape only. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Close fails | Toast warns usage may keep counting a few minutes; the server sweeps abandoned sessions. | use-voice-session.ts:333-338; voice-session-settlement.ts |
| Close endpoint cannot read record | 503 voice_session_unreadable. | close/route.ts:96-113 |
| Close for an unknown session | 404 voice_session_not_found. | close/route.ts:~115-122 |
| Usage exhausted mid-call | Call ends and shows the usage limit notice with Upgrade and Continue in text. | use-voice-session.ts:387-430; VoiceModeSurface.tsx:314-336 |
| Connection drop | Up to 3 reconnect attempts with 1 s, 2 s, 4 s style delays up to 8 s, then 'The voice connection could not be restored.' | use-voice-session.ts:165-168, 229-262; live-voice-session.ts:61-77 |
| Inactive keepalive | Nothing received for 60 s counts as a drop. | live-voice-session.ts:46-47, 869-900 |
| App backgrounded on mobile | Live call ends; a mic prompt in progress is tolerated. | useLiveVoiceSession.ts:480-486; LiveVoiceBackgroundCancel.test.tsx:211-263 |
| Mute while paused | Toggling mute while paused resumes the call. | use-voice-session.ts:961-969 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Voice/VoiceComposer.test.tsx`: Controls, mute pressed state, Enter, Space only when field empty, Escape and X exit.
- `apps/web/features/chat/components/Voice/__tests__/VoiceComposer.a11y.test.tsx`: Composer accessibility.
- `apps/web/features/chat/components/Voice/VoiceChatDock.test.tsx`: Pause only offered while there is a call to pause.
- `apps/web/features/chat/components/Voice/VoiceModeSurface.test.tsx`: Paused call surface.
- `apps/web/features/chat/lib/live-voice-session.test.ts`: Close acknowledgement windows, settle with fresh token.
- `apps/web/app/api/voice/live/sessions/lib/__tests__/voice-session-settlement.test.ts`: Settlement.
- `apps/mobile/__tests__/LiveVoiceBackgroundCancel.test.tsx`: Ending on background.
- `apps/mobile/__tests__/VoiceConversationPtt.test.tsx`: Companion hands-free and push-to-talk, muted message.

**Test scenarios**

- **Mute and unmute**
  1. Start voice.
  2. Press the microphone button.
  3. Speak.
  4. Press again.
  - Expected: While muted nothing is heard and the orb shows Muted; after unmuting the assistant answers.
- **End and settle**
  1. Run a call for 90 seconds.
  2. Press the X button.
  3. Read the voice_sessions row.
  - Expected: Row closed with reason close_requested and billed seconds near 90 rounded up by blocks.
- **Pause and resume**
  1. Choose Pause call.
  2. Wait a minute.
  3. Choose Resume.
  - Expected: Timer stopped while paused; a new session opens; earlier turns are still context.
- **Tab closed**
  1. Start a call.
  2. Close the tab.
  3. Open the chat on another device and start voice.
  - Expected: Old session is swept and settled, no rejoin offer for it.
- **Hands-free on mobile companion**
  1. Turn Auto-listen on.
  2. Say one sentence and wait for the reply.
  - Expected: Listening restarts after the reply without a tap.

**Where to look when it fails**

- Server log: 'Live voice session settled' with billedSeconds and reason (close/route.ts).
- Events voice_session_expiry_failed and voice_superseded_settlement_failed (route.ts:619-665).
- Client toast 'did not close cleanly'.
- Table voice_sessions columns status and close_reason.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/048-voice-conversation-interface.md](../../70-qa/test-plans/web/048-voice-conversation-interface.md)
- Desktop: [70-qa/test-plans/desktop/048-voice-conversation-interface.md](../../70-qa/test-plans/desktop/048-voice-conversation-interface.md)
- Mobile: [70-qa/test-plans/mobile/048-voice-conversation-interface.md](../../70-qa/test-plans/mobile/048-voice-conversation-interface.md)
- CLI: [70-qa/test-plans/cli/048-voice-conversation-interface.md](../../70-qa/test-plans/cli/048-voice-conversation-interface.md)

## 10. Gaps and dependencies

- **Pause closes the call and resume opens a new session, which re-runs admission and billing.** Affects: Web and mobile live users.. Evidence: use-voice-session.ts:942-959; LiveVoiceComposer.tsx:25-43; route.ts:373-418.. Work needed: Decide whether to keep the brief wording or hold the connection; at minimum disclose it (the web hint does).
- **Mobile pause is not recorded in the brief (it says missing) though the code has it.** Affects: Brief accuracy.. Evidence: LiveVoiceComposer.tsx:25-43; LiveVoiceBar.tsx:231-232.. Work needed: Update the brief.
- **No hands-free mode or mute in the CLI.** Affects: CLI.. Evidence: voice.rs:563-580.. Work needed: Not applicable until live voice exists.
- **No background or lock-screen control.** Affects: Web and mobile.. Evidence: use-voice-session.ts:926-927; useLiveVoiceSession.ts:480-486.. Work needed: Product decision (brief S48.34, S48.35).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- mode:local
- F048-01
- F048-03
- F048-05
- SYS-subscriptions-entitlements-and-usage
- SYS-voice-and-media
- SYS-observability-and-operations
- table:voice_sessions
- api:POST /api/voice/live/sessions/{sessionId}/close
- api:POST /api/voice/live/sessions/{sessionId}/extend

## Unknown

- How long voice_sessions and usage rows are retained.
- Whether the provider treats a close from the browser as definitive billing (the server reads its own record first, close/route.ts:96-113).
- Whether pausing on mobile reserves a new block on resume (inferred from session restart).
- The exact lines of the 404 branch of the close route.
- The mobile close-button label in voice.tsx was read as 'Close voice companion' near line 590 but not numbered.
