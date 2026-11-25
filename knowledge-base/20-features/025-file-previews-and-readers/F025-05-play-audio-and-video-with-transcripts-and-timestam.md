---
id: "F025-05"
type: "feature"
title: "Play audio and video, with transcripts and timestamps"
aliases: ["Video player", "Audio player", "Transcript panel", "Timestamp navigation", "library-video-player", "VideoPlayerModal", "S25.06 Audio player", "S25.07 Video player", "S25.23 Transcript panel", "S25.24 Timestamp navigation"]
area: "25 File previews and readers"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S25.06", "S25.07", "S25.23", "S25.24"]
depends_on: ["SYS-voice-and-media", "SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-inference-providers", "surface:web", "surface:mobile", "surface:chrome", "surface:desktop", "mode:cloud", "api:GET /api/files/[id]", "table:media_assets"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F025-05 Play audio and video, with transcripts and timestamps

Plays video in the product with the player's own controls on web, Electron Desktop, mobile and the Chrome side panel. Audio files have no player, and transcript panels and timestamp navigation do not exist. The retained Tauri Library cannot play video correctly.

Area: [25. File previews and readers](README.md). Requirement items: [S25.06](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2506), [S25.07](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2507), [S25.23](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2523), [S25.24](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2524).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Plays a stored video. Web: a video element with controls pointed at the file URL, served with byte ranges (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1292-1301; apps/web/app/api/files/[id]/route.ts:258-310). Mobile: downloads the video to a cache folder and plays it from a local page in a WebView (apps/mobile/services/fileCreation.ts:553-621; Library index.tsx:486-511, 1144).

**Why it exists.** Generated videos should be watched where they are saved. The brief asks for audio and video players with transcripts and timestamps (S25.06, S25.07, S25.23, S25.24).

**Who uses it.** People who generate videos with the media features, on web, Electron, mobile and Chrome.

**Problems it solves**

- Watching a generated video without downloading.
- Seeking in large videos through range requests.

**Use cases**

- Play a generated clip in the Library.
- Seek in a long video on web.
- Watch a clip on a phone.
- Watch a video in an answer in the Chrome side panel.

## 2. User experience

**Where to find it**

- Web and Electron: Library video tile (play icon) opens the viewer; label 'Open <name>'.
- Mobile: Library video card opens a video player modal (index.tsx:786-800, 1144-1151).
- Chrome: answer video player in the side panel (generatedFiles.ts:340-410).

**Before you start**

- Signed in with a Cloud account.
- A video type (video/*).

**Screens and controls**

- Web: native video controls, aria-label = file name; Download and Close buttons.
- Mobile: player modal with report option for generated media and the hint 'Long-press the video and choose Share to open it in another app.' on failure (index.tsx:1144-1151).
- Chrome: video with controls and metadata preload.

**Journey**

1. Open the video.
2. Wait while it loads.
3. Press play, seek, pause.
4. Close.

**What the person sees and gets**

- Mobile failure Alert 'Could not play the video' with 'Check your connection and try again.' (index.tsx:502-505).
- Chrome loading and failure messages from spAnswerVideoLoading and spAnswerVideoFailed (generatedFiles.ts:350-390).
- 'The saved video format is not supported.' for non mp4, webm or mov on mobile (fileCreation.ts:589-591).

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web video element: controls, playsInline, preload metadata (LibraryView.tsx:1292-1301). Server: byte-range support with 206, 416 for bad ranges, 256 MB cap, allowance checked per range length (route.ts:46, 258-310).
- Mobile: mp4, webm and quicktime only, cached per account, plays with autoplay in a local HTML page (fileCreation.ts:566-621).
- Chrome: video blob URL with a lease released on unmount (generatedFiles.ts:340-410).

**Incomplete**

- Mobile downloads the whole file before playing; no streaming (fileCreation.ts:586-596).

**Present but disconnected or switched off**

- Tauri DesktopLibrary: playbackUri falls back to the relative item URL because inlinePreviewUri is missing, so the request carries no bearer token [inferred] (LibraryView.tsx:1170; DesktopLibrary.tsx:130-181). Its own dialog has no video kind (DesktopLibrary.tsx:44-70).

**Not available**

- Audio player in the Library or file viewers on web, mobile, Desktop, VS Code, Chrome: web does not mark audio previewable so a click does nothing (library/route.ts:51-58; LibraryView.tsx:810); mobile classes audio as a document and shows 'Preview isn’t available for this file type.' with Share (libraryClient.ts:55-60; FileViewerScreen.tsx:190-212). Audio elements exist only for voice samples and speech (apps/web/features/chat/components/Voice/VoiceSampleButton.tsx, apps/mobile/src/features/voice/services/voiceSamples.ts).
- Transcript panel and timestamp navigation: no code found in any app.
- VS Code and CLI: no player.

## 4. Required behaviour

**Established requirements**

- Audio files play in an in-product player. (source: S25.06)
- Video files play in an in-product player. (source: S25.07)
- Audio and video files show a transcript panel. (source: S25.23)
- Users can navigate audio and video by timestamp. (source: S25.24)

**Acceptance criteria**

1. A video in the web Library opens with controls and plays.
2. Seeking mid-file on web sends a Range request and gets 206.
3. A malformed Range header answers 416 with no storage read.
4. Mobile plays mp4 and shows an alert for an unsupported format.
5. Opening a video does not charge the allowance when the owner generated it, and does when uploaded.
6. [proposed] An audio file plays in the viewer on every app that shows videos.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Transcripts need a transcription provider route and its usage rules (SYS-voice-and-media) [inferred].

**Proposed improvements** (suggestions, not requirements)

- Add an audio branch to the shared viewer; add a transcript panel fed by the transcription pipeline with click-to-seek timestamps.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | FileViewerOverlay | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Video branch (lines 1170, 1292-1301). |
| endpoint | GET /api/files/[id] | `apps/web/app/api/files/[id]/route.ts` | Range streaming, 256 MB cap, egress and allowance. |
| service | parseSingleByteRange | `apps/web/app/api/files/[id]/route.ts` | Validates one byte range (lines 60-89). |
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | previewable true for video/* (line 54). |
| service | tier-unit-quota-service | `apps/web/lib/services/tier-unit-quota-service.ts` | Download allowance and owner-generated exemption. |
| service | media-storage streaming | `apps/web/lib/server/media-storage.ts` | streamStoredMedia used for ranges (imported in route.ts:21-25). |
| screen | Mobile Library | `apps/mobile/src/features/library/index.tsx` | handlePlayVideo, handleCloseVideo, VideoPlayerModal mount. |
| service | prepareLocalVideoPlayer | `apps/mobile/services/fileCreation.ts` | Downloads, caches and writes player.html. |
| service | libraryClient | `apps/mobile/src/features/library/libraryClient.ts` | Classifies audio as document. |
| component | Chrome answer files | `apps/extension/src/features/side-panel/generatedFiles.ts` | Video result with object URL lease. |
| component | DesktopLibrary (Tauri tree) | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Transport without inline preview; no video kind. |
| service | Electron window URL | `apps/desktop/electron/main.ts` | Hosted web app gives Desktop the web player. |
| config | Mobile playable types | `apps/mobile/services/fileCreation.ts` | PLAYABLE_VIDEO_EXTENSIONS (line 566). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: the video element requests the file URL; the browser sends Range requests while seeking. | device | LibraryView.tsx:1292-1301; route.ts:262 |
| Server validates the range, checks allowance for the range length, streams the object and checks the length matches the asset record. | our servers | route.ts:262-309 |
| Bytes stream from private storage. | outside service | route.ts:275 |
| Mobile downloads the full video, stores it in the cache and plays it in a WebView page. | device and our servers | fileCreation.ts:582-621 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Video bytes | Cloud storage; mobile cache video-previews/<owner>/<key> | Cloud is source | Mobile copies removed by Clear cache and sign-out (fileCreation.ts:553-558) |
| Egress bytes | Usage accounting | Server | Not recorded when stored bytes fail validation (route.test.ts:491) |

**Models and providers.** No model plays video. Generating a video uses media providers outside this feature (SYS-voice-and-media).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in with a Cloud account. |
| Permissions | Workspace-scoped read. |
| Subscription | Free has a daily download cap checked before any video bytes stream; paid plans a monthly allowance; owner-generated video is exempt from the allowance but still metered (route.test.ts:265-300, 594). Streaming allowance applies per range request (route.ts:274). |
| Limits and metering | 256 MB video cap (route.ts:46); egress recorded (route.ts:289-295). |
| Feature flags | none found in the code |
| Model compatibility | Not model dependent. |
| Provider restrictions | Not provider dependent. |
| Local mode | Playback is of Cloud files; no Local-mode player exists in the files read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Browser buffering; mobile loading flag blocks double taps; Chrome spinner. | index.tsx:488-490; generatedFiles.ts:341-346 |
| Bad range | 416 with Content-Range */size. | route.ts:263-272 |
| Too large | 413 above 256 MB. | route.ts:226-238 |
| Unsupported mobile format | Alert 'Could not play the video'. | fileCreation.ts:589-591; index.tsx:501-504 |
| Allowance used up | Request refused with a limit error before streaming. | route.test.ts:575-604 |
| Audio file | Web: nothing happens on click; mobile: unsupported panel with Share. | LibraryView.tsx:810; FileViewerScreen.tsx:190-212 |
| Offline | Mobile alert; web browser media error; not otherwise handled. | index.tsx:501-504 |
| Accessibility | Web video has an aria-label; mobile gives a failure hint to share. | LibraryView.tsx:1298; index.tsx:1150 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: 'plays a generated video inline' (src, controls, no zoom).
- `apps/web/app/api/files/[id]/__tests__/route.test.ts`: Video streaming, range 206, invalid ranges, caps, allowance behaviour.
- `apps/mobile/__tests__/GeneratedVideoLifecycle.test.tsx`: Generated video lifecycle (file exists; contents not read).
- `apps/mobile/__tests__/generated-video-url.test.ts`: Video URL handling (file exists; contents not read).
- `apps/mobile/__tests__/LibraryStaleActions.test.tsx`: Library actions staleness (file exists; contents not read).

**Test scenarios**

- **Seek**
  1. Play a long generated video on web.
  2. Drag the seek bar.
  - Expected: Range requests answered 206 and playback resumes.
- **Bad range**
  1. Call the file route with Range: bytes=abc.
  - Expected: 416 response.
- **Mobile playback**
  1. Tap a video card on a phone.
  - Expected: Player modal plays; second open reuses the cache.
- **Audio**
  1. Upload an mp3 and click it on web, then on mobile.
  - Expected: Web: nothing; mobile: unsupported panel with Share.
- **Desktop Electron**
  1. Open a video in the Electron app.
  - Expected: Same as web.

**Where to look when it fails**

- HTTP status 416, 413, 429 on /api/files/<id>.
- Mobile alert text.
- Error 'Stored video bytes did not match the authenticated asset.' (route.ts:286).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/025-file-previews-and-readers.md](../../70-qa/test-plans/web/025-file-previews-and-readers.md)
- Desktop: [70-qa/test-plans/desktop/025-file-previews-and-readers.md](../../70-qa/test-plans/desktop/025-file-previews-and-readers.md)
- Mobile: [70-qa/test-plans/mobile/025-file-previews-and-readers.md](../../70-qa/test-plans/mobile/025-file-previews-and-readers.md)
- No hands-on plan yet for Chrome: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **No audio player.** Affects: All apps.. Evidence: library/route.ts:51-58; FileViewerScreen.tsx:190-212.. Work needed: Add audio branch and previewable rule.
- **No transcript panel or timestamp navigation.** Affects: All apps.. Evidence: No code found.. Work needed: Needs transcription route, storage and UI.
- **Mobile downloads the whole video first.** Affects: Mobile users on slow links.. Evidence: fileCreation.ts:586-596.. Work needed: Stream from the range endpoint.
- **Tauri Library video request has no auth.** Affects: Retained Tauri tree.. Evidence: LibraryView.tsx:1170; DesktopLibrary.tsx.. Work needed: Authenticated blob playback.
- **VS Code has no video player; Chrome has one for answer files only (brief says missing).** Affects: VS Code, Chrome.. Evidence: generatedFiles.ts:340-410.. Work needed: Correct brief; decide scope.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- SYS-voice-and-media
- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-inference-providers
- surface:web
- surface:mobile
- surface:chrome
- surface:desktop
- mode:cloud
- api:GET /api/files/[id]
- table:media_assets

## Unknown

- Whether any transcript data is produced anywhere that a panel could read (voice pipeline not read).
- Chrome and mobile audio plans.
- Mobile player behaviour for failed WebView video (not run).
- How the video behaves in the Tauri tree when run.
- No test results recorded.
