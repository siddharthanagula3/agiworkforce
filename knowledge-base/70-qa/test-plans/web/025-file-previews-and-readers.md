---
id: "PLAN-web-025"
type: "test-plan"
title: "Web · 25. File previews and readers"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "25"
---
# Web · 25. File previews and readers

14 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S25.01 PDF reader.

- **Expected:** A PDF opens in an in-product reader.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1306; apps/web/app/api/library/route.ts:53
- **Where to find it:** Sidebar > Library > Documents > click a PDF file (labels found in the code)
- **Needs:** a PDF file uploaded to the library
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Click the Documents tab.
  3. Click a PDF file tile.
  4. Look for a reader inside the product (a frame that holds the PDF, with the file name in the top breadcrumb after Library) and compare with Expected.

## S25.02 Text-file reader.

- **Expected:** Plain-text files open in a readable in-product view.
- **Code:** done. Evidence present: apps/web/features/projects/components/KnowledgeFilesPanel.tsx:553; apps/web/features/projects/components/FilePreviewModal.tsx:430; apps/web/features/projects/components/FilePreviewModal.tsx:143; apps/web/features/projects/components/FilePreviewModal.tsx:95
- **Where to find it:** Sidebar > Library > Documents > click a .txt file (labels found in the code)
- **Needs:** a plain-text file uploaded to the library
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Click the Documents tab.
  3. Click a plain-text file tile.
  4. Look for a readable text view inside the viewer (top breadcrumb shows Library and the file name) and compare with Expected.

## S25.03 Markdown reader.

