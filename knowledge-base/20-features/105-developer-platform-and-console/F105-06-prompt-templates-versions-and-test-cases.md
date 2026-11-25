---
id: "F105-06"
type: "feature"
title: "Prompt templates, versions and test cases"
aliases: ["Prompts and evaluations", "Prompt templates", "Prompt versions", "Test cases", "Evaluation runs", "Per-case results", "Custom commands", "Custom prompts", "S105.12", "S105.13", "S105.14", "S105.15", "S105.16"]
area: "105 Developer platform and console"
available_on: ["web", "desktop", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "n/a", cli: "partial", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S105.12", "S105.13", "S105.14", "S105.15", "S105.16"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "api:POST /api/llm/v1/chat/completions", "table:developer_prompts", "table:developer_prompt_versions", "table:developer_eval_cases", "table:developer_eval_runs", "table:developer_eval_results", "table:developer_eval_run_cases", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-data-model-and-migrations", "SYS-sync-and-continuity", "SYS-subscriptions-entitlements-and-usage", "F105-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F105-06 Prompt templates, versions and test cases

The web console card 'Prompts and evaluations' stores prompts as versioned templates with {{variable}} slots, lets a developer compare versions and save an old one as the newest, builds test cases by hand or CSV, runs a version over all cases through the gateway, and shows pass, fail, diffs and 1 to 5 grades. Separate custom commands cover reusable prompts in web settings and the CLI.

Area: [105. Developer platform and console](README.md). Requirement items: [S105.12](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10512), [S105.13](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10513), [S105.14](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10514), [S105.15](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10515), [S105.16](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10516).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Part A, console prompts: a signed-in developer creates a named prompt, saves versions (system prompt, template, model, max_tokens, temperature, note), adds up to 500 test cases, runs a chosen version across them with a check, and reads per-case output, latency, tokens and a diff against the expected text. Part B, custom commands: the web 'Custom commands' settings list and the CLI markdown commands are the reusable prompt templates with arguments that the brief item S105.12 points at (apps/web/features/settings/components/CustomCommandsSettings.tsx; apps/cli/src/custom_commands.rs).

**Why it exists.** The console could send one request and nothing more; developers had nowhere to keep a prompt, compare two versions or check a change against known cases (apps/web/db/neon/0371_developer_prompts_and_evals.sql:4-11 header).

**Who uses it.** Developers on the web app who tune prompts; CLI and web users who want slash commands.

**Problems it solves**

- Losing earlier prompt wording.
- Not knowing whether a prompt change helps or breaks known cases.
- Retyping the same prompt with different inputs.

**Use cases**

- Version a classifier prompt and compare version 2 with the latest.
- Import 50 cases from a CSV and run all of them against a version.
- Roll back by loading an old version and saving it as the next version.
- Create a /summarize custom command in web settings, or a markdown command in the CLI that takes $ARGUMENTS.

## 2. User experience

**Where to find it**

- Web console: /developers card 'Prompts and evaluations' (apps/web/features/developers/components/PromptsPanel.tsx:452; mounted at DeveloperConsolePage.tsx:71).
- Web settings: General section, heading 'Custom commands' (apps/web/features/settings/sections/GeneralSection.tsx:333-337); synced under the account preference namespace custom_commands (apps/web/features/settings/lib/custom-commands-namespace.ts:3).
- Web chat: slash menu uses custom commands (features/chat/components/Composer/SlashCommandMenu.tsx; usage not traced).
- CLI: slash commands from markdown files in .agiworkforce/commands, ~/.agiworkforce/commands and Claude-compatible folders, with $ARGUMENTS and $1 to $9 (apps/cli/src/custom_commands.rs:1-9, 95-140); shown as prompts commands in the registry (apps/cli/src/command_registry.rs:27-43).
- Desktop: brief says done for S105.12 and partial for versions and evaluations; same hosted pages expected [inferred from doc: AGENTS.md section 5]; not opened.
- Mobile, VS Code, Chrome: none found.

**Before you start**

- Signed in on the web. Prompt routes have no plan check (apps/web/lib/developers/prompt-route.ts; none found in the code). Runs call the chat gateway with the session, so the gateway's plan rules and credits apply (PromptsPanel.tsx description 'Runs go through the gateway like any API call and use your plan').
- Migration 0408 (frozen run cases) must be applied for runs to start; its header says it was not yet applied when written (apps/web/db/neon/0408_developer_eval_run_cases.sql:3-4) while the service code writes to its table (developer-prompt-service.ts:384-410). Applied state: unknown.

**Screens and controls**

- 'New prompt' field and button 'Create'; select 'Prompt' listing '<name> · v<n> · <n> cases' (PromptsPanel.tsx:467-520).
- Editor: 'System prompt', 'User message template', 'Model' (default auto), 'max_tokens', 'temperature', 'What changed (optional)', button 'Save as version <n>' (disabled when nothing changed or template empty) (PromptsPanel.tsx:225-322).
- 'Versions' list with buttons 'Compare with latest' and 'Load' (aria 'Load version <n> into the editor') and a diff block 'Changes from version <a> to <b>' (PromptsPanel.tsx:331-380, 113).
- 'Delete prompt' with confirm 'Delete <name>?' / 'Delete prompt' (PromptsPanel.tsx:201-206, 394).
- 'Test cases · n of 500', 'Import CSV', form 'New test case' with one field per variable and 'Expected output (optional)' and 'Add case', per-case 'Delete' with confirm 'Delete this test case?' / 'Delete case' (PromptEvaluations.tsx:393-406, 120-160).
- Run controls 'Version', 'Check' (contains, exact, none), button 'Run all cases' or 'Running <done> of <total>' (PromptEvaluations.tsx:489).
- 'Run results' with Pass, Fail, Error or Not checked, latency, output tokens, 'Grade' select '1 of 5' to '5 of 5', expandable Output and 'Expected, with the difference' or 'Input sent'; 'Earlier runs' list (PromptEvaluations.tsx:117-190 region).

**Journey**

1. Type a prompt name and choose Create (starts with template {{input}}, model auto).
2. Edit the template using {{variable}} names, choose a model and parameters, add a note, choose 'Save as version n'.
3. Add cases: fill one field per variable, or Import CSV (one column per variable, optional 'expected' column).
4. Pick the version and the check; choose 'Run all cases'.
5. Watch 'Running x of y'; open a result to see output and diff; set a grade.
6. Open an earlier run from 'Earlier runs' to compare outcomes.
7. To go back, choose 'Load' on an old version and save it as the next version.

**What the person sees and gets**

- Verdict per case: Pass, Fail, Error, Not checked (PromptEvaluations.tsx:174 region).
- Count '<n> passed' summary line.
- Line diff with '+ ' and '- ' prefixes for added and removed lines (PromptsPanel.tsx:128-133; text-diff.ts).
- Errors as text with role alert; 'Try again' on load failure (PromptsPanel.tsx:489-498).

**Settings**

- Limits: prompt name 120, note 300, system prompt and template 32000, up to 500 cases, 200 items per list (migration 0371; developer-console.ts:42-43; developer-prompt-service.ts:24).
- Run concurrency 3 in the browser (PromptEvaluations.tsx:RUN_CONCURRENCY).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Prompt CRUD, append-only versions, cases, runs and results routes exist with CSRF and the developer-console rate limit (apps/web/lib/developers/prompt-route.ts:27-39; route files under apps/web/app/api/developers/prompts).
- Version save refuses when another save just finished and validates the model against the catalog or 'auto' (developer-prompt-service.ts:73-80, 166).
- Versions can be compared with the latest and an old version can be loaded and saved as the newest (PromptsPanel.tsx:331-380). This answers the draft doubt: compare and roll back are present.
- Cases by hand and CSV with name checks and the 500 cap (cases-csv.ts:1-78; developer-prompt-service.ts:282-300).
- A run is admitted in a transaction that freezes its cases and expected outputs (developer-prompt-service.ts:384-424) and results are graded against the frozen expectation with exact or contains matching after whitespace normalisation and case folding for contains (packages/contracts/cloud-contracts/src/developer-console.ts:181-193).
- Each case is sent from the browser to the chat gateway, three at a time, and its result is recorded; failures are recorded as error results (PromptEvaluations.tsx:293-360).
- Grades 1 to 5 saved per result (developer-prompt-service.ts:563-578).
- Custom commands: web settings dialog and sync to account, and CLI markdown commands with argument expansion and name-collision rules (custom_commands.rs:95-140; CloudSettingsSync.tsx:205-215).

**Incomplete**

- The run is driven by the open browser tab; closing the tab stops the loop and leaves a run with fewer results than cases [inferred from PromptEvaluations.tsx:293-360; no server-side runner found].
- Saved console prompts cannot be invoked from the API, chat or CLI; no route or command that renders a saved console prompt by id was found [inferred].
- Rollback is a load plus a new version, not a one-click restore (PromptsPanel.tsx:365-373).
- Web custom commands use a single {{input}} token (CustomCommandsSettings.tsx:27) and the CLI uses $ARGUMENTS and $1 to $9; the two syntaxes differ.
- CLI has no prompt versions (brief: cli missing).

**Present but disconnected or switched off**

- Migration 0408 states 'NOT YET APPLIED : draft only' yet the code depends on it (0408 header lines 3-4 versus developer-prompt-service.ts:384-410); runs may fail if it is not applied (unknown).

**Not available**

- Server-side or scheduled evaluation runs.
- Scores beyond pass or fail and a manual 1 to 5 grade.
- Mobile, VS Code and Chrome extension prompt libraries: none found.

## 4. Required behaviour

**Established requirements**

- Developers can save reusable prompt templates with arguments and invoke them (S105.12). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.12)
- Prompt templates keep versions that can be compared and rolled back (S105.13). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.13)
- Developers can build evaluation datasets, run them against a model and prompt, and see per-case results with scores and diffs (S105.14 to S105.16). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.14, S105.16)
- Versions are append-only; each save is the next number and an old one can be saved again as the newest. (source: apps/web/db/neon/0371_developer_prompts_and_evals.sql:12-18)
- A run costs what its gateway calls cost, and everything belongs to one account. (source: apps/web/db/neon/0371_developer_prompts_and_evals.sql:21-23)
- Deleting a prompt deletes its versions, cases, runs and grades and cannot be recovered. (source: apps/web/features/developers/components/PromptsPanel.tsx:201-206)
- Deleting a case asks first; recorded results keep their output. (source: apps/web/features/developers/components/PromptEvaluations.tsx (removeCase confirm); test PromptEvaluations.test.tsx line 235)

