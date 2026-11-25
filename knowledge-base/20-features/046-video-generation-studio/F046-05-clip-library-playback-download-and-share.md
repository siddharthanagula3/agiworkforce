---
id: "F046-05"
type: "feature"
title: "Clip library, playback, download and share"
aliases: ["Clip library", "Videos tab", "Completed clip gallery (S46.30)", "Playback controls (S46.31)", "Download (S46.32)", "Share (S46.33)", "Save video (mobile)", "Generated video player"]
area: "46 Video-generation studio"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S46.30", "S46.31", "S46.32", "S46.33"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "api:GET /api/files/[id]", "api:GET /api/library", "table:media_assets", "table:video_generation_jobs", "store:device video cache (mobile)", "file:apps/web/app/api/files/[id]/route.ts", "file:packages/ui/unified-chat/src/components/library/LibraryView.tsx", "SYS-files-artifacts-and-storage", "SYS-sync-and-continuity", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "F046-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F046-05 Clip library, playback, download and share

Finished clips are stored as the person's own files. They play in the chat and in the Library 'Videos' tab, can be downloaded, and on mobile can be saved or sent to another app through the share sheet. The file route streams video with range support and a 256 MB cap. There is no share on web. Chrome plays and offers file actions.

Area: [46. Video-generation studio](README.md). Requirement items: [S46.30](../../10-requirements/capabilities/046-video-generation-studio.md#s4630), [S46.31](../../10-requirements/capabilities/046-video-generation-studio.md#s4631), [S46.32](../../10-requirements/capabilities/046-video-generation-studio.md#s4632), [S46.33](../../10-requirements/capabilities/046-video-generation-studio.md#s4633).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets the person find, watch, save and (on mobile) pass on a finished clip. The server serves the stored bytes only to the owner, in ranges so the player can scrub.

**Why it exists.** The founder decision keeps video in the chat and the Library rather than a separate studio (doc: docs/decisions/2026-09-27-founder-decisions.md:132-133). A clip must outlive the chat message and be usable outside the product.

**Who uses it.** Everyone who generates a clip, on web, Chrome, and mobile when released.

**Problems it solves**

- Losing a clip when the chat scrolls away.
- Not being able to save a clip to a device.
- Mixing videos with images in one list.

**Use cases**

- Open Library, choose Videos, play an old clip.
- Download the clip from the chat.
- On a phone, press Save and send it by message.

## 2. User experience

**Where to find it**

- Web chat: the finished message shows 'Your video is ready.' with a player (aria-label 'Generated video') and a round download button (aria-label 'Download video') at the top right (apps/web/features/chat/components/messages/MessageBubble.tsx:3393-3470).
- Web Library page (route /chat/library, apps/web/app/chat/library/page.tsx): tab 'Videos' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:91-96, 111); opening a clip plays it in a video element with test id library-video-player (LibraryView.tsx:1293-1300).
- Mobile chat (when released): card with 'Play' overlay and a 'Save' button (accessibility label 'Save video', hint 'Downloads the video and opens the share sheet') (apps/mobile/src/features/chat/components/GeneratedVideo.tsx:105-123, 205-235).
- Mobile Library: filter 'Videos' (apps/mobile/src/features/library/index.tsx:904-906), tap to play (486-505), item menu 'Share' (644) and selection share (686-690).
- Chrome side panel: an inline <video controls> with file actions (apps/extension/src/features/side-panel/generatedFiles.ts:341-392; actions built at 274-).

**Before you start**

- A completed job with a stored asset; signed in as the owner.
- Mobile: network to fetch the clip and a device with a share sheet (shareFile throws 'Sharing is not available on this device', services/fileCreation.ts:355-357).

**Screens and controls**

- Web in-chat player with native controls (play, pause, scrub, volume, fullscreen).
- If the video cannot load: 'Video failed to load' with 'Retry' (up to 2 times) and a 'Download video' link (MessageBubble.tsx:389, 3398-3425).
- Library tabs: All, Images, Videos, Documents, Artifacts, Uploads, Generated files (LibraryView.tsx:91-99).
- Mobile VideoPlayerModal: full-screen player with save and report controls (VideoPlayerModal.tsx:15-60).

