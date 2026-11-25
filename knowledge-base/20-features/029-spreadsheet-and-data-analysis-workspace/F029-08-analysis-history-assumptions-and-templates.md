---
id: "F029-08"
type: "feature"
title: "Analysis history, assumptions and templates"
aliases: ["Transformation history (S29.25)", "Explain analytical assumptions (S29.37)", "Reusable analysis template (S29.40)"]
area: "29 Spreadsheet and data-analysis workspace"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S29.25", "S29.37", "S29.40"]
depends_on: ["F029-07", "F029-09", "SYS-agents-tools-and-automation", "SYS-connectors-plugins-and-skills", "SYS-memory-projects-and-context", "SYS-data-model-and-migrations", "SYS-sync-and-continuity", "mode:cloud", "surface:web", "surface:mobile"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F029-08 Analysis history, assumptions and templates

Planned: an ordered list of the steps taken on a dataset, one place that states an analysis's assumptions, and a way to save an analysis as a template and rerun it on new data. No code for any of the three exists on any app. Chat history is the only record of what was done.

Area: [29. Spreadsheet and data-analysis workspace](README.md). Requirement items: [S29.25](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2925), [S29.37](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2937), [S29.40](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2940).

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

**What it does.** Would record each data step in order so it can be revisited, show assumptions in one reviewable place, and let a person rerun a saved analysis on new data. Not built today.

**Why it exists.** The brief requires reviewable and repeatable analysis (briefs S29.25, S29.37, S29.40). Users who rely on numbers need to see how they were made.

**Who uses it.** Analysts and managers who repeat the same report each week and need to defend its method.

**Problems it solves**

- It is hard to see what was done to a file.
- Assumptions are buried in chat prose.
- A monthly analysis has to be asked for again from scratch.

**Use cases**

- Open the list of steps applied to a sales file and go back to step 3.
- Read the assumptions of a forecast in one panel.
- Save a monthly report analysis and rerun it on next month's file.

## 2. User experience

**Where to find it**

- No app has a history list, assumptions place or template control. Brief status: missing on Web, Desktop, Mobile, CLI, VS Code, Chrome.

**Before you start**

- None defined; the feature does not exist.

**Screens and controls**

- Nearest existing things, none of which are these features: the code-run card with Run again on Web (apps/web/features/chat/components/messages/CodeRunAgain.tsx:18-19) and on Mobile (apps/mobile/src/features/chat/components/CodeRunAgain.tsx); the VS Code proposed-change review, which is for code files (apps/extension-vscode/src/features/permissions/proposedChangeReview.ts:1-6).

**Journey**

1. Today a person scrolls the chat to find earlier code runs and their output.
2. To repeat an analysis the person re-sends the request with a new file; a code run can be repeated with Run again (web label 'Run again', mobile CodeRunAgain).

**What the person sees and gets**

- Chat messages, tool-call cards and saved output files only.

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Run again repeats one code run in a conversation (apps/web/app/api/chat/conversations/[id]/code-runs/route.ts:44 sets a 300 second limit; web label at apps/web/features/chat/components/messages/CodeRunAgain.tsx:18).

**Incomplete**

- Run again repeats one code block, not a recorded multi-step analysis, and is not a template [inferred].

**Present but disconnected or switched off**

- none found

**Not available**

- Transformation history list, assumptions panel and analysis templates: all six apps (briefs S29.25, S29.37, S29.40). Searches for history, template and assumption code tied to datasets found nothing.

## 4. Required behaviour

**Established requirements**

- The product lists the transformations applied to a dataset in order and lets the user revisit them. (source: S29.25 in the brief)
- The product states the assumptions behind an analysis in a dedicated, reviewable place. (source: S29.37 in the brief)
- The user can save an analysis as a template and rerun it on new data. (source: S29.40 in the brief)
- Artifacts are versioned objects with preview, compare, restore and reopen behaviour. (source: doc: docs/product/experience-contract.md:43-46)

**Acceptance criteria**

1. After two transformations the history lists both, in order, with a way to open each.
2. Revisiting step 1 shows the data as it was after step 1.
3. The assumptions place lists every assumption the analysis used and matches what the answer states.
4. A saved template reruns on a new file and produces the same steps.
5. A template run on a file with different columns fails with a clear message, not wrong numbers.
6. History and templates survive reopening the chat.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- History needs a stored record per step; code runs already carry code and output in tool calls, which could feed it [inferred from code-run route and tool-call cards].
- Templates overlap the skills system, which already stores reusable instructions [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Store each approved step with its code and a hash of the input.
- [proposed] Offer template save as a managed skill so it reuses existing sharing and versioning.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Brief items S29.25, S29.37, S29.40 | `knowledge-base/data/area-briefs/029-spreadsheet-and-data-analysis-workspace.md` | All three missing on every app. |
| component | CodeRunAgain (web) | `apps/web/features/chat/components/messages/CodeRunAgain.tsx` | Repeat one code run; nearest to rerun. |
| component | CodeRunAgain (mobile) | `apps/mobile/src/features/chat/components/CodeRunAgain.tsx` | Repeat one code run on the phone. |
| endpoint | code-runs route | `apps/web/app/api/chat/conversations/[id]/code-runs/route.ts` | Server endpoint that reruns code in a conversation. |
| service | mobile codeRun service | `apps/mobile/src/features/chat/services/codeRun.ts` | Mobile client call for Run again. |
| component | ToolCallTimeline | `apps/mobile/src/features/chat/components/ToolCallTimeline.tsx` | Mobile timeline of tool calls with code and Run again (lines 435-440, 493). |
| service | Code execution result parser | `packages/ui/unified-chat/src/lib/code-execution-result.ts` | Reads stdout, stderr, return code and images from tool calls. |
| service | Proposed change review (VS Code) | `apps/extension-vscode/src/features/permissions/proposedChangeReview.ts` | Review of proposed file changes in the editor; not sheet history. |
| config | Managed skill contracts | `packages/contracts/cloud-contracts/src/skills.ts` | Reusable skills; a possible home for templates (not wired for analysis). |
| other | Experience contract | `docs/product/experience-contract.md` | States artifact versioning and reopening rules. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person asks the assistant to repeat a code run. | device | apps/mobile/src/features/chat/components/CodeRunAgain.tsx:1-30 |
| The client posts to the conversation's code-runs endpoint. | our servers | apps/web/app/api/chat/conversations/[id]/code-runs/route.ts:44 |
| The code runs again in the sandbox and the result returns. | our servers | packages/contracts/cloud-contracts/src/chat-code-runs.ts (contract named by CodeRunAgain.tsx imports) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Tool-call code and output inside chat messages | Chat message records (table not read) | With the conversation [inferred] | With the conversation; rule not read |

**Models and providers.** The three planned features have no model path. Run again does not need a model: it reruns stored code [inferred from the route name and contract].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Run again needs a signed-in account. |
| Permissions | Run again checks tool approval policy on mobile (apps/mobile/src/features/chat/components/CodeRunAgain.tsx:14). |
| Subscription | none found in the code for history, assumptions or templates. |
| Limits and metering | Run again has a 300 second function limit (code-runs route.ts:44). |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | No history or templates in Local mode. Run again calls our servers, so it is Cloud only [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Feature absent | No control on any app. | brief S29.25, S29.37, S29.40 |
| Run again timeout | Mobile says the run took too long and may still finish on the server. | apps/mobile/src/features/chat/components/CodeRunAgain.tsx:20-21 |
| Offline or conflict for history | not handled in the code | no code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/chat/conversations/[id]/code-runs/route.test.ts`: The code-runs endpoint (file name and location; contents not read).
- `packages/ui/unified-chat/src/lib/code-execution-result.test.ts`: Parsing of code-execution results (name only; contents not read).

**Test scenarios**

- **Confirm no history list**
  1. Run two code analyses in one chat.
  2. Look for an ordered history control.
  - Expected: None exists.
- **Run again repeats code**
  1. Run code in a chat.
  2. Choose Run again.
  - Expected: The code runs again and a new output appears.
- **No template save**
  1. Look in chat and project menus for Save as template for an analysis.
  - Expected: Not present.

**Where to look when it fails**

- Mobile alert text for a failed re-run (CODE_RUN_FAILED in codeRun.ts).
- Server logs for the code-runs route.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No ordered transformation history** Affects: All six apps. Evidence: Brief S29.25. Work needed: Define a step record, store it, and add a list view.
- **No assumptions place** Affects: All six apps. Evidence: Brief S29.37. Work needed: Have analyses emit assumptions as structured data and show them.
- **No analysis templates** Affects: All six apps. Evidence: Brief S29.40. Work needed: Decide storage (skills or new table) and add save and rerun.
- **Failure and limits undefined** Affects: All. Evidence: No code. Work needed: Write requirements for mismatched columns and missing inputs.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F029-07
- F029-09
- SYS-agents-tools-and-automation
- SYS-connectors-plugins-and-skills
- SYS-memory-projects-and-context
- SYS-data-model-and-migrations
- SYS-sync-and-continuity
- mode:cloud
- surface:web
- surface:mobile

## Unknown

- Exact HTTP method of the code-runs route.
- Where code-run results are stored and for how long.
- Whether projects could hold templates: not read.
