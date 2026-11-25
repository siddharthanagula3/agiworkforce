---
id: "F029-07"
type: "feature"
title: "Pivot tables, data cleaning and data profiling"
aliases: ["Pivot or aggregate views (S29.20)", "Data-cleaning preview (S29.21)", "Missing-value summary (S29.22)", "Duplicate-row summary (S29.23)", "Type-inference summary (S29.24)", "Data profiling"]
area: "29 Spreadsheet and data-analysis workspace"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S29.20", "S29.21", "S29.22", "S29.23", "S29.24"]
depends_on: ["F029-09", "F029-12", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-files-artifacts-and-storage", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "mode:cloud", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F029-07 Pivot tables, data cleaning and data profiling

Planned tools to total rows by a key (pivot or grouped summary), preview what a data-cleaning step would change, and profile a dataset for missing values, duplicate rows and column types. None of the five exists as a feature in any of the six apps today. The nearest path is asking the chat assistant to run code.

Area: [29. Spreadsheet and data-analysis workspace](README.md). Requirement items: [S29.20](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2920), [S29.21](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2921), [S29.22](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2922), [S29.23](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2923), [S29.24](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2924).

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

**What it does.** Would let a person see grouped totals, a before-change preview of cleaning steps, and a per-column profile (missing values, duplicates, inferred types) of a dataset. Today nothing in the code does this as a dedicated feature. [inferred from the brief and from searches that found no matching code]

**Why it exists.** The brief lists these as parts of a spreadsheet and data-analysis workspace (docs/product/requirements.md names data analysis among the leaders' features) (doc: docs/product/requirements.md:183). A person should check data quality before trusting an answer.

**Who uses it.** People who attach a CSV or workbook and want to understand or tidy it: analysts, finance and operations staff, students.

**Problems it solves**

- Hidden gaps and duplicates in a table go unseen until the answer is wrong.
- A cleaning step applied blind can change rows the person did not expect.
- Totals by a key (for example sales by region) must be rebuilt by hand.

**Use cases**

- Attach a sales CSV and see sales totalled by region (S29.20).
- See which rows a trim-spaces fix would change before applying it (S29.21).
- Read how many blanks each column has (S29.22).
- See which rows are duplicates and which column types were inferred (S29.23, S29.24).

## 2. User experience

**Where to find it**

- Web: no dedicated control found. A person can only ask the assistant in chat; with Run code on, the assistant may compute totals in a sandbox (apps/web/lib/e2b/execution-tools.ts:71-86).
- Desktop: the public Desktop shows the hosted web app, so it matches Web (doc: AGENTS.md section 5).
- Mobile, CLI, VS Code, Chrome: no dedicated control found. The brief marks all six apps missing for S29.20-S29.24 (doc: knowledge-base/data/area-briefs/029-spreadsheet-and-data-analysis-workspace.md).

**Before you start**

- Cloud mode, a signed-in account and a model that can use tools, for the chat fallback only [inferred from request-processor.ts:5477-5493 and :5236].
- An attached CSV or workbook so the sandbox can read it (apps/web/lib/e2b/attachment-staging.ts:1-30).

**Screens and controls**

- No pivot, cleaning-preview or profiling screen exists. Searches of apps and packages for pivot, profiling, duplicate-row and type-inference code found only unrelated routing text and one test fixture naming a pivot cache part (packages/ai/routing/src/classify.ts:7; apps/web/lib/services/managed-office-preservation-markup.test.ts:761).

**Journey**

1. Today (fallback): the person attaches a file and asks in chat for totals or a data check.
2. The chat turn may turn on code execution from the wording (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1002-1014).
3. The model writes Python and runs it with the execute_code tool in a sandbox (apps/web/lib/e2b/execution-tools.ts:71-86).
4. The answer comes back as chat text, a table or files. Nothing is previewed or approved before data changes, and the original file is not modified.

**What the person sees and gets**

- Chat text, tool-call output and any files the sandbox wrote (apps/web/lib/e2b/generated-files.ts:16).

**Settings**

- Run code toggle in the composer attachment menu (packages/ui/unified-chat/src/components/AttachmentMenu.tsx:867).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing built for the five items. The only related path is the general code sandbox, which can compute a summary if asked (apps/web/lib/e2b/execution-tools.ts:71-86).

**Incomplete**

- The sandbox fallback has no preview-before-apply step and no structured profile output [inferred from code read].

**Present but disconnected or switched off**

- The audit register lists a Mounted spreadsheet viewer as partial-unwired on Desktop, so even viewing is not fully wired (doc: audit/registers/capability-gaps.csv, row CAP-029).

**Not available**

- Pivot or grouped aggregate view: Web, Desktop, Mobile, CLI, VS Code, Chrome (brief S29.20).
- Cleaning preview: all six apps (S29.21).
- Missing-value, duplicate-row and type-inference summaries: all six apps (S29.22 to S29.24).

## 4. Required behaviour

**Established requirements**

- The user can create a pivot table or grouped aggregate view from sheet data. (source: S29.20 in the brief)
- Before applying a data-cleaning step, the product previews the rows it would change. (source: S29.21 in the brief)
- The product shows a per-column summary of missing values. (source: S29.22 in the brief)
- The product shows how many rows are duplicates and which ones. (source: S29.23 in the brief)
- The product shows the inferred data type of each column. (source: S29.24 in the brief)
- Generated spreadsheets and data outputs are versioned objects with preview, edit, export and reopen behaviour. (source: doc: docs/product/experience-contract.md:43-46)

**Acceptance criteria**

1. Given a dataset, a summary lists each column with its count of missing values and the counts match the data.
2. Given a dataset with repeated rows, the duplicate summary gives the correct count and identifies the rows.
3. Each column shows an inferred type that matches its values (number, date, text).
4. A cleaning step shows the exact rows it would change before any change; cancelling leaves the data unchanged.
5. A grouped summary by a chosen key gives totals equal to a manual sum.
6. Each of the above works on every app the brief lists, or the app is stated as not applicable.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Summaries should be computed from the data by code, not written by the model from memory [inferred from the brief 'computed from the dataset'].
- Large files need a row limit with a clear message, as the viewer already caps at 500 rows (packages/ui/unified-chat/src/lib/tabular.ts:78).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Compute profiles in a deterministic server or on-device function and show them as a card, instead of asking the model to write code each time.
- [proposed] Reuse the sandbox file staging so the same attached file feeds the profile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Brief items S29.20-S29.24 | `knowledge-base/data/area-briefs/029-spreadsheet-and-data-analysis-workspace.md` | Lists all five items as missing on every app. |
| service | execute_code tool definitions | `apps/web/lib/e2b/execution-tools.ts` | The only existing way to compute a summary: the model runs code in a sandbox. |
| service | Attachment staging | `apps/web/lib/e2b/attachment-staging.ts` | Copies the turn's attached files into the sandbox so code can read the dataset. |
| service | Sandbox generated-file sweep | `apps/web/lib/e2b/generated-files.ts` | Saves files the code wrote (up to 8 per turn). |
| config | Sandbox gate | `apps/web/lib/e2b/gate.ts` | Environment-driven switches for sandbox execution. |
| service | Implicit code-execution intent | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Lines 1002-1014 turn Run code on from data-analysis wording. |
| component | SpreadsheetArtifact | `packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx` | Shows a table with sheet tabs and column sort; no profile or pivot. |
| service | tabular helpers | `packages/ui/unified-chat/src/lib/tabular.ts` | Parses CSV and sorts rows; contains no profiling code. |
| component | Run code menu item | `packages/ui/unified-chat/src/components/AttachmentMenu.tsx` | Composer control that turns code execution on. |
| other | Capability gap register | `audit/registers/capability-gaps.csv` | Row CAP-029 records the spreadsheet viewer as partial-unwired on Desktop. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person attaches a dataset and asks for a summary in chat (fallback path only). | device | apps/web/lib/e2b/attachment-staging.ts:1-30 |
| The chat route decides code execution is wanted from the wording or the toggle. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1002-1014 |
| The model calls execute_code and the code runs in a managed sandbox with the staged file. | our servers | apps/web/lib/e2b/execution-tools.ts:71-86; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2571 |
| Result text and any output files return to chat. | our servers | apps/web/lib/e2b/generated-files.ts:149-156 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Output files from sandbox code | Generated-media storage plus table media_assets | Stored server-side per user; other apps see them through the account [inferred] | Retention rule not read; unknown |

**Models and providers.** The dedicated features have no model path because they do not exist. The fallback uses whichever tool-capable model the chat turn selects; the same sandbox tools are offered for any provider when sandbox execution is ready (apps/web/lib/e2b/execution-tools.ts:254-268).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No dedicated feature. The fallback needs a signed-in Cloud turn. |
| Permissions | Fallback: code execution can be switched off by a kill switch and needs the canUseCloudExecution capability (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5236). |
| Subscription | Not defined for these items. Sandbox count per plan comes from plan limits (packages/contracts/types/src/billing-catalog.ts:801-806). |
| Limits and metering | Fallback: sandbox compute is metered (apps/web/lib/e2b/compute-metering.ts); output capped at a fixed byte limit (apps/web/lib/e2b/execution-tools.ts capOutput). |
| Feature flags | Sandbox execution is switched by environment names AGI_E2B_EXECUTION and E2B_API_KEY (apps/web/lib/e2b/gate.ts:6-8). |
| Model compatibility | Fallback needs a model that supports tools (request-processor.ts:5477). |
| Provider restrictions | none found in the code for the dedicated features. |
| Local mode | No dedicated feature in Local mode. The fallback sandbox runs on our servers, so it is not a local-inference capability; the composer omits Run code where a host has no transport (packages/ui/unified-chat/src/components/AttachmentMenu.tsx:861-865). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Feature not present | No control appears on any app. | area brief S29.20-S29.24 |
| Fallback: sandbox unavailable | The turn discloses that code cannot run instead of silently dropping it. | apps/web/lib/e2b/execution-tools.ts:248-258 |
| Fallback: large output | Output is cut at a byte cap with a truncation note. | apps/web/lib/e2b/execution-tools.ts:279-282 |
| Offline, retry, cancel for the dedicated features | not handled in the code | no code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/e2b/__tests__`: Folder of sandbox tests; the individual files were not opened, so what each covers is unknown.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.office-file.test.ts`: Office file creation only; nothing for profiling or pivots.

**Test scenarios**

- **Confirm the feature is absent**
  1. Open the web chat, attach a CSV with blanks and duplicates.
  2. Look for any summary, pivot or cleaning control.
  - Expected: No such control exists. If one appears, update this page.
- **Fallback profile through code**
  1. Turn Run code on.
  2. Attach the CSV and ask for missing values per column.
  - Expected: The assistant runs code and replies with counts that match a manual count.
- **Fallback never edits the original**
  1. Ask the assistant to remove duplicates.
  2. Check the attached file in the chat.
  - Expected: The original attachment is unchanged; a new file may be offered.

**Where to look when it fails**

- Log line 'Failed to persist provider-generated file' or sandbox unavailable text in chat.
- Table media_assets for saved outputs.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No pivot or grouped summary view** Affects: All six apps. Evidence: Brief S29.20. Work needed: Build a deterministic grouping function and a result view; decide the home (shared UI package).
- **No cleaning preview** Affects: All six apps. Evidence: Brief S29.21. Work needed: Compute proposed row changes, show them, apply only after approval.
- **No missing-value, duplicate or type summaries** Affects: All six apps. Evidence: Briefs S29.22-S29.24. Work needed: Add a profiling function and a summary card on a dataset.
- **Not defined: failure, limits, subscription and Local-mode behaviour** Affects: All. Evidence: No code to inspect. Work needed: Write the requirement first, then implement.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F029-09
- F029-12
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-files-artifacts-and-storage
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- mode:cloud
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome

## Unknown

- Whether the sandbox image includes data libraries such as pandas: not read.
- Retention period for sandbox outputs.
- What each file in apps/web/lib/e2b/__tests__ covers.
- Whether any Tauri desktop Rust code profiles data: only the TS and web trees were searched thoroughly.
