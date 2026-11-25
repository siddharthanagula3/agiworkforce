---
id: "AREA-046"
type: "area"
title: "Video-generation studio"
features: ["F046-01", "F046-02", "F046-03", "F046-04", "F046-05", "F046-06", "F046-07", "F046-08", "F046-09", "F046-10", "F046-11", "F046-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 46. Video-generation studio

A person writes a text prompt, picks a video model and the clip's length, shape and size, and gets a generated video back in the chat. The clip can be watched, downloaded, shared (mobile) and retried after a failure, and the person sees a cost estimate and a progress bar while it is made. Video is a paid, server-run feature, so the server checks the person's plan, budget and admin policy before it starts any job.

**Who uses it.** Only signed-in users on the top two paid plan tiers. The code keys this to the plan capability video_generation, which lists max_15x and enterprise (packages/contracts/types/src/billing-catalog.ts:357). Users with no subscription get a subscription_required error, and lower plans get plan_upgrade_required (apps/web/app/api/media/video/generate/route.ts:941-1001). Workspace admins affect it through the organization policy and model-policy gates (route.ts:917-931, 1181-1187) and the workspace spend limit (route.ts:935-936). A limited free video offer is also shown in the web composer (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1299-1305, 1347-1348). Video is managed-cloud only. No local or own-key video path was seen.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F046-01](F046-01-write-a-prompt-and-pick-the-clip-options.md) | Write a prompt and pick the clip options | built | built | built | n/a | n/a | partly |
| [F046-02](F046-02-cost-estimate.md) | Cost estimate | built | built | built | n/a | n/a | no |
| [F046-03](F046-03-progress-and-stop.md) | Progress and stop | built | built | built | n/a | n/a | partly |
| [F046-04](F046-04-try-again-after-a-failure.md) | Try again after a failure | built | built | built | n/a | n/a | partly |
| [F046-05](F046-05-clip-library-playback-download-and-share.md) | Clip library, playback, download and share | partly | partly | built | n/a | n/a | built |
| [F046-06](F046-06-start-from-an-image-or-video.md) | Start from an image or video | built | built | no | n/a | n/a | no |
| [F046-07](F046-07-reference-audio-and-frame-rate.md) | Reference audio and frame rate | no | no | no | n/a | n/a | no |
| [F046-08](F046-08-style-presets-and-templates.md) | Style presets and templates | no | no | no | n/a | n/a | no |
| [F046-09](F046-09-saved-characters-and-references.md) | Saved characters and references | partly | no | no | n/a | n/a | no |
| [F046-10](F046-10-storyboard-and-shots.md) | Storyboard and shots | no | no | no | n/a | n/a | no |
| [F046-11](F046-11-remix-extend-and-regenerate-a-segment.md) | Remix, extend and regenerate a segment | no | no | no | n/a | n/a | no |
| [F046-12](F046-12-items-that-do-not-apply.md) | Items that do not apply | n/a | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/046-video-generation-studio.md](../../10-requirements/capabilities/046-video-generation-studio.md).

## How this area works in the code

