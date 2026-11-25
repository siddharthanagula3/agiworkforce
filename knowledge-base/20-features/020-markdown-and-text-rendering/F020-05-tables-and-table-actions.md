---
id: "F020-05"
type: "feature"
title: "Tables and table actions"
aliases: ["Tables and table actions", "GFM tables", "Wide-table scrolling", "Copy table", "Download table", "Expand table", "S20.15", "S20.16", "S20.17", "S20.18", "MarkdownTable", "table CSV"]
area: "20 Markdown and text rendering"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "partly seen (1 of 3)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "partly seen (1 of 2)", chrome: "partly seen (1 of 2)"}
requirement_items: ["S20.15", "S20.16", "S20.17", "S20.18"]
depends_on: ["SYS-shared-ui-and-design", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "file:packages/ui/unified-chat/src/lib/tabular.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F020-05 Tables and table actions

Shows pipe tables as a grid with a header row. Wide tables scroll sideways inside their box. On web, desktop and mobile each table has buttons to copy it as tab-separated text, download it as CSV, and expand it. Mobile also sorts by header tap. CLI, VS Code and Chrome show the grid only.

Area: [20. Markdown and text rendering](README.md). Requirement items: [S20.15](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2015), [S20.16](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2016), [S20.17](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2017), [S20.18](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2018).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built (this page lists unfinished parts) | partly built | partly seen (1 of 3) |
| Desktop | built (this page lists unfinished parts) | partly built | not seen by a person |
| Mobile | built (this page lists unfinished parts) | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | partly seen (1 of 2) |
| Chrome | partly built | partly built | partly seen (1 of 2) |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Draws Markdown tables readably on every screen size and lets readers take the data away.

**Why it exists.** Comparison and data answers use tables. Readers want to read them without cut-off columns and to reuse the numbers in a spreadsheet (doc: knowledge-base/data/area-briefs/020-markdown-and-text-rendering.md S20.15 to S20.18).

**Who uses it.** Readers of comparisons, lists of numbers and schedules.

**Problems it solves**

- Wide tables do not overflow the page.
- Words are not broken in the middle on a narrow screen.
- Data leaves the app as TSV or CSV in one click.
- Malformed tables are kept lossless instead of losing cells.

**Use cases**

- Copy a pricing table into a sheet.
- Download a results table as CSV.
- Expand a wide table full screen.
- Sort a table on mobile by a column.

## 2. User experience

**Where to find it**

- Web and Desktop (Tauri): buttons above each table, visible on hover or keyboard focus, always visible on touch: 'Copy table', 'Download as CSV', 'Expand table' (MarkdownTable.tsx:128-143; locale defaults at 47-52, 80-81, 126).
- Mobile: icons with labels 'Copy table', 'Download table as CSV', 'Expand table'; tap a header to sort (MessageContentRenderer.tsx:333-377, 465-507, 590-600).
- CLI: bordered grid in the terminal (markdown_renderer.rs:441-455).
- VS Code: table inside a scroll region labelled 'Table' (render.ts:72-74).
- Chrome: table in the assistant bubble, scrolling sideways (apps/extension/src/side_panel.ts:2965-2971).

**Before you start**

- A reply containing a pipe table.

**Screens and controls**

- Web: Copy shows a check and the label 'Table copied' for 2 seconds; on failure the text 'Copy failed, clipboard unavailable' appears for 4 seconds (MarkdownTable.tsx:105-117, 47-59).
- Web: Download as CSV saves table.csv (MarkdownTable.tsx:119-123).
- Web: Expand opens a full-screen dialog titled 'Table' with the same buttons and 'Close expanded table' (MarkdownTable.tsx:155-188).
- Web: the table region is keyboard focusable and scrolls both ways, up to 70% of screen height (MarkdownTable.tsx:145-150).
- Mobile: header press sorts ascending, descending, then restores order, announcing 'sorted ascending' (MessageContentRenderer.tsx:465-507); download opens the share sheet (436-445).

**Journey**

1. The table renders with a header row.
2. The reader scrolls sideways if it is wide.
3. The reader clicks Copy, Download or Expand.
4. Copy puts tab-separated text on the clipboard; Download saves table.csv; Expand shows the table full screen.

**What the person sees and gets**

- Check icon and 'Table copied' text after copy.
- Red status text on copy failure.
- A CSV file named table.csv (web).
- Mobile alert 'Download failed' with 'Could not save this table as CSV. Try again.' on failure (MessageContentRenderer.tsx:441-443).

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and desktop: GFM table via remark-gfm; MarkdownTable wraps it with actions and a scroll region (MarkdownContent.tsx:801; MarkdownTable.tsx:91-190). Cells keep whole words; only tokens over 24 characters may break anywhere (MarkdownContent.tsx:517-537). Cell alignment maps to start, centre, end (539-547).
- Copy and download read each cell's text content and run it through toTsv and toCsv (MarkdownTable.tsx:21-33, 110, 122). Those functions guard against spreadsheet formula injection (packages/ui/unified-chat/src/lib/tabular.ts:253-258, 315-335), so a cell starting with = + - or @ gains a leading apostrophe in both copy and download.
- A table with more cells in a row than in its header row becomes a read-only Markdown source block instead of a table (remarkPlugins.ts:17-54).
- Streaming holds an incomplete table back until it is complete (StreamingMarkdownContent.tsx:106; streamingTableHold.ts).
- Mobile: table layout fits or scrolls (MessageContentRenderer.tsx:112-280), sort (465-507), copy as TSV (436), download CSV through the share sheet (437-445), expand full screen (590-627), via markdownTableToTsv and markdownTableToCsv which call the shared toTsv and toCsv (apps/mobile/src/features/chat/utils/tableCsv.ts:22-27).
- CLI: bordered grid, column cap 40 characters, 96-character budget, wrapped cells, header divider (markdown_renderer.rs:441-455, 401-432).
- VS Code: table inside a focusable scroll div (render.ts:72-74; CSS webviewContent.ts:1433). Chrome: table is display block with overflow-x auto (side_panel.ts:2965-2971).

**Incomplete**

- CLI, VS Code and Chrome have no copy, download or expand.
- Neither web nor mobile offers XLSX; the brief's wording mentions CSV or XLSX.
- CLI wraps cells in capped columns and does not scroll sideways, so very wide tables become tall (markdown_renderer.rs:452-455).

**Present but disconnected or switched off**

- The brief marks S20.17 copy missing everywhere and S20.18 download missing on mobile; code shows both built on web, desktop and mobile. The brief is stale.

**Not available**

- Sorting is mobile only; web has no sort (MarkdownTable.tsx has none).

## 4. Required behaviour

**Established requirements**

- GFM pipe tables render as a grid with a header row and aligned cells. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.15)
- A table wider than the answer column scrolls horizontally instead of overflowing or being cut off. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.16)
- A rendered table offers a one-click copy (TSV, CSV or Markdown). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.17)
- A rendered table offers a download (CSV or XLSX). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.18)
- Exports neutralise spreadsheet formulas. (source: packages/ui/unified-chat/src/lib/tabular.ts:253-258)

