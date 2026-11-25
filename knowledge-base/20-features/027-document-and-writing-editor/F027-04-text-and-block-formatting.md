---
id: "F027-04"
type: "feature"
title: "Text and block formatting"
aliases: ["Formatting toolbar", "Text style", "Heading controls", "Bold, italic, links", "Lists and checklists", "Quote and code block", "Callouts (not built)", "S27.04", "S27.05", "S27.06", "S27.07", "S27.10", "S27.11"]
area: "27 Document and writing editor"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S27.04", "S27.05", "S27.06", "S27.07", "S27.10", "S27.11"]
depends_on: ["surface:web", "surface:desktop", "F027-03", "F027-05", "file:apps/web/features/chat/components/artifacts/DocumentFormattingToolbar.tsx", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "5 of 13 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F027-04 Text and block formatting

In the web visual editor, a toolbar sets text style (normal, heading 1 to 6, code block) and applies bold, italic, strikethrough, inline code, links, lists, checklists, quotes and code blocks. Underline, alignment, spacing, indentation and callouts do not exist. Math shows in the web reader view, and also in the Chrome side panel and the VS Code webview, which render it through markdownItMath.

Area: [27. Document and writing editor](README.md). Requirement items: [S27.04](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2704), [S27.05](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2705), [S27.06](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2706), [S27.07](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2707), [S27.10](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2710), [S27.11](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2711).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets the person style text and insert blocks in a document, and renders code and math in the reader view.

**Why it exists.** Documents need structure and emphasis, and people expect buttons instead of Markdown marks.

**Who uses it.** Web users editing documents; readers of documents on all apps that render Markdown.

**Problems it solves**

- Making a heading or list without typing marks.
- Safe links that cannot run scripts.

**Use cases**

- Turn a line into Heading 2.
- Make a checklist for a task list.
- Add a link to a source.
- Insert a code block.

## 2. User experience

**Where to find it**

- Web: the toolbar named 'Formatting' above the visual editor (DocumentFormattingToolbar.tsx:117-122).
- Web source mode: keyboard shortcuts Cmd or Ctrl plus B, I and K wrap the selection (ArtifactPreview.tsx:387-393). They wrap with **, _ and [text](https://), and are wired for documents at ArtifactPreview.tsx:3295 and 3339. The K link shortcut inserts an unchecked https:// placeholder and bypasses safeHref [missing fact: ArtifactPreview.tsx:3295,3339].
- Reader view on web and shared Markdown renderer elsewhere: code and math display (MarkdownContent.tsx).
- Mobile: source text box only (ArtifactFullScreen.tsx:2016). Others: none.

**Before you start**

- The visual editor is open (see F027-03).

**Screens and controls**

- Dropdown 'Text style': Normal text, Heading 1 to 6, Code block.
- Buttons: Bold, Italic, Strikethrough, Inline code, Link, Bulleted list, Numbered list, Checklist, Quote, Code block, Insert table, Undo, Redo.
- Link form: box 'Link address' (hidden label) with placeholder 'Paste or type a link', buttons Apply and Remove link.

**Journey**

1. Select text or place the cursor.
2. Pick a style or click a button.
3. For a link, click Link, type an address, click Apply.
4. Save (F027-06).

**What the person sees and gets**

- Active styles show as pressed buttons.
- Shortcut hints in tooltips: bold and italic (Cmd or Ctrl plus B and I), code block (Cmd or Ctrl plus Alt plus C), undo and redo (DocumentFormattingToolbar.tsx:152-186,215-216,255-268).

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Heading levels 1 to 6, paragraph and code block via dropdown (DocumentFormattingToolbar.tsx:99-101,135-147).
- Bold, italic, strike, inline code toggles (lines 148-178).
- Link accepts only http, https and mailto. A bare address without a scheme-like prefix gets https; an address with host:port (for example example.com:8080 or localhost:3000) is treated as a scheme and rejected without a message (safeHref, DocumentFormattingToolbar.tsx:32-42).
- Bulleted, numbered, task list, blockquote and code block (lines 193-215).
- Reader view renders math on the web through remark-math (remarkPlugins.ts:73). taskList.ts supplies the helpers that find and toggle checklist markers (taskIndexAtOffset, taskList.ts:34-37). markdownItMath.ts serves the Chrome side panel and the VS Code webview, which both render math through it (apps/extension/src/features/side-panel/markdown.ts, apps/extension-vscode/src/webview/render.ts).
- The same Tiptap editor and roundTripsAsDocument gate are also used by the slide text editor, so slide text gets the same formatting rules (apps/web/features/chat/components/artifacts/presentation/SlideTextEditor.tsx:12,83).

**Incomplete**

- Math is shown but cannot be edited visually. Documents with math, or any content that does not round-trip through the Tiptap Markdown parser, open as source (roundTripsAsDocument, document-editor-markdown.ts:81-90; MATH_SPAN at line 16; ArtifactDocumentEditor.tsx:56 uses it to choose source mode).

**Present but disconnected or switched off**

- Underline switched off (document-editor-markdown.ts:11). The brief marks S27.06 done including underline, which the code contradicts.

**Not available**

- Alignment, spacing, indentation controls: none found.
- Callout blocks: none found.
- Any formatting controls on mobile, Chrome, CLI and VS Code for documents.

## 4. Required behaviour

**Established requirements**

- The editor offers controls to set heading levels on the current block. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S27.04)
- Paragraph formatting (alignment, spacing, indentation). (source: S27.05 (same brief))
- Bold, italic, underline and links. (source: S27.06 (same brief))
- Bulleted, numbered and checklist items. (source: S27.07 (same brief))
- Callout blocks (note, warning, tip). (source: S27.10 (same brief))
- Code blocks and math equations rendered. (source: S27.11 (same brief))
- Links accept only http, https and mailto. (source: DocumentFormattingToolbar.tsx:32-42)

**Acceptance criteria**

1. Choosing Heading 2 turns the current line into an h2.
2. Bold and Italic toggle and show pressed.
3. A link 'javascript:alert(1)' is not applied.
4. A link 'example.com' becomes https://example.com/.
5. Checklist makes a task list item.
6. No Underline button exists (current).
7. A '$x$' document opens as source, and the reader view shows it as math.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The brief says heading controls are missing on web; the code has them.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add underline, alignment and callouts if the product needs them.
- [proposed] Add keyboard shortcut for strikethrough.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | DocumentFormattingToolbar | `apps/web/features/chat/components/artifacts/DocumentFormattingToolbar.tsx` | All toolbar controls and link form. |
| service | documentEditorExtensions | `apps/web/features/chat/components/artifacts/document-editor-markdown.ts` | Underline off; link settings; tables; task lists. |
| config | MARKDOWN_SHORTCUTS | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Source-mode wrapping shortcuts (line 387; wired for documents at lines 3295 and 3339). |
| component | ArtifactCodeEditor | `apps/web/features/chat/components/artifacts/ArtifactCodeEditor.tsx` | Applies the wrap shortcuts in source mode. |
| component | MarkdownContent | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Reader rendering of code, lists, tasks (lines 344, 405, 470). |
| service | remarkPlugins | `packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts` | Math and Markdown plugins (lines 27-28); web reader math through remark-math (line 73). |
| service | taskList helpers | `packages/ui/unified-chat/src/components/markdown/taskList.ts` | Find and toggle checklist items. |
| service | markdownItMath | `packages/ui/unified-chat/src/components/markdown/markdownItMath.ts` | Math parsing for the Chrome side panel and the VS Code webview (apps/extension/src/features/side-panel/markdown.ts, apps/extension-vscode/src/webview/render.ts). |
| component | SlideTextEditor | `apps/web/features/chat/components/artifacts/presentation/SlideTextEditor.tsx` | Uses the same Tiptap editor and roundTripsAsDocument gate (lines 12, 83). |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Handles checklist toggles in the reader (line 1154). |
| test | toolbar test | `apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.toolbar.test.tsx` | Tests heading and bold. |
| test | markdownDocument test | `packages/ui/unified-chat/src/components/markdown/markdownDocument.test.ts` | Markdown document logic (contents not opened). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A toolbar click runs a Tiptap command on the editor. | device | DocumentFormattingToolbar.tsx:105-115,148-215 |
| The editor serializes to Markdown and passes it to the draft. | device | ArtifactDocumentEditor.tsx:40 |
| Link text is checked by safeHref before the mark is set. | device | DocumentFormattingToolbar.tsx:32-42,109-115 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Formatted text as Markdown | Draft held in localStorage (key agi.artifact-draft:<id>) when storage is available, and removed after it is committed to the in-memory artifacts store (useArtifactsStore upsert). If storage is blocked, writeStoredDraft returns false and the draft is not persisted (ArtifactPreview.tsx:395,406-427,1130-1139) | After Save, via artifact sync (see F027-06) | Old versions stay in version history. |

**Models and providers.** No model is involved in formatting.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | Editing is offered only in the panel variant, for a stored artifact, on the latest version, and never for PDF, DOCX or image artifacts (canEditSource, ArtifactPreview.tsx:1041-1042). |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | All formatting runs on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Invalid link | Silently not applied; the form closes. This includes an address with host:port such as example.com:8080 or localhost:3000, which safeHref reads as a scheme. | DocumentFormattingToolbar.tsx:32-42,109-115 |
| Escape in link box | Closes the box and returns focus. | DocumentFormattingToolbar.tsx:247-251 |
| Insert table while inside a table | Button disabled. | DocumentFormattingToolbar.tsx:215 |
| Toolbar overflow on narrow screens | Scrolls sideways. | DocumentFormattingToolbar.tsx:129 |
| Buttons keep editor focus | mousedown default prevented. | DocumentFormattingToolbar.tsx:62 |
| Invalid link feedback | not handled in the code (no error message is shown for a rejected address). | DocumentFormattingToolbar.tsx:109-115 closes the form without a message |
| K link shortcut in source mode | Inserts an unchecked https:// placeholder, [text](https://), and bypasses safeHref. | ArtifactPreview.tsx:3295,3339 |
| Slide text editing | Slide text uses the same Tiptap editor and roundTripsAsDocument gate, so it gets the same formatting rules. | apps/web/features/chat/components/artifacts/presentation/SlideTextEditor.tsx:12,83 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.toolbar.test.tsx`: Heading level set from the toolbar; bold toggles and reports pressed.
- `packages/ui/unified-chat/src/components/markdown/MarkdownContent.test.tsx`: Markdown rendering (file exists; contents not opened).

**Test scenarios**

- **Heading**
  1. Open editor
  2. Choose Heading 3 in Text style
  - Expected: Line becomes an h3; Markdown starts with '###'.
- **Unsafe link**
  1. Click Link
  2. Enter 'javascript:alert(1)'
  3. Apply
  - Expected: No link is created.
- **Checklist**
  1. Click Checklist
  2. Type an item
  3. Save
  4. View in reader
  - Expected: Item renders with a clickable box.
- **Underline**
  1. Select text
  2. Press Cmd or Ctrl plus U
  - Expected: No underline (underline off).
- **Math**
  1. Open a document with '$a$'
  - Expected: Opens as source; reader view shows math.

**Where to look when it fails**

- Toolbar testid document-formatting-toolbar and document-text-style.
- Console errors from Tiptap on bad content.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/027-document-and-writing-editor.md](../../70-qa/test-plans/web/027-document-and-writing-editor.md)
- Desktop: [70-qa/test-plans/desktop/027-document-and-writing-editor.md](../../70-qa/test-plans/desktop/027-document-and-writing-editor.md)

## 10. Gaps and dependencies

- **No underline, alignment, spacing, indentation.** Affects: Web and Desktop. Evidence: document-editor-markdown.ts:11; no controls in toolbar. Work needed: Decide scope; Markdown cannot store most of these, so a storage format decision is needed.
- **No callouts.** Affects: All apps. Evidence: No callout code found; brief S27.10. Work needed: Define a Markdown form and add render and insert.
- **No formatting on mobile.** Affects: Mobile. Evidence: ArtifactFullScreen.tsx:2016 plain TextInput. Work needed: Decide scope.
- **Invalid link gives no message.** Affects: Web. Evidence: DocumentFormattingToolbar.tsx:109-115. Work needed: Show an error.
- Not built on: Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- F027-03
- F027-05
- file:apps/web/features/chat/components/artifacts/DocumentFormattingToolbar.tsx
- SYS-shared-ui-and-design

## Unknown

- Whether Chrome has any document formatting (brief unverified).
- Exact keyboard shortcuts for lists and headings supplied by Tiptap defaults; not read.

## Second reader's check

A second reader checked 13 statements of this page against the code: 5 correct, 6 wrong or partly wrong, 2 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3):** "Link accepts only http, https and mailto; a bare address gets https (lines 33-43)" The code shows: safeHref (DocumentFormattingToolbar.tsx:32-42) only prepends https:// when the text does not start with a scheme-like token (/^[a-z][a-z0-9+.-]*:/). So 'example.com:8080' or 'localhost:3000' is read as a scheme, fails the protocol check and is silently dropped. Plain 'example.com' does become https://example.com/. Lines are off by one. (apps/web/features/chat/components/artifacts/DocumentFormattingToolbar.tsx:32-42). **Corrected:** A bare address without a scheme-like prefix gets https. An address with host:port is treated as a scheme and rejected without a message.
- **Wrong (section 3):** "Reader view renders task lists with clickable boxes and math through markdown-it plugins (taskList.ts:34-40; markdownItMath.ts exists)" The code shows: The reader (MarkdownContent) uses remark-math, not markdown-it. taskList.ts:34-40 is taskIndexAtOffset, a helper that finds a task index, and it does not render boxes. markdownItMath.ts is imported by the Chrome side panel and the VS Code webview, not by the web reader. (packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:2,73; packages/ui/unified-chat/src/components/markdown/taskList.ts:34-37; apps/extension/src/features/side-panel/markdown.ts; apps/extension-vscode/src/webview/render.ts). **Corrected:** The web reader renders math through remark-math (remarkPlugins.ts:73). taskList.ts supplies the helpers that find and toggle checklist markers. markdownItMath.ts serves the Chrome side panel and the VS Code webview.
- **Partly wrong (section 3):** "Math is shown but cannot be edited visually; such documents open as source (document-editor-markdown.ts:19)" The code shows: The behaviour is right but the citation is not. MATH_SPAN is defined at line 16 and used in roundTripsAsDocument at line 82. ArtifactDocumentEditor.tsx:56 calls it to choose source mode. The same check also sends any document that fails the Markdown round trip to source, not only math. SlideTextEditor.tsx:83 uses it too. (apps/web/features/chat/components/artifacts/document-editor-markdown.ts:16,81-90; apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx:56). **Corrected:** Documents with math, or any content that does not round-trip through the Tiptap Markdown parser, open as source (roundTripsAsDocument, document-editor-markdown.ts:81-90).
- **Partly wrong (section 6):** "Draft in localStorage until saved, then the artifacts store (ArtifactPreview.tsx:395,1130-1139)" The code shows: Line 395 is the ARTIFACT_DRAFT_STORAGE_PREFIX constant. The localStorage helpers are at lines 406-427 and wrap every access in try/catch. When storage is blocked, writeStoredDraft returns false and the draft is not kept. Lines 1130-1139 do upsert to useArtifactsStore. The page does not say sync happens elsewhere. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:395,406-427,1130-1139). **Corrected:** The draft is held in localStorage (key agi.artifact-draft:<id>) when storage is available and is removed after it is committed to the in-memory artifacts store. If storage is blocked, the draft is not persisted.
- **Partly wrong (section 7):** "Permissions: Editing only on the latest stored version." The code shows: canEditSource requires variant==='panel', a stored artifact, the latest version, and not PDF, DOCX or image. The page omits the panel-only condition and the file-type exclusions. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1041-1042). **Corrected:** Editing is offered only in the panel variant, for a stored artifact, on the latest version, and never for PDF, DOCX or image artifacts.
- **Partly wrong (section 8):** "Escape in link box closes the box (226-232); table button disabled in table (219); toolbar scrolls sideways (123); mousedown prevented (57)" The code shows: The behaviours exist, but all four line cites are wrong. Escape is at 247-251. The disabled table button is at 215. overflow-x-auto is at 129. onMouseDown preventDefault is at 62. (apps/web/features/chat/components/artifacts/DocumentFormattingToolbar.tsx:62,129,215,247-251). **Corrected:** Escape: :247-251. Table disabled: :215. Overflow scroll: :129. Mousedown: :62.

**Facts the page missed**

- The same Tiptap editor and roundTripsAsDocument gate are also used by the slide text editor, so slide text gets the same formatting rules (apps/web/features/chat/components/artifacts/presentation/SlideTextEditor.tsx:12,83).
- Source-mode Cmd/Ctrl+B, I and K wrap with ** , _ and [text](https://), and are wired for documents at ArtifactPreview.tsx:3295 and 3339. The K link shortcut inserts an unchecked https:// placeholder and bypasses safeHref.
- The Chrome side panel and the VS Code webview both render math through markdownItMath (apps/extension/src/features/side-panel/markdown.ts, apps/extension-vscode/src/webview/render.ts). The page says math shows in the reader view only and marks VS Code as n/a.
