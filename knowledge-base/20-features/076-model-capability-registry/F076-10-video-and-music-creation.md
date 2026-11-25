---
id: "F076-10"
type: "feature"
title: "Video and music creation"
aliases: ["Video and music creation", "Video generation", "Create video", "Video out", "Generated video audio", "Video editing", "Music generation", "S76.17", "S76.18", "S76.19", "S76.20", "/video"]
area: "76 Model-capability registry"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S76.17", "S76.18", "S76.19", "S76.20"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage", "SYS-voice-and-media", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-execution-boundaries", "mode:cloud", "plan:max_15x", "plan:enterprise", "provider:google", "api:POST /api/media/video/generate", "surface:web", "surface:mobile", "F076-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F076-10 Video and music creation

A person makes a short video from a prompt, or from one first-frame picture or up to a few guide pictures. The server checks the plan, the model's listed durations, sizes and ratios, and generated audio against the catalog. Video editing and music are not built. No app has an audio switch.

Area: [76. Model-capability registry](README.md). Requirement items: [S76.17](../../10-requirements/capabilities/076-model-capability-registry.md#s7617), [S76.18](../../10-requirements/capabilities/076-model-capability-registry.md#s7618), [S76.19](../../10-requirements/capabilities/076-model-capability-registry.md#s7619), [S76.20](../../10-requirements/capabilities/076-model-capability-registry.md#s7620).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Sends a prompt and options (duration, resolution, aspect ratio, optional pictures) to the video route, which validates them against the chosen model's catalog data, reserves credits and runs a long job (apps/web/app/api/media/video/generate/route.ts:439-479, 1194-1230).

**Why it exists.** Video models differ in lengths, sizes and audio. Validating against catalog data stops invalid and costly requests (doc: knowledge-base/data/area-briefs/076-model-capability-registry.md S76.17, S76.19).

**Who uses it.** People on the highest paid plans (Max 15x and Enterprise tiers by code) using Web, Desktop (hosted web app) or Mobile in Cloud chats.

**Problems it solves**

- Invalid duration, size or ratio is refused with a clear message (route.ts:454-475).
- Audio is refused for a model that cannot make it (route.ts:469-471).
- A model that cannot take input pictures refuses them with a clear message (route.ts:764-800).

**Use cases**

- Web: person picks a video model, ratio, quality and length, types a prompt.
- Web: person attaches an image to animate it, or several as guides.
- Mobile: person chooses 'Create video' and types a prompt; the app picks sizes from the model.
- API: developer posts prompt, duration_secs, resolution, aspect_ratio, optional generate_audio.

## 2. User experience

**Where to find it**

- Web and public Desktop: composer plus menu row 'Create video' (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:161); pills 'Select video model', 'Select video aspect ratio', 'Select video quality', 'Select video length' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6561, 6614, 6668, 6857); catalog chip 'Video out' (ModelCatalogue.tsx:147-151).
- Mobile: Add to chat sheet row 'Create video', hint 'Switches this chat to video generation' (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:943-945); or '/video' (resolveMobileVideoGenerationRequest.ts:89).
- CLI, VS Code, Chrome: not available (no video command or UI found).

**Before you start**

- Signed in; plan Max 15x or Enterprise (packages/contracts/types/src/billing-catalog.ts:357); capability canUseVideoGeneration open (route.ts:1003-1011).
- Cloud mode (Mobile 'requires_cloud').
- A video model admitted: provider key, release switch and storage configured (apps/web/lib/services/media-model-availability-service.ts:102-118).

**Screens and controls**

- Web: four pills: model, aspect ratio, quality (resolution), length in seconds; the length pill appears only when more than one length exists (ChatComposerNew.tsx:6656); quality entries show 'N/Ns only' when they restrict lengths (6601-6608).
- Web: attached pictures become first-frame or reference input up to the model's limit (ChatComposerNew.tsx:3862-3890; message 'Video takes up to N PNG, JPEG or WebP images...').
- Mobile: model list in the Add to chat sheet; sizes come from the model (mediaMode.ts:83).
- No audio control found on Web or Mobile (searched generate_audio in apps/web/features, apps/web/lib hooks, apps/mobile).

