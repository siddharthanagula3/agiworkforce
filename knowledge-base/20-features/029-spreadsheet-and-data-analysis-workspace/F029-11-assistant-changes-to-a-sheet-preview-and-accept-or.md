---
id: "F029-11"
type: "feature"
title: "Assistant changes to a sheet: preview and accept or reject"
aliases: ["Proposed-change preview (S29.31)", "Accept/reject range changes (S29.32)", "Edit an attached workbook", "create_office_file with source edits", "Workbook edit receipt"]
area: "29 Spreadsheet and data-analysis workspace"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S29.31", "S29.32"]
depends_on: ["F029-12", "F029-09", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-files-artifacts-and-storage", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "mode:cloud", "surface:web", "surface:desktop", "surface:mobile"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F029-11 Assistant changes to a sheet: preview and accept or reject

When asked to change an attached Excel workbook, the server edits only the explicit cells named, and each edit must match an expected current value or the whole edit fails. The person gets a new file with a preservation receipt. There is no preview of cell changes and no accept or reject per range on any app.

Area: [29. Spreadsheet and data-analysis workspace](README.md). Requirement items: [S29.31](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2931), [S29.32](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2932).

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

**What it does.** Lets the assistant change specific cells of an attached .xlsx and return a new file, refusing edits when the cell is not what the assistant expected or the file changed (apps/web/lib/services/managed-office-preservation.ts:1364-1487).

**Why it exists.** Changing a person's workbook must not silently damage it. The brief also requires a preview and per-range accept or reject, which is not built (briefs S29.31, S29.32).

**Who uses it.** People who attach a workbook and ask for a targeted fix, such as correcting a value or formula.

**Problems it solves**

- Rewriting a whole workbook risks losing formatting and unrelated parts.
- The assistant may edit the wrong cell; the expected-value check stops that.

**Use cases**

- Change B4 from 100 to 120 in the Budget sheet.
- Replace a formula in one cell.
- Fix several labelled cells in one request.

## 2. User experience

**Where to find it**

- Web: no dedicated control. Attach an .xlsx and ask in chat; the Output menu row 'Output' offers Document, Presentation, Spreadsheet (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:190, 975-1000; labels at packages/contracts/cloud-contracts/src/skills.ts:22-26).
- Desktop: same as Web via the hosted app (doc: AGENTS.md section 5).
- Mobile: the 'Create file' row with Document, Presentation, Spreadsheet (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1182-1215). Whether a mobile attachment can be edited: tool takes attachments of the turn, so likely yes; not confirmed [inferred].
- Chrome: no office control found in the side panel code; the server can still infer creation from the wording (request-processor.ts:993-998).
- Voice: the live-voice tool list offers the tool without attachments, so no workbook can be edited by voice (apps/web/lib/voice/live-voice-tools.ts:399) [inferred].
- CLI and VS Code: none found.

**Before you start**

- Cloud mode, signed in, a streaming request, and a model with tool support (request-processor.ts:5460-5493).
- An attached .xlsx under the size limit with a name that is a plain file name (managed-office-file-service.ts:237-247).
- Not a free-offering request (packages/contracts/cloud-contracts/src/free-quota.ts:126).

**Screens and controls**

- Attach button, the Output or Create file choice, and chat. No preview screen and no accept or reject buttons.

**Journey**

1. 1. Attach the workbook.
2. 2. Ask for the change in chat (words like create, make, export plus excel or spreadsheet can switch Office creation on, request-processor.ts:914-916, 993-998).
3. 3. The model calls create_office_file with format xlsx and a source that holds the file name, its digest and a list of edits (sheet, cell, expected, value).
4. 4. The server checks the file, the sheet, the cell and the expected value, applies the edits, recalculates formulas, and stores the new file.
5. 5. The person sees a file card in chat; the verification receipt records changed parts.

**What the person sees and gets**

- A new file with the requested name (original stays); a receipt with input hash, changed parts and unchanged part count (managed-office-preservation.ts:1489-1510). Whether the web UI displays the receipt: unknown.
- On failure the model receives the error text and tells the person.

**Settings**

- Output format choice per message; none specific to edit safety.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Edit engine: finds the one attached workbook by file name and type, checks its digest, maps sheet names to parts, and edits only existing explicit cells (managed-office-preservation.ts:1364-1487).
- Mismatch of expected value fails: 'A workbook cell differs from the expected value; refresh the source before editing.' (managed-office-preservation.ts:1456-1458).
- Refuses shared, array and spill formula cells, a cell edited twice, and inserting a new cell (managed-office-preservation.ts:1409-1430, 1471-1474).
- Recalculation of formulas needs a sandbox; without one the request fails rather than return stale values (managed-office-file-service.ts:1007-1014).
- A preservation receipt requires only worksheet parts changed (managed-office-preservation.ts:1489-1510).
- Tool offers each attached workbook's digest to the model (managed-office-file-service.ts:237-247, 283-287).
- Result persisted as a chat file and emitted (tool-loop.ts:2569-2607).

**Incomplete**

- Draft said the cap is 'per schema description'; the schema allows 1000 edits per request (managed-office-file-service.ts edits max 1000).
- Edits are one request, all or nothing; a person cannot take some and drop others.

**Present but disconnected or switched off**

- Voice offers the Office tool with no attachments, so editing is not reachable there (live-voice-tools.ts:399) [inferred].

**Not available**

- Preview of changed cells (S29.31) and accept or reject each range (S29.32): all six apps. No diff-of-cells UI found; the VS Code proposed-change review is for code files only (apps/extension-vscode/src/features/permissions/proposedChangeReview.ts).

## 4. Required behaviour

**Established requirements**

- Before the assistant changes a sheet, the product previews the proposed cell changes. (source: S29.31 in the brief)
- The user can accept or reject each proposed range change. (source: S29.32 in the brief)
- An action a user cannot undo asks first and names the consequence; an agent never destroys user data and keeps a checkpoint. (source: doc: AGENTS.md section 9)
- Artifacts keep versions with compare and restore. (source: doc: docs/product/experience-contract.md:43-46)

**Acceptance criteria**

1. A requested edit with a wrong expected value fails and the original is unchanged.
2. A changed attachment (different digest) fails with the 'source workbook changed' message.
3. Editing a spill or array formula cell is refused.
4. Only the named cells differ between old and new files; other parts are byte-identical.
5. With preview built, every changed cell is listed before any file is produced.
6. With per-range accept built, rejecting a range leaves those cells as they were.
7. The original workbook is never overwritten.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A preview can be built from the same edit list the model already sends (sheet, cell, expected, value) [inferred].
- Receipts should be shown to the person [inferred from AGENTS.md section 9].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a cell diff card from the edit list and wait for approval before generating.
- [proposed] Split the edit list into ranges so each can be accepted or rejected.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | editManagedWorkbook | `apps/web/lib/services/managed-office-preservation.ts` | Applies explicit-cell edits with digest and expected-value checks (line 1364). |
| service | workbookPreservationReceipt | `apps/web/lib/services/managed-office-preservation.ts` | Proves only worksheet parts changed (line 1489). |
| service | recalculateManagedWorkbook | `apps/web/lib/services/managed-office-preservation.ts` | Recalculates formulas in the sandbox (line 757). |
| service | generateManagedOfficeFile | `apps/web/lib/services/managed-office-file-service.ts` | Entry point; xlsx source branch at lines 994-1033. |
| config | create_office_file tool definition | `apps/web/lib/services/managed-office-file-service.ts` | Schema with source.edits (lines 233-410). |
| service | Tool loop Office branch | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs the tool and persists the file (lines 2562-2608). |
| service | applyManagedOfficeFileCreation | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Adds the tool when office_creation is true (line 1258). |
| service | Request gates | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Requires streaming and tool-capable model (lines 5460-5493). |
| service | Attachment hydration | `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` | Returns the turn's attachment bytes (hydrateChatAttachments) that the edit reads. |
| service | persistGeneratedFileBytes | `apps/web/lib/server/generated-file-persist.ts` | Stores the new file with verification metadata. |
| config | Tool name and formats | `packages/contracts/cloud-contracts/src/skills.ts` | MANAGED_OFFICE_FILE_TOOL_NAME and output format labels (lines 18-26). |
| service | Voice tool list | `apps/web/lib/voice/live-voice-tools.ts` | Offers the Office tool without attachments (line 399). |
| component | Output menu (web) | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Choose Document, Presentation or Spreadsheet (lines 975-1000). |
| component | Create file row (mobile) | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Same choice on the phone (lines 1182-1215). |
| store | Mobile chat execution store | `apps/mobile/stores/chat/chatExecutionStore.ts` | Sends office_creation and office_format (lines 3284-3290, 3434-3441). |
| service | Web chat stream hook | `apps/web/lib/hooks/useChatStream.ts` | Sends office_creation and office_format (line 4641-4642). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person attaches the .xlsx and asks for a change; the app sends office_creation true when a format was chosen. | device | apps/web/lib/hooks/useChatStream.ts:4641-4642; apps/mobile/stores/chat/chatExecutionStore.ts:3434-3441 |
| The route adds the create_office_file tool, listing each attached workbook's name and digest. | our servers | request-processor.ts:1258-1267; managed-office-file-service.ts:237-247 |
| The model returns edits; the server validates the schema and finds the one matching attachment. | our servers | managed-office-file-service.ts:938-949; managed-office-preservation.ts:1364-1375 |
| Cells are checked against expected values and rewritten in the sheet XML. | our servers | managed-office-preservation.ts:1440-1487 |
| Formulas are recalculated in the sandbox. | outside service | managed-office-file-service.ts:1007-1014 |
| Package check and preservation receipt are produced. | our servers | managed-office-file-service.ts:1015-1017 |
| The file is stored and sent to the chat as a file. | our servers | tool-loop.ts:2577-2607 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Edited workbook (new file) | Generated-media storage plus media_assets, origin managed-office-tool | Per user on our servers | 20 MB cap per file (generated-file-persist.ts:17); retention not read |
| Verification receipt (hashes, changed parts) | Stored in the file's metadata (tool-loop.ts:2589) | With the file record | With the file |

**Models and providers.** The model decides the edit list and sends the expected values, so a weak model may name wrong cells; the server check catches mismatches. Any tool-capable model can call the tool; the tool is offered for any provider (request-processor.ts:5477-5494). No provider-specific path for edits.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Authenticated file owner required (tool-loop.ts:2566-2568). |
| Permissions | Tool approval policy not found for the Office tool in the lines read; unknown. |
| Subscription | No plan check on Office creation found in the sections read; free-offering requests are barred (free-quota.ts:126). Whether paid plans differ: unknown. |
| Limits and metering | 1000 edits, 20 sheets, 20,000 rows by 200 columns for new sheets, 2,000 characters per cell, 20 MB package (managed-office-file-service.ts:96-108, edits max 1000; generated-file-persist.ts:17). Metering of the tool itself: none found. |
| Feature flags | Formula recalculation and render checks need sandbox execution (gate.ts:6-24). |
| Model compatibility | Needs tool support; otherwise HTTP 422 'The selected model cannot create Office files. Choose a tool-capable model.' (request-processor.ts:5477-5493). Needs a streaming request (422 office_creation_stream_required, lines 5461-5475). |
| Provider restrictions | none found in the code |
| Local mode | Not available from Local inference: the tool runs inside the Cloud chat route and the sandbox. No Office creation code found in Desktop, CLI or VS Code trees (searches). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Expected value mismatch | Whole request fails with a clear message. | managed-office-preservation.ts:1456-1458 |
| File changed | Fails: 'The source workbook changed. Select its current digest before editing.' | managed-office-preservation.ts:1389-1391 |
| No unique attachment | Fails: 'Choose one uniquely named attached Excel workbook.' | managed-office-preservation.ts:1369-1372 |
| Too large | Fails with 'The source workbook is too large.' or exceeds package limit. | managed-office-preservation.ts:1373-1375, 1480-1483 |
| Sandbox missing for formulas | Fails; offers values instead. | managed-office-file-service.ts:1009-1012 |
| Unknown error | Generic 'The file could not be created.' | managed-office-file-service.ts:1066-1075 |
| Cancel | Abort signal is checked before returning. | managed-office-file-service.ts:1031 |
| Storage failure | 'The Office file could not be attached.' | tool-loop.ts:2591-2593 |
| Offline, retry | not handled in the code read; repeated failure handling exists in the tool loop (tool-loop.repeated-failure.test.ts) | file name only |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/managed-office-preservation.test.ts`: Array-formula refusal, editing an input cell outside an array range, recalculated values, expected-value matching for numeric strings and numbers stored as text, empty-cell edits.
- `apps/web/lib/services/managed-office-preservation-markup.test.ts`: Package markup handling including a pivot cache fixture.
- `apps/web/lib/services/managed-office-file-service.test.ts`: Tool definition and scoped input digest, preserving unrelated package parts and original bytes, refusing excess edit expansion, formulas without evaluator.
- `apps/web/lib/services/managed-office-render.integration.test.ts`: Render checks of Office files (name; contents not read).
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.office-file.test.ts`: Creates, persists and emits a real file from a tool call; fails closed without an owner.
- `apps/web/app/agent-permissions/__tests__/office-file-claims.test.ts`: References the Office tool; contents not read.

**Test scenarios**

- **Happy edit**
  1. Attach a workbook with 100 in B2.
  2. Ask to set B2 to 120.
  3. Download the new file.
  - Expected: B2 is 120 in the new file; other cells and parts are unchanged; original file is intact.
- **Wrong expected value**
  1. Ask for an edit but state the old value wrongly (via a test harness calling the tool).
  - Expected: Error about differing expected value; no file.
- **Array formula**
  1. Edit a cell inside an array formula result.
  - Expected: Refused with the shared/array message.
- **Preview absent**
  1. Ask for a change and watch before the file appears.
  - Expected: No cell preview and no accept or reject.
- **Non-tool model**
  1. Pick a model without tools and choose Spreadsheet output.
  - Expected: HTTP 422 office_creation_model_unsupported.

**Where to look when it fails**

- Error strings above, code office_creation_stream_required, office_creation_model_unsupported.
- Tool result isError text in the chat.
- media_assets rows with origin managed-office-tool.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No preview of changed cells** Affects: All six apps. Evidence: Brief S29.31. Work needed: Show the edit list as a diff and require approval before running.
- **No accept or reject per range** Affects: All six apps. Evidence: Brief S29.32; single all-or-nothing edit list. Work needed: Group edits by range and apply only accepted groups.
- **Edit cannot create new cells** Affects: Web, Desktop, Mobile, Chrome. Evidence: managed-office-preservation.ts:1471-1474. Work needed: Decide if adding rows or cells is required.
- **Voice cannot edit attached workbooks** Affects: Web voice. Evidence: live-voice-tools.ts:399 passes no attachments. Work needed: Decide whether voice should edit files.
- **Receipt visibility unknown** Affects: All. Evidence: No UI code for the receipt read. Work needed: Check and surface changed parts.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F029-12
- F029-09
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-files-artifacts-and-storage
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- mode:cloud
- surface:web
- surface:desktop
- surface:mobile

## Unknown

- Whether paid plans or workspaces gate Office creation.
- Whether tool approval applies to create_office_file.
- Whether the UI shows the receipt.
- Whether Chrome side panel can send office_creation explicitly; none found.
- Whether mobile attachments reach the tool the same way as web.
