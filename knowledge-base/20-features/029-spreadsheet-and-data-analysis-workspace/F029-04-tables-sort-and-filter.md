---
id: "F029-04"
type: "feature"
title: "Tables, sort and filter"
aliases: ["Tables", "Sort", "Filter", "Make table", "Banding", "S29.09", "S29.10"]
area: "29 Spreadsheet and data-analysis workspace"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S29.09", "S29.10"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-shared-ui-and-design", "F029-02", "file:packages/ui/unified-chat/src/lib/tabular.ts"]
basis: "code inspection"
second_reader: "8 of 12 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F029-04 Tables, sort and filter

Sorting exists: on web, desktop-hosted web and mobile, clicking a column header sorts the shown rows, ascending, descending, then back. Filtering and Excel-style tables with header, banding and a name are not built. The workbook writer writes no table or filter parts.

Area: [29. Spreadsheet and data-analysis workspace](README.md). Requirement items: [S29.09](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2909), [S29.10](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2910).

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

**What it does.** Lets a person order the rows of a table or workbook sheet in the chat preview by one column. Filtering and table objects are not available.

**Why it exists.** People scan results by value, for example largest first. The brief also lists tables and filters (S29.09, S29.10) (doc: knowledge-base/data/area-briefs/029-spreadsheet-and-data-analysis-workspace.md).

**Who uses it.** Anyone reading a table or workbook in chat.

**Problems it solves**

- Find the biggest or smallest values quickly.
- Numbers sort by value, not as text (tabular.ts:88-105).
- Blank cells always go last (tabular.ts:95-97).

**Use cases**

- Sort a sales table by revenue descending.
- Click the same header again to return to the original order.
- On the phone, tap a header to sort a sheet.

## 2. User experience

**Where to find it**

- Web and desktop-hosted web: column header buttons titled 'Sort by <column>' in the spreadsheet preview (SpreadsheetArtifact.tsx:251-256).
- Mobile: header buttons with sort arrows in the grid (TabularGridView.tsx:323-330).
- Filter and Make table: nowhere.
- CLI, VS Code, Chrome: not found.

**Before you start**

- A table, CSV or readable workbook open in the preview.

**Screens and controls**

- Header buttons with an up or down arrow showing direction.
- Web header cells carry aria-sort ascending, descending or none (SpreadsheetArtifact.tsx:242-244).

**Journey**

1. Open a table.
2. Click a header: sorted ascending.
3. Click again: descending.
4. Click a third time: original order (tabular.ts:82-86).
5. Switching sheets clears the sort (SpreadsheetArtifact.tsx:84-88).

**What the person sees and gets**

- Arrow icon on the sorted column.
- Rows re-ordered; the file itself is not changed.

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Three-step sort cycle (tabular.ts:82-86).
- Numeric columns sort by value, text by locale-aware natural order, blanks last (tabular.ts:88-105).
- Web header shows sort state to screen readers (SpreadsheetArtifact.tsx:242).
- Mobile sort test covers numbers by value, then descending, then original order (TabularGridView.test.tsx:133).
- Existing autoFilter in an edited workbook is preserved by the managed edit path, and a test covers it [apps/web/lib/services/managed-office-preservation-markup.test.ts:1658,1800].

**Incomplete**

- Sort runs over all parsed rows, then only the first 500 sorted rows are shown, with a truncation notice. This is not a sort defect; rows past 500 are hidden but ordered. The same applies on mobile (SpreadsheetArtifact.tsx:90-93; TabularGridView.tsx:62-64; tabular.ts:78).

**Present but disconnected or switched off**

- None found.

**Not available**

- Filter by column: no code found.
- Make table with header, banding and a name: managed-workbook-builder.ts writes no table part (lines 172-253).
- Existing tables in an attached workbook are not shown as tables; the reader returns sheets as CSV (workbook-sheets.ts:682). The edit path keeps an existing autoFilter (managed-office-preservation-markup.test.ts:1658,1800); table parts are unconfirmed.
- CLI, VS Code, Chrome: no sort or table found.

## 4. Required behaviour

**Established requirements**

- A range can be turned into a structured table (header, banding, table name) in the workbook. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S29.09)
- The user can sort and filter rows in a sheet by column. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S29.10)
- S29.10 is listed among features the leaders do not offer and that are not built. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:119-123)

**Acceptance criteria**

