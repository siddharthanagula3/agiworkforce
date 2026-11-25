---
id: "AREA-047"
type: "area"
title: "Video editing and media continuity"
features: ["F047-01", "F047-02", "F047-03", "F047-04", "F047-05", "F047-06", "F047-07", "F047-08", "F047-09", "F047-10", "F047-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 47. Video editing and media continuity

This area is meant to let a person change a video after it is made. They could trim or join clips, extend a scene, ask in chat for a revised clip, keep one character looking the same across shots, add captions or sound, pick a thumbnail, see where a clip came from, and control who may use their likeness or remix their media. None of the 27 items exists as a working feature in any app. The brief marks 26 items "missing" and one, S47.11 (generated sound effects), "n/a" everywhere. The only video code in the repository is for making a clip from a prompt (area 46), plus one unapplied database draft for file history. Today a person can create a clip, but cannot edit it.

**Who uses it.** Intended: every signed-in person who makes video, plus anyone who wants to control their own likeness (avatar or cameo) and its reuse. Nothing in the code yet defines which plans get these features, and the audit note does not say. The existing video creation path is for signed-in users. The mobile app asks for cloud consent first, and the Chrome extension requires sign-in and reports plan-upgrade errors (apps/mobile/src/features/video/services/videogen.ts:94; apps/extension/src/features/cloud-bridge/videoGenerationClient.ts:100 and :14). Developers and QA are the only users of the audit note and the draft migration.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F047-01](F047-01-trim-a-clip.md) | Trim a clip | no | no | no | n/a | n/a | no |
| [F047-02](F047-02-join-clips-and-extend-a-scene.md) | Join clips and extend a scene | no | no | no | n/a | n/a | no |
| [F047-03](F047-03-change-a-clip-with-a-request.md) | Change a clip with a request | no | no | no | n/a | n/a | no |
| [F047-04](F047-04-keep-characters-and-frames-consistent.md) | Keep characters and frames consistent | partly | partly | no | n/a | n/a | no |
| [F047-05](F047-05-sound-and-dialogue.md) | Sound and dialogue | partly | no | no | n/a | n/a | no |
| [F047-06](F047-06-captions.md) | Captions | no | no | no | n/a | n/a | no |
| [F047-07](F047-07-thumbnail-and-cover-image.md) | Thumbnail and cover image | partly | no | partly | n/a | n/a | no |
| [F047-08](F047-08-compare-and-history.md) | Compare and history | no | no | no | n/a | n/a | no |
| [F047-09](F047-09-export-options.md) | Export options | no | no | no | n/a | n/a | no |
| [F047-10](F047-10-likeness-avatar-or-cameo.md) | Likeness: avatar or cameo | no | no | no | n/a | n/a | no |
| [F047-11](F047-11-collection-privacy-and-remix.md) | Collection privacy and remix | no | no | no | n/a | n/a | no |

Requirement items for this area: [10-requirements/capabilities/047-video-editing-and-media-continuity.md](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md).

## How this area works in the code

1. **1. The person asks for a video in the web chat, optionally with an image.** The chat page reads the kind of input image (first frame or reference) and sends it with the request. (`apps/web/features/chat/pages/WebChatPage.tsx:3965`, `apps/web/features/chat/lib/videoRetryInputs.ts:5`)
2. **2. The web client builds the request fields.** A first frame becomes first_frame_image; reference images become reference_images. (`apps/web/lib/hooks/useMediaGeneration.ts:29-36`)
3. **3. The shared request contract checks the input.** The contract allows a first_frame_image or reference_images, not both. (`packages/contracts/cloud-contracts/src/managed-media.ts:209-227`)
4. **4. The server route maps the input to the provider request.** The route turns the chosen input kind into the provider input and task type. (`apps/web/app/api/media/video/generate/route.ts:597-611`)
5. **5. The provider service sends frame images.** A first frame is sent with a first-frame marker; there is no code path for a last frame or for editing an existing clip. (`apps/web/lib/services/openrouter-video-provider-service.ts:105-114`)
6. **6. The mobile app starts a task and polls it.** It asks for cloud consent, sends an idempotency key so a retry does not bill twice, and then polls status every 5 seconds for up to 5 minutes. (`apps/mobile/src/features/video/services/videogen.ts:49-50`, `apps/mobile/src/features/video/services/videogen.ts:87-107`)
7. **7. The Chrome extension starts a task with a prompt only.** It needs a signed-in token, maps plan-upgrade error codes, and checks the task id format. (`apps/extension/src/features/cloud-bridge/videoGenerationClient.ts:9-14`, `apps/extension/src/features/cloud-bridge/videoGenerationClient.ts:100`, `apps/extension/src/features/cloud-bridge/videoGenerationClient.ts:109`, `apps/extension/src/features/cloud-bridge/videoTaskId.ts:1-5`)
8. **8. A finished clip is shown in the library, with a cancel action.** The mobile library lists video jobs and can cancel one. No edit, trim, caption or version action exists here. (`apps/mobile/src/features/library/MediaJobsSection.tsx:29`, `apps/mobile/src/features/library/libraryClient.ts:185`)
9. **9. Stored history is only a draft.** The draft adds version and parent columns to media and artifact tables, a version history table and a lineage table. Its header says it is not applied, so nothing stored today supports S47.17 to S47.19. (`apps/web/db/neon/0257_file_versions_and_lineage.sql:1-4`)

## Files to know

