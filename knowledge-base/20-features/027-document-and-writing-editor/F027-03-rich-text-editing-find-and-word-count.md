---
id: "F027-03"
type: "feature"
title: "Rich text editing, find and word count"
aliases: ["Visual editor", "Rich text editor", "Document editor", "Edit document", "Find and replace (not built)", "Word count (not built)", "S27.02", "S27.13", "S27.14"]
area: "27 Document and writing editor"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S27.02", "S27.13", "S27.14"]
depends_on: ["surface:web", "surface:desktop", "file:apps/web/features/chat/components/artifacts/document-editor-markdown.ts", "F027-04", "F027-05", "F027-06", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F027-03 Rich text editing, find and word count

On web, a Markdown document can open in a visual editor with a formatting toolbar and undo and redo, so the person edits without seeing Markdown marks. It opens only if the Markdown survives a round trip; otherwise it opens as source with a notice. Find and replace and word count do not exist.

Area: [27. Document and writing editor](README.md). Requirement items: [S27.02](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2702), [S27.13](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2713), [S27.14](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2714).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Opens a Markdown document in a Tiptap based visual editor with a toolbar, and falls back to the Markdown source editor with a notice when the visual editor could not keep the text exactly.

**Why it exists.** People who do not know Markdown can still edit documents, and the check protects the document from silent changes.

**Who uses it.** Web users editing generated Markdown documents. The Desktop app shows the hosted web app.

**Problems it solves**

- Editing without learning Markdown.
- Avoiding silent loss of math, footnotes or raw HTML on save.

**Use cases**

- Fix a heading and a bullet in a generated plan.
- Add a table to a report.
- Open a document containing math and edit it as source.

## 2. User experience

**Where to find it**

- Web side panel header: an 'Edit' button (aria label 'Edit document') shown on a Markdown document in preview (ArtifactPreview.tsx:2751-2765).
- Web More menu: 'Edit source' (ArtifactPreview.tsx:2315-2324).
- Mobile, Chrome, CLI, VS Code: no visual editor. Desktop: no artifact code in apps/desktop; hosted web app (AGENTS.md section 5).

**Before you start**

- Panel variant, artifact stored, latest version, not PDF, DOCX or image (ArtifactPreview.tsx:1041-1042).

**Screens and controls**

- Toolbar labelled 'Formatting' with a 'Text style' dropdown and buttons including Undo and Redo (DocumentFormattingToolbar.tsx:100-270).
- Editing area labelled 'Document' (ArtifactDocumentEditor.tsx:33-35).
- Notice text when source-only: 'This document uses formatting the document editor cannot keep, such as math, footnotes or raw HTML, so it opens as Markdown.' (ArtifactDocumentEditor.tsx:21-22).

**Journey**

1. Open a Markdown document.
2. Click Edit.
3. The visual editor opens if the document round-trips; otherwise source with the notice.
4. Type and format.
5. Use Undo or Redo on the toolbar.
6. Click Save to make a new version or Cancel to drop changes (see F027-06).

**What the person sees and gets**

- Toolbar buttons show pressed state; Undo and Redo disable when nothing can be done (DocumentFormattingToolbar.tsx:90-92, 255-268).
- Spinner 'Opening the editor' while the editor loads (ArtifactPreview.tsx:371-374).

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Visual editor with StarterKit, tables, task lists (document-editor-markdown.ts:10-17).
- Round-trip check before opening visually; math pattern forces source (document-editor-markdown.ts:19,83-91).
- Fallback to the code editor with a status notice (ArtifactDocumentEditor.tsx:67-79).
- Edits are emitted as Markdown on every change (ArtifactDocumentEditor.tsx:40).

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- Underline is switched off in the editor (document-editor-markdown.ts:11).

**Not available**

- Find and replace: no code found in apps/web/features/chat/components/artifacts.
- Word or character count: no code found there.
- Visual editor on mobile, Chrome, CLI, VS Code.
- Desktop-specific editor: none found in apps/desktop.

## 4. Required behaviour

**Established requirements**

- Documents open in a structured rich-text editor where formatting is edited visually. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S27.02)
- The editor can find text and replace matches. (source: S27.13 (same brief))
- The editor shows the document's word or character count. (source: S27.14 (same brief))
- The visual editor opens only when Markdown survives a round trip. (source: apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx:49-52)

**Acceptance criteria**

