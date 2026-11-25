---
id: "GAPS-AREA-014"
type: "gap-list"
title: "Gaps: Attachment intake components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 14. Attachment intake components

102 open gaps that touch this area. Area page: [20-features/014-attachment-intake-components](../../20-features/014-attachment-intake-components/README.md).

## CMP-C52

**Image previews inside the full-screen transcript**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F014-06](../../20-features/014-attachment-intake-components/F014-06-attach-a-web-page-by-its-link.md), [F014-07](../../20-features/014-attachment-intake-components/F014-07-attach-from-the-library-a-repository-or-a-folder.md)
- Detail: Images are shown only as attachment chips and sent to the model; the CLI never draws one inside the terminal.
- Evidence: searched: sixel, kitty in apps/cli/src

## CMP-CP47

**Oldest images and PDFs trimmed when a request hits the limit**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F014-06](../../20-features/014-attachment-intake-components/F014-06-attach-a-web-page-by-its-link.md), [F014-07](../../20-features/014-attachment-intake-components/F014-07-attach-from-the-library-a-repository-or-a-folder.md)
- Detail: When the held images reach the limit, the next image is refused with a message rather than the oldest being trimmed When the held images reach the limit, the next image is refused with a message rather than the oldest being trimmed.
- Evidence: apps/cli/src/agent/chat.rs:787,1167

## CMP-DP100

**Attach a screenshot from the quick shortcut**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F014-05](../../20-features/014-attachment-intake-components/F014-05-screenshot-and-window-capture.md), [F070-05](../../20-features/070-desktop-application/F070-05-screen-capture-and-computer-use.md), [F109-02](../../20-features/109-optional-native-and-ambient-extensions/F109-02-screen-and-window-capture-to-chat-desktop-shortcut.md)
- Detail: You cannot drag a region, and it hides Quick Ask instead of attaching there Screenshot to Chat captures the whole display under the pointer and pastes it into the main chat; you cannot drag a region, and it hides Quick Ask instead of attaching there.
- Evidence: apps/desktop/electron/screenshot.ts:111-175 (captureToChat); apps/desktop/electron/main.ts:1916

## CMP-M182

**Project file limits by plan**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F014-12](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md), [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md), [F024-08](../../20-features/024-library-and-file-management-experience/F024-08-use-a-file-in-a-chat-or-a-project.md)
- Detail: The app shows no per-plan project file count or size limit.
- Evidence: searched: MAX_FILES, file limit, maxBytes in src/features/projects/projectKnowledge.ts, stores/projects

## CMP-M200

**Library files and folders shared with Viewer or Editor access**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F024-12](../../20-features/024-library-and-file-management-experience/F024-12-connected-storage-and-external-files.md), [F095-06](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Detail: Library has no sharing of files or folders with people.
- Evidence: searched: share, Viewer, Editor in src/features/library; only OS shareFile at library/index.tsx:49

## CMP-M22

**Strip of recent photos inside the add menu**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F014-03](../../20-features/014-attachment-intake-components/F014-03-take-a-photo-with-the-camera.md), [F014-04](../../20-features/014-attachment-intake-components/F014-04-choose-photos-from-the-photo-library.md)
- Detail: The sheet has a Photos card but no strip of recent device photos; its strip shows items from the Library.
- Evidence: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:760 Attach from Library; searched: MediaLibrary, getAssetsAsync, recent photos in AddToChatSheet.tsx

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

## CMP-MP32

**Largest file you can attach**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F014-11](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md)
- Detail: Files are capped at 25 MB each and 25 MB per message, with up to 20 files Files are capped at 25 MB each and 25 MB per message, with up to 20 files.
- Evidence: packages/contracts/cloud-contracts/src/chat-attachment-policy.json:2-6; apps/mobile/src/features/chat/utils/attachmentValidation.ts:34

## CMP-MP37

