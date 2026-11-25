---
id: "F029-03"
type: "feature"
title: "Formulas and named ranges"
aliases: ["Formulas", "Formula recalculation", "Named ranges", "Formula explanation", "Formula error display", "S29.07", "S29.08", "S29.33", "=SUM", "not calculated"]
area: "29 Spreadsheet and data-analysis workspace"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S29.07", "S29.08", "S29.33"]
depends_on: ["surface:web", "surface:mobile", "mode:cloud", "SYS-execution-boundaries", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "F029-01", "file:apps/web/lib/services/managed-office-preservation.ts", "file:apps/web/lib/e2b/chat-template.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F029-03 Formulas and named ranges

The assistant can write real formulas into a workbook. The server then recalculates them in a sandbox and refuses to deliver a workbook with errors or no result. Formula explanations, named-range creation and in-app error flags are not built. The viewer shows 'not calculated' for formulas with no stored result.

Area: [29. Spreadsheet and data-analysis workspace](README.md). Requirement items: [S29.07](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2907), [S29.08](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2908), [S29.33](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2933).

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

**What it does.** Turns any cell text that starts with = into a real spreadsheet formula, recalculates the workbook so every formula has a result, and refuses files whose formulas fail.

**Why it exists.** A file with live formulas is more useful than pasted numbers, but a formula with no stored result shows blank in many viewers. The server check makes sure the delivered file has results (managed-office-preservation.ts:328-362).

**Who uses it.** People who ask for budgets, totals or models in a spreadsheet; reviewers of generated workbooks.

**Problems it solves**

- Formulas stay formulas, not text (managed-workbook-builder.ts:70-71).
- Formula errors are caught before delivery (managed-office-preservation.ts:346-351).
- Formulas that reach outside the workbook are refused (managed-office-preservation.ts:757-775).

**Use cases**

- Ask for a sheet whose total column uses =SUM(B2:B5).
- Edit one input cell in an attached workbook and have dependent formulas recalculate.
- Open a workbook from another tool and see 'not calculated' where no result was stored.

## 2. User experience

**Where to find it**

- Web chat: Output, Spreadsheet, then ask for formulas (ComposerPlusMenu.tsx:957-990).
- Mobile: same request flag (chatExecutionStore.ts:3283-3287).
- Viewing: the grid on web and mobile shows each cell's stored result (workbook-sheets.ts:506).
- Formula explain, named ranges, error flags: no screen found.

**Before you start**

- Cloud mode, a tool-capable model, and a working Office execution sandbox for any workbook with formulas (managed-office-file-service.ts:1004-1013).

**Screens and controls**

- No formula-specific control. The person describes the formulas in chat.

**Journey**

1. Ask for a workbook with a total row.
2. The assistant sends a cell such as =SUM(B2:B5).
3. The server writes it as a formula, runs a recalculation in the sandbox, stores results, checks for errors.
4. The file is attached; opened in a spreadsheet app it shows values.
5. In the in-app preview a stored result shows; a formula with no result shows 'not calculated'.

**What the person sees and gets**

- The file with evaluated results.
- A verification receipt with recalculation 'passed' or 'not_required' attached to the stored file metadata (managed-office-preservation.ts:34-43; tool-loop.ts:2587).
- On failure, a text message such as 'Workbook formulas require an available recalculation environment. Use values instead, or enable Office execution.' goes to the assistant (managed-office-file-service.ts:1010-1011).

**Settings**

- Office execution availability is server configuration; its name is not recorded here beyond the chat template setting AGI_E2B_CHAT_TEMPLATE (chat-template.ts:1).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- A cell starting with = becomes <f> (managed-workbook-builder.ts:70-71).
- If any worksheet contains <f, the server requires a sandbox executor and recalculates (managed-office-file-service.ts:1000-1013).
- Allowed functions are an explicit list including SUM, AVERAGE, IF, SUMIF, COUNTIFS and others; other functions are refused (managed-office-preservation.ts:395-420,746-755).
- External workbook links and active content are refused (managed-office-preservation.ts:680-706,765-770).
- A formula with an error result or no result stops delivery (managed-office-preservation.ts:346-351).
- Temporary sandbox files are removed, and failure to remove them stops the request (managed-office-preservation.ts:880-905).
- Edits to an attached workbook change only named cells with an expected old value (managed-office-file-service.ts:165-184).

**Incomplete**

- The voice tool calls the generator with no executor, so workbook formulas always fail there (live-voice-tool-runner.ts:155; managed-office-file-service.ts:1004-1011) [inferred from the missing option].
- The viewer does not calculate; it shows the stored result or 'not calculated' (workbook-sheets.ts:674,506).

**Present but disconnected or switched off**

- Tauri can write formula cells (create_excel.rs:106-114) but the tool passes text-only cells (create_excel.rs:176-181), so formulas are not produced there.

**Not available**

- Formula explanation action, named-range definition, in-app formula-error flags with an explanation: no code found on any app. Whether the server rejects defined names on creation: the builder writes none (managed-workbook-builder.ts:197-209).
- CLI and VS Code: no formula features found.

## 4. Required behaviour

**Established requirements**

- The product explains a selected formula in plain language via a dedicated action. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S29.07)
- The user or tool can define and use named ranges in a workbook. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S29.08)
- Cells with formula errors such as #REF! and #DIV/0! are flagged with an explanation. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S29.33)
- Preserve spreadsheet formulas from supplied templates. (source: doc: docs/product/competitive-guidance.md:336)