1. **1. The person sets up the clip in the composer.** On web the composer keeps the video mode, model, aspect, resolution, duration and input-image choices as component state. Options come from the video catalog and the model's rules. On mobile the same choices live in a shared chat view store. (`apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1244-1246, 1413-1443`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6501-6685`, `apps/mobile/src/features/chat/components/AddToChatSheet.tsx:214-219, 269-326`)
2. **2. Input images are read in the browser.** If images are attached, they are read as base64 for a first frame or as reference images. Only PNG, JPEG and WebP are accepted. (`apps/web/features/chat/components/Composer/video-input-images.ts:37-50`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3887`)
3. **3. The client starts the job.** The web hook starts the generate call with the prompt, options and optional inputs, then records the task id. The mobile service sends the same request with a per-action idempotency key. (`apps/web/lib/hooks/useMediaGeneration.ts:570-617`, `apps/mobile/src/features/video/services/videogen.ts:87-107`)
4. **4. The server checks the request and the person.** The generate route runs the rate limit, the age check, the managed-compute gate, the organization policy gate and the spend limit, then loads the subscription and checks the plan and the capability. A failed check returns a 403 or 503 with a code. (`apps/web/app/api/media/video/generate/route.ts:884-1001`, `apps/web/app/api/media/video/generate/route.ts:1003-1011`)
5. **5. The server picks and validates the model and provider.** A requested model must be an executable, live video model with a matching provider. Without a request, the server uses the routing slot's model. Provider keys must be set. The release policy then admits only the providers it allows. Duration, output size, audio and input-image counts are checked. (`apps/web/app/api/media/video/generate/route.ts:352-413`, `apps/web/app/api/media/video/generate/route.ts:1181-1219`, `apps/web/lib/server/video-provider-release-policy.ts:16-18`, `apps/web/app/api/media/video/generate/route.ts:446-481`)
6. **6. Inputs and budget are checked.** Input images are fetched, checked against a hash denylist and a structure check, and refused with a clear code if unreadable. The video-seconds allowance for the plan is checked. Cost is computed from the model pricing. Storage must be configured. (`apps/web/app/api/media/video/generate/route.ts:779-851`, `apps/web/app/api/media/video/generate/route.ts:1223-1261`)
7. **7. Durable jobs are created.** One job per candidate is written through the submit function, with idempotency keys. The route returns the job ids as queued. The job store and provider submission code are called from here but were not read. (`apps/web/app/api/media/video/generate/route.ts:1262-1295`, `apps/web/app/api/media/video/generate/route.ts:90`)
8. **8. The client watches progress.** The client polls the status endpoint every 5 seconds for up to 5 minutes, and reports progress. The web chat message carries the video status in its metadata. Mobile keeps the same fields on its chat message. (`apps/web/lib/hooks/useMediaGeneration.ts:94-95, 639-669`, `apps/web/features/chat/pages/WebChatPage.tsx:973-1029`, `apps/mobile/types/chat.ts:133-138`, `apps/mobile/src/features/video/services/videogen.ts:109-113`)
9. **9. Stop or cancel.** Stop calls the cancel endpoint. The server marks the job as cancel-requested and reconciles it once. Only the provider-specific path tries to stop the provider; others only stop delivery and billing. (`apps/web/features/chat/components/messages/MediaGenerationPlaceholder.tsx:287-314`, `apps/web/app/api/media/video/cancel/route.ts:71-114`, `apps/web/app/api/media/video/cancel/route.ts:56-57`, `apps/web/lib/services/video-job-reconciliation-service.ts:465-490`)
10. **10. Finished clip is played, downloaded or shared.** The web file route streams the stored video bytes after an owner check. The chat bubble and the library show a video player and a download link. Mobile plays, downloads and shares the file through the device. (`apps/web/app/api/files/[id]/route.ts:224-290`, `apps/web/features/chat/components/messages/MessageBubble.tsx:3396-3454`, `packages/ui/unified-chat/src/components/library/LibraryView.tsx:1170, 1293-1295`, `apps/mobile/src/features/chat/components/GeneratedVideo.tsx:79`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/api/media/video/generate/route.ts` | Server entry for a video request (POST at line 1869). Runs all plan, policy, model, input-image and budget checks, then creates the jobs. |
| `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Web composer: video mode, model, aspect, resolution and duration menus, input-image menu, cost note and send. |
| `apps/web/lib/hooks/useMediaGeneration.ts` | Web client hook: starts a video (startVideo, 570) and polls its status (watchVideo, 639). |
| `apps/web/features/chat/components/messages/MediaGenerationPlaceholder.tsx` | Progress bar and the Stop generating button while a web video is made; calls the cancel endpoint. |
| `apps/web/app/api/media/video/cancel/route.ts` | Server cancel endpoint: records the cancel request, reconciles once and returns the cancellation state and message. |
| `packages/contracts/cloud-contracts/src/managed-media.ts` | Shared video request schema (193-217) and input-image limits (176-188), used by the server and mobile. |
| `apps/web/lib/server/video-provider-release-policy.ts` | Decides which paid video providers may be admitted. Only two of the three are admitted now. |
| `apps/mobile/src/features/video/services/videogen.ts` | Mobile client for video: start (with idempotency), status poll, cancel and the duration helper. |
| `apps/mobile/lib/v1FeatureFlags.ts` | Mobile feature switch. videoGen is false in v1, which hides the mobile video option. |
| `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Shared library view for finished clips: Videos filter, inline video player and download, used across surfaces. |
| `apps/web/app/api/files/[id]/route.ts` | Serves the stored video bytes to the owner, with a 256 MB cap and an ownership check. |
| `apps/web/features/chat/components/messages/MessageBubble.tsx` | In-chat video result: the player, the Download video link and the Retry button for failed clips. |

## What is stored

- Video job records (status, provider, model, prompt, cost reservation, cancel request times, progress, output). Written by the submit step after route.ts:1262; the store module (apps/web/lib/server/video-generation-jobs) was imported but not read.: Server database through the scoped db handle (apps/web/app/api/media/video/generate/route.ts:90, 1262-1270). Table name not verified.
- Video status on the chat message: videoStatus, videoTaskId, videoModel, videoProvider, videoProgress, videoUrl, videoError, videoRetryable, plus the retry-able flag.: Chat message metadata, web (apps/web/features/chat/pages/WebChatPage.tsx:973-1029) and mobile (apps/mobile/types/chat.ts:133-138).
- The finished video file bytes.: Video storage behind the file route (apps/web/app/api/files/[id]/route.ts:258-286). Storage backend not read; the route checks isVideoStorageConfigured (generate/route.ts:1257).
- Composer choices for the current web chat: model, aspect, resolution, duration, input kind, video mode.: Component state in the browser only (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1244-1246, 1413-1418). Not saved.
- Mobile video choices: aspect ratio, resolution, duration.: Mobile chat view store (useChatViewStore), read at apps/mobile/src/features/chat/components/AddToChatSheet.tsx:214-219. The store file was not opened.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Video plan capability**: Only the top two paid tiers can start a video (max_15x and enterprise). Other plans get plan_upgrade_required. (packages/contracts/types/src/billing-catalog.ts:357 (video_generation); read at apps/web/app/api/media/video/generate/route.ts:982-1001 and apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1068-1072.)
- **canUseVideoGeneration capability**: Shows the video controls in the web composer and is asserted on the server before a job starts. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1058-1072; apps/web/app/api/media/video/generate/route.ts:1003-1011.)
- **Provider release policy**: Only the listed providers may be admitted. Others are refused with a 503 while billing controls are finalized. (apps/web/lib/server/video-provider-release-policy.ts:16-18; checked at apps/web/app/api/media/video/generate/route.ts:1189-1193.)
- **Provider keys**: A provider without its key is not configured and its models are not used. (apps/web/app/api/media/video/generate/route.ts:336-349 (reads the provider key environment values).)
- **Routing slot for video**: Chooses the default video model when the request does not name one. (apps/web/app/api/media/video/generate/route.ts:381-402 (getRoutingSlotModel('video_generation')).)
- **Model admission state**: Input images are only allowed when the model's admission state is enabled. Promotional models show no pickers. (apps/web/features/chat/components/Composer/video-input-images.ts:29; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1338-1359, 6549, 6602, 6656.)
- **Free video offer**: A limited free video offer lets users without the plan see the controls with a limit. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1299-1305 (freeMediaAccess with limitedMedia.video).)
- **Rate limit, age gate and spend limit**: Video requests are rate limited, need an age check, and stop when the workspace spend limit is reached. (apps/web/app/api/media/video/generate/route.ts:884 (video-generation), 889-896 (media-video age gate), 935-936 (spend limit).)
- **Mobile video feature flag**: Hides the mobile video option in v1. The option also needs cloud mode and the video capability. (apps/mobile/lib/v1FeatureFlags.ts:28 (videoGen: false); apps/mobile/src/features/chat/components/AddToChatSheet.tsx:337-342.)
- **Poll interval and timeout**: How often and how long the client waits for a video. (apps/web/lib/hooks/useMediaGeneration.ts:94-95; apps/mobile/src/features/video/services/videogen.ts:49-50.)
- **Input image limits**: Maximum input images per model and provider. (packages/contracts/cloud-contracts/src/managed-media.ts:176-188 (managedMediaVideoInputImageLimit).)
- **Video request ceiling**: The maximum number of candidate clips per request. (packages/contracts/cloud-contracts/src/managed-media.ts:207 (n, MANAGED_MEDIA_MAX_VIDEO_CANDIDATES).)