1. Clicking a header sorts ascending; a second click sorts descending; a third restores the original order.
2. A column of 2, 10, 1 sorts as 1, 2, 10, not 1, 10, 2.
3. Empty cells stay at the bottom in both directions.
4. Switching sheet resets the sort.
5. The header button is identifiable by column: on web the column is the visible button text with a 'Sort by <column>' title tooltip; on mobile an explicit accessibilityLabel is set (SpreadsheetArtifact.tsx:251-256; TabularGridView.tsx:327-330).
6. No filter control is present [current behaviour].

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's S29.10 'sort' half is met on web and mobile; 'filter' is not [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update the brief so S29.10 shows sort done and filter not built.
- [proposed] Write an Excel table or autofilter part only if the owner reverses the decision.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | sortTabularRows and nextTabularSort | `packages/ui/unified-chat/src/lib/tabular.ts` | Sort rules and cycle (lines 80-106). |
| component | SpreadsheetArtifact | `packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx` | Web header sort buttons (lines 95-97,236-264). |
| component | TabularGridView | `apps/mobile/src/features/chat/components/artifact-viewers/TabularGridView.tsx` | Mobile sort buttons (lines 69-72,323-330). |
| service | parseTabular and numeric detection | `packages/ui/unified-chat/src/lib/tabular.ts` | Finds numeric columns (lines 27-34,196). |
| service | readWorkbookSheets | `packages/ui/unified-chat/src/lib/workbook-sheets.ts` | Gives each sheet as CSV for the grid. |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Selects the spreadsheet component (line 1810). |
| service | managed-workbook-builder | `apps/web/lib/services/managed-workbook-builder.ts` | Writes no table or filter parts (lines 172-253). |
| service | tableCsv | `apps/mobile/src/features/chat/utils/tableCsv.ts` | Table-to-CSV on mobile. |
| test | SpreadsheetArtifact sheets test | `packages/ui/unified-chat/src/components/artifact-components/__tests__/SpreadsheetArtifact.sheets.test.tsx` | Sort reset on sheet switch (line 37). |
| test | TabularGridView test | `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/TabularGridView.test.tsx` | Sort cycle (line 133). |
| test | managed-office-preservation-markup test | `apps/web/lib/services/managed-office-preservation-markup.test.ts` | Shows an existing autoFilter is preserved by the managed edit path (lines 1658,1800). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The sheet is parsed into rows and numeric column flags. | device | tabular.ts:196; SpreadsheetArtifact.tsx:78-80 |
| A header click updates the sort state. | device | SpreadsheetArtifact.tsx:95-97 |
| Rows are sorted in memory and the first 500 drawn. | device | SpreadsheetArtifact.tsx:90-93; tabular.ts:88-105 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Sort state | Component state | No | Lost on close or sheet switch |

