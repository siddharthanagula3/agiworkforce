---
id: "F029-05"
type: "feature"
title: "Number, date and currency formats, conditional formatting, data validation, protection"
aliases: ["Number formats", "Date formats", "Currency formats", "Conditional formatting", "Data validation", "Protected cells", "S29.13", "S29.14", "S29.15", "S29.16"]
area: "29 Spreadsheet and data-analysis workspace"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S29.13", "S29.14", "S29.15", "S29.16"]
depends_on: ["surface:web", "surface:mobile", "mode:cloud", "SYS-files-artifacts-and-storage", "F029-01", "F029-03", "file:packages/ui/unified-chat/src/lib/workbook-number-formats.ts", "file:apps/web/lib/services/managed-workbook-builder.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F029-05 Number, date and currency formats, conditional formatting, data validation, protection

The tool cannot create any of these: it writes one default style, plain text or numbers. The viewer can read number, date and percent formats from an existing workbook and display values as the file shows them. Conditional formatting, validation and protection cannot be created or shown in the product.

Area: [29. Spreadsheet and data-analysis workspace](README.md). Requirement items: [S29.13](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2913), [S29.14](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2914), [S29.15](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2915), [S29.16](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2916).

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

**What it does.** When a workbook is opened in chat, stored number and date formats make values read as in the file. For files the assistant creates, no formatting is written.

**Why it exists.** A date or currency stored as a bare number looks wrong. The reader applies the file's formats so people see what the file shows. The brief asks for creation of formats, rules, validation and protection (S29.13-S29.16).

**Who uses it.** Anyone opening a workbook with formatted cells; people asking for formatted output.

**Problems it solves**

- A date cell shows a date, not a serial number (workbook-number-formats.ts:345).
- Long codes with leading zeros stay as text and do not turn into numbers (managed-workbook-builder.ts:43-60).
- Numbers with twelve or more digits stay text to avoid scientific notation (managed-workbook-builder.test.ts:47).

**Use cases**

- Open a finance workbook and see percentages and dates as in Excel.
- Ask for an ID column; the IDs stay as written.
- Ask for a currency column and learn that formatting is not applied.

## 2. User experience

**Where to find it**

- Display only: the workbook preview on web, desktop-hosted web and mobile.
- Creating formats, rules, validation, protection: no screen on any app.

**Before you start**

- A readable .xlsx in the preview.

**Screens and controls**

- None. No format menu or lock control found.

**Journey**

1. Open an .xlsx.
2. The reader maps each cell's style to a number format.
3. Values show as the format allows; formats it cannot show faithfully fall back to the stored value (workbook-number-formats.test.ts:37-61).

**What the person sees and gets**

- Formatted text in the grid cells.

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Cell format table read from styles (workbook-cell-formats.ts:8-53; workbook-sheets.ts:560-564).
- Built-in and custom number format parsing for dates, times, percents and decimals (workbook-number-formats.ts:224-356).
- Cell numbers displayed to fifteen significant digits like the file (workbook-number-formats.test.ts:94).
- Number-like text rules on write: canonical decimals up to eleven digits become numbers; leading zeros, dates, long digits and trailing-zero decimals stay text (managed-workbook-builder.ts:43-75).

**Incomplete**

- Formats that cannot be shown faithfully are not applied (workbook-number-formats.test.ts:37).

**Present but disconnected or switched off**

- Tauri writes a date number format for Date cells and bold headers (create_excel.rs:97-100,76-82), but the tool only passes text cells (create_excel.rs:176-181).

**Not available**

- Writing number, date, currency formats: builder has one style only (managed-workbook-builder.ts:225-238).
- Creating conditional formatting, validation or protection: not written by the builder; the tool schema only takes strings or numbers (managed-office-file-service.ts:79).
- Showing validation lists, conditional colours or locks: no code found in the viewer.
- An attached workbook that already has conditional formatting or validation: the edit path checks their rule formulas, so they can survive an edit (managed-office-preservation.ts:462-480) [inferred].

## 4. Required behaviour

**Established requirements**

- The user or tool can apply number, date and currency formats to cells. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S29.13)
- The user or tool can add conditional formatting rules to a range. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S29.14)
- The user or tool can add data-validation rules (lists, ranges). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S29.15)
- The user or tool can lock cells, ranges or sheets against editing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S29.16)
- Evaluate real XLSX outputs, previews and charts against the actual exported file. (source: doc: docs/product/competitive-guidance.md:333-336)

**Acceptance criteria**

