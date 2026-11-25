---
id: "F029-09"
type: "feature"
title: "SQL and Python analysis"
aliases: ["SQL query panel (S29.26)", "Python analysis panel (S29.27)", "Query-result table (S29.28)", "Run code", "Code execution", "execute_code", "Code interpreter"]
area: "29 Spreadsheet and data-analysis workspace"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S29.26", "S29.27", "S29.28"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-chat-turn-pipeline", "SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-inference-providers", "SYS-model-catalog-and-routing", "mode:cloud", "surface:web", "surface:desktop", "surface:mobile", "provider:anthropic", "provider:openai", "provider:google", "F029-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F029-09 SQL and Python analysis

Run code lets the assistant analyse attached data with Python (or Node) in a sandbox on our servers, then shows code, output, images and saved files in chat. Tables and spreadsheet artifacts can be sorted by column. There is no SQL panel and no dedicated Python panel on any app.

Area: [29. Spreadsheet and data-analysis workspace](README.md). Requirement items: [S29.26](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2926), [S29.27](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2927), [S29.28](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2928).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Runs model-written code against attached data in a managed sandbox and returns text, charts and files; shows tabular results in a sortable grid (apps/web/lib/e2b/execution-tools.ts:71-86; packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx:80-93).

**Why it exists.** People want numbers computed, not guessed; the brief asks for a Python panel, SQL panel and sortable result table (briefs S29.26-S29.28).

**Who uses it.** Analysts, students and anyone with a data file who asks in plain words.

**Problems it solves**

- Models are poor at exact arithmetic over many rows.
- Charts and cleaned files need real code.
- Results must be readable and sortable.

**Use cases**

- Attach a CSV and ask for monthly totals plus a chart.
- Ask for a cleaned version of a file; the file is saved to chat.
- Sort a returned table by amount.
- Rerun a code block with Run again.

## 2. User experience

**Where to find it**

- Web: composer attachment menu item 'Run code' (packages/ui/unified-chat/src/components/AttachmentMenu.tsx:867); disabled with the hint "Code execution isn't available for this model or plan" when unavailable (AttachmentMenu.tsx:869-873). Web chat shows 'Run code' among active toggles (apps/web/features/chat/pages/WebChatPage.tsx:1927).
- Desktop: public Desktop shows the hosted web app (doc: AGENTS.md section 5). The item is omitted when a host has no code-execution transport, such as a local Tauri runtime (AttachmentMenu.tsx:861-865).
- Mobile: a 'Run code' chip with accessibility label 'Run code on' when active (apps/mobile/src/features/chat/components/ChatInput.tsx:598-603); tool-call timeline with code and Run again (apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:435-440).
- Chrome: no Run code toggle found; files from code runs can be saved from the side panel (apps/extension/src/features/side-panel/generatedFiles.ts:183-190). Brief marks Chrome missing for S29.27.
- CLI and VS Code: brief marks missing; the server does not turn on implicit code execution for the vscode and cli surfaces (request-processor.ts:928).

**Before you start**

- Cloud mode and a signed-in account [inferred from request-processor.ts:5196-5239].
- A model that supports code execution and tools (request-processor.ts:5936-5942).
- A stream-capable request: code execution needs streaming (request-processor.ts:5744-5747).
- Code execution allowed for the plan and not switched off (request-processor.ts:5236).

**Screens and controls**

- Run code toggle (web menu, mobile chip).
- Code and output cards in the message; web 'Run again' and 'Stop' buttons (apps/web/features/chat/components/messages/CodeRunAgain.tsx:18-19).
- Sortable spreadsheet artifact: column headers with aria-sort, sheet tabs labelled 'Worksheets' (SpreadsheetArtifact.tsx:47, 236-243).
- Mobile markdown tables: header buttons that sort, labelled with the column name and ', sorted ascending/descending' (MessageContentRenderer.tsx:504).

**Journey**

1. 1. Attach a data file and turn Run code on, or phrase the request with an analysis verb (the server can turn it on, request-processor.ts:1002-1014).
2. 2. Send the message.
3. 3. The assistant calls execute_code; the sandbox runs the code with the file staged.
4. 4. Code, output text and images appear in the message (code-execution-result.ts:1-40).
5. 5. Files the code wrote (up to 8) are saved as chat files (apps/web/lib/e2b/generated-files.ts:16).
6. 6. Tap a column header to sort a returned table; choose Run again to repeat a run.

