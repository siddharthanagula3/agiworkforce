---
id: "GAPS-AREA-024"
type: "gap-list"
title: "Gaps: Library and file-management experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 24. Library and file-management experience

93 open gaps that touch this area. Area page: [20-features/024-library-and-file-management-experience](../../20-features/024-library-and-file-management-experience/README.md).

## CMP-M182

**Project file limits by plan**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F014-12](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md), [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md), [F024-08](../../20-features/024-library-and-file-management-experience/F024-08-use-a-file-in-a-chat-or-a-project.md)
- Detail: The app shows no per-plan project file count or size limit.
- Evidence: searched: MAX_FILES, file limit, maxBytes in src/features/projects/projectKnowledge.ts, stores/projects

## CMP-M185

**Favourites tab in the library**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F024-01](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md), [F024-02](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md), [F024-03](../../20-features/024-library-and-file-management-experience/F024-03-recent-favourite-shared-and-folder-views.md), [F024-04](../../20-features/024-library-and-file-management-experience/F024-04-search-sort-and-layout.md), [F024-05](../../20-features/024-library-and-file-management-experience/F024-05-filter-by-origin-owner-project-or-date.md), [F024-06](../../20-features/024-library-and-file-management-experience/F024-06-select-and-act-on-several-files.md), [F024-07](../../20-features/024-library-and-file-management-experience/F024-07-rename-duplicate-and-move-a-file.md), [F024-08](../../20-features/024-library-and-file-management-experience/F024-08-use-a-file-in-a-chat-or-a-project.md), [F095-05](../../20-features/095-file-and-library-components/F095-05-library-catalog-and-storage-use.md), [F095-06](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Detail: No favourites tab or star in the Library.
- Evidence: searched: favorite, favourite in apps/mobile/src/features/library

## CMP-M186

**Folders in the library**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F024-01](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md), [F024-02](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md), [F024-03](../../20-features/024-library-and-file-management-experience/F024-03-recent-favourite-shared-and-folder-views.md), [F024-04](../../20-features/024-library-and-file-management-experience/F024-04-search-sort-and-layout.md), [F024-05](../../20-features/024-library-and-file-management-experience/F024-05-filter-by-origin-owner-project-or-date.md), [F024-06](../../20-features/024-library-and-file-management-experience/F024-06-select-and-act-on-several-files.md), [F024-07](../../20-features/024-library-and-file-management-experience/F024-07-rename-duplicate-and-move-a-file.md), [F024-08](../../20-features/024-library-and-file-management-experience/F024-08-use-a-file-in-a-chat-or-a-project.md), [F095-05](../../20-features/095-file-and-library-components/F095-05-library-catalog-and-storage-use.md), [F095-06](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Detail: No folders in the Library.
- Evidence: searched: folders in apps/mobile/src/features/library

## CMP-M200

**Library files and folders shared with Viewer or Editor access**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F024-12](../../20-features/024-library-and-file-management-experience/F024-12-connected-storage-and-external-files.md), [F095-06](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Detail: Library has no sharing of files or folders with people.
- Evidence: searched: share, Viewer, Editor in src/features/library; only OS shareFile at library/index.tsx:49

## CMP-M32

**Search connected Google Drive files from the sidebar**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F024-12](../../20-features/024-library-and-file-management-experience/F024-12-connected-storage-and-external-files.md), [F095-06](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Detail: Search covers our own chats, projects, uploads and library only, not files in a connected drive.
- Evidence: searched: Drive, remote file search in apps/mobile/src/features/search

## CMP-M45

**Attach audio files**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F024-02](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md), [F025-05](../../20-features/025-file-previews-and-readers/F025-05-play-audio-and-video-with-transcripts-and-timestam.md), [F095-04](../../20-features/095-file-and-library-components/F095-04-audio-and-video.md)
- Detail: Audio files are not an accepted attachment type.
- Evidence: packages/contracts/cloud-contracts/src/chat-attachment-policy.json (mimeTypes has no audio)

## CMP-M47

**Cloud file storage quota and storage manager**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F024-11](../../20-features/024-library-and-file-management-experience/F024-11-storage-use-and-file-status.md), [F095-05](../../20-features/095-file-and-library-components/F095-05-library-catalog-and-storage-use.md)
- Detail: Our Storage page covers on-device usage only; no cloud storage quota is shown.
- Evidence: apps/mobile/app/(app)/settings/storage.tsx:25-32

## CMP-MP30

**Create Word, PowerPoint and Excel files in chat**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F024-01](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md), [F025-07](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md)
- Detail: PDF is not an option A Create file row asks for a Document, Presentation or Spreadsheet; PDF is not an option.
- Evidence: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1185; packages/contracts/cloud-contracts/src/skills.ts:22

## CMP-W103

