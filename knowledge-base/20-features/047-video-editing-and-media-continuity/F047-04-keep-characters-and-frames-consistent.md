---
id: "F047-04"
type: "feature"
title: "Keep characters and frames consistent"
aliases: ["Reference-consistent characters", "First-frame and last-frame guidance", "First frame", "Reference image", "S47.06", "S47.08"]
area: "47 Video editing and media continuity"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S47.06", "S47.08"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "plan:enterprise", "provider:google", "provider:openrouter", "table:video_generation_jobs", "table:media_assets", "api:POST /api/media/video/generate", "api:GET /api/media/availability", "SYS-model-catalog-and-routing", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F047-04 Keep characters and frames consistent

On web, a person can guide a new video with one first-frame image or up to a model-set number of reference images. That works only on models whose catalog entry takes images. Last frame, and linking one character reference across several clips, do not exist. Other apps do not send images. The brief calls this missing everywhere.

Area: [47. Video editing and media continuity](README.md). Requirement items: [S47.06](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4706), [S47.08](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4708).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a person start a clip from a chosen picture (First frame) or guide how it looks with reference pictures, in the web video composer. Last-frame guidance and cross-clip character consistency are not built.

**Why it exists.** To keep a clip's look under the person's control and to keep a character recognisable (brief S47.06, S47.08). The web route and shared contract already accept the images (packages/contracts/cloud-contracts/src/managed-media.ts:209-215).

**Who uses it.** Signed-in web users on a plan with video (Ultra or Enterprise), with a video model that takes images.

**Problems it solves**

- A text prompt alone cannot pin the exact starting picture.
- A person cannot easily keep a character's look steady.

**Use cases**

- Animate a product photo as the first frame.
- Attach two reference photos of a character to guide the look.
- Retry a failed image-guided video after re-attaching the images.

## 2. User experience

**Where to find it**

- Web: video mode in the composer; attach images; choose First frame or Reference image in the menu labelled Attached image use (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:605-606, 6500-6530). A Video chip with the label Make a video from the attached image appears when images are attached (ChatComposerNew.tsx:5800-5812).
- Desktop Electron: shows the hosted web app, so same as web [inferred from AGENTS.md section 5]. Desktop Tauri build: no images sent (apps/desktop/src/api/cloudApi.ts:610-613; apps/desktop/src-tauri/src/sys/commands/media.rs:242-252).
- Mobile: no video images; video flag off (apps/mobile/lib/v1FeatureFlags.ts:28).
- Chrome: video mode refuses attachments with the notice 'Videos are made from your words only...' (apps/extension/_locales/en/messages.json:3441).
- CLI, VS Code: not applicable.

**Before you start**

- Signed in with a plan that includes video.
- A video model whose catalog entry accepts images and whose media admission is enabled (apps/web/features/chat/components/Composer/video-input-images.ts:26-31).
- Images in PNG, JPEG or WebP (video-input-images.ts:15-19).

**Screens and controls**

- Attach button and drag and drop for images.
- Attached image use menu: First frame (The video opens on this image) and Reference image (The image guides how the video looks).
- Text: 'Video takes up to N PNG, JPEG or WebP images.' (ChatComposerNew.tsx:5228-5230).
- Video chip button.

**Journey**

1. Switch the composer to video mode.
2. Attach one image, or several.
3. Pick First frame or Reference image; more than one image forces Reference (video-input-images.ts:33-35).
4. Type the prompt and send.
5. Wait for the clip; if retry is needed re-attach images if they were not retained (videoRetryInputs.ts:12-24).

**What the person sees and gets**

- Notice 'That image could not be read. Attach it again and retry.' (ChatComposerNew.tsx:3891).
- Notice when too many images were attached: 'Video takes up to N ... so only X of Y were attached.' (ChatComposerNew.tsx:2247).
- Server refusals with codes invalid_input_image or content_policy_violation (route.ts:763-775).

**Settings**

