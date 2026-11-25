---
id: "GAPS-AREA-025"
type: "gap-list"
title: "Gaps: File previews and readers"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 25. File previews and readers

79 open gaps that touch this area. Area page: [20-features/025-file-previews-and-readers](../../20-features/025-file-previews-and-readers/README.md).

## CMP-M45

**Attach audio files**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F024-02](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md), [F025-05](../../20-features/025-file-previews-and-readers/F025-05-play-audio-and-video-with-transcripts-and-timestam.md), [F095-04](../../20-features/095-file-and-library-components/F095-04-audio-and-video.md)
- Detail: Audio files are not an accepted attachment type.
- Evidence: packages/contracts/cloud-contracts/src/chat-attachment-policy.json (mimeTypes has no audio)

## CMP-MP30

**Create Word, PowerPoint and Excel files in chat**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F024-01](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md), [F025-07](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md)
- Detail: PDF is not an option A Create file row asks for a Document, Presentation or Spreadsheet; PDF is not an option.
- Evidence: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1185; packages/contracts/cloud-contracts/src/skills.ts:22

## CMP-MP31

**Data analysis with code run in a sandbox**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md), [F025-03](../../20-features/025-file-previews-and-readers/F025-03-preview-office-files-and-archives.md), [F057-02](../../20-features/057-tool-catalog-and-invocation-experience/F057-02-your-files-find-read-write-and-edit.md), [F057-03](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Detail: Interactive data tables from analysis were not found Code execution runs and its code shows in chat; interactive data tables from analysis were not found.
- Evidence: apps/mobile/src/features/chat/components/CodeExecutionBlock.tsx; lib/v1FeatureFlags.ts:codeExecution=true

## CMP-W103

**Audio file upload and transcription**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F024-02](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md), [F025-05](../../20-features/025-file-previews-and-readers/F025-05-play-audio-and-video-with-transcripts-and-timestam.md), [F049-04](../../20-features/049-dictation-transcription-and-recording/F049-04-batch-and-file-transcription.md), [F095-04](../../20-features/095-file-and-library-components/F095-04-audio-and-video.md)
- Detail: Audio is not an attachable type in chat.
- Evidence: searched: audio types in packages/contracts/cloud-contracts/src/chat-attachment-policy.json:14-32

## CMP-WP83

**Create Word, PowerPoint, Excel and PDF files**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F024-01](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md), [F025-07](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md), [F096-04](../../20-features/096-artifact-and-generated-application-components/F096-04-office-and-pdf-file-generation.md)
- Detail: There is no PDF output An Output row creates Word, PowerPoint or Excel files; there is no PDF output.
- Evidence: apps/web/lib/chat-output-format.ts:11-15; Composer/ComposerPlusMenu.tsx:960-1010

## CMP-WP89

**Interactive table view for uploaded data**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F025-03](../../20-features/025-file-previews-and-readers/F025-03-preview-office-files-and-archives.md), [F057-03](../../20-features/057-tool-catalog-and-invocation-experience/F057-03-running-code-and-shell-commands.md)
- Detail: Row and column selection to ask about was not found Spreadsheet, table and CSV artifacts render as tables; row and column selection to ask about was not found.
- Evidence: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1802

## CMP-WP98

**Bring data into a sheet from CSV, Excel, Google Sheets or paste; export xlsx or CSV**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F025-03](../../20-features/025-file-previews-and-readers/F025-03-preview-office-files-and-archives.md), [F029-02](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-02-grid-view-and-cell-editing.md), [F029-03](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-03-formulas-and-named-ranges.md), [F029-06](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-06-charts.md), [F029-11](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-11-assistant-changes-to-a-sheet-preview-and-accept-or.md), [F029-12](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-12-export-and-reports-workbook-csv-chart-report-and-s.md)
- Detail: No import into an editable sheet and no .xlsx export Attached CSV and Excel files preview as tables and a sheet downloads as CSV; no import into an editable sheet and no .xlsx export.
- Evidence: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2375; packages/ui/unified-chat/src/lib/workbook-sheets.ts:673