**Audio file upload and transcription**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F024-02](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md), [F025-05](../../20-features/025-file-previews-and-readers/F025-05-play-audio-and-video-with-transcripts-and-timestam.md), [F049-04](../../20-features/049-dictation-transcription-and-recording/F049-04-batch-and-file-transcription.md), [F095-04](../../20-features/095-file-and-library-components/F095-04-audio-and-video.md)
- Detail: Audio is not an attachable type in chat.
- Evidence: searched: audio types in packages/contracts/cloud-contracts/src/chat-attachment-policy.json:14-32

## CMP-W104

**Box, Dropbox and SharePoint files in the Library**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F024-12](../../20-features/024-library-and-file-management-experience/F024-12-connected-storage-and-external-files.md), [F095-06](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Detail: The Library holds uploads and created files only.
- Evidence: searched: dropbox, sharepoint in packages/ui/unified-chat/src/components/library, apps/web/features/library

## CMP-W222

**Browse Google Drive, Box, Dropbox or SharePoint inside Library**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F024-12](../../20-features/024-library-and-file-management-experience/F024-12-connected-storage-and-external-files.md), [F095-06](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Detail: Library shows only files saved in the app; connected storage is not browsable there.
- Evidence: searched: drive, dropbox, sharepoint in apps/web/features/library, packages/ui/unified-chat/src/components/library

## CMP-W229

**Connect Box or Dropbox to search files in chat**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F024-12](../../20-features/024-library-and-file-management-experience/F024-12-connected-storage-and-external-files.md), [F095-06](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Detail: Switched off: Box and Dropbox are in the connector catalog but not among the 13 released connectors, so they show as coming soon.
- Evidence: apps/web/lib/connectors/catalog.ts:254-255; packages/contracts/types/src/connector-release.ts:14-30

## CMP-W312

**Library favorites for products and places, with folders**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F024-03](../../20-features/024-library-and-file-management-experience/F024-03-recent-favourite-shared-and-folder-views.md), [F024-05](../../20-features/024-library-and-file-management-experience/F024-05-filter-by-origin-owner-project-or-date.md), [F024-06](../../20-features/024-library-and-file-management-experience/F024-06-select-and-act-on-several-files.md), [F024-07](../../20-features/024-library-and-file-management-experience/F024-07-rename-duplicate-and-move-a-file.md), [F095-06](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Detail: The Library has folders for files but no bookmarking of products or places from answers.
- Evidence: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1464; searched: favorite, bookmark in apps/web/features/library

## CMP-WP244

**Project files, limits and search over large knowledge**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F014-12](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md), [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md), [F024-08](../../20-features/024-library-and-file-management-experience/F024-08-use-a-file-in-a-chat-or-a-project.md)
- Detail: Project sources are indexed with a status line; the limit is plan storage (500 MB Free to 100 GB) rather than a file co… Project sources are indexed with a status line; the limit is plan storage (500 MB Free to 100 GB) rather than a file count or per-file size.
- Evidence: apps/web/features/projects/components/KnowledgeIndexStatus.tsx:7; packages/contracts/types/src/billing-catalog.ts:655

## CMP-WP43

**Library views: Suggested, Recents, Favorites, Shared with you, Pages**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F024-01](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md), [F024-02](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md), [F024-03](../../20-features/024-library-and-file-management-experience/F024-03-recent-favourite-shared-and-folder-views.md), [F024-04](../../20-features/024-library-and-file-management-experience/F024-04-search-sort-and-layout.md), [F024-05](../../20-features/024-library-and-file-management-experience/F024-05-filter-by-origin-owner-project-or-date.md), [F024-08](../../20-features/024-library-and-file-management-experience/F024-08-use-a-file-in-a-chat-or-a-project.md), [F095-05](../../20-features/095-file-and-library-components/F095-05-library-catalog-and-storage-use.md)
- Detail: No Favorites, Recents, Suggested or Shared with you views Library has All, Images, Videos, Documents, Artifacts, Uploaded and Generated tabs with grid and list, but no Favorites, Recents, Suggested or Shared with you views.
- Evidence: packages/ui/unified-chat/src/components/library/LibraryView.tsx:81-95

## CMP-WP82

**Add Google Drive files to a chat from the + menu**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F024-12](../../20-features/024-library-and-file-management-experience/F024-12-connected-storage-and-external-files.md), [F095-06](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Detail: The chat composer has no add-from-Drive option Drive files can be picked as project sources, but the chat composer has no add-from-Drive option.
- Evidence: apps/web/features/projects/components/SourcesPanel.tsx:244; searched: Drive picker in apps/web/features/chat/components/Composer

## CMP-WP83

**Create Word, PowerPoint, Excel and PDF files**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F024-01](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md), [F025-07](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md), [F096-04](../../20-features/096-artifact-and-generated-application-components/F096-04-office-and-pdf-file-generation.md)
- Detail: There is no PDF output An Output row creates Word, PowerPoint or Excel files; there is no PDF output.
- Evidence: apps/web/lib/chat-output-format.ts:11-15; Composer/ComposerPlusMenu.tsx:960-1010

