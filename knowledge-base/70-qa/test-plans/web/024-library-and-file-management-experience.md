---
id: "PLAN-web-024"
type: "test-plan"
title: "Web · 24. Library and file-management experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "24"
---
# Web · 24. Library and file-management experience

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S24.02 Uploaded-files view.

- **Expected:** A view shows only the files the user uploaded.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:98
- **Earlier check in the running app:** PASS: E049 [PASS; actual upload and filtered result]: Uploaded browser-qa-reference.txt to Library successfully (198 bytes), switched grid to list, searched exact stem and saw only the uploaded file. Project knowledge plan gate is distinct from Library upload.
- **Where to find it:** Sidebar > Library > Uploads tab (under the Filter the library tabs) (labels found in the code)
- **Needs:** a file to upload
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Click the Uploads tab.
  3. Compare: only files you uploaded are listed. Upload a file first with the Add to the library control if none exist.

## S24.03 Generated-files view.

- **Expected:** A view shows only files the assistant generated.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:99; packages/ui/unified-chat/src/components/library/LibraryView.tsx:115; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1014; apps/web/app/api/library/route.ts:168
- **Earlier check in the running app:** PASS: E101 [PASS; read-only filter interaction]: Generated files filter lists prior generated assets. Existing assets are not proof generation works in the current plan.
- **Where to find it:** Sidebar > Library > Generated files tab (labels found in the code)
- **Needs:** an account that has generated files
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Click the Generated files tab.
  3. Compare: only files the assistant generated are listed.

## S24.04 Artifact view.

- **Expected:** A view lists the user's artifacts and opens each one.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:99; packages/ui/unified-chat/src/components/library/LibraryView.tsx:115; apps/web/app/api/library/route.ts:168; apps/web/lib/server/generated-file-persist.ts:192
- **Earlier check in the running app:** UI_ONLY: E102 [UI_ONLY; empty filter view]: Artifacts tab opens empty. Artifact creation, editing and persistence not established.
- **Where to find it:** Sidebar > Library > Artifacts tab (labels found in the code)
- **Needs:** an account with artifacts
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Click the Artifacts tab.
  3. Click one artifact tile to open it.
  4. Compare: the list shows your artifacts and the chosen one opens.

## S24.05 Image collection.

- **Expected:** An Images view collects the user's images and opens each in a viewer.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:99; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1014; packages/ui/unified-chat/src/components/library/LibraryView.tsx:810; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1243; apps/web/app/api/library/route.ts:168
- **Earlier check in the running app:** PASS: E097 [PASS; existing image preview and Images filter]: Images filter narrows Library to four images. quarterly-bars.png loaded at natural size 240×160 with visible bar chart. Zoom in changes 100% to 125%. Earlier pending preview was interrupted by third dev-server exit; fresh retry succeeds.
- **Where to find it:** Sidebar > Library > Images tab (labels found in the code)
- **Needs:** an account with images
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Click the Images tab.
  3. Click an image tile; the viewer opens with the file name in its label.
  4. Compare: each image opens in the viewer and zoom buttons change the size.

## S24.06 Video collection.

- **Expected:** A Videos view collects the user's videos and plays them.
- **Code:** done. Evidence present: apps/web/app/api/library/route.ts:53; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1295
- **Earlier check in the running app:** PASS: E099 [PASS; filtered collection]: Videos filter shows two prior synthetic files. Activating red-circle item leaves Library unchanged; no in-page video element or viewer appears. No playback or new video generation verified.
- **Where to find it:** Sidebar > Library > Videos tab (labels found in the code)
- **Needs:** an account with videos
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Click the Videos tab.
  3. Click a video tile to open it.
  4. Compare: the video plays in the viewer.

## S24.08 Recent-files view.

