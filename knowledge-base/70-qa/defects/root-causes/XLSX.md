---
id: "DOC-70-qa-defects-root-causes-xlsx"
type: "root-cause"
title: "XLSX: an Excel file with a formula cannot be created"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# XLSX: an Excel file with a formula cannot be created

Paths are under `~/.cache/agi-audit/worktrees/gap-read-main/apps/web` ("main") unless noted. Log lines are `~/.cache/agi-audit/web-lane/logs/server.log`.

## 1. What the person sees today / what they should see

Today (testers, basic W-9, Free and Ultra):
- Word and PowerPoint files arrive. The Excel file does not. The chat says "The tool failed" and "the Excel file could not be generated because workbook recalculation failed".
- A retry in plain words ("Please try the Excel spreadsheet (.xlsx) again") gets "I can't create or attach an .xlsx file on this turn because the spreadsheet file-generation tool isn't available".
- On Ultra the second message was "Now just the Excel spreadsheet (.xlsx): columns Color and Units, rows Red 2 and Blue 3, and a Total row with a working SUM formula that gives 5. Give me the download link." (screenshot `07.small.png` in the W-9 `20261124T1946Z-s2` run folder). The answer was "I can't create or attach the .xlsx on this turn because the required create_office_file tool isn't available."
- The person types the sheet by hand. A file only arrives when the message names `create_office_file` and asks for plain values. Its Total is then a typed 5, not a SUM formula.

Should see: ask "make me an Excel budget with a Total row" and get a download card for an .xlsx within one normal turn. Open it and Total shows the right number and is a live `=SUM(...)`. The same card shows in the preview and after reload. No "tool failed". If a part of a workbook truly cannot be calculated, the file still arrives, and the chat says in plain words which cells were kept as text.

## 2. Causes

1. **Any .xlsx with a formula fails (product defect, set off by a test-machine limit).**
   - `buildWorkbook` writes formulas as `<f>` with no cached value (`lib/services/managed-workbook-builder.ts:70-72`, `cellXml`).
   - The xlsx case in `managed-office-file-service.ts:1000-1014` sees any `<f` and demands LibreOffice recalculation in the E2B sandbox. With no executor it throws "...Use values instead, or enable Office execution" (1011).
   - `recalculateManagedWorkbook` (`managed-office-preservation.ts:757-838`) runs `python3 -c` that needs `libreoffice` or `soffice` (822-826). A non-ok result throws "Workbook recalculation failed or is unavailable..." (836-838). The model repeats this as "recalculation failed".
   - After building, `verifyManagedOfficePackage` rejects any formula cell with no `<v>` (`managed-office-preservation.ts:343-349`). This matters for the fallback in 3c.
   - Docx and pptx never call the executor unless `verify_render` is set (`managed-office-file-service.ts:975-990`), so they work.
   - Log: sandbox `create_folder` and `write_file` succeed, then `run_command` ends in 117-180 ms (server.log 8918-8927, `iu4wrtsn3wt93dhkhxn4b` at 8930-8934), too quick for a LibreOffice conversion. The `execute_tool` span for `create_office_file` carries `agi.tool.status: failed`. The log never prints "soffice" or "libreoffice", so "no LibreOffice" is inferred from timing and the code, not read (the run notes also say "unproven"). Any non-ok command gives the same message. Cheap check before telling the owner anything about the template: run `which soffice` in a sandbox from the default template.
   - The product still offers formulas when the Office template is not set. The tool text says `=SUM(...)` is a real formula (`managed-office-file-service.ts:253,360`). The spreadsheet skill says write formulas (`.agents/skills/spreadsheet-creation/SKILL.md:15`). `applyManagedOfficeFileCreation` (`request-processor.ts:1261-1267`) never checks `e2bChatTemplate()`.
   - Mark: product defect. The product's own comment on `buildWorkbook` says the file "must not depend on a sandbox being reachable" (`managed-workbook-builder.ts:160-166`), and a plain SUM breaks that.