## GAP-AREA024-LW03

**Expired-resource display (S24.35) is marked done, but the only signal is an 'unavailable' message after a 404 or 410 response. The server sends no expiry state, and erase_after is sent only for deleted rows.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-024
- Detail: Area 24. Library and file-management experience
- Evidence: packages/ui/unified-chat/src/components/library/LibraryView.tsx:575-609, 765, 1513-1515; apps/web/app/api/library/route.ts:86-87.

## GAP-AREA024-LW04

**Restore window is written twice: the constant (30 days) drives the displayed 'Kept until' date, while the SQL hard-codes '30 days' for both the deleted list and restore. Changing the constant would make display and behaviour disagree.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-024
- Detail: Area 24. Library and file-management experience
- Evidence: apps/web/app/api/library/route.ts:60-63; apps/web/lib/server/media-assets.ts:432, 723; apps/web/lib/resources/deletion-policies.ts:8.

## GAP-AREA024-LW06

**The server supports the 'oldest' sort, but the web sort menu does not offer it (mobile does).**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-024
- Detail: Area 24. Library and file-management experience
- Evidence: packages/contracts/cloud-contracts/src/library.ts:87; packages/ui/unified-chat/src/components/library/LibraryView.tsx:124-129; apps/mobile/src/features/library/index.tsx:85-91.

## GAP-AREA024-LW10

**Recent files (S24.08) is marked done, but it is only the default sort by updated time, not a view of files recently used.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-024
- Detail: Area 24. Library and file-management experience
- Evidence: packages/contracts/cloud-contracts/src/library.ts:89; apps/web/lib/server/media-assets.ts:367.

## GAP-CAP-files-and-attachments-09

**Audio file upload and transcription: No audio attachment, player, transcript panel or timestamp navigation. A transcription worker exists in the platform ledger (S95.10) but is not wired to attach.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F024-02](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md), [F025-05](../../20-features/025-file-previews-and-readers/F025-05-play-audio-and-video-with-transcripts-and-timestam.md), [F095-04](../../20-features/095-file-and-library-components/F095-04-audio-and-video.md)
- Requirement items: S14.13, S24.07, S25.06, S25.23, S95.10
- Detail: Claude unknown, ChatGPT yes; AGI not built

## GAP-CAP-files-and-attachments-17

**Project files as knowledge: Upload of a PDF as project knowledge failed twice in the browser run.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-12](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md), [F024-08](../../20-features/024-library-and-file-management-experience/F024-08-use-a-file-in-a-chat-or-a-project.md)
- Requirement items: S14.21, S24.27
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-files-and-attachments-18

**Library: one place for uploaded and generated files: No Suggested, Favorites or Shared-with-you views; mobile missing sort, grid and source filters.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F024-01](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md), [F024-02](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md), [F024-03](../../20-features/024-library-and-file-management-experience/F024-03-recent-favourite-shared-and-folder-views.md), [F024-04](../../20-features/024-library-and-file-management-experience/F024-04-search-sort-and-layout.md), [F024-05](../../20-features/024-library-and-file-management-experience/F024-05-filter-by-origin-owner-project-or-date.md), [F024-08](../../20-features/024-library-and-file-management-experience/F024-08-use-a-file-in-a-chat-or-a-project.md), [F095-05](../../20-features/095-file-and-library-components/F095-05-library-catalog-and-storage-use.md)
- Requirement items: S24.01, S24.02, S24.03, S24.04, S24.05, S24.06, S24.07, S24.08, S24.12, S24.13, S24.14, S24.15, S24.19, S24.28, S95.16
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-files-and-attachments-19

**Library organisation: folders, favorites, select and batch actions: All listed actions.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F024-03](../../20-features/024-library-and-file-management-experience/F024-03-recent-favourite-shared-and-folder-views.md), [F024-05](../../20-features/024-library-and-file-management-experience/F024-05-filter-by-origin-owner-project-or-date.md), [F024-06](../../20-features/024-library-and-file-management-experience/F024-06-select-and-act-on-several-files.md), [F024-07](../../20-features/024-library-and-file-management-experience/F024-07-rename-duplicate-and-move-a-file.md), [F095-06](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Requirement items: S24.09, S24.11, S24.16, S24.17, S24.18, S24.20, S24.21, S24.22, S24.23, S24.24, S24.25, S24.26, S95.17
- Detail: Claude unknown, ChatGPT partly; AGI not built

## GAP-CAP-files-and-attachments-20

**Storage allowance and manager: Mobile lacks the cloud quota in Storage settings. Comparison states web sizes 500 MB Free to 100 GB.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F024-11](../../20-features/024-library-and-file-management-experience/F024-11-storage-use-and-file-status.md), [F095-05](../../20-features/095-file-and-library-components/F095-05-library-catalog-and-storage-use.md)
- Requirement items: S24.33, S95.23
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-files-and-attachments-21

