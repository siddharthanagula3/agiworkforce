---
id: "AREA-045"
type: "area"
title: "Image editor"
features: ["F045-01", "F045-02", "F045-03", "F045-04", "F045-05", "F045-06", "F045-07", "F045-08", "F045-09", "F045-10", "F045-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 45. Image editor

A person can change a picture they already have, or make a new one from a picture they own. They upload a photo or pick one from their library, describe the change in plain words, and get a new version back. The original stays available, so a bad edit costs nothing. The area matters because the image tools are the visible proof that the product can do what the leading chat assistants do with pictures.

**Who uses it.** Every signed-in user who is on a plan that includes image generation (the capability is named canUseImages and is granted to the PRO tiers). Free users get an upgrade prompt instead. Editing also needs a model whose catalog entry says it can edit (supports_edit). The code does not show a workspace-admin or developer-only path for this area. The CLI and the chat extension use a different, narrower path (see notes).

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F045-01](F045-01-attach-a-photo-and-describe-a-change.md) | Attach a photo and describe a change | built | built | built | no | n/a | no |
| [F045-02](F045-02-remix-an-earlier-image.md) | Remix an earlier image | built | built | built | no | n/a | no |
| [F045-03](F045-03-paint-the-area-to-change-mask-and-selection.md) | Paint the area to change (mask and selection) | partly | partly | partly | n/a | n/a | no |
| [F045-04](F045-04-click-a-spot-to-comment.md) | Click a spot to comment | no | no | no | n/a | n/a | no |
| [F045-05](F045-05-transparent-background.md) | Transparent background | built | built | built | built | n/a | no |
| [F045-06](F045-06-extend-and-reframe.md) | Extend and reframe | built | built | partly | no | n/a | no |
| [F045-07](F045-07-reference-images.md) | Reference images | partly | partly | partly | no | n/a | no |
| [F045-08](F045-08-keep-the-original-and-see-earlier-versions.md) | Keep the original and see earlier versions | partly | partly | partly | no | n/a | no |
| [F045-09](F045-09-crop-resize-and-export-format.md) | Crop, resize and export format | no | no | no | no | n/a | no |
| [F045-10](F045-10-brand-avatar-and-sticker-features.md) | Brand, avatar and sticker features | no | no | no | no | n/a | no |
| [F045-11](F045-11-operations-no-app-offers.md) | Operations no app offers | n/a | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/045-image-editor.md](../../10-requirements/capabilities/045-image-editor.md).

## How this area works in the code

