---
id: "F029-02"
type: "feature"
title: "Grid view and cell editing"
aliases: ["Grid view", "Spreadsheet grid", "Cell editing", "Formula bar", "Freeze panes", "Column resizing", "Tabular grid", "S29.04", "S29.05", "S29.06", "S29.11", "S29.12"]
area: "29 Spreadsheet and data-analysis workspace"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S29.04", "S29.05", "S29.06", "S29.11", "S29.12"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-shared-ui-and-design", "SYS-files-artifacts-and-storage", "F029-01", "F029-04", "file:packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx", "file:packages/ui/unified-chat/src/lib/tabular.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F029-02 Grid view and cell editing

A read-only grid exists. Web and the hosted desktop show a keyboard-navigable table with a sticky header, single-cell select and copy; mobile shows a grid with a sticky header, tap select and copy. Typing into cells, a formula bar, range selection, a freeze command and column resizing do not exist.

Area: [29. Spreadsheet and data-analysis workspace](README.md). Requirement items: [S29.04](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2904), [S29.05](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2905), [S29.06](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2906), [S29.11](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2911), [S29.12](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2912).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows tabular data and workbook sheets as a grid in chat. A person can pick one cell and copy it, and sort by a column. Editing, formula bar, freeze choice and resize are not built.

**Why it exists.** People want to see and check the numbers an assistant produced without opening Excel. The brief also asks for editing items S29.04-S29.06, S29.11 and S29.12 (doc: knowledge-base/data/area-briefs/029-spreadsheet-and-data-analysis-workspace.md).

**Who uses it.** Anyone who gets a table, CSV or workbook in a chat.

**Problems it solves**

- Numbers can be checked in place, with the header staying in view (SpreadsheetArtifact.tsx:227; TabularGridView.tsx:311).
- Large tables do not freeze the page: only 500 rows are drawn (tabular.ts:78).
- Keyboard-only and screen-reader users can move through cells (SpreadsheetArtifact.tsx:134-155; keyboard test).

**Use cases**

- Open a CSV result and copy one cell value.
- Move through a table with arrow keys and copy with Ctrl or Command C.
- On the phone, tap a cell and long-press to copy it.

## 2. User experience

**Where to find it**

- Web and desktop (hosted web): the Preview tab of a spreadsheet, table or CSV artifact (ArtifactPreview.tsx:1810,1947-1950).
- Mobile: the file viewer for a workbook or a table card (TabularGridView.tsx; ArtifactViewer.tsx).
- CLI, VS Code: not found.
- Chrome side panel: only a CSV export of a table is found (artifactPanel.ts:384); no grid found.

**Before you start**

- A spreadsheet-type artifact, table, CSV, or a readable .xlsx.
- No account rule for viewing found beyond access to the artifact.

**Screens and controls**

- Web grid: column header buttons with the title 'Sort by <column>' (SpreadsheetArtifact.tsx:251-256); row number column; cell click selects or deselects (line 297); a live status text 'Cell copied' or 'Ctrl/⌘+C to copy cell' (line 210).
- Keys: arrow keys move, a modifier jumps to the edge, Escape clears, Ctrl or Command C copies (SpreadsheetArtifact.tsx:134-155).
- Mobile: header buttons with the label '<column>: <value>' hint 'Selects the cell. Touch and hold to copy it.'; controls 'Copy cell', 'Copy as Markdown', 'Share as CSV' (TabularGridView.tsx:175-178,256,277,291).
- The header row is sticky (SpreadsheetArtifact.tsx:227; TabularGridView.tsx:311). There is no user control to freeze other rows or columns.

**Journey**

1. Open a table or workbook artifact.
2. The grid draws up to 500 rows (tabular.ts:78).
3. Click or tap a header to sort: ascending, then descending, then the original order (tabular.ts:82-86).
4. Click a cell to select it; move with arrow keys on web.
5. Copy the cell. There is no way to change its content.

**What the person sees and gets**

- 'Cell copied' live message on web (SpreadsheetArtifact.tsx:209-210).
- Row and column counts and a note when rows were cut off on mobile (TabularGridView.tsx:249).
- Empty states 'This sheet is empty.' and 'Nothing to show yet.' (TabularGridView.tsx:225).

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web grid with grid, row, columnheader and gridcell roles and aria-sort (SpreadsheetArtifact.tsx:219-243,296-298).
- Single-cell selection and keyboard movement on web (SpreadsheetArtifact.tsx:112-155).
- Sticky header on web and mobile (SpreadsheetArtifact.tsx:227; TabularGridView.tsx:311).
- Mobile cell select, long-press copy, copy as Markdown, share as CSV (TabularGridView.test.tsx:81-116).
- Spreadsheet-safe CSV export that neutralises formula text (tabular.ts:380,476).