**Trash, restore and deletion: Web chat delete dialog says it cannot be undone while the product has Recently deleted (seen).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F024-09](../../20-features/024-library-and-file-management-experience/F024-09-recently-deleted-and-restore.md), [F095-08](../../20-features/095-file-and-library-components/F095-08-delete-trash-and-restore.md)
- Requirement items: S24.34, S95.24, S95.25, S95.26, S95.28
- Detail: Claude unknown, ChatGPT yes; AGI built

## GAP-CAP-files-and-attachments-22

**Connected storage in chat and Library: No cloud-file picker in the composer, no connected browsing in Library, no external-reference marking.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F024-12](../../20-features/024-library-and-file-management-experience/F024-12-connected-storage-and-external-files.md), [F095-06](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Requirement items: S14.09, S24.37, S24.38, S24.39, S24.40, S95.18, S95.19
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-files-and-attachments-25

**Generated files in Library and download: No PDF creation in chat; xlsx creation failing in the browser run; dispatch summary card not downloadable.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F024-01](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md), [F025-07](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md)
- Requirement items: S24.03, S25.26
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F024-01-01

**Brief marks Chrome artifact view unverified; no Chrome code was opened.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-01](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md)
- Detail: Affects: surface:chrome. Work needed: Open apps/extension/src, confirm the artifact view, add a test.
- Evidence: S24.04 status; docs/product/surface-feature-matrix.md:199

## GAP-F024-01-02

**CLI and VS Code list a different artifact index than web Artifacts tab (message-derived vs stored files), so the two lists can differ.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-01](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md)
- Detail: Affects: surface:cli, surface:vscode, surface:web. Work needed: Decide one definition of 'artifact' for the Library, or label the difference.
- Evidence: apps/cli/src/cloud/artifacts.rs:1-12 vs apps/web/app/api/library/route.ts:77

## GAP-F024-01-03

**Tauri DesktopLibrary has fewer actions than web (no upload, folders, add to chat).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-01](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md)
- Detail: Affects: surface:desktop (Tauri build only). Work needed: Supply the missing transport methods or retire the Tauri screen.
- Evidence: apps/desktop/src/features/library/DesktopLibrary.tsx transport memo

## GAP-F024-01-04

**Mobile tab filters Images, Videos, Documents are applied on the loaded page, not on the server.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-01](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md)
- Detail: Affects: surface:mobile. Work needed: Pass kind to the server so a filter does not depend on what the first pages contain.
- Evidence: apps/mobile/src/features/library/index.tsx:136-142,328-345

## GAP-F024-01-NOTBUILT

**Browse by source: All files, Uploads, Generated files, Artifacts: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F024-01](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md)
- Requirement items: S24.01, S24.02, S24.03
- Detail: CLI: S24.01, S24.02, S24.03; VS Code: S24.01, S24.02, S24.03; Chrome: S24.01, S24.02, S24.03

## GAP-F024-01-PARTLY

**Browse by source: All files, Uploads, Generated files, Artifacts: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F024-01](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md)
- Requirement items: S24.04

## GAP-F024-02-01

**No Audio view, kind or viewer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-02](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md)
- Detail: Affects: all apps. Work needed: Add audio to kinds or wire resource_type, add tab and player.
- Evidence: library.ts:8 (kinds) and TABS list; S24.07 missing on all apps

## GAP-F024-02-02

**No finer file-type filter (PDF, spreadsheet, slides).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-02](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md)
- Detail: Affects: web, desktop, mobile. Work needed: Accept resource_type in the route and add controls.
- Evidence: resource_type unused (library.ts:16-28, route.ts:155-163)

## GAP-F024-02-03

**Mobile media filters are client-side over loaded pages.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-02](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md)
- Detail: Affects: mobile. Work needed: Send kind to the server.
- Evidence: index.tsx:136-142,328-345

## GAP-F024-02-04

**CLI, VS Code and Chrome have no media views.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-02](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md)
- Detail: Affects: cli, vscode, chrome. Work needed: Decide whether they need one (matrix says absent by design for CLI).
- Evidence: docs/product/surface-feature-matrix.md:197-199

## GAP-F024-02-NOTBUILT

**Browse by media type: Images, Videos, Documents, Audio: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F024-02](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md)
- Requirement items: S24.05, S24.06, S24.07, S24.14
- Detail: Web: S24.07; Desktop: S24.07; Mobile: S24.07; CLI: S24.05, S24.06, S24.07, S24.14; VS Code: S24.05, S24.06, S24.07, S24.14; Chrome: S24.05, S24.06, S24.07, S24.14

## GAP-F024-03-01

**No Favourites view or control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-03](../../20-features/024-library-and-file-management-experience/F024-03-recent-favourite-shared-and-folder-views.md)
- Detail: Affects: all apps. Work needed: Data model, endpoint, UI.
- Evidence: S24.09 missing on all; no code found

