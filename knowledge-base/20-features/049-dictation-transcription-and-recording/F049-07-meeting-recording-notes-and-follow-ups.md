---
id: "F049-07"
type: "feature"
title: "Meeting recording, notes and follow-ups"
aliases: ["Meeting recording", "Meeting notes", "Meeting summary", "Action items", "Follow-up email draft", "Recording to project", "S49.16", "S49.20", "S49.21", "S49.22", "S49.23", "S49.24"]
area: "49 Dictation, transcription, and recording"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S49.16", "S49.20", "S49.21", "S49.22", "S49.23", "S49.24"]
depends_on: ["SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-memory-projects-and-context", "SYS-model-catalog-and-routing", "SYS-local-inference", "SYS-execution-boundaries", "file:apps/web/app/api/llm/v1/audio/transcriptions/route.ts", "api:POST /api/llm/v1/audio/transcriptions", "api:POST /api/voice/transcribe"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F049-07 Meeting recording, notes and follow-ups

Record a meeting and get a transcript, summary, action items, decisions and a follow-up email draft, then attach it to a project. No app builds this today. Dictation only handles short clips, so meeting-length audio does not fit the current path.

Area: [49. Dictation, transcription, and recording](README.md). Requirement items: [S49.16](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4916), [S49.20](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4920), [S49.21](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4921), [S49.22](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4922), [S49.23](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4923), [S49.24](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4924).

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

**What it does.** Would take a long recording of a meeting and turn it into a transcript, a summary, a list of action items, a list of decisions and a follow-up email draft, then link all of it to a project. None of this exists as a product feature in any of the six apps. [inferred from the brief marking S49.16 and S49.20 to S49.24 missing in every app] (doc: knowledge-base/data/area-briefs/049-dictation-transcription-and-recording.md)

**Why it exists.** The brief lists it as a required capability so the product can match what the leading assistants offer for meetings. (doc: knowledge-base/data/area-briefs/049-dictation-transcription-and-recording.md S49.16, S49.20-S49.24)

**Who uses it.** Would be people who attend meetings and want notes without typing them: knowledge workers, managers, sales staff. [proposed]

**Problems it solves**

- Would remove manual note taking in a meeting [proposed]
- Would turn spoken decisions and tasks into written follow-ups [proposed]
- Would keep the meeting record next to the project it belongs to [proposed]

**Use cases**

- Record a weekly team meeting on the phone, then read the action items [proposed]
- Record a customer call on the desktop and send the follow-up email draft [proposed]
- Attach the meeting summary to the project it belongs to [proposed]

## 2. User experience

**Where to find it**

- Not available in any app. No meeting recording control was found in Web, Desktop, Mobile, CLI, VS Code extension or Chrome extension. (doc: knowledge-base/data/area-briefs/049-dictation-transcription-and-recording.md S49.16)
- The nearest things are the short-clip dictation microphone button and live voice conversation, which are separate features.

**Before you start**

- None, because the feature is not built.

**Screens and controls**

- None exist. The only adjacent screen found is the project template named 'Meeting notes' in the shared project templates, which is a text template and does not record audio. (packages/contracts/types/src/project-templates.ts:65-71)

**Journey**

1. Not applicable. A person cannot start, run or finish a meeting recording flow today.
2. Closest workaround [inferred]: dictate short clips into the composer one at a time, or upload an audio file through the developer transcription API, then ask the assistant in a normal chat to summarise the pasted text.

**What the person sees and gets**

- None. No summary, action item list, decision list or email draft is produced from audio in any app.

**Settings**

- None found for meeting recording.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The transcription endpoint accepts an uploaded audio file up to 25 MB in mp3, mp4, m4a, wav, webm, ogg or flac, so a long recording can be transcribed in one batch call if a caller uses the API directly. (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:398)
- Dictation clips are capped by app: 60 seconds on phone (apps/mobile/src/features/voice/services/voiceInput.ts:68), 120 seconds on the command line (apps/cli/src/voice.rs:37), 120 seconds and 3 MB in the VS Code extension (apps/extension-vscode/src/protocol/dictationLimits.ts:1-3).

**Incomplete**

- No web recorder duration cap was found in the dictation store or hook I searched, so the web clip limit is unknown. (apps/web/features/chat/stores/voice-input-store.ts)

**Present but disconnected or switched off**

- The retained Tauri desktop code has a native speech and dictation module, but the spec says system dictation is a compile-time false and the public desktop is the hosted web app, so it does not reach users. (doc: docs/specs/desktop-global-voice/spec.md)

**Not available**

- Meeting recording, summary, action items, decisions summary, follow-up email draft and recording-to-project link: not available on web, desktop, mobile, CLI, VS Code or Chrome. (doc: knowledge-base/data/area-briefs/049-dictation-transcription-and-recording.md S49.16, S49.20-S49.24)
- No code was found with meeting, action-item or follow-up-email logic in the app source folders; the only matches were a project template, scheduling templates and routing text. (searched apps and packages for 'meeting' and 'action item')

## 4. Required behaviour

**Established requirements**

- The user can record a meeting and get it transcribed. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S49.16)
- A recorded meeting produces a summary. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S49.20)
- Action items are extracted from a recording transcript. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S49.21)
- Decisions made are summarised from a recording transcript. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S49.22)
- A follow-up email draft is generated from a recording. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S49.23)
- A recording and its transcript can be associated with a project. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S49.24)

