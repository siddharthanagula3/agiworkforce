---
id: "F049-06"
type: "feature"
title: "Transcript timestamps, speakers, search and seek"
aliases: ["Timestamped transcript", "Speaker labels", "Speaker rename", "Transcript search", "Seek audio from transcript", "S49.11", "S49.12", "S49.13", "S49.14", "S49.15"]
area: "49 Dictation, transcription, and recording"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S49.11", "S49.12", "S49.13", "S49.14", "S49.15"]
depends_on: ["F049-04", "F049-05", "SYS-voice-and-media", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-data-model-and-migrations", "SYS-inference-providers", "surface:web", "surface:mobile"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F049-06 Transcript timestamps, speakers, search and seek

Planned: transcripts with time marks per segment or word, speaker names that can be corrected, search inside a recording, and clicking a line to play from that point. None of it is built in any app. Dictation returns plain text and keeps no audio or transcript after insertion.

Area: [49. Dictation, transcription, and recording](README.md). Requirement items: [S49.11](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4911), [S49.12](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4912), [S49.13](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4913), [S49.14](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4914), [S49.15](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4915).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would add structure to transcripts: timestamps, speakers, rename, search, and click-to-seek. Currently it does nothing; the items are all marked missing. (brief S49.11 to S49.15)

**Why it exists.** It supports meeting-style recordings (S49.16, S49.20-S49.24, all missing). It is listed in the brief but no product decision text was found asking for it.

**Who uses it.** Nobody today. Intended for people reviewing recorded conversations.

**Problems it solves**

- Would help find who said what and when in a long recording.

**Use cases**

- Open a meeting transcript and read time marks.
- Rename 'Speaker 1' to a person's name.
- Search for a word and jump to its moment in the audio.

## 2. User experience

**Where to find it**

- Not available in web, desktop, phone, CLI, VS Code or Chrome.

**Before you start**

- Not applicable.

**Screens and controls**

- none found in the code

**Journey**

1. Not applicable. The only flow is F049-01, which returns plain text.

**What the person sees and gets**

- Dictation shows only the final text (use-dictation.ts:189-215).

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for these items. The proxy forwards only file, model and language to the provider, with no request for segments or timestamps (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:548-556).
- Web dictation keeps no transcript or audio after insertion; it persists only language and microphone (apps/web/features/chat/stores/voice-input-store.ts:436-443).

**Incomplete**

- none found in the code

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Timestamps, speaker labels, speaker rename, transcript search and click-to-seek in all six apps and the API (brief S49.11 to S49.15).
- Audio download and recordings as saved objects (brief S49.26, S49.27 context) are outside this feature; saved audio does not exist for dictation (voice-input-store.ts:438; ChatInput.tsx:1375 'Audio isn't saved').

## 4. Required behaviour

**Established requirements**

- A transcript can carry timestamps per segment or word. (source: brief S49.11)
- A multi-speaker transcript labels who spoke each part. (source: brief S49.12)
- The user can correct or rename speaker labels. (source: brief S49.13)
- The user can search within a recording transcript. (source: brief S49.14)
- Clicking a transcript line seeks the audio to that moment. (source: brief S49.15)
- Voice transcripts are chat messages, so export and deletion follow the chat; no download of spoken replies; features ChatGPT and Claude do not offer are not built. (source: docs/decisions/2026-09-27-founder-decisions.md:73 and 250-258 (D-2026-09-27-02, D-2026-09-28-12))

**Acceptance criteria**

1. API response for a recording includes segments with start and end times (when built).
2. A multi-speaker file returns speaker labels.
3. Renaming a speaker updates every line of that speaker.
4. Searching a term lists matching lines and highlights them.
5. Clicking a line moves audio playback to its start time.
6. Until built: every app shows no such control and no control is dead.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- These need stored audio and stored transcripts, which dictation does not keep [inferred from voice-input-store.ts:438-443].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Check whether ChatGPT and Claude offer these before building, per D-2026-09-27-02.
- [proposed] If built, request segment output from the provider and store segments with the recording, under the retention rules for F049 area items S49.24-S49.27.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | transcriptions proxy | `apps/web/app/api/llm/v1/audio/transcriptions/route.ts` | Forwards only file, model and language; would need segment output |
| store | useVoiceInputStore | `apps/web/features/chat/stores/voice-input-store.ts` | Persists only language and microphone; no transcript or audio kept |
| hook | useDictation deliver | `apps/web/features/chat/hooks/use-dictation.ts` | Delivers trimmed text only |
| service | CLI transcript request | `apps/cli/src/voice.rs` | Requests plain text format (openai_transcription_request line 1015) |
| service | mobile voiceInput | `apps/mobile/src/features/voice/services/voiceInput.ts` | Returns text and confidence only (OnDeviceTranscriptResult) |
| service | VS Code dictationClient | `apps/extension-vscode/src/features/sidebar-webview/dictationClient.ts` | Reads only data.text |
| service | Chrome voice | `apps/extension/src/features/side-panel/voice.ts` | Uses the first alternative's transcript only |
| service | live-voice-session | `apps/web/features/chat/lib/live-voice-session.ts` | Transcript delta events; no timestamps used |
| endpoint | live voice sessions | `apps/web/app/api/voice/live/sessions/route.ts` | Streams sessions; no stored audio seen |
| other | conversation export (S49.25 context) | `apps/web/features/chat/pages/WebChatPage.tsx` | Chat export that carries voice messages as text; not a transcript viewer |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Audio is transcribed to plain text and the audio is not kept. | device and our servers | voice-input-store.ts:243-245, 438-443; route.ts:466-468 |
| No step produces timestamps, speakers, a search index or a seek target. | device | not handled in the code |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Transcript structure (segments, speakers) | none; not created | Not applicable | Not applicable |

**Models and providers.** Not applicable today. A provider that returns segments would be needed; whether the current openai speech model supports it was not checked (unknown).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | unknown. |
| Provider restrictions | unknown. |
| Local mode | none found in the code; phone on-device recognizer returns text and confidence only (voiceInput.ts:28-32). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Any state | not handled in the code; no UI exists | searched the files in the implementation map |
| Dictation result | Plain trimmed text only | use-dictation.ts:189-215 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `test:apps/web/__tests__/api/voice-transcribe.test.ts` (not found): Plain text response only; nothing about timestamps

**Test scenarios**

- **Confirm absence in web**
  1. Dictate on web
  2. Look for any time marks, speaker names, search or playback
  - Expected: None appear.
- **Confirm API shape**
  1. POST audio to the transcription endpoint with a valid key
  2. Inspect JSON
  - Expected: An object with text and no segment list (unless the provider adds one by default, which was not checked).
- **Confirm no stored audio**
  1. Dictate on web, reload the page
  2. Look in localStorage 'agi-web-voice-input'
  - Expected: Only language and microphoneId.

**Where to look when it fails**

- Search the repo for segments, timestamps or diarization terms in the voice code (none found in the files read).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No timestamps, speaker labels, speaker rename, transcript search or click-to-seek.** Affects: All six apps and the API. Evidence: brief S49.11-S49.15. Work needed: Product decision, then provider output, storage, viewer and tests.
- **No stored recording or transcript object exists for these to act on.** Affects: All. Evidence: voice-input-store.ts:438-443; ChatInput.tsx:1375. Work needed: Design recordings storage and retention first (related S49.16, S49.24-S49.27).
- **No founder decision found requiring these features; D-2026-09-27-02 says features ChatGPT and Claude do not offer are not built.** Affects: Planning. Evidence: docs/decisions/2026-09-27-founder-decisions.md:73. Work needed: Check leader behaviour and record the decision.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F049-04
- F049-05
- SYS-voice-and-media
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-data-model-and-migrations
- SYS-inference-providers
- surface:web
- surface:mobile

## Unknown

- Whether ChatGPT and Claude offer these features (not researched here).
- Whether the current provider speech model can return segments or speakers.
- Whether any planned design exists in audit/ (not searched).
- Whether chat export (S49.25) includes time marks for voice messages (not read).
