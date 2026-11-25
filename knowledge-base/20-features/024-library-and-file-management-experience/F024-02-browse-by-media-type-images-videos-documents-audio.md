---
id: "F024-02"
type: "feature"
title: "Browse by media type: Images, Videos, Documents, Audio"
aliases: ["Images / Videos / Documents tabs", "Media type filter", "File-type filters", "Image collection", "Video collection", "Audio collection", "S24.05", "S24.06", "S24.07", "S24.14"]
area: "24 Library and file-management experience"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "seen working", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S24.05", "S24.06", "S24.07", "S24.14"]
depends_on: ["F024-01", "F024-04", "SYS-files-artifacts-and-storage", "SYS-voice-and-media", "SYS-api-and-contracts", "SYS-shared-ui-and-design", "table:media_assets", "api:GET /api/library", "surface:web", "surface:mobile", "surface:desktop"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F024-02 Browse by media type: Images, Videos, Documents, Audio

Quick filters by kind of file. Web and Electron desktop have Images, Videos and Documents tabs; mobile has the same three chips. Images and videos open in a viewer or player. There is no Audio view, kind or viewer anywhere. CLI, VS Code and Chrome have none of this.

Area: [24. Library and file-management experience](README.md). Requirement items: [S24.05](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2405), [S24.06](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2406), [S24.07](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2407), [S24.14](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2414).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | seen working |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows only pictures, only videos, or only documents from the account's stored files, and opens them in a viewer. Server filtering is by the stored kind column (image, video, file). (packages/contracts/cloud-contracts/src/library.ts:8-9; apps/web/lib/server/media-assets.ts:407-410)

**Why it exists.** Generated images and videos make the Library large; people want to look only at pictures or only at documents. The brief asks for Images, Videos, Audio and file-type filters (S24.05, S24.06, S24.07, S24.14).

**Who uses it.** Signed-in people on web, Electron desktop and mobile who generate or upload media.

**Problems it solves**

- Scrolling past documents to find a picture.
- Playing a generated video from the Library.
- Reusing an image: remix or add to chat from the viewer or item menu.

**Use cases**

- Open /chat/library?tab=images to jump to pictures (apps/web/features/library/components/LibraryView.tsx:137-139).
- Tap Videos chip on mobile and play a clip in the player modal (apps/mobile/src/features/library/index.tsx:1135-1141).
- Click a document tile on web to open the in-page viewer with a text preview (LibraryView.tsx:1201-1260 area).
- Look for an audio recording: not possible today.

## 2. User experience

**Where to find it**

- Web and Electron desktop: tabs Images, Videos, Documents in the 'Filter the library' row (packages/ui/unified-chat/src/components/library/LibraryView.tsx:91-99).
- Mobile: chips Images, Videos, Documents (apps/mobile/src/features/library/index.tsx:897-912).
- CLI, VS Code, Chrome: not available.

**Before you start**

- Signed in.
- For Videos: a generated video must exist; mobile Videos empty copy says 'Videos you generate will appear here' (index.tsx:1262-1287).

**Screens and controls**

- Web viewer: dialog labelled '<name> viewer' with Zoom out, Zoom in, 'Download <name>', 'Close file viewer', 'Ask about this file' box (LibraryView.tsx:1201-1370).
- Mobile: ImageFullScreen for images, VideoPlayerModal for videos, FileViewerScreen for documents (index.tsx:1118-1153).
- Item actions menu 'Actions for <name>' on web (LibraryView.tsx:1763-1776); mobile action sheet with Add to chat, Remix, Open chat, Share, Report, Delete (index.tsx:625-652).

**Journey**

1. Open the Library.
2. Click or tap Images, Videos or Documents.
3. The list reloads for that kind (web: server filter; mobile: client filter over the loaded page).
4. Click an item to open the viewer or player.
5. Close the viewer, or use Download or Ask about this file.

**What the person sees and gets**

- Empty copy on mobile: 'Images you generate or upload will appear here', 'Videos you generate will appear here', 'Files you attach or generate will appear here for reuse' (index.tsx:1262-1287).
- A file that fails to load: 'This file is unavailable right now. Try again later, or remove this entry.' (LibraryView.tsx:1515,1646).
- Generated images and videos are named by their prompt instead of image.jpg (LibraryView.tsx:libraryItemDisplayName near 150).

**Settings**

- Web grid or list layout (see F024-04). No other setting found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: Images sends kind=image, Videos kind=video, Documents kind=file with surface=file (packages/ui/unified-chat/src/components/library/LibraryView.tsx:108-116).
- Server filters 'kind = any(...)' and accepts several kinds in one request (apps/web/lib/server/media-assets.ts:407-410; apps/web/app/api/library/__tests__/route.test.ts).
- Contract rejects a kind that is not image, video or file (packages/contracts/cloud-contracts/src/library.ts:91-94,101-103).
- Mobile classifies each row as image, video or document from kind or mime type (apps/mobile/src/features/library/libraryClient.ts:57-62) and filters rows by that class (index.tsx:328-345).
- Mobile opens images full screen, videos in a player, documents in FileViewerScreen (index.tsx:1118-1153).

**Incomplete**

- Mobile Images, Videos, Documents chips use scope {} on the server and filter only the loaded pages, so a rare kind may need 'Show more' paging to appear (apps/mobile/src/features/library/index.tsx:136-142,328-345). [inferred]
- There is no finer file-type filter (by extension or by pdf, spreadsheet, slides) in any UI, although the contract defines resource types (library.ts:16-28).

**Present but disconnected or switched off**

- LIBRARY_RESOURCE_TYPES includes 'audio' and the classifier can return it, but GET /api/library does not read resource_type and no tab uses it (library.ts:16-28,47-60; route.ts:155-163).

**Not available**

- Audio view, kind and viewer: none on any app (library.ts:8 lists only image, video, file; no Audio tab in TABS).
- CLI, VS Code and Chrome media-type views (doc: docs/product/surface-feature-matrix.md:197-199).

## 4. Required behaviour

**Established requirements**

- An Images view collects the user's images and opens each in a viewer. (source: S24.05 (brief))
- A Videos view collects the user's videos and plays them. (source: S24.06 (brief))
- An Audio view collects the user's audio files. (source: S24.07 (brief))
- Users can filter the Library by file type. (source: S24.14 (brief))
- Uploaded and generated files appear once with accurate type and size. (source: doc: docs/product/experience-contract.md:784)

**Acceptance criteria**

1. Images tab lists only rows with kind image, and the image opens in a viewer.
2. Videos tab lists only video rows and a video plays.
3. Documents tab lists kind-file rows with surface file and excludes artifacts.
4. An unknown kind value in the URL returns a validation error, not an unfiltered list.
5. A file that cannot be fetched shows the unavailable message with a way to remove it.
6. An audio file is either listed under an Audio view or documented as unsupported.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- An audio file uploaded today is stored as kind 'file' (mediaKindFor returns file for non-image, non-video mime) and so would show under Documents, not Audio. [inferred from apps/web/lib/server/generated-file-persist.ts mediaKindFor]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an Audio tab by wiring resource_type=audio through the route.
- [proposed] Move mobile media filters to the server with kind.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Shared LibraryView tabs and QUERY_BY_TAB | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Maps Images, Videos, Documents tabs to server filters. |
| component | FileViewerOverlay | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Web viewer with zoom, download and Ask about this file. |
| component | FileKindIcon | `packages/ui/unified-chat/src/components/library/FileKindIcon.tsx` | Icon per file kind. |
| component | FileTextPreview | `packages/ui/unified-chat/src/components/library/FileTextPreview.tsx` | Text and table preview of a document. |
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Applies kind filter and marks previewable items. |
| service | listLibraryAssets | `apps/web/lib/server/media-assets.ts` | kind = any(...) filter. |
| schema | LIBRARY_KINDS and LIBRARY_RESOURCE_TYPES | `packages/contracts/cloud-contracts/src/library.ts` | Allowed kinds and unused resource types. |
| service | file-text-preview | `apps/web/lib/server/file-text-preview.ts` | Decides which files have a text preview. |
| service | library-thumbnail | `apps/web/lib/server/library-thumbnail.ts` | Small thumbnails for stored pictures. |
| screen | Mobile LibraryScreen | `apps/mobile/src/features/library/index.tsx` | Mobile chips, tiles and viewers. |
| service | libraryAssetKind | `apps/mobile/src/features/library/libraryClient.ts` | Classifies a row as image, video or document. |
| hook | useLibraryThumbnail | `apps/mobile/src/features/library/useLibraryThumbnail.ts` | Loads tile thumbnails. |
| component | FileViewerScreen | `apps/mobile/src/features/chat/components/artifact-viewers/FileViewerScreen.tsx` | Mobile document viewer. |
| component | VideoPlayerModal | `apps/mobile/src/features/chat/components/VideoPlayerModal.tsx` | Mobile video player. |
| component | DesktopLibrary preview dialog | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Tauri preview for pdf, image, text; others say 'Preview unavailable'. |
| endpoint | GET /api/files/{id} | `apps/web/app/api/library/route.ts` | The uri the list gives for each file's bytes (route.ts:75); handler file not opened. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Click Images/Videos/Documents; shared view sets kind (and surface for Documents) in the query. | device | packages/ui/unified-chat/src/components/library/LibraryView.tsx:108-116,452-458 |
| Server filters media_assets by kind and returns items with previewable flag and thumbnail uri. | our servers | apps/web/app/api/library/route.ts:51-58,66-89 |
| Opening an item fetches bytes from /api/files/<id> (or text from <uri>/text) with the session. | device and our servers | apps/web/features/library/components/LibraryView.tsx:156-159 |
| Mobile fetches the same page, then filters rows by class on the device. | device | apps/mobile/src/features/library/index.tsx:328-345 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Image, video and document bytes and metadata | Stored media (storeMedia) plus row in media_assets | Server-held; apps read via API. | Soft delete 30 days then permanent (apps/web/lib/server/media-assets.ts:693-770). |
| Thumbnails | Served from a thumbnail path per row | Server generated | unknown |

**Models and providers.** Filtering uses no model. Rows record the provider and model that generated an image or video; the item menu offers Remix, which calls image generation through the cloud route (apps/mobile/src/features/library/index.tsx:629-631). Generation is cloud-mode only on mobile.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. |
| Permissions | Own rows only; organization-scoped. |
| Subscription | No filter is plan-gated (none found). Downloading a file counts against a monthly download allowance by plan (apps/web/lib/services/tier-unit-quota-service.ts:446-463,500-516). |
| Limits and metering | Download byte allowance per month for a plan; storage allowance meter on the page. |
| Feature flags | Mobile image area edit needs FEATURES.imageGen (index.tsx:1122). |
| Model compatibility | Any generating model; the Library does not depend on one. |
| Provider restrictions | none found in the code. |
| Local mode | Server media is Cloud-only. Mobile Add to chat and Remix are shown only in cloud app mode (index.tsx:626-631). Local files on the device are not in this list: unknown beyond that. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| File cannot be loaded | Tile shows 'This file is unavailable right now. Try again later, or remove this entry.' | LibraryView.tsx:1515,1646 |
| Large or unsupported file | Tauri preview shows 'Preview unavailable'; web says a file too large to preview offers download (doc: apps/web/content/support/library.md). | apps/desktop/src/features/library/DesktopLibrary.tsx |
| Video fails to play on mobile | Hint 'Long-press the video and choose Share to open it in another app.' | index.tsx:1143 |
| Empty kind | Mobile per-kind empty copy; web generic empty state. | index.tsx:1262-1287; LibraryView.tsx:2226 |
| Account switch on mobile | Open image, video and file viewers close. | index.tsx:380-410 (useLayoutEffects) |
| Timeout or offline | not handled in the code beyond the load error and Retry. | LibraryView.tsx:1068-1082 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/library/__tests__/route.test.ts`: Several kinds in one request, unknown kind rejected, video previewable flag, thumbnail offer.
- `apps/web/features/library/components/__tests__/LibraryView.test.tsx`: Tab kinds sent to server, grid tiles.
- `apps/mobile/__tests__/LibraryFileOpen.test.tsx`: Opening files from mobile Library (title only).
- `apps/mobile/__tests__/LibraryThumbnailTiles.test.tsx`: Mobile thumbnail tiles.
- `apps/mobile/__tests__/LibraryThumbnailPath.test.tsx`: Thumbnail path handling.
- `packages/contracts/cloud-contracts/src/__tests__/library.test.ts`: Resource type classifier and schemas.
- `apps/mobile/__tests__/library-generated-images.test.ts`: Generated image collection helper.

**Test scenarios**

- **Images tab**
  1. Open /chat/library, click Images.
  - Expected: Request has kind=image; only images shown; clicking one opens the viewer.
- **Documents excludes artifacts**
  1. Save an artifact, upload a PDF, click Documents.
  - Expected: PDF listed, artifact absent (surface=file).
- **Video play on mobile**
  1. Generate a video in cloud mode.
  2. Library, Videos chip, tap the tile.
  - Expected: Player opens and plays; on failure the Share hint shows.
- **Audio upload**
  1. Upload an mp3 in chat.
  2. Open Library tabs.
  - Expected: Today: no Audio tab; the file is expected under Documents [inferred]. Record what you see.
- **Bad kind**
  1. Call GET /api/library?kind=audio while signed in.
  - Expected: Validation error response, not a list.

**Where to look when it fails**

- Error text 'Unexpected response shape' for contract failure.
- Server logs from route.ts for meter reads.
- media_assets.kind and mime_type columns.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/024-library-and-file-management-experience.md](../../70-qa/test-plans/web/024-library-and-file-management-experience.md)
- Desktop: [70-qa/test-plans/desktop/024-library-and-file-management-experience.md](../../70-qa/test-plans/desktop/024-library-and-file-management-experience.md)
- Mobile: [70-qa/test-plans/mobile/024-library-and-file-management-experience.md](../../70-qa/test-plans/mobile/024-library-and-file-management-experience.md)

## 10. Gaps and dependencies

- **No Audio view, kind or viewer.** Affects: all apps. Evidence: library.ts:8 (kinds) and TABS list; S24.07 missing on all apps. Work needed: Add audio to kinds or wire resource_type, add tab and player.
- **No finer file-type filter (PDF, spreadsheet, slides).** Affects: web, desktop, mobile. Evidence: resource_type unused (library.ts:16-28, route.ts:155-163). Work needed: Accept resource_type in the route and add controls.
- **Mobile media filters are client-side over loaded pages.** Affects: mobile. Evidence: index.tsx:136-142,328-345. Work needed: Send kind to the server.
- **CLI, VS Code and Chrome have no media views.** Affects: cli, vscode, chrome. Evidence: docs/product/surface-feature-matrix.md:197-199. Work needed: Decide whether they need one (matrix says absent by design for CLI).
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F024-01
- F024-04
- SYS-files-artifacts-and-storage
- SYS-voice-and-media
- SYS-api-and-contracts
- SYS-shared-ui-and-design
- table:media_assets
- api:GET /api/library
- surface:web
- surface:mobile
- surface:desktop

## Unknown

- Where /api/files/{id} serves bytes and what authorization it applies (handler not opened).
- How thumbnails are created and retained.
- Whether any audio mime type is blocked at upload.