2. **This machine has no Office template (test-machine limit).** `.env.local` sets `E2B_API_KEY` and `AGI_E2B_EXECUTION` only. `AGI_E2B_CHAT_TEMPLATE` is unset, so `e2bChatTemplate()` returns null (`lib/e2b/chat-template.ts:1-4`) and the sandbox uses the default image without LibreOffice (`.env.example:391-394`). Production is unknown. The ledger rows `audit/ledger/ecosystem-capability-ledger.jsonl` S31.03, S95.22 and S110.03 call the template and its switch-on an owner item. Treat production as unverified. If production has execution off, the failure is the no-executor branch (`managed-office-file-service.ts:1011`) instead.

3. **"The tool isn't available" on a follow-up (product defect, confirmed for Ultra by the message text).** The server adds the file tool only when `office_creation` is true (`request-processor.ts:1262`). Unless the client sent it (`useChatStream.ts:4641`, from the composer toggle), the server infers it from the last user message only: a verb in `create|generate|make|prepare|produce|export|build` plus an Office noun (`request-processor.ts:914-916, 992-998`; the prompt passed in is `lastUserText`, `request-processor.ts:4470, 4534-4539`).
   - Ultra message above: it has the nouns "Excel spreadsheet" and ".xlsx" but none of the seven verbs ("Give me" is not in the list). So the tool was not added on that turn, and the model said so. (The earlier design said the tool was offered on every Ultra turn. That was a low-confidence reading of tool spans and is dropped.)
   - Free message "try ... again": no listed verb either. The next Free turn ("Make an .xlsx...") matched and the tool ran (server.log 27483-27491).
   - The history the web client sends is plain role and text (`lib/hooks/useChatStream.ts:4573-4578`, `apiMessages`), so the server cannot see a prior tool call unless the text names it. It can see earlier user text and the assistant text, which in the screenshot holds "Download PowerPoint deck (.pptx)" and file names.
   - Nothing tells the person the file tool was off for this message.

4. **Typed Total 5 (tester behavior, not a defect).** With plain values there is no `<f>`, recalculation is skipped (`managed-office-file-service.ts:1004-1007`) and the file succeeds. The model dropped the formula only to get any file. Disappears once cause 1 is fixed.

## 3. Change

Idea: calculate simple formulas where the workbook is built, in the web server, and write the result next to the formula. Then no sandbox is needed for the common case. Formulas the calculator cannot handle keep today's LibreOffice route, and if that route is missing or fails, the server still delivers the file (3c). The tool offer for follow-ups becomes sticky inside a thread that already did Office work (3d), without changing routing or model checks.

### a) `lib/services/managed-workbook-calculator.ts` (new, pure)
Owner of "value of a formula in a generated workbook". Its output is written as `<v>` and the in-app preview, mobile and Quick Look show it without recalculating, so it must follow Excel's rules exactly and otherwise return nothing. A missing value is safe (it goes to the fallback in 3c). A wrong stored number is not.

```ts
export type WorkbookCalculation = {
  values: Map<string, number>; // key `${sheetIndex}!${A1}`
  unresolved: Array<{ sheetIndex: number; reference: string }>; // formula cells with no value
};
export function calculateWorkbookFormulas(sheets: WorkbookSheet[]): WorkbookCalculation
```

Scope: numbers, parentheses, `+ - * / ^`, unary `+`/`-`, postfix `%`, same-sheet refs (upper or lower case, with `$` absolute markers), ranges `A1:B5`, and `SUM AVERAGE MIN MAX COUNT ROUND ABS`. The function names live in one `const` in this file. Anything else (other functions, other-sheet refs, string literals, comparison, cycles) is unresolved.

Excel semantics pinned (each has a test, section 4):
- Return no value (unresolved) for: division by zero; AVERAGE, MIN or MAX over no numbers; a single cell reference to a text cell or an empty-string cell used with `+ - * / ^` (Excel gives `#VALUE!`); a reference to a formula cell that is itself unresolved; any non-finite result; a cycle.
- Reference to an empty cell in arithmetic is 0. A numeric-text cell (`isNumericCellText`, `managed-workbook-builder.ts`) is already written as a number by `cellXml` (lines 63-68), so the calculator reads it as a number too, using the same helper.
- In ranges, SUM, AVERAGE, MIN, MAX and COUNT skip text and empty cells (Excel behavior). A single-cell argument that is text is `#VALUE!` for SUM in Excel only when typed as a literal, not through a reference, so references are skipped; literal text arguments are unresolved.
- Precedence: unary minus binds tighter than `^`, so `-2^2` is 4. `^` is left-associative (`2^3^2` is 64). `%` applies before binary operators (`50%*2` is 1).
- `ROUND(x, n)` rounds half away from zero (not JavaScript `Math.round`), supports negative `n`, and is computed on the decimal text to avoid binary drift (for example 1.005 with 2 digits gives 1.01 as Excel shows).
- Results are written with `String(number)` limited to 15 significant digits, as Excel stores them, so no `1.0000000000000002` in the file.