**Journey**

1. 1. When the job completes the placeholder is replaced by the player (web) or card (mobile).
2. 2. Press play. Web streams from /api/files/<id> with range requests.
3. 3. Press the download button or link to save the file; or open Library > Videos for older clips.
4. 4. Mobile: press 'Save' to download the file and open the share sheet to save to the device or send to another app.
5. 5. Library: delete and restore follow the library's recovery rules (not video specific).

**What the person sees and gets**

- A playable clip; the file is marked as AI-generated in the stored file and response headers (video-job-reconciliation-service.test.ts:270, 302; status/route.ts:88-114).
- Errors: 'Video failed to load' (web), 'The video could not play. Retry, or Save to open it in another app.' (mobile GeneratedVideo.tsx:195), 'Could not save the video' alert (mobile).

**Settings**

- Plan download allowance does not apply to the owner's own generated, AI-marked video (apps/web/lib/services/tier-unit-quota-service.ts:472-479; apps/web/app/api/files/[id]/route.ts:246).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: in-chat player and download link, Library 'Videos' tab with kind=video query and a library video player, served from the file route (MessageBubble.tsx:3393-3470; LibraryView.tsx:95, 111, 1293).
- File route for video: 256 MB cap, requires stored byte size, supports a single byte range and answers 416 for a bad range, verifies the streamed length against the asset record, then streams (apps/web/app/api/files/[id]/route.ts:46, 224-293).
- Missing bytes return 404 'Video bytes are not available' (route.ts:260, 276); a size mismatch returns an internal error 'Stored video bytes did not match the authenticated asset.' (route.ts:283-286).
- Library list: the 'kind' filter returns videos (apps/web/app/api/library/route.ts, handleListLibrary at 148; test route.test.ts:163-176).
- Mobile: play through a local file prepared from the download, Save through the share sheet, library Videos filter and Share (GeneratedVideo.tsx:62-96; fileCreation.ts:348-368, 593-620; library/index.tsx:445-456, 486-505).
- Chrome: video result with object URL lease, loading and failure text (generatedFiles.ts:341-392).

**Incomplete**

- Web has no share for a video: no share control found in the chat bubble, and the library's shareArtifact host action is typed for artifacts (LibraryView.tsx:296, 664, 711-720); whether it applies to videos is unknown. Brief S46.33 says web share is missing.
- The web library download reads the file into the page for videos (large-file browser download is only for uploads other than video) (LibraryView.tsx:259-263, 559-592) [inferred risk for clips up to 256 MB].
- The library storage breakdown counts documents and images only; video is in neither bucket (apps/web/app/api/library/route.ts:117-130).
- A 'thumbnail' for videos in the library grid shows a Play glyph when none exists (LibraryView.tsx:1536-1537).

**Present but disconnected or switched off**

- Mobile chat card for new clips is hidden with the video flag; the mobile Library Videos filter and play are not behind the flag in the lines read (library/index.tsx:904-906) [inferred].

**Not available**

- Web and Electron desktop share of a video.
- Add video to a Project (S46.34) is declined (doc: docs/decisions/2026-09-27-founder-decisions.md:144).
- Remix, extend and segment regeneration (S46.35-37) are not present.

## 4. Required behaviour

**Established requirements**

- The user browses all completed clips together in a gallery (S46.30), plays, pauses and scrubs a finished clip (S46.31), downloads it (S46.32) and shares it with someone (S46.33). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S46.30, S46.31, S46.32, S46.33)
- Video is generated in chat and kept in the Library. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:132-133)
- A stored video is served only when its stored bytes match the signed-in owner's asset record. (source: apps/web/app/api/files/[id]/route.ts:258-293)
- AI-generated media is marked as such and keeps provenance. (source: apps/web/app/api/media/video/status/route.ts:88-114; apps/web/lib/services/video-job-reconciliation-service.test.ts:270, 302)
- Deleting library items goes to a recovery window; permanent removal is an explicit user action. (source: doc: AGENTS.md section 9; apps/web/app/api/library/route.ts (eraseAfter))