## GAP-F024-03-02

**No Shared-with-me view.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-03](../../20-features/024-library-and-file-management-experience/F024-03-recent-favourite-shared-and-folder-views.md)
- Detail: Affects: all apps. Work needed: Sharing model for files, then a view.
- Evidence: S24.10; no code found

## GAP-F024-03-03

**Recent means modified, not used.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-03](../../20-features/024-library-and-file-management-experience/F024-03-recent-favourite-shared-and-folder-views.md)
- Detail: Affects: web, desktop, mobile. Work needed: Track last opened or add a Recent section.
- Evidence: media-assets.ts:367

## GAP-F024-03-04

**No real folder hierarchy; only projects are shown as folders, only on web/Electron.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-03](../../20-features/024-library-and-file-management-experience/F024-03-recent-favourite-shared-and-folder-views.md)
- Detail: Affects: mobile, cli, vscode, chrome (none), web (flat). Work needed: Decide folder model, add API.
- Evidence: LibraryView.tsx:849-856

## GAP-F024-03-05

**Tauri desktop has no folder tiles.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-03](../../20-features/024-library-and-file-management-experience/F024-03-recent-favourite-shared-and-folder-views.md)
- Detail: Affects: desktop (Tauri). Work needed: Pass listFolders and openFolder.
- Evidence: DesktopLibrary.tsx transport memo

## GAP-F024-03-NOTBUILT

**Recent, favourite, shared and folder views: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F024-03](../../20-features/024-library-and-file-management-experience/F024-03-recent-favourite-shared-and-folder-views.md)
- Requirement items: S24.08, S24.09, S24.10, S24.11
- Detail: Web: S24.09; Desktop: S24.09; Mobile: S24.08, S24.09, S24.10, S24.11; CLI: S24.08, S24.09, S24.10, S24.11; VS Code: S24.08, S24.09, S24.10, S24.11; Chrome: S24.08, S24.09, S24.10, S24.11

## GAP-F024-04-01

**No grid/list switch on mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-04](../../20-features/024-library-and-file-management-experience/F024-04-search-sort-and-layout.md)
- Detail: Affects: mobile. Work needed: Add a list layout and a toggle.
- Evidence: S24.12 mobile missing; no switch in index.tsx

## GAP-F024-04-02

**Web lacks Oldest first.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-04](../../20-features/024-library-and-file-management-experience/F024-04-search-sort-and-layout.md)
- Detail: Affects: web, desktop. Work needed: Add option.
- Evidence: LibraryView.tsx:122-127 vs library.ts:87

## GAP-F024-04-03

**Mobile sort does not apply to artifacts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-04](../../20-features/024-library-and-file-management-experience/F024-04-search-sort-and-layout.md)
- Detail: Affects: mobile. Work needed: Sort merged rows or explain.
- Evidence: index.tsx:242-256

## GAP-F024-04-04

**Search covers names and prompts only, not contents.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-04](../../20-features/024-library-and-file-management-experience/F024-04-search-sort-and-layout.md)
- Detail: Affects: all. Work needed: Index content if wanted.
- Evidence: media-assets.ts:422-426

## GAP-F024-04-05

**No search or sort in CLI, VS Code, Chrome artifact lists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-04](../../20-features/024-library-and-file-management-experience/F024-04-search-sort-and-layout.md)
- Detail: Affects: cli, vscode, chrome. Work needed: Add q and sort or accept.
- Evidence: apps/cli/src/lib.rs:1359-1368

## GAP-F024-04-NOTBUILT

**Search, sort and layout: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F024-04](../../20-features/024-library-and-file-management-experience/F024-04-search-sort-and-layout.md)
- Requirement items: S24.12, S24.13, S24.19
- Detail: Mobile: S24.12, S24.19; CLI: S24.12, S24.13, S24.19; VS Code: S24.12, S24.13, S24.19; Chrome: S24.12, S24.13, S24.19

## GAP-F024-05-01

**No source-provider or connector filter.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-05](../../20-features/024-library-and-file-management-experience/F024-05-filter-by-origin-owner-project-or-date.md)
- Detail: Affects: all apps. Work needed: Store a source column and add filter.
- Evidence: S24.15; library.ts:5; no filter code

## GAP-F024-05-02

**No owner filter.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-05](../../20-features/024-library-and-file-management-experience/F024-05-filter-by-origin-owner-project-or-date.md)
- Detail: Affects: all. Work needed: Needs shared files first.
- Evidence: S24.16 missing

## GAP-F024-05-03

**No project filter.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-05](../../20-features/024-library-and-file-management-experience/F024-05-filter-by-origin-owner-project-or-date.md)
- Detail: Affects: all. Work needed: Link files to projects in the list.
- Evidence: S24.17 missing; no project column in the list SQL (media-assets.ts:402-440)

## GAP-F024-05-04

