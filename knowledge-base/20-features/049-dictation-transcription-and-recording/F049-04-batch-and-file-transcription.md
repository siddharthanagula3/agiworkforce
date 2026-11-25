---
id: "F049-04"
type: "feature"
title: "Batch and file transcription"
aliases: ["Batch transcription", "File transcription", "Audio transcription endpoint", "POST /api/voice/transcribe", "POST /api/llm/v1/audio/transcriptions", "Audio-file upload", "S49.08", "S49.09"]
area: "49 Dictation, transcription, and recording"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "built", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S49.08", "S49.09"]
depends_on: ["F049-01", "provider:openai", "SYS-inference-providers", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-execution-boundaries", "mode:cloud", "api:POST /api/voice/transcribe", "api:POST /api/llm/v1/audio/transcriptions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F049-04 Batch and file transcription

Turns a whole recording or audio file into text in one request. Web, desktop, CLI and VS Code use it after you stop recording. Developers can call the API with an audio file. The phone has an on-device file transcriber. No app screen lets a person upload an existing audio file.

Area: [49. Dictation, transcription, and recording](README.md). Requirement items: [S49.08](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4908), [S49.09](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4909).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | not stated on this page | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Accepts one complete audio file, checks it, bills it against the person's plan, sends it to the speech provider and returns the text. (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:273-858)

**Why it exists.** Brief S49.09 requires batch transcription; S49.08 requires audio-file upload. It is the one cloud path shared by dictation and developer use.

**Who uses it.** The web, desktop, CLI and VS Code dictation flows; developers holding an API key with the inference:write scope; the phone's voice screen for on-device file transcription.

**Problems it solves**

- One consistent, quota-checked transcription path.
- Files that fail content checks are refused before provider spend.

**Use cases**

- Developer posts a recording with a file field and optional language and gets JSON with text.
- Web dictation uploads a recorded blob.
- CLI uploads a WAV from a push-to-talk session.
- Phone transcribes a recorded voice note on the device.

## 2. User experience

**Where to find it**

- Developers: POST /api/llm/v1/audio/transcriptions with a Bearer token or API key (route.ts:297).
- Dictation apps: no separate screen; it runs after stop (F049-01).
- Phone: the voice screen transcribes a recorded file on device (apps/mobile/app/(app)/voice.tsx:342).
- No end-user upload-a-file screen in any app (brief S49.08).

**Before you start**

- Sign-in or an API key with the inference:write scope; adult-eligibility for session users; plan or free allowance remaining.

**Screens and controls**

- API only; request is multipart with fields file, model (optional), language (optional); header Idempotency-Key optional (route.ts:373-381, 575-580).

**Journey**

1. Client sends multipart form.
2. Server validates and bills.
3. Server returns provider JSON, normally an object with 'text'.
4. Client reads text.

**What the person sees and gets**

- JSON from the provider with text (voice-input-store.ts:243-245 reads data.text).
- Errors: 400 invalid form or missing file or failed content scan; 413 'Audio file exceeds maximum size of 26214400 bytes'; 415 unsupported type or content; 403 privacy; 402/429 allowance or rate; 451 region (route.ts:277-290, 398-500).

**Settings**

- none found in the code for end users. Developer keys and project spend caps apply (route.ts:299-306).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Full server pipeline: region block, CSRF, rate limit 'audio-transcription', auth, project spend limits for API keys, age gate for sessions, managed compute gates, organization and model policy, workspace budget (route.ts:273-360, 533-545).
- Validation: 25 MB cap, MIME allow-list (mpeg, mp3, mp4, m4a, wav, webm, ogg, flac variants), magic-byte check, content scan (route.ts:398-500).
- Billing: reservation per request for paid plans; monthly free allowance grant and settle for the free plan; refund on provider failure (route.ts:594-720).
- Provider call with 60 s timeout to the openai provider; usage settlement from provider token usage or an estimate (route.ts:722-850).
- Dictation wrapper checks the 'dictation' kill switch first (apps/web/app/api/voice/transcribe/route.ts:18-29).
- Phone file transcription on device, continuous, no interim (voiceInput.ts:475-511; used by voice.tsx:342).
- CLI sends WAV to this endpoint on the managed backend (voice.rs:1025-1076).

**Incomplete**

- No end-user screen for uploading an audio file (brief S49.08 missing for all apps).
- The kill switch applies to /api/voice/transcribe but the /api/llm/v1/audio/transcriptions route is built with no admission check (route.ts:858), so developer calls bypass the dictation switch [inferred from the code: admit is optional and the default POST passes none].

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Chrome: not applicable, uses the browser's speech recognition (voice.ts:155).
- Phone: no cloud batch path; on-device only (voiceInput.ts:475-511).
- Timestamps, speakers and other output formats: not requested by the proxy (route.ts:548-556 forwards only file, model, language).

## 4. Required behaviour

**Established requirements**

- The user can upload an existing audio file and get its transcript (API done; web, desktop, CLI, VS Code, Chrome missing). (source: brief S49.08)
- A whole recording or file can be transcribed in one non-streaming request. (source: brief S49.09)
- Nothing may silently route Local audio to cloud without explicit gate. (source: AGENTS.md section 6; apps/cli/src/voice.rs:44-56)
- Inference cost is a first-class constraint; model IDs come from the catalog. (source: AGENTS.md sections 4 and 7)

**Acceptance criteria**

1. POST a 1 MB wav with a valid session: 200 and JSON text.
2. POST a 26 MB file: 413.
3. POST a text file labelled audio/wav: 415 from the content check.
4. POST without a file: 400 'Missing audio file'.
5. POST while the monthly allowance is spent on a Free account: refusal with an allowance code, no provider call.
6. POST /api/voice/transcribe with the dictation switch closed: refused before any billing.
7. Provider returns an error: reservation is voided and the status is passed on.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Seconds are estimated from file size, so billing for compressed audio is approximate [inferred from estimateAudioSeconds constants at route.ts:108-115].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'Transcribe an audio file' entry in web and phone, if product decides to match leaders.
- [proposed] Apply the dictation kill switch to the developer endpoint if appropriate.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/llm/v1/audio/transcriptions | `apps/web/app/api/llm/v1/audio/transcriptions/route.ts` | Main handler |
| endpoint | POST /api/voice/transcribe | `apps/web/app/api/voice/transcribe/route.ts` | Dictation wrapper with kill switch |
| service | upload-scan | `apps/web/lib/security/upload-scan.ts` | Content inspection (imported at route.ts:15) |
| service | managed-usage-request-service | `apps/web/lib/services/managed-usage-request-service.ts` | Reserve, mark started, finalize and delivery marker |
| service | tier-unit-quota-service | `apps/web/lib/services/tier-unit-quota-service.ts` | voice_minutes allowance check; TRANSCRIPTION_OPERATION |
| service | free-voice-allowance | `apps/web/lib/voice/free-voice-allowance.ts` | Free-plan monthly seconds |
| service | cogs-ledger-service | `apps/web/lib/services/cogs-ledger-service.ts` | Records provider cost of free-allowance transcriptions |
| service | managed-compute-gate | `apps/web/lib/managed-compute-gate.ts` | Org policy, spend, model policy gates |
| config | provider-endpoints | `apps/web/lib/server/provider-endpoints.ts` | providerApiUrl for the speech provider |
| config | routing slot voice_transcription | `packages/ai/model-registry/catalog/routing-policies.json` | Which catalog model transcribes (slot at line 904) |
| store | voice-input-store transcribeViaServer | `apps/web/features/chat/stores/voice-input-store.ts` | Web client of the endpoint |
| service | CLI transcribe_managed | `apps/cli/src/voice.rs` | CLI client with Idempotency-Key and 60 s timeout |
| service | VS Code transcribeDictation | `apps/extension-vscode/src/features/sidebar-webview/dictationClient.ts` | VS Code client with ?surface=vscode |
| service | transcribeAudioFile (mobile) | `apps/mobile/src/features/voice/services/voiceInput.ts` | On-device file transcription |
| screen | mobile voice screen | `apps/mobile/app/(app)/voice.tsx` | Calls transcribeAudioFile for recorded audio |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client posts multipart audio to the endpoint. | device | voice-input-store.ts:218-241; voice.rs:1025-1056; dictationClient.ts:12-37 |
| Server runs region, CSRF, rate limit, auth, age or project spend, managed and policy gates. | our servers | route.ts:273-360 |
| Server reads the form, checks size, type, magic bytes and content scan. | our servers | route.ts:361-500 |
| Server resolves the catalog speech model, privacy check, builds provider form (file, model, language). | our servers | route.ts:487-556 |
| Server reserves usage or free-allowance seconds before spending. | our servers | route.ts:560-660 |
| Server calls the provider with the platform key and waits up to 60 seconds. | outside service | route.ts:722-729 |
| Server settles cost and returns the provider JSON. | our servers | route.ts:760-850 |
| Phone file path: the OS recognizer reads a local file URI with on-device required. | device | voiceInput.ts:475-511 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Uploaded audio | Request memory only | No | Not stored by the route (route.ts:466-468); provider retention unknown |
| Usage reservation and settlement | Managed usage tables via reserve_managed_usage_request_with_limits (table names not opened) | Server side | unknown |
| Free allowance grants | Free voice grant events (events free_voice_seconds_granted / free_voice_seconds_settled) | Server side | Resets monthly (free-voice-allowance.ts:15-16, 47) |

**Models and providers.** The slot 'voice_transcription' decides the model; the route insists it is a live speech-to-text model of provider openai and throws otherwise (route.ts:487-504). A requested model is honored only if it is a live non-deprecated openai speech-to-text catalog entry (route.ts:517-527). Pricing uses catalog pricing and an estimate of tokens per audio second (route.ts:108-125).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required: sign-in or API key (inference:write) (route.ts:297); adult eligibility for sessions (route.ts:307-316). |
| Permissions | CSRF token and CORS rules (route.ts:289-292). API keys are checked for project spend (route.ts:299-306). Organization policy and model policy gates (route.ts:327-353, 533-545). Plan 'api' surface refusal via managedCloudSurfaceRefusal (route.ts:586-593). |
| Subscription | Paid plans: managed-compute subscription access, voice_minutes unit allowance and usage reservation. Free plan: monthly free voice seconds (route.ts:560-660; free-voice-allowance.ts:47-58). Free is 10 minutes per month per test 'is ten minutes on the Free plan' (apps/web/lib/voice/__tests__/free-voice-allowance.test.ts) and catalog line packages/contracts/types/src/model-catalog.ts:1256. |
| Limits and metering | 25 MB; allowed types listed; rate limit 'audio-transcription'; provider timeout 60 s; usage estimated at 40 input tokens and 4 output tokens per audio second before settlement (route.ts:109-110 constants). |
| Feature flags | Kill switch 'dictation' on /api/voice/transcribe only. |
| Model compatibility | Only openai speech-to-text catalog models; others fall back to the default slot model. |
| Provider restrictions | Refuses with 'model_may_train' when the user's privacy setting excludes providers that may train on content (route.ts:506-529). |
| Local mode | Server endpoint is Cloud only. The phone's file transcriber is on-device only. CLI blocks this endpoint for Local sessions without opt-in (voice.rs:493-505). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Missing file | 400 'Missing audio file' | route.ts:386-396 |
| Too large | 413 | route.ts:415-427 |
| Unsupported type or bad magic bytes | 415 | route.ts:430-465 |
| Content scan failure | 400 with the upload-rejected message | route.ts:469-485 |
| Duplicate Idempotency-Key | 409 'already transcribed' or 'already being transcribed' for the free path | route.ts:636-660 |
| Provider timeout or unreachable | Reservation released as failed; error thrown to the error handler | route.ts:722-740 |
| Provider non-200 | Status passed on with a generic message; reservation voided | route.ts:742-757 |
| Region blocked | 451 | route.ts:277-288 |
| Billing unavailable | 503 billing_unavailable | route.ts:670-690 |
| Offline client | Client side: web shows connection message | voice-input-store.ts:153-156 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `test:apps/web/__tests__/api/voice-transcribe.test.ts` (not found): 401s, 400, success, forwarding model and language, upstream errors, non-JSON response
- `test:apps/web/app/api/llm/v1/audio/transcriptions/route.test.ts` (not found): Reservation, allowance recording, settlement, void on failure, API-key billing
- `test:apps/web/lib/voice/__tests__/free-voice-allowance.test.ts` (not found): Free allowance grants and settlement
- `test:apps/extension-vscode/src/__tests__/dictationClient.test.ts` (not found): Client of the managed endpoint
- `test:apps/mobile/__tests__/voice-recognition-locale-and-timeout.test.ts` (not found): transcribeAudioFile behaviours
- `test:apps/mobile/__tests__/VoiceConversationPtt.test.tsx` (not found): Mobile voice screen using transcribeAudioFile (mocked)

**Test scenarios**

- **API happy path**
  1. Create a test API key with inference:write
  2. POST a short wav as file
  3. Read the JSON
  - Expected: 200 with text; a usage record for the request.
- **Oversize**
  1. POST a file over 25 MB
  - Expected: 413.
- **Disguised file**
  1. POST a text file with content type audio/wav
  - Expected: 415 content mismatch.
- **Allowance used**
  1. Use a Free account with allowance spent
  2. POST via /api/voice/transcribe
  - Expected: Refusal with code voice_minutes_monthly_limit_reached and no provider call.
- **Provider failure**
  1. Make the provider return 500 in a test
  - Expected: Status passed on and reservation voided.

**Where to look when it fails**

- Log 'Transcription proxy failed' with provider status (route.ts:743).
- Event transcription_reservation_failed and transcription_refund_settlement_unrecorded (route.ts:690, 705).
- Log 'Transcription settled' with fundedByFreeAllowance.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/web/049-dictation-transcription-and-recording.md)
- Desktop: [70-qa/test-plans/desktop/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/desktop/049-dictation-transcription-and-recording.md)
- Mobile: [70-qa/test-plans/mobile/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/mobile/049-dictation-transcription-and-recording.md)
- CLI: [70-qa/test-plans/cli/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/cli/049-dictation-transcription-and-recording.md)
- No hands-on plan yet for VS Code: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **No end-user screen to upload an audio file in any app.** Affects: Web, desktop, phone, CLI, VS Code, Chrome. Evidence: brief S49.08. Work needed: Product decision and UI.
- **Developer endpoint bypasses the dictation kill switch.** Affects: API users. Evidence: route.ts:858 vs voice/transcribe/route.ts:29. Work needed: Decide whether a separate switch is wanted.
- **Only plain text returned; no segments or timestamps requested.** Affects: All. Evidence: route.ts:548-556. Work needed: See F049-06.
- **No own-key or local server path for web and desktop.** Affects: Web, desktop in own-key or Local mode. Evidence: ChatComposerNew.tsx:2055-2078. Work needed: Product decision.
- **Brief says VS Code batch missing; code exists.** Affects: VS Code; docs. Evidence: brief S49.09; dictationClient.ts. Work needed: Update brief.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- F049-01
- provider:openai
- SYS-inference-providers
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-execution-boundaries
- mode:cloud
- api:POST /api/voice/transcribe
- api:POST /api/llm/v1/audio/transcriptions

## Unknown

- Names of the database tables behind reservations and the cost ledger.
- Provider-side audio retention.
- Whether any app plans an audio-file upload screen.
- Whether a developer docs page documents the endpoint (not searched).
