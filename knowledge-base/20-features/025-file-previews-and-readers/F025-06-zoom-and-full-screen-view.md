---
id: "F025-06"
type: "feature"
title: "Zoom and full-screen view"
aliases: ["Zoom controls", "Full-screen mode", "File viewer overlay", "S25.14 Zoom controls", "S25.25 Full-screen mode", "Zoom group"]
area: "25 File previews and readers"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "missing", chrome: "missing"}
verification: {web: "partly seen (1 of 2)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S25.14", "S25.25"]
depends_on: ["F025-04", "SYS-shared-ui-and-design", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "SYS-files-artifacts-and-storage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F025-06 Zoom and full-screen view

Lets a person enlarge an image and view content full screen. Web and Electron show a full-window overlay with zoom buttons for images (25 to 400 percent). Mobile uses a full-screen sheet and pinch zoom up to 5 times. Web artifact preview also has a real full-screen mode. PDFs, text and video have no zoom control.

Area: [25. File previews and readers](README.md). Requirement items: [S25.14](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2514), [S25.25](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2525).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 2) |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Provides zoom buttons in the Library viewer for images (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1142-1145, 1221-1250), a full-window overlay (lines 1197-1208), mobile pinch zoom (apps/mobile/src/features/chat/components/ZoomableImage.tsx:112-213) and a web artifact full-screen toggle that uses the browser's full-screen request (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1796-1797).

**Why it exists.** Detail and focus: people need to enlarge content and remove distractions. Brief S25.14 and S25.25.

**Who uses it.** Web, Electron, mobile users viewing images, files and artifacts.

**Problems it solves**

- Reading fine detail in an image.
- Focusing on one file.

**Use cases**

- Zoom a chart image to 300% on web.
- Pinch into a photo on mobile.
- Expand an artifact preview to full screen on web.
- Open a project file as a full-screen sheet on mobile.

## 2. User experience

**Where to find it**

- Web and Electron Library viewer: group 'Zoom' in the header (image only).
- Web artifact preview: Maximize control (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:25, 557, 1796).
- Mobile: full-screen image viewer and file sheet (FileViewerScreen uses a page sheet with full-screen chrome).

**Before you start**

- Signed in with a Cloud account for Library files; an image for zoom.

**Screens and controls**

- 'Zoom out', percent text, 'Zoom in' (LibraryView.tsx:1228-1248).
- Header 'Close file viewer'; Escape closes (line 1183-1188).
- Mobile close control 'Close file' and swipe down (FileViewerScreen.tsx:24, 94-98).

**Journey**

1. Open an image.
2. Press Zoom in or pinch.
3. Pan or scroll.
4. Close.

**What the person sees and gets**

- Percent text updates (100 default).
- Buttons disable at 25 and 400.

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web zoom 25 to 400, step 25, default 100, applied as a CSS scale; shown only when the item is an image with an inline preview address (LibraryView.tsx:1142-1145, 1169, 1221, 1288).
- The viewer is a fixed full-window dialog with a scrim, not browser full-screen (LibraryView.tsx:1197-1208). A host can place it inside a container via containerId (lines 1178-1181, 1381).
- Mobile pinch 1x to 5x, double-tap 2.5x, pan clamp (ZoomableImage.tsx:13-14, 112-183).
- Web ArtifactPreview calls the browser full-screen request and handles leaving through Escape (ArtifactPreview.tsx:767-790, 1796-1797).
- Electron Desktop uses the web app (apps/desktop/electron/main.ts:1065-1066).

**Incomplete**

- No zoom on PDF, text, table or video in the shared viewer; no fit or reset.
- Project modal has no zoom (FilePreviewModal.tsx:397-417).
- Mobile text and PDF views offer no app zoom control; the iOS system view and Android WebView may allow pinch (setBuiltInZoomControls in PdfFileView.tsx:182), not verified.

**Present but disconnected or switched off**

- Tauri Library: viewer shows no image to zoom because inlinePreviewUri is not provided [inferred] (DesktopLibrary.test.tsx:178).

**Not available**

- VS Code: no viewer zoom (editor has its own).
- Chrome: image viewer found (mediaViewer.ts) but no zoom control found.

## 4. Required behaviour

**Established requirements**

- Viewers offer zoom controls. (source: S25.14)
- Viewers offer a full-screen mode. (source: S25.25)
- Mobile viewers are full screen or a native route; web has a resizable split pane on capable surfaces. (source: doc: docs/product/experience-contract.md:507-509)

**Acceptance criteria**

1. The Zoom group appears for an image and not for a PDF or text file.
2. Zoom in at 400% is disabled; zoom out at 25% is disabled.
3. The viewer covers the window and Escape closes it.
4. Mobile pinch cannot exceed 5x.
5. Web artifact full-screen enters and leaves with Escape and the button.
6. [proposed] Zoom and fit exist for PDF and text too.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Full-screen on web may mean browser full-screen; the Library overlay is not that [inferred from line 1197-1208 vs ArtifactPreview.tsx:1796].

**Proposed improvements** (suggestions, not requirements)

