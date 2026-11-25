---
id: "PLAN-desktop-024"
type: "test-plan"
title: "Desktop · 24. Library and file-management experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "24"
---
# Desktop · 24. Library and file-management experience

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S24.02 Uploaded-files view.

- **Expected:** A view shows only the files the user uploaded.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:98
- **Where to find it:** Sidebar > Library > Uploads (labels found in the code)
- **Needs:** a file to upload (upload one first with New > Upload file if the Library is empty)
- **Steps:**
  1. Sign in, then click Library in the left sidebar.
  2. Click the Uploads tab in the row of tabs under the search box.
  3. Look that only files you uploaded are listed (no files the assistant made).

## S24.03 Generated-files view.

- **Expected:** A view shows only files the assistant generated.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:99; packages/ui/unified-chat/src/components/library/LibraryView.tsx:115; apps/web/app/api/library/route.ts:168
- **Where to find it:** Sidebar > Library > Generated files (labels found in the code)
- **Needs:** an account that already has a generated file (for example an image or document made in a chat)
- **Steps:**
  1. Click Library in the left sidebar.
  2. Click the Generated files tab in the row of tabs under the search box.
  3. Look that only files the assistant produced are listed, and that uploads are not.

## S24.04 Artifact view.

- **Expected:** A view lists the user's artifacts and opens each one.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:99; packages/ui/unified-chat/src/components/library/LibraryView.tsx:115; apps/web/app/api/library/route.ts:168; apps/web/lib/server/generated-file-persist.ts:192
- **Where to find it:** Sidebar > Library > Artifacts (labels found in the code)
- **Needs:** an account with at least one artifact made in a chat
- **Steps:**
  1. Click Library in the left sidebar.
  2. Click the Artifacts tab.
  3. Click a tile labelled Open followed by an artifact name; the artifact opens in the Library viewer.
  4. Look that the list shows only your artifacts and that each one opens.

## S24.05 Image collection.

- **Expected:** An Images view collects the user's images and opens each in a viewer.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:99; packages/ui/unified-chat/src/components/library/LibraryView.tsx:810; apps/web/app/api/library/route.ts:168
- **Where to find it:** Sidebar > Library > Images (labels found in the code)
- **Needs:** an account with at least one image
- **Steps:**
  1. Click Library in the left sidebar.
  2. Click the Images tab.
  3. Click an image tile (its label is Open followed by the file name). The image opens in a viewer dialog named after the file, with Zoom in and Zoom out buttons.
  4. Look that the image is shown in the viewer and that the Images tab lists images only.

## S24.06 Video collection.

- **Expected:** A Videos view collects the user's videos and plays them.
- **Code:** done. Evidence present: apps/web/app/api/library/route.ts:53; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1295
- **Where to find it:** Sidebar > Library > Videos (labels found in the code)
- **Needs:** an account with at least one video
- **Steps:**
  1. Click Library in the left sidebar.
  2. Click the Videos tab.
  3. Click a video tile (label Open followed by the file name).
  4. In the viewer, press the play control on the video and look that it plays.

## S24.08 Recent-files view.

- **Expected:** A recent-files view surfaces the files used or added most recently.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7094; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:91; apps/web/lib/server/media-assets.ts:429 (quoted code not found in the file now)
- **Where to find it:** Chat composer > (+) menu > Add from library (labels found in the code)
- **Needs:** a signed-in account with a few library files
- **Steps:**
  1. Open a chat (or New chat) and click the + button beside the message box.
  2. Hover or click Add from library.
  3. Look at the list: it shows your most recently changed library files, newest first.
  4. Click Browse all at the bottom to compare with the full Library sorted by Modified.

## S24.12 Grid/list toggle.

- **Expected:** Users can switch the Library between grid and list layouts.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1054; packages/ui/unified-chat/src/components/library/LibraryView.tsx:131
- **Where to find it:** Sidebar > Library > Grid view / List view (icon buttons at the top right, in the group Library layout) (labels found in the code)
- **Needs:** an account with a few files
- **Steps:**
  1. Click Library in the left sidebar and note that files show as tiles.
  2. Click the List view icon button at the right of the filter row.
  3. Look that files now show as rows with a name, date and size.
  4. Click the Grid view icon button and look that tiles return.

## S24.13 Search.

- **Expected:** Users can search the Library by name.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1002; apps/web/lib/server/media-assets.ts:425; apps/web/app/api/library/route.ts:168
- **Where to find it:** Sidebar > Library > search box (Search files and projects) (labels found in the code)
- **Needs:** an account with several named files
- **Steps:**
  1. Click Library in the left sidebar.
  2. Click the box that says Search files and projects and type part of a file name.
  3. Wait a moment; the list narrows to matching names.
  4. Clear the box and look that all files return. A search with no match shows No matches.

## S24.14 File-type filters.

- **Expected:** Users can filter the Library by file type.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:99; packages/ui/unified-chat/src/components/library/LibraryView.tsx:115; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1014; apps/web/app/api/library/route.ts:168
- **Where to find it:** Sidebar > Library > Images / Videos / Documents (tabs) (labels found in the code)
- **Needs:** an account with an image, a video and a document
- **Steps:**
  1. Click Library in the left sidebar.
  2. Click Documents, then Images, then Videos in the row of tabs.
  3. Look that each tab shows only that file type.
  4. Click All to return to everything.

## S24.15 Source-provider filters.