## Shared between apps

Shared: the request schema and input-image limits (packages/contracts/cloud-contracts/src/managed-media.ts), used by the server route and mobile videogen.ts; the model catalog (packages/contracts/types/src/model-catalog.ts) and the plan table (billing-catalog.ts); the library view (packages/ui/unified-chat/src/components/library/LibraryView.tsx), which AGENTS.md section 5 says is shared by desktop, web, Chrome and VS Code. Desktop shows the hosted web app (AGENTS.md section 5), so it runs the web code. Separate per app: the web composer and placeholder (ChatComposerNew.tsx, MediaGenerationPlaceholder.tsx, useMediaGeneration.ts), and the mobile composer, client and progress (AddToChatSheet.tsx, videogen.ts, VideoGenProgress.tsx, libraryClient.ts). There is also a second web library view at apps/web/features/library/components/LibraryView.tsx:42 that has its own cancel endpoint constant. Chrome and the CLI were not checked.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief marks the first-frame and reference-image inputs (S46.02, S46.04) as missing on web and desktop, but the web composer has a first-frame choice and a reference choice, and the server accepts both. Only video-to-video (S46.03) is absent from the code. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:604-606, 1245, 6501-6519; apps/web/features/chat/components/Composer/video-input-images.ts:13-51; packages/contracts/cloud-contracts/src/managed-media.ts:208-215)
- The brief marks mobile video as done, but the mobile video option is turned off in v1 (videoGen: false). The add-to-chat video option requires that flag, so the mobile video composer cannot show. The progress, cancel and share code still exists. (apps/mobile/lib/v1FeatureFlags.ts:28; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:337-342)
- The library's Try again button for a video job calls the image retry endpoint. The image retry route only loads image jobs, so a video job retry likely fails. Not run; based on reading the code. (apps/mobile/src/features/library/libraryClient.ts:189-190; apps/mobile/src/features/library/MediaJobsSection.tsx:236-242; apps/web/app/api/media/image/retry/route.ts:18-21)
- The brief says Cancel makes the job stop. For providers other than the one with a stop call, the server only stops delivery and billing; the provider keeps making the video. The server message says so. (apps/web/app/api/media/video/cancel/route.ts:56-57; apps/web/lib/services/video-job-reconciliation-service.ts:465-490)
- The brief's line numbers do not match the code. For example ChatComposerNew.tsx:5081 and 5110 hold no video control (the controls are at 6501-6685 now), and model-catalog.ts:2304 is an image-model check (isExecutableImageModel), not a duration setting. The brief's route.ts:757 is the image MIME list (754-758), and the handler is at 1869. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5081, 5110; packages/contracts/types/src/model-catalog.ts:2304; apps/web/app/api/media/video/generate/route.ts:757, 1869)
- The web model picker is built from the catalog with a live-status filter, not from the provider release policy. A model whose provider is not admitted may still be offered and then refused by the server with a 503. Not verified in the running app. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:597-598, 1338-1353; apps/web/app/api/media/video/generate/route.ts:1189-1193; apps/web/lib/server/video-provider-release-policy.ts:16-18)

