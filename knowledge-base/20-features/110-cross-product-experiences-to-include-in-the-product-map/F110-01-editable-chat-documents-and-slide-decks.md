---
id: "F110-01"
type: "feature"
title: "Editable chat documents and slide decks"
aliases: ["Chat to editable document", "Edit document", "Edit source", "Artifact document editor", "Create file / Output chip (Document, Presentation, Spreadsheet)", "Slide deck / presentation artifact", "Document to presentation", "Office file tool (managed office file)", "S110.01", "S110.02"]
area: "110 Cross-product experiences to include in the product map"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S110.01", "S110.02"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:free", "plan:pro", "SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-security-and-privacy", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "file:apps/web/lib/services/managed-office-file-service.ts", "file:packages/platform/artifacts/src/artifact-store.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F110-01 Editable chat documents and slide decks

A document the assistant writes in chat opens in the Artifacts panel. On web it can be edited in a rich editor and saved as a new version. On the phone it is edited as plain Markdown source. The assistant can also make real Word, PowerPoint, Excel, PDF or CSV files, which appear as file cards.

Area: [110. Cross-product experiences to include in the product map](README.md). Requirement items: [S110.01](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11001), [S110.02](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11002).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Two linked jobs. (1) Chat to editable document: a Markdown document the assistant writes becomes a stored artifact. On web the person edits it in a rich text editor, or as Markdown source when the text cannot survive a round trip, and each saved change adds a version (apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx:21-22, 53-72; packages/platform/artifacts/src/artifact-store.ts:69-120). (2) Document to presentation: the assistant calls one server tool that builds a real .pptx from an ordered slide outline, and can also build .docx, .xlsx, .pdf and .csv (apps/web/lib/services/managed-office-file-service.ts:138-188, 233-260). Web also has an in-app deck artifact (Markdown slides) with its own editor (apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx).

**Why it exists.** Competing assistants let a person work on a written answer like a document and ask for a real file. Without this, answers stay as chat text. The requirements document lists Markdown documents, spreadsheets and presentations among artifact types and 'slide deck ... export where the generated format supports it' (doc: docs/product/requirements.md:1440-1448, 1488).

**Who uses it.** People on web and the desktop app (which shows the hosted web app, doc: AGENTS.md section 5) who write or revise documents and decks; people on the phone who receive generated files; Chrome extension users who receive generated files in the side panel.

**Problems it solves**

- A chat answer cannot be tweaked without copy and paste
- Edits would overwrite the assistant's text with no history
- People need a file they can send (Word, PowerPoint) instead of chat text
- A document with unsupported formatting would be corrupted by a rich editor

**Use cases**

- Ask for a project brief, open it, fix a paragraph in the rich editor, press Save to keep it as version 2
- Pick Output > Presentation in the web composer and ask for a 10 slide pitch; open the .pptx card
- Upload a Word file and ask the assistant to replace text in it, keeping the other parts of the file
- On the phone, open a generated deck from a Project's 'Slide deck' output and share the file

## 2. User experience

**Where to find it**

- Web (and Desktop, which shows the hosted web app [inferred from AGENTS.md section 5]): the Artifacts panel next to the chat. Header button 'Edit document' (aria-label) for a Markdown document, More menu item 'Edit source' (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2318, 2757). Composer plus menu row 'Output' with choices Document, Presentation, Spreadsheet (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:190, 960-1000; packages/contracts/cloud-contracts/src/skills.ts:22-26).
- Mobile: Add to chat sheet, row 'Create file' with the same three choices, shown only in AGI Cloud mode (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:343-352, 1181-1190). Full-screen artifact viewer, More action 'Edit source' (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1221). A Project's notebook screen lists 'Create from your sources' with a 'Slide deck' output (apps/mobile/src/features/notebook/ProjectNotebookScreen.tsx:175; packages/contracts/cloud-contracts/src/project-studio.ts).
- Chrome extension: generated files appear in the side panel with preview and save (apps/extension/src/features/side-panel/generatedFiles.ts:167-190).
- CLI and VS Code: no screen found for either job; the CLI can read .pptx text only (apps/cli/src/documents.rs:51, 262).

