---
id: "GAPS-AREA-095"
type: "gap-list"
title: "Gaps: File and Library components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 95. File and Library components

64 open gaps that touch this area. Area page: [20-features/095-file-and-library-components](../../20-features/095-file-and-library-components/README.md).

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

## CMP-M46

**Attach video files**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F095-04](../../20-features/095-file-and-library-components/F095-04-audio-and-video.md)
- Detail: Video files are not an accepted attachment type.
- Evidence: packages/contracts/cloud-contracts/src/chat-attachment-policy.json (mimeTypes has no video)

## CMP-M47

**Cloud file storage quota and storage manager**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F024-11](../../20-features/024-library-and-file-management-experience/F024-11-storage-use-and-file-status.md), [F095-05](../../20-features/095-file-and-library-components/F095-05-library-catalog-and-storage-use.md)
- Detail: Our Storage page covers on-device usage only; no cloud storage quota is shown.
- Evidence: apps/mobile/app/(app)/settings/storage.tsx:25-32

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

## CMP-W113

**Video file attachments**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F095-04](../../20-features/095-file-and-library-components/F095-04-audio-and-video.md)
- Detail: Video is not an attachable type; video appears only as input images for video generation.
- Evidence: searched: video in packages/contracts/cloud-contracts/src/chat-attachment-policy.json; apps/web/features/chat/lib/video-input-images

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

## GAP-AREA095-LW07

**Image preprocessing is missing beyond the thumbnail: no step strips metadata or normalises stored originals in the code opened. The thumbnail path uses autoOrient only.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-095
- Detail: Area 95. File and Library components
- Evidence: apps/web/lib/server/library-thumbnail.ts:44-60

## GAP-CAP-files-and-attachments-07

**PDF reading with page limits and embedded visuals: Local-mode PDF extraction not established. Web PDF read was seen correct; tool failure 'pymupdf missing' seen once in Work mode.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-11](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md), [F095-03](../../20-features/095-file-and-library-components/F095-03-reading-files-for-the-model-text-scanned-pages-pic.md)
- Requirement items: S14.25, S95.08
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-files-and-attachments-09

**Audio file upload and transcription: No audio attachment, player, transcript panel or timestamp navigation. A transcription worker exists in the platform ledger (S95.10) but is not wired to attach.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F024-02](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md), [F025-05](../../20-features/025-file-previews-and-readers/F025-05-play-audio-and-video-with-transcripts-and-timestam.md), [F095-04](../../20-features/095-file-and-library-components/F095-04-audio-and-video.md)
- Requirement items: S14.13, S24.07, S25.06, S25.23, S95.10
- Detail: Claude unknown, ChatGPT yes; AGI not built

## GAP-CAP-files-and-attachments-10

**Video file attachment: No attachment path, no frame or transcript processor.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F095-04](../../20-features/095-file-and-library-components/F095-04-audio-and-video.md)
- Requirement items: S14.14, S95.11
- Detail: Claude unknown, ChatGPT partly; AGI not built

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

## GAP-F095-01-01

**The brief gives one platform status and no per-app lines; per-app screens that call the routes are only partly mapped.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-01](../../20-features/095-file-and-library-components/F095-01-upload-a-file-two-steps-resumable-for-large-files.md)
- Detail: Affects: All apps. Work needed: Map each app's attach gesture to its route and add per-app status.
- Evidence: knowledge-base/data/area-briefs/095-file-and-library-components.md:3-13

## GAP-F095-01-02

**No upload client exists in VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-01](../../20-features/095-file-and-library-components/F095-01-upload-a-file-two-steps-resumable-for-large-files.md)
- Detail: Affects: surface:vscode. Work needed: Decide whether VS Code needs attachments.
- Evidence: search of apps/extension-vscode found no upload route call

## GAP-F095-01-03

**Local mode attach path is undocumented.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-01](../../20-features/095-file-and-library-components/F095-01-upload-a-file-two-steps-resumable-for-large-files.md)
- Detail: Affects: surface:desktop, surface:mobile. Work needed: Trace Local chat attachments and record the boundary.
- Evidence: No on-device upload code in the files read

## GAP-F095-01-04