**Scan a document with the camera**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F014-03](../../20-features/014-attachment-intake-components/F014-03-take-a-photo-with-the-camera.md), [F014-04](../../20-features/014-attachment-intake-components/F014-04-choose-photos-from-the-photo-library.md)
- Detail: Ours has a Scan screen that is opened only by an app shortcut or share intent (apps/mobile/app/_layout.tsx:304-309), no… The row says no leader has this. The catalog row oh08:142 says the ChatGPT iOS camera has a Scan option that captures several pages into one PDF. Ours has a Scan screen that is opened only by an app shortcut or share intent (apps/mobile/app/_layout.tsx:304-309), not from the chat camera, and it read
- Evidence: apps/mobile/app/_layout.tsx:307 (scan intent only); apps/mobile/app/(app)/scan.tsx

## CMP-W102

**Attach ODT, RTF, EPUB and ODS files**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F014-11](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md)
- Detail: The accepted list has PDF, text, code, HTML, JSON, CSV, docx, xlsx, pptx and images only.
- Evidence: packages/contracts/cloud-contracts/src/chat-attachment-policy.json:14-57

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

## CMP-W71

**Plus menu: take a screenshot**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F014-05](../../20-features/014-attachment-intake-components/F014-05-screenshot-and-window-capture.md)
- Detail: No screenshot row in the browser plus menu. Searched screenshot and capture in the composer.
- Evidence: searched: screenshot, getDisplayMedia, captureScreen in apps/web/features/chat/components/Composer

## CMP-WP244

**Project files, limits and search over large knowledge**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F014-12](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md), [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md), [F024-08](../../20-features/024-library-and-file-management-experience/F024-08-use-a-file-in-a-chat-or-a-project.md)
- Detail: Project sources are indexed with a status line; the limit is plan storage (500 MB Free to 100 GB) rather than a file co… Project sources are indexed with a status line; the limit is plan storage (500 MB Free to 100 GB) rather than a file count or per-file size.
- Evidence: apps/web/features/projects/components/KnowledgeIndexStatus.tsx:7; packages/contracts/types/src/billing-catalog.ts:655

## CMP-WP82

**Add Google Drive files to a chat from the + menu**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F024-12](../../20-features/024-library-and-file-management-experience/F024-12-connected-storage-and-external-files.md), [F095-06](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Detail: The chat composer has no add-from-Drive option Drive files can be picked as project sources, but the chat composer has no add-from-Drive option.
- Evidence: apps/web/features/projects/components/SourcesPanel.tsx:244; searched: Drive picker in apps/web/features/chat/components/Composer

## CMP-WP84

**Largest single file in chat**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F014-11](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md), [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: Paid plans take 500 MiB; Free and Basic take 25 MiB Paid plans take 500 MiB; Free and Basic take 25 MiB.
- Evidence: packages/contracts/cloud-contracts/src/chat-attachment-policy.json:2,66-67; types/src/billing-catalog.ts:548-577,617

## CMP-XP1

**Composer + menu: add files**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F014-01](../../20-features/014-attachment-intake-components/F014-01-pick-files-from-the-device.md)
- Detail: No folder picking and no Cmd+U shortcut Upload from device takes images, PDF and text files with size limits; no folder picking and no Cmd+U shortcut.
- Evidence: apps/extension/src/side_panel.ts:14092; apps/extension/src/side_panel.ts:9786

## GAP-AREA014-LW02

**A VS Code file that fails to read in the webview is never sent, but its chip may look attached. The read step drops unread files from the payload; the acknowledgement handler then clears the uploading state on every chip whose name is not in the skipped list and gives it no host id. Matching is by n**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-014
- Detail: Area 14. Attachment intake components
- Evidence: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7671-7703 (payload built, unread files dropped) and 8476-8505 (ack handler). Read-only reading, not run.

## GAP-AREA014-LW09

**CLI repository attachment (S14.11) cites lib.rs:417, which is the help text for the worktree launch flag, not a context attachment. No repository-as-context attach path was found in the CLI.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-014
- Detail: Area 14. Attachment intake components
- Evidence: apps/cli/src/lib.rs:412-416.

## GAP-CAP-files-and-attachments-01

**Attach files from the device picker: Chrome picker takes only images, PDF and text; no folder pick on Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-01](../../20-features/014-attachment-intake-components/F014-01-pick-files-from-the-device.md)
- Requirement items: S14.01, S14.15
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-files-and-attachments-02

