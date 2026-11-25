---
id: "F046-07"
type: "feature"
title: "Reference audio and frame rate"
aliases: ["Frame-rate selector", "Supported frame-rate selector (S46.09)", "Reference-audio option (S46.14)", "fps control", "Voice or music reference for a clip"]
area: "46 Video-generation studio"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S46.09", "S46.14"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "file:packages/contracts/cloud-contracts/src/managed-media.ts", "file:apps/web/app/api/media/video/generate/route.ts", "api:POST /api/media/video/generate", "table:video_generation_jobs", "provider:google", "provider:openrouter", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-voice-and-media", "SYS-api-and-contracts"]
basis: "code inspection"
second_reader: "10 of 13 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F046-07 Reference audio and frame rate

Video-generation studio does not let a person pick a frame rate or supply reference audio on any app. The generate request has no field for either. The only audio control the server accepts is a yes/no generate_audio flag, and no client sends it. Both items are missing everywhere.

Area: [46. Video-generation studio](README.md). Requirement items: [S46.09](../../10-requirements/capabilities/046-video-generation-studio.md#s4609), [S46.14](../../10-requirements/capabilities/046-video-generation-studio.md#s4614).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a person choose a clip's frame rate (where a video model supports it) and attach reference audio (a voice or music track) that guides the clip's sound. Today neither exists. The server accepts only prompt, duration, resolution, aspect ratio, a generate_audio flag, provider, model, candidate count and image inputs (packages/contracts/cloud-contracts/src/managed-media.ts:193-217).

**Why it exists.** The brief lists both as parts of a complete video studio: S46.09 (frame rate where the model supports it) and S46.14 (reference audio where supported) (doc: knowledge-base/data/area-briefs/046-video-generation-studio.md). Competitor guidance tells engineers to inspect audio behaviour and references in video workflows (doc: docs/product/competitive-guidance.md section 5.17, item 132).

**Who uses it.** People making short clips in the Web, Desktop, Mobile and Chrome video modes who want smoother or cinematic motion, or a specific voice or soundtrack. CLI and VS Code have no video mode, so they do not apply (brief status n/a).

**Problems it solves**

- Today: none, because the feature is not built.
- If built: a person could match a clip's motion rate to their project and keep a consistent voice or music across clips.

**Use cases**

- Pick 24 or 30 frames per second for a social clip (not possible today).
- Attach a narration voice sample so the generated characters speak in that voice (not possible today).
- Attach a music track as the mood reference for a clip (not possible today).

## 2. User experience

**Where to find it**

- Not available on Web, Desktop, Mobile or Chrome. The Web video controls are the video model menu, 'Select video aspect ratio', 'Select video quality' and 'Select video length', with no frame-rate or audio control (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6561, :6614, :6668, :6857).
- Mobile 'Create video' sheet offers 'Video model' and aspect, resolution and duration pickers, with no frame-rate or audio control found (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:943, :966).
- CLI and VS Code: no video mode (doc: knowledge-base/data/area-briefs/046-video-generation-studio.md).

**Before you start**

- Not applicable: nothing to use. Video generation in general needs a signed-in account on a plan that includes video generation (apps/web/app/api/media/video/generate/route.ts:1001-1012, :1102-1115).

**Screens and controls**

- No frame-rate control and no audio-upload control exist. A search of apps and packages for frame-rate and reference-audio names found no matches in TypeScript or TSX sources.

**Journey**

1. A person opens video mode and writes a prompt.
2. They can set model, aspect ratio, quality and length, but no frame rate or audio file.
3. They send. The request carries no frame rate or audio reference.

**What the person sees and gets**

- No related feedback exists. The clip comes back at whatever frame rate the provider chooses; the app never states one [inferred from the absent field].

**Settings**

- None. generate_audio is a request field the server accepts but the Web client's request type omits it (apps/web/features/media/services/media-api-service.ts:41-51).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The server decides audio on its own: generate_audio defaults to the model's supportsAudio flag, or true for the google provider (apps/web/app/api/media/video/generate/route.ts:1207-1208).
- The server refuses audio when the model does not support it and refuses audio-off for the google provider (apps/web/app/api/media/video/generate/route.ts:469-474).
- Generated audio is passed to OpenRouter as generate_audio (apps/web/lib/services/openrouter-video-provider-service.ts:147).
- Candidate count n (1 to MANAGED_MEDIA_MAX_VIDEO_CANDIDATES) makes one durable job and one billed reservation per candidate, so metered video_seconds scale with n (managed-media.ts:204; route.ts:1239-1246).
- Runway has its own prompt cap of 1,000 characters (route.ts:1209-1210) and its own submission path (generateWithRunway); this is an option difference between providers.

**Incomplete**

- The model catalog describes video models with durations, output sizes, audio support and seed support only; there is no frame-rate field (packages/contracts/types/src/model-catalog.ts:213-219).

**Present but disconnected or switched off**

- generate_audio exists in the shared request schema (packages/contracts/cloud-contracts/src/managed-media.ts:199) but no app UI sends it (media-api-service.ts:41-51; apps/extension/src/features/cloud-bridge/videoGenerationClient.ts:126; apps/desktop/src/api/cloudApi.ts:610-613).

**Not available**

- Frame-rate selector: Web, Desktop, Mobile, Chrome.
- Reference-audio input: Web, Desktop, Mobile, Chrome.
- Both: CLI and VS Code (no video mode).

## 4. Required behaviour

**Established requirements**

- A person picks the frame rate of the clip where the model supports it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S46.09)
- A person supplies reference audio (voice or music) for the clip where supported. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S46.14)
- Advertised video options must produce real decodable media, and unsupported configurations must show an honest disabled state. (source: doc: docs/product/experience-contract.md (row W12))