**What the person sees and gets**

- Stdout, stderr, return code, inline images (png, jpeg, gif, webp only; others are refused) (packages/ui/unified-chat/src/lib/code-execution-result.ts:21-32).
- Saved output files with a download.
- Notice when code could not run (execution-tools.ts:248-258).
- Table truncation note: 'Showing first 500 of N rows. Download the CSV for the rest' (SpreadsheetArtifact.tsx:330, tabular.ts:78).

**Settings**

- Per-project default 'Run code' (apps/web/features/projects/components/ProjectChatDefaultsField.tsx:35).
- Agent config option 'Run code and analyse files in a sandbox' (apps/web/features/agents/components/AgentConfigForm.tsx:566).
- Tool approvals menu controls whether tools run (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1894).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Model-agnostic sandbox tools execute_code, write_file, read_file, list_files, edit_file, create_folder run in a managed sandbox for any provider when sandbox execution is ready (apps/web/lib/e2b/execution-tools.ts:15-60, 254-268).
- Provider-native code tools are used when the sandbox is not ready: Anthropic code execution, Google code execution, OpenAI code interpreter (execution-tools.ts:213-230).
- Provider-made files are fetched and stored: OpenAI container citations and Anthropic code-execution outputs (apps/web/lib/server/container-files.ts:135-168, 170-230).
- Sandbox-written files are stored as chat files with origin e2b-execution (apps/web/lib/e2b/generated-files.ts:149-156).
- Sortable grid with 500-row cap on web and shared UI (packages/ui/unified-chat/src/lib/tabular.ts:78-95).
- Sortable markdown tables on mobile (apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:311-326).

**Incomplete**

- The user draft said Python output files are saved at container-files.ts:161; that line is only part of the citation finder. Saving happens in persistGeneratedFile (container-files.ts:170-230).
- The brief says Mobile is missing for S29.28, but mobile markdown tables do sort, so the brief understates mobile for chat tables; it is still not a query-result panel.
- Container-file MIME list has no pptx entry, so a pptx falls back to the provider's content type (container-files.ts:28-42).
- No single panel shows code, output and charts together; they are separate message parts [inferred].

**Present but disconnected or switched off**

- Sandbox execution is off unless AGI_E2B_EXECUTION or a sandbox key is set, and cutover requires AGI_E2B_EXECUTION=1 (apps/web/lib/e2b/gate.ts:6-24).
- Free-offering requests must send code_execution false (packages/contracts/cloud-contracts/src/free-quota.ts:125).
- Audit register: Mounted spreadsheet viewer partial-unwired on Desktop (doc: audit/registers/capability-gaps.csv, CAP-029).

**Not available**

- SQL panel (S29.26): all six apps; searches for SQL panel or engine code found only unrelated connector naming.
- Dedicated Python panel: Chrome (brief), CLI, VS Code.
- Query-result table: Mobile (brief), CLI, VS Code, Chrome.

## 4. Required behaviour

**Established requirements**

