---
id: "F025-04"
type: "feature"
title: "View an image"
aliases: ["Image viewer", "ImageFullScreen", "ZoomableImage", "S25.05 Image viewer", "stored-image", "library thumbnail"]
area: "25 File previews and readers"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "missing", chrome: "built"}
verification: {web: "seen working", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S25.05"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-shared-ui-and-design", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "api:GET /api/files/[id]", "table:media_assets"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F025-04 View an image

Opens an image in a viewer. Web and Electron Desktop show it in the Library overlay with zoom buttons. Mobile opens a full-screen view with pinch, double-tap and pan. The Chrome side panel has a small image viewer for answer files. VS Code has none, and the retained Tauri Library cannot show images.

Area: [25. File previews and readers](README.md). Requirement items: [S25.05](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2505).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | seen working |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | not built | not built | n/a |
| Chrome | built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows a saved or generated image full size. Web: an img inside the file viewer overlay (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1169, 1285-1291). Mobile: ImageFullScreen with a pinch, pan and double-tap hook (apps/mobile/src/features/chat/components/ImageFullScreen.tsx:50; ZoomableImage.tsx:112-213). Chrome: a dialog from generated answer files (apps/extension/src/features/side-panel/mediaViewer.ts:11-30).

**Why it exists.** Generated and uploaded images need to be inspected closely. Brief S25.05.

**Who uses it.** Anyone who generates or uploads images, on web, Electron, mobile, Chrome side panel.

**Problems it solves**

- Seeing detail in a generated image.
- Opening an image without leaving the Library.

**Use cases**

- Click a generated image tile and zoom to 200%.
- Tap an image on mobile and pinch in.
- Open an image in a project knowledge modal.
- Open an answer image from the Chrome side panel.

## 2. User experience

**Where to find it**

- Web and Electron: Library tile 'Open <name>'; viewer labelled '<name> viewer'.
- Web project: knowledge row modal 'Preview: <name>' (image only fits the frame; no zoom).
- Mobile: Library image card opens the full-screen viewer (apps/mobile/src/features/library/index.tsx:374, 1000-1010).
- Chrome: image in an answer file list, button label from 'spMediaViewerOpen' (mediaViewer.ts:55-64).

**Before you start**

- Signed in with a Cloud account.
- The item must be an image type (image/*) (LibraryView.tsx:319-321).

**Screens and controls**

- Web viewer zoom group labelled 'Zoom' with 'Zoom out', percent text and 'Zoom in'; buttons 'Download <name>' and 'Close file viewer' (LibraryView.tsx:1221-1280).
- Mobile: pinch, double-tap, drag to pan, swipe down to dismiss, share and other image actions (ImageFullScreen.tsx imports viewerImageActions, imageViewerDismiss).
- Chrome dialog: close button and Escape (mediaViewer.ts:21-30).

**Journey**

1. Open the Library.
2. Click or tap the image.
3. Zoom or pan.
4. Close with Escape or the close control.

**What the person sees and gets**

- Zoom percent shown (100% default).
- Failed thumbnails fall back to a file icon and the tile may reload the full file (LibraryView.tsx:1531-1534, 1539-1547).
- Mobile unavailable image shows an image-off icon and the label '<name>, image unavailable' (StoredImageView.tsx:28-49).

**Settings**

- None found in the code for the image viewer.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: img with transform scale from 25 to 400 in steps of 25, buttons disable at the limits (LibraryView.tsx:1142-1145, 1221-1250, 1285-1291). Escape closes (line 1183-1188).
- Electron Desktop uses the hosted web app (apps/desktop/electron/main.ts:1065-1066).
- Mobile: pinch from 1x to 5x, double-tap between 1x and 2.5x, clamped pan (apps/mobile/src/features/chat/components/ZoomableImage.tsx:13-14, 112-183, 213); Library tap runs handleOpenImage (index.tsx:374).
- Mobile file sheet also draws an image through ZoomableImage with StoredImageView (ArtifactViewer.tsx:78-87).
- Chrome: image up to 12 MB of png, jpeg, webp, gif loads as a data URL and opens in a dialog (generatedFiles.ts:32-38, 426-429; mediaViewer.ts:11).

**Incomplete**

- Web zoom is a CSS scale inside an overflow area: no drag-to-pan, no reset or fit button, no keyboard zoom found.
- Project modal image has no zoom (FilePreviewModal.tsx:397-408).

**Present but disconnected or switched off**

- Tauri DesktopLibrary: no inlinePreviewUri, so image tiles have no thumbnails and the viewer shows 'Preview isn’t available for this file inline.' [inferred]; its own image dialog is unreachable (DesktopLibrary.tsx:181, 292-300; LibraryView.tsx:267, 1491-1493).

**Not available**

- VS Code: no image viewer found in apps/extension-vscode/src/features/artifacts.
- CLI: no image view (library show reads text only); download works.

## 4. Required behaviour

**Established requirements**

- Images open in a viewer. (source: S25.05)
- Viewers offer zoom controls. (source: S25.14)
- Mobile uses a full-screen or native route for viewers. (source: doc: docs/product/experience-contract.md:507-509)

**Acceptance criteria**

1. Clicking an image tile on web opens the viewer showing the image at 100%.
2. Zoom in goes 100 to 125 and disables at 400; Zoom out disables at 25.
3. Escape closes the viewer.
4. On mobile, pinch zooms up to 5x and double-tap toggles 2.5x.
5. A broken image shows a fallback, not a blank tile.
6. [proposed] Web zoom supports drag-to-pan and a Fit control.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Download of the original must remain available from the viewer [inferred from the header button].

**Proposed improvements** (suggestions, not requirements)

- Add pan and fit to the web viewer; add zoom to the project modal image.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | FileViewerOverlay | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Image branch and zoom state (lines 1142-1291). |
| component | Library grid tile | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Thumbnail and fallback (lines 1491-1545). |
| component | Web LibraryView host | `apps/web/features/library/components/LibraryView.tsx` | inlinePreviewUri returns the file URL (line 158). |
| endpoint | GET /api/files/[id] | `apps/web/app/api/files/[id]/route.ts` | Serves image bytes inline with allowance check. |
| endpoint | GET /api/files/[id]/thumbnail | `apps/web/app/api/files/[id]/thumbnail/route.ts` | Tile thumbnail route (folder exists; contents not read). |
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Lists items with thumbnail_uri (line 76). |
| component | FilePreviewModal | `apps/web/features/projects/components/FilePreviewModal.tsx` | Image in project modal (lines 397-408). |
| component | ImageFullScreen | `apps/mobile/src/features/chat/components/ImageFullScreen.tsx` | Mobile full-screen image viewer with dismiss and actions. |
| hook | useImageZoom and ZoomableImage | `apps/mobile/src/features/chat/components/ZoomableImage.tsx` | Pinch, pan, double-tap; MAX_ZOOM 5, STEP_ZOOM 2.5. |
| component | StoredImageView | `apps/mobile/src/features/chat/components/artifact-viewers/StoredImageView.tsx` | Authorised image with unavailable state. |
| screen | Mobile Library | `apps/mobile/src/features/library/index.tsx` | handleOpenImage and ImageFullScreen mount. |
| service | libraryClient | `apps/mobile/src/features/library/libraryClient.ts` | libraryAssetKind sorts items into image, video, document (lines 55-60). |
| component | Chrome media viewer | `apps/extension/src/features/side-panel/mediaViewer.ts` | Dialog image viewer. |
| component | Chrome answer files | `apps/extension/src/features/side-panel/generatedFiles.ts` | Loads image data URL and Open and Download actions. |
| component | DesktopLibrary (Tauri tree) | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Authenticated transport; image dialog unreachable. |
| service | Electron window URL | `apps/desktop/electron/main.ts` | Loads the hosted web app. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Click sets the viewer item for a previewable image. | device | LibraryView.tsx:810 |
| The img src is the file URL; the browser sends the session cookie. | device | LibraryView.tsx:1169, 1285-1291 |
| Server verifies the asset, applies the download allowance and returns the bytes inline. | our servers | apps/web/app/api/files/[id]/route.ts:205-228, 312-353 |
| Bytes read from private storage. | outside service | route.ts:312 |
| Zoom is applied in the browser by CSS scale. | device | LibraryView.tsx:1288 |
| Mobile fetches the image with the token and draws it with the gesture hook. | device and our servers | StoredImageView.tsx:24-25; ZoomableImage.tsx:112-213 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Image bytes | Cloud storage (table media_assets); browser or app cache | Cloud is source | Web response is private no-store (route.ts:344); mobile cache policy for images not read (unknown) |
| Thumbnails | Cloud (thumbnail route) | Server | unknown |

**Models and providers.** No model is used to show an image. Mobile image actions (edit, remix) use generation providers outside this feature (SYS-voice-and-media).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in with a Cloud account. |
| Permissions | Workspace-scoped read. |
| Subscription | Serving image bytes spends the plan's monthly download allowance and the Free daily cap, except images the owner generated, which are metered but not charged to the allowance (route.test.ts:248-262; tier-unit-quota-service.ts:472-479). |
| Limits and metering | 30 MB serve cap (route.ts:45); egress recorded (route.ts:330-336). |
| Feature flags | none found in the code |
| Model compatibility | Not model dependent. |
| Provider restrictions | Not provider dependent. |
| Local mode | Library images are Cloud files. Mobile can show an on-device file:// image in place (viewerKind.ts:30-33). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Browser loads the img; no spinner in the viewer. Mobile fades in over 200 ms. | LibraryView.tsx:1285; StoredImageView.tsx:53-55 |
| Image fails | Tile falls back to icon and retries with the full file; mobile shows image-off icon. | LibraryView.tsx:1531-1534; StoredImageView.tsx:48-50 |
| Zoom limits | Buttons disabled at 25 and 400. | LibraryView.tsx:1228-1248 |
| Download allowance used up | Server refuses; image does not draw; message handling in the viewer not handled in the code. | route.ts:328 |
| Signed out or session switch (mobile) | Actions check the account scope and close the viewer. | apps/mobile/src/features/library/index.tsx:374-381, 436-440 |
| Accessibility | Alt text is the file name; zoom buttons labelled; mobile image has role image and label. | LibraryView.tsx:1286; StoredImageView.tsx:32-35 |
| Reduced motion | Mobile viewer reads a reduce-motion setting. | ImageFullScreen.tsx imports useReduceMotion |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: 'offers zoom for an image with an inline preview and none for a document' (100% to 125%), Escape close.
- `apps/mobile/__tests__/ImageFullscreenAuthShare.test.tsx`: Image full-screen auth and share (file exists; contents not read).
- `apps/mobile/__tests__/FullScreenViewerChrome.test.tsx`: Viewer chrome (file exists; contents not read).
- `apps/desktop/src/features/library/__tests__/DesktopLibrary.test.tsx`: Transport auth and that inlinePreviewUri is undefined.
- `apps/web/app/api/files/[id]/__tests__/route.test.ts`: Image served inline; owner-generated image allowance rule.

**Test scenarios**

- **Web zoom**
  1. Open an image in the Library viewer.
  2. Click Zoom in until disabled.
  3. Click Zoom out until disabled.
  - Expected: Percent steps 100 to 400, then down to 25; buttons disable at ends.
- **Mobile gestures**
  1. Open an image on a phone.
  2. Pinch, double-tap, drag, swipe down.
  - Expected: Zoom to 5x max, toggle 2.5x, pan clamped, dismiss on swipe at 1x.
- **Broken image**
  1. Delete the stored object, open the tile.
  - Expected: Fallback shown; viewer does not crash.
- **Free daily cap**
  1. On Free use up daily downloads then open an uploaded image.
  - Expected: Bytes refused; record the on-screen result.
- **Tauri desktop**
  1. In the retained Tauri build open a Library image.
  - Expected: Record what shows (analysis predicts the 'Preview isn’t available' fallback).

**Where to look when it fails**

- Network status of /api/files/<id> and /thumbnail.
- Mobile Alert texts in Library index.tsx.
- Table media_assets rows (deleted_at, mime_type).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/025-file-previews-and-readers.md](../../70-qa/test-plans/web/025-file-previews-and-readers.md)
- Desktop: [70-qa/test-plans/desktop/025-file-previews-and-readers.md](../../70-qa/test-plans/desktop/025-file-previews-and-readers.md)
- Mobile: [70-qa/test-plans/mobile/025-file-previews-and-readers.md](../../70-qa/test-plans/mobile/025-file-previews-and-readers.md)
- No hands-on plan yet for Chrome: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **Web zoom has no pan, fit or reset.** Affects: Web and Electron users.. Evidence: LibraryView.tsx:1221-1250, 1285-1291.. Work needed: Add pan and fit.
- **Tauri Library cannot show images.** Affects: Retained Tauri tree.. Evidence: DesktopLibrary.test.tsx:162-180.. Work needed: Wire authenticated blob URLs.
- **No image viewer in VS Code; Chrome viewer has no zoom found.** Affects: VS Code, Chrome.. Evidence: mediaViewer.ts lines 1-65; artifacts folder.. Work needed: Decide scope.
- **Project modal image has no zoom.** Affects: Web project users.. Evidence: FilePreviewModal.tsx:397-408.. Work needed: Reuse the Library viewer.
- **Brief says Chrome image viewer is missing; one exists for answer files.** Affects: Brief accuracy.. Evidence: mediaViewer.ts:11.. Work needed: Correct the row.
- Not built on: VS Code (from the capability ledger).

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-shared-ui-and-design
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- api:GET /api/files/[id]
- table:media_assets

## Unknown

- Thumbnail route behaviour (handler not read).
- Mobile image cache retention.
- What the Tauri Library shows for an image when run.
- Whether the Chrome viewer supports zoom.
- No test results recorded.