**Acceptance criteria**

1. A person can start and stop a recording longer than the current 60 to 120 second clip limits on at least web, desktop and mobile, with a visible elapsed time.
2. The finished recording produces a transcript without the person pasting audio anywhere.
3. A summary, a list of action items, a list of decisions and an email draft are produced from the transcript and shown together.
4. The person can attach the result to a project and find it again from that project.
5. A notice says what is recorded and where it goes before capture starts.
6. The feature obeys the same subscription, quota and Local, own key and Cloud rules as other voice features, and a refusal says why.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Meeting length audio will exceed the 25 MB upload cap of the transcription endpoint at common bitrates, so recording must be split into chunks or compressed. [inferred from route.ts:398]
- Because transcription is metered against voice minutes for paid plans, a long meeting needs a clear quota message. [inferred from route.ts:594-596]

**Proposed improvements** (suggestions, not requirements)

- Record in chunks on the device and transcribe each chunk, then run summary steps on the joined text. [proposed]
- Reuse the existing project template for meeting notes as the destination for the summary. [proposed]
- Offer an on-device transcription path on phone and desktop so Local mode works without any subscription. [proposed]

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/llm/v1/audio/transcriptions | `apps/web/app/api/llm/v1/audio/transcriptions/route.ts` | Would build on: batch audio file transcription, 25 MB cap, quota and usage accounting. Does not implement meetings. |
| endpoint | POST /api/voice/transcribe | `apps/web/app/api/voice/transcribe/route.ts` | Would build on: dictation entry to the same handler behind the dictation kill switch. Does not implement meetings. |
| service | voiceInput capture service | `apps/mobile/src/features/voice/services/voiceInput.ts` | Would build on: phone on-device capture with a 60 second limit (MAX_LISTEN_MS). Does not implement meetings. |
| service | CLI voice module | `apps/cli/src/voice.rs` | Would build on: command line capture with a 120 second cap and a temporary recording folder. Does not implement meetings. |
| config | VS Code dictation limits | `apps/extension-vscode/src/protocol/dictationLimits.ts` | Would build on: 120 second and 3 MB clip limits. Does not implement meetings. |
| store | voice-input-store | `apps/web/features/chat/stores/voice-input-store.ts` | Would build on: web browser recorder and upload to the transcribe endpoint. Does not implement meetings. |
| config | project templates | `packages/contracts/types/src/project-templates.ts` | Would build on: a project template named 'Meeting notes' (id meetings). Does not record audio. |
| service | free voice allowance | `apps/web/lib/voice/free-voice-allowance.ts` | Would build on: monthly free voice seconds for the free plan, used by dictation transcription. |
| service | tier unit quota | `apps/web/lib/services/tier-unit-quota-service.ts` | Would build on: voice_minutes allowance check for paid plans (imported by the transcription route). |
| other | area brief | `knowledge-base/data/area-briefs/049-dictation-transcription-and-recording.md` | Source of the required behaviour S49.16 and S49.20-S49.24. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No meeting flow runs. A person can only send a short dictation clip, which is recorded in the app and sent for transcription. | device | apps/mobile/src/features/voice/services/voiceInput.ts:68; apps/cli/src/voice.rs:37 |
| For a batch transcription call, the server checks the request, reserves usage, forwards the audio to the transcription provider with a 60 second timeout and settles the cost. No summary step follows. | our servers | apps/web/app/api/llm/v1/audio/transcriptions/route.ts:594-596, 722-731 |
| The provider turns the audio into text. | outside service | apps/web/app/api/llm/v1/audio/transcriptions/route.ts:722 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No meeting recording, summary or action item data exists. | nowhere | not applicable | not applicable. The privacy page says the dictation route keeps no audio. (doc: apps/web/app/privacy/page.tsx:255-257) |