- Video model, aspect ratio, quality and duration pickers in the composer (ChatComposerNew.tsx).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web first-frame and reference images from composer to provider (ChatComposerNew.tsx:3883-3890; media-api-service.ts:47-52; route.ts:779-872).
- Google adapter sends image parts and marks the task image_to_video or reference_to_video (route.ts:598-612).
- OpenRouter adapter sends frame_images with frame_type first_frame, or input_references (apps/web/lib/services/openrouter-video-provider-service.ts:111-117).
- Server refuses first frame plus references together, models without image input, too many images, unreadable, wrong format and denylisted images before billing (route.ts:786-872; managed-media.ts:219-229; test names in media-video-generate-input-images.test.ts).
- Retry keeps the original input kind and asks to re-attach if images are gone (apps/web/features/chat/lib/videoRetryInputs.ts).

**Incomplete**

- Image inputs are not stored with the job; the job table has no image columns (apps/web/db/neon/0105_durable_video_generation_jobs.sql:74-130). Retained inputs live in an in-memory map (WebChatPage.tsx:3735).
- Desktop Tauri and Chrome and mobile do not send images.

**Present but disconnected or switched off**

- Mobile video creation flag is false (apps/mobile/lib/v1FeatureFlags.ts:28).
- Runway is withheld from admission (apps/web/lib/server/video-provider-release-policy.ts:16-18).

**Not available**

- Last frame: no code anywhere (searched last_frame and lastFrame; only unrelated screen-capture code matched).
- A saved character or reference set shared across clips: not found. The decision doc also rules out saved reference sets in voice and media (docs/decisions/2026-09-27-founder-decisions.md:126-129; scope may be limited to voice [inferred]).
- Refusal of an unsupported last frame: not applicable because last frame does not exist.

## 4. Required behaviour

**Established requirements**

- User keeps the same character looking consistent across clips via a reference (S47.06). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S47.06)
- User supplies a first frame and/or last frame where supported (S47.08). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S47.08)
- Advertised options produce real media; retry uses the original idempotency identity when submission is uncertain. (source: docs/product/experience-contract.md:785)
- Unsupported configurations expose an honest disabled state. (source: docs/product/experience-contract.md:785)

**Acceptance criteria**

1. A first frame sent on a model that takes images reaches the provider as the opening frame.
2. Reference images are blocked with a clear message on a model that does not take images.
3. Sending first frame and references together is refused before any usage is reserved.
4. An image over the count limit, wrong format or unreadable gets an error naming the image.
5. A last frame is offered only on models that support it, and refused with a message elsewhere.
6. The same reference can be reused for linked clips (not built).
7. Retry after losing the input images asks the person to re-attach.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Catalog image-input limits are the single source for how many images a model takes (managed-media.ts:176-187).
- Last-frame support would need a new catalog flag [inferred].

**Proposed improvements** (suggestions, not requirements)