Use a small recursive-descent parser over the formula text, memoised cell lookups and a visiting set for cycles.

### b) `lib/services/managed-workbook-builder.ts`
- `cellXml` (lines 63-75) and `sheetXml` take the computed map. When a value exists: `<c r="B6"><f>SUM(B2:B5)</f><v>1750</v></c>`. Otherwise today's `<f>` only.
- New option on `buildWorkbook(sheets, options?)`: `{ uncalculable: 'formula' | 'text' }`, default `'formula'`. With `'text'`, each unresolved formula cell is written as an inline string holding the formula text (`<c t="inlineStr"><is><t>=VLOOKUP(...)</t></is></c>`), so it is no longer a formula cell and cannot fail verification.
- `buildWorkbook` returns the unresolved list so the service can decide, for example `{ data, unresolved }` for the generated path. Its only caller is `generateXlsx` (`managed-office-file-service.ts:789`).
- Add `<calcPr calcId="191029" fullCalcOnLoad="1"/>` after `</sheets>` in the `xl/workbook.xml` the builder writes (lines 198-208; today there is no `calcPr`). Excel and Numbers then recalculate on open, and the cached `<v>` only serves readers that do not calculate. Safe for the checks: the verifier does not read `calcPr` (`verifyManagedOfficePackage`, `managed-office-preservation.ts:317-363`), and the repo already stages exactly this attribute for LibreOffice (`managed-office-preservation.ts:786-792`).

### c) `lib/services/managed-office-file-service.ts` (xlsx case, 1000-1014)
Generated workbooks (no `source`):
1. Build with the calculator. If `unresolved` is empty, skip the executor entirely. `verifyManagedOfficePackage` then passes because every formula has a `<v>`.
2. If `unresolved` is not empty, try today's route: get the executor and call `recalculateManagedWorkbook` (the whole file is recalculated, as today).
3. If there is no executor, or recalculation throws, do not throw. Rebuild with `uncalculable: 'text'` (calculated formulas stay live with their values, the rest become text), verify, and return `ok: true` with a new optional field `notice`, for example: `Formulas in D3, D4 could not be calculated here, so they are stored as text. Tell the person the file is ready and which cells hold text instead of formulas.` The failure stays on the server; the model never sees an error for this case.
4. The executor is not needed to deliver a file in any generated-workbook case. A real abort (`options.signal`) still stops the call.

Tool result: `tool-loop.ts:2573-2604` already returns `JSON.stringify({ ok: true, verification, file })` to the model. Add `...(generated.notice ? { notice: generated.notice } : {})` to that object and add `notice?: string` to `ManagedOfficeFileGenerationResult` (`managed-office-file-service.ts:230`). The notice is plain words for the model to relay; the file already exists, so the chat does not depend on the model obeying an error text to deliver.

Verification label: `ManagedOfficeVerification.recalculation` (`managed-office-preservation.ts:39`) is `'not_required' | 'passed'`, and `'passed'` means LibreOffice recalculated. Add `'calculated'` for values written by the server calculator and use it when a workbook has formulas and no LibreOffice step ran. Only the two files above import this type (checked with a search over `apps/web`); the persisted metadata in `tool-loop.ts` stores whatever string is there.

Edited workbooks (`source` set) keep today's rule exactly: any `<f` recalculates, failure throws. That path must keep the original file intact and has no honest value to invent, so it is unchanged. Its error is the existing plain-words message; the only change is that the sentence at line 1011 stops telling the model to "enable Office execution" (a person cannot do that) and says "Formulas in the edited workbook could not be recalculated here, so no file was written." This is the one failure a person can still see, and only for edits.

