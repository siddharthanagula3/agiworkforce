---
id: "PLAN-desktop-025"
type: "test-plan"
title: "Desktop · 25. File previews and readers"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "25"
---
# Desktop · 25. File previews and readers

14 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S25.01 PDF reader.

- **Expected:** A PDF opens in an in-product reader.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1306; apps/web/app/api/library/route.ts:53
- **Where to find it:** Sidebar > Library > Documents > click a PDF row (labels found in the code)
- **Needs:** a PDF file in the Library
- **Steps:**
  1. Sign in, then click Library in the sidebar.
  2. Click the Documents tab.
  3. Click a PDF file row.
  4. Look for the in-app PDF reader filling the viewer, instead of a download.

## S25.02 Text-file reader.

- **Expected:** Plain-text files open in a readable in-product view.
- **Code:** done. Evidence present: apps/web/features/projects/components/KnowledgeFilesPanel.tsx:553; apps/web/features/projects/components/FilePreviewModal.tsx:430; apps/web/features/projects/components/FilePreviewModal.tsx:143; apps/web/features/projects/components/FilePreviewModal.tsx:95
- **Where to find it:** Sidebar > Library > Documents > click a .txt row (labels found in the code)
- **Needs:** a plain-text file in the Library
- **Steps:**
  1. Sign in, then click Library in the sidebar.
  2. Click the Documents tab.
  3. Click a plain-text file row.
  4. Look for the text shown in a readable preformatted block inside the viewer.

## S25.03 Markdown reader.

- **Expected:** Markdown files render formatted in the product.
- **Code:** done. Evidence present: apps/web/features/projects/components/KnowledgeFilesPanel.tsx:553; apps/web/features/projects/components/FilePreviewModal.tsx:430; apps/web/features/projects/components/FilePreviewModal.tsx:143; apps/web/features/projects/components/FilePreviewModal.tsx:95
- **Where to find it:** Projects > open a project > Project settings > Files > Preview <file name> (labels found in the code)
- **Needs:** a project with a Markdown file in Files
- **Steps:**
  1. Click Projects in the sidebar and open a project that has a Markdown file in its Files.
  2. Open its Project settings dialog and scroll to the section titled Files.
  3. Click Preview on the Markdown file row.
  4. Look for headings and formatting rendered as Markdown, not raw # and ** characters.

## S25.04 Source-code reader.

- **Expected:** Source-code files open with syntax-aware display.
- **Code:** done. Evidence present: apps/web/features/projects/components/KnowledgeFilesPanel.tsx:553; apps/web/features/projects/components/FilePreviewModal.tsx:430; apps/web/features/projects/components/FilePreviewModal.tsx:148; apps/web/features/projects/components/FilePreviewModal.tsx:95
- **Where to find it:** Projects > open a project > Project settings > Files > Preview <file name> (labels found in the code)
- **Needs:** a project with a source-code file in Files
- **Steps:**
  1. Click Projects in the sidebar and open a project that has a source-code file in its Files.
  2. Open its Project settings dialog and go to the section titled Files.
  3. Click Preview on the source-code file row.
  4. Look for the code shown with syntax colouring for its language.

## S25.05 Image viewer.

- **Expected:** Images open in a viewer.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1289; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1224; packages/ui/unified-chat/src/components/library/LibraryView.tsx:810
- **Where to find it:** Sidebar > Library > Images > click an image row (labels found in the code)
- **Needs:** an image file in the Library
- **Steps:**
  1. Sign in, then click Library in the sidebar.
  2. Click the Images tab.
  3. Click an image row.
  4. Look for the image shown in the viewer with its file name as the alt text and a zoom group in the top bar.

## S25.07 Video player.

- **Expected:** Video files play in an in-product player.
- **Code:** done. Evidence present: apps/web/app/api/library/route.ts:53; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1295
- **Where to find it:** Sidebar > Library > Videos > click a video row (labels found in the code)
- **Needs:** a video file in the Library
- **Steps:**
  1. Sign in, then click Library in the sidebar.
  2. Click the Videos tab.
  3. Click a video row.
  4. Look for a video player with playback controls in the viewer, and press play.

## S25.08 Spreadsheet preview.

- **Expected:** Spreadsheets preview as a table.
- **Code:** done. Evidence present: apps/web/app/api/projects/[id]/knowledge-files/[fileId]/text/route.ts:48; apps/web/lib/server/file-text-preview.ts:34; apps/web/lib/server/file-text-preview.ts:52; apps/web/lib/server/office-document-text.ts:715; apps/web/lib/server/project-knowledge-files.ts:87; apps/web/features/projects/components/FilePreviewModal.tsx:191; apps/web/features/projects/components/FilePreviewModal.tsx:223; apps/web/features/projects/components/FilePreviewModal.tsx:427; packages/ui/unified-chat/src/components/library/FileTextPreview.tsx:45
- **Where to find it:** Sidebar > Library > Documents > click a spreadsheet row (labels found in the code)
- **Needs:** a spreadsheet file in the Library
- **Steps:**
  1. Sign in, then click Library in the sidebar.
  2. Click the Documents tab.
  3. Click a spreadsheet file row (for example .xlsx or .csv).
  4. Look for the sheet shown as a table with a header row and data rows.

