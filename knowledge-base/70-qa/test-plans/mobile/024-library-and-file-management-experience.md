---
id: "PLAN-mobile-024"
type: "test-plan"
title: "Mobile · 24. Library and file-management experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "24"
---
# Mobile · 24. Library and file-management experience

11 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S24.02 Uploaded-files view.

- **Expected:** A view shows only the files the user uploaded.
- **Code:** done. Evidence present: apps/mobile/src/features/library/index.tsx:138; apps/mobile/src/features/library/index.tsx:914
- **Where to find it:** Menu (button at top left) > Library > Uploads (labels found in the code)
- **Needs:** a signed-in account with at least one uploaded file
- **Steps:**
  1. Sign in and open the menu with the button at the top left.
  2. Tap Library.
  3. Tap the chip Uploads in the row under the Library title.
  4. Compare the grid with Expected: only files you uploaded should appear, and no generated files.

## S24.03 Generated-files view.

- **Expected:** A view shows only files the assistant generated.
- **Code:** done. Evidence present: apps/mobile/src/features/library/index.tsx:139; apps/mobile/src/features/library/index.tsx:919
- **Where to find it:** Menu (button at top left) > Library > Generated files (labels found in the code)
- **Needs:** a signed-in account with at least one generated file
- **Steps:**
  1. Sign in and open the menu with the button at the top left.
  2. Tap Library.
  3. Tap the chip Generated files in the row under the Library title.
  4. Compare the grid with Expected: only files the assistant generated should appear.

## S24.04 Artifact view.

- **Expected:** A view lists the user's artifacts and opens each one.
- **Code:** done. Evidence present: apps/mobile/src/features/library/index.tsx:924; apps/mobile/src/features/library/index.tsx:337
- **Where to find it:** Menu (button at top left) > Library > Artifacts (labels found in the code)
- **Needs:** a signed-in account with at least one artifact
- **Steps:**
  1. Sign in and open the menu with the button at the top left.
  2. Tap Library.
  3. Tap the chip Artifacts in the row under the Library title.
  4. Tap one artifact card.
  5. Compare with Expected: the list should show your artifacts and the tapped one should open in the Artifacts screen.

## S24.05 Image collection.

- **Expected:** An Images view collects the user's images and opens each in a viewer.
- **Code:** done. Evidence moved: apps/mobile/src/features/library/index.tsx:924; apps/mobile/src/features/library/index.tsx:205 (quoted code not found in the file now); apps/mobile/src/features/library/index.tsx:1117; apps/mobile/src/features/library/libraryClient.ts:107
- **Where to find it:** Menu (button at top left) > Library > Images (labels found in the code)
- **Needs:** a signed-in account with at least one image
- **Steps:**
  1. Sign in and open the menu with the button at the top left.
  2. Tap Library.
  3. Tap the chip Images in the row under the Library title.
  4. Tap one image card.
  5. Compare with Expected: the Images view should list your images and the tapped image should open full screen in a viewer.

## S24.06 Video collection.

- **Expected:** A Videos view collects the user's videos and plays them.
- **Code:** done. Evidence moved: apps/mobile/src/features/library/index.tsx:924; apps/mobile/src/features/library/index.tsx:337; apps/mobile/src/features/library/index.tsx:218 (quoted code not found in the file now)
- **Where to find it:** Menu (button at top left) > Library > Videos (labels found in the code)
- **Needs:** a signed-in account with at least one video
- **Steps:**
  1. Sign in and open the menu with the button at the top left.
  2. Tap Library.
  3. Tap the chip Videos in the row under the Library title.
  4. Tap one video card.
  5. Compare with Expected: the video should open in a player and play.

## S24.08 Recent-files view.

- **Expected:** A recent-files view surfaces the files used or added most recently.
- **Code:** done. Evidence present: apps/mobile/src/features/library/index.tsx:86; apps/mobile/src/features/library/libraryClient.ts:106
- **Where to find it:** Library > Library options (the ... button at top right) > Sort saved files > Recently added (labels found in the code)
- **Needs:** a signed-in account with several files
- **Steps:**
  1. Sign in and tap Library in the menu.
  2. Tap the ... button at the top right (Library options).
  3. Tap Sort saved files, then Recently added.
  4. Compare with Expected: the newest files should be at the top of the grid.

## S24.13 Search.

- **Expected:** Users can search the Library by name.
- **Code:** done. Evidence present: apps/mobile/src/features/library/index.tsx:1109; apps/mobile/src/features/library/libraryClient.ts:107
- **Where to find it:** Library > search field at the bottom labelled Search library (labels found in the code)
- **Needs:** a signed-in account with several named files
- **Steps:**
  1. Sign in and tap Library in the menu.
  2. Tap the search field at the bottom that says Search library.
  3. Type part of a file name you know exists.
  4. Compare with Expected: the grid should narrow to files whose name matches.

## S24.14 File-type filters.

- **Expected:** Users can filter the Library by file type.
- **Code:** done. Evidence present: apps/mobile/src/features/library/index.tsx:924; apps/mobile/src/features/library/index.tsx:337
- **Where to find it:** Library > filter chips row under the Library title: Images, Videos, Documents, Code, Charts, Research (labels found in the code)
- **Needs:** a signed-in account with files of more than one type
- **Steps:**
  1. Sign in and tap Library in the menu.
  2. Swipe the chip row sideways to reach the chips.
  3. Tap Documents, then Images, then Videos.
  4. Compare with Expected: the grid should show only the chosen file type each time.

## S24.28 Attach to conversation.

- **Expected:** Users can attach a Library file to a conversation.
- **Code:** done. Evidence moved: apps/mobile/src/features/library/index.tsx:385 (quoted code not found in the file now); apps/mobile/src/features/library/index.tsx:528
- **Where to find it:** Library > long press a file card > Add to chat (labels found in the code)
- **Needs:** a signed-in account with a document file
- **Steps:**
  1. Sign in and tap Library in the menu.
  2. Press and hold a document card (not a video).
  3. Tap Add to chat in the menu that opens with the file name as title.
  4. Compare with Expected: the app should open the chat screen with the file attached in the message box.

## S24.33 Storage-consumption display.

- **Expected:** The product shows how much storage the user's files consume against their allowance.
- **Code:** done. Evidence moved: apps/mobile/src/features/library/index.tsx:667 (quoted code not found in the file now); apps/mobile/src/features/library/index.tsx:661 (quoted code not found in the file now)
- **Where to find it:** Library > top of the file grid (text ending in file storage used); and Settings > Storage (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and tap Library in the menu. Look just under the filter chips for a line ending in file storage used.
  2. Compare the amount used with the limit shown in that line.
  3. Open the menu, tap Settings, then tap Storage.
  4. Compare with Expected: the storage breakdown should show how much your files use against the allowance.

## S24.34 Trash and restore.

- **Expected:** Deleted files go to a trash from which they can be restored.
- **Code:** done. Evidence moved: apps/mobile/src/features/library/index.tsx:168 (quoted code not found in the file now); apps/mobile/src/features/library/index.tsx:580; apps/mobile/src/features/library/libraryClient.ts:170
- **Where to find it:** Library > Library options (... at top right) > Recently deleted; to delete: long press a file > Delete (labels found in the code)
- **Needs:** a signed-in account with at least one file
- **Steps:**
  1. Sign in, tap Library in the menu, then long press a file card and tap Delete.
  2. Tap Delete on the Delete from Library? dialog.
  3. Tap Library options (... at top right), then Recently deleted.
  4. Long press the file, tap Restore, then go back to Library and check the file is back in the grid.