**Drag, drop and paste intake: Ledger lists mobile drag and paste as missing while the comparison says the Add sheet reads the clipboard; the two disagree. Web composer keeps plain text only when pasting rich text (W70).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-02](../../20-features/014-attachment-intake-components/F014-02-drag-drop-and-paste-into-the-composer.md)
- Requirement items: S14.02, S14.03
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-files-and-attachments-03

**Supported file and image types: Missing ODT, RTF, EPUB, ODS (W102).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-11](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md)
- Requirement items: S14.24
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-files-and-attachments-04

**Size and count limits per message: Mobile does not use the 500 MiB paid limit (MP32). Desktop, CLI, VS Code and Chrome limits not compared.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-11](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md)
- Requirement items: S14.23
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-files-and-attachments-06

**Image input (vision): Model-compatibility warning missing on mobile, CLI, VS Code, Chrome (S14.35). Web image chip shows a cropped square with no filename (seen).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-12](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md)
- Requirement items: S14.35, S14.36
- Detail: Claude yes, ChatGPT yes; AGI built

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

## GAP-CAP-files-and-attachments-11

**Camera, photo library and document scan on phones: No recent-photo strip; no multi-page scan to one PDF.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-03](../../20-features/014-attachment-intake-components/F014-03-take-a-photo-with-the-camera.md), [F014-04](../../20-features/014-attachment-intake-components/F014-04-choose-photos-from-the-photo-library.md)
- Requirement items: S14.04, S14.05
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-files-and-attachments-12

**Screenshot and window capture: Web ledger and comparison disagree; desktop quick shortcut captures the whole display only (DP100).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-05](../../20-features/014-attachment-intake-components/F014-05-screenshot-and-window-capture.md)
- Requirement items: S14.06, S14.07
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-files-and-attachments-14

**Attachment lifecycle: progress, retry, cancel, per-file errors: No parsing progress (S14.20); no replacement in place (S14.29); no full-size preview before send (S14.30). Seen: chip remove button covers last letters of the filename on web.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-09](../../20-features/014-attachment-intake-components/F014-09-see-preview-remove-and-replace-attachments.md), [F014-10](../../20-features/014-attachment-intake-components/F014-10-upload-progress-retry-and-cancel.md), [F014-11](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md)
- Requirement items: S14.19, S14.20, S14.26, S14.27, S14.28, S14.31, S14.32, S14.33
- Detail: Claude unknown, ChatGPT partly; AGI partly built

## GAP-CAP-files-and-attachments-15

**Warning when the model cannot read an attachment: No warning on mobile, VS Code, Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-12](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md)
- Requirement items: S14.35, S14.36
- Detail: Claude unknown, ChatGPT unknown; AGI partly built

## GAP-CAP-files-and-attachments-16

**Large files: what reaches the model and what is searched: Previews and Library do not show partial extraction (S25.31).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-11](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md), [F025-10](../../20-features/025-file-previews-and-readers/F025-10-show-a-clear-message-when-a-file-cannot-be-preview.md)
- Requirement items: S14.23, S25.31
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-files-and-attachments-17

**Project files as knowledge: Upload of a PDF as project knowledge failed twice in the browser run.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-12](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md), [F024-08](../../20-features/024-library-and-file-management-experience/F024-08-use-a-file-in-a-chat-or-a-project.md)
- Requirement items: S14.21, S24.27
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-files-and-attachments-22

**Connected storage in chat and Library: No cloud-file picker in the composer, no connected browsing in Library, no external-reference marking.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F024-12](../../20-features/024-library-and-file-management-experience/F024-12-connected-storage-and-external-files.md), [F095-06](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Requirement items: S14.09, S24.37, S24.38, S24.39, S24.40, S95.18, S95.19
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-files-and-attachments-26

**Files and images in coding tools: CLI draws no image previews (C52); at the image limit the next image is refused rather than the oldest trimmed (CP47). @path import inside instruction files missing (C405).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-06](../../20-features/014-attachment-intake-components/F014-06-attach-a-web-page-by-its-link.md), [F014-07](../../20-features/014-attachment-intake-components/F014-07-attach-from-the-library-a-repository-or-a-folder.md)
- Requirement items: S14.08, S14.11, S14.12
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-files-and-attachments-29