1. Click Edit on a plain Markdown document: a toolbar and editable area appear.
2. Open a document containing '$$x$$': it opens as source with the notice.
3. Undo is disabled before any edit and enabled after typing.
4. Redo is enabled after Undo.
5. Edited text is stored as Markdown after Save.
6. No Find or Word count control exists (current state to confirm).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The brief marks S27.02 missing for web although the editor exists; the brief is out of date.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add find and replace using Tiptap search.
- [proposed] Show a word and character count in the toolbar or footer.
- [proposed] Offer the visual editor on mobile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactDocumentEditor | `apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx` | Chooses visual or source editor; hosts Tiptap. |
| component | DocumentFormattingToolbar | `apps/web/features/chat/components/artifacts/DocumentFormattingToolbar.tsx` | Toolbar buttons. |
| service | documentEditorExtensions, roundTripsAsDocument | `apps/web/features/chat/components/artifacts/document-editor-markdown.ts` | Editor extensions and lossless check. |
| component | ArtifactCodeEditor | `apps/web/features/chat/components/artifacts/ArtifactCodeEditor.tsx` | Source editor used as fallback. |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Edit button, dynamic import and rendering at line 3290. |
| config | Tiptap packages | `apps/web/package.json` | Declares the Tiptap core, markdown, table, list, react and starter-kit packages (lines 112-118). |
| test | toolbar test | `apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.toolbar.test.tsx` | Tests rich editor opening, heading and bold. |
| test | edit test | `apps/web/features/chat/components/artifacts/ArtifactPreview.edit.test.tsx` | Tests save and cancel. |
| test | draft retention test | `apps/web/features/chat/components/artifacts/ArtifactPreview.draftRetention.test.tsx` | Tests drafts including the rich editor callback. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Edit starts a draft from the current Markdown. | device | ArtifactPreview.tsx:2161-2163 |
| The editor parses the text and compares token signatures before and after serialization; a mismatch or math means source mode. | device | document-editor-markdown.ts:83-91 |
| Each edit serializes to Markdown and updates the draft. | device | ArtifactDocumentEditor.tsx:40; ArtifactPreview.tsx:3290-3295 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Draft Markdown | Browser localStorage under 'agi.artifact-draft:<id>' (ArtifactPreview.tsx:395,639) | No until saved | Removed on Save, Cancel or restore (ArtifactPreview.tsx:1119,1139). |

**Models and providers.** No model or provider takes part in editing. The editor runs in the browser.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for opening the editor; the artifact must be in the local store. |
| Permissions | Edit is offered only for the latest version in the panel (ArtifactPreview.tsx:1041-1042). |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Works entirely on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner 'Opening the editor' while the code is fetched. | ArtifactPreview.tsx:371-374 |
| Not round-trippable | Opens as Markdown source with a status notice. | ArtifactDocumentEditor.tsx:67-79 |
| Parse error | Treated as not round-trippable. | document-editor-markdown.ts:88-90 |
| Cannot undo or redo | Buttons disabled. | DocumentFormattingToolbar.tsx:256,265 |
| Touch | Buttons are 44 pixels on small screens, 32 on wider. | DocumentFormattingToolbar.tsx:63 |
| Find, word count | not handled in the code (searched the artifacts folder for word count and find and replace; no match). | No match in apps/web/features/chat/components/artifacts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.toolbar.test.tsx`: Rich editor opens, heading level set from toolbar, bold toggles and reports pressed.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.edit.test.tsx`: Saving an edited source as a new version, discarding, no edit control for non-stored or older version.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.draftRetention.test.tsx`: Draft ownership and the rich editor persisting before unmount.

**Test scenarios**

- **Open visually**
  1. Open a plain Markdown document
  2. Click Edit
  - Expected: Toolbar 'Formatting' and area 'Document' appear.
- **Source-only**
  1. Open a document with '$$a+b$$'
  2. Click Edit
  - Expected: Source editor plus the notice.
- **Undo and redo**
  1. Type a word
  2. Click Undo
  3. Click Redo
  - Expected: Word disappears then returns; buttons enable accordingly.
- **Raw HTML**
  1. Open a document with a raw HTML block
  2. Click Edit
  - Expected: Expected source-only if the round trip differs; confirm by running (not established from code).
- **No find**
  1. Open the editor
  2. Press Cmd or Ctrl plus F
  - Expected: Only the browser's find opens; no editor find and replace.

**Where to look when it fails**

- Dynamic import failure shows nothing specific; check the browser console.
- Attribute aria-label 'Document' on the editor; testid artifact-document-editor.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/027-document-and-writing-editor.md](../../70-qa/test-plans/web/027-document-and-writing-editor.md)
- Desktop: [70-qa/test-plans/desktop/027-document-and-writing-editor.md](../../70-qa/test-plans/desktop/027-document-and-writing-editor.md)

## 10. Gaps and dependencies

- **No find and replace.** Affects: Web, Desktop, mobile, Chrome. Evidence: No code found; brief S27.13. Work needed: Design and build search and replace in the editor and source view.
- **No word or character count.** Affects: All apps. Evidence: No code found; brief S27.14. Work needed: Add a count.
- **No visual editor on mobile.** Affects: Mobile. Evidence: Plain TextInput at ArtifactFullScreen.tsx:2016. Work needed: Decide whether to build one.
- **Brief S27.02 status is out of date for web.** Affects: Documentation. Evidence: ArtifactDocumentEditor.tsx exists. Work needed: Update the brief.
- Not built on: Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- file:apps/web/features/chat/components/artifacts/document-editor-markdown.ts
- F027-04
- F027-05
- F027-06
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design

## Unknown

- Which exact Markdown constructs fail the round-trip beyond math (only the signature comparison was read).
- Whether Desktop shows this editor identically; not run.
- Whether the brief's raw HTML case really falls back; the check was read but not run.
