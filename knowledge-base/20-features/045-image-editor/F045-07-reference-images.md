---
id: "F045-07"
type: "feature"
title: "Reference images"
aliases: ["Reference images", "Guide images", "Reference photos", "Attach photos (mobile paperclip)", "reference_images", "referenceImagesBase64", "referenceImages", "S45.22 Reference-based composition"]
area: "45 Image editor"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S45.22", "S45.23", "S45.24"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "plan:pro", "plan:max", "provider:openai", "api:POST /api/media/image/generate", "api:POST /api/media/image/retry", "table:image_generation_jobs", "file:packages/contracts/cloud-contracts/src/managed-media.ts", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-files-artifacts-and-storage", "SYS-execution-boundaries", "F045-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F045-07 Reference images

In image edit, the first attached picture is the one that is changed. Up to three more pictures can be added as guides for subject, layout or style. Works on Web (and the Electron desktop, which shows web) and Mobile, only on models that accept edits. Combining images and pose or depth guidance are not built. CLI and Chrome have none.

Area: [45. Image editor](README.md). Requirement items: [S45.22](../../10-requirements/capabilities/045-image-editor.md#s4522), [S45.23](../../10-requirements/capabilities/045-image-editor.md#s4523), [S45.24](../../10-requirements/capabilities/045-image-editor.md#s4524).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person attach extra pictures next to the picture being edited so the result follows them. The contract allows one source image plus up to three reference images, four images in total (packages/contracts/cloud-contracts/src/managed-media.ts:86). References are only valid for the 'edit' operation (managed-media.ts:136).

**Why it exists.** The brief asks that a person can supply a reference image and the result is composed from it, with subject, layout or style carried over (S45.22, doc: knowledge-base/data/area-briefs/045-image-editor.md). Both leading assistants take several input images, so the product follows [inferred].

**Who uses it.** People on a paid plan with image creation who edit a photo on Web or Mobile and want another picture to steer the result.

**Problems it solves**

- A text prompt alone cannot describe a specific face, object or style; a picture can.
- Without references the person must re-describe the look in words each time.

**Use cases**

- Edit a product photo and attach a style picture so the new image matches it.
- Attach a second photo of a person and ask for the first photo's scene with that person.
- On the phone, pick up to four photos from the library, the first is edited and the rest guide it.

## 2. User experience

**Where to find it**

- Web (and Desktop through the hosted web app): chat composer in image mode. Attach several images. The first is the picture to edit, the rest are guides (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3777). The operation menu shows 'Edit', 'Variation' and 'Mask edit' (ChatComposerNew.tsx:283-285); references travel only with 'Edit'.
- Mobile: the 'Add to chat' sheet in image mode shows the hint 'Attach up to 4 photos. The first is edited; the rest guide it.' (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:994). The Images screen has a paperclip labelled 'Attach photos' next to the 'Describe an image' field (apps/mobile/src/features/image/ImagesScreen.tsx:423,455).
- CLI: not available. Chrome extension: not available. VS Code: not applicable (brief).

**Before you start**

- Signed in with an account whose plan includes image generation (canUseImages and the image_generation capability) (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1067; apps/mobile/src/features/image/imageCreationAvailability.ts:17).
- An image model whose catalog entry supports edits; the web asks the media availability endpoint for supports_edit (ChatComposerNew.tsx:1370).
- Cloud mode. Mobile blocks with 'requires_cloud' when not in Cloud mode (apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:268 area, block code list at :19-29).
- Network connection (mobile block code 'offline').

**Screens and controls**

- Web composer: image mode toggle, attach button, operation menu (aria-label 'What to do with the attached image'), 'Transparent' toggle (ChatComposerNew.tsx:6364-6450).
- Web: when a model cannot edit, the notice reads 'This image model cannot edit an attached picture. Choose a model that supports editing, or remove the attachment.' (ChatComposerNew.tsx:3757).
- Mobile Images screen: paperclip 'Attach photos', thumbnail strip with remove, one-line note 'Using <model>, which can work with photos.' when the model was switched (apps/mobile/src/features/image/useImageReferences.ts:67-70).
- Mobile: paperclip states ready, full, unavailable (useImageReferences.ts:34).

**Journey**

1. Open image mode (Web composer or Mobile Add to chat / Images screen).
2. Attach the picture to edit first, then up to three guide pictures.
3. Type what to change.
4. Send. Web: refuses with a notice when more than three guides are attached ('Attach up to 4 images: the first is edited and the others guide it.') (ChatComposerNew.tsx:3778-3783).
5. The files are read after the composer clears; guide pictures are shrunk to at most 1024 px on the long side and re-encoded as JPEG on the web (apps/web/features/chat/lib/imageGenerationOptions.ts:216-243). On mobile a guide is sent as is when it fits, else shrunk to 2048 px and compressed (apps/mobile/src/features/image/services/imageReference.ts:7-8,66).
6. A new image card appears in the chat when the job finishes.

**What the person sees and gets**

- Web: local notices in the composer for too many images, unreadable image ('That image could not be read. Attach it again and retry.') or a model that cannot edit (ChatComposerNew.tsx:3757,3811).
- Mobile: messages 'You can add up to 4 photos.', 'Each photo can be added once.', 'Could not open Photos. Please try again.' (useImageReferences.ts:30-32); alerts 'Reference image is too large' and 'This image model cannot use a reference image' (resolveMobileImageGenerationRequest.ts:151-158).
- Output: one generated image card; the edited source picture is kept as an attachment on the mobile user turn (runImageGenerationTurn.ts:253-266).

**Settings**

- Image model choice (web image model menu; mobile model row in Add to chat).
- Aspect ratio and the 'Transparent' toggle apply to the same request.
- No setting turns references off separately.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web composer builds the edit with source plus up to three guide pictures and sends them as reference_images (ChatComposerNew.tsx:3777-3805; apps/web/lib/hooks/useMediaGeneration.ts:358-362).
- The server schema caps references at three and allows them only for 'edit' (packages/contracts/cloud-contracts/src/managed-media.ts:86,104-108,136-141).
- The server resolves each reference, hash-checks it against a denylist, checks image structure, and refuses the request before any charge (apps/web/app/api/media/image/lib/managed-image-generation.ts:555-640).
- The OpenAI edit call sends the source plus references as the 'image[]' form field (apps/web/app/api/media/image/lib/image-generation-provider.ts:485-498).
- Retry of a failed job can re-supply references (apps/web/app/api/media/image/retry/route.ts:43-47,124-133) and the executor checks a hash over source and references so a retry cannot swap images (image-job-executor.ts:282; image-generation-provider.ts:838-844).
- Mobile enforces the same limit, size, image-only and model-support rules before sending (resolveMobileImageGenerationRequest.ts:190-232) and sends guides as reference_images (runImageGenerationTurn.ts:317-318).
- Mobile keeps up to three failed edit requests in memory for retry (runImageGenerationTurn.ts:154-176).

**Incomplete**

- The web edit panel on a finished image card builds an edit with source and mask only; it never attaches guide pictures (ImageGenerationCard.tsx:450-466).
- The web does not check the guide count when attaching, only when sending (ChatComposerNew.tsx:3778) [inferred from the absence of an earlier check; not exhaustively searched].
- The provider adds every reference to the form as image/png named reference-N.png although the web re-encodes guides to JPEG (image-generation-provider.ts:485-498; imageGenerationOptions.ts:241). Effect on the provider is unknown.

**Present but disconnected or switched off**

- The Tauri desktop client's cloud image call sends text-only requests (apps/desktop/src/api/cloudApi.ts:464-471); no reference path exists there. Tauri is retained internal code (doc: AGENTS.md section 5).

**Not available**

- Multi-image combination (S45.23) and pose, depth or edge guidance (S45.24): no code path found (brief).
- CLI: image generation in apps/cli/src/cloud/image.rs has no source or reference option found by search.
- Chrome extension: nothing found. VS Code: not applicable.
- Models whose image API is not 'openai' cannot take references; the edit API list contains only 'openai' (managed-media.ts:62).

## 4. Required behaviour

**Established requirements**

- The user supplies a reference image and the result is composed from it (subject, layout or style carried over). Web, Desktop and Mobile done; CLI and Chrome missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S45.22)
- The user combines several images into one result. Missing on every app. (source: S45.23 (brief))
- The user guides pose or structure with a reference (pose, depth, edges). Missing on every app. (source: S45.24 (brief))
- If a provider does not support vision, image input must not be accepted for that model. (source: doc: docs/product/requirements.md:300)
- Unsupported capabilities are visible: file and image controls respond to the selected model's capability. (source: doc: docs/product/requirements.md:984 (M-MODEL-005))