## S25.10 Document preview.

- **Expected:** Word-processing documents (docx) preview in the product.
- **Code:** done. Evidence present: apps/web/app/api/projects/[id]/knowledge-files/[fileId]/text/route.ts:48; apps/web/lib/server/file-text-preview.ts:55; apps/web/lib/server/project-knowledge-files.ts:87; apps/web/features/projects/components/FilePreviewModal.tsx:191; apps/web/features/projects/components/FilePreviewModal.tsx:223; apps/web/features/projects/components/FilePreviewModal.tsx:427; packages/ui/unified-chat/src/components/library/FileTextPreview.tsx:45
- **Where to find it:** Sidebar > Library > Documents > click a .docx row (labels found in the code)
- **Needs:** a .docx file in the Library
- **Steps:**
  1. Sign in, then click Library in the sidebar.
  2. Click the Documents tab.
  3. Click a Word (.docx) file row.
  4. Look for the document text shown in the viewer, formatted as text.

## S25.14 Zoom controls.

- **Expected:** Viewers offer zoom controls.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1224; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1289; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1246
- **Where to find it:** Sidebar > Library > Images > click an image row, then use the Zoom group in the viewer top bar (labels found in the code)
- **Needs:** an image file in the Library
- **Steps:**
  1. Open an image from Library > Images as in S25.05.
  2. Look at the top bar of the viewer for the group labelled Zoom with the percentage shown.
  3. Click Zoom in and Zoom out, and watch the percentage and the image size change.
  4. Look for the buttons to stop at their limits (disabled).

## S25.25 Full-screen mode.

- **Expected:** Viewers offer a full-screen mode.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2939; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1797; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1020 (quoted code not found in the file now)
- **Where to find it:** not found in the code. The Library viewer has no full-screen control. ArtifactPreview.tsx has a button with title Fullscreen and aria-label Enter fullscreen / Exit fullscreen (lines 2939 and 3568), but the path from Library to that panel was not confirmed.
- **Needs:** a file in the Library

## S25.26 Download original.

- **Expected:** Users can download the original file.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1267; packages/ui/unified-chat/src/components/library/LibraryView.tsx:584; apps/web/features/projects/components/FilePreviewModal.tsx:353
- **Where to find it:** Sidebar > Library > click any previewable file row > Download button in the viewer top bar (labels found in the code)
- **Needs:** a file in the Library
- **Steps:**
  1. Sign in, then click Library in the sidebar.
  2. Click a file row that opens the viewer, such as an image or PDF.
  3. In the top bar, click the download icon (aria-label Download <file name>).
  4. Look for the browser saving the original file with its own name and type.

## S25.27 Download converted representation.

- **Expected:** Users can download a converted representation of a file (e.g. PDF, text).
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1257; apps/web/app/api/files/[id]/text/route.ts:57 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Library > Documents > click a PDF or .docx row > Download as text button in the viewer top bar (labels found in the code)
- **Needs:** a PDF or .docx file in the Library
- **Steps:**
  1. Sign in, then click Library in the sidebar.
  2. Click the Documents tab and open a PDF or Word file so the text loads.
  3. Hover the icon button in the top bar; its title is Download as text.
  4. Click it and look for a .txt file saved with the extracted text.

## S25.28 Copy selected content.

- **Expected:** Users can copy selected content from a preview.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched LibraryView.tsx, FileTextPreview.tsx and FilePreviewModal.tsx for copy controls and user-select rules: no copy button or copy action found. Only the browser's own selection may apply.
- **Needs:** a file with text in the Library

## S25.30 Unsupported-preview fallback.

- **Expected:** When a file cannot be previewed, the product says so and offers download/open.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1319; apps/web/features/projects/components/FilePreviewModal.tsx:440; packages/ui/unified-chat/src/components/library/LibraryView.tsx:584
- **Where to find it:** Sidebar > Library > click a file row whose inline preview fails (no inline preview) (labels found in the code)
- **Needs:** a file with no inline preview (for example a .zip)
- **Steps:**
  1. Sign in, then click Library in the sidebar.
  2. Click a file row that cannot be shown inline.
  3. Look for the text Preview isn’t available for this file inline. with a Download to view button.
  4. Click Download to view and check that the file downloads.