- Add last_frame_image to the contract behind a catalog flag.
- Store a reusable character reference per user and link it to clips.
- Send images from mobile, desktop Tauri and Chrome once their video surfaces are on.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | ManagedMediaVideoGenerationRequestSchema | `packages/contracts/cloud-contracts/src/managed-media.ts` | first_frame_image and reference_images fields; max 4 images; both-together refusal. |
| service | managedMediaVideoInputImageLimit | `packages/contracts/cloud-contracts/src/managed-media.ts` | Per model image count: only Google and OpenRouter, from catalog imageInput. |
| endpoint | POST /api/media/video/generate | `apps/web/app/api/media/video/generate/route.ts` | Resolves, scans and forwards images. |
| service | resolveVideoInputImages | `apps/web/app/api/media/video/generate/route.ts` | Byte reading, denylist hash, structure and format checks. |
| service | googleVideoInput | `apps/web/app/api/media/video/generate/route.ts` | Builds Google request with image_to_video or reference_to_video. |
| service | submitOpenRouterVideo | `apps/web/lib/services/openrouter-video-provider-service.ts` | Sends frame_images or input_references. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Attached image use menu, Video chip, limits, notices. |
| service | video-input-images | `apps/web/features/chat/components/Composer/video-input-images.ts` | Format check, per model limit, kind choice, base64 reading. |
| service | videoRetryInputs | `apps/web/features/chat/lib/videoRetryInputs.ts` | Decides whether a retry still has its images. |
| hook | useMediaGeneration videoInputImageFields | `apps/web/lib/hooks/useMediaGeneration.ts` | Maps UI input kind to request fields. |
| service | media-api-service VideoInputImages | `apps/web/features/media/services/media-api-service.ts` | Request type with first_frame_image and reference_images. |
| screen | WebChatPage retained inputs | `apps/web/features/chat/pages/WebChatPage.tsx` | In-memory map of input images per assistant message for retry. |
| endpoint | GET /api/media/availability | `apps/web/app/api/media/availability/route.ts` | Reports which media models are enabled for the composer. |
| service | desktop generateCloudVideo | `apps/desktop/src/api/cloudApi.ts` | Prompt and duration only; no images. |
| command | build_managed_media_video_payload | `apps/desktop/src-tauri/src/sys/commands/media.rs` | Tauri payload: prompt, duration, resolution, provider, model; no images. |
| component | Chrome video mode notice | `apps/extension/src/side_panel.ts` | Refuses attachments in video mode. |
| service | mobile resolveMobileVideoGenerationRequest | `apps/mobile/src/features/chat/actions/resolveMobileVideoGenerationRequest.ts` | Mobile request gate; no image fields. |
| test | media-video-generate-input-images | `apps/web/__tests__/api/media-video-generate-input-images.test.ts` | Route tests for image inputs. |
| test | ChatComposerNew.videoInputImages | `apps/web/features/chat/components/Composer/ChatComposerNew.videoInputImages.test.tsx` | Composer tests for image inputs. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person attaches images in video mode; the composer filters to PNG, JPEG or WebP and trims to the model's limit. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2226-2250; video-input-images.ts:15-31 |
| On send, images are read as base64 and passed with the chosen kind. | device | ChatComposerNew.tsx:3883-3890; video-input-images.ts:37-51 |
| Client maps them to first_frame_image or reference_images and posts to the route. | device and our servers | apps/web/lib/hooks/useMediaGeneration.ts:30-37; media-api-service.ts:190-215 |
| Route checks model limit, reads bytes, checks the known-illegal-media hash list and image structure, and refuses on failure before billing. | our servers | apps/web/app/api/media/video/generate/route.ts:786-872,1194-1205 |
| Images are sent to Google as image parts, or to OpenRouter as frame_images or input_references. | outside service | route.ts:598-612; openrouter-video-provider-service.ts:111-117 |
| The finished clip is stored and shown; images are not kept with the job. | our servers | 0105_durable_video_generation_jobs.sql:74-130 (no image column) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Input images | Browser memory for retry (WebChatPage.tsx:3735); sent to the provider; an asset_id form is also accepted for images already stored (managed-media.ts:81-84) | No | Lost on page reload; web asks to re-attach |
| Chat metadata videoInputKind (first_frame or reference) | Message metadata (WebChatPage.tsx:1041) | With the conversation | With the chat |