**Brief line anchors are stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-01](../../20-features/095-file-and-library-components/F095-01-upload-a-file-two-steps-resumable-for-large-files.md)
- Detail: Affects: Maintainers. Work needed: Regenerate the brief anchors.
- Evidence: complete/route.ts has 57 lines but the brief cites :246 and :318

## GAP-F095-02-01

**Security doc says unconfigured production refuses with external_scanner; code returns scan_unavailable.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-02](../../20-features/095-file-and-library-components/F095-02-safety-checks-on-uploads-content-inspection-and-ma.md)
- Detail: Affects: Operators reading the runbook. Work needed: Correct the doc.
- Evidence: docs/security/upload-scanning.md:45; apps/web/lib/security/upload-scan.ts:418-431

## GAP-F095-02-02

**No quarantine; refused bytes are deleted.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-02](../../20-features/095-file-and-library-components/F095-02-safety-checks-on-uploads-content-inspection-and-ma.md)
- Detail: Affects: Security review of refusals. Work needed: Decide policy; brief says 'rejected, not quarantined, as before'.
- Evidence: apps/web/lib/server/chat-attachment-completion.ts:415

## GAP-F095-02-03

**Deployment state of the scanner is not shown by code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-02](../../20-features/095-file-and-library-components/F095-02-safety-checks-on-uploads-content-inspection-and-ma.md)
- Detail: Affects: All apps in production. Work needed: Record live validation in audit/.
- Evidence: S95.06 unfinished note

## GAP-F095-02-04

**Audio is not scanned by the virus engine.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-02](../../20-features/095-file-and-library-components/F095-02-safety-checks-on-uploads-content-inspection-and-ma.md)
- Detail: Affects: Dictation on every app. Work needed: Accepted by comment (bytes are not stored); confirm.
- Evidence: apps/web/app/api/llm/v1/audio/transcriptions/route.ts:469-472

## GAP-F095-03-01

**Brief marks thumbnails and image preprocessing missing, but code exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-03](../../20-features/095-file-and-library-components/F095-03-reading-files-for-the-model-text-scanned-pages-pic.md)
- Detail: Affects: Planning readers. Work needed: Update brief rows.
- Evidence: apps/web/lib/server/library-thumbnail.ts:51; apps/web/app/api/llm/v1/chat/completions/lib/model-image.ts:63

## GAP-F095-03-02

**Thumbnails are re-rendered on every request.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-03](../../20-features/095-file-and-library-components/F095-03-reading-files-for-the-model-text-scanned-pages-pic.md)
- Detail: Affects: Library on all hosts. Work needed: Optional cache.
- Evidence: apps/web/app/api/files/[id]/thumbnail/route.ts:103

## GAP-F095-03-03

**No metadata stripping on stored images.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-03](../../20-features/095-file-and-library-components/F095-03-reading-files-for-the-model-text-scanned-pages-pic.md)
- Detail: Affects: All apps. Work needed: Decide and implement or record policy.
- Evidence: no upload-time image processing found

## GAP-F095-03-04

**No on-device OCR or text extraction for Local mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-03](../../20-features/095-file-and-library-components/F095-03-reading-files-for-the-model-text-scanned-pages-pic.md)
- Detail: Affects: surface:desktop, surface:mobile in Local mode. Work needed: Decide the Local boundary (SYS-local-inference).
- Evidence: none found

## GAP-F095-03-05

**Brief citations for the extraction owners do not match the files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-03](../../20-features/095-file-and-library-components/F095-03-reading-files-for-the-model-text-scanned-pages-pic.md)
- Detail: Affects: Maintainers. Work needed: Re-anchor.
- Evidence: knowledge-files route has 113 lines; brief cites :430 and :502

## GAP-F095-04-01

**No video frame or transcript processing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-04](../../20-features/095-file-and-library-components/F095-04-audio-and-video.md)
- Detail: Affects: All apps. Work needed: Build or drop from scope.
- Evidence: no extractor found

## GAP-F095-04-02

**Mobile and Chrome dictation transport unclear.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-04](../../20-features/095-file-and-library-components/F095-04-audio-and-video.md)
- Detail: Affects: surface:mobile, surface:chrome. Work needed: Trace and document.
- Evidence: not found in files read

## GAP-F095-04-03