**No date filter.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-05](../../20-features/024-library-and-file-management-experience/F024-05-filter-by-origin-owner-project-or-date.md)
- Detail: Affects: all. Work needed: Add date range params and UI.
- Evidence: S24.18 missing

## GAP-F024-05-05

**Brief marks S24.15 done on web and desktop though only two origins exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-05](../../20-features/024-library-and-file-management-experience/F024-05-filter-by-origin-owner-project-or-date.md)
- Detail: Affects: documentation. Work needed: Correct the brief row.
- Evidence: brief S24.15 vs library.ts:5

## GAP-F024-05-NOTBUILT

**Filter by origin, owner, project or date: not built on Web, Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code, Chrome
- Features: [F024-05](../../20-features/024-library-and-file-management-experience/F024-05-filter-by-origin-owner-project-or-date.md)
- Requirement items: S24.15, S24.16, S24.17, S24.18
- Detail: Web: S24.16, S24.17, S24.18; Desktop: S24.16, S24.17, S24.18; CLI: S24.15, S24.16, S24.17, S24.18; VS Code: S24.15, S24.16, S24.17, S24.18; Chrome: S24.15, S24.16, S24.17, S24.18

## GAP-F024-06-01

**No multi-select on web or desktop.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-06](../../20-features/024-library-and-file-management-experience/F024-06-select-and-act-on-several-files.md)
- Detail: Affects: web, desktop. Work needed: Selection state, checkboxes, confirm through useConfirmAction.
- Evidence: No selection state in packages/ui/unified-chat/src/components/library/LibraryView.tsx

## GAP-F024-06-02

**No batch download.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-06](../../20-features/024-library-and-file-management-experience/F024-06-select-and-act-on-several-files.md)
- Detail: Affects: all apps. Work needed: Zip endpoint with allowance check.
- Evidence: S24.21 missing; downloads counted against a monthly allowance (tier-unit-quota-service.ts:446-463)

## GAP-F024-06-03

**No batch move.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-06](../../20-features/024-library-and-file-management-experience/F024-06-select-and-act-on-several-files.md)
- Detail: Affects: all apps. Work needed: Folder or project move API.
- Evidence: S24.22 missing; no folder model (F024-03)

## GAP-F024-06-04

**Batch delete is sequential single requests with no progress.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-06](../../20-features/024-library-and-file-management-experience/F024-06-select-and-act-on-several-files.md)
- Detail: Affects: mobile. Work needed: Batch endpoint and progress.
- Evidence: index.tsx:690-715

## GAP-F024-06-05

**Brief marks S24.20 and S24.23 missing on mobile though the code exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-06](../../20-features/024-library-and-file-management-experience/F024-06-select-and-act-on-several-files.md)
- Detail: Affects: documentation. Work needed: Update the brief rows.
- Evidence: brief vs index.tsx:266-290

## GAP-F024-06-NOTBUILT

**Select and act on several files: not built on Web, Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code, Chrome
- Features: [F024-06](../../20-features/024-library-and-file-management-experience/F024-06-select-and-act-on-several-files.md)
- Requirement items: S24.20, S24.21, S24.22, S24.23
- Detail: Web: S24.20, S24.21, S24.22, S24.23; Desktop: S24.20, S24.21, S24.22, S24.23; CLI: S24.20, S24.21, S24.22, S24.23; VS Code: S24.20, S24.21, S24.22, S24.23; Chrome: S24.20, S24.21, S24.22, S24.23

## GAP-F024-07-01

**Rename is missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-07](../../20-features/024-library-and-file-management-experience/F024-07-rename-duplicate-and-move-a-file.md)
- Detail: Affects: All users on all six apps. Work needed: Add an authenticated, CSRF-protected rename endpoint plus a menu item and a text input on web and mobile.
- Evidence: Brief S24.24; no write path in apps/web/app/api/media/route.ts:90-92

## GAP-F024-07-02

**Duplicate is missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-07](../../20-features/024-library-and-file-management-experience/F024-07-rename-duplicate-and-move-a-file.md)
- Detail: Affects: All users, all apps. Work needed: Add a server copy of the stored bytes with a storage allowance check, and a menu item.
- Evidence: Brief S24.25

## GAP-F024-07-03

**Move to folder is missing, and the Library has no folders of its own**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-07](../../20-features/024-library-and-file-management-experience/F024-07-rename-duplicate-and-move-a-file.md)
- Detail: Affects: All users, all apps. Work needed: Decide the folder model, add a folder column or table, add the move action and a folder view.
- Evidence: Brief S24.11 and S24.26; folders are projects (apps/web/features/library/components/LibraryView.tsx:99-101)

## GAP-F024-07-NOTBUILT

