---
id: "F110-04"
type: "feature"
title: "Image to video"
aliases: ["Image to edited image to video", "Make a video from the attached image", "First frame", "Reference image", "Video mode", "S110.06"]
area: "110 Cross-product experiences to include in the product map"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S110.06"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "plan:max_15x", "plan:enterprise", "SYS-voice-and-media", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-inference-providers", "provider:google", "provider:openrouter", "api:POST /api/media/video/generate"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F110-04 Image to video

Web can edit an image and can make a video from attached images (first frame or reference). What the brief wants, one chain from an edited image into a video, was not found as a single step. The phone build has video generation switched off. CLI and Chrome have nothing.

Area: [110. Cross-product experiences to include in the product map](README.md). Requirement items: [S110.06](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11006).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Image editing: an edit panel on a generated image accepts a described edit or a mask (apps/web/features/chat/components/ImageGenerationCard.tsx:371-520). Video from images: in video mode an attached image is the first frame or a reference, and the server asks the video provider for an image-to-video or reference-to-video task (apps/web/features/chat/components/Composer/video-input-images.ts:11-52; apps/web/app/api/media/video/generate/route.ts:598-612).

**Why it exists.** Competing assistants let a person polish a picture and animate it. S110.06 asks that the edited picture feeds the video.

**Who uses it.** Creators on web and Desktop (hosted web app).

**Problems it solves**

- Video from text alone is hard to steer
- A chosen image should be the opening frame
- Edits should not need a separate tool

**Use cases**

- Generate a poster image, change the sky with the edit panel, attach it and press the 'Video' chip
- Attach a product photo as the first frame and ask for a 5 second clip
- Attach several images as references for style

## 2. User experience

**Where to find it**

- Web: composer; attach an image, a chip 'Video' with aria-label 'Make a video from the attached image' appears when video is available (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2738-2756, 5795-5810); video mode input choices 'First frame' (hint 'The video opens on this image') and 'Reference image' (ChatComposerNew.tsx:604-607); image edit panel inside the generated image card (ImageGenerationCard.tsx:371-520)
- Mobile: row 'Create video' in the Add to chat sheet exists in code but is hidden because the v1 flag videoGen is false (apps/mobile/lib/v1FeatureFlags.ts:28; AddToChatSheet.tsx:338)
- CLI, VS Code, Chrome: none found

**Before you start**

- Plan with the video_generation capability: tiers max_15x and enterprise only (packages/contracts/types/src/billing-catalog.ts:360)
- A video model the media admission marks enabled and that accepts input images (video-input-images.ts:28-32; route.ts:787-801)
- Input image PNG, JPEG or WebP (video-input-images.ts:15-19)

**Screens and controls**

- 'Video' chip over attached images
- Video mode controls: model, aspect, quality, duration
- Input kind choice: First frame, Reference image
- Image card EditPanel: describe edit, optional mask

**Journey**

1. 1. Create or upload an image and edit it in the image card, or attach an image file.
2. 2. The edited result must be brought into the composer as an attachment. A one-click bridge from the edited card to video mode was not found.
3. 3. Attach the image; press the 'Video' chip; video mode opens with 'First frame' chosen (ChatComposerNew.tsx:2750-2756).
4. 4. Write the prompt and send.
5. 5. The video job runs; progress, failure and 'Try video again' appear on the message (MessageBubble.tsx near 3340-3385).

**What the person sees and gets**

- Video card in chat with status
- Message 'Video generation ended' with 'Try video again' for a failed retryable job
- Message 'Video start was not confirmed' for a queued task without id
- Error '<model> cannot take input images. Choose a video model that can, or send the prompt alone.' (route.ts:796)

**Settings**

- Video model, aspect ratio, quality, duration, input kind

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web image edit and inpaint by description or mask when the model supports edit (ImageGenerationCard.tsx:420, 449-516)
- Chat tools generate_image and edit_image exist in the image chat tools (apps/web/app/api/media/image/lib/image-chat-tools.ts:158-188, 414)
- Web video generation with first-frame or reference images, size and type limits, safety checks on input images (video-input-images.ts; route.ts:754-860)
- 'Video' chip over attached images (ChatComposerNew.tsx:2738-2756)

**Incomplete**

- No single step from an edited image to a video input was found; the person must attach the image again [inferred; unknown whether the image card offers re-attach]
- The brief lists web missing; the code shows both halves exist separately

**Present but disconnected or switched off**