**Acceptance criteria**

1. A completed web video plays with native controls and can be scrubbed (range request returns 206).
2. The download button saves a playable file.
3. Library > Videos lists generated videos and no images; All lists both.
4. A request for another user's video asset is refused.
5. A stored video whose bytes are gone returns 404 'Video bytes are not available' and the chat shows 'Video failed to load' with a Download link.
6. A video above 256 MB is refused with a payload-too-large response.
7. On mobile (flag on), Save downloads the clip and opens the share sheet; if sharing is unavailable an error is shown.
8. Downloading your own generated video does not reduce the monthly file-download allowance.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] 'Share' for web would be a link or file hand-off; the product has not decided (the founder decision declines external image sharing, S44.31, and is silent on video share).
- [inferred] A 30 s 4k clip may exceed 256 MB; the cap is not tied to the model limits.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Record a decision on web video share (parity with Claude and ChatGPT should be checked against current pages).
- [proposed] Use a browser-native download for videos to avoid reading them into memory.
- [proposed] Count video bytes in the library storage breakdown.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MessageBubble video result | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Player, download link, load-failure retry (3393-3470). |
| component | LibraryView (shared) | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Tabs (91-111), isVideoItem (327), viewer with library-video-player (1170, 1293), download (559-592). |
| screen | Web library page | `apps/web/app/chat/library/page.tsx` | Hosts the library on web. |
| component | Web library host | `apps/web/features/library/components/LibraryView.tsx` | Transport: list, fetch asset, jobs, cancel (39-60, 244-258). |
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Lists items by kind, includes video previewable flag (53), storage breakdown (117-130). |
| endpoint | GET /api/files/[id] | `apps/web/app/api/files/[id]/route.ts` | Streams video with range, 256 MB cap, byte check (46, 224-293). |
| service | media-storage | `apps/web/lib/server/media-storage.ts` | streamStoredMedia, isVideoStorageConfigured, authenticatedMediaUrl. |
| service | tier-unit-quota-service downloadSpendsAllowance | `apps/web/lib/services/tier-unit-quota-service.ts` | Own AI-marked video does not spend the download allowance (472-479). |
| service | video-provider-output-service | `apps/web/lib/services/video-provider-output-service.ts` | Fetches and validates provider output before storage. |
| service | video-job-reconciliation-service | `apps/web/lib/services/video-job-reconciliation-service.ts` | Re-hosts the clip under a stable asset id and marks it AI-generated. |
| table | media_assets | `apps/web/lib/server/media-assets.ts` | Asset records read by the file route and library (table definition migration not read). |
| screen | Mobile GeneratedVideo | `apps/mobile/src/features/chat/components/GeneratedVideo.tsx` | Play and Save (62-235). |
| screen | Mobile VideoPlayerModal | `apps/mobile/src/features/chat/components/VideoPlayerModal.tsx` | Full-screen player, save, report. |
| service | Mobile fileCreation video helpers | `apps/mobile/services/fileCreation.ts` | prepareLocalVideoPlayer (593-620), shareFile (348-368). |
| screen | Mobile library | `apps/mobile/src/features/library/index.tsx` | Videos filter, play, share (445-456, 486-505, 644, 904). |
| service | Mobile libraryClient | `apps/mobile/src/features/library/libraryClient.ts` | Library list and video kind mapping (58). |
| component | Chrome generated file result | `apps/extension/src/features/side-panel/generatedFiles.ts` | Video result with file actions (341-392). |
| test | files route test | `apps/web/app/api/files/[id]/__tests__/route.test.ts` | Own generated video streams without spending a download allowance (265). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| On completion the server downloads the provider output (an outside fetch), marks it AI-generated, stores it under a stable asset id and records the asset on the job. | our servers | video-job-reconciliation-service.test.ts:243, 270; video-provider-output-service.ts |
| Status returns video_url pointing at /api/files/<asset id> and the transcript metadata stores it as videoUrl. | our servers | video-job-reconciliation-service.ts:87-89; video-generation-transcript.ts:41-43 |
| The browser video element requests the file; the server checks ownership, size and range, streams bytes from object storage. | our servers | apps/web/app/api/files/[id]/route.ts:224-293 |
| Download: the browser follows the anchor (chat) or the library fetches the file and saves it. | device | MessageBubble.tsx:3452-3466; LibraryView.tsx:559-592 |
| Mobile: the app downloads the bytes into a local file, builds a local player page, or opens the share sheet. | device | services/fileCreation.ts:593-620, 348-368 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| The video file and its asset record (kind video, MIME type, byte size, prompt, model, provider, provenance claim) | Object storage plus table media_assets | Server-side; shown in the library on every app | Library delete goes to a recovery window then erasure (apps/web/app/api/library/route.ts eraseAfter and RESOURCE_RECOVERY_WINDOW_DAYS); a purge cron exists (apps/web/app/api/cron/purge-deleted-media/__tests__/route.test.ts). |
| Local copy of the clip for playback or sharing (mobile) | Device cache directory | No | Reused while the cache entry exists (fileCreation.ts:597-600); cleanup policy not read. |
| Player object URL (Chrome) | Memory lease | No | Released when the figure unmounts (generatedFiles.ts:380-390). |

