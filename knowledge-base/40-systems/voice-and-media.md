---
id: "SYS-voice-and-media"
type: "system"
title: "Voice, images and video"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Voice, images and video

Voice, images and video are managed-cloud features served by the web app's API routes. Live voice, dictation and read-aloud use the voice routes. Images use durable jobs polled by id. Video uses a durable workflow polled by id. Free gets 10 voice minutes a month and a capped daily offer of 10 images and 5 videos from a separate free-quota route. Paid image generation starts at Premium; video is Ultra and Enterprise only. Mobile dictation runs on the device. No run is recorded.

## What it is and why it exists

Three families of capability share one backend in `apps/web/app/api`:

- **Voice**: live voice conversations (a two-way spoken chat), dictation (speech to text for the message box) and read-aloud (text to speech for one reply).
- **Images**: generate, and edit (edit, inpaint, outpaint, variation) from an uploaded or stored image.
- **Video**: text to video, and image to video (first frame or reference images).

Every one of them spends money at an outside provider, so every one goes through the AGI Subscription system: entitlement lookup, plan gate, usage reservation, settlement and monthly or daily limits. [requirement] `AGENTS.md` section 7 (cost is a first-class constraint) and section 9 (an irreversible action asks first).

Provider choice is not hard-coded in the routes. Voice and media models are resolved from routing slots (`voice_live`, `voice_transcription`, `voice_speech`, `image_generation`, `video_generation`) and the model catalog. Model identifiers live in `packages/ai/model-registry/catalog/models.curation.json` and `packages/ai/model-registry/catalog/model-families.json`, not in this page. [code] (packages/contracts/types/src/model-catalog.ts:1252-1392 lists the slots each plan may use)

Execution boundary in one sentence: live voice, read-aloud, image and video generation always need AGI servers and an outside provider (mode:cloud). The one fully on-device voice path is mobile dictation. [code] (apps/mobile/src/features/voice/services/voiceInput.ts:438, :493 set `requiresOnDeviceRecognition: true`; apps/mobile/src/features/voice/services/liveVoiceAvailability.ts, LIVE_VOICE_LOCAL_MODE_REASON)

Status split used in this page: **implementation** means the code exists and is connected. **Verification** means someone ran it. Nothing here is verified by a recorded run; see How to verify.

## How it works today

### Live voice (api:POST /api/voice/live/sessions)

The browser or phone sends a WebRTC offer (SDP, the connection description) to AGI. The server checks many gates, asks the voice provider to create a session, and returns the provider's answer so the client can connect audio directly to the provider. [code] (apps/web/app/api/voice/live/sessions/route.ts)

Order of checks in the create handler, [code] (same file):
1. CSRF token, rate limit bucket `voice-live-session`, signed-in user, 18+ adult gate (`gate: 'voice-live'`).
2. The `voice_live` routing slot must resolve to a live model on a managed provider, else a server error.
3. Managed-compute gate, organization policy gate, spend limit gate, model policy gate.
4. Body must parse (`sdp`, optional `voice`, `conversationId`, `language`, `pace`, `reasoning`, `surface`, `memoryEnabled`, `clientHandoffs`). A `conversationId` is required (`voice_conversation_required`).
5. The provider key env var must be set (`OPENAI_API_KEY`), else 503 `live_voice_not_configured`. The live model must declare a per-minute session rate, else 503 `live_voice_unpriced`.
6. Entitlement and subscription access, the `canUseVoice` flag, then the plan flag `allowVoice`.
7. Training opt-out: if the live or backend model may train on inputs and the user opted out (or the chat carries Google user data), refuse with `model_may_train`.
8. Funding, described below.

Two models work together. The live model speaks. A text backend model (chosen by plan through `getVoiceLiveBackendModel`) does the thinking and tool calls, with the reasoning effort set server-side. [code] (packages/contracts/types/src/model-catalog.ts, `getVoiceLiveBackendModel`; the Free tier lists slot `voice_live_backend_free`, paid tiers list `voice_live_backend`)

The browser is untrusted. The server sends an allow-list of data-channel events (`FRONTEND_CLIENT_EVENTS`: mute, unmute, instruction append, response create, session close) so the client cannot swap model, tools or reasoning. [code] (route.ts:138)

**Billing in one-minute blocks.** `LIVE_VOICE_BLOCK_SECONDS` is 60. Paid plans reserve one block at start and extend block by block through `POST /api/voice/live/sessions/{sessionId}/extend`. The session settles on close at what it used, capped at what was reserved. A session with no check-in for `LIVE_VOICE_LEASE_SECONDS` (600) counts as abandoned and a sweep closes and settles it. [code] (apps/web/lib/voice/live-voice-billing.ts:20, :28; apps/web/app/api/voice/live/sessions/lib/voice-session-settlement.ts)

Other session routes: `GET /api/voice/live/sessions/active` (resume a session, optional history), `POST .../{sessionId}/settings` (voice, language, pace), `POST .../{sessionId}/tools` (run a tool call the voice model asked for, with approval handling and an audit event), `POST .../{sessionId}/close`. [code] (apps/web/app/api/voice/live/sessions/**/route.ts)

A new session for the same conversation supersedes and settles the older one. Context (recent turns, project prompt, memory) is loaded into the instructions; a failed context load starts the session without it. [code] (route.ts; lib/live-voice-context.ts)

### Dictation (api:POST /api/voice/transcribe)

A thin wrapper. It checks the `dictation` kill switch, then runs the shared handler of `/api/llm/v1/audio/transcriptions`. [code] (apps/web/app/api/voice/transcribe/route.ts)

The shared handler: region check (HTTP 451 when blocked), CSRF, rate bucket `audio-transcription`, auth, file size at most 25 MiB, MIME allow-list (mp3, mp4/m4a, wav, webm, ogg, flac), magic-byte check, upload scan, privacy check on the provider, model policy gate, then the funding step. The `model` form field is honored only if it is a live speech-to-text catalog model; otherwise the `voice_transcription` slot is used. Duration is estimated from file size. [code] (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:271-660)

### Read-aloud (api:POST /api/voice/speech)

Text (1 to 4000 characters), optional voice and speed (0.25 to 4), an `Idempotency-Key` header is required, returns `audio/mpeg`. It uses the `voice_speech` slot, which must be an OpenAI text-to-speech model. Cost is estimated from characters and settled as completed. It reserves and settles through the managed usage service, but it does not call the voice-minutes allowance check. [code] (apps/web/app/api/voice/speech/route.ts)