## GAP-AREA025-LW07

**The ask-about-file bar shows two disabled buttons (plus and microphone) and a static 'Auto' label. They are decorative and do nothing, which breaks the rule against dead controls.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-025
- Detail: Area 25. File previews and readers
- Evidence: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1336-1344, 1353-1358, 1359-1367

## GAP-AREA025-LW08

**Clicking a non-previewable item in the Library does nothing in this path; no message is shown.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-025
- Detail: Area 25. File previews and readers
- Evidence: packages/ui/unified-chat/src/components/library/LibraryView.tsx:810 (openItem only opens the viewer when item.previewable)

## GAP-CAP-files-and-attachments-08

**Spreadsheets and data files with analysis: No interactive table selection; no import into an editable sheet (WP98). Xlsx creation failed every time in the browser run.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F025-03](../../20-features/025-file-previews-and-readers/F025-03-preview-office-files-and-archives.md)
- Requirement items: S25.08
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-files-and-attachments-09

**Audio file upload and transcription: No audio attachment, player, transcript panel or timestamp navigation. A transcription worker exists in the platform ledger (S95.10) but is not wired to attach.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-08](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md), [F024-02](../../20-features/024-library-and-file-management-experience/F024-02-browse-by-media-type-images-videos-documents-audio.md), [F025-05](../../20-features/025-file-previews-and-readers/F025-05-play-audio-and-video-with-transcripts-and-timestam.md), [F095-04](../../20-features/095-file-and-library-components/F095-04-audio-and-video.md)
- Requirement items: S14.13, S24.07, S25.06, S25.23, S95.10
- Detail: Claude unknown, ChatGPT yes; AGI not built

## GAP-CAP-files-and-attachments-16

**Large files: what reaches the model and what is searched: Previews and Library do not show partial extraction (S25.31).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F014-11](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md), [F025-10](../../20-features/025-file-previews-and-readers/F025-10-show-a-clear-message-when-a-file-cannot-be-preview.md)
- Requirement items: S14.23, S25.31
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-files-and-attachments-23

**Previews and readers for files: No pptx or archive preview, no page thumbnails, no search inside a file, no fit and rotate controls. Desktop has no Open File menu item (D104).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F025-01](../../20-features/025-file-previews-and-readers/F025-01-read-a-pdf-and-move-through-its-pages.md), [F025-02](../../20-features/025-file-previews-and-readers/F025-02-read-plain-text-markdown-and-source-code.md), [F025-03](../../20-features/025-file-previews-and-readers/F025-03-preview-office-files-and-archives.md), [F025-04](../../20-features/025-file-previews-and-readers/F025-04-view-an-image.md), [F025-05](../../20-features/025-file-previews-and-readers/F025-05-play-audio-and-video-with-transcripts-and-timestam.md), [F025-06](../../20-features/025-file-previews-and-readers/F025-06-zoom-and-full-screen-view.md), [F025-07](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md), [F025-08](../../20-features/025-file-previews-and-readers/F025-08-search-inside-a-file.md), [F025-10](../../20-features/025-file-previews-and-readers/F025-10-show-a-clear-message-when-a-file-cannot-be-preview.md)
- Requirement items: S25.01, S25.02, S25.03, S25.04, S25.05, S25.07, S25.08, S25.09, S25.10, S25.11, S25.12, S25.14, S25.18, S25.26, S25.27, S25.29, S25.30
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-files-and-attachments-24

**Ask about a selected part, page or passage: Not in file readers on web, desktop, mobile.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F025-09](../../20-features/025-file-previews-and-readers/F025-09-ask-about-a-selected-passage-or-the-whole-file.md)
- Requirement items: S25.20, S25.21, S25.22
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-files-and-attachments-25

**Generated files in Library and download: No PDF creation in chat; xlsx creation failing in the browser run; dispatch summary card not downloadable.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F024-01](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md), [F025-07](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md)
- Requirement items: S24.03, S25.26
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F025-01-01

