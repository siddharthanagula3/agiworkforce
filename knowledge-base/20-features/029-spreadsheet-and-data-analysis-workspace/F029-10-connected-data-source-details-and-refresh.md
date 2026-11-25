---
id: "F029-10"
type: "feature"
title: "Connected data: source details and refresh"
aliases: ["Data-source details (S29.29)", "Refresh connected data (S29.30)", "Source provenance", "Refresh"]
area: "29 Spreadsheet and data-analysis workspace"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S29.29", "S29.30"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-authentication-and-identity", "F029-09", "F029-11", "mode:cloud", "surface:web"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F029-10 Connected data: source details and refresh

Planned: show where table data came from (connector, table, query, time) and refresh a sheet from its connected source. Not built on any app. Data a person attaches or pulls through a connector arrives as plain chat content with no stored source record and no refresh control.

Area: [29. Spreadsheet and data-analysis workspace](README.md). Requirement items: [S29.29](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2929), [S29.30](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2930).

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

**What it does.** Would show the origin of pulled data and let a person press Refresh to re-read it. Not implemented today.

**Why it exists.** Numbers go stale and people must know where they came from (briefs S29.29, S29.30).

**Who uses it.** Analysts and managers who pull data from connected apps and databases.

**Problems it solves**

- Unclear origin of a table.
- Stale numbers that cannot be re-read without redoing the request.

**Use cases**

- Open source details to see connector, table, query and time.
- Press Refresh on Monday to re-pull the weekly numbers.

## 2. User experience

**Where to find it**

- No control on any of the six apps (brief: missing on all).

**Before you start**

- Not defined; the feature does not exist. A connector would be needed [inferred].

**Screens and controls**

- none found in the code. A sheet viewer exists (SpreadsheetArtifact.tsx) but has no source or refresh control; it shows sheet tabs, sort headers and a row-limit note (SpreadsheetArtifact.tsx:47, 236-243, 330).

**Journey**

1. Today: ask the assistant in chat to query a connected app again; the new result replaces nothing and carries no stored source record [inferred from code read].

**What the person sees and gets**

- Chat answers only.

**Settings**

- Connectors are managed elsewhere (SYS-connectors-plugins-and-skills).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Research and chat can name connectors as sources in a request (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts research_sources.connectors, in the schema near line 740), but this is for research, not sheets.

**Incomplete**

- Workbook edits require the source file digest to match, which is an integrity check, not refresh (apps/web/lib/services/managed-office-preservation.ts:1364-1391).

**Present but disconnected or switched off**

- none found

**Not available**

- Source details and Refresh: Web, Desktop, Mobile, CLI, VS Code, Chrome. Searches for refresh, source-detail and provenance code tied to sheets found none.

## 4. Required behaviour

**Established requirements**

- For data pulled from a source, the product shows where it came from (connector, table, query, time). (source: S29.29 in the brief)
- The user can refresh sheet data from its connected source. (source: S29.30 in the brief)
- Local, own-key and Cloud are separate trust boundaries; nothing may silently route Local data to Cloud. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. A table pulled from a connector shows connector name, table, query and pull time.
2. Refresh re-reads the source and updates the data and the time.
3. If the source is unreachable, Refresh shows an error and keeps the old data.
4. Refresh never sends Local data to another mode without consent.
5. Source details stay with the table when it is exported or shared, or the product says they do not.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A stored source record per table is needed; none exists today [inferred].
- Refresh of a workbook edit target should compare digests, as the edit path already does (managed-office-preservation.ts:1391-1395).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Record connector id, query and timestamp on every tool result that returns a table.
- [proposed] Add Refresh as a re-run of the saved query, with the same approval rules.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Brief items S29.29, S29.30 | `knowledge-base/data/area-briefs/029-spreadsheet-and-data-analysis-workspace.md` | Both missing on all apps. |
| component | SpreadsheetArtifact | `packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx` | Shows a table; where a source panel and Refresh would sit. |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Web artifact viewer with menus; no refresh item. |
| service | Workbook sheet loader | `apps/web/features/chat/lib/office-file-preview.ts` | Loads sheets of a stored workbook for preview (loadWorkbookSheets, line 233). |
| service | Workbook edit digest check | `apps/web/lib/services/managed-office-preservation.ts` | Refuses an edit when the file digest changed (lines 1385-1391). |
| service | Tool loop | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs connector tools; results are text, no source record. |
| config | Contracts for skills and connectors | `packages/contracts/cloud-contracts/src/skills.ts` | Managed skill contracts; not a source record. |
| table | media_assets | `apps/web/lib/server/media-assets.ts` | Where generated files are recorded; holds no source or query fields as far as read. |
| other | Capability gap register | `audit/registers/capability-gaps.csv` | CAP-029 notes the sheet viewer is unwired on Desktop. |
| other | Experience contract | `docs/product/experience-contract.md` | Connected accounts and export rules. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Planned: person opens source details of a table. | device | not built; brief S29.29 |
| Planned: refresh re-runs the saved query at the connector. | outside service | not built; brief S29.30 |
| Current: a workbook edit compares the attached file's digest before changing cells. | our servers | apps/web/lib/services/managed-office-preservation.ts:1385-1391 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Source record (connector, table, query, time) | none found; no store or table exists | Not applicable | Not applicable |

**Models and providers.** No model or provider takes part in a feature that does not exist.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Not defined. A Local-mode refresh from a cloud connector would cross a trust boundary and would need consent (doc: AGENTS.md section 6). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Feature absent | No control appears. | brief S29.29, S29.30 |
| Loading, error, retry, offline, timeout, stale source | not handled in the code | no code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/managed-office-preservation.test.ts`: Workbook edit rules including expected-value matching (not refresh).

**Test scenarios**

- **Confirm absent**
  1. Pull a table from a connector in chat.
  2. Look for source details or Refresh.
  - Expected: Neither exists.
- **Digest guard**
  1. Attach a workbook, ask for an edit, change the file, repeat.
  - Expected: The edit fails with 'The source workbook changed...' text.
- **Stale answer**
  1. Ask for a figure from a connector twice at different times.
  - Expected: Two separate answers, no stored link between them.

**Where to look when it fails**

- Error text 'The source workbook changed. Select its current digest before editing.' (managed-office-preservation.ts:1389-1391).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No source details** Affects: All six apps. Evidence: Brief S29.29. Work needed: Record source on table results and show it.
- **No refresh** Affects: All six apps. Evidence: Brief S29.30. Work needed: Store the query and add a re-run with approval.
- **Failure and limits undefined** Affects: All. Evidence: No code. Work needed: Write the requirement.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-authentication-and-identity
- F029-09
- F029-11
- mode:cloud
- surface:web

## Unknown

- How connector tool results are stored in messages and whether they keep the query.
- Whether any connector returns a table type the viewer could render.
- Row CAP-029 full text beyond the first line.