- **Expected:** A recent-files view surfaces the files used or added most recently.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7094; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:91; apps/web/lib/server/media-assets.ts:429 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Searched the composer files menu (apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx) and the Library view for a recent-files view. Found only fetchRecentLibraryFiles, with no visible label or section for recent files.

## S24.12 Grid/list toggle.

- **Expected:** Users can switch the Library between grid and list layouts.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1054; packages/ui/unified-chat/src/components/library/LibraryView.tsx:131
- **Earlier check in the running app:** PASS: E049 [PASS; actual upload and filtered result]: Uploaded browser-qa-reference.txt to Library successfully (198 bytes), switched grid to list, searched exact stem and saw only the uploaded file. Project knowledge plan gate is distinct from Library upload.
- **Where to find it:** Sidebar > Library > Library layout buttons (Grid view / List view, top right) (labels found in the code)
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Click the List view icon at the top right.
  3. Compare: files show as rows.
  4. Click the Grid view icon.
  5. Compare: files show as tiles.

## S24.13 Search.

- **Expected:** Users can search the Library by name.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1002; apps/web/lib/server/media-assets.ts:425; apps/web/app/api/library/route.ts:168
- **Earlier check in the running app:** PASS: E049 [PASS; actual upload and filtered result]: Uploaded browser-qa-reference.txt to Library successfully (198 bytes), switched grid to list, searched exact stem and saw only the uploaded file. Project knowledge plan gate is distinct from Library upload.
- **Where to find it:** Sidebar > Library > search box (labels found in the code)
- **Needs:** a file in the Library
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Click the box that says Search files and projects.
  3. Type part of a file name.
  4. Compare: only files whose names match are listed.

## S24.14 File-type filters.

- **Expected:** Users can filter the Library by file type.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:99; packages/ui/unified-chat/src/components/library/LibraryView.tsx:115; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1014; apps/web/app/api/library/route.ts:168
- **Earlier check in the running app:** PASS: E097 [PASS; existing image preview and Images filter]: Images filter narrows Library to four images. quarterly-bars.png loaded at natural size 240×160 with visible bar chart. Zoom in changes 100% to 125%. Earlier pending preview was interrupted by third dev-server exit; fresh retry succeeds.
- **Where to find it:** Sidebar > Library > Images, Videos or Documents tab (labels found in the code)
- **Needs:** files of more than one type in the Library
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Click the Images tab, then the Videos tab, then the Documents tab.
  3. Compare: each tab lists only that file type.

## S24.15 Source-provider filters.

- **Expected:** Users can filter the Library by where files came from (upload, generated, connector/provider).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:98; packages/ui/unified-chat/src/components/library/LibraryView.tsx:99; packages/ui/unified-chat/src/components/library/LibraryView.tsx:114; packages/ui/unified-chat/src/components/library/LibraryView.tsx:115; packages/ui/unified-chat/src/components/library/LibraryView.tsx:458; apps/web/app/api/library/route.ts:79; apps/web/app/api/library/route.ts:167; apps/web/lib/server/media-assets.ts:415; apps/web/lib/server/media-assets.ts:417
- **Where to find it:** Sidebar > Library > Uploads or Generated files tab (labels found in the code)
- **Needs:** uploaded and generated files in the Library
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Click the Uploads tab, then the Generated files tab.
  3. Compare: each tab lists only files from that source.
  4. Look for a connector or provider filter. None was found in the tabs.

## S24.19 Sort by name, date, size, or type.

- **Expected:** Users can sort the Library by name, date, size or type.
- **Code:** done. Evidence present: apps/web/lib/server/media-assets.ts:367; apps/web/lib/server/media-assets.ts:371; packages/ui/unified-chat/src/components/library/LibraryView.tsx:128
- **Earlier check in the running app:** PARTIAL: E098 [PARTIAL; name sort exercised; date default; size untested]: Name sort changed order to generated image description, logo-192.png, logo.png, quarterly-bars.png. Name order verified; Size option visible but not exercised.
- **Where to find it:** Sidebar > Library > Sort button (shows Modified) > Name, Size or Type (labels found in the code)
- **Needs:** several files in the Library
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Click the sort button (it shows Modified).
  3. Click Name, then Size, then Type.
  4. Compare: the list order changes for each choice.