- Mobile video generation is switched off for v1 (v1FeatureFlags.ts:28); the mobile row and plan listing depend on it (AddToChatSheet.tsx:338; settings/plans/index.tsx:47)

**Not available**

- CLI: none found
- Chrome: none found
- VS Code: not listed in the brief; none found

## 4. Required behaviour

**Established requirements**

- An image (generated or uploaded) can be edited, and the edited image then used as the input to generate a video. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.06)
- Video input images are PNG, JPEG or WebP, and the model must accept images. (source: apps/web/features/chat/components/Composer/video-input-images.ts:15-19; apps/web/app/api/media/video/generate/route.ts:787-801)
- The mobile v1 build turns video generation off. (source: apps/mobile/lib/v1FeatureFlags.ts:28)

**Acceptance criteria**

1. Attaching a PNG shows the 'Video' chip when the plan and model allow video.
2. Choosing the chip opens video mode with 'First frame' selected.
3. Two or more attached images switch the input kind to reference (video-input-images.ts:34-36).
4. A model without image input refuses with the 'cannot take input images' message.
5. After editing a generated image the person can start a video from the edited image in one action (target, not yet met).
6. Mobile shows no video row while the flag is off.
7. A plan below the capability tier sees an upgrade path rather than the chip.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The edited image should be passed by reference, not re-uploaded [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add 'Make a video' to the image card that fills the attachment and opens video mode
- [proposed] Decide whether mobile v1 ever offers video

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ImageGenerationCard EditPanel | `apps/web/features/chat/components/ImageGenerationCard.tsx` | Describe edit, reframe, mask |
| component | ImageMaskDialog | `apps/web/features/chat/components/Composer/ImageMaskDialog.tsx` | Draw a mask for inpaint |
| service | imageGenerationOptions | `apps/web/features/chat/lib/imageGenerationOptions.ts` | Reads and prepares image bytes |
| service | image-chat-tools | `apps/web/app/api/media/image/lib/image-chat-tools.ts` | generate and edit image tools for chat |
| service | visual-intent | `apps/web/features/chat/lib/visual-intent.ts` | hasSourceImage sends to image generation (line 218-220) |
| service | video-input-images | `apps/web/features/chat/components/Composer/video-input-images.ts` | Input kinds, types, limits, base64 reading |
| component | ChatComposerNew video parts | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Video chip, video mode, input kind choices |
| endpoint | video generate | `apps/web/app/api/media/video/generate/route.ts` | Builds image_to_video or reference_to_video, checks input images |
| endpoint | video status and cancel | `apps/web/app/api/media/video/status` | Job status route folder (status, cancel, openrouter-webhook) |
| service | openrouter video provider | `apps/web/lib/services/openrouter-video-provider-service.ts` | Video provider calls |
| service | media-api-service | `apps/web/features/media/services/media-api-service.ts` | Client for media endpoints, first_frame_image field (line 50) |
| service | useMediaGeneration | `apps/web/lib/hooks/useMediaGeneration.ts` | Client hook for media jobs |
| config | v1FeatureFlags | `apps/mobile/lib/v1FeatureFlags.ts` | videoGen false |
| component | AddToChatSheet (mobile) | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | 'Create video' row behind the flag |
| config | billing capability table | `packages/contracts/types/src/billing-catalog.ts` | video_generation tiers |
| service | videoRetryInputs | `apps/web/features/chat/lib/videoRetryInputs.ts` | Retry of a failed video job |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person attaches images and chooses video mode; the client reads each image to base64. | device | video-input-images.ts:38-52 |
| The client posts to the video generate route with first_frame_image or reference images. | device | apps/web/features/media/services/media-api-service.ts:50 |
| The server checks the model accepts images, the count, then scans each image for safety (hash deny list and structure). | our servers | route.ts:787-860 |
| The server builds the provider request with task image_to_video or reference_to_video and submits it. | outside service | route.ts:598-612 (Google style parts); openrouter-video-provider-service.ts |
| Status is polled or pushed by webhook; the video appears in chat. | our servers | app/api/media/video/status, openrouter-webhook folders; message states at MessageBubble.tsx:3340-3385 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Input images | Sent in the request; resolved by resolveImageRefBytes | Server side | unknown |
| Generated video | Provider result and our media storage | Server data | unknown |

**Models and providers.** Video models come from the model catalog filtered to type video and admitted by media admission (ChatComposerNew.tsx:597-602, 1348). Provider paths seen: google style input parts and an openrouter video service (route.ts:589-612; openrouter-video-provider-service.ts). Which providers are live in production: unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in cloud account (media endpoints are server routes). |
| Permissions | Input image safety checks may refuse an image (route.ts:827-857). |
| Subscription | Capability video_generation: tiers max_15x and enterprise (billing-catalog.ts:360). The composer chip needs videoAccess.label 'included' (ChatComposerNew.tsx:2738-2746). Free quota media is excluded (line 2744). |
| Limits and metering | Per model input image limit via managedMediaVideoInputImageLimit (video-input-images.ts:28-32); cost estimate shown by VideoCostEstimate.tsx; metering details not read. |
| Feature flags | Mobile FEATURES.videoGen false (v1FeatureFlags.ts:28). |
| Model compatibility | Model must be a video model that accepts input images, else error (route.ts:796). |
| Provider restrictions | Provider specific input part format for the google path (route.ts:589-612); other providers not read. |
| Local mode | Video generation runs on a provider through our servers; it is not available in Local mode [inferred; no on-device video code found]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Model cannot take input images | Validation error with the message above | route.ts:796 |
| Too many images | Error '<model> takes at most N input images.' | route.ts:800 |
| Image unreadable | Error 'An input image could not be read. Attach it again and retry.' code invalid_input_image | route.ts:815-816 |
| Image refused by safety check | Refusal text UPLOADED_IMAGE_REFUSAL | route.ts:827-857 |
| Failed job | 'Try video again' when retryable; otherwise resend prompt | MessageBubble.tsx:3340-3365 |
| Start not confirmed | Card 'Video start was not confirmed' | MessageBubble.tsx:3372-3385 |
| Cancel | Cancel route exists; UI not read | app/api/media/video/cancel |
| Offline | not established | not read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/ChatComposerNew.videoInputImages.test.tsx`: Video input images in the composer (by file name) [inferred]
- `apps/web/features/chat/components/ImageGenerationCard.test.tsx`: Image card including edit (by file name) [inferred]
- `apps/mobile/__tests__/GeneratedVideoLifecycle.test.tsx`: Mobile generated video lifecycle (by file name) [inferred]
- `apps/mobile/__tests__/ChatTabVideoDuration.test.tsx`: Mobile video duration (by file name) [inferred]

**Test scenarios**

- **First frame video**
  1. On a plan with video, attach a PNG
  2. Press the 'Video' chip
  3. Send with a prompt
  - Expected: Video mode opens with First frame; a video job starts.
- **Reference images**
  1. Attach two images
  2. Open video mode
  - Expected: Input kind is Reference image.
- **Edit then video**
  1. Generate an image
  2. Describe an edit in the image card
  3. Try to start a video from the edited image
  - Expected: Today: no one-step action (expected to fail the target); record how many manual steps are needed.
- **Unsupported model**
  1. Pick a video model without image input and attach an image
  - Expected: Refusal message about input images.
- **Phone**
  1. Open Add to chat on the phone build
  - Expected: No 'Create video' row.

**Where to look when it fails**

- Error code invalid_input_image
- Rule ids named managed-video.<param>.hash-denylist
- Status and webhook routes under app/api/media/video

**Hands-on test plans**

- Web: [70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md)
- Desktop: [70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md)
- Mobile: [70-qa/test-plans/mobile/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/mobile/110-cross-product-experiences-to-include-in-the-product-map.md)

## 10. Gaps and dependencies

- **No one-step edited image to video bridge** Affects: Web, Desktop. Evidence: No code found linking ImageGenerationCard to video mode. Work needed: Add an action that passes the edited image into video mode
- **Brief says missing; code has both halves** Affects: Documentation. Evidence: video-input-images.ts; ImageGenerationCard.tsx. Work needed: Update brief to partial on web
- **Video off on mobile v1** Affects: Mobile. Evidence: v1FeatureFlags.ts:28. Work needed: Owner decision
- **CLI and Chrome have no flow** Affects: CLI, Chrome. Evidence: none found. Work needed: Decide scope
- **Edit-image support depends on the model (supports_edit)** Affects: Web. Evidence: ImageGenerationCard.tsx:420. Work needed: Document which models qualify
- Not built on: CLI, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- plan:max_15x
- plan:enterprise
- SYS-voice-and-media
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-inference-providers
- provider:google
- provider:openrouter
- api:POST /api/media/video/generate

## Unknown

- Whether the image card can send the edited image into the composer
- Which video providers are enabled in production
- Retention of generated videos and input images
- Plan quotas for video beyond the tier list
- Why the brief marks web missing (not checked against test plans)