**Acceptance criteria**

1. Attach one source and three guide pictures in image mode with an edit-capable model on Web: the request is sent and one image returns.
2. Attach one source and four guide pictures on Web: nothing is sent and the notice 'Attach up to 4 images: the first is edited and the others guide it.' shows.
3. On Mobile, a fifth photo cannot be added: the message 'You can add up to 4 photos.' shows.
4. Choose a model that cannot edit and attach a picture: the send is refused with a message naming the problem and nothing is charged.
5. Set operation to Variation or Mask edit: guides are not sent (reference_images only with edit).
6. A guide larger than the size limit is refused on Mobile with 'Reference image is too large'.
7. An API call with reference_images and operation other than edit returns a validation error.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The extra guides are not stored as message attachments; only the source picture is kept on the mobile user turn [inferred from runImageGenerationTurn.ts:253-266].
- The first attachment is the edit source because the code takes attachments[0] (ChatComposerNew.tsx:3759 region and 1376).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Let the card's edit panel attach guide pictures too.
- [proposed] Show the 'first is edited, the rest guide it' hint on Web at attach time, as Mobile does.
- [proposed] Send each guide with its real file type to the provider.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Web composer; splits attachments into source, mask and guides, checks the limit, sends edit (lines 3777-3805). |
| service | readReferenceImageAsBase64 | `apps/web/features/chat/lib/imageGenerationOptions.ts` | Scales a guide to 1024 px long side and re-encodes as JPEG (lines 216-243). |
| service | resolveImageGenerationRequestOptions / ImageEditRequest | `apps/web/features/chat/lib/imageGenerationOptions.ts` | Carries referenceImagesBase64 into the request options (lines 143-185). |
| hook | useMediaGeneration (imageEditFields) | `apps/web/lib/hooks/useMediaGeneration.ts` | Builds reference_images from base64 strings and posts to the image route (lines 111-113,356-363); resumes and retries jobs. |
| endpoint | POST /api/media/image/generate | `apps/web/app/api/media/image/generate/route.ts` | Gates (CSRF, rate limit, age gate, managed compute, org policy, spend limit) then calls generateManagedImage. |
| service | generateManagedImage | `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Validates, moderates, hash-checks uploads, refuses non-edit models, reserves usage, creates the job (lines 255-830). |
| schema | ManagedMediaImageGenerationRequestSchema and limits | `packages/contracts/cloud-contracts/src/managed-media.ts` | Defines MANAGED_MEDIA_MAX_IMAGE_REFERENCES=3, byte limit, rule that references need 'edit'. |
| service | generateWithOpenAIImage | `apps/web/app/api/media/image/lib/image-generation-provider.ts` | Sends source and references to the provider edit API as image[] (lines 459-530). |
| service | editImagesSha256 / resolveImageRefBytes | `apps/web/app/api/media/image/lib/image-generation-provider.ts` | Resolves stored or inline images; hash binds retry to the charged images (lines 430-455,838-844). |
| service | resolveEditContext / image-job-executor | `apps/web/app/api/media/image/lib/image-job-executor.ts` | Rebuilds the edit with references for each job attempt (lines 270-340). |
| endpoint | POST /api/media/image/retry | `apps/web/app/api/media/image/retry/route.ts` | Retries a failed job; accepts source, mask and up to three references again. |
| table | image_generation_jobs | `apps/web/lib/server/image-generation-jobs.ts` | Durable job row; plan stores referenceAssetIds or referencesInline (lines 30-33,243). |
| service | resolveMobileImageGenerationRequest | `apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts` | Mobile admission: limit, image-only, size and edit-capable model checks (lines 190-232,281). |
| service | runImageGenerationTurn | `apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts` | Reads source and guides, sends reference_images, keeps retry state (lines 277-320). |
| service | readReferenceImageBase64 | `apps/mobile/src/features/image/services/imageReference.ts` | Reads a photo; shrinks to 2048 px and lowers quality until it fits. |
| hook | useImageReferences | `apps/mobile/src/features/image/useImageReferences.ts` | Mobile photo strip state, limit of 4, duplicate check, paperclip state. |
| service | resolveImageReferenceModel | `apps/mobile/src/features/image/imageReferenceModel.ts` | Switches to an edit-capable image model when the selected one cannot take photos. |
| component | AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Shows the hint line for photo limits (line 994). |
| screen | ImagesScreen | `apps/mobile/src/features/image/ImagesScreen.tsx` | Mobile Images screen with 'Attach photos' paperclip. |
| service | startImageReferenceCreation | `apps/mobile/src/features/image/startImageReferenceCreation.ts` | Starts a mobile image turn from Images screen photos. |
| component | Images feature page | `apps/web/app/features/images/page.tsx` | Public page that says an edit can be guided by up to three more images (line 121). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person attaches source and guide pictures in the composer or phone sheet; limits and model support are checked. | device | ChatComposerNew.tsx:3756-3783; resolveMobileImageGenerationRequest.ts:190-232 |
| Pictures are read and shrunk (web 1024 px JPEG; mobile 2048 px when needed) and base64-encoded. | device | imageGenerationOptions.ts:216-243; imageReference.ts:7-8,66 |
| Client posts the edit with reference_images to the managed image route. | our servers | useMediaGeneration.ts:358-362; runImageGenerationTurn.ts:317-318 |
| Server runs gates, prompt moderation, upload hash and structure checks, edit-model check, usage reservation, and creates a durable job. | our servers | generate/route.ts:30-100; managed-image-generation.ts:520-830 |
| Executor sends source and references to the image provider's edit API. | outside service | image-generation-provider.ts:478-530 |
| Result image is stored and its URL returned; the chat shows the card. | device and our servers | image-job-executor.ts:270-340 (persisted images); WebChatPage.tsx:3135-3190 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Guide pictures (inline base64 or stored asset ids) | Job plan in table image_generation_jobs holds referenceAssetIds or a referencesInline flag; inline bytes are in the request only (managed-image-generation.ts:769-785) | Not synced as chat attachments; only the job row | unknown (retention of job rows not read) |
| Source picture on mobile user turn | Local message attachment with the device URI (runImageGenerationTurn.ts:253-266) | unknown | unknown |

**Models and providers.** Only models whose catalog image API is 'openai' accept an edit, so guides work only through that provider route (managed-media.ts:62; image-generation-provider.ts:478). The model comes from the catalog, never typed in the client. Images are sent to an outside provider only after the server's checks.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required; mobile blocks with 'Sign in to generate images' (resolveMobileImageGenerationRequest.ts:140-143 area). |
| Permissions | Photo library access on mobile (apps/mobile/src/features/image/photosAccess.ts exists; details unknown). Org policy and spend limit gates apply (generate/route.ts:62-80). |
| Subscription | image_generation capability needs a tier in the pro, max, max_15x, team, team_premium or enterprise list (packages/contracts/types/src/billing-catalog.ts:341,356). Free accounts: mobile paperclip is disabled; free promotional image models create from text only and the web refuses attachments for them (ChatComposerNew.tsx:3726-3730). |
| Limits and metering | Three references, 12,000,000 base64 characters per image, usage reserved before the provider call and not charged on refusal (managed-media.ts:77-86; managed-image-generation.ts:520-530). Rate limit key 'image-generation' (generate/route.ts:38). |
| Feature flags | Capability flag 'canUseImages' checked server side (generate/route.ts:100-118); mobile also checks features.imageGen toggle (block code 'disabled'). |
| Model compatibility | Edit-capable models only; the catalog decides via supports_edit / imageApi. |
| Provider restrictions | Only the provider route with the 'openai' image API takes edits today (managed-media.ts:62). provider:google image path ignores edits (generateWithImagen has no edit input, image-generation-provider.ts:854-880). |
| Local mode | Not available. Image generation runs in Cloud only: mobile returns 'requires_cloud' outside Cloud mode (resolveMobileImageGenerationRequest.ts:268 area) and web uses the managed route. Own-key mode: no path found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Too many guides | Web notice and send aborted; mobile photo cannot be added | ChatComposerNew.tsx:3778; useImageReferences.ts:94-97 |
| Guide unreadable | Web: 'That image could not be read. Attach it again and retry.' Mobile: turn fails with 'The reference image could not be read from this device.' | ChatComposerNew.tsx:3811; runImageGenerationTurn.ts:294 |
| Model cannot edit | Refused before charge, with a message naming editing models on mobile | managed-image-generation.ts:690-710; resolveMobileImageGenerationRequest.ts:214-231 |
| Upload on a known-bad hash or malformed image | 422 refusal; no charge; logged as moderation event | managed-image-generation.ts:596-640 |
| Timeout | Mobile times out after 180 s with retry text; web provider call has a deadline | runImageGenerationTurn.ts:121; image-generation-provider.ts:492 |
| Retry | Retry must include the same images; a hash mismatch is rejected | image-job-executor.ts:282-290 |
| Cancel | Mobile stop returns a cancelled outcome; web has a cancel route | runImageGenerationTurn.ts:239; apps/web/app/api/media/image/cancel |
| Offline | Mobile blocks with 'Network connection required'; web not handled specifically in the code read | resolveMobileImageGenerationRequest.ts:150-153 |
| Accessibility | Mobile paperclip has label 'Attach photos' and a disabled state; web operation button has aria-label | ImagesScreen.tsx:423-429; ChatComposerNew.tsx:6377 |
| Browser without image bitmap support | Guide is sent unscaled | imageGenerationOptions.ts:221 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/ImagesScreenReferences.test.tsx`: Photo strip, limit of four, duplicates, disabled paperclip, Free account, model note, send and keep on refusal.
- `apps/mobile/__tests__/image-generation-admission.test.ts`: Reference admission: too many images, too large, unsupported model, guides passed through.
- `apps/mobile/__tests__/image-generation-turn-action.test.ts`: Edit request carries source and fails when the reference cannot be read.
- `apps/mobile/__tests__/ChatTabImageReferences.test.tsx`: Source, guides and transparent background handed to the generation turn.
- `apps/mobile/__tests__/imageReference.test.ts`: Shrinking to 2048 px, quality steps, temp file cleanup.
- `apps/mobile/__tests__/startImageReferenceCreation.test.ts`: Starting a mobile reference creation.
- `packages/contracts/cloud-contracts/src/__tests__/managed-media.test.ts`: Contract limits (the reference cases found cover video references; image reference cases not confirmed).
- `apps/web/lib/hooks/useMediaGeneration.test.tsx`: Request building; found cases are for video reference images. Image reference_images case not confirmed.
- `apps/web/app/features/images/page.test.tsx`: Public page text about reference count.

