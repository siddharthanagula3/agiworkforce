---
id: "F045-01"
type: "feature"
title: "Attach a photo and describe a change"
aliases: ["Image edit from an attached photo", "Edit an uploaded image", "Edit / Variation operation menu (web composer)", "Reference image edit (mobile)", "operation: edit and variation (request field)", "S45.01 Upload an existing image", "S45.03 Conversational edit instruction"]
area: "45 Image editor"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S45.01", "S45.03"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "plan:pro", "plan:max", "plan:max_15x", "plan:team", "plan:enterprise", "provider:openai", "file:apps/web/app/api/media/image/lib/managed-image-generation.ts", "file:apps/web/features/chat/components/Composer/ChatComposerNew.tsx", "api:POST /api/media/image/generate", "api:GET /api/media/availability", "table:image_generation_jobs", "table:media_assets", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-execution-boundaries", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F045-01 Attach a photo and describe a change

In image mode, the person attaches a photo and types a change. The photo is the source image and the text is the instruction. Web and Desktop (the hosted web app) offer Edit and Variation. Mobile edits the first photo and uses up to three more as guides. CLI and Chrome cannot do this. Free plans are refused.

Area: [45. Image editor](README.md). Requirement items: [S45.01](../../10-requirements/capabilities/045-image-editor.md#s4501), [S45.03](../../10-requirements/capabilities/045-image-editor.md#s4503).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Turns a photo the person owns into the source of an AI image edit, then applies a typed instruction. The request goes to the managed image route with operation edit or variation, a source image and optional guide images (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3755-3815; packages/contracts/cloud-contracts/src/managed-media.ts:96-110).

**Why it exists.** The brief requires that an uploaded image becomes the source an edit changes, and that a typed natural-language change edits the image itself (doc: knowledge-base/data/area-briefs/045-image-editor.md S45.01, S45.03). The product requirements list image generation and editing among the ChatGPT and Claude features to match (doc: docs/product/requirements.md:183).

**Who uses it.** Signed-in people on a plan that includes image generation, on web, desktop (hosted web) and mobile.

**Problems it solves**

- Changing a real photo without leaving the chat.
- Describing a change in plain words instead of using a drawing tool.
- Using other photos as visual guides for the edit.

**Use cases**

- Attach a product photo and type 'make the sky sunset orange'.
- Attach a portrait and press Variation for a new take.
- On a phone, attach a photo plus two style photos and type the change.
- Edit the photo on the person's phone from the Add to chat sheet in AGI Cloud mode.

## 2. User experience

**Where to find it**

- Web and Desktop (Electron shows the hosted web app, apps/desktop/electron/main.ts:1065-1067): chat composer in image mode. The operation button has aria-label 'What to do with the attached image' and shows Edit, Variation, or Mask edit (ChatComposerNew.tsx:282-286, 6375).
- Mobile: chat composer with the Add to chat sheet in image mode; sending with attachments runs the edit (apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:190-292). The Images screen also has a reference-photo path (apps/mobile/src/features/image/startImageReferenceCreation.ts).
- Mobile, on an image already in a chat: full-screen viewer controls 'Change this image' and 'Edit an area of this image' (apps/mobile/src/features/chat/components/ImageFullScreen.tsx:641-647).
- CLI, Chrome extension, VS Code extension: not available. The CLI image command only draws from a prompt (apps/cli/src/lib.rs:1110-1135; apps/cli/src/cloud/image.rs has no source or mask handling).

**Before you start**

- Signed in with a plan that includes image generation (Pro tier or above by code name) (packages/contracts/types/src/billing-catalog.ts:341,356).
- Web: an image model that the media availability endpoint reports as supports_edit (ChatComposerNew.tsx:1370-1371).
- Mobile: AGI Cloud mode, online, image generation switched on, and an editing-capable model (resolveMobileImageGenerationRequest.ts:252-266).
- Provider consent on mobile: the person answers a sharing-with-providers question before the first send (apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:212-224).

**Screens and controls**

- Web composer: image mode toggle, paperclip or drag and drop attach, operation button (Edit, Variation; Mask edit only once a second file is attached), 'Transparent' pill, aspect menu, Send (ChatComposerNew.tsx:282-286, 1377-1383, 6439-6453).
- Web notice when the model cannot edit: 'This image model cannot edit an attached picture. Choose a model that supports editing, or remove the attachment.' (ChatComposerNew.tsx:3756-3760) and a warning panel 'cannot edit an attached image' with a 'Use <model>' button when an editing model exists (ChatComposerNew.tsx:5275-5300).
- Mobile: 'Change this image' sheet with a 'Describe the change' field and 'Change' button, 'Make a variation', and 'Another shape' (apps/mobile/src/features/image/components/ImageChangeSheet.tsx).

**Journey**

1. Open a chat and switch the composer to image mode.
2. Attach a photo (the first attachment is the source).
3. Web: pick Edit or Variation from the operation button. Mobile: no operation menu; the first photo is always edited.
4. Type the change. Mobile may attach up to three more images that only guide the result.
5. Press Send. The composer clears and the photo is read in the background.
6. A generating card shows while the job runs.
7. The edited image replaces the card. On failure a message appears with a retry control.

**What the person sees and gets**

- Generating card in the chat, announced to screen readers on web ('Generating a new version of this image').
- On web, the finished image card keeps earlier versions (WebChatPage.tsx:3465-3487).
- Failure text from the server or a generic message; web shows 'Try again' on the failed card, mobile keeps up to 3 failed edits for Retry (runImageGenerationTurn.ts:146-170).
- Plan refusal: web server returns plan_upgrade_required (managed-image-generation.ts:196-208); mobile alert 'Image generation is not included' (resolveMobileImageGenerationRequest.ts:140-147).

**Settings**

- Web composer: image model, aspect ratio, style presets, Transparent toggle (ChatComposerNew.tsx:6439-6453).
- Mobile: Add to chat sheet has image model, aspect ratio and 'Transparent background' rows (AddToChatSheet.tsx:1000-1045).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web composer sends an edit or variation with the first attachment as source and attachments after it as guides (edit only, up to 3) (ChatComposerNew.tsx:3755-3815).
- Web refuses to send, with a notice, when the chosen model cannot edit (ChatComposerNew.tsx:3756-3760).
- Server validates the request: source is required for every non-generate operation, references only for edit (managed-media.ts:112-150).
- Server refuses a model that cannot take a source image before any charge (managed-image-generation.ts:680-697).
- Server refuses a free plan with 403 code plan_upgrade_required (managed-image-generation.ts:196-208; test apps/web/__tests__/api/media-image-generate.test.ts:786).
- Mobile resolves the first attachment as source with operation edit and the rest as guides, max 4 images (resolveMobileImageGenerationRequest.ts:190-292).
- Mobile viewer can edit a generated image: whole-image change, variation, area edit (ImageFullScreen.tsx:641-647; apps/mobile/app/(app)/chat/[id].tsx:2063-2120).

**Incomplete**

- Mobile attach path never sends Variation or a mask; those exist only in the viewer for images already in the chat (resolveMobileImageGenerationRequest.ts:286).
- Mobile reads the editing-support check from catalog provider in some files and from imageApi in another: resolveMobileImageGenerationRequest.ts:91,176,214, AddToChatSheet.tsx:271 and imageReferenceModel.ts:14 pass .provider, while apps/mobile/stores/chat/imageEditSupport.ts:7 passes .imageApi. They agree today only because both resolve to the same value [inferred].

**Present but disconnected or switched off**

- Mobile image generation is switched by FEATURES.imageGen and the per-user imageGen setting (apps/mobile/lib/v1FeatureFlags.ts:26; resolveMobileImageGenerationRequest.ts:253-254).
- The managed route checks the canUseImages capability flag (apps/web/app/api/media/image/generate/route.ts:92-101).

**Not available**

- CLI: no edit of an existing picture (apps/cli/src/lib.rs:1110-1135; no source_image in apps/cli/src/cloud/image.rs).
- Chrome extension and VS Code extension: nothing under them requests an image (doc: docs/product/surface-feature-matrix.md:306-309).
- Desktop retained Tauri code only generates from a prompt (apps/desktop/src/api/cloudApi.ts:457-480).

## 4. Required behaviour

**Established requirements**

- The user's uploaded image becomes the source image an edit changes. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S45.01)
- A typed natural-language change edits the image itself. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S45.03)
- Web, desktop and mobile are marked done; CLI and Chrome are marked missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S45.01, S45.03)
- Image generation and editing are part of the reference product set the app must match. (source: doc: docs/product/requirements.md:183)
- A model that cannot take a source image must cost the caller nothing. (source: apps/web/app/api/media/image/lib/managed-image-generation.ts:680-697)