**Local mode attachments: Local file reading on mobile, and Local attach behaviour on desktop, web and CLI, not established.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-12](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md)
- Requirement items: S14.34
- Detail: Claude unknown, ChatGPT unknown; AGI partly built

## GAP-CAP-files-and-attachments-30

**Retention and privacy note for attached files: No note in CLI or VS Code.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-12](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md)
- Requirement items: S14.34
- Detail: Claude partly, ChatGPT partly; AGI partly built

## GAP-F014-01-01

**Phone File card missing in Local mode**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-01](../../20-features/014-attachment-intake-components/F014-01-pick-files-from-the-device.md)
- Detail: Affects: Phone Local mode. Work needed: Decide whether Local documents should be attachable and, if yes, show the card for the local types.
- Evidence: AddToChatSheet.tsx:719; chat.tsx:1029-1040

## GAP-F014-01-02

**No picture-metadata removal on Chrome and VS Code intake**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-01](../../20-features/014-attachment-intake-components/F014-01-pick-files-from-the-device.md)
- Detail: Affects: Chrome, VS Code. Work needed: Call the shared remover and refuse unreadable pictures.
- Evidence: stripImageMetadata used only in web and phone sources (searched apps/extension/src, apps/extension-vscode/src); web copy promises removal before leaving the device (attachment-metadata.ts:17)

## GAP-F014-01-03

**VS Code picker rejects PDF and Office**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-01](../../20-features/014-attachment-intake-components/F014-01-pick-files-from-the-device.md)
- Detail: Affects: VS Code. Work needed: Product decision on supported types.
- Evidence: ChatStateManager.ts:4024

## GAP-F014-01-04

**Plan limits differ per app for the same account (web 20 files, Chrome 5, VS Code 8, phone plan count)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-01](../../20-features/014-attachment-intake-components/F014-01-pick-files-from-the-device.md)
- Detail: Affects: All. Work needed: Decide whether one count applies everywhere.
- Evidence: freeTrialClient.ts:103; webviewMessages.ts:172; billing-catalog.ts:544

## GAP-F014-02-01

**VS Code drop silently truncated to 8 files**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-02](../../20-features/014-attachment-intake-components/F014-02-drag-drop-and-paste-into-the-composer.md)
- Detail: Affects: VS Code. Work needed: Name the files left out.
- Evidence: webviewContent.ts:7650

## GAP-F014-02-02

**No large-paste-to-file in Chrome and VS Code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-02](../../20-features/014-attachment-intake-components/F014-02-drag-drop-and-paste-into-the-composer.md)
- Detail: Affects: Chrome, VS Code. Work needed: Reuse decideComposerPaste.
- Evidence: side_panel.ts:14584-14589; webviewContent.ts:7730-7745

## GAP-F014-02-03

**Web overlay not gated on disabled composer**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-02](../../20-features/014-attachment-intake-components/F014-02-drag-drop-and-paste-into-the-composer.md)
- Detail: Affects: Web, desktop. Work needed: Verify in a browser, then pass disabled.
- Evidence: ChatComposerNew.tsx:4893 vs 2373

## GAP-F014-02-04

**No file paste in CLI; no drop on phone**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-02](../../20-features/014-attachment-intake-components/F014-02-drag-drop-and-paste-into-the-composer.md)
- Detail: Affects: CLI, phone. Work needed: Product decision.
- Evidence: tui_app.rs:4095-4098; no phone code

## GAP-F014-02-05

**Pasted images not stripped of metadata in VS Code and Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-02](../../20-features/014-attachment-intake-components/F014-02-drag-drop-and-paste-into-the-composer.md)
- Detail: Affects: VS Code, Chrome. Work needed: Share the remover.
- Evidence: no remover in their source

## GAP-F014-03-01

