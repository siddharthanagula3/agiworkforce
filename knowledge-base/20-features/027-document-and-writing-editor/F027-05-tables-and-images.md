---
id: "F027-05"
type: "feature"
title: "Tables and images"
aliases: ["Tables", "Images", "Insert table", "Load image", "S27.08", "S27.09"]
area: "27 Document and writing editor"
available_on: ["web", "desktop", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S27.08", "S27.09"]
depends_on: ["surface:web", "surface:desktop", "F027-03", "F027-04", "file:packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F027-05 Tables and images

On web, the visual editor inserts a 3 by 3 table with a header row and edits its cells. Images written as Markdown show in the reader view, but pictures from other websites load only after the person chooses Load image. There is no Insert image button.

Area: [27. Document and writing editor](README.md). Requirement items: [S27.08](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2708), [S27.09](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2709).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not stated on this page | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Adds editable tables to documents and shows images, holding back outside images until the person agrees.

**Why it exists.** Reports need tables and pictures; blocking outside images stops a document from silently calling other websites.

**Who uses it.** Web users editing and reading documents; readers on any app using the shared Markdown renderer.

**Problems it solves**

- Building a table without typing pipes.
- Not leaking a reader's address to an unknown image host.

**Use cases**

- Add a table of options to a plan.
- Read a report whose images come from another site and load them on demand.

## 2. User experience

**Where to find it**

- Web toolbar button 'Insert table' (DocumentFormattingToolbar.tsx:216-224).
- Web reader view: image notice with a 'Load image' button (packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:121-146).
- Mobile: no table or image editing; mobile reader rendering not read. Desktop: hosted web app (AGENTS.md section 5).

**Before you start**

- Visual editor open for tables; a Markdown image line for images.

**Screens and controls**

- 'Insert table' button; disabled while the cursor is inside a table.
- 'Load image from <host>' button with visible text 'Load image'; 'Download image' link after load.

**Journey**

1. Click Insert table.
2. A 3 by 3 table with a header row appears.
3. Type in cells.
4. For images, type '![alt](url)' in source mode, save, then view in reader.
5. If the host is not trusted, click Load image.

**What the person sees and gets**

- Blocked image shows an icon, alt text and 'Image from <host>'.
- A failed image has a retry path (status 'error', attempt counter in MarkdownImage; details not read).

**Settings**

- TrustedImagesContext decides which hosts load without asking (MarkdownContent.tsx:154).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Table extension and Insert table with 3 rows, 3 columns and a header row (document-editor-markdown.ts:2,11; toolbar line 219-222).
- Reader renders tables with alignment support and horizontal scroll (MarkdownContent.tsx:514-560; MarkdownTable.tsx).
- Outside images are blocked until Load image (MarkdownContent.tsx:121-146).

**Incomplete**

- Table support depends on the Markdown round trip; tables the editor cannot keep exactly open as source. Whether a table with a row wider than its header falls back was not established.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Insert image button or upload in the editor: none found.
- Mobile table or image editing: none found.
- Add or delete row and column controls: no toolbar buttons found (Tiptap table commands may exist through other means; not established).

## 4. Required behaviour

**Established requirements**

- The user can insert and edit tables in a document. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S27.08)
- The user can insert images into a document and see them rendered. (source: S27.09 (same brief))
- Images from outside sites are not loaded until the person chooses Load image. (source: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:121-146)

**Acceptance criteria**

1. Insert table adds a 3 by 3 table with a header row.
2. Insert table is disabled while the cursor is in a table.
3. After Save, the Markdown contains a pipe table.
4. A Markdown image from another host shows 'Load image' and does not request the picture first.
5. Clicking Load image shows the picture.
6. No Insert image control exists in the editor (current state).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] 'Insert images' in the brief is only met as render, not insert.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an Insert image control that stores the file with the document.
- [proposed] Add row and column controls.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | documentEditorExtensions (TableKit) | `apps/web/features/chat/components/artifacts/document-editor-markdown.ts` | Enables tables in the editor. |
| component | DocumentFormattingToolbar | `apps/web/features/chat/components/artifacts/DocumentFormattingToolbar.tsx` | Insert table button. |
| component | MarkdownContent | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Renders images with the Load image gate and tables. |
| component | MarkdownTable | `packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx` | Table wrapper. |
| service | markdownImageSources | `packages/ui/unified-chat/src/components/markdown/markdownImageSources.ts` | Decides image source handling. |
| component | ImageTrust | `packages/ui/unified-chat/src/components/markdown/ImageTrust.tsx` | Trust context for image hosts. |
| service | remarkPlugins | `packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts` | Markdown extensions (line 27). |
| service | managed-office-file-service | `apps/web/lib/services/managed-office-file-service.ts` | Brief cites line 304 for table export to office files; not read. |
| test | MarkdownContent render test | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.render.test.tsx` | Rendering (contents not opened). |
| test | toolbar test | `apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.toolbar.test.tsx` | Toolbar behaviour; no table test known. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Insert table runs a Tiptap command. | device | DocumentFormattingToolbar.tsx:219-222 |
| The editor serializes the table as Markdown into the draft. | device | ArtifactDocumentEditor.tsx:40 |
| In the reader, an image from another host is not requested until Load image is chosen; then the browser fetches it from that host. | outside service | MarkdownContent.tsx:121-146 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Table Markdown and image links | Inside the document text (artifacts store and draft) | With the document (see F027-06) | Image files themselves are not stored by this feature. |

**Models and providers.** No model is involved. Image hosts are outside services chosen by whoever wrote the link.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | Image loading is the reader's choice per host. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Tables work on the device. Loading an outside image makes a network request to that host even in Local mode, only after the person chooses it. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Image blocked | Notice with host and Load image. | MarkdownContent.tsx:121-146 |
| Image load error | Status 'error' exists; copy not read. | MarkdownContent.tsx:152-154 |
| Insert table inside table | Disabled. | DocumentFormattingToolbar.tsx:219 |
| Wide table | Scrolls inside its region. | MarkdownContent.tsx:526-530 |
| Table not exactly round-trippable | Document opens as source. | document-editor-markdown.ts:83-91 |
| Offline image | not established; the image state machine has 'loading', 'loaded' and 'error' but the offline copy was not read. | MarkdownContent.tsx:152 (status state) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/MarkdownContent.test.tsx`: Markdown rendering (contents not opened).
- `packages/ui/unified-chat/src/components/markdown/MarkdownContent.render.test.tsx`: Rendering (contents not opened).