**Incomplete**

- Selection is one cell only; no range or multi-select (SpreadsheetArtifact.tsx:81 holds one {r,c}).
- The sticky header is fixed, not a user choice.

**Present but disconnected or switched off**

- Tauri workbook writer can freeze panes (create_excel.rs:138-142) and set column widths from header length (lines 144-150) in the file it writes, but create_simple always uses freeze (1,0) and the person cannot choose (lines 161-191). That affects files, not an in-app grid.

**Not available**

- Cell editing, formula bar, resize by drag, freeze menu: no code found on any app. Founder decision records the grid editor as not built (doc: docs/decisions/2026-09-27-founder-decisions.md:119-123,303-308).
- Grid in CLI, VS Code and Chrome: none found.

## 4. Required behaviour

**Established requirements**

- The user can select cells and ranges in a grid with mouse and keyboard. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S29.04)
- The user can edit a cell value in place and the change is kept. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S29.05)
- A formula bar shows and edits the selected cell formula. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S29.06)
- The user can freeze rows or columns, and resize rows and columns. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S29.11, S29.12)
- A spreadsheet grid editor is not built because both leaders only download or regenerate tables. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:303-308)

**Acceptance criteria**

1. On web, arrow keys move the selected cell and stop at the edges.
2. Escape clears the selection.
3. Ctrl or Command C copies exactly the selected cell text.
4. Clicking a header cycles ascending, descending, original order.
5. The header stays visible while scrolling a long table.
6. A table over 500 rows shows 500 and says it was cut off [inferred from tabular.ts:78 and SpreadsheetArtifact.tsx:93].
7. On the phone a tapped cell is marked selected for a screen reader.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because the decision marks editing not built, the grid stays read-only for now [inferred].
- Range selection is part of S29.04 and is not met by single-cell selection [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Record in the brief that selection and sticky header exist and mark editing, formula bar, resize and freeze as 'not built by decision'.
- [proposed] Add range selection only if copy of several cells is wanted.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SpreadsheetArtifact | `packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx` | Web and shared grid, selection, keyboard, sort, copy. |
| service | tabular helpers | `packages/ui/unified-chat/src/lib/tabular.ts` | Row cap, sort, CSV parse and spreadsheet-safe export. |
| component | ArtifactPreview spreadsheet branch | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Chooses the grid for spreadsheet, table and csv artifacts (line 1810,1947). |
| component | ArtifactRenderer | `packages/ui/unified-chat/src/components/ArtifactRenderer.tsx` | Shared artifact renderer that includes the grid. |
| component | TabularGridView | `apps/mobile/src/features/chat/components/artifact-viewers/TabularGridView.tsx` | Mobile grid, select, sort, copy, share. |
| component | WorkbookFileView | `apps/mobile/src/features/chat/components/artifact-viewers/WorkbookFileView.tsx` | Mobile workbook reader feeding the grid. |
| component | ArtifactViewer | `apps/mobile/src/features/chat/components/artifact-viewers/ArtifactViewer.tsx` | Mobile viewer router [inferred from name]. |
| service | tableCsv | `apps/mobile/src/features/chat/utils/tableCsv.ts` | Mobile table to CSV helper. |
| service | extension artifactPanel export | `apps/extension/src/features/side-panel/artifactPanel.ts` | Chrome side panel CSV export only (line 384). |
| other | Tauri create_excel freeze and widths | `apps/desktop/src-tauri/src/features/document/create_excel.rs` | Writes freeze panes and column widths into a file, not an in-app grid. |
| test | SpreadsheetArtifact keyboard test | `packages/ui/unified-chat/src/components/artifact-components/__tests__/SpreadsheetArtifact.keyboard.test.tsx` | Grid role, arrow keys, edges, Escape. |
| test | TabularGridView mobile test | `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/TabularGridView.test.tsx` | Mobile select, copy, sort. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The artifact content or the workbook file is fetched and parsed into rows. | device | office-file-preview.ts:233-239; WorkbookFileView.tsx:23-26 |
| The first 500 rows are sorted in memory and drawn. | device | tabular.ts:78-106; SpreadsheetArtifact.tsx:90-93 |
| Selecting or copying uses only the page state and the clipboard. | device | SpreadsheetArtifact.tsx:100-110 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Selection, sort and sheet index | Component state only (SpreadsheetArtifact.tsx:74-81) | No | Discarded when the view closes [inferred] |
| Copied cell text | System clipboard | No | Owned by the device |

**Models and providers.** No model or provider takes part in viewing.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No account rule found for viewing; the artifact itself is reached through the conversation. |
| Permissions | None found in the code. |
| Subscription | None found in the code for the viewer. |
| Limits and metering | 500 displayed rows (tabular.ts:78); workbook reading limits of 50 sheets and a text budget (workbook-sheets.ts:13,188). No metering. |
| Feature flags | None found. |
| Model compatibility | Not relevant. |
| Provider restrictions | None. |
| Local mode | The viewer runs on the device and needs no model, so it works in Local mode; a workbook made by the assistant needs the cloud file tool (F029-01). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty | Mobile says 'This sheet is empty.' or 'Nothing to show yet.' | TabularGridView.tsx:225 |
| Not a table | Web shows a fallback block with the raw content. | SpreadsheetArtifact.tsx:158-176 |
| Over 500 rows | Only 500 shown, a truncation note appears. | SpreadsheetArtifact.tsx:93; TabularGridView.tsx:64 |
| Loading | Mobile spinner while the workbook is read. | WorkbookFileView.tsx:117-126 |
| Error | Unreadable workbook falls back to the document view. | WorkbookFileView.tsx:148 |
| Touch | Coarse-pointer sizing exists on the chart control; grid touch sizing not checked. | unknown |
| Offline, retry, cancel, timeout | Not handled in the code read for the web grid. | not handled in the code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/artifact-components/__tests__/SpreadsheetArtifact.keyboard.test.tsx`: Grid role, first-cell select, arrow movement, edges, jump, Escape, mouse parity (lines 22-84).
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/TabularGridView.test.tsx`: Header, counts, empty states, tap and long-press copy, Markdown copy, CSV share, sort (lines 55-133).
- `packages/ui/unified-chat/src/components/__tests__/ArtifactComponents.test.tsx`: Shared artifact components; spreadsheet cases not read in detail.

**Test scenarios**

- **Keyboard walk**
  1. Open a CSV artifact on web.
  2. Click a cell, press arrows, then Ctrl or Command C.
  3. Paste into a text box.
  - Expected: Selection moves, stops at edges, pasted text equals the cell.
- **Sticky header**
  1. Open a 200-row table and scroll.
  - Expected: Header row stays visible.
- **No editing**
  1. Double-click a cell, type text, press Enter.
  - Expected: Nothing changes (current behaviour); record the result.
- **Phone copy**
  1. Long-press a cell on the phone.
  - Expected: Cell value is copied and a status appears.
- **Row cap**
  1. Open a 1,000-row CSV.
  - Expected: 500 rows drawn and a cut-off note.

**Where to look when it fails**

- Web: look for data-testid spreadsheet-artifact and spreadsheet-table.
- Mobile: test ids tabular-sheet-tabs and workbook-file-failed.
- No server logs are involved.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/web/029-spreadsheet-and-data-analysis-workspace.md)
- Desktop: [70-qa/test-plans/desktop/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/desktop/029-spreadsheet-and-data-analysis-workspace.md)
- Mobile: [70-qa/test-plans/mobile/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/mobile/029-spreadsheet-and-data-analysis-workspace.md)