**Journey**

1. 1. Person turns on video mode ('Create video').
2. 2. Picks a video model; the app lists only admitted models.
3. 3. Picks ratio, quality and length from the model's published sizes.
4. 4. Types a prompt; optionally attaches images.
5. 5. The app sends the request with an Idempotency-Key.
6. 6. The server validates, reserves credits and starts a job; the app polls status.
7. 7. The finished clip appears; the person can play or download it.

**What the person sees and gets**

- Validation messages such as '<model> does not support N-second output.' and '<model> does not support <res> output at <ratio>.' (route.ts:454-466).
- '<model> does not support generated audio.' (route.ts:469-471).
- '<model> cannot take input images. Choose a video model that can, or send the prompt alone.' (route.ts:803-806).
- Web notice 'Video generation works from your prompt only...' when attachments are not usable (ChatComposerNew.tsx:3843-3848).
- Mobile alerts: 'Video generation uses AGI Cloud' (Local Mode runs entirely on-device), 'Video generation is not included', 'Network connection required' (resolveMobileVideoGenerationRequest.ts:64-82).

**Settings**

- Duration 2 to 30 seconds by schema, default 4; resolution default 720p; aspect ratio default 16:9; n candidates up to 4 (packages/contracts/cloud-contracts/src/managed-media.ts:47, 160, 195-210; route.ts:1206).
- generate_audio is an API field only; clients do not send it (searched).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Video rows carry videoGeneration data: durations, output sizes (resolution, ratio, width, height, per-size durations) and supportsAudio (packages/contracts/types/src/model-catalog.ts:684, 2330, 2376-2420, 2507-2540).
- The server picks a live video model from the routing slot or provider default and checks it is executable and live (route.ts:380-420).
- Validation of duration, resolution/ratio and audio against the model (route.ts:445-479).
- Input images: first_frame_image or reference_images, never both, limited by model and provider (managed-media.ts:160-195, 217-228; route.ts:764-860).
- Default audio when the caller does not say: the model's supportsAudio, or true for the google provider when the model has no contract (route.ts:1207-1208). Google models always generate audio; turning it off is refused (route.ts:472-474).
- Gates: rate limit, adult, compute, org policy, spend limit, canUseVideoGeneration (route.ts:884-1011).
- Durable jobs with status and cancel routes, plus an openrouter webhook (apps/web/app/api/media/video/status, cancel, openrouter-webhook).
- Cost estimate uses the model's audio flag (apps/web/lib/billing/credit-estimates.ts:106).
- Web pills read model data: aspect, quality and duration options (packages/contracts/types/src/model-catalog.ts:2379-2420).
- Mobile admits video from plan, sign-in, online and model, and sends resolved sizes (resolveMobileVideoGenerationRequest.ts:92-137).

**Incomplete**

- Neither Web nor Mobile sends generate_audio, so there is no audio choice for the person (searched); the server decides from the catalog.
- Mobile sends no input pictures: the request has prompt, model, ratio, resolution and duration only (resolveMobileVideoGenerationRequest.ts:124-137).
- Provider-id defaults for audio mean behaviour depends on provider as well as the registry (route.ts:1207-1208).
- Release switch per provider (isVideoProviderReleaseEnabled) can hide models even when configured (media-model-availability-service.ts:93-100).

**Present but disconnected or switched off**

- Mobile video is behind FEATURES.videoGen (resolveMobileVideoGenerationRequest.ts:97); its value was not read.

**Not available**

- Video editing (S76.18) and music generation (S76.20): no registry field or route found in apps/web/app/api/media (only image and video routes exist).
- Video on CLI, VS Code and Chrome.
- Local video generation on Mobile and Desktop.
- Own-key video generation: not found.

## 4. Required behaviour

**Established requirements**