**Local dictation rules unestablished.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-04](../../20-features/095-file-and-library-components/F095-04-audio-and-video.md)
- Detail: Affects: surface:desktop, surface:mobile. Work needed: Verify free of subscription.
- Evidence: desktop local option exists, behaviour unread

## GAP-F095-04-04

**Only one provider supported for transcription.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-04](../../20-features/095-file-and-library-components/F095-04-audio-and-video.md)
- Detail: Affects: Provider-agnostic goal. Work needed: Allow other providers if required.
- Evidence: apps/web/app/api/llm/v1/audio/transcriptions/route.ts:496-503

## GAP-F095-05-01

**Brief gives no per-app status; docs matrix wrong for web and CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-05](../../20-features/095-file-and-library-components/F095-05-library-catalog-and-storage-use.md)
- Detail: Affects: Planning. Work needed: Regenerate the matrix.
- Evidence: docs/product/surface-feature-matrix.md:50,194,197 versus apps/web/app/chat/library/page.tsx and apps/cli/src/cloud/library.rs

## GAP-F095-05-02

**Desktop Library lacks upload.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-05](../../20-features/095-file-and-library-components/F095-05-library-catalog-and-storage-use.md)
- Detail: Affects: surface:desktop. Work needed: Decide whether to pass uploadFiles.
- Evidence: apps/desktop/src/features/library/DesktopLibrary.tsx:157-210

## GAP-F095-05-03

**Search ignores file content.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-05](../../20-features/095-file-and-library-components/F095-05-library-catalog-and-storage-use.md)
- Detail: Affects: All. Work needed: Product decision.
- Evidence: apps/web/lib/server/media-assets.ts:423-427

## GAP-F095-05-04

**Decisions doc storage numbers are stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-05](../../20-features/095-file-and-library-components/F095-05-library-catalog-and-storage-use.md)
- Detail: Affects: Readers. Work needed: Correct the doc.
- Evidence: docs/decisions/wire-or-cut.md:379 vs billing-catalog.ts:619

## GAP-F095-06-01

**No folder hierarchy; 'folders' are projects on web only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-06](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Detail: Affects: Desktop, mobile. Work needed: Decide design.
- Evidence: apps/web/features/library/components/LibraryView.tsx:160

## GAP-F095-06-02

**No scheduled or live sync.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-06](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Detail: Affects: All. Work needed: Design and build, or drop S95.19.
- Evidence: vercel.json cron list

## GAP-F095-06-03

**Brief says reference store missing; it exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-06](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Detail: Affects: Planning. Work needed: Update brief.
- Evidence: apps/web/db/neon/0322_external_resource_references.sql:28

## GAP-F095-06-04

**Only Drive supported for refresh.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-06](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Detail: Affects: Connector users. Work needed: Extend per provider.
- Evidence: origins route :39

## GAP-F095-06-05

**Drive import UI not found outside web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-06](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Detail: Affects: Desktop, mobile. Work needed: Confirm and decide.
- Evidence: search of projects folders

## GAP-F095-07-01

**Generated files never get a version or a lineage edge because no caller passes provenance.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-07](../../20-features/095-file-and-library-components/F095-07-versions-sharing-and-access.md)
- Detail: Affects: surface:web, surface:desktop, surface:mobile users who edit or export generated files.. Work needed: Pass supersedesFileId, parentFileId and derivation from the tool loop and sandbox sweep; add tests.
- Evidence: apps/web/lib/server/generated-file-persist.ts:296-316 versus no caller passing provenance in apps/web (code search).

## GAP-F095-07-02

**No visible history or restore for project file versions or generated file versions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-07](../../20-features/095-file-and-library-components/F095-07-versions-sharing-and-access.md)
- Detail: Affects: All apps.. Work needed: Add restore routes and a version list in the Library and project file views.
- Evidence: Only DELETE and GET on the project file route (knowledge-files/[fileId]/route.ts:96-97); library.ts groups versions in a helper but a screen using it was not confirmed.

## GAP-F095-07-03

**Desktop and CLI have no sharing control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-07](../../20-features/095-file-and-library-components/F095-07-versions-sharing-and-access.md)
- Detail: Affects: surface:desktop, surface:cli.. Work needed: Decide whether the Desktop (which shows the hosted web app) already covers it, and add parity otherwise.
- Evidence: No call to the sharing route found outside web and mobile.