**No page thumbnails, page jump, fit-to-width, fit-to-page or rotate in any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-01](../../20-features/025-file-previews-and-readers/F025-01-read-a-pdf-and-move-through-its-pages.md)
- Detail: Affects: All users on web, Electron Desktop and mobile.. Work needed: Design and build shared page controls; decide whether to replace the browser frame with a renderer.
- Evidence: No such control in LibraryView.tsx:1210-1310, FilePreviewModal.tsx:351-417 or PdfFileView.tsx; brief S25.12-S25.17.

## GAP-F025-01-02

**Tauri desktop Library cannot show a PDF: no inlinePreviewUri and its dialog is unreachable.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-01](../../20-features/025-file-previews-and-readers/F025-01-read-a-pdf-and-move-through-its-pages.md)
- Detail: Affects: Retained Tauri desktop tree only; public Desktop is Electron and unaffected.. Work needed: Wire inlinePreviewUri with authenticated blob URLs, or drop the retained screen.
- Evidence: DesktopLibrary.tsx:96-181; LibraryView.tsx:267; DesktopLibrary.test.tsx:162-180.

## GAP-F025-01-03

**Brief marks mobile PDF 'missing' but code has a working reader; the brief is stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-01](../../20-features/025-file-previews-and-readers/F025-01-read-a-pdf-and-move-through-its-pages.md)
- Detail: Affects: Anyone reading the brief.. Work needed: Correct the brief rows.
- Evidence: DocumentFileView.tsx:173-206; Library index.tsx:1153.

## GAP-F025-01-04

**VS Code and Chrome have no PDF reader.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-01](../../20-features/025-file-previews-and-readers/F025-01-read-a-pdf-and-move-through-its-pages.md)
- Detail: Affects: VS Code and Chrome users.. Work needed: Decide scope; at least an Open in app action.
- Evidence: apps/extension-vscode/src/features/artifacts/artifactActions.ts; apps/extension/src/features/side-panel/generatedFiles.ts

## GAP-F025-01-05

**Project modal sandbox may stop the browser PDF viewer drawing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-01](../../20-features/025-file-previews-and-readers/F025-01-read-a-pdf-and-move-through-its-pages.md)
- Detail: Affects: Web project PDF preview.. Work needed: Verify in real browsers; adjust if blank.
- Evidence: FilePreviewModal.tsx:414 sandbox="allow-same-origin".

## GAP-F025-01-NOTBUILT

**Read a PDF and move through its pages: not built on Web, Desktop, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, VS Code, Chrome
- Features: [F025-01](../../20-features/025-file-previews-and-readers/F025-01-read-a-pdf-and-move-through-its-pages.md)
- Requirement items: S25.01, S25.12, S25.13, S25.15, S25.16, S25.17
- Detail: Web: S25.12, S25.15, S25.16, S25.17; Desktop: S25.12, S25.15, S25.16, S25.17; VS Code: S25.01, S25.12, S25.13, S25.15, S25.16, S25.17; Chrome: S25.01, S25.12, S25.13, S25.15, S25.16, S25.17

## GAP-F025-02-01

**Shared Library viewer shows Markdown and code as plain text.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-02](../../20-features/025-file-previews-and-readers/F025-02-read-plain-text-markdown-and-source-code.md)
- Detail: Affects: Web, Electron Desktop Library users.. Work needed: Render by type in the shared viewer.
- Evidence: FileTextPreview.tsx:86-89 versus FilePreviewModal.tsx:131-164.

## GAP-F025-02-02

**Mobile cannot preview code files and shows Markdown as plain lines.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-02](../../20-features/025-file-previews-and-readers/F025-02-read-plain-text-markdown-and-source-code.md)
- Detail: Affects: Mobile users.. Work needed: Add code classes and a Markdown renderer.
- Evidence: viewerKind.ts:45-53; TextFileView.tsx:115-126.

## GAP-F025-02-03