**Camera missing on web, desktop and Chrome composers although documented as wired**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-03](../../20-features/014-attachment-intake-components/F014-03-take-a-photo-with-the-camera.md)
- Detail: Affects: Web, desktop, Chrome. Work needed: Mount it in ComposerPlusMenu or correct the record.
- Evidence: AttachmentMenu.tsx exists but no mounting found; docs/decisions/wire-or-cut.md:439

## GAP-F014-03-02

**Camera screen does not use the shared metadata remover**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-03](../../20-features/014-attachment-intake-components/F014-03-take-a-photo-with-the-camera.md)
- Detail: Affects: Phone. Work needed: Verify and apply withoutPictureMetadata.
- Evidence: camera.tsx:73-77

## GAP-F014-03-03

**Capability table says web camera true**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-03](../../20-features/014-attachment-intake-components/F014-03-take-a-photo-with-the-camera.md)
- Detail: Affects: Web. Work needed: Align the table with the composer.
- Evidence: capabilities.test.tsx line 88-89

## GAP-F014-03-NOTBUILT

**Take a photo with the camera: not built on Web, Desktop, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Chrome
- Features: [F014-03](../../20-features/014-attachment-intake-components/F014-03-take-a-photo-with-the-camera.md)
- Requirement items: S14.04
- Detail: Web: S14.04; Desktop: S14.04; Chrome: S14.04

## GAP-F014-04-01

**Chrome does not clean pictures**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-04](../../20-features/014-attachment-intake-components/F014-04-choose-photos-from-the-photo-library.md)
- Detail: Affects: Chrome. Work needed: Use the shared remover.
- Evidence: no remover in apps/extension/src

## GAP-F014-04-02

**Web refuses HEIC (not in the accepted types)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-04](../../20-features/014-attachment-intake-components/F014-04-choose-photos-from-the-photo-library.md)
- Detail: Affects: Web, desktop. Work needed: Decide on conversion.
- Evidence: chat-attachment-policy.json imageMimeTypes

## GAP-F014-04-03

**No native photo-library picker on web or desktop**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-04](../../20-features/014-attachment-intake-components/F014-04-choose-photos-from-the-photo-library.md)
- Detail: Affects: Web, desktop. Work needed: Product decision.
- Evidence: only the file chooser exists

## GAP-F014-05-01

**Web in a plain browser has no capture although the brief says built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-05](../../20-features/014-attachment-intake-components/F014-05-screenshot-and-window-capture.md)
- Detail: Affects: Web. Work needed: Correct the brief or add a control.
- Evidence: no capture row in ComposerPlusMenu; getDisplayMedia only in unmounted AttachmentMenu

## GAP-F014-05-02

**Previous clipboard image not restored**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-05](../../20-features/014-attachment-intake-components/F014-05-screenshot-and-window-capture.md)
- Detail: Affects: Desktop. Work needed: Save and restore non-text clipboard.
- Evidence: screenshot.ts:150,194

## GAP-F014-05-03

**Failures shown only as OS notifications**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-05](../../20-features/014-attachment-intake-components/F014-05-screenshot-and-window-capture.md)
- Detail: Affects: Desktop. Work needed: Also show a notice in the composer.
- Evidence: screenshot.ts:32-37

## GAP-F014-05-04

**Chrome intake gate returns without a message**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-05](../../20-features/014-attachment-intake-components/F014-05-screenshot-and-window-capture.md)
- Detail: Affects: Chrome. Work needed: Show the uploads-off notice.
- Evidence: side_panel.ts:14641-14642

## GAP-F014-05-05

**No capture in CLI or VS Code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-05](../../20-features/014-attachment-intake-components/F014-05-screenshot-and-window-capture.md)
- Detail: Affects: CLI, VS Code. Work needed: Product decision.
- Evidence: brief

## GAP-F014-05-NOTBUILT

**Screenshot and window capture: not built on Web, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, CLI, VS Code
- Features: [F014-05](../../20-features/014-attachment-intake-components/F014-05-screenshot-and-window-capture.md)
- Requirement items: S14.06, S14.07
- Detail: Web: S14.06, S14.07; CLI: S14.06, S14.07; VS Code: S14.06, S14.07

