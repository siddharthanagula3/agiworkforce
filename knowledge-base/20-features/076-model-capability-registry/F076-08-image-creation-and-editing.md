---
id: "F076-08"
type: "feature"
title: "Image creation and editing"
aliases: ["Image creation and editing", "Image generation", "Create image", "Image out", "Image editing", "Multi-reference image editing", "S76.14", "S76.15", "S76.16", "agi image", "/image", "Mask edit", "Variation", "transparent background"]
area: "76 Model-capability registry"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S76.14", "S76.15", "S76.16"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage", "SYS-voice-and-media", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-api-and-contracts", "SYS-execution-boundaries", "mode:cloud", "plan:pro", "plan:max", "plan:team", "plan:enterprise", "provider:openai", "provider:google", "api:POST /api/media/image/generate", "api:GET /api/media/availability", "surface:web", "surface:mobile", "surface:cli", "F076-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F076-08 Image creation and editing

A person makes a picture from a text prompt, or edits attached pictures, using an image model from the catalog. The server checks the plan, safety rules and spend limit, picks the model's image API, and refuses edits on models that cannot edit. Up to three guide pictures can join one edit on Web and Mobile.

Area: [76. Model-capability registry](README.md). Requirement items: [S76.14](../../10-requirements/capabilities/076-model-capability-registry.md#s7614), [S76.15](../../10-requirements/capabilities/076-model-capability-registry.md#s7615), [S76.16](../../10-requirements/capabilities/076-model-capability-registry.md#s7616).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Sends a prompt, and optionally a source picture, a mask and up to three reference pictures, to the Managed Cloud image route. The server resolves the catalog image model, the image API family, and returns images stored in the account library (apps/web/app/api/media/image/lib/managed-image-generation.ts:255-270, 333-349).

**Why it exists.** Image models differ in what they can do (one image or four, editing or not, transparent background or not). The catalog names each model's image API so each app can offer only what works (packages/contracts/cloud-contracts/src/managed-media.ts:57-74; doc: knowledge-base/data/area-briefs/076-model-capability-registry.md S76.14-S76.16).

**Who uses it.** Signed-in people on a plan that includes image generation using Web, Desktop (hosted web app), Mobile in Cloud chats, or the CLI image command.

**Problems it solves**

- A person cannot pick an image model that the server cannot run: the picker lists only admitted models (apps/web/lib/services/media-model-availability-service.ts:156-185).
- Edits to a model that cannot edit are refused before credits are reserved (managed-image-generation.ts:681-696).
- Unsafe prompts and uploads are refused before any charge (managed-image-generation.ts:272-322, 592-651).
- Retries do not charge twice: the idempotency key settles the same reservation (apps/cli/src/cloud/image.rs:437-440).

**Use cases**

- On Web the person turns on image mode, picks an image model, types a prompt and gets a picture.
- On Web the person attaches a photo and chooses Edit, Variation or Mask edit to change it.
- On Mobile the person attaches up to four pictures; the first is edited, the others guide it (apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:195-200).
- In the CLI the person runs 'agi image "a red kite" --aspect 16:9 -n 2' and finds files on disk and in the account library (apps/cli/src/lib.rs:1107-1112).

## 2. User experience

**Where to find it**

- Web and public Desktop: composer plus menu row 'Create image' (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:160); model picker 'Select image model' (ChatComposerNew.tsx:6763); catalog chip 'Image out' (ModelCatalogue.tsx:143-146).
- Web editing: attach a picture while image mode is on; choose 'Edit', 'Variation' or 'Mask edit' (ChatComposerNew.tsx:282-286); the card offers 'Revise this image' and 'Mask image' (apps/web/features/chat/components/ImageGenerationCard.tsx:603, 796).
- Mobile: Add to chat sheet row 'Create image', hint 'Switches this chat to image generation' (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:927-928); or the '/image' command (resolveMobileImageGenerationRequest.ts:160-166).
- CLI: command 'agi image' with flags --out, --aspect, --size, --quality, --transparent, --count/-n, --model/-m, --again, --retry, --save-defaults, --clear-defaults, --last, --list-models (apps/cli/src/lib.rs:1110-1160).
- VS Code and Chrome: not available (no image command or UI found).

**Before you start**

- Signed in with an adult-eligible account (apps/web/app/api/media/image/generate/route.ts:43-50).
- A plan that includes image generation: pro, max, max_15x, team, team_premium or enterprise (packages/contracts/types/src/billing-catalog.ts:341, 356).
- The 'canUseImages' capability open (route.ts:104-112).
- Cloud mode. Mobile refuses outside Cloud with 'requires_cloud' (resolveMobileImageGenerationRequest.ts:20, 114; message says Local Mode runs entirely on-device in the video equivalent, resolveMobileVideoGenerationRequest.ts:64-66).
- An image model admitted by the deployment: provider key and image storage configured (media-model-availability-service.ts:102-118).

**Screens and controls**

- Web: image mode toggle, 'Select image model' menu, 'Aspect ratio' menu, edit operation chips, mask editor, transparent background switch shown only for edit-capable models (ChatComposerNew.tsx:3760-3771).
- Web card: 'Revise this image', 'Aspect ratio', 'Mask image', 'Remove mask', 'Download', 'Copy image', 'Share image', 'Image versions' (ImageGenerationCard.tsx).
- Mobile: 'Create image' row, model list for the active kind, aspect and transparency options.
- CLI: flags above; '--list-models' prints admitted models marked with edit support (lib.rs:3474-3486, 2951).

**Journey**

1. 1. The person turns on image mode (Web 'Create image', Mobile 'Create image' or '/image', CLI 'agi image').
2. 2. The person picks an image model, or accepts the default.
3. 3. The person types a prompt; optionally attaches a source picture (and a mask or guide pictures).
4. 4. The app checks locally: plan, sign-in, online, model can edit if a picture is attached (ChatComposerNew.tsx:3755-3763; resolveMobileImageGenerationRequest.ts:160-190).
5. 5. The app sends the request to the image route with an idempotency key.
6. 6. The server runs the gates, reserves credits, calls the image provider and saves the images.
7. 7. The person sees the picture in chat (or the file path in the CLI) and can revise or download it.

**What the person sees and gets**

- Web notice: 'This image model cannot edit an attached picture. Choose a model that supports editing, or remove the attachment.' (ChatComposerNew.tsx:3757-3760).
- Web notice: 'Attach up to 4 images: the first is edited and the others guide it.' (ChatComposerNew.tsx:3779-3783).
- Mobile message: '<model> cannot edit an attached image. Pick <name> as the image model in Add to chat, or remove the attachment.' (resolveMobileImageGenerationRequest.ts:206-212).
- Server error 422: '<model> cannot take a source image. Choose an image model that supports editing.' (managed-image-generation.ts:685-690).
- Server 400: 'The requested image model supports one image per request.' or 'up to N images per request.' with code unsupported_image_count (managed-image-generation.ts:441-461).
- CLI: 'X cannot make a transparent background. `agi image --list-models` marks the models that can.' (apps/cli/src/cloud/image.rs:520-525).

**Settings**

- Aspect ratio, number of images n (1 to 4), quality 'standard' or 'hd', size, style, negative prompt (packages/contracts/cloud-contracts/src/managed-media.ts:92-103).
- Transparent background (edit-capable models only).
- CLI saved defaults (--save-defaults) stored in image.json (apps/cli/src/cloud/image.rs:35).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Image models are catalog rows with imageGen true and an image API (packages/contracts/types/src/model-catalog.ts:2291-2312).
- The availability endpoint lists each admitted image model with supports_edit, aspect_ratios and max_images (apps/web/lib/services/media-model-availability-service.ts:123-135, 156-185; apps/web/app/api/media/availability/route.ts).
- The server maps the model to a provider and image API, refuses a model/provider mismatch (managed-image-generation.ts:334-349).
- The number of images per request depends on the image API: one for the 'gemini' family, up to four otherwise (apps/web/app/api/media/image/lib/image-generation-provider.ts:228-230; managed-image-generation.ts:441-461).
- Edit is allowed only when the model's image API is in the edit list, which holds only 'openai' (packages/contracts/cloud-contracts/src/managed-media.ts:69-74; managed-image-generation.ts:684-696).
- Multi-reference editing exists: the request schema accepts up to three reference_images for operation 'edit' (managed-media.ts:86, 104-108, 136-141); the server resolves, safety-checks and forwards them to the provider edit call (managed-image-generation.ts:533-579, 668-677; image-generation-provider.ts:485-499). Web and Mobile send them (ChatComposerNew.tsx:3776-3803; resolveMobileImageGenerationRequest.ts:195, 288).
- Route gates in order: rate limit, adult-eligibility, managed compute gate, organization policy, spend limit, then the canUseImages capability (apps/web/app/api/media/image/generate/route.ts:39-112).
- Prompt moderation and uploaded-image checks run before billing (managed-image-generation.ts:272-322, 592-651); model policy check (396-405); no-training opt-out check (407-431).
- Durable jobs with status, cancel and retry routes (apps/web/app/api/media/image/status, cancel, retry; apps/web/app/api/media/image/lib/image-job-executor.ts).
- CLI 'agi image' generation with --transparent, --count and --model (apps/cli/src/lib.rs:1110-1160, 3468-3540; apps/cli/src/cloud/image.rs).
- Mobile runs image generation as a turn action with admission checks (apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts; resolveMobileImageGenerationRequest.ts).

**Incomplete**

- The edit list holds one image API only, so editing and the transparent background work on one model family (managed-media.ts:69).
- Mobile decides edit support from the model's provider field, not its image API (resolveMobileImageGenerationRequest.ts:171-175, 191, 90-92), while the server uses the image API; they agree only while the two names coincide [inferred].
- The mobile image model list is built from catalog entries; whether Mobile also checks the server's admission list is unknown.
- The brief says multi-reference editing is missing everywhere; the code shows it exists on the API, Web and Mobile. It has no registry flag, only the image-API edit list, so it is 'partial'.
- The CLI has no edit and no reference flags: its request struct has no source image field (apps/cli/src/cloud/image.rs:44-60).
- Own-key image generation: not found; the route uses server-held provider keys (apps/web/app/api/media/image/lib/image-generation-provider.ts:463 getApiKey).

**Present but disconnected or switched off**

- Catalog image API names 'imagen' and 'stability' are allowed by the type (model-catalog.ts:680) but no catalog row uses them (packages/ai/model-registry/catalog/models.curation.json has imageApi values gemini and openai only) and the edit list excludes them.

**Not available**

- VS Code and Chrome: image generation and editing not available (brief; no code found).
- Local mode on Mobile and Desktop: refused or not offered (requires_cloud).
- Image editing in the CLI.
- Video-style audio or similar options for images: not applicable.

## 4. Required behaviour

**Established requirements**

- The registry records image-generation models and image requests are admitted only for models that generate images. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.14)
- The registry determines which image models accept a source image, and edit requests are refused for models that cannot edit. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.15)
- The registry records which models accept several reference images for one edit, and the product uses it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.16)
- Subscription capabilities connect to one AGI Subscription system; the image route checks plan, organization policy and spend limit before reserving credits. (source: apps/web/app/api/media/image/generate/route.ts:56-112)
- Local, own-key and Cloud are separate; nothing routes a Local chat to Cloud silently. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. Choosing an image model and sending a prompt returns at least one image and saves it to the account library.
2. Attaching a picture with a model whose image API cannot edit shows the 'cannot edit' notice (Web, Mobile) or returns 422 (API).
3. Requesting n greater than the model's maximum returns 400 unsupported_image_count with max_images.
4. Sending more than three reference images returns a validation error; sending reference_images with operation other than 'edit' is refused.
5. A Free-plan account is refused with the plan message and no credits are reserved.
6. Mobile in Local mode shows the 'requires_cloud' alert and sends no request.
7. The CLI '--transparent' on a model without edit support fails with the message naming '--list-models'.
8. A prompt that fails safety checks returns 422 content_policy_violation and charges nothing.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Whether a model accepts several references should be a registry field, not the image-API edit list [inferred from the brief's wording 'registry records which models accept several reference images'].
- Mobile should read the same edit signal as Web (supports_edit from availability) [inferred from ChatComposerNew.tsx:1367-1371].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add explicit registry flags for editing, mask edit, transparent background and maximum reference images per model.
- [proposed] Make Mobile use the availability endpoint's supports_edit, like Web and the CLI.
- [proposed] Add edit and reference options to the CLI image command.
- [proposed] Correct the brief status for S76.16.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/media/image/generate | `apps/web/app/api/media/image/generate/route.ts` | Gates (rate limit, age, compute, org policy, spend, canUseImages) then hands to the generator (26-112). |
| service | generateManagedImage | `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Validation, moderation, model resolution, edit refusal, image count, reservation and job creation. |
| service | image generation provider | `apps/web/app/api/media/image/lib/image-generation-provider.ts` | Resolves catalog model to provider, max images per API (228-230), calls the OpenAI edit endpoint with references (485-499). |
| service | image job executor | `apps/web/app/api/media/image/lib/image-job-executor.ts` | Runs durable image jobs; companion image-job-drain.ts and image-job-drive-queue.ts. |
| service | edit mask check | `apps/web/app/api/media/image/lib/edit-mask.ts` | Validates a mask against the source picture. |
| schema | ManagedMediaImageGenerationRequestSchema | `packages/contracts/cloud-contracts/src/managed-media.ts` | Request shape: operation, source_image, mask_image, reference_images (max 3), n (max 4), transparent_background (86-141). |
| config | MANAGED_MEDIA_IMAGE_EDIT_APIS | `packages/contracts/cloud-contracts/src/managed-media.ts` | Image API families that can take an edit (69-74). |
| endpoint | GET /api/media/availability | `apps/web/app/api/media/availability/route.ts` | Publishes admitted media models with supports_edit and max_images. |
| service | media model availability | `apps/web/lib/services/media-model-availability-service.ts` | Builds the admission list from the catalog, environment keys and storage evidence. |
| schema | ModelMetadata.imageApi / isExecutableImageModel | `packages/contracts/types/src/model-catalog.ts` | Image API field (680) and the rule for a runnable image model (2291-2312). |
| component | ChatComposerNew (image mode) | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Web image mode, edit operations, reference reading, send (282-286, 1355-1385, 3755-3810). |
| component | ComposerPlusMenu | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | 'Create image' row (160). |
| component | ImageGenerationCard | `apps/web/features/chat/components/ImageGenerationCard.tsx` | Result card, revise, mask, versions. |
| service | imageGenerationOptions | `apps/web/features/chat/lib/imageGenerationOptions.ts` | Resolves aspect ratio, model and edit options into the request (130-215). |
| hook | useMediaGeneration | `apps/web/lib/hooks/useMediaGeneration.ts` | Web client calls for media generation. |
| component | AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Mobile 'Create image' row and model list (927-928). |
| service | resolveMobileImageGenerationRequest | `apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts` | Mobile admission: cloud only, plan, sign-in, online, reference and edit checks. |
| service | runImageGenerationTurn | `apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts` | Mobile turn action that calls the route. |
| command | agi image | `apps/cli/src/lib.rs` | CLI command definition (1110-1160) and handler (3468-3540). |
| service | CLI image client | `apps/cli/src/cloud/image.rs` | Request struct, model choice from availability, idempotency key, saved defaults. |
| table | media assets / image jobs | `apps/web/app/api/media/image/lib/image-job-executor.ts` | Durable job and stored image rows (exact table names not read; see unknowns). |
| test | media-image-generate | `apps/web/__tests__/api/media-image-generate.test.ts` | Route tests. |
| config | billing catalog image_generation | `packages/contracts/types/src/billing-catalog.ts` | Plans that include image generation (356). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app checks the plan, sign-in, network and edit support, and builds the request (source picture and guides as base64 or stored asset ids). | device | ChatComposerNew.tsx:3755-3810; resolveMobileImageGenerationRequest.ts:150-190 |
| The request goes to POST /api/media/image/generate with an Idempotency-Key. | device and our servers | apps/web/app/api/media/image/generate/route.ts:92-97; apps/cli/src/cloud/image.rs:22 |
| The server rate-limits, checks adult eligibility, managed compute, organization policy and spend limit. | our servers | route.ts:39-90 |
| The server validates the body, moderates the prompt, resolves the catalog model and provider, checks mismatch, model policy, training opt-out and image count. | our servers | managed-image-generation.ts:255-461 |
| The server reads and safety-checks source, mask and reference pictures, then refuses edit on a model whose image API cannot edit. | our servers | managed-image-generation.ts:533-696 |
| The server checks the canUseImages capability, reserves credits, and creates a durable job. | our servers | route.ts:98-112; managed-image-generation.ts:779-821 |
| The job calls the image provider (generations or edits endpoint) and stores the results. | outside service | image-generation-provider.ts:463-560 |
| The app shows the result and polls status when async. | device and our servers | apps/web/app/api/media/image/status; apps/cli/src/cloud/image.rs:24-26 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Prompt, options and hashes of source and mask pictures | Image job record in the server database (sourceImageSha256, maskImageSha256 set at managed-image-generation.ts:820-821) | Visible on all apps through the account library [inferred from the CLI doc comment 'lands in your account library', apps/cli/src/lib.rs:1107-1109] | Deleted media is purged by a cron (apps/web/app/api/cron/purge-deleted-media/route.ts); retention length unknown |
| Generated images | Server media storage and a workspace media asset record | Yes, via the account library | Until deleted by the person; purge job for deleted items |
| Local copy of a CLI image and last settings | Chosen folder, plus image.json in CLI memory (apps/cli/src/cloud/image.rs:35) | No | Until the person deletes it |

**Models and providers.** The image model is a catalog row; provider and image API come from it (managed-image-generation.ts:333-349). Only the OpenAI edit endpoint is wired for edits and references (image-generation-provider.ts:485-499); the 'gemini' family returns one image per request. Provider keys are server-held (getApiKey).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account and adult eligibility required (route.ts:43-50). CLI: managed privacy mode only (apps/cli/src/lib.rs:1108-1109). |
| Permissions | Organization policy gate and model policy check apply (route.ts:68-82; managed-image-generation.ts:396-405). CSRF token required (route.ts:34-37). |
| Subscription | Plans pro, max, max_15x, team, team_premium and enterprise include image generation (billing-catalog.ts:341, 356). The canUseImages capability is checked at route.ts:104-112. Free-quota promotional image models exist on Web (ChatComposerNew.tsx:1355-1357); their rules were not read. |
| Limits and metering | Rate limit bucket 'image-generation' (route.ts:39); credits are reserved before the provider call and settled by idempotency key; spend limit checked first (route.ts:88-90). Images per request: 1 to 4 (managed-media.ts:87). Source and reference size cap about 9 MB per picture (managed-media.ts:76-79: base64 length 12,000,000). |
| Feature flags | Capability flag canUseImages (route.ts:109); kill switches are read by assertCapabilityAvailable (apps/web/lib/feature-flags/capability-gate.ts, not read). Mobile has imageGenerationEnabled and globalImageGenerationEnabled inputs (resolveMobileImageGenerationRequest.ts:168-169). |
| Model compatibility | Only catalog models with imageGen true, a live status and an image API run (model-catalog.ts:2300-2312). Edit and transparent background only on the 'openai' image API family. Count limit 1 for 'gemini'. |
| Provider restrictions | Needs the provider key and image storage configured, else the model shows 'provider_not_configured' or 'storage_not_configured' (media-model-availability-service.ts:102-118). |
| Local mode | Not available. Mobile blocks with requires_cloud when the chat is not Cloud (resolveMobileImageGenerationRequest.ts:164). Desktop local: not found. Own key: not found (server keys only). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Card shows 'Generating image' (ImageGenerationCard.tsx:222); durable job polled by status route | ImageGenerationCard.tsx:222 |
| No admitted image model | Web keeps an empty state; CLI says 'Your account's catalogue publishes no image models.' | ChatComposerNew.tsx:1430-1436; apps/cli/src/lib.rs:3476-3479 |
| Offline (Mobile) | Blocked with 'offline' alert | resolveMobileImageGenerationRequest.ts:170 |
| Plan missing | Mobile 'plan_required' alert; server 403-style gate | resolveMobileImageGenerationRequest.ts:171-178; route.ts:104-112 |
| Source picture unreadable | 422 'The source image for this edit could not be read. Upload the image again and retry.' | managed-image-generation.ts:565-587 |
| Prohibited upload or prompt | 422 content_policy_violation, nothing charged | managed-image-generation.ts:306-322, 592-621 |
| Cancel and retry | Cancel and retry routes exist; CLI retries with --retry and cancels with retries up to 5 | apps/web/app/api/media/image/cancel and retry; apps/cli/src/cloud/image.rs:23-24, 33-34 |
| Timeout | Route max duration 60 seconds; provider call deadline constant; CLI waits 150 seconds | route.ts:24; apps/cli/src/cloud/image.rs:30-31 |
| Reconnect or recovery | Web replays the same edit after recovery (request options carry the edit) | imageGenerationOptions.ts:134-137; apps/web/features/chat/pages/__tests__/image-generation-durability.test.ts |
| Accessibility | Card controls carry aria-labels such as 'Revise this image', 'Mask image', 'Download' | ImageGenerationCard.tsx:603, 796, 690 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/media-image-generate.test.ts`: Image generate route.
- `apps/web/__tests__/api/media-image-status.test.ts`: Status route.
- `apps/web/__tests__/api/media-image-cancel.test.ts`: Cancel route.
- `apps/web/__tests__/api/media-image-retry.test.ts`: Retry route.
- `apps/web/lib/services/media-model-availability-service.test.ts`: Admission list and supports_edit.
- `packages/contracts/cloud-contracts/src/__tests__/managed-media.image-edit.test.ts`: Edit request schema.
- `packages/contracts/cloud-contracts/src/__tests__/managed-media.test.ts`: Media schemas including references.
- `apps/web/features/chat/components/ImageGenerationCard.test.tsx`: Card and supports_edit behaviour.
- `apps/mobile/__tests__/image-generation-admission.test.ts`: Mobile admission decisions.
- `apps/mobile/__tests__/ChatTabImageReferences.test.tsx`: Mobile reference pictures.
- `apps/mobile/__tests__/image-generation-turn-action.test.ts`: Mobile turn action.

**Test scenarios**

- **Generate a picture on Web**
  1. Run Web on localhost with a Pro-or-higher test account and image storage and keys set.
  2. Choose 'Create image', pick a model, send a prompt.
  - Expected: A picture appears in the card and in the library.
- **Edit refused on a non-editing model**
  1. Pick an image model whose availability entry has supports_edit false.
  2. Attach a picture and send.
  - Expected: Web notice 'This image model cannot edit an attached picture...'; via API, 422 'cannot take a source image'.
- **Too many images**
  1. POST n=4 to a model with max_images 1.
  - Expected: 400 unsupported_image_count with max_images 1.
- **Reference images**
  1. On Web attach a source and three guides, choose Edit, send.
  2. Attach a fifth picture.
  - Expected: Four pictures accepted; more shows 'Attach up to 4 images'.
- **Free plan**
  1. Use a Free account and try image mode.
  - Expected: Plan-required response and no credit reservation.
- **Mobile Local mode**
  1. In Mobile Local mode choose 'Create image' and send.
  - Expected: Alert requiring AGI Cloud; no network request.

**Where to look when it fails**

- Error codes: model_unavailable, provider_model_mismatch, provider_unavailable, unsupported_image_count, content_policy_violation, invalid_source_image, invalid_mask_image, model_may_train, no_training_model_available (managed-image-generation.ts).
- Log 'Image edit source could not be resolved' (managed-image-generation.ts:566).
- Response header from MEDIA_DIAGNOSTIC_HEADER carries a trace id (route.ts:120-123).
- Mobile block codes such as reference_image_unsupported and reference_image_invalid.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/076-model-capability-registry.md](../../70-qa/test-plans/web/076-model-capability-registry.md)
- Desktop: [70-qa/test-plans/desktop/076-model-capability-registry.md](../../70-qa/test-plans/desktop/076-model-capability-registry.md)
- Mobile: [70-qa/test-plans/mobile/076-model-capability-registry.md](../../70-qa/test-plans/mobile/076-model-capability-registry.md)
- CLI: [70-qa/test-plans/cli/076-model-capability-registry.md](../../70-qa/test-plans/cli/076-model-capability-registry.md)