**Acceptance criteria**

1. When a video model declares supported frame rates, the composer shows a frame-rate control listing only those rates; models that declare none show no control.
2. The generate request carries the chosen frame rate and the server rejects a rate the model does not list, in the same way it rejects an unsupported duration (route.ts:446-481 pattern).
3. A model that accepts reference audio shows an audio attach control; a model that does not shows it disabled with a reason.
4. Reference audio is validated for type and size before upload and is covered by the same content-safety checks as prompts and images.
5. The cost estimate (VideoCostEstimate) reflects any price change caused by the chosen options.
6. Web, Desktop, Mobile and Chrome offer the same control or an honest disabled state; none shows a dead control.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A frame-rate field would need to be added to the catalog model description first, because the server validates duration and size against the catalog (route.ts:446-481) [inferred].
- Reference audio would need a new uploaded-file type, since reference images today are image-only (managed-media.ts:209-216) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add optional frame_rates and supports_reference_audio to the video metadata in the model catalog, edit the curation file and regenerate, and read them in the composer.
- [proposed] Keep generate_audio as the single audio on/off switch and add a separate reference-audio input only for models that declare it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | ManagedMediaVideoGenerationRequestSchema | `packages/contracts/cloud-contracts/src/managed-media.ts` | Shared request shape for video; lines 193-217 hold every accepted field; no frame rate or audio reference |
| schema | generate_audio field | `packages/contracts/cloud-contracts/src/managed-media.ts` | Optional yes/no audio flag at line 199, the only audio setting |
| service | validateProviderVideoRequest | `apps/web/app/api/media/video/generate/route.ts` | Checks duration, output size and audio support against the model catalog (lines 446-481) |
| service | Audio default resolution | `apps/web/app/api/media/video/generate/route.ts` | Chooses generateAudio when the client omits it (lines 1207-1208) |
| config | VideoGenerationMetadata | `packages/contracts/types/src/model-catalog.ts` | Catalog description of a video model: durationSecs, outputSizes, supportsAudio, supportsSeed, pricing (lines 213-219) |
| config | models.curation.json video entries | `packages/ai/model-registry/catalog/models.curation.json` | Source for supportsAudio per video model (e.g. lines 2382, 2511, 3091); generated into the shared model catalog |
| service | submitOpenRouterVideo | `apps/web/lib/services/openrouter-video-provider-service.ts` | Sends model, prompt, duration, size, generate_audio and images to OpenRouter; no frame rate (lines 119-150) |
| service | generateWithRunway | `apps/web/app/api/media/video/generate/route.ts` | Runway submission path (line 523); Runway prompt capped at 1,000 characters (lines 1209-1210) |
| component | ChatComposerNew video controls | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Web composer video state and menus: aspect 6561, quality 6614, length 6668, model 6857 |
| service | VideoGenerationRequest (web client type) | `apps/web/features/media/services/media-api-service.ts` | Web client request type without generate_audio (lines 41-51) |
| hook | useMediaGeneration video options | `apps/web/lib/hooks/useMediaGeneration.ts` | GenerateVideoOptions lists model, duration, resolution, aspect ratio and input images only |
| component | AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Mobile 'Create video' sheet with model, duration, aspect ratio and resolution pickers (lines 943-966) |
| service | startVideoGeneration | `apps/mobile/src/features/video/services/videogen.ts` | Mobile request to /api/media/video/generate (line 87); request type reuses the shared schema type (line 13) |
| service | generateCloudVideo | `apps/desktop/src/api/cloudApi.ts` | Desktop request sends prompt and optional duration only (lines 600-613) |
| service | startChromeVideo | `apps/extension/src/features/cloud-bridge/videoGenerationClient.ts` | Chrome request body is only the prompt (lines 109-126) |
| component | VideoCostEstimate | `apps/web/features/chat/components/Composer/VideoCostEstimate.tsx` | Shows the credit estimate; would have to include any frame-rate or audio price effect |
| table | video_generation_jobs | `apps/web/lib/server/video-generation-jobs.ts` | Durable job row stores duration, resolution, aspect ratio, generate_audio, source surface (line 142); no frame rate column seen |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person writes a prompt and sets model, aspect ratio, quality and length in the video composer; no frame-rate or audio file step exists. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1414-1443 |
| The Web client posts prompt, duration, resolution, aspect ratio, provider, model and optional images (first_frame_image, reference_images) to the Cloud route, along with conversation_id and assistant_message_id. The route schema extends the shared strict schema with conversation_id and assistant_message_id. | device and our servers | apps/web/features/media/services/media-api-service.ts:41-51; apps/web/app/api/media/video/generate/route.ts:163-165 |
| The server validates the body against the shared schema (unknown fields are rejected because the schema is strict), then resolves audio, checks model limits, billing allowance and starts a durable job. | our servers | packages/contracts/cloud-contracts/src/managed-media.ts:193-217; apps/web/app/api/media/video/generate/route.ts:1207-1295 |
| The job calls the video provider (Runway, Google or OpenRouter) with the chosen model; frame rate and audio reference are never sent. | outside service | apps/web/lib/services/openrouter-video-provider-service.ts:137-150; apps/web/app/api/media/video/generate/route.ts:523 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Video job row with generate_audio flag | table video_generation_jobs in the server database | Server-side only; clients read it through the status route | unknown from the files read; media purge cron exists (apps/web/app/api/cron/purge-deleted-media) |