**Models and providers.** No model is involved.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None found in the code for sorting. |
| Permissions | None found. |
| Subscription | None found. |
| Limits and metering | 500 rows shown (tabular.ts:78). |
| Feature flags | None found. |
| Model compatibility | Not relevant. |
| Provider restrictions | None. |
| Local mode | Sorting runs on the device with no server, so it works in Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty column cells | Placed last. | tabular.ts:95-97 |
| Mixed numbers and text | If a number fails to parse, falls back to text compare. | tabular.ts:99-103 |
| Header-only table | Mobile shows the header and 'No rows'. | TabularGridView.test.tsx:67 |
| Sheet switch | Sort cleared. | SpreadsheetArtifact.tsx:84-88 |
| Loading, error, offline, retry | Not handled in the code for sorting itself. | not handled in the code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/TabularGridView.test.tsx`: Sort by a tapped header: numbers by value, descending, back to original (line 133).
- `packages/ui/unified-chat/src/components/artifact-components/__tests__/SpreadsheetArtifact.sheets.test.tsx`: Selection and sort dropped on sheet switch (line 37).
- `packages/ui/unified-chat/src/components/__tests__/ArtifactComponents.test.tsx`: Shared components; sort cases not confirmed.
- `apps/web/lib/services/managed-office-preservation-markup.test.ts`: Existing autoFilter preserved by the managed edit path (lines 1658,1800).

**Test scenarios**

- **Numeric sort**
  1. Open a table with values 2, 10, 1.
  2. Click the header once.
  - Expected: 1, 2, 10.
- **Cycle**
  1. Click the same header three times.
  - Expected: Ascending, descending, original order.
- **Blanks**
  1. Sort a column with empty cells both ways.
  - Expected: Blanks last each time.
- **No filter**
  1. Look for a filter control on a header.
  - Expected: None present (current).
- **Phone**
  1. Tap a header on the phone grid.
  - Expected: Rows sort and an arrow appears.

**Where to look when it fails**

- Web test id spreadsheet-table.
- No logs involved.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/web/029-spreadsheet-and-data-analysis-workspace.md)
- Desktop: [70-qa/test-plans/desktop/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/desktop/029-spreadsheet-and-data-analysis-workspace.md)
- Mobile: [70-qa/test-plans/mobile/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/mobile/029-spreadsheet-and-data-analysis-workspace.md)

## 10. Gaps and dependencies

- **No filter and no table object.** Affects: All apps. Evidence: No code; managed-workbook-builder.ts:172-253. Work needed: Follow the founder decision; otherwise build both.
- **Brief marks sort missing only on CLI, VS Code, Chrome but marks S29.09 missing on all six; no mention that sort exists on web and mobile.** Affects: Readers of the brief. Evidence: tabular.ts:80-106. Work needed: Clarify brief.
- **Sort is not saved or written to the file.** Affects: All apps. Evidence: Component state only. Work needed: None unless required.
- **The page's frontmatter (implementation: missing, verification n/a, available_on empty) and Status table say sorting is not built, but it ships on web, desktop-hosted web and mobile through the shared SpreadsheetArtifact and TabularGridView. Correct status: sort built on web, desktop-hosted web and mobile (filter and table object not built); CLI, VS Code and Chrome: not built. Metadata consumers will read the wrong status.** Affects: Metadata consumers of the page. Evidence: tabular.ts:80-106; ArtifactPreview.tsx:1946. Work needed: Fix the frontmatter and Status table.
- **The desktop app (apps/desktop/src) and the Chrome extension side panel were not checked for sort; artifactPanel.ts:20 imports spreadsheetSafeExport from tabular, with no sort found there.** Affects: Desktop and Chrome surfaces. Evidence: artifactPanel.ts:20. Work needed: Check both surfaces.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-shared-ui-and-design
- F029-02
- file:packages/ui/unified-chat/src/lib/tabular.ts

## Unknown

- Whether web has a sort test beyond the sheets test (full SpreadsheetArtifact tests not all read).
- Whether the Chrome side panel renders any sortable table.
- Whether editing an attached workbook with tables keeps the table part (the edit path keeps an existing autoFilter per managed-office-preservation-markup.test.ts:1658,1800; table parts unconfirmed).

## Second reader's check

A second reader checked 12 statements of this page against the code: 8 correct, 4 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Wrong (section Header, Status):** "implementation: missing / 'not built' on web, desktop, mobile; Status table 'In the code: not built'" The code shows: Sorting is built on web and mobile (shared SpreadsheetArtifact and mobile TabularGridView). The page's own prose and section 3 say so, so the frontmatter and Status table contradict the body. (packages/ui/unified-chat/src/lib/tabular.ts:80-106; SpreadsheetArtifact.tsx:95-97; TabularGridView.tsx:69-72). **Corrected:** Web, desktop-hosted web and mobile: sort built (filter and table object not built). CLI, VS Code and Chrome: not built.
- **Partly wrong (section 3 Incomplete):** "Sort applies only to the displayed first 500 rows after parsing; sorting is done on all parsed rows and then cut to 500" The code shows: The sentence contradicts itself. The code sorts all rows, then slices to SPREADSHEET_ROW_CAP, so the sort is global. Rows past 500 are hidden but ordered. The same applies on mobile. (SpreadsheetArtifact.tsx:90-93; TabularGridView.tsx:62-64; tabular.ts:78). **Corrected:** Sort runs over all parsed rows, then only the first 500 sorted rows are shown, with a truncation notice. This is not a sort defect.
- **Partly wrong (section 3):** "Whether an edit keeps tables is covered by the package-preserving edit path [inferred from managed-office-preservation.ts:1364]" The code shows: Line 1364 is just the start of editManagedWorkbook. A test in the repo already shows an autoFilter element being preserved, so this can be stated as tested rather than unknown. (apps/web/lib/services/managed-office-preservation.ts:1364; managed-office-preservation-markup.test.ts:1658,1800). **Corrected:** The edit path keeps an existing autoFilter, per managed-office-preservation-markup.test.ts:1658,1800. Cite that, not line 1364. Table parts are unconfirmed.
- **Partly wrong (section 4/9):** "Acceptance 5: the header button has an accessible name that includes the column" The code shows: On web the name comes from the visible column text and a title. On mobile an explicit accessibilityLabel is set. The 'Sort by' wording is a title only. (SpreadsheetArtifact.tsx:251-256; TabularGridView.tsx:327-330). **Corrected:** Say web exposes the column as the visible button text with a title tooltip; mobile sets an accessibilityLabel.

**Facts the page missed**

- The frontmatter (implementation: missing, verification n/a, available_on empty) and the Status table say sorting is not built, but it ships on web and mobile through the shared SpreadsheetArtifact and TabularGridView (tabular.ts:80-106; ArtifactPreview.tsx:1946). Metadata consumers will read the wrong status.
- The page says sort is shown on 'desktop-hosted web' but never checks the desktop app (apps/desktop/src) or the Chrome extension side panel. artifactPanel.ts:20 imports spreadsheetSafeExport from tabular, with no sort found there.
- Existing autoFilter in an edited workbook is preserved by the managed edit path and has a test (apps/web/lib/services/managed-office-preservation-markup.test.ts:1658,1800). The page lists this as unknown and says 'not tested by me'.