**Acceptance criteria**

1. On web in image mode with an editing model, an attached photo plus text sends one request with operation edit and the photo as source_image.
2. Choosing Variation sends operation variation with the same source.
3. With a non-editing model selected and a photo attached, nothing is sent and the notice about editing appears.
4. A Free account gets the upgrade refusal and no charge.
5. On mobile, three guide images plus the source are accepted; a fifth image is refused with 'Attach up to 4 images'.
6. A failed edit shows a message and a retry that reuses the same photo.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Guide images are shrunk to a 1024-pixel edge before sending on web to keep the request small [inferred from readReferenceImageAsBase64, imageGenerationOptions.ts:210-233].
- The brief's code line numbers for route.ts:591 no longer point at the edit logic, which now lives in managed-image-generation.ts [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer Variation and Mask edit on the mobile attach path, not only in the full-screen viewer.
- [proposed] Add a CLI 'agi image --from <file>' edit command using the existing route.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Image mode, attach, operation menu, edit-support notice, send |
| config | IMAGE_EDIT_OPERATIONS | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:282` | Edit, Variation, Mask edit entries |
| service | imageGenerationOptions | `apps/web/features/chat/lib/imageGenerationOptions.ts` | Builds the request options, reads files as base64, shrinks guide images |
| screen | WebChatPage handleGenerateImage | `apps/web/features/chat/pages/WebChatPage.tsx:3278` | Adds user and assistant messages and starts the image turn |
| hook | useMediaGeneration.generateImage | `apps/web/lib/hooks/useMediaGeneration.ts:440` | POSTs to the managed image route with an Idempotency-Key and deadline |
| endpoint | POST /api/media/image/generate | `apps/web/app/api/media/image/generate/route.ts` | CSRF, rate limit, age gate, managed compute, org policy and spend gates |
| service | generateManagedImage | `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Entitlement, validation, moderation, source resolution, edit-support check, reservation, job creation |
| service | image job executor | `apps/web/app/api/media/image/lib/image-job-executor.ts` | Runs the provider call, persists images, settles billing |
| service | generateWithOpenAIImage | `apps/web/app/api/media/image/lib/image-generation-provider.ts:459` | Sends the edit as multipart to the provider's image edit endpoint |
| schema | ManagedMediaImageGenerationRequestSchema | `packages/contracts/cloud-contracts/src/managed-media.ts:96` | Request shape and edit rules |
| service | media model availability | `apps/web/lib/services/media-model-availability-service.ts:109` | Publishes supports_edit per model |
| endpoint | GET /api/media/availability | `apps/web/app/api/media/availability/route.ts` | Delivers model availability to web and mobile |
| service | resolveMobileImageGenerationRequest | `apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts` | Decides ready or blocked for a mobile image request, picks source and guides |
| service | runImageGenerationTurn | `apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts` | Mobile turn runner: consent, read photo, call route, timeout, retry memory |
| component | AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Mobile attach sheet and image options |
| service | imagegen client | `apps/mobile/src/features/image/services/imagegen.ts` | Mobile calls generate, status and cancel routes |
| service | readReferenceImageBase64 | `apps/mobile/src/features/image/services/imageReference.ts` | Reads and shrinks a photo to fit the size cap |
| component | ImageChangeSheet | `apps/mobile/src/features/image/components/ImageChangeSheet.tsx` | Mobile 'Change this image' sheet (edit, variation) |
| service | startImageReferenceCreation | `apps/mobile/src/features/image/startImageReferenceCreation.ts` | Images screen path that starts a reference-photo creation |
| table | image_generation_jobs | `apps/web/lib/server/image-generation-jobs.ts:243` | Durable job row for each image request |
| table | media_assets | `apps/web/lib/server/media-assets.ts` | Stored generated images |
| config | image_generation capability tiers | `packages/contracts/types/src/billing-catalog.ts:356` | Which plans may generate or edit images |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web composer reads the attached files as base64 (guide images shrunk) after clearing itself. | device | ChatComposerNew.tsx:3786-3806; imageGenerationOptions.ts:210-233 |
| WebChatPage creates the conversation if needed, adds the prompt message and a generating card, and calls generateImage. | device | WebChatPage.tsx:3278-3380 |
| Browser POSTs JSON to the managed image route with an Idempotency-Key and a deadline. | device and our servers | apps/web/lib/hooks/useMediaGeneration.ts:440-520 |
| Route checks CSRF, rate limit, age gate, managed-compute gate, organization policy and workspace spend limit before any credit is reserved. | our servers | apps/web/app/api/media/image/generate/route.ts:29-92 |
| Server checks subscription, plan tier and the canUseImages flag, validates the body, then screens the prompt and the uploaded bytes (hash denylist, file structure). | our servers | managed-image-generation.ts:155-215, 262-300, 525-670 |
| Server refuses a model that cannot edit, then reserves managed usage once for the whole job. | our servers | managed-image-generation.ts:680-697, 745 |
| The job executor sends the source (and guides) to the provider's image edit endpoint and stores the returned image as a media asset. | outside service | image-generation-provider.ts:459-520; image-job-executor.ts:352-380 |
| Mobile resolves the request (cloud only), asks the provider-sharing question, reads the photo, then calls the same route with a 180 second timeout. | device and our servers | resolveMobileImageGenerationRequest.ts:240-292; runImageGenerationTurn.ts:110, 212-324 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Source and guide images, mask | Sent inline as base64 in the request; held in memory for the call. Whether a copy is kept for retry: the job stores asset ids only when the request used stored assets (managed-image-generation.ts:769-785). | Not synced as such | Inline upload retention after the job: unknown |
| Job row (prompt, model, operation, hashes of source and mask, plan) | table image_generation_jobs (apps/web/lib/server/image-generation-jobs.ts:243) | Server side | Retention period unknown |
| Generated image | table media_assets plus stored object (managed-image-generation.ts; image-job-executor.ts) | Appears in the Library on every app | Library delete moves to deleted items (mobile Library alert, apps/mobile/src/features/library/index.tsx:564-571) |
| Image versions list on the chat message | message metadata imageVersions (WebChatPage.tsx:3465-3487) | With the conversation | Mobile caps at 50 shown versions (apps/mobile/src/features/image/imageVersions.ts:9) |
| Failed mobile edit for Retry | in-memory map, last 3 (runImageGenerationTurn.ts:146-170) | No | Cleared on account change |