**Before you start**

- Web: a stored artifact that is the latest version, not PDF, Word or image, to see the edit control (ArtifactPreview.tsx:1041-1042)
- Office files: a streaming chat request and a model the catalog marks as tool capable, else the request is refused (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5460-5494)
- Mobile: AGI Cloud mode, signed in, tool capable model, cloud code execution granted (AddToChatSheet.tsx:343-352)
- Free plan chat is a restricted text-only mode where the Output control is disabled (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1502, 1643-1645)

**Screens and controls**

- Web rich editor: toolbar from DocumentFormattingToolbar, aria-label 'Document' text box (ArtifactDocumentEditor.tsx:30-43)
- Web header controls while editing: 'Save' (aria-label 'Save artifact source', tooltip 'Save as a new version'), 'Cancel' (aria-label 'Discard artifact source edit'), status text 'Draft kept on this device' or 'Draft not kept' (ArtifactPreview.tsx:2719-2740)
- Web notice when the text cannot be edited as a document: 'This document uses formatting the document editor cannot keep, such as math, footnotes or raw HTML, so it opens as Markdown.' (ArtifactDocumentEditor.tsx:21-22)
- Web deck workspace: menus Shape, Theme, Insert (Image, Table, Chart, Diagram), Slide (New slide after this, Duplicate slide, Move earlier, Move later, Delete slide), 'Present', 'Previous slide', 'Next slide', 'Stop presenting' (PresentationWorkspace.tsx:330-406, 444-801)
- Mobile editor: 'Cancel', 'Save' (accessibility label 'Save as a new version'), text field 'Artifact source', note 'A newer version arrived while you were editing.' (ArtifactFullScreen.tsx:1977-2016)

**Journey**

1. 1. Ask in chat for a document. The reply holds a Markdown document that is derived into a stored artifact (packages/platform/artifacts/src/artifact-derivation.ts:505-520).
2. 2. Open the artifact from the chat reply (web card or panel).
3. 3. Press 'Edit document'. If the text round-trips, the rich editor opens; otherwise Markdown source opens with the notice (ArtifactDocumentEditor.tsx:53-72).
4. 4. Type or use the toolbar. Each change is written to a draft kept in this browser (ArtifactPreview.tsx:661-679).
5. 5. Press 'Save'. A changed text adds the next version; an unchanged text adds none (ArtifactPreview.tsx:1124-1140; artifact-store.ts:69-120).
6. 6. Use 'Cancel' to drop the draft. Reopening later offers the kept draft with the toast 'Restored your unsaved edits to this artifact' (ArtifactPreview.tsx:1086-1092).
7. 7. For a file: choose Output > Presentation (or just ask for a PowerPoint), send. The server builds the file and the reply carries a file card; web previews a .pptx as slides (apps/web/features/chat/components/artifacts/presentation/PptxFilePreview.tsx:17, 56).

**What the person sees and gets**

- Toast 'Restored your unsaved edits to this artifact' on web
- Version list and restore of older versions (ArtifactVersionHistory.tsx; artifact-store.ts:172)
- Generated file card with name, type and status badge on mobile (GeneratedFileCard.tsx)
- Error reply text from the tool when generation fails, e.g. 'The Office file could not be attached.' (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2562-2590)

**Settings**

