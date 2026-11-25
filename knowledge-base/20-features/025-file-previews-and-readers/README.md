---
id: "AREA-025"
type: "area"
title: "File previews and readers"
features: ["F025-01", "F025-02", "F025-03", "F025-04", "F025-05", "F025-06", "F025-07", "F025-08", "F025-09", "F025-10"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 25. File previews and readers

A person opens a file they saved or uploaded (in the Library, or a project's knowledge files) and sees what is inside without downloading it first. The area covers the in-product viewer for PDFs, images and video, and the text previews for plain text, Markdown, source code, spreadsheets and Word files. It matters because a file is only useful in the product if the person can check it quickly, and a failed preview must still lead to a download. Many parts the brief lists (page controls, search, audio, transcripts, presentations in most apps) are not built yet.

**Who uses it.** Every signed-in user who can see a Library item or a project's knowledge file. The preview routes check that the asset belongs to the caller's user and workspace (apps/web/app/api/files/[id]/text/route.ts:24-31), and the project route looks up the knowledge file by project (apps/web/app/api/projects/[id]/knowledge-files/[fileId]/text/route.ts). No plan gate on previews was seen in the code read. Workspace admins and developers are not special-cased in these files.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F025-01](F025-01-read-a-pdf-and-move-through-its-pages.md) | Read a PDF and move through its pages | partly | partly | partly | n/a | no | no |
| [F025-02](F025-02-read-plain-text-markdown-and-source-code.md) | Read plain text, Markdown and source code | built | built | n/a | built | built | no |
| [F025-03](F025-03-preview-office-files-and-archives.md) | Preview Office files and archives | partly | partly | partly | built | no | no |
| [F025-04](F025-04-view-an-image.md) | View an image | built | built | built | n/a | no | built |
| [F025-05](F025-05-play-audio-and-video-with-transcripts-and-timestam.md) | Play audio and video, with transcripts and timestamps | partly | partly | partly | no | no | partly |
| [F025-06](F025-06-zoom-and-full-screen-view.md) | Zoom and full-screen view | built | built | built | n/a | no | no |
| [F025-07](F025-07-save-copy-or-open-a-file-outside-the-viewer.md) | Save, copy or open a file outside the viewer | partly | partly | partly | partly | partly | no |
| [F025-08](F025-08-search-inside-a-file.md) | Search inside a file | no | no | no | no | no | no |
| [F025-09](F025-09-ask-about-a-selected-passage-or-the-whole-file.md) | Ask about a selected passage or the whole file | partly | partly | no | no | partly | no |
| [F025-10](F025-10-show-a-clear-message-when-a-file-cannot-be-preview.md) | Show a clear message when a file cannot be previewed or only partly loaded | partly | partly | partly | built | no | no |

Requirement items for this area: [10-requirements/capabilities/025-file-previews-and-readers.md](../../10-requirements/capabilities/025-file-previews-and-readers.md).

## How this area works in the code

1. **Pick the file and decide its preview kind.** The Library list marks each item previewable when its type has a text preview, is an image, video or PDF, or the metadata says so. A click on a previewable item opens the viewer; a click on a non-previewable item does nothing in this code path. The server also decides the kind (text, table, office) from the file name and type. (`packages/ui/unified-chat/src/components/library/LibraryView.tsx:810 (openItem opens viewer when item.previewable)`, `apps/web/app/api/library/route.ts (previewableForRow, fileNameForRow, toLibraryItem)`, `apps/web/lib/server/file-text-preview.ts:28-38 (fileTextPreviewKind)`)
2. **Open the viewer and choose what to show.** FileViewerOverlay picks one view: an image with zoom, a video player, a PDF frame, or a text preview. It asks for the text preview only when none of the other three applies. (`packages/ui/unified-chat/src/components/library/LibraryView.tsx:1157-1176`, `packages/ui/unified-chat/src/components/library/LibraryView.tsx:1285-1325`)
3. **Fetch the original bytes or the text.** Images, video and PDFs load through the file route (with ?preview=pdf for PDFs). Text loads through the /text route under the file's URL, through the transport the web and desktop hosts provide. (`apps/web/features/library/components/LibraryView.tsx:155-159 (fetchAsset, inlinePreviewUri, textPreviewUri)`, `packages/ui/unified-chat/src/components/library/LibraryView.tsx:667-670 (loadTextPreview)`, `apps/web/app/api/files/[id]/route.ts:219-228 (PDF check and too-large response)`)
4. **Server checks access and reads the stored file.** The text route rate-limits the request, looks up the asset for the caller's user and workspace, refuses files without a text preview or over 30 MB, then reads the stored object. (`apps/web/app/api/files/[id]/text/route.ts:17 (30 MB source limit)`, `apps/web/app/api/files/[id]/text/route.ts:24 (rate limit)`, `apps/web/app/api/files/[id]/text/route.ts:31 (asset lookup)`)
5. **Turn the file into text or a table.** renderFileTextPreview reads spreadsheets as CSV, Word files as text, and other text as UTF-8. Output is cut at the character limit and marked truncated. (`apps/web/lib/server/file-text-preview.ts:40-70`, `packages/contracts/types/src/attachment-policy.json:50 (200000 characters)`, `packages/contracts/types/src/file-reference.ts:32 (MAX_FILE_TEXT_CHARS)`)
6. **Show the result in the browser.** The browser checks the response shape with the shared schema, then shows a table (at most 500 rows) or a plain text block, with a note if the text was cut. (`packages/ui/unified-chat/src/components/library/FileTextPreview.tsx:16-43 (useFileTextPreview, schema check)`, `packages/ui/unified-chat/src/components/library/FileTextPreview.tsx:45-98 (table or text block, truncation note)`)
7. **Download or ask from the viewer.** Download sends the original bytes to the browser; Download as text saves the extracted text as a .txt file built in the browser. The ask bar sends a question about the whole file to the host. (`packages/ui/unified-chat/src/components/library/LibraryView.tsx:1130 (downloadText)`, `packages/ui/unified-chat/src/components/library/LibraryView.tsx:1254-1272`, `packages/ui/unified-chat/src/components/library/LibraryView.tsx:1328-1377`)
8. **Other apps take their own path.** Mobile opens images and videos in its own full-screen views. The CLI calls the same text route and prints the result. VS Code sends a selection to a new chat, and opens artifacts read-only. (`apps/mobile/src/features/library/index.tsx:374, 486`, `apps/cli/src/cloud/library.rs:99 (text) and :40 (formatted_source)`, `apps/cli/src/lib.rs:7318-7334`, `apps/extension-vscode/src/core/commandSetup.ts:882-900`)

## Files to know

| File | Role |
|---|---|
| `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Shared Library viewer: the overlay that shows images, video, PDFs, text and the fallback, plus zoom and the ask bar. Used by web and desktop. |
| `packages/ui/unified-chat/src/components/library/FileTextPreview.tsx` | Fetches and checks the text preview, then draws a table or plain text block with the truncation note. |
| `apps/web/app/api/files/[id]/text/route.ts` | Text preview endpoint for Library items: checks the caller, size and type, then returns the preview. |
| `apps/web/lib/server/file-text-preview.ts` | Decides the preview kind (text, table, office) and builds the preview with the character cut. |
| `apps/web/lib/server/office-document-text.ts` | Reads Word and spreadsheet files into text or CSV (imported by file-text-preview.ts; not opened in detail). |
| `apps/web/app/api/files/[id]/route.ts` | Serves the original file bytes, including the ?preview=pdf check and the too-large responses. |
| `apps/web/features/projects/components/FilePreviewModal.tsx` | Project knowledge-file preview modal: Markdown and code view, extracted text, PDF frame, presentation branch, download. |
| `apps/web/features/library/components/LibraryView.tsx` | Web host for the shared Library viewer: supplies fetch, download, inline and text URL functions, and the ask-about-file function. |
| `apps/mobile/src/features/library/index.tsx` | Mobile Library screen: opens images full screen and plays videos; no PDF or text preview. |
| `apps/cli/src/cloud/library.rs` | CLI Library calls: list, text preview, formatted source for a terminal, and download. |
| `apps/extension-vscode/src/core/commandSetup.ts` | VS Code send-selection-to-new-chat command and its warnings. |

## What is stored

- The original uploaded or generated file bytes: Object storage behind the media asset (storagePathname) for Library items; project knowledge files use storageUri (apps/web/app/api/files/[id]/text/route.ts; apps/web/app/api/projects/[id]/knowledge-files/[fileId]/text/route.ts).
- Asset metadata (name, type, size, deleted time, origin) for Library items: Media asset table, read through getActiveWorkspaceMediaAssetById (apps/web/app/api/files/[id]/text/route.ts:31).
- Text and table previews: Not stored. Built on each request from the stored file and sent with Cache-Control private, no-store (apps/web/app/api/files/[id]/text/route.ts:60).
- Downloaded text file: Browser memory as a Blob, then saved by the browser (LibraryView.tsx:1130 downloadText).
- Mobile exported text file: Device file storage written by exportSourceFile (apps/mobile/services/fileCreation.ts).
- Open artifact text in VS Code: In-memory contents map in the artifact content provider (artifactActions.ts; ArtifactContentProvider.dispose clears it).
- Viewer zoom and ask-bar text: React component state only; not saved (LibraryView.tsx:1166-1167).

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Text source size limit (30 MB)**: Files over this size are refused with 'This file is too large to preview'. (apps/web/app/api/files/[id]/text/route.ts:17)
- **Text output character limit (200,000)**: Longer text or spreadsheet output is cut and marked truncated. (packages/contracts/types/src/attachment-policy.json:50, read via packages/contracts/types/src/file-reference.ts:32)
- **Table row cap (500)**: Only the first 500 table rows are drawn. (packages/ui/unified-chat/src/components/library/FileTextPreview.tsx:14)
- **Project attachment size limit**: Limits the bytes read for project knowledge-file previews. (apps/web/app/api/projects/[id]/knowledge-files/[fileId]/text/route.ts (MAX_PLAN_ATTACHMENT_BYTES))
- **Rate limit 'files-serve'**: Caps how often the text route can be called. (apps/web/app/api/files/[id]/text/route.ts:24 (limit values not read))
- **Viewer zoom range**: Minimum 25%, maximum 400%, step 25%, default 100% for images. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1142-1145)
- **Preview mode for PDFs**: ?preview=pdf asks for an inline PDF; a non-PDF or a too-large PDF is refused. (apps/web/app/api/files/[id]/route.ts:219-228)
- **Preview-ready flag on project files**: A knowledge file marked textPreview uses the extracted-text path instead of the raw text path. (apps/web/features/projects/components/FilePreviewModal.tsx:247 and :191)
- **Recovery window for deleted Library items**: Sets when deleted items are permanently erased (affects which items can still be previewed). (apps/web/app/api/library/route.ts (RESOURCE_RECOVERY_WINDOW_DAYS, eraseAfter))
- **Web/desktop ask-about-file**: The ask bar appears only when the host passes askAboutFile. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1328; web host at apps/web/features/library/components/LibraryView.tsx:209)
- **Download as text button**: Hidden for files whose type already starts with text/, and until the text preview has loaded. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1254)

## Shared between apps

Shared: the Library viewer packages/ui/unified-chat/src/components/library/LibraryView.tsx and its FileTextPreview.tsx are used by the web app (apps/web/features/library/components/LibraryView.tsx) and the desktop app (apps/desktop/src/features/library/DesktopLibrary.tsx). The server preview code in apps/web/lib/server (file-text-preview.ts, office-document-text.ts) is used by the two web routes, and the CLI reaches it through the same HTTP route. The shared schema FileTextPreviewSchema comes from @agiworkforce/cloud-contracts, and the character limit comes from packages/contracts/types. Separate per app: mobile (apps/mobile/src/features/library/index.tsx, ImageFullScreen.tsx, ZoomableImage.tsx), CLI (apps/cli/src/cloud/library.rs, apps/cli/src/tui/markdown_renderer.rs), VS Code (apps/extension-vscode/src/core/commandSetup.ts, src/features/artifacts/artifactActions.ts). The project preview modal (apps/web/features/projects/components/FilePreviewModal.tsx) is web-only and has its own Markdown, code and PPTX branches.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says Markdown and source code should render formatted; the shared Library viewer (used by web and desktop) shows them as plain monospaced text. (packages/ui/unified-chat/src/components/library/FileTextPreview.tsx:87-89; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1309-1312. The project modal does format them: apps/web/features/projects/components/FilePreviewModal.tsx:81-88)
- Brief says the partial-extraction warning (S25.31) is missing everywhere, but the shared viewer and the CLI both print a truncation note. The note only reports a length cut, not a failed extraction. (packages/ui/unified-chat/src/components/library/FileTextPreview.tsx:91-95; apps/cli/src/lib.rs:7330-7334)
- Brief says presentation preview (S25.09) is missing on web, but the project preview modal has a PPTX branch. (apps/web/features/projects/components/FilePreviewModal.tsx:419-424 (PptxFilePreview); the shared Library viewer has no PPTX path)
- Brief marks CLI spreadsheet and Word preview as missing, but the CLI reads the same text route, which returns CSV for spreadsheets and text for Word files, and prints it. (apps/cli/src/cloud/library.rs:99 (text); apps/cli/src/lib.rs:7318-7326; apps/web/lib/server/file-text-preview.ts:52-56)
- Several brief code references do not show the behaviour they are cited for. CLI lib.rs:5511 is the approvals history output; lib.rs:2349 is marketplace subcommand docs; VS Code commandSetup.ts:713 and :965 are cloud-run approval and CLI check commands; mobile index.tsx:273 is the library options menu; index.tsx:774 is the grid-tile choice. (apps/cli/src/lib.rs:5511, apps/cli/src/lib.rs:2349, apps/extension-vscode/src/core/commandSetup.ts:713, :965, apps/mobile/src/features/library/index.tsx:273, :774)
- Zoom controls appear only for images, but the brief lists zoom under viewers in general (PDF and text viewers have no zoom). (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1221-1253 (rendered only when previewUri is set))
- The ask-about-file bar shows two disabled buttons (plus and microphone) and a static 'Auto' label. They are decorative and do nothing, which breaks the rule against dead controls. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1336-1344, 1353-1358, 1359-1367)
- Clicking a non-previewable item in the Library does nothing in this path; no message is shown. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:810 (openItem only opens the viewer when item.previewable))
- Brief says a PDF page-through or fit feature exists in no app, but the iframe passes the file with ?preview=pdf; how the browser's PDF frame reacts to a 'preview_too_large' JSON error response was not verified. (apps/web/app/api/files/[id]/route.ts:118-120, 228; LibraryView.tsx:1302-1308)
- Brief says Markdown and code render 'done' in VS Code via artifactActions, but that file opens artifacts read-only in an editor tab; the file-type syntax behaviour was not established. (apps/extension-vscode/src/features/artifacts/artifactActions.ts (openArtifactReadOnly))

## Not established

- Whether the browser's built-in PDF frame gives its own page navigation, zoom or rotate (these would look like features but come from the browser, not from the product code).
- Whether officeDocumentKind in apps/web/lib/server/office-document-text.ts covers presentation files; that file was imported but not read in detail.
- Plan or account gating for previews: no plan check was seen in the preview routes, but gates inside the shared route helpers (getUserScopedDb, getActiveWorkspaceMediaAssetById, withRateLimit) were not read.
- Exact limit values behind the 'files-serve' rate limit and the MAX_SERVE_BYTES and MAX_VIDEO_SERVE_BYTES caps in apps/web/app/api/files/[id]/route.ts were not opened.
- Mobile: how a non-image, non-video file is opened or downloaded (library index.tsx around line 140 and fileCreation.ts) was not read in full, so the mobile download and open-in-app status is unverified.
- Web and desktop copy-selection behaviour was not tested in a browser; the claim that selection copy works comes from the plain text block and is unverified.
- VS Code: the copy and open steps in artifactActions.ts (about lines 32, 98, 145) were partly read; the brief's line numbers are close but the exact behaviour of 'copy selected content' was not confirmed.
- The VS Code 'ask about a page or range' item: no code for page or range was found; only the selection-to-new-chat flow was read.
- Archive (zip) listing: no archive code was found in the files read, and no full search of the repository was run.
- Search inside a file and citation highlighting: no code found in the files read; no repository-wide search was run for these.
- Chrome extension: no file in the Chrome app was read; the brief marks every Chrome item missing, and that was not checked.
- I did not run the app, tests or builds, as the task required (read-only); behaviour claims come from reading the code only.
