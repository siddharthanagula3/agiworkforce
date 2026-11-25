---
id: "F076-03"
type: "feature"
title: "Voice input and spoken replies"
aliases: ["Dictation", "Voice input", "Voice mode", "Live voice", "Read aloud", "Text to speech", "Speech output", "Audio understanding", "Audio transcription", "S76.07", "S76.08", "S76.09", "S76.10", "S76.11", "voice_transcription", "voice_live", "voice_speech"]
area: "76 Model-capability registry"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S76.07", "S76.08", "S76.09", "S76.10", "S76.11"]
depends_on: ["SYS-voice-and-media", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-inference-providers", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-local-inference", "SYS-authentication-and-identity", "api:POST /api/voice/transcribe", "api:POST /api/llm/v1/audio/transcriptions", "api:POST /api/voice/live/sessions", "api:POST /api/voice/speech", "provider:openai", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "mode:local", "mode:own-key"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F076-03 Voice input and spoken replies

Lets a person speak instead of typing and hear replies read aloud. Dictation turns a recording into text, live voice runs a spoken session, and read aloud speaks one reply. Server voice features use named registry slots. Mobile dictation uses on-device speech recognition. Audio-file understanding is a catalog flag only.

Area: [76. Model-capability registry](README.md). Requirement items: [S76.07](../../10-requirements/capabilities/076-model-capability-registry.md#s7607), [S76.08](../../10-requirements/capabilities/076-model-capability-registry.md#s7608), [S76.09](../../10-requirements/capabilities/076-model-capability-registry.md#s7609), [S76.10](../../10-requirements/capabilities/076-model-capability-registry.md#s7610), [S76.11](../../10-requirements/capabilities/076-model-capability-registry.md#s7611).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Provides dictation into the composer, a live two-way voice session, spoken replies, and the audio-input flag shown in model lists.

**Why it exists.** Speaking is faster than typing and needed for hands-free use; the registry slots keep the voice models swappable without app edits.

**Who uses it.** Web, Desktop and Mobile users; CLI users who dictate a prompt; API callers who transcribe audio.

**Problems it solves**

- Typing is slow on phones.
- Voice models change; slots avoid editing callers.
- Privacy settings can stop voice from using providers that may train on content.

**Use cases**

- A Web user dictates a prompt into the composer.
- A Mobile user starts a live voice conversation.
- A user taps read aloud on a long answer.
- A CLI user records a prompt and transcribes it with a local whisper command or the managed service.

## 2. User experience

**Where to find it**

- Web: microphone button labelled 'Start voice input' (VoiceInputButton.tsx:11); 'Start voice mode' button (VoiceEntryButton.tsx:9); on a reply the action 'Read message aloud' / 'Stop reading message' (MessageBubble.tsx:3990).
- Desktop: the hosted web app (doc: AGENTS.md section 5); the desktop also has a dictation bar page at /quick-ask/dictate (apps/desktop/electron/dictationBar.ts:9) that types text into another app (dictationElsewhere.ts); its transcription route was not read.
- Mobile: voice input button and LiveVoiceComposer (apps/mobile/src/features/voice/components); read aloud on a message (MessageBubble.tsx:2020).
- CLI: voice mode and dictate (apps/cli/src/voice.rs:75, 310).
- API: POST /api/llm/v1/audio/transcriptions (transcriptions/route.ts).

**Before you start**

- Microphone permission.
- Web dictation: signed in, not switched off by the dictation kill switch (use-dictation.ts:39-52).
- Live voice: Cloud mode, signed in, plan that allows voice, and on Mobile a native build and secure server URL (liveVoiceAvailability.ts:20-47).
- Adult eligibility gate for read aloud (speech/route.ts:70-77).

**Screens and controls**

- Web: microphone button, voice mode surface (VoiceModeSurface.tsx), Cancel sending, stop task hint, camera preview label, read aloud button.
- Mobile: hold-to-talk, voice orb, live voice bar, audio route picker, voice picker sheet, onboarding sheet.
- CLI: push-to-talk key loop in the terminal.

**Journey**

1. Dictation (Web): press 'Start voice input', speak, stop; the recording is sent to /api/voice/transcribe; the text lands in the composer.
2. Live voice: press 'Start voice mode'; the app asks the server for a live session; audio flows over a realtime connection; replies are spoken.
3. Read aloud: press 'Read message aloud'; the text (up to the cap) goes to the speech route; audio plays.
4. CLI: record, send to a local whisper command, the user's OpenAI key route, or the managed route, in that order of backend detection (voice.rs:424-440).

**What the person sees and gets**

- Failure messages such as 'Could not reach transcription. Check your connection and try again.', 'That recording was too long to transcribe. Try a shorter one.', 'Transcription is unavailable right now. Your recording was not saved. Try again shortly.' (voice-input-store.ts:150-182).
- Dictation off: 'Dictation is temporarily switched off while we investigate a problem with it.' (use-dictation.ts:39-40).
- Read aloud failure: 'Read aloud could not play. Try again.' (useTTS.ts:12); server: 'Read aloud is busy right now. Try again in a moment.' (speech/route.ts:60).
- Mobile Local mode: 'Live voice runs in AGI Cloud, so Local Mode stays turn based.' (liveVoiceAvailability.ts:20).

**Settings**

- Web dictation language and microphone (voice-input-store.ts:20-40).
- Settings flag dictationEnabled (ChatComposerNew.tsx:1790).
- Speech voice and speed (speech/route.ts:46-52).
- Mobile voice presets and speech settings (voicePresets.ts, speechSettings.ts).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web dictation posts to /api/voice/transcribe, which is the transcription handler behind a dictation kill-switch check (apps/web/app/api/voice/transcribe/route.ts:18-31).
- The transcription handler uses the voice_transcription slot as default and accepts another live transcription model from the same provider family; throws if the slot is not a live speech-to-text model (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:490-535).
- It refuses with model_may_train when the privacy setting blocks a training provider (same file:505-522), caps audio at 25 MB (line 398-421), and meters voice minutes or a free voice allowance (lines 586-640).
- Live voice sessions use the voice_live slot, a plan-specific backend model from getVoiceLiveBackendModel and a plan check allowVoice (apps/web/app/api/voice/live/sessions/route.ts:189-195, 296-325; packages/contracts/types/src/model-catalog.ts:1767-1775).
- Read aloud uses the voice_speech slot, refuses if not a live text-to-speech model, input up to 4000 characters (apps/web/app/api/voice/speech/route.ts:46-53, 100-104).
- CLI picks Managed, then OPENAI key, then local whisper binary (apps/cli/src/voice.rs:424-440); the OpenAI route reads the model from the voice_transcription slot (voice.rs:1015-1023).
- Mobile dictation uses on-device speech recognition (apps/mobile/src/features/voice/services/voiceInput.ts:1-5); Mobile read aloud uses server speech when the account is Cloud and device speech otherwise (voiceOutput.ts:102-131; MessageBubble.tsx:2020).
- Models list shows an 'Audio in' and 'Audio out' chip on Web (ModelCatalogue.tsx:150-160) and A/audio flags in the CLI (provider.rs:176-215).

**Incomplete**

- Audio understanding by a chat model (S76.07) is a flag and a chip; no code was found that sends an audio part to a chat model in the chat completions path (grep for input_audio found only the live voice route).
- Mobile has no audio-input chip or filter (modelFilters.ts:14-35).
- Desktop dictation bar transcription backend not read.

**Present but disconnected or switched off**

- Dictation can be switched off by a kill switch with a reason (use-dictation.ts:39-52).
- Mobile live voice is unavailable without the native WebRTC module (liveVoiceAvailability.ts:34-40).

**Not available**

- CLI, VS Code, Chrome: no realtime audio input or speech-to-speech (brief S76.09, S76.11).
- CLI, VS Code, Chrome, API: no speech output (brief S76.10).
- VS Code: no transcription (brief S76.08); Chrome and Mobile not listed for transcription.

## 4. Required behaviour

**Established requirements**

- The registry records audio input per model and the product uses it to show or gate audio understanding (S76.07). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.07)
- The registry names the transcription model(s) and dictation/transcription requests use that registry choice (S76.08). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.08)
- The registry names the realtime audio-input model and live voice sessions start on that registry model (S76.09). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.09)
- The registry records which models produce speech and spoken output uses a registry-chosen model (S76.10). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.10)
- The registry names the realtime speech-to-speech route and live voice uses it (S76.11). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.11)
- Nothing silently routes a Local chat to BYOK or managed cloud; Local-to-BYOK is an explicit fork with consent. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. Web dictation: speak a sentence; the transcript appears in the composer.
2. With the dictation kill switch on, the microphone shows the switched-off message instead of recording.
3. Transcription with a privacy setting that blocks training providers returns 403 model_may_train.
4. Audio over 25 MB returns 413.
5. Read aloud with text over 4000 characters is refused with a message about one message up to 4,000 characters.
6. Mobile in Local mode shows the live-voice-unavailable reason and stays turn based.
7. CLI with no key, no managed session and no whisper binary prints install guidance.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Changing the voice_transcription slot in the registry changes dictation on Web and the CLI OpenAI route with no app edit. [inferred from route and voice.rs slot reads]
- Mobile dictation is on-device recognition and therefore does not use the registry slot. [inferred from voiceInput.ts]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show an audio-input chip on Mobile or state that audio-file chat is not offered.
- [proposed] Record the answer for what an 'Audio in' chip does in the product, since no chat path sends audio parts.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | voice slots | `packages/ai/model-registry/catalog/routing-policies.json` | voice_transcription, voice_live, voice_live_backend, voice_live_backend_free, voice_speech slots (lines 904-925). |
| endpoint | POST /api/voice/transcribe | `apps/web/app/api/voice/transcribe/route.ts` | Dictation entry with the dictation kill switch. |
| endpoint | POST /api/llm/v1/audio/transcriptions | `apps/web/app/api/llm/v1/audio/transcriptions/route.ts` | Transcription handler: slot, privacy, size cap, plan and allowance. |
| endpoint | POST /api/voice/live/sessions | `apps/web/app/api/voice/live/sessions/route.ts` | Creates live voice sessions on the voice_live slot and plan backend. |
| endpoint | POST /api/voice/speech | `apps/web/app/api/voice/speech/route.ts` | Read aloud audio from the voice_speech slot. |
| service | getVoiceLiveBackendModel | `packages/contracts/types/src/model-catalog.ts` | Chooses the live voice backend slot by plan (lines 1757-1775). |
| store | voice-input-store | `apps/web/features/chat/stores/voice-input-store.ts` | Web recording state, language, error mapping. |
| hook | use-dictation | `apps/web/features/chat/hooks/use-dictation.ts` | Dictation hook and the switched-off messages. |
| component | VoiceInputButton and VoiceEntryButton | `apps/web/features/chat/components/Composer/VoiceInputButton.tsx` | Microphone and voice mode buttons. |
| component | VoiceModeSurface | `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx` | Live voice screen. |
| service | live-voice-session | `apps/web/features/chat/lib/live-voice-session.ts` | Web client for the live session endpoint (line 41). |
| hook | useTTS | `apps/web/lib/hooks/useTTS.ts` | Web read aloud playback. |
| component | MessageBubble | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Read message aloud button (line 3990). |
| service | mobile voiceInput | `apps/mobile/src/features/voice/services/voiceInput.ts` | On-device speech recognition. |
| service | mobile serverSpeech and voiceOutput | `apps/mobile/src/features/voice/services/serverSpeech.ts` | Server read aloud and device fallback. |
| service | mobile liveVoiceSession | `apps/mobile/src/features/voice/services/liveVoiceSession.ts` | Realtime session client. |
| service | mobile liveVoiceAvailability | `apps/mobile/src/features/voice/services/liveVoiceAvailability.ts` | Reasons live voice is unavailable (Local, sign-in, build, insecure server). |
| command | CLI voice | `apps/cli/src/voice.rs` | Voice mode, dictate, backend detection, transcription calls. |
| service | CLI speech constants | `crates/agiworkforce-llm/src/speech.rs` | TRANSCRIPTION_ROUTING_SLOT and managed URL (lines 13-24). |
| component | desktop dictation bar | `apps/desktop/electron/dictationBar.ts` | Floating dictation window for typing into other apps. |
| endpoint | GET /api/llm/v1/models | `apps/web/app/api/llm/v1/models/route.ts` | Publishes audio_input flag per model. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web records audio in the browser with MediaRecorder and posts it to /api/voice/transcribe. | device | apps/web/features/chat/stores/voice-input-store.ts:16, 200-230 |
| The server checks the kill switch, sign-in, size, type, privacy, plan, allowance, then calls the speech-to-text provider with the slot model. | our servers | transcribe/route.ts:18-31; transcriptions/route.ts:398-640 |
| The provider transcribes the audio. | outside service | transcriptions/route.ts (model resolved at 524-535) |
| Live voice: the app asks /api/voice/live/sessions; the server picks the live model and plan backend and returns a session; audio flows between the app and the provider. | device and our servers | voice/live/sessions/route.ts:189-195, 296-325; mobile liveVoiceSession.ts |
| Read aloud: the app posts message text to /api/voice/speech; the server calls the text-to-speech provider and returns audio. | our servers | voice/speech/route.ts:100-125 |
| Mobile dictation recognises speech on the device with no server call. | device | apps/mobile/src/features/voice/services/voiceInput.ts:1-5, 20 ('on-device-recognition-unavailable') |
| CLI with a local whisper binary transcribes on the device; with a user OpenAI key it calls that provider directly; with a Managed session it calls the server. | device and our servers | voice.rs:424-440, 1025-1045, 1089-1120, 1139-1185 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Recording and transcript | Recording held in memory or a temp WAV on the CLI; web recording not stored on the server per the failure copy 'Your recording was not saved' (voice-input-store.ts:158-182) | No evidence of sync | unknown for server-side retention |
| Voice usage and free allowance | Managed usage reservation and tier unit quota records (voice_minutes) (transcriptions/route.ts:594-640) | Server-side | unknown |

