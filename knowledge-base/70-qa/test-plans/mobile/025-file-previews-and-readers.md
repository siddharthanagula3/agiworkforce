---
id: "PLAN-mobile-025"
type: "test-plan"
title: "Mobile · 25. File previews and readers"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "25"
---
# Mobile · 25. File previews and readers

8 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S25.05 Image viewer.

- **Expected:** Images open in a viewer.
- **Code:** done. Evidence moved: apps/mobile/src/features/library/index.tsx:1117; apps/mobile/src/features/chat/components/ImageFullScreen.tsx:50 (quoted code not found in the file now); apps/mobile/src/features/library/index.tsx:374
- **Where to find it:** Open navigation drawer > Library > tap an image tile (labels found in the code)
- **Needs:** an image in Library (generated or uploaded)
- **Steps:**
  1. Open the navigation drawer (the icon button labelled 'Open navigation drawer' in apps/mobile/src/shared/components/DrawerButton.tsx; its position on screen was not verified) and tap Library.
  2. Tap any image tile in the Library grid.
  3. Look for a full-screen black viewer that shows the image, with a row of icon buttons at the top and a Close (X) button at the top right.
  4. Tap Close to return to the grid and compare with Expected: images open in a viewer.

## S25.07 Video player.

- **Expected:** Video files play in an in-product player.
- **Code:** done. Evidence present: apps/mobile/src/features/library/index.tsx:1144; apps/mobile/src/features/library/index.tsx (text found, layout changed)
- **Where to find it:** Open navigation drawer > Library > tap a video file card (labels found in the code)
- **Needs:** a video in Library
- **Steps:**
  1. Open the navigation drawer and tap Library.
  2. Tap a video file card in the Library grid.
  3. Wait for the video player to open over the Library screen, then press play.
  4. Check that the video plays inside the app and compare with Expected: video files play in an in-product player. If it fails, the alert 'Could not play the video' appears.

## S25.14 Zoom controls.

- **Expected:** Viewers offer zoom controls.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ImageFullScreen.tsx:50 (quoted code not found in the file now); apps/mobile/src/features/library/index.tsx:1117; apps/mobile/src/features/library/index.tsx:374
- **Where to find it:** Open navigation drawer > Library > tap an image tile (labels found in the code)
- **Needs:** an image in Library, and a phone or touch screen for pinch and double-tap
- **Steps:**
  1. Open the navigation drawer, tap Library, and tap an image tile to open the viewer.
  2. Pinch two fingers apart on the image, then pinch them together.
  3. Double-tap the image to zoom in, then double-tap again to zoom out.
  4. Compare with Expected: viewers offer zoom. Zoom is by gesture only.

## S25.25 Full-screen mode.

- **Expected:** Viewers offer a full-screen mode.
- **Code:** done. Evidence moved: apps/mobile/src/features/library/index.tsx:1117; apps/mobile/src/features/chat/components/ImageFullScreen.tsx:50 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageBubble.tsx:3204; apps/mobile/src/features/library/index.tsx:374
- **Where to find it:** not found in the code. No full-screen toggle was found: the image viewer always opens as a full-screen modal, and the only 'full screen' wording is the fallback label 'Full screen generated image' in apps/mobile/src/features/chat/components/ImageFullScreen.tsx. I searched apps/mobile/src for 'full screen', 'fullscreen' and 'Full-screen' in the library, chat and file viewer folders.

## S25.26 Download original.

- **Expected:** Users can download the original file.
- **Code:** done. Evidence moved: apps/mobile/src/features/library/index.tsx:140 (quoted code not found in the file now); apps/mobile/services/fileCreation.ts:364
- **Where to find it:** Open navigation drawer > Library > long-press a file > Share (labels found in the code)
- **Needs:** a file in Library (an uploaded or generated file)
- **Steps:**
  1. Open the navigation drawer and tap Library.
  2. Long-press a file card or image tile in the grid to open the action menu.
  3. Tap Share. The app downloads the file to the phone and opens the system share sheet.
  4. Compare with Expected: the original file can be downloaded. In the share sheet, check the save options the phone provides.

## S25.28 Copy selected content.

- **Expected:** Users can copy selected content from a preview.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** device
- **Where to find it:** Open navigation drawer > Library > tap a CSV file > tap a cell > Copy cell (labels found in the code)
- **Needs:** a device, and a CSV file in Library
- **Steps:**
  1. Open the navigation drawer, tap Library, and tap a CSV file.
  2. Tap a cell in the grid to select it.
  3. Tap Copy cell, then paste into another app such as Notes.
  4. Compare with Expected: copied content matches the selected cell. Plain text files also allow long-press selection of lines and the system Copy menu (apps/mobile/src/features/chat/components/artifact-viewers/TextFileView.tsx).

## S25.29 Open in native application.

- **Expected:** Users can open a file in its native application.
- **Code:** done. Evidence moved: apps/mobile/src/features/library/index.tsx:140 (quoted code not found in the file now); apps/mobile/services/fileCreation.ts:364
- **Where to find it:** Open navigation drawer > Library > tap an Office file > Share (labels found in the code)
- **Needs:** an Office document in Library
- **Steps:**
  1. Open the navigation drawer, tap Library, and tap an Office document.
  2. Look for the message 'Open it in another app to read it.' with a Share button.
  3. Tap Share to open the system share sheet, which lists apps that can open the file.
  4. Compare with Expected: the file opens in another app. The file viewer header also has a share icon labelled 'Share' plus the file name (apps/mobile/src/features/chat/components/artifact-viewers/FileViewerScreen.tsx).

## S25.30 Unsupported-preview fallback.

- **Expected:** When a file cannot be previewed, the product says so and offers download/open.
- **Code:** done. Evidence moved: apps/mobile/src/features/library/index.tsx:140 (quoted code not found in the file now); apps/mobile/services/fileCreation.ts:364
- **Where to find it:** Open navigation drawer > Library > tap a file the viewer cannot render (labels found in the code)
- **Needs:** a file in Library of a type with no in-app preview
- **Steps:**
  1. Open the navigation drawer, tap Library, and tap a file type that has no preview.
  2. Look for the message 'Preview isn’t available for this file type.' with a Share button.
  3. Tap Share to hand the file to another app through the system share sheet.
  4. Compare with Expected: the app says there is no preview and offers Share as the download or open path.