## Not established

- Desktop: the brief says done. I assumed it runs the hosted web code (AGENTS.md section 5). I did not read any desktop-specific file.
- Chrome extension, CLI and VS Code: not in the brief's status set. Not checked. The brief says Chrome is missing for every item.
- Not opened: apps/web/app/api/media/video/status/route.ts, apps/web/lib/server/video-generation-jobs (job store), submitVideoCandidates (generate/route.ts from 1316), the provider output and webhook code, apps/web/features/media/services/media-api-service.ts, and the cost function (route.ts 485-520 was read only in part). Job table name and storage backend are therefore unverified.
- Local (on-device) and own-key video: no path was seen. The route is the managed-cloud path only.
- The request schema has a candidate count field n (managed-media.ts:207). The brief does not mention it, and no UI for it was found.
- Frame rate, style presets, templates, characters, storyboards, remix, extend and segment regeneration: I checked the request schema and found no field for them. I did not search every UI file for these words, so a hidden or unfinished control could exist elsewhere.
- Mobile stop button: the stop path exists in the service (videogen.ts:124-126, 157-158) and the chat turn (runVideoGenerationTurn.ts:43, 130-156), but no mobile stop control was located in the UI code read.
- Web library: which of the two library views (packages/ui vs apps/web/features/library) the web app renders was not verified.
- Plan naming: the code uses max_15x and enterprise. I did not map these to product plan names.
- No tests, builds, installs or servers were run, as instructed. Everything above comes from reading the code. Nothing was checked at localhost.
