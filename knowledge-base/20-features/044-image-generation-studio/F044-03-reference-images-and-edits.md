---
id: "F044-03"
type: "feature"
title: "Reference images and edits"
aliases: ["Reference images", "Reference-image slots", "Edit image", "Revise this image", "Variation", "Mask edit", "Select an area", "Image edit", "inpaint", "outpaint", "edit_image tool"]
area: "44 Image-generation studio"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S44.04", "S44.33"]
depends_on: ["F044-01", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-model-catalog-and-routing", "SYS-api-and-contracts", "surface:web", "surface:mobile", "mode:cloud", "plan:premium"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F044-03 Reference images and edits

In image mode on Web, Desktop and Mobile, the first attached picture is the one edited and up to three more guide it. Web also offers Variation and Mask edit. Only models on the openai image API can edit. The CLI and Chrome extension cannot.

Area: [44. Image-generation studio](README.md). Requirement items: [S44.04](../../10-requirements/capabilities/044-image-generation-studio.md#s4404), [S44.33](../../10-requirements/capabilities/044-image-generation-studio.md#s4433).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the person attach a picture and describe a change, so the source pixels are edited, or attach extra pictures that guide a new image. The server accepts a source image, an optional mask and up to 3 reference images. (packages/contracts/cloud-contracts/src/managed-media.ts:86,101-108)

**Why it exists.** Many tasks start from an existing picture: remove a background, change a color, make another take. The same managed route serves edits so safety and billing rules are the same as for new images. (apps/web/app/api/media/image/lib/managed-image-generation.ts:527-699)

**Who uses it.** Eligible-plan users on Web, Desktop (hosted web app) and Mobile.

**Problems it solves**

- Changing part of a picture without starting over.
- Keeping a subject consistent by showing guide pictures.
- Blocking unsafe uploads before any provider sees them (managed-image-generation.ts:591-651).

**Use cases**

- Attach a photo, type 'make the sky orange', send.
- Attach a photo, choose 'Variation' for a new take.
- Attach a photo, choose 'Select an area', paint over a region, and describe the change.
- On Mobile, attach one photo to edit and two more as style guides.

## 2. User experience

**Where to find it**

- Web and Desktop: attach a picture in image mode (the composer attachments); the pill 'What to do with the attached image' (menu 'Attached image action') lists Edit, Variation, Mask edit and 'Select an area' (ChatComposerNew.tsx:6364-6430; operations defined at 282-286). On a finished image card, the 'Revise this image' panel has a change box, 'Variation' and a mask control (apps/web/features/chat/components/ImageGenerationCard.tsx:603,738-752).
- Mobile: Add to chat sheet; with Create image active the hint reads 'Attach up to 4 photos. The first is edited; the rest guide it.' or 'This model uses text only. Pick an editing model to edit a photo.' (AddToChatSheet.tsx:983-994).
- CLI and Chrome: not available.

**Before you start**

- Image mode and an image model that supports edits: the catalog image API must be openai (managed-media.ts:69-75); Web reads supports_edit from the availability endpoint (ChatComposerNew.tsx:1370-1372).
- Attachments must be images; image mode takes images only (ChatComposerNew.tsx:2256).
- Each image under about 9 MB (12,000,000 base64 characters) (managed-media.ts:77-79; mobile alert at resolveMobileImageGenerationRequest.ts:151-154).

**Screens and controls**

- Attachment preview with numbered thumbnails when the operation is Edit and more than one image is attached (ChatComposerNew.tsx:5786-5789).
- Operation menu: 'Edit' (Change the attached image with your prompt), 'Variation' (A new take on the attached image), 'Mask edit' (Redraw only where the second image is masked) (ChatComposerNew.tsx:282-286).
- 'Select an area' opens ImageMaskDialog to paint a mask (ChatComposerNew.tsx:6411-6435).
- Card panel 'Revise this image' with an edit box, Variation, aspect and Download.

**Journey**

1. 1. Enter image mode and pick a model that can edit (otherwise the composer says 'This image model cannot edit an attached picture. Choose a model that supports editing, or remove the attachment.') (ChatComposerNew.tsx:3756-3760).
2. 2. Attach the picture to edit. Optionally attach up to 3 more as guides (Edit) or choose 'Select an area' to paint a mask (Mask edit).
3. 3. Type the change and send. The files are read after the composer clears; guides are shrunk to 1024 pixels on the long side (imageGenerationOptions.ts:217-243).
4. 4. The request goes out with operation edit, inpaint or variation, source_image, optional mask_image and reference_images as base64 (ChatComposerNew.tsx:3790-3810).
5. 5. The new image appears as a new version in the chat. On a card, the same can be done from 'Revise this image'.

**What the person sees and gets**

- Notices: 'Attach up to 4 images: the first is edited and the others guide it.' (ChatComposerNew.tsx:3779-3781); 'That image could not be read. Attach it again and retry.' (ChatComposerNew.tsx:3812).
- Server refusals: 422 invalid_source_image, invalid_mask_image, content_policy_violation, or a plain 422 'cannot take a source image' (managed-image-generation.ts:574-587,609-668,684-699).
- Mobile alerts 'Attach only images to edit', 'Reference image is too large', 'This image model cannot use a reference image' (resolveMobileImageGenerationRequest.ts:146-158).

**Settings**

- Web transparency toggle applies to edits too (F044-02).
- Mobile: chosen image model in Add to chat or Settings > media.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web composer edit path with source, mask and references (ChatComposerNew.tsx:3756-3815).
- Web card edit panel, Variation and reframe (outpaint) (ImageGenerationCard.tsx:449-570; imageGenerationOptions.ts:257-308).
- Mobile resolver turns the first attachment into an edit with up to 3 guides, and blocks others with alerts (resolveMobileImageGenerationRequest.ts:190-228,267-291); the turn reads the files and posts them (runImageGenerationTurn.ts:276-330).
- Server resolves the images, checks hash denylist and file structure, validates the mask, refuses non-edit models before reserving usage (managed-image-generation.ts:527-699).
- A chat model can also call an edit-image tool on the latest conversation image (apps/web/app/api/media/image/lib/image-chat-tools.ts:352).

**Incomplete**

- Web composer cannot make an outpaint; only the card reframe does (ChatComposerNew.tsx:276-281; imageGenerationOptions.ts:257-308).
- Mobile edit retry state is held in memory for the last 3 edits; after that a retry says the reference is unavailable (runImageGenerationTurn.ts:164-181; apps/mobile/src/features/chat/actions/imageRetryFallback.ts:5-13).
- A retry of an edit that used uploaded bytes needs those bytes again; the server throws a clear error if they are missing (image-job-executor.ts:285-296,310-313).

**Present but disconnected or switched off**

- Gemini and Imagen API models cannot edit: the list of edit APIs is only openai (managed-media.ts:69). The 'edit' UI is therefore hidden for them.

**Not available**

- CLI: no source or reference option (apps/cli/src/lib.rs:1110-1172).
- Chrome extension: not available (brief S44.04, S44.33).
- Local mode on all apps.

## 4. Required behaviour

**Established requirements**

- User attaches one or more reference images in dedicated slots that guide the generation. (source: S44.04 (brief))
- User edits a generated or uploaded image by describing the change, and the source pixels are edited. (source: S44.33 (brief))
- The schema allows up to 3 reference images and 4 output images; edits need a model whose image API supports them. (source: packages/contracts/cloud-contracts/src/managed-media.ts:69,86-87)
- If a provider does not support vision or image input, the app must not accept image input for that route. (source: doc: docs/product/requirements.md:300)

**Acceptance criteria**

1. On Web with an edit-capable model, attaching one image and sending sends operation edit with source_image and returns a changed image.
2. With a text-only model selected, attaching an image and sending shows the notice and sends nothing.
3. Attaching more than 4 images shows 'Attach up to 4 images...' and sends nothing.
4. POSTing reference_images with operation generate is rejected 400 by the schema.
5. POSTing an edit with a source that matches the hash denylist returns 422 content_policy_violation before any usage is reserved.
6. A malformed or polyglot image returns 422 invalid_source_image.
7. A mask whose size does not fit the source returns 422 invalid_mask_image.
8. On Mobile, attaching a non-image file to an image request shows 'Attach only images to edit'.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Edit support must come from catalog evidence, not a vendor name [inferred from managed-media.ts:56-75 comment and tests managed-media.image-edit.test.ts:83-94].
- The brief's 'reference slots' are the second to fourth attachments; there is no separate slot UI on Web [inferred from ChatComposerNew.tsx:3777-3781].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add the same edit path to the CLI (--source, --mask, --reference) since the route already supports it.
- [proposed] Persist edit retry inputs on the server or device so retries survive beyond 3 items.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | Edit fields and refinements | `packages/contracts/cloud-contracts/src/managed-media.ts` | operation, source_image, mask_image, reference_images rules, limits, supportsManagedMediaImageEdit (lines 44-148). |
| service | Edit source resolution and safety | `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Resolve bytes, denylist, structure check, mask check, edit-support check (lines 527-699). |
| service | edit-mask | `apps/web/app/api/media/image/lib/edit-mask.ts` | Validates the mask against the source. |
| service | resolveImageRefBytes and edit calls | `apps/web/app/api/media/image/lib/image-generation-provider.ts` | Reads asset or inline bytes, calls the edit endpoint (lines 424-545). |
| job | Edit context in the job executor | `apps/web/app/api/media/image/lib/image-job-executor.ts` | Rebuilds the edit input on retry and checks the source is the one that was charged (lines 285-345). |
| service | image-chat-tools | `apps/web/app/api/media/image/lib/image-chat-tools.ts` | Chat tools that generate or edit the latest image (lines 64-451). |
| component | ChatComposerNew edit path | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Operation menu, attachment rules, send (lines 276-290,1370-1400,3756-3815,6364-6435). |
| component | ImageMaskDialog | `apps/web/features/chat/components/Composer/ImageMaskDialog.tsx` | Paint a mask (imported at ChatComposerNew.tsx:45). |
| service | imageGenerationOptions edit helpers | `apps/web/features/chat/lib/imageGenerationOptions.ts` | readReferenceImageAsBase64, buildReframeEdit, request options (lines 164-310). |
| component | ImageGenerationCard EditPanel | `apps/web/features/chat/components/ImageGenerationCard.tsx` | 'Revise this image' panel, Variation, mask, reframe (lines 371-760). |
| hook | useMediaGeneration imageEditFields | `apps/web/lib/hooks/useMediaGeneration.ts` | Adds edit fields to the request (line 509). |
| service | resolveMobileImageGenerationRequest | `apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts` | Reference rules and alerts (lines 174-291). |
| service | runImageGenerationTurn edit branch | `apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts` | Reads references, posts edit, remembers retry input (lines 142-345). |
| service | imageRetryFallback | `apps/mobile/src/features/chat/actions/imageRetryFallback.ts` | Retry rule when a reference is gone. |
| component | AddToChatSheet reference hint | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Hint text and edit-capable flag (lines 269-272,983-994). |
| config | MANAGED_MEDIA_IMAGE_EDIT_APIS | `packages/contracts/cloud-contracts/src/managed-media.ts` | List of image APIs that can edit (line 69). |
| endpoint | GET /api/media/availability supports_edit | `apps/web/app/api/media/availability/route.ts` | Per-model edit support (managed-media.ts:256-262). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The device checks that the model can edit, that attachments are images, within size and count limits. | device | ChatComposerNew.tsx:3756-3781; resolveMobileImageGenerationRequest.ts:190-228 |
| The device reads the files as base64 (guides shrunk to 1024 pixels on Web) and sends them in the generate request. | device | imageGenerationOptions.ts:217-243; runImageGenerationTurn.ts:276-290 |
| The server validates the schema, runs the prompt safety floor, then resolves the images, hashes them against a denylist, checks structure and mask, all before reserving usage. | our servers | managed-image-generation.ts:279-314,527-678 |
| It refuses a model that cannot edit, then reserves usage and creates a job with only the hashes (and asset ids when the source is stored). | our servers | managed-image-generation.ts:684-699,745-786 |
| The attempt sends the images to the provider's edit endpoint, moderates the result and saves it. | outside service | image-generation-provider.ts:456-545; image-job-executor.ts:558-860 |
| The client shows the new image as the result of the turn; failures keep the typed change and mask on Web. | device | ImageGenerationCard.test.tsx:494 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Uploaded source, mask and guide image bytes | Sent inline with the request; held only in memory during the attempt unless they came from a stored asset | No copy kept by the job: it stores SHA-256 hashes (managed-image-generation.ts:676-677) | The job can be re-driven only with the same bytes or stored asset ids (image-job-executor.ts:285-296) |
| Edited output image | media storage and table media_assets | Library on all apps | Unknown |
| Mobile retry inputs of the last 3 edits | In-memory map in runImageGenerationTurn | No | Cleared on account change (runImageGenerationTurn.ts:182-186) |

**Models and providers.** Edit requests go to the openai image API only (managed-media.ts:69); the adapter appends the operation to the reported model name (image-generation-provider.ts:458-461). Google image models cannot take a source image (managed-image-generation.ts:684-699).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; stored-asset references must belong to the caller's workspace (managed-image-generation.ts:540-563; image-generation-provider.workspace-scope.test.ts). |
| Permissions | Same gates as F044-01. The prompt and the uploads pass the safety floor; sexualized edits of an uploaded photo are refused (managed-image-generation.ts:96-116,285-288). |
| Subscription | Same capability image_generation (billing-catalog.ts:356). No separate plan for edits. |
| Limits and metering | At most 3 guide images plus the source; each image up to 12,000,000 base64 characters; cost reserved like a generation (managed-image-generation.ts:703-756). |
| Feature flags | canUseImages on the server (route.ts:100-111). |
| Model compatibility | Only models whose catalog image API is openai (managed-media.ts:69). |
| Provider restrictions | Provider openai only; a request to edit with provider google gets 422. |
| Local mode | Not available; Mobile blocks image requests in Local mode (resolveMobileImageGenerationRequest.ts:252). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Model cannot edit | Web blocks send with a notice; Mobile alert offers to switch to an editing model; the server returns 422 as a backstop. | ChatComposerNew.tsx:3756-3760; alertBlockedImageRequest.ts:9-19; managed-image-generation.ts:684-699 |
| Unreadable file | Web notice 'That image could not be read...'; Mobile fails the turn with 'The reference image could not be read from this device.' | ChatComposerNew.tsx:3812; runImageGenerationTurn.ts:286-294 |
| Source cannot be resolved on the server | 422 'The source image for this edit could not be read. Upload the image again and retry.' | managed-image-generation.ts:574-587 |
| Unsafe or malformed upload | 422 content_policy_violation or invalid_source_image; nothing is charged. | managed-image-generation.ts:597-650 |
| Retry after failure | Web keeps the typed change and the mask; Mobile replays from memory for 3 edits, else says the reference is unavailable. | ImageGenerationCard.test.tsx:494; imageRetryFallback.ts:5-13 |
| Fresh generation vs edit | A regenerate on a model with no edit support does not claim to edit the source. | ImageGenerationCard.test.tsx:184; ImageGenerationCard.tsx:506-513 |
| Accessibility | Mask image control has an aria-label; keyboard operation of the mask dialog not verified. | ImageGenerationCard.tsx:797 |
| Offline, timeout, cancel | Same as F044-01; no edit-specific handling found (not handled in the code beyond F044-01). | Searched the edit branches in ChatComposerNew.tsx:3756-3815 and runImageGenerationTurn.ts:276-345; no offline or timeout handling specific to edits |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/cloud-contracts/src/__tests__/managed-media.image-edit.test.ts`: Edit schema rules: source required, mask for inpaint, URL source rejected, edit API from catalog.
- `apps/web/__tests__/api/media-image-generate.test.ts`: Denylisted source and mask refused before reservation; clean edit still dispatched; sexualized photo edit refused; non-sexual real-person edit allowed (lines 1741-1900).
- `apps/web/app/api/media/image/lib/image-generation-provider.workspace-scope.test.ts`: Stored asset references stay inside the workspace.
- `apps/web/features/chat/components/ImageGenerationCard.test.tsx`: Prompt edit sends the image as source, variation sends no mask, keeps typed change and mask on failure (lines 457-570).
- `apps/web/features/chat/components/Composer/ChatComposerNew.test.tsx`: Composer rules around attachments in image mode (names only).
- `apps/web/e2e/chat-attachment-refusal-and-image-edit.spec.ts`: Browser flow (contents not opened).
- `apps/mobile/__tests__/image-generation-admission.test.ts`: Attached photo becomes an edit, guides up to the limit, too many refused, editing model named (lines 180-231).
- `apps/mobile/__tests__/startImageReferenceCreation.test.ts`: Edits first photo with guides, switches to an editing model, refuses when none can edit, too-large reason.
- `apps/mobile/__tests__/ChatTabImageReferences.test.tsx`: Source, guides and transparency handed to the turn.

**Test scenarios**

- **Edit on Web**
  1. Pick an edit-capable model.
  2. Attach a photo, type 'make the car red', send.
  - Expected: A new image shows the change; the Library has both images.
- **Text-only model**
  1. Pick a model that cannot edit.
  2. Attach a photo and send.
  - Expected: Notice 'This image model cannot edit an attached picture...'; no request.
- **Five attachments**
  1. Attach five images on Web.
  - Expected: Notice about up to 4 images; no request.
- **Denylisted upload**
  1. POST an edit whose source hash is on the denylist (test fixture).
  - Expected: 422 content_policy_violation; no reservation row.
- **Mobile guides**
  1. Attach a photo and two guides with an edit model, send.
  - Expected: Request has operation edit, source_image and two reference_images.
- **Retry after losing references**
  1. Fail four edits in a row on Mobile, then retry the first.
  - Expected: Message that the reference is unavailable; no resend.

**Where to look when it fails**

- Log 'Image edit source could not be resolved' (managed-image-generation.ts:565).
- Moderation events with rule ids managed-image.<param>.hash-denylist (managed-image-generation.ts:604).
- Codes invalid_source_image, invalid_mask_image, content_policy_violation.
- Table image_generation_jobs columns for source and mask hashes.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/044-image-generation-studio.md](../../70-qa/test-plans/web/044-image-generation-studio.md)
- Desktop: [70-qa/test-plans/desktop/044-image-generation-studio.md](../../70-qa/test-plans/desktop/044-image-generation-studio.md)
- Mobile: [70-qa/test-plans/mobile/044-image-generation-studio.md](../../70-qa/test-plans/mobile/044-image-generation-studio.md)

## 10. Gaps and dependencies

- **CLI cannot attach a source or references.** Affects: CLI. Evidence: apps/cli/src/lib.rs:1110-1172; brief S44.04 and S44.33. Work needed: Add flags or record as out of scope.
- **Chrome extension has no edit.** Affects: Chrome extension. Evidence: brief. Work needed: Follows the image-mode decision.
- **Edit-capable models are limited to one image API.** Affects: All edit users. Evidence: managed-media.ts:69. Work needed: Add edit adapters for other image APIs if the product needs them.
- **Mobile edit retry survives only 3 turns.** Affects: Mobile. Evidence: runImageGenerationTurn.ts:164-181. Work needed: Store inputs durably or accept and document the limit.
- **Web composer cannot author an outpaint.** Affects: Web, Desktop. Evidence: ChatComposerNew.tsx:276-281. Work needed: Design a canvas and mask tool or keep card-only reframe.
- Not built on: CLI, Chrome (from the capability ledger).

**Depends on**

- F044-01
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-model-catalog-and-routing
- SYS-api-and-contracts
- surface:web
- surface:mobile
- mode:cloud
- plan:premium

## Unknown

- Whether the denylist is populated in production.
- How the web mask dialog behaves with keyboard and screen readers.
- Whether edits are billed differently from generations: the estimate uses the same function (managed-image-generation.ts:703) but real provider settlement for edits was not traced.
- Contents of the Playwright spec.
