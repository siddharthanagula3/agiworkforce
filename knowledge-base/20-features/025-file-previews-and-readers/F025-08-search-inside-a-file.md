---
id: "F025-08"
type: "feature"
title: "Search inside a file"
aliases: ["Search within file", "Highlight search matches", "Find in file", "S25.18", "S25.19"]
area: "25 File previews and readers"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S25.18", "S25.19"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "F025-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F025-08 Search inside a file

Intended: type a word into a box in an open file and step through highlighted matches. Today it does not exist on any app. The Library's search box only filters files by name, and the viewers have no search field or highlighting.

Area: [25. File previews and readers](README.md). Requirement items: [S25.18](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2518), [S25.19](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2519).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a person search the text inside an open file (text, table, document) and see every match highlighted with next and previous controls.

**Why it exists.** Long files are hard to scan by eye. ChatGPT and Claude users expect to find a phrase in a document they opened (doc: docs/product/competitive-guidance.md is the stated reference for such calls; the specific competitor behaviour was not read for this page).

**Who uses it.** People reading long contracts, reports, spreadsheets and code in the viewer.

**Problems it solves**

- Finding a figure or clause without scrolling.
- Checking that a cited phrase exists in the source.

**Use cases**

- Find 'termination' in an uploaded contract.
- Find a customer name in a CSV table.
- Find a function name in a source file artifact.

## 2. User experience

**Where to find it**

- Not present on any app. The Library page has a box labelled 'Search files and projects' (aria-label 'Search the library by name') but it searches file names in the list, not inside a file (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1000-1004).
- The PDF reader is an iframe, so any search comes from the browser's own PDF viewer [inferred; LibraryView.tsx:1171-1173, 1290-1296].

**Before you start**

- None, because there is no feature.

**Screens and controls**

- No in-file search field, match counter or next/previous buttons were found in FileTextPreview.tsx, the shared viewer, FilePreviewModal.tsx or the mobile viewers (grep for search, find, highlight returned nothing in FilePreviewModal.tsx and the mobile artifact-viewers components).

**Journey**

1. Intended: open a file, type a word, press Enter to jump between matches. Today: the person can only use the browser's find on rendered web text [inferred, not verified] or read by eye.

**What the person sees and gets**

- None today.

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Library name search filters the list by file name through the list query (apps/cli/src/cloud/library.rs:76-91 passes q; LibraryView.tsx:1000-1004). This is a different feature.

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- nothing found

**Not available**

- In-file search and match highlighting on web, Desktop, mobile, CLI, VS Code (as a feature of the artifact viewer) and Chrome. The CLI 'agi library show' prints text that a terminal pager or grep can search, but the product has no search command for it (apps/cli/src/lib.rs:1246-1260).

## 4. Required behaviour

**Established requirements**

- Users can search within an open file (S25.18). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S25.18)
- Search matches are highlighted in the file (S25.19). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S25.19)

**Acceptance criteria**

1. Opening a text file shows a search field.
2. Typing a word highlights every match in the text and in table cells and shows a count.
3. Next and previous move between matches and scroll to them.
4. A word with no match shows a clear 'no matches' message.
5. A file that failed to load or has no preview shows no search field or a disabled one.
6. The control is reachable by keyboard and has an accessible name.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Search should run on the extracted text the preview already holds, with no server call [inferred].
- A cut preview should say matches cover only the shown part [inferred from F025-10].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Put the search field in the viewer header of the shared viewer so web, Desktop and the Tauri build get it together.
- [proposed] Use the browser's built-in find for PDF iframes and document that.
- [proposed] Add a find box to the mobile text and table viewers.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | FileTextPreview | `packages/ui/unified-chat/src/components/library/FileTextPreview.tsx` | Where text and table render; no search code (lines 44-97). |
| component | FileViewerOverlay | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Viewer shell; header has zoom and download only (lines 1157-1300). |
| component | FilePreviewModal | `apps/web/features/projects/components/FilePreviewModal.tsx` | Project modal; no search code. |
| component | TextFileView | `apps/mobile/src/features/chat/components/artifact-viewers/TextFileView.tsx` | Mobile text viewer; no search code found. |
| component | TabularGridView | `apps/mobile/src/features/chat/components/artifact-viewers/TabularGridView.tsx` | Mobile table; sorting only, no search found. |
| component | PdfFileView | `apps/mobile/src/features/chat/components/artifact-viewers/PdfFileView.tsx` | Mobile PDF; shows 'Page N of M' only (line 197). |
| service | parseTabular | `packages/ui/unified-chat/src/lib/tabular.ts` | Turns table text into rows; a future search would read these (row cap 500, line 78). |
| schema | FileTextPreviewSchema | `packages/contracts/cloud-contracts/src/library.ts` | The text a search would run on (lines 133-139). |
| endpoint | GET /api/files/[id]/text | `apps/web/app/api/files/[id]/text/route.ts` | Supplies extracted text. |
| component | Library name search input | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | List filter by name, not in-file (lines 1000-1004). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No in-file search flow exists. The only related flow is the Library name search, which sends q to the list endpoint. | our servers | apps/cli/src/cloud/library.rs:76-91; LibraryView.tsx:1000-1004 |
| [proposed] A future search would run on the device over the already loaded preview text. | device | proposal; text already in the page state, FileTextPreview.tsx:44-52 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No search data is created today | none | No | not applicable |

**Models and providers.** None; plain text search would not need a model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code (no feature). |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | No feature exists in any mode. [inferred] A device-side search would work wherever the file text is already on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| no matches / loading / error / unsupported file | not handled in the code; there is no search. | searched FileTextPreview.tsx, FilePreviewModal.tsx, mobile artifact-viewers |
| large cut preview | The viewer shows only the start of the file; a search would not see the rest (see F025-10). | FileTextPreview.tsx:50-52, 91-95; apps/web/lib/server/file-text-preview.ts:66-70 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **Absence check**
  1. Open a text file in the web Library viewer.
  2. Look for a search field in the header.
  - Expected: None is shown (current state).
- **Future: highlight**
  1. Open a CSV, search a value present in two cells.
  - Expected: Both cells highlighted, count 2, next moves between them.
- **Future: no match**
  1. Search a word not in the file.
  - Expected: 'No matches' message, no highlight.

**Where to look when it fails**

- Nothing to inspect today; the brief records all six apps missing.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No in-file search or highlight** Affects: All six apps. Evidence: area brief S25.18 and S25.19 all missing; no code found. Work needed: Design the control in the shared viewer, add match highlighting for text and table, add mobile and VS Code equivalents or state they are out of scope.
- **Name search could be mistaken for in-file search** Affects: Web, Desktop. Evidence: LibraryView.tsx:1000-1004. Work needed: Keep the label clear.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- F025-10

## Unknown

- Whether browser find works across the viewer's scroll container in Electron.
- Whether the PDF iframe (web) or the mobile PDF view exposes the system's find.
- Competitor behaviour for in-file search was not refreshed for this page.
