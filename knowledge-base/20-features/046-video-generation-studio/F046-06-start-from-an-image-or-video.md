---
id: "F046-06"
type: "feature"
title: "Start from an image or video"
aliases: ["Image to video", "First frame", "Reference image", "Make a video from the attached image", "Video-to-video (S46.03, not built)", "Multiple reference slots (S46.04)", "first_frame_image", "reference_images"]
area: "46 Video-generation studio"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S46.02", "S46.03", "S46.04"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "plan:enterprise", "api:POST /api/media/video/generate", "provider:google", "provider:openrouter", "file:apps/web/features/chat/components/Composer/video-input-images.ts", "file:packages/contracts/cloud-contracts/src/managed-media.ts", "SYS-security-and-privacy", "SYS-model-catalog-and-routing", "SYS-files-artifacts-and-storage", "SYS-execution-boundaries", "F046-01", "F046-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F046-06 Start from an image or video

On web, a person attaches one image as the first frame, or several as references, and the server sends them to a video model that accepts images (Google and OpenRouter families only). The server checks type, size, a known-bad hash list and the model's image limit. Video-to-video is not built. Mobile, Chrome and CLI do not send images.

Area: [46. Video-generation studio](README.md). Requirement items: [S46.02](../../10-requirements/capabilities/046-video-generation-studio.md#s4602), [S46.03](../../10-requirements/capabilities/046-video-generation-studio.md#s4603), [S46.04](../../10-requirements/capabilities/046-video-generation-studio.md#s4604).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets the person start a clip from a picture ('the clip opens on this image') or guide its look with up to four reference pictures.

**Why it exists.** Image-to-video is a common way to control a clip and is part of the area brief (S46.02, S46.04). Video-to-video (S46.03) is in the brief but has no code.

**Who uses it.** Paid web users (and the public desktop) making clips from existing pictures.

**Problems it solves**

- Describing a look in words alone.
- Animating a still image.
- Keeping a character or product consistent across a clip.

**Use cases**

- Attach a product photo, choose 'First frame', and describe the motion.
- Attach three style pictures and let them act as references.
- Attach an image while in a chat and use the 'Video' chip to enter video mode with the image kept.

## 2. User experience

**Where to find it**

- Web composer: attach a PNG, JPEG or WebP image, then use the 'Video' chip (aria 'Make a video from the attached image' or '...images') or enter 'Create video' first (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2750-2756, 5796-5815).
- In video mode with one image: a menu (aria 'How the attached image is used') with 'First frame' (hint 'The video opens on this image') and 'Reference image' (hint 'The image guides how the video looks'); with several images it shows a 'Reference images' label (ChatComposerNew.tsx:604-607, 6482-6545).
- Other apps: no control (mobile request builder has no image fields: runVideoGenerationTurn.ts:132-146; Chrome refuses attachments in video mode: side_panel.ts:8779-8784).

**Before you start**

- Video mode on; a video model whose admission is 'enabled' and which accepts images (limit above zero) (video-input-images.ts:25-31).
- Images must be PNG, JPEG or WebP (video-input-images.ts:15-23).
- Same plan and sign-in rules as F046-01.

**Screens and controls**

- Attachment row with the staged images; a hint 'Video takes up to N PNG, JPEG or WebP images.' (ChatComposerNew.tsx:5228-5230).
- A link-style button 'Use <model label>' when the picked model cannot take images but another can (ChatComposerNew.tsx:5242-5248).
- The input-use menu (above).

**Journey**

1. 1. Attach image(s) in the composer.
2. 2. Choose the 'Video' chip, or open 'Create video' and attach there.
3. 3. For one image choose First frame (default) or Reference image; for several images they are references (video-input-images.ts:33-35).
4. 4. Describe the clip in words (a prompt is required; with only an image the composer says 'Describe the video you want to make.').
5. 5. Send. The page reads the images as base64 and sends them in the request (video-input-images.ts:37-50; useMediaGeneration.ts:29-36).
6. 6. The server validates and sends the images to the provider (F046-01 flow).

**What the person sees and gets**

- Composer notices: 'Video generation works from your prompt only. Attached files are not sent to the video model...' for a model with no image input (ChatComposerNew.tsx:2226-2233); 'Video takes PNG, JPEG or WebP images only...' (2240); 'Video takes up to N PNG, JPEG or WebP images, so only X of Y were attached.' (2247).
- Server errors: '<model> cannot take input images. Choose a video model that can, or send the prompt alone.' (route.ts:795-797); '<model> takes at most N input images.' (800); 'An input image could not be read. Attach it again and retry.' with code invalid_input_image and status 422 (813-818); 'Input images must be PNG, JPEG or WebP.' (857); refusal with content_policy_violation for a denylisted image (836-841).

**Settings**

- The account no-training setting still applies to the chosen model (route.ts:1159-1176).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: first-frame and reference image input is built and connected end to end: composer UI, base64 reading, request fields, route checks and provider mapping. The brief's 'missing' status for S46.02 and S46.04 on web is out of date (ChatComposerNew.tsx:604-607, 6482-6545; route.ts:779-871; tests listed below).
- Contract: first_frame_image or reference_images (not both), reference list 1 to 4 (managed-media.ts:205-232).
- Per-model limit: only providers 'google' and 'openrouter' take images, the catalog entry must list the image modality and a maxImagesPerRequest of at least 1, and the limit is capped at 4 (managed-media.ts:160-190).
- Server safety: image bytes are resolved for the caller, checked against a hash denylist, then structure-checked; a match is recorded as a moderation event and refused (route.ts:821-861).
- Provider mapping: Google receives image parts before the text with a task of image_to_video or reference_to_video (route.ts:589-613); OpenRouter receives input images through submitOpenRouterVideo (route.ts:729-737).

**Incomplete**

- Chrome refuses attachments in video mode and its request is prompt-only (side_panel.ts:8779-8784; videoGenerationClient.ts:126).
- Retry of an image video works only while the page stays open (F046-04).
- Only two catalog video entries declare image input today (read from the generated catalog file packages/contracts/types/src/models.json, not line cited); which of them is live in production is unknown.

**Present but disconnected or switched off**

- Mobile: the shared request type allows the fields (videogen.ts:13) but no mobile code sets them; the mobile video flow is also off.
- Runway: no image input (limit 0 for runway) and the provider is withheld (managed-media.ts:168-181; video-provider-release-policy.ts:17).

**Not available**

- Video-to-video (S46.03): the request schema is strict and has no video input field (managed-media.ts:193-217), and no client sends a video.
- Per-shot references, saved characters and style slots (S46.17, S46.24) do not exist.
- CLI, VS Code: no video.

## 4. Required behaviour

**Established requirements**

- The user supplies an image as the first frame or source of a video (S46.02). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S46.02)
- The user supplies a video as input to generate a new video (S46.03). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S46.03)
- The user fills several reference slots (images, characters, styles) for one video (S46.04). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S46.04)
- Uploaded media is refused when it matches the known-bad hash list or is malformed, and the refusal is recorded. (source: apps/web/app/api/media/video/generate/route.ts:821-861)
- Send first_frame_image or reference_images, never both; images are limited to the model's declared maximum and to four. (source: packages/contracts/cloud-contracts/src/managed-media.ts:160-232)
- Input images leave the device to our server and then to the outside provider; this must be consented and trust-boundary correct (Local content never silently goes to a cloud route). (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. Attaching one PNG and choosing 'First frame' sends first_frame_image and no reference_images.
2. Attaching two or more images sends reference_images and no first_frame_image.
3. A model with no image input shows 'Video generation works from your prompt only...' and the send is refused with attachments.
4. A GIF or PDF attachment is refused with the PNG, JPEG or WebP message.
5. An image above the model limit is refused client-side with the count message and server-side with 'takes at most N input images.'
6. An image matching the denylist returns 422 content_policy_violation and records a moderation event.
7. A request carrying both fields returns a validation error and starts nothing.
8. After a reload, retrying a first-frame video does not silently drop the image.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Because the image goes to an outside provider, a consent step like mobile's cloud-send consent is expected for any future mobile or Chrome input path.
- [inferred] The brief's S46.02/S46.04 'missing' status should read 'built on web, absent elsewhere'.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update the brief and the surface matrix to reflect the web build.
- [proposed] Decide whether video-to-video is in scope; the founder decision log does not mention S46.02-04.
- [proposed] Add first-frame input to Chrome and mobile through the same request fields.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | video-input-images helpers | `apps/web/features/chat/components/Composer/video-input-images.ts` | Accepted types (15-23), per-model limit (25-31), kind choice (33-35), base64 read (37-50). |
| component | ChatComposerNew image handling | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Kind menu (604-607, 6482-6545), limits and notices (1565-1585, 2226-2250), 'Video' chip (2734-2756, 5796-5815), send branch (3821-3893). |
| hook | useMediaGeneration videoInputImageFields | `apps/web/lib/hooks/useMediaGeneration.ts` | Maps kind to first_frame_image or reference_images (29-36). |
| service | media-api-service VideoInputImages | `apps/web/features/media/services/media-api-service.ts` | Request type (38-52). |
| schema | ManagedMedia video image contract | `packages/contracts/cloud-contracts/src/managed-media.ts` | Limits and refine rule (160-232). |
| endpoint | POST /api/media/video/generate (input images) | `apps/web/app/api/media/video/generate/route.ts` | resolveVideoInputImages (779-871), Google mapping (589-613), OpenRouter mapping (711-752). |
| service | resolveImageRefBytes | `apps/web/app/api/media/image/lib/image-generation-provider.ts` | Reads the image from base64 or a stored asset for the caller. |
| service | moderation (hash denylist, structure check) | `apps/web/lib/moderation` | matchDenylistedUpload, inspectImageBytes, recordModerationEvent used at route.ts:824-861. |
| service | openrouter-video-provider-service | `apps/web/lib/services/openrouter-video-provider-service.ts` | Builds the OpenRouter submission including input images. |
| service | videoRetryInputs | `apps/web/features/chat/lib/videoRetryInputs.ts` | Custody of images for retry. |
| screen | WebChatPage image custody | `apps/web/features/chat/pages/WebChatPage.tsx` | videoInputImagesRef (3735, 4020-4046). |
| config | Generated model catalog | `packages/contracts/types/src/models.json` | Per-model inputModalities and imageInput.maxImagesPerRequest (generated; do not hand-edit). |
| screen | Chrome video-mode attachment refusal | `apps/extension/src/side_panel.ts` | Refuses attachments in video mode (8779-8784). |
| service | Mobile videogen request | `apps/mobile/src/features/video/services/videogen.ts` | Request type includes the fields but nothing sets them (13). |
| test | Composer video input tests | `apps/web/features/chat/components/Composer/ChatComposerNew.videoInputImages.test.tsx` | Composer behaviour. |
| test | Route input image tests | `apps/web/__tests__/api/media-video-generate-input-images.test.ts` | Route behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person attaches images; the composer filters to PNG, JPEG and WebP and to the model's limit. | device | ChatComposerNew.tsx:2226-2250; video-input-images.ts:15-31 |
| On send, the images are read to base64 (large files downscaled by readReferenceImageAsBase64) and placed in the request as b64_json. | device | video-input-images.ts:37-50; useMediaGeneration.ts:29-36 |
| The server checks the model's image limit, resolves bytes, checks the hash denylist and image structure, and rebuilds data URLs. | our servers | route.ts:779-871 |
| The images are sent to the outside provider (Google as image parts with an image_to_video or reference_to_video task; OpenRouter through its video API). | outside service | route.ts:589-613, 729-737 |
| The page keeps the images in memory for a possible retry. | device | WebChatPage.tsx:4020-4022, 3735 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Input images (base64 in the request) | Request memory on our server; the job row does not store them (route.ts:1550-1572 passes no images) | No | Not persisted by the job; provider-side retention is outside our control and unknown. |
| Moderation event for a blocked image (rule id, sha256, user id) | Moderation events store (recordModerationEvent) | Server-side | Not read. |
| videoInputKind on the chat message | web_messages metadata | Yes | With the chat (WebChatPage.tsx:3965-3975). |

**Models and providers.** Only catalog models with the image modality and a declared image limit on the google or openrouter adapters accept images (managed-media.ts:160-190). The no-training account setting restricts which model may be used (route.ts:1159-1176).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; same as F046-01. |
| Permissions | Images are resolved for the caller and the workspace (route.ts:803-806); the same gates apply. |
| Subscription | Ultra or Enterprise (billing-catalog.ts:357). No extra charge rule for images was found; cost uses the same catalog formula (route.ts:1223-1237). |
| Limits and metering | At most 4 images and no more than the model's declared maximum (managed-media.ts:190); image size handled by MANAGED_MEDIA_IMAGE_REF_MAX_BYTES on the client (video-input-images.ts:41-45); exact byte cap on the server not read. |
| Feature flags | Composer shows the input controls only when the model's admission is 'enabled' and its limit is above zero (video-input-images.ts:25-31). |
| Model compatibility | A model without image modality returns limit 0 and the request is refused (route.ts:793-798). |
| Provider restrictions | google and openrouter adapters only (managed-media.ts:168); runway is not allowed and is withheld. |
| Local mode | No Local or own-key path: the images go to our server and an outside provider. Mobile blocks all video in Local mode (resolveMobileVideoGenerationRequest.ts:107). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Model takes no images | Attach rows close; notice says prompt only; send with attachments refused. | ChatComposerNew.tsx:1578-1585, 3821-3826 |
| Wrong file type | Notice 'Video takes PNG, JPEG or WebP images only. Leave video mode to send this file to the chat model.' | ChatComposerNew.tsx:2236-2242 |
| Too many images | Only the first N attached and the notice says how many. | ChatComposerNew.tsx:2244-2250 |
| Image only, no prompt | Notice 'Describe the video you want to make.' | ChatComposerNew.tsx:3834-3836 |
| Unreadable image on the client | Notice 'That image could not be read. Attach it again and retry.' | ChatComposerNew.tsx:3889-3891 |
| Unreadable image on the server | 422 invalid_input_image with param naming the field. | route.ts:808-819 |
| Denylisted image | 422 content_policy_violation with moderation rule id. | route.ts:824-842 |
| Both inputs sent | Validation error on reference_images. | managed-media.ts:219-232; test media-video-generate-input-images.test.ts:671 |
| Retry after reload | Refused with a message to attach again. | videoRetryInputs.ts:15-25 |
| Accessibility | Menu has an aria-label; chip has descriptive aria-label. | ChatComposerNew.tsx:5804-5806, 6498 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/ChatComposerNew.videoInputImages.test.tsx`: Video chip for an attached image, first-frame request, reference request, several images as references, model limit notice, non-image refusal, hidden chip when no model takes images, closed attach for no-image models, capable-model offer.
- `apps/web/__tests__/api/media-video-generate-input-images.test.ts`: Reference and first-frame mapping to providers (OpenRouter and Google), refusal of both together, refusal for models without image support, unreadable image, denylisted image, too many images.
- `apps/web/features/chat/lib/videoRetryInputs.test.ts`: Image custody on retry.
- `apps/web/lib/services/openrouter-video-provider-service.test.ts`: OpenRouter submission shape (titles not read).
- `packages/contracts/cloud-contracts/src/__tests__/managed-media.test.ts`: Shared media contract (titles not read).

**Test scenarios**

- **First frame**
  1. Web, Ultra account, an image-capable video model.
  2. Attach one PNG, choose 'First frame', add a prompt, send.
  3. Inspect the request body and the finished clip.
  - Expected: Body has first_frame_image only; the clip begins on the image.
- **References**
  1. Attach three JPEGs, add a prompt, send.
  - Expected: Body has reference_images with three items; no first_frame_image.
- **No-image model**
  1. Pick a video model with no image input.
  2. Try to attach and send an image.
  - Expected: Notice and refusal; nothing sent.
- **Bad file**
  1. Attach a GIF in video mode.
  - Expected: PNG, JPEG or WebP notice.
- **Denylist**
  1. In a test environment send an image whose hash is on the denylist.
  - Expected: 422 content_policy_violation and a moderation event.
- **Video input**
  1. POST a body with an unknown field such as video_input.
  - Expected: Strict-schema validation error (video-to-video is not supported).

**Where to look when it fails**

- Log 'Video input image could not be resolved' (route.ts:809-812).
- Moderation events with rule ids 'managed-video.<param>.hash-denylist' and '.<reason>' (route.ts:831, 851).
- Request log field inputImageCount (route.ts:1696-1698).
- Error codes invalid_input_image, content_policy_violation.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/046-video-generation-studio.md](../../70-qa/test-plans/web/046-video-generation-studio.md)
- Desktop: [70-qa/test-plans/desktop/046-video-generation-studio.md](../../70-qa/test-plans/desktop/046-video-generation-studio.md)

## 10. Gaps and dependencies

- **Brief marks image-to-video and references as missing on web, but they are built and tested.** Affects: Engineers, testers, product. Evidence: ChatComposerNew.tsx:6482-6545; test files listed above; brief S46.02, S46.04. Work needed: Correct the brief status to web built, others missing.
- **Video-to-video does not exist anywhere.** Affects: All apps. Evidence: managed-media.ts:193-217 (strict schema, no video field). Work needed: Decide scope first; then add contract, UI and provider mapping.
- **Mobile and Chrome cannot send input images.** Affects: Mobile, Chrome. Evidence: runVideoGenerationTurn.ts:132-146; side_panel.ts:8779-8784. Work needed: Add attachment path plus consent for sending images to a provider.
- **Image video retry is lost after reload.** Affects: Web. Evidence: WebChatPage.tsx:3735; videoRetryInputs.ts:21-24. Work needed: Store images durably if parity with 'same settings' is required.
- **Server byte-size limit for input images was not confirmed, and the denylist content is not visible here.** Affects: Security review. Evidence: route.ts:803-861 reads MANAGED_MEDIA_IMAGE_REF_MAX_BYTES indirectly via the schema. Work needed: Read ManagedMediaImageRefSchema limits and add a test for the cap.
- **No frame-rate, style, character or per-shot reference controls (S46.09, S46.15, S46.17, S46.24).** Affects: All apps. Evidence: Brief marks them missing; no code found. Work needed: Product decision per item.
- Not built on: Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:max_15x
- plan:enterprise
- api:POST /api/media/video/generate
- provider:google
- provider:openrouter
- file:apps/web/features/chat/components/Composer/video-input-images.ts
- file:packages/contracts/cloud-contracts/src/managed-media.ts
- SYS-security-and-privacy
- SYS-model-catalog-and-routing
- SYS-files-artifacts-and-storage
- SYS-execution-boundaries
- F046-01
- F046-04

## Unknown

- Server-side maximum byte size per input image (schema ManagedMediaImageRefSchema not read).
- Which image-capable catalog entries are live and admitted in production.
- Provider-side retention of the sent images.
- Whether product wants video-to-video; no founder decision mentions S46.02-04.
- What the hash denylist contains (content not read, by design).
- How the limited free video offer treats image input (path not read).