- One shared zoom control for all file types in the shared viewer.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | FileViewerOverlay | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Zoom state, constants, overlay and Escape handler. |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | isFullscreen state and requestFullscreen (lines 557, 767-790, 1796). |
| component | Web LibraryView host | `apps/web/features/library/components/LibraryView.tsx` | inlinePreviewUri that enables zoom (line 158). |
| hook | useImageZoom | `apps/mobile/src/features/chat/components/ZoomableImage.tsx` | Pinch, pan, double-tap. |
| component | ImageFullScreen | `apps/mobile/src/features/chat/components/ImageFullScreen.tsx` | Full-screen image modal. |
| hook | useFullScreenChrome | `apps/mobile/src/features/chat/chrome/fullScreenChrome.ts` | Back and close chrome for the file viewer (imported in FileViewerScreen.tsx:14-17). |
| component | FileViewerScreen | `apps/mobile/src/features/chat/components/artifact-viewers/FileViewerScreen.tsx` | Page-sheet modal for files. |
| component | Chrome media viewer | `apps/extension/src/features/side-panel/mediaViewer.ts` | Dialog overlay for images. |
| service | Electron window URL | `apps/desktop/electron/main.ts` | Hosted web app. |
| test | LibraryView tests | `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx` | Zoom and close tests. |
| test | Mobile viewer chrome tests | `apps/mobile/__tests__/FullScreenViewerChrome.test.tsx` | Full-screen viewer chrome (not read). |
| component | DesktopLibrary (Tauri tree) | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Retained host without inline preview. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Zoom buttons change React state; the img style scales by percent. | device | LibraryView.tsx:1166, 1228-1248, 1288 |
| Escape key listener closes the overlay. | device | LibraryView.tsx:1183-1188 |
| Mobile gestures run on the device with reanimated values. | device | ZoomableImage.tsx:112-183 |
| Artifact full-screen asks the browser to enter full-screen. | device | ArtifactPreview.tsx:1796-1797 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Zoom level | Component state only | No | Reset on each open (state default 100, line 1166) |

**Models and providers.** None. No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in for Library files. |
| Permissions | none found in the code for zoom itself. |
| Subscription | none found in the code for zoom; the image bytes follow the download allowance (see F025-04). |
| Limits and metering | Zoom 25-400 web, 1-5x mobile. |
| Feature flags | none found in the code |
| Model compatibility | Not model dependent. |
| Provider restrictions | Not provider dependent. |
| Local mode | Zoom works on any image the viewer is given; Library images are Cloud files. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Zoom bounds | Buttons disabled at ends. | LibraryView.tsx:1228, 1243 |
| Non-image item | No zoom group. | LibraryView.tsx:1221, 1169 |
| Leaving full-screen with Escape | Artifact state resyncs on fullscreenchange. | ArtifactPreview.tsx:767-775 |
| Mobile dismiss while zoomed | Dismiss is gated by scale (canDismissAtScale). | ImageFullScreen.tsx imports canDismissAtScale |
| Accessibility | Buttons have aria-labels; group labelled Zoom; mobile close has 44-point target. | LibraryView.tsx:1224-1237; FileViewerScreen.tsx:27-32 |
| Reduced motion | Mobile viewer reads reduce-motion. | ImageFullScreen.tsx imports useReduceMotion |
| Zoom persistence across files | Not handled in the code (state reset per open). | LibraryView.tsx:1166 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Zoom group for an image and not for a document, 100% to 125%, Escape close.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.card.test.tsx`: Artifact preview card behaviours (full-screen coverage not confirmed).
- `apps/mobile/__tests__/FullScreenViewerChrome.test.tsx`: Mobile viewer chrome (not read).
- `apps/mobile/__tests__/FullScreenViewersBlur.test.tsx`: Viewers dismiss on blur (not read).
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/FileViewerScreen.test.tsx`: Sheet chrome, close, swipe down.

**Test scenarios**

- **Zoom limits**
  1. Open an image on web; press Zoom in 12 times, then Zoom out 15 times.
  - Expected: Stops at 400% then 25%; buttons disable.
- **No zoom for PDF**
  1. Open a PDF.
  - Expected: No Zoom group.
- **Artifact full-screen**
  1. Open an artifact preview; press full-screen; press Escape.
  - Expected: Enters and leaves full-screen, button state follows.
- **Mobile pinch**
  1. Pinch beyond 5x.
  - Expected: Capped at 5x.
- **Keyboard**
  1. Tab to the Zoom buttons and press Enter.
  - Expected: Zoom changes; record keyboard zoom shortcuts (none found).

**Where to look when it fails**

- No log lines for zoom; check component state in the browser dev tools.
- Mobile gesture tests.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/025-file-previews-and-readers.md](../../70-qa/test-plans/web/025-file-previews-and-readers.md)
- Desktop: [70-qa/test-plans/desktop/025-file-previews-and-readers.md](../../70-qa/test-plans/desktop/025-file-previews-and-readers.md)
- Mobile: [70-qa/test-plans/mobile/025-file-previews-and-readers.md](../../70-qa/test-plans/mobile/025-file-previews-and-readers.md)

## 10. Gaps and dependencies

- **Zoom only for images; none for PDF, text, tables, video.** Affects: All apps.. Evidence: LibraryView.tsx:1221.. Work needed: Extend per type.
- **No fit or reset and no pan on web.** Affects: Web and Electron.. Evidence: LibraryView.tsx:1285-1291.. Work needed: Add controls.
- **The Library viewer is a window overlay, not full-screen mode.** Affects: Web users wanting true full-screen.. Evidence: LibraryView.tsx:1197-1208.. Work needed: Decide if a full-screen toggle is needed.
- **VS Code and Chrome have no zoom.** Affects: VS Code, Chrome.. Evidence: mediaViewer.ts.. Work needed: Decide scope.
- **Tauri Library cannot show images to zoom.** Affects: Retained Tauri tree.. Evidence: DesktopLibrary.test.tsx:178.. Work needed: Wire inline preview.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- F025-04
- SYS-shared-ui-and-design
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- SYS-files-artifacts-and-storage

## Unknown

- Whether mobile PDF and text views allow system pinch zoom.
- Whether the web artifact full-screen is covered by a test.
- Whether keyboard zoom shortcuts are intended.
- Which hosts pass containerId.
- No test results recorded.