**Acceptance criteria**

1. A requested =SUM(B2:B5) opens in a spreadsheet app as a formula with the right value.
2. A request using an unsupported function is refused with a message.
3. A formula that divides by zero stops delivery, not a file with #DIV/0!.
4. With no sandbox available, a workbook with formulas fails with the 'use values' message; one without formulas still succeeds.
5. A formula that points to another workbook is refused.
6. An attached workbook edit with a wrong expected value is refused [inferred from the expected field at managed-office-file-service.ts:174].

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Named ranges can already be preserved in an edited workbook because the recalculation guard reads definedName formulas (managed-office-preservation.ts:471-480) [inferred]; creating them is not supported.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Pass an executor in the voice runner or tell the model not to use formulas by voice.
- [proposed] Show a readable note in the preview when a cell holds an error value.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | cellXml | `apps/web/lib/services/managed-workbook-builder.ts` | Writes = text as a formula (lines 62-75). |
| service | generateManagedOfficeFile xlsx case | `apps/web/lib/services/managed-office-file-service.ts` | Detects formulas, calls recalculation (lines 994-1031). |
| service | recalculateManagedWorkbook | `apps/web/lib/services/managed-office-preservation.ts` | Recalculates in the sandbox and caches results (line 757). |
| service | verifyManagedOfficePackage | `apps/web/lib/services/managed-office-preservation.ts` | Rejects formula errors and missing results (lines 328-362). |
| config | RECALCULABLE_FUNCTIONS and RULE_FUNCTIONS | `apps/web/lib/services/managed-office-preservation.ts` | Allowed function lists (lines 395-460). |
| service | editManagedWorkbook | `apps/web/lib/services/managed-office-preservation.ts` | Cell edits to an attached workbook (line 1364). |
| service | E2B executor | `apps/web/lib/e2b/chat-template.ts` | Sandbox template setting for chat code execution (line 1). |
| other | tool-loop executor wiring | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Gives the file tool the sandbox executor (line 2571). |
| other | voice file runner | `apps/web/lib/voice/live-voice-tool-runner.ts` | Calls the generator without an executor (line 155). |
| service | readWorkbookSheets | `packages/ui/unified-chat/src/lib/workbook-sheets.ts` | Shows stored results or 'not calculated' (lines 506,674). |
| service | compute-metering | `apps/web/lib/e2b/compute-metering.ts` | Meters sandbox compute under provider e2b (line 42); link to workbook recalculation not confirmed. |
| test | managed-office-file-service tests | `apps/web/lib/services/managed-office-file-service.test.ts` | Formula refusals and receipts (lines 131,521,546,616). |
| test | managed-workbook-builder tests | `apps/web/lib/services/managed-workbook-builder.test.ts` | Formulas stay formulas (line 67). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The model sends rows where some cells start with =. | outside service | tool-loop.ts:2569 [inferred that the model call goes to a provider] |
| The server writes formula cells and scans for <f. | our servers | managed-workbook-builder.ts:70-71; managed-office-file-service.ts:1000-1003 |
| The server checks functions and links, then stages the file in a sandbox and recalculates. | outside service | managed-office-preservation.ts:757-870; executor from tool-loop.ts:2571 |
| Results are written back and the package is checked for errors. | our servers | managed-office-preservation.ts:870-875 |
| The sandbox temporary folder is deleted. | outside service | managed-office-preservation.ts:880-890 |
| The file is stored and shown. | device and our servers | tool-loop.ts:2575-2596; office-file-preview.ts:233-239 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Workbook bytes during recalculation | A temporary folder in the sandbox, named .agi-office-<id> (managed-office-preservation.ts:776) | No | Removed after the run; failure to remove stops the request (lines 880-905) |
| Final workbook with cached results | Generated-file storage (generated-file-persist.ts:217-259) | Via the account | Retention unknown |