- **Expected:** Users can filter the Library by where files came from (upload, generated, connector/provider).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:98; packages/ui/unified-chat/src/components/library/LibraryView.tsx:99; packages/ui/unified-chat/src/components/library/LibraryView.tsx:114; packages/ui/unified-chat/src/components/library/LibraryView.tsx:115; packages/ui/unified-chat/src/components/library/LibraryView.tsx:458; apps/web/app/api/library/route.ts:79; apps/web/app/api/library/route.ts:167; apps/web/lib/server/media-assets.ts:415; apps/web/lib/server/media-assets.ts:417
- **Where to find it:** Sidebar > Library > Uploads / Generated files (tabs) (labels found in the code)
- **Needs:** an account with both uploaded and generated files
- **Steps:**
  1. Click Library in the left sidebar.
  2. Click Uploads, then Generated files in the row of tabs.
  3. Look that each tab shows only files from that source.
  4. Click All to return to everything.

## S24.19 Sort by name, date, size, or type.

- **Expected:** Users can sort the Library by name, date, size or type.
- **Code:** done. Evidence present: apps/web/lib/server/media-assets.ts:367; apps/web/lib/server/media-assets.ts:371; packages/ui/unified-chat/src/components/library/LibraryView.tsx:128
- **Where to find it:** Sidebar > Library > sort button (shows Modified) > Name / Size / Type (labels found in the code)
- **Needs:** an account with several files of different names, sizes and types
- **Steps:**
  1. Click Library in the left sidebar.
  2. Click the sort button at the top right of the filter row (it shows Modified on wide screens).
  3. Choose Name, then Size, then Type from the menu.
  4. Look that the order changes each time; Modified sorts newest first.

## S24.27 Add to Project.

- **Expected:** Users can add a Library file to a project.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Library > (row) Actions for <file name> > Add to project (labels found in the code)
- **Needs:** a document file in the Library and at least one project (the dialog says you have no projects if none exist)
- **Steps:**
  1. Click Library in the left sidebar.
  2. On a document row, click the three-dot button labelled Actions for <file name>.
  3. Click Add to project. A dialog titled Add to project opens.
  4. Click a project in the list, then open that project and look for the file.

## S24.28 Attach to conversation.

- **Expected:** Users can attach a Library file to a conversation.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:685; apps/web/features/library/components/LibraryView.tsx:218; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7094; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:91
- **Where to find it:** Sidebar > Library > (row) Actions for <file name> > Add to chat (labels found in the code)
- **Needs:** a file in the Library
- **Steps:**
  1. Click Library in the left sidebar.
  2. Click the Actions for <file name> button on a file row, then Add to chat.
  3. Look that a new chat opens with the file attached in the message box.
  4. Alternatively, in any chat click the + button, then Add from library, then Attach <file name>.

## S24.29 Open originating conversation.

- **Expected:** From a Library file, users can open the conversation it came from.
- **Code:** done. Evidence present: apps/web/app/api/library/route.ts:86; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1830; apps/web/features/library/components/LibraryView.tsx:215
- **Where to find it:** Sidebar > Library > (row) Actions for <file name> > Open chat (labels found in the code)
- **Needs:** a file that was created inside a chat (an uploaded or generated file from a conversation)
- **Steps:**
  1. Click Library in the left sidebar.
  2. Click the Actions for <file name> button on a file that came from a chat.
  3. Click Open chat.
  4. Look that the chat the file came from opens.

## S24.33 Storage-consumption display.

- **Expected:** The product shows how much storage the user's files consume against their allowance.
- **Code:** done. Evidence moved: apps/web/app/api/library/route.ts:139 (quoted code not found in the file now); packages/ui/unified-chat/src/components/library/LibraryView.tsx:947
- **Where to find it:** Sidebar > Library > the line under the Library heading (storage used) (labels found in the code)
- **Needs:** a signed-in account (the numbers come from the account's plan)
- **Steps:**
  1. Click Library in the left sidebar.
  2. Read the small line under the Library heading, for example 'X of Y file storage used'.
  3. Read the second line about file downloads used this month if it is shown.
  4. Upload or delete a file, return to Library, and look that the number changes.

## S24.34 Trash and restore.

- **Expected:** Deleted files go to a trash from which they can be restored.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1035; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1784; apps/web/app/api/media/route.ts:64
- **Where to find it:** Sidebar > Library > Recently deleted (trash icon) > Restore (labels found in the code)
- **Needs:** a file in the Library that you are willing to delete and restore
- **Steps:**
  1. Click Library in the left sidebar.
  2. Open a file's Actions for <file name> menu and click Delete; confirm in the dialog.
  3. Click the trash icon labelled Recently deleted in the filter row.
  4. Open the file's Actions menu, click Restore, then return to All and look that the file is back.

## S24.35 Expired-resource display.

- **Expected:** Expired or no-longer-available files are clearly marked in the Library.
- **Code:** done. Evidence present: apps/web/app/api/library/route.ts:87; packages/ui/unified-chat/src/components/library/LibraryView.tsx:351
- **Where to find it:** Sidebar > Library > Recently deleted (for Kept until); a file row that cannot load (for the unavailable message) (labels found in the code)
- **Needs:** a deleted file (for Kept until); a file whose stored copy is missing (for the unavailable message), which is hard to set up
- **Steps:**
  1. Click Library in the left sidebar, then the trash icon labelled Recently deleted.
  2. Look at each deleted file's line for Kept until and a date.
  3. For a file whose content cannot be loaded, look for the line This file is unavailable right now. Try again later, or remove this entry.