**Rename, duplicate and move a file: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F024-07](../../20-features/024-library-and-file-management-experience/F024-07-rename-duplicate-and-move-a-file.md)
- Requirement items: S24.24, S24.25, S24.26
- Detail: Web: S24.24, S24.25, S24.26; Desktop: S24.24, S24.25, S24.26; Mobile: S24.24, S24.25, S24.26; CLI: S24.24, S24.25, S24.26; VS Code: S24.24, S24.25, S24.26; Chrome: S24.24, S24.25, S24.26

## GAP-F024-08-01

**Mobile has no Add to project**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-08](../../20-features/024-library-and-file-management-experience/F024-08-use-a-file-in-a-chat-or-a-project.md)
- Detail: Affects: Mobile users. Work needed: Add the menu item, a project picker and the knowledge upload client on mobile.
- Evidence: apps/mobile/src/features/library/index.tsx:623-655; brief S24.27

## GAP-F024-08-02

**Internal Tauri Library lacks hand-off actions though the brief marks desktop done**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-08](../../20-features/024-library-and-file-management-experience/F024-08-use-a-file-in-a-chat-or-a-project.md)
- Detail: Affects: Users of the internal desktop build; public Electron is the hosted web app. Work needed: Confirm which desktop surface ships; either wire the transport or drop the claim.
- Evidence: apps/desktop/src/features/library/DesktopLibrary.tsx:158-195

## GAP-F024-08-03

**Add to project copies bytes through the browser and the copy counts again toward storage**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-08](../../20-features/024-library-and-file-management-experience/F024-08-use-a-file-in-a-chat-or-a-project.md)
- Detail: Affects: Web users near their storage allowance. Work needed: Consider a server-side link instead of a copy, or show the cost.
- Evidence: apps/web/features/library/components/LibraryView.tsx:234-240; apps/web/lib/server/file-storage.ts:34-60

## GAP-F024-08-04

**No hand-off on CLI, VS Code or Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-08](../../20-features/024-library-and-file-management-experience/F024-08-use-a-file-in-a-chat-or-a-project.md)
- Detail: Affects: Users of those apps. Work needed: Define whether those apps need a Library at all.
- Evidence: Brief S24.27-S24.29 missing

## GAP-F024-08-NOTBUILT

**Use a file in a chat or a project: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F024-08](../../20-features/024-library-and-file-management-experience/F024-08-use-a-file-in-a-chat-or-a-project.md)
- Requirement items: S24.27, S24.28, S24.29
- Detail: Mobile: S24.27, S24.29; CLI: S24.27, S24.28, S24.29; VS Code: S24.27, S24.28, S24.29; Chrome: S24.27, S24.28, S24.29

## GAP-F024-09-01

**Mobile does not show the erase date; web does**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-09](../../20-features/024-library-and-file-management-experience/F024-09-recently-deleted-and-restore.md)
- Detail: Affects: Mobile users. Work needed: Show 'Kept until <date>' using eraseAfter, already mapped (libraryClient.ts:92).
- Evidence: index.tsx:879 vs LibraryView.tsx:352

## GAP-F024-09-02

**Restore has no storage allowance check**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-09](../../20-features/024-library-and-file-management-experience/F024-09-recently-deleted-and-restore.md)
- Detail: Affects: Users near the plan limit. Work needed: Decide policy and add a check.
- Evidence: media-assets.ts:711-727 [inferred]

## GAP-F024-09-03

**The 30-day value is repeated as literals in SQL and in the cron**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-09](../../20-features/024-library-and-file-management-experience/F024-09-recently-deleted-and-restore.md)
- Detail: Affects: Maintainers. Work needed: Read the one constant everywhere, or confirm a guard checks agreement.
- Evidence: media-assets.ts:432,719; purge route:35 vs deletion-policies.ts:8 (AGENTS.md section 4 forbids hardcoding modelled values)

## GAP-F024-09-04

**No trash on CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-09](../../20-features/024-library-and-file-management-experience/F024-09-recently-deleted-and-restore.md)
- Detail: Affects: Users of those apps. Work needed: Decide scope.
- Evidence: Brief S24.34

## GAP-F024-09-NOTBUILT

**Recently deleted and restore: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F024-09](../../20-features/024-library-and-file-management-experience/F024-09-recently-deleted-and-restore.md)
- Requirement items: S24.34
- Detail: CLI: S24.34; VS Code: S24.34; Chrome: S24.34

## GAP-F024-10-01

**No details panel**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-10](../../20-features/024-library-and-file-management-experience/F024-10-file-details-version-history-and-the-original-sour.md)
- Detail: Affects: All users, all apps. Work needed: Add a panel using existing list fields, plus a used-in lookup.
- Evidence: Brief S24.31

## GAP-F024-10-02

**No version history**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-10](../../20-features/024-library-and-file-management-experience/F024-10-file-details-version-history-and-the-original-sour.md)
- Detail: Affects: All users, all apps. Work needed: Design Library versions and a restore action.
- Evidence: Brief S24.32; versions only for project knowledge (project-knowledge-files.ts:394-402)