**Models and providers.** The chosen image model comes from the generated catalog and the media availability endpoint decides supports_edit by the model's image API (media-model-availability-service.ts:109; managed-media.ts:69). Today only the openai image API is listed as edit-capable (managed-media.ts:69), so only the openai provider adapter takes an edit; the google adapter is generation only (image-generation-provider.ts:846-881). The model is never hardcoded in the composer.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in required: web uses the Clerk user (generate/route.ts:42); mobile blocks with auth_required (resolveMobileImageGenerationRequest.ts:254). An adult-eligibility gate runs first (generate/route.ts:43-50). |
| Permissions | Workspace scope and organization policy are checked (generate/route.ts:53-92); a stored asset used as source must belong to the active workspace (image-generation-provider.ts:430-445). Mobile asks provider-sharing consent (runImageGenerationTurn.ts:212-224). |
| Subscription | Needs an active subscription and a plan whose capability list includes image_generation: pro, max, max_15x, team, team_premium, enterprise (billing-catalog.ts:341,356; managed-image-generation.ts:155-208). Free is refused with 403 plan_upgrade_required (test media-image-generate.test.ts:786). Which public plan name each code name maps to: unknown from the code read. |
| Limits and metering | Rate limit bucket 'image-generation' (generate/route.ts:39); workspace spend limit gate (generate/route.ts:86); usage reserved once per job at an estimated cost (managed-image-generation.ts:745-757). Max 3 guide images and 4 results (managed-media.ts:86-87); inline image cap about 9 MB of bytes (managed-media.ts:80-84). Web function limit uses IMAGE_GENERATION_FUNCTION_LIMIT_MS (useMediaGeneration.ts:27). Mobile timeout 180 seconds (runImageGenerationTurn.ts:110). |
| Feature flags | canUseImages capability flag (generate/route.ts:92-101); mobile FEATURES.imageGen and the per-user imageGen setting (v1FeatureFlags.ts:26). |
| Model compatibility | Only models whose image API is listed in MANAGED_MEDIA_IMAGE_EDIT_APIS can edit (managed-media.ts:69). Promotional free image models are excluded from edit on web (ChatComposerNew.tsx:1370-1371). |
| Provider restrictions | Edit goes to the openai adapter only (image-generation-provider.ts:459-520). This is Cloud mode only: the user's own key route for image editing was not found in the code read. |
| Local mode | Mobile: Local mode is blocked with 'Image generation uses AGI Cloud' (resolveMobileImageGenerationRequest.ts:252). Web and Desktop: no local image editing path found; what image mode does while a local model is selected: unknown (only localAttachmentConflict seen, ChatComposerNew.tsx:1587). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Generating card; screen reader status 'Generating a new version of this image'; mobile shows image generation progress. | ImageGenerationCard.tsx:700-702 |
| Empty prompt | Web: a photo with no text gives no send; mobile blocks with 'Add an image prompt'. | resolveMobileImageGenerationRequest.ts:249-250 |
| Model cannot edit | Web notice and no send; mobile alert naming editing models with switch option. | ChatComposerNew.tsx:3756-3760; resolveMobileImageGenerationRequest.ts:214-228 |
| Too many images | Web: 'Attach up to 4 images' notice; mobile: same alert. | ChatComposerNew.tsx:3779-3783; resolveMobileImageGenerationRequest.ts:195-200 |
| File cannot be read | Web notice 'That image could not be read. Attach it again and retry.' Mobile fails the turn with 'The reference image could not be read from this device.' | ChatComposerNew.tsx:3808; runImageGenerationTurn.ts:262-270 |
| Upload refused by safety checks | 422 with a policy message, before any charge. | managed-image-generation.ts:596-650 |
| Timeout | Mobile message after 180 seconds with Retry; web aborts at the function limit and shows a timeout message. | runImageGenerationTurn.ts:110-125; useMediaGeneration.ts:479 |
| Rate limited | Mobile shows the server message with a retry time. | runImageGenerationTurn.ts:372-379 |
| Plan refusal | Web card text 'Upgrade required' when the error mentions upgrade or 403; mobile removes the turn and opens the paywall. | ImageGenerationCard.tsx:440; runImageGenerationTurn.ts:361-365 |
| Cancel | Mobile stop marks the operation stopped and calls the cancel route; web has a cancel route and cancel handling. | apps/mobile/src/features/image/services/imageGenerationStops.ts; apps/web/app/api/media/image/cancel/route.ts |
| Offline | Mobile blocks with 'Network connection required'. Web offline handling for this send: not handled in the code read. | resolveMobileImageGenerationRequest.ts:255 |
| Guide images in web when switching from Mask edit back to Edit | The mask file stays as attachment 2 and is sent as a guide image (attachments.slice(1)). | ChatComposerNew.tsx:3777 |
| Accessibility | Operation button has an aria-label; mobile controls have accessibility labels; the failure and notice areas use role alert. | ChatComposerNew.tsx:6375; ImageChangeSheet.tsx:200-205 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/ChatComposerNew.test.tsx`: Image attached stays attached (3556), edit sent as source (3569), refuses a non-editing model (3610), Free account kept out of image mode (3456, 3470), by test names; not run here.
- `apps/web/e2e/chat-attachment-refusal-and-image-edit.spec.ts`: An attached image in image mode offers edit, variation and mask (line 85); a mask edit carries the second image (line 140).
- `apps/web/__tests__/api/media-image-generate.test.ts`: Subscription and plan checks (755-831), denylisted source and mask refused before reservation (1741-1783).
- `apps/web/__tests__/api/media-image-retry.test.ts`: Retry route for image jobs (by file name).
- `apps/mobile/__tests__/startImageReferenceCreation.test.ts`: Mobile reference-photo creation (by file name).
- `apps/mobile/__tests__/ChatTabImageReferences.test.tsx`: Chat tab image references (by file name).
- `apps/mobile/__tests__/ImageChangeSheet.test.tsx`: Change held until described, edit and variation submit, unreadable and too-large image (lines 60-149).
- `apps/mobile/__tests__/image-generation-turn-action.test.ts`: Mobile turn runner (by file name).

**Test scenarios**

- **Web edit with an editing model**
  1. Sign in on a plan that includes images.
  2. Switch to image mode, pick an editing model.
  3. Attach a photo, leave Edit selected, type a change, Send.
  - Expected: One POST to /api/media/image/generate with operation edit and source_image; an edited image replaces the generating card and the Library gains an asset.
- **Web non-editing model**
  1. Pick a model that is not edit-capable.
  2. Attach a photo and press Send.
  - Expected: Warning 'cannot edit an attached image'; no request is sent.
- **Free account**
  1. Sign in on Free.
  2. Try image mode and a typed /image prompt.
  - Expected: Upgrade answer; a direct API call returns 403 plan_upgrade_required.
- **Mobile four-photo edit**
  1. AGI Cloud mode, image mode.
  2. Attach four photos, type a change, send.
  - Expected: First photo edited, three used as guides; a fifth photo gives 'Attach up to 4 images'.
- **Mobile Local mode**
  1. Switch to a Local chat.
  2. Try /image with a photo.
  - Expected: Alert 'Image generation uses AGI Cloud'.
- **Unsafe upload**
  1. Send an edit whose source is a known-blocked file (test fixture).
  - Expected: 422 content_policy_violation and no usage reserved.

**Where to look when it fails**

- Response header MEDIA_DIAGNOSTIC_HEADER carries the trace id (generate/route.ts:109).
- Server log 'Image edit source could not be resolved' (managed-image-generation.ts:566-573).
- Error codes: plan_upgrade_required, subscription_required, invalid_source_image, invalid_mask_image, content_policy_violation, model_unavailable.
- Tables image_generation_jobs and media_assets.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/045-image-editor.md](../../70-qa/test-plans/web/045-image-editor.md)
- Desktop: [70-qa/test-plans/desktop/045-image-editor.md](../../70-qa/test-plans/desktop/045-image-editor.md)
- Mobile: [70-qa/test-plans/mobile/045-image-editor.md](../../70-qa/test-plans/mobile/045-image-editor.md)

## 10. Gaps and dependencies

- **The brief says Desktop is done but desktop edit lives only in the hosted web app; the retained Tauri client generates only from a prompt.** Affects: Desktop. Evidence: apps/desktop/src/api/cloudApi.ts:457-480; apps/desktop/electron/main.ts:1065. Work needed: Record desktop as 'hosted web' in the matrix; no code work if Tauri stays internal.
- **CLI and Chrome cannot edit an existing picture.** Affects: CLI, Chrome extension. Evidence: apps/cli/src/lib.rs:1110-1135; docs/product/surface-feature-matrix.md:306-309. Work needed: Add a source-image option to the CLI command; design a Chrome entry.
- **Mobile attach path has no operation choice; Variation and mask exist only in the viewer.** Affects: Mobile. Evidence: resolveMobileImageGenerationRequest.ts:286; ImageFullScreen.tsx:641-647. Work needed: Decide whether to expose Variation at attach time.
- **The brief's code references for route.ts:591 and similar are out of date.** Affects: Documentation. Evidence: apps/web/app/api/media/image/generate/route.ts has 128 lines. Work needed: Refresh the brief's code column.
- **Web composer can send the mask file as a guide image if the person switches back to Edit after painting.** Affects: Web, Desktop. Evidence: ChatComposerNew.tsx:3777. Work needed: Drop the mask attachment when the operation leaves Mask edit, or confirm intended.
- Not built on: CLI, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- plan:pro
- plan:max
- plan:max_15x
- plan:team
- plan:enterprise
- provider:openai
- file:apps/web/app/api/media/image/lib/managed-image-generation.ts
- file:apps/web/features/chat/components/Composer/ChatComposerNew.tsx
- api:POST /api/media/image/generate
- api:GET /api/media/availability
- table:image_generation_jobs
- table:media_assets
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-execution-boundaries
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy

## Unknown

- Whether a user-key (own key) route can edit images: none found in the code read.
- How long an inline uploaded source is kept after a job finishes.
- Public plan names that map to the code tiers pro, max, max_15x.
- Web behaviour in image mode while a local model is selected.
- Whether Desktop Electron adds any image-specific behaviour beyond the hosted web app.
- Test results: no record of a run was found.