### Image generation (api:POST /api/media/image/generate)

1. Gates: CSRF, rate bucket `image-generation`, auth, 18+ gate (`media-image`), managed-compute gate, organization policy, spend limit. [code] (apps/web/app/api/media/image/generate/route.ts)
2. `generateManagedImage` then requires an active subscription (403 `subscription_required`), subscription access, and the plan capability `image_generation` (403 `plan_upgrade_required`), then the `canUseImages` flag. [code] (apps/web/app/api/media/image/lib/managed-image-generation.ts)
3. Body validated by `ManagedMediaImageGenerationRequestSchema`. Prompt moderation runs before any billing or provider call; a refusal returns 422 `content_policy_violation` and is never charged. Uploaded edit images are hash-checked against a denylist and structure-checked before billing.
4. Model and provider resolved from the catalog; only the OpenAI and Google adapters can run. Edits need an image API that supports edits (OpenAI only today). [code] (packages/contracts/cloud-contracts/src/managed-media.ts, `MANAGED_MEDIA_IMAGE_EDIT_APIS`)
5. A usage reservation is made under a required `Idempotency-Key` that must be a managed-media key for operation `image`. A durable job row is created in `image_generation_jobs` and a background drive is queued.
6. Without `async: true` the request runs the first attempt inline and returns images (or an error). With `async: true` it returns HTTP 202 with a job snapshot and runs the attempt after the response.

The job runs up to 3 attempts (`IMAGE_JOB_MAX_ATTEMPTS`). One reservation covers all attempts, so a retry costs nothing extra. [code] (apps/web/lib/server/image-generation-jobs.ts:84-86)

### Video generation (api:POST /api/media/video/generate)

Same front gates (rate bucket `video-generation`, 18+ gate `media-video`). Then the plan capability `video_generation`, prompt moderation, model and input-image resolution, and `assertTierUnitAllowance` for `video_seconds` (clip seconds times candidates). Each candidate (`n` up to 4) is its own durable job in `video_generation_jobs` with its own reservation. Submission takes a short per-user admission lock, then the provider task is started and a Vercel Workflow reconciles it. The route returns `task_id` (plus `task_ids`). [code] (apps/web/app/api/media/video/generate/route.ts:982-1245; apps/web/lib/workflows/video-generation-workflow.ts)

Video providers in the wire contract are runway, google and openrouter. OpenRouter can also push completion through a signed webhook. [code] (packages/contracts/cloud-contracts/src/managed-media.ts:4; apps/web/app/api/media/video/openrouter-webhook/route.ts)

### Polling routes

| Route | Method | Purpose | Notes |
| --- | --- | --- | --- |
| `/api/media/image/status?job_id=` | GET | Snapshot of a durable image job | Owner only. A due job is re-driven after the response. Rate bucket `image-generation`. |
| `/api/media/image/cancel` | POST | Cancel by `job_id` or `idempotency_key` | Releases the reservation. |
| `/api/media/image/retry` | POST | Retry a failed retryable job | 409 `image_job_not_retryable` when attempts are used up. |
| `/api/media/video/status?task_id=` | GET | Snapshot of a durable video job | Rate bucket `video-status`; task id must be a job UUID. Reconciles with the provider. |
| `/api/media/video/cancel` | POST | Cancel a video job | Reports provider cancellation as requested or unconfirmed. |
| `/api/media/availability` | GET | Which image and video models are admitted and what they support | No-store. |
| `/api/media/jobs` | GET | Job history for the user and workspace | |
| `/api/media` | GET, DELETE, POST | List library assets, soft or permanent delete, restore | |
| `/api/media/keep` | POST | Move a temporary-chat asset into the Library | |

[code] (apps/web/app/api/media/**/route.ts)

Client polling cadence: web video every 5 s for up to 5 min; mobile image every 2 s for up to 170 s; mobile and Chrome video constants 5 s and 5 min. [code] (apps/web/lib/hooks/useMediaGeneration.ts:94-95; apps/mobile/src/features/image/services/imagegen.ts:36-37; apps/mobile/src/features/video/services/videogen.ts:49-50; apps/extension/src/features/cloud-bridge/videoGenerationClient.ts:11-12)

### What Free gets

- **Voice**: Free has `allowVoice: true` and `voiceMinutesPerMonth: 10`. Live voice and dictation draw on the same monthly pool, in seconds, funded from a per-user usage-events log (`free_voice_seconds_granted` and `free_voice_seconds_settled`). Free uses the cheaper backend slot. [code] (packages/contracts/types/src/model-catalog.ts:1252-1256; apps/web/lib/voice/free-voice-allowance.ts:47)
- **Image and video through the normal routes**: not available. Free fails `canUseBillingPlanCapability` and gets 403 `plan_upgrade_required`. [code] (packages/contracts/types/src/billing-catalog.ts:356-357; managed-image-generation.ts)
- **Image and video through the free-quota route**: a separate, limited offer. `limitedMediaOffer.dailyCapPerUser` is 10 images and 5 videos per user per UTC day, admitted only for plans that have managed chat but not the paid capability. The turn is served by `serveFreeQuotaTurn` on `/api/models/free-quota/completions`, only when a free quota offering of that kind is ready (terms review current, console check, allowance left). [code] (apps/web/config/free-pools.json:3501-3503; apps/web/lib/server/free-quota-catalogue.ts:81-93; apps/web/features/models/lib/free-media.ts:49-57)
- `GET /api/models/free-quota/media-offer` publishes whether each is `offered`, `not_offered` or `unknown`. [code] (apps/web/lib/server/free-media-offer-reader.ts)

## Implementation map

