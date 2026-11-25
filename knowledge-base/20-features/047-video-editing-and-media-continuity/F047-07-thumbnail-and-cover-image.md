---
id: "F047-07"
type: "feature"
title: "Thumbnail and cover image"
aliases: ["Thumbnail selection (S47.15)", "Cover image (S47.16)", "Use as thumbnail", "Set cover", "poster frame", "thumbnail_url / thumbnailUrl", "thumbnail_uri (Library)"]
area: "47 Video editing and media continuity"
available_on: ["web", "mobile"]
implementation: {web: "partial", desktop: "missing", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S47.15", "S47.16"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "plan:enterprise", "SYS-voice-and-media", "SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "file:apps/web/lib/server/library-thumbnail.ts", "api:GET /api/media/video/status"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F047-07 Thumbnail and cover image

Lets a person choose which frame of a generated video clip, or which uploaded picture, stands for the clip wherever it is listed. It is not built on any app. Only a generated poster field exists in the mobile and web clients, and the server never fills it. The Library draws small pictures for images only.

Area: [47. Video editing and media continuity](README.md). Requirement items: [S47.15](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4715), [S47.16](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4716).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Planned: a person picks a frame (Use as thumbnail) or uploads a picture (Set cover) to represent a generated video clip in chat, the Library and shared lists. Today the only related code is a poster slot in the video players and a server thumbnail for Library images.

**Why it exists.** The brief lists S47.15 and S47.16 so a clip is recognisable in a grid. The product guidance asks that media management keep thumbnails and provenance (doc: docs/product/competitive-guidance.md:417 item 134). Both leaders' media lists show a picture per item [inferred].

**Who uses it.** People who generate videos with AGI Workforce on a plan that allows video, and later look for them in the chat or the Library. Cloud mode only, because video generation is a managed Cloud feature (apps/web/app/api/media/video/generate/route.ts:958).

**Problems it solves**

- A video tile in the Library is a bare Play glyph, so clips look alike (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1536).
- A video in chat shows a black first frame until played because no poster is supplied by the server (apps/web/lib/services/video-job-reconciliation-service.ts:75).

**Use cases**

- After generating three similar clips, pick the best frame of one so it is easy to find in the Library.
- Upload a branded cover image for a clip before sharing it.
- See a poster image on a finished clip in the mobile chat before pressing play.

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile, Chrome extension: no picker and no menu item 'Use as thumbnail' or 'Set cover' exists in the code (brief status S47.15 and S47.16 are missing on all four apps; searched apps/web, apps/mobile/src, apps/desktop/src, apps/extension/src for thumbnail, none is a picker).
- CLI and VS Code extension: not applicable (brief status n/a).
- Existing related display only: the web chat player (apps/web/features/chat/components/messages/MessageBubble.tsx:3438) and the Library tile grid (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1490).

**Before you start**

- Signed-in account on a plan that includes video generation: the plan list is max_15x and enterprise (packages/contracts/types/src/billing-catalog.ts:357).
- A finished video clip. Cloud mode, because the generate route is a managed Cloud route (apps/web/app/api/media/video/generate/route.ts:938-990).

**Screens and controls**

- Not built. Proposed labels from the brief: 'Use as thumbnail' (scrub to a frame) and 'Set cover' (choose an image file) [proposed].
- Built and unrelated to choice: the video element's poster attribute (apps/web/features/chat/components/messages/MessageBubble.tsx:3446), and the Library tile that shows a Play icon for a video (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1536).

**Journey**

1. Planned: open a finished clip.
2. Planned: scrub to a frame and choose 'Use as thumbnail', or choose 'Set cover' and pick an image.
3. Planned: the chosen picture shows on every list that shows the clip.
4. Today instead: generate a video, the player appears with the browser's own first frame, and the Library tile shows a Play icon.

**What the person sees and gets**

- Today: no thumbnail feedback. The chat shows 'Your video is ready.' with the player and a download link (apps/web/features/chat/components/messages/MessageBubble.tsx:3419-3458).
- If the video file fails to load the chat shows 'Video failed to load' with a Retry button (up to two retries) and 'Download video' (apps/web/features/chat/components/messages/MessageBubble.tsx:389,3402-3425).

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web chat player takes a poster from message metadata thumbnailUrl (apps/web/features/chat/components/messages/MessageBubble.tsx:3446) and the web page copies result.thumbnailUrl into the message when present (apps/web/features/chat/pages/WebChatPage.tsx:3818).
- Mobile client reads thumbnail_url from the status response and returns it as thumbnailUrl (apps/mobile/src/features/video/services/videogen.ts:29,36,134); the mobile chat action stores it on the message (apps/mobile/src/features/chat/actions/runVideoGenerationTurn.ts:160).
- Library images get a server-made 640-pixel WebP thumbnail at /api/files/{id}/thumbnail, only for jpeg, png, webp and gif up to 30 MB (apps/web/lib/server/library-thumbnail.ts:5-9,26-42; apps/web/app/api/files/[id]/thumbnail/route.ts:50-64). The Library list adds thumbnail_uri for those items (apps/web/app/api/library/route.ts:76; packages/contracts/cloud-contracts/src/library.ts:69).

**Incomplete**

- The status route's response type has thumbnail_url (apps/web/app/api/media/video/status/route.ts:33) but the object it returns is built by publicVideoJobStatus, whose type and body have no thumbnail field (apps/web/lib/services/video-job-reconciliation-service.ts:63-110). So a finished video never carries a thumbnail from the server [inferred from that code; no other assignment found in apps/web/lib or apps/web/app/api/media]. The brief's statement that the status response 'already returns' one is true of the declared type only.
- The Library thumbnail covers images only: hasLibraryThumbnail rejects any non-picture type, so a video row gets none (apps/web/lib/server/library-thumbnail.ts:26-38).

**Present but disconnected or switched off**

- Chrome extension reads only video_url from the status payload, never a thumbnail (apps/extension/src/features/cloud-bridge/videoGenerationClient.ts:72-78); the side panel builds the file card without one (apps/extension/src/side_panel.ts:6165-6176).
- Desktop cloud video call returns a video address; no thumbnail handling was found in apps/desktop/src (searched for 'thumbnail'; unknown whether the response is read for one) (apps/desktop/src/api/cloudApi.ts:600-640).

**Not available**

- Thumbnail picker, cover upload, storage for a chosen thumbnail and any API to set it: not available on web, desktop, mobile or Chrome (brief S47.15, S47.16 status missing; no column for it in media_assets, apps/web/db/neon/0036_media_assets.sql:9-25).
- CLI and VS Code: not applicable (brief).

## 4. Required behaviour

**Established requirements**

- User picks the thumbnail frame for a clip. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S47.15)
- User sets a cover image for a clip. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S47.16)
- Media management keeps prompts, provenance, thumbnails, version relationships, downloads and sharing metadata. (source: doc: docs/product/competitive-guidance.md:417)
- Video editing is not built because neither leader documents one; image and video edit controls (S47.11 among them) were declined. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:139-144 and :310)