- Composer Output choice (Document, Presentation, Spreadsheet), set per message (ChatComposerNew.tsx:2569-2572)
- Deck theme marker in the deck Markdown (deck-themes.json) and the 'Theme' menu

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: rich Markdown document editor with a round-trip safety check; falls back to Markdown source with a notice (ArtifactDocumentEditor.tsx:53-72; document-editor-markdown.ts:16, 81)
- Web: explicit Save adds a version; same text adds none; history is append-only and restore adds a version (artifact-store.ts:69-120, 172-185)
- Web: draft kept in browser storage and restored (ArtifactPreview.tsx:1086-1092)
- Web server: one office tool builds docx, pptx (1 to 40 slides, up to 12 bullets each, optional speaker notes), xlsx, pdf, csv (managed-office-file-service.ts:138-188, 142-146; SlideSchema near line 76)
- Web server: the tool is added only when the request sets office_creation, which the composer sets from the Output choice or which the server turns on when the prompt has a create-verb and a file-type word (request-processor.ts:914-916, 993-998, 1258-1266)
- Web: generated file is stored and returned as a generated file attachment (tool-loop.ts:2575-2605)
- Web: in-app deck artifact editor with slide add, move, delete, charts, shapes, present mode; downloads as HTML and PDF (PresentationWorkspace.tsx; ArtifactPreview.tsx:1367-1383; deck-pdf.ts)
- Mobile: generated files show as cards and open full screen; Edit source with Save, stale-version warning and kept drafts (ArtifactFullScreen.tsx:880-974, 1977-2016; generatedFileArtifacts.ts)
- Mobile: Project 'Slide deck' output sends a prompt with the pptx format set (project-studio.ts; apps/mobile/src/features/notebook/service.ts:58-77)
- Chrome: generated files listed, previewed and saved from the side panel (generatedFiles.ts:167-190)

**Incomplete**

- Web: no control found that turns an existing document artifact into slides; the person must ask in chat, and the pptx tool takes slides, not a document (managed-office-file-service.ts:142-146). The brief calls this 'partial'.
- Web: an in-chat deck artifact exports to HTML and PDF; no export to .pptx was found in the deck code (ArtifactPreview.tsx:1367-1383; presentation folder)
- Mobile has no rich document editor; edit is a plain text field (ArtifactFullScreen.tsx:2016). The brief says 'mobile missing'; the code has source editing.
- Chrome: preview and save only; no editing control found (apps/extension/src/features/side-panel/artifactPanel.ts, no edit hits)

**Present but disconnected or switched off**

- Web uploads in production are refused unless an upload scanner address is configured (apps/web/lib/security/upload-scan.ts:408-430). This blocks uploading a Word file to edit. The brief points at upload-scan.ts:264, which is unrelated text; the status function is at 408-418.
- Mobile: the 'Create file' row is hidden unless the client feature flag for code execution is on, which it is (apps/mobile/lib/v1FeatureFlags.ts:34) and the account has the capability

**Not available**

- CLI: cannot create or edit documents or decks; only reads docx, pptx, xlsx text (apps/cli/src/documents.rs:51, 262; apps/cli/src/platform/runtime/tool_catalog.rs:509)
- VS Code: no document or deck feature found (no hits for pptx under apps/extension-vscode/src)
- Source of a pptx edit: the office tool accepts an existing Word or Excel file as source; PowerPoint cannot be the source (managed-office-file-service.ts:138, 188; the pptx schema at :142-146 has no source)

## 4. Required behaviour

**Established requirements**

- A document the assistant writes in chat opens as an artifact the user can edit as a document and save back as a new version. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.01)
- A document (chat artifact or uploaded file) is turned into a presentation the user can open and keep working on. (source: S110.02 (same brief))
- A document opens in the rich editor only when its text survives a round trip; otherwise it opens as Markdown source with a notice. (source: apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx:21-22, 53-72)
- A saved content change adds the next version and older versions stay listed. (source: packages/platform/artifacts/src/artifact-store.ts:69-120)
- A deck is built from an ordered outline of at most 40 slides. (source: apps/web/lib/services/managed-office-file-service.ts:146)
- The office tool edits an existing Word or Excel file; a PowerPoint file cannot be the source. (source: apps/web/lib/services/managed-office-file-service.ts:138, 188)
- Presentations, reports and images are versioned objects. (source: docs/product/experience-contract.md:44)

**Acceptance criteria**