| Concern | Where | Basis |
| --- | --- | --- |
| Live voice create | `apps/web/app/api/voice/live/sessions/route.ts` | [code] |
| Live voice extend, close, settings, tools, active | `apps/web/app/api/voice/live/sessions/[sessionId]/{extend,close,settings,tools}/route.ts`, `.../active/route.ts` | [code] |
| Live voice store, budget, settlement, context | `apps/web/app/api/voice/live/sessions/lib/{voice-session-store,voice-session-budget,voice-session-settlement,live-voice-context}.ts` | [code] |
| Voice pricing and failure mapping | `apps/web/lib/voice/live-voice-billing.ts` | [code] |
| Free voice allowance | `apps/web/lib/voice/free-voice-allowance.ts` | [code] |
| Voice tools, prompts, reasoning, voices | `apps/web/lib/voice/{live-voice-tools,live-voice-prompts,live-voice-reasoning,live-voice-tool-runner,speech-voices,live-voice-backend-cost}.ts` | [code] |
| Dictation | `apps/web/app/api/voice/transcribe/route.ts` over `apps/web/app/api/llm/v1/audio/transcriptions/route.ts` | [code] |
| Read-aloud | `apps/web/app/api/voice/speech/route.ts`; web client `apps/web/lib/hooks/useTTS.ts` | [code] |
| Image routes | `apps/web/app/api/media/image/{generate,status,cancel,retry}/route.ts` | [code] |
| Image logic | `apps/web/app/api/media/image/lib/{managed-image-generation,image-generation-provider,image-job-executor,image-job-drive-queue,image-job-drain,edit-mask,image-chat-tools}.ts` | [code] |
| Image job persistence | `apps/web/lib/server/image-generation-jobs.ts` | [code] |
| Video routes | `apps/web/app/api/media/video/{generate,status,cancel,openrouter-webhook}/route.ts` | [code] |
| Video workflow | `apps/web/lib/workflows/{video-generation-workflow,start-video-generation-workflow,video-generation-timing}.ts` | [code] |
| Media library, history, availability | `apps/web/app/api/media/{route,jobs/route,keep/route,availability/route}.ts`, `apps/web/lib/services/media-model-availability-service.ts` | [code] |
| Contracts (request schemas, limits) | `packages/contracts/cloud-contracts/src/managed-media.ts` | [code] |
| Plan policy | `packages/contracts/types/src/model-catalog.ts` (TIER_POLICIES, slots), `packages/contracts/types/src/billing-catalog.ts` (capability tiers, labels) | [code] |
| Monthly unit limits | `apps/web/lib/services/tier-unit-quota-service.ts` | [code] |
| Rate limits | `apps/web/lib/rate-limit.ts:384-412` | [code] |
| Free media offer | `apps/web/config/free-pools.json`, `apps/web/lib/server/{free-pools,free-quota-catalogue,free-quota-turn,free-media-offer-reader}.ts`, `apps/web/app/api/models/free-quota/**` | [code] |
| Web media hook | `apps/web/lib/hooks/useMediaGeneration.ts`, `apps/web/features/media/services/media-api-service.ts` | [code] |
| Web live voice client | `apps/web/features/chat/lib/live-voice-session.ts` | [code] |
| Mobile voice | `apps/mobile/src/features/voice/**` (live: `services/liveVoiceSession.ts`, `liveVoiceAuthority.ts`, `liveVoiceAvailability.ts`; dictation: `services/voiceInput.ts`; read-aloud: `services/voiceOutput.ts`, `tts.ts`, `serverSpeech.ts`) | [code] |
| Mobile media | `apps/mobile/src/features/image/services/imagegen.ts`, `apps/mobile/src/features/video/services/videogen.ts`, `apps/mobile/lib/v1FeatureFlags.ts` | [code] |
| Desktop | `apps/desktop/src/hooks/useVoiceTranscription.ts`, `apps/desktop/src/features/voice/*`, `apps/desktop/electron/voiceDictation.ts`, `apps/desktop/electron/dictationBar.ts`; internal Tauri `apps/desktop/src-tauri/src/sys/commands/voice.rs` | [code] |
| CLI | `apps/cli/src/voice.rs`, `apps/cli/src/cloud/image.rs` | [code] |
| VS Code | `apps/extension-vscode/src/features/sidebar-webview/dictationClient.ts` | [code] |
| Chrome | `apps/extension/src/features/side-panel/voice.ts`, `apps/extension/src/features/cloud-bridge/videoGenerationClient.ts` | [code] |

Tests that exist (not run for this page): `apps/web/app/api/voice/live/sessions/route.test.ts`, `.../lib/__tests__/voice-session-budget.test.ts`, `.../voice-session-settlement.test.ts`, `.../voice-session-store.test.ts`, `apps/web/app/api/voice/speech/__tests__/route.test.ts`, `apps/web/app/api/voice/transcribe/__tests__/route.kill-switch.test.ts`, `apps/web/app/api/media/route.test.ts`, `apps/web/app/api/media/availability/route.test.ts`, `apps/web/app/api/media/jobs/__tests__/route.test.ts`, `apps/web/__tests__/api/media-video-generate.test.ts`, `apps/web/lib/services/tier-unit-quota-service.test.ts`, `apps/web/app/api/models/free-quota/completions/route.test.ts`, `apps/web/lib/server/free-pools.test.ts`, `apps/mobile/__tests__/live-voice-session.test.ts`, `apps/mobile/__tests__/live-voice-authority.test.ts`, `apps/mobile/__tests__/imagegen-idempotency.test.ts`, `apps/mobile/__tests__/video-generation-cancel.test.ts`, `apps/extension-vscode/src/__tests__/dictationClient.test.ts`, `apps/extension/__tests__/voice-input.test.ts`, `apps/extension/__tests__/side-panel-media.test.ts`, e2e `apps/web/e2e/voice-live-probe.spec.ts`.

## Data and state

### Database tables

| Table | Holds | Basis |
| --- | --- | --- |
| table:voice_sessions | One row per live session: provider session id, conversation, surface (web, mobile, desktop), voice, language, pace, active tools, last turn id, status (active or closed), close reason, timestamps | [code] (apps/web/app/api/voice/live/sessions/lib/voice-session-store.ts; migration apps/web/db/neon/0260_voice_sessions.sql) |
| table:usage_events | Free voice grants and settlements (`free_voice_seconds_granted`, `free_voice_seconds_settled`), keyed by session id and calendar month, under a per-user advisory lock | [code] (apps/web/lib/voice/free-voice-allowance.ts) |
| table:managed_usage_requests | Reservations and settlements for paid voice, dictation, read-aloud, image and video. Monthly voice minutes are summed from rows whose `usage.operation` is `transcription` or `voice_live_session` | [code] (apps/web/lib/services/tier-unit-quota-service.ts, voice_minutes query) |
| table:managed_usage_request_extensions | One row per extra voice block (extension) | [code] (voice-session-budget.ts, `readVoiceReservation`) |
| table:image_generation_jobs | Durable image jobs: status, attempts (max 3), claim, lease, public error, cancel request, billing outcome, `temporary_chat` flag | [code] (apps/web/lib/server/image-generation-jobs.ts; migrations 0226, 0339) |
| table:image_generation_job_assets | Links a job to its stored images | [code] (image-generation-jobs.ts references it) |
| table:video_generation_jobs | Durable video jobs: provider task, duration, status, cancellation, settlement and incident-alert state | [code] (apps/web/lib/server/video-generation-jobs.ts; migrations 0339, 0392) |
| table:media_assets | Stored images and videos; library, soft delete, temporary-chat assets | [code] (apps/web/lib/server/media-assets.ts) |
| table:web_conversations | Owner check for `conversation_id` on image requests and temporary-chat marking | [code] (managed-image-generation.ts) |