1. A workbook with a percent-formatted cell shows the percent in the preview.
2. A date-formatted cell shows a date.
3. A code '007' written by the tool stays '007'.
4. A tool request with a non-string non-number cell is refused.
5. No file made by the tool carries custom formats [current behaviour; checkable by opening it].

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A currency column today is plain numbers; the assistant cannot add a currency symbol format [inferred from one style].
- Protection is about the file, so reading a protected workbook is not blocked by the viewer [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a per-column format field to the sheet schema, mapped to number format ids.
- [proposed] Say in the tool description that formats cannot be applied so the assistant does not promise them.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | managed-workbook-builder styles | `apps/web/lib/services/managed-workbook-builder.ts` | Single default style, number-like text rules (lines 43-75,225-238). |
| schema | CellSchema | `apps/web/lib/services/managed-office-file-service.ts` | Only text up to 2,000 chars or a finite number (line 79). |
| service | workbook-number-formats | `packages/ui/unified-chat/src/lib/workbook-number-formats.ts` | Parses and applies number and date formats when reading. |
| service | workbook-cell-formats | `packages/ui/unified-chat/src/lib/workbook-cell-formats.ts` | Maps style index to format, capped at 65,490 (line 8). |
| service | workbook-sheets reader | `packages/ui/unified-chat/src/lib/workbook-sheets.ts` | Uses formats while reading cells (lines 560-564). |
| service | chat file preparation spreadsheet | `apps/web/lib/server/chat-file-preparation/spreadsheet.ts` | Server reads attached workbooks with the same format helpers for the model (lines 4-8). |
| service | managed-office-preservation rule lists | `apps/web/lib/services/managed-office-preservation.ts` | Treats conditional formatting and validation rule formulas as formulas to check (lines 462-480). |
| service | package-inspection | `apps/web/lib/server/chat-file-intake/package-inspection.ts` | Reads protection markup safely (line 97 comment). |
| other | Tauri create_excel formats | `apps/desktop/src-tauri/src/features/document/create_excel.rs` | Bold header and date format, tool-disconnected. |
| test | workbook-number-formats tests | `packages/ui/unified-chat/src/lib/workbook-number-formats.test.ts` | Format parsing and rounding. |
| test | workbook-cell-formats tests | `packages/ui/unified-chat/src/lib/workbook-cell-formats.test.ts` | Cell style table. |
| test | managed-workbook-builder tests | `apps/web/lib/services/managed-workbook-builder.test.ts` | Number-like text handling (lines 11-67). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Writing: strings are classified as number, formula or text; no style is chosen. | our servers | managed-workbook-builder.ts:62-75 |
| Reading: the workbook is read in the browser or on the phone and cell styles map to formats. | device | workbook-sheets.ts:560-564; WorkbookFileView.tsx:23-26 |
| For the model, an attached workbook is read on the server with the same helpers. | our servers | spreadsheet.ts:4-8 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Cell style table while reading | Memory only | No | Discarded after reading |

**Models and providers.** No model decides formats today; the assistant only supplies values.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Reading: none found. Writing: signed-in owner (tool-loop.ts:2565). |
| Permissions | None found. |
| Subscription | Same as F029-01 for writing; none for reading. |
| Limits and metering | 65,490 formats cap (workbook-cell-formats.ts:8); cell text 2,000 chars (managed-office-file-service.ts:79). |
| Feature flags | None found. |
| Model compatibility | Not relevant for reading. |
| Provider restrictions | None. |
| Local mode | Reading formats works on device in Local mode; writing a workbook needs our servers. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unsupported format code | Shows the stored value. | workbook-number-formats.test.ts:37,86 |
| Hostile long format | Scanned in linear time. | workbook-number-formats.test.ts:65 |
| Too many formats | Workbook preview limit error. | workbook-sheets.ts:560 |
| Protected sheet | No viewer rule found. | not handled in the code |
| Offline, retry, cancel | Not handled in the code for reading formats. | not handled in the code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/lib/workbook-number-formats.test.ts`: Minutes versus months, quoted text, refusal of unfaithful codes, linear scan, built-in formats, rounding (lines 9-94).
- `packages/ui/unified-chat/src/lib/workbook-cell-formats.test.ts`: Cell style table; details not read.
- `apps/web/lib/services/managed-workbook-builder.test.ts`: Number-like text rules (lines 11-67).
- `apps/web/lib/server/chat-file-preparation/__tests__/spreadsheet.test.ts`: Server reading of attached workbooks; details not read.

**Test scenarios**

- **Date display**
  1. Attach a workbook with a date-formatted column and open the preview.
  - Expected: Dates, not serial numbers.
- **Leading zeros**
  1. Ask for an ID column with 00123.
  - Expected: Opens as 00123 text.
- **Currency request**
  1. Ask for a currency column.
  - Expected: Numbers without currency format; the assistant should not claim a format. Record result.
- **Validation request**
  1. Ask for a dropdown list in a cell.
  - Expected: No validation in the file (current).
- **Protected file**
  1. Open a sheet-protected workbook.
  - Expected: Opens read-only as normal; no lock icon.

**Where to look when it fails**

- Reader error classes WorkbookFormatError and WorkbookPreviewLimitError (workbook-sheets.ts:29-41).
- No logs.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/web/029-spreadsheet-and-data-analysis-workspace.md)
- Desktop: [70-qa/test-plans/desktop/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/desktop/029-spreadsheet-and-data-analysis-workspace.md)
- Mobile: [70-qa/test-plans/mobile/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/mobile/029-spreadsheet-and-data-analysis-workspace.md)

## 10. Gaps and dependencies

- **Tool cannot write number, date, currency formats.** Affects: Web, desktop-hosted, mobile, Chrome users making workbooks. Evidence: managed-workbook-builder.ts:225-238. Work needed: Extend schema and styles part.
- **No conditional formatting, validation or protection creation or display.** Affects: All apps. Evidence: No code found for S29.14-S29.16. Work needed: Extend schema and viewer.
- **The tool description does not say formats are unsupported, so a model may promise them.** Affects: Users. Evidence: managed-office-file-service.ts:253. Work needed: State the limit in the tool text.
- **Brief marks formats missing everywhere, but reading and showing existing formats works.** Affects: Readers of the brief. Evidence: workbook-number-formats.ts:345. Work needed: Split read from write in the brief.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- mode:cloud
- SYS-files-artifacts-and-storage
- F029-01
- F029-03
- file:packages/ui/unified-chat/src/lib/workbook-number-formats.ts
- file:apps/web/lib/services/managed-workbook-builder.ts

## Unknown

- Whether the preview shows formatted values on web exactly as on mobile (workbook-sheets.ts is shared, display path on web not traced).
- What the edit path does to conditional formatting and validation in attached workbooks.
- How a protected sheet is handled by the reader.
- Whether Chrome shows workbooks.
