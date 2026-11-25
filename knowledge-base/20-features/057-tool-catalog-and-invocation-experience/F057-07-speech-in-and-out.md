---
id: "F057-07"
type: "feature"
title: "Speech in and out"
aliases: ["Transcription endpoint", "Audio transcriptions API", "POST /api/llm/v1/audio/transcriptions", "Voice transcribe (dictation route)", "Read aloud speech endpoint", "S57.19 Transcription tool", "S57.20 Speech-generation tool"]
area: "57 Tool catalog and invocation experience"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S57.19", "S57.20"]
depends_on: ["surface:web", "mode:cloud", "provider:openai", "SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "SYS-model-catalog-and-routing", "file:apps/web/app/api/llm/v1/audio/transcriptions/route.ts", "api:POST /api/llm/v1/audio/transcriptions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F057-07 Speech in and out

The product turns an uploaded audio file into text through an API endpoint. There is no chat tool for transcription and none for speech. A separate read-aloud endpoint turns text into speech, but the model cannot call it. Dictation in the composer reuses the same transcription handler and is outside this area.

Area: [57. Tool catalog and invocation experience](README.md). Requirement items: [S57.19](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5719), [S57.20](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5720).

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

**What it does.** Accepts a multipart upload (field file, optional model and language), checks account, plan, spend and file rules, sends the audio to one transcription provider and returns the text. The same handler also serves composer dictation. Speech generation is not offered to the model as a tool; a read-aloud endpoint exists for the apps (apps/web/app/api/voice/speech/route.ts:40-48,102).

**Why it exists.** Developers who use the AGI API with an API key, and the first-party apps, need speech to text with the same entitlement, quota and spend rules as chat. The brief asks for a transcription endpoint beyond composer dictation (doc: knowledge-base/data/area-briefs/057-tool-catalog-and-invocation-experience.md S57.19).

**Who uses it.** Developers calling the API with an API key or a session token, and the web and phone apps through the dictation route (apps/web/app/api/voice/transcribe/route.ts:10,29).

**Problems it solves**

- Getting text from a recording without running a model locally.
- Charging and limiting speech to text through the same subscription and credit system as chat.
- Rejecting files that are not audio before any provider spend.

**Use cases**

- A developer posts a recording with an API key and gets the transcript back.
- A signed-in person dictates into the web composer, which calls the dictation route that reuses this handler.
- A Free-plan person uses the free voice allowance for dictation (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:594,624-660).

## 2. User experience

**Where to find it**

- API: POST /api/llm/v1/audio/transcriptions, listed in apps/web/public/openapi.json under Inference (apps/web/public/openapi.json:2662-2665).
- Web and Desktop (hosted web app in Electron): no visible tool card; transcription is reached only through dictation in the composer, which is outside this area.
- Mobile, CLI, VS Code, Chrome: no transcription tool card found. Whether each one calls the dictation route is unknown (only apps/web files matched a search for the audio path).
- Read aloud: Web uses apps/web/lib/hooks/useTTS.ts:10 and Mobile uses apps/mobile/src/features/voice/services/serverSpeech.ts:10, both on /api/voice/speech.

**Before you start**

- A signed-in account or an API key with the inference:write scope (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:297; apps/web/public/openapi.json:2675).
- Audio no larger than 25 MB in an accepted audio type (route.ts:398-411).
- Adult eligibility for non-API-key callers (route.ts:307-312).

**Screens and controls**

- No chat screen or tool card exists for transcription or speech generation (doc: knowledge-base/data/area-briefs/057-tool-catalog-and-invocation-experience.md S57.19, S57.20).
- The API takes file, model and language form fields (apps/web/public/openapi.json:2683-2695).

**Journey**

1. 1. The caller sends a multipart POST with the audio file.
2. 2. The server checks CSRF, rate limit, identity, spend and policy gates.
3. 3. The server checks size, type and the first bytes of the file.
4. 4. The server reserves credit, or grants free voice seconds on a Free plan.
5. 5. The audio goes to the transcription provider.
6. 6. The server settles the cost and returns the transcript.

**What the person sees and gets**

- On success the OpenAI-style transcription response (openapi lists 200 'Transcription').
- Errors: 400 missing file, 413 over 25 MB, 415 unsupported type or non-audio bytes (route.ts:380-460), 429 rate limited (apps/web/public/openapi.json:2745-2760).

**Settings**

- Admission is by plan and workspace policy; there is no per-user setting for this endpoint found.
- The model field is honoured only if it is a live speech-to-text model of the one provider; otherwise the default slot voice_transcription is used (route.ts:520-529; apps/web/public/openapi.json:2688-2691).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Transcription endpoint with rate limit, CSRF, API-key scope, spend gate, org policy gate, size and type checks, content sniff and upload scan (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:288-480).
- Credit reservation and settlement for paid plans; free voice allowance grant for Free plan (route.ts:594-660,780-815).
- Dictation route reuses the same handler (apps/web/app/api/voice/transcribe/route.ts:10,29).
- Read-aloud speech endpoint with a 4,000 character cap, voice and speed fields (apps/web/app/api/voice/speech/route.ts:40-48).

**Incomplete**

- Transcription is pinned to a single provider; the code throws if the voice_transcription slot is not that provider's speech-to-text model (route.ts:500-505). Provider agnosticism does not apply here.

**Present but disconnected or switched off**

- Speech generation is not connected as a model tool on any app; the read-aloud endpoint is not under /api/llm/v1 (no speech route found in that folder listing: audio, chat, credits, embeddings, models).

**Not available**

- Transcription chat tool card: not available on Web, Desktop, Mobile, CLI, VS Code, Chrome (brief S57.19 lists api only).
- Speech generation tool: not applicable on every app (brief S57.20).

## 4. Required behaviour

**Established requirements**

- Transcription is an API endpoint and has no chat tool card. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.19)
- Speech generation is not applicable on any app. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.20)
- The endpoint caps uploads at 25 MB and sniffs the first bytes. (source: apps/web/public/openapi.json:2665)