## GAP-F014-06-01

**VS Code reader has no private-address guard or content-type check**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-06](../../20-features/014-attachment-intake-components/F014-06-attach-a-web-page-by-its-link.md)
- Detail: Affects: VS Code. Work needed: Reuse the CLI or server guard.
- Evidence: composerContext.ts:272-310

## GAP-F014-06-02

**CLI attached page cannot be listed or removed**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-06](../../20-features/014-attachment-intake-components/F014-06-attach-a-web-page-by-its-link.md)
- Detail: Affects: CLI. Work needed: Stage as a chip.
- Evidence: repl/mod.rs:960-966; tui_app.rs:6226-6245

## GAP-F014-06-03

**Caps and rules differ across the three apps**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-06](../../20-features/014-attachment-intake-components/F014-06-attach-a-web-page-by-its-link.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Decide one rule set.
- Evidence: web/mod.rs:126; composerContext.ts:251; url-fetch-tool.ts:42-44

## GAP-F014-06-04

**No URL attach on web, desktop, phone**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-06](../../20-features/014-attachment-intake-components/F014-06-attach-a-web-page-by-its-link.md)
- Detail: Affects: Web, desktop, phone. Work needed: Product decision.
- Evidence: brief n/a

## GAP-F014-07-01

**VS Code is marked done for repository and folder attach in the brief, but no such control or message exists in the code found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-07](../../20-features/014-attachment-intake-components/F014-07-attach-from-the-library-a-repository-or-a-folder.md)
- Detail: Affects: VS Code. Work needed: Decide the requirement; correct the brief or build it.
- Evidence: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3985; apps/extension-vscode/src/protocol/webviewMessages.ts:145

## GAP-F014-07-02

**Folder attach in the CLI gives names only; the brief's 'use the files inside it' is met only by the model opening files itself.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-07](../../20-features/014-attachment-intake-components/F014-07-attach-from-the-library-a-repository-or-a-folder.md)
- Detail: Affects: CLI. Work needed: Confirm with the owner that name-only is the intended behaviour and say so in the product copy.
- Evidence: apps/cli/src/mentions.rs:468-488

## GAP-F014-07-03

**Library submenu in the plus menu cannot search; only the AGI Work popover can.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-07](../../20-features/014-attachment-intake-components/F014-07-attach-from-the-library-a-repository-or-a-folder.md)
- Detail: Affects: Web, desktop. Work needed: Add a search field or move users to the popover.
- Evidence: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1016

## GAP-F014-07-04

**Repository attach is missing on the phone and Chrome and not found in the desktop-specific code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-07](../../20-features/014-attachment-intake-components/F014-07-attach-from-the-library-a-repository-or-a-folder.md)
- Detail: Affects: Phone, Chrome. Work needed: Decide whether required; a decision record says features the leaders lack are not built.
- Evidence: brief S14.11; no code found

## GAP-F014-07-05

**A Library file on web is downloaded then uploaded again, with possible download-allowance cost.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-07](../../20-features/014-attachment-intake-components/F014-07-attach-from-the-library-a-repository-or-a-folder.md)
- Detail: Affects: Web, desktop. Work needed: Send the existing asset id instead of the bytes.
- Evidence: ComposerFilesMenu.tsx:164; WebChatPage.tsx:2684

## GAP-F014-07-NOTBUILT

**Attach from the Library, a repository or a folder: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F014-07](../../20-features/014-attachment-intake-components/F014-07-attach-from-the-library-a-repository-or-a-folder.md)
- Requirement items: S14.10, S14.11, S14.12
- Detail: Mobile: S14.11; CLI: S14.10; VS Code: S14.10, S14.11, S14.12; Chrome: S14.10, S14.11

## GAP-F014-08-01

**No cloud-drive picker in any chat composer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md)
- Detail: Affects: All six apps. Work needed: Product decision, then build with connector scopes.
- Evidence: brief S14.09; greps found none

## GAP-F014-08-02