- **Expected:** Markdown files render formatted in the product.
- **Code:** done. Evidence present: apps/web/features/projects/components/KnowledgeFilesPanel.tsx:553; apps/web/features/projects/components/FilePreviewModal.tsx:430; apps/web/features/projects/components/FilePreviewModal.tsx:143; apps/web/features/projects/components/FilePreviewModal.tsx:95
- **Where to find it:** Sidebar > Projects > open a project > click a .md file name in its knowledge files (labels found in the code)
- **Needs:** a project with a .md file uploaded
- **Steps:**
  1. Sign in and click Projects in the sidebar.
  2. Open a project that has a Markdown file in its knowledge files.
  3. Click the .md file name in the file list.
  4. Look for formatted Markdown in the preview dialog (headings, lists, not raw # and * symbols) and compare with Expected.

## S25.04 Source-code reader.

- **Expected:** Source-code files open with syntax-aware display.
- **Code:** done. Evidence present: apps/web/features/projects/components/KnowledgeFilesPanel.tsx:553; apps/web/features/projects/components/FilePreviewModal.tsx:430; apps/web/features/projects/components/FilePreviewModal.tsx:148; apps/web/features/projects/components/FilePreviewModal.tsx:95
- **Where to find it:** Sidebar > Projects > open a project > click a source-code file name in its knowledge files (labels found in the code)
- **Needs:** a project with a source-code file uploaded
- **Steps:**
  1. Sign in and click Projects in the sidebar.
  2. Open a project that has a source-code file (for example .ts or .py) in its knowledge files.
  3. Click that file name.
  4. Look for the code in a syntax-aware, fenced code block with a language, and compare with Expected.

## S25.05 Image viewer.

- **Expected:** Images open in a viewer.
- **Code:** done. Evidence present: apps/web/app/chat/library/page.tsx:17; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1289; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1224; packages/ui/unified-chat/src/components/library/LibraryView.tsx:810
- **Earlier check in the running app:** PASS: E097 [PASS; existing image preview and Images filter]: Images filter narrows Library to four images. quarterly-bars.png loaded at natural size 240×160 with visible bar chart. Zoom in changes 100% to 125%. Earlier pending preview was interrupted by third dev-server exit; fresh retry succeeds.
- **Where to find it:** Sidebar > Library > Images > click an image tile (labels found in the code)
- **Needs:** an image uploaded to the library
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Click the Images tab.
  3. Click an image tile.
  4. Look for the image shown large in the viewer with the file name as its alt text and a Close file viewer button in the top right, and compare with Expected.

## S25.07 Video player.

- **Expected:** Video files play in an in-product player.
- **Code:** done. Evidence present: apps/web/app/api/library/route.ts:53; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1295
- **Where to find it:** Sidebar > Library > Videos > click a video tile (labels found in the code)
- **Needs:** a video file uploaded to the library
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Click the Videos tab.
  3. Click a video tile.
  4. Look for a video player with playback controls (data-testid library-video-player) and press play, then compare with Expected.

## S25.08 Spreadsheet preview.

- **Expected:** Spreadsheets preview as a table.
- **Code:** done. Evidence present: apps/web/app/api/projects/[id]/knowledge-files/[fileId]/text/route.ts:48; apps/web/lib/server/file-text-preview.ts:34; apps/web/lib/server/file-text-preview.ts:52; apps/web/lib/server/office-document-text.ts:715; apps/web/lib/server/project-knowledge-files.ts:87; apps/web/features/projects/components/FilePreviewModal.tsx:191; apps/web/features/projects/components/FilePreviewModal.tsx:223; apps/web/features/projects/components/FilePreviewModal.tsx:427; packages/ui/unified-chat/src/components/library/FileTextPreview.tsx:45
- **Where to find it:** Sidebar > Library > Documents > click a spreadsheet file (.csv or .xlsx) tile (labels found in the code)
- **Needs:** a spreadsheet file uploaded to the library
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Click the Documents tab.
  3. Click a spreadsheet tile.
  4. Look for a table with a header row and cells, and for the note Showing the start of this file when the file is long, then compare with Expected.

## S25.10 Document preview.

- **Expected:** Word-processing documents (docx) preview in the product.
- **Code:** done. Evidence present: apps/web/app/api/projects/[id]/knowledge-files/[fileId]/text/route.ts:48; apps/web/lib/server/file-text-preview.ts:55; apps/web/lib/server/project-knowledge-files.ts:87; apps/web/features/projects/components/FilePreviewModal.tsx:191; apps/web/features/projects/components/FilePreviewModal.tsx:223; apps/web/features/projects/components/FilePreviewModal.tsx:427; packages/ui/unified-chat/src/components/library/FileTextPreview.tsx:45
- **Where to find it:** Sidebar > Library > Documents > click a .docx file tile (labels found in the code)
- **Needs:** a .docx file uploaded to the library
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Click the Documents tab.
  3. Click a .docx file tile.
  4. Look for the document's text in the viewer and compare with Expected.

## S25.14 Zoom controls.

- **Expected:** Viewers offer zoom controls.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1224; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1289; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1246
- **Earlier check in the running app:** PASS: E097 [PASS; existing image preview and Images filter]: Images filter narrows Library to four images. quarterly-bars.png loaded at natural size 240×160 with visible bar chart. Zoom in changes 100% to 125%. Earlier pending preview was interrupted by third dev-server exit; fresh retry succeeds.
- **Where to find it:** Sidebar > Library > Images > click an image tile > Zoom in or Zoom out (top right) (labels found in the code)
- **Needs:** an image uploaded to the library
- **Steps:**
  1. Open an image in Library as in S25.05.
  2. Note the percentage shown between the zoom buttons (starts at 100%).
  3. Click Zoom in and look for the image getting larger and the percentage rising.
  4. Click Zoom out and check it shrinks back, then compare with Expected.

## S25.25 Full-screen mode.

- **Expected:** Viewers offer a full-screen mode.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2939; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1797; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1020 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No full-screen control was found in the Library viewer, the project file preview (FilePreviewModal) or the library components; the only Enter fullscreen and Exit fullscreen controls are for artifacts in apps/web/features/chat/components/artifacts/ArtifactPreview.tsx, not files. Searched for full-screen, fullscreen and requestFullscreen in those folders.

## S25.26 Download original.

- **Expected:** Users can download the original file.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1267; packages/ui/unified-chat/src/components/library/LibraryView.tsx:584; apps/web/features/projects/components/FilePreviewModal.tsx:353
- **Earlier check in the running app:** PASS: E052 [PASS; upload and verified original download]: Composer upload completed and message has file link 2e11068a-2ad0-4968-b460-0181404aa249. Free Auto failed overloaded, so file-content reasoning unverified. Library Download produced original browser-qa-reference.txt; bytes match synthetic source exactly.
- **Where to find it:** Sidebar > Library > click a file tile > Download icon (top right, labelled Download with the file name) (labels found in the code)
- **Needs:** a file uploaded to the library
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Click a file tile that opens a viewer.
  3. Click the Download icon at the top right of the viewer.
  4. Open the downloaded file and compare its bytes and content with the source file, then compare with Expected.

## S25.27 Download converted representation.

- **Expected:** Users can download a converted representation of a file (e.g. PDF, text).
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1257; apps/web/app/api/files/[id]/text/route.ts:57 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Library > Documents > click a .docx file tile > Download as text icon (top right) (labels found in the code)
- **Needs:** a .docx file uploaded to the library
- **Steps:**
  1. Sign in and click Library in the sidebar.
  2. Click the Documents tab and open a .docx file.
  3. Hover the top-right icons and find the one whose tooltip reads Download as text.
  4. Click it, open the downloaded file, and compare with Expected.

## S25.28 Copy selected content.

- **Expected:** Users can copy selected content from a preview.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No copy control or selection handling was found in the library viewer, FilePreviewModal or KnowledgeFilesPanel (searched for copy, clipboard, selection and user-select). Browser text selection may still work but was not confirmed in the code. The ledger says this needs the live web.
- **Needs:** a live web browser

## S25.30 Unsupported-preview fallback.

- **Expected:** When a file cannot be previewed, the product says so and offers download/open.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1319; apps/web/features/projects/components/FilePreviewModal.tsx:440; packages/ui/unified-chat/src/components/library/LibraryView.tsx:584
- **Where to find it:** Sidebar > Projects > open a project > click a file that has no preview (for example a .zip) > Download (labels found in the code)
- **Needs:** a project with a file that has no preview, such as a .zip
- **Steps:**
  1. Sign in and click Projects in the sidebar.
  2. Open a project and click a file that cannot be previewed, such as a .zip.
  3. Look for the text Preview is not available for this file type. with the file's type under it.
  4. Look for the Download button and compare with Expected (the text does not offer Open).