## 10. Gaps and dependencies

- **No cell editing, formula bar, range selection, freeze command or resize.** Affects: All apps. Evidence: No such code found; SpreadsheetArtifact.tsx:81 selection is one cell. Work needed: Nothing while decision D-2026-09-27-02 stands; otherwise a grid editor is a large build.
- **The brief's listed missing status for CLI, VS Code and Chrome is correct; web, desktop and mobile statuses omit the read-only grid that exists.** Affects: Readers of the brief. Evidence: SpreadsheetArtifact.tsx; TabularGridView.tsx. Work needed: Update brief wording.
- **Rows beyond 500 cannot be seen in app.** Affects: Web, desktop, mobile. Evidence: tabular.ts:78. Work needed: Paging or download hint if wanted.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-shared-ui-and-design
- SYS-files-artifacts-and-storage
- F029-01
- F029-04
- file:packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx
- file:packages/ui/unified-chat/src/lib/tabular.ts

## Unknown

- Whether the Chrome side panel shows a grid anywhere (artifactPanel.ts is 1,104 lines; only the CSV export at line 384 was read).
- Whether the Tauri desktop front end (apps/desktop/src) uses the shared grid: no match found by search.
- Touch target size of grid cells on web.
- Whether a copy control exists on web beyond the keyboard shortcut.