## S24.27 Add to Project.

- **Expected:** Users can add a Library file to a project.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Library > file's actions menu (the Actions for button) > Add to project (labels found in the code)
- **Needs:** a project and a file that can be attached
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Open the actions menu on a file that can be attached (for example a text file).
  3. Click Add to project and choose a project.
  4. Compare: a toast says Added to <project name>, and the file appears in the project's files.

## S24.28 Attach to conversation.

- **Expected:** Users can attach a Library file to a conversation.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:685; apps/web/features/library/components/LibraryView.tsx:218; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7094; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:91
- **Earlier check in the running app:** PARTIAL: E050 [PARTIAL; navigation and rejection]: Add to chat navigated from Library but active text-only model rejected attachment and advised Free Auto. New chat also retained prior QA project selection. File was not attached; retest with compatible model next.
- **Where to find it:** Sidebar > Library > file's actions menu > Add to chat (labels found in the code)
- **Needs:** a file in the Library and a model that accepts attachments
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Open the actions menu on a file and click Add to chat.
  3. Compare: a new chat opens with the file attached.
  4. If the model cannot take attachments, the chat shows an error instead.

## S24.29 Open originating conversation.

- **Expected:** From a Library file, users can open the conversation it came from.
- **Code:** done. Evidence present: apps/web/app/api/library/route.ts:86; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1830; apps/web/features/library/components/LibraryView.tsx:215
- **Where to find it:** Sidebar > Library > file's actions menu > Open chat (labels found in the code)
- **Needs:** a file that came from a conversation
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Open the actions menu on a file that came from a conversation.
  3. Click Open chat.
  4. Compare: the conversation the file came from opens.

## S24.33 Storage-consumption display.

- **Expected:** The product shows how much storage the user's files consume against their allowance.
- **Code:** done. Evidence moved: apps/web/app/api/library/route.ts:139 (quoted code not found in the file now); packages/ui/unified-chat/src/components/library/LibraryView.tsx:947
- **Where to find it:** Sidebar > Library > header text under the Library title (labels found in the code)
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Look under the Library title for the storage line.
  3. Compare: it reads like 'X of Y file storage used' when a limit is known, or 'X of file storage used' when not.

## S24.34 Trash and restore.

- **Expected:** Deleted files go to a trash from which they can be restored.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1035; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1784; apps/web/app/api/media/route.ts:64; apps/web/lib/server/media-assets.ts:432
- **Earlier check in the running app:** UI_ONLY: E100 [UI_ONLY; empty recovery view]: Recently deleted opens and explains 30-day recovery. Empty list; no file deleted or restored in this check.
- **Where to find it:** Sidebar > Library > Recently deleted (trash icon) > file's actions menu > Restore (labels found in the code)
- **Needs:** a file to delete
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Open the actions menu on a file and click Delete. Confirm in the dialog.
  3. Click the trash icon labelled Recently deleted.
  4. Open the actions menu on the file and click Restore.
  5. Compare: the file moves back to the Library. Recently deleted explains files stay for 30 days.

## S24.35 Expired-resource display.

- **Expected:** Expired or no-longer-available files are clearly marked in the Library.
- **Code:** done. Evidence present: apps/web/app/api/library/route.ts:87; packages/ui/unified-chat/src/components/library/LibraryView.tsx:351
- **Where to find it:** Sidebar > Library > a file tile or row that cannot load (labels found in the code)
- **Needs:** a file whose data is missing or cannot load
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Find a file that cannot be loaded (for example after its asset is removed).
  3. Click it.
  4. Compare: the entry shows 'This file is unavailable right now. Try again later, or remove this entry.'
