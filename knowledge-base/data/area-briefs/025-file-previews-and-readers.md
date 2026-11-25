# Area 25. File previews and readers

31 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S25.01 PDF reader.
- Should: A PDF opens in an in-product reader.
- Status: web done, desktop done, mobile missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1312; apps/web/app/api/library/route.ts:49

## S25.02 Text-file reader.
- Should: Plain-text files open in a readable in-product view.
- Status: web done, desktop done, cli done, chrome missing
- Code: apps/web/features/projects/components/KnowledgeFilesPanel.tsx:548; apps/web/features/projects/components/FilePreviewModal.tsx:368; apps/web/features/projects/components/FilePreviewModal.tsx:127; apps/web/features/projects/components/FilePreviewModal.tsx:88; apps/cli/src/cloud/library.rs:56; apps/cli/src/lib.rs:5511

## S25.03 Markdown reader.
- Should: Markdown files render formatted in the product.
- Status: web done, desktop done, cli done, chrome missing
- Code: apps/web/features/projects/components/KnowledgeFilesPanel.tsx:548; apps/web/features/projects/components/FilePreviewModal.tsx:368; apps/web/features/projects/components/FilePreviewModal.tsx:127; apps/web/features/projects/components/FilePreviewModal.tsx:88; apps/cli/src/cloud/library.rs:38; apps/cli/src/tui/markdown_renderer.rs:107

## S25.04 Source-code reader.
- Should: Source-code files open with syntax-aware display.
- Status: web done, desktop done, cli done, vscode done, chrome missing
- Code: apps/web/features/projects/components/KnowledgeFilesPanel.tsx:548; apps/web/features/projects/components/FilePreviewModal.tsx:368; apps/web/features/projects/components/FilePreviewModal.tsx:144; apps/web/features/projects/components/FilePreviewModal.tsx:88; apps/cli/src/cloud/library.rs:38; apps/cli/src/tui/markdown_renderer.rs:107; apps/extension-vscode/src/features/artifacts/artifactActions.ts:98; apps/extension-vscode/src/features/artifacts/artifactActions.ts:145

## S25.05 Image viewer.
- Should: Images open in a viewer.
- Status: web done, desktop done, mobile done, vscode missing, chrome missing
- Code: apps/web/app/chat/library/page.tsx:4; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1096; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1045; packages/ui/unified-chat/src/components/library/LibraryView.tsx:670; apps/mobile/src/features/library/index.tsx:338; apps/mobile/src/features/chat/components/ImageFullScreen.tsx:50; apps/mobile/src/features/library/index.tsx:129

## S25.06 Audio player.
- Should: Audio files play in an in-product player.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S25.07 Video player.
- Should: Video files play in an in-product player.
- Status: web done, desktop done, mobile done, vscode missing, chrome missing
- Code: apps/web/app/api/library/route.ts:49; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1301; apps/mobile/src/features/library/index.tsx:774; apps/mobile/src/features/library/index.tsx:273

## S25.08 Spreadsheet preview.
- Should: Spreadsheets preview as a table.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/app/api/projects/[id]/knowledge-files/[fileId]/text/route.ts:48; apps/web/lib/server/file-text-preview.ts:34; apps/web/lib/server/file-text-preview.ts:52; apps/web/lib/server/office-document-text.ts:351; apps/web/lib/server/project-knowledge-files.ts:83; apps/web/features/projects/components/FilePreviewModal.tsx:187; apps/web/features/projects/components/FilePreviewModal.tsx:219; apps/web/features/projects/components/FilePreviewModal.tsx:412

## S25.09 Presentation preview.
- Should: Presentations (pptx) preview in the product.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S25.10 Document preview.
- Should: Word-processing documents (docx) preview in the product.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/app/api/projects/[id]/knowledge-files/[fileId]/text/route.ts:48; apps/web/lib/server/file-text-preview.ts:55; apps/web/lib/server/project-knowledge-files.ts:83; apps/web/features/projects/components/FilePreviewModal.tsx:187; apps/web/features/projects/components/FilePreviewModal.tsx:219; apps/web/features/projects/components/FilePreviewModal.tsx:412; packages/ui/unified-chat/src/components/library/FileTextPreview.tsx:45