A background job kind `media-generation.image-attempt` is queued per image attempt, keyed by job id and attempt count, so a killed request still finishes. [code] (apps/web/app/api/media/image/lib/image-job-drive-queue.ts)

### Device and client state

- Web keeps in-flight media jobs in a client store (`useMediaStore`) and a map of active image generations for cancel. [code] (apps/web/lib/hooks/useMediaGeneration.ts)
- Mobile keeps a stopped-image set per operation id, plus dictation and voice settings in `apps/mobile/stores/settings/localSettingsStore.ts` and `cloudSettingsStore.ts`. [code] (grep hits in those files for voice settings; contents not read in full)
- VS Code stores the dictation language under key `agiWorkforce.dictationLanguage`. [code] (apps/extension-vscode/src/features/sidebar-webview/dictationClient.ts:5)

### Configuration names (no values)

`OPENAI_API_KEY` (live voice, speech, transcription, image), Google keys `GOOGLE_API_KEY`, `GOOGLE_AI_API_KEY`, `GEMINI_API_KEY` (image and video), `RUNWAY_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_WEBHOOK_SECRET` (video webhook). Durable image storage must be configured in production or image generation returns 503 `media_storage_unavailable`. [code] (apps/web/lib/services/media-model-availability-service.ts; apps/web/app/api/media/video/openrouter-webhook/route.ts:43; managed-image-generation.ts)

### Limits that are fixed in code

| Limit | Value | Source |
| --- | --- | --- |
| Live voice block | 60 s; lease 600 s | apps/web/lib/voice/live-voice-billing.ts:20, :28 |
| Pace range | 0.25 to 4, default 1 | voice-session-store.ts |
| Dictation upload | 25 MiB | transcriptions/route.ts:398 |
| Read-aloud text | 4000 characters (mobile chunks at 3800) | speech/route.ts; apps/mobile serverSpeech.ts |
| Image prompt | 4000 characters; negative prompt 2000 | managed-media.ts |
| Images per request | up to 4 (1 for the Gemini image API) | managed-media.ts:87; image-generation-provider.ts `maxImagesPerRequest` |
| Edit reference images | up to 3 | managed-media.ts:86 |
| Image sync request | `maxDuration` 60 s | image/generate/route.ts |
| Image job | 3 attempts; claim 180 s; lease 3600 s | image-generation-jobs.ts:84-86 |
| Video prompt | 2000 characters; clip 2 to 30 s, default 4 s; up to 4 candidates; up to 4 input images | managed-media.ts |
| Video request | `maxDuration` 300 s; reservation lease 3600 s | video/generate/route.ts |
| Rate limits per minute (base, tier scaled) | image 10, video 5, video status 30, transcription 20, read-aloud 30, live session 10 | apps/web/lib/rate-limit.ts:384-412, :940-949 |

## Rules: access, plans, modes

### Plans

Plan names in the code are `free`, `basic`, `pro`, `max`, `max_15x`, `team`, `team_premium`, `enterprise`. Display labels: Free, Basic, Premium (`pro`), Max, Ultra (`max_15x`), Team, Team Premium, Enterprise. [code] (packages/contracts/types/src/billing-catalog.ts:5-14, :176-230) The tier policy used for voice limits folds several plans together: `pro`, `team`, `basic` become product tier pro; `max`, `max_15x`, `team_premium` become product tier max; `enterprise` stays; anything else is free. [code] (packages/contracts/types/src/model-catalog.ts:1691-1710)

| Capability | plan:free | plan:basic | plan:pro (Premium) | plan:max | plan:max_15x (Ultra) | plan:enterprise |
| --- | --- | --- | --- | --- | --- | --- |
| Live voice and dictation | Yes, 10 min per calendar month shared pool | Yes, paid usage budget | Yes, paid usage budget | Yes, paid usage budget | Yes, paid usage budget | Yes, paid usage budget |
| Image generation (normal route) | No | No | Yes | Yes | Yes | Yes |
| Video generation (normal route) | No | No | No | No | Yes | Yes |
| Video seconds per month | not applicable | not applicable | not applicable | not applicable | 300 | no cap in policy (null) |
| Free daily offer via free-quota route | 10 images, 5 videos per UTC day when an offering is ready | same offer shape (managed-chat plans without the paid capability) | not needed for images; videos: offer shape | offer shape for video | not needed | not needed |

Sources: voice flags and minutes [code] (model-catalog.ts:1252-1256 free; :1288-1290 pro; :1336-1343 max; :1387-1392 enterprise); capability tiers [code] (billing-catalog.ts:356-357: image `PRO_TIERS` = pro, max, max_15x, team, team_premium, enterprise; video = max_15x, enterprise); video seconds [code] (model-catalog.ts:1343, tier-unit-quota-service.ts:57-58). The `team` and `team_premium` plans pass the image capability; only `team_premium` folds to product tier max for voice and video seconds, and neither passes the video capability. The Free-plan voice allowance applies to any plan for which `isFreeBillingPlanTier` is true, which is `free` only. [code] (free-voice-allowance.ts:47; billing-catalog.ts:260)

The last row of the table is [inferred] from `freeMediaPlanStanding` (included if the paid capability is held, offer-eligible if the plan has managed chat) together with the runbook's note that the offer is for eligible managed-chat plans. [code] (apps/web/features/models/lib/free-media.ts:49-57) Basic and Premium videos going through the offer was not traced to a test. [unknown]

A concrete consequence worth knowing: Max (not Ultra) has video slots in its tier policy and a 300 second monthly cap defined, but fails the video capability gate, so only Ultra (and Enterprise) can actually generate video. [code] (model-catalog.ts:1336-1343 vs billing-catalog.ts:357)