**Acceptance criteria**

1. A 3-column table renders with a header row on all six apps.
2. A table with 12 columns scrolls sideways on web without cutting columns.
3. Web Copy table puts tab-separated rows on the clipboard and shows 'Table copied' then reverts after about 2 seconds.
4. A copy blocked by the browser shows 'Copy failed, clipboard unavailable'.
5. Web Download as CSV saves table.csv with the same rows and header.
6. A cell '=1+1' exports with a leading apostrophe.
7. A row with extra cells shows as read-only source text with no table actions.
8. Mobile header tap sorts and the copy follows the sorted order (test MarkdownTableActions 'copies the rows in the order the reader sorted them').

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Copy and download should include the header row as the first line [inferred from readTableData 21-33].
- On web, text extracted from a cell with inline math may include hidden MathML text, giving duplicated text [inferred from reading textContent; not tested].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add Copy as Markdown and an XLSX download if the brief's wording is a requirement.
- [proposed] Give CLI, VS Code and Chrome a copy action or document the omission.
- [proposed] Add a test for the web copy, download and expand buttons.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MarkdownTable | `packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx` | Web and desktop table wrapper with copy, download, expand and scroll (91-190). |
| component | Table cell and header components | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Word-preserving wrap classes, alignment, sticky header (514-592). |
| config | remarkLosslessTables | `packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts` | Turns a table with overflowing rows into read-only source (17-54). |
| service | toCsv, toTsv, spreadsheet guard | `packages/ui/unified-chat/src/lib/tabular.ts` | Delimited export with formula guard (253-335). |
| service | downloadTextFile | `packages/ui/unified-chat/src/components/markdown/downloadTextFile.ts` | Browser file save (3-12). |
| service | streamingTableHold | `packages/ui/unified-chat/src/components/markdown/streamingTableHold.ts` | Holds an incomplete table while streaming (used at StreamingMarkdownContent.tsx:106). |
| component | Mobile table renderer | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Layout, sort, copy, download, expand (112-280, 333-627). |
| service | tableCsv | `apps/mobile/src/features/chat/utils/tableCsv.ts` | Mobile rows to CSV and TSV through shared exporters (22-27). |
| service | markdownTableRows | `apps/mobile/src/features/chat/utils/markdownTableRows.ts` | Row parsing helpers imported at MessageContentRenderer.tsx:72-78. |
| component | TableFullScreen | `apps/mobile/src/features/chat/components/TableFullScreen.tsx` | Mobile expanded table. |
| service | render_table | `apps/cli/src/tui/markdown_renderer.rs` | Terminal bordered table (441-560). |
| service | VS Code table rules | `apps/extension-vscode/src/webview/render.ts` | table_open and table_close wrap in a scroll region (72-74). |
| config | VS Code table CSS | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | .message-table-scroll overflow-x auto (1433-1434). |
| config | Chrome table CSS | `apps/extension/src/side_panel.ts` | .sp-bubble-assistant table scroll (2965-2971). |
| service | sortTabularRows | `packages/ui/unified-chat/src/lib/tabular.ts` | Shared sort used by mobile (82-107). |
| test | Mobile table action tests | `apps/mobile/src/features/chat/components/__tests__/MarkdownTableActions.test.tsx` | Copy, sorted copy, 2 second confirm, failure, expand, CSV download (55-131). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Parser builds the table; overflowing rows become source text. | device | remarkPlugins.ts:17-54 |
| Copy reads the rendered cells, builds TSV and writes to the clipboard. | device | MarkdownTable.tsx:105-117 |
| Download builds CSV and saves a file named table.csv (web) or shares a file (mobile). | device | MarkdownTable.tsx:119-123; MessageContentRenderer.tsx:437-445 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Copied TSV and downloaded CSV | Clipboard; user's Downloads or share target | No | Kept by the user's device |
| Mobile sort choice | Component state in memory (setSort) | No | Lost on unmount |