**Two text paths with different limits (raw fetch with no cap versus 200000-character route).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-02](../../20-features/025-file-previews-and-readers/F025-02-read-plain-text-markdown-and-source-code.md)
- Detail: Affects: Web project users with huge text files.. Work needed: Route project text through the same capped preview.
- Evidence: FilePreviewModal.tsx:95 versus file-text-preview.ts:66-70.

## GAP-F025-02-04

**Chrome has no text reader; VS Code reads chat artifacts only, not Library files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-02](../../20-features/025-file-previews-and-readers/F025-02-read-plain-text-markdown-and-source-code.md)
- Detail: Affects: Chrome and VS Code users.. Work needed: Decide scope per surface.
- Evidence: surface matrix docs/product/surface-feature-matrix.md:198-199.

## GAP-F025-02-05

**Brief marks VS Code source-code 'done'; the code is an artifact editor tab, not a file previewer, and its link to file types was not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-02](../../20-features/025-file-previews-and-readers/F025-02-read-plain-text-markdown-and-source-code.md)
- Detail: Affects: Brief accuracy.. Work needed: Reword the brief row.
- Evidence: artifactActions.ts:98-125.

## GAP-F025-02-NOTBUILT

**Read plain text, Markdown and source code: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F025-02](../../20-features/025-file-previews-and-readers/F025-02-read-plain-text-markdown-and-source-code.md)
- Requirement items: S25.02, S25.03, S25.04
- Detail: Chrome: S25.02, S25.03, S25.04

## GAP-F025-03-01

**No archive (zip) listing anywhere.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-03](../../20-features/025-file-previews-and-readers/F025-03-preview-office-files-and-archives.md)
- Detail: Affects: All apps.. Work needed: Add a bounded listing endpoint and viewer.
- Evidence: No code found; brief S25.11.

## GAP-F025-03-02

**Library viewer lacks the slide view that the project modal has; Library pptx is text.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-03](../../20-features/025-file-previews-and-readers/F025-03-preview-office-files-and-archives.md)
- Detail: Affects: Web and Electron Library users.. Work needed: Reuse PptxFilePreview in the shared viewer.
- Evidence: FilePreviewModal.tsx:419-425 versus LibraryView.tsx:1171-1176.

## GAP-F025-03-03

**Multi-sheet workbooks show only the first sheet on web and CLI with no sheet picker.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-03](../../20-features/025-file-previews-and-readers/F025-03-preview-office-files-and-archives.md)
- Detail: Affects: Web, Electron, CLI users.. Work needed: Sheet selection or tabs.
- Evidence: office-document-text.ts:715-727.

## GAP-F025-03-04

**Brief says CLI and mobile are missing for Office files; code shows CLI reads the same text route and mobile has viewers.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-03](../../20-features/025-file-previews-and-readers/F025-03-preview-office-files-and-archives.md)
- Detail: Affects: Brief accuracy.. Work needed: Run to confirm, then correct the brief.
- Evidence: lib.rs:7318-7334; WorkbookFileView.tsx; DocumentFileView.tsx.

## GAP-F025-03-05

**Tauri desktop shows no Office preview.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-03](../../20-features/025-file-previews-and-readers/F025-03-preview-office-files-and-archives.md)
- Detail: Affects: Retained Tauri tree.. Work needed: Wire textPreviewUri or retire.
- Evidence: DesktopLibrary.tsx:59-72.

## GAP-F025-03-06

**VS Code and Chrome have no Office preview.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-03](../../20-features/025-file-previews-and-readers/F025-03-preview-office-files-and-archives.md)
- Detail: Affects: VS Code, Chrome.. Work needed: Decide scope.
- Evidence: No code under their artifact or side-panel folders.

## GAP-F025-03-NOTBUILT

**Preview Office files and archives: not built on Web, Desktop, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, VS Code, Chrome
- Features: [F025-03](../../20-features/025-file-previews-and-readers/F025-03-preview-office-files-and-archives.md)
- Requirement items: S25.08, S25.09, S25.10, S25.11
- Detail: Web: S25.09, S25.11; Desktop: S25.09, S25.11; VS Code: S25.08, S25.09, S25.10, S25.11; Chrome: S25.08, S25.09, S25.10, S25.11