### d) Keep the file tool available for follow-ups in a thread that already did Office work (`request-processor.ts`)
The verb list at line 914 is NOT widened. A wider list would set `request.office_creation`, and that flag does more than add a tool: `resolveToolAwareTaskType` returns `'agentic'` for it (`request-processor.ts:1040`), which routes to a costlier model (AGENTS.md section 7), and a model with `tools === false` gets HTTP 422 `office_creation_model_unsupported` (`request-processor.ts:5485-5499`). "I need a summary of this pdf" must not do either.

Instead, add a soft offer that never sets `office_creation`:
- New pure helper next to `applyImplicitManagedToolIntent`:
  ```ts
  export function threadHasOfficeFileWork(messages: ChatCompletionRequest['messages'], beforeIndex: number): boolean
  ```
  True when, among messages before the last user message, any of these hold: an assistant message has a `tool_calls` entry named `MANAGED_OFFICE_FILE_TOOL_NAME` (API clients); a `tool` message has that name; an earlier user message matches both `RE_OFFICE_CREATION_ACTION` and `RE_OFFICE_CREATION_ARTIFACT` (the web client case: the first message of the Ultra thread); an assistant message text matches `\.(docx|pptx|xlsx)\b` (the download links the model writes).
- In the processing path next to the 5460 block: `offerOfficeTool = chatRequest.office_creation !== false && chatRequest.office_creation !== true && chatRequest.stream && RE_OFFICE_CREATION_ARTIFACT.test(lastUserText) && threadHasOfficeFileWork(...) && resolvedModelCaps?.tools !== false`. When true, call `applyManagedOfficeFileCreation` with a request whose tool is added but with no flag change, no forced `tool_choice`, no 422 and no agentic routing. For a message such as "summarize this pdf" the model sees one more tool and may ignore it; the cost is the tool schema tokens. A user opt-out in the message still wins: `applyTurnToolProhibition` (`turn-tool-prohibition.ts`) sets the flag false before this runs, and `false` disables the offer.
- `applyManagedOfficeFileCreation` (`request-processor.ts:1261-1267`) currently reads `request.office_creation`; give it an explicit `force` parameter (or split out `addManagedOfficeFileTool(request, attachments)`) so the two call sites share one place that builds the tool.
- Not covered on purpose: a brand new chat whose first message has no create verb ("try the Excel again"). There is no thread evidence; the client toggle or a create verb is needed, as today.
- Ultra case result: the thread's first message ("create a Word document, an Excel spreadsheet...") matches the action and artifact patterns, and the second message names ".xlsx", so the tool is offered on "Now just the Excel spreadsheet (.xlsx)...". Free case: after a first success, "please try the Excel spreadsheet (.xlsx) again" names the artifact, the thread has Office work, so the tool is offered.

### e) Skill and tool text
No change. They already say write formulas, which now works. Do not mention vendors or model ids.

### Why no refactor
Not needed. One new pure file plus targeted edits in files that already own each concept (workbook building stays in `managed-workbook-builder.ts`, tool offer stays in `request-processor.ts`). Shared packages (`packages/ui`) are untouched, so desktop, Chrome and VS Code behave the same because they call this web route. Mobile also sends `office_creation` itself (`apps/mobile/services/streaming.ts`) and gains the server-side sticky offer for free.

## 4. Regression check
Yes, it is a pure function and affects stored files. Add `managed-workbook-calculator.test.ts` plus cases in `managed-workbook-builder.test.ts`, `managed-office-file-service.test.ts` and `request-processor` tests (existing files):

Calculator (each asserts a value or no value):
- `SUM(B2:B5)` over numbers gives 1750; AVERAGE, MIN, MAX, COUNT, ABS; arithmetic with parentheses.
- `-2^2` is 4; `2^3^2` is 64; `50%*2` is 1; `$B$2`, lower-case `b2`.
- ROUND half away from zero: `ROUND(2.5,0)` is 3, `ROUND(-2.5,0)` is -3, `ROUND(1.005,2)` is 1.01, `ROUND(1250,-2)` is 1300.
- No value: `=B1/0`; `=AVERAGE(C1:C3)` over empty or text-only cells; `=A1+B1` where A1 is text; a reference to an unresolved formula cell; `=VLOOKUP(...)`; other-sheet refs; a cycle; overflow.
- Ranges skip text: `SUM(A1:A3)` with a text cell in the range ignores it, `COUNT` counts only numbers.