**Models and providers.** No model or provider involvement.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | Clipboard write may be denied; web shows 'Copy failed, clipboard unavailable'. Mobile share sheet needs the OS file share. |
| Subscription | none found in the code; no plan limit is seen. |
| Limits and metering | none found in the code. Table region height is limited to 70% of the viewport or 40rem (MarkdownTable.tsx:146). |
| Feature flags | none found in the code. |
| Model compatibility | Any model. |
| Provider restrictions | none found in the code. |
| Local mode | Works offline and in Local mode on web, desktop and mobile; all steps are on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Copy success | 'Table copied' for 2 seconds then idle. | MarkdownTable.tsx:111-112 |
| Copy failure | Status text for 4 seconds then idle. | MarkdownTable.tsx:113-115 |
| Malformed table | Read-only source block, no actions. | remarkPlugins.ts:17-54; test MarkdownContent.render.test.tsx:157-210 |
| Streaming incomplete table | Held back until complete. | StreamingMarkdownContent.tsx:106 |
| Touch device | Action row always visible; buttons 44 pixel targets. | MarkdownTable.tsx:19, 130 |
| Mobile download failure | Alert 'Download failed'. | MessageContentRenderer.tsx:441-443 |
| Mobile link in header | A header with a link is not sortable. | MessageContentRenderer.tsx:497 |
| Accessibility | Scroll region has role region, label 'Table' and tabindex 0; mobile headers announce sort state. | MarkdownTable.tsx:147-149; MessageContentRenderer.tsx:504-510 |
| Offline, timeout, cancel | not handled in the code (no network step in table display, copy or download). | Searched MarkdownTable.tsx and the mobile table code; no network, timeout or cancel code. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/__tests__/RenderingMatrix.test.tsx`: Table cell words kept whole, scroll region reachable by keyboard, header cells, top alignment, long tokens break above a floor (121-220).
- `packages/ui/unified-chat/src/components/markdown/MarkdownContent.render.test.tsx`: Overflowing table copy of every character, read-only fallback, escaped pipes, short row stays a table, alignment mapping (157-236).
- `apps/mobile/src/features/chat/components/__tests__/MarkdownTableActions.test.tsx`: Tab-separated copy, sorted-order copy, 2 second confirm, failure message, expanded table, CSV download, escaped pipe (55-131).
- `apps/mobile/__tests__/WideMarkdownTable.test.tsx`: Mobile wide table (name only). Also MarkdownTableFit.test.tsx and MessageContentRenderer.tables.test.tsx.
- `packages/ui/unified-chat/src/lib/__tests__/tabular.test.ts`: Shared tabular and export helpers (name only). Also tabular.redos.test.ts, tabularSort.test.ts.
- `apps/cli/src/tui/markdown_renderer.rs`: GFM table with borders and CJK alignment (696-736).

**Test scenarios**

- **Copy table**
  1. Render a 3x3 table on web.
  2. Hover and click 'Copy table'.
  3. Paste into a spreadsheet.
  - Expected: Three rows, tab separated, header first; label shows 'Table copied' then reverts.
- **Download CSV**
  1. Click 'Download as CSV'.
  2. Open table.csv.
  - Expected: Header and rows as comma-separated values; a cell '=SUM(1)' starts with an apostrophe.
- **Wide table**
  1. Render a 12-column table in a narrow window.
  - Expected: Table scrolls inside its box; no word is split in the middle (unless over 24 characters).
- **Expand**
  1. Click 'Expand table'.
  2. Use Copy in the dialog; close it.
  - Expected: Full-screen table with Copy, Download and Close; the dialog closes.
- **Malformed table**
  1. Render a table whose row has more cells than the header.
  - Expected: Shown as read-only Markdown source; no copy buttons.
- **Mobile sort**
  1. Tap a header three times.
  - Expected: Ascending, descending, original order; copy follows the order shown.

**Where to look when it fails**

- Web: failure class code_copy is reported for code, not for table copy; table copy failure only shows the status text (MarkdownTable.tsx:113-115).
- Mobile: alert 'Download failed'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/020-markdown-and-text-rendering.md](../../70-qa/test-plans/web/020-markdown-and-text-rendering.md)
- Desktop: [70-qa/test-plans/desktop/020-markdown-and-text-rendering.md](../../70-qa/test-plans/desktop/020-markdown-and-text-rendering.md)
- Mobile: [70-qa/test-plans/mobile/020-markdown-and-text-rendering.md](../../70-qa/test-plans/mobile/020-markdown-and-text-rendering.md)
- CLI: [70-qa/test-plans/cli/020-markdown-and-text-rendering.md](../../70-qa/test-plans/cli/020-markdown-and-text-rendering.md)
- VS Code: [70-qa/test-plans/vscode/020-markdown-and-text-rendering.md](../../70-qa/test-plans/vscode/020-markdown-and-text-rendering.md)
- Chrome: [70-qa/test-plans/chrome/020-markdown-and-text-rendering.md](../../70-qa/test-plans/chrome/020-markdown-and-text-rendering.md)

## 10. Gaps and dependencies

- **No test found for the web copy, download and expand buttons.** Affects: Web, Desktop. Evidence: Searches for 'Copy table', 'table.csv', 'Download as CSV' in tests found only mobile and artifact tests. Work needed: Add render tests for MarkdownTable actions.
- **CLI, VS Code and Chrome have no copy or download.** Affects: CLI, VS Code, Chrome users. Evidence: markdown_renderer.rs:441-455; render.ts:72-74; side_panel.ts:2965-2971. Work needed: Decide parity and add actions.
- **Exports add a leading apostrophe to formula-like cells, so a copy of '=x' differs from the visible text.** Affects: Web, Desktop, Mobile. Evidence: tabular.ts:253-258, 327-335. Work needed: Tell the reader or limit the guard to downloads.
- **No XLSX or Markdown copy.** Affects: All. Evidence: MarkdownTable.tsx has TSV and CSV only. Work needed: Confirm requirement.
- **Brief statuses for S20.17 and S20.18 are stale.** Affects: Documentation. Evidence: MarkdownTable.tsx:105-123; MessageContentRenderer.tsx:436-445. Work needed: Update the brief.

**Depends on**

- SYS-shared-ui-and-design
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- file:packages/ui/unified-chat/src/lib/tabular.ts

## Unknown

- How CLI aligns cells by column alignment markers (not read).
- Whether Chrome and VS Code tables have a minimum column width.
- Whether the web copy duplicates text from cells that contain math.
- What file name mobile gives the CSV (exportSourceFile arguments 'table','csv' only).
- Whether the Tauri desktop copy works the same (shares the component).