## S25.11 Archive-content preview.
- Should: Archive (zip) contents can be listed/previewed.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S25.12 Page thumbnails.
- Should: A document shows page thumbnails for navigation.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S25.13 Page navigation.
- Should: Users can navigate pages of a multi-page document.
- Status: mobile missing, vscode missing, chrome missing

## S25.14 Zoom controls.
- Should: Viewers offer zoom controls.
- Status: web done, desktop done, mobile done, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1045; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1096; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1066; apps/mobile/src/features/chat/components/ImageFullScreen.tsx:50; apps/mobile/src/features/library/index.tsx:338; apps/mobile/src/features/library/index.tsx:129

## S25.15 Fit-to-width.
- Should: Viewers can fit content to width.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S25.16 Fit-to-page.
- Should: Viewers can fit a page to the screen.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S25.17 Rotate view.
- Should: Viewers can rotate the view.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S25.18 Search within file.
- Should: Users can search within an open file.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S25.19 Highlight search matches.
- Should: Search matches are highlighted in the file.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S25.20 Select text for a question.
- Should: Users can select text in a file and ask a question about it.
- Status: web missing, desktop missing, mobile missing, vscode done, chrome missing
- Code: apps/extension-vscode/src/core/commandSetup.ts:965; apps/extension-vscode/src/core/commandSetup.ts:713

## S25.21 Ask about selected page or range.
- Should: Users can ask about a selected page or range of a file.
- Status: mobile missing, cli missing, vscode done, chrome missing
- Code: apps/extension-vscode/src/core/commandSetup.ts:965; apps/extension-vscode/src/core/commandSetup.ts:713

## S25.22 Citation-linked highlighting.
- Should: Opening a citation highlights the cited passage in the file.
- Status: mobile missing, cli missing, vscode missing, chrome missing

## S25.23 Transcript panel for audio/video.
- Should: Audio/video files show a transcript panel.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S25.24 Timestamp navigation.
- Should: Users can navigate audio/video by timestamp.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S25.25 Full-screen mode.
- Should: Viewers offer a full-screen mode.
- Status: web done, desktop done, mobile done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1612; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:938; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1020; apps/mobile/src/features/library/index.tsx:338; apps/mobile/src/features/chat/components/ImageFullScreen.tsx:50; apps/mobile/src/features/chat/components/MessageBubble.tsx:1206; apps/mobile/src/features/library/index.tsx:129

## S25.26 Download original.
- Should: Users can download the original file.
- Status: web done, desktop done, mobile done, cli done
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1076; packages/ui/unified-chat/src/components/library/LibraryView.tsx:478; apps/web/features/projects/components/FilePreviewModal.tsx:300; apps/mobile/src/features/library/index.tsx:140; apps/mobile/services/fileCreation.ts:253; apps/cli/src/cloud/library.rs:60; apps/cli/src/cloud/client.rs:388

## S25.27 Download converted representation.
- Should: Users can download a converted representation of a file (e.g. PDF, text).
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1263; apps/web/app/api/files/[id]/text/route.ts:57

## S25.28 Copy selected content.
- Should: Users can copy selected content from a preview.
- Status: web unverified, desktop unverified, mobile unverified, vscode done
- Code: apps/extension-vscode/src/features/artifacts/artifactActions.ts:98; apps/extension-vscode/src/features/artifacts/artifactActions.ts:32

## S25.29 Open in native application.
- Should: Users can open a file in its native application.
- Status: desktop missing, mobile done, cli done, vscode done, chrome missing
- Code: apps/mobile/src/features/library/index.tsx:140; apps/mobile/services/fileCreation.ts:253; apps/cli/src/lib.rs:2349; apps/extension-vscode/src/features/artifacts/artifactActions.ts:145; apps/extension-vscode/src/features/artifacts/artifactActions.ts:32

## S25.30 Unsupported-preview fallback.
- Should: When a file cannot be previewed, the product says so and offers download/open.
- Status: web done, desktop done, mobile done, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1116; apps/web/features/projects/components/FilePreviewModal.tsx:376; packages/ui/unified-chat/src/components/library/LibraryView.tsx:478; apps/mobile/src/features/library/index.tsx:140; apps/mobile/services/fileCreation.ts:253

## S25.31 Partial-extraction warning.
- Should: When only part of a file could be extracted, the product warns the user.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing
