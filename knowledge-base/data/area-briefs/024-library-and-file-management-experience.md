# Area 24. Library and file-management experience

40 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S24.01 All-files view.
- Should: One Library view lists every file the user owns across chats, generation, uploads and projects.
- Status: cli missing, vscode missing, chrome missing

## S24.02 Uploaded-files view.
- Should: A view shows only the files the user uploaded.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:92; apps/mobile/src/features/library/index.tsx:78; apps/mobile/src/features/library/index.tsx:608

## S24.03 Generated-files view.
- Should: A view shows only files the assistant generated.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:81; packages/ui/unified-chat/src/components/library/LibraryView.tsx:96; packages/ui/unified-chat/src/components/library/LibraryView.tsx:852; apps/web/app/api/library/route.ts:67; apps/mobile/src/features/library/index.tsx:79; apps/mobile/src/features/library/index.tsx:613

## S24.04 Artifact view.
- Should: A view lists the user's artifacts and opens each one.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:81; packages/ui/unified-chat/src/components/library/LibraryView.tsx:96; apps/web/app/api/library/route.ts:67; apps/web/lib/server/generated-file-persist.ts:186; apps/mobile/src/features/library/index.tsx:249; apps/mobile/src/features/library/index.tsx:91; apps/cli/src/lib.rs:1899; apps/cli/src/cloud/artifacts.rs:306

## S24.05 Image collection.
- Should: An Images view collects the user's images and opens each in a viewer.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:81; packages/ui/unified-chat/src/components/library/LibraryView.tsx:852; packages/ui/unified-chat/src/components/library/LibraryView.tsx:670; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1060; apps/web/app/api/library/route.ts:67; apps/mobile/src/features/library/index.tsx:249; apps/mobile/src/features/library/index.tsx:205; apps/mobile/src/features/library/index.tsx:338

## S24.06 Video collection.
- Should: A Videos view collects the user's videos and plays them.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/app/api/library/route.ts:49; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1301; apps/mobile/src/features/library/index.tsx:249; apps/mobile/src/features/library/index.tsx:91; apps/mobile/src/features/library/index.tsx:218

## S24.07 Audio collection.
- Should: An Audio view collects the user's audio files.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S24.08 Recent-files view.
- Should: A recent-files view surfaces the files used or added most recently.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5312; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:80; apps/web/lib/server/media-assets.ts:429; apps/mobile/src/features/library/index.tsx:66; apps/mobile/src/features/library/libraryClient.ts:84

## S24.09 Favorites.
- Should: Users can favorite files and view favorites.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S24.10 Shared-with-me view.
- Should: A Shared-with-me view lists files and items others shared with the user.
- Status: mobile missing, cli missing, vscode missing, chrome missing

## S24.11 Folder hierarchy.
- Should: Files can be organised in a folder hierarchy that can be browsed in the Library.
- Status: mobile missing, cli missing, vscode missing, chrome missing

## S24.12 Grid/list toggle.
- Should: Users can switch the Library between grid and list layouts.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:885; packages/ui/unified-chat/src/components/library/LibraryView.tsx:117

## S24.13 Search.
- Should: Users can search the Library by name.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:838; apps/web/lib/server/media-assets.ts:483; apps/web/app/api/library/route.ts:67; apps/mobile/src/features/library/index.tsx:330; apps/mobile/src/features/library/libraryClient.ts:53

## S24.14 File-type filters.
- Should: Users can filter the Library by file type.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:81; packages/ui/unified-chat/src/components/library/LibraryView.tsx:96; packages/ui/unified-chat/src/components/library/LibraryView.tsx:852; apps/web/app/api/library/route.ts:67; apps/mobile/src/features/library/index.tsx:249; apps/mobile/src/features/library/index.tsx:91

## S24.15 Source-provider filters.
- Should: Users can filter the Library by where files came from (upload, generated, connector/provider).
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:93; packages/ui/unified-chat/src/components/library/LibraryView.tsx:94; packages/ui/unified-chat/src/components/library/LibraryView.tsx:109; packages/ui/unified-chat/src/components/library/LibraryView.tsx:110; packages/ui/unified-chat/src/components/library/LibraryView.tsx:421; apps/web/app/api/library/route.ts:73; apps/web/app/api/library/route.ts:113; apps/web/lib/server/media-assets.ts:482

## S24.16 Owner filters.
- Should: Users can filter the Library by owner.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S24.17 Project filters.
- Should: Users can filter the Library by project.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S24.18 Created/modified date filters.
- Should: Users can filter the Library by created/modified date.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S24.19 Sort by name, date, size, or type.
- Should: Users can sort the Library by name, date, size or type.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/lib/server/media-assets.ts:433; apps/web/lib/server/media-assets.ts:436; packages/ui/unified-chat/src/components/library/LibraryView.tsx:122

## S24.20 Multi-selection.
- Should: Users can select several Library items at once.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S24.21 Batch download.
- Should: Users can download several selected files at once.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S24.22 Batch move.
- Should: Users can move several selected files at once.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S24.23 Batch delete.
- Should: Users can delete several selected files at once.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S24.24 Rename.
- Should: Users can rename a Library file.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S24.25 Duplicate.
- Should: Users can duplicate a Library file.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S24.26 Move to folder.
- Should: Users can move a file into a folder.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S24.27 Add to Project.
- Should: Users can add a Library file to a project.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227

## S24.28 Attach to conversation.
- Should: Users can attach a Library file to a conversation.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1596; apps/web/features/library/components/LibraryView.tsx:195; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5312; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:80; apps/mobile/src/features/library/index.tsx:385; apps/mobile/src/features/library/index.tsx:286

## S24.29 Open originating conversation.
- Should: From a Library file, users can open the conversation it came from.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/app/api/library/route.ts:81; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1839; apps/web/features/library/components/LibraryView.tsx:194

## S24.30 Open external original.
- Should: Users can open the external original of a file (e.g. in Drive or its source site).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S24.31 File-details panel.
- Should: A details panel shows a file's metadata (size, type, dates, source, where used).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S24.32 Version history.
- Should: Users can see and restore earlier versions of a file.
- Status: mobile missing, cli missing, vscode missing, chrome missing

## S24.33 Storage-consumption display.
- Should: The product shows how much storage the user's files consume against their allowance.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/app/api/library/route.ts:139; packages/ui/unified-chat/src/components/library/LibraryView.tsx:860; apps/mobile/src/features/library/index.tsx:667; apps/mobile/src/features/library/index.tsx:661

## S24.34 Trash and restore.
- Should: Deleted files go to a trash from which they can be restored.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:876; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1578; apps/web/app/api/media/route.ts:45; apps/web/lib/server/media-assets.ts:492; apps/mobile/src/features/library/index.tsx:168; apps/mobile/src/features/library/index.tsx:338; apps/mobile/src/features/library/libraryClient.ts:135

## S24.35 Expired-resource display.
- Should: Expired or no-longer-available files are clearly marked in the Library.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/app/api/library/route.ts:82; packages/ui/unified-chat/src/components/library/LibraryView.tsx:328

## S24.36 Processing-status display.
- Should: The Library shows a file's processing status (uploading, processing, ready, failed).
- Status: mobile missing, cli missing, vscode missing, chrome missing

## S24.37 Connected-file browsing.
- Should: Users can browse files in connected storage (Drive, OneDrive, Dropbox) from the product.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S24.38 Refresh external metadata.
- Should: Users can refresh metadata of externally linked files.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S24.39 Save external content as a copy.
- Should: Users can save external content as an owned copy in the Library.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S24.40 Distinguish external references from owned files.
- Should: The Library visibly distinguishes external references from files the user owns.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing
