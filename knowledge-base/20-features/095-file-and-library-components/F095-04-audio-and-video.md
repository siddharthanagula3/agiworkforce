---
id: "F095-04"
type: "feature"
title: "Audio and video"
aliases: ["Dictation", "Transcription", "Speech to text", "Voice transcribe", "audio/transcriptions"]
area: "95 File and Library components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S95.10", "S95.11"]
depends_on: ["SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-local-inference", "provider:openai", "mode:cloud", "surface:web", "surface:desktop", "surface:vscode", "surface:cli"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F095-04 Audio and video

Turns speech into text on the server for dictation and audio files. Video frame and transcript extraction does not exist. Audio goes to an outside speech-to-text provider, with limits, metering and privacy checks. Local engines on desktop are not covered here.

Area: [95. File and Library components](README.md). Requirement items: [S95.10](../../10-requirements/capabilities/095-file-and-library-components.md#s9510), [S95.11](../../10-requirements/capabilities/095-file-and-library-components.md#s9511).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** POST /api/voice/transcribe applies a dictation switch then the shared handler for POST /api/llm/v1/audio/transcriptions, which checks the audio and forwards it to the speech-to-text provider (apps/web/app/api/voice/transcribe/route.ts:26-29; apps/web/app/api/llm/v1/audio/transcriptions/route.ts:852).

**Why it exists.** Lets people speak instead of type and lets developers transcribe audio through an OpenAI-compatible route (apps/web/lib/api-host-route-contract.ts:23).

**Who uses it.** People using dictation in web, desktop, VS Code and CLI; API users.

**Problems it solves**

- Hands-free input.
- Same endpoint for apps and API keys.

**Use cases**

- Dictate a prompt on web.
- Dictate in the VS Code sidebar.
- Transcribe a recording through the API.
- Use the CLI voice command.

## 2. User experience

**Where to find it**

- Web: voice input store posts to /api/voice/transcribe (apps/web/features/chat/stores/voice-input-store.ts:16).
- Desktop: voice hook posts to the same route (apps/desktop/src/hooks/useVoiceTranscription.ts:650) and also lists provider options cloud, webspeech or local (:43).
- VS Code: sidebar dictation client (apps/extension-vscode/src/features/sidebar-webview/dictationClient.ts:30).
- CLI: voice code calls the audio route (apps/cli/src/voice.rs:1030).
- Mobile: composer has dictation (apps/mobile/src/features/chat/components/ChatInput.tsx:610); which endpoint it calls was not found: unknown.
- Chrome: not found.

**Before you start**

- Cloud sign-in, microphone permission, a plan or free allowance with voice minutes.

**Screens and controls**

- Dictation control in the composer (label not read).

**Journey**

1. 1. Press dictation and speak.
2. 2. The app uploads the recording.
3. 3. The server checks and forwards it.
4. 4. The text appears in the composer.

**What the person sees and gets**

- Fixed per-status messages, for example 'That recording is too large to transcribe.' (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:257-268).
- Privacy refusal: 'Voice transcription uses a provider that may train on what you send...' (:509).

**Settings**

- Privacy setting that avoids training providers; desktop voice provider setting (voiceConfigure in apps/desktop/src/hooks/useVoiceTranscription.ts:3).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Size cap 25 MiB, allowed audio types, magic-byte check, structural scan without the external scanner (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:398-472).
- Provider fixed to the catalog's transcription slot and must be a live speech-to-text model of the openai provider (:496-503).
- Region block 451, rate limit, capability switch, subscription access, free allowance or plan voice minutes, usage reservation (:272-300, 594-610).
- Upstream error text replaced by fixed copy (:257-268).

**Incomplete**

- Desktop local and web-speech paths exist; their behaviour was not read.

**Present but disconnected or switched off**

- Dictation can be switched off by capability kill switch (apps/web/app/api/voice/transcribe/route.ts:26).

**Not available**

- Video frames and transcripts: no extractor found; searches for ffmpeg and frame code in apps/web/lib and apps/web/app returned only video generation and moderation comments (apps/web/lib/hooks/useMediaGeneration.ts:31; apps/web/lib/moderation/output-moderation.ts:180).
- Audio files as chat attachments: not in the supported type list (packages/contracts/cloud-contracts/src/chat-attachment-policy.json:mimeTypes).
- Chrome dictation route: none found.

## 4. Required behaviour

**Established requirements**

- Audio can be transcribed server-side. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S95.10)
- Video files get frames and a transcript extracted. (source: S95.11 (brief: platform missing))
- Upstream error text must not leak; copy is fixed per status. (source: apps/web/app/api/llm/v1/audio/transcriptions/route.ts:250-256)

**Acceptance criteria**

1. A 26 MiB recording is refused with 413.
2. A non-audio file with an audio type is refused with 415.
3. An unsupported audio type gets 415.
4. Upstream 429 shows the busy message, never the upstream body.
5. A free-plan user within allowance transcribes; beyond it gets the allowance message.
6. Dictation off by switch returns an unavailable error.
7. A user who blocks training providers gets 403 model_may_train.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local on-device dictation on desktop and mobile should not need a subscription [per product requirement; code not verified].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add video frame and transcript extraction, or mark video as unsupported in the brief.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/voice/transcribe | `apps/web/app/api/voice/transcribe/route.ts` | Dictation entry with capability check. |
| endpoint | POST /api/llm/v1/audio/transcriptions | `apps/web/app/api/llm/v1/audio/transcriptions/route.ts` | Shared handler. |
| service | free-voice-allowance | `apps/web/lib/voice/free-voice-allowance.ts` | Free plan seconds. |
| service | tier-unit-quota-service | `apps/web/lib/services/tier-unit-quota-service.ts` | voice_minutes allowance. |
| service | managed-usage-request-service | `apps/web/lib/services/managed-usage-request-service.ts` | Reservation and settlement. |
| service | side-call-training-policy | `apps/web/lib/server/side-call-training-policy.ts` | Privacy check. |
| config | kill-switches | `apps/web/lib/feature-flags/kill-switches.ts` | DICTATION_CAPABILITY. |
| service | voice-input-store | `apps/web/features/chat/stores/voice-input-store.ts` | Web client. |
| hook | useVoiceTranscription | `apps/desktop/src/hooks/useVoiceTranscription.ts` | Desktop client with provider choices. |
| service | dictationClient | `apps/extension-vscode/src/features/sidebar-webview/dictationClient.ts` | VS Code client. |
| service | voice.rs | `apps/cli/src/voice.rs` | CLI client. |
| component | ChatInput dictation | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Mobile dictation UI; transport unknown. |
| test | voice-transcribe.test.ts | `apps/web/__tests__/api/voice-transcribe.test.ts` | Route tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client records audio and posts multipart form data. | device | apps/desktop/src/hooks/useVoiceTranscription.ts:650 |
| Server checks region, CSRF, rate limit, auth, dictation switch. | our servers | apps/web/app/api/llm/v1/audio/transcriptions/route.ts:272-300 |
| Size, type, magic bytes and structural scan. | our servers | apps/web/app/api/llm/v1/audio/transcriptions/route.ts:398-472 |
| Allowance check, reservation, forward to the provider endpoint. | outside service | apps/web/app/api/llm/v1/audio/transcriptions/route.ts:594-722 |
| Text is returned; usage is settled. | our servers | apps/web/app/api/llm/v1/audio/transcriptions/route.ts:771-835 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Audio bytes | not stored; forwarded and dropped | No | Comment says nothing stores or serves them (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:469). |
| Usage and cost records | managed usage ledger tables (names not read) | Server | unknown |

**Models and providers.** The default is the catalog slot voice_transcription, which must resolve to a live speech-to-text model of provider:openai; a caller may name another catalog model only if it is the same provider and type (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:496-528). The model policy gate applies.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in or developer API key with inference:write scope. |
| Permissions | Model policy and organization policy gates (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:533). |
| Subscription | Managed-compute subscription access, then free voice seconds or plan voice_minutes allowance (:594-600). |
| Limits and metering | 25 MiB per file; estimated seconds and cost reserved, then settled (:148-240, 603). |
| Feature flags | DICTATION_CAPABILITY switch on /api/voice/transcribe. |
| Model compatibility | Speech-to-text models only. |
| Provider restrictions | openai only today; refused if privacy setting excludes training providers. |
| Local mode | This route is Cloud. Desktop lists a local provider option (apps/desktop/src/hooks/useVoiceTranscription.ts:43,190); mobile local dictation: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Region blocked | 451 with a region header. | apps/web/app/api/llm/v1/audio/transcriptions/route.ts:277-284 |
| Too large | 413. | apps/web/app/api/llm/v1/audio/transcriptions/route.ts:412-421 |
| Wrong type | 415. | apps/web/app/api/llm/v1/audio/transcriptions/route.ts:430-460 |
| Allowance used | Allowance error with reset time. | apps/web/app/api/llm/v1/audio/transcriptions/route.ts:652 |
| Timeout on desktop | 15 s abort. | apps/desktop/src/hooks/useVoiceTranscription.ts:650-662 |
| Superseded recording | Older request aborted. | apps/desktop/src/hooks/useVoiceTranscription.ts:645-648 |
| Offline | not handled in the code read for web | apps/web/features/chat/stores/voice-input-store.ts: no offline branch found in the files read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/voice-transcribe.test.ts`: 401s, missing file 400, success 200, forwarding to the provider.

**Test scenarios**

- **Dictate on web**
  1. Sign in.
  2. Dictate a sentence.
  - Expected: Text appears; usage recorded.
- **Oversize**
  1. POST a 26 MiB file.
  - Expected: 413 with size message.
- **Wrong magic bytes**
  1. POST random bytes as audio/mpeg.
  - Expected: 415.
- **Kill switch**
  1. Turn dictation off for the user.
  - Expected: Unavailable error.
- **Video attach**
  1. Try to attach an .mp4 to chat.
  - Expected: Refused as unsupported type.

**Where to look when it fails**

- Log 'Transcription proxy failed' with status.
- Log '[transcriptions] refused audio that failed content inspection'.
- Managed usage reservation rows.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No video frame or transcript processing.** Affects: All apps. Evidence: no extractor found. Work needed: Build or drop from scope.
- **Mobile and Chrome dictation transport unclear.** Affects: surface:mobile, surface:chrome. Evidence: not found in files read. Work needed: Trace and document.
- **Local dictation rules unestablished.** Affects: surface:desktop, surface:mobile. Evidence: desktop local option exists, behaviour unread. Work needed: Verify free of subscription.
- **Only one provider supported for transcription.** Affects: Provider-agnostic goal. Evidence: apps/web/app/api/llm/v1/audio/transcriptions/route.ts:496-503. Work needed: Allow other providers if required.

**Depends on**

- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-local-inference
- provider:openai
- mode:cloud
- surface:web
- surface:desktop
- surface:vscode
- surface:cli

## Unknown

- Mobile and Chrome dictation transport.
- Behaviour of desktop local and web-speech providers.
- Free voice allowance sizes (free-voice-allowance.ts not read).
- Which UI states show for offline dictation.