**No audio or video attachment path.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md)
- Detail: Affects: All six apps. Work needed: Add types to the policy, extraction or provider pass-through, size limits, model capability checks.
- Evidence: chat-attachment-policy.json:14-33

## GAP-F014-08-03

**The shared chat input menu has Drive and GitHub items nobody wires.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md)
- Detail: Affects: Any host of the shared menu. Work needed: Wire or remove the dead items (AGENTS.md section 9 forbids dead controls).
- Evidence: AttachmentMenu.tsx:604, :763

## GAP-F014-08-NOTBUILT

**Cloud drives, audio and video: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md)
- Requirement items: S14.09, S14.13, S14.14
- Detail: Web: S14.09, S14.13, S14.14; Desktop: S14.09, S14.13, S14.14; Mobile: S14.13, S14.14; CLI: S14.13, S14.14; VS Code: S14.09, S14.13, S14.14; Chrome: S14.09, S14.13, S14.14

## GAP-F014-09-01

**No replace-in-place on any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-09](../../20-features/014-attachment-intake-components/F014-09-see-preview-remove-and-replace-attachments.md)
- Detail: Affects: All. Work needed: Design a replace control and keep order.
- Evidence: brief S14.29; no code found

## GAP-F014-09-02

**No preview of document content or full-size image outside the phone.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-09](../../20-features/014-attachment-intake-components/F014-09-see-preview-remove-and-replace-attachments.md)
- Detail: Affects: Web, desktop, CLI, VS Code, Chrome. Work needed: Add a viewer.
- Evidence: brief S14.30

## GAP-F014-09-03

**Chrome chips show no size.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-09](../../20-features/014-attachment-intake-components/F014-09-see-preview-remove-and-replace-attachments.md)
- Detail: Affects: Chrome. Work needed: Render a size label.
- Evidence: side_panel.ts:10416-10470; brief S14.18

## GAP-F014-09-04

**CLI has no icons or thumbnails and no per-file remove for /files items.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-09](../../20-features/014-attachment-intake-components/F014-09-see-preview-remove-and-replace-attachments.md)
- Detail: Affects: CLI. Work needed: Add a remove option for context files.
- Evidence: claude_parity.rs:416-433

## GAP-F014-09-05

**Web image chips show size only in a tooltip.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-09](../../20-features/014-attachment-intake-components/F014-09-see-preview-remove-and-replace-attachments.md)
- Detail: Affects: Web, desktop. Work needed: Show visible size text.
- Evidence: AttachmentPreview.tsx:222

## GAP-F014-09-NOTBUILT

**See, preview, remove and replace attachments: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F014-09](../../20-features/014-attachment-intake-components/F014-09-see-preview-remove-and-replace-attachments.md)
- Requirement items: S14.17, S14.18, S14.29, S14.30
- Detail: Web: S14.29, S14.30; Desktop: S14.29, S14.30; Mobile: S14.29, S14.30; CLI: S14.17, S14.29; VS Code: S14.29, S14.30; Chrome: S14.18, S14.29, S14.30

## GAP-F014-10-01

**No parsing or reading stage after upload.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-10](../../20-features/014-attachment-intake-components/F014-10-upload-progress-retry-and-cancel.md)
- Detail: Affects: Web, desktop, phone. Work needed: Expose intake status as a chip stage.
- Evidence: brief S14.20; no UI state

## GAP-F014-10-02

**Web draft chips show no status until Send; upload does not start at attach.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-10](../../20-features/014-attachment-intake-components/F014-10-upload-progress-retry-and-cancel.md)
- Detail: Affects: Web, desktop. Work needed: Decide whether to upload at attach time as Chrome does.
- Evidence: ChatComposerNew.tsx:5781; WebChatPage.tsx:2684

## GAP-F014-10-03

**Brief marks Chrome n/a for upload status but code has phases, Retry and abort.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-10](../../20-features/014-attachment-intake-components/F014-10-upload-progress-retry-and-cancel.md)
- Detail: Affects: Chrome (documentation). Work needed: Correct the brief.
- Evidence: apps/extension/src/side_panel.ts:10269-10456

## GAP-F014-10-04

