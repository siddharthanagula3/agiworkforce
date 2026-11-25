---
id: "AREA-044"
type: "area"
title: "Image-generation studio"
features: ["F044-01", "F044-02", "F044-03", "F044-04", "F044-05", "F044-06", "F044-07", "F044-08", "F044-09", "F044-10", "F044-11", "F044-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 44. Image-generation studio

The image-generation studio lets a signed-in person make a picture from a text prompt inside a normal chat, pick the image model, and then keep, change, reuse, download or share the result. Images are made on the Managed Cloud path only: the server runs the model, reserves usage, and stores the result in the Library. This matters because the same flow serves the web app, the mobile app and the CLI, so a fix in the server route changes all three.

**Who uses it.** Signed-in users on a paid plan that includes image generation. The server code lists the plans in PRO_TIERS (pro, max, max_15x, team, team_premium, enterprise); basic and free plans are excluded. The web composer also hides image mode for free-trial accounts. Workspace admins are affected by the organisation policy gate and the workspace spend cap that run before every generation. Developers and power users use the CLI, which calls the same route. I found no Local (on-device) or own-key (user's provider key) image path in the files I opened.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F044-01](F044-01-make-an-image-from-a-prompt.md) | Make an image from a prompt | built | built | built | built | n/a | no |
| [F044-02](F044-02-image-settings-style-shape-and-count.md) | Image settings: style, shape and count | built | built | partly | partly | n/a | no |
| [F044-03](F044-03-reference-images-and-edits.md) | Reference images and edits | built | built | built | no | n/a | no |
| [F044-04](F044-04-prompt-help.md) | Prompt help | no | no | no | no | n/a | no |
| [F044-05](F044-05-repeatable-results-seed-and-negative-prompt.md) | Repeatable results: seed and negative prompt | no | no | no | no | n/a | no |
| [F044-06](F044-06-cost-and-allowance.md) | Cost and allowance | n/a | n/a | n/a | n/a | n/a | n/a |
| [F044-07](F044-07-progress-cancel-and-retry.md) | Progress, cancel and retry | partly | partly | partly | partly | n/a | no |
| [F044-08](F044-08-variations-remix-and-reuse.md) | Variations, remix and reuse | partly | partly | partly | partly | n/a | no |
| [F044-09](F044-09-library-grid-and-save.md) | Library: grid and save | partly | partly | partly | partly | n/a | no |
| [F044-10](F044-10-viewer-and-details.md) | Viewer and details | built | built | built | built | n/a | no |
| [F044-11](F044-11-save-download-copy-and-share.md) | Save, download, copy and share | built | built | built | partly | n/a | no |
| [F044-12](F044-12-safety-reporting-and-ai-labels.md) | Safety, reporting and AI labels | built | built | built | partly | n/a | no |

Requirement items for this area: [10-requirements/capabilities/044-image-generation-studio.md](../../10-requirements/capabilities/044-image-generation-studio.md).

## How this area works in the code

1. **Compose in the composer.** The person turns on image mode, picks the model, aspect ratio, style, and transparency, then sends. The web send path builds the generation request from the composer state. (`apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1067 (canUseImageGeneration: excludes free trial, needs canUseImages)`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3756-3806 (send path: builds onGenerateImage options)`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6344-6350 (style preset added to prompt text)`, `apps/web/features/chat/lib/imageGenerationOptions.ts:27-35 (model list from catalogue)`)
2. **Send to the generate route.** The client posts to /api/media/image/generate. Mobile and the CLI post to the same path; mobile adds an Idempotency-Key header and async:true so the server returns a job handle. (`apps/mobile/src/features/image/services/imagegen.ts:57-79 (mobile generateImage)`, `apps/cli/src/cloud/image.rs:21 (IMAGE_GENERATE_PATH)`, `apps/web/app/api/media/image/generate/route.ts:23-40 (handler, rate limit 'image-generation')`)
3. **Gates before any work.** The route checks CSRF, the rate limit, the adult-eligibility gate for media-image, the managed-compute gate, the organisation policy gate, and the workspace spend cap, in that order. Each returns a refusal response when it fails. (`apps/web/app/api/media/image/generate/route.ts:30-40 (CSRF, rate limit)`, `apps/web/app/api/media/image/generate/route.ts:86-89 (spend cap check before any credit is reserved)`)
4. **Plan and subscription check.** The managed flow loads the entitlement. No subscription gives 403 subscription_required. A plan without image_generation gives 403 plan_upgrade_required. Then the canUseImages capability is asserted. (`apps/web/app/api/media/image/lib/managed-image-generation.ts:157-171 (no subscription)`, `apps/web/app/api/media/image/lib/managed-image-generation.ts:180-213 (plan capability and upgrade response)`, `packages/contracts/types/src/billing-catalog.ts:356 (image_generation: PRO_TIERS)`)
5. **Validate the request.** The body is parsed against the managed media schema (prompt up to 4000 characters, up to 3 references, up to 4 images, transparency flag, optional async flag). Any error returns 400 with the field path. (`packages/contracts/cloud-contracts/src/managed-media.ts (ManagedMediaImageGenerationRequestSchema, MANAGED_MEDIA_MAX_IMAGE_REFERENCES, MANAGED_MEDIA_MAX_IMAGES)`, `apps/web/app/api/media/image/lib/managed-image-generation.ts:216-240 (parse and 400 response)`)
6. **Reserve usage and create the durable job.** The server reserves usage for the request, creates an image job row (or returns the existing one for the same idempotency key), and schedules a drive that runs the attempt. Async callers get 202 with the job id; other callers wait for the first attempt. (`apps/web/app/api/media/image/lib/managed-image-generation.ts:745 (reserveManagedUsageRequest)`, `apps/web/app/api/media/image/lib/managed-image-generation.ts:806 (createImageGenerationJob)`, `apps/web/app/api/media/image/lib/managed-image-generation.ts:850 (scheduleImageGenerationJobDrive)`, `apps/web/lib/server/image-generation-jobs.ts:243 (insert into image_generation_jobs)`)
7. **Run the provider attempt.** The executor resolves reference images, calls the image provider with size, quality, count, aspect ratio, transparency and (if sent) negative prompt, then screens each output for safety. (`apps/web/app/api/media/image/lib/image-job-executor.ts:600-660 (edit context, provider input incl. transparentBackground at 654)`, `apps/web/app/api/media/image/lib/image-generation-provider.ts:467-484 (edit form, background option)`, `apps/web/app/api/media/image/lib/image-generation-provider.ts:544 (transparent background for generation)`, `apps/web/app/api/media/image/lib/image-generation-provider.ts:573-596 (negative prompt)`, `apps/web/app/api/media/image/lib/image-job-executor.ts:411-424 (screenGeneratedImages)`)
8. **Mark, store and settle.** Each allowed image gets the AI-generated claim in its bytes, is saved to the Library, and the reservation is settled. If the library save fails the job is not charged. (`apps/web/app/api/media/image/lib/image-job-executor.ts:392-408 (markResolvedImages)`, `apps/web/app/api/media/image/lib/image-job-executor.ts:791 (save failure message, not charged)`, `apps/web/lib/server/media-assets.ts:75 and :140 (insert into media_assets)`)
9. **Client waits, polls, or cancels.** Mobile polls /api/media/image/status every few seconds until the job is no longer pending, with a maximum wait; a stop flag sends the cancel route. Web cancel retries the cancel request. Cancel marks the job and the executor settles it as canceled_by_user. (`apps/mobile/src/features/image/services/imagegen.ts:81-99 (followImageJob polling)`, `apps/web/lib/hooks/useMediaGeneration.ts:152-162 (requestImageJobCancellation)`, `apps/web/app/api/media/image/cancel/route.ts:60-100 (cancel request)`, `apps/web/app/api/media/image/lib/image-job-executor.ts:204-226 (cancel ownership and settlement)`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/api/media/image/generate/route.ts` | Entry point of the generate route: CSRF, rate limit, age gate, managed-compute, org policy and spend gates, then hands off to the managed flow. |
| `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Core server flow: subscription and plan checks, body validation, usage reservation, durable job creation, wait-or-202 response, and the refusal responses. |
| `apps/web/app/api/media/image/lib/image-job-executor.ts` | Runs one provider attempt: resolves inputs, calls the provider, screens outputs, marks provenance, saves to the Library, settles or fails the job. |
| `apps/web/app/api/media/image/lib/image-generation-provider.ts` | Calls the external image model; builds the edit and generation requests (size, background, negative prompt). |
| `apps/web/app/api/media/image/cancel/route.ts` | Records a cancel request on a job after checking the caller owns it. |
| `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Web composer: image mode, model, aspect, style menu, transparency toggle, reference and mask attachments, send. |
| `apps/web/features/chat/lib/imageGenerationOptions.ts` | Model list (from the catalogue), aspect ratio options, style presets and request option builder. |
| `apps/web/features/chat/components/ImageGenerationCard.tsx` | The generated-image card: progress caption, retry, revise, download, copy, share and details. |
| `packages/contracts/cloud-contracts/src/managed-media.ts` | Shared request schema and limits (prompt length, reference count, image count, edit APIs, async flag). |
| `packages/contracts/types/src/billing-catalog.ts` | Which plans may use image generation (image_generation: PRO_TIERS). |
| `apps/mobile/src/features/image/services/imagegen.ts` | Mobile client: sends the request with an idempotency key, polls the job, and cancels on stop. |
| `apps/cli/src/cloud/image.rs` | CLI client: model admission, size/quality/count options, generate, retry, cancel, saved defaults and output files. |

## What is stored

- Image generation job rows (status, prompt, plan, idempotency key, cancel time, attempts): Postgres table public.image_generation_jobs (apps/web/lib/server/image-generation-jobs.ts:243; created by apps/web/db/neon/0226_durable_image_generation_jobs.sql)
- Library rows for generated images (prompt, provider, model, conversation id, timestamps, delete time): Postgres table public.media_assets (apps/web/lib/server/media-assets.ts:75, 140; read by apps/web/app/api/library/route.ts)
- Usage reservation and settlement for each request: Managed usage request service (apps/web/lib/services/managed-usage-request-service.ts:738 reserveManagedUsageRequest); written from apps/web/app/api/media/image/lib/managed-image-generation.ts:745
- Image bytes stored after generation (file storage location not read): Storage helpers imported in apps/web/app/api/media/image/lib/image-job-executor.ts:18-25 from apps/web/lib/server/media-storage; I did not open that file
- Machine-readable AI-generated claim written into the image file: Inside the image bytes (apps/web/lib/server/generated-media-provenance.ts:35); CLI writes the same kind of claim into PNG, JPEG or WebP metadata (apps/cli/src/cloud/image_provenance.rs:21, 81)
- CLI saved defaults and the last image record: A memory file in the CLI cloud directory (apps/cli/src/cloud/image.rs:375-381 path; save_defaults at :734)
- Mobile record of stopped operation ids: apps/mobile/src/features/image/services/imageGenerationStops.ts (functions rememberStoppedImageGeneration and isImageGenerationStopped; storage type not read)
- Composer draft and toggle state (image mode, aspect, transparency): Client store (apps/web/shared/stores/web-chat-store.ts:96 is cited by the brief; not opened by me)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Plan gate: image_generation**: Only plans in PRO_TIERS (pro and above) may generate; others get plan_upgrade_required. (packages/contracts/types/src/billing-catalog.ts:356; enforced at apps/web/app/api/media/image/lib/managed-image-generation.ts:180-213)
- **Capability flag: canUseImages**: Turns the image feature on or off per account; asserted on every request; removed from the handshake for plans without image_generation. (packages/contracts/types/src/capabilities.ts:42 and :75; apps/web/app/api/media/image/lib/managed-image-generation.ts:213; apps/web/lib/services/capability-handshake-service.ts:122)
- **Free-trial exclusion**: Hides image mode in the web composer for free-trial accounts. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1067)
- **Workspace spend cap**: Refuses a generation before any credit is reserved when the workspace budget is spent. (apps/web/app/api/media/image/generate/route.ts:86-89)
- **Organisation policy and managed compute gates**: Refuse generation when workspace policy or managed compute rules block it. (apps/web/app/api/media/image/generate/route.ts:44-80 (buildManagedComputeGateResponse, buildOrganizationPolicyGateResponse))
- **Adult-eligibility gate (media-image)**: Refuses generation when the age check has not passed. (apps/web/app/api/media/image/generate/route.ts (buildAdultEligibilityGateResponse with gate 'media-image'))
- **Rate limit: image-generation**: Limits how often a user may call the generate route. (apps/web/app/api/media/image/generate/route.ts:39-40)
- **Monthly image quota**: Would show and cap images per month; it is null for every plan, so not applied. (packages/contracts/types/src/model-catalog.ts:1103, 1292, 1338, 1389; capability-handshake-service.ts:285)
- **Image model catalogue flags**: Decide which image models appear: imageGen capability, not deprecated, live. (apps/web/features/chat/lib/imageGenerationOptions.ts:27-35)
- **Edit-capable API list**: Decides which models accept reference or source images and transparency with an attachment. (packages/contracts/cloud-contracts/src/managed-media.ts (MANAGED_MEDIA_IMAGE_EDIT_APIS))
- **Request limits**: Prompt up to 4000 characters, up to 3 references, up to 4 images per request. (packages/contracts/cloud-contracts/src/managed-media.ts (ManagedMediaImageGenerationRequestSchema, MANAGED_MEDIA_MAX_IMAGE_REFERENCES, MANAGED_MEDIA_MAX_IMAGES))
- **Mobile feature flag imageGen**: Shows or hides image generation in the mobile app, its settings and the add-to-chat sheet. Set to true. (apps/mobile/lib/v1FeatureFlags.ts:26; read at apps/mobile/src/features/image/services/imagegen.ts:52, apps/mobile/src/features/chat/components/AddToChatSheet.tsx:332, apps/mobile/src/features/settings/index.tsx:791)
- **Route duration**: Server time limit for one generate request is 60 seconds; longer work continues as a durable job. (apps/web/app/api/media/image/generate/route.ts:23)
- **Transparent-background toggle visibility**: Shows the toggle only when the chosen model can edit images. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx (block 'imageModelSupportsEdit &&' before the button at line 6443))

## Shared between apps

Shared across apps: the server route and flow under apps/web/app/api/media/image/ (used by web, desktop, mobile and CLI); the request schema and limits in packages/contracts/cloud-contracts/src/managed-media.ts; the plan table in packages/contracts/types/src/billing-catalog.ts; the model catalogue and image model helpers in packages/contracts/types/src; the Library grid and viewer in packages/ui/unified-chat/src/components/library/LibraryView.tsx (used by web and desktop). Separate per app: the web composer and card (apps/web/features/chat/components/Composer/ChatComposerNew.tsx, ImageGenerationCard.tsx); the mobile client (apps/mobile/src/features/image/services/imagegen.ts, AddToChatSheet.tsx, ImageFullScreen.tsx); the CLI client and terminal viewer (apps/cli/src/cloud/image.rs, apps/cli/src/tui/tui_app.rs, apps/cli/src/lib.rs); the Chrome extension has no image code in the paths I checked.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says negative prompt is not applicable anywhere, but the server accepts an optional negative_prompt field (up to 2000 characters), builds it into the prompt and passes it to the provider. No client I searched sends it, so the path is dead from the user's side. (packages/contracts/cloud-contracts/src/managed-media.ts (negative_prompt in ManagedMediaImageGenerationRequestSchema); apps/web/app/api/media/image/lib/managed-image-generation.ts:265, 282, 778; apps/web/app/api/media/image/lib/image-generation-provider.ts:573-596)
- Brief marks the visible AI-generated label as done, but no visible 'AI-generated' text was found. The only visible captions name the model ('Generating with <model>' and 'Generated with <model>'). (apps/web/features/chat/components/ImageGenerationCard.tsx:230-231; apps/mobile/src/features/image/imageSettingsCaption.ts:7)
- Brief says image-job-executor.ts:420 is where generated images are saved to the Library. Line 420 is the doc and start of the output screening function; the save step is elsewhere in that file, and the brief's line numbers for ChatComposerNew.tsx (for example 4785, 4982) no longer match the file, where the style menu is around 6344. (apps/web/app/api/media/image/lib/image-job-executor.ts:411-424; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6344-6350)
- Composer contains a free-quota media path (limited image offer, free-quota media selection), while the server refuses accounts with no subscription and the plan table excludes free plans. The two do not obviously agree. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1304, 1506-1508; apps/web/app/api/media/image/lib/managed-image-generation.ts:157-171; packages/contracts/types/src/billing-catalog.ts:356)
- Mobile flag comment says image generation is 'not available in v1' but the flag is set to true, so the guard text contradicts the value. (apps/mobile/src/features/image/services/imagegen.ts:52; apps/mobile/lib/v1FeatureFlags.ts:26)
- Server stores a style field and a transparency field for every request, but the style preset is only added as prompt text in the web composer. Whether the server uses the style field was not established. (packages/contracts/cloud-contracts/src/managed-media.ts (style field); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6350)

## Not established

- No Local (on-device) or own-key (user's provider key) image path was found in the files I opened. I did not search the whole repository for one.
- Where image bytes are stored on disk or in cloud storage: I did not open apps/web/lib/server/media-storage.ts.
- The exact Library grid and full-screen viewer code paths on web (LibraryView.tsx lines around 1021 and 1064 are the tab and download controls, not the viewer). Not confirmed.
- Whether the server's 'style' request field reaches the image provider.
- Mobile stopped-operation storage: the file imageGenerationStops.ts was named but not opened, so I cannot say whether it is in memory or on disk.
- The free-quota media behaviour in the web composer and how it reaches the server (see the things that look wrong list).
- Whether any cost or credit amount is shown to users; the server reserves usage but I found no display of it.
- The Chrome extension was not checked beyond the brief's status lines.
- Nothing was built, run or tested: the task was read-only, so no localhost run, no test, no browser check was done. Every behaviour here comes from reading code, not from running it.