Builder: calculated cell has `<v>`; unresolved has none in `'formula'` mode and is an inline string in `'text'` mode; workbook.xml carries `fullCalcOnLoad="1"`; package passes `verifyManagedOfficePackage`.

Service: all-supported formulas and no executor gives ok (the executor is never called); one unsupported formula with no executor gives ok, `notice` names the cell, the cell is text and the others stay formulas; unsupported formula with a failing recalculation gives the same; unsupported formula with a working executor still takes the LibreOffice path; `source` edits still recalculate and still throw when it fails; `verify_render` unchanged.

Tool loop: the JSON result carries `notice` when set and omits it otherwise.

Request processor: with history holding an earlier "create a Word document, an Excel spreadsheet..." user message, "Now just the Excel spreadsheet (.xlsx)... Give me the download link." gets the tool and leaves `office_creation` unset and the task type unchanged; "I need a summary of this pdf" in a thread with no Office work gets no tool; the same message in an Office thread gets the tool but no 422 on a `tools === false` model (tool simply not offered) and no `'agentic'` routing; an explicit "no files" opt-out removes the offer; a message with a verb ("make an xlsx") still sets the flag exactly as before.

## 5. Person-style check (rebuilt local app, seeded accounts, Free and Ultra)
1. Sign in as the seeded Free user. New chat. Type: "Make an Excel budget: Rent 1200, Food 400, Travel 150, with a Total row that adds them." Press Enter.
2. First words appear within a few seconds. A file card "....xlsx" appears. Click download, open in Numbers or Excel: Total reads 1750 and the cell is `=SUM(...)`. Check the in-app preview shows 1750 too.
3. Reload the page: the card is still there and opens.
4. Type "try the Excel again with a Tax column using VLOOKUP". Expected: a file arrives, and the reply says plainly which cells hold text instead of a formula (the VLOOKUP cells). No "tool failed" text.
5. In the same chat, say "please try the Excel spreadsheet (.xlsx) again": a file arrives (no "tool isn't available").
6. As the seeded Ultra user, send: "create a Word document, an Excel spreadsheet with a SUM totals row, and a PowerPoint deck for 2 red and 3 blue units (total 5)". Three files arrive. Then send exactly: "Now just the Excel spreadsheet (.xlsx): columns Color and Units, rows Red 2 and Blue 3, and a Total row with a working SUM formula that gives 5. Give me the download link." A file arrives and Total reads 5. Check Word and PowerPoint still arrive too.
7. Control for false positives, same Ultra thread: "Give me a two line summary of the PowerPoint you made." Expected: a plain summary, no new file, model name and cost label the same as for any ordinary chat turn (not the agentic route).
8. Failure case: temporarily unset `AGI_E2B_EXECUTION`, repeat step 1: file still arrives (no sandbox needed). Then ask for an unsupported formula: the file arrives, the chat says in plain words which cells were kept as text, never a bare error.

## 6. Compatibility and rollback
Older workbooks and edited-source workbooks go the same path as today. New files gain `<v>` values and a `calcPr`, which every reader accepts. The LibreOffice route still runs for formulas the calculator cannot evaluate and for edits, so nothing is removed. Rollback: revert the web files and delete the new calculator; no data migration, no stored-data change (already generated files stay valid, and stored `verification.recalculation` values stay readable because `'calculated'` is only ever added).

## 7. Owner
Facts: production may or may not set `AGI_E2B_CHAT_TEMPLATE`; the repo cannot say (ledger rows above say it is an owner switch-on). Building the image is `apps/web/scripts/build-e2b-office-template.mjs`. Whether LibreOffice is really missing in the default sandbox is unproven (cause 1, last bullet); check with `which soffice` before relying on it. Recommendation: after this code ships, building the template is optional for spreadsheets (it still gives render checks and covers formulas the server calculator does not know); do it only if you want rendered previews of Word/PowerPoint. No decision is needed to ship the code fix. Whether to also run the template build on this laptop for the next test round: owner call, local setup only.