- A panel lets the user write and run SQL against a dataset or connected source. (source: S29.26 in the brief)
- A panel lets the user run Python analysis on data and see code, output and charts. (source: S29.27 in the brief)
- Results of a query or analysis appear in a sortable result table. (source: S29.28 in the brief)
- Code execution depends on a provider route or an AGI harness, not on the model alone. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. With Run code on and a CSV attached, the reply shows the code, its output and any chart.
2. A file the code writes appears as a downloadable chat file.
3. Clicking a spreadsheet column header sorts ascending, then descending, then original order.
4. A table over 500 rows says it shows the first 500.
5. With Run code unavailable, the menu item is disabled with a reason and the reply says code could not run.
6. Run code is refused for a Free-offering request.
7. A SQL panel, once built, runs a query and shows a sortable result table.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Hidden execution limits must be shown to the person: the code-runs route stops at 300 seconds (code-runs route.ts:44).
- Local mode should say plainly that code runs on our servers [inferred from SYS-execution-boundaries].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a SQL panel backed by a read-only engine in the same sandbox.
- [proposed] Show code, output and charts as one panel on every app.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | E2B execution tools | `apps/web/lib/e2b/execution-tools.ts` | Tool schemas, routing and provider-native fallback. |
| config | Execution gate | `apps/web/lib/e2b/gate.ts` | Switches for sandbox execution. |
| service | Attachment staging | `apps/web/lib/e2b/attachment-staging.ts` | Copies attached files into the sandbox. |
| service | Sandbox generated files | `apps/web/lib/e2b/generated-files.ts` | Finds files the code wrote and stores up to 8 per turn. |
| service | Container files | `apps/web/lib/server/container-files.ts` | Fetches provider-made files (OpenAI container, Anthropic files) and stores them. |
| service | persistGeneratedFileBytes | `apps/web/lib/server/generated-file-persist.ts` | Stores bytes (20 MB cap) and inserts a media_assets row. |
| service | Compute metering | `apps/web/lib/e2b/compute-metering.ts` | Prices and meters sandbox use. |
| service | Chat route request processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Implicit intent (1002-1014), capability gate (5196-5239), sandbox tool selection (5936-5947). |
| service | Tool loop | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs execute_code and related tools during a turn. |
| endpoint | code-runs route | `apps/web/app/api/chat/conversations/[id]/code-runs/route.ts` | Run again for a code block (300 second limit). |
| component | Run code menu item | `packages/ui/unified-chat/src/components/AttachmentMenu.tsx` | Toggle with disabled reason. |
| component | CodeRunAgain (web) | `apps/web/features/chat/components/messages/CodeRunAgain.tsx` | Run again and Stop buttons. |
| component | SpreadsheetArtifact | `packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx` | Sortable grid, sheet tabs, 500-row cap. |
| service | tabular helpers | `packages/ui/unified-chat/src/lib/tabular.ts` | Parse, sort, CSV and spreadsheet-safe export. |
| service | Execution result parser | `packages/ui/unified-chat/src/lib/code-execution-result.ts` | Reads stdout, stderr, images from tool calls; whitelists image types. |
| component | Mobile Run code chip | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Shows 'Run code' when active (lines 598-603). |
| store | Mobile chat execution store | `apps/mobile/stores/chat/chatExecutionStore.ts` | Decides whether a mobile turn requests Run code (lines 3270-3282). |
| component | Mobile table with sort | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | MarkdownTable with column sort and copy (lines 311-326, 411-520). |
| component | Mobile ToolCallTimeline | `apps/mobile/src/features/chat/components/ToolCallTimeline.tsx` | Shows code and Run again on the phone. |
| config | Plan limits | `packages/contracts/types/src/billing-catalog.ts` | getPlanMaxSandboxes (line 801) caps sandboxes per plan. |
| config | Free-offering schema | `packages/contracts/cloud-contracts/src/free-quota.ts` | Forces code_execution false on free offering requests (line 125). |
| table | media_assets | `apps/web/lib/server/media-assets.ts` | Rows for stored generated files (insert at line 75). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person turns on Run code or the server infers it from the wording. | device | packages/ui/unified-chat/src/components/AttachmentMenu.tsx:867; request-processor.ts:1002-1014 |
| The route checks capability, kill switch, stream and model support, then offers sandbox tools. | our servers | request-processor.ts:5236, 5744-5747, 5936-5947 |
| Attached files are staged into the sandbox. | our servers | apps/web/lib/e2b/attachment-staging.ts:1-30 |
| The model calls execute_code; the code runs in the managed sandbox. | outside service | apps/web/lib/e2b/execution-tools.ts:1-6 (E2B sandbox) and tool-loop.ts:2571 |
| Provider-native path: the provider runs the code and returns file citations; the server downloads them with a 30 second timeout. | outside service | apps/web/lib/server/container-files.ts:59-61, 70-96 |
| New sandbox files are stored and a media_assets row is written. | our servers | apps/web/lib/e2b/generated-files.ts:149-156; generated-file-persist.ts:217-262 |
| Text, images and files stream to the app; the person sorts tables locally. | device | packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx:80-93 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Generated files from code runs | Generated-media storage plus table media_assets (and file_lineage) | Stored per user on our servers; reachable from any signed-in app [inferred] | 20 MB per file cap (generated-file-persist.ts:17); retention not read, unknown |
| Code and output of runs | Inside chat messages as tool calls | With the conversation [inferred] | With the conversation; not read |