## GAP-F024-10-03

**No open external original and no external-source field on Library items**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-10](../../20-features/024-library-and-file-management-experience/F024-10-file-details-version-history-and-the-original-sour.md)
- Detail: Affects: All users. Work needed: Add a source URL field and link.
- Evidence: Brief S24.30; library.ts:60-100

## GAP-F024-10-NOTBUILT

**File details, version history and the original source: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F024-10](../../20-features/024-library-and-file-management-experience/F024-10-file-details-version-history-and-the-original-sour.md)
- Requirement items: S24.30, S24.31, S24.32
- Detail: Web: S24.30, S24.31; Desktop: S24.30, S24.31; Mobile: S24.30, S24.31, S24.32; CLI: S24.30, S24.31, S24.32; VS Code: S24.30, S24.31, S24.32; Chrome: S24.30, S24.31, S24.32

## GAP-F024-11-01

**No processing status**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-11](../../20-features/024-library-and-file-management-experience/F024-11-storage-use-and-file-status.md)
- Detail: Affects: All users, all apps. Work needed: Add a status field from the upload and generation pipeline and show it.
- Evidence: Item shape lacks status (route.ts:66-89); brief S24.36

## GAP-F024-11-02

**Unavailable is client-inferred and absent on mobile; no expired state**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-11](../../20-features/024-library-and-file-management-experience/F024-11-storage-use-and-file-status.md)
- Detail: Affects: Mobile users; web users until a fetch fails. Work needed: Server sends availability; mobile shows the marker.
- Evidence: LibraryView.tsx:575-583; brief S24.35

## GAP-F024-11-03

**Documents and images split is returned but not shown in the code read**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-11](../../20-features/024-library-and-file-management-experience/F024-11-storage-use-and-file-status.md)
- Detail: Affects: Web and mobile users. Work needed: Display the split or drop the query.
- Evidence: route.ts:201-206; libraryClient.ts:36-37

## GAP-F024-11-04

**Storage counts the Library copy and the project copy of an added file**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-11](../../20-features/024-library-and-file-management-experience/F024-11-storage-use-and-file-status.md)
- Detail: Affects: Users who use Add to project. Work needed: Decide whether to deduplicate.
- Evidence: file-storage.ts:34-60

## GAP-F024-11-NOTBUILT

**Storage use and file status: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F024-11](../../20-features/024-library-and-file-management-experience/F024-11-storage-use-and-file-status.md)
- Requirement items: S24.33, S24.35, S24.36
- Detail: Mobile: S24.35, S24.36; CLI: S24.33, S24.35, S24.36; VS Code: S24.33, S24.35, S24.36; Chrome: S24.33, S24.35, S24.36

## GAP-F024-12-01

**No connected-storage browsing in the Library**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-12](../../20-features/024-library-and-file-management-experience/F024-12-connected-storage-and-external-files.md)
- Detail: Affects: All users, all apps. Work needed: Define a source model and a browse API, then UI.
- Evidence: Brief S24.37; LibraryTransport has no such method (LibraryView.tsx:254)

## GAP-F024-12-02

**No refresh of external metadata from the Library**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-12](../../20-features/024-library-and-file-management-experience/F024-12-connected-storage-and-external-files.md)
- Detail: Affects: All users. Work needed: Reuse the project refresh code path.
- Evidence: Brief S24.38

## GAP-F024-12-03

**No save-as-copy of external content**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-12](../../20-features/024-library-and-file-management-experience/F024-12-connected-storage-and-external-files.md)
- Detail: Affects: All users. Work needed: Server fetch into object storage with a storage allowance check.
- Evidence: Brief S24.39

## GAP-F024-12-04

**No external-reference marker and no 'external' origin**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-12](../../20-features/024-library-and-file-management-experience/F024-12-connected-storage-and-external-files.md)
- Detail: Affects: All users. Work needed: Extend the item schema and UI.
- Evidence: library.ts:5; brief S24.40

## GAP-F024-12-05

**No Dropbox support found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F024-12](../../20-features/024-library-and-file-management-experience/F024-12-connected-storage-and-external-files.md)
- Detail: Affects: Users of Dropbox. Work needed: Decide scope, then build a connector.
- Evidence: No Dropbox route found under apps/web/app/api in the search made

## GAP-F024-12-NOTBUILT

**Connected storage and external files: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F024-12](../../20-features/024-library-and-file-management-experience/F024-12-connected-storage-and-external-files.md)
- Requirement items: S24.37, S24.38, S24.39, S24.40
- Detail: Web: S24.37, S24.38, S24.39, S24.40; Desktop: S24.37, S24.38, S24.39, S24.40; Mobile: S24.37, S24.38, S24.39, S24.40; CLI: S24.37, S24.38, S24.39, S24.40; VS Code: S24.37, S24.38, S24.39, S24.40; Chrome: S24.37, S24.38, S24.39, S24.40