1. **Pick the operation and attachments in the composer.** The composer lists three operations (Edit, Variation, Mask edit). Mask edit appears only after a mask is attached. A flag decides whether the image model can edit. In the send path, the source photo, optional mask and reference photos are read to base64 and an edit object is built. (`apps/web/features/chat/components/Composer/ChatComposerNew.tsx:282-286`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1370-1371`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3766-3800`)
2. **Revise from the card.** The result card opens a revision panel. Describing a change, Variation, or Select area each build an edit request. The panel only offers editing when the model supports it; otherwise it generates a new image from the text. (`apps/web/features/chat/components/ImageGenerationCard.tsx:420`, `apps/web/features/chat/components/ImageGenerationCard.tsx:449-464`, `apps/web/features/chat/components/ImageGenerationCard.tsx:502-547`, `apps/web/features/chat/components/ImageGenerationCard.tsx:549-572`)
3. **Paint the mask in the browser.** A canvas sits over the image. Dragging paints strokes at a fixed width. On release, the painted pixels become transparent in an exported PNG, which is the area to change. (`apps/web/features/chat/components/RegionSelector.tsx:5`, `apps/web/features/chat/components/RegionSelector.tsx:46-64`, `apps/web/features/chat/components/RegionSelector.tsx:86-90`, `apps/web/features/chat/components/Composer/ImageMaskDialog.tsx:46-88`)
4. **Outpaint padding (reframe).** For a new aspect ratio, the browser draws the image centred on a larger canvas and marks the new border as the area to draw. Both are sent as PNG. (`apps/web/features/chat/lib/imageGenerationOptions.ts:257-299`)
5. **Send to the managed image route.** The client sends the request with an idempotency key. Before any work, the route checks the CSRF token, a rate limit, the age gate, the managed-compute gate, the organisation policy, the spend limit, and the canUseImages capability. (`apps/web/features/media/services/media-api-service.ts:86-100`, `apps/web/app/api/media/image/generate/route.ts:39`, `apps/web/app/api/media/image/generate/route.ts:56`, `apps/web/app/api/media/image/generate/route.ts:101`)
6. **Check the source, mask and model on the server.** The source, mask and references are read (from inline bytes or stored assets) and their hashes saved. The mask must be a PNG with transparency and the same size as the source. A model whose catalog entry is not an editing API is refused before any charge. (`apps/web/app/api/media/image/lib/managed-image-generation.ts:525-580`, `apps/web/app/api/media/image/lib/managed-image-generation.ts:653-690`, `apps/web/app/api/media/image/lib/edit-mask.ts:79-103`, `packages/contracts/cloud-contracts/src/managed-media.ts:49-71`)
7. **Save a durable job and run it.** The job row keeps the plan (source, mask and reference asset ids, transparency flag) and the hashes. The executor reloads the stored images, so a retry must match what was charged. (`apps/web/app/api/media/image/lib/managed-image-generation.ts:780-820`, `apps/web/app/api/media/image/lib/image-job-executor.ts:262-340`, `apps/web/db/neon/0226_durable_image_generation_jobs.sql:32-53`)
8. **Call the provider's edit endpoint.** The adapter sends a multipart form with the source, optional references and mask, plus the transparency setting. Every edit operation goes to the same edit endpoint; the operation name only changes the label of the model returned. (`apps/web/app/api/media/image/lib/image-generation-provider.ts:462-530`)
9. **Show the result and keep the old one.** The page writes the new image URL into the message metadata and adds the previous image to imageVersions. The card shows a pager for earlier versions. (`apps/web/features/chat/pages/WebChatPage.tsx:3402-3530`, `apps/web/features/chat/components/ImageGenerationCard.tsx:1284-1321`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/chat/components/ImageGenerationCard.tsx` | Result card and revision panel: Describe-a-change, Variation, Select area, Add mask, Aspect ratio, Clear selection, version pager. |
| `apps/web/features/chat/components/RegionSelector.tsx` | Canvas where the person paints the area; exports the mask PNG (painted = transparent). |
| `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Composer image mode: operation menu, Transparent toggle, attachment handling and the send path that builds the edit. |
| `apps/web/features/chat/components/Composer/ImageMaskDialog.tsx` | Mask dialog opened from the composer's Mask edit operation. |
| `apps/web/features/chat/lib/imageGenerationOptions.ts` | Shared client helpers: build the edit request, read files to base64, build the reframe (outpaint) padding. |
| `apps/web/app/api/media/image/generate/route.ts` | HTTP entry for image generation; runs the gates and hands off to the managed generator. |
| `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Checks the edit request, the model's edit support and the mask, then creates the durable job. |
| `apps/web/app/api/media/image/lib/image-job-executor.ts` | Runs queued jobs; rebuilds the edit context from stored assets and checks the hashes. |
| `apps/web/app/api/media/image/lib/image-generation-provider.ts` | Provider adapter: sends the multipart edit request and reads the result. |
| `apps/web/app/api/media/image/lib/edit-mask.ts` | Server-side mask validation: PNG, has transparency, same size as the source. |
| `packages/contracts/cloud-contracts/src/managed-media.ts` | Shared contract: the list of operations (generate, edit, inpaint, outpaint, variation) and which image API shapes accept edits. |
| `apps/web/features/chat/pages/WebChatPage.tsx` | Web page logic that regenerates an image in place and stores previous versions. |
| `apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts` | Mobile decision logic: checks gates, reference images and transparency, then builds the request. |
| `apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts` | Mobile runner: sends the generation, keeps edit retries for three recent failures. |

## What is stored

- Durable image job: plan (source, mask and reference asset ids, transparency flag), hashes of the source, reference and mask images, status and billing fields: Database table public.image_generation_jobs (apps/web/db/neon/0226_durable_image_generation_jobs.sql:32); attached images in table public.image_generation_job_assets (same file, line 114)
- Stored media files (uploaded sources, generated images): Media storage via storeMedia and readStoredMedia (apps/web/lib/server/media-storage.ts:248; apps/web/app/api/media/image/lib/image-generation-provider.ts:455)
- Earlier versions of an image (URL, prompt, aspect, model): Chat message metadata field imageVersions (apps/web/features/chat/pages/WebChatPage.tsx:3473)
- Selection mask and attached mask file in the browser: Component state only in the card and the dialog (ImageGenerationCard.tsx:404; ImageMaskDialog.tsx:46); lost on close
- Mobile edit retry memory (last three edit requests, in memory): apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts (imageEditRetries map, IMAGE_EDIT_RETRY_LIMIT = 3)
- Library items (saved images) that Remix reads: Library storage, read via libraryItemToFile in apps/web/features/library/lib/library-chat-handoff.ts:3

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **canUseImages capability**: Turns image generation and editing on or off per account plan; refused with an upgrade message when missing. (Route check in apps/web/app/api/media/image/generate/route.ts:101; granted per plan in apps/web/lib/services/capability-handshake-service.ts:122; plan tiers in packages/contracts/types/src/billing-catalog.ts:341 and :356 (image_generation maps to PRO_TIERS).)
- **Editing-capable model list**: Decides which image models can take a source image. Only the listed image API shapes can edit; the single entry names one provider's shape. Drives the Edit controls and the Transparent toggle. (packages/contracts/cloud-contracts/src/managed-media.ts:70-71; read per model in apps/web/lib/services/media-model-availability-service.ts:104-109 and apps/web/features/chat/components/ImageGenerationCard.tsx:420.)
- **Mobile image feature flag**: Turns mobile image generation on or off. (apps/mobile/lib/v1FeatureFlags.ts:26 (imageGen: true); apps/mobile/stores/chat/chatViewStore.ts:396 (features.imageGen); checked in apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:230-245.)
- **Global image feature flag (mobile)**: Second gate on mobile: the global flag must also be on. (apps/mobile/src/features/image/startImageCreation.ts:149 (FEATURES.imageGen), apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:76.)
- **Rate limit bucket**: Limits how often image generation can be called. (apps/web/app/api/media/image/generate/route.ts:39 (withRateLimit 'image-generation'); the limit values are configuration in the rate-limit module.)
- **Transparent toggle**: Asks for a transparent background. Only shown when the model can edit. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6439-6450; mobile apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1034-1041; CLI flag in apps/cli/src/cloud/image.rs:517-535.)
- **Spend limit and organisation policy**: Can refuse an image request before any credits are used. (apps/web/app/api/media/image/generate/route.ts:76 (buildSpendLimitGateResponse) and :66 (buildOrganizationPolicyGateResponse).)

## Shared between apps

Shared across apps: the edit and generation contract (packages/contracts/cloud-contracts/src/managed-media.ts), the managed image route and its helpers under apps/web/app/api/media/image/, the mask validation (edit-mask.ts), the job tables. Web-only: the card, the region selector, the composer dialog and imageGenerationOptions.ts (which is in apps/web). Mobile has its own request and runner files under apps/mobile/src/features/chat/actions/. The CLI has its own Rust code (apps/cli/src/cloud/image.rs) and calls the same hosted route for generation only. The desktop app shows the hosted web app, so it uses the web code. Shared model catalog and billing tier tables are in packages/contracts/types/src.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief's line references do not match the code. Route file apps/web/app/api/media/image/generate/route.ts is 128 lines, yet the brief cites lines 591, 605, 643, 707. ChatComposerNew.tsx:4778 is about free-model notes, not background removal. (apps/web/app/api/media/image/generate/route.ts; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4778)
- Mobile Remix exists in the Library, but the brief says S45.02 mobile is missing. (apps/mobile/src/features/library/index.tsx:545-560 and :630)
- Mobile has a Transparent background toggle, but the brief says S45.15 and S45.33 mobile are missing. (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1034-1041)
- Version pager and version storage exist, but the brief says version history is missing on web. (apps/web/features/chat/components/ImageGenerationCard.tsx:1284-1321; apps/web/features/chat/pages/WebChatPage.tsx:3473)
- Mobile mask path is dormant: the runner can send a mask, but no mobile caller sets maskImageBase64. (apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:54, :214, :314-315)
- Every edit operation (edit, variation, inpaint, outpaint) goes to the same provider edit endpoint; the operation only changes the label on the returned model name. The server does not send different instructions per operation. (apps/web/app/api/media/image/lib/image-generation-provider.ts:462-530 (model label at :528))
- Composer mask dialog has no Clear button, although the card does. The brief says Clear selection is done on web; this is true only in the revision panel. (apps/web/features/chat/components/Composer/ImageMaskDialog.tsx:90-126 vs apps/web/features/chat/components/ImageGenerationCard.tsx:785-788)
- Brush size is a fixed 5 percent of image width (minimum 8 pixels) with no control, no eraser and no undo, so brush and eraser items are missing. (apps/web/features/chat/components/RegionSelector.tsx:5, :37)
- The Variation operation sends the source image with no mask and the same prompt, and it is labelled as a variation; the composer's Variation option is only offered when an image is attached. (apps/web/features/chat/components/ImageGenerationCard.tsx:549-572)
- Desktop items are marked done in the brief, but the desktop source has no image editor of its own. Its image code is limited to service and library files. (apps/desktop/src/services/desktopCloudEntitlements.ts; apps/desktop/src/features/library/DesktopLibrary.tsx (no edit controls found))

## Not established

- Whether the desktop app's hosted web view shows every web control (not run; read-only rule).
- The exact rate-limit values for the image-generation bucket (configuration not opened).
- The full mobile version pager and whether mobile shows previous versions (not checked).
- Whether the Chrome extension has any image path: apps/extension was searched, nothing found, but the folder was not read in full.
- How the CLI selects an edit-capable model for a transparent request in full (only cli/src/cloud/image.rs:517-535 read).
- Behaviour when an editing model refuses content or times out in the revision panel (only error paths in the card read).
- Whether the library's Remix on web works for every image type (only the code path was read, not tested).
- The database schema beyond the job and asset tables (not read in full).