**Acceptance criteria**

1. A finished video shows a still picture before play on web chat, mobile chat and the Library tile.
2. Choosing a frame or uploading a cover replaces that picture everywhere the clip is listed.
3. If saving the new thumbnail fails, the previous thumbnail stays and an error is shown.
4. The cover upload accepts only picture types and refuses oversize files with a stated reason.
5. The clip file itself is unchanged by choosing a thumbnail.
6. A person cannot set a thumbnail on another person's clip.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Thumbnail choice needs a place to store the chosen picture and a way to serve it the same way /api/files/{id}/thumbnail serves image tiles [inferred].
- The founder decision to decline edit controls may make S47.15 and S47.16 out of scope; the brief still lists them as missing, so the owner must say which applies. unknown.

**Proposed improvements** (suggestions, not requirements)

- Make the status response and the Library list return a poster for completed videos from the stored asset, then add the picker.
- Reuse the existing thumbnail route and WebP renderer for the cover upload path [proposed].

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | videogen client | `apps/mobile/src/features/video/services/videogen.ts` | Mobile: status type with thumbnail_url and mapping to thumbnailUrl |
| service | runVideoGenerationTurn | `apps/mobile/src/features/chat/actions/runVideoGenerationTurn.ts` | Mobile: stores thumbnailUrl on the chat message |
| endpoint | GET /api/media/video/status | `apps/web/app/api/media/video/status/route.ts` | Returns job status; its type declares thumbnail_url |
| service | publicVideoJobStatus | `apps/web/lib/services/video-job-reconciliation-service.ts` | Builds the public status body; has no thumbnail field |
| component | MessageBubble video block | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Web chat player with poster, download link, retry |
| screen | WebChatPage video completion | `apps/web/features/chat/pages/WebChatPage.tsx` | Copies result.thumbnailUrl into message metadata |
| service | media-api-service | `apps/web/features/media/services/media-api-service.ts` | Web client type for the status response with thumbnail_url |
| store | media-store | `apps/web/shared/stores/media-store.ts` | In-tab media job record with optional thumbnailUrl |
| component | LibraryView tile | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Shared Library grid; thumbnail_uri for images, Play glyph for videos |
| schema | LibraryItemSchema | `packages/contracts/cloud-contracts/src/library.ts` | Library item contract with optional thumbnail_uri |
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Adds thumbnail_uri for stored pictures |
| endpoint | GET /api/files/{id}/thumbnail | `apps/web/app/api/files/[id]/thumbnail/route.ts` | Streams a rendered small picture for an image file |
| service | library-thumbnail | `apps/web/lib/server/library-thumbnail.ts` | Decides which assets get a thumbnail and renders the WebP |
| table | media_assets | `apps/web/db/neon/0036_media_assets.sql` | Catalog row for a generated video or image; no thumbnail column |
| table | video_generation_jobs | `apps/web/db/neon/0105_durable_video_generation_jobs.sql` | Durable video job; links asset_id to media_assets |
| service | videoGenerationClient (Chrome) | `apps/extension/src/features/cloud-bridge/videoGenerationClient.ts` | Chrome: reads video_url only |
| service | generateCloudVideo | `apps/desktop/src/api/cloudApi.ts` | Desktop: starts and polls a cloud video |
| test | thumbnail route test | `apps/web/app/api/files/[id]/thumbnail/route.test.ts` | Covers the image thumbnail route |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person asks for a video in chat; the client posts the request with an Idempotency-Key to the video generate route. | device and our servers | apps/mobile/src/features/video/services/videogen.ts:80-100; apps/web/app/api/media/video/generate/route.ts:938-990 |
| The server checks plan access, runs prompt moderation, creates a durable job and sends the work to a video provider. | our servers | apps/web/app/api/media/video/generate/route.ts:958,1137-1160 |
| The provider renders the clip; the server stores it as a media_assets row and links it to the job. | outside service | apps/web/lib/services/video-job-reconciliation-service.ts:75-110; apps/web/db/neon/0105_durable_video_generation_jobs.sql:121 |
| The client polls status every 5 seconds up to 5 minutes and receives video_url (no thumbnail today). | device and our servers | apps/mobile/src/features/video/services/videogen.ts:49-50,134 |
| The player shows the clip; poster is set only if a thumbnailUrl exists on the message. | device | apps/web/features/chat/components/messages/MessageBubble.tsx:3446 |
| For Library images only, the browser asks the thumbnail route, which reads the stored bytes and returns a WebP. | our servers | apps/web/app/api/files/[id]/thumbnail/route.ts:50-90 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Generated video file and catalog row | Object storage plus table media_assets (apps/web/db/neon/0036_media_assets.sql:9-25) | Yes, read by every Cloud surface through the user id (apps/web/db/neon/0036_media_assets.sql:1-7) | Soft delete through deleted_at; Library delete moves to deleted items (apps/mobile/src/features/library/index.tsx:557) |
| Rendered image thumbnail | Not stored; rendered per request (apps/web/app/api/files/[id]/thumbnail/route.ts:50-90) | not applicable | not applicable |
| Chosen thumbnail or cover | Not implemented, no storage exists | not applicable | not applicable |