**Models and providers.** Model choice is read from the model catalog. Frame-rate support and reference-audio support are not described in the catalog today, so no model can be offered them. Providers on the managed video path are runway, google and openrouter (MANAGED_MEDIA_VIDEO_PROVIDERS in packages/contracts/cloud-contracts/src/managed-media.ts:4); only google and openrouter have a folder under packages/ai/providers.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account (Clerk-based) is required for the Cloud video route; Chrome shows 'Sign in to your AGI account to create videos.' (apps/extension/src/features/cloud-bridge/videoGenerationClient.ts:97-103). No account rule specific to frame rate or audio reference exists. |
| Permissions | Workspace policy, model policy and spend-limit gates run before billing (apps/web/app/api/media/video/generate/route.ts:925-945). None specific to this feature. |
| Subscription | Video generation is limited to the plans listed by billing capability video_generation (packages/contracts/types/src/billing-catalog.ts:357): the max_15x or enterprise plan. An account with no subscription gets 'No active subscription found' (route.ts:1102-1115). Frame rate and audio reference have no separate entitlement because they do not exist. |
| Limits and metering | Video is metered in video_seconds units (apps/web/app/api/media/video/generate/route.ts:1239-1246). Candidate count n (1 to MANAGED_MEDIA_MAX_VIDEO_CANDIDATES) makes one durable job and one billed reservation per candidate, so metered video_seconds scale with n (managed-media.ts:204; route.ts:1239-1246). Nothing priced by frame rate or reference audio. |
| Feature flags | capability canUseVideoGeneration gates the route (route.ts:1011). No flag for these items. |
| Model compatibility | Not applicable until the catalog carries the fields. supportsAudio exists per model (model-catalog.ts:216). |
| Provider restrictions | The google provider generates audio with every video and refuses audio-off (route.ts:472-474). Runway has its own prompt cap of 1,000 characters (route.ts:1209-1210) and its own path (generateWithRunway). Whether any provider API accepts frame rate or reference audio: unknown, not checked. |
| Local mode | Video generation runs only in Cloud. No Local video path was found in the video route or the Desktop and Mobile clients read; Mobile asks cloud-send consent first (apps/mobile/src/features/video/services/videogen.ts:94). Local-mode video: none found in the code. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Client sends generate_audio true to a model without audio | Server refuses with a validation error naming the model | apps/web/app/api/media/video/generate/route.ts:469-471 |
| Client sends generate_audio false to a google model | Server refuses: the model generates audio with every video | apps/web/app/api/media/video/generate/route.ts:472-474 |
| Request contains an unknown field such as frame_rate | Rejected by the strict schema as an invalid request [inferred from .strict()] | packages/contracts/cloud-contracts/src/managed-media.ts:217 |
| Loading, empty, offline, retry, cancel for these controls | not handled in the code, because the controls do not exist | searched apps and packages; no matches |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/media-video-generate.test.ts`: Video generate route behaviour (file exists; contents for audio not opened)
- `apps/web/__tests__/api/media-video-generate-input-images.test.ts`: Image inputs to the video route (file exists; not opened)
- `apps/desktop/src/api/__tests__/cloudApi.test.ts`: Desktop cloud video request at /api/media/video/generate (line 373)

**Test scenarios**

- **No frame-rate control**
  1. Sign in on Web on a plan with video
  2. Open video mode
  3. Open each control menu
  - Expected: Only model, aspect ratio, quality and length are offered; no frame rate or audio file control.
- **Server rejects unknown field**
  1. POST /api/media/video/generate with a valid body plus frame_rate: 24 and a valid Idempotency-Key
  - Expected: 400-class validation error naming the unknown field.
- **Audio flag on unsupported model**
  1. POST with generate_audio true for a model whose supportsAudio is false
  - Expected: Validation error 'does not support generated audio'.
- **Google model audio off**
  1. POST with generate_audio false on a google model
  - Expected: Validation error 'generates audio with every video'.

**Where to look when it fails**

- Validation errors are built with createError.validation and carry the model name (route.ts:446-481).
- Failed requests log through logger in route.ts; media telemetry header MEDIA_DIAGNOSTIC_HEADER is defined in apps/web/lib/observability/media-telemetry.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No frame-rate selector** Affects: Web, Desktop, Mobile, Chrome users. Evidence: managed-media.ts:193-217; model-catalog.ts:213-219. Work needed: Add frame-rate data to the model catalog, request schema, server validation, composer control and job column; confirm provider support first.
- **No reference-audio input** Affects: Web, Desktop, Mobile, Chrome users. Evidence: managed-media.ts:209-216 accepts images only. Work needed: New upload type, moderation, size limits, provider adapter fields, composer control, cost rules.
- **generate_audio is accepted but no app exposes it** Affects: all video apps; S46.13 is marked not applicable. Evidence: media-api-service.ts:41-51; videoGenerationClient.ts:126. Work needed: Decide whether to expose an audio switch; see F046-12.
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:max_15x
- file:packages/contracts/cloud-contracts/src/managed-media.ts
- file:apps/web/app/api/media/video/generate/route.ts
- api:POST /api/media/video/generate
- table:video_generation_jobs
- provider:google
- provider:openrouter
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-voice-and-media
- SYS-api-and-contracts

## Unknown

- Whether any provider API accepts a frame rate or reference audio: not checked.
- Whether media-video-generate.test.ts covers the audio flag: file not opened.
- Retention of video job rows after account deletion: not established.

## Second reader's check

A second reader checked 13 statements of this page against the code: 10 correct, 3 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 7):** "Local mode: Mobile asks cloud-send consent first (videogen.ts:97)" The code shows: The ensureCloudSendConsent() call is at line 94, not 97 (line 97 is inside the idempotency key call). The claim itself holds. (apps/mobile/src/features/video/services/videogen.ts:94). **Corrected:** Cite videogen.ts:94.
- **Partly wrong (section 6):** "Providers on the managed video path are runway, google and openrouter (route.ts:358)" The code shows: Line 358 is the start of resolveVideoModel, not the provider list. The list is MANAGED_MEDIA_VIDEO_PROVIDERS = ['runway','google','openrouter']. packages/ai/providers has google and openrouter folders (no runway), as the page says. (packages/contracts/cloud-contracts/src/managed-media.ts:4; route.ts:358). **Corrected:** Cite managed-media.ts:4 for the provider list.
- **Partly wrong (section 6):** "Client posts prompt, duration, ... to the Cloud route (media-api-service.ts:41-51; route.ts:163)" The code shows: Web request type also has provider, conversation_id, assistant_message_id, first_frame_image and reference_images. Route line 163 is the route schema extending the shared schema with conversation_id and assistant_message_id, not a client post. (media-api-service.ts:41-51; route.ts:163-165). **Corrected:** Say the route schema extends the shared strict schema with conversation_id and assistant_message_id.

**Facts the page missed**

- Video generation needs the max_15x or enterprise plan: packages/contracts/types/src/billing-catalog.ts:357. The page never says which plans, and an account with no subscription gets 'No active subscription found' (route.ts:1102-1115).
- Candidate count n (1 to MANAGED_MEDIA_MAX_VIDEO_CANDIDATES) makes one durable job and one billed reservation per candidate, so metered video_seconds scale with n (managed-media.ts:204; route.ts:1239-1246).
- Runway has its own prompt cap of 1,000 characters (route.ts:1209-1210) and its own path (generateWithRunway). The page says nothing about it, though it is an audio and option difference between providers.