**Models and providers.** Only models whose catalog entry lists image input and whose provider is Google or OpenRouter take images (managed-media.ts:168-187). Counts come from the catalog, never from provider names alone.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in and adult-verified (route.ts:889-896). |
| Permissions | Images are scanned against a known-illegal-media hash list and format checks (route.ts:823-868). No permission prompt for reading attachments beyond the file picker. |
| Subscription | Video: Ultra or Enterprise (billing-catalog.ts:357). Configured limited free offers allow up to 5 video requests per user per UTC day, web only (doc: docs/product/definition.md:342-349). |
| Limits and metering | At most 4 input images by contract (managed-media.ts:161); model limit from catalog. Monthly video seconds (tier-unit-quota-service.ts:57,165). |
| Feature flags | canUseVideoGeneration (route.ts:1008-1013); mobile videoGen false. |
| Model compatibility | Image input depends on catalog imageInput.maxImagesPerRequest (managed-media.ts:183-186). |
| Provider restrictions | Google and OpenRouter only (managed-media.ts:168-170). Runway withheld. |
| Local mode | No local video. Mobile requires cloud mode (resolveMobileVideoGenerationRequest.ts:107). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Model takes no images | Composer blocks with 'Video takes up to N ...' text and an option to leave video mode (ChatComposerNew.tsx:3821-3830); server refuses (route.ts:795-799). | same |
| Image unreadable | Composer notice (ChatComposerNew.tsx:3891); server 422 invalid_input_image (route.ts:810-818). | same |
| Too many images | Composer trims; server refuses (route.ts:800-802). | same |
| Both kinds | Refused by the contract (managed-media.ts:219-229). | same |
| Retry without images | Message tells the person to attach again (videoRetryInputs.ts:20-24). | same |
| Last frame unsupported | Not handled; no last frame input. | searched |
| Accessibility | Menu has label 'Attached image use'; Video chip has aria-label (ChatComposerNew.tsx:5800-5804, 6490). | same |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/media-video-generate-input-images.test.ts`: Reference images to provider, first frame as opening frame, Google image parts and starting frame, refusal of both together, refusal for non-image models, unreadable and denylisted images, over-limit.
- `apps/web/features/chat/components/Composer/ChatComposerNew.videoInputImages.test.tsx`: Composer image input behaviour; contents not opened.
- `apps/web/features/chat/lib/videoRetryInputs.test.ts`: Retry input decisions; contents not opened.
- `apps/web/lib/hooks/useMediaGeneration.test.tsx`: Hook mapping of first_frame and reference; contents not opened.
- `packages/contracts/cloud-contracts/src/__tests__/managed-media.test.ts`: Contract parse, image limit function per provider, both-together refinement.

**Test scenarios**

- **First frame happy path**
  1. Web, Ultra account, video model with image input.
  2. Attach one PNG, choose First frame, send.
  - Expected: Clip opens on the image.
- **Reference images**
  1. Attach 2 images; send.
  - Expected: Kind switches to Reference; clip reflects the look.
- **Model without images**
  1. Pick a video model without image input; attach image.
  - Expected: Composer blocks with limit text; no job created.
- **Last frame absent**
  1. Look for a last-frame control.
  - Expected: None exists today.
- **Retry after reload**
  1. Fail a first-frame generation; reload; retry.
  - Expected: Message asks to attach the image again.
- **Bad file**
  1. Attach a renamed text file as PNG.
  - Expected: Error naming the image; no usage reserved.

**Where to look when it fails**

- logger.warn 'Video input image could not be resolved' (route.ts:~813).
- Codes: invalid_input_image, content_policy_violation (route.ts:763-775).
- Metric recordMediaSafety reasons upload_hash_denylist and upload_structure.
- Tables video_generation_jobs, media_assets.

**Hands-on test plans**

- none: not built on any app
- No hands-on plan yet for Web, Desktop: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **Last-frame guidance missing** Affects: all apps. Evidence: no last-frame field in managed-media.ts:193-217. Work needed: Contract field, catalog flag, provider mapping, UI, refusal message.
- **No cross-clip character reference** Affects: all apps. Evidence: no saved reference store found. Work needed: Reference store, linking and consent rules (likeness items S47.21-S47.24 are separate).
- **Brief marks web missing though first-frame and reference inputs exist** Affects: documentation accuracy. Evidence: ChatComposerNew.tsx:605-606. Work needed: Update the brief status for S47.08 first frame.
- **Desktop Tauri, mobile and Chrome send no images** Affects: those apps. Evidence: cloudApi.ts:610-613; side_panel.ts:8780. Work needed: Wire inputs after owner decision.
- **Retained images are in memory only** Affects: web retry. Evidence: WebChatPage.tsx:3735. Work needed: Optionally store asset ids for retry.
- Not built on: Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:max_15x
- plan:enterprise
- provider:google
- provider:openrouter
- table:video_generation_jobs
- table:media_assets
- api:POST /api/media/video/generate
- api:GET /api/media/availability
- SYS-model-catalog-and-routing
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage

## Unknown

- Whether any catalog video model supports last frame.
- Contents of four listed test files not opened.
- How the Electron desktop treats web composer features beyond AGENTS.md section 5.
- Whether the free limited video offer accepts images.
- Why the brief marks web missing; likely it was written against character consistency only [inferred].