**Models and providers.** Transcription and read aloud require the registry slot model to be from provider openai and live (transcribe route 490-497; speech route 100-104). Live voice uses the voice_live slot and a plan backend model. Providers that may train on content are blocked when the user's privacy setting says so (model_may_train).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web dictation: sign in (401/403 shows 'Sign in again to use voice input', voice-input-store.ts:157-159). Live voice and read aloud need an account; Mobile live voice needs cloud sign-in (liveVoiceAvailability.ts:25-27). CLI managed route needs a signed-in session token. |
| Permissions | Microphone permission; adult eligibility gate on read aloud (speech/route.ts:70-77); organisation spend cap message (voice-input-store.ts:160-164). |
| Subscription | Plan allowVoice for live sessions (live sessions route.ts:308-314); free voice allowance seconds or paid voice_minutes unit quota for transcription (transcriptions/route.ts:594-640); API surface plan check (586-593). Read aloud's plan rule: unknown beyond the managed compute gate (speech/route.ts:79-86). |
| Limits and metering | Audio size 25 MB (transcriptions/route.ts:398); speech text 4000 characters (speech/route.ts:46); Mobile server speech chunk 3,800 (serverSpeech.ts:9); usage reserved and settled per request (transcriptions/route.ts:620-700). |
| Feature flags | Dictation kill switch 'dictation' (kill-switches.ts:33); capability 'canUseVoice' (live sessions route.ts:300-306). |
| Model compatibility | Slot model must be provider openai and live; transcription modelType stt, speech modelType tts. |
| Provider restrictions | Provider that may train on inputs is refused under a no-training privacy setting (model_may_train). |
| Local mode | Mobile: live voice stays turn based in Local mode (liveVoiceAvailability.ts:20-27); dictation is on-device and read aloud uses device voice (voiceOutput.ts:102-131). CLI: Local privacy mode refuses cloud transcription and needs a local whisper binary (voice.rs:133-141, 448-480). Web/Desktop local-mode dictation behaviour: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Recording too long (413) | 'That recording was too long to transcribe. Try a shorter one.' | voice-input-store.ts:171-173 |
| Rate limited (429) | 'Too many recordings just now. Wait a moment, then try again.' | voice-input-store.ts:174-176 |
| Server error | Retryable message; recording not saved. | voice-input-store.ts:177-181 |
| Plan refusal or allowance used | Plan-required or minutes-used message; no retry. | voice-input-store.ts:160-170 |
| Network failure | 'Could not reach transcription...' retryable. | voice-input-store.ts:154-156 |
| Dictation switched off | Message with optional reason. | use-dictation.ts:39-52 |
| Mobile no WebRTC module / insecure server / Local / signed out | Live voice unavailable with a reason; chat stays turn based. | liveVoiceAvailability.ts:20-47 |
| Mobile live connection drops | 'The live voice connection dropped.' with a grace period. | liveVoiceAvailability.ts:9-10; liveVoiceSession.ts:DISCONNECT_GRACE_MS |
| Android with no speech voice | 'No speech voice is installed on this device.' | readAloudAvailability.ts:9 |
| CLI transcription timeout | Whisper API 30 s timeout; local whisper stopped after a time limit. | voice.rs:1111, 1160-1165 |
| Cancel during recording | cancelListening exists in the store. | voice-input-store.ts:46 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/audio/transcriptions/route.test.ts`: Transcription route (file exists; assertions not read).
- `apps/web/__tests__/api/voice-transcribe.test.ts`: Dictation route (file exists; assertions not read).
- `apps/web/app/api/voice/speech/__tests__/route.test.ts`: Speech route (file exists; assertions not read).
- `apps/web/app/api/voice/live/sessions/route.test.ts`: Live session creation (file exists; assertions not read).
- `apps/web/features/chat/stores/voice-input-store.test.ts`: Web voice input store (assertions not read).
- `apps/web/lib/hooks/useTTS.test.ts`: Read aloud hook (assertions not read).
- `apps/cli/src/voice.rs`: Inline tests: managed session cloud backend allowed; transcription blocked in Local before any I/O; gate passes for a local binary (lines 1309-1390).

**Test scenarios**

- **Dictation happy path**
  1. Sign in on Web localhost.
  2. Press Start voice input, say a sentence, stop.
  - Expected: Transcript appears in the composer.
- **Dictation switched off**
  1. Turn the dictation kill switch on for the test account.
  2. Open the composer.
  - Expected: The dictation control reports it is switched off with the message.
- **Privacy block**
  1. Set the no-training privacy setting.
  2. Call the transcription endpoint.
  - Expected: 403 with code model_may_train.
- **Read aloud cap**
  1. Post 4001 characters to /api/voice/speech.
  - Expected: 400 with the 4,000 character message.
- **Mobile Local live voice**
  1. On Mobile switch to Local mode.
  2. Open the live voice entry.
  - Expected: Reason 'Live voice runs in AGI Cloud, so Local Mode stays turn based.'
- **CLI Local privacy**
  1. Run CLI voice in Local privacy mode with no whisper binary.
  - Expected: Message requiring a local whisper binary; no cloud call.

**Where to look when it fails**

- Error codes model_may_train, voice allowance codes (VOICE_ALLOWANCE_USED_CODE) and quota block codes in responses.
- Log event voice_session_expiry_failed (transcriptions/route.ts:631).
- Thrown errors 'The canonical voice_transcription slot is not a live OpenAI STT model', 'The voice_speech slot is not a live OpenAI TTS model', 'The voice_live routing slot does not resolve to a live model'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/076-model-capability-registry.md](../../70-qa/test-plans/web/076-model-capability-registry.md)
- Desktop: [70-qa/test-plans/desktop/076-model-capability-registry.md](../../70-qa/test-plans/desktop/076-model-capability-registry.md)
- Mobile: [70-qa/test-plans/mobile/076-model-capability-registry.md](../../70-qa/test-plans/mobile/076-model-capability-registry.md)
- CLI: [70-qa/test-plans/cli/076-model-capability-registry.md](../../70-qa/test-plans/cli/076-model-capability-registry.md)

## 10. Gaps and dependencies

- **Audio understanding by chat models has no consumer: flag and chip exist, but no path sends audio parts to a chat model was found.** Affects: All apps, API.. Evidence: models/route.ts:62-70 publishes audio_input; grep input_audio only in voice/live/sessions/route.ts. Work needed: Either build audio-part support in the chat path or document the flag as informational.
- **Mobile has no audio-input chip or filter.** Affects: Mobile.. Evidence: modelFilters.ts:14-35. Work needed: Add or declare out of scope.
- **CLI, VS Code, Chrome lack realtime voice; VS Code lacks transcription; CLI, VS Code, Chrome, API lack speech output.** Affects: Those apps.. Evidence: brief S76.08-S76.11 statuses. Work needed: Build or mark not planned.
- **Mobile dictation does not use the registry transcription slot.** Affects: Mobile.. Evidence: voiceInput.ts:1-5. Work needed: Decide whether the registry rule applies to on-device recognition.
- **CLI local whisper path does not use the registry.** Affects: CLI Local.. Evidence: voice.rs:1139-1185. Work needed: Likely acceptable for Local; record the decision.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-voice-and-media
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-inference-providers
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-local-inference
- SYS-authentication-and-identity
- api:POST /api/voice/transcribe
- api:POST /api/llm/v1/audio/transcriptions
- api:POST /api/voice/live/sessions
- api:POST /api/voice/speech
- provider:openai
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- mode:local
- mode:own-key

## Unknown

- Desktop dictation bar transcription route and plan rules.
- Read aloud plan rules beyond the managed compute gate.
- Server retention of audio.
- Whether Web dictation works with a local model selected.
- Voice test assertions (not read).
- Chrome extension voice behaviour (brief lists missing; code not searched).
