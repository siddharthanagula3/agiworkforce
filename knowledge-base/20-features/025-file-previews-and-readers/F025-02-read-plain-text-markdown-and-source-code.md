---
id: "F025-02"
type: "feature"
title: "Read plain text, Markdown and source code"
aliases: ["Text reader", "Markdown reader", "Source-code reader", "library show", "TextFileView", "S25.02 Text-file reader", "S25.03 Markdown reader", "S25.04 Source-code reader"]
area: "25 File previews and readers"
available_on: ["web", "desktop", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S25.02", "S25.03", "S25.04"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-api-and-contracts", "SYS-shared-ui-and-design", "SYS-authentication-and-identity", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:desktop", "mode:cloud", "api:GET /api/files/[id]/text"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F025-02 Read plain text, Markdown and source code

Shows text, Markdown and code files as readable text. In a web project the preview modal renders Markdown and code blocks; the shared Library viewer, mobile and Tauri show plain monospace text. The CLI prints files with terminal colour when run in a terminal. VS Code opens chat artifacts in an editor tab.

Area: [25. File previews and readers](README.md). Requirement items: [S25.02](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2502), [S25.03](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2503), [S25.04](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2504).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | built | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Reads a text-like file and shows it. Web project modal fetches the raw file and renders Markdown through the chat Markdown component or code through a fenced block with a language (apps/web/features/projects/components/FilePreviewModal.tsx:81-164). The shared Library viewer fetches a text preview from the server and prints it in a pre block (packages/ui/unified-chat/src/components/library/FileTextPreview.tsx:86-89). The CLI prints the same text (apps/cli/src/lib.rs:7318-7334).

**Why it exists.** People keep notes, logs, Markdown and code in projects and the Library and should read them without downloading. The brief wants text, Markdown rendering and syntax-aware code (S25.02-S25.04).

**Who uses it.** Web, Electron Desktop, mobile and CLI users; VS Code users reading assistant artifacts.

**Problems it solves**

- Reading a file inline instead of downloading.
- Reading Markdown formatted.
- Terminal-safe printing of cloud files (control characters are sanitised, apps/cli/src/lib.rs:7330).

**Use cases**

- Open a README.md in a project's knowledge list and see headings and lists.
- Open a .py file in a project and see highlighted code.
- Run 'agi library show <id>' to read a Library note in the terminal.
- Open a .txt in the mobile Library.

## 2. User experience

**Where to find it**

- Web project: knowledge list row opens modal 'Preview: <file name>' (FilePreviewModal.tsx:282).
- Web and Electron Library: click tile 'Open <file name>'; viewer dialog '<file name> viewer'.
- Mobile: Library file card or project Sources tab opens the file sheet.
- CLI: 'agi library' lists, 'agi library show <id>' prints (apps/cli/src/cloud/library.rs:156-158; lib.rs:7318).
- VS Code: the artifacts tree opens an artifact read-only in an editor tab (apps/extension-vscode/src/features/artifacts/artifactActions.ts:98-125).

**Before you start**

- Signed in with a Cloud account (CLI requires managed Cloud mode: apps/cli/src/cloud/client.rs:361-373).
- Library item must have a text type the server recognises (text/*, json, xml, yaml, csv, tsv, office) (apps/web/lib/server/file-text-preview.ts:15-38).

**Screens and controls**

- Web Library viewer: monospace block; 'Download <name>'; 'Close file viewer'.
- Project modal: file name, type and size line; 'Download'; 'Close'.
- Mobile sheet: line list that can be selected; Share; Close.
- CLI: command output; a note '(The preview stops here; agi library download <id> saves the whole file.)' when cut.

**Journey**

1. Find the file.
2. Open it.
3. Read; scroll.
4. Download or close.

**What the person sees and gets**

- Spinner while the text loads (LibraryView.tsx:1313-1314).
- Web project modal: 'Loading...' then text, or 'Failed to load file contents.' (FilePreviewModal.tsx:111-127).
- Mobile: 'Could not open this file' with Retry, 'This file is empty.' (TextFileView.tsx:67-107).
- Fallback 'Preview isn’t available for this file inline.' with 'Download to view' (LibraryView.tsx:1319-1324).

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server route returns kind, text, truncated for text/*, json, xml, yaml and csv/tsv, cut at 200000 characters (apps/web/app/api/files/[id]/text/route.ts:36-62; file-text-preview.ts:62-71; packages/contracts/types/src/attachment-policy.json:50).
- Shared viewer shows it in a pre block with wrap (FileTextPreview.tsx:86-95).
- Project modal: Markdown rendered formatted; code files get a language from the extension table; other text plain (FilePreviewModal.tsx:20-87, 129-184). Chat Markdown component ships a syntax highlighter dependency (packages/ui/unified-chat/package.json:24, 102-127), so code blocks are likely highlighted [inferred].
- Mobile: txt, markdown, html, csv, tsv, json, jsonl, xml, yaml render as selectable monospace lines; csv/tsv as a grid (viewerKind.ts:45-53; TextFileView.tsx:88-135; file-model.ts DOCUMENT_CLASSES).
- CLI: Markdown and code printed with terminal colours when stdout is a terminal, plain when piped; txt, log, csv, tsv plain (apps/cli/src/cloud/library.rs:40-60; lib.rs:7322-7334).
- VS Code: an artifact opens in an editor tab with the language mode set, so the editor colours it (artifactActions.ts:121-124; artifactPresentation.ts:86-92).

**Incomplete**

- Shared Library viewer, mobile and Tauri show Markdown and code as plain text; the brief wants formatted Markdown and syntax colours (S25.03, S25.04).
- Mobile has no viewer for code files such as .ts or .py: they are not in the declared document classes, so the unsupported panel shows (viewerKind.ts:49-50; FileViewerScreen.tsx:190-212).
- Project modal code path escapes backslashes and backticks before fencing (FilePreviewModal.tsx:151-152); the effect on code that contains them is unverified [inferred it may show doubled backslashes].
- Project modal text preview fetches the raw file with no size cap (FilePreviewModal.tsx:95); the Library path caps at 200000 characters.

**Present but disconnected or switched off**

- Tauri DesktopLibrary text dialog (plain text, 500000 character cap) is unreachable because openPreview is never called (DesktopLibrary.tsx:59-81, 181; LibraryView.tsx:267).

**Not available**

- Chrome: no file text reader found.
- VS Code: no reader for uploaded Library files; only chat artifacts (surface matrix: docs/product/surface-feature-matrix.md:198).

## 4. Required behaviour

**Established requirements**

- Plain-text files open in a readable in-product view. (source: S25.02)
- Markdown files render formatted. (source: S25.03)
- Source-code files open with syntax-aware display. (source: S25.04)
- Viewers show loading, error and unsupported states. (source: doc: docs/product/experience-contract.md:507-518)

**Acceptance criteria**

1. A .md file in a web project preview shows headings and lists, not raw symbols.
2. A .py file in a web project preview shows a code block labelled python.
3. A .txt file in the web Library opens in the viewer as monospace text, with the start-of-file note when over 200000 characters.
4. A file with no text preview answers 404 'This file has no text preview'.
5. 'agi library show <id>' prints plain text when piped and coloured output in a terminal.
6. A load failure shows 'Failed to load file contents.' (project modal) or the fallback with 'Download to view' (Library).
7. [proposed] The Library viewer, mobile and the web project modal give the same Markdown and code result.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- One shared text renderer should serve every surface, so Markdown looks the same everywhere (AGENTS.md section 3, one owner per concept) [inferred].

**Proposed improvements** (suggestions, not requirements)

- Reuse the project modal's render-mode logic inside the shared Library viewer.
- Add code-file extensions to mobile's declared classes if the product should read them.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | FileTextPreview and useFileTextPreview | `packages/ui/unified-chat/src/components/library/FileTextPreview.tsx` | Fetches and validates the preview, then renders pre or table. |
| component | FileViewerOverlay | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Chooses the text preview branch when item is previewable and a loader exists (line 1174-1176, 1313-1316). |
| component | Web LibraryView host | `apps/web/features/library/components/LibraryView.tsx` | textPreviewUri appends /text (line 159). |
| endpoint | GET /api/files/[id]/text | `apps/web/app/api/files/[id]/text/route.ts` | Library text preview; 30 MB source limit; no-store. |
| endpoint | GET /api/projects/[id]/knowledge-files/[fileId]/text | `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/text/route.ts` | Project text preview for tables and office files. |
| service | file-text-preview | `apps/web/lib/server/file-text-preview.ts` | fileTextPreviewKind and renderFileTextPreview; 200000 character cut. |
| schema | FileTextPreviewSchema | `packages/contracts/cloud-contracts/src/library.ts` | Wire shape: kind table or text, text, truncated, fileName. |
| config | attachment policy | `packages/contracts/types/src/attachment-policy.json` | maxTextPreviewChars 200000 and text extension list. |
| component | FilePreviewModal | `apps/web/features/projects/components/FilePreviewModal.tsx` | Project modal; EXT_LANG table, resolveRenderMode, TextPreview, MarkdownContent. |
| component | KnowledgeFilesPanel | `apps/web/features/projects/components/KnowledgeFilesPanel.tsx` | Opens the modal on row click. |
| service | project-knowledge-files | `apps/web/lib/server/project-knowledge-files.ts` | Adds textPreview and textPreviewKind to each file (lines 79-91). |
| component | TextFileView and TableFileView | `apps/mobile/src/features/chat/components/artifact-viewers/TextFileView.tsx` | Mobile text lines, empty and failed states. |
| schema | viewerKind | `apps/mobile/src/features/chat/components/artifact-viewers/viewerKind.ts` | Decides text vs table vs unsupported. |
| component | FileViewerScreen | `apps/mobile/src/features/chat/components/artifact-viewers/FileViewerScreen.tsx` | Mobile sheet and unsupported panel. |
| command | agi library show | `apps/cli/src/lib.rs` | Show subcommand prints the preview, notes truncation (lines 7318-7334). |
| service | CLI library client | `apps/cli/src/cloud/library.rs` | text(), TextPreview, formatted_source fence logic (lines 31-60, 98-100). |
| service | CLI markdown renderer | `apps/cli/src/tui/markdown_renderer.rs` | render_markdown_ansi used for terminal output. |
| component | VS Code artifact actions | `apps/extension-vscode/src/features/artifacts/artifactActions.ts` | openArtifactReadOnly and copy for chat artifacts. |
| service | artifactPresentation | `apps/extension-vscode/src/features/artifacts/artifactPresentation.ts` | artifactEditorLanguage picks the editor language (line 86). |
| component | DesktopLibrary (Tauri tree) | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Own text dialog, unreachable today. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Library viewer asks for <file url>/text with the session cookie. | device | LibraryView.tsx:667-670; apps/web/features/library/components/LibraryView.tsx:159 |
| Server checks scope, picks the preview kind, refuses over 30 MB, reads the object and returns JSON with text cut at 200000 characters. | our servers | apps/web/app/api/files/[id]/text/route.ts:24-62; file-text-preview.ts:62-71 |
| Bytes are read from private storage. | outside service | text/route.ts:45 (readStoredMedia) |
| The browser validates the JSON against the schema and renders it. | device | FileTextPreview.tsx:28-37 |
| Project modal for a plain text file fetches the raw file URL and renders it locally. | device and our servers | FilePreviewModal.tsx:93-109 |
| Mobile downloads a cache copy and reads it as a string. | device and our servers | TextFileView.tsx:22-53 |
| CLI calls the text route with the account token and prints. | device and our servers | apps/cli/src/cloud/library.rs:98-100; lib.rs:7317-7334 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Preview JSON (text, kind, truncated, fileName) | Not stored; response is private no-store | No | Discarded after render (text/route.ts:61) |
| Source file | Cloud media storage; mobile cache copy | Cloud is source | Mobile copies cleared with cache and sign-out (fileCreation.ts:526-558) |

**Models and providers.** No model reads the text for preview. 'Ask about this file' starts a normal chat (SYS-chat-turn-pipeline).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; CLI needs a managed Cloud session and refuses Local or own-key sessions with NotManaged (apps/cli/src/cloud/client.rs:361-373). |
| Permissions | Workspace-scoped asset lookup; 404 for others (text/route.ts:31-32). |
| Subscription | The /text routes call no download allowance check (text/route.ts and knowledge-files text route contain none). The raw project file fetch (project modal plain text) may be metered; unknown. |
| Limits and metering | 30 MB source (text/route.ts:17, 38), 200000 characters (attachment-policy.json:50), rate limit 'files-serve' (text/route.ts:24). Viewer shows up to 500 table rows (FileTextPreview.tsx:14). |
| Feature flags | none found in the code |
| Model compatibility | Not model dependent. |
| Provider restrictions | Not provider dependent. |
| Local mode | Library files live in Cloud, so Local and own-key modes cannot read them in the CLI (refused) and the apps need a Cloud sign-in. VS Code artifacts come from Cloud chat history (artifactActions.ts:44-60). Mobile on-device file:// sources are read in place (useLocalFileCopy.ts:44). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner (Library), 'Loading...' (project modal), indicator (mobile). | LibraryView.tsx:1313; FilePreviewModal.tsx:121-127; TextFileView.tsx:57-66 |
| Empty file | Mobile says 'This file is empty.'; web shows an empty block. | TextFileView.tsx:96-106 |
| Error | Library falls back to 'Preview isn’t available for this file inline.' and Download to view; project modal 'Failed to load file contents.'; mobile Retry. | LibraryView.tsx:1319-1324; FilePreviewModal.tsx:111-119; TextFileView.tsx:67-84 |
| Cut text | 'Showing the start of this file. Download it to see all of it.' on web; CLI prints a stop note. | FileTextPreview.tsx:91-95; lib.rs:7331-7335 |
| Request cancelled | Hook ignores a late response after close. | FileTextPreview.tsx:26-40 |
| Unsupported type | Web: row click does nothing when not previewable; mobile unsupported panel with Share. | LibraryView.tsx:810; FileViewerScreen.tsx:190-212 |
| Offline | Treated as an error above; no separate offline state in the code. | FileTextPreview.tsx:35-37 |
| Accessibility | Mobile lines are selectable; web dialogs have roles and labels. | TextFileView.tsx:117; LibraryView.tsx:1198-1203 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/files/[id]/text/__tests__/route.test.ts`: Auth, 404 cases, size refusals, stored-text render, csv table.
- `apps/web/lib/server/office-document-text.test.ts`: Office extraction used by the same preview path.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/FileViewerScreen.test.tsx`: Text file shown line by line with size and page, CSV grid.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/viewerKind.test.ts`: Which types get text, grid or no viewer.
- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Opens rows in the file viewer (no Markdown or code test found).
- `apps/cli/src/cloud/library.rs`: Unit tests for list and render only; no test of formatted_source found in the CLI tree.

**Test scenarios**

- **Markdown in a project**
  1. Add a .md file with a heading and a list to a web project.
  2. Open it from the knowledge list.
  - Expected: Heading and list render formatted.
- **Code in a project**
  1. Add a .py file.
  2. Open it.
  - Expected: Code block with python language; check backslashes and backticks in the sample.
- **Library text**
  1. Upload a .txt over 200000 characters.
  2. Open from Library.
  - Expected: Monospace text and the start-of-file note.
- **CLI**
  1. Run agi library show <md id> in a terminal.
  2. Run it piped to a file.
  - Expected: Coloured output in the terminal; plain text in the file.
- **Mobile code file**
  1. Upload a .ts file; open on mobile.
  - Expected: 'Preview isn’t available for this file type.' with Share (current behaviour).

**Where to look when it fails**

- HTTP status on /api/files/<id>/text: 404 'This file has no text preview', validation 'This file is too large to preview'.
- CLI errors: SignedOut, NotManaged, SessionExpired.
- Mobile Alert and testIDs text-file-failed, text-file-empty.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/025-file-previews-and-readers.md](../../70-qa/test-plans/web/025-file-previews-and-readers.md)
- Desktop: [70-qa/test-plans/desktop/025-file-previews-and-readers.md](../../70-qa/test-plans/desktop/025-file-previews-and-readers.md)
- CLI: [70-qa/test-plans/cli/025-file-previews-and-readers.md](../../70-qa/test-plans/cli/025-file-previews-and-readers.md)
- VS Code: [70-qa/test-plans/vscode/025-file-previews-and-readers.md](../../70-qa/test-plans/vscode/025-file-previews-and-readers.md)

## 10. Gaps and dependencies

- **Shared Library viewer shows Markdown and code as plain text.** Affects: Web, Electron Desktop Library users.. Evidence: FileTextPreview.tsx:86-89 versus FilePreviewModal.tsx:131-164.. Work needed: Render by type in the shared viewer.
- **Mobile cannot preview code files and shows Markdown as plain lines.** Affects: Mobile users.. Evidence: viewerKind.ts:45-53; TextFileView.tsx:115-126.. Work needed: Add code classes and a Markdown renderer.
- **Two text paths with different limits (raw fetch with no cap versus 200000-character route).** Affects: Web project users with huge text files.. Evidence: FilePreviewModal.tsx:95 versus file-text-preview.ts:66-70.. Work needed: Route project text through the same capped preview.
- **Chrome has no text reader; VS Code reads chat artifacts only, not Library files.** Affects: Chrome and VS Code users.. Evidence: surface matrix docs/product/surface-feature-matrix.md:198-199.. Work needed: Decide scope per surface.
- **Brief marks VS Code source-code 'done'; the code is an artifact editor tab, not a file previewer, and its link to file types was not verified.** Affects: Brief accuracy.. Evidence: artifactActions.ts:98-125.. Work needed: Reword the brief row.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-api-and-contracts
- SYS-shared-ui-and-design
- SYS-authentication-and-identity
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:desktop
- mode:cloud
- api:GET /api/files/[id]/text

## Unknown

- Whether the chat Markdown component highlights code in the project modal (dependency exists; rendering not run).
- Whether doubled backslashes appear in the project modal code view.
- Whether the project raw-file route spends download allowance.
- How a .py or .ts file's stored mime type is set at upload, which decides whether the Library marks it previewable.
- No test results recorded; no CLI test of formatted_source found.