**Test scenarios**

- **Web four guides refused**
  1. Open Web chat, image mode, edit-capable model.
  2. Attach one source and four more images.
  3. Type a prompt and send.
  - Expected: Notice 'Attach up to 4 images...' appears and no request is made.
- **Web three guides accepted**
  1. Attach one source and three guides.
  2. Send an edit.
  - Expected: One image returns; the request body carries three reference_images.
- **Mobile fifth photo**
  1. Open Images screen with an editing model.
  2. Add four photos.
  3. Tap 'Attach photos' again.
  - Expected: Message 'You can add up to 4 photos.' and the picker does not open.
- **Non-edit model**
  1. Select a text-only image model.
  2. Attach a photo and send.
  - Expected: Refusal that tells the person to pick an editing model; no usage is charged.
- **API contract**
  1. POST image generate with operation 'variation' and reference_images.
  - Expected: Validation error 'reference_images is only valid for operation edit'.
- **Retry swap**
  1. Make an edit job fail retryably.
  2. Retry with a different source image.
  - Expected: Rejected: the image supplied is not the one that was charged.

**Where to look when it fails**

- Error text 'Image edit source could not be resolved' in server logs (managed-image-generation.ts:577).
- Error code invalid_source_image with param reference_images.N (managed-image-generation.ts:642).
- Table image_generation_jobs plan column; header MEDIA_DIAGNOSTIC_HEADER carries a trace id (generate/route.ts:121).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/045-image-editor.md](../../70-qa/test-plans/web/045-image-editor.md)
- Desktop: [70-qa/test-plans/desktop/045-image-editor.md](../../70-qa/test-plans/desktop/045-image-editor.md)
- Mobile: [70-qa/test-plans/mobile/045-image-editor.md](../../70-qa/test-plans/mobile/045-image-editor.md)