**Acceptance criteria**

1. A new prompt starts at version 1 with template {{input}} and model auto.
2. Save as version is disabled until the draft differs from the latest version and the template is not empty.
3. Compare with latest shows added and removed lines for system prompt, template, and model and parameters.
4. CSV with a header of variable names and an 'expected' column creates one case per row; a header name that is not a valid variable name is refused; over 500 cases is refused.
5. A run needs at least one case ('Add at least one test case first.') and shows 'Running x of y' while in progress.
6. A case whose gateway call fails is recorded as Error, not dropped.
7. Cases changed after a run started do not change that run's expected output or verdict.
8. Grades 1 to 5 persist after reloading the run.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Argument handling for CLI commands is verified in code and unit tests (custom_commands.rs tests at 408-444), unlike the draft's 'not verified'.
- The console prompts and custom commands are two unrelated stores [inferred: different tables, files and syntax].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Run evaluations on the server so closing the tab does not stop them.
- [proposed] Let API callers or custom commands use a saved console prompt version.
- [proposed] Add one-click restore and side-by-side run comparison.
- [proposed] Unify template syntax between web custom commands and the CLI.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | PromptsPanel | `apps/web/features/developers/components/PromptsPanel.tsx` | Prompt list, editor, versions, compare, load, delete. |
| component | PromptEvaluations | `apps/web/features/developers/components/PromptEvaluations.tsx` | Cases, CSV import, runs, results, grades, earlier runs. |
| service | prompts-client | `apps/web/features/developers/lib/prompts-client.ts` | Browser API client for prompts, versions, cases, runs, results. |
| service | run-completion | `apps/web/features/developers/lib/run-completion.ts` | Sends one non-streaming completion per case to the gateway. |
| service | cases-csv | `apps/web/features/developers/lib/cases-csv.ts` | CSV parser and validation. |
| service | text-diff | `apps/web/features/developers/lib/text-diff.ts` | Line diff used for versions and expected text. |
| config | developer console contracts | `packages/contracts/cloud-contracts/src/developer-console.ts` | Schemas, limits, promptTemplateVariables (line 164), renderPromptTemplate (172), evalCheckPasses (181). |
| endpoint | GET/POST /api/developers/prompts | `apps/web/app/api/developers/prompts/route.ts` | List and create prompts. |
| endpoint | /api/developers/prompts/[promptId] | `apps/web/app/api/developers/prompts/[promptId]/route.ts` | Read, rename, delete a prompt. |
| endpoint | GET/POST /api/developers/prompts/[promptId]/versions | `apps/web/app/api/developers/prompts/[promptId]/versions/route.ts` | List and save versions. |
| endpoint | GET/POST /api/developers/prompts/[promptId]/cases | `apps/web/app/api/developers/prompts/[promptId]/cases/route.ts` | List and add cases. |
| endpoint | PATCH/DELETE /api/developers/prompts/[promptId]/cases/[caseId] | `apps/web/app/api/developers/prompts/[promptId]/cases/[caseId]/route.ts` | Update or delete a case. |
| endpoint | GET/POST /api/developers/prompts/[promptId]/runs | `apps/web/app/api/developers/prompts/[promptId]/runs/route.ts` | List run summaries; admit a run. |
| endpoint | /api/developers/prompts/[promptId]/runs/[runId]/results | `apps/web/app/api/developers/prompts/[promptId]/runs/[runId]/results/route.ts` | Record a result; grading route sits beside it. |
| service | developer-prompt-service | `apps/web/lib/services/developer-prompt-service.ts` | All SQL and rules for prompts, cases, runs, results. |
| service | prompt-route helpers | `apps/web/lib/developers/prompt-route.ts` | CSRF, rate limit, id and body parsing for prompt routes. |
| table | developer_prompts, developer_prompt_versions, developer_eval_cases, developer_eval_runs, developer_eval_results | `apps/web/db/neon/0371_developer_prompts_and_evals.sql` | Storage with row-level security by owner. |
| table | developer_eval_run_cases | `apps/web/db/neon/0408_developer_eval_run_cases.sql` | Frozen cases and expectations per run (applied state unknown). |
| component | CustomCommandsSettings | `apps/web/features/settings/components/CustomCommandsSettings.tsx` | Web editor for custom slash commands with {{input}}. |
| service | custom commands sync | `apps/web/features/settings/lib/custom-commands-namespace.ts` | Account namespace custom_commands, merge rules; used by CloudSettingsSync.tsx. |
| service | CLI custom commands | `apps/cli/src/custom_commands.rs` | Discover markdown commands and expand $ARGUMENTS and $1-$9. |
| service | CLI command registry | `apps/cli/src/command_registry.rs` | Adds custom prompts as 'prompts:' commands with argument hints (lines 27-43, 70-90). |
| test | PromptEvaluations test | `apps/web/features/developers/__tests__/PromptEvaluations.test.tsx` | Run flow, stale case list, frozen expectation, error results, delete confirm. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person saves a version; browser posts it to the versions route. | device and our servers | PromptsPanel.tsx:166-175; prompts-client.ts |
| Server validates the model, takes the next number and stores the version; a concurrent save returns a conflict message. | our servers | developer-prompt-service.ts:73-80, 160-200 |
| Person starts a run; server checks the version and cases, stores the run and freezes the cases in one transaction. | our servers | developer-prompt-service.ts:384-424 |
| Browser renders each template with the case variables and sends it to the chat gateway, three at a time. | device and our servers | PromptEvaluations.tsx:293-360; run-completion.ts:27-60 |
| Gateway routes each call to a model and provider chosen for the version's model or 'auto'. | outside service | SYS-chat-turn-pipeline, SYS-inference-providers (not traced here) |
| Browser records each output or error; server grades against the frozen expected output and stores the verdict. | our servers | developer-prompt-service.ts:516-561 |
| Person grades or opens earlier runs; server returns stored results. | our servers | developer-prompt-service.ts:563-578; PromptEvaluations.tsx:380 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Prompts, versions, cases, runs, results, grades, rendered inputs and outputs | Neon tables listed under implementation_map | Server only; browser keeps working copies in state. | Deleting a prompt cascades to versions, cases, runs and results (0371 foreign keys with on delete cascade). Deleting a case sets result case_id to null. |
| Custom commands (web) | Local browser store plus the account preference namespace custom_commands | Merged between device and account by CloudSettingsSync. | Owner-tagged to avoid cross-account leaks (custom-commands-namespace.ts:52-62). |
| CLI custom commands | Markdown files on the device | Not synced by this code. | User managed files. |