**Models and providers.** Not applicable because the feature is unbuilt. Today the batch transcription route calls one provider endpoint, openai, with the transcription slot model from the catalog, so a meeting feature built on it would inherit that single provider. (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:496, 722) See SYS-model-catalog-and-routing.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not applicable. The existing transcription route requires a signed-in user or a developer API key with inference write scope. (apps/web/app/api/llm/v1/audio/transcriptions/route.ts getClerkAuthUser call) |
| Permissions | Not applicable. A future recorder would need microphone permission on each app. [inferred] |
| Subscription | None found in the code for meetings. Existing transcription is metered: free plan has a monthly free voice allowance and paid plans use voice minutes. (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:594-596; apps/web/lib/voice/free-voice-allowance.ts:47) |
| Limits and metering | None found in the code for meetings. Existing clip limits: phone 60 s, command line 120 s, VS Code 120 s and 3 MB, server 25 MB. |
| Feature flags | None found for meetings. Dictation has a capability kill switch named dictation. (apps/web/lib/feature-flags/kill-switches.ts:33) |
| Model compatibility | Not applicable. Summary and email drafting would be ordinary chat turns on any model the chat pipeline can route to. [inferred] |
| Provider restrictions | None found in the code for meetings. The transcription route is wired to the openai endpoint only. (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:722) |
| Local mode | Not applicable. No Local meeting path exists. Phone dictation transcribes on the device, so a Local recorder is technically possible there. [inferred] (apps/mobile/src/features/voice/services/voiceInput.ts:309-321) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Person looks for a meeting recorder | None is shown in any app; not handled in the code because the feature is absent. | area brief S49.16 |
| Recording longer than the clip limit | Phone stops at 60 s (error code max-duration-reached exists), command line at 120 s, VS Code at 120 s. No chaining of clips exists. | apps/mobile/src/features/voice/services/voiceInput.ts:16,68; apps/cli/src/voice.rs:731-737; apps/extension-vscode/src/protocol/dictationLimits.ts:3 |
| Audio file over 25 MB sent to the transcription route | Refused with a size message. | apps/web/app/api/llm/v1/audio/transcriptions/route.ts:398-420 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/audio/transcriptions/route.test.ts`: The batch transcription route that a meeting feature would rely on.
- `apps/web/app/api/voice/transcribe/__tests__/route.kill-switch.test.ts`: The dictation kill switch in front of the transcription route.
- `apps/extension-vscode/src/__tests__/dictationClient.test.ts`: VS Code dictation upload to the transcribe endpoint.

**Test scenarios**

- **Absence on web**
  1. Sign in to the web app
  2. Open a chat and inspect the composer controls and Settings > Voice
  - Expected: No meeting recording control or meeting notes option is present.
- **Absence on phone**
  1. Open the phone app chat
  2. Hold or tap the microphone control and wait past 60 seconds
  - Expected: Capture stops at the limit; no meeting mode is offered.
- **Absence on command line**
  1. Start the CLI, use /voice, record past 120 seconds
  - Expected: Recording stops at 120 seconds; no summary or action items are produced.
- **Large file upload**
  1. Send an audio file larger than 25 MB to the transcription API with a valid key
  - Expected: The request is refused as too large.
- **Search code for meeting logic**
  1. Search apps and packages for 'action item' and 'follow-up email' in source files
  - Expected: No recording or transcript summary implementation is found, matching this page.

**Where to look when it fails**

- Transcription route warnings 'Transcription proxy failed' and reservation errors are logged (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:732, 633).
- Nothing to check for the meeting flow itself.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No meeting recorder in any app** Affects: All six apps. Evidence: S49.16 status missing everywhere (area brief). Work needed: Design a long-recording capture per app, with chunking, a notice and a visible timer.
- **No summary, action items, decisions or email draft from a transcript** Affects: All six apps. Evidence: S49.20-S49.23 missing everywhere (area brief). Work needed: Add chat-turn templates or tools that take a transcript and return the four outputs.
- **No link between a recording and a project** Affects: Web, desktop, mobile. Evidence: S49.24 missing (area brief). Work needed: Decide the storage record and project association, then add a migration through the numbered chain.
- **Clip limits and the 25 MB cap do not fit meeting length audio** Affects: Phone, CLI, VS Code, web upload. Evidence: voiceInput.ts:68; voice.rs:37; dictationLimits.ts:1-3; route.ts:398. Work needed: Chunk and join, or stream, with quota rules for long minutes.
- **Transcription path is single provider** Affects: Any future meeting feature on managed cloud. Evidence: route.ts:722. Work needed: Route transcription through the provider-agnostic layer.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-memory-projects-and-context
- SYS-model-catalog-and-routing
- SYS-local-inference
- SYS-execution-boundaries
- file:apps/web/app/api/llm/v1/audio/transcriptions/route.ts
- api:POST /api/llm/v1/audio/transcriptions
- api:POST /api/voice/transcribe

## Unknown

- Whether the web recorder has a maximum duration (not found in voice-input-store.ts or use-dictation.ts).
- Whether any planned design for meeting recording exists in docs/specs or audit; not searched in depth.
- Whether the Chrome extension could capture tab audio; not examined.