## 10. Gaps and dependencies

- **No test found that sends reference images through the web composer or the generate route.** Affects: Web and Desktop (hosted web). Evidence: Search of apps/web tests for reference_images and referenceImagesBase64 found only video tests.. Work needed: Add composer and route tests for guide count and operation rules.
- **Card edit panel cannot attach guides.** Affects: Web, Desktop. Evidence: ImageGenerationCard.tsx:450-466 builds source and mask only.. Work needed: Add guide attachment to the panel or document the limit.
- **Multi-image combination and pose/depth guidance have no code.** Affects: All apps. Evidence: S45.23, S45.24 in the brief; no code found.. Work needed: Product decision, then provider route and UI.
- **CLI and Chrome cannot use references.** Affects: CLI, Chrome. Evidence: Brief; apps/cli/src/cloud/image.rs has no source option found.. Work needed: Add source and reference flags or mark not applicable.
- **Only one provider image API takes edits.** Affects: All apps. Evidence: managed-media.ts:62. Work needed: Add another edit-capable route or state the limit in product copy.
- **No Local or own-key route for references.** Affects: Mobile, Desktop. Evidence: requires_cloud block; no local image path found.. Work needed: Decision on local image models (see SYS-local-inference).
- Not built on: CLI, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- plan:pro
- plan:max
- provider:openai
- api:POST /api/media/image/generate
- api:POST /api/media/image/retry
- table:image_generation_jobs
- file:packages/contracts/cloud-contracts/src/managed-media.ts
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-files-artifacts-and-storage
- SYS-execution-boundaries
- F045-08

## Unknown

- Retention and deletion of inline guide bytes and job rows.
- Effect of sending JPEG guides labelled as PNG to the provider.
- Whether the mobile source attachment syncs to Cloud and how long it is kept.
- Whether the Electron desktop shell adds any image-specific behaviour (not read).
- Whether other models in the catalog besides one image API can take edits at runtime (catalog not read).