**Models and providers.** Video rendering is done by an outside video provider chosen by the server from the model catalog (apps/web/app/api/media/video/generate/route.ts:354,1137-1175). The thumbnail picker would not need a model. Image thumbnails use no model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required for the video routes and the thumbnail route (apps/web/app/api/media/video/status/route.ts:56; apps/web/app/api/files/[id]/thumbnail/route.ts:50-60). |
| Permissions | Rows are read through the user-scoped database and workspace scope, so another account gets 'File not found' (apps/web/app/api/files/[id]/thumbnail/route.ts:60-64). |
| Subscription | Video generation is allowed on plans max_15x and enterprise (packages/contracts/types/src/billing-catalog.ts:357); others get an upgrade message (apps/web/app/api/media/video/generate/route.ts:986). No plan rule for choosing a thumbnail exists: none found in the code. |
| Limits and metering | Video jobs are metered by managed usage with an idempotency key (apps/web/app/api/media/video/generate/route.ts:1120-1132). Image thumbnails do not spend the download allowance (apps/web/app/api/files/[id]/thumbnail/route.test.ts:114). No limit for thumbnail choice: none found in the code. |
| Feature flags | none found in the code for thumbnail choice. |
| Model compatibility | Not model dependent. Video model availability follows the catalog and admission (apps/web/features/chat/components/Composer/video-input-images.ts:21-27). |
| Provider restrictions | Video comes from managed video providers only; no provider returns a thumbnail in the current status body (apps/web/lib/services/video-job-reconciliation-service.ts:75-110). |
| Local mode | Local mode has no video generation path found in the code; a thumbnail choice for a local clip is not available. Local sign-in versus payment: unknown for video. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Poster missing | The player shows the browser's default first frame (poster attribute is undefined) | apps/web/features/chat/components/messages/MessageBubble.tsx:3446 |
| Video fails to load | Shows 'Video failed to load', Retry up to two times and a download link | apps/web/features/chat/components/messages/MessageBubble.tsx:389,3402-3425 |
| Library item is a video | Tile shows a Play icon, not a picture | packages/ui/unified-chat/src/components/library/LibraryView.tsx:1536 |
| Thumbnail source not a picture or too large | Route answers 'Thumbnail not available' (not found) | apps/web/app/api/files/[id]/thumbnail/route.ts:64 |
| Offline, cancel, timeout during thumbnail choice | not handled in the code (no picker). Video polling times out after 5 minutes | apps/mobile/src/features/video/services/videogen.ts:50 |
| Accessibility | Video has an aria-label 'Generated video'; picker not built so nothing to assess | apps/web/features/chat/components/messages/MessageBubble.tsx:3443 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/files/[id]/thumbnail/route.test.ts`: Image thumbnail route: serves a picture, refuses non-pictures, hides other workspaces and deleted files, rejects non-uuid ids
- `apps/web/app/api/library/__tests__/route.test.ts`: Library list adds thumbnail_uri for stored pictures and omits it otherwise
- `apps/mobile/__tests__/LibraryThumbnailPath.test.tsx`: Mobile Library thumbnail path handling for images
- `apps/mobile/__tests__/LibraryThumbnailTiles.test.tsx`: Mobile Library tiles drawn from thumbnails
- `apps/web/__tests__/api/media-video-status.test.ts`: Video status route auth, ownership and result URL (no thumbnail test seen)
- `apps/mobile/__tests__/generated-video-url.test.ts`: Mobile resolving of the generated video address

**Test scenarios**

- **Finished video has no server poster today**
  1. Generate a short video on a plan that allows it
  2. Poll GET /api/media/video/status until completed
  3. Read the JSON body
  - Expected: Body has video_url and no thumbnail_url, confirming the gap
- **Library image tile uses thumbnail**
  1. Open the Library with an uploaded picture
  2. Inspect the tile image source
  - Expected: Source is /api/files/{id}/thumbnail returning a WebP
- **Library video tile**
  1. Open the Library with a generated video
  - Expected: Tile shows a Play icon, no picture
- **Other account cannot read a thumbnail**
  1. Request /api/files/{id}/thumbnail for another account's file
  - Expected: 404 File not found
- **Picker acceptance (after it is built)**
  1. Open a clip, scrub, choose Use as thumbnail
  2. Open the Library
  3. Force the save to fail and retry
  - Expected: New frame shows in lists; on failure the old thumbnail stays

**Where to look when it fails**

- Error text 'Thumbnail not available' or 'File bytes are not available' from the thumbnail route.
- Logger line 'Durable video job ownership denied' on a status request for another account's task (apps/web/app/api/media/video/status/route.ts:78).
- Tables video_generation_jobs and media_assets for the job and asset rows.

**Hands-on test plans**

- none: not built on any app
- No hands-on plan yet for Web, Mobile: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **No way to choose a frame or upload a cover** Affects: All users of web, desktop, mobile, Chrome. Evidence: Brief S47.15, S47.16 missing; no picker code found. Work needed: Design the control, a storage place for the chosen picture, an API and the display in chat and Library
- **Status response never carries a poster although its type declares one** Affects: Web, mobile, desktop and Chrome users watching a finished video. Evidence: apps/web/app/api/media/video/status/route.ts:33 versus apps/web/lib/services/video-job-reconciliation-service.ts:63-110. Work needed: Produce a poster from the stored asset and return it, or remove the dead field
- **Library thumbnails exclude videos** Affects: Web, desktop, mobile Library users. Evidence: apps/web/lib/server/library-thumbnail.ts:26-38. Work needed: Extend the thumbnail source types or add a video poster
- **Scope is contested: founder decisions decline image and video edit controls** Affects: Planning. Evidence: doc: docs/decisions/2026-09-27-founder-decisions.md:139-144. Work needed: Owner to confirm whether S47.15 and S47.16 stay in scope
- Not built on: Desktop, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:max_15x
- plan:enterprise
- SYS-voice-and-media
- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- file:apps/web/lib/server/library-thumbnail.ts
- api:GET /api/media/video/status

## Unknown

- Whether desktop reads a thumbnail from the cloud video response (no code found).
- Whether the owner still wants S47.15 and S47.16 given the founder decision to decline video edit controls.
- Whether video is available in Local mode (no path found).
- Plan rules for thumbnail choice are not defined.