**Models and providers.** The sandbox tools work with any tool-capable model from any provider (execution-tools.ts:254-268). Without the sandbox, native tools are used only for the Anthropic, Google and OpenAI providers (execution-tools.ts:213-230); other providers get none and the turn is told code is unavailable. Container file fetch uses server-held keys from environment names OPENAI_API_KEY and ANTHROPIC_API_KEY (container-files.ts:74, 99).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; file owner required (tool-loop.ts:2566 for Office; sandbox path is per user). |
| Permissions | Tool approval policy can require approval to run code (request-processor.ts:5736-5750). Capability canUseCloudExecution and a kill switch apply (request-processor.ts:5236). |
| Subscription | Plan limits on sandbox count (billing-catalog.ts:801-806) and sandbox time-to-live (billing-catalog.ts:808-810); the menu says unavailable 'for this model or plan' (AttachmentMenu.tsx:869-873). Exact plan names not read. |
| Limits and metering | Sandbox compute metered (compute-metering.ts); output capped at a byte limit with a truncation note (execution-tools.ts:279-282); 8 saved files per turn (generated-files.ts:16); 20 MB per file (generated-file-persist.ts:17); 500 rows shown in the grid (tabular.ts:78); read_file limit 200,000 bytes (execution-tools.ts:34). |
| Feature flags | AGI_E2B_EXECUTION and E2B_API_KEY (gate.ts:6-8); managed compute private-beta gate (gate.ts:32-36). |
| Model compatibility | Needs tool support for sandbox tools; needs the codeExecution capability for provider-native tools (request-processor.ts:5936-5942). Free-trial path rejects models without code execution (request-processor.ts:4383). |
| Provider restrictions | Provider-native fallback exists only for anthropic, google, openai (execution-tools.ts:213-230); file fetch only for openai and anthropic (container-files.ts:185-193). |
| Local mode | Code execution is not a local capability: it runs on our servers or at the provider. The menu item is omitted when the host has no code-execution transport, such as a local Tauri runtime (AttachmentMenu.tsx:861-865). Whether Desktop or Mobile local-inference turns can run code locally: unknown, no local sandbox code found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web shows a spinner labelled with a running label while Run again runs. | apps/web/features/chat/components/messages/CodeRunAgain.tsx:126 |
| Cancel | A Stop button exists for Run again on web. | CodeRunAgain.tsx:19 |
| Timeout | Provider file fetch fails after 30 seconds with a named error; mobile Run again says the run took too long and may still finish. | container-files.ts:59-68; apps/mobile/src/features/chat/components/CodeRunAgain.tsx:20-21 |
| Sandbox unavailable | The turn tells the person code could not run rather than silently dropping it. | apps/web/lib/e2b/execution-tools.ts:248-258 |
| Storage not configured or file fetch fails | The file is skipped; failures are counted so the reply can note them. | container-files.ts:179, 223-229, 232-259 |
| Too large file | Skipped with a warning. | generated-file-persist.ts:242-248 |
| Non-streaming request | Rejected with code code_execution_stream_required. | request-processor.ts:5744-5747 |
| Unsafe image | Only png, jpeg, gif and webp base64 images are shown. | packages/ui/unified-chat/src/lib/code-execution-result.ts:21-32 |
| Empty table / single row | Mobile marks sortable only when the body has more than one row. | MessageContentRenderer.tsx:415 |
| Accessibility | aria-sort on sheet headers; button labels with sorted state on mobile. | SpreadsheetArtifact.tsx:242-244; MessageContentRenderer.tsx:504-510 |
| Offline / reconnect | not handled in the code read | none found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/container-files.test.ts`: Fetch and persist of OpenAI and Anthropic files, null on missing storage or fetch failure, counting failures, finding citations at any depth.
- `packages/ui/unified-chat/src/lib/tabularSort.test.ts`: Sort cycle, numeric and text order, empty cells last, 500-row cap.
- `packages/ui/unified-chat/src/lib/__tests__/tabular.test.ts`: Tabular parsing helpers (name only; contents not read).
- `packages/ui/unified-chat/src/lib/code-execution-result.test.ts`: Result parsing (name only; contents not read).
- `apps/mobile/src/features/chat/components/__tests__/MarkdownTableActions.test.tsx`: Mobile table copy, CSV, sort on plain text, numbers, empty cells last.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/TabularGridView.test.tsx`: Mobile tabular grid viewer (name only).
- `apps/web/app/api/chat/conversations/[id]/code-runs/route.test.ts`: Run again endpoint (contents not read).
- `apps/web/lib/e2b/__tests__`: Sandbox tests folder; per-file coverage unknown.