**Models and providers.** Each version stores a model id or 'auto'; the gateway resolves it per plan and policy; prompts are not tied to one provider (SYS-model-catalog-and-routing).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in web account for console prompts; custom commands work signed out locally and sync when signed in [inferred from CloudSettingsSync hydrate logic]. |
| Permissions | Owner only through row-level security; no workspace roles found. |
| Subscription | No plan check in prompt routes (none found in the code). Runs consume credits through the gateway under the plan's rules. |
| Limits and metering | 500 cases per prompt, 200 list items, 3 parallel calls, developer-console rate limit 60 per minute and developer-console-write 20 per minute applied to prompt routes (prompt-route.ts:27-39; rate-limit.ts:701-710) [inferred that writes use the write limit; the helper applies developer-console only]. Each case costs a gateway call. |
| Feature flags | none found in the code. |
| Model compatibility | Model must be in the catalog or 'auto' (developer-prompt-service.ts:73-80). |
| Provider restrictions | none found in the code. |
| Local mode | none found in the code for console prompts. [inferred] They call the managed gateway only. CLI custom commands run in the CLI with whatever mode the CLI is in; mode handling not traced. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading prompts…' and 'Loading cases…'. | PromptsPanel.tsx:500-507; PromptEvaluations.tsx cases loading |
| Empty | 'No prompts yet. Name one above to start.'; a prompt with no cases shows no case list and run needs one. | PromptsPanel.tsx:537; developer-prompt-service.ts:398 |
| Running | Button text 'Running <done> of <total>'. | PromptEvaluations.tsx:489 |
| Run start failure | 'The run could not be started.' or the server message. | PromptEvaluations.tsx:293-310 |
| Gateway failure for one case | Recorded as Error with the message, up to 2000 characters. | PromptEvaluations.tsx:340-352; test line 215 |
| Stale tab | Run uses the cases the server admitted, not the tab's list. | PromptEvaluations.tsx:300-312; test line 132 |
| Draft typed during a save | Typed text is kept. | PromptsPanel.custody.test.tsx line 84 |
| Concurrent version save | Conflict 'Another save of this prompt just finished. Try again.' | developer-prompt-service.ts:166 |
| Duplicate result | Conflict 'This case already has a result in this run.' | developer-prompt-service.ts:556 |
| Tab closed or offline mid-run | not handled in the code; remaining cases are never sent [inferred]. | PromptEvaluations.tsx:293-360 |
| Cancel run | not handled in the code (no stop control found). | PromptEvaluations.tsx:489 region |
| Accessibility | Labelled fields, aria-expanded on results, aria-labels on Delete case and Load version, role alert on errors. | PromptsPanel.tsx:368; PromptEvaluations.tsx result row |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/developers/__tests__/PromptEvaluations.test.tsx`: Run through the gateway with variables and record each result, stale case list, frozen expectation display, gateway failure recorded, delete case confirm.
- `apps/web/features/developers/__tests__/PromptsPanel.custody.test.tsx`: Draft kept during save, editor reset after save, late case count, unsaved case kept.
- `apps/web/features/developers/__tests__/prompt-eval-helpers.test.ts`: Template variables and rendering, exact and contains checks, CSV parsing, line diff.
- `apps/web/lib/services/__tests__/developer-prompt-service.test.ts`: Prompt service rules (by name; contents not read).
- `apps/web/app/api/developers/prompts/[promptId]/runs/route.test.ts`: List after owner check, POST through CSRF write path, unsupported check refused, write refusal.
- `apps/web/app/api/developers/prompts/route.test.ts`: Prompt list and create routes (by name; contents not read).
- `apps/web/db/neon/developer-prompts-and-evals-migration.test.ts`: Migration 0371 shape (by name; contents not read).
- `apps/web/db/neon/developer-eval-run-cases-migration.test.ts`: Migration 0408 shape (by name; contents not read).
- `apps/web/features/settings/components/CustomCommandsSettings.test.tsx`: Web custom commands editor (by name; contents not read).
- `apps/cli/src/custom_commands.rs`: Rust unit tests for command parsing and argument expansion (lines 408-444).

**Test scenarios**

- **Version and compare**
  1. Create a prompt; change the template; Save as version 2; Save again after another change as version 3.
  2. Choose 'Compare with latest' on version 1.
  - Expected: Diff of system prompt, template and model lines.
- **CSV import**
  1. Create a template with {{topic}}.
  2. Import a CSV with columns topic and expected.
  - Expected: One case per row; Test cases count updates; bad header name shows the refusal text.
- **Run and grade**
  1. Run all cases with check 'contains'.
  2. Open one result; set Grade 4 of 5; reload and open the run from Earlier runs.
  - Expected: Verdicts, diffs and the grade persist.
- **Frozen expectation**
  1. Start a run.
  2. Edit a case's expected output while it runs.
  3. Open the finished run.
  - Expected: Verdicts use the expectation at start.
- **Rollback**
  1. Load an old version and save it.
  - Expected: A new highest version with the old content and note 'Rolled back to version n'.
- **Migration state**
  1. On a fresh database without 0408, start a run.
  - Expected: Observe whether the run starts; record the result (not known today).
- **CLI argument**
  1. Create .agiworkforce/commands/audit.md with 'Audit $1 against $ARGUMENTS'.
  2. Run /audit src api in the CLI.
  - Expected: Body expands with the first word and all arguments.

**Where to look when it fails**

- Error messages 'Add at least one test case first.', 'Another save of this prompt just finished. Try again.'.
- Tables developer_eval_runs, developer_eval_results, developer_eval_run_cases.
- Gateway errors captured in the result's error column.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/105-developer-platform-and-console.md](../../70-qa/test-plans/web/105-developer-platform-and-console.md)
- Desktop: [70-qa/test-plans/desktop/105-developer-platform-and-console.md](../../70-qa/test-plans/desktop/105-developer-platform-and-console.md)
- CLI: [70-qa/test-plans/cli/105-developer-platform-and-console.md](../../70-qa/test-plans/cli/105-developer-platform-and-console.md)

## 10. Gaps and dependencies

- **Evaluation loop runs in the browser; tab close stops it.** Affects: Web and Desktop developers running large sets.. Evidence: PromptEvaluations.tsx:293-360.. Work needed: Server-side runner or resumable run.
- **Saved console prompts cannot be called by API, chat or CLI.** Affects: All developer surfaces.. Evidence: No invoking route or command found.. Work needed: Define an invoke path or document the limitation.
- **Brief status for versions, datasets, runs and results is missing while the web code exists.** Affects: Planning.. Evidence: doc: area brief S105.13 to S105.16; PromptsPanel.tsx and PromptEvaluations.tsx.. Work needed: Update the brief.
- **Migration 0408 marked not applied but required by code.** Affects: Run start and result recording in any environment lacking it.. Evidence: 0408 header lines 3-4; developer-prompt-service.ts:384-410.. Work needed: Confirm applied state per environment through the migration tool.
- **No prompt versions in the CLI and no cross-app template store.** Affects: CLI and Desktop.. Evidence: doc: area brief S105.13 cli missing.. Work needed: Decide a shared template owner.
- **Two template syntaxes: {{input}} on web custom commands, $ARGUMENTS in CLI.** Affects: Users moving between apps.. Evidence: CustomCommandsSettings.tsx:27; custom_commands.rs:104.. Work needed: Pick one or translate.

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- api:POST /api/llm/v1/chat/completions
- table:developer_prompts
- table:developer_prompt_versions
- table:developer_eval_cases
- table:developer_eval_runs
- table:developer_eval_results
- table:developer_eval_run_cases
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-data-model-and-migrations
- SYS-sync-and-continuity
- SYS-subscriptions-entitlements-and-usage
- F105-04

## Unknown

- Whether migration 0408 is applied in each environment (the file header says not applied; no record found).
- Whether the Electron Desktop shows the console card.
- How web custom commands are invoked in the chat slash menu (SlashCommandMenu not traced).
- Whether write routes also apply the developer-console-write limit (prompt-route helpers apply developer-console only in the code I read).
- Behaviour of the CLI with Local, own-key and Cloud modes for custom commands.