## 8. Overlap
- web-lane worktree (`git -C .../worktrees/web-lane diff --stat` on `useChatStream.ts`, `tool-loop.ts`, `managed-workbook-builder.ts`, `managed-office-file-service.ts`): empty. For `request-processor.ts` it has one added line (the `organizationId` in the project-context call near line 3858). My edits are at 914-998 and 1261-1267 and near 5460, far from it.
- `~/Desktop/agiworkforce`: no uncommitted diff against HEAD in `managed-workbook-builder.ts`, `managed-office-file-service.ts`, `managed-office-preservation.ts`, `request-processor.ts`, `tool-loop.ts` or `useChatStream.ts`, and no commit ahead of origin/main in `apps/web/lib/services` or `apps/web/app/api/llm/v1/chat/completions/lib`. One local commit (`52530d34f9`) touches `lib/hooks/useChatStream.ts` (2 lines) and `response-builder.ts`; this design edits neither (the client is unchanged). The new calculator file does not exist there.
- Other consumers: `managed-workbook-builder.ts` is imported only by `managed-office-file-service.ts`, and `ManagedOfficeVerification` / `recalculateManagedWorkbook` only by that file and `managed-office-preservation.ts` (search over `apps/web`, excluding tests). The `lib/server/chat-file-preparation` code does not import either file, so it is unaffected. The preservation code for edited workbooks is not changed; the only touch is the added `'calculated'` union member.

## Review response

Blocker 1 (widening the verb list is not harmless): right. A match sets `request.office_creation` (`request-processor.ts:993-997`), which makes `resolveToolAwareTaskType` return `'agentic'` (1040) and triggers the 422 on `tools === false` models (5485-5499). Part 3d no longer widens `RE_OFFICE_CREATION_ACTION`. It adds a soft tool offer that does not set the flag, is limited to threads that already did Office work, skips models without tools, and respects the user's opt-out.

Blocker 2 (the Ultra retry has no create verb): right. The screenshot `07.small.png` shows the message "Now just the Excel spreadsheet (.xlsx): ... Give me the download link." None of the original seven verbs match, so the tool was not added on that turn. The earlier claim that the tool was offered on every Ultra turn was a low-confidence reading and is replaced (cause 3). The thread rule in 3d keeps the tool for follow-ups; the message is now part of the person-style check (step 6). One part I could not read: the exact history text the server receives for that turn. The server log holds no prompt text (a search for the message returned nothing), so the rule uses the earlier user message, which the web client does send (`useChatStream.ts:4573-4578`), and not only assistant text.

Blocker 3 (calculator semantics): right, and incorporated in 3a with a test list in section 4. One small difference from the review text: Excel's SUM over a range skips text, which the design now states, and a single reference to a text cell in `+ - * / ^` gives no value. I also added `%`, `$`, lower-case refs, 15-digit output and the unary-minus rule as listed.

Blocker 4 (failure path still throws): right for generated workbooks. Fixed server side in 3c: the file is always delivered, unresolved formulas become text cells, and a plain-words `notice` rides in the tool result. I could not keep the unresolved cells as formulas without a value, because `verifyManagedOfficePackage` rejects any formula with no `<v>` (`managed-office-preservation.ts:343-349`); text cells avoid that without weakening the check. Edited workbooks still throw, on purpose, because writing a file there would risk damaging the person's original; its message is reworded to something a person can act on.

Suggestion 1 (`fullCalcOnLoad`): taken (3b). Checked first: the verifier does not read `calcPr`, and the repo already uses `fullCalcOnLoad="1"` when staging for LibreOffice (`managed-office-preservation.ts:786-792`).

Suggestion 2 (cause 1 is inferred): taken. Cause 1 and section 7 now say it is unproven and name the `which soffice` check. The fix does not depend on it.

Suggestion 3 (overlap): taken. Section 8 now lists the new calculator file, the builder, the service, the tool loop and the client file, and names the other consumers that are unaffected.