- The registry records video-generation models and their durations/sizes, and video requests are validated against them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.17)
- The registry records whether a video model generates audio, and generated videos include audio only where the model supports it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.19)
- The registry records which models can edit an existing video and the product uses it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.18)
- The registry records music-generation models and the product can route music requests to them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.20)
- Subscription capabilities use one AGI Subscription system with entitlements and spend limits. (source: apps/web/app/api/media/video/generate/route.ts:933-1011)

**Acceptance criteria**

1. A duration not listed for the model is refused with '<model> does not support N-second output.'
2. A resolution and ratio pair not listed is refused.
3. Asking for audio on a model without audio support is refused.
4. A plan below Max 15x is refused before any credit is reserved.
5. Sending both first_frame_image and reference_images is refused.
6. Attaching more pictures than the model allows is refused with 'takes at most N input images'.
7. Mobile in Local mode shows 'Video generation uses AGI Cloud' and sends nothing.
8. The Web pills show only the lengths, ratios and qualities the model lists.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Audio should be a visible choice where a model offers both modes, since the brief says 'checks audio choice' [inferred from the first-draft use text]; today no such control exists.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an audio switch on Web and Mobile for models where audio is optional.
- [proposed] Add registry fields and routes for video editing and music if they enter scope.
- [proposed] Make the audio default depend only on the registry, not on provider id (route.ts:1208).
- [proposed] Let Mobile attach pictures to a video request.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/media/video/generate | `apps/web/app/api/media/video/generate/route.ts` | Gates, model choice (380-420), validation (445-479), input images (764-860), audio default (1207-1208). |
| endpoint | GET /api/media/video/status | `apps/web/app/api/media/video/status` | Job status polling. |
| endpoint | POST /api/media/video/cancel | `apps/web/app/api/media/video/cancel` | Cancels a job. |
| endpoint | openrouter webhook | `apps/web/app/api/media/video/openrouter-webhook` | Provider callback for jobs on that gateway. |
| schema | ManagedMediaVideoGenerationRequestSchema | `packages/contracts/cloud-contracts/src/managed-media.ts` | Request shape and input image rules (160-230). |
| schema | VideoGenerationMetadata | `packages/contracts/types/src/model-catalog.ts` | Per-model durations, output sizes, supportsAudio, pricing (216, 684, 2376-2540). |
| service | media model availability | `apps/web/lib/services/media-model-availability-service.ts` | Publishes output_sizes, aspect_ratios, supports_audio per video model (139-153). |
| service | video generation jobs | `apps/web/lib/server/video-generation-jobs.ts` | Job rows including duration_secs, resolution, aspect_ratio, generate_audio (142, 412-439). |
| service | credit estimates | `apps/web/lib/billing/credit-estimates.ts` | Estimate uses supportsAudio (106). |
| service | video job reconciliation | `apps/web/lib/services/video-job-reconciliation-service.ts` | Reconciles stuck jobs. |
| service | openrouter video provider | `apps/web/lib/services/openrouter-video-provider-service.ts` | Gateway adapter for video (generate_audio at 147). |
| component | ChatComposerNew (video mode) | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Pills and send (1418-1443, 3843-3890, 6546-6870). |
| service | media-api-service | `apps/web/features/media/services/media-api-service.ts` | generateVideo and getVideoStatus client calls (190-230). |
| component | AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Mobile 'Create video' row (943-945). |
| service | resolveMobileVideoGenerationRequest | `apps/mobile/src/features/chat/actions/resolveMobileVideoGenerationRequest.ts` | Mobile admission and size selection. |
| service | mediaMode | `apps/mobile/src/features/chat/actions/mediaMode.ts` | resolveVideoOutputSelection and model lists (38-107). |
| service | mobile videogen | `apps/mobile/src/features/video/services/videogen.ts` | Sends request, fills duration (58-75). |
| config | billing catalog video_generation | `packages/contracts/types/src/billing-catalog.ts` | Plans: max_15x, enterprise (357). |
| test | media-video-generate tests | `apps/web/__tests__/api/media-video-generate.test.ts` | Route tests; neighbours media-video-generate-input-images, -paywall-contract, -status, -cancel. |
| service | video provider release policy | `apps/web/lib/server/video-provider-release-policy.ts` | Per-provider release switch checked at 427. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app builds the choices from the model's published sizes and attaches pictures if allowed. | device | ChatComposerNew.tsx:1418-1443, 3862-3890; resolveMobileVideoGenerationRequest.ts:124-137 |
| POST /api/media/video/generate with Idempotency-Key. | device and our servers | apps/web/features/media/services/media-api-service.ts:190-203 |
| Rate limit, adult, compute, policy, spend limit, plan capability. | our servers | route.ts:884-1011 |
| Choose live video model, resolve input images, set audio default, validate duration, size and audio. | our servers | route.ts:380-479, 1194-1230 |
| Reserve credits per candidate and create durable jobs. | our servers | route.ts:1048-1071; apps/web/lib/server/video-generation-jobs.ts:412-439 |
| A job calls the video provider and later stores the clip. | outside service | route.ts:599-640, 718-736 |
| The app polls status and shows the clip. | device and our servers | media-api-service.ts:209-230 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Video job row: prompt, model, duration, resolution, ratio, audio flag, source surface, estimated cost | Server database via video-generation-jobs.ts:142, 412 | Visible through the account library [inferred] | Unknown; deleted-media purge cron exists |
| Generated video file | Server media storage (apps/web/lib/server/media-storage.ts) | Yes via the account | Until deleted; retention length unknown |