## 10. Gaps and dependencies

- **Brief says multi-reference editing is missing everywhere, but the API, Web and Mobile support up to three references.** Affects: Docs and test planning. Evidence: managed-media.ts:104-108; ChatComposerNew.tsx:3776-3803; resolveMobileImageGenerationRequest.ts:195. Work needed: Update the brief; add a registry flag so support is per model, not per API family.
- **Edit capability is one list (only 'openai'); no per-model flag for editing, masks, references or transparency.** Affects: All apps. Evidence: managed-media.ts:69-74. Work needed: Add catalog fields and generate the list from them.
- **Mobile reads edit support from provider, not image API.** Affects: Mobile. Evidence: resolveMobileImageGenerationRequest.ts:171-175, 191. Work needed: Use the availability endpoint's supports_edit.
- **CLI cannot edit or use reference pictures; VS Code and Chrome have no image generation.** Affects: CLI, VS Code, Chrome. Evidence: apps/cli/src/cloud/image.rs:44-60. Work needed: Add edit flags to the CLI; decide scope for VS Code and Chrome.
- **No own-key or Local image generation path found.** Affects: Own-key and Local users. Evidence: getApiKey server keys (image-generation-provider.ts:463); requires_cloud on Mobile. Work needed: Decide product direction; local image models are not established in the code read.
- **Brief cites apps/cli/src/lib.rs:943 and :1745 for the CLI image command; those lines hold other commands. The real command is at lib.rs:1110 and 3468.** Affects: Docs. Evidence: apps/cli/src/lib.rs:935-950, 1110. Work needed: Fix the brief citations.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage
- SYS-voice-and-media
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-api-and-contracts
- SYS-execution-boundaries
- mode:cloud
- plan:pro
- plan:max
- plan:team
- plan:enterprise
- provider:openai
- provider:google
- api:POST /api/media/image/generate
- api:GET /api/media/availability
- surface:web
- surface:mobile
- surface:cli
- F076-10

## Unknown

- Exact database table names for image jobs and media assets.
- Whether Desktop (Tauri, internal) has any image controls beyond the hosted web app.
- What the free-quota promotional image path allows and how it counts usage.
- Whether Mobile also checks the server availability list before sending.
- How long generated images are retained.
- Whether own-key image generation is planned.
- What assertCapabilityAvailable does for kill switches (file not read).
- Whether other providers' image models (the 'gemini' family) show any edit-like control in any UI.