### Paid voice funding

For any plan that is not Free: `assessVoiceBudget` checks the rolling five-hour and weekly usage caps and credits; if the plan cannot fund one block, 402 `voice_usage_not_in_plan`. Then `assertTierUnitAllowance` for `voice_minutes` (a hard limit only when the plan sets `voiceMinutesPerMonth`, null for all paid tiers), then a one-block reservation. [code] (voice-session-budget.ts; route.ts)

For Free: before granting, abandoned sessions are settled so their seconds return; then `grantFreeVoiceSeconds` grants 60 s, refusing with the allowance-used error and a reset time (first of next UTC month) when the pool is spent. An unsettled grant counts only for 660 s (lease plus block) so a dead attempt does not burn the month. [code] (free-voice-allowance.ts:24, :47; route.ts)

### Gates every managed media or voice request passes

18+ adult-eligibility gate, managed-compute gate (surface and platform), organization policy gate, workspace spend limit, workspace model policy (checked on the resolved catalog model), provider training opt-out, feature flags (`canUseVoice`, `canUseImages`, kill switch `dictation`). [code] (route files cited above)

### Modes

- mode:cloud: live voice, read-aloud (server voice), dictation through the server, all image and video generation.
- mode:local: mobile dictation is on-device; mobile read-aloud uses the device voice (`expo-speech`) when the conversation is not Cloud; live voice is refused in Local Mode with the text 'Live voice runs in AGI Cloud, so Local Mode stays turn based.' [code] (apps/mobile/src/features/voice/services/voiceOutput.ts, tts.ts, liveVoiceAvailability.ts)
- mode:own-key: the CLI can transcribe with a user's own OpenAI key or a local `whisper` program, and Local privacy mode suppresses the OpenAI path. Whether any app lets a user bring their own key for live voice, image or video is [unknown]; the managed routes read server keys only. [code] (apps/cli/src/voice.rs header and lines 72-141)
- Local features need no paid plan. Whether mobile dictation and device read-aloud need sign-in was not established. [unknown]

Nothing in these routes moves a Local chat to the cloud on its own; mobile live voice and server read-aloud check that the conversation's mode is Cloud first. [code] (apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:155; voiceOutput.ts)

## Differences between apps

| App | Live voice | Dictation | Read-aloud | Images | Video |
| --- | --- | --- | --- | --- | --- |
| surface:web | WebRTC to `/api/voice/live/sessions` (`features/chat/lib/live-voice-session.ts`) | Server transcription (`voice-input-store.ts`) | Server speech (`useTTS.ts`) | Generate and edit through the hook; sync request with 60 s deadline, then status and retry to resume | Start, then poll every 5 s for up to 5 min |
| surface:desktop (Electron, public) | Shows the hosted web app, so it is the web path [requirement] (AGENTS.md section 5) | Global dictation shortcut and bar in Electron (`electron/voiceDictation.ts`, `dictationBar.ts`) | Web path | Web path | Web path |
| surface:desktop (Tauri, internal code) | Not found | Cloud, Web Speech or local Whisper.cpp (`useVoiceTranscription.ts`, `voice.rs`); local Piper for speech | Local Piper | Agent tool `media_tools.rs` | Not found |
| surface:mobile | Native WebRTC (`react-native-webrtc`), needs a native build, an https server and Cloud mode | On device through `expo-speech-recognition`, on-device only | Server voice in Cloud conversations, device voice otherwise | Async job with 2 s polling for up to 170 s; flag `imageGen` is true | Code exists but flag `videoGen` is false |
| surface:cli | Not found | Push-to-talk: AGI account, own OpenAI key, or local `whisper` | Not found | `apps/cli/src/cloud/image.rs` (generate, cancel, retry, status, availability) | Not found |
| surface:vscode | Not found | Posts audio to `/api/voice/transcribe?surface=vscode` with a bearer token | Not found | Not found | Not found |
| surface:chrome | Not found | Browser Web Speech API (`webkitSpeechRecognition`) | Not found | Not found | `startChromeVideo` posts to the video route, polls every 5 s for up to 5 min |

Sources: [code] for every cell, from the files named in the Implementation map. Cells that say Not found mean a search of that app for the route or a voice client found nothing; it is not proof of absence. The Chrome and mobile dictation engines other than mobile's on-device flag were not traced for where audio goes; the Web Speech API normally sends audio to the browser vendor's service, which is [inferred] and not stated in the code read.

The session record accepts only surfaces web, mobile, desktop for live voice, so CLI, VS Code and Chrome cannot open a live session as themselves. [code] (route.ts CreateLiveSessionSchema `surface`)

Media idempotency keys carry the source surface (web, mobile, desktop, chrome; the CLI has its own client in Rust). [code] (apps/web/app/api/media/image/lib/image-chat-tools.ts:44-52)

Mobile has a per-path paywall helper: a 402 or plan error on `/api/media/image/*` or `/api/media/video/*` maps to the image or video upgrade prompt. [code] (apps/mobile/services/api.ts:262-275)

## Failure handling