## GAP-F025-04-01

**Web zoom has no pan, fit or reset.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-04](../../20-features/025-file-previews-and-readers/F025-04-view-an-image.md)
- Detail: Affects: Web and Electron users.. Work needed: Add pan and fit.
- Evidence: LibraryView.tsx:1221-1250, 1285-1291.

## GAP-F025-04-02

**Tauri Library cannot show images.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-04](../../20-features/025-file-previews-and-readers/F025-04-view-an-image.md)
- Detail: Affects: Retained Tauri tree.. Work needed: Wire authenticated blob URLs.
- Evidence: DesktopLibrary.test.tsx:162-180.

## GAP-F025-04-03

**No image viewer in VS Code; Chrome viewer has no zoom found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-04](../../20-features/025-file-previews-and-readers/F025-04-view-an-image.md)
- Detail: Affects: VS Code, Chrome.. Work needed: Decide scope.
- Evidence: mediaViewer.ts lines 1-65; artifacts folder.

## GAP-F025-04-04

**Project modal image has no zoom.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-04](../../20-features/025-file-previews-and-readers/F025-04-view-an-image.md)
- Detail: Affects: Web project users.. Work needed: Reuse the Library viewer.
- Evidence: FilePreviewModal.tsx:397-408.

## GAP-F025-04-05

**Brief says Chrome image viewer is missing; one exists for answer files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-04](../../20-features/025-file-previews-and-readers/F025-04-view-an-image.md)
- Detail: Affects: Brief accuracy.. Work needed: Correct the row.
- Evidence: mediaViewer.ts:11.

## GAP-F025-04-NOTBUILT

**View an image: not built on VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code
- Features: [F025-04](../../20-features/025-file-previews-and-readers/F025-04-view-an-image.md)
- Requirement items: S25.05
- Detail: VS Code: S25.05

## GAP-F025-05-01

**No audio player.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-05](../../20-features/025-file-previews-and-readers/F025-05-play-audio-and-video-with-transcripts-and-timestam.md)
- Detail: Affects: All apps.. Work needed: Add audio branch and previewable rule.
- Evidence: library/route.ts:51-58; FileViewerScreen.tsx:190-212.

## GAP-F025-05-02

**No transcript panel or timestamp navigation.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-05](../../20-features/025-file-previews-and-readers/F025-05-play-audio-and-video-with-transcripts-and-timestam.md)
- Detail: Affects: All apps.. Work needed: Needs transcription route, storage and UI.
- Evidence: No code found.

## GAP-F025-05-03

**Mobile downloads the whole video first.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-05](../../20-features/025-file-previews-and-readers/F025-05-play-audio-and-video-with-transcripts-and-timestam.md)
- Detail: Affects: Mobile users on slow links.. Work needed: Stream from the range endpoint.
- Evidence: fileCreation.ts:586-596.

## GAP-F025-05-04

**Tauri Library video request has no auth.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-05](../../20-features/025-file-previews-and-readers/F025-05-play-audio-and-video-with-transcripts-and-timestam.md)
- Detail: Affects: Retained Tauri tree.. Work needed: Authenticated blob playback.
- Evidence: LibraryView.tsx:1170; DesktopLibrary.tsx.

## GAP-F025-05-05

**VS Code has no video player; Chrome has one for answer files only (brief says missing).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-05](../../20-features/025-file-previews-and-readers/F025-05-play-audio-and-video-with-transcripts-and-timestam.md)
- Detail: Affects: VS Code, Chrome.. Work needed: Correct brief; decide scope.
- Evidence: generatedFiles.ts:340-410.

## GAP-F025-05-NOTBUILT