| File | Role |
|---|---|
| `audit/missing/047-video-editing-and-media-continuity.md` | Audit note that lists all area 47 items as open features (the repo path is audit/missing, read-only). |
| `apps/web/features/chat/pages/WebChatPage.tsx` | Web chat screen where a video request is sent, including the input image kind. |
| `apps/web/lib/hooks/useMediaGeneration.ts` | Web hook that turns an input image into the request fields. |
| `packages/contracts/cloud-contracts/src/managed-media.ts` | Shared request schema for video generation, including the first-frame or reference rule. |
| `apps/web/app/api/media/video/generate/route.ts` | Server route that starts a video task and maps the input images to the provider request. |
| `apps/web/lib/services/openrouter-video-provider-service.ts` | Provider call for video input frames (name carries a vendor name; it is a file path). |
| `apps/mobile/src/features/video/services/videogen.ts` | Mobile client: consent, idempotency key, start, poll and cancel for video tasks. |
| `apps/extension/src/features/cloud-bridge/videoGenerationClient.ts` | Chrome extension client for video tasks, prompt only, with sign-in and plan-upgrade handling. |
| `apps/mobile/src/features/library/MediaJobsSection.tsx` | Mobile library section that lists video jobs. |
| `apps/web/db/neon/0257_file_versions_and_lineage.sql` | Unapplied draft for file versions and lineage, the only stored basis for S47.17 to S47.19. |
| `apps/web/features/chat/lib/videoRetryInputs.ts` | Keeps the input kind so a failed video can be retried with the same inputs. |

## What is stored

- Video task id, status, video address and thumbnail address for a generation: Read by the status route; the storage table for these was not opened in this pass
- Input image kind (first frame or reference) kept with a failed chat video so it can be retried: Web chat page state (apps/web/shared/stores/web-chat-store.ts:486)
- Planned version and parent columns on media, artifact and project file tables, a version history table and a lineage table: Draft only: apps/web/db/neon/0257_file_versions_and_lineage.sql, not applied
- Likeness, consent, reuse permission, collection visibility, remix permission: none: No storage found for these in the code searched

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Cloud send consent**: Mobile video start asks for consent before sending; without it the request is not sent (apps/mobile/src/features/video/services/videogen.ts:94)
- **Sign-in requirement**: The Chrome extension refuses to start a video without an account token (apps/extension/src/features/cloud-bridge/videoGenerationClient.ts:100)
- **Plan upgrade error codes**: Two server codes (plan_upgrade_required, subscription_required) are shown as an upgrade prompt in the extension (apps/extension/src/features/cloud-bridge/videoGenerationClient.ts:14)
- **Poll interval and timeout**: Status is checked every 5 seconds and gives up after 5 minutes (same values in mobile and extension) (apps/mobile/src/features/video/services/videogen.ts:49-50; apps/extension/src/features/cloud-bridge/videoGenerationClient.ts:11-12)
- **Input images rule**: A request may not send both a first frame and reference images (packages/contracts/cloud-contracts/src/managed-media.ts:223-227)
- **Unapplied migration**: The history and lineage tables do not exist until the draft is approved and applied (apps/web/db/neon/0257_file_versions_and_lineage.sql:4)

## Shared between apps

Shared: the video request schema in packages/contracts/cloud-contracts/src/managed-media.ts (used by web and mobile); the idempotency key helper from @agiworkforce/utils (imported by mobile videogen.ts); the server route apps/web/app/api/media/video/generate/route.ts used by web, mobile, desktop (apps/desktop/src/api/cloudApi.ts references the same path) and the Chrome extension. Separate per app: the Chrome extension has its own client (videoGenerationClient.ts, prompt only); mobile has its own service and library section; web has its own chat and hook. No editing code is shared, because none exists.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief marks S47.08 (first-frame and last-frame guidance) as missing on all four apps, but web sends a first-frame image for video creation, and the shared contract accepts it. Only the first frame exists; no last-frame field is in the contract. (apps/web/lib/hooks/useMediaGeneration.ts:33-34; packages/contracts/cloud-contracts/src/managed-media.ts:209; apps/web/app/api/media/video/generate/route.ts:611)
- The Chrome extension video client takes only a prompt, so the first-frame input is not available there, which matches the brief. Its status response type does not include any clip-editing fields. (apps/extension/src/features/cloud-bridge/videoGenerationClient.ts:109)
- The thumbnail address comes back from the status route for mobile, but no thumbnail picker exists to use it for S47.15. (apps/mobile/src/features/video/services/videogen.ts (status response type and generatedVideoFromStatus))
- The history and lineage draft is marked not applied, yet the audit note treats the feature as missing; the two agree, but nothing in the live code depends on the draft. (apps/web/db/neon/0257_file_versions_and_lineage.sql:1-4)

## Not established

- The brief and audit list no code paths for the 26 missing items, so none could be confirmed by name. Searches for likeness, cameo, caption, trim, concatenation, remix, visibility and dialogue found no feature code in apps or packages.
- No plan gates for area 47 were found in code. A test exists (apps/web/__tests__/api/media-video-paywall-contract.test.ts) but was not opened.
- Where task records and generated video files are stored was not opened.
- Whether the web or desktop video screens have any edit controls was not checked. Only the chat page and hook were opened.
- Desktop: only the API client reference was seen (apps/desktop/src/api/cloudApi.ts); no desktop video screen was opened.
- VS Code extension and CLI are not in the brief's status list, so their state is unknown.
- The brief's 'where its code is' lines are not in the brief text, so the code map above is the nearest existing code, not a confirmed owner.
- No build, test, server or localhost run was done: this task was read-only and the project folder was not changed. The request to test on localhost, one surface at a time, was therefore not applied; nothing was tested.
- Plan limits and wait or failure behaviour for the missing features are not defined anywhere in the code, so those parts of how_it_should_work come from the brief's Should text only.