1. Given a Markdown document with only headings, lists, tables and links, 'Edit document' opens the rich editor and 'Save' adds exactly one version.
2. Given a document containing math, a footnote or raw HTML, the editor shows Markdown source and the notice text.
3. Pressing 'Save' with unchanged text adds no version; 'Cancel' leaves the stored artifact unchanged.
4. Reloading during an edit offers the kept draft and the toast 'Restored your unsaved edits to this artifact'.
5. Choosing Output > Presentation and asking for a deck returns a .pptx card with no more than 40 slides.
6. Attaching a .docx and asking for a wording change returns a new .docx and leaves the original attachment untouched.
7. On a Free plan chat the Output row is disabled.
8. On mobile in Local mode the 'Create file' row is not shown.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Document to presentation from an artifact should be one visible action [inferred from S110.02 wording; no such control found]
- A deck made in chat should keep editing after it is exported as a file [inferred from S110.02 'keep working on']

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'Turn into slides' action on a document artifact that builds a deck artifact and offers .pptx export
- [proposed] Add .pptx export to the web deck workspace
- [proposed] Add a rich editor on mobile or state plainly that mobile edits source only

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactDocumentEditor | `apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx` | Rich editor or Markdown source fallback with notice |
| service | document-editor-markdown | `apps/web/features/chat/components/artifacts/document-editor-markdown.ts` | Round-trip test (roundTripsAsDocument) and editor extensions |
| component | DocumentFormattingToolbar | `apps/web/features/chat/components/artifacts/DocumentFormattingToolbar.tsx` | Formatting buttons for the rich editor |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Edit, Save, Cancel, drafts, version history, deck and file previews, publish menu |
| store | createArtifactStore | `packages/platform/artifacts/src/artifact-store.ts` | Content-keyed versions, restore, edit request state |
| store | web artifacts store | `apps/web/features/chat/stores/artifacts-store.ts` | Browser-persisted store (name agi-artifacts-store, 200 artifacts) with cloud sync push |
| service | artifact-derivation | `packages/platform/artifacts/src/artifact-derivation.ts` | Turns reply Markdown into typed artifacts including presentation |
| component | PresentationWorkspace | `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx` | Slide editor and present mode for deck artifacts |
| component | PptxFilePreview | `apps/web/features/chat/components/artifacts/presentation/PptxFilePreview.tsx` | Shows a generated .pptx file as slides |
| service | deck-html and deck-pdf | `apps/web/features/chat/components/artifacts/presentation/deck-html.ts` | Deck download as HTML and PDF (deck-pdf.ts) |
| service | managed-office-file-service | `apps/web/lib/services/managed-office-file-service.ts` | Tool definition, input schemas, builds docx, pptx, xlsx, pdf, csv |
| service | request-processor office gating | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | office_creation flag, intent detection, streaming and tool-capable checks, tool injection |
| service | tool-loop office branch | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs the tool, stores bytes, returns the generated file |
| component | ComposerPlusMenu OutputRows | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Output choice Document, Presentation, Spreadsheet |
| config | free-quota request schema | `packages/contracts/cloud-contracts/src/free-quota.ts` | Free managed chat accepts only office_creation false |
| component | ArtifactFullScreen (mobile) | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Full-screen viewer, source edit, drafts, stale warning, publish |
| service | generatedFileArtifacts (mobile) | `apps/mobile/src/features/chat/utils/generatedFileArtifacts.ts` | Maps generated file records to artifact cards |
| component | GeneratedFileCard (mobile) | `apps/mobile/src/features/chat/components/GeneratedFileCard.tsx` | File card with kind icon and status |
| store | outputFormatStore (mobile) | `apps/mobile/src/features/chat/store/outputFormatStore.ts` | Holds the chosen output format until the send |
| component | AddToChatSheet (mobile) | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | 'Create file' row |
| service | project-studio outputs | `packages/contracts/cloud-contracts/src/project-studio.ts` | Slide deck output prompt with pptx format |
| service | generatedFiles (Chrome) | `apps/extension/src/features/side-panel/generatedFiles.ts` | Preview and save generated files in the side panel |
| service | upload-scan | `apps/web/lib/security/upload-scan.ts` | Scanner requirement for uploaded files |
| service | CLI documents reader | `apps/cli/src/documents.rs` | Reads pptx, docx, xlsx text only |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses 'Edit document'; a draft session starts from the stored content. | device | apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2160-2164, 649-662 |
| The editor checks whether the Markdown round-trips; picks rich editor or source view. | device | apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx:53-72 |
| Each edit updates a draft stored in this browser. | device | ArtifactPreview.tsx:661-679 (writeStoredDraft) |
| Save writes the new content into the artifact store, which appends a version when the text changed. | device | ArtifactPreview.tsx:1124-1140; packages/platform/artifacts/src/artifact-store.ts:69-120 |
| The web store pushes artifact changes to the cloud sync endpoint so other devices see them. | device and our servers | apps/web/features/chat/stores/artifacts-store.ts:20-30 (ArtifactSyncPushItem, ChatSyncPushResponse imports); apps/web/app/api/chat/sync/route.ts (brief S110.18); push details not read, so rest is unknown |
| For a file: the composer sends office_creation and office_format on a streaming chat request. | device | apps/web/lib/hooks/useChatStream.ts:4641-4642 |
| The server checks streaming and tool-capable model, injects the office tool, and the chosen model calls it with the outline. | our servers | request-processor.ts:5460-5494, 1258-1266 |
| The server builds the file bytes in process (docx, pptxgenjs, pdf libraries); optional render check runs in the cloud sandbox when requested. | our servers | managed-office-file-service.ts:1-40, 930-1050; verify_render described in tool definition |
| Bytes are stored as a generated file for the user and conversation; the card returns to the client. | our servers | tool-loop.ts:2575-2605 (persistGeneratedFileBytes) |
| Client downloads and shows the file (web previews pptx as slides; phone downloads and shares; Chrome saves). | device | PptxFilePreview.tsx:56; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:654-655; apps/extension/src/features/side-panel/generatedFiles.ts:183-190 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Artifact content and versions | Browser storage key agi-artifacts-store on web (apps/web/features/chat/stores/artifacts-store.ts:591); mobile artifact store (path not read) | Pushed through chat sync on web (artifacts-store.ts imports ArtifactSyncPushItem); mobile sync of edited versions unknown | Web keeps at most 200 artifacts (artifacts-store.ts:30); older ones are dropped by the store. Server retention unknown. |
| Unsaved edit draft | Browser storage on web (ArtifactPreview.tsx:1086); mobile draft store (ArtifactFullScreen.tsx:889-921) | No; label says 'Draft kept on this device' | Removed on Save or Cancel (ArtifactPreview.tsx:1117-1140) |
| Generated office file bytes and record | Our file storage through persistGeneratedFileBytes, provider label agi-managed-office | Yes, it is server data; the phone fetches it by link | Retention period unknown (not read) |
| Uploaded source document | Sent with the turn; scanned first | Server side | unknown |