**Play audio and video, with transcripts and timestamps: not built on Web, Desktop, Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code
- Features: [F025-05](../../20-features/025-file-previews-and-readers/F025-05-play-audio-and-video-with-transcripts-and-timestam.md)
- Requirement items: S25.06, S25.07, S25.23, S25.24
- Detail: Web: S25.06, S25.23, S25.24; Desktop: S25.06, S25.23, S25.24; Mobile: S25.06, S25.23, S25.24; CLI: S25.23, S25.24; VS Code: S25.06, S25.07, S25.23, S25.24

## GAP-F025-06-01

**Zoom only for images; none for PDF, text, tables, video.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-06](../../20-features/025-file-previews-and-readers/F025-06-zoom-and-full-screen-view.md)
- Detail: Affects: All apps.. Work needed: Extend per type.
- Evidence: LibraryView.tsx:1221.

## GAP-F025-06-02

**No fit or reset and no pan on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-06](../../20-features/025-file-previews-and-readers/F025-06-zoom-and-full-screen-view.md)
- Detail: Affects: Web and Electron.. Work needed: Add controls.
- Evidence: LibraryView.tsx:1285-1291.

## GAP-F025-06-03

**The Library viewer is a window overlay, not full-screen mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-06](../../20-features/025-file-previews-and-readers/F025-06-zoom-and-full-screen-view.md)
- Detail: Affects: Web users wanting true full-screen.. Work needed: Decide if a full-screen toggle is needed.
- Evidence: LibraryView.tsx:1197-1208.

## GAP-F025-06-04

**VS Code and Chrome have no zoom.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-06](../../20-features/025-file-previews-and-readers/F025-06-zoom-and-full-screen-view.md)
- Detail: Affects: VS Code, Chrome.. Work needed: Decide scope.
- Evidence: mediaViewer.ts.

## GAP-F025-06-05

**Tauri Library cannot show images to zoom.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-06](../../20-features/025-file-previews-and-readers/F025-06-zoom-and-full-screen-view.md)
- Detail: Affects: Retained Tauri tree.. Work needed: Wire inline preview.
- Evidence: DesktopLibrary.test.tsx:178.

## GAP-F025-06-NOTBUILT

**Zoom and full-screen view: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F025-06](../../20-features/025-file-previews-and-readers/F025-06-zoom-and-full-screen-view.md)
- Requirement items: S25.14, S25.25
- Detail: VS Code: S25.14, S25.25; Chrome: S25.14, S25.25

## GAP-F025-07-01

**No copy control and no confirmed copy behaviour in the preview**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-07](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md)
- Detail: Affects: Web, public Desktop, mobile. Work needed: Verify selection copy in a browser; add a Copy button for text and table previews.
- Evidence: FileTextPreview.tsx:75-79 shows a plain block; brief S25.28 unverified

## GAP-F025-07-02

**No open in native application**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-07](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md)
- Detail: Affects: Web, Desktop (brief), Chrome, CLI. Work needed: Add an open-in-default-app host action on Electron; decide for web and CLI.
- Evidence: brief S25.29; apps/cli/src/lib.rs:2349 is unrelated marketplace code

## GAP-F025-07-03

**No converted-text download on mobile**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-07](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md)
- Detail: Affects: Mobile. Work needed: Wire the text export to the viewer, or decide it is not needed.
- Evidence: brief S25.27 mobile missing; exportSourceFile not used by library/index.tsx

## GAP-F025-07-04

**Saved text copy of a cut preview is silently cut**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-07](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md)
- Detail: Affects: Web, Desktop. Work needed: Warn in the file or the UI before saving.
- Evidence: LibraryView.tsx:1259 uses preview.text, which is cut by file-text-preview.ts:66-70

## GAP-F025-07-05

**Project modal download reads the whole file into memory and ignores the download meter hand-off**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-07](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md)
- Detail: Affects: Web project sources. Work needed: Reuse the Library download path.
- Evidence: FilePreviewModal.tsx:259-276

## GAP-F025-07-06

**Tauri Library has no text copy and no browser hand-off**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-07](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md)
- Detail: Affects: Tauri build only. Work needed: None unless Tauri is made public.
- Evidence: DesktopLibrary.tsx:157-207