| Situation | What happens | Basis |
| --- | --- | --- |
| Provider key missing for live voice | 503 `live_voice_not_configured` | [code] (live sessions route) |
| Live model has no declared rate | 503 `live_voice_unpriced`; nothing charged | [code] |
| Provider rejects session creation | Reservation released with outcome failed, cost 0; status mapped: 401, 403, 404 to 403 `live_voice_access_denied`; 429 with an exhausted-account code to 503 `live_voice_unavailable`; other 429 to `live_voice_busy`; 400 or 422 to `live_voice_rejected`; else 503 | [code] (live-voice-billing.ts, `describeLiveSessionFailure`) |
| Provider rejects the function tools (400) | Retries once with hosted tools only | [code] (route.ts) |
| Session row cannot be saved | 503 `voice_session_not_recorded`; reservation or free grant released, nothing charged | [code] |
| Billing unavailable | 503 `billing_unavailable` before any provider spend | [code] |
| Tab closed or phone suspended | Session stays open until the lease (600 s) lapses; the next create, the active route or a sweep settles it at its last check-in | [code] (voice-session-settlement.ts; active/route.ts) |
| Free minutes used up | Error code from `freeVoiceAllowanceUsedError` with a reset time; dictation replay of the same recording returns 409 `idempotency_replay` | [code] |
| Transcription: bad type, size or content | 415, 413, 415; region block 451; training refusal 403 `model_may_train` | [code] |
| Image prompt or upload blocked | 422 `content_policy_violation` or `invalid_source_image`, never charged | [code] |
| Image provider fails | Job retried up to 3 attempts on one reservation; failure returns 422, or 429 with `Retry-After` when a retry time is known, or 502 when storing the result failed | [code] (managed-image-generation.ts) |
| Image request killed mid-attempt | Queued drive or a status poll re-drives it. An edit started from uploaded bytes cannot be replayed, so only the sender can retry it | [code] (image-job-drive-queue.ts) |
| Image storage not configured in production | 503 `media_storage_unavailable` | [code] |
| Web image request exceeds the client deadline | Aborts with `image_generation_timeout`; the user can resume by job id through status and retry | [code] (useMediaGeneration.ts) |
| Video admission busy | 409 `video_generation_admission_busy` | [code] (video/generate/route.ts) |
| Video monthly seconds used up | `video_seconds_monthly_limit_reached` | [code] (tier-unit-quota-service.ts) |
| Video provider outcome unknown | Reconciled by the workflow and status route; incident alerts for settlement problems | [code] (video-generation-workflow.ts; video/status/route.ts) |
| Free-quota media task accepted but a status poll is refused | Polling continues; the turn ends interrupted with the reservation kept, never settled as failed | [requirement] (docs/runbooks/free-quota-models.md, section Free image and video) |
| Rate limit | 429 `RATE_LIMIT_EXCEEDED` with `retry_after_seconds`; media, transcription, speech and live session buckets fail closed when the limiter is down | [code] (rate-limit.ts:384-412) |

## How it should work

These are product requirements and my proposals, kept apart.

- [requirement] Subscription capabilities on every app must connect to one AGI Subscription system. The web routes already do this through entitlement, tier policy, `assertTierUnitAllowance` and managed usage reservations, and the other apps call the same routes. (AGENTS.md section 7; billing-catalog.ts)
- [requirement] Local inference on mobile and desktop is free of any paid subscription. Mobile dictation and device read-aloud follow this. A consistent Local read-aloud and dictation story on every app that claims it is not shown in this code review.
- [requirement] Execution boundaries must be explicit. The mobile app does this for live voice (a reason string per refusal). The other apps' wording was not reviewed.
- [requirement] Free usage screens show only Upgrade, never meters (owner decision recorded in project memory). The Free voice allowance and Free daily media caps are enforced server-side; whether any screen shows a meter was not checked.
- [proposed] Give image status polling its own rate bucket or exempt it from the 10 per minute image bucket, so a 2 second poll cannot trip the limit it shares with submission (see Gaps).
- [proposed] Make the tier policy and the capability table agree about video. Today Max carries video slots and a 300 second cap in `TIER_POLICIES` while the capability table admits only Ultra and Enterprise. One owner should decide, and the other should be derived from it, per AGENTS.md section 3.
- [proposed] Let `GET /api/media/availability` or the capability handshake publish voice minutes, image and video limits per plan for every app, so clients stop carrying their own copies. A capability handshake already lists `voice_minutes_per_month`. [code] (apps/web/lib/services/capability-handshake-service.ts:319-324)

## Gaps

Implementation gaps and risks found by reading code. Each is a lead to confirm, not a proven defect.

1. **Image status polling shares the submission rate bucket.** `/api/media/image/status` calls `withRateLimit(request, 'image-generation')` with no plan tier, so the base limit is 10 per minute (times a global scale), and the mobile client polls every 2 s, up to 85 polls. [inferred] (apps/web/app/api/media/image/status/route.ts; apps/web/lib/rate-limit.ts:384-388, :962-965; apps/mobile/src/features/image/services/imagegen.ts:36). Whether the identifier is per user or per address, and whether `rateLimitScale` is above 1 in production, were not checked. [unknown]
2. **Plan table and tier policy disagree on video** (see How it should work). [code]
3. **Free media offer depends on a promotional pool that mostly expired.** In `free-pools.json`, 244 of 279 inventory entries carry `expiresOn` 2026-10-21, and today is after that date. The terms-review and console-check gates decide whether anything still serves, and those records were not read. [code] (apps/web/config/free-pools.json) [unknown] for what serves today.
4. **Mobile video is shipped but switched off** (`videoGen: false`). The runbook says mobile video UI is paid-only; the flag hides it entirely. [code] (apps/mobile/lib/v1FeatureFlags.ts:28)
5. **Mobile has no consent notice for the named-provider Free quota models**, so those turns are refused until the account agrees on web. [requirement] (docs/runbooks/free-quota-models.md)
6. **Read-aloud is not counted against voice minutes.** It reserves usage money but never calls the voice-minutes allowance. A Free user's read-aloud is not capped by the 10-minute pool; what does cap it is the managed-compute access check and the reservation. [code] (apps/web/app/api/voice/speech/route.ts) Whether this is intended is [unknown].
7. **Surface matrix is stale** (see outdated_documents).
8. **Stability image provider** is in the wire contract but its adapter throws 'not supported'. [code] (image-generation-provider.ts `getApiKey`, `isProviderAvailable`)
9. **No recorded run** of live voice, image, video or the free media path. [requirement] (docs/runbooks/free-quota-models.md says no tests, probes or deployment validation were performed for the reconstructed free media changes).

## How to verify

Nothing below has been run for this page. Commands are the intended checks; do not treat them as results. The project inventory is `docs/agent-context/commands.json`.

**Read-only checks**
- Plan limits: read `TIER_POLICIES` in `packages/contracts/types/src/model-catalog.ts` and `BILLING_PLAN_CAPABILITY_TIERS` in `packages/contracts/types/src/billing-catalog.ts`.
- Free media terms: read `limitedMediaOffer` in `apps/web/config/free-pools.json` and the section 'Free image and video' in `docs/runbooks/free-quota-models.md`; check `/operator#quota` for what is serving.