**Models and providers.** Models come from the video slot or provider defaults and the catalog; adapters exist for google, runway and openrouter only (media-model-availability-service.ts:48). Input pictures only go to google and openrouter adapters (managed-media.ts:166).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in and adult eligible (route.ts:884-902). |
| Permissions | Organization policy and model policy gates; no-training opt-out can restrict to non-training video models (route.ts:430-445). |
| Subscription | Plans max_15x and enterprise only (billing-catalog.ts:357); capability canUseVideoGeneration (route.ts:1003-1011); Mobile also checks it from granted capabilities (resolveMobileVideoGenerationRequest.ts:104-109). |
| Limits and metering | Rate limit bucket 'video-generation'; spend limit before reservation; one reservation per candidate (n up to 4); max duration of the route 300 seconds (route.ts:134). Cost is catalog-priced by resolution, duration and audio (route.ts:482-520). |
| Feature flags | Per-provider release switch (video-provider-release-policy.ts); Mobile FEATURES.videoGen; capability canUseVideoGeneration. |
| Model compatibility | Only catalog rows with videoGen true, live, and a videoGeneration contract (model-catalog.ts:2318-2335). |
| Provider restrictions | Adapters for google, runway and openrouter; Runway prompts limited to 1,000 characters (route.ts:1210-1212); google always includes audio. |
| Local mode | Not available. Mobile blocks with 'requires_cloud' (resolveMobileVideoGenerationRequest.ts:104). Desktop local and own-key: not found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No video model configured | 503 'No executable video model is configured' or 'No live <provider> video model is configured' | route.ts:386-405 |
| Validation failure | Validation error with the model name and the unsupported value | route.ts:454-476 |
| Plan not included | Mobile 'plan_required'; server capability refusal | resolveMobileVideoGenerationRequest.ts:104-109; route.ts:1003-1011 |
| Offline | Mobile 'Network connection required' | resolveMobileVideoGenerationRequest.ts:77-79 |
| Cancel | Cancel route and mobile cancel flow exist | apps/web/app/api/media/video/cancel; apps/mobile/__tests__/video-generation-cancel.test.ts |
| Timeout or stuck job | Reconciliation service handles stuck jobs; estimate of duration returned (60 + 10 per second, or 90 + 15 for google) | apps/web/lib/services/video-job-reconciliation-service.ts; route.ts:452-454 |
| Retry | Idempotency key returns the existing job instead of a second one | route.ts:243-300 |
| Accessibility | Pills have aria-labels such as 'Select video length' | ChatComposerNew.tsx:6668 |
| Unpriced resolution | Refused with code video_resolution_unpriced | route.ts:480-500 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/media-video-generate.test.ts`: Video generate route.
- `apps/web/__tests__/api/media-video-generate-input-images.test.ts`: Input pictures.
- `apps/web/__tests__/api/media-video-paywall-contract.test.ts`: Plan gate contract.
- `apps/web/__tests__/api/media-video-status.test.ts`: Status.
- `apps/web/__tests__/api/media-video-cancel.test.ts`: Cancel.
- `apps/web/lib/services/media-model-availability-service.test.ts`: Video admission shape.
- `apps/mobile/__tests__/video-generation-admission.test.ts`: Mobile admission.
- `apps/mobile/__tests__/ChatTabVideoDuration.test.tsx`: Mobile duration choice.
- `apps/mobile/__tests__/video-generation-cancel.test.ts`: Mobile cancel.

**Test scenarios**

- **Valid clip on Web**
  1. Use a Max 15x test account on localhost with a video provider configured.
  2. Choose 'Create video', pick model, ratio, quality, length and send.
  - Expected: A job starts; the clip appears when done.
- **Unlisted duration**
  1. POST duration_secs not in the model list.
  - Expected: Validation error naming the model and seconds.
- **Audio on a model without it**
  1. POST generate_audio true to a model whose supportsAudio is false.
  - Expected: '<model> does not support generated audio.'
- **Lower plan**
  1. Try video on a Pro account.
  - Expected: Refused with the plan message; no reservation.
- **Pictures on a prompt-only model**
  1. Attach an image in video mode with a model that takes none.
  - Expected: Web notice 'Video generation works from your prompt only'.
- **Mobile Local mode**
  1. Choose 'Create video' in Local mode.
  - Expected: 'Video generation uses AGI Cloud' alert.

**Where to look when it fails**

- Error codes video_resolution_unpriced and validation messages from route.ts.
- Job rows in the video jobs table (name not read) and the reconciliation service logs.
- Media telemetry header MEDIA_DIAGNOSTIC_HEADER (image route shows the pattern).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/076-model-capability-registry.md](../../70-qa/test-plans/web/076-model-capability-registry.md)
- Desktop: [70-qa/test-plans/desktop/076-model-capability-registry.md](../../70-qa/test-plans/desktop/076-model-capability-registry.md)
- Mobile: [70-qa/test-plans/mobile/076-model-capability-registry.md](../../70-qa/test-plans/mobile/076-model-capability-registry.md)

## 10. Gaps and dependencies

- **No audio choice on any app; the server decides from the catalog and provider.** Affects: Web, Mobile, CLI. Evidence: No generate_audio in client request builders (searched apps/web/features, apps/mobile/src); route.ts:1207-1208. Work needed: Add the control or document that audio follows the model.
- **Audio default depends on provider id, not only the registry.** Affects: API callers. Evidence: route.ts:1207-1208. Work needed: Move the rule into the catalog.
- **Video editing and music generation have no registry field, route or UI.** Affects: All apps. Evidence: Only image and video routes under apps/web/app/api/media. Work needed: Decide scope, add fields and routes.
- **Mobile cannot send input pictures; CLI, VS Code, Chrome have no video generation.** Affects: Mobile, CLI, VS Code, Chrome. Evidence: resolveMobileVideoGenerationRequest.ts:124-137. Work needed: Add per product decision.
- **The brief's line citations for route.ts (398-425, 454-475, 1208) are close but the real ranges are 380-420, 445-479 and 1207-1208.** Affects: Docs. Evidence: route.ts. Work needed: Refresh the brief.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage
- SYS-voice-and-media
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-execution-boundaries
- mode:cloud
- plan:max_15x
- plan:enterprise
- provider:google
- api:POST /api/media/video/generate
- surface:web
- surface:mobile
- F076-08

## Unknown

- Table names for video jobs.
- Value of Mobile FEATURES.videoGen in production.
- Which video providers are enabled in production.
- How long clips are retained.
- Whether Desktop Tauri build has any video controls.
- Whether a Local or own-key video path is planned.
- Why the draft says Desktop is done while Desktop shows the hosted web app (doc: AGENTS.md section 5).