**Web Retry reruns the whole attempt, not just the failed file.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-10](../../20-features/014-attachment-intake-components/F014-10-upload-progress-retry-and-cancel.md)
- Detail: Affects: Web, desktop. Work needed: Optional per-file retry.
- Evidence: WebChatPage.tsx:2866-2886

## GAP-F014-10-05

**No visible percentage on web or on the phone chip.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-10](../../20-features/014-attachment-intake-components/F014-10-upload-progress-retry-and-cancel.md)
- Detail: Affects: Web, phone. Work needed: Show text if wanted.
- Evidence: AttachmentPreview.tsx:166-186; phone AttachmentPreview.tsx:330

## GAP-F014-10-NOTBUILT

**Upload progress, retry and cancel: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F014-10](../../20-features/014-attachment-intake-components/F014-10-upload-progress-retry-and-cancel.md)
- Requirement items: S14.20
- Detail: Web: S14.20; Desktop: S14.20; Mobile: S14.20

## GAP-F014-11-01

**VS Code and Chrome have no duplicate check on every path and no batch summary.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-11](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md)
- Detail: Affects: VS Code, Chrome. Work needed: Add duplicate identity and a summary line.
- Evidence: ChatStateManager.ts:4017; side_panel.ts:10343-10400

## GAP-F014-11-02

**Phone batch notice lacks the 'Attached N of M' count.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-11](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md)
- Detail: Affects: Phone. Work needed: Add a count line to the alert.
- Evidence: ChatInput.tsx:660-667

## GAP-F014-11-03

**VS Code picker warnings do not name the file.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-11](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md)
- Detail: Affects: VS Code. Work needed: Name each skipped file.
- Evidence: ChatStateManager.ts:4014

## GAP-F014-11-04

**Locked PDF on phone Local reaches the person only if the on-device model repeats the note.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-11](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md)
- Detail: Affects: Phone Local. Work needed: Show a notice in the app.
- Evidence: attachmentContext.ts:44

## GAP-F014-11-05

**Web display path for the locked-PDF 400 not traced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-11](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md)
- Detail: Affects: Web, desktop. Work needed: Trace and test that the message reaches the person.
- Evidence: chat-attachment-hydration.ts:661

## GAP-F014-11-NOTBUILT

**Limits, duplicates and refusals: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F014-11](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md)
- Requirement items: S14.31, S14.33
- Detail: VS Code: S14.31, S14.33; Chrome: S14.31, S14.33

## GAP-F014-12-01

**No model-fit warning on phone, VS Code or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-12](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md)
- Detail: Affects: Phone, VS Code, Chrome. Work needed: Add a pre-send check against the model catalogue.
- Evidence: brief S14.35; attachmentValidation.ts has types and counts only

## GAP-F014-12-02

**CLI and web say different things about temporary-chat attachment retention.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-12](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md)
- Detail: Affects: CLI, web, phone. Work needed: Confirm real behaviour in the deletion jobs and align the copy.
- Evidence: claude_parity.rs:465; ComposerPlusMenu.tsx:157-158

## GAP-F014-12-03

**Retention note on web is a tooltip only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-12](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md)
- Detail: Affects: Web, desktop. Work needed: Show as visible text.
- Evidence: ComposerPlusMenu.tsx:893-899

## GAP-F014-12-04

**No indexing progress on the phone; no retention note in VS Code or per file in Chrome and CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-12](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md)
- Detail: Affects: Phone, VS Code, Chrome, CLI. Work needed: Decide and build or record as not required.
- Evidence: brief S14.21, S14.34

## GAP-F014-12-05

**Brief marks CLI retention missing; a general Retention line exists in /privacy.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F014-12](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md)
- Detail: Affects: CLI (documentation). Work needed: Correct the brief.
- Evidence: claude_parity.rs:465

## GAP-F014-12-NOTBUILT

**Retention and model fit: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F014-12](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md)
- Requirement items: S14.21, S14.34, S14.35, S14.36
- Detail: Mobile: S14.21, S14.35; CLI: S14.34, S14.35; VS Code: S14.34, S14.35, S14.36; Chrome: S14.35, S14.36