**Models and providers.** No model runs during playback or download. The clip came from the provider chosen at generation; the stored copy is ours.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; the file route checks that the asset belongs to the caller's workspace and user (files route ownership and scope). |
| Permissions | Owner only; cross-tenant access is refused. Workspace scoping applies through getUserScopedDb. |
| Subscription | Viewing and downloading one's own generated video has no plan check beyond having generated it; the download allowance is not spent for own AI-marked video (tier-unit-quota-service.ts:472-479). Other files spend the monthly allowance. |
| Limits and metering | 256 MB serve cap for video (files route:46); range requests; egress bytes are recorded for the owner (files route:288-293 recordEgressBytes). |
| Feature flags | Mobile new-clip card is hidden by FEATURES.videoGen=false. |
| Model compatibility | Not model dependent after storage. |
| Provider restrictions | None after the clip is stored. |
| Local mode | Playback of already stored clips needs the cloud file route; there is no local video. Mobile Local mode blocks creating new clips. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Native player preload metadata; mobile shows 'Loading' on the Play overlay. | MessageBubble.tsx:3441; GeneratedVideo.tsx:176-180 |
| Empty library | Handled by the shared library view generic empty state (not video specific). | LibraryView.tsx (not traced) |
| Bytes missing | 404 'Video bytes are not available'. | files route.ts:260, 276 |
| Range invalid | 416 with Content-Range */size. | files route.ts:262-270 |
| Too large | Payload-too-large response above 256 MB. | files route.ts:225-238 |
| Playback error | Web: 'Video failed to load' with Retry (2) and Download. Mobile: failed state with Retry and Save. | MessageBubble.tsx:3398-3425; GeneratedVideo.tsx:191-199 |
| Offline (mobile) | Alert 'Could not play the video' or 'Could not save the video' with 'Check your connection and try again.' | library/index.tsx:503; GeneratedVideo.tsx:89 |
| Account switch (mobile) | Player closes when the signed-in account changes. | library/index.tsx:302-306 |
| Accessibility | Web video has an aria-label; download is a labelled link kept visible on focus and for reduced motion. Mobile exposes labelled buttons. | MessageBubble.tsx:3444, 3456-3464; GeneratedVideo.tsx:107-118 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/files/[id]/__tests__/route.test.ts`: Own generated video streams without spending a download allowance but is still metered (line 265).
- `apps/web/app/api/library/__tests__/route.test.ts`: Library kind filter for image and video and the playable preview flag (lines 163-176).
- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Videos tab sends kind=video (line 325); video item preview (1314).
- `apps/web/features/chat/components/messages/MessageBubble.test.tsx`: Placeholder while in flight and player once the video lands (line 568).
- `packages/ui/unified-chat/src/components/__tests__/GeneratedFileCard.video.test.tsx`: Generated file card for video (titles not read).
- `apps/mobile/__tests__/GeneratedVideoLifecycle.test.tsx`: Mobile video action lifecycle, poster, failed state with Retry and Save.
- `apps/mobile/__tests__/VideoPlayerModalReport.test.tsx`: Player modal report control (title not read).
- `apps/mobile/__tests__/generated-video-url.test.ts`: Video address resolution (title not read).
- `apps/web/lib/server/media-storage.test.ts`: Media storage helpers (video detail not confirmed).

**Test scenarios**

- **Play and scrub**
  1. Generate a clip on web.
  2. Play it and drag the progress bar.
  3. Watch the network panel.
  - Expected: Range requests answered 206; playback resumes at the new point.
- **Download**
  1. Press the round download button in the chat.
  2. Open the saved file.
  - Expected: A playable mp4/webm file.
- **Library Videos tab**
  1. Open /chat/library, choose Videos.
  - Expected: Only videos listed, newest first or per sort; opening one plays it.
- **Missing bytes**
  1. Remove the stored object for a clip in a test environment.
  2. Open the chat.
  - Expected: 'Video failed to load' with Retry then Download; server logs 404.
- **Mobile Save**
  1. Test build with flag on, generate a clip, press Save.
  - Expected: Share sheet opens with the video file.
- **Web share**
  1. Look for a share control on a clip in chat and library.
  - Expected: None found today; record the result.

**Where to look when it fails**

- 404 'Video bytes are not available' and 500 'Stored video bytes did not match the authenticated asset.' from the file route.
- Table media_assets (kind, mime_type, byte_size, storage pathname).
- Header and metadata for AI provenance (status route).
- Library rows with origin generated and source_surface.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/046-video-generation-studio.md](../../70-qa/test-plans/web/046-video-generation-studio.md)
- Desktop: [70-qa/test-plans/desktop/046-video-generation-studio.md](../../70-qa/test-plans/desktop/046-video-generation-studio.md)
- Mobile: [70-qa/test-plans/mobile/046-video-generation-studio.md](../../70-qa/test-plans/mobile/046-video-generation-studio.md)
- No hands-on plan yet for Chrome: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **No web (or Electron desktop) share for a video.** Affects: Web, desktop. Evidence: No share control in MessageBubble.tsx video block (3393-3470); brief S46.33 web missing. Work needed: Owner decision on form (link or file), then build with the shared library host.
- **Library download of a video reads the whole file into the page.** Affects: Web, desktop. Evidence: LibraryView.tsx:259-263, 559-592. Work needed: Use a browser-native download for videos and check the allowance exemption holds.
- **Library storage breakdown ignores video bytes.** Affects: Web library storage meter. Evidence: apps/web/app/api/library/route.ts:117-130. Work needed: Add a videos bucket or document the omission.
- **The 256 MB cap is not tied to the longest clip the models can make.** Affects: All surfaces. Evidence: files route.ts:46; catalog durations up to 30 s. Work needed: Measure real output sizes and set the cap deliberately.
- **The brief and the surface matrix list wrong code anchors and mark Chrome absent while a Chrome video player exists.** Affects: Engineers, testers. Evidence: generatedFiles.ts:341-392; doc: docs/product/surface-feature-matrix.md:312-320. Work needed: Regenerate the matrix and brief.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- api:GET /api/files/[id]
- api:GET /api/library
- table:media_assets
- table:video_generation_jobs
- store:device video cache (mobile)
- file:apps/web/app/api/files/[id]/route.ts
- file:packages/ui/unified-chat/src/components/library/LibraryView.tsx
- SYS-files-artifacts-and-storage
- SYS-sync-and-continuity
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- F046-03

## Unknown

- Whether the library shareArtifact action applies to videos on any host.
- Exact label of the web library download action (handler and icon found; label text not read).
- Whether the mobile Library Videos filter and Share are reachable with the flag off (not gated in the lines read).
- Retention length of deleted media and the exact recovery window days.
- Typical clip file size in production versus the 256 MB cap.
- How Chrome's file actions are labelled (buildFileActions not read in detail).