## GAP-F095-07-04

**Migration 0257 header says not applied.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-07](../../20-features/095-file-and-library-components/F095-07-versions-sharing-and-access.md)
- Detail: Affects: Engineers and testers.. Work needed: Confirm applied state with pnpm db:migrate status and fix the header.
- Evidence: apps/web/db/neon/0257_file_versions_and_lineage.sql:4

## GAP-F095-08-01

**permanent=true on a live file returns success false instead of deleting or explaining.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-08](../../20-features/095-file-and-library-components/F095-08-delete-trash-and-restore.md)
- Detail: Affects: API callers and any client that offers permanent delete outside the trash view.. Work needed: Return a typed error or support delete-now with the same hold checks; update tests.
- Evidence: apps/web/lib/server/media-assets.ts:768 requires deleted_at is not null; apps/web/app/api/media/route.ts:63-66.

## GAP-F095-08-02

**Window text is hardcoded in the shared Library view.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-08](../../20-features/095-file-and-library-components/F095-08-delete-trash-and-restore.md)
- Detail: Affects: All Library apps.. Work needed: Read the window from a shared constant.
- Evidence: LibraryView.tsx:736, :2232 versus deletion-policies.ts:8.

## GAP-F095-08-03

**No restore for project source files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-08](../../20-features/095-file-and-library-components/F095-08-delete-trash-and-restore.md)
- Detail: Affects: All apps with projects.. Work needed: Add restore and a trash view or document the intended behaviour.
- Evidence: knowledge-files/[fileId]/route.ts exports DELETE and GET only.

## GAP-F095-08-04

**CLI, VS Code and Chrome have no trash controls found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-08](../../20-features/095-file-and-library-components/F095-08-delete-trash-and-restore.md)
- Detail: Affects: surface:cli, surface:vscode, surface:chrome.. Work needed: Decide scope per app.
- Evidence: No /api/media use in apps/cli.

## GAP-F095-08-05

**The first draft cited a confirmation for permanent delete as unverified; it exists on the shared Library view.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-08](../../20-features/095-file-and-library-components/F095-08-delete-trash-and-restore.md)
- Detail: Affects: Documentation only.. Work needed: None beyond this page.
- Evidence: LibraryView.tsx:744-756.

## GAP-F095-09-01

**No real server-side conversion feature; only a model prompt note and a sandbox template.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-09](../../20-features/095-file-and-library-components/F095-09-download-and-export.md)
- Detail: Affects: All apps; users expecting a Convert action.. Work needed: Define the feature (endpoint or tool), meter it, record lineage with derivation conversion.
- Evidence: apps/web/lib/e2b/execution-tools.ts:31-33; brief pointers at chat-attachment-hydration.ts:437 and tool-loop.ts:3985 do not convert.

## GAP-F095-09-02

**Desktop and mobile export JSON only and not the file archive.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-09](../../20-features/095-file-and-library-components/F095-09-download-and-export.md)
- Detail: Affects: surface:desktop, surface:mobile.. Work needed: Use POST /api/user/export and the archives routes or deep-link to web.
- Evidence: apps/desktop/src/api/cloudAccountData.ts:6; apps/mobile/services/cloudDataExport.ts:49.

## GAP-F095-09-03

**Archive excludes trashed and temporary-chat files and superseded project versions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-09](../../20-features/095-file-and-library-components/F095-09-download-and-export.md)
- Detail: Affects: Users expecting everything.. Work needed: Decide and document the scope; add to the export note.
- Evidence: data-export-archive.ts:279-318.

## GAP-F095-09-04

**Workspace members cannot download a file another member shared via a shared project through this route.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-09](../../20-features/095-file-and-library-components/F095-09-download-and-export.md)
- Detail: Affects: Shared project members.. Work needed: Confirm whether project files are served by a different route; add access if intended.
- Evidence: media-assets.ts:495-520 filters user_id = caller.

## GAP-F095-09-05

**Download and conversion not covered for CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F095-09](../../20-features/095-file-and-library-components/F095-09-download-and-export.md)
- Detail: Affects: Those apps.. Work needed: Decide scope.
- Evidence: No calls found in apps/cli.
