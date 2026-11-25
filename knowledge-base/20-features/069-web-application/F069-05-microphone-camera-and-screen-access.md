---
id: "F069-05"
type: "feature"
title: "Microphone, camera and screen access"
aliases: ["Microphone, camera and screen access", "Dictation", "Voice mode", "Live voice", "Share your camera", "Capture screen", "S69.08", "S69.09"]
area: "69 Web application"
available_on: ["web"]
implementation: {web: "built", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S69.08", "S69.09"]
depends_on: ["surface:web", "mode:cloud", "provider:openai", "SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-model-catalog-and-routing", "api:POST /api/voice/transcribe", "api:POST /api/voice/live/sessions", "api:POST /api/feedback"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F069-05 Microphone, camera and screen access

The web chat asks the browser for the microphone for dictation and for live voice calls, explains a refusal, and retries a live call when access is later granted. A camera sharing control is built but not connected on the chat page. The feedback dialog can capture one screen frame. Screen sharing into chat is not offered.

Area: [69. Web application](README.md). Requirement items: [S69.08](../../10-requirements/capabilities/069-web-application.md#s6908), [S69.09](../../10-requirements/capabilities/069-web-application.md#s6909).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Dictation records audio and sends it to our server for transcription (apps/web/features/chat/stores/voice-input-store.ts:218-235). Live voice sets up a WebRTC call brokered by our server (apps/web/features/chat/lib/live-voice-session.ts:480-548). The feedback dialog grabs one screen frame as a picture (apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:52-69).

**Why it exists.** Voice is a core input path, and the product contract needs permission denied, absent microphone and transcription failure to be recoverable states (doc: docs/product/experience-contract.md:786 W13).

**Who uses it.** Web users who dictate, talk to the assistant, or report a problem with a screenshot.

**Problems it solves**

- Typing by voice.
- Hands-free conversation.
- Showing support what is on screen.
- Telling a person why the browser blocked the microphone and what to do.

**Use cases**

- Click the microphone, speak, and get text in the composer.
- Start voice mode and talk; fix a blocked microphone and the call retries on its own.
- Open feedback and press 'Capture screen'.
- Camera sharing in voice mode (built, not reachable today).

## 2. User experience

**Where to find it**

- surface:web: microphone button in the composer (VoiceInputButton.tsx); title 'Voice input not supported in this browser' when unsupported (VoiceInputButton.tsx:12-13).
- surface:web: voice mode entry through the composer (onEnterVoiceMode, WebChatPage.tsx:7670).
- surface:web: feedback dialog button 'Capture screen' (ComposerFeedbackDialog.tsx:335-345); the dialog opens from the sidebar or a message (WebAppShell.tsx:615; MessageBubble.tsx:3826).
- Camera button 'Share your camera' / 'Stop sharing your camera' in voice mode (VoiceModeSurface.tsx:47-48, 524-535), not rendered on the chat page (see current_implementation).

**Before you start**

- A browser with MediaRecorder or the needed APIs; unsupported browsers see the disabled button (VoiceInputButton.tsx:44-78).
- Microphone permission in the browser.
- Live voice: a plan whose policy allows voice, and the adult eligibility check (apps/web/app/api/voice/live/sessions/route.ts:180-186, 311-313).

**Screens and controls**

- Microphone button with pressed state (VoiceInputButton.tsx:73).
- Voice mode surface with orb, captions, reconnect notice (VoiceModeSurface.tsx:300-330).
- Feedback dialog 'Screenshot' section with 'Capture screen' and 'Upload image' (ComposerFeedbackDialog.tsx:316-352).

**Journey**

1. Press the microphone; the browser asks for permission.
2. Speak; recording stops; status becomes 'transcribing'; the text fills the composer (voice-input-store.ts:344-370).
3. For a live call, start voice mode; the page asks for the microphone, creates a peer connection, sends an offer to /api/voice/live/sessions and applies the answer (live-voice-session.ts:480-548).
4. For a screenshot, open feedback, press 'Capture screen', choose a screen in the browser picker; a preview shows with a 'Remove screenshot' button.

**What the person sees and gets**

- Denied: 'Microphone permission denied. Please allow access in your browser settings.' (voice-input-store.ts:450-453).
- Other dictation errors: no microphone, busy, interrupted, blocked by site, and a generic one (voice-input-store.ts:454-466).
- Live voice denied: 'Microphone access was denied. Allow the microphone to use voice mode.' (live-voice-session.ts:62).
- Reconnect: 'Reconnecting <n> of <max>' (VoiceModeSurface.tsx:318-325).
- Capture: preview image; on submit, 'Your note was sent, but your screenshot could not be stored and was not attached.' if storage dropped it (ComposerFeedbackDialog.tsx:143-147).

**Settings**

- Chosen microphone id (voice-input-store.ts:278 microphoneId).
- Voice settings dialog in voice mode (VoiceSettingsModal).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Dictation: records with MediaRecorder, posts to /api/voice/transcribe, shows the text (voice-input-store.ts:298, 368; TRANSCRIBE_ENDPOINT line 16).
- Mapped error messages for denied, not found, busy, aborted, security (voice-input-store.ts:441-466).
- Live voice session with microphone request only when started, plus retry on granted permission (live-voice-session.ts:480-486; use-voice-session.ts:899-925).
- The session ends on pagehide and retries when the browser comes back online (use-voice-session.ts:927-934).
- Screen frame capture in the feedback dialog with stop of tracks in finally (ComposerFeedbackDialog.tsx:52-69), offered only when getDisplayMedia exists (lines 94-96); a refused picker (NotAllowedError) is silent (lines 142-148).
- Camera and screen sources in the shared capture module with distinct messages for denied, busy and unavailable (packages/contracts/types/src/visual-session-capture.ts:30-91).

**Incomplete**

- Captured PNG is not size-checked on the client, while an uploaded file is limited to 4 MiB (ComposerFeedbackDialog.tsx:42, 120-126 versus 52-69). The server limits the data URL length (apps/web/app/api/feedback/route.ts:33). A large capture may be dropped; the person is told only after submit.

**Present but disconnected or switched off**

- Camera sharing: VoiceModeSurface shows the camera button only when it is given onVisualFrame (VoiceModeSurface.tsx:155,524). WebChatPage renders VoiceModeSurface with voiceSurfaceProps, which contains no onVisualFrame (WebChatPage.tsx:6841-6853, 7665-7668, 7793-7796). No other caller passes it outside tests. So the camera button never shows in the product. The draft said it works; that is wrong.
- The camera is also hidden when the desktop host is present (VoiceModeSurface.tsx:257-258).
- Screen sharing as a chat or voice source: the shared module can request a screen (visual-session-capture.ts:92-95) but the only caller uses source camera (VoiceModeSurface.tsx:259-262).

**Not available**

- Screen or tab sharing into chat or voice on web: brief S69.09 says not applicable anywhere. A screen_share capability switch exists for remote control, not for this (apps/web/lib/feature-flags/remote-control-gate.ts:46).

## 4. Required behaviour

**Established requirements**

- The web app asks the browser for microphone and camera access when a feature needs them, explains a refusal, and recovers once access is granted. (source: S69.08)
- A user can share a screen, window or tab with the assistant (brief status: not applicable anywhere). (source: S69.09)
- Voice: permission denied, absent microphone, transcription failure, mute, interruption and exit all have recoverable states; exit releases capture and playback. (source: doc: docs/product/experience-contract.md:786 (W13))
- Do not claim realtime audio behaviour for a completed text-to-speech path. (source: doc: docs/product/experience-contract.md:786)
- The microphone is requested only when a feature needs it. (source: voice-input-store.ts:280-288; live-voice-session.ts:480-486)

**Acceptance criteria**

1. Clicking the microphone triggers the browser prompt; after allowing, speech becomes text in the composer.
2. Denying shows 'Microphone permission denied. Please allow access in your browser settings.'
3. In voice mode with the microphone denied, the live error shows; after granting in browser settings the call restarts without pressing anything.
4. With no microphone attached the dictation message says no microphone found.
5. In the feedback dialog 'Capture screen' attaches a preview and 'Remove screenshot' clears it.
6. Cancelling the browser's screen picker shows no error.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Camera sharing should either be wired into the chat page or removed; dead controls are not allowed (doc: AGENTS.md section 9) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Connect onVisualFrame in the chat page to a real sink, or delete the camera control and its hook until a sink exists.
- [proposed] Check the captured PNG size against 4 MiB before showing it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| store | voice-input-store | `apps/web/features/chat/stores/voice-input-store.ts` | Dictation recording, errors, transcription call. |
| component | VoiceInputButton | `apps/web/features/chat/components/Composer/VoiceInputButton.tsx` | Microphone button and unsupported-browser state. |
| hook | use-dictation | `apps/web/features/chat/hooks/use-dictation.ts` | Dictation hook. |
| service | live-voice-session | `apps/web/features/chat/lib/live-voice-session.ts` | Microphone request, WebRTC offer and answer, close and settings calls. |
| hook | use-voice-session | `apps/web/features/chat/hooks/use-voice-session.ts` | Voice session state, permission retry, pagehide and online listeners. |
| component | VoiceModeSurface | `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx` | Voice UI including the unconnected camera control. |
| hook | useVisualSession | `apps/web/lib/visual/use-visual-session.ts` | React wrapper over the visual capture session. |
| service | visual-session-capture | `packages/contracts/types/src/visual-session-capture.ts` | getUserMedia and getDisplayMedia, error messages, frame sampling. |
| component | ComposerFeedbackDialog | `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx` | Screen capture and upload for a feedback report. |
| endpoint | POST /api/voice/transcribe | `apps/web/app/api/voice/transcribe/route.ts` | Dictation endpoint with the Dictation kill switch. |
| endpoint | Transcriptions handler | `apps/web/app/api/llm/v1/audio/transcriptions/route.ts` | 25 MiB audio limit, plan and usage checks, provider call. |
| endpoint | POST /api/voice/live/sessions | `apps/web/app/api/voice/live/sessions/route.ts` | Creates the live voice session; adult check, plan voice rule, usage reservation. |
| endpoint | POST /api/feedback | `apps/web/app/api/feedback/route.ts` | Receives feedback with optional screenshot. |
| service | feedback-screenshot-cleanup | `apps/web/lib/server/feedback-screenshot-cleanup.ts` | Cleanup record for stored screenshots (imported by the feedback route). |
| config | kill-switches | `apps/web/lib/feature-flags/kill-switches.ts` | Dictation capability switch (DICTATION_CAPABILITY). |
| test | voice-input-store test | `apps/web/features/chat/stores/voice-input-store.test.ts` | Dictation store. |
| test | live-voice-session test | `apps/web/features/chat/lib/live-voice-session.test.ts` | Live voice session. |
| test | VoiceModeSurface test | `apps/web/features/chat/components/Voice/VoiceModeSurface.test.tsx` | Voice UI including camera control when a sink is passed (lines 447-464). |
| test | visual-session-capture test | packages/contracts/types/src/visual-session-capture.test.ts (not found) (not found) | Capture module (file found under packages/contracts/types/src). |
| test | ComposerFeedbackDialog test | `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.test.tsx` | Feedback dialog. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses the microphone; the page calls getUserMedia for audio. | device | voice-input-store.ts:280-288 |
| Audio is recorded in the browser, then posted to /api/voice/transcribe. | device and our servers | voice-input-store.ts:298, 368; transcribe/route.ts:29 |
| The server checks the Dictation switch, plan, free allowance and privacy setting, then sends the audio to the transcription provider and drops the bytes. | our servers | transcribe/route.ts:13-27; transcriptions/route.ts:467, 506-512, 588-600 |
| The provider returns text. | outside service | transcriptions/route.ts:320 (provider openai) |
| For a live call the browser makes an offer and posts it to /api/voice/live/sessions; the answer SDP is applied. | device and our servers | live-voice-session.ts:520-548 |
| The live model is chosen by the voice_live routing slot and must be a managed provider. | our servers | voice/live/sessions/route.ts:187-196 |
| Feedback screen capture draws one frame to a canvas and posts it with the note to /api/feedback. | device and our servers | ComposerFeedbackDialog.tsx:52-69, 182-195 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Dictation audio | Memory in the browser, then sent to the provider; the server does not store it | No | Dropped after transcription (transcriptions/route.ts:467) |
| Transcript text | Composer text | With the message when sent | Like any message |
| Feedback screenshot | Private object storage if configured; otherwise dropped with a note | Server side | A cleanup record exists for unstored or discarded files (feedback/route.ts:60-107) |

**Models and providers.** Dictation uses the voice_transcription routing slot, required to be a live speech model from provider openai (transcriptions/route.ts:496-504). Live voice uses the voice_live slot, which must resolve to a managed provider (voice/live/sessions/route.ts:187-196). The code also blocks a provider that may train on content when the person's privacy setting forbids it (transcriptions/route.ts:506-515).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; live voice requires adult eligibility (voice/live/sessions/route.ts:180-186). |
| Permissions | Browser microphone and screen-picker permission. Camera permission would be asked by the capture module. |
| Subscription | Live voice requires a plan whose policy allows voice (voice/live/sessions/route.ts:311-313). A free voice allowance exists (transcriptions/route.ts:594-600; sessions route.ts:346). The live backend model depends on the plan (route.ts:319). |
| Limits and metering | Audio up to 25 MiB (transcriptions/route.ts:398). Managed usage reservations and free voice seconds (transcriptions/route.ts:65-66, 594-600). Feedback screenshot up to 4 MiB on upload. |
| Feature flags | Dictation kill switch (transcribe/route.ts:7, 22-26). A dictation test also references the screen_share kill switch (useDictation.test.tsx:282); meaning not traced. |
| Model compatibility | Fixed by routing slots, not the person's chat model. |
| Provider restrictions | Transcription must be provider openai in the code path found (transcriptions/route.ts:498-504); live voice must be a managed provider. |
| Local mode | Dictation and live voice use our servers and an outside provider; there is no on-device speech path in the web code found. In Local or own-key mode on web: not handled in the code found. Plain-browser Local mode does not exist. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Permission denied | Message shown; live call retries when the permission turns granted. | voice-input-store.ts:450-453; use-voice-session.ts:899-925 |
| No microphone | 'No microphone found. Please connect a microphone and try again.' | voice-input-store.ts:454-456 |
| Microphone busy | Message to close other apps. | voice-input-store.ts:457-459 |
| Transcription failure | Retryable messages for network, too long, and generic failure. | voice-input-store.ts:155-182 |
| Unsupported browser | Microphone button disabled with a hint to try Chrome or Edge. | VoiceInputButton.tsx:12-13, 51-57 |
| Usage limit in voice | Shows an Upgrade button and an exit button. | VoiceModeSurface.tsx:327-345 |
| Reconnect | Shows attempt count; retries now when the browser comes online. | VoiceModeSurface.tsx:318-325; use-voice-session.ts:929-931 |
| Page hidden or closed | Live session ends on pagehide. | use-voice-session.ts:927-934 |
| Escape key in voice | Exits voice mode unless a panel is open. | VoiceModeSurface.tsx:245-252 |
| Screen picker cancelled | No error shown. | ComposerFeedbackDialog.tsx:142-148 |
| Camera busy or blocked (shared module) | Distinct messages for busy, blocked, unavailable. | visual-session-capture.ts:30-60 |
| Offline | Transcription network error message; other offline handling not traced. | voice-input-store.ts:155 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/stores/voice-input-store.test.ts`: Dictation store and error mapping.
- `apps/web/features/chat/hooks/useDictation.test.tsx`: Dictation hook.
- `apps/web/features/chat/hooks/useVoiceSession.test.tsx`: Voice session hook.
- `apps/web/features/chat/lib/live-voice-session.test.ts`: Live voice session and microphone errors.
- `apps/web/features/chat/components/Voice/VoiceModeSurface.test.tsx`: Voice surface; camera toggle when a sink is passed.
- `apps/web/features/chat/components/Composer/VoiceInputButton.test.tsx`: Microphone button.
- `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.test.tsx`: Feedback dialog.
- packages/contracts/types/src/visual-session-capture.test.ts (not found) (not found): Visual capture module.

**Test scenarios**

- **Dictation happy path**
  1. Click the microphone.
  2. Allow.
  3. Say a sentence.
  4. Stop.
  - Expected: Transcript appears in the composer.
- **Denied then granted**
  1. Block the microphone for the site.
  2. Start voice mode and see the error.
  3. Allow the microphone in browser settings.
  - Expected: The call retries without a click.
- **Unsupported browser**
  1. Open in a browser without MediaRecorder.
  - Expected: Button disabled with the unsupported hint.
- **Feedback capture**
  1. Open feedback.
  2. Press 'Capture screen' and pick a window.
  3. Submit.
  - Expected: Preview shows; the note is sent; no stuck capture.
- **Camera control**
  1. Enter voice mode on the chat page.
  - Expected: Per code, no 'Share your camera' button appears. A tester should confirm this in the running app.

**Where to look when it fails**

- Error names NotAllowedError, NotFoundError, NotReadableError.
- Server logs from the transcription and live session routes (paths above).
- Response error 'transcription_failed_<status>' from the store (voice-input-store.ts:111).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/069-web-application.md](../../70-qa/test-plans/web/069-web-application.md)

## 10. Gaps and dependencies

- **Camera sharing in voice mode is built but never rendered on the chat page.** Affects: Web users. Evidence: VoiceModeSurface.tsx:155,524 versus WebChatPage.tsx:6841-6853. Work needed: Pass a real frame sink or remove the control; add a test on the chat page.
- **Brief says screen sharing is not applicable, yet the feedback dialog captures the screen.** Affects: Documentation and product rules. Evidence: ComposerFeedbackDialog.tsx:52-69. Work needed: Record that only feedback capture exists.
- **Captured screen frame has no size check before submit.** Affects: Feedback senders on large screens. Evidence: ComposerFeedbackDialog.tsx:52-69, 120-126; feedback/route.ts:33. Work needed: Check size or scale the image first.
- **No on-device speech path on web; Local mode users depend on servers.** Affects: Local-mode expectations. Evidence: voice-input-store.ts:16 posts to our server. Work needed: Decide whether the web needs a local speech path.

**Depends on**

- surface:web
- mode:cloud
- provider:openai
- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-model-catalog-and-routing
- api:POST /api/voice/transcribe
- api:POST /api/voice/live/sessions
- api:POST /api/feedback

## Unknown

- Whether the live voice media flows from the browser to the provider directly or through our servers.
- Whether any non-test caller will pass onVisualFrame in a later change.
- Behaviour of dictation when the Dictation kill switch is on, beyond the server refusal.
- Meaning of the screen_share switch in the dictation test.
- Contents of the transcribe route test files.