**Acceptance criteria**

1. A valid audio file under 25 MB with an API key that has inference:write returns a transcript.
2. A file over 25 MB returns 413.
3. A file with a declared audio type but non-audio bytes returns 415.
4. A key without inference:write is refused with 403.
5. A Free-plan API key is refused before any grant or provider spend (test: apps/web/app/api/llm/v1/audio/transcriptions/route.test.ts:423).
6. A provider failure voids the credit reservation (route.test.ts:280-310).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Because the same handler serves dictation, a change to its limits changes dictation on every app that uses it.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Record in the knowledge base whether the speech read-aloud endpoint should be reclassified from 'not applicable' to a separate feature, since it exists and two apps call it.
- [proposed] Add the dictation and read-aloud routes to the API description if they are meant to be public.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/llm/v1/audio/transcriptions | `apps/web/app/api/llm/v1/audio/transcriptions/route.ts` | Main handler: gates, validation, reservation, provider call, settlement |
| endpoint | POST /api/voice/transcribe | `apps/web/app/api/voice/transcribe/route.ts` | Dictation route that wraps the same handler |
| endpoint | POST /api/voice/speech | `apps/web/app/api/voice/speech/route.ts` | Read-aloud text to speech with credit reservation |
| config | OpenAPI entry | `apps/web/public/openapi.json` | Publishes the transcription operation, limits and error codes |
| config | voice_transcription slot | `packages/ai/model-registry/catalog/routing-policies.json` | Names the default transcription model slot |
| config | voice_speech slot | `packages/ai/model-registry/catalog/routing-policies.json` | Names the default speech model slot |
| hook | useTTS | `apps/web/lib/hooks/useTTS.ts` | Web client of the read-aloud endpoint |
| service | serverSpeech | `apps/mobile/src/features/voice/services/serverSpeech.ts` | Mobile client of the read-aloud endpoint |
| service | managed usage requests | `apps/web/lib/services/managed-usage-request-service.ts` | Reserves, finalizes and voids credit for the call |
| service | entitlement resolution | `apps/web/lib/services/entitlement-resolution.ts` | Resolves plan and subscription for the caller |
| service | tier unit quota | `apps/web/lib/services/tier-unit-quota-service.ts` | Checks the voice_minutes allowance for the plan |
| test | transcription route tests | `apps/web/app/api/llm/v1/audio/transcriptions/route.test.ts` | Covers reservation, settlement, idempotency, free allowance |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The caller uploads the audio with a CSRF token or API key; rate limit and identity are checked. | our servers | apps/web/app/api/llm/v1/audio/transcriptions/route.ts:288-297 |
| Spend, adult-eligibility, managed-compute and workspace policy gates run before the body is read. | our servers | route.ts:299-355 |
| Size, MIME type, first-byte sniff and an upload scan run on the bytes. | our servers | route.ts:398-480 |
| Credit is reserved (paid) or free voice seconds are granted (Free plan). | our servers | route.ts:594-660 |
| The audio is forwarded to the transcription provider and dropped; nothing stores it. | outside service | route.ts:467-469,722 |
| Usage is settled from provider token counts or the estimate, and a log line is written. | our servers | route.ts:780-830 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Audio bytes | not stored | no | Sent to the provider and dropped (route.ts:467-469) |
| Usage and cost records | managed usage requests and the free voice allowance records | server side only | unknown retention period |