## GAP-F025-07-07

**Chrome extension has nothing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-07](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md)
- Detail: Affects: Chrome. Work needed: Decide scope.
- Evidence: brief S25.26-S25.29 Chrome missing

## GAP-F025-07-NOTBUILT

**Save, copy or open a file outside the viewer: not built on Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F025-07](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md)
- Requirement items: S25.27, S25.29
- Detail: Desktop: S25.29; Mobile: S25.27; CLI: S25.27; VS Code: S25.27; Chrome: S25.27, S25.29

## GAP-F025-07-PARTLY

**Save, copy or open a file outside the viewer: partly built on Web, Desktop, Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F025-07](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md)
- Requirement items: S25.28

## GAP-F025-08-01

**No in-file search or highlight**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-08](../../20-features/025-file-previews-and-readers/F025-08-search-inside-a-file.md)
- Detail: Affects: All six apps. Work needed: Design the control in the shared viewer, add match highlighting for text and table, add mobile and VS Code equivalents or state they are out of scope.
- Evidence: area brief S25.18 and S25.19 all missing; no code found

## GAP-F025-08-02

**Name search could be mistaken for in-file search**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-08](../../20-features/025-file-previews-and-readers/F025-08-search-inside-a-file.md)
- Detail: Affects: Web, Desktop. Work needed: Keep the label clear.
- Evidence: LibraryView.tsx:1000-1004

## GAP-F025-08-NOTBUILT

**Search inside a file: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F025-08](../../20-features/025-file-previews-and-readers/F025-08-search-inside-a-file.md)
- Requirement items: S25.18, S25.19
- Detail: Web: S25.18, S25.19; Desktop: S25.18, S25.19; Mobile: S25.18, S25.19; CLI: S25.18, S25.19; VS Code: S25.18, S25.19; Chrome: S25.18, S25.19

## GAP-F025-09-01

**No question about selected text on web, Desktop, mobile, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-09](../../20-features/025-file-previews-and-readers/F025-09-ask-about-a-selected-passage-or-the-whole-file.md)
- Detail: Affects: Web, Desktop, mobile, Chrome. Work needed: Capture the selection in the shared viewer and attach it to the staged draft.
- Evidence: brief S25.20; no selection code in LibraryView.tsx

## GAP-F025-09-02

**No page or range question**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-09](../../20-features/025-file-previews-and-readers/F025-09-ask-about-a-selected-passage-or-the-whole-file.md)
- Detail: Affects: All except VS Code line ranges. Work needed: Page or range input for documents.
- Evidence: brief S25.21

## GAP-F025-09-03

**No passage highlight from a citation**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-09](../../20-features/025-file-previews-and-readers/F025-09-ask-about-a-selected-passage-or-the-whole-file.md)
- Detail: Affects: All apps. Work needed: Search for the quoted text and highlight it; needs F025-08.
- Evidence: brief S25.22; FilePreviewModal page comment lines 15-19

## GAP-F025-09-04

**Decorative disabled controls in the ask bar**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-09](../../20-features/025-file-previews-and-readers/F025-09-ask-about-a-selected-passage-or-the-whole-file.md)
- Detail: Affects: Web, Desktop. Work needed: Remove or wire them (AGENTS.md section 9 forbids dead controls).
- Evidence: LibraryView.tsx:1337-1377

## GAP-F025-09-05

**Mobile library has no ask-about-file**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-09](../../20-features/025-file-previews-and-readers/F025-09-ask-about-a-selected-passage-or-the-whole-file.md)
- Detail: Affects: Mobile. Work needed: Add an ask entry or decide to rely on Open chat.
- Evidence: No askAboutFile in apps/mobile/src/features/library/index.tsx; FileViewerScreen only has an 'Open chat' button when the file names its chat (lines 150-160)

## GAP-F025-09-06