**Test scenarios**

- **Insert table**
  1. Open editor
  2. Click Insert table
  - Expected: 3 by 3 table with header row; button disabled while in it.
- **Table round trip**
  1. Save a table
  2. Reopen in reader
  - Expected: Pipe table renders.
- **Outside image**
  1. Add '![x](https://example.com/a.png)' in source
  2. Save and view
  - Expected: Notice with Load image; no request until clicked.
- **Ragged table**
  1. Paste a table where one row has more cells than the header
  2. Click Edit
  - Expected: Unknown; check whether it opens as source.
- **No image button**
  1. Open the toolbar
  - Expected: No Insert image control.

**Where to look when it fails**

- Network panel for image requests.
- Look for the 'Load image' button text in the reader.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/027-document-and-writing-editor.md](../../70-qa/test-plans/web/027-document-and-writing-editor.md)
- Desktop: [70-qa/test-plans/desktop/027-document-and-writing-editor.md](../../70-qa/test-plans/desktop/027-document-and-writing-editor.md)
- Chrome: [70-qa/test-plans/chrome/027-document-and-writing-editor.md](../../70-qa/test-plans/chrome/027-document-and-writing-editor.md)

## 10. Gaps and dependencies

- **No Insert image control.** Affects: Web and Desktop. Evidence: No image button in DocumentFormattingToolbar.tsx. Work needed: Design upload, storage and Markdown form.
- **No row or column controls for tables.** Affects: Web. Evidence: Toolbar buttons list. Work needed: Add table editing buttons.
- **Mobile has no tables or image editing.** Affects: Mobile. Evidence: Plain text box. Work needed: Decide scope.
- **Ragged table fallback unverified.** Affects: Web. Evidence: Only the signature comparison was read. Work needed: Run a test.
- Not built on: Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- F027-03
- F027-04
- file:packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-shared-ui-and-design

## Unknown

- Whether a table with a row wider than its header opens as source (draft claim not confirmed).
- How mobile renders tables and images in its document reader.
- What the managed-office-file-service does with tables (cited by the brief, not read).