**Automated tests (run inside `apps/web` with its own Vitest, per AGENTS.md section 12)**
- Voice: the tests under `apps/web/app/api/voice/**` and `apps/web/lib/voice/__tests__`.
- Media: `apps/web/app/api/media/**/route.test.ts`, `apps/web/__tests__/api/media-video-generate.test.ts`, `apps/web/lib/services/tier-unit-quota-service.test.ts`, `apps/web/lib/services/__tests__/capability-handshake.plan-agreement.test.ts`.
- Mobile (run in chunks, jest can hang): `apps/mobile/__tests__/live-voice-*.test.ts*`, `imagegen-idempotency.test.ts`, `video-generation-cancel.test.ts`.
- Extensions: `apps/extension-vscode/src/__tests__/dictationClient.test.ts`, `apps/extension/__tests__/voice-input.test.ts`, `apps/extension/__tests__/side-panel-media.test.ts`.
- Guard chain: `pnpm check:llm-operability`.

**Human-style checks (the owner's standard)**
1. Free account: start live voice and confirm refusal at 10 minutes; dictate and confirm the same pool drops; try the image route and confirm `plan_upgrade_required`.
2. Premium account: generate an image with `async: true`, poll `/api/media/image/status`, cancel one, retry a failed one.
3. Ultra account: start a video, watch `/api/media/video/status` to completion, cancel one.
4. Phone: confirm dictation works with network off (on-device), and live voice is refused in Local Mode with the stated reason.
5. Watch the image status poll from the phone for HTTP 429 (Gap 1).

The e2e probe `apps/web/e2e/voice-live-probe.spec.ts` exists but no record of a run was found.

## Key facts

| Fact | Basis | Source |
|---|---|---|
| Free plan voice is 10 minutes per calendar month, one pool shared by live voice and dictation; paid plans have no monthly voice-minute cap and pay from the usage budget in 1-minute blocks. | read in the code | `packages/contracts/types/src/model-catalog.ts:1255-1256`; `packages/contracts/types/src/model-catalog.ts:1290`; `apps/web/lib/voice/free-voice-allowance.ts:47`; `apps/web/app/api/llm/v1/audio/transcriptions/route.ts:594-660` |
| Live voice billing block is 60 seconds; a session with no check-in for 600 seconds is treated as abandoned and settled at its last check-in. | read in the code | `apps/web/lib/voice/live-voice-billing.ts:20`; `apps/web/lib/voice/live-voice-billing.ts:28`; `apps/web/app/api/voice/live/sessions/lib/voice-session-settlement.ts` |
| Live voice uses two models: a live speaking model from the voice_live slot and a text backend chosen by plan (a cheaper slot for Free); the browser may send only an allow-list of data-channel events. | read in the code | `apps/web/app/api/voice/live/sessions/route.ts:138`; `packages/contracts/types/src/model-catalog.ts, getVoiceLiveBackendModel` |
| Live voice requires a conversationId, an 18+ adult-eligibility pass, the canUseVoice flag, allowVoice on the plan, and the OPENAI_API_KEY server setting; Local Mode on mobile refuses live voice. | read in the code | `apps/web/app/api/voice/live/sessions/route.ts:259`; `apps/web/app/api/voice/live/sessions/route.ts:308-311`; `apps/mobile/src/features/voice/services/liveVoiceAvailability.ts` |
| Dictation endpoint /api/voice/transcribe wraps /api/llm/v1/audio/transcriptions behind the dictation kill switch; max 25 MiB, MIME allow-list, 20 requests per minute base. | read in the code | `apps/web/app/api/voice/transcribe/route.ts`; `apps/web/app/api/llm/v1/audio/transcriptions/route.ts:398`; `apps/web/lib/rate-limit.ts:399-403` |
| Read-aloud (/api/voice/speech) takes up to 4000 characters, requires an Idempotency-Key, returns mp3, and is not checked against the monthly voice-minutes allowance. | read in the code | `apps/web/app/api/voice/speech/route.ts` |
| Image generation on the managed route needs a subscription and the image_generation capability: pro (Premium), max, max_15x (Ultra), team, team_premium, enterprise. Free and Basic get 403 plan_upgrade_required. | read in the code | `packages/contracts/types/src/billing-catalog.ts:356`; `apps/web/app/api/media/image/lib/managed-image-generation.ts` |
| Video generation capability is limited to max_15x (Ultra) and enterprise; Max does not pass it even though the Max tier policy has video slots and a 300 second monthly cap. | read in the code | `packages/contracts/types/src/billing-catalog.ts:357`; `packages/contracts/types/src/model-catalog.ts:1336-1343`; `apps/web/app/api/media/video/generate/route.ts:982` |
| Video seconds are capped at 300 per month for the max product tier (which includes Ultra); enterprise has no cap in policy. The cap counts non-failed jobs this month. | read in the code | `packages/contracts/types/src/model-catalog.ts:1343`; `apps/web/lib/services/tier-unit-quota-service.ts:57-58`; `apps/web/lib/services/tier-unit-quota-service.ts:96-102` |
| Free users get limited image and video through a separate route: 10 images and 5 videos per user per UTC day, only when a free quota offering of that kind is ready. | read in the code | `apps/web/config/free-pools.json:3501-3503`; `apps/web/lib/server/free-quota-catalogue.ts:81-93`; `apps/web/lib/server/free-quota-turn.ts:858-900` |
| Most free-quota inventory entries carry an expiry of 2026-10-21; whether anything still serves depends on terms-review and console-check gates not read for this page. | read in the code | `apps/web/config/free-pools.json (244 of 279 inventory entries expire 2026-10-21)`; `docs/runbooks/free-quota-models.md` |
| Image jobs are durable: up to 3 attempts on one reservation, claim 180 s, lease 3600 s; with async true the route returns 202 and the client polls /api/media/image/status; the status call also re-drives a due job. | read in the code | `apps/web/lib/server/image-generation-jobs.ts:84-86`; `apps/web/app/api/media/image/lib/managed-image-generation.ts`; `apps/web/app/api/media/image/status/route.ts` |
| Image requests accept prompt up to 4000 characters, up to 4 images (1 for the Gemini image API), up to 3 edit reference images, and operations generate, edit, inpaint, outpaint, variation; only the OpenAI image API supports edits. | read in the code | `packages/contracts/cloud-contracts/src/managed-media.ts:56-101`; `packages/contracts/cloud-contracts/src/managed-media.ts:86-87`; `apps/web/app/api/media/image/lib/image-generation-provider.ts:228` |
| Video requests accept a prompt up to 2000 characters, clip 2 to 30 s (default 4), up to 4 candidates each billed as its own job, and optional first-frame or reference images (not both). | read in the code | `packages/contracts/cloud-contracts/src/managed-media.ts:47`; `packages/contracts/cloud-contracts/src/managed-media.ts:194-215`; `apps/web/app/api/media/video/generate/route.ts:1239-1245` |
| Video is processed by a durable Vercel Workflow; the client polls /api/media/video/status (web and Chrome every 5 s for 5 min); OpenRouter can call a signed webhook. | read in the code | `apps/web/lib/workflows/video-generation-workflow.ts`; `apps/web/lib/hooks/useMediaGeneration.ts:94-95`; `apps/web/app/api/media/video/openrouter-webhook/route.ts:43` |
| Prompt moderation and uploaded-image hash and structure checks run before any billing reservation or provider call, so a refused image request is never charged. | read in the code | `apps/web/app/api/media/image/lib/managed-image-generation.ts` |
| Base rate limits per minute: image 10, video 5, video status 30, transcription 20, read-aloud 30, live session create 10; all but video status fail closed. | read in the code | `apps/web/lib/rate-limit.ts:384-412` |
| Mobile dictation runs fully on the device through expo-speech-recognition with on-device recognition required; mobile read-aloud uses server speech in Cloud conversations and the device voice otherwise. | read in the code | `apps/mobile/src/features/voice/services/voiceInput.ts:438`; `apps/mobile/src/features/voice/services/voiceInput.ts:493`; `apps/mobile/src/features/voice/services/voiceOutput.ts` |
| Mobile live voice needs a native build with react-native-webrtc, an https server, a signed-in Cloud conversation; otherwise voice stays turn based. | read in the code | `apps/mobile/src/features/voice/services/liveVoiceAvailability.ts` |
| Mobile image generation is enabled (imageGen true) and uses async jobs polled every 2 s for up to 170 s; mobile video generation code exists but the videoGen flag is false. | read in the code | `apps/mobile/lib/v1FeatureFlags.ts:28`; `apps/mobile/src/features/image/services/imagegen.ts:36-37`; `apps/mobile/src/features/video/services/videogen.ts` |
| Chrome extension wires video generation (start and poll) and dictation through the browser Web Speech API; VS Code only dictation to /api/voice/transcribe?surface=vscode; CLI has push-to-talk voice and image generation. | read in the code | `apps/extension/src/side_panel.ts:395-401`; `apps/extension/src/features/side-panel/voice.ts:145`; `apps/extension-vscode/src/features/sidebar-webview/dictationClient.ts`; `apps/cli/src/voice.rs`; `apps/cli/src/cloud/image.rs` |
| Live voice session records accept only surfaces web, mobile and desktop. | read in the code | `apps/web/app/api/voice/live/sessions/route.ts (CreateLiveSessionSchema)` |
| Image status polling uses the same rate bucket as submission (base 10 per minute) while mobile polls every 2 seconds, so mobile could hit 429 during a long job; not confirmed. | inferred | `apps/web/app/api/media/image/status/route.ts`; `apps/web/lib/rate-limit.ts:384-388`; `apps/mobile/src/features/image/services/imagegen.ts:36` |
| No document in the project records a real run of live voice, image or video generation; the free media changes are explicitly recorded as unvalidated. | stated requirement | `docs/runbooks/free-quota-models.md (Free image and video section)` |
| Voice and media data lives in voice_sessions, image_generation_jobs, image_generation_job_assets, video_generation_jobs, media_assets, managed_usage_requests and usage_events; jobs started in temporary chats carry a temporary_chat flag purged with the chat. | read in the code | `apps/web/db/neon/0260_voice_sessions.sql`; `apps/web/db/neon/0226_durable_image_generation_jobs.sql`; `apps/web/db/neon/0339_temporary_chat_media_jobs.sql` |

## Open questions

- Is the Free daily media offer (10 images, 5 videos) serving anything today? The terms review standing, the console check record and remaining allowances were not read, and most inventory entries show an expiry of 2026-10-21.
- Does the mobile image status poll (every 2 s) hit the 10 per minute image rate bucket in production? The identifier used by the limiter and the production rate-limit scale were not checked.
- Is it intended that Max (not Ultra) has video slots and a 300-second monthly cap in the tier policy while the capability table admits only Ultra and Enterprise?
- Is read-aloud meant to be outside the Free 10-minute voice pool? The code reserves usage money but never checks voice minutes.
- Do mobile on-device dictation and device read-aloud require sign-in? Not established.
- Can any app use own-key (BYOK) for live voice, image or video? The managed routes use server keys only; the CLI can use its own OpenAI key for transcription.
- Where does audio go in the Chrome extension's browser speech recognition and in the desktop Web Speech path? Browser-vendor behavior was inferred, not read.
- Whether free-plan and Basic-plan users can reach video through the free-quota offer was not traced to a test.
- Does the public Electron desktop have any local (on-device) speech path beyond the global dictation shortcut? Only the internal Tauri code shows local Whisper.cpp and Piper.
- Which image and video models are live right now? This lives in the generated catalog (packages/ai/model-registry/catalog/models.curation.json and model-families.json) and was deliberately not read into this page.

## Project documents found out of date

- `docs/product/surface-feature-matrix.md`: Marks Image generation on mobile as Unverified ('Nothing under apps/mobile was found naming the image work mode') and Video generation on Chrome as Absent ('Nothing under apps/extension/src requests a video'). Last updated 2026-09-20. The code says: Mobile has image generation (async job with polling) and the imageGen flag is true. The Chrome side panel imports and calls startChromeVideo against /api/media/video/generate and polls /api/media/video/status. (apps/mobile/src/features/image/services/imagegen.ts:70-100; apps/mobile/lib/v1FeatureFlags.ts:27; apps/extension/src/side_panel.ts:395-401 and :6253; apps/extension/src/features/cloud-bridge/videoGenerationClient.ts:9-12)
- `docs/runbooks/free-quota-models.md`: The sentence 'Mobile restores the eligible no-attachment image fallback; its video UI remains paid-only despite media-capable transport' implies a paid-only video UI exists on mobile. The code says: Mobile video is switched off by the v1 flag videoGen: false, and video messages are hidden from the message list when the flag is off, so there is no paid-only video UI. Also the runbook says 'Plans with the capability are not counted or capped per day', while video seconds are capped monthly by tier policy on the Max product tier. (apps/mobile/lib/v1FeatureFlags.ts:28; apps/mobile/src/features/chat/components/MessageList.tsx:113-114; apps/web/lib/services/tier-unit-quota-service.ts:57-58)