**Test scenarios**

- **Python on an attached CSV**
  1. Sign in on web with a plan that allows code execution.
  2. Attach a CSV, turn Run code on.
  3. Ask for totals by month with a chart.
  - Expected: Code, output text and a chart image appear; no error banner.
- **Saved output file**
  1. Ask the assistant to write a cleaned copy as a CSV.
  - Expected: A file card appears with a download; a media_assets row exists.
- **Sort a result**
  1. Open a spreadsheet artifact.
  2. Click a numeric header twice, then a third time.
  - Expected: Ascending, descending, then original order; empty cells last.
- **Unavailable model**
  1. Choose a model without code execution.
  2. Open the attachment menu.
  - Expected: Run code disabled with the stated hint.
- **Mobile Run again**
  1. Run code on the phone.
  2. Open the tool timeline and tap Run again.
  - Expected: A fresh result appears, or the timeout message shows.
- **No SQL panel**
  1. Search each app for a SQL panel.
  - Expected: None exists.

**Where to look when it fails**

- Log 'Failed to persist provider-generated file; skipping' (container-files.ts:224).
- Error text 'OpenAI container file fetch failed (HTTP n)' or 'did not answer within 30000ms'.
- Error code code_execution_stream_required; code office-style capability errors.
- Tables media_assets and file_lineage.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/web/029-spreadsheet-and-data-analysis-workspace.md)
- Desktop: [70-qa/test-plans/desktop/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/desktop/029-spreadsheet-and-data-analysis-workspace.md)
- Mobile: [70-qa/test-plans/mobile/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/mobile/029-spreadsheet-and-data-analysis-workspace.md)

## 10. Gaps and dependencies

- **No SQL panel** Affects: All six apps. Evidence: Brief S29.26; searches found no SQL engine. Work needed: Choose a query engine and build a panel with sortable results.
- **No single Python panel showing code, output and charts together** Affects: Web, Desktop, Mobile, Chrome, CLI, VS Code. Evidence: Brief S29.27 plus code read. Work needed: Compose existing cards into one panel.
- **Chrome, CLI and VS Code cannot run analysis code** Affects: Chrome, CLI, VS Code. Evidence: Brief; request-processor.ts:928 excludes vscode and cli from implicit execution. Work needed: Decide whether those surfaces offer Run code and expose it.
- **Mobile has no query-result table (chat tables only)** Affects: Mobile. Evidence: Brief S29.28; MessageContentRenderer.tsx:311. Work needed: Confirm requirement and extend.
- **Local-mode behaviour undefined** Affects: Desktop and Mobile local inference. Evidence: No local sandbox found. Work needed: State clearly in the product that code runs in Cloud, or build a local runner.
- **Brief code pointers are stale** Affects: Documentation. Evidence: chat-attachment-hydration.ts:466 is an attachment function, container-files.ts:196 is a mime step. Work needed: Update the brief.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-chat-turn-pipeline
- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-inference-providers
- SYS-model-catalog-and-routing
- mode:cloud
- surface:web
- surface:desktop
- surface:mobile
- provider:anthropic
- provider:openai
- provider:google
- F029-12

## Unknown

- Whether Desktop (Tauri internal build) can run code locally.
- Which plans allow Run code (plan table not opened).
- Retention of sandbox files and sandbox state.
- Whether Chrome sends code_execution explicitly: no send found in apps/extension/src.
- What each test in apps/web/lib/e2b/__tests__ covers.