**Models and providers.** The chat model writes the outline and calls the tool; any model the catalog marks tool capable can (request-processor.ts:5478-5490). Building the file does not use a model. No specific provider is required by this code [inferred]. Which providers serve own-key (BYOK) turns through this server pipeline is unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, Desktop, Mobile office creation needs a signed-in account because the tool needs an authenticated owner ('An authenticated file owner is required.' tool-loop.ts:2566-2568). Editing a stored artifact on web needs no server call [inferred]. |
| Permissions | Edit shows only for a stored, latest-version artifact that is not PDF, Word or image (ArtifactPreview.tsx:1041-1042). Mobile edit needs a stored artifact with no generated-file manifest and the latest version (ArtifactFullScreen.tsx:880-884). |
| Subscription | Free managed chat accepts only office_creation false (packages/contracts/cloud-contracts/src/free-quota.ts:126) and the composer disables Output in restricted free chat (ChatComposerNew.tsx:1502, 1643-1645). The capability table has no 'office' capability; chat_tools applies to all cloud chat plans (packages/contracts/types/src/billing-catalog.ts:313, 351). A plan rule for office files on other plans: none found in the code. |
| Limits and metering | Slides 1 to 40, bullets 1 to 12 each; docx and pdf content up to 100,000 characters; csv rows up to 20,000; xlsx sheets up to 20 (managed-office-file-service.ts:76-190). Usage accounting for the tool call itself: none found in the code read. |
| Feature flags | Mobile: FEATURES.codeExecution (apps/mobile/lib/v1FeatureFlags.ts:34). Web upload: UPLOAD_SCAN_WEBHOOK_URL and UPLOAD_SCAN_REQUIRED settings (upload-scan.ts:408-418). Sandbox render check needs the cloud sandbox gate (see F110-02). |
| Model compatibility | A model the catalog marks without tools is refused with code office_creation_model_unsupported (request-processor.ts:5478-5490). The composer hides the choice when the selected model lacks tools unless Auto is selected (ChatComposerNew.tsx:1643-1645). |
| Provider restrictions | None found in the code for the office tool itself. Provider-native file tools are not used here [inferred]. |
| Local mode | Mobile: the 'Create file' row requires AGI Cloud mode (AddToChatSheet.tsx:343-346), so Local mode cannot create office files. Editing an already stored artifact on the phone does not need the cloud (ArtifactFullScreen.tsx:880-974) [inferred]. Web has no Local mode (docs/product/experience-contract.md:636). Desktop Local chat: not established for this feature. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Text cannot round-trip | Markdown source editor with a status notice | ArtifactDocumentEditor.tsx:21-22, 59-72 |
| Viewing an older version | No edit control; edit is for the latest version only | ArtifactPreview.tsx:1041-1042; ArtifactPreview.edit.test.tsx:113 |
| Artifact not in store | No edit control | ArtifactPreview.edit.test.tsx:98 |
| Newer version arrives during a mobile edit | Alert text 'A newer version arrived while you were editing.' and a confirm before saving over it | ArtifactFullScreen.tsx:960-972, 2000-2012 |
| Non-streaming request asks for an office file | 422 with code office_creation_stream_required | request-processor.ts:5460-5470 |
| Model lacks tools | 422 with code office_creation_model_unsupported | request-processor.ts:5478-5490 |
| File build or store fails | Tool returns an error text to the model ('The Office file could not be attached.') | tool-loop.ts:2575-2590 |
| Offline, retry, cancel of file build, timeout | not handled in the code I read for this feature specifically; general chat stream recovery exists in useChatStream (not read) | not established |
| Accessibility | Editor has aria-label 'Document', role textbox, aria-multiline; Save and Cancel have aria-labels | ArtifactDocumentEditor.tsx:30-37; ArtifactPreview.tsx:2719-2740 |
| Small screen on web | Artifact panel becomes a full-screen overlay below 640px and the transcript card is the way in | apps/web/features/chat/stores/artifacts-store.ts:37-47 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactPreview.edit.test.tsx`: Manual source editing: saves as a new content-keyed version, Cancel discards, no edit for unstored artifact or older version
- `apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.toolbar.test.tsx`: Formatting toolbar of the document editor
- `apps/web/features/chat/components/artifacts/ArtifactPreview.draftRetention.test.tsx`: Draft retention (by file name; cases not read) [inferred]
- `apps/web/features/chat/components/artifacts/ArtifactPreview.restore.test.tsx`: Version restore (by file name) [inferred]
- `packages/platform/artifacts/src/__tests__/artifact-store.test.ts`: Shared artifact store versioning (by file name) [inferred]
- `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.test.tsx`: Deck workspace (by file name) [inferred]
- `apps/web/features/chat/components/artifacts/presentation/deck-export.test.ts`: Deck HTML viewer with one section per slide, landscape PDF with one page per slide
- `apps/web/features/chat/components/artifacts/presentation/PptxFilePreview.test.tsx`: .pptx preview (by file name) [inferred]
- `apps/web/lib/services/managed-office-file-service.test.ts`: Office file builder (by file name) [inferred]
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.office-file.test.ts`: Office tool injection in the request processor (by file name) [inferred]
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.office-file.test.ts`: Office tool in the tool loop (by file name) [inferred]
- `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.drafts.test.tsx`: Mobile kept drafts (by file name) [inferred]
- `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.initialEdit.test.tsx`: Mobile opening straight into edit (by file name) [inferred]

**Test scenarios**

- **Edit and save a document on web**
  1. Ask for a 3 section brief with a table
  2. Open the artifact, press 'Edit document'
  3. Change one sentence and press 'Save'
  4. Open version history
  - Expected: Version count goes up by one; older version still listed; text shows the change.
- **Unsupported formatting falls back**
  1. Ask for a document that includes a footnote and a math formula
  2. Press 'Edit document'
  - Expected: Markdown source with the notice text; saving still adds a version.
- **Draft survives reload**
  1. Start editing, type, reload the page without saving
  2. Open the artifact again
  - Expected: Toast 'Restored your unsaved edits to this artifact' and the typed text is back.
- **Make a deck file**
  1. In the plus menu choose Output > Presentation
  2. Ask for an 8 slide deck on a topic
  3. Open the .pptx card
  - Expected: A .pptx file card; preview shows 8 slides; no more than 40 slides ever.
- **Edit an uploaded Word file**
  1. Attach a .docx
  2. Ask to replace a named phrase everywhere
  - Expected: A new .docx where the phrase changed; unrelated parts preserved.
- **Phone file card and source edit**
  1. In AGI Cloud mode open Add to chat > Create file > Presentation
  2. Send a request
  3. Open the card, then open a text artifact and use More > Edit source > Save
  - Expected: File card opens and shares; edited text adds a version.

**Where to look when it fails**

- Error codes office_creation_stream_required and office_creation_model_unsupported in the chat response
- Tool error texts 'Unknown tool' and 'An authenticated file owner is required.' (tool-loop.ts:2562-2568)
- Browser storage key agi-artifacts-store and draft keys for edits
- Upload refusal code scan_unavailable when no scanner is configured (upload-scan.ts:419-430)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md)
- Desktop: [70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md)
- Mobile: [70-qa/test-plans/mobile/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/mobile/110-cross-product-experiences-to-include-in-the-product-map.md)
- Chrome: [70-qa/test-plans/chrome/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/chrome/110-cross-product-experiences-to-include-in-the-product-map.md)

## 10. Gaps and dependencies

- **No one-step 'document to presentation' control** Affects: Web, Desktop, Mobile, Chrome users. Evidence: No such control found in ArtifactPreview.tsx or presentation folder; tool takes slides only (managed-office-file-service.ts:142-146). Work needed: Add an action that converts a document artifact into a deck and keep both linked
- **Web deck artifact cannot be exported as .pptx** Affects: Web and Desktop users who build decks in the panel. Evidence: Deck downloads are HTML and PDF only (ArtifactPreview.tsx:1367-1383). Work needed: Add a .pptx export or route the deck through the office tool
- **Mobile has no rich document editor** Affects: Mobile users. Evidence: ArtifactFullScreen.tsx:2016 plain TextInput. Work needed: Decide whether to build a rich editor; update the brief status from missing to partial
- **Upload scanner not provisioned blocks uploaded-document edits in production** Affects: Web and Desktop users. Evidence: upload-scan.ts:408-430; brief S110.02 Unfinished. Work needed: Owner provisions the scanner address (setting UPLOAD_SCAN_WEBHOOK_URL)
- **Empty, waiting and failure states and plan limits for file creation not established** Affects: All apps. Evidence: No plan rule found beyond Free refusal. Work needed: Read stream recovery code and define limits in the subscription catalog
- **CLI, VS Code cannot create or edit documents or decks** Affects: CLI and VS Code users. Evidence: documents.rs reads only. Work needed: Decide scope; brief marks them missing
- **Chrome document editing unverified** Affects: Chrome users. Evidence: No editing code in artifactPanel.ts. Work needed: Confirm requirement and test
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:free
- plan:pro
- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-security-and-privacy
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- file:apps/web/lib/services/managed-office-file-service.ts
- file:packages/platform/artifacts/src/artifact-store.ts

## Unknown

- Whether edited artifact versions sync from mobile to the cloud and where the server keeps them
- How long generated office files are kept
- Whether own-key (BYOK) turns reach the office tool
- Whether the desktop app exposes anything beyond the hosted web app for this feature
- Chrome document editing behaviour
- Plan or usage charge for building an office file
- Empty, waiting, offline and timeout states for file creation