**Tauri Library lacks the ask bar**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-09](../../20-features/025-file-previews-and-readers/F025-09-ask-about-a-selected-passage-or-the-whole-file.md)
- Detail: Affects: Tauri build. Work needed: None unless Tauri becomes public.
- Evidence: DesktopLibrary.tsx:157-207

## GAP-F025-09-NOTBUILT

**Ask about a selected passage or the whole file: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F025-09](../../20-features/025-file-previews-and-readers/F025-09-ask-about-a-selected-passage-or-the-whole-file.md)
- Requirement items: S25.20, S25.21, S25.22
- Detail: Mobile: S25.20, S25.21, S25.22; CLI: S25.21, S25.22; VS Code: S25.22; Chrome: S25.20, S25.21, S25.22

## GAP-F025-10-01

**Shared viewer hides why a preview failed**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-10](../../20-features/025-file-previews-and-readers/F025-10-show-a-clear-message-when-a-file-cannot-be-preview.md)
- Detail: Affects: Web, Desktop. Work needed: Carry the reason into the card.
- Evidence: FileTextPreview.tsx:36 maps every error to 'failed'

## GAP-F025-10-02

**No detection of partly read pages or sheets beyond the length cut and extra sheets**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-10](../../20-features/025-file-previews-and-readers/F025-10-show-a-clear-message-when-a-file-cannot-be-preview.md)
- Detail: Affects: Web, Desktop, CLI. Work needed: Report per-sheet and per-page extraction results and warn.
- Evidence: file-text-preview.ts:53-71; office-document-text.ts:715-744; brief S25.31 all missing

## GAP-F025-10-03

**Multi-sheet note does not say only the first sheet is shown**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-10](../../20-features/025-file-previews-and-readers/F025-10-show-a-clear-message-when-a-file-cannot-be-preview.md)
- Detail: Affects: Web, Desktop. Work needed: Reword for spreadsheets.
- Evidence: FileTextPreview.tsx:91-95; office-document-text.ts:728

## GAP-F025-10-04

**No cut note on mobile text, no note or fallback on VS Code, none on Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-10](../../20-features/025-file-previews-and-readers/F025-10-show-a-clear-message-when-a-file-cannot-be-preview.md)
- Detail: Affects: Mobile text, VS Code, Chrome. Work needed: Add or declare out of scope.
- Evidence: TextFileView.tsx has no cap or note; brief S25.30 and S25.31

## GAP-F025-10-05

**Brief is out of date: it lists web and desktop partial-warning as missing, but the shared viewer and CLI have one; mobile spreadsheet exists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-10](../../20-features/025-file-previews-and-readers/F025-10-show-a-clear-message-when-a-file-cannot-be-preview.md)
- Detail: Affects: Documentation. Work needed: Update the brief and surface matrix.
- Evidence: FileTextPreview.tsx:91-95; apps/cli/src/lib.rs:7329-7334; FileViewerScreen.test.tsx:116

## GAP-F025-10-06

**Dead Tauri preview dialog**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-10](../../20-features/025-file-previews-and-readers/F025-10-show-a-clear-message-when-a-file-cannot-be-preview.md)
- Detail: Affects: Tauri build. Work needed: Reconnect or delete (AGENTS.md section 9).
- Evidence: openPreview never called

## GAP-F025-10-07

**No retry on a failed shared-viewer preview**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F025-10](../../20-features/025-file-previews-and-readers/F025-10-show-a-clear-message-when-a-file-cannot-be-preview.md)
- Detail: Affects: Web, Desktop. Work needed: Add a Retry button.
- Evidence: FileTextPreview.tsx:16-39

## GAP-F025-10-NOTBUILT

**Show a clear message when a file cannot be previewed or only partly loaded: not built on Web, Desktop, Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, VS Code, Chrome
- Features: [F025-10](../../20-features/025-file-previews-and-readers/F025-10-show-a-clear-message-when-a-file-cannot-be-preview.md)
- Requirement items: S25.30, S25.31
- Detail: Web: S25.31; Desktop: S25.31; Mobile: S25.31; VS Code: S25.30, S25.31; Chrome: S25.30, S25.31