**Models and providers.** The model decides the formulas; the recalculation does not use a model. Sandbox provider is E2B by file names (apps/web/lib/e2b); its configuration names beyond AGI_E2B_CHAT_TEMPLATE were not recorded.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Authenticated owner required (tool-loop.ts:2565-2567). |
| Permissions | None found beyond the account. |
| Subscription | Restricted Free chat has office creation off (free-quota.ts:126). Whether code execution entitlement also gates the sandbox on paid plans: not read for web; mobile requires it (chatExecutionStore.ts:3273-3277). |
| Limits and metering | Sandbox compute metering exists in compute-metering.ts but its link to this path is unconfirmed. Function allowlist is the main limit. |
| Feature flags | Mobile code-execution flag (chatExecutionStore.ts:3273). |
| Model compatibility | A model that can write the formulas through a tool call. |
| Provider restrictions | Sandbox is one outside provider; no alternative found. |
| Local mode | Recalculation needs our server and its sandbox, so formula workbooks cannot be built in Local mode. Viewing stored results works on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No sandbox | Request fails with a message to use values or enable Office execution. | managed-office-file-service.ts:1008-1011 |
| Formula error | Delivery stopped with 'A workbook formula has no evaluated result or contains a calculation error.' | managed-office-preservation.ts:346-351 |
| Unsupported function | Refused with 'This workbook function is not supported by the managed recalculation contract.' | managed-office-preservation.ts:746-755 |
| External link | Refused. | managed-office-preservation.ts:765-770 |
| Cancel | The abort signal is checked during recalculation and before return. | managed-office-preservation.ts:772; managed-office-file-service.ts:1031 |
| Voice | Formulas fail because no executor is given. | live-voice-tool-runner.ts:155 [inferred] |
| Timeout, retry, offline | Not handled in the code read for this path beyond the abort signal. | not handled in the code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/managed-office-file-service.test.ts`: Evaluated formula receipts (131), refusal without evaluator (521), refusal of active functions (546), formula errors not verified (616).
- `apps/web/lib/services/managed-workbook-builder.test.ts`: Strings with numbers, leading zeros and formulas written as formulas (lines 11-67).
- `apps/web/lib/services/managed-office-preservation.test.ts`: Package preservation and recalculation; details not read.
- `apps/web/lib/services/managed-office-preservation-markup.test.ts`: Markup handling of rule elements; details not read.
- `apps/web/lib/services/managed-office-render.integration.test.ts`: Render check; details not read.

**Test scenarios**

- **Simple total**
  1. Ask for rows 10, 20, 30 and a total using SUM.
  2. Open the file.
  - Expected: Total cell shows 60 and is a formula.
- **Divide by zero**
  1. Ask for a cell =1/0.
  - Expected: The file is not delivered; the assistant gets the error message.
- **No sandbox**
  1. Run in an environment without Office execution and ask for a formula.
  - Expected: Failure with the use-values message.
- **Voice**
  1. In voice mode ask for a workbook with a SUM.
  - Expected: Current code predicts failure; record the observed result.
- **Not calculated display**
  1. Attach a workbook that has formulas with no cached values and open its preview.
  - Expected: Cells show 'not calculated'.

**Where to look when it fails**

- Error text strings above.
- Receipt field recalculation in the stored file metadata (tool-loop.ts:2587).
- Sandbox logs: not located.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/web/029-spreadsheet-and-data-analysis-workspace.md)
- Desktop: [70-qa/test-plans/desktop/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/desktop/029-spreadsheet-and-data-analysis-workspace.md)
- Mobile: [70-qa/test-plans/mobile/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/mobile/029-spreadsheet-and-data-analysis-workspace.md)

## 10. Gaps and dependencies

- **No formula explanation, named range creation or error display with explanation.** Affects: All apps. Evidence: No code found for S29.07, S29.08, S29.33. Work needed: Chat can already explain a formula in text, but no dedicated action exists; build it only if wanted.
- **Voice cannot build a workbook with formulas.** Affects: Voice on web and desktop. Evidence: live-voice-tool-runner.ts:155; managed-office-file-service.ts:1004-1011. Work needed: Pass an executor or remove formulas from voice instructions.
- **Brief marks all six apps missing, but formula writing and recalculation work server-side for web, desktop-hosted, mobile.** Affects: Readers of the brief. Evidence: managed-workbook-builder.ts:70-71. Work needed: Split S29.07, S29.08, S29.33 from formula creation in the brief.
- **A fixed function list means common functions such as lookups may be refused.** Affects: Users asking for advanced formulas. Evidence: managed-office-preservation.ts:395-460 (full list not read). Work needed: Review the list against what leaders support.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- mode:cloud
- SYS-execution-boundaries
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- F029-01
- file:apps/web/lib/services/managed-office-preservation.ts
- file:apps/web/lib/e2b/chat-template.ts

## Unknown

- Full list of allowed functions (only the start of the lists was read).
- Which entitlement gates the sandbox for web paid plans.
- Whether sandbox recalculation use is billed or counted toward a plan quota.
- Whether the Chrome extension can reach the tool.
- How the recalculation runs inside the sandbox (script body not read).