**Models and providers.** One provider only: the voice_transcription slot must resolve to that provider's speech-to-text model or the handler throws (route.ts:500-505). A caller may name a live speech-to-text model of that provider; anything else falls back to the slot default (apps/web/public/openapi.json:2688-2691). The provider's training policy is checked against the person's privacy setting (route.ts:506-518). Read-aloud speech uses the voice_speech slot (apps/web/app/api/voice/speech/route.ts:102).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in session or API key with inference:write (route.ts:297; apps/web/public/openapi.json:2675). Adult eligibility gate for non-key callers (route.ts:307-312). |
| Permissions | Workspace policy gate for provider, model and feature audio_transcription (route.ts:333-352). Spend limit gate (route.ts:355). |
| Subscription | Managed compute access is evaluated against the subscription (route.ts:574-586). A developer API key on the Free plan is refused (route.test.ts:423). |
| Limits and metering | 25 MB cap; credit reservation by estimated audio seconds; voice_minutes tier allowance for paid plans; free voice allowance seconds on Free (route.ts:594-660). Rate limit bucket audio-transcription (route.ts:294). |
| Feature flags | Dictation route has a kill switch test (apps/web/app/api/voice/transcribe/__tests__/route.kill-switch.test.ts); the flag name is unknown. |
| Model compatibility | Only the provider's live speech-to-text models; other model ids fall back to the default. |
| Provider restrictions | One provider; refused when privacy settings keep content away from providers that may train (route.ts:506-518). |
| Local mode | The handler is a server endpoint, so it is Cloud only. No on-device transcription path was opened in this area; unknown whether Mobile or Desktop dictation has a local alternative (see SYS-voice-and-media). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Missing file | 400 'Missing audio file' | route.ts:380-394 |
| Too large | 413 with the byte limit | route.ts:412-428 |
| Wrong type or non-audio bytes | 415 | route.ts:429-460 |
| Provider unreachable or failing | The reservation is released and a generic message is returned | route.ts:732-740 |
| Repeat of the same Idempotency-Key | 409 for a settled or in-progress free-allowance recording | route.ts:638-655 |
| Offline, cancel, timeout, retry on a card | not handled in the code for a tool card, because none exists | No tool card or client for transcription found in the files searched (apps/web, apps/mobile, apps/cli, apps/extension) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/audio/transcriptions/route.test.ts`: Reservation before spend, settlement from provider usage, voiding on provider failure, idempotency key, free allowance grant, Free-plan key refusal
- `apps/web/__tests__/api/voice-transcribe.test.ts`: Dictation route (contents not opened; name only)
- `apps/web/__tests__/security/b4-audio-mime-bypass.test.ts`: Audio MIME bypass checks (name only)
- `apps/web/app/api/llm/v1/__tests__/developer-api-contract.test.ts`: Developer API contract including the audio path (name only)
- `apps/web/app/api/voice/speech/__tests__/route.test.ts`: Read-aloud speech endpoint (name only)

**Test scenarios**

- **Happy path with API key**
  1. POST a small audio file with an inference:write key
  2. Read the response
  - Expected: A transcript is returned and a usage record is settled
- **Oversize file**
  1. POST a file over 25 MB
  - Expected: 413 and no provider call
- **Fake audio**
  1. POST text bytes with an audio MIME type
  - Expected: 415
- **Free plan key**
  1. POST with a Free-plan API key
  - Expected: Refused before any grant or provider spend
- **No tool card**
  1. In any chat app ask the assistant to transcribe a file
  - Expected: No transcription or speech tool is offered to the model

**Where to look when it fails**

- Log line 'Failed to parse transcription form data' (route.ts:361).
- Log event transcription_reservation_failed (route.ts:668).
- Log line '[transcriptions] refused audio that failed content inspection' (route.ts:~475).
- Error codes insufficient_quota and model_may_train in the response body.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Speech generation exists as a read-aloud endpoint but the brief says it is not applicable.** Affects: Web and Mobile read aloud. Evidence: apps/web/lib/hooks/useTTS.ts:10; apps/mobile/src/features/voice/services/serverSpeech.ts:10; brief S57.20. Work needed: Decide whether to document read aloud as its own feature and update the brief.
- **Transcription is tied to one provider.** Affects: All callers. Evidence: route.ts:500-505. Work needed: A second provider route if provider agnosticism must hold for speech.
- **No Local (on-device) transcription found in this endpoint.** Affects: Mobile and Desktop Local mode. Evidence: Server-only handler. Work needed: Check SYS-local-inference and SYS-voice-and-media for a device path.

**Depends on**

- surface:web
- mode:cloud
- provider:openai
- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- SYS-model-catalog-and-routing
- file:apps/web/app/api/llm/v1/audio/transcriptions/route.ts
- api:POST /api/llm/v1/audio/transcriptions

## Unknown

- Whether Mobile, Desktop, VS Code or Chrome dictation calls this endpoint.
- The name of the dictation kill-switch flag.
- Retention period of the usage records.
- Whether any app can transcribe on the device in Local mode.
